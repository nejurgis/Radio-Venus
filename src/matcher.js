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
  const base = import.meta.env?.BASE_URL || '/public/';
  const res = await fetch(`${base}data/musicians.json`);
  db = await res.json();
  return db;
}

export function getDatabase() {
  return db;
}

// ── Venus similarity ────────────────────────────────────────────────────────

function reconstructLongitude(m) {
  // Clamp degree to <30 — Venus at exactly a sign boundary can be stored as degree=30,
  // which would overflow into the next sign and misclassify tier.
  return SIGNS.indexOf(m.venus.sign) * 30 + Math.min(m.venus.degree, 29.99);
}

const SIGN_ELEMENTS   = ['fire','earth','air','water','fire','earth','air','water','fire','earth','air','water'];
const SIGN_MODALITIES = ['cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable'];

function angularDist(a, b) {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

function venusSimilarity(userLon, artistLon) {
  const diff = Math.abs(userLon - artistLon);
  const d    = diff > 180 ? 360 - diff : diff;  // shortest arc

  const userSign    = Math.floor(userLon   / 30);
  const artistSign  = Math.floor(artistLon / 30);
  const sameSign    = userSign === artistSign;
  const userDecan   = Math.floor((userLon   % 30) / 10);
  const artistDecan = Math.floor((artistLon % 30) / 10);
  const sameDecan   = userDecan === artistDecan;

  // Tier 1 — same sign, same decan: 90–100 (1 pt per degree, 10° range)
  if (sameSign && sameDecan)  return Math.round(100 - d);

  // Tier 2 — same sign, different decan: 70–89 (maps 0°→89, 30°→70)
  if (sameSign)               return Math.round(89 - (d / 30) * 19);

  // Tier 3 — same element OR modality: 40–69
  // Primary: distance to artist's nearest sign boundary (groups all Virgo together, then all Pisces, etc.)
  // Fine:    individual degree distance within the group
  const sameElement  = SIGN_ELEMENTS[userSign]   === SIGN_ELEMENTS[artistSign];
  const sameModality = SIGN_MODALITIES[userSign] === SIGN_MODALITIES[artistSign];
  if (sameElement || sameModality) {
    const nearBound = Math.min(
      angularDist(userLon, artistSign * 30),
      angularDist(userLon, artistSign * 30 + 30)
    );
    return Math.round(40 + (1 - nearBound / 180) * 24 + (1 - d / 180) * 5);
  }

  // Tier 4 — no resonance: 0–39
  return Math.round((1 - d / 180) * 39);
}

function sortBySimilarity(arr, userLon) {
  if (userLon == null) return shuffle(arr);
  for (const m of arr) {
    const lon = reconstructLongitude(m);
    m.similarity = venusSimilarity(userLon, lon);
    m._dist = angularDist(userLon, lon);
  }
  return arr.sort((a, b) =>
    b.similarity - a.similarity ||
    a._dist - b._dist ||           // tiebreak: closer degrees first
    a.name.localeCompare(b.name)
  );
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
  
  // 1. SPECIAL CASE: VALENTINE (Strict Sequence)
  // If the genre is 'valentine', ignore astrology and sort by the specific sequence index.
  if (genre === 'valentine') {
    return db.filter(m => m.genres.includes('valentine'))
             .sort((a, b) => (a.sequenceIndex ?? 999) - (b.sequenceIndex ?? 999));
  }

  // ── STANDARD LOGIC (The rest of your code) ──

  // Filter by genre, optionally narrow by subgenre
  let pool;
  if (subgenre) {
    const subPool = db.filter(m => m.genres.includes(genre) && m.subgenres.includes(subgenre));
    // Fallback to full genre if subgenre pool is too small (<3)
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

export function matchFavorites(names, userLongitude) {
  const pool = db.filter(m => names.includes(m.name));
  return sortBySimilarity(pool, userLongitude);
}

export function matchMoon(moonLongitude, limit = 10) {
  const pool = db.filter(m => m.youtubeVideoId);
  for (const m of pool) {
    const lon = reconstructLongitude(m);
    const diff = Math.abs(moonLongitude - lon);
    m.similarity = Math.round(100 * (1 - (diff > 180 ? 360 - diff : diff) / 180));
  }
  return pool.sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name)).slice(0, limit);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
