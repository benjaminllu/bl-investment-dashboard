// Shared newswire quality filter for the Node maintenance scripts.
//
// The same rules exist in TypeScript in lib/finnhubNews.ts, which the Next app
// imports. That duplication is unavoidable -- lib/ is ESM TypeScript compiled by
// Next, scripts/ is plain CommonJS run by node with no build step -- but a
// *third* copy is not, so refresh-data.js and generate-market-digest.js both
// read the rules from here. Keep this file and lib/finnhubNews.ts in step.

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

// Finnhub's company-news endpoint answers with opaque redirect URLs
// (finnhub.io/api/news?id=...), so BLOCKED_DOMAINS can never match on those and
// 57 SeekingAlpha rows had accumulated in stock_news despite the block list. The
// `source` field is populated reliably on both endpoints, so it is checked too.
// Normalised to letters and digits, which folds "Barron's"/"Barrons" and
// "The Motley Fool"/"Motley Fool" onto one key.
const BLOCKED_SOURCES = new Set([
  "wsj",
  "thewallstreetjournal",
  "wallstreetjournal",
  "barrons",
  "ft",
  "financialtimes",
  "seekingalpha",
  "thestreet",
  "investors",
  "investorsbusinessdaily",
  "ibd",
  "fool",
  "themotleyfool",
  "motleyfool",
  "marketbeat",
]);

function normaliseSource(source) {
  return String(source || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLowQuality(article) {
  if (BLOCKED_SOURCES.has(normaliseSource(article.source))) return true;
  try {
    const hostname = new URL(article.url).hostname.replace(/^www\./, "");
    if (BLOCKED_DOMAINS.has(hostname)) return true;
  } catch {
    // malformed URL — let through
  }
  return CLICKBAIT_PATTERNS.some((re) => re.test(article.headline));
}

module.exports = { BLOCKED_DOMAINS, BLOCKED_SOURCES, CLICKBAIT_PATTERNS, isLowQuality };
