/**
 * Risk-adjusted return statistics from a daily return series.
 *
 * Pure functions, no I/O, so every formula here can be replayed against a known
 * series by a script rather than only being seen through the page — the same
 * reason lib/riskStats.ts and lib/portfolioAnalytics.ts are separated from
 * their callers.
 *
 * All inputs are *simple daily returns* (0.01 = +1%), aligned so index i of
 * every array refers to the same trading day. Alignment is the caller's job;
 * these functions assume it and do not re-check, because silently intersecting
 * mismatched series is how a beta gets computed against the wrong days.
 */

export const TRADING_DAYS = 252;

/**
 * Below this many observations, nothing is reported at all. Not a statistical
 * threshold so much as a floor of decency: a Sharpe from two weeks of data is
 * noise wearing a number's clothes.
 */
export const MIN_OBSERVATIONS = 20;

/**
 * Dispersion below this counts as zero. An exact `=== 0` test does not hold:
 * a series of identical returns accumulates rounding into a stdev around 1e-19
 * rather than a true zero, and dividing by that yields ratios in the 1e16 range
 * instead of the "undefined" the caller needs to see.
 */
const NEAR_ZERO = 1e-12;

export function toReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(closes[i])) {
      out.push(closes[i] / prev - 1);
    }
  }
  return out;
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (n−1): these are samples, not populations. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Geometric, i.e. what the series actually compounded to, annualised. The
 * arithmetic mean overstates realised growth whenever returns vary — badly so
 * on a volatile book, which is exactly the case here.
 */
export function annualizedReturn(returns: number[]): number | null {
  if (returns.length === 0) return null;
  const growth = returns.reduce((g, r) => g * (1 + r), 1);
  if (growth <= 0) return null; // total loss; a geometric rate is undefined
  return growth ** (TRADING_DAYS / returns.length) - 1;
}

export function annualizedVol(returns: number[]): number | null {
  if (returns.length < 2) return null;
  return stdev(returns) * Math.sqrt(TRADING_DAYS);
}

/**
 * Sharpe on excess returns, annualised.
 *
 *   Sharpe = mean(excess) / sd(excess) × √252
 *
 * Note this is leverage-neutral: doubling every position leaves it unchanged
 * (before borrowing costs), which is what makes it a fair measure of a
 * high-beta book rather than a penalty on one.
 */
export function sharpe(excessReturns: number[]): number | null {
  if (excessReturns.length < MIN_OBSERVATIONS) return null;
  const sd = stdev(excessReturns);
  if (sd < NEAR_ZERO) return null;
  return (mean(excessReturns) / sd) * Math.sqrt(TRADING_DAYS);
}

/**
 * Standard error of the annualised Sharpe, per Lo (2002), assuming IID returns:
 *
 *   SE(SR) = √( (1 + SR²/2) / n )      [at the sampling frequency]
 *
 * Reported because the number it qualifies is far less precise than its two
 * decimal places suggest — at one year of daily data the standard error is
 * still around ±1.0. Anyone comparing two Sharpes a tenth apart should see
 * this. IID is a generous assumption; autocorrelated returns make it worse,
 * not better, so treat it as a floor on the uncertainty.
 */
export function sharpeStandardError(excessReturns: number[]): number | null {
  const n = excessReturns.length;
  if (n < MIN_OBSERVATIONS) return null;
  const sd = stdev(excessReturns);
  if (sd < NEAR_ZERO) return null;
  const daily = mean(excessReturns) / sd;
  return Math.sqrt((1 + (daily * daily) / 2) / n) * Math.sqrt(TRADING_DAYS);
}

/**
 * Sortino: same numerator as Sharpe, but the denominator counts only downside
 * deviation. Upside volatility is not a risk anyone wants less of, and on a
 * book with returns this asymmetric, penalising it distorts the picture.
 *
 * The sum of squared shortfalls is divided by n, not by the number of negative
 * days — the conventional definition, and the one that keeps Sortino
 * comparable to Sharpe rather than inflating it as downside days get rarer.
 */
export function sortino(excessReturns: number[]): number | null {
  if (excessReturns.length < MIN_OBSERVATIONS) return null;
  const downside = Math.sqrt(
    excessReturns.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / excessReturns.length
  );
  if (downside < NEAR_ZERO) return null; // never had a losing day in the window
  return (mean(excessReturns) / downside) * Math.sqrt(TRADING_DAYS);
}

export type Drawdown = {
  /** Worst peak-to-trough decline in the window, as a negative fraction. */
  max: number;
  /** Decline from the running peak as at the final observation. */
  current: number;
  /** Observations since the last high-water mark. */
  daysUnderWater: number;
};

/**
 * Drawdown over an equity curve (levels, not returns). Peak-to-trough on the
 * running maximum, which is what "how bad did it get" means — not the decline
 * from the first observation.
 */
export function drawdown(equity: number[]): Drawdown | null {
  if (equity.length < 2) return null;
  let peak = equity[0];
  let peakIndex = 0;
  let max = 0;
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i];
      peakIndex = i;
    }
    const dd = equity[i] / peak - 1;
    if (dd < max) max = dd;
  }
  const last = equity[equity.length - 1];
  return {
    max,
    current: last / peak - 1,
    daysUnderWater: equity.length - 1 - peakIndex,
  };
}

/**
 * Calmar: annualised return per unit of worst drawdown. Undefined without a
 * drawdown to divide by — a series that only ever rose has no Calmar, rather
 * than an infinite one.
 */
export function calmar(annReturn: number | null, maxDrawdown: number): number | null {
  if (annReturn === null || maxDrawdown >= 0) return null;
  return annReturn / Math.abs(maxDrawdown);
}

export type Regression = {
  /** Jensen's alpha, annualised. */
  alpha: number;
  /** Realised beta from the regression — not the bottom-up weighted average. */
  beta: number;
  /** Share of the book's variance explained by the benchmark. */
  rSquared: number;
};

/**
 * Regresses portfolio excess returns on benchmark excess returns:
 *
 *   Rp − Rf = α + β(Rm − Rf) + ε
 *
 * Alpha is annualised arithmetically (×252), the convention for Jensen's alpha.
 *
 * The beta this returns is worth contrasting with the bottom-up figure in
 * portfolioAnalytics: that one is the value-weighted average of each holding's
 * published beta, this one is measured from the book's own realised returns.
 * They disagreeing is informative, not an error — published betas are estimated
 * over different windows against different indices, and thinly traded OTC
 * listings distort them.
 */
export function regress(
  portfolioExcess: number[],
  benchmarkExcess: number[]
): Regression | null {
  const n = Math.min(portfolioExcess.length, benchmarkExcess.length);
  if (n < MIN_OBSERVATIONS) return null;
  const p = portfolioExcess.slice(-n);
  const m = benchmarkExcess.slice(-n);

  const mp = mean(p);
  const mm = mean(m);
  let cov = 0;
  let varM = 0;
  let varP = 0;
  for (let i = 0; i < n; i++) {
    cov += (p[i] - mp) * (m[i] - mm);
    varM += (m[i] - mm) ** 2;
    varP += (p[i] - mp) ** 2;
  }
  if (varM < NEAR_ZERO) return null;

  const beta = cov / varM;
  return {
    beta,
    alpha: (mp - beta * mm) * TRADING_DAYS,
    rSquared: varP === 0 ? 0 : (cov * cov) / (varM * varP),
  };
}

export type Capture = {
  /** Share of the benchmark's average gain captured on its up days, in percent. */
  up: number | null;
  /** Share of the benchmark's average loss taken on its down days, in percent. */
  down: number | null;
};

/**
 * Up/down capture, on raw (not excess) returns, against the benchmark's own
 * up and down days.
 *
 * The most direct test of whether a high beta is doing anything for you:
 * capturing 190% of the upside and 190% of the downside is a levered index
 * fund, while 190% up and 140% down is genuine convexity. A single beta cannot
 * distinguish those two; this pair does.
 */
export function captureRatios(portfolio: number[], benchmark: number[]): Capture {
  const n = Math.min(portfolio.length, benchmark.length);
  const p = portfolio.slice(-n);
  const b = benchmark.slice(-n);

  const upP: number[] = [];
  const upB: number[] = [];
  const downP: number[] = [];
  const downB: number[] = [];
  for (let i = 0; i < n; i++) {
    if (b[i] > 0) {
      upP.push(p[i]);
      upB.push(b[i]);
    } else if (b[i] < 0) {
      downP.push(p[i]);
      downB.push(b[i]);
    }
  }

  const ratio = (a: number[], c: number[]) => {
    if (a.length < 5) return null; // too few days for the ratio to mean anything
    const mc = mean(c);
    return mc === 0 ? null : (mean(a) / mc) * 100;
  };

  return { up: ratio(upP, upB), down: ratio(downP, downB) };
}

/** Annualised standard deviation of the return difference vs the benchmark. */
export function trackingError(portfolio: number[], benchmark: number[]): number | null {
  const n = Math.min(portfolio.length, benchmark.length);
  if (n < MIN_OBSERVATIONS) return null;
  const diff: number[] = [];
  for (let i = 0; i < n; i++) diff.push(portfolio[portfolio.length - n + i] - benchmark[benchmark.length - n + i]);
  return stdev(diff) * Math.sqrt(TRADING_DAYS);
}

/** Active return per unit of tracking error. */
export function informationRatio(
  portfolio: number[],
  benchmark: number[]
): number | null {
  const te = trackingError(portfolio, benchmark);
  if (te === null || te < NEAR_ZERO) return null;
  const n = Math.min(portfolio.length, benchmark.length);
  const diff: number[] = [];
  for (let i = 0; i < n; i++) diff.push(portfolio[portfolio.length - n + i] - benchmark[benchmark.length - n + i]);
  return (mean(diff) * TRADING_DAYS) / te;
}

/** Converts an annualised percent yield (FRED DTB3) to a simple daily rate. */
export function dailyRiskFree(annualPct: number): number {
  return annualPct / 100 / TRADING_DAYS;
}

export type WindowMetrics = {
  label: string;
  observations: number;
  annualizedReturn: number | null;
  annualizedVol: number | null;
  sharpe: number | null;
  sharpeStdErr: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdown: number | null;
  currentDrawdown: number | null;
  daysUnderWater: number | null;
  alpha: number | null;
  beta: number | null;
  rSquared: number | null;
  upCapture: number | null;
  downCapture: number | null;
  trackingError: number | null;
  informationRatio: number | null;
};

/**
 * Everything for one window, from aligned daily series. `riskFree` is a daily
 * rate per observation; pass a constant array if only one rate is known.
 */
export function computeWindow(
  label: string,
  portfolio: number[],
  benchmark: number[],
  riskFree: number[]
): WindowMetrics {
  const n = portfolio.length;
  const excessP = portfolio.map((r, i) => r - (riskFree[i] ?? 0));
  const excessB = benchmark.map((r, i) => r - (riskFree[i] ?? 0));

  // Equity curve implied by the returns, for drawdown. Starts at 1 so the
  // levels are growth multiples rather than dollars.
  const equity: number[] = [1];
  for (const r of portfolio) equity.push(equity[equity.length - 1] * (1 + r));
  const dd = drawdown(equity);

  const annRet = annualizedReturn(portfolio);
  const reg = regress(excessP, excessB);
  const cap = captureRatios(portfolio, benchmark);

  return {
    label,
    observations: n,
    annualizedReturn: annRet,
    annualizedVol: annualizedVol(portfolio),
    sharpe: sharpe(excessP),
    sharpeStdErr: sharpeStandardError(excessP),
    sortino: sortino(excessP),
    calmar: dd ? calmar(annRet, dd.max) : null,
    maxDrawdown: dd?.max ?? null,
    currentDrawdown: dd?.current ?? null,
    daysUnderWater: dd?.daysUnderWater ?? null,
    alpha: reg?.alpha ?? null,
    beta: reg?.beta ?? null,
    rSquared: reg?.rSquared ?? null,
    upCapture: cap.up,
    downCapture: cap.down,
    trackingError: trackingError(portfolio, benchmark),
    informationRatio: informationRatio(portfolio, benchmark),
  };
}
