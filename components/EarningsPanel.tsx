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
    year: "numeric",
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

type Props = {
  ticker: string;
  rows: EarningsRow[];
  /** Listing currency from stock_fundamentals; gates the per-share figures. */
  currency: string | null;
};

export default function EarningsPanel({ ticker, rows, currency }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-card p-4">
        <h2 className="text-sm font-medium text-foreground">Upcoming Earnings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No scheduled earnings for {ticker}.
        </p>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const nextDate = sorted.find((r) => daysUntil(r.date) >= 0)?.date;

  return (
    <div className="rounded-xl bg-card p-4">
      <h2 className="mb-2 text-sm font-medium text-foreground">Upcoming Earnings</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Date</th>
              <th className="py-1 pr-3 font-medium">Quarter</th>
              <th className="py-1 pr-3 font-medium">Timing</th>
              <th className="py-1 pr-3 font-medium">EPS Est.</th>
              <th className="py-1 font-medium">Revenue Est.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isNext = row.date === nextDate;
              const days = daysUntil(row.date);

              // Both gates are required, and neither is sufficient alone:
              // TORXF/STM report currency USD but resolve to foreign listings
              // (TXG.TO, STMPA.PA), while BABA matches on symbol but is CNY.
              // The DATE stays valid either way — share classes and ADRs report
              // alongside their home listing — so only the figures are withheld.
              const symbolMatches = row.sourceSymbol === null || row.sourceSymbol === ticker;
              const showEstimates = symbolMatches && currency === "USD";

              return (
                <tr
                  key={`${row.date}-${row.quarter ?? "?"}`}
                  className={`border-t border-border ${isNext ? "text-foreground" : "text-muted-foreground"}`}
                >
                  <td className={`py-1.5 pr-3 tabular-nums ${isNext ? "font-semibold text-accent" : ""}`}>
                    {formatDate(row.date)}
                    {isNext && days >= 0 && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        {days === 0 ? "(today)" : days === 1 ? "(tomorrow)" : `(${days}d)`}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.quarter && row.year ? `Q${row.quarter} ${row.year}` : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {row.hour && HOUR_LABEL[row.hour] ? HOUR_LABEL[row.hour] : "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {showEstimates && row.epsEstimate !== null ? (
                      `$${row.epsEstimate.toFixed(2)}`
                    ) : (
                      <span title={estimateWithheldReason(symbolMatches, currency, row.sourceSymbol)}>—</span>
                    )}
                  </td>
                  <td className="py-1.5 tabular-nums">
                    {showEstimates && row.revenueEstimate !== null ? (
                      formatRevenue(row.revenueEstimate)
                    ) : (
                      <span title={estimateWithheldReason(symbolMatches, currency, row.sourceSymbol)}>—</span>
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
