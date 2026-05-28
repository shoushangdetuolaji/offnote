import type { NoteMedia } from './notes';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraphs(caption: string): string {
  return caption
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type RenderInput = {
  title?: string;
  author?: string;
  caption?: string;
  media: NoteMedia[];
  thumbnailFilename?: string;
  sourceUrl?: string;
  createdAt: number;
};

function mediaTag(m: NoteMedia, poster?: string): string {
  if (m.kind === 'video') {
    return `<video src="${escape(m.filename)}" controls playsinline preload="metadata"${
      poster ? ` poster="${escape(poster)}"` : ''
    }></video>`;
  }
  return `<img src="${escape(m.filename)}" alt="" loading="lazy">`;
}

function singleMediaHtml(input: RenderInput): string {
  const m = input.media[0];
  if (!m) return '';
  const poster = m.kind === 'video' ? input.thumbnailFilename : undefined;
  return `<div class="single">${mediaTag(m, poster)}</div>`;
}

function carouselHtml(input: RenderInput): string {
  const total = input.media.length;
  const slides = input.media
    .map((m, i) => {
      const poster =
        i === 0 && m.kind === 'video' ? input.thumbnailFilename : undefined;
      return `<div class="slide" data-index="${i + 1}">${mediaTag(m, poster)}</div>`;
    })
    .join('\n');

  const dots = Array.from({ length: total })
    .map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-target="${i}" aria-label="第 ${i + 1} 张"></button>`)
    .join('');

  return `
<div class="carousel">
  <div class="track" id="track">${slides}</div>
  <div class="meta-row">
    <div class="counter" id="counter">1 / ${total}</div>
    <div class="dots" id="dots">${dots}</div>
  </div>
</div>
<script>
(function () {
  var track = document.getElementById('track');
  var counter = document.getElementById('counter');
  var dots = Array.prototype.slice.call(document.querySelectorAll('#dots .dot'));
  var total = ${total};
  if (!track) return;

  function indexFromScroll() {
    var w = track.clientWidth;
    if (w === 0) return 0;
    return Math.round(track.scrollLeft / w);
  }

  function update() {
    var i = Math.max(0, Math.min(total - 1, indexFromScroll()));
    counter.textContent = (i + 1) + ' / ' + total;
    dots.forEach(function (d, di) {
      d.classList.toggle('active', di === i);
    });
  }

  track.addEventListener('scroll', function () {
    window.requestAnimationFrame(update);
  });

  dots.forEach(function (d) {
    d.addEventListener('click', function () {
      var idx = Number(d.getAttribute('data-target')) || 0;
      track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
    });
  });
})();
</script>
`;
}

export function renderNoteHtml(input: RenderInput): string {
  const author = input.author ?? '';
  const caption = input.caption ?? '';
  const title = input.title ?? (author ? `@${author}` : 'OffNote');
  const dateStr = formatDate(input.createdAt);
  const total = input.media.length;

  const mediaBlock = total > 1 ? carouselHtml(input) : singleMediaHtml(input);

  const sourceLine = input.sourceUrl
    ? `<a class="source" href="${escape(input.sourceUrl)}" target="_blank" rel="noreferrer">查看原帖</a>`
    : '';

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4,viewport-fit=cover">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: dark light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #0d0d0e; color: #eee; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.55; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px 16px 48px; }
  .author { font-weight: 600; font-size: 15px; color: #fff; margin-bottom: 10px; }

  /* Single media */
  .single { background: #000; border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
  .single video, .single img { display: block; width: 100%; height: auto; }

  /* Carousel */
  .carousel { margin-bottom: 12px; }
  .track {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    border-radius: 12px;
    background: #000;
  }
  .track::-webkit-scrollbar { display: none; }
  .slide {
    flex: 0 0 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    background: #000;
  }
  .slide video, .slide img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 80vh;
    object-fit: contain;
  }
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    padding: 0 4px;
  }
  .counter {
    font-size: 12px;
    color: #888;
    font-variant-numeric: tabular-nums;
  }
  .dots {
    display: flex;
    gap: 6px;
  }
  .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: rgba(255,255,255,.25);
    border: 0;
    padding: 0;
    cursor: pointer;
    transition: background .2s, transform .2s;
  }
  .dot.active {
    background: #fff;
    transform: scale(1.25);
  }

  .caption { font-size: 15px; color: #ddd; word-break: break-word; margin-top: 4px; }
  .caption p { margin: 0 0 10px; }
  .meta { margin-top: 22px; padding-top: 14px; border-top: 1px solid #2a2a2c; font-size: 12px; color: #888; display: flex; gap: 14px; flex-wrap: wrap; }
  .source { color: #6ea9ff; text-decoration: none; }
  .source:active { opacity: .6; }

  @media (prefers-color-scheme: light) {
    html, body { background: #fff; color: #111; }
    .author { color: #111; }
    .caption { color: #222; }
    .meta { border-top-color: #eee; color: #888; }
    .source { color: #1f6feb; }
    .dot { background: rgba(0,0,0,.2); }
    .dot.active { background: #111; }
  }

  .single img, .slide img { cursor: zoom-in; }

  #lb {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #000;
    display: none;
    align-items: center; justify-content: center;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pinch-zoom;
  }
  #lb.open { display: flex; }
  #lb img {
    max-width: 100vw;
    max-height: 100vh;
    width: auto; height: auto;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  #lb .close {
    position: fixed; top: max(env(safe-area-inset-top,0), 12px); right: 12px;
    width: 36px; height: 36px;
    border-radius: 50%;
    background: rgba(255,255,255,.15);
    color: #fff;
    font: 20px/36px -apple-system, sans-serif;
    text-align: center;
    border: 0;
    padding: 0;
    z-index: 1;
  }
  #lb .close:active { background: rgba(255,255,255,.3); }
</style>
</head>
<body>
  <div class="wrap">
    ${author ? `<div class="author">@${escape(author)}</div>` : ''}
    ${mediaBlock}
    ${caption ? `<div class="caption">${paragraphs(caption)}</div>` : ''}
    <div class="meta">
      <span>${escape(dateStr)}</span>
      ${sourceLine}
    </div>
  </div>

  <div id="lb" role="dialog" aria-modal="true" aria-hidden="true">
    <button class="close" id="lb-close" aria-label="关闭">×</button>
    <img id="lb-img" alt="">
  </div>

  <script>
  (function () {
    var lb = document.getElementById('lb');
    var lbImg = document.getElementById('lb-img');
    var lbClose = document.getElementById('lb-close');
    if (!lb || !lbImg) return;

    function notify(open) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'lightbox',
            open: !!open
          }));
        }
      } catch (e) {}
    }

    function open(src) {
      lbImg.src = src;
      lb.classList.add('open');
      lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      notify(true);
    }

    function close() {
      lb.classList.remove('open');
      lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      // small delay so quick reopens don't keep old image flash
      setTimeout(function () { lbImg.src = ''; }, 200);
      notify(false);
    }

    // Bind images
    var imgs = document.querySelectorAll('.single img, .slide img');
    imgs.forEach(function (im) {
      im.addEventListener('dblclick', function (e) {
        e.preventDefault();
        open(im.currentSrc || im.src);
      });
      // Mobile: synthesize dblclick from two quick taps within 280ms
      var lastTap = 0;
      im.addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastTap < 280) {
          e.preventDefault();
          open(im.currentSrc || im.src);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }, { passive: false });
    });

    // Close interactions
    lbClose.addEventListener('click', close);
    lb.addEventListener('click', function (e) {
      if (e.target === lb) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lb.classList.contains('open')) close();
    });

    // Expose so RN can also close via injectJavaScript
    window.__offnoteCloseLightbox = close;
  })();
  </script>
</body>
</html>
`;
}
