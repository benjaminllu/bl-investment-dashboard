"use client";

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
  mspr?: number | null;
  msprYear?: number | null;
  msprMonth?: number | null;
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

// MSPR (Monthly Share Purchase Ratio, -100..100) is monthly data that lags
// 1-2 months, so the source month goes in a tooltip to make the staleness
// discoverable rather than implied.
function MsprCell({
  value,
  year,
  month,
}: {
  value: number | null | undefined;
  year: number | null | undefined;
  month: number | null | undefined;
}) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const period =
    year && month && month >= 1 && month <= 12
      ? `${MONTHS[month - 1]} ${year}`
      : undefined;
  return (
    <span
      className={value >= 0 ? "text-accent" : "text-destructive"}
      title={period ? `Insider sentiment for ${period}` : undefined}
    >
      {value.toFixed(0)}
    </span>
  );
}

type StockTableProps = {
  stocks: Stock[];
  selected?: string | null;
  onSelect?: (ticker: string) => void;
};

export default function StockTable({ stocks, selected, onSelect }: StockTableProps) {
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
            <th className="w-16 px-2 py-1.5">Ticker</th>
            <th className="px-2 py-1.5">Company</th>
            <th className="w-24 px-2 py-1.5">Price</th>
            <th className="w-20 px-2 py-1.5">1D %</th>
            <th className="w-20 px-2 py-1.5">1M %</th>
            <th className="w-20 px-2 py-1.5">YTD %</th>
            <th className="w-24 px-2 py-1.5">Mkt Cap</th>
            <th className="w-20 px-2 py-1.5">Insider</th>
            <th className="w-28 px-2 py-1.5">Latest Update</th>
          </tr>
        </thead>

        <tbody>
          {stocks.map((stock) => (
            <tr
              key={stock.ticker}
              className={`border-t border-border transition-colors ${
                stock.ticker === selected ? "bg-muted/60" : ""
              }`}
            >
              <td className="px-2 py-1.5 font-semibold">
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
                <MsprCell value={stock.mspr} year={stock.msprYear} month={stock.msprMonth} />
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(stock.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
