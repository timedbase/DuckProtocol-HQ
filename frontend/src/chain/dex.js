import { encodeAbiParameters, encodePacked, maxUint160 } from "viem";
import { getPublicClient } from "./client.js";
import { simulateAndSend } from "./tx.js";
import { DUCK_TOKEN_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI, V4_QUOTER_ABI } from "./abis.js";
import { ZERO_ADDRESS } from "./addresses.js";

// Trading on a token's REAL, live Uniswap V4 pool -- applies once a CURVE
// token has migrated, or always for INSTANT tokens. Verified directly
// against Ink's real deployed UniversalRouter source (Commands.sol,
// Actions.sol, IV4Router.sol, PathKey.sol, BaseActionsRouter.sol,
// V4Router.sol, DeltaResolver.sol, CalldataDecoder.sol) before writing a
// single line here -- real funds move through this, no guessed encoding.
//
// Every function here takes the resolved CHAINS[slug] config (see
// chain/addresses.js) as its first `chain` param. Arc's UNIVERSAL_ROUTER/
// V4_QUOTER are null (unconfirmed -- Uniswap's own v4 deployment docs don't
// list Arc at all) -- every function checks and throws a clear "not
// available on this chain yet" instead of calling with a null address.
//
// Our own pools are always token<->quoteAsset directly (single-hop). A
// buyer/seller who only holds native currency but the pool's quote asset is
// an ERC20 needs a second hop first -- native<->quoteAsset on a REAL
// external pool. Only Ink has one (see addresses.js's NATIVE_EXTERNAL_ROUTE)
// -- any other ERC20 quote asset, or any quote asset at all on a chain with
// no external route, has genuinely nowhere to source it from, so this
// throws a clear error rather than a router revert with no explanation.

const V4_SWAP_COMMAND = "0x10"; // Commands.V4_SWAP
const ACTION_SWAP_EXACT_IN_SINGLE = 0x06;
const ACTION_SWAP_EXACT_IN = 0x07;
const ACTION_SETTLE_ALL = 0x0c;
const ACTION_TAKE_ALL = 0x0f;

function isNative(currency) {
  return currency.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

// null if there's no known external liquidity to route native currency into
// this quote asset -- callers must fall back to requiring the asset be held
// directly.
function externalRouteFor(chain, quoteAsset, quoteSymbol) {
  if (isNative(quoteAsset)) return null; // no second hop needed at all
  if (!chain.NATIVE_EXTERNAL_ROUTE) return null; // this chain has no external bridge at all
  if (!chain.LIQUID_QUOTE_TOKEN_SYMBOLS.includes(quoteSymbol)) return null;
  return chain.NATIVE_EXTERNAL_ROUTE;
}

function requireRouterAndQuoter(chain) {
  if (!chain.UNIVERSAL_ROUTER || !chain.V4_QUOTER) {
    throw new Error(`Pool trading isn't available on ${chain.name} yet (Universal Router / V4 Quoter unconfirmed on this chain).`);
  }
}

const PATH_KEY_ABI_COMPONENTS = [
  { type: "address", name: "intermediateCurrency" },
  { type: "uint24", name: "fee" },
  { type: "int24", name: "tickSpacing" },
  { type: "address", name: "hooks" },
  { type: "bytes", name: "hookData" },
];

const EXACT_IN_SINGLE_PARAMS_ABI = [
  {
    type: "tuple",
    components: [
      {
        type: "tuple", name: "poolKey", components: [
          { type: "address", name: "currency0" },
          { type: "address", name: "currency1" },
          { type: "uint24", name: "fee" },
          { type: "int24", name: "tickSpacing" },
          { type: "address", name: "hooks" },
        ],
      },
      { type: "bool", name: "zeroForOne" },
      { type: "uint128", name: "amountIn" },
      { type: "uint128", name: "amountOutMinimum" },
      { type: "bytes", name: "hookData" },
    ],
  },
];

const EXACT_IN_PARAMS_ABI = [
  {
    type: "tuple",
    components: [
      { type: "address", name: "currencyIn" },
      { type: "tuple[]", name: "path", components: PATH_KEY_ABI_COMPONENTS },
      { type: "uint128", name: "amountIn" },
      { type: "uint128", name: "amountOutMinimum" },
    ],
  },
];

function buildPoolKey(chain, currencyA, currencyB, hook) {
  const [currency0, currency1] = BigInt(currencyA) < BigInt(currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
  return { currency0, currency1, fee: chain.V4_FEE_TIER, tickSpacing: chain.V4_TICK_SPACING, hooks: hook };
}

function actionsAndTail(...actions) {
  return encodePacked(actions.map(() => "uint8"), actions);
}

// hops: [{ intermediateCurrency, fee, tickSpacing, hooks }, ...] -- the
// currency arrived at after each hop, starting from `currencyIn`.
function buildSwapInput({ currencyIn, currencyOut, amountIn, minOut, singleHop }) {
  const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
  const takeParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minOut]);

  if (singleHop) {
    const { poolKey, zeroForOne } = singleHop;
    const actions = actionsAndTail(ACTION_SWAP_EXACT_IN_SINGLE, ACTION_SETTLE_ALL, ACTION_TAKE_ALL);
    const swapParams = encodeAbiParameters(EXACT_IN_SINGLE_PARAMS_ABI, [
      { poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: "0x" },
    ]);
    return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swapParams, settleParams, takeParams]]);
  }

  return null; // multi-hop built by buildMultiHopSwapInput below
}

function buildMultiHopSwapInput({ currencyIn, path, amountIn, minOut }) {
  const currencyOut = path[path.length - 1].intermediateCurrency;
  const actions = actionsAndTail(ACTION_SWAP_EXACT_IN, ACTION_SETTLE_ALL, ACTION_TAKE_ALL);
  const swapParams = encodeAbiParameters(EXACT_IN_PARAMS_ABI, [
    { currencyIn, path: path.map((p) => ({ ...p, hookData: "0x" })), amountIn, amountOutMinimum: minOut },
  ]);
  const settleParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]);
  const takeParams = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minOut]);
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swapParams, settleParams, takeParams]]);
}

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

// Buys `token` on its live V4 pool, paid directly in the pool's own quote
// asset (native or ERC20) -- a single-hop swap, no native<->quoteAsset
// conversion leg. This is the primary, always-available path: it needs no
// externally-sourced route the way buyOnPoolWithNative's non-native branch
// does, which matters on a chain like Robinhood with no configured
// NATIVE_EXTERNAL_ROUTE at all -- every pool here that isn't itself
// native-quoted has no working "pay with native" path today, only this one.
export async function buyOnPoolDirect(chain, { account, token, hook, quoteAsset, amountIn, minOut = 0n }) {
  requireRouterAndQuoter(chain);
  if (!isNative(quoteAsset)) await ensurePermit2Allowance(chain, { account, token: quoteAsset, amount: amountIn });
  const poolKey = buildPoolKey(chain, token, quoteAsset, hook);
  const zeroForOne = BigInt(quoteAsset) < BigInt(token);
  const input = buildSwapInput({
    currencyIn: quoteAsset, currencyOut: token, amountIn, minOut,
    singleHop: { poolKey, zeroForOne },
  });
  return executeRouterSwap(chain, { account, input, valueIn: isNative(quoteAsset) ? amountIn : 0n });
}

// Sells `token` on its live V4 pool, proceeds landing directly in the
// pool's own quote asset -- same direct single-hop swap, reversed. Primary
// sell path for the same reason buyOnPoolDirect is: no external route
// dependency at all.
export async function sellOnPoolDirect(chain, { account, token, hook, quoteAsset, amountIn, minOut = 0n }) {
  requireRouterAndQuoter(chain);
  await ensurePermit2Allowance(chain, { account, token, amount: amountIn });
  const poolKey = buildPoolKey(chain, token, quoteAsset, hook);
  const zeroForOne = BigInt(token) < BigInt(quoteAsset);
  const input = buildSwapInput({
    currencyIn: token, currencyOut: quoteAsset, amountIn, minOut,
    singleHop: { poolKey, zeroForOne },
  });
  return executeRouterSwap(chain, { account, input, valueIn: 0n });
}

export async function previewBuyDirect(chain, { token, hook, quoteAsset, amountIn }) {
  if (!chain.V4_QUOTER) return 0n;
  try {
    return await quoteSingleHop(chain, { tokenIn: quoteAsset, tokenOut: token, hook, amountIn });
  } catch {
    return 0n;
  }
}

export async function previewSellDirect(chain, { token, hook, quoteAsset, amountIn }) {
  if (!chain.V4_QUOTER) return 0n;
  try {
    return await quoteSingleHop(chain, { tokenIn: token, tokenOut: quoteAsset, hook, amountIn });
  } catch {
    return 0n;
  }
}

// Buys `token` on its live V4 pool, paid in native currency. If the pool's
// quote asset isn't native, routes native -> quoteAsset -> token in one call
// when a real external route is known (Ink's USDC/USDT0 today); otherwise
// throws, since there is nowhere to source the quote asset from. Kept for
// chains that DO have a configured external route (see hasNativeRoute) --
// buyOnPoolDirect above is the one the trade panel uses by default now.
export async function buyOnPoolWithNative(chain, { account, token, hook, quoteAsset, quoteSymbol, amountInWei, minOut = 0n }) {
  requireRouterAndQuoter(chain);
  if (isNative(quoteAsset)) {
    const poolKey = buildPoolKey(chain, token, ZERO_ADDRESS, hook);
    const zeroForOne = true; // address(0) is always numerically smallest
    const input = buildSwapInput({
      currencyIn: ZERO_ADDRESS, currencyOut: token, amountIn: amountInWei, minOut,
      singleHop: { poolKey, zeroForOne },
    });
    return executeRouterSwap(chain, { account, input, valueIn: amountInWei });
  }

  const route = externalRouteFor(chain, quoteAsset, quoteSymbol);
  if (!route) {
    throw new Error(`No ${chain.nativeSymbol} route available for this token's quote asset (${quoteSymbol || quoteAsset}) -- you'd need to already hold it to trade this pool.`);
  }
  const path = [
    { intermediateCurrency: quoteAsset, fee: route.fee, tickSpacing: route.tickSpacing, hooks: route.hook },
    { intermediateCurrency: token, fee: chain.V4_FEE_TIER, tickSpacing: chain.V4_TICK_SPACING, hooks: hook },
  ];
  const input = buildMultiHopSwapInput({ currencyIn: ZERO_ADDRESS, path, amountIn: amountInWei, minOut });
  return executeRouterSwap(chain, { account, input, valueIn: amountInWei });
}

// Sells `token` on its live V4 pool, proceeds landing as native currency.
// Same routing logic as buyOnPoolWithNative, reversed.
export async function sellOnPoolForNative(chain, { account, token, hook, quoteAsset, quoteSymbol, amountIn, minOut = 0n }) {
  requireRouterAndQuoter(chain);
  await ensurePermit2Allowance(chain, { account, token, amount: amountIn });

  if (isNative(quoteAsset)) {
    const poolKey = buildPoolKey(chain, token, ZERO_ADDRESS, hook);
    const zeroForOne = false; // token is never address(0), so token is always currency1 here
    const input = buildSwapInput({
      currencyIn: token, currencyOut: ZERO_ADDRESS, amountIn, minOut,
      singleHop: { poolKey, zeroForOne },
    });
    return executeRouterSwap(chain, { account, input, valueIn: 0n });
  }

  const route = externalRouteFor(chain, quoteAsset, quoteSymbol);
  if (!route) {
    throw new Error(`No ${chain.nativeSymbol} route available for this token's quote asset (${quoteSymbol || quoteAsset}) -- proceeds would need to stay in that asset.`);
  }
  const path = [
    { intermediateCurrency: quoteAsset, fee: chain.V4_FEE_TIER, tickSpacing: chain.V4_TICK_SPACING, hooks: hook },
    { intermediateCurrency: ZERO_ADDRESS, fee: route.fee, tickSpacing: route.tickSpacing, hooks: route.hook },
  ];
  const input = buildMultiHopSwapInput({ currencyIn: token, path, amountIn, minOut });
  return executeRouterSwap(chain, { account, input, valueIn: 0n });
}

// Read-only preview via the chain's real deployed V4Quoter -- technically a
// `nonpayable` function (it reverts internally to capture the simulated
// result, a standard V4 quoter pattern), but safe and correct to call via
// a plain eth_call / readContract since it's never actually broadcast.
async function quoteSingleHop(chain, { tokenIn, tokenOut, hook, amountIn }) {
  const poolKey = buildPoolKey(chain, tokenIn, tokenOut, hook);
  const zeroForOne = BigInt(tokenIn) < BigInt(tokenOut);
  const [amountOut] = await getPublicClient(chain).readContract({
    address: chain.V4_QUOTER, abi: V4_QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  });
  return amountOut;
}

export async function previewBuyWithNative(chain, { token, hook, quoteAsset, quoteSymbol, amountInWei }) {
  if (!chain.V4_QUOTER) return 0n;
  try {
    if (isNative(quoteAsset)) {
      return await quoteSingleHop(chain, { tokenIn: ZERO_ADDRESS, tokenOut: token, hook, amountIn: amountInWei });
    }
    const route = externalRouteFor(chain, quoteAsset, quoteSymbol);
    if (!route) return 0n;
    const quoteOut = await quoteSingleHop(chain, { tokenIn: ZERO_ADDRESS, tokenOut: quoteAsset, hook: route.hook, amountIn: amountInWei });
    return await quoteSingleHop(chain, { tokenIn: quoteAsset, tokenOut: token, hook, amountIn: quoteOut });
  } catch {
    return 0n;
  }
}

export async function previewSellForNative(chain, { token, hook, quoteAsset, quoteSymbol, amountIn }) {
  if (!chain.V4_QUOTER) return 0n;
  try {
    if (isNative(quoteAsset)) {
      return await quoteSingleHop(chain, { tokenIn: token, tokenOut: ZERO_ADDRESS, hook, amountIn });
    }
    const route = externalRouteFor(chain, quoteAsset, quoteSymbol);
    if (!route) return 0n;
    const quoteOut = await quoteSingleHop(chain, { tokenIn: token, tokenOut: quoteAsset, hook, amountIn });
    return await quoteSingleHop(chain, { tokenIn: quoteAsset, tokenOut: ZERO_ADDRESS, hook: route.hook, amountIn: quoteOut });
  } catch {
    return 0n;
  }
}

export function hasNativeRoute(chain, quoteAsset, quoteSymbol) {
  return isNative(quoteAsset) || externalRouteFor(chain, quoteAsset, quoteSymbol) !== null;
}

// Just the native -> quoteAsset hop (the same external venue used above),
// with no second hop onto any platform pool -- used to preview/execute
// buying an ERC20-quoted bonding-curve token with native currency (see
// actions.js's buyCurveWithNative), where the "pool" for the second leg is
// the curve contract itself, not a V4 pool.
export async function previewNativeToQuote(chain, { quoteAsset, quoteSymbol, amountInWei }) {
  if (isNative(quoteAsset)) return amountInWei;
  if (!chain.V4_QUOTER) return 0n;
  const route = externalRouteFor(chain, quoteAsset, quoteSymbol);
  if (!route) return 0n;
  try {
    return await quoteSingleHop(chain, { tokenIn: ZERO_ADDRESS, tokenOut: quoteAsset, hook: route.hook, amountIn: amountInWei });
  } catch {
    return 0n;
  }
}
