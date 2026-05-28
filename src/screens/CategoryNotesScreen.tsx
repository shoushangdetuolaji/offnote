import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import NotesList from '../components/NotesList';
import { listCategories, type Category } from '../lib/categories';
import { listNotes, type Note } from '../lib/notes';
import NoteViewerScreen from './NoteViewerScreen';
import type { CategoriesStackParamList } from '../navigation/CategoriesStack';

type Props = NativeStackScreenProps<CategoriesStackParamList, 'CategoryNotes'>;

const UNCATEGORIZED = '__uncategorized__';

export default function CategoryNotesScreen({ navigation, route }: Props) {
  const { categoryId, categoryName } = route.params;
  const isUncategorized = categoryId === UNCATEGORIZED;

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const reload = useCallback(async () => {
    const [ns, cats] = await Promise.all([listNotes(), listCategories()]);
    setNotes(ns);
    setCategories(cats);
    if (isUncategorized) return;
    // If category was renamed elsewhere, sync header title
    const fresh = cats.find((c) => c.id === categoryId);
    if (fresh && fresh.name !== categoryName) {
      navigation.setOptions({ title: fresh.name });
    }
  }, [categoryId, categoryName, navigation, isUncategorized]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await reload();
        setLoading(false);
      })();
    }, [reload]),
  );

  const scoped = useMemo(
    () =>
      notes.filter((n) =>
        isUncategorized ? !n.categoryId : n.categoryId === categoryId,
      ),
    [notes, categoryId, isUncategorized],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.spacer} />
      <NotesList
        notes={scoped}
        categories={categories}
        loading={loading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onChanged={reload}
        onOpenNote={setActiveNote}
        emptyTitle="这个分类还没有笔记"
        emptyHint="长按其他笔记 → 移动到这里"
      />
      <NoteViewerScreen
        note={activeNote}
        onClose={() => setActiveNote(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  spacer: { height: 8 },
});
