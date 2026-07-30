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
      price: typeof data.c === "number" && data.c !== 0 ? data.c : null,
      changePct: typeof data.dp === "number" && data.c !== 0 ? data.dp : null,
    };
  } catch {
    return { price: null, changePct: null };
  }
}

// Finnhub has no futures asset class at all — /futures/* endpoints don't exist
// (unlike /forex/* and /crypto/*), symbol search returns nothing for "E-mini",
// and /quote answers c:0 for every ES format. Their free S&P futures tick dataset
// is a static 2000-2019 Kaggle dump, not an API. So the front-month E-mini comes
// from Yahoo's chart endpoint instead.
//
// That endpoint is unofficial and unsupported, so every failure path returns
// nulls: the banner already gates the futures line on a non-null price, meaning
// a breakage degrades to simply omitting it rather than erroring.
async function fetchSpFutures(): Promise<IndexQuote> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/ES=F?range=1d&interval=1d",
      {
        next: { revalidate: 300 },
        // Yahoo rejects requests without a browser-like agent.
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    if (!res.ok) return { price: null, changePct: null };
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prevClose =
      typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    if (price === null || prevClose === null || prevClose === 0) {
      return { price, changePct: null };
    }
    return { price, changePct: ((price - prevClose) / prevClose) * 100 };
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
  const [results, yields, futures] = await Promise.all([
    Promise.allSettled(INDICES.map((idx) => fetchIndexQuote(idx.ticker))),
    fetchTreasuryYields(),
    fetchSpFutures(),
  ]);

  const indices = INDICES.map((idx, i) => {
    const quote = results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<IndexQuote>).value
      : { price: null, changePct: null };
    return { ...idx, price: quote.price, changePct: quote.changePct };
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">

      {/* Left: title + clock stacked */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-accent">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          <h1 className="font-serif text-2xl italic tracking-wide text-foreground">
            Ben&apos;s Investment Research
          </h1>
        </div>
        <MarketClock />
      </div>

      {/* Right: market data centered between title and clock */}
      <div className="flex flex-wrap items-center gap-4">
        {indices.map(({ label, ticker, price, changePct }) => {
          const color = changePct === null ? "text-muted-foreground" : changePct >= 0 ? "text-accent" : "text-destructive";
          const formattedPct = changePct === null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
          const formattedPrice = price === null ? "—" : `$${price.toFixed(2)}`;
          const futColor = futures.changePct === null ? "text-muted-foreground" : futures.changePct >= 0 ? "text-accent" : "text-destructive";
          return (
            <div key={label} className="text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{formattedPrice}</p>
              <p className={`text-xs tabular-nums ${color}`}>{formattedPct}</p>
              {ticker === "SPY" && futures.price !== null && (
                <p className={`text-xs tabular-nums ${futColor}`}>
                  Fut {futures.price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {futures.changePct !== null && ` (${futures.changePct >= 0 ? "+" : ""}${futures.changePct.toFixed(2)}%)`}
                </p>
              )}
            </div>
          );
        })}

        <div className="h-6 w-px bg-border" />

        {[
          { label: "2Y", value: yields.twoYear, bps: yields.twoYearBps },
          { label: "10Y", value: yields.tenYear, bps: yields.tenYearBps },
        ].map(({ label, value, bps }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-muted-foreground">{label} Yield</p>
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {value === null ? "—" : `${value.toFixed(2)}%`}
              {bps !== null && (
                <span className={`ml-1 text-xs ${bps >= 0 ? "text-destructive" : "text-accent"}`}>
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
