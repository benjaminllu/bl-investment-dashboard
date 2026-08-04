/**
 * Portfolio exposure and risk aggregation.
 *
 * Pure functions with no I/O, so the whole thing can be replayed against real
 * holdings by a script rather than only being seen through the page — the same
 * reason lib/riskStats.ts is separated from its callers.
 *
 * Two conventions run through all of it:
 *
 * 1. Weights are over *securities*, excluding cash. A sector pie that counted
 *    cash as a sector would be answering a different question, and cash carries
 *    none of the characteristics being aggregated. Cash is reported separately
 *    as `cashPct`, which is where it actually belongs.
 * 2. Anything averaged reports its own coverage. Finnhub has no data for some
 *    OTC and foreign listings, and an average over 70% of the money presented as
 *    if it covered all of it is the kind of number that quietly misleads.
 */

/** One holding, already valued, with whatever characteristics are known. */
export type AnalyticsPosition = {
  ticker: string;
  isCash: boolean;
  marketValue: number | null;
  costBasis: number | null;
  pnl: number | null;
  sector: string | null;
  /** Millions of `marketCapCurrency`, straight from Finnhub — not USD-converted. */
  marketCap: number | null;
  marketCapCurrency: string | null;
  beta: number | null;
  priceToBook: number | null;
  volatility3m: number | null;
  return52w: number | null;
  roeTtm: number | null;
  forwardPe: number | null;
};

/** An average, plus how much of the book it actually managed to cover. */
export type Weighted = {
  value: number | null;
  /** Percent of security value carrying the input field. */
  coveragePct: number;
  covered: number;
  total: number;
};

export type Slice = {
  label: string;
  value: number;
  pct: number;
};

const UNCLASSIFIED = "Unclassified";

/**
 * Size cut-points in millions. Deliberately coarse — three buckets, not five,
 * because they are crossed with three style buckets and nine slices is already
 * at the limit of what a pie can say.
 */
const LARGE_CAP_MIN = 10_000;
const MID_CAP_MIN = 2_000;

/**
 * Value/growth split on price-to-book alone. A real style box blends several
 * metrics; P/B is the only one of them with usable free-tier coverage, so these
 * cut-points are a documented proxy rather than a reproduction of anyone's
 * index methodology. Named constants so the assumption is visible and arguable
 * instead of buried in a comparison.
 */
const VALUE_MAX_PB = 1.5;
const GROWTH_MIN_PB = 4.0;

function sizeBucket(marketCap: number | null): string | null {
  if (marketCap === null || !Number.isFinite(marketCap)) return null;
  if (marketCap >= LARGE_CAP_MIN) return "Large";
  if (marketCap >= MID_CAP_MIN) return "Mid";
  return "Small";
}

function styleBucket(priceToBook: number | null): string | null {
  if (priceToBook === null || !Number.isFinite(priceToBook)) return null;
  // A negative book value is not "deep value" — it means liabilities exceed
  // assets, which the value/growth axis has no way to express.
  if (priceToBook <= 0) return null;
  if (priceToBook < VALUE_MAX_PB) return "Value";
  if (priceToBook >= GROWTH_MIN_PB) return "Growth";
  return "Blend";
}

/** Securities only, and only those actually carrying a market value. */
function valuedSecurities(positions: AnalyticsPosition[]): AnalyticsPosition[] {
  return positions.filter(
    (p) => !p.isCash && p.marketValue !== null && Number.isFinite(p.marketValue)
  );
}

/**
 * Value-weighted mean over the names that have the field, renormalised so the
 * weights of the covered subset sum to 1.
 *
 * For beta this is not an approximation: beta is linear in portfolio weights,
 * so the weighted mean IS the portfolio's beta. For volatility it very much is
 * an approximation — combining constituent volatilities without a correlation
 * matrix assumes the holdings move together, which overstates the true figure.
 * Callers label that one accordingly.
 */
export function weightedMean(
  positions: AnalyticsPosition[],
  field: keyof AnalyticsPosition
): Weighted {
  const securities = valuedSecurities(positions);
  const totalValue = securities.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const have = securities.filter((p) => {
    const v = p[field];
    return typeof v === "number" && Number.isFinite(v);
  });
  const coveredValue = have.reduce((s, p) => s + (p.marketValue ?? 0), 0);

  if (coveredValue <= 0) {
    return { value: null, coveragePct: 0, covered: 0, total: securities.length };
  }
  const value =
    have.reduce((s, p) => s + (p[field] as number) * (p.marketValue ?? 0), 0) / coveredValue;

  return {
    value,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
    covered: have.length,
    total: securities.length,
  };
}

/**
 * Weighted *harmonic* mean, which is the correct aggregation for a price ratio:
 * a portfolio's P/E is total price over total earnings, not the average of the
 * individual P/Es. The arithmetic version lets one 200x name drag the whole
 * figure up out of all proportion to the money behind it.
 *
 * Non-positive ratios are dropped rather than inverted — a negative P/E means
 * the company lost money, and averaging it in would cancel out a profitable
 * holding as if the two offset.
 */
export function weightedHarmonicMean(
  positions: AnalyticsPosition[],
  field: keyof AnalyticsPosition
): Weighted {
  const securities = valuedSecurities(positions);
  const totalValue = securities.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const have = securities.filter((p) => {
    const v = p[field];
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });
  const coveredValue = have.reduce((s, p) => s + (p.marketValue ?? 0), 0);

  if (coveredValue <= 0) {
    return { value: null, coveragePct: 0, covered: 0, total: securities.length };
  }
  const sumOfWeightOverRatio = have.reduce(
    (s, p) => s + (p.marketValue ?? 0) / coveredValue / (p[field] as number),
    0
  );

  return {
    value: sumOfWeightOverRatio > 0 ? 1 / sumOfWeightOverRatio : null,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
    covered: have.length,
    total: securities.length,
  };
}

/** Groups security value by a key, largest first, with an explicit unknown bucket. */
function composition(
  positions: AnalyticsPosition[],
  keyOf: (p: AnalyticsPosition) => string | null
): Slice[] {
  const securities = valuedSecurities(positions);
  const total = securities.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  if (total <= 0) return [];

  const byKey = new Map<string, number>();
  for (const p of securities) {
    const key = keyOf(p) ?? UNCLASSIFIED;
    byKey.set(key, (byKey.get(key) ?? 0) + (p.marketValue ?? 0));
  }

  return [...byKey]
    .map(([label, value]) => ({ label, value, pct: (value / total) * 100 }))
    .sort((a, b) => {
      // Unclassified sorts last regardless of size — it is an absence of data,
      // not a holding, and should never head the legend.
      if (a.label === UNCLASSIFIED) return 1;
      if (b.label === UNCLASSIFIED) return -1;
      return b.value - a.value;
    });
}

export function sectorComposition(positions: AnalyticsPosition[]): Slice[] {
  return composition(positions, (p) => p.sector);
}

/**
 * Size crossed with style, e.g. "Mid Growth". Both axes must be known: a name
 * with a market cap but no book value lands in Unclassified rather than being
 * defaulted into Blend, which would invent an exposure the data does not support.
 */
export function factorComposition(positions: AnalyticsPosition[]): Slice[] {
  return composition(positions, (p) => {
    const size = sizeBucket(p.marketCap);
    const style = styleBucket(p.priceToBook);
    return size && style ? `${size} ${style}` : null;
  });
}

/**
 * Herfindahl-Hirschman index over position weights, expressed as the number of
 * equally sized holdings that would produce the same concentration. Thirty-four
 * equal positions give 34; one position holding everything gives 1. It answers
 * "how many holdings does this book really behave like", which a raw count cannot.
 */
function effectiveCount(weights: number[]): number | null {
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  return hhi > 0 ? 1 / hhi : null;
}

export type PortfolioAnalytics = {
  /** Securities plus cash — what the header total reports. */
  totalValue: number;
  securityValue: number;
  cashValue: number;
  /** Can be negative: a margin debit is stored as a negative cash balance. */
  cashPct: number;

  positionCount: number;
  largestPositionPct: number | null;
  largestPositionTicker: string | null;
  top5Pct: number | null;
  effectiveHoldings: number | null;

  sectors: Slice[];
  factors: Slice[];
  largestSectorPct: number | null;
  largestSectorLabel: string | null;
  effectiveSectors: number | null;
  /** Identified sectors, excluding the Unclassified residual. */
  namedSectorCount: number;

  beta: Weighted;
  volatility: Weighted;
  momentum: Weighted;
  roe: Weighted;
  forwardPe: Weighted;

  totalPnl: number;
  totalCostBasis: number;
  totalReturnPct: number | null;
  winners: number;
  losers: number;
  /** Share of security value in companies with negative trailing ROE. */
  unprofitablePct: number | null;
  /** Market caps not reported in USD, so their size bucket is only approximate. */
  nonUsdMarketCaps: number;

  /**
   * Securities as a share of net asset value. Above 100% means borrowed money
   * is at work — a margin debit shows up as negative cash, so NAV is smaller
   * than the securities held against it.
   */
  grossExposurePct: number;
  /** Positions ranked by how much of the portfolio's beta they manufacture. */
  betaContributors: BetaContribution[];
};

/**
 * A position's share of portfolio beta: wᵢ × βᵢ, which sums to the portfolio
 * beta exactly because beta is linear in weights.
 *
 * Worth separating from weight because the two diverge sharply. A 4% position
 * in a beta-3.4 name contributes more market risk than an 8% position in a
 * beta-1.2 one, and a weight column alone cannot show that.
 */
export type BetaContribution = {
  ticker: string;
  weightPct: number;
  beta: number;
  /** wᵢ × βᵢ, in the same units as portfolio beta. */
  contribution: number;
  /** Share of total portfolio beta, in percent. */
  sharePct: number;
};

function betaContributions(
  securities: AnalyticsPosition[],
  securityValue: number
): BetaContribution[] {
  if (securityValue <= 0) return [];
  const rows: BetaContribution[] = [];
  let totalContribution = 0;

  for (const p of securities) {
    if (typeof p.beta !== "number" || !Number.isFinite(p.beta)) continue;
    const weight = (p.marketValue ?? 0) / securityValue;
    const contribution = weight * p.beta;
    totalContribution += contribution;
    rows.push({
      ticker: p.ticker,
      weightPct: weight * 100,
      beta: p.beta,
      contribution,
      sharePct: 0,
    });
  }

  // Share is of the beta actually accounted for, so the column sums to 100%
  // even when some holdings have no published beta.
  for (const r of rows) {
    r.sharePct = totalContribution !== 0 ? (r.contribution / totalContribution) * 100 : 0;
  }
  return rows.sort((a, b) => b.contribution - a.contribution);
}

export function computeAnalytics(positions: AnalyticsPosition[]): PortfolioAnalytics {
  const securities = valuedSecurities(positions);
  const securityValue = securities.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const cashValue = positions
    .filter((p) => p.isCash)
    .reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const totalValue = securityValue + cashValue;

  // Weights are over securities only, and only meaningful when positive.
  const weights =
    securityValue > 0 ? securities.map((p) => (p.marketValue ?? 0) / securityValue) : [];
  const sortedByValue = [...securities].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  const sectors = sectorComposition(positions);
  const namedSectors = sectors.filter((s) => s.label !== UNCLASSIFIED);
  // Concentration is measured over the sectors actually identified, renormalised
  // — the same treatment every other average here gives missing data. Counting
  // Unclassified as a sector of its own would let unknown holdings supply
  // diversification they have not been shown to provide.
  const namedSectorValue = namedSectors.reduce((s, x) => s + x.value, 0);
  const sectorWeights =
    namedSectorValue > 0 ? namedSectors.map((s) => s.value / namedSectorValue) : [];

  const withPnl = positions.filter((p) => p.pnl !== null && Number.isFinite(p.pnl));
  const totalPnl = withPnl.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalCostBasis = positions
    .filter((p) => p.costBasis !== null && Number.isFinite(p.costBasis))
    .reduce((s, p) => s + (p.costBasis ?? 0), 0);

  const withRoe = securities.filter((p) => typeof p.roeTtm === "number");
  const roeCoveredValue = withRoe.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const unprofitableValue = withRoe
    .filter((p) => (p.roeTtm as number) < 0)
    .reduce((s, p) => s + (p.marketValue ?? 0), 0);

  return {
    totalValue,
    securityValue,
    cashValue,
    cashPct: totalValue !== 0 ? (cashValue / totalValue) * 100 : 0,

    positionCount: securities.length,
    largestPositionPct:
      securityValue > 0 && sortedByValue.length > 0
        ? ((sortedByValue[0].marketValue ?? 0) / securityValue) * 100
        : null,
    largestPositionTicker: sortedByValue.length > 0 ? sortedByValue[0].ticker : null,
    top5Pct:
      securityValue > 0
        ? (sortedByValue.slice(0, 5).reduce((s, p) => s + (p.marketValue ?? 0), 0) /
            securityValue) *
          100
        : null,
    effectiveHoldings: effectiveCount(weights),

    sectors,
    factors: factorComposition(positions),
    largestSectorPct: namedSectors.length > 0 ? namedSectors[0].pct : null,
    largestSectorLabel: namedSectors.length > 0 ? namedSectors[0].label : null,
    effectiveSectors: effectiveCount(sectorWeights),
    namedSectorCount: namedSectors.length,

    beta: weightedMean(positions, "beta"),
    volatility: weightedMean(positions, "volatility3m"),
    momentum: weightedMean(positions, "return52w"),
    roe: weightedMean(positions, "roeTtm"),
    forwardPe: weightedHarmonicMean(positions, "forwardPe"),

    totalPnl,
    totalCostBasis,
    totalReturnPct: totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : null,
    winners: withPnl.filter((p) => (p.pnl ?? 0) > 0).length,
    losers: withPnl.filter((p) => (p.pnl ?? 0) < 0).length,
    unprofitablePct: roeCoveredValue > 0 ? (unprofitableValue / roeCoveredValue) * 100 : null,
    nonUsdMarketCaps: securities.filter(
      (p) =>
        p.marketCap !== null &&
        p.marketCapCurrency !== null &&
        p.marketCapCurrency.toUpperCase() !== "USD"
    ).length,

    grossExposurePct: totalValue !== 0 ? (securityValue / totalValue) * 100 : 0,
    betaContributors: betaContributions(securities, securityValue),
  };
}
