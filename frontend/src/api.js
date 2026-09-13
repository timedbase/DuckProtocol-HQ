// Talks to the backend in ../../backend (indexed chain data plus live contract reads, see its
// README). Defaults to the deployed backend; VITE_API_URL overrides it
// for local development.
import { ZERO_ADDRESS } from "./chain/addresses.js";

export const API_BASE = import.meta.env.VITE_API_URL || "https://api.duckpad.fun";

const quoteSymbolTables = new Map();
function quoteSymbolTable(chain) {
  let table = quoteSymbolTables.get(chain.slug);
  if (!table) {
    table = Object.fromEntries(chain.DEFAULT_QUOTE_TOKENS.map((t) => [t.address.toLowerCase(), t.symbol]));
    table[ZERO_ADDRESS] = chain.nativeSymbol;
    quoteSymbolTables.set(chain.slug, table);
  }
  return table;
}

export function quoteSymbol(chain, address) {
  if (!address) return "?";
  return quoteSymbolTable(chain)[address.toLowerCase()] || (address.slice(0, 6) + "…");
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

// Every data route is chain-scoped under /<slug> (robinhood or ink).
const p = (chain) => `/${chain.slug}`;

export const api = {
  tokens: (chain, params = "") => getJSON(`${p(chain)}/tokens` + params),
  token: (chain, address) => getJSON(`${p(chain)}/tokens/${address}`),
  trades: (chain, address, limit = 50, offset = 0) => getJSON(`${p(chain)}/tokens/${address}/trades?limit=${limit}&offset=${offset}`),
  holders: (chain, address, limit = 50, offset = 0) => getJSON(`${p(chain)}/tokens/${address}/holders?limit=${limit}&offset=${offset}`),
  comments: (chain, address, limit = 50, offset = 0) => getJSON(`${p(chain)}/tokens/${address}/comments?limit=${limit}&offset=${offset}`),
  postComment: (chain, address, wallet, body) => postJSON(`${p(chain)}/tokens/${address}/comments`, { wallet, body }),
  health: () => getJSON("/health"),
  campaigns: (chain) => getJSON(`${p(chain)}/campaigns`),
  campaign: (chain, id) => getJSON(`${p(chain)}/campaigns/${id}`),
  portfolio: (chain, address) => getJSON(`${p(chain)}/portfolio/${address}`),
  quoteTokens: (chain, family = "curve") => getJSON(`${p(chain)}/quote-tokens?family=${family}`),
  // Batched current USD price per quote-token address (the backend's reference prices) -- for the create
  // form's live "≈ X" preview. Not authoritative; see convertUsdToQuoteUnits.
  quotePrices: (chain, addresses) => getJSON(`${p(chain)}/price?tokens=${addresses.join(",")}`),
  // The authoritative USD -> raw quote-units conversion, called once at submit/simulate time.
  // Resolves to null (never throws) when the quote asset can't be priced right now.
  convertUsdToQuoteUnits: (chain, quoteToken, usd) => postJSON(`${p(chain)}/price/convert`, { quoteToken, usd }).catch(() => null),
  hook: (chain) => getJSON(`${p(chain)}/hook`),
  curve: (chain) => getJSON(`${p(chain)}/curve`),
  launcher: (chain) => getJSON(`${p(chain)}/launcher`),
  crowdfund: (chain) => getJSON(`${p(chain)}/crowdfund`),
  vaultFactory: (chain) => getJSON(`${p(chain)}/vault-factory`),
  vaultConfig: (chain) => getJSON(`${p(chain)}/vault-config`),
  governorFactory: (chain) => getJSON(`${p(chain)}/governor-factory`),
  vaults: (chain) => getJSON(`${p(chain)}/vaults`),
  vault: (chain, tokenAddress) => getJSON(`${p(chain)}/vaults/${tokenAddress}`),
  proposals: (chain, tokenAddress) => getJSON(`${p(chain)}/governance/proposals${tokenAddress ? `?token=${tokenAddress}` : ""}`),
  proposal: (chain, id) => getJSON(`${p(chain)}/governance/proposals/${id}`),
  stats: (chain) => getJSON(`${p(chain)}/stats`),
};
