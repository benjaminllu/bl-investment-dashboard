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

const TICKERS = [
  { ticker: "QQQ",  list: "Index" },
  { ticker: "DRAM", list: "AI Bottlenecks" },
];

async function getCompany(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`
    );
    const data = await res.json();
    return data.name || "";
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { data: existing, error: fetchError } = await supabase
    .from("stocks")
    .select("ticker");

  if (fetchError) {
    console.error("Failed to fetch existing tickers:", fetchError.message);
    return;
  }

  const existingSet = new Set(existing.map((r) => r.ticker));

  for (const { ticker, list } of TICKERS) {
    if (existingSet.has(ticker)) {
      console.log(`${ticker}: already exists — skipping`);
      continue;
    }

    const company = await getCompany(ticker);
    console.log(`${ticker}: "${company || "(no profile)"}"`);

    const { error } = await supabase
      .from("stocks")
      .insert({ ticker, list, company });

    if (error) {
      console.error(`  ERROR: ${error.message}`);
    } else {
      console.log(`  ✓`);
    }

    await sleep(1100);
  }
  console.log("\nDone.");
}

main();
