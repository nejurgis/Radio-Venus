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
const COMPATIBLE_ELEMENTS = { fire: 'air', air: 'fire', earth: 'water', water: 'earth' };

// Exaltation affinity: index = user sign, value = artist sign that gets a hidden boost.
// Logic: a sign's ruling planet is exalted in the affinity sign — an "aspirational" bond
// where the user's foundational energy reveres the idealized version of that energy.
// Traditional rulerships: Aries/Scorpio=Mars, Taurus/Libra=Venus, Gemini/Virgo=Mercury,
// Cancer=Moon, Leo=Sun, Sagittarius/Pisces=Jupiter, Capricorn/Aquarius=Saturn.
//                     Ari Tau Gem Can Leo Vir Lib Sco Sag Cap Aqu Pis
const EXALTATION_AFFINITY = [9, 11,  5,  1,  0,  5, 11,  9,  3,  6,  6,  3];

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

  let score;

  if (sameSign && sameDecan) {
    // Tier 1 — same sign, same decan: 90–100
    score = Math.round(100 - d);
  } else if (sameSign) {
    // Tier 2 — same sign, different decan: 70–89
    score = Math.round(89 - (d / 30) * 19);
  } else {
    const userElement   = SIGN_ELEMENTS[userSign];
    const artistElement = SIGN_ELEMENTS[artistSign];
    const sameElement        = userElement === artistElement;
    const compatibleElement  = COMPATIBLE_ELEMENTS[userElement] === artistElement;
    const sameModality       = SIGN_MODALITIES[userSign] === SIGN_MODALITIES[artistSign];

    if (sameElement || compatibleElement || sameModality) {
      const nearBound = Math.min(
        angularDist(userLon, artistSign * 30),
        angularDist(userLon, artistSign * 30 + 30)
      );
      if (sameElement)       score = Math.round(55 + (1 - nearBound / 180) * 9 + (1 - d / 180) * 5); // T3a 55–69
      else if (compatibleElement) score = Math.round(45 + (1 - nearBound / 180) * 5 + (1 - d / 180) * 4); // T3b 45–54
      else                   score = Math.round(40 + (1 - nearBound / 180) * 3 + (1 - d / 180) * 1); // T3c 40–44
    } else {
      // Tier 4 — no resonance (aversion): 0–39
      // Antiscia (solstice mirror, sum%12===5): equal daylight shadow bond.
      // Contra-antiscia (equinox mirror, sum%12===11): faint structural sympathy.
      const base = Math.round((1 - d / 180) * 39);
      const sum  = (userSign + artistSign) % 12;
      score = sum === 5 ? Math.min(39, base + 8)   // antiscia
            : sum === 11 ? Math.min(39, base + 5)  // contra-antiscia
            : base;
    }
  }

  // Exaltation affinity — directional aspirational bond (+5, capped at 69).
  // The user's ruling planet is exalted in this artist's sign: a "reverential" pull
  // that elevates the artist above others in the same tier.
  // Does not affect T1/T2 (same sign) or Virgo's self-referential exaltation.
  if (artistSign !== userSign && artistSign === EXALTATION_AFFINITY[userSign]) {
    score = Math.min(69, score + 5);
  }

  return score;
}

function sortBySimilarity(arr, userLon) {
  if (userLon == null) return shuffle(arr);
  for (const m of arr) {
    const lon = reconstructLongitude(m);
    m.similarity = venusSimilarity(userLon, lon);
    m._dist = angularDist(userLon, lon);
    const artistSign = Math.floor(lon / 30);
    // Nearest boundary of the artist's sign — used as tiebreaker to guarantee
    // all artists from the same sign group cluster together even when the fine
    // adjustment in venusSimilarity causes their rounded scores to tie.
    m._signGroupDist = Math.min(
      angularDist(userLon, artistSign * 30),
      angularDist(userLon, artistSign * 30 + 30)
    );
    m._signIndex = artistSign;
  }
  return arr.sort((a, b) =>
    b.similarity - a.similarity ||
    a._signGroupDist - b._signGroupDist ||  // same score → cluster by sign group
    a._signIndex    - b._signIndex    ||    // symmetric signs (e.g. Leo/Libra for Virgo) → zodiac order
    a._dist         - b._dist         ||    // same group → closer degrees first
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

export function matchSun(sunLongitude, limit = 10) {
  const pool = db.filter(m => m.youtubeVideoId);
  return sortBySimilarity(pool, sunLongitude).slice(0, limit);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
