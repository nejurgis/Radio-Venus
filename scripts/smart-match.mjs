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
//   node scripts/smart-match.mjs "Tim Hecker" --filter        # Groq vibe check before saving
//   node scripts/smart-match.mjs "Burial" --depth 2 --filter  # combine freely
//
// Requires GROQ_API_KEY env var when using --filter.
//
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { categorizeGenres } from '../src/genres.js';

// Load .env (if present) without requiring a package
const __envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(__envPath)) {
  for (const line of readFileSync(__envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

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

// Browser-UA fetch — needed for sites with bot detection (e.g. RateYourMusic)
// Returns null on any error or non-200, never rejects.
function fetchTextBrowser(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchTextBrowser(res.headers.location).then(resolve, () => resolve(null));
      }
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function postJSON(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

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

// ── MusicBrainz: genre tags via MBID ────────────────────────────────────────
// Uses the MBID already fetched during birth date lookup for zero extra requests
// when available. Falls back to a name search when MBID is not known.

async function getMusicBrainzGenres(artistName, mbid = null) {
  try {
    let url;
    if (mbid) {
      // Direct lookup — precise, no ambiguity
      url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres&fmt=json`;
    } else {
      // Search by name, take top Person/Group match
      const search = await fetchJSON(
        `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`
      );
      const match = search.artists?.find(a => a.type === 'Person' || a.type === 'Group');
      if (!match) return [];
      url = `https://musicbrainz.org/ws/2/artist/${match.id}?inc=genres&fmt=json`;
      await delay(1000); // MB rate limit: 1 req/sec
    }
    const data = await fetchJSON(url);
    // genres sorted by vote count descending
    return (data.genres ?? [])
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .map(g => g.name);
  } catch {
    return [];
  }
}

// ── Everynoise: genre + similarity (Playwright headless, opt-in) ─────────────
// Enabled via --everynoise flag. Uses a single shared browser instance.
// Genres scraped from research.cgi, similar artists from artistprofile.cgi.

let _browser = null;

async function getPlaywrightBrowser() {
  if (_browser) return _browser;
  try {
    const { chromium } = (await import('playwright'));
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
  _browser.close().catch(() => {}); // fire-and-forget; Chromium may linger
  _browser = null;
}

async function getEverynoiseData(artistName, { genreOnly = false } = {}) {
  const browser = await getPlaywrightBrowser();
  if (!browser) return { genres: [], similar: [] };

  let page;
  try {
    page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Research page: genres for a specific artist
    const resUrl = `https://everynoise.com/research.cgi?name=${encodeURIComponent(artistName)}&mode=artist`;
    await page.goto(resUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000); // JS-rendered — needs time to load

    // #exact is a sibling setname div — the actual box is in #exact + div
    const genres = await page.$$eval(
      '#exact + div .note a[href*="mode=genre"]',
      els => els.map(el => el.textContent.trim()).filter(Boolean),
    ).catch(() => []);

    if (genres.length) console.log(`    Everynoise genres: [${genres.join(', ')}]`);

    // Skip artistprofile page when only genres are needed (saves ~5s per artist)
    if (genreOnly) return { genres, similar: [] };

    // Profile link → artist profile page with "fans also like" section
    const profileHref = await page.$eval(
      '#exact + div .artistname a[href^="artistprofile.cgi"]',
      el => el.getAttribute('href'),
    ).catch(() => null);

    let similar = [];
    if (profileHref) {
      await page.goto(`https://everynoise.com/${profileHref}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await page.waitForTimeout(5000);

      // "fans also like" names are in .falname a within #falcell
      similar = await page.$$eval(
        '#falcell .falname a',
        els => els.map(el => el.textContent.trim()).filter(Boolean),
      ).catch(() => []);
    }

    if (similar.length) console.log(`    Everynoise similar: ${similar.length} artists`);

    return { genres, similar };
  } catch (e) {
    console.log(`    Everynoise error for "${artistName}": ${e.message}`);
    return { genres: [], similar: [] };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ── Manual overrides (for artists invisible to all databases) ────────────────

const OVERRIDES_PATH = join(__dirname, 'manual-overrides.json');

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return {};
  try { return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')); }
  catch { return {}; }
}

// ── Birth date discovery (5-tier) ───────────────────────────────────────────

async function getRymBirthDate(artistName) {
  // Convert artist name to RYM URL slug (best-effort — works for ~90% of names)
  const slug = artistName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (é→e, ü→u, etc.)
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars, keep hyphens
    .trim()
    .replace(/\s+/g, '_');

  if (!slug) return null;

  const url = `https://rateyourmusic.com/artist/${slug}`;
  const html = await fetchTextBrowser(url);
  if (!html) return null;

  // Abort if we got a Cloudflare challenge page
  if (html.includes('cf-browser-verification') || html.includes('Checking your browser') || html.includes('cf_chl_')) {
    return null;
  }

  // RYM renders artist info as key/value pairs in the page text.
  // We search the raw text for "Born" followed by a recognisable date.
  const doc = cheerio.load(html);
  const pageText = doc('body').text();

  // "01 January 1970" or "January 1, 1970"
  const mDmy = pageText.match(/[Bb]orn[:\s]+(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})/);
  if (mDmy) {
    const [, d, month, y] = mDmy;
    const parsed = new Date(`${month} ${d}, ${y}`);
    if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  }

  const mMdy = pageText.match(/[Bb]orn[:\s]+([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mMdy) {
    const [, month, d, y] = mMdy;
    const parsed = new Date(`${month} ${d}, ${y}`);
    if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  }

  // ISO date near "Born"
  const mIso = pageText.match(/[Bb]orn[:\s]+(\d{4}-\d{2}-\d{2})/);
  if (mIso) return mIso[1];

  // Year only — use mid-year as approximation
  const mYear = pageText.match(/[Bb]orn[:\s]+(\d{4})\b/);
  if (mYear) {
    const year = parseInt(mYear[1]);
    if (year >= 1900 && year <= new Date().getFullYear()) return `${year}-06-15`;
  }

  return null;
}

async function getBirthDate(artistName) {
  // Strategy 0: Manual overrides (highest priority)
  const overrides = loadOverrides();
  const override = overrides[artistName] || overrides[artistName.toLowerCase()];
  if (override?.birthDate) {
    console.log(`    Found in manual-overrides.json`);
    return { date: override.birthDate, mbid: null };
  }

  // Strategy 1: Wikidata (structured, fast)
  let date = await getWikidataBirthDate(artistName);
  if (date) return { date, mbid: null };

  // Strategy 2: MusicBrainz (best for underground/electronic artists)
  console.log(`    Wikidata miss, trying MusicBrainz...`);
  const mbResult = await getMusicBrainzBirthDate(artistName);
  if (mbResult) return mbResult; // already { date, mbid }

  // Strategy 3: Wikipedia infobox deep scrape
  console.log(`    MusicBrainz miss, trying Wikipedia...`);
  date = await getWikipediaBirthDate(artistName);
  if (date) return { date, mbid: null };

  // Strategy 4: RateYourMusic artist page (best for underground/niche artists)
  console.log(`    Wikipedia miss, trying RateYourMusic...`);
  date = await getRymBirthDate(artistName);
  if (date) return { date, mbid: null };

  return null;
}

async function getMusicBrainzBirthDate(artistName) {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`;
  try {
    const data = await fetchJSON(url);
    if (!data.artists || data.artists.length === 0) return null;

    // Prefer a Person with a life-span begin date; fall back to Group
    const match =
      data.artists.find(a => a.type === 'Person' && a['life-span']?.begin) ||
      data.artists.find(a => a.type === 'Group' && a['life-span']?.begin);

    if (match && match['life-span'].begin) {
      const b = match['life-span'].begin;
      let dateStr;
      if (b.length === 10) dateStr = b;           // YYYY-MM-DD
      else if (b.length === 7) dateStr = `${b}-15`;  // YYYY-MM → mid-month
      else if (b.length === 4) dateStr = `${b}-06-15`; // YYYY → mid-year
      else return null;

      // Sanity check year
      const year = parseInt(dateStr.split('-')[0]);
      if (year < 1600 || year > new Date().getFullYear()) return null;

      return { date: dateStr, mbid: match.id };
    }
  } catch { return null; }
  return null;
}

async function getWikidataBirthDate(artistName) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(artistName)}&language=en&type=item&limit=5&format=json`;

  // Wikidata IDs for musical occupations and entity types
  const MUSIC_OCCUPATIONS = [
    'Q639669',   // musician
    'Q177220',   // singer
    'Q36834',    // composer
    'Q183945',   // record producer
    'Q855091',   // guitarist
    'Q386854',   // disc jockey
    'Q488205',   // singer-songwriter
    'Q158852',   // conductor
    'Q753110',   // songwriter
    'Q584301',   // electronic musician
  ];
  const MUSIC_INSTANCES = [
    'Q5',        // human (accept any human, occupation check narrows it)
    'Q215380',   // musical group
    'Q5741069',  // musical ensemble
  ];

  try {
    const searchData = await fetchJSON(searchUrl);
    if (!searchData.search || searchData.search.length === 0) return null;

    for (const result of searchData.search) {
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&props=claims&format=json`;
      const entityData = await fetchJSON(entityUrl);
      const entity = entityData.entities?.[result.id];
      if (!entity?.claims) continue;

      // Validate entity is a musician/band, not a random person/object
      const occupations = (entity.claims.P106 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const instances = (entity.claims.P31 || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

      const isMusician = occupations.some(id => MUSIC_OCCUPATIONS.includes(id));
      const isMusicalGroup = instances.some(id => ['Q215380', 'Q5741069'].includes(id));
      const isHuman = instances.includes('Q5');

      // Must be either a musician (human with music occupation) or a musical group
      if (!isMusicalGroup && !(isHuman && isMusician)) continue;

      // P569 = birth date (person), P571 = inception date (band/group)
      const dateClaim = entity.claims.P569?.[0] || entity.claims.P571?.[0];
      const dateValue = dateClaim?.mainsnak?.datavalue?.value?.time;
      if (!dateValue) continue;

      const dateMatch = dateValue.match(/([+-]?\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1].replace(/^\+/, '');
      const year = parseInt(dateStr.split('-')[0]);

      // Sanity check: reject dates before 1600 (covers classical composers)
      // or in the future
      if (year < 1600 || year > new Date().getFullYear()) continue;

      return dateStr;
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

// ── Groq vibe filter ────────────────────────────────────────────────────────

const GROQ_AESTHETIC = `Radio Venus is a music discovery app. Its aesthetic: underground, atmospheric, experimental, cerebral. Core genres: ambient, IDM, techno, darkwave, trip-hop, drum & bass, industrial, jazz, art pop, neo-classical. Reference points: Aphex Twin, Boards of Canada, Tim Hecker, Four Tet, Burial, Basic Channel, Arca, Flying Lotus, Grouper, Fennesz, Actress, Objekt, Shackleton, Jlin.

The app should feel like a well-curated record shop — not a streaming algorithm. Reject mainstream pop, generic radio artists, and anyone whose inclusion would feel incongruous next to the reference points above.`;

async function groqVibeFilter(artists) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('\n  ✗ GROQ_API_KEY not set — skipping filter, keeping all artists.');
    console.error('    export GROQ_API_KEY=your_key_here');
    return artists;
  }

  const BATCH = 10;
  const kept = [];
  const rejected = [];

  console.log(`\nGroq vibe filter — evaluating ${artists.length} artist(s) in batches of ${BATCH}...`);

  for (let i = 0; i < artists.length; i += BATCH) {
    const batch = artists.slice(i, i + BATCH);

    const list = batch.map((a, j) => {
      const venus = calculateVenus(a.birthDate);
      const tagInfo = a.rawTags?.length
        ? `Last.fm tags: ${a.rawTags.join(', ')}`
        : `genres: ${a.genres.join(', ')}`;
      return `${j + 1}. ${a.name} (${tagInfo}, Venus in ${venus})`;
    }).join('\n');

    const userPrompt = `${GROQ_AESTHETIC}\n\nEvaluate these artists for Radio Venus. For each, decide: does this artist genuinely fit the aesthetic?\n\n${list}\n\nReply ONLY with valid JSON: {"results": [{"name": "exact name as given", "keep": true, "reason": "one sentence"}]}`;

    try {
      const res = await postJSON(
        'api.groq.com',
        '/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a music curator. Reply only with valid JSON.' },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        },
        { Authorization: `Bearer ${apiKey}` },
      );

      if (res.status !== 200) {
        console.warn(`  ⚠ Groq returned ${res.status} — keeping batch as-is`);
        kept.push(...batch);
        continue;
      }

      const content = res.body?.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content);

      for (const result of parsed.results ?? []) {
        const artist = batch.find(a => a.name.toLowerCase() === result.name.toLowerCase());
        if (!artist) continue;
        if (result.keep) {
          console.log(`  ✓ ${artist.name} — ${result.reason}`);
          kept.push(artist);
        } else {
          console.log(`  ✗ ${artist.name} — ${result.reason}`);
          rejected.push(artist);
        }
      }

      // Artists Groq didn't mention — keep them (don't silently drop)
      const mentioned = new Set((parsed.results ?? []).map(r => r.name.toLowerCase()));
      for (const a of batch) {
        if (!mentioned.has(a.name.toLowerCase())) {
          console.log(`  ? ${a.name} — not evaluated by Groq, keeping`);
          kept.push(a);
        }
      }

    } catch (e) {
      console.warn(`  ⚠ Groq filter error: ${e.message} — keeping batch as-is`);
      kept.push(...batch);
    }

    if (i + BATCH < artists.length) await delay(1000);
  }

  console.log(`\n  Filter result: ${kept.length} kept, ${rejected.length} rejected`);
  if (rejected.length) console.log(`  Rejected: ${rejected.map(a => a.name).join(', ')}`);
  return kept;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const useFilter = args.includes('--filter');
  const depthFlag = args.indexOf('--depth');
  const depth = depthFlag >= 0 ? parseInt(args[depthFlag + 1]) || 1 : 1;
  const seedArtists = args.filter(a => !a.startsWith('--') && (depthFlag < 0 || args.indexOf(a) !== depthFlag + 1));

  if (seedArtists.length === 0) {
    console.log('Usage: node scripts/smart-match.mjs <Artist Name> [--dry-run] [--depth N] [--filter]');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/smart-match.mjs "Boards of Canada"');
    console.log('  node scripts/smart-match.mjs "Basic Channel" --dry-run');
    console.log('  node scripts/smart-match.mjs "Aphex Twin" --depth 2');
    console.log('  node scripts/smart-match.mjs "Tim Hecker" --filter       # Groq vibe check');
    console.log('  node scripts/smart-match.mjs "Burial" --depth 2 --filter # combine');
    process.exit(0);
  }

  // Load known artists
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const db = existsSync(DB_PATH) ? JSON.parse(readFileSync(DB_PATH, 'utf-8')) : [];
  const knownNames = new Set([...seed, ...db].map(a => a.name.toLowerCase()));
  const knownMbids = new Set([...seed, ...db].filter(a => a.mbid).map(a => a.mbid));

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
      let similar = await getSimilarArtists(artist);
      console.log(`  Found ${similar.length} similar artists on Last.fm`);
      await delay(500); // Be polite to Last.fm

      // Everynoise: always merge with Last.fm
      {
        const evnSeedData = await getEverynoiseData(artist);
        if (evnSeedData.similar.length > 0) {
          const existingLower = new Set(similar.map(n => n.toLowerCase()));
          const newFromEvn = evnSeedData.similar.filter(n => !existingLower.has(n.toLowerCase()));
          if (newFromEvn.length > 0) {
            console.log(`  Everynoise adds ${newFromEvn.length} unique artists (total pool: ${similar.length + newFromEvn.length})`);
            similar = [...similar, ...newFromEvn];
          } else {
            console.log(`  Everynoise found ${evnSeedData.similar.length} artists — all already in Last.fm list`);
          }
        }
      }

      for (const name of similar) {
        const key = name.toLowerCase();
        if (knownNames.has(key) || processed.has(key)) {
          continue;
        }

        // Get birth date (Wikidata -> MusicBrainz -> Wikipedia fallback)
        const birthResult = await getBirthDate(name);
        await delay(300);

        if (!birthResult) {
          console.log(`  - ${name}: no birth date found on Wikidata or Wikipedia`);
          continue;
        }

        const { date: birthDate, mbid } = birthResult;

        // Sanity check: reject implausibly old birth years (MusicBrainz often returns wrong person)
        const year = parseInt(birthDate.split('-')[0]);
        if (year < 1940) {
          console.log(`  - ${name} (${birthDate}): implausible birth year — skipping`);
          continue;
        }

        // MBID deduplication (catches rename/alias cases like Clark vs Chris Clark)
        if (mbid && knownMbids.has(mbid)) {
          console.log(`  - ${name}: MBID already in DB — skipping duplicate`);
          knownNames.add(key);
          continue;
        }

        // Get genres: override > Everynoise (primary) > Last.fm tags (fallback)
        const overrides = loadOverrides();
        const ov = overrides[name] || overrides[name.toLowerCase()];
        let genres;
        let rawTags = [];
        if (ov?.genres?.length) {
          genres = ov.genres;
        } else {
          // Primary: Everynoise — curated, consistent with verification pipeline
          const evn = await getEverynoiseData(name, { genreOnly: true });
          if (evn.genres.length) {
            rawTags = evn.genres;
            genres = categorizeGenres(rawTags);
          }
          // Fallback: Last.fm tags — for artists not on Everynoise
          if (genres.length === 0) {
            console.log(`    No genres from Everynoise — trying Last.fm...`);
            rawTags = await getLastfmTags(name);
            await delay(300);
            genres = categorizeGenres(rawTags);
          }
        }

        if (genres.length === 0) {
          console.log(`  - ${name} (${birthDate}): no matching genres`);
          continue;
        }

        const venus = calculateVenus(birthDate);
        console.log(`  + ${name} — born ${birthDate} — Venus in ${venus} — [${genres.join(', ')}]`);

        discovered.push({ name, birthDate, ...(mbid ? { mbid } : {}), rawTags, genres });
        knownNames.add(key);
        if (mbid) knownMbids.add(mbid);
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
    await closePlaywright();
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

  // Groq vibe filter (runs before dry-run check so you can preview results)
  let toAdd = discovered;
  if (useFilter && discovered.length > 0) {
    toAdd = await groqVibeFilter(discovered);
  }

  if (dryRun) {
    console.log('\n--dry-run: Not writing to seed file.');
    console.log('Remove --dry-run to save these artists.');
    await closePlaywright();
    return;
  }

  if (toAdd.length === 0) {
    console.log('\nNo artists passed the filter. Nothing written.');
    await closePlaywright();
    return;
  }

  // Add to seed (strip rawTags — runtime-only, not persisted)
  for (const a of toAdd) {
    const { rawTags, ...entry } = a;
    seed.push(entry);
  }
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
  console.log(`\nWrote ${seed.length} total artists to ${SEED_PATH}`);
  console.log('Run "node scripts/build-db.mjs" to fetch YouTube links and rebuild the database.');

  await closePlaywright();
}

main()
  .then(() => process.exit(0))
  .catch(async err => {
    console.error('Smart match failed:', err);
    await closePlaywright();
    process.exit(1);
  });
