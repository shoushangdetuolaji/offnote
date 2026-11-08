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
  DOUYIN_DESKTOP_UA,
  DOUYIN_MEDIA_HEADERS,
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
 * 页面加载前注入：先伪装成电脑浏览器，再监听页面自己发出的 fetch / XHR。
 * 手机 UA 会打开只有静图的手机版，图集里的 video/source 不会出现。
 */
const DESKTOP_SPOOF_JS = `
(function () {
  var ua = ${JSON.stringify(DOUYIN_DESKTOP_UA)};
  function force(obj, key, val) {
    try {
      Object.defineProperty(obj, key, { configurable: true, get: function () { return val; } });
    } catch (e) {}
  }
  force(navigator, 'userAgent', ua);
  force(navigator, 'appVersion', ua.replace('Mozilla/', ''));
  force(navigator, 'platform', 'Win32');
  force(navigator, 'vendor', 'Google Inc.');
  force(navigator, 'maxTouchPoints', 0);
  force(navigator, 'userAgentData', {
    mobile: false,
    platform: 'Windows',
    brands: [
      { brand: 'Chromium', version: '131' },
      { brand: 'Google Chrome', version: '131' },
    ],
    getHighEntropyValues: function () {
      return Promise.resolve({
        mobile: false,
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        bitness: '64',
        model: '',
        uaFullVersion: '131.0.0.0',
      });
    },
  });
})();
true;
`;

const HOOK_JS = `
(function () {
  if (window.__offnoteHooked) return;
  window.__offnoteHooked = true;
  window.__offnoteApis = [];
  window.__offnoteCaptured = [];
  window.__offnoteRaw = [];
  function consider(url, text) {
    try {
      url = String(url || '');
      if (window.__offnoteApis.length < 40) window.__offnoteApis.push(url.slice(0, 160));
      if (!text || typeof text !== 'string') return;
      var hasImages = text.indexOf('aweme-images') >= 0;
      var hasId = text.indexOf('aweme_id') >= 0 || text.indexOf('awemeId') >= 0;
      if (hasImages) {
        window.__offnoteRaw.push(text);
        if (window.__offnoteRaw.length > 3) window.__offnoteRaw.shift();
      } else if (hasId && window.__offnoteRaw.length < 2) {
        window.__offnoteRaw.push(text);
      }
      if (!hasId) return;
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
    var got = pickItem();
    if (!got && tries >= 6 && maybeSwitchToNote()) { clearInterval(timer); return; }
    // 地址里已经有作品 id 时，不要因为推荐区的 video 就提前抓
    if (got || (!pageAwemeId() && document.querySelector('video')) || tries >= 40) {
      clearInterval(timer);
      setTimeout(function () {
        grab(false);
        setInterval(function () { grab(false); }, 4000);
      }, 800);
    }
  }, 500);

  // 电脑版图文的作品在页面脚本 __pace_f 里，字段是 awemeId / images，不是 aweme_id
  function readJsonAt(text, start) {
    if (!text || text.charAt(start) !== '{') return null;
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = start; i < text.length; i++) {
      var c = text.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  function paceRoots() {
    var chunks = window.__pace_f || [];
    var roots = [];
    for (var i = 0; i < chunks.length; i++) {
      var row = chunks[i];
      var text = typeof row === 'string' ? row : (row && row[1]) || '';
      if (!text || (text.indexOf('awemeId') < 0 && text.indexOf('aweme_id') < 0)) continue;
      var from = 0;
      var found = 0;
      while (found < 6) {
        var a = text.indexOf('{"awemeId"', from);
        var b = text.indexOf('{"aweme_id"', from);
        var at = a < 0 ? b : b < 0 ? a : Math.min(a, b);
        if (at < 0) break;
        var obj = readJsonAt(text, at);
        if (obj) { roots.push(obj); found++; }
        from = at + 12;
      }
    }
    return roots;
  }

  function getRoot() {
    try {
      if (window._ROUTER_DATA) return window._ROUTER_DATA;
      var el = document.getElementById('RENDER_DATA');
      if (el && el.textContent) return JSON.parse(decodeURIComponent(el.textContent));
      if (window.__INITIAL_STATE__) return window.__INITIAL_STATE__;
    } catch (e) {}
    return null;
  }

  // 图文详情挂在 aweme.detail 上，旁边还有整页评论，不能靠全树搜索去碰运气
  function paceDetail() {
    var want = pageAwemeId();
    var roots = paceRoots();
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i] || {};
      var aweme = root.aweme || {};
      var detail = aweme.detail || aweme.awemeDetail || null;
      if (!detail || typeof detail !== 'object') continue;
      var id = idOf(detail) || idOf(root);
      if (want && id && id !== want) continue;
      if ((detail.images && detail.images.length) || detail.desc) return detail;
    }
    return null;
  }

  function pageAwemeId() {
    var parts = (location.pathname || '').split('/');
    for (var i = 0; i < parts.length; i++) {
      var kind = parts[i];
      var id = parts[i + 1] || '';
      if ((kind === 'video' || kind === 'note' || kind === 'slides') && /^[0-9]+$/.test(id)) return id;
    }
    var search = location.search || '';
    var key = 'modal_id=';
    var at = search.indexOf(key);
    if (at < 0) return '';
    var rest = search.slice(at + key.length);
    var num = '';
    for (var j = 0; j < rest.length; j++) {
      var c = rest.charAt(j);
      if (c >= '0' && c <= '9') num += c;
      else break;
    }
    return num;
  }

  function isItem(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x) &&
      (x.aweme_id != null || x.awemeId != null) &&
      (x.video || x.images || x.desc != null);
  }

  function idOf(node) {
    return String(node.aweme_id || node.awemeId || node.group_id_str || node.groupIdStr || '');
  }

  function isRich(node) {
    return !!(
      node.video ||
      (node.images && node.images.length) ||
      (node.image_post_info && node.image_post_info.images && node.image_post_info.images.length) ||
      (node.imagePostInfo && node.imagePostInfo.images && node.imagePostInfo.images.length)
    );
  }

  function capturedRoot() {
    var c = window.__offnoteCaptured;
    return c && c.length ? c.slice().reverse() : null;
  }

  // 只认地址里的作品。电脑版旁边的推荐也带 aweme_id，不能拿第一个。
  function findItem(root) {
    if (!root || typeof root !== 'object') return null;
    var want = pageAwemeId();
    var queue = [[root, 0]];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var matchRich = null;
    var match = null;
    var anyRich = null;
    var any = null;
    var steps = 0;
    while (queue.length && steps < 30000) {
      steps++;
      var it = queue.shift();
      var node = it[0], depth = it[1];
      if (!node || typeof node !== 'object' || depth > 12) continue;
      if (seen) { if (seen.has(node)) continue; seen.add(node); }
      if (isItem(node)) {
        var rich = isRich(node);
        if (want && idOf(node) === want) {
          if (rich) matchRich = matchRich || node;
          else match = match || node;
        } else if (!want) {
          if (rich) anyRich = anyRich || node;
          else any = any || node;
        }
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) queue.push([node[i], depth + 1]);
      } else {
        for (var k in node) {
          try { queue.push([node[k], depth + 1]); } catch (e) {}
        }
      }
    }
    if (want) return matchRich || match;
    return anyRich || any;
  }

  function scoreItem(node) {
    if (!node) return 0;
    var n = node.desc ? 1 : 0;
    if (node.images && node.images.length) n += 10 + node.images.length;
    if (node.video) n += 5;
    var post = node.image_post_info || node.imagePostInfo;
    if (post && post.images && post.images.length) n += 10 + post.images.length;
    return n;
  }

  function pickItem() {
    var pace = paceDetail();
    var a = findItem(capturedRoot());
    var b = findItem(getRoot());
    var best = a;
    if (scoreItem(b) > scoreItem(best)) best = b;
    if (scoreItem(pace) > scoreItem(best)) best = pace;
    return best || pace;
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

  function extName(u) {
    var path = String(u || '').split('?')[0].split('#')[0].toLowerCase();
    var slash = path.lastIndexOf('/');
    var name = slash >= 0 ? path.slice(slash + 1) : path;
    var dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1) : '';
  }

  function srcList(addr) {
    if (!addr) return [];
    if (typeof addr === 'string') return addr.indexOf('http') === 0 ? [addr] : [];
    if (Array.isArray(addr)) {
      var out = [];
      for (var i = 0; i < addr.length; i++) {
        var it = addr[i];
        if (typeof it === 'string') {
          if (it.indexOf('http') === 0) out.push(it);
        } else if (it && typeof it === 'object') {
          if (typeof it.src === 'string' && it.src.indexOf('http') === 0) out.push(it.src);
          else {
            var nested = urlOf(it);
            if (nested) out.push(nested);
          }
        }
      }
      return out;
    }
    var one = urlOf(addr);
    return one ? [one] : [];
  }

  function pickPlayable(urls) {
    var video = '';
    var any = '';
    for (var i = 0; i < urls.length; i++) {
      var u = urls[i];
      if (!u || u.indexOf('http') !== 0) continue;
      if (!any) any = u;
      if (isAudioUrl(u)) continue;
      if (u.indexOf('douyinvod.com') >= 0 || u.indexOf('/video/tos/') >= 0) return u;
      if (!video) video = u;
    }
    return video || any;
  }

  function playUrl(video) {
    if (!video || typeof video !== 'object') return '';
    var rates = video.bit_rate || video.bitRate || video.bitRateList || video.bit_rate_list || [];
    var best = '';
    var bestBr = -1;
    for (var i = 0; i < rates.length; i++) {
      var rate = rates[i] || {};
      var u = pickPlayable(srcList(rate.play_addr || rate.playAddr));
      var br = Number(rate.bit_rate || rate.bitRate || 0);
      if (u && !isAudioUrl(u) && br >= bestBr) { best = u; bestBr = br; }
    }
    if (best) return best;
    return pickPlayable(srcList(video.play_addr || video.playAddr)) || pickPlayable(srcList(video.download_addr || video.downloadAddr)) || '';
  }

  function stillOf(img) {
    var lists = [];
    function add(obj) {
      if (!obj) return;
      var groups = [obj.url_list, obj.urlList, obj.download_url_list, obj.downloadUrlList];
      for (var g = 0; g < groups.length; g++) {
        var list = groups[g];
        if (!Array.isArray(list)) continue;
        for (var i = 0; i < list.length; i++) {
          if (typeof list[i] === 'string' && list[i]) lists.push(list[i]);
        }
      }
    }
    add(img);
    add(img.display_image || img.displayImage);
    var gif = '', webp = '', jpeg = '', other = '';
    for (var n = 0; n < lists.length; n++) {
      var ext = extName(lists[n]);
      if (ext === 'gif' && !gif) gif = lists[n];
      else if (ext === 'webp' && !webp) webp = lists[n];
      else if ((ext === 'jpg' || ext === 'jpeg') && !jpeg) jpeg = lists[n];
      else if (!other) other = lists[n];
    }
    if (gif) return gif;
    if ((img.is_animated || img.animated || img.isAnimated) && webp) return webp;
    return jpeg || webp || other || urlOf(img, true) || '';
  }

  function slideVideo(img) {
    if (!img || typeof img !== 'object') return '';
    var live = img.video || img.video_info || img.videoInfo || img.live_photo || img.livePhoto || img.live_photo_info || img.livePhotoInfo;
    return playUrl(live);
  }

  function bestSource(v) {
    var list = [];
    var current = v.currentSrc || v.src || '';
    if (current && current.indexOf('blob:') !== 0 && current.indexOf('http') === 0) list.push(current);
    var sources = v.querySelectorAll('source');
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i].getAttribute('src') || '';
      if (s && s.indexOf('blob:') !== 0 && s.indexOf('http') === 0) list.push(s);
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].indexOf('douyinvod.com') >= 0 || list[j].indexOf('/video/tos/') >= 0) return list[j];
    }
    return list[0] || '';
  }

  function isAudioUrl(u) {
    u = String(u || '');
    if (u.indexOf('/obj/ies-music') >= 0) return true;
    var path = u.split('?')[0].toLowerCase();
    return path.endsWith('.mp3') || path.endsWith('.m4a') || path.endsWith('.aac');
  }

  function domVideos() {
    var out = [];
    var seen = {};
    var nodes = document.querySelectorAll('video');
    for (var i = 0; i < nodes.length; i++) {
      var u = bestSource(nodes[i]);
      if (!u || seen[u] || isAudioUrl(u)) continue;
      seen[u] = 1;
      out.push(u);
    }
    return out;
  }

  function noteImageKey(u) {
    var path = String(u || '').split('?')[0];
    var name = path.slice(path.lastIndexOf('/') + 1);
    var tilde = name.indexOf('~');
    return tilde >= 0 ? name.slice(0, tilde) : name;
  }

  function noteImageRank(u) {
    var path = String(u || '').split('?')[0].toLowerCase();
    if (path.indexOf('water') >= 0) return 0;
    if (path.indexOf('.jpeg') >= 0 || path.indexOf('.jpg') >= 0) return 3;
    if (path.indexOf('.png') >= 0) return 2;
    if (path.indexOf('.webp') >= 0) return 1;
    return 1;
  }

  function cleanNoteUrl(u) {
    return String(u || '').split('\\\\u0026').join('&').split('\\\\/').join('/');
  }

  function pushNoteImage(map, u) {
    u = cleanNoteUrl(u);
    if (!u || u.indexOf('aweme-images') < 0 || u.indexOf('tplv-dy-water') >= 0) return;
    var id = noteImageKey(u);
    if (!id || id.length < 8) return;
    var prev = map[id];
    if (!prev || noteImageRank(u) > noteImageRank(prev)) map[id] = u;
  }

  function scanNoteImages(text, map) {
    if (!text) return;
    var needle = 'aweme-images';
    var from = 0;
    while (from < text.length) {
      var at = text.indexOf(needle, from);
      if (at < 0) break;
      var http = text.lastIndexOf('http', at);
      if (http < 0 || at - http > 260) { from = at + needle.length; continue; }
      var end = at + needle.length;
      while (end < text.length) {
        var c = text.charAt(end);
        if (c === '"' || c === "'" || c === ' ' || c === '<' || c === ')') break;
        end++;
      }
      pushNoteImage(map, text.slice(http, end));
      from = end;
    }
  }

  function mapToList(map) {
    var out = [];
    for (var id in map) out.push(map[id]);
    return out;
  }

  // 只切当前作品 detail 里的 images 数组，不把推荐、评论里的图算进来
  function albumSlice(text, awemeId) {
    if (!text || !awemeId) return '';
    var marker = '"awemeId":"' + awemeId + '"';
    var at = text.indexOf(marker);
    if (at < 0) return '';
    var key = '"images":[';
    var imgAt = text.indexOf(key, at);
    if (imgAt < 0 || imgAt - at > 150000) return '';
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = imgAt + key.length - 1; i < text.length; i++) {
      var c = text.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']') {
        depth--;
        if (depth === 0) return text.slice(imgAt, i + 1);
      }
    }
    return '';
  }

  function isNotePage() {
    var path = location.pathname || '';
    return path.indexOf('/note/') >= 0 || path.indexOf('/slides/') >= 0 || path.indexOf('/share/note') >= 0 || path.indexOf('/share/slides') >= 0;
  }

  function slideImages() {
    var map = {};
    var slides = document.querySelectorAll('.dySwiperSlide');
    for (var i = 0; i < slides.length; i++) {
      var img = slides[i].querySelector('img');
      if (!img) continue;
      var src = img.getAttribute('src') || img.getAttribute('data-src') || img.currentSrc || '';
      if (src.indexOf('//') === 0) src = 'https:' + src;
      pushNoteImage(map, src);
    }
    return mapToList(map);
  }

  function collectNoteImages() {
    var seen = slideImages();
    if (seen.length) return seen;
    var map = {};
    var awemeId = pageAwemeId();
    var chunks = window.__pace_f || [];
    for (var i = 0; i < chunks.length; i++) {
      var row = chunks[i];
      var text = typeof row === 'string' ? row : (row && (row[1] || row[0])) || '';
      if (typeof text === 'string') scanNoteImages(albumSlice(text, awemeId), map);
    }
    var raw = window.__offnoteRaw || [];
    for (var r = 0; r < raw.length; r++) scanNoteImages(albumSlice(raw[r], awemeId), map);
    return mapToList(map);
  }

  function domDesc() {
    var title = (document.title || '').replace(/\\s*-\\s*抖音\\s*$/, '').trim();
    var needle = title.slice(0, 16);
    if (!needle || !document.body) return '';
    var nodes = document.body.querySelectorAll('div');
    var best = '';
    for (var i = 0; i < nodes.length && i < 900; i++) {
      var el = nodes[i];
      if (el.querySelector('.dySwiperSlide')) continue;
      var text = (el.innerText || '').trim();
      if (text.length < 40 || text.length > 8000) continue;
      if (text.indexOf(needle) < 0) continue;
      if (!best || text.length < best.length) best = text;
    }
    return best;
  }

  function fromItem(item) {
    var author = item.author || item.authorInfo || {};
    var stats = item.statistics || item.stats || {};
    var images = [];
    var media = [];
    var slideCover = '';
    var slides = Array.isArray(item.images) ? item.images : [];
    if (!slides.length) {
      var gears = item.img_bitrate || item.imgBitRate || [];
      var bestGear = null;
      var bestW = -1;
      for (var g = 0; g < gears.length; g++) {
        var gear = gears[g] || {};
        var gimgs = gear.images || [];
        if (!gimgs.length) continue;
        var w = Number((gimgs[0] && gimgs[0].width) || 0);
        if (w >= bestW) { bestGear = gimgs; bestW = w; }
      }
      if (bestGear) slides = bestGear;
    }
    if (!slides.length) {
      var post = item.image_post_info || item.imagePostInfo;
      if (post && Array.isArray(post.images)) slides = post.images;
    }
    var video = item.video || {};
    var music = item.music || {};
    var sharedBgm = playUrl(video) || urlOf(music.play_url || music.playUrl) || '';
    // 同一组轮播里静图和视频页夹在一起。有自己的画面就留视频，否则留这一页的图，顺序不变。
    var slots = [];
    var slotAt = {};
    for (var i = 0; i < slides.length; i++) {
      var img = slides[i] || {};
      var vu = slideVideo(img);
      var still = stillOf(img);
      var clipRaw = img.clipType != null ? img.clipType : img.clip_type;
      var clip = clipRaw == null || clipRaw === '' ? -1 : Number(clipRaw);
      var ownVideo = !!(vu && !isAudioUrl(vu) && vu !== sharedBgm);
      var asVideo = ownVideo && clip !== 2;
      var kind = '';
      var url = '';
      var key = '';
      if (asVideo) {
        kind = 'video';
        url = vu;
        key = 'v:' + vu;
      } else if (still) {
        kind = 'image';
        url = still;
        key = 'i:' + (noteImageKey(still) || still);
      } else if (ownVideo) {
        kind = 'video';
        url = vu;
        key = 'v:' + vu;
      }
      if (kind) {
        var at = slotAt[key];
        if (at == null) {
          slotAt[key] = slots.length;
          slots.push({ kind: kind, url: url });
        } else if (kind === 'image' && noteImageRank(url) > noteImageRank(slots[at].url)) {
          slots[at].url = url;
        }
      }
      if (!slideCover) {
        var lv = img.video || img.live_photo || img.livePhoto || {};
        slideCover = urlOf(lv.cover || lv.origin_cover || lv.originCover, true) || still || '';
      }
    }
    for (var si = 0; si < slots.length; si++) {
      media.push({ kind: slots[si].kind, url: slots[si].url });
      if (slots[si].kind === 'image') images.push(slots[si].url);
    }
    var videoUrl = '';
    var audioUrl = '';
    if (!media.length) {
      if (sharedBgm && !isAudioUrl(sharedBgm)) {
        videoUrl = sharedBgm;
        media.push({ kind: 'video', url: sharedBgm });
      } else if (sharedBgm) {
        audioUrl = sharedBgm;
      }
    } else if (sharedBgm && isAudioUrl(sharedBgm) && (images.length > 0 || media.length > 1)) {
      audioUrl = sharedBgm;
    }
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
      cover: urlOf(video.origin_cover || video.cover || video.originCover, true) || slideCover || images[0] || '',
      images: images,
      media: media,
      videoUrl: videoUrl,
      audioUrl: audioUrl,
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
    var vids = domVideos();
    var v = document.querySelector('video');
    return {
      desc: meta('og:description') || meta('description') || document.title || '',
      author: '',
      authorAvatar: '',
      cover: meta('og:image') || (v && v.poster) || '',
      images: [],
      media: vids.map(function (u) { return { kind: 'video', url: u }; }),
      videoUrl: vids.length === 1 ? vids[0] : '',
      topics: [],
    };
  }

  function useDomVideos(data) {
    var vids = domVideos();
    if (!vids.length) return;
    var jsonVideos = 0;
    (data.media || []).forEach(function (m) { if (m && m.kind === 'video') jsonVideos++; });
    if (jsonVideos) return;
    var stills = (data.images || []).length;
    if (stills && vids.length < stills) return;
    data.media = vids.map(function (u) { return { kind: 'video', url: u }; });
    data.images = [];
    data.videoUrl = vids.length === 1 ? vids[0] : '';
    if (!data.cover) {
      var v = document.querySelector('video');
      if (v && v.poster) data.cover = v.poster;
    }
  }

  function useNoteImages(data, pics) {
    if (!isNotePage() || !pics.length) return;
    var stills = 0;
    var videoCount = 0;
    (data.media || []).forEach(function (m) {
      if (!m || !m.url || isAudioUrl(m.url)) return;
      if (m.kind === 'image') stills++;
      else if (m.kind === 'video') videoCount++;
    });
    // 图文和视频已经按页排好。作品自己的静图够了就用那一组，不要拿推荐区的图来替换。
    if (stills > 0 && videoCount > 0) return;
    if (stills > 0 && stills <= pics.length) return;
    if (videoCount > 0 && stills === 0) return;
    var audio = data.audioUrl || '';
    (data.media || []).forEach(function (m) {
      if (!audio && m && isAudioUrl(m.url)) audio = m.url;
    });
    if (!audio && data.videoUrl && isAudioUrl(data.videoUrl)) audio = data.videoUrl;
    data.audioUrl = audio || data.audioUrl || '';
    data.media = pics.map(function (u) { return { kind: 'image', url: u }; });
    data.images = pics.slice();
    data.videoUrl = '';
    if (!data.cover || isAudioUrl(data.cover)) data.cover = pics[0];
  }

  var lastSent = '';
  function grab(force) {
    var item = pickItem();
    var pics = collectNoteImages();
    // 知道作品 id，但详情和图片都还没出现时先等，不用背景音乐充数
    if (!item && pageAwemeId() && !pics.length) return;
    var data = item ? fromItem(item) : fromDom();
    if (!data.media) data.media = [];
    useNoteImages(data, pics);
    if (!data.desc) {
      var written = domDesc();
      if (written) data.desc = written;
    }
    if (item && !data.media.length && !pageAwemeId()) {
      var dom = fromDom();
      data.media = dom.media || [];
      data.videoUrl = dom.videoUrl;
      if (!data.cover) data.cover = dom.cover;
    }
    if (!pageAwemeId()) useDomVideos(data);
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
    var item = pickItem();
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
      sourceCount: v ? v.querySelectorAll('source').length : 0,
      domVideos: domVideos(),
      parsed: item ? fromItem(item) : fromDom(),
    };
  }
})();
true;
`;

function inferExtFromUrl(u: string, fallback: string): string {
  const m = u.split('?')[0].match(/\.(jpe?g|png|webp|gif|heic|mp4|mov|webm)$/i);
  return (m ? m[1] : fallback).toLowerCase();
}

function payloadMedia(p: DouyinPayload): { kind: 'video' | 'image'; url: string }[] {
  const media = (p.media ?? []).filter(
    (m) => m && (m.kind === 'video' || m.kind === 'image') && !!m.url,
  );
  if (media.length) return media;
  const out: { kind: 'video' | 'image'; url: string }[] = [];
  if (p.videoUrl) out.push({ kind: 'video', url: p.videoUrl });
  for (const img of p.images) out.push({ kind: 'image', url: img });
  return out;
}

function mediaLabel(list: { kind: string }[]): string {
  const videos = list.filter((m) => m.kind === 'video').length;
  const images = list.filter((m) => m.kind === 'image').length;
  const parts: string[] = [];
  if (videos) parts.push(videos === 1 && !images ? '视频' : `${videos} 个视频`);
  if (images) parts.push(`${images} 张图`);
  return parts.join(' · ');
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

  const mediaItems = payload ? payloadMedia(payload) : [];
  const hasMedia = mediaItems.length > 0;

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
        const media = Array.isArray(data.media)
          ? data.media.filter(
              (m: { kind?: string; url?: string }) =>
                !!m &&
                typeof m.url === 'string' &&
                (m.kind === 'video' || m.kind === 'image'),
            )
          : undefined;
        setPayload({
          ...data,
          images: Array.isArray(data.images) ? data.images : [],
          media,
        });
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
  const hintExt = mediaItems.some((m) => m.kind === 'video') ? 'mp4' : 'jpg';

  const handleConfirmName = async (
    finalName: string,
    note: string,
    categoryId: string | undefined,
    tags: string[],
  ) => {
    if (!payload) return;
    setShowRename(false);
    setProgress({ title: '正在下载', detail: '准备中…', fraction: 0 });

    const items: MediaInput[] = mediaItems.map((m) => ({
      kind: m.kind,
      hintExt: inferExtFromUrl(m.url, m.kind === 'video' ? 'mp4' : 'jpg'),
      source: { type: 'remote', url: m.url, headers: DOUYIN_MEDIA_HEADERS },
    }));

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
      bgm:
        payload.audioUrl && items.length > 1
          ? {
              url: payload.audioUrl,
              headers: DOUYIN_MEDIA_HEADERS,
              hintExt: inferExtFromUrl(payload.audioUrl, 'mp4'),
            }
          : undefined,
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
              source={{
                uri: webUrl,
                headers: { 'User-Agent': DOUYIN_DESKTOP_UA },
              }}
              injectedJavaScriptBeforeContentLoaded={DESKTOP_SPOOF_JS + HOOK_JS}
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
              userAgent={DOUYIN_DESKTOP_UA}
              originWhitelist={['http://*', 'https://*', 'about:*']}
              onShouldStartLoadWithRequest={(req) => {
                if (!/^(https?:|about:)/i.test(req.url)) return false;
                // 手机版网页没有 video/source，拉回电脑版笔记页
                if (/m\.douyin\.com|iesdouyin\.com\/share\//i.test(req.url)) {
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
                    ? `已抓到 · ${mediaLabel(mediaItems)}${payload.audioUrl ? ' · 音乐' : ''}`
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
