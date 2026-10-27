/**
 * Prediction-market odds from Polymarket's public APIs, no key: Gamma for
 * markets and current prices, CLOB for price history. A Yes price is the
 * market's probability, 0–1.
 *
 * Events are found by title pattern rather than by slug, because each Fed
 * meeting and CPI release is a new event with a new slug; the panel moves on
 * to the next one with no code change.
 */
const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
const REVALIDATE = 900;

/** Below this much traded, a market is a handful of bettors, not a consensus. */
export const THIN_VOLUME = 50_000;

type GammaMarket = {
  question: string;
  groupItemTitle?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volume?: string;
  closed?: boolean;
};
type GammaEvent = { title: string; endDate: string; volume?: number | string; closed?: boolean; markets?: GammaMarket[] };

export type Outcome = { label: string; p: number; pWeekAgo: number | null };

export type FedMeeting = {
  /** Decision day in ET, e.g. "28 Oct". */
  date: string;
  volume: number;
  outcomes: Outcome[];
  /** Probability-weighted move in bps; "50+" buckets count as 50. */
  expectedBps: number;
  expectedBpsWeekAgo: number | null;
};

export type BinaryOdds = { label: string; volume: number; p: number; pWeekAgo: number | null };

export type CpiOdds = {
  title: string;
  volume: number;
  /** Probability-weighted print, in percent. */
  expected: number;
  expectedWeekAgo: number | null;
  mostLikely: Outcome;
};

export type PredictionMarkets = {
  fed: FedMeeting[];
  recession: BinaryOdds[];
  cpi: CpiOdds | null;
  unavailable: boolean;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

async function searchEvents(q: string): Promise<GammaEvent[]> {
  const url = `${GAMMA}/public-search?q=${encodeURIComponent(q)}&events_status=active&limit_per_type=20`;
  const data = await getJson<{ events?: GammaEvent[] }>(url);
  const now = Date.now();
  return (data.events ?? [])
    .filter((e) => !e.closed && Date.parse(e.endDate) > now)
    .sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate));
}

const yesPrice = (m: GammaMarket): number => Number(JSON.parse(m.outcomePrices ?? "[]")[0]);
const yesToken = (m: GammaMarket): string | undefined => JSON.parse(m.clobTokenIds ?? "[]")[0];

/** The Yes price at the start of the last week, or null without history. */
async function priceWeekAgo(m: GammaMarket): Promise<number | null> {
  const token = yesToken(m);
  if (!token) return null;
  try {
    const { history } = await getJson<{ history: { t: number; p: number }[] }>(
      `${CLOB}/prices-history?market=${token}&interval=1w&fidelity=360`
    );
    return history.length > 0 ? history[0].p : null;
  } catch {
    return null;
  }
}

async function outcomes(markets: GammaMarket[]): Promise<Outcome[]> {
  const open = markets.filter((m) => !m.closed && Number.isFinite(yesPrice(m)));
  const weekAgo = await Promise.all(open.map(priceWeekAgo));
  return open.map((m, i) => ({ label: m.groupItemTitle ?? m.question, p: yesPrice(m), pWeekAgo: weekAgo[i] }));
}

/** Probability-weighted mean of `value(label)`, renormalised because prices need not sum to exactly 1. */
export function weightedMean(
  outs: Outcome[],
  value: (label: string) => number | null,
  which: "p" | "pWeekAgo"
): number | null {
  let sum = 0;
  let weight = 0;
  for (const o of outs) {
    const v = value(o.label);
    const p = o[which];
    if (v === null || p === null) continue;
    sum += v * p;
    weight += p;
  }
  return weight > 0 ? sum / weight : null;
}

/** "25 bps decrease" → −25, "50+ bps increase" → 50, "No change" → 0. */
export function fedBps(label: string): number | null {
  if (/no change/i.test(label)) return 0;
  const m = label.match(/(\d+)\+?\s*bps\s*(increase|decrease)/i);
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === "decrease" ? -1 : 1);
}

/** "≤2.2%" → 2.2, "2.6%" → 2.6, "3.0%+" → 3.0: an open-ended bin counts at its edge. */
export function cpiValue(label: string): number | null {
  const m = label.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

const etDay = (iso: string) =>
  new Date(Date.parse(iso) - 6 * 3_600_000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "America/New_York",
  });

async function fetchFed(): Promise<FedMeeting[]> {
  const events = (await searchEvents("Fed decision")).filter((e) => /^Fed Decision in \w+\?$/.test(e.title));
  // The next three meetings with real money on them; further out is too thin to read.
  const liquid = events.filter((e) => Number(e.volume ?? 0) >= THIN_VOLUME).slice(0, 3);
  return Promise.all(
    liquid.map(async (e) => {
      const outs = await outcomes(e.markets ?? []);
      return {
        // endDate is the small hours of the day after the decision, so step back before formatting.
        date: etDay(e.endDate),
        volume: Number(e.volume ?? 0),
        outcomes: outs,
        expectedBps: weightedMean(outs, fedBps, "p") ?? 0,
        expectedBpsWeekAgo: weightedMean(outs, fedBps, "pWeekAgo"),
      };
    })
  );
}

async function fetchRecession(): Promise<BinaryOdds[]> {
  const events = (await searchEvents("US recession by end of")).filter((e) =>
    /^US recession by end of \d{4}\?$/.test(e.title)
  );
  return Promise.all(
    events.slice(0, 2).map(async (e) => {
      const m = (e.markets ?? [])[0];
      return {
        label: `By end of ${e.title.match(/\d{4}/)?.[0]}`,
        volume: Number(e.volume ?? 0),
        p: yesPrice(m),
        pWeekAgo: await priceWeekAgo(m),
      };
    })
  );
}

async function fetchCpi(): Promise<CpiOdds | null> {
  const event = (await searchEvents("Core CPI YoY")).find((e) => /^Core CPI YoY - /.test(e.title));
  if (!event) return null;
  const outs = await outcomes(event.markets ?? []);
  const expected = weightedMean(outs, cpiValue, "p");
  if (expected === null || outs.length === 0) return null;
  return {
    title: event.title.replace(/^Core CPI YoY - /, "Core CPI YoY, "),
    volume: Number(event.volume ?? 0),
    expected,
    expectedWeekAgo: weightedMean(outs, cpiValue, "pWeekAgo"),
    mostLikely: outs.reduce((a, b) => (b.p > a.p ? b : a)),
  };
}

export async function fetchPredictionMarkets(): Promise<PredictionMarkets> {
  const [fed, recession, cpi] = await Promise.allSettled([fetchFed(), fetchRecession(), fetchCpi()]);
  const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T => {
    if (r.status === "fulfilled") return r.value;
    console.error("[polymarket] fetch failed:", r.reason);
    return fallback;
  };
  const out = { fed: ok(fed, []), recession: ok(recession, []), cpi: ok(cpi, null) };
  return { ...out, unavailable: out.fed.length === 0 && out.recession.length === 0 && out.cpi === null };
}
