/**
 * Broker CSV parsing and the slot write, shared by the CLI
 * (scripts/import-portfolio-csv.js) and the in-app upload on /portfolio, so the
 * two can never disagree about what a file contains or how a slot is replaced.
 */

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
      // The cash row's balance, and every other row's seeded price.
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
      const marketValue = idx.marketValue === -1 ? null : parseNumber(fields[idx.marketValue]);
      const avgCost = totalCost !== null && quantity !== 0 ? totalCost / quantity : null;

      positions.push({
        ticker: symbol.toUpperCase(),
        company: idx.description === -1 ? null : fields[idx.description] || null,
        quantity,
        avg_cost: avgCost,
        currency: "USD",
        account,
        assetType: idx.assetType === -1 ? null : fields[idx.assetType] || null,
        // Market value over quantity rather than the Price column, so an option
        // comes out per contract ($0.85 x 100) the way its avg_cost already is.
        // Used only to seed a ticker with no quote yet; see seedMissingQuotes.
        exportPrice: marketValue !== null && quantity !== 0 ? marketValue / quantity : null,
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
        skipped.push({ symbol: rawSymbol, reason: "money market — enter its balance as cash instead" });
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
 * Returns the positions it seeded, for the caller to report.
 */
async function seedMissingQuotes(supabase, positions) {
  const candidates = positions.filter(
    (p) => p.ticker !== CASH_TICKER && typeof p.exportPrice === "number" && p.exportPrice > 0
  );
  if (candidates.length === 0) return [];

  const tickers = [...new Set(candidates.map((p) => p.ticker))];
  const { data: existing, error } = await supabase
    .from("stock_quotes")
    .select("ticker")
    .in("ticker", tickers);

  if (error) {
    console.error(`  could not check existing quotes (${error.code}): ${error.message}`);
    return [];
  }

  const have = new Set((existing ?? []).map((q) => q.ticker));
  const missing = candidates.filter((p) => !have.has(p.ticker));
  if (missing.length === 0) return [];

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
    return [];
  }

  return missing;
}

/**
 * Schwab can list one ticker on two rows (ATXRF at 2,000 and 18,000 shares in
 * the same export), and two rows for one ticker collide on the (slot, ticker)
 * primary key. Merged the same way Vanguard's lots are: summed shares and summed
 * dollars, so the average cost stays weighted.
 */
function mergeDuplicates(positions) {
  const byTicker = new Map();
  for (const p of positions) {
    const prev = byTicker.get(p.ticker);
    if (!prev) {
      byTicker.set(p.ticker, { ...p });
      continue;
    }
    const cost = (x) => (x.avg_cost === null ? null : x.avg_cost * x.quantity);
    const totalCost = cost(prev) === null || cost(p) === null ? null : cost(prev) + cost(p);
    prev.quantity = Math.round((prev.quantity + p.quantity) * 1e6) / 1e6;
    prev.avg_cost = totalCost !== null && prev.quantity !== 0 ? totalCost / prev.quantity : null;
  }
  return [...byTicker.values()];
}

/** Detects the broker unless one is named, and throws when neither works. */
function parsePortfolioCsv(text, brokerName = null) {
  const parser = brokerName
    ? PARSERS.find((p) => p.name === brokerName)
    : PARSERS.find((p) => p.detect(text));
  if (!parser) {
    throw new Error(
      `Could not identify the broker format. Known formats: ${PARSERS.map((p) => p.name).join(", ")}.`
    );
  }
  const { positions, skipped, account } = parser.parse(text);
  return { broker: parser.name, account, positions: mergeDuplicates(positions), skipped };
}

/**
 * Vanguard's cost-basis download omits the settlement money market entirely —
 * it has no cost basis, so it is not a tax lot. Without this the balance
 * simply vanishes from the portfolio's Value with nothing to indicate it ever
 * existed, which is why the figure is supplied explicitly rather than
 * inferred.
 */
function addCash(parsed, cash) {
  if (!Number.isFinite(cash)) throw new Error(`Cash must be a number (got "${cash}").`);
  if (parsed.positions.some((p) => p.ticker === CASH_TICKER)) {
    throw new Error("Cash was given but the file already contains a cash row; refusing to double-count.");
  }
  parsed.positions.push({
    ticker: CASH_TICKER,
    company: "Cash & settlement fund",
    quantity: cash,
    avg_cost: null,
    currency: "USD",
    account: parsed.account,
    assetType: "cash",
  });
}

/**
 * Picks the slot to write, or explains why it cannot. With no slot requested,
 * the slot already holding this account is reused, so a repeat import of the
 * same statement needs nothing remembered.
 *
 * Returns { slot, replacing, matched, sameAccount } or { error }.
 */
async function resolveSlot(supabase, account, requestedSlot, force = false) {
  const existingSlots = await slotsHoldingAccount(supabase, account);
  let slot = requestedSlot;

  if (slot === null) {
    if (existingSlots.length === 1) {
      slot = existingSlots[0];
    } else if (existingSlots.length === 0) {
      return {
        error: `No slot given and no existing slot holds "${account ?? "this account"}". Choose a slot (1-5).`,
      };
    } else {
      return {
        error: `Ambiguous: "${account}" is already loaded in slots ${existingSlots.join(" and ")}. Choose which to replace.`,
      };
    }
  }

  // Re-importing into the slot that already holds this account is a normal
  // override. Sending it to a *different* slot would load the same account
  // twice and double-count it in the combined total.
  const conflicts = existingSlots.filter((s) => s !== slot);
  if (conflicts.length > 0 && !force) {
    return {
      error:
        `"${account}" is already loaded in slot ${conflicts.join(" and ")}. Importing it into slot ${slot} ` +
        `would double-count it in the combined total. Use slot ${conflicts[0]} to replace it in place.`,
    };
  }

  // A slot holds an account even when a lookup by this file's account misses
  // it, e.g. a different account being swapped in, so ask the slot directly.
  const { count } = await supabase
    .from("portfolio_positions")
    .select("ticker", { count: "exact", head: true })
    .eq("slot", slot);

  return {
    slot,
    replacing: (count ?? 0) > 0,
    matched: requestedSlot === null,
    sameAccount: existingSlots.includes(slot),
  };
}

/**
 * Replaces a slot's holdings with `positions`. Upsert first, then remove what
 * the file no longer lists, so a failed write leaves the old holdings in place
 * rather than an empty slot. This table is "what is held right now", so a
 * position since sold has to disappear rather than linger.
 */
async function writeSlot(supabase, slot, { broker, positions }, label) {
  if (positions.length === 0) throw new Error("Nothing to import — no position rows were parsed.");

  if (label) {
    const { error } = await supabase
      .from("portfolios")
      .update({ label, broker, updated_at: new Date().toISOString() })
      .eq("slot", slot);
    if (error) throw new Error(`Failed to update slot label: ${error.message}`);
  }

  const importedAt = new Date().toISOString();
  const { error: upsertError } = await supabase.from("portfolio_positions").upsert(
    positions.map((p) => ({
      slot,
      ticker: p.ticker,
      company: p.company,
      quantity: p.quantity,
      avg_cost: p.avg_cost,
      currency: p.currency,
      account: p.account,
      imported_at: importedAt,
    })),
    { onConflict: "slot,ticker" }
  );
  if (upsertError) throw new Error(`Write failed: ${upsertError.message}`);

  const { data: held, error: readError } = await supabase
    .from("portfolio_positions")
    .select("ticker")
    .eq("slot", slot);
  if (readError) throw new Error(`Wrote positions, but could not check for sold ones: ${readError.message}`);

  const keep = new Set(positions.map((p) => p.ticker));
  const sold = (held ?? []).map((r) => r.ticker).filter((t) => !keep.has(t));
  if (sold.length > 0) {
    const { error: deleteError } = await supabase
      .from("portfolio_positions")
      .delete()
      .eq("slot", slot)
      .in("ticker", sold);
    if (deleteError) {
      throw new Error(`Wrote positions, but could not remove sold ones (${sold.join(", ")}): ${deleteError.message}`);
    }
  }
  return { sold };
}

module.exports = {
  CASH_TICKER,
  PARSERS,
  parsePortfolioCsv,
  addCash,
  resolveSlot,
  writeSlot,
  seedMissingQuotes,
};
