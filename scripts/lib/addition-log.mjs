// ── addition-log.mjs ─────────────────────────────────────────────────────────
// Append-only record of every artist added to seed-musicians.json, across
// every addition path (admin tool, CSV import, EN/cosine discovery scripts).
// Feeds scripts/newsletter-report.mjs. One JSON object per line.
//
// Deliberately NOT derived from git history — a running log lets each write
// path attach free-text context (which link, which CSV, which discovery seed)
// that a pure git diff of seed-musicians.json can't reconstruct.

import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ADDITION_LOG_PATH = join(__dirname, '..', 'addition-log.jsonl');

// entries: array of seed-shaped artist objects (must have at least name).
// source: short machine tag, e.g. 'admin-tool' | 'csv-import' | 'en-discover' | 'en-radio' | 'cosine-discover'.
// context: free text — the link pasted, CSV filename, seed artist name used for discovery, etc. Optional.
export function logAdditions(entries, source, context = null) {
  if (!entries?.length) return;
  const now = new Date().toISOString();
  const lines = entries.map(e => JSON.stringify({
    timestamp: now,
    name: e.name,
    genres: e.genres ?? [],
    subgenres: e.subgenres ?? [],
    birthDate: e.birthDate ?? null,
    youtubeVideoId: e.youtubeVideoId ?? e.youtubeId ?? null,
    handpickedTrack: e.handpickedTrack ?? null,
    source,
    context,
  })).join('\n') + '\n';
  appendFileSync(ADDITION_LOG_PATH, lines);
}
