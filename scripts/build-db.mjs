#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import https from 'node:https';
import { categorizeGenres, categorizeSubgenres } from '../src/genres.js';

const require = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');
const ytSearch = require('yt-search');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RadioVenus/1.0', 'Accept': 'application/json' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, text: data }));
    }).on('error', reject);
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Venus calculation (same logic as src/venus.js) ──────────────────────────

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
  const degreeInSign = lon - signIndex * 30;
  const sign = SIGNS[signIndex];
  return {
    sign,
    degree: Math.round(degreeInSign * 10) / 10,
    decan: Math.floor(degreeInSign / 10) + 1,
    element: ELEMENTS[sign],
  };
}

// Genre categorization imported from src/genres.js (single source of truth)

// ── Wikidata SPARQL ─────────────────────────────────────────────────────────

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

const SPARQL_QUERY = `
SELECT ?artist ?artistLabel ?birthDate (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres) WHERE {
  ?artist wdt:P31 wd:Q5 ;             # human
          wdt:P569 ?birthDate ;         # has birth date
          wdt:P136 ?genre .             # has genre
  ?genre wdt:P279* wd:Q9730 .          # genre is subclass of electronic music
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?artist rdfs:label ?artistLabel. ?genre rdfs:label ?genreLabel. }
  FILTER(YEAR(?birthDate) > 1600)
}
GROUP BY ?artist ?artistLabel ?birthDate
HAVING(COUNT(?genre) > 0)
LIMIT 100
`;

async function queryWikidata() {
  console.log('Querying Wikidata for electronic musicians...');
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(SPARQL_QUERY)}&format=json`;

  const res = await httpGet(url);

  if (!res.ok) {
    console.warn(`Wikidata returned ${res.status}, using seed data only.`);
    return [];
  }

  const data = JSON.parse(res.text);
  const artists = [];

  for (const row of data.results.bindings) {
    const name = row.artistLabel?.value;
    const birthDate = row.birthDate?.value?.slice(0, 10);
    const rawGenres = row.genres?.value?.split('|') || [];

    if (!name || !birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) continue;

    const genres = categorizeGenres(rawGenres);
    if (genres.length === 0) continue;

    artists.push({ name, birthDate, genres });
  }

  console.log(`  Found ${artists.length} artists from Wikidata.`);
  return artists;
}

// ── YouTube search (yt-search) ──────────────────────────────────────────────

async function searchYouTube(artistName, genre) {
  const queries = [
    `${artistName} ${genre} official audio`,
    `${artistName} topic`,
    `${artistName} full album`,
  ];

  for (const q of queries) {
    try {
      const result = await ytSearch(q);
      const video = result.videos.slice(0, 5).find(item => {
        const dur = item.seconds;
        // 4 min to 3 hours
        return dur > 240 && dur < 10800;
      });
      if (video) return video.videoId;
    } catch { continue; }
  }
  return null;
}

// ── Merge + build ───────────────────────────────────────────────────────────

async function main() {
  const outDir = join(ROOT, 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'musicians.json');

  // ── 1. Load existing database as cache (preserves YouTube IDs) ──────────
  const cache = new Map();
  if (existsSync(outPath)) {
    const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
    for (const m of existing) {
      cache.set(m.name.toLowerCase(), m);
    }
    console.log(`Loaded ${cache.size} cached artists from existing database.`);
  } else {
    console.log('No existing database found, starting fresh.');
  }

  // ── 2. Load seed data (highest priority) ────────────────────────────────
  const seedPath = join(__dirname, 'seed-musicians.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  console.log(`Loaded ${seed.length} seed artists.`);

  // Build merge map: seed > cache > wikidata
  const byName = new Map();

  // Cache first (lowest priority of the two local sources)
  for (const [key, m] of cache) {
    byName.set(key, m);
  }

  // Seed overwrites cache (highest priority)
  for (const s of seed) {
    const key = s.name.toLowerCase();
    const cached = byName.get(key);
    // Preserve YouTube ID from cache if seed doesn't have one
    if (cached && cached.youtubeVideoId && !s.youtubeVideoId) {
      s.youtubeVideoId = cached.youtubeVideoId;
    }
    byName.set(key, s);
  }

  // ── 3. Query Wikidata for new artists ───────────────────────────────────
  const wikidataArtists = await queryWikidata();

  // Merge: Wikidata artists that aren't already known
  let newFromWikidata = 0;
  for (const w of wikidataArtists) {
    const key = w.name.toLowerCase();
    if (!byName.has(key)) {
      // Check cache for a previously resolved YouTube ID
      const cached = cache.get(key);
      if (cached && cached.youtubeVideoId) {
        w.youtubeVideoId = cached.youtubeVideoId;
      }
      byName.set(key, w);
      newFromWikidata++;
    }
  }
  console.log(`  ${newFromWikidata} new artists from Wikidata (${wikidataArtists.length - newFromWikidata} already known).`);

  // ── 4. Process: Venus calc + YouTube lookup (only if needed) ────────────
  const musicians = [];
  const entries = [...byName.values()];
  let skippedCached = 0;
  let searchedYt = 0;
  console.log(`\nProcessing ${entries.length} total artists...`);

  const BATCH_SIZE = 5;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (entry) => {
      try {
        const venus = calculateVenus(entry.birthDate);

        // Use existing video ID: from seed, cache, or entry itself
        let videoId = entry.youtubeVideoId || null;
        // Also check if this artist was already in the built cache with a video
        if (!videoId) {
          const cached = cache.get(entry.name.toLowerCase());
          if (cached && cached.youtubeVideoId) {
            videoId = cached.youtubeVideoId;
            skippedCached++;
          }
        }

        if (!videoId) {
          const genreLabel = entry.genres[0] || 'electronic';
          videoId = await searchYouTube(entry.name, genreLabel);
          if (videoId) searchedYt++;
        }

        if (!videoId) return null;

        return {
          name: entry.name,
          birthDate: entry.birthDate,
          venus,
          genres: entry.genres,
          subgenres: entry.subgenres || [],
          youtubeVideoId: videoId,
        };
      } catch {
        return null;
      }
    }));

    for (const r of results) {
      if (r) {
        musicians.push(r);
        console.log(`  + ${r.name} (Venus in ${r.venus.sign} ${r.venus.degree}°)`);
      }
    }
    console.log(`  [${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length}]`);
  }

  console.log(`\n  ${skippedCached} artists reused cached YouTube IDs.`);
  console.log(`  ${searchedYt} new YouTube searches performed.`);

  // Sort by name
  musicians.sort((a, b) => a.name.localeCompare(b.name));

  // Write output
  writeFileSync(outPath, JSON.stringify(musicians, null, 2));

  console.log(`\nWrote ${musicians.length} musicians to ${outPath}`);

  // Print distribution
  const signCounts = {};
  const genreCounts = {};
  for (const m of musicians) {
    signCounts[m.venus.sign] = (signCounts[m.venus.sign] || 0) + 1;
    for (const g of m.genres) {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    }
  }
  console.log('\nVenus sign distribution:');
  for (const sign of SIGNS) {
    console.log(`  ${sign}: ${signCounts[sign] || 0}`);
  }
  console.log('\nGenre distribution:');
  for (const [g, c] of Object.entries(genreCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g}: ${c}`);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
