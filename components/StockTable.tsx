"use client";

export type Stock = {
  id: string;
  ticker: string;
  company: string;
  price: number;
  changePct: number;
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

type StockTableProps = {
  stocks: Stock[];
  selected?: string | null;
  onSelect?: (ticker: string) => void;
};

export default function StockTable({ stocks, selected, onSelect }: StockTableProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5">Ticker</th>
            <th className="px-2 py-1.5">Company</th>
            <th className="px-2 py-1.5">Price</th>
            <th className="px-2 py-1.5">1D %</th>
            <th className="px-2 py-1.5">Priority</th>
            <th className="px-2 py-1.5">Latest Update</th>
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
              <td className="px-2 py-1.5">{stock.company}</td>
              <td className="px-2 py-1.5 tabular-nums">${stock.price.toFixed(2)}</td>
              <td className="px-2 py-1.5 tabular-nums">
                <span className={stock.changePct >= 0 ? "text-accent" : "text-destructive"}>
                  {stock.changePct.toFixed(2)}%
                </span>
              </td>
              <td className="px-2 py-1.5">{stock.priority}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{timeAgo(stock.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
