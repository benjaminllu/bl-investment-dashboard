import { fetchIndexRows, withFresherSp } from "@/lib/indexQuotes";
import { fetchHyperliquidSp } from "@/lib/hyperliquid";
import { fetchTreasuryYields } from "@/lib/fred";
import { Tape } from "./parts";

/**
 * Fetches what the tape shows, so AppShell (a client component) can be handed a
 * finished node instead of the data.
 *
 * Its own async component, wrapped in Suspense by the root layout: awaiting
 * these there would block every route's first byte on them. This is the same
 * arrangement the old MarketBanner had (revalidate 300). The ES futures line
 * was dropped on 2026-10-23 as near-duplicate of SPY.
 */
/** Module-level so the clock read is not an impure call during render. */
function nowSeconds(): number {
  return Date.now() / 1000;
}

export default async function TapeServer() {
  const [indices, perp, yields] = await Promise.all([
    fetchIndexRows(),
    fetchHyperliquidSp(),
    fetchTreasuryYields(),
  ]);

  return <Tape indices={withFresherSp(indices, perp, nowSeconds())} yields={yields} />;
}
