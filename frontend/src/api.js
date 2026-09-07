// Talks to the backend in ../../backend (a thin API in front of the
// Goldsky subgraph + live contract reads, see its README). Always hits the
// real network -- there is no demo/canned-data mode anymore; VITE_API_URL
// must point at a real, reachable backend.
import { CHAIN } from "./chain/addresses.js";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Discover's hero slot is pinned to the platform's own token ($DUCK) --
// chain.PLATFORM_TOKEN (see chain/addresses.js) stays null until it's
// actually live on-chain. No real address configured yet correctly means
// null here too (App.jsx renders the "not launched yet" state for that
// case), never a fabricated address.
export function platformTokenAddress(chain) {
  return chain.PLATFORM_TOKEN || null;
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
  tokens: (_chain, params = "") => getJSON(`${PREFIX}/tokens` + params),
  token: (_chain, address) => getJSON(`${PREFIX}/tokens/${address}`),
  trades: (_chain, address, limit = 50, offset = 0) => getJSON(`${PREFIX}/tokens/${address}/trades?limit=${limit}&offset=${offset}`),
  holders: (_chain, address, limit = 50, offset = 0) => getJSON(`${PREFIX}/tokens/${address}/holders?limit=${limit}&offset=${offset}`),
  comments: (_chain, address, limit = 50, offset = 0) => getJSON(`${PREFIX}/tokens/${address}/comments?limit=${limit}&offset=${offset}`),
  postComment: (_chain, address, wallet, body) => postJSON(`${PREFIX}/tokens/${address}/comments`, { wallet, body }),
  health: () => getJSON("/health"),
  campaigns: (_chain) => getJSON(`${PREFIX}/campaigns`),
  campaign: (_chain, id) => getJSON(`${PREFIX}/campaigns/${id}`),
  portfolio: (_chain, address) => getJSON(`${PREFIX}/portfolio/${address}`),
  quoteTokens: (_chain, family = "curve") => getJSON(`${PREFIX}/quote-tokens?family=${family}`),
  // Batched current USD price per quote-token address -- for the create
  // form's live "≈ $X" preview. Not authoritative; see convertUsdToQuoteUnits.
  quotePrices: (_chain, addresses) => getJSON(`${PREFIX}/price?tokens=${addresses.join(",")}`),
  // The authoritative "how many raw quote-token units is this USD amount"
  // conversion -- called once at actual submit/simulate time, never per
  // keystroke. Returns null (never throws) when the quote asset can't be
  // priced right now, so callers can surface a clear "try a different
  // quote asset" message instead of silently submitting a wrong amount.
  convertUsdToQuoteUnits: (_chain, quoteToken, usd) => postJSON(`${PREFIX}/price/convert`, { quoteToken, usd }).catch(() => null),
  locker: (_chain) => getJSON(`${PREFIX}/locker`),
  hook: (_chain) => getJSON(`${PREFIX}/hook`),
  curve: (_chain) => getJSON(`${PREFIX}/curve`),
  launcher: (_chain) => getJSON(`${PREFIX}/launcher`),
  crowdfund: (_chain) => getJSON(`${PREFIX}/crowdfund`),
  vaultFactory: (_chain) => getJSON(`${PREFIX}/vault-factory`),
  vaultConfig: (_chain) => getJSON(`${PREFIX}/vault-config`),
  governorFactory: (_chain) => getJSON(`${PREFIX}/governor-factory`),
  vaults: (_chain) => getJSON(`${PREFIX}/vaults`),
  vault: (_chain, tokenAddress) => getJSON(`${PREFIX}/vaults/${tokenAddress}`),
  proposals: (_chain, tokenAddress) => getJSON(`${PREFIX}/governance/proposals${tokenAddress ? `?token=${tokenAddress}` : ""}`),
  proposal: (_chain, id) => getJSON(`${PREFIX}/governance/proposals/${id}`),
  stats: (_chain) => getJSON(`${PREFIX}/stats`),
};
