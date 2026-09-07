# duckfun.family backend

A small Express API (Node/TypeScript) for the duckfun.family contracts on
Ink chain (57073) and Arc chain (5042). Meant to run on Render's Starter
plan, per `render.yaml` in the Duck-Family repo's root.

## Architecture

There is no indexer or database here anymore. Chain activity (tokens,
trades, campaigns, LP positions, hook pools, holder balances, raw V4 pool
swaps) is indexed by a subgraph per chain (`../subgraph/` for Ink on
Goldsky, `../subgraph-arc/` for Arc on a self-hosted graph-node — see that
directory's README for why) — this API is a thin layer in front of them.

**Every data route is chain-scoped** under `/ink` or `/arc` (see
`src/chain/registry.ts`'s `ChainSlug`) — `/upload` and `/health` are the
only unprefixed routes, since pinning to IPFS and reporting per-chain
subgraph health have nothing chain-specific about the route itself. Each
route module in `src/api/routes/` exports a factory function
(`createTokensRouter(chain)` etc.) rather than a bare router, called once
per chain in `src/api/index.ts` — the closure is what makes e.g.
`GET /arc/tokens` read Arc's subgraph/addresses and `GET /ink/tokens` read
Ink's, from the same route code.

- **Activity/lifecycle data** (tokens, trades, campaigns, contributions,
  positions, pools, holders) — proxied from the chain's subgraph GraphQL
  endpoint (`src/subgraph/client.ts`, takes a `ChainSlug`), reshaped into a
  plain REST API. Only `../interface/` (Ink-only, hardcoded to `/ink/...`
  — see its `api.js`) consumes this today; nothing serves Arc data to a UI
  yet.
- **Platform config** (`platformWallet`, fees, quote-token whitelists, DEX
  wiring) — read live via `viem` RPC calls straight from the contracts
  (`src/api/routes/platform.ts`, via `src/chain/client.ts`'s per-chain
  `getPublicClient(chain)`). This is deliberately *not* pulled from the
  subgraph: it's rarely-changing owner-only config, and the subgraph
  deliberately doesn't index those setter events (see
  `../subgraph/README.md`) — a handful of on-demand `eth_call`s is simpler
  than maintaining entities for it.
- **Uploads** (`src/api/routes/upload.ts`) — pins images/metadata to IPFS
  via Pinata for token creation. Chain-agnostic, never touched chain data or
  a database.

Both the RPC client and the subgraph client are lazy per-chain (throw only
when a route for that chain actually needs them, not at process startup) —
a missing `ARC_RPC_URL`/`ARC_SUBGRAPH_URL` 502s only `/arc/...` routes, it
doesn't take `/ink/...` down too.

An earlier version of this backend ran its own RPC-polling indexer writing
into Postgres (Drizzle ORM), targeting the previous HyperEVM deployment.
That's been retired in favor of the subgraph now that one exists and is
live — no reason to run two indexing pipelines for the same data.

## Local setup

```bash
cp .env.example .env   # fill in SUBGRAPH_URL, INK_RPC_URL, PINATA_JWT (+ ARC_RPC_URL/ARC_SUBGRAPH_URL for /arc routes)
npm install
npm run api:dev
```

`npm run build` type-checks and compiles to `dist/`.

## Design notes

- **Contract addresses/ABIs** live in `src/chain/addresses.ts` (an
  `ADDRESSES: Record<ChainSlug, ChainAddresses>` map, one entry per chain)
  and `src/chain/abis.ts` (shared across chains -- every function fragment
  used here has an identical signature on both Ink's and Arc's contracts,
  confirmed by diffing the two build outputs, so there's no need for a
  per-chain copy). Kept in lockstep with the
  [Duck-Family-Contract](https://github.com/timedbase/Duck-Family-Contract)
  repo's `deploy/deployments/ink.json` and `deploy-arc/deployments/arc.json`
  — if either chain's contracts are ever redeployed, update both.
- **Quote-token whitelists aren't enumerable on-chain** (`quoteTokenAllowed`
  etc. are plain mappings, no getter returns the full set) — the
  `/quote-tokens` and `/quote-assets` routes check a hardcoded candidate
  list (`DEFAULT_QUOTE_TOKENS`/`RAISE_DEFAULT_QUOTE_ASSETS` in
  `addresses.ts`, matching each contract's on-chain default) against the
  live contract state. If the owner ever adds a quote token beyond that
  default set via `setQuoteTokenAllowed`, this list needs a manual update to
  surface it — there's no way to discover it automatically without indexing
  the `QuoteTokenUpdated`/`QuoteTokenAdded`/`QuoteAssetUpdated` events (which
  the subgraph currently doesn't).
- **Subgraph errors surface as 502s.** `querySubgraph` throws on a
  GraphQL-level error or a non-OK HTTP response; every route's try/catch
  turns that into `502 { error }` rather than a raw 500, since it's an
  upstream-dependency failure, not a bug in this API.

## Deploying

`render.yaml` (Duck-Family repo root) defines this API as a web service
(Starter plan), plus the three self-hosted graph-node services Arc's
subgraph runs on (see `../subgraph-arc/README.md`). From the Render
dashboard: New → Blueprint → point at this repo → it reads `render.yaml`
from the repo root. You'll be prompted for `INK_RPC_URL`, `ARC_RPC_URL`,
and `PINATA_JWT` (all marked `sync: false`) since those are real
credentials/URLs that shouldn't live in the blueprint file.
