const INSTAGRAM_HOSTS = ['instagram.com', 'www.instagram.com', 'instagr.am'];

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

export function isInstagramUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return INSTAGRAM_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractInstagramUrl(text: string): string | null {
  const url = extractFirstUrl(text);
  return url && isInstagramUrl(url) ? url : null;
}
