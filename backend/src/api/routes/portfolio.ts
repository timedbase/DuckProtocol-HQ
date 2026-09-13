import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { familyToFrontend } from "../../chain/family.js";
import { getDecimals } from "../../chain/price.js";

export default function createPortfolioRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/:address", async (req, res) => {
    const address = req.params.address.toLowerCase();

    try {
      // Contribution is a plain, immutable per-contribution event row (no
      // claimed/refunded flags on it directly) -- whether a given campaign
      // was actually claimed/refunded by this address lives on the separate
      // Claim/Refund event entities instead, queried alongside it and
      // matched up below. `createdAt` doesn't exist on Token -- the real
      // field is createdAtTimestamp, aliased here the same way tokens.ts
      // already does so PortfolioPage doesn't need to know the difference.
      const data = await querySubgraph<{
        tokens: { family: string; [k: string]: unknown }[];
        holders: { token: { id: string; family: string } }[];
        contributions: { campaign: { id: string; dexQuoteAsset: string; [k: string]: unknown } }[];
        claims: { campaign: { id: string } }[];
        refunds: { campaign: { id: string } }[];
      }>(
        chain,
        `query Portfolio($address: String!) {
          tokens(where: { creator: $address }, orderBy: createdAtBlock, orderDirection: desc) {
            id family creator name symbol quoteToken totalSupply createdAt: createdAtTimestamp createdAtBlock createdAtTx
            migrated hasPool poolId hook
          }
          holders(where: { account: $address, balance_gt: "0" }, orderBy: balance, orderDirection: desc) {
            token { id family } balance updatedAt updatedAtBlock
          }
          contributions(where: { contributor: $address }) {
            id amount blockNumber timestamp txHash
            campaign { id creator name symbol dexQuoteAsset goal deadline totalRaised succeeded finalized token { id } }
          }
          claims(where: { contributor: $address }) { campaign { id } }
          refunds(where: { contributor: $address }) { campaign { id } }
        }`,
        { address }
      );

      const quoteAssets = [...new Set(data.contributions.map((c) => c.campaign.dexQuoteAsset))];
      const decimals = await getDecimals(chain, quoteAssets);
      const claimedCampaigns = new Set(data.claims.map((c) => c.campaign.id));
      const refundedCampaigns = new Set(data.refunds.map((r) => r.campaign.id));

      res.json({
        address,
        created: data.tokens.map((t) => ({ ...t, family: familyToFrontend(t.family) ?? t.family })),
        holdings: data.holders.map((h) => ({ ...h, token: { ...h.token, family: familyToFrontend(h.token.family) ?? h.token.family } })),
        contributions: data.contributions.map((c) => ({
          ...c,
          // failed isn't a real Campaign field either (only
          // finalized/succeeded) -- same derivation campaigns.ts already uses.
          campaign: { ...c.campaign, quoteDecimals: decimals.get(c.campaign.dexQuoteAsset) ?? 18, failed: !!c.campaign.finalized && !c.campaign.succeeded },
          claimed: claimedCampaigns.has(c.campaign.id),
          refunded: refundedCampaigns.has(c.campaign.id),
        })),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
