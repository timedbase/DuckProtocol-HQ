import { useState, useEffect } from "react";
import { cs } from "../cs.js";
import PriceChart from "../PriceChart.jsx";
import Thumb from "../Thumb.jsx";
import { AddressChip, LinkChip, IconLinkChip, XIcon, TelegramIcon, VerifiedBadge } from "../MetaChips.jsx";
import { logoFor } from "../chain/quoteLogos.js";
import LendingTab from "./LendingTab.jsx";

// The asset actually being paid -- the token's own real quote asset when
// buying (native or a curated ERC20, see App.jsx's buy()), the token itself
// when selling -- shown as a real logo+symbol pill instead of plain text,
// the same visual language CreateFormPage's quote-asset chips already use.
// logoFor() always returns something (a verified per-token logo, or
// Robinhood Chain's own logo as an honest fallback), so there's no separate
// blank-placeholder case to render here anymore.
function PayPill({ symbol, imageUrl }) {
  const logo = imageUrl || logoFor(symbol);
  return (
    <span style={cs("display:flex;align-items:center;gap:6px;margin:6px 6px 6px 0;padding:5px 10px 5px 6px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;flex:none;white-space:nowrap")}>
      <img src={logo} alt="" style={cs("width:18px;height:18px;border-radius:999px;object-fit:cover;flex:none")} />
      {symbol}
    </span>
  );
}
import GovernanceTab from "./GovernanceTab.jsx";

// Windowed page list -- first, last, current ± 1, "…" for the gaps -- so a
// tab with dozens of pages shows "1 … 9 10 11 … 40" instead of forty
// buttons in a row. Small counts (<=7) just show every page, no ellipsis.
function pageWindow(current, total, siblings = 1) {
  const maxButtons = siblings * 2 + 5; // first + last + current + siblings*2 + 2 ellipsis slots
  if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total);
  const pages = [1];
  if (left > 2) pages.push("…");
  for (let i = left; i <= right; i++) if (i !== 1 && i !== total) pages.push(i);
  if (right < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// Real numbered pagination: every button is a plain page number, and the
// full range is known immediately from the backend's total count --
// clicking any of them (even one never viewed before) fetches that exact
// page directly, with no separate "load more" step or affordance.
function Pager({ page, totalPages, loading, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);
  return (
    <div style={cs("display:flex;align-items:center;gap:6px;padding:14px 18px;min-width:460px;flex-wrap:wrap")}>
      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1 || loading} style={cs(`width:30px;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font-size:13px;cursor:pointer;opacity:${page === 1 ? .4 : 1}`)}>‹</button>
      {pages.map((p, i) => p === "…" ? (
        <span key={"e" + i} style={cs("min-width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:var(--mute);font-family:'JetBrains Mono',monospace;font-size:12px")}>…</span>
      ) : (
        <button key={p} onClick={() => onPageChange(p)} disabled={loading} style={cs(`min-width:30px;height:30px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:${p === page ? "var(--ink)" : "var(--card)"};color:${p === page ? "var(--card)" : "var(--ink)"};font-family:'JetBrains Mono',monospace;font-size:12px;cursor:pointer;opacity:${loading && p !== page ? .5 : 1}`)}>{p}</button>
      ))}
      <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages || loading} style={cs(`width:30px;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font-size:13px;cursor:pointer;opacity:${page === totalPages ? .4 : 1}`)}>›</button>
    </div>
  );
}

// The Buy/Sell form -- identical content whether it sits inline in the
// sticky desktop sidebar or inside the mobile bottom sheet; only its
// container differs, so it's pulled out once rather than duplicated.
function TradePanel({ v, sel, tok }) {
  return (
    <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
      <div style={cs("display:flex;border-bottom:1px solid var(--line)")}>
        <button onClick={v.setBuy} style={cs(`flex:1;padding:14px;border:0;border-right:1px solid var(--line);background:${v.buyBg};color:${v.buyFg};font-size:15px;font-weight:700;letter-spacing:-.01em;cursor:pointer`)}>Buy</button>
        <button onClick={v.setSell} style={cs(`flex:1;padding:14px;border:0;background:${v.sellBg};color:${v.sellFg};font-size:15px;font-weight:700;letter-spacing:-.01em;cursor:pointer`)}>Sell</button>
      </div>
      <div style={cs("padding:18px")}>
        <div style={cs("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute);margin-bottom:9px")}>
          <span>PAY {v.payAsset}</span><span>BAL {v.payBalance}</span>
        </div>
        <div style={cs("display:flex;align-items:stretch;border:1px solid var(--line);border-radius:9px;background:var(--paper);overflow:hidden")}>
          <input value={v.amount} onChange={v.onAmount} style={cs("flex:1;min-width:0;border:0;outline:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:500;letter-spacing:-.03em;padding:13px 14px")} />
          <div style={cs("display:flex;align-items:center;border-left:1px solid var(--line);padding-left:8px")}>
            <PayPill symbol={v.payAsset} imageUrl={v.buying ? null : sel.imageUrl} />
          </div>
        </div>
        <div style={cs("display:flex;margin-top:10px;border:1px solid var(--line);border-radius:8px;overflow:hidden")}>
          {v.presets.map((p, i) => (
            <button key={i} onClick={p.go} style={cs(`flex:1;padding:9px 0;border:0;border-left:${p.dv};background:var(--card);font-family:'JetBrains Mono',monospace;font-size:11.5px;cursor:pointer`)}>{p.label}</button>
          ))}
        </div>
        <div style={cs("display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
          <span style={cs("color:var(--mute)")}>YOU RECEIVE</span>
          <span style={cs("font-weight:500")}>{v.previewLoading ? "estimating…" : (v.previewText || "—")}</span>
        </div>
        <div style={cs("display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute)")}>
          <span style={cs("letter-spacing:.1em")}>SLIPPAGE</span>
          <div style={cs("display:flex;gap:5px;align-items:center")}>
            {v.slippageOptions.map((o, i) => (
              <button key={i} onClick={() => v.setSlippage(o.bps)} style={cs(`padding:4px 8px;border-radius:6px;border:1px solid var(--line);background:${o.bg};color:${o.fg};font-size:10px;cursor:pointer`)}>{o.label}</button>
            ))}
            <input defaultValue="" placeholder={(v.slippageBps / 100) + "%"} onChange={v.setSlippagePct} style={cs("width:42px;border:1px solid var(--line);background:var(--card);text-align:right;padding:4px 5px;font-family:'JetBrains Mono',monospace;font-size:10px;outline:0")} />
          </div>
        </div>
        <div style={cs("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);margin-top:12px")}><span>YOUR BALANCE</span><span style={cs("color:var(--ink)")}>{v.myBalanceTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })} {sel.symbol.replace("$", "")}</span></div>
        <button onClick={v.submitTx} disabled={v.txPending} style={cs(`width:100%;padding:16px;margin-top:14px;border:1px solid var(--line);border-radius:9px;background:${v.ctaBg};color:${v.ctaFg};font-size:16px;font-weight:700;letter-spacing:-.01em;cursor:pointer`)}>{v.ctaLabel}</button>
        <div style={cs("font-size:11.5px;color:var(--mute);margin-top:12px")}>{tok.family === "CURVE" && !tok.migrated ? "Trades against the bonding curve." : "Routes through Uniswap V4."}</div>
      </div>
    </div>
  );
}

export default function TokenPage({ v }) {
  const sel = v.sel;
  const tok = v.coin;
  const [splitWallet, setSplitWallet] = useState("");
  const [splitPct, setSplitPct] = useState("");
  const [feeRoutingOpen, setFeeRoutingOpen] = useState(false);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [tradePage, setTradePage] = useState(1);
  const [holderPage, setHolderPage] = useState(1);
  const [commentPage, setCommentPage] = useState(1);
  useEffect(() => { setTradePage(1); setHolderPage(1); setCommentPage(1); }, [tok?.id]);
  if (!sel || !tok) return null;
  // null when the selected chain has no verified explorer yet (Arc, today)
  // -- callers render a plain span instead of a link in that case.
  const explorerAddr = (addr) => (v.chain.blockExplorerUrl ? `${v.chain.blockExplorerUrl}/address/${addr}` : null);

  const pageSize = v.pageSize;
  // tok.trades/holderRows/chat each hold exactly the current page's rows
  // (fetched directly by page number, see App.jsx) -- no client-side
  // slicing needed, unlike the old ever-growing "load more" arrays.
  const tradeTotalPages = Math.max(1, Math.ceil((tok.tradesTotal || 0) / pageSize));
  const holderTotalPages = Math.max(1, Math.ceil((tok.holdersTotal || 0) / pageSize));
  const commentTotalPages = Math.max(1, Math.ceil((tok.commentsTotal || 0) / pageSize));

  const gotoTradePage = async (p) => { setLoadingTrades(true); await v.fetchTradesPage(p); setTradePage(p); setLoadingTrades(false); };
  const gotoHolderPage = async (p) => { setLoadingHolders(true); await v.fetchHoldersPage(p); setHolderPage(p); setLoadingHolders(false); };
  const gotoCommentPage = async (p) => { setLoadingComments(true); await v.fetchCommentsPage(p); setCommentPage(p); setLoadingComments(false); };

  const submitSplits = () => {
    const poolId = v.liq && v.creatorData?.poolId;
    if (!poolId) return;
    const pct = parseFloat(splitPct) || 0;
    if (!splitWallet.trim() || pct <= 0) {
      v.saveFeeSplits(poolId, []); // empty resets to 100% direct to creator
      return;
    }
    // 100 (or above, clamped) means the whole fee goes to the split wallet --
    // a single entry summing to 10000 bps, not a 0%-to-creator second entry,
    // since the contract requires every non-empty split array to sum to
    // exactly BPS (10000).
    const bps = Math.min(10000, Math.round(pct * 100));
    v.saveFeeSplits(poolId, bps >= 10000
      ? [{ wallet: splitWallet.trim(), bps: 10000 }]
      : [
          { wallet: splitWallet.trim(), bps },
          { wallet: v.account, bps: 10000 - bps },
        ]);
  };

  return (
    <div>
      <button onClick={v.goHome} style={cs("border:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.1em;color:var(--mute);cursor:pointer;padding:0 0 14px")}>← DISCOVER</button>

      <div style={cs(`display:flex;flex-direction:column;gap:14px;padding:${v.isMobile ? "14px" : "18px"};border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);margin-bottom:16px`)}>
        <div style={cs("display:flex;align-items:center;gap:12px")}>
          <Thumb url={sel.imageUrl} bg={sel.famBg} fg={sel.famFg} initials={sel.initials} size={v.isMobile ? "72px" : "84px"} radius="10px" fontSize={v.isMobile ? "24px" : "28px"} flex="none" />
          <div style={cs("min-width:0;flex:1")}>
            <div style={cs("display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap;row-gap:4px")}>
              <span style={cs(`font-size:${v.isMobile ? "19px" : "22px"};font-weight:700;letter-spacing:-.03em;white-space:nowrap;flex:none`)}>{sel.symbol}</span>
              {sel.verified && <span title="Verified: the platform's own token" style={cs("flex:none;display:flex")}><VerifiedBadge size={v.isMobile ? 16 : 18} /></span>}
              <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.1em;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:${sel.famBg};color:${sel.famFg};flex:none;white-space:nowrap`)}>{sel.family}</span>
              {sel.quote && (
                <span style={cs("display:flex;align-items:center;gap:4px;padding:2px 8px 2px 3px;border-radius:999px;border:1px solid var(--line);background:var(--paper);flex:none;white-space:nowrap")}>
                  <img src={logoFor(sel.quote)} alt="" style={cs("width:14px;height:14px;border-radius:999px;object-fit:cover;flex:none")} />
                  <span style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.1em;color:var(--mute)")}>{sel.quote}</span>
                </span>
              )}
            </div>
            <div style={cs("font-size:13px;color:var(--mute);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{sel.name}</div>
          </div>
          <div style={cs("text-align:right;font-family:'JetBrains Mono',monospace;flex:none")}>
            <div style={cs("font-size:16px;font-weight:500;letter-spacing:-.03em;white-space:nowrap")}>{sel.price}</div>
            <div style={cs(`font-size:11.5px;margin-top:3px;color:${sel.chgColor};white-space:nowrap`)}>{sel.chg} · {v.range}</div>
          </div>
        </div>
        {tok.desc && <div style={cs("font-size:12.5px;color:var(--mute);max-width:70ch;line-height:1.5")}>{tok.desc}</div>}
        <div style={cs("display:flex;gap:6px;flex-wrap:wrap")}>
          <AddressChip address={sel.address} full={tok.id} />
          {v.chain.blockExplorerUrl && (
            <IconLinkChip href={`${v.chain.blockExplorerUrl}/address/${tok.id}`} title="Explorer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2.2 5.8-5.8 2.2 2.2-5.8z" /></svg>
            </IconLinkChip>
          )}
          {v.chainSlug === "ink" && (
            <IconLinkChip href={`https://basedbot.app/token/ink/${tok.id}`} title="BasedBot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="9" width="14" height="10" rx="2.5" /><path d="M12 9V5.5" /><circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="9" cy="14" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="1.1" fill="currentColor" stroke="none" /></svg>
            </IconLinkChip>
          )}
          {tok.poolId && v.chainSlug === "ink" && (
            <IconLinkChip href={`https://www.dextools.io/app/ink/pair-explorer/${tok.poolId}`} title="DEXTools">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><line x1="5.5" y1="3" x2="5.5" y2="21" stroke="currentColor" strokeWidth="1.4" /><rect x="3.5" y="7" width="4" height="7" /><line x1="12" y1="1.5" x2="12" y2="22.5" stroke="currentColor" strokeWidth="1.4" /><rect x="10" y="10" width="4" height="5" /><line x1="18.5" y1="5" x2="18.5" y2="19" stroke="currentColor" strokeWidth="1.4" /><rect x="16.5" y="8" width="4" height="8" /></svg>
            </IconLinkChip>
          )}
          {tok.socials?.website && <LinkChip href={tok.socials.website}>Website</LinkChip>}
          {tok.socials?.twitter && <IconLinkChip href={tok.socials.twitter} title="X"><XIcon /></IconLinkChip>}
          {tok.socials?.telegram && <IconLinkChip href={tok.socials.telegram} title="Telegram"><TelegramIcon /></IconLinkChip>}
        </div>
      </div>

      <div style={cs(`display:grid;grid-template-columns:${v.isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 366px"};gap:16px;align-items:start`)}>
        <div style={cs("display:flex;flex-direction:column;gap:16px;min-width:0")}>

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line)")}>
              {v.tokenStats.map((st, i) => (
                <div key={i} style={cs("min-width:72px")}>
                  <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;color:var(--mute)")}>{st.k}</div>
                  <div style={cs("font-family:'JetBrains Mono',monospace;font-size:13.5px;font-weight:500;margin-top:3px;white-space:nowrap")}>{st.v}</div>
                </div>
              ))}
              {!tok.poolId && (
                <>
                  <div style={cs("flex:1;min-width:8px")}></div>
                  <div style={cs("display:flex")}>
                    {v.ranges.map((r, i) => (
                      <button key={i} onClick={r.go} style={cs(`padding:6px 10px;border:1px solid var(--line);border-right-width:${i === v.ranges.length - 1 ? "1px" : "0"};background:${r.bg};color:${r.fg};font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer`)}>{r.label}</button>
                    ))}
                  </div>
                  <div style={cs("display:flex;margin-left:6px")}>
                    {["price", "mcap"].map((mode, i) => (
                      <button key={mode} onClick={() => v.setChartMode(mode)} style={cs(`padding:6px 10px;border:1px solid var(--line);border-right-width:${i === 0 ? "0" : "1px"};background:${v.chartMode === mode ? "var(--ink)" : "var(--card)"};color:${v.chartMode === mode ? "var(--card)" : "var(--mute)"};font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;cursor:pointer`)}>{mode === "price" ? "PRICE" : "MCAP"}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {tok.poolId && v.chainSlug === "ink" ? (
              // A real V4 pool exists (post-migration / instant-launch / a
              // finalized raise) -- DEXTools indexes Ink's V4 pools by their
              // raw poolId (there's no separate pool *contract* in V4, just
              // this hash), so its chart is strictly more capable here than
              // ours (order flow, liquidity, multi-venue context). Curve-
              // phase tokens have no pool yet -- nothing for DEXTools to
              // show -- so they keep our own chart below instead. DEXTools
              // has no confirmed Arc coverage, so Arc always keeps our own
              // chart too, even once a real pool exists there.
              <iframe
                key={tok.poolId}
                title={`${sel.symbol} chart on DEXTools`}
                src={`https://www.dextools.io/widget-chart/en/ink/pe-light/${tok.poolId}?theme=light&chartType=1&chartResolution=30&drawingToolbars=false&showTradeHistory=false&chartInUsd=true`}
                style={cs(`width:100%;height:${v.isMobile ? "360px" : "480px"};border:0;display:block`)}
                loading="lazy"
              />
            ) : (
              <>
                {v.chartOhlc && (
                  <div style={cs("display:flex;align-items:center;gap:16px;padding:8px 14px;border-bottom:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>
                    <span>O <span style={cs("color:var(--ink)")}>{v.chartOhlc.o}</span></span>
                    <span>H <span style={cs("color:var(--ink)")}>{v.chartOhlc.h}</span></span>
                    <span>L <span style={cs("color:var(--ink)")}>{v.chartOhlc.l}</span></span>
                    <span>C <span style={cs(`color:${v.chartOhlc.up ? "var(--pos)" : "var(--neg)"}`)}>{v.chartOhlc.c}</span></span>
                  </div>
                )}
                {v.candles.length > 0 ? (
                  <div style={cs("padding:14px")}>
                    <PriceChart candles={v.candles} height={v.isMobile ? 240 : 280} />
                  </div>
                ) : (
                  <div style={cs("padding:60px 18px;text-align:center;color:var(--mute);font-size:13px")}>No trades in this window yet.</div>
                )}
              </>
            )}
          </div>

          {v.curve && (
            <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--lime);color:var(--on);box-shadow:var(--sh);padding:20px")}>
              <div style={cs("display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px")}>
                <span style={cs("font-size:19px;font-weight:700;letter-spacing:-.03em")}>{v.curve.title}</span>
                <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11.5px")}>{v.curve.headline}</span>
              </div>
              <div style={cs("display:flex;gap:3px;height:24px;border-radius:6px;background:var(--card);padding:3px")}>
                <div style={cs(`height:100%;border-radius:4px;width:${v.curve.progWidth}%;background:${v.curve.progFill}`)}></div>
              </div>
              <div style={cs("font-size:12.5px;line-height:1.55;margin-top:14px;max-width:76ch")}>{v.curve.blurb}</div>
            </div>
          )}

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("display:flex;border-bottom:1px solid var(--line);flex-wrap:wrap")}>
              {v.tabs.map((t, i) => (
                <button key={i} onClick={t.go} style={cs(`padding:12px 17px;border:0;border-right:1px solid var(--line);background:${t.bg};color:${t.fg};font-size:13.5px;font-weight:600;letter-spacing:-.01em;cursor:pointer`)}>{t.label}</button>
              ))}
            </div>

            {v.tabTrades && (
              <div>
                {tok.trades.length === 0 && <div style={cs("padding:24px 18px;font-size:13px;color:var(--mute)")}>No trades yet.</div>}
                {v.isMobile ? (
                  tok.trades.map((r, i) => (
                    <div key={i} style={cs("display:flex;flex-direction:column;gap:6px;padding:12px 16px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
                      <div style={cs("display:flex;align-items:center;gap:9px")}>
                        <span title={r.side} style={cs(`width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;background:${r.bg};color:${r.fg};font-size:10.5px;font-weight:500;border-radius:999px`)}>{r.sideLabel}</span>
                        <span style={cs("font-weight:500")}>{r.amount} {sel.symbol.replace("$", "")}</span>
                        <span style={cs("margin-left:auto;color:var(--mute);font-size:11px")}>{r.ago}</span>
                      </div>
                      <div style={cs("display:flex;align-items:center;gap:8px;color:var(--mute);font-size:11.5px;padding-left:29px")}>
                        <span>{r.quote} {sel.quote}</span><span>·</span>
                        {explorerAddr(r.full)
                          ? <a href={explorerAddr(r.full)} target="_blank" rel="noreferrer" title={r.full}>{r.who}</a>
                          : <span title={r.full}>{r.who}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={cs("overflow-x:auto")}>
                    <div style={cs("display:grid;min-width:460px;grid-template-columns:86px 1fr 1fr 1.3fr 70px;gap:14px;padding:10px 18px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>
                      <span>SIDE</span><span style={cs("text-align:right")}>{sel.quote}</span><span style={cs("text-align:right")}>{sel.symbol.replace("$", "")}</span><span>WALLET</span><span style={cs("text-align:right")}>AGE</span>
                    </div>
                    {tok.trades.map((r, i) => (
                      <div key={i} style={cs("display:grid;min-width:460px;grid-template-columns:86px 1fr 1fr 1.3fr 70px;gap:14px;padding:11px 18px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px;align-items:center")}>
                        <span><span title={r.side} style={cs(`width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;background:${r.bg};color:${r.fg};font-size:10.5px;font-weight:500;border-radius:999px`)}>{r.sideLabel}</span></span>
                        <span style={cs("text-align:right")}>{r.quote}</span>
                        <span style={cs("text-align:right")}>{r.amount}</span>
                        {explorerAddr(r.full)
                          ? <a href={explorerAddr(r.full)} target="_blank" rel="noreferrer" title={r.full}>{r.who}</a>
                          : <span title={r.full}>{r.who}</span>}
                        <span style={cs("text-align:right;color:var(--mute)")}>{r.ago}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Pager page={tradePage} totalPages={tradeTotalPages} loading={loadingTrades} onPageChange={gotoTradePage} />
              </div>
            )}

            {v.tabHolders && (
              <div>
                {tok.holderRows.length === 0 && <div style={cs("padding:24px 18px;font-size:13px;color:var(--mute)")}>No holders indexed yet.</div>}
                {v.isMobile ? (
                  tok.holderRows.map((h, i) => (
                    <div key={i} style={cs("display:flex;flex-direction:column;gap:6px;padding:12px 16px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
                      <div style={cs("display:flex;align-items:center;gap:9px")}>
                        <span style={cs("color:var(--mute);width:20px;flex:none")}>{h.rank}</span>
                        {explorerAddr(h.full)
                          ? <a href={explorerAddr(h.full)} target="_blank" rel="noreferrer" title={h.full} style={cs("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{h.who}</a>
                          : <span title={h.full} style={cs("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{h.who}</span>}
                        <span style={cs(`flex:none;font-size:10px;letter-spacing:.08em;padding:2px 8px;border-radius:999px;border:${h.tagBd};background:${h.tagBg};color:${h.tagFg}`)}>{h.tag}</span>
                      </div>
                      <div style={cs("display:flex;align-items:center;gap:8px;color:var(--mute);font-size:11.5px;padding-left:29px")}>
                        <span style={cs("color:var(--ink);font-weight:500")}>{h.balance}</span><span>· {h.share} of supply</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={cs("overflow-x:auto")}>
                    <div style={cs("display:grid;min-width:460px;grid-template-columns:44px 1.4fr 1fr .8fr 90px;gap:14px;padding:10px 18px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>
                      <span>#</span><span>WALLET</span><span style={cs("text-align:right")}>BALANCE</span><span style={cs("text-align:right")}>SHARE</span><span style={cs("text-align:right")}>TAG</span>
                    </div>
                    {tok.holderRows.map((h, i) => (
                      <div key={i} style={cs("display:grid;min-width:460px;grid-template-columns:44px 1.4fr 1fr .8fr 90px;gap:14px;padding:11px 18px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px;align-items:center")}>
                        <span style={cs("color:var(--mute)")}>{h.rank}</span>
                        {explorerAddr(h.full)
                          ? <a href={explorerAddr(h.full)} target="_blank" rel="noreferrer" title={h.full}>{h.who}</a>
                          : <span title={h.full}>{h.who}</span>}
                        <span style={cs("text-align:right")}>{h.balance}</span>
                        <span style={cs("text-align:right;font-weight:500")}>{h.share}</span>
                        <div style={cs("text-align:right")}><span style={cs(`font-size:10px;letter-spacing:.08em;padding:2px 8px;border-radius:999px;border:${h.tagBd};background:${h.tagBg};color:${h.tagFg}`)}>{h.tag}</span></div>
                      </div>
                    ))}
                  </div>
                )}
                <Pager page={holderPage} totalPages={holderTotalPages} loading={loadingHolders} onPageChange={gotoHolderPage} />
              </div>
            )}

            {v.tabComments && (
              <div>
                <div style={cs("display:flex;gap:0;border-bottom:1px solid var(--line)")}>
                  <input value={v.chatDraft} onChange={v.setChatDraft} placeholder={`Say something about ${sel.symbol}…`} style={cs("flex:1;min-width:0;padding:14px 18px;border:0;outline:0;background:var(--card);font-size:13.5px")} />
                  <button onClick={async () => { if (await v.postChat()) setCommentPage(1); }} style={cs("padding:0 22px;border:0;border-left:1px solid var(--line);background:var(--ink);color:var(--card);font-size:13px;font-weight:600;cursor:pointer;flex:none")}>Post</button>
                </div>
                {tok.chat.length === 0 && <div style={cs("padding:24px 18px;font-size:13px;color:var(--mute)")}>No comments yet. Be the first.</div>}
                {tok.chat.map((c, i) => (
                  <div key={i} style={cs("padding:15px 18px;border-bottom:1px solid var(--soft)")}>
                    <div style={cs("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                      <span style={cs("font-family:'JetBrains Mono',monospace;font-size:12px")}>{c.wallet}</span>
                      <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;padding:2px 8px;border-radius:999px;border:${c.tagBd};background:${c.tagBg};color:${c.tagFg}`)}>{c.tag}</span>
                      {c.holdPct != null && (
                        <span title={`% of ${sel.symbol} supply this wallet currently holds`} style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.02em;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:${c.holdPct === "0%" ? "var(--paper)" : "var(--lime)"};color:${c.holdPct === "0%" ? "var(--mute)" : "var(--on)"}`)}>{c.holdPct} held</span>
                      )}
                      <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>{c.age}</span>
                    </div>
                    <p style={cs("margin:9px 0 0;font-size:14px;line-height:1.5")}>{c.body}</p>
                  </div>
                ))}
                <Pager page={commentPage} totalPages={commentTotalPages} loading={loadingComments} onPageChange={gotoCommentPage} />
              </div>
            )}

            {v.tabCreator && (
              <div>
                {v.creatorLoading && <div style={cs("padding:24px;font-size:13px;color:var(--mute)")}>Loading on-chain position + hook data…</div>}
                {!v.creatorLoading && v.liq && (
                  <>
                    <div style={cs("padding:16px;border-bottom:1px solid var(--line)")}>
                      <div style={cs("display:flex;align-items:center;gap:11px;margin-bottom:14px;flex-wrap:wrap")}>
                        <span style={cs("font-size:17px;font-weight:700;letter-spacing:-.03em")}>Liquidity</span>
                        <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:${v.liq.stBg};color:${v.liq.stFg}`)}>{v.liq.status}</span>
                      </div>
                      <div style={cs("display:flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;overflow:hidden")}>
                        {v.liq.facts.map((f, i) => (
                          <div key={i} style={cs("flex:1;min-width:150px;padding:12px 15px;border-right:1px solid var(--line);background:var(--card)")}>
                            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>{f.k}</div>
                            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:500;margin-top:5px")}>{f.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={cs("font-size:12px;color:var(--mute);margin-top:10px")}>Full-range and permanent. Only accrued fees are ever claimable.</div>
                    </div>

                    <div style={cs("padding:16px;border-bottom:1px solid var(--line)")}>
                      <div style={cs("font-size:17px;font-weight:700;letter-spacing:-.03em;margin-bottom:14px")}>Creator fees</div>
                      <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start")}>
                        <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--lime);color:var(--on);box-shadow:var(--sh);padding:18px")}>
                          <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--acc)")}>CREATOR FEE ACCRUED (YOURS)</div>
                          <div style={cs("font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:500;letter-spacing:-.04em;margin:7px 0 3px")}>{v.hookAccruedFailed ? "—" : v.hookAccrued.toFixed(5) + " " + sel.quote}</div>
                          {v.hookAccruedFailed && <div style={cs("font-family:'JetBrains Mono',monospace;font-size:11.5px;margin-bottom:16px")}>Couldn't read this from the chain. Try reopening this tab.</div>}
                          <button onClick={v.claimCreatorAndHookFees} disabled={v.txPending} style={cs("width:100%;padding:13px;border:1px solid var(--line);border-radius:9px;background:var(--ink);color:var(--card);font-size:14px;font-weight:700;cursor:pointer")}>Claim your creator fee</button>
                        </div>
                        {tok.family === "CURVE" && (
                          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card)")} >
                            <div style={cs("padding:18px")}>
                            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>CURVE TRADING FEE (1%)</div>
                            <div style={cs("font-size:12.5px;color:var(--mute);margin:9px 0 16px;line-height:1.5")}>{tok.migrated ? "Accrued during the curve phase, split 50/50 creator/platform." : "Claimable only after migration."}</div>
                            <button onClick={v.claimCurveFeeAction} disabled={v.txPending || !tok.migrated} style={cs(`width:100%;padding:13px;border:1px solid var(--line);border-radius:9px;background:${tok.migrated ? "var(--card)" : "var(--paper)"};color:var(--ink);font-size:14px;font-weight:700;cursor:pointer`)}>Claim curve fee</button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={cs("border:1px solid var(--line);border-radius:10px;margin-top:16px;background:var(--card);overflow:hidden")}>
                        <button onClick={() => setFeeRoutingOpen((o) => !o)} style={cs("width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 15px;border:0;background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute);cursor:pointer")}>
                          <span>CREATOR FEE ROUTING (OPTIONAL)</span><span>{feeRoutingOpen ? "▴" : "▾"}</span>
                        </button>
                        {feeRoutingOpen && (
                          !v.liq || v.liq.status === "NO POOL YET" ? (
                            <div style={cs("padding:16px;font-size:12.5px;color:var(--mute)")}>Not available until this token has a real V4 pool.</div>
                          ) : !v.isCreator ? (
                            <div style={cs("padding:16px;font-size:12.5px;color:var(--mute)")}>Only the creator ({v.cto ? v.cto.creator : "—"}) can change fee routing for this token.</div>
                          ) : (
                            <>
                              <div style={cs("padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px")}>
                                <label style={cs("display:flex;flex-direction:column;gap:7px")}>
                                  <span style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>SPLIT WALLET (OPTIONAL)</span>
                                  <input value={splitWallet} onChange={(e) => setSplitWallet(e.target.value)} placeholder="0x…" style={cs("padding:11px 12px;border:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:13px;outline:0")} />
                                </label>
                                <label style={cs("display:flex;flex-direction:column;gap:7px")}>
                                  <span style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>% TO THAT WALLET</span>
                                  <input value={splitPct} onChange={(e) => setSplitPct(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={cs("padding:11px 12px;border:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:13px;outline:0")} />
                                </label>
                              </div>
                              <div style={cs("padding:0 16px 16px")}>
                                <button onClick={submitSplits} disabled={v.txPending} style={cs("padding:12px 20px;border:1px solid var(--line);border-radius:8px;background:var(--card);font-size:13.5px;font-weight:600;cursor:pointer")}>Save fee settings</button>
                                <div style={cs("font-size:12px;color:var(--mute);margin-top:12px;line-height:1.55;max-width:76ch")}>Leave blank to reset to 100% direct to the creator. Only routes the sell-fee skim, not the LP-position fee.</div>
                              </div>
                            </>
                          )
                        )}
                      </div>
                    </div>

                    {v.cto && (
                      <div style={cs("padding:16px")}>
                        <div style={cs("display:flex;align-items:center;gap:11px;margin-bottom:8px;flex-wrap:wrap")}>
                          <span style={cs("font-size:17px;font-weight:700;letter-spacing:-.03em")}>Community takeover</span>
                          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:var(--orange);color:#fff")}>{v.cto.status}</span>
                        </div>
                        <p style={cs("margin:0 0 16px;font-size:13px;color:var(--mute);line-height:1.6;max-width:76ch")}>{v.cto.blurb}</p>
                        <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start")}>
                          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:18px")}>
                            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>CTO PRICE</div>
                            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:500;letter-spacing:-.04em;margin:7px 0 16px")}>{v.cto.price}</div>
                            <button onClick={() => v.buyTakeover(v.creatorData.poolId)} disabled={v.txPending || v.cto.status === "PENDING"} style={cs("width:100%;padding:13px;border:1px solid var(--line);border-radius:9px;background:var(--orange);color:#fff;font-size:14px;font-weight:700;cursor:pointer")}>{v.cto.status === "PENDING" ? "Application pending" : "Apply for takeover"}</button>
                            <a href={`https://x.com/intent/post?text=${encodeURIComponent(`CTO application for ${sel.symbol} — tx: [paste your transaction hash] @duckfunfamily please review`)}`} target="_blank" rel="noreferrer" style={cs("display:block;text-align:center;margin-top:10px;font-size:12px;color:var(--mute);border-bottom:1px solid var(--soft)")}>Post your tx on X for review →</a>
                          </div>
                          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden")}>
                            <div style={cs("display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12px")}><span style={cs("color:var(--mute)")}>CURRENT CREATOR</span><span style={cs("font-weight:500")}>{v.cto.creator}</span></div>
                            <div style={cs("display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12px")}><span style={cs("color:var(--mute)")}>PENDING APPLICANT</span><span style={cs("font-weight:500")}>{v.cto.applicant || "none"}</span></div>
                            <div style={cs("display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12px")}><span style={cs("color:var(--mute)")}>CANNOT CHANGE</span><span style={cs("font-weight:500")}>supply, pool, LP</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {!v.creatorLoading && !v.liq && (
                  <div style={cs("padding:24px;font-size:13px;color:var(--mute)")}>Open this tab to load real on-chain position and hook data.</div>
                )}
              </div>
            )}

            {v.tabLending && <LendingTab v={v} />}
            {v.tabGovernance && <GovernanceTab v={v} />}
          </div>
        </div>

        {!v.isMobile && (
          <div style={cs("display:flex;flex-direction:column;gap:16px;position:sticky;top:80px")}>
            <TradePanel v={v} sel={sel} tok={tok} />
          </div>
        )}
      </div>

      {v.isMobile && (
        <>
          {/* Floating trade button -- always reachable while scrolled, opens
              the same Buy/Sell form as a bottom sheet instead of it stacking
              inline below everything else on the page. */}
          {/* bottom:60px clears the persistent status/social bar (44px tall,
              pinned at bottom:0 across every page) that sits underneath it. */}
          <button onClick={() => setTradeSheetOpen(true)} style={cs("position:fixed;left:16px;right:16px;bottom:60px;z-index:70;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;border:1px solid var(--line);border-radius:14px;background:var(--lime);color:var(--on);box-shadow:0 10px 24px -8px rgba(0,0,0,.55);cursor:pointer")}>
            <span style={cs("font-size:14.5px;font-weight:700")}>Trade {sel.symbol}</span>
            <span style={cs("font-family:'JetBrains Mono',monospace;font-size:13px")}>{sel.price}</span>
          </button>
          <div style={cs("height:120px")}></div>

          {tradeSheetOpen && (
            <div onClick={() => setTradeSheetOpen(false)} style={cs("position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;align-items:flex-end")}>
              <div onClick={(e) => e.stopPropagation()} style={cs("width:100%;max-height:88vh;overflow-y:auto;background:var(--card);border-top:1px solid var(--line);border-radius:14px 14px 0 0;animation:popin .18s ease both")}>
                <div style={cs("display:flex;justify-content:center;padding:10px 0 4px")}>
                  <div style={cs("width:36px;height:4px;border-radius:99px;background:var(--input)")}></div>
                </div>
                <div style={cs("padding:0 4px 4px")}>
                  <TradePanel v={v} sel={sel} tok={tok} />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
