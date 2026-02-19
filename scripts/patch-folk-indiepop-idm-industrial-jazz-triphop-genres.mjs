#!/usr/bin/env node
// patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs
// Apply EN-verified corrections from genre reports for folk, indiepop, idm, industrial, jazz, triphop

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

  // ── IDM ───────────────────────────────────────────────────────────────────

  'Alva Noto':            ['ambient', 'idm'],                                     // drop industrial, add ambient (glitch ambient)
  'Alessandro Cortini':   ['ambient', 'idm'],                                     // drop industrial (modular/drone)
  'Angel-Ho':             ['electronica', 'idm', 'techno'],                       // drop industrial, add electronica+techno
  'Arca':                 ['artpop', 'idm', 'industrial'],                        // add artpop (art pop/fluxwork)
  'Casino Versus Japan':  ['ambient', 'dnb', 'idm'],                              // drop triphop, add dnb (drill and bass)
  'Caspian':              ['altrock', 'ambient', 'electronica'],                   // drop idm (post-rock)
  'Christ.':              ['ambient', 'idm'],                                      // drop triphop, add ambient (ambient idm)
  'Dark Dark Dark':       ['folk'],                                                // drop idm (chamber folk only)
  'Dean Blunt':           ['electronica', 'idm', 'techno'],                       // drop artpop, add electronica+techno
  'Do Make Say Think':    ['altrock', 'ambient'],                                  // drop idm (post-rock → altrock)
  'Drexciya':             ['idm', 'jazz', 'techno'],                              // add jazz (detroit techno/afrofuturism)
  'Dylan Henner':         ['ambient', 'idm'],                                      // drop classical
  'Ex-Easter Island Head':['idm'],                                                 // drop classical (experimental psych only)
  'Fatima Al Qadiri':     ['electronica', 'idm', 'techno'],                       // drop dnb, add electronica+techno
  'Felicia Atkinson':     ['ambient', 'idm', 'techno'],                           // add techno (electroacoustic/mandible)
  'Fennesz':              ['ambient', 'idm', 'techno'],                           // add techno (glitch ambient)
  'Flying Lotus':         ['electronica', 'idm', 'jazz'],                         // drop triphop, add electronica+jazz
  'Hand Habits':          ['artpop', 'indiepop'],                                  // drop idm (bedroom pop/chamber pop)
  'Hype Williams':        ['artpop', 'techno'],                                    // drop triphop+idm; hypnagogic pop/outsider house
  'Inga Copeland':        ['artpop', 'idm', 'techno'],                            // add techno (outsider house/gauze pop)
  'Jan Jelinek':          ['ambient', 'idm', 'techno'],                           // add techno (microhouse/glitch)
  'Joker':                ['dnb', 'electronica', 'idm', 'techno'],                // add electronica+techno (wonky/dubstep)
  'Kode9':                ['dnb', 'electronica', 'idm', 'techno'],                // add electronica+techno (footwork/dubstep)
  'Loraine James':        ['electronica', 'idm', 'techno'],                       // add electronica (deconstructed club)
  'Lusine ICL':           ['ambient', 'electronica', 'idm', 'techno'],            // add electronica
  'Modern Nature':        ['ambient', 'folk', 'idm'],                             // drop jazz, add ambient+folk (experimental folk/pastoral)
  'Monolake':             ['ambient', 'idm', 'techno'],                           // add ambient (dub techno/ambient)
  'Oneohtrix Point Never':['ambient', 'artpop', 'electronica', 'idm'],           // add artpop+electronica
  'Red Sparowes':         ['altrock', 'ambient'],                                  // drop idm (post-rock/post-metal)
  'Ryoji Ikeda':          ['idm'],                                                 // drop industrial (glitch/microsound)
  'Samiyam':              ['electronica', 'idm'],                                  // drop triphop, add electronica (wonky/glitch)
  'SOPHIE':               ['artpop', 'idm'],                                       // drop industrial, add artpop (hyperpop/deconstructed)
  'Steve Hauschildt':     ['ambient', 'idm', 'techno'],                           // add techno (ambient techno)
  'The American Dollar':  ['altrock', 'ambient'],                                  // drop idm (post-rock)
  'The Black Dog':        ['ambient', 'idm', 'techno'],                           // add ambient (ambient techno)
  'Tristan Arp':          ['idm'],                                                 // drop electronica (experimental electronic only)
  'Ulrich Schnauss':      ['altrock', 'ambient', 'electronica', 'idm', 'indiepop', 'techno'], // shoegaze+electronic
  'more eaze & claire rousay': ['ambient', 'idm'],                               // drop techno (spectra/experimental)

  // Wrong EN matches — leave unchanged
  'Carrier':              null,
  'Chuck Person':         null,
  'Elysia Crampton':      null,
  'Fripp & Eno':          null,
  'Luke Sanger':          null,
  'Merely & Malibu':      null,
  'Mouse on Mars':        null,
  'Big Brave':            null,

  // ── INDUSTRIAL ────────────────────────────────────────────────────────────

  'Cabaret Voltaire':     ['darkwave', 'idm', 'industrial', 'techno'],            // add idm+techno (proto-techno/post-punk)
  'Chrome':               ['altrock', 'darkwave', 'idm', 'industrial'],            // add altrock+idm (synth punk/noise rock)
  'Flowdan':              ['dnb'],                                                  // drop industrial (grime only)
  'King Midas Sound':     ['triphop'],                                              // drop industrial (dub metal only)
  'Lustmord':             ['ambient', 'industrial', 'jazz'],                       // add jazz (dark jazz/ritual ambient)
  'Merzbow':              ['ambient', 'altrock', 'idm', 'industrial'],            // add ambient+altrock+idm (noise/japanoise)
  'Preoccupations':       ['altrock', 'darkwave', 'indiepop', 'industrial'],      // add darkwave+indiepop (shoegaze/post-punk)
  'Schwefelgelb':         ['darkwave', 'idm', 'industrial', 'techno'],            // add idm (modern ebm)
  'Severed Heads':        ['ambient', 'darkwave', 'idm', 'industrial'],           // add ambient (ambient industrial)
  'Skinny Puppy':         ['darkwave', 'industrial'],                               // add darkwave (gothic rock/electro-industrial)
  'Terence Fixmer':       ['darkwave', 'industrial', 'techno', 'triphop'],        // add triphop (minimal dub)
  'The Bug':              ['dnb', 'triphop'],                                       // drop industrial, add triphop (illbient/dub)
  'Throbbing Gristle':    ['darkwave', 'idm', 'industrial'],                      // add darkwave+idm (post-punk/experimental)
  'Zoviet France':        ['ambient', 'idm', 'industrial'],                        // add idm (ambient industrial)

  // Wrong EN match — leave unchanged
  'Sluagh Ghairm':        null,

  // ── JAZZ ──────────────────────────────────────────────────────────────────

  'Anthony Braxton':      ['classical', 'jazz'],                                   // add classical (african-american classical confirmed by EN)
  'Bohren & der Club of Gore': ['ambient', 'jazz'],                               // add ambient (dark jazz + drone)
  'Black Chamber':        ['jazz'],                                                 // drop triphop (dark jazz only)

  // Wrong EN match / confirmed not-found — leave unchanged
  'Deakin':               null,

  // ── TRIPHOP ───────────────────────────────────────────────────────────────

  'DJ Shadow':            ['electronica', 'triphop'],                              // add electronica
  'DJ Spooky':            ['triphop'],                                              // drop idm (illbient only)
  'FKA twigs':            ['artpop', 'idm', 'triphop'],                           // add idm (escape room/experimental r&b)
  'Goldfrapp':            ['altrock', 'artpop', 'darkwave', 'electronica', 'triphop'], // add altrock+artpop+electronica
  'Massive Attack':       ['electronica', 'triphop'],                              // add electronica
  'Morcheeba':            ['electronica', 'triphop'],                              // add electronica
  'Portishead':           ['altrock', 'artpop', 'electronica', 'triphop'],        // add altrock+artpop+electronica
  'Primal Scream':        ['altrock', 'electronica'],                              // drop triphop per EN (britpop/dance rock)
  'Sevdaliza':            ['artpop', 'electronica', 'techno'],                    // drop triphop+idm per EN
  'Tricky':               ['electronica', 'triphop'],                              // add electronica

  // Wrong EN match — leave unchanged
  'Death in Vegas':       null,
  'Somewhere off Jazz Street': null,
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
