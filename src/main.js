import { calculateVenus, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, getSubgenreCounts } from './matcher.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, zoomToSign, zoomOut, showNebula, dimNebula, deepDimNebula, setZoomDrift, onNebulaHover, onNebulaClick } from './viz.js';
import { loadYouTubeAPI, initPlayer, loadVideo, togglePlay, isPlaying, getDuration, getCurrentTime, seekTo, getVideoTitle } from './player.js';
import {
  initScreens, showScreen, setElementTheme,
  renderReveal, renderGenreGrid, renderRadioHeader,
  renderTrackList, updateNowPlaying, updatePlayButton, showEmptyState,
  markTrackFailed,
  highlightGenres,
  updateProgress, resetProgress,
  showBuffering, hideBuffering,
} from './ui.js';

// ── State ───────────────────────────────────────────────────────────────────

let venus = null;
let tracks = [];
let currentTrackIndex = 0;
let playerReady = false;
let progressInterval = null;
const failedIds = new Set();       // video IDs that failed
const trackVideoIndex = new Map(); // trackIndex → which video ID we're trying

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initScreens();
  setupDateInput();
  history.replaceState({ screen: 'portal' }, '');

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
  const birthDate = makeBirthDate(d, m, y);
  venus = calculateVenus(birthDate);

  setElementTheme(venus.element);
  setUserVenus(venus.longitude, venus.element);
  renderReveal(venus);

  // Venus sign index for zoom
  const signIndex = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'].indexOf(venus.sign);

  // Fade out portal content, then zoom into the user's Venus sign
  const portalScreen = document.getElementById('screen-portal');
  portalScreen.classList.add('is-fading');
  await zoomToSign(signIndex, { duration: 2500 });
  portalScreen.classList.remove('is-fading');
  showScreen('reveal');
  history.pushState({ screen: 'reveal' }, '');

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
    dimNebula(true);
    showScreen('genre');
    history.pushState({ screen: 'genre' }, '');
  });

  // Back buttons use history so browser back/forward works
  document.getElementById('btn-back-reveal').addEventListener('click', () => history.back());
  document.getElementById('btn-back-genre').addEventListener('click', () => history.back());
}

async function startRadio(genreId, genreLabel, subgenreId = null) {
  tracks = match(venus.sign, genreId, venus.element, {
    subgenre: subgenreId,
    userLongitude: venus.longitude,
  });
  currentTrackIndex = 0;
  failedIds.clear();
  trackVideoIndex.clear();

  renderRadioHeader(venus.sign, genreLabel, subgenreId);
  showNebula(true);
  dimNebula(false);
  deepDimNebula(true);
  setZoomDrift(true);
  showScreen('radio');
  history.pushState({ screen: 'radio' }, '');

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
        if (!track) { skipToNextPlayable(); return; }

        const allIds = getVideoIds(track);
        const idx = (trackVideoIndex.get(currentTrackIndex) || 0) + 1;
        const reason = code === 150 || code === 101 ? 'embed restricted' : code === 100 ? 'removed' : 'error ' + code;

        if (idx < allIds.length) {
          // Hot-swap to backup
          console.warn(`[Radio Venus] ${track.name}: ${reason}, trying backup ${idx}/${allIds.length - 1}`);
          trackVideoIndex.set(currentTrackIndex, idx);
          loadVideo(allIds[idx]);
        } else {
          // All IDs exhausted
          failedIds.add(currentTrackIndex);
          markTrackFailed(currentTrackIndex);
          console.warn(`[Radio Venus] ${track.name}: ${reason} (no more backups)`);
          skipToNextPlayable();
        }
      },
      onStateChange: (state) => {
        if (state === window.YT.PlayerState.BUFFERING) {
          updatePlayButton('buffering');
        } else {
          updatePlayButton(isPlaying());
        }
        if (state === window.YT.PlayerState.PLAYING) {
          hideBuffering();
          const title = getVideoTitle();
          const track = tracks[currentTrackIndex];
          if (track) updateNowPlaying(track.name, title);
          clearInterval(progressInterval);
          progressInterval = setInterval(() => {
            updateProgress(getCurrentTime(), getDuration());
          }, 500);
        } else {
          clearInterval(progressInterval);
          progressInterval = null;
          if (state === window.YT.PlayerState.BUFFERING) {
            const dur = getDuration();
            const cur = getCurrentTime();
            if (dur > 0) showBuffering((cur / dur) * 100);
          }
        }
      },
    });
    playerReady = true;
  }

  playTrack(0);
}

function getVideoIds(track) {
  return [track.youtubeVideoId, ...(track.backupVideoIds || [])];
}

function playTrack(index) {
  if (tracks.length === 0) return;
  currentTrackIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  const track = tracks[currentTrackIndex];

  clearInterval(progressInterval);
  progressInterval = null;
  resetProgress();
  trackVideoIndex.set(currentTrackIndex, 0);

  loadVideo(getVideoIds(track)[0]);
  updateNowPlaying(track.name);
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds);
  updatePlayButton('buffering');

  const activeItem = document.querySelector('#track-list .track-item.active');
  if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function skipToNextPlayable() {
  for (let i = 1; i <= tracks.length; i++) {
    const nextIndex = (currentTrackIndex + i) % tracks.length;
    if (!failedIds.has(nextIndex)) {
      playTrack(nextIndex);
      return;
    }
  }
  updateNowPlaying('No playable tracks found');
}

function shuffleTracks() {
  if (tracks.length < 2) return;
  const current = tracks[currentTrackIndex];
  // Remember which tracks were failed by identity
  const failedTracks = new Set([...failedIds].map(i => tracks[i]));
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  // Remap failed indices + current index
  failedIds.clear();
  trackVideoIndex.clear();
  tracks.forEach((t, i) => { if (failedTracks.has(t)) failedIds.add(i); });
  currentTrackIndex = tracks.indexOf(current);
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds);
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
    history.back();
  }
  if (e.target.id === 'btn-shuffle' || e.target.closest('#btn-shuffle')) {
    shuffleTracks();
  }
});

// Seeker
document.getElementById('seeker').addEventListener('input', e => {
  const duration = getDuration();
  if (duration > 0) {
    const targetPct = e.target.value / 10;
    showBuffering(targetPct);
    seekTo(duration * e.target.value / 1000);
  }
});

// ── History navigation ────────────────────────────────────────────────────

window.addEventListener('popstate', (e) => {
  const screen = e.state?.screen;
  if (!screen) return;

  // Always clean up radio state
  setZoomDrift(screen === 'radio');
  deepDimNebula(screen === 'radio');

  switch (screen) {
    case 'portal':
      showScreen('portal');
      showNebula(true);
      dimNebula(false);
      zoomOut({ duration: 1800 });
      break;
    case 'reveal':
      showNebula(true);
      dimNebula(false);
      showScreen('reveal');
      break;
    case 'genre':
      showNebula(true);
      dimNebula(true);
      showScreen('genre');
      break;
    case 'radio':
      showNebula(true);
      dimNebula(false);
      showScreen('radio');
      break;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') playTrack(currentTrackIndex - 1);
  if (e.key === 'ArrowRight') playTrack(currentTrackIndex + 1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

