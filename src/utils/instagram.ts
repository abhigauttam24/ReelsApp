export type PostInfo = { author: string; caption: string };

/** Returns the first instagram.com link found in the text, or null. */
export function extractInstagramUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

/**
 * Same post => same key, whatever tracking params (?igsh=...) or www. the link carries.
 * e.g. "instagram.com/reel/ABC123"
 */
export function normalizeInstagramUrl(link: string): string {
  return link
    .trim()
    .replace(/^https?:\/\/(www\.)?/i, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, ''); // no lowercasing: post codes are case-sensitive
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Reads the post's username and caption from Instagram's link-preview meta tags.
 * Never throws: returns empty strings when Instagram doesn't provide them.
 */
export async function fetchPostInfo(url: string, timeoutMs = 15000): Promise<PostInfo> {
  const empty = { author: '', caption: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      signal: controller.signal,
    });
    const html = await res.text();

    // og:description looks like: `12K likes, 30 comments - username on March 1, 2025: "caption"`
    const desc = metaContent(html, 'og:description') || '';
    const title = metaContent(html, 'og:title') || '';

    const authorMatch = desc.match(/ - ([\w.]+) on [^:]+:/);
    const captionMatch = desc.match(/:\s*"([\s\S]*)"\s*\.?$/) || title.match(/:\s*"([\s\S]*)"\s*$/);

    return {
      author: authorMatch ? authorMatch[1] : '',
      caption: captionMatch ? captionMatch[1].trim() : '',
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}
