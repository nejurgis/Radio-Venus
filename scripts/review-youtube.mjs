#!/usr/bin/env node
// ── YouTube Review: Interactive verification of auto-searched video IDs ──────
//
// Two modes:
//
//   File mode (review before merging — recommended):
//     node scripts/review-youtube.mjs --input=discovered.json
//     s = reject (removed from file), k = approve, r = replace ID
//     Then: node scripts/merge-import.mjs discovered.json
//
//   Seed mode (review entries already in seed):
//     node scripts/review-youtube.mjs
//     s = leave flag in place (verify later)
//
//   node scripts/review-youtube.mjs --dry-run [--input=file.json]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve }                  from 'node:path';
import { fileURLToPath }                           from 'node:url';
import { createInterface }                         from 'node:readline';
import { exec }                                    from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');
const dryRun    = process.argv.includes('--dry-run');
const inputArg  = process.argv.find(a => a.startsWith('--input='));
const inputFile = inputArg ? resolve(process.cwd(), inputArg.slice(8)) : null;

function ytUrl(id) { return `https://youtu.be/${id}`; }

function parseYtId(input) {
  input = input.trim();
  const m = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  return null;
}

function openInBrowser(url) {
  exec(`open "${url}"`);
}

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  // ── File mode ─────────────────────────────────────────────────────────────
  if (inputFile) {
    if (!existsSync(inputFile)) {
      console.error(`File not found: ${inputFile}`);
      process.exit(1);
    }
    const data    = JSON.parse(readFileSync(inputFile, 'utf-8'));
    const pending = data.additions.filter(a => a.youtubeNeedsVerify);

    if (!pending.length) {
      console.log('No entries with youtubeNeedsVerify — nothing to review.');
      return;
    }

    console.log(`\n${pending.length} artist${pending.length > 1 ? 's' : ''} to review (s = reject).\n`);

    if (dryRun) {
      for (const a of pending) {
        console.log(`  ${a.name.padEnd(36)} ${a.youtubeId ? ytUrl(a.youtubeId) : '(no ID)'}`);
      }
      return;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let kept = 0, replaced = 0, rejected = 0;
    const rejectedNames = [];

    for (let i = 0; i < pending.length; i++) {
      const artist = pending[i];

      console.log(`\n[${i + 1}/${pending.length}] ${artist.name}`);
      console.log(`  genres    : ${artist.genres?.join(', ') ?? '—'}`);
      console.log(`  enTags    : ${artist.enTags?.slice(0, 5).join(', ') ?? '—'}`);
      console.log(`  followers : ${artist.spotifyFollowers?.toLocaleString() ?? '—'}`);
      console.log(`  born      : ${artist.birthDate ?? '—'}`);

      if (artist.youtubeId) {
        const url = ytUrl(artist.youtubeId);
        console.log(`  video     : ${url}`);
        openInBrowser(url);
      } else {
        console.log(`  video     : (none found)`);
      }

      const answer = await prompt(rl, `  [k]eep / [r]eplace / [s]kip(reject)  → `);
      const key    = answer.trim().toLowerCase()[0];

      if (key === 'k') {
        delete artist.youtubeNeedsVerify;
        kept++;
      } else if (key === 'r') {
        const raw   = await prompt(rl, '  Paste YouTube URL or ID → ');
        const newId = parseYtId(raw);
        if (newId) {
          artist.youtubeId = newId;
          delete artist.youtubeNeedsVerify;
          console.log(`  ✓ Replaced with ${ytUrl(newId)}`);
          replaced++;
        } else {
          console.log('  ✗ Could not parse ID — rejecting');
          rejectedNames.push(artist.name);
          rejected++;
        }
      } else {
        console.log(`  ✗ Rejected`);
        rejectedNames.push(artist.name);
        rejected++;
      }
    }

    rl.close();

    // Remove rejected artists from additions
    data.additions = data.additions.filter(a => !rejectedNames.includes(a.name));
    writeFileSync(inputFile, JSON.stringify(data, null, 2));

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Kept: ${kept}  Replaced: ${replaced}  Rejected: ${rejected}`);
    if (kept + replaced > 0) {
      console.log('\nNext steps:');
      console.log(`  node scripts/merge-import.mjs ${inputFile}`);
      console.log('  node scripts/build-db.mjs');
      console.log('  git add scripts/seed-musicians.json public/data/musicians.json && git commit');
    }
    return;
  }

  // ── Seed mode ─────────────────────────────────────────────────────────────
  const seed    = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const pending = seed.filter(a => a.youtubeNeedsVerify);

  if (!pending.length) {
    console.log('No entries with youtubeNeedsVerify — nothing to review.');
    return;
  }

  console.log(`\n${pending.length} artist${pending.length > 1 ? 's' : ''} need YouTube verification.\n`);

  if (dryRun) {
    for (const a of pending) {
      console.log(`  ${a.name.padEnd(36)} ${a.youtubeId ? ytUrl(a.youtubeId) : '(no ID)'}`);
    }
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let kept = 0, replaced = 0, skipped = 0;

  for (let i = 0; i < pending.length; i++) {
    const artist = pending[i];
    const idx    = seed.indexOf(artist);

    console.log(`\n[${i + 1}/${pending.length}] ${artist.name}`);
    console.log(`  genres : ${artist.genres?.join(', ') ?? '—'}`);
    console.log(`  enTags : ${artist.enTags?.slice(0, 5).join(', ') ?? '—'}`);

    if (artist.youtubeId) {
      const url = ytUrl(artist.youtubeId);
      console.log(`  video  : ${url}`);
      openInBrowser(url);
    } else {
      console.log(`  video  : (none found)`);
    }

    const answer = await prompt(rl, `  [k]eep / [r]eplace / [s]kip  → `);
    const key    = answer.trim().toLowerCase()[0];

    if (key === 'k') {
      delete seed[idx].youtubeNeedsVerify;
      kept++;
    } else if (key === 'r') {
      const raw   = await prompt(rl, '  Paste YouTube URL or ID → ');
      const newId = parseYtId(raw);
      if (newId) {
        seed[idx].youtubeId = newId;
        delete seed[idx].youtubeNeedsVerify;
        console.log(`  ✓ Replaced with ${ytUrl(newId)}`);
        replaced++;
      } else {
        console.log('  ✗ Could not parse ID — skipping');
        skipped++;
      }
    } else {
      console.log('  → Skipped (flag left in place)');
      skipped++;
    }
  }

  rl.close();

  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Kept: ${kept}  Replaced: ${replaced}  Skipped: ${skipped}`);
  if (kept + replaced > 0) {
    console.log('\nNext steps:');
    console.log('  node scripts/build-db.mjs');
    console.log('  git add scripts/seed-musicians.json public/data/musicians.json && git commit');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
