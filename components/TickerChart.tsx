"use client";

import { useEffect, useRef } from "react";

interface Props {
  symbol: string;
  studies: string[];
  studiesOverrides?: Record<string, number | string>;
}

/**
 * Reads a design token off the document so the widget's colours come from the
 * same place as everything else on the page.
 *
 * The chart is a cross-origin iframe, so no stylesheet of ours reaches inside
 * it — the only way to colour it is to pass hex through the widget's config.
 * That would normally mean copying `--card` into a second place and watching
 * the two drift; reading it back at effect time keeps globals.css the single
 * source of truth. The fallbacks are the current token values, for the case
 * where the var cannot be resolved and an empty string would otherwise be
 * handed to TradingView as a colour.
 */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
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
      // The widget's own dark theme paints a blue-grey (~#131722) that reads as
      // a foreign panel dropped onto the page. These two are the only colour
      // knobs the embed accepts, and they pull from the same tokens as the card
      // the chart sits in, so the chrome around the plot — the date-range row
      // included — matches rather than approximates.
      backgroundColor: token("--card", "#0f172a"),
      gridColor: token("--border", "#1e293b"),
      // TradingView's own range row (1D / 5D / 1M / 3M / 6M / YTD / 1Y / 5Y /
      // All). Deliberately the built-in one rather than buttons of our own: the
      // widget switches range inside the already-loaded chart, whereas a `range`
      // prop would go through the effect below, which tears the iframe down and
      // refetches it on every change — a visible reload per click. Its layout
      // and type are TradingView's and cannot be changed, but it takes its
      // colour from backgroundColor above, which is why that is set.
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
      // today, but it is the same token the widget is now given, so the frame
      // and the chart inside it cannot drift apart.
      className="h-120 w-full overflow-hidden rounded-xl bg-card"
    />
  );
}
