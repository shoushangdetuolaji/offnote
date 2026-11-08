import { Directory, File, Paths } from 'expo-file-system';

import { renderNoteHtml } from './html';
import type { IgMetadata } from './metadata';
import { normalizeTags, tagKey, touchTags } from './tags';
import { downloadXhsExtra, type XhsExtra } from './xhsExtra';
import { parseIgDate } from './metadata';

/** 详情页 HTML 模板版本；升级后打开老笔记会自动重新渲染 */
export const HTML_VERSION = 2;

export type MediaKind = 'video' | 'image';

export type NoteMedia = {
  filename: string;
  kind: MediaKind;
};

export type NoteSource = 'instagram' | 'rednote' | 'douyin';

export type Highlight = {
  id: string;
  /** 视频文件名（笔记目录内） */
  media: string;
  /** 秒 */
  time: number;
  label: string;
  /** 缩略图相对路径，如 shots/hl-xxx.jpg */
  thumb?: string;
  createdAt: number;
};

export type Snapshot = {
  id: string;
  media: string;
  /** 秒 */
  time: number;
  /** 相对路径，如 shots/shot-xxx.jpg */
  file: string;
  width?: number;
  height?: number;
  createdAt: number;
};

export type Note = {
  id: string;
  createdAt: number;
  title?: string;
  author?: string;
  caption?: string;
  /** user-written memo, separate from IG/xhs caption */
  note?: string;
  starred?: boolean;
  /** id of the category this note belongs to, undefined = uncategorized */
  categoryId?: string;
  /** user tags (names), see lib/tags */
  tags?: string[];
  /** which platform this note was saved from */
  source?: NoteSource;
  sourceUrl?: string;
  media: NoteMedia[];
  thumbnailFilename?: string;
  /** 小红书/抖音附加信息（话题、发布时间、互动数、评论等），图片为笔记目录内相对路径 */
  xhs?: XhsExtra;
  /** 视频高光时刻（标记的时间点），见 lib/highlights */
  highlights?: Highlight[];
  /** 从视频截取的画面，存在笔记目录 shots/ 下 */
  snapshots?: Snapshot[];
  /** 原帖发布时间（IG 只有日期）；小红书/抖音的在 xhs.publishTime */
  publishedAt?: number;
  /** 图集共用的背景音乐，相对笔记目录，如 bgm.mp4 */
  audioFilename?: string;
  /** 生成 index.html 时的模板版本，见 HTML_VERSION */
  htmlVersion?: number;
  dirUri: string;
  indexUri: string;
};

const ROOT_NAME = 'OffNote';

function rootDir(): Directory {
  const dir = new Directory(Paths.document, ROOT_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function generateNoteId(metadata?: IgMetadata | null): string {
  const datePart = new Date().toISOString().slice(0, 10);
  const slug = metadata?.shortcode ?? Math.random().toString(36).slice(2, 8);
  return `${datePart}-${slug}-${Math.random().toString(36).slice(2, 5)}`;
}

function ensureNoteDir(id: string): Directory {
  const dir = new Directory(rootDir(), id);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function extOf(name: string, fallback: string): string {
  const m = name.match(/\.([A-Za-z0-9]+)$/);
  return (m ? m[1] : fallback).toLowerCase();
}

export type MediaSource =
  | { type: 'remote'; url: string; headers?: Record<string, string> }
  | { type: 'base64'; data: string };

export type MediaInput = {
  kind: MediaKind;
  /** suggested filename, only used to derive extension */
  hintExt: string;
  source: MediaSource;
};

export type CreateNoteInput = {
  /** title chosen by user in rename modal (no extension required) */
  title: string;
  /** optional user-written memo */
  note?: string;
  /** optional category id to assign */
  categoryId?: string;
  /** optional tag names */
  tags?: string[];
  /** source platform (defaults to instagram for back-compat) */
  source?: NoteSource;
  items: MediaInput[];
  metadata?: IgMetadata | null;
  /** 小红书附加信息（远程 URL，保存时下载到本地） */
  xhs?: XhsExtra;
  onItemProgress?: (index: number, total: number, fraction: number) => void;
  /** 评论图片/头像下载进度 */
  onExtraProgress?: (done: number, total: number) => void;
  /** 图集轮播共用的背景音乐。画面本身可能没有声音。urls 是备用地址 */
  bgm?: { url: string; urls?: string[]; headers?: Record<string, string>; hintExt?: string };
};

export type CreateNoteResult = {
  ok: boolean;
  note?: Note;
  error?: string;
};

export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
  if (input.items.length === 0) {
    return { ok: false, error: '没有要保存的内容' };
  }

  const id = generateNoteId(input.metadata);
  const dir = ensureNoteDir(id);
  const total = input.items.length;
  const bgmUrls = [
    ...(input.bgm?.url ? [input.bgm.url] : []),
    ...(input.bgm?.urls ?? []),
  ].filter((url, index, all) => !!url && all.indexOf(url) === index);
  const stepTotal = total + (bgmUrls.length ? 1 : 0);
  const stored: NoteMedia[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const ext = extOf(item.hintExt, item.kind === 'image' ? 'jpg' : 'mp4');
    const filename = total === 1 ? `media.${ext}` : `media-${i + 1}.${ext}`;
    const file = new File(dir, filename);
    // 先报一次「开始第 i 项」：有的 CDN 不返回大小，字节进度回调不会触发
    input.onItemProgress?.(i, stepTotal, 0);

    try {
      if (item.source.type === 'remote') {
        if (file.exists) file.delete();
        const task = File.createDownloadTask(item.source.url, file, {
          headers: item.source.headers,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const t = totalBytes || 0;
            const fraction = t > 0 ? (bytesWritten || 0) / t : 0;
            input.onItemProgress?.(i, stepTotal, fraction);
          },
        });
        await task.downloadAsync();
      } else {
        file.create({ overwrite: true });
        file.writeSync(item.source.data, { encoding: 'base64' });
      }
      stored.push({ filename, kind: item.kind });
    } catch (e: any) {
      return { ok: false, error: `第 ${i + 1} 项下载失败：${e?.message ?? 'unknown'}` };
    }
  }

  let thumbnailFilename: string | undefined;
  if (input.metadata?.thumbnailUrl) {
    try {
      const thumb = new File(dir, 'thumb.jpg');
      if (thumb.exists) thumb.delete();
      const task = File.createDownloadTask(input.metadata.thumbnailUrl, thumb, {});
      const f = await task.downloadAsync();
      thumbnailFilename = f?.name ?? 'thumb.jpg';
    } catch {
      // optional
    }
  }
  if (!thumbnailFilename) {
    const firstImage = stored.find((m) => m.kind === 'image');
    if (firstImage) thumbnailFilename = firstImage.filename;
  }

  let audioFilename: string | undefined;
  if (bgmUrls.length) {
    const ext = extOf(input.bgm?.hintExt ?? '', 'mp3');
    const name = `bgm.${ext}`;
    const file = new File(dir, name);
    input.onItemProgress?.(total, stepTotal, 0);
    for (const url of bgmUrls) {
      try {
        if (file.exists) file.delete();
        const task = File.createDownloadTask(url, file, {
          headers: input.bgm?.headers,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const t = totalBytes || 0;
            input.onItemProgress?.(total, stepTotal, t > 0 ? (bytesWritten || 0) / t : 0);
          },
        });
        await task.downloadAsync();
        if (file.exists && (file.size ?? 0) > 1024) {
          audioFilename = name;
          input.onItemProgress?.(total, stepTotal, 1);
          break;
        }
        if (file.exists) file.delete();
      } catch {
        if (file.exists) file.delete();
      }
    }
  }

  let xhs: XhsExtra | undefined;
  if (input.xhs) {
    try {
      xhs = await downloadXhsExtra(dir, input.xhs, input.onExtraProgress);
    } catch {
      xhs = input.xhs;
    }
  }

  const createdAt = Date.now();
  const tags = normalizeTags(input.tags);
  const note: Note = {
    id,
    createdAt,
    title: input.title.trim() || undefined,
    note: input.note?.trim() || undefined,
    categoryId: input.categoryId,
    tags: tags.length ? tags : undefined,
    source: input.source ?? 'instagram',
    author: input.metadata?.author,
    caption: input.metadata?.caption,
    sourceUrl: input.metadata?.sourceUrl,
    media: stored,
    thumbnailFilename,
    xhs,
    publishedAt: input.metadata?.publishTime,
    audioFilename,
    htmlVersion: HTML_VERSION,
    dirUri: dir.uri,
    indexUri: new File(dir, 'index.html').uri,
  };

  const html = renderNoteHtml({
    title: note.title,
    author: note.author,
    caption: note.caption,
    note: note.note,
    media: stored,
    thumbnailFilename,
    sourceUrl: note.sourceUrl,
    createdAt,
    source: note.source,
    xhs,
    audioFilename,
  });

  const indexFile = new File(dir, 'index.html');
  indexFile.create({ overwrite: true });
  indexFile.writeSync(html, { encoding: 'utf8' });

  const metaFile = new File(dir, 'meta.json');
  metaFile.create({ overwrite: true });
  metaFile.writeSync(JSON.stringify(note, null, 2), { encoding: 'utf8' });

  if (tags.length) {
    try {
      await touchTags(tags);
    } catch {}
  }

  return { ok: true, note };
}

export async function listNotes(): Promise<Note[]> {
  const root = rootDir();
  if (!root.exists) return [];
  const entries = root.list();
  const notes: Note[] = [];

  for (const entry of entries) {
    if (!(entry instanceof Directory)) continue;
    const metaFile = new File(entry, 'meta.json');
    if (!metaFile.exists) continue;
    try {
      const raw = await metaFile.text();
      const parsed = JSON.parse(raw) as Note;

      // dirUri/indexUri 是绝对路径，换设备或重装后沙盒路径会变，
      // 这里按本机实际路径自愈，避免缩略图和 WebView 加载失败。
      const dirUri = entry.uri;
      const indexUri = new File(entry, 'index.html').uri;
      if (parsed.dirUri !== dirUri || parsed.indexUri !== indexUri) {
        parsed.dirUri = dirUri;
        parsed.indexUri = indexUri;
        try {
          metaFile.writeSync(JSON.stringify(parsed, null, 2), { encoding: 'utf8' });
        } catch {
          // 写回失败不影响本次读取
        }
      }

      notes.push(parsed);
    } catch {
      // ignore
    }
  }

  notes.sort((a, b) => b.createdAt - a.createdAt);
  return notes;
}

export type NotePatch = Partial<
  Pick<
    Note,
    | 'title'
    | 'note'
    | 'starred'
    | 'caption'
    | 'categoryId'
    | 'tags'
    | 'highlights'
    | 'snapshots'
  >
>;

export async function updateNote(
  noteId: string,
  patch: NotePatch,
): Promise<Note | null> {
  const dir = new Directory(rootDir(), noteId);
  if (!dir.exists) return null;
  const metaFile = new File(dir, 'meta.json');
  if (!metaFile.exists) return null;

  let current: Note;
  try {
    current = JSON.parse(await metaFile.text()) as Note;
  } catch {
    return null;
  }

  const merged: Note = {
    ...current,
    ...patch,
    title: patch.title?.trim() || current.title,
    note: patch.note === undefined ? current.note : patch.note.trim() || undefined,
    htmlVersion: HTML_VERSION,
  };
  if (patch.tags !== undefined) {
    const tags = normalizeTags(patch.tags);
    merged.tags = tags.length ? tags : undefined;
  }

  metaFile.writeSync(JSON.stringify(merged, null, 2), { encoding: 'utf8' });

  if (patch.tags !== undefined && merged.tags?.length) {
    try {
      await touchTags(merged.tags);
    } catch {}
  }

  try {
    const html = renderNoteHtml({
      title: merged.title,
      author: merged.author,
      caption: merged.caption,
      note: merged.note,
      media: merged.media,
      thumbnailFilename: merged.thumbnailFilename,
      sourceUrl: merged.sourceUrl,
      createdAt: merged.createdAt,
      source: merged.source,
      xhs: merged.xhs,
      audioFilename: merged.audioFilename,
    });
    const indexFile = new File(dir, 'index.html');
    indexFile.writeSync(html, { encoding: 'utf8' });
  } catch {
    // 渲染失败不影响 meta 更新
  }

  return merged;
}

export type PublishInfo = {
  time: number;
  /** 只有日期没有时刻（IG） */
  dateOnly: boolean;
  /** false 表示拿不到发布时间，退回用保存时间 */
  isPublish: boolean;
};

/**
 * 卡片上显示的时间：发布时间优先，拿不到再用保存时间。
 * 列表顺序不看这个，按收录时间 createdAt 排。
 */
export function notePublishInfo(note: Note): PublishInfo {
  if (note.xhs?.publishTime) {
    return { time: note.xhs.publishTime, dateOnly: false, isPublish: true };
  }
  if (note.publishedAt) {
    return { time: note.publishedAt, dateOnly: true, isPublish: true };
  }
  if (note.source === 'instagram' || !note.source) {
    const parsed =
      parseIgDate(note.caption) ?? parseIgDate(note.title) ?? parseIgDate(note.author);
    if (parsed) return { time: parsed, dateOnly: true, isPublish: true };
  }
  return { time: note.createdAt, dateOnly: false, isPublish: false };
}

function writeMetaOnly(note: Note): void {
  const metaFile = new File(new Directory(rootDir(), note.id), 'meta.json');
  if (metaFile.exists) {
    metaFile.writeSync(JSON.stringify(note, null, 2), { encoding: 'utf8' });
  }
}

/**
 * 所有笔记上的标签改名（newName 为 null 表示删除）。
 * 标签不进 index.html，只改 meta.json 即可。返回受影响的笔记数。
 */
export async function renameTagOnNotes(
  oldName: string,
  newName: string | null,
): Promise<number> {
  const oldKey = tagKey(oldName);
  const notes = await listNotes();
  let count = 0;
  for (const n of notes) {
    if (!n.tags?.some((t) => tagKey(t) === oldKey)) continue;
    const replaced = n.tags.flatMap((t) =>
      tagKey(t) === oldKey ? (newName ? [newName] : []) : [t],
    );
    const tags = normalizeTags(replaced);
    try {
      writeMetaOnly({ ...n, tags: tags.length ? tags : undefined });
      count++;
    } catch {}
  }
  return count;
}

/** 用最新模板重新生成 index.html（老笔记升级样式用） */
export async function refreshNoteHtml(noteId: string): Promise<Note | null> {
  return updateNote(noteId, {});
}

export function deleteNote(note: Note): void {
  const dir = new Directory(rootDir(), note.id);
  if (dir.exists) dir.delete();
}

/** Remove categoryId from all notes that currently reference the given id. */
export async function clearCategoryFromNotes(categoryId: string): Promise<number> {
  const notes = await listNotes();
  let count = 0;
  for (const n of notes) {
    if (n.categoryId === categoryId) {
      await updateNote(n.id, { categoryId: undefined });
      count++;
    }
  }
  return count;
}
