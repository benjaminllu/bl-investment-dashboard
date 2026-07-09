"use client";

import { useState } from "react";
import StockTable, { type Stock } from "./StockTable";
import TickerChart from "./TickerChart";
import { CHART_PRESETS } from "@/lib/chartPresets";
import { LIST_ORDER } from "@/data/watchlistOrder";

interface Props {
  stocks: Stock[];
}

export default function WatchlistPanel({ stocks }: Props) {
  const lists = [
    "All",
    ...Array.from(
      new Set(stocks.map((s) => s.list).filter((l): l is string => Boolean(l)))
    ).sort((a, b) => {
      const ai = LIST_ORDER.indexOf(a);
      const bi = LIST_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  ];

  const [activeList, setActiveList] = useState("All");
  const [selected, setSelected] = useState<string | null>(stocks[0]?.ticker ?? null);
  const [presetIndex, setPresetIndex] = useState(0);

  const preset = CHART_PRESETS[presetIndex];
  const visibleStocks =
    activeList === "All" ? stocks : stocks.filter((s) => s.list === activeList);

  const handleListChange = (list: string) => {
    setActiveList(list);
    const first = list === "All" ? stocks[0] : stocks.find((s) => s.list === list);
    if (first) setSelected(first.ticker);
  };

  return (
    <div className="space-y-2">
      {selected && (
        <>
          <div className="flex items-center justify-center gap-2 rounded-lg bg-card px-2 py-1">
            <button
              onClick={() =>
                setPresetIndex((i) => (i - 1 + CHART_PRESETS.length) % CHART_PRESETS.length)
              }
              aria-label="Previous chart preset"
              className="px-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              ‹
            </button>
            <span className="w-28 text-center text-sm font-medium text-foreground/90">
              {preset.label}
            </span>
            <button
              onClick={() => setPresetIndex((i) => (i + 1) % CHART_PRESETS.length)}
              aria-label="Next chart preset"
              className="px-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              ›
            </button>
          </div>
          <TickerChart
            symbol={selected}
            studies={preset.studies}
            studiesOverrides={preset.studiesOverrides}
          />
        </>
      )}

      <div className="overflow-hidden rounded-xl bg-card">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 pt-1.5 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {lists.map((list) => (
            <button
              key={list}
              onClick={() => handleListChange(list)}
              className={`shrink-0 rounded-t px-2 py-1 text-sm font-medium transition-colors ${
                activeList === list
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {list}
            </button>
          ))}
        </div>
        <StockTable stocks={visibleStocks} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  );
}
