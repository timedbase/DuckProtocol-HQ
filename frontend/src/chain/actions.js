import { getPublicClient } from "./client.js";
import { mineVanitySalt } from "./vanity.js";
import { simulateAndSend, simulateAndSendWithResult } from "./tx.js";
import {
  DUCK_BONDING_CURVE_ABI, DUCK_LAUNCHER_ABI, DUCK_CROWDFUND_ABI, DUCK_HOOK_ABI, DUCK_TOKEN_ABI,
  DUCK_VAULT_ABI, DUCK_TOKEN_GOVERNOR_ABI,
} from "./abis.js";
import { keccak256, toBytes } from "viem";
import { ZERO_ADDRESS } from "./addresses.js";

// Every function here takes the resolved CHAINS[slug] config (see chain/addresses.js) as its first
// `chain` param, resolved once by the caller from the app's selected chain -- same pattern as
// chain/dex.js and chain/quotes.js.

export async function waitForTx(chain, hash) {
  return getPublicClient(chain).waitForTransactionReceipt({ hash });
}

// Each family's platformToken() is independently owner-settable and starts unset. Fetched live
// since it can change and has no event to index. Returns null per family when unset.
export async function getPlatformTokens(chain) {
  const publicClient = getPublicClient(chain);
  const [incubation, launcher, raise] = await publicClient.multicall({
    contracts: [
      { address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "platformToken" },
      { address: chain.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "platformToken" },
      { address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "platformToken" },
    ],
    allowFailure: true,
  });
  const clean = (r) => (r.status === "success" && r.result !== ZERO_ADDRESS ? r.result : null);
  const tokens = { incubation: clean(incubation), launcher: clean(launcher), raise: clean(raise) };

  const addresses = [...new Set(Object.values(tokens).filter(Boolean))];
  if (addresses.length === 0) return { incubation: null, launcher: null, raise: null };

  const metaResults = await publicClient.multicall({
    contracts: addresses.flatMap((address) => [
      { address, abi: DUCK_TOKEN_ABI, functionName: "symbol" },
      { address, abi: DUCK_TOKEN_ABI, functionName: "decimals" },
    ]),
    allowFailure: true,
  });
  const metaByAddress = {};
  addresses.forEach((address, i) => {
    const symbolResult = metaResults[i * 2];
    const decimalsResult = metaResults[i * 2 + 1];
    metaByAddress[address.toLowerCase()] = {
      symbol: symbolResult.status === "success" ? symbolResult.result : "???",
      decimals: decimalsResult.status === "success" ? decimalsResult.result : 18,
    };
  });

  const withMeta = (address) => (address ? { address, ...metaByAddress[address.toLowerCase()] } : null);
  return { incubation: withMeta(tokens.incubation), launcher: withMeta(tokens.launcher), raise: withMeta(tokens.raise) };
}

// Fee settings shared by all three create calls:
//   hookFeeBps -- the pool's trading fee, one of 200/400/600/800/1000 (0 = the hook's 2% default);
//   creatorBps + vaultBps + burnBps -- how the creator's share of that fee is divided (creator wallet
//   / this token's lending vault / buy-and-burn), summing to 10000. Fixed at creation.

// ---------- DuckBondingCurve ----------

export async function getCurveCreationFee(chain) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "creationFee" });
}

// quoteToken = ZERO_ADDRESS for native ETH, or an allowed ERC20.
// buyAmountWei: native-quoted only -- value sent above the creation fee is swept into an immediate
// buy in the same transaction.
// earlyBuyAmount: ERC20-quoted only -- pulled via transferFrom in the same call, so the token is
// approved to the curve first.
// supplyTier: index 0-6 into SUPPLY_TIERS.
export async function createCurveToken(chain, {
  account, name, symbol, supplyTier = 0, curveBps, liquidityBps, quoteToken = ZERO_ADDRESS,
  startVirtualQuote, migrationTargetQuote, hookFeeBps = 0n, creatorBps = 10000, vaultBps = 0, burnBps = 0,
  metaURI, buyAmountWei = 0n, earlyBuyAmount = 0n, dryRun = false,
}) {
  const { userSalt } = mineVanitySalt({ deployer: chain.DUCK_BONDING_CURVE, impl: chain.DUCK_TOKEN_IMPL, caller: account });
  const fee = await getCurveCreationFee(chain);
  const isNativeQuoted = quoteToken.toLowerCase() === ZERO_ADDRESS;

  // A dry run never sends a transaction -- including the approve() an ERC20 early buy needs.
  if (!dryRun && !isNativeQuoted && earlyBuyAmount > 0n) {
    await approveToken(chain, { account, token: quoteToken, spender: chain.DUCK_BONDING_CURVE, amount: earlyBuyAmount });
  }

  const { hash, result: tokenAddress } = await simulateAndSendWithResult(chain, {
    address: chain.DUCK_BONDING_CURVE,
    abi: DUCK_BONDING_CURVE_ABI,
    functionName: "createToken",
    args: [{
      name, symbol, supplyTier, curveBps, liquidityBps, quoteToken,
      startVirtualQuote, migrationTargetQuote,
      earlyBuyAmount: isNativeQuoted ? 0n : earlyBuyAmount,
      hookFeeBps, creatorBps, vaultBps, burnBps,
      metaURI: metaURI || "", salt: userSalt,
    }],
    value: isNativeQuoted ? fee + buyAmountWei : fee,
    account,
    dryRun,
  });
  return { hash, tokenAddress };
}

export async function buyCurve(chain, { account, token, quoteToken = ZERO_ADDRESS, amountIn, minOut = 0n, deadlineSeconds = 1800 }) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  const isNativeQuoted = quoteToken.toLowerCase() === ZERO_ADDRESS;

  if (!isNativeQuoted) {
    await ensureAllowance(chain, { account, token: quoteToken, spender: chain.DUCK_BONDING_CURVE, amount: amountIn });
  }

  return simulateAndSend(chain, {
    address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "buy",
    args: [token, isNativeQuoted ? 0n : amountIn, minOut, deadline],
    value: isNativeQuoted ? amountIn : 0n,
    account,
  });
}

// Buys an ERC20-quoted curve token with native ETH: the value is routed into the quote asset through
// the curve's configured routes (RouteTables.sol) first, then bought.
export async function buyCurveWithNative(chain, { account, token, amountInWei, minQuoteOut = 0n, minOut = 0n, deadlineSeconds = 1800 }) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  return simulateAndSend(chain, {
    address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "buyWithNative",
    args: [token, minQuoteOut, minOut, deadline], value: amountInWei, account,
  });
}

export async function sellCurve(chain, { account, token, amountIn, minQuoteOut = 0n, deadlineSeconds = 1800 }) {
  await ensureAllowance(chain, { account, token, spender: chain.DUCK_BONDING_CURVE, amount: amountIn });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  return simulateAndSend(chain, {
    address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "sell",
    args: [token, amountIn, minQuoteOut, deadline], account,
  });
}

export async function claimCurveFee(chain, { account, token }) {
  return simulateAndSend(chain, { address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "claimCurveFee", args: [token], account });
}

export async function getCurveTokenConfig(chain, token) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "getTokenConfig", args: [token] });
}

export async function isQuoteTokenAllowed(chain, token) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "quoteTokenAllowed", args: [token] });
}

// ---------- DuckLauncher ----------

export async function getLaunchFee(chain) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "launchFee" });
}

// launchMarketCap: the virtual FDV the pool is seeded at, in the quote token's raw units.
// quoteAmountWei: optional same-tx instant buy in native ETH, routed into the quote asset first if it
// isn't native (only works for quote tokens with configured routes).
// quoteToken can be any address -- launch() has no allow-list check.
export async function launchInstant(chain, {
  account, name, symbol, metaURI, quoteToken = ZERO_ADDRESS, supplyTier = 0, launchMarketCap,
  minQuoteOut = 0n, minTokensOut = 0n, hookFeeBps = 0n, creatorBps = 10000, vaultBps = 0, burnBps = 0,
  revertOnInstantBuyFailure = false, quoteAmountWei = 0n, dryRun = false,
}) {
  const { userSalt } = mineVanitySalt({ deployer: chain.DUCK_LAUNCHER, impl: chain.DUCK_TOKEN_IMPL, caller: account });
  const fee = await getLaunchFee(chain);
  const { hash, result } = await simulateAndSendWithResult(chain, {
    address: chain.DUCK_LAUNCHER,
    abi: DUCK_LAUNCHER_ABI,
    functionName: "launch",
    args: [{
      name, symbol, metaURI: metaURI || "", feeWallet: account, positionManager: chain.V4_POSITION_MANAGER,
      quoteToken, vanitySalt: userSalt, supplyTier, launchMarketCap, minQuoteOut, minTokensOut,
      hookFeeBps, creatorBps, vaultBps, burnBps, revertOnInstantBuyFailure,
    }],
    value: fee + quoteAmountWei,
    account,
    dryRun,
  });
  return { hash, tokenAddress: result?.[0], poolId: result?.[1] };
}

export async function isLauncherQuoteTokenAllowed(chain, token) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "quoteTokens", args: [token] });
}

// ---------- DuckCrowdfund ----------

export async function getCampaignFee(chain) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "campaignFee" });
}

// Global, owner-configured -- shown read-only on the create form.
export async function getRaiseDefaults(chain) {
  const [duration, contributorBps, lpBps, campaignFee] = await getPublicClient(chain).multicall({
    contracts: ["campaignDuration", "contributorBps", "lpBps", "campaignFee"].map((functionName) => ({
      address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName,
    })),
    allowFailure: false,
  });
  return { duration, contributorBps, lpBps, campaignFee };
}

// goalWei: the soft floor, in dexQuoteAsset's raw units. Contributions land directly in that asset
// and are never swapped, so goal and asset are chosen together.
export async function createCampaign(chain, {
  account, name, symbol, metaURI, dexQuoteAsset = ZERO_ADDRESS, goalWei, startTimeSeconds,
  hookFeeBps = 0n, creatorBps = 10000, vaultBps = 0, burnBps = 0, supplyTier = 0, dryRun = false,
}) {
  const { userSalt } = mineVanitySalt({ deployer: chain.DUCK_CROWDFUND, impl: chain.DUCK_TOKEN_IMPL, caller: account });
  const fee = await getCampaignFee(chain);
  const startTime = BigInt(startTimeSeconds ?? Math.floor(Date.now() / 1000));
  const { hash, result } = await simulateAndSendWithResult(chain, {
    address: chain.DUCK_CROWDFUND,
    abi: DUCK_CROWDFUND_ABI,
    functionName: "launch",
    args: [name, symbol, metaURI || "", dexQuoteAsset, goalWei, startTime, userSalt, hookFeeBps, creatorBps, vaultBps, burnBps, supplyTier],
    value: fee,
    account,
    dryRun,
  });
  return { hash, campaignId: result?.[0], tokenAddress: result?.[1] };
}

// Native campaigns take msg.value; ERC20 campaigns pull via transferFrom after an allowance.
export async function contributeCampaign(chain, { account, campaignId, amount, dexQuoteAsset = ZERO_ADDRESS }) {
  const isNativeQuoted = dexQuoteAsset.toLowerCase() === ZERO_ADDRESS;
  if (!isNativeQuoted) {
    await ensureAllowance(chain, { account, token: dexQuoteAsset, spender: chain.DUCK_CROWDFUND, amount });
  }
  return simulateAndSend(chain, {
    address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "contribute",
    args: [campaignId, isNativeQuoted ? 0n : amount],
    value: isNativeQuoted ? amount : 0n,
    account,
  });
}

export async function claimCampaign(chain, { account, campaignId }) {
  return simulateAndSend(chain, { address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "claim", args: [campaignId], account });
}

export async function claimCampaignRefund(chain, { account, campaignId }) {
  return simulateAndSend(chain, { address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "claimRefund", args: [campaignId], account });
}

export async function finalizeCampaign(chain, { account, campaignId }) {
  return simulateAndSend(chain, { address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "finalize", args: [campaignId], account });
}

// `campaigns` is private on-chain; its data is split across two getters.
export async function getCampaign(chain, campaignId) {
  const [core, meta] = await getPublicClient(chain).multicall({
    contracts: ["getCampaignCore", "getCampaignMeta"].map((functionName) => ({
      address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName, args: [campaignId],
    })),
    allowFailure: false,
  });
  const [creator, dexQuoteAsset, goal, startTime, deadline, totalRaised, finalized, succeeded, token] = core;
  const [name, symbol, metaURI, vanitySalt, contributorBps, lpBps, hookFeeBps, vaultBps, totalSupply] = meta;
  return { creator, dexQuoteAsset, goal, startTime, deadline, totalRaised, finalized, succeeded, token, name, symbol, metaURI, vanitySalt, contributorBps, lpBps, hookFeeBps, vaultBps, totalSupply };
}

export async function isRaiseQuoteAssetAllowed(chain, token) {
  return getPublicClient(chain).readContract({ address: chain.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "quoteAssetAllowed", args: [token] });
}

// ---------- DuckHookV4 (trading fee, fee claims, CTO) ----------
//
// Every call takes the pool's OWN hook (coin.hook, indexed per token) -- a pool's hook is fixed in
// its PoolKey forever. `hook` defaults to the chain's current hook only as a fallback.

// pools(poolId) -> [token, quoteCurrency, tokenIsCurrency0, creator, launchTimestamp, registered,
// hookFeeBps, creatorBps, vaultBps, burnBps]
export async function getPool(chain, poolId, hook = chain.DUCK_HOOK) {
  return getPublicClient(chain).readContract({ address: hook, abi: DUCK_HOOK_ABI, functionName: "pools", args: [poolId] });
}

export async function getCtoFee(chain, hook = chain.DUCK_HOOK) {
  return getPublicClient(chain).readContract({ address: hook, abi: DUCK_HOOK_ABI, functionName: "ctoFee" });
}

export async function getHookAccruedFees(chain, poolId, hook = chain.DUCK_HOOK) {
  return getPublicClient(chain).readContract({ address: hook, abi: DUCK_HOOK_ABI, functionName: "accruedFees", args: [poolId] });
}

// -> [applicant, newCreator, paid]
export async function getCtoApplication(chain, poolId, hook = chain.DUCK_HOOK) {
  return getPublicClient(chain).readContract({ address: hook, abi: DUCK_HOOK_ABI, functionName: "ctoApplications", args: [poolId] });
}

export async function applyForCTO(chain, { account, poolId, newCreator, hook = chain.DUCK_HOOK }) {
  const fee = await getCtoFee(chain, hook);
  return simulateAndSend(chain, {
    address: hook, abi: DUCK_HOOK_ABI, functionName: "applyForCTO", args: [poolId, newCreator], value: fee, account,
  });
}

// Permissionless. Pays out the pool's accrued fee: 25% platform (24% when someone other than the
// creator calls it, who receives the remaining 1%), 5% into the token's holder-reward round, and the
// rest split creator / vault / buy-and-burn.
export async function claimHookFees(chain, { account, poolId, hook = chain.DUCK_HOOK }) {
  return simulateAndSend(chain, { address: hook, abi: DUCK_HOOK_ABI, functionName: "claimFees", args: [poolId], account });
}

// splits: [{ wallet, bps }, ...] summing to 10000, or empty to pay the creator directly.
export async function setHookFeeSplits(chain, { account, poolId, splits, hook = chain.DUCK_HOOK }) {
  return simulateAndSend(chain, { address: hook, abi: DUCK_HOOK_ABI, functionName: "setFeeSplits", args: [poolId, splits], account });
}

export async function getHookFeeSplits(chain, poolId, hook = chain.DUCK_HOOK) {
  return getPublicClient(chain).readContract({ address: hook, abi: DUCK_HOOK_ABI, functionName: "getFeeSplits", args: [poolId] });
}

// ---------- ERC20 ----------

export async function ensureAllowance(chain, { account, token, spender, amount }) {
  const allowance = await getPublicClient(chain).readContract({
    address: token, abi: DUCK_TOKEN_ABI, functionName: "allowance", args: [account, spender],
  });
  if (allowance < amount) {
    await approveToken(chain, { account, token, spender, amount });
  }
}

export async function approveToken(chain, { account, token, spender, amount }) {
  return simulateAndSend(chain, { address: token, abi: DUCK_TOKEN_ABI, functionName: "approve", args: [spender, amount], account });
}

export async function getTokenBalance(chain, token, account) {
  return getPublicClient(chain).readContract({ address: token, abi: DUCK_TOKEN_ABI, functionName: "balanceOf", args: [account] });
}

export async function getNativeBalance(chain, account) {
  return getPublicClient(chain).getBalance({ address: account });
}

// ---------- DuckVault (per-token lending market) ----------
// Amounts are already in raw units (the vault currency's decimals for borrow/repay, the launched
// token's 18 for collateral); LendingTab.jsx does the conversion. The vault currency is always an
// ERC20 (WETH for a native-quoted pool), so repay/addCollateral always approve and pull.

export async function borrowFromVault(chain, { account, vault, amount }) {
  return simulateAndSend(chain, { address: vault, abi: DUCK_VAULT_ABI, functionName: "borrow", args: [amount], account });
}

export async function repayVault(chain, { account, vault, currency, amount }) {
  await ensureAllowance(chain, { account, token: currency, spender: vault, amount });
  return simulateAndSend(chain, { address: vault, abi: DUCK_VAULT_ABI, functionName: "repay", args: [amount], account });
}

export async function addVaultCollateral(chain, { account, vault, token, amount }) {
  await ensureAllowance(chain, { account, token, spender: vault, amount });
  return simulateAndSend(chain, { address: vault, abi: DUCK_VAULT_ABI, functionName: "addCollateral", args: [amount], account });
}

export async function withdrawVaultCollateral(chain, { account, vault, amount }) {
  return simulateAndSend(chain, { address: vault, abi: DUCK_VAULT_ABI, functionName: "withdrawCollateral", args: [amount], account });
}

export async function getVaultHealthFactor(chain, vault, borrower) {
  return getPublicClient(chain).readContract({ address: vault, abi: DUCK_VAULT_ABI, functionName: "healthFactorBps", args: [borrower] });
}

// ---------- DuckTokenGovernor (per-token, cloned on first proposal) ----------
// support: 0 = Against, 1 = For, 2 = Abstain.

export async function castVote(chain, { account, governor, proposalId, support }) {
  return simulateAndSend(chain, { address: governor, abi: DUCK_TOKEN_GOVERNOR_ABI, functionName: "castVote", args: [BigInt(proposalId), support], account });
}

export async function castVoteWithReason(chain, { account, governor, proposalId, support, reason }) {
  return simulateAndSend(chain, { address: governor, abi: DUCK_TOKEN_GOVERNOR_ABI, functionName: "castVoteWithReason", args: [BigInt(proposalId), support, reason || ""], account });
}

// targets/values/calldatas come straight from the indexed Proposal; descriptionHash must be
// keccak256 of the exact description propose() hashed or execute() reverts.
export async function executeProposal(chain, { account, governor, targets, values, calldatas, description }) {
  const descriptionHash = keccak256(toBytes(description || ""));
  return simulateAndSend(chain, {
    address: governor, abi: DUCK_TOKEN_GOVERNOR_ABI, functionName: "execute",
    args: [targets, values.map((v) => BigInt(v)), calldatas, descriptionHash], account,
  });
}
