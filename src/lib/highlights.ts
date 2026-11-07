import { Directory, File } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';

import {
  updateNote,
  type Highlight,
  type Note,
  type Snapshot,
} from './notes';

const SHOTS_DIR = 'shots';

function mediaFilename(media: string): string {
  const clean = media.split('?')[0].split('#')[0];
  const name = clean.split('/').pop() || clean;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 00:12 / 1:02:03 */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * 用原生能力从本地视频按时间点取一帧，复制到笔记目录 shots/ 下。
 * 返回相对路径（index.html 和笔记目录同级，可直接当 img src）。
 */
async function captureFrame(
  note: Note,
  media: string,
  timeSec: number,
  prefix: 'hl' | 'shot',
  quality: number,
): Promise<{ file: string; width: number; height: number }> {
  const noteDir = new Directory(note.dirUri);
  const video = new File(noteDir, mediaFilename(media));
  if (!video.exists) throw new Error('视频文件不存在');

  const res = await VideoThumbnails.getThumbnailAsync(video.uri, {
    time: Math.max(0, Math.round(timeSec * 1000)),
    quality,
  });

  const dir = new Directory(noteDir, SHOTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const name = `${prefix}-${uid()}.jpg`;
  const dest = new File(dir, name);
  const tmp = new File(res.uri);
  try {
    await tmp.copy(dest);
  } catch {
    try {
      await copyAsync({ from: res.uri, to: dest.uri });
    } catch {
      const response = await fetch(res.uri);
      if (!response.ok) throw new Error('读取截图失败');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!dest.exists) dest.create();
      await dest.write(bytes);
    }
  }
  try {
    await tmp.delete();
  } catch {}
  return { file: `${SHOTS_DIR}/${name}`, width: res.width, height: res.height };
}

function removeRelFile(note: Note, rel?: string) {
  if (!rel) return;
  try {
    const f = new File(new Directory(note.dirUri), rel);
    if (f.exists) f.delete();
  } catch {}
}

function sortHighlights(list: Highlight[], note: Note): Highlight[] {
  const order = new Map(note.media.map((m, i) => [m.filename, i]));
  return [...list].sort(
    (a, b) =>
      (order.get(a.media) ?? 0) - (order.get(b.media) ?? 0) || a.time - b.time,
  );
}

/** 把当前画面的 data URL 写成笔记目录里的 jpg，返回相对路径 */
async function writePoster(note: Note, dataUrl: string, prefix: 'hl' | 'shot'): Promise<string> {
  const comma = dataUrl.indexOf(',');
  const base64 = (comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl).replace(/\s/g, '');
  if (!base64) throw new Error('空预览图');
  const noteDir = new Directory(note.dirUri);
  const dir = new Directory(noteDir, SHOTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const name = `${prefix}-${uid()}.jpg`;
  const dest = new File(dir, name);
  await dest.write(base64, { encoding: 'base64' });
  return `${SHOTS_DIR}/${name}`;
}

/** 标记高光：记下时间点，并保存一张当前画面的预览。点列表时跳回该时刻 */
export async function addHighlight(
  note: Note,
  media: string,
  timeSec: number,
  poster?: string,
): Promise<Note | null> {
  let thumb: string | undefined;
  if (poster?.startsWith('data:image')) {
    try {
      thumb = await writePoster(note, poster, 'hl');
    } catch {}
  }
  if (!thumb) {
    try {
      thumb = (await captureFrame(note, media, timeSec, 'hl', 0.6)).file;
    } catch {}
  }
  const list = note.highlights ?? [];
  const next: Highlight = {
    id: uid(),
    media,
    time: Math.max(0, timeSec),
    label: `高光 ${list.length + 1}`,
    thumb,
    createdAt: Date.now(),
  };
  return updateNote(note.id, { highlights: sortHighlights([...list, next], note) });
}

/** 把页面截下来的预览图挂到已有高光上 */
export async function attachHighlightPoster(
  note: Note,
  id: string,
  poster: string,
): Promise<Note | null> {
  const target = note.highlights?.find((h) => h.id === id);
  if (!target || target.thumb || !poster.startsWith('data:image')) return null;
  const thumb = await writePoster(note, poster, 'hl');
  return updateNote(note.id, {
    highlights: (note.highlights ?? []).map((h) =>
      h.id === id ? { ...h, thumb } : h,
    ),
  });
}

/** 给还没有预览图的高光补一张帧图 */
export async function fillMissingHighlightThumbs(note: Note): Promise<Note | null> {
  const missing = (note.highlights ?? []).filter((h) => !h.thumb);
  if (!missing.length) return null;
  let highlights = note.highlights ?? [];
  let changed = false;
  for (const h of missing) {
    try {
      const shot = await captureFrame(note, h.media, h.time, 'hl', 0.6);
      highlights = highlights.map((item) =>
        item.id === h.id ? { ...item, thumb: shot.file } : item,
      );
      changed = true;
    } catch {}
  }
  if (!changed) return null;
  return updateNote(note.id, { highlights });
}

export async function renameHighlight(
  note: Note,
  id: string,
  label: string,
): Promise<Note | null> {
  const text = label.trim().slice(0, 40);
  if (!text) return note;
  return updateNote(note.id, {
    highlights: (note.highlights ?? []).map((h) =>
      h.id === id ? { ...h, label: text } : h,
    ),
  });
}

export async function removeHighlight(note: Note, id: string): Promise<Note | null> {
  const target = note.highlights?.find((h) => h.id === id);
  removeRelFile(note, target?.thumb);
  return updateNote(note.id, {
    highlights: (note.highlights ?? []).filter((h) => h.id !== id),
  });
}

/** 截取画面：原分辨率、高质量 JPG */
export async function addSnapshot(
  note: Note,
  media: string,
  timeSec: number,
): Promise<Note | null> {
  const shot = await captureFrame(note, media, timeSec, 'shot', 0.92);
  const next: Snapshot = {
    id: uid(),
    media,
    time: Math.max(0, timeSec),
    file: shot.file,
    width: shot.width,
    height: shot.height,
    createdAt: Date.now(),
  };
  return updateNote(note.id, { snapshots: [...(note.snapshots ?? []), next] });
}

export async function removeSnapshot(note: Note, id: string): Promise<Note | null> {
  const target = note.snapshots?.find((s) => s.id === id);
  removeRelFile(note, target?.file);
  return updateNote(note.id, {
    snapshots: (note.snapshots ?? []).filter((s) => s.id !== id),
  });
}
