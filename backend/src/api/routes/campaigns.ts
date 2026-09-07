import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getUsdPrices, decimalsFor } from "../../chain/price.js";

// `failed` isn't a real schema field (Campaign only tracks `finalized`/
// `succeeded`) -- derived below as finalized && !succeeded instead of
// querying a field that doesn't exist. `createdAt`/`resolvedAt`/
// `resolvedAtBlock` aren't real fields either (Campaign only has
// createdAtTimestamp) -- dropped rather than guessed at.
// totalSupply/contributorBps/lpBps/hookFeeBps/vaultBps are set once at
// launch() time and never re-emitted in any event, so the subgraph reads
// them itself via a getCampaignMeta contract call inside its own
// handleCampaignCreated (see DuckProtocol-RH/src/duck-crowdfund.ts) --
// nullable there, since a reverted call at index time just leaves them
// unset rather than a fabricated value.
const CAMPAIGN_FIELDS = `
  id campaignId creator name symbol dexQuoteAsset goal startTime deadline totalRaised succeeded finalized
  totalSupply contributorBps lpBps hookFeeBps vaultBps
  createdAt: createdAtTimestamp createdAtBlock createdAtTx
  token { id }
`;

type CampaignRow = { dexQuoteAsset: string | null; goal: string; totalRaised: string; succeeded: boolean; finalized: boolean };

// GOAL/totalRaised are always denominated in the campaign's own
// dexQuoteAsset (raw on-chain units) -- goalUsd/totalRaisedUsd are a single
// multiplication against that asset's current USD price (chain/price.ts),
// identical treatment to tokens.ts's market-cap/volume USD attachment. Null
// when the quote asset can't be priced right now, never fabricated.
async function attachCampaignUsd<T extends CampaignRow>(chain: ChainSlug, campaigns: T[]): Promise<(T & { goalUsd: string | null; totalRaisedUsd: string | null; failed: boolean })[]> {
  const quoteAddresses = [...new Set(campaigns.map((c) => c.dexQuoteAsset).filter((a): a is string => !!a))];
  const prices = await getUsdPrices(chain, quoteAddresses);
  return campaigns.map((c) => {
    const usd = c.dexQuoteAsset ? prices.get(c.dexQuoteAsset) ?? null : null;
    const decimals = c.dexQuoteAsset ? decimalsFor(chain, c.dexQuoteAsset) : 18;
    const toUsd = (raw: string) => (usd != null ? String((Number(raw) / 10 ** decimals) * usd) : null);
    return { ...c, goalUsd: toUsd(c.goal), totalRaisedUsd: toUsd(c.totalRaised), failed: c.finalized && !c.succeeded };
  });
}

export default function createCampaignsRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);

    try {
      const data = await querySubgraph<{ campaigns: CampaignRow[] }>(
        chain,
        `query Campaigns($first: Int!, $skip: Int!) {
          campaigns(first: $first, skip: $skip, orderBy: createdAtBlock, orderDirection: desc) {
            ${CAMPAIGN_FIELDS}
          }
        }`,
        { first: limit, skip: offset }
      );
      res.json(await attachCampaignUsd(chain, data.campaigns));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const data = await querySubgraph<{ campaign: (CampaignRow & Record<string, unknown>) | null }>(
        chain,
        `query CampaignDetail($id: ID!) {
          campaign(id: $id) {
            ${CAMPAIGN_FIELDS}
            contributions { id contributor amount blockNumber timestamp txHash }
            claims { id contributor amount blockNumber timestamp txHash }
            refunds { id contributor amount blockNumber timestamp txHash }
          }
        }`,
        { id: req.params.id }
      );
      if (data.campaign == null) return res.status(404).json({ error: "not found" });
      const [withUsd] = await attachCampaignUsd(chain, [data.campaign]);
      res.json(withUsd);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
