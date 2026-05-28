import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import NoteCard from '../components/NoteCard';
import { listCategories, type Category } from '../lib/categories';
import {
  deleteNote,
  listNotes,
  updateNote,
  type Note,
} from '../lib/notes';
import { extractInstagramUrl } from '../lib/url';
import CobaltWebScreen from './CobaltWebScreen';
import NoteViewerScreen from './NoteViewerScreen';

type FilterKey =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'uncategorized' }
  | { kind: 'category'; id: string };

export default function HomeScreen() {
  const { showActionSheetWithOptions } = useActionSheet();
  const [webVisible, setWebVisible] = useState(false);
  const [webSourceUrl, setWebSourceUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const lastHandledRef = useRef<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>({ kind: 'all' });

  const reloadAll = useCallback(async () => {
    const [ns, cats] = await Promise.all([listNotes(), listCategories()]);
    setNotes(ns);
    setCategories(cats);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      switch (filter.kind) {
        case 'starred':
          if (!n.starred) return false;
          break;
        case 'uncategorized':
          if (n.categoryId) return false;
          break;
        case 'category':
          if (n.categoryId !== filter.id) return false;
          break;
      }
      if (!q) return true;
      const hay = [n.title, n.author, n.caption, n.note]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [notes, query, filter]);

  useFocusEffect(
    useCallback(() => {
      reloadAll();
    }, [reloadAll]),
  );

  useEffect(() => {
    (async () => {
      await reloadAll();
      setLoading(false);
    })();
  }, [reloadAll]);

  const checkClipboardForInstagram = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const hasUrl = await Clipboard.hasUrlAsync();
      if (!hasUrl) return;
    }
    const text = await Clipboard.getStringAsync();
    const url = extractInstagramUrl(text);
    if (!url) return;
    if (lastHandledRef.current === url) return;
    lastHandledRef.current = url;
    setPendingUrl(url);
  }, []);

  useEffect(() => {
    checkClipboardForInstagram();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        checkClipboardForInstagram();
        reloadAll();
      }
    });
    return () => sub.remove();
  }, [checkClipboardForInstagram, reloadAll]);

  const openWebWithPending = () => {
    if (!pendingUrl) return;
    setWebSourceUrl(pendingUrl);
    setPendingUrl(null);
    setWebVisible(true);
  };

  const openWebManually = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    setWebSourceUrl(extractInstagramUrl(text) ?? null);
    setWebVisible(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  };

  const confirmDelete = (note: Note, closeSwipe?: () => void) => {
    Alert.alert('删除这条笔记？', note.title ?? note.id, [
      {
        text: '取消',
        style: 'cancel',
        onPress: () => closeSwipe?.(),
      },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          try {
            deleteNote(note);
          } catch {}
          reloadAll();
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
          await reloadAll();
        },
      );
    },
    [categories, reloadAll, showActionSheetWithOptions],
  );

  const renderItem = ({ item }: { item: Note }) => (
    <NoteCard
      note={item}
      onPress={setActiveNote}
      onDelete={confirmDelete}
      onLongPress={handleMoveToCategory}
    />
  );

  type TabSpec = { key: string; label: string; count: number; filter: FilterKey; icon?: 'star' };
  const tabs: TabSpec[] = [
    { key: 'all', label: '全部', count: notes.length, filter: { kind: 'all' } },
    {
      key: 'starred',
      label: '星标',
      count: notes.filter((n) => n.starred).length,
      filter: { kind: 'starred' },
      icon: 'star',
    },
    {
      key: 'uncategorized',
      label: '未分类',
      count: notes.filter((n) => !n.categoryId).length,
      filter: { kind: 'uncategorized' },
    },
    ...categories.map((c) => ({
      key: `cat:${c.id}`,
      label: c.name,
      count: notes.filter((n) => n.categoryId === c.id).length,
      filter: { kind: 'category' as const, id: c.id },
    })),
  ];

  const isActive = (t: TabSpec) => {
    if (filter.kind !== t.filter.kind) return false;
    if (filter.kind === 'category' && t.filter.kind === 'category') {
      return filter.id === t.filter.id;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>OffNote</Text>
          <Text style={styles.subtitle}>
            {notes.length > 0 ? `${notes.length} 条离线笔记` : '保存随时可离线读'}
          </Text>
        </View>
        <Pressable onPress={openWebManually} style={styles.headerCta}>
          <Text style={styles.headerCtaText}>+ 新增</Text>
        </Pressable>
      </View>

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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsScroll}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((t) => {
          const active = isActive(t);
          return (
            <Pressable
              key={t.key}
              onPress={() => setFilter(t.filter)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              {t.icon === 'star' && (
                <Ionicons
                  name="star"
                  size={12}
                  color={active ? '#fff' : '#f5b400'}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
                {t.count > 0 ? ` ${t.count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {pendingUrl && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>剪贴板里有 Instagram 链接</Text>
          <Text style={styles.bannerUrl} numberOfLines={1}>
            {pendingUrl}
          </Text>
          <View style={styles.bannerActions}>
            <Pressable
              onPress={() => {
                lastHandledRef.current = null;
                setPendingUrl(null);
              }}
              style={[styles.smallBtn, styles.smallBtnGhost]}
            >
              <Text style={styles.smallBtnGhostText}>忽略</Text>
            </Pressable>
            <Pressable
              onPress={openWebWithPending}
              style={[styles.smallBtn, styles.smallBtnPrimary]}
            >
              <Text style={styles.smallBtnPrimaryText}>下载</Text>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        data={filteredNotes}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          filteredNotes.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              {notes.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>还没有离线笔记</Text>
                  <Text style={styles.emptyHint}>
                    复制 Instagram 链接 → 点右上「+ 新增」开始保存
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>没找到匹配的笔记</Text>
                  <Text style={styles.emptyHint}>
                    换个关键词，或切换上方分类
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
      />

      <CobaltWebScreen
        visible={webVisible}
        sourceUrl={webSourceUrl}
        onClose={async () => {
          setWebVisible(false);
          await reloadAll();
        }}
      />

      <NoteViewerScreen
        note={activeNote}
        onClose={() => setActiveNote(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
  },
  headerCta: {
    backgroundColor: '#111',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  headerCtaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  searchBox: {
    marginHorizontal: 20,
    marginTop: 6,
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
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 44,
    marginTop: 10,
    marginBottom: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  tabBtnActive: {
    backgroundColor: '#111',
  },
  tabText: {
    fontSize: 13,
    color: '#444',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  banner: {
    marginHorizontal: 20,
    backgroundColor: '#f6f8fb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6ecf2',
    marginTop: 10,
  },
  bannerTitle: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
  },
  bannerUrl: {
    fontSize: 12,
    color: '#111',
    marginBottom: 12,
  },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  smallBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  smallBtnPrimary: { backgroundColor: '#111' },
  smallBtnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  smallBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dcdcdc' },
  smallBtnGhostText: { color: '#444', fontSize: 13 },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
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
