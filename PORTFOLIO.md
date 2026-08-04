# Portfolio CSV Import

How positions get onto the Portfolio tab. The tab holds **up to five
portfolios** in fixed slots (1–5), so a Schwab brokerage account and a Vanguard
IRA can sit side by side. Every slot always renders; an unfilled one shows a
placeholder card, so adding or clearing a portfolio never shifts the others.

Supported: **Schwab** and **Vanguard**, both verified against real exports.

This file covers getting positions *in*. For what the **Exposure & Risk** panel
above the tables computes from them — every formula, its coverage, and what it
deliberately does not claim — see **[`METRICS.md`](METRICS.md)**.

## One-time setup

Run [`scripts/portfolio-positions-table.sql`](scripts/portfolio-positions-table.sql)
in the Supabase SQL editor (Dashboard → SQL Editor → New query). It creates two
tables and seeds five slot rows:

| Table | Holds |
|---|---|
| `portfolios` | The five slots and their labels — `slot`, `label`, `broker` |
| `portfolio_positions` | The positions themselves, keyed on `(slot, ticker)` |

## Importing

Export positions from your broker, then run the import script. The first time an
account is loaded you have to say which slot it belongs in; after that the script
recognises it and reuses the same slot.

```
# first time — choose a slot
node scripts/import-portfolio-csv.js "Roth Contributory IRA-Positions.csv" --slot=1

# every time after — the slot is inferred from the account
node scripts/import-portfolio-csv.js "Roth Contributory IRA-Positions.csv"
```

**The script replaces the slot's contents rather than appending**, so there is
nothing to clear first: positions you have since sold disappear, and nothing is
double-counted. It also renames the slot to the account name it finds in the
file, so `portfolios.label` looks after itself.

| Flag | |
|---|---|
| `--slot=N` | Which portfolio slot (1–5) to load into. Optional once the account has been imported before |
| `--label="..."` | Rename the slot. Defaults to the account name read from the file's preamble |
| `--broker=NAME` | Override format detection (currently only `schwab`) |
| `--dry-run` | Parse and print what *would* be written, touching nothing |
| `--force` | Allow an account into a slot when it is already loaded in a different one |

Worth a `--dry-run` first — it shows exactly which rows will be written, which
were skipped, and whether the slot is being filled or replaced:

```
$ node scripts/import-portfolio-csv.js schwab.csv --dry-run
Slot:    1 (matched account already loaded there)
Format:  schwab
Account: Roth Contributory IRA ...803
Action:  replacing existing positions in slot 1
Parsed:  3 positions, 1 rows skipped

  AVAV     qty=20         avg cost=$187.08      AEROVIRONMENT INC
  NBIS     qty=6          avg cost=$152.77      NEBIUS GROUP N V A FCLASS A
  $CASH    balance=$4522.43       Cash & Cash Investments
  (skipped) Positions Total — subtotal row

Dry run — nothing written.
```

Each slot on the page shows how stale it is — "Updated just now", "Updated 11
days ago", with the exact timestamp on hover. An untouched slot reads "Never
imported".

### Re-importing the same account

The script reads the account name out of the file and checks where it is already
loaded, so a repeat import cannot quietly end up in the wrong place:

| Situation | What happens |
|---|---|
| Account already in one slot, no `--slot` | That slot is reused and replaced |
| Account already in one slot, same `--slot` | Replaced in place |
| Account already in one slot, **different** `--slot` | **Refused** — it would load the account twice and double-count it in the combined total. Re-run against the original slot, or pass `--force` |
| Account in two slots, no `--slot` | Refused as ambiguous; name the slot explicitly |
| New account, no `--slot` | Refused — pass `--slot=N` to choose where it goes |

Matching is on the account name from the file's preamble (e.g. `Roth
Contributory IRA ...803`). A file with no recognisable account name always needs
`--slot`.

### Why a script rather than the Supabase dashboard

A broker export is not a clean CSV. The Schwab file has a preamble line above
the header, a blank line, money formatted as `"$2,894.40"`, a trailing comma on
every row, a `Cash & Cash Investments` line, and a `Positions Total` subtotal
row. Supabase's importer expects a header row plus data rows and chokes on all
of it — and it has no way to supply `slot`, which no broker export contains.

## Schwab

Verified against a real "Positions" export. Mapping:

| Schwab column | → | Notes |
|---|---|---|
| `Symbol` | `ticker` | Upper-cased |
| `Description` | `company` | |
| `Qty (Quantity)` | `quantity` | |
| `Cost Basis` | `avg_cost` | **Divided by quantity** — see below |
| `Mkt Val (Market Value)` | `quantity` | Cash row only, where it is the balance |
| *(preamble line)* | `account` | Parsed from `Positions for account <name> as of …` |

**Schwab's `Cost Basis` is the total for the position, not the per-share
average.** The page multiplies `avg_cost` by `quantity`, so importing the total
unchanged would overstate cost basis by a factor of `quantity` and invent a huge
fake loss. The script divides. Checked against the file's own figures: AVAV's
`$3,741.60` over 20 shares is `$187.08` each, and `20 × 144.72 − 3,741.60` gives
`−$847.20`, matching the `Gain $` Schwab reports on that row exactly. NBIS
likewise reproduces its `$35.52` / `3.88%`.

Rows skipped automatically: `Positions Total`, `Account Total`, and any row
without a quantity. **Cash is imported**, so a slot's Value ties out to the
"Positions Total" Schwab prints — verified on this file:
`$2,894.40 + $952.14 + $4,522.43 = $8,368.97`, exactly Schwab's own total.

### How cash is stored

Cash is an ordinary row under the sentinel ticker **`$CASH`**, with the dollar
balance in `quantity` and `avg_cost` left null. Two consequences worth knowing:

- The sentinel is `$CASH` rather than `CASH` because `CASH` is Pathward
  Financial's real symbol and would collide with an actual holding.
- `quantity` holds dollars, not a share count, for this one row. The page knows
  this: it renders the ticker as "Cash", shows an em-dash for Quantity, Avg
  Cost, Price, P&L and P&L %, and counts the balance toward Value only.

This keeps cash working without adding `is_cash`/`market_value` columns for one
row per portfolio. If you would rather have explicit columns, that is a small
migration and a few lines — say so.

## Vanguard

| Vanguard column | → | Notes |
|---|---|---|
| `Symbol` | `ticker` | Class shares normalised: `BRK B` → `BRK.B` |
| `Investment Name` | `company` | |
| `Shares` | `quantity` | Fractional shares preserved (`187.255`) |
| `Average Cost Per Share` | `avg_cost` | Used directly when present |
| `Total Cost` / `Cost Basis` | `avg_cost` | Fallback — divided by shares |
| `Total Value` | `quantity` | Money-market row only, where it is the balance |
| `Account Number` | `account` | Stored as `Vanguard <number>` |

**Export the cost-basis view, not the plain holdings view.** Vanguard's default
positions download has only Shares, Share Price and Total Value — no cost. Rows
import fine without it, but `avg_cost` is null, so Avg Cost, P&L and P&L % are
em-dashes for the whole slot, and the page's Combined P&L then covers only the
portfolios that do have costs while the totals include this one. Use the
unrealised gain/loss or cost-basis download instead.

Three Vanguard-specific behaviours, all verified on a real export:

- **`BRK B` → `BRK.B`.** Left alone this is worse than a wrong ticker: the space
  makes `refresh-data.js` classify it as an option symbol and skip it, so the
  position would silently never be priced.
- **Money-market funds become cash.** `VMFXX` at a fixed $1 NAV is a settlement
  sweep, not an exposure. Matched on the fund *name* containing "money market",
  so it survives `VMFXX` → `VMRXX`. Carrying it as a holding would imply market
  risk that does not exist *and* drop the balance out of Value, since no free
  quote source prices it.
- **Zero-share rows are skipped.** Vanguard keeps closed positions in the export
  at 0 shares; they are history, not holdings.

### Seeded prices

After a Vanguard import the script writes the export's own share price into
`stock_quotes` for any ticker with no quote row yet, and lists what it seeded.

This exists for mutual funds. Finnhub prices no share class of one, so `VFIAX`
would otherwise show an em-dash and drop out of Value — a six-figure hole
explained by a footnote. Seeded, the position carries its value, and since
nothing can refresh it the stale-price rule flags it with an asterisk within a
day. **Visibly stale beats silently absent.**

It only ever fills a gap: a ticker that already has a quote is left untouched,
so a live watchlist price can never be overwritten with an export-date one.
Anything the refresh job *can* quote gets overwritten on its next run.

## Caveats that affect the numbers

- **Non-USD positions are excluded from Value and P&L.** Quotes come from
  Finnhub in USD, so pricing a non-USD cost basis against them would produce a
  confidently wrong P&L. Those rows still list, tagged with their currency, and
  each portfolio says how many rows it left out of its totals.
- **A ticker with no matching quote still lists**, showing quantity and cost
  with an em-dash for price and P&L. Check the symbol matches what
  `stock_quotes` uses if you expect a price and do not see one.
- **P&L is unrealized only**, computed as `(price − avg_cost) × quantity`. There
  is no realized-gain or dividend accounting anywhere in this tab.
- **Prices stay current between imports.** The page joins on `ticker` against
  the live `stock_quotes` table, so you only need to re-import when positions
  change, not when prices do.
- **"Updated" is when you imported, not the statement date.** A file exported on
  the 29th and imported on the 31st reads "Updated 2 days ago" from the import,
  even though the positions are as of the 29th. Capturing the broker's own
  as-of date would need an extra column.

## Loading a slot by hand

Only needed for a hand-made CSV, or to poke at a slot without re-running an
import. The dashboard importer **appends**, and the primary key is
`(slot, ticker)`, so clear the slot first or the import fails on a duplicate key:

```sql
delete from portfolio_positions where slot = 1;
```

Then Table Editor → `portfolio_positions` → Insert → Import data from CSV. Your
file needs a `slot` column, since no broker export has one. Only `slot`,
`ticker` and `quantity` are required; anything else may be left empty and
renders as an em-dash.

| Column | Required | Notes |
|---|---|---|
| `slot` | ✅ | Which portfolio (1–5) the row belongs to |
| `ticker` | ✅ | Must match the symbols in `stock_quotes` for a live price to be found. `$CASH` is a sentinel — see [How cash is stored](#how-cash-is-stored) |
| `quantity` | ✅ | Shares held (or the dollar balance, on a `$CASH` row) |
| `avg_cost` | | **Per share**, not total cost basis — the page multiplies it by `quantity` |
| `company` | | Display only |
| `currency` | | Blank or `USD` is treated as USD; see the caveats above |
| `account` | | Also what the importer matches on when re-importing |
| `imported_at` | | Leave unset — it defaults to the import time and drives the "Updated …" label |

Slots can be renamed independently of their positions:

```sql
update portfolios set label = 'Schwab Brokerage', broker = 'schwab' where slot = 1;
```

## Status

- ✅ Tables, five-slot layout, placeholder cards, per-portfolio and combined
  totals, currency and missing-quote handling, per-slot last-updated.
- ✅ Schwab import, verified end to end against a real export — parsing, cost
  basis derivation, cash, stored rows and rendered page.
- ✅ Account-aware re-import: same account reuses its slot, a different slot is
  refused rather than double-counted.
- ✅ Vanguard import: symbol normalisation, money-market-as-cash, zero-share
  skipping and seeded prices for unquotable funds.
- ⏳ **Vanguard cost basis is untested.** The export used to build the parser had
  no cost column, so the `Average Cost Per Share` and `Total Cost` mappings are
  written from Vanguard's documented header names but have not been exercised
  against a real file. Worth a `--dry-run` on the first cost-basis export to
  confirm the numbers land where they should.
- ⏳ Untested shapes: ETFs, fractional shares, options, short positions, and
  exports containing several accounts. Handled in principle, but no real file
  has exercised them.
