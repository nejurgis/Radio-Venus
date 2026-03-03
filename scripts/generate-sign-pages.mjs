import fs from 'fs';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
               'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

const GLYPHS = {
  Aries: 'A', Taurus: 'B', Gemini: 'C', Cancer: 'D', Leo: 'E', Virgo: 'F',
  Libra: 'G', Scorpio: 'H', Sagittarius: 'J', Capricorn: 'K', Aquarius: 'L', Pisces: 'M',
};

const GENRE_LABELS = {
  idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
  darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
  classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
  triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
  hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
};

const MIN_ARTISTS = 5;

const SIGN_ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

const db = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'))
  .filter(a => a.name !== '@' && a.venus?.sign);

// Extract sign descriptions from source index.html
const sourceHtml = fs.readFileSync('./index.html', 'utf8');
const descriptions = {};
for (const sign of SIGNS) {
  const m = sourceHtml.match(new RegExp(`id="venus-${sign.toLowerCase()}"[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>`));
  descriptions[sign] = m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// Build genre×sign index
const bySignGenre = {};
for (const sign of SIGNS) {
  bySignGenre[sign] = {};
  for (const genre of Object.keys(GENRE_LABELS)) bySignGenre[sign][genre] = [];
}
db.forEach(a => {
  const sign = a.venus.sign;
  (a.genres || []).forEach(g => {
    if (bySignGenre[sign]?.[g]) bySignGenre[sign][g].push(a);
  });
});
// Sort each group alphabetically
for (const sign of SIGNS)
  for (const genre of Object.keys(bySignGenre[sign]))
    bySignGenre[sign][genre].sort((a, b) => a.name.localeCompare(b.name));

// ── Shared HTML snippets ────────────────────────────────────────────────────

function signNav(currentSign = null, currentGenre = null) {
  const links = SIGNS.map(s => {
    const href = currentGenre
      ? (bySignGenre[s]?.[currentGenre]?.length >= MIN_ARTISTS
          ? `/sign/${s.toLowerCase()}/${currentGenre}/`
          : `/sign/${s.toLowerCase()}/`)
      : `/sign/${s.toLowerCase()}/`;
    const active = s === currentSign ? ' class="current"' : '';
    return `<a href="${href}"${active}><span class="z">${GLYPHS[s]}</span> ${s}</a>`;
  }).join('\n      ');
  return `<nav class="sign-nav" aria-label="Browse signs">
    <p class="nav-label">Browse all signs</p>
    <div class="sign-links">
      ${links}
    </div>
  </nav>`;
}

function genreNav(currentSign, currentGenre = null) {
  const viableGenres = Object.entries(bySignGenre[currentSign])
    .filter(([, arr]) => arr.length >= MIN_ARTISTS)
    .sort((a, b) => b[1].length - a[1].length);
  if (!viableGenres.length) return '';
  const links = viableGenres.map(([g, arr]) => {
    const active = g === currentGenre ? ' class="current"' : '';
    return `<a href="/sign/${currentSign.toLowerCase()}/${g}/"${active}>${GENRE_LABELS[g]} (${arr.length})</a>`;
  }).join('\n      ');
  return `<nav class="genre-nav" aria-label="Filter by genre">
    <p class="nav-label">Filter by genre</p>
    <div class="genre-links">
      <a href="/sign/${currentSign.toLowerCase()}/"${!currentGenre ? ' class="current"' : ''}>All (${db.filter(a => a.venus.sign === currentSign).length})</a>
      ${links}
    </div>
  </nav>`;
}

const CSS = `
  @font-face {
    font-family: 'Zodiac St';
    src: url('/assets/ZodiacSt.woff') format('woff');
    font-weight: normal;
    font-style: normal;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0c;
    color: #e8e8f0;
    font-family: 'Helvetica Neue', Helvetica, 'Archivo', Arial, sans-serif;
    font-size: clamp(15px, 3vw, 18px);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  main {
    max-width: 610px;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
  }
  a {
    color: #fff;
    text-decoration: none;
    background: linear-gradient(#fff, #fff);
    background-repeat: repeat-x;
    background-position: 0 96%;
    background-size: 1px 1px;
  }
  a:hover { color: rgba(255,255,255,0.55); background-image: linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)); }
  header { padding: 2rem 1.5rem 0; max-width: 610px; margin: 0 auto; }
  .home-link {
    font-size: 0.75rem; letter-spacing: 0.06em; color: rgba(255,255,255,0.35);
    background: none; text-transform: lowercase;
  }
  .home-link:hover { color: #fff; background: none; }
  .breadcrumb {
    font-size: 0.7rem; letter-spacing: 0.04em;
    color: rgba(255,255,255,0.3); margin-bottom: 0.75rem;
  }
  .breadcrumb a { color: rgba(255,255,255,0.3); background: none; }
  .breadcrumb a:hover { color: rgba(255,255,255,0.7); }
  .breadcrumb span { color: rgba(255,255,255,0.15); margin: 0 0.35em; }
  .sign-lead {
    text-align: center; margin-bottom: 1.5rem;
  }
  .zodiac-char {
    font-family: 'Zodiac St', serif;
    font-size: 5rem; display: block; line-height: 1;
    margin-bottom: 0.5rem; color: #fff;
  }
  .sign-name {
    display: block; font-size: 0.6rem; letter-spacing: 0.1em;
    text-transform: lowercase; color: #fff; text-align: center;
  }
  .sign-desc {
    font-size: 1rem; line-height: 1.4;
    color: rgba(255,255,255,0.7); text-indent: 1.5em; margin-bottom: 2rem;
  }
  .artist-count {
    font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,0.3); margin-bottom: 1rem;
  }
  ul.artist-list { list-style: none; }
  ul.artist-list li {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 0.55rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); gap: 1rem;
  }
  .artist-name { font-weight: 400; color: #e8e8f0; background: none; }
  .artist-meta {
    font-family: 'IBM Plex Mono', monospace; font-size: 0.6rem;
    color: rgba(255,255,255,0.28); white-space: nowrap; text-transform: uppercase;
  }
  .cta {
    margin-top: 3rem; font-size: 0.9rem; color: rgba(255,255,255,0.45);
    border-top: 1px solid rgba(255,255,255,0.08); padding-top: 2rem;
  }
  .cta a { color: #fff; }
  .nav-label {
    font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,0.28); margin-bottom: 0.75rem;
  }
  .sign-nav { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.06); }
  .genre-nav { margin-bottom: 2rem; }
  .sibling-nav { margin-top: 1.5rem; }
  .sign-links, .genre-links { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .z { font-family: 'Zodiac St', serif; }
  .sign-links a, .genre-links a {
    font-size: 0.75rem; padding: 0.25rem 0.65rem;
    border: 1px solid rgba(255,255,255,0.12); border-radius: 2rem;
    color: rgba(255,255,255,0.4); background: none;
  }
  .sign-links a:hover, .genre-links a:hover {
    border-color: rgba(255,255,255,0.45); color: #fff; background: none;
  }
  a.current, .sign-links a.current, .genre-links a.current {
    border-color: rgba(255,255,255,0.6); color: #fff;
    background: none; pointer-events: none;
  }
`;

function head(title, metaDesc, canonical, schema) {
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=EB+Garamond:ital,wght@0,400;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet">
  <script type="application/ld+json">${schema}</script>
  <style>${CSS}</style>
</head>`;
}

function artistList(artists, sign) {
  return artists.map(a => {
    const deg = Math.round(a.venus.degree || 0);
    const genres = (a.genres || []).join(', ');
    return `    <li>
      <span class="artist-name">${a.name}</span>
      <span class="artist-meta">${deg}° ${sign}${genres ? ` · ${genres}` : ''}</span>
    </li>`;
  }).join('\n');
}

// ── Sign pages ──────────────────────────────────────────────────────────────

const sitemapUrls = [];

for (const sign of SIGNS) {
  const dir = `./dist/sign/${sign.toLowerCase()}`;
  fs.mkdirSync(dir, { recursive: true });

  const artists = db.filter(a => a.venus.sign === sign).sort((a, b) => a.name.localeCompare(b.name));
  const desc = descriptions[sign];
  const glyph = GLYPHS[sign];
  const slug = sign.toLowerCase();
  const url = `https://radio-venus.club/sign/${slug}/`;

  // FAQ: what does Venus in X mean, plus top-3 genres
  const topGenres = Object.entries(bySignGenre[sign])
    .filter(([, arr]) => arr.length >= MIN_ARTISTS)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  const faqEntities = [
    {
      '@type': 'Question',
      'name': `What does Venus in ${sign} mean for musicians?`,
      'acceptedAnswer': { '@type': 'Answer', 'text': desc },
    },
    ...topGenres.map(([genre, arr]) => ({
      '@type': 'Question',
      'name': `Which ${GENRE_LABELS[genre]} artists have Venus in ${sign}?`,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': `${arr.slice(0, 6).map(a => a.name).join(', ')}${arr.length > 6 ? ` and ${arr.length - 6} more.` : '.'}`,
      },
    })),
  ];

  const schema = JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': `Venus in ${sign} Musicians`,
      'description': desc,
      'url': url,
      'itemListElement': artists.map((a, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': a.name,
        'description': `Venus in ${sign} ${Math.round(a.venus.degree || 0)}°`,
      })),
    },
    { '@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': faqEntities },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Radio Venus', 'item': 'https://radio-venus.club/' },
        { '@type': 'ListItem', 'position': 2, 'name': `Venus in ${sign}`, 'item': url },
      ],
    },
  ]);

  const metaDesc = `${artists.length} musicians with Venus in ${sign}. ${desc.slice(0, 130).replace(/"/g, '&quot;')}`;
  const title = `Venus in ${sign} Musicians | Radio Venus`;

  const html = `<!DOCTYPE html>
<html lang="en">
${head(title, metaDesc, url, schema)}
<body>
  <header><a href="/" class="home-link">← radio venus</a></header>
  <main>
    <p class="sign-lead">
      <span class="zodiac-char">${glyph}</span>
      <span class="sign-name">Venus in ${sign}</span>
    </p>
    <p class="sign-desc">${desc}</p>
    ${genreNav(sign)}
    <p class="artist-count">${artists.length} musicians in the database</p>
    <ul class="artist-list">
${artistList(artists, sign)}
    </ul>
    <div class="cta">
      <p>Enter your birthday at <a href="/">Radio Venus</a> to discover your Venus sign and hear the music that resonates with your chart.</p>
    </div>
    ${signNav(sign)}
  </main>
</body>
</html>`;

  fs.writeFileSync(`${dir}/index.html`, html);
  sitemapUrls.push({ url, priority: '0.8', changefreq: 'monthly' });
  console.log(`  /sign/${slug}/  (${artists.length} artists)`);
}

// ── Genre×sign pages ────────────────────────────────────────────────────────

let genrePageCount = 0;

for (const sign of SIGNS) {
  for (const [genre, artists] of Object.entries(bySignGenre[sign])) {
    if (artists.length < MIN_ARTISTS) continue;

    const dir = `./dist/sign/${sign.toLowerCase()}/${genre}`;
    fs.mkdirSync(dir, { recursive: true });

    const desc = descriptions[sign];
    const glyph = GLYPHS[sign];
    const genreLabel = GENRE_LABELS[genre] || genre;
    const slug = sign.toLowerCase();
    const url = `https://radio-venus.club/sign/${slug}/${genre}/`;

    // Sibling pages: other signs with the same genre
    const siblingLinks = SIGNS
      .filter(s => s !== sign && bySignGenre[s]?.[genre]?.length >= MIN_ARTISTS)
      .map(s => `<a href="/sign/${s.toLowerCase()}/${genre}/"><span class="z">${GLYPHS[s]}</span> ${s}</a>`)
      .join('\n      ');

    const faqSchema = JSON.stringify([{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': [
        {
          '@type': 'Question',
          'name': `Which ${genreLabel} artists have Venus in ${sign}?`,
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': `${artists.slice(0, 8).map(a => a.name).join(', ')}${artists.length > 8 ? ` and ${artists.length - 8} more.` : '.'}`,
          },
        },
        {
          '@type': 'Question',
          'name': `What is Venus in ${sign}?`,
          'acceptedAnswer': { '@type': 'Answer', 'text': desc },
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Radio Venus', 'item': 'https://radio-venus.club/' },
        { '@type': 'ListItem', 'position': 2, 'name': `Venus in ${sign}`, 'item': `https://radio-venus.club/sign/${slug}/` },
        { '@type': 'ListItem', 'position': 3, 'name': genreLabel, 'item': url },
      ],
    },
    ]);

    const title = `Venus in ${sign} — ${genreLabel} Musicians | Radio Venus`;
    const metaDesc = `${artists.length} ${genreLabel} musicians with Venus in ${sign}. ${desc.slice(0, 110).replace(/"/g, '&quot;')}`;

    const siblingSection = siblingLinks ? `
    <nav class="sign-nav sibling-nav" aria-label="Same genre, other signs">
      <p class="nav-label">${genreLabel} by other signs</p>
      <div class="sign-links">
      ${siblingLinks}
      </div>
    </nav>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
${head(title, metaDesc, url, faqSchema)}
<body>
  <header><a href="/" class="home-link">← radio venus</a></header>
  <main>
    <p class="breadcrumb"><a href="/sign/${slug}/">Venus in ${sign}</a><span>›</span>${genreLabel}</p>
    <p class="sign-lead">
      <span class="zodiac-char">${glyph}</span>
      <span class="sign-name">Venus in ${sign} — ${genreLabel}</span>
    </p>
    <p class="sign-desc">${desc}</p>
    ${genreNav(sign, genre)}
    <p class="artist-count">${artists.length} musicians in the database</p>
    <ul class="artist-list">
${artistList(artists, sign)}
    </ul>
    <div class="cta">
      <p>Enter your birthday at <a href="/">Radio Venus</a> to discover your Venus sign and hear the music that resonates with your chart.</p>
    </div>
    ${siblingSection}
    ${signNav(sign, genre)}
  </main>
</body>
</html>`;

    fs.writeFileSync(`${dir}/index.html`, html);
    sitemapUrls.push({ url, priority: '0.6', changefreq: 'monthly' });
    genrePageCount++;
  }
}

console.log(`  ${genrePageCount} genre×sign pages`);

// ── About page ───────────────────────────────────────────────────────────────

const ABOUT_CSS = `
  @font-face {
    font-family: 'Zodiac St';
    src: url('/assets/ZodiacSt.woff') format('woff');
    font-weight: normal; font-style: normal;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0a0a0c; color: #e8e8f0;
    font-family: 'Helvetica Neue', Helvetica, 'Archivo', Arial, sans-serif;
    font-size: clamp(15px, 3vw, 18px);
    -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  }
  main {
    max-width: 610px; margin: 0 auto; padding: 3rem 1.5rem 5rem;
    font-size: 1.25rem; line-height: 1.3;
  }
  a { color: #fff; text-decoration: none;
      background: linear-gradient(#fff,#fff) repeat-x 0 96% / 1px 1px; }
  a:hover { color: rgba(255,255,255,.55);
             background-image: linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.55)); }
  header { padding: 2rem 1.5rem 0; max-width: 610px; margin: 0 auto; }
  .home-link { font-size: .75rem; letter-spacing: .06em; color: rgba(255,255,255,.35);
               background: none; text-transform: lowercase; }
  .home-link:hover { color: #fff; background: none; }
  p { margin-top: 2rem; text-indent: 1.5em; color: rgba(255,255,255,.85); }
  .about-lead + p, .about-heading + p, .about-footnote { text-indent: 0; }
  .about-lead {
    font-size: .6rem; letter-spacing: .1em; text-transform: lowercase;
    color: rgba(255,255,255,.5); text-align: center; margin-top: 0;
  }
  .about-heading {
    font-weight: 400; font-size: .6rem; letter-spacing: .08em;
    text-transform: lowercase; color: #fff; text-align: center;
    margin-top: 2.5rem; margin-bottom: .5rem;
  }
  .about-footnote { font-size: .8rem; opacity: .5; font-style: italic; margin-top: .75rem; }
  .about-star { text-align: center; margin: 2.5rem 0 .5rem; }
  .star-toggle { position: relative; display: inline-block; width: 16px; height: 16px; margin: 4px; }
  .star-toggle::before, .star-toggle::after {
    content: ""; position: absolute; top: 50%; left: 50%;
    border-radius: 50%; transform: translate(-50%,-50%);
  }
  .star-toggle.active::before {
    width: 1px; height: 120%;
    background: linear-gradient(180deg, transparent, #fff, transparent);
    box-shadow: 0 0 4px rgba(255,255,255,.8);
  }
  .star-toggle.active::after {
    width: 120%; height: 1px;
    background: linear-gradient(90deg, transparent, #fff, transparent);
    box-shadow: 0 0 4px rgba(255,255,255,.8);
  }
  .stats-readout {
    font-family: 'IBM Plex Mono', monospace; font-size: .8rem;
    color: rgba(255,255,255,.7); max-width: 400px; margin: 1.5rem auto 0;
  }
  .stats-header {
    display: flex; justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,.1);
    padding-bottom: .5rem; margin-bottom: .5rem;
    font-size: .65rem; letter-spacing: .15em; opacity: .6;
  }
  .stats-row {
    display: flex; justify-content: space-between;
    padding: .3rem 0; border-bottom: 1px dotted rgba(255,255,255,.05);
  }
  .stats-value { font-weight: 500; }
  .val-fire { color: #e74c3c; } .val-earth { color: #27ae60; }
  .val-air  { color: #d4ac0d; } .val-water { color: #2980b9; }
  .stats-footer {
    display: flex; justify-content: space-between;
    margin-top: 1rem; padding-top: .5rem;
    border-top: 1px solid rgba(255,255,255,.2);
    font-weight: 700; color: #e8e8f0;
    letter-spacing: .1em; font-size: .75rem;
  }
  .artist-index { margin-top: 1.5rem; }
  .index-sign-group { margin-bottom: 1.25rem; }
  .index-sign-heading {
    font-size: .8rem; letter-spacing: .1em; font-weight: 400;
    margin-bottom: .35rem; text-transform: uppercase;
  }
  .index-sign-heading a { color: rgba(255,255,255,.55); background: none; }
  .index-sign-heading a:hover { color: #fff; }
  .index-artist-list {
    display: block; text-align: justify; text-align-last: justify;
    text-transform: uppercase; line-height: 1.4;
  }
  .index-artist {
    display: inline-block; white-space: nowrap;
    font-family: 'IBM Plex Mono', monospace;
    font-size: .5rem; color: rgba(255,255,255,.45);
    line-height: 1.2; vertical-align: middle;
  }
  .index-artist::after { content: ' · '; opacity: .35; }
  .index-artist:last-child::after { content: ''; }
  .z { font-family: 'Zodiac St', serif; }
  .sign-nav { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,.06); }
  .nav-label {
    font-size: .6rem; letter-spacing: .12em; text-transform: uppercase;
    color: rgba(255,255,255,.28); margin-bottom: .75rem;
  }
  .sign-links { display: flex; flex-wrap: wrap; gap: .4rem; }
  .sign-links a {
    font-size: .75rem; padding: .25rem .65rem;
    border: 1px solid rgba(255,255,255,.12); border-radius: 2rem;
    color: rgba(255,255,255,.4); background: none;
  }
  .sign-links a:hover { border-color: rgba(255,255,255,.45); color: #fff; background: none; }
`;

{
  const signCountsByCount = [...SIGNS]
    .map(s => ({ sign: s, count: db.filter(a => a.venus.sign === s).length }))
    .sort((a, b) => b.count - a.count);

  const statsRows = signCountsByCount.map(({ sign, count }) => {
    const el = SIGN_ELEMENTS[sign];
    return `        <div class="stats-row">
          <span class="stats-label">${sign}</span>
          <span class="stats-value val-${el}">${count}</span>
        </div>`;
  }).join('\n');

  const artistIndexHtml = SIGNS.map(sign => {
    const artists = db.filter(a => a.venus.sign === sign).sort((a, b) => a.name.localeCompare(b.name));
    if (!artists.length) return '';
    const items = artists.map(a => {
      const deg = Math.round(a.venus.degree || 0);
      return `<span class="index-artist">${a.name} ${deg}°</span>`;
    }).join(' ');
    return `      <div class="index-sign-group">
        <h3 class="index-sign-heading"><a href="/sign/${sign.toLowerCase()}/"><span class="z">${GLYPHS[sign]}</span> ${sign}</a></h3>
        <div class="index-artist-list">${items}</div>
      </div>`;
  }).join('\n');

  const aboutSignNav = `<nav class="sign-nav" aria-label="Browse signs">
    <p class="nav-label">Browse by sign</p>
    <div class="sign-links">
      ${SIGNS.map(s => `<a href="/sign/${s.toLowerCase()}/"><span class="z">${GLYPHS[s]}</span> ${s}</a>`).join('\n      ')}
    </div>
  </nav>`;

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    'name': 'About Radio Venus',
    'url': 'https://radio-venus.club/about/',
    'description': 'Radio Venus is an astrological music discovery tool. Enter your birthday, find your Venus sign, and hear music from artists who share your placement.',
    'isPartOf': { '@type': 'WebSite', 'url': 'https://radio-venus.club' },
  });

  const aboutHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About | Radio Venus — The Soundtrack of Your Stars</title>
  <meta name="description" content="Radio Venus maps musicians by their natal Venus sign. Enter your birthday, discover your placement, and hear the music that resonates with your chart.">
  <link rel="canonical" href="https://radio-venus.club/about/" />
  <meta property="og:title" content="About | Radio Venus">
  <meta property="og:description" content="An astrological music discovery tool mapping musicians by their natal Venus placement.">
  <meta property="og:url" content="https://radio-venus.club/about/">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=EB+Garamond:ital,wght@0,400;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet">
  <script type="application/ld+json">${schema}</script>
  <style>${ABOUT_CSS}</style>
</head>
<body>
  <header><a href="/" class="home-link">← radio venus</a></header>
  <main>
    <p class="about-lead">music echoes the universe</p>

    <p>Why does a certain melody, a bird's song, or the rhythmic hum of a mechanical apparatus sway into our deepest selves? Music removes the hard earth from underneath our feet, turns us to watery swamps, blows us away like feather clouds into the golden sunlight, invokes fire within us and burns us down, finally returning us back to earth, changed...</p>

    <p>These cycles visit us at different times throughout our lives. In the form of a teenage love song. A rhythmic banger that held you on the dance floor all night. A playlist that a loved one made for you. A quiet moment by yourself on a bench, when you needed to take a minute.</p>

    <p>Music is energy. It pushes and pulls, lifts up and throws down—that is the only way to explain its effect on us.</p>

    <div class="about-star"><span class="star-toggle active"></span></div>

    <h2 class="about-heading">how this website works</h2>

    <p>This tool is a portal leading to the beautiful patterns that open up when we look at music through the lens of Astrology&mdash;the multi-millennia wisdom of the stars.</p>

    <p>Radio Venus pools together a select and ever-expanding group of musicians by their Venus sign. We calculate exactly where Venus was positioned on the day of their inception*, placing that position relative to the 12 zodiacal images (ζῴδια, as the Greeks call it) to create a rhizomatic celestial map of musical flavor. By tuning into your personal chart, this sky is reconfigured to resonate with your unique frequencies.</p>

    <p>In Astrology, Venus is the energy that brings beauty and harmony into our lives. Its position reveals how we approach aesthetics, what we find valuable, and what we love. While a full reading considers many factors, this tool focuses purely on the Venusian placement—isolating the specific "flavor" a musician brings to the table.</p>

    <p>Enter your birthday to explore your personal sonic constellation, find your favorites, and pluck the strings of fate.𓍯𓂃</p>

    <p class="about-footnote">*For bands/collectives, we use the lead singer's birth date or the release date of their debut album if the birth date cannot be found.</p>
    <p class="about-footnote">Thank you to dear <a href="https://www.instagram.com/sophie_wright_/" target="_blank" rel="noopener">Sophie Wright</a> for embelishing and improving upon this text greatly.</p>

    <div class="about-star"><span class="star-toggle active"></span></div>

    <h2 class="about-heading">further inquieries</h2>

    <p>If you'd like to know more, suggest music, or just drop a letter, then email me at <a href="mailto:j.lietunovas@gmail.com">j.lietunovas@gmail.com</a>.<br><br>
    To dive deeper into your own astrology, I offer full astrology readings at <a href="https://jurgis.info/astrology" target="_blank" rel="noopener">jurgis.info/astrology</a></p>

    <div class="about-star"><span class="star-toggle active"></span></div>

    <h2 class="about-heading">Stats</h2>

    <div class="stats-readout">
      <div class="stats-header"><span>VENUS SIGN</span><span>COUNT</span></div>
${statsRows}
      <div class="stats-footer">
        <span>Total Musicians</span>
        <span>${db.length}</span>
      </div>
    </div>

    <div class="about-star"><span class="star-toggle active"></span></div>

    <h2 class="about-heading">Artist Index</h2>
    <div class="artist-index">
${artistIndexHtml}
    </div>

    ${aboutSignNav}
  </main>
</body>
</html>`;

  fs.mkdirSync('./dist/about', { recursive: true });
  fs.writeFileSync('./dist/about/index.html', aboutHtml);
  sitemapUrls.unshift({ url: 'https://radio-venus.club/about/', priority: '0.9', changefreq: 'weekly' });
  console.log(`  /about/  (stats + ${db.length} artists)`);
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://radio-venus.club/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${sitemapUrls.map(({ url, priority, changefreq }) => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync('./dist/sitemap.xml', sitemap);
console.log(`  sitemap.xml updated (${sitemapUrls.length + 1} URLs)`);
