#!/usr/bin/env node
// ── YouTube Review: Interactive verification of auto-searched video IDs ──────
//
// Finds all seed entries with youtubeNeedsVerify: true, opens each in the
// browser, and prompts for confirmation or replacement.
//
// Usage:
//   node scripts/review-youtube.mjs
//   node scripts/review-youtube.mjs --dry-run   (preview list, no browser/prompts)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join }               from 'node:path';
import { fileURLToPath }               from 'node:url';
import { createInterface }             from 'node:readline';
import { exec }                        from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, 'seed-musicians.json');
const dryRun    = process.argv.includes('--dry-run');

function ytUrl(id) { return `https://youtu.be/${id}`; }

function parseYtId(input) {
  input = input.trim();
  // Full URL formats
  const m = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // Bare 11-char ID
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

    console.log(`\n[${ i + 1 }/${ pending.length }] ${artist.name}`);
    console.log(`  genres : ${artist.genres?.join(', ') ?? '—'}`);
    console.log(`  enTags : ${artist.enTags?.slice(0, 5).join(', ') ?? '—'}`);

    if (artist.youtubeId) {
      const url = ytUrl(artist.youtubeId);
      console.log(`  video  : ${url}`);
      openInBrowser(url);
    } else {
      console.log(`  video  : (none found)`);
    }

    const answer = await prompt(rl,
      `  [k]eep / [r]eplace / [s]kip  → `
    );
    const key = answer.trim().toLowerCase()[0];

    if (key === 'k') {
      delete seed[idx].youtubeNeedsVerify;
      kept++;
    } else if (key === 'r') {
      const raw    = await prompt(rl, '  Paste YouTube URL or ID → ');
      const newId  = parseYtId(raw);
      if (newId) {
        seed[idx].youtubeId           = newId;
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
    console.log('  node build-db.mjs');
    console.log('  git add seed-musicians.json public/data/musicians.json && git commit');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
