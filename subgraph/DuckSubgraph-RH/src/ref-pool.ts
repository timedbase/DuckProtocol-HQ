// Swaps in the fixed Uniswap v3 pools used as USD price references. Every reference pool shares this
// handler and ABI; the pool's role comes from price-config.ts.
import { Swap } from "../generated/PriceReference0/UniswapV3Pool";
import { findRefPool, recordReferenceSwap } from "./pricing";

export function handleSwap(event: Swap): void {
  let ref = findRefPool(event.address);
  if (ref == null) return;
  recordReferenceSwap(ref, event.params.sqrtPriceX96, event.params.liquidity, event);
}
