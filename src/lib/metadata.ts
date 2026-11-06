export type IgMetadata = {
  sourceUrl: string;
  shortcode: string | null;
  author?: string;
  caption?: string;
  thumbnailUrl?: string;
  /** 发布日期（本地零点的毫秒时间戳），IG 只给到日期 */
  publishTime?: number;
};

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * 从 IG 的描述文案里解析发布日期：
 *   "12 likes, 3 comments - user on October 19, 2026: \"...\""
 *   中文页面："user 于 2026年10月19日：..."
 * Hermes 不支持 new Date('October 19, 2026') 这种格式，这里手动解析。
 */
export function parseIgDate(text?: string | null): number | undefined {
  if (!text) return undefined;
  const en = text.match(/\bon\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (en) {
    const month = MONTHS[en[1].toLowerCase()];
    if (month !== undefined) {
      return new Date(Number(en[3]), month, Number(en[2])).getTime();
    }
  }
  const zh = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (zh) {
    return new Date(Number(zh[1]), Number(zh[2]) - 1, Number(zh[3])).getTime();
  }
  return undefined;
}

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
      publishTime: parseIgDate(ogDesc) ?? parseIgDate(ogTitle),
    };
  } catch {
    return fallback;
  }
}
