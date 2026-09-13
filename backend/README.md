# duckpad.fun backend

A small Express API (Node/TypeScript) for DuckProtocol on **Robinhood Chain (4663)** and
**Ink (57073)**. Meant to run on Render's Starter plan, per `render.yaml` at the repo root.

## Architecture

There is no indexer here. Chain activity is indexed by one subgraph per chain
(`../subgraph/DuckSubgraph-RH` and `../subgraph/DuckSubgraph-Ink`, both on Goldsky); this API
is a thin layer in front of them plus a handful of live contract reads.

**Every data route is chain-scoped** under `/robinhood` or `/ink` (see `src/chain/registry.ts`).
`/upload` and `/health` are the only unprefixed routes. Each module in `src/api/routes/` exports
a factory (`createTokensRouter(chain)` etc.) called once per chain in `src/api/index.ts`.

- **Activity data** (tokens, trades, pool swaps, campaigns, holders, vaults, proposals) — proxied
  from the chain's subgraph (`src/subgraph/client.ts`) and reshaped into REST.
- **USD pricing** — native to the subgraph. Every trade is valued at its quote token's reference
  price at trade time, so `lastPriceUSD`, `marketCapUSD` and the `volumeUSD` fields come straight
  from the index. `src/chain/price.ts` uses the same `QuotePrice` entities for the create form's
  USD → raw-units conversion (stablecoins are $1; other quote tokens carry `priceUSD` or `priceETH`
  × the ETH price). A quote token with no reference price is unpriced (`null`), never guessed.
- **Platform config** (fees, platform wallet, DEX wiring, quote-token allow-lists, vault risk
  parameters) — read live via `viem` multicalls (`src/api/routes/platform.ts`).
- **Uploads** (`src/api/routes/upload.ts`) — pins images/metadata to IPFS via Pinata.
- **Comments** — the only Postgres-backed subsystem (`src/db`), keyed by chain + token.

RPC and subgraph URLs have per-chain defaults (public RPC, Goldsky `current` tag), overridable by
`ROBINHOOD_RPC_URL` / `INK_RPC_URL` and `ROBINHOOD_SUBGRAPH_URL` / `INK_SUBGRAPH_URL`.

## Local setup

```bash
cp .env.example .env   # PINATA_JWT, DATABASE_URL, dedicated RPC URLs
npm install
npm run api:dev
```

`npm run build` type-checks and compiles to `dist/`.

## Design notes

- **Addresses** live in `src/chain/addresses.ts`. Everything except `DuckHookV4` was deployed via
  CREATE2 from one deployer, so the protocol addresses are identical on both chains; the hook,
  WETH and the Uniswap periphery differ per chain.
- **ABIs** in `src/chain/abis-json/` are the `abi` field of `DuckProtocol/deploy/out`, the same
  build the subgraphs index. Refresh them after any contract change.
- **Quote-token allow-lists aren't enumerable on-chain.** `/quote-tokens` checks the curated
  `DEFAULT_QUOTE_TOKENS` against each family's live mapping. Launcher's `launch()` never checks its
  list, so any token can be a launcher quote asset.
- **Subgraph errors surface as 502s.**
