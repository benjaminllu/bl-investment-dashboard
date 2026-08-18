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
      // KNOWN ISSUE — the strip renders white rather than dark whenever
      // studies_overrides is present below, so it looks out of place on the
      // Momentum preset and correct on the other two (Momentum is the only one
      // in lib/chartPresets.ts carrying an override). Isolated by elimination
      // on a standalone page: every study on its own renders a dark strip, the
      // override on its own renders a white one. It is not a colour problem —
      // passing the page's hex through backgroundColor/gridColor was tried,
      // changed nothing, and has been removed.
      //
      // POSSIBLE FIX, not yet taken: delete the studiesOverrides line from the
      // Momentum preset. Check first whether it actually applies — load the
      // Momentum preset and read the legend top-left of the chart. If it says
      // MA 200 the override works and deleting it costs the 200-period moving
      // average, which is probably worth more than a dark strip; if it shows
      // TradingView's default instead, the override never applied and deleting
      // it is free. Failing that, dropping withdateranges also removes the
      // strip, at the cost of the range buttons.
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
      className="h-120 w-full overflow-hidden rounded-xl bg-slate-900"
    />
  );
}
