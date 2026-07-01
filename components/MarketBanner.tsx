import MarketClock from "./MarketClock";

const INDICES = [
  { label: "S&P 500", ticker: "SPY" },
  { label: "NASDAQ", ticker: "QQQ" },
  { label: "DOW", ticker: "DIA" },
  { label: "Russell 2000", ticker: "IWM" },
  { label: "Gold", ticker: "GLD" },
  { label: "Oil", ticker: "USO" },
  { label: "Copper", ticker: "CPER" },
];

interface YieldData {
  twoYear: number | null;
  tenYear: number | null;
  twoYearBps: number | null;
  tenYearBps: number | null;
}

interface IndexQuote {
  price: number | null;
  changePct: number | null;
}

async function fetchIndexQuote(ticker: string): Promise<IndexQuote> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: null, changePct: null };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return {
      price: typeof data.c === "number" ? data.c : null,
      changePct: typeof data.dp === "number" ? data.dp : null,
    };
  } catch {
    return { price: null, changePct: null };
  }
}

async function fetchTreasuryYields(): Promise<YieldData> {
  const empty: YieldData = { twoYear: null, tenYear: null, twoYearBps: null, tenYearBps: null };
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return empty;
    const csv = await res.text();

    const rows = csv
      .trim()
      .split("\n")
      .map((line) => line.split(",").map((cell) => cell.replace(/"/g, "").trim()));
    const [header, ...data] = rows;
    const twoIdx = header.indexOf("2 Yr");
    const tenIdx = header.indexOf("10 Yr");
    if (twoIdx === -1 || tenIdx === -1 || data.length === 0) return empty;

    const twoYear = parseFloat(data[0][twoIdx]);
    const tenYear = parseFloat(data[0][tenIdx]);
    if (isNaN(twoYear) || isNaN(tenYear)) return empty;

    const prevTwoYear = data.length >= 2 ? parseFloat(data[1][twoIdx]) : NaN;
    const prevTenYear = data.length >= 2 ? parseFloat(data[1][tenIdx]) : NaN;
    const twoYearBps = !isNaN(prevTwoYear) ? Math.round((twoYear - prevTwoYear) * 100) : null;
    const tenYearBps = !isNaN(prevTenYear) ? Math.round((tenYear - prevTenYear) * 100) : null;

    return { twoYear, tenYear, twoYearBps, tenYearBps };
  } catch {
    return empty;
  }
}

export default async function MarketBanner() {
  const [results, yields] = await Promise.all([
    Promise.allSettled(INDICES.map((idx) => fetchIndexQuote(idx.ticker))),
    fetchTreasuryYields(),
  ]);

  const indices = INDICES.map((idx, i) => {
    const quote = results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<IndexQuote>).value
      : { price: null, changePct: null };
    return { ...idx, price: quote.price, changePct: quote.changePct };
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <MarketClock />
      <div className="flex flex-wrap items-center gap-6">
        {indices.map(({ label, price, changePct }) => {
          const color = changePct === null ? "text-slate-400" : changePct >= 0 ? "text-green-400" : "text-red-400";
          const formattedPct = changePct === null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
          const formattedPrice = price === null ? "—" : `$${price.toFixed(2)}`;
          return (
            <div key={label} className="text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-white">{formattedPrice}</p>
              <p className={`text-xs ${color}`}>{formattedPct}</p>
            </div>
          );
        })}

        <div className="h-6 w-px bg-slate-700" />

        {[
          { label: "2Y", value: yields.twoYear, bps: yields.twoYearBps },
          { label: "10Y", value: yields.tenYear, bps: yields.tenYearBps },
        ].map(({ label, value, bps }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-slate-400">{label} Yield</p>
            <p className="text-sm font-semibold text-white">
              {value === null ? "—" : `${value.toFixed(2)}%`}
              {bps !== null && (
                <span className={`ml-1 text-xs ${bps >= 0 ? "text-red-400" : "text-green-400"}`}>
                  {bps >= 0 ? "+" : ""}{bps}bps
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
