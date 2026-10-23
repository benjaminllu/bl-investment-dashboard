import { fetchIndexRows } from "@/lib/indexQuotes";
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
export default async function TapeServer() {
  const [indices, yields] = await Promise.all([fetchIndexRows(), fetchTreasuryYields()]);

  return <Tape indices={indices} yields={yields} />;
}
