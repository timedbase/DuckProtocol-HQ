import { encodeAbiParameters, encodePacked, maxUint160 } from "viem";
import { getPublicClient } from "./client.js";
import { simulateAndSend } from "./tx.js";
import { DUCK_TOKEN_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI, V4_QUOTER_ABI } from "./abis.js";
import { ZERO_ADDRESS } from "./addresses.js";

// Trading on a token's own Uniswap V4 pool -- a migrated curve token, every instant-launch token, and
// a successful crowdfund. Always a single hop, token <-> the pool's own quote asset, through the
// chain's Universal Router: V4_SWAP with SWAP_EXACT_IN_SINGLE / SETTLE_ALL / TAKE_ALL -- the same
// command and action ids DuckProtocol's lib/LaunchRouting.sol encodes on-chain.
//
// Every function takes the resolved CHAINS[slug] config (see chain/addresses.js) as `chain`.

const V4_SWAP_COMMAND = "0x10";
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

function isNative(currency) {
  return currency.toLowerCase() === ZERO_ADDRESS;
}

const POOL_KEY_COMPONENTS = [
  { type: "address", name: "currency0" },
  { type: "address", name: "currency1" },
  { type: "uint24", name: "fee" },
  { type: "int24", name: "tickSpacing" },
  { type: "address", name: "hooks" },
];

// Robinhood's router fork carries an extra uint256 minHopPriceX36 before hookData; Ink's doesn't.
// Encoding the wrong shape doesn't just fail -- it decodes as garbage amounts, so it's per-chain.
function exactInSingleParamsAbi(chain) {
  return [{
    type: "tuple",
    components: [
      { type: "tuple", name: "poolKey", components: POOL_KEY_COMPONENTS },
      { type: "bool", name: "zeroForOne" },
      { type: "uint128", name: "amountIn" },
      { type: "uint128", name: "amountOutMinimum" },
      ...(chain.SWAP_PARAMS_HAS_MIN_HOP_PRICE ? [{ type: "uint256", name: "minHopPriceX36" }] : []),
      { type: "bytes", name: "hookData" },
    ],
  }];
}

function buildPoolKey(chain, currencyA, currencyB, hook) {
  const [currency0, currency1] = BigInt(currencyA) < BigInt(currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
  return { currency0, currency1, fee: chain.V4_FEE_TIER, tickSpacing: chain.V4_TICK_SPACING, hooks: hook || chain.DUCK_HOOK };
}

function buildSingleHopInput(chain, { currencyIn, currencyOut, hook, amountIn, minOut }) {
  const poolKey = buildPoolKey(chain, currencyIn, currencyOut, hook);
  const zeroForOne = BigInt(currencyIn) < BigInt(currencyOut);
  const params = { poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" };
  if (chain.SWAP_PARAMS_HAS_MIN_HOP_PRICE) params.minHopPriceX36 = 0n; // no per-hop floor; minOut guards the trade
  const actions = encodePacked(["uint8", "uint8", "uint8"], [ACTION_SWAP_EXACT_IN_SINGLE, ACTION_SETTLE_ALL, ACTION_TAKE_ALL]);
  const swapParams = encodeAbiParameters(exactInSingleParamsAbi(chain), [params]);
  const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
  const takeParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minOut]);
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swapParams, settleParams, takeParams]]);
}

// ERC20 -> Permit2 approval, then Permit2 -> Universal Router allowance.
async function ensurePermit2Allowance(chain, { account, token, amount }) {
  const publicClient = getPublicClient(chain);
  const erc20Allowance = await publicClient.readContract({
    address: token, abi: DUCK_TOKEN_ABI, functionName: "allowance", args: [account, chain.PERMIT2],
  });
  if (erc20Allowance < amount) {
    await simulateAndSend(chain, { address: token, abi: DUCK_TOKEN_ABI, functionName: "approve", args: [chain.PERMIT2, maxUint160], account });
  }

  const [permit2Amount, expiration] = await publicClient.readContract({
    address: chain.PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [account, token, chain.UNIVERSAL_ROUTER],
  });
  const expired = expiration !== 0 && BigInt(expiration) < BigInt(Math.floor(Date.now() / 1000));
  if (permit2Amount < amount || expired) {
    const oneYear = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    await simulateAndSend(chain, {
      address: chain.PERMIT2, abi: PERMIT2_ABI, functionName: "approve",
      args: [token, chain.UNIVERSAL_ROUTER, maxUint160, oneYear], account,
    });
  }
}

async function executeRouterSwap(chain, { account, input, valueIn }) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  return simulateAndSend(chain, {
    address: chain.UNIVERSAL_ROUTER, abi: UNIVERSAL_ROUTER_ABI, functionName: "execute",
    args: [V4_SWAP_COMMAND, [input], deadline],
    value: valueIn,
    account,
  });
}

// Buys `token` paid directly in the pool's quote asset (native ETH as msg.value, or an ERC20 via
// Permit2).
export async function buyOnPoolDirect(chain, { account, token, hook, quoteAsset, amountIn, minOut = 0n }) {
  if (!isNative(quoteAsset)) await ensurePermit2Allowance(chain, { account, token: quoteAsset, amount: amountIn });
  const input = buildSingleHopInput(chain, { currencyIn: quoteAsset, currencyOut: token, hook, amountIn, minOut });
  return executeRouterSwap(chain, { account, input, valueIn: isNative(quoteAsset) ? amountIn : 0n });
}

// Sells `token`, proceeds landing directly in the pool's quote asset.
export async function sellOnPoolDirect(chain, { account, token, hook, quoteAsset, amountIn, minOut = 0n }) {
  await ensurePermit2Allowance(chain, { account, token, amount: amountIn });
  const input = buildSingleHopInput(chain, { currencyIn: token, currencyOut: quoteAsset, hook, amountIn, minOut });
  return executeRouterSwap(chain, { account, input, valueIn: 0n });
}

// Read-only preview via the chain's V4Quoter -- nonpayable (it reverts internally to return the
// simulated result), but safe as a plain eth_call. Approximate: always apply slippage on top.
async function quoteSingleHop(chain, { tokenIn, tokenOut, hook, amountIn }) {
  const poolKey = buildPoolKey(chain, tokenIn, tokenOut, hook);
  const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);
  const [amountOut] = await getPublicClient(chain).readContract({
    address: chain.V4_QUOTER, abi: V4_QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  });
  return amountOut;
}

export async function previewBuyDirect(chain, { token, hook, quoteAsset, amountIn }) {
  try {
    return await quoteSingleHop(chain, { tokenIn: quoteAsset, tokenOut: token, hook, amountIn });
  } catch {
    return 0n;
  }
}

export async function previewSellDirect(chain, { token, hook, quoteAsset, amountIn }) {
  try {
    return await quoteSingleHop(chain, { tokenIn: token, tokenOut: quoteAsset, hook, amountIn });
  } catch {
    return 0n;
  }
}
