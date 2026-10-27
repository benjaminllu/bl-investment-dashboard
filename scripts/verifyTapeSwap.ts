/**
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyTapeSwap.js
 */
import assert from "assert";
import { withFresherSp, type IndexRow } from "../lib/indexQuotes";

const now = 1_800_000_000;
const spy = (time: number | null): IndexRow[] => [
  { label: "SPY", ticker: "SPY", price: 770, changePct: 0.5, time },
  { label: "QQQ", ticker: "QQQ", price: 700, changePct: 0.4, time },
];
const perp = { price: 7700, changePct: 0.1 };

assert.strictEqual(withFresherSp(spy(now - 60), perp, now)[0].label, "SPY", "a fresh SPY quote stays");
assert.strictEqual(withFresherSp(spy(now - 3600), perp, now)[0].label, "S&P·HL", "a stale SPY quote swaps to the perp");
assert.strictEqual(withFresherSp(spy(null), perp, now)[0].price, 7700, "a SPY quote with no time swaps");
assert.strictEqual(withFresherSp(spy(now - 3600), { price: null, changePct: null }, now)[0].label, "SPY", "no perp price keeps SPY");
assert.strictEqual(withFresherSp(spy(now - 3600), perp, now)[1].label, "QQQ", "other rows are untouched");
console.log("tape swap checks passed");
