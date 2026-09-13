import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getUsdPrices, getDecimals } from "../../chain/price.js";

// `failed` isn't a schema field (Campaign only tracks finalized/succeeded) -- derived below.
// totalSupply/contributorBps/lpBps/hookFeeBps/vaultBps are read once by the subgraph via
// getCampaignMeta when the campaign is created, and are null if that call reverted.
const CAMPAIGN_FIELDS = `
  id campaignId creator name symbol dexQuoteAsset goal startTime deadline totalRaised succeeded finalized
  metaUri totalSupply contributorBps lpBps hookFeeBps vaultBps
  createdAt: createdAtTimestamp createdAtBlock createdAtTx
  token { id }
`;

type CampaignRow = { dexQuoteAsset: string; goal: string; totalRaised: string; succeeded: boolean; finalized: boolean };

// goal/totalRaised are raw units of the campaign's own quote asset; the USD figures use that
// asset's current subgraph reference price. Null when it has none, never fabricated.
async function attachCampaignUsd<T extends CampaignRow>(chain: ChainSlug, campaigns: T[]) {
  const quoteAddresses = [...new Set(campaigns.map((c) => c.dexQuoteAsset))];
  const [prices, decimals] = await Promise.all([getUsdPrices(chain, quoteAddresses), getDecimals(chain, quoteAddresses)]);
  return campaigns.map((c) => {
    const usd = prices.get(c.dexQuoteAsset) ?? null;
    const quoteDecimals = decimals.get(c.dexQuoteAsset) ?? 18;
    const toUsd = (raw: string) => (usd != null ? String((Number(raw) / 10 ** quoteDecimals) * usd) : null);
    return { ...c, quoteDecimals, goalUsd: toUsd(c.goal), totalRaisedUsd: toUsd(c.totalRaised), failed: c.finalized && !c.succeeded };
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
