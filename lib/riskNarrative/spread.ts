// VIXEQ − VIX interpretation catalog: 53 entries.
//
// VIXEQ is Cboe's S&P 500 Constituent Volatility Index — average single-stock
// implied volatility — so VIXEQ minus VIX is a dispersion / implied-correlation
// read (see DEPENDENCIES.md). A wide spread means constituent vol is being
// priced far above index vol: stocks are expected to move idiosyncratically and
// diversification damps the index. A narrow or negative spread means implied
// correlation is high and the index is expected to move as one block.
//
// Levels are percentile bands of the joined daily history (2014-onward in
// Cboe's CSV, ~3,045 same-day observations). Absolute thresholds would be
// misleading here: the all-time mean spread is 13.3 with a 34.1 maximum.

import type { SeriesStats } from "@/lib/riskStats";
import {
  buildVocab,
  classifyPercentileLevel,
  classifyTrend,
  selectNarrative,
  type BaseContext,
  type Interpretation,
  type NarrativeEntry,
  type PercentileLevel,
  type TrendBucket,
} from "./types";

export interface SpreadContext extends BaseContext {
  level: PercentileLevel;
}

type GridText = (c: SpreadContext) => string;

// ---------------------------------------------------------------------------
// Layer 1 — exhaustive level × trend grid
// ---------------------------------------------------------------------------

const GRID: Record<PercentileLevel, Record<TrendBucket, GridText>> = {
  veryLow: {
    sharpDown: (c) =>
      `At ${c.v.cur} points the spread has compressed into the bottom decile of its history since ${c.v.sinceYear}, collapsing ${c.v.chg21Abs} in a month. Single-stock and index volatility are converging fast, which is what happens when a macro factor starts driving every name in the index at once.`,
    down: (c) =>
      `A ${c.v.cur} spread is bottom-decile (${c.v.pctFull} percentile since ${c.v.sinceYear}) against a ${c.v.fullMean} long-run average, and still narrowing. Implied correlation is high and rising: the market expects constituents to move together rather than on their own news.`,
    flat: (c) =>
      `The spread is parked at ${c.v.cur}, deep in the bottom decile of its ${c.v.sinceYear}-onward range and far under the ${c.v.fullMean} historical mean. A persistently compressed spread describes a high-correlation regime where index hedges do most of the work and stock selection does little.`,
    up: (c) =>
      `${c.v.cur} is still a very narrow spread — ${c.v.pctFull} percentile of history — but it has widened ${c.v.chg21Abs} over the month. The first widening off a compressed base is where correlation starts breaking down and idiosyncratic risk begins to be priced again.`,
    sharpUp: (c) =>
      `The spread has widened ${c.v.chg21Abs} points in a month yet ${c.v.cur} is still bottom-decile versus its ${c.v.sinceYear}-onward record. Dispersion is being repriced quickly from an unusually correlated starting point, with the ${c.v.fullMean} long-run mean well above current levels.`,
  },
  low: {
    sharpDown: (c) =>
      `${c.v.cur} puts the spread in the ${c.v.pctFull} percentile of its history and it has narrowed ${c.v.chg21Abs} points in a month. Constituent volatility is falling toward index volatility — correlation rising — which typically accompanies a market trading on one macro narrative.`,
    down: (c) =>
      `A narrow ${c.v.cur} spread (${c.v.pctFull} percentile since ${c.v.sinceYear}, mean ${c.v.fullMean}) is still tightening, ${c.v.chg21} on the month. Less of the index's risk is being attributed to individual names and more to the market factor as a whole.`,
    flat: (c) =>
      `The spread is holding near ${c.v.cur}, below its ${c.v.fullMean} long-run average at the ${c.v.pctFull} percentile, with a month change of only ${c.v.chg21}. Correlation is elevated and stable: a market where owning the index and owning its parts are close to the same trade.`,
    up: (c) =>
      `${c.v.cur} remains a low spread historically, but ${c.v.chg21} over the month shows dispersion rebuilding. As this widens, single-name volatility starts to detach from index volatility and idiosyncratic risk carries more of the total.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point widening in a month lifts the spread to ${c.v.cur}, still only the ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history. Rapid decorrelation from a tight base — the index is being held together less by a common factor than it was a month ago.`,
  },
  normal: {
    sharpDown: (c) =>
      `The spread sits mid-distribution at ${c.v.cur} (${c.v.pctFull} percentile) after narrowing ${c.v.chg21Abs} points in a month. Correlation is climbing off a normal base: constituent vol is converging toward the ${c.v.cur}-point-lower index measure faster than usual.`,
    down: (c) =>
      `At ${c.v.cur} the spread is close to its ${c.v.fullMedian} historical median and easing, ${c.v.chg21} on the month. Dispersion is unremarkable and slowly declining — neither a stock-picker's market nor a purely macro-driven one.`,
    flat: (c) =>
      `The spread is at ${c.v.cur}, near the ${c.v.fullMedian} median of its ${c.v.sinceYear}-onward history and effectively flat on the month (${c.v.chg21}). This is the baseline relationship between single-stock and index volatility: constituents priced meaningfully more volatile than the index they compose, by a typical margin.`,
    up: (c) =>
      `${c.v.cur} is a middling spread — ${c.v.pctFull} percentile of history — that has widened ${c.v.chg21Abs} over the past month. Dispersion is building steadily, meaning more of the expected movement is being assigned to individual names rather than the market factor.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly widening takes the spread to ${c.v.cur}, the ${c.v.pctFull} percentile since ${c.v.sinceYear}. The level is ordinary but the speed is not: implied correlation is falling quickly, which usually tracks an earnings cycle or sector-specific dislocation rather than a market-wide one.`,
  },
  elevated: {
    sharpDown: (c) =>
      `${c.v.cur} is a wide spread (${c.v.pctFull} percentile of the ${c.v.sinceYear}-onward record) but it has narrowed ${c.v.chg21Abs} in a month. Dispersion is unwinding from elevated levels — the idiosyncratic story that drove it apart is being replaced by a common factor.`,
    down: (c) =>
      `The spread is elevated at ${c.v.cur}, above its ${c.v.fullMean} long-run mean, and drifting tighter (${c.v.chg21} on the month). Single-stock volatility still carries a substantial premium to index volatility, just a shrinking one.`,
    flat: (c) =>
      `Holding at ${c.v.cur} — the ${c.v.pctFull} percentile since ${c.v.sinceYear}, against a ${c.v.fullMean} mean — the spread describes a sustained low-correlation market. Index volatility is being suppressed by diversification while constituents are priced for real individual movement.`,
    up: (c) =>
      `${c.v.cur} is an elevated spread and still widening, ${c.v.chg21} over the month. Both level and direction point to falling implied correlation: the index is increasingly the average of divergent names rather than a single directional bet.`,
    sharpUp: (c) =>
      `The spread has widened ${c.v.chg21Abs} points in a month to ${c.v.cur}, the ${c.v.pctFull} percentile of its history. Elevated and accelerating dispersion means index-level volatility is understating what is happening underneath it — the average constituent is priced far more volatile than the benchmark.`,
  },
  high: {
    sharpDown: (c) =>
      `At ${c.v.cur} the spread is still top-decile (${c.v.pctFull} percentile since ${c.v.sinceYear}) but has come in ${c.v.chg21Abs} points on the month. An extreme dispersion regime is normalising, though the gap between constituent and index volatility remains historically large.`,
    down: (c) =>
      `${c.v.cur} is a top-decile spread against a ${c.v.fullMean} long-run mean, easing ${c.v.chg21Abs} points over the month. Implied correlation is rising from very depressed levels — worth watching, because index hedges become more effective as this narrows.`,
    flat: (c) =>
      `The spread is stuck wide at ${c.v.cur}, the ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history, with only ${c.v.chg21} of net movement this month. Persistent top-decile dispersion is a market of stories rather than a market of one story, and index volatility badly understates single-name risk in it.`,
    up: (c) =>
      `${c.v.cur} is a top-decile spread that is still widening (${c.v.chg21} on the month), pushing toward the ${c.v.fullMax} record since ${c.v.sinceYear}. Implied correlation is collapsing: constituents are expected to move almost independently of one another.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point surge to ${c.v.cur} puts the spread deep in the top decile of its history and closing on the ${c.v.fullMax} all-time wide. Dispersion this extreme means the index is masking substantial movement among its components — index volatility is the least informative it gets about underlying risk.`,
  },
  extreme: {
    sharpDown: (c) =>
      `${c.v.cur} is inside the top 2% of spreads since ${c.v.sinceYear} even after narrowing ${c.v.chg21Abs} points this month. Extreme dispersion regimes do mean-revert — the long-run average is ${c.v.fullMean} — and this one has begun to.`,
    down: (c) =>
      `The spread remains extreme at ${c.v.cur} (top 2% of its ${c.v.sinceYear}-onward record, mean ${c.v.fullMean}) while easing ${c.v.chg21Abs} on the month. Constituent volatility is priced enormously above index volatility, though the gap is finally compressing.`,
    flat: (c) =>
      `At ${c.v.cur} the spread is in the top 2% of its history and has not moved much this month (${c.v.chg21}). A sustained extreme means the market persistently expects S&P constituents to move on their own news; the index's own volatility, at these correlations, is a poor proxy for the risk inside it.`,
    up: (c) =>
      `${c.v.cur} is a top-2% spread and still widening, ${c.v.chg21} over the month, against an all-time wide of ${c.v.fullMax}. Implied correlation is about as low as this data has ever priced — maximum divergence between what constituents and the index are expected to do.`,
    sharpUp: (c) =>
      `The spread has blown out ${c.v.chg21Abs} points in a month to ${c.v.cur}, the most extreme 2% of readings since ${c.v.sinceYear} and near the ${c.v.fullMax} record. Only a handful of episodes in this history have decorrelated this hard this fast.`,
  },
};

const gridEntries: NarrativeEntry<SpreadContext>[] = (
  Object.keys(GRID) as PercentileLevel[]
).flatMap((level) =>
  (Object.keys(GRID[level]) as TrendBucket[]).map((trend) => ({
    id: `spread-grid-${level}-${trend}`,
    priority: 0,
    when: (c: SpreadContext) => c.level === level && c.trend === trend,
    text: GRID[level][trend],
  })),
);

// ---------------------------------------------------------------------------
// Layer 2 — situational overrides
// ---------------------------------------------------------------------------

const specialEntries: NarrativeEntry<SpreadContext>[] = [
  {
    id: "spread-record-high",
    priority: 95,
    when: (c) => c.stats.isFullHigh,
    text: (c) =>
      `${c.v.cur} is the widest VIXEQ − VIX spread in the whole ${c.v.obsFull}-session record since ${c.v.sinceYear}. Implied correlation has never been priced lower in this data: constituent volatility carries an unprecedented premium over the index built from those same constituents.`,
  },
  {
    id: "spread-record-low",
    priority: 95,
    when: (c) => c.stats.isFullLow,
    text: (c) =>
      `At ${c.v.cur} this is the narrowest the spread has been across ${c.v.obsFull} sessions since ${c.v.sinceYear}. Single-stock and index volatility have never been priced closer together here — the most correlated regime in the series, where diversification offers the index almost no volatility relief.`,
  },
  {
    id: "spread-inverted",
    priority: 90,
    when: (c) => c.stats.current < 0,
    text: (c) =>
      `The spread is inverted at ${c.v.cur}: index implied volatility is being priced above the average constituent's. That is a rare configuration — the long-run average spread is ${c.v.fullMean} and the historical minimum is ${c.v.fullMin} — and it points to a systemic, everything-moves-together shock rather than any stock-specific risk.`,
  },
  {
    id: "spread-correlation-shock",
    priority: 78,
    when: (c) => c.stats.current >= 0 && c.stats.current < 5,
    text: (c) =>
      `A spread of just ${c.v.cur} points — the ${c.v.pctFull} percentile since ${c.v.sinceYear}, versus a ${c.v.fullMean} mean — is a correlation shock. Constituent and index volatility have nearly converged, which means the market is pricing the S&P to move as a single asset and diversification to stop helping.`,
  },
  {
    id: "spread-year-high-sharp",
    priority: 84,
    when: (c) => c.stats.isYearHigh && c.trend === "sharpUp",
    text: (c) =>
      `At ${c.v.cur} the spread is at a one-year wide, ${c.v.chg21Abs} points above a month ago and ${c.v.zYrAbs} standard deviations over its ${c.v.yrMean} trailing-year mean. Dispersion has not been priced this aggressively in 12 months and the widening is still accelerating.`,
  },
  {
    id: "spread-year-low-sharp",
    priority: 84,
    when: (c) => c.stats.isYearLow && c.trend === "sharpDown",
    text: (c) =>
      `${c.v.cur} is the narrowest spread of the past year, down ${c.v.chg21Abs} points in a month and ${c.v.zYrAbs} standard deviations below the ${c.v.yrMean} trailing-year mean. Correlation is spiking: constituents are converging on the index at the fastest rate in 12 months.`,
  },
  {
    id: "spread-shock-up",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd >= 2,
    text: (c) =>
      `The spread widened ${c.v.dayAbs} points in one session to ${c.v.cur} — over two trailing-year standard deviations (${c.v.yrSd}) in a day. Single-session decorrelation this abrupt usually follows a scheduled event that hit individual names very differently, such as a heavy earnings print.`,
  },
  {
    id: "spread-shock-down",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd <= -2,
    text: (c) =>
      `A ${c.v.dayAbs}-point one-day collapse to ${c.v.cur} is more than two trailing-year standard deviations (${c.v.yrSd}) of compression in a single session. Correlation jumps like this are how a macro shock announces itself — individual stories stop mattering and the index factor takes over.`,
  },
  {
    id: "spread-year-high",
    priority: 72,
    when: (c) => c.stats.isYearHigh,
    text: (c) =>
      `${c.v.cur} is a one-year wide for the spread, against a ${c.v.yrMean} trailing-year mean and a 12-month range of ${c.v.yrMin}–${c.v.yrMax}. On the full ${c.v.sinceYear}-onward history it is the ${c.v.pctFull} percentile, so this is the low-correlation extreme of the recent regime.`,
  },
  {
    id: "spread-year-low",
    priority: 72,
    when: (c) => c.stats.isYearLow,
    text: (c) =>
      `At ${c.v.cur} the spread has printed a one-year low, under the ${c.v.yrMin} floor of the past 12 months and below its ${c.v.yrMean} trailing-year mean. Set against the ${c.v.sinceYear}-onward record it is the ${c.v.pctFull} percentile — constituents are being priced closer to the index than at any point this year.`,
  },
  {
    id: "spread-extreme-z-high",
    priority: 66,
    when: (c) => c.stats.zYear >= 2.5,
    text: (c) =>
      `${c.v.cur} sits ${c.v.zYrAbs} standard deviations above the spread's ${c.v.yrMean} trailing-year mean, outside the ${c.v.yrMin}–${c.v.yrMax} band that has contained it for 12 months. Dispersion is being priced beyond anything the recent regime established as normal.`,
  },
  {
    id: "spread-extreme-z-low",
    priority: 66,
    when: (c) => c.stats.zYear <= -2.5,
    text: (c) =>
      `The spread is ${c.v.zYrAbs} standard deviations below its ${c.v.yrMean} trailing-year mean at ${c.v.cur}, outside the ${c.v.yrMin}–${c.v.yrMax} range of the past 12 months. Implied correlation has moved outside the regime the last year set.`,
  },
  {
    id: "spread-at-long-run-mean",
    priority: 62,
    when: (c) => Math.abs(c.stats.zFull) < 0.05,
    text: (c) =>
      `The spread is sitting on its long-run average: ${c.v.cur} against a ${c.v.fullMean} mean across ${c.v.obsFull} same-day observations since ${c.v.sinceYear}. Dispersion is exactly typical, so the month's ${c.v.chg21} change is the only part of this reading carrying information.`,
  },
  {
    id: "spread-long-streak-up",
    priority: 56,
    when: (c) => c.stats.streak >= 5,
    text: (c) =>
      `The spread has widened ${c.v.streakAbs} sessions running to ${c.v.cur}. A steady multi-day decorrelation like this is a grind rather than a shock — implied correlation eroding daily, leaving the month ${c.v.chg21} in total.`,
  },
  {
    id: "spread-long-streak-down",
    priority: 56,
    when: (c) => c.stats.streak <= -5,
    text: (c) =>
      `${c.v.streakAbs} consecutive sessions of narrowing have brought the spread to ${c.v.cur}. Correlation has been rising without interruption, which usually means one macro variable is progressively taking over the pricing of every name in the index.`,
  },
  {
    id: "spread-compressed-range",
    priority: 52,
    // Same tightening as the VIX equivalent: a loose threshold here matched a
    // fifth of all history and masked the level×trend grid.
    when: (c) =>
      c.stats.year.sd > 0 &&
      c.stats.recentSd < 0.3 * c.stats.year.sd &&
      Math.abs(c.stats.trendStrength) < 0.6,
    text: (c) =>
      `The spread has been remarkably stable at ${c.v.cur}: its own variation over the past month (${c.stats.recentSd.toFixed(2)}) is under a third of the ${c.v.yrSd} trailing-year figure, with no net drift (${c.v.chg21}). A settled dispersion regime — the relationship between single-stock and index volatility is not currently being renegotiated.`,
  },
  {
    id: "spread-expanding-range",
    priority: 52,
    when: (c) => c.stats.year.sd > 0 && c.stats.recentSd > 1.8 * c.stats.year.sd,
    text: (c) =>
      `Day-to-day movement in the spread has expanded sharply — ${c.stats.recentSd.toFixed(2)} realized deviation this month against ${c.v.yrSd} for the trailing year, with the level at ${c.v.cur}. The market is actively repricing how much of the index's risk is idiosyncratic versus common.`,
  },
  {
    id: "spread-regime-wider",
    priority: 46,
    when: (c) =>
      c.trend === "flat" &&
      c.stats.full.sd > 0 &&
      c.stats.year.mean - c.stats.full.mean > 0.75 * c.stats.full.sd,
    text: (c) =>
      `The level matters less than the regime here: at ${c.v.cur} the spread is the ${c.v.pctYr} percentile of the past year, but that year has averaged ${c.v.yrMean} against ${c.v.fullMean} for the whole ${c.v.sinceYear}-onward history. Dispersion has structurally reset wider, so "normal" now means far lower implied correlation than it used to.`,
  },
  {
    id: "spread-regime-tighter",
    priority: 46,
    when: (c) =>
      c.trend === "flat" &&
      c.stats.full.sd > 0 &&
      c.stats.full.mean - c.stats.year.mean > 0.75 * c.stats.full.sd,
    text: (c) =>
      `The past year has run structurally more correlated than history: a ${c.v.yrMean} average spread against ${c.v.fullMean} since ${c.v.sinceYear}, with the current reading at ${c.v.cur}. It is the ${c.v.pctYr} percentile of the recent regime but only the ${c.v.pctFull} percentile of the full record — recent normal is a tight-spread normal.`,
  },
  {
    id: "spread-round-trip",
    priority: 44,
    when: (c) =>
      c.stats.change63d !== null &&
      c.stats.change21d !== null &&
      c.stats.year.sd > 0 &&
      Math.abs(c.stats.change63d) < 0.25 * c.stats.year.sd &&
      Math.abs(c.stats.change21d) > c.stats.year.sd,
    text: (c) =>
      `The spread has round-tripped: ${c.v.chg63} over the quarter but ${c.v.chg21} in the past month alone, finishing at ${c.v.cur}. A dispersion episode was priced in and then priced back out, leaving implied correlation where it stood 63 sessions ago.`,
  },
  {
    id: "spread-dormant-wide",
    priority: 40,
    when: (c) => (c.stats.sessionsSinceHigher ?? 0) >= 120,
    text: (c) =>
      `${c.v.cur} is the widest the spread has closed in ${c.stats.sessionsSinceHigher} sessions, roughly ${Math.round((c.stats.sessionsSinceHigher ?? 0) / 21)} months. Clearing a ceiling that has held that long is the more meaningful part of this reading; the absolute level is the ${c.v.pctFull} percentile of the history since ${c.v.sinceYear}.`,
  },
  {
    id: "spread-dormant-narrow",
    priority: 40,
    when: (c) => (c.stats.sessionsSinceLower ?? 0) >= 120,
    text: (c) =>
      `At ${c.v.cur} the spread is the narrowest it has closed in ${c.stats.sessionsSinceLower} sessions — about ${Math.round((c.stats.sessionsSinceLower ?? 0) / 21)} months. Correlation has quietly climbed to the top of its multi-month range while the level itself, the ${c.v.pctFull} percentile since ${c.v.sinceYear}, drew little attention.`,
  },
  {
    id: "spread-wide-vs-vix-calm",
    priority: 36,
    when: (c) => c.stats.pctRankFull >= 70 && c.trend === "flat" && Math.abs(c.stats.zYear) < 0.5,
    text: (c) =>
      `A ${c.v.cur} spread — ${c.v.pctFull} percentile since ${c.v.sinceYear} — that is going nowhere (${c.v.chg21} on the month, within half a standard deviation of its ${c.v.yrMean} trailing-year mean) describes an entrenched stock-picker's market. Index volatility understates constituent risk, and it has been doing so steadily rather than newly.`,
  },
];

export const SPREAD_CATALOG: NarrativeEntry<SpreadContext>[] = [...specialEntries, ...gridEntries];

export function buildSpreadContext(stats: SeriesStats): SpreadContext {
  return {
    stats,
    trend: classifyTrend(stats),
    v: buildVocab(stats),
    level: classifyPercentileLevel(stats.pctRankFull),
  };
}

export function interpretSpread(stats: SeriesStats | null): Interpretation | null {
  if (!stats) return null;
  return selectNarrative(SPREAD_CATALOG, buildSpreadContext(stats));
}
