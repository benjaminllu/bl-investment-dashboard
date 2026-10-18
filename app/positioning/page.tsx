import { fetchKoreaLeverage } from "@/lib/koreaLeverage";
import KoreaLeveragePanel from "@/components/KoreaLeveragePanel";
import { PlaceholderGrid } from "@/components/PlaceholderBlocks";
import PositioningPanel from "@/components/PositioningPanel";
import { fetchCot } from "@/lib/cot";
import { fetchGammaExposure } from "@/lib/gammaExposure";
import { fetchAllocationSupply } from "@/lib/allocationSupply";
import { fetchPutCall } from "@/lib/putCall";
import { fetchVolTermStructure } from "@/lib/volTermStructure";
import { fetchShortInterest } from "@/lib/shortInterest";
import { fetchInsiderBreadth } from "@/lib/insiderBreadth";
import { fetchMarginDebt } from "@/lib/marginDebt";
import { fetchFundFlows } from "@/lib/fundFlows";
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
  const [koreaLeverage, cot, gamma, allocation, putCall, volTerm, shortInterest, insider, margin, fundFlows] =
    await Promise.all([
    fetchKoreaLeverage(),
    fetchCot(),
    fetchGammaExposure(),
    fetchAllocationSupply(),
    fetchPutCall(),
    fetchVolTermStructure(),
    fetchShortInterest(),
    fetchInsiderBreadth(),
    fetchMarginDebt(),
    fetchFundFlows(),
  ]);

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-screen-3xl space-y-4 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">Positioning</h1>
          <WipBadge title="Ten panels are built; the blocks naming a planned source are still placeholders." />
        </div>

        {/* Thirds, read fast to slow: daily-to-weekly flows and hedging on the
            first two rows, the monthly and quarterly balance-sheet series on
            the third. The two shortest panels share a cell so no row is left
            with a hole. */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <KoreaLeveragePanel data={koreaLeverage} />

          <PositioningPanel title="COT · E-mini S&P 500" source="CFTC TFF · futures only" data={cot} />

          <PositioningPanel
            title="Gamma Exposure"
            source="SqueezeMetrics"
            data={gamma}
            footnote="GEX ranked against the last three years, since it is a dollar amount that grows with the market. DIX against its full history."
          />

          <PositioningPanel
            title="Options Positioning"
            source="Cboe-listed volume"
            data={putCall}
            footnote="Cboe's legacy files to Oct 2019, its daily statistics after; the two meet without an overlapping day."
          />

          <div className="grid gap-3">
            <PositioningPanel title="Volatility Term Structure" source="Cboe via FRED" data={volTerm} />
            <PositioningPanel title="Short Interest" source="FINRA · twice monthly" data={shortInterest} />
          </div>

          <PositioningPanel
            title="Insider Buy/Sell"
            source="SEC Form 4 · market-wide"
            data={insider}
            footnote="Original Form 4s, non-derivative open-market trades (codes P and S). Pre-planned 10b5-1 sales are included, since Form 4 only flags them from 2023."
          />

          <PositioningPanel title="Margin Debt" source="FINRA · monthly" data={margin} />

          <PositioningPanel title="Fund Flows" source="Treasury TIC & Fed Z.1 via FRED" data={fundFlows} />

          <PositioningPanel
            title="Allocation & Supply"
            source="Fed Z.1 via FRED · quarterly"
            data={allocation}
            footnote="Published about ten weeks after each quarter ends."
          />
        </div>

        {/* The rest of the roadmap, each block naming its planned source so the
            page doubles as the build list. */}
        <PlaceholderGrid
          columns={3}
          blocks={[
            { label: "Sentiment Surveys", description: "AAII, Investors Intelligence, NAAIM. All now paid, member-only or three months delayed." },
            { label: "Retail Activity", description: "Planned: ApeWisdom Reddit mentions. Vanda and JPMorgan trackers are not public." },
            { label: "Leveraged ETFs", description: "Planned: assets in TQQQ, SOXL and similar, from shares outstanding." },
            { label: "IPOs & Buybacks", description: "Planned: Ritter IPO counts and first-day returns, S&P DJI quarterly buybacks." },
            { label: "Prime Brokerage", description: "No free source. Prime-book data reaches the public only through press coverage." },
            { label: "Positioning Composite", description: "Planned: fast and slow dials built from every panel's percentile." },
          ]}
        />
      </div>
    </main>
  );
}
