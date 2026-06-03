import StockTable from "@/components/StockTable";

const stocks = [
  {
    ticker: "RMLY",
    company: "Remitly",
    price: 18.42,
    changePct: 2.1,
    priority: "High",
    thesis: "Cross-border payments compounder with margin expansion potential.",
    latestUpdate: "Revenue growth remains strong; watch customer acquisition costs.",
  },
  {
    ticker: "FOUR",
    company: "Shift4",
    price: 72.15,
    changePct: -1.4,
    priority: "Medium", 
    thesis: "Payments platform expanding beyond restaurants into larger verticals.",
    latestUpdate: "Monitor Global Blue integration and enterprise growth.",
  },
  {
    ticker: "TOST",
    company: "Toast",
    price: 24.8,
    changePct: 0.7,
    priority: "Medium",
    thesis: "Restaurant software/payments ecosystem with strong retention.",
    latestUpdate: "Need to compare growth quality versus valuation.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl p-6">
        <h1 className="text-3xl font-bold">Investment Dashboard</h1>
        <p className="mt-2 text-slate-400">
          Track watchlist changes, thesis notes, and priority signals.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Watchlist</p>
            <p className="mt-2 text-2xl font-semibold">{stocks.length}</p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400">High Priority</p>
            <p className="mt-2 text-2xl font-semibold">
              {stocks.filter((stock) => stock.priority === "High").length}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Avg 1D Move</p>
            <p className="mt-2 text-2xl font-semibold">
              {(
                stocks.reduce((sum, stock) => sum + stock.changePct, 0) /
                stocks.length
              ).toFixed(1)}
              %
            </p>
          </div>
        </div>

        <StockTable stocks={stocks} />

        <div className="mt-6 rounded-xl bg-slate-900 p-4">
          <h2 className="text-xl font-semibold">Selected Thesis</h2>
          <p className="mt-2 text-slate-300">{stocks[0].thesis}</p>
        </div>
      </div>
    </main>
  );
}