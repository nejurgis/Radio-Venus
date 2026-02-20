#!/usr/bin/env node
// ── merge-import.mjs ─────────────────────────────────────────────────────────
// Merges one or more output files from `import-spotify.mjs --output=<file>`
// into seed-musicians.json.
//
// Usage:
//   node scripts/merge-import.mjs part1.json part2.json [...]
//
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');

const inputFiles = process.argv.slice(2).filter(a => a.endsWith('.json') && !a.startsWith('--'));

if (!inputFiles.length) {
  console.error('Usage: node scripts/merge-import.mjs part1.json part2.json [...]');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
const seedByName = new Map(seed.map(a => [a.name.toLowerCase(), a]));

let totalAdded   = 0;
let totalPatched = 0;

for (const file of inputFiles) {
  const { additions = [], patches = [] } = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`${file}: ${additions.length} new, ${patches.length} patches`);

  for (const entry of additions) {
    const key = entry.name.toLowerCase();
    if (!seedByName.has(key)) {
      seed.push(entry);
      seedByName.set(key, entry);
      totalAdded++;
    } else {
      console.log(`  skip duplicate: ${entry.name}`);
    }
  }

  for (const patch of patches) {
    const entry = seedByName.get(patch.name.toLowerCase());
    if (entry) {
      if (patch.handpicked && !entry.handpicked)         { entry.handpicked = true;                  totalPatched++; }
      if (patch.handpickedTrack && !entry.handpickedTrack) entry.handpickedTrack = patch.handpickedTrack;
    }
  }
}

writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
console.log(`\nMerged: +${totalAdded} new, ${totalPatched} patched → ${seed.length} total artists`);
console.log('Run "node scripts/build-db.mjs" to rebuild the database.');
