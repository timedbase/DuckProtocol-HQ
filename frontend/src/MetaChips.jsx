import { useState } from "react";
import { cs } from "./cs.js";

const chipStyle = "display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--line);border-radius:7px;background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:1;white-space:nowrap;border-bottom:1px solid var(--line)";

export function AddressChip({ address, full }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full || address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <button onClick={copy} className="d-hover-paper" title={full || address} style={cs(`${chipStyle};cursor:pointer;color:var(--ink)`)}>
      <span>{copied ? "Copied" : address}</span>
      {!copied && <span style={cs("color:var(--mute);font-size:11px")}>⧉</span>}
    </button>
  );
}

export function LinkChip({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="d-hover-paper" style={cs(`${chipStyle};color:var(--ink)`)}>{children}</a>
  );
}

// Icon-only variant of LinkChip -- same square footprint as the social
// icons in App.jsx's bottom bar, for quick-link chips (Explorer, BasedBot,
// DEXTools) where the destination is recognizable from a glyph and a
// tooltip alone, without needing the full name spelled out inline.
export function IconLinkChip({ href, title, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" title={title} className="d-hover-paper" style={cs("width:30px;height:30px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);border-bottom:1px solid var(--line)")}>{children}</a>
  );
}

// Plain monochrome SVGs for X and Telegram, shared by every place these
// show up (Discover's feed/King-of-Ducks cards, TokenPage's social chips,
// App.jsx's bottom bar) -- a real icon instead of a unicode glyph, which
// some fonts render as a colored emoji-style symbol regardless of the CSS
// color set on it.
export function XIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.4l-7.4 8.5L23.6 22h-6.9l-5.4-7-6.2 7H1.7l7.9-9L1 2h7l4.9 6.4zm-1.2 18h1.9L6.5 4h-2z" /></svg>
  );
}
export function TelegramIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M21.94 4.36a1.5 1.5 0 0 0-1.62-.2L2.7 11.4a1.4 1.4 0 0 0 .1 2.6l4.55 1.5 1.76 5.5a1.3 1.3 0 0 0 2.16.5l2.5-2.4 4.5 3.3a1.4 1.4 0 0 0 2.23-.85l3.1-14.9a1.5 1.5 0 0 0-.66-1.79zM9.4 14.9l-1.2 3.7-1.1-3.5 11.6-7.2z" /></svg>
  );
}
// Same "real icon, not a unicode glyph" reasoning as X/Telegram above --
// the "🌐" emoji this replaces rendered as a colored, font-dependent glyph
// that ignored the monochrome color set on its siblings.
export function GlobeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9.2" />
      <ellipse cx="12" cy="12" rx="4" ry="9.2" />
      <path d="M2.8 12h18.4M3.9 7.5h16.2M3.9 16.5h16.2" />
    </svg>
  );
}

// The hero slot's "King of Ducks" eyebrow label -- same real-SVG reasoning
// as the icons above, used instead of a 👑 emoji.
export function CrownIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 8l4.5 3L12 4l5.5 7L22 8l-2 11H4L2 8zm2.7 3.2L6 17h12l1.3-5.8-2.6 1.7L12 8.4l-4.7 5.5-2.6-1.7z" />
    </svg>
  );
}

// A scalloped badge + checkmark, same "real SVG not a glyph" reasoning as
// the icons above -- reserved for exactly one token (the platform's own
// $DUCK, gated server-side off a deploy-time env var, see
// backend/src/api/routes/tokens.ts), never inferred client-side.
export function VerifiedBadge({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" title="Verified: the platform's own token">
      <path fill="var(--lime)" d="M12 1.5l2.4 1.9 3-.6 1 2.9 2.9 1-.6 3 1.9 2.4-1.9 2.4.6 3-2.9 1-1 2.9-3-.6L12 22.5l-2.4-1.9-3 .6-1-2.9-2.9-1 .6-3-1.9-2.4 1.9-2.4-.6-3 2.9-1 1-2.9 3 .6z" />
      <path stroke="var(--on)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 12.3l2.6 2.6L16.2 9" />
    </svg>
  );
}
