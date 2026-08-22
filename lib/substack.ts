import { substacks } from "@/data/substacks";

export interface SubstackArticle {
  title: string;
  subtitle: string;
  link: string;
  pubDate: string;
  source: string;
  coverImage: string | null;
  readingTime: number | null;
}

interface SubstackPost {
  title: string;
  subtitle: string;
  slug: string;
  canonical_url: string;
  post_date: string;
  audience: string;
  exempt_from_archive_paywall: boolean;
  cover_image: string | null;
  wordcount: number | null;
}

async function fetchPosts(
  name: string,
  baseUrl: string,
  subscribed: boolean
): Promise<SubstackArticle[]> {
  try {
    // NOT `cache: "no-store"`. That single flag opted the entire home page out
    // of static rendering — it was the only reason `/` built as a dynamic route
    // while every other page prerendered. Measured cost: `/research` serves the
    // same watchlist payload in 4ms, `/` took 157-290ms and could not be CDN
    // cached at all, on every single request.
    //
    // 900s to match the news feeds this rail sits beside. These are essays
    // published a few times a week; a quarter-hour of staleness is invisible,
    // and the floor is 300s anyway because MarketBanner's index quotes revalidate
    // at that interval from the root layout.
    const res = await fetch(`${baseUrl}/api/v1/posts?limit=5&sort=new`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const posts: SubstackPost[] = await res.json();
    return posts
      .filter((p) => subscribed || p.audience === "everyone" || p.exempt_from_archive_paywall)
      .map((p) => ({
        title: p.title,
        subtitle: p.subtitle ?? "",
        link: p.canonical_url ?? `${baseUrl}/p/${p.slug}`,
        pubDate: p.post_date,
        source: name,
        coverImage: p.cover_image ?? null,
        readingTime: p.wordcount ? Math.ceil(p.wordcount / 200) : null,
      }));
  } catch {
    return [];
  }
}

export async function getLatestArticles(count = 10): Promise<SubstackArticle[]> {
  const results = await Promise.all(
    substacks.map((s) => fetchPosts(s.name, s.url, s.subscribed))
  );
  return results
    .flat()
    .filter((a) => a.title && a.link)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, count);
}
