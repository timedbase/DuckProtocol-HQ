// Quote-token logos, keyed per chain by symbol. Every URL was checked to resolve (HTTP 200) against
// the token's actual address on that chain -- Trust Wallet's assets repo indexes Robinhood Chain as
// "robinhoodchain". Tokens with no verified logo fall back to the chain's own logo rather than a
// lookalike borrowed from another chain.
const ETH_LOGO = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
const RH_ASSET = (address) => `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/robinhoodchain/assets/${address}/logo.png`;

const QUOTE_LOGOS = {
  robinhood: {
    USDG: RH_ASSET("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    U: RH_ASSET("0xcE24439F2D9C6a2289F741120FE202248B666666"),
    SPY: RH_ASSET("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C"),
    NVDA: RH_ASSET("0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"),
    TSLA: RH_ASSET("0x322F0929c4625eD5bAd873c95208D54E1c003b2d"),
    AAPL: RH_ASSET("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"),
  },
  ink: {},
};

// `chain`: the resolved CHAINS[slug] config. Native ETH always gets the ETH logo.
export function logoFor(chain, symbol) {
  if (symbol === chain.nativeSymbol) return ETH_LOGO;
  return QUOTE_LOGOS[chain.slug]?.[symbol] || chain.logoUrl;
}
