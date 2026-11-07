import type { XhsExtra } from './xhsExtra';

/** 电脑版 Chrome。手机 UA 会落到只有静图的手机网页，图集里的视频 source 抓不到 */
export const DOUYIN_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 下载视频/图片时带上，部分 CDN 会校验 UA 和 Referer */
export const DOUYIN_MEDIA_HEADERS: Record<string, string> = {
  'User-Agent': DOUYIN_DESKTOP_UA,
  Referer: 'https://www.douyin.com/',
};

export type DouyinMedia = {
  kind: 'video' | 'image';
  url: string;
};

/** WebView 注入脚本抓到的数据 */
export type DouyinPayload = {
  type: 'douyin';
  forced?: boolean;
  awemeId?: string;
  desc?: string;
  author?: string;
  authorAvatar?: string;
  cover?: string;
  images: string[];
  /** 图集里每一页：实况/动图是视频，普通页是图片 */
  media?: DouyinMedia[];
  videoUrl?: string;
  /** 秒级时间戳 */
  createTime?: number;
  topics?: string[];
  diggCount?: number | string;
  collectCount?: number | string;
  commentCount?: number | string;
};

/** 12345 -> 1.2万，与小红书的展示习惯保持一致 */
export function formatCount(v: number | string | undefined): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}

/** 整理成详情页用的附加信息（与小红书共用 XhsExtra 结构，不含评论） */
export function buildDouyinExtra(p: DouyinPayload): XhsExtra {
  const t = Number(p.createTime);
  return {
    desc: p.desc?.trim() || undefined,
    authorAvatar: p.authorAvatar || undefined,
    publishTime:
      Number.isFinite(t) && t > 0 ? (t < 1e12 ? t * 1000 : t) : undefined,
    topics: p.topics?.length ? p.topics : undefined,
    likedCount: formatCount(p.diggCount),
    collectedCount: formatCount(p.collectCount),
    commentCount: formatCount(p.commentCount),
  };
}

/** 文件名建议：作者_文案前 30 字 */
export function suggestDouyinName(p: DouyinPayload | null): string {
  const author = p?.author?.replace(/[^A-Za-z0-9_一-龥]/g, '');
  const slug = (p?.desc || '')
    .replace(/#\s*\S+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 30)
    .replace(/[/\\:?*"<>|]/g, '')
    .trim();
  const parts = [author, slug].filter(Boolean).join('_');
  return parts || `douyin-${Date.now()}`;
}

const WEB_RE = /^https?:\/\/(?:www\.)?douyin\.com\/(video|note)\/(\d+)/i;
const SHARE_RE = /\/share\/(video|note|slides)\/(\d+)/i;

/**
 * App 分享链接会落到 iesdouyin.com/share/... ，这个页面拿不到作品数据；
 * 网页端 www.douyin.com/video|note/{id} 可以。这里把各种形态统一转成网页端链接。
 */
export function toDouyinWebUrl(url: string): string | null {
  const web = url.match(WEB_RE);
  if (web) return `https://www.douyin.com/${web[1].toLowerCase()}/${web[2]}`;
  const share = url.match(SHARE_RE);
  if (share) {
    const kind = share[1].toLowerCase() === 'video' ? 'video' : 'note';
    return `https://www.douyin.com/${kind}/${share[2]}`;
  }
  const modal = url.match(/[?&]modal_id=(\d+)/);
  if (modal) return `https://www.douyin.com/video/${modal[1]}`;
  return null;
}

/** v.douyin.com 短链：跟随跳转拿到作品 ID，再转网页端链接；失败时原样返回 */
export async function resolveDouyinWebUrl(url: string): Promise<string> {
  const direct = toDouyinWebUrl(url);
  if (direct) return direct;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': DOUYIN_DESKTOP_UA },
      redirect: 'follow',
    });
    return toDouyinWebUrl(resp.url) ?? url;
  } catch {
    return url;
  }
}
