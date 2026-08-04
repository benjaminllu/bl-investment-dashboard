// Backfills daily closes and volume into price_history for every held ticker
// plus the benchmark, and the FRED 3-month bill into risk_free_rates.
//
// Yahoo rather than Finnhub: /stock/candle is 403 on the free tier, while
// Yahoo's chart endpoint is free, already used in this project for S&P futures,
// and covers the OTC foreign listings Finnhub has no profile for.
//
// Safe to re-run: every write is an upsert on (ticker, date), so a second run
// refreshes recent bars and leaves settled history untouched.
const { createClient } = require("@supabase/supabase-js");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const fs = require("fs");
    const envContent = fs.readFileSync(".env.local", "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // .env.local not present — rely on process.env already being set
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Everything is measured against this, so it is fetched like any holding. */
const BENCHMARK = "SPY";
const RANGE = "5y";

// Yahoo is an undocumented endpoint with no published rate limit. 300ms between
// symbols is unhurried enough not to look like abuse for a ~35 symbol run.
const DELAY_MS = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isQuotable(ticker) {
  return !ticker.startsWith("$") && !/\s/.test(ticker);
}

/** Yahoo timestamps are UTC seconds at market open; the date is what matters. */
function isoDate(seconds) {
  return new Date(seconds * 1000).toISOString().split("T")[0];
}

/**
 * The two providers disagree on how to separate a share class. Finnhub wants
 * BRK.B and Yahoo wants BRK-B; BRK.B is a hard 404 there, verified against
 * BRK.B / BRK-B / BRKB.
 *
 * Tickers are stored in Finnhub's form because that is what quotes and
 * fundamentals join on, so the translation happens here at the request and the
 * rows are written back under the stored symbol. Without it a class-B holding
 * silently has no price history at all — and since every risk window requires a
 * full history, it would be dropped from the return series rather than error.
 */
function toYahooSymbol(ticker) {
  return ticker.replace(".", "-");
}

async function fetchHistory(ticker) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(ticker))}` +
      `?range=${RANGE}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description ?? "no result");

  const stamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const rows = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = quote.close?.[i];
    // A null close is a genuine gap (halt, holiday misalignment). Skipping it
    // is right: carrying the previous close forward would invent a 0% return
    // day and deflate every volatility figure computed downstream.
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    rows.push({
      ticker,
      date: isoDate(stamps[i]),
      close,
      volume: typeof quote.volume?.[i] === "number" ? quote.volume[i] : null,
    });
  }
  return rows;
}

async function writeRows(rows) {
  // Chunked because a 1250-row upsert is large enough to trip request limits.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("price_history")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "ticker,date" });
    if (error) throw new Error(error.message);
  }
}

async function backfillRiskFree() {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    console.error("  FRED_API_KEY not set — skipping risk-free rates");
    return 0;
  }
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  const res = await fetch(
    `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=DTB3&api_key=${key}&file_type=json` +
      `&observation_start=${start.toISOString().split("T")[0]}`
  );
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const json = await res.json();
  // FRED writes "." for days with no observation (holidays); those are gaps,
  // not zero-yield days, and must not be stored as 0.
  const rows = (json.observations ?? [])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, annual_pct: Number(o.value) }))
    .filter((o) => Number.isFinite(o.annual_pct));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("risk_free_rates")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "date" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

async function main() {
  const { data: positions, error } = await supabase
    .from("portfolio_positions")
    .select("ticker");

  if (error) {
    console.error(`Failed to read portfolio positions (${error.code}): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const held = [...new Set((positions ?? []).map((p) => p.ticker))].filter(isQuotable).sort();
  const targets = [BENCHMARK, ...held.filter((t) => t !== BENCHMARK)];

  console.log(`Backfilling ${RANGE} of daily history for ${targets.length} symbols`);
  console.log(`(${held.length} held + benchmark ${BENCHMARK})\n`);

  let ok = 0;
  const failures = [];
  for (const ticker of targets) {
    try {
      const rows = await fetchHistory(ticker);
      if (rows.length === 0) {
        failures.push(`${ticker}: no usable bars`);
        console.log(`✗ ${ticker.padEnd(8)} no usable bars`);
      } else {
        await writeRows(rows);
        ok++;
        console.log(
          `✓ ${ticker.padEnd(8)} ${String(rows.length).padStart(5)} bars  ` +
            `${rows[0].date} → ${rows[rows.length - 1].date}`
        );
      }
    } catch (e) {
      failures.push(`${ticker}: ${e.message}`);
      console.log(`✗ ${ticker.padEnd(8)} ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  try {
    const n = await backfillRiskFree();
    console.log(`\n✓ risk-free (DTB3): ${n} observations`);
  } catch (e) {
    failures.push(`DTB3: ${e.message}`);
    console.error(`\n✗ risk-free (DTB3): ${e.message}`);
  }

  console.log(`\nDone. ${ok}/${targets.length} symbols backfilled.`);
  if (failures.length > 0) {
    console.log(`${failures.length} problem(s):`);
    for (const f of failures) console.log(`  ${f}`);
  }
}

main();
