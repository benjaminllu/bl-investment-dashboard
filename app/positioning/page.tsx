import { fetchKoreaLeverage } from "@/lib/koreaLeverage";
import KoreaLeveragePanel from "@/components/KoreaLeveragePanel";
import { PlaceholderGrid } from "@/components/PlaceholderBlocks";
import PositioningPanel from "@/components/PositioningPanel";
import { fetchCot } from "@/lib/cot";
import { fetchGammaExposure } from "@/lib/gammaExposure";
import { fetchAllocationSupply } from "@/lib/allocationSupply";
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
  const [koreaLeverage, cot, gamma, allocation] = await Promise.all([
    fetchKoreaLeverage(),
    fetchCot(),
    fetchGammaExposure(),
    fetchAllocationSupply(),
  ]);

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-screen-3xl space-y-4 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">Positioning</h1>
          <WipBadge title="Four panels are built; the blocks naming a planned source are still placeholders." />
        </div>

        {/* Thirds, fast to slow. The first row is the weekly-to-daily reads:
            Korean leverage, futures positioning, dealer gamma. The second holds
            the quarterly Fed series beside four unbuilt blocks, stacked in pairs
            so they share the panel's height rather than claiming a row each. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <KoreaLeveragePanel data={koreaLeverage} />

          <PositioningPanel
            title="COT · E-mini S&P 500"
            source="CFTC TFF · futures only"
            data={cot}
          />

          <PositioningPanel
            title="Gamma Exposure"
            source="SqueezeMetrics"
            data={gamma}
            footnote="GEX ranked against the last three years, since it is a dollar amount that grows with the market. DIX against its full history."
          />

          <PositioningPanel
            title="Allocation & Supply"
            source="Fed Z.1 via FRED · quarterly"
            data={allocation}
            footnote="Published about ten weeks after each quarter ends."
          />

          <PlaceholderGrid
            stacked
            blocks={[
              { label: "Options Positioning", description: "Planned: Cboe equity and SPX put/call, daily since 2006." },
              { label: "Prime Brokerage", description: "No free source. Prime-book data reaches the public only through press coverage." },
            ]}
          />

          <PlaceholderGrid
            stacked
            blocks={[
              { label: "Margin Debt", description: "Planned: FINRA monthly debit balances, as year-on-year change and % of market cap." },
              { label: "Insider Buy/Sell", description: "Planned: market-wide Form 4 open-market buys vs sells, from the EDGAR index already fetched nightly." },
            ]}
          />
        </div>

        {/* The rest of the roadmap, each block naming its planned source so the
            page doubles as the build list. */}
        <PlaceholderGrid
          blocks={[
            { label: "Sentiment Surveys", description: "AAII, Investors Intelligence, NAAIM. All now paid, member-only or three months delayed." },
            { label: "Retail Activity", description: "Planned: ApeWisdom Reddit mentions. Vanda and JPMorgan trackers are not public." },
            { label: "IPOs & Buybacks", description: "Planned: Ritter IPO counts and first-day returns, S&P DJI quarterly buybacks." },
            { label: "Fund Flows", description: "Planned: foreign net buying of US stocks (TIC via FRED), ICI flows, money-market assets." },
            { label: "Short Interest", description: "Planned: FINRA consolidated short interest, twice monthly." },
            { label: "Leveraged ETFs", description: "Planned: assets in TQQQ, SOXL and similar, from shares outstanding." },
            { label: "Volatility Term Structure", description: "Planned: VIX against VIX3M; an inverted curve marks stress." },
            { label: "Positioning Composite", description: "Planned: fast and slow dials built from every panel's percentile." },
          ]}
        />
      </div>
    </main>
  );
}
