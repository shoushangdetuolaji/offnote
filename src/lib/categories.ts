import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'offnote:categories';

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function listCategories(): Promise<Category[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Category[];
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

async function saveAll(cats: Category[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cats));
}

export type CategoryMutationResult =
  | { ok: true; category: Category }
  | { ok: false; reason: 'empty' | 'duplicate' };

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export async function isDuplicateName(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const key = normalize(name);
  if (!key) return false;
  const cats = await listCategories();
  return cats.some((c) => c.id !== excludeId && normalize(c.name) === key);
}

export async function createCategory(
  name: string,
): Promise<CategoryMutationResult> {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (await isDuplicateName(trimmed)) return { ok: false, reason: 'duplicate' };
  const next: Category = { id: uid(), name: trimmed, createdAt: Date.now() };
  const cats = await listCategories();
  await saveAll([...cats, next]);
  return { ok: true, category: next };
}

export async function renameCategory(
  id: string,
  newName: string,
): Promise<CategoryMutationResult> {
  const trimmed = newName.trim().slice(0, 40);
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (await isDuplicateName(trimmed, id)) {
    return { ok: false, reason: 'duplicate' };
  }
  const cats = await listCategories();
  const next = cats.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
  await saveAll(next);
  const updated = next.find((c) => c.id === id);
  return updated
    ? { ok: true, category: updated }
    : { ok: false, reason: 'empty' };
}

export async function deleteCategory(id: string): Promise<void> {
  const cats = await listCategories();
  await saveAll(cats.filter((c) => c.id !== id));
}

export async function getCategory(id: string): Promise<Category | null> {
  const cats = await listCategories();
  return cats.find((c) => c.id === id) ?? null;
}
