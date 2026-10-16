/**
 * Asserts the business-cycle phase ladder in lib/cycle.ts and the series
 * helpers the sectors page leans on. Offline: no fetch, exits non-zero on the
 * first failure.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyCycle.js
 */
import assert from "node:assert/strict";
import { classify, type CyclePhase } from "../lib/cycle";
import { sma, toWeekly } from "../lib/series";

type Args = Parameters<typeof classify>;

const neutral = {
  credit: { value: 3.5, percentile: 50 },
  curve: { value: 1.0 },
  inflation: { value: 2.5, change3m: 0 },
  unemployment: { change3m: 0 },
};

function phase(
  activity: number,
  change: number | null,
  over: Partial<typeof neutral> = {},
): { phase: CyclePhase; rationale: string } {
  const c = { ...neutral, ...over };
  const args: Args = [activity, change, c.credit, c.curve, c.inflation, c.unemployment];
  return classify(...args);
}

const cases: [string, ReturnType<typeof phase>, CyclePhase][] = [
  ["below the -0.70 threshold", phase(-0.8, 0.3), "recession"],
  ["exactly -0.70, falling", phase(-0.7, -0.1), "recession"],
  ["below trend, improving", phase(-0.3, 0.1), "early"],
  ["below trend, falling, wide spreads", phase(-0.3, -0.1, { credit: { value: 6, percentile: 90 } }), "recession"],
  ["at trend, rising, no late evidence", phase(0.1, 0.05), "early"],
  ["at trend, rising, one late marker", phase(0.1, 0.05, { curve: { value: 0.1 } }), "mid"],
  ["exactly +0.20, rising, clean", phase(0.2, 0.05), "mid"],
  [
    "above trend, falling, two late markers",
    phase(0.5, -0.1, { curve: { value: 0.1 }, inflation: { value: 3.5, change3m: 0 } }),
    "late",
  ],
  [
    "above trend, rising, two late markers",
    phase(0.5, 0.1, { curve: { value: 0.1 }, inflation: { value: 3.5, change3m: 0 } }),
    "mid",
  ],
  [
    "above trend, rising, three late markers",
    phase(0.5, 0.1, {
      curve: { value: 0.1 },
      inflation: { value: 3.5, change3m: 0 },
      credit: { value: 2.8, percentile: 10 },
    }),
    "late",
  ],
  ["unknown direction treated as not rising", phase(-0.3, null), "recession"],
];

for (const [name, got, want] of cases) {
  assert.equal(got.phase, want, `${name}: got ${got.phase} (${got.rationale})`);
}
assert.match(phase(-0.7, -0.1).rationale, /without yet reaching/, "-0.70 is not below the threshold");
assert.match(phase(0.2, 0.05).rationale, /at trend/, "+0.20 reads as at trend, not above");

assert.deepEqual(
  sma([1, 2, 3, null, 4, 5], 2),
  [null, 1.5, 2.5, null, null, 4.5],
  "sma resets its window across a gap",
);

const weekly = toWeekly(
  ["2026-10-05", "2026-10-06", "2026-10-09", "2026-10-12", "2026-10-15"].map((date) => ({ date })),
);
assert.deepEqual(
  weekly.map((b) => b.date),
  ["2026-10-09", "2026-10-15"],
  "toWeekly keeps each week's last bar, including a partial current week",
);

console.log(`verifyCycle: ${cases.length} phase cases, sma and toWeekly passed`);
