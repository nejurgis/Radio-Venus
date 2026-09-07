#!/usr/bin/env node
// ── admin-resolve.mjs ────────────────────────────────────────────────────────
// "Add artist from a link" — lookup half of the admin web tool's pipeline.
// Given a YouTube or Spotify URL, resolves the artist, its birth date, genre
// tags (Last.fm), and TWO similar-artist axes for the preview UI:
//   - "similar"      — Last.fm's scrobble-graph (artist.getsimilar)
//   - "similarAudio" — cosine.club's audio-similarity model (track-level)
// Each candidate carries a songUrl so the admin can listen before adding.
//
// Everynoise was the original genre/similarity source but started returning
// 403 site-wide as of 2026-09-07 (see memory logs/2026-09-07-en-artistprofile-blocked.md).
// Last.fm + cosine.club replace it — plain REST APIs, no browser automation.
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
  getLastfmTags, getLastfmSimilar, cosineFindTrack, cosineSimilarTracks,
  findYouTubeId, postJSON,
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

function songUrl(videoId) {
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

async function resolveYouTubeId(artistName, trackHint, directId) {
  if (directId) return directId;
  const cosineHit = await cosineFindTrack(artistName, trackHint);
  if (cosineHit?.video_id) return cosineHit.video_id;
  return findYouTubeId(artistName, trackHint);
}

// Drop collab-credit entries ("X & Y", "X vs Y", "X feat. Y") — both Last.fm's
// and cosine's similarity graphs surface these as if they were standalone
// artists, but they're not a real single entity with their own birth date.
const isCollabCredit = name => /\s(&|vs\.?|x|feat\.?|featuring)\s/i.test(name);

// cand: { name, match: 0-1, matchedTrack?: string, youtubeVideoId?: string|null }
async function enrichCandidate(seedNames, source, cand) {
  const tags = await getLastfmTags(cand.name);
  const genres    = categorizeGenres(tags);
  const subgenres = categorizeSubgenres(tags);
  if (!genres.length) return null;

  const birth = await getBirthDate(cand.name);
  if (!birth) return null;
  const year = parseInt(birth.date);
  if (year < 1901) return null;

  const youtubeVideoId = await resolveYouTubeId(cand.name, cand.matchedTrack, cand.youtubeVideoId);

  return {
    name: cand.name,
    birthDate: birth.date,
    dateType: birth.isReleaseDate ? 'release' : 'birth',
    mbid: birth.mbid ?? null,
    venus: calculateVenus(birth.date),
    genres, subgenres,
    enTags: tags,
    tagSource: 'lastfm',
    source,
    match: cand.match,
    matchedTrack: cand.matchedTrack ?? null,
    youtubeVideoId,
    songUrl: songUrl(youtubeVideoId),
    alreadyInSeed: seedNames.has(cand.name.toLowerCase()),
  };
}

async function enrichShortlist(seedNames, source, candidates) {
  const results = [];
  for (const cand of candidates) {
    console.log(`    ▸ [${source}] ${cand.name} (match ${cand.match.toFixed(2)})${cand.matchedTrack ? ` — "${cand.matchedTrack}"` : ''}`);
    const enriched = await enrichCandidate(seedNames, source, cand);
    if (enriched) results.push(enriched);
  }
  return results;
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
    songUrl: songUrl(youtubeVideoId),
    handpickedTrack: resolved.trackName ?? null,
    alreadyInSeed,
  };

  console.log(`  Venus: ${artist.venus} — genres: [${genres.join(', ') || 'none'}]`);

  // ── Axis 1: Last.fm scrobble-graph similarity ───────────────────────────
  console.log('  Last.fm similar artists...');
  const rawLastfm = await getLastfmSimilar(resolved.artistName, 25);
  const lastfmShortlist = rawLastfm
    .filter(c => !seedNames.has(c.name.toLowerCase()))
    .filter(c => !isCollabCredit(c.name))
    .slice(0, MAX_SIMILAR);

  console.log(`  Enriching ${lastfmShortlist.length} Last.fm candidates...`);
  const similar = await enrichShortlist(seedNames, 'lastfm', lastfmShortlist);

  // ── Axis 2: cosine.club audio similarity (needs a cosine track match first) ─
  console.log('  cosine.club audio similarity...');
  let similarAudio = [];
  const cosineTrack = await cosineFindTrack(resolved.artistName, resolved.trackName);
  if (cosineTrack) {
    const alreadyShown = new Set([resolved.artistName.toLowerCase(), ...similar.map(s => s.name.toLowerCase())]);
    const rawCosine = await cosineSimilarTracks(cosineTrack.id, 20);
    const seenCosineNames = new Set();
    const cosineShortlist = rawCosine
      .filter(c => !seedNames.has(c.name.toLowerCase()))
      .filter(c => !alreadyShown.has(c.name.toLowerCase()))
      .filter(c => !isCollabCredit(c.name))
      .filter(c => { // dedupe: cosine can return multiple tracks by the same artist
        const key = c.name.toLowerCase();
        if (seenCosineNames.has(key)) return false;
        seenCosineNames.add(key);
        return true;
      })
      .slice(0, MAX_SIMILAR);
    console.log(`  Enriching ${cosineShortlist.length} cosine candidates...`);
    similarAudio = await enrichShortlist(seedNames, 'cosine', cosineShortlist);
  } else {
    console.log('  No cosine track match for this artist — skipping audio-similarity axis.');
  }

  await report({ status: 'done', artist, similar, similarAudio });
  console.log(`Done — ${similar.length} Last.fm + ${similarAudio.length} cosine similar artists ready for preview.`);
}

main().catch(async e => {
  console.error('Fatal:', e);
  await report({ status: 'error', message: e.message });
  process.exit(1);
});
