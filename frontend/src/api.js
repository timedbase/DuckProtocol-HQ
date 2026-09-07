// Talks to the backend in ../../backend (a thin API in front of the
// Goldsky subgraph + live contract reads, see its README).
//
// DEMO_MODE: while the backend's DuckProtocol data routes are still being
// built out, VITE_DEMO_MODE=true (see .env.example) makes every method
// below return canned, clearly-fake data instead of hitting the network --
// lets every page render and be clicked through today. Flip it off (or
// unset it) once the real backend routes are ready; nothing else in this
// file or its callers needs to change either way, since the shape returned
// here matches what a real response looks like.
import { CHAIN } from "./chain/addresses.js";
import { DEMO, DEMO_DUCK_ADDRESS } from "./demoData.js";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE || "true") === "true";

// Discover's hero slot is pinned to the platform's own token ($DUCK) --
// chain.PLATFORM_TOKEN (see chain/addresses.js) stays null until it's
// actually live on-chain, never a fabricated address. Demo mode previews
// what that hero card looks like once it exists via a canned address
// instead; real mode with no real address configured yet correctly gets
// null (App.jsx renders the "not launched yet" state for that case).
export function platformTokenAddress(chain) {
  return chain.PLATFORM_TOKEN || (DEMO_MODE ? DEMO_DUCK_ADDRESS : null);
}

function buildQuoteSymbols(chain) {
  const table = Object.fromEntries(chain.DEFAULT_QUOTE_TOKENS.map((t) => [t.address.toLowerCase(), t.symbol]));
  table["0x0000000000000000000000000000000000000000"] = chain.nativeSymbol;
  return table;
}
const QUOTE_SYMBOLS = buildQuoteSymbols(CHAIN);

export function quoteSymbol(_chain, address) {
  if (!address) return "?";
  return QUOTE_SYMBOLS[address.toLowerCase()] || (address.slice(0, 6) + "…");
}

export function shortAddress(address) {
  if (!address) return "?";
  return address.slice(0, 6) + "…" + address.slice(-4);
}

async function getJSON(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `${path} -> HTTP ${res.status}`);
  }
  return res.json();
}

// Single chain now (Robinhood only) -- `chain` is still accepted and
// threaded through by every call site (matching every other chain-aware
// function in this app), just no longer used to pick a URL prefix.
const PREFIX = `/${CHAIN.slug}`;

export const api = {
  tokens: (_chain, params = "") => (DEMO_MODE ? Promise.resolve(DEMO.tokens(params)) : getJSON(`${PREFIX}/tokens` + params)),
  token: (_chain, address) => (DEMO_MODE ? Promise.resolve(DEMO.token(address)) : getJSON(`${PREFIX}/tokens/${address}`)),
  trades: (_chain, address, limit = 50, offset = 0) =>
    DEMO_MODE ? Promise.resolve(DEMO.trades(address, limit, offset)) : getJSON(`${PREFIX}/tokens/${address}/trades?limit=${limit}&offset=${offset}`),
  holders: (_chain, address, limit = 50, offset = 0) =>
    DEMO_MODE ? Promise.resolve(DEMO.holders(address, limit, offset)) : getJSON(`${PREFIX}/tokens/${address}/holders?limit=${limit}&offset=${offset}`),
  comments: (_chain, address, limit = 50, offset = 0) =>
    DEMO_MODE ? Promise.resolve(DEMO.comments(address, limit, offset)) : getJSON(`${PREFIX}/tokens/${address}/comments?limit=${limit}&offset=${offset}`),
  postComment: (_chain, address, wallet, body) =>
    DEMO_MODE ? Promise.resolve(DEMO.postComment(address, wallet, body)) : postJSON(`${PREFIX}/tokens/${address}/comments`, { wallet, body }),
  health: () => (DEMO_MODE ? Promise.resolve({ ok: true, subgraph: { robinhood: { ok: true } } }) : getJSON("/health")),
  campaigns: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.campaigns()) : getJSON(`${PREFIX}/campaigns`)),
  campaign: (_chain, id) => (DEMO_MODE ? Promise.resolve(DEMO.campaign(id)) : getJSON(`${PREFIX}/campaigns/${id}`)),
  portfolio: (_chain, address) => (DEMO_MODE ? Promise.resolve(DEMO.portfolio(address)) : getJSON(`${PREFIX}/portfolio/${address}`)),
  quoteTokens: (_chain, family = "curve") => (DEMO_MODE ? Promise.resolve(DEMO.quoteTokens(family)) : getJSON(`${PREFIX}/quote-tokens?family=${family}`)),
  // Batched current USD price per quote-token address -- for the create
  // form's live "≈ $X" preview. Not authoritative; see convertUsdToQuoteUnits.
  quotePrices: (_chain, addresses) =>
    DEMO_MODE ? Promise.resolve(DEMO.quotePrices(addresses)) : getJSON(`${PREFIX}/price?tokens=${addresses.join(",")}`),
  // The authoritative "how many raw quote-token units is this USD amount"
  // conversion -- called once at actual submit/simulate time, never per
  // keystroke. Returns null (never throws) when the quote asset can't be
  // priced right now, so callers can surface a clear "try a different
  // quote asset" message instead of silently submitting a wrong amount.
  convertUsdToQuoteUnits: (_chain, quoteToken, usd) =>
    DEMO_MODE
      ? Promise.resolve(DEMO.convertUsdToQuoteUnits(quoteToken, usd))
      : postJSON(`${PREFIX}/price/convert`, { quoteToken, usd }).catch(() => null),
  locker: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.locker()) : getJSON(`${PREFIX}/locker`)),
  hook: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.hook()) : getJSON(`${PREFIX}/hook`)),
  curve: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.curve()) : getJSON(`${PREFIX}/curve`)),
  launcher: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.launcher()) : getJSON(`${PREFIX}/launcher`)),
  crowdfund: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.crowdfund()) : getJSON(`${PREFIX}/crowdfund`)),
  vaultFactory: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.vaultFactory()) : getJSON(`${PREFIX}/vault-factory`)),
  vaultConfig: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.vaultConfig()) : getJSON(`${PREFIX}/vault-config`)),
  governorFactory: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.governorFactory()) : getJSON(`${PREFIX}/governor-factory`)),
  vaults: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.vaults()) : getJSON(`${PREFIX}/vaults`)),
  vault: (_chain, tokenAddress) => (DEMO_MODE ? Promise.resolve(DEMO.vault(tokenAddress)) : getJSON(`${PREFIX}/vaults/${tokenAddress}`)),
  proposals: (_chain, tokenAddress) => (DEMO_MODE ? Promise.resolve(DEMO.proposals(tokenAddress)) : getJSON(`${PREFIX}/governance/proposals${tokenAddress ? `?token=${tokenAddress}` : ""}`)),
  proposal: (_chain, id) => (DEMO_MODE ? Promise.resolve(DEMO.proposal(id)) : getJSON(`${PREFIX}/governance/proposals/${id}`)),
  stats: (_chain) => (DEMO_MODE ? Promise.resolve(DEMO.stats()) : getJSON(`${PREFIX}/stats`)),
};
