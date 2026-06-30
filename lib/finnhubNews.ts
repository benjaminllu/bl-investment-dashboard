import { supabase } from "@/lib/supabase";

export interface NewsItem {
  headline: string;
  url: string;
  datetime: number;
  source: string;
  image: string | null;
  ticker?: string;
}

interface FinnhubArticle {
  headline: string;
  url: string;
  datetime: number;
  source: string;
  image: string;
}

// Known paywall domains — articles from these rarely provide value without a subscription
const BLOCKED_DOMAINS = new Set([
  "wsj.com",
  "barrons.com",
  "ft.com",
  "seekingalpha.com",
  "thestreet.com",
  "investors.com",
  "fool.com",
  "marketbeat.com",
]);

// Clickbait headline patterns — listicles, opinion fluff, and "should you buy" style articles
const CLICKBAIT_PATTERNS = [
  // Listicles
  /\b\d+\s+(stocks?|etfs?|funds?)\s+(to\s+)?(buy|sell|watch|own|avoid|consider)/i,
  /\bbest\s+(stocks?|etfs?)\s+to\b/i,
  /\btop\s+(stocks?|etfs?)\s+(to|for)\b/i,
  /\bthese\s+\d+\s+stocks?\b/i,
  /\b\d+\s+(dividend|growth|value|tech)\s+stocks?\b/i,

  // "Should you buy/sell" recommendations
  /\bshould\s+you\s+(buy|sell|invest|own|hold)/i,
  /\b(buy|sell|invest)\s+in\s+these\s+stocks?\b/i,
  /\bstock\s+picks?\b/i,
  /\bmust[\s-]?(buy|own|have|watch)\b/i,
  /\bdon'?t\s+miss\s+these\b/i,
  /\bhere'?s\s+why\s+you\s+should\b/i,
  /\bstocks?\s+that\s+(could|will|may)\s+make\s+you\s+rich\b/i,

  // "X vs Y" comparisons
  /\bvs\.?\s+\w/i,
  /\bwhich\s+is\s+(a\s+)?(better|the\s+best)\s+(buy|investment|stock|pick)\b/i,
  /\bbetter\s+stock\s+to\s+buy\b/i,

  // Speculative price targets
  /\bcould\s+(reach|hit|surge\s+to|climb\s+to)\s+\$/i,
  /\b(could|will|may)\s+(double|triple|soar|skyrocket)\b/i,
  /\b\d+%\s+upside\b/i,
  /\bprice\s+target\s+of\s+\$/i,

  // Opinion / timing fluff
  /\bis\s+it\s+too\s+late\s+to\s+buy\b/i,
  /\btime\s+to\s+(buy|sell)\b/i,
  /\bis\s+\w+\s+a\s+buy\s+right\s+now\b/i,
  /\b(no[\s-]brainer|screaming)\s+buy\b/i,
  /\bi'?m\s+(buying|selling)\b/i,
  /\bmy\s+(top\s+pick|favorite\s+stock)\b/i,
  /\bwarren\s+buffett\s+(would|stocks?|buys?)\b/i,
];

function isLowQuality(item: FinnhubArticle): boolean {
  try {
    const hostname = new URL(item.url).hostname.replace(/^www\./, "");
    if (BLOCKED_DOMAINS.has(hostname)) return true;
  } catch {
    // malformed URL — let it through
  }
  return CLICKBAIT_PATTERNS.some((re) => re.test(item.headline));
}

export async function fetchWatchlistNews(): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from("stock_news")
    .select("ticker, headline, url, source, image, datetime")
    .order("datetime", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const seen = new Set<string>();
  return data
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 10)
    .map((item) => ({
      headline: item.headline,
      url: item.url,
      datetime: item.datetime,
      source: item.source,
      image: item.image,
      ticker: item.ticker,
    }));
}

export async function fetchMarketNews(): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${key}`,
      { next: { revalidate: 900 } }
    );
    if (!res.ok) return [];
    const data: FinnhubArticle[] = await res.json();
    return data
      .filter((item) => !isLowQuality(item))
      .slice(0, 10)
      .map((item) => ({
        headline: item.headline,
        url: item.url,
        datetime: item.datetime,
        source: item.source,
        image: item.image || null,
      }));
  } catch {
    return [];
  }
}
