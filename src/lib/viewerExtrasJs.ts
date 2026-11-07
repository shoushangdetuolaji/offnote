import type { Note } from './notes';

/**
 * 注入到笔记详情 WebView：在媒体下方加「★ 标记高光 / 📷 截取画面」工具条，
 * 以及「高光时刻」列表和「截图」宫格。运行时注入，老笔记无需重新生成 HTML。
 *
 * 与 RN 的消息：
 *   页面 -> RN：hl-add / shot-add {media, time}，hl-menu / shot-menu {id}，lightbox
 *   RN -> 页面：window.__offnoteExtras(data) 刷新列表；__offnoteSeek(media, time)；__offnoteToast(text)
 *
 * 注意：这是模板字符串，里面的 JS 不要写反斜杠。
 */
export const EXTRAS_BOOT_JS = `
(function () {
  if (window.__offnoteExtrasReady) return;
  window.__offnoteExtrasReady = true;

  function post(o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var videos = Array.prototype.slice.call(document.querySelectorAll('.single video, .slide video'));
  window.__offnoteToast = function () {};
  window.__offnoteSeek = function () {};
  window.__offnoteExtras = function () {};
  if (!videos.length) return;

  var style = document.createElement('style');
  style.textContent = [
    '#offnote-extras{margin:4px 0 8px;}',
    '.ox-bar{display:flex;gap:10px;margin:2px 0 6px;}',
    '.ox-btn{flex:1;height:38px;border:0;border-radius:10px;font:inherit;font-size:14px;font-weight:600;background:#1f1f22;color:#eee;}',
    '.ox-btn:active{opacity:.6;}',
    '.ox-title{font-size:13px;color:#999;margin:16px 0 8px;}',
    '.ox-title span{margin-left:4px;}',
    '.ox-hl{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #222;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
    '.ox-hl:active{opacity:.6;}',
    '.ox-hl img,.ox-ph{width:64px;height:40px;border-radius:6px;object-fit:cover;flex:0 0 auto;background:#222;}',
    '.ox-ph{display:flex;align-items:center;justify-content:center;color:#f5b400;}',
    '.ox-hl-body{flex:1;min-width:0;}',
    '.ox-hl-label{font-size:14px;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.ox-hl-time{font-size:12px;color:#888;font-variant-numeric:tabular-nums;margin-top:2px;}',
    '.ox-play{color:#ff4d6a;font-size:14px;padding:0 4px;}',
    '.ox-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}',
    '.ox-shot{position:relative;border-radius:8px;overflow:hidden;background:#222;aspect-ratio:1/1;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}',
    '.ox-shot img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;}',
    '.ox-badge{position:absolute;left:4px;bottom:4px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);border-radius:4px;padding:1px 4px;font-variant-numeric:tabular-nums;}',
    '.ox-tip{font-size:11px;color:#777;margin-top:6px;}',
    '.ox-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;font-size:13px;padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:2147483646;}',
    '.ox-toast.show{opacity:1;}',
    '@media (prefers-color-scheme: light){.ox-btn{background:#f3f4f6;color:#222;}.ox-hl{border-bottom-color:#f0f0f0;}.ox-hl-label{color:#222;}.ox-hl img,.ox-ph,.ox-shot{background:#f0f0f0;}.ox-tip{color:#aaa;}}'
  ].join('');
  document.head.appendChild(style);

  var anchor = document.querySelector('.carousel') || document.querySelector('.single');
  var box = document.createElement('div');
  box.id = 'offnote-extras';
  box.innerHTML =
    '<div class="ox-bar"><button type="button" id="ox-hl" class="ox-btn">★ 标记高光</button>' +
    '<button type="button" id="ox-shot" class="ox-btn">📷 截取画面</button></div>' +
    '<div id="ox-hls"></div><div id="ox-shots"></div>';
  if (anchor) anchor.insertAdjacentElement('afterend', box);
  else (document.querySelector('.wrap') || document.body).appendChild(box);

  var toastEl = document.createElement('div');
  toastEl.className = 'ox-toast';
  document.body.appendChild(toastEl);
  var toastTimer;
  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }
  window.__offnoteToast = toast;

  var track = document.getElementById('track');
  function mediaOf(v) { return v.getAttribute('src'); }
  function currentVideo() {
    if (!track) return videos[0];
    var i = Math.round(track.scrollLeft / (track.clientWidth || 1));
    var slide = track.children[i];
    return slide ? slide.querySelector('video') : null;
  }
  var bar = box.querySelector('.ox-bar');
  function updateBar() { bar.style.display = currentVideo() ? '' : 'none'; }
  if (track) track.addEventListener('scroll', function () { window.requestAnimationFrame(updateBar); });
  updateBar();

  var busy = false;
  function act(type) {
    var v = currentVideo();
    if (!v || busy) return;
    busy = true;
    setTimeout(function () { busy = false; }, 1200);
    var t = v.currentTime || 0;
    post({ type: type, media: mediaOf(v), time: t });
    toast(type === 'hl-add' ? '标记 ' + clock(t) + '…' : '截取 ' + clock(t) + '…');
  }
  document.getElementById('ox-hl').addEventListener('click', function (e) { e.preventDefault(); act('hl-add'); });
  document.getElementById('ox-shot').addEventListener('click', function (e) { e.preventDefault(); act('shot-add'); });

  window.__offnoteSeek = function (media, time) {
    var v = null;
    videos.forEach(function (x) { if (mediaOf(x) === media) v = x; });
    if (!v) return;
    if (track) {
      var slide = v.closest('.slide');
      var idx = Array.prototype.indexOf.call(track.children, slide);
      if (idx >= 0) track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
    }
    var go = function () {
      try { v.currentTime = time; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    };
    if (v.readyState >= 1) go();
    else { v.addEventListener('loadedmetadata', go, { once: true }); try { v.load(); } catch (e) {} }
    (anchor || v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 点按 / 长按（500ms）区分
  function pressable(el, onTap, onLong) {
    var timer = null, long = false;
    el.addEventListener('touchstart', function () {
      long = false;
      timer = setTimeout(function () { long = true; onLong(); }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', function () { clearTimeout(timer); }, { passive: true });
    el.addEventListener('touchend', function () { clearTimeout(timer); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (long) { long = false; return; }
      onTap();
    });
  }

  function openLightbox(src) {
    var lb = document.getElementById('lb'), img = document.getElementById('lb-img');
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    post({ type: 'lightbox', open: true });
  }

  window.__offnoteExtras = function (data) {
    data = data || {};
    var hls = data.highlights || [], shots = data.snapshots || [];
    var multi = videos.length > 1;
    var nth = {};
    videos.forEach(function (v, i) { nth[mediaOf(v)] = i + 1; });

    var hBox = document.getElementById('ox-hls');
    if (!hls.length) {
      hBox.innerHTML = '';
    } else {
      hBox.innerHTML =
        '<div class="ox-title">高光时刻<span>' + hls.length + '</span></div>' +
        hls.map(function (x) {
          return '<div class="ox-hl" data-id="' + esc(x.id) + '">' +
            (x.thumb ? '<img src="' + esc(x.thumb) + '" alt="">' : '<span class="ox-ph">★</span>') +
            '<div class="ox-hl-body"><div class="ox-hl-label">' + esc(x.label) + '</div>' +
            '<div class="ox-hl-time">' + clock(x.time) + (multi && nth[x.media] ? ' · 视频 ' + nth[x.media] : '') + '</div></div>' +
            '<span class="ox-play">▶</span></div>';
        }).join('') +
        '<div class="ox-tip">点按跳转播放，长按重命名或删除</div>';
      Array.prototype.forEach.call(hBox.querySelectorAll('.ox-hl'), function (el) {
        var id = el.getAttribute('data-id');
        var x = hls.filter(function (k) { return k.id === id; })[0];
        pressable(el, function () { window.__offnoteSeek(x.media, x.time); },
          function () { post({ type: 'hl-menu', id: id }); });
      });
    }

    var sBox = document.getElementById('ox-shots');
    if (!shots.length) {
      sBox.innerHTML = '';
    } else {
      sBox.innerHTML =
        '<div class="ox-title">截图<span>' + shots.length + '</span></div><div class="ox-grid">' +
        shots.map(function (x) {
          return '<div class="ox-shot" data-id="' + esc(x.id) + '"><img src="' + esc(x.file) + '" alt="">' +
            '<span class="ox-badge">' + clock(x.time) + '</span></div>';
        }).join('') +
        '</div><div class="ox-tip">点按查看大图，长按跳到该时刻或删除</div>';
      Array.prototype.forEach.call(sBox.querySelectorAll('.ox-shot'), function (el) {
        var id = el.getAttribute('data-id');
        var img = el.querySelector('img');
        pressable(el, function () { openLightbox(img.src); },
          function () { post({ type: 'shot-menu', id: id }); });
      });
    }
  };
})();
true;
`;

/** RN -> 页面：刷新高光列表和截图宫格 */
export function extrasDataJs(note: Pick<Note, 'highlights' | 'snapshots'> | null): string {
  const data = {
    highlights: note?.highlights ?? [],
    snapshots: note?.snapshots ?? [],
  };
  return `window.__offnoteExtras && window.__offnoteExtras(${JSON.stringify(data)}); true;`;
}

export function seekJs(media: string, time: number): string {
  return `window.__offnoteSeek && window.__offnoteSeek(${JSON.stringify(media)}, ${Number(time) || 0}); true;`;
}

export function toastJs(text: string): string {
  return `window.__offnoteToast && window.__offnoteToast(${JSON.stringify(text)}); true;`;
}
