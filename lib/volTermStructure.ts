import { trimFloats } from "./precision";
import { fetchFredSeries } from "./fredSeries";
import { formatDay, rankLatest, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * VIX against VIX3M, both daily closes from FRED (VIXCLS since 1990, VXVCLS
 * since 2007-12-04, confirmed 2026-10-17).
 *
 * The ratio, not either level: normally the market pays more for three months
 * of protection than for one, so the ratio sits below 1. Above 1 the curve is
 * inverted, which is what acute stress looks like from the options market.
 */
const SPARK_DAYS = 252;

export async function fetchVolTermStructure(): Promise<PositioningSource> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return UNAVAILABLE;

  let vix, vix3m;
  try {
    [vix, vix3m] = await Promise.all([
      fetchFredSeries("VIXCLS", apiKey),
      fetchFredSeries("VXVCLS", apiKey),
    ]);
  } catch (e) {
    console.error("[vol term] fetch failed:", e);
    return UNAVAILABLE;
  }

  const vixByDate = new Map(vix.map((o) => [o.date, o.value]));
  const ratio = vix3m
    .filter((o) => o.value > 0 && vixByDate.has(o.date))
    .map((o) => ({ date: o.date, value: (vixByDate.get(o.date) as number) / o.value }));
  if (ratio.length < SPARK_DAYS) return UNAVAILABLE;

  const last = ratio[ratio.length - 1];
  const inverted = ratio.slice(-20).filter((o) => o.value > 1).length;

  return trimFloats({
    asOf: formatDay(last.date),
    unavailable: false,
    readings: [
      {
        id: "vix-vix3m",
        label: "VIX / VIX3M",
        value: last.value.toFixed(2),
        detail: `VIX ${vixByDate.get(last.date)?.toFixed(1)} · VIX3M ${vix3m[vix3m.length - 1].value.toFixed(1)} · inverted ${inverted} of last 20 days`,
        ...rankLatest(ratio),
        history: ratio.slice(-SPARK_DAYS).map((o) => o.value),
        read: "Below 1 is the normal upward-sloping curve. Above 1 the market is paying more for one month of protection than three: acute stress, which has tended to clear quickly.",
      },
    ],
  });
}
