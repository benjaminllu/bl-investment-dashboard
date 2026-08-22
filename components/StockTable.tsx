"use client";

import { useMemo, useState } from "react";

import type { InsiderSummary } from "@/lib/insiderTransactions";

export type Stock = {
  id: string;
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  marketCap?: number | null;
  marketCapCurrency?: string | null;
  forwardPe?: number | null;
  peTtm?: number | null;
  nextEarnings?: string | null;
  priority: string;
  latest_update: string;
  updatedAt: string | null;
  list: string | null;
  /** Notable Section 16 activity in the trailing window; absent for most rows. */
  insider?: InsiderSummary | null;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// Colored % cell, reused for 1D / 1M / YTD. Renders a muted em-dash until the
// underlying metric is wired up (value null/undefined).
function PctCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={value >= 0 ? "text-accent" : "text-destructive"}>
      {value.toFixed(2)}%
    </span>
  );
}

// Finnhub reports market cap in millions of the stock's *listing* currency, so
// a KRW-listed name comes back as e.g. 21,002,317 (≈$15B). Rendering that with
// a "$" would be off by orders of magnitude, so anything non-USD shows an
// em-dash rather than a confidently wrong number.
function MarketCapCell({
  value,
  currency,
}: {
  value: number | null | undefined;
  currency: string | null | undefined;
}) {
  if (value == null || currency !== "USD") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (value >= 1_000_000) return <>${(value / 1_000_000).toFixed(2)}T</>;
  if (value >= 1_000) return <>${(value / 1_000).toFixed(1)}B</>;
  return <>${Math.round(value)}M</>;
}

// Forward P/E preferred, trailing as the fallback. Forward is both the more
// useful figure and the better-covered one on Finnhub's free tier, but the two
// are not interchangeable, so a trailing value is rendered muted and says so in
// its tooltip rather than passing silently as a forward number.
//
// Deliberately not colored by direction: unlike a percent change, a high or low
// P/E is not good or bad on its own, so the emerald/red signal would be noise.
// Negatives are suppressed — a P/E on negative earnings is not meaningful.
// Trailing and forward each get their own column, so no value is ever shown
// standing in for the other.
//
// An em-dash means the figure is genuinely absent — Finnhub returns neither P/E
// for ETFs or for names with no expected earnings. Every finite number is
// printed as-is, including 0.0 and negatives (a P/E on negative earnings), so a
// real zero is never mistaken for missing data.
//
// Not colored by direction: unlike a percent change, a high or low P/E is not
// good or bad on its own, so the emerald/red signal would be noise here.
function PeCell({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="text-foreground">{value.toFixed(1)}</span>;
}

// MM/DD/YYYY. The full year replaces the old "May 31 '26" form, which packed
// the year in as an abbreviation to keep the column narrow — the numeric format
// is shorter than the month name it drops, so w-28 still fits comfortably.
//
// The spelled-out date stays in the tooltip: it is the one place that says
// unambiguously which half is the month, for anyone reading DD/MM out of habit.
function EarningsCell({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  // Date-only strings parse as UTC; format in UTC so the day doesn't shift.
  const d = new Date(`${date}T00:00:00Z`);
  return (
    <span
      title={d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}
    >
      {d.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })}
    </span>
  );
}

// Compact money for the insider tooltip: a Form 4 value spans six orders of
// magnitude, and the column has no room for digits.
function insiderUsd(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

/**
 * Notable insider activity, as a count per direction rather than a value.
 *
 * Counts, not dollars, because the question this column answers at a glance is
 * "did anyone act, and which way" — and dollar totals answer it badly. An
 * executive at a mega-cap trimming a routine slice outsizes a small-cap founder
 * buying with their own money by two orders of magnitude, so a value-ranked
 * column would be a market-cap column wearing a disguise. The dollars are in the
 * tooltip, where there is room to read them in context.
 *
 * Buys lead when both directions are present: selling has a dozen innocent
 * explanations (tax, diversification, a scheduled plan) and buying has one.
 */
function InsiderCell({ summary }: { summary: InsiderSummary | null | undefined }) {
  if (!summary || (!summary.buys && !summary.sells)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const detail = summary.events
    .slice(0, 6)
    .map((e) => {
      const flags = [e.isExerciseSale ? "exercise & sell" : null, e.is10b51 ? "10b5-1" : null]
        .filter(Boolean)
        .join(", ");
      return (
        `${e.date}  ${e.code === "P" ? "BUY " : "SELL"} ${insiderUsd(e.valueUsd)}  ` +
        `${e.ownerName} (${e.role})${flags ? ` [${flags}]` : ""}`
      );
    })
    .join("\n");
  const more = summary.events.length > 6 ? `\n+${summary.events.length - 6} more` : "";

  return (
    <span className="flex items-center gap-1.5 tabular-nums" title={`${detail}${more}`}>
      {summary.buys > 0 && (
        <span className={summary.isCluster ? "font-semibold text-accent" : "text-accent"}>
          {/* The cluster marker is a doubled glyph rather than a colour or a
              badge: it has to survive being one of eleven columns, and the
              accent colour is already carrying "this is buying". */}
          {summary.isCluster ? "▲▲" : "▲"} {summary.buys}
        </span>
      )}
      {summary.sells > 0 && (
        <span className="text-destructive">▼ {summary.sells}</span>
      )}
    </span>
  );
}

type SortKey =
  | "ticker"
  | "company"
  | "price"
  | "changePct"
  | "marketCap"
  | "peTtm"
  | "forwardPe"
  | "nextEarnings"
  | "insider"
  | "updatedAt";

type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir } | null;

// Text reads naturally A-Z, and for a forward-looking date the useful first look
// is "soonest first" — descending would surface the furthest-out earnings. Every
// other numeric column opens descending, where biggest/best first is what you want.
const ASC_FIRST_KEYS: ReadonlySet<SortKey> = new Set<SortKey>([
  "ticker",
  "company",
  "nextEarnings",
]);

function defaultDir(key: SortKey): SortDir {
  return ASC_FIRST_KEYS.has(key) ? "asc" : "desc";
}

function sortValue(stock: Stock, key: SortKey): string | number | null {
  switch (key) {
    case "ticker":
      return stock.ticker;
    case "company":
      return stock.company;
    case "price":
      return stock.price;
    case "changePct":
      return stock.changePct;
    // Values are stored in mixed currencies, and only USD ones are rendered.
    // Sorting the raw number would rank a KRW market cap above every US
    // mega-cap, so anything non-USD sorts as missing — matching what's shown.
    case "marketCap":
      return stock.marketCapCurrency === "USD" ? stock.marketCap ?? null : null;
    // Sorts on whichever figure the cell actually displays, so the ordering
    // matches what is on screen. Non-positive values are excluded here for the
    // same reason PeCell suppresses them: a P/E on negative earnings is not a
    // meaningful number to rank by.
    // Sorted on the raw figure. A zero is a real value and ranks as one; only a
    // missing figure sorts as null, which compareStocks sinks to the bottom.
    case "peTtm":
      return stock.peTtm ?? null;
    case "forwardPe":
      return stock.forwardPe ?? null;
    // Parsed to a timestamp rather than compared as a string, matching updatedAt.
    case "nextEarnings":
      return stock.nextEarnings ? new Date(`${stock.nextEarnings}T00:00:00Z`).getTime() : null;
    // Signed, so one sort puts insider buying at the top and its reverse puts
    // heavy selling there — which is the whole question this column exists to
    // answer. Value would be the obvious alternative but ranks a single mega-cap
    // executive's routine trim above a small-cap founder buying with cash.
    case "insider": {
      const insider = stock.insider;
      if (!insider) return null;
      return insider.buys - insider.sells;
    }
    // Sort on the timestamp, not the "2h ago" string, which would order
    // alphabetically.
    case "updatedAt":
      return stock.updatedAt ? new Date(stock.updatedAt).getTime() : null;
  }
}

function compareStocks(a: Stock, b: Stock, { key, dir }: NonNullable<SortState>): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);

  // Missing values always sink, in both directions. Roughly a quarter of the
  // watchlist has no insider or market-cap figure, so letting nulls lead a
  // descending sort would open the table with a wall of em-dashes.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  const cmp =
    typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
  return dir === "asc" ? cmp : -cmp;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 text-left transition-colors ${
          active ? "text-accent" : "hover:text-foreground"
        }`}
      >
        <span className="truncate">{label}</span>
        {/* aria-sort on the th already announces direction, so the glyph is decorative. */}
        {active && (
          <span aria-hidden="true" className="shrink-0">
            {sort.dir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

type StockTableProps = {
  stocks: Stock[];
  selected?: string | null;
  onSelect?: (ticker: string) => void;
};

export default function StockTable({ stocks, selected, onSelect }: StockTableProps) {
  // null = unsorted, i.e. the curated order the rows arrive in. This state
  // deliberately survives watchlist tab changes: the component keeps the same
  // position and type, so React preserves it and the sort reads as a view
  // preference rather than something to re-apply per tab.
  const [sort, setSort] = useState<SortState>(null);

  // Same column cycles default direction -> opposite -> unsorted, so the
  // curated order is always reachable without a page reload.
  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: defaultDir(key) };
      if (prev.dir === defaultDir(key)) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return null;
    });
  };

  const sortedStocks = useMemo(() => {
    if (!sort) return stocks;
    return [...stocks].sort((a, b) => compareStocks(a, b, sort));
  }, [stocks, sort]);

  const handleRowClick = (ticker: string) => {
    // Don't hijack a drag-to-copy: if the user just selected text in the row,
    // leave the chart alone.
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    onSelect?.(ticker);
  };

  return (
    // Capped so a long tab — "All" runs to 130 rows — does not push the rest of
    // the page off-screen. Viewport-relative rather than a fixed pixel height so
    // it adapts to the screen instead of wasting a tall monitor. overflow-auto
    // covers both axes: the horizontal scroll this already had, plus the new
    // vertical one.
    <div className="max-h-[60vh] overflow-auto rounded-xl bg-card">
      {/* table-fixed + explicit column widths keep the layout identical across
          watchlist tabs (baselined on the "Index" tab) instead of resizing to
          each tab's content. Company is the one column left without a width, so
          it absorbs whatever slack remains — it already truncates, so it is the
          safest place for the layout to flex. */}
      <table className="w-full table-fixed text-left text-sm">
        {/* Sticky so the column labels survive scrolling 130 rows — without it
            you lose track of which number is P/E TTM and which is P/E Fwd. */}
        <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
          <tr>
            <SortHeader label="Ticker" sortKey="ticker" sort={sort} onSort={handleSort} className="w-16 px-2 py-1.5" />
            <SortHeader label="Company" sortKey="company" sort={sort} onSort={handleSort} className="px-2 py-1.5" />
            <SortHeader label="Price" sortKey="price" sort={sort} onSort={handleSort} className="w-24 px-2 py-1.5" />
            <SortHeader label="1D %" sortKey="changePct" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="Mkt Cap" sortKey="marketCap" sort={sort} onSort={handleSort} className="w-24 px-2 py-1.5" />
            <SortHeader label="P/E TTM" sortKey="peTtm" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="P/E Fwd" sortKey="forwardPe" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="Earnings" sortKey="nextEarnings" sort={sort} onSort={handleSort} className="w-28 px-2 py-1.5" />
            <SortHeader label="Insider" sortKey="insider" sort={sort} onSort={handleSort} className="w-24 px-2 py-1.5" />
            <SortHeader label="Updated" sortKey="updatedAt" sort={sort} onSort={handleSort} className="w-28 px-2 py-1.5" />
          </tr>
        </thead>

        <tbody>
          {sortedStocks.map((stock) => {
            const isSelected = stock.ticker === selected;
            return (
            <tr
              key={stock.ticker}
              onClick={() => handleRowClick(stock.ticker)}
              aria-current={isSelected ? "true" : undefined}
              // Hover is applied only when unselected: both are same-specificity
              // utilities, so class order wouldn't reliably let selected win.
              className={`cursor-pointer border-t border-border transition-colors ${
                isSelected ? "bg-muted/60" : "hover:bg-muted/40"
              }`}
            >
              <td className="px-2 py-1.5 font-semibold">
                {/* Kept as a real button so the row stays reachable by keyboard —
                    a bare <tr onClick> is mouse-only. Clicking it also bubbles to
                    the row handler, but both select the same ticker. */}
                <button
                  onClick={() => onSelect?.(stock.ticker)}
                  className="hover:text-accent"
                >
                  {stock.ticker}
                </button>
              </td>
              <td className="truncate px-2 py-1.5" title={stock.company}>
                {stock.company}
              </td>
              <td className="px-2 py-1.5 tabular-nums">${stock.price.toFixed(2)}</td>
              <td className="px-2 py-1.5 tabular-nums">
                <PctCell value={stock.changePct} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                <MarketCapCell value={stock.marketCap} currency={stock.marketCapCurrency} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                <PeCell value={stock.peTtm} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                <PeCell value={stock.forwardPe} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                <EarningsCell date={stock.nextEarnings} />
              </td>
              <td className="px-2 py-1.5">
                <InsiderCell summary={stock.insider} />
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(stock.updatedAt)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
