import { useId } from "react";

// Renders the same real per-token trade history (t.bars: {h: 0-100, c: color})
// as a filled area line instead of a bar chart -- reads as an actual price
// chart rather than a generic dashboard bar-grid.
export default function Sparkline({ bars, height = "44px", color }) {
  const gid = useId().replace(/:/g, "");
  if (!bars || bars.length === 0) return <div style={{ height }} />;
  const w = 100, h = 100;
  const stepX = w / (bars.length - 1 || 1);
  const lineColor = color || bars[bars.length - 1]?.c || "var(--mute)";
  const pts = bars.map((b, i) => [i * stepX, h - Math.min(100, Math.max(0, Number(b.h)))]);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${(pts[pts.length - 1][0]).toFixed(2)},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={lineColor} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
