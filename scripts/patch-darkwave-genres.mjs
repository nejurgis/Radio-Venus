#!/usr/bin/env node
// One-time patch: apply darkwave genre corrections from Everynoise verification.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath, 'utf-8'));
const report = JSON.parse(readFileSync(join(__dirname, 'genre-report-darkwave.json'), 'utf-8'));

// ── Manual overrides: protected artists where EN missed something ─────────────
const MANUAL = {
  // Keep darkwave despite EN's gaian doom categorisation
  'Anna von Hausswolff': ['folk', 'industrial', 'darkwave'],
  'Chelsea Wolfe':       ['folk', 'industrial', 'darkwave'],
  'Esben and the Witch': ['folk', 'industrial', 'darkwave'],
  // Keep ambient
  'Julee Cruise':           ['indiepop', 'artpop', 'ambient'],
  'Love Spirals Downwards': ['artpop', 'darkwave', 'indiepop', 'ambient'],
  // Keep industrial
  'Blanck Mass': ['electronica', 'techno', 'idm', 'industrial'],
  // Keep darkwave (witch house / dark pop)
  'Alice Glass': ['techno', 'darkwave'],
  // Apply EN (experimental pop / bristol indie / new weird america)
  'Anika': ['artpop', 'indiepop', 'folk'],
  // These are no-change (EN already includes their protected tags) — skip
  'Robin Guthrie':        null,
  'Cocteau Twins':        null,
  'Dead Can Dance':       null,
  'This Mortal Coil':     null,
  'Lycia':                null,
  'Autumn\'s Grey Solace': null,
};

// ── Build EN-derived corrections from report ──────────────────────────────────
const PRESERVE = new Set(['valentine', 'classical']);
const seen = new Set();
const EN_DERIVED = {};
for (const entry of [...report.ok, ...report.missing, ...report.extra]) {
  if (seen.has(entry.name)) continue;
  seen.add(entry.name);
  const stored = entry.stored || [];
  const enCats = entry.enCategories || [];
  const removed = stored.filter(g => !enCats.includes(g) && !PRESERVE.has(g));
  if (removed.length > 0) EN_DERIVED[entry.name] = enCats;
}

const ALL = { ...EN_DERIVED, ...Object.fromEntries(Object.entries(MANUAL).filter(([, v]) => v !== null)) };

// ── Apply ─────────────────────────────────────────────────────────────────────
let changed = 0;
function patch(record) {
  const newGenres = ALL[record.name];
  if (!newGenres) return false;
  const preserved = (record.genres || []).filter(g => PRESERVE.has(g));
  const final = [...new Set([...newGenres, ...preserved])];
  if (JSON.stringify(final.sort()) === JSON.stringify([...(record.genres || [])].sort())) return false;
  const added   = final.filter(g => !(record.genres || []).includes(g));
  const removed = (record.genres || []).filter(g => !final.includes(g));
  console.log(`${record.name}: +[${added.join(', ')}] -[${removed.join(', ')}] → [${final.join(', ')}]`);
  record.genres = final;
  return true;
}

for (const a of seed) if (patch(a)) changed++;
for (const a of db)   patch(a);

writeFileSync(seedPath, JSON.stringify(seed, null, 2));
writeFileSync(dbPath,   JSON.stringify(db,   null, 2));
console.log(`\n${changed} seed artists updated.`);
