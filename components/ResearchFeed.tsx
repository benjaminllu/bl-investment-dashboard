"use client";

import { useState, useEffect } from "react";
import type { SubstackArticle } from "@/lib/substack";
import type { NewsItem } from "@/lib/finnhubNews";

const TABS = ["Market News", "WL News", "Substack", "X / Twitter"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  articles: SubstackArticle[];
  watchlistNews: NewsItem[];
  marketNews: NewsItem[];
}

function NewsCard({ item }: { item: NewsItem }) {
  const date = new Date(item.datetime * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-2 rounded-lg bg-muted p-2 transition-colors hover:bg-border"
    >
      {item.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{item.source}</span>
          {item.ticker && (
            <>
              <span>·</span>
              <span>{item.ticker}</span>
            </>
          )}
          <span>·</span>
          <span>{date}</span>
        </div>
        <p className="text-xs font-medium leading-snug text-foreground line-clamp-3">
          {item.headline}
        </p>
      </div>
    </a>
  );
}

export default function ResearchFeed({ articles, watchlistNews, marketNews }: Props) {
  const [active, setActive] = useState<Tab>("Market News");

  useEffect(() => {
    if (active !== "X / Twitter") return;
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [active]);

  return (
    // flex column on lg so the tab row stays pinned and only the list scrolls;
    // natural height on mobile, where the feed is just the last thing on a
    // stacked page and has nothing to align to.
    <div className="flex flex-col overflow-hidden rounded-xl bg-card lg:h-full">
      <div className="flex shrink-0 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
              active === tab
                ? "-mb-px border-b-2 border-accent text-accent"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {active === "X / Twitter" && (
          <a
            className="twitter-timeline"
            data-height="600"
            data-theme="dark"
            href="https://twitter.com/aleabitoreddit"
          >
            Posts by aleabitoreddit
          </a>
        )}

        {active === "Substack" && (
          <div className="space-y-1.5">
            {articles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No articles found.</p>
            ) : (
              articles.map((article) => (
                <a
                  key={article.link}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2 rounded-lg bg-muted p-2 transition-colors hover:bg-border"
                >
                  {article.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.coverImage}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{article.source}</span>
                      <span>·</span>
                      <span>
                        {article.pubDate
                          ? new Date(article.pubDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                      {article.readingTime && (
                        <>
                          <span>·</span>
                          <span>{article.readingTime} min</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                      {article.title}
                    </p>
                    {article.subtitle && (
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground line-clamp-2">
                        {article.subtitle}
                      </p>
                    )}
                  </div>
                </a>
              ))
            )}
          </div>
        )}

        {active === "Market News" && (
          <div className="space-y-1.5">
            {marketNews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No market news found.</p>
            ) : (
              marketNews.map((item) => <NewsCard key={item.url} item={item} />)
            )}
          </div>
        )}

        {active === "WL News" && (
          <div className="space-y-1.5">
            {watchlistNews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent news found.</p>
            ) : (
              watchlistNews.map((item) => <NewsCard key={item.url} item={item} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
