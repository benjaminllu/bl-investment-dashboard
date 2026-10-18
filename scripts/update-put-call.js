/**
 * Cboe daily option volume by product, into `cboe_put_call`
 * (scripts/positioning-tables.sql). Read by lib/putCall.ts.
 *
 * Usage:
 *   node scripts/update-put-call.js --backfill   # legacy CSVs + every daily file since 2019-10-07
 *   node scripts/update-put-call.js              # nightly: the last stored day onward
 *   node scripts/update-put-call.js --dry-run    # print, write nothing
 *
 *
 * TWO SOURCES, ONE SEAM
 *
 * Cboe froze its downloadable put/call CSVs on 2019-10-04. From 2019-10-07 the
 * same numbers are published as one JSON file per trading day at
 * cdn.cboe.com/data/us/options/market_statistics/daily/YYYY-MM-DD_daily_options,
 * which answers 403 for a weekend or holiday. The two meet with no overlap, so
 * the seam cannot be checked on a shared day; equity put/call reads 0.65-0.84
 * on the three days before it and 0.59-0.70 on the three after.
 *
 * The nightly run re-fetches the last few stored days as well as new ones:
 * Cboe notes the daily volume "may be based upon preliminary reported volume",
 * and the upsert makes a re-fetch a no-op when nothing changed.
 */

const { createClient } = require("@supabase/supabase-js");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const fs = require("fs");
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // .env.local not present — rely on process.env already being set
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BACKFILL = process.argv.includes("--backfill");
const DRY_RUN = process.argv.includes("--dry-run");
const FIRST_JSON_DAY = "2019-10-07";
const REFETCH_DAYS = 5;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const LEGACY = "https://cdn.cboe.com/resources/options/volume_and_call_put_ratios";
const DAILY = "https://cdn.cboe.com/data/us/options/market_statistics/daily";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Cboe ${res.status} for ${url}`);
  return res.text();
}

/** "11/1/2006" → "2006-11-01". */
function usDate(text) {
  const [m, d, y] = text.trim().split("/").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Data rows of a legacy CSV, skipping the disclaimer and header lines above them. */
function csvRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\d{1,2}\/\d{1,2}\/\d{4},/.test(line))
    .map((line) => line.split(",").map((c) => c.trim()));
}

async function legacyRows() {
  const [equity, index, spx] = await Promise.all(
    ["equitypc", "indexpc", "spxpc"].map((f) => get(`${LEGACY}/${f}.csv`)),
  );
  if (!equity || !index || !spx) throw new Error("a legacy CSV did not download");

  const byDate = new Map();
  // equitypc / indexpc: DATE,CALL,PUT,TOTAL,P/C Ratio
  for (const [date, call, put] of csvRows(equity)) {
    byDate.set(usDate(date), { trade_date: usDate(date), equity_call: Number(call), equity_put: Number(put) });
  }
  for (const [date, call, put] of csvRows(index)) {
    const row = byDate.get(usDate(date));
    if (row) Object.assign(row, { index_call: Number(call), index_put: Number(put) });
  }
  // spxpc has a different column order: Date,SPX Put/Call Ratio,SPX Put Volume,SPX Call Volume,Total
  for (const [date, , put, call] of csvRows(spx)) {
    const row = byDate.get(usDate(date));
    if (row) Object.assign(row, { spx_call: Number(call), spx_put: Number(put) });
  }
  return [...byDate.values()]
    .filter((r) => r.trade_date < FIRST_JSON_DAY && Number.isFinite(r.index_call))
    .map((r) => ({ spx_call: null, spx_put: null, ...r, source: "legacy-csv" }));
}

function volume(day, product) {
  const v = (day[product] ?? []).find((x) => x.name === "VOLUME");
  if (!v || !Number.isFinite(v.call) || !Number.isFinite(v.put)) throw new Error(`no ${product} volume`);
  return v;
}

async function dailyRow(date) {
  const body = await get(`${DAILY}/${date}_daily_options`);
  if (!body) return null;
  const day = JSON.parse(body);
  const equity = volume(day, "EQUITY OPTIONS");
  const index = volume(day, "INDEX OPTIONS");
  const spx = volume(day, "SPX + SPXW");
  return {
    trade_date: date,
    equity_call: equity.call,
    equity_put: equity.put,
    index_call: index.call,
    index_put: index.put,
    spx_call: spx.call,
    spx_put: spx.put,
    source: "daily-json",
  };
}

/** Weekdays from `start` to today inclusive; holidays are found by the 403. */
function weekdays(start) {
  const out = [];
  const end = new Date().toISOString().slice(0, 10);
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  let start = FIRST_JSON_DAY;
  const rows = [];

  if (BACKFILL) {
    rows.push(...(await legacyRows()));
    console.log(`Legacy CSVs: ${rows.length} days, ${rows[0].trade_date} → ${rows[rows.length - 1].trade_date}`);
  } else {
    const { data, error } = await supabase
      .from("cboe_put_call")
      .select("trade_date")
      .order("trade_date", { ascending: false })
      .limit(REFETCH_DAYS);
    if (error) throw new Error(`read failed (${error.code}): ${error.message}`);
    if (!data.length) throw new Error("cboe_put_call is empty — run once with --backfill first");
    start = data[data.length - 1].trade_date;
  }

  const days = weekdays(start);
  console.log(`Fetching ${days.length} daily file(s) from ${start}...`);
  let skipped = 0;
  for (const date of days) {
    const row = await dailyRow(date);
    if (row) rows.push(row);
    else skipped++;
    await sleep(100);
  }
  console.log(`Daily files: ${rows.filter((r) => r.source === "daily-json").length} days, ${skipped} without a file (market holidays, or not yet published)`);

  if (DRY_RUN) {
    console.log("Dry run. First and last rows:", rows[0], rows[rows.length - 1]);
    return;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("cboe_put_call").upsert(rows.slice(i, i + 500), { onConflict: "trade_date" });
    if (error) throw new Error(`write failed (${error.code}): ${error.message}`);
  }
  console.log(`Wrote ${rows.length} day(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
