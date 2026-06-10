import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  const [lightbox, setLightbox] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
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

  useEffect(() => {
    if (!note) {
      setLightbox(false);
      setRemarkOpen(false);
    }
  }, [note]);

  useEffect(() => {
    if (!note) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (remarkOpen) {
        Keyboard.dismiss();
        setRemarkOpen(false);
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
  }, [note, lightbox, remarkOpen, onClose]);

  const openRemark = () => {
    if (!note) return;
    setRemarkDraft(note.note ?? '');
    setRemarkOpen(true);
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

  const closeRemark = () => {
    Keyboard.dismiss();
    setRemarkOpen(false);
  };

  const handleSaveRemark = async () => {
    if (!note) return;
    Keyboard.dismiss();
    const updated = await updateNote(note.id, { note: remarkDraft });
    setRemarkOpen(false);
    if (updated) onUpdated?.(updated);
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'lightbox') {
        setLightbox(!!data.open);
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
            <View style={styles.barIconBtn} />
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
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            onMessage={handleMessage}
            style={[styles.webview, { backgroundColor: containerBg }]}
          />
        )}

        {note && !lightbox && !remarkOpen && (
          <View
            style={[
              styles.toolbar,
              { backgroundColor: theme.bg, borderTopColor: barBorder },
            ]}
          >
            <Pressable
              onPress={openRemark}
              style={({ pressed }) => [
                styles.toolBtn,
                pressed && styles.toolBtnPressed,
              ]}
              android_ripple={{ color: 'rgba(127,127,127,0.18)' }}
            >
              <View>
                <Ionicons
                  name={note.note ? 'create' : 'create-outline'}
                  size={22}
                  color={note.note ? '#f5b400' : theme.text}
                />
                {note.note ? <View style={styles.toolDot} /> : null}
              </View>
              <Text style={[styles.toolText, { color: theme.text }]}>
                {note.note ? '查看备注' : '备注'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.toolBtn,
                pressed && styles.toolBtnPressed,
              ]}
              android_ripple={{ color: 'rgba(226,59,59,0.18)' }}
            >
              <Ionicons name="trash-outline" size={22} color="#e23b3b" />
              <Text style={[styles.toolText, { color: '#e23b3b' }]}>删除</Text>
            </Pressable>
          </View>
        )}

        {note && remarkOpen && (
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
              <Pressable onPress={handleSaveRemark} hitSlop={8}>
                <Text style={styles.remarkSave}>保存</Text>
              </Pressable>
            </View>
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
  toolbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  toolBtnPressed: {
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  toolText: {
    fontSize: 14,
    fontWeight: '500',
  },
  toolDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#f5b400',
  },
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
  remarkInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
  },
});
