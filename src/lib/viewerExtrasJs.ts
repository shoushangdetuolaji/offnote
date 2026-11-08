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
  function pageHidden() {
    return document.hidden || document.visibilityState === 'hidden';
  }
  function armBgm() {
    var bgm = document.getElementById('offnote-bgm');
    if (!bgm) return;
    function kick() {
      if (!bgm.__offnoteWant || bgm.__offnoteBackground || pageHidden()) return;
      var p;
      try { p = bgm.play(); } catch (e) {}
      if (p && p.then) {
        p.then(function () {
          document.removeEventListener('touchstart', kick);
          document.removeEventListener('click', kick);
        }).catch(function () {});
      }
    }
    if (!bgm.__offnoteBound) {
      bgm.__offnoteBound = true;
      bgm.loop = true;
      bgm.volume = 1;
      bgm.muted = false;
      bgm.setAttribute('playsinline', '');
      bgm.setAttribute('autoplay', '');
      bgm.addEventListener('pause', function () {
        if (!bgm.__offnoteWant || bgm.__offnoteBackground || pageHidden()) return;
        setTimeout(function () {
          if (!bgm.__offnoteWant || bgm.__offnoteBackground || pageHidden() || !bgm.paused) return;
          kick();
        }, 80);
      });
      document.addEventListener('touchstart', kick, { passive: true });
      document.addEventListener('click', kick);
    }
    if (bgm.__offnoteBackground || pageHidden()) return;
    bgm.__offnoteWant = true;
    kick();
  }
  window.__offnoteSetBgm = function (on) {
    var bgm = document.getElementById('offnote-bgm');
    var nodes = document.querySelectorAll('audio, video');
    if (!on) {
      if (bgm) {
        bgm.__offnoteBackground = true;
        bgm.__offnoteHeld = true;
        bgm.__offnoteWant = false;
        bgm.__offnoteTime = bgm.currentTime || 0;
        if (!bgm.__offnoteSrc) bgm.__offnoteSrc = bgm.currentSrc || bgm.src || bgm.getAttribute('src') || '';
        bgm.muted = true;
        bgm.volume = 0;
        try { bgm.pause(); } catch (e) {}
        try { bgm.removeAttribute('src'); bgm.load(); } catch (e) {}
      }
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] === bgm) continue;
        nodes[i].__offnoteWasPlaying = !nodes[i].paused;
        try { nodes[i].pause(); } catch (e) {}
      }
      return;
    }
    if (bgm) {
      bgm.__offnoteBackground = false;
      bgm.muted = false;
      bgm.volume = 1;
      if (bgm.__offnoteSrc && !bgm.getAttribute('src')) {
        bgm.src = bgm.__offnoteSrc;
        var t = bgm.__offnoteTime || 0;
        bgm.addEventListener('loadedmetadata', function () {
          try { if (Math.abs((bgm.currentTime || 0) - t) > 0.4) bgm.currentTime = t; } catch (e) {}
        });
      }
      if (bgm.__offnoteHeld) {
        bgm.__offnoteHeld = false;
        bgm.__offnoteWant = true;
        try { bgm.play(); } catch (e) {}
      }
    }
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j] === bgm || !nodes[j].__offnoteWasPlaying) continue;
      nodes[j].__offnoteWasPlaying = false;
      try { nodes[j].play(); } catch (e) {}
    }
  };
  if (!window.__offnoteBgmWatch) {
    window.__offnoteBgmWatch = true;
    function onHide() { window.__offnoteSetBgm(false); }
    function onShow() { if (!pageHidden()) window.__offnoteSetBgm(true); }
    document.addEventListener('visibilitychange', function () {
      if (pageHidden()) onHide(); else onShow();
    });
    document.addEventListener('webkitvisibilitychange', function () {
      if (pageHidden()) onHide(); else onShow();
    });
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('freeze', onHide);
    document.addEventListener('resume', onShow);
  }
  armBgm();
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
  function mediaOf(v) { return v.getAttribute('src') || v.currentSrc || ''; }
  function fileKey(src) {
    var clean = String(src || '').split('?')[0].split('#')[0];
    try { clean = decodeURIComponent(clean); } catch (e) {}
    var parts = clean.split('/');
    return parts[parts.length - 1];
  }
  function sameMedia(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return fileKey(a) === fileKey(b);
  }
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

  function framePoster(v) {
    try {
      var w = v.videoWidth || 0, h = v.videoHeight || 0;
      if (!w || !h) return '';
      var maxW = 360;
      var scale = w > maxW ? maxW / w : 1;
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      var spots = [0.2, 0.5, 0.8];
      var ink = 0;
      for (var sy = 0; sy < spots.length; sy++) {
        for (var sx = 0; sx < spots.length; sx++) {
          var px = ctx.getImageData(
            Math.max(0, Math.floor(canvas.width * spots[sx]) - 1),
            Math.max(0, Math.floor(canvas.height * spots[sy]) - 1),
            1,
            1
          ).data;
          ink += px[0] + px[1] + px[2];
        }
      }
      if (ink < 24) return '';
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      return '';
    }
  }

  window.__offnoteCapturePosters = function (list) {
    (list || []).forEach(function (item) {
      var src = '';
      videos.forEach(function (x) { if (sameMedia(mediaOf(x), item.media)) src = mediaOf(x); });
      if (!src && videos.length === 1) src = mediaOf(videos[0]);
      if (!src) return;
      var v = document.createElement('video');
      v.muted = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.src = src;
      v.style.cssText = 'position:fixed;width:2px;height:2px;left:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(v);
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        var poster = framePoster(v);
        try { v.pause(); } catch (e) {}
        v.remove();
        if (poster) post({ type: 'hl-poster', id: item.id, poster: poster });
      }
      v.addEventListener('seeked', finish, { once: true });
      v.addEventListener('error', function () { if (!done) { done = true; v.remove(); } }, { once: true });
      function arm() {
        try { v.currentTime = Math.max(0, Number(item.time) || 0); } catch (e) { v.remove(); }
      }
      if (v.readyState >= 1) arm();
      else v.addEventListener('loadedmetadata', arm, { once: true });
    });
  };

  var busy = false;
  function act(type) {
    var v = currentVideo();
    if (!v || busy) return;
    busy = true;
    setTimeout(function () { busy = false; }, 1200);
    var t = v.currentTime || 0;
    var payload = { type: type, media: mediaOf(v), time: t };
    if (type === 'hl-add') payload.poster = framePoster(v);
    post(payload);
    toast(type === 'hl-add' ? '标记 ' + clock(t) + '…' : '截取 ' + clock(t) + '…');
  }
  document.getElementById('ox-hl').addEventListener('click', function (e) { e.preventDefault(); act('hl-add'); });
  document.getElementById('ox-shot').addEventListener('click', function (e) { e.preventDefault(); act('shot-add'); });

  function seekTo(v, time) {
    var target = Math.max(0, Number(time) || 0);
    function apply() {
      try { v.currentTime = target; } catch (e) {}
    }
    try { v.pause(); } catch (e) {}
    apply();
    var play = function () {
      var p;
      try { p = v.play(); } catch (e) {}
      if (p && p.then) p.then(apply).catch(function () {});
    };
    if (v.readyState >= 1) play();
    else {
      v.addEventListener('loadedmetadata', function () { apply(); play(); }, { once: true });
      try { v.load(); } catch (e) {}
    }
    v.addEventListener('seeked', function () {
      if (Math.abs((v.currentTime || 0) - target) > 0.45) apply();
    }, { once: true });
  }

  window.__offnoteSeek = function (media, time) {
    var v = null;
    videos.forEach(function (x) { if (sameMedia(mediaOf(x), media)) v = x; });
    if (!v && videos.length === 1) v = videos[0];
    if (!v) return;
    videos.forEach(function (x) { if (x !== v) { try { x.pause(); } catch (e) {} } });
    if (track) {
      var slide = v.closest ? v.closest('.slide') : null;
      var idx = slide ? Array.prototype.indexOf.call(track.children, slide) : -1;
      if (idx >= 0) track.scrollTo({ left: idx * track.clientWidth, behavior: 'auto' });
    }
    try { (anchor || v).scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
    seekTo(v, time);
    toast('跳到 ' + clock(time));
  };

  // 点按 / 长按（500ms）区分
  function pressable(el, onTap, onLong) {
    var timer = null, long = false, handled = false;
    el.addEventListener('touchstart', function () {
      long = false;
      handled = false;
      timer = setTimeout(function () { long = true; handled = true; onLong(); }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', function () { clearTimeout(timer); }, { passive: true });
    el.addEventListener('touchend', function (e) {
      clearTimeout(timer);
      if (long) { long = false; return; }
      handled = true;
      if (e.cancelable) e.preventDefault();
      onTap();
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (handled) { handled = false; return; }
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

  var LONG_SEC = 20;
  var playIndex = -1;
  var pausing = false;

  function slideOf(v) {
    var n = v;
    while (n && n !== document.body) {
      if (n.classList && n.classList.contains('slide')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function activeIndex() {
    if (!track || !track.children.length) return 0;
    var w = track.clientWidth || 1;
    return Math.max(0, Math.min(track.children.length - 1, Math.round(track.scrollLeft / w)));
  }

  function videoAt(i) {
    if (!track) return videos[0] || null;
    var slide = track.children[i];
    return slide ? slide.querySelector('video') : null;
  }

  function playActive() {
    var i = activeIndex();
    var current = videoAt(i);
    pausing = true;
    videos.forEach(function (v) {
      if (v !== current) { try { v.pause(); } catch (e) {} }
    });
    pausing = false;
    if (!current) {
      playIndex = i;
      syncBgm(true);
      return;
    }
    if (current.__offnoteHold && i === playIndex) {
      syncBgm(true);
      return;
    }
    playIndex = i;
    current.__offnoteHold = false;
    var next = videoAt(i + 1);
    if (next) next.preload = 'auto';
    var p;
    try { p = current.play(); } catch (e) {}
    if (p && p.then) p.catch(function () {});
    syncBgm(true);
  }

  var bgm = document.getElementById('offnote-bgm');
  function syncBgm(on) {
    if (!bgm) return;
    if (on) {
      bgm.__offnoteWant = true;
      var p;
      try { p = bgm.play(); } catch (e) {}
      if (p && p.then) p.catch(function () {});
    } else {
      bgm.__offnoteWant = false;
      try { bgm.pause(); } catch (e) {}
    }
  }
  if (bgm) {
    bgm.loop = true;
    bgm.setAttribute('playsinline', '');
    videos.forEach(function (v) {
      v.muted = true;
      v.setAttribute('muted', '');
    });
    // 实况或视频开始时，系统常会把这条音乐暂停。音乐自己接着播。
    if (!bgm.__offnoteBound) {
      bgm.__offnoteBound = true;
      bgm.addEventListener('pause', function () {
        if (!bgm.__offnoteWant) return;
        setTimeout(function () {
          if (!bgm.__offnoteWant || !bgm.paused) return;
          var p;
          try { p = bgm.play(); } catch (e) {}
          if (p && p.then) p.catch(function () {});
        }, 80);
      });
    }
    syncBgm(true);
  }

  videos.forEach(function (v) {
    v.setAttribute('playsinline', '');
    v.addEventListener('pause', function () {
      if (pausing) return;
      var slide = slideOf(v);
      var i = slide && track ? Array.prototype.indexOf.call(track.children, slide) : 0;
      if (i === activeIndex()) v.__offnoteHold = true;
    });
    v.addEventListener('play', function () {
      v.__offnoteHold = false;
      syncBgm(true);
    });
    v.addEventListener('ended', function () {
      if (!track || videos.length < 2) return;
      var dur = Number(v.duration);
      if (!(dur > 0) || dur > LONG_SEC) return;
      var slide = slideOf(v);
      if (!slide) return;
      var i = Array.prototype.indexOf.call(track.children, slide);
      if (i !== activeIndex() || i + 1 >= track.children.length) return;
      track.scrollTo({ left: (i + 1) * track.clientWidth, behavior: 'smooth' });
    });
  });

  if (track) {
    var playTimer;
    track.addEventListener('scroll', function () {
      clearTimeout(playTimer);
      playTimer = setTimeout(playActive, 80);
    });
  }
  setTimeout(playActive, 250);

  window.__offnoteExtras = function (data) {
    data = data || {};
    var hls = data.highlights || [], shots = data.snapshots || [];
    var multi = videos.length > 1;
    var nth = {};
    videos.forEach(function (v, i) {
      nth[mediaOf(v)] = i + 1;
      nth[fileKey(mediaOf(v))] = i + 1;
    });

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
            '<div class="ox-hl-time">' + clock(x.time) + (multi && (nth[x.media] || nth[fileKey(x.media)]) ? ' · 视频 ' + (nth[x.media] || nth[fileKey(x.media)]) : '') + '</div></div>' +
            '<span class="ox-play">▶</span></div>';
        }).join('') +
        '<div class="ox-tip">点按跳到该时刻，长按重命名或删除</div>';
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

export function capturePostersJs(
  highlights: { id: string; media: string; time: number }[],
): string {
  return `window.__offnoteCapturePosters && window.__offnoteCapturePosters(${JSON.stringify(highlights)}); true;`;
}

export function seekJs(media: string, time: number): string {
  return `window.__offnoteSeek && window.__offnoteSeek(${JSON.stringify(media)}, ${Number(time) || 0}); true;`;
}

export function toastJs(text: string): string {
  return `window.__offnoteToast && window.__offnoteToast(${JSON.stringify(text)}); true;`;
}
