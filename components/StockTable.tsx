"use client";

export type Stock = {
  id: string;
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  priority: string;
  latest_update: string;
  list: string | null;
};

type StockTableProps = {
  stocks: Stock[];
  selected?: string | null;
  onSelect?: (ticker: string) => void;
};

export default function StockTable({ stocks, selected, onSelect }: StockTableProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800 text-slate-300">
          <tr>
            <th className="px-3 py-2">Ticker</th>
            <th className="px-3 py-2">Company</th>
            <th className="px-3 py-2">Price</th>
            <th className="px-3 py-2">1D %</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Latest Update</th>
          </tr>
        </thead>

        <tbody>
          {stocks.map((stock) => (
            <tr
              key={stock.ticker}
              className={`border-t border-slate-800 ${
                stock.ticker === selected ? "bg-slate-800/60" : ""
              }`}
            >
              <td className="px-3 py-2 font-semibold">
                <button
                  onClick={() => onSelect?.(stock.ticker)}
                  className="hover:text-emerald-400"
                >
                  {stock.ticker}
                </button>
              </td>
              <td className="px-3 py-2">{stock.company}</td>
              <td className="px-3 py-2">${stock.price.toFixed(2)}</td>
              <td className="px-3 py-2">
                <span className={stock.changePct >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {stock.changePct.toFixed(2)}%
                </span>
              </td>
              <td className="px-3 py-2">{stock.priority}</td>
              <td className="px-3 py-2 text-slate-300">{stock.latest_update}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
