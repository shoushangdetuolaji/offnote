import type { NoteMedia, NoteSource } from './notes';
import type { XhsComment, XhsExtra } from './xhsExtra';

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
  note?: string;
  media: NoteMedia[];
  thumbnailFilename?: string;
  sourceUrl?: string;
  createdAt: number;
  source?: NoteSource;
  xhs?: XhsExtra;
  /** 图集背景音乐文件名 */
  audioFilename?: string;
};

// ---------- 小红书样式 ----------

function formatDay(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const TOPIC_RE = /#([^#\n\[\]]{1,40}?)\[话题\]#/g;

/** 正文：保留换行，把 #xxx[话题]# 渲染成蓝色话题 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 小红书 `#xxx[话题]#` 直接识别；抖音等平台的 `#xxx` 只在 knownTopics 里出现时才高亮，
 * 避免把普通的 # 号误判成话题。
 */
function xhsText(
  text: string,
  knownTopics: string[] = [],
): { html: string; topics: string[] } {
  const topics: string[] = [];
  let html = escape(text.trim()).replace(TOPIC_RE, (_m, name: string) => {
    topics.push(name.trim());
    return `<span class="x-topic">#${name.trim()}</span>`;
  });
  const rest = knownTopics
    .filter((t) => t && !topics.includes(t))
    .sort((a, b) => b.length - a.length);
  if (rest.length) {
    const re = new RegExp(`#\\s?(${rest.map((t) => escapeRegExp(escape(t))).join('|')})`, 'g');
    html = html.replace(re, (_m, name: string) => {
      if (!topics.includes(name)) topics.push(name);
      return `<span class="x-topic">#${name}</span>`;
    });
  }
  return { html, topics };
}

function avatarHtml(src: string | undefined, name: string, cls: string): string {
  if (src) {
    return `<img class="${cls}" src="${escape(src)}" alt="" loading="lazy">`;
  }
  const ch = Array.from(name.trim())[0] ?? '?';
  return `<span class="${cls} x-avatar-ph">${escape(ch)}</span>`;
}

const HEART_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

function commentHtml(c: XhsComment, isReply: boolean): string {
  const when = c.time ? formatDay(c.time) : c.timeText ?? '';
  const metaText = [when, c.location].filter(Boolean).join(' ');
  const likes = c.likes && c.likes !== '0' ? c.likes : '';
  const pics = c.pictures?.length
    ? `<div class="x-cpics">${c.pictures
        .map((u) => `<img src="${escape(u)}" alt="" loading="lazy">`)
        .join('')}</div>`
    : '';
  const replies = c.replies?.length
    ? `<div class="x-replies">${c.replies.map((r) => commentHtml(r, true)).join('')}</div>`
    : '';
  const saved = c.replies?.length ?? 0;
  const more =
    !isReply && c.replyCount && c.replyCount > saved
      ? `<div class="x-cmore">共 ${c.replyCount} 条回复${saved ? `，已保存 ${saved} 条` : '，未保存'}</div>`
      : '';
  const replyTo = c.replyTo
    ? `回复 <span class="x-cto">${escape(c.replyTo)}</span>：`
    : '';
  return `<div class="x-c${isReply ? ' x-c-sub' : ''}">
  ${avatarHtml(c.avatar, c.author, 'x-cavatar')}
  <div class="x-cbody">
    <div class="x-cname">${escape(c.author)}${c.isAuthor ? '<span class="x-ctag">作者</span>' : ''}</div>
    ${c.content ? `<div class="x-ctext">${replyTo}${xhsText(c.content).html}</div>` : ''}
    ${pics}
    <div class="x-cmeta"><span>${escape(metaText)}</span>${likes ? `<span class="x-clike">${HEART_SVG}${escape(likes)}</span>` : ''}</div>
    ${replies}${more}
  </div>
</div>`;
}

function xhsHeaderHtml(author: string, xhs?: XhsExtra): string {
  if (!author) return '';
  return `<div class="x-author">${avatarHtml(xhs?.authorAvatar, author, 'x-avatar')}<span class="x-name">${escape(author)}</span></div>`;
}

function xhsContentHtml(input: RenderInput): string {
  const xhs = input.xhs;
  const desc = xhs?.desc ?? input.caption ?? '';
  const title = xhs?.title && xhs.title !== desc.trim() ? xhs.title : '';
  const body = xhsText(desc, xhs?.topics);

  const seen = new Set(body.topics);
  const extraTopics = (xhs?.topics ?? []).filter((t) => !seen.has(t));

  const dateLine = [
    xhs?.publishTime ? formatDay(xhs.publishTime) : '',
    xhs?.ipLocation ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const counts = [
    xhs?.likedCount ? `赞 ${escape(xhs.likedCount)}` : '',
    xhs?.collectedCount ? `收藏 ${escape(xhs.collectedCount)}` : '',
    xhs?.commentCount ? `评论 ${escape(xhs.commentCount)}` : '',
  ].filter(Boolean);

  return `
    ${title ? `<h1 class="x-title">${escape(title)}</h1>` : ''}
    ${body.html ? `<div class="x-desc">${body.html}</div>` : ''}
    ${extraTopics.length ? `<div class="x-desc x-topics">${extraTopics.map((t) => `<span class="x-topic">#${escape(t)}</span>`).join(' ')}</div>` : ''}
    ${dateLine ? `<div class="x-date">${escape(dateLine)}</div>` : ''}
    ${counts.length ? `<div class="x-counts">${counts.join('<i>·</i>')}</div>` : ''}`;
}

function xhsCommentsHtml(xhs?: XhsExtra): string {
  if (!xhs) return '';
  const list = xhs.comments ?? [];
  const totalNum = Number(xhs.commentCount);
  const total = Number.isFinite(totalNum) && totalNum > 0 ? totalNum : 0;
  if (!list.length) {
    if (!total) return '';
    return `<div class="x-comments"><div class="x-ctotal">共 ${total} 条评论</div><div class="x-cnote">保存时页面还没加载评论</div></div>`;
  }
  const head = total
    ? `共 ${total} 条评论${list.length < total ? `<span class="x-csaved">已保存 ${list.length} 条</span>` : ''}`
    : `已保存 ${list.length} 条评论`;
  return `<div class="x-comments">
  <div class="x-ctotal">${head}</div>
  ${list.map((c) => commentHtml(c, false)).join('\n')}
</div>`;
}

const XHS_CSS = `
  .x-author { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .x-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; background: #2a2a2c; }
  .x-avatar-ph { display: inline-flex; align-items: center; justify-content: center; color: #999; font-size: 14px; }
  .x-name { font-size: 15px; font-weight: 500; color: #ccc; }
  .x-title { font-size: 18px; font-weight: 600; line-height: 1.45; margin: 6px 0 8px; color: #f2f2f2; word-break: break-word; }
  .x-desc { font-size: 15px; line-height: 1.7; color: #e6e6e6; white-space: pre-wrap; word-break: break-word; }
  .x-topics { margin-top: 10px; }
  .x-topic { color: #8ab4ff; }
  .x-date { margin-top: 14px; font-size: 13px; color: #888; }
  .x-counts { margin-top: 6px; font-size: 12px; color: #888; }
  .x-counts i { font-style: normal; margin: 0 6px; }
  .x-comments { margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a2c; }
  .x-ctotal { font-size: 14px; color: #999; margin-bottom: 14px; }
  .x-csaved { margin-left: 8px; font-size: 12px; color: #777; }
  .x-cnote { font-size: 13px; color: #777; }
  .x-c { display: flex; gap: 10px; margin-bottom: 18px; }
  .x-c-sub { margin: 14px 0 0; }
  .x-cavatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; background: #2a2a2c; }
  .x-c-sub .x-cavatar { width: 24px; height: 24px; font-size: 11px; }
  .x-cbody { flex: 1; min-width: 0; }
  .x-cname { font-size: 13px; color: #999; display: flex; align-items: center; gap: 6px; }
  .x-ctag { font-size: 11px; line-height: 1; padding: 3px 6px; border-radius: 999px; background: #2a2a2c; color: #aaa; }
  .x-ctext { margin-top: 4px; font-size: 14px; line-height: 1.6; color: #e6e6e6; white-space: pre-wrap; word-break: break-word; }
  .x-cto { color: #999; }
  .x-cpics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .x-cpics img { width: 160px; max-width: 70%; height: auto; max-height: 220px; object-fit: cover; border-radius: 8px; background: #1e1e20; cursor: zoom-in; }
  .x-cmeta { margin-top: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #888; }
  .x-clike { display: inline-flex; align-items: center; gap: 3px; }
  .x-cmore { margin-top: 10px; font-size: 13px; color: #8ab4ff; }

  @media (prefers-color-scheme: light) {
    .x-avatar, .x-cavatar { background: #f0f0f0; }
    .x-name { color: #333; }
    .x-title { color: #222; }
    .x-desc, .x-ctext { color: #333; }
    .x-topic, .x-cmore { color: #13386c; }
    .x-date, .x-counts, .x-cmeta { color: #999; }
    .x-comments { border-top-color: #f0f0f0; }
    .x-ctotal { color: #666; }
    .x-csaved, .x-cnote { color: #aaa; }
    .x-cname, .x-cto { color: #888; }
    .x-ctag { background: #f5f5f5; color: #999; }
    .x-cpics img { background: #f5f5f5; }
  }
`;

function mediaTag(m: NoteMedia, poster?: string, muted?: boolean): string {
  if (m.kind === 'video') {
    return `<video src="${escape(m.filename)}" controls playsinline webkit-playsinline preload="metadata"${
      muted ? ' muted' : ''
    }${poster ? ` poster="${escape(poster)}"` : ''}></video>`;
  }
  return `<img src="${escape(m.filename)}" alt="" loading="lazy">`;
}

function singleMediaHtml(input: RenderInput): string {
  const m = input.media[0];
  if (!m) return '';
  const poster = m.kind === 'video' ? input.thumbnailFilename : undefined;
  return `<div class="single">${mediaTag(m, poster, !!input.audioFilename)}</div>`;
}

function carouselHtml(input: RenderInput): string {
  const total = input.media.length;
  const slides = input.media
    .map((m, i) => {
      const poster =
        i === 0 && m.kind === 'video' ? input.thumbnailFilename : undefined;
      return `<div class="slide" data-index="${i + 1}">${mediaTag(m, poster, !!input.audioFilename)}</div>`;
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
  const note = input.note?.trim() ?? '';
  const title = input.title ?? (author ? `@${author}` : 'OffNote');
  const dateStr = formatDate(input.createdAt);
  const total = input.media.length;
  // 小红书和抖音共用这套「网页版」布局；评论区只有小红书有
  const isXhs = input.source === 'rednote' || input.source === 'douyin';
  const hasComments = input.source === 'rednote';

  const mediaBlock = total > 1 ? carouselHtml(input) : singleMediaHtml(input);
  const audioBlock = input.audioFilename
    ? `<audio id="offnote-bgm" src="${escape(input.audioFilename)}" loop autoplay preload="auto" playsinline></audio>`
    : '';

  const sourceLine = input.sourceUrl
    ? `<a class="source" href="${escape(input.sourceUrl)}" target="_blank" rel="noreferrer">查看原帖</a>`
    : '';
  const remarkBlock = note
    ? `<button class="remark" id="offnote-remark" type="button" aria-label="查看备注">
        <span class="remark-icon" aria-hidden="true"></span>
        <span class="remark-body">
          <span class="remark-label">备注</span>
          <span class="remark-text">${escape(note)}</span>
        </span>
        <span class="remark-chevron" aria-hidden="true"></span>
      </button>`
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
  #offnote-bgm { position: fixed; left: 0; top: 0; width: 1px; height: 1px; opacity: 0.02; pointer-events: none; }

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
  .remark {
    width: 100%;
    margin: 28px 0 0;
    padding: 16px 0;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    border-top: 1px solid #2a2a2c;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .remark:active { opacity: .65; }
  .remark-icon {
    width: 22px;
    height: 26px;
    flex: 0 0 auto;
    border: 2px solid #888;
    border-radius: 4px;
    position: relative;
  }
  .remark-icon::before {
    content: "";
    position: absolute;
    left: 4px;
    right: 4px;
    top: 8px;
    height: 2px;
    background: #888;
    box-shadow: 0 6px 0 #888;
  }
  .remark-body {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .remark-label {
    font-size: 13px;
    color: #999;
  }
  .remark-text {
    font-size: 15px;
    color: #eee;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .remark-chevron {
    width: 10px;
    height: 10px;
    flex: 0 0 auto;
    border-right: 2px solid #777;
    border-bottom: 2px solid #777;
    transform: rotate(-45deg);
    margin-right: 3px;
  }

  @media (prefers-color-scheme: light) {
    html, body { background: #fff; color: #111; }
    .author { color: #111; }
    .caption { color: #222; }
    .meta { border-top-color: #eee; color: #888; }
    .source { color: #1f6feb; }
    .remark { border-top-color: #eee; }
    .remark-text { color: #111; }
    .dot { background: rgba(0,0,0,.2); }
    .dot.active { background: #111; }
  }

  .single img, .slide img { cursor: zoom-in; }
  ${isXhs ? XHS_CSS : ''}

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
    ${isXhs ? xhsHeaderHtml(author, input.xhs) : author ? `<div class="author">@${escape(author)}</div>` : ''}
    ${mediaBlock}
    ${audioBlock}
    ${isXhs ? xhsContentHtml(input) : caption ? `<div class="caption">${paragraphs(caption)}</div>` : ''}
    <div class="meta">
      <span>${isXhs ? '保存于 ' : ''}${escape(dateStr)}</span>
      ${sourceLine}
    </div>
    ${remarkBlock}
    ${hasComments ? xhsCommentsHtml(input.xhs) : ''}
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

    function notifyRemark() {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'remark'
          }));
        }
      } catch (e) {}
    }

    var remark = document.getElementById('offnote-remark');
    if (remark) {
      remark.addEventListener('click', function (e) {
        e.preventDefault();
        notifyRemark();
      });
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

    // 评论图片：单击放大
    document.querySelectorAll('.x-cpics img').forEach(function (im) {
      im.addEventListener('click', function (e) {
        e.preventDefault();
        open(im.currentSrc || im.src);
      });
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
