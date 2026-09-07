import { cs } from "./cs.js";

// A token's logo, when its metadata resolved a real image (App.jsx's
// resolveCoinImages/loadTokenMeta already fetch this in the background for
// every coin -- this component is the one thing that was missing: nothing
// ever rendered it). Falls back to the family-colored initials block --
// the original placeholder -- whenever there's no image yet (still
// resolving, resolution failed, or the token's metadata genuinely has none).
export default function Thumb({ url, bg, fg, initials, size, radius = "0", fontSize = "16px", flex = "none", style: extra = "" }) {
  const base = `width:${size};height:${size};flex:${flex};border-radius:${radius};overflow:hidden;display:flex;align-items:center;justify-content:center;${extra}`;
  if (url) {
    return (
      <div style={cs(`${base};background:${bg}`)}>
        <img src={url} alt="" style={cs("width:100%;height:100%;object-fit:cover;display:block")} />
      </div>
    );
  }
  return (
    <div style={cs(`${base};background:${bg};color:${fg};font-size:${fontSize};font-weight:700;letter-spacing:-.03em`)}>{initials}</div>
  );
}
