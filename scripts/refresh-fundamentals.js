const { createClient } = require("@supabase/supabase-js");

// In GitHub Actions these come from the workflow env: block.
// Locally, load .env.local if present so the script works without manual export.
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

// Fetch + write logic is shared with the in-app "add ticker" action, so a
// ticker added from the UI is written exactly the way this job writes it.
const {
  EMPTY_PROFILE,
  EMPTY_METRICS,
  earningsWindow,
  fetchProfile,
  fetchMetrics,
  fetchEarnings,
  writeFundamentals,
  replaceEarnings,
} = require("./lib/finnhub");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Finnhub's free tier allows 60 req/min. Two calls per ticker with a 1.1s gap
// after each lands around 54 req/min, leaving headroom for clock drift.
const RATE_LIMIT_DELAY = 1100;

// A held ticker that cannot be sent to Finnhub — the cash sentinel is not a
// security, and an option symbol ("DPRO 01/15/2027 10.00 C") is not a symbol
// Finnhub accepts. Mirrors isQuotable in refresh-data.js.
function isQuotable(ticker) {
  return !ticker.startsWith("$") && !/\s/.test(ticker);
}

async function main() {
  const [{ data: stocks, error }, { data: held, error: heldError }] = await Promise.all([
    supabase.from("stocks").select("ticker").order("created_at", { ascending: true }),
    supabase.from("portfolio_positions").select("ticker"),
  ]);

  if (error) {
    console.error("Failed to fetch tickers:", error.message);
    process.exit(1);
  }
  // Not fatal: a missing portfolio table should not stop the watchlist refresh.
  if (heldError) {
    console.error(`Could not read portfolio positions (${heldError.code}): ${heldError.message}`);
  }

  // Anything held needs fundamentals too, whether or not it is on the
  // watchlist. Without this a held-but-unwatched name has no sector and no
  // beta, so it would vanish from the exposure pies and quietly bias every
  // weighted average — the same blind spot refresh-data.js had for quotes.
  // De-duplicated: a ticker can sit in more than one list, one row per list.
  const watchlist = [...new Set(stocks.map((s) => s.ticker))];
  const watchlistSet = new Set(watchlist);
  const heldOnly = [
    ...new Set((held ?? []).map((h) => h.ticker).filter((t) => !watchlistSet.has(t))),
  ]
    .filter(isQuotable)
    .sort();

  // Earnings are fetched only for the watchlist: the Portfolio tab shows no
  // earnings column, so a held-only name needs its characteristics but not its
  // calendar, and skipping it saves a call per ticker.
  const targets = [
    ...watchlist.map((ticker) => ({ ticker, withEarnings: true })),
    ...heldOnly.map((ticker) => ({ ticker, withEarnings: false })),
  ];

  const earningsDates = earningsWindow();

  console.log(
    `Refreshing fundamentals for ${targets.length} tickers ` +
      `(${watchlist.length} watchlist, ${heldOnly.length} held-only${heldOnly.length ? `: ${heldOnly.join(", ")}` : ""})...\n`
  );

  for (const { ticker, withEarnings } of targets) {
    let profile = EMPTY_PROFILE;
    let metrics = EMPTY_METRICS;

    // --- Profile: market cap, listing currency, sector ---
    try {
      profile = (await fetchProfile(ticker)) ?? EMPTY_PROFILE;
    } catch (e) {
      console.error(`  profile fetch error for ${ticker}:`, e.message);
    }

    await sleep(RATE_LIMIT_DELAY);

    // --- Metrics: P/E plus the exposure characteristics ---
    try {
      metrics = await fetchMetrics(ticker);
    } catch (e) {
      console.error(`  metric fetch error for ${ticker}:`, e.message);
    }

    await sleep(RATE_LIMIT_DELAY);

    // --- Earnings calendar (many rows per ticker) ---
    // Held-only tickers skip this block entirely — see `targets` above. A
    // failed fetch throws before replaceEarnings runs, so the ticker keeps its
    // existing rows rather than losing them.
    let earningsCount = 0;
    if (withEarnings) {
      try {
        const rows = await fetchEarnings(ticker, earningsDates);
        const eErr = await replaceEarnings(supabase, ticker, rows);
        if (eErr) console.error(`  earnings write error for ${ticker}: ${eErr.message}`);
        else earningsCount = rows.length;
      } catch (e) {
        console.error(`  earnings fetch error for ${ticker}:`, e.message);
      }
    }

    const wErr = await writeFundamentals(supabase, ticker, profile, metrics);
    if (wErr) console.error(`  write error for ${ticker}: ${wErr.message}`);

    await sleep(RATE_LIMIT_DELAY);
    console.log(
      `✓ ${ticker}  mcap=${profile.marketCap ?? "—"} ${profile.currency ?? ""}` +
        `  sector=${profile.sector ?? "—"}` +
        `  fwdPE=${metrics.forwardPe?.toFixed(1) ?? "—"}  beta=${metrics.beta?.toFixed(2) ?? "—"}` +
        `  earnings=${withEarnings ? earningsCount : "skipped"}`
    );
  }

  console.log("\nDone.");
}

main();
