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
  return SIGNS.indexOf(m.venus.sign) * 30 + m.venus.degree;
}

const SIGN_ELEMENTS   = ['fire','earth','air','water','fire','earth','air','water','fire','earth','air','water'];
const SIGN_MODALITIES = ['cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable'];

function venusSimilarity(userLon, artistLon) {
  const diff = Math.abs(userLon - artistLon);
  const angularDistance = diff > 180 ? 360 - diff : diff;
  const rawScore = 100 * (1 - angularDistance / 180);

  const userSign   = Math.floor(userLon   / 30);
  const artistSign = Math.floor(artistLon / 30);
  const sameSign   = userSign === artistSign;
  const userDecan   = Math.floor((userLon   % 30) / 10);
  const artistDecan = Math.floor((artistLon % 30) / 10);
  const sameDecan   = userDecan === artistDecan;

  // Tier 1: same sign + same decan → +20 bonus (caps at 100)
  if (sameSign && sameDecan)  return Math.min(100, Math.round(rawScore + 20));
  // Tier 2: same sign, different decan → +10 bonus (caps at 99)
  if (sameSign && !sameDecan) return Math.min(99,  Math.round(rawScore + 10));
  // Tier 3: same element OR modality (trine/square resonance) → +5 bonus (caps at 85)
  const sameElement  = SIGN_ELEMENTS[userSign]   === SIGN_ELEMENTS[artistSign];
  const sameModality = SIGN_MODALITIES[userSign] === SIGN_MODALITIES[artistSign];
  if (sameElement || sameModality) return Math.min(85, Math.round(rawScore + 5));
  // Tier 4: no resonance — raw angular score, capped at 70
  return Math.min(70, Math.round(rawScore));
}

function angularDist(a, b) {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
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
