const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const FINNHUB_KEY = env.FINNHUB_API_KEY;

const BLOCKED_DOMAINS = new Set([
  "wsj.com", "barrons.com", "ft.com", "seekingalpha.com",
  "thestreet.com", "investors.com", "fool.com", "marketbeat.com",
]);

const CLICKBAIT_PATTERNS = [
  /\b\d+\s+(stocks?|etfs?|funds?)\s+(to\s+)?(buy|sell|watch|own|avoid|consider)/i,
  /\bbest\s+(stocks?|etfs?)\s+to\b/i,
  /\btop\s+(stocks?|etfs?)\s+(to|for)\b/i,
  /\bthese\s+\d+\s+stocks?\b/i,
  /\b\d+\s+(dividend|growth|value|tech)\s+stocks?\b/i,
  /\bshould\s+you\s+(buy|sell|invest|own|hold)/i,
  /\b(buy|sell|invest)\s+in\s+these\s+stocks?\b/i,
  /\bstock\s+picks?\b/i,
  /\bmust[\s-]?(buy|own|have|watch)\b/i,
  /\bdon'?t\s+miss\s+these\b/i,
  /\bhere'?s\s+why\s+you\s+should\b/i,
  /\bstocks?\s+that\s+(could|will|may)\s+make\s+you\s+rich\b/i,
  /\bvs\.?\s+\w/i,
  /\bwhich\s+is\s+(a\s+)?(better|the\s+best)\s+(buy|investment|stock|pick)\b/i,
  /\bbetter\s+stock\s+to\s+buy\b/i,
  /\bcould\s+(reach|hit|surge\s+to|climb\s+to)\s+\$/i,
  /\b(could|will|may)\s+(double|triple|soar|skyrocket)\b/i,
  /\b\d+%\s+upside\b/i,
  /\bprice\s+target\s+of\s+\$/i,
  /\bis\s+it\s+too\s+late\s+to\s+buy\b/i,
  /\btime\s+to\s+(buy|sell)\b/i,
  /\bis\s+\w+\s+a\s+buy\s+right\s+now\b/i,
  /\b(no[\s-]brainer|screaming)\s+buy\b/i,
  /\bi'?m\s+(buying|selling)\b/i,
  /\bmy\s+(top\s+pick|favorite\s+stock)\b/i,
  /\bwarren\s+buffett\s+(would|stocks?|buys?)\b/i,
];

function isLowQuality(article) {
  try {
    const hostname = new URL(article.url).hostname.replace(/^www\./, "");
    if (BLOCKED_DOMAINS.has(hostname)) return true;
  } catch {
    // malformed URL — let through
  }
  return CLICKBAIT_PATTERNS.some((re) => re.test(article.headline));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { data: stocks, error } = await supabase
    .from("stocks")
    .select("ticker")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch tickers:", error.message);
    process.exit(1);
  }

  const today = new Date();
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const to = today.toISOString().split("T")[0];

  console.log(`Refreshing ${stocks.length} tickers...\n`);

  for (const { ticker } of stocks) {
    // --- Quote ---
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`
      );
      const data = await res.json();
      if (data.c) {
        const { error: qErr } = await supabase.from("stock_quotes").upsert(
          { ticker, price: data.c, change_pct: data.dp, updated_at: new Date().toISOString() },
          { onConflict: "ticker" }
        );
        if (qErr) console.error(`  quote write error: ${qErr.message}`);
      }
    } catch (e) {
      console.error(`  quote fetch error for ${ticker}:`, e.message);
    }

    await sleep(1100);

    // --- News ---
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
      );
      const articles = await res.json();
      const filtered = articles.filter((a) => !isLowQuality(a)).slice(0, 3);

      await supabase.from("stock_news").delete().eq("ticker", ticker);

      if (filtered.length > 0) {
        const { error: nErr } = await supabase.from("stock_news").insert(
          filtered.map((a) => ({
            ticker,
            headline: a.headline,
            url: a.url,
            source: a.source,
            image: a.image || null,
            datetime: a.datetime,
          }))
        );
        if (nErr) console.error(`  news write error: ${nErr.message}`);
      }
    } catch (e) {
      console.error(`  news fetch error for ${ticker}:`, e.message);
    }

    await sleep(1100);
    console.log(`✓ ${ticker}`);
  }

  console.log("\nDone.");
}

main();
