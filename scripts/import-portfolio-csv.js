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
//   --broker=NAME    Override broker detection (schwab, vanguard).
//   --cash=N         Add a cash balance. Vanguard's cost-basis download omits
//                    the settlement money market, so its balance goes here.
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
// Parsing and the write live in scripts/lib/portfolioImport.js, shared with the
// upload form on /portfolio. Writes with the service role key (see SECURITY.md).

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const {
  CASH_TICKER,
  PARSERS,
  parsePortfolioCsv,
  addCash,
  resolveSlot,
  writeSlot,
  seedMissingQuotes,
} = require("./lib/portfolioImport");

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
  if (args.broker && !PARSERS.some((p) => p.name === args.broker)) {
    console.error(`Unknown --broker=${args.broker}. Known formats: ${PARSERS.map((p) => p.name).join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  const text = fs.readFileSync(args.file, "utf8");

  let parsed;
  try {
    parsed = parsePortfolioCsv(text, args.broker);
    if (args.cash !== null) addCash(parsed, args.cash);
  } catch (e) {
    console.error(`${path.basename(args.file)}: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const { positions, skipped, account } = parsed;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const target = await resolveSlot(supabase, account, args.slot, args.force);
  if (target.error) {
    console.error(`\n${target.error}${args.slot !== null ? " Or pass --force if you genuinely want it in both." : ""}`);
    process.exitCode = 1;
    return;
  }
  const { slot } = target;

  if (target.matched) console.log(`Slot:    ${slot} (matched account already loaded there)`);
  console.log(`Format:  ${parsed.broker}`);
  if (account) console.log(`Account: ${account}`);
  if (!target.matched) console.log(`Slot:    ${slot}`);
  console.log(`Action:  ${target.replacing ? `replacing existing positions in slot ${slot}` : `filling empty slot ${slot}`}`);
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
  try {
    const { sold } = await writeSlot(supabase, slot, parsed, label);
    console.log(`\nWrote ${positions.length} positions into slot ${slot}${label ? ` ("${label}")` : ""}.`);
    if (sold.length > 0) console.log(`Removed ${sold.length} no longer held: ${sold.join(", ")}`);
  } catch (e) {
    console.error(`\n${e.message}`);
    process.exitCode = 1;
    return;
  }

  const seeded = await seedMissingQuotes(supabase, positions);
  if (seeded.length > 0) {
    console.log(`Seeded ${seeded.length} price(s) from the export for tickers with no quote yet:`);
    for (const p of seeded) console.log(`  ${p.ticker.padEnd(8)} $${p.exportPrice.toFixed(2)}`);
    console.log(
      "  Anything the refresh job can quote will be overwritten on its next run;\n" +
        "  anything it cannot will start showing the stale-price marker within a day."
    );
  }
}

// Sets exitCode rather than calling process.exit(), which tears the process
// down while the Supabase client still has sockets closing — on Windows that
// trips a libuv assertion and reports 127 instead of the intended 1.
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
