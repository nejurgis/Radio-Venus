#!/usr/bin/env node
// ── Genre Verifier ────────────────────────────────────────────────────────────
//
// Checks each artist's stored genres against Everynoise and flags discrepancies.
// Runs sequentially to be polite to Everynoise (~13s per artist).
//
// Usage:
//   node scripts/verify-genres.mjs                    # all artists
//   node scripts/verify-genres.mjs --genre=artpop     # filter by stored genre
//   node scripts/verify-genres.mjs --limit=50         # cap run
//   node scripts/verify-genres.mjs --skip=50          # resume after N
//   node scripts/verify-genres.mjs --output=my.json   # custom report file
//
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categorizeGenres } from '../src/genres.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = name => { const a = args.find(a => a.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };

const filterGenre = getArg('genre');
const limit       = parseInt(getArg('limit') || '0');
const skip        = parseInt(getArg('skip')  || '0');
const outputFile  = getArg('output') || join(__dirname, 'genre-report.json');

// ── Load DB ───────────────────────────────────────────────────────────────────
const db = JSON.parse(readFileSync(join(__dirname, '../public/data/musicians.json'), 'utf-8'));

let artists = db.filter(a => a.genres?.length);
if (filterGenre) artists = artists.filter(a => a.genres.includes(filterGenre));
if (skip)        artists = artists.slice(skip);
if (limit)       artists = artists.slice(0, limit);

console.log(`Verifying ${artists.length} artists against Everynoise...`);
if (filterGenre) console.log(`  genre filter: ${filterGenre}`);
if (skip)        console.log(`  resuming from offset ${skip}`);
console.log(`  estimated time: ~${Math.round(artists.length * 13 / 60)} minutes\n`);

// ── Playwright ────────────────────────────────────────────────────────────────
let _browser = null;
async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = await import('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function getEverynoiseGenres(artistName) {
  const browser = await getBrowser();
  let page;
  try {
    page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const url = `https://everynoise.com/research.cgi?name=${encodeURIComponent(artistName)}&mode=artist`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);

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
  ok:       [],   // stored genres fully covered by EN
  missing:  [],   // EN implies genres not in stored (potential additions)
  extra:    [],   // stored has genres EN doesn't support (potential wrong tags)
  notFound: [],   // artist not on Everynoise
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

  if (!enRaw) {
    process.stdout.write('not found\n');
    report.notFound.push({ name: artist.name, stored });
    if ((i + 1) % 10 === 0) saveReport();
    await delay(500);
    continue;
  }

  // Map EN genre strings → our category IDs
  const enCategories = [...new Set(categorizeGenres(enRaw))];

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

  if ((i + 1) % 10 === 0) saveReport();
  await delay(1000);
}

saveReport();

// ── Summary ───────────────────────────────────────────────────────────────────
const total = artists.length;
const notFoundCount = report.notFound.length;
const okCount       = report.ok.length;
const missingCount  = report.missing.length;
const extraCount    = report.extra.length;

console.log('\n════════════════════════════════════════════════════════════');
console.log(`Total checked:     ${total}`);
console.log(`  ✓ Correct:       ${okCount} (${Math.round(okCount/total*100)}%)`);
console.log(`  ⚠ Missing genre: ${missingCount} — EN implies a genre not in stored`);
console.log(`  ? Extra genre:   ${extraCount} — stored genre not confirmed by EN`);
console.log(`  — Not found:     ${notFoundCount} (not on Everynoise)`);
console.log(`\nReport saved to ${outputFile}`);
console.log('Tip: run with --skip=N to resume from where you left off\n');

if (_browser) _browser.close().catch(() => {});
process.exit(0);
