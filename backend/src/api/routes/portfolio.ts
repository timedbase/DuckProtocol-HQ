import { Router } from "express";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";

export default function createPortfolioRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/:address", async (req, res) => {
    const address = req.params.address.toLowerCase();

    try {
      const data = await querySubgraph<{
        tokens: unknown[];
        holders: unknown[];
        contributions: unknown[];
      }>(
        chain,
        `query Portfolio($address: String!) {
          tokens(where: { creator: $address }, orderBy: createdAtBlock, orderDirection: desc) {
            id family creator quoteToken totalSupply createdAt createdAtBlock createdAtTx migrated
          }
          holders(where: { account: $address, balance_gt: "0" }, orderBy: balance, orderDirection: desc) {
            token { id family } balance updatedAt updatedAtBlock
          }
          contributions(where: { contributor: $address }) {
            id amount claimed claimedAmount refunded refundedAmount firstContributedAt lastContributedAt
            campaign { id creator name symbol goal deadline totalRaised succeeded failed token { id } }
          }
        }`,
        { address }
      );

      res.json({
        address,
        created: data.tokens,
        holdings: data.holders,
        contributions: data.contributions,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
