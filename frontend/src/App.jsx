import { useState, useEffect, useCallback, useRef } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { cs } from "./cs.js";
import { XIcon, TelegramIcon } from "./MetaChips.jsx";
import DiscoverPage from "./pages/DiscoverPage.jsx";
import TokenPage from "./pages/TokenPage.jsx";
import CreateChooserPage from "./pages/CreateChooserPage.jsx";
import CreateFormPage from "./pages/CreateFormPage.jsx";
import CampaignPage from "./pages/CampaignPage.jsx";
import PortfolioPage from "./pages/PortfolioPage.jsx";
import { api, shortAddress, quoteSymbol, API_BASE, platformTokenAddress } from "./api.js";
import { tokenToCoin, tradeToRow, holderToRow, commentToRow, buildCandles, buildSparkline, buildTicks, labelFor, compactNumber, quoteAmount, usdOrQuote } from "./adapters.js";
import { ageLabel } from "./data.js";
import {
  createCurveToken, buyCurve, sellCurve, claimCurveFee,
  launchInstant,
  createCampaign, contributeCampaign, claimCampaign, claimCampaignRefund, finalizeCampaign, getRaiseDefaults,
  claimFees, claimAllFees, getPosition, getPositionCreator, getPool, getCtoApplication,
  applyForCTO, getCtoFee, setHookFeeSplits, getHookFeeSplits, getHookAccruedFees,
  getNativeBalance, waitForTx, getPlatformTokens, getTokenBalance,
  borrowFromVault, repayVault, addVaultCollateral, withdrawVaultCollateral,
  castVote, executeProposal,
} from "./chain/actions.js";
import { buyOnPoolDirect, sellOnPoolDirect } from "./chain/dex.js";
import { previewCurveBuy, previewCurveSell, previewPoolBuyDirect, previewPoolSellDirect, applySlippage } from "./chain/quotes.js";
import { ZERO_ADDRESS, CHAIN } from "./chain/addresses.js";
import { fetchTokenMeta, fetchTokenMetaUri } from "./chain/tokenMeta.js";
import { findBlockedTerm } from "./moderation.js";
import { resolveTokenImage, resolveTokenSocials, resolveTokenDescription, resolveTokenNameSymbol } from "./ipfs.js";

// Single chain now (Robinhood only) -- these are kept as no-op stubs rather
// than deleted outright, since s.chain / setChain / storeChain are still
// threaded through a lot of existing state/UI plumbing below; simplest to
// leave that plumbing in place pointed at one fixed value than to rip it
// all out for this pass.
function loadStoredChain() {
  return CHAIN.slug;
}
function storeChain(_slug) {
  /* no-op -- only one chain exists */
}

const REFRESH_MS = 15000;
const PAGE_SIZE = 10; // Trades/Holders tabs page at this size, both server- and client-side.
const HEALTH_CHECK_MS = 30000; // matches the backend's own subgraph-poll interval (see backend/src/health.ts)
const GAS_RESERVE_WEI = parseEther("0.005");
const INK = "var(--ink)", CARD = "var(--card)", LIME = "var(--lime)", ORANGE = "var(--orange)";

function truncateDecimals(numStr, decimals) {
  const [whole, frac = ""] = numStr.split(".");
  return frac.length > decimals ? `${whole}.${frac.slice(0, decimals)}` : numStr;
}

// Native currency first (always tradeable directly), then the platform's
// default-allowed quote tokens, then that family's platformToken() (if the
// owner has set one) -- fetched live, see getPlatformTokens.
//
// On Arc, native currency IS called "USDC" (see chain/addresses.js), and
// the real ERC20 USDC mirror also reports symbol() "USDC" -- genuinely the
// same underlying asset presented two ways (Circle's own docs: the ERC20
// interface is just a view over the same native balance, not a separate
// wrapped token). Showing both as separate picker chips would look like a
// confusing duplicate, and they're not actually independent choices from a
// user's perspective -- so a same-symbol ERC20 entry is merged into the
// native option instead of listed separately: one "USDC" chip, carrying
// both addresses so a caller that specifically needs the ERC20 form (V3,
// which forbids native entirely) can still get at it via `erc20Address`.
function quoteOptionsFor(chain, base, platformToken) {
  const erc20Match = base.find((t) => t.symbol === chain.nativeSymbol);
  const rest = base.filter((t) => t !== erc20Match);
  const options = [
    {
      label: chain.nativeSymbol, address: ZERO_ADDRESS,
      erc20Address: erc20Match?.address ?? null, erc20Decimals: erc20Match?.decimals ?? null,
    },
    ...rest.map((t) => ({ label: t.symbol, address: t.address, decimals: t.decimals })),
  ];
  if (platformToken && !options.some((o) => o.address.toLowerCase() === platformToken.address.toLowerCase())) {
    options.push({ label: platformToken.symbol, address: platformToken.address, decimals: platformToken.decimals });
  }
  return options;
}

function decimalsFor(chain, address, platformTokens = []) {
  if (address.toLowerCase() === ZERO_ADDRESS) return 18;
  const all = [...chain.DEFAULT_QUOTE_TOKENS, ...chain.STOCK_QUOTE_TOKENS, ...platformTokens.filter(Boolean)];
  const t = all.find((q) => q.address.toLowerCase() === address.toLowerCase());
  return t ? t.decimals : 18;
}

// The one place a create-form USD amount becomes the raw quote-asset units
// an on-chain call actually needs -- backend-authoritative (chain/price.ts),
// not a client-side price*decimals guess, so submitCreate and simulateCreate
// (which used to each run their own parseUnits(rawQuoteString, decimals))
// can't drift from each other. Throws a user-facing Error when the quote
// asset can't be priced right now, rather than silently sending a wrong
// amount -- callers should catch it and flash() the message.
async function resolveQuoteUnits(chain, quoteToken, usdString) {
  const usd = Number(usdString);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Enter a USD amount greater than zero.");
  const result = await api.convertUsdToQuoteUnits(chain, quoteToken, usd);
  if (result == null) throw new Error("Can't price this quote asset right now -- try a different one.");
  return BigInt(result.raw);
}

const EMPTY_SOCIALS = { twitter: "", telegram: "", website: "" };
const EMPTY_IMAGE = { file: null, previewUrl: "", uploading: false, ipfsUri: "", gatewayUrl: "", error: "" };
const EMPTY_PORTFOLIO = { created: [], holdings: [], contributions: [] };
const block = (active) => (active ? { bg: INK, fg: CARD } : { bg: CARD, fg: INK });

// Real URL routing (plain History API -- no router dependency needed for
// ~7 static paths plus one dynamic one). A token or campaign's page is
// keyed by its own contract address, e.g. /0xe911...8888, so the link is
// the same thing Blockscout/Etherscan would call it -- shareable and
// bookmarkable without any separate slug concept.
const ADDRESS_PATH_RE = /^\/(0x[0-9a-fA-F]{40})$/;
const CREATE_FAMILY_PATH_RE = /^\/create\/(incubation|launcher|raise)$/;

function pathForScreen(screen, tokenId, family) {
  if ((screen === "token" || screen === "campaign") && tokenId) return "/" + tokenId;
  if (screen === "createForm" && family) return "/create/" + family;
  if (screen === "create") return "/create";
  if (screen === "portfolio") return "/portfolio";
  return "/";
}

// Every static path this maps to a screen -- anything else (unknown path,
// or a /0x... address, which needs s.coins loaded first) falls through to
// null and is handled by the caller.
function staticScreenForPath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { screen: "home" };
  if (path === "/create") return { screen: "create" };
  const fam = path.match(CREATE_FAMILY_PATH_RE);
  if (fam) return { screen: "createForm", family: fam[1] };
  if (path === "/portfolio") return { screen: "portfolio" };
  return null;
}

// Real market-cap/launch-date bands for Discover's filter dropdowns --
// bucketed off real mcUsd/ageMin, never a fabricated placeholder list.
const MCAP_PRESETS = [
  { key: "any", label: "Any market cap" },
  { key: "u10k", label: "Under $10K" },
  { key: "10k-100k", label: "$10K – $100K" },
  { key: "100k-1m", label: "$100K – $1M" },
  { key: "1m+", label: "Over $1M" },
];
const MCAP_TEST = {
  u10k: (v) => v < 10000,
  "10k-100k": (v) => v >= 10000 && v < 100000,
  "100k-1m": (v) => v >= 100000 && v < 1000000,
  "1m+": (v) => v >= 1000000,
};
const LAUNCHED_PRESETS = [
  { key: "any", label: "Any launch date" },
  { key: "1h", label: "Last hour" },
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];
const LAUNCHED_TEST = {
  "1h": (min) => min <= 60,
  "24h": (min) => min <= 1440,
  "7d": (min) => min <= 10080,
  "30d": (min) => min <= 43200,
};

export default function App() {
  const { address: account, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  // Deep-link support: a static path (/, /create, /portfolio, /stats, /how,
  // /docs) resolves synchronously into the initial screen. A /0x... address
  // can't -- it needs s.coins loaded first to tell a token from a campaign
  // -- so it's captured here and consumed once by the effect below.
  const initialStatic = staticScreenForPath(window.location.pathname) || { screen: "home" };
  const deepLinkToken = useRef((window.location.pathname.match(ADDRESS_PATH_RE) || [])[1] || null);
  const firstUrlSync = useRef(true);
  const skipNextPush = useRef(false);
  const chainMenuRef = useRef(null);
  const walletMenuRef = useRef(null);

  const [s, setS] = useState({
    chain: loadStoredChain(),
    mobile: false, chainMenuOpen: false, walletMenuOpen: false, sort: "Last activity",
    layout: "cards", filter: "All", query: "",
    mcapFilter: "any", launchedFilter: "any", quoteFilter: "any",
    tokenId: null, side: "buy", amount: "250", range: "1D", chartMode: "price", tab: "Trades", chatDraft: "",
    family: null, contribAmount: "0.5", slippageBps: 500,
    ...initialStatic,
    previewOut: null, previewLoading: false, simulating: false,
    nativeBalance: 0n, quoteBalance: 0n, txPending: false, tx: null, toast: "",
    portfolio: EMPTY_PORTFOLIO, coins: [], coinsLoading: true, coinsError: "",
    draftCurve: { name: "", ticker: "", desc: "", quoteToken: ZERO_ADDRESS, supplyTier: 0, vaultBps: 0, startTargetUsd: "20000", migrationTargetUsd: "150000", earlyBuyAmount: "0", socials: EMPTY_SOCIALS },
    draftInstant: { name: "", ticker: "", desc: "", quoteToken: ZERO_ADDRESS, supplyTier: 0, vaultBps: 0, launchMarketCapUsd: "25000", buyAmountHype: "0", socials: EMPTY_SOCIALS },
    draftCampaign: { name: "", ticker: "", desc: "", dexQuoteAsset: ZERO_ADDRESS, supplyTier: 0, vaultBps: 0, goalUsd: "125000", socials: EMPTY_SOCIALS },
    draftImage: EMPTY_IMAGE,
    raiseDefaults: null, platformTokens: { incubation: null, launcher: null, raise: null },
    creatorData: null, creatorLoading: false,
    campaignDetail: null,
    vaultsLoading: false, vaultDetail: null, vaultConfigData: null,
    proposals: [], proposalsLoading: false, proposalDetail: null,
    health: { ok: true, frontendMs: null, subgraphMs: null, checkedAt: null },
  });
  const set = useCallback((patch) => setS((st) => ({ ...st, ...(typeof patch === "function" ? patch(st) : patch) })), []);
  const chain = CHAIN;

  // Switching chains is pure app state, independent of the wallet's actual
  // connected network -- a disconnected user (or one connected to the OTHER
  // chain) can still browse the new chain's data; the wallet only has to
  // match at the moment of an actual write (see runTx's guard below). Reset
  // every address-keyed piece of state and navigate home rather than
  // leaving a token/campaign/portfolio view open against the OLD chain's
  // address under the NEW chain's data -- this matters because Ink and Arc
  // have already been observed to share byte-identical contract addresses
  // (same deployer nonce sequence), so carrying over a same-string address
  // across a chain switch could silently resolve to a completely different,
  // unrelated token/campaign.
  function setChain(next) {
    set({ chainMenuOpen: false });
    if (next === s.chain) return;
    storeChain(next);
    set((st) => ({
      chain: next, screen: "home", tokenId: null, family: null,
      campaignDetail: null, creatorData: null, portfolio: EMPTY_PORTFOLIO,
      coins: [], coinsLoading: true, raiseDefaults: null,
      platformTokens: { incubation: null, launcher: null, raise: null },
    }));
    skipNextPush.current = false;
    window.history.pushState(null, "", "/");
  }

  // ---------- lifecycle ----------

  useEffect(() => {
    const fit = () => set({ mobile: (window.innerWidth || 1440) < 900 });
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [set]);

  // Close the chain/wallet dropdowns on an outside click. A full-viewport
  // "click-catcher" overlay div would be the simpler-looking fix, but it's
  // a real trap here: these dropdowns render inside the sticky header,
  // which establishes its own stacking context (position:sticky + z-index),
  // so a `position:fixed` descendant's z-index only ever competes within
  // that context -- <main>'s later-DOM-order content still paints (and
  // receives clicks) on top of the entire header, overlay included, no
  // matter how high its z-index goes. A document-level listener sidesteps
  // stacking entirely.
  useEffect(() => {
    if (!s.chainMenuOpen && !s.walletMenuOpen) return;
    function onDocClick(e) {
      if (s.chainMenuOpen && chainMenuRef.current && !chainMenuRef.current.contains(e.target)) set({ chainMenuOpen: false });
      if (s.walletMenuOpen && walletMenuRef.current && !walletMenuRef.current.contains(e.target)) set({ walletMenuOpen: false });
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [s.chainMenuOpen, s.walletMenuOpen, set]);

  // URL routing: keep the address bar in sync with s.screen/tokenId/family
  // (state -> URL), support the browser's back/forward buttons (URL ->
  // state), and resolve a /0x... deep link into the right screen once
  // coins have loaded (openToken needs s.coins to tell a token from a
  // campaign -- see staticScreenForPath's comment above).
  useEffect(() => {
    const path = pathForScreen(s.screen, s.tokenId, s.family);
    const isFirst = firstUrlSync.current;
    firstUrlSync.current = false;
    if (skipNextPush.current) { skipNextPush.current = false; return; }
    // A pending /0x... deep link hasn't resolved into s.screen/tokenId yet
    // (needs s.coins loaded first) -- leave the real URL alone rather than
    // stomping it with "/" for the split second before openToken runs.
    if (isFirst && deepLinkToken.current) return;
    if (window.location.pathname === path) return;
    if (isFirst) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
  }, [s.screen, s.tokenId, s.family]);

  useEffect(() => {
    function onPopState() {
      skipNextPush.current = true;
      const stat = staticScreenForPath(window.location.pathname);
      if (stat) { set(stat); return; }
      const addr = (window.location.pathname.match(ADDRESS_PATH_RE) || [])[1];
      if (addr) openToken(addr);
      else set({ screen: "home" });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (deepLinkToken.current && s.coins.length > 0) {
      const id = deepLinkToken.current;
      deepLinkToken.current = null;
      openToken(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.coins.length]);

  useEffect(() => {
    getPlatformTokens(chain).then((tokens) => set({ platformTokens: tokens })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, s.chain]);

  const loadCoins = useCallback(async () => {
    try {
      const rows = await api.tokens(chain);
      let coins = rows.map((t, i) => tokenToCoin(chain, t, i));

      // name/symbol are indexed directly on Token now -- this only fires
      // for a token the subgraph hasn't reindexed yet since that field was
      // added (or one from right before a redeploy), never in steady state.
      const missingMeta = coins.filter((c) => c.family !== "CAMPAIGN" && c.symbol === "???").map((c) => c.id);
      if (missingMeta.length > 0) {
        const meta = await fetchTokenMeta(chain, missingMeta);
        coins = coins.map((c) => {
          const m = meta[c.id.toLowerCase()];
          if (!m || (!m.name && !m.symbol)) return c;
          const symbol = m.symbol || c.symbol;
          return { ...c, name: m.name || c.name, symbol, ticker: "$" + symbol, initials: symbol.slice(0, 2).toUpperCase() };
        });
      }

      // `coins` (below) is already the complete, freshly-fetched list at
      // this point -- returned as-is so callers like pollUntilFound can
      // check it directly instead of reading back through setS, whose
      // updater isn't guaranteed to have run yet by the time a caller reads
      // it right after this call returns.
      setS((st) => {
        const byId = new Map(st.coins.map((c) => [c.id, c]));
        const merged = coins.map((next) => {
          const prev = byId.get(next.id);
          return prev ? {
            ...next, trades: prev.trades, holderRows: prev.holderRows, rawTrades: prev.rawTrades, chat: prev.chat, imageUrl: prev.imageUrl, desc: prev.desc, metaUri: prev.metaUri, socials: prev.socials,
            tradesTotal: prev.tradesTotal, holdersTotal: prev.holdersTotal, commentsTotal: prev.commentsTotal,
          } : next;
        });
        return { ...st, coins: merged, coinsLoading: false, coinsError: "" };
      });
      resolveCoinImages();
      return coins;
    } catch (e) {
      set({ coinsLoading: false, coinsError: String(e.message || e) });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  // A freshly-launched token isn't visible until (a) the tx is actually
  // mined on Ink and (b) the subgraph indexes it -- both take real seconds
  // that this can't shortcut. What it CAN shortcut is the frontend's own
  // polling gap: the ambient loadCoins loop only runs every REFRESH_MS
  // (15s), so a single blind refresh could otherwise leave the user
  // staring at PendingLaunchPanel for up to another 15s after the real
  // work is already done. Poll tighter for a short window right after a
  // launch instead, and stop as soon as the token actually shows up.
  function pollUntilFound(address, attemptsLeft = 8) {
    setTimeout(async () => {
      const coins = await loadCoins();
      const found = coins?.some((c) => c.id.toLowerCase() === address.toLowerCase());
      if (!found && attemptsLeft > 1) pollUntilFound(address, attemptsLeft - 1);
    }, 2500);
  }

  // Only start polling for the new token/campaign once the launch tx is
  // actually confirmed on-chain -- a sim-then-send can still revert at
  // execution time (state moved between the two), and polling for
  // something that will never exist would otherwise strand the user on
  // PendingLaunchPanel forever with no explanation. On revert, bounce back
  // to the create form so they can see the error (surfaced via the tx
  // modal / runTx's own reverted-stage handling) and retry.
  function confirmAndPoll(hash, address) {
    waitForTx(chain, hash)
      .then((receipt) => {
        if (receipt.status === "success") pollUntilFound(address);
        else { flash("Launch reverted on-chain. Nothing was created."); set({ screen: "createForm" }); }
      })
      .catch(() => flash("Could not confirm the launch transaction."));
  }

  function resolveCoinImages() {
    setS((st) => {
      for (const coin of st.coins) {
        const uri = coin.metaOverrideUri || coin.metaUri;
        if (coin.imageUrl || !uri) continue;
        resolveTokenImage(uri).then((url) => {
          if (!url) return;
          setS((s2) => ({ ...s2, coins: s2.coins.map((c) => (c.id === coin.id ? { ...c, imageUrl: url } : c)) }));
        });
      }
      return st;
    });
  }

  const refreshBalance = useCallback(async () => {
    if (!account) return;
    try {
      const bal = await getNativeBalance(chain, account);
      set({ nativeBalance: bal });
    } catch (e) { console.error("failed to fetch balance", e); }
  }, [account, set, chain]);

  const loadPortfolio = useCallback(async () => {
    if (!account) return;
    try {
      const data = await api.portfolio(chain, account);
      set({ portfolio: data });
    } catch (e) { console.error("failed to load portfolio", e); }
  }, [account, set, chain]);

  useEffect(() => { loadCoins(); const t = setInterval(loadCoins, REFRESH_MS); return () => clearInterval(t); }, [loadCoins]);
  useEffect(() => {
    if (!account) { set({ nativeBalance: 0n, portfolio: EMPTY_PORTFOLIO }); return; }
    refreshBalance(); loadPortfolio();
    const t = setInterval(refreshBalance, REFRESH_MS);
    return () => clearInterval(t);
  }, [account, refreshBalance, loadPortfolio, set]);

  // Real, measured system status for the persistent bottom bar: the backend
  // occasionally times its own subgraph round-trip (see backend/src/
  // health.ts) and reports the last reading via /health; this measures the
  // frontend's own round-trip to that same endpoint on top, so the bar
  // reflects both legs -- API reachability AND subgraph health -- not a
  // hardcoded "synced".
  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      const start = performance.now();
      try {
        const res = await api.health();
        if (cancelled) return;
        // /health reports per-chain subgraph health -- read the CURRENTLY
        // SELECTED chain's entry, not a hardcoded one, so the status bar
        // reflects whichever chain is actually being browsed.
        const chainHealth = res.subgraph?.[s.chain];
        set({ health: {
          ok: res.ok && chainHealth?.ok !== false,
          frontendMs: Math.round(performance.now() - start),
          subgraphMs: chainHealth?.latencyMs ?? null,
          checkedAt: Date.now(),
        } });
      } catch {
        if (cancelled) return;
        set({ health: { ok: false, frontendMs: null, subgraphMs: null, checkedAt: Date.now() } });
      }
    }
    checkHealth();
    const t = setInterval(checkHealth, HEALTH_CHECK_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [set, s.chain]);

  // Shared by loadTokenDetail (CURVE/INSTANT) and loadCampaignDetail (RAISE)
  // -- metaURI() is the same ERC20 field on every family's token clone.
  // `overrideUri`, when given (DuckMetaOverride has registered this token —
  // see coin.metaOverrideUri), wins over both knownUri and the on-chain
  // metaURI() fallback: the whole point of an override is that nothing else
  // gets read once one exists. Only an override can also correct the
  // *displayed* name/symbol (the real ones are immutable ERC20 fields this
  // can't touch) -- resolveTokenNameSymbol is only even attempted in that
  // case, so the non-override path's name/symbol behavior is unchanged.
  const loadTokenMeta = useCallback(async (address, knownUri, overrideUri, knownImageUrl) => {
    try {
      const originalUri = knownUri || (overrideUri ? null : await fetchTokenMetaUri(chain, address));
      const uri = overrideUri || originalUri;
      if (!uri) return;
      // The backend already resolved this image server-side (see
      // adapters.js) -- re-fetching it here too would just be the exact
      // same slow client-side IPFS round trip this was built to avoid.
      const [desc, imageUrl, socials, nameSymbol] = await Promise.all([
        resolveTokenDescription(uri), knownImageUrl ? Promise.resolve(knownImageUrl) : resolveTokenImage(uri), resolveTokenSocials(uri),
        overrideUri ? resolveTokenNameSymbol(uri) : Promise.resolve(null),
      ]);
      setS((st) => ({
        ...st,
        coins: st.coins.map((c) => {
          if (c.id !== address) return c;
          const patch = { desc: desc || c.desc, imageUrl: imageUrl || c.imageUrl, socials };
          if (originalUri) patch.metaUri = originalUri;
          if (nameSymbol?.name) patch.name = nameSymbol.name;
          if (nameSymbol?.symbol) { patch.symbol = nameSymbol.symbol; patch.ticker = "$" + nameSymbol.symbol; patch.initials = nameSymbol.symbol.slice(0, 2).toUpperCase(); }
          return { ...c, ...patch };
        }),
      }));
    } catch (e) { console.error("failed to load token metadata", e); }
  }, [chain]);

  const loadTokenDetail = useCallback(async (address, knownMetaUri, overrideUri, knownImageUrl) => {
    loadTokenMeta(address, knownMetaUri, overrideUri, knownImageUrl);
    await Promise.all([fetchTradesPage(address, 1), fetchHoldersPage(address, 1)]);
    // Comments are Postgres-backed, a different and newer subsystem than
    // the subgraph-sourced trades/holders above -- fired independently so a
    // DB hiccup (or a deployment with DATABASE_URL not set yet) leaves the
    // rest of the page working, not fails it too.
    fetchCommentsPage(address, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTokenMeta]);

  // True numbered pagination, not "load more": every page fetches exactly
  // that page directly (offset computed from the page number), so jumping
  // straight to page 7 works without having visited 2-6 first. Each REPLACES
  // the tab's rows rather than appending, unlike the old cursor-based
  // approach this replaced.
  async function fetchTradesPage(address, page) {
    try {
      const res = await api.trades(chain, address, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      setS((st) => {
        const coin = st.coins.find((c) => c.id === address);
        if (!coin) return st;
        const labels = {};
        if (coin.creator) labels[coin.creator.toLowerCase()] = "Creator";
        return {
          ...st,
          coins: st.coins.map((c) => c.id === address ? {
            ...c,
            trades: res.items.map((tr) => tradeToRow(chain, tr, labels, coin.quote)),
            rawTrades: res.items, tradesTotal: res.total,
          } : c),
        };
      });
    } catch (e) { console.error("failed to load trades page", e); }
  }

  async function fetchHoldersPage(address, page) {
    try {
      const res = await api.holders(chain, address, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      setS((st) => {
        const coin = st.coins.find((c) => c.id === address);
        if (!coin) return st;
        const totalSupply = coin.totalSupply ? Number(coin.totalSupply) / 1e18 : 1_000_000_000;
        const labels = {};
        if (coin.creator) labels[coin.creator.toLowerCase()] = "Creator";
        const startRank = (page - 1) * PAGE_SIZE;
        return {
          ...st,
          coins: st.coins.map((c) => c.id === address ? {
            ...c,
            holderRows: res.items.map((h, i) => holderToRow(chain, h, startRank + i, totalSupply, labels)),
            holdersTotal: res.total,
          } : c),
        };
      });
    } catch (e) { console.error("failed to load holders page", e); }
  }

  async function fetchCommentsPage(address, page) {
    try {
      const res = await api.comments(chain, address, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      setS((st) => {
        const coin = st.coins.find((c) => c.id === address);
        if (!coin) return st;
        const labels = {};
        if (coin.creator) labels[coin.creator.toLowerCase()] = "Creator";
        return {
          ...st,
          coins: st.coins.map((c) => c.id === address ? {
            ...c,
            chat: res.items.map((cm) => commentToRow(chain, cm, labels)),
            commentsTotal: res.total,
          } : c),
        };
      });
    } catch (e) { console.error("failed to load comments page", e); }
  }

  // Refetches page 1 rather than prepending locally -- consistent with the
  // "always fetch the real page" pagination model above (prepending would
  // leave the tab holding PAGE_SIZE+1 rows until the next page fetch, and
  // wouldn't update commentsTotal). Returns whether it succeeded so the
  // caller can reset its own page-number state back to 1.
  async function postComment(coin, text) {
    if (!text) return false;
    set({ chatDraft: "" });
    try {
      await api.postComment(chain, coin.id, account || "", text);
      await fetchCommentsPage(coin.id, 1);
      return true;
    } catch (e) {
      flash(errorText(e, "Couldn't post comment."));
      set({ chatDraft: text }); // don't lose what they typed on a failed post
      return false;
    }
  }

  function errorText(e, fallback) {
    const decoded = e?.cause?.data?.errorName;
    if (decoded) return decoded;
    const base = e?.shortMessage || e?.message || fallback;
    const causeMsg = e?.cause?.shortMessage || e?.cause?.message;
    return causeMsg && causeMsg !== base ? `${base}: ${causeMsg}` : base;
  }

  const toastTimer = { current: null };
  function flash(msg) {
    clearTimeout(window.__duckToast);
    set({ toast: msg });
    window.__duckToast = setTimeout(() => set({ toast: "" }), 3800);
  }
  function requireWallet() {
    if (account) return true;
    if (openConnectModal) openConnectModal();
    else flash("Connect a wallet first.");
    return false;
  }
  function copyWalletAddress() {
    if (!account) return;
    navigator.clipboard?.writeText(account).then(() => flash("Address copied.")).catch(() => flash("Couldn't copy address."));
  }
  function disconnectWallet() {
    set({ walletMenuOpen: false });
    disconnect();
  }
  function openToken(rawId) {
    // Case-insensitive lookup: a /0x... URL typed or pasted from a block
    // explorer often carries EIP-55 checksummed casing, while subgraph ids
    // are lowercase. Normalize to the coin's own canonical id so every
    // other s.coins.find(x => x.id === s.tokenId) lookup downstream (view
    // model, URL sync) keeps matching regardless of the casing a link came
    // in with.
    const coin = s.coins.find((c) => c.id.toLowerCase() === rawId.toLowerCase());
    const id = coin ? coin.id : rawId.toLowerCase();
    if (coin && coin.family === "CAMPAIGN") {
      set({ screen: "campaign", tokenId: id, campaignDetail: null });
      if (coin.campaignId) loadCampaignDetail(coin.campaignId);
      loadTokenMeta(id, coin.metaUri, coin.metaOverrideUri, coin.imageUrl);
      getRaiseDefaults(chain).then((d) => set({ raiseDefaults: d })).catch(() => {});
    } else {
      set({ screen: "token", tokenId: id, tab: "Trades", side: "buy", amount: "250" });
      loadTokenDetail(id, coin?.metaUri, coin?.metaOverrideUri, coin?.imageUrl);
    }
    window.scrollTo(0, 0);
  }

  const loadCampaignDetail = useCallback(async (campaignId) => {
    try {
      const data = await api.campaign(chain, campaignId);
      set({ campaignDetail: data });
    } catch (e) { console.error("failed to load campaign detail", e); }
  }, [set, chain]);

  // Vault/governance data is inherently per-token (each token has exactly
  // one vault, cloned once at creation, and one lazily-cloned governor) --
  // these load into the Lending/Governance tabs on the token's own page,
  // not a global cross-token market list.
  const loadTokenVault = useCallback(async (tokenAddress) => {
    set({ vaultsLoading: true, vaultDetail: null });
    try {
      const [vaultDetail, vaultConfigData] = await Promise.all([api.vault(chain, tokenAddress), api.vaultConfig(chain)]);
      set({ vaultDetail, vaultConfigData, vaultsLoading: false });
    } catch (e) { console.error("failed to load vault", e); set({ vaultsLoading: false }); }
  }, [set, chain]);

  const loadTokenProposals = useCallback(async (tokenAddress) => {
    set({ proposalsLoading: true });
    try {
      const proposals = await api.proposals(chain, tokenAddress);
      set({ proposals, proposalsLoading: false });
    } catch (e) { console.error("failed to load proposals", e); set({ proposalsLoading: false }); }
  }, [set, chain]);

  const openProposal = useCallback(async (id) => {
    set({ proposalDetail: null });
    try {
      const proposalDetail = await api.proposal(chain, id);
      set({ proposalDetail });
    } catch (e) { console.error("failed to load proposal detail", e); }
  }, [set, chain]);

  async function runTx(label, fn) {
    if (!requireWallet()) return null;
    if (s.txPending) return null;
    // Every real write must land on the chain the app has selected -- the
    // wallet may still be on whatever it was last connected to (a different
    // chain entirely, or the wrong one after a chain switch here). Prompt
    // the wallet's own switch-or-add-network flow before ever simulating or
    // signing anything.
    if (walletChainId !== chain.chainId) {
      try {
        await switchChainAsync({ chainId: chain.chainId });
      } catch {
        flash(`Switch your wallet to ${chain.name} to continue.`);
        return null;
      }
    }
    set({ txPending: true, tx: { stage: "pending" } });
    try {
      const hash = await fn();
      set({ tx: { stage: "pending", hash } });
      waitForTx(chain, hash)
        .then((receipt) => set((st) => (st.tx ? { tx: { stage: receipt.status === "success" ? "success" : "reverted", hash } } : {})))
        .catch(() => set((st) => (st.tx ? { tx: { stage: "reverted", hash } } : {})))
        .finally(refreshBalance);
      return hash;
    } catch (e) {
      flash(errorText(e, label + " failed."));
      set({ tx: null });
      return null;
    } finally {
      set({ txPending: false });
    }
  }

  // ---------- lending ----------
  // Every amount arrives already parsed to raw units by the caller
  // (LendingTab.jsx, using the vault's own currencyDecimals for
  // borrow/repay or 18 for the launched token itself for collateral) --
  // matches buy/sell's own division of responsibility below. Refreshes the
  // vault detail on success so reserves/borrows/the open-positions table
  // reflect the new state without a manual reload.
  async function borrowVault(vault, amount, tokenAddress) {
    const hash = await runTx("Borrow", () => borrowFromVault(chain, { account, vault, amount }));
    if (hash) loadTokenVault(tokenAddress);
  }
  async function repayVaultLoan(vault, currency, amount, tokenAddress) {
    const hash = await runTx("Repay", () => repayVault(chain, { account, vault, currency, amount }));
    if (hash) loadTokenVault(tokenAddress);
  }
  async function addCollateral(vault, token, amount, tokenAddress) {
    const hash = await runTx("Add collateral", () => addVaultCollateral(chain, { account, vault, token, amount }));
    if (hash) loadTokenVault(tokenAddress);
  }
  async function withdrawCollateral(vault, amount, tokenAddress) {
    const hash = await runTx("Withdraw collateral", () => withdrawVaultCollateral(chain, { account, vault, amount }));
    if (hash) loadTokenVault(tokenAddress);
  }

  // ---------- governance ----------

  async function voteOnProposal(p, support) {
    const hash = await runTx("Vote", () => castVote(chain, { account, governor: p.governor, proposalId: p.proposalId, support }));
    if (hash) openProposal(p.id); // reuse the already-known-correct compound id rather than reconstructing it
  }
  async function executeGovernanceProposal(p) {
    const hash = await runTx("Execute", () => executeProposal(chain, {
      account, governor: p.governor, targets: p.targets, values: p.values, calldatas: p.calldatas, description: p.description,
    }));
    if (hash) openProposal(p.id);
  }

  // ---------- trading ----------

  // The trade panel's "PAY {asset} · BAL {n}" display needs the real
  // balance of whatever the token's own quote asset actually is -- native
  // balance is already tracked (s.nativeBalance), but an ERC20 quote asset
  // (USDG, AAPL, ...) has no client-side balance anywhere else, so this is
  // the one place that reads it.
  const refreshQuoteBalance = useCallback(async (coin) => {
    const quoteAsset = coin.quoteTokenAddress;
    if (!account || quoteAsset.toLowerCase() === ZERO_ADDRESS) { set({ quoteBalance: 0n }); return; }
    try { set({ quoteBalance: await getTokenBalance(chain, quoteAsset, account) }); } catch { set({ quoteBalance: 0n }); }
  }, [set, chain, account]);

  // Pays/receives directly in the token's own real quote asset (native or
  // ERC20) -- never a hardcoded native amount. Robinhood Chain has no
  // configured NATIVE_EXTERNAL_ROUTE at all (see chain/addresses.js), so a
  // "pay with native, auto-converted" convenience simply has nowhere to
  // source a non-native quote asset from; the direct path below is the only
  // one that actually works for an ERC20-quoted token today, and it's also
  // strictly simpler (one hop, no route dependency) for a native-quoted one.
  async function buy(coin, amt) {
    if (coin.family === "CAMPAIGN") return flash("This token is a campaign. Use Contribute instead of Buy.");
    if (!amt || amt <= 0) return flash("Enter an amount.");
    const quoteAsset = coin.quoteTokenAddress;
    const isNativeQuote = quoteAsset.toLowerCase() === ZERO_ADDRESS;
    const decimals = decimalsFor(chain, quoteAsset, [s.platformTokens.incubation, s.platformTokens.launcher, s.platformTokens.raise]);
    const amountIn = parseUnits(String(amt), decimals);
    if (isNativeQuote && amountIn > s.nativeBalance) return flash(`Not enough ${chain.nativeSymbol}. Need ${amt}.`);
    const isPool = coin.family === "INSTANT" || (coin.family === "CURVE" && coin.migrated);
    let hash;
    try {
      if (isPool) {
        const expected = await previewPoolBuyDirect(chain, { token: coin.id, hook: coin.hook, quoteAsset, amountIn });
        if (expected === 0n) return flash("Couldn't get a price quote for this pool right now.");
        const minOut = applySlippage(expected, s.slippageBps);
        hash = await runTx("Buy", () => buyOnPoolDirect(chain, { account, token: coin.id, hook: coin.hook, quoteAsset, amountIn, minOut }));
      } else {
        const expected = await previewCurveBuy(chain, coin.id, amountIn);
        const minOut = applySlippage(expected, s.slippageBps);
        hash = await runTx("Buy", () => buyCurve(chain, { account, token: coin.id, quoteToken: quoteAsset, amountIn, minOut }));
      }
    } catch (e) {
      return flash("Couldn't get a price quote. Try again. (" + errorText(e, "unknown") + ")");
    }
    if (hash) {
      await Promise.all([loadPortfolio(), loadTokenDetail(coin.id, coin.metaUri, coin.metaOverrideUri, coin.imageUrl), refreshQuoteBalance(coin)]);
      flash(`Bought ${coin.ticker} for ${amt} ${coin.quote}`);
    }
  }

  async function sell(coin, tokenAmount) {
    if (coin.family === "CAMPAIGN") return flash("Selling isn't available for campaign tokens.");
    if (!tokenAmount || tokenAmount <= 0) return flash("Enter an amount.");
    const amountIn = parseUnits(String(tokenAmount), 18);
    const isPool = coin.family === "INSTANT" || (coin.family === "CURVE" && coin.migrated);
    const quoteAsset = coin.quoteTokenAddress;
    let hash;
    try {
      if (isPool) {
        const expected = await previewPoolSellDirect(chain, { token: coin.id, hook: coin.hook, quoteAsset, amountIn });
        if (expected === 0n) return flash("Couldn't get a price quote for this pool right now.");
        const minOut = applySlippage(expected, s.slippageBps);
        hash = await runTx("Sell", () => sellOnPoolDirect(chain, { account, token: coin.id, hook: coin.hook, quoteAsset, amountIn, minOut }));
      } else {
        const expected = await previewCurveSell(chain, coin.id, amountIn);
        const minQuoteOut = applySlippage(expected, s.slippageBps);
        hash = await runTx("Sell", () => sellCurve(chain, { account, token: coin.id, amountIn, minQuoteOut }));
      }
    } catch (e) {
      return flash("Couldn't get a price quote. Try again. (" + errorText(e, "unknown") + ")");
    }
    if (hash) {
      await Promise.all([loadPortfolio(), loadTokenDetail(coin.id, coin.metaUri, coin.metaOverrideUri, coin.imageUrl), refreshQuoteBalance(coin)]);
      flash(`Sold ${coin.ticker} for ${coin.quote}`);
    }
  }

  // ---------- create ----------

  function onImagePick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (s.draftImage.previewUrl) URL.revokeObjectURL(s.draftImage.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    set({ draftImage: { file, previewUrl, uploading: true, ipfsUri: "", gatewayUrl: "", error: "" } });
    const form = new FormData();
    form.append("file", file);
    fetch(API_BASE + "/upload/image", { method: "POST", body: form })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `upload failed (${res.status})`);
        return res.json();
      })
      .then(({ ipfsUri, gatewayUrl }) => set((st) => ({ draftImage: { ...st.draftImage, uploading: false, ipfsUri, gatewayUrl } })))
      .catch((err) => set((st) => ({ draftImage: { ...st.draftImage, uploading: false, error: err.message || "upload failed" } })));
  }
  function clearImage() {
    if (s.draftImage.previewUrl) URL.revokeObjectURL(s.draftImage.previewUrl);
    set({ draftImage: EMPTY_IMAGE });
  }
  // Throws on any failure -- this becomes permanent, unfixable on-chain
  // metadata the instant a launch transaction lands (see backend/src/api/
  // routes/upload.ts's own comment on this), so a failed upload must block
  // submission entirely. Previously this silently fell back to returning the
  // plain description STRING as the metaURI, which isn't a URI at all --
  // every image/social for that token would have silently, permanently
  // failed to resolve, with no error ever shown to the creator.
  async function buildMetaURI(name, symbol, desc, socials) {
    let res;
    try {
      res = await fetch(API_BASE + "/upload/metadata", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbol, description: desc, image: s.draftImage.ipfsUri || "", socials: socials || {} }),
      });
    } catch {
      throw new Error("Couldn't reach the server to upload token metadata. Check your connection and try again.");
    }
    if (!res.ok) throw new Error("Metadata upload failed -- try again before launching.");
    const { ipfsUri } = await res.json();
    return ipfsUri;
  }
  function setSocial(field, value) {
    const key = s.family === "incubation" ? "draftCurve" : s.family === "launcher" ? "draftInstant" : "draftCampaign";
    set({ [key]: { ...s[key], socials: { ...s[key].socials, [field]: value } } });
  }

  async function submitCreate() {
    if (!requireWallet()) return;
    if (s.draftImage.uploading) return flash("Image is still uploading -- wait a moment and try again.");
    const { family, account: acct } = { family: s.family, account };
    if (family === "incubation") {
      const d = s.draftCurve;
      if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
      if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
      const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
      const decimals = decimalsFor(chain, d.quoteToken, [s.platformTokens.incubation]);
      let startVirtualQuote, migrationTargetQuote, metaURI;
      try {
        startVirtualQuote = await resolveQuoteUnits(chain, d.quoteToken, d.startTargetUsd || "1");
        migrationTargetQuote = await resolveQuoteUnits(chain, d.quoteToken, d.migrationTargetUsd || "10");
        if (migrationTargetQuote <= startVirtualQuote) return flash("Migration target must exceed the start target.");
        metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
      } catch (err) { return flash(err.message); }
      const isNativeQuoted = d.quoteToken.toLowerCase() === ZERO_ADDRESS;
      const earlyBuyAmount = d.earlyBuyAmount && Number(d.earlyBuyAmount) > 0 ? parseUnits(String(d.earlyBuyAmount), decimals) : 0n;
      let createdAddress;
      const hash = await runTx("Launch", async () => {
        const r = await createCurveToken(chain, {
          account: acct, name: d.name.trim(), symbol, supplyTier: d.supplyTier,
          curveBps: 8000n, liquidityBps: 2000n, quoteToken: d.quoteToken, startVirtualQuote, migrationTargetQuote,
          hookFeeBps: 0n, vaultBps: d.vaultBps, metaURI,
          buyAmountWei: isNativeQuoted ? earlyBuyAmount : 0n, earlyBuyAmount: isNativeQuoted ? 0n : earlyBuyAmount,
        });
        createdAddress = r.tokenAddress.toLowerCase();
        return r.hash;
      });
      if (hash) {
        set({ screen: "token", tokenId: createdAddress, tab: "Trades", side: "buy", amount: "250", draftImage: EMPTY_IMAGE });
        flash("Launch submitted."); loadTokenMeta(createdAddress); confirmAndPoll(hash, createdAddress);
      }
    } else if (family === "launcher") {
      const d = s.draftInstant;
      if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
      if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
      const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
      let launchMarketCap, metaURI;
      try {
        launchMarketCap = await resolveQuoteUnits(chain, d.quoteToken, d.launchMarketCapUsd || "10");
        metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
      } catch (err) { return flash(err.message); }
      const buyWei = d.buyAmountHype && Number(d.buyAmountHype) > 0 ? parseEther(String(d.buyAmountHype)) : 0n;
      let createdAddress;
      const hash = await runTx("Launch", async () => {
        const r = await launchInstant(chain, {
          account: acct, name: d.name.trim(), symbol, metaURI, quoteToken: d.quoteToken, supplyTier: d.supplyTier,
          launchMarketCap, quoteAmountWei: buyWei, vaultBps: d.vaultBps,
        });
        createdAddress = r.tokenAddress.toLowerCase();
        return r.hash;
      });
      if (hash) {
        set({ screen: "token", tokenId: createdAddress, tab: "Trades", side: "buy", amount: "250", draftImage: EMPTY_IMAGE });
        flash("Launch submitted."); loadTokenMeta(createdAddress); confirmAndPoll(hash, createdAddress);
      }
    } else {
      const d = s.draftCampaign;
      if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
      if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
      const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
      let goalWei, metaURI;
      try {
        goalWei = await resolveQuoteUnits(chain, d.dexQuoteAsset, d.goalUsd || "1");
        metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
      } catch (err) { return flash(err.message); }
      let createdAddress, createdCampaignId;
      const hash = await runTx("Create campaign", async () => {
        const r = await createCampaign(chain, {
          account: acct, name: d.name.trim(), symbol, metaURI, dexQuoteAsset: d.dexQuoteAsset, goalWei,
          supplyTier: d.supplyTier, vaultBps: d.vaultBps,
        });
        createdAddress = r.tokenAddress.toLowerCase(); createdCampaignId = r.campaignId;
        return r.hash;
      });
      if (hash) {
        set({ screen: "campaign", tokenId: createdAddress, campaignDetail: null, draftImage: EMPTY_IMAGE });
        flash("Campaign submitted."); loadTokenMeta(createdAddress); loadCampaignDetail(createdCampaignId); confirmAndPoll(hash, createdAddress);
      }
    }
  }

  // Proves a launch would succeed -- the exact same params (vanity salt,
  // uploaded metaURI, fees) run through a real simulateContract eth_call,
  // just stopped before the wallet is ever asked to sign or a transaction
  // sent. Shares submitCreate's validation/param-building so "simulate"
  // can never silently check something different from what "launch"
  // actually submits.
  async function simulateCreate() {
    if (!requireWallet()) return;
    if (s.draftImage.uploading) return flash("Image is still uploading -- wait a moment and try again.");
    const family = s.family;
    set({ simulating: true });
    try {
      if (family === "incubation") {
        const d = s.draftCurve;
        if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
        if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
        const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
        const decimals = decimalsFor(chain, d.quoteToken, [s.platformTokens.incubation]);
        const startVirtualQuote = await resolveQuoteUnits(chain, d.quoteToken, d.startTargetUsd || "1");
        const migrationTargetQuote = await resolveQuoteUnits(chain, d.quoteToken, d.migrationTargetUsd || "10");
        if (migrationTargetQuote <= startVirtualQuote) return flash("Migration target must exceed the start target.");
        const metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
        const isNativeQuoted = d.quoteToken.toLowerCase() === ZERO_ADDRESS;
        const earlyBuyAmount = d.earlyBuyAmount && Number(d.earlyBuyAmount) > 0 ? parseUnits(String(d.earlyBuyAmount), decimals) : 0n;
        await createCurveToken(chain, {
          account, name: d.name.trim(), symbol, supplyTier: d.supplyTier,
          curveBps: 8000n, liquidityBps: 2000n, quoteToken: d.quoteToken, startVirtualQuote, migrationTargetQuote,
          hookFeeBps: 0n, vaultBps: d.vaultBps, metaURI,
          buyAmountWei: isNativeQuoted ? earlyBuyAmount : 0n, earlyBuyAmount: isNativeQuoted ? 0n : earlyBuyAmount,
          dryRun: true,
        });
      } else if (family === "launcher") {
        const d = s.draftInstant;
        if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
        if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
        const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
        const metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
        const launchMarketCap = await resolveQuoteUnits(chain, d.quoteToken, d.launchMarketCapUsd || "10");
        const buyWei = d.buyAmountHype && Number(d.buyAmountHype) > 0 ? parseEther(String(d.buyAmountHype)) : 0n;
        await launchInstant(chain, {
          account, name: d.name.trim(), symbol, metaURI, quoteToken: d.quoteToken, supplyTier: d.supplyTier,
          launchMarketCap, quoteAmountWei: buyWei, vaultBps: d.vaultBps,
          dryRun: true,
        });
      } else {
        const d = s.draftCampaign;
        if (!d.name.trim() || !d.ticker.trim()) return flash("Name and ticker are required.");
        if (findBlockedTerm(d.name, d.ticker, d.desc)) return flash("That name, ticker, or description isn't allowed.");
        const symbol = d.ticker.trim().toUpperCase().slice(0, 9);
        const metaURI = await buildMetaURI(d.name.trim(), symbol, d.desc.trim(), d.socials);
        const goalWei = await resolveQuoteUnits(chain, d.dexQuoteAsset, d.goalUsd || "1");
        await createCampaign(chain, {
          account, name: d.name.trim(), symbol, metaURI, dexQuoteAsset: d.dexQuoteAsset, goalWei,
          supplyTier: d.supplyTier, vaultBps: d.vaultBps,
          dryRun: true,
        });
      }
      flash("Simulation succeeded. This would launch successfully.");
    } catch (e) {
      flash("Simulation failed: " + errorText(e, "unknown error"));
    } finally {
      set({ simulating: false });
    }
  }

  // ---------- campaign ----------

  async function contribute(coin, amt) {
    if (!amt || amt <= 0) return flash("Enter an amount.");
    // Contributions land directly in the campaign's own quote asset -- no
    // swap at finalize (see DuckCrowdfund.sol's contribute()) -- so the
    // amount must be parsed at THAT asset's own decimals, not always ether.
    const dexQuoteAsset = coin.quoteTokenAddress || ZERO_ADDRESS;
    const decimals = decimalsFor(chain, dexQuoteAsset, [s.platformTokens.raise]);
    const amountWei = parseUnits(String(amt), decimals);
    const hash = await runTx("Contribute", () => contributeCampaign(chain, { account, campaignId: BigInt(coin.campaignId), amount: amountWei, dexQuoteAsset }));
    if (hash) { await Promise.all([loadPortfolio(), loadCoins()]); flash(`Contributed ${amt} ${coin.quote}`); }
  }
  async function claimCampaignTokens(coin) {
    const hash = await runTx("Claim", () => claimCampaign(chain, { account, campaignId: BigInt(coin.campaignId) }));
    if (hash) { await loadPortfolio(); flash("Claimed."); }
  }
  async function claimCampaignRefundAction(coin) {
    const hash = await runTx("Refund", () => claimCampaignRefund(chain, { account, campaignId: BigInt(coin.campaignId) }));
    if (hash) { await loadPortfolio(); flash("Refunded."); }
  }
  async function finalizeCampaignAction(coin) {
    const hash = await runTx("Finalize", () => finalizeCampaign(chain, { account, campaignId: BigInt(coin.campaignId) }));
    if (hash) { await loadCoins(); flash("Finalized."); }
  }
  async function claimCreatorFees(tokenAddress) {
    const hash = await runTx("Claim fees", () => claimFees(chain, { account, token: tokenAddress }));
    if (hash) { await loadPortfolio(); flash("Fees claimed."); }
  }
  async function claimAllCreatorFees() {
    const hash = await runTx("Claim all fees", () => claimAllFees(chain, { account }));
    if (hash) { await loadPortfolio(); flash("All fees claimed."); }
  }

  // ---------- creator + liquidity / CTO (lazy-loaded on tab open) ----------

  const loadCreatorData = useCallback(async (coin) => {
    if (!coin || coin.family === "CAMPAIGN") return;
    set({ creatorLoading: true });
    try {
      const [position, creator] = await Promise.all([getPosition(chain, coin.id), getPositionCreator(chain, coin.id).catch(() => null)]);
      const tokenId = position?.[0] ?? 0n;
      const poolId = position?.[3] ?? null;
      const hasPool = !!poolId && poolId !== "0x0000000000000000000000000000000000000000000000000000000000000";
      let pool = null, ctoApp = null, hookAccrued = 0n, hookAccruedFailed = false, hookSplits = [], ctoFee = null;
      if (hasPool) {
        let hookAccruedResult;
        [pool, ctoApp, hookAccruedResult, hookSplits, ctoFee] = await Promise.all([
          getPool(chain, poolId, coin.hook).catch(() => null), getCtoApplication(chain, poolId, coin.hook).catch(() => null),
          getHookAccruedFees(chain, poolId, coin.hook).then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: 0n })),
          getHookFeeSplits(chain, poolId, coin.hook).catch(() => []), getCtoFee(chain, coin.hook).catch(() => null),
        ]);
        hookAccrued = hookAccruedResult.v;
        hookAccruedFailed = !hookAccruedResult.ok;
      }
      set({ creatorData: { hasPool, tokenId, poolId, pool, creator, ctoApp, hookAccrued, hookAccruedFailed, hookSplits, ctoFee }, creatorLoading: false });
    } catch (e) {
      console.error("failed to load creator data", e);
      set({ creatorData: null, creatorLoading: false });
    }
  }, [set, chain]);

  const selectedCoin = s.coins.find((x) => x.id === s.tokenId);
  useEffect(() => {
    if (s.screen === "token" && s.tab === "Creator + liquidity" && selectedCoin) loadCreatorData(selectedCoin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.tab, s.tokenId]);

  useEffect(() => {
    if (s.screen === "token" && selectedCoin && selectedCoin.family !== "CAMPAIGN") refreshQuoteBalance(selectedCoin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.tokenId, account]);

  useEffect(() => {
    if (s.screen === "token" && s.tab === "Lending" && s.tokenId) loadTokenVault(s.tokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.tab, s.tokenId]);

  useEffect(() => {
    if (s.screen === "token" && s.tab === "Governance" && s.tokenId) loadTokenProposals(s.tokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.tab, s.tokenId]);

  // Live "you receive ~X" estimate, debounced -- reuses the exact same
  // preview calls buy()/sell() use for minOut, just without submitting
  // anything. Cleared whenever the amount/side/token changes so a stale
  // estimate from a previous keystroke never lingers on screen.
  useEffect(() => {
    if (s.screen !== "token" || !selectedCoin || selectedCoin.family === "CAMPAIGN") return;
    const amt = parseFloat(s.amount);
    if (!amt || amt <= 0) { set({ previewOut: null, previewLoading: false }); return; }
    const coin = selectedCoin;
    const buying = s.side === "buy";
    set({ previewLoading: true });
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const isPool = coin.family === "INSTANT" || (coin.family === "CURVE" && coin.migrated);
        const quoteAsset = coin.quoteTokenAddress;
        let out = null;
        if (buying) {
          const decimals = decimalsFor(chain, quoteAsset, [s.platformTokens.incubation, s.platformTokens.launcher, s.platformTokens.raise]);
          const amountIn = parseUnits(String(amt), decimals);
          out = isPool
            ? await previewPoolBuyDirect(chain, { token: coin.id, hook: coin.hook, quoteAsset, amountIn })
            : await previewCurveBuy(chain, coin.id, amountIn);
        } else {
          const amountIn = parseUnits(String(amt), 18);
          out = isPool
            ? await previewPoolSellDirect(chain, { token: coin.id, hook: coin.hook, quoteAsset, amountIn })
            : await previewCurveSell(chain, coin.id, amountIn);
        }
        if (!cancelled) set({ previewOut: out, previewLoading: false });
      } catch {
        if (!cancelled) set({ previewOut: null, previewLoading: false });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.tokenId, s.side, s.amount, chain]);

  // Triggers DuckLocker.claimFees, which collects the LP-position's trading
  // fee and (same call, best-effort) the hook's separate creator fee --
  // but only the hook's fee actually pays the creator. The LP-position fee
  // itself always goes token-side-burned (0.5%, realized on buys) / quote-
  // side-to-platform-wallet (0.5%, realized on sells) via DuckLocker.
  // _collectAndDistribute -- the creator is just the address permitted to
  // trigger the collection, not a recipient of that side.
  async function claimCreatorAndHookFees(coin) {
    const hash = await runTx("Claim fees", () => claimFees(chain, { account, token: coin.id }));
    if (hash) { await Promise.all([loadPortfolio(), loadCreatorData(coin)]); flash("Fees claimed."); }
  }
  // Separate from the above: DuckIncubation's own 1% curve-trading fee,
  // accrued pre-migration but only claimable once migrated.
  async function claimCurveFeeAction(coin) {
    const hash = await runTx("Claim curve fee", () => claimCurveFee(chain, { account, token: coin.id }));
    if (hash) { await Promise.all([loadPortfolio(), loadCreatorData(coin)]); flash("Curve fee claimed."); }
  }
  async function saveFeeSplits(coin, poolId, splits) {
    let hash;
    if (poolId) hash = await runTx("Save fee settings", () => setHookFeeSplits(chain, { account, poolId, splits, hook: coin.hook }));
    if (hash) { await loadCreatorData(coin); flash("Fee settings saved."); }
  }
  async function buyTakeover(coin, poolId, newCreator) {
    const hash = await runTx("Buy takeover", () => applyForCTO(chain, { account, poolId, newCreator: newCreator || account, hook: coin.hook }));
    if (hash) { await loadCreatorData(coin); flash("CTO application submitted."); }
  }

  // ---------- render ----------

  const v = buildViewModel({
    s, chain, set, account, isConnected, disconnect, openConnectModal, setChain, copyWalletAddress, disconnectWallet,
    loadCoins, loadPortfolio, loadTokenDetail, fetchTradesPage, fetchHoldersPage, fetchCommentsPage, postComment, openToken, flash, requireWallet,
    buy, sell, submitCreate, simulateCreate, onImagePick, clearImage, setSocial,
    contribute, claimCampaignTokens, claimCampaignRefundAction, finalizeCampaignAction,
    claimCreatorFees, claimAllCreatorFees, loadCreatorData, claimCreatorAndHookFees, claimCurveFeeAction, saveFeeSplits, buyTakeover,
    loadTokenVault, loadTokenProposals, openProposal,
    borrowVault, repayVaultLoan, addCollateral, withdrawCollateral,
    voteOnProposal, executeGovernanceProposal,
  });

  const m = v.isMobile;
  return (
    <div style={cs("min-height:100vh;display:flex;flex-direction:column;background:var(--paper)")}>

      <div style={cs("flex:1;min-width:0;max-width:100%;display:flex;flex-direction:column")}>
        <header style={cs("position:sticky;top:0;z-index:40;background:rgba(23,23,23,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)")}>
          <div style={cs(`display:flex;align-items:center;gap:${m ? "10px" : "22px"};padding:0 ${m ? "12px" : "24px"};min-height:${m ? "52px" : "58px"};max-width:1320px;margin:0 auto;width:100%;box-sizing:border-box`)}>
            <div onClick={v.goHome} style={cs("display:flex;align-items:center;gap:9px;cursor:pointer;flex:none")}>
              <img src="/duckfun-logo.png" alt="duckfun" style={cs(`width:${m ? "24px" : "26px"};height:${m ? "24px" : "26px"};object-fit:contain;display:block`)} />
              {!m && <span style={cs("font-size:15.5px;font-weight:600;letter-spacing:-.02em")}>duckfun</span>}
            </div>
            <div style={cs("flex:1;min-width:0")}></div>
            {v.isHome && !m && (
              <div style={cs("display:flex;align-items:center;gap:8px;height:36px;padding:0 11px;border:1px solid var(--line);border-radius:6px;background:var(--paper);flex:1 1 200px;max-width:280px;min-width:0")}>
                <span style={cs("color:var(--mute);font-size:13px")}>⌕</span>
                <input value={v.query} onChange={v.setQuery} placeholder="Search name, symbol or address" style={cs("border:0;outline:0;background:transparent;font-size:13px;width:100%")} />
              </div>
            )}
            <div ref={chainMenuRef} style={cs("position:relative;flex:none")}>
              <button onClick={v.toggleChainMenu} title={v.chainName} style={cs(`display:flex;align-items:center;gap:6px;height:36px;padding:0 ${m ? "9px" : "10px"};border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);cursor:pointer`)}>
                <img src={v.chainLogoUrl} alt={v.chainName} style={cs("width:20px;height:20px;border-radius:999px;display:block;flex:none;object-fit:cover")} />
                <span style={cs(`font-size:9px;color:var(--mute);transform:${v.chainMenuOpen ? "rotate(180deg)" : "none"}`)}>▾</span>
              </button>
              {v.chainMenuOpen && (
                <div style={cs("position:absolute;top:42px;right:0;z-index:50;min-width:120px;border:1px solid var(--line);border-radius:8px;background:var(--card);box-shadow:var(--sh);overflow:hidden;padding:4px")}>
                  {v.chainOptions.map((o) => (
                    <button key={o.slug} onClick={o.go} style={cs(`display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:6px;background:${o.slug === v.chainSlug ? "var(--paper)" : "transparent"};color:var(--ink);font-size:13px;font-weight:${o.slug === v.chainSlug ? "700" : "500"};text-align:left;cursor:pointer`)}>
                      {o.label}
                      {o.slug === v.chainSlug && <span style={cs("color:var(--lime);font-size:12px")}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={walletMenuRef} style={cs("position:relative;flex:none")}>
              <button onClick={v.toggleWallet} style={cs(`display:flex;align-items:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--line);border-radius:6px;background:${v.walletBg};color:${v.walletFg};font-family:${v.walletFont};font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer`)}>
                {v.connected && <span style={cs("width:7px;height:7px;border-radius:99px;background:var(--lime);flex:none")}></span>}
                {v.walletLabel}
                {v.connected && <span style={cs(`font-size:9px;opacity:.7;transform:${v.walletMenuOpen ? "rotate(180deg)" : "none"}`)}>▾</span>}
              </button>
              {v.connected && v.walletMenuOpen && (
                <div style={cs("position:absolute;top:42px;right:0;z-index:50;min-width:220px;border:1px solid var(--line);border-radius:8px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
                  <div style={cs("padding:12px 14px;border-bottom:1px solid var(--line)")}>
                    <div style={cs("font-family:'JetBrains Mono',monospace;font-size:13.5px;font-weight:600")}>{v.accountShort}</div>
                    <div style={cs("font-size:11.5px;color:var(--mute);margin-top:3px")}>{v.balance} {v.nativeSymbol} on {v.chainName}</div>
                  </div>
                  <button onClick={() => { v.goPortfolio(); v.closeWalletMenu(); }} style={cs("display:block;width:100%;padding:11px 14px;border:0;background:transparent;color:var(--ink);font-size:13px;font-weight:600;text-align:left;cursor:pointer")}>Portfolio</button>
                  <button onClick={() => { v.copyWalletAddress(); v.closeWalletMenu(); }} style={cs("display:block;width:100%;padding:11px 14px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--ink);font-size:13px;font-weight:500;text-align:left;cursor:pointer")}>Copy address</button>
                  {v.walletExplorerUrl && (
                    <a href={v.walletExplorerUrl} target="_blank" rel="noreferrer" onClick={v.closeWalletMenu} style={cs("display:block;padding:11px 14px;font-size:13px;font-weight:500;color:var(--ink);border-bottom:0")}>View on Explorer ↗</a>
                  )}
                  <button onClick={v.disconnectWallet} style={cs("display:block;width:100%;padding:11px 14px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--neg);font-size:13px;font-weight:600;text-align:left;cursor:pointer")}>Disconnect</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main style={cs(`flex:1;padding:${m ? "14px 12px 76px" : "22px 24px 96px"};width:100%;max-width:1320px;margin:0 auto;min-width:0`)}>
          {v.isHome && <DiscoverPage v={v} />}
          {v.isToken && (v.coin ? <TokenPage v={v} /> : <PendingLaunchPanel v={v} />)}
          {v.isCreate && <CreateChooserPage v={v} />}
          {v.isCreateForm && <CreateFormPage v={v} />}
          {v.isCampaign && (v.camp ? <CampaignPage v={v} /> : <PendingLaunchPanel v={v} />)}
          {v.isPortfolio && <PortfolioPage v={v} />}
        </main>
      </div>

      {/* Persistent status/docs/social bar -- pinned to the bottom on every
          screen, full-width now that there's no sidebar to offset past. */}
      <div style={cs(`position:fixed;left:0;right:0;bottom:0;z-index:55;display:flex;align-items:center;gap:10px;height:44px;padding:0 ${m ? "12px" : "20px"};border-top:1px solid var(--line);background:rgba(23,23,23,.92);backdrop-filter:blur(8px);font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute)`)}>
        <span style={cs(`width:6px;height:6px;border-radius:99px;background:${v.health.checkedAt && !v.health.ok ? "var(--neg)" : "var(--lime)"};flex:none`)}></span>
        <span title={v.health.checkedAt ? `API ${v.health.frontendMs}ms · Subgraph ${v.health.subgraphMs != null ? v.health.subgraphMs + "ms" : "—"}` : "Checking system status…"}>
          {m ? v.chainName.toUpperCase() : v.chainName} {v.chainId}{v.health.frontendMs != null && ` · ${v.health.frontendMs}ms`}
        </span>
        <div style={cs("margin-left:auto;display:flex;gap:6px")}>
          <a href="https://docs.duckfun.family" target="_blank" rel="noreferrer" title="Docs" style={cs("width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4" /><path d="M9 12h6M9 16h6" /></svg>
          </a>
          <a href="https://x.com/duckfunfamily" target="_blank" rel="noreferrer" title="duckfun on X" style={cs("width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)")}>
            <XIcon />
          </a>
          <a href="https://t.me/DuckFunFamily" target="_blank" rel="noreferrer" title="duckfun on Telegram" style={cs("width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)")}>
            <TelegramIcon />
          </a>
        </div>
      </div>

      {v.txOpen && (
        <div style={cs("position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px")}>
          <div style={cs("width:100%;max-width:400px;border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden")}>
            <div style={cs(`padding:26px 22px;border-bottom:1px solid var(--line);text-align:center;background:${v.tx.headBg};color:${v.tx.headFg}`)}>
              <div style={cs(`width:46px;height:46px;margin:0 auto 16px;border:3px solid ${v.tx.headFg};border-radius:999px;border-top-color:${v.tx.ringTop};animation:${v.tx.anim};display:flex;align-items:center;justify-content:center;font-size:19px`)}>{v.tx.glyph}</div>
              <div style={cs("font-size:19px;font-weight:700;letter-spacing:-.03em")}>{v.tx.title}</div>
              <div style={cs(`font-size:12.5px;margin-top:7px;line-height:1.5;opacity:${v.tx.headFg === "#fff" ? ".9" : "1"};color:${v.tx.headFg === "#fff" ? "#fff" : "var(--mute)"}`)}>{v.tx.sub}</div>
            </div>
            <div style={cs("padding:14px 18px;border-bottom:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute);word-break:break-all;line-height:1.5")}>{v.tx.hash}</div>
            <div style={cs("display:flex")}>
              {v.tx.explorerUrl && (
                <a href={v.tx.explorerUrl} target="_blank" rel="noreferrer" style={cs("flex:1;padding:14px;text-align:center;font-size:13.5px;font-weight:600;border:0;border-right:1px solid var(--line)")}>Explorer ↗</a>
              )}
              <button onClick={v.closeTx} style={cs("flex:1;padding:14px;border:0;background:var(--ink);color:var(--card);font-size:13.5px;font-weight:600;cursor:pointer")}>{v.tx.cta}</button>
            </div>
          </div>
        </div>
      )}

      {v.toast && (
        <div style={cs(`position:fixed;z-index:60;left:50%;bottom:28px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:13px 20px;border:1px solid var(--line);border-radius:8px;background:var(--card);animation:slidein .22s ease both;max-width:90vw`)}>
          <span style={cs("width:7px;height:7px;background:var(--lime);flex:none")}></span>
          <span style={cs("font-size:13px")}>{v.toast}</span>
        </div>
      )}
    </div>
  );
}

// ---------- view-model ----------

function buildViewModel(ctx) {
  const { s, chain, set, account, isConnected, disconnect, openConnectModal } = ctx;
  const chainOptions = [{ slug: CHAIN.slug, label: CHAIN.name, go: () => {} }];
  const scr = s.screen;

  // Just four destinations now (Stats and How-it-works both dropped as
  // standalone pages) -- small enough to live entirely in a bottom tab bar,
  // matching brew.family/flap.sh's mobile pattern but used at every viewport
  // instead of a desktop sidebar + separate mobile drawer.
  const filters = ["All", "CURVE", "INSTANT", "CAMPAIGN", "Migrated"].map((key) => {
    const label = key === "CURVE" ? "Bonding" : key === "INSTANT" ? "Instant" : key === "CAMPAIGN" ? "Crowdlaunch" : key;
    return Object.assign({ key, label, dv: key === "All" ? "0" : "1px solid var(--line)", go: () => set({ filter: key }) }, block(s.filter === key));
  });

  let list = s.coins.slice();
  if (s.filter === "Migrated") list = list.filter((c) => c.migrated);
  else if (s.filter !== "All") list = list.filter((c) => c.family === s.filter);
  // A token with no priced trade yet has no mcUsd to test -- pass it through
  // rather than guess, so an untraded launch is never hidden by mistake.
  if (s.mcapFilter !== "any") { const test = MCAP_TEST[s.mcapFilter]; list = list.filter((c) => c.mcUsd == null || test(c.mcUsd)); }
  if (s.launchedFilter !== "any") { const test = LAUNCHED_TEST[s.launchedFilter]; list = list.filter((c) => test(c.ageMin)); }
  if (s.quoteFilter !== "any") list = list.filter((c) => c.quote === s.quoteFilter);
  const q = s.query.trim().toLowerCase();
  if (q) list = list.filter((c) => (c.name + c.ticker + c.dev).toLowerCase().includes(q));
  const quoteFilterOptions = ["any", ...new Set(s.coins.map((c) => c.quote))];

  const isInstant = (c) => c.family === "INSTANT";
  const shape = (c) => ({
    id: c.id, family: c.family === "CURVE" ? "BONDING" : c.family === "INSTANT" ? "INSTANT" : "CROWDLAUNCH",
    famBg: c.famBg, famFg: c.famFg, initials: c.initials, imageUrl: c.imageUrl, symbol: c.ticker, name: c.name,
    creator: shortAddress(c.creator), age: ageLabel(c.ageMin),
    price: usdOrQuote(c.priceUsd, c.price, c.quote),
    chg: c.chg != null ? (c.chg >= 0 ? "+" : "") + c.chg.toFixed(1) + "%" : "—",
    chgColor: c.chg != null ? (c.chg >= 0 ? "var(--pos)" : "var(--neg)") : "var(--mute)",
    mcap: usdOrQuote(c.mcUsd, c.mc, c.quote), vol: usdOrQuote(c.volUsd, c.vol, c.quote),
    holders: c.holders.toLocaleString(), quote: c.quote,
    socials: c.socials || {},
    verified: !!c.verified,
    bars: buildSparkline(c.rawTrades),
    // Instant-launch tokens land straight on a V4 pool -- no curve to fill,
    // so the handoff hides the progress bar entirely for them (a permanent
    // "LP LOCKED" label instead) rather than showing a meaningless 100%.
    progLabel: c.family === "CAMPAIGN" ? "RAISE · ILLIQUID" : c.migrated ? "MIGRATED → V4" : "CURVE",
    progPct: isInstant(c) ? "LP LOCKED" : Math.round(c.pct) + "%",
    showProg: !isInstant(c),
    progWidth: Math.min(100, Math.max(0, c.pct)),
    progFill: c.family === "CAMPAIGN" ? ORANGE : c.pct >= 100 ? "var(--pos)" : INK,
    ticks: buildTicks(20, c.pct, INK),
    open: () => ctx.openToken(c.id),
  });

  // Three real ranking modes over the launched-token list. "Last activity"
  // ranks by real last-trade time (Token.lastTradeAt, tracked alongside
  // lastPrice) -- tokens that have never traded sort last, never faked into
  // looking recently active. Only used for the feed's own sort order now
  // (sortTabs, scoped by whatever family/search filters are active) -- the
  // hero slot below no longer ranks by market cap at all.
  const SORT_MODES = {
    "Last activity": { sort: (a, b) => (a.lastActiveMin ?? Infinity) - (b.lastActiveMin ?? Infinity) },
    "Top market cap": { sort: (a, b) => (b.mcUsd ?? b.mc) - (a.mcUsd ?? a.mc) },
    New: { sort: (a, b) => a.ageMin - b.ageMin },
  };
  const sortMode = SORT_MODES[s.sort] || SORT_MODES["Last activity"];
  const sortTabs = Object.keys(SORT_MODES).map((label) =>
    Object.assign({ label, go: () => set({ sort: label }) }, block(s.sort === label)));
  const feed = list.slice().sort(sortMode.sort).map(shape);

  // Discover's hero slot is pinned to the platform's own token ("The Duck",
  // $DUCK) -- not the highest-mcap community launch anymore.
  // platformTokenAddress() resolves to chain.PLATFORM_TOKEN (still null for
  // real until DUCK is actually live on-chain -- never fabricated) or, only
  // in demo mode, a canned address so the hero card can be previewed ahead
  // of the real launch. DiscoverPage renders a "not launched yet" hero card
  // whenever this is null instead of hiding the slot entirely.
  const duckAddr = platformTokenAddress(chain);
  const duckCoin = duckAddr
    ? s.coins.find((x) => x.id.toLowerCase() === duckAddr.toLowerCase())
    : null;
  const kingCoin = duckCoin ? { ...shape(duckCoin), mcapLabel: usdOrQuote(duckCoin.mcUsd, duckCoin.mc, duckCoin.quote) } : null;
  const duckLaunched = !!duckAddr;

  const c = s.coins.find((x) => x.id === s.tokenId);
  const buying = s.side === "buy";
  const amt = parseFloat(s.amount) || 0;
  const myBalance = c ? s.portfolio.holdings.find((h) => h.token?.id === c.id)?.balance : null;
  const myBalanceTokens = myBalance ? Number(myBalance) / 1e18 : 0;
  const myContribution = c ? s.portfolio.contributions.find((ct) => ct.campaign?.id === c.campaignId) : null;

  const walletTx = buildTxModel(chain, s, account);

  // Candle RESOLUTION (bucket size) applied across the token's whole trade
  // history -- like a real exchange's timeframe picker, not a "how far back"
  // filter. "ALL" omits a fixed size so buildCandles auto-picks one from the
  // real history's span.
  const RANGE_BUCKET_SECONDS = { "5M": 300, "1H": 3600, "4H": 4 * 3600, "1D": 86400, ALL: undefined };
  const fmtOhlc = (v) => compactNumber(v);
  let candles = [], ohlc = null;
  if (c) {
    // A fixed bucket picked by the range buttons can be far coarser than a
    // brand-new token's real trade history actually needs -- a token with
    // only a few minutes/hours of trades on the default "1D" bucket would
    // otherwise always collapse into one giant, uninformative candle. Fall
    // back to buildCandles' own span-proportional auto-bucketing (same as
    // "ALL" already does) whenever the fixed choice would yield well under
    // 5 candles across the real data.
    let bucketSeconds = RANGE_BUCKET_SECONDS[s.range];
    if (bucketSeconds && c.rawTrades?.length > 1) {
      const times = c.rawTrades.map((t) => Number(t.timestamp));
      const span = Math.max(...times) - Math.min(...times);
      if (span > 0 && span < bucketSeconds * 5) bucketSeconds = undefined;
    }
    candles = buildCandles(c.rawTrades || [], c.curveSeed, bucketSeconds);
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      // pctChange computed from the RAW numbers, before formatting --
      // ohlc.o/c below become display strings that can contain unicode
      // subscript digits (compactNumber's small-price notation), which
      // silently produce NaN if re-parsed as numbers via `-`.
      const pctChange = last.open !== 0 ? ((last.close - last.open) / Math.abs(last.open)) * 100 : 0;
      ohlc = { o: fmtOhlc(last.open), h: fmtOhlc(last.high), l: fmtOhlc(last.low), c: fmtOhlc(last.close), up: last.close >= last.open, pctChange };
    }
  }
  // Chart-only view: PRICE (as-is) or MCAP (every OHLC value scaled by
  // total supply -- a pure uniform rescale, same real trade data, not a
  // separate metric requiring its own indexed history). Never affects
  // sel.price/ohlc above, which is always the token header's real price.
  const supplyTokens = c && c.totalSupply ? Number(c.totalSupply) / 1e18 : 0;
  const chartCandles = s.chartMode === "mcap"
    ? candles.map((k) => ({ ...k, open: k.open * supplyTokens, high: k.high * supplyTokens, low: k.low * supplyTokens, close: k.close * supplyTokens }))
    : candles;
  let chartOhlc = null;
  if (chartCandles.length > 0) {
    const last = chartCandles[chartCandles.length - 1];
    chartOhlc = { o: fmtOhlc(last.open), h: fmtOhlc(last.high), l: fmtOhlc(last.low), c: fmtOhlc(last.close), up: last.close >= last.open };
  }

  return {
    isMobile: s.mobile,
    connected: !!account, account, accountShort: account ? shortAddress(account) : "",
    balance: Number(formatEther(s.nativeBalance)).toFixed(4),
    walletLabel: account ? shortAddress(account) : "Connect wallet",
    walletBg: account ? CARD : INK, walletFg: account ? INK : CARD,
    walletFont: account ? "'JetBrains Mono',monospace" : "'Outfit',sans-serif",
    // Connected: click opens a dropdown (balance, copy address, explorer
    // link, disconnect) instead of disconnecting immediately on one click --
    // disconnect is now a deliberate action inside that menu, not the
    // button's own default behavior.
    toggleWallet: () => (account ? set((st) => ({ walletMenuOpen: !st.walletMenuOpen })) : (openConnectModal && openConnectModal())),
    walletMenuOpen: s.walletMenuOpen,
    closeWalletMenu: () => set({ walletMenuOpen: false }),
    copyWalletAddress: ctx.copyWalletAddress,
    disconnectWallet: ctx.disconnectWallet,
    walletExplorerUrl: account && chain.blockExplorerUrl ? `${chain.blockExplorerUrl}/address/${account}` : null,
    txPending: s.txPending,

    isHome: scr === "home", isToken: scr === "token", isCreate: scr === "create",
    isCreateForm: scr === "createForm", isCampaign: scr === "campaign", isPortfolio: scr === "portfolio",
    goHome: () => set({ screen: "home" }), goCreate: () => set({ screen: "create" }),
    goPortfolio: () => set({ screen: "portfolio" }),

    filters, feed, isEmpty: feed.length === 0,
    sortTabs, kingCoin, duckLaunched,
    layoutCards: s.layout === "cards", layoutTable: s.layout === "table",
    setLayoutCards: () => set({ layout: "cards" }), setLayoutTable: () => set({ layout: "table" }),
    lcBg: block(s.layout === "cards").bg, lcFg: block(s.layout === "cards").fg,
    ltBg: block(s.layout === "table").bg, ltFg: block(s.layout === "table").fg,
    query: s.query, setQuery: (e) => set({ query: e.target.value }),
    mcapPresets: MCAP_PRESETS, mcapFilter: s.mcapFilter, setMcapFilter: (key) => set({ mcapFilter: key }),
    launchedPresets: LAUNCHED_PRESETS, launchedFilter: s.launchedFilter, setLaunchedFilter: (key) => set({ launchedFilter: key }),
    quoteFilterOptions, quoteFilter: s.quoteFilter, setQuoteFilter: (key) => set({ quoteFilter: key }),

    coin: c,
    sel: c ? {
      // Short labels here on purpose -- this badge sits in the token-page
      // header's single tight row alongside the logo, symbol and price, not
      // the wider Discover card where the full "CROWDLAUNCH" label fits fine.
      name: c.name, symbol: c.ticker, family: c.family === "CURVE" ? "BONDING" : c.family === "INSTANT" ? "INSTANT" : "RAISE",
      famBg: c.famBg, famFg: c.famFg, initials: c.initials, imageUrl: c.imageUrl, address: shortAddress(c.id), quote: c.quote,
      price: ohlc ? "$" + ohlc.c : c.curveSeed ? "$" + compactNumber(c.curveSeed.price) : "—",
      chg: ohlc ? (ohlc.pctChange >= 0 ? "+" : "−") + Math.abs(ohlc.pctChange).toFixed(1) + "%" : "—",
      chgColor: ohlc ? (ohlc.up ? "var(--pos)" : "var(--neg)") : "var(--mute)",
      migrated: c.migrated, holders: c.holders, verified: c.verified,
      raised: c.raised.toFixed(4), startTarget: "—", migTarget: "—",
    } : null,
    tokenStats: c ? [
      { k: "MCAP", v: usdOrQuote(c.mcUsd, c.mc, c.quote) },
      // "Raised" is a bonding-curve/crowdlaunch concept (ETH collected before
      // migration or finalize) -- an instant-launch token skips that phase
      // entirely and opens straight on a V4 pool, so showing "RAISED 0 ETH"
      // for one would misrepresent it as a stalled raise rather than what it
      // actually is: not applicable. Show total supply there instead.
      c.family === "INSTANT"
        ? { k: "SUPPLY", v: compactNumber(Number(c.totalSupply || 0) / 1e18) }
        : { k: "RAISED", v: quoteAmount(c.raised, c.quote) },
      { k: "24H VOL", v: usdOrQuote(c.volUsd, c.vol, c.quote) },
      { k: "HOLDERS", v: c.holders.toLocaleString() },
      { k: c.family === "CURVE" && !c.migrated ? "CURVE" : "POOL", v: c.family === "CURVE" && !c.migrated ? Math.round(c.pct) + "%" : (c.migrated || c.family === "INSTANT") ? "V4 LIVE" : "—" },
      { k: "LP LOCK", v: (c.migrated || c.family === "INSTANT") ? "FOREVER" : "—" },
      { k: "BURNED", v: compactNumber(Number(c.burnedSupply || 0) / 1e18) },
    ] : [],
    candles: chartCandles, ohlc, chartOhlc,
    chartMode: s.chartMode, setChartMode: (mode) => set({ chartMode: mode }),
    curve: c && c.family === "CURVE" ? {
      title: c.migrated ? "Migrated to Uniswap V4" : "Curve → V4 migration",
      headline: c.migrated ? "LP LOCKED FOREVER" : Math.round(c.pct) + "% filled",
      progWidth: Math.min(100, Math.max(0, c.pct)), progFill: INK,
      blurb: c.migrated
        ? "This token cleared its target. The contract opened a V4 pool, minted a full-range position, and handed it to DuckLocker. It can never be withdrawn."
        : `Targets are raw ${c.quote} amounts. There's no oracle involved. At the migration target the contract opens a Uniswap V4 pool, mints a full-range position, and hands it to the locker permanently.`,
    } : null,
    liq: c && s.creatorData ? {
      status: s.creatorData.hasPool ? "LP LOCKED · PERMANENT" : "NO POOL YET",
      stBg: s.creatorData.hasPool ? LIME : "var(--paper)", stFg: s.creatorData.hasPool ? "var(--on)" : INK,
      facts: [
        { k: "POOL", v: c.ticker.replace("$", "") + " / " + c.quote },
        { k: "POSITION", v: s.creatorData.hasPool ? "#" + s.creatorData.tokenId.toString() : "not minted" },
        { k: "FEE / TICK", v: "10000 / 200" },
        { k: "RANGE", v: s.creatorData.hasPool ? "full" : "—" },
        { k: "VAULT", v: "DuckLocker" },
      ],
    } : null,
    cto: c && s.creatorData?.hasPool ? {
      status: s.creatorData.ctoApp?.newCreator && s.creatorData.ctoApp.newCreator !== ZERO_ADDRESS ? "PENDING" : "OPEN",
      price: s.creatorData.ctoFee != null ? formatEther(s.creatorData.ctoFee) + " " + chain.nativeSymbol : "…",
      creator: s.creatorData.creator ? shortAddress(s.creatorData.creator) : "—",
      applicant: s.creatorData.ctoApp?.applicant && s.creatorData.ctoApp.applicant !== ZERO_ADDRESS ? shortAddress(s.creatorData.ctoApp.applicant) : null,
      blurb: "Anyone can pay the CTO fee to take over the creator fee stream. Post the transaction on X tagging @duckfunfamily for review; the owner approves or rejects from there. Only the fee claim moves, never supply, pool or metadata.",
    } : null,
    hookAccrued: s.creatorData ? Number(s.creatorData.hookAccrued || 0n) / 1e18 : 0,
    hookAccruedFailed: !!s.creatorData?.hookAccruedFailed,
    hookSplits: s.creatorData?.hookSplits || [],
    // setFeeSplits is contract-gated to the pool's own creator (NotCreator()
    // revert otherwise) -- checked client-side too so a connected non-creator
    // wallet gets a plain notice instead of a guaranteed-fail transaction.
    isCreator: !!(account && s.creatorData?.creator && account.toLowerCase() === s.creatorData.creator.toLowerCase()),
    buying, amt, myBalanceTokens, myContribution,
    buy: (amtEth) => ctx.buy(c, amtEth), sell: (tokenAmt) => ctx.sell(c, tokenAmt),
    setBuy: () => set({ side: "buy" }), setSell: () => set({ side: "sell", amount: myBalanceTokens ? String(myBalanceTokens / 2) : "0" }),
    buyBg: buying ? LIME : CARD, buyFg: buying ? "var(--on)" : "var(--mute)", sellBg: buying ? CARD : ORANGE, sellFg: buying ? "var(--mute)" : "#fff",
    amount: s.amount, onAmount: (e) => set({ amount: e.target.value.replace(/[^0-9.]/g, "") }),
    presets: [25, 100, 250, "MAX"].map((label, i) => ({
      label: String(label), dv: i === 0 ? "0" : "1px solid var(--line)",
      go: () => {
        if (label === "MAX") {
          if (!buying) return set({ amount: String(myBalanceTokens) });
          if (c && c.quoteTokenAddress?.toLowerCase() !== ZERO_ADDRESS) {
            const decimals = decimalsFor(chain, c.quoteTokenAddress, [s.platformTokens.incubation, s.platformTokens.launcher, s.platformTokens.raise]);
            return set({ amount: truncateDecimals(formatUnits(s.quoteBalance, decimals), 4) });
          }
          const spendable = s.nativeBalance > GAS_RESERVE_WEI ? s.nativeBalance - GAS_RESERVE_WEI : 0n;
          return set({ amount: truncateDecimals(formatEther(spendable), 4) });
        }
        set({ amount: buying ? String(label) : String(myBalanceTokens * (label / 250)) });
      },
    })),
    payAsset: buying ? (c ? c.quote : chain.nativeSymbol) : (c ? c.ticker.replace("$", "") : ""),
    payBalance: buying
      ? (c && c.quoteTokenAddress?.toLowerCase() !== ZERO_ADDRESS
          ? Number(formatUnits(s.quoteBalance, decimalsFor(chain, c.quoteTokenAddress, [s.platformTokens.incubation, s.platformTokens.launcher, s.platformTokens.raise]))).toFixed(4)
          : Number(formatEther(s.nativeBalance)).toFixed(4))
      : myBalanceTokens.toLocaleString(undefined, { maximumFractionDigits: 2 }),
    submitTx: () => (!account ? (openConnectModal && openConnectModal()) : buying ? ctx.buy(c, amt) : ctx.sell(c, amt)),
    ctaLabel: !account ? "Connect wallet to trade" : s.txPending ? "Confirming…" : (buying ? "Buy " + (c ? c.ticker.replace("$", "") : "") : "Sell " + (c ? c.ticker.replace("$", "") : "")),
    ctaBg: !account ? INK : (buying ? LIME : ORANGE), ctaFg: !account ? CARD : (buying ? "var(--on)" : "#fff"),
    previewLoading: s.previewLoading,
    previewText: (() => {
      if (!c || s.previewOut == null) return null;
      const decimals = buying ? 18 : decimalsFor(chain, c.quoteTokenAddress, [s.platformTokens.incubation, s.platformTokens.launcher, s.platformTokens.raise]);
      const symbol = buying ? c.ticker.replace("$", "") : c.quote;
      const val = Number(formatUnits(s.previewOut, decimals));
      return "~" + val.toLocaleString(undefined, { maximumFractionDigits: val < 1 ? 6 : 4 }) + " " + symbol;
    })(),
    slippageBps: s.slippageBps,
    slippageOptions: [50, 100, 500].map((bps) => Object.assign({ bps, label: (bps / 100) + "%" }, block(s.slippageBps === bps))),
    setSlippage: (bps) => set({ slippageBps: bps }),
    setSlippagePct: (e) => {
      const pct = parseFloat(e.target.value);
      if (!isNaN(pct) && pct >= 0) set({ slippageBps: Math.round(pct * 100) });
    },

    range: s.range, ranges: ["5M", "1H", "4H", "1D", "ALL"].map((label) => Object.assign({ label, go: () => set({ range: label }) }, block(s.range === label))),
    tab: s.tab, tabs: ["Trades", "Holders", "Comments", "Lending", "Governance", "Creator + liquidity"].map((label) => Object.assign({ label, go: () => set({ tab: label }) }, block(s.tab === label))),
    tabTrades: s.tab === "Trades", tabHolders: s.tab === "Holders", tabComments: s.tab === "Comments", tabCreator: s.tab === "Creator + liquidity",
    tabLending: s.tab === "Lending", tabGovernance: s.tab === "Governance",
    fetchTradesPage: (page) => c && ctx.fetchTradesPage(c.id, page),
    fetchHoldersPage: (page) => c && ctx.fetchHoldersPage(c.id, page),
    fetchCommentsPage: (page) => c && ctx.fetchCommentsPage(c.id, page),
    pageSize: PAGE_SIZE,
    chatDraft: s.chatDraft, setChatDraft: (e) => set({ chatDraft: e.target.value }),
    postChat: () => c && ctx.postComment(c, s.chatDraft.trim()),

    creatorData: s.creatorData, creatorLoading: s.creatorLoading,
    loadCreatorData: () => c && ctx.loadCreatorData(c),
    claimCreatorAndHookFees: () => ctx.claimCreatorAndHookFees(c),
    claimCurveFeeAction: () => ctx.claimCurveFeeAction(c),
    saveFeeSplits: (poolId, splits) => ctx.saveFeeSplits(c, poolId, splits),
    buyTakeover: (poolId) => ctx.buyTakeover(c, poolId, account),

    family: s.family,
    setFamily: (key) => set({ screen: "createForm", family: key }),
    backToChooser: () => set({ screen: "create" }),
    draftCurve: s.draftCurve, setCurve: (patch) => set({ draftCurve: { ...s.draftCurve, ...patch } }),
    draftInstant: s.draftInstant, setInstant: (patch) => set({ draftInstant: { ...s.draftInstant, ...patch } }),
    draftCampaign: s.draftCampaign, setCampaign: (patch) => set({ draftCampaign: { ...s.draftCampaign, ...patch } }),
    socials: (s.family === "incubation" ? s.draftCurve : s.family === "launcher" ? s.draftInstant : s.draftCampaign).socials,
    setSocial: ctx.setSocial,
    raiseDefaults: s.raiseDefaults,
    loadRaiseDefaults: () => {
      if (s.raiseDefaults) return;
      getRaiseDefaults(chain).then((d) => set({ raiseDefaults: d })).catch(() => {});
    },
    quoteOptions: quoteOptionsFor(chain, s.family === "launcher" ? chain.LAUNCHER_QUOTE_TOKENS : chain.INCUBATION_QUOTE_TOKENS, s.platformTokens[s.family === "launcher" ? "launcher" : "incubation"]),
    raiseQuoteOptions: quoteOptionsFor(chain, chain.RAISE_QUOTE_TOKENS, s.platformTokens.raise),
    // Native currency ("") always has a route by definition; a platform
    // token isn't in LIQUID_QUOTE_TOKEN_SYMBOLS either, so it correctly
    // falls to false too until this platform actually wires a route for
    // its own token.
    quoteHasEthRoute: (label) => label === chain.nativeSymbol || chain.LIQUID_QUOTE_TOKEN_SYMBOLS.includes(label),
    createCta: !account ? "Connect wallet to launch" : s.txPending ? "Confirming…" : "Launch",
    submitCreate: ctx.submitCreate,
    simulating: s.simulating, simulateCreate: ctx.simulateCreate,
    draftImage: s.draftImage, onImagePick: ctx.onImagePick, clearImage: ctx.clearImage,

    contribAmount: s.contribAmount, setContrib: (e) => set({ contribAmount: e.target.value.replace(/[^0-9.]/g, "") }),
    contribute: (amtEth) => ctx.contribute(c, amtEth),
    claimTokens: () => ctx.claimCampaignTokens(c), claimRefund: () => ctx.claimCampaignRefundAction(c),
    finalize: () => ctx.finalizeCampaignAction(c),
    submitCampaignAction: () => {
      if (!c) return;
      if (!c.campaignSucceeded && !c.campaignFailed) {
        const deadlinePassed = c.campaignDeadline && Number(c.campaignDeadline) * 1000 <= Date.now();
        return deadlinePassed ? ctx.finalizeCampaignAction(c) : ctx.contribute(c, parseFloat(s.contribAmount) || 0);
      }
      return c.campaignSucceeded ? ctx.claimCampaignTokens(c) : ctx.claimCampaignRefundAction(c);
    },
    camp: c && c.family === "CAMPAIGN" ? buildCampaignModel(chain, c, s, myContribution) : null,

    portfolio: s.portfolio, claimCreatorFees: ctx.claimCreatorFees, claimAllCreatorFees: ctx.claimAllCreatorFees,
    coins: s.coins, openToken: ctx.openToken,

    flash: ctx.flash, shortAddress,

    vaultsLoading: s.vaultsLoading, vaultDetail: s.vaultDetail, vaultConfigData: s.vaultConfigData,
    proposals: s.proposals, proposalsLoading: s.proposalsLoading, proposalDetail: s.proposalDetail,
    openProposal: ctx.openProposal,
    borrowVault: ctx.borrowVault, repayVaultLoan: ctx.repayVaultLoan,
    addCollateral: ctx.addCollateral, withdrawCollateral: ctx.withdrawCollateral,
    voteOnProposal: ctx.voteOnProposal, executeGovernanceProposal: ctx.executeGovernanceProposal,

    tx: walletTx, txOpen: !!s.tx, closeTx: () => set({ tx: null }),
    toast: s.toast,
    health: s.health,
    chain, chainOptions, chainSlug: s.chain, chainName: chain.name, chainLogoUrl: chain.logoUrl, chainId: chain.chainId, nativeSymbol: chain.nativeSymbol,
    chainMenuOpen: s.chainMenuOpen,
    toggleChainMenu: () => set((st) => ({ chainMenuOpen: !st.chainMenuOpen })),
    closeChainMenu: () => set({ chainMenuOpen: false }),
  };
}

// Shown right after a launch tx confirms, for the few seconds before the
// subgraph indexes the new token/campaign and it shows up in s.coins --
// TokenPage/CampaignPage both render null until then, which would otherwise
// be a blank screen.
function PendingLaunchPanel({ v }) {
  return (
    <div style={cs("border:1px solid var(--line);background:var(--card);padding:40px 24px;text-align:center")}>
      <div style={cs("font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.1em;color:var(--mute)")}>CONFIRMING YOUR LAUNCH</div>
      <div style={cs("font-size:15px;margin-top:10px")}>This'll appear here as soon as it's indexed, usually just a few seconds.</div>
      <button onClick={v.goHome} style={cs("margin-top:18px;padding:10px 20px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer")}>Back to Discover</button>
    </div>
  );
}

function buildCampaignModel(chain, c, s, myContribution) {
  const detail = s.campaignDetail;
  // Contributions land directly in the campaign's own quote asset (native
  // or an ERC20 -- see DuckCrowdfund.sol's contribute()), never swapped, so
  // this must decimal-normalize against THAT asset, not assume native/1e18.
  const quoteDecimals = c.quoteTokenAddress && c.quoteTokenAddress.toLowerCase() !== "0x0000000000000000000000000000000000000000"
    ? (chain.DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === c.quoteTokenAddress.toLowerCase())?.decimals ?? 18)
    : 18;
  const quoteSymbol = c.quote || chain.nativeSymbol;
  const goal = Number(c.campaignGoal || 0) / 10 ** quoteDecimals;
  const raised = Number(c.campaignRaised || 0) / 10 ** quoteDecimals;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  const deadlineMs = c.campaignDeadline ? Number(c.campaignDeadline) * 1000 : 0;
  const deadlinePassed = deadlineMs > 0 && deadlineMs <= Date.now();
  const resolved = c.campaignSucceeded || c.campaignFailed;
  const status = c.campaignSucceeded ? "COMPLETE" : c.campaignFailed ? "GOAL MISSED" : "RAISING";
  const stBg = c.campaignSucceeded ? LIME : c.campaignFailed ? ORANGE : "var(--paper)";
  const stFg = c.campaignFailed ? "#fff" : c.campaignSucceeded ? "var(--on)" : INK;
  // Real chosen supply/contributorBps once the campaign's own detail has
  // loaded (see getCampaignMeta) -- falls back to the platform default only
  // before that first load resolves.
  const contributorBps = detail ? Number(detail.contributorBps) : (s.raiseDefaults ? Number(s.raiseDefaults.contributorBps) : null);
  const campaignSupply = detail ? Number(detail.totalSupply) / 1e18 : (c.totalSupply ? Number(c.totalSupply) / 1e18 : null);
  const contributorSupply = contributorBps != null && campaignSupply != null ? (campaignSupply * contributorBps) / 10_000 : null;

  let actionTitle = "Contribute", actionSub = `Directly in ${quoteSymbol}. Refundable in full, in the same asset, if the goal is missed at the deadline.`;
  let cta = "Contribute " + quoteSymbol, ctaBg = LIME, ctaFg = "var(--on)", ctaNote = "Your allocation is recorded now; tokens are claimable only after finalize.";
  let canContribute = !resolved && !deadlinePassed;
  if (!resolved && deadlinePassed) {
    actionTitle = "Ready to finalize"; actionSub = "Deadline passed. Anyone can trigger finalize.";
    cta = "Finalize"; ctaBg = CARD; ctaFg = INK; ctaNote = "Finalize checks whether the goal was met and either seeds the pool directly or unlocks refunds -- no swap either way.";
  } else if (c.campaignSucceeded) {
    actionTitle = "Claim your tokens"; actionSub = `Allocation is your ${quoteSymbol} in ÷ total raised, applied to the backer supply.`;
    cta = myContribution?.claimed ? "Already claimed" : "Claim tokens"; ctaNote = "One claim per contributor. The token is now tradeable on its V4 pool.";
  } else if (c.campaignFailed) {
    actionTitle = "Refund available"; actionSub = "No tokens are distributed. Your full contribution is returned, in the asset you contributed.";
    cta = myContribution?.refunded ? "Already refunded" : "Refund " + quoteSymbol; ctaBg = ORANGE; ctaFg = "#fff";
    ctaNote = "The token stays deployed but unpooled and permanently unclaimable.";
  }

  return {
    initials: c.initials, imageUrl: c.imageUrl, name: c.name, symbol: c.ticker, token: shortAddress(c.id), tokenAddress: c.id, status, stBg, stFg,
    desc: c.desc, socials: c.socials, quoteSymbol,
    raised: raised.toFixed(4), goal: goal.toFixed(4), pct: Math.round(pct) + "%",
    backers: detail ? String(detail.contributions?.length ?? 0) : "…",
    deadline: resolved ? (c.campaignSucceeded ? "FINALIZED" : "FINALIZED · MISSED") : deadlinePassed ? "DEADLINE PASSED" : "RAISING",
    deadlineC: c.campaignSucceeded ? "var(--pos)" : c.campaignFailed ? "var(--neg)" : INK,
    progWidth: Math.min(100, Math.max(0, pct)), progFill: c.campaignFailed ? ORANGE : INK,
    note: c.campaignSucceeded
      ? "Raise complete. The escrowed supply is released, so you can claim your pro-rata allocation. The V4 pool is seeded and LP is locked in DuckLocker."
      : c.campaignFailed
      ? "The goal was not cleared, so no pool was seeded and the escrowed supply was never released. Contributions are refundable in full."
      : "Tokens are already deployed but held by the raise contract. Nothing is transferable or tradeable until the raise completes.",
    noteBg: c.campaignSucceeded ? LIME : c.campaignFailed ? ORANGE : "var(--paper)",
    noteFg: c.campaignFailed ? "#fff" : c.campaignSucceeded ? "var(--on)" : INK,
    facts: [
      { k: "GOAL", v: goal.toFixed(2) + " " + quoteSymbol },
      { k: "QUOTE ASSET", v: quoteSymbol },
      { k: "TOKEN STATUS", v: resolved && c.campaignSucceeded ? "released" : "escrowed" },
      { k: "TRADEABLE", v: c.campaignSucceeded ? "yes" : "no" },
    ],
    contribs: (detail?.contributions || []).map((ct) => {
      // Same address-labeling treatment TokenPage's Trades/Holders already
      // get (Creator, DuckCrowdfund, DuckLocker, Burned, Liquidity Pool,
      // etc.) -- a contributor CAN be the campaign's own creator, or (post-
      // success, once claims/refunds route through it) the contract itself.
      const label = labelFor(chain, ct.contributor, { [c.creator?.toLowerCase()]: "Creator" });
      return {
        wallet: label || shortAddress(ct.contributor), full: ct.contributor, eth: (Number(ct.amount) / 10 ** quoteDecimals).toFixed(4),
        status: ct.claimed ? "claimed" : ct.refunded ? "refunded" : "pending", age: "",
      };
    }),
    custody: [
      { k: "ESCROWED " + quoteSymbol, v: raised.toFixed(4) + " " + quoteSymbol, c: INK },
      { k: "ESCROWED SUPPLY", v: contributorSupply != null ? compactNumber(contributorSupply) : "—", c: INK },
      { k: "HELD BY", v: "DuckCrowdfund", c: INK },
      { k: "TRANSFERS", v: c.campaignSucceeded ? "enabled" : "disabled", c: c.campaignSucceeded ? "var(--pos)" : "var(--neg)" },
    ],
    timeline: [
      { k: "Token deployed", v: "At creation, verifiable on Blockscout before a single contribution.", on: true },
      { k: "Supply escrowed", v: "Full backer supply minted to the raise contract; transfers disabled.", on: true },
      { k: "Contributions open", v: "Native ETH accrues until the deadline. No price, no trading.", on: !resolved || true },
      { k: "Goal cleared", v: "ETH swaps to the quote asset, seeds a two-sided V4 pool, LP locks, claims open.", on: c.campaignSucceeded },
      { k: "Goal missed", v: "No pool, no release. Refunds unlock, one claim per contributor.", on: c.campaignFailed },
    ],
    actionTitle, actionSub, cta, ctaBg, ctaFg, ctaNote, canContribute,
    deadlinePassedUnresolved: !resolved && deadlinePassed,
  };
}

// explorerUrl is null when the chain has none yet (Arc, today) -- the
// modal hides the "Explorer" link entirely in that case rather than
// pointing it at a guessed or nonexistent URL.
function buildTxModel(chain, s, account) {
  if (!s.tx) return null;
  const explorerTxUrl = (hash) => (chain.blockExplorerUrl ? `${chain.blockExplorerUrl}/tx/${hash}` : null);
  if (s.tx.stage === "success") {
    return {
      title: "Confirmed", sub: `Included on ${chain.name}.`, glyph: "✓", headBg: LIME, headFg: "var(--on)", ringTop: "var(--on)", anim: "none", cta: "Done",
      hash: s.tx.hash, explorerUrl: explorerTxUrl(s.tx.hash),
    };
  }
  if (s.tx.stage === "reverted") {
    return {
      title: "Transaction reverted", sub: `Included on ${chain.name}, but it reverted on-chain. Nothing happened.`, glyph: "✕", headBg: "var(--neg)", headFg: "#fff", ringTop: INK, anim: "none", cta: "Dismiss",
      hash: s.tx.hash, explorerUrl: explorerTxUrl(s.tx.hash),
    };
  }
  return {
    title: "Confirm in your wallet", sub: `Broadcasting to ${chain.name} (${chain.chainId}).`, glyph: "", headBg: CARD, headFg: INK, ringTop: LIME,
    anim: "spin .9s linear infinite", cta: "Hide",
    hash: s.tx.hash || "awaiting hash…",
    explorerUrl: s.tx.hash ? explorerTxUrl(s.tx.hash) : chain.blockExplorerUrl,
  };
}
