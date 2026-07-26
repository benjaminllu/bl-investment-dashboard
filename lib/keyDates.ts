export interface MacroKeyDates {
  nextFomc: string | null;
  nextCpi: string | null;
  nextJobsReport: string | null;
}

// FRED tracks scheduled *release dates* for each of its data releases, not
// just the underlying data -- a separate endpoint from series/observations.
// 326 (Summary of Economic Projections) only covers the 4 SEP-associated
// FOMC meetings a year, not all 8; there's no free source (FRED or Finnhub's
// free tier) covering every meeting, so this is deliberately SEP-only.
const RELEASE_IDS = {
  fomcSep: 326,
  cpi: 10,
  jobsReport: 50,
};

async function fetchNextReleaseDate(releaseId: number, apiKey: string): Promise<string | null> {
  try {
    const today = new Date();
    const windowEnd = new Date(today);
    windowEnd.setFullYear(windowEnd.getFullYear() + 2);
    const todayStr = today.toISOString().slice(0, 10);

    const url =
      `https://api.stlouisfed.org/fred/release/dates` +
      `?release_id=${releaseId}&api_key=${apiKey}&file_type=json` +
      `&include_release_dates_with_no_data=true&sort_order=asc` +
      `&realtime_end=${windowEnd.toISOString().slice(0, 10)}`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[keyDates] release ${releaseId} failed: HTTP ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const dates: { date: string }[] = data.release_dates ?? [];
    return dates.find((d) => d.date >= todayStr)?.date ?? null;
  } catch (e) {
    console.error(`[keyDates] release ${releaseId} threw:`, e);
    return null;
  }
}

export async function fetchMacroKeyDates(): Promise<MacroKeyDates> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return { nextFomc: null, nextCpi: null, nextJobsReport: null };

  const [nextFomc, nextCpi, nextJobsReport] = await Promise.all([
    fetchNextReleaseDate(RELEASE_IDS.fomcSep, apiKey),
    fetchNextReleaseDate(RELEASE_IDS.cpi, apiKey),
    fetchNextReleaseDate(RELEASE_IDS.jobsReport, apiKey),
  ]);

  return { nextFomc, nextCpi, nextJobsReport };
}
