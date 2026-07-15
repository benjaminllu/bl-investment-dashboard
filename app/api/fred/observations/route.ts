import { NextRequest, NextResponse } from "next/server";
import { fetchFredHistory, FRED_SERIES, FRED_RANGES, type FredRange } from "@/lib/fred";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const series = searchParams.get("series");
  const range = searchParams.get("range");

  if (!series || !FRED_SERIES.some((s) => s.id === series)) {
    return NextResponse.json({ error: "Unknown series" }, { status: 400 });
  }
  if (!range || !FRED_RANGES.includes(range as FredRange)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const observations = await fetchFredHistory(series, range as FredRange);
  return NextResponse.json({ observations });
}
