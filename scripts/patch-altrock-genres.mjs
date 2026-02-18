#!/usr/bin/env node
// One-time patch: add altrock genre + fix artists misclassified as darkwave/indiepop/artpop.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath, 'utf-8'));

// Artists moving to (or adding) altrock
const CORRECTIONS = {
  // britpop / madchester / dance rock
  'Primal Scream':   ['altrock', 'triphop'],      // Screamadelica keeps triphop
  'Electronic':      ['altrock', 'electronica'],  // New Order + Smiths supergroup
  // post-punk revival
  'Fontaines D.C.':  ['altrock'],
  'Ought':           ['altrock'],
  'Preoccupations':  ['altrock', 'industrial'],   // post-punk with industrial edge
  // post-rock
  'Mogwai':          ['altrock', 'ambient', 'electronica'],
  // shoegaze / alt-rock
  'Swervedriver':    ['altrock', 'indiepop'],
  // alt-rock with artpop
  'PJ Harvey':       ['altrock', 'artpop'],
};

const PRESERVE = new Set(['valentine', 'classical']);
let changed = 0;

function patch(record) {
  const newGenres = CORRECTIONS[record.name];
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
