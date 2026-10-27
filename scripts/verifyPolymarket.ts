/**
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyPolymarket.js
 */
import assert from "assert";
import { cpiValue, fedBps, weightedMean, type Outcome } from "../lib/polymarket";

assert.strictEqual(fedBps("No change"), 0);
assert.strictEqual(fedBps("25 bps decrease"), -25);
assert.strictEqual(fedBps("50+ bps increase"), 50);
assert.strictEqual(fedBps("Emergency cut"), null, "unknown labels are left out, not guessed");

assert.strictEqual(cpiValue("≤2.2%"), 2.2);
assert.strictEqual(cpiValue("2.6%"), 2.6);
assert.strictEqual(cpiValue("3.0%+"), 3.0);

const fed: Outcome[] = [
  { label: "No change", p: 0.2, pWeekAgo: 0.5 },
  { label: "25 bps increase", p: 0.8, pWeekAgo: 0.5 },
];
assert.strictEqual(weightedMean(fed, fedBps, "p"), 20, "0.2×0 + 0.8×25");
assert.strictEqual(weightedMean(fed, fedBps, "pWeekAgo"), 12.5);
const unnormalised: Outcome[] = [
  { label: "No change", p: 0.5, pWeekAgo: null },
  { label: "25 bps increase", p: 0.52, pWeekAgo: null },
];
assert.ok(Math.abs((weightedMean(unnormalised, fedBps, "p") as number) - (0.52 * 25) / 1.02) < 1e-9, "renormalised when prices sum past 1");
assert.strictEqual(weightedMean(unnormalised, fedBps, "pWeekAgo"), null, "no history gives no week-ago value");
console.log("polymarket checks passed");
