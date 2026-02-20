#!/usr/bin/env node
// ── collect-notfound.mjs ──────────────────────────────────────────────────────
//
// Merges `notFound` artists from multiple genre-report JSON files into a single
// combined report that verify-genres.mjs --from-report can consume for a retry.
//
// Skips confirmed geo-noise wrong matches (those are definitively wrong artists).
// Retries: "not found" (EN timeout/slow) + "no genre overlap" (borderline).
//
// Usage:
//   node scripts/collect-notfound.mjs /path/to/genre-report-*.json
//   node scripts/collect-notfound.mjs /path/to/genre-report-*.json --output=scripts/notfound-retry.json
//
// Then run the second pass:
//   node scripts/verify-genres.mjs --from-report=scripts/notfound-retry.json --save-tags
//

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = name => { const a = args.find(a => a.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
const outputFile = getArg('output') || join(__dirname, 'notfound-retry.json');
const reportPaths = args.filter(a => !a.startsWith('--'));

if (reportPaths.length === 0) {
  console.error('Usage: node scripts/collect-notfound.mjs <report.json> [report2.json ...] [--output=file.json]');
  process.exit(1);
}

// Collect notFound entries, deduplicated by name (last-seen stored genres wins)
const byName = new Map();
let totalSeen = 0;
let skippedGeo = 0;

for (const reportPath of reportPaths) {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  const genre = report.meta?.filterGenre || reportPath;
  const notFound = report.notFound || [];
  console.log(`${reportPath} (${genre}): ${notFound.length} notFound`);

  for (const entry of notFound) {
    totalSeen++;

    // Skip confirmed geo-noise wrong matches — these are definitively wrong artists
    if (entry.reason?.startsWith('wrong match (geo tags')) {
      skippedGeo++;
      continue;
    }

    // Merge: if seen before, merge stored genres
    if (byName.has(entry.name)) {
      const existing = byName.get(entry.name);
      const merged = [...new Set([...(existing.stored || []), ...(entry.stored || [])])];
      existing.stored = merged;
    } else {
      byName.set(entry.name, { name: entry.name, stored: entry.stored || [], reason: entry.reason });
    }
  }
}

const notFound = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

// Write in the format verify-genres.mjs --from-report expects
const output = {
  meta: {
    date: new Date().toISOString(),
    source: reportPaths.map(p => p.split('/').pop()),
    note: 'Second-pass retry — notFound artists from genre verification runs',
  },
  notFound,
};

writeFileSync(outputFile, JSON.stringify(output, null, 2));

console.log(`
Summary:
  Total notFound seen:      ${totalSeen}
  Geo-noise wrong matches:  ${skippedGeo} (skipped — definitively wrong artist)
  No genre overlap:         ${notFound.filter(e => e.reason === 'no genre overlap').length} (included — worth retrying)
  Not found on EN:          ${notFound.filter(e => e.reason === 'not found').length} (included — may have timed out)
  Unique artists to retry:  ${notFound.length}

Written to: ${outputFile}

Run the second pass with:
  node scripts/verify-genres.mjs --from-report=${outputFile} --save-tags
`);
