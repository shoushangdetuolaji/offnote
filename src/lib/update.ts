import { Directory, DownloadTask, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

const GITHUB_OWNER = 'shoushangdetuolaji';
const GITHUB_REPO = 'offnote';

/**
 * 下载加速镜像前缀，依次尝试，失败回退到下一个。
 * 空字符串表示原始直连（github 资产直链本身）。
 */
export const MIRRORS: { label: string; prefix: string }[] = [
  { label: 'ghproxy', prefix: 'https://ghproxy.net/' },
  { label: 'gh-proxy', prefix: 'https://gh-proxy.com/' },
  { label: 'moeyy', prefix: 'https://github.moeyy.xyz/' },
  { label: '原始直连', prefix: '' },
];

export type LatestRelease = {
  /** 去掉前导 v 的版本号，如 1.0.1 */
  version: string;
  /** release 原始 tag，如 v1.0.1 */
  tag: string;
  /** 更新说明（release body） */
  notes: string;
  /** apk 资产的原始下载直链；无 apk 资产时为 null */
  apkUrl: string | null;
  /** release 网页地址（iOS 兜底跳转） */
  htmlUrl: string;
};

/** 解析 "v1.2.3" / "1.2.3" → [1,2,3] */
function parseVersion(tag: string): number[] {
  return tag
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** remote 是否比 local 新 */
export function isNewer(remote: string, local: string): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * 检查更新用的 API 端点，依次尝试。
 * 直连 api.github.com 在国内共享出口 IP 上易被匿名限流（403），
 * 故追加几个镜像反代作为回退。
 */
function releaseApiEndpoints(): string[] {
  const apiPath = `repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  const apiUrl = `https://api.github.com/${apiPath}`;
  return [
    apiUrl, // 直连优先
    `https://gh-proxy.com/${apiUrl}`, // 反代 api.github.com（实测可用）
    `https://api.kkgithub.com/${apiPath}`, // 镜像自带 api（实测可用）
  ];
}

/** 拉取最新 release 信息（多端点回退，避开匿名限流 403） */
export async function checkLatestRelease(): Promise<LatestRelease> {
  let lastStatus = 0;
  let lastErr: unknown;

  for (const url of releaseApiEndpoints()) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) {
        lastStatus = res.status;
        continue; // 403/限流等，换下一个端点
      }
      const data = await res.json();
      const tag: string = data.tag_name ?? '';
      const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
      const apk = assets.find((a) =>
        String(a.name).toLowerCase().endsWith('.apk'),
      );
      return {
        version: tag.replace(/^v/i, ''),
        tag,
        notes: (data.body ?? '').trim(),
        apkUrl: apk?.browser_download_url ?? null,
        htmlUrl:
          data.html_url ??
          `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    lastStatus
      ? `检查更新失败（HTTP ${lastStatus}），请稍后重试`
      : `检查更新失败：${lastErr instanceof Error ? lastErr.message : '网络错误'}`,
  );
}

export type DownloadProgress = { fraction: number; label: string };

const UPDATE_DIR = 'updates';
const APK_NAME = 'offnote-update.apk';

function updateDir(): Directory {
  const dir = new Directory(Paths.cache, UPDATE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * 依次尝试镜像下载 apk，任一成功即返回本地 file uri；全部失败抛错。
 */
export async function downloadApk(
  apkUrl: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const dir = updateDir();
  let lastErr: unknown;

  for (const mirror of MIRRORS) {
    const dest = new File(dir, APK_NAME);
    if (dest.exists) {
      try {
        dest.delete();
      } catch {}
    }
    const fullUrl = mirror.prefix + apkUrl;
    try {
      const task = new DownloadTask(fullUrl, dest);
      const sub = task.addListener('progress', (data) => {
        const total = data.totalBytes ?? 0;
        const written = data.bytesWritten ?? 0;
        const fraction = total > 0 ? written / total : 0;
        onProgress?.({
          fraction,
          label: `${mirror.label} ${Math.round(fraction * 100)}%`,
        });
      });
      const file = await task.downloadAsync();
      sub.remove();
      if (file?.uri && file.exists) {
        return file.uri;
      }
      throw new Error('下载结果为空');
    } catch (e) {
      lastErr = e;
      // 试下一个镜像
    }
  }
  throw new Error(
    `所有下载源均失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

/** 拉起系统安装器（Android） */
export async function installApk(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const contentUri = await getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
