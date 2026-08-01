import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { zip, unzip } from 'react-native-zip-archive';

import type { Category } from './categories';

const BACKUP_VERSION = 1;
const ROOT_NAME = 'OffNote';
const CAT_KEY = 'offnote:categories';
const COBALT_KEY = 'offnote:cobalt:instance';

/** zip 库要裸路径（不带 file://）；expo 的 uri 带 file:// */
function toPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

type Manifest = {
  version: number;
  createdAt: number;
  categories: Category[];
  cobaltInstance: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export type ProgressFn = (label: string) => void;

/**
 * 导出全部数据为单个 .zip，返回 zip 的本地 uri。
 * 内容：OffNote/ 整个目录（笔记+媒体）+ manifest.json（分类/设置）。
 */
export async function exportBackup(onProgress?: ProgressFn): Promise<string> {
  const staging = new Directory(Paths.cache, `backup-staging-${Date.now()}`);
  if (staging.exists) staging.delete();
  staging.create({ intermediates: true });

  try {
    onProgress?.('正在打包数据…');

    // 1) manifest.json
    const catsRaw = await AsyncStorage.getItem(CAT_KEY);
    const cobalt = await AsyncStorage.getItem(COBALT_KEY);
    const manifest: Manifest = {
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      categories: catsRaw ? (JSON.parse(catsRaw) as Category[]) : [],
      cobaltInstance: cobalt ?? null,
    };
    const manifestFile = new File(staging, 'manifest.json');
    manifestFile.create();
    manifestFile.write(JSON.stringify(manifest, null, 2), { encoding: 'utf8' });

    // 2) 复制 OffNote 目录
    const root = new Directory(Paths.document, ROOT_NAME);
    if (root.exists) {
      const dest = new Directory(staging, ROOT_NAME);
      root.copy(dest);
    }

    // 3) 压缩
    onProgress?.('正在压缩…');
    const zipFile = new File(Paths.cache, `offnote-backup-${stamp()}.zip`);
    if (zipFile.exists) zipFile.delete();
    await zip(toPath(staging.uri), toPath(zipFile.uri));

    return zipFile.uri;
  } finally {
    try {
      staging.delete();
    } catch {}
  }
}

/** 调系统分享导出 zip（存网盘/文件/发给自己） */
export async function shareBackup(zipUri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('当前设备不支持分享导出');
  }
  await Sharing.shareAsync(zipUri, {
    mimeType: 'application/zip',
    dialogTitle: '导出 OffNote 备份',
  });
}

export type RestoreResult = { added: number; skipped: number };

/**
 * 从用户选择的 .zip 恢复（合并：已存在的笔记按 id 跳过，不覆盖现有）。
 */
export async function importBackup(
  onProgress?: ProgressFn,
): Promise<RestoreResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) return null;

  const zipUri = picked.assets[0].uri;
  const workDir = new Directory(Paths.cache, `backup-restore-${Date.now()}`);
  if (workDir.exists) workDir.delete();
  workDir.create({ intermediates: true });

  try {
    onProgress?.('正在解压…');
    await unzip(toPath(zipUri), toPath(workDir.uri));

    // manifest：合并分类、补全设置
    const manifestFile = new File(workDir, 'manifest.json');
    if (manifestFile.exists) {
      try {
        const manifest = JSON.parse(await manifestFile.text()) as Manifest;
        await mergeCategories(manifest.categories ?? []);
        if (manifest.cobaltInstance) {
          const current = await AsyncStorage.getItem(COBALT_KEY);
          if (!current) {
            await AsyncStorage.setItem(COBALT_KEY, manifest.cobaltInstance);
          }
        }
      } catch {}
    }

    // 合并笔记目录
    onProgress?.('正在恢复笔记…');
    let added = 0;
    let skipped = 0;
    const srcRoot = new Directory(workDir, ROOT_NAME);
    if (srcRoot.exists) {
      const destRoot = new Directory(Paths.document, ROOT_NAME);
      if (!destRoot.exists) destRoot.create({ intermediates: true });

      for (const entry of srcRoot.list()) {
        if (!(entry instanceof Directory)) continue;
        const id = entry.name;
        const target = new Directory(destRoot, id);
        if (target.exists) {
          skipped += 1;
          continue;
        }
        entry.copy(target);
        await rewriteNotePaths(new Directory(destRoot, id));
        added += 1;
      }
    }

    return { added, skipped };
  } finally {
    try {
      workDir.delete();
    } catch {}
  }
}

/**
 * meta.json 里的 dirUri / indexUri 是导出设备的绝对路径，换设备（或重装导致
 * 沙盒路径变化）后会失效。恢复时按本机实际路径重写，index.html 用的是相对
 * 文件名，无需处理。
 */
async function rewriteNotePaths(dir: Directory): Promise<void> {
  const metaFile = new File(dir, 'meta.json');
  if (!metaFile.exists) return;
  try {
    const note = JSON.parse(await metaFile.text());
    note.dirUri = dir.uri;
    note.indexUri = new File(dir, 'index.html').uri;
    metaFile.write(JSON.stringify(note, null, 2), { encoding: 'utf8' });
  } catch {
    // 单条损坏不影响其他笔记恢复
  }
}

/** 把备份里的分类并入现有（按 id 去重；id 不冲突但同名也跳过） */
async function mergeCategories(incoming: Category[]): Promise<void> {
  if (!incoming.length) return;
  const raw = await AsyncStorage.getItem(CAT_KEY);
  const current: Category[] = raw ? JSON.parse(raw) : [];
  const byId = new Set(current.map((c) => c.id));
  const byName = new Set(current.map((c) => c.name.trim().toLocaleLowerCase()));

  const merged = [...current];
  for (const cat of incoming) {
    if (byId.has(cat.id)) continue;
    if (byName.has(cat.name.trim().toLocaleLowerCase())) continue;
    merged.push(cat);
    byId.add(cat.id);
    byName.add(cat.name.trim().toLocaleLowerCase());
  }
  await AsyncStorage.setItem(CAT_KEY, JSON.stringify(merged));
}
