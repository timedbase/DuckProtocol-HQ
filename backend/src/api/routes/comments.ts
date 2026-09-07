import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../../db/client.js";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const MAX_BODY_LEN = 500;

// Stricter than the app-wide 120/min -- reads can be generous, but a chat
// post is cheap to spam and there's no wallet-signature check gating it
// (see the POST handler comment below), so this is the main throttle.
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

// Real current % of supply each wallet holds, sourced live from the
// subgraph -- never stored alongside the comment itself, since a saved
// figure would go stale the moment that wallet trades. Best-effort: a
// subgraph hiccup here shouldn't take comments down, so failures just fall
// back to no percentage rather than a 502.
async function fetchHoldPercents(chain: ChainSlug, tokenAddress: string, wallets: string[]): Promise<Record<string, number>> {
  if (wallets.length === 0) return {};
  try {
    const data = await querySubgraph<{
      holders: { account: string; balance: string }[];
      token: { totalSupply: string } | null;
    }>(
      chain,
      `query CommentHolderPct($token: String!, $wallets: [Bytes!]!) {
        holders(where: { token: $token, account_in: $wallets }) { account balance }
        token(id: $token) { totalSupply }
      }`,
      { token: tokenAddress, wallets }
    );
    const totalSupply = Number(data.token?.totalSupply || 0);
    if (totalSupply <= 0) return {};
    const out: Record<string, number> = {};
    for (const h of data.holders) out[h.account.toLowerCase()] = (Number(h.balance) / totalSupply) * 100;
    return out;
  } catch {
    return {};
  }
}

function attachHoldPct<T extends { wallet: string }>(rows: T[], pctByWallet: Record<string, number>) {
  return rows.map((r) => ({ ...r, holdPct: r.wallet === "anon" ? null : (pctByWallet[r.wallet] ?? 0) }));
}

export default function createCommentsRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/:address/comments", async (req, res) => {
    if (!pool) return res.status(503).json({ error: "comments storage is not configured" });
    const address = req.params.address.toLowerCase();
    if (!ADDRESS_RE.test(address)) return res.status(400).json({ error: "invalid token address" });
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    try {
      const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(
          `SELECT wallet, tag, body, extract(epoch from created_at)::bigint AS timestamp
           FROM comments WHERE chain = $1 AND token_address = $2
           ORDER BY created_at DESC, id DESC
           LIMIT $3 OFFSET $4`,
          [chain, address, limit, offset]
        ),
        pool.query(`SELECT COUNT(*)::int AS total FROM comments WHERE chain = $1 AND token_address = $2`, [chain, address]),
      ]);
      const wallets = [...new Set(rows.map((r) => r.wallet).filter((w) => w !== "anon"))];
      const pctByWallet = await fetchHoldPercents(chain, address, wallets);
      res.json({ items: attachHoldPct(rows, pctByWallet), total: countRows[0]?.total ?? 0 });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Self-reported, same trust level the in-memory mock this replaces already
  // had: `wallet` is whatever the caller's connected account is, never
  // cryptographically verified (no signature step). Fine for a public chat
  // feed -- nothing here moves funds or changes on-chain state -- but it does
  // mean the wallet/tag shown is not proof of identity.
  router.post("/:address/comments", postLimiter, async (req, res) => {
    if (!pool) return res.status(503).json({ error: "comments storage is not configured" });
    const address = req.params.address.toLowerCase();
    if (!ADDRESS_RE.test(address)) return res.status(400).json({ error: "invalid token address" });

    const walletRaw = typeof req.body?.wallet === "string" ? req.body.wallet.trim() : "";
    const wallet = ADDRESS_RE.test(walletRaw) ? walletRaw.toLowerCase() : "anon";
    const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, MAX_BODY_LEN) : "";
    if (!body) return res.status(400).json({ error: "empty comment" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO comments (chain, token_address, wallet, tag, body)
         VALUES ($1, $2, $3, 'HOLDER', $4)
         RETURNING wallet, tag, body, extract(epoch from created_at)::bigint AS timestamp`,
        [chain, address, wallet, body]
      );
      const pctByWallet = await fetchHoldPercents(chain, address, wallet === "anon" ? [] : [wallet]);
      res.status(201).json(attachHoldPct(rows, pctByWallet)[0]);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
