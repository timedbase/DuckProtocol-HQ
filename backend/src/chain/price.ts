import { getAddress, parseAbi, type Address } from "viem";
import type { ChainSlug } from "./registry.js";
import { ADDRESSES } from "./addresses.js";
import { getPublicClient } from "./client.js";
import { querySubgraph } from "../subgraph/client.js";

// USD pricing comes from the chain's own subgraph, the same source every indexed USD figure
// (Token.lastPriceUSD, marketCapUSD, volumeUSD...) is computed from, so a create-form conversion
// and the numbers shown on a token card never disagree:
//   - stablecoins (ADDRESSES[chain].STABLES) are exactly $1 and never stored;
//   - every other quote token has a QuotePrice row, either priceUSD directly or priceETH, which is
//     multiplied by the ETH price stored under address(0).
// A quote token with no QuotePrice yet (an arbitrary launcher quote the subgraph hasn't discovered a
// pool for) is honestly unpriced: null, never a guess.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CACHE_TTL_MS = 30_000;

type CacheEntry = { usd: number | null; at: number };
const priceCache = new Map<string, CacheEntry>(); // "<chain>:<lowercased address>"
const decimalsCache = new Map<string, number>();

const ERC20_DECIMALS_ABI = parseAbi(["function decimals() view returns (uint8)"]);

function key(chain: ChainSlug, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

function isStable(chain: ChainSlug, address: string): boolean {
  const lower = address.toLowerCase();
  return ADDRESSES[chain].STABLES.some((s) => s.toLowerCase() === lower);
}

type QuotePriceRow = { id: string; priceUSD: string | null; priceETH: string | null };

// Batched, cached USD price lookup. Returns a map keyed by the ORIGINAL address strings passed in.
export async function getUsdPrices(chain: ChainSlug, addresses: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const now = Date.now();
  const toFetch = new Set<string>();

  for (const original of addresses) {
    if (isStable(chain, original)) { out.set(original, 1); continue; }
    const cached = priceCache.get(key(chain, original));
    if (cached && now - cached.at < CACHE_TTL_MS) out.set(original, cached.usd);
    else toFetch.add(original.toLowerCase());
  }
  if (toFetch.size === 0) return out;

  let rows: QuotePriceRow[];
  try {
    const data = await querySubgraph<{ quotePrices: QuotePriceRow[] }>(
      chain,
      `query QuotePrices($ids: [Bytes!]!) { quotePrices(where: { id_in: $ids }, first: 1000) { id priceUSD priceETH } }`,
      { ids: [...new Set([...toFetch, ZERO_ADDRESS])] }
    );
    rows = data.quotePrices;
  } catch {
    // Unpriced for this request only -- not cached, so the next request retries.
    for (const original of addresses) if (!out.has(original)) out.set(original, null);
    return out;
  }

  const byId = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
  const ethUsdRaw = byId.get(ZERO_ADDRESS)?.priceUSD;
  const ethUsd = ethUsdRaw != null ? Number(ethUsdRaw) : null;

  for (const address of toFetch) {
    const row = byId.get(address);
    let usd: number | null = null;
    if (row?.priceUSD != null) usd = Number(row.priceUSD);
    else if (row?.priceETH != null && ethUsd != null) usd = Number(row.priceETH) * ethUsd;
    if (usd != null && !(Number.isFinite(usd) && usd > 0)) usd = null;
    priceCache.set(key(chain, address), { usd, at: now });
  }
  for (const original of addresses) {
    if (!out.has(original)) out.set(original, priceCache.get(key(chain, original))?.usd ?? null);
  }
  return out;
}

export async function getUsdPrice(chain: ChainSlug, address: string): Promise<number | null> {
  return (await getUsdPrices(chain, [address])).get(address) ?? null;
}

// Decimals for any quote token: native is 18, curated tokens are known, anything else comes from the
// subgraph's QuoteToken cache or, failing that, a live decimals() read. Decimals never change, so
// resolved values are cached for the life of the process.
export async function getDecimals(chain: ChainSlug, addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unknown: string[] = [];
  for (const original of addresses) {
    const lower = original.toLowerCase();
    if (lower === ZERO_ADDRESS) { out.set(original, 18); continue; }
    const curated = ADDRESSES[chain].DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === lower);
    if (curated) { out.set(original, curated.decimals); continue; }
    const cached = decimalsCache.get(key(chain, lower));
    if (cached != null) { out.set(original, cached); continue; }
    unknown.push(lower);
  }

  const pending = [...new Set(unknown)];
  if (pending.length > 0) {
    try {
      const data = await querySubgraph<{ quoteTokens: { id: string; decimals: number }[] }>(
        chain,
        `query QuoteTokenDecimals($ids: [Bytes!]!) { quoteTokens(where: { id_in: $ids }, first: 1000) { id decimals } }`,
        { ids: pending }
      );
      for (const row of data.quoteTokens) decimalsCache.set(key(chain, row.id), row.decimals);
    } catch {
      // fall through to on-chain reads
    }
    const stillMissing = pending.filter((a) => !decimalsCache.has(key(chain, a)));
    if (stillMissing.length > 0) {
      const results = await getPublicClient(chain).multicall({
        contracts: stillMissing.map((a) => ({ address: getAddress(a) as Address, abi: ERC20_DECIMALS_ABI, functionName: "decimals" as const })),
        allowFailure: true,
      }).catch(() => stillMissing.map(() => ({ status: "failure" as const })));
      stillMissing.forEach((a, i) => {
        const r = results[i] as { status: string; result?: number };
        if (r.status === "success" && r.result != null) decimalsCache.set(key(chain, a), Number(r.result));
      });
    }
  }

  for (const original of addresses) {
    if (!out.has(original)) out.set(original, decimalsCache.get(key(chain, original)) ?? 18);
  }
  return out;
}

export type QuoteConversion = { raw: string; decimals: number; priceUsd: number };

// Converts a USD amount into the quote asset's own raw on-chain units, in fixed-point BigInt
// arithmetic to avoid rounding dust at 18 decimals. Null when the quote token can't be priced.
export async function convertUsdToQuoteUnits(chain: ChainSlug, quoteToken: string, usdAmount: number): Promise<QuoteConversion | null> {
  if (!Number.isFinite(usdAmount) || usdAmount < 0) return null;
  const priceUsd = await getUsdPrice(chain, quoteToken);
  if (priceUsd == null || priceUsd <= 0) return null;

  const decimals = (await getDecimals(chain, [quoteToken])).get(quoteToken) ?? 18;
  const PRECISION = 1_000_000;
  const usdScaled = BigInt(Math.round(usdAmount * PRECISION));
  const priceScaled = BigInt(Math.round(priceUsd * PRECISION));
  if (priceScaled === 0n) return null;

  const raw = (usdScaled * 10n ** BigInt(decimals)) / priceScaled;
  return { raw: raw.toString(), decimals, priceUsd };
}
