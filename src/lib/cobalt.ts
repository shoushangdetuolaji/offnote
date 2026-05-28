import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MediaItem, ParseError, ParseResult } from './types';

const KEY = 'offnote:cobalt:instance';

export type CobaltResponse =
  | { status: 'tunnel' | 'redirect'; url: string; filename?: string }
  | { status: 'picker'; picker: Array<{ type: 'photo' | 'video' | 'gif'; url: string; thumb?: string }>; audio?: string; audioFilename?: string }
  | { status: 'local-processing'; type: string; service?: string; tunnel: string[]; output?: { type?: string; filename?: string } }
  | { status: 'error'; error: { code: string; context?: any } };

export async function getCobaltInstance(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setCobaltInstance(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, trimmed);
}

export async function clearCobaltInstance(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

function makeFilename(url: string, fallbackExt: string, index = 0): string {
  const shortcode =
    url.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)?.[1] ??
    `media-${Date.now()}`;
  const suffix = index > 0 ? `-${index}` : '';
  return `ig-${shortcode}${suffix}.${fallbackExt}`;
}

export async function parseViaCobalt(
  inputUrl: string,
): Promise<ParseResult | ParseError | null> {
  const instance = await getCobaltInstance();
  if (!instance) return null;

  try {
    const resp = await fetch(instance, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: inputUrl,
        downloadMode: 'auto',
        videoQuality: '1080',
        filenameStyle: 'basic',
      }),
    });
    const json = (await resp.json()) as CobaltResponse;

    switch (json.status) {
      case 'tunnel':
      case 'redirect': {
        const ext = json.filename?.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpg' : 'mp4';
        return {
          ok: true,
          type: ext === 'mp4' ? 'video' : 'image',
          items: [
            {
              type: ext === 'mp4' ? 'video' : 'image',
              url: json.url,
              filename: json.filename ?? makeFilename(inputUrl, ext),
            },
          ],
        };
      }
      case 'picker': {
        const items: MediaItem[] = json.picker.map((p, i) => {
          const ext = p.type === 'photo' ? 'jpg' : p.type === 'gif' ? 'gif' : 'mp4';
          return {
            type: p.type === 'photo' ? 'image' : 'video',
            url: p.url,
            filename: makeFilename(inputUrl, ext, i),
          };
        });
        return { ok: true, type: 'carousel', items };
      }
      case 'error':
        return {
          ok: false,
          error: `Cobalt: ${json.error.code}`,
          code: 'NOT_FOUND',
        };
      default:
        return null;
    }
  } catch (e: any) {
    return {
      ok: false,
      error: `Cobalt 调用失败：${e?.message ?? 'network'}`,
      code: 'NETWORK',
    };
  }
}

export async function pingCobaltInstance(
  instance: string,
): Promise<{ ok: boolean; status: number; snippet: string }> {
  try {
    const resp = await fetch(instance, {
      headers: { Accept: 'application/json' },
    });
    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      snippet: text.slice(0, 200).replace(/\s+/g, ' '),
    };
  } catch (e: any) {
    return { ok: false, status: -1, snippet: e?.message ?? 'fetch error' };
  }
}
