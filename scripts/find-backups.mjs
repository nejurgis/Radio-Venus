#!/usr/bin/env node
// Find backup YouTube video IDs for artists that don't have them yet.
// Usage: nvm use 20 && node scripts/find-backups.mjs
//
// Reads public/data/musicians.json, searches YouTube for 2 backup videos
// per artist, and writes the result back.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ytSearch = require('yt-search');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'public', 'data', 'musicians.json');
const BACKUP_COUNT = 2;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function findBackups(artist, primaryId, genre) {
  const queries = [
    `${artist} ${genre} full track`,
    `${artist} topic`,
    `${artist} live`,
  ];

  const found = [];
  const seen = new Set([primaryId]);

  for (const q of queries) {
    if (found.length >= BACKUP_COUNT) break;
    try {
      const result = await ytSearch(q);
      for (const video of result.videos.slice(0, 8)) {
        if (seen.has(video.videoId)) continue;
        // 1min to 1hour — skip very short clips and multi-hour compilations
        if (video.seconds < 60 || video.seconds > 3600) continue;
        seen.add(video.videoId);
        found.push(video.videoId);
        if (found.length >= BACKUP_COUNT) break;
      }
    } catch { continue; }
    await sleep(300);
  }

  return found;
}

async function main() {
  const musicians = JSON.parse(readFileSync(DB_PATH, 'utf-8'));
  const needBackups = musicians.filter(m =>
    m.youtubeVideoId && (!m.backupVideoIds || m.backupVideoIds.length < BACKUP_COUNT)
  );

  console.log(`${musicians.length} total artists, ${needBackups.length} need backups.\n`);

  let updated = 0;
  for (let i = 0; i < needBackups.length; i++) {
    const m = needBackups[i];
    const genre = m.genres[0] || 'electronic';
    const existing = m.backupVideoIds || [];
    const needed = BACKUP_COUNT - existing.length;

    const backups = await findBackups(m.name, m.youtubeVideoId, genre);
    // Merge with existing, dedupe
    const all = [...new Set([...existing, ...backups])].slice(0, BACKUP_COUNT);

    if (all.length > existing.length) {
      m.backupVideoIds = all;
      updated++;
      console.log(`  + ${m.name}: ${all.length} backups (${all.join(', ')})`);
    } else {
      console.log(`  - ${m.name}: no new backups found`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  [${i + 1}/${needBackups.length}] — saving checkpoint...`);
      writeFileSync(DB_PATH, JSON.stringify(musicians, null, 2));
    }

    await sleep(500);
  }

  writeFileSync(DB_PATH, JSON.stringify(musicians, null, 2));
  console.log(`\nDone. Updated ${updated}/${needBackups.length} artists.`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
