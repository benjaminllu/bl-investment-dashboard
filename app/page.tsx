import { Suspense } from "react";
import StockTable from "@/components/StockTable";
import AddStockForm from "@/components/AddStockForm";
import MarketBanner from "@/components/MarketBanner";
import { supabase } from "@/lib/supabase";
import XFeed from "@/components/XFeed";

// then in the JSX:
<XFeed />


async function fetchQuote(ticker: string): Promise<{ price: number; changePct: number }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: 0, changePct: 0 };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return { price: data.c ?? 0, changePct: data.dp ?? 0 };
  } catch {
    return { price: 0, changePct: 0 };
  }
}

export default async function Home() {
  const { data: watchlist, error } = await supabase
    .from("stocks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  const stocks = await Promise.all(
    watchlist.map(async (stock) => { 
      const { price, changePct } = await fetchQuote(stock.ticker);
      return { ...stock, price, changePct };
    })
  );

  const validPrices = stocks.filter((s) => s.price > 0);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-screen-2xl p-6">

        <div className="mt-0 mb-2 rounded-xl bg-slate-900 p-4">
          <Suspense fallback={<p className="text-sm text-slate-500">Loading market data...</p>}>
            <MarketBanner />
          </Suspense>
        </div>

        <StockTable stocks={stocks} />

        <AddStockForm />
        
        <XFeed />
      </div>
    </main>
  );
}
