#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import https from 'node:https';

const require = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');
const ytsr = require('ytsr');

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

// ── Genre categorization (mirrors src/genres.js) ────────────────────────────

const GENRE_MAP = {
  'electronic music': ['idm'], 'electronic': ['idm'],
  'techno': ['techno'], 'house music': ['techno'], 'house': ['techno'],
  'minimal techno': ['techno'], 'acid house': ['techno'], 'acid techno': ['techno'],
  'detroit techno': ['techno'], 'deep house': ['techno'], 'tech house': ['techno'],
  'dub techno': ['techno', 'ambient'], 'microhouse': ['techno'],
  'ambient music': ['ambient'], 'ambient': ['ambient'], 'dark ambient': ['ambient'],
  'drone music': ['ambient'], 'drone': ['ambient'], 'space music': ['ambient'],
  'idm': ['idm'], 'intelligent dance music': ['idm'],
  'experimental music': ['idm'], 'experimental': ['idm'],
  'experimental electronic': ['idm'], 'glitch': ['idm'],
  'electroacoustic': ['idm'], 'musique concrète': ['idm'],
  'industrial music': ['industrial'], 'industrial': ['industrial'],
  'noise music': ['industrial'], 'noise': ['industrial'],
  'power electronics': ['industrial'], 'death industrial': ['industrial'],
  'ebm': ['industrial', 'darkwave'], 'electronic body music': ['industrial', 'darkwave'],
  'synthwave': ['darkwave'], 'darkwave': ['darkwave'], 'coldwave': ['darkwave'],
  'post-punk': ['darkwave'], 'synthpop': ['darkwave'], 'synth-pop': ['darkwave'],
  'new wave': ['darkwave'], 'minimal wave': ['darkwave'], 'gothic rock': ['darkwave'],
  'trip hop': ['triphop'], 'trip-hop': ['triphop'], 'downtempo': ['triphop'],
  'chillout': ['triphop'], 'dub': ['triphop'],
  'drum and bass': ['dnb'], 'drum & bass': ['dnb'], 'jungle': ['dnb'],
  'breakcore': ['dnb'], 'breakbeat': ['dnb'], 'dubstep': ['dnb'],
  'grime': ['dnb'], 'footwork': ['dnb'],
  'classical music': ['classical'], 'classical': ['classical'],
  'orchestral': ['classical'], 'opera': ['classical'], 'symphony': ['classical'],
  'chamber music': ['classical'], 'baroque music': ['classical'], 'baroque': ['classical'],
  'romantic music': ['classical'], 'impressionist music': ['classical'],
  'minimalism': ['classical'], 'minimalist music': ['classical'],
  'contemporary classical': ['classical'], 'neoclassical': ['classical'],
  'piano music': ['classical'], 'choral music': ['classical'], 'art music': ['classical'],
  'concerto': ['classical'], 'sonata': ['classical'], 'cantata': ['classical'],
  'oratorio': ['classical'], 'post-minimalism': ['classical'],
  'serial music': ['classical'], 'atonal music': ['classical'],
  'twelve-tone technique': ['classical'],
};

function categorizeGenres(rawGenres) {
  const categories = new Set();
  for (const raw of rawGenres) {
    const n = raw.toLowerCase().trim();
    if (GENRE_MAP[n]) {
      GENRE_MAP[n].forEach(c => categories.add(c));
    } else {
      for (const [key, cats] of Object.entries(GENRE_MAP)) {
        if (n.includes(key) || key.includes(n)) {
          cats.forEach(c => categories.add(c));
        }
      }
    }
  }
  return [...categories];
}

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

// ── YouTube search ──────────────────────────────────────────────────────────

async function searchYouTube(artistName, genre) {
  try {
    // Prefer "Topic" / audio versions — almost always embeddable
    const query = `${artistName} ${genre} audio`;
    const results = await ytsr(query, { limit: 10 });
    const video = results.items.find(item => {
      if (item.type !== 'video') return false;
      const dur = parseDuration(item.duration);
      // Filter out shorts (<1min) and long mixes (>10min)
      return dur > 60 && dur < 600;
    });
    return video?.id || null;
  } catch {
    return null;
  }
}

function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// ── Merge + build ───────────────────────────────────────────────────────────

async function main() {
  // Load seed data
  const seedPath = join(__dirname, 'seed-musicians.json');
  const seed = JSON.parse(readFileSync(seedPath, 'utf-8'));
  console.log(`Loaded ${seed.length} seed artists.`);

  // Build seed map (seed takes priority)
  const byName = new Map();
  for (const s of seed) {
    byName.set(s.name.toLowerCase(), s);
  }

  // Query Wikidata
  const wikidataArtists = await queryWikidata();

  // Merge: Wikidata artists that aren't already in seed
  for (const w of wikidataArtists) {
    const key = w.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, w);
    }
  }

  // Calculate Venus + fetch YouTube in batches of 5
  const musicians = [];
  const entries = [...byName.values()];
  console.log(`\nProcessing ${entries.length} total artists in batches...`);

  const BATCH_SIZE = 5;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (entry) => {
      try {
        const venus = calculateVenus(entry.birthDate);
        let videoId = entry.youtubeVideoId || null;

        if (!videoId) {
          const genreLabel = entry.genres[0] || 'electronic';
          videoId = await searchYouTube(entry.name, genreLabel);
        }

        if (!videoId) return null;

        return {
          name: entry.name,
          birthDate: entry.birthDate,
          venus,
          genres: entry.genres,
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

  // Sort by name
  musicians.sort((a, b) => a.name.localeCompare(b.name));

  // Write output
  const outDir = join(ROOT, 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'musicians.json');
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
