import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Category } from '../lib/categories';
import { deleteNote, updateNote, type Note } from '../lib/notes';
import NoteCard from './NoteCard';

type Props = {
  /** Pre-filtered notes (e.g. only one category) or all notes */
  notes: Note[];
  /** All categories, used by the "move to" action sheet */
  categories: Category[];
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  /** Called after a note is moved or deleted, so parent can reload */
  onChanged?: () => void | Promise<void>;
  onOpenNote: (note: Note) => void;
  /** Whether to show the search box (default true) */
  showSearch?: boolean;
  /** Empty state when notes prop is empty before any filtering */
  emptyTitle?: string;
  emptyHint?: string;
};

export default function NotesList({
  notes,
  categories,
  loading,
  refreshing,
  onRefresh,
  onChanged,
  onOpenNote,
  showSearch = true,
  emptyTitle = '还没有笔记',
  emptyHint,
}: Props) {
  const { showActionSheetWithOptions } = useActionSheet();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const hay = [n.title, n.author, n.caption, n.note]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [notes, query]);

  const confirmDelete = (note: Note, closeSwipe?: () => void) => {
    Alert.alert('删除这条笔记？', note.title ?? note.id, [
      { text: '取消', style: 'cancel', onPress: () => closeSwipe?.() },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            deleteNote(note);
          } catch {}
          await onChanged?.();
        },
      },
    ]);
  };

  const handleMoveToCategory = useCallback(
    (note: Note) => {
      const targets: { id?: string; label: string }[] = [
        { id: undefined, label: '未分类' },
        ...categories.map((c) => ({ id: c.id, label: c.name })),
      ];
      const currentIndex = targets.findIndex((t) => t.id === note.categoryId);
      const labels = targets.map((t, i) => {
        const mark = i === currentIndex ? ' ✓' : '';
        return `${t.label}${mark}`;
      });
      const cancelIndex = labels.length;
      const options = [...labels, '取消'];

      showActionSheetWithOptions(
        {
          title: '移动到分类',
          message: note.title ?? note.author ?? undefined,
          options,
          cancelButtonIndex: cancelIndex,
          userInterfaceStyle: 'light',
        },
        async (selected) => {
          if (selected === undefined || selected === cancelIndex) return;
          const target = targets[selected];
          if (!target) return;
          if (target.id === note.categoryId) return;
          await updateNote(note.id, { categoryId: target.id });
          await onChanged?.();
        },
      );
    },
    [categories, onChanged, showActionSheetWithOptions],
  );

  const renderItem = ({ item }: { item: Note }) => (
    <NoteCard
      note={item}
      onPress={onOpenNote}
      onDelete={confirmDelete}
      onLongPress={handleMoveToCategory}
    />
  );

  return (
    <View style={styles.container}>
      {showSearch && (
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#888" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索标题、作者、文案或备注"
            placeholderTextColor="#999"
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color="#bbb" />
            </Pressable>
          )}
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filtered.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              {notes.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                  {emptyHint && (
                    <Text style={styles.emptyHint}>{emptyHint}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>没找到匹配的笔记</Text>
                  <Text style={styles.emptyHint}>换个关键词试试</Text>
                </>
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBox: {
    marginHorizontal: 20,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});
