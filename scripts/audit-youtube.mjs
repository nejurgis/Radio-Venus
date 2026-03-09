/**
 * audit-youtube.mjs
 * Fetches oEmbed title/channel for every artist with a YouTube ID,
 * then asks Groq to flag videos that don't plausibly match the artist.
 *
 * Usage:
 *   GROQ_API_KEY=... node scripts/audit-youtube.mjs
 *   GROQ_API_KEY=... node scripts/audit-youtube.mjs --model=llama-3.1-8b-instant
 *   GROQ_API_KEY=... node scripts/audit-youtube.mjs --output=my-report.json
 */

import fs from 'fs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL        = process.argv.find(a => a.startsWith('--model='))?.slice(8) || 'llama-3.3-70b-versatile';
const OUTPUT       = process.argv.find(a => a.startsWith('--output='))?.slice(9) || 'scripts/yt-audit-report.json';
const BATCH_SIZE   = 20;
const OEMBED_CONCURRENCY = 10;

if (!GROQ_API_KEY) {
  console.error('Set GROQ_API_KEY env var');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'))
  .filter(a => a.youtubeVideoId && a.name !== '@');

console.log(`Auditing ${db.length} artists with YouTube IDs…`);
console.log(`Model: ${MODEL}\n`);

// ── oEmbed ────────────────────────────────────────────────────────────────────

async function fetchOembed(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const r = await fetch(url, { headers: { 'User-Agent': 'RadioVenus/1.0' } });
    if (!r.ok) return null;
    const d = await r.json();
    return { title: d.title, channel: d.author_name };
  } catch {
    return null;
  }
}

async function pooledMap(items, fn, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Groq ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a music database auditor. For each entry decide if the YouTube video plausibly belongs to the artist.
Reply with ONLY a JSON array, no markdown: [{"idx":0,"ok":true},{"idx":1,"ok":false,"reason":"..."}]

Rules:
- OK: artist name in video title or channel name (case-insensitive, aliases count)
- OK: known collaboration that includes the artist
- OK: channel is the artist's official account under a variant/label name
- NOT OK: clearly a different artist's video
- NOT OK: cover by someone else credited to the wrong artist
- NOT OK: unrelated content (podcast, compilation, wrong genre entirely)

Keep reasons under 10 words.`;

async function groqCheck(batch) {
  const payload = batch.map((item, i) => ({
    idx: i,
    artist: item.artist,
    title: item.title,
    channel: item.channel,
  }));

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\nWrap the array in {"results":[...]}' },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Groq ${r.status}: ${err.slice(0, 200)}`);
  }

  const data = await r.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.results ?? parsed;
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────

process.stdout.write('Fetching oEmbed data… ');
const oembeds = await pooledMap(db, a => fetchOembed(a.youtubeVideoId), OEMBED_CONCURRENCY);
console.log('done');

const items = db
  .map((artist, i) => ({
    artist:  artist.name,
    videoId: artist.youtubeVideoId,
    title:   oembeds[i]?.title   ?? null,
    channel: oembeds[i]?.channel ?? null,
  }))
  .filter(item => item.title !== null);

const skipped = db.length - items.length;
console.log(`oEmbed resolved: ${items.length}/${db.length}${skipped ? ` (${skipped} unavailable, skipped)` : ''}`);
console.log(`Groq batches: ${Math.ceil(items.length / BATCH_SIZE)} × ${BATCH_SIZE}\n`);

const mismatches = [];

for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch      = items.slice(i, i + BATCH_SIZE);
  const batchNum   = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);
  process.stdout.write(`  [${batchNum}/${totalBatches}] `);

  let results;
  let retryDelay = 15000;
  while (true) {
    try {
      results = await groqCheck(batch);
      break;
    } catch (e) {
      if (e.message.includes('429')) {
        process.stdout.write(`rate limited, waiting ${retryDelay / 1000}s… `);
        await delay(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      } else {
        console.error(`ERROR — ${e.message}`);
        break;
      }
    }
  }
  if (!results) { console.log('skipped'); continue; }

  const flagged = results.filter(r => !r.ok);
  console.log(`${flagged.length ? `${flagged.length} flagged` : 'ok'}`);

  for (const r of flagged) {
    const item = batch[r.idx];
    console.log(`    ⚠  ${item.artist}`);
    console.log(`       video:   "${item.title}"`);
    console.log(`       channel: ${item.channel}`);
    console.log(`       reason:  ${r.reason}`);
    mismatches.push({ ...item, reason: r.reason });
  }

  if (i + BATCH_SIZE < items.length) await delay(4000); // conservative inter-batch delay
}

console.log(`\n── Summary ${'─'.repeat(40)}`);
console.log(`Artists checked: ${items.length}`);
console.log(`Mismatches:      ${mismatches.length}`);
if (mismatches.length === 0) console.log('All videos look correct!');

const report = {
  date:       new Date().toISOString().slice(0, 10),
  model:      MODEL,
  total:      db.length,
  checked:    items.length,
  mismatches,
};

fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
console.log(`\nReport → ${OUTPUT}`);
