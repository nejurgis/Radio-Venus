#!/usr/bin/env node
// ── admin-commit.mjs ─────────────────────────────────────────────────────────
// "Add artist from a link" — commit half of the admin web tool's pipeline.
// Takes the entries the admin confirmed in the preview UI (shape produced by
// admin-resolve.mjs: the main `artist` object and/or selected `similar`
// candidates) and merges them into seed-musicians.json. Does NOT rebuild
// musicians.json itself — the calling workflow runs build-db.mjs separately,
// same as merge-import.mjs's existing convention.
//
// Usage:
//   node scripts/admin-commit.mjs --payload='[{...entry...}, {...entry...}]'
//   node scripts/admin-commit.mjs --payload-file=path/to/entries.json
//
import { readFileSync, writeFileSync } from 'node:fs';
import { SEED_PATH } from './lib/enrich.mjs';
import { logAdditions } from './lib/addition-log.mjs';

const args        = process.argv.slice(2);
const arg         = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const payloadArg  = arg('payload');
const payloadFile = arg('payload-file');

if (!payloadArg && !payloadFile) {
  console.error('Usage: node scripts/admin-commit.mjs --payload=\'[...]\' | --payload-file=path.json');
  process.exit(1);
}

const rawEntries = JSON.parse(payloadFile ? readFileSync(payloadFile, 'utf-8') : payloadArg);
if (!Array.isArray(rawEntries) || !rawEntries.length) {
  console.error('Payload must be a non-empty array of artist entries.');
  process.exit(1);
}

function toSeedEntry(e) {
  const entry = {
    name: e.name,
    birthDate: e.birthDate,
    ...(e.dateType === 'release' ? { dateType: 'release' } : {}),
    ...(e.mbid ? { mbid: e.mbid } : {}),
    genres: e.genres ?? [],
    subgenres: e.subgenres ?? [],
    ...(e.enTags?.length ? { enTags: e.enTags } : {}),
    youtubeVideoId: e.youtubeVideoId ?? '',
    backupVideoIds: [],
    ...(e.spotifyId ? { spotifyId: e.spotifyId } : {}),
    ...(e.spotifyFollowers ? { spotifyFollowers: e.spotifyFollowers } : {}),
    ...(e.handpickedTrack ? { handpicked: true, handpickedTrack: e.handpickedTrack } : {}),
  };
  return entry;
}

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const seedNames = new Set(seed.map(a => a.name.toLowerCase()));
const seedSpotifyIds = new Set(seed.map(a => a.spotifyId).filter(Boolean));

const added = [];
const addedEntries = [];
const skipped = [];

for (const raw of rawEntries) {
  if (!raw.name || !raw.birthDate) { skipped.push(`${raw.name ?? '(unnamed)'} — missing name/birthDate`); continue; }
  const key = raw.name.toLowerCase();
  if (seedNames.has(key) || (raw.spotifyId && seedSpotifyIds.has(raw.spotifyId))) {
    skipped.push(`${raw.name} — already in seed`);
    continue;
  }
  const entry = toSeedEntry(raw);
  seed.push(entry);
  seedNames.add(key);
  if (entry.spotifyId) seedSpotifyIds.add(entry.spotifyId);
  added.push(raw.name);
  addedEntries.push(entry);
}

writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
logAdditions(addedEntries, 'admin-tool');

console.log(`Added: ${added.length}`);
added.forEach(n => console.log(`  + ${n}`));
if (skipped.length) {
  console.log(`Skipped: ${skipped.length}`);
  skipped.forEach(n => console.log(`  - ${n}`));
}
console.log(`\nWrote ${seed.length} total artists to ${SEED_PATH}`);
