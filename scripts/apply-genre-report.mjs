#!/usr/bin/env node
// ── Apply Genre Report ────────────────────────────────────────────────────────
//
// Reads a genre-report.json produced by verify-genres.mjs and patches
// genres in seed-musicians.json + public/data/musicians.json.
//
// For each artist with a verified EN match, genres are replaced with
// EN-derived categories. Special tags (valentine, classical) are preserved.
//
// Usage:
//   node scripts/apply-genre-report.mjs scripts/genre-report-techno.json
//   node scripts/apply-genre-report.mjs scripts/genre-report-techno.json --dry-run
//
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const reportPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!reportPath) {
  console.error('Usage: node scripts/apply-genre-report.mjs <report.json> [--dry-run]');
  process.exit(1);
}

// Tags that should never be overwritten by EN data
const PRESERVE_TAGS = new Set(['valentine', 'classical']);

const report = JSON.parse(readFileSync(resolve(reportPath), 'utf-8'));
const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');

const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath,   'utf-8'));

const seedByName = new Map(seed.map(a => [a.name.toLowerCase(), a]));
const dbByName   = new Map(db.map(a =>   [a.name.toLowerCase(), a]));

// Gather all entries with a verified EN match (ok + missing + extra)
const verified = [
  ...report.ok,
  ...report.missing,
  ...report.extra,
].filter((e, i, arr) => arr.findIndex(x => x.name === e.name) === i); // dedupe

let changed = 0;

console.log(`Applying genre corrections from ${reportPath}`);
console.log(`  ${verified.length} verified artists, ${report.notFound?.length ?? 0} skipped (not found / wrong match)\n`);
if (dryRun) console.log('  DRY RUN — no files will be written\n');

for (const entry of verified) {
  if (!entry.enCategories?.length) continue;

  const stored  = entry.stored || [];
  const newGenres = [
    ...entry.enCategories,
    ...stored.filter(g => PRESERVE_TAGS.has(g)), // keep special tags
  ].filter((g, i, arr) => arr.indexOf(g) === i);  // dedupe

  const changed_ = JSON.stringify(newGenres.sort()) !== JSON.stringify([...stored].sort());
  if (!changed_) continue;

  const added   = newGenres.filter(g => !stored.includes(g));
  const removed = stored.filter(g => !newGenres.includes(g));
  console.log(`${entry.name}:`);
  if (added.length)   console.log(`  + ${added.join(', ')}`);
  if (removed.length) console.log(`  - ${removed.join(', ')}`);
  console.log(`  EN raw: [${entry.enRaw?.slice(0, 4).join(', ')}]`);

  if (!dryRun) {
    const seedEntry = seedByName.get(entry.name.toLowerCase());
    if (seedEntry) seedEntry.genres = newGenres;

    const dbEntry = dbByName.get(entry.name.toLowerCase());
    if (dbEntry) dbEntry.genres = newGenres;
  }

  changed++;
}

console.log(`\n${changed} artists updated${dryRun ? ' (dry run)' : ''}.`);

if (!dryRun && changed > 0) {
  writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  writeFileSync(dbPath,   JSON.stringify(db,   null, 2));
  console.log('Saved seed-musicians.json and musicians.json.');
  console.log('Run "node scripts/build-db.mjs" to rebuild the full database.');
}
