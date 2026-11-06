import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { listTags, tagKey } from '../lib/tags';
import MoveToCategorySheet from './MoveToCategorySheet';
import NoteFilterPanel, {
  DEFAULT_NOTE_FILTER,
  type NoteFilter,
} from './NoteFilterPanel';
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
  const availableTags = useMemo(() => {
    if (!enableFilter) return [];
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
  }, [enableFilter, notes, tagOrder]);

  // 已选标签如果在当前列表里不存在了（被删/改），不参与筛选
  const activeTagKeys = useMemo(() => {
    const available = new Set(availableTags.map(tagKey));
    return new Set(filter.tags.map(tagKey).filter((k) => available.has(k)));
  }, [filter.tags, availableTags]);

  const filterActive =
    enableFilter &&
    (filter.source !== 'all' ||
      filter.sort !== 'newest' ||
      activeTagKeys.size > 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = notes.filter((n) => {
      if (enableFilter) {
        if (
          filter.source !== 'all' &&
          (n.source ?? 'instagram') !== filter.source
        ) {
          return false;
        }
        if (
          activeTagKeys.size > 0 &&
          !(n.tags ?? []).some((t) => activeTagKeys.has(tagKey(t)))
        ) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [n.title, n.author, n.caption, n.note, ...(n.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    if (enableFilter) {
      // 按发布时间排；没有发布时间的（老笔记 / IG）用保存时间
      const dir = filter.sort === 'oldest' ? 1 : -1;
      const ts = (n: Note) => n.xhs?.publishTime ?? n.createdAt;
      result.sort((a, b) => (ts(a) - ts(b)) * dir);
    }
    return result;
  }, [notes, query, enableFilter, filter.source, filter.sort, activeTagKeys]);

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
