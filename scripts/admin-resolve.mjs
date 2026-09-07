#!/usr/bin/env node
// ── admin-resolve.mjs ────────────────────────────────────────────────────────
// "Add artist from a link" — lookup half of the admin web tool's pipeline.
// Given a YouTube or Spotify URL, resolves the artist, its birth date,
// genre tags + similar artists (Last.fm), and a YouTube video per candidate
// (cosine.club, falling back to yt-search) so the admin UI can preview
// before committing.
//
// Everynoise was the original genre/similarity source but started returning
// 403 site-wide as of 2026-09-07 (see memory logs/2026-09-07-en-artistprofile-blocked.md).
// Last.fm (artist.gettoptags / artist.getsimilar) + cosine.club replace it —
// plain REST APIs, no browser automation needed.
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
  getLastfmTags, getLastfmSimilar, cosineFindTrack, findYouTubeId, postJSON,
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

async function resolveYouTubeId(artistName, trackHint, directId) {
  if (directId) return directId;
  const cosineHit = await cosineFindTrack(artistName, trackHint);
  if (cosineHit?.video_id) return cosineHit.video_id;
  return findYouTubeId(artistName, trackHint);
}

async function enrichCandidate(seedNames, seedSpotifyIds, cand) {
  const tags = await getLastfmTags(cand.name);
  const genres    = categorizeGenres(tags);
  const subgenres = categorizeSubgenres(tags);
  if (!genres.length) return null;

  const birth = await getBirthDate(cand.name);
  if (!birth) return null;
  const year = parseInt(birth.date);
  if (year < 1901) return null;

  const youtubeVideoId = await resolveYouTubeId(cand.name, null, null);

  return {
    name: cand.name,
    birthDate: birth.date,
    dateType: birth.isReleaseDate ? 'release' : 'birth',
    mbid: birth.mbid ?? null,
    venus: calculateVenus(birth.date),
    genres, subgenres,
    enTags: tags,
    tagSource: 'lastfm',
    lastfmMatch: cand.match,
    youtubeVideoId,
    alreadyInSeed: seedNames.has(cand.name.toLowerCase()),
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

  console.log('  Last.fm tags...');
  const tags = await getLastfmTags(resolved.artistName);
  const genres    = categorizeGenres(tags);
  const subgenres = categorizeSubgenres(tags);

  console.log('  Birth date lookup...');
  const birth = await getBirthDate(resolved.artistName);
  if (!birth) {
    await report({ status: 'error', message: `Could not find a birth date for "${resolved.artistName}".` });
    return;
  }

  const youtubeVideoId = await resolveYouTubeId(resolved.artistName, resolved.trackName, resolved.youtubeVideoId);

  const artist = {
    name: resolved.artistName,
    birthDate: birth.date,
    dateType: birth.isReleaseDate ? 'release' : 'birth',
    mbid: birth.mbid ?? null,
    venus: calculateVenus(birth.date),
    genres, subgenres,
    enTags: tags,
    tagSource: 'lastfm',
    spotifyId: resolved.spotifyId,
    spotifyFollowers: resolved.spotifyFollowers ?? null,
    youtubeVideoId: youtubeVideoId ?? null,
    handpickedTrack: resolved.trackName ?? null,
    alreadyInSeed,
  };

  console.log(`  Venus: ${artist.venus} — genres: [${genres.join(', ') || 'none'}]`);

  console.log('  Last.fm similar artists...');
  const rawSimilar = await getLastfmSimilar(resolved.artistName, 25);
  // Drop collab-credit entries ("X & Y", "X vs Y", "X feat. Y") — Last.fm's
  // similarity graph surfaces these as if they were standalone artists, but
  // they're not a real single entity with their own identity/birth date.
  const isCollabCredit = name => /\s(&|vs\.?|x|feat\.?|featuring)\s/i.test(name);
  const shortlist = rawSimilar
    .filter(c => !seedNames.has(c.name.toLowerCase()))
    .filter(c => !isCollabCredit(c.name))
    .slice(0, MAX_SIMILAR);

  console.log(`  Enriching ${shortlist.length} similar-artist candidates...`);
  const similar = [];
  for (const cand of shortlist) {
    console.log(`    ▸ ${cand.name} (match ${cand.match.toFixed(2)})`);
    const enriched = await enrichCandidate(seedNames, seedSpotifyIds, cand);
    if (enriched) similar.push(enriched);
  }

  await report({ status: 'done', artist, similar });
  console.log(`Done — ${similar.length} similar artists ready for preview.`);
}

main().catch(async e => {
  console.error('Fatal:', e);
  await report({ status: 'error', message: e.message });
  process.exit(1);
});
