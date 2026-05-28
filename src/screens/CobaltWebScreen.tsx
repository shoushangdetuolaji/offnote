import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import RenameModal from '../components/RenameModal';
import { listCategories, type Category } from '../lib/categories';
import { fetchIgMetadata, type IgMetadata } from '../lib/metadata';
import { createNote, type MediaInput, type MediaKind } from '../lib/notes';

const COBALT_URL = 'https://cobalt.tools/';

const DOWNLOAD_EXT_RE = /\.(mp4|m4v|mov|webm|mp3|m4a|jpg|jpeg|png|gif|webp)(\?|$)/i;

const INJECTED_JS = `
(function () {
  if (window.__offnoteHooked) return;
  window.__offnoteHooked = true;

  function send(payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
  }

  function captureBlob(href, fn) {
    try {
      fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
        var reader = new FileReader();
        reader.onloadend = function () {
          send({ type: 'blob', dataUrl: reader.result, filename: fn });
        };
        reader.readAsDataURL(b);
      }).catch(function () {});
    } catch (err) {}
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.tagName === 'A' && t.href) {
        var href = t.href;
        var fn = t.getAttribute('download') || '';
        if (/^blob:/i.test(href)) {
          captureBlob(href, fn);
          e.preventDefault();
          e.stopPropagation();
        } else if (/^https?:/i.test(href)) {
          send({ type: 'download', url: href, filename: fn });
        }
        break;
      }
      t = t.parentNode;
    }
  }, true);

  var origOpen = window.open;
  window.open = function (u) {
    if (u) send({ type: 'download', url: String(u), filename: '' });
    return origOpen.apply(window, arguments);
  };

  // ---- Auto-grab-all for picker UI ----
  function findDownloadTargets() {
    var anchors = Array.from(document.querySelectorAll('a[download]'));
    var seen = new Set();
    return anchors.filter(function (a) {
      var key = a.href || a.getAttribute('download') || '';
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      var visible = a.offsetParent !== null;
      return visible;
    });
  }

  function buildPanel() {
    if (document.getElementById('offnote-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'offnote-panel';
    panel.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:2147483647;background:#0d0d0e;color:#fff;border-radius:999px;padding:10px 18px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:600 14px -apple-system,sans-serif;display:none;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.1)';
    panel.innerHTML = '<span id="offnote-count">0 项</span><button id="offnote-grab" style="background:#fff;color:#111;border:0;border-radius:999px;padding:7px 14px;font:600 13px -apple-system,sans-serif">一键全部</button>';
    document.body.appendChild(panel);
    panel.querySelector('#offnote-grab').addEventListener('click', autoGrabAll);
  }

  function refreshPanel() {
    buildPanel();
    var panel = document.getElementById('offnote-panel');
    if (!panel) return;
    var targets = findDownloadTargets();
    var count = targets.length;
    if (count >= 2) {
      panel.style.display = 'flex';
      var label = document.getElementById('offnote-count');
      if (label) label.textContent = '检测到 ' + count + ' 项可下载';
    } else {
      panel.style.display = 'none';
    }
  }

  function autoGrabAll() {
    var targets = findDownloadTargets();
    if (targets.length === 0) return;
    var i = 0;
    var label = document.getElementById('offnote-count');
    function step() {
      if (i >= targets.length) {
        if (label) label.textContent = '已触发全部';
        return;
      }
      var a = targets[i++];
      var href = a.href;
      var fn = a.getAttribute('download') || '';
      if (label) label.textContent = '保存中 ' + i + '/' + targets.length;
      if (/^blob:/i.test(href)) {
        captureBlob(href, fn);
      } else if (/^https?:/i.test(href)) {
        send({ type: 'download', url: href, filename: fn });
      }
      setTimeout(step, 350);
    }
    step();
  }

  var observer = new MutationObserver(function () { refreshPanel(); });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(refreshPanel, 800);
})();
true;
`;

function kindFromExt(ext: string): MediaKind {
  return /^(jpg|jpeg|png|gif|webp)$/i.test(ext) ? 'image' : 'video';
}

function extFromMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

type Props = {
  visible: boolean;
  sourceUrl?: string | null;
  onClose: () => void;
};

export default function CobaltWebScreen({ visible, sourceUrl, onClose }: Props) {
  const webviewRef = useRef<WebView>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [items, setItems] = useState<MediaInput[]>([]);
  const [showRename, setShowRename] = useState(false);
  const [metadata, setMetadata] = useState<IgMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!visible) return;
    handledRef.current.clear();
    setItems([]);
    setMetadata(null);
    setShowRename(false);
    listCategories().then(setCategories);
    if (!sourceUrl) return;
    setMetaLoading(true);
    fetchIgMetadata(sourceUrl)
      .then((m) => setMetadata(m))
      .finally(() => setMetaLoading(false));
  }, [visible, sourceUrl]);

  const collectUrl = (url: string) => {
    if (!url || !DOWNLOAD_EXT_RE.test(url)) return;
    if (handledRef.current.has(url)) return;
    handledRef.current.add(url);
    const ext = url.match(DOWNLOAD_EXT_RE)?.[1]?.toLowerCase() ?? 'mp4';
    setItems((prev) => [
      ...prev,
      { kind: kindFromExt(ext), hintExt: ext, source: { type: 'remote', url } },
    ]);
  };

  const collectBase64 = (dataUrl: string) => {
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    const mime = mimeMatch?.[1] ?? 'application/octet-stream';
    const ext = extFromMime(mime);
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) return;
    setItems((prev) => [
      ...prev,
      { kind: kindFromExt(ext), hintExt: ext, source: { type: 'base64', data: base64 } },
    ]);
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data.type === 'download' && typeof data.url === 'string') {
        collectUrl(data.url);
      } else if (data.type === 'blob' && typeof data.dataUrl === 'string') {
        collectBase64(data.dataUrl);
      }
    } catch {}
  };

  const handleShouldStart = (req: WebViewNavigation): boolean => {
    if (DOWNLOAD_EXT_RE.test(req.url)) {
      collectUrl(req.url);
      return false;
    }
    return true;
  };

  const suggestedName = (() => {
    const author = metadata?.author?.replace(/[^A-Za-z0-9_]/g, '');
    const slug = metadata?.caption
      ?.replace(/\s+/g, ' ')
      .slice(0, 30)
      .replace(/[/\\:?*"<>|]/g, '')
      .trim();
    const parts = [author, slug].filter(Boolean).join('_');
    return parts || `offnote-${Date.now()}`;
  })();

  const finish = () => {
    if (items.length === 0) return;
    setShowRename(true);
  };

  const clearCollected = () => {
    handledRef.current.clear();
    setItems([]);
  };

  const handleConfirmName = async (
    finalName: string,
    note: string,
    categoryId?: string,
  ) => {
    setShowRename(false);
    setBusyMsg('正在保存…');
    const titleOnly = finalName.replace(/\.[A-Za-z0-9]+$/, '');
    const result = await createNote({
      title: titleOnly,
      note,
      categoryId,
      items,
      metadata,
      onItemProgress: (i, total, f) => {
        const overall = ((i + f) / total) * 100;
        setBusyMsg(`保存第 ${i + 1}/${total} 项 ${Math.round(overall)}%`);
      },
    });
    setBusyMsg(null);
    if (!result.ok) {
      Alert.alert('保存失败', result.error ?? 'unknown');
      return;
    }
    handledRef.current.clear();
    setItems([]);
    Alert.alert('已保存', `「${titleOnly}」包含 ${result.note?.media.length ?? 0} 个文件`, [
      { text: '继续下载', style: 'cancel' },
      { text: '关闭', onPress: onClose },
    ]);
  };

  const totalItems = items.length;
  const hintExt = items[0]?.hintExt ?? 'mp4';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.barBtn}>
            <Text style={styles.barBtnText}>关闭</Text>
          </Pressable>
          <Text style={styles.barTitle} numberOfLines={1}>
            Cobalt
          </Text>
          <Pressable onPress={() => webviewRef.current?.reload()} style={styles.barBtn}>
            <Text style={styles.barBtnText}>刷新</Text>
          </Pressable>
        </View>

        {totalItems > 0 && (
          <View style={styles.collectBar}>
            <Text style={styles.collectText}>
              已收集 <Text style={styles.collectCount}>{totalItems}</Text> 项
            </Text>
            <View style={styles.collectActions}>
              <Pressable onPress={clearCollected} style={[styles.collectBtn, styles.collectBtnGhost]}>
                <Text style={styles.collectBtnGhostText}>清空</Text>
              </Pressable>
              <Pressable onPress={finish} style={[styles.collectBtn, styles.collectBtnPrimary]}>
                <Text style={styles.collectBtnPrimaryText}>完成</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.webviewWrapper}>
          <WebView
            ref={webviewRef}
            source={{ uri: COBALT_URL }}
            injectedJavaScript={INJECTED_JS}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={handleShouldStart}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            style={styles.webview}
          />

          {loading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator />
            </View>
          )}

          {busyMsg && (
            <View style={styles.busyBanner}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.busyText}>{busyMsg}</Text>
            </View>
          )}
        </View>

        <RenameModal
          visible={showRename}
          defaultName={`${suggestedName}.${hintExt}`}
          hintExt={hintExt}
          metadata={metadata}
          metadataLoading={metaLoading}
          categories={categories}
          onCancel={() => setShowRename(false)}
          onConfirm={handleConfirmName}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  barBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  barBtnText: {
    color: '#111',
    fontSize: 14,
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    textAlign: 'center',
  },
  collectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff7e0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0d9a0',
  },
  collectText: {
    fontSize: 13,
    color: '#5a4500',
  },
  collectCount: {
    fontWeight: '700',
    color: '#111',
  },
  collectActions: {
    flexDirection: 'row',
    gap: 8,
  },
  collectBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  collectBtnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dcdcdc',
  },
  collectBtnGhostText: {
    color: '#444',
    fontSize: 12,
  },
  collectBtnPrimary: {
    backgroundColor: '#111',
  },
  collectBtnPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  webviewWrapper: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  busyBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  busyText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
});
