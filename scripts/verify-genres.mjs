#!/usr/bin/env node
// ── Genre Verifier ────────────────────────────────────────────────────────────
//
// Checks each artist's stored genres against Everynoise and flags discrepancies.
// Runs sequentially to be polite to Everynoise (~13s per artist).
//
// Usage:
//   node scripts/verify-genres.mjs                              # all artists
//   node scripts/verify-genres.mjs --genre=artpop               # filter by stored genre
//   node scripts/verify-genres.mjs --limit=50                   # cap run
//   node scripts/verify-genres.mjs --skip=50                    # resume after N
//   node scripts/verify-genres.mjs --output=my.json             # custom report file
//   node scripts/verify-genres.mjs --seed                       # read seed-musicians.json instead of built musicians.json
//   node scripts/verify-genres.mjs --from-report=prev.json      # re-check only the notFound artists from a previous report
//   node scripts/verify-genres.mjs --save-tags                  # write enTags back to seed-musicians.json for build-db enrichment
//
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizeGenres } from '../src/genres.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = name => { const a = args.find(a => a.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };

const filterGenre  = getArg('genre');
const limit        = parseInt(getArg('limit') || '0');
const skip         = parseInt(getArg('skip')  || '0');
const outputFile   = getArg('output') || join(__dirname, 'genre-report.json');
const useSeed      = args.includes('--seed');
const fromReport   = getArg('from-report');  // re-check notFound artists from a previous report
const saveTags     = args.includes('--save-tags'); // write enTags back to seed for build-db enrichment

// ── Load DB ───────────────────────────────────────────────────────────────────
const dbPath = useSeed
  ? join(__dirname, 'seed-musicians.json')
  : join(__dirname, '../public/data/musicians.json');
const db = JSON.parse(readFileSync(dbPath, 'utf-8'));

// ── Load seed for tag patching (always needed when --save-tags) ───────────────
const seedPath = join(__dirname, 'seed-musicians.json');
let seedData = null;
let seedByName = null;
if (saveTags) {
  seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
  seedByName = new Map(seedData.map(a => [a.name.toLowerCase(), a]));
  console.log(`--save-tags: will write enTags back to ${seedPath}`);
}

let artists = db.filter(a => a.genres?.length);

if (fromReport) {
  // Pull the notFound names from a previous report and re-check only those
  const prev = JSON.parse(readFileSync(fromReport, 'utf-8'));
  const retryNames = new Set((prev.notFound || []).map(e => e.name));
  // For artists not in the DB (collaborations, etc.) synthesise a minimal entry from the report
  const inDb = new Set(db.map(a => a.name));
  const synth = (prev.notFound || [])
    .filter(e => !inDb.has(e.name))
    .map(e => ({ name: e.name, genres: e.stored }));
  artists = [...db.filter(a => retryNames.has(a.name)), ...synth];
  console.log(`Re-checking ${artists.length} notFound artists from ${fromReport}`);
} else {
  if (filterGenre) artists = artists.filter(a => a.genres.includes(filterGenre));
  if (skip)        artists = artists.slice(skip);
  if (limit)       artists = artists.slice(0, limit);
}

console.log(`Verifying ${artists.length} artists against Everynoise...`);
if (filterGenre) console.log(`  genre filter: ${filterGenre}`);
if (skip)        console.log(`  resuming from offset ${skip}`);
console.log(`  estimated time: ~${Math.round(artists.length * 13 / 60)} minutes\n`);

// ── Playwright ────────────────────────────────────────────────────────────────
let _browser = null;
let _browserUseCount = 0;
const BROWSER_RESTART_EVERY = 50; // restart Chromium every N artists to prevent memory/hang buildup

async function getBrowser(forceRestart = false) {
  const { chromium } = await import('playwright');
  if (forceRestart || !_browser) {
    if (_browser) await _browser.close().catch(() => {});
    _browser = await chromium.launch({ headless: true });
    _browserUseCount = 0;
  }
  return _browser;
}

async function getEverynoiseGenres(artistName) {
  if (_browserUseCount > 0 && _browserUseCount % BROWSER_RESTART_EVERY === 0) {
    await getBrowser(true);
  }
  const browser = await getBrowser();
  _browserUseCount++;

  let page;
  // Hard per-artist timeout — prevents a hung page from blocking the whole run
  const ARTIST_TIMEOUT = 60000;
  try {
    page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const url = `https://everynoise.com/research.cgi?name=${encodeURIComponent(artistName)}&mode=artist`;

    await Promise.race([
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('artist timeout')), ARTIST_TIMEOUT)),
    ]);

    // Wait for genre links to actually appear in the DOM (up to 20s) rather than a fixed delay.
    // EN's database is huge and response time varies widely — fixed 8s was too short for many artists.
    const GENRE_SELECTOR = '#exact + div .note a[href*="mode=genre"], .setname + div .note a[href*="mode=genre"]';
    await page.waitForSelector(GENRE_SELECTOR, { timeout: 20000 }).catch(() => {});

    // $$eval passes an array to the callback (unlike $eval which passes a single element)
    // Try exact match section first, then first result section
    let genres = await page.$$eval(
      '#exact + div .note a[href*="mode=genre"]',
      els => els.map(el => el.textContent.trim()).filter(Boolean),
    ).catch(() => []);

    if (genres.length === 0) {
      genres = await page.$$eval(
        '.setname + div .note a[href*="mode=genre"]',
        els => els.map(el => el.textContent.trim()).filter(Boolean),
      ).catch(() => []);
    }

    return genres.length > 0 ? genres : null;
  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Report structure ──────────────────────────────────────────────────────────
const report = {
  meta: { date: new Date().toISOString(), filterGenre, total: artists.length },
  ok:          [],  // stored genres fully covered by EN
  missing:     [],  // EN implies genres not in stored (potential additions)
  extra:       [],  // stored has genres EN doesn't support (potential wrong tags)
  notFound:    [],  // artist not found on Everynoise or wrong-artist match
};

function saveReport() {
  writeFileSync(outputFile, JSON.stringify(report, null, 2));
}

// ── Main loop ─────────────────────────────────────────────────────────────────
for (let i = 0; i < artists.length; i++) {
  const artist = artists[i];
  const stored = artist.genres || [];

  process.stdout.write(`[${skip + i + 1}/${skip + artists.length}] ${artist.name}... `);

  const enRaw = await getEverynoiseGenres(artist.name);

  // Geo-specific genre markers = strong signal we matched the wrong artist —
  // BUT only if those geo tags don't actually categorize to our genres (e.g.
  // "polish classical" is correct for Chopin; "lithuanian pop" for anyone else is noise).
  const GEO_NOISE = /\b(lithuanian|latvian|estonian|ukrainian|polish|czech|slovak|romanian|bulgarian|serbian|croatian|slovenian|nordic|norwegian|swedish|icelandic|finnish|danish|japanese|korean|chinese|oulu|tallinn|riga|vilnius)\b/i;
  const hasGeoNoise = enRaw && enRaw.some(g => GEO_NOISE.test(g));
  const preCategories = hasGeoNoise ? [...new Set(categorizeGenres(enRaw))] : [];
  const hasOverlap    = preCategories.some(c => stored.includes(c));
  const isWrongMatch  = hasGeoNoise && !hasOverlap;

  if (!enRaw || isWrongMatch) {
    const reason = isWrongMatch ? `wrong match (geo tags: ${enRaw.filter(g => GEO_NOISE.test(g)).join(', ')})` : 'not found';
    process.stdout.write(`— ${reason}\n`);
    report.notFound.push({ name: artist.name, stored, reason });
    if ((i + 1) % 10 === 0) saveReport();
    await delay(500);
    continue;
  }

  // Map EN genre strings → our category IDs
  const enCategories = [...new Set(categorizeGenres(enRaw))];

  // If none of EN's genres map to our system, it's likely a wrong-artist match too
  if (enCategories.length === 0 && stored.length > 0) {
    process.stdout.write(`— wrong match (no genre overlap: EN=[${enRaw.slice(0, 3).join(', ')}])\n`);
    report.notFound.push({ name: artist.name, stored, reason: `no genre overlap`, enRaw });
    if ((i + 1) % 10 === 0) saveReport();
    await delay(500);
    continue;
  }

  const missingFromStored = enCategories.filter(c => !stored.includes(c));
  const notSupportedByEN  = stored.filter(c => !enCategories.includes(c));

  const entry = { name: artist.name, stored, enRaw, enCategories, missingFromStored, notSupportedByEN };

  if (missingFromStored.length === 0 && notSupportedByEN.length === 0) {
    process.stdout.write(`✓ [${stored.join(', ')}]\n`);
    report.ok.push(entry);
  } else {
    const flags = [];
    if (missingFromStored.length) flags.push(`+missing:[${missingFromStored.join(', ')}]`);
    if (notSupportedByEN.length)  flags.push(`?extra:[${notSupportedByEN.join(', ')}]`);
    process.stdout.write(`⚠  ${flags.join('  ')} | stored=[${stored.join(', ')}] EN=[${enRaw.slice(0, 4).join(', ')}]\n`);
    if (missingFromStored.length) report.missing.push(entry);
    if (notSupportedByEN.length)  report.extra.push(entry);
  }

  // Save EN tags back to seed entry for build-db subgenre enrichment
  if (saveTags && seedByName) {
    const seedEntry = seedByName.get(artist.name.toLowerCase());
    if (seedEntry) seedEntry.enTags = enRaw;
  }

  if ((i + 1) % 10 === 0) {
    saveReport();
    if (saveTags && seedData) writeFileSync(seedPath, JSON.stringify(seedData, null, 2));
  }
  await delay(1000);
}

saveReport();
if (saveTags && seedData) {
  writeFileSync(seedPath, JSON.stringify(seedData, null, 2));
  console.log(`enTags saved to ${seedPath}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = artists.length;
const notFoundCount = report.notFound.length;
const okCount       = report.ok.length;
const missingCount  = report.missing.length;
const extraCount    = report.extra.length;

console.log('\n════════════════════════════════════════════════════════════');
console.log(`Total checked:     ${total}`);
const wrongMatchCount = report.notFound.filter(e => e.reason).length;
console.log(`  ✓ Correct:       ${okCount} (${Math.round(okCount/total*100)}%)`);
console.log(`  ⚠ Missing genre: ${missingCount} — EN implies a genre not in stored`);
console.log(`  ? Extra genre:   ${extraCount} — stored genre not confirmed by EN`);
console.log(`  — Not found:     ${notFoundCount - wrongMatchCount} (not on Everynoise)`);
console.log(`  ✗ Wrong match:   ${wrongMatchCount} (geo tags or no genre overlap — discarded)`);
console.log(`\nReport saved to ${outputFile}`);
console.log('Tip: run with --skip=N to resume from where you left off\n');

if (_browser) _browser.close().catch(() => {});
process.exit(0);
