import { Directory, File } from 'expo-file-system';

/**
 * 小红书笔记的附加信息：原标题/正文、话题、发布时间、互动数、评论。
 * 保存前图片/头像是远程 URL；保存后被替换成笔记目录下的相对路径（xhs/xxx.jpg）。
 */
export type XhsComment = {
  id: string;
  author: string;
  avatar?: string;
  content: string;
  /** 毫秒时间戳 */
  time?: number;
  /** 拿不到时间戳时的原始时间文案（DOM 兜底，如「3天前」） */
  timeText?: string;
  location?: string;
  likes?: string;
  isAuthor?: boolean;
  /** 楼中楼：回复的对象昵称 */
  replyTo?: string;
  pictures?: string[];
  replies?: XhsComment[];
  /** 该评论的回复总数（可能大于已保存的 replies） */
  replyCount?: number;
};

export type XhsExtra = {
  title?: string;
  desc?: string;
  authorAvatar?: string;
  publishTime?: number;
  ipLocation?: string;
  topics?: string[];
  likedCount?: string;
  collectedCount?: string;
  commentCount?: string;
  comments?: XhsComment[];
};

const MAX_COMMENTS = 300;
const MAX_REPLIES = 50;

function str(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function toMs(v: any): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? n * 1000 : n;
}

function fixUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('http://')) return `https://${u.slice(7)}`;
  return /^https?:\/\//i.test(u) ? u : undefined;
}

function pictureUrl(p: any): string | undefined {
  if (typeof p === 'string') return fixUrl(p);
  if (!p || typeof p !== 'object') return undefined;
  const info = Array.isArray(p.infoList ?? p.info_list)
    ? (p.infoList ?? p.info_list)
    : [];
  const fromInfo =
    info.find((i: any) => /DFT/i.test(i?.imageScene ?? i?.image_scene ?? ''))?.url ??
    info[info.length - 1]?.url;
  return fixUrl(
    str(p.urlDefault, p.url_default, fromInfo, p.url, p.urlPre, p.url_pre),
  );
}

function normalizeOne(
  c: any,
  authorUserId: string | undefined,
  depth: number,
): XhsComment | null {
  if (!c || typeof c !== 'object') return null;
  const user = c.userInfo ?? c.user_info ?? c.user ?? c.author ?? {};
  const content = str(c.content) ?? '';
  const pictures = (Array.isArray(c.pictures) ? c.pictures : [])
    .map(pictureUrl)
    .filter(Boolean) as string[];
  if (!content && pictures.length === 0) return null;

  const tags: any[] = Array.isArray(c.showTags ?? c.show_tags)
    ? (c.showTags ?? c.show_tags)
    : [];
  const userId = str(user.userId, user.user_id);
  const target = c.targetComment ?? c.target_comment;
  const targetUser = target?.userInfo ?? target?.user_info;

  const rawReplies = Array.isArray(c.subComments ?? c.sub_comments)
    ? (c.subComments ?? c.sub_comments)
    : [];
  const replies =
    depth === 0
      ? (rawReplies
          .slice(0, MAX_REPLIES)
          .map((r: any) => normalizeOne(r, authorUserId, 1))
          .filter(Boolean) as XhsComment[])
      : [];
  const replyCountNum = Number(c.subCommentCount ?? c.sub_comment_count);

  return {
    id:
      str(c.id, c.commentId, c.comment_id) ??
      `${Math.random().toString(36).slice(2, 10)}`,
    author: str(user.nickname, user.nickName, user.name) ?? '小红书用户',
    avatar: fixUrl(str(user.image, user.avatar, user.images)),
    content,
    time: toMs(c.createTime ?? c.create_time),
    timeText: str(c.timeText),
    location: str(c.ipLocation, c.ip_location),
    likes: str(c.likeCount, c.like_count),
    isAuthor:
      tags.some((t) => /author/i.test(String(t))) ||
      (!!authorUserId && userId === authorUserId) ||
      !!c.isAuthor,
    replyTo: depth > 0 ? str(targetUser?.nickname, targetUser?.nickName) : undefined,
    pictures: pictures.length ? pictures : undefined,
    replies: replies.length ? replies : undefined,
    replyCount: Number.isFinite(replyCountNum) && replyCountNum > 0 ? replyCountNum : undefined,
  };
}

/** 兼容 PC 网页（camelCase）、移动网页（snake_case）和 DOM 兜底三种结构 */
export function normalizeXhsComments(
  raw: any,
  authorUserId?: string,
): XhsComment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_COMMENTS)
    .map((c) => normalizeOne(c, authorUserId, 0))
    .filter(Boolean) as XhsComment[];
}

/** 从笔记对象里取话题、发布时间、IP 属地、互动数 */
export function normalizeXhsNoteMeta(note: any): Partial<XhsExtra> & {
  userId?: string;
} {
  if (!note || typeof note !== 'object') return {};
  const tagList = note.tagList ?? note.tag_list;
  const topics = Array.isArray(tagList)
    ? (tagList
        .filter((t: any) => !t?.type || t.type === 'topic')
        .map((t: any) => str(t?.name))
        .filter(Boolean) as string[])
    : [];
  const interact = note.interactInfo ?? note.interact_info ?? {};
  const user = note.user ?? {};
  return {
    publishTime: toMs(note.time ?? note.publishTime ?? note.publish_time),
    ipLocation: str(note.ipLocation, note.ip_location),
    topics: topics.length ? topics : undefined,
    likedCount: str(interact.likedCount, interact.liked_count),
    collectedCount: str(interact.collectedCount, interact.collected_count),
    commentCount: str(interact.commentCount, interact.comment_count),
    userId: str(user.userId, user.user_id, note.userId),
  };
}

function looksLikeComment(x: any): boolean {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.content === 'string' &&
    typeof (x.userInfo ?? x.user_info ?? x.user ?? x.author) === 'object' &&
    (x.id ?? x.commentId ?? x.comment_id) != null
  );
}

/** 广度优先找第一个「评论数组」，顶层列表会比楼中楼先被找到 */
export function findCommentList(state: any): any[] | null {
  if (!state || typeof state !== 'object') return null;
  const queue: Array<{ node: any; depth: number }> = [{ node: state, depth: 0 }];
  const seen = new Set<any>();
  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (!node || typeof node !== 'object' || seen.has(node) || depth > 10) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length && looksLikeComment(node[0])) return node;
      node.forEach((n) => queue.push({ node: n, depth: depth + 1 }));
      continue;
    }
    for (const k of Object.keys(node)) {
      try {
        queue.push({ node: node[k], depth: depth + 1 });
      } catch {}
    }
  }
  return null;
}

export type XhsGrabbed = {
  title?: string;
  desc?: string;
  authorAvatar?: string;
  noteMeta?: any;
  rawComments?: any[];
  domComments?: any[];
};

/** 把 WebView / SSR 抓到的原始数据整理成 XhsExtra（仍是远程 URL） */
export function buildXhsExtra(g: XhsGrabbed): XhsExtra {
  const meta = normalizeXhsNoteMeta(g.noteMeta);
  const { userId, ...metaRest } = meta;
  const fromState = normalizeXhsComments(g.rawComments, userId);
  const comments = fromState.length
    ? fromState
    : normalizeXhsComments(g.domComments, userId);
  return {
    ...metaRest,
    title: g.title?.trim() || undefined,
    desc: g.desc?.trim() || undefined,
    authorAvatar: fixUrl(g.authorAvatar),
    comments: comments.length ? comments : undefined,
  };
}

export function countXhsComments(extra: XhsExtra | undefined): number {
  return (extra?.comments ?? []).reduce(
    (sum, c) => sum + 1 + (c.replies?.length ?? 0),
    0,
  );
}

const SUBDIR = 'xhs';
const CONCURRENCY = 4;

/**
 * 把头像、评论图片下载到笔记目录的 xhs/ 下，返回替换成相对路径的副本。
 * 单张失败不影响整体：保留远程 URL 兜底（联网时还能显示）。
 */
export async function downloadXhsExtra(
  noteDir: Directory,
  extra: XhsExtra,
  onProgress?: (done: number, total: number) => void,
): Promise<XhsExtra> {
  const urls = new Map<string, string>(); // remote -> local name
  let a = 0;
  let p = 0;
  const addAvatar = (u?: string) => {
    if (u && !urls.has(u)) urls.set(u, `${SUBDIR}/a-${++a}.jpg`);
  };
  const addPic = (u?: string) => {
    if (u && !urls.has(u)) urls.set(u, `${SUBDIR}/p-${++p}.jpg`);
  };

  addAvatar(extra.authorAvatar);
  for (const c of extra.comments ?? []) {
    addAvatar(c.avatar);
    c.pictures?.forEach(addPic);
    for (const r of c.replies ?? []) {
      addAvatar(r.avatar);
      r.pictures?.forEach(addPic);
    }
  }

  if (urls.size === 0) return extra;

  const dir = new Directory(noteDir, SUBDIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const entries = [...urls.entries()];
  const ok = new Set<string>();
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length) {
      const [remote, local] = entries[cursor++];
      try {
        const file = new File(dir, local.slice(SUBDIR.length + 1));
        if (file.exists) file.delete();
        await File.createDownloadTask(remote, file, {}).downloadAsync();
        if (file.exists && (file.size ?? 0) > 0) ok.add(remote);
      } catch {
        // 留远程地址兜底
      }
      done++;
      onProgress?.(done, entries.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );

  const map = (u?: string) => (u && ok.has(u) ? urls.get(u) : u);
  const mapComment = (c: XhsComment): XhsComment => ({
    ...c,
    avatar: map(c.avatar),
    pictures: c.pictures?.map((u) => map(u)!),
    replies: c.replies?.map(mapComment),
  });

  return {
    ...extra,
    authorAvatar: map(extra.authorAvatar),
    comments: extra.comments?.map(mapComment),
  };
}
