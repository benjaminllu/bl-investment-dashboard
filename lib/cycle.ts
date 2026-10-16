/**
 * The business-cycle overlay — the "why" layer under the rotation signals.
 *
 * Everything else on the sectors page is derived from prices, and prices are
 * the fastest thing available but they only ever say *what* is happening. The
 * standard framework for why is the business-cycle approach to sector
 * investing: growth, credit, the curve and inflation define a phase, and each
 * phase has historically favoured a different set of sectors.
 *
 * The phase table this page ships is Fidelity's, from "The Business Cycle
 * Approach to Equity Sector Investing" (fidelity.com/viewpoints — the framework
 * has been published in essentially this form since 2014). It is quoted as a
 * published reference, not computed here, and the UI says so. What *is*
 * computed is the phase classification below and the comparison against what
 * the market is actually doing, which is the only part that can be wrong in an
 * interesting way.
 *
 *
 * ON ISM PMI
 *
 * The obvious growth input for this framework is the ISM manufacturing PMI, and
 * it is not here. ISM licenses the series commercially and pulled it from FRED
 * in 2016; there is no free feed. The substitute is the Chicago Fed National
 * Activity Index, three-month average (CFNAIMA3) — a weighted composite of 85
 * monthly indicators, zero-centred on trend growth, with a published
 * recession-onset threshold of −0.70 that this file uses directly rather than
 * inventing one. It is a broader measure than ISM and a slower one: it lands
 * with roughly a one-month lag against ISM's first-business-day release.
 *
 *
 * THE HONEST LIMIT
 *
 * Four indicators cannot identify a business-cycle phase reliably, and the
 * boundaries between phases are not sharp in the underlying economy either.
 * This produces a label and shows every input that produced it, so the label
 * can be disagreed with rather than merely believed. It is not a forecast, and
 * nothing on this page sizes a position from it.
 */

import { percentileRank } from "./series";

export type CyclePhase = "early" | "mid" | "late" | "recession";

export const CYCLE_PHASES: CyclePhase[] = ["early", "mid", "late", "recession"];

export const PHASE_LABEL: Record<CyclePhase, string> = {
  early: "Early cycle",
  mid: "Mid cycle",
  late: "Late cycle",
  recession: "Recession",
};

export const PHASE_DESCRIPTION: Record<CyclePhase, string> = {
  early: "Activity rebounding from a trough, credit reopening, policy still loose. Historically the strongest phase for equities and the shortest.",
  mid: "Growth at or above trend and steady, credit healthy, policy neutral. The longest phase, and the one with the least sector dispersion.",
  late: "Growth positive but decelerating, inflation and rates elevated, spreads tight. Defensives and real assets have tended to hold up best.",
  recession: "Activity contracting, credit tightening. Only the defensive sectors have historically outperformed.",
};

/** Sector tickers each phase has historically favoured, per the Fidelity framework. */
export const PHASE_PLAYBOOK: Record<CyclePhase, { favoured: string[]; laggards: string[] }> = {
  early: {
    favoured: ["XLY", "XLF", "XLRE", "XLI", "XLB"],
    laggards: ["XLU", "XLP", "XLV", "XLE"],
  },
  mid: {
    favoured: ["XLK", "XLC", "XLI"],
    laggards: ["XLU", "XLB", "XLE"],
  },
  late: {
    favoured: ["XLE", "XLB", "XLV", "XLP", "XLU"],
    laggards: ["XLY", "XLK", "XLC"],
  },
  recession: {
    favoured: ["XLP", "XLU", "XLV"],
    laggards: ["XLY", "XLK", "XLRE", "XLI"],
  },
};

export interface CycleInput {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  unit: string;
  decimals: number;
  /** Change over roughly three months of observations, in the series' own units. */
  change3m: number | null;
  /** Where the level sits in ten years of its own history, 0–100. */
  percentile: number | null;
  /** One clause on what this reading means for the phase call. */
  read: string;
}

export interface CycleData {
  available: boolean;
  phase: CyclePhase | null;
  /** The rule that fired, written out so the classification is checkable. */
  rationale: string;
  inputs: CycleInput[];
  /** How far off trend growth is, for the position marker on the phase strip. */
  asOf: string | null;
}

interface SeriesDef {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  transform: "lin" | "pc1";
  /** Observations spanning roughly three months, for the direction reading. */
  quarterLag: number;
}

const SERIES: SeriesDef[] = [
  { id: "CFNAIMA3", label: "Activity (CFNAI 3m)", unit: "σ", decimals: 2, transform: "lin", quarterLag: 3 },
  { id: "BAMLH0A0HYM2", label: "High-yield spread", unit: "%", decimals: 2, transform: "lin", quarterLag: 63 },
  { id: "T10Y2Y", label: "10Y−2Y curve", unit: "%", decimals: 2, transform: "lin", quarterLag: 63 },
  { id: "CPIAUCSL", label: "CPI inflation", unit: "%", decimals: 1, transform: "pc1", quarterLag: 3 },
  { id: "UNRATE", label: "Unemployment", unit: "%", decimals: 1, transform: "lin", quarterLag: 3 },
];

/** The Chicago Fed's own published threshold for an increasing likelihood a recession has begun. */
const CFNAI_RECESSION = -0.7;
/** Growth is "at trend" inside this band; CFNAI is constructed to average zero. */
const CFNAI_TREND_BAND = 0.2;

interface Observation {
  date: string;
  value: number;
}

async function fetchSeries(def: SeriesDef, apiKey: string): Promise<Observation[]> {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 10);
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${def.id}&api_key=${apiKey}&file_type=json` +
      `&units=${def.transform}&observation_start=${start.toISOString().slice(0, 10)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[cycle] ${def.id} failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const raw: { date: string; value: string }[] = data.observations ?? [];
    return raw
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o) => Number.isFinite(o.value));
  } catch (e) {
    console.error(`[cycle] ${def.id} threw:`, e);
    return [];
  }
}

export async function fetchCycle(): Promise<CycleData> {
  const apiKey = process.env.FRED_API_KEY;
  const unavailable: CycleData = {
    available: false,
    phase: null,
    rationale: "",
    inputs: [],
    asOf: null,
  };
  if (!apiKey) return unavailable;

  const all = await Promise.all(SERIES.map((def) => fetchSeries(def, apiKey)));

  const inputs: CycleInput[] = [];
  const latest: Record<string, { value: number; change3m: number | null; percentile: number | null }> = {};

  for (let i = 0; i < SERIES.length; i++) {
    const def = SERIES[i];
    const obs = all[i];
    if (obs.length === 0) {
      inputs.push({
        id: def.id,
        label: def.label,
        value: null,
        date: null,
        unit: def.unit,
        decimals: def.decimals,
        change3m: null,
        percentile: null,
        read: "Series did not load.",
      });
      continue;
    }
    const last = obs[obs.length - 1];
    const prior = obs[obs.length - 1 - def.quarterLag];
    const change3m = prior ? last.value - prior.value : null;
    const pct = percentileRank(obs.map((o) => o.value), last.value);
    latest[def.id] = { value: last.value, change3m, percentile: pct };
    inputs.push({
      id: def.id,
      label: def.label,
      value: last.value,
      date: last.date,
      unit: def.unit,
      decimals: def.decimals,
      change3m,
      percentile: pct,
      read: readFor(def.id, last.value, change3m, pct),
    });
  }

  const activity = latest.CFNAIMA3;
  if (!activity) {
    return { ...unavailable, inputs, available: inputs.some((i) => i.value !== null) };
  }

  const { phase, rationale } = classify(
    activity.value,
    activity.change3m,
    latest.BAMLH0A0HYM2 ?? null,
    latest.T10Y2Y ?? null,
    latest.CPIAUCSL ?? null,
    latest.UNRATE ?? null,
  );

  return {
    available: true,
    phase,
    rationale,
    inputs,
    asOf: inputs.find((i) => i.id === "CFNAIMA3")?.date ?? null,
  };
}

function readFor(
  id: string,
  value: number,
  change3m: number | null,
  pct: number | null,
): string {
  const rising = change3m === null ? null : change3m > 0;
  switch (id) {
    case "CFNAIMA3":
      if (value < CFNAI_RECESSION) return "Below the Chicago Fed's −0.70 recession threshold.";
      if (value < -CFNAI_TREND_BAND) return `Below-trend growth, ${rising ? "improving" : "still deteriorating"}.`;
      if (value > CFNAI_TREND_BAND) return `Above-trend growth, ${rising ? "accelerating" : "decelerating"}.`;
      return `Growth at trend, ${rising === null ? "direction unclear" : rising ? "edging up" : "edging down"}.`;
    case "BAMLH0A0HYM2":
      if (pct !== null && pct < 20) return "Spreads unusually tight — credit is not pricing any stress.";
      if (pct !== null && pct > 80) return "Spreads wide against the last decade — credit is pricing trouble.";
      return `Spreads mid-range and ${rising ? "widening" : "narrowing"}.`;
    case "T10Y2Y":
      if (value < 0) return "Curve inverted — the classic late-cycle reading.";
      if (value < 0.5) return "Curve flat.";
      return `Curve positively sloped and ${rising ? "steepening" : "flattening"}.`;
    case "CPIAUCSL":
      if (value > 3) return `Inflation above target and ${rising ? "rising" : "falling"}.`;
      return `Inflation near target and ${rising ? "rising" : "falling"}.`;
    case "UNRATE":
      return `Unemployment ${change3m === null ? "flat" : change3m > 0.2 ? "rising" : change3m < -0.1 ? "falling" : "flat"} over three months.`;
    default:
      return "";
  }
}

/**
 * The phase rules, in priority order.
 *
 * Written as a flat ladder rather than a score, because a score would hide
 * which condition actually decided it — and the whole point of surfacing the
 * inputs alongside is that the reader can disagree with the specific rule.
 */
/** The app renders negatives with a typographic minus everywhere else; prose here should match. */
function fmt(value: number, decimals = 2): string {
  return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(decimals)}`;
}

export function classify(
  activity: number,
  activityChange: number | null,
  credit: { value: number; percentile: number | null } | null,
  curve: { value: number } | null,
  inflation: { value: number; change3m: number | null } | null,
  unemployment: { change3m: number | null } | null,
): { phase: CyclePhase; rationale: string } {
  const rising = activityChange !== null && activityChange > 0;
  const creditStressed = credit?.percentile !== null && credit?.percentile !== undefined && credit.percentile > 80;

  if (activity < CFNAI_RECESSION) {
    return {
      phase: "recession",
      rationale: `CFNAI three-month average at ${fmt(activity)}, below the Chicago Fed's −0.70 recession threshold.`,
    };
  }

  if (activity < -CFNAI_TREND_BAND && creditStressed && !rising) {
    return {
      phase: "recession",
      rationale: `Growth below trend (${fmt(activity)}) and still falling, with high-yield spreads in the widest fifth of the last decade.`,
    };
  }

  if (activity < -CFNAI_TREND_BAND) {
    return rising
      ? {
          phase: "early",
          rationale: `Growth still below trend (${fmt(activity)}) but improving over three months — the recovery pattern.`,
        }
      : {
          phase: "recession",
          rationale: `Growth below trend (${fmt(activity)}) and deteriorating, without yet reaching the −0.70 threshold.`,
        };
  }

  // Growth is at trend or above it from here. Early vs mid vs late turns on
  // whether it is still building or already rolling over, and on how much
  // late-cycle evidence the other three inputs carry.
  //
  // `level` exists because CFNAI is zero-centred with a band around it: −0.05
  // is "at trend", not "above" it, and a rationale that said "at or above
  // trend (−0.05)" read as a contradiction rather than a definition.
  const level = activity > CFNAI_TREND_BAND ? "above trend" : "at trend";
  let lateEvidence = 0;
  const lateReasons: string[] = [];
  if (curve && curve.value < 0.25) {
    lateEvidence++;
    lateReasons.push(`the 10Y−2Y curve at ${curve.value.toFixed(2)}%`);
  }
  if (credit?.percentile !== null && credit?.percentile !== undefined && credit.percentile < 20) {
    lateEvidence++;
    lateReasons.push(`high-yield spreads in the tightest fifth of the decade`);
  }
  if (inflation && inflation.value > 3) {
    lateEvidence++;
    lateReasons.push(`CPI at ${inflation.value.toFixed(1)}%`);
  }
  if (unemployment?.change3m !== null && unemployment?.change3m !== undefined && unemployment.change3m > 0.2) {
    lateEvidence++;
    lateReasons.push(`unemployment up ${unemployment.change3m.toFixed(1)}pp in three months`);
  }

  if (rising && activity < CFNAI_TREND_BAND && lateEvidence === 0) {
    return {
      phase: "early",
      rationale: `Growth back ${level} (${fmt(activity)}) and accelerating, with no late-cycle evidence in credit, the curve or inflation.`,
    };
  }

  if (!rising && lateEvidence >= 2) {
    return {
      phase: "late",
      rationale: `Growth ${level} (${fmt(activity)}) but decelerating, alongside ${lateReasons.slice(0, 2).join(" and ")}.`,
    };
  }

  if (lateEvidence >= 3) {
    return {
      phase: "late",
      rationale: `Growth is holding up (${fmt(activity)}), but three late-cycle markers are present: ${lateReasons.slice(0, 3).join(", ")}.`,
    };
  }

  return {
    phase: "mid",
    rationale: `Growth ${level} (${fmt(activity)}) with ${
      lateEvidence === 0 ? "no" : lateEvidence === 1 ? "only one" : "few"
    } late-cycle markers${lateEvidence > 0 ? ` (${lateReasons[0]})` : ""}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Does the market agree with the phase?
 * ------------------------------------------------------------------ */

export interface PlaybookEntry {
  ticker: string;
  label: string;
  rank: number | null;
}

export interface PlaybookCheck {
  favoured: PlaybookEntry[];
  laggards: PlaybookEntry[];
  favouredMeanRank: number | null;
  laggardMeanRank: number | null;
  /** Positive when the market is ranking the phase's favoured sectors above its laggards. */
  agreement: number | null;
  verdict: string;
}

/**
 * Compare the published phase playbook with the live momentum ranking.
 *
 * This is the only part of the overlay that can be interestingly wrong, and it
 * is the reason the overlay is on this page rather than the macro one. A phase
 * label on its own is a claim about the economy that price data cannot check.
 * A phase label sitting next to "the market is ranking your late-cycle sectors
 * in the bottom half" is a disagreement, and a disagreement is information:
 * either the classification is early, or the market has not repriced yet, or
 * this cycle does not rhyme with the ones the framework was drawn from.
 *
 * The measure is deliberately blunt — mean rank of the favoured group against
 * mean rank of the laggard group, on the eleven-sector ladder. Rank rather than
 * return, because the groups differ in size and volatility and a return spread
 * between three sectors and five would mostly measure that.
 */
export function checkPlaybook(
  phase: CyclePhase,
  ranks: { ticker: string; label: string; rank: number | null }[],
): PlaybookCheck {
  const byTicker = new Map(ranks.map((r) => [r.ticker, r]));
  const book = PHASE_PLAYBOOK[phase];

  const resolve = (tickers: string[]): PlaybookEntry[] =>
    tickers.map((t) => ({
      ticker: t,
      label: byTicker.get(t)?.label ?? t,
      rank: byTicker.get(t)?.rank ?? null,
    }));

  const favoured = resolve(book.favoured);
  const laggards = resolve(book.laggards);

  const meanRank = (entries: PlaybookEntry[]): number | null => {
    const known = entries.map((e) => e.rank).filter((r): r is number => r !== null);
    return known.length === 0 ? null : known.reduce((a, b) => a + b, 0) / known.length;
  };

  const favouredMeanRank = meanRank(favoured);
  const laggardMeanRank = meanRank(laggards);
  // Rank 1 is best, so the favoured group agreeing with the framework means a
  // LOWER mean rank than the laggards. The subtraction is oriented so that a
  // positive number reads as agreement.
  const agreement =
    favouredMeanRank === null || laggardMeanRank === null
      ? null
      : laggardMeanRank - favouredMeanRank;

  return {
    favoured,
    laggards,
    favouredMeanRank,
    laggardMeanRank,
    agreement,
    verdict:
      agreement === null
        ? "Not enough of the ranking is available to compare."
        : agreement >= 3
          ? "The ranking matches the framework: the sectors this phase favours are the ones leading."
          : agreement >= 1
            ? "A mild tilt towards the phase's favoured sectors, no more than that."
            : agreement > -1
              ? "The market is not distinguishing between the phase's favoured and unfavoured sectors."
              : "The market is leading with the sectors this phase historically lagged — the classification and the tape disagree.",
  };
}
