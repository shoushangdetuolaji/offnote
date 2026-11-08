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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MoveToCategorySheet from '../components/MoveToCategorySheet';
import NoteFilterPanel, {
  type CategoryOption,
} from '../components/NoteFilterPanel';
import NoteCard from '../components/NoteCard';
import PasteUrlModal from '../components/PasteUrlModal';
import SelectionBar from '../components/SelectionBar';
import SourcePickerSheet from '../components/SourcePickerSheet';
import Wordmark from '../components/Wordmark';
import { listCategories, type Category } from '../lib/categories';
import {
  activeTagKeys,
  applyNoteFilter,
  CATEGORY_ALL,
  CATEGORY_UNCATEGORIZED,
  collectTags,
  DEFAULT_NOTE_FILTER,
  isFilterActive,
  type NoteFilter,
} from '../lib/noteFilter';
import {
  deleteNote,
  listNotes,
  updateNote,
  type Note,
} from '../lib/notes';
import { listTags, tagKey } from '../lib/tags';
import { extractSupportedUrl, isRednoteUrl } from '../lib/url';
import { saveXhsFromUrl } from '../lib/xhs';
import CobaltWebScreen from './CobaltWebScreen';
import DouyinWebScreen from './DouyinWebScreen';
import NoteViewerScreen from './NoteViewerScreen';
import XhsWebScreen from './XhsWebScreen';

import type { NoteSource } from '../lib/notes';

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
  const [douyinVisible, setDouyinVisible] = useState(false);
  const [douyinSourceUrl, setDouyinSourceUrl] = useState<string | null>(null);
  const [douyinPasteVisible, setDouyinPasteVisible] = useState(false);
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
  const [filter, setFilter] = useState<NoteFilter>(DEFAULT_NOTE_FILTER);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tagOrder, setTagOrder] = useState<string[]>([]);

  const reloadAll = useCallback(async () => {
    const [ns, cats, tags] = await Promise.all([
      listNotes(),
      listCategories(),
      listTags(),
    ]);
    setNotes(ns);
    setCategories(cats);
    setTagOrder(tags.map((t) => tagKey(t.name)));
  }, []);

  // 分类被删除后，筛选自动回到「不限」
  const effectiveFilter = useMemo<NoteFilter>(() => {
    const c = filter.category;
    if (
      c !== CATEGORY_ALL &&
      c !== CATEGORY_UNCATEGORIZED &&
      !categories.some((cat) => cat.id === c)
    ) {
      return { ...filter, category: CATEGORY_ALL };
    }
    return filter;
  }, [filter, categories]);

  const availableTags = useMemo(() => collectTags(notes, tagOrder), [notes, tagOrder]);
  const tagKeys = useMemo(
    () => activeTagKeys(effectiveFilter, availableTags),
    [effectiveFilter, availableTags],
  );
  const filterActive = isFilterActive(effectiveFilter, tagKeys);

  const filteredNotes = useMemo(
    () => applyNoteFilter(notes, effectiveFilter, query, tagKeys),
    [notes, effectiveFilter, query, tagKeys],
  );

  const bulkCategoryMark = useMemo(() => {
    const selected = notes.filter((n) => selectedIds.has(n.id));
    if (selected.length === 0) return { categoryId: undefined as string | undefined };
    const first = selected[0].categoryId;
    if (selected.every((n) => n.categoryId === first)) return { categoryId: first };
    return null;
  }, [notes, selectedIds]);

  const categoryOptions: CategoryOption[] = useMemo(
    () => [
      { value: CATEGORY_ALL, label: '不限' },
      { value: CATEGORY_UNCATEGORIZED, label: '未分类' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

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
    if (source === 'douyin') {
      // 抖音直接走 WebView：页面加载完点「保存」
      if (url) {
        setDouyinSourceUrl(url);
        setDouyinVisible(true);
      } else {
        setDouyinPasteVisible(true);
      }
      return;
    }
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

  const renderItem = useCallback(
    ({ item }: { item: Note }) => (
      <NoteCard
        note={item}
        onPress={handleNotePress}
        onLongPress={handleLongPressNote}
        selectionMode={selectionMode}
        selected={selectedIds.has(item.id)}
      />
    ),
    [handleNotePress, handleLongPressNote, selectionMode, selectedIds],
  );

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
          <Text style={[styles.filterBtnText, filterActive && styles.filterBtnTextActive]}>
            筛选
          </Text>
        </Pressable>
      </View>

      {panelOpen && (
        <NoteFilterPanel
          value={effectiveFilter}
          onChange={setFilter}
          tags={availableTags}
          categoryOptions={categoryOptions}
          onCollapse={() => setPanelOpen(false)}
        />
      )}

      {pendingUrl && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>
            剪贴板里有
            {pendingSource === 'rednote'
              ? ' 小红书 '
              : pendingSource === 'douyin'
                ? ' 抖音 '
                : ' Instagram '}
            链接
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
        extraData={selectionMode}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
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
                    复制小红书 / 抖音 / Instagram 链接 → 点右上「+」开始保存
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>没找到匹配的笔记</Text>
                  <Text style={styles.emptyHint}>
                    {filterActive ? '换个关键词或调整筛选条件' : '换个关键词试试'}
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

      <DouyinWebScreen
        visible={douyinVisible}
        sourceUrl={douyinSourceUrl}
        onClose={async () => {
          setDouyinVisible(false);
          await reloadAll();
        }}
      />

      <NoteViewerScreen
        note={activeNote}
        onClose={() => setActiveNote(null)}
        onDeleted={() => {
          setActiveNote(null);
          reloadAll();
        }}
        onUpdated={(n) => {
          setActiveNote(n);
          reloadAll();
        }}
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
        mark={bulkCategoryMark}
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

      <PasteUrlModal
        visible={douyinPasteVisible}
        title="粘贴抖音链接"
        placeholder="支持抖音 App 分享文本或 v.douyin.com 链接"
        validate={(t) => extractSupportedUrl(t)?.source === 'douyin'}
        errorText="未识别到抖音链接"
        onCancel={() => setDouyinPasteVisible(false)}
        onConfirm={(text) => {
          const hit = extractSupportedUrl(text);
          if (!hit || hit.source !== 'douyin') return;
          setDouyinPasteVisible(false);
          setDouyinSourceUrl(hit.url);
          setDouyinVisible(true);
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
  searchRow: {
    marginHorizontal: 20,
    marginTop: 6,
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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    paddingVertical: 0,
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
  banner: {
    marginHorizontal: 20,
    backgroundColor: '#f6f8fb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e6ecf2',
    marginTop: 6,
    marginBottom: 12,
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
