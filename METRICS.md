# Portfolio Metrics — Formulas and Assumptions

Every number on the Portfolio tab's **Exposure & Risk** panel: what it is, how it
is computed, and what it does *not* mean. Implemented in
[`lib/portfolioAnalytics.ts`](lib/portfolioAnalytics.ts), which is pure — no I/O —
so any of it can be replayed against real holdings by a script.

Inputs come from `portfolio_positions` joined to `stock_quotes` (price) and
`stock_fundamentals` (characteristics) on `ticker`. See
[PORTFOLIO.md](PORTFOLIO.md) for how positions get there and
[DEPENDENCIES.md](DEPENDENCIES.md) for which Finnhub field feeds which column.

## Conventions that apply to everything

**Weights are over securities, excluding cash.** Cash carries none of the
characteristics being aggregated, and a sector chart that counted it as a sector
would answer a different question. Cash appears only as its own metric.

```
securityValue = Σ marketValue           over non-cash positions with a price
weight_i      = marketValue_i / securityValue
```

**Positions without a price are excluded entirely**, not treated as zero — they
are also excluded from the per-slot Value totals, and each portfolio says how
many it left out. A non-USD position is excluded for the same reason: quotes are
in USD, so pricing a foreign cost basis against them would produce a confidently
wrong number.

**Averages renormalise over the names that have the field, and report their own
coverage.** Finnhub has no data for some OTC and foreign listings. An average
over 70% of the money, presented as if it covered all of it, is the kind of
figure that quietly misleads — so anything below 95% coverage is annotated in the
UI with the share of value it actually covers.

```
weightedMean(f) = Σ(f_i · marketValue_i) / Σ(marketValue_i)    over i where f_i exists
coverage(f)     = Σ(marketValue_i) / securityValue             over i where f_i exists
```

---

## Composition charts

### Sector Exposure

Finnhub's `finnhubIndustry`, stored verbatim as `sector`. It is Finnhub's own
taxonomy, **not GICS** — "Metals & Mining" and "Semiconductors" sit at the same
level, so it behaves more like industry than sector. It is stored unmapped: an
invented GICS rollup would be a guess layered on someone else's guess.

```
sectorWeight(s) = Σ marketValue_i (where sector_i = s) / securityValue
```

Holdings with no sector fall into an explicit `Unclassified` slice, which always
sorts last regardless of size.

### Factor Exposure — size × style

Each holding lands in exactly one bucket, which is what makes a pie legitimate
here. Factor *loadings* in the usual sense are signed and would need diverging
bars, not a pie; this is a style-box classification, not a regression.

**Size**, on `market_cap` (millions, listing currency):

| Bucket | Range |
|---|---|
| Large | ≥ 10,000 |
| Mid | 2,000 – 10,000 |
| Small | < 2,000 |

**Style**, on `price_to_book` (Finnhub `pbAnnual`):

| Bucket | Range |
|---|---|
| Value | 0 < P/B < 1.5 |
| Blend | 1.5 ≤ P/B < 4.0 |
| Growth | P/B ≥ 4.0 |

A **non-positive book value yields no style at all**. It means liabilities exceed
assets, which is not "deep value" — the axis has no way to express it.

**Both axes must be known.** A name with a market cap but no book value is
`Unclassified`, never defaulted into Blend. Price-to-book covers only ~70% of the
book, so defaulting would invent roughly 30% of this chart.

Two honest weaknesses, stated because they are not visible in the picture:

- **A real style box blends several metrics.** P/B is the only one with usable
  free-tier coverage, so the cut-points above are a documented proxy rather than
  a reproduction of any index methodology.
- **Market cap is in the listing currency, not USD.** A CAD-reported cap is
  compared against USD thresholds. The panel says how many holdings this affects.
  Only names near a boundary can be misplaced by it.

### Funds

No quote provider classifies a fund — Finnhub's `profile2` returns `{}` for
every ETF and mutual fund, so they arrive with no sector and no market cap. On a
book holding VOO, VFIAX and GDX that made `Unclassified` **32.8% of the sector
chart, its largest slice**, and a misleading one: it conflated *"we have no
data"* with *"this is deliberately diversified"*, which are not the same claim.

[`lib/fundClassification.ts`](lib/fundClassification.ts) is a small
hand-maintained table filling that gap. Fund mandates change on the order of
never, and the alternative — decomposing each fund into its holdings — needs
per-fund constituent data no free source provides, and would still have to be
mapped onto Finnhub's taxonomy.

Both fields are optional, and **omitting one is the point**:

| Fund | Sector | Size × style | Why |
|---|---|---|---|
| VOO, VFIAX, SPY, VTI | `Broad Index` | `Large Blend` | The style box is a fact of the mandate — an S&P 500 fund *is* large blend — but no single sector applies |
| QQQ | `Broad Index` | `Large Growth` | Nasdaq-100 excludes financials and skews to tech by construction |
| GDX, XLE, XLK, SMH… | the sector | *(none)* | Sector is fixed by mandate; size is not — GDX spans large miners to juniors |

A classification is recorded only where the mandate makes it a fact rather than
an estimate. GDX therefore has a sector but no style bucket, and its dollars
stay `Unclassified` on the factor chart — which is the correct answer, not a
gap. `Broad Index` is deliberately its own category rather than a real sector:
it says "many sectors at once", which is true, instead of picking one.

Effect on the live book: sector `Unclassified` fell from **32.8% to 0.1%**, and
factor `Unclassified` from roughly 30% to **11.6%**.

---

## Per-portfolio metrics

The same functions run per slot as well as across the whole book, because the
slots differ enough in character that a combined figure describes none of them:

| | Beta | Top holding | Effective holdings | Cash |
|---|---|---|---|---|
| Roth IRA | 0.71 | AVAV 46.4% | 2.6 of 3 | 21.6% |
| Individual | 1.98 | ATXRF 20.6% | 14.1 of 31 | −1.2% |
| Vanguard | 1.35 | VOO 26.0% | 10.4 of 26 | 3.9% |

Each slot shows return **as a percentage** alongside the dollar P&L. Once slots
differ by an order of magnitude the dollars stop being comparable — $309k on
$2.8M and $309k on $242k are not the same result.

Winners/losers are **counts, not weights**. That is deliberate: it measures
breadth, so one large winner cannot mask a broadly losing slot.

---

## Concentration

```
largestPosition = max(weight_i)
top5            = Σ of the 5 largest weight_i
```

**Effective holdings** is the Herfindahl-Hirschman index inverted — the number of
*equally sized* positions that would produce the same concentration:

```
HHI                = Σ weight_i²
effectiveHoldings  = 1 / HHI
```

34 equal positions give 34; one position holding everything gives 1. It answers
"how many holdings does this book behave like", which a raw count cannot: 34
holdings where one is 20% is not a 34-holding portfolio in any meaningful sense.

**Effective sectors** applies the same formula to sector weights, renormalised
over *identified* sectors only. Unclassified is excluded rather than counted as a
sector of its own — otherwise unknown holdings would supply diversification they
have not been shown to provide.

---

## Risk

### Portfolio beta — exact, not an approximation

```
beta = Σ(beta_i · weight_i)
```

Beta is linear in portfolio weights, so the value-weighted mean **is** the
portfolio's beta. No correlation matrix is needed and none is being assumed.

Caveat worth knowing: Finnhub computes beta against a US index over an
unspecified window. For thinly traded OTC and foreign listings, stale or illiquid
prints can bias it in either direction.

### Weighted constituent volatility — *not* portfolio volatility

```
weightedVol = Σ(vol_i · weight_i)      where vol_i = Finnhub 3MonthADReturnStd
```

Labelled "Wtd constituent vol" rather than "portfolio volatility" because those
are different quantities. True portfolio volatility is

```
σ_p = √( Σ Σ w_i w_j σ_i σ_j ρ_ij )
```

which needs the correlation matrix ρ, and therefore historical return series this
project does not have. The weighted average is the ρ = 1 case — every holding
moving in lockstep — so **it is an upper bound and overstates the real figure**
to the extent holdings move independently.

### Cash

```
cashPct = cashValue / (securityValue + cashValue)
```

**Can legitimately be negative.** A margin debit is stored as a negative cash
balance and genuinely reduces the portfolio's value.

---

## Performance

```
unrealizedReturn = Σ pnl_i / Σ costBasis_i
pnl_i            = (price_i − avgCost_i) · quantity_i
```

**Unrealized only.** There is no realized-gain, dividend, or cash-flow accounting
anywhere in this tab, and no time weighting — this is not a time-weighted or
money-weighted return and should not be compared against one.

**12-month momentum** is the value-weighted 52-week *price* return of the
holdings as they stand today:

```
momentum = Σ(return52w_i · weight_i)
```

This is **not the return this portfolio earned**. It takes no account of when
each position was opened, and a position bought last week contributes a full
year of someone else's return. It describes the momentum characteristic of what
is currently held.

**Winners / losers** counts positions with non-null P&L above and below zero.
Position counts, deliberately not value-weighted — the point is breadth, catching
the case where one large winner masks a broadly losing book.

---

## Fundamentals

### Forward P/E — weighted *harmonic* mean

```
portfolioPE = 1 / Σ( weight_i / PE_i )
```

A portfolio's P/E is total price over total earnings, which is the harmonic mean,
not the arithmetic one. The arithmetic average lets a single 200× name drag the
figure up out of all proportion to the money behind it.

**Non-positive P/Es are dropped, not inverted.** A negative P/E means the company
lost money; averaging it in would cancel out a profitable holding as though the
two offset. This is why P/E coverage is the lowest of any metric here — on a book
of mostly pre-profit companies, most holdings have no meaningful P/E at all.

### ROE and unprofitable share

```
weightedRoe    = Σ(roe_i · weight_i)
unprofitable   = Σ marketValue_i (where roe_i < 0) / Σ marketValue_i (where roe_i exists)
```

Note the denominator on `unprofitable`: it is the share of **classified** value,
not of the whole book, so it is not diluted by names with no ROE at all.

---

## Coverage

Measured against the real 34-holding book, weighted by market value rather than
by name count — one 20% position matters more than ten microcaps.

| Field | Coverage | Feeds |
|---|---|---|
| `sector` | 99.1% | Sector chart |
| `beta` | 99.1% | Portfolio beta |
| `market_cap` | 99.1% | Size axis |
| `volatility_3m` | 95.9% | Weighted vol |
| `roe_ttm` | 89.6% | ROE, unprofitable share |
| `return_52w` | 88.7% | Momentum |
| `price_to_book` | 69.7% | Style axis |
| `forward_pe` | ~53% | Portfolio P/E |

Only one holding (MTLMY, 0.9% of value) has no Finnhub profile at all.

---

# Risk-adjusted return

Implemented in [`lib/riskMetrics.ts`](lib/riskMetrics.ts) (pure statistics) and
[`lib/returnSeries.ts`](lib/returnSeries.ts) (turning stored prices into aligned
series). Verified by [`scripts/verifyRiskMetrics.ts`](scripts/verifyRiskMetrics.ts),
which checks 38 analytic identities rather than whatever the code produced first:

```
npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyRiskMetrics.js
```

## Where the return series comes from

This is the part to understand before trusting any number below, because two
different things could be called "portfolio returns" and only one is a track
record.

| | Reconstructed | Snapshotted |
|---|---|---|
| Method | Today's share counts valued at past closes | `portfolio_snapshots`, one row per day |
| Available | Immediately, ~5 years back | Only from the day snapshots started |
| Honest for | **Risk** — volatility, beta, correlation, drawdown shape | Everything |
| Not honest for | **Return** — Sharpe numerator, alpha, Calmar | — |

**Reconstruction silently excludes every position since sold.** For most people
that means excluding the losers, so its returns are biased upward by hindsight.
It is a backtest of the current book, not a record of what was earned. It is
labelled as simulated everywhere it appears, and it is genuinely useful for risk
— the volatility and beta of *what you hold now* is a fair question to ask of
current weights.

Reconstruction is **buy-and-hold, not rebalanced**: a fixed share count valued
over time, so weights drift exactly as they really would. Constant-weight
rebalancing would embed a trading strategy nobody followed.

Only holdings priced on **every** date in a window are included. A name that
starts halfway through would otherwise show its arrival as a portfolio-wide jump
in value — a return that never happened.

**Prices come from Yahoo, not Finnhub.** Finnhub's `/stock/candle` returns 403
on the free tier. Yahoo is free, already used here for S&P futures, and covers
all 34 holdings including the OTC foreign listings.

## Window availability

Six holdings are recent listings, so the longer windows do not cover the whole
book. Measured against the real portfolio:

| Window | Coverage | |
|---|---|---|
| 1M / 3M | 100% | full book |
| 6M | 96.4% | |
| 1Y | 86.5% (28/34) | labelled partial |
| 3Y | 85.9% (27/34) | labelled partial |

The longest window covering *every* holding is **90 trading days**, capped by
SIVEF. **A 1-month Sharpe is not reported at all** — at 21 observations it is
noise, and printing it to two decimals beside better-supported numbers would
lend it credibility it has not earned.

## The formulas

All on simple daily returns, annualised with 252 trading days. `rf` is FRED's
`DTB3` 3-month bill, converted to a daily rate — a constant would bias every
window, since the bill has moved enough over a year to matter at the second
decimal of a Sharpe.

```
excess_t = r_t − rf_t

Sharpe   = mean(excess) / sd(excess) × √252
Sortino  = mean(excess) / downsideDeviation × √252
           downsideDeviation = √( Σ min(excess_t, 0)² / n )
Calmar   = annualisedReturn / |maxDrawdown|
```

Sortino divides the squared shortfalls by `n`, not by the count of negative
days — the conventional definition, and the one that keeps it comparable to
Sharpe instead of inflating as losing days get rarer.

**Sharpe is leverage-neutral.** Doubling every position leaves it unchanged
(before borrowing costs), which is what makes it a fair measure of a high-beta
book rather than a penalty on one. Alpha is the metric that interrogates beta.

### Sharpe's standard error

Reported alongside the ratio, per Lo (2002), assuming IID returns:

```
SE(Sharpe) = √( (1 + SR²/2) / n )     at the sampling frequency
```

At one year of daily data this is still around **±1.0**. Two Sharpes a tenth
apart are indistinguishable. IID is a generous assumption — autocorrelation
makes it worse — so treat it as a floor on the uncertainty, not an estimate of
it. It is shown precisely because a bare "0.42" invites more confidence than the
data supports.

### Drawdown

Peak-to-trough on the running maximum, over the equity curve implied by the
returns — not the decline from the first observation.

```
maxDrawdown     = min over t of ( equity_t / runningPeak_t − 1 )
currentDrawdown = equity_last / runningPeak − 1
daysUnderWater  = observations since the last high-water mark
```

### Benchmark-relative (vs SPY)

```
Rp − Rf = α + β(Rm − Rf) + ε

alpha           = ( mean(excessP) − β·mean(excessM) ) × 252
beta            = cov(excessP, excessM) / var(excessM)
rSquared        = cov² / (varP · varM)
trackingError   = sd(rp − rm) × √252
informationRatio= mean(rp − rm) × 252 / trackingError
```

**Two betas, deliberately.** The bottom-up beta above is the value-weighted
average of each holding's published beta; this one is regressed from the book's
own realised returns. Disagreement is informative rather than an error —
published betas are estimated over different windows against different indices,
and thin OTC listings distort them.

### Up/down capture

```
upCapture   = mean(rp | rm > 0) / mean(rm | rm > 0) × 100
downCapture = mean(rp | rm < 0) / mean(rm | rm < 0) × 100
```

The sharpest test of whether a high beta is earning anything. **190% up and 190%
down is a levered index fund; 190% up and 140% down is genuine convexity.** A
single beta cannot distinguish those two; this pair can. Requires at least 5
qualifying days on each side before reporting.

## Risk decomposition

Needs no price history — computed from current weights and published betas.

```
betaContribution_i = weight_i × beta_i
```

This sums to portfolio beta exactly, because beta is linear in weights. Worth
separating from weight because the two diverge sharply: a 4% position in a
beta-3.4 name contributes more market risk than an 8% position at beta 1.2, and
a weight column alone cannot show it. Share-of-beta is expressed against the
beta actually accounted for, so the column totals 100% even when some holdings
have no published beta.

```
grossExposure = securityValue / (securityValue + cashValue)
```

Above 100% means borrowed money is at work — a margin debit is negative cash,
so NAV is smaller than the securities held against it.

## Why there is no active-weight-vs-benchmark

Sector weights here come from `finnhubIndustry`, which is not GICS. "Metals &
Mining" has no clean counterpart in S&P's "Materials", so differencing the two
taxonomies would produce authoritative-looking nonsense. The benchmark-relative
*return* metrics above need no taxonomy alignment and are unaffected.

---

## What none of these metrics do

- **No correlation, covariance, or drawdown.** All three need historical return
  series; the free tier provides point-in-time characteristics only.
- **No benchmark comparison.** Nothing here is relative to an index, so "beta
  1.92" is against the market but "momentum +88%" is not excess return.
- **No FX conversion.** Non-USD positions are excluded from valuation entirely;
  non-USD market caps are compared against USD size thresholds.
- **No look-through.** An ETF or fund holding is treated as one security in one
  sector, not decomposed into what it holds.
- **Point-in-time only.** Nothing is stored historically, so none of these can be
  charted over time without adding a snapshot table.
