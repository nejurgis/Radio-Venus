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

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/',
  build: {
    outDir: 'dist',
  },
  plugins: [artistIndexPlugin()],
});
