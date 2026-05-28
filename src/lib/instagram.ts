import { getCobaltInstance, parseViaCobalt } from './cobalt';
import type { ParseError, ParseResult } from './types';

function extractShortcode(url: string): string | null {
  const m = url.match(
    /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
  );
  return m ? m[1] : null;
}

export async function parseInstagramLocal(
  inputUrl: string,
): Promise<ParseResult | ParseError> {
  const shortcode = extractShortcode(inputUrl);
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
