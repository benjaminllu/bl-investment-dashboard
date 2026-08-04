/**
 * Prints the risk-adjusted return windows from live data, using the same lib
 * code the page does. A faster loop than rendering, and it keeps the numbers
 * checkable independently of the UI.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/previewRiskWindows.js
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { computeWindow, dailyRiskFree } from "../lib/riskMetrics";
import { reconstructSeries, alignWindow, type PriceRow } from "../lib/returnSeries";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const BENCHMARK = "SPY";
const WINDOWS: [string, number][] = [["3M", 63], ["6M", 126], ["1Y", 252]];

async function fetchAllPrices(): Promise<PriceRow[]> {
  // PostgREST caps a response at 1000 rows, so page through explicitly —
  // otherwise the series silently truncates and every metric is computed on a
  // fraction of the history.
  const out: PriceRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("price_history")
      .select("ticker, date, close, volume")
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as PriceRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

(async () => {
  const [prices, { data: positions }, { data: quotes }, { data: rates }] = await Promise.all([
    fetchAllPrices(),
    sb.from("portfolio_positions").select("ticker, quantity, currency"),
    sb.from("stock_quotes").select("ticker, price"),
    // Ordered descending and capped: DTB3 has ~1250 rows over 5 years, which
    // exceeds PostgREST's 1000-row default. Taking the first page unordered
    // silently dropped recent rates, and the carry-forward in alignWindow then
    // filled the gap with a stale value — which moved Sharpe by ~0.07 without
    // any visible failure.
    sb.from("risk_free_rates").select("date, annual_pct").order("date", { ascending: false }).limit(1000),
  ]);

  console.log(`price_history rows: ${prices.length}`);

  const priceOf = new Map((quotes ?? []).map((q) => [q.ticker, q.price as number]));
  const isUsd = (c: string | null) =>
    c === null || c === "" || String(c).toUpperCase() === "USD";

  const holdings = (positions ?? [])
    .filter((p) => p.ticker !== "$CASH" && !/\s/.test(p.ticker) && isUsd(p.currency))
    .map((p) => ({
      ticker: p.ticker as string,
      quantity: p.quantity as number,
      marketValue: (priceOf.get(p.ticker) ?? 0) * (p.quantity as number),
    }))
    .filter((h) => h.marketValue > 0);

  const benchRows = prices.filter((p) => p.ticker === BENCHMARK);
  const calendar = benchRows.map((r) => r.date);
  const benchByDate = new Map(benchRows.map((r) => [r.date, r.close]));
  const rfByDate = new Map(
    (rates ?? []).map((r) => [r.date as string, dailyRiskFree(r.annual_pct as number)])
  );

  console.log(`holdings: ${holdings.length}   benchmark bars: ${benchRows.length}\n`);

  for (const [label, days] of WINDOWS) {
    const series = reconstructSeries(prices, holdings, days, calendar);
    const aligned = alignWindow(series, benchByDate, rfByDate);
    if (!aligned) {
      console.log(`${label}: could not align\n`);
      continue;
    }
    const w = computeWindow(label, aligned.portfolio, aligned.benchmark, aligned.riskFree);
    const pct = (v: number | null, d = 1) => (v === null ? "—" : `${(v * 100).toFixed(d)}%`);
    const num = (v: number | null, d = 2) => (v === null ? "—" : v.toFixed(d));

    console.log(`=== ${label} — ${w.observations} obs, ${series.covered}/${series.total} holdings, ${series.coveragePct.toFixed(1)}% of value ===`);
    console.log(`  ann. return   ${pct(w.annualizedReturn)}      ann. vol      ${pct(w.annualizedVol)}`);
    console.log(`  Sharpe        ${num(w.sharpe)} ±${num(w.sharpeStdErr)}   Sortino       ${num(w.sortino)}`);
    console.log(`  max drawdown  ${pct(w.maxDrawdown)}      current DD    ${pct(w.currentDrawdown)}`);
    console.log(`  Calmar        ${num(w.calmar)}          under water   ${w.daysUnderWater}d`);
    console.log(`  alpha (ann.)  ${pct(w.alpha)}      beta          ${num(w.beta)}`);
    console.log(`  R²            ${num(w.rSquared)}         tracking err  ${pct(w.trackingError)}`);
    console.log(`  up capture    ${num(w.upCapture, 0)}%        down capture  ${num(w.downCapture, 0)}%`);
    console.log(`  info ratio    ${num(w.informationRatio)}\n`);
  }
})();
