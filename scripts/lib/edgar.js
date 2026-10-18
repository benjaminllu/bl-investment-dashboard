/**
 * EDGAR access and Form 4 parsing, shared by the two insider jobs:
 * scripts/screen-insider-transactions.js (watchlist tickers, every
 * transaction) and scripts/update-insider-breadth.js (every issuer, counts only).
 *
 * Moved here verbatim from the first of those when the second was added, so the
 * rate limiting, retry and parsing rules cannot drift between them.
 */

// ---------------------------------------------------------------------------
// SEC access
// ---------------------------------------------------------------------------
//
// The SEC's only access requirement is a descriptive User-Agent naming you and a
// contact address; a request without one is answered 403, not throttled, so this
// is a hard dependency rather than politeness. It is required config rather than
// a committed constant so the contact address is not published in the repo.
//
// The published limit is 10 requests/second per IP across all EDGAR domains,
// with no daily cap. Exceeding it blocks the IP until the rate stays under the
// threshold for a full 10 minutes -- which for a nightly job means a block would
// outlast the run and silently lose a day. 150ms between requests is ~1.5x under
// budget and still finishes a typical night in well under a minute.
const SEC_REQUEST_SPACING_MS = 150;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastRequestAt = 0;

async function secFetch(url, { retries = 3 } = {}) {
  const wait = SEC_REQUEST_SPACING_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT,
      // Turns the 2.1 MB daily index into 242 KB. Node's fetch transparently
      // decompresses, so callers still see plain text.
      "Accept-Encoding": "gzip, deflate",
    },
  });

  if (res.status === 404) return null;

  // 429/503 are the SEC's throttle responses. Backing off and retrying is worth
  // it here; failing the whole night over one slow response is not.
  if ((res.status === 429 || res.status === 503) && retries > 0) {
    const backoff = (4 - retries) * 2000;
    console.warn(`  ${res.status} from SEC, backing off ${backoff}ms...`);
    await sleep(backoff);
    return secFetch(url, { retries: retries - 1 });
  }

  if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Which days to process
// ---------------------------------------------------------------------------

function quarterOf(compactDate) {
  const year = compactDate.slice(0, 4);
  const month = Number(compactDate.slice(4, 6));
  return `${year}/QTR${Math.floor((month - 1) / 3) + 1}`;
}

function compact(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Asks EDGAR which days actually have an index rather than generating dates and
 * guessing at weekends and market holidays. The listing contains only real
 * filing days, so "every date newer than the newest one already stored" is
 * exactly the set of days still owed.
 *
 * This is what makes the job idempotent under GitHub Actions cron drift. The
 * market digest handles drift by skipping a day that already has rows; here,
 * filling whatever gap it finds is strictly better, because a run GitHub skips
 * entirely gets caught up the following night instead of losing the day for good.
 */
async function discoverIndexDates(sinceDate, lookbackDays) {
  const today = new Date();
  const quarters = new Set();
  for (let i = 0; i <= lookbackDays + 5; i++) {
    quarters.add(quarterOf(compact(new Date(today.getTime() - i * 86400000))));
  }

  const dates = [];
  for (const quarter of quarters) {
    const body = await secFetch(
      `https://www.sec.gov/Archives/edgar/daily-index/${quarter}/index.json`
    );
    if (!body) continue;
    for (const item of JSON.parse(body).directory.item) {
      const match = item.name.match(/^form\.(\d{8})\.idx$/);
      if (match) dates.push(match[1]);
    }
  }

  const cutoff = compact(new Date(today.getTime() - lookbackDays * 86400000));

  return [...new Set(dates)]
    .filter((d) => d > (sinceDate ?? "0") && d >= cutoff)
    .sort()
    .slice(-lookbackDays);
}

// ---------------------------------------------------------------------------
// Daily index rows
// ---------------------------------------------------------------------------

// Anchored on the END of the line rather than parsed as fixed-width columns: the
// company name is the only ragged field, and CIK / date / path are all strictly
// formed, so matching backwards from them cannot be thrown off by a company
// whose name happens to contain a run of spaces.
const IDX_ROW = /^(4(?:\/A)?)\s+(.*?)\s{2,}(\d+)\s+(\d{8})\s+(edgar\/\S+)\s*$/;

function isoDate(compactDate) {
  return `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
}

// ---------------------------------------------------------------------------
// Form 4 parsing
// ---------------------------------------------------------------------------
//
// Hand-rolled rather than pulling in an XML library. The ownership schema
// (currently X0609) is narrow, flat, and machine-generated by filing agents
// against a fixed SEC template, and only about a dozen of its fields are wanted
// here. Everything schema-shaped is confined to the four helpers below plus
// parseForm4, so if that ever stops being true, swapping in a real parser is a
// change to one function rather than to the pipeline.

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Last, so an escaped ampersand cannot be re-expanded by the rules above.
    .replace(/&amp;/g, "&");
}

function blocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}

/**
 * Innermost text of <tag>, transparently unwrapping the <value> element that the
 * ownership schema wraps most fields in. Returns null for a missing OR empty tag,
 * because filing agents routinely emit both for "not applicable".
 */
function tagText(xml, tag) {
  const block = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
  if (block == null) return null;
  const inner = block.match(/<value>([\s\S]*?)<\/value>/)?.[1] ?? block;
  const text = decodeEntities(inner.replace(/<[^>]*>/g, "").trim());
  return text === "" ? null : text;
}

function tagNumber(xml, tag) {
  const text = tagText(xml, tag);
  if (text == null) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

// The schema uses "true"/"false" in current filings but "1"/"0" appears in older
// ones, and both mean the same thing.
function tagBool(xml, tag) {
  const text = tagText(xml, tag);
  if (text == null) return null;
  return text === "true" || text === "1";
}

function parseForm4(txt) {
  // The .txt is an SGML envelope wrapping the real document; the ownership XML
  // sits inside an <XML> block. A Form 4 .txt is only ~5 KB, so pulling the whole
  // envelope costs one request and no meaningful bandwidth — going via the
  // filing's index.json to learn the document filename first would cost two.
  const xml = blocks(txt, "XML").find((b) => b.includes("<ownershipDocument"));
  if (!xml) return null;

  const owners = blocks(xml, "reportingOwner").map((block) => ({
    cik: tagText(block, "rptOwnerCik"),
    name: tagText(block, "rptOwnerName"),
    isDirector: tagBool(block, "isDirector"),
    isOfficer: tagBool(block, "isOfficer"),
    isTenPercentOwner: tagBool(block, "isTenPercentOwner"),
    officerTitle: tagText(block, "officerTitle"),
  }));

  const readTransactions = (tag, isDerivative) =>
    blocks(xml, tag).map((block) => ({
      isDerivative,
      securityTitle: tagText(block, "securityTitle"),
      // Per LINE, not the document's periodOfReport: one filing can cover several
      // trade dates, and the header date only names one of them.
      transactionDate: tagText(block, "transactionDate"),
      transactionCode: tagText(block, "transactionCode"),
      acquiredDisposed: tagText(block, "transactionAcquiredDisposedCode"),
      shares: tagNumber(block, "transactionShares"),
      pricePerShare: tagNumber(block, "transactionPricePerShare"),
      sharesOwnedAfter: tagNumber(block, "sharesOwnedFollowingTransaction"),
      ownershipType: tagText(block, "directOrIndirectOwnership"),
    }));

  return {
    // From the document rather than the index: the index lists a filing under
    // the issuer AND every reporting owner, with nothing marking which is which.
    issuerCik: tagText(xml, "issuerCik"),
    periodOfReport: tagText(xml, "periodOfReport"),
    // The filing's own view of Rule 10b5-1, so the footnote prose never has to be
    // read to know whether a sale was pre-scheduled.
    is10b51: tagBool(xml, "aff10b5One"),
    owners,
    transactions: [
      ...readTransactions("nonDerivativeTransaction", false),
      ...readTransactions("derivativeTransaction", true),
    ],
  };
}

module.exports = {
  secFetch,
  sleep,
  quarterOf,
  compact,
  isoDate,
  discoverIndexDates,
  IDX_ROW,
  parseForm4,
};
