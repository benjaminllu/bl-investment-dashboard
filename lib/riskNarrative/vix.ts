// VIX interpretation catalog: 53 entries.
//
// Layer 1 (priority 0): an exhaustive 6 level × 5 trend grid, so every possible
// reading matches at least one entry.
// Layer 2 (priority > 0): specific situations that override the grid when they
// hold — history extremes, single-session shocks, range compression, regime
// drift, and the absolute levels traders actually watch on this index.
//
// Levels are percentile bands of the full Cboe VIX history (daily closes back
// to 1990-01-02, ~9,240 observations), not absolute cutoffs.

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

export interface VixContext extends BaseContext {
  level: PercentileLevel;
}

type GridText = (c: VixContext) => string;

// ---------------------------------------------------------------------------
// Layer 1 — exhaustive level × trend grid
// ---------------------------------------------------------------------------

const GRID: Record<PercentileLevel, Record<TrendBucket, GridText>> = {
  veryLow: {
    sharpDown: (c) =>
      `At ${c.v.cur} the VIX sits in the bottom decile of its entire history (${c.v.pctFull} percentile since ${c.v.sinceYear}) and has collapsed ${c.v.chg21Abs} points over the past month. Volatility sellers have had a clean run; readings this low have historically come with very little cushion, since the index has far more room above it than below.`,
    down: (c) =>
      `A ${c.v.cur} print puts the VIX in the ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history, ${c.v.chg21Abs} points lower than a month ago. Index options are priced for a quiet stretch, and the drift is still downward — the calm is being extended rather than challenged.`,
    flat: (c) =>
      `The VIX is anchored at ${c.v.cur}, bottom-decile versus its full history (mean ${c.v.fullMean}) and barely moved on the month at ${c.v.chg21}. This is the flat, low-demand regime for hedges: nothing in the options market is pricing near-term disruption.`,
    up: (c) =>
      `Even after rising ${c.v.chg21Abs} points over the past month, ${c.v.cur} leaves the VIX in the ${c.v.pctFull} percentile of its history. Hedging demand is picking up off a very low base, which is where volatility expansions tend to start — but the absolute level is still unusually subdued.`,
    sharpUp: (c) =>
      `The VIX has jumped ${c.v.chg21Abs} points in a month yet ${c.v.cur} is still bottom-decile against its ${c.v.sinceYear}-onward record. That combination — violent move, low absolute level — usually means volatility is repricing from an extremely compressed base rather than reflecting realized stress.`,
  },
  low: {
    sharpDown: (c) =>
      `At ${c.v.cur} the VIX is in the ${c.v.pctFull} percentile of its full history and has fallen ${c.v.chg21Abs} points in a month. Whatever was being hedged into has been unwound quickly; implied volatility is being marked down toward the quiet end of the range.`,
    down: (c) =>
      `${c.v.cur} is a low reading — ${c.v.pctFull} percentile since ${c.v.sinceYear}, against a long-run mean of ${c.v.fullMean} — and still easing, ${c.v.chg21} on the month. Protection is getting cheaper in a market that is not asking for much of it.`,
    flat: (c) =>
      `The VIX is holding at ${c.v.cur}, comfortably below its ${c.v.fullMean} long-run mean and in the ${c.v.pctFull} percentile of history, with a month-over-month change of just ${c.v.chg21}. A settled, low-volatility regime: realized moves are small enough to keep implied pricing quiet.`,
    up: (c) =>
      `${c.v.cur} is up ${c.v.chg21Abs} points over the month but remains a low reading, ${c.v.pctFull} percentile versus the full ${c.v.sinceYear}-onward series. The bid for hedges is returning gradually from cheap levels rather than in a rush.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly gain has lifted the VIX to ${c.v.cur}, still only the ${c.v.pctFull} percentile of its history. Fast moves off a low base are the classic first leg of a volatility repricing, and the index has plenty of headroom before it reaches even its ${c.v.fullMean} average.`,
  },
  normal: {
    sharpDown: (c) =>
      `The VIX at ${c.v.cur} sits mid-distribution (${c.v.pctFull} percentile since ${c.v.sinceYear}) after dropping ${c.v.chg21Abs} points in a month. That is a decompression move: an earlier volatility bid has drained away and pricing is settling back into its normal band.`,
    down: (c) =>
      `${c.v.cur} places the VIX in the ordinary middle of its range — ${c.v.pctFull} percentile, against a ${c.v.fullMedian} median — and it has eased ${c.v.chg21Abs} points over the month. Nothing here reads as either complacency or stress; the direction of travel is toward calm.`,
    flat: (c) =>
      `The VIX is sitting at ${c.v.cur}, close to the ${c.v.fullMedian} median of its ${c.v.sinceYear}-onward history and effectively unchanged on the month (${c.v.chg21}). This is the index's baseline state: hedges priced neither cheap nor dear, no directional pressure in implied volatility.`,
    up: (c) =>
      `At ${c.v.cur} — ${c.v.pctFull} percentile of the full history — the VIX has firmed ${c.v.chg21Abs} points over the past month. Demand for protection is building from a mid-range level, so the move matters more as a trend than as an absolute warning.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point jump in a month puts the VIX at ${c.v.cur}, the ${c.v.pctFull} percentile of its record. The level is still mid-distribution, but the speed of the move is the signal: volatility is being repriced quickly rather than drifting.`,
  },
  elevated: {
    sharpDown: (c) =>
      `${c.v.cur} is an elevated reading (${c.v.pctFull} percentile since ${c.v.sinceYear}) but the VIX has already given back ${c.v.chg21Abs} points over the month. Stress is draining out of options pricing faster than it built up, which is the usual shape of a volatility event resolving.`,
    down: (c) =>
      `The VIX is elevated at ${c.v.cur} — above its ${c.v.fullMean} long-run mean, ${c.v.pctFull} percentile of history — but easing, ${c.v.chg21} on the month. Hedges are still expensive by historical standards, just less so than they were.`,
    flat: (c) =>
      `Sitting at ${c.v.cur}, the VIX is meaningfully above its ${c.v.fullMean} historical mean (${c.v.pctFull} percentile) and has held that level all month (${c.v.chg21}). A persistently elevated plateau like this reads as sustained caution rather than an acute shock.`,
    up: (c) =>
      `${c.v.cur} puts the VIX in the ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history and it is still climbing, ${c.v.chg21} over the month. Both the level and the direction now point the same way: the market is paying up for protection and paying more each week.`,
    sharpUp: (c) =>
      `The VIX has surged ${c.v.chg21Abs} points in a month to ${c.v.cur}, the ${c.v.pctFull} percentile of its full record. Elevated and accelerating is the most uncomfortable combination on this index — it typically coincides with an unresolved macro or event risk rather than a passing wobble.`,
  },
  high: {
    sharpDown: (c) =>
      `At ${c.v.cur} the VIX remains in the top decile of its history (${c.v.pctFull} percentile) but has fallen ${c.v.chg21Abs} points in a month. Acute stress is unwinding; on past form the back half of a spike like this retraces faster than the front half built.`,
    down: (c) =>
      `${c.v.cur} is a high reading — ${c.v.pctFull} percentile against a ${c.v.fullMean} long-run mean — and it is receding, ${c.v.chg21} on the month. The market is still braced, but the peak of the fear bid is behind it.`,
    flat: (c) =>
      `The VIX is stuck high at ${c.v.cur}, ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history, with the month producing only ${c.v.chg21} of net change. A high, flat VIX is a market that has repriced risk and is now waiting — the stress is being sustained, not resolved.`,
    up: (c) =>
      `${c.v.cur} is a top-decile reading (${c.v.pctFull} percentile) and still rising, ${c.v.chg21} over the past month. Protection is expensive and getting more so, which historically clusters in the middle of a drawdown rather than at either end.`,
    sharpUp: (c) =>
      `The VIX has exploded ${c.v.chg21Abs} points higher in a month to ${c.v.cur}, deep in the top decile of its ${c.v.sinceYear}-onward record. This is what genuine dislocation looks like on this index: hedging demand overwhelming supply, with the all-time high at ${c.v.fullMax} as the reference for how far it can go.`,
  },
  extreme: {
    sharpDown: (c) =>
      `${c.v.cur} is still an extreme print (${c.v.pctFull} percentile since ${c.v.sinceYear}) but the VIX has collapsed ${c.v.chg21Abs} points over the month. Volatility crushes from these levels are violent and one-directional once the catalyst clears; the index is well into that phase.`,
    down: (c) =>
      `Even easing ${c.v.chg21Abs} points on the month, ${c.v.cur} leaves the VIX in the top 2% of its entire history. Crisis-grade pricing is being slowly walked back, but nothing about this level is normal — the long-run mean is ${c.v.fullMean}.`,
    flat: (c) =>
      `The VIX is pinned at ${c.v.cur}, inside the top 2% of readings since ${c.v.sinceYear}, and has not resolved in either direction this month (${c.v.chg21}). Sustained crisis-level implied volatility usually means the market cannot yet price the outcome, not merely that it dislikes it.`,
    up: (c) =>
      `At ${c.v.cur} the VIX is in the top 2% of its ${c.v.sinceYear}-onward history and still rising (${c.v.chg21} on the month), heading toward the ${c.v.fullMax} all-time record. Options markets are pricing continuous, unhedgeable risk rather than a discrete event.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly surge to ${c.v.cur} places the VIX in the most extreme 2% of its record with momentum still behind it. Only a handful of episodes since ${c.v.sinceYear} have looked like this, and the all-time high of ${c.v.fullMax} is the only meaningful reference point left.`,
  },
};

const gridEntries: NarrativeEntry<VixContext>[] = (
  Object.keys(GRID) as PercentileLevel[]
).flatMap((level) =>
  (Object.keys(GRID[level]) as TrendBucket[]).map((trend) => ({
    id: `vix-grid-${level}-${trend}`,
    priority: 0,
    when: (c: VixContext) => c.level === level && c.trend === trend,
    text: GRID[level][trend],
  })),
);

// ---------------------------------------------------------------------------
// Layer 2 — situational overrides
// ---------------------------------------------------------------------------

const specialEntries: NarrativeEntry<VixContext>[] = [
  {
    id: "vix-record-high",
    priority: 95,
    when: (c) => c.stats.isFullHigh,
    text: (c) =>
      `${c.v.cur} is the highest VIX close in the entire ${c.v.obsFull}-session history going back to ${c.v.sinceYear}. There is no historical precedent above this level, so every comparison is to the downside: the long-run mean is ${c.v.fullMean} and even the 95th percentile is only ${c.v.fullP95}.`,
  },
  {
    id: "vix-record-low",
    priority: 95,
    when: (c) => c.stats.isFullLow,
    text: (c) =>
      `${c.v.cur} is the lowest VIX close ever recorded across ${c.v.obsFull} sessions since ${c.v.sinceYear}. Implied volatility has never been cheaper, which by definition means the index has no room left below and the full ${c.v.fullMin}–${c.v.fullMax} historical range sits above it.`,
  },
  {
    id: "vix-crisis-40",
    priority: 88,
    // A crossing, not a state. Written as `current >= 40` it matched every
    // top-2% reading and made the entire `extreme` grid row unreachable; the
    // grid describes sustained crisis levels, this announces the break.
    when: (c) => c.stats.current >= 40 && c.stats.previous !== null && c.stats.previous < 40,
    text: (c) =>
      `The VIX has broken above 40, ${c.v.prev} to ${c.v.cur} — crisis territory, the ${c.v.pctFull} percentile of ${c.v.obsFull} sessions since ${c.v.sinceYear} and more than double the ${c.v.fullMean} long-run mean. Readings above 40 have historically been confined to genuine systemic events.`,
  },
  {
    id: "vix-year-high-sharp",
    priority: 84,
    when: (c) => c.stats.isYearHigh && c.trend === "sharpUp",
    text: (c) =>
      `At ${c.v.cur} the VIX is at a fresh one-year high, ${c.v.chg21Abs} points above where it stood a month ago and ${c.v.zYrAbs} standard deviations above its ${c.v.yrMean} trailing-year mean. Nothing in the past 12 months has priced this much risk, and the move is still accelerating.`,
  },
  {
    id: "vix-year-low-sharp",
    priority: 84,
    when: (c) => c.stats.isYearLow && c.trend === "sharpDown",
    text: (c) =>
      `${c.v.cur} is the lowest VIX close of the past year, down ${c.v.chg21Abs} points in a month and ${c.v.zYrAbs} standard deviations below the ${c.v.yrMean} trailing-year mean. Hedging demand has been fully unwound — the cheapest protection has been in 12 months, and the momentum is still downward.`,
  },
  {
    id: "vix-shock-up",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd >= 2,
    text: (c) =>
      `The VIX jumped ${c.v.dayAbs} points in a single session to ${c.v.cur} — more than two trailing-year standard deviations (${c.v.yrSd}) in one day. One-day shocks of this size are repricing events rather than drift; the index now sits in the ${c.v.pctFull} percentile of its history.`,
  },
  {
    id: "vix-shock-down",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd <= -2,
    text: (c) =>
      `A ${c.v.dayAbs}-point single-session collapse to ${c.v.cur} is over two trailing-year standard deviations (${c.v.yrSd}) of movement in one day. Drops that abrupt are volatility crushes — an event resolving and the hedges written against it being unwound at once.`,
  },
  {
    id: "vix-year-high",
    priority: 72,
    when: (c) => c.stats.isYearHigh,
    text: (c) =>
      `${c.v.cur} is a one-year high for the VIX, against a trailing-year mean of ${c.v.yrMean} and a 12-month range of ${c.v.yrMin}–${c.v.yrMax}. Set against the full history since ${c.v.sinceYear}, though, it is only the ${c.v.pctFull} percentile — a high bar for this year, not for all time.`,
  },
  {
    id: "vix-year-low",
    priority: 72,
    when: (c) => c.stats.isYearLow,
    text: (c) =>
      `At ${c.v.cur} the VIX has printed a one-year low, below the ${c.v.yrMin} floor that had held the past 12 months and well under the ${c.v.yrMean} trailing-year mean. Against the ${c.v.sinceYear}-onward record it is the ${c.v.pctFull} percentile, so this is quiet by recent standards and quiet by historical ones too.`,
  },
  {
    id: "vix-stress-30",
    priority: 68,
    when: (c) => c.stats.current >= 30 && c.stats.previous !== null && c.stats.previous < 30,
    text: (c) =>
      `The VIX has crossed 30, ${c.v.prev} to ${c.v.cur} — conventionally the line between a correction being priced and a crisis being priced. It now sits ${c.v.zFullAbs} standard deviations above its ${c.v.fullMean} long-run mean, in the ${c.v.pctFull} percentile of the history since ${c.v.sinceYear}.`,
  },
  {
    id: "vix-extreme-z-high",
    priority: 66,
    when: (c) => c.stats.zYear >= 2.5,
    text: (c) =>
      `${c.v.cur} is ${c.v.zYrAbs} standard deviations above the VIX's ${c.v.yrMean} trailing-year mean — a genuine outlier relative to how this index has behaved over the past 12 months. The trailing-year range was ${c.v.yrMin}–${c.v.yrMax}, so current pricing is outside the regime the last year established.`,
  },
  {
    id: "vix-extreme-z-low",
    priority: 66,
    when: (c) => c.stats.zYear <= -2.5,
    text: (c) =>
      `At ${c.v.cur} the VIX is ${c.v.zYrAbs} standard deviations below its ${c.v.yrMean} trailing-year mean, an outlier against the ${c.v.yrMin}–${c.v.yrMax} band that has contained it for 12 months. Implied volatility is priced for less turbulence than any point in the recent regime.`,
  },
  {
    id: "vix-complacency-12",
    priority: 64,
    when: (c) => c.stats.current < 12 && c.stats.previous !== null && c.stats.previous >= 12,
    text: (c) =>
      `The VIX has dropped under 12, ${c.v.prev} to ${c.v.cur}, putting it in the ${c.v.pctFull} percentile of its ${c.v.sinceYear}-onward history against an all-time low of ${c.v.fullMin}. Sub-12 readings mean index options are pricing almost no near-term movement — historically the flattest, most complacent stretches of a cycle.`,
  },
  {
    id: "vix-at-long-run-mean",
    priority: 62,
    when: (c) => Math.abs(c.stats.zFull) < 0.05,
    text: (c) =>
      `The VIX is sitting essentially on its own long-run average: ${c.v.cur} against a ${c.v.fullMean} mean across ${c.v.obsFull} sessions since ${c.v.sinceYear}. That is a genuinely neutral reading — no historical edge in either direction — and the month's ${c.v.chg21} change is what to watch instead of the level.`,
  },
  {
    id: "vix-first-time-above-20",
    priority: 60,
    when: (c) =>
      c.stats.current >= 20 &&
      c.stats.previous !== null &&
      c.stats.previous < 20 &&
      c.stats.current < 30,
    text: (c) =>
      `The VIX has crossed back above 20 to ${c.v.cur}, up from ${c.v.prev}. Twenty is the rough dividing line between the index's calm and active regimes — it sits just above the ${c.v.fullMedian} historical median — and crossing it tends to coincide with a widening of realized daily ranges.`,
  },
  {
    id: "vix-first-time-below-20",
    priority: 60,
    when: (c) => c.stats.current < 20 && c.stats.previous !== null && c.stats.previous >= 20,
    text: (c) =>
      `The VIX has slipped back below 20 to ${c.v.cur} from ${c.v.prev}, returning to the calmer half of its distribution (median ${c.v.fullMedian} since ${c.v.sinceYear}). Reclaiming the sub-20 regime is usually what confirms a volatility episode has passed rather than paused.`,
  },
  {
    id: "vix-long-streak-up",
    priority: 56,
    when: (c) => c.stats.streak >= 5,
    text: (c) =>
      `The VIX has risen ${c.v.streakAbs} sessions in a row to ${c.v.cur}. Unbroken runs are unusual for a mean-reverting index like this one, and they indicate a steady daily accumulation of hedges rather than a single event — the month is now ${c.v.chg21} in total.`,
  },
  {
    id: "vix-long-streak-down",
    priority: 56,
    when: (c) => c.stats.streak <= -5,
    text: (c) =>
      `${c.v.streakAbs} consecutive down sessions have brought the VIX to ${c.v.cur}. Grinding, uninterrupted declines like this are the signature of a market steadily selling volatility into a rising tape, leaving the month ${c.v.chg21} lower.`,
  },
  {
    id: "vix-compressed-range",
    priority: 52,
    // Thresholds are deliberately tight. At 0.4 with no trend condition this
    // matched a third of all history and starved the grid; genuine compression
    // means both a small realized range and no net drift.
    when: (c) =>
      c.stats.year.sd > 0 &&
      c.stats.recentSd < 0.3 * c.stats.year.sd &&
      Math.abs(c.stats.trendStrength) < 0.6,
    text: (c) =>
      `The VIX has gone quiet in an unusual way: its own realized variation over the past month (${c.stats.recentSd.toFixed(2)}) is under a third of the ${c.v.yrSd} trailing-year figure, with the level parked at ${c.v.cur} and no net drift (${c.v.chg21}). Compressed volatility-of-volatility tends not to last — the index either grinds lower or breaks sharply out.`,
  },
  {
    id: "vix-expanding-range",
    priority: 52,
    when: (c) => c.stats.year.sd > 0 && c.stats.recentSd > 1.8 * c.stats.year.sd,
    text: (c) =>
      `Day-to-day swings in the VIX itself have blown out — a ${c.stats.recentSd.toFixed(2)} realized deviation over the past month against ${c.v.yrSd} for the trailing year, with the index at ${c.v.cur}. When the fear gauge becomes this unstable, the market is disagreeing violently about how much risk to price.`,
  },
  {
    id: "vix-regime-hotter",
    priority: 46,
    // Regime drift is a persistent condition, so it is gated to a flat trend:
    // it surfaces when there is no recent move worth describing instead, and
    // otherwise leaves the level×trend grid to do the talking.
    when: (c) =>
      c.trend === "flat" &&
      c.stats.full.sd > 0 &&
      c.stats.year.mean - c.stats.full.mean > 0.75 * c.stats.full.sd,
    text: (c) =>
      `Worth separating the level from the regime: at ${c.v.cur} the VIX is ${c.v.pctYr} percentile for the past year, but the year itself has run hot — a ${c.v.yrMean} trailing mean against ${c.v.fullMean} for the full history since ${c.v.sinceYear}. Recent normal is elevated by historical standards.`,
  },
  {
    id: "vix-regime-cooler",
    priority: 46,
    when: (c) =>
      c.trend === "flat" &&
      c.stats.full.sd > 0 &&
      c.stats.full.mean - c.stats.year.mean > 0.75 * c.stats.full.sd,
    text: (c) =>
      `The past year has been unusually calm for this index: a ${c.v.yrMean} trailing mean versus ${c.v.fullMean} across the whole ${c.v.sinceYear}-onward record, with the VIX now at ${c.v.cur}. It reads as the ${c.v.pctYr} percentile of the recent regime but only the ${c.v.pctFull} percentile of history — recent normal is quiet normal.`,
  },
  {
    id: "vix-round-trip",
    priority: 44,
    when: (c) =>
      c.stats.change63d !== null &&
      c.stats.change21d !== null &&
      c.stats.year.sd > 0 &&
      Math.abs(c.stats.change63d) < 0.25 * c.stats.year.sd &&
      Math.abs(c.stats.change21d) > c.stats.year.sd,
    text: (c) =>
      `The VIX has round-tripped: ${c.v.chg63} over the past quarter but ${c.v.chg21} in just the last month, ending at ${c.v.cur}. A large recent move that nets out to nothing over 63 sessions means an episode was priced in and then priced back out, leaving the index where it started.`,
  },
  {
    id: "vix-dormant-level",
    priority: 40,
    when: (c) => (c.stats.sessionsSinceHigher ?? 0) >= 120,
    text: (c) =>
      `${c.v.cur} is the highest the VIX has closed in ${c.stats.sessionsSinceHigher} sessions — roughly ${Math.round((c.stats.sessionsSinceHigher ?? 0) / 21)} months. Breaking a dormant ceiling matters more than the absolute level, which is still only the ${c.v.pctFull} percentile of the history since ${c.v.sinceYear}.`,
  },
];

export const VIX_CATALOG: NarrativeEntry<VixContext>[] = [...specialEntries, ...gridEntries];

export function buildVixContext(stats: SeriesStats): VixContext {
  return {
    stats,
    trend: classifyTrend(stats),
    v: buildVocab(stats),
    level: classifyPercentileLevel(stats.pctRankFull),
  };
}

export function interpretVix(stats: SeriesStats | null): Interpretation | null {
  if (!stats) return null;
  return selectNarrative(VIX_CATALOG, buildVixContext(stats));
}
