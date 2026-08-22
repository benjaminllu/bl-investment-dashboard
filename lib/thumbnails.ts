/**
 * Shrink a third-party image URL to thumbnail dimensions, where the host lets
 * us ask.
 *
 * The news and Substack rails render every image in a 56x56 box, and were
 * downloading press-release originals to fill it. Measured on live home-page
 * markup: a single CNBC photo requested at `w=1920&h=1080` came to 234,072
 * bytes; the same photo at `w=112&h=112` is 2,707 bytes. That is 86x, on an
 * image displayed at under three thousand square pixels. Across the five CNBC
 * thumbnails plus a 107KB source logo, the home page was spending roughly a
 * megabyte — about five times its entire gzipped JavaScript bundle — on six
 * pictures the size of a fingernail.
 *
 *
 * WHY NOT next/image
 *
 * This was the open question left in UI-IMPROVEMENTS.md under Priority 3, and
 * the answer turned out to be "neither of the two options listed there".
 * `next/image` needs `images.remotePatterns` to allow-list hosts, and these
 * images come from wherever Finnhub scraped them, so the choice looked like
 * either a `**` wildcard — which turns the deployment's optimizer into an open
 * image proxy anyone can point at any URL — or silently unoptimized images from
 * unlisted hosts, which is the bug we are trying to fix.
 *
 * Rewriting the URL avoids the dilemma entirely. The bytes are resized by the
 * CDN that already hosts them, we proxy nothing, add no dependency, and consume
 * no Vercel image-optimization quota. The cost is that it only works for hosts
 * we teach it about.
 *
 * Surveyed against 100 live Finnhub general-news articles: static2.finnhub.io
 * 55, image.cnbcfm.com 31, data.bloomberglp.com 14. So one resizable host
 * covers roughly a third of news images outright; the finnhub and Bloomberg
 * entries are source logos served as fixed files with no resize API, but they
 * are a small repeating set that the browser caches after first sight.
 * Everything else falls through unchanged, which is always safe.
 *
 * The universal half of the fix is `loading="lazy"` at the call sites — that
 * one helps every host, including the ones below that we cannot resize.
 */

/** The feed rails render a 56px box (`h-14 w-14`); 112 covers 2x displays. */
export const THUMBNAIL_PX = 112;

/**
 * Width and height are separate because the two call sites are different
 * shapes: the feeds want a 112x112 square, the /ai-summary hero wants a wide
 * 1344x384 banner. Passing one `size` for both would letterbox the hero.
 */
export function thumbnailUrl(
  url: string,
  width: number = THUMBNAIL_PX,
  height: number = width,
): string {
  try {
    const u = new URL(url);

    // CNBC's image service takes explicit dimensions. Overwrite rather than
    // append — the URLs arrive carrying w=1920&h=1080 already.
    if (u.hostname === "image.cnbcfm.com") {
      u.searchParams.set("w", String(width));
      u.searchParams.set("h", String(height));
      return u.toString();
    }

    // Substack proxies covers through Cloudinary's fetch delivery, whose
    // transforms are a comma-separated segment in the path:
    //   /image/fetch/$s_!MooW!,f_auto,q_auto:good,fl_progressive:steep/<encoded origin>
    // Prepending a crop to that list is honoured; the existing f_auto and
    // q_auto stay in effect. Verified live at 4.6KB and 5.1KB against
    // originals of 110KB-1.7MB.
    if (u.hostname === "substackcdn.com" && u.pathname.startsWith("/image/fetch/")) {
      return url.replace(
        "/image/fetch/",
        `/image/fetch/w_${width},h_${height},c_fill,`,
      );
    }

    return url;
  } catch {
    // Not a parseable absolute URL. Hand it back untouched rather than
    // dropping the image.
    return url;
  }
}
