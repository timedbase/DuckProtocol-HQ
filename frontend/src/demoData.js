// Canned, clearly-fake data for VITE_DEMO_MODE (see api.js). Every page can
// render and be clicked through against this while the real backend routes
// for DuckProtocol are still being built out. Shapes here mirror what a
// real /tokens, /campaigns, /portfolio, etc. response looks like -- nothing
// downstream (adapters.js, App.jsx, pages/*) needs to know demo mode exists.

import { CHAIN } from "./chain/addresses.js";

const NOW = Math.floor(Date.now() / 1000);
const DEAD = "0x000000000000000000000000000000000000dead";

function addr(seed) {
  return "0x" + seed.repeat(40).slice(0, 40);
}

const USDG = CHAIN.DEFAULT_QUOTE_TOKENS[0].address;
const AAPL_Q = CHAIN.DEFAULT_QUOTE_TOKENS.find((t) => t.symbol === "AAPL")?.address || CHAIN.DEFAULT_QUOTE_TOKENS[0].address;
const LINK_Q = CHAIN.DEFAULT_QUOTE_TOKENS.find((t) => t.symbol === "LINK")?.address || CHAIN.DEFAULT_QUOTE_TOKENS[0].address;

// Demo-only USD prices per quote asset -- plausible, round figures (not
// live-fetched, since demo mode never hits the network), used consistently
// everywhere a quote asset's USD value matters: card mcap/volume below AND
// the create-form's live preview (see DEMO.quotePrices/convertUsdToQuoteUnits
// further down). Real mode gets these from GeckoTerminal (chain/price.ts on
// the backend) instead -- see this file's own top-of-file comment.
const DEMO_QUOTE_USD = {
  "0x0000000000000000000000000000000000000000": 2492.28, // native ETH
  [USDG.toLowerCase()]: 1.0006, // USDG, ~$1 peg
  [LINK_Q.toLowerCase()]: 7.48,
  [AAPL_Q.toLowerCase()]: 230, // wAAPL
};

const DEMO_TOKENS = [
  {
    id: addr("a1"),
    family: "CURVE",
    creator: addr("c1"),
    name: "Quackers",
    symbol: "QUACK",
    quoteToken: "0x0000000000000000000000000000000000000000",
    totalSupply: (1_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: "0",
    virtualQuote: (1n * 10n ** 18n).toString(),
    migrationTarget: (10n * 10n ** 18n).toString(),
    raisedQuote: (3.2 * 1e18).toString(),
    migrated: false,
    createdAt: String(NOW - 3600 * 6),
    lastTradeAt: String(NOW - 120),
    lastPrice: "0.0000041",
    lastPriceUsd: 0.0000041 * 2492.28,
    volume24h: (1.8 * 1e18).toString(),
    volume24hUsd: String(1.8 * 2492.28),
    volumeAllTime: (9.4 * 1e18).toString(),
    volumeAllTimeUsd: String(9.4 * 2492.28),
    priceChange24h: 18.4,
    priceChange24hUsd: 18.4,
    holderCount: "212",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: { twitter: "https://x.com/duckprotocol", website: "https://quackers.fun" },
  },
  {
    id: addr("a2"),
    family: "INSTANT",
    creator: addr("c2"),
    name: "Robin Hood Duck",
    symbol: "RHOOD",
    quoteToken: USDG,
    totalSupply: (10_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: (12_000n * 10n ** 18n).toString(),
    migrated: true,
    poolId: "0x" + "b2".repeat(32),
    hook: CHAIN.DUCK_HOOK,
    createdAt: String(NOW - 3600 * 30),
    lastTradeAt: String(NOW - 45),
    lastPrice: "0.00821",
    lastPriceUsd: 0.00821 * 1.0006, // USDG-quoted -- pegged ~$1
    volume24h: (54_000 * 1e6).toString(),
    volume24hUsd: String(54_000 * 1.0006),
    volumeAllTime: (1_240_000 * 1e6).toString(),
    volumeAllTimeUsd: String(1_240_000 * 1.0006),
    priceChange24h: -6.1,
    priceChange24hUsd: -6.1,
    holderCount: "1884",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: { twitter: "https://x.com/duckprotocol", telegram: "https://t.me/duckprotocol", website: "https://robinhoodduck.fun" },
  },
  {
    id: addr("a3"),
    family: "INSTANT",
    creator: addr("c3"),
    name: "wAAPL Ducks",
    symbol: "DAAPL",
    quoteToken: AAPL_Q,
    totalSupply: (1_000_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: "0",
    migrated: true,
    poolId: "0x" + "b3".repeat(32),
    hook: CHAIN.DUCK_HOOK,
    createdAt: String(NOW - 3600 * 2),
    lastTradeAt: String(NOW - 300),
    lastPrice: "0.000000241",
    lastPriceUsd: 0.000000241 * DEMO_QUOTE_USD[AAPL_Q.toLowerCase()],
    volume24h: (410 * 1e18).toString(),
    volume24hUsd: String(410 * DEMO_QUOTE_USD[AAPL_Q.toLowerCase()]),
    volumeAllTime: (410 * 1e18).toString(),
    volumeAllTimeUsd: String(410 * DEMO_QUOTE_USD[AAPL_Q.toLowerCase()]),
    priceChange24h: 142.0,
    priceChange24hUsd: 142.0,
    holderCount: "37",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: {},
  },
  {
    id: addr("a4"),
    family: "CAMPAIGN",
    creator: addr("c4"),
    quoteToken: "0x0000000000000000000000000000000000000000",
    totalSupply: (1_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: "0",
    migrated: false,
    createdAt: String(NOW - 3600 * 12),
    lastTradeAt: null,
    lastPrice: null,
    lastPriceUsd: null, // no market yet -- pre-launch campaign, honestly unpriced
    volume24h: "0",
    volume24hUsd: "0",
    volumeAllTime: "0",
    volumeAllTimeUsd: "0",
    priceChange24h: null,
    priceChange24hUsd: null,
    holderCount: "58",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: { twitter: "https://x.com/duckprotocol", telegram: "https://t.me/duckprotocol", website: "https://duckfederalcreditunion.fun" },
    campaign: {
      id: "1",
      name: "Duck Federal Credit Union",
      symbol: "DFCU",
      succeeded: false,
      failed: false,
      deadline: String(NOW + 3600 * 20),
      goal: (100 * 1e18).toString(),
      goalUsd: String(100 * DEMO_QUOTE_USD["0x0000000000000000000000000000000000000000"]),
      totalRaised: (63.5 * 1e18).toString(),
      totalRaisedUsd: String(63.5 * DEMO_QUOTE_USD["0x0000000000000000000000000000000000000000"]),
    },
  },
  // A BondingCurve-family token that has ALREADY MIGRATED -- QUACK above is
  // the only other CURVE entry and it's still pre-migration, so nothing
  // previously exercised "what a post-migration bonding-curve token page
  // looks like" (TokenPage.jsx's "Migrated to Uniswap V4" / "LP LOCKED
  // FOREVER" branch, real-V4-pool buy/sell routing instead of curve calls --
  // see App.jsx's `isPool = family === "INSTANT" || (family === "CURVE" &&
  // migrated)`). raisedQuote is set >= migrationTarget, matching a curve
  // that actually filled and crossed over.
  {
    id: addr("a5"),
    family: "CURVE",
    creator: addr("c5"),
    name: "Migrated Mallard",
    symbol: "MALLARD",
    quoteToken: LINK_Q,
    totalSupply: (1_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: "0",
    virtualQuote: (1_000 * 1e18).toString(),
    migrationTarget: (8_000 * 1e18).toString(),
    raisedQuote: (8_000 * 1e18).toString(),
    migrated: true,
    poolId: "0x" + "a5".repeat(32),
    hook: CHAIN.DUCK_HOOK,
    createdAt: String(NOW - 3600 * 24 * 4),
    lastTradeAt: String(NOW - 90),
    lastPrice: "0.00112", // 1e9 total supply * this ~= an $8.4M mcap, not the $12B a stray "1.62" produced
    lastPriceUsd: 0.00112 * DEMO_QUOTE_USD[LINK_Q.toLowerCase()],
    volume24h: (3_400 * 1e18).toString(),
    volume24hUsd: String(3_400 * DEMO_QUOTE_USD[LINK_Q.toLowerCase()]),
    volumeAllTime: (61_000 * 1e18).toString(),
    volumeAllTimeUsd: String(61_000 * DEMO_QUOTE_USD[LINK_Q.toLowerCase()]),
    priceChange24h: 24.9,
    priceChange24hUsd: 24.9,
    holderCount: "893",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: { twitter: "https://x.com/duckprotocol", website: "https://migratedmallard.fun" },
  },
  // A Crowdfund raise that already SUCCEEDED and is now trading live on its
  // real V4 pool -- DFCU above is still an ONGOING raise (succeeded: false,
  // deadline in the future), so nothing previously exercised
  // CampaignPage.jsx's post-success state (claim button, "TRADEABLE: yes",
  // "Goal cleared" timeline dot -- see App.jsx's buildCampaignModel). Note:
  // CAMPAIGN-family tokens always route to CampaignPage, never TokenPage
  // (App.jsx's openToken), regardless of succeeded/failed -- this is the
  // right page for "a raise, live on dex" to actually show up on.
  {
    id: addr("a6"),
    family: "CAMPAIGN",
    creator: addr("c6"),
    quoteToken: USDG,
    totalSupply: (1_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: "0",
    migrated: true,
    poolId: "0x" + "a6".repeat(32),
    hook: CHAIN.DUCK_HOOK,
    createdAt: String(NOW - 3600 * 24 * 9),
    lastTradeAt: String(NOW - 200),
    lastPrice: "0.00095",
    lastPriceUsd: 0.00095 * DEMO_QUOTE_USD[USDG.toLowerCase()],
    volume24h: (2_150 * 1e6).toString(),
    volume24hUsd: String(2_150 * DEMO_QUOTE_USD[USDG.toLowerCase()]),
    volumeAllTime: (18_400 * 1e6).toString(),
    volumeAllTimeUsd: String(18_400 * DEMO_QUOTE_USD[USDG.toLowerCase()]),
    priceChange24h: 5.3,
    priceChange24hUsd: 5.3,
    holderCount: "441",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: null,
    socials: { twitter: "https://x.com/duckprotocol", telegram: "https://t.me/duckprotocol", website: "https://duckreservebank.fun" },
    campaign: {
      id: "2",
      name: "Duck Reserve Bank",
      symbol: "DRB",
      succeeded: true,
      failed: false,
      deadline: String(NOW - 3600 * 24 * 2),
      goal: (75_000 * 1e6).toString(),
      goalUsd: String(75_000 * DEMO_QUOTE_USD[USDG.toLowerCase()]),
      totalRaised: (91_200 * 1e6).toString(),
      totalRaisedUsd: String(91_200 * DEMO_QUOTE_USD[USDG.toLowerCase()]),
    },
  },
  // The platform's own token ("The Duck", $DUCK) -- not real yet on any
  // chain (chain.PLATFORM_TOKEN stays null until it actually launches, see
  // chain/addresses.js), but demo mode shows what Discover's hero slot
  // looks like once it is, the same way DEMO_VAULTS/DEMO_PROPOSALS preview
  // lending/governance ahead of real usage. Appended last so it never
  // shifts DEMO_VAULTS/DEMO_PROPOSALS' DEMO_TOKENS[n] index references
  // above. Real socials (already linked from the app's own footer), no
  // fabricated website.
  {
    id: addr("dc"),
    family: "INSTANT",
    creator: addr("c0"),
    name: "The Duck",
    symbol: "DUCK",
    // Mirrors the real backend: the ONLY token ever marked verified, gated
    // there off a deploy-time env var (DUCK_TOKEN_ADDRESS), never inferred
    // client-side. Every other demo token below is deliberately unverified.
    verified: true,
    quoteToken: "0x0000000000000000000000000000000000000000",
    totalSupply: (1_000_000_000n * 10n ** 18n).toString(),
    burnedSupply: (25_000_000n * 10n ** 18n).toString(),
    migrated: true,
    poolId: "0x" + "dc".repeat(32),
    hook: CHAIN.DUCK_HOOK,
    createdAt: String(NOW - 3600 * 24 * 21),
    lastTradeAt: String(NOW - 30),
    lastPrice: "0.0142",
    lastPriceUsd: 0.0142 * 2492.28,
    volume24h: (86 * 1e18).toString(),
    volume24hUsd: String(86 * 2492.28),
    volumeAllTime: (312_000 * 1e18).toString(),
    volumeAllTimeUsd: String(312_000 * 2492.28),
    priceChange24h: 9.7,
    priceChange24hUsd: 9.7,
    holderCount: "6420",
    metaUri: null,
    metaOverrideUri: null,
    imageUrl: "/duckfun-logo.png",
    socials: { twitter: "https://x.com/duckfunfamily", telegram: "https://t.me/DuckFunFamily" },
  },
];

// Demo-only placeholder for chain.PLATFORM_TOKEN (which stays null for
// real until $DUCK actually launches on-chain) -- see api.js's
// platformTokenAddress().
export const DEMO_DUCK_ADDRESS = DEMO_TOKENS[DEMO_TOKENS.length - 1].id;

const DEMO_TRADES = [
  { side: "BUY", trader: addr("d1"), timestamp: String(NOW - 60), quoteAmount: (0.42 * 1e18).toString(), tokenAmount: (102_000 * 1e18).toString() },
  { side: "SELL", trader: addr("d2"), timestamp: String(NOW - 300), quoteAmount: (0.11 * 1e18).toString(), tokenAmount: (26_500 * 1e18).toString() },
  { side: "BUY", trader: addr("d3"), timestamp: String(NOW - 900), quoteAmount: (1.05 * 1e18).toString(), tokenAmount: (250_000 * 1e18).toString() },
  { side: "BUY", trader: DEAD, timestamp: String(NOW - 2400), quoteAmount: (0.02 * 1e18).toString(), tokenAmount: (5_000 * 1e18).toString() },
  { side: "SELL", trader: addr("d4"), timestamp: String(NOW - 5200), quoteAmount: (0.6 * 1e18).toString(), tokenAmount: (140_000 * 1e18).toString() },
];

const DEMO_HOLDERS = [
  { account: CHAIN.DUCK_LOCKER, balance: (200_000_000n * 10n ** 18n).toString() },
  { account: DEAD, balance: (50_000_000n * 10n ** 18n).toString() },
  { account: addr("e1"), balance: (38_000_000n * 10n ** 18n).toString() },
  { account: addr("e2"), balance: (12_400_000n * 10n ** 18n).toString() },
  { account: addr("e3"), balance: (6_100_000n * 10n ** 18n).toString() },
];

const DEMO_COMMENTS = [
  { wallet: addr("f1"), holdPct: 2.4, timestamp: String(NOW - 400), body: "this one's actually moving, nice" },
  { wallet: "anon", holdPct: null, timestamp: String(NOW - 1800), body: "wen migration" },
  { wallet: addr("f2"), holdPct: 0.03, timestamp: String(NOW - 5400), body: "real quote-asset contribution, no sandwich risk on the raise — solid" },
];

// ---- Lending -----------------------------------------------------------

const DEMO_VAULTS = [
  {
    token: DEMO_TOKENS[1].id, // RHOOD, USDG-quoted, migrated
    vault: addr("20"),
    enabled: true,
    currency: USDG,
    currencySymbol: "USDG",
    currencyDecimals: 6,
    poolId: DEMO_TOKENS[1].poolId,
    totalReserves: (18_400 * 1e6).toString(),
    totalBorrows: (7_650 * 1e6).toString(),
    totalCollateral: (2_400_000 * 1e18).toString(),
    vaultBps: 1000, // 90/10 creator/vault
    loans: [
      { borrower: addr("e1"), collateral: (900_000 * 1e18).toString(), principal: (2_100 * 1e6).toString(), debt: (2_143 * 1e6).toString(), healthFactorBps: 8200 },
      { borrower: addr("e2"), collateral: (410_000 * 1e18).toString(), principal: (1_450 * 1e6).toString(), debt: (1_477 * 1e6).toString(), healthFactorBps: 7600 },
      { borrower: addr("e3"), collateral: (60_000 * 1e18).toString(), principal: (980 * 1e6).toString(), debt: (1_012 * 1e6).toString(), healthFactorBps: 5900 },
    ],
  },
  {
    token: DEMO_TOKENS[2].id, // DAAPL, AAPL-quoted, migrated
    vault: addr("21"),
    enabled: true,
    currency: AAPL_Q,
    currencySymbol: "AAPL",
    currencyDecimals: 18,
    poolId: DEMO_TOKENS[2].poolId,
    totalReserves: (340 * 1e18).toString(),
    totalBorrows: (52 * 1e18).toString(),
    totalCollateral: (180_000_000_000 * 1e18).toString(),
    vaultBps: 5000, // 50/50 creator/vault
    loans: [
      { borrower: addr("e4"), collateral: (40_000_000_000 * 1e18).toString(), principal: (18 * 1e18).toString(), debt: (18.4 * 1e18).toString(), healthFactorBps: 9100 },
    ],
  },
  {
    // QUACK -- still pre-migration on the bonding curve, vault created but
    // not yet linked to a real pool (no live TWAP oracle to price collateral
    // against yet), matching DuckVault's real two-phase creation.
    token: DEMO_TOKENS[0].id,
    vault: addr("22"),
    enabled: false,
    currency: null,
    currencySymbol: null,
    currencyDecimals: 18,
    poolId: null,
    totalReserves: "0",
    totalBorrows: "0",
    totalCollateral: "0",
    vaultBps: 1000,
    loans: [],
  },
];

function summarizeVault(vv) {
  const t = findToken(vv.token);
  const reserves = vv.currencyDecimals ? Number(vv.totalReserves) / 10 ** vv.currencyDecimals : 0;
  const borrows = vv.currencyDecimals ? Number(vv.totalBorrows) / 10 ** vv.currencyDecimals : 0;
  const utilizationBps = reserves + borrows > 0 ? Math.round((borrows / (reserves + borrows)) * 10000) : 0;
  return {
    token: { id: t.id, name: t.name, symbol: t.symbol },
    vault: vv.vault,
    enabled: vv.enabled,
    currency: vv.currency,
    currencySymbol: vv.currencySymbol,
    currencyDecimals: vv.currencyDecimals,
    poolId: vv.poolId,
    totalReserves: vv.totalReserves,
    totalBorrows: vv.totalBorrows,
    totalCollateral: vv.totalCollateral,
    utilizationBps,
    vaultBps: vv.vaultBps,
    borrowerCount: vv.loans.length,
  };
}

// ---- Governance ----------------------------------------------------------

const DEMO_PROPOSALS = [
  {
    id: "1",
    governor: addr("30"),
    vault: addr("20"),
    token: DEMO_TOKENS[1].id,
    proposer: addr("31"),
    description: "Withdraw 500 USDG in accrued vault reserves to the community treasury for a marketing push",
    targets: [addr("20")],
    canceled: false,
    queued: true,
    executed: false,
    voteStart: String(NOW - 3600 * 30),
    voteEnd: String(NOW - 3600 * 6),
    etaSeconds: String(NOW + 3600 * 96), // still inside the 5-day timelock
    votesFor: (420_000_000 * 1e18).toString(),
    votesAgainst: (12_000_000 * 1e18).toString(),
    votesAbstain: (3_000_000 * 1e18).toString(),
    circulatingSupply: (990_000_000 * 1e18).toString(),
    participantCount: 61,
    eligibleHolders: 1884,
  },
  {
    id: "2",
    governor: addr("30"),
    vault: addr("20"),
    token: DEMO_TOKENS[1].id,
    proposer: addr("32"),
    description: "Reduce close factor to lower liquidation severity during volatile periods",
    targets: [CHAIN.DUCK_VAULT_CONFIG],
    canceled: false,
    queued: false,
    executed: false,
    voteStart: String(NOW - 3600 * 2),
    voteEnd: String(NOW + 3600 * 46),
    etaSeconds: null,
    votesFor: (95_000_000 * 1e18).toString(),
    votesAgainst: (140_000_000 * 1e18).toString(),
    votesAbstain: (1_000_000 * 1e18).toString(),
    circulatingSupply: (990_000_000 * 1e18).toString(),
    participantCount: 22,
    eligibleHolders: 1884,
  },
  {
    id: "3",
    governor: addr("33"),
    vault: addr("21"),
    token: DEMO_TOKENS[2].id,
    proposer: addr("34"),
    description: "Withdraw 40 AAPL in vault reserves to seed a liquidity incentive program",
    targets: [addr("21")],
    canceled: false,
    queued: false,
    executed: true,
    voteStart: String(NOW - 3600 * 240),
    voteEnd: String(NOW - 3600 * 216),
    etaSeconds: String(NOW - 3600 * 96),
    votesFor: (150_000_000_000 * 1e18).toString(),
    votesAgainst: (2_000_000_000 * 1e18).toString(),
    votesAbstain: "0",
    circulatingSupply: (180_000_000_000 * 1e18).toString(),
    participantCount: 19,
    eligibleHolders: 37,
  },
];

function proposalStatus(p) {
  if (p.canceled) return "Canceled";
  if (p.executed) return "Executed";
  if (p.queued) return "Queued";
  const now = NOW;
  if (Number(p.voteStart) > now) return "Pending";
  if (Number(p.voteEnd) > now) return "Active";
  return "Awaiting queue";
}

function summarizeProposal(p) {
  const forVotes = Number(p.votesFor);
  const againstVotes = Number(p.votesAgainst);
  const abstainVotes = Number(p.votesAbstain);
  const circulating = Number(p.circulatingSupply);
  const forShareBps = circulating > 0 ? Math.round((forVotes / circulating) * 10000) : 0;
  const participantShareBps = p.eligibleHolders > 0 ? Math.round((p.participantCount / p.eligibleHolders) * 10000) : 0;
  return {
    ...p,
    status: proposalStatus(p),
    forVotes, againstVotes, abstainVotes,
    forShareBps, participantShareBps,
    // Quorum, per DuckTokenGovernor: >=40% of circulating supply voting FOR
    // AND >=40% of distinct holders (by headcount) participating.
    quorumSupplyMet: forShareBps >= 4000,
    quorumHeadcountMet: participantShareBps >= 4000,
  };
}

function findToken(address) {
  return DEMO_TOKENS.find((t) => t.id.toLowerCase() === String(address).toLowerCase()) || DEMO_TOKENS[0];
}

export const DEMO = {
  tokens: () => DEMO_TOKENS,
  token: (address) => ({ ...findToken(address), pool: findToken(address).poolId ? { id: findToken(address).poolId } : null }),
  trades: (_address, limit, offset) => ({ items: DEMO_TRADES.slice(offset, offset + limit), total: DEMO_TRADES.length }),
  holders: (_address, limit, offset) => ({ items: DEMO_HOLDERS.slice(offset, offset + limit), total: DEMO_HOLDERS.length }),
  comments: (_address, limit, offset) => ({ items: DEMO_COMMENTS.slice(offset, offset + limit), total: DEMO_COMMENTS.length }),
  postComment: (_address, wallet, body) => ({ wallet: wallet || "anon", holdPct: null, timestamp: String(NOW), body }),

  campaigns: () => DEMO_TOKENS.filter((t) => t.family === "CAMPAIGN").map((t) => ({ ...t.campaign, token: { id: t.id } })),
  campaign: (id) => {
    const t = DEMO_TOKENS.find((x) => x.campaign?.id === String(id)) || DEMO_TOKENS.find((x) => x.family === "CAMPAIGN");
    // totalSupply was missing here entirely -- App.jsx's buildCampaignModel
    // reads detail.totalSupply for the "ESCROWED SUPPLY" stat, and
    // Number(undefined) is NaN, not null, so the "no data yet" fallback
    // never kicked in. Only surfaced once a campaign in the SUCCEEDED state
    // actually got exercised -- an ongoing raise's own missing-data paths
    // happened to hide it.
    return { ...t.campaign, token: { id: t.id }, totalSupply: t.totalSupply, creator: t.creator, dexQuoteAsset: t.quoteToken, contributorBps: 8000, lpBps: 2000, hookFeeBps: 0 };
  },

  portfolio: (_address) => ({
    created: [DEMO_TOKENS[0]].map((t) => ({ id: t.id, family: t.family, createdAt: t.createdAt })),
    holdings: [
      { token: { id: DEMO_TOKENS[1].id }, balance: (4_200_000n * 10n ** 18n).toString() },
      { token: { id: DEMO_TOKENS[0].id }, balance: (18_000n * 10n ** 18n).toString() },
    ],
    contributions: [
      {
        campaign: { ...DEMO_TOKENS[3].campaign, token: { id: DEMO_TOKENS[3].id } },
        amount: (5 * 1e18).toString(),
        claimed: false,
        refunded: false,
      },
    ],
  }),

  quoteTokens: (family) => [
    { address: "0x0000000000000000000000000000000000000000", symbol: CHAIN.nativeSymbol, allowed: true },
    ...CHAIN.DEFAULT_QUOTE_TOKENS.map((t) => ({ address: t.address, symbol: t.symbol, allowed: family !== "launcher" ? true : true })),
  ],

  // Real prices spot-checked against GeckoTerminal's live Robinhood Chain
  // data during this feature's build (USDG ~$1 peg, LINK ~$7.48, native
  // ETH ~$2492) -- kept honest here too rather than round demo numbers, so
  // the create-form's live "≈" preview looks like what production actually
  // returns. Anything not in this small curated map (a creator-pasted
  // custom launcher quote token) is genuinely unpriceable in demo mode,
  // same as a real GeckoTerminal miss -- returns null, never a guess.
  quotePrices: (addresses) => ({
    prices: Object.fromEntries(addresses.map((a) => [a, DEMO_QUOTE_USD[a.toLowerCase()] ?? null])),
  }),
  convertUsdToQuoteUnits: (quoteToken, usd) => {
    const price = DEMO_QUOTE_USD[quoteToken.toLowerCase()];
    if (!price) return null;
    const curated = CHAIN.DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === quoteToken.toLowerCase());
    const decimals = curated ? curated.decimals : 18;
    const raw = BigInt(Math.round((usd / price) * 10 ** decimals));
    return { raw: raw.toString(), decimals, priceUsd: price };
  },

  locker: () => ({ address: CHAIN.DUCK_LOCKER, owner: addr("11"), platformWallet: addr("12"), platformToken: null }),
  hook: () => ({ address: CHAIN.DUCK_HOOK, owner: addr("11"), platformWallet: addr("12"), ctoFee: (0.01 * 1e18).toString(), hookFeeDefaultBps: 200 }),
  curve: () => ({
    address: CHAIN.DUCK_BONDING_CURVE,
    platformWallet: addr("12"),
    platformToken: null,
    creationFee: (0.0005 * 1e18).toString(),
    dex: { positionManager: CHAIN.V4_POSITION_MANAGER, singleton: CHAIN.V4_POOL_MANAGER, permit2: CHAIN.PERMIT2, hook: CHAIN.DUCK_HOOK },
    vaultFactory: CHAIN.DUCK_VAULT_FACTORY,
  }),
  launcher: () => ({
    address: CHAIN.DUCK_LAUNCHER,
    platformWallet: addr("12"),
    platformToken: null,
    launchFee: (0.0005 * 1e18).toString(),
    dex: { positionManager: CHAIN.V4_POSITION_MANAGER, singleton: CHAIN.V4_POOL_MANAGER, permit2: CHAIN.PERMIT2, hook: CHAIN.DUCK_HOOK, enabled: true },
    vaultFactory: CHAIN.DUCK_VAULT_FACTORY,
    quoteTokenAllowlistEnforced: false,
  }),
  crowdfund: () => ({
    address: CHAIN.DUCK_CROWDFUND,
    platformWallet: addr("12"),
    platformToken: null,
    campaignFee: (0.0005 * 1e18).toString(),
    campaignDurationSeconds: 7200,
    contributorBps: 8000,
    lpBps: 2000,
    vaultFactory: CHAIN.DUCK_VAULT_FACTORY,
  }),
  vaultFactory: () => ({ address: CHAIN.DUCK_VAULT_FACTORY, owner: addr("11"), config: CHAIN.DUCK_VAULT_CONFIG, hook: CHAIN.DUCK_HOOK, governorFactory: CHAIN.DUCK_TOKEN_GOVERNOR_FACTORY }),
  vaultConfig: () => ({
    address: CHAIN.DUCK_VAULT_CONFIG,
    maxLtvBps: 3000,
    liquidationThresholdBps: 7500,
    liquidationBonusBps: 800,
    closeFactorBps: 5000,
    maxBorrowerShareBps: 2500,
    maxPoolDepthShareBps: 2000,
    maxCirculatingShareBps: 1000,
    maxUtilizationBps: 9000,
    buybackBps: 2000,
  }),
  governorFactory: () => ({ address: CHAIN.DUCK_TOKEN_GOVERNOR_FACTORY, owner: addr("11"), governorImpl: addr("13"), timelockImpl: addr("14"), defaultVotingDelay: 1, defaultVotingPeriod: 50_400 }),

  vaults: () => DEMO_VAULTS.map(summarizeVault),
  vault: (tokenAddress) => {
    const vault = DEMO_VAULTS.find((x) => x.token.toLowerCase() === String(tokenAddress).toLowerCase()) || DEMO_VAULTS[0];
    return { ...summarizeVault(vault), loans: vault.loans, currencySymbol: vault.currencySymbol, currencyDecimals: vault.currencyDecimals };
  },

  proposals: (tokenAddress) => DEMO_PROPOSALS
    .filter((p) => !tokenAddress || p.token.toLowerCase() === String(tokenAddress).toLowerCase())
    .map(summarizeProposal),
  proposal: (id) => {
    const p = DEMO_PROPOSALS.find((x) => x.id === String(id)) || DEMO_PROPOSALS[0];
    return summarizeProposal(p);
  },

  stats: () => ({
    launches24h: 14,
    trades24h: 812,
    borrows24h: 6,
    proposals24h: 1,
    tradingVolume24h: [
      { symbol: "ETH", amount: 41.2 },
      { symbol: "USDG", amount: 68_400 },
    ],
    contributionVolume24h: [{ symbol: "ETH", amount: 22.6 }],
  }),
};
