import { CHAIN } from "./addresses.js";

// Real logos from Trust Wallet's public assets repo (trustwallet/assets on
// GitHub), which indexes Robinhood Chain as its own "robinhoodchain"
// blockchain folder -- every URL here is keyed by our ACTUAL Robinhood
// Chain quote-token address (chain/addresses.js's DEFAULT_QUOTE_TOKENS) and
// was verified to resolve (HTTP 200, with info.json's symbol matching)
// before being wired in, not symbol-matched to a same-named token on a
// different chain. LINK/TAO/PONS/INDEX/SPCX are genuinely absent from both
// Trust Wallet's robinhoodchain assets and Uniswap's default token list
// (also checked) -- they fall back to logoFor()'s chain-logo placeholder
// below rather than borrow an unverified lookalike logo from elsewhere.
//
// Shared by CreateFormPage's quote-asset picker and TokenPage's trade panel
// "pay with" pill, so there's exactly one verified copy of these URLs.
export const QUOTE_LOGOS = {
  "ETH": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  "USDG": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168/logo.png",
  "CASHCAT": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0x020bfC650A365f8BB26819deAAbF3E21291018b4/logo.png",
  "SPY": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0x117cc2133c37B721F49dE2A7a74833232B3B4C0C/logo.png",
  "NVDA": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC/logo.png",
  "TSLA": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0x322F0929c4625eD5bAd873c95208D54E1c003b2d/logo.png",
  "AAPL": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9/logo.png",
};

// Any token without a verified logo of its own -- a permissionless
// launcher quote token a creator pasted in, or one of the handful of
// curated symbols (LINK/TAO/PONS/INDEX/SPCX) with no indexed logo
// anywhere -- falls back to Robinhood Chain's own real, verified logo
// (chain/addresses.js's logoUrl) rather than a blank placeholder circle.
// Still an honest signal ("a real token on this chain," not a guess at
// what the token itself looks like), never a fabricated per-token icon.
export function logoFor(symbol) {
  return QUOTE_LOGOS[symbol] || CHAIN.logoUrl;
}
