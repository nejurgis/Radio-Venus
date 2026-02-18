#!/usr/bin/env node
// ── db-import.mjs: Import musicians.json → musicians.db ─────────────────────
// One-time migration + idempotent re-sync. Run after any manual JSON edits.
//
// Usage:
//   node scripts/db-import.mjs
//
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, '..', 'public', 'data', 'musicians.json');
const DB_PATH   = join(__dirname, 'musicians.db');
const SEED_PATH = join(__dirname, 'seed-musicians.json');

const artists = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
const seed    = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const seedNames = new Set(seed.map(a => a.name.toLowerCase()));

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS musicians (
    name          TEXT PRIMARY KEY,
    birth_date    TEXT,
    venus_sign    TEXT,
    venus_degree  REAL,
    venus_decan   INTEGER,
    venus_element TEXT,
    youtube_id    TEXT,
    backup_ids    TEXT NOT NULL DEFAULT '[]',
    genres        TEXT NOT NULL DEFAULT '[]',
    subgenres     TEXT NOT NULL DEFAULT '[]',
    is_seed       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_venus_sign  ON musicians(venus_sign);
  CREATE INDEX IF NOT EXISTS idx_youtube_id  ON musicians(youtube_id);
`);

const upsert = db.prepare(`
  INSERT INTO musicians
    (name, birth_date, venus_sign, venus_degree, venus_decan, venus_element,
     youtube_id, backup_ids, genres, subgenres, is_seed)
  VALUES
    (@name, @birth_date, @venus_sign, @venus_degree, @venus_decan, @venus_element,
     @youtube_id, @backup_ids, @genres, @subgenres, @is_seed)
  ON CONFLICT(name) DO UPDATE SET
    birth_date    = excluded.birth_date,
    venus_sign    = excluded.venus_sign,
    venus_degree  = excluded.venus_degree,
    venus_decan   = excluded.venus_decan,
    venus_element = excluded.venus_element,
    youtube_id    = excluded.youtube_id,
    backup_ids    = excluded.backup_ids,
    genres        = excluded.genres,
    subgenres     = excluded.subgenres,
    is_seed       = excluded.is_seed
`);

const importAll = db.transaction((rows) => {
  for (const a of rows) {
    upsert.run({
      name:          a.name,
      birth_date:    a.birthDate ?? null,
      venus_sign:    a.venus?.sign ?? null,
      venus_degree:  a.venus?.degree ?? null,
      venus_decan:   a.venus?.decan ?? null,
      venus_element: a.venus?.element ?? null,
      youtube_id:    a.youtubeVideoId ?? null,
      backup_ids:    JSON.stringify(a.backupVideoIds ?? []),
      genres:        JSON.stringify(a.genres ?? []),
      subgenres:     JSON.stringify(a.subgenres ?? []),
      is_seed:       seedNames.has(a.name.toLowerCase()) ? 1 : 0,
    });
  }
});

importAll(artists);

const total  = db.prepare('SELECT count(*) as n FROM musicians').get().n;
const seeded = db.prepare('SELECT count(*) as n FROM musicians WHERE is_seed = 1').get().n;
const videos = db.prepare('SELECT count(*) as n FROM musicians WHERE youtube_id IS NOT NULL').get().n;

console.log(`Imported ${total} musicians (${seeded} seed, ${videos} with YouTube IDs) → musicians.db`);
db.close();
