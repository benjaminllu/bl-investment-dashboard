const { createClient } = require("@supabase/supabase-js");
const { isLowQuality } = require("./newsFilter");

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
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Same model the /ai-summary page already uses, deliberately: it is the version
// this project's key and quota are known to work against. The newer 3.x flash
// models on this account were answering 503 UNAVAILABLE when this was written,
// which is not a thing to discover at 9am on an unattended cron.
const MODEL = "gemini-2.5-flash";
const TZ = "America/New_York";
const ITEM_COUNT = 10;

// Below this there is not enough of a wire to rank, and the honest outcome is
// no digest rather than a thin one. Finnhub has been seen answering a rapid
// second call with an empty array, which would otherwise sail straight through.
const MIN_CANDIDATES = 15;
// A run that yields fewer than this many valid picks is treated as a failure,
// leaving whatever digest already exists in place.
const MIN_ITEMS = 5;
const MAX_CANDIDATES = 60;
// Benzinga and similar wires carry "flash" items whose headline is the entire
// story — real ones seen at 488 characters. They are ~2% of the pool, they read
// as shouting, and one of them in a grid cell is an unreadable wall of clipped
// text. The 99th percentile of a normal headline is ~110 characters, so this
// cuts only the flashes.
const MAX_HEADLINE_LENGTH = 200;
const RETENTION_DAYS = 90;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");

/**
 * Aborts the run.
 *
 * Throws rather than calling process.exit(): the Supabase client still holds an
 * open socket at this point, and exiting out from under it trips a libuv
 * assertion on Windows that replaces exit code 1 with 127 — which would read as
 * "command not found" in a CI log rather than "this job failed". Setting
 * process.exitCode from the top-level catch instead lets node close its handles
 * and exit on its own.
 */
function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Today's date in US Eastern terms. en-CA formats as YYYY-MM-DD. */
function easternToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Current hour in US Eastern, 0-23.
 *
 * Read via formatToParts rather than `hour12: false`, which some ICU builds
 * render as "24" at midnight — a value that would quietly pass an `>= 9` test.
 */
function easternHour() {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "hour");
  return Number(part.value);
}

/**
 * Google News RSS titles arrive as "Real headline - Reuters", so the source ends
 * up printed twice once the panel renders its own attribution line. Stripped
 * only when the tail matches the article's own source exactly, so a headline
 * like "Nvidia - Intel deal clears" keeps its dash.
 */
function cleanHeadline(headline, source) {
  let out = headline.trim();
  const suffix = ` - ${source}`;
  if (source && out.toLowerCase().endsWith(suffix.toLowerCase())) {
    out = out.slice(0, -suffix.length).trim();
  }
  // Some wires quote the whole headline. Only unwrapped when both ends match,
  // so a headline that merely opens with a quotation keeps it.
  if (out.length > 2 && /^['"]/.test(out) && out.at(-1) === out[0]) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

/** For dedupe only — two wires carrying one story rarely match byte for byte. */
function normaliseForDedupe(headline) {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGeneralNews() {
  const res = await fetch(
    `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`
  );
  if (!res.ok) throw new Error(`Finnhub general news failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Finnhub general news was not an array");
  return data.map((a) => ({
    headline: cleanHeadline(a.headline || "", a.source || ""),
    url: a.url,
    source: a.source || "Unknown",
    datetime: a.datetime,
    image: a.image || null,
  }));
}

/**
 * The watchlist's own news, already collected by refresh-data.js. Included as
 * candidates so the digest can rank a story about something Ben actually tracks
 * against the broad wire, instead of the two feeds never meeting.
 */
async function fetchWatchlistCandidates() {
  const { data, error } = await supabase
    .from("stock_news")
    .select("ticker, headline, url, source, image, datetime")
    .order("datetime", { ascending: false })
    .limit(120);
  if (error) {
    // Not fatal — the general wire alone is still a digest.
    console.error(`  watchlist news unavailable (${error.code}): ${error.message}`);
    return [];
  }
  return (data ?? []).map((a) => ({
    headline: cleanHeadline(a.headline || "", a.source || ""),
    url: a.url,
    source: a.source || "Unknown",
    datetime: a.datetime,
    image: a.image || null,
  }));
}

function buildCandidates(pools, windowHours) {
  const cutoff = Math.floor(Date.now() / 1000) - windowHours * 3600;
  const seenUrl = new Set();
  const seenHeadline = new Set();
  const out = [];

  for (const article of pools.flat().sort((a, b) => b.datetime - a.datetime)) {
    if (!article.headline || !article.url) continue;
    if (article.headline.length > MAX_HEADLINE_LENGTH) continue;
    if (!article.datetime || article.datetime < cutoff) continue;
    if (isLowQuality(article)) continue;
    const key = normaliseForDedupe(article.headline);
    if (seenUrl.has(article.url) || seenHeadline.has(key)) continue;
    seenUrl.add(article.url);
    seenHeadline.add(key);
    out.push(article);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "Macro",
              "Rates",
              "Earnings",
              "Company",
              "Policy",
              "Geopolitics",
              "Energy",
              "Credit",
              "Crypto",
              "Tech",
            ],
          },
          why_it_matters: { type: "string" },
          tickers: { type: "array", items: { type: "string" } },
        },
        required: ["id", "category", "why_it_matters", "tickers"],
        propertyOrdering: ["id", "category", "why_it_matters", "tickers"],
      },
    },
  },
  required: ["items"],
};

function buildPrompt(candidates) {
  const list = candidates.map((a, i) => `${i}\t[${a.source}] ${a.headline}`).join("\n");

  return `You are the morning market desk for one private investor who holds global equities and follows macro. Below is the newswire, one story per line, prefixed by its id.

Pick the ${ITEM_COUNT} most important stories and rank them, most important first.

Judge importance by how much a story moves prices, rates, or the outlook for the broad market. Rank UP: central bank decisions and inflation or jobs data, moves in rates and credit, large-cap earnings and guidance, sector-wide shocks, energy and commodity supply, regulation with real teeth. Rank DOWN, or leave out entirely: photo essays, human interest, sport, crime, local politics with no market channel, opinion columns, product reviews, and anything that is really an advertisement.

If several lines describe the same event, pick the single best one and do not use the others.

For each pick:

"why_it_matters" — one sentence, at most 20 words, naming the concrete market consequence. Write only what the headline itself supports; never invent a number, a date, or an outcome. Do not write filler such as "investors will be watching", "signals continued growth", "provides insight into", or "could impact sentiment" — if the only thing you can say about a story is filler, it does not belong in the ten.

"tickers" — US-listed symbols the story is directly about, or an empty array. Never guess a symbol for a company you are unsure of.

"id" — the id of the line you are picking, copied exactly.

Return exactly ${ITEM_COUNT} items.

NEWSWIRE:
${list}`;
}

async function callGemini(prompt) {
  // 503 UNAVAILABLE on this endpoint is common and transient. An unattended 9am
  // job gets three tries before it gives up for the day.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              // 2.5-flash bills its reasoning against this budget, and runs
              // over a 60-story wire have been measured at ~6.1k thought tokens
              // before ~400 of answer. Sized well clear of that: the failure
              // mode of a tight budget is MAX_TOKENS mid-JSON, which loses the
              // whole digest rather than truncating it gracefully.
              maxOutputTokens: 16000,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Gemini ${res.status}: ${data?.error?.message ?? "unknown error"}`);
      }

      const finish = data?.candidates?.[0]?.finishReason;
      if (finish && finish !== "STOP") {
        throw new Error(`Gemini stopped early (${finish})`);
      }

      const text = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      if (!text) throw new Error("Gemini returned no text");

      console.log(
        `  model: ${MODEL}, tokens in/out/thinking: ${data.usageMetadata?.promptTokenCount}/` +
          `${data.usageMetadata?.candidatesTokenCount}/${data.usageMetadata?.thoughtsTokenCount ?? 0}`
      );
      return JSON.parse(text);
    } catch (e) {
      lastError = e;
      console.error(`  gemini attempt ${attempt} failed: ${e.message}`);
      if (attempt < 3) await sleep(attempt * 5000);
    }
  }
  throw lastError;
}

/**
 * Turns the model's answer into rows.
 *
 * Everything factual — headline, url, source, timestamp — is taken from the
 * candidate the id points at, never from the model, so a hallucinated story has
 * no route into the table. The model contributes the ordering, the category and
 * its one sentence. Tickers are intersected with the real watchlist for the same
 * reason.
 */
function validate(response, candidates, watchlist, digestDate) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const usedIds = new Set();
  const rows = [];

  for (const item of items) {
    if (rows.length >= ITEM_COUNT) break;

    const id = Number(item?.id);
    if (!Number.isInteger(id) || id < 0 || id >= candidates.length) {
      console.error(`  dropped pick with out-of-range id: ${JSON.stringify(item?.id)}`);
      continue;
    }
    if (usedIds.has(id)) {
      console.error(`  dropped duplicate pick of id ${id}`);
      continue;
    }

    const why = typeof item?.why_it_matters === "string" ? item.why_it_matters.trim() : "";
    if (!why) {
      console.error(`  dropped pick ${id} with empty why_it_matters`);
      continue;
    }

    usedIds.add(id);
    const article = candidates[id];
    const tickers = (Array.isArray(item?.tickers) ? item.tickers : [])
      .map((t) => String(t).toUpperCase().trim())
      .filter((t) => watchlist.has(t));

    rows.push({
      digest_date: digestDate,
      rank: rows.length + 1,
      headline: article.headline,
      url: article.url,
      source: article.source,
      category: typeof item?.category === "string" ? item.category : "Macro",
      why_it_matters: why,
      tickers: [...new Set(tickers)],
      article_datetime: article.datetime,
      image: article.image,
      model: MODEL,
    });
  }

  return rows;
}

async function main() {
  if (!FINNHUB_KEY) fail("FINNHUB_API_KEY is not set");
  if (!GEMINI_KEY) fail("GEMINI_API_KEY is not set");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) fail("SUPABASE_SERVICE_ROLE_KEY is not set");

  const digestDate = easternToday();
  const hour = easternHour();

  // Two guards, because GitHub cron is UTC-only and US Eastern is not. The
  // workflow fires at both 13:00 and 14:00 UTC; exactly one of those is 9am ET
  // depending on daylight saving, and these two checks decide which run does the
  // work — too early is skipped, and a day that already has a digest is skipped.
  // Between them the job lands at 9am ET year round, and a run that GitHub
  // throttles by half an hour still counts.
  if (!FORCE && hour < 9) {
    console.log(`Skipping: ${hour}:00 ET is before the 9:00 ET cutoff for ${digestDate}.`);
    return;
  }

  if (!FORCE) {
    const { data: existing, error } = await supabase
      .from("market_digest")
      .select("rank")
      .eq("digest_date", digestDate)
      .limit(1);
    if (error) fail(`Could not check for an existing digest (${error.code}): ${error.message}`);
    if (existing && existing.length > 0) {
      console.log(`Skipping: ${digestDate} already has a digest. Use --force to rewrite it.`);
      return;
    }
  }

  console.log(`Generating market digest for ${digestDate} (${hour}:00 ET)...`);

  const [general, watchlistNews, { data: stocks, error: stocksError }] = await Promise.all([
    fetchGeneralNews().catch((e) => fail(e.message)),
    fetchWatchlistCandidates(),
    supabase.from("stocks").select("ticker"),
  ]);

  if (stocksError) {
    console.error(
      `  watchlist symbols unavailable (${stocksError.code}) — ticker chips will be empty`
    );
  }
  const watchlist = new Set((stocks ?? []).map((s) => s.ticker.toUpperCase()));

  // 24 hours is the window the digest describes. Widened once rather than
  // failing outright, because a quiet wire on a holiday Monday is not an error.
  let candidates = buildCandidates([general, watchlistNews], 24);
  if (candidates.length < MIN_CANDIDATES) {
    console.log(`  only ${candidates.length} stories in 24h — widening to 48h`);
    candidates = buildCandidates([general, watchlistNews], 48);
  }

  console.log(
    `  ${general.length} general + ${watchlistNews.length} watchlist articles ` +
      `-> ${candidates.length} candidates after filtering`
  );
  if (candidates.length < MIN_CANDIDATES) {
    fail(
      `only ${candidates.length} usable candidates (need ${MIN_CANDIDATES}) — ` +
        `leaving the existing digest alone`
    );
  }

  const response = await callGemini(buildPrompt(candidates)).catch((e) => fail(e.message));
  const rows = validate(response, candidates, watchlist, digestDate);

  console.log(`  ${rows.length} valid picks`);
  if (rows.length < MIN_ITEMS) {
    fail(`only ${rows.length} valid picks (need ${MIN_ITEMS}) — leaving the existing digest alone`);
  }

  for (const row of rows) {
    console.log(
      `\n  ${String(row.rank).padStart(2, "0")} [${row.category}] ${row.headline}` +
        `\n     ${row.why_it_matters}` +
        `\n     ${row.source}${row.tickers.length ? ` · ${row.tickers.join(" ")}` : ""}`
    );
  }

  if (DRY_RUN) {
    console.log("\nDry run — nothing written.");
    return;
  }

  // Deleted only now, once there is a full replacement in hand, so a failure
  // anywhere above leaves yesterday's digest on the page rather than an empty
  // panel.
  const { error: deleteError } = await supabase
    .from("market_digest")
    .delete()
    .eq("digest_date", digestDate);
  if (deleteError) fail(`Delete failed (${deleteError.code}): ${deleteError.message}`);

  const { error: insertError } = await supabase.from("market_digest").insert(rows);
  if (insertError) fail(`Insert failed (${insertError.code}): ${insertError.message}`);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .split("T")[0];
  const { error: pruneError } = await supabase
    .from("market_digest")
    .delete()
    .lt("digest_date", cutoff);
  if (pruneError) console.error(`  prune failed (${pruneError.code}): ${pruneError.message}`);

  console.log(`\n✓ Wrote ${rows.length} stories for ${digestDate}.`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
