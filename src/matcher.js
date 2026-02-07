let db = [];

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

export function match(venusSign, genre, element) {
  // All fallbacks stay within the selected genre — never mix genres.
  const pool = db.filter(m => m.genres.includes(genre));

  // 1. Exact: same Venus sign + genre
  let results = pool.filter(m => m.venus.sign === venusSign);
  if (results.length > 0) return shuffle(results);

  // 2. Opposite sign (astrological polarity)
  const opposite = OPPOSITE_SIGNS[venusSign];
  results = pool.filter(m => m.venus.sign === opposite);
  if (results.length > 0) return shuffle(results);

  // 3. Same element (fire/earth/air/water siblings)
  const elementSigns = SAME_ELEMENT[element] || [];
  results = pool.filter(m => elementSigns.includes(m.venus.sign));
  if (results.length > 0) return shuffle(results);

  // 4. Last resort: all artists in this genre regardless of sign
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
