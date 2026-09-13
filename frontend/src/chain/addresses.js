import { getAddress } from "viem";

// Mirrors ../../../backend/src/chain/addresses.ts -- same deployment, both chains. Everything except
// DuckHookV4 was deployed via CREATE2 from one deployer, so the protocol's own addresses are
// identical on Robinhood Chain and Ink; the hook, WETH and the Uniswap periphery differ per chain.

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Every pool this platform creates uses fee tier 0 and tick spacing 200 (see V4_FEE_TIER /
// V4_TICK_SPACING in DuckBondingCurve/DuckLauncher/DuckCrowdfund) -- there is no LP fee; the hook's
// own fee is the only trading fee.
const V4_FEE_TIER = 0;
const V4_TICK_SPACING = 200;

const SHARED = {
  DUCK_BONDING_CURVE: getAddress("0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF"),
  // Read-only pricing helper (getAmountOut/getAmountOutSell), split out of DuckBondingCurve.
  DUCK_BONDING_CURVE_VIEWS: getAddress("0x6cd84c6e3da0295b4a2787f1794a908a26fe8ba1"),
  DUCK_LAUNCHER: getAddress("0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B"),
  DUCK_CROWDFUND: getAddress("0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9"),
  DUCK_VAULT_FACTORY: getAddress("0x006e53d079BB4c2010682a4896D1950965faD5A5"),
  DUCK_VAULT_CONFIG: getAddress("0x2526d694F9b6cCefE46871D1b40aeEc1313eabfB"),
  DUCK_TOKEN_GOVERNOR_FACTORY: getAddress("0x29e600073c29b4f646C54c78AeE97aE8AE888999"),
  // EIP-1167 clone template all three families clone via CREATE2 -- needed client-side to predict
  // vanity token addresses before submitting.
  DUCK_TOKEN_IMPL: getAddress("0x83A491C728b0485A887fE9D7360C4Ae7eF8B1461"),
  PERMIT2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  V4_FEE_TIER,
  V4_TICK_SPACING,
};

const q = (address, symbol, decimals) => ({ address: getAddress(address), symbol, decimals });

const robinhood = {
  slug: "robinhood",
  chainId: 4663,
  name: "Robinhood Chain",
  shortName: "Robinhood",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  blockExplorerUrl: "https://robinhoodchain.blockscout.com",
  logoUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/info/logo.png",
  ...SHARED,
  // The default for NEW launches. A pool's hook is bound into its PoolKey forever, so per-token
  // reads always use that token's own indexed hook (coin.hook), falling back to this.
  DUCK_HOOK: getAddress("0x483b529fa121c5402778a511A98fB326940042CC"),
  WETH: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  V4_POOL_MANAGER: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
  V4_POSITION_MANAGER: getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
  V4_STATE_VIEW: getAddress("0xF3334192D15450CdD385c8B70e03f9A6bD9E673b"),
  V4_QUOTER: getAddress("0x8dc178EFb8111bB0973dd9d722ebeFF267c98f94"),
  UNIVERSAL_ROUTER: getAddress("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
  // Robinhood's Universal Router fork adds a 6th field (uint256 minHopPriceX36) before hookData in
  // V4 ExactInputSingleParams; Ink's canonical router doesn't have it. Same branching as
  // DuckProtocol's lib/LaunchRouting.sol.
  SWAP_PARAMS_HAS_MIN_HOP_PRICE: true,
  DEFAULT_QUOTE_TOKENS: [
    q("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", "USDG", 6),
    q("0xcE24439F2D9C6a2289F741120FE202248B666666", "U", 18),
    q("0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4", "cbBTC", 8),
    q("0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67", "TAO", 18),
    q("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", "SPY", 18),
    q("0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", "QQQ", 18),
    q("0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", "NVDA", 18),
    q("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", "AAPL", 18),
    q("0x322F0929c4625eD5bAd873c95208D54E1c003b2d", "TSLA", 18),
    q("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", "GOOGL", 18),
    q("0x12f190a9F9d7D37a250758b26824B97CE941bF54", "AMZN", 18),
    q("0xe93237C50D904957Cf27E7B1133b510C669c2e74", "MSFT", 18),
    q("0xec262a75e413fAfD0dF80480274532C79D42da09", "MSTR", 18),
    q("0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", "SPCX", 18),
    q("0x1b0E319c6A659F002271B69dB8A7df2F911c153E", "GME", 18),
    q("0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", "GLD", 18),
  ],
};

const ink = {
  slug: "ink",
  chainId: 57073,
  name: "Ink",
  shortName: "Ink",
  nativeSymbol: "ETH",
  nativeDecimals: 18,
  rpcUrl: "https://rpc-gel.inkonchain.com",
  blockExplorerUrl: "https://explorer.inkonchain.com",
  logoUrl: "https://icons.llamao.fi/icons/chains/rsz_ink.jpg",
  ...SHARED,
  DUCK_HOOK: getAddress("0x5a05a1f0A101237D8c350EFfA54f4b3c9bc142cc"),
  WETH: getAddress("0x4200000000000000000000000000000000000006"),
  V4_POOL_MANAGER: getAddress("0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32"),
  V4_POSITION_MANAGER: getAddress("0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566"),
  V4_STATE_VIEW: getAddress("0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990"),
  V4_QUOTER: getAddress("0x3972C00f7ed4885e145823eb7C655375d275A1C5"),
  UNIVERSAL_ROUTER: getAddress("0x112908daC86e20e7241B0927479Ea3Bf935d1fa0"),
  SWAP_PARAMS_HAS_MIN_HOP_PRICE: false,
  DEFAULT_QUOTE_TOKENS: [
    q("0x0200C29006150606B650577BBE7B6248F58470c1", "USDT0", 6),
    q("0xe343167631d89B6Ffc58B88d6b7fB0228795491D", "USDG", 6),
    q("0xF1815bd50389c46847f0Bda824eC8da914045D14", "USDC.e", 6),
    q("0x73E0C0d45E048D25Fc26Fa3159b0aA04BfA4Db98", "kBTC", 8),
    q("0xE7E553Cd128F0011777323A0b44a7b96EA1CB540", "wSPYx", 18),
    q("0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5", "wNVDAx", 18),
    q("0x943BF64D566c32A2Bcd41AC92FB63C111cC9De8f", "wAAPLx", 18),
    q("0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171", "wTSLAx", 18),
    q("0x30987adF0B11dc698438a99BA04ec3a1AB2c7EaB", "wMSTRx", 18),
    q("0x8e2eeD8b8B5E13Ea7BF38e50d7821d2C57309072", "wSPCXx", 18),
    q("0x7d87fD6A379714194a797c0bBB8B40c30D250856", "wNFLXx", 18),
  ],
};

// Every curated quote token has native-ETH swap routes configured on all three families
// (DuckProtocol/deploy/script/RouteTables.sol), so buyWithNative / the launcher's instant buy work
// for all of them. A launcher quote token outside this list has no route.
for (const c of [robinhood, ink]) {
  c.ROUTED_QUOTE_SYMBOLS = c.DEFAULT_QUOTE_TOKENS.map((t) => t.symbol);
}

export const CHAINS = { robinhood, ink };
export const CHAIN_LIST = [robinhood, ink];
export const DEFAULT_CHAIN_SLUG = "robinhood";

export function isChainSlug(value) {
  return Object.prototype.hasOwnProperty.call(CHAINS, value);
}

// Supply tier menu -- see common/SupplyTiers.sol. Index is what every create call takes.
export const SUPPLY_TIERS = [
  { index: 0, label: "1B" },
  { index: 1, label: "10B" },
  { index: 2, label: "100B" },
  { index: 3, label: "1T" },
  { index: 4, label: "10T" },
  { index: 5, label: "100T" },
  { index: 6, label: "1Q" },
];

// How the creator's share of the trading fee is divided. The contracts accept any creator/vault/burn
// split that sums to 10000 bps and fix it at pool registration; these are the presets the create
// form offers.
export const FEE_SPLIT_OPTIONS = [
  { creatorBps: 10000, vaultBps: 0, burnBps: 0 },
  { creatorBps: 8000, vaultBps: 2000, burnBps: 0 },
  { creatorBps: 5000, vaultBps: 5000, burnBps: 0 },
  { creatorBps: 5000, vaultBps: 2500, burnBps: 2500 },
  { creatorBps: 5000, vaultBps: 0, burnBps: 5000 },
  { creatorBps: 0, vaultBps: 10000, burnBps: 0 },
  { creatorBps: 0, vaultBps: 5000, burnBps: 5000 },
  { creatorBps: 0, vaultBps: 0, burnBps: 10000 },
];

// The pool's trading fee, taken in the quote currency on every buy and sell -- the fixed menu
// enforced by _isValidHookFeeBps on all three families (0 also means the hook's 2% default).
export const HOOK_FEE_BPS_OPTIONS = [
  { bps: 200, label: "2%" },
  { bps: 400, label: "4%" },
  { bps: 600, label: "6%" },
  { bps: 800, label: "8%" },
  { bps: 1000, label: "10%" },
];

// DuckHookV4's fixed carve-outs, taken off each claimed fee before the creator/vault/burn split.
export const HOOK_PLATFORM_FEE_BPS = 2500; // 24% platform + 1% to whoever triggers claimFees, if not the creator
export const HOOK_HOLDER_REWARD_BPS = 500;
