// ── enrich.mjs ───────────────────────────────────────────────────────────────
// Shared single-artist enrichment pipeline used by admin-resolve.mjs.
// Extracted from import-spotify.mjs / en-discover.mjs (same logic, DRYed up
// for the "add one artist from a link" flow instead of CSV batch imports).

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const require  = createRequire(import.meta.url);
const Astronomy = require('astronomy-engine');
const ytSearch  = require('yt-search');

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT       = join(__dirname, '..', '..');
export const SEED_PATH  = join(ROOT, 'scripts', 'seed-musicians.json');

// ── .env ─────────────────────────────────────────────────────────────────────

export function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

export function fetchText(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RadioVenus/1.0 (music discovery)', ...extraHeaders } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchText(res.headers.location, extraHeaders).then(resolve, reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export function fetchJSON(url, extraHeaders = {}) {
  return fetchText(url, { Accept: 'application/json', ...extraHeaders }).then(t => JSON.parse(t));
}

export function postJSON(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search, protocol } = new URL(url);
    const bodyBuf = Buffer.from(JSON.stringify(body));
    const lib = protocol === 'http:' ? require('node:http') : https;
    const req = lib.request({
      method: 'POST', hostname, path: pathname + (search || ''),
      headers: { 'Content-Type': 'application/json', 'Content-Length': bodyBuf.length, ...extraHeaders },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

export const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Venus ────────────────────────────────────────────────────────────────────

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
];

export function calculateVenus(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const geo = Astronomy.GeoVector(Astronomy.Body.Venus, date, true);
  const lon = Astronomy.Ecliptic(geo).elon;
  return SIGNS[Math.floor(lon / 30)];
}

export function normalizeDate(dateStr) {
  let [y, m, d] = dateStr.split('-').map(Number);
  if (!m || m === 0) { m = 6; d = 15; }
  else if (!d || d === 0) { d = 15; }
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ── Spotify Web API (client credentials — no user auth) ──────────────────────

let _spotifyToken = null;
let _spotifyTokenExpiry = 0;

export async function getSpotifyToken() {
  if (_spotifyToken && Date.now() < _spotifyTokenExpiry) return _spotifyToken;
  const id     = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const req = https.request({
      method: 'POST', hostname: 'accounts.spotify.com', path: '/api/token',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, r => { let d=''; r.on('data', c=>d+=c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.end(body);
  });
  if (!res.access_token) return null;
  _spotifyToken = res.access_token;
  _spotifyTokenExpiry = Date.now() + (res.expires_in - 60) * 1000;
  return _spotifyToken;
}

export async function spotifyGet(path) {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    return await fetchJSON(`https://api.spotify.com/v1${path}`, { Authorization: `Bearer ${token}` });
  } catch { return null; }
}

// ── Resolve artist identity from a pasted link ────────────────────────────────
// Returns { artistName, trackName, spotifyId, youtubeVideoId, spotifyFollowers }

export async function resolveFromUrl(rawUrl) {
  const url = rawUrl.trim();

  const spotifyTrack  = url.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  const spotifyArtist = url.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/) || url.match(/spotify:artist:([A-Za-z0-9]+)/);
  const youtubeVideo  = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/);

  if (spotifyTrack) {
    const track = await spotifyGet(`/tracks/${spotifyTrack[1]}`);
    if (!track) throw new Error('Could not resolve Spotify track via API');
    const artist = track.artists?.[0];
    const full = await spotifyGet(`/artists/${artist.id}`);
    return {
      artistName: artist.name,
      trackName: track.name,
      spotifyId: artist.id,
      spotifyFollowers: full?.followers?.total ?? null,
      youtubeVideoId: null,
    };
  }

  if (spotifyArtist) {
    const artist = await spotifyGet(`/artists/${spotifyArtist[1]}`);
    if (!artist) throw new Error('Could not resolve Spotify artist via API');
    return {
      artistName: artist.name,
      trackName: null,
      spotifyId: artist.id,
      spotifyFollowers: artist.followers?.total ?? null,
      youtubeVideoId: null,
    };
  }

  if (youtubeVideo) {
    const videoId = youtubeVideo[1];
    const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
    // Prefer "Artist - Track" parsed from the title over the channel name —
    // full-album/compilation uploads are very often on a reuploader's channel
    // that has nothing to do with the artist (e.g. a channel named "DJ基礎知識"
    // hosting "Éliane Radigue - Occam Ocean 3 (2021) FULL ALBUM"), while the
    // title itself reliably names the real artist. Officially-uploaded videos
    // (author "Artist - Topic", title just the track name) have no dash to
    // split on, so they fall through to the channel-name path unaffected.
    let artistName, trackName;
    const dashSplit = oembed.title?.split(/\s[-–]\s/);
    if (dashSplit?.length >= 2) {
      artistName = dashSplit[0].trim();
      trackName  = dashSplit.slice(1).join(' - ').trim();
    } else {
      artistName = oembed.author_name?.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
      trackName  = oembed.title;
    }
    if (!artistName) throw new Error('Could not determine artist name from YouTube video');

    // Try to attach a Spotify ID via search (best-effort — EN lookup can fall back to name search)
    const search = await spotifyGet(`/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`);
    const match = search?.artists?.items?.[0];

    return {
      artistName,
      trackName,
      spotifyId: match?.name?.toLowerCase() === artistName.toLowerCase() ? match.id : null,
      spotifyFollowers: match?.followers?.total ?? null,
      youtubeVideoId: videoId,
    };
  }

  throw new Error('Link is not a recognized YouTube or Spotify URL');
}

// Accepts either a link (delegates to resolveFromUrl) or free text —
// "Artist - Song" or just an artist name — resolved via Last.fm's track
// search instead. Same output shape either way.
export async function resolveInput(input) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed) || /^spotify:artist:/i.test(trimmed)) {
    return resolveFromUrl(trimmed);
  }

  const hit = await lastfmSearchTrack(trimmed);
  if (!hit) throw new Error(`No Last.fm match for "${trimmed}"`);

  // Best-effort Spotify ID for the artist (not required — Last.fm/cosine/
  // birth-date lookups all key off the name, this just enriches spotifyId).
  const search = await spotifyGet(`/search?q=${encodeURIComponent(hit.artistName)}&type=artist&limit=1`);
  const match = search?.artists?.items?.[0];

  return {
    artistName: hit.artistName,
    trackName: hit.trackName,
    spotifyId: match?.name?.toLowerCase() === hit.artistName.toLowerCase() ? match.id : null,
    spotifyFollowers: match?.followers?.total ?? null,
    youtubeVideoId: null,
  };
}

// ── Birth date lookup chain (Wikidata → MusicBrainz → Wikipedia) ─────────────

const MUSIC_OCCUPATIONS = [
  'Q639669','Q177220','Q36834','Q183945','Q855091',
  'Q386854','Q488205','Q158852','Q753110','Q584301',
];

async function getWikidataBirthDate(name) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
    `&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json`;
  try {
    const searchData = await fetchJSON(searchUrl);
    if (!searchData.search?.length) return null;
    for (const result of searchData.search) {
      await delay(100);
      const entityData = await fetchJSON(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${result.id}&props=claims&format=json`
      );
      const entity = entityData.entities?.[result.id];
      if (!entity?.claims) continue;
      const occupations = (entity.claims.P106 ?? []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const instances   = (entity.claims.P31  ?? []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      const isMusician     = occupations.some(id => MUSIC_OCCUPATIONS.includes(id));
      const isMusicalGroup = instances.some(id => ['Q215380','Q5741069'].includes(id));
      const isHuman        = instances.includes('Q5');
      if (!isMusicalGroup && !(isHuman && isMusician)) continue;
      const dateClaim = entity.claims.P569?.[0] ?? entity.claims.P571?.[0];
      const dateValue = dateClaim?.mainsnak?.datavalue?.value?.time;
      if (!dateValue) continue;
      const m = dateValue.match(/([+-]?\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      return normalizeDate(m[1].replace(/^\+/, ''));
    }
  } catch { /* fall through */ }
  return null;
}

async function getMusicBrainzBirthDate(name) {
  try {
    const data = await fetchJSON(
      `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json`
    );
    if (!data.artists?.length) return null;
    const match =
      data.artists.find(a => a.type === 'Person' && a['life-span']?.begin) ||
      data.artists.find(a => a.type === 'Group'  && a['life-span']?.begin);
    if (!match) return null;
    const b = match['life-span'].begin;
    let dateStr;
    if (b.length === 10) dateStr = b;
    else if (b.length === 7) dateStr = `${b}-15`;
    else if (b.length === 4) dateStr = `${b}-06-15`;
    else return null;
    dateStr = normalizeDate(dateStr);
    const year = parseInt(dateStr);
    if (year < 1600 || year > new Date().getFullYear()) return null;
    return { date: dateStr, mbid: match.id };
  } catch { return null; }
}

async function getWikipediaBirthDate(name) {
  for (const title of [name, `${name} (musician)`, `${name} (band)`]) {
    try {
      const data = await fetchJSON(
        `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content` +
        `&rvsection=0&titles=${encodeURIComponent(title)}&format=json&redirects=1`
      );
      const pages  = data.query.pages;
      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') continue;
      const content = pages[pageId].revisions?.[0]?.['*'];
      if (!content) continue;
      const t = content.match(/\{\{[Bb]irth date(?:\s+and\s+age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})/);
      if (t) return `${t[1]}-${t[2].padStart(2,'0')}-${t[3].padStart(2,'0')}`;
      const iso = content.match(/(?:born|birth_date)[^}]*?(\d{4}-\d{2}-\d{2})/);
      if (iso) return iso[1];
    } catch { continue; }
  }
  return null;
}

export function loadOverrides() {
  const p = join(ROOT, 'scripts', 'manual-overrides.json');
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {}; }
  catch { return {}; }
}

// Wikidata/MusicBrainz occasionally rate-limit or hiccup transiently — the
// same artist can succeed on one call and fail on the very next (observed
// directly: "Tashi Wada" resolved, then failed twice in immediate succession
// with no code change between calls). One retry after a backoff recovers
// most of these without masking a genuinely-nonexistent birth date.
async function getBirthDateOnce(name, releaseDate) {
  const overrides = loadOverrides();
  const ov = overrides[name] ?? overrides[name.toLowerCase()];
  if (ov?.birthDate) return { date: ov.birthDate, mbid: null };

  const wd = await getWikidataBirthDate(name);
  if (wd) return { date: wd, mbid: null };

  await delay(1000);
  const mb = await getMusicBrainzBirthDate(name);
  if (mb) return mb;

  const wp = await getWikipediaBirthDate(name);
  if (wp) return { date: wp, mbid: null };

  if (releaseDate && /^\d{4}/.test(releaseDate)) {
    const normalized = releaseDate.length === 4
      ? `${releaseDate}-06-15`
      : releaseDate.slice(0, 10);
    return { date: normalized, mbid: null, isReleaseDate: true };
  }
  return null;
}

export async function getBirthDate(name, releaseDate) {
  const first = await getBirthDateOnce(name, releaseDate);
  if (first) return first;
  await delay(1500);
  return getBirthDateOnce(name, releaseDate);
}

// ── Last.fm: genre tags + similar-artist discovery ────────────────────────────
// Replaces Everynoise as of 2026-09-07 (EN's artistprofile.cgi/research.cgi
// started returning 403 site-wide — see memory logs/2026-09-07-en-artistprofile-blocked.md).
// Plain REST, no browser automation needed.

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lastfmCall(params) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({ ...params, api_key: key, format: 'json' });
  try {
    const data = await fetchJSON(`${LASTFM_BASE}?${qs}`);
    if (data.error) return null;
    return data;
  } catch { return null; }
}

// Genre tags for an artist — Last.fm's community tag cloud, same role EN's
// "Spotify genre-ish tags" played. Feed straight into categorizeGenres/Subgenres.
export async function getLastfmTags(artistName) {
  const data = await lastfmCall({ method: 'artist.gettoptags', artist: artistName });
  const tags = data?.toptags?.tag ?? [];
  return tags.map(t => t.name).filter(Boolean);
}

// Free-text search — "Artist - Song" (or just an artist name) → best match.
// Used when the admin types a search instead of pasting a link.
export async function lastfmSearchTrack(query) {
  const dashSplit = query.split(/\s[-–]\s/);
  const params = dashSplit.length >= 2
    ? { method: 'track.search', track: dashSplit.slice(1).join(' - ').trim(), artist: dashSplit[0].trim(), limit: '5' }
    : { method: 'track.search', track: query, limit: '5' };
  const data = await lastfmCall(params);
  const hits = data?.results?.trackmatches?.track;
  const list = Array.isArray(hits) ? hits : hits ? [hits] : [];
  if (!list.length) return null;
  return { artistName: list[0].artist, trackName: list[0].name };
}

// Similar artists via Last.fm's scrobble-graph — replaces EN "fans also like".
export async function getLastfmSimilar(artistName, limit = 15) {
  const data = await lastfmCall({ method: 'artist.getsimilar', artist: artistName, limit: String(limit) });
  const artists = data?.similarartists?.artist ?? [];
  return artists.map(a => ({ name: a.name, match: parseFloat(a.match) || 0 })).filter(a => a.name);
}

// ── cosine.club: audio-similarity + direct YouTube track resolution ──────────

const COSINE_BASE = 'https://cosine.club/api/v1';

async function cosineCall(path, params = {}) {
  const key = process.env.COSINE_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams(params);
  try {
    return await fetchJSON(`${COSINE_BASE}${path}?${qs}`, { Authorization: `Bearer ${key}` });
  } catch { return null; }
}

// Best-effort track match for an artist (used to grab a YouTube video_id
// without a separate yt-search call). Not a precise "official track" pick —
// just the top search hit for the artist name.
export async function cosineFindTrack(artistName, trackHint) {
  const q = trackHint ? `${artistName} ${trackHint}` : artistName;
  const data = await cosineCall('/search', { q, limit: '5' });
  const hits = data?.data ?? [];
  const match = hits.find(h => h.artist?.toLowerCase() === artistName.toLowerCase()) ?? hits[0];
  return match ?? null;
}

export async function cosineLookupByUrl(url) {
  const data = await cosineCall('/tracks/lookup', { url });
  return data?.data?.[0] ?? null;
}

// Audio-similarity candidates for a track — separate discovery axis from
// Last.fm's scrobble-graph similarity. Each hit already carries a YouTube
// video_id, so no separate yt-search/cosineFindTrack call needed per candidate.
export async function cosineSimilarTracks(trackId, limit = 15) {
  const data = await cosineCall(`/tracks/${trackId}/similar`, { limit: String(limit) });
  const hits = data?.data?.similar_tracks ?? [];
  return hits.map(t => ({
    name: t.artist,
    matchedTrack: t.track,
    youtubeVideoId: t.video_id ?? null,
    match: t.score ?? 0,
  })).filter(h => h.name);
}

// ── YouTube search ────────────────────────────────────────────────────────────

export async function findYouTubeId(artistName, hint) {
  const queries = hint
    ? [`${artistName} ${hint}`, `${artistName} "${hint}" official audio`]
    : [`${artistName} full album`, `${artistName} topic`];
  for (const q of queries) {
    try {
      const result = await ytSearch(q);
      const video = result.videos.slice(0, 5).find(v => v.seconds > 60 && v.seconds < 10800);
      if (video) return video.videoId;
    } catch { /* continue */ }
    await delay(300);
  }
  return null;
}
