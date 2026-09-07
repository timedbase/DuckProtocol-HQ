import { getAddress, type Address } from "viem";
import type { ChainSlug } from "./registry.js";

export type QuoteToken = { address: Address; symbol: string; decimals: number };

export type ChainAddresses = {
  chainId: number;
  nativeSymbol: string;
  DUCK_BONDING_CURVE: Address;
  DUCK_LAUNCHER: Address;
  DUCK_CROWDFUND: Address;
  DUCK_LOCKER: Address;
  DUCK_HOOK: Address;
  DUCK_VAULT_FACTORY: Address;
  DUCK_VAULT_CONFIG: Address;
  DUCK_TOKEN_GOVERNOR_FACTORY: Address;
  DUCK_TOKEN_IMPL: Address;
  WETH: Address;
  V4_POOL_MANAGER: Address;
  V4_POSITION_MANAGER: Address;
  V4_STATE_VIEW: Address;
  PERMIT2: Address;
  DEFAULT_QUOTE_TOKENS: QuoteToken[];
};

// Kept in lockstep with the Duck-Protocol repo's
// deploy/deployments/robinhood.json -- same deployment, referenced from
// both. DuckProtocol is Robinhood Chain only.
const robinhood: ChainAddresses = {
  chainId: 4663,
  nativeSymbol: "ETH",
  DUCK_BONDING_CURVE: getAddress("0x9AE7383af6ea77037c09459a9aF8f4AEC038f083"),
  DUCK_LAUNCHER: getAddress("0xDA4fAD8E339d1F1f243C810CCDa29de80c5040Dc"),
  DUCK_CROWDFUND: getAddress("0x5066B217106De6f7b1A5F43eAa138C3C6306FC7d"),
  DUCK_LOCKER: getAddress("0xbaA2A0F17922729F5Aa826ec5b0B927583260E03"),
  DUCK_HOOK: getAddress("0x2F030392B3472BbE30Dc36e960eFc226744140C4"),
  DUCK_VAULT_FACTORY: getAddress("0xeB191E04445046cDD3f21Bae6e79Ef78bE08D28F"),
  DUCK_VAULT_CONFIG: getAddress("0x74738a87e4D4E0eB2706724a9314d1b4452ecdFE"),
  DUCK_TOKEN_GOVERNOR_FACTORY: getAddress("0x6A73DA9BC5Ecb8cCD4EccEBf53e3591B2cc30D0d"),
  DUCK_TOKEN_IMPL: getAddress("0xCA544758ADc9Ab518185FB0784D79E4884ba5cB4"),
  WETH: getAddress("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  V4_POOL_MANAGER: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
  V4_POSITION_MANAGER: getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
  V4_STATE_VIEW: getAddress("0xF3334192D15450CdD385c8B70e03f9A6bD9E673b"),
  PERMIT2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  // Seeded as defaults at deploy time (see
  // deploy/script/DeployDuckProtocol.s.sol) -- real, verified Robinhood
  // Chain tokens. Launcher additionally accepts any quote token beyond this
  // list; bonding curve and crowdfund stay curated to it unless the owner
  // adds more on-chain.
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
};

export const ADDRESSES: Record<ChainSlug, ChainAddresses> = { robinhood };
