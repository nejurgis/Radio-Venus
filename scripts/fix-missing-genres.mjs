#!/usr/bin/env node
// fix-missing-genres.mjs
//
// For artists with empty genres: looks them up in a CSV (Exportify format),
// gets their Spotify track ID → scrapes Spotify track page for artist ID →
// hits everynoise.com/artistprofile.cgi?id=[artistId] directly.
//
// Usage:
//   node scripts/fix-missing-genres.mjs data/deep-voices-2025.csv
//   node scripts/fix-missing-genres.mjs data/deep-voices-2025.csv --dry-run
//   node scripts/fix-missing-genres.mjs data/deep-voices-2025.csv --limit=10

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const dryRun  = args.includes('--dry-run');
const limit   = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

if (!csvPath) {
  console.error('Usage: node scripts/fix-missing-genres.mjs <csv-path> [--dry-run] [--limit=N]');
  process.exit(1);
}

const seedPath = join(__dirname, 'seed-musicians.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

// ── 1. Find no-genre artists ─────────────────────────────────────────────────
const noGenre = seed.filter(a => !a.genres?.length);
console.log(`Artists with no genres: ${noGenre.length}`);

// ── 2. Build CSV map: artist name (lower) → trackId ─────────────────────────
const csvRaw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const csvLines = csvRaw.split(/\r?\n/).filter(l => l.trim());

// Parse one CSV line into columns (handles quoted fields)
function parseCsvLine(line) {
  const cols = [];
  let inQ = false, val = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { cols.push(val); val = ''; continue; }
    val += c;
  }
  cols.push(val);
  return cols;
}

const header = parseCsvLine(csvLines[0]);
const trackUriIdx   = header.indexOf('Track URI');
const artistNameIdx = header.indexOf('Artist Name(s)');

if (trackUriIdx === -1 || artistNameIdx === -1) {
  console.error('CSV missing expected columns: Track URI, Artist Name(s)');
  process.exit(1);
}

// Map: artist name variants → trackId
const csvMap = new Map(); // lowercase artist name → spotify track id
for (const line of csvLines.slice(1)) {
  const cols = parseCsvLine(line);
  const uri  = cols[trackUriIdx]?.trim();
  const artists = cols[artistNameIdx]?.trim();
  if (!uri || !artists) continue;
  const trackId = uri.replace('spotify:track:', '');
  for (const name of artists.split(';')) {
    csvMap.set(name.trim().toLowerCase(), trackId);
  }
}

// Match no-genre artists against CSV
const toProcess = [];
for (const artist of noGenre) {
  const trackId = csvMap.get(artist.name.toLowerCase());
  if (trackId) toProcess.push({ artist, trackId });
  else console.log(`  [no CSV match] ${artist.name}`);
}

console.log(`Matched ${toProcess.length} no-genre artists in CSV`);

const batch = limit > 0 ? toProcess.slice(0, limit) : toProcess;

if (dryRun) {
  console.log('\nDry run — would process:');
  batch.forEach(({ artist, trackId }) => console.log(`  ${artist.name} (track: ${trackId})`));
  process.exit(0);
}

// ── 3. Playwright: Spotify → artist ID → EN artist profile ──────────────────
const browser = await chromium.launch({ headless: true });
const results = []; // { name, enTags }

async function getArtistIdFromTrack(page, trackId) {
  // Try embed page first — simpler HTML, no login wall
  for (const url of [
    `https://open.spotify.com/embed/track/${trackId}`,
    `https://open.spotify.com/track/${trackId}`,
  ]) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      // Try to find artist link in rendered HTML
      const href = await page.$eval(
        'a[href*="/artist/"]',
        a => a.getAttribute('href'),
      ).catch(() => null);
      if (href) {
        const m = href.match(/\/artist\/([A-Za-z0-9]+)/);
        if (m) return m[1];
      }
      // Fallback: scan full page HTML for artist ID pattern
      const html = await page.content();
      const m = html.match(/"https:\/\/open\.spotify\.com\/artist\/([A-Za-z0-9]+)"/);
      if (m) return m[1];
    } catch {
      // try next URL
    }
  }
  return null;
}

async function getGenresFromEN(page, artistId) {
  try {
    const url = `https://everynoise.com/artistprofile.cgi?id=${artistId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Genre links on artist profile page
    let genres = await page.$$eval(
      'a[href*="mode=genre"]',
      els => els.map(a => a.textContent.trim().toLowerCase()).filter(Boolean),
    ).catch(() => []);

    // Spotify genre-ish tags
    const spotifyTags = await page.$eval(
      'span[title="Spotify genre-ish tags"]',
      span => span.textContent.trim()
        .split(',')
        .map(t => t.trim().replace(/^#/, '').trim())
        .filter(Boolean),
    ).catch(() => []);

    genres = [...new Set([...genres, ...spotifyTags])];
    return genres.length > 0 ? genres : null;
  } catch {
    return null;
  }
}

console.log(`\nProcessing ${batch.length} artists...\n`);

for (let i = 0; i < batch.length; i++) {
  const { artist, trackId } = batch[i];
  const page = await browser.newPage();

  try {
    process.stdout.write(`[${i + 1}/${batch.length}] ${artist.name} — `);

    const artistId = await getArtistIdFromTrack(page, trackId);
    if (!artistId) {
      console.log('no artist ID from Spotify');
      continue;
    }

    const enTags = await getGenresFromEN(page, artistId);
    if (!enTags) {
      console.log(`artist ID: ${artistId} — no EN genres`);
      continue;
    }

    console.log(`${enTags.join(', ')}`);
    results.push({ name: artist.name, enTags });
  } finally {
    await page.close().catch(() => {});
  }
}

await browser.close();

// ── 4. Write enTags back to seed ─────────────────────────────────────────────
if (results.length === 0) {
  console.log('\nNo genres found — seed unchanged.');
  process.exit(0);
}

const resultMap = new Map(results.map(r => [r.name, r.enTags]));
let updated = 0;

const newSeed = seed.map(a => {
  if (!resultMap.has(a.name)) return a;
  updated++;
  return { ...a, enTags: resultMap.get(a.name) };
});

writeFileSync(seedPath, JSON.stringify(newSeed, null, 2));
console.log(`\nUpdated ${updated} artists with enTags in seed-musicians.json`);
console.log('Run `node scripts/build-db.mjs` to rebuild musicians.json');
