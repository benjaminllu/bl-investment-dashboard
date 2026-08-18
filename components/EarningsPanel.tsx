"use client";

export type EarningsRow = {
  ticker: string;
  sourceSymbol: string | null;
  date: string;
  hour: string | null;
  quarter: number | null;
  year: number | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
};

function formatDate(iso: string): string {
  // Date-only strings parse as UTC; render in UTC too so a date near midnight
  // doesn't shift a day in the viewer's local zone.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - todayUtc) / 86_400_000);
}

const HOUR_LABEL: Record<string, string> = {
  bmo: "Before open",
  amc: "After close",
};

// Revenue arrives in absolute units (AAPL: 110813711563 for a $110.8B quarter),
// NOT in millions like Finnhub's market cap field — so this deliberately does not
// reuse the scaling in StockTable's MarketCapCell.
function formatRevenue(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Rows beyond this are dropped rather than rendered into a scroller nobody
 * reaches. Finnhub returns up to four forward quarters per ticker, so a
 * 130-ticker watchlist can produce several hundred — far past the point where
 * "upcoming" means anything.
 */
const MAX_ROWS = 50;

/** Reporting inside this window is near-term enough to read at full contrast. */
const NEAR_TERM_DAYS = 7;

type Props = {
  /** Every ticker's earnings, flat and unfiltered. Sorting and the upcoming-only
   *  filter happen here so callers don't each reimplement them. */
  rows: EarningsRow[];
  /** Listing currency per ticker, from stock_fundamentals. Gates the per-share
   *  figures on a row-by-row basis — see the comment at the gate below. */
  currencyByTicker: Record<string, string | null>;
  /** Highlighted, and kept in step with the chart's ticker. */
  selected: string | null;
  onSelect: (ticker: string) => void;
  /** The query failed, so emptiness here says nothing about the schedule. */
  unavailable?: boolean;
};

/**
 * The watchlist's next earnings dates, soonest first, across every ticker.
 *
 * Deliberately global rather than scoped to the selected ticker. The question
 * this panel answers at a glance is "who reports next", which is a property of
 * the whole watchlist — the per-ticker version required knowing which ticker to
 * click before it could tell you anything, and left four rows of content in a
 * panel sized for the chart beside it.
 */
export default function EarningsPanel({
  rows,
  currencyByTicker,
  selected,
  onSelect,
  unavailable,
}: Props) {
  const upcoming = rows
    .filter((r) => daysUntil(r.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker))
    .slice(0, MAX_ROWS);

  if (upcoming.length === 0) {
    return (
      <div className="flex h-42 flex-col rounded-xl bg-card p-3 lg:h-full">
        <h2 className="text-xs font-medium text-foreground">Upcoming Earnings</h2>
        <p className="flex flex-1 items-center text-xs text-muted-foreground">
          {unavailable
            ? "Earnings data is unavailable — the lookup failed, so this is not a statement about the schedule."
            : "No scheduled earnings across the watchlist."}
        </p>
      </div>
    );
  }

  return (
    // Fixed height on mobile so the panel does not grow with the row count;
    // h-full on lg because the glance row sets one height for all three panels.
    <div className="flex h-42 flex-col rounded-xl bg-card p-3 lg:h-full">
      <h2 className="mb-1 shrink-0 text-xs font-medium text-foreground">Upcoming Earnings</h2>

      {/* Scrolls in both axes inside the fixed height: cells never wrap, so a
          narrow viewport scrolls sideways instead of growing the panel. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
            <tr>
              <th className="py-0.5 pr-3 font-medium whitespace-nowrap">Ticker</th>
              <th className="py-0.5 pr-3 font-medium whitespace-nowrap">Date</th>
              <th className="py-0.5 pr-3 font-medium whitespace-nowrap">Quarter</th>
              <th className="py-0.5 pr-3 font-medium whitespace-nowrap">Timing</th>
              {/* Abbreviated: the full labels were the widest cells in their
                  columns, and six nowrap columns in a 384px panel cannot spend
                  70px on a header for a $1.23 value. */}
              <th className="py-0.5 pr-3 font-medium whitespace-nowrap">EPS</th>
              <th className="py-0.5 font-medium whitespace-nowrap">Rev</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((row) => {
              const days = daysUntil(row.date);
              const isSelected = row.ticker === selected;
              const currency = currencyByTicker[row.ticker] ?? null;

              // Both gates are required, and neither is sufficient alone:
              // TORXF/STM report currency USD but resolve to foreign listings
              // (TXG.TO, STMPA.PA), while BABA matches on symbol but is CNY.
              // The DATE stays valid either way — share classes and ADRs report
              // alongside their home listing — so only the figures are withheld.
              //
              // Compared against the row's OWN ticker rather than the selected
              // one, now that rows from every ticker share the table.
              const symbolMatches = row.sourceSymbol === null || row.sourceSymbol === row.ticker;
              const showEstimates = symbolMatches && currency === "USD";
              const withheld = estimateWithheldReason(symbolMatches, currency, row.sourceSymbol);

              return (
                <tr
                  key={`${row.ticker}-${row.date}-${row.quarter ?? "?"}`}
                  onClick={() => onSelect(row.ticker)}
                  className={`cursor-pointer border-t border-border transition-colors hover:bg-muted ${
                    days <= NEAR_TERM_DAYS ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {/* Accent marks the selected ticker and nothing else. Recency is
                      carried by text weight instead, so green keeps meaning
                      "this is the active one" as it does in every tab row. */}
                  <td
                    className={`whitespace-nowrap py-1 pr-3 font-semibold ${
                      isSelected ? "text-accent" : ""
                    }`}
                  >
                    {row.ticker}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 tabular-nums">
                    {formatDate(row.date)}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {days === 0 ? "(today)" : days === 1 ? "(tmrw)" : `(${days}d)`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 tabular-nums">
                    {row.quarter && row.year ? `Q${row.quarter} ${row.year}` : "—"}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3">
                    {row.hour && HOUR_LABEL[row.hour] ? HOUR_LABEL[row.hour] : "—"}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-3 tabular-nums">
                    {showEstimates && row.epsEstimate !== null ? (
                      `$${row.epsEstimate.toFixed(2)}`
                    ) : (
                      <span title={withheld}>—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1 tabular-nums">
                    {showEstimates && row.revenueEstimate !== null ? (
                      formatRevenue(row.revenueEstimate)
                    ) : (
                      <span title={withheld}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Surfaced as a tooltip so a row of em-dashes is explicable rather than looking
// like missing data.
function estimateWithheldReason(
  symbolMatches: boolean,
  currency: string | null,
  sourceSymbol: string | null
): string | undefined {
  if (!symbolMatches) {
    return `Estimates are reported for ${sourceSymbol}, a different listing or share class`;
  }
  if (currency && currency !== "USD") {
    return `Estimates are reported in ${currency}, not USD`;
  }
  return undefined;
}
