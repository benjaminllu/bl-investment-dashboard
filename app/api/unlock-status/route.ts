import { NextResponse } from "next/server";
import { isPortfolioUnlocked } from "@/lib/portfolioLock";

/**
 * Lets static pages ask whether this browser is unlocked, so the home page can
 * show its watchlist edit controls without reading the cookie during render,
 * which would make it dynamic for every visitor (see app/layout.tsx).
 *
 * Answering this reveals nothing: the actions re-check the cookie themselves.
 */
export async function GET() {
  return NextResponse.json(
    { unlocked: await isPortfolioUnlocked() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
