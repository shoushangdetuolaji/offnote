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

export async function createCategory(name: string): Promise<Category | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cats = await listCategories();
  if (cats.some((c) => c.name === trimmed)) {
    return cats.find((c) => c.name === trimmed) ?? null;
  }
  const next: Category = {
    id: uid(),
    name: trimmed.slice(0, 40),
    createdAt: Date.now(),
  };
  await saveAll([...cats, next]);
  return next;
}

export async function renameCategory(
  id: string,
  newName: string,
): Promise<Category | null> {
  const trimmed = newName.trim().slice(0, 40);
  if (!trimmed) return null;
  const cats = await listCategories();
  const next = cats.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
  await saveAll(next);
  return next.find((c) => c.id === id) ?? null;
}

export async function deleteCategory(id: string): Promise<void> {
  const cats = await listCategories();
  await saveAll(cats.filter((c) => c.id !== id));
}

export async function getCategory(id: string): Promise<Category | null> {
  const cats = await listCategories();
  return cats.find((c) => c.id === id) ?? null;
}
