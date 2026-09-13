# DuckKeeper

A small, unprivileged trigger service for DuckProtocol on **Robinhood Chain** and **Ink**. Every
pool's fee claim (`DuckHookV4.claimFees`), every vault's interest buyback
(`DuckVault.triggerBuyback`), and every token's holder-reward batch payout (`DuckToken.processBatch`)
is permissionless on-chain. DuckKeeper is the process that reliably calls them on a schedule
instead of leaving it to chance.

**DuckKeeper holds no special role in any contract.** Its wallet only needs gas on each chain. If
the key leaked or the service vanished, the worst case is that these calls stop happening until
someone else makes them. When the keeper (or anyone other than the pool's creator) calls
`claimFees`, the hook pays the caller 1% of the claimed fee out of the platform's 25% share.

## What it does, each run

For each chain in `KEEPER_CHAINS` (default: `robinhood,ink`), one after another:

1. Queries that chain's subgraph (`duck-subgraph-rh` / `duck-subgraph-ink`) for every vault,
   paginated by id. Each vault carries its token's hook, pool id and vault address.
2. Skips anything not `enabled` yet (a curve token before migration, or a crowdfund that hasn't
   succeeded) — there's no pool to act on.
3. Reads on-chain state first and only submits a transaction when there's work:
   - `accruedFees(poolId) > 0` → `claimFees(poolId)` on that token's hook.
   - `pendingBuyback() > 0` → `triggerBuyback()` on the vault.
   - `distributing() == true` or the current round is past `DISTRIBUTION_INTERVAL` (12h) →
     `processBatch()` on the token.
4. Logs every call it makes (or would make, in dry-run). A failure on one chain doesn't stop the
   other; the run exits non-zero if any chain failed.

Transactions are submitted sequentially per chain, trading wall-clock time for never needing manual
nonce management.

## Running it

```bash
npm install
cp .env.example .env   # KEEPER_PRIVATE_KEY, plus dedicated RPC URLs
npm run keeper:dev     # one pass, ts via tsx
```

Set `DRY_RUN=true` to log what a run would do without submitting anything.

For production: `npm run build && npm run keeper` runs the compiled output once and exits, invoked on
a schedule (see `render.yaml` at the repo root — a `cron` service).
