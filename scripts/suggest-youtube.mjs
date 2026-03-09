/**
 * suggest-youtube.mjs
 * For each artist missing a YouTube video ID, asks Groq to suggest
 * the most representative/iconic track, then outputs YouTube search links.
 *
 * Usage:
 *   GROQ_API_KEY=... node scripts/suggest-youtube.mjs
 *   GROQ_API_KEY=... node scripts/suggest-youtube.mjs --output=suggestions.md
 */

import fs from 'fs';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OUTPUT       = process.argv.find(a => a.startsWith('--output='))?.slice(9) || 'scripts/yt-suggestions.md';
const MODEL        = 'llama-3.3-70b-versatile';
const BATCH_SIZE   = 15;

const GENRE_LABELS = {
  idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
  darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
  classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
  triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
  hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
};

if (!GROQ_API_KEY) { console.error('Set GROQ_API_KEY'); process.exit(1); }

const artists = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'))
  .filter(a => a.youtubeVideoId == null && a.name !== '@');

console.log(`${artists.length} artists need YouTube IDs\n`);

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function groqSuggest(batch) {
  const payload = batch.map((a, i) => ({
    idx: i,
    name: a.name,
    genres: (a.genres || []).map(g => GENRE_LABELS[g] || g).join(', '),
  }));

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
            content: `You are a music expert. For each artist, suggest their single most iconic/representative track to search for on YouTube.
Reply with ONLY valid JSON: {"results":[{"idx":0,"track":"Song Title","note":"brief context (album, year, why iconic — max 8 words)"},...]}
Be specific. Prefer well-known tracks that are likely to have official or high-quality uploads.`,
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
    const parsed = JSON.parse(data.choices[0].message.content);
    return parsed.results ?? parsed;
  }
}

const lines = [`# YouTube Suggestions — ${new Date().toISOString().slice(0, 10)}\n`];
const results = [];

for (let i = 0; i < artists.length; i += BATCH_SIZE) {
  const batch = artists.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const total = Math.ceil(artists.length / BATCH_SIZE);
  process.stdout.write(`  [${batchNum}/${total}] `);

  let suggestions;
  try {
    suggestions = await groqSuggest(batch);
    console.log('done');
  } catch (e) {
    console.error(`ERROR — ${e.message}`);
    continue;
  }

  for (const s of suggestions) {
    const artist = batch[s.idx];
    const genres = (artist.genres || []).map(g => GENRE_LABELS[g] || g).join(', ');
    const query  = `${artist.name} ${s.track}`;
    const url    = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    console.log(`    ${artist.name} — "${s.track}" (${s.note})`);
    lines.push(`## ${artist.name}`);
    lines.push(`**Genres:** ${genres}  `);
    lines.push(`**Track:** ${s.track} — *${s.note}*  `);
    lines.push(`**Search:** [${query}](${url})  `);
    lines.push('');
    results.push({ name: artist.name, track: s.track, note: s.note, searchUrl: url });
  }

  if (i + BATCH_SIZE < artists.length) await delay(4000);
}

fs.writeFileSync(OUTPUT, lines.join('\n'));

// Also write machine-readable JSON for use by review-youtube.mjs --recover
const jsonOut = OUTPUT.replace(/\.md$/, '.json');
const jsonMap = {};
for (const r of results) jsonMap[r.name] = { track: r.track, note: r.note, searchUrl: r.searchUrl };
fs.writeFileSync(jsonOut, JSON.stringify(jsonMap, null, 2));

console.log(`\n✓ ${results.length} suggestions → ${OUTPUT}`);
console.log(`✓ Machine-readable    → ${jsonOut}`);
