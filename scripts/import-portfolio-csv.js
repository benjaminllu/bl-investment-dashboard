// Import a broker positions CSV into a Portfolio slot.
//
//   node scripts/import-portfolio-csv.js <file.csv> --slot=1 [options]
//
//   --slot=N         Required. Which portfolio slot (1-5) to load into.
//   --label="..."    Rename the slot. Defaults to the account name parsed out
//                    of the file's preamble, when there is one.
//   --broker=NAME    Override broker detection (currently: schwab).
//   --dry-run        Parse and print, write nothing.
//
// A broker export is not a clean CSV: Schwab's has a preamble line above the
// header, a blank line, "$1,234.56"-formatted money, a trailing comma on every
// row, a cash row, and a "Positions Total" subtotal row. Supabase's dashboard
// CSV importer cannot take that, which is why this exists rather than the
// import being done through the dashboard.
//
// Writes with the service role key from a local machine, so the deployed app
// keeps its read-only posture (see SECURITY.md).

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // rely on process.env already being set
  }
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

// Fields are quoted and money values contain commas ("$2,894.40"), so splitting
// on commas is not an option — this walks the line and respects quotes, with ""
// as an escaped quote inside a quoted field.
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

// "$2,894.40" -> 2894.4 | "-$847.20" -> -847.2 | "--" -> null | "" -> null
function parseNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/[$,%\s]/g, "").replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "--" || cleaned === "N/A") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Schwab
// ---------------------------------------------------------------------------

// Subtotal rows, which would otherwise be imported as if they were holdings.
const SKIP_SYMBOLS = new Set(["positions total", "account total", "total"]);

// Cash is stored as an ordinary row under a sentinel ticker, with `quantity`
// holding the dollar balance and `avg_cost` left null. This avoids adding
// is_cash/market_value columns for one row per portfolio, and the sentinel
// cannot collide with a real holding — a bare "CASH" would, since that is
// Pathward Financial's symbol.
const CASH_TICKER = "$CASH";

function isCashSymbol(symbol) {
  return /^cash\b/i.test(symbol) || /cash (&|and) cash investments/i.test(symbol);
}

function findHeaderIndex(lines, requiredHeader) {
  return lines.findIndex((line) => line.toLowerCase().includes(requiredHeader));
}

const SCHWAB = {
  name: "schwab",
  // Distinctive because Schwab labels the column "Qty (Quantity)" rather than
  // plain "Quantity".
  detect: (text) =>
    /"?Qty \(Quantity\)"?/i.test(text) || /^"Positions for account /im.test(text),

  parse(text) {
    const lines = text.split(/\r?\n/);

    // Account name lives in a preamble line above the header:
    //   "Positions for account Roth Contributory IRA ...803 as of ..."
    let account = null;
    const preamble = lines.find((l) => /^"?Positions for account /i.test(l));
    if (preamble) {
      const match = preamble.match(/Positions for account\s+(.*?)\s+as of/i);
      if (match) account = match[1].trim();
    }

    const headerIndex = findHeaderIndex(lines, '"symbol"');
    if (headerIndex === -1) {
      throw new Error('Could not find a header row containing "Symbol".');
    }

    const header = parseCsvLine(lines[headerIndex]).map((h) => h.toLowerCase());
    const col = (predicate) => header.findIndex(predicate);

    const idx = {
      symbol: col((h) => h === "symbol"),
      description: col((h) => h === "description"),
      // "Qty (Quantity)"
      quantity: col((h) => h.startsWith("qty")),
      // Total cost for the lot, NOT per share — see the division below.
      costBasis: col((h) => h.startsWith("cost basis")),
      // Only read for the cash row, which has no quantity or price to derive a
      // value from.
      marketValue: col((h) => h.startsWith("mkt val")),
      assetType: col((h) => h === "asset type"),
    };

    if (idx.symbol === -1 || idx.quantity === -1) {
      throw new Error(
        `Required columns missing (symbol=${idx.symbol}, quantity=${idx.quantity}). Header was: ${header.join(" | ")}`
      );
    }

    const positions = [];
    const skipped = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const fields = parseCsvLine(line);
      const symbol = (fields[idx.symbol] ?? "").trim();
      if (!symbol) continue;

      if (SKIP_SYMBOLS.has(symbol.toLowerCase())) {
        skipped.push({ symbol, reason: "subtotal row" });
        continue;
      }

      // Cash carries a market value but no quantity, price or cost basis, so it
      // is mapped by value rather than going through the per-share maths below.
      if (isCashSymbol(symbol)) {
        const balance = idx.marketValue === -1 ? null : parseNumber(fields[idx.marketValue]);
        if (balance === null) {
          skipped.push({ symbol, reason: "cash row had no market value" });
          continue;
        }
        positions.push({
          ticker: CASH_TICKER,
          company: symbol,
          quantity: balance,
          avg_cost: null,
          currency: "USD",
          account,
          assetType: idx.assetType === -1 ? null : fields[idx.assetType] || null,
        });
        continue;
      }

      const quantity = parseNumber(fields[idx.quantity]);
      if (quantity === null) {
        skipped.push({ symbol, reason: "no quantity" });
        continue;
      }

      // Schwab reports Cost Basis as the TOTAL for the position. The page
      // multiplies avg_cost by quantity, so importing the total unchanged
      // would overstate cost basis by a factor of `quantity` and invent a
      // enormous fake loss. Verified against this file: AVAV's 3,741.60 over
      // 20 shares is 187.08 each, and 20 x 144.72 - 3,741.60 matches the
      // -847.20 Schwab itself reports in its Gain $ column.
      const totalCost = idx.costBasis === -1 ? null : parseNumber(fields[idx.costBasis]);
      const avgCost = totalCost !== null && quantity !== 0 ? totalCost / quantity : null;

      positions.push({
        ticker: symbol.toUpperCase(),
        company: idx.description === -1 ? null : fields[idx.description] || null,
        quantity,
        avg_cost: avgCost,
        currency: "USD",
        account,
        assetType: idx.assetType === -1 ? null : fields[idx.assetType] || null,
      });
    }

    return { positions, skipped, account };
  },
};

const PARSERS = [SCHWAB];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, slot: null, label: null, broker: null, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--slot=")) args.slot = Number(arg.slice(7));
    else if (arg.startsWith("--label=")) args.label = arg.slice(8);
    else if (arg.startsWith("--broker=")) args.broker = arg.slice(9).toLowerCase();
    else if (!arg.startsWith("--")) args.file = arg;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error("Usage: node scripts/import-portfolio-csv.js <file.csv> --slot=1 [--label=\"...\"] [--dry-run]");
    process.exit(1);
  }
  if (!Number.isInteger(args.slot) || args.slot < 1 || args.slot > 5) {
    console.error(`--slot must be an integer 1-5 (got ${args.slot ?? "nothing"}).`);
    process.exit(1);
  }

  const text = fs.readFileSync(args.file, "utf8");

  const parser = args.broker
    ? PARSERS.find((p) => p.name === args.broker)
    : PARSERS.find((p) => p.detect(text));

  if (!parser) {
    console.error(
      `Could not identify the broker format for ${path.basename(args.file)}.` +
        ` Known formats: ${PARSERS.map((p) => p.name).join(", ")}.` +
        ` Force one with --broker=NAME.`
    );
    process.exit(1);
  }

  const { positions, skipped, account } = parser.parse(text);

  console.log(`Format:  ${parser.name}`);
  if (account) console.log(`Account: ${account}`);
  console.log(`Slot:    ${args.slot}`);
  console.log(`Parsed:  ${positions.length} positions, ${skipped.length} rows skipped\n`);

  for (const p of positions) {
    if (p.ticker === CASH_TICKER) {
      console.log(`  ${p.ticker.padEnd(8)} balance=$${p.quantity.toFixed(2).padEnd(13)} ${p.company ?? ""}`);
      continue;
    }
    const cost = p.avg_cost === null ? "—" : `$${p.avg_cost.toFixed(2)}`;
    console.log(
      `  ${p.ticker.padEnd(8)} qty=${String(p.quantity).padEnd(10)} avg cost=${cost.padEnd(12)} ${p.company ?? ""}`
    );
  }
  for (const s of skipped) console.log(`  (skipped) ${s.symbol} — ${s.reason}`);

  if (positions.length === 0) {
    console.error("\nNothing to import — no position rows were parsed.");
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const label = args.label ?? account ?? null;
  if (label) {
    const { error } = await supabase
      .from("portfolios")
      .update({ label, broker: parser.name, updated_at: new Date().toISOString() })
      .eq("slot", args.slot);
    if (error) {
      console.error(`\nFailed to update slot label: ${error.message}`);
      process.exit(1);
    }
  }

  // Replace the slot rather than append: this table is "what is held right
  // now", so a position since sold has to disappear rather than linger.
  const { error: deleteError } = await supabase
    .from("portfolio_positions")
    .delete()
    .eq("slot", args.slot);
  if (deleteError) {
    console.error(`\nFailed to clear slot ${args.slot}: ${deleteError.message}`);
    process.exit(1);
  }

  const { error: insertError } = await supabase.from("portfolio_positions").insert(
    positions.map((p) => ({
      slot: args.slot,
      ticker: p.ticker,
      company: p.company,
      quantity: p.quantity,
      avg_cost: p.avg_cost,
      currency: p.currency,
      account: p.account,
      imported_at: new Date().toISOString(),
    }))
  );
  if (insertError) {
    console.error(`\nWrite failed: ${insertError.message}`);
    process.exit(1);
  }

  console.log(`\nWrote ${positions.length} positions into slot ${args.slot}${label ? ` ("${label}")` : ""}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
