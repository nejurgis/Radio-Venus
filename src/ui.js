// ─── CACHED ELEMENTS (The Speed Boost) ──────────────────────────────────────
const ui = {
  // We will populate these once in initScreens()
  screens: {},
  overlay: null,
  revealSign: null,
  revealDetail: null,
  genreGrid: null,
  radioSign: null,
  radioGenre: null,
  favBtn: null,
  trackList: null,
  npLabel: null,
  npLabelDup: null,
  npMarquee: null,
  playBtn: null,
  progressContainer: null,
  progressClip: null,
  bufferClip: null,
  playhead: null,
  currentTime: null,
  duration: null,
  seeker: null,
  emptyState: null,
  playerContainer: null,
  radioControls: null,
  nowPlaying: null,
};

let currentScreen = null;

// ─── INITIALIZATION ─────────────────────────────────────────────────────────

export function initScreens() {
  // 1. Cache Screens
  document.querySelectorAll('.screen').forEach(el => {
    ui.screens[el.id.replace('screen-', '')] = el;
  });
  currentScreen = 'portal';

  // 2. Cache All Other UI Elements (Lookups happen ONLY here)
  ui.overlay = document.getElementById('loading-overlay');
  ui.revealSign = document.getElementById('reveal-sign');
  ui.revealDetail = document.getElementById('reveal-detail');
  ui.genreGrid = document.getElementById('genre-grid');
  ui.radioSign = document.getElementById('radio-sign');
  ui.radioGenre = document.getElementById('radio-genre');
  ui.favBtn = document.getElementById('btn-fav');
  ui.trackList = document.getElementById('track-list');
  ui.npLabel = document.getElementById('np-label');
  ui.npLabelDup = document.getElementById('np-label-dup');
  ui.npMarquee = document.querySelector('.np-marquee');
  ui.playBtn = document.getElementById('btn-play');
  
  // Progress Bar Elements
  ui.progressContainer = document.querySelector('.progress-container');
  ui.progressClip = document.getElementById('progress-clip-rect');
  ui.bufferClip = document.getElementById('buffer-clip-rect');
  ui.playhead = document.getElementById('progress-playhead');
  ui.currentTime = document.getElementById('current-time');
  ui.duration = document.getElementById('duration');
  ui.seeker = document.getElementById('seeker');

  // State Containers
  ui.emptyState = document.getElementById('empty-state');
  ui.playerContainer = document.querySelector('.player-container');
  ui.radioControls = document.querySelector('.radio-controls');
  ui.nowPlaying = document.getElementById('now-playing');
}

// ─── NAVIGATION ─────────────────────────────────────────────────────────────

export function showScreen(name) {
  if (ui.screens[currentScreen]) ui.screens[currentScreen].classList.remove('active');
  if (ui.screens[name]) ui.screens[name].classList.add('active');
  currentScreen = name;
}

export function showLoading(show) {
  if (ui.overlay) ui.overlay.hidden = !show;
}

export function setElementTheme(element) {
  document.body.className = '';
  if (element) document.body.classList.add(`element-${element}`);
}

// ─── RENDERING ──────────────────────────────────────────────────────────────

export function renderReveal(venus) {
  if (ui.revealSign) ui.revealSign.textContent = `venus in ${Math.min(29, Math.round(venus.degree))}° ${venus.sign}`;
  if (ui.revealDetail) {
    ui.revealDetail.textContent = venus.element;
    ui.revealDetail.style.color = `var(--${venus.element})`;
  }
}

export function renderGenreGrid(categories, subgenreMap, subgenreCounts, onGenreSelect, onSubgenreSelect) {
  if (!ui.genreGrid) return;
  ui.genreGrid.innerHTML = '';
  
  // Create fragment to batch DOM insertions (Performance tip!)
  const fragment = document.createDocumentFragment();

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
    fragment.appendChild(cell);
  }
  ui.genreGrid.appendChild(fragment);
}

export function highlightGenres(genreIds) {
  if (!ui.genreGrid) return;
  // This query is okay since it changes infrequently
  ui.genreGrid.querySelectorAll('.genre-btn').forEach(btn => {
    btn.classList.toggle('is-highlighted', genreIds != null && genreIds.includes(btn.dataset.genre));
  });
}

export function renderRadioHeader(signName, genreLabel, subgenreLabel = null) {
  if (ui.radioSign) ui.radioSign.textContent = signName;
  if (ui.radioGenre) {
    ui.radioGenre.textContent = subgenreLabel
      ? `${genreLabel} · ${subgenreLabel}`
      : genreLabel;
  }
}

// ─── TRACK LIST ─────────────────────────────────────────────────────────────

const SIGN_ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

export function updateFavoriteButton(isFav) {
  if (!ui.favBtn) return;
  
  // Clear old icon
  ui.favBtn.innerHTML = '';
  
  // Ensure button layout allows visibility
  ui.favBtn.style.display = 'flex';
  ui.favBtn.style.alignItems = 'center';
  ui.favBtn.style.justifyContent = 'center';

  // Create the Star
  const star = document.createElement('div');
  star.className = 'star-toggle';
  if (isFav) star.classList.add('active');
  
  ui.favBtn.appendChild(star);
}

export function renderTrackList(tracks, currentIndex, onSelect, failedIds = new Set(), favSet = new Set()) {
  if (!ui.trackList) return;
  ui.trackList.innerHTML = '';
  const fragment = document.createDocumentFragment();

  tracks.forEach((track, i) => {
    const failed = failedIds.has(i);
    const isFav = favSet.has(track.name);
    
    const item = document.createElement('div');
    // Add 'is-favorited' if the track is in the favSet
    item.className = 'track-item'
      + (i === currentIndex ? ' active' : '')
      + (failed ? ' is-failed' : '')
      + (isFav ? ' is-favorited' : '');
    
    item.dataset.index = i;
    
    const simHtml = track.similarity != null
      ? `<span class="track-similarity">${track.similarity}%</span>` : '';
    const deg = track.venus.degree != null ? ` ${Math.round(track.venus.degree * 10) / 10}°` : '';
    const el = SIGN_ELEMENTS[track.venus.sign] || 'air';
    
    // We ALWAYS render the container. CSS decides if width is 0 or 24.
    const favHtml = `
      <div class="track-fav-container">
        <div class="star-toggle active" style="width:12px; height:12px; margin-right:6px;"></div>
      </div>
    `;
    
    item.innerHTML = `
      <span class="track-name" style="display: flex; align-items: center;">
        ${favHtml}
        ${track.name}${failed ? ' <span class="track-restricted">restricted</span>' : ''}
      </span>
      <span class="track-meta">
        ${simHtml}
        <span class="track-item-sign" style="color:var(--${el})">${track.venus.sign}${deg}</span>
      </span>
    `;
    
    if (!failed) item.addEventListener('click', () => onSelect(i));
    fragment.appendChild(item);
  });
  ui.trackList.appendChild(fragment);
}

export function markTrackFailed(index) {
  if (!ui.trackList) return;
  const item = ui.trackList.querySelector(`[data-index="${index}"]`);
  if (item) {
    item.classList.add('is-failed');
    const nameSpan = item.querySelector('span');
    if (nameSpan && !nameSpan.querySelector('.track-restricted')) {
      nameSpan.insertAdjacentHTML('beforeend', ' <span class="track-restricted">restricted</span>');
    }
  }
}

// ─── PLAYER UI (OPTIMIZED) ──────────────────────────────────────────────────

export function updateNowPlaying(name, title) {
  const label = title ? `${name} — ${title}` : name || '';
  if (ui.npLabel) ui.npLabel.textContent = label;
  if (ui.npLabelDup) ui.npLabelDup.textContent = label;
  
  // Only force reflow if marquee actually exists
  if (ui.npMarquee) {
    ui.npMarquee.style.animation = 'none';
    ui.npMarquee.offsetHeight; // Trigger reflow
    ui.npMarquee.style.animation = '';
  }
}

// Cached spinner string to avoid creating it every time
const SPINNER_SVG = '<svg class="btn-play-spinner" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M10,50c0,0,0,0.5,0.1,1.4c0,0.5,0.1,1,0.2,1.7c0,0.3,0.1,0.7,0.1,1.1c0.1,0.4,0.1,0.8,0.2,1.2c0.2,0.8,0.3,1.8,0.5,2.8c0.3,1,0.6,2.1,0.9,3.2c0.3,1.1,0.9,2.3,1.4,3.5c0.5,1.2,1.2,2.4,1.8,3.7c0.3,0.6,0.8,1.2,1.2,1.9c0.4,0.6,0.8,1.3,1.3,1.9c1,1.2,1.9,2.6,3.1,3.7c2.2,2.5,5,4.7,7.9,6.7c3,2,6.5,3.4,10.1,4.6c3.6,1.1,7.5,1.5,11.2,1.6c4-0.1,7.7-0.6,11.3-1.6c3.6-1.2,7-2.6,10-4.6c3-2,5.8-4.2,7.9-6.7c1.2-1.2,2.1-2.5,3.1-3.7c0.5-0.6,0.9-1.3,1.3-1.9c0.4-0.6,0.8-1.3,1.2-1.9c0.6-1.3,1.3-2.5,1.8-3.7c0.5-1.2,1-2.4,1.4-3.5c0.3-1.1,0.6-2.2,0.9-3.2c0.2-1,0.4-1.9,0.5-2.8c0.1-0.4,0.1-0.8,0.2-1.2c0-0.4,0.1-0.7,0.1-1.1c0.1-0.7,0.1-1.2,0.2-1.7C90,50.5,90,50,90,50s0,0.5,0,1.4c0,0.5,0,1,0,1.7c0,0.3,0,0.7,0,1.1c0,0.4-0.1,0.8-0.1,1.2c-0.1,0.9-0.2,1.8-0.4,2.8c-0.2,1-0.5,2.1-0.7,3.3c-0.3,1.2-0.8,2.4-1.2,3.7c-0.2,0.7-0.5,1.3-0.8,1.9c-0.3,0.7-0.6,1.3-0.9,2c-0.3,0.7-0.7,1.3-1.1,2c-0.4,0.7-0.7,1.4-1.2,2c-1,1.3-1.9,2.7-3.1,4c-2.2,2.7-5,5-8.1,7.1c-0.8,0.5-1.6,1-2.4,1.5c-0.8,0.5-1.7,0.9-2.6,1.3L66,87.7l-1.4,0.5c-0.9,0.3-1.8,0.7-2.8,1c-3.8,1.1-7.9,1.7-11.8,1.8L47,90.8c-1,0-2-0.2-3-0.3l-1.5-0.2l-0.7-0.1L41.1,90c-1-0.3-1.9-0.5-2.9-0.7c-0.9-0.3-1.9-0.7-2.8-1L34,87.7l-1.3-0.6c-0.9-0.4-1.8-0.8-2.6-1.3c-0.8-0.5-1.6-1-2.4-1.5c-3.1-2.1-5.9-4.5-8.1-7.1c-1.2-1.2-2.1-2.7-3.1-4c-0.5-0.6-0.8-1.4-1.2-2c-0.4-0.7-0.8-1.3-1.1-2c-0.3-0.7-0.6-1.3-0.9-2c-0.3-0.7-0.6-1.3-0.8-1.9c-0.4-1.3-0.9-2.5-1.2-3.7c-0.3-1.2-0.5-2.3-0.7-3.3c-0.2-1-0.3-2-0.4-2.8c-0.1-0.4-0.1-0.8-0.1-1.2c0-0.4,0-0.7,0-1.1c0-0.7,0-1.2,0-1.7C10,50.5,10,50,10,50z" fill="currentColor"/></svg>';

export function updatePlayButton(state) {
  if (!ui.playBtn) return;
  if (state === 'buffering') {
    // Only update if not already buffering to prevent constant DOM writing
    if (ui.playBtn.getAttribute('data-state') !== 'buffering') {
      ui.playBtn.innerHTML = SPINNER_SVG;
      ui.playBtn.setAttribute('data-state', 'buffering');
    }
  } else {
    // Check if we actually need to change (Prevents flashing)
    const newState = state ? 'playing' : 'paused';
    if (ui.playBtn.getAttribute('data-state') !== newState) {
      ui.playBtn.innerHTML = state ? '&#9646;&#9646;' : '&#9654;';
      ui.playBtn.setAttribute('data-state', newState);
    }
  }
}

// ─── PROGRESS BAR (HEAVILY OPTIMIZED) ───────────────────────────────────────

function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function arcY(pct) {
  const t = pct / 100;
  return 100 - 192 * t + 192 * t * t;
}

export function updateProgress(current, duration) {
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  // Use cached elements - no document.getElementById calls!
  if (ui.progressClip) ui.progressClip.setAttribute('width', pct * 10);

  if (ui.playhead) {
    ui.playhead.setAttribute('cx', pct * 10);
    ui.playhead.setAttribute('cy', arcY(pct));
  }

  if (ui.currentTime) ui.currentTime.textContent = formatTime(current);
  if (ui.duration) ui.duration.textContent = formatTime(duration);
  if (ui.seeker) ui.seeker.value = duration > 0 ? (current / duration) * 1000 : 0;
}

export function resetProgress() {
  if (ui.progressClip) ui.progressClip.setAttribute('width', 0);
  if (ui.bufferClip) ui.bufferClip.setAttribute('width', 0);

  if (ui.playhead) {
    ui.playhead.setAttribute('cx', 0);
    ui.playhead.setAttribute('cy', 100);
  }

  if (ui.currentTime) ui.currentTime.textContent = '0:00';
  if (ui.duration) ui.duration.textContent = '0:00';
  if (ui.seeker) ui.seeker.value = 0;
  hideBuffering();
}

export function showBuffering(targetPct) {
  // FAST PATH: Update width on cached element
  if (ui.bufferClip) ui.bufferClip.setAttribute('width', targetPct * 10);
  
  // Optimization: Only touch classList if necessary
  if (ui.progressContainer && !ui.progressContainer.classList.contains('is-buffering')) {
    ui.progressContainer.classList.add('is-buffering');
  }
}

export function hideBuffering() {
  if (ui.progressContainer) ui.progressContainer.classList.remove('is-buffering');
  if (ui.bufferClip) ui.bufferClip.setAttribute('width', 0);
}

export function showEmptyState(show) {
  if (ui.emptyState) ui.emptyState.hidden = !show;
  if (ui.playerContainer) ui.playerContainer.style.display = show ? 'none' : '';
  if (ui.radioControls) ui.radioControls.style.display = show ? 'none' : '';
  if (ui.trackList) ui.trackList.style.display = show ? 'none' : '';
  if (ui.nowPlaying) ui.nowPlaying.style.display = show ? 'none' : '';
  if (ui.progressContainer) ui.progressContainer.style.display = show ? 'none' : '';
}