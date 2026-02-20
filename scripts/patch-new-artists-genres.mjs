#!/usr/bin/env node
// One-time patch: apply EN genre corrections from genre-report-new-3 run (2026-02-20).
// Adds missing genres and removes over-tagged ones for new artists.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath, 'utf-8'));

// Never remove these genres regardless of EN data
const PRESERVE = new Set(['valentine', 'intercelestial', 'moon']);

// Genres to ADD (additive — merged with existing genres)
const ADD_GENRES = {
  'A. G. Cook':        ['idm', 'hiphop', 'dnb', 'artpop'],   // proto-hyperpop / PC Music founder
  'Angel Olsen':       ['artpop', 'folk', 'indiepop'],         // art pop / americana
  'Davishmar':         ['techno', 'jazz'],                     // jazz house → techno+jazz
  'Jayla Kai':         ['hiphop'],                             // EN: alternative r&b / nerdcore
  'Ólafur Arnalds':    ['darkwave'],                           // EN: neoclassical darkwave cluster
  'Ouri':              ['idm', 'artpop', 'techno'],            // EN: montreal indie / electra
  'Sam Gendel':        ['ambient'],                            // EN: fourth world + j-ambient → ambient
  'Sasha Vosk':        ['hiphop'],                             // EN: russian underground rap signal
  'Sonic Youth':       ['altrock', 'indiepop', 'industrial'],  // noise rock, alt-rock, no-wave
};

// Genres to REMOVE (PRESERVE set is always kept regardless)
const REMOVE_GENRES = {
  // Invalid category names
  'A. G. Cook':           ['electronic'],       // not a valid genre — stored by mistake
  'The Memphis Mustangs': ['soul'],             // not a valid genre category

  // Over-tagged — EN clearly contradicts these assignments
  'Iggy Pop':             ['industrial', 'darkwave', 'indiepop', 'electronica', 'folk'],
  'Linkin Park':          ['darkwave', 'indiepop', 'electronica', 'artpop', 'folk'],
  'The Velvet Underground': ['industrial', 'darkwave', 'indiepop', 'electronica'],

  // Lower-confidence removes — EN gives no signal for these genres at all
  'Amnesia Scanner': ['dnb', 'techno'],     // deconstructed club / Finnish electronic only
  'Bloodz Boi':      ['techno'],            // chinese electronic only → electronica
  'Forest Swords':   ['techno'],            // hauntology / wonky / art pop — no techno
  'Liquid':          ['darkwave'],          // hardcore techno / rave — no darkwave
  'Lorenzo Senni':   ['dnb'],              // Italian experimental / grimewave — no dnb
  'Minnie Riperton': ['jazz'],             // soul / motown / funk — no jazz
  'Murlo':           ['dnb'],              // weightless / grimewave / fluxwork — no dnb
  'Pavel Milyakov':  ['techno'],           // russian electronic / new isolationism — ambient/idm only
  'Rabit':           ['triphop'],          // deconstructed club / vogue / dubstep — no triphop
};

// Skipped (wrong-match EN aggregates — stored genres are likely correct):
// Dj Lostboi, Fernando García, Flash and the Pan, Headache, JAY-Z,
// Juraj Pospíšil, Nathanial Young, The Memphis Mustangs adds, Tiberius b
// Also skipped: Axel Dörner (suspect EN result), Palehound altrock (defensible)

let changed = 0;

function patch(record) {
  const toAdd    = ADD_GENRES[record.name]    || [];
  const toRemove = REMOVE_GENRES[record.name] || [];
  if (toAdd.length === 0 && toRemove.length === 0) return false;

  const original = new Set(record.genres || []);
  const patched  = new Set(original);

  for (const g of toAdd) patched.add(g);
  for (const g of toRemove) {
    if (!PRESERVE.has(g)) patched.delete(g);
  }

  const added   = toAdd.filter(g => !original.has(g));
  const removed = toRemove.filter(g => original.has(g) && !PRESERVE.has(g));

  if (added.length === 0 && removed.length === 0) return false;

  if (added.length)   console.log(`  + ${record.name}: +[${added.join(', ')}]`);
  if (removed.length) console.log(`  - ${record.name}: -[${removed.join(', ')}]`);

  record.genres = [...patched];
  return true;
}

console.log('\n── Seed ────────────────────────────────');
for (const a of seed) if (patch(a)) changed++;

console.log('\n── Built DB ────────────────────────────');
for (const a of db) patch(a);

writeFileSync(seedPath, JSON.stringify(seed, null, 2));
writeFileSync(dbPath,   JSON.stringify(db,   null, 2));
console.log(`\n${changed} seed artists updated.`);
