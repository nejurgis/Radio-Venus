import { defineConfig } from 'vite';
import fs from 'fs';

const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function artistIndexPlugin() {
  return {
    name: 'artist-index',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const db = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'));

        const bySign = {};
        SIGN_ORDER.forEach(s => { bySign[s] = []; });
        db.forEach(a => {
          const sign = a.venus?.sign;
          if (sign && bySign[sign] && a.name !== '@') bySign[sign].push(a);
        });
        Object.values(bySign).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));

        let indexHtml = '';
        SIGN_ORDER.forEach(sign => {
          const artists = bySign[sign];
          if (!artists.length) return;
          indexHtml += `<div class="index-sign-group">`;
          indexHtml += `<h3 class="index-sign-heading"><a href="#venus-${sign.toLowerCase()}">${sign}</a></h3>`;
          indexHtml += `<div class="index-artist-list">`;
          indexHtml += artists.map(a => {
            const deg = Math.round(a.venus?.degree || 0);
            return `<span class="index-artist" title="${sign} ${deg}°">${a.name} ${deg}°</span>`;
          }).join(' ');
          indexHtml += `</div></div>`;
        });

        const collectionSchema = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          'name': 'Musicians by Venus Sign — Radio Venus',
          'url': 'https://radio-venus.club',
          'hasPart': SIGN_ORDER.map(sign => ({
            '@type': 'WebPage',
            'name': `Venus in ${sign} Musicians`,
            'url': `https://radio-venus.club/sign/${sign.toLowerCase()}/`,
          })),
        });
        const schemaTag = `<script type="application/ld+json">${collectionSchema}</script>`;

        return html
          .replace('</head>', `${schemaTag}\n</head>`)
          .replace(
            '<div id="artist-index" class="artist-index"></div>',
            `<div id="artist-index" class="artist-index">${indexHtml}</div>`
          );
      },
    },
  };
}

function artistPageDevPlugin() {
  return {
    name: 'artist-page-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/artist\/([^/?#]+)(?:\/([^/?#]+))?([?#].*)?$/);
        if (!m) return next();

        const slug      = m[1];
        const gidFromUrl = m[2]; // optional genre segment
        const qs        = m[3] || '';
        const t         = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : '').get('t') || '0';

        const db     = JSON.parse(fs.readFileSync('./public/data/musicians.json', 'utf8'));
        const artist = db.find(a => {
          const s = a.name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ').trim()
            .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          return s === slug;
        });

        if (!artist?.youtubeVideoId) return next();

        const GENRE_LABELS = {
          idm: 'IDM', ambient: 'Ambient', artpop: 'Art Pop', techno: 'Techno',
          darkwave: 'Darkwave', electronica: 'Electronica', altrock: 'Alternative Rock',
          classical: 'Classical', indiepop: 'Indie Pop', folk: 'Folk',
          triphop: 'Trip-Hop', industrial: 'Industrial', jazz: 'Jazz',
          hiphop: 'Hip-Hop', dnb: 'Drum & Bass', intercelestial: 'Intercelestial',
        };
        const gid    = gidFromUrl || (artist.genres?.[0] ?? '');
        const params = new URLSearchParams({
          vid: artist.youtubeVideoId, artist: artist.name, gid,
          sign:  (artist.venus?.sign ?? '').toLowerCase(),
          genre: GENRE_LABELS[gid] || gid,
          t,
        });
        res.writeHead(302, { Location: `/?${params}` });
        res.end();
      });
    },
  };
}

// Convert the render-blocking <link rel="stylesheet"> injected by Vite into a
// preloaded non-blocking load.  The critical CSS already inlined in index.html
// prevents FOUC so the page is usable immediately.
function deferCSSPlugin() {
  return {
    name: 'defer-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
          (_, href) =>
            `<link rel="preload" as="style" href="${href}" onload="this.rel='stylesheet'">` +
            `<noscript><link rel="stylesheet" href="${href}"></noscript>`
        );
      },
    },
  };
}

// Strip the importmap from production HTML — astronomy-engine is already bundled
// by Vite at build time so the importmap is dead weight in the served page.
function removeImportMapPlugin() {
  return {
    name: 'remove-importmap',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/g, '');
      },
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/',
  build: {
    outDir: 'dist',
  },
  plugins: [artistIndexPlugin(), artistPageDevPlugin(), deferCSSPlugin(), removeImportMapPlugin()],
});
