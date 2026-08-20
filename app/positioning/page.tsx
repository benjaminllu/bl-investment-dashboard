import { fetchKoreaLeverage } from "@/lib/koreaLeverage";
import KoreaLeveragePanel from "@/components/KoreaLeveragePanel";
import { PlaceholderGrid } from "@/components/PlaceholderBlocks";
import WipBadge from "@/components/WipBadge";

/**
 * Static with revalidation, so a visitor is served the last good render instead
 * of waiting on four cold cross-Pacific requests to Seoul.
 *
 * The hour matches how often KOFIA publishes — once per settlement session —
 * but it is not the interval this page actually rebuilds at. The market banner
 * in the shared layout fetches on a 300s window, and Next takes the lowest
 * revalidate of any fetch in the tree, so every page in this app including this
 * one regenerates every 5 minutes. What the hour still buys is the thing that
 * matters: the four FreeSIS fetches carry their own `revalidate: 3600`, so
 * those rebuilds reuse the cached responses and KOFIA sees roughly one request
 * per screen per hour rather than one every five minutes.
 */
export const revalidate = 3600;

export default async function PositioningPage() {
  const koreaLeverage = await fetchKoreaLeverage();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl space-y-4 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Positioning</h1>
          <WipBadge title="Only the Korean leverage panel is built — the blocks below it are still empty placeholders." />
        </div>

        {/* Thirds. The leverage panel takes one, the unbuilt blocks take the
            next as a single column of four equal rows, and the last is left
            open for whatever gets built next. Both columns are grid items in
            the same row, so the placeholder column inherits the panel's height
            and its four rows divide that height rather than a guessed one. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <KoreaLeveragePanel data={koreaLeverage} />

          <PlaceholderGrid
            stacked
            blocks={[
              { label: "COT" },
              { label: "Prime Brokerage" },
              { label: "Gamma Exposure" },
              { label: "Options Positioning" },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
