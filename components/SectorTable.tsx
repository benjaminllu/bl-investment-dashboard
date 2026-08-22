"use client";

import { useMemo, useState } from "react";
import {
  SECTOR_WINDOWS,
  type SectorRow,
  type SectorWindow,
  type SectorsData,
} from "@/lib/sectors";

type Mode = "relative" | "absolute";

function Pct({ value, mode }: { value: number | null; mode: Mode }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value > 0 ? "text-accent" : value < 0 ? "text-destructive" : "text-muted-foreground";
  // A leading sign on the relative view, because "+1.2" against the index and
  // "1.2%" on its own are different claims and the column header alone has not
  // been enough to keep them apart when both views share a layout.
  const sign = mode === "relative" && value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span className={`tabular-nums ${tone}`}>
      {sign}
      {Math.abs(value).toFixed(1)}
      {mode === "absolute" ? "%" : ""}
    </span>
  );
}

function SortHeader({
  window: w,
  sort,
  onSort,
}: {
  window: SectorWindow;
  sort: { key: SectorWindow; dir: "asc" | "desc" };
  onSort: (k: SectorWindow) => void;
}) {
  const active = sort.key === w;
  return (
    // aria-sort belongs on the column header itself, not the button inside it:
    // `th` carries the implicit columnheader role that the attribute is defined
    // for, and a button does not support it.
    <th
      className="w-20 px-2 py-1.5 text-right font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(w)}
        className={`w-full text-right transition-colors ${
          active ? "text-accent" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {w}
        {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

function Tier({
  title,
  note,
  rows,
  mode,
  sort,
  onSort,
}: {
  title: string;
  note: string;
  rows: SectorRow[];
  mode: Mode;
  sort: { key: SectorWindow; dir: "asc" | "desc" };
  onSort: (k: SectorWindow) => void;
}) {
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[mode][sort.key];
      const bv = b[mode][sort.key];
      // Nulls always sink, in either direction — a fund without the history to
      // answer this window is not "the worst performer".
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [rows, mode, sort]);

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">Sector</th>
              <th className="w-16 px-2 py-1.5 text-left font-medium">ETF</th>
              {SECTOR_WINDOWS.map((w) => (
                <SortHeader key={w} window={w} sort={sort} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.ticker} className="border-t border-border">
                <td className="px-2 py-1.5 text-foreground">{row.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.ticker}</td>
                {SECTOR_WINDOWS.map((w) => (
                  <td key={w} className="px-2 py-1.5 text-right">
                    <Pct value={row[mode][w]} mode={mode} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SectorTable({ data }: { data: SectorsData }) {
  const [mode, setMode] = useState<Mode>("relative");
  const [sort, setSort] = useState<{ key: SectorWindow; dir: "asc" | "desc" }>({
    key: "1M",
    dir: "desc",
  });

  function handleSort(key: SectorWindow) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  const sectors = data.rows.filter((r) => r.tier === "sector");
  const industries = data.rows.filter((r) => r.tier === "industry");

  if (data.unavailable) {
    return (
      <div className="rounded-xl bg-card p-4">
        <p className="text-sm text-muted-foreground">
          The benchmark did not load, so nothing can be measured against it. The page will fill in
          on the next refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Measure">
          {(
            [
              ["relative", "vs S&P 500"],
              ["absolute", "Total return"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                mode === id
                  ? "bg-accent text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "relative"
            ? "Percentage points above or below SPY over the same window."
            : "Total return, dividends reinvested."}
        </p>
      </div>

      {/* Side by side from lg, not stacked. Two reasons: a single full-width
          table put ~1000px of dead space in the name column while six numeric
          columns crowded the right edge, and the industry tier is meant to be
          read against the sector tier rather than scrolled to after it. Both
          share one sort key, so clicking 3M reorders them together and the
          comparison stays honest. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Tier
          title="Sectors"
          note="Every S&P 500 constituent sits in exactly one — directly comparable."
          rows={sectors}
          mode={mode}
          sort={sort}
          onSort={handleSort}
        />

        <Tier
          title="Industries"
          note="Overlapping by design — semis sit inside tech. Read as what is driving the sectors, not as a ranking against them."
          rows={industries}
          mode={mode}
          sort={sort}
          onSort={handleSort}
        />
      </div>

      {/* The benchmark's own numbers. Without them a screen of green relative
          figures is unreadable: every sector can beat an index that fell. */}
      <div className="rounded-xl bg-card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground">Benchmark</h2>
          <p className="text-xs text-muted-foreground">
            SPY total return — what the relative column is measured against
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
          {SECTOR_WINDOWS.map((w) => (
            <div key={w}>
              <p className="text-xs text-muted-foreground">{w}</p>
              <p className="text-sm font-medium">
                <Pct value={data.benchmark[w]} mode="absolute" />
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
