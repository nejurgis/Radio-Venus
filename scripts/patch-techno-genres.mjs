#!/usr/bin/env node
// One-time patch: apply techno genre corrections from Everynoise verification.
// Combines automatic EN-derived corrections with manual overrides reviewed by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath, 'utf-8'));

// ── Manual overrides (user-reviewed) ─────────────────────────────────────────
// null = skip entirely (bad EN data or no change needed)
const MANUAL = {
  // User confirmed EN categories are correct
  'AFX':               ['idm', 'dnb'],
  'Clark':             ['idm', 'electronica'],
  'Underworld':        ['electronica'],
  'Four Tet':          ['electronica', 'folk', 'idm', 'triphop'],
  'Moderat':           ['electronica'],
  'Caroline Polachek': ['artpop', 'indiepop', 'electronica'],
  'Empress Of':        ['artpop', 'electronica'],
  'Sudan Archives':    ['jazz', 'idm'],
  // User confirmed ambient should be kept (EN missed it)
  'Rafael Toral':      ['ambient', 'idm'],
  'Purelink':          ['ambient', 'idm', 'triphop'],
  // User-tweaked (different from raw EN categories)
  'Gidge':             ['electronica', 'techno', 'ambient'],
  'Laurel Halo':       ['artpop', 'ambient', 'idm', 'techno'],
  'Nicolas Jaar':      ['electronica', 'triphop', 'techno'],
  'Richard H. Kirk':   ['techno', 'idm'],
  'Tristan Arp':       ['idm', 'electronica'],
  'Electronic':        ['darkwave'],
  // No change needed
  'Fhloston Paradigm': null,
  // Bad EN data (multiple-artist page contamination)
  'Madonna':           null,
};

// ── EN-derived corrections (from genre-report-techno.json) ───────────────────
// Only artists with removals that weren't manually reviewed above.
const EN_DERIVED = {
  '500':                   ['idm', 'techno'],
  'Actress':               ['techno', 'idm', 'dnb', 'electronica'],
  'Andy Stott':            ['idm', 'ambient', 'techno', 'electronica', 'artpop', 'triphop'],
  'Anthony Rother':        ['electronica', 'techno'],
  'Chihei Hatakeyama':     ['ambient', 'idm'],
  'Cooly G':               ['dnb'],
  'Datassette':            ['idm'],
  'David Carretta':        ['techno'],
  'DJ Rashad':             ['dnb'],
  'Dylan Henner':          ['ambient', 'idm'],
  'Electronic':            ['darkwave'],
  'Emily A. Sprague':      ['ambient', 'idm'],
  'Emptyset':              ['electronica', 'techno', 'idm', 'ambient'],
  'Floating Points':       ['electronica', 'dnb', 'idm'],
  'Forward Strategy Group':['techno'],
  'Gas':                   ['ambient'],
  'Jon Hopkins':           ['electronica', 'ambient', 'idm'],
  'Lee Gamble':            ['electronica', 'techno', 'idm'],
  'Mark Pritchard':        ['idm', 'ambient', 'electronica'],
  'Miss Kittin':           ['techno', 'electronica', 'darkwave'],
  'Model 500':             ['techno', 'jazz'],
  'New Order':             ['darkwave'],
  'Nick León':             ['idm'],
  'Nitzer Ebb':            ['industrial', 'darkwave'],
  'Oren Ambarchi':         ['techno', 'idm', 'ambient'],
  'Rival Consoles':        ['ambient', 'idm', 'electronica'],
  'Scratcha DVA':          ['dnb'],
  'Shygirl':               ['dnb', 'artpop', 'idm'],
  'Taylor Deupree':        ['ambient', 'idm'],
  'Terence Fixmer':        ['techno', 'industrial', 'darkwave'],
  'The Hacker':            ['techno', 'electronica'],
  'µ-Ziq':                 ['dnb', 'idm', 'electronica', 'techno'],
};

const ALL = { ...EN_DERIVED, ...Object.fromEntries(Object.entries(MANUAL).filter(([, v]) => v !== null)) };

// ── Apply ─────────────────────────────────────────────────────────────────────
const PRESERVE = new Set(['valentine', 'classical']);
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
console.log(`\n${changed} seed artists updated. Run build-db.mjs if you want to rebuild the full DB.`);
