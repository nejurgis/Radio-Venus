/**
 * csv-import.mjs
 * 1. Parses a Spotify CSV export
 * 2. Cross-checks artists against seed-musicians.json
 * 3. Asks Groq to suggest a representative YouTube track for each new artist
 * 4. Outputs scripts/csv-new-artists.json (compatible with review-youtube.mjs --input)
 *
 * Usage:
 *   GROQ_API_KEY=... node scripts/csv-import.mjs
 *   GROQ_API_KEY=... node scripts/csv-import.mjs --csv=Radio-venus.club.csv
 */

import fs from 'fs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CSV_PATH     = process.argv.find(a => a.startsWith('--csv='))?.slice(6) || 'Radio-venus.club.csv';
const OUTPUT       = 'scripts/csv-new-artists.json';
const MODEL        = 'llama-3.3-70b-versatile';
const BATCH_SIZE   = 15;

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseRow(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1, val = '';
      while (j < line.length) {
        if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2; }
        else if (line[j] === '"') { j++; break; }
        else val += line[j++];
      }
      fields.push(val);
      i = line[j] === ',' ? j + 1 : j;
    } else {
      const j = line.indexOf(',', i);
      if (j === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, j));
      i = j + 1;
    }
  }
  return fields;
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// ── Load data ────────────────────────────────────────────────────────────────

const csvText  = fs.readFileSync(CSV_PATH, 'utf8');
const rows     = parseCSV(csvText);
const seed     = JSON.parse(fs.readFileSync('scripts/seed-musicians.json', 'utf8'));

// Normalise names for fuzzy matching (lowercase, trim, collapse spaces)
const normalize = n => n.toLowerCase().trim().replace(/\s+/g, ' ');
const seedNames = new Set(seed.map(a => normalize(a.name)));

// ── Extract unique artists from CSV ─────────────────────────────────────────

const csvArtists = new Map(); // normalized name → original name
for (const row of rows) {
  const raw = row['Artist Name(s)'] || '';
  // Spotify separates multiple artists with ';'
  for (const name of raw.split(';').map(n => n.trim()).filter(Boolean)) {
    csvArtists.set(normalize(name), name);
  }
}

console.log(`\nCSV: ${rows.length} tracks, ${csvArtists.size} unique artists`);
console.log(`Seed: ${seed.length} artists\n`);

// ── Cross-check ──────────────────────────────────────────────────────────────

const alreadyHave = [];
const newArtists  = [];

for (const [norm, original] of csvArtists) {
  if (seedNames.has(norm)) {
    alreadyHave.push(original);
  } else {
    newArtists.push(original);
  }
}

console.log(`✓ Already in DB:  ${alreadyHave.length}`);
console.log(`✦ New artists:    ${newArtists.length}\n`);

if (alreadyHave.length) {
  console.log('Already have:');
  alreadyHave.forEach(n => console.log(`  · ${n}`));
  console.log();
}

console.log('New (need importing):');
newArtists.forEach(n => console.log(`  + ${n}`));
console.log();

if (!newArtists.length) {
  console.log('Nothing new to add.');
  process.exit(0);
}

if (!GROQ_API_KEY) {
  console.log('No GROQ_API_KEY — skipping track suggestions.');
  console.log('Run with GROQ_API_KEY=... to get YouTube search links.');
  process.exit(0);
}

// ── Groq: suggest representative track for each new artist ──────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function groqSuggest(batch) {
  const payload = batch.map((name, idx) => ({ idx, name }));
  let retryDelay = 15000;

  while (true) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a music expert. For each artist, suggest their single most iconic/representative track.
Reply with ONLY valid JSON: {"results":[{"idx":0,"track":"Song Title","note":"brief context, max 8 words"},...]}
Prefer well-known tracks likely to have official or high-quality YouTube uploads.`,
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });

    if (r.status === 429) {
      process.stdout.write(`rate limited, waiting ${retryDelay / 1000}s… `);
      await delay(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
      continue;
    }
    if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    return JSON.parse(data.choices[0].message.content).results;
  }
}

// ── Run in batches ───────────────────────────────────────────────────────────

const output = {}; // format compatible with review-youtube.mjs --input
const total  = Math.ceil(newArtists.length / BATCH_SIZE);

for (let i = 0; i < newArtists.length; i += BATCH_SIZE) {
  const batch    = newArtists.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  process.stdout.write(`  [${batchNum}/${total}] Groq batch… `);

  let suggestions;
  try {
    suggestions = await groqSuggest(batch);
    console.log('done');
  } catch (e) {
    console.error(`ERROR — ${e.message}`);
    // Still add entries without track suggestions so names aren't lost
    batch.forEach(name => { output[name] = { track: '', note: 'groq failed', searchUrl: '' }; });
    continue;
  }

  for (const s of suggestions) {
    const name = batch[s.idx];
    const query = `${name} ${s.track}`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    console.log(`    ${name} — "${s.track}" (${s.note})`);
    output[name] = { track: s.track, note: s.note, searchUrl };
  }

  if (i + BATCH_SIZE < newArtists.length) await delay(4000);
}

fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
console.log(`\n✓ ${Object.keys(output).length} new artists → ${OUTPUT}`);
console.log(`\nNext steps:`);
console.log(`  node scripts/review-youtube.mjs --input=${OUTPUT}`);
console.log(`  (opens each search URL, lets you confirm the video ID)`);
