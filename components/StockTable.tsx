"use client";

import { useMemo, useState } from "react";

export type Stock = {
  id: string;
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  changePct1M?: number | null;
  changePctYTD?: number | null;
  marketCap?: number | null;
  marketCapCurrency?: string | null;
  forwardPe?: number | null;
  peTtm?: number | null;
  nextEarnings?: string | null;
  priority: string;
  latest_update: string;
  updatedAt: string | null;
  list: string | null;
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

// Abbreviated year keeps the column narrow while still disambiguating dates
// that are 12+ months out — the schedule runs to mid-2027, so "May 31" alone
// was ambiguous against "May 26". Full date stays in the tooltip.
function EarningsCell({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  // Date-only strings parse as UTC; format in UTC so the day doesn't shift.
  const d = new Date(`${date}T00:00:00Z`);
  const monthDay = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const yy = d.toLocaleDateString("en-US", { year: "2-digit", timeZone: "UTC" });
  return (
    <span
      title={d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}
    >
      {/* Built as one expression so the apostrophe is data, not JSX text. */}
      {`${monthDay} '${yy}`}
    </span>
  );
}

type SortKey =
  | "ticker"
  | "company"
  | "price"
  | "changePct"
  | "changePct1M"
  | "changePctYTD"
  | "marketCap"
  | "peTtm"
  | "forwardPe"
  | "nextEarnings"
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
    case "changePct1M":
      return stock.changePct1M ?? null;
    case "changePctYTD":
      return stock.changePctYTD ?? null;
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
    <div className="overflow-x-auto rounded-xl bg-card">
      {/* table-fixed + explicit column widths keep the layout identical across
          watchlist tabs (baselined on the "Index" tab) instead of resizing to
          each tab's content. Company is the one column left without a width, so
          it absorbs whatever slack remains — it already truncates, so it is the
          safest place for the layout to flex. */}
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <SortHeader label="Ticker" sortKey="ticker" sort={sort} onSort={handleSort} className="w-16 px-2 py-1.5" />
            <SortHeader label="Company" sortKey="company" sort={sort} onSort={handleSort} className="px-2 py-1.5" />
            <SortHeader label="Price" sortKey="price" sort={sort} onSort={handleSort} className="w-24 px-2 py-1.5" />
            <SortHeader label="1D %" sortKey="changePct" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="1M %" sortKey="changePct1M" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="YTD %" sortKey="changePctYTD" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="Mkt Cap" sortKey="marketCap" sort={sort} onSort={handleSort} className="w-24 px-2 py-1.5" />
            <SortHeader label="P/E TTM" sortKey="peTtm" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="P/E Fwd" sortKey="forwardPe" sort={sort} onSort={handleSort} className="w-20 px-2 py-1.5" />
            <SortHeader label="Earnings" sortKey="nextEarnings" sort={sort} onSort={handleSort} className="w-28 px-2 py-1.5" />
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
                <PctCell value={stock.changePct1M} />
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                <PctCell value={stock.changePctYTD} />
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
              <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(stock.updatedAt)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
