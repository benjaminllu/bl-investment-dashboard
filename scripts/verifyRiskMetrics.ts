/**
 * Checks lib/riskMetrics.ts against cases whose answers are known independently
 * of the implementation — analytic identities and hand-computed values, not
 * whatever the code happened to produce first.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyRiskMetrics.js
 */
import {
  mean,
  toReturns,
  stdev,
  annualizedReturn,
  annualizedVol,
  sharpe,
  sortino,
  drawdown,
  calmar,
  regress,
  captureRatios,
  trackingError,
  informationRatio,
  computeWindow,
  TRADING_DAYS,
} from "../lib/riskMetrics";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown, tolerance = 1e-9) {
  let ok: boolean;
  if (typeof actual === "number" && typeof expected === "number") {
    ok = Math.abs(actual - expected) <= tolerance;
  } else {
    ok = JSON.stringify(actual) === JSON.stringify(expected);
  }
  if (!ok) failures++;
  const shown =
    typeof actual === "number" ? actual.toFixed(6) : JSON.stringify(actual);
  const want =
    typeof expected === "number" ? expected.toFixed(6) : JSON.stringify(expected);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(48)} got ${shown}${ok ? "" : `  want ${want}`}`);
}

/** Deterministic pseudo-random returns, so runs are reproducible. */
function syntheticReturns(n: number, seed = 42): number[] {
  let s = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push((s / 2147483648 - 0.5) * 0.04); // roughly ±2% daily
  }
  return out;
}

console.log("\nPRIMITIVES");
check("toReturns([100,110,99])[0]", toReturns([100, 110, 99])[0], 0.1, 1e-12);
check("toReturns([100,110,99])[1]", toReturns([100, 110, 99])[1], -0.1, 1e-12);
// Sample stdev of [1,2,3,4]: mean 2.5, SS = 2.25+0.25+0.25+2.25 = 5, /3 = 1.6667, sqrt.
check("stdev([1,2,3,4]) sample n-1", stdev([1, 2, 3, 4]), Math.sqrt(5 / 3), 1e-12);

console.log("\nANNUALISATION");
// 252 days of exactly +0.1% compounds to 1.001^252 − 1.
const flat = new Array(TRADING_DAYS).fill(0.001);
check("annualizedReturn(252 × +0.1%)", annualizedReturn(flat)!, 1.001 ** 252 - 1, 1e-12);
check("annualizedVol(constant returns) = 0", annualizedVol(flat)!, 0, 1e-12);
// A half-year of the same daily rate must annualise to the same figure.
const half = new Array(126).fill(0.001);
check("annualizedReturn scale-invariant (126d)", annualizedReturn(half)!, 1.001 ** 252 - 1, 1e-9);

console.log("\nSHARPE / SORTINO");
check("sharpe(zero variance) = null", sharpe(flat), null);
check("sharpe(n < 20) = null", sharpe([0.01, -0.01, 0.02]), null);
{
  // Sharpe is scale-invariant in the sense that doubling excess returns and
  // their dispersion together leaves it unchanged — the leverage property.
  const r = syntheticReturns(252);
  const s1 = sharpe(r)!;
  const s2 = sharpe(r.map((x) => x * 2))!;
  check("sharpe is leverage-neutral (2× returns)", s2, s1, 1e-9);

  // Sortino exceeds Sharpe only when the mean excess return is POSITIVE: the
  // downside denominator is the smaller one, so for a negative mean it makes
  // the ratio more negative instead. Test both directions rather than the
  // half-truth that "Sortino is higher".
  const up = r.map((x) => x + 0.002); // shift to a positive mean
  check("mean(up) > 0 (test premise)", mean(up) > 0, true);
  check("positive mean → sortino > sharpe", sortino(up)! > sharpe(up)!, true);

  const down = r.map((x) => x - 0.002); // shift to a negative mean
  check("mean(down) < 0 (test premise)", mean(down) < 0, true);
  check("negative mean → sortino < sharpe", sortino(down)! < sharpe(down)!, true);
}

console.log("\nDRAWDOWN");
{
  // Path: 1 → 1.2 → 0.9 → 1.0. Peak 1.2, trough 0.9.
  const dd = drawdown([1, 1.2, 0.9, 1.0])!;
  check("max drawdown 0.9/1.2 − 1", dd.max, -0.25, 1e-12);
  check("current drawdown 1.0/1.2 − 1", dd.current, 1 / 1.2 - 1, 1e-12);
  check("days under water since peak", dd.daysUnderWater, 2);
  check("calmar = annRet / |maxDD|", calmar(0.5, -0.25)!, 2, 1e-12);
  check("calmar undefined without a drawdown", calmar(0.5, 0), null);
  // A monotonically rising series has no drawdown at all.
  check("monotonic rise has zero max drawdown", drawdown([1, 1.1, 1.2, 1.3])!.max, 0, 1e-12);
}

console.log("\nREGRESSION (analytic identities)");
{
  const mkt = syntheticReturns(252, 7);

  // Regressing a series on itself must give beta 1, alpha 0, R² 1.
  const self = regress(mkt, mkt)!;
  check("self-regression beta", self.beta, 1, 1e-9);
  check("self-regression alpha", self.alpha, 0, 1e-9);
  check("self-regression R²", self.rSquared, 1, 1e-9);

  // A 2× levered clone: beta exactly 2, still perfectly explained, no alpha.
  const lev = regress(mkt.map((x) => x * 2), mkt)!;
  check("2× levered beta", lev.beta, 2, 1e-9);
  check("2× levered alpha", lev.alpha, 0, 1e-9);
  check("2× levered R²", lev.rSquared, 1, 1e-9);

  // A constant premium on top of the market is pure alpha at beta 1.
  const withAlpha = regress(mkt.map((x) => x + 0.0004), mkt)!;
  check("constant premium → beta 1", withAlpha.beta, 1, 1e-9);
  check("constant premium → alpha 0.0004×252", withAlpha.alpha, 0.0004 * TRADING_DAYS, 1e-9);
}

console.log("\nCAPTURE RATIOS");
{
  const mkt = syntheticReturns(252, 11);
  const c1 = captureRatios(mkt, mkt);
  check("self capture up = 100%", c1.up!, 100, 1e-9);
  check("self capture down = 100%", c1.down!, 100, 1e-9);

  const c2 = captureRatios(mkt.map((x) => x * 2), mkt);
  check("2× levered capture up = 200%", c2.up!, 200, 1e-9);
  check("2× levered capture down = 200%", c2.down!, 200, 1e-9);

  // Convexity: full upside, half the downside.
  const convex = mkt.map((x) => (x > 0 ? x : x * 0.5));
  const c3 = captureRatios(convex, mkt);
  check("convex capture down ≈ 50%", c3.down!, 50, 1e-6);
  check("convex capture up = 100%", c3.up!, 100, 1e-9);
}

console.log("\nTRACKING ERROR / INFORMATION RATIO");
{
  const mkt = syntheticReturns(252, 13);
  check("tracking error vs self = 0", trackingError(mkt, mkt)!, 0, 1e-12);
  check("information ratio vs self = null", informationRatio(mkt, mkt), null);

  // Constant daily outperformance: zero tracking error, so IR is undefined
  // rather than infinite.
  const better = mkt.map((x) => x + 0.0005);
  check("constant outperformance → TE 0", trackingError(better, mkt)!, 0, 1e-12);
  check("constant outperformance → IR null", informationRatio(better, mkt), null);
}

console.log("\nEND TO END (computeWindow)");
{
  const mkt = syntheticReturns(252, 17);
  const rf = new Array(252).fill(0);
  const w = computeWindow("1Y", mkt.map((x) => x * 2), mkt, rf);
  check("window beta = 2", w.beta!, 2, 1e-9);
  check("window R² = 1", w.rSquared!, 1, 1e-9);
  check("window observations", w.observations, 252);
  check("window up capture = 200%", w.upCapture!, 200, 1e-9);
  // Sharpe standard error at n=252 should be near ±1.0 — the point of showing it.
  const se = w.sharpeStdErr!;
  check("sharpe std err at 252 obs ≈ 1.0", Math.abs(se - 1) < 0.05, true);
}

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} CHECK(S) FAILED.\n`
);
process.exitCode = failures === 0 ? 0 : 1;
