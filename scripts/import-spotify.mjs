#!/usr/bin/env node
// ── import-spotify.mjs ──────────────────────────────────────────────────────
// Imports a Spotify playlist into seed-musicians.json.
//
// For each track:
//   - Existing seed artists: marked handpicked:true, handpickedTrack stored
//   - New artists: birth date (Wikidata→MB→Wikipedia) → genres (Everynoise)
//     → YouTube search for the specific song → added with handpicked:true
//
// First run: Spotify OAuth will open in your browser. Add
//   http://localhost:8888/callback
// to the Redirect URIs in your Spotify app's Developer Dashboard.
//
// Usage:
//   node scripts/import-spotify.mjs <playlist-url-or-id>
//   node scripts/import-spotify.mjs 7Ez4E5FuC1mLoCSBwKb8bY --dry-run
//
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
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
const rawArg  = args.find(a => !a.startsWith('--')) ?? '';

const playlistId = rawArg.match(/playlist\/([A-Za-z0-9]+)/)?.[1] ?? rawArg;
if (!playlistId) {
  console.error('Usage: node scripts/import-spotify.mjs <playlist-url-or-id>');
  process.exit(1);
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

function postForm(hostname, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse error: ${data.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Spotify OAuth (PKCE) ─────────────────────────────────────────────────────
// Client credentials can no longer read playlist tracks (Spotify API policy
// Nov 2023). PKCE user auth is required even for public playlists.
// Add http://localhost:8888/callback to your Spotify app's Redirect URIs.

const REDIRECT_URI = 'http://localhost:8888/callback';

async function getSpotifyToken() {
  const clientId  = process.env.SPOTIFY_CLIENT_ID;
  const clientSec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSec) throw new Error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET missing from .env');

  // PKCE code verifier + challenge
  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    scope:                 'playlist-read-private playlist-read-collaborative',
    redirect_uri:          REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });

  console.log('\nOpening Spotify login in your browser...');
  console.log('(If nothing opens, visit the URL manually:)');
  console.log(authUrl.slice(0, 100) + '…\n');
  try { execSync(`open "${authUrl}"`); } catch { /* non-macOS */ }

  // Local server catches the OAuth callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:8888');
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:monospace;padding:2em"><h2>✓ Authorised — you can close this tab.</h2></body></html>');
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Spotify auth denied: ${error}`));
    });
    server.listen(8888, 'localhost', () =>
      console.log('Waiting for Spotify callback on localhost:8888 ...')
    );
    server.on('error', e => reject(new Error(`Local server error: ${e.message} — is :8888 in use?`)));
  });

  console.log('Callback received. Exchanging code for token...');
  const data = await postForm('accounts.spotify.com', '/api/token', {
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     clientId,
    code_verifier: verifier,
  }, {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSec}`).toString('base64')}`,
  });

  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  console.log('Spotify auth OK\n');
  return data.access_token;
}

async function getPlaylistTracks(pid, token) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${pid}/tracks?limit=100`;
  while (url) {
    const data = await fetchJSON(url, { Authorization: `Bearer ${token}` });
    if (data.error) throw new Error(`Spotify API error: ${JSON.stringify(data.error)}`);
    for (const item of (data.items ?? [])) {
      if (!item.track?.artists?.[0]) continue;
      const { name: trackName, artists } = item.track;
      tracks.push({ artistName: artists[0].name, artistId: artists[0].id, trackName });
    }
    url = data.next ?? null;
    if (url) await delay(150);
  }
  return tracks;
}

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
  console.log(`Playlist: ${playlistId}`);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  const token = await getSpotifyToken();

  process.stdout.write('Fetching playlist tracks... ');
  const tracks = await getPlaylistTracks(playlistId, token);
  console.log(`${tracks.length} tracks`);

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
