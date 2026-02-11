const screens = {};
let currentScreen = null;

export function initScreens() {
  document.querySelectorAll('.screen').forEach(el => {
    screens[el.id.replace('screen-', '')] = el;
  });
  currentScreen = 'portal';
}

export function showScreen(name) {
  if (screens[currentScreen]) screens[currentScreen].classList.remove('active');
  if (screens[name]) screens[name].classList.add('active');
  currentScreen = name;
}

export function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }
}

export function setElementTheme(element) {
  document.body.className = '';
  if (element) document.body.classList.add(`element-${element}`);
}

export function renderReveal(venus) {
  document.getElementById('reveal-sign').textContent =
    `venus in ${Math.min(29, Math.round(venus.degree))}° ${venus.sign}`;
  const detail = document.getElementById('reveal-detail');
  detail.textContent = venus.element;
  detail.style.color = `var(--${venus.element})`;
}

export function renderGenreGrid(categories, subgenreMap, subgenreCounts, onGenreSelect, onSubgenreSelect) {
  const grid = document.getElementById('genre-grid');
  grid.innerHTML = '';
  for (const cat of categories) {
    const cell = document.createElement('div');
    cell.className = 'genre-cell';

    const row = document.createElement('div');
    row.className = 'genre-row';

    const btn = document.createElement('button');
    btn.className = 'genre-btn';
    btn.textContent = cat.label;
    btn.dataset.genre = cat.id;
    btn.addEventListener('click', () => onGenreSelect(cat.id));
    row.appendChild(btn);

    cell.appendChild(row);

    grid.appendChild(cell);
  }
}

export function highlightGenres(genreIds) {
  const grid = document.getElementById('genre-grid');
  if (!grid) return;
  grid.querySelectorAll('.genre-btn').forEach(btn => {
    btn.classList.toggle('is-highlighted', genreIds != null && genreIds.includes(btn.dataset.genre));
  });
}

export function renderRadioHeader(signName, genreLabel, subgenreLabel = null) {
  document.getElementById('radio-sign').textContent = signName;
  document.getElementById('radio-genre').textContent = subgenreLabel
    ? `${genreLabel} · ${subgenreLabel}`
    : genreLabel;
}

const SIGN_ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

export function updateFavoriteButton(isFav) {
  const btn = document.getElementById('btn-fav');
  if (!btn) return;
  btn.innerHTML = isFav ? '&#9829;' : '&#9825;';
  btn.classList.toggle('is-favorited', isFav);
}

export function renderTrackList(tracks, currentIndex, onSelect, failedIds = new Set(), favSet = new Set()) {
  const list = document.getElementById('track-list');
  list.innerHTML = '';
  tracks.forEach((track, i) => {
    const failed = failedIds.has(i);
    const item = document.createElement('div');
    item.className = 'track-item'
      + (i === currentIndex ? ' active' : '')
      + (failed ? ' is-failed' : '');
    item.dataset.index = i;
    const simHtml = track.similarity != null
      ? `<span class="track-similarity">${track.similarity}%</span>` : '';
    const deg = track.venus.degree != null ? ` ${Math.round(track.venus.degree * 10) / 10}°` : '';
    const el = SIGN_ELEMENTS[track.venus.sign] || 'air';
    const favHtml = favSet.has(track.name) ? '<span class="track-fav">\u2665</span>' : '';
    item.innerHTML = `<span class="track-name">${favHtml}${track.name}${failed ? ' <span class="track-restricted">restricted</span>' : ''}</span><span class="track-meta">${simHtml}<span class="track-item-sign" style="color:var(--${el})">${track.venus.sign}${deg}</span></span>`;
    if (!failed) item.addEventListener('click', () => onSelect(i));
    list.appendChild(item);
  });
}

export function markTrackFailed(index) {
  const list = document.getElementById('track-list');
  const item = list.querySelector(`[data-index="${index}"]`);
  if (item) {
    item.classList.add('is-failed');
    const nameSpan = item.querySelector('span');
    if (nameSpan && !nameSpan.querySelector('.track-restricted')) {
      nameSpan.insertAdjacentHTML('beforeend', ' <span class="track-restricted">restricted</span>');
    }
  }
}

export function updateNowPlaying(name, title) {
  const label = title ? `${name} — ${title}` : name || '';
  document.getElementById('np-label').textContent = label;
  document.getElementById('np-label-dup').textContent = label;
  // Restart marquee animation
  const marquee = document.querySelector('.np-marquee');
  if (marquee) {
    marquee.style.animation = 'none';
    marquee.offsetHeight;
    marquee.style.animation = '';
  }
}

export function updatePlayButton(state) {
  const btn = document.getElementById('btn-play');
  if (state === 'buffering') {
    btn.innerHTML = '<svg class="btn-play-spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M10,50c0,0,0,0.5,0.1,1.4c0,0.5,0.1,1,0.2,1.7c0,0.3,0.1,0.7,0.1,1.1c0.1,0.4,0.1,0.8,0.2,1.2c0.2,0.8,0.3,1.8,0.5,2.8c0.3,1,0.6,2.1,0.9,3.2c0.3,1.1,0.9,2.3,1.4,3.5c0.5,1.2,1.2,2.4,1.8,3.7c0.3,0.6,0.8,1.2,1.2,1.9c0.4,0.6,0.8,1.3,1.3,1.9c1,1.2,1.9,2.6,3.1,3.7c2.2,2.5,5,4.7,7.9,6.7c3,2,6.5,3.4,10.1,4.6c3.6,1.1,7.5,1.5,11.2,1.6c4-0.1,7.7-0.6,11.3-1.6c3.6-1.2,7-2.6,10-4.6c3-2,5.8-4.2,7.9-6.7c1.2-1.2,2.1-2.5,3.1-3.7c0.5-0.6,0.9-1.3,1.3-1.9c0.4-0.6,0.8-1.3,1.2-1.9c0.6-1.3,1.3-2.5,1.8-3.7c0.5-1.2,1-2.4,1.4-3.5c0.3-1.1,0.6-2.2,0.9-3.2c0.2-1,0.4-1.9,0.5-2.8c0.1-0.4,0.1-0.8,0.2-1.2c0-0.4,0.1-0.7,0.1-1.1c0.1-0.7,0.1-1.2,0.2-1.7C90,50.5,90,50,90,50s0,0.5,0,1.4c0,0.5,0,1,0,1.7c0,0.3,0,0.7,0,1.1c0,0.4-0.1,0.8-0.1,1.2c-0.1,0.9-0.2,1.8-0.4,2.8c-0.2,1-0.5,2.1-0.7,3.3c-0.3,1.2-0.8,2.4-1.2,3.7c-0.2,0.7-0.5,1.3-0.8,1.9c-0.3,0.7-0.6,1.3-0.9,2c-0.3,0.7-0.7,1.3-1.1,2c-0.4,0.7-0.7,1.4-1.2,2c-1,1.3-1.9,2.7-3.1,4c-2.2,2.7-5,5-8.1,7.1c-0.8,0.5-1.6,1-2.4,1.5c-0.8,0.5-1.7,0.9-2.6,1.3L66,87.7l-1.4,0.5c-0.9,0.3-1.8,0.7-2.8,1c-3.8,1.1-7.9,1.7-11.8,1.8L47,90.8c-1,0-2-0.2-3-0.3l-1.5-0.2l-0.7-0.1L41.1,90c-1-0.3-1.9-0.5-2.9-0.7c-0.9-0.3-1.9-0.7-2.8-1L34,87.7l-1.3-0.6c-0.9-0.4-1.8-0.8-2.6-1.3c-0.8-0.5-1.6-1-2.4-1.5c-3.1-2.1-5.9-4.5-8.1-7.1c-1.2-1.2-2.1-2.7-3.1-4c-0.5-0.6-0.8-1.4-1.2-2c-0.4-0.7-0.8-1.3-1.1-2c-0.3-0.7-0.6-1.3-0.9-2c-0.3-0.7-0.6-1.3-0.8-1.9c-0.4-1.3-0.9-2.5-1.2-3.7c-0.3-1.2-0.5-2.3-0.7-3.3c-0.2-1-0.3-2-0.4-2.8c-0.1-0.4-0.1-0.8-0.1-1.2c0-0.4,0-0.7,0-1.1c0-0.7,0-1.2,0-1.7C10,50.5,10,50,10,50z" fill="currentColor"/></svg>';
  } else {
    btn.innerHTML = state ? '&#9646;&#9646;' : '&#9654;';
  }
}

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Bezier math for path "M 0,100 Q 500,4 1000,100": x = 1000*t, y = 100 - 192*t + 192*t²
function arcY(pct) {
  const t = pct / 100;
  return 100 - 192 * t + 192 * t * t;
}

export function updateProgress(current, duration) {
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  document.getElementById('progress-clip-rect').setAttribute('width', pct * 10);

  const playhead = document.getElementById('progress-playhead');
  if (playhead) {
    playhead.setAttribute('cx', pct * 10);
    playhead.setAttribute('cy', arcY(pct));
  }

  document.getElementById('current-time').textContent = formatTime(current);
  document.getElementById('duration').textContent = formatTime(duration);
  document.getElementById('seeker').value = duration > 0 ? (current / duration) * 1000 : 0;
}

export function resetProgress() {
  document.getElementById('progress-clip-rect').setAttribute('width', 0);
  document.getElementById('buffer-clip-rect').setAttribute('width', 0);

  const playhead = document.getElementById('progress-playhead');
  if (playhead) {
    playhead.setAttribute('cx', 0);
    playhead.setAttribute('cy', 100);
  }

  document.getElementById('current-time').textContent = '0:00';
  document.getElementById('duration').textContent = '0:00';
  document.getElementById('seeker').value = 0;
  hideBuffering();
}

export function showBuffering(targetPct) {
  document.getElementById('buffer-clip-rect').setAttribute('width', targetPct * 10);
  document.querySelector('.progress-container').classList.add('is-buffering');
}

export function hideBuffering() {
  document.querySelector('.progress-container').classList.remove('is-buffering');
  document.getElementById('buffer-clip-rect').setAttribute('width', 0);
}

export function showEmptyState(show) {
  const el = document.getElementById('empty-state');
  const player = document.querySelector('.player-container');
  const controls = document.querySelector('.radio-controls');
  const trackList = document.getElementById('track-list');
  const np = document.getElementById('now-playing');

  const progress = document.querySelector('.progress-container');

  el.hidden = !show;
  player.style.display = show ? 'none' : '';
  controls.style.display = show ? 'none' : '';
  trackList.style.display = show ? 'none' : '';
  np.style.display = show ? 'none' : '';
  progress.style.display = show ? 'none' : '';
}
