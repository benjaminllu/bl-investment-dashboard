# Sectors — Formulas and How to Read Them

Every number on the `/sectors` page: what it is, exactly how it is computed, and
what it does *and does not* let you conclude. The companion to
[METRICS.md](METRICS.md), which does the same job for the Portfolio tab.

Implemented in [`lib/rotation.ts`](lib/rotation.ts) and [`lib/cycle.ts`](lib/cycle.ts),
both pure functions over price bars, so anything here can be replayed:

```
npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyRotation.js
```

Every worked example below came from that script on the 2026-08-21 close.

---

## Conventions that apply to everything

**Relative, not absolute.** Almost every figure is measured *against SPY*. A
sector at the top of this page can be down 20% in a market that is down 30%.
Nothing here says anything about direction — the returns table at the bottom of
the page is the only part that does.

**Percent vs percentage points.** A return is in percent (`%`). A difference
between two returns is in percentage points (`pp`). "XLK +18.8" in the momentum
table means XLK's total return beat SPY's by 18.8 percentage points, not that
XLK rose 18.8%.

**Total return, not price return.** Closes are Yahoo's `adjclose`, which folds
dividends back in. This is load-bearing rather than pedantic: measured on live
data, XLU's trailing-year *price* return was −0.58% against a *total* return of
+2.19%. Ranking on price return would quietly penalise utilities, staples, real
estate and energy every single day.

**Trading days, not calendar days.** Windows are counted in bars:

| Label | Bars |
|---|---|
| 1M | 21 |
| 3M | 63 |
| 6M | 126 |
| 12M | 252 |

**Weekly bars** are the **last trading day of each calendar week**, keyed by that
week's Monday. A holiday-shortened week collapses to one bar — its own last
session, which may be a Thursday.

**Two tiers, never one list.** The eleven Select Sector SPDRs *partition* the
S&P 500: every constituent sits in exactly one, and the weights sum to the
index. That is what makes "which sector is leading" well-posed — money leaving
one has to arrive somewhere. The seven industry funds do **not** partition
anything (semis sit inside tech), so they are computed and normalised only
against each other and are never mixed into the sector cross section. Read the
industry tier as *what is driving the sectors*, never as a ranking against them.

### The cross-sectional z-score

This is the single most important thing to understand, because it is the input
to both the rotation graph and the momentum score.

At each date, take the eleven sectors' values, and express each one as *how many
standard deviations it sits from the eleven-sector average, on that date*:

```
z_i = (x_i − mean(x)) / stdev(x)          population stdev, over the 11 members
```

**What that buys.** The eleven sectors partition SPY, so their cap-weighted
excess return against SPY sums to roughly zero by construction. "Above the
cross-sectional mean" is therefore a real statement about a closed system, and
it is exactly the claim rotation makes.

**What it costs.** Everything becomes relative. In a week where all eleven
sectors do almost the same thing, the z-scores still spread out across the full
range and the graph still looks decisive. **This is what the Rotation Conditions
score exists to warn you about** — read that first.

**Practical bounds.** With 11 members and a population standard deviation, `|z|`
cannot exceed √10 ≈ **3.16**. So a z of 2.4 is genuinely extreme, and anything
past 3 means one sector is alone at one end.

### Percentiles

```
percentile = (count of history strictly below the current value) / (count of history) × 100
```

Computed over the **whole aligned daily history**, which starts **June 2018**,
not the ten years the fetch requests. XLC launched then, and the sector grid is
intersected across calendars, so it is bounded by the youngest fund in it. The
band states its own start date for this reason. ~2,050 trading days.

100 means "highest ever seen in the sample". 0 means "lowest".

---

## 1. Rotation Conditions — the headline score

**This is the score to read first, and it gates everything below it.**

```
rotationScore = ( percentile(dispersion)  +  (100 − percentile(correlation)) ) / 2
```

That is the whole formula. Two inputs, both of them tiles sitting directly
underneath it, one of them inverted. It is **not** an index with hidden
machinery — deliberately, because a composite you cannot recompute in your head
gets trusted more than it deserves.

**Worked example, 2026-08-21:**

```
dispersion percentile   = 91.59
correlation percentile  =  0.15   →  inverted: 99.85

rotationScore = (91.59 + 99.85) / 2 = 95.72   →  displayed as 96
```

### What it means

It answers one question: **are the eleven sectors moving apart from each other
right now?** High dispersion means they moved differently day to day. Low
correlation means those differences were persistent rather than noise. Both
conditions together are what "a rotation regime" actually is.

| Score | Verdict shown | How to act on it |
|---|---|---|
| **≥ 70** | "Sectors are moving apart" | The rankings below describe real separation. Sector choice is paying. |
| **40–69** | "Mixed" | Some separation, but the market is not obviously discriminating. Weight the rankings lightly. |
| **< 40** | "Sectors are moving together" | Treat every ranking below as close to noise. There is little to rotate *between* — you are ranking the same trade eleven times. |

### What it does NOT mean

- **It is not directional.** A 96 is equally consistent with a violent selloff
  where defensives hold up and a broad melt-up with rotating leadership. It says
  the sectors separated, not which way.
- **It is not a forecast.** Both inputs are trailing windows (21 and 63 days).
  It describes the regime you have just been in.
- **It is not additive with anything.** Two percentiles averaged is not a
  probability, a return, or a confidence level. The only meaningful comparison
  is against its own history and the three bands above.
- **A 96 at the 0th correlation percentile is a statement about *this sample*,**
  which begins in 2018. It does not mean correlation is the lowest since 1928.

---

## 2. The four regime tiles

Each tile shows a **level**, its **percentile** against the same history, and a
**sparkline** of that history. The percentile is doing most of the work — "0.13"
means nothing until you know it is the lowest reading in eight years.

### Dispersion — `1.13%`, 92nd percentile

```
dailyDispersion_t = sampleStdev( r_1t … r_11t ) × 100      across the 11 sectors, one day
dispersion_t      = mean( dailyDispersion over the last 21 days )
```

**Reads as:** the standard deviation of the eleven sectors' returns on an
average day this month, in percent.

**Practically:** ~0.5% and the sectors are trading as one asset. ~1.1% (today)
and they are trading as eleven. This is the *raw material* of rotation — with no
dispersion there is nothing to rotate between, no matter what the rankings say.

**Careful:** dispersion rises in crashes as well as in rotations, because
correlated panic still moves defensives and cyclicals by different amounts. This
is why the score pairs it with correlation rather than using it alone.

### Avg. correlation — `0.13`, 0th percentile

```
for each of the 55 sector pairs:  pearson( 63 daily returns, 63 daily returns )
correlation_t = mean of those 55 values
```

**Reads as:** how much the eleven sectors moved together over the last quarter,
on a −1 to +1 scale.

**Practically:** this is the cleanest single read on the page. High (0.7+) means
money is moving in and out of *equities* wholesale and sector selection is
nearly irrelevant. Low (0.2−) means money is discriminating between sectors —
which is the definition of rotation, seen from the inside.

**Careful:** 55 pairs averaged into one number hides structure. Ten sectors
moving in lockstep with one wild outlier produces a middling average, same as
eleven mildly decorrelated ones.

### Sectors above 200d — `82%`, 39th percentile

```
breadth_t = (count of sectors whose close > their own 200-day SMA) / 11 × 100
```

**Reads as:** how many of the eleven are in a long-term uptrend. Only ever takes
twelve possible values (0, 9.1, 18.2, … 100).

**Practically:** the one tile on this page that *is* about direction rather than
relative standing. 82% is a broad advance. Below ~40% and leadership has
narrowed to a handful of sectors.

**Careful — this is a count, not a weight.** Six small sectors leading and five
large ones lagging still reads as 55%. It says nothing about how much of the
index's *capitalisation* is trending. The tile's percentile bar is deliberately
left neutral-coloured in both directions, because high breadth is good for the
index while low breadth is where the best *relative* opportunities have
historically been — colouring it would assert one of those over the other.

### Leadership spread — `22.7pp`, 61st percentile

```
rel_i = (3-month return of sector i) − (3-month return of SPY)
spread = max(rel) − min(rel), in percentage points
```

**Reads as:** the gap between the best and worst sector over the last quarter.

**Practically:** this is **the prize on offer for getting the ranking right**.
22.7pp means picking the right sector instead of the wrong one was worth 22.7
percentage points over three months. It is the most directly actionable tile:
when it is low, the whole page is a low-stakes exercise regardless of how
confident the rankings look.

**Careful:** it is a max-minus-min, so it is set entirely by two funds and tells
you nothing about the nine in the middle.

---

## 3. Rotation graph (RRG)

### How the two axes are built

On **weekly** bars, for each fund against SPY:

```
rs_t     = close_t / SPY_t                      relative strength, a raw ratio
fast_t   = SMA(rs, 4)                           ~1 month
slow_t   = SMA(rs, 26)                          ~6 months
rel_t    = fast_t / slow_t − 1                  strength vs its OWN trend
mom_t    = rel_t − rel_{t−4}                    4-week change in that

x  = crossSectionalZ( rel ) at each date        → horizontal axis
y  = crossSectionalZ( mom ) at each date        → vertical axis
```

Both axes are therefore in **cross-sectional standard deviations, with zero at
the group average**, recomputed independently at every weekly point — which is
what makes the tails comparable across time as well as across funds.

### The quadrants

|  | Momentum ≥ 0 | Momentum < 0 |
|---|---|---|
| **Strength ≥ 0** | **Leading** — strong and still strengthening | **Weakening** — still strong, losing it |
| **Strength < 0** | **Improving** — weak, but turning up | **Lagging** — weak and still weakening |

The idealised path is **clockwise**: improving → leading → weakening → lagging.
On this universe it genuinely tends that way — measured at **−0.126 radians per
week**, implying a full circuit in roughly **50 weeks**. Individual tails cut
corners and reverse constantly. A graph that always rotated cleanly would be a
graph with too much smoothing in it.

### Reading it practically

- **Horizontal position** = where a sector stands. **Vertical position** = where
  it is going. The vertical axis is the one carrying new information; the
  horizontal is largely what the momentum table already told you.
- **The interesting moves are the crossings**, not the positions. A fund pushing
  from Lagging into Improving is a change of state; a fund sitting deep in
  Leading is a fact you already knew.
- **Tail length changes the question.** 5w shows this month's turn. 20w shows a
  whole rotation arc and is where the clockwise pattern becomes visible.
- **Gridlines are one standard deviation apart.** Use them — order without
  distance is how "XLK is marginally ahead" gets read as "XLK is far ahead".
- **Switching to Industries renormalises within those seven funds only.** A
  fund's quadrant will differ between the two tiers, and that is correct, not a
  bug: it is being measured against a different peer group.

### What it does NOT mean

- **Nothing about direction.** In a falling market, the Leading quadrant is
  where the smallest losses are.
- **It is a reconstruction.** De Kempenaer's JdK RS-Ratio / RS-Momentum formulas
  are proprietary and have never been published. This is built from the
  documented *behaviour* and **will not agree with a StockCharts RRG point for
  point.** The quadrant a fund sits in should broadly match; its coordinates will
  not.
- **The Leading quadrant is not a buy list.** See §6 — on this sample it has
  carried a *negative* forward edge.

---

## 4. Momentum ranking

### Score — the composite

```
for each of 3M, 6M, 12-1M:
    excess_i = (own total return) − (SPY total return), in pp
    z_i      = crossSectionalZ(excess) across the 11 sectors

score_i = mean( z_3M , z_6M , z_12-1M )
rank    = descending order of score, 1 = strongest
```

**`12-1M` means:** the return from 252 trading days ago to **21 trading days
ago** — a year of return with the most recent month cut off *both* ends of the
window. This is the standard academic momentum definition (Jegadeesh & Titman
1993; the convention Fama-French use for UMD).

**`1M` is displayed but deliberately excluded from the score.** Returns over a
single month have historically *reversed* rather than continued (Jegadeesh
1990), which is precisely why the academic window stops a month short of today.
Averaging it in would net a reversal signal against three momentum ones and
partly cancel both.

**Worked example, XLK on 2026-08-21:**

```
                 excess      cross-sectional mean / sd        z
   3M            −0.6          mean  1.22   sd  6.41       −0.28
   6M           +18.8          mean −5.34   sd 10.23       +2.36
   12-1M        +21.1          mean −2.36   sd 14.41       +1.63

   score = (−0.28 + 2.36 + 1.63) / 3 = 1.234      →  rank 1
```

Note what that shows: XLK is rank 1 **despite being slightly below average over
three months**. Its score is carried almost entirely by the 6M and 12-1M legs.
That is visible in the row and invisible in the rank — which is the reason the
score column is printed to two decimals rather than just the rank.

**Reading the score's magnitude:** it is in standard-deviation units, capped
near ±3.16. Above ~1.0 is a genuinely strong reading. **Gaps between adjacent
ranks are often smaller than 0.05** — today ranks 5 and 6 are separated by 0.124
while ranks 1 and 2 are separated by 0.018. Do not read an ordering more finely
than the scores support.

### The other columns

| Column | Formula | How to read it |
|---|---|---|
| **#** | rank of `score` | 1 = strongest of the 11 (or 7, on the industry tier) |
| **Δ1M** | rank now vs rank 21 trading days ago, recomputed from scratch | **The actual rotation signal.** ▲ = improved. A rank is a snapshot; a 4-place move in a month is what this page exists to surface |
| **1M / 3M / 6M / 12-1M** | excess return vs SPY, pp | 1M is the reversal column — treat it opposite to the others |
| **RS vs SPY, 1Y** | last 53 weekly `close/SPY` values, rebased to 100 | Shape, not level. Ending at 117 = 17% ahead of SPY over the year |
| **Score** | above | σ units, not percent |
| **vs 50d / vs 200d** | `close / SMA(close, n) − 1`, in percent | Absolute trend, not relative. A sector can be rank 1 and below its own 200d in a bear market |
| **Quadrant** | from the RRG | Carried over so the two panels can be read as one |

**The most useful pairing on this table is Score against Δ1M.** High score with
a rising rank is an established leader still gaining. High score with a falling
rank is a leader being sold — which the trailing windows will not show for
months.

---

## 5. Leadership heatmap

```
cell(sector, month) = (sector's monthly total return) − (SPY's monthly total return), in pp
```

15 months. Colour saturates at **±6pp** — a fixed cap, not normalised to the
grid's extreme, so a cell means the same thing this week as last week and a
single violent month cannot flatten every other one to invisibility. The final
column is the **month still in progress** and is marked `*`; it is not
comparable with the completed months beside it.

**What this shows that nothing else does: persistence.** Every other panel is
built from trailing windows, so a single explosive month props a sector up in
the 3M, 6M and 12M columns simultaneously and looks like three pieces of
evidence. Here you can see whether it was one month or six.

**Practically:** scan rows, not columns. Four green months in a row is a trend.
One +15 surrounded by noise is an event, and any trailing-window ranking built
on it is measuring that single event three times.

---

## 6. "Has any of this worked?"

For every week in the sample, each sector is placed in an RRG quadrant and a
momentum tercile, and its **forward** return is recorded — then demeaned across
the eleven sectors at that date.

```
edge_i = forwardReturn_i − mean(forwardReturn over the 11 sectors)
```

**Why demean.** The eleven sectors are equally weighted here but SPY is not. In
any stretch where the largest sector leads, every sector's equal-weighted excess
return against SPY is negative, and all four quadrant averages come out below
zero whether the signal worked or not. Against the cross-sectional mean, the
question becomes the one actually being asked: **given two sectors, did the
signal tell you which to hold?**

**Columns:** `+4w / +13w / +26w` are mean edge in pp. `Hit` is the share of
observations with a positive edge at the *longest* horizon. `n` is observations.

**Momentum buckets** are top 3, middle 5, bottom 3 by composite score.

### Reading it honestly

- **A number near zero means the signal did not separate anything.** That is the
  most common outcome and it is a real result.
- **`n` is not sample size.** 1,140 observations over 349 weeks across 11
  correlated sectors is nowhere near 1,140 independent draws — a 26-week horizon
  over seven years is roughly **fourteen genuinely separate periods**. No
  significance test is shown because none of these would survive one.
- **It is in-sample.** The signals were not *fitted* to this data, but they are
  scored on the only history the page has. There is no out-of-sample check.
- **On the current sample the Leading quadrant carries a negative edge at every
  horizon.** That does not prove sector relative strength mean-reverts. It does
  mean the graph above should be read as a description of where things stand,
  not as a list of what to buy.

This panel exists because everything else on the page is persuasive by
construction. A rotation graph with tails looks like an explanation whether or
not the quadrants carry information.

---

## 7. Cross-cutting spreads

Each row is `numerator ÷ denominator` as a single price series, so the returns
shown are the **spread's own return**. XLY/XLP up 5% over a month means
discretionary beat staples by five points — regardless of whether either rose.

| Spread | Rising means |
|---|---|
| IWM/SPY | Small caps leading |
| IWF/IWD | Growth leading (falling = value) |
| RSP/SPY | Gains broadening past the mega-caps |
| XLY/XLP | Risk appetite rising |
| HYG/IEF | Credit risk being **bought** — risk-on |
| SOXX/SPY | The cycle's usual leader is leading |
| MTUM/SPY | Trends persisting; also crowding building |
| TLT/SPY | Bid for duration — growth scare or cuts being priced |

**`vs 50d`** is `ratio / SMA(ratio, 50) − 1`. This is what separates a trend from
a bounce: a spread can be up over three months and rolling over right now, and
the two columns disagreeing is the informative case.

The **Reading** column describes the **three-month** direction, not the latest
tick — a spread down on the week but up on the quarter has wobbled, not changed
its message. It is a description, never a position.

These exist because a small-cap rotation shows up in the sector grid only as a
faint tilt smeared across every cyclical sector at once. Here it is one line.

---

## 8. Business cycle

The only non-price panel on the page, and it sits *after* the price signals
deliberately: CFNAI lands with a month's lag on a series that is itself a
three-month average, so it can only ever explain a rotation the price data has
already shown.

### Inputs (FRED, 10-year window)

| Series | What it is | Direction column |
|---|---|---|
| `CFNAIMA3` | Chicago Fed National Activity Index, 3-month avg — 85 indicators, zero-centred on trend growth | 3 observations (~3 months) |
| `BAMLH0A0HYM2` | ICE BofA high-yield OAS | 63 observations |
| `T10Y2Y` | 10Y−2Y treasury spread | 63 observations |
| `CPIAUCSL` | CPI, year-over-year | 3 observations |
| `UNRATE` | Unemployment rate | 3 observations |

**ISM PMI is the conventional input and is not here** — ISM licenses it
commercially and it was pulled from FRED in 2016. CFNAI-MA3 stands in: broader,
and roughly a month slower.

> The **middle (change) column is coloured by arithmetic sign alone.** A rising
> unemployment rate shows green because the number went up. This is called out
> under the table on the page too.

### The classification ladder

Evaluated top to bottom; the **first** rule that matches wins, and the panel
prints which one it was.

```
1.  CFNAI < −0.70                                        → RECESSION
        (the Chicago Fed's own published threshold, not an invented cutoff)

2.  CFNAI < −0.20  AND  HY spread pctile > 80  AND  not rising   → RECESSION

3.  CFNAI < −0.20                                → EARLY if rising, else RECESSION

    ── from here growth is at or above trend ──

    lateEvidence = count of:
        10Y−2Y curve < 0.25%
        HY spread percentile < 20        (spreads unusually tight)
        CPI > 3%
        unemployment up > 0.2pp in 3 months

4.  rising AND CFNAI < 0.20 AND lateEvidence == 0         → EARLY
5.  not rising AND lateEvidence ≥ 2                       → LATE
6.  lateEvidence ≥ 3                                      → LATE
7.  otherwise                                             → MID
```

`CFNAI_TREND_BAND = 0.20` — inside ±0.20 growth is "at trend", not above or
below it.

### Sector playbook and the agreement check

The phase→sector mapping is **quoted from Fidelity's business cycle framework**,
not derived here. What *is* computed is whether the market agrees:

```
agreement = mean rank of the phase's laggard sectors
          − mean rank of the phase's favoured sectors
```

Rank 1 is strongest, so a **positive** number means the framework's favoured
sectors are the ones actually leading.

| agreement | Verdict |
|---|---|
| ≥ 3 | The ranking matches the framework |
| 1 – 3 | A mild tilt, no more than that |
| −1 – 1 | The market is not distinguishing between them |
| < −1 | **The classification and the tape disagree** |

**The disagreement case is the useful one.** It means one of three things: the
classification is early, the market has not repriced yet, or this cycle does not
rhyme with the ones the framework was drawn from. The panel cannot tell you
which — but it can tell you not to trust the phase label on its own.

**Four indicators cannot identify a business-cycle phase reliably**, and the
boundaries are not sharp in the underlying economy either. Every input is
printed so the label can be argued with rather than merely believed.

---

## 9. The returns table (bottom of page)

The original, unchanged. Total return per window (1D/1W/1M/3M/YTD/1Y), toggled
between **vs S&P 500** (percentage points above/below SPY) and **Total return**
(percent). YTD measures from the **last close of the previous year**, not the
first trading day of January.

A cell is **`—` rather than approximated** when a fund's history does not span
the window. That null is the point: silently measuring from the oldest available
bar turns "this fund is four months old" into a YTD number that looks like
everyone else's and is comparable to none of them.

The **Benchmark** strip at the very bottom gives SPY's own returns — without it,
a screen of green relative figures is unreadable, because every sector can beat
an index that fell.

---

## Reading the page in sixty seconds

1. **Rotation Conditions.** Under 40? Stop — the rest is noise this week.
2. **Leadership spread.** How much is getting this right actually worth?
3. **Δ1M column** in the momentum table. What moved, not what is on top.
4. **RRG, 20w tail.** Anything crossing an axis?
5. **Heatmap rows** for anything at the top. One month or six?
6. **Efficacy panel** before concluding anything.

## What this page cannot tell you

- **Whether to buy anything.** Every signal is relative and, on the sample
  available, several of them have no measurable edge.
- **Direction.** Only the returns table and the `vs 200d` column speak to it.
- **Anything about flows.** Rotation is inferred entirely from price. Actual
  ETF creations/redemptions are not free, and raw share volume tracks index
  mechanics far more than conviction — which is why no volume figure appears
  anywhere on this page.
- **Anything about valuation, earnings, or why.** The cycle panel is the closest
  it gets, and it is four lagging macro series and a quoted framework.
