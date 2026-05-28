import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
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

  return (
    <Modal
      visible={!!note}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={[styles.container, lightbox && styles.containerImmersive]}
        edges={lightbox ? [] : ['top', 'bottom']}
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor={lightbox ? '#000' : '#0d0d0e'}
          hidden={lightbox}
        />
        {!lightbox && (
          <View style={styles.topBar}>
            <Pressable onPress={onClose} style={styles.barBtn}>
              <Text style={styles.barBtnText}>关闭</Text>
            </Pressable>
            <Text style={styles.barTitle} numberOfLines={1}>
              {note?.title ?? note?.author ?? 'OffNote'}
            </Text>
            <View style={styles.barBtn} />
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
            style={[styles.webview, lightbox && styles.webviewImmersive]}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0e',
  },
  containerImmersive: {
    backgroundColor: '#000',
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: '#0d0d0e',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2c',
  },
  barBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 56,
  },
  barBtnText: {
    color: '#eee',
    fontSize: 14,
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#eee',
    flex: 1,
    textAlign: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0d0d0e',
  },
  webviewImmersive: {
    backgroundColor: '#000',
  },
});
