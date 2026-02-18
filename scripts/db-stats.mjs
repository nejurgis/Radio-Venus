#!/usr/bin/env node
// ── DB Stats: Quick dashboard for Radio Venus musician database ─────────────
//
// Usage:
//   node scripts/db-stats.mjs              # full dashboard
//   node scripts/db-stats.mjs --gaps       # only show underrepresented areas
//   node scripts/db-stats.mjs --anchors    # suggest smart-match anchors for weak signs
//
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const Astronomy = require('astronomy-engine');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = join(__dirname, 'musicians.db');
const SEED_PATH = join(__dirname, 'seed-musicians.json');

if (!existsSync(DB_PATH)) {
  console.error('musicians.db not found. Run: node scripts/db-import.mjs');
  process.exit(1);
}

const db   = new Database(DB_PATH, { readonly: true });
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// ── Enrich seed with Venus signs (small file, cheap) ────────────────────────

function calcVenusSign(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const geo = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
    const ecl = Astronomy.Ecliptic(geo);
    return SIGNS[Math.floor(ecl.elon / 30)];
  } catch { return null; }
}

seed.forEach(a => {
  if (!a.venus?.sign && a.birthDate) {
    const sign = calcVenusSign(a.birthDate);
    if (sign) a.venus = { sign };
  }
});

const args       = process.argv.slice(2);
const showGaps   = args.includes('--gaps');
const showAnchors = args.includes('--anchors');
const showAll    = !showGaps && !showAnchors;

// ── SQL queries ──────────────────────────────────────────────────────────────

const totalDb   = db.prepare('SELECT count(*) as n FROM musicians').get().n;
const totalSeed = db.prepare('SELECT count(*) as n FROM musicians WHERE is_seed = 1').get().n;
const hasVideo  = db.prepare('SELECT count(*) as n FROM musicians WHERE youtube_id IS NOT NULL').get().n;
const hasBackup = db.prepare("SELECT count(*) as n FROM musicians WHERE json_array_length(backup_ids) > 0").get().n;

// Sign distribution (total)
const signRows = db.prepare(`
  SELECT venus_sign, count(*) as cnt
  FROM musicians WHERE venus_sign IS NOT NULL
  GROUP BY venus_sign
`).all();
const bySign = Object.fromEntries(signRows.map(r => [r.venus_sign, r.cnt]));
SIGNS.forEach(s => { bySign[s] = bySign[s] ?? 0; });

// Sign distribution (seed only — still read from seed file since it's small)
const bySignSeed = {};
const bySignGenre = {};
SIGNS.forEach(s => { bySignSeed[s] = 0; bySignGenre[s] = {}; });
seed.forEach(a => {
  const sign = a.venus?.sign;
  if (sign) {
    bySignSeed[sign] = (bySignSeed[sign] ?? 0) + 1;
    (a.genres || []).forEach(g => {
      bySignGenre[sign][g] = (bySignGenre[sign][g] ?? 0) + 1;
    });
  }
});

// Genre distribution (total)
const genreRows = db.prepare(`
  SELECT g.value as genre, count(*) as cnt
  FROM musicians, json_each(musicians.genres) AS g
  GROUP BY g.value ORDER BY cnt DESC
`).all();
const byGenre = Object.fromEntries(genreRows.map(r => [r.genre, r.cnt]));

// Genre distribution (seed)
const byGenreSeed = {};
seed.forEach(a => (a.genres || []).forEach(g => {
  byGenreSeed[g] = (byGenreSeed[g] ?? 0) + 1;
}));

// ── Output ──────────────────────────────────────────────────────────────────

const GENRE_LABELS = {
  ambient:   'Ambient / Drone',
  techno:    'Techno / House',
  idm:       'IDM / Experimental',
  industrial:'Industrial / Noise',
  darkwave:  'Synthwave / Darkwave',
  triphop:   'Trip-Hop / Downtempo',
  dnb:       'Drum & Bass / Jungle',
  classical: 'Classical / Orchestral',
  artpop:    'Art Pop',
  jazz:      'Jazz',
};

function bar(val, max, width = 30) {
  const filled = Math.round((val / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

if (showAll || showGaps) {
  const totalWikidata = totalDb - totalSeed;
  console.log(`\n  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║  RADIO VENUS DATABASE  ·  ${totalDb} musicians            ║`);
  console.log(`  ║  Seed: ${totalSeed}  ·  Wikidata: ${totalWikidata}  ·  Videos: ${hasVideo}/${totalDb}   ║`);
  console.log(`  ║  Backups: ${hasBackup}/${totalDb}                                ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝\n`);
}

if (showAll) {
  const maxSign = Math.max(...Object.values(bySign));
  console.log('  VENUS SIGN DISTRIBUTION (total / seed)');
  console.log('  ' + '─'.repeat(58));
  SIGNS.forEach(sign => {
    const total     = bySign[sign] ?? 0;
    const seedCount = bySignSeed[sign] ?? 0;
    const pct       = ((seedCount / seed.length) * 100).toFixed(1);
    console.log(`  ${sign.padEnd(12)} ${bar(total, maxSign, 25)} ${String(total).padStart(3)} (${String(seedCount).padStart(3)} seed · ${pct}%)`);
  });

  console.log('\n  GENRE DISTRIBUTION (total / seed)');
  console.log('  ' + '─'.repeat(58));
  const maxGenre = Math.max(...Object.values(byGenre));
  Object.entries(byGenre).sort((a, b) => b[1] - a[1]).forEach(([g, total]) => {
    const seedCount = byGenreSeed[g] ?? 0;
    console.log(`  ${(GENRE_LABELS[g] || g).padEnd(22)} ${bar(total, maxGenre, 20)} ${String(total).padStart(3)} (${String(seedCount).padStart(3)} seed)`);
  });
}

if (showAll || showGaps) {
  const avgPerSign = seed.length / 12;
  const weakSigns  = SIGNS.filter(s => (bySignSeed[s] ?? 0) < avgPerSign * 0.75);

  if (weakSigns.length) {
    console.log('\n  ⚠  UNDERREPRESENTED SIGNS (seed < 75% of average)');
    console.log('  ' + '─'.repeat(58));
    weakSigns.sort((a, b) => (bySignSeed[a] ?? 0) - (bySignSeed[b] ?? 0)).forEach(sign => {
      const genreStr = Object.entries(bySignGenre[sign] ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([g, c]) => `${g}:${c}`).join('  ');
      console.log(`  ${sign.padEnd(12)} ${bySignSeed[sign] ?? 0} seed artists  │  ${genreStr}`);
    });
  }

  const avgPerGenre = Object.values(byGenreSeed).reduce((a, b) => a + b, 0) / Object.keys(byGenreSeed).length;
  const weakGenres  = Object.entries(byGenreSeed)
    .filter(([, c]) => c < avgPerGenre * 0.5)
    .sort((a, b) => a[1] - b[1]);

  if (weakGenres.length) {
    console.log('\n  ⚠  UNDERREPRESENTED GENRES (seed < 50% of average)');
    console.log('  ' + '─'.repeat(58));
    weakGenres.forEach(([g, c]) => {
      console.log(`  ${(GENRE_LABELS[g] || g).padEnd(22)} ${c} seed artists`);
    });
  }
}

if (showAnchors) {
  const avgPerSign = seed.length / 12;
  const weakSigns  = SIGNS.filter(s => (bySignSeed[s] ?? 0) < avgPerSign * 0.75);

  console.log('\n  SMART-MATCH ANCHORS FOR UNDERREPRESENTED SIGNS');
  console.log('  Run these to expand weak Venus sign coverage via Last.fm similarity:\n');

  weakSigns.sort((a, b) => (bySignSeed[a] ?? 0) - (bySignSeed[b] ?? 0)).forEach(sign => {
    const anchors = seed
      .filter(a => a.venus?.sign === sign)
      .filter(a => !(['classical'].every(g => a.genres?.includes(g)) && a.genres?.length === 1))
      .slice(0, 8);
    console.log(`  ♀ ${sign} (${bySignSeed[sign] ?? 0} seed artists)`);
    anchors.forEach(a => console.log(`    node scripts/smart-match.mjs "${a.name}" --depth 2`));
    console.log();
  });
}

console.log();
db.close();
