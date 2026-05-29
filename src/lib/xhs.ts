import { createNote, type CreateNoteResult, type MediaInput } from './notes';

/**
 * Small-Red-Book (xiaohongshu) note parser.
 *
 * Strategy: fetch the public note page HTML (which is server-side rendered)
 * and extract data from the embedded `window.__INITIAL_STATE__` JSON,
 * with DOM regex fallbacks.
 *
 * Notes:
 * - xhslink.com shortlinks are automatically followed by fetch().
 * - We pretend to be mobile Safari to maximise the chance of getting the
 *   SSR'd page (web app often gates desktop UA).
 */

export type XhsParseResult =
  | {
      ok: true;
      data: {
        title?: string;
        desc?: string;
        author?: string;
        authorAvatar?: string;
        cover?: string;
        images: string[];
        videoUrl?: string;
        finalUrl: string;
      };
    }
  | { ok: false; reason: 'fetch_failed' | 'no_data' | 'blocked'; detail?: string };

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function fetchHtml(
  url: string,
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return { html, finalUrl: resp.url };
  } catch {
    return null;
  }
}

function extractInitialStateJson(html: string): string | null {
  const re =
    /window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  if (!m) return null;
  let raw = m[1].trim();
  if (raw.endsWith(';')) raw = raw.slice(0, -1);
  return raw;
}

function safeParseInitialState(html: string): any | null {
  const raw = extractInitialStateJson(html);
  if (!raw) return null;
  const fixed = raw
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/:\s*NaN\b/g, ': null')
    .replace(/:\s*Infinity\b/g, ': null')
    .replace(/:\s*-Infinity\b/g, ': null');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

function deepFindNote(node: any, depth = 0): any | null {
  if (!node || typeof node !== 'object' || depth > 7) return null;
  if (
    (node.title || node.desc) &&
    (Array.isArray(node.imageList) || node.video || node.user)
  ) {
    return node;
  }
  for (const k of Object.keys(node)) {
    try {
      const got = deepFindNote(node[k], depth + 1);
      if (got) return got;
    } catch {}
  }
  return null;
}

function pickString(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function extractFromState(state: any): XhsParseResult['ok'] extends true
  ? never
  : any {
  const note = deepFindNote(state);
  if (!note) return null;

  const title = pickString(note.title);
  const desc = pickString(note.desc);
  const user = note.user || {};
  const author = pickString(user.nickName, user.nickname, user.name);
  const authorAvatar = pickString(user.avatar, user.image);

  const images: string[] = [];
  if (Array.isArray(note.imageList)) {
    for (const item of note.imageList) {
      const url = pickString(
        item?.urlDefault,
        item?.url,
        item?.urlSizeLarge,
        item?.urlPre,
        item?.infoList?.[0]?.url,
      );
      if (url) images.push(url);
    }
  }

  let videoUrl: string | undefined;
  try {
    const streams = note.video?.media?.stream;
    if (streams) {
      for (const codec of ['h264', 'h265', 'av1']) {
        const list = (streams as any)[codec];
        if (Array.isArray(list) && list.length) {
          const best = [...list].sort(
            (a: any, b: any) => (b?.size || 0) - (a?.size || 0),
          )[0];
          videoUrl =
            best?.masterUrl ||
            (Array.isArray(best?.backupUrls) ? best.backupUrls[0] : undefined);
          if (videoUrl) break;
        }
      }
    }
  } catch {}

  const cover = pickString(
    note.video?.image?.firstFrameFileid,
    note.cover?.urlDefault,
    note.cover?.url,
    images[0],
  );

  return { title, desc, author, authorAvatar, cover, images, videoUrl };
}

function extractFromHtml(html: string): {
  title?: string;
  desc?: string;
  author?: string;
  authorAvatar?: string;
  cover?: string;
  images: string[];
  videoUrl?: string;
} {
  function pickMeta(key: string): string | undefined {
    const re = new RegExp(
      `<meta[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    return html.match(re)?.[1];
  }

  const title = pickMeta('og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const desc = pickMeta('description') ?? pickMeta('og:description');
  const cover = pickMeta('og:image');

  const images: string[] = [];
  const imgRe =
    /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp)(?:\?[^\s"'<>]*)?/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const u = m[0];
    if (seen.has(u)) continue;
    if (/sns-avatar|\/avatar\//.test(u)) continue;
    seen.add(u);
    images.push(u);
  }

  const videoUrl = html.match(/"masterUrl"\s*:\s*"([^"]+)"/)?.[1];

  return {
    title: title?.trim(),
    desc: desc?.trim(),
    cover,
    images,
    videoUrl: videoUrl ? videoUrl.replace(/\\u002F/g, '/') : undefined,
  };
}

export async function parseXhsUrl(url: string): Promise<XhsParseResult> {
  const fetched = await fetchHtml(url);
  if (!fetched) return { ok: false, reason: 'fetch_failed' };

  // Common signals that xhs blocked us / sent us to login or anti-bot
  if (/login|verify|sliderCaptcha|风控/i.test(fetched.html) &&
      !/__INITIAL_STATE__/.test(fetched.html)) {
    return { ok: false, reason: 'blocked' };
  }

  const state = safeParseInitialState(fetched.html);
  const fromState = state ? extractFromState(state) : null;
  const fromHtml = extractFromHtml(fetched.html);

  const merged = {
    title: fromState?.title || fromHtml.title,
    desc: fromState?.desc || fromHtml.desc,
    author: fromState?.author,
    authorAvatar: fromState?.authorAvatar,
    cover: fromState?.cover || fromHtml.cover,
    images: (fromState?.images?.length ? fromState.images : fromHtml.images) ?? [],
    videoUrl: fromState?.videoUrl || fromHtml.videoUrl,
    finalUrl: fetched.finalUrl,
  };

  if (
    !merged.title &&
    !merged.desc &&
    merged.images.length === 0 &&
    !merged.videoUrl
  ) {
    return { ok: false, reason: 'no_data' };
  }

  return { ok: true, data: merged };
}

function inferExtFromUrl(u: string, fallback: string): string {
  const m = u.split('?')[0].match(/\.([A-Za-z0-9]+)$/);
  return (m ? m[1] : fallback).toLowerCase();
}

function buildTitle(parsed: {
  title?: string;
  desc?: string;
  author?: string;
}): string {
  const slug = (parsed.title || parsed.desc || '')
    .replace(/\s+/g, ' ')
    .slice(0, 30)
    .replace(/[/\\:?*"<>|]/g, '')
    .trim();
  const author = parsed.author?.replace(/[^A-Za-z0-9_一-龥]/g, '');
  const parts = [author, slug].filter(Boolean).join('_');
  return parts || `xhs-${Date.now()}`;
}

export type SaveXhsResult =
  | { ok: true; noteId: string; mediaCount: number }
  | { ok: false; reason: 'parse_failed'; parseReason: string; detail?: string }
  | { ok: false; reason: 'save_failed'; detail?: string };

/**
 * One-shot helper: parse a xhs URL in the background and persist as a note.
 * Caller can show a busy overlay while awaiting this.
 */
export async function saveXhsFromUrl(
  inputUrl: string,
  opts?: {
    categoryId?: string;
    note?: string;
    onProgress?: (msg: string) => void;
  },
): Promise<SaveXhsResult> {
  opts?.onProgress?.('正在解析链接…');
  const parsed = await parseXhsUrl(inputUrl);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: 'parse_failed',
      parseReason: parsed.reason,
    };
  }

  const { data } = parsed;
  const items: MediaInput[] = [];
  if (data.videoUrl) {
    items.push({
      kind: 'video',
      hintExt: inferExtFromUrl(data.videoUrl, 'mp4'),
      source: { type: 'remote', url: data.videoUrl },
    });
  }
  for (const img of data.images) {
    items.push({
      kind: 'image',
      hintExt: inferExtFromUrl(img, 'jpg'),
      source: { type: 'remote', url: img },
    });
  }

  if (items.length === 0) {
    return {
      ok: false,
      reason: 'parse_failed',
      parseReason: 'no_data',
      detail: '没有抓到图片或视频',
    };
  }

  const title = buildTitle(data);
  opts?.onProgress?.('正在下载媒体…');

  const result: CreateNoteResult = await createNote({
    title,
    note: opts?.note,
    categoryId: opts?.categoryId,
    source: 'rednote',
    items,
    metadata: {
      sourceUrl: data.finalUrl,
      shortcode: null,
      author: data.author,
      caption: data.desc || data.title,
      thumbnailUrl: data.cover || data.images[0],
    },
    onItemProgress: (i, total, f) => {
      const overall = ((i + f) / total) * 100;
      opts?.onProgress?.(`保存第 ${i + 1}/${total} 项 ${Math.round(overall)}%`);
    },
  });

  if (!result.ok) {
    return { ok: false, reason: 'save_failed', detail: result.error };
  }
  return {
    ok: true,
    noteId: result.note!.id,
    mediaCount: result.note!.media.length,
  };
}
