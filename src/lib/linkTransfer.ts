import { listNotes, type NoteSource } from './notes';
import { detectSource } from './url';

export type LinkGroup = {
  source: NoteSource;
  label: string;
  urls: string[];
};

export type ParsedImportLinks = {
  rednote: string[];
  unsupported: string[];
};

const LABELS: Record<NoteSource, string> = {
  rednote: '小红书',
  instagram: 'Instagram',
};

function normalizeUrl(url: string): string {
  return url.replace(/[),.;，。；、]+$/g, '').trim();
}

export function parseImportLinks(text: string): ParsedImportLinks {
  const buckets: ParsedImportLinks = {
    rednote: [],
    unsupported: [],
  };
  const seen = new Set<string>();
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];

  for (const raw of matches) {
    const url = normalizeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const source = detectSource(url);
    if (source === 'rednote') buckets.rednote.push(url);
    else buckets.unsupported.push(url);
  }

  return buckets;
}

export async function buildLinksExportText(source: NoteSource): Promise<string> {
  const notes = await listNotes();
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    const url = note.sourceUrl?.trim();
    if (!url || seen.has(url)) continue;
    const noteSource = note.source ?? detectSource(url);
    if (noteSource !== source) continue;

    urls.push(url);
    seen.add(url);
  }

  const lines = [
    `OffNote ${LABELS[source]}链接导出 ${new Date().toLocaleString()}`,
    '',
    `# ${LABELS[source]} (${urls.length})`,
  ];
  if (urls.length) lines.push(...urls);
  else lines.push('无');

  return lines.join('\n').trimEnd();
}
