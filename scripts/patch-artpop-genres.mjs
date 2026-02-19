#!/usr/bin/env node
// patch-artpop-genres.mjs — apply EN-verified genre corrections to artpop artists

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));

// Never removed regardless of EN
const PRESERVE = new Set(['valentine']);

// null = skip (wrong EN match or EN too sparse — leave unchanged)
const MANUAL = {
  // Substring false positives in categorizeGenres
  'Charli xcx':      ['artpop', 'electronica'],          // "pop" substring → false idm/darkwave/altrock
  'Fleetwood Mac':   ['artpop', 'altrock'],               // "rock" substring → false everything
  'Madonna':         ['artpop', 'techno'],                // "pop" substring false positives
  'Yves Tumor':      ['artpop'],                          // "experimental" → false idm
  'Grace Ives':      ['indiepop', 'artpop'],              // "experimental indie" → false idm
  'Tonstartssbandht':['artpop'],                          // "experimental" → false idm
  'R. Stevie Moore': ['artpop'],                          // outsider/lo-fi → false idm/electronica
  'Avey Tare':       ['idm', 'indiepop', 'artpop', 'folk', 'electronica'], // keep stored (EN too sparse)
  'Empress Of':      ['artpop', 'electronica'],           // electropop = electronica, not techno

  // Wrong EN match — skip entirely
  'Bel Canto':       null,   // correct first match, then appended unrelated artists
  'Robin Guthrie & Harold Budd': null,  // matched completely different artists
  'Deakin':          null,   // matched Latin music

  // Ambient preserve (per project rules)
  'Laurel Halo':     ['ambient', 'artpop', 'techno'],    // preserve ambient, drop idm (EN: artpop+techno)
  'Love Spirals Downwards': ['ambient', 'artpop', 'darkwave', 'indiepop', 'altrock'],

  // EN misses core genres — correct manually
  'Tori Amos':       ['artpop', 'classical'],             // EN maps ectofolk/lilith → folk/darkwave, misses artpop entirely
  'Joni Mitchell':   ['jazz', 'artpop', 'folk'],          // keep jazz+artpop, add folk
  'Kelela':          ['triphop', 'artpop'],               // afrofuturism→jazz & alt r&b→idm are wrong categorizations
  'Sevdaliza':       ['triphop', 'artpop'],               // persian electronic too niche
  'Sinéad O\'Connor':['artpop'],                          // lilith→darkwave is a stretch
  'Inga Copeland':   ['idm', 'artpop'],                   // gauze pop/outsider house ≠ techno

  // Artpop collaborations — handle ambient + darkwave carefully
  'Harold Budd, Simon Raymonde, Robin Guthrie & Elizabeth Fraser': ['artpop', 'ambient'],
  'Marriages':       ['folk', 'industrial', 'artpop'],    // gaian doom → folk+industrial, keep artpop

  // EN adds correctly, minor adjustments
  'Animal Collective': ['artpop', 'darkwave', 'electronica', 'folk', 'indiepop', 'altrock'],
  'Anika':           ['artpop', 'folk'],                  // new weird america → folk; drop indiepop
  'Weyes Blood':     ['artpop', 'folk', 'indiepop'],      // drop idm (false positive from "experimental folk")
};

// EN-derived: enCategories applied directly (EN is clearly correct for these)
const EN_DERIVED = {
  'Alison\'s Halo':        ['altrock', 'indiepop'],              // pure shoegaze, no artpop in EN
  'Benoît Pioulard':       ['ambient', 'altrock', 'indiepop'],   // drone/shoegaze, drop artpop
  'Black Tape for a Blue Girl': ['artpop', 'darkwave', 'classical', 'altrock', 'indiepop', 'electronica'],
  'Cocteau Twins':         ['altrock', 'artpop', 'darkwave', 'indiepop'],
  'Fleeting Joys':         ['artpop', 'indiepop', 'altrock'],
  'His Name Is Alive':     ['artpop', 'indiepop', 'altrock'],
  'Hope Sandoval & The Warm Inventions': ['artpop', 'indiepop'],  // drop idm
  'Isabel\'s Dream':       ['altrock', 'indiepop'],              // pure shoegaze, drop artpop
  'Joanna Newsom':         ['artpop', 'folk'],                   // add folk, drop classical
  'Kate Bush':             ['artpop', 'darkwave'],               // new wave pop → darkwave
  'Kitchens of Distinction': ['artpop', 'indiepop', 'altrock', 'electronica'], // drop darkwave
  'Lucinda Chua':          ['artpop'],                           // drop classical per EN
  'LSD and the Search for God': ['artpop', 'indiepop', 'altrock'], // drop idm
  'Mazzy Star':            ['artpop', 'indiepop', 'altrock'],    // drop idm
  'Medicine':              ['altrock', 'indiepop'],              // shoegaze only, drop artpop
  'Midwife':               ['idm', 'altrock', 'indiepop'],       // shoegaze, drop artpop
  'Mojave 3':              ['artpop', 'indiepop'],               // drop idm, add indiepop
  'Monaco':                ['altrock', 'electronica'],           // britpop/madchester, drop darkwave+artpop
  'my bloody valentine':   ['artpop', 'indiepop', 'altrock'],   // drop industrial
  'Pale Saints':           ['artpop', 'indiepop', 'altrock'],   // drop industrial
  'Perfume Genius':        ['artpop', 'indiepop', 'electronica', 'darkwave'],
  'St. Vincent':           ['artpop', 'indiepop', 'electronica', 'darkwave'],
  'Starflyer 59':          ['artpop', 'indiepop', 'altrock'],
  'Exploded View':         ['artpop', 'indiepop', 'altrock'],
};

let changed = 0;
for (const artist of seed) {
  const manual  = Object.prototype.hasOwnProperty.call(MANUAL, artist.name) ? MANUAL[artist.name] : undefined;
  const derived = EN_DERIVED[artist.name];

  if (manual === null) continue; // wrong EN match — leave unchanged

  const newGenres = manual ?? derived;
  if (!newGenres) continue; // not in either map — leave unchanged

  // Merge with any PRESERVE genres already stored
  const preserved = (artist.genres || []).filter(g => PRESERVE.has(g));
  const merged    = [...new Set([...newGenres, ...preserved])].sort();

  const before = (artist.genres || []).slice().sort().join(', ');
  const after  = merged.join(', ');
  if (before !== after) {
    console.log(`${artist.name}`);
    console.log(`  before: [${before}]`);
    console.log(`  after:  [${after}]`);
    artist.genres = merged;
    changed++;
  }
}

writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
console.log(`\nUpdated ${changed} artists.`);
