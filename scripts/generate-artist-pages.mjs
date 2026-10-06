import fs from 'fs';
import { artistSlugs, hasArtistPage } from './lib/artist-slugs.mjs';

const GENRE_LABELS = {
  idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
  darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
  classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
  triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
  hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
};


function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const allArtists = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'));
const db = allArtists.filter(hasArtistPage);

// slug → artist, with collision handling (shared with the sign pages' links)
const { bySlug: slugMap, byName: slugOf } = artistSlugs(allArtists);

fs.mkdirSync('./dist/artist', { recursive: true });

// Read the built app shell once — strip homepage-specific head tags so they
// don't duplicate the artist-specific ones we inject per page.
const rawShell = fs.readFileSync('./dist/index.html', 'utf-8');
const appShell = rawShell
  .replace(/\s*<!--\s*Primary SEO\s*-->\s*/gi, '')
  .replace(/<title>[^<]*<\/title>/i, '')
  .replace(/<meta\s+name="description"[^>]*>/i, '')
  .replace(/<link\s+rel="canonical"[^>]*>/i, '');

function generatePage(dir, slug, artist, gid, isCanonical = false) {
  const genreLabel   = GENRE_LABELS[gid] || gid;
  const sign         = artist.venus.sign;
  const degree       = Math.round(artist.venus.degree ?? 0);
  const canonicalUrl = `https://radio-venus.club/artist/${slug}/`;
  const pageUrl      = isCanonical ? canonicalUrl : `https://radio-venus.club/artist/${slug}/${gid}/`;
  const thumbUrl     = `https://i.ytimg.com/vi/${artist.youtubeVideoId}/hqdefault.jpg`;
  const title        = `${artist.name} — Venus in ${sign} | Radio Venus`;
  const description  = `${artist.name} has Venus in ${sign} at ${degree}°. Discover their ${genreLabel} music alongside other Venus in ${sign} artists on Radio Venus.`;
  const shareState   = {
    vid:    artist.youtubeVideoId,
    artist: artist.name,
    sign:   sign.toLowerCase(),
    genre:  genreLabel,
    gid,
  };

  // Injected at top of <head> — scrapers pick up first occurrence of OG tags.
  // __SHARE_STATE__ is an inline script so it runs before deferred module scripts.
  const injection = `<script>window.__SHARE_STATE__=${JSON.stringify(shareState)};</script>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${thumbUrl}">
  <meta property="og:image:width" content="480">
  <meta property="og:image:height" content="360">
  <meta property="og:image:alt" content="${esc(artist.name)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:type" content="music.song">
  <meta property="og:site_name" content="Radio Venus">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${thumbUrl}">
  <link rel="canonical" href="${canonicalUrl}">`;

  const html = appShell.replace('<head>', `<head>\n${injection}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, html);
}


// ── Profile page at /artist/<slug>/ ─────────────────────────────────────────
// A real page for search engines and people alike: the artist's Venus
// placement, genres, song, and their neighbours on the wheel, all in the HTML.
// (The genre pages below stay app shells that start playing — share links use
// those — and point here as canonical.)

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
               'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const GLYPHS = {
  Aries: 'A', Taurus: 'B', Gemini: 'C', Cancer: 'D', Leo: 'E', Virgo: 'F',
  Libra: 'G', Scorpio: 'H', Sagittarius: 'J', Capricorn: 'K', Aquarius: 'L', Pisces: 'M',
};
const MIN_SIGN_GENRE = 5;   // a /sign/<sign>/<genre>/ page exists from this many artists (generate-sign-pages)
const DECANS = ['first', 'second', 'third'];

// Sign descriptions, from the homepage's Venus guide (same source as the sign pages)
const sourceHtml = fs.readFileSync('./index.html', 'utf8');
const signDesc = {};
for (const sign of SIGNS) {
  const m = sourceHtml.match(new RegExp(`id="venus-${sign.toLowerCase()}"[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>`));
  signDesc[sign] = m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// The song each artist plays (seed's handpicked track, when there is one)
const seed = JSON.parse(fs.readFileSync('./scripts/seed-musicians.json', 'utf8'));
const trackOf = new Map(seed.filter(e => e.handpickedTrack).map(e => [e.name, e.handpickedTrack]));
// Groups are dated by their debut release, not a birthday
const isReleaseDated = new Set(seed.filter(e => e.dateType === 'release').map(e => e.name));

const lon = a => SIGNS.indexOf(a.venus.sign) * 30 + Math.min(a.venus.degree ?? 0, 29.99);
const arc = (a, b) => { const d = Math.abs(lon(a) - lon(b)); return d > 180 ? 360 - d : d; };
const knownGenres = a => (a.genres || []).filter(g => GENRE_LABELS[g]);
const signGenreCount = {};
for (const a of db) for (const g of knownGenres(a)) {
  const k = `${a.venus.sign}/${g}`;
  signGenreCount[k] = (signGenreCount[k] || 0) + 1;
}

function neighbourList(artists) {
  return artists.map(a => {
    const genres = knownGenres(a).slice(0, 3).map(g => GENRE_LABELS[g]).join(', ');
    return `      <li><a class="artist-name" href="/artist/${slugOf.get(a.name)}/">${esc(a.name)}</a>
        <span class="artist-meta">${Math.min(29, Math.floor(a.venus.degree ?? 0))}° ${a.venus.sign}${genres ? ` · ${esc(genres)}` : ''}</span></li>`;
  }).join('\n');
}

const PROFILE_CSS = `
  @font-face { font-family: 'Zodiac St'; src: url('/assets/ZodiacSt.woff') format('woff'); }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0c; color: #e8e8f0;
    font-family: 'Helvetica Neue', Helvetica, 'Archivo', Arial, sans-serif;
    font-size: clamp(15px, 3vw, 18px); line-height: 1.5;
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  main { max-width: 610px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }
  header { padding: 2rem 1.5rem 0; max-width: 610px; margin: 0 auto; }
  a {
    color: #fff; text-decoration: none;
    background: linear-gradient(#fff, #fff) repeat-x 0 96% / 1px 1px;
  }
  a:hover { color: rgba(255,255,255,0.55); }
  .home-link, .breadcrumb a { background: none; }
  .home-link { font-size: 0.75rem; letter-spacing: 0.06em; color: rgba(255,255,255,0.35); text-transform: lowercase; }
  .breadcrumb { font-size: 0.7rem; letter-spacing: 0.04em; color: rgba(255,255,255,0.3); margin: 0.75rem 0 2rem; }
  .breadcrumb a { color: rgba(255,255,255,0.3); }
  .breadcrumb span { color: rgba(255,255,255,0.15); margin: 0 0.35em; }
  .lead { text-align: center; margin-bottom: 2rem; }
  .zodiac-char { font-family: 'Zodiac St', serif; font-size: 4rem; display: block; line-height: 1; margin-bottom: 0.75rem; }
  h1 { font-size: 1.6rem; font-weight: 400; line-height: 1.2; }
  .placement {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: rgba(255,255,255,0.45); margin-top: 0.5rem;
  }
  .approx { display: block; margin-top: 0.35rem; color: rgba(255,255,255,0.3); text-transform: none; letter-spacing: 0.02em; }
  .play { display: block; margin: 0 auto 2.25rem; max-width: 420px; background: none; text-align: center; }
  .play-art { position: relative; display: block; }
  .play img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; display: block; opacity: 0.85; transition: opacity 0.2s; }
  .play:hover img { opacity: 1; }
  .play-icon {
    position: absolute; top: 50%; left: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px;
    border-radius: 50%; background: rgba(10, 10, 12, 0.55); border: 1px solid rgba(255,255,255,0.5);
    -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; transition: transform 0.2s, background 0.2s;
  }
  .play-icon svg { width: 22px; height: 22px; margin-left: 4px; fill: #fff; }
  .play:hover .play-icon { transform: scale(1.08); background: rgba(10, 10, 12, 0.75); }
  .play-label { display: inline-block; margin-top: 0.75rem; font-size: 0.85rem; letter-spacing: 0.04em; border-bottom: 1px solid rgba(255,255,255,0.5); }
  .about { font-family: 'EB Garamond', Georgia, serif; font-size: 1.25rem; line-height: 1.45; color: rgba(255,255,255,0.9); margin-bottom: 1rem; }
  .sign-desc { font-size: 0.95rem; line-height: 1.45; color: rgba(255,255,255,0.6); margin-bottom: 0.75rem; }
  .more { font-size: 0.8rem; color: rgba(255,255,255,0.45); }
  section { margin-top: 2.5rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.08); }
  h2 { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 1rem; font-weight: 400; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chips a, .chips span {
    font-size: 0.75rem; padding: 0.25rem 0.65rem; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 2rem; color: rgba(255,255,255,0.55); background: none;
  }
  .chips a:hover { border-color: rgba(255,255,255,0.45); color: #fff; }
  ul { list-style: none; }
  li { padding: 0.55rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .artist-name { display: block; color: #e8e8f0; background: none; }
  .artist-meta { display: block; margin-top: 0.15rem; font-family: 'IBM Plex Mono', monospace; font-size: 0.6rem; color: rgba(255,255,255,0.28); text-transform: uppercase; }
  .cta { font-size: 0.9rem; color: rgba(255,255,255,0.45); }
`;

function generateProfile(dir, slug, artist) {
  const { sign, element } = artist.venus;
  const degree    = Math.min(29, Math.floor(artist.venus.degree ?? 0));   // 29.9° (or a stored 30) is still 29° of the sign
  const decan     = DECANS[(artist.venus.decan ?? 1) - 1] ?? 'first';
  const genres    = knownGenres(artist);
  const genreText = genres.map(g => GENRE_LABELS[g]);
  const firstGid  = artist.genres?.[0] ?? '';
  const track     = trackOf.get(artist.name);
  const url       = `https://radio-venus.club/artist/${slug}/`;
  const playUrl   = `/artist/${slug}/${firstGid ? `${firstGid}/` : ''}`;
  const signUrl   = `/sign/${sign.toLowerCase()}/`;
  const thumbUrl  = `https://i.ytimg.com/vi/${artist.youtubeVideoId}/hqdefault.jpg`;
  const title     = `${artist.name} — Venus in ${sign} | Radio Venus`;
  const description = `${artist.name} has Venus in ${sign} at ${degree}°${genreText.length ? `, making ${genreText.slice(0, 3).join(', ')}` : ''}. Hear ${track ? `"${track}"` : 'their music'} and the artists closest to their Venus on Radio Venus.`;

  const genreList = genreText.length > 1
    ? `${genreText.slice(0, -1).join(', ')} and ${genreText.at(-1)}`
    : genreText[0];
  const aboutText = `${esc(artist.name)} ${genreList ? `makes ${esc(genreList)} music, and ` : ''}${isReleaseDated.has(artist.name) ? 'arrived' : 'was born'} with Venus at ${degree}° ${sign}, in the ${decan} decan of this ${element} sign${track ? `. On Radio Venus you hear them through “${esc(track)}”` : ''}.`;
  const approx = artist.dateReliability === 'approximate'
    ? '<span class="approx">approximate: only the year, or a stand-in date, is known</span>' : '';

  const genreChips = genres.map(g => signGenreCount[`${sign}/${g}`] >= MIN_SIGN_GENRE
    ? `<a href="/sign/${sign.toLowerCase()}/${g}/">${GENRE_LABELS[g]} · Venus in ${sign}</a>`
    : `<span>${GENRE_LABELS[g]}</span>`).join('\n        ');

  // Closest Venus anywhere on the wheel, then same sign and sharing a genre
  const others  = db.filter(a => a !== artist);
  const closest = [...others].sort((a, b) => arc(artist, a) - arc(artist, b)).slice(0, 8);
  const shared  = a => knownGenres(a).filter(g => genres.includes(g)).length;
  const kin     = others
    .filter(a => a.venus.sign === sign && !closest.includes(a) && shared(a) > 0)
    .sort((a, b) => shared(b) - shared(a) || arc(artist, a) - arc(artist, b))
    .slice(0, 8);

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'MusicGroup', name: artist.name, url, ...(genreText.length ? { genre: genreText } : {}), image: thumbUrl },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Radio Venus', item: 'https://radio-venus.club/' },
        { '@type': 'ListItem', position: 2, name: `Venus in ${sign}`, item: `https://radio-venus.club${signUrl}` },
        { '@type': 'ListItem', position: 3, name: artist.name, item: url },
      ] },
    ],
  }).replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${thumbUrl}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="Radio Venus">
  <meta name="twitter:card" content="summary_large_image">
  <script>
    // Old shared links (/artist/<slug>/?t=…) start playing, as they used to
    if (/[?&]t=/.test(location.search)) location.replace('${playUrl}' + location.search);
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=EB+Garamond:ital,wght@0,400;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet">
  <script type="application/ld+json">${schema}</script>
  <style>${PROFILE_CSS}</style>
</head>
<body>
  <header>
    <a href="/" class="home-link">← radio venus</a>
    <p class="breadcrumb"><a href="/">radio venus</a><span>›</span><a href="${signUrl}">Venus in ${sign}</a><span>›</span>${esc(artist.name)}</p>
  </header>
  <main>
    <div class="lead">
      <span class="zodiac-char" aria-hidden="true">${GLYPHS[sign]}</span>
      <h1>${esc(artist.name)}</h1>
      <p class="placement">Venus ${degree}° ${sign} · ${element}${approx}</p>
    </div>
    <a class="play" href="${playUrl}">
      <span class="play-art">
        <img src="${thumbUrl}" alt="${esc(artist.name)}${track ? ` — ${esc(track)}` : ''}" width="480" height="270" loading="lazy">
        <span class="play-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></span>
      </span>
      <span class="play-label">▶ play ${track ? `“${esc(track)}”` : esc(artist.name)} on Radio Venus</span>
    </a>
    <p class="about">${aboutText}</p>
    <p class="sign-desc">${signDesc[sign]}</p>
    <p class="more"><a href="${signUrl}">What Venus in ${sign} means, and every artist who has it →</a></p>
${genres.length ? `    <section>
      <h2>Genres</h2>
      <div class="chips">
        ${genreChips}
      </div>
    </section>` : ''}
    <section>
      <h2>Closest Venus to ${esc(artist.name)}</h2>
      <ul>
${neighbourList(closest)}
      </ul>
    </section>
${kin.length ? `    <section>
      <h2>Also Venus in ${sign}</h2>
      <ul>
${neighbourList(kin)}
      </ul>
    </section>` : ''}
    <section>
      <p class="cta">Enter your birthday at <a href="/">Radio Venus</a> to find your own Venus sign and the musicians who share it.</p>
    </section>
  </main>
</body>
</html>`;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, html);
}

let totalPages = 0;
for (const [slug, artist] of slugMap) {
  const genres   = artist.genres?.length ? artist.genres : [];
  const firstGid = genres[0] ?? '';

  // Canonical page at /artist/[slug]/ — the profile
  generateProfile(`./dist/artist/${slug}`, slug, artist);
  totalPages++;

  // Genre-specific pages at /artist/[slug]/[gid]/ — single genre for context-specific sharing
  for (const gid of genres) {
    generatePage(`./dist/artist/${slug}/${gid}`, slug, artist, gid, false);
    totalPages++;
  }
}

console.log(`Generated ${totalPages} artist pages → dist/artist/`);

// ── Append canonical artist URLs to sitemap.xml ───────────────────────────
const SITEMAP_PATH = './dist/sitemap.xml';
if (fs.existsSync(SITEMAP_PATH)) {
  const today       = new Date().toISOString().split('T')[0];
  const artistUrls  = [...slugMap.keys()].map(slug => `  <url>
    <loc>https://radio-venus.club/artist/${slug}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  const existing = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const updated  = existing.replace('</urlset>', `${artistUrls}\n</urlset>`);
  fs.writeFileSync(SITEMAP_PATH, updated);
  console.log(`  sitemap.xml +${slugMap.size} artist URLs (${slugMap.size + existing.split('<url>').length - 1} total)`);
}
