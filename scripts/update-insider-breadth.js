/**
 * Market-wide insider buying and selling, one row per Form 4 filing date, into
 * `insider_breadth` (scripts/positioning-tables.sql). Read by
 * lib/insiderBreadth.ts.
 *
 * Usage:
 *   node scripts/update-insider-breadth.js --backfill          # every SEC quarterly data set since 2006 Q1
 *   node scripts/update-insider-breadth.js                     # nightly: EDGAR daily index after the last stored day
 *   node scripts/update-insider-breadth.js --dates=20260929    # re-read specific index days
 *   add --dry-run to any of them to print instead of write
 *
 *
 * WHAT IS COUNTED
 *
 * For each filing date: the number of DISTINCT ISSUERS with at least one
 * open-market purchase (code P) and with at least one open-market sale (code
 * S) on a Form 4, non-derivative lines only, amendments (4/A) excluded. Counting
 * issuers rather than lines means a CEO's sale sliced into thirty price bands
 * is one seller, not thirty. Dollar values are deliberately not stored: on a
 * day checked both ways (2026-09-29) the issuer counts matched exactly but the
 * summed values did not, and an unexplained number does not belong on the page.
 * Pre-planned 10b5-1 sales are NOT excluded: Form 4
 * only gained the 10b5-1 checkbox in 2023, so excluding them would put a break
 * in the series at that date.
 *
 *
 * TWO SOURCES, SAME DEFINITIONS
 *
 * History comes from the SEC's quarterly Form 3/4/5 data sets (SUBMISSION.tsv
 * and NONDERIV_TRANS.tsv, ~9MB zipped per quarter, unpacked here with the
 * `unzip` CLI, which GitHub's Ubuntu runners and Git for Windows both ship).
 * Days after the newest data set come from the EDGAR daily index, reading every
 * Form 4 itself: ~1,100 filings a day at the shared 150ms spacing, ~3 minutes.
 */

const { createClient } = require("@supabase/supabase-js");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // .env.local not present — rely on process.env already being set
  }
}

const { secFetch, quarterOf, isoDate, discoverIndexDates, IDX_ROW, parseForm4 } = require("./lib/edgar");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BACKFILL = process.argv.includes("--backfill");
const DRY_RUN = process.argv.includes("--dry-run");
const DATES_ARG = process.argv.find((a) => a.startsWith("--dates="));
const DAYS_ARG = process.argv.find((a) => a.startsWith("--days="));
// A month of catch-up: a skipped run costs ~3 minutes per missing day, not a lost day.
const LOOKBACK_DAYS = DAYS_ARG ? Number(DAYS_ARG.split("=")[1]) : 30;
const DATASET_PAGE = "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets";

/** date → { buy: Set<cik>, sell: Set<cik> } */
function tally() {
  const days = new Map();
  return {
    add(date, cik, code) {
      if (!days.has(date)) days.set(date, { buy: new Set(), sell: new Set() });
      days.get(date)[code === "P" ? "buy" : "sell"].add(cik);
    },
    rows(source) {
      return [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, d]) => ({
          filing_date: date,
          buy_issuers: d.buy.size,
          sell_issuers: d.sell.size,
          source,
        }));
    },
  };
}

// ---------------------------------------------------------------------------
// History: SEC quarterly data sets
// ---------------------------------------------------------------------------

const MONTHS = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "31-JUL-2026" → "2026-07-31". */
function secDate(text) {
  const [d, m, y] = text.split("-");
  return MONTHS[m] ? `${y}-${MONTHS[m]}-${d.padStart(2, "0")}` : null;
}

/** One TSV out of a zip, as rows keyed by header name. */
function tsv(zipPath, name) {
  const text = execFileSync("unzip", ["-p", zipPath, name], { maxBuffer: 512 * 1024 * 1024 }).toString("utf8");
  const [header, ...lines] = text.split(/\r?\n/);
  const cols = header.split("\t");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

async function backfill(t) {
  const page = await secFetch(DATASET_PAGE);
  const zips = [...new Set([...page.matchAll(/href="([^"]*_form345\.zip)"/g)].map((m) => m[1]))].sort();
  console.log(`${zips.length} quarterly data sets listed.`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "form345-"));
  let lastDate = null;
  try {
    for (const href of zips) {
      const url = `https://www.sec.gov${href}`;
      const res = await fetch(url, { headers: { "User-Agent": process.env.SEC_USER_AGENT } });
      if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
      const zipPath = path.join(dir, path.basename(href));
      fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

      const filings = new Map();
      for (const s of tsv(zipPath, "SUBMISSION.tsv")) {
        const date = secDate(s.FILING_DATE);
        if (s.DOCUMENT_TYPE === "4" && date) filings.set(s.ACCESSION_NUMBER, { date, cik: s.ISSUERCIK });
      }
      let lines = 0;
      for (const tx of tsv(zipPath, "NONDERIV_TRANS.tsv")) {
        if (tx.TRANS_CODE !== "P" && tx.TRANS_CODE !== "S") continue;
        const filing = filings.get(tx.ACCESSION_NUMBER);
        if (!filing) continue;
        t.add(filing.date, filing.cik, tx.TRANS_CODE);
        if (!lastDate || filing.date > lastDate) lastDate = filing.date;
        lines++;
      }
      fs.unlinkSync(zipPath);
      console.log(`  ${path.basename(href)}: ${filings.size} Form 4s, ${lines} open-market lines`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return lastDate;
}

// ---------------------------------------------------------------------------
// Recent days: EDGAR daily index
// ---------------------------------------------------------------------------

async function readIndexDay(compactDate, t) {
  const body = await secFetch(
    `https://www.sec.gov/Archives/edgar/daily-index/${quarterOf(compactDate)}/form.${compactDate}.idx`
  );
  if (!body) return 0;

  // Original Form 4s only, deduplicated: each filing is listed once per CIK on it.
  const urls = new Set();
  for (const line of body.split(/\r?\n/)) {
    const match = IDX_ROW.exec(line);
    if (match && match[1] === "4") urls.add(`https://www.sec.gov/Archives/${match[5]}`);
  }

  const date = isoDate(compactDate);
  let failed = 0;
  for (const url of urls) {
    try {
      const txt = await secFetch(url);
      const parsed = txt && parseForm4(txt);
      if (!parsed?.issuerCik) continue;
      for (const tx of parsed.transactions) {
        if (tx.isDerivative || (tx.transactionCode !== "P" && tx.transactionCode !== "S")) continue;
        // Same CIK format as the data sets, which pad to ten digits.
        t.add(date, parsed.issuerCik.padStart(10, "0"), tx.transactionCode);
      }
    } catch (err) {
      failed++;
      console.error(`  ${url}: ${err.message}`);
    }
  }
  // A day with many unreadable filings would be written as a quiet day. Better to fail it.
  if (failed > urls.size * 0.05) throw new Error(`${date}: ${failed} of ${urls.size} filings failed, not writing`);
  console.log(`  ${date}: ${urls.size} Form 4s read${failed ? `, ${failed} failed` : ""}`);
  return urls.size;
}

async function main() {
  if (!process.env.SEC_USER_AGENT) {
    console.error('SEC_USER_AGENT is not set. The SEC answers 403 without one, e.g. SEC_USER_AGENT="BL Investment Dashboard you@example.com"');
    process.exit(1);
  }

  const t = tally();
  let source = "edgar-daily";

  if (BACKFILL) {
    source = "sec-dataset";
    const last = await backfill(t);
    console.log(`Data sets cover filings through ${last}. Run without --backfill to fill the days after it.`);
  } else {
    let dates;
    if (DATES_ARG) {
      dates = DATES_ARG.split("=")[1].split(",");
    } else {
      const { data, error } = await supabase
        .from("insider_breadth")
        .select("filing_date")
        .order("filing_date", { ascending: false })
        .limit(1);
      if (error) throw new Error(`read failed (${error.code}): ${error.message}`);
      if (!data.length) throw new Error("insider_breadth is empty — run once with --backfill first");
      dates = await discoverIndexDates(data[0].filing_date.replace(/-/g, ""), LOOKBACK_DAYS);
    }
    if (!dates.length) {
      console.log("No unprocessed index dates. Nothing to do.");
      return;
    }
    console.log(`Reading ${dates.length} index day(s): ${dates.join(", ")}`);
    for (const d of dates) await readIndexDay(d, t);
  }

  const rows = t.rows(source);
  if (DRY_RUN) {
    console.log(`Dry run, ${rows.length} day(s). Last five:`);
    console.table(rows.slice(-5));
    return;
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("insider_breadth").upsert(rows.slice(i, i + 500), { onConflict: "filing_date" });
    if (error) throw new Error(`write failed (${error.code}): ${error.message}`);
  }
  console.log(`Wrote ${rows.length} day(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
