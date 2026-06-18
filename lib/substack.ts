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
    const res = await fetch(`${baseUrl}/api/v1/posts?limit=20&sort=new`, {
      next: { revalidate: 3600 },
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
