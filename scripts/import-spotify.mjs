#!/usr/bin/env node
// ── import-spotify.mjs ──────────────────────────────────────────────────────
// Imports a Spotify playlist into seed-musicians.json.
//
// Spotify's API (Nov 2023) blocks playlist track access for non-approved apps.
// Export your playlist as CSV via https://exportify.net then pass the file:
//
//   node scripts/import-spotify.mjs playlist.csv
//   node scripts/import-spotify.mjs playlist.csv --dry-run
//
// For each track:
//   - Existing seed artists: marked handpicked:true, handpickedTrack stored
//   - New artists: birth date (Wikidata→MB→Wikipedia) → genres (Everynoise)
//     → YouTube search for the specific song → added with handpicked:true
//
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { categorizeGenres, categorizeSubgenres } from '../src/genres.js';

// ── Load .env ────────────────────────────────────────────────────────────────

const __envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(__envPath)) {
  for (const line of readFileSync(__envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const require = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');
const ytSearch  = require('yt-search');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const csvPath = args.find(a => !a.startsWith('--'));

if (!csvPath || !csvPath.endsWith('.csv')) {
  console.error('Usage: node scripts/import-spotify.mjs <exportify-playlist.csv> [--dry-run]');
  console.error('       Export your playlist at https://exportify.net');
  process.exit(1);
}

// ── Parse Exportify CSV ───────────────────────────────────────────────────────
// Exportify columns: Spotify ID, Artist IDs, Artist Names, Album Name,
//   Track Name, Release Date, Duration (ms), Popularity, Added By, Added At
//
// We only need: Artist Name (col 2, 0-indexed) and Track Name (col 4)

function parseExportifyCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  const tracks = [];

  // Find header row to locate column indices dynamically
  const header = parseCSVRow(lines[0]).map(h => h.toLowerCase().trim());
  const artistCol = header.findIndex(h => h.includes('artist name'));
  const trackCol  = header.findIndex(h => h === 'track name' || h.includes('track name'));

  if (artistCol === -1 || trackCol === -1) {
    throw new Error(`Cannot find Artist Name / Track Name columns in CSV header: ${lines[0]}`);
  }

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCSVRow(line);
    // Exportify joins multiple artists with ";" — take primary artist only
    const artistRaw  = cols[artistCol]?.trim() ?? '';
    const artistName = artistRaw.split(';')[0].trim();
    const trackName  = cols[trackCol]?.trim();
    if (artistName && trackName) tracks.push({ artistName, trackName });
  }
  return tracks;
}

// Minimal RFC 4180 CSV parser (handles quoted fields with embedded commas/newlines)
function parseCSVRow(line) {
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      cols.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

// ── Venus ────────────────────────────────────────────────────────────────────

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
];

function calculateVenus(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const geo = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
  const lon = Astronomy.Ecliptic(geo).elon;
  return SIGNS[Math.floor(lon / 30)];
}

// Normalize incomplete dates: YYYY-00-00 → YYYY-06-15, YYYY-MM-00 → YYYY-MM-15
function normalizeDate(dateStr) {
  let [y, m, d] = dateStr.split('-').map(Number);
  if (!m || m === 0) { m = 6; d = 15; }
  else if (!d || d === 0) { d = 15; }
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function fetchJSON(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'RadioVenus/1.0', 'Accept': 'application/json', ...extraHeaders },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchJSON(res.headers.location, extraHeaders).then(resolve, reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse error (HTTP ${res.statusCode}): ${data.slice(0, 120)}`)); }
      });
    }).on('error', reject);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Everynoise: genre lookup via Playwright (single source of truth) ──────────

let _browser = null;

async function getPlaywrightBrowser() {
  if (_browser) return _browser;
  try {
    const { chromium } = await import('playwright');
    _browser = await chromium.launch({ headless: true });
    return _browser;
  } catch (e) {
    console.error(`  Playwright unavailable: ${e.message}`);
    console.error('  Install with: npx playwright install chromium');
    return null;
  }
}

async function closePlaywright() {
  if (!_browser) return;
  _browser.close().catch(() => {});
  _browser = null;
}

async function getEverynoiseGenres(artistName) {
  const browser = await getPlaywrightBrowser();
  if (!browser) return { genres: [], tags: [] };

  let page;
  try {
    page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const resUrl = `https://everynoise.com/research.cgi?name=${encodeURIComponent(artistName)}&mode=artist`;
    await page.goto(resUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // EN is JS-rendered and slow for niche artists — use waitForSelector, not fixed delay
    await page.waitForSelector('#exact + div', { timeout: 20000 }).catch(() => {});

    const genres = await page.$$eval(
      '#exact + div .note a[href*="mode=genre"]',
      els => els.map(el => el.textContent.trim()).filter(Boolean),
    ).catch(() => []);

    const tagsRaw = await page.$eval(
      '#exact + div span[title="Spotify genre-ish tags"]',
      el => el.textContent.trim(),
    ).catch(() => '');
    const tags = tagsRaw
      ? tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
      : [];

    return { genres, tags };
  } catch (e) {
    console.log(`    EN error: ${e.message.slice(0, 60)}`);
    return { genres: [], tags: [] };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ── YouTube: search for specific track ───────────────────────────────────────

async function searchYouTubeForTrack(artistName, trackName) {
  const queries = [
    `${artistName} ${trackName}`,
    `${artistName} "${trackName}" audio`,
    `${artistName} ${trackName} official audio`,
  ];
  for (const q of queries) {
    try {
      const result = await ytSearch(q);
      const video = result.videos.slice(0, 5).find(v => v.seconds > 60 && v.seconds < 10800);
      if (video) return video.videoId;
    } catch { /* continue */ }
    await delay(300);
  }
  return null;
}

// ── Birth date lookup chain ───────────────────────────────────────────────────

const MUSIC_OCCUPATIONS = [
  'Q639669','Q177220','Q36834','Q183945','Q855091',
  'Q386854','Q488205','Q158852','Q753110','Q584301',
];

async function getWikidataBirthDate(name) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
    `&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json`;
  try {
    const searchData = await fetchJSON(searchUrl);
    if (!searchData.search?.length) return null;

    for (const result of searchData.search) {
      await delay(100);
      const entityData = await fetchJSON(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&props=claims&format=json`
      );
      const entity = entityData.entities?.[result.id];
      if (!entity?.claims) continue;

      const occupations = (entity.claims.P106 ?? []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const instances   = (entity.claims.P31  ?? []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

      const isMusician     = occupations.some(id => MUSIC_OCCUPATIONS.includes(id));
      const isMusicalGroup = instances.some(id => ['Q215380','Q5741069'].includes(id));
      const isHuman        = instances.includes('Q5');
      if (!isMusicalGroup && !(isHuman && isMusician)) continue;

      const dateClaim = entity.claims.P569?.[0] ?? entity.claims.P571?.[0];
      const dateValue = dateClaim?.mainsnak?.datavalue?.value?.time;
      if (!dateValue) continue;
      const m = dateValue.match(/([+-]?\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      return normalizeDate(m[1].replace(/^\+/, ''));
    }
  } catch { /* fall through */ }
  return null;
}

async function getMusicBrainzBirthDate(name) {
  try {
    const data = await fetchJSON(
      `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json`
    );
    if (!data.artists?.length) return null;
    const match =
      data.artists.find(a => a.type === 'Person' && a['life-span']?.begin) ||
      data.artists.find(a => a.type === 'Group'  && a['life-span']?.begin);
    if (!match) return null;
    const b = match['life-span'].begin;
    let dateStr;
    if (b.length === 10) dateStr = b;
    else if (b.length === 7) dateStr = `${b}-15`;
    else if (b.length === 4) dateStr = `${b}-06-15`;
    else return null;
    dateStr = normalizeDate(dateStr);
    const year = parseInt(dateStr);
    if (year < 1600 || year > new Date().getFullYear()) return null;
    return { date: dateStr, mbid: match.id };
  } catch { return null; }
}

async function getWikipediaBirthDate(name) {
  for (const title of [name, `${name} (musician)`, `${name} (band)`]) {
    try {
      const data = await fetchJSON(
        `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content` +
        `&rvsection=0&titles=${encodeURIComponent(title)}&format=json&redirects=1`
      );
      const pages  = data.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') continue;
      const content = pages[pageId].revisions?.[0]?.['*'];
      if (!content) continue;
      const t = content.match(/\{\{[Bb]irth date(?:\s+and\s+age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})/);
      if (t) return `${t[1]}-${t[2].padStart(2,'0')}-${t[3].padStart(2,'0')}`;
      const iso = content.match(/(?:born|birth_date)[^}]*?(\d{4}-\d{2}-\d{2})/);
      if (iso) return iso[1];
    } catch { continue; }
  }
  return null;
}

async function getBirthDate(name) {
  const wd = await getWikidataBirthDate(name);
  if (wd) return { date: wd, mbid: null };

  await delay(1000);
  const mb = await getMusicBrainzBirthDate(name);
  if (mb) return mb;

  const wp = await getWikipediaBirthDate(name);
  if (wp) return { date: wp, mbid: null };

  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSpotify → seed importer`);
  console.log(`CSV: ${csvPath}`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  // Parse Exportify CSV
  const csvText = readFileSync(csvPath, 'utf-8');
  const tracks = parseExportifyCSV(csvText);
  console.log(`${tracks.length} tracks in CSV`);

  // Deduplicate by artist — keep first occurrence per artist
  const seen = new Map();
  for (const t of tracks) {
    const key = t.artistName.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  const artists = [...seen.values()];
  console.log(`${artists.length} unique artists\n`);

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const seedByName = new Map(seed.map(a => [a.name.toLowerCase(), a]));

  const results = { updated: [], added: [], skipped: [] };

  for (let i = 0; i < artists.length; i++) {
    const { artistName, trackName } = artists[i];
    const key = artistName.toLowerCase();
    console.log(`[${i + 1}/${artists.length}] ${artistName} — "${trackName}"`);

    // ── Already in seed ───────────────────────────────────────────────────
    if (seedByName.has(key)) {
      const entry = seedByName.get(key);
      const changes = [];
      if (!entry.handpicked)      { entry.handpicked = true;           changes.push('handpicked=true'); }
      if (!entry.handpickedTrack) { entry.handpickedTrack = trackName; changes.push(`track="${trackName}"`); }
      if (changes.length) {
        console.log(`  ✓ existing — ${changes.join(', ')}`);
        results.updated.push(artistName);
      } else {
        console.log(`  ✓ existing — already handpicked`);
        results.skipped.push(artistName);
      }
      continue;
    }

    // ── New artist ────────────────────────────────────────────────────────

    // 1. Birth date
    process.stdout.write(`  birth date... `);
    const birthResult = await getBirthDate(artistName);
    if (!birthResult) {
      console.log('not found — skipping');
      results.skipped.push(`${artistName} (no birth date)`);
      continue;
    }
    const { date: birthDate, mbid } = birthResult;
    const year = parseInt(birthDate);
    if (year < 1901) {
      console.log(`${birthDate} — too old, skipping`);
      results.skipped.push(`${artistName} (pre-1901: ${birthDate})`);
      continue;
    }
    console.log(birthDate);

    // 2. Genres from Everynoise (source of truth — same as smart-match + verify-genres)
    process.stdout.write(`  Everynoise... `);
    const { genres: enGenres, tags: enTags } = await getEverynoiseGenres(artistName);
    // Prefer micro-tags for categorization (more granular); fall back to linked genre names
    const rawTags   = enTags.length ? enTags : enGenres;
    const genres    = categorizeGenres(rawTags);
    const subgenres = categorizeSubgenres(rawTags);
    if (rawTags.length)
      console.log(`[${genres.join(', ')}] ← ${rawTags.slice(0, 4).join(', ')}`);
    else
      console.log('not found on EN');

    const venus = calculateVenus(birthDate);
    console.log(`  Venus: ${venus}`);

    // 3. YouTube — search for the specific handpicked song
    process.stdout.write(`  YouTube "${trackName}"... `);
    const videoId = await searchYouTubeForTrack(artistName, trackName);
    console.log(videoId ?? 'not found');

    const entry = {
      name: artistName,
      birthDate,
      ...(mbid ? { mbid } : {}),
      genres,
      subgenres,
      ...(rawTags.length ? { enTags: rawTags } : {}),
      youtubeVideoId: videoId ?? '',
      backupVideoIds: [],
      handpicked: true,
      handpickedTrack: trackName,
    };

    const label = genres.length ? `[${genres.join(', ')}]` : '⚠ no genres yet';
    console.log(`  + adding ${label}`);
    results.added.push(genres.length ? artistName : `${artistName} ⚠`);

    if (!DRY_RUN) {
      seed.push(entry);
      seedByName.set(key, entry);
    }

    await delay(500);
  }

  await closePlaywright();

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Updated (existing + handpicked): ${results.updated.length}`);
  if (results.updated.length) results.updated.forEach(n => console.log(`  ${n}`));
  console.log(`Added (new):                     ${results.added.length}`);
  if (results.added.length) results.added.forEach(n => console.log(`  ${n}`));
  console.log(`Skipped:                         ${results.skipped.length}`);
  if (results.skipped.length) results.skipped.forEach(n => console.log(`  ${n}`));

  if (!DRY_RUN && (results.updated.length || results.added.length)) {
    writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
    console.log(`\nWrote ${seed.length} total artists to ${SEED_PATH}`);
    console.log('Run "node scripts/build-db.mjs" to rebuild the database.');
  } else if (DRY_RUN) {
    console.log('\n(dry run — seed not modified)');
  }
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
