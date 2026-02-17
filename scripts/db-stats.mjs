#!/usr/bin/env node
// ── DB Stats: Quick dashboard for Radio Venus musician database ─────────────
//
// Usage:
//   node scripts/db-stats.mjs              # full dashboard
//   node scripts/db-stats.mjs --gaps       # only show underrepresented areas
//   node scripts/db-stats.mjs --anchors    # suggest smart-match anchors for weak signs
//
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'public', 'data', 'musicians.json');
const SEED_PATH = join(__dirname, 'seed-musicians.json');

const db = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const seedNames = new Set(seed.map(a => a.name));

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function calcVenusSign(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const geo = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
    const ecl = Astronomy.Ecliptic(geo);
    return SIGNS[Math.floor(ecl.elon / 30)];
  } catch { return null; }
}

// Enrich seed with computed Venus signs
seed.forEach(a => {
  if (!a.venus?.sign && a.birthDate) {
    const sign = calcVenusSign(a.birthDate);
    if (sign) a.venus = { sign };
  }
});

const args = process.argv.slice(2);
const showGaps = args.includes('--gaps');
const showAnchors = args.includes('--anchors');
const showAll = !showGaps && !showAnchors;

// ── Count by sign ───────────────────────────────────────────────────────────

const bySign = {};
const bySignSeed = {};
const bySignGenre = {}; // sign → genre → count (seed only)
SIGNS.forEach(s => { bySign[s] = 0; bySignSeed[s] = 0; bySignGenre[s] = {}; });

db.forEach(a => {
  const sign = a.venus?.sign;
  if (sign) bySign[sign]++;
});

seed.forEach(a => {
  const sign = a.venus?.sign;
  if (sign) {
    bySignSeed[sign]++;
    (a.genres || []).forEach(g => {
      bySignGenre[sign][g] = (bySignGenre[sign][g] || 0) + 1;
    });
  }
});

// ── Count by genre ──────────────────────────────────────────────────────────

const GENRE_LABELS = {
  ambient: 'Ambient / Drone',
  techno: 'Techno / House',
  idm: 'IDM / Experimental',
  industrial: 'Industrial / Noise',
  darkwave: 'Synthwave / Darkwave',
  triphop: 'Trip-Hop / Downtempo',
  dnb: 'Drum & Bass / Jungle',
  classical: 'Classical / Orchestral',
  artpop: 'Art Pop',
  jazz: 'Jazz',
};

const byGenre = {};
const byGenreSeed = {};
Object.keys(GENRE_LABELS).forEach(g => { byGenre[g] = 0; byGenreSeed[g] = 0; });

db.forEach(a => (a.genres || []).forEach(g => { byGenre[g] = (byGenre[g] || 0) + 1; }));
seed.forEach(a => (a.genres || []).forEach(g => { byGenreSeed[g] = (byGenreSeed[g] || 0) + 1; }));

// ── YouTube coverage ────────────────────────────────────────────────────────

const hasVideo = db.filter(a => a.youtubeVideoId).length;
const hasBackup = db.filter(a => a.backupVideoIds?.length > 0).length;
const noBackupSeed = seed.filter(a => !a.backupVideoIds?.length).map(a => a.name);

// ── Output ──────────────────────────────────────────────────────────────────

function bar(val, max, width = 30) {
  const filled = Math.round((val / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

if (showAll || showGaps) {
  const totalDb = db.length;
  const totalSeed = seed.length;
  const totalWikidata = totalDb - totalSeed;

  console.log(`\n  ╔══════════════════════════════════════════════════╗`);
  console.log(`  ║  RADIO VENUS DATABASE  ·  ${totalDb} musicians            ║`);
  console.log(`  ║  Seed: ${totalSeed}  ·  Wikidata: ${totalWikidata}  ·  Videos: ${hasVideo}/${totalDb}   ║`);
  console.log(`  ║  Backups: ${hasBackup}/${totalDb}                                ║`);
  console.log(`  ╚══════════════════════════════════════════════════╝\n`);
}

if (showAll) {
  // Sign distribution
  const maxSign = Math.max(...Object.values(bySign));
  console.log('  VENUS SIGN DISTRIBUTION (total / seed)');
  console.log('  ' + '─'.repeat(58));
  SIGNS.forEach(sign => {
    const total = bySign[sign];
    const seedCount = bySignSeed[sign];
    const pct = ((seedCount / seed.length) * 100).toFixed(1);
    const label = `  ${sign.padEnd(12)} ${bar(total, maxSign, 25)} ${String(total).padStart(3)} (${String(seedCount).padStart(3)} seed · ${pct}%)`;
    console.log(label);
  });

  // Genre distribution
  console.log('\n  GENRE DISTRIBUTION (total / seed)');
  console.log('  ' + '─'.repeat(58));
  const maxGenre = Math.max(...Object.values(byGenre));
  Object.entries(byGenre)
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, total]) => {
      const seedCount = byGenreSeed[g] || 0;
      const label = `  ${(GENRE_LABELS[g] || g).padEnd(22)} ${bar(total, maxGenre, 20)} ${String(total).padStart(3)} (${String(seedCount).padStart(3)} seed)`;
      console.log(label);
    });
}

if (showAll || showGaps) {
  // Gaps: sign × genre matrix for seed artists
  const avgPerSign = seed.length / 12;
  const weakSigns = SIGNS.filter(s => bySignSeed[s] < avgPerSign * 0.75);

  if (weakSigns.length) {
    console.log('\n  ⚠  UNDERREPRESENTED SIGNS (seed < 75% of average)');
    console.log('  ' + '─'.repeat(58));
    weakSigns
      .sort((a, b) => bySignSeed[a] - bySignSeed[b])
      .forEach(sign => {
        const genres = bySignGenre[sign];
        const genreStr = Object.entries(genres)
          .sort((a, b) => b[1] - a[1])
          .map(([g, c]) => `${g}:${c}`)
          .join('  ');
        console.log(`  ${sign.padEnd(12)} ${bySignSeed[sign]} seed artists  │  ${genreStr}`);
      });
  }

  // Genre gaps
  const avgPerGenre = Object.values(byGenreSeed).reduce((a, b) => a + b, 0) / Object.keys(byGenreSeed).length;
  const weakGenres = Object.entries(byGenreSeed)
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
  // Find seed artists in underrepresented signs — good smart-match anchors
  const avgPerSign = seed.length / 12;
  const weakSigns = SIGNS.filter(s => bySignSeed[s] < avgPerSign * 0.75);

  console.log('\n  SMART-MATCH ANCHORS FOR UNDERREPRESENTED SIGNS');
  console.log('  Run these to expand weak Venus sign coverage via Last.fm similarity:\n');

  weakSigns
    .sort((a, b) => bySignSeed[a] - bySignSeed[b])
    .forEach(sign => {
      const anchors = seed
        .filter(a => a.venus?.sign === sign)
        .filter(a => !['classical'].some(g => a.genres?.includes(g) && a.genres.length === 1))
        .slice(0, 8);

      console.log(`  ♀ ${sign} (${bySignSeed[sign]} seed artists)`);
      anchors.forEach(a => {
        const genres = (a.genres || []).join(', ');
        console.log(`    node scripts/smart-match.mjs "${a.name}" --depth 2`);
      });
      console.log();
    });
}

console.log();
