"use client";

import { useEffect, useRef } from "react";

import type { ChartStudy } from "@/lib/chartPresets";

interface Props {
  symbol: string;
  studies: ChartStudy[];
}

export default function TickerChart({ symbol, studies }: Props) {
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
      // RESOLVED — this used to render white on the Momentum preset only. The
      // cause was not the strip and not a colour: studies_overrides was making
      // the widget reject the settings object wholesale and fall back to a bare
      // light-themed default chart, which also silently dropped every study and
      // the top toolbar. Fixed by removing studies_overrides entirely and
      // passing study inputs inside `studies` instead (see lib/chartPresets.ts).
      // The earlier note guessed the override might be working and be worth
      // keeping; it never applied at all.
      withdateranges: true,
      // Volume bars under the price. Set explicitly rather than left to the
      // widget's default so the chart does not silently change if TradingView
      // ever flips it. This is the histogram, which is a different thing from
      // the OBV / Accumulation-Distribution oscillators in the "Volume" preset
      // (lib/chartPresets.ts) — those read volume, they do not show it.
      hide_volume: false,
      // Normalised to object form for EVERY entry, never a mix. The widget
      // drops bare-string studies as soon as any object-form study is present
      // in the same array, silently and with no console error — so a preset
      // that mixed `{ id, inputs }` with `"MACD@tv-basicstudies"` rendered the
      // moving averages and no MACD. Converting them all sidesteps that.
      studies: studies.map((s) => (typeof s === "string" ? { id: s, inputs: {} } : s)),
    };

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify(config);
    tvContainer.appendChild(script);

    outer.appendChild(tvContainer);
  }, [symbol, studies]);

  return (
    <div
      ref={outerRef}
      // h-120 while stacked on mobile; h-full on lg so the glance row's single
      // height governs all three panels instead of this one setting its own.
      className="h-120 w-full overflow-hidden rounded-xl bg-slate-900 lg:h-full"
    />
  );
}
