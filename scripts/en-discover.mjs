#!/usr/bin/env node
// ── EN Discover: Fan-based Artist Discovery via Everynoise ──────────────────
//
// Uses Everynoise "fans also like" to discover new artists.
// Scrapes genre tags, follower counts, and Spotify IDs in one pass.
// Birth dates via MusicBrainz (by Spotify ID first) → Wikidata fallback.
// YouTube IDs auto-searched and flagged for manual verification.
//
// Usage:
//   node scripts/en-discover.mjs "Chihei Hatakeyama"
//   node scripts/en-discover.mjs "Tim Hecker" --depth=2
//   node scripts/en-discover.mjs "Burial" --min-followers=500 --dry-run
//   node scripts/en-discover.mjs "Stars of the Lid" --output=discovered.json
//   node scripts/en-discover.mjs spotify:artist:4G1ZsxfEEztbE1VcnNInPg

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

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const artistArg = args.find(a => !a.startsWith('--'));
if (!artistArg) {
  console.error([
    'Usage: node scripts/en-discover.mjs "Artist Name" [options]',
    '  --depth=N              recurse N levels deep (default: 1)',
    '  --min-followers=N      skip artists below N followers (default: 2000)',
    '  --min-tag-overlap=N    skip artists with fewer than N shared EN tags with seed (default: 1)',
    '  --scan                 quick scan: show new vs in-DB candidates, no date/YouTube lookups',
    '  --dry-run              print results without saving',
    '  --output=file.json     save to file instead of seed-musicians.json',
  ].join('\n'));
  process.exit(1);
}

const depth          = parseInt(args.find(a => a.startsWith('--depth='))?.split('=')[1]           ?? '1');
const minFollowers   = parseInt(args.find(a => a.startsWith('--min-followers='))?.split('=')[1]   ?? '2000');
const minTagOverlap  = parseInt(args.find(a => a.startsWith('--min-tag-overlap='))?.split('=')[1] ?? '1');
const dryRun         = args.includes('--dry-run');
const scanOnly       = args.includes('--scan');
const outputFlag     = args.find(a => a.startsWith('--output='))?.split('=')[1] ?? null;

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

// ── MusicBrainz birth date ───────────────────────────────────────────────────
// Tries Spotify ID lookup first (far more precise), falls back to name search.

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
  // Strategy 1: MB URL lookup by Spotify ID
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
        if (d) return { date: d, mbid: rel.artist.id };
      }
    } catch {}
  }

  // Strategy 2: name search
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
      if (d) return { date: d, mbid: match.id };
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
      // EN artists are modern — anything pre-1930 is likely a wrong Wikidata entity match
      if (year < 1930 || year > new Date().getFullYear()) continue;

      // Wikidata precision field: 11=day, 10=month, 9=year
      // Year-precision dates store 01-01 for month/day — normalise to mid-year
      const precision = dateVal.precision ?? 11;
      let dateStr;
      if (precision <= 9)       dateStr = `${year}-06-15`;
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

// ── Playwright: EN scraping ───────────────────────────────────────────────────

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

// Given an artist name, return their Spotify ID via EN research page
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

// Scrape all .falbox entries from an EN artist profile page
async function scrapeFansAlsoLike(spotifyId) {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders(EN_HEADERS);
    await page.goto(
      `https://everynoise.com/artistprofile.cgi?id=${spotifyId}`,
      { waitUntil: 'domcontentloaded', timeout: 45000 }
    );
    await page.waitForSelector('#falcell', { timeout: 30000 });

    const ownTags = await page.$$eval(
      'span[title="Spotify genre-ish tags"]',
      els => els.flatMap(el =>
        el.textContent.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
      )
    ).catch(() => []);

    const candidates = await page.$$eval('#falcell .falbox', boxes =>
      boxes.map(box => {
        const nameEl    = box.querySelector('.falname a');
        const name      = nameEl?.textContent.trim() ?? '';
        const href      = nameEl?.getAttribute('href') ?? '';
        const idMatch   = href.match(/[?&]id=([A-Za-z0-9]+)/);
        const spotifyId = idMatch ? idMatch[1] : null;

        // follower count is in the .note that contains "followers"
        const followerNote = Array.from(box.querySelectorAll('.note'))
          .find(n => n.textContent.includes('followers'));
        const followers = parseInt(followerNote?.textContent.replace(/[^0-9]/g, '') ?? '0') || 0;

        const tags = Array.from(box.querySelectorAll('.genres a'))
          .map(a => a.textContent.trim()).filter(Boolean);

        return { name, spotifyId, followers, tags };
      }).filter(e => e.name && e.spotifyId)
    );

    return { candidates, ownTags };
  } catch (e) {
    console.error(`  Scrape failed for ${spotifyId}: ${e.message}`);
    return { candidates: [], ownTags: [] };
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const seed           = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const existingNames  = new Set(seed.map(a => a.name.toLowerCase()));
  const existingSpIds  = new Set(seed.map(a => a.spotifyId).filter(Boolean));
  console.log(`Seed: ${seed.length} artists, ${existingSpIds.size} with Spotify IDs`);

  // Resolve seed Spotify ID
  const directId = parseSpotifyId(artistArg);
  let seedId     = directId;

  if (!seedId) {
    console.log(`\nResolving Spotify ID for "${artistArg}" via Everynoise...`);
    seedId = await resolveSpotifyId(artistArg);
    if (!seedId) {
      console.error(`  ✗ Could not find "${artistArg}" on Everynoise.`);
      await closeBrowser();
      process.exit(1);
    }
    console.log(`  → ${seedId}`);
  }

  // Seed artist's EN tags — used for tag-overlap filtering
  // Prefer stored enTags from seed file; fallback to scraping the EN profile page
  const seedEntry = seed.find(a =>
    a.spotifyId === seedId || a.name.toLowerCase() === artistArg.toLowerCase()
  );
  let seedTags = new Set(seedEntry?.enTags ?? []);
  if (seedTags.size) {
    console.log(`  Seed tags (from DB): ${[...seedTags].slice(0, 8).join(', ')}`);
  }

  const additions = [];
  const visited   = new Set([seedId]);
  // BFS queue: { spotifyId, currentDepth }
  const queue     = [{ spotifyId: seedId, currentDepth: 1 }];

  while (queue.length > 0) {
    const { spotifyId: currentId, currentDepth } = queue.shift();

    console.log(`\n${'━'.repeat(60)}`);
    console.log(`[depth ${currentDepth}] Scraping fans also like — ${currentId}`);

    const { candidates, ownTags } = await scrapeFansAlsoLike(currentId);

    // If this is the seed artist and we have no stored tags, use scraped Spotify tags
    if (!seedTags.size && currentId === seedId && ownTags.length) {
      seedTags = new Set(ownTags);
      console.log(`  Seed tags (from EN): ${[...seedTags].join(', ')}`);
    }

    const fresh = candidates.filter(c =>
      c.followers >= minFollowers &&
      c.tags.length > 0 &&
      !existingNames.has(c.name.toLowerCase()) &&
      !existingSpIds.has(c.spotifyId) &&
      !visited.has(c.spotifyId)
    );

    console.log(`  ${candidates.length} total, ${fresh.length} new (≥${minFollowers.toLocaleString()} followers, not in DB)`);

    if (scanOnly) {
      let belowThreshold = 0;
      for (const c of candidates.filter(c => c.followers >= minFollowers && c.tags.length > 0)) {
        const inDB = existingNames.has(c.name.toLowerCase()) || existingSpIds.has(c.spotifyId);
        const tags = c.tags.slice(0, 3).join(', ');
        if (!inDB && minTagOverlap > 0 && seedTags.size > 0) {
          const shared = c.tags.filter(t => seedTags.has(t));
          if (shared.length < minTagOverlap) {
            belowThreshold++;
            console.log(`  ✗ FILT  ${c.name.padEnd(32)} ${c.followers.toLocaleString().padStart(8)}  [${tags}]`);
            continue;
          }
        }
        console.log(`  ${inDB ? '✓ in DB' : '★ NEW  '} ${c.name.padEnd(32)} ${c.followers.toLocaleString().padStart(8)}  [${tags}]`);
      }
      if (belowThreshold > 0) {
        console.log(`  ↳ ${belowThreshold} filtered by --min-tag-overlap=${minTagOverlap} — rerun with --min-tag-overlap=0 to include`);
      }
      continue;
    }

    for (const candidate of fresh) {
      visited.add(candidate.spotifyId);
      console.log(`\n  ▸ ${candidate.name}  (${candidate.followers.toLocaleString()} followers)`);
      console.log(`    tags: ${candidate.tags.join(', ')}`);

      // Derive genres from EN tags
      const genres    = categorizeGenres(candidate.tags);
      const subgenres = categorizeSubgenres(candidate.tags);

      if (!genres.length) {
        console.log(`    ✗ No genres mapped — skipping`);
        continue;
      }
      console.log(`    genres: ${genres.join(', ')}`);

      // Tag overlap with seed artist
      const sharedTags = seedTags.size
        ? candidate.tags.filter(t => seedTags.has(t))
        : [];
      if (seedTags.size) {
        if (sharedTags.length) {
          console.log(`    overlap: ${sharedTags.length} shared (${sharedTags.join(', ')})`);
        } else {
          console.log(`    overlap: 0 shared tags with seed artist`);
        }
      }
      if (minTagOverlap > 0 && seedTags.size > 0 && sharedTags.length < minTagOverlap) {
        console.log(`    ✗ Below --min-tag-overlap=${minTagOverlap} — skipping`);
        continue;
      }

      // Birth date: Wikidata first (no rate limit), then MusicBrainz by Spotify ID
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

      // Sanity check: flag suspiciously old dates for non-classical/jazz artists
      const birthYear = parseInt(birthDate.slice(0, 4));
      const isClassicalJazz = genres.some(g => ['classical', 'jazz'].includes(g));
      if (birthYear < 1940 && !isClassicalJazz) {
        console.log(`    ⚠ SUSPICIOUS DATE (${birthYear}) — likely wrong MusicBrainz match, verify before merge`);
      }

      // YouTube
      const youtubeId = await findYouTubeId(candidate.name, candidate.tags[0] ?? '');
      if (youtubeId) {
        console.log(`    youtube: https://youtu.be/${youtubeId}  ← verify`);
      } else {
        console.log(`    ⚠ YouTube ID not found`);
      }

      const entry = {
        name:             candidate.name,
        birthDate,
        genres,
        subgenres,
        youtubeId:        youtubeId ?? null,
        enTags:           candidate.tags,
        spotifyId:        candidate.spotifyId,
        spotifyFollowers: candidate.followers || null,
      };
      if (youtubeId) entry.youtubeNeedsVerify = true;
      additions.push(entry);

      // Queue candidate for next depth
      if (currentDepth < depth) {
        queue.push({ spotifyId: candidate.spotifyId, currentDepth: currentDepth + 1 });
      }
    }
  }

  if (scanOnly) {
    await closeBrowser();
    return;
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Discovered: ${additions.length} new artists`);

  const needsVerify = additions.filter(a => a.youtubeNeedsVerify);
  if (needsVerify.length) {
    console.log(`\nYouTube IDs to verify (${needsVerify.length}):`);
    for (const a of needsVerify) {
      const genres = `[${a.genres.join(', ')}]`;
      console.log(`  ${a.name.padEnd(36)} ${genres.padEnd(32)} https://youtu.be/${a.youtubeId}`);
    }
  }

  const noYt = additions.filter(a => !a.youtubeId);
  if (noYt.length) {
    console.log(`\nMissing YouTube IDs (${noYt.length}): ${noYt.map(a => a.name).join(', ')}`);
  }

  if (dryRun) {
    console.log('\n[dry-run] Would add:');
    additions.forEach(a =>
      console.log(`  • ${a.name.padEnd(36)} ${a.birthDate}  [${a.genres.join(', ')}]  ${a.venusSign ?? ''}`)
    );
    await closeBrowser();
    return;
  }

  if (!additions.length) {
    console.log('\nNothing new to save.');
    await closeBrowser();
    return;
  }

  if (outputFlag) {
    writeFileSync(outputFlag, JSON.stringify({ additions, patches: [] }, null, 2));
    console.log(`\nSaved ${additions.length} additions → ${outputFlag}`);
    console.log(`Merge with: node scripts/merge-import.mjs ${outputFlag}`);
  } else {
    const updated = [...seed, ...additions];
    writeFileSync(SEED_PATH, JSON.stringify(updated, null, 2));
    console.log(`\nAdded ${additions.length} artists to seed-musicians.json`);
    console.log('Next steps:');
    console.log('  1. Verify YouTube IDs above');
    console.log('  2. node build-db.mjs');
    console.log('  3. git add seed-musicians.json public/data/musicians.json && git commit');
  }

  await closeBrowser();
}

main().catch(async e => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
