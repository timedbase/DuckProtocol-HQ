import { useState, useEffect } from "react";
import { parseAbi } from "viem";
import { cs } from "../cs.js";
import { CHAIN, SUPPLY_TIERS, VAULT_BPS_OPTIONS } from "../chain/addresses.js";
import { logoFor } from "../chain/quoteLogos.js";
import { getPublicClient } from "../chain/client.js";
import { api } from "../api.js";
import { XIcon, TelegramIcon, GlobeIcon } from "../MetaChips.jsx";

function labelFor(options, address) {
  return (options.find((o) => o.address.toLowerCase() === address.toLowerCase()) || {}).label || "?";
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ERC20_SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);

// Launcher takes ANY quote token, not just the curated list -- labelFor
// alone has no name for one of those (just "?"). symbol() is a standard
// ERC20 view function with the same signature on every token regardless of
// what it is, so a live read against whatever address is actually pasted
// gets the real symbol instead of a placeholder -- never a guess, and it
// naturally clears itself back to "?" if the field is edited to something
// that isn't a deployed token.
function useCustomQuoteSymbol(address, enabled) {
  const [state, setState] = useState({ symbol: null, loading: false, failed: false });
  useEffect(() => {
    if (!enabled || !ADDRESS_RE.test(address || "")) { setState({ symbol: null, loading: false, failed: false }); return; }
    let cancelled = false;
    setState({ symbol: null, loading: true, failed: false });
    getPublicClient().readContract({ address, abi: ERC20_SYMBOL_ABI, functionName: "symbol" })
      .then((s) => { if (!cancelled) setState({ symbol: s, loading: false, failed: false }); })
      .catch(() => { if (!cancelled) setState({ symbol: null, loading: false, failed: true }); });
    return () => { cancelled = true; };
  }, [address, enabled]);
  return state;
}

// Live current USD price for whatever quote asset is selected right now --
// curated or a resolved custom launcher token alike (the backend's /price
// endpoint treats both identically). Feeds the "≈ 5,463.21 USDG" preview
// line under a USD input; the actual USD->raw-units conversion at submit
// time is a separate, authoritative backend call (resolveQuoteUnits in
// App.jsx), never derived from this cached preview price.
function useQuotePrice(address) {
  const [price, setPrice] = useState(null);
  useEffect(() => {
    if (!ADDRESS_RE.test(address || "")) { setPrice(null); return; }
    let cancelled = false;
    api.quotePrices(CHAIN, [address]).then((res) => {
      if (!cancelled) setPrice(res?.prices?.[address] ?? null);
    }).catch(() => { if (!cancelled) setPrice(null); });
    return () => { cancelled = true; };
  }, [address]);
  return price;
}

// A USD-denominated text input (creators think in dollars, not raw
// quote-asset units) with a live "≈ X SYMBOL" conversion line underneath,
// computed from the already-fetched quotePrice -- no round trip per
// keystroke. The authoritative raw-units conversion happens once, at
// submit/simulate time, via the backend (see App.jsx's resolveQuoteUnits).
function UsdField({ label, hint, value, onChange, quotePrice, quoteLabel, placeholder }) {
  const usdNum = Number(value);
  const approx = quotePrice && usdNum > 0 ? usdNum / quotePrice : null;
  return (
    <Field label={label} hint={hint}>
      <div style={cs("position:relative")}>
        <span style={cs("position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mute);font-size:14px;pointer-events:none")}>$</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={placeholder}
          style={cs("width:100%;box-sizing:border-box;padding:12px 12px 12px 24px;border:1px solid var(--line);background:var(--paper);font-size:14px;outline:0")}
        />
      </div>
      <div style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>
        {approx != null
          ? `≈ ${approx.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quoteLabel}`
          : quoteLabel === "?"
            ? "pick a quote asset to see the conversion"
            : "looking up this asset's price…"}
      </div>
    </Field>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={cs("display:flex;flex-direction:column;gap:7px")}>
      <span style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>{label}</span>
      {children}
      {hint && <span style={cs("font-size:11.5px;color:var(--mute);line-height:1.4")}>{hint}</span>}
    </label>
  );
}
function TextInput(props) {
  return <input {...props} style={cs("padding:12px;border:1px solid var(--line);background:var(--paper);font-size:14px;outline:0")} />;
}
// Same icon-prefix pattern as UsdField's "$" -- makes it visually obvious at
// a glance which of the three optional-extras fields is which, and that a
// website field genuinely exists here (not just three identical-looking
// blank inputs).
function SocialInput({ icon, ...props }) {
  return (
    <div style={cs("position:relative")}>
      <span style={cs("position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mute);display:flex;pointer-events:none")}>{icon}</span>
      <input {...props} style={cs("width:100%;box-sizing:border-box;padding:12px 12px 12px 34px;border:1px solid var(--line);background:var(--paper);font-size:14px;outline:0")} />
    </div>
  );
}
function LockedInput({ value }) {
  return <input value={value} readOnly style={cs("padding:12px;border:1px solid var(--line);background:var(--card);font-size:14px;outline:0;color:var(--mute);font-family:'JetBrains Mono',monospace")} />;
}

// One composable section primitive, reused for every group in the form
// (basics / supply & split / pricing / optional extras) instead of a hand-
// rolled header per group -- the pattern flap.sh's own create form uses
// (a repeated collapsible-section-with-tab-header component) rather than
// brew.family's fixed 3-step wizard, since a single scrollable page with a
// live preview needs no page-to-page step state at all.
function Section({ icon, step, title, sub, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);overflow:hidden")}>
      <button onClick={() => setOpen((o) => !o)} style={cs("width:100%;display:flex;align-items:center;gap:12px;padding:16px 18px;border:0;background:transparent;cursor:pointer;text-align:left")}>
        <span style={cs("width:30px;height:30px;flex:none;border-radius:8px;background:var(--paper);display:flex;align-items:center;justify-content:center;font-size:14px;font-family:'JetBrains Mono',monospace;color:var(--lime)")}>{step != null ? String(step).padStart(2, "0") : icon}</span>
        <div style={cs("flex:1;min-width:0")}>
          <div style={cs("font-size:15.5px;font-weight:700;letter-spacing:-.02em")}>{title}</div>
          {sub && <div style={cs("font-size:12px;color:var(--mute);margin-top:2px;line-height:1.4")}>{sub}</div>}
        </div>
        <span style={cs(`font-size:11px;color:var(--mute);flex:none;transform:rotate(${open ? "180deg" : "0"});transition:transform .15s ease`)}>▾</span>
      </button>
      {open && <div style={cs("padding:0 18px 20px;display:flex;flex-direction:column;gap:16px;border-top:1px solid var(--soft)")}><div style={cs("padding-top:16px;display:flex;flex-direction:column;gap:16px")}>{children}</div></div>}
    </div>
  );
}

function QuoteChips({ options, value, onPick, allowCustom, customQuote }) {
  const isCustom = allowCustom && !options.some((o) => o.address.toLowerCase() === value.toLowerCase());
  return (
    <div style={cs("display:flex;flex-direction:column;gap:8px")}>
      <div style={cs("display:grid;grid-template-columns:repeat(3,1fr);gap:8px")}>
        {options.map((o) => {
          const active = !isCustom && value.toLowerCase() === o.address.toLowerCase();
          const logo = logoFor(o.label);
          return (
            <button key={o.address} onClick={() => onPick(o.address)} style={cs(`display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);border-radius:8px;cursor:pointer;padding:9px 10px;font-family:'JetBrains Mono',monospace;font-size:12.5px;font-weight:700;background:${active ? "var(--ink)" : "var(--card)"};color:${active ? "var(--card)" : "var(--ink)"}`)}>
              <img src={logo} alt="" style={cs("width:18px;height:18px;border-radius:999px;flex:none;object-fit:cover")} />}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <div>
          <TextInput
            value={isCustom ? value : ""}
            onChange={(e) => onPick(e.target.value)}
            placeholder="Or paste any other token address"
          />
          {/* Real-time proof the pasted address is an actual token, not just
              a well-formed string -- symbol() is read live off-chain (see
              useCustomQuoteSymbol above), never guessed from the address
              itself. */}
          {isCustom && value.trim() && (
            <div style={cs(`font-size:11.5px;margin-top:6px;line-height:1.4;color:${customQuote?.symbol ? "var(--pos)" : customQuote?.failed ? "var(--neg)" : "var(--mute)"}`)}>
              {customQuote?.symbol
                ? `✓ Resolved: ${customQuote.symbol}`
                : customQuote?.loading
                  ? "Looking up this token…"
                  : customQuote?.failed
                    ? "Couldn't read a symbol from this address -- double-check it's a real token contract."
                    : "Paste a full token address (0x… , 42 characters)."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A single slider instead of a 4/3 grid of buttons -- same 7 fixed tiers,
// a fraction of the vertical space (one row + one track + one label row).
function TierPicker({ value, onPick }) {
  const current = SUPPLY_TIERS[value] || SUPPLY_TIERS[0];
  return (
    <div>
      <div style={cs("display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px")}>
        <span style={cs("font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700")}>{current.label}</span>
        <span style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:var(--mute)")}>TOTAL SUPPLY</span>
      </div>
      <input
        type="range"
        min={0}
        max={SUPPLY_TIERS.length - 1}
        step={1}
        value={value}
        onChange={(e) => onPick(Number(e.target.value))}
        style={cs("width:100%;accent-color:var(--lime);cursor:pointer;display:block")}
      />
      <div style={cs("display:flex;justify-content:space-between;margin-top:6px")}>
        {SUPPLY_TIERS.map((t) => (
          <span key={t.index} style={cs(`font-family:'JetBrains Mono',monospace;font-size:9px;color:${t.index === value ? "var(--ink)" : "var(--mute)"};font-weight:${t.index === value ? "700" : "400"}`)}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// A 2x2 grid of the split itself (big) + a small "CREATOR / VAULT" caption,
// instead of 4 full-width rows of the whole "100% creator / 0% vault"
// sentence -- same 4 choices, about half the vertical space.
function VaultBpsPicker({ value, onPick }) {
  return (
    <div style={cs("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px")}>
      {VAULT_BPS_OPTIONS.map((o) => {
        const active = value === o.bps;
        const vaultPct = o.bps / 100;
        return (
          <button key={o.bps} onClick={() => onPick(o.bps)} style={cs(`text-align:left;border:1px solid var(--line);border-radius:8px;cursor:pointer;padding:8px 10px;min-width:0;box-sizing:border-box;overflow:hidden;background:${active ? "var(--ink)" : "var(--card)"};color:${active ? "var(--card)" : "var(--ink)"}`)}>
            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{100 - vaultPct}% / {vaultPct}%</div>
            <div style={cs(`font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:.08em;margin-top:2px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>CREATOR / VAULT</div>
          </button>
        );
      })}
    </div>
  );
}

// A live look at how the token will actually show up on Discover/its own
// token page, updating as the form is filled in -- brew.family's own
// create page keeps exactly this next to the form for the same reason:
// it's the one thing that makes an abstract set of fields feel like a
// real, specific token before you've committed to anything on-chain.
function LivePreview({ v, draft, FORM, quoteLabel, tierLabel }) {
  const initials = (draft.ticker || draft.name || "??").slice(0, 2).toUpperCase();
  return (
    <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
      <div style={cs("padding:11px 15px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute);display:flex;align-items:center;gap:7px")}>
        <span style={cs("width:5px;height:5px;border-radius:99px;background:var(--lime);box-shadow:0 0 6px var(--lime)")}></span>
        LIVE PREVIEW
      </div>
      <div style={cs("padding:16px")}>
        <div style={cs("display:flex;align-items:center;gap:12px")}>
          <div style={cs(`width:48px;height:48px;border-radius:10px;flex:none;overflow:hidden;display:flex;align-items:center;justify-content:center;background:${FORM.accent};color:${FORM.accentFg};font-weight:700;font-size:16px`)}>
            {v.draftImage.previewUrl ? <img src={v.draftImage.previewUrl} alt="" style={cs("width:100%;height:100%;object-fit:cover")} /> : initials}
          </div>
          <div style={cs("min-width:0")}>
            <div style={cs("font-size:16px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{draft.name || "Your token name"}</div>
            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--mute)")}>${draft.ticker || "TICKER"}</div>
          </div>
        </div>
        {draft.desc && <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.5;margin-top:12px")}>{draft.desc}</div>}
        <div style={cs("display:flex;flex-wrap:wrap;gap:6px;margin-top:14px")}>
          <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;padding:4px 9px;border-radius:999px;background:${FORM.accent};color:${FORM.accentFg}`)}>{FORM.title.toUpperCase()}</span>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--mute)")}>{tierLabel} SUPPLY</span>
          <span style={cs("display:flex;align-items:center;gap:4px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.06em;padding:3px 9px 3px 4px;border-radius:999px;border:1px solid var(--line);color:var(--mute)")}>
            <img src={logoFor(quoteLabel)} alt="" style={cs("width:12px;height:12px;border-radius:999px;object-fit:cover;flex:none")} />
            {quoteLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

const ON_SUBMIT = {
  incubation: [
    "Clone the shared DuckToken implementation and register the curve.",
    "A per-token lending vault is created immediately -- funded from your chosen creator/vault fee split, linked to a real market once this token migrates.",
    "Attach DuckHookV4 so anti-MEV and the sell fee apply once it migrates.",
    "Optional creator buy settles through the curve in the same transaction.",
    "At the migration target, DuckBondingCurve opens the V4 pool and locks LP.",
  ],
  launcher: [
    "Clone the shared DuckToken implementation and mint the full chosen supply.",
    "The launcher initializes the pool directly and mints a full-range position.",
    "A per-token lending vault is created and linked to the real pool in the same transaction.",
    "The position transfers into DuckLocker, permanently locked.",
    "Optional instant buy routes through the new pool immediately.",
  ],
  raise: [
    "Clone the shared DuckToken implementation immediately, verifiable on the explorer before a single contribution.",
    "Full chosen supply is minted to the crowdfund contract. No transfers, no pool, no price.",
    "Contributions accrue directly in your chosen quote asset until the deadline -- never swapped, so there's no sandwich-attack window at finalize.",
    "Goal cleared → the raised quote asset seeds a two-sided V4 pool directly, a vault links to it, LP locks, claims open.",
    "Goal missed → refunds unlock in the same asset contributed, one claim per contributor.",
  ],
};

export default function CreateFormPage({ v }) {
  const family = v.family || "incubation";
  useEffect(() => { if (family === "raise") v.loadRaiseDefaults(); }, [family, v.chainSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = family === "incubation" ? v.draftCurve : family === "launcher" ? v.draftInstant : v.draftCampaign;
  const setDraft = family === "incubation" ? v.setCurve : family === "launcher" ? v.setInstant : v.setCampaign;
  const nameLabel = family === "raise" ? "RAISE / TOKEN NAME" : "TOKEN NAME";

  const FORM = {
    incubation: { title: "Bonding curve", accent: "var(--lime)", accentFg: "var(--on)", cta: "Create curve token",
      sub: "You pick the start and migration targets directly, in USD -- converted to your chosen quote asset's own units at submit time. Buyers receive tokens on every trade from block one." },
    launcher: { title: "Instant", accent: "var(--card)", accentFg: "var(--ink)", cta: "Launch on V4",
      sub: "One transaction creates the V4 pool, mints a full-range LP position, and locks it permanently in DuckLocker. Any quote token is allowed -- launcher has no curated allow-list." },
    raise: { title: "Crowdfund raise", accent: "var(--orange)", accentFg: "#fff", cta: "Open raise",
      sub: "Like a bonding curve, but nothing trades while the raise runs. The token deploys immediately; contributions land directly in your chosen quote asset (never swapped), and backers claim pro-rata only after a successful finalize." },
  }[family];

  const costs = {
    incubation: [{ k: "TRADING FEE", v: "sell-side fee via DuckHookV4 once migrated, split by your creator/vault choice below" }],
    launcher: [{ k: "POOL FEE / TICK SPACING", v: "10000 / 200 (1%)" }],
    raise: [
      { k: "CREATION FEE", v: v.raiseDefaults ? `${Number(v.raiseDefaults.campaignFee) / 1e18} ${v.nativeSymbol}, paid on launch (waived if quoted in the platform token)` : "loading…" },
      { k: "REFUND IF MISSED", v: "100%, in the same asset contributed" },
    ],
  }[family];

  const quoteOpts = family === "raise" ? v.raiseQuoteOptions : v.quoteOptions;
  const quoteAddr = family === "incubation" ? v.draftCurve.quoteToken : family === "launcher" ? v.draftInstant.quoteToken : v.draftCampaign.dexQuoteAsset;
  // Only launcher accepts a quote token outside the curated list -- that's
  // the one case labelFor alone can't name.
  const isCustomQuote = family === "launcher" && !quoteOpts.some((o) => o.address.toLowerCase() === quoteAddr.toLowerCase());
  const customQuote = useCustomQuoteSymbol(quoteAddr, isCustomQuote);
  const quoteLbl = isCustomQuote ? (customQuote.symbol || "?") : labelFor(quoteOpts, quoteAddr);
  const quotePrice = useQuotePrice(quoteAddr);
  const tierLbl = (SUPPLY_TIERS.find((t) => t.index === draft.supplyTier) || SUPPLY_TIERS[0]).label;

  return (
    <div style={cs("max-width:1060px;margin:0 auto")}>
      <button onClick={v.backToChooser} style={cs("border:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.1em;color:var(--mute);cursor:pointer;padding:0 0 14px")}>← ALL LAUNCH TYPES</button>

      <div style={cs(`border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:16px;padding:${v.isMobile ? "18px" : "22px 24px"};background:${FORM.accent};color:${FORM.accentFg}`)}>
        <div style={cs(`font-size:${v.isMobile ? "21px" : "26px"};font-weight:700;letter-spacing:-.04em;line-height:1.05`)}>{FORM.title}</div>
        <div style={cs("font-size:13.5px;line-height:1.55;margin-top:10px;max-width:66ch;opacity:.85")}>{FORM.sub}</div>
      </div>

      <div style={cs(`display:grid;grid-template-columns:${v.isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 300px"};gap:16px;align-items:start`)}>
        <div style={cs("display:flex;flex-direction:column;gap:14px;min-width:0")}>

          <Section step={1} title="Start with your story" sub="Name, symbol, art and a short description -- shown everywhere this token appears.">
            <div style={cs("display:flex;align-items:center;gap:16px;flex-wrap:wrap")}>
              <label style={cs("width:56px;height:56px;border:1px dashed var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--mute);text-align:center;line-height:1.2;flex:none;cursor:pointer;overflow:hidden")}>
                <input type="file" accept="image/*" onChange={v.onImagePick} style={cs("display:none")} />
                {v.draftImage.previewUrl ? <img src={v.draftImage.previewUrl} alt="" style={cs("width:100%;height:100%;object-fit:cover")} /> : <>TOKEN<br />LOGO</>}
              </label>
              <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.5;flex:1;min-width:200px")}>
                PNG or SVG. Stored off-chain via IPFS; the token URI points at it. Also permanent.
                {v.draftImage.previewUrl && !v.draftImage.uploading && <button onClick={v.clearImage} style={cs("display:block;border:0;background:transparent;color:var(--mute);text-decoration:underline;cursor:pointer;padding:4px 0;font-size:11.5px")}>Remove</button>}
                {v.draftImage.uploading && <span style={cs("display:block;margin-top:4px")}>Uploading…</span>}
                {v.draftImage.error && <span style={cs("display:block;margin-top:4px;color:var(--neg)")}>{v.draftImage.error}</span>}
              </div>
            </div>
            <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px")}>
              <Field label={nameLabel} hint="Shown across the app"><TextInput value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} placeholder="Quack Capital" /></Field>
              <Field label="SYMBOL" hint="3–9 characters"><TextInput value={draft.ticker} onChange={(e) => setDraft({ ticker: e.target.value.toUpperCase() })} placeholder="QUACK" /></Field>
            </div>
            <Field label="DESCRIPTION">
              <textarea rows="3" placeholder="What is this token for?" value={draft.desc}
                onChange={(e) => setDraft({ desc: e.target.value.slice(0, 140) })}
                style={cs("padding:12px;border:1px solid var(--line);background:var(--paper);font-size:14px;outline:0;resize:vertical")} />
            </Field>
          </Section>

          <Section step={2} title="Supply & fee split" sub="Fixed menus, not free-form numbers -- both are locked in permanently once this token deploys.">
            <Field label="TOTAL SUPPLY" hint="Fixed menu -- there is no free-form supply amount">
              <TierPicker value={draft.supplyTier} onPick={(tier) => setDraft({ supplyTier: tier })} />
            </Field>
            <Field label="CREATOR / VAULT FEE SPLIT" hint="Immutable after creation -- the vault share funds this token's own lending market">
              <VaultBpsPicker value={draft.vaultBps} onPick={(bps) => setDraft({ vaultBps: bps })} />
            </Field>
          </Section>

          <Section step={3} title="Find your perfect pair" sub="Choose what this token trades against, and set its pricing.">
            {family === "incubation" && (
              <>
                <Field label="QUOTE ASSET" hint={`Curated list -- only these have a real ${v.nativeSymbol} route for buyWithNative; pick ${v.nativeSymbol} if unsure`}>
                  <QuoteChips options={v.quoteOptions} value={v.draftCurve.quoteToken} onPick={(a) => v.setCurve({ quoteToken: a, earlyBuyAmount: "0" })} />
                </Field>
                <div style={cs(`display:grid;grid-template-columns:${v.isMobile ? "1fr" : "1fr 1fr"};gap:18px`)}>
                  <UsdField label="START TARGET (USD)" hint="Where the curve opens" placeholder="8000"
                    value={v.draftCurve.startTargetUsd} onChange={(val) => v.setCurve({ startTargetUsd: val })}
                    quotePrice={quotePrice} quoteLabel={quoteLbl} />
                  <UsdField label="MIGRATION TARGET (USD)" hint="Curve migrates into a V4 pool here" placeholder="60000"
                    value={v.draftCurve.migrationTargetUsd} onChange={(val) => v.setCurve({ migrationTargetUsd: val })}
                    quotePrice={quotePrice} quoteLabel={quoteLbl} />
                </div>
              </>
            )}

            {family === "launcher" && (
              <>
                <Field label="QUOTE ASSET" hint="Any token is allowed -- these are curated suggestions, or paste any other address">
                  <QuoteChips options={v.quoteOptions} value={v.draftInstant.quoteToken} onPick={(a) => v.setInstant({ quoteToken: a, buyAmountHype: "0" })} allowCustom customQuote={customQuote} />
                </Field>
                <UsdField label="LAUNCH MARKET CAP (USD)" hint="Virtual FDV the pool is seeded at" placeholder="10000"
                  value={v.draftInstant.launchMarketCapUsd} onChange={(val) => v.setInstant({ launchMarketCapUsd: val })}
                  quotePrice={quotePrice} quoteLabel={quoteLbl} />
                <Field label="FEE / TICK SPACING"><LockedInput value="10000 / 200 (this platform's 1% pool convention)" /></Field>
              </>
            )}

            {family === "raise" && (
              <>
                <Field label="QUOTE ASSET" hint="Contributions land directly in this asset -- never swapped, closing off any sandwich-attack window at finalize">
                  <QuoteChips options={v.raiseQuoteOptions} value={v.draftCampaign.dexQuoteAsset} onPick={(a) => v.setCampaign({ dexQuoteAsset: a })} />
                </Field>
                <UsdField label="GOAL (USD)" hint="Soft floor -- missing it unlocks refunds in the same asset" placeholder="500"
                  value={v.draftCampaign.goalUsd} onChange={(val) => v.setCampaign({ goalUsd: val })}
                  quotePrice={quotePrice} quoteLabel={quoteLbl} />
                <Field label="DEADLINE (PLATFORM SETTING)"><LockedInput value={v.raiseDefaults ? Math.round(Number(v.raiseDefaults.duration) / 3600) + " hours from launch" : "loading…"} /></Field>
              </>
            )}
          </Section>

          <Section step={4} title="Optional extras" sub="Socials and an instant buy -- skip either and add socials later." defaultOpen={false}>
            <div>
              <div style={cs("font-size:12.5px;color:var(--mute);line-height:1.55;max-width:70ch;margin-bottom:12px")}>Written into the token metadata at creation. The token renounces ownership on deploy, so these are permanent -- check them carefully before you submit.</div>
              <div style={cs("display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px")}>
                <SocialInput icon={<GlobeIcon size={14} />} value={v.socials.website} onChange={(e) => v.setSocial("website", e.target.value)} placeholder="Website URL" />
                <SocialInput icon={<XIcon size={13} />} value={v.socials.twitter} onChange={(e) => v.setSocial("twitter", e.target.value)} placeholder="X / Twitter URL" />
                <SocialInput icon={<TelegramIcon size={14} />} value={v.socials.telegram} onChange={(e) => v.setSocial("telegram", e.target.value)} placeholder="Telegram URL" />
              </div>
            </div>
            {family === "incubation" && v.quoteHasEthRoute(labelFor(v.quoteOptions, v.draftCurve.quoteToken)) && (
              <Field label={`OPTIONAL INSTANT BUY (${labelFor(v.quoteOptions, v.draftCurve.quoteToken)})`} hint="Bought off the curve in the same transaction as creation">
                <TextInput value={v.draftCurve.earlyBuyAmount} onChange={(e) => v.setCurve({ earlyBuyAmount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" />
              </Field>
            )}
            {family === "launcher" && v.quoteHasEthRoute(labelFor(v.quoteOptions, v.draftInstant.quoteToken)) && (
              <Field label={`OPTIONAL INSTANT BUY (${v.nativeSymbol})`} hint="Swapped into the quote asset and used to buy the new pool immediately">
                <TextInput value={v.draftInstant.buyAmountHype} onChange={(e) => v.setInstant({ buyAmountHype: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" />
              </Field>
            )}
          </Section>

          <div style={cs("display:flex;gap:12px;flex-wrap:wrap")}>
            <button onClick={v.submitCreate} style={cs("padding:15px 26px;border:1px solid var(--line);border-radius:8px;background:var(--ink);color:var(--card);font-size:15px;font-weight:700;cursor:pointer")}>{v.createCta}</button>
            <button onClick={v.simulateCreate} disabled={v.simulating} style={cs("padding:15px 24px;border:1px solid var(--line);border-radius:8px;background:var(--card);font-size:15px;font-weight:600;cursor:pointer")}>{v.simulating ? "Simulating…" : "Simulate first"}</button>
          </div>
        </div>

        <div style={cs(`display:flex;flex-direction:column;gap:16px;${v.isMobile ? "" : "position:sticky;top:80px"}`)}>
          <LivePreview v={v} draft={draft} FORM={FORM} quoteLabel={quoteLbl} tierLabel={tierLbl} />
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("padding:11px 15px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>ON SUBMIT</div>
            {ON_SUBMIT[family].map((t, i) => (
              <div key={i} style={cs("display:flex;gap:12px;padding:13px 15px;border-bottom:1px solid var(--soft)")}>
                <span style={cs("width:20px;height:20px;border-radius:999px;border:1px solid var(--line);font-family:'JetBrains Mono',monospace;font-size:10.5px;display:flex;align-items:center;justify-content:center;flex:none")}>{i + 1}</span>
                <span style={cs("font-size:12.5px;line-height:1.45")}>{t}</span>
              </div>
            ))}
          </div>
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);overflow:hidden")}>
            <div style={cs("padding:11px 15px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>COSTS</div>
            {costs.map((c, i) => (
              <div key={i} style={cs("display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px")}>
                <span style={cs("color:var(--mute)")}>{c.k}</span><span style={cs("font-weight:500;text-align:right")}>{c.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
