import { percentileRank } from "./riskStats";

/**
 * The shape every Positioning source reduces to, so one panel can draw any of
 * them: COT, gamma exposure and the Fed's allocation and supply series today,
 * put/call or margin debt later.
 *
 * Values arrive pre-formatted because each source knows its own units, and the
 * panel should not have to learn what a "$bn of gamma" is.
 */
export interface PositioningReading {
  id: string;
  label: string;
  value: string;
  /** A secondary figure under the value: a weekly change, a regime, a trailing average. */
  detail: string | null;
  /** Where the latest value sits in its own history since `since`, 0–100. */
  percentile: number | null;
  /** First year the percentile is measured against. */
  since: string | null;
  /** Set when the latest value is the highest or lowest in that window; a percentile tops out at 99th. */
  record: "high" | "low" | null;
  /** Recent history for the sparkline, oldest first. */
  history: number[];
  /** One clause on how to read it. */
  read: string;
}

export interface PositioningSource {
  /** Already formatted for the source's frequency: a date, a week, a quarter. */
  asOf: string | null;
  readings: PositioningReading[];
  unavailable: boolean;
}

export const UNAVAILABLE: PositioningSource = { asOf: null, readings: [], unavailable: true };

/** Percentile of the last value against the whole series, and the year it starts. */
export function rankLatest(
  series: { date: string; value: number }[],
): { percentile: number | null; since: string | null; record: "high" | "low" | null } {
  if (series.length < 20) return { percentile: null, since: null, record: null };
  const values = series.map((p) => p.value);
  const last = values[values.length - 1];
  return {
    percentile: percentileRank(values, last),
    since: series[0].date.slice(0, 4),
    record: last >= Math.max(...values) ? "high" : last <= Math.min(...values) ? "low" : null,
  };
}
