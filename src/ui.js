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
  document.getElementById('reveal-sign').textContent = `venus in ${venus.sign}`;
  document.getElementById('reveal-detail').textContent =
    `${venus.degree}° · decan ${venus.decan} · ${venus.element}`;
}

export function renderGenreGrid(categories, subgenreMap, subgenreCounts, onGenreSelect, onSubgenreSelect) {
  const grid = document.getElementById('genre-grid');
  grid.innerHTML = '';
  for (const cat of categories) {
    const cell = document.createElement('div');
    cell.className = 'genre-cell';

    const btn = document.createElement('button');
    btn.className = 'genre-btn';
    btn.textContent = cat.label;
    btn.dataset.genre = cat.id;
    btn.addEventListener('click', () => onGenreSelect(cat.id));
    cell.appendChild(btn);

    const subs = subgenreMap[cat.id] || [];
    const counts = subgenreCounts[cat.id] || {};
    const hasSubs = subs.some(s => (counts[s] || 0) > 0);
    if (hasSubs) {
      const chipRow = document.createElement('div');
      chipRow.className = 'subgenre-chips';
      for (const sub of subs) {
        const count = counts[sub] || 0;
        if (count === 0) continue;
        const chip = document.createElement('span');
        const isClickable = count >= 7;
        chip.className = 'subgenre-chip' + (isClickable ? ' is-active' : '');
        chip.textContent = sub;
        chip.title = `${count} artist${count !== 1 ? 's' : ''}`;
        if (isClickable) {
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            onSubgenreSelect(cat.id, sub);
          });
        }
        chipRow.appendChild(chip);
      }
      cell.appendChild(chipRow);
    }

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

export function renderTrackList(tracks, currentIndex, onSelect, failedIds = new Set()) {
  const list = document.getElementById('track-list');
  list.innerHTML = '';
  tracks.forEach((track, i) => {
    const failed = failedIds.has(track.youtubeVideoId);
    const item = document.createElement('div');
    item.className = 'track-item'
      + (i === currentIndex ? ' active' : '')
      + (failed ? ' is-failed' : '');
    item.dataset.index = i;
    const simHtml = track.similarity != null
      ? `<span class="track-similarity">${track.similarity}%</span>` : '';
    const deg = track.venus.degree != null ? ` ${Math.round(track.venus.degree * 10) / 10}°` : '';
    const el = SIGN_ELEMENTS[track.venus.sign] || 'air';
    item.innerHTML = `<span class="track-name">${track.name}${failed ? ' <span class="track-restricted">restricted</span>' : ''}</span><span class="track-meta">${simHtml}<span class="track-item-sign" style="color:var(--${el})">${track.venus.sign}${deg}</span></span>`;
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
  document.getElementById('np-artist').textContent = name || '';
  document.getElementById('np-title').textContent = title || '';
}

export function updatePlayButton(isPlaying) {
  document.getElementById('btn-play').innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
}

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function updateProgress(current, duration) {
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('current-time').textContent = formatTime(current);
  document.getElementById('duration').textContent = formatTime(duration);
  document.getElementById('seeker').value = duration > 0 ? (current / duration) * 1000 : 0;
}

export function resetProgress() {
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-buffer').style.width = '0%';
  document.getElementById('current-time').textContent = '0:00';
  document.getElementById('duration').textContent = '0:00';
  document.getElementById('seeker').value = 0;
  hideBuffering();
}

export function showBuffering(targetPct) {
  document.getElementById('progress-buffer').style.width = targetPct + '%';
  document.querySelector('.progress-container').classList.add('is-buffering');
  document.getElementById('np-buffering').hidden = false;
}

export function hideBuffering() {
  document.querySelector('.progress-container').classList.remove('is-buffering');
  document.getElementById('np-buffering').hidden = true;
  document.getElementById('progress-buffer').style.width = '0%';
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
