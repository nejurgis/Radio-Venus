import { calculateVenus, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, matchFavorites, getSubgenreCounts } from './matcher.js';
import { getFavorites, toggleFavorite, isFavorite } from './favorites.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, zoomToSign, zoomOut, showNebula, dimNebula, deepDimNebula, setZoomDrift, enableDragRotate, onNebulaHover, onNebulaClick, onRotation } from './viz.js';
import { loadYouTubeAPI, initPlayer, loadVideo, togglePlay, isPlaying, getDuration, getCurrentTime, seekTo, getVideoTitle } from './player.js';
import {
  initScreens, showScreen, setElementTheme,
  renderReveal, renderGenreGrid, renderRadioHeader,
  renderTrackList, updateNowPlaying, updatePlayButton, updateFavoriteButton, showEmptyState,
  markTrackFailed,
  highlightGenres,
  updateProgress, resetProgress,
  showBuffering, hideBuffering,
} from './ui.js';

// ── State ───────────────────────────────────────────────────────────────────

let venus = null;
let tracks = [];
let currentTrackIndex = 0;
let playingGenreId = null;
let playingSubgenreId = null;
let progressInterval = null;
const failedIds = new Set();       // track indices that failed
const trackVideoIndex = new Map(); // trackIndex → which video ID we're trying
let hasPlayed = false;             // whether current video reached PLAYING
let sessionHasPlayed = false;      // whether ANY video played this session
let silentFailTimer = null;        // detect videos that never start

// CHANGED: Use AnimationFrame ID instead of Interval ID for smoothness
let loadingAnimFrame = null;        
let loadStartTime = 0;
const SILENT_FAIL_MS = 15000;

let activeGenreLabel = null;       // label of the currently playing genre
let tunedLongitude = null;         // current longitude at the tuner needle

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];
const ZODIAC_ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initScreens();

  // ── Pinch gestures (mobile) ──
  let pinchStartDist = 0;
  let pinchZooming = false; 

  function onPinchStart(e) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      pinchStartDist = Math.hypot(dx, dy);
    }
  }

  const revealScreen = document.getElementById('screen-reveal');
  revealScreen.addEventListener('touchstart', onPinchStart, { passive: true });
  revealScreen.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist > 0 && revealScreen.classList.contains('active')) {
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      const newDist = Math.hypot(dx, dy);
      if (pinchStartDist - newDist > 70) {
        pinchStartDist = 0;
        history.back();
      }
    }
  }, { passive: true });

  const portalScreen = document.getElementById('screen-portal');
  portalScreen.addEventListener('touchstart', onPinchStart, { passive: true });
  portalScreen.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist > 0 && portalScreen.classList.contains('active') && venus && !pinchZooming) {
      const dx = e.touches[0].pageX - e.touches[1].pageX;
      const dy = e.touches[0].pageY - e.touches[1].pageY;
      const newDist = Math.hypot(dx, dy);
      if (newDist - pinchStartDist > 70) {
        pinchStartDist = 0;
        pinchZooming = true;
        zoomInToReveal().then(() => { pinchZooming = false; });
      }
    }
  }, { passive: true });

  setupDateInput();
  history.replaceState({ screen: 'portal' }, '');

  const [dbResult] = await Promise.allSettled([
    loadDatabase(),
    loadYouTubeAPI(),
  ]);

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
        updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'));
        
        clearInterval(progressInterval);
        // CHANGED: 500ms -> 100ms for smoother playback progress
        progressInterval = setInterval(() => {
          updateProgress(getCurrentTime(), getDuration());
        }, 100);

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
  });

  if (dbResult.status === 'rejected') {
    console.error('Failed to load musician database:', dbResult.reason);
  } else {
    initNebula('nebula-container');
    renderNebula(getDatabase());
    onNebulaHover(info => highlightGenres(info ? info.genres : null));
    onRotation(longitude => {
      tunedLongitude = longitude;
      if (document.getElementById('screen-reveal').classList.contains('active')) {
        updateTunedDisplay(longitude);
      }
    });
    onNebulaClick(info => {
      if (!venus || !info.genres.length) return;
      const genreId = info.genres[0];
      const label = GENRE_CATEGORIES.find(c => c.id === genreId)?.label || genreId;

      const trackList = startRadio(genreId, label);
      if (!trackList || trackList.length === 0) return;

      const idx = trackList.findIndex(t => t.name === info.name);
      if (idx === -1) return;

      if (isPlaying() && hasPlayed) {
        setTimeout(() => {
          const items = document.querySelectorAll('#track-list .track-item');
          if (items[idx]) {
            items[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
            items[idx].style.background = 'rgba(255,255,255,0.08)';
            setTimeout(() => { items[idx].style.background = ''; }, 1200);
          }
        }, 50);
      } else {
        playTrack(idx);
      }
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

  onFieldInput(dayEl, monthEl, 2, 4);
  onFieldInput(monthEl, yearEl, 2, 2); 
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
  dayEl.focus();
}

function validateDate(d, m, y) {
  if (y < 1900 || y > 2100) return 'year must be between 1900 and 2100';
  if (m < 1 || m > 12) return 'invalid month';
  const maxDay = new Date(y, m, 0).getDate();
  if (d < 1 || d > maxDay) return 'invalid day for this month';
  return null;
}

// ── Tuner display ────────────────────────────────────────────────────────────

let lastTunedSignIdx = -1;
let lastTunedDeg = -1;

function updateTunedDisplay(longitude) {
  const signIdx = Math.floor(longitude / 30) % 12;
  const deg = Math.min(29, Math.round(longitude % 30));
  if (signIdx === lastTunedSignIdx && deg === lastTunedDeg) return;
  lastTunedSignIdx = signIdx;
  lastTunedDeg = deg;

  const sign = ZODIAC_SIGNS[signIdx];
  const element = ZODIAC_ELEMENTS[sign];

  document.getElementById('reveal-sign').textContent =
    `venus in ${deg}° ${sign}`;
  const detail = document.getElementById('reveal-detail');
  detail.textContent = element;
  detail.style.color = `var(--${element})`;
}

function signFromLongitude(lon) {
  return ZODIAC_SIGNS[Math.floor(lon / 30) % 12];
}

// ── Flow ────────────────────────────────────────────────────────────────────

async function onDateSubmit(d, m, y) {
  const birthDate = makeBirthDate(d, m, y);
  venus = calculateVenus(birthDate);

  setElementTheme(venus.element);
  setUserVenus(venus.longitude, venus.element);
  renderReveal(venus);

  const signIndex = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
    'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'].indexOf(venus.sign);

  const portalScreen = document.getElementById('screen-portal');
  portalScreen.classList.add('is-fading');
  tunedLongitude = venus.longitude;
  await zoomToSign(signIndex, { duration: 2500, targetDeg: venus.longitude });
  showScreen('reveal');
  enableDragRotate(true);
  history.pushState({ screen: 'reveal' }, '');

  rebuildGenreGrid();

  document.getElementById('btn-choose-genre').addEventListener('click', () => {
    rebuildGenreGrid();
    enableDragRotate(false);
    showNebula(true);
    dimNebula(true);
    showScreen('genre');
    updateNowPlayingButton(true);
    history.pushState({ screen: 'genre' }, '');
  });

  document.getElementById('btn-back-reveal').addEventListener('click', () => history.back());
  document.getElementById('btn-back-genre').addEventListener('click', () => history.back());
}

async function zoomInToReveal() {
  const signIndex = ZODIAC_SIGNS.indexOf(venus.sign);

  setElementTheme(venus.element);
  setUserVenus(venus.longitude, venus.element);
  renderReveal(venus);

  const portalScreen = document.getElementById('screen-portal');
  portalScreen.classList.add('is-fading');
  tunedLongitude = venus.longitude;
  await zoomToSign(signIndex, { duration: 2500, targetDeg: venus.longitude });
  showScreen('reveal');
  enableDragRotate(true);
  history.pushState({ screen: 'reveal' }, '');
  updateNowPlayingButton(true);
}

let cachedShuffledGenres = null;

function rebuildGenreGrid() {
  const genreLabel = id => {
    if (id === 'favorites') return 'Favorites';
    return GENRE_CATEGORIES.find(c => c.id === id)?.label || id;
  };
  if (!cachedShuffledGenres) {
    cachedShuffledGenres = [...GENRE_CATEGORIES];
    for (let i = cachedShuffledGenres.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cachedShuffledGenres[i], cachedShuffledGenres[j]] = [cachedShuffledGenres[j], cachedShuffledGenres[i]];
    }
  }
  const shuffledGenres = [...cachedShuffledGenres];
  if (getFavorites().length > 0) {
    shuffledGenres.unshift({ id: 'favorites', label: 'Favorites' });
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
}

function startRadio(genreId, genreLabel, subgenreId = null) {
  const effectiveLong = tunedLongitude != null ? tunedLongitude : venus.longitude;
  const effectiveSign = signFromLongitude(effectiveLong);
  const effectiveElement = ZODIAC_ELEMENTS[effectiveSign];

  renderRadioHeader(effectiveSign, genreLabel, subgenreId);
  enableDragRotate(false);
  updateNowPlayingButton(false);
  showNebula(true);
  dimNebula(false);
  deepDimNebula(true);
  setZoomDrift(true);
  showScreen('radio');
  if (history.state?.screen !== 'radio') {
    history.pushState({ screen: 'radio' }, '');
  }

  if (tracks.length > 0 && genreId === playingGenreId && subgenreId === playingSubgenreId) {
    renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()));
    return tracks;
  }

  let candidateTracks;
  if (genreId === 'favorites') {
    candidateTracks = matchFavorites(getFavorites(), effectiveLong);
  } else {
    candidateTracks = match(effectiveSign, genreId, effectiveElement, {
      subgenre: subgenreId,
      userLongitude: effectiveLong,
    });
  }

  const newLabel = subgenreId ? `${genreLabel} · ${subgenreId}` : genreLabel;

  if (candidateTracks.length === 0) {
    showEmptyState(true);
    return candidateTracks;
  }
  showEmptyState(false);

  if (isPlaying() && hasPlayed) {
    renderTrackList(candidateTracks, -1, (i) => {
      tracks = candidateTracks;
      playingGenreId = genreId;
      playingSubgenreId = subgenreId;
      activeGenreLabel = newLabel;
      failedIds.clear();
      trackVideoIndex.clear();
      playTrack(i);
    }, new Set(), new Set(getFavorites()));
  } else {
    tracks = candidateTracks;
    playingGenreId = genreId;
    playingSubgenreId = subgenreId;
    activeGenreLabel = newLabel;
    failedIds.clear();
    trackVideoIndex.clear();
    renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()));
    playTrack(0);
  }

  return candidateTracks;
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
  if (!sessionHasPlayed) return;
  silentFailTimer = setTimeout(() => {
    if (!hasPlayed) {
      tryBackupOrFail(`silent fail (no playback after ${SILENT_FAIL_MS / 1000}s)`);
    }
  }, SILENT_FAIL_MS);
}

// ─── OPTIMIZED LOADING ANIMATION (Uses requestAnimationFrame) ───────────────

function startLoadingProgress() {
  loadStartTime = Date.now();
  
  // Clear any existing animation frame
  if (loadingAnimFrame) cancelAnimationFrame(loadingAnimFrame);
  
  if (!sessionHasPlayed) {
    showBuffering(100);
    return;
  }
  
  showBuffering(0);

  // The 60fps Loop
  function loop() {
    const elapsed = Date.now() - loadStartTime;
    // Calculate 0 to 100 over 15 seconds
    const pct = Math.min((elapsed / SILENT_FAIL_MS) * 100, 100);
    
    showBuffering(pct);
    
    if (pct < 100) {
      loadingAnimFrame = requestAnimationFrame(loop);
    }
  }
  
  // Kickstart the loop
  loop();
}

function stopLoadingProgress() {
  if (loadingAnimFrame) cancelAnimationFrame(loadingAnimFrame);
  loadingAnimFrame = null;
}

// ────────────────────────────────────────────────────────────────────────────

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
  updateNowPlaying('Loading...');
  updateFavoriteButton(isFavorite(track.name));
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()));
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
  const failedTracks = new Set([...failedIds].map(i => tracks[i]));
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  failedIds.clear();
  trackVideoIndex.clear();
  tracks.forEach((t, i) => { if (failedTracks.has(t)) failedIds.add(i); });
  currentTrackIndex = tracks.indexOf(current);
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()));
}

// ── Now-playing button on genre screen ────────────────────────────────────

function updateNowPlayingButton(show) {
  const btn = document.getElementById('btn-now-playing');
  const revealNp = document.getElementById('reveal-now-playing');
  if (!btn) return;

  const hasTrack = tracks.length > 0 && activeGenreLabel;
  const onReveal = document.getElementById('screen-reveal').classList.contains('active');
  if (show && hasTrack && !onReveal) {
    const track = tracks[currentTrackIndex];
    const artist = track ? track.name : '';
    const title = getVideoTitle();
    const prefix = !hasPlayed ? 'loading... ' : '';
    const label = title ? `${prefix}${artist} — ${title}` : `${prefix}${artist}` || activeGenreLabel;
    document.getElementById('btn-np-label').textContent = label;
    document.getElementById('btn-np-label-dup').textContent = label;
    const marquee = btn.querySelector('.btn-np-marquee');
    if (marquee) {
      marquee.style.animation = 'none';
      marquee.offsetHeight; 
      marquee.style.animation = '';
    }
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }

  if (revealNp) {
    if (hasTrack && onReveal) {
      const track = tracks[currentTrackIndex];
      const artist = track ? track.name : '';
      const title = getVideoTitle();
      const revealLabel = title ? `${artist} — ${title}` : artist || activeGenreLabel;
      document.getElementById('reveal-np-label').textContent = revealLabel;
      document.getElementById('reveal-np-label-dup').textContent = revealLabel;
      const rMarquee = revealNp.querySelector('.reveal-np-marquee');
      if (rMarquee) {
        rMarquee.style.animation = 'none';
        rMarquee.offsetHeight;
        rMarquee.style.animation = '';
      }
      revealNp.hidden = false;
    } else {
      revealNp.hidden = true;
    }
  }
}

document.getElementById('btn-now-playing').addEventListener('click', goToRadio);
document.getElementById('reveal-now-playing').addEventListener('click', goToRadio);

function goToRadio() {
  updateNowPlayingButton(false);
  showNebula(true);
  dimNebula(false);
  deepDimNebula(true);
  setZoomDrift(true);
  showScreen('radio');
  if (history.state?.screen !== 'radio') {
    history.pushState({ screen: 'radio' }, '');
  }
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
  // Inside your btn-fav click listener in main.js
  if (e.target.id === 'btn-fav' || e.target.closest('#btn-fav')) {
    const track = tracks[currentTrackIndex];
    const nowFav = toggleFavorite(track.name);
    updateFavoriteButton(nowFav);

    // FIND the active track in the list and toggle the class to trigger CSS transition
    const activeItem = document.querySelector('.track-item.active');
    if (activeItem) {
      activeItem.classList.toggle('is-favorited', nowFav);
    }
  }
});

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
      if (tunedLongitude != null) updateTunedDisplay(tunedLongitude);
      break;
    case 'genre':
      rebuildGenreGrid();
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

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') playTrack(currentTrackIndex - 1);
  if (e.key === 'ArrowRight') playTrack(currentTrackIndex + 1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});