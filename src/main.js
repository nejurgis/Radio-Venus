import { calculateVenus, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, getSubgenreCounts } from './matcher.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, zoomToSign, zoomOut, showNebula, dimNebula, deepDimNebula, setZoomDrift, enableDragRotate, onNebulaHover, onNebulaClick } from './viz.js';
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
let hasPlayed = false;             // whether current video reached PLAYING
let sessionHasPlayed = false;      // whether ANY video played this session
let silentFailTimer = null;        // detect videos that never start
let loadingInterval = null;        // loading progress animation
let loadStartTime = 0;
const SILENT_FAIL_MS = 15000;
let activeGenreLabel = null;       // label of the currently playing genre

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

  // Init player early so it's ready when user picks a genre —
  // mobile autoplay requires loadVideo() in the direct click gesture chain
  initPlayer('yt-player', {
    onEnd: () => playTrack(currentTrackIndex + 1),
    onError: (code) => {
      clearTimeout(silentFailTimer);
      stopLoadingProgress();
      const reason = code === 150 || code === 101 ? 'embed restricted' : code === 100 ? 'removed' : 'error ' + code;
      tryBackupOrFail(reason);
    },
    onStateChange: (state) => {
      if (state === window.YT.PlayerState.PLAYING) {
        updatePlayButton(true);
      } else if (state === window.YT.PlayerState.BUFFERING || !hasPlayed) {
        updatePlayButton('buffering');
      } else {
        updatePlayButton(false);
      }
      if (state === window.YT.PlayerState.PLAYING) {
        hasPlayed = true;
        sessionHasPlayed = true;
        clearTimeout(silentFailTimer);
        stopLoadingProgress();
        hideBuffering();
        const title = getVideoTitle();
        const track = tracks[currentTrackIndex];
        if (track) updateNowPlaying(track.name, title);
        // Refresh floating button (removes "loading..." prefix)
        updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'));
        clearInterval(progressInterval);
        progressInterval = setInterval(() => {
          updateProgress(getCurrentTime(), getDuration());
        }, 500);
      } else {
        clearInterval(progressInterval);
        progressInterval = null;
        if (hasPlayed && state === window.YT.PlayerState.BUFFERING) {
          const dur = getDuration();
          const cur = getCurrentTime();
          if (dur > 0) showBuffering((cur / dur) * 100);
        }
      }
    },
  }).then(() => { playerReady = true; });

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
      startRadio(genreId, label);
      const idx = tracks.findIndex(t => t.name === info.name);
      if (idx >= 0) playTrack(idx);
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

  // Auto-advance focus — smart single-digit advance for day/month
  function onFieldInput(el, nextEl, maxLen, smartMin) {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '');
      if (el.value.length >= maxLen && nextEl) {
        nextEl.focus();
      } else if (smartMin && el.value.length === 1 && parseInt(el.value) >= smartMin && nextEl) {
        el.value = '0' + el.value;
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

  onFieldInput(dayEl, monthEl, 2, 4);   // day 4-9 → auto-advance (no valid 2nd digit)
  onFieldInput(monthEl, yearEl, 2, 2);  // month 2-9 → auto-advance (20+ invalid)
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
  showScreen('reveal');
  enableDragRotate(true);
  history.pushState({ screen: 'reveal' }, '');

  // Set up genre screen (shuffled order each time)
  const genreLabel = id => GENRE_CATEGORIES.find(c => c.id === id)?.label || id;
  const shuffledGenres = [...GENRE_CATEGORIES];
  for (let i = shuffledGenres.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledGenres[i], shuffledGenres[j]] = [shuffledGenres[j], shuffledGenres[i]];
  }
  const subgenreCounts = {};
  for (const cat of GENRE_CATEGORIES) {
    subgenreCounts[cat.id] = getSubgenreCounts(cat.id);
  }

  renderGenreGrid(
    shuffledGenres,
    SUBGENRES,
    subgenreCounts,
    genreId => startRadio(genreId, genreLabel(genreId)),
    (genreId, subgenreId) => startRadio(genreId, genreLabel(genreId), subgenreId),
  );

  document.getElementById('btn-choose-genre').addEventListener('click', () => {
    enableDragRotate(false);
    showNebula(true);
    dimNebula(true);
    showScreen('genre');
    updateNowPlayingButton(true);
    history.pushState({ screen: 'genre' }, '');
  });

  // Back buttons use history so browser back/forward works
  document.getElementById('btn-back-reveal').addEventListener('click', () => history.back());
  document.getElementById('btn-back-genre').addEventListener('click', () => history.back());
}

function startRadio(genreId, genreLabel, subgenreId = null) {
  tracks = match(venus.sign, genreId, venus.element, {
    subgenre: subgenreId,
    userLongitude: venus.longitude,
  });
  currentTrackIndex = 0;
  failedIds.clear();
  trackVideoIndex.clear();
  activeGenreLabel = subgenreId ? `${genreLabel} · ${subgenreId}` : genreLabel;

  renderRadioHeader(venus.sign, genreLabel, subgenreId);
  enableDragRotate(false);
  updateNowPlayingButton(false);
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
  playTrack(0);
}

function getVideoIds(track) {
  return [track.youtubeVideoId, ...(track.backupVideoIds || [])];
}

function tryBackupOrFail(reason) {
  const track = tracks[currentTrackIndex];
  if (!track) { skipToNextPlayable(); return; }

  const allIds = getVideoIds(track);
  const idx = (trackVideoIndex.get(currentTrackIndex) || 0) + 1;

  if (idx < allIds.length) {
    console.warn(`[Radio Venus] ${track.name}: ${reason}, trying backup ${idx}/${allIds.length - 1}`);
    trackVideoIndex.set(currentTrackIndex, idx);
    loadVideo(allIds[idx]);
    startSilentFailTimer();
    startLoadingProgress();
  } else {
    failedIds.add(currentTrackIndex);
    markTrackFailed(currentTrackIndex);
    console.warn(`[Radio Venus] ${track.name}: ${reason} (no more backups)`);
    skipToNextPlayable();
  }
}

function startSilentFailTimer() {
  clearTimeout(silentFailTimer);
  hasPlayed = false;
  // Don't timeout until the player has proven it can play something —
  // the first video(s) in a session can take much longer to auto-play
  if (!sessionHasPlayed) return;
  silentFailTimer = setTimeout(() => {
    if (!hasPlayed) {
      tryBackupOrFail(`silent fail (no playback after ${SILENT_FAIL_MS / 1000}s)`);
    }
  }, SILENT_FAIL_MS);
}

function startLoadingProgress() {
  loadStartTime = Date.now();
  clearInterval(loadingInterval);
  if (!sessionHasPlayed) {
    // Before first successful play, just show full-width shimmer (no countdown)
    showBuffering(100);
    return;
  }
  showBuffering(0);
  loadingInterval = setInterval(() => {
    const pct = Math.min((Date.now() - loadStartTime) / SILENT_FAIL_MS * 100, 100);
    showBuffering(pct);
  }, 100);
}

function stopLoadingProgress() {
  clearInterval(loadingInterval);
  loadingInterval = null;
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
  startSilentFailTimer();
  startLoadingProgress();
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

// ── Now-playing button on genre screen ────────────────────────────────────

function updateNowPlayingButton(show) {
  const btn = document.getElementById('btn-now-playing');
  if (!btn) return;
  if (show && tracks.length > 0 && activeGenreLabel) {
    const track = tracks[currentTrackIndex];
    const artist = track ? track.name : '';
    const title = getVideoTitle();
    const prefix = !hasPlayed ? 'loading... ' : '';
    const label = title ? `${prefix}${artist} — ${title}` : `${prefix}${artist}` || activeGenreLabel;
    document.getElementById('btn-np-label').textContent = label;
    document.getElementById('btn-np-label-dup').textContent = label;
    // Force marquee animation restart (fixes rare stall)
    const marquee = btn.querySelector('.btn-np-marquee');
    if (marquee) {
      marquee.style.animation = 'none';
      marquee.offsetHeight; // reflow
      marquee.style.animation = '';
    }
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }
}

document.getElementById('btn-now-playing').addEventListener('click', () => {
  updateNowPlayingButton(false);
  showNebula(true);
  dimNebula(false);
  deepDimNebula(true);
  setZoomDrift(true);
  showScreen('radio');
  history.pushState({ screen: 'radio' }, '');
});

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
  enableDragRotate(screen === 'reveal');

  switch (screen) {
    case 'portal':
      showScreen('portal');
      document.getElementById('screen-portal').classList.remove('is-fading');
      showNebula(true);
      dimNebula(false);
      updateNowPlayingButton(true);
      zoomOut({ duration: 1800 });
      break;
    case 'reveal':
      showNebula(true);
      dimNebula(false);
      showScreen('reveal');
      updateNowPlayingButton(true);
      break;
    case 'genre':
      showNebula(true);
      dimNebula(true);
      showScreen('genre');
      updateNowPlayingButton(true);
      break;
    case 'radio':
      showNebula(true);
      dimNebula(false);
      showScreen('radio');
      updateNowPlayingButton(false);
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

