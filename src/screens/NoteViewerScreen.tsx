import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
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

import { deleteNote, updateNote, type Note } from '../lib/notes';

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
      htmlSyncRef.current = null;
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
    if (!note) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
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
  }, [note, lightbox, remarkMode, onClose]);

  const openRemark = () => {
    if (!note) return;
    setRemarkDraft(note.note ?? '');
    setRemarkMode(note.note?.trim() ? 'view' : 'edit');
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

  const openActions = () => {
    if (!note) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['备注', '删除', '取消'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) openRemark();
          if (idx === 1) handleDelete();
        },
      );
      return;
    }
    Alert.alert(note.title ?? 'OffNote', undefined, [
      { text: '备注', onPress: openRemark },
      { text: '删除', style: 'destructive', onPress: handleDelete },
      { text: '取消', style: 'cancel' },
    ]);
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

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'lightbox') {
        setLightbox(!!data.open);
      } else if (data?.type === 'remark') {
        openRemark();
      }
    } catch {}
  };

  const containerBg = lightbox ? '#000' : theme.bg;

  return (
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
          backgroundColor={containerBg}
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
            injectedJavaScript={remarkInjectJs}
            onLoadEnd={() => {
              webRef.current?.injectJavaScript(remarkInjectJs);
            }}
            onMessage={handleMessage}
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
      </SafeAreaView>
    </Modal>
  );
}

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
