// Relative rather than the usual `@/lib/...`, because this is a *value* import
// and scripts/verifyKoreaLeverage.ts runs through tsconfig.verify.json, whose
// CommonJS output does not rewrite path aliases. The other `@/lib/riskStats`
// imports in this project survive only because they are `import type` and
// disappear at emit. Same reason lib/riskNarrative/* imports its siblings this way.
import { percentileRank, type SeriesPoint } from "./riskStats";

/**
 * Korean retail leverage, from KOFIA (금융투자협회) FreeSIS.
 *
 * FreeSIS is the Korea Financial Investment Association's public statistics
 * portal and the primary source for retail margin data — the figures the Korean
 * press quotes as "신용거래융자 잔고" come from here. The portal is a JavaScript
 * (eXBuilder6) front end with no documented API, but every screen in it loads
 * its grid from one JSON endpoint, `POST /meta/getMetaDataList.do`, keyed by the
 * screen's business-object name. That endpoint is what this module calls.
 *
 * It is unofficial in the sense that KOFIA publishes no contract for it, so it
 * can change without notice — the same footing as the Yahoo, Cboe and CNN
 * endpoints already in DEPENDENCIES.md. Nothing here is authenticated and
 * nothing is scraped out of HTML; the response is plain JSON.
 *
 *
 * WHY THE REQUEST CARRIES A DIVISOR
 *
 * `tmpV40` is the screen's unit selector. Empirically the server divides every
 * currency column by the integer value of that field and floors the result — so
 * `tmpV40: "1"` returns won and `"100000"` returns hundred-thousands of won. It
 * is not optional: omitting it returns a row of nulls for every value, which is
 * exactly how this looked when first called with only the date parameters set.
 *
 * A coarse divisor is used deliberately. KOSPI+KOSDAQ market capitalisation is
 * ~5.3e15 won, which is inside IEEE-754's exact-integer range (9.007e15) but
 * close enough to it that summing two markets is not worth doing at full
 * precision for a number displayed to two decimals in trillions. The residual
 * error is ~1e-7 relative — several orders below the last displayed digit.
 */

const FREESIS_URL = "https://freesis.kofia.or.kr/meta/getMetaDataList.do";

/**
 * FreeSIS refuses requests that do not look like they came from its own front
 * end, answering with a 307 to an error page rather than an error status.
 */
const FREESIS_HEADERS = {
  "Content-Type": "application/json;charset=UTF-8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://freesis.kofia.or.kr/stat/FreeSIS.do",
};

/** Business-object names, one per FreeSIS screen. */
const OBJ = {
  /** 신용공여 잔고 추이 — margin loans, retail stock borrowing, collateral loans. Daily from 1998-07-01. */
  credit: "STATSCU0100000070BO",
  /** 증시자금추이 — investor deposits, unpaid receivables, forced sales. Daily from 1998-06-18. */
  funds: "STATSCU0100000060BO",
  /** 유가증권시장 — KOSPI index and market cap. */
  kospi: "STATSCU0100000020BO",
  /** 코스닥시장 — KOSDAQ index and market cap. Daily only from 2000-11-06. */
  kosdaq: "STATSCU0100000030BO",
} as const;

/** Won per returned unit for the credit screens. See "WHY THE REQUEST CARRIES A DIVISOR". */
const CREDIT_DIVISOR = 100_000;
/** Market cap is four orders larger than the credit figures, so it is scaled further. */
const MARKET_DIVISOR = 100_000_000;

const KRW_PER_TRILLION = 1e12;

/** Start of the query window. 신용공여 only became possible on 1998-07-01. */
const HISTORY_START = "19980101";

/**
 * Points kept per chart range.
 *
 * The SVG is 800 units wide, so past roughly one point per unit the extra
 * detail cannot land on a distinct pixel and only costs payload — MAX is over
 * 7,000 daily observations. Downsampling takes every nth point rather than
 * averaging, so every plotted point stays a real published figure and a hovered
 * value matches what KOFIA printed that day.
 */
const MAX_POINTS = 520;

/**
 * A FreeSIS row. Columns are positional — `TMPV1` is the row label and `TMPV2`
 * onward are the grid's value columns in header order — so what each one means
 * depends entirely on which screen was queried. The per-screen meanings are
 * recorded at the call sites below rather than encoded in the type.
 */
export interface FreesisRow {
  TMPV1: string;
  [column: string]: string | number | null;
}

/**
 * COLUMN-SHIFT GUARD
 *
 * The one upstream change that would not announce itself. A renamed endpoint,
 * a tightened Referer check, a missing `ds1` — all of those end in an empty
 * screen and the panel says so. But if KOFIA inserts or reorders a value column
 * on one of these grids, `TMPV2` quietly starts meaning something else, and the
 * panel renders a plausible wrong number with no error anywhere: the balance
 * would read ₩24tn instead of ₩31tn, the percentile would recompute against a
 * history shifted the same way, and the chart would look entirely normal.
 *
 * This is not hypothetical for these screens. Their own metadata carries a
 * `HEADER_NM_OLD` beside every `HEADER_NM`, the 신용거래대주 group header records
 * a modification in September 2023, and KOFIA's footnote documents the series
 * changing shape in 2002 and again in 2007.
 *
 * What makes the guard cheap is that every screen carries an arithmetic
 * identity between the very columns being read, so no second request and no
 * hardcoded expected value is needed — the response checks itself. Each
 * invariant was measured against the full history before being trusted:
 *
 *   credit  total == KOSPI + KOSDAQ         7,160 rows, worst 2.7e-8 relative
 *   funds   비중 == forced / prior receivables  7,176 rows, worst 0.050pp
 *   market  foreign share == foreign / cap   2,839 + 6,321 rows, worst 0.0005pp
 *
 * The residuals are entirely the divisor truncation and KOFIA's own rounding
 * (one decimal on the funds ratio, three on the foreign share), which is what
 * the tolerances below are sized against — each is several times the worst
 * error ever observed, so a real feed cannot trip it, while a column shifted by
 * one breaks the identity outright.
 *
 * Failing closed is deliberate. A panel that says it has no data is a smaller
 * problem than a panel confidently showing the wrong leverage.
 */
export type ScreenInvariant = (
  row: FreesisRow,
  previous: FreesisRow | null,
) => boolean | null;

/**
 * How many of the newest rows are checked.
 *
 * Recent rows are the ones a column shift would show up in and the ones the
 * headline is read from. Checking the whole history instead would let a single
 * odd row from 1998 take down a feed that is currently correct.
 */
const GUARD_ROWS = 20;

/** Relative. Observed worst on real data: 2.7e-8. */
const CREDIT_TOLERANCE = 1e-6;
/** Percentage points. KOFIA rounds this ratio to one decimal, so 0.05 is the floor. */
const FUNDS_TOLERANCE = 0.15;
/** Percentage points. KOFIA rounds the foreign share to three decimals. */
const MARKET_TOLERANCE = 0.005;

/** 신용거래융자: the total must be the two markets that make it up. */
export const CREDIT_INVARIANT: ScreenInvariant = (row) => {
  const total = num(row, "TMPV2");
  const kospi = num(row, "TMPV3");
  const kosdaq = num(row, "TMPV4");
  if (total === null || kospi === null || kosdaq === null || total === 0) return null;
  return Math.abs(kospi + kosdaq - total) / total <= CREDIT_TOLERANCE;
};

/**
 * 반대매매 비중: forced sales over the PREVIOUS session's receivables.
 *
 * The lag is KOFIA's, not an approximation — 미수금 arising on D is liquidated
 * on D+1. Dividing by the same row reproduces their column on only 43% of the
 * history and is out by as much as 17pp, so this identity doubles as the
 * documentation for what that percentage actually means.
 */
export const FUNDS_INVARIANT: ScreenInvariant = (row, previous) => {
  const forced = num(row, "TMPV6");
  const ratio = num(row, "TMPV7");
  const base = previous ? num(previous, "TMPV5") : null;
  if (forced === null || ratio === null || base === null || base === 0) return null;
  return Math.abs((forced / base) * 100 - ratio) <= FUNDS_TOLERANCE;
};

/** 유가증권/코스닥: the foreign-ownership share must be the two cap columns beside it. */
export const MARKET_INVARIANT: ScreenInvariant = (row) => {
  const cap = num(row, "TMPV5");
  const foreign = num(row, "TMPV6");
  const share = num(row, "TMPV7");
  if (cap === null || foreign === null || share === null || cap === 0) return null;
  return Math.abs((foreign / cap) * 100 - share) <= MARKET_TOLERANCE;
};

/**
 * FREQUENCY GUARD
 *
 * The hole the column guard cannot cover. FreeSIS falls back to daily for any
 * unrecognised period code, which means a wrong `tmpV1` looks like it worked —
 * and if that default ever changes, or the accepted codes do, this module could
 * start receiving the monthly series instead. A monthly series satisfies every
 * column identity above perfectly, because the columns are still in the right
 * places; only the row spacing gives it away.
 *
 * It would not look broken either. Month-end sampling reproduces the level
 * percentile to within 0.1pp, so the headline would look entirely normal while
 * the chart quietly lost its detail, the "60d high" covered five years, and
 * every record understated the true intramonth peak (₩38.02tn against the real
 * ₩38.63tn).
 *
 * Median spacing separates the two with enormous margin: across the full daily
 * history the 99.9th-percentile gap is 6 days and only 3 gaps in 28 years
 * exceed 7, while the monthly series never spaces rows closer than 27. Median
 * rather than maximum, so a single long market closure — Chuseok 2017 left an
 * 11-day gap — cannot trip it.
 */
const FREQUENCY_SAMPLE = 10;
const MAX_DAILY_MEDIAN_GAP_DAYS = 10;

export function enforceDailyFrequency(rows: FreesisRow[], objName: string): FreesisRow[] {
  if (rows.length < 3) return rows;

  const recent = rows.slice(-(FREQUENCY_SAMPLE + 1));
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const from = Date.parse(toIso(recent[i - 1].TMPV1));
    const to = Date.parse(toIso(recent[i].TMPV1));
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    gaps.push((to - from) / 86_400_000);
  }
  if (gaps.length === 0) return rows;

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median > MAX_DAILY_MEDIAN_GAP_DAYS) {
    console.error(
      `[koreaLeverage] ${objName} rows are ${median} days apart on average — this is not the ` +
        `daily series. Dropping the screen rather than presenting a coarser frequency as daily.`,
    );
    return [];
  }
  return rows;
}

/**
 * Drops a whole screen whose columns no longer satisfy its own identity.
 *
 * Returns the rows untouched when the screen checks out, and `[]` when it does
 * not — the same shape a network failure produces, so every caller already
 * handles it. Rows the invariant cannot evaluate are skipped rather than
 * counted, but a screen where *nothing* could be evaluated also fails: that
 * means the columns being read are simply absent.
 */
export function enforceInvariant(
  rows: FreesisRow[],
  objName: string,
  invariant: ScreenInvariant,
): FreesisRow[] {
  if (rows.length === 0) return rows;

  let checked = 0;
  for (let i = rows.length - 1; i >= 0 && checked < GUARD_ROWS; i--) {
    const verdict = invariant(rows[i], i > 0 ? rows[i - 1] : null);
    if (verdict === null) continue;
    checked++;
    if (!verdict) {
      console.error(
        `[koreaLeverage] ${objName} failed its column check at ${rows[i].TMPV1}. ` +
          `Dropping the screen rather than reporting values from columns that may have moved.`,
      );
      return [];
    }
  }

  if (checked === 0) {
    console.error(
      `[koreaLeverage] ${objName} returned ${rows.length} rows but none were checkable — ` +
        `the columns this screen is read by are missing.`,
    );
    return [];
  }

  return rows;
}

function num(row: FreesisRow, column: string): number | null {
  const raw = row[column];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** FreeSIS returns `yyyyMMdd`; everything downstream, charts included, wants ISO. */
function toIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Today in Seoul, as the upper bound of the query window.
 *
 * Asking for a date the exchange has not reached is harmless — FreeSIS returns
 * nothing past its latest row — but asking in UTC would drop the newest row for
 * the nine hours a day Seoul is already on the following date.
 */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
}

/**
 * One screen's full daily history, oldest first.
 *
 * Returns [] rather than throwing on any failure. Four of these run in parallel
 * and the panel degrades a row at a time — losing the market-cap call should
 * cost the ratio line, not the whole page.
 */
async function fetchScreen(
  objName: string,
  divisor: number,
  invariant: ScreenInvariant,
): Promise<FreesisRow[]> {
  const body = JSON.stringify({
    dmSearch: {
      // D = daily; the same screens also serve M, Q and Y, unused here.
      //
      // Must be exactly "D". FreeSIS falls back to daily for ANY unrecognised
      // period code — "ZZZ" and "" both return the full daily series — so a
      // wrong code here would look like it worked. (It did: this was "RD" until
      // the codes were probed directly, which is the value FreeSIS reports for
      // the latest daily date, not the value it accepts as a period.) The
      // column guard below cannot catch a frequency change, because a monthly
      // series satisfies every one of these identities perfectly.
      tmpV1: "D",
      tmpV45: HISTORY_START,
      tmpV46: todayInSeoul(),
      tmpV40: String(divisor),
      // Second unit selector, for the share-count columns on the market screens.
      // Those columns are not read here, but the field has to be present.
      tmpV41: String(divisor),
      OBJ_NM: objName,
    },
  });

  try {
    const res = await fetch(FREESIS_URL, {
      method: "POST",
      headers: FREESIS_HEADERS,
      body,
      // Daily data, published once per session — an hour is already finer than
      // the series moves. Next keys the fetch cache on the POST body, so the
      // four screens cache independently of each other.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[koreaLeverage] ${objName} failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const rows: FreesisRow[] = data?.ds1 ?? [];
    // FreeSIS returns newest first; every consumer here wants oldest first.
    // The date filter is itself a weak guard: if the date column ever moves off
    // TMPV1, every row drops and the screen goes empty rather than misreading.
    const ordered = rows
      .filter((r) => typeof r.TMPV1 === "string" && r.TMPV1.length === 8)
      .reverse();
    return enforceInvariant(enforceDailyFrequency(ordered, objName), objName, invariant);
  } catch (e) {
    console.error(`[koreaLeverage] ${objName} threw:`, e);
    return [];
  }
}

export type KoreaLeverageRange = "1Y" | "5Y" | "MAX";
export const KOREA_LEVERAGE_RANGES: KoreaLeverageRange[] = ["1Y", "5Y", "MAX"];

export type KoreaLeverageMetric = "ratio" | "level";

export interface KoreaLeveragePoint {
  /** ISO date. Settlement-date basis (결제일 기준), so it trails the index by a session. */
  date: string;
  /** 신용거래융자 balance, trillions of won. */
  level: number;
  /** The same balance as a percentage of KOSPI+KOSDAQ market cap. */
  ratio: number | null;
}

/** A metric plus everything needed to say where it sits against its own past. */
export interface KoreaLeverageAnchor {
  value: number;
  /** Percentile rank against every daily observation available, 0–100. */
  percentile: number;
  /** First year the series covers, so the percentile can name its own basis. */
  since: string;
  high: { date: string; value: number };
  /** Percent change from the record high — negative whenever below it. */
  fromHighPct: number;
}

export interface KoreaLeverageData {
  /** Date of the credit figures, or null when that screen returned nothing. */
  asOf: string | null;
  /** Date of the market-cap figures, which run a session ahead of the credit ones. */
  marketAsOf: string | null;
  /** Date of the deposits and forced-sale figures. */
  fundsAsOf: string | null;

  /** 신용거래융자 as a share of market cap, with its historical anchor. */
  ratio: KoreaLeverageAnchor | null;
  /** 신용거래융자 balance in trillions of won, with its historical anchor. */
  level: KoreaLeverageAnchor | null;

  /** 유가증권 (KOSPI) share of the margin balance, trillions of won. */
  marginKospi: number | null;
  /** 코스닥 (KOSDAQ) share of the margin balance, trillions of won. */
  marginKosdaq: number | null;
  /** 예탁증권담보융자 — lending against securities already held, trillions of won. */
  collateralLoans: number | null;

  /** 투자자예탁금 — cash parked at brokers, trillions of won. */
  deposits: number | null;
  /** 위탁매매 미수금 — trades not paid for by settlement, trillions of won. */
  receivables: number | null;
  /** 반대매매 — the part of those receivables the broker liquidated, trillions of won. */
  forcedSales: number | null;
  /**
   * KOFIA's published 반대매매 비중, taken from their column rather than divided
   * here — and its denominator is the PREVIOUS session's receivables, not the
   * same row's. 미수금 arising on D is liquidated on D+1. Verified over the full
   * history: a one-day lag reproduces this column on all 7,176 rows to within
   * its own rounding, same-day division disagrees on 57% of them. Anything
   * pairing this with `receivables` has to say which day it means.
   */
  forcedSaleRatio: number | null;
  /** Highest forced-sale ratio of the last 60 sessions, as context for today's. */
  forcedSaleRatio60dHigh: number | null;

  /** Chart series, downsampled per range. */
  series: Record<KoreaLeverageRange, KoreaLeveragePoint[]>;

  /** True when the credit screen came back empty — the panel has nothing to draw. */
  unavailable: boolean;
}

function downsample(points: KoreaLeveragePoint[]): KoreaLeveragePoint[] {
  if (points.length <= MAX_POINTS) return points;
  const stride = Math.ceil(points.length / MAX_POINTS);

  const keep = new Set<number>();
  for (let i = 0; i < points.length; i += stride) keep.add(i);
  // The stride rarely lands on the final observation, and dropping it would put
  // the panel's headline number off the right-hand end of its own chart.
  keep.add(points.length - 1);

  // Both metrics' extremes are forced in. A stride that steps over the record
  // day draws a series whose own maximum is lower than the record printed
  // directly above it — on the MAX range that showed as a chart topping out at
  // ₩38.09tn under a headline quoting ₩38.63tn.
  for (const pick of [
    (p: KoreaLeveragePoint) => p.level,
    (p: KoreaLeveragePoint) => p.ratio,
  ]) {
    let hiIndex = -1;
    let loIndex = -1;
    let hi = -Infinity;
    let lo = Infinity;
    points.forEach((p, i) => {
      const v = pick(p);
      if (v === null) return;
      if (v > hi) [hi, hiIndex] = [v, i];
      if (v < lo) [lo, loIndex] = [v, i];
    });
    if (hiIndex >= 0) keep.add(hiIndex);
    if (loIndex >= 0) keep.add(loIndex);
  }

  return Array.from(keep)
    .sort((a, b) => a - b)
    .map((i) => points[i]);
}

function sliceYears(points: KoreaLeveragePoint[], years: number): KoreaLeveragePoint[] {
  if (points.length === 0) return points;
  const cutoff = new Date(`${points[points.length - 1].date}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const iso = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= iso);
}

function anchorFor(series: SeriesPoint[]): KoreaLeverageAnchor | null {
  if (series.length === 0) return null;
  const values = series.map((p) => p.value);
  const current = values[values.length - 1];
  let high = series[0];
  for (const p of series) if (p.value > high.value) high = p;
  return {
    value: current,
    percentile: percentileRank(values, current),
    since: series[0].date.slice(0, 4),
    high: { date: high.date, value: high.value },
    fromHighPct: high.value === 0 ? 0 : ((current - high.value) / high.value) * 100,
  };
}

const EMPTY: KoreaLeverageData = {
  asOf: null,
  marketAsOf: null,
  fundsAsOf: null,
  ratio: null,
  level: null,
  marginKospi: null,
  marginKosdaq: null,
  collateralLoans: null,
  deposits: null,
  receivables: null,
  forcedSales: null,
  forcedSaleRatio: null,
  forcedSaleRatio60dHigh: null,
  series: { "1Y": [], "5Y": [], MAX: [] },
  unavailable: true,
};

export async function fetchKoreaLeverage(): Promise<KoreaLeverageData> {
  const [credit, funds, kospi, kosdaq] = await Promise.all([
    fetchScreen(OBJ.credit, CREDIT_DIVISOR, CREDIT_INVARIANT),
    fetchScreen(OBJ.funds, CREDIT_DIVISOR, FUNDS_INVARIANT),
    fetchScreen(OBJ.kospi, MARKET_DIVISOR, MARKET_INVARIANT),
    fetchScreen(OBJ.kosdaq, MARKET_DIVISOR, MARKET_INVARIANT),
  ]);

  if (credit.length === 0) return EMPTY;

  const toTn = (v: number | null, divisor: number) =>
    v === null ? null : (v * divisor) / KRW_PER_TRILLION;

  // Market cap is the sum of both boards; TMPV5 is 시가총액 on each market
  // screen. KOSDAQ only starts in November 2000, so before then there is a KOSPI
  // figure but no total — and a ratio against KOSPI alone would be silently too
  // high rather than obviously missing. Those dates get a null ratio instead.
  const kospiCap = new Map(kospi.map((r) => [r.TMPV1, num(r, "TMPV5")]));
  const kosdaqCap = new Map(kosdaq.map((r) => [r.TMPV1, num(r, "TMPV5")]));

  // 신용공여 잔고 추이 columns:
  //   TMPV2/3/4  신용거래융자 — total / 유가증권 / 코스닥
  //   TMPV5/6/7  신용거래대주 — retail stock borrowing, three orders smaller, unused
  //   TMPV8      청약자금대출 — IPO subscription loans, zero for years at a time
  //   TMPV9      예탁증권담보융자
  const points: KoreaLeveragePoint[] = [];
  for (const row of credit) {
    const marginRaw = num(row, "TMPV2");
    // Zero is a gap, not a reading. Seven sessions scattered through 1998-99
    // report a total margin balance of exactly 0 between neighbours of ₩240bn —
    // a market-wide credit book cannot empty and refill overnight, so these are
    // missing observations. Left in, they put a spike to the floor in the MAX
    // chart and pull the percentile of every later reading upward.
    if (marginRaw === null || marginRaw === 0) continue;
    const level = (marginRaw * CREDIT_DIVISOR) / KRW_PER_TRILLION;

    const ks = kospiCap.get(row.TMPV1) ?? null;
    const kq = kosdaqCap.get(row.TMPV1) ?? null;
    const capTn =
      ks !== null && kq !== null ? ((ks + kq) * MARKET_DIVISOR) / KRW_PER_TRILLION : null;

    points.push({
      date: toIso(row.TMPV1),
      level,
      ratio: capTn !== null && capTn > 0 ? (level / capTn) * 100 : null,
    });
  }
  if (points.length === 0) return EMPTY;

  const latestCredit = credit[credit.length - 1];
  const latestFunds = funds.length > 0 ? funds[funds.length - 1] : null;
  const latestMarket = kospi.length > 0 ? kospi[kospi.length - 1] : null;

  // 증시자금추이 columns:
  //   TMPV2 투자자예탁금 (excluding listed-derivative margin deposits)
  //   TMPV3 장내파생상품 거래예수금, TMPV4 대고객 RP 매도잔고 — not read here
  //   TMPV5 위탁매매 미수금
  //   TMPV6 그 미수금 대비 실제 반대매매금액
  //   TMPV7 반대매매 비중 (%) — already a percentage, so the divisor does not touch it
  const forcedRatios = funds
    .slice(-60)
    .map((r) => num(r, "TMPV7"))
    .filter((v): v is number => v !== null);

  const levelSeries: SeriesPoint[] = points.map((p) => ({ date: p.date, value: p.level }));
  const ratioSeries: SeriesPoint[] = points
    .filter((p): p is KoreaLeveragePoint & { ratio: number } => p.ratio !== null)
    .map((p) => ({ date: p.date, value: p.ratio }));

  return {
    asOf: toIso(latestCredit.TMPV1),
    marketAsOf: latestMarket ? toIso(latestMarket.TMPV1) : null,
    fundsAsOf: latestFunds ? toIso(latestFunds.TMPV1) : null,

    ratio: anchorFor(ratioSeries),
    level: anchorFor(levelSeries),

    marginKospi: toTn(num(latestCredit, "TMPV3"), CREDIT_DIVISOR),
    marginKosdaq: toTn(num(latestCredit, "TMPV4"), CREDIT_DIVISOR),
    collateralLoans: toTn(num(latestCredit, "TMPV9"), CREDIT_DIVISOR),

    deposits: latestFunds ? toTn(num(latestFunds, "TMPV2"), CREDIT_DIVISOR) : null,
    receivables: latestFunds ? toTn(num(latestFunds, "TMPV5"), CREDIT_DIVISOR) : null,
    forcedSales: latestFunds ? toTn(num(latestFunds, "TMPV6"), CREDIT_DIVISOR) : null,
    forcedSaleRatio: latestFunds ? num(latestFunds, "TMPV7") : null,
    forcedSaleRatio60dHigh: forcedRatios.length > 0 ? Math.max(...forcedRatios) : null,

    series: {
      "1Y": downsample(sliceYears(points, 1)),
      "5Y": downsample(sliceYears(points, 5)),
      MAX: downsample(points),
    },

    unavailable: false,
  };
}
