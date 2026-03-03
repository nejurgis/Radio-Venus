import fs from 'fs';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
               'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

const GLYPHS = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

const GENRE_LABELS = {
  idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
  darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
  classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
  triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
  hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
};

const MIN_ARTISTS = 5;

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
    return `<a href="${href}"${active}>${GLYPHS[s]} ${s}</a>`;
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
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --bg: #0e0b14; --text: #e0d8ee; --muted: #9080a8; --accent: #c8a8e8; --border: #2a2040; }
  body { background: var(--bg); color: var(--text); font-family: 'Archivo', sans-serif;
         font-size: 16px; line-height: 1.6; padding: 2rem 1rem; max-width: 760px; margin: 0 auto; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a.current { color: var(--text); font-weight: 600; pointer-events: none; }
  header { margin-bottom: 3rem; font-size: 0.875rem; color: var(--muted); }
  .breadcrumb { font-size: 0.875rem; color: var(--muted); margin-bottom: 0.5rem; }
  .breadcrumb a { color: var(--muted); }
  h1 { font-family: 'EB Garamond', serif; font-size: clamp(2rem, 5vw, 3rem); font-weight: 400;
       margin-bottom: 1.25rem; letter-spacing: -0.02em; }
  .sign-desc { font-family: 'EB Garamond', serif; font-size: 1.125rem; color: var(--muted);
               margin-bottom: 2rem; line-height: 1.7; font-style: italic; }
  .artist-count { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase;
                  color: var(--muted); margin-bottom: 1.25rem; }
  ul.artist-list { list-style: none; border-top: 1px solid var(--border); }
  ul.artist-list li { display: flex; justify-content: space-between; align-items: baseline;
                      padding: 0.6rem 0; border-bottom: 1px solid var(--border); gap: 1rem; }
  .artist-name { font-weight: 500; }
  .artist-meta { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
  .cta { margin-top: 3rem; padding: 1.5rem; border: 1px solid var(--border); border-radius: 4px;
         font-family: 'EB Garamond', serif; font-size: 1.05rem; color: var(--muted); }
  .cta a { color: var(--text); }
  .nav-label { font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase;
               color: var(--muted); margin-bottom: 0.75rem; }
  .sign-nav { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid var(--border); }
  .sign-links, .genre-links { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .sign-links a, .genre-links a { font-size: 0.875rem; padding: 0.3rem 0.75rem;
    border: 1px solid var(--border); border-radius: 2rem; color: var(--muted); }
  .sign-links a:hover, .genre-links a:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }
  .sign-links a.current, .genre-links a.current { border-color: var(--text); color: var(--text); font-weight: 500; }
  .genre-nav { margin-top: 1.5rem; margin-bottom: 2rem; }
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
  <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&family=EB+Garamond:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
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
  <header><a href="/">← Radio Venus</a></header>
  <main>
    <h1>${glyph} Venus in ${sign}</h1>
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
      .map(s => `<a href="/sign/${s.toLowerCase()}/${genre}/">${GLYPHS[s]} ${s}</a>`)
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
  <header><a href="/">← Radio Venus</a></header>
  <main>
    <p class="breadcrumb"><a href="/sign/${slug}/">Venus in ${sign}</a> › ${genreLabel}</p>
    <h1>${glyph} Venus in ${sign} — ${genreLabel}</h1>
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

// ── Sitemap ──────────────────────────────────────────────────────────────────

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://radio-venus.club/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${sitemapUrls.map(({ url, priority, changefreq }) => `  <url>
    <loc>${url}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>`;

fs.writeFileSync('./dist/sitemap.xml', sitemap);
console.log(`  sitemap.xml updated (${sitemapUrls.length + 1} URLs)`);
