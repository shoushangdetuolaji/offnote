import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import type { Note } from '../lib/notes';

type Props = {
  note: Note | null;
  onClose: () => void;
};

export default function NoteViewerScreen({ note, onClose }: Props) {
  const webRef = useRef<WebView>(null);
  const [lightbox, setLightbox] = useState(false);
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

  useEffect(() => {
    if (!note) setLightbox(false);
  }, [note]);

  useEffect(() => {
    if (!note) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lightbox) {
        webRef.current?.injectJavaScript('window.__offnoteCloseLightbox && window.__offnoteCloseLightbox(); true;');
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [note, lightbox, onClose]);

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
});
