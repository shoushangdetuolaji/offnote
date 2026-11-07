import type { Note, NoteSource } from './notes';
import { tagKey } from './tags';

/** 分类筛选的保留值；其余取值为分类 id */
export const CATEGORY_ALL = 'all';
export const CATEGORY_UNCATEGORIZED = '__uncategorized__';

export type NoteFilter = {
  /** 'all' / '__uncategorized__' / 分类 id；只在首页使用 */
  category: string;
  source: 'all' | NoteSource;
  sort: 'newest' | 'oldest';
  /** 命中任一标签即显示；空数组 = 不限 */
  tags: string[];
};

export const DEFAULT_NOTE_FILTER: NoteFilter = {
  category: CATEGORY_ALL,
  source: 'all',
  sort: 'newest',
  tags: [],
};

/**
 * 列表里出现过的标签，按标签库顺序（最近使用）排列。
 * tagOrder 为 tagKey 数组。
 */
export function collectTags(notes: Note[], tagOrder: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const n of notes) {
    for (const t of n.tags ?? []) {
      const k = tagKey(t);
      if (!byKey.has(k)) byKey.set(k, t);
    }
  }
  const rank = new Map(tagOrder.map((k, i) => [k, i]));
  return [...byKey.entries()]
    .sort(
      ([a], [b]) =>
        (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([, name]) => name);
}

/** 已选标签里仍存在于当前列表的部分（被删/改名的不参与筛选） */
export function activeTagKeys(filter: NoteFilter, availableTags: string[]): Set<string> {
  const available = new Set(availableTags.map(tagKey));
  return new Set(filter.tags.map(tagKey).filter((k) => available.has(k)));
}

export function isFilterActive(filter: NoteFilter, tagKeys: Set<string>): boolean {
  return (
    filter.category !== CATEGORY_ALL ||
    filter.source !== 'all' ||
    filter.sort !== 'newest' ||
    tagKeys.size > 0
  );
}

function matchesQuery(n: Note, q: string): boolean {
  if (!q) return true;
  const hay = [n.title, n.author, n.caption, n.note, ...(n.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** 按 分类 / 来源 / 标签（任一）/ 关键词 过滤，再按收录时间排序。卡片上显示的仍是发布时间。 */
export function applyNoteFilter(
  notes: Note[],
  filter: NoteFilter,
  query: string,
  tagKeys: Set<string>,
): Note[] {
  const q = query.trim().toLowerCase();
  const result = notes.filter((n) => {
    if (filter.category === CATEGORY_UNCATEGORIZED) {
      if (n.categoryId) return false;
    } else if (filter.category !== CATEGORY_ALL) {
      if (n.categoryId !== filter.category) return false;
    }
    if (filter.source !== 'all' && (n.source ?? 'instagram') !== filter.source) {
      return false;
    }
    if (tagKeys.size > 0 && !(n.tags ?? []).some((t) => tagKeys.has(tagKey(t)))) {
      return false;
    }
    return matchesQuery(n, q);
  });
  const dir = filter.sort === 'oldest' ? 1 : -1;
  return result.sort((a, b) => (a.createdAt - b.createdAt) * dir);
}
