#!/usr/bin/env node
// ── enrich-spotify.mjs ──────────────────────────────────────────────────────
// Adds spotifyId to seed-musicians.json via Spotify Search API.
// Uses client credentials flow — no user auth or Premium needed.
//
// Usage:
//   node scripts/enrich-spotify.mjs [--dry-run] [--limit=N] [--skip=N] [--report]
//
// Flags:
//   --dry-run    Show matches without writing to seed
//   --limit=N    Process only N artists (good for testing)
//   --skip=N     Skip first N artists (resume after interruption)
//   --report     Print unmatched artists at the end

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

// ── Load .env ────────────────────────────────────────────────────────────────

const __envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(__envPath)) {
  for (const line of readFileSync(__envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REPORT  = args.includes('--report');
const LIMIT   = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0') || 0;
const SKIP    = parseInt(args.find(a => a.startsWith('--skip='))?.split('=')[1] ?? '0') || 0;

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsRequest(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, search } = new URL(url);
    const bodyBuf = body ? Buffer.from(body) : null;
    const opts = {
      method,
      hostname,
      path: pathname + (search || ''),
      headers: bodyBuf ? { 'Content-Length': bodyBuf.length, ...headers } : headers,
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch  { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Spotify auth (client credentials) ────────────────────────────────────────

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const { body } = await httpsRequest(
    'POST',
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` }
  );
  if (!body.access_token) {
    console.error('Failed to get Spotify token:', body);
    process.exit(1);
  }
  _token = body.access_token;
  _tokenExpiry = Date.now() + (body.expires_in - 60) * 1000;
  return _token;
}

// ── Name matching ─────────────────────────────────────────────────────────────

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, '')           // strip leading "the"
    .replace(/[&+]/g, 'and')           // normalize & → and
    .replace(/[^\w\s]/g, '')           // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function isGoodMatch(query, result) {
  const a = normalizeName(query);
  const b = normalizeName(result);
  return a === b;
}

// ── Spotify search ────────────────────────────────────────────────────────────

async function searchArtist(name, retries = 0) {
  const tok = await getToken();
  const q   = encodeURIComponent(`artist:${name}`);
  const url = `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=3`;
  const { status, body } = await httpsRequest('GET', url, null, {
    Authorization: `Bearer ${tok}`,
  });

  if (status === 429) {
    if (retries >= 4) { process.stdout.write(`giving up after rate limits `); return null; }
    const wait = (retries + 1) * 5;
    process.stdout.write(`429, wait ${wait}s... `);
    await sleep(wait * 1000);
    return searchArtist(name, retries + 1);
  }

  if (status !== 200 || !body.artists?.items?.length) return null;

  for (const item of body.artists.items) {
    if (isGoodMatch(name, item.name)) {
      return { id: item.id, name: item.name, followers: item.followers?.total ?? 0 };
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));

const alreadyDone = seed.filter(e => e.spotifyId).length;
let targets = seed.filter(e => !e.spotifyId);
if (SKIP)  targets = targets.slice(SKIP);
if (LIMIT) targets = targets.slice(0, LIMIT);

const total   = targets.length;
const matched = [];
const noMatch = [];

console.log(`\nSpotify ID enrichment`);
console.log(`  Seed total:         ${seed.length}`);
console.log(`  Already have ID:    ${alreadyDone}`);
console.log(`  To process:         ${total}${DRY_RUN ? '  [dry run]' : ''}\n`);

let processed = 0;
for (const entry of targets) {
  processed++;
  process.stdout.write(`[${processed}/${total}] ${entry.name} ... `);

  let result = null;
  try {
    result = await searchArtist(entry.name);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    noMatch.push({ name: entry.name, reason: 'error' });
    continue;
  }

  if (result) {
    const followers = result.followers.toLocaleString();
    console.log(`✓  "${result.name}"  ${result.id}  (${followers} followers)`);
    matched.push({ name: entry.name, spotifyId: result.id, spotifyName: result.name });
    if (!DRY_RUN) entry.spotifyId = result.id;
  } else {
    console.log(`✗  no match`);
    noMatch.push({ name: entry.name, reason: 'no match' });
  }

  // Save progress every 20 artists
  if (!DRY_RUN && processed % 20 === 0) {
    writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
    console.log(`  [saved progress ${processed}/${total}]`);
  }

  await sleep(400); // ~150 req/min — conservative to avoid rate limits
}

// Final save
if (!DRY_RUN && processed > 0) {
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
}

// ── Summary ───────────────────────────────────────────────────────────────────

const pct = total > 0 ? Math.round(matched.length / total * 100) : 0;
console.log(`\n── Summary ───────────────────────────────────────────────`);
console.log(`  Matched:        ${matched.length} / ${total} (${pct}%)`);
console.log(`  No match:       ${noMatch.length}`);
console.log(`  Already had ID: ${alreadyDone}`);
console.log(`  Total with ID:  ${alreadyDone + (DRY_RUN ? 0 : matched.length)} / ${seed.length}`);

if (REPORT && noMatch.length > 0) {
  console.log(`\n── No match ──────────────────────────────────────────────`);
  for (const { name, reason } of noMatch) console.log(`  ${name}  (${reason})`);
}
