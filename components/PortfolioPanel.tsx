import DonutChart from "@/components/DonutChart";
import { money, usd } from "@/components/PortfolioSection";
import type { PortfolioAnalytics, Weighted } from "@/lib/portfolioAnalytics";
import type { WindowMetrics } from "@/lib/riskMetrics";

/**
 * Whole-book exposure and risk, sitting above the per-slot tables.
 *
 * Everything here aggregates across all five slots: the question this panel
 * answers is "what am I actually exposed to", which no individual portfolio
 * section can answer on its own.
 */

/** Below this, an average is annotated with the share of the book it covers. */
const COVERAGE_NOTE_THRESHOLD = 95;

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "signed-positive" | "signed-negative";
  title?: string;
}) {
  const toneClass =
    tone === "signed-positive"
      ? "text-accent"
      : tone === "signed-negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div title={title}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{heading}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

/** "88% of value" — only worth saying when the average misses a real slice of the book. */
function coverageSub(w: Weighted): string | undefined {
  if (w.value === null) return undefined;
  if (w.coveragePct >= COVERAGE_NOTE_THRESHOLD) return undefined;
  return `${w.coveragePct.toFixed(0)}% of value`;
}

/**
 * Negatives use the typographic minus, not the hyphen toFixed would emit —
 * otherwise "-35%" sits next to "−$885.05" in the same card, which reads as a
 * typo. Matches usd() in PortfolioSection.
 */
function pct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}

function signedPct(v: number | null, digits = 1): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

function toneOf(v: number | null): "neutral" | "signed-positive" | "signed-negative" {
  if (v === null) return "neutral";
  return v >= 0 ? "signed-positive" : "signed-negative";
}

/**
 * Plain number with the typographic minus. toFixed emits a hyphen, which sits
 * badly beside the "−36.5%" produced by pct() one row above it in the same
 * table.
 */
function num(v: number | null, digits = 2): string {
  if (v === null) return "—";
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

export type RiskWindowView = {
  metrics: WindowMetrics;
  coveragePct: number;
  covered: number;
  total: number;
};

/** A row of the windows table: label, how to render, and what it means. */
const RISK_ROWS: {
  label: string;
  render: (m: WindowMetrics) => string;
  tone?: (m: WindowMetrics) => "neutral" | "signed-positive" | "signed-negative";
  title?: string;
}[] = [
  {
    label: "Ann. return",
    render: (m) => signedPct(m.annualizedReturn === null ? null : m.annualizedReturn * 100, 1),
    tone: (m) => toneOf(m.annualizedReturn),
    title: "Geometric, annualised. Simulated on current holdings — see the note below.",
  },
  {
    label: "Ann. volatility",
    render: (m) => pct(m.annualizedVol === null ? null : m.annualizedVol * 100, 1),
    title: "Realised standard deviation of the reconstructed daily series, annualised. Unlike the weighted constituent figure above, this one accounts for correlation.",
  },
  {
    label: "Sharpe",
    render: (m) =>
      m.sharpe === null
        ? "—"
        : `${num(m.sharpe)}${m.sharpeStdErr === null ? "" : ` ±${num(m.sharpeStdErr)}`}`,
    tone: (m) => toneOf(m.sharpe),
    title: "Excess return per unit of volatility, annualised, against the 3-month T-bill. The ± is the Lo (2002) standard error — at one year of daily data it is around ±1.0, so treat small differences as noise.",
  },
  {
    label: "Sortino",
    render: (m) => num(m.sortino),
    tone: (m) => toneOf(m.sortino),
    title: "As Sharpe, but only downside deviation in the denominator — upside volatility is not penalised.",
  },
  {
    label: "Max drawdown",
    render: (m) => pct(m.maxDrawdown === null ? null : m.maxDrawdown * 100, 1),
    tone: () => "signed-negative",
    title: "Worst peak-to-trough decline within the window.",
  },
  {
    label: "Calmar",
    render: (m) => num(m.calmar),
    tone: (m) => toneOf(m.calmar),
    title: "Annualised return divided by the worst drawdown.",
  },
  {
    label: "Alpha (ann.)",
    render: (m) => signedPct(m.alpha === null ? null : m.alpha * 100, 1),
    tone: (m) => toneOf(m.alpha),
    title: "Jensen's alpha vs SPY: return beyond what this beta alone would have delivered. The metric that asks whether the leverage is earning its keep.",
  },
  {
    label: "Beta (realised)",
    render: (m) => num(m.beta),
    title: "Regressed from the book's own returns, unlike the bottom-up weighted average above. The two disagreeing is informative — published betas use different windows and indices.",
  },
  {
    label: "R²",
    render: (m) => num(m.rSquared),
    title: "Share of the book's variance explained by SPY. The rest is idiosyncratic.",
  },
  {
    label: "Up capture",
    render: (m) => (m.upCapture === null ? "—" : `${num(m.upCapture, 0)}%`),
    title: "Share of the benchmark's average gain captured on its up days.",
  },
  {
    label: "Down capture",
    render: (m) => (m.downCapture === null ? "—" : `${num(m.downCapture, 0)}%`),
    title: "Share of the benchmark's average loss taken on its down days. Compare against up capture: similar numbers mean leverage, a lower down number means genuine convexity.",
  },
  {
    label: "Info ratio",
    render: (m) => num(m.informationRatio),
    tone: (m) => toneOf(m.informationRatio),
    title: "Active return vs SPY per unit of tracking error.",
  },
];

export default function PortfolioPanel({
  analytics,
  fundamentalsUnavailable,
  riskWindows = [],
  trackRecordDays = 0,
}: {
  analytics: PortfolioAnalytics;
  /** The characteristics query failed, so blank charts would be a lie. */
  fundamentalsUnavailable?: boolean;
  riskWindows?: RiskWindowView[];
  /** Days of real snapshots recorded, as opposed to reconstructed history. */
  trackRecordDays?: number;
}) {
  const a = analytics;

  if (a.positionCount === 0) {
    return null;
  }

  const sizeCaveat =
    a.nonUsdMarketCaps > 0
      ? ` ${a.nonUsdMarketCaps} market cap${a.nonUsdMarketCaps === 1 ? " is" : "s are"} reported in a non-USD currency, so those size buckets are approximate.`
      : "";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">Exposure &amp; Risk</h2>
        <p className="text-xs text-muted-foreground">
          Across all portfolios · {usd(a.securityValue)} in {a.positionCount} securities
        </p>
      </div>

      {fundamentalsUnavailable ? (
        <div className="rounded-xl bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Exposure data could not be loaded, so this is not a statement about what you are
            exposed to. If <code className="text-muted-foreground/80">stock_fundamentals</code> is
            missing its characteristic columns, add them by running{" "}
            <code className="text-muted-foreground/80">
              scripts/stock-fundamentals-add-exposure.sql
            </code>{" "}
            in the Supabase SQL editor, then re-run{" "}
            <code className="text-muted-foreground/80">node scripts/refresh-fundamentals.js</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <DonutChart
              title="Factor Exposure"
              slices={a.factors}
              footnote={
                "Size crossed with value/growth, weighted by market value. Style is inferred from " +
                "price-to-book alone, so it is a proxy rather than an index methodology; a name " +
                "missing either axis is left Unclassified rather than assumed to be Blend." +
                sizeCaveat
              }
              emptyMessage="No holdings have both a market cap and a book value."
            />
            <DonutChart
              title="Sector Exposure"
              slices={a.sectors}
              footnote={
                "Finnhub's own industry taxonomy, weighted by market value. Cash is excluded — " +
                "it is reported separately under Risk."
              }
              emptyMessage="No holdings have a sector classification."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Group heading="Concentration">
              <Metric
                label="Largest position"
                value={pct(a.largestPositionPct)}
                sub={a.largestPositionTicker ?? undefined}
              />
              <Metric label="Top 5" value={pct(a.top5Pct)} sub={`of ${a.positionCount} holdings`} />
              <Metric
                label="Effective holdings"
                value={a.effectiveHoldings === null ? "—" : a.effectiveHoldings.toFixed(1)}
                sub={`of ${a.positionCount} held`}
                title="Herfindahl-based: the number of equally sized positions that would give the same concentration."
              />
              <Metric
                label="Effective sectors"
                value={a.effectiveSectors === null ? "—" : a.effectiveSectors.toFixed(1)}
                sub={`of ${a.namedSectorCount} held`}
                title="Same measure applied to sector weights rather than position weights, over identified sectors only — unclassified holdings are excluded rather than counted as a sector of their own."
              />
            </Group>

            <Group heading="Risk">
              <Metric
                label="Portfolio beta"
                value={num(a.beta.value)}
                sub={coverageSub(a.beta) ?? "vs market"}
                title="Value-weighted. Beta is linear in weights, so this is the portfolio's beta exactly, not an approximation."
              />
              <Metric
                label="Wtd constituent vol"
                value={pct(a.volatility.value, 0)}
                sub={coverageSub(a.volatility) ?? "annualised"}
                title="The weighted average of each holding's own volatility — NOT portfolio volatility, which would need a correlation matrix. Overstates the true figure to the extent holdings move independently."
              />
              <Metric label="Cash" value={pct(a.cashPct)} sub={usd(a.cashValue)} />
              <Metric label="Largest sector" value={pct(a.largestSectorPct)} sub={a.largestSectorLabel ?? undefined} />
            </Group>

            <Group heading="Performance">
              <Metric
                label="Unrealized return"
                value={signedPct(a.totalReturnPct)}
                sub={`${a.totalPnl >= 0 ? "+" : "−"}$${money(Math.abs(a.totalPnl))}`}
                tone={toneOf(a.totalReturnPct)}
              />
              <Metric
                label="12m momentum"
                value={signedPct(a.momentum.value, 0)}
                sub={coverageSub(a.momentum) ?? "weighted"}
                tone={toneOf(a.momentum.value)}
                title="Value-weighted 52-week price return of the holdings as they stand today — not the return this portfolio earned, since it takes no account of when each position was opened."
              />
              <Metric
                label="Winners"
                value={`${a.winners}`}
                sub={`of ${a.winners + a.losers} priced`}
                tone={a.winners > 0 ? "signed-positive" : "neutral"}
              />
              <Metric
                label="Losers"
                value={`${a.losers}`}
                sub={`of ${a.winners + a.losers} priced`}
                tone={a.losers > 0 ? "signed-negative" : "neutral"}
              />
            </Group>

            <Group heading="Fundamentals">
              <Metric
                label="Wtd ROE"
                value={pct(a.roe.value, 0)}
                sub={coverageSub(a.roe) ?? "trailing 12m"}
                tone={toneOf(a.roe.value)}
              />
              <Metric
                label="Fwd P/E"
                value={a.forwardPe.value === null ? "—" : a.forwardPe.value.toFixed(1)}
                sub={coverageSub(a.forwardPe) ?? "harmonic"}
                title="Weighted harmonic mean — total price over total earnings, which is what a portfolio P/E means. Loss-making holdings are excluded rather than averaged in as negatives."
              />
              <Metric
                label="Unprofitable"
                value={pct(a.unprofitablePct, 0)}
                sub="of value, by ROE"
                tone={a.unprofitablePct !== null && a.unprofitablePct > 50 ? "signed-negative" : "neutral"}
              />
              <Metric
                label="Holdings priced"
                value={`${a.positionCount}`}
                sub={a.cashValue !== 0 ? "excl. cash" : undefined}
              />
            </Group>
          </div>

          {riskWindows.length > 0 && (
            <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
              <div className="overflow-hidden rounded-xl bg-card p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Risk-Adjusted Return{" "}
                    <span className="font-normal text-warning">· simulated</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">vs SPY · excess of 3m T-bill</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-100 text-left text-sm">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="pb-1 pr-2 text-xs font-normal">Metric</th>
                        {riskWindows.map((w) => (
                          <th
                            key={w.metrics.label}
                            className="pb-1 pl-2 text-right text-xs font-semibold text-foreground"
                          >
                            {w.metrics.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RISK_ROWS.map((row) => (
                        <tr key={row.label} className="border-t border-border">
                          <td
                            className="py-1 pr-2 text-xs text-muted-foreground"
                            title={row.title}
                          >
                            {row.label}
                          </td>
                          {riskWindows.map((w) => {
                            const tone = row.tone?.(w.metrics) ?? "neutral";
                            return (
                              <td
                                key={w.metrics.label}
                                className={`py-1 pl-2 text-right tabular-nums ${
                                  tone === "signed-positive"
                                    ? "text-accent"
                                    : tone === "signed-negative"
                                      ? "text-destructive"
                                      : "text-foreground"
                                }`}
                              >
                                {row.render(w.metrics)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="border-t border-border">
                        <td className="py-1 pr-2 text-xs text-muted-foreground">Coverage</td>
                        {riskWindows.map((w) => (
                          <td
                            key={w.metrics.label}
                            className="py-1 pl-2 text-right text-xs tabular-nums text-muted-foreground"
                            title={`${w.covered} of ${w.total} holdings have a full price history over this window; the rest are excluded from the series.`}
                          >
                            {w.coveragePct.toFixed(0)}%
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* The single most important caveat on this card, so it is not
                    a tooltip. */}
                <p className="mt-3 text-xs text-warning">
                  Simulated on today&apos;s holdings valued over past prices — not a track
                  record.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Positions since sold are absent, so the return figures inherit hindsight and
                  read better than what was actually earned. Volatility, beta, R² and capture
                  describe the book you hold now and are unaffected.{" "}
                  {trackRecordDays === 0
                    ? "No real snapshots recorded yet."
                    : `Real track record so far: ${trackRecordDays} day${trackRecordDays === 1 ? "" : "s"} recorded.`}
                </p>
              </div>

              <div className="rounded-xl bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Beta Contribution
                </h3>
                <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  <Metric
                    label="Gross exposure"
                    value={pct(a.grossExposurePct, 1)}
                    sub={a.grossExposurePct > 100 ? "margin in use" : "unlevered"}
                    title="Securities as a share of net asset value. Above 100% means borrowed money is at work — a margin debit is negative cash, so NAV is smaller than the securities held against it."
                  />
                  <Metric
                    label="Bottom-up beta"
                    value={a.beta.value === null ? "—" : a.beta.value.toFixed(2)}
                    sub="sum of contributions"
                  />
                </div>

                {/* Weight and beta contribution diverge sharply, and only the
                    latter says where the market risk actually comes from. */}
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-1 font-normal">Top contributors</th>
                      <th className="pb-1 text-right font-normal">Wt</th>
                      <th className="pb-1 text-right font-normal">β</th>
                      <th className="pb-1 text-right font-normal">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.betaContributors.slice(0, 6).map((c) => (
                      <tr key={c.ticker} className="border-t border-border">
                        <td className="truncate py-1 pr-2 font-semibold text-foreground">
                          {c.ticker}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {c.weightPct.toFixed(1)}%
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">
                          {c.beta.toFixed(2)}
                        </td>
                        <td className="py-1 text-right tabular-nums text-foreground">
                          {c.sharePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  wᵢ × βᵢ, which sums to portfolio beta exactly. Share is of the beta
                  accounted for, so it totals 100% even where a holding has no published beta.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
