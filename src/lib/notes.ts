import { Directory, File, Paths } from 'expo-file-system';

import { renderNoteHtml } from './html';
import type { IgMetadata } from './metadata';

export type MediaKind = 'video' | 'image';

export type NoteMedia = {
  filename: string;
  kind: MediaKind;
};

export type Note = {
  id: string;
  createdAt: number;
  title?: string;
  author?: string;
  caption?: string;
  sourceUrl?: string;
  media: NoteMedia[];
  thumbnailFilename?: string;
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
  | { type: 'remote'; url: string }
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
  items: MediaInput[];
  metadata?: IgMetadata | null;
  onItemProgress?: (index: number, total: number, fraction: number) => void;
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
  const stored: NoteMedia[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const ext = extOf(item.hintExt, item.kind === 'image' ? 'jpg' : 'mp4');
    const filename = total === 1 ? `media.${ext}` : `media-${i + 1}.${ext}`;
    const file = new File(dir, filename);

    try {
      if (item.source.type === 'remote') {
        const task = File.createDownloadTask(item.source.url, file, {
          idempotent: true,
          onProgress: ({ bytesWritten, totalBytes }) => {
            const t = totalBytes || 0;
            const fraction = t > 0 ? (bytesWritten || 0) / t : 0;
            input.onItemProgress?.(i, total, fraction);
          },
        });
        await task.downloadAsync();
      } else {
        file.create({ overwrite: true });
        file.write(item.source.data, { encoding: 'base64' });
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
      const task = File.createDownloadTask(input.metadata.thumbnailUrl, thumb, {
        idempotent: true,
      });
      const f = await task.downloadAsync();
      thumbnailFilename = f.name;
    } catch {
      // optional
    }
  }
  if (!thumbnailFilename) {
    const firstImage = stored.find((m) => m.kind === 'image');
    if (firstImage) thumbnailFilename = firstImage.filename;
  }

  const createdAt = Date.now();
  const note: Note = {
    id,
    createdAt,
    title: input.title.trim() || undefined,
    author: input.metadata?.author,
    caption: input.metadata?.caption,
    sourceUrl: input.metadata?.sourceUrl,
    media: stored,
    thumbnailFilename,
    dirUri: dir.uri,
    indexUri: new File(dir, 'index.html').uri,
  };

  const html = renderNoteHtml({
    title: note.title,
    author: note.author,
    caption: note.caption,
    media: stored,
    thumbnailFilename,
    sourceUrl: note.sourceUrl,
    createdAt,
  });

  const indexFile = new File(dir, 'index.html');
  indexFile.create({ overwrite: true });
  indexFile.write(html, { encoding: 'utf8' });

  const metaFile = new File(dir, 'meta.json');
  metaFile.create({ overwrite: true });
  metaFile.write(JSON.stringify(note, null, 2), { encoding: 'utf8' });

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
      notes.push(parsed);
    } catch {
      // ignore
    }
  }

  notes.sort((a, b) => b.createdAt - a.createdAt);
  return notes;
}

export function deleteNote(note: Note): void {
  const dir = new Directory(rootDir(), note.id);
  if (dir.exists) dir.delete();
}
