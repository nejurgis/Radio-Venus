#!/usr/bin/env node
// ── enrich-entags.mjs ─────────────────────────────────────────────────────────
//
// Reads genre-report JSON files produced by verify-genres.mjs and writes the
// raw Everynoise tags (enRaw) back to seed-musicians.json as enTags fields.
//
// Only processes artists in the `ok`, `missing`, and `extra` arrays — the
// `notFound` array (geo-noise wrong matches, timeouts, not-on-EN) is skipped.
//
// Usage:
//   node scripts/enrich-entags.mjs /path/to/genre-report-idm.json
//   node scripts/enrich-entags.mjs /path/to/genre-report-*.json   # all at once
//

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = join(__dirname, 'seed-musicians.json');

// Geo-noise tags that signal a wrong-artist match on EN
// (double-check safety net in case any slipped through the report's filter)
const GEO_NOISE = /\b(lithuanian|latvian|estonian|ukrainian|polish|czech|slovak|romanian|bulgarian|serbian|croatian|slovenian|nordic|norwegian|swedish|icelandic|finnish|danish|japanese|korean|chinese|oulu|tallinn|riga|vilnius)\b/i;

const reportPaths = process.argv.slice(2);
if (reportPaths.length === 0) {
  console.error('Usage: node scripts/enrich-entags.mjs <report.json> [report2.json ...]');
  process.exit(1);
}

// ── Load seed ────────────────────────────────────────────────────────────────
const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
const seedByName = new Map(seedData.map(a => [a.name.toLowerCase(), a]));
console.log(`Loaded ${seedData.length} seed artists.`);

// ── Process each report ───────────────────────────────────────────────────────
let enriched = 0;
let skippedGeo = 0;
let skippedNotInSeed = 0;
let alreadyHad = 0;

for (const reportPath of reportPaths) {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  const genre = report.meta?.filterGenre || reportPath;
  console.log(`\nProcessing ${reportPath} (genre: ${genre})`);

  // Only ok + missing + extra are valid EN matches
  const valid = [
    ...(report.ok      || []),
    ...(report.missing || []),
    ...(report.extra   || []),
  ];

  let fileEnriched = 0;
  for (const entry of valid) {
    const enRaw = entry.enRaw;
    if (!enRaw?.length) continue;

    // Safety: skip if enRaw is dominated by geo-noise tags with no other content
    const geoTags   = enRaw.filter(t => GEO_NOISE.test(t));
    const cleanTags = enRaw.filter(t => !GEO_NOISE.test(t));
    if (geoTags.length > 0 && cleanTags.length === 0) {
      console.log(`  skip geo-only: ${entry.name} [${geoTags.join(', ')}]`);
      skippedGeo++;
      continue;
    }

    const seedEntry = seedByName.get(entry.name.toLowerCase());
    if (!seedEntry) {
      skippedNotInSeed++;
      continue;
    }

    if (seedEntry.enTags?.length) {
      // Already has tags — merge rather than overwrite (prefer existing if same artist)
      const merged = [...new Set([...seedEntry.enTags, ...enRaw])];
      if (merged.length === seedEntry.enTags.length) {
        alreadyHad++;
        continue;
      }
      seedEntry.enTags = merged;
    } else {
      seedEntry.enTags = enRaw;
    }

    console.log(`  + ${entry.name}: [${enRaw.slice(0, 4).join(', ')}${enRaw.length > 4 ? '…' : ''}]`);
    fileEnriched++;
    enriched++;
  }
  console.log(`  → ${fileEnriched} artists enriched from this report (${report.notFound?.length || 0} skipped as notFound)`);
}

// ── Write back ────────────────────────────────────────────────────────────────
writeFileSync(seedPath, JSON.stringify(seedData, null, 2));

console.log(`
Summary:
  Enriched:         ${enriched} artists
  Already had tags: ${alreadyHad} (merged)
  Geo-only skipped: ${skippedGeo}
  Not in seed:      ${skippedNotInSeed}
Saved to ${seedPath}
`);
