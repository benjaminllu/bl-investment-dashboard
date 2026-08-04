// Import a broker positions CSV into a Portfolio slot.
//
//   node scripts/import-portfolio-csv.js <file.csv> [--slot=1] [options]
//
//   --slot=N         Which portfolio slot (1-5) to load into. Optional when the
//                    file's account is already loaded in exactly one slot —
//                    that slot is then reused, so re-importing a statement
//                    overrides it in place without having to remember where it
//                    lives.
//   --label="..."    Rename the slot. Defaults to the account name parsed out
//                    of the file's preamble, when there is one.
//   --broker=NAME    Override broker detection (currently: schwab).
//   --dry-run        Parse and print, write nothing.
//   --force          Allow loading an account into a slot when it is already
//                    loaded in a different one. Off by default, because that
//                    double-counts it in the combined total.
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
  // Vanguard writes " - " for an inapplicable gain/loss cell, which collapses to
  // a bare "-" once whitespace is stripped. Number("-") is NaN, but relying on
  // that would also swallow genuine malformed input silently.
  if (cleaned === "" || cleaned === "--" || cleaned === "-" || cleaned === "N/A") return null;
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

// ---------------------------------------------------------------------------
// Vanguard
// ---------------------------------------------------------------------------

/**
 * Vanguard writes class shares with a space where Finnhub expects a dot:
 * "BRK B" rather than "BRK.B". Left alone this is worse than a missing price —
 * the whitespace makes refresh-data.js classify it as an option symbol and skip
 * it entirely, so the position would silently never be priced.
 */
function normalizeVanguardSymbol(symbol) {
  const trimmed = symbol.trim().toUpperCase();
  return /^[A-Z]+ [A-Z]$/.test(trimmed) ? trimmed.replace(" ", ".") : trimmed;
}

/**
 * A settlement money-market fund is cash, not an exposure. Vanguard lists it as
 * an ordinary holding (VMFXX, 110,748.8 "shares" at a fixed $1 NAV), but
 * carrying it as a position would be wrong twice over: it implies market risk
 * that does not exist, and no quote provider prices it, so the balance would
 * drop out of the portfolio's Value altogether.
 *
 * Matched on the fund name rather than a ticker list so it survives VMFXX ->
 * VMRXX and the equivalent at another broker.
 */
function isMoneyMarket(name) {
  return /money market/i.test(name ?? "");
}

const VANGUARD = {
  name: "vanguard",
  // "Symbol/CUSIP" alongside "Cost basis method" is unique to the cost-basis
  // download. Schwab has neither.
  detect: (text) => /symbol\/cusip/i.test(text) && /cost basis method/i.test(text),

  /**
   * One row per TAX LOT, not per position: AAOI appears three times, VOO
   * fifteen, VFIAX eighteen. Lots must be aggregated before writing, or the
   * (slot, ticker) primary key collides and the insert fails outright.
   *
   * Aggregation is by summed dollars, never by averaging the per-lot "Cost per
   * share" column — that would weight a 0.5-share dividend reinvestment equally
   * with a 200-share purchase. Summing total cost and dividing by total shares
   * gives the true weighted average, and reproduces Vanguard's own gain/loss
   * figures exactly (checked below in the importer's own output).
   */
  parse(text) {
    const lines = text.split(/\r?\n/);

    const headerIndex = findHeaderIndex(lines, "symbol/cusip");
    if (headerIndex === -1) {
      throw new Error('Could not find a header row containing "Symbol/CUSIP".');
    }

    const header = parseCsvLine(lines[headerIndex]).map((h) => h.toLowerCase().trim());
    const col = (predicate) => header.findIndex(predicate);

    const idx = {
      accountNumber: col((h) => h === "account" || h.includes("account number")),
      symbol: col((h) => h.startsWith("symbol")),
      description: col((h) => h === "description" || h.includes("investment name")),
      quantity: col((h) => h === "quantity" || h === "shares"),
      totalCost: col((h) => h === "total cost" || h === "cost basis"),
      costPerShare: col((h) => h.includes("cost per share")),
      // Header carries the as-of timestamp: "Market value as of 08/03/2026 ...".
      marketValue: col((h) => h.startsWith("market value")),
    };

    if (idx.symbol === -1 || idx.quantity === -1) {
      throw new Error(
        `Required columns missing (symbol=${idx.symbol}, quantity=${idx.quantity}). Header was: ${header.join(" | ")}`
      );
    }

    let account = null;
    const bySymbol = new Map();
    const skipped = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const fields = parseCsvLine(line);
      const rawSymbol = (fields[idx.symbol] ?? "").trim();
      if (!rawSymbol) continue;

      if (SKIP_SYMBOLS.has(rawSymbol.toLowerCase())) {
        skipped.push({ symbol: rawSymbol, reason: "subtotal row" });
        continue;
      }

      if (account === null && idx.accountNumber !== -1) {
        const acct = (fields[idx.accountNumber] ?? "").trim();
        if (acct) account = `Vanguard ${acct}`;
      }

      const quantity = parseNumber(fields[idx.quantity]);
      if (quantity === null) {
        skipped.push({ symbol: rawSymbol, reason: "no quantity" });
        continue;
      }
      // Closed lots are history, not holdings.
      if (quantity === 0) {
        skipped.push({ symbol: rawSymbol, reason: "zero shares (closed lot)" });
        continue;
      }

      const description =
        idx.description === -1 ? null : (fields[idx.description] ?? "").trim() || null;

      if (isMoneyMarket(description)) {
        skipped.push({ symbol: rawSymbol, reason: "money market — import as cash via --cash" });
        continue;
      }

      const ticker = normalizeVanguardSymbol(rawSymbol);
      const totalCost = idx.totalCost === -1 ? null : parseNumber(fields[idx.totalCost]);
      const perShare = idx.costPerShare === -1 ? null : parseNumber(fields[idx.costPerShare]);
      const marketValue = idx.marketValue === -1 ? null : parseNumber(fields[idx.marketValue]);

      // Fall back to reconstructing the lot's cost from its per-share figure
      // when the total is absent, rather than dropping the lot's cost entirely
      // and silently understating the position's basis.
      const lotCost = totalCost ?? (perShare !== null ? perShare * quantity : null);

      const existing = bySymbol.get(ticker);
      if (existing) {
        existing.quantity += quantity;
        existing.totalCost = existing.totalCost === null || lotCost === null ? null : existing.totalCost + lotCost;
        existing.marketValue =
          existing.marketValue === null || marketValue === null
            ? null
            : existing.marketValue + marketValue;
        existing.lots++;
      } else {
        bySymbol.set(ticker, {
          ticker,
          company: description,
          quantity,
          totalCost: lotCost,
          marketValue,
          lots: 1,
          account,
        });
      }
    }

    const positions = [...bySymbol.values()].map((p) => ({
      ticker: p.ticker,
      company: p.company,
      // Summing lots accumulates binary error: GDX's four lots come to
      // 1500.9050000000002 rather than 1500.905. The page renders quantity
      // verbatim, so this is a visible defect, not just an inelegant float.
      // Vanguard reports 4 decimal places, so rounding at 6 cannot lose data.
      quantity: Math.round(p.quantity * 1e6) / 1e6,
      // Weighted average across lots, which is what the page multiplies back
      // out by quantity.
      avg_cost: p.totalCost !== null && p.quantity !== 0 ? p.totalCost / p.quantity : null,
      currency: "USD",
      account: p.account,
      assetType: null,
      lots: p.lots,
      // Derived rather than read: this export has no price column, but market
      // value over quantity is the same number. Used only for --seed-prices.
      exportPrice:
        p.marketValue !== null && p.quantity !== 0 ? p.marketValue / p.quantity : null,
    }));

    return { positions, skipped, account };
  },
};

const PARSERS = [SCHWAB, VANGUARD];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { file: null, slot: null, label: null, broker: null, dryRun: false, force: false, cash: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg.startsWith("--slot=")) args.slot = Number(arg.slice(7));
    else if (arg.startsWith("--label=")) args.label = arg.slice(8);
    else if (arg.startsWith("--broker=")) args.broker = arg.slice(9).toLowerCase();
    else if (arg.startsWith("--cash=")) args.cash = Number(arg.slice(7).replace(/[$,]/g, ""));
    else if (!arg.startsWith("--")) args.file = arg;
  }
  return args;
}

/**
 * Which slots already hold this account.
 *
 * An import always replaces the slot it is given, so re-importing the same
 * account into the same slot is a clean override. The failure mode this guards
 * is the *other* one: sending the same account to a different slot, which would
 * leave it loaded twice and double-count it in the combined total, with nothing
 * on the page to indicate it had happened.
 */
async function slotsHoldingAccount(supabase, account) {
  if (!account) return [];
  const { data, error } = await supabase
    .from("portfolio_positions")
    .select("slot, account")
    .eq("account", account);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => r.slot))].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.file) {
    console.error(
      "Usage: node scripts/import-portfolio-csv.js <file.csv> [--slot=1] [--label=\"...\"] [--dry-run] [--force]"
    );
    process.exitCode = 1;
    return;
  }
  if (args.slot !== null && (!Number.isInteger(args.slot) || args.slot < 1 || args.slot > 5)) {
    console.error(`--slot must be an integer 1-5 (got ${args.slot}).`);
    process.exitCode = 1;
    return;
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
    process.exitCode = 1;
    return;
  }

  const { positions, skipped, account } = parser.parse(text);

  // Vanguard's cost-basis download omits the settlement money market entirely —
  // it has no cost basis, so it is not a tax lot. Without this the balance
  // simply vanishes from the portfolio's Value with nothing to indicate it ever
  // existed, which is why the figure is supplied explicitly rather than
  // inferred.
  if (args.cash !== null) {
    if (!Number.isFinite(args.cash)) {
      console.error(`--cash must be a number (got "${args.cash}").`);
      process.exitCode = 1;
      return;
    }
    if (positions.some((p) => p.ticker === CASH_TICKER)) {
      console.error("--cash was given but the file already contains a cash row; refusing to double-count.");
      process.exitCode = 1;
      return;
    }
    positions.push({
      ticker: CASH_TICKER,
      company: "Cash & settlement fund",
      quantity: args.cash,
      avg_cost: null,
      currency: "USD",
      account,
      assetType: "cash",
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Resolve which slot to write to, using the account already on file when the
  // caller did not say. This is what makes a repeat import of the same
  // statement do the obvious thing instead of needing the slot remembered.
  const existingSlots = await slotsHoldingAccount(supabase, account);
  let slot = args.slot;

  if (slot === null) {
    if (existingSlots.length === 1) {
      slot = existingSlots[0];
      console.log(`Slot:    ${slot} (matched account already loaded there)`);
    } else if (existingSlots.length === 0) {
      console.error(
        `No slot given and no existing slot holds "${account ?? "this account"}".` +
          ` Pass --slot=N to choose one (1-5).`
      );
      process.exitCode = 1;
    return;
    } else {
      console.error(
        `Ambiguous: "${account}" is already loaded in slots ${existingSlots.join(" and ")}.` +
          ` Pass --slot=N to say which to replace.`
      );
      process.exitCode = 1;
    return;
    }
  }

  // Re-importing into the slot that already holds this account is a normal
  // override. Sending it to a *different* slot would load the same account
  // twice and double-count it in the combined total.
  const conflicts = existingSlots.filter((s) => s !== slot);
  if (conflicts.length > 0 && !args.force) {
    console.error(
      `\n"${account}" is already loaded in slot ${conflicts.join(" and ")}, but --slot=${slot} was given.` +
        `\nImporting would leave the same account in two slots and double-count it in the combined total.` +
        `\n\nEither re-run with --slot=${conflicts[0]} to replace it in place, or pass --force if you` +
        ` genuinely want it in both.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Format:  ${parser.name}`);
  if (account) console.log(`Account: ${account}`);
  if (args.slot !== null) console.log(`Slot:    ${slot}`);
  console.log(
    `Action:  ${existingSlots.includes(slot) ? `replacing existing positions in slot ${slot}` : `filling empty slot ${slot}`}`
  );
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
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const label = args.label ?? account ?? null;
  if (label) {
    const { error } = await supabase
      .from("portfolios")
      .update({ label, broker: parser.name, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (error) {
      console.error(`\nFailed to update slot label: ${error.message}`);
      process.exitCode = 1;
    return;
    }
  }

  // Replace the slot rather than append: this table is "what is held right
  // now", so a position since sold has to disappear rather than linger.
  const { error: deleteError } = await supabase
    .from("portfolio_positions")
    .delete()
    .eq("slot", slot);
  if (deleteError) {
    console.error(`\nFailed to clear slot ${slot}: ${deleteError.message}`);
    process.exitCode = 1;
    return;
  }

  const { error: insertError } = await supabase.from("portfolio_positions").insert(
    positions.map((p) => ({
      slot,
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
    process.exitCode = 1;
    return;
  }

  console.log(`\nWrote ${positions.length} positions into slot ${slot}${label ? ` ("${label}")` : ""}.`);

  await seedMissingQuotes(supabase, positions);
}

/**
 * Writes the export's own share price into stock_quotes for any holding that
 * has no quote row yet.
 *
 * The case this exists for is a mutual fund: Finnhub prices no share class of
 * one, so VFIAX would otherwise show an em-dash and drop out of the portfolio's
 * Value entirely — a six-figure hole explained only by a footnote. Seeding lets
 * the position carry its value, and because nothing can refresh it, the
 * existing stale-price rule flags it with an asterisk within a day. Visibly
 * stale beats silently absent.
 *
 * Only ever fills a gap: a ticker that already has a row is left alone, so a
 * live watchlist quote can never be overwritten with an export-date price.
 */
async function seedMissingQuotes(supabase, positions) {
  const candidates = positions.filter(
    (p) => p.ticker !== CASH_TICKER && typeof p.exportPrice === "number" && p.exportPrice > 0
  );
  if (candidates.length === 0) return;

  const tickers = [...new Set(candidates.map((p) => p.ticker))];
  const { data: existing, error } = await supabase
    .from("stock_quotes")
    .select("ticker")
    .in("ticker", tickers);

  if (error) {
    console.error(`  could not check existing quotes (${error.code}): ${error.message}`);
    return;
  }

  const have = new Set((existing ?? []).map((q) => q.ticker));
  const missing = candidates.filter((p) => !have.has(p.ticker));
  if (missing.length === 0) return;

  const { error: qErr } = await supabase.from("stock_quotes").upsert(
    missing.map((p) => ({
      ticker: p.ticker,
      price: p.exportPrice,
      change_pct: null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "ticker" }
  );

  if (qErr) {
    console.error(`  quote seeding failed: ${qErr.message}`);
    return;
  }

  console.log(
    `Seeded ${missing.length} price(s) from the export for tickers with no quote yet:`
  );
  for (const p of missing) {
    console.log(`  ${p.ticker.padEnd(8)} $${p.exportPrice.toFixed(2)}`);
  }
  console.log(
    "  Anything the refresh job can quote will be overwritten on its next run;\n" +
      "  anything it cannot will start showing the stale-price marker within a day."
  );
}

// Sets exitCode rather than calling process.exit(), which tears the process
// down while the Supabase client still has sockets closing — on Windows that
// trips a libuv assertion and reports 127 instead of the intended 1.
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
