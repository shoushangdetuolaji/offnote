import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Category } from '../lib/categories';
import {
  activeTagKeys,
  applyNoteFilter,
  collectTags,
  DEFAULT_NOTE_FILTER,
  isFilterActive,
  type NoteFilter,
} from '../lib/noteFilter';
import { updateNote, type Note } from '../lib/notes';
import { listTags, tagKey } from '../lib/tags';
import MoveToCategorySheet from './MoveToCategorySheet';
import NoteFilterPanel from './NoteFilterPanel';
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
  /** Show the filter button + panel next to the search box */
  enableFilter?: boolean;
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
  enableFilter = false,
  emptyTitle = '还没有笔记',
  emptyHint,
}: Props) {
  const [query, setQuery] = useState('');
  const [moveTarget, setMoveTarget] = useState<Note | null>(null);
  const [filter, setFilter] = useState<NoteFilter>(DEFAULT_NOTE_FILTER);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tagOrder, setTagOrder] = useState<string[]>([]);

  // 标签库顺序（最近使用）用于筛选面板排序；笔记变化时刷新
  useEffect(() => {
    if (!enableFilter) return;
    let alive = true;
    listTags().then((tags) => {
      if (alive) setTagOrder(tags.map((t) => tagKey(t.name)));
    });
    return () => {
      alive = false;
    };
  }, [enableFilter, notes]);

  /** 当前列表里出现过的标签，按标签库的最近使用排序 */
  const availableTags = useMemo(
    () => (enableFilter ? collectTags(notes, tagOrder) : []),
    [enableFilter, notes, tagOrder],
  );

  const tagKeys = useMemo(
    () => activeTagKeys(filter, availableTags),
    [filter, availableTags],
  );

  const filterActive = enableFilter && isFilterActive(filter, tagKeys);

  const filtered = useMemo(
    () =>
      applyNoteFilter(
        notes,
        enableFilter ? filter : DEFAULT_NOTE_FILTER,
        query,
        enableFilter ? tagKeys : new Set<string>(),
      ),
    [notes, query, enableFilter, filter, tagKeys],
  );

  const handleMoveToCategory = useCallback((note: Note) => {
    setMoveTarget(note);
  }, []);

  const handlePickCategory = useCallback(
    async (categoryId: string | undefined) => {
      const note = moveTarget;
      setMoveTarget(null);
      if (!note) return;
      if (note.categoryId === categoryId) return;
      await updateNote(note.id, { categoryId });
      await onChanged?.();
    },
    [moveTarget, onChanged],
  );

  const renderItem = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard
        note={item}
        onPress={onOpenNote}
        onLongPress={handleMoveToCategory}
      />
    ),
    [onOpenNote, handleMoveToCategory],
  );

  return (
    <View style={styles.container}>
      {showSearch && (
        <View style={styles.searchRow}>
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
          {enableFilter && (
            <Pressable
              onPress={() => setPanelOpen((v) => !v)}
              hitSlop={6}
              style={[
                styles.filterBtn,
                (panelOpen || filterActive) && styles.filterBtnActive,
              ]}
              accessibilityLabel="筛选"
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={filterActive ? '#ff2442' : '#333'}
              />
              <Text
                style={[
                  styles.filterBtnText,
                  filterActive && styles.filterBtnTextActive,
                ]}
              >
                筛选
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {enableFilter && panelOpen && (
        <NoteFilterPanel
          value={filter}
          onChange={setFilter}
          tags={availableTags}
          onCollapse={() => setPanelOpen(false)}
        />
      )}

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
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
                  <Text style={styles.emptyHint}>
                    {filterActive ? '换个关键词或筛选条件试试' : '换个关键词试试'}
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
      />

      <MoveToCategorySheet
        note={moveTarget}
        categories={categories}
        onPick={handlePickCategory}
        onDismiss={() => setMoveTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    marginHorizontal: 20,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  filterBtnActive: {
    backgroundColor: '#fff0f1',
  },
  filterBtnText: {
    fontSize: 14,
    color: '#333',
  },
  filterBtnTextActive: {
    color: '#ff2442',
    fontWeight: '600',
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
