import type { Address } from "viem";
import { getAddress } from "viem";
import type { ChainSlug } from "./registry.js";
import { ADDRESSES } from "./addresses.js";

// GeckoTerminal indexes this chain as network id "robinhood" -- confirmed
// live (network listing, a real DEX entry "uniswap-v4-robinhood", and real
// prices for our own curated tokens, e.g. USDG ~$1) before ever wiring this
// in. It works identically for a curated quote token or an arbitrary
// creator-provided one, since it indexes real pools directly rather than
// working off any curated list -- there is no separate "custom token" code
// path here, on purpose.
const GECKOTERMINAL_NETWORK: Record<ChainSlug, string> = {
  robinhood: "robinhood",
};

const GECKOTERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

// GeckoTerminal's multi-token endpoint caps out around 30 addresses per call.
const BATCH_SIZE = 30;

// Cache TTL -- long enough to avoid hammering a public, rate-limited API on
// every Discover page load, short enough that a create-form preview or a
// freshly-loaded token list is never showing a stale-by-minutes price.
const CACHE_TTL_MS = 90_000;

type CacheEntry = { usd: number | null; at: number };
// Process-wide, no library -- same idiom as tokens.ts's metaCache and
// health.ts's interval poll. Keyed by "<chain>:<lowercased address>".
const priceCache = new Map<string, CacheEntry>();

function cacheKey(chain: ChainSlug, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

// Native (0x0) isn't a real ERC20 GeckoTerminal can index -- price it via the
// chain's real WETH contract instead, same native->WETH normalization this
// codebase already applies elsewhere (the vault/hook's own currency rules).
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function resolvePricingAddress(chain: ChainSlug, address: string): Address {
  if (address.toLowerCase() === ZERO_ADDRESS) {
    return ADDRESSES[chain].WETH;
  }
  return getAddress(address);
}

async function fetchBatch(chain: ChainSlug, addresses: Address[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const network = GECKOTERMINAL_NETWORK[chain];
  if (!network || addresses.length === 0) return result;

  const url = `${GECKOTERMINAL_BASE}/networks/${network}/tokens/multi/${addresses.join(",")}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      // Rate-limited or a transient upstream error -- every requested
      // address just stays unpriced this round (null), never fabricated,
      // never thrown past the caller.
      for (const a of addresses) result.set(a.toLowerCase(), null);
      return result;
    }
    const body = (await res.json()) as { data?: { attributes?: { address?: string; price_usd?: string | null } }[] };
    const seen = new Set<string>();
    for (const row of body.data ?? []) {
      const addr = row.attributes?.address?.toLowerCase();
      if (!addr) continue;
      const raw = row.attributes?.price_usd;
      const usd = raw != null ? Number(raw) : null;
      result.set(addr, usd != null && Number.isFinite(usd) ? usd : null);
      seen.add(addr);
    }
    // Anything requested but absent from the response (unindexed on this
    // chain) is honestly unresolvable -- null, not a missing map entry.
    for (const a of addresses) {
      if (!seen.has(a.toLowerCase())) result.set(a.toLowerCase(), null);
    }
  } catch {
    for (const a of addresses) result.set(a.toLowerCase(), null);
  }
  return result;
}

// Batched, cached USD price lookup -- works identically for curated and
// creator-provided quote tokens. Returns a map keyed by the ORIGINAL address
// strings passed in (not lowercased/normalized), so callers can look up
// exactly what they asked for; native (0x0) is priced via WETH under the
// hood but keyed back to "0x0..." for the caller.
export async function getUsdPrices(chain: ChainSlug, addresses: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (addresses.length === 0) return out;

  const now = Date.now();
  const toFetch: { original: string; pricingAddr: Address }[] = [];
  for (const original of addresses) {
    let pricingAddr: Address;
    try {
      pricingAddr = resolvePricingAddress(chain, original);
    } catch {
      out.set(original, null);
      continue;
    }
    const key = cacheKey(chain, pricingAddr);
    const cached = priceCache.get(key);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      out.set(original, cached.usd);
    } else {
      toFetch.push({ original, pricingAddr });
    }
  }

  const dedupedPricingAddrs = [...new Set(toFetch.map((t) => t.pricingAddr))];
  for (let i = 0; i < dedupedPricingAddrs.length; i += BATCH_SIZE) {
    const chunk = dedupedPricingAddrs.slice(i, i + BATCH_SIZE);
    const fetched = await fetchBatch(chain, chunk);
    for (const addr of chunk) {
      const usd = fetched.get(addr.toLowerCase()) ?? null;
      priceCache.set(cacheKey(chain, addr), { usd, at: now });
    }
  }

  for (const { original, pricingAddr } of toFetch) {
    out.set(original, priceCache.get(cacheKey(chain, pricingAddr))?.usd ?? null);
  }
  return out;
}

export async function getUsdPrice(chain: ChainSlug, address: string): Promise<number | null> {
  const prices = await getUsdPrices(chain, [address]);
  return prices.get(address) ?? null;
}

export type QuoteConversion = { raw: string; decimals: number; priceUsd: number };

export function decimalsFor(chain: ChainSlug, address: string): number {
  if (address.toLowerCase() === ZERO_ADDRESS) return 18;
  const curated = ADDRESSES[chain].DEFAULT_QUOTE_TOKENS.find((q) => q.address.toLowerCase() === address.toLowerCase());
  return curated?.decimals ?? 18;
}

// Converts a USD amount into the quote asset's own raw on-chain units.
// Deliberately done as string/BigInt arithmetic, not `usd / price * 10**decimals`
// in floating point -- avoids dust/rounding artifacts at 18-decimal precision.
// Returns null when the quote token is honestly unpriceable right now (never
// silently defaults to 0 or 1) -- caller must surface that, not paper over it.
export async function convertUsdToQuoteUnits(chain: ChainSlug, quoteToken: string, usdAmount: number): Promise<QuoteConversion | null> {
  if (!Number.isFinite(usdAmount) || usdAmount < 0) return null;
  const priceUsd = await getUsdPrice(chain, quoteToken);
  if (priceUsd == null || priceUsd <= 0) return null;

  const decimals = decimalsFor(chain, quoteToken);
  // Fixed-point: scale both usdAmount and priceUsd up by a shared precision
  // factor before doing integer division, instead of dividing two JS floats
  // and hoping the result is clean at 18 decimals.
  const PRECISION = 1_000_000; // 6 extra digits of precision for the division itself
  const usdScaled = BigInt(Math.round(usdAmount * PRECISION));
  const priceScaled = BigInt(Math.round(priceUsd * PRECISION));
  if (priceScaled === 0n) return null;

  const raw = (usdScaled * 10n ** BigInt(decimals)) / priceScaled;
  return { raw: raw.toString(), decimals, priceUsd };
}
