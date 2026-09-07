import { Router } from "express";
import type { ChainSlug } from "../../chain/registry.js";
import { convertUsdToQuoteUnits, getUsdPrices } from "../../chain/price.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export default function createPriceRouter(chain: ChainSlug) {
  const router = Router();

  // GET /:chain/price?tokens=addr1,addr2 -- batched current USD price per
  // quote-token address, curated or creator-provided alike. Used for the
  // create-form's live "≈ $X" preview, not the authoritative conversion.
  router.get("/", async (req, res) => {
    const raw = typeof req.query.tokens === "string" ? req.query.tokens : "";
    const addresses = raw
      .split(",")
      .map((a) => a.trim())
      .filter((a) => ADDRESS_RE.test(a));
    if (addresses.length === 0) return res.status(400).json({ error: "tokens query param required (comma-separated addresses)" });

    try {
      const prices = await getUsdPrices(chain, addresses);
      res.json({ prices: Object.fromEntries(prices) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /:chain/price/convert { quoteToken, usd } -- the authoritative
  // "how many raw quote-token units is this USD amount" conversion, called
  // once at actual submit/simulate time (not on every keystroke).
  router.post("/convert", async (req, res) => {
    const { quoteToken, usd } = req.body ?? {};
    if (typeof quoteToken !== "string" || !ADDRESS_RE.test(quoteToken)) {
      return res.status(400).json({ error: "quoteToken must be a valid address" });
    }
    const usdAmount = Number(usd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      return res.status(400).json({ error: "usd must be a positive number" });
    }

    try {
      const result = await convertUsdToQuoteUnits(chain, quoteToken, usdAmount);
      if (result == null) {
        return res.status(422).json({ error: "this quote asset can't be priced right now -- try a different one" });
      }
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
