import { useState, useRef, useEffect } from "react";
import { cs } from "../cs.js";
import Thumb from "../Thumb.jsx";
import Sparkline from "../Sparkline.jsx";
import { XIcon, TelegramIcon, GlobeIcon, VerifiedBadge, CrownIcon } from "../MetaChips.jsx";
import { logoFor } from "../chain/quoteLogos.js";

// buildSparkline (adapters.js) returns a flat "var(--soft)" placeholder row
// whenever a token has no real trade history to chart yet (deliberately
// muted rather than faked) -- today that's every card in the Discover feed,
// since the list endpoint doesn't carry per-token trade history. Rendering
// that placeholder as if it were a chart just leaves identical dead space
// under every card, so only give the sparkline its slot once real,
// non-flat data actually backs it (an existing/detail-page-warmed coin, or
// once the feed itself starts carrying real history).
function hasRealSpark(bars) {
  return !!bars && bars.length > 0 && bars[0].c !== "var(--soft)";
}

// Square, image-first block shared by the hero rail and the feed grid --
// the token's own art is the card's visual anchor. The family badge rides
// top-right, a "paired with" quote-asset pill (real logo when one's
// verified, see chain/quoteLogos.js) rides top-left -- both floating
// directly on the image since they carry their own solid/translucent
// background regardless of how busy the art underneath is. The hero rail's
// image column is only 128px wide (vs. 220px+ for a feed card), too narrow
// for both badges to sit side by side without overlapping -- showQuote
// drops the left one there rather than let it collide with the family
// badge.
function ImageBlock({ t, badgeSize = "9px", showQuote = true }) {
  return (
    <div style={cs("position:relative;width:100%;padding-top:66%;overflow:hidden;flex:none;background:var(--paper)")}>
      <Thumb url={t.imageUrl} bg={t.famBg} fg={t.famFg} initials={t.initials} size="100%" radius="0" fontSize={t.logoType || "34px"} style="position:absolute;top:0;left:0" />
      <div style={cs("position:absolute;left:0;right:0;bottom:0;height:52%;background:linear-gradient(to top,rgba(16,16,16,.62),transparent);pointer-events:none")}></div>
      {showQuote && t.quote && (
        <span style={cs(`position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:4px;padding:2px 8px 2px 3px;border-radius:999px;background:rgba(23,23,23,.78);color:#fff;font-family:'JetBrains Mono',monospace;font-size:${badgeSize};font-weight:600;letter-spacing:.02em;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)`)}>
          <img src={logoFor(t.quote)} alt="" style={cs("width:13px;height:13px;border-radius:999px;object-fit:cover;flex:none")} />
          {t.quote}
        </span>
      )}
      <span style={cs(`position:absolute;top:8px;right:8px;padding:3px 9px;border-radius:999px;background:${t.famBg};color:${t.famFg};font-family:'JetBrains Mono',monospace;font-size:${badgeSize};font-weight:600;letter-spacing:.04em;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)`)}>{t.family}</span>
    </div>
  );
}

// The 24h % change as a tinted pill rather than plain colored text -- reads
// as a signal at a glance across a whole grid of cards, the way a real
// trading UI's movers list does.
function ChangePill({ chg, chgColor, size = "11.5px" }) {
  const pos = chgColor === "var(--pos)";
  const bg = chgColor === "var(--mute)" ? "var(--soft)" : pos ? "rgba(163,230,53,.16)" : "rgba(240,101,74,.16)";
  return (
    <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:${size};font-weight:600;color:${chgColor};background:${bg};padding:2px 7px;border-radius:6px;white-space:nowrap;flex:none`)}>{chg}</span>
  );
}

function ProgressRow({ t, height = "6px", fontSize = "10px" }) {
  return (
    <div>
      <div style={cs(`display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:'JetBrains Mono',monospace;font-size:${fontSize};letter-spacing:.07em;color:var(--mute);margin-bottom:6px`)}>
        <span style={cs("min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t.progLabel}</span>
        <span style={cs("flex:none;color:var(--ink);font-weight:600")}>{t.progPct}</span>
      </div>
      {t.showProg && (
        <div style={cs(`height:${height};border-radius:99px;background:var(--soft);overflow:hidden`)}>
          <div style={cs(`height:100%;width:${t.progWidth}%;background:${t.progFill};border-radius:99px;transition:width .3s ease`)}></div>
        </div>
      )}
    </div>
  );
}

// Small per-card social icon row -- X/Telegram/Website, only the ones a
// creator actually filled in. stopPropagation so tapping an icon opens the
// link instead of also triggering the card's own onClick (open token).
function SocialRow({ socials, size = "22px" }) {
  const items = [
    socials?.twitter && { href: socials.twitter, icon: <XIcon size={11} /> },
    socials?.telegram && { href: socials.telegram, icon: <TelegramIcon size={12} /> },
    socials?.website && { href: socials.website, icon: <GlobeIcon size={12} /> },
  ].filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div style={cs("display:flex;gap:6px")}>
      {items.map((it, i) => (
        <a key={i} href={it.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          style={cs(`width:${size};height:${size};flex:none;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:11px`)}>{it.icon}</a>
      ))}
    </div>
  );
}

// Discover's permanent hero slot -- pinned to the platform's own token
// ("The Duck", $DUCK), not the highest-mcap community launch. A lime (not
// the default) card border and a full-height sparkline set it apart from an
// ordinary feed card at a glance, instead of just being a wider version of
// one.
function TheDuckCard({ v }) {
  const t = v.kingCoin;
  if (!t) return <DuckComingSoonCard v={v} />;
  const hasSocials = t.socials?.twitter || t.socials?.telegram || t.socials?.website;
  return (
    <div onClick={t.open} className="d-lift" style={cs("position:relative;flex:1;min-width:320px;cursor:pointer;display:flex;border:1px solid rgba(163,230,53,.35);border-radius:10px;overflow:hidden;background:radial-gradient(130% 150% at 0% 0%,rgba(163,230,53,.16),transparent 60%),var(--card);box-shadow:var(--sh),0 0 0 1px rgba(163,230,53,.06)")}>
      <div style={cs("width:140px;flex:none;display:flex;flex-direction:column")}>
        {/* Full-bleed, fills whatever height the taller text column leaves
            behind (flex:1 in this column), instead of ImageBlock's own fixed
            padding-top aspect box -- that fixed box left dead space below
            the social row once the stats side grew taller than it. */}
        <div style={cs("position:relative;flex:1;min-height:0;overflow:hidden;background:var(--paper)")}>
          <Thumb url={t.imageUrl} bg={t.famBg} fg={t.famFg} initials={t.initials} size="100%" radius="0" fontSize={t.logoType || "34px"} style="position:absolute;inset:0" />
          <div style={cs("position:absolute;left:0;right:0;bottom:0;height:52%;background:linear-gradient(to top,rgba(16,16,16,.62),transparent);pointer-events:none")}></div>
          <span style={cs(`position:absolute;top:8px;right:8px;padding:3px 8px;border-radius:999px;background:${t.famBg};color:${t.famFg};font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:600;letter-spacing:.04em;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)`)}>{t.family}</span>
        </div>
        {hasSocials && (
          <div style={cs("padding:9px;display:flex;justify-content:center;flex:none")}>
            <SocialRow socials={t.socials} />
          </div>
        )}
      </div>
      <div style={cs("flex:1;min-width:0;padding:16px 18px;display:flex;flex-direction:column;gap:9px")}>
        <div style={cs("display:flex;align-items:center;justify-content:space-between;gap:8px")}>
          <div style={cs("display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.16em;color:var(--lime)")}>
            <CrownIcon size={11} />
            KING OF DUCKS
          </div>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);flex:none")}>{t.price}</span>
        </div>
        <div style={cs("display:flex;align-items:center;gap:8px;min-width:0")}>
          <span style={cs("font-size:22px;font-weight:700;letter-spacing:-.03em;flex:none")}>{t.symbol}</span>
          {t.verified && <span title="Verified: the platform's own token" style={cs("flex:none;display:flex")}><VerifiedBadge size={16} /></span>}
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--mute);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t.name}</span>
        </div>
        <div style={cs("display:flex;align-items:baseline;gap:9px;font-family:'JetBrains Mono',monospace;flex-wrap:wrap")}>
          <span style={cs("font-size:19px;font-weight:600;letter-spacing:-.03em")}>MC {t.mcapLabel}</span>
          <ChangePill chg={t.chg} chgColor={t.chgColor} />
        </div>
        <div style={cs("display:flex;gap:16px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute)")}>
          <span>VOL <span style={cs("color:var(--ink);font-weight:600")}>{t.vol}</span></span>
          <span>HOLDERS <span style={cs("color:var(--ink);font-weight:600")}>{t.holders}</span></span>
        </div>
        <div style={cs("flex:1;min-height:4px")}></div>
        {hasRealSpark(t.bars) ? (
          <div style={cs("height:46px")}><Sparkline bars={t.bars} height="46px" /></div>
        ) : (
          <div style={cs("height:1px;background:linear-gradient(90deg,rgba(163,230,53,.35),transparent)")}></div>
        )}
      </div>
    </div>
  );
}

// Before $DUCK actually launches on-chain (no verified token in v.coins
// yet -- see the backend's DUCK_TOKEN_ADDRESS env var and App.jsx's
// duckCoin lookup), the hero slot stays put rather than disappearing: same
// visual language, honest "not launched yet" state instead of stats that
// don't exist yet, and no click-through since there's no token page to
// open.
function DuckComingSoonCard({ v }) {
  return (
    <div className="d-lift" style={cs("position:relative;flex:1;min-width:300px;display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:radial-gradient(120% 140% at 0% 0%,rgba(163,230,53,.13),transparent 60%),var(--card);box-shadow:var(--sh)")}>
      <div style={cs("width:128px;flex:none;position:relative;background:var(--paper);display:flex;align-items:center;justify-content:center")}>
        <span style={cs("font-size:34px;font-weight:700;letter-spacing:-.03em;color:var(--mute)")}>🦆</span>
      </div>
      <div style={cs("flex:1;min-width:0;padding:16px 18px;display:flex;flex-direction:column;gap:8px;justify-content:center")}>
        <div style={cs("display:flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.16em;color:var(--lime)")}>
          <CrownIcon size={11} />
          KING OF DUCKS
        </div>
        <div style={cs("display:flex;align-items:baseline;gap:8px;min-width:0")}>
          <span style={cs("font-size:21px;font-weight:700;letter-spacing:-.03em;flex:none")}>$DUCK</span>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--mute)")}>The Duck</span>
        </div>
        <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.5;max-width:34ch")}>Not launched yet -- this slot is reserved for the platform's own token.</div>
      </div>
    </div>
  );
}

function IntroCard({ v }) {
  return (
    <div style={cs("position:relative;flex:1;min-width:240px;border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);padding:20px;display:flex;flex-direction:column;gap:10px;justify-content:center;overflow:hidden")}>
      <div style={cs("position:absolute;top:-40px;right:-40px;width:130px;height:130px;border-radius:99px;background:radial-gradient(circle,rgba(245,166,35,.16),transparent 70%)")}></div>
      <div style={cs("font-size:18px;font-weight:700;letter-spacing:-.03em")}>Launch a token on {v.chainName}</div>
      <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.5;max-width:38ch")}>Bonding curve, instant V4 pool, or a crowdlaunch you set the terms for.</div>
      <div style={cs("display:flex;gap:8px;flex-wrap:wrap")}>
        <button onClick={v.goCreate} style={cs("padding:10px 16px;border:1px solid var(--line);border-radius:8px;background:var(--lime);color:var(--on);font-size:13px;font-weight:700;cursor:pointer")}>Launch a coin</button>
      </div>
    </div>
  );
}

function FeedCard({ t }) {
  return (
    <div onClick={t.open} className="d-lift" style={cs("border:1px solid var(--line);background:var(--card);border-radius:10px;box-shadow:var(--sh);cursor:pointer;overflow:hidden;display:flex;flex-direction:column")}>
      <ImageBlock t={t} />
      <div style={cs("padding:12px 14px;display:flex;flex-direction:column;gap:9px;flex:1")}>
        <div>
          <div style={cs("display:flex;align-items:center;gap:7px;min-width:0")}>
            <span style={cs("font-size:15px;font-weight:700;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t.name}</span>
            {t.verified && <span title="Verified: the platform's own token" style={cs("flex:none;display:flex")}><VerifiedBadge size={13} /></span>}
            <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--mute);flex:none")}>{t.symbol}</span>
          </div>
          <div style={cs("font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--mute);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>by {t.creator} · {t.age}</div>
        </div>

        <div style={cs("display:flex;align-items:center;justify-content:space-between;gap:8px")}>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:14.5px;font-weight:600;letter-spacing:-.02em")}>{t.mcap}</span>
          <ChangePill chg={t.chg} chgColor={t.chgColor} />
        </div>

        {hasRealSpark(t.bars) && <div style={cs("height:30px;margin:-2px 0")}><Sparkline bars={t.bars} height="30px" /></div>}

        <ProgressRow t={t} height="5px" fontSize="9.5px" />

        <div style={cs("display:flex;align-items:center;gap:10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);padding-top:2px;border-top:1px solid var(--soft)")}>
          <span style={cs("white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-top:8px")}>VOL <span style={cs("color:var(--ink)")}>{t.vol}</span></span>
          <span style={cs("margin-left:auto;white-space:nowrap;padding-top:8px")}>{t.holders} hldrs</span>
        </div>
        <SocialRow socials={t.socials} size="20px" />
      </div>
    </div>
  );
}

// Custom popover dropdown -- replaces a bare native <select>, which
// renders with the OS's own unstyled chrome and was the one control left
// on this page that didn't match everything else's dark/mono styling.
// Matches the same button+absolute-panel shape App.jsx's own chain
// selector already uses, just generalized to take any option list.
function Dropdown({ value, onChange, options, isMobile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  const current = options.find((o) => o.key === value) || options[0];
  return (
    <div ref={ref} style={cs(`position:relative;flex:1 1 110px;min-width:0;${isMobile ? "" : ""}`)}>
      <button onClick={() => setOpen((o) => !o)} style={cs(`width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:${isMobile ? "7px 8px" : "8px 12px"};font-family:'JetBrains Mono',monospace;font-size:${isMobile ? "11px" : "12px"};color:var(--ink);cursor:pointer;white-space:nowrap`)}>
        <span style={cs("overflow:hidden;text-overflow:ellipsis")}>{current?.label}</span>
        <span style={cs(`font-size:9px;color:var(--mute);flex:none;transform:${open ? "rotate(180deg)" : "none"}`)}>▾</span>
      </button>
      {open && (
        <div style={cs("position:absolute;top:calc(100% + 4px);left:0;z-index:50;min-width:180px;border:1px solid var(--line);border-radius:8px;background:var(--card);box-shadow:var(--sh);overflow:hidden;padding:4px")}>
          {options.map((o) => (
            <button key={o.key} onClick={() => { onChange(o.key); setOpen(false); }} style={cs(`display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:6px;background:${o.key === value ? "var(--paper)" : "transparent"};color:var(--ink);font-size:12.5px;font-weight:${o.key === value ? "700" : "500"};text-align:left;cursor:pointer;white-space:nowrap`)}>
              {o.label}
              {o.key === value && <span style={cs("color:var(--lime);font-size:12px;flex:none")}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage({ v }) {
  return (
    <div>
      <div style={cs("margin-bottom:16px")}>
        <h1 style={cs(`margin:0 0 4px;font-size:${v.isMobile ? "26px" : "36px"};letter-spacing:-.045em;font-weight:700;line-height:1.05`)}>Discover</h1>
        <div style={cs("font-size:13.5px;color:var(--mute)")}>Every token live on {v.chainName}</div>
      </div>

      <div style={cs(`display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px`)}>
        <IntroCard v={v} />
        <TheDuckCard v={v} />
      </div>

      <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px;display:flex;flex-direction:column;gap:10px;margin-bottom:16px")}>
        <div style={cs("display:flex;gap:10px;flex-wrap:wrap;align-items:center")}>
          <div style={cs(`display:flex;border:1px solid var(--line);border-radius:8px;overflow-x:auto;background:var(--paper);${v.isMobile ? "width:100%" : ""}`)}>
            {v.sortTabs.map((h, i) => (
              <button key={i} onClick={h.go} style={cs(`padding:${v.isMobile ? "7px 10px" : "8px 14px"};border:0;flex:${v.isMobile ? "1" : "none"};border-left:${i === 0 ? "0" : "1px solid var(--line)"};background:${h.bg};color:${h.fg};font-size:${v.isMobile ? "11px" : "12.5px"};font-weight:600;white-space:nowrap;cursor:pointer`)}>{h.label}</button>
            ))}
          </div>
          {!v.isMobile && <div style={cs("width:1px;align-self:stretch;background:var(--line)")}></div>}
          <div style={cs(`display:flex;border:1px solid var(--line);border-radius:8px;overflow-x:auto;max-width:100%;background:var(--paper);${v.isMobile ? "width:100%" : ""}`)}>
            {v.filters.map((f, i) => (
              <button key={i} onClick={f.go} style={cs(`padding:${v.isMobile ? "7px 8px" : "8px 14px"};border:0;flex:${v.isMobile ? "1" : "none"};white-space:nowrap;border-left:${f.dv};background:${f.bg};color:${f.fg};font-size:${v.isMobile ? "10.5px" : "12.5px"};font-weight:600;cursor:pointer`)}>{f.label}</button>
            ))}
          </div>
          {!v.isMobile && <div style={cs("flex:1")}></div>}
          {!v.isMobile && (
            <div style={cs("display:flex;gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex:none")}>
              <button onClick={v.setLayoutCards} style={cs(`padding:8px 14px;border:0;background:${v.lcBg};color:${v.lcFg};font-size:12.5px;font-weight:600;cursor:pointer`)}>Cards</button>
              <button onClick={v.setLayoutTable} style={cs(`padding:8px 14px;border:0;border-left:1px solid var(--line);background:${v.ltBg};color:${v.ltFg};font-size:12.5px;font-weight:600;cursor:pointer`)}>Table</button>
            </div>
          )}
        </div>

        <div style={cs("display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
          <Dropdown value={v.mcapFilter} onChange={v.setMcapFilter} options={v.mcapPresets} isMobile={v.isMobile} />
          <Dropdown value={v.launchedFilter} onChange={v.setLaunchedFilter} options={v.launchedPresets} isMobile={v.isMobile} />
          <Dropdown value={v.quoteFilter} onChange={v.setQuoteFilter} options={v.quoteFilterOptions.map((q) => ({ key: q, label: q === "any" ? "Any pair" : q }))} isMobile={v.isMobile} />
          <div style={cs(`display:flex;align-items:center;gap:9px;padding:8px 13px;border:1px solid var(--line);border-radius:8px;background:var(--paper);min-width:${v.isMobile ? "0" : "230px"};width:${v.isMobile ? "100%" : "auto"};flex:${v.isMobile ? "1 1 100%" : "1 1 230px"}`)}>
            <span style={cs("color:var(--mute);font-size:13px")}>⌕</span>
            <input value={v.query} onChange={v.setQuery} placeholder="Name, symbol or address" style={cs("border:0;outline:0;background:transparent;font-size:13px;width:100%")} />
          </div>
        </div>
      </div>

      {(v.layoutCards || v.isMobile) && (
        <div style={cs(`display:grid;grid-template-columns:repeat(auto-fill,minmax(${v.isMobile ? "150px" : "228px"},1fr));gap:14px`)}>
          {v.feed.map((t) => <FeedCard key={t.id} t={t} />)}
        </div>
      )}

      {v.layoutTable && !v.isMobile && (
        <div style={cs("border:1px solid var(--line);background:var(--card);border-radius:10px;overflow:hidden")}>
          <div style={cs("display:grid;min-width:760px;grid-template-columns:2.2fr .9fr .8fr .9fr .9fr 1.4fr;gap:14px;padding:11px 18px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>
            <span>TOKEN</span><span style={cs("text-align:right")}>PRICE</span><span style={cs("text-align:right")}>24H</span><span style={cs("text-align:right")}>MCAP</span><span style={cs("text-align:right")}>VOLUME</span><span>PROGRESS</span>
          </div>
          {v.feed.map((t) => (
            <div key={t.id} onClick={t.open} className="d-hover-paper" style={cs("display:grid;min-width:760px;grid-template-columns:2.2fr .9fr .8fr .9fr .9fr 1.4fr;gap:14px;padding:12px 18px;border-bottom:1px solid var(--soft);align-items:center;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
              <div style={cs("display:flex;align-items:center;gap:11px;min-width:0")}>
                <Thumb url={t.imageUrl} bg={t.famBg} fg={t.famFg} initials={t.initials} size="30px" radius="7px" fontSize="11px" />
                <span style={cs("font-family:'Outfit',sans-serif;font-weight:700;font-size:14px;letter-spacing:-.02em")}>{t.symbol}</span>
                {t.verified && <span title="Verified: the platform's own token" style={cs("flex:none;display:flex")}><VerifiedBadge size={12} /></span>}
                <span style={cs("color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{t.name}</span>
                <span style={cs(`flex:none;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;padding:3px 7px;border-radius:999px;background:${t.famBg};color:${t.famFg}`)}>{t.family}</span>
              </div>
              <span style={cs("text-align:right;font-weight:500")}>{t.price}</span>
              <span style={cs("text-align:right")}><ChangePill chg={t.chg} chgColor={t.chgColor} size="11px" /></span>
              <span style={cs("text-align:right")}>{t.mcap}</span>
              <span style={cs("text-align:right")}>{t.vol}</span>
              <div style={cs("display:flex;align-items:center;gap:10px")}>
                {t.showProg && (
                  <div style={cs("flex:1;display:flex;gap:2px;height:14px;border:1px solid var(--line);border-radius:5px;padding:2px")}>
                    {t.ticks.map((c2, ci) => <div key={ci} style={cs(`flex:1;background:${c2};border-radius:1px`)}></div>)}
                  </div>
                )}
                <span style={cs("color:var(--mute);font-size:11px;min-width:34px;white-space:nowrap;text-align:right")}>{t.progPct}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {v.isEmpty && (
        <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:56px 0;display:flex;flex-direction:column;align-items:center;gap:10px")}>
          <div style={cs("font-size:15px;font-weight:700")}>Nothing matches that.</div>
          <div style={cs("font-size:13px;color:var(--mute)")}>Loosen the filters, or launch it yourself.</div>
          <button onClick={v.goCreate} style={cs("margin-top:6px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;background:var(--lime);color:var(--on);padding:11px 22px")}>Launch a coin</button>
        </div>
      )}
    </div>
  );
}
