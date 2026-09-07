import { useEffect, useState } from "react";
import { cs } from "../cs.js";
import Thumb from "../Thumb.jsx";
import { AddressChip, LinkChip } from "../MetaChips.jsx";

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function Countdown({ deadlineMs }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadlineMs - now;
  if (remaining <= 0) return <span>DEADLINE PASSED</span>;
  return <span>ENDS IN {formatCountdown(remaining)}</span>;
}

export default function CampaignPage({ v }) {
  const camp = v.camp;
  if (!camp) return null;
  return (
    <div>
      <button onClick={v.goHome} style={cs("border:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.1em;color:var(--mute);cursor:pointer;padding:0 0 14px")}>← DISCOVER</button>

      <div style={cs(`display:grid;grid-template-columns:${v.isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 366px"};gap:16px;align-items:start`)}>
        <div style={cs("display:flex;flex-direction:column;gap:16px;min-width:0")}>
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("display:flex;align-items:stretch;border-bottom:1px solid var(--line);flex-wrap:wrap")}>
              <div style={cs(`width:${v.isMobile ? "56px" : "84px"};height:${v.isMobile ? "56px" : "84px"};align-self:flex-start;flex:none;border-right:1px solid var(--line)`)}>
                <Thumb url={camp.imageUrl} bg="var(--orange)" fg="#fff" initials={camp.initials} size="100%" fontSize={v.isMobile ? "18px" : "26px"} />
              </div>
              <div style={cs("flex:1;min-width:260px;padding:16px 20px")}>
                <div style={cs("display:flex;align-items:baseline;gap:11px;flex-wrap:wrap")}>
                  <h1 style={cs(`margin:0;font-size:${v.isMobile ? "20px" : "28px"};font-weight:700;letter-spacing:-.04em`)}>{camp.name}</h1>
                  <span style={cs("font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--mute)")}>{camp.symbol}</span>
                  <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:${camp.stBg};color:${camp.stFg}`)}>{camp.status}</span>
                </div>
                <div style={cs("display:flex;gap:7px;margin-top:10px;flex-wrap:wrap")}>
                  <AddressChip address={camp.token} full={camp.tokenAddress} />
                  {v.chain.blockExplorerUrl && <LinkChip href={`${v.chain.blockExplorerUrl}/address/${camp.tokenAddress}`}>Explorer</LinkChip>}
                  {camp.socials?.website && <LinkChip href={camp.socials.website}>Website</LinkChip>}
                  {camp.socials?.twitter && <LinkChip href={camp.socials.twitter}>X</LinkChip>}
                  {camp.socials?.telegram && <LinkChip href={camp.socials.telegram}>Telegram</LinkChip>}
                </div>
              </div>
            </div>

            <div style={cs("padding:20px;border-bottom:1px solid var(--line)")}>
              {camp.desc && <p style={cs("margin:0 0 18px;font-size:14px;color:var(--mute);line-height:1.6;max-width:72ch")}>{camp.desc}</p>}
              <div style={cs(`border:1px solid var(--line);border-radius:10px;background:${camp.noteBg};color:${camp.noteFg};padding:14px 16px;font-size:13px;line-height:1.55;margin-bottom:20px`)}>{camp.note}</div>
              <div style={cs("display:flex;height:26px;border-radius:8px;background:var(--soft);padding:3px")}>
                <div style={cs(`height:100%;border-radius:6px;width:${camp.progWidth}%;background:${camp.progFill}`)}></div>
              </div>
              <div style={cs("display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-family:'JetBrains Mono',monospace;font-size:12.5px;margin-top:11px")}>
                <span style={cs("font-weight:500")}>{camp.raised} / {camp.goal} {camp.quoteSymbol}</span>
                <span style={cs("color:var(--mute)")}>{camp.backers} BACKERS</span>
                <span style={cs(`color:${camp.deadlineC}`)}>{camp.isRaising ? <Countdown deadlineMs={camp.deadlineMs} /> : camp.deadline}</span>
              </div>
            </div>

            <div style={cs("display:flex;flex-wrap:wrap")}>
              {camp.facts.map((f, i) => (
                <div key={i} style={cs("flex:1;min-width:150px;padding:13px 16px;border-right:1px solid var(--line)")}>
                  <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>{f.k}</div>
                  <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px")}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow-x:auto")}>
            <div style={cs("padding:13px 18px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
              <span style={cs("font-size:15px;font-weight:700;letter-spacing:-.02em")}>Contributions</span>
              <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>pro-rata · nothing transfers until finalize</span>
            </div>
            <div style={cs("display:grid;min-width:520px;grid-template-columns:1.4fr 1fr 1fr;gap:14px;padding:10px 18px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>
              <span>WALLET</span><span style={cs("text-align:right")}>{camp.quoteSymbol} IN</span><span style={cs("text-align:right")}>STATUS</span>
            </div>
            {camp.contribs.length === 0 && <div style={cs("padding:24px 18px;font-size:13px;color:var(--mute)")}>No contributions yet.</div>}
            {camp.contribs.map((c, i) => (
              <div key={i} style={cs("display:grid;min-width:520px;grid-template-columns:1.4fr 1fr 1fr;gap:14px;padding:11px 18px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px;align-items:center")}>
                {v.chain.blockExplorerUrl
                  ? <a href={`${v.chain.blockExplorerUrl}/address/${c.full}`} target="_blank" rel="noreferrer">{c.wallet}</a>
                  : <span>{c.wallet}</span>}
                <span style={cs("text-align:right;font-weight:500")}>{c.eth} {camp.quoteSymbol}</span>
                <span style={cs("text-align:right;color:var(--mute)")}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={cs(`display:flex;flex-direction:column;gap:16px;${v.isMobile ? "" : "position:sticky;top:80px"}`)}>
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("padding:16px 18px;border-bottom:1px solid var(--line)")}>
              <div style={cs("font-size:17px;font-weight:700;letter-spacing:-.03em")}>{camp.actionTitle}</div>
              <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.5;margin-top:6px")}>{camp.actionSub}</div>
            </div>
            <div style={cs("padding:18px")}>
              {camp.canContribute && (
                <>
                  <div style={cs("display:flex;justify-content:flex-end;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute);margin-bottom:6px")}>
                    BAL {camp.contribBalance} {camp.contribAsset}
                  </div>
                  <div style={cs("display:flex;align-items:stretch;border:1px solid var(--line);border-radius:9px;background:var(--paper);margin-bottom:16px;overflow:hidden")}>
                    <input value={v.contribAmount} onChange={v.setContrib} style={cs("flex:1;min-width:0;border:0;outline:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:500;letter-spacing:-.03em;padding:13px 14px")} />
                    <span style={cs("padding:0 14px;border-left:1px solid var(--line);display:flex;align-items:center;font-family:'JetBrains Mono',monospace;font-size:13px")}>{camp.quoteSymbol}</span>
                  </div>
                </>
              )}
              <button onClick={v.submitCampaignAction} disabled={v.txPending} style={cs(`width:100%;padding:16px;border:1px solid var(--line);border-radius:6px;background:${camp.ctaBg};color:${camp.ctaFg};font-size:15.5px;font-weight:700;cursor:pointer`)}>{v.txPending ? "Confirming…" : camp.cta}</button>
              <div style={cs("font-size:12px;color:var(--mute);line-height:1.55;margin-top:14px")}>{camp.ctaNote}</div>
            </div>
          </div>

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("padding:11px 15px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>ESCROW &amp; CUSTODY</div>
            {camp.custody.map((c, i) => (
              <div key={i} style={cs("display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
                <span style={cs("color:var(--mute)")}>{c.k}</span><span style={cs(`font-weight:500;color:${c.c}`)}>{c.v}</span>
              </div>
            ))}
          </div>

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("padding:11px 15px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>RESOLUTION PATH</div>
            {camp.timeline.map((t, i) => (
              <div key={i} style={cs("display:flex;gap:12px;padding:13px 15px;border-bottom:1px solid var(--soft)")}>
                <span style={cs(`width:11px;height:11px;border-radius:999px;border:1px solid var(--line);background:${t.on ? "var(--lime)" : "var(--paper)"};margin-top:3px;flex:none`)}></span>
                <div>
                  <div style={cs("font-size:13px;font-weight:600;letter-spacing:-.01em")}>{t.k}</div>
                  <div style={cs("font-size:12px;color:var(--mute);line-height:1.45;margin-top:3px")}>{t.v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
