#!/usr/bin/env node
// One-time patch: apply ambient genre corrections from Everynoise verification.
// Preserves artists confirmed by user (Boards of Canada, Burial, Laurel Halo, etc.)
// and skips artists already fixed by previous patches.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const seedPath = join(__dirname, 'seed-musicians.json');
const dbPath   = join(__dirname, '../public/data/musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
const db   = JSON.parse(readFileSync(dbPath, 'utf-8'));

// ── Protected artists: keep as-is (user decisions or genuinely ambient) ────────
// null = skip entirely
const MANUAL = {
  // Genuinely ambient — EN misses this (electronic ambient artists)
  'Boards of Canada':  null,   // quintessential ambient IDM
  'Burial':            null,   // dark/atmospheric, keep ambient
  'Biosphere':         null,   // pure ambient, EN empty
  'Stars of the Lid':  null,   // drone/ambient, EN empty
  'Ólafur Arnalds':    null,   // ambient/neoclassical, EN empty
  'Vangelis':          null,   // ambient/classical, EN empty
  'Jónsi':             null,   // post-rock/ambient, EN empty
  'Emerald Web':       null,   // new age/ambient, EN empty
  'Mark McGuire':      null,   // psych drone ambient, EN empty
  'Casino Versus Japan': null, // ambient IDM (Kranky), EN wrong
  'Ana Roxanne':       null,   // ambient/classical, keep ambient
  'Alessandro Cortini': null,  // industrial ambient, keep industrial
  // Previously set by user in darkwave/techno patches
  'Laurel Halo':       null,
  'Gidge':             null,
  'Love Spirals Downwards': null,
  'Julee Cruise':      null,
  'Rafael Toral':      null,
  'Purelink':          null,
  // Already fixed by previous patches (no ambient in current state)
  'Blanck Mass':       null,
  'Mogwai':            null,
  'Anna von Hausswolff': null,
  'Lycia':             null,
  'Dead Can Dance':    null,
  'Cocteau Twins':     null,
  'Popol Vuh':         null,
  // EN empty — can't trust
  'Alex Somers':       null,
  'Amiina':            null,
  'Ariel Kalma':       null,
  'Astrid Sonne':      null,
  'Avril23':           null,
  'Bel Canto':         null,
  'Ben Frost':         null,
  'Bianca Scout':      null,
  'Big Brave':         null,
  'Björk':             null,
  'Black Tape for a Blue Girl': null,
  'Blue Lake':         null,
  'Boom Bip':          null,
  'Bradley Strider':   null,
  'Caustic Window':    null,
  'Children of Alice': null,
  'Claire Rousay':     null,
  'Croatian Amor':     null,
  'Dale Cooper Quartet & The Dictaphones': null,
  'David Casper':      null,
  'Deakin':            null,
  'Dj Lostboi':        null,
  'Do Make Say Think': null,
  'Domenique Dumont':  null,
  'Don Slepian':       null,
  'Elysia Crampton':   null,
  'Erik Wøllo':        null,
  'Explosions in the Sky': null,
  'flat7':             null,
  'Fripp & Eno':       null,
  'God Is an Astronaut': null,
  'Harold Budd, Simon Raymonde, Robin Guthrie & Elizabeth Fraser': null,
  'Harold Budd/Brian Eno': null,
  'Hollie Kenniff':    null,
  'Howlround':         null,
  'Iasos':             null,
  'James K':           null,
  'Jenny Hval':        null,
  'Jo Johnson':        null,
  'Joe Westerlund':    null,
  'John Carpenter':    null,
  'Kali Malone':       null,
  'Kara-Lis Coverdale': null,
  'Kiasmos':           null,
  'Lino Capra Vaccina': null,
  'Lucrecia Dalt':     null,
  'Luke Sanger':       null,
  'Luke Wyland':       null,
  'Lusine ICL':        null,
  'Marissa Nadler & Stephen Brodsky': null,
  'Martin L. Gore':    null,
  'Merely & Malibu':   null,
  'Mica Levi':         null,
  'Midori Takada':     null,
  'ML Buch':           null,
  'Mono':              null,
  'more eaze & claire rousay': null,
  'more eaze & kaho matsui': null,
  'MORI MORI':         null,
  'Mort Garson':       null,
  'múm':               null,
  'Nala Sinephro':     null,
  'Neil Scrivin':      null,
  'Off The Sky':       null,
  'Oklou':             null,
  'Patricia Wolf':     null,
  'Pauline Anna Strom': null,
  'Peter Davison':     null,
  'Pink Must':         null,
  'Public Memory':     null,
  'quit life':         null,
  'Random Forest':     null,
  'Robin Guthrie & Harold Budd': null,
  'Ryuichi Sakamoto':  null,
  'Samuel Organ':      null,
  'Saxon Shore':       null,
  'SKY H1':            null,
  'Somewhere off Jazz Street': null,
  'Soul Whirling Somewhere': null,
  'Steve Everitt':     null,
  'Steven Halpern':    null,
  'Stéphane Picq':     null,
  'Sunn O)))':         null,
  'Susumu Yokota':     null,
  'The American Dollar': null,
  'The End of the Ocean': null,
  'The Six Parts Seven': null,
  'Tristeza':          null,
  'Ulla':              null,
  'Whatever The Weather': null,
  'yawning portal':    null,
  'Zoviet France':     null,
  // Shoegaze: add altrock (manual decision, not from EN)
  'Slowdive':          ['altrock', 'indiepop'],
};

// ── EN-derived corrections ─────────────────────────────────────────────────────
const EN_DERIVED = {
  // EN correctly drops ambient (not ambient artists, tagged by noise)
  '7038634357':        ['idm', 'techno'],
  'Autumn\'s Grey Solace': ['artpop', 'darkwave', 'indiepop'],
  'Benoît Pioulard':   ['ambient', 'indiepop', 'artpop'],
  'Bitchin Bajas':     ['folk', 'ambient'],
  'Bochum Welt':       ['techno', 'idm', 'dnb'],
  'Bonobo':            ['triphop', 'electronica', 'jazz'],
  'Colleen':           ['electronica', 'folk', 'artpop'],
  'Constance Demby':   ['ambient'],
  'Demdike Stare':     ['ambient', 'techno', 'idm'],
  'Doon Kanda':        ['idm'],
  'E Ruscha V':        ['electronica', 'techno'],
  'Eartheater':        ['artpop', 'idm'],
  'Elori Saxl':        ['ambient', 'classical', 'idm', 'folk'],
  'Emma Ruth Rundle':  ['folk', 'industrial', 'indiepop', 'artpop'],
  'Ex-Easter Island Head': ['idm'],
  'Fhloston Paradigm': ['techno', 'jazz'],
  'Fleeting Joys':     ['indiepop', 'artpop'],
  'Funki Porcini':     ['jazz', 'triphop'],
  'Gnod':              ['industrial'],
  'Green-House':       ['ambient'],
  'Hammock':           ['ambient'],
  'Heather Woods Broderick': ['folk', 'ambient'],
  'Helios':            ['ambient'],
  'Holly Herndon':     ['folk', 'industrial', 'idm', 'artpop'],
  'Isabel\'s Dream':   ['indiepop', 'artpop'],
  'James Ferraro':     ['artpop', 'idm'],
  'Jean-Michel Jarre': ['electronica', 'techno', 'classical'],
  'Jefre Cantu-Ledesma': ['ambient', 'folk'],
  'Joel Fausto & Illusion Orchestra': ['jazz'],
  'Jonny Nash':        ['ambient', 'idm'],
  'Joseph Shabason':   ['ambient', 'idm'],
  'Josiah Steinbrick': ['ambient', 'idm'],
  'Julia Holter':      ['artpop'],
  'Kane Ikin':         ['idm'],
  'Klein':             ['electronica', 'techno', 'idm', 'jazz'],
  'Laraaji':           ['ambient'],
  'Laurie Spiegel':    ['ambient', 'classical', 'techno'],
  'Lawrence English':  ['ambient', 'idm'],
  'Love Cult':         ['electronica', 'techno', 'idm'],
  'LTJ Bukem':         ['triphop', 'jazz', 'dnb'],
  'Lucinda Chua':      ['artpop'],
  'M. Sage':           ['folk', 'ambient'],
  'Mabe Fratti':       ['idm', 'ambient'],
  'Manet':             ['jazz'],
  'Mechatok':          ['dnb', 'idm'],
  'Michael Stearns':   ['ambient'],
  'Midwife':           ['idm', 'indiepop', 'artpop'],
  'Milan W.':          ['idm'],
  'Miles Tilmann':     ['idm'],
  'More Eaze':         ['idm'],
  'Mount Kimbie':      ['dnb', 'electronica', 'idm'],
  'Mulm':              ['ambient'],
  'North Americans':   ['folk', 'ambient'],
  'Organ Tapes':       ['idm', 'dnb'],
  'Rachika Nayar':     ['folk', 'ambient'],
  'Raime':             ['ambient', 'triphop', 'techno'],
  'Rhian Sheehan':     ['ambient', 'electronica', 'techno'],
  'Robin Guthrie':     ['indiepop', 'artpop'],
  'Roly Porter':       ['electronica', 'techno', 'idm'],
  'Satoshi & Makoto':  ['ambient'],
  'Slag Boom Van Loon': ['dnb', 'idm'],
  'Steve Roach':       ['ambient'],
  'Suzanne Ciani':     ['ambient'],
  'Swami LatePlate':   ['jazz'],
  'Szun Waves':        ['jazz'],
  'The Album Leaf':    ['ambient'],
  'The Kilimanjaro Darkjazz Ensemble': ['jazz'],
  'The Lovecraft Sextet': ['jazz'],
  'The Mount Fuji Doomjazz Corporation': ['jazz', 'electronica', 'techno', 'idm'],
  'This Mortal Coil':  ['indiepop', 'artpop', 'darkwave'],
  'This Will Destroy You': ['ambient'],
  'Tim Story':         ['ambient'],
  'Tomaga':            ['industrial'],
  'Trigg & Gusset':    ['jazz'],
  'Tujiko Noriko':     ['ambient'],
  'Tycho':             ['electronica', 'triphop', 'idm'],
  'ultra caro':        ['idm'],
  'Vegyn':             ['idm'],
  'Visible Cloaks':    ['ambient'],
  'yes/and':           ['folk', 'ambient'],
  'yeule':             ['ambient'],
  // EN confirms ambient only (remove excess tags from MusicBrainz noise)
  'A.A. Williams':     ['ambient'],
  'A.R.T. Wilson':     ['ambient'],
  'Abul Mogard':       ['ambient'],
  'Ann Annie':         ['ambient'],
  'Arovane':           ['idm'],       // IDM/glitch primarily, not ambient
  'cLOUDDEAD':         ['idm'],       // experimental hip-hop, not ambient
  'Epic45':            ['ambient'],
  'Howlround':         ['idm'],       // tape music/IDM
  'Kane Ikin':         ['idm'],       // already above
  'Woo':               ['idm'],       // kosmische/IDM, EN says idm
};

const ALL = {
  ...EN_DERIVED,
  ...Object.fromEntries(Object.entries(MANUAL).filter(([, v]) => v !== null)),
};

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
console.log(`\n${changed} seed artists updated. Run build-db.mjs to rebuild.`);
