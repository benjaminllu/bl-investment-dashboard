import { trimFloats } from "./precision";
import { formatDay, rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * Hyperliquid's "xyz" perps (deployed by trade.xyz), which trade 24/7, read
 * from the public info API: no key, 1200 request weight per minute per IP,
 * and every call here costs 20 plus a little per row returned.
 *
 * These are perpetual contracts, not the index. They track it through funding
 * and an oracle, and outside US hours trade.xyz's oracle is its own estimate,
 * so the price is a small crypto-native crowd's read of where the index
 * would trade, not a quote. Open interest on the S&P contract was ~$410M on
 * 2026-10-27, tiny next to CME.
 */
const INFO_URL = "https://api.hyperliquid.xyz/info";
const SP = "xyz:SP500";
const NDX = "xyz:XYZ100";
const HOURS_PER_YEAR = 24 * 365;
const SPARK_DAYS = 60;

type AssetCtx = {
  markPx: string;
  oraclePx: string;
  funding: string;
  premium: string | null;
  openInterest: string;
  dayNtlVlm: string;
};

type FundingRow = { fundingRate: string; premium: string; time: number };

async function info<T>(body: object, revalidate: number): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchXyzMarkets(): Promise<Map<string, AssetCtx>> {
  const [meta, ctxs] = await info<[{ universe: { name: string }[] }, AssetCtx[]]>(
    { type: "metaAndAssetCtxs", dex: "xyz" },
    300
  );
  return new Map(meta.universe.map((u, i) => [u.name, ctxs[i]]));
}

/** The last official S&P 500 print and whether the regular session is open now. */
async function fetchSpxClose(): Promise<{ close: number; closeTime: number; sessionOpen: boolean } | null> {
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d", {
      next: { revalidate: 300 },
      // Yahoo rejects requests without a browser-like agent.
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const regular = meta?.currentTradingPeriod?.regular;
    if (typeof meta?.regularMarketPrice !== "number" || !regular) return null;
    const now = Date.now() / 1000;
    return {
      close: meta.regularMarketPrice,
      closeTime: meta.regularMarketTime,
      sessionOpen: now >= regular.start && now < regular.end,
    };
  } catch {
    return null;
  }
}

/**
 * The tape's stand-in for SPY while SPY's quote is stale: the perp's price,
 * and its move since the last official S&P 500 close.
 */
export async function fetchHyperliquidSp(): Promise<{ price: number | null; changePct: number | null }> {
  try {
    const [markets, spx] = await Promise.all([fetchXyzMarkets(), fetchSpxClose()]);
    const price = Number(markets.get(SP)?.markPx);
    if (!Number.isFinite(price) || price <= 0) return { price: null, changePct: null };
    return { price, changePct: spx ? (price / spx.close - 1) * 100 : null };
  } catch {
    return { price: null, changePct: null };
  }
}

/** Hourly funding and premium since `since`, paged: the endpoint returns at most 500 rows. */
async function fetchFundingHistory(coin: string, since: number): Promise<FundingRow[]> {
  const rows: FundingRow[] = [];
  let start = since;
  for (let page = 0; page < 20; page++) {
    const batch = await info<FundingRow[]>({ type: "fundingHistory", coin, startTime: start }, 3600);
    rows.push(...batch);
    if (batch.length < 500) break;
    start = batch[batch.length - 1].time + 1;
  }
  return rows;
}

/** Hourly rows to one mean per UTC day, oldest first. */
function dailyMeans(rows: FundingRow[], pick: (r: FundingRow) => number): { date: string; value: number }[] {
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const v = pick(r);
    if (!Number.isFinite(v)) continue;
    const day = new Date(r.time).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), v]);
  }
  return [...byDay].map(([date, vs]) => ({ date, value: vs.reduce((s, v) => s + v, 0) / vs.length }));
}

const annualisedPct = (r: FundingRow) => Number(r.fundingRate) * HOURS_PER_YEAR * 100;
const premiumPct = (r: FundingRow) => Number(r.premium) * 100;
const usdShort = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}bn` : `$${Math.round(n / 1e6)}M`);

export async function fetchHyperliquidPositioning(): Promise<PositioningSource> {
  // Rounded to a UTC midnight because the request body is the cache key: a
  // start that moved every render would refetch ~20 pages every time.
  const since = Math.floor(Date.now() / 86_400_000 - 400) * 86_400_000;
  let markets, spx, spFunding, ndxFunding;
  try {
    [markets, spx, spFunding, ndxFunding] = await Promise.all([
      fetchXyzMarkets(),
      fetchSpxClose(),
      fetchFundingHistory(SP, since),
      fetchFundingHistory(NDX, since),
    ]);
  } catch (e) {
    console.error("[hyperliquid] fetch failed:", e);
    return UNAVAILABLE;
  }

  const sp = markets.get(SP);
  const ndx = markets.get(NDX);
  if (!sp || !ndx || spFunding.length === 0) return UNAVAILABLE;

  const mark = Number(sp.markPx);
  const spFundingDaily = dailyMeans(spFunding, annualisedPct);
  const ndxFundingDaily = dailyMeans(ndxFunding, annualisedPct);
  const spPremiumDaily = dailyMeans(spFunding, premiumPct);
  const last = <T,>(xs: T[]) => xs[xs.length - 1];

  const gap =
    spx && !spx.sessionOpen
      ? {
          value: `${signed((mark / spx.close - 1) * 100, 2)}%`,
          detail: `perp ${mark.toFixed(1)} vs S&P 500 close ${spx.close.toFixed(2)} on ${formatDay(new Date(spx.closeTime * 1000).toISOString())}`,
        }
      : {
          value: spx ? "Session open" : "—",
          detail: spx
            ? "The perp tracks the index live during the session; this reads the gap only while the market is closed."
            : "The last S&P 500 close could not be fetched.",
        };

  return trimFloats({
    asOf: `${spx?.sessionOpen ? "session open" : "market closed"} · live`,
    unavailable: false,
    readings: [
      {
        id: "hl-gap",
        label: "S&P 500 perp vs last close",
        value: gap.value,
        detail: gap.detail,
        percentile: null,
        since: null,
        record: null,
        history: [],
        read: "Where the 24/7 market has moved the S&P 500 since the last official close: an early read on the next open, overnight and at weekends.",
      },
      {
        id: "hl-sp-funding",
        label: "S&P 500 perp funding",
        value: `${signed(last(spFundingDaily).value, 1)}%/yr`,
        detail: "today's average (UTC), annualised",
        ...rankLatest(spFundingDaily),
        history: spFundingDaily.slice(-SPARK_DAYS).map((d) => d.value),
        read: "Positive means buyers pay sellers to hold their positions, so the crowd is betting on a rise; negative means the reverse.",
      },
      {
        id: "hl-ndx-funding",
        label: "Nasdaq-style XYZ100 funding",
        value: `${signed(last(ndxFundingDaily).value, 1)}%/yr`,
        detail: "today's average (UTC), annualised",
        ...rankLatest(ndxFundingDaily),
        history: ndxFundingDaily.slice(-SPARK_DAYS).map((d) => d.value),
        read: "The same measure for trade.xyz's index of the top 100 US non-financial companies, close to the Nasdaq-100.",
      },
      {
        id: "hl-sp-premium",
        label: "S&P 500 perp premium",
        value: `${signed(Number(sp.premium ?? 0) * 100, 3)}%`,
        detail: "perp price vs trade.xyz's reference price, now",
        ...rankLatest(spPremiumDaily),
        history: spPremiumDaily.slice(-SPARK_DAYS).map((d) => d.value),
        read: "Above zero, traders are paying up to be long; below zero, to be short. It drives the funding rate.",
      },
      {
        id: "hl-sp-oi",
        label: "S&P 500 perp open interest",
        value: usdShort(Number(sp.openInterest) * mark),
        detail: `24h volume ${usdShort(Number(sp.dayNtlVlm))}`,
        percentile: null,
        since: null,
        record: null,
        history: [],
        read: "How much is riding on this market. Small next to CME's S&P futures, so treat the readings above as one crowd's view.",
      },
    ],
  });
}
