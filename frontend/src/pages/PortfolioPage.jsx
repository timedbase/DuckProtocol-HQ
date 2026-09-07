import { cs } from "../cs.js";
import { ageLabel } from "../data.js";
import { usdOrQuote } from "../adapters.js";
import Thumb from "../Thumb.jsx";

export default function PortfolioPage({ v }) {
  if (!v.connected) {
    return (
      <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:56px;display:flex;flex-direction:column;align-items:center;gap:14px")}>
        <span style={cs("font-size:18px;font-weight:700")}>Connect a wallet to see your portfolio.</span>
        <button onClick={v.toggleWallet} style={cs("border:1px solid var(--line);border-radius:6px;cursor:pointer;font-size:13.5px;font-weight:700;background:var(--lime);color:var(--on);padding:12px 22px")}>Connect wallet</button>
      </div>
    );
  }

  const coinById = new Map(v.coins.map((c) => [c.id, c]));
  const held = v.portfolio.holdings.filter((h) => Number(h.balance) > 0);
  const created = v.portfolio.created;
  const contributions = v.portfolio.contributions;

  const pfStats = [
    { label: "WALLET", value: v.balance + " " + v.nativeSymbol, sub: v.accountShort, bg: "var(--card)", fg: "var(--ink)", labelFg: "var(--mute)" },
    { label: "TOKENS HELD", value: String(held.length), sub: "positions", bg: "var(--card)", fg: "var(--ink)", labelFg: "var(--mute)" },
    { label: "TOKENS CREATED", value: String(created.length), sub: "launches", bg: "var(--lime)", fg: "var(--on)", labelFg: "var(--acc)" },
    { label: "CONTRIBUTIONS", value: String(contributions.length), sub: "campaigns backed", bg: "var(--card)", fg: "var(--ink)", labelFg: "var(--mute)" },
  ];

  const claims = contributions
    .map((ct) => {
      const camp = ct.campaign;
      if (!camp) return null;
      const resolved = camp.succeeded || camp.failed;
      if (!resolved) return null;
      if (camp.succeeded && !ct.claimed) return { title: camp.name + " allocation", sub: "DuckRaise · succeeded", cta: "Claim", bg: "var(--lime)", fg: "var(--on)", open: camp.token ? () => v.openToken(camp.token.id) : null };
      if (camp.failed && !ct.refunded) return { title: camp.name + " refund", sub: (Number(ct.amount) / 1e18).toFixed(4) + " " + v.nativeSymbol + " · goal missed", cta: "Refund", bg: "var(--orange)", fg: "#fff", open: camp.token ? () => v.openToken(camp.token.id) : null };
      return null;
    })
    .filter(Boolean);

  return (
    <div style={cs("display:flex;flex-direction:column;gap:16px")}>
      <div>
        <h1 style={cs(`margin:0 0 4px;font-size:${v.isMobile ? "26px" : "36px"};letter-spacing:-.045em;font-weight:700;line-height:1.05`)}>Portfolio</h1>
        <div style={cs("font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--mute)")}>{v.accountShort} · INK</div>
      </div>

      <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px")}>
        {pfStats.map((st, i) => (
          <div key={i} style={cs(`border:1px solid var(--line);background:${st.bg};color:${st.fg};border-radius:10px;box-shadow:var(--sh);padding:16px 18px;display:flex;flex-direction:column`)}>
            <div style={cs(`font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:${st.labelFg}`)}>{st.label}</div>
            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:500;letter-spacing:-.03em;margin-top:8px")}>{st.value}</div>
            <div style={cs(`font-size:11.5px;color:${st.labelFg};margin-top:6px`)}>{st.sub}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={cs("display:flex;align-items:baseline;gap:10px;margin-bottom:12px")}>
          <h2 style={cs("margin:0;font-size:19px;font-weight:700;letter-spacing:-.03em")}>Holdings</h2>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>{held.length} position{held.length === 1 ? "" : "s"}</span>
        </div>
        {held.length === 0 && (
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);padding:40px 0;display:flex;flex-direction:column;align-items:center;gap:10px")}>
            <span style={cs("font-size:14.5px;font-weight:700")}>No token holdings yet.</span>
            <button onClick={v.goHome} style={cs("border:1px solid var(--line);border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;background:var(--lime);color:var(--on);padding:11px 22px")}>Browse coins</button>
          </div>
        )}
        {held.length > 0 && (
          <div style={cs(`display:grid;grid-template-columns:repeat(auto-fill,minmax(${v.isMobile ? "100%" : "330px"},1fr));gap:12px`)}>
            {held.map((h, i) => {
              const co = coinById.get(h.token?.id);
              const balanceTokens = Number(h.balance) / 1e18;
              const supplyTokens = co?.totalSupply ? Number(co.totalSupply) / 1e18 : 0;
              const sharePct = supplyTokens > 0 ? (balanceTokens / supplyTokens) * 100 : null;
              const value = co && co.price != null ? balanceTokens * co.price : null;
              const valueUsd = co && co.priceUsd != null ? balanceTokens * co.priceUsd : null;
              return (
                <div key={i} style={cs("border:1px solid var(--line);background:var(--card);border-radius:10px;box-shadow:var(--sh);padding:14px;display:flex;gap:14px")}>
                  <Thumb url={co?.imageUrl} bg={co ? co.famBg : "var(--card)"} fg={co ? co.famFg : "var(--ink)"} initials={co ? co.initials : "??"} size="56px" radius="11px" fontSize="17px" />
                  <div style={cs("flex:1;min-width:0;display:flex;flex-direction:column")}>
                    <div style={cs("display:flex;align-items:baseline;gap:7px;min-width:0")}>
                      <span style={cs("font-size:15.5px;font-weight:700;letter-spacing:-.025em;flex:none")}>{co ? co.ticker : h.token?.id?.slice(0, 8)}</span>
                      <span style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--mute);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{co?.family}</span>
                    </div>
                    <div style={cs("font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:500;letter-spacing:-.03em;margin-top:8px")}>{co ? usdOrQuote(valueUsd, value, co.quote) : "—"}</div>
                    <div style={cs("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{balanceTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}{sharePct != null ? " · " + sharePct.toFixed(sharePct < 1 ? 3 : 1) + "% of supply" : ""}</div>
                    <div style={cs("flex:1;min-height:10px")}></div>
                    <button onClick={() => co && v.openToken(co.id)} className="d-hover-lime" style={cs("align-self:flex-start;padding:8px 15px;border:1px solid var(--line);border-radius:8px;background:var(--card);font-size:12.5px;font-weight:600;cursor:pointer")}>Open</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px")}>
        <div>
          <h2 style={cs("margin:0 0 12px;font-size:19px;font-weight:700;letter-spacing:-.03em")}>Claims &amp; refunds</h2>
          <div style={cs("display:flex;flex-direction:column;gap:10px")}>
            {claims.length === 0 && <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:16px;font-size:13px;color:var(--mute)")}>Nothing to claim right now.</div>}
            {claims.map((cl, i) => (
              <div key={i} style={cs("border:1px solid var(--line);background:var(--card);border-radius:10px;box-shadow:var(--sh);padding:14px 16px;display:flex;align-items:center;gap:14px")}>
                <div style={cs("min-width:0;flex:1")}>
                  <div style={cs("font-size:13.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{cl.title}</div>
                  <div style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{cl.sub}</div>
                </div>
                <button onClick={cl.open || (() => {})} style={cs(`padding:9px 16px;border:1px solid var(--line);border-radius:8px;background:${cl.bg};color:${cl.fg};font-size:12.5px;font-weight:700;cursor:pointer;flex:none`)}>{cl.cta}</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={cs("display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px")}>
            <h2 style={cs("margin:0;font-size:19px;font-weight:700;letter-spacing:-.03em")}>Tokens you launched</h2>
            {created.length > 0 && <button onClick={v.claimAllCreatorFees} style={cs("border:1px solid var(--line);border-radius:7px;cursor:pointer;font-size:11px;font-weight:700;background:var(--card);padding:6px 12px")}>Claim all</button>}
          </div>
          <div style={cs("display:flex;flex-direction:column;gap:10px")}>
            {created.length === 0 && (
              <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);padding:40px 0;display:flex;flex-direction:column;align-items:center;gap:10px")}>
                <span style={cs("font-size:14.5px;font-weight:700")}>You haven't created anything yet.</span>
                <button onClick={v.goCreate} style={cs("border:1px solid var(--line);border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;background:var(--lime);color:var(--on);padding:11px 22px")}>Launch a coin</button>
              </div>
            )}
            {created.map((t, i) => {
              const co = coinById.get(t.id);
              return (
                <div key={i} style={cs("border:1px solid var(--line);background:var(--card);border-radius:10px;box-shadow:var(--sh);padding:14px 16px;display:flex;align-items:center;gap:14px")}>
                  <Thumb url={co?.imageUrl} bg={co ? co.famBg : "var(--card)"} fg={co ? co.famFg : "var(--ink)"} initials={co ? co.initials : "??"} size="34px" radius="11px" fontSize="12px" />
                  <div style={cs("min-width:0;flex:1")}>
                    <button onClick={() => v.openToken(t.id)} style={cs("border:0;background:transparent;cursor:pointer;padding:0;text-align:left;font-size:13.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;width:100%")}>{co ? co.ticker + " · " + co.name : t.id.slice(0, 10)}</button>
                    <div style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t.family} · {ageLabel(Math.round((Date.now() / 1000 - Number(t.createdAt)) / 60))} old</div>
                  </div>
                  <button onClick={() => v.claimCreatorFees(t.id)} className="d-hover-lime" style={cs("padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);font-size:12px;font-weight:600;cursor:pointer;flex:none")}>Claim fees</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
