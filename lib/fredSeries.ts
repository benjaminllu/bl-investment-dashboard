/**
 * Full-history observations for one FRED series, oldest first.
 *
 * The Positioning panels need series that are not in the macro page's
 * FRED_SERIES list, so `fetchFredHistory` (which looks its id up there) does
 * not fit. Throws on failure so a caller fetching several series can treat the
 * set as one unit.
 */
export interface Obs {
  date: string;
  value: number;
}

export async function fetchFredSeries(id: string, apiKey: string): Promise<Obs[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${id}&api_key=${apiKey}&file_type=json&sort_order=asc`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const data = await res.json();
  return (data.observations ?? [])
    .map((o: { date: string; value: string }) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o: Obs) => Number.isFinite(o.value));
}
