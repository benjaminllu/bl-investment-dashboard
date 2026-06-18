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
    <div className="space-y-3">
      {selected && (
        <>
          <div className="flex items-center justify-center gap-3 rounded-lg bg-slate-900 px-3 py-1.5">
            <button
              onClick={() =>
                setPresetIndex((i) => (i - 1 + CHART_PRESETS.length) % CHART_PRESETS.length)
              }
              aria-label="Previous chart preset"
              className="px-2 text-slate-400 transition-colors hover:text-white"
            >
              ‹
            </button>
            <span className="w-28 text-center text-sm font-medium text-slate-200">
              {preset.label}
            </span>
            <button
              onClick={() => setPresetIndex((i) => (i + 1) % CHART_PRESETS.length)}
              aria-label="Next chart preset"
              className="px-2 text-slate-400 transition-colors hover:text-white"
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

      <div className="overflow-hidden rounded-xl bg-slate-900">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-2 pt-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {lists.map((list) => (
            <button
              key={list}
              onClick={() => handleListChange(list)}
              className={`shrink-0 rounded-t px-3 py-1.5 text-sm font-medium transition-colors ${
                activeList === list
                  ? "border-b-2 border-white text-white"
                  : "text-slate-400 hover:text-slate-200"
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
