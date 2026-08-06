/**
 * Sector and style classification for funds, which no quote provider supplies.
 *
 * Finnhub's `/stock/profile2` returns `{}` for every ETF and mutual fund, so a
 * fund has no sector and no market cap and lands in `Unclassified` on both
 * charts. On a book holding VOO, VFIAX and GDX that was 32.8% of the sector
 * pie — its largest slice, and a misleading one, because `Unclassified`
 * conflates two different things:
 *
 *   "we have no data for this"      — genuinely unknown
 *   "this is deliberately diverse"  — a known, deliberate property
 *
 * A fund in the second category is not an absence of information.
 *
 * Deliberately a small hand-maintained table rather than an API. Fund mandates
 * change on the order of never, and the alternative — decomposing holdings into
 * their constituents — needs per-fund holdings data that no free source
 * provides, and would still have to be mapped onto Finnhub's taxonomy.
 *
 * Both fields are optional, and omitting one is the point. A classification is
 * only recorded where the fund's own mandate makes it a fact rather than an
 * estimate; anything else stays Unclassified, which is the honest answer.
 */

export type FundClassification = {
  /** Slots into the same taxonomy as `stock_fundamentals.sector` (finnhubIndustry). */
  sector?: string;
  /**
   * Size × style bucket, matching the labels factorComposition produces.
   * Only set where the mandate fixes it — an S&P 500 fund IS large blend.
   */
  factor?: string;
  /** Why this classification is defensible, kept next to the claim. */
  note: string;
};

/** Its own sector rather than a real one: honest about being many sectors at once. */
export const BROAD_INDEX = "Broad Index";

export const FUND_CLASSIFICATIONS: Record<string, FundClassification> = {
  // S&P 500 trackers. The style box is not an estimate here — large-cap blend
  // is precisely what the index is — but no single sector applies, so the
  // sector chart gets an explicit "many sectors" category instead of a guess.
  VOO: { sector: BROAD_INDEX, factor: "Large Blend", note: "S&P 500 ETF" },
  VFIAX: { sector: BROAD_INDEX, factor: "Large Blend", note: "S&P 500 index fund, Admiral" },
  SPY: { sector: BROAD_INDEX, factor: "Large Blend", note: "S&P 500 ETF" },
  IVV: { sector: BROAD_INDEX, factor: "Large Blend", note: "S&P 500 ETF" },
  VTI: { sector: BROAD_INDEX, factor: "Large Blend", note: "total US market ETF" },

  // Nasdaq-100: large-cap, and growth-tilted by construction rather than by
  // measurement — the index excludes financials and skews heavily to tech.
  QQQ: { sector: BROAD_INDEX, factor: "Large Growth", note: "Nasdaq-100 ETF" },

  // Single-sector funds. Sector is a fact of the mandate; size and style are
  // NOT, so `factor` is deliberately absent — GDX spans large miners down to
  // juniors, and picking a bucket would be inventing an exposure. Those dollars
  // stay Unclassified on the factor chart, which is correct.
  GDX: { sector: "Metals & Mining", note: "gold miners ETF — sector pure-play, size mixed" },
  GDXJ: { sector: "Metals & Mining", note: "junior gold miners ETF" },
  XLE: { sector: "Energy", note: "energy sector SPDR" },
  XLF: { sector: "Financial Services", note: "financial sector SPDR" },
  XLK: { sector: "Technology", note: "technology sector SPDR" },
  SMH: { sector: "Semiconductors", note: "semiconductor ETF" },
  XBI: { sector: "Biotechnology", note: "biotech ETF" },

  // Single-country equity: diversified across sectors within one market, so it
  // is the same "many sectors" case as a broad index.
  EWY: { sector: BROAD_INDEX, note: "South Korea equity ETF" },
};

/** Sector for a fund, or null when the ticker is not a classified fund. */
export function fundSector(ticker: string): string | null {
  return FUND_CLASSIFICATIONS[ticker.toUpperCase()]?.sector ?? null;
}

/** Size × style for a fund, or null — including for funds whose mandate fixes no style. */
export function fundFactor(ticker: string): string | null {
  return FUND_CLASSIFICATIONS[ticker.toUpperCase()]?.factor ?? null;
}

export function isClassifiedFund(ticker: string): boolean {
  return ticker.toUpperCase() in FUND_CLASSIFICATIONS;
}
