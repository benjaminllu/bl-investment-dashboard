import StockTable from "@/components/StockTable";

const watchlist = [
  {
    ticker: "RELY",
    company: "Remitly",
    priority: "High",
    thesis: "Cross-border payments compounder with margin expansion potential.",
    latestUpdate: "Revenue growth remains strong; watch customer acquisition costs.",
  },
  {
    ticker: "FOUR",
    company: "Shift4",
    priority: "Medium",
    thesis: "Payments platform expanding beyond restaurants into larger verticals.",
    latestUpdate: "Monitor Global Blue integration and enterprise growth.",
  },
  {
    ticker: "TOST",
    company: "Toast",
    priority: "Medium",
    thesis: "Restaurant software/payments ecosystem with strong retention.",
    latestUpdate: "Need to compare growth quality versus valuation.",
  },
];

async function fetchQuote(ticker: string): Promise<{ price: number; changePct: number }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: 0, changePct: 0 };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return { price: data.c ?? 0, changePct: data.dp ?? 0 };
  } catch {
    return { price: 0, changePct: 0 };
  }
}

export default async function Home() {
  const stocks = await Promise.all(
    watchlist.map(async (stock) => {
      const { price, changePct } = await fetchQuote(stock.ticker);
      return { ...stock, price, changePct };
    })
  );

  const validPrices = stocks.filter((s) => s.price > 0);
  const avgMove =
    validPrices.length > 0
      ? (validPrices.reduce((sum, s) => sum + s.changePct, 0) / validPrices.length).toFixed(1)
      : "—";

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
              {stocks.filter((s) => s.priority === "High").length}
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Avg 1D Move</p>
            <p className="mt-2 text-2xl font-semibold">{avgMove}%</p>
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
