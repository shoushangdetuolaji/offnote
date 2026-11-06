import type { XhsExtra } from './xhsExtra';

/** 用手机 UA 打开分享链接，会落到 iesdouyin.com 的分享页（服务端渲染，带 _ROUTER_DATA） */
export const DOUYIN_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** 下载视频/图片时带上，部分 CDN 会校验 UA 和 Referer */
export const DOUYIN_MEDIA_HEADERS: Record<string, string> = {
  'User-Agent': DOUYIN_UA,
  Referer: 'https://www.douyin.com/',
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
      headers: { 'User-Agent': DOUYIN_UA },
      redirect: 'follow',
    });
    return toDouyinWebUrl(resp.url) ?? url;
  } catch {
    return url;
  }
}
