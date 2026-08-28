import { fetchIndexRows, fetchSpFutures } from "@/lib/indexQuotes";
import { fetchTreasuryYields } from "@/lib/fred";
import { Tape } from "./parts";

/**
 * Fetches what the tape shows, so AppShell (a client component) can be handed a
 * finished node instead of the data.
 *
 * Its own async component, wrapped in Suspense by the root layout: awaiting
 * these three there would block every route's first byte on them. This is the
 * same arrangement the old MarketBanner had, and the same three cached fetches
 * it made (revalidate 300).
 */
export default async function TapeServer() {
  const [indices, futures, yields] = await Promise.all([
    fetchIndexRows(),
    fetchSpFutures(),
    fetchTreasuryYields(),
  ]);

  return <Tape indices={indices} futures={futures} yields={yields} />;
}
