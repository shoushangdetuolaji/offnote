import { Directory, File } from 'expo-file-system';

import { listCategories } from './categories';
import { listNotes, type Note, type NoteSource } from './notes';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;

export type StorageStats = {
  noteCount: number;
  categoryCount: number;
  totalBytes: number;
  videoBytes: number;
  imageBytes: number;
  metadataBytes: number;
  bySource: Record<NoteSource | 'unknown', { count: number; bytes: number }>;
};

function sizeOf(file: File): number {
  try {
    return typeof file.size === 'number' && file.size > 0 ? file.size : 0;
  } catch {
    return 0;
  }
}

export async function computeStorageStats(): Promise<StorageStats> {
  const [notes, cats] = await Promise.all([listNotes(), listCategories()]);
  const stats: StorageStats = {
    noteCount: notes.length,
    categoryCount: cats.length,
    totalBytes: 0,
    videoBytes: 0,
    imageBytes: 0,
    metadataBytes: 0,
    bySource: {
      instagram: { count: 0, bytes: 0 },
      rednote: { count: 0, bytes: 0 },
      unknown: { count: 0, bytes: 0 },
    },
  };

  for (const note of notes) {
    const noteBytes = await sumNoteBytes(note, (kind, bytes) => {
      stats.totalBytes += bytes;
      if (kind === 'video') stats.videoBytes += bytes;
      else if (kind === 'image') stats.imageBytes += bytes;
      else stats.metadataBytes += bytes;
    });
    const key: NoteSource | 'unknown' = note.source ?? 'unknown';
    stats.bySource[key].count += 1;
    stats.bySource[key].bytes += noteBytes;
  }

  return stats;
}

async function sumNoteBytes(
  note: Note,
  onFile: (kind: 'video' | 'image' | 'other', bytes: number) => void,
): Promise<number> {
  try {
    const dir = new Directory(note.dirUri);
    if (!dir.exists) return 0;
    let total = 0;
    const entries = dir.list();
    for (const entry of entries) {
      if (!(entry instanceof File)) continue;
      const bytes = sizeOf(entry);
      total += bytes;
      const name = entry.name.toLowerCase();
      if (VIDEO_EXT.test(name)) onFile('video', bytes);
      else if (IMAGE_EXT.test(name)) onFile('image', bytes);
      else onFile('other', bytes);
    }
    return total;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(fixed)} ${units[i]}`;
}
