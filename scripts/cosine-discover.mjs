#!/usr/bin/env node
// ── Cosine Discover: Audio-similarity artist discovery via cosine.club ────────
//
// Uses cosine.club ML embeddings to find sonically similar artists.
// Complements EN discover (cultural/tag similarity) with actual audio similarity.
//
// Finds the seed artist's track on cosine.club, scrapes 99 similar tracks,
// groups by artist, filters by similarity threshold + not-in-seed, then
// enriches with EN genre tags + birth date + YouTube ID.
//
// Usage:
//   node scripts/cosine-discover.mjs "Burial"
//   node scripts/cosine-discover.mjs "Four Tet" --min-similarity=92
//   node scripts/cosine-discover.mjs "Actress" --track="Hubble" --output=discovered.json
//   node scripts/cosine-discover.mjs "Burial" --scan

import { createRequire }           from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }           from 'node:path';
import { fileURLToPath }           from 'node:url';
import https                       from 'node:https';
import { categorizeGenres, categorizeSubgenres } from '../src/genres.js';

const require   = createRequire(import.meta.url);
const ytSearch  = require('yt-search');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const artistArg = args.find(a => !a.startsWith('--'));

if (!artistArg) {
  console.error([
    'Usage: node scripts/cosine-discover.mjs "Artist Name" [options]',
    '  --min-similarity=N    minimum similarity % to include (default: 90)',
    '  --top-n=N             max similar artists to process (default: 50)',
    '  --track="name"        use a specific track instead of first search result',
    '  --scan                quick preview: list candidates without enrichment',
    '  --dry-run             enrich but do not save',
    '  --output=file.json    save to file for review + merge',
  ].join('\n'));
  process.exit(1);
}

const minSimilarity = parseInt(args.find(a => a.startsWith('--min-similarity='))?.split('=')[1] ?? '90');
const topN          = parseInt(args.find(a => a.startsWith('--top-n='))?.split('=')[1]          ?? '50');
const trackHint     = args.find(a => a.startsWith('--track='))?.slice(8) ?? null;
const scanOnly      = args.includes('--scan');
const dryRun        = args.includes('--dry-run');
const outputFlag    = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? null;

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchText(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ...extraHeaders,
    };
    https.get(url, { headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchText(res.headers.location, extraHeaders).then(resolve, reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fetchJSON(url) { return fetchText(url).then(t => JSON.parse(t)); }
function delay(ms)      { return new Promise(r => setTimeout(r, ms)); }

// ── MusicBrainz birth date ────────────────────────────────────────────────────

function parseMBDate(b) {
  if (!b) return null;
  let s;
  if (b.length === 10) s = b;
  else if (b.length === 7) s = `${b}-15`;
  else if (b.length === 4) s = `${b}-06-15`;
  else return null;
  const year = parseInt(s);
  return (year >= 1930 && year <= new Date().getFullYear()) ? s : null;
}

async function getMBBirthDate(artistName, spotifyId) {
  if (spotifyId) {
    try {
      await delay(1100);
      const urlData = await fetchJSON(
        `https://musicbrainz.org/ws/2/url?resource=https://open.spotify.com/artist/${spotifyId}&inc=artist-rels&fmt=json`
      );
      const rel = urlData?.relations?.find(r => r.artist);
      if (rel?.artist?.id) {
        await delay(1100);
        const data = await fetchJSON(`https://musicbrainz.org/ws/2/artist/${rel.artist.id}?fmt=json`);
        const d = parseMBDate(data?.['life-span']?.begin);
        if (d) return d;
      }
    } catch {}
  }
  try {
    await delay(1100);
    const data = await fetchJSON(
      `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`
    );
    const match =
      data.artists?.find(a => a.type === 'Person' && a['life-span']?.begin) ||
      data.artists?.find(a => a.type === 'Group'  && a['life-span']?.begin);
    if (match) return parseMBDate(match['life-span'].begin);
  } catch {}
  return null;
}

// ── Wikidata birth date ───────────────────────────────────────────────────────

const WD_MUSIC_OCCUPATIONS = ['Q639669','Q177220','Q36834','Q183945','Q855091',
                               'Q386854','Q488205','Q158852','Q753110','Q584301'];

async function getWDBirthDate(artistName) {
  try {
    const search = await fetchJSON(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(artistName)}&language=en&type=item&limit=5&format=json`
    );
    if (!search.search?.length) return null;

    for (const result of search.search) {
      await delay(300);
      const ed = await fetchJSON(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&props=claims&format=json`
      );
      const entity = ed.entities?.[result.id];
      if (!entity?.claims) continue;

      const occupations = (entity.claims.P106 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const instances   = (entity.claims.P31  || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const isMusician  = occupations.some(id => WD_MUSIC_OCCUPATIONS.includes(id));
      const isGroup     = instances.some(id => ['Q215380','Q5741069'].includes(id));
      if (!isGroup && !(instances.includes('Q5') && isMusician)) continue;

      const dateClaim = entity.claims.P569?.[0] || entity.claims.P571?.[0];
      const dateVal   = dateClaim?.mainsnak?.datavalue?.value;
      if (!dateVal?.time) continue;

      const m = dateVal.time.match(/[+-](\d+)-(\d{2})-(\d{2})/);
      if (!m) continue;
      const year = parseInt(m[1]);
      if (year < 1930 || year > new Date().getFullYear()) continue;

      const precision = dateVal.precision ?? 11;
      let dateStr;
      if (precision <= 9)        dateStr = `${year}-06-15`;
      else if (precision === 10) dateStr = `${year}-${m[2]}-15`;
      else                       dateStr = `${year}-${m[2]}-${m[3]}`;

      return dateStr;
    }
  } catch {}
  return null;
}

// ── YouTube search ────────────────────────────────────────────────────────────

async function findYouTubeId(artistName, primaryTag) {
  const queries = [
    `${artistName} ${primaryTag} full`,
    `${artistName} topic`,
    `${artistName} full album`,
  ];
  for (const q of queries) {
    try {
      await delay(500);
      const result = await ytSearch(q);
      const video  = result.videos.slice(0, 5).find(v => v.seconds > 240 && v.seconds < 10800);
      if (video) return video.videoId;
    } catch { continue; }
  }
  return null;
}

// ── Playwright ────────────────────────────────────────────────────────────────

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = await import('playwright');
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function closeBrowser() {
  if (!_browser) return;
  _browser.close().catch(() => {});
  _browser = null;
}

const COSINE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// Search cosine.club for an artist, return the URL of their best matching track
async function findTrackUrl(artistName, trackHint) {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders(COSINE_HEADERS);
    await page.goto('https://cosine.club', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Type into search — fires htmx request updating #search-results-list
    await page.fill('#search', artistName);
    await page.waitForSelector('#search-results-list li a[href^="/track/"]', { timeout: 15000 });

    // Results are "Artist - Track Name" link text inside #search-results-list
    const results = await page.$$eval('#search-results-list li a[href^="/track/"]', els =>
      els.map(el => ({
        href: el.getAttribute('href') ?? '',
        text: el.textContent.trim(),   // "Artist - Track Name"
      }))
    );

    if (!results.length) return null;

    const artistLower = artistName.toLowerCase();
    const hintLower   = trackHint?.toLowerCase() ?? null;

    // Priority 1: matches both artist and specific track hint
    if (hintLower) {
      const match = results.find(r => {
        const t = r.text.toLowerCase();
        return t.includes(artistLower) && t.includes(hintLower);
      });
      if (match) return match.href;
    }

    // Priority 2: artist name matches start of result text (before " - ")
    const match = results.find(r => {
      const artist = r.text.split(' - ')[0].toLowerCase();
      return artist === artistLower || artist.includes(artistLower);
    });
    if (match) return match.href;

    // Priority 3: first result
    return results[0].href;
  } catch (e) {
    console.error(`  Search failed: ${e.message}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// Fetch a track page and extract all similar tracks from the HTML
async function scrapeSimilarTracks(trackPath) {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders(COSINE_HEADERS);
    await page.goto(`https://cosine.club${trackPath}`, {
      waitUntil: 'domcontentloaded',
      timeout:   45000,
    });

    // Wait for similar track rows
    await page.waitForSelector('.flex.flex-row.border.border-border', { timeout: 20000 });

    // Extract source track info from JSON-LD
    const sourceTrack = await page.$eval('script[type="application/ld+json"]', el => {
      try {
        const graph = JSON.parse(el.textContent)['@graph'] ?? [];
        const rec   = graph.find(n => n['@type'] === 'MusicRecording');
        if (!rec) return null;
        return { name: rec.name ?? '', artist: rec.byArtist?.name ?? '' };
      } catch { return null; }
    }).catch(() => null);

    // Each similar track row: .flex.flex-row.border.border-border
    // First a[href^="/track/"] link text = "Artist - Track Name"
    // Similarity % appears in row textContent
    const tracks = await page.$$eval('.flex.flex-row.border.border-border', rows =>
      rows.map(row => {
        const link = row.querySelector('a[href^="/track/"]');
        if (!link) return null;

        const href     = link.getAttribute('href') ?? '';
        const linkText = link.textContent.trim();          // "Artist - Track Name"
        const rowText  = row.textContent.trim().replace(/\s+/g, ' ');
        // Similarity appears doubled in row text: "90%90%" — use backreference to isolate it
        const simMatch = rowText.match(/(\d{2,3})%\1%/);

        // Parse "Artist - Track Name" — split on first " - "
        const dashIdx  = linkText.indexOf(' - ');
        const artist   = dashIdx > -1 ? linkText.slice(0, dashIdx).trim()   : linkText;
        const trackName = dashIdx > -1 ? linkText.slice(dashIdx + 3).trim() : '';

        return {
          href,
          artist,
          trackName,
          similarity: simMatch ? parseInt(simMatch[1]) : 0,
        };
      }).filter(Boolean).filter(t => t.artist && t.href)
    );

    return { sourceTrack, tracks };
  } catch (e) {
    console.error(`  Scrape failed: ${e.message}`);
    return { sourceTrack: null, tracks: [] };
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const seed          = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const existingNames = new Set(seed.map(a => a.name.toLowerCase()));
  console.log(`Seed: ${seed.length} artists\n`);

  // Step 1: find the artist's track on cosine.club
  console.log(`Searching cosine.club for "${artistArg}"${trackHint ? ` — track: "${trackHint}"` : ''}...`);
  const trackUrl = await findTrackUrl(artistArg, trackHint);
  if (!trackUrl) {
    console.error(`✗ Could not find "${artistArg}" on cosine.club.`);
    console.error(`  Try --track="specific track name" to narrow the search.`);
    await closeBrowser();
    process.exit(1);
  }
  console.log(`  → https://cosine.club${trackUrl}`);

  // Step 2: scrape similar tracks
  console.log(`\nScraping similar tracks...`);
  const { sourceTrack, tracks } = await scrapeSimilarTracks(trackUrl);

  if (sourceTrack) {
    console.log(`  Source: "${sourceTrack.name}" by ${sourceTrack.artist}`);
  }
  console.log(`  Found: ${tracks.length} similar tracks`);

  await closeBrowser();

  if (!tracks.length) {
    console.error('✗ No similar tracks found. The page structure may have changed.');
    process.exit(1);
  }

  // Step 3: group by artist, take best (highest) similarity per artist
  const artistMap = new Map();
  for (const t of tracks) {
    if (!t.artist) continue;
    const key = t.artist.toLowerCase();
    if (!artistMap.has(key) || t.similarity > (artistMap.get(key).similarity ?? 0)) {
      artistMap.set(key, t);
    }
  }

  // Step 4: filter — not in seed, meets similarity threshold, top-N
  const candidates = [...artistMap.values()]
    .filter(t => !existingNames.has(t.artist.toLowerCase()))
    .filter(t => !minSimilarity || t.similarity >= minSimilarity || t.similarity === 0) // 0 = couldn't parse
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, topN);

  console.log(`\n${candidates.length} new artists (≥${minSimilarity}% similarity, not in DB):`);

  if (scanOnly) {
    for (const c of candidates) {
      const sim = c.similarity ? `${c.similarity}%` : '  ?%';
      console.log(`  ★ ${sim}  ${c.artist.padEnd(32)}  [${c.trackName || c.slugText.slice(0, 30)}]`);
    }
    return;
  }

  // Step 5: enrich each candidate
  const additions = [];

  for (const candidate of candidates) {
    console.log(`\n  ▸ ${candidate.artist}${candidate.similarity ? `  (${candidate.similarity}% similar)` : ''}`);

    // EN genres via Wikidata/MB — no EN scraping needed here since
    // genres come from EN's categorizeGenres on stored enTags.
    // For cosine-discovered artists we derive genres from MusicBrainz tags.
    let genres = [], subgenres = [], enTags = [];

    // Birth date
    let birthDate = null;
    const wdDate = await getWDBirthDate(candidate.artist);
    if (wdDate) {
      birthDate = wdDate;
      console.log(`    birth date (Wikidata): ${birthDate}`);
    } else {
      const mbDate = await getMBBirthDate(candidate.artist, null);
      if (mbDate) {
        birthDate = mbDate;
        console.log(`    birth date (MusicBrainz): ${birthDate}`);
      }
    }

    if (!birthDate) {
      console.log(`    ✗ Birth date not found — skipping`);
      continue;
    }

    // YouTube
    const youtubeId = await findYouTubeId(candidate.artist, '');
    if (youtubeId) {
      console.log(`    youtube: https://youtu.be/${youtubeId}  ← verify`);
    } else {
      console.log(`    ⚠ YouTube ID not found`);
    }

    const entry = {
      name:              candidate.artist,
      birthDate,
      genres,
      subgenres,
      youtubeId:         youtubeId ?? null,
      enTags:            [],
      cosineUrl:         `https://cosine.club${candidate.href}`,
      cosineSimilarity:  candidate.similarity || null,
    };
    if (youtubeId) entry.youtubeNeedsVerify = true;
    additions.push(entry);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Discovered: ${additions.length} new artists`);

  if (additions.length) {
    console.log(`\nArtists (need genre assignment via verify-genres or manual):`);
    for (const a of additions) {
      const sim = a.cosineSimilarity ? `${a.cosineSimilarity}%` : '  ?%';
      const yt  = a.youtubeId ? `https://youtu.be/${a.youtubeId}` : '(no YouTube)';
      console.log(`  ${sim}  ${a.name.padEnd(32)}  ${yt}`);
    }
  }

  if (dryRun || !additions.length) { return; }

  if (outputFlag) {
    writeFileSync(outputFlag, JSON.stringify({ additions, patches: [] }, null, 2));
    console.log(`\nSaved → ${outputFlag}`);
    console.log(`Review: node scripts/review-youtube.mjs --input=${outputFlag}`);
    console.log(`Then:   node scripts/merge-import.mjs ${outputFlag}`);
  } else {
    const updated = [...seed, ...additions];
    writeFileSync(SEED_PATH, JSON.stringify(updated, null, 2));
    console.log(`\nAdded ${additions.length} artists to seed-musicians.json`);
  }
}

main().catch(async e => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
