#!/usr/bin/env node
// ── EN Radio: Artist Discovery via Everynoise Radio Page ─────────────────────
//
// Scrapes the Everynoise "radio" page for a given artist and runs the same
// enrichment pipeline as en-discover.mjs (birth dates, YouTube, genres).
//
// Usage:
//   node scripts/en-radio.mjs spotify:artist:3ND5NWoKzlelYDDyWqSQpQ
//   node scripts/en-radio.mjs "Susumu Yokota"
//   node scripts/en-radio.mjs spotify:artist:3ND5NWoKzlelYDDyWqSQpQ --scan
//   node scripts/en-radio.mjs spotify:artist:3ND5NWoKzlelYDDyWqSQpQ --output=yokota-radio.json
//   node scripts/en-radio.mjs spotify:artist:3ND5NWoKzlelYDDyWqSQpQ --min-followers=500
//

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
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
    'Usage: node scripts/en-radio.mjs "Artist Name" [options]',
    '       node scripts/en-radio.mjs spotify:artist:ID [options]',
    '  --scan               quick scan: show new vs in-DB candidates, no enrichment',
    '  --dry-run            print results without saving',
    '  --output=file.json   save to file for merge-import.mjs',
  ].join('\n'));
  process.exit(1);
}

const dryRun     = args.includes('--dry-run');
const scanOnly   = args.includes('--scan');
const outputFlag = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? null;

function parseSpotifyId(str) {
  const m = str.match(/(?:spotify:artist:|open\.spotify\.com\/artist\/)([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RadioVenus/1.0 (music discovery)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchText(res.headers.location).then(resolve, reject);
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
  return (year >= 1600 && year <= new Date().getFullYear()) ? s : null;
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
        const data = await fetchJSON(
          `https://musicbrainz.org/ws/2/artist/${rel.artist.id}?fmt=json`
        );
        const d = parseMBDate(data?.['life-span']?.begin);
        if (d) return { date: d };
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
    if (match) {
      const d = parseMBDate(match['life-span'].begin);
      if (d) return { date: d };
    }
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
      return { date: dateStr };
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

// ── Playwright: EN radio page scraping ───────────────────────────────────────

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

const EN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function resolveSpotifyId(artistName) {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders(EN_HEADERS);
    await page.goto(
      `https://everynoise.com/research.cgi?name=${encodeURIComponent(artistName)}&mode=artist`,
      { waitUntil: 'domcontentloaded', timeout: 45000 }
    );
    await page.waitForSelector('#exact + div .artistname a[href*="artistprofile.cgi"]', { timeout: 30000 });
    const href = await page.$eval(
      '#exact + div .artistname a[href*="artistprofile.cgi"]',
      el => el.getAttribute('href')
    ).catch(() => null);
    const m = href?.match(/[?&]id=([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  } catch { return null; }
  finally { await page.close().catch(() => {}); }
}

async function scrapeRadioPage(spotifyId) {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  const url     = `https://everynoise.com/research.cgi?mode=radio&name=spotify:artist:${spotifyId}`;
  try {
    await page.setExtraHTTPHeaders(EN_HEADERS);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Wait for at least one artist box to appear (JS-rendered)
    await page.waitForSelector('div.box div.artistname', { timeout: 30000 });

    const candidates = await page.$$eval('div.box', boxes =>
      boxes.map(box => {
        const link = box.querySelector('.artistname a');
        if (!link) return null;
        const href = link.getAttribute('href') ?? '';

        // Spotify ID from artistprofile.cgi?id= link
        const idMatch   = href.match(/[?&]id=([A-Za-z0-9]+)/);
        const spotifyId = idMatch ? idMatch[1] : null;

        // Artist name(s) are in <div> children of the <a>
        // (track title is a plain text node — excluded by querySelectorAll('div'))
        const nameDivs = Array.from(link.querySelectorAll('div'));
        const name     = nameDivs.map(d => d.textContent.trim()).filter(Boolean).join(' & ');

        return { name, spotifyId, tags: [] };
      }).filter(e => e?.name && e?.spotifyId)
    );

    return candidates;
  } catch (e) {
    console.error(`  Scrape failed: ${e.message}`);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

// ── EN artist profile tags (reuses a shared page for speed) ──────────────────

async function scrapeENProfile(page, spotifyId) {
  await page.goto(
    `https://everynoise.com/artistprofile.cgi?id=${spotifyId}`,
    { waitUntil: 'domcontentloaded', timeout: 45000 }
  );
  const genres = await page.$$eval(
    'a[href*="mode=genre"]',
    els => els.map(a => a.textContent.trim().toLowerCase()).filter(Boolean)
  ).catch(() => []);
  const spotifyTags = await page.$eval(
    'span[title="Spotify genre-ish tags"]',
    span => span.textContent.trim().split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
  ).catch(() => []);
  return [...new Set([...genres, ...spotifyTags])];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const seed          = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const existingNames = new Set(seed.map(a => a.name.toLowerCase()));
  const existingSpIds = new Set(seed.map(a => a.spotifyId).filter(Boolean));
  console.log(`Seed: ${seed.length} artists`);

  // Resolve Spotify ID
  const directId = parseSpotifyId(artistArg);
  let spotifyId  = directId;
  if (!spotifyId) {
    console.log(`\nResolving Spotify ID for "${artistArg}"...`);
    spotifyId = await resolveSpotifyId(artistArg);
    if (!spotifyId) {
      console.error(`  ✗ Could not resolve "${artistArg}" on Everynoise.`);
      await closeBrowser();
      process.exit(1);
    }
    console.log(`  → ${spotifyId}`);
  }

  console.log(`\nScraping EN radio page for ${spotifyId}...`);
  const all = await scrapeRadioPage(spotifyId);

  console.log(`  ${all.length} artists found on radio page`);

  const fresh = all.filter(c =>
    !existingNames.has(c.name.toLowerCase()) &&
    !existingSpIds.has(c.spotifyId)
  );
  const inDB  = all.filter(c =>
    existingNames.has(c.name.toLowerCase()) || existingSpIds.has(c.spotifyId)
  );

  console.log(`  ${fresh.length} new, ${inDB.length} already in DB`);

  if (scanOnly) {
    console.log('\n── Scan results ──────────────────────────────────────────');
    for (const c of all) {
      const inDb = existingNames.has(c.name.toLowerCase()) || existingSpIds.has(c.spotifyId);
      console.log(`  ${inDb ? '✓ in DB' : '★ NEW  '} ${c.name}`);
    }
    await closeBrowser();
    return;
  }

  // ── Enrich each new candidate ─────────────────────────────────────────────

  const additions = [];

  // Single reused page for all EN profile lookups (much faster than new page per artist)
  const browser  = await getBrowser();
  const enPage   = await browser.newPage();
  await enPage.setExtraHTTPHeaders(EN_HEADERS);

  for (const candidate of fresh) {
    console.log(`\n  ▸ ${candidate.name}`);

    // Fetch genre tags directly via Spotify artist ID — no search needed
    const profileTags = await scrapeENProfile(enPage, candidate.spotifyId).catch(() => []);
    if (profileTags.length) {
      candidate.tags = profileTags;
      console.log(`    tags: ${profileTags.slice(0, 6).join(', ')}`);
    } else {
      console.log(`    ⚠ No EN tags found`);
    }

    // Verify Spotify display name
    try {
      const oembed = await fetchJSON(
        `https://open.spotify.com/oembed?url=https://open.spotify.com/artist/${candidate.spotifyId}`
      );
      const spotifyName = oembed?.title;
      if (spotifyName && spotifyName.toLowerCase() !== candidate.name.toLowerCase()) {
        console.log(`    ⚠ Spotify name: "${spotifyName}" — using that`);
        candidate.name = spotifyName;
      }
    } catch {}

    const genres = categorizeGenres(candidate.tags);
    if (!genres.length) {
      console.log(`    ✗ No genres mapped — skipping`);
      continue;
    }
    const subgenres = categorizeSubgenres(candidate.tags);
    console.log(`    genres: ${genres.join(', ')}`);

    // Birth date
    let birthDate = null;
    const wdResult = await getWDBirthDate(candidate.name);
    if (wdResult) {
      birthDate = wdResult.date;
      console.log(`    birth date (Wikidata): ${birthDate}`);
    } else {
      const mbResult = await getMBBirthDate(candidate.name, candidate.spotifyId);
      if (mbResult) {
        birthDate = mbResult.date;
        console.log(`    birth date (MusicBrainz): ${birthDate}`);
      }
    }

    if (!birthDate) {
      console.log(`    ✗ Birth date not found — skipping`);
      continue;
    }

    const birthYear = parseInt(birthDate.slice(0, 4));
    const isClassicalJazz = genres.some(g => ['classical', 'jazz'].includes(g));
    if (birthYear < 1940 && !isClassicalJazz) {
      console.log(`    ⚠ SUSPICIOUS DATE (${birthYear}) — verify before merge`);
    }

    // YouTube
    const youtubeId = await findYouTubeId(candidate.name, candidate.tags[0] ?? '');
    if (youtubeId) console.log(`    youtube: https://youtu.be/${youtubeId}  ← verify`);
    else           console.log(`    ⚠ YouTube ID not found`);

    const entry = {
      name:             candidate.name,
      birthDate,
      genres,
      subgenres,
      youtubeId:        youtubeId ?? null,
      enTags:           candidate.tags,
      spotifyId: candidate.spotifyId,
    };
    if (youtubeId) entry.youtubeNeedsVerify = true;
    additions.push(entry);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Discovered: ${additions.length} new artists`);

  const needsVerify = additions.filter(a => a.youtubeNeedsVerify);
  if (needsVerify.length) {
    console.log(`\nYouTube IDs to verify (${needsVerify.length}):`);
    for (const a of needsVerify) {
      console.log(`  ${a.name.padEnd(36)} https://youtu.be/${a.youtubeId}`);
    }
  }
  const noYt = additions.filter(a => !a.youtubeId);
  if (noYt.length) console.log(`Missing YouTube: ${noYt.map(a => a.name).join(', ')}`);

  await closeBrowser();

  if (dryRun) {
    console.log('\n[dry-run] Would add:');
    additions.forEach(a => console.log(`  ${a.name}  [${a.genres.join(', ')}]  ${a.birthDate}`));
    return;
  }

  if (outputFlag) {
    writeFileSync(outputFlag, JSON.stringify({ additions, patches: [] }, null, 2));
    console.log(`\nSaved → ${outputFlag}`);
    console.log('Run: node scripts/review-youtube.mjs --input=' + outputFlag);
    console.log('Then: node scripts/merge-import.mjs ' + outputFlag);
  } else {
    const seed2 = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
    const nameSet = new Set(seed2.map(a => a.name.toLowerCase()));
    let added = 0;
    for (const entry of additions) {
      if (!nameSet.has(entry.name.toLowerCase())) {
        seed2.push(entry);
        added++;
      }
    }
    writeFileSync(SEED_PATH, JSON.stringify(seed2, null, 2));
    console.log(`\nAdded ${added} artists to seed. Run "node scripts/build-db.mjs" to rebuild.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
