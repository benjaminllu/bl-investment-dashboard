"use client";

import { useEffect, useRef } from "react";

interface Props {
  symbol: string;
  studies: string[];
  studiesOverrides?: Record<string, number | string>;
}

export default function TickerChart({ symbol, studies, studiesOverrides }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    outer.innerHTML = "";

    const tvContainer = document.createElement("div");
    tvContainer.className = "tradingview-widget-container";
    tvContainer.style.height = "100%";
    tvContainer.style.width = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    tvContainer.appendChild(widgetDiv);

    const config: Record<string, unknown> = {
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
      // TradingView's own range row (1D / 5D / 1M / 3M / 6M / YTD / 1Y / 5Y /
      // All). Deliberately the built-in one rather than buttons of our own: the
      // widget switches range inside the already-loaded chart, whereas a `range`
      // prop would go through the effect below, which tears the iframe down and
      // refetches it on every change — a visible reload per click.
      //
      // Its colour is TradingView's, not ours. Passing the page's `--card` hex
      // through the widget's `backgroundColor` was tried and reverted: it turned
      // the chart white, so that option does not take a plain hex. The embed
      // accepts no other colour knob (`backgroundColor` and `gridColor` are the
      // only two in its allowlist), and the iframe is cross-origin, so no
      // stylesheet of ours reaches the strip either. Establish the accepted
      // format before trying again.
      withdateranges: true,
      // Volume bars under the price. Set explicitly rather than left to the
      // widget's default so the chart does not silently change if TradingView
      // ever flips it. This is the histogram, which is a different thing from
      // the OBV / Accumulation-Distribution oscillators in the "Volume" preset
      // (lib/chartPresets.ts) — those read volume, they do not show it.
      hide_volume: false,
      studies,
    };
    if (studiesOverrides) config.studies_overrides = studiesOverrides;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify(config);
    tvContainer.appendChild(script);

    outer.appendChild(tvContainer);
  }, [symbol, studies, studiesOverrides]);

  return (
    <div
      ref={outerRef}
      // bg-card rather than the bg-slate-900 that was here: identical value
      // today, but token-driven, so this frame tracks the rest of the page.
      // Only visible before the iframe paints — TradingView colours its own
      // surface once loaded, and we have no way in.
      className="h-120 w-full overflow-hidden rounded-xl bg-card"
    />
  );
}
