#!/usr/bin/env node
// patch-electronica-dnb-classical-genres.mjs
// Apply EN-verified corrections from genre reports for electronica, dnb, classical

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));

// Never removed regardless of EN
const PRESERVE = new Set(['valentine']);

// null = skip (wrong EN match — leave unchanged)
const CHANGES = {

  // ── ELECTRONICA ────────────────────────────────────────────────────────────

  'Boards of Canada': ['ambient', 'electronica', 'idm', 'techno', 'triphop'], // preserve ambient, add techno
  'Electronic':       ['altrock', 'darkwave', 'electronica'],                  // synthpop → add darkwave
  'Miss Kittin':      ['altrock', 'darkwave', 'electronica', 'techno'],        // add altrock
  'Mogwai':           ['altrock', 'ambient', 'artpop', 'electronica', 'indiepop'], // dream pop/indie rock adds indiepop+artpop
  'Okay Kaya':        ['artpop'],                                               // EN: art pop only; prior tags were over-broad
  'Blanck Mass':      ['electronica', 'idm', 'techno'],                        // drop industrial (not supported by EN)
  'Emptyset':         ['ambient', 'electronica', 'idm', 'techno'],             // drop classical

  // ── DNB ───────────────────────────────────────────────────────────────────

  'Amon Tobin':       ['electronica', 'idm', 'jazz', 'triphop'],  // EN: jazztronica/trip hop — no dnb
  'Burial':           ['ambient', 'dnb', 'electronica', 'idm', 'triphop'], // preserve ambient, add electronica+idm+triphop
  'Martyn':           ['dnb', 'electronica', 'idm', 'techno', 'triphop'], // add electronica+idm+triphop
  'Squarepusher':     ['dnb', 'electronica', 'idm', 'triphop'],   // add electronica+triphop
  'Venetian Snares':  ['dnb', 'idm', 'industrial', 'techno'],     // hardcore techno → add techno+industrial
  'Zomby':            ['dnb', 'electronica', 'idm', 'triphop'],   // add electronica+triphop
  'Sega Bodega':      ['idm'],                                     // EN: hyperpop/deconstructed — no dnb
  'Terror Danjah':    ['dnb'],                                     // EN: grime only — no idm

  // ── CLASSICAL ─────────────────────────────────────────────────────────────

  // Minimalists gain ambient (compositional ambient confirmed by EN)
  'John Adams':       ['ambient', 'classical'],
  'Max Richter':      ['ambient', 'classical'],
  'Steve Reich':      ['ambient', 'classical'],
  'Terry Riley':      ['ambient', 'artpop', 'classical', 'idm'],   // avant-garde→artpop, experimental→idm
  'György Ligeti':    ['ambient', 'artpop', 'classical'],           // compositional ambient + avant-garde
  'Nils Frahm':       ['ambient', 'classical', 'darkwave', 'electronica'], // neoclassical darkwave confirmed

  // Avant-garde / experimental — adjust
  'Alvin Curran':     ['artpop', 'classical'],   // drop idm, add artpop (avant-garde confirmed by EN)
  'Murcof':           ['ambient', 'electronica', 'idm', 'techno'], // glitch/drone — EN drops classical
  'Sarah Davachi':    ['ambient', 'folk', 'idm'], // pastoral → folk, EN drops classical
  'Oren Ambarchi':    ['ambient', 'idm', 'techno'], // drone/electroacoustic — EN drops classical
  'Cecil Taylor':     ['jazz'],                   // avant-garde jazz only — no classical

  // Anna von Hausswolff: gaian doom → folk+industrial, PRESERVE darkwave per memory
  'Anna von Hausswolff': ['darkwave', 'folk', 'industrial'], // drop classical per EN

  // Ambient synthesists — EN categorises as ambient not classical
  'Ben Lukas Boysen':  ['ambient', 'idm'],
  'Chihei Hatakeyama': ['ambient', 'idm'],
  'Emily A. Sprague':  ['ambient', 'idm'],
  'Heather Woods Broderick': ['ambient', 'folk'],
  'Hiroshi Yoshimura': ['ambient'],
  'Joanna Brouk':      ['ambient'],
  'Klara Lewis':       ['ambient', 'idm'],
  'Laraaji':           ['ambient'],
  'Satoshi Ashikawa':  ['ambient'],
  'Suzanne Ciani':     ['ambient'],
  'Taylor Deupree':    ['ambient', 'idm'],
  'Tim Story':         ['ambient'],

  // Wrong EN match — leave unchanged
  'Malcolm Ironton':   null,
  'Luke Wyland':       null,
};

let changed = 0;
for (const artist of seed) {
  const entry = Object.prototype.hasOwnProperty.call(CHANGES, artist.name)
    ? CHANGES[artist.name]
    : undefined;

  if (entry === undefined) continue; // not in map
  if (entry === null) continue;      // wrong EN match — skip

  const preserved = (artist.genres || []).filter(g => PRESERVE.has(g));
  const merged    = [...new Set([...entry, ...preserved])].sort();

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
