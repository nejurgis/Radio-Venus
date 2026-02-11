const KEY = 'radio-venus-favorites';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

function save(names) {
  localStorage.setItem(KEY, JSON.stringify(names));
}

export function getFavorites() {
  return load();
}

export function isFavorite(name) {
  return load().includes(name);
}

export function toggleFavorite(name) {
  const favs = load();
  const idx = favs.indexOf(name);
  if (idx >= 0) {
    favs.splice(idx, 1);
    save(favs);
    return false;
  }
  favs.push(name);
  save(favs);
  return true;
}
