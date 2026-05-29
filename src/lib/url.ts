import type { NoteSource } from './notes';

const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com', 'instagr.am'];
const REDNOTE_HOSTS = [
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
];

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isInstagramUrl(url: string): boolean {
  const h = hostnameOf(url);
  return !!h && INSTAGRAM_HOSTS.includes(h);
}

export function isRednoteUrl(url: string): boolean {
  const h = hostnameOf(url);
  return !!h && REDNOTE_HOSTS.includes(h);
}

export function detectSource(url: string): NoteSource | null {
  if (isInstagramUrl(url)) return 'instagram';
  if (isRednoteUrl(url)) return 'rednote';
  return null;
}

export function extractInstagramUrl(text: string): string | null {
  const url = extractFirstUrl(text);
  return url && isInstagramUrl(url) ? url : null;
}

export function extractRednoteUrl(text: string): string | null {
  const url = extractFirstUrl(text);
  return url && isRednoteUrl(url) ? url : null;
}

/** Extract any supported source URL from arbitrary text (clipboard, share intent, etc.) */
export function extractSupportedUrl(
  text: string,
): { url: string; source: NoteSource } | null {
  const url = extractFirstUrl(text);
  if (!url) return null;
  const source = detectSource(url);
  return source ? { url, source } : null;
}
