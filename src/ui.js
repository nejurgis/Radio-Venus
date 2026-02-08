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
  document.getElementById('reveal-glyph').textContent = venus.glyph;
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

export function renderRadioHeader(signName, genreLabel, subgenreLabel = null) {
  document.getElementById('radio-sign').textContent = `♀ ${signName}`;
  document.getElementById('radio-genre').textContent = subgenreLabel
    ? `${genreLabel} · ${subgenreLabel}`
    : genreLabel;
}

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
    item.innerHTML = `<span class="track-name">${track.name}${failed ? ' <span class="track-restricted">restricted</span>' : ''}</span><span class="track-meta">${simHtml}<span class="track-item-sign">${track.venus.sign}${deg}</span></span>`;
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

export function updateNowPlaying(name) {
  document.getElementById('np-artist').textContent = name || '';
}

export function updatePlayButton(isPlaying) {
  document.getElementById('btn-play').innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
}

export function showEmptyState(show) {
  const el = document.getElementById('empty-state');
  const player = document.querySelector('.player-container');
  const controls = document.querySelector('.radio-controls');
  const trackList = document.getElementById('track-list');
  const np = document.getElementById('now-playing');

  el.hidden = !show;
  player.style.display = show ? 'none' : '';
  controls.style.display = show ? 'none' : '';
  trackList.style.display = show ? 'none' : '';
  np.style.display = show ? 'none' : '';
}
