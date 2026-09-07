import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getUsdPrices, decimalsFor } from "../../chain/price.js";
import { familyToFrontend, familyToSubgraph } from "../../chain/family.js";

// The ONE token the API ever marks verified -- a deploy-time env var, not an
// on-chain read or a curated list (see .env.example). Unset until $DUCK
// actually launches, so `verified` is false for everything until then.
const VERIFIED_ADDRESS = process.env.DUCK_TOKEN_ADDRESS?.toLowerCase() || null;
function attachVerified<T extends { id: string }>(token: T): T & { verified: boolean } {
  return { ...token, verified: VERIFIED_ADDRESS != null && token.id.toLowerCase() === VERIFIED_ADDRESS };
}

// The subgraph's real TokenFamily enum is PascalCase (BondingCurve/Launcher/
// Crowdfund) -- every frontend file expects CURVE/INSTANT/CAMPAIGN instead
// (see chain/family.ts). Applied last, right before a token leaves this
// route, so every other transform above still reads/writes the real
// subgraph value.
function applyFamily<T extends { family: string }>(token: T): T {
  return { ...token, family: familyToFrontend(token.family) ?? token.family };
}

// lastPriceUsd/volumeAllTimeUsd/volumeUsd/closePriceUsd are deliberately NOT
// queried here -- the subgraph only tracks raw, quote-denominated
// normalization (see DuckProtocol-RH/src/normalize.ts). USD is a one-
// multiplication step done below, against a live GeckoTerminal-backed price
// (chain/price.ts), identical for curated and creator-provided quote
// tokens. `createdAt` is aliased from the real schema field
// (createdAtTimestamp) so nothing downstream of this route needs to change.
// antibotEnabled/tradingBlock were dropped entirely -- neither corresponds
// to any real field on DuckBondingCurve's on-chain TokenConfig; they were
// stale carryover from an earlier, different contract set.
const TOKEN_FIELDS = `
  id family creator quoteToken totalSupply
  createdAt: createdAtTimestamp createdAtBlock createdAtTx
  name symbol metaUri metaOverrideUri burnedSupply holderCount lastPrice lastTradeAt volumeAllTime
  virtualQuote migrationTarget migrated poolId bcTokensSold raisedQuote
  positionManager hook tokenId
  campaign { id name symbol goal totalRaised deadline succeeded finalized }
`;

// "Last 24 hours from now" is a moving target TokenHourData's static hourly
// rows can't represent by themselves -- summing the buckets whose hour
// started within the last day approximates a rolling 24h window at hourly
// granularity (the edge bucket can be a few minutes short/over), which is
// the standard tradeoff for this kind of rollup and far cheaper than
// re-scanning raw trades on every request.
//
// 24h price change reuses the same query: each bucket's closePrice is the
// token's price as of its last trade that hour, so the most recent bucket
// at-or-before the 24h-ago cutoff is "price ~24h ago" -- compared against
// the token's current lastPrice. A 7-day lookback window (not just 24h)
// gives that comparison something to find even for a token that hasn't
// traded in the last day. A token younger than 24h has no such bucket by
// definition -- rather than showing nothing, falls back to its EARLIEST
// tracked bucket (i.e. "change since we first saw a price for it"), which
// is still a real, honest number; only a token with zero trade history at
// all (no buckets in the window) gets null.
//
// USD figures (lastPriceUsd/volume24hUsd/volumeAllTimeUsd/priceChange24hUsd)
// are a single multiplication against each token's quote asset's CURRENT
// USD price (chain/price.ts, GeckoTerminal-backed, curated and creator-
// provided quote tokens handled identically) -- applied across the whole
// lookback window rather than each historical trade's own contemporaneous
// quote price, the same category of approximation already accepted above
// for the hourly-bucket 24h rollup itself. Null when the quote asset can't
// be priced right now -- never fabricated off a peg assumption.
async function attachDerivedStats<T extends { id: string; quoteToken: string | null; lastPrice: string | null; volumeAllTime: string | null }>(
  chain: ChainSlug,
  tokens: T[]
): Promise<
  (T & {
    volume24h: string; volume24hUsd: string | null;
    priceChange24h: number | null; priceChange24hUsd: number | null;
    lastPriceUsd: number | null; volumeAllTimeUsd: string | null;
  })[]
> {
  if (tokens.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  const cutoff24h = now - 24 * 60 * 60;
  const cutoff7d = now - 7 * 24 * 60 * 60;
  const data = await querySubgraph<{
    tokenHourDatas: { token: { id: string }; hourStartUnix: string; volumeQuote: string; closePrice: string | null }[];
  }>(
    chain,
    `query DerivedStats($tokens: [String!]!, $cutoff: BigInt!) {
      tokenHourDatas(first: 1000, orderBy: hourStartUnix, orderDirection: desc, where: { token_in: $tokens, hourStartUnix_gte: $cutoff }) {
        token { id }
        hourStartUnix
        volumeQuote
        closePrice
      }
    }`,
    { tokens: tokens.map((t) => t.id), cutoff: String(cutoff7d) }
  );

  const volSums = new Map<string, bigint>();
  const priceBefore24h = new Map<string, number | null>();
  // Rows arrive newest-first per token, so overwriting this on every row
  // (rather than only-if-absent) leaves each token's LAST-seen row --
  // chronologically its oldest -- once the loop finishes.
  const earliestBucket = new Map<string, number | null>();
  for (const row of data.tokenHourDatas) {
    const hourStart = Number(row.hourStartUnix);
    if (hourStart >= cutoff24h) {
      volSums.set(row.token.id, (volSums.get(row.token.id) ?? 0n) + BigInt(row.volumeQuote));
    }
    // The first one at-or-before the cutoff we see per token is the
    // closest available "price 24h ago".
    if (hourStart <= cutoff24h && !priceBefore24h.has(row.token.id)) {
      priceBefore24h.set(row.token.id, row.closePrice != null ? Number(row.closePrice) : null);
    }
    earliestBucket.set(row.token.id, row.closePrice != null ? Number(row.closePrice) : null);
  }

  const pctChange = (curr: number | null, prev: number | null | undefined) =>
    curr != null && prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;

  const quoteAddresses = [...new Set(tokens.map((t) => t.quoteToken).filter((a): a is string => !!a))];
  const quoteUsdPrices = await getUsdPrices(chain, quoteAddresses);

  return tokens.map((t) => {
    const prev = priceBefore24h.get(t.id) ?? earliestBucket.get(t.id);
    const lastPriceNum = t.lastPrice != null ? Number(t.lastPrice) : null; // already human-scaled (quote units per token) by the subgraph
    const volume24h = volSums.get(t.id) ?? 0n; // RAW, on-chain units -- needs its own decimals division below
    const quoteUsd = t.quoteToken ? quoteUsdPrices.get(t.quoteToken) ?? null : null;
    const quoteDecimals = t.quoteToken ? decimalsFor(chain, t.quoteToken) : 18;
    const humanVolume24h = Number(volume24h) / 10 ** quoteDecimals;
    const humanVolumeAllTime = t.volumeAllTime != null ? Number(t.volumeAllTime) / 10 ** quoteDecimals : 0;

    return {
      ...t,
      volume24h: volume24h.toString(),
      volume24hUsd: quoteUsd != null ? String(humanVolume24h * quoteUsd) : null,
      priceChange24h: pctChange(lastPriceNum, prev),
      priceChange24hUsd: pctChange(lastPriceNum, prev), // ratio unaffected by quote's own USD price
      lastPriceUsd: lastPriceNum != null && quoteUsd != null ? lastPriceNum * quoteUsd : null,
      volumeAllTimeUsd: quoteUsd != null ? String(humanVolumeAllTime * quoteUsd) : null,
    };
  });
}

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
function ipfsToHttp(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return PINATA_GATEWAY + uri.slice("ipfs://".length);
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

type ResolvedMeta = { imageUrl: string | null; socials: { website?: string; twitter?: string; telegram?: string } };
const EMPTY_SOCIALS = {};

// Every browser was independently doing this exact fetch (metaURI JSON off
// IPFS, just to read its `image` field) and hitting Pinata's slow shared
// public gateway cold every time -- the reported "images load really slow"
// complaint. Resolving it here once, cached process-wide, means every user
// after the first gets it instantly instead of each of them paying that
// gateway round trip themselves. Keyed by the URI string itself, so a
// *changed* URI (a new DuckMetaOverride registration) is simply a different
// cache key -- there's no staleness to reason about, only ever the current
// metaUri/metaOverrideUri a token has right now (see duck-meta-override.ts:
// the subgraph already only ever tracks the latest override, nothing here
// needs to re-derive that). A failed resolution is deliberately NOT cached
// (evicted before returning), so a transient gateway hiccup self-heals on
// the next request instead of permanently pinning a token to "no image".
//
// `socials` rides along on this same fetch -- the metadata JSON already has
// it (see App.jsx's buildMetaURI), so surfacing it here for Discover's
// per-card social icons costs nothing extra; a second, separate fetch just
// to read the same document would undo the point of caching it at all.
const metaCache = new Map<string, Promise<ResolvedMeta>>();
function resolveMeta(metaUri: string | null | undefined): Promise<ResolvedMeta> {
  if (!metaUri) return Promise.resolve({ imageUrl: null, socials: EMPTY_SOCIALS });
  const cached = metaCache.get(metaUri);
  if (cached) return cached;
  const promise = (async (): Promise<ResolvedMeta> => {
    try {
      const url = ipfsToHttp(metaUri);
      if (!url) return { imageUrl: null, socials: EMPTY_SOCIALS };
      const res = await fetch(url);
      if (!res.ok) throw new Error(`gateway ${res.status}`);
      const data = (await res.json()) as { image?: string; socials?: ResolvedMeta["socials"] };
      const imageUrl = ipfsToHttp(data.image);
      if (!imageUrl) metaCache.delete(metaUri);
      return { imageUrl, socials: data.socials || EMPTY_SOCIALS };
    } catch {
      metaCache.delete(metaUri);
      return { imageUrl: null, socials: EMPTY_SOCIALS };
    }
  })();
  metaCache.set(metaUri, promise);
  return promise;
}

async function attachImageUrls<T extends { metaUri: string | null; metaOverrideUri: string | null }>(
  tokens: T[]
): Promise<(T & ResolvedMeta)[]> {
  const metas = await Promise.all(tokens.map((t) => resolveMeta(t.metaOverrideUri || t.metaUri)));
  return tokens.map((t, i) => ({ ...t, ...metas[i] }));
}

export default function createTokensRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/", async (req, res) => {
    const family = typeof req.query.family === "string" ? familyToSubgraph(req.query.family.toUpperCase()) : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    try {
      const data = await querySubgraph<{
        tokens: { id: string; family: string; quoteToken: string | null; lastPrice: string | null; volumeAllTime: string | null; metaUri: string | null; metaOverrideUri: string | null }[];
      }>(
        chain,
        `query Tokens($first: Int!, $skip: Int!, $where: Token_filter) {
          tokens(first: $first, skip: $skip, orderBy: createdAtBlock, orderDirection: desc, where: $where) {
            ${TOKEN_FIELDS}
          }
        }`,
        { first: limit, skip: offset, where: family ? { family } : {} }
      );
      res.json((await attachImageUrls(await attachDerivedStats(chain, data.tokens))).map(attachVerified).map(applyFamily));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:address", async (req, res) => {
    const address = req.params.address.toLowerCase();

    try {
      const data = await querySubgraph<{
        token: Record<string, unknown> | null;
        // LPPosition.id and PoolRegistration.id are both the real underlying
        // identifiers (token address / poolId respectively) DuckProtocol-RH
        // actually indexes -- there's no separate "Position"/"Pool" entity
        // here (an earlier version of this query referenced fields from a
        // different, no-longer-real schema shape).
        // graph-node lowercases the WHOLE entity name for auto-generated
        // plural query roots on a type with internal capitals -- "LPPosition"
        // becomes "lppositions", not "lpPositions" (verified directly
        // against the live schema's __schema introspection).
        lppositions: Record<string, unknown>[];
        poolRegistrations: Record<string, unknown>[];
      }>(
        chain,
        `query TokenDetail($id: ID!) {
          token(id: $id) {
            ${TOKEN_FIELDS}
            campaign { id creator name symbol dexQuoteAsset goal startTime deadline totalRaised succeeded finalized }
          }
          lppositions(where: { token: $id }, first: 1) {
            tokenId poolId hook positionManager blockNumber timestamp txHash
          }
          poolRegistrations(where: { token: $id }, first: 1) {
            id creator hookFeeBps blockNumber timestamp txHash
          }
        }`,
        { id: address }
      );

      if (data.token == null) return res.status(404).json({ error: "not found" });
      const [withStats] = await attachDerivedStats(chain, [
        data.token as { id: string; family: string; quoteToken: string | null; lastPrice: string | null; volumeAllTime: string | null },
      ]);
      const [withImage] = await attachImageUrls([
        withStats as typeof withStats & { metaUri: string | null; metaOverrideUri: string | null },
      ]);
      res.json({ ...applyFamily(attachVerified(withImage)), position: data.lppositions[0] ?? null, pool: data.poolRegistrations[0] ?? null });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

type SubgraphTrade = {
  id: string; trader: string; side: "BUY" | "SELL"; quoteAmount: string; tokenAmount: string;
  timestamp: string; blockNumber: string; txHash: string;
};
type CurveTradeRow = { id: string; trader: string; isBuy: boolean; quoteAmount: string; tokenAmount: string; timestamp: string; blockNumber: string; txHash: string };
type PoolSwapRow = { id: string; trader: string; isBuy: boolean; quoteAmount: string; tokenAmount: string; timestamp: string; blockNumber: string; txHash: string };

function toSubgraphTrade(row: CurveTradeRow | PoolSwapRow): SubgraphTrade {
  return {
    id: row.id,
    trader: row.trader,
    side: row.isBuy ? "BUY" : "SELL",
    quoteAmount: row.quoteAmount,
    tokenAmount: row.tokenAmount,
    timestamp: row.timestamp,
    blockNumber: row.blockNumber,
    txHash: row.txHash,
  };
}

router.get("/:address/trades", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  // Trade only exists for pre-migration curve activity (TokenBought/
  // TokenSold). Once a token migrates -- or always, for Launcher/post-
  // success Crowdfund tokens -- its real trading is Uniswap V4 swaps,
  // indexed as PoolSwap (already scoped to `token` and pre-decoded into
  // isBuy/quoteAmount/tokenAmount by the subgraph itself -- see
  // DuckProtocol-RH/src/pool-manager.ts -- so no currency0/1 guessing is
  // needed here). Trades merge two independently-paginated sources before
  // sorting -- there's no single cursor that pages both at once, and no
  // running total-trade-count field on Token, so real (not "next page
  // exists") pagination needs an actual count. Fetching up to CAP from each
  // side unconditionally (regardless of the requested page) gives an exact
  // total for anything up to CAP combined trades -- fine at today's volume,
  // same "revisit once this routinely hits it" tradeoff as platform.ts's
  // /stats route.
  const CAP = 1000;

  try {
    const data = await querySubgraph<{ trades: CurveTradeRow[]; poolSwaps: PoolSwapRow[] }>(
      chain,
      `query TokenTrades($token: String!, $first: Int!) {
        trades(first: $first, orderBy: blockNumber, orderDirection: desc, where: { token: $token }) {
          id trader isBuy quoteAmount tokenAmount timestamp blockNumber txHash
        }
        poolSwaps(first: $first, orderBy: blockNumber, orderDirection: desc, where: { token: $token }) {
          id trader isBuy quoteAmount tokenAmount timestamp blockNumber txHash
        }
      }`,
      { token: address, first: CAP }
    );

    const merged = [...data.trades.map(toSubgraphTrade), ...data.poolSwaps.map(toSubgraphTrade)].sort(
      (a, b) => Number(b.blockNumber) - Number(a.blockNumber)
    );
    res.json({ items: merged.slice(offset, offset + limit), total: merged.length });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
  });

  router.get("/:address/holders", async (req, res) => {
    const address = req.params.address.toLowerCase();
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    try {
      // Token.holderCount is a running counter maintained on every
      // zero-balance crossing (see schema.graphql), so it's already exactly
      // "accounts with balance > 0" -- the same set this query filters to --
      // with no separate count query needed.
      const data = await querySubgraph<{ holders: unknown[]; token: { holderCount: number } | null }>(
        chain,
        `query TokenHolders($token: String!, $first: Int!, $skip: Int!) {
          holders(first: $first, skip: $skip, orderBy: balance, orderDirection: desc, where: { token: $token, balance_gt: "0" }) {
            account balance updatedAt updatedAtBlock
          }
          token(id: $token) { holderCount }
        }`,
        { token: address, first: limit, skip: offset }
      );
      res.json({ items: data.holders, total: data.token?.holderCount ?? data.holders.length });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
