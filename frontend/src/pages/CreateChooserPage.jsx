import { cs } from "../cs.js";

const FAMILIES = [
  { key: "incubation", glyph: "∿", title: "Bonding curve", contract: "DUCKBONDINGCURVE", accent: "var(--lime)", accentFg: "var(--on)",
    desc: "Tradeable from the first block on a curve, then migrates into a fresh V4 pool at your target.",
    bullets: ["Buyers receive tokens instantly", "You set start and migration targets", "LP locked forever at migration"] },
  { key: "launcher", glyph: "⇥", title: "Instant", contract: "DUCKLAUNCHER", accent: "var(--card)", accentFg: "var(--ink)",
    desc: "One transaction creates the V4 pool with full-range liquidity that can never be removed.",
    bullets: ["Real DEX pool immediately", "No curve phase", "Any quote token"] },
  { key: "raise", glyph: "◎", title: "Crowdfund raise", contract: "DUCKCROWDFUND", accent: "var(--orange)", accentFg: "#fff",
    desc: "Collect ETH or a curated quote token toward a goal. Tokens deploy up front but stay in the raise contract until it completes.",
    bullets: ["Backers claim pro-rata after finalize", "Nothing is tradeable during the raise", "Full refunds if the goal is missed"] },
];

export default function CreateChooserPage({ v }) {
  return (
    <div style={cs("max-width:1120px;margin:0 auto")}>
      <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);padding:26px 24px;margin-bottom:18px")}>
        <h1 style={cs(`margin:0 0 9px;font-size:${v.isMobile ? "26px" : "38px"};letter-spacing:-.045em;font-weight:700;line-height:1.05`)}>Launch a token</h1>
        <p style={cs("margin:0;color:var(--mute);font-size:14.5px;line-height:1.55;max-width:66ch")}>Three families on {v.chainName}. All of them mint EIP-1167 clones, attach the DuckHookV4 fee hook, and seed full-range liquidity that can never be removed.</p>
      </div>

      <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px")}>
        {FAMILIES.map((f) => (
          <div key={f.key} onClick={() => v.setFamily(f.key)} className="d-hover-line" style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);cursor:pointer;display:flex;flex-direction:column;overflow:hidden")}>
            <div style={cs("display:flex;align-items:stretch;border-bottom:1px solid var(--line)")}>
              <div style={cs(`width:64px;flex:none;border-right:1px solid var(--line);background:${f.accent};color:${f.accentFg};display:flex;align-items:center;justify-content:center;font-size:24px`)}>{f.glyph}</div>
              <div style={cs("padding:14px 16px;flex:1;min-width:0")}>
                <div style={cs("font-size:19px;font-weight:700;letter-spacing:-.03em")}>{f.title}</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.1em;color:var(--mute);margin-top:4px")}>{f.contract}</div>
              </div>
            </div>
            <div style={cs("padding:16px")}>
              <div style={cs("font-size:13.5px;color:var(--mute);line-height:1.55")}>{f.desc}</div>
              <div style={cs("display:flex;flex-direction:column;gap:0;margin-top:16px;border:1px solid var(--line);border-radius:10px;overflow:hidden")}>
                {f.bullets.map((b, i) => (
                  <div key={i} style={cs("padding:10px 13px;border-bottom:1px solid var(--soft);font-size:12.5px;line-height:1.4")}>{b}</div>
                ))}
              </div>
            </div>
            <div style={cs("flex:1")}></div>
            <div style={cs(`padding:14px 16px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px;background:${f.accent};color:${f.accentFg}`)}>
              <span style={cs("font-size:14px;font-weight:700;letter-spacing:-.02em")}>Continue</span>
              <span style={cs("font-size:16px")}>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
