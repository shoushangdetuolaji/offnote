import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import SaveProgressOverlay, {
  type SaveProgress,
} from '../components/SaveProgressOverlay';
import { listCategories, type Category } from '../lib/categories';
import {
  buildDouyinExtra,
  DOUYIN_MEDIA_HEADERS,
  DOUYIN_UA,
  resolveDouyinWebUrl,
  toDouyinWebUrl,
  suggestDouyinName,
  type DouyinPayload,
} from '../lib/douyin';
import { createNote, type MediaInput } from '../lib/notes';

type Props = {
  visible: boolean;
  sourceUrl: string | null;
  onClose: () => void;
};

/**
 * 页面加载前注入：监听页面自己发出的 fetch / XHR，把带作品信息的 JSON 响应留一份。
 * 抖音分享页已不在 SSR 里返回作品数据，而是前端带签名去请求；我们只读取页面
 * 已经拿到的响应，不自己构造请求。
 */
const HOOK_JS = `
(function () {
  if (window.__offnoteHooked) return;
  window.__offnoteHooked = true;
  window.__offnoteApis = [];
  window.__offnoteCaptured = [];
  function consider(url, text) {
    try {
      url = String(url || '');
      if (window.__offnoteApis.length < 40) window.__offnoteApis.push(url.slice(0, 160));
      if (!text || typeof text !== 'string' || text.indexOf('aweme_id') < 0) return;
      var j = JSON.parse(text);
      window.__offnoteCaptured.push(j);
      if (window.__offnoteCaptured.length > 5) window.__offnoteCaptured.shift();
    } catch (e) {}
  }
  var of = window.fetch;
  if (of) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return of.apply(this, arguments).then(function (res) {
        try { res.clone().text().then(function (t) { consider(url, t); }, function () {}); } catch (e) {}
        return res;
      });
    };
  }
  var XO = XMLHttpRequest.prototype.open;
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__offnoteUrl = u;
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    try {
      x.addEventListener('load', function () {
        try {
          if (x.responseType === '' || x.responseType === 'text') consider(x.__offnoteUrl, x.responseText);
          else if (x.responseType === 'json') consider(x.__offnoteUrl, JSON.stringify(x.response));
        } catch (e) {}
      });
    } catch (e) {}
    return XS.apply(this, arguments);
  };
})();
true;
`;

/**
 * 注入脚本：优先用 HOOK_JS 截到的接口响应，其次是分享页的 _ROUTER_DATA（iesdouyin）或 RENDER_DATA（douyin.com）
 * 里找到作品对象，取文案、作者、发布时间、互动数、视频/图文地址。
 * 注意：模板字符串里的反斜杠要写成两个。
 */
const GRAB_JS = `
(function () {
  window.__offnoteGrab = function () { grab(true); };
  window.__offnoteDiag = function () {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'douyin-diag', data: diag() }));
    } catch (e) {}
  };
  if (window.__offnoteReady) return;

  function pageErrored() {
    var t = (document.body && document.body.innerText) || '';
    return /抱歉出错了|出错了|请尝试在抖音内观看/.test(t);
  }

  // video 页报错时换成 note（图文）页再试一次
  function maybeSwitchToNote() {
    try {
      if (!pageErrored()) return false;
      if (location.pathname.indexOf('/share/video/') < 0) return false;
      if (sessionStorage.getItem('__offnoteSwitched')) return false;
      sessionStorage.setItem('__offnoteSwitched', '1');
      location.replace(location.href.replace('/share/video/', '/share/note/'));
      return true;
    } catch (e) { return false; }
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var got = findItem(capturedRoot());
    if (!got && tries >= 6 && maybeSwitchToNote()) { clearInterval(timer); return; }
    if (got || document.querySelector('video') || tries >= 30) {
      clearInterval(timer);
      setTimeout(function () {
        grab(false);
        setInterval(function () { grab(false); }, 4000);
      }, 800);
    }
  }, 500);

  function getRoot() {
    try {
      if (window._ROUTER_DATA) return window._ROUTER_DATA;
      var el = document.getElementById('RENDER_DATA');
      if (el && el.textContent) return JSON.parse(decodeURIComponent(el.textContent));
      if (window.__INITIAL_STATE__) return window.__INITIAL_STATE__;
    } catch (e) {}
    return null;
  }

  function isItem(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x) &&
      (x.aweme_id != null || x.awemeId != null) &&
      (x.video || x.images || x.desc != null);
  }

  function capturedRoot() {
    var c = window.__offnoteCaptured;
    return c && c.length ? c.slice().reverse() : null;
  }

  // 广度优先，优先返回带视频或图片的作品对象
  function findItem(root) {
    if (!root || typeof root !== 'object') return null;
    var queue = [[root, 0]];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var fallback = null;
    var steps = 0;
    while (queue.length && steps < 30000) {
      steps++;
      var it = queue.shift();
      var node = it[0], depth = it[1];
      if (!node || typeof node !== 'object' || depth > 12) continue;
      if (seen) { if (seen.has(node)) continue; seen.add(node); }
      if (isItem(node)) {
        if (node.video || (node.images && node.images.length)) return node;
        if (!fallback) fallback = node;
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) queue.push([node[i], depth + 1]);
      } else {
        for (var k in node) {
          try { queue.push([node[k], depth + 1]); } catch (e) {}
        }
      }
    }
    return fallback;
  }

  function urlOf(obj, preferJpeg) {
    if (!obj) return '';
    var list = obj.url_list || obj.urlList || [];
    if (!Array.isArray(list) || !list.length) return obj.uri && /^https?:/.test(obj.uri) ? obj.uri : '';
    if (preferJpeg) {
      for (var i = 0; i < list.length; i++) {
        if (/jpe?g/i.test(list[i])) return list[i];
      }
    }
    return list[0];
  }

  function fromItem(item) {
    var author = item.author || {};
    var stats = item.statistics || item.stats || {};
    var images = [];
    if (Array.isArray(item.images)) {
      item.images.forEach(function (img) {
        var u = urlOf(img, true);
        if (u) images.push(u);
      });
    }
    var video = item.video || {};
    var videoUrl = images.length ? '' : (urlOf(video.play_addr || video.playAddr) || '');
    var topics = [];
    (item.text_extra || item.textExtra || []).forEach(function (t) {
      var name = t && (t.hashtag_name || t.hashtagName);
      if (name && topics.indexOf(name) < 0) topics.push(name);
    });
    return {
      awemeId: String(item.aweme_id || item.awemeId || ''),
      desc: item.desc || '',
      author: author.nickname || '',
      authorAvatar: urlOf(author.avatar_medium || author.avatar_thumb || author.avatar_larger || author.avatarThumb),
      cover: urlOf(video.origin_cover || video.cover || video.originCover) || images[0] || '',
      images: images,
      videoUrl: videoUrl,
      createTime: item.create_time || item.createTime,
      topics: topics,
      diggCount: stats.digg_count != null ? stats.digg_count : stats.diggCount,
      collectCount: stats.collect_count != null ? stats.collect_count : stats.collectCount,
      commentCount: stats.comment_count != null ? stats.comment_count : stats.commentCount,
    };
  }

  function fromDom() {
    function meta(k) {
      var el = document.querySelector('meta[property="' + k + '"], meta[name="' + k + '"]');
      return el ? el.getAttribute('content') || '' : '';
    }
    var v = document.querySelector('video');
    var src = v ? (v.currentSrc || v.src || '') : '';
    if (/^blob:/.test(src)) src = '';
    return {
      desc: meta('og:description') || meta('description') || document.title || '',
      author: '',
      authorAvatar: '',
      cover: meta('og:image') || (v && v.poster) || '',
      images: [],
      videoUrl: src,
      topics: [],
    };
  }

  var lastSent = '';
  function grab(force) {
    var item = findItem(capturedRoot()) || findItem(getRoot());
    var data = item ? fromItem(item) : fromDom();
    if (item && !data.videoUrl && !data.images.length) {
      var dom = fromDom();
      data.videoUrl = dom.videoUrl;
    }
    try {
      var key = JSON.stringify(data);
      if (!force && key === lastSent) return;
      lastSent = key;
      window.ReactNativeWebView.postMessage(
        JSON.stringify(Object.assign({ type: 'douyin', forced: !!force }, data)),
      );
      window.__offnoteReady = true;
    } catch (e) {}
  }

  function diag() {
    var root = getRoot();
    var item = findItem(capturedRoot()) || findItem(root);
    var v = document.querySelector('video');
    return {
      apis: window.__offnoteApis || [],
      capturedCount: (window.__offnoteCaptured || []).length,
      pageText: ((document.body && document.body.innerText) || '').slice(0, 300),
      href: location.href,
      ua: navigator.userAgent,
      hasRouterData: !!window._ROUTER_DATA,
      hasRenderData: !!document.getElementById('RENDER_DATA'),
      rootKeys: root && typeof root === 'object' ? Object.keys(root).slice(0, 40) : [],
      itemKeys: item ? Object.keys(item).slice(0, 80) : [],
      itemSample: item ? JSON.stringify(item).slice(0, 6000) : '',
      videoSrc: v ? (v.currentSrc || v.src || '') : '',
      parsed: item ? fromItem(item) : fromDom(),
    };
  }
})();
true;
`;

function inferExtFromUrl(u: string, fallback: string): string {
  const m = u.split('?')[0].match(/\.(jpe?g|png|webp|heic|mp4|mov)$/i);
  return (m ? m[1] : fallback).toLowerCase();
}

export default function DouyinWebScreen({ visible, sourceUrl, onClose }: Props) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [payload, setPayload] = useState<DouyinPayload | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 实际在 WebView 里打开的网页端链接 */
  const [webUrl, setWebUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !sourceUrl) {
      setWebUrl(null);
      return;
    }
    let alive = true;
    setWebUrl(null);
    resolveDouyinWebUrl(sourceUrl).then((u) => {
      if (alive) setWebUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [visible, sourceUrl]);

  useEffect(() => {
    if (!visible) return;
    setPayload(null);
    setShowRename(false);
    setProgress(null);
    listCategories().then(setCategories);
  }, [visible]);

  useEffect(
    () => () => {
      if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    },
    [],
  );

  const hasMedia = !!payload && (!!payload.videoUrl || payload.images.length > 0);

  const openRenameFromPending = () => {
    if (!pendingSaveRef.current) return;
    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
    setProgress(null);
    setShowRename(true);
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'douyin') {
        setPayload({ ...data, images: Array.isArray(data.images) ? data.images : [] });
        if (data.forced) openRenameFromPending();
      } else if (data?.type === 'douyin-diag') {
        const text = JSON.stringify(data.data, null, 2);
        Clipboard.setStringAsync(text).then(() => {
          Alert.alert(
            '诊断信息已复制',
            `共 ${text.length} 字符，粘贴发给开发者即可（只含页面结构和公开作品信息）`,
          );
        });
      }
    } catch {}
  };

  // 保存前再抓一次最新数据；超时就用已有数据
  const handleSave = () => {
    if (!hasMedia || pendingSaveRef.current) return;
    setProgress({ title: '正在读取最新内容…' });
    pendingSaveRef.current = setTimeout(() => {
      pendingSaveRef.current = null;
      setProgress(null);
      setShowRename(true);
    }, 1500);
    webRef.current?.injectJavaScript(
      'window.__offnoteGrab && window.__offnoteGrab(); true;',
    );
  };

  const extra = useMemo(
    () => (payload ? buildDouyinExtra(payload) : undefined),
    [payload],
  );
  const suggestedName = suggestDouyinName(payload);
  const hintExt = payload?.videoUrl ? 'mp4' : 'jpg';

  const handleConfirmName = async (
    finalName: string,
    note: string,
    categoryId: string | undefined,
    tags: string[],
  ) => {
    if (!payload) return;
    setShowRename(false);
    setProgress({ title: '正在下载', detail: '准备中…', fraction: 0 });

    const items: MediaInput[] = [];
    if (payload.videoUrl) {
      items.push({
        kind: 'video',
        hintExt: inferExtFromUrl(payload.videoUrl, 'mp4'),
        source: {
          type: 'remote',
          url: payload.videoUrl,
          headers: DOUYIN_MEDIA_HEADERS,
        },
      });
    }
    for (const img of payload.images) {
      items.push({
        kind: 'image',
        hintExt: inferExtFromUrl(img, 'jpg'),
        source: { type: 'remote', url: img, headers: DOUYIN_MEDIA_HEADERS },
      });
    }

    if (items.length === 0) {
      setProgress(null);
      Alert.alert('保存失败', '没有抓到可下载的视频或图片');
      return;
    }

    const titleOnly = finalName.replace(/\.[A-Za-z0-9]+$/, '');
    const result = await createNote({
      title: titleOnly,
      note,
      categoryId,
      tags,
      source: 'douyin',
      items,
      metadata: {
        sourceUrl: webUrl ?? sourceUrl ?? '',
        shortcode: null,
        author: payload.author || undefined,
        caption: payload.desc || undefined,
        thumbnailUrl: payload.cover || payload.images[0],
      },
      xhs: extra,
      // 媒体占 0~95%，头像等附加内容占最后 5%
      onItemProgress: (i, total, f) => {
        const kind = items[i]?.kind === 'video' ? '视频' : '图片';
        setProgress({
          title: '正在下载',
          detail: total > 1 ? `第 ${i + 1}/${total} 项 · ${kind}` : kind,
          fraction: ((i + f) / total) * 0.95,
        });
      },
      onExtraProgress: (done, total) => {
        setProgress({
          title: '正在保存头像',
          detail: `${done}/${total}`,
          fraction: 0.95 + (done / total) * 0.05,
        });
      },
    });
    setProgress(null);
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
        <StatusBar barStyle="dark-content" />
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.barBtn}>
            <Text style={styles.barBtnText}>关闭</Text>
          </Pressable>
          <Text style={styles.barTitle} numberOfLines={1}>
            抖音
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!hasMedia}
            style={[styles.barBtn, !hasMedia && styles.barBtnDisabled]}
          >
            <Text style={[styles.barBtnText, styles.barBtnPrimary]}>保存</Text>
          </Pressable>
        </View>

        {!webUrl && sourceUrl && (
          <View style={styles.resolving}>
            <ActivityIndicator />
            <Text style={styles.resolvingText}>正在解析分享链接…</Text>
          </View>
        )}

        {webUrl && (
          <View style={styles.webviewWrapper}>
            <WebView
              ref={webRef}
              source={{ uri: webUrl }}
              injectedJavaScriptBeforeContentLoaded={HOOK_JS}
              injectedJavaScript={GRAB_JS}
              onMessage={handleMessage}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              allowsInlineMediaPlayback
              allowsBackForwardNavigationGestures
              // 分享页会尝试用 snssdk1128:// 等协议唤起抖音 App，拦掉只留网页
              userAgent={DOUYIN_UA}
              originWhitelist={['http://*', 'https://*', 'about:*']}
              onShouldStartLoadWithRequest={(req) => {
                if (!/^(https?:|about:)/i.test(req.url)) return false;
                // 万一还是跳到了 App 分享页，改走网页端链接
                if (/iesdouyin\.com\/share\//i.test(req.url)) {
                  const web = toDouyinWebUrl(req.url);
                  if (web && web !== webUrl) {
                    setWebUrl(web);
                    return false;
                  }
                }
                return true;
              }}
              style={styles.webview}
            />
            {loading && (
              <View style={styles.loadingOverlay} pointerEvents="none">
                <ActivityIndicator />
              </View>
            )}
            {payload && (
              <Pressable
                style={[styles.readyBanner, !hasMedia && styles.readyBannerWarn]}
                delayLongPress={600}
                onLongPress={() =>
                  webRef.current?.injectJavaScript(
                    'window.__offnoteDiag && window.__offnoteDiag(); true;',
                  )
                }
              >
                <Text style={styles.readyText}>
                  {hasMedia
                    ? `已抓到 · ${payload.videoUrl ? '视频' : `${payload.images.length} 图`}`
                    : '没抓到视频/图片（长按诊断）'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <SaveProgressOverlay progress={progress} />

        <RenameModal
          visible={showRename}
          defaultName={`${suggestedName}.${hintExt}`}
          hintExt={hintExt}
          metadata={
            payload
              ? {
                  sourceUrl: sourceUrl ?? '',
                  shortcode: null,
                  author: payload.author || undefined,
                  caption: payload.desc || undefined,
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
  resolving: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  resolvingText: { fontSize: 13, color: '#888' },
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
  readyBannerWarn: { backgroundColor: 'rgba(200, 120, 20, 0.92)' },
  readyText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
