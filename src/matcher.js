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
  const res = await fetch('/data/musicians.json');
  db = await res.json();
  return db;
}

export function match(venusSign, genre, element) {
  // 1. Exact match: same Venus sign + genre
  let results = db.filter(
    m => m.venus.sign === venusSign && m.genres.includes(genre)
  );
  if (results.length > 0) return shuffle(results);

  // 2. Fallback: same Venus sign, any genre
  results = db.filter(m => m.venus.sign === venusSign);
  if (results.length > 0) return shuffle(results);

  // 3. Fallback: opposite sign + genre
  const opposite = OPPOSITE_SIGNS[venusSign];
  results = db.filter(
    m => m.venus.sign === opposite && m.genres.includes(genre)
  );
  if (results.length > 0) return shuffle(results);

  // 4. Fallback: same element + genre
  const elementSigns = SAME_ELEMENT[element] || [];
  results = db.filter(
    m => elementSigns.includes(m.venus.sign) && m.genres.includes(genre)
  );
  if (results.length > 0) return shuffle(results);

  // 5. Last resort: any artist with this genre
  results = db.filter(m => m.genres.includes(genre));
  return shuffle(results);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
