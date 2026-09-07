#!/usr/bin/env node
// ── newsletter-report.mjs ────────────────────────────────────────────────────
// Turns scripts/addition-log.jsonl into a Markdown newsletter draft covering
// everything added to Radio Venus in a date range. Every addition path
// (admin tool, CSV import, EN/cosine discovery scripts) writes to that log
// via scripts/lib/addition-log.mjs — this just reads and formats it.
//
// Usage:
//   node scripts/newsletter-report.mjs                    # everything since the last report
//   node scripts/newsletter-report.mjs --since=2026-08-01
//   node scripts/newsletter-report.mjs --since=2026-08-01 --until=2026-09-01
//   node scripts/newsletter-report.mjs --output=newsletter-draft.md
//
// With no --since given, the range starts where the last run left off
// (tracked in scripts/.newsletter-last-run.json) and that marker advances
// to --until once the report is generated. Pass --since explicitly to
// preview an arbitrary range without moving the marker (e.g. re-running a
// past month).
//
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateVenus } from './lib/enrich.mjs';
import { ADDITION_LOG_PATH } from './lib/addition-log.mjs';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const MARKER_PATH = join(__dirname, '.newsletter-last-run.json');

const args       = process.argv.slice(2);
const arg        = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sinceArg   = arg('since');
const untilArg   = arg('until');
const outputPath = arg('output');

const until = untilArg ? new Date(untilArg) : new Date();
const explicitSince = !!sinceArg;

function readMarker() {
  if (!existsSync(MARKER_PATH)) return null;
  try { return JSON.parse(readFileSync(MARKER_PATH, 'utf-8')).lastUntil ?? null; }
  catch { return null; }
}

function writeMarker(untilISO) {
  writeFileSync(MARKER_PATH, JSON.stringify({ lastUntil: untilISO }, null, 2));
}

const since = sinceArg
  ? new Date(sinceArg)
  : new Date(readMarker() ?? Date.now() - 30 * 24 * 60 * 60 * 1000);

if (!existsSync(ADDITION_LOG_PATH)) {
  console.error(`No addition log yet at ${ADDITION_LOG_PATH} — nothing to report.`);
  process.exit(1);
}

const entries = readFileSync(ADDITION_LOG_PATH, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .filter(e => {
    const t = new Date(e.timestamp);
    return t >= since && t <= until;
  });

if (!entries.length) {
  console.log(`No additions logged between ${since.toISOString().slice(0,10)} and ${until.toISOString().slice(0,10)}.`);
  if (!explicitSince) writeMarker(until.toISOString());
  process.exit(0);
}

// Group by primary genre (first entry in genres[]), falling back to "other".
const byGenre = new Map();
for (const e of entries) {
  const primary = e.genres?.[0] ?? 'other';
  if (!byGenre.has(primary)) byGenre.set(primary, []);
  byGenre.get(primary).push(e);
}

const GENRE_LABELS = {
  ambient: 'Ambient', dnb: 'Drum & Bass', idm: 'IDM', electronica: 'Electronica',
  techno: 'Techno', house: 'House', dubstep: 'Dubstep', triphop: 'Trip-Hop',
  classical: 'Classical', experimental: 'Experimental', pop: 'Pop', rock: 'Rock',
  folk: 'Folk', jazz: 'Jazz', hiphop: 'Hip-Hop', other: 'Other',
};

function label(genreKey) {
  return GENRE_LABELS[genreKey] ?? genreKey.charAt(0).toUpperCase() + genreKey.slice(1);
}

const SOURCE_LABELS = {
  'admin-tool': 'hand-picked', 'csv-import': 'playlist import',
  'en-discover': 'Everynoise discovery', 'en-radio': 'Everynoise radio',
  'cosine-discover': 'cosine.club discovery',
};

const dateFmt = d => d.toISOString().slice(0, 10);

let md = `# Radio Venus — new arrivals\n\n`;
md += `${dateFmt(since)} → ${dateFmt(until)} · ${entries.length} artist${entries.length === 1 ? '' : 's'} added\n\n`;

const sortedGenres = [...byGenre.entries()].sort((a, b) => b[1].length - a[1].length);

for (const [genreKey, list] of sortedGenres) {
  md += `## ${label(genreKey)}\n\n`;
  for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
    const venus = e.birthDate ? calculateVenus(e.birthDate) : null;
    const venusPart = venus ? ` — Venus in ${venus}` : '';
    const listenPart = e.youtubeVideoId ? ` — [listen](https://www.youtube.com/watch?v=${e.youtubeVideoId})` : '';
    const trackPart = e.handpickedTrack ? ` ("${e.handpickedTrack}")` : '';
    md += `- **${e.name}**${trackPart}${venusPart}${listenPart}\n`;
  }
  md += '\n';
}

md += `---\n\n`;
md += `<sub>By source: ${[...new Set(entries.map(e => e.source))]
  .map(s => `${SOURCE_LABELS[s] ?? s} (${entries.filter(e => e.source === s).length})`)
  .join(', ')}</sub>\n`;

if (outputPath) {
  writeFileSync(outputPath, md);
  console.log(`Wrote ${entries.length} artists → ${outputPath}`);
} else {
  console.log(md);
}

if (!explicitSince) writeMarker(until.toISOString());
