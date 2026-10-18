/**
 * Nightly screen of SEC Form 4 filings for notable insider transactions on
 * watchlist tickers. Writes to `insider_transactions` (see
 * scripts/insider-transactions-table.sql), read back by the Insider column in
 * components/StockTable.tsx.
 *
 * Usage:
 *   node scripts/screen-insider-transactions.js              # write
 *   node scripts/screen-insider-transactions.js --dry-run    # print, write nothing
 *   node scripts/screen-insider-transactions.js --days=5     # force a lookback
 *
 *
 * WHY THE DAILY INDEX RATHER THAN PER-TICKER QUERIES
 *
 * EDGAR will answer "every filing by this company" at
 * data.sec.gov/submissions/CIK##########.json, and that feed does include the
 * company's Form 4s. But it costs one request per watchlist ticker per day
 * (~130), and its `recent` block is capped at 1000 filings -- for a heavily
 * filed name that is only a few months of history.
 *
 * The daily index is one file covering the ENTIRE market for one day:
 * ~11,000 filings, ~1,100 of them Form 4, 2.1 MB raw but 242 KB gzipped. One
 * request replaces a hundred and thirty. It works because EDGAR indexes each
 * filing under every filer CIK on it -- including the ISSUER, not just the
 * insider -- so a watchlist company's Form 4s can be found by CIK set
 * membership without knowing any insider's name in advance.
 *
 *
 * WHY CIKs ARE RESOLVED IN MEMORY EVERY RUN
 *
 * EDGAR has no ticker lookup; everything is keyed by CIK. That mapping could be
 * cached in a `cik` column on `stocks`, but it would need a schema change, a
 * backfill script, and a maintenance path -- and a ticker added to the watchlist
 * would stay invisible to this job until someone remembered to resolve it.
 * Fetching company_tickers.json (10,387 entries) is one request per run and has
 * none of those failure modes.
 */

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

const DRY_RUN = process.argv.includes("--dry-run");
const DAYS_ARG = process.argv.find((a) => a.startsWith("--days="));
// Five days is a week of catch-up. The cap matters because the index files are
// the expensive part of a backfill, not the filings themselves.
const LOOKBACK_DAYS = DAYS_ARG ? Number(DAYS_ARG.split("=")[1]) : 5;

const SEC_USER_AGENT = process.env.SEC_USER_AGENT;

const { secFetch, quarterOf, isoDate, discoverIndexDates, IDX_ROW, parseForm4 } = require("./lib/edgar");

// ---------------------------------------------------------------------------
// Watchlist -> CIK
// ---------------------------------------------------------------------------

/**
 * EDGAR writes multi-class tickers with a DASH where market data vendors (and
 * therefore this watchlist) use a DOT: BRK.B is BRK-B, BF.B is BF-B, MOG.A is
 * MOG-A. Without this normalisation those names silently never match and simply
 * never show insider activity, which looks identical to having none.
 */
function normalizeTicker(ticker) {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

async function buildCikMap() {
  const { data: stocks, error } = await supabase.from("stocks").select("ticker");
  if (error) {
    console.error("Failed to fetch watchlist:", error.message);
    process.exit(1);
  }

  const body = await secFetch("https://www.sec.gov/files/company_tickers.json");
  const edgar = JSON.parse(body);

  const symbolToCik = new Map();
  for (const row of Object.values(edgar)) {
    symbolToCik.set(normalizeTicker(row.ticker), String(row.cik_str));
  }

  // CIK -> watchlist ticker, keyed on the UNPADDED cik because that is the form
  // the daily index prints.
  const cikToTicker = new Map();
  const unresolved = [];
  for (const { ticker } of stocks) {
    const cik = symbolToCik.get(normalizeTicker(ticker));
    if (!cik) {
      unresolved.push(ticker);
      continue;
    }
    cikToTicker.set(cik, ticker);
  }

  // Printed rather than swallowed: an unresolved ticker is permanently invisible
  // to this job, and that is indistinguishable from "these insiders never trade"
  // unless the run says so out loud. Most entries here are legitimate -- ETFs and
  // foreign private issuers file no Section 16 reports at all -- but a genuine
  // symbol mismatch hides in exactly the same place.
  if (unresolved.length) {
    console.log(
      `No SEC CIK for ${unresolved.length} watchlist symbol(s) — ` +
        `no insider data will ever appear for these:\n  ${unresolved.join(", ")}\n`
    );
  }

  return cikToTicker;
}

// ---------------------------------------------------------------------------
// Daily index -> matching accessions
// ---------------------------------------------------------------------------

async function findFilings(indexDate, cikToTicker) {
  const body = await secFetch(
    `https://www.sec.gov/Archives/edgar/daily-index/${quarterOf(indexDate)}/form.${indexDate}.idx`
  );
  if (!body) return [];

  // Keyed by accession: a Form 4 appears once per filer CIK on it, so a filing by
  // seven affiliated entities is seven identical rows pointing at one document.
  // Fetching it seven times would be seven times the requests for the same bytes.
  const byAccession = new Map();
  let formFourRows = 0;

  for (const line of body.split(/\r?\n/)) {
    const match = IDX_ROW.exec(line);
    if (!match) continue;
    formFourRows++;

    const [, , , cik, filedDate, path] = match;
    const ticker = cikToTicker.get(String(Number(cik)));
    if (!ticker) continue;

    const accession = path.match(/(\d{10}-\d{2}-\d{6})\.txt$/)?.[1];
    if (!accession || byAccession.has(accession)) continue;

    byAccession.set(accession, {
      accession,
      ticker,
      issuerCik: cik,
      filedDate: isoDate(filedDate),
      indexDate: isoDate(indexDate),
      url: `https://www.sec.gov/Archives/${path}`,
    });
  }

  console.log(
    `  ${indexDate}: ${formFourRows} Form 4 index rows, ${byAccession.size} on the watchlist`
  );
  return [...byAccession.values()];
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Folds a broker's price-band slicing back into the single trade it was.
 *
 * A market order filled across three prices is reported as three lines. Treating
 * those as three transactions is wrong twice over: it triples the apparent number
 * of decisions, and since each line reports the balance remaining AFTER that band,
 * the percentage-of-holding for the later bands is measured against an already
 * depleted balance. Robinhood's co-founder selling one 50,317-share position came
 * out as three separate sales of 34%, 82% and 100% "of holding".
 *
 * Grouping includes direct-vs-indirect ownership because shares held outright and
 * shares held through a trust are different pools; summing across them would
 * compute a fraction of a balance that does not exist in either.
 */
function aggregateTransactions(transactions) {
  const groups = new Map();

  for (const tx of transactions) {
    const key = [
      tx.isDerivative ? "D" : "N",
      tx.transactionCode,
      tx.transactionDate,
      tx.securityTitle,
      tx.ownershipType,
    ].join("|");

    const group = groups.get(key);
    if (!group) {
      groups.set(key, { ...tx, lineCount: 1, notional: (tx.shares ?? 0) * (tx.pricePerShare ?? 0) });
      continue;
    }

    group.lineCount++;
    group.shares = (group.shares ?? 0) + (tx.shares ?? 0);
    group.notional += (tx.shares ?? 0) * (tx.pricePerShare ?? 0);
    // Document order is execution order, so the last band's balance is the true
    // balance once the whole order has filled.
    group.sharesOwnedAfter = tx.sharesOwnedAfter ?? group.sharesOwnedAfter;
  }

  return [...groups.values()].map((group) => ({
    ...group,
    // Volume-weighted, so a $250k threshold means $250k actually transacted rather
    // than an unweighted average of whatever prices happened to print.
    pricePerShare: group.shares ? group.notional / group.shares : group.pricePerShare,
  }));
}

/**
 * Marks the same-day "exercise and sell": an option exercise (M) or share
 * conversion (C) covering at least as many shares as a sale on the same day and
 * security. That is an employee turning compensation into cash, usually on a
 * pre-set schedule -- not a view on the stock. It reaches the wire looking exactly
 * like a large discretionary sale, and it is the single most common way an insider
 * screen misleads: both of the largest "insider sales" in the first live run of
 * this script were this pattern.
 */
function markExerciseSales(groups) {
  for (const group of groups) {
    if (group.transactionCode !== "S" || group.isDerivative) continue;
    group.isExerciseSale = groups.some(
      (other) =>
        (other.transactionCode === "M" || other.transactionCode === "C") &&
        other.transactionDate === group.transactionDate &&
        (other.shares ?? 0) >= (group.shares ?? 0)
    );
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Notability
// ---------------------------------------------------------------------------
//
// The API side of this job is easy; this is the part that decides whether the
// column is worth looking at. Roughly four out of five Form 4 lines are
// compensation plumbing that no one decided anything about:
//
//   M  option/derivative exercise      A  grant or award from the company
//   F  shares withheld to pay tax      G  gift
//   C  conversion                      others: various non-open-market events
//
// Only P and S are someone choosing to trade at a market price, so only those can
// ever be notable. Everything else is still STORED (see the table's header
// comment) — it is just never surfaced.

// A sale below this is not worth a glance regardless of who made it.
const MIN_SALE_VALUE_USD = 250_000;
// ...and neither is one that barely dents the position. An executive trimming 1%
// of their holding is portfolio housekeeping; a third of it is a statement.
const MIN_SALE_FRACTION = 0.05;

function classify(tx) {
  if (tx.isDerivative) return { isNotable: false, reason: null };

  if (tx.transactionCode === "P") {
    // Purchases get no size floor at all. An insider buying their own stock on the
    // open market is a deliberate, costly, personally-exposed act at any size, and
    // it is rare enough that a small one is still worth seeing.
    return { isNotable: true, reason: "Open-market purchase" };
  }

  if (tx.transactionCode === "S") {
    if (tx.valueUsd == null || tx.valueUsd < MIN_SALE_VALUE_USD) {
      return { isNotable: false, reason: null };
    }

    // Said plainly rather than folded into the size test: an exercise-and-sell is
    // still real supply hitting the market, so it stays notable, but calling it
    // "sold 100% of holding" without saying where those shares came from an hour
    // earlier is the misleading part.
    const qualifier = tx.isExerciseSale ? "Exercise & sell" : null;

    // sharesOwnedAfter is the post-trade balance, so the pre-trade holding has to
    // be reconstructed. Null means the filing did not say, in which case size
    // alone has to carry the decision.
    if (tx.sharesOwnedAfter != null && tx.shares != null) {
      const before = tx.sharesOwnedAfter + tx.shares;
      const fraction = before > 0 ? tx.shares / before : 0;
      if (fraction < MIN_SALE_FRACTION) return { isNotable: false, reason: null };
      const sized = `Sold ${(fraction * 100).toFixed(0)}% of holding`;
      return { isNotable: true, reason: qualifier ? `${qualifier} — ${sized}` : sized };
    }
    return { isNotable: true, reason: qualifier ?? "Large open-market sale" };
  }

  return { isNotable: false, reason: null };
}

/**
 * Promotes clustered buying, which the per-transaction rule cannot see. Two
 * officers independently buying the same stock in the same week is the pattern
 * with an actual reputation for meaning something, and each individual purchase
 * is already notable — this exists to LABEL them as a cluster so the UI can
 * distinguish "the CFO bought" from "three of them did".
 */
const CLUSTER_WINDOW_DAYS = 5;

function markClusters(rows) {
  const buysByTicker = new Map();
  for (const row of rows) {
    if (row.transaction_code !== "P" || row.is_derivative) continue;
    if (!buysByTicker.has(row.ticker)) buysByTicker.set(row.ticker, []);
    buysByTicker.get(row.ticker).push(row);
  }

  for (const [, buys] of buysByTicker) {
    for (const row of buys) {
      const anchor = new Date(row.transaction_date ?? row.filed_date).getTime();
      const nearbyOwners = new Set(
        buys
          .filter((other) => {
            const when = new Date(other.transaction_date ?? other.filed_date).getTime();
            return Math.abs(when - anchor) <= CLUSTER_WINDOW_DAYS * 86400000;
          })
          .map((other) => other.owner_cik)
      );
      if (nearbyOwners.size >= 2) {
        row.notable_reason = `Cluster buy — ${nearbyOwners.size} insiders`;
      }
    }
  }
}

// ---------------------------------------------------------------------------

function toRows(filing, parsed) {
  // A Form 4 filed jointly by several entities reports ONE set of transactions
  // between them, not one set each. Fanning the lines out per owner would turn a
  // seven-entity fund structure into seven identical purchases and hand the
  // cluster rule a fake cluster. The first reporting owner is the attributed one
  // — filing agents list the natural person first — and the rest are recorded in
  // the name so nothing is lost.
  const owner = parsed.owners[0];
  if (!owner) return [];
  const extra = parsed.owners.length - 1;
  const ownerName = extra > 0 ? `${owner.name} (+${extra})` : owner.name;

  const groups = markExerciseSales(aggregateTransactions(parsed.transactions));

  return groups.map((tx, index) => {
    const valueUsd = tx.shares != null && tx.pricePerShare != null ? tx.shares * tx.pricePerShare : null;
    const { isNotable, reason } = classify({ ...tx, valueUsd });

    return {
      ticker: filing.ticker,
      issuer_cik: filing.issuerCik,
      accession_number: filing.accession,
      row_index: index,
      index_date: filing.indexDate,
      filed_date: filing.filedDate,
      // Falls back to the filing header only when a line carries no date of its
      // own, which is rare but does happen on amendments.
      transaction_date: tx.transactionDate ?? parsed.periodOfReport,
      period_of_report: parsed.periodOfReport,
      owner_name: ownerName,
      owner_cik: owner.cik,
      is_director: owner.isDirector,
      is_officer: owner.isOfficer,
      is_ten_percent_owner: owner.isTenPercentOwner,
      officer_title: owner.officerTitle,
      security_title: tx.securityTitle,
      transaction_code: tx.transactionCode,
      acquired_disposed: tx.acquiredDisposed,
      shares: tx.shares,
      price_per_share: tx.pricePerShare,
      value_usd: valueUsd,
      shares_owned_after: tx.sharesOwnedAfter,
      is_derivative: tx.isDerivative,
      line_count: tx.lineCount,
      ownership_type: tx.ownershipType,
      is_exercise_sale: tx.isExerciseSale ?? false,
      is_10b5_1: parsed.is10b51,
      is_notable: isNotable,
      notable_reason: reason,
    };
  });
}

function formatUsd(value) {
  if (value == null) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

function printDryRun(rows) {
  const notable = rows.filter((r) => r.is_notable);
  console.log(`\n--- DRY RUN: ${rows.length} transaction lines, ${notable.length} notable ---\n`);

  const byCode = {};
  for (const row of rows) byCode[row.transaction_code ?? "?"] = (byCode[row.transaction_code ?? "?"] ?? 0) + 1;
  console.log(
    "Transaction codes: " +
      Object.entries(byCode)
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `${code}=${n}`)
        .join("  ")
  );

  if (!notable.length) {
    console.log("\nNothing cleared the notability bar.");
    return;
  }

  console.log("");
  for (const row of notable.sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))) {
    const role = row.officer_title ?? (row.is_director ? "Director" : row.is_ten_percent_owner ? "10% owner" : "—");
    console.log(
      `${row.transaction_date}  ${row.ticker.padEnd(6)} ${row.transaction_code}  ` +
        `${formatUsd(row.value_usd).padStart(7)}  ${(row.owner_name ?? "").slice(0, 28).padEnd(28)} ` +
        `${role.slice(0, 22).padEnd(22)} ${row.is_10b5_1 ? "10b5-1  " : "        "}${row.notable_reason ?? ""}`
    );
  }
}

async function main() {
  if (!SEC_USER_AGENT) {
    console.error(
      "SEC_USER_AGENT is not set.\n\n" +
        "The SEC answers 403 to any request without a descriptive User-Agent naming\n" +
        "you and a contact address. Set it in .env.local (and as a repo variable for\n" +
        "the Actions run), for example:\n\n" +
        '  SEC_USER_AGENT="BL Investment Dashboard you@example.com"\n'
    );
    process.exit(1);
  }

  const cikToTicker = await buildCikMap();
  console.log(`Watchlist resolved to ${cikToTicker.size} SEC CIKs.\n`);

  // The newest index date already stored IS the bookmark — no separate state to
  // keep in sync with what actually landed.
  const { data: latest } = await supabase
    .from("insider_transactions")
    .select("index_date")
    .order("index_date", { ascending: false })
    .limit(1);
  const since = latest?.[0]?.index_date?.replace(/-/g, "") ?? null;

  const dates = await discoverIndexDates(since, LOOKBACK_DAYS);
  if (!dates.length) {
    console.log(`No unprocessed index dates${since ? ` since ${isoDate(since)}` : ""}. Nothing to do.`);
    return;
  }
  console.log(`Processing ${dates.length} index date(s): ${dates.join(", ")}\n`);

  const filings = [];
  for (const date of dates) filings.push(...(await findFilings(date, cikToTicker)));

  if (!filings.length) {
    console.log("\nNo watchlist Form 4 filings in that window.");
    return;
  }
  console.log(`\nFetching ${filings.length} Form 4 filing(s)...`);

  const rows = [];
  for (const filing of filings) {
    try {
      const txt = await secFetch(filing.url);
      if (!txt) {
        console.warn(`  ${filing.accession}: 404`);
        continue;
      }
      const parsed = parseForm4(txt);
      if (!parsed) {
        // A Form 4 with no ownership XML is a paper or legacy filing. Rare, and
        // not worth failing the run over, but worth saying so.
        console.warn(`  ${filing.accession} (${filing.ticker}): no ownership XML, skipped`);
        continue;
      }
      rows.push(...toRows(filing, parsed));
    } catch (err) {
      console.error(`  ${filing.accession} (${filing.ticker}): ${err.message}`);
    }
  }

  markClusters(rows);

  if (DRY_RUN) {
    printDryRun(rows);
    return;
  }

  if (!rows.length) {
    console.log("Nothing to write.");
    return;
  }

  // onConflict on the natural key makes a re-run of an already-processed day a
  // no-op update rather than a duplicate set.
  const { error } = await supabase
    .from("insider_transactions")
    .upsert(rows, { onConflict: "accession_number,row_index" });

  if (error) {
    console.error(`Write failed (${error.code}): ${error.message}`);
    process.exit(1);
  }

  const notable = rows.filter((r) => r.is_notable).length;
  console.log(`Wrote ${rows.length} transaction line(s), ${notable} notable.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
