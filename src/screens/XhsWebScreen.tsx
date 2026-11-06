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
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import RenameModal from '../components/RenameModal';
import { listCategories, type Category } from '../lib/categories';
import { createNote, type MediaInput } from '../lib/notes';
import { buildXhsExtra, countXhsComments } from '../lib/xhsExtra';

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
  /** 笔记对象里的发布时间、IP、话题、互动数等原始字段 */
  noteMeta?: any;
  /** __INITIAL_STATE__ 里已加载的评论（原始结构） */
  rawComments?: any[];
  /** 状态里拿不到时，从 DOM 兜底解析的评论 */
  domComments?: any[];
  /** 保存时主动触发的抓取 */
  forced?: boolean;
};

const READY_POLL_JS = `
(function () {
  window.__offnoteGrab = function () { grab(true); };
  window.__offnoteDiag = function () {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'xhs-diag', data: diag() }));
    } catch (e) {}
  };
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
      setTimeout(function () {
        grab(false);
        // 评论是滚动后懒加载的，定时刷新一下（内容没变就不发）
        setInterval(function () { grab(false); }, 4000);
      }, 900);
    }
  }, 500);

  function plain(x) {
    try { return JSON.parse(JSON.stringify(x)); } catch (e) { return undefined; }
  }

  function looksLikeComment(x) {
    return !!x && typeof x === 'object' && typeof x.content === 'string' &&
      typeof (x.userInfo || x.user_info || x.user || x.author) === 'object' &&
      (x.id != null || x.commentId != null || x.comment_id != null);
  }

  // 广度优先找第一个评论数组（顶层列表先于楼中楼被找到）
  function findCommentList(state) {
    if (!state || typeof state !== 'object') return null;
    var queue = [[state, 0]];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var steps = 0;
    while (queue.length && steps < 20000) {
      steps++;
      var item = queue.shift();
      var node = item[0], depth = item[1];
      if (!node || typeof node !== 'object' || depth > 10) continue;
      if (seen) { if (seen.has(node)) continue; seen.add(node); }
      if (Array.isArray(node)) {
        if (node.length && looksLikeComment(node[0])) return node;
        for (var i = 0; i < node.length; i++) queue.push([node[i], depth + 1]);
        continue;
      }
      for (var k in node) {
        try { queue.push([node[k], depth + 1]); } catch (e) {}
      }
    }
    return null;
  }

  function txt(el, sel) {
    var n = sel ? el.querySelector(sel) : el;
    return n ? (n.textContent || '').trim() : '';
  }

  // DOM 兜底：按 PC 网页版结构解析，输出与状态里相同的字段
  function domCommentItem(el) {
    var name = txt(el, '.author .name') || txt(el, '.name') || txt(el, '.nickname');
    var content = txt(el, '.note-text') || txt(el, '.content');
    var avatarEl = el.querySelector('.avatar img, img.avatar-item, .user-avatar img');
    var pics = Array.prototype.slice
      .call(el.querySelectorAll('.comment-picture img, .comment-pictures img'))
      .map(function (im) { return im.src || im.dataset.src; })
      .filter(Boolean);
    return {
      id: el.id || el.getAttribute('data-id') || '',
      content: content,
      timeText: [txt(el, '.date span') || txt(el, '.date'), ''].join('').trim(),
      ipLocation: txt(el, '.location'),
      likeCount: txt(el, '.like .count'),
      isAuthor: /作者/.test(txt(el, '.tag')),
      userInfo: { nickname: name, image: avatarEl ? avatarEl.src : '' },
      pictures: pics,
    };
  }

  function hasCls(el, re) {
    var c = el && el.getAttribute && el.getAttribute('class');
    return !!c && re.test(c);
  }

  function firstByCls(root, re, exclude) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (exclude && exclude(all[i])) continue;
      if (hasCls(all[i], re) && (all[i].textContent || '').trim()) return all[i];
    }
    return null;
  }

  // 通用兜底：class 含 comment、内含头像图片和文字、且不再包含另一个评论项的最内层元素
  function genericCommentItems() {
    var cands = Array.prototype.filter.call(
      document.querySelectorAll('[class*="comment" i]'),
      function (el) {
        return el.querySelector('img') && (el.textContent || '').trim().length > 0;
      },
    );
    var leaves = cands.filter(function (el) {
      return !cands.some(function (o) { return o !== el && el.contains(o); });
    });
    return leaves.map(function (el) {
      var nameEl = firstByCls(el, /(nick|name|author)/i);
      var textEl = firstByCls(el, /(content|text|desc)/i, function (n) {
        return nameEl && (n === nameEl || n.contains(nameEl) || nameEl.contains(n));
      });
      var imgs = Array.prototype.slice.call(el.querySelectorAll('img'));
      var avatar = imgs[0];
      var pics = imgs.slice(1).filter(function (im) {
        return /(pic|image|photo)/i.test(im.getAttribute('class') || '') ||
          /(pic|image|photo)/i.test((im.parentElement && im.parentElement.getAttribute('class')) || '');
      }).map(function (im) { return im.src || im.dataset.src; }).filter(Boolean);
      var dateEl = firstByCls(el, /(date|time)/i);
      var likeEl = firstByCls(el, /like/i);
      return {
        id: el.id || el.getAttribute('data-id') || '',
        content: textEl ? textEl.textContent.trim() : '',
        timeText: dateEl ? dateEl.textContent.trim() : '',
        likeCount: likeEl ? (likeEl.textContent.match(/[\\d.]+[万wk]?/i) || [''])[0] : '',
        isAuthor: /作者/.test(el.textContent || ''),
        userInfo: { nickname: nameEl ? nameEl.textContent.trim() : '', image: avatar ? avatar.src : '' },
        pictures: pics,
      };
    }).filter(function (c) { return c.content || c.pictures.length; });
  }

  // 诊断：评论相关的状态路径和 DOM 结构，复制给开发者看
  function diag() {
    var state = tryParseInitialState();
    var hits = [];
    try {
      var queue = [[state, '$', 0]];
      var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      var steps = 0;
      while (queue.length && steps < 30000 && hits.length < 15) {
        steps++;
        var it = queue.shift();
        var node = it[0], path = it[1], depth = it[2];
        if (!node || typeof node !== 'object' || depth > 10) continue;
        if (seen) { if (seen.has(node)) continue; seen.add(node); }
        if (Array.isArray(node)) {
          var f = node[0];
          if (f && typeof f === 'object' && ('content' in f || 'comment' in f || 'commentId' in f || 'comment_id' in f)) {
            hits.push({ path: path, len: node.length, keys: Object.keys(f).slice(0, 40),
              sample: JSON.stringify(f).slice(0, 1200) });
          }
          for (var i = 0; i < Math.min(node.length, 50); i++) queue.push([node[i], path + '[' + i + ']', depth + 1]);
          continue;
        }
        for (var k in node) {
          try {
            if (/comment/i.test(k) && hits.length < 15) {
              var v = node[k];
              hits.push({ path: path + '.' + k, type: Array.isArray(v) ? 'array(' + v.length + ')' : typeof v,
                keys: v && typeof v === 'object' ? Object.keys(v).slice(0, 40) : undefined });
            }
            queue.push([node[k], path + '.' + k, depth + 1]);
          } catch (e) {}
        }
      }
    } catch (e) {}
    var els = document.querySelectorAll('[class*="comment" i]');
    var classes = {};
    Array.prototype.forEach.call(els, function (el) {
      (el.getAttribute('class') || '').split(/\\s+/).forEach(function (c) { if (c) classes[c] = (classes[c] || 0) + 1; });
    });
    var sampleEl = els.length ? (els[Math.min(3, els.length - 1)]) : null;
    return {
      href: location.href,
      ua: navigator.userAgent,
      hasState: !!state,
      stateKeys: state ? Object.keys(state) : [],
      stateHits: hits,
      domCommentCount: els.length,
      domClasses: classes,
      domSample: sampleEl ? sampleEl.outerHTML.slice(0, 5000) : '',
      genericParsed: genericCommentItems().slice(0, 3),
    };
  }
  function extractCommentsFromDOM() {
    var parents = document.querySelectorAll('.parent-comment');
    var out = [];
    Array.prototype.forEach.call(parents, function (p) {
      var main = p.querySelector('.comment-item');
      if (!main) return;
      var c = domCommentItem(main);
      c.subComments = Array.prototype.slice
        .call(p.querySelectorAll('.reply-container .comment-item'))
        .map(domCommentItem);
      out.push(c);
    });
    if (!out.length) out = genericCommentItems();
    return out;
  }

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

  var lastSent = '';
  function send(payload, force) {
    try {
      var body = JSON.stringify(Object.assign({ type: 'xhs', forced: !!force }, payload));
      var key = JSON.stringify(payload);
      if (!force && key === lastSent) return;
      lastSent = key;
      window.ReactNativeWebView.postMessage(body);
      window.__offnoteReady = true;
    } catch (e) {}
  }

  function grab(force) {
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
    if (note) {
      merged.noteMeta = plain({
        time: note.time, publishTime: note.publishTime,
        ipLocation: note.ipLocation, ip_location: note.ip_location,
        tagList: note.tagList, tag_list: note.tag_list,
        interactInfo: note.interactInfo, interact_info: note.interact_info,
        user: note.user ? { userId: note.user.userId, user_id: note.user.user_id } : undefined,
      });
    }
    var list = findCommentList(state);
    if (list && list.length) {
      merged.rawComments = plain(list);
    } else {
      var dom = extractCommentsFromDOM();
      if (dom.length) merged.domComments = dom;
    }
    send(merged, force);
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

  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    },
    [],
  );

  const openRenameFromPending = () => {
    if (!pendingSaveRef.current) return;
    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
    setShowRename(true);
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data ?? '{}');
      if (data?.type === 'xhs') {
        setPayload(data);
        if (data.forced) openRenameFromPending();
      } else if (data?.type === 'xhs-diag') {
        const text = JSON.stringify(data.data, null, 2);
        Clipboard.setStringAsync(text).then(() => {
          Alert.alert(
            '诊断信息已复制',
            `共 ${text.length} 字符，粘贴发给开发者即可（只含页面结构和公开评论内容）`,
          );
        });
      }
    } catch {}
  };

  // 点保存时再抓一次，拿到用户滚动后新加载的评论；超时就用已有数据
  const handleSave = () => {
    if (!payload || pendingSaveRef.current) return;
    pendingSaveRef.current = setTimeout(() => {
      pendingSaveRef.current = null;
      setShowRename(true);
    }, 1500);
    webRef.current?.injectJavaScript(
      'window.__offnoteGrab && window.__offnoteGrab(); true;',
    );
  };

  const xhsExtra = useMemo(
    () =>
      payload
        ? buildXhsExtra({
            title: payload.title,
            desc: payload.desc,
            authorAvatar: payload.authorAvatar,
            noteMeta: payload.noteMeta,
            rawComments: payload.rawComments,
            domComments: payload.domComments,
          })
        : undefined,
    [payload],
  );
  const commentTotal = countXhsComments(xhsExtra);

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
    categoryId: string | undefined,
    tags: string[],
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
    const finalSourceUrl = sourceUrl ?? '';
    const result = await createNote({
      title: titleOnly,
      note,
      categoryId,
      tags,
      source: 'rednote',
      items,
      metadata: {
        sourceUrl: finalSourceUrl,
        shortcode: null,
        author: payload.author,
        caption: payload.desc || payload.title,
        thumbnailUrl: payload.cover || payload.images[0],
      },
      xhs: xhsExtra,
      onItemProgress: (i, total, f) => {
        const overall = ((i + f) / total) * 100;
        setBusyMsg(`保存第 ${i + 1}/${total} 项 ${Math.round(overall)}%`);
      },
      onExtraProgress: (done, total) => {
        setBusyMsg(`保存评论图片 ${done}/${total}`);
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
        <StatusBar barStyle="dark-content" />
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
              <Pressable
                style={styles.readyBanner}
                delayLongPress={600}
                onLongPress={() =>
                  webRef.current?.injectJavaScript(
                    'window.__offnoteDiag && window.__offnoteDiag(); true;',
                  )
                }
              >
                <Text style={styles.readyText}>
                  已抓到 · {payload.images.length} 图
                  {payload.videoUrl ? ' + 视频' : ''}
                  {commentTotal > 0
                    ? ` · ${commentTotal} 条评论`
                    : ' · 0 条评论（长按诊断）'}
                </Text>
              </Pressable>
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
