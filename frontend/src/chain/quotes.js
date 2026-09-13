import { getPublicClient } from "./client.js";
import { DUCK_BONDING_CURVE_VIEWS_ABI } from "./abis.js";
import { previewBuyDirect, previewSellDirect } from "./dex.js";

// Pre-migration bonding-curve preview -- exact, since these are the same view functions buy()/sell()
// price against. They live on DuckBondingCurveViews, not DuckBondingCurve itself.
export async function previewCurveBuy(chain, token, quoteIn) {
  const [tokensOut] = await getPublicClient(chain).readContract({
    address: chain.DUCK_BONDING_CURVE_VIEWS, abi: DUCK_BONDING_CURVE_VIEWS_ABI, functionName: "getAmountOut", args: [token, quoteIn],
  });
  return tokensOut;
}

export async function previewCurveSell(chain, token, amountIn) {
  const [quoteOut] = await getPublicClient(chain).readContract({
    address: chain.DUCK_BONDING_CURVE_VIEWS, abi: DUCK_BONDING_CURVE_VIEWS_ABI, functionName: "getAmountOutSell", args: [token, amountIn],
  });
  return quoteOut;
}

// Post-migration / instant-launch / crowdfund-pool preview, paid and received in the pool's own quote
// asset via the chain's V4Quoter.
export const previewPoolBuyDirect = previewBuyDirect;
export const previewPoolSellDirect = previewSellDirect;

// slippageBps: 100 = 1%. Applied as expected * (10000 - slippageBps) / 10000.
export function applySlippage(expected, slippageBps) {
  return (expected * BigInt(10000 - slippageBps)) / 10000n;
}
