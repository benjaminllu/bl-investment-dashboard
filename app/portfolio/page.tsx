import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import PortfolioSection, {
  CASH_TICKER,
  isUsd,
  money,
  usd,
  type EnrichedPosition,
  type PortfolioPosition,
} from "@/components/PortfolioSection";
import PortfolioPanel from "@/components/PortfolioPanel";
import { computeAnalytics, type AnalyticsPosition } from "@/lib/portfolioAnalytics";
import { computeWindow, dailyRiskFree, type WindowMetrics } from "@/lib/riskMetrics";
import { alignWindow, reconstructSeries, type PriceRow } from "@/lib/returnSeries";

const BENCHMARK = "SPY";

/** 1M is deliberately absent: 21 observations is too few for Sharpe to mean anything. */
const RISK_WINDOWS: [string, number][] = [
  ["3M", 63],
  ["6M", 126],
  ["1Y", 252],
];

/** A year of trading days plus slack for holidays and weekends. */
const HISTORY_LOOKBACK_DAYS = 400;

/**
 * Module-level so the clock read is not an impure call during render — the same
 * reason isPriceStale below is not inlined.
 */
function historyStartDate(): string {
  return new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 86_400_000).toISOString().split("T")[0];
}

/**
 * PostgREST caps a response at 1000 rows. Paging through explicitly rather than
 * taking the first page — a silently truncated series would still compute, just
 * on a fraction of the history, which is the worst kind of wrong.
 *
 * `volume` is deliberately not selected: the column is populated for a future
 * days-to-liquidate metric, but nothing reads it yet and it is ~20% of the
 * payload of the largest query on the page.
 */
async function fetchPriceHistory(since: string): Promise<PriceRow[]> {
  const PAGE = 1000;
  const out: PriceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("price_history")
      .select("ticker, date, close")
      .gte("date", since)
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[portfolio] price_history query failed (${error.code}): ${error.message}`);
      return [];
    }
    out.push(...((data ?? []) as PriceRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Cached for an hour, because this is by far the heaviest read on the page:
 * ~15,000 rows over 16 PostgREST round trips. The rest of the page revalidates
 * every 5 minutes so quotes stay current, and a route-level `revalidate` cannot
 * help here — Next takes the minimum of the segment config and any child fetch,
 * and the market banner in the root layout fetches at 300s.
 *
 * Left uncached it would be ~5.9 GB/month of Supabase egress in the worst case,
 * against a 5 GB free-tier ceiling, to re-read daily closes that change once a
 * day.
 *
 * `unstable_cache` rather than the `use cache` directive that supersedes it in
 * Next 16: `use cache` requires opting into Cache Components, which removes
 * route-segment `revalidate` and changes the caching model for every other page
 * in the project.
 */
const getCachedPriceHistory = unstable_cache(
  async (since: string) => fetchPriceHistory(since),
  ["portfolio-price-history"],
  { revalidate: 3600 }
);

type Portfolio = {
  slot: number;
  label: string;
  broker: string | null;
};

const SLOTS = [1, 2, 3, 4, 5];

/** Quotes older than this are flagged rather than shown as if they were live. */
const STALE_PRICE_MS = 24 * 60 * 60 * 1000;

/**
 * Kept out of the component body so the clock read is not an impure call during
 * render — the same reason timeAgo/relativeAge are module-level helpers.
 */
function isPriceStale(updatedAt: string | null): boolean {
  if (updatedAt === null) return false;
  const ms = new Date(updatedAt).getTime();
  return Number.isFinite(ms) && Date.now() - ms > STALE_PRICE_MS;
}

export default async function PortfolioPage() {
  const [{ data: portfolios, error: portfoliosError }, { data: positions, error: positionsError }] =
    await Promise.all([
      supabase.from("portfolios").select("slot, label, broker").order("slot", { ascending: true }),
      supabase
        .from("portfolio_positions")
        .select("slot, ticker, company, quantity, avg_cost, currency, account, imported_at")
        .order("ticker", { ascending: true }),
    ]);

  // A failed query is not the same as an empty portfolio and must not render as
  // one — if the tables have not been created yet, "no positions" would be a
  // claim about holdings produced by a query that never ran.
  const error = portfoliosError ?? positionsError;
  if (error) {
    console.error(`[portfolio] query failed (${error.code}): ${error.message}`);
  }

  const rows = error ? [] : ((positions ?? []) as (PortfolioPosition & { slot: number })[]);

  type Characteristics = {
    sector: string | null;
    market_cap: number | null;
    market_cap_currency: string | null;
    beta: number | null;
    price_to_book: number | null;
    volatility_3m: number | null;
    return_52w: number | null;
    roe_ttm: number | null;
    forward_pe: number | null;
  };

  const quoteMap = new Map<string, { price: number; updatedAt: string | null }>();
  const factMap = new Map<string, Characteristics>();
  // Distinguished from "no rows": if the exposure columns do not exist yet the
  // panel must say so rather than render empty charts, which would read as
  // "you have no sector exposure".
  let fundamentalsUnavailable = false;

  if (rows.length > 0) {
    const tickers = [...new Set(rows.map((r) => r.ticker))];
    const [{ data: quotes }, { data: facts, error: factsError }] = await Promise.all([
      supabase.from("stock_quotes").select("ticker, price, updated_at").in("ticker", tickers),
      supabase
        .from("stock_fundamentals")
        .select(
          "ticker, sector, market_cap, market_cap_currency, beta, price_to_book, volatility_3m, return_52w, roe_ttm, forward_pe"
        )
        .in("ticker", tickers),
    ]);

    for (const q of quotes ?? []) {
      if (typeof q.price === "number") {
        quoteMap.set(q.ticker, { price: q.price, updatedAt: q.updated_at ?? null });
      }
    }

    if (factsError) {
      // 42703 is "column does not exist" — the migration has not been run.
      console.error(`[portfolio] fundamentals query failed (${factsError.code}): ${factsError.message}`);
      fundamentalsUnavailable = true;
    }
    for (const f of facts ?? []) {
      factMap.set(f.ticker, f as Characteristics);
    }
  }

  const bySlot = new Map<number, EnrichedPosition[]>();
  for (const p of rows) {
    const isCash = p.ticker === CASH_TICKER;
    // Named to avoid shadowing the imported usd() currency formatter.
    const inUsd = isUsd(p.currency);

    // Cash counts toward Value but has no price and no unrealized P&L, so it is
    // valued directly off the stored balance rather than through a quote
    // lookup that would never match.
    const quote = isCash || !inUsd ? null : quoteMap.get(p.ticker) ?? null;
    const price = quote?.price ?? null;
    const marketValue = isCash ? p.quantity : price !== null ? price * p.quantity : null;
    const costBasis =
      !isCash && inUsd && p.avg_cost !== null ? p.avg_cost * p.quantity : null;
    const pnl =
      isCash || marketValue === null || costBasis === null ? null : marketValue - costBasis;
    const pnlPct = pnl !== null && costBasis ? (pnl / costBasis) * 100 : null;

    // A missing price announces itself as an em-dash; a frozen one does not, so
    // it has to be called out. The refresh job runs roughly hourly (GitHub
    // throttles the cron, sometimes to ~3 hours), so a full day of silence means
    // something is actually wrong rather than merely late.
    const priceStale = price !== null && isPriceStale(quote?.updatedAt ?? null);

    const enriched: EnrichedPosition = {
      ...p,
      usd: inUsd,
      isCash,
      price,
      priceUpdatedAt: quote?.updatedAt ?? null,
      priceStale,
      marketValue,
      pnl,
      pnlPct,
    };
    bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), enriched]);
  }

  // Cash sorts last. The query orders by ticker, and "$CASH" would otherwise
  // lead every table since "$" sorts ahead of the letters.
  for (const list of bySlot.values()) {
    list.sort((a, b) =>
      a.isCash === b.isCash ? a.ticker.localeCompare(b.ticker) : a.isCash ? 1 : -1
    );
  }

  const labelBySlot = new Map<number, Portfolio>(
    ((portfolios ?? []) as Portfolio[]).map((p) => [p.slot, p])
  );

  const allPositions = [...bySlot.values()].flat();
  const combinedValue = allPositions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const combinedPnl = allPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const filledSlots = SLOTS.filter((s) => (bySlot.get(s) ?? []).length > 0).length;

  // The panel aggregates across every slot: "what am I exposed to" is a
  // question about the whole book, which no single section can answer.
  const analytics = computeAnalytics(
    allPositions.map((p): AnalyticsPosition => {
      const f = factMap.get(p.ticker);
      const costBasis =
        p.marketValue !== null && p.pnl !== null ? p.marketValue - p.pnl : null;
      return {
        ticker: p.ticker,
        isCash: p.isCash,
        marketValue: p.marketValue,
        costBasis,
        pnl: p.pnl,
        sector: f?.sector ?? null,
        marketCap: f?.market_cap ?? null,
        marketCapCurrency: f?.market_cap_currency ?? null,
        beta: f?.beta ?? null,
        priceToBook: f?.price_to_book ?? null,
        volatility3m: f?.volatility_3m ?? null,
        return52w: f?.return_52w ?? null,
        roeTtm: f?.roe_ttm ?? null,
        forwardPe: f?.forward_pe ?? null,
      };
    })
  );

  // --- Risk-adjusted return windows -------------------------------------
  // Reconstructed from today's share counts over past closes, which is a
  // backtest of the current book rather than a track record: positions since
  // sold are absent. Labelled as such in the panel; portfolio_snapshots
  // accumulates the honest version forward.
  const since = historyStartDate();

  const [priceRows, { data: rateRows }, { count: snapshotCount }] = await Promise.all([
    allPositions.length > 0 ? getCachedPriceHistory(since) : Promise.resolve([] as PriceRow[]),
    supabase.from("risk_free_rates").select("date, annual_pct").gte("date", since),
    supabase.from("portfolio_snapshots").select("date", { count: "exact", head: true }),
  ]);

  const benchmarkRows = priceRows.filter((p) => p.ticker === BENCHMARK);
  const calendar = benchmarkRows.map((r) => r.date);
  const benchmarkByDate = new Map(benchmarkRows.map((r) => [r.date, r.close]));
  const riskFreeByDate = new Map(
    (rateRows ?? []).map((r) => [r.date as string, dailyRiskFree(r.annual_pct as number)])
  );

  const holdingQuantities = allPositions
    .filter((p) => !p.isCash && p.usd && p.marketValue !== null)
    .map((p) => ({
      ticker: p.ticker,
      quantity: p.quantity,
      marketValue: p.marketValue as number,
    }));

  const riskWindows: { metrics: WindowMetrics; coveragePct: number; covered: number; total: number }[] =
    [];
  if (benchmarkRows.length > 0 && holdingQuantities.length > 0) {
    for (const [label, days] of RISK_WINDOWS) {
      const series = reconstructSeries(priceRows, holdingQuantities, days, calendar);
      const aligned = alignWindow(series, benchmarkByDate, riskFreeByDate);
      if (!aligned) continue;
      riskWindows.push({
        metrics: computeWindow(label, aligned.portfolio, aligned.benchmark, aligned.riskFree),
        coveragePct: series.coveragePct,
        covered: series.covered,
        total: series.total,
      });
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          {filledSlots > 0 && (
            <p className="text-xs text-muted-foreground">
              {filledSlots} of {SLOTS.length} slots in use
            </p>
          )}
        </div>

        {error ? (
          <div className="rounded-xl bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Positions could not be loaded, so this is not a statement about what you hold. If the{" "}
              <code className="text-muted-foreground/80">portfolios</code> and{" "}
              <code className="text-muted-foreground/80">portfolio_positions</code> tables do not
              exist yet, create them by running{" "}
              <code className="text-muted-foreground/80">scripts/portfolio-positions-table.sql</code>{" "}
              in the Supabase SQL editor. See{" "}
              <code className="text-muted-foreground/80">PORTFOLIO.md</code> for the full import
              instructions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPositions.length > 0 && (
              <div className="flex flex-wrap gap-4">
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Combined Value</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {usd(combinedValue)}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Combined Unrealized P&amp;L</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${combinedPnl >= 0 ? "text-accent" : "text-destructive"}`}
                  >
                    {combinedPnl >= 0 ? "+" : "−"}${money(Math.abs(combinedPnl))}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Positions</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {allPositions.length}
                  </p>
                </div>
              </div>
            )}

            <PortfolioPanel
              analytics={analytics}
              fundamentalsUnavailable={fundamentalsUnavailable}
              riskWindows={riskWindows}
              trackRecordDays={snapshotCount ?? 0}
            />

            {/* All five slots always render, so the layout is stable whether one
                portfolio is loaded or five. */}
            {SLOTS.map((slot) => (
              <PortfolioSection
                key={slot}
                label={labelBySlot.get(slot)?.label ?? `Portfolio ${slot}`}
                broker={labelBySlot.get(slot)?.broker ?? null}
                positions={bySlot.get(slot) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
