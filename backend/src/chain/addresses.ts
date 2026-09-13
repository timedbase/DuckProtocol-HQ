import { getAddress, type Address } from "viem";
import type { ChainSlug } from "./registry.js";

export type QuoteToken = { address: Address; symbol: string; decimals: number };

export type ChainAddresses = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  defaultRpcUrl: string;
  defaultSubgraphUrl: string;
  DUCK_BONDING_CURVE: Address;
  DUCK_BONDING_CURVE_VIEWS: Address;
  DUCK_LAUNCHER: Address;
  DUCK_CROWDFUND: Address;
  DUCK_HOOK: Address;
  DUCK_VAULT_FACTORY: Address;
  DUCK_VAULT_CONFIG: Address;
  DUCK_TOKEN_GOVERNOR_FACTORY: Address;
  DUCK_TOKEN_IMPL: Address;
  WETH: Address;
  V4_POOL_MANAGER: Address;
  V4_POSITION_MANAGER: Address;
  UNIVERSAL_ROUTER: Address;
  // Valued at exactly $1 -- the same set the subgraph treats as stablecoins.
  STABLES: Address[];
  // The curated quote tokens seeded on all three families at deploy time (and routed from native
  // ETH by SetRoutes). Launcher additionally accepts any token its owner adds later.
  DEFAULT_QUOTE_TOKENS: QuoteToken[];
};

const GOLDSKY = "https://api.goldsky.com/api/public/project_cmhtxnzpqm81001w94ksmgira/subgraphs";

// Everything except the hook deploys via CREATE2 from the same deployer, so the protocol's own
// addresses are identical on both chains (see DuckProtocol/deploy/script/DeployDuckProtocol.s.sol).
// The hook's constructor embeds the chain's PoolManager, so its address differs per chain.
const SHARED = {
  DUCK_BONDING_CURVE: getAddress("0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF"),
  DUCK_BONDING_CURVE_VIEWS: getAddress("0x6cd84c6e3da0295b4a2787f1794a908a26fe8ba1"),
  DUCK_LAUNCHER: getAddress("0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B"),
  DUCK_CROWDFUND: getAddress("0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9"),
  DUCK_VAULT_FACTORY: getAddress("0x006e53d079BB4c2010682a4896D1950965faD5A5"),
  DUCK_VAULT_CONFIG: getAddress("0x2526d694F9b6cCefE46871D1b40aeEc1313eabfB"),
  DUCK_TOKEN_GOVERNOR_FACTORY: getAddress("0x29e600073c29b4f646C54c78AeE97aE8AE888999"),
  DUCK_TOKEN_IMPL: getAddress("0x83A491C728b0485A887fE9D7360C4Ae7eF8B1461"),
};

const q = (address: string, symbol: string, decimals: number): QuoteToken => ({ address: getAddress(address), symbol, decimals });

const robinhood: ChainAddresses = {
  chainId: 4663,
  name: "Robinhood Chain",
  nativeSymbol: "ETH",
  defaultRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  defaultSubgraphUrl: `${GOLDSKY}/duck-subgraph-rh/current/gn`,
  ...SHARED,
  DUCK_HOOK: getAddress("0x483b529fa121c5402778a511A98fB326940042CC"),
  WETH: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  V4_POOL_MANAGER: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
  V4_POSITION_MANAGER: getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
  UNIVERSAL_ROUTER: getAddress("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
  STABLES: [getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"), getAddress("0xcE24439F2D9C6a2289F741120FE202248B666666")],
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

const ink: ChainAddresses = {
  chainId: 57073,
  name: "Ink",
  nativeSymbol: "ETH",
  defaultRpcUrl: "https://rpc-gel.inkonchain.com",
  defaultSubgraphUrl: `${GOLDSKY}/duck-subgraph-ink/current/gn`,
  ...SHARED,
  DUCK_HOOK: getAddress("0x5a05a1f0A101237D8c350EFfA54f4b3c9bc142cc"),
  WETH: getAddress("0x4200000000000000000000000000000000000006"),
  V4_POOL_MANAGER: getAddress("0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32"),
  V4_POSITION_MANAGER: getAddress("0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566"),
  UNIVERSAL_ROUTER: getAddress("0x112908daC86e20e7241B0927479Ea3Bf935d1fa0"),
  STABLES: [
    getAddress("0x0200C29006150606B650577BBE7B6248F58470c1"),
    getAddress("0xF1815bd50389c46847f0Bda824eC8da914045D14"),
    getAddress("0xe343167631d89B6Ffc58B88d6b7fB0228795491D"),
  ],
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

export const ADDRESSES: Record<ChainSlug, ChainAddresses> = { robinhood, ink };
