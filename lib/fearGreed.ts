export interface FearGreedComponent {
  id: string;
  label: string;
  score: number | null;
  rating: string | null;
}

export interface FearGreedIndex {
  score: number | null;
  rating: string | null;
  timestamp: string | null;
  previousClose: number | null;
  previous1Week: number | null;
  previous1Month: number | null;
  previous1Year: number | null;
  components: FearGreedComponent[];
}

// CNN's own dataviz backend, undocumented and unofficial — no API key, but
// requires a browser-like User-Agent or requests are rejected. Endpoint and
// response shape reverse-engineered by hitting it directly; CNN can change
// or block this without notice.
const FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

// Matches the 7 components CNN's own Fear & Greed page surfaces (the API
// also returns market_momentum_sp125 and market_volatility_vix_50, which
// back secondary chart lines CNN doesn't display as top-level indicators).
const COMPONENT_KEYS: { id: string; label: string }[] = [
  { id: "market_momentum_sp500", label: "Market Momentum" },
  { id: "stock_price_strength", label: "Stock Price Strength" },
  { id: "stock_price_breadth", label: "Stock Price Breadth" },
  { id: "put_call_options", label: "Put and Call Options" },
  { id: "market_volatility_vix", label: "Market Volatility (VIX)" },
  { id: "junk_bond_demand", label: "Junk Bond Demand" },
  { id: "safe_haven_demand", label: "Safe Haven Demand" },
];

const EMPTY: FearGreedIndex = {
  score: null,
  rating: null,
  timestamp: null,
  previousClose: null,
  previous1Week: null,
  previous1Month: null,
  previous1Year: null,
  components: COMPONENT_KEYS.map(({ id, label }) => ({ id, label, score: null, rating: null })),
};

export async function fetchFearGreedIndex(): Promise<FearGreedIndex> {
  try {
    const res = await fetch(FEAR_GREED_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.cnn.com/markets/fear-and-greed",
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      console.error(`[fearGreed] failed: HTTP ${res.status} ${await res.text()}`);
      return EMPTY;
    }
    const data = await res.json();
    const current = data.fear_and_greed ?? {};

    return {
      score: typeof current.score === "number" ? current.score : null,
      rating: current.rating ?? null,
      timestamp: current.timestamp ?? null,
      previousClose: typeof current.previous_close === "number" ? current.previous_close : null,
      previous1Week: typeof current.previous_1_week === "number" ? current.previous_1_week : null,
      previous1Month: typeof current.previous_1_month === "number" ? current.previous_1_month : null,
      previous1Year: typeof current.previous_1_year === "number" ? current.previous_1_year : null,
      components: COMPONENT_KEYS.map(({ id, label }) => ({
        id,
        label,
        score: typeof data[id]?.score === "number" ? data[id].score : null,
        rating: data[id]?.rating ?? null,
      })),
    };
  } catch (e) {
    console.error("[fearGreed] threw:", e);
    return EMPTY;
  }
}
