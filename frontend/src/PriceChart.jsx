import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType } from "lightweight-charts";

// Real OHLCV candles in (see adapters.js's buildCandles -- built entirely
// from actual indexed trades, no placeholder data), a TradingView
// lightweight-charts instance out. Colors pulled from the same CSS custom
// properties the rest of the app uses so it matches the neo-brutalist palette
// rather than lightweight-charts' own defaults.
export default function PriceChart({ candles, height = 320 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue("--ink").trim() || "#fafafa";
    const mute = styles.getPropertyValue("--mute").trim() || "#a0a0a0";
    const soft = styles.getPropertyValue("--soft").trim() || "#252525";
    const card = styles.getPropertyValue("--card").trim() || "#1f1f1f";
    const pos = styles.getPropertyValue("--pos").trim() || "#a3e635";
    const neg = styles.getPropertyValue("--neg").trim() || "#f0654a";

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: card }, textColor: mute, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 },
      grid: { vertLines: { color: soft }, horzLines: { color: soft } },
      rightPriceScale: { borderColor: ink },
      timeScale: { borderColor: ink, timeVisible: true },
      crosshair: { vertLine: { color: ink }, horzLine: { color: ink } },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: pos, downColor: neg, borderUpColor: ink, borderDownColor: ink, wickUpColor: ink, wickDownColor: ink,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "", color: mute,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    return () => chart.remove();
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current) return;
    seriesRef.current.setData(candles.map((k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close })));
    volumeRef.current.setData(candles.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? "rgba(15,138,79,.35)" : "rgba(210,51,26,.35)" })));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
