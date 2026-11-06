import AsyncStorage from '@react-native-async-storage/async-storage';
import { pinyin } from 'pinyin-pro';

export type TagSortMode = 'recent' | 'az';

const SORT_KEY = 'offnote:tags:sort';

export async function getTagSortMode(): Promise<TagSortMode> {
  try {
    const v = await AsyncStorage.getItem(SORT_KEY);
    return v === 'az' ? 'az' : 'recent';
  } catch {
    return 'recent';
  }
}

export async function setTagSortMode(mode: TagSortMode): Promise<void> {
  try {
    await AsyncStorage.setItem(SORT_KEY, mode);
  } catch {}
}

export type TagIndexInfo = {
  /** 全拼（小写、无声调），用于排序和搜索，如 西藏 -> xizang */
  full: string;
  /** 首字母串，如 西藏 -> xz */
  initials: string;
  /** 分组字母 A-Z，非字母开头归到 # */
  letter: string;
};

const cache = new Map<string, TagIndexInfo>();

export function tagIndexInfo(name: string): TagIndexInfo {
  const hit = cache.get(name);
  if (hit) return hit;
  let full = name.toLowerCase();
  let initials = full;
  try {
    full = pinyin(name, { toneType: 'none', type: 'array', v: true })
      .join('')
      .toLowerCase();
    initials = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase();
  } catch {
    // 拼音失败就按原文排
  }
  const first = full.charAt(0).toUpperCase();
  const info: TagIndexInfo = {
    full,
    initials,
    letter: first >= 'A' && first <= 'Z' ? first : '#',
  };
  cache.set(name, info);
  return info;
}

/** 搜索：原文包含，或全拼/首字母前缀匹配（xz、xizang 都能搜到 西藏） */
export function tagMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (name.toLowerCase().includes(q)) return true;
  const info = tagIndexInfo(name);
  return info.full.includes(q) || info.initials.startsWith(q);
}

export const INDEX_LETTERS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  '#',
];

/** 按字母分组，组内按全拼排序；# 组放最后 */
export function groupTagsByLetter(
  names: string[],
): Array<{ letter: string; data: string[] }> {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const { letter } = tagIndexInfo(n);
    const arr = groups.get(letter) ?? [];
    arr.push(n);
    groups.set(letter, arr);
  }
  return INDEX_LETTERS.filter((l) => groups.has(l)).map((letter) => ({
    letter,
    data: groups
      .get(letter)!
      .sort((a, b) =>
        tagIndexInfo(a).full.localeCompare(tagIndexInfo(b).full) ||
        a.localeCompare(b),
      ),
  }));
}
