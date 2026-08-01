# Portfolio CSV Import

How positions get onto the Portfolio tab. The tab holds **up to five
portfolios** in fixed slots (1–5), so a Schwab brokerage account and a Vanguard
IRA can sit side by side. Every slot always renders; an unfilled one shows a
placeholder card, so adding or clearing a portfolio never shifts the others.

## One-time setup

Run [`scripts/portfolio-positions-table.sql`](scripts/portfolio-positions-table.sql)
in the Supabase SQL editor (Dashboard → SQL Editor → New query). It creates two
tables and seeds five slot rows:

| Table | Holds |
|---|---|
| `portfolios` | The five slots and their labels — `slot`, `label`, `broker` |
| `portfolio_positions` | The positions themselves, keyed on `(slot, ticker)` |

Name a slot whenever you like — it is independent of the positions in it:

```sql
update portfolios set label = 'Schwab Brokerage', broker = 'schwab' where slot = 1;
update portfolios set label = 'Vanguard IRA',     broker = 'vanguard' where slot = 2;
```

## What the columns mean

Only `slot`, `ticker`, and `quantity` are required. Everything else may be left
empty and renders as an em-dash rather than breaking the page.

| Column | Required | Notes |
|---|---|---|
| `slot` | ✅ | Which portfolio (1–5) the row belongs to |
| `ticker` | ✅ | Must match the symbols in `stock_quotes` for a live price to be found. `$CASH` is a sentinel — see "How cash is stored" |
| `quantity` | ✅ | Shares held (or the dollar balance, on a `$CASH` row) |
| `avg_cost` | | **Per share**, not total cost basis — the page multiplies it by `quantity` |
| `company` | | Display only |
| `currency` | | Blank or `USD` is treated as USD; see the caveat below |
| `account` | | Display only; useful when one broker exports several accounts |
| `imported_at` | | Leave unset — it defaults to the import time and drives the "Imported …" label |

## Before every import: clear the slot

These tables hold *what is held right now*, not a history. If the previous
snapshot is not cleared, a position you have since sold lingers on the page
forever. Clear only the slot being replaced so the other portfolios are
untouched:

```sql
delete from portfolio_positions where slot = 1;
```

The primary key is `(slot, ticker)`, so if you forget, the import **fails on a
duplicate key** rather than silently doubling every position. That is
deliberate — a loud failure beats quietly wrong P&L.

## Importing

Export positions from your broker, then run:

```
node scripts/import-portfolio-csv.js "Roth Contributory IRA-Positions-2026-07-29.csv" --slot=1
```

| Flag | |
|---|---|
| `--slot=N` | Which portfolio slot (1–5) to load into. Optional once the account has been imported before — see below |
| `--label="..."` | Rename the slot. Defaults to the account name read from the file's preamble |
| `--broker=NAME` | Override format detection (currently only `schwab`) |
| `--dry-run` | Parse and print what *would* be written, touching nothing |
| `--force` | Allow an account into a slot when it is already loaded in a different one |

The script replaces the slot's contents rather than appending, so **you do not
need to clear the slot first** — the `delete from …` step above is only needed
if you are importing through the Supabase dashboard by hand.

### Re-importing the same account

The script reads the account name out of the file and checks where it is already
loaded, so a repeat import does the obvious thing:

```
$ node scripts/import-portfolio-csv.js schwab.csv        # no --slot needed
Slot:    1 (matched account already loaded there)
Action:  replacing existing positions in slot 1
```

The slot is wiped and rewritten, so sold positions disappear and nothing is
double-counted. Behaviour in each case:

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

Always worth a `--dry-run` first:

```
$ node scripts/import-portfolio-csv.js schwab.csv --slot=1 --dry-run
Format:  schwab
Account: Roth Contributory IRA ...803
Slot:    1
Parsed:  2 positions, 2 rows skipped

  AVAV     qty=20         avg cost=$187.08      AEROVIRONMENT INC
  NBIS     qty=6          avg cost=$152.77      NEBIUS GROUP N V A FCLASS A
  (skipped) Cash & Cash Investments — not a position (cash or subtotal row)
  (skipped) Positions Total — not a position (cash or subtotal row)
```

### Why a script rather than the Supabase dashboard

A broker export is not a clean CSV. The Schwab file has a preamble line above
the header, a blank line, money formatted as `"$2,894.40"`, a trailing comma on
every row, a `Cash & Cash Investments` line, and a `Positions Total` subtotal
row. Supabase's importer expects a header row plus data rows and chokes on all
of it — and it has no way to supply `slot`, which no broker export contains.
Dashboard import still works for a hand-made file; it is just not viable for a
raw export.

### Schwab

Verified against a real "Positions" export. Mapping:

| Schwab column | → | Notes |
|---|---|---|
| `Symbol` | `ticker` | Upper-cased |
| `Description` | `company` | |
| `Qty (Quantity)` | `quantity` | |
| `Cost Basis` | `avg_cost` | **Divided by quantity** — see below |
| *(preamble line)* | `account` | Parsed from `Positions for account <name> as of …` |

**Schwab's `Cost Basis` is the total for the position, not the per-share
average.** The page multiplies `avg_cost` by `quantity`, so importing the total
unchanged would overstate cost basis by a factor of `quantity` and invent a huge
fake loss. The script divides. Checked against the file's own figures: AVAV's
`$3,741.60` over 20 shares is `$187.08` each, and `20 × 144.72 − 3,741.60` gives
`−$847.20`, matching the `Gain $` Schwab reports on that row exactly. NBIS
likewise reproduces its `$35.52` / `3.88%`.

Rows skipped automatically: `Positions Total`, `Account Total`, and any row
without a quantity. **Cash is imported** — see below — so a slot's Value ties
out to the "Positions Total" Schwab prints. Verified against this file:
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

## Status

- ✅ Tables, five-slot layout, placeholder cards, per-portfolio and combined
  totals, currency and missing-quote handling.
- ✅ Schwab import, verified against a real export.
- ⏳ **Vanguard is not supported yet.** Running the script on a Vanguard file
  will fail format detection and exit rather than guessing. Its headers are
  deliberately not written here until a real export is available — the exact
  columns differ by which report is exported, and an invented mapping would
  either fail outright or, worse, silently mis-map a cost basis. Adding it means
  one more parser object in `scripts/import-portfolio-csv.js`; the table, the
  page, and everything above already handle multiple brokers.
