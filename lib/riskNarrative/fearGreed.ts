// Fear & Greed interpretation catalog: 52 entries.
//
// Two things constrain the copy here, both deliberate:
//
// 1. CNN's graphdata payload carries only ~251 daily points — about one trading
//    year — so there is no all-time distribution to cite. Every entry therefore
//    frames its statistics as "the past year" and none of them claim an
//    all-time average. (VIX and the spread do have decades of history and their
//    catalogs say so.)
// 2. Levels come from CNN's own `rating` string rather than cutoffs invented
//    here, with a numeric fallback matching CNN's published bands.

import type { SeriesStats } from "@/lib/riskStats";
import {
  buildVocab,
  classifyTrend,
  selectNarrative,
  type BaseContext,
  type Interpretation,
  type NarrativeEntry,
  type TrendBucket,
} from "./types";

export type FgLevel = "extremeFear" | "fear" | "neutral" | "greed" | "extremeGreed";

export interface FgComponent {
  label: string;
  score: number | null;
  rating: string | null;
}

export interface FgAnchors {
  previousClose: number | null;
  previous1Week: number | null;
  previous1Month: number | null;
  previous1Year: number | null;
}

export interface FearGreedContext extends BaseContext {
  level: FgLevel;
  anchors: FgAnchors;
  components: FgComponent[];
}

/** CNN's published bands, used when the API omits a rating string. */
export function classifyFgLevel(score: number, rating: string | null): FgLevel {
  const r = rating?.toLowerCase().trim();
  if (r === "extreme fear") return "extremeFear";
  if (r === "fear") return "fear";
  if (r === "neutral") return "neutral";
  if (r === "greed") return "greed";
  if (r === "extreme greed") return "extremeGreed";
  if (score < 25) return "extremeFear";
  if (score < 45) return "fear";
  if (score < 55) return "neutral";
  if (score < 75) return "greed";
  return "extremeGreed";
}

function countRating(components: FgComponent[], ratings: string[]): number {
  return components.filter((c) => c.rating !== null && ratings.includes(c.rating.toLowerCase().trim()))
    .length;
}

type GridText = (c: FearGreedContext) => string;

// ---------------------------------------------------------------------------
// Layer 1 — exhaustive level × trend grid
// ---------------------------------------------------------------------------

const GRID: Record<FgLevel, Record<TrendBucket, GridText>> = {
  extremeFear: {
    sharpDown: (c) =>
      `At ${c.v.cur} the index is in extreme fear and has fallen ${c.v.chg21Abs} points over the past month, against a trailing-year average of ${c.v.yrMean}. Positioning is capitulating rather than merely cautious — this is the ${c.v.pctYr} percentile of the past 12 months, and the deterioration is still accelerating.`,
    down: (c) =>
      `A reading of ${c.v.cur} sits in extreme fear, ${c.v.chg21} on the month and well below the ${c.v.yrMean} average of the past year. Each of CNN's seven inputs is a positioning or breadth measure, so this describes investors actively de-risking, not just feeling nervous.`,
    flat: (c) =>
      `The index has settled at ${c.v.cur} in extreme fear, changing only ${c.v.chg21} over the month. Sustained extreme fear is different from a panic spike: it suggests risk has already been reduced and is being held down rather than dumped, with the past year averaging ${c.v.yrMean}.`,
    up: (c) =>
      `${c.v.cur} is still extreme fear but the index has recovered ${c.v.chg21Abs} points over the month. Improvement from a washed-out base is the more informative half of this reading — sentiment is repairing while the absolute level remains at the ${c.v.pctYr} percentile of the past year.`,
    sharpUp: (c) =>
      `Despite a ${c.v.chg21Abs}-point rebound in a month, ${c.v.cur} keeps the index in extreme fear. Sharp recoveries off depressed sentiment are how fear regimes typically end, though the level says the repair is still in its early stage relative to the ${c.v.yrMean} trailing-year average.`,
  },
  fear: {
    sharpDown: (c) =>
      `The index has dropped ${c.v.chg21Abs} points in a month to ${c.v.cur}, putting it in fear and at the ${c.v.pctYr} percentile of the past year. The speed matters as much as the level: sentiment is deteriorating quickly and has not yet found a floor.`,
    down: (c) =>
      `${c.v.cur} reads as fear, ${c.v.chg21} over the month and below the ${c.v.yrMean} average of the trailing year. Breadth, put/call activity and safe-haven demand are collectively pointing at investors trimming exposure rather than adding it.`,
    flat: (c) =>
      `The index is holding at ${c.v.cur} in fear territory, with the month producing only ${c.v.chg21} of change against a ${c.v.yrMean} trailing-year mean. A stable fear reading describes persistent caution — hedged, defensively positioned, but not in the process of unwinding.`,
    up: (c) =>
      `At ${c.v.cur} the index remains in fear but has improved ${c.v.chg21Abs} points on the month. Sentiment is grinding back toward neutral; the ${c.v.yrMin}–${c.v.yrMax} range of the past year puts the current reading at the ${c.v.pctYr} percentile.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point jump in a month has lifted the index to ${c.v.cur}, still fear but recovering fast. Rapid moves through the fear band tend to run on toward neutral or greed rather than stall, with the trailing-year average at ${c.v.yrMean}.`,
  },
  neutral: {
    sharpDown: (c) =>
      `${c.v.cur} is a neutral reading, but it arrived via a ${c.v.chg21Abs}-point decline over the month. Neutral on the way down is not the same as neutral at rest — the index is passing through the middle of its ${c.v.yrMin}–${c.v.yrMax} yearly range with momentum against it.`,
    down: (c) =>
      `The index sits at ${c.v.cur}, technically neutral and ${c.v.chg21} on the month. Sentiment is cooling from firmer levels without yet committing to fear; the past year has averaged ${c.v.yrMean}.`,
    flat: (c) =>
      `At ${c.v.cur} the index is neutral and has barely moved this month (${c.v.chg21}). Genuinely balanced positioning: CNN's seven inputs are not collectively leaning either way, and the ${c.v.pctYr} percentile placement over the past year confirms this is an ordinary reading rather than a resting point between extremes.`,
    up: (c) =>
      `${c.v.cur} puts the index at neutral after a ${c.v.chg21Abs}-point improvement over the month. Risk appetite is rebuilding toward the greed side of the scale, with the trailing-year mean at ${c.v.yrMean} and the yearly range spanning ${c.v.yrMin}–${c.v.yrMax}.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly surge has carried the index to ${c.v.cur}, neutral in level but not in direction. Fast transits through neutral usually continue: the balance of CNN's inputs has flipped decisively over four weeks.`,
  },
  greed: {
    sharpDown: (c) =>
      `${c.v.cur} still reads as greed but the index has shed ${c.v.chg21Abs} points in a month. Risk appetite is being withdrawn quickly from an optimistic base — worth noting because the level alone understates how much sentiment has already changed.`,
    down: (c) =>
      `The index is at ${c.v.cur} in greed territory, easing ${c.v.chg21Abs} points over the month against a ${c.v.yrMean} trailing-year average. Positioning is still constructive, just less so than it was four weeks ago.`,
    flat: (c) =>
      `Sitting at ${c.v.cur}, the index is in greed and steady (${c.v.chg21} on the month). Sustained greed without escalation is a market comfortably long: breadth and momentum inputs are supportive, and nothing in the mix is flashing the crowding that extreme readings imply.`,
    up: (c) =>
      `${c.v.cur} is a greed reading that is still climbing, ${c.v.chg21} over the past month and the ${c.v.pctYr} percentile of the trailing year. Risk appetite is broadening; the distance to the extreme-greed threshold at 75 is what to watch from here.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly gain puts the index at ${c.v.cur}, well into greed. Momentum of this order tends to carry into extreme greed, where CNN's inputs start describing crowded positioning rather than healthy participation — the trailing-year high is ${c.v.yrMax}.`,
  },
  extremeGreed: {
    sharpDown: (c) =>
      `At ${c.v.cur} the index is still in extreme greed but has fallen ${c.v.chg21Abs} points in a month. Sentiment unwinding from a crowded base is the most consequential pattern on this index, because the positioning that has to be reversed was built at the top of the ${c.v.yrMin}–${c.v.yrMax} yearly range.`,
    down: (c) =>
      `${c.v.cur} keeps the index in extreme greed while easing ${c.v.chg21Abs} points over the month. Crowded positioning is being trimmed at the margin, but the level still describes an unusually one-sided market versus the ${c.v.yrMean} trailing-year average.`,
    flat: (c) =>
      `The index is entrenched at ${c.v.cur} in extreme greed, with only ${c.v.chg21} of movement this month. Persistent extreme greed means the crowding is not resolving — breadth, momentum and options activity are all sustaining levels that sit at the ${c.v.pctYr} percentile of the past year.`,
    up: (c) =>
      `${c.v.cur} is extreme greed and still rising, ${c.v.chg21} over the month. CNN's inputs are collectively at their most risk-seeking; the trailing-year high of ${c.v.yrMax} is the only remaining reference for how much further this has gone before.`,
    sharpUp: (c) =>
      `A ${c.v.chg21Abs}-point monthly surge to ${c.v.cur} pushes the index deep into extreme greed. Every one of CNN's seven inputs feeds off price and positioning, so a move this fast means momentum, breadth and options flow have gone one-directional together — historically the most fragile configuration on this scale.`,
  },
};

const gridEntries: NarrativeEntry<FearGreedContext>[] = (Object.keys(GRID) as FgLevel[]).flatMap(
  (level) =>
    (Object.keys(GRID[level]) as TrendBucket[]).map((trend) => ({
      id: `fg-grid-${level}-${trend}`,
      priority: 0,
      when: (c: FearGreedContext) => c.level === level && c.trend === trend,
      text: GRID[level][trend],
    })),
);

// ---------------------------------------------------------------------------
// Layer 2 — situational overrides
// ---------------------------------------------------------------------------

const specialEntries: NarrativeEntry<FearGreedContext>[] = [
  {
    id: "fg-annual-high",
    priority: 92,
    when: (c) => c.stats.isFullHigh,
    text: (c) =>
      `${c.v.cur} is the highest Fear & Greed reading of the past year, clearing the ${c.v.yrMax} ceiling that had held for 12 months against a ${c.v.yrMean} average. Sentiment is at its most risk-seeking point in CNN's available history for this series, which extends back one year.`,
  },
  {
    id: "fg-annual-low",
    priority: 92,
    when: (c) => c.stats.isFullLow,
    text: (c) =>
      `At ${c.v.cur} this is the lowest Fear & Greed print of the past year, below the ${c.v.yrMin} floor of the previous 12 months and far under the ${c.v.yrMean} average. Positioning is more defensive than at any point in the year of history CNN exposes.`,
  },
  {
    id: "fg-extreme-greed-90",
    priority: 86,
    when: (c) => c.stats.current >= 90,
    text: (c) =>
      `A reading of ${c.v.cur} is near the top of the 0–100 scale — extreme greed with almost nothing above it. All seven of CNN's inputs are price- and positioning-derived, so a number this high means momentum, breadth, junk-bond demand and options flow are simultaneously stretched. The past year has averaged ${c.v.yrMean}.`,
  },
  {
    id: "fg-extreme-fear-10",
    priority: 86,
    when: (c) => c.stats.current <= 10,
    text: (c) =>
      `${c.v.cur} is close to the floor of the 0–100 scale. Extreme fear this deep has historically coincided with forced de-risking rather than ordinary caution, and it leaves the index ${c.v.zYrAbs} standard deviations below its ${c.v.yrMean} trailing-year mean.`,
  },
  {
    id: "fg-shock-up",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd >= 2,
    text: (c) =>
      `The index jumped ${c.v.dayAbs} points in a single session to ${c.v.cur} — over two trailing-year standard deviations (${c.v.yrSd}) in a day. Because the underlying inputs are slow-moving breadth and flow measures, a one-day move this large means several of them repriced at once.`,
  },
  {
    id: "fg-shock-down",
    priority: 80,
    when: (c) =>
      c.stats.dayChange !== null && c.stats.year.sd > 0 && c.stats.dayChange / c.stats.year.sd <= -2,
    text: (c) =>
      `A ${c.v.dayAbs}-point single-session drop to ${c.v.cur} is more than two trailing-year standard deviations (${c.v.yrSd}) of movement in one day. Sentiment gauges rarely move like this without a broad risk-off session behind them — several of CNN's seven inputs must have deteriorated together.`,
  },
  {
    id: "fg-flip-to-greed",
    priority: 74,
    when: (c) =>
      c.anchors.previous1Month !== null && c.anchors.previous1Month < 45 && c.stats.current >= 55,
    text: (c) =>
      `The index has flipped regimes: ${c.anchors.previous1Month?.toFixed(0)} a month ago sat in fear, and ${c.v.cur} today is greed. A full crossing of the neutral band in four weeks is a genuine change in positioning, not noise — the trailing-year range is ${c.v.yrMin}–${c.v.yrMax}.`,
  },
  {
    id: "fg-flip-to-fear",
    priority: 74,
    when: (c) =>
      c.anchors.previous1Month !== null && c.anchors.previous1Month >= 55 && c.stats.current < 45,
    text: (c) =>
      `Sentiment has crossed the whole neutral band in a month: ${c.anchors.previous1Month?.toFixed(0)} was greed, ${c.v.cur} is fear. Reversals of that size mean breadth and options activity turned together, and they leave the index at the ${c.v.pctYr} percentile of the past year.`,
  },
  {
    id: "fg-components-split",
    priority: 26,
    // A one-each split is the *normal* state of this index — replaying a year of
    // CNN's component history, at least one input read extreme greed and one
    // extreme fear on 63% of sessions. Only a deep two-sided polarization is
    // worth leading with, and it sits below the other specials accordingly.
    when: (c) =>
      countRating(c.components, ["extreme greed"]) >= 3 &&
      countRating(c.components, ["extreme fear"]) >= 3,
    text: (c) =>
      `The headline ${c.v.cur} hides a deep split: ${countRating(c.components, ["extreme greed"])} of CNN's seven inputs read extreme greed while ${countRating(c.components, ["extreme fear"])} read extreme fear. A composite built from inputs pointing this firmly in opposite directions is less informative than its single number suggests — the component breakdown below is doing more work than the total here.`,
  },
  {
    // Both alignment entries require near-unanimity (6 of 7) and sit at a low
    // priority. At 5 of 7 and priority 68 they matched almost every reading and
    // made the entire level×trend grid unreachable — alignment is only worth
    // leading with when it is close to total.
    id: "fg-components-aligned-greed",
    priority: 34,
    when: (c) => countRating(c.components, ["greed", "extreme greed"]) >= 6,
    text: (c) =>
      `${countRating(c.components, ["greed", "extreme greed"])} of CNN's seven inputs are in greed or extreme greed, supporting the ${c.v.cur} headline. Near-unanimous agreement across momentum, breadth, credit and options measures makes this reading more meaningful than the same score built on one or two stretched components.`,
  },
  {
    id: "fg-components-aligned-fear",
    priority: 34,
    when: (c) => countRating(c.components, ["fear", "extreme fear"]) >= 6,
    text: (c) =>
      `${countRating(c.components, ["fear", "extreme fear"])} of the seven inputs sit in fear or extreme fear, so the ${c.v.cur} headline reflects near-unanimous caution rather than one outlier. When the components align this closely, the composite is describing consistent de-risking across price, credit and options markets.`,
  },
  {
    id: "fg-week-swing",
    priority: 64,
    when: (c) =>
      c.anchors.previous1Week !== null && Math.abs(c.stats.current - c.anchors.previous1Week) >= 20,
    text: (c) =>
      `The index has moved ${Math.abs(c.stats.current - (c.anchors.previous1Week ?? 0)).toFixed(0)} points in a single week, from ${c.anchors.previous1Week?.toFixed(0)} to ${c.v.cur}. Weekly swings of that size are rare on a composite of slow-moving breadth and flow inputs, and they usually mark the start of a new regime rather than a blip.`,
  },
  {
    id: "fg-z-extreme-high",
    priority: 62,
    when: (c) => c.stats.zYear >= 2.5,
    text: (c) =>
      `At ${c.v.cur} the index is ${c.v.zYrAbs} standard deviations above its ${c.v.yrMean} trailing-year mean — outside the ${c.v.yrMin}–${c.v.yrMax} band that contained it all year. Sentiment has left the range the past 12 months established as normal.`,
  },
  {
    id: "fg-z-extreme-low",
    priority: 62,
    when: (c) => c.stats.zYear <= -2.5,
    text: (c) =>
      `${c.v.cur} sits ${c.v.zYrAbs} standard deviations below the ${c.v.yrMean} average of the past year, outside the ${c.v.yrMin}–${c.v.yrMax} range that held for 12 months. This is a statistical outlier against the recent regime, not merely a low reading.`,
  },
  {
    id: "fg-vs-year-ago-higher",
    priority: 58,
    when: (c) =>
      c.anchors.previous1Year !== null && c.stats.current - c.anchors.previous1Year >= 25,
    text: (c) =>
      `Twelve months ago this index read ${c.anchors.previous1Year?.toFixed(0)}; today it is ${c.v.cur}. A shift of that magnitude over a year is a full sentiment cycle — the same seven inputs that were pricing caution then are pricing appetite now, with the year averaging ${c.v.yrMean} in between.`,
  },
  {
    id: "fg-vs-year-ago-lower",
    priority: 58,
    when: (c) =>
      c.anchors.previous1Year !== null && c.anchors.previous1Year - c.stats.current >= 25,
    text: (c) =>
      `A year ago the index stood at ${c.anchors.previous1Year?.toFixed(0)} against ${c.v.cur} now — sentiment has round-tripped a full band or more over 12 months. The trailing-year mean of ${c.v.yrMean} sits between the two, so the current reading is the low end of a year-long deterioration.`,
  },
  {
    id: "fg-long-streak-up",
    priority: 56,
    when: (c) => c.stats.streak >= 5,
    text: (c) =>
      `The index has risen ${c.v.streakAbs} sessions in a row to ${c.v.cur}. Because its inputs are multi-day breadth and flow averages, unbroken runs indicate a steady accumulation of risk appetite rather than a single catalyst — the month totals ${c.v.chg21}.`,
  },
  {
    id: "fg-long-streak-down",
    priority: 56,
    when: (c) => c.stats.streak <= -5,
    text: (c) =>
      `${c.v.streakAbs} consecutive down sessions have taken the index to ${c.v.cur}. A grinding, uninterrupted slide in sentiment points to persistent distribution rather than a one-day shock, leaving the month ${c.v.chg21}.`,
  },
  {
    id: "fg-pinned-neutral",
    priority: 54,
    when: (c) =>
      c.level === "neutral" && c.stats.year.sd > 0 && c.stats.recentSd < 0.5 * c.stats.year.sd,
    text: (c) =>
      `The index has been pinned near neutral at ${c.v.cur}, with its own month-to-month variation (${c.stats.recentSd.toFixed(1)}) at half the ${c.v.yrSd} trailing-year figure. Neither fear nor greed is establishing itself, and the flatness is itself the observation — this composite rarely sits still for long.`,
  },
  {
    id: "fg-compressed-range",
    priority: 50,
    when: (c) =>
      c.stats.year.sd > 0 &&
      c.stats.recentSd < 0.3 * c.stats.year.sd &&
      Math.abs(c.stats.trendStrength) < 0.6,
    text: (c) =>
      `Sentiment has gone unusually quiet at ${c.v.cur}: variation over the past month (${c.stats.recentSd.toFixed(1)}) is under a third of the ${c.v.yrSd} trailing-year figure, with no net drift (${c.v.chg21}). A composite this stable means none of CNN's seven inputs is moving much — a settled regime that tends to break rather than fade.`,
  },
  {
    id: "fg-expanding-range",
    priority: 50,
    when: (c) => c.stats.year.sd > 0 && c.stats.recentSd > 1.8 * c.stats.year.sd,
    text: (c) =>
      `The index has become erratic — a ${c.stats.recentSd.toFixed(1)} realized deviation over the past month against ${c.v.yrSd} for the trailing year, currently ${c.v.cur}. Wide swings in a slow composite mean its inputs are disagreeing and reversing rather than trending together.`,
  },
  {
    id: "fg-crossed-50-up",
    priority: 46,
    when: (c) => c.stats.current >= 50 && c.stats.previous !== null && c.stats.previous < 50,
    text: (c) =>
      `The index has crossed back above the midpoint, ${c.v.prev} to ${c.v.cur}. Fifty is the dividing line between net fear and net greed on this scale, and reclaiming it is what usually confirms a sentiment recovery rather than a pause in a decline. The past year has averaged ${c.v.yrMean}.`,
  },
  {
    id: "fg-crossed-50-down",
    priority: 46,
    when: (c) => c.stats.current < 50 && c.stats.previous !== null && c.stats.previous >= 50,
    text: (c) =>
      `Sentiment has slipped below the midpoint, ${c.v.prev} to ${c.v.cur}, tipping the composite from net greed to net fear. The 50 line is where more of CNN's seven inputs are pointing down than up, and crossing it has historically preceded further deterioration more often than an immediate snapback.`,
  },
  {
    id: "fg-at-year-mean",
    priority: 44,
    when: (c) => Math.abs(c.stats.zYear) < 0.05,
    text: (c) =>
      `The index is sitting essentially on its own trailing-year average: ${c.v.cur} against ${c.v.yrMean} over the past 12 months. There is no positioning signal in the level at all, so the month's ${c.v.chg21} change and the component split below carry whatever information this reading has.`,
  },
  {
    id: "fg-round-trip",
    priority: 42,
    when: (c) =>
      c.stats.change63d !== null &&
      c.stats.change21d !== null &&
      c.stats.year.sd > 0 &&
      Math.abs(c.stats.change63d) < 0.25 * c.stats.year.sd &&
      Math.abs(c.stats.change21d) > c.stats.year.sd,
    text: (c) =>
      `Sentiment has round-tripped: ${c.v.chg63} over the past quarter but ${c.v.chg21} in the last month alone, ending at ${c.v.cur}. A large recent swing that nets to nothing across 63 sessions means the market cycled through a sentiment shift and came back to where it started.`,
  },
  {
    id: "fg-dormant-high",
    priority: 40,
    when: (c) => (c.stats.sessionsSinceHigher ?? 0) >= 120,
    text: (c) =>
      `${c.v.cur} is the highest this index has closed in ${c.stats.sessionsSinceHigher} sessions — roughly ${Math.round((c.stats.sessionsSinceHigher ?? 0) / 21)} months. Breaking a ceiling that has capped sentiment for that long says more than the level itself, which is the ${c.v.pctYr} percentile of the past year.`,
  },
  {
    id: "fg-dormant-low",
    priority: 40,
    when: (c) => (c.stats.sessionsSinceLower ?? 0) >= 120,
    text: (c) =>
      `At ${c.v.cur} the index is the lowest it has closed in ${c.stats.sessionsSinceLower} sessions, about ${Math.round((c.stats.sessionsSinceLower ?? 0) / 21)} months. Sentiment has quietly ground to the bottom of its multi-month range rather than gapping there.`,
  },
  {
    id: "fg-prior-close-gap",
    priority: 30,
    when: (c) =>
      c.anchors.previousClose !== null && Math.abs(c.stats.current - c.anchors.previousClose) >= 8,
    text: (c) =>
      `The index moved ${Math.abs(c.stats.current - (c.anchors.previousClose ?? 0)).toFixed(0)} points from the prior close of ${c.anchors.previousClose?.toFixed(0)} to ${c.v.cur}. That is a large single-session step for a composite of seven slow-moving breadth, credit and options inputs, and it leaves the reading at the ${c.v.pctYr} percentile of the trailing year.`,
  },
];

export const FEAR_GREED_CATALOG: NarrativeEntry<FearGreedContext>[] = [
  ...specialEntries,
  ...gridEntries,
];

export function buildFearGreedContext(
  stats: SeriesStats,
  anchors: FgAnchors,
  components: FgComponent[],
): FearGreedContext {
  return {
    stats,
    trend: classifyTrend(stats),
    // Whole-number formatting: CNN publishes this index as an integer score.
    v: buildVocab(stats, 0),
    level: classifyFgLevel(stats.current, null),
    anchors,
    components,
  };
}

export function interpretFearGreed(
  stats: SeriesStats | null,
  anchors: FgAnchors,
  components: FgComponent[],
  rating: string | null,
): Interpretation | null {
  if (!stats) return null;
  const ctx = buildFearGreedContext(stats, anchors, components);
  // Prefer CNN's own rating for the current reading when the API supplied one.
  return selectNarrative(FEAR_GREED_CATALOG, {
    ...ctx,
    level: classifyFgLevel(stats.current, rating),
  });
}
