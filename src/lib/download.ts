import { Directory, File, Paths } from 'expo-file-system';

import type { MediaItem } from './types';

export type DownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  fraction: number;
};

export type DownloadResult = {
  ok: boolean;
  localUri?: string;
  error?: string;
};

const SUBDIR = 'OffNote';

function ensureOffNoteDir(): Directory {
  const dir = new Directory(Paths.document, SUBDIR);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export async function saveBase64(
  base64: string,
  filename: string,
): Promise<DownloadResult> {
  try {
    const dir = ensureOffNoteDir();
    const file = new File(dir, filename);
    file.create({ overwrite: true });
    file.write(base64, { encoding: 'base64' });
    return { ok: true, localUri: file.uri };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '保存异常' };
  }
}

export async function downloadAndSave(
  item: MediaItem,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  try {
    const dir = ensureOffNoteDir();
    const destination = new File(dir, item.filename);
    if (destination.exists) destination.delete();

    const task = File.createDownloadTask(item.url, destination, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes || 0;
        const written = bytesWritten || 0;
        const fraction = total > 0 ? written / total : 0;
        onProgress?.({ bytesWritten: written, totalBytes: total, fraction });
      },
    });

    const file = await task.downloadAsync();
    return { ok: true, localUri: file?.uri ?? destination.uri };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '下载异常' };
  }
}
