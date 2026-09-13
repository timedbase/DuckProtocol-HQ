import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getDecimals } from "../../chain/price.js";
import { familyToFrontend, familyToSubgraph } from "../../chain/family.js";

// The ONE token the API ever marks verified -- a deploy-time env var per chain, not an on-chain
// read or a curated list (see .env.example). Unset until $DUCK launches on that chain.
const VERIFIED_ENV_VAR: Record<ChainSlug, string> = {
  robinhood: "ROBINHOOD_DUCK_TOKEN_ADDRESS",
  ink: "INK_DUCK_TOKEN_ADDRESS",
};
function attachVerified<T extends { id: string }>(chain: ChainSlug, token: T): T & { verified: boolean } {
  const verified = process.env[VERIFIED_ENV_VAR[chain]]?.toLowerCase() || null;
  return { ...token, verified: verified != null && token.id.toLowerCase() === verified };
}

// The subgraph's TokenFamily enum is PascalCase (BondingCurve/Launcher/Crowdfund); the frontend
// uses CURVE/INSTANT/CAMPAIGN (see chain/family.ts). Applied last, right before a token leaves.
function applyFamily<T extends { family: string }>(token: T): T {
  return { ...token, family: familyToFrontend(token.family) ?? token.family };
}

// USD figures are indexed by the subgraph itself (each trade valued at its quote token's reference
// price at trade time), so nothing here multiplies by a live price after the fact.
const TOKEN_FIELDS = `
  id family creator name symbol metaUri quoteToken totalSupply burnedSupply holderCount
  createdAt: createdAtTimestamp createdAtBlock createdAtTx
  hasPool migrated poolId hook hookFeeBps
  virtualQuote migrationTarget raisedQuote bcTokensSold
  lastPrice lastTradeAt volumeAllTime lastPriceUSD marketCapUSD volumeUSDAllTime
  campaign { id campaignId name symbol dexQuoteAsset goal totalRaised deadline succeeded finalized }
`;

type TokenRow = {
  id: string; family: string; quoteToken: string | null; metaUri: string | null;
  lastPrice: string | null; lastPriceUSD: string | null; volumeUSDAllTime: string | null;
  campaign: { dexQuoteAsset: string | null } | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Rolling 24h volume and price change from TokenHourData. Summing the buckets that started within
// the last day approximates a rolling window at hourly granularity. "Price ~24h ago" is the most
// recent bucket at or before the cutoff; a token younger than that falls back to its earliest
// tracked bucket, and one with no buckets at all gets null. The 7-day lookback gives the comparison
// something to find for a token that hasn't traded in the last day.
async function attachDerivedStats<T extends TokenRow>(chain: ChainSlug, tokens: T[]) {
  if (tokens.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  const cutoff24h = now - 24 * 60 * 60;
  const cutoff7d = now - 7 * 24 * 60 * 60;
  const data = await querySubgraph<{
    tokenHourDatas: { token: { id: string }; hourStartUnix: string; volumeQuote: string; volumeUSD: string; closePrice: string | null; closePriceUSD: string | null }[];
  }>(
    chain,
    `query DerivedStats($tokens: [String!]!, $cutoff: BigInt!) {
      tokenHourDatas(first: 1000, orderBy: hourStartUnix, orderDirection: desc, where: { token_in: $tokens, hourStartUnix_gte: $cutoff }) {
        token { id } hourStartUnix volumeQuote volumeUSD closePrice closePriceUSD
      }
    }`,
    { tokens: tokens.map((t) => t.id), cutoff: String(cutoff7d) }
  );

  const volSums = new Map<string, bigint>();
  const volUsdSums = new Map<string, number>();
  const before24h = new Map<string, { quote: number | null; usd: number | null }>();
  const earliest = new Map<string, { quote: number | null; usd: number | null }>();
  const num = (v: string | null) => (v != null ? Number(v) : null);
  for (const row of data.tokenHourDatas) {
    const id = row.token.id;
    const hourStart = Number(row.hourStartUnix);
    if (hourStart >= cutoff24h) {
      volSums.set(id, (volSums.get(id) ?? 0n) + BigInt(row.volumeQuote));
      volUsdSums.set(id, (volUsdSums.get(id) ?? 0) + Number(row.volumeUSD));
    }
    const closes = { quote: num(row.closePrice), usd: num(row.closePriceUSD) };
    if (hourStart <= cutoff24h && !before24h.has(id)) before24h.set(id, closes);
    earliest.set(id, closes); // rows are newest-first, so the last write is the oldest bucket
  }

  const pctChange = (curr: number | null, prev: number | null | undefined) =>
    curr != null && prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;

  const decimals = await getDecimals(chain, [...new Set(tokens.flatMap((t) => [t.quoteToken || ZERO_ADDRESS, t.campaign?.dexQuoteAsset || ZERO_ADDRESS]))]);

  return tokens.map((t) => {
    const prev = before24h.get(t.id) ?? earliest.get(t.id);
    const lastPrice = num(t.lastPrice);
    const lastPriceUsd = num(t.lastPriceUSD);
    return {
      ...t,
      quoteDecimals: decimals.get(t.quoteToken || ZERO_ADDRESS) ?? 18,
      campaignQuoteDecimals: t.campaign ? decimals.get(t.campaign.dexQuoteAsset || ZERO_ADDRESS) ?? 18 : null,
      volume24h: (volSums.get(t.id) ?? 0n).toString(),
      volume24hUsd: volUsdSums.has(t.id) ? String(volUsdSums.get(t.id)) : "0",
      priceChange24h: pctChange(lastPrice, prev?.quote),
      priceChange24hUsd: pctChange(lastPriceUsd, prev?.usd),
      lastPriceUsd,
      volumeAllTimeUsd: t.volumeUSDAllTime,
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

// Resolves a token's metadata JSON (image + socials) once per URI, cached process-wide so every
// user after the first skips the slow public-gateway round trip. Failures are evicted rather than
// cached, so a transient gateway error self-heals on the next request.
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

async function attachImageUrls<T extends { metaUri: string | null }>(tokens: T[]): Promise<(T & ResolvedMeta)[]> {
  const metas = await Promise.all(tokens.map((t) => resolveMeta(t.metaUri)));
  return tokens.map((t, i) => ({ ...t, ...metas[i] }));
}

type SubgraphTrade = {
  id: string; trader: string; side: "BUY" | "SELL"; quoteAmount: string; tokenAmount: string;
  priceUSD: string | null; volumeUSD: string | null; timestamp: string; blockNumber: string; txHash: string;
};
type TradeRow = Omit<SubgraphTrade, "side"> & { isBuy: boolean };

function toSubgraphTrade(row: TradeRow): SubgraphTrade {
  const { isBuy, ...rest } = row;
  return { ...rest, side: isBuy ? "BUY" : "SELL" };
}

export default function createTokensRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/", async (req, res) => {
    const family = typeof req.query.family === "string" ? familyToSubgraph(req.query.family.toUpperCase()) : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    try {
      const data = await querySubgraph<{ tokens: TokenRow[] }>(
        chain,
        `query Tokens($first: Int!, $skip: Int!, $where: Token_filter) {
          tokens(first: $first, skip: $skip, orderBy: createdAtBlock, orderDirection: desc, where: $where) {
            ${TOKEN_FIELDS}
          }
        }`,
        { first: limit, skip: offset, where: family ? { family } : {} }
      );
      const rows = await attachImageUrls(await attachDerivedStats(chain, data.tokens));
      res.json(rows.map((t) => applyFamily(attachVerified(chain, t))));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:address", async (req, res) => {
    const address = req.params.address.toLowerCase();

    try {
      const data = await querySubgraph<{ token: TokenRow | null; poolRegistrations: Record<string, unknown>[] }>(
        chain,
        `query TokenDetail($id: ID!) {
          token(id: $id) {
            ${TOKEN_FIELDS}
            campaign { id campaignId creator name symbol dexQuoteAsset goal startTime deadline totalRaised succeeded finalized }
          }
          poolRegistrations(where: { token: $id }, first: 1) {
            id poolId creator hook hookFeeBps blockNumber timestamp txHash
          }
        }`,
        { id: address }
      );

      if (data.token == null) return res.status(404).json({ error: "not found" });
      const [withStats] = await attachDerivedStats(chain, [data.token]);
      const [withImage] = await attachImageUrls([withStats]);
      res.json({ ...applyFamily(attachVerified(chain, withImage)), pool: data.poolRegistrations[0] ?? null });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Curve-phase trades (Trade) and pool swaps (PoolSwap) merged. There's no single cursor across
  // both and no running trade count on Token, so up to CAP rows are fetched from each side to give
  // an exact total up to that size.
  router.get("/:address/trades", async (req, res) => {
    const address = req.params.address.toLowerCase();
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const CAP = 1000;

    try {
      const data = await querySubgraph<{ trades: TradeRow[]; poolSwaps: TradeRow[] }>(
        chain,
        `query TokenTrades($token: String!, $first: Int!) {
          trades(first: $first, orderBy: blockNumber, orderDirection: desc, where: { token: $token }) {
            id trader isBuy quoteAmount tokenAmount priceUSD volumeUSD timestamp blockNumber txHash
          }
          poolSwaps(first: $first, orderBy: blockNumber, orderDirection: desc, where: { token: $token }) {
            id trader isBuy quoteAmount tokenAmount priceUSD volumeUSD timestamp blockNumber txHash
          }
        }`,
        { token: address, first: CAP }
      );

      const merged = [...data.trades, ...data.poolSwaps].map(toSubgraphTrade).sort(
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
      // Token.holderCount is maintained on every zero-balance crossing, so it's exactly the
      // "balance > 0" set this query filters to.
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
