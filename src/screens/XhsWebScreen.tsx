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
import type { WebViewMessageEvent } from 'react-native-webview';

import RenameModal from '../components/RenameModal';
import { listCategories, type Category } from '../lib/categories';
import { createNote, type MediaInput } from '../lib/notes';

type Props = {
  visible: boolean;
  sourceUrl: string | null;
  onClose: () => void;
};

type XhsPayload = {
  type: 'xhs';
  title?: string;
  desc?: string;
  author?: string;
  authorAvatar?: string;
  cover?: string;
  images: string[];
  videoUrl?: string;
};

const READY_POLL_JS = `
(function () {
  if (window.__offnoteReady) return;
  function probe() {
    try {
      var hasState = !!window.__INITIAL_STATE__;
      var hasImg = !!document.querySelector('.onix-carousel-item img, .image-gallery-container img, .note-content, .desc, .title');
      var hasVideo = !!document.querySelector('video, .video-stage, #video_note_poster');
      return hasState || hasImg || hasVideo;
    } catch (e) { return false; }
  }
  var tries = 0;
  var maxTries = 30; // ~15s
  var timer = setInterval(function () {
    tries++;
    if (probe() || tries >= maxTries) {
      clearInterval(timer);
      setTimeout(grab, 900);
    }
  }, 500);

  function pickJsonValue(obj, paths) {
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i].split('.');
      var cur = obj;
      var ok = true;
      for (var j = 0; j < path.length; j++) {
        if (cur == null) { ok = false; break; }
        cur = cur[path[j]];
      }
      if (ok && cur != null && cur !== '') return cur;
    }
    return undefined;
  }

  function tryParseInitialState() {
    try {
      var raw = window.__INITIAL_STATE__;
      if (!raw) return null;
      // Already an object
      if (typeof raw === 'object') return raw;
      if (typeof raw === 'string') {
        var fixed = raw
          .replace(/undefined/g, 'null')
          .replace(/NaN/g, 'null')
          .replace(/Infinity/g, 'null');
        return JSON.parse(fixed);
      }
    } catch (e) {}
    return null;
  }

  function findNoteInState(state) {
    if (!state) return null;
    // common shapes
    var candidates = [
      state.note,
      state.noteData && state.noteData.note,
      state.note && state.note.noteDetailMap,
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && typeof candidates[i] === 'object') {
        // noteDetailMap is keyed by id -> { note }
        if (candidates[i].noteDetailMap || candidates[i].note) {
          var inner = candidates[i].note ?? Object.values(candidates[i])[0];
          if (inner && inner.note) return inner.note;
          if (inner && (inner.title || inner.imageList || inner.video)) return inner;
        }
        if (candidates[i].title || candidates[i].imageList || candidates[i].video) {
          return candidates[i];
        }
      }
    }
    // deep scan small objects with title + (imageList|video)
    function deepScan(node, depth) {
      if (!node || depth > 6 || typeof node !== 'object') return null;
      if (node.title && (node.imageList || node.video || node.desc)) return node;
      for (var k in node) {
        try {
          var got = deepScan(node[k], depth + 1);
          if (got) return got;
        } catch (e) {}
      }
      return null;
    }
    return deepScan(state, 0);
  }

  function extractFromDOM() {
    var title =
      (document.querySelector('.title') || {}).textContent ||
      (document.querySelector('h1') || {}).textContent ||
      document.title ||
      '';
    var desc =
      (document.querySelector('.note-content') || {}).textContent ||
      (document.querySelector('.desc') || {}).textContent ||
      '';
    var author =
      (document.querySelector('.author-wrapper .name') || {}).textContent ||
      (document.querySelector('.nickname') || {}).textContent ||
      '';
    var authorAvatar =
      (document.querySelector('.author-wrapper img') || {}).src ||
      (document.querySelector('.author-container img') || {}).src ||
      '';
    var imgs = Array.from(
      document.querySelectorAll('.onix-carousel-item img, .image-gallery-container img'),
    )
      .map(function (im) { return im.src || im.dataset.src || im.dataset.original; })
      .filter(function (u) {
        if (!u) return false;
        if (u.indexOf('sns-avatar') !== -1) return false;
        if (u.indexOf('/avatar/') !== -1) return false;
        return /^https?:/i.test(u);
      });
    var videoUrl;
    var videoEl = document.querySelector('video');
    if (videoEl) videoUrl = videoEl.currentSrc || videoEl.src;
    var cover =
      (document.querySelector('#video_note_poster') || {}).src ||
      (document.querySelector('.video-container img') || {}).src ||
      (document.querySelector('.video-stage img') || {}).src ||
      '';
    return {
      title: (title || '').trim(),
      desc: (desc || '').trim(),
      author: (author || '').trim(),
      authorAvatar: authorAvatar || '',
      cover: cover || '',
      images: Array.from(new Set(imgs)),
      videoUrl: videoUrl,
    };
  }

  function extractFromState(note) {
    if (!note) return null;
    var title = pickJsonValue(note, ['title', 'noteTitle']);
    var desc = pickJsonValue(note, ['desc', 'noteDesc']);
    var user = note.user || {};
    var author = pickJsonValue(user, ['nickName', 'nickname', 'name']);
    var authorAvatar = pickJsonValue(user, ['avatar', 'image']);

    var images = [];
    if (Array.isArray(note.imageList)) {
      note.imageList.forEach(function (item) {
        var url = pickJsonValue(item, ['urlDefault', 'url', 'urlSizeLarge', 'urlPre']);
        if (url) images.push(url);
      });
    }

    var videoUrl;
    try {
      var streams = note.video && note.video.media && note.video.media.stream;
      if (streams) {
        ['h264', 'h265', 'av1'].some(function (codec) {
          var list = streams[codec];
          if (Array.isArray(list) && list.length) {
            // pick the largest by size
            var best = list.slice().sort(function (a, b) {
              return (b.size || 0) - (a.size || 0);
            })[0];
            videoUrl =
              best.masterUrl ||
              (Array.isArray(best.backupUrls) && best.backupUrls[0]);
            return !!videoUrl;
          }
          return false;
        });
      }
    } catch (e) {}

    var cover = '';
    try {
      cover =
        (note.video && note.video.image && note.video.image.firstFrameFileid) ||
        (note.cover && (note.cover.urlDefault || note.cover.url)) ||
        '';
    } catch (e) {}

    return {
      title: (title || '').toString().trim(),
      desc: (desc || '').toString().trim(),
      author: (author || '').toString().trim(),
      authorAvatar: (authorAvatar || '').toString(),
      cover: cover,
      images: Array.from(new Set(images)),
      videoUrl: videoUrl,
    };
  }

  function send(payload) {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify(Object.assign({ type: 'xhs' }, payload)),
      );
      window.__offnoteReady = true;
    } catch (e) {}
  }

  function grab() {
    var state = tryParseInitialState();
    var note = findNoteInState(state);
    var fromState = extractFromState(note);
    var fromDom = extractFromDOM();
    var merged = {
      title: (fromState && fromState.title) || fromDom.title,
      desc: (fromState && fromState.desc) || fromDom.desc,
      author: (fromState && fromState.author) || fromDom.author,
      authorAvatar: (fromState && fromState.authorAvatar) || fromDom.authorAvatar,
      cover: (fromState && fromState.cover) || fromDom.cover,
      images:
        fromState && fromState.images && fromState.images.length
          ? fromState.images
          : fromDom.images,
      videoUrl: (fromState && fromState.videoUrl) || fromDom.videoUrl,
    };
    send(merged);
  }
})();
true;
`;

function inferExtFromUrl(u: string, fallback: string): string {
  const m = u.split('?')[0].match(/\.([A-Za-z0-9]+)$/);
  return (m ? m[1] : fallback).toLowerCase();
}

export default function XhsWebScreen({ visible, sourceUrl, onClose }: Props) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<XhsPayload | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!visible) return;
    setPayload(null);
    setShowRename(false);
    setBusyMsg(null);
    listCategories().then(setCategories);
  }, [visible]);

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'xhs') {
        setPayload(data);
      }
    } catch {}
  };

  const handleSave = () => {
    if (!payload) return;
    setShowRename(true);
  };

  const suggestedName = (() => {
    const author = payload?.author?.replace(/[^A-Za-z0-9_一-龥]/g, '');
    const slug = (payload?.title || payload?.desc || '')
      .replace(/\s+/g, ' ')
      .slice(0, 30)
      .replace(/[/\\:?*"<>|]/g, '')
      .trim();
    const parts = [author, slug].filter(Boolean).join('_');
    return parts || `xhs-${Date.now()}`;
  })();

  const hintExt = payload?.videoUrl ? 'mp4' : 'jpg';

  const handleConfirmName = async (
    finalName: string,
    note: string,
    categoryId?: string,
  ) => {
    if (!payload) return;
    setShowRename(false);
    setBusyMsg('正在下载…');

    const items: MediaInput[] = [];
    if (payload.videoUrl) {
      items.push({
        kind: 'video',
        hintExt: inferExtFromUrl(payload.videoUrl, 'mp4'),
        source: { type: 'remote', url: payload.videoUrl },
      });
    }
    for (const img of payload.images) {
      items.push({
        kind: 'image',
        hintExt: inferExtFromUrl(img, 'jpg'),
        source: { type: 'remote', url: img },
      });
    }

    if (items.length === 0) {
      setBusyMsg(null);
      Alert.alert('保存失败', '没有抓到可下载的图片或视频');
      return;
    }

    const titleOnly = finalName.replace(/\.[A-Za-z0-9]+$/, '');
    const result = await createNote({
      title: titleOnly,
      note,
      categoryId,
      source: 'rednote',
      items,
      metadata: {
        sourceUrl: sourceUrl ?? undefined,
        shortcode: null,
        author: payload.author,
        caption: payload.desc || payload.title,
        thumbnailUrl: payload.cover || payload.images[0],
      },
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
    Alert.alert(
      '已保存',
      `「${titleOnly}」包含 ${result.note?.media.length ?? 0} 个文件`,
      [{ text: '关闭', onPress: onClose }],
    );
  };

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
            小红书
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!payload}
            style={[styles.barBtn, !payload && styles.barBtnDisabled]}
          >
            <Text style={[styles.barBtnText, styles.barBtnPrimary]}>
              保存
            </Text>
          </Pressable>
        </View>

        {sourceUrl && (
          <View style={styles.webviewWrapper}>
            <WebView
              ref={webRef}
              source={{ uri: sourceUrl }}
              injectedJavaScript={READY_POLL_JS}
              onMessage={handleMessage}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              allowsBackForwardNavigationGestures
              userAgent={
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
              }
              style={styles.webview}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator />
              </View>
            )}
            {payload && (
              <View style={styles.readyBanner}>
                <Text style={styles.readyText}>
                  已抓到 · {payload.images.length} 图
                  {payload.videoUrl ? ' + 视频' : ''}
                </Text>
              </View>
            )}
            {busyMsg && (
              <View style={styles.busyBanner}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.busyText}>{busyMsg}</Text>
              </View>
            )}
          </View>
        )}

        <RenameModal
          visible={showRename}
          defaultName={`${suggestedName}.${hintExt}`}
          hintExt={hintExt}
          metadata={
            payload
              ? {
                  sourceUrl: sourceUrl ?? '',
                  shortcode: null,
                  author: payload.author,
                  caption: payload.desc || payload.title,
                  thumbnailUrl: payload.cover || payload.images[0],
                }
              : null
          }
          categories={categories}
          onCancel={() => setShowRename(false)}
          onConfirm={handleConfirmName}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  barBtn: { paddingVertical: 6, paddingHorizontal: 10, minWidth: 56 },
  barBtnDisabled: { opacity: 0.4 },
  barBtnText: { color: '#111', fontSize: 14 },
  barBtnPrimary: { color: '#e23b3b', fontWeight: '600' },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    textAlign: 'center',
  },
  webviewWrapper: { flex: 1, position: 'relative' },
  webview: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  readyBanner: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 158, 74, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  readyText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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
  busyText: { color: '#fff', fontSize: 14, flex: 1 },
});
