import { trackScreenView } from "./analytics";

// ─── CACHED ELEMENTS (The Speed Boost) ──────────────────────────────────────
let trackSelectCallback = null; // delegated click handler for track list

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
  playheadHalo: null,
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
  ui.playheadHalo = document.querySelector('.progress-arc-playhead-halo');
  ui.currentTime = document.getElementById('current-time');
  ui.duration = document.getElementById('duration');
  ui.seeker = document.getElementById('seeker');

  // State Containers
  ui.emptyState = document.getElementById('empty-state');
  ui.playerContainer = document.querySelector('.player-container');
  ui.radioControls = document.querySelector('.radio-controls');
  ui.nowPlaying = document.getElementById('now-playing');

  // Delegated click handler for track list (single listener instead of per-track)
  ui.trackList.addEventListener('click', e => {
    if (e.target.closest('.star-toggle')) return; // fav star — don't select track
    const item = e.target.closest('.track-item');
    if (!item || item.classList.contains('is-failed')) return;
    const idx = parseInt(item.dataset.index, 10);
    if (!isNaN(idx) && trackSelectCallback) trackSelectCallback(idx);
  });
}

// ─── NAVIGATION ─────────────────────────────────────────────────────────────

export function showScreen(name) {
  if (ui.screens[currentScreen]) ui.screens[currentScreen].classList.remove('active');
  if (ui.screens[name]) ui.screens[name].classList.add('active');
  currentScreen = name;

  trackScreenView(name);
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
  
  const activeItem = document.querySelector('#track-list .track-item.active');
  if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  ui.favBtn.appendChild(star);
}

export function renderTrackList(tracks, currentIndex, onSelect, failedIds = new Set(), favSet = new Set(), onSharePlaylist) {
  if (!ui.trackList) return;
  trackSelectCallback = onSelect;
  ui.trackList.innerHTML = '';

  // 1. Playlist header with share button (valentine + favorites only)
  const isValentine = onSharePlaylist && tracks.length > 0 && tracks.every(t => t.genres && t.genres.includes('valentine'));
  if (onSharePlaylist) {
    const header = document.createElement('div');
    header.className = 'playlist-curator-credit';

    const curatorHtml = isValentine
      ? `<span class="curator-label">Curated by</span>
         <span class="curator-name"><a href="https://docs.google.com/document/d/1We4r9SyEyWY0rM8Njdcw7gkAy8e4lpBFb7aFTA7xtWY/edit?usp=sharing" target="_blank" rel="noopener">최진영</a></span>`
      : '';

    header.innerHTML = `
    ${curatorHtml}
    <button id="btn-share-playlist" class="btn-share-mini" title="Share Playlist">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        share playlist
    </button>
  `;

    const shareBtn = header.querySelector('#btn-share-playlist');

    // Keep the pixel lit if a re-render just happened
    if (window.isLinkRecentlyCopied) {
      shareBtn.classList.add('is-copied');
    }

    // SINGLE, ROBUST LISTENER
    shareBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();

      // Trigger clipboard/share from app.js
      if (onSharePlaylist) onSharePlaylist();

      // Visual feedback: Green Pixel
      this.classList.add('is-copied');
      window.isLinkRecentlyCopied = true;

      // Decay/Dimming sequence
      setTimeout(() => {
        this.classList.remove('is-copied');
        window.isLinkRecentlyCopied = false;
      }, 1500);
    });

    ui.trackList.appendChild(header);
  }

  // 2. Standard Track Rendering
  // No per-item listeners — delegated handler on #track-list covers all clicks
  const makeItem = (track, i) => {
    const failed = failedIds.has(i);
    const isFav = favSet.has(track.name);
    const item = document.createElement('div');
    item.className = 'track-item'
      + (i === currentIndex ? ' active' : '')
      + (failed ? ' is-failed' : '')
      + (isFav ? ' is-favorited' : '');
    item.dataset.index = i;
    const simHtml = track.similarity != null
      ? `<span class="track-similarity">${track.similarity}%</span>` : '';
    const deg = (track.venus && track.venus.degree != null) ? ` ${Math.round(track.venus.degree * 10) / 10}°` : '';
    const sign = (track.venus && track.venus.sign) ? track.venus.sign : '';
    const el = (track.venus && SIGN_ELEMENTS[track.venus.sign]) || 'air';
    item.innerHTML = `
      <span class="track-name" style="display: flex; align-items: center;">
        <div class="track-fav-container"><div class="star-toggle active" style="width:12px; height:12px;"></div></div>
        ${track.name}${failed ? ' <span class="track-restricted">restricted</span>' : ''}
      </span>
      <span class="track-meta">
        ${simHtml}
        <span class="track-item-sign" style="color:var(--${el})">${sign}${deg}</span>
      </span>
    `;
    return item;
  };

  // Render first 80 immediately, lazy-load the rest to avoid blocking the main thread
  const BATCH = 80;
  const firstFrag = document.createDocumentFragment();
  tracks.slice(0, BATCH).forEach((track, i) => firstFrag.appendChild(makeItem(track, i)));
  ui.trackList.appendChild(firstFrag);

  if (tracks.length > BATCH) {
    const appendRest = (start) => {
      if (!ui.trackList || start >= tracks.length) return;
      const frag = document.createDocumentFragment();
      tracks.slice(start, start + BATCH).forEach((track, i) => frag.appendChild(makeItem(track, start + i)));
      ui.trackList.appendChild(frag);
      // Scroll active item into view the moment its chunk lands in the DOM
      if (currentIndex >= start && currentIndex < start + BATCH) {
        const active = ui.trackList.querySelector('.track-item.active');
        if (active) active.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      setTimeout(() => appendRest(start + BATCH), 0);
    };
    setTimeout(() => appendRest(BATCH), 0);
  }
}

// Lightweight active-track update — avoids full list re-render on every track skip
export function setActiveTrack(index) {
  if (!ui.trackList) return;
  const prev = ui.trackList.querySelector('.track-item.active');
  if (prev) prev.classList.remove('active');
  const next = ui.trackList.querySelector(`[data-index="${index}"]`);
  if (next) {
    next.classList.add('active');
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
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

  // Measure overflow and set bounce-scroll if needed
  if (ui.npMarquee && ui.nowPlaying) {
    // Reset animation to measure true width
    ui.npMarquee.style.animation = 'none';
    ui.npMarquee.offsetHeight;

    const textWidth = ui.npMarquee.scrollWidth;
    const containerWidth = ui.nowPlaying.clientWidth;
    const overflow = textWidth - containerWidth;

    if (overflow > 0) {
      const duration = Math.max(8, overflow / 10);
      ui.npMarquee.style.setProperty('--scroll-distance', `-${overflow}px`);
      ui.npMarquee.style.setProperty('--scroll-duration', `${duration}s`);
      ui.npMarquee.style.setProperty('--scroll-state', 'running');
    } else {
      ui.npMarquee.style.setProperty('--scroll-state', 'paused');
    }

    ui.npMarquee.style.animation = '';
  }
}

export function setNowPlayingPaused(name, title) {
  const label = title ? `[PAUSED] ${name} — ${title}` : `[PAUSED] ${name}` || '';
  if (ui.npLabel) ui.npLabel.textContent = label;
  if (ui.npMarquee) {
    ui.npMarquee.style.animation = 'none';
    ui.npMarquee.style.setProperty('--scroll-state', 'paused');
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
      ui.playBtn.innerHTML = state ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M20.346 11.58a.5.5 0 0 1 0 .84L7.77 20.506a.5.5 0 0 1-.77-.42V3.914a.5.5 0 0 1 .77-.42l12.576 8.084Z"/></svg>';
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

let lastSecond = -1;
let glideRaf = null;
let isGliding = false;

function setArcPosition(pct) {
  const cx = pct * 10, cy = arcY(pct);
  if (ui.progressClip) ui.progressClip.setAttribute('width', cx);
  if (ui.playhead) {
    ui.playhead.setAttribute('cx', cx);
    ui.playhead.setAttribute('cy', cy);
    if (ui.playheadHalo) {
      ui.playheadHalo.setAttribute('cx', cx);
      ui.playheadHalo.setAttribute('cy', cy);
    }
  }
}

export function glideToPosition(targetPct, duration = 400) {
  if (!ui.playhead) return;
  const startCx = parseFloat(ui.playhead.getAttribute('cx')) || 0;
  const startPct = startCx / 10;

  if (glideRaf) cancelAnimationFrame(glideRaf);
  isGliding = true;
  const startTime = performance.now();

  function animate(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    setArcPosition(startPct + (targetPct - startPct) * eased);

    if (t < 1) {
      glideRaf = requestAnimationFrame(animate);
    } else {
      glideRaf = null;
      isGliding = false;
    }
  }
  glideRaf = requestAnimationFrame(animate);
}

export function updateProgress(current, duration) {
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const currentSec = Math.floor(current);

  // Skip visual updates while gliding (seek animation in progress)
  if (!isGliding) {
    setArcPosition(pct);
  }

  // Text & seeker — only once per second
  if (currentSec !== lastSecond) {
    if (ui.currentTime) ui.currentTime.textContent = formatTime(current);
    if (ui.duration) ui.duration.textContent = formatTime(duration);
    if (ui.seeker) ui.seeker.value = duration > 0 ? (current / duration) * 1000 : 0;
    lastSecond = currentSec;
  }
}

export function resetProgress() {
  lastSecond = -1;
  // Glide playhead back to start if it's not already there
  const currentCx = ui.playhead ? parseFloat(ui.playhead.getAttribute('cx')) || 0 : 0;
  if (currentCx > 10) {
    glideToPosition(0, 300);
  } else {
    setArcPosition(0);
  }

  if (ui.bufferClip) ui.bufferClip.setAttribute('width', 0);
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

// ─── ARTIST INDEX (About screen) ────────────────────────────────────────────

const SIGN_ORDER = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
const SIGN_GLYPHS = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

let artistIndexRendered = false;

export function renderArtistIndex(db) {
  if (artistIndexRendered) return;
  const container = document.getElementById('artist-index');
  if (!container || !db?.length) return;

  // Group by sign
  const bySign = {};
  SIGN_ORDER.forEach(s => { bySign[s] = []; });
  db.forEach(a => {
    const sign = a.venus?.sign;
    if (sign && bySign[sign]) bySign[sign].push(a);
  });

  // Sort each sign alphabetically
  Object.values(bySign).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));

  // Update stats total
  const totalEl = document.getElementById('stats-total');
  if (totalEl) totalEl.textContent = db.length;

  // Update stats rows
  const statsRows = document.querySelectorAll('.stats-row');
  const signCounts = {};
  SIGN_ORDER.forEach(s => { signCounts[s] = bySign[s].length; });
  const sorted = [...SIGN_ORDER].sort((a, b) => signCounts[b] - signCounts[a]);
  statsRows.forEach((row, i) => {
    if (!sorted[i]) return;
    const sign = sorted[i];
    const label = row.querySelector('.stats-label');
    const value = row.querySelector('.stats-value');
    if (label) label.textContent = sign;
    if (value) {
      value.textContent = signCounts[sign];
      value.className = `stats-value val-${SIGN_ELEMENTS[sign]}`;
    }
  });

  // Build index HTML
  let html = '';
  SIGN_ORDER.forEach(sign => {
    const artists = bySign[sign];
    const el = SIGN_ELEMENTS[sign];
    html += `<div class="index-sign-group">`;
    html += `<h3 class="index-sign-heading">${sign}</h3>`;
    html += `<div class="index-artist-list">`;
    html += artists.map(a => {
      const deg = Math.round(a.venus?.degree || 0);
      return `<span class="index-artist" title="${sign} ${deg}°">${a.name} ${deg}°</span>`;
    }).join(' '); // <-- Change this to a space
    html += `</div></div>`;
  });

  container.innerHTML = html;
  artistIndexRendered = true;
}

export function showEmptyState(show) {
  if (ui.emptyState) ui.emptyState.hidden = !show;
  if (ui.playerContainer) ui.playerContainer.style.display = show ? 'none' : '';
  if (ui.radioControls) ui.radioControls.style.display = show ? 'none' : '';
  if (ui.trackList) ui.trackList.style.display = show ? 'none' : '';
  if (ui.nowPlaying) ui.nowPlaying.style.display = show ? 'none' : '';
  if (ui.progressContainer) ui.progressContainer.style.display = show ? 'none' : '';
}