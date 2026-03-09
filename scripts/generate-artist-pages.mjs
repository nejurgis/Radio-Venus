import fs from 'fs';

const GENRE_LABELS = {
  idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
  darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
  classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
  triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
  hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
};

export function toSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const db = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'))
  .filter(a => a.name !== '@' && a.venus?.sign && a.youtubeVideoId);

// Build slug → artist map with collision handling
const slugMap = new Map();
for (const artist of db) {
  let base = toSlug(artist.name) || artist.spotifyId || artist.youtubeVideoId;
  let slug = base;
  let n = 2;
  while (slugMap.has(slug)) slug = `${base}-${n++}`;
  slugMap.set(slug, artist);
}

fs.mkdirSync('./dist/artist', { recursive: true });

for (const [slug, artist] of slugMap) {
  const gid     = artist.genres?.[0] ?? '';
  const genreLabel = GENRE_LABELS[gid] || gid;
  const sign    = artist.venus.sign;
  const degree  = Math.round(artist.venus.degree ?? 0);
  const genres  = (artist.genres || []).map(g => GENRE_LABELS[g] || g).join(', ');

  // Base redirect URL — t is injected dynamically from ?t= query param
  const baseParams = new URLSearchParams({
    vid:    artist.youtubeVideoId,
    artist: artist.name,
    gid,
    sign:   sign.toLowerCase(),
    genre:  genreLabel,
  });
  const baseRedirect  = `/?${baseParams}`;
  const canonicalUrl  = `https://radio-venus.club/artist/${slug}`;
  const thumbUrl      = `https://i.ytimg.com/vi/${artist.youtubeVideoId}/maxresdefault.jpg`;
  const title         = `${artist.name} — Radio Venus`;
  const description   = `Venus in ${sign} ${degree}° ⊹ ${genres}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${thumbUrl}">
  <meta property="og:image:width" content="1280">
  <meta property="og:image:height" content="720">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="Radio Venus">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${thumbUrl}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0;url=${esc(baseRedirect)}&t=0">
</head>
<body style="background:#0a0a12;color:#a0a0c0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <p>Tuning to ${esc(artist.name)}…</p>
  <script>
    var t = new URLSearchParams(window.location.search).get('t') || '0';
    window.location.replace(${JSON.stringify(baseRedirect)} + '&t=' + t + window.location.hash);
  </script>
</body>
</html>`;

  const dir = `./dist/artist/${slug}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, html);
}

console.log(`Generated ${slugMap.size} artist pages → dist/artist/`);
