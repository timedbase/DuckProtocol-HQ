import { getAddress } from "viem";

// Mirrors ../../../backend/src/chain/addresses.ts and the Duck-Protocol
// repo's deploy/deployments/robinhood.json -- same deployment, cross-repo
// consumers. DuckProtocol is Robinhood Chain only (chain id 4663) -- unlike
// the legacy launchpad, there is no multi-chain registry here.

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Every pool this platform creates uses this same 1% tier / 200 tick
// spacing convention (see DuckBondingCurve/DuckLauncher/DuckCrowdfund).
const V4_FEE_TIER = 10000;
const V4_TICK_SPACING = 200;

export const CHAIN = {
  slug: "robinhood",
  chainId: 4663,
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  blockExplorerUrl: "https://robinhoodchain.blockscout.com",
  // Real chain logo from Trust Wallet's assets repo, which indexes
  // Robinhood Chain as its own "robinhoodchain" blockchain folder --
  // verified to resolve (HTTP 200) before wiring in.
  logoUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/info/logo.png",

  DUCK_BONDING_CURVE: getAddress("0x9AE7383af6ea77037c09459a9aF8f4AEC038f083"),
  // Read-only pricing helper (getAmountOut/getAmountOutSell/getSpotPrice) --
  // split out of DuckBondingCurve itself for stack-depth reasons, unlike the
  // legacy launchpad where these lived on the main contract.
  DUCK_BONDING_CURVE_VIEWS: getAddress("0x15b11099304Ceb93aA4Ee76fc4EA08c074F9401e"),
  DUCK_LAUNCHER: getAddress("0xDA4fAD8E339d1F1f243C810CCDa29de80c5040Dc"),
  DUCK_CROWDFUND: getAddress("0x5066B217106De6f7b1A5F43eAa138C3C6306FC7d"),
  DUCK_LOCKER: getAddress("0xbaA2A0F17922729F5Aa826ec5b0B927583260E03"),
  // The default for NEW launches only -- a pool's hook is permanently bound
  // into its PoolKey at creation (Uniswap v4), so per-token reads must use
  // that token's own real hook (coin.hook / Token.hook), never this
  // constant blindly. Redeployed 2026-09-08 to add a buy-side quote fee
  // (the old hook's mined address lacked the permission bit that needs --
  // see DuckHookV4.sol's REQUIRED_PERMISSIONS comment); DUCK_HOOK_LEGACY is
  // kept only so old-hook activity is still recognized/labeled in the UI.
  DUCK_HOOK: getAddress("0xA62a288125E730622a75006ed54a3ecD73B740cc"),
  DUCK_HOOK_LEGACY: getAddress("0x2F030392B3472BbE30Dc36e960eFc226744140C4"),

  // Lending -- new in DuckProtocol, no legacy equivalent.
  DUCK_VAULT_FACTORY: getAddress("0xeB191E04445046cDD3f21Bae6e79Ef78bE08D28F"),
  DUCK_VAULT_CONFIG: getAddress("0x74738a87e4D4E0eB2706724a9314d1b4452ecdFE"),

  // Governance -- new in DuckProtocol, no legacy equivalent.
  DUCK_TOKEN_GOVERNOR_FACTORY: getAddress("0x6A73DA9BC5Ecb8cCD4EccEBf53e3591B2cc30D0d"),

  // EIP-1167 clone-template implementation every family clones via CREATE2
  // -- needed client-side to predict vanity token addresses before
  // submitting. DuckProtocol shares ONE DuckToken implementation across all
  // three families (unlike the legacy launchpad's three separate impls).
  DUCK_TOKEN_IMPL: getAddress("0xCA544758ADc9Ab518185FB0784D79E4884ba5cB4"),

  WETH: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  V4_POOL_MANAGER: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
  V4_POSITION_MANAGER: getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
  V4_STATE_VIEW: getAddress("0xF3334192D15450CdD385c8B70e03f9A6bD9E673b"),
  PERMIT2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  // Real V4 periphery on Robinhood Chain, from Uniswap's own official
  // deployments list (developers.uniswap.org/docs/protocols/v4/deployments)
  // -- cross-verified against this file's own already-correct V4_POOL_MANAGER/
  // V4_POSITION_MANAGER/V4_STATE_VIEW (identical values), and confirmed to
  // have real deployed bytecode via a live eth_getCode call before being
  // wired in. Without these, chain/dex.js's post-migration/instant/crowdfund
  // pool trading (buyOnPoolDirect/sellOnPoolDirect) can't run at all --
  // requireRouterAndQuoter throws "Pool trading isn't available on this
  // chain yet" the moment either is missing, exactly the gap these fix.
  UNIVERSAL_ROUTER: getAddress("0x8876789976deCBFCbBbE364623c63652DB8c0904"),
  V4_QUOTER: getAddress("0x8dc178EFb8111bB0973dd9d722ebeFF267c98f94"),
  V4_FEE_TIER,
  V4_TICK_SPACING,

  // Seeded as defaults on DuckLauncher/DuckBondingCurve/DuckCrowdfund at
  // deploy time (see deploy/script/DeployDuckProtocol.s.sol) -- real,
  // verified Robinhood Chain tokens, not fabricated. Launcher additionally
  // accepts ANY quote token beyond this list (its allow-list isn't
  // enforced at launch time); bonding curve and crowdfund stay curated to
  // exactly this set unless the owner adds more via setQuoteTokenAllowed/
  // setQuoteAssetAllowed.
  DEFAULT_QUOTE_TOKENS: [
    { address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"), symbol: "USDG", decimals: 6 },
    { address: getAddress("0x492641F648a4986844848E0beFE66D14817bCE34"), symbol: "LINK", decimals: 18 },
    { address: getAddress("0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67"), symbol: "TAO", decimals: 18 },
    { address: getAddress("0x39dBED3a2bd333467115dE45665cC57F813C4571"), symbol: "PONS", decimals: 18 },
    { address: getAddress("0x020bfC650A365f8BB26819deAAbF3E21291018b4"), symbol: "CASHCAT", decimals: 18 },
    { address: getAddress("0x56910D4409F3a0C78C64DD8D0545FF0705389870"), symbol: "INDEX", decimals: 18 },
    { address: getAddress("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C"), symbol: "SPY", decimals: 18 },
    { address: getAddress("0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"), symbol: "NVDA", decimals: 18 },
    { address: getAddress("0x322F0929c4625eD5bAd873c95208D54E1c003b2d"), symbol: "TSLA", decimals: 18 },
    { address: getAddress("0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa"), symbol: "SPCX", decimals: 18 },
    { address: getAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"), symbol: "AAPL", decimals: 18 },
  ],

  // No default route seeded on any family (see DeployDuckProtocol.s.sol's
  // own comment -- guessing real pool fee/tickSpacing would mean fabricating
  // data). Until setRoutes is called for a given quote asset, only bonding
  // curve's/crowdfund's optional buyWithNative helper for THAT asset will
  // fail closed; direct ERC20-denominated contribute/buy always works.
  NATIVE_EXTERNAL_ROUTE: null,

};

// Bonding curve and crowdfund stay curated (owner-controlled allow-list,
// enforced on-chain); launcher is permissionless for quote token choice
// (see DuckLauncher.sol -- no allow-list check in _setupAndRegister), so its
// create-form picker offers the curated defaults as suggestions plus a
// free-form address field, not a closed list.
CHAIN.BONDING_CURVE_QUOTE_TOKENS = CHAIN.DEFAULT_QUOTE_TOKENS;
CHAIN.CROWDFUND_QUOTE_TOKENS = CHAIN.DEFAULT_QUOTE_TOKENS;
CHAIN.LAUNCHER_QUOTE_TOKENS = CHAIN.DEFAULT_QUOTE_TOKENS;
CHAIN.LAUNCHER_QUOTE_TOKEN_ALLOWLIST_ENFORCED = false;
// Legacy launchpad names, kept as aliases so App.jsx's existing create-form
// wiring (still using the DuckIncubation/DuckRaise-era field names) doesn't
// need a wholesale rewrite just to stop crashing -- same underlying lists.
CHAIN.INCUBATION_QUOTE_TOKENS = CHAIN.BONDING_CURVE_QUOTE_TOKENS;
CHAIN.RAISE_QUOTE_TOKENS = CHAIN.CROWDFUND_QUOTE_TOKENS;
// DuckProtocol has no separate "tokenized stock" bucket -- SPY/AAPL/TSLA/
// NVDA/SPCX already live directly in DEFAULT_QUOTE_TOKENS above.
CHAIN.STOCK_QUOTE_TOKENS = [];
CHAIN.LIQUID_QUOTE_TOKEN_SYMBOLS = [];

// Supply tier menu -- see common/SupplyTiers.sol. Index is what every
// createToken/launch/campaign-launch call takes, not a raw totalSupply.
export const SUPPLY_TIERS = [
  { index: 0, label: "1B" },
  { index: 1, label: "10B" },
  { index: 2, label: "100B" },
  { index: 3, label: "1T" },
  { index: 4, label: "10T" },
  { index: 5, label: "100T" },
  { index: 6, label: "1Q" },
];

// vaultBps menu -- see lending/DuckVault.sol / the family launch params.
// 0/1000/5000/10000 = 100/0, 90/10, 50/50, 0/100 creator/vault split.
export const VAULT_BPS_OPTIONS = [
  { bps: 0, label: "100% creator / 0% vault" },
  { bps: 1000, label: "90% creator / 10% vault" },
  { bps: 5000, label: "50% creator / 50% vault" },
  { bps: 10000, label: "0% creator / 100% vault" },
];

export function isChainSlug(value) {
  return value === "robinhood";
}
