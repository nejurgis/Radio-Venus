let db = [];

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const OPPOSITE_SIGNS = {
  Aries: 'Libra', Taurus: 'Scorpio', Gemini: 'Sagittarius',
  Cancer: 'Capricorn', Leo: 'Aquarius', Virgo: 'Pisces',
  Libra: 'Aries', Scorpio: 'Taurus', Sagittarius: 'Gemini',
  Capricorn: 'Cancer', Aquarius: 'Leo', Pisces: 'Virgo',
};

const SAME_ELEMENT = {
  fire: ['Aries', 'Leo', 'Sagittarius'],
  earth: ['Taurus', 'Virgo', 'Capricorn'],
  air: ['Gemini', 'Libra', 'Aquarius'],
  water: ['Cancer', 'Scorpio', 'Pisces'],
};

export async function loadDatabase() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/musicians.json`);
  db = await res.json();
  return db;
}

export function getDatabase() {
  return db;
}

// ── Venus similarity ────────────────────────────────────────────────────────

function reconstructLongitude(m) {
  return SIGNS.indexOf(m.venus.sign) * 30 + m.venus.degree;
}

function venusSimilarity(userLon, artistLon) {
  const sameSign = Math.floor(userLon / 30) === Math.floor(artistLon / 30);
  if (sameSign) {
    // Same sign: 50-100% — closer degrees within the sign rank higher
    const degDiff = Math.abs((userLon % 30) - (artistLon % 30));
    return Math.round(50 + 50 * (1 - degDiff / 30));
  }
  // Different sign: 0-49% — angular distance on the ecliptic
  const diff = Math.abs(userLon - artistLon);
  const angular = diff > 180 ? 360 - diff : diff;
  return Math.round(49 * (1 - angular / 180));
}

function sortBySimilarity(arr, userLon) {
  if (userLon == null) return shuffle(arr);
  return arr
    .map(m => ({ ...m, similarity: venusSimilarity(userLon, reconstructLongitude(m)) }))
    .sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name));
}

// ── Subgenre counts ─────────────────────────────────────────────────────────

export function getSubgenreCounts(genre) {
  const pool = db.filter(m => m.genres.includes(genre));
  const counts = {};
  for (const m of pool) {
    for (const sub of (m.subgenres || [])) {
      counts[sub] = (counts[sub] || 0) + 1;
    }
  }
  return counts;
}

// ── Match ───────────────────────────────────────────────────────────────────

export function match(venusSign, genre, element, { subgenre = null, userLongitude = null } = {}) {
  // Filter by genre, optionally narrow by subgenre
  let pool;
  if (subgenre) {
    const subPool = db.filter(m => m.genres.includes(genre) && m.subgenres.includes(subgenre));
    pool = subPool.length >= 3 ? subPool : db.filter(m => m.genres.includes(genre));
  } else {
    pool = db.filter(m => m.genres.includes(genre));
  }

  // When we have a longitude, return the full pool sorted by Venus proximity —
  // similarity scoring already ranks same-sign artists highest, so hard tier
  // cutoffs would just hide artists unnecessarily.
  if (userLongitude != null) {
    return sortBySimilarity(pool, userLongitude);
  }

  // Without longitude, fall back to sign-based tiers with random shuffle.
  let results = pool.filter(m => m.venus.sign === venusSign);
  if (results.length > 0) return shuffle(results);

  const opposite = OPPOSITE_SIGNS[venusSign];
  results = pool.filter(m => m.venus.sign === opposite);
  if (results.length > 0) return shuffle(results);

  const elementSigns = SAME_ELEMENT[element] || [];
  results = pool.filter(m => elementSigns.includes(m.venus.sign));
  if (results.length > 0) return shuffle(results);

  return shuffle(pool);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
