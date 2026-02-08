import { calculateVenus, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, getSubgenreCounts } from './matcher.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, zoomToSign, zoomOut, showNebula, onNebulaHover, onNebulaClick } from './viz.js';
import { loadYouTubeAPI, initPlayer, loadVideo, togglePlay, isPlaying } from './player.js';
import {
  initScreens, showScreen, showLoading, setElementTheme,
  renderReveal, renderGenreGrid, renderRadioHeader,
  renderTrackList, updateNowPlaying, updatePlayButton, showEmptyState,
  markTrackFailed,
  highlightGenres,
} from './ui.js';

// ── State ───────────────────────────────────────────────────────────────────

let venus = null;
let tracks = [];
let currentTrackIndex = 0;
let playerReady = false;
const failedIds = new Set();

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initScreens();
  setupDateInput();

  // Preload data + YT API in parallel
  const [dbResult] = await Promise.allSettled([
    loadDatabase(),
    loadYouTubeAPI(),
  ]);

  if (dbResult.status === 'rejected') {
    console.error('Failed to load musician database:', dbResult.reason);
  } else {
    initNebula('nebula-container');
    renderNebula(getDatabase());
    onNebulaHover(info => highlightGenres(info ? info.genres : null));
    onNebulaClick(info => {
      if (!venus || !info.genres.length) return;
      const genreId = info.genres[0];
      const label = GENRE_CATEGORIES.find(c => c.id === genreId)?.label || genreId;
      startRadio(genreId, label).then(() => {
        const idx = tracks.findIndex(t => t.name === info.name);
        if (idx >= 0) playTrack(idx);
      });
    });
  }
});

// ── Date input ──────────────────────────────────────────────────────────────

function setupDateInput() {
  const dayEl = document.getElementById('input-day');
  const monthEl = document.getElementById('input-month');
  const yearEl = document.getElementById('input-year');
  const btnEnter = document.getElementById('btn-enter');
  const errorEl = document.getElementById('date-error');
  const fields = [dayEl, monthEl, yearEl];

  // Auto-advance focus on 2 digits
  function onFieldInput(el, nextEl, maxLen) {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '');
      if (el.value.length >= maxLen && nextEl) {
        nextEl.focus();
      }
      validateAndToggle();
    });
  }

  // Backspace to previous field
  function onFieldKeydown(el, prevEl) {
    el.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && el.value === '' && prevEl) {
        prevEl.focus();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!btnEnter.disabled) handleEnter();
      }
    });
  }

  onFieldInput(dayEl, monthEl, 2);
  onFieldInput(monthEl, yearEl, 2);
  onFieldInput(yearEl, null, 4);
  onFieldKeydown(dayEl, null);
  onFieldKeydown(monthEl, dayEl);
  onFieldKeydown(yearEl, monthEl);

  function validateAndToggle() {
    const d = parseInt(dayEl.value, 10);
    const m = parseInt(monthEl.value, 10);
    const y = parseInt(yearEl.value, 10);

    errorEl.textContent = '';

    if (!dayEl.value || !monthEl.value || yearEl.value.length < 4) {
      btnEnter.disabled = true;
      clearPreviewVenus();
      return;
    }

    const error = validateDate(d, m, y);
    if (error) {
      errorEl.textContent = error;
      btnEnter.disabled = true;
      clearPreviewVenus();
      return;
    }

    btnEnter.disabled = false;

    // Live preview: show soft glow at Venus position as user types
    try {
      const preview = calculateVenus(makeBirthDate(d, m, y));
      setPreviewVenus(preview.longitude, preview.element);
    } catch {
      clearPreviewVenus();
    }
  }

  btnEnter.addEventListener('click', handleEnter);

  function handleEnter() {
    const d = parseInt(dayEl.value, 10);
    const m = parseInt(monthEl.value, 10);
    const y = parseInt(yearEl.value, 10);
    onDateSubmit(d, m, y);
  }

  // Focus first field
  dayEl.focus();
}

function validateDate(d, m, y) {
  if (y < 1900 || y > 2100) return 'year must be between 1900 and 2100';
  if (m < 1 || m > 12) return 'invalid month';
  const maxDay = new Date(y, m, 0).getDate();
  if (d < 1 || d > maxDay) return 'invalid day for this month';
  return null;
}

// ── Flow ────────────────────────────────────────────────────────────────────

async function onDateSubmit(d, m, y) {
  showLoading(true);

  // Dramatic pause for the vibe
  await sleep(1500);

  const birthDate = makeBirthDate(d, m, y);
  venus = calculateVenus(birthDate);

  setElementTheme(venus.element);
  setUserVenus(venus.longitude, venus.element);
  renderReveal(venus);
  showLoading(false);
  showNebula(false); // hide nebula on reveal screen
  showScreen('reveal');

  // Venus sign index for zoom
  const signIndex = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'].indexOf(venus.sign);

  // Set up genre screen
  const genreLabel = id => GENRE_CATEGORIES.find(c => c.id === id)?.label || id;
  const subgenreCounts = {};
  for (const cat of GENRE_CATEGORIES) {
    subgenreCounts[cat.id] = getSubgenreCounts(cat.id);
  }

  renderGenreGrid(
    GENRE_CATEGORIES,
    SUBGENRES,
    subgenreCounts,
    genreId => startRadio(genreId, genreLabel(genreId)),
    (genreId, subgenreId) => startRadio(genreId, genreLabel(genreId), subgenreId),
  );

  document.getElementById('btn-choose-genre').addEventListener('click', () => {
    showNebula(true);
    zoomToSign(signIndex);
    showScreen('genre');
  });

  // Genre screen back → portal (date input)
  document.getElementById('btn-back-genre').addEventListener('click', () => {
    zoomOut();
    showNebula(true);
    showScreen('portal');
  });
}

async function startRadio(genreId, genreLabel, subgenreId = null) {
  tracks = match(venus.sign, genreId, venus.element, {
    subgenre: subgenreId,
    userLongitude: venus.longitude,
  });
  currentTrackIndex = 0;

  renderRadioHeader(venus.sign, genreLabel, subgenreId);
  showNebula(false);
  showScreen('radio');

  if (tracks.length === 0) {
    showEmptyState(true);
    return;
  }

  showEmptyState(false);

  // Init player if not done yet
  if (!playerReady) {
    await initPlayer('yt-player', {
      onEnd: () => playTrack(currentTrackIndex + 1),
      onError: (code) => {
        const track = tracks[currentTrackIndex];
        if (track) {
          failedIds.add(track.youtubeVideoId);
          markTrackFailed(currentTrackIndex);
          console.warn(`[Radio Venus] ${track.name}: ${code === 150 || code === 101 ? 'embed restricted' : code === 100 ? 'removed' : 'error ' + code}`);
        }
        skipToNextPlayable();
      },
      onStateChange: () => updatePlayButton(isPlaying()),
    });
    playerReady = true;
  }

  playTrack(0);
}

function playTrack(index) {
  if (tracks.length === 0) return;
  currentTrackIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  const track = tracks[currentTrackIndex];

  loadVideo(track.youtubeVideoId);
  updateNowPlaying(track.name);
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds);
  updatePlayButton(true);
}

function skipToNextPlayable() {
  // Try each track forward, stop if we've looped all the way around
  for (let i = 1; i <= tracks.length; i++) {
    const nextIndex = (currentTrackIndex + i) % tracks.length;
    if (!failedIds.has(tracks[nextIndex].youtubeVideoId)) {
      playTrack(nextIndex);
      return;
    }
  }
  // All tracks failed
  updateNowPlaying('No playable tracks found');
}

// ── Radio controls ──────────────────────────────────────────────────────────

document.addEventListener('click', e => {
  if (e.target.id === 'btn-prev' || e.target.closest('#btn-prev')) {
    playTrack(currentTrackIndex - 1);
  }
  if (e.target.id === 'btn-next' || e.target.closest('#btn-next')) {
    playTrack(currentTrackIndex + 1);
  }
  if (e.target.id === 'btn-play' || e.target.closest('#btn-play')) {
    togglePlay();
  }
  if (e.target.id === 'btn-back' || e.target.closest('#btn-back')) {
    showNebula(true);
    showScreen('genre');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') playTrack(currentTrackIndex - 1);
  if (e.key === 'ArrowRight') playTrack(currentTrackIndex + 1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

// ── Util ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
