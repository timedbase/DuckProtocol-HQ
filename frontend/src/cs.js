// css-text -> React style object. Lets every inline style stay a literal
// CSS string (as authored in the design canvas) instead of a hand-converted
// JS object.
export function cs(css) {
  const out = {};
  css.split(";").forEach(rule => {
    const idx = rule.indexOf(":");
    if (idx === -1) return;
    const val = rule.slice(idx + 1).trim();
    if (!val) return;
    const prop = rule.slice(0, idx).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[prop] = val;
  });
  return out;
}
