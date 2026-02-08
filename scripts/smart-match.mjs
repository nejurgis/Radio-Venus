#!/usr/bin/env node
// ── Smart Match: Social Similarity Engine for Radio Venus ───────────────────
//
// Uses Last.fm's "similar artists" graph to discover new musicians,
// then cross-references Wikidata for birth dates and genres,
// calculates Venus signs, and adds them to the seed database.
//
// Usage:
//   node scripts/smart-match.mjs "Boards of Canada"
//   node scripts/smart-match.mjs "Basic Channel" --dry-run
//   node scripts/smart-match.mjs "Aphex Twin" --depth 2
//
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { categorizeGenres } from '../src/genres.js';

const require = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');
const cheerio = require('cheerio');

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');
const DB_PATH = join(__dirname, '..', 'public', 'data', 'musicians.json');

// ── Venus calculation ───────────────────────────────────────────────────────

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

function calculateVenus(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const geo = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
  const ecl = Astronomy.Ecliptic(geo);
  const lon = ecl.elon;
  const signIndex = Math.floor(lon / 30);
  return SIGNS[signIndex];
}

// Genre categorization imported from src/genres.js (single source of truth)

// ── HTTP helpers ────────────────────────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RadioVenus/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'RadioVenus/1.0 (https://github.com/nejurgis/Radio-Venus)',
        'Accept': 'application/json',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse error (status ${res.statusCode})`)); }
      });
    }).on('error', reject);
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Last.fm: Social Similarity Engine ───────────────────────────────────────

async function getSimilarArtists(seedArtist) {
  const url = `https://www.last.fm/music/${encodeURIComponent(seedArtist)}/+similar`;
  try {
    const html = await fetchText(url);
    const doc = cheerio.load(html);
    const similar = [];

    // Last.fm puts similar artists in h3 links under .similar-artists-item-name
    doc('.similar-artists-item-name a').each((_, el) => {
      const name = doc(el).text().trim();
      if (name) similar.push(name);
    });

    // Fallback: try h3 > a with /music/ hrefs
    if (similar.length === 0) {
      doc('h3 a[href^="/music/"]').each((_, el) => {
        const name = doc(el).text().trim();
        if (name && name !== seedArtist) similar.push(name);
      });
    }

    return similar;
  } catch (e) {
    console.error(`  Failed to fetch Last.fm for "${seedArtist}": ${e.message}`);
    return [];
  }
}

// ── Last.fm: Get tags for an artist ─────────────────────────────────────────

async function getLastfmTags(artistName) {
  const url = `https://www.last.fm/music/${encodeURIComponent(artistName)}/+tags`;
  try {
    const html = await fetchText(url);
    const doc = cheerio.load(html);
    const tags = [];
    doc('a[href^="/tag/"]').each((_, el) => {
      const tag = doc(el).text().trim().toLowerCase();
      if (tag && !['seen live', 'favorites', 'favourite'].some(f => tag.includes(f))) {
        tags.push(tag);
      }
    });
    return tags.slice(0, 10);
  } catch {
    return [];
  }
}

// ── Manual overrides (for artists invisible to all databases) ────────────────

const OVERRIDES_PATH = join(__dirname, 'manual-overrides.json');

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return {};
  try { return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')); }
  catch { return {}; }
}

// ── Birth date discovery (4-tier) ───────────────────────────────────────────

async function getBirthDate(artistName) {
  // Strategy 0: Manual overrides (highest priority)
  const overrides = loadOverrides();
  const override = overrides[artistName] || overrides[artistName.toLowerCase()];
  if (override?.birthDate) {
    console.log(`    Found in manual-overrides.json`);
    return override.birthDate;
  }

  // Strategy 1: Wikidata (structured, fast)
  let date = await getWikidataBirthDate(artistName);
  if (date) return date;

  // Strategy 2: MusicBrainz (best for underground/electronic artists)
  console.log(`    Wikidata miss, trying MusicBrainz...`);
  date = await getMusicBrainzBirthDate(artistName);
  if (date) return date;

  // Strategy 3: Wikipedia infobox deep scrape (final fallback)
  console.log(`    MusicBrainz miss, trying Wikipedia...`);
  date = await getWikipediaBirthDate(artistName);
  if (date) return date;

  return null;
}

async function getMusicBrainzBirthDate(artistName) {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`;
  try {
    const data = await fetchJSON(url);
    if (!data.artists || data.artists.length === 0) return null;

    // Prefer a Person with a life-span begin date; fall back to Group/other
    const match =
      data.artists.find(a => a.type === 'Person' && a['life-span']?.begin) ||
      data.artists.find(a => a['life-span']?.begin);

    if (match && match['life-span'].begin) {
      const b = match['life-span'].begin;
      if (b.length === 10) return b;          // YYYY-MM-DD
      if (b.length === 7) return `${b}-15`;   // YYYY-MM → mid-month
      if (b.length === 4) return `${b}-06-15`; // YYYY → mid-year (averages Venus cycle)
    }
  } catch { return null; }
  return null;
}

async function getWikidataBirthDate(artistName) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(artistName)}&language=en&type=item&limit=5&format=json`;

  try {
    const searchData = await fetchJSON(searchUrl);
    if (!searchData.search || searchData.search.length === 0) return null;

    for (const result of searchData.search) {
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&props=claims&format=json`;
      const entityData = await fetchJSON(entityUrl);
      const entity = entityData.entities?.[result.id];
      if (!entity?.claims) continue;

      // P569 = birth date (person), P571 = inception date (band/group)
      const dateClaim = entity.claims.P569?.[0] || entity.claims.P571?.[0];
      const dateValue = dateClaim?.mainsnak?.datavalue?.value?.time;
      if (!dateValue) continue;

      const match = dateValue.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }

    return null;
  } catch {
    return null;
  }
}

async function getWikipediaBirthDate(artistName) {
  // Try artist name directly, then with "(musician)" disambiguation
  const queries = [artistName, `${artistName} (musician)`, `${artistName} (band)`];

  for (const title of queries) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvsection=0&titles=${encodeURIComponent(title)}&format=json&redirects=1`;

    try {
      const data = await fetchJSON(url);
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') continue;

      const content = pages[pageId].revisions?.[0]?.['*'];
      if (!content) continue;

      // 1. {{Birth date and age|1991|3|4}} or {{Birth date|1991|3|4}}
      const templateMatch = content.match(/\{\{[Bb]irth date(?:\s+and\s+age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})/);
      if (templateMatch) {
        const [, y, m, d] = templateMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }

      // 2. {{birth-date|March 4, 1991}} or {{birth date|mf=yes|March 4, 1991}}
      const birthDateTextMatch = content.match(/\{\{[Bb]irth[- ]date\|(?:[^|]*\|)*([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
      if (birthDateTextMatch) {
        const parsed = new Date(birthDateTextMatch[1]);
        if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
      }

      // 3. birth_date = March 4, 1991  or  birth_date = {{birth date|...}}
      const infoboxMatch = content.match(/birth_date\s*=\s*(?:\{\{[^}]*\}\}\s*)?([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
      if (infoboxMatch) {
        const parsed = new Date(infoboxMatch[1]);
        if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
      }

      // 4. born.*Month Day, Year pattern in opening paragraph
      const bornMatch = content.match(/born[^)]*?([A-Z][a-z]+ \d{1,2},?\s*\d{4})/);
      if (bornMatch) {
        const parsed = new Date(bornMatch[1]);
        if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
      }

      // 5. born.*YYYY-MM-DD or birth_date.*YYYY-MM-DD
      const isoMatch = content.match(/(?:born|birth_date)[^}]*?(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];

    } catch { continue; }
  }

  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const depthFlag = args.indexOf('--depth');
  const depth = depthFlag >= 0 ? parseInt(args[depthFlag + 1]) || 1 : 1;
  const seedArtists = args.filter(a => !a.startsWith('--') && (depthFlag < 0 || args.indexOf(a) !== depthFlag + 1));

  if (seedArtists.length === 0) {
    console.log('Usage: node scripts/smart-match.mjs <Artist Name> [--dry-run] [--depth N]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/smart-match.mjs "Boards of Canada"');
    console.log('  node scripts/smart-match.mjs "Basic Channel" --dry-run');
    console.log('  node scripts/smart-match.mjs "Aphex Twin" --depth 2');
    process.exit(0);
  }

  // Load known artists
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const db = existsSync(DB_PATH) ? JSON.parse(readFileSync(DB_PATH, 'utf-8')) : [];
  const knownNames = new Set([...seed, ...db].map(a => a.name.toLowerCase()));

  const discovered = [];
  const processed = new Set();

  // BFS through the similarity graph
  let queue = [...seedArtists];
  for (let d = 0; d < depth; d++) {
    const nextQueue = [];
    console.log(`\n=== Depth ${d + 1}/${depth} — ${queue.length} seed(s) ===`);

    for (const artist of queue) {
      if (processed.has(artist.toLowerCase())) continue;
      processed.add(artist.toLowerCase());

      console.log(`\nFinding artists similar to "${artist}"...`);
      const similar = await getSimilarArtists(artist);
      console.log(`  Found ${similar.length} similar artists on Last.fm`);
      await delay(500); // Be polite to Last.fm

      for (const name of similar) {
        const key = name.toLowerCase();
        if (knownNames.has(key) || processed.has(key)) {
          continue;
        }

        // Get birth date (Wikidata -> Wikipedia fallback)
        const birthDate = await getBirthDate(name);
        await delay(300);

        if (!birthDate) {
          console.log(`  - ${name}: no birth date found on Wikidata or Wikipedia`);
          continue;
        }

        // Get genres: override > Last.fm tags
        const overrides = loadOverrides();
        const ov = overrides[name] || overrides[name.toLowerCase()];
        let genres;
        if (ov?.genres?.length) {
          genres = ov.genres;
        } else {
          const tags = await getLastfmTags(name);
          await delay(300);
          genres = categorizeGenres(tags);
        }
        if (genres.length === 0) {
          console.log(`  - ${name} (${birthDate}): no matching genres`);
          continue;
        }

        const venus = calculateVenus(birthDate);
        console.log(`  + ${name} — born ${birthDate} — Venus in ${venus} — [${genres.join(', ')}]`);

        discovered.push({ name, birthDate, genres });
        knownNames.add(key);
        nextQueue.push(name); // For depth > 1
      }
    }
    queue = nextQueue;
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Discovered ${discovered.length} new artists\n`);

  if (discovered.length === 0) {
    console.log('No new artists to add.');
    return;
  }

  // Venus distribution
  const signCounts = {};
  for (const a of discovered) {
    const v = calculateVenus(a.birthDate);
    signCounts[v] = (signCounts[v] || 0) + 1;
  }
  console.log('Venus signs:');
  for (const sign of SIGNS) {
    if (signCounts[sign]) console.log(`  ${sign}: ${signCounts[sign]}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: Not writing to seed file.');
    console.log('Remove --dry-run to save these artists.');
    return;
  }

  // Add to seed
  for (const a of discovered) {
    seed.push(a);
  }
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
  console.log(`\nWrote ${seed.length} total artists to ${SEED_PATH}`);
  console.log('Run "node scripts/build-db.mjs" to fetch YouTube links and rebuild the database.');
}

main().catch(err => {
  console.error('Smart match failed:', err);
  process.exit(1);
});
