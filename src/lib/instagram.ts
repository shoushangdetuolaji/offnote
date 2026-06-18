import { getCobaltInstance, parseViaCobalt } from './cobalt';
import { createNote, type CreateNoteResult, type MediaInput } from './notes';
import type { ParseError, ParseResult } from './types';

export function extractInstagramShortcode(url: string): string | null {
  const m = url.match(
    /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
  );
  return m ? m[1] : null;
}

export async function parseInstagramLocal(
  inputUrl: string,
): Promise<ParseResult | ParseError> {
  const shortcode = extractInstagramShortcode(inputUrl);
  if (!shortcode) {
    return { ok: false, error: '链接里没找到 shortcode', code: 'INVALID_URL' };
  }

  const instance = await getCobaltInstance();
  if (!instance) {
    return {
      ok: false,
      error: '尚未配置 Cobalt 实例，请到设置页填一个',
      code: 'NOT_FOUND',
    };
  }

  const r = await parseViaCobalt(inputUrl);
  if (r) return r;

  return {
    ok: false,
    error: 'Cobalt 没有返回可用结果',
    code: 'NOT_FOUND',
  };
}

function inferExtFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([A-Za-z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

export type SaveInstagramResult =
  | { ok: true; noteId: string; mediaCount: number }
  | { ok: false; reason: 'parse_failed' | 'save_failed'; detail?: string };

export async function saveInstagramFromUrl(
  inputUrl: string,
  opts?: {
    categoryId?: string;
    note?: string;
    onProgress?: (msg: string) => void;
  },
): Promise<SaveInstagramResult> {
  opts?.onProgress?.('正在解析 Instagram 链接…');
  const parsed = await parseInstagramLocal(inputUrl);
  if (!parsed.ok) {
    return { ok: false, reason: 'parse_failed', detail: parsed.error };
  }

  const items: MediaInput[] = parsed.items.map((item) => ({
    kind: item.type,
    hintExt: inferExtFromUrl(item.filename || item.url, item.type === 'image' ? 'jpg' : 'mp4'),
    source: { type: 'remote', url: item.url },
  }));

  opts?.onProgress?.('正在下载媒体…');
  const result: CreateNoteResult = await createNote({
    title: parsed.title || extractInstagramShortcode(inputUrl) || 'Instagram',
    note: opts?.note,
    categoryId: opts?.categoryId,
    source: 'instagram',
    items,
    metadata: {
      sourceUrl: inputUrl,
      shortcode: extractInstagramShortcode(inputUrl),
      thumbnailUrl: parsed.thumbnail,
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
