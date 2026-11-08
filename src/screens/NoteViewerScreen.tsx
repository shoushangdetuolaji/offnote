import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import MoveToCategorySheet from '../components/MoveToCategorySheet';
import TagSelectList from '../components/TagSelectList';
import TextPromptModal from '../components/TextPromptModal';
import { listCategories, type Category } from '../lib/categories';
import {
  addHighlight,
  addSnapshot,
  attachHighlightPoster,
  fillMissingHighlightThumbs,
  formatClock,
  removeHighlight,
  removeSnapshot,
  renameHighlight,
} from '../lib/highlights';
import {
  EXTRAS_BOOT_JS,
  capturePostersJs,
  extrasDataJs,
  seekJs,
  toastJs,
} from '../lib/viewerExtrasJs';
import { openOriginal } from '../lib/openOriginal';
import {
  deleteNote,
  HTML_VERSION,
  refreshNoteHtml,
  updateNote,
  type Note,
} from '../lib/notes';

type RemarkMode = 'view' | 'edit' | null;

type Props = {
  note: Note | null;
  onClose: () => void;
  onDeleted?: (note: Note) => void;
  onUpdated?: (note: Note) => void;
};

export default function NoteViewerScreen({
  note,
  onClose,
  onDeleted,
  onUpdated,
}: Props) {
  const webRef = useRef<WebView>(null);
  const htmlSyncRef = useRef<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [remarkMode, setRemarkMode] = useState<RemarkMode>(null);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  /** 正在重命名的高光 id */
  const [renamingHl, setRenamingHl] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsMounted, setActionsMounted] = useState(false);
  const actionsOpenedAt = useRef(0);
  const drawerX = useRef(new Animated.Value(0)).current;
  const drawerToken = useRef(0);
  const pendingAction = useRef<(() => void) | null>(null);
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const theme = useMemo(
    () =>
      isDark
        ? {
            bg: '#0d0d0e',
            text: '#eee',
            statusBarStyle: 'light-content' as const,
          }
        : {
            bg: '#ffffff',
            text: '#111',
            statusBarStyle: 'dark-content' as const,
          },
    [isDark],
  );
  const barBorder = isDark ? '#2a2a2c' : '#ececec';

  const remarkInjectJs = useMemo(() => {
    const remarkText = note?.note?.trim() ?? '';
    return `
(function () {
  var text = ${JSON.stringify(remarkText)};
  var hasText = text.length > 0;

  function postRemark() {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'remark' }));
      }
    } catch (e) {}
  }

  if (!document.getElementById('offnote-remark-runtime-style')) {
    var style = document.createElement('style');
    style.id = 'offnote-remark-runtime-style';
    style.textContent = [
      '.remark{width:100%;margin:28px 0 0;padding:16px 0;display:flex;align-items:center;gap:12px;border:0;border-top:1px solid #2a2a2c;background:transparent;color:inherit;font:inherit;text-align:left;}',
      '.remark:active{opacity:.65;}',
      '.remark-icon{width:22px;height:26px;flex:0 0 auto;border:2px solid #888;border-radius:4px;position:relative;}',
      '.remark-icon:before{content:"";position:absolute;left:4px;right:4px;top:8px;height:2px;background:#888;box-shadow:0 6px 0 #888;}',
      '.remark-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}',
      '.remark-label{font-size:13px;color:#999;}',
      '.remark-text{font-size:15px;color:#eee;white-space:pre-wrap;word-break:break-word;}',
      '.remark-empty .remark-text{color:#888;}',
      '.remark-chevron{width:10px;height:10px;flex:0 0 auto;border-right:2px solid #777;border-bottom:2px solid #777;transform:rotate(-45deg);margin-right:3px;}',
      '@media (prefers-color-scheme: light){.remark{border-top-color:#eee;}.remark-text{color:#111;}.remark-empty .remark-text{color:#999;}}'
    ].join('');
    document.head.appendChild(style);
  }

  var remark = document.getElementById('offnote-remark');
  if (!remark) {
    remark = document.createElement('button');
    remark.id = 'offnote-remark';
    remark.className = 'remark';
    remark.type = 'button';
    remark.innerHTML = '<span class="remark-icon" aria-hidden="true"></span><span class="remark-body"><span class="remark-label">备注</span><span class="remark-text"></span></span><span class="remark-chevron" aria-hidden="true"></span>';
  }

  if (!remark.getAttribute('data-offnote-bound')) {
    remark.setAttribute('data-offnote-bound', '1');
    remark.addEventListener('click', function (e) {
      e.preventDefault();
      postRemark();
    });
  }

  if (!remark.parentNode) {
    var meta = document.querySelector('.meta');
    var wrap = document.querySelector('.wrap') || document.body;
    if (meta && meta.parentNode) {
      meta.insertAdjacentElement('afterend', remark);
    } else {
      wrap.appendChild(remark);
    }
  }

  // 「查看原帖」交给 App 处理：直接唤起小红书/抖音/Instagram，而不是先开浏览器
  var src = document.querySelector('a.source');
  if (src && !src.getAttribute('data-offnote-bound')) {
    src.setAttribute('data-offnote-bound', '1');
    src.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'source' }));
      } catch (err) {}
    });
  }

  remark.classList.toggle('remark-empty', !hasText);
  remark.setAttribute('aria-label', hasText ? '查看备注' : '添加备注');
  var body = remark.querySelector('.remark-text');
  if (body) body.textContent = hasText ? text : '添加备注';
})();
true;
`;
  }, [note?.note]);

  useEffect(() => {
    if (!note) {
      setLightbox(false);
      setRemarkMode(null);
      setRemarkDraft('');
      setTagEditing(false);
      setTagDraft([]);
      setCategoryOpen(false);
      htmlSyncRef.current = null;
      return;
    }
    // 老笔记用旧模板生成的 index.html，打开时按最新模板重渲染一次
    if ((note.htmlVersion ?? 1) < HTML_VERSION) {
      const syncKey = `${note.id}:v${HTML_VERSION}:${note.note ?? ''}`;
      if (htmlSyncRef.current === syncKey) return;
      htmlSyncRef.current = syncKey;
      refreshNoteHtml(note.id).then((updated) => {
        if (!updated) return;
        htmlSyncRef.current = `${updated.id}:${updated.note ?? ''}`;
        webRef.current?.reload();
        onUpdated?.(updated);
      });
      return;
    }
    if (note.note?.trim()) {
      const syncKey = `${note.id}:${note.note}`;
      if (htmlSyncRef.current === syncKey) return;
      htmlSyncRef.current = syncKey;
      updateNote(note.id, { note: note.note }).then((updated) => {
        if (!updated) return;
        webRef.current?.reload();
      });
    }
  }, [note]);

  useEffect(() => {
    if (!note) {
      setCategories([]);
      return;
    }
    let alive = true;
    listCategories().then((cats) => {
      if (alive) setCategories(cats);
    });
    return () => {
      alive = false;
    };
  }, [note?.id]);

  const categoryName = note?.categoryId
    ? categories.find((c) => c.id === note.categoryId)?.name
    : undefined;

  useEffect(() => {
    if (!note) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (categoryOpen) {
        setCategoryOpen(false);
        return true;
      }
      if (actionsOpen) {
        setActionsOpen(false);
        return true;
      }
      if (tagEditing) {
        Keyboard.dismiss();
        setTagEditing(false);
        return true;
      }
      if (remarkMode) {
        Keyboard.dismiss();
        setRemarkMode(null);
        return true;
      }
      if (lightbox) {
        webRef.current?.injectJavaScript('window.__offnoteCloseLightbox && window.__offnoteCloseLightbox(); true;');
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [note, lightbox, remarkMode, tagEditing, actionsOpen, categoryOpen, onClose]);

  const openRemark = () => {
    if (!note) return;
    setRemarkDraft(note.note ?? '');
    setRemarkMode(note.note?.trim() ? 'view' : 'edit');
  };

  const openTags = () => {
    if (!note) return;
    setTagDraft(note.tags ?? []);
    setTagEditing(true);
  };

  const openCategory = () => {
    if (!note) return;
    setCategoryOpen(true);
  };

  const handlePickCategory = async (categoryId: string | undefined) => {
    setCategoryOpen(false);
    if (!note || note.categoryId === categoryId) return;
    const updated = await updateNote(note.id, { categoryId });
    if (updated) onUpdated?.(updated);
  };

  const closeTags = () => {
    Keyboard.dismiss();
    setTagEditing(false);
  };

  const handleSaveTags = async () => {
    if (!note) return;
    Keyboard.dismiss();
    const updated = await updateNote(note.id, { tags: tagDraft });
    setTagEditing(false);
    if (updated) onUpdated?.(updated);
  };

  const handleDelete = () => {
    if (!note) return;
    const current = note;
    Alert.alert('删除这条笔记？', current.title ?? current.id, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          try {
            deleteNote(current);
          } catch {}
          onDeleted?.(current);
        },
      },
    ]);
  };

  useEffect(() => {
    if (!note) {
      drawerToken.current += 1;
      pendingAction.current = null;
      drawerX.setValue(0);
      setActionsMounted(false);
      setActionsOpen(false);
      return;
    }
    if (!actionsOpen) return;
    drawerX.setValue(0);
    setActionsMounted(true);
  }, [actionsOpen, note?.id, drawerX]);

  useEffect(() => {
    if (actionsOpen || !actionsMounted) return;
    const token = ++drawerToken.current;
    const anim = Animated.timing(drawerX, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (!finished || drawerToken.current !== token) return;
      setActionsMounted(false);
      const fn = pendingAction.current;
      pendingAction.current = null;
      fn?.();
    });
    return () => anim.stop();
  }, [actionsOpen, actionsMounted, drawerX]);

  const openActions = () => {
    if (!note) return;
    actionsOpenedAt.current = Date.now();
    setActionsOpen(true);
  };

  const closeActions = () => setActionsOpen(false);

  const closeActionsFromBackdrop = () => {
    if (Date.now() - actionsOpenedAt.current < 400) return;
    setActionsOpen(false);
  };

  const runAction = (fn: () => void) => {
    pendingAction.current = fn;
    setActionsOpen(false);
  };

  const playDrawerIn = () => {
    Animated.timing(drawerX, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeRemark = () => {
    Keyboard.dismiss();
    setRemarkMode(null);
  };

  const handleSaveRemark = async () => {
    if (!note) return;
    Keyboard.dismiss();
    const updated = await updateNote(note.id, { note: remarkDraft });
    setRemarkMode(null);
    if (updated) {
      htmlSyncRef.current = `${updated.id}:${updated.note ?? ''}`;
      onUpdated?.(updated);
      webRef.current?.reload();
    }
  };

  // ---------- 高光时刻 / 截图 ----------
  const inject = (js: string) => webRef.current?.injectJavaScript(js);

  // 最新的笔记 + 串行队列：连点两次标记时，第二次基于第一次的结果，不会互相覆盖
  const latestNoteRef = useRef<Note | null>(note);
  const opChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOpsRef = useRef(0);
  // 没有进行中的操作（或换了一条笔记）时跟随 props；操作进行中以队列里的最新结果为准
  if (pendingOpsRef.current === 0 || latestNoteRef.current?.id !== note?.id) {
    latestNoteRef.current = note;
  }
  const enqueue = (op: (current: Note) => Promise<void>) => {
    pendingOpsRef.current += 1;
    opChainRef.current = opChainRef.current
      .then(async () => {
        const current = latestNoteRef.current;
        if (current) await op(current);
      })
      .catch(() => {})
      .finally(() => {
        pendingOpsRef.current -= 1;
      });
  };

  // 高光或截图变化时局部刷新页面里的列表，不 reload，视频不中断
  useEffect(() => {
    if (!note) return;
    inject(extrasDataJs(note));
  }, [note?.highlights, note?.snapshots]);

  const applyUpdate = (updated: Note | null, okText: string) => {
    if (!updated) {
      inject(toastJs('保存失败'));
      return;
    }
    latestNoteRef.current = updated;
    onUpdated?.(updated);
    inject(extrasDataJs(updated));
    if (okText) inject(toastJs(okText));
  };

  const thumbFilledKey = useRef<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const missing = (note.highlights ?? []).filter((h) => !h.thumb);
    if (!missing.length) return;
    const key = `${note.id}:${missing.map((h) => h.id).join(',')}`;
    if (thumbFilledKey.current === key) return;
    thumbFilledKey.current = key;
    inject(capturePostersJs(missing));
    enqueue(async (current) => {
      const updated = await fillMissingHighlightThumbs(current);
      if (updated) applyUpdate(updated, '');
    });
  }, [note]);

  const handleAddHighlight = (media: string, time: number, poster?: string) =>
    enqueue(async (current) => {
      try {
        applyUpdate(
          await addHighlight(current, media, time, poster),
          `已标记 ${formatClock(time)}`,
        );
      } catch {
        inject(toastJs('标记失败'));
      }
    });

  const handleAddSnapshot = (media: string, time: number) =>
    enqueue(async (current) => {
      try {
        applyUpdate(await addSnapshot(current, media, time), `已截取 ${formatClock(time)}`);
      } catch {
        inject(toastJs('截取失败'));
      }
    });

  const openHighlightMenu = (id: string) => {
    const hl = note?.highlights?.find((h) => h.id === id);
    if (!note || !hl) return;
    Alert.alert(`${hl.label} · ${formatClock(hl.time)}`, undefined, [
      { text: '重命名', onPress: () => setRenamingHl(id) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          enqueue(async (current) =>
            applyUpdate(await removeHighlight(current, id), '已删除'),
          ),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const openSnapshotMenu = (id: string) => {
    const shot = note?.snapshots?.find((x) => x.id === id);
    if (!note || !shot) return;
    Alert.alert(`截图 · ${formatClock(shot.time)}`, undefined, [
      { text: '跳到该时刻', onPress: () => inject(seekJs(shot.media, shot.time)) },
      {
        text: '删除',
        style: 'destructive',
        onPress: () =>
          enqueue(async (current) =>
            applyUpdate(await removeSnapshot(current, id), '已删除'),
          ),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const submitHighlightName = async (text: string) => {
    const id = renamingHl;
    setRenamingHl(null);
    if (!id) return;
    enqueue(async (current) =>
      applyUpdate(await renameHighlight(current, id, text), '已重命名'),
    );
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'lightbox') {
        setLightbox(!!data.open);
      } else if (data?.type === 'remark') {
        openRemark();
      } else if (data?.type === 'source' && note) {
        openOriginal(note);
      } else if (data?.type === 'hl-poster' && typeof data.id === 'string') {
        const poster = typeof data.poster === 'string' ? data.poster : '';
        enqueue(async (current) => {
          try {
            const updated = await attachHighlightPoster(current, String(data.id), poster);
            if (updated) applyUpdate(updated, '');
          } catch {}
        });
      } else if (data?.type === 'hl-add' && typeof data.media === 'string') {
        handleAddHighlight(
          data.media,
          Number(data.time) || 0,
          typeof data.poster === 'string' ? data.poster : undefined,
        );
      } else if (data?.type === 'shot-add' && typeof data.media === 'string') {
        handleAddSnapshot(data.media, Number(data.time) || 0);
      } else if (data?.type === 'hl-menu') {
        openHighlightMenu(String(data.id));
      } else if (data?.type === 'shot-menu') {
        openSnapshotMenu(String(data.id));
      }
    } catch {}
  };

  const containerBg = lightbox ? '#000' : theme.bg;

  return (
    <>
    <Modal
      visible={!!note}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: containerBg }]}
        edges={lightbox ? [] : ['top', 'bottom']}
      >
        <StatusBar
          barStyle={lightbox ? 'light-content' : theme.statusBarStyle}
          hidden={lightbox}
        />
        {!lightbox && (
          <View style={[styles.topBar, { backgroundColor: theme.bg }]}>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.barIconBtn,
                pressed && styles.barIconBtnPressed,
              ]}
              accessibilityLabel="返回"
            >
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </Pressable>
            <Text
              style={[styles.barTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {note?.title ?? note?.author ?? 'OffNote'}
            </Text>
            <Pressable
              onPress={openActions}
              hitSlop={8}
              style={({ pressed }) => [
                styles.barIconBtn,
                pressed && styles.barIconBtnPressed,
              ]}
              accessibilityLabel="更多操作"
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={theme.text} />
            </Pressable>
            <View
              style={[
                styles.barShadow,
                { backgroundColor: `rgba(0,0,0,${isDark ? 0.08 : 0.05})` },
              ]}
              pointerEvents="none"
            />
          </View>
        )}
        {note && (
          <WebView
            ref={webRef}
            source={{ uri: note.indexUri }}
            originWhitelist={['*']}
            allowFileAccess
            allowingReadAccessToURL={note.dirUri}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            injectedJavaScript={remarkInjectJs + EXTRAS_BOOT_JS + extrasDataJs(note)}
            onLoadEnd={() => {
              webRef.current?.injectJavaScript(remarkInjectJs);
              webRef.current?.injectJavaScript(EXTRAS_BOOT_JS + extrasDataJs(note));
              const missing = (note.highlights ?? []).filter((h) => !h.thumb);
              if (missing.length) {
                webRef.current?.injectJavaScript(capturePostersJs(missing));
              }
            }}
            onMessage={handleMessage}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(req) => {
              // 本地 index.html 正常加载；外链不在 WebView 里打开
              if (!/^https?:/i.test(req.url)) return true;
              if (note?.sourceUrl && req.url === note.sourceUrl) {
                openOriginal(note);
              } else {
                Linking.openURL(req.url).catch(() => {});
              }
              return false;
            }}
            style={[styles.webview, { backgroundColor: containerBg }]}
          />
        )}

        {note && remarkMode && (
          <KeyboardAvoidingView
            style={[
              styles.remarkOverlay,
              { backgroundColor: theme.bg, paddingTop: insets.top },
            ]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              style={[styles.remarkBar, { borderBottomColor: barBorder }]}
            >
              <Pressable onPress={closeRemark} hitSlop={8}>
                <Text style={[styles.remarkCancel, { color: theme.text }]}>
                  取消
                </Text>
              </Pressable>
              <Text style={[styles.remarkTitle, { color: theme.text }]}>
                备注
              </Text>
              <Pressable
                onPress={
                  remarkMode === 'view'
                    ? () => {
                        setRemarkDraft(note.note ?? '');
                        setRemarkMode('edit');
                      }
                    : handleSaveRemark
                }
                hitSlop={8}
              >
                <Text style={styles.remarkSave}>
                  {remarkMode === 'view' ? '编辑' : '保存'}
                </Text>
              </Pressable>
            </View>
            {remarkMode === 'view' ? (
              <ScrollView
                style={styles.remarkReadScroll}
                contentContainerStyle={styles.remarkReadContent}
              >
                <Text
                  style={[
                    styles.remarkReadText,
                    { color: note.note?.trim() ? theme.text : isDark ? '#777' : '#999' },
                  ]}
                >
                  {note.note?.trim() || '还没有备注'}
                </Text>
              </ScrollView>
            ) : (
              <TextInput
                style={[styles.remarkInput, { color: theme.text }]}
                value={remarkDraft}
                onChangeText={setRemarkDraft}
                placeholder="写点备注…（想法、用途、灵感）"
                placeholderTextColor={isDark ? '#666' : '#999'}
                multiline
                autoFocus
                textAlignVertical="top"
              />
            )}
          </KeyboardAvoidingView>
        )}

        {note && tagEditing && (
          <KeyboardAvoidingView
            style={[
              styles.remarkOverlay,
              { backgroundColor: theme.bg, paddingTop: insets.top },
            ]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              style={[styles.remarkBar, { borderBottomColor: barBorder }]}
            >
              <Pressable onPress={closeTags} hitSlop={8}>
                <Text style={[styles.remarkCancel, { color: theme.text }]}>
                  取消
                </Text>
              </Pressable>
              <Text style={[styles.remarkTitle, { color: theme.text }]}>
                标签
              </Text>
              <Pressable onPress={handleSaveTags} hitSlop={8}>
                <Text style={styles.remarkSave}>保存</Text>
              </Pressable>
            </View>
            <TagSelectList
              selected={tagDraft}
              onChange={setTagDraft}
              dark={isDark}
            />
          </KeyboardAvoidingView>
        )}

        <TextPromptModal
          visible={!!renamingHl}
          title="重命名高光"
          initial={note?.highlights?.find((h) => h.id === renamingHl)?.label ?? ''}
          placeholder="比如：日照金山出现"
          maxLength={40}
          onCancel={() => setRenamingHl(null)}
          onSubmit={submitHighlightName}
        />
      </SafeAreaView>
    </Modal>
    <Modal
      visible={!!note && actionsMounted}
      transparent
      animationType="none"
      onShow={playDrawerIn}
      onRequestClose={closeActions}
      statusBarTranslucent
    >
      <View style={styles.actionRoot}>
        <Pressable
          style={styles.actionBackdropHit}
          onPress={closeActionsFromBackdrop}
          accessibilityLabel="关闭菜单"
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.actionBackdrop, { opacity: drawerX }]}
        />
        <Animated.View
          style={[
            styles.actionDrawer,
            {
              backgroundColor: theme.bg,
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 12,
              transform: [
                {
                  translateX: drawerX.interpolate({
                    inputRange: [0, 1],
                    outputRange: [DRAWER_WIDTH, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {(
            [
              { label: '备注', icon: 'document-text-outline', onPress: openRemark },
              { label: '标签', icon: 'pricetag-outline', onPress: openTags },
              {
                label: '分类',
                icon: 'folder-outline',
                onPress: openCategory,
                hint: categoryName ?? (note?.categoryId ? '' : '未分类'),
              },
              { label: '删除', icon: 'trash-outline', onPress: handleDelete, danger: true },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.label}
              onPress={() => runAction(item.onPress)}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && { backgroundColor: isDark ? '#2a2a2c' : '#f3f4f6' },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={'danger' in item && item.danger ? '#e23b3b' : theme.text}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: 'danger' in item && item.danger ? '#e23b3b' : theme.text },
                ]}
              >
                {item.label}
              </Text>
              {'hint' in item && item.hint ? (
                <Text
                  style={[styles.actionHint, { color: isDark ? '#9a9a9a' : '#888' }]}
                  numberOfLines={1}
                >
                  {item.hint}
                </Text>
              ) : null}
            </Pressable>
          ))}
          <View style={[styles.actionDivider, { backgroundColor: barBorder }]} />
          <Pressable
            onPress={closeActions}
            style={({ pressed }) => [
              styles.actionRow,
              pressed && { backgroundColor: isDark ? '#2a2a2c' : '#f3f4f6' },
            ]}
          >
            <Ionicons name="close" size={20} color={isDark ? '#aaa' : '#666'} />
            <Text style={[styles.actionLabel, { color: isDark ? '#aaa' : '#666' }]}>取消</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
    <MoveToCategorySheet
      note={categoryOpen ? note : null}
      categories={categories}
      onPick={handlePickCategory}
      onDismiss={() => setCategoryOpen(false)}
    />
    </>
  );
}

const DRAWER_WIDTH = 248;

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 2,
    paddingRight: 12,
    zIndex: 2,
  },
  barShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: 1,
  },
  barIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barIconBtnPressed: {
    backgroundColor: 'rgba(127,127,127,0.18)',
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  webview: { flex: 1 },
  remarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  remarkBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  remarkTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  remarkCancel: {
    fontSize: 15,
  },
  remarkSave: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f6feb',
  },
  actionRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionBackdropHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  actionBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  actionDrawer: {
    width: DRAWER_WIDTH,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingHorizontal: 8,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionHint: {
    marginLeft: 'auto',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '400',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
    marginHorizontal: 14,
  },
  remarkReadScroll: {
    flex: 1,
  },
  remarkReadContent: {
    padding: 20,
  },
  remarkReadText: {
    fontSize: 16,
    lineHeight: 25,
  },
  remarkInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
  },
});
