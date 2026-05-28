export type IgMetadata = {
  sourceUrl: string;
  shortcode: string | null;
  author?: string;
  caption?: string;
  thumbnailUrl?: string;
};

const UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function extractShortcode(url: string): string | null {
  const m = url.match(
    /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
  );
  return m ? m[1] : null;
}

function pickMeta(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta\\s+(?:[^>]*?\\s+)?(?:property|name)=["']${key}["'][^>]*?content=["']([^"']*)["']`,
    'i',
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]) : null;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function parseOgTitle(raw: string): { author?: string; caption?: string } {
  // Examples seen:
  //   "username on Instagram: \"caption text\""
  //   "Display Name (@handle) • Instagram reel"
  //   "Display Name (@handle) • Instagram photos and videos"
  const m1 = raw.match(/^(.+?)\s+on Instagram[:\s]*["“](.*?)["”]\s*$/i);
  if (m1) {
    return { author: m1[1].trim(), caption: m1[2].trim() };
  }
  const m2 = raw.match(/\(@([A-Za-z0-9_.]+)\)/);
  if (m2) return { author: m2[1] };
  return {};
}

export async function fetchIgMetadata(sourceUrl: string): Promise<IgMetadata> {
  const shortcode = extractShortcode(sourceUrl);
  const fallback: IgMetadata = { sourceUrl, shortcode };

  if (!shortcode) return fallback;

  const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
  try {
    const resp = await fetch(pageUrl, {
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await resp.text();

    const ogTitle = pickMeta(html, 'og:title') ?? pickMeta(html, 'twitter:title');
    const ogDesc = pickMeta(html, 'og:description') ?? pickMeta(html, 'description');
    const ogImage = pickMeta(html, 'og:image') ?? pickMeta(html, 'twitter:image');

    const parsedTitle = ogTitle ? parseOgTitle(ogTitle) : {};

    let author = parsedTitle.author;
    if (!author && ogDesc) {
      const m = ogDesc.match(/-\s*([A-Za-z0-9_.]+)\s+on/);
      if (m) author = m[1];
    }

    return {
      sourceUrl,
      shortcode,
      author,
      caption: parsedTitle.caption ?? (ogDesc?.trim() || undefined),
      thumbnailUrl: ogImage ?? undefined,
    };
  } catch {
    return fallback;
  }
}
