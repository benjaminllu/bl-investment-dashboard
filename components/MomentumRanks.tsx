"use client";

import { useMemo, useState } from "react";
import Sparkline from "@/components/Sparkline";
import {
  LOOKBACKS,
  QUADRANT_LABEL,
  type Lookback,
  type MomentumRow,
  type Quadrant,
} from "@/lib/rotation";
import type { SectorTier } from "@/lib/sectors";

/**
 * The mechanical version of the rotation graph: rank the funds by trailing
 * relative return and read the ordering.
 *
 * The score column is the average of three cross-sectional z-scores — three,
 * six, and twelve-minus-one month excess return. It is not a return and it is
 * not a percentage; it is "how many standard deviations above the group this
 * fund's trailing relative performance sits, averaged over three horizons".
 * Displayed to two places because the gaps between adjacent ranks are often
 * smaller than that, and a reader who cannot see rank 4 and rank 5 are
 * separated by 0.03 will over-read the ordering.
 *
 * The Δ column is the part that is actually about rotation. A rank is a
 * snapshot; a rank that moved four places in a month is the thing this page
 * exists to surface, and it is invisible in any single-date table.
 */

type SortKey = "rank" | "score" | Lookback | "vs50" | "vs200" | "delta";

const QUADRANT_TEXT: Record<Quadrant, string> = {
  leading: "text-accent",
  weakening: "text-warning",
  lagging: "text-destructive",
  improving: "text-muted-foreground",
};

const LOOKBACK_NOTE: Record<Lookback, string> = {
  "1M": "Trailing month, excluded from the score — one-month returns reverse rather than persist.",
  "3M": "Trailing quarter of relative return.",
  "6M": "Trailing half-year of relative return.",
  "12-1M": "A year of relative return ending a month ago — the academic momentum window.",
};

function Signed({ value, digits = 1 }: { value: number | null; digits?: number }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value > 0 ? "text-accent" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(digits)}
    </span>
  );
}

/**
 * Rank movement over the last month.
 *
 * Rank 1 is the top, so a *falling* number is an improvement — which is exactly
 * the sort of thing that gets misread at a glance. Hence the arrow and the
 * colour, both keyed to the improvement rather than to the arithmetic sign.
 */
function RankDelta({ now, prior }: { now: number | null; prior: number | null }) {
  if (now === null || prior === null) return <span className="text-muted-foreground">—</span>;
  const moved = prior - now;
  if (moved === 0) return <span className="text-muted-foreground">·</span>;
  return (
    <span
      className={`tabular-nums ${moved > 0 ? "text-accent" : "text-destructive"}`}
      title={`Was rank ${prior} a month ago`}
    >
      {moved > 0 ? "▲" : "▼"}
      {Math.abs(moved)}
    </span>
  );
}

function SortHeader({
  sortKey,
  sort,
  onSort,
  children,
  title,
  width,
}: {
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
  title?: string;
  width?: string;
}) {
  const active = sort.key === sortKey;
  return (
    // aria-sort belongs on the `th`, which carries the implicit columnheader
    // role the attribute is defined for — a button inside it does not.
    <th
      className={`px-2 py-1.5 text-right font-medium ${width ?? ""}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={title}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`w-full text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active ? "text-accent" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {children}
        {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
}

function sortValue(row: MomentumRow, key: SortKey): number | null {
  switch (key) {
    case "rank":
      // Inverted so "descending" on this column means rank 1 at the top, like
      // every other column where descending means best first.
      return row.rank === null ? null : -row.rank;
    case "delta":
      return row.rank === null || row.rankPrior === null ? null : row.rankPrior - row.rank;
    case "score":
      return row.score;
    case "vs50":
      return row.vs50;
    case "vs200":
      return row.vs200;
    default:
      return row.excess[key];
  }
}

export default function MomentumRanks({ rows }: { rows: MomentumRow[] }) {
  const [tier, setTier] = useState<SectorTier>("sector");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "rank",
    dir: "desc",
  });

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => r.tier === tier);
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [rows, tier, sort]);

  function handleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" },
    );
  }

  const tiers = rows.some((r) => r.tier === "industry")
    ? ([
        ["sector", "Sectors"],
        ["industry", "Industries"],
      ] as const)
    : ([["sector", "Sectors"]] as const);

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Momentum ranking</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Excess return against SPY, in percentage points. Score averages the 3M, 6M and 12-1M
            columns after standardising each across the group.
          </p>
        </div>
        {tiers.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="Tier">
            {tiers.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTier(id)}
                aria-pressed={tier === id}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  tier === id
                    ? "bg-accent text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs text-muted-foreground">
              <SortHeader sortKey="rank" sort={sort} onSort={handleSort} width="w-10">#</SortHeader>
              <SortHeader sortKey="delta" sort={sort} onSort={handleSort} width="w-12" title="Change in rank over the last month">
                Δ1M
              </SortHeader>
              <th className="px-2 py-1.5 text-left font-medium">Sector</th>
              <th className="w-14 px-2 py-1.5 text-left font-medium">ETF</th>
              <th
                className="w-28 px-2 py-1.5 text-left font-medium"
                title="Price relative to SPY over the last year, rebased to 100 at the start"
              >
                RS vs SPY, 1Y
              </th>
              {LOOKBACKS.map((lb) => (
                <SortHeader key={lb} sortKey={lb} sort={sort} onSort={handleSort} width="w-16" title={LOOKBACK_NOTE[lb]}>
                  {lb}
                </SortHeader>
              ))}
              <SortHeader sortKey="score" sort={sort} onSort={handleSort} width="w-16" title="Mean cross-sectional z-score of 3M, 6M and 12-1M">
                Score
              </SortHeader>
              <SortHeader sortKey="vs50" sort={sort} onSort={handleSort} width="w-16" title="Percent above or below its own 50-day average">
                vs 50d
              </SortHeader>
              <SortHeader sortKey="vs200" sort={sort} onSort={handleSort} width="w-16" title="Percent above or below its own 200-day average">
                vs 200d
              </SortHeader>
              <th className="w-24 px-2 py-1.5 text-left font-medium">Quadrant</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.ticker} className="border-t border-border">
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {row.rank ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right text-xs">
                  <RankDelta now={row.rank} prior={row.rankPrior} />
                </td>
                <td className="px-2 py-1.5 text-foreground">{row.label}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{row.ticker}</td>
                <td className="px-2 py-1.5">
                  <Sparkline
                    values={row.rsLine}
                    tone="auto"
                    baseline={100}
                    title={`${row.ticker} relative to SPY over the last year`}
                  />
                </td>
                {LOOKBACKS.map((lb) => (
                  <td key={lb} className="px-2 py-1.5 text-right">
                    <Signed value={row.excess[lb]} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-medium">
                  <Signed value={row.score} digits={2} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Signed value={row.vs50} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Signed value={row.vs200} />
                </td>
                <td className="px-2 py-1.5">
                  {row.quadrant ? (
                    <span className={`text-xs font-medium ${QUADRANT_TEXT[row.quadrant]}`}>
                      {QUADRANT_LABEL[row.quadrant]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        The 1M column is shown but kept out of the score. Returns over a single month have
        historically reversed rather than continued — the reason the standard academic momentum
        window stops a month short of today — so averaging it in would net part of a reversal signal
        against three momentum ones.
      </p>
    </div>
  );
}
