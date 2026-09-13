# DuckSubgraph-RH

Subgraph for DuckProtocol on Robinhood Chain (4663), deployed to Goldsky as `duck-subgraph-rh`.

Indexes every event of every DuckProtocol contract on this chain: the bonding curve, launcher and
crowdfund, the v4 hook and the PoolManager swaps in its pools, lending vaults and their
factory/config, per-token governance, and each token's transfers and holder rewards.

## Contracts

| Data source | Address |
|---|---|
| DuckBondingCurve | `0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF` |
| DuckLauncher | `0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B` |
| DuckCrowdfund | `0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9` |
| DuckHookV4 | `0x483b529fa121c5402778a511A98fB326940042CC` |
| PoolManager (Uniswap v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| DuckVaultFactory | `0x006e53d079BB4c2010682a4896D1950965faD5A5` |
| DuckVaultConfig | `0x2526d694F9b6cCefE46871D1b40aeEc1313eabfB` |
| DuckTokenGovernorFactory | `0x29e600073c29b4f646C54c78AeE97aE8AE888999` |

All start at block 61219630. `DuckToken`, `DuckVault`, `DuckTokenGovernor` and
`TimelockControllerUpgradeable` are templates, created as tokens, vaults and governors appear.

## Entities

Product activity gets typed entities: `Token`, `Holder`, `Trade` (bonding curve), `PoolSwap` (v4
pool), `TokenHourData`, `Migration`, `Launch`, `Campaign` with its contributions/claims/refunds,
`PoolRegistration`, `HookFeeClaim`, `CTOEvent`, `HookBuybackBurn`, holder rewards
(`HolderRewardRound`, `HolderRewardDeposit`, `HolderRewardPayout`), vault lifecycle entities, and
governance (`Governor`, `Timelock`, `Proposal`, `Vote`, `TimelockOperation`). Every remaining
config or admin event is stored as an `AdminEvent`, queryable by contract and event name.

## USD pricing

Prices are recorded both in quote units per token and in USD. Stablecoins (USDG and U) count as
exactly $1. ETH/USD comes from the WETH/USDG v3 pool. Every other curated quote token is priced from its deepest
reference pool, against ETH or a stablecoin; `QuotePrice` holds the latest reference price and
`EthReferencePool` the per-pool ETH prices.

Trades and pool swaps store `priceUSD` and `volumeUSD` at trade time, and tokens carry
`lastPriceUSD`, `marketCapUSD` and `volumeUSDAllTime`. A quote token with no curated reference (for
example an arbitrary token picked in the launcher) gets one discovered automatically: its deepest
Uniswap v3 pool against WETH or a $1 stablecoin, or v4 pool against native ETH, looked up when the
token is first used and retried at most every 6 hours while none exists. Discovered prices have no
minimum depth and are marked `origin: DISCOVERED` with the pool's depth, because a thin pool can show a
misleading USD value. Reference
prices move only when their pool trades and can be pushed by a large swap, so they are for display,
not for anything that settles value.

## Build and deploy

```
npm install
npm run codegen
npm run build
npm run deploy     # new Goldsky version, tagged "current"
```

This folder is generated, together with its sibling, by `../gen_subgraphs.py`; change the
generator and rerun it rather than editing one folder, so both chains stay identical.
