import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import MoveToCategorySheet from '../components/MoveToCategorySheet';
import NoteCard from '../components/NoteCard';
import PasteUrlModal from '../components/PasteUrlModal';
import SelectionBar from '../components/SelectionBar';
import SourcePickerSheet from '../components/SourcePickerSheet';
import Wordmark from '../components/Wordmark';
import { listCategories, type Category } from '../lib/categories';
import {
  deleteNote,
  listNotes,
  updateNote,
  type Note,
} from '../lib/notes';
import { extractSupportedUrl, isRednoteUrl } from '../lib/url';
import { saveXhsFromUrl } from '../lib/xhs';
import CobaltWebScreen from './CobaltWebScreen';
import NoteViewerScreen from './NoteViewerScreen';
import XhsWebScreen from './XhsWebScreen';

import type { NoteSource } from '../lib/notes';

type FilterKey =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'uncategorized' }
  | { kind: 'category'; id: string };

export default function HomeScreen() {
  const [webVisible, setWebVisible] = useState(false);
  const [webSourceUrl, setWebSourceUrl] = useState<string | null>(null);
  const [xhsVisible, setXhsVisible] = useState(false);
  const [xhsSourceUrl, setXhsSourceUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<NoteSource | null>(null);
  const [moveTarget, setMoveTarget] = useState<Note | null>(null);
  const [bulkMoveVisible, setBulkMoveVisible] = useState(false);
  const [sourcePickerVisible, setSourcePickerVisible] = useState(false);
  const [xhsPasteVisible, setXhsPasteVisible] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedIds.size > 0;
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

  const tryImportXhs = useCallback(
    async (url: string) => {
      setBusyMsg('正在解析小红书链接…');
      const result = await saveXhsFromUrl(url, {
        onProgress: (msg) => setBusyMsg(msg),
      });
      setBusyMsg(null);
      if (result.ok) {
        Alert.alert(
          '已保存',
          `保存了 ${result.mediaCount} 个文件`,
        );
        await reloadAll();
        return;
      }
      // fallback to WebView (lets the page render JS to get past anti-bot)
      Alert.alert(
        '直接解析失败',
        '换用浏览器加载，加载完成后点右上「保存」',
        [
          {
            text: '好',
            onPress: () => {
              setXhsSourceUrl(url);
              setXhsVisible(true);
            },
          },
        ],
      );
    },
    [reloadAll],
  );

  const openForUrl = (url: string | null, source: NoteSource | null) => {
    if (source === 'rednote') {
      if (url) {
        tryImportXhs(url);
      } else {
        // no clipboard hit; ask user to paste one
        setXhsPasteVisible(true);
      }
    } else {
      // instagram → cobalt webview as before
      setWebSourceUrl(url);
      setWebVisible(true);
    }
  };

  const checkClipboard = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const hasUrl = await Clipboard.hasUrlAsync();
      if (!hasUrl) return;
    }
    const text = await Clipboard.getStringAsync();
    const hit = extractSupportedUrl(text);
    if (!hit) return;
    if (lastHandledRef.current === hit.url) return;
    lastHandledRef.current = hit.url;
    setPendingUrl(hit.url);
    setPendingSource(hit.source);
  }, []);

  useEffect(() => {
    checkClipboard();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        checkClipboard();
        reloadAll();
      }
    });
    return () => sub.remove();
  }, [checkClipboard, reloadAll]);

  const consumeUrl = (url: string) => {
    lastHandledRef.current = url;
  };

  const openWebWithPending = () => {
    if (!pendingUrl) return;
    const url = pendingUrl;
    const source = pendingSource;
    consumeUrl(url);
    setPendingUrl(null);
    setPendingSource(null);
    openForUrl(url, source);
  };

  const openWebManually = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const hit = extractSupportedUrl(text);
    // Skip auto-import if we've already handled this exact URL,
    // or if the user just dismissed it via the banner.
    if (hit && lastHandledRef.current !== hit.url) {
      consumeUrl(hit.url);
      // also clear pending banner so it doesn't reappear stale
      setPendingUrl(null);
      setPendingSource(null);
      openForUrl(hit.url, hit.source);
      return;
    }
    setSourcePickerVisible(true);
  };

  const handlePickSource = (source: NoteSource) => {
    setSourcePickerVisible(false);
    openForUrl(null, source);
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

  const handleLongPressNote = useCallback((note: Note) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      return next;
    });
  }, []);

  const handleNotePress = useCallback(
    (note: Note) => {
      if (selectionMode) {
        handleLongPressNote(note);
      } else {
        setActiveNote(note);
      }
    },
    [selectionMode, handleLongPressNote],
  );

  const exitSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const visibleIds = filteredNotes.map((n) => n.id);
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [filteredNotes]);

  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert('删除所选笔记？', `这将删除 ${ids.length} 条笔记，不可恢复`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          for (const id of ids) {
            const note = notes.find((n) => n.id === id);
            if (note) {
              try {
                deleteNote(note);
              } catch {}
            }
          }
          setSelectedIds(new Set());
          await reloadAll();
        },
      },
    ]);
  };

  const handleBulkPickCategory = useCallback(
    async (categoryId: string | undefined) => {
      const ids = Array.from(selectedIds);
      setBulkMoveVisible(false);
      if (ids.length === 0) return;
      for (const id of ids) {
        await updateNote(id, { categoryId });
      }
      setSelectedIds(new Set());
      await reloadAll();
    },
    [selectedIds, reloadAll],
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
      await reloadAll();
    },
    [moveTarget, reloadAll],
  );

  const renderItem = ({ item }: { item: Note }) => (
    <NoteCard
      note={item}
      onPress={handleNotePress}
      onDelete={confirmDelete}
      onLongPress={handleLongPressNote}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
    />
  );

  type TabSpec = { key: string; label: string; count: number; filter: FilterKey; icon?: 'star' };
  const tabs: TabSpec[] = [
    { key: 'all', label: '全部', count: notes.length, filter: { kind: 'all' } },
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
      {selectionMode ? (
        <SelectionBar
          count={selectedIds.size}
          totalVisible={filteredNotes.length}
          onExit={exitSelection}
          onSelectAll={toggleSelectAll}
          onMove={() => setBulkMoveVisible(true)}
          onDelete={confirmBulkDelete}
        />
      ) : (
        <View style={styles.header}>
          <Wordmark size={32} />
          <Pressable
            onPress={openWebManually}
            style={({ pressed }) => [styles.headerCta, pressed && styles.headerCtaPressed]}
            hitSlop={8}
            accessibilityLabel="新增笔记"
          >
            <Ionicons name="add" size={26} color="#111" />
          </Pressable>
        </View>
      )}

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
          <Text style={styles.bannerTitle}>
            剪贴板里有{pendingSource === 'rednote' ? ' 小红书 ' : ' Instagram '}链接
          </Text>
          <Text style={styles.bannerUrl} numberOfLines={1}>
            {pendingUrl}
          </Text>
          <View style={styles.bannerActions}>
            <Pressable
              onPress={() => {
                if (pendingUrl) consumeUrl(pendingUrl);
                setPendingUrl(null);
                setPendingSource(null);
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
                    复制 Instagram 链接 → 点右上「+」开始保存
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

      <XhsWebScreen
        visible={xhsVisible}
        sourceUrl={xhsSourceUrl}
        onClose={async () => {
          setXhsVisible(false);
          await reloadAll();
        }}
      />

      <NoteViewerScreen
        note={activeNote}
        onClose={() => setActiveNote(null)}
      />

      <MoveToCategorySheet
        note={moveTarget}
        categories={categories}
        onPick={handlePickCategory}
        onDismiss={() => setMoveTarget(null)}
      />

      <MoveToCategorySheet
        note={
          bulkMoveVisible
            ? ({
                id: '__bulk__',
                title: `${selectedIds.size} 条笔记`,
              } as unknown as Note)
            : null
        }
        categories={categories}
        onPick={handleBulkPickCategory}
        onDismiss={() => setBulkMoveVisible(false)}
      />

      <SourcePickerSheet
        visible={sourcePickerVisible}
        onPick={handlePickSource}
        onDismiss={() => setSourcePickerVisible(false)}
      />

      <PasteUrlModal
        visible={xhsPasteVisible}
        title="粘贴小红书链接"
        placeholder="支持小红书 App 分享文本或 xhslink/xiaohongshu 链接"
        validate={(t) => !!extractSupportedUrl(t)?.url && isRednoteUrl(extractSupportedUrl(t)!.url)}
        errorText="未识别到小红书链接"
        onCancel={() => setXhsPasteVisible(false)}
        onConfirm={(text) => {
          const hit = extractSupportedUrl(text);
          if (!hit || hit.source !== 'rednote') return;
          setXhsPasteVisible(false);
          tryImportXhs(hit.url);
        }}
      />

      {busyMsg && (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <View style={styles.busyCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.busyText}>{busyMsg}</Text>
          </View>
        </View>
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerCta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCtaPressed: {
    backgroundColor: '#f0f0f0',
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
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
  },
  busyText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
});
