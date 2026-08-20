/**
 * Checks the column-shift guard in lib/koreaLeverage.ts.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyKoreaLeverage.js
 *   ... --live      also calls FreeSIS and checks the real feed still passes
 *
 * The guard exists because FreeSIS returns positional columns — `TMPV2` means
 * 신용거래융자 total only by convention, and a column inserted upstream would
 * silently shift every reading. So the case that actually matters here is the
 * negative one: rows that are internally consistent must pass, and the SAME
 * rows with their value columns shifted by one must be rejected. A guard that
 * only ever sees good data proves nothing.
 *
 * Fixture rows are real FreeSIS values, not invented ones — 2026-08-18 and
 * 2026-08-19 as returned at the divisors the library requests — so the
 * tolerances are exercised against the real rounding rather than against clean
 * numbers that would pass any threshold.
 */
import {
  CREDIT_INVARIANT,
  FUNDS_INVARIANT,
  MARKET_INVARIANT,
  enforceDailyFrequency,
  enforceInvariant,
  fetchKoreaLeverage,
  type FreesisRow,
  type ScreenInvariant,
} from "../lib/koreaLeverage";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(56)} got ${JSON.stringify(actual)}` +
      (ok ? "" : `  want ${JSON.stringify(expected)}`),
  );
}

function valueColumns(row: FreesisRow): number[] {
  return Object.keys(row)
    .filter((k) => /^TMPV\d+$/.test(k) && k !== "TMPV1")
    .map((k) => Number(k.slice(4)))
    .sort((a, b) => a - b);
}

/**
 * A column inserted upstream: every value moves one place right.
 *
 * The vacated slot gets the row's original first value rather than a zero or a
 * null. That is both more realistic — an inserted column carries a real number,
 * typically a subtotal of the ones beside it — and a strictly harder test,
 * since a zero would make the row unevaluable and get the screen dropped
 * without the arithmetic ever having to disagree.
 */
function shiftRight(row: FreesisRow): FreesisRow {
  const indices = valueColumns(row);
  const first = indices[0];
  const shifted: FreesisRow = { TMPV1: row.TMPV1, [`TMPV${first}`]: row[`TMPV${first}`] ?? null };
  for (const i of indices) {
    if (i > first) shifted[`TMPV${i}`] = row[`TMPV${i - 1}`] ?? null;
  }
  return shifted;
}

/** A column removed upstream: every value moves one place left. */
function shiftLeft(row: FreesisRow): FreesisRow {
  const indices = valueColumns(row);
  const shifted: FreesisRow = { TMPV1: row.TMPV1 };
  for (const i of indices) {
    shifted[`TMPV${i}`] = row[`TMPV${i + 1}`] ?? null;
  }
  return shifted;
}

// Real rows, at the divisors lib/koreaLeverage.ts requests.
// 신용공여: TMPV2 total, TMPV3 KOSPI, TMPV4 KOSDAQ, TMPV5-7 대주, TMPV8 청약, TMPV9 담보융자.
const CREDIT_ROWS: FreesisRow[] = [
  {
    TMPV1: "20260818",
    TMPV2: 311045331,
    TMPV3: 243947114,
    TMPV4: 67098216,
    TMPV5: 334461,
    TMPV6: 298411,
    TMPV7: 36050,
    TMPV8: 0,
    TMPV9: 251949539,
  },
];

// 증시자금: TMPV2 예탁금, TMPV5 미수금, TMPV6 반대매매, TMPV7 비중 (%).
// Two rows, because the ratio's denominator is the PREVIOUS row's receivables.
const FUNDS_ROWS: FreesisRow[] = [
  { TMPV1: "20260814", TMPV2: 1007103323, TMPV3: 416715351, TMPV4: 1098679334, TMPV5: 8670362, TMPV6: 37681, TMPV7: 0.4 },
  { TMPV1: "20260818", TMPV2: 1047550578, TMPV3: 421138021, TMPV4: 1101243572, TMPV5: 9202080, TMPV6: 64454, TMPV7: 0.7 },
];

// 유가증권시장: TMPV5 시가총액, TMPV6 외국인 시가총액, TMPV7 외국인 비중 (%).
const MARKET_ROWS: FreesisRow[] = [
  { TMPV1: "20260819", TMPV2: 6471.17, TMPV3: 3, TMPV4: 231171, TMPV5: 53339592, TMPV6: 20963197, TMPV7: 39.301 },
];

function invariantOn(rows: FreesisRow[], invariant: ScreenInvariant): boolean | null {
  return invariant(rows[rows.length - 1], rows.length > 1 ? rows[rows.length - 2] : null);
}

const SCREENS: { name: string; rows: FreesisRow[]; invariant: ScreenInvariant }[] = [
  { name: "credit", rows: CREDIT_ROWS, invariant: CREDIT_INVARIANT },
  { name: "funds ", rows: FUNDS_ROWS, invariant: FUNDS_INVARIANT },
  { name: "market", rows: MARKET_ROWS, invariant: MARKET_INVARIANT },
];

console.log("\nInvariants hold on real rows");
check("credit  total == KOSPI + KOSDAQ", invariantOn(CREDIT_ROWS, CREDIT_INVARIANT), true);
check("funds   비중 == forced / prior receivables", invariantOn(FUNDS_ROWS, FUNDS_INVARIANT), true);
check("market  foreign share == foreign / cap", invariantOn(MARKET_ROWS, MARKET_INVARIANT), true);

// Asserted through enforceInvariant rather than the invariant alone, because
// "the screen is dropped" is the actual contract. A corruption can reach that
// outcome two ways — the arithmetic disagrees, or the needed columns stop being
// readable at all — and both are correct. Testing the invariant's own return
// value would pin down which one, and that is an implementation detail.
console.log("\nA screen whose columns have moved is dropped, in either direction");
for (const { name, rows, invariant } of SCREENS) {
  check(
    `${name}  intact screen passes through`,
    enforceInvariant(rows, name, invariant).length,
    rows.length,
  );
  check(
    `${name}  column inserted (values shift right)`,
    enforceInvariant(rows.map(shiftRight), name, invariant).length,
    0,
  );
  check(
    `${name}  column removed (values shift left)`,
    enforceInvariant(rows.map(shiftLeft), name, invariant).length,
    0,
  );
}

// FreeSIS returns the daily series for any unrecognised period code, so a wrong
// or newly-rejected `tmpV1` would arrive looking plausible. A monthly series
// passes every column identity — only the row spacing betrays it.
console.log("\nA coarser frequency is rejected even though its columns are valid");
function spaced(dates: string[]): FreesisRow[] {
  return dates.map((TMPV1) => ({ ...CREDIT_ROWS[0], TMPV1 }));
}
check(
  "daily spacing accepted",
  enforceDailyFrequency(
    spaced(["20260806", "20260807", "20260810", "20260811", "20260812", "20260813", "20260814", "20260818", "20260819"]),
    "credit",
  ).length,
  9,
);
check(
  "an 11-day market closure does not trip it",
  enforceDailyFrequency(
    spaced(["20260721", "20260722", "20260723", "20260724", "20260727", "20260807", "20260810", "20260811", "20260812"]),
    "credit",
  ).length,
  9,
);
check(
  "month-end spacing rejected",
  enforceDailyFrequency(
    spaced(["20251031", "20251128", "20251231", "20260130", "20260227", "20260331", "20260430", "20260529", "20260630"]),
    "credit",
  ).length,
  0,
);
check(
  "columns alone cannot catch it (monthly rows pass the credit identity)",
  invariantOn(spaced(["20260529", "20260630"]), CREDIT_INVARIANT),
  true,
);

console.log("\nDegenerate screens");
check("an already-empty screen stays empty", enforceInvariant([], "credit", CREDIT_INVARIANT).length, 0);
check(
  "rows with none of the needed columns are dropped",
  enforceInvariant([{ TMPV1: "20260818" }], "credit", CREDIT_INVARIANT).length,
  0,
);

console.log("\nTolerances are sized for KOFIA's rounding, not for exact equality");
// The funds ratio arrives rounded to one decimal, so a correct feed is always
// slightly "wrong" — 64454/8670362*100 = 0.7434 against a published 0.7.
check(
  "funds passes despite 0.04pp of published rounding",
  invariantOn(FUNDS_ROWS, FUNDS_INVARIANT),
  true,
);
// ... but not for an error an order of magnitude past that.
check(
  "funds rejects a ratio off by 1pp",
  invariantOn([FUNDS_ROWS[0], { ...FUNDS_ROWS[1], TMPV7: 1.7 }], FUNDS_INVARIANT),
  false,
);

async function live() {
  console.log("\nLive FreeSIS feed");
  const data = await fetchKoreaLeverage();
  check("credit screen accepted", data.unavailable, false);
  check("market screens accepted (ratio present)", data.ratio !== null, true);
  check("funds screen accepted (deposits present)", data.deposits !== null, true);
  if (!data.unavailable) {
    console.log(
      `\n  as of ${data.asOf}: margin ₩${data.level?.value.toFixed(2)}tn ` +
        `(${data.level?.percentile.toFixed(0)}th pctl), ` +
        `${data.ratio?.value.toFixed(3)}% of cap (${data.ratio?.percentile.toFixed(0)}th pctl)`,
    );
    check(
      "KOSPI + KOSDAQ reconciles to the headline balance",
      Math.abs((data.marginKospi ?? 0) + (data.marginKosdaq ?? 0) - (data.level?.value ?? 0)) < 0.01,
      true,
    );
  }
}

async function main() {
  if (process.argv.includes("--live")) await live();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
