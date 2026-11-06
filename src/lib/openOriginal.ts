import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { resolveDouyinWebUrl, toDouyinWebUrl } from './douyin';
import type { Note } from './notes';
import { detectSource } from './url';

const PACKAGES = {
  rednote: 'com.xingin.xhs',
  douyin: 'com.ss.android.ugc.aweme',
  instagram: 'com.instagram.android',
} as const;

/** 小红书笔记 ID 是 24 位十六进制 */
function xhsIdFrom(url: string): string | null {
  return url.match(/\b([0-9a-f]{24})\b/i)?.[1] ?? null;
}

async function xhsNoteId(url: string): Promise<string | null> {
  const direct = xhsIdFrom(url);
  if (direct) return direct;
  // xhslink 短链：跟随跳转后从最终地址里取
  try {
    const resp = await fetch(url, { redirect: 'follow' });
    return xhsIdFrom(decodeURIComponent(resp.url));
  } catch {
    return null;
  }
}

async function douyinId(url: string): Promise<string | null> {
  const web = toDouyinWebUrl(url) ?? (await resolveDouyinWebUrl(url));
  return web.match(/\/(?:video|note)\/(\d+)/)?.[1] ?? null;
}

/** Android：指定包名打开 https 链接，App 没装或不认这个链接时会抛错 */
function openInPackage(url: string, packageName: string) {
  return IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: url,
    packageName,
  });
}

/**
 * 「查看原帖」：优先直接唤起对应 App（小红书 / 抖音 / Instagram），
 * 都失败再交给系统浏览器。
 */
export async function openOriginal(
  note: Pick<Note, 'source' | 'sourceUrl'>,
): Promise<void> {
  const url = note.sourceUrl?.trim();
  if (!url) return;
  const source = note.source ?? detectSource(url);
  const android = Platform.OS === 'android';
  const attempts: Array<() => Promise<unknown>> = [];

  if (source === 'rednote') {
    const id = await xhsNoteId(url);
    if (id) attempts.push(() => Linking.openURL(`xhsdiscover://item/${id}`));
    if (android) attempts.push(() => openInPackage(url, PACKAGES.rednote));
  } else if (source === 'douyin') {
    const id = await douyinId(url);
    if (id) attempts.push(() => Linking.openURL(`snssdk1128://aweme/detail/${id}`));
    if (android) attempts.push(() => openInPackage(url, PACKAGES.douyin));
  } else if (source === 'instagram') {
    // iOS 上 https 链接本身就是 Universal Link，装了 App 会直接打开
    if (android) attempts.push(() => openInPackage(url, PACKAGES.instagram));
  }

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // 换下一种方式
    }
  }
  await Linking.openURL(url).catch(() => {});
}
