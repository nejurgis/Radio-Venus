#!/usr/bin/env node
// ── admin-resolve.mjs ────────────────────────────────────────────────────────
// "Add artist from a link" — lookup half of the admin web tool's pipeline.
// Given a YouTube or Spotify URL, resolves the artist, its birth date,
// Everynoise genres, and a shortlist of EN "fans also like" similar artists
// (each fully enriched) so the admin UI can preview before committing.
//
// Usage (local testing, prints JSON to stdout):
//   node scripts/admin-resolve.mjs --url="https://open.spotify.com/artist/..."
//
// Usage (from GH Actions — posts result to the admin Worker instead):
//   node scripts/admin-resolve.mjs --url="..." --job=ID --callback=URL --secret=TOKEN
//
import { categorizeGenres, categorizeSubgenres } from '../src/genres.js';
import {
  loadEnv, SEED_PATH, resolveFromUrl, getBirthDate, calculateVenus,
  resolveSpotifyIdViaEN, scrapeENProfile, findYouTubeId,
  closeBrowser, postJSON,
} from './lib/enrich.mjs';
import { readFileSync } from 'node:fs';

loadEnv();

const args     = process.argv.slice(2);
const arg      = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const url      = arg('url');
const jobId    = arg('job');
const callback = arg('callback');
const secret   = arg('secret');
const MAX_SIMILAR = 10;

if (!url) {
  console.error('Usage: node scripts/admin-resolve.mjs --url="<youtube-or-spotify-link>" [--job=ID --callback=URL --secret=TOKEN]');
  process.exit(1);
}

async function report(payload) {
  if (callback && jobId) {
    const res = await postJSON(`${callback.replace(/\/$/, '')}/api/jobs/${jobId}/result`, payload, {
      Authorization: `Bearer ${secret}`,
    });
    if (res.status >= 300) console.error(`Callback failed: HTTP ${res.status} ${res.body}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

function loadSeed() {
  return JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
}

async function enrichCandidate(seed, seedNames, seedSpotifyIds, cand) {
  const genres    = categorizeGenres(cand.tags);
  const subgenres = categorizeSubgenres(cand.tags);
  if (!genres.length) return null;

  const birth = await getBirthDate(cand.name);
  if (!birth) return null;
  const year = parseInt(birth.date);
  if (year < 1901) return null;

  const youtubeVideoId = await findYouTubeId(cand.name);

  return {
    name: cand.name,
    birthDate: birth.date,
    dateType: birth.isReleaseDate ? 'release' : 'birth',
    mbid: birth.mbid ?? null,
    venus: calculateVenus(birth.date),
    genres, subgenres,
    enTags: cand.tags,
    spotifyId: cand.spotifyId,
    spotifyFollowers: cand.followers,
    youtubeVideoId,
    alreadyInSeed: seedNames.has(cand.name.toLowerCase()) || seedSpotifyIds.has(cand.spotifyId),
  };
}

async function main() {
  const seed           = loadSeed();
  const seedNames       = new Set(seed.map(a => a.name.toLowerCase()));
  const seedSpotifyIds  = new Set(seed.map(a => a.spotifyId).filter(Boolean));

  console.log(`Resolving: ${url}`);
  const resolved = await resolveFromUrl(url);
  console.log(`  → ${resolved.artistName}${resolved.trackName ? ` — "${resolved.trackName}"` : ''}`);

  const alreadyInSeed =
    seedNames.has(resolved.artistName.toLowerCase()) ||
    (resolved.spotifyId && seedSpotifyIds.has(resolved.spotifyId));

  // Spotify ID: use what we resolved directly, else fall back to EN name search.
  let spotifyId = resolved.spotifyId;
  if (!spotifyId) {
    console.log('  Resolving Spotify ID via Everynoise...');
    spotifyId = await resolveSpotifyIdViaEN(resolved.artistName);
  }

  if (!spotifyId) {
    await report({ status: 'error', message: `Could not resolve "${resolved.artistName}" on Everynoise or Spotify.` });
    await closeBrowser();
    return;
  }

  console.log('  Scraping Everynoise profile (genres + fans also like)...');
  const { tags, candidates } = await scrapeENProfile(spotifyId);
  const genres    = categorizeGenres(tags);
  const subgenres = categorizeSubgenres(tags);

  console.log('  Birth date lookup...');
  const birth = await getBirthDate(resolved.artistName);
  if (!birth) {
    await report({ status: 'error', message: `Could not find a birth date for "${resolved.artistName}".` });
    await closeBrowser();
    return;
  }

  let youtubeVideoId = resolved.youtubeVideoId;
  if (!youtubeVideoId) {
    console.log('  Searching YouTube...');
    youtubeVideoId = await findYouTubeId(resolved.artistName, resolved.trackName);
  }

  const artist = {
    name: resolved.artistName,
    birthDate: birth.date,
    dateType: birth.isReleaseDate ? 'release' : 'birth',
    mbid: birth.mbid ?? null,
    venus: calculateVenus(birth.date),
    genres, subgenres,
    enTags: tags,
    spotifyId,
    spotifyFollowers: resolved.spotifyFollowers ?? null,
    youtubeVideoId: youtubeVideoId ?? null,
    handpickedTrack: resolved.trackName ?? null,
    alreadyInSeed,
  };

  console.log(`  Venus: ${artist.venus} — genres: [${genres.join(', ') || 'none'}]`);

  // Shortlist similar artists: not already known, has mappable genres, top by followers.
  const shortlist = candidates
    .filter(c => !seedNames.has(c.name.toLowerCase()) && !seedSpotifyIds.has(c.spotifyId))
    .filter(c => categorizeGenres(c.tags).length > 0)
    .sort((a, b) => b.followers - a.followers)
    .slice(0, MAX_SIMILAR);

  console.log(`  Enriching ${shortlist.length} similar-artist candidates...`);
  const similar = [];
  for (const cand of shortlist) {
    console.log(`    ▸ ${cand.name}`);
    const enriched = await enrichCandidate(seed, seedNames, seedSpotifyIds, cand);
    if (enriched) similar.push(enriched);
  }

  await closeBrowser();
  await report({ status: 'done', artist, similar });
  console.log(`Done — ${similar.length} similar artists ready for preview.`);
}

main().catch(async e => {
  console.error('Fatal:', e);
  await closeBrowser();
  await report({ status: 'error', message: e.message });
  process.exit(1);
});
