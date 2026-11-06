import AsyncStorage from '@react-native-async-storage/async-storage';

export const TAG_KEY = 'offnote:tags';

export type Tag = {
  name: string;
  createdAt: number;
  /** 最近一次被打到笔记上的时间，用于「最近使用」排序 */
  lastUsedAt: number;
};

export const TAG_MAX_LEN = 20;

export function cleanTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().replace(/^#+/, '').slice(0, TAG_MAX_LEN);
}

export function tagKey(name: string): string {
  return cleanTagName(name).toLocaleLowerCase();
}

/** 去空、去重（大小写不敏感，保留首次出现的写法） */
export function normalizeTags(names: string[] | undefined): string[] {
  if (!names?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = cleanTagName(raw);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function sortTags(tags: Tag[]): Tag[] {
  return tags.sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt || b.createdAt - a.createdAt,
  );
}

async function readAll(): Promise<Tag[]> {
  try {
    const raw = await AsyncStorage.getItem(TAG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Tag[];
    return Array.isArray(arr) ? arr.filter((t) => t && t.name) : [];
  } catch {
    return [];
  }
}

async function saveAll(tags: Tag[]): Promise<void> {
  await AsyncStorage.setItem(TAG_KEY, JSON.stringify(tags));
}

/** 标签库，按最近使用倒序 */
export async function listTags(): Promise<Tag[]> {
  return sortTags(await readAll());
}

/**
 * 把这些标签标记为「刚刚使用」，不存在的自动加入标签库。
 * 保存/编辑笔记标签时调用。
 */
export async function touchTags(names: string[]): Promise<void> {
  const clean = normalizeTags(names);
  if (!clean.length) return;
  const now = Date.now();
  const all = await readAll();
  const byKey = new Map(all.map((t) => [tagKey(t.name), t]));
  clean.forEach((name, i) => {
    // 同一批里靠前的稍微新一点，保持用户勾选的先后顺序
    const ts = now - i;
    const hit = byKey.get(tagKey(name));
    if (hit) {
      hit.lastUsedAt = Math.max(hit.lastUsedAt, ts);
    } else {
      const t: Tag = { name, createdAt: ts, lastUsedAt: ts };
      all.push(t);
      byKey.set(tagKey(name), t);
    }
  });
  await saveAll(all);
}

/** 合并外部来源的标签（备份恢复 / 从笔记里补登记），不改动已有标签的时间 */
export async function mergeTags(incoming: Array<Tag | string>): Promise<void> {
  if (!incoming.length) return;
  const all = await readAll();
  const keys = new Set(all.map((t) => tagKey(t.name)));
  let changed = false;
  for (const item of incoming) {
    const t: Tag =
      typeof item === 'string'
        ? { name: item, createdAt: 0, lastUsedAt: 0 }
        : item;
    const name = cleanTagName(t.name ?? '');
    const key = name.toLocaleLowerCase();
    if (!name || keys.has(key)) continue;
    keys.add(key);
    all.push({
      name,
      createdAt: t.createdAt ?? 0,
      lastUsedAt: t.lastUsedAt ?? t.createdAt ?? 0,
    });
    changed = true;
  }
  if (changed) await saveAll(all);
}
