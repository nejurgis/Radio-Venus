const KEY = 'radio-venus-favorites';

// In-memory cache — avoids JSON.parse on every check
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = new Set(JSON.parse(localStorage.getItem(KEY)) || []); }
  catch { cache = new Set(); }
  return cache;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify([...cache]));
}

export function getFavorites() {
  return [...load()];
}

export function isFavorite(name) {
  return load().has(name);
}

export function toggleFavorite(name) {
  const favs = load();
  if (favs.has(name)) {
    favs.delete(name);
    save();
    return false;
  }
  favs.add(name);
  save();
  return true;
}
