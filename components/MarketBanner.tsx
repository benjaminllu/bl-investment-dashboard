import MarketClock from "./MarketClock";

const INDICES = [
  { label: "S&P 500", ticker: "SPY" },
  { label: "NASDAQ", ticker: "QQQ" },
  { label: "DOW", ticker: "DIA" },
  { label: "Russell 2000", ticker: "IWM" },
];

async function fetchIndexQuote(ticker: string): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return typeof data.dp === "number" ? data.dp : null;
  } catch {
    return null;
  }
}

export default async function MarketBanner() {
  const results = await Promise.allSettled(
    INDICES.map((idx) => fetchIndexQuote(idx.ticker))
  );

  const indices = INDICES.map((idx, i) => {
    const changePct =
      results[i].status === "fulfilled" ? results[i].value : null;
    return { ...idx, changePct };
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <MarketClock />
      <div className="flex flex-wrap gap-6">
        {indices.map(({ label, changePct }) => {
          const color =
            changePct === null
              ? "text-slate-400"
              : changePct >= 0
              ? "text-green-400"
              : "text-red-400";
          const formatted =
            changePct === null
              ? "—"
              : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;

          return (
            <div key={label} className="text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`text-sm font-semibold ${color}`}>{formatted}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
