import DeleteButton from "./DeleteButton";

type Stock = {
  id: string;
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  priority: string;
  latest_update: string;
};

type StockTableProps = {
  stocks: Stock[];
};

export default function StockTable({ stocks }: StockTableProps) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800 text-slate-300">
          <tr>
            <th className="p-4">Ticker</th>
            <th className="p-4">Company</th>
            <th className="p-4">Price</th>
            <th className="p-4">1D %</th>
            <th className="p-4">Priority</th>
            <th className="p-4">Latest Update</th>
            <th className="p-4"></th>
          </tr>
        </thead>

        <tbody>
          {stocks.map((stock) => (
            <tr key={stock.ticker} className="border-t border-slate-800">
              <td className="p-4 font-semibold">{stock.ticker}</td>
              <td className="p-4">{stock.company}</td>
              <td className="p-4">${stock.price.toFixed(2)}</td>
              <td className="p-4">
                <span className={stock.changePct >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {stock.changePct.toFixed(2)}%
                </span>
              </td>
              <td className="p-4">{stock.priority}</td>
              <td className="p-4 text-slate-300">{stock.latest_update}</td>
              <td className="p-4">
                <DeleteButton id={stock.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
