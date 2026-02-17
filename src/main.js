import { calculateVenus, calculateMoon, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, matchFavorites, matchMoon, getSubgenreCounts } from './matcher.js';
import { getFavorites, toggleFavorite, isFavorite } from './favorites.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, setMoonPosition, zoomToSign, zoomOut, showNebula, dimNebula, deepDimNebula, setZoomDrift, enableDragRotate, nudgeWheel, onNebulaHover, onNebulaClick, onRotation, onNeedleCross, onSignCross } from './viz.js';
import { pluck, gong, setHarpEnabled, isHarpEnabled, pokeAudio } from './harp.js';
import { loadYouTubeAPI, initPlayer, loadVideo, cueVideo, togglePlay, isPlaying, getDuration, getCurrentTime, seekTo, getVideoTitle, isMuted, unMute } from './player.js';
import {
  initScreens, showScreen, setElementTheme,
  renderReveal, renderGenreGrid, renderRadioHeader,
  renderTrackList, updateNowPlaying, setNowPlayingPaused, updatePlayButton, updateFavoriteButton, showEmptyState,
  markTrackFailed,
  highlightGenres,
  updateProgress, resetProgress, glideToPosition,
  showBuffering, hideBuffering,
} from './ui.js';
import {
  startHeartbeat, stopHeartbeat,
  trackSongStart, trackSongComplete, trackSongSkip, trackSongError,
  trackShare, trackGenreSelect, trackFavorite, trackHarpToggle, trackPlaylistShare,
} from './analytics.js';

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
let originalTrackOrder = null;     // unshuffled track order for toggle-back
let isShuffled = false;
let isLinkRecentlyCopied = false;
let isPaused = false;                // whether playback is currently paused

// CHANGED: Use AnimationFrame ID instead of Interval ID for smoothness
let loadingAnimFrame = null;        
let loadStartTime = 0;
const SILENT_FAIL_MS = 15000;
let pendingSeekTime = 0;  // for shared links — seek once on first PLAYING

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

  // Static button listeners (registered once, not per date submit)
  document.getElementById('btn-choose-genre').addEventListener('click', () => {
    rebuildGenreGrid();
    enableDragRotate(false);
    showNebula(true);
    dimNebula(true);
    showScreen('genre');
    updateNowPlayingButton(true, isPaused);
    history.pushState({ screen: 'genre' }, '');
  });
  document.getElementById('btn-back-reveal').addEventListener('click', () => history.back());
  document.getElementById('btn-back-genre').addEventListener('click', () => history.back());
  document.getElementById('btn-info').addEventListener('click', () => {
    showScreen('about');
    history.pushState({ screen: 'about' }, '', '#about');
  });
  document.getElementById('btn-back-about').addEventListener('click', () => history.back());
  document.getElementById('btn-lyre').addEventListener('click', () => {
    setHarpEnabled(true);
    const elements = ['fire', 'water', 'earth', 'air'];
    const el = elements[Math.floor(Math.random() * 4)];
    pluck(Math.random(), el, 0.5 + Math.random() * 0.3);
  });

  // ── Keep iOS AudioContext alive on any touch/click ──
  document.addEventListener('touchstart', () => pokeAudio(), { passive: true });
  document.addEventListener('mousedown', () => pokeAudio());

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

    // --- Tactile Feedback System Tapping on laptop to trigger the buttons ---
  function initTactileFeedback() {
    const applyPulse = (e) => {
      // 1. Prevent "Ghost Clicks": If it's a mouse event on a touch device, skip it.
      if (e.type === 'mousedown' && 'ontouchstart' in window) return;
  
      // 2. Identify the target
      const btn = e.target.closest('button, .btn-primary, .btn-shuffle, .track-item, .btn-share-mini, .star-toggle');
      
      if (btn) {
        btn.classList.add('is-pressed');
        setTimeout(() => btn.classList.remove('is-pressed'), 100);
      }
    };
  
    // Capture phase listeners (using 'true') are the "secret sauce" 
    // they catch the tap before any other code can stop it.
    window.addEventListener('mousedown', applyPulse, true);
    window.addEventListener('touchstart', applyPulse, { capture: true, passive: true });
  }

  // Execute the setup
  initTactileFeedback();

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
  if (window.location.hash === '#about') {
    showScreen('about');
    history.pushState({ screen: 'about' }, '', '#about');
  }

  const [dbResult] = await Promise.allSettled([
    loadDatabase(),
    loadYouTubeAPI(),
  ]);

  await initPlayer('yt-player', {
    onEnd: () => {
      const track = tracks[currentTrackIndex];
      if (track) trackSongComplete(track.name, playingGenreId, getDuration());
      playTrack(currentTrackIndex + 1);
    },
    onError: (code) => {
      // If code is 2, it's often a handshake error. 
      // If hasPlayed is false, we give it one "second chance" reload 
      // before giving up and skipping.
      if (code === 2 && !hasPlayed) {
        console.warn(`[Radio Venus] Handshake glitch (Error 2). Retrying track...`);
        const track = tracks[currentTrackIndex];
        if (track) {
          loadVideo(getVideoIds(track)[trackVideoIndex.get(currentTrackIndex) || 0]);
          return; // Stop here, don't skip yet!
        }
      }

      clearTimeout(silentFailTimer);
      stopLoadingProgress();
      const reason = code === 150 || code === 101 ? 'embed restricted' : code === 100 ? 'removed' : 'error ' + code;
      tryBackupOrFail(reason);
    },
    onStateChange: (state) => {
      if (state === window.YT.PlayerState.PLAYING) {
        updatePlayButton(true);
      } else if (state === window.YT.PlayerState.BUFFERING) {
        updatePlayButton('buffering');
      } else {
        updatePlayButton(false);
      }
      if (state === window.YT.PlayerState.PLAYING) {
        hasPlayed = true;
        sessionHasPlayed = true;
        isPaused = false;
        startHeartbeat();
        clearTimeout(silentFailTimer);
        stopLoadingProgress();
        hideBuffering();
        const title = getVideoTitle();
        const track = tracks[currentTrackIndex];
        if (track) updateNowPlaying(track.name, title);
        if (pendingSeekTime > 0) {
          seekTo(pendingSeekTime);
          pendingSeekTime = 0;
        }
        // iOS muted autoplay: show tap-to-unmute if playing but muted
        if (isMuted()) showUnmuteOverlay();
        updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'));

        clearInterval(progressInterval);
        // CHANGED: 500ms -> 100ms for smoother playback progress
        progressInterval = setInterval(() => {
          updateProgress(getCurrentTime(), getDuration());
        }, 100);

      } else {
        stopHeartbeat();
        clearInterval(progressInterval);
        progressInterval = null;
        if (hasPlayed && state === window.YT.PlayerState.BUFFERING) {
          const dur = getDuration();
          const cur = getCurrentTime();
          if (dur > 0) showBuffering((cur / dur) * 100);
        }
        // Show [PAUSED] on now-playing when paused
        if (hasPlayed && state === window.YT.PlayerState.PAUSED) {
          isPaused = true;
          const track = tracks[currentTrackIndex];
          if (track) setNowPlayingPaused(track.name, getVideoTitle());
          updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'), true);
        }
      }
    },
  });

  // ── Handle #valentine link ──
  if (window.location.hash === '#valentine' && dbResult.status === 'fulfilled') {
    history.replaceState({ screen: 'portal' }, '', window.location.pathname);
    const sign = 'aries';
    const el = ZODIAC_ELEMENTS[sign] || 'air';
    const genreCat = GENRE_CATEGORIES.find(g => g.id === 'valentine');
    const candidateTracks = match(sign, 'valentine', el, { userLongitude: 0 });
    if (genreCat && candidateTracks.length > 0) {
      setElementTheme(el);
      renderRadioHeader(sign, genreCat.label);
      showScreen('radio');
      showNebula(true);

      const nebulaCont = document.getElementById('nebula-container');
      if (nebulaCont) {
        nebulaCont.classList.add('is-dimmed');
        nebulaCont.classList.add('is-deep-dimmed');
        nebulaCont.classList.add('is-zoomed');
      }
      dimNebula(true);
      deepDimNebula(true);
      setZoomDrift(true);
      history.pushState({ screen: 'radio' }, '');

      tracks = candidateTracks;
      playingGenreId = 'valentine';
      activeGenreLabel = genreCat.label;
      currentTrackIndex = 0;
      failedIds.clear();
      trackVideoIndex.clear();
      renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()), sharePlaylist);

      updateNowPlaying(tracks[0].name);
      updateFavoriteButton(isFavorite(tracks[0].name));
      cueVideo(tracks[0].youtubeVideoId);
      updatePlayButton(false);

      const signIndex = ZODIAC_SIGNS.indexOf('Aries');
      if (signIndex >= 0) zoomToSign(signIndex, { duration: 2500 });
      updateNowPlayingButton(false);
    }
  }

  // ── Handle #favorites=Name1,Name2,... link ──
  if (window.location.hash.startsWith('#favorites=') && dbResult.status === 'fulfilled') {
    const names = decodeURIComponent(window.location.hash.slice('#favorites='.length)).split(',');
    history.replaceState({ screen: 'portal' }, '', window.location.pathname);
    const candidateTracks = matchFavorites(names, 0);
    if (candidateTracks.length > 0) {
      const sign = 'aries';
      const el = ZODIAC_ELEMENTS[sign] || 'air';
      setElementTheme(el);
      renderRadioHeader(sign, 'Shared Favorites');
      showScreen('radio');
      showNebula(true);

      const nebulaCont = document.getElementById('nebula-container');
      if (nebulaCont) {
        nebulaCont.classList.add('is-dimmed');
        nebulaCont.classList.add('is-deep-dimmed');
        nebulaCont.classList.add('is-zoomed');
      }
      dimNebula(true);
      deepDimNebula(true);
      setZoomDrift(true);
      history.pushState({ screen: 'radio' }, '');

      tracks = candidateTracks;
      playingGenreId = 'favorites';
      activeGenreLabel = 'Shared Favorites';
      currentTrackIndex = 0;
      failedIds.clear();
      trackVideoIndex.clear();
      renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()), sharePlaylist);

      updateNowPlaying(tracks[0].name);
      updateFavoriteButton(isFavorite(tracks[0].name));
      cueVideo(tracks[0].youtubeVideoId);
      updatePlayButton(false);

      const signIdx = ZODIAC_SIGNS.indexOf('Aries');
      if (signIdx >= 0) zoomToSign(signIdx, { duration: 2500 });
      updateNowPlayingButton(false);
    }
  }

  // ── Handle shared link (?vid=...&t=...&artist=...) ──
  const shareParams = new URLSearchParams(window.location.search);
  const sharedVid = shareParams.get('vid');
  if (sharedVid) {
    const sharedArtist = shareParams.get('artist') || '';
    const sharedSign = shareParams.get('sign') || '';
    const sharedGenre = shareParams.get('genre') || '';
    const sharedGenreId = shareParams.get('gid') || '';
    const sharedTime = parseInt(shareParams.get('t')) || 0;

    // 1. History & Screen Setup
    history.replaceState({ screen: 'portal' }, '', window.location.pathname);
    history.pushState({ screen: 'radio' }, '');

    // 2. Theme & Basic Visuals
    const sign = sharedSign || 'aries';
    const el = ZODIAC_ELEMENTS[sign] || 'air';
    setElementTheme(el);
    renderRadioHeader(sign, sharedGenre);
    showScreen('radio');
    showNebula(true);

    // 3. APPLY DEEP DIMMING IMMEDIATELY (Before rendering tracks)
    const nebulaCont = document.getElementById('nebula-container');
    if (nebulaCont) {
      // Use the exact class names from your viz.js functions
      nebulaCont.classList.add('is-dimmed');
      nebulaCont.classList.add('is-deep-dimmed'); // Added hyphen to match viz.js
      nebulaCont.classList.add('is-zoomed');
    }
    dimNebula(true);
    deepDimNebula(true);
    setZoomDrift(true);

    // 4. Load Data
    if (sharedGenreId && dbResult.status === 'fulfilled') {
      const genreCat = GENRE_CATEGORIES.find(g => g.id === sharedGenreId);
      if (genreCat) {
        const candidateTracks = match(sign, sharedGenreId, el, { userLongitude: 0 });
        if (candidateTracks.length > 0) {
          tracks = candidateTracks;
          playingGenreId = sharedGenreId;
          activeGenreLabel = sharedGenre || genreCat.label;

          const idx = tracks.findIndex(t => t.name === sharedArtist);
          currentTrackIndex = idx >= 0 ? idx : 0;

          if (idx >= 0) {
            tracks[idx] = { ...tracks[idx], youtubeVideoId: sharedVid };
          }

          failedIds.clear();
          trackVideoIndex.clear();
          
          // Render tracks — no playlist share for individual shared links
          renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()));
          
          updateNowPlaying(sharedArtist);
          updateFavoriteButton(isFavorite(sharedArtist));

          requestAnimationFrame(() => {
            const activeItem = document.querySelector('#track-list .track-item.active');
            if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });

          pendingSeekTime = sharedTime;
          cueVideo(sharedVid);
          updatePlayButton(false);
        }
      }
    }

    // 5. Fallback for single track
    if (tracks.length === 0) {
      tracks = [{ name: sharedArtist, youtubeVideoId: sharedVid, backupVideoIds: [], genres: [sharedGenreId] }];
      currentTrackIndex = 0; 
      activeGenreLabel = sharedGenre;
      renderTrackList(tracks, 0, i => playTrack(i), new Set(), new Set());
      updateNowPlaying(sharedArtist);
      pendingSeekTime = sharedTime;
      cueVideo(sharedVid);
      updatePlayButton(false);
    }

    // 6. Final Zoom Coordination
    const formattedSign = sign.charAt(0).toUpperCase() + sign.slice(1).toLowerCase();
    const signIndex = ZODIAC_SIGNS.indexOf(formattedSign);

    if (signIndex >= 0) {
      zoomToSign(signIndex, { duration: 2500 }); 
    }
    
    updateNowPlayingButton(false);
}

  if (dbResult.status === 'rejected') {
    console.error('Failed to load musician database:', dbResult.reason);
  } else {
    initNebula('nebula-container');
    renderNebula(getDatabase());
    const moon = calculateMoon();
    setMoonPosition(moon.longitude);
    onNebulaHover(info => highlightGenres(info ? info.genres : null));
    onNeedleCross(({ radialFrac, element, speed }) => {
      const velocity = Math.min(1, 0.2 + speed * 0.8);
      pluck(radialFrac, element, velocity);
    });
    onSignCross(({ element, speed }) => {
      const velocity = Math.min(1, 0.15 + speed * 0.5);
      gong(element, velocity);
    });
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
  document.getElementById('btn-harp').classList.add('is-visible');
  tunedLongitude = venus.longitude;
  await zoomToSign(signIndex, { duration: 2500, targetDeg: venus.longitude });
  showScreen('reveal');
  enableDragRotate(true);
  history.pushState({ screen: 'reveal' }, '');

  rebuildGenreGrid();
}

async function zoomInToReveal() {
  const signIndex = ZODIAC_SIGNS.indexOf(venus.sign);

  setElementTheme(venus.element);
  setUserVenus(venus.longitude, venus.element);
  renderReveal(venus);

  const portalScreen = document.getElementById('screen-portal');
  portalScreen.classList.add('is-fading');
  document.getElementById('btn-harp').classList.add('is-visible');
  tunedLongitude = venus.longitude;
  await zoomToSign(signIndex, { duration: 2500, targetDeg: venus.longitude });
  showScreen('reveal');
  enableDragRotate(true);
  history.pushState({ screen: 'reveal' }, '');
  updateNowPlayingButton(true, isPaused);
}

let cachedShuffledGenres = null;

function rebuildGenreGrid() {
  const genreLabel = id => {
    if (id === 'favorites') return 'Favorites';
    return GENRE_CATEGORIES.find(c => c.id === id)?.label || id;
  };

  if (!cachedShuffledGenres) {
    // 1. Extract special genres
    const special = ['valentine', 'moon'];
    const pinned = special.map(id => GENRE_CATEGORIES.find(c => c.id === id)).filter(Boolean);
    // 2. Get all others
    const others = GENRE_CATEGORIES.filter(c => !special.includes(c.id));

    // 3. Shuffle ONLY the 'others'
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    // 4. Construct list: Special genres first, then the rest
    cachedShuffledGenres = [...pinned, ...others];
  }

  const shuffledGenres = [...cachedShuffledGenres];
  
  // 5. Add Favorites at the very top (so it's Favorites -> Valentine -> Rest)
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
  trackGenreSelect(genreId, subgenreId);
  const effectiveLong = tunedLongitude != null ? tunedLongitude : (venus ? venus.longitude : 0);
  const effectiveSign = signFromLongitude(effectiveLong);
  const effectiveElement = ZODIAC_ELEMENTS[effectiveSign] || 'air';

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

  const playlistShareFn = (genreId === 'valentine' || genreId === 'favorites') ? sharePlaylist : undefined;

  // 1. OPTIMIZATION: If clicking the active genre, just re-render and return.
  if (tracks.length > 0 && genreId === playingGenreId && subgenreId === playingSubgenreId) {
    renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()), playlistShareFn);
    return tracks;
  }

  // 2. CALCULATE CANDIDATES (The Fix)
  let candidateTracks;

  if (genreId === 'favorites') {
    candidateTracks = matchFavorites(getFavorites(), effectiveLong);
  } 
  else if (genreId === 'moon') {
    // ── MOON LOGIC ──
    // 1. Calculate REAL-TIME Moon position
    const now = new Date();
    const moonData = calculateMoon(now); 
    
    // 2. Update header to show "Moon in [Sign]" instead of the user's Venus sign
    const moonSign = moonData.sign; 
    const moonDeg = Math.round(moonData.longitude % 30);
    renderRadioHeader(moonSign, `Moon in ${moonSign} ${moonDeg}°`);
    
    // 3. Find the closest artists using your new matcher
    candidateTracks = matchMoon(moonData.longitude);
  } 
  else {
    // ── STANDARD LOGIC ──
    candidateTracks = match(effectiveSign, genreId, effectiveElement, {
      subgenre: subgenreId,
      userLongitude: effectiveLong,
    });
  }

  // 3. HANDLE EMPTY STATE
  const newLabel = subgenreId ? `${genreLabel} · ${subgenreId}` : genreLabel;

  if (candidateTracks.length === 0) {
    showEmptyState(true);
    return candidateTracks;
  }
  showEmptyState(false);

  // 4. PLAYBACK STATE UPDATE
  originalTrackOrder = null;
  isShuffled = false;
  document.getElementById('btn-shuffle').classList.remove('is-active');

  if (isPlaying() && hasPlayed) {
    renderTrackList(candidateTracks, -1, (i) => {
      tracks = candidateTracks;
      playingGenreId = genreId;
      playingSubgenreId = subgenreId;
      activeGenreLabel = newLabel;
      failedIds.clear();
      trackVideoIndex.clear();
      playTrack(i);
    }, new Set(), new Set(getFavorites()), playlistShareFn);
  } else {
    tracks = candidateTracks;
    playingGenreId = genreId;
    playingSubgenreId = subgenreId;
    activeGenreLabel = newLabel;
    failedIds.clear();
    trackVideoIndex.clear();
    renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()), playlistShareFn);
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
    trackSongError(track.name, reason);
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

  // Track skip if switching away from a playing track
  const prevTrack = tracks[currentTrackIndex];
  if (prevTrack && hasPlayed) {
    const listened = getCurrentTime();
    const dur = getDuration();
    if (dur > 0 && listened < dur - 1) {
      trackSongSkip(prevTrack.name, playingGenreId, listened);
    }
  }

  currentTrackIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  const track = tracks[currentTrackIndex];

  trackSongStart(track.name, playingGenreId);

  clearInterval(progressInterval);
  progressInterval = null;
  resetProgress();
  trackVideoIndex.set(currentTrackIndex, 0);

  loadVideo(getVideoIds(track)[0]);
  startSilentFailTimer();
  startLoadingProgress();
  updateNowPlaying('Loading...');
  updateFavoriteButton(isFavorite(track.name));
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()), getPlaylistShareFn());
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
  const btn = document.getElementById('btn-shuffle');

  if (isShuffled) {
    // Restore original order
    tracks = [...originalTrackOrder];
    isShuffled = false;
    btn.classList.remove('is-active');
  } else {
    // Save original order before first shuffle
    if (!originalTrackOrder) originalTrackOrder = [...tracks];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    isShuffled = true;
    btn.classList.add('is-active');
  }

  failedIds.clear();
  trackVideoIndex.clear();
  tracks.forEach((t, i) => { if (failedTracks.has(t)) failedIds.add(i); });
  currentTrackIndex = tracks.indexOf(current);
  renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()), getPlaylistShareFn());
}

// ── Now-playing button on genre screen ────────────────────────────────────

function updateNowPlayingButton(show, stopped = false) {
  const btn = document.getElementById('btn-now-playing');
  const revealNp = document.getElementById('reveal-now-playing');
  if (!btn) return;

  const hasTrack = tracks.length > 0 && activeGenreLabel;
  const onReveal = document.getElementById('screen-reveal').classList.contains('active');
  if (show && hasTrack && !onReveal) {
    const track = tracks[currentTrackIndex];
    const artist = track ? track.name : '';
    const title = getVideoTitle();
    const stoppedPrefix = stopped ? '[PAUSED] ' : '';
    const loadPrefix = !hasPlayed ? 'loading... ' : '';
    const prefix = stoppedPrefix || loadPrefix;
    const label = title ? `${prefix}${artist} — ${title}` : `${prefix}${artist}` || activeGenreLabel;
    document.getElementById('btn-np-label').textContent = label;
    document.getElementById('btn-np-label-dup').textContent = label;
    const marquee = btn.querySelector('.btn-np-marquee');
    if (marquee) {
      marquee.style.animation = stopped ? 'none' : '';
      if (!stopped) { marquee.style.animation = 'none'; marquee.offsetHeight; marquee.style.animation = ''; }
    }
    btn.hidden = false;
  } else {
    btn.hidden = true;
  }

  if (revealNp) {
    if (show && hasTrack && onReveal) {
      const track = tracks[currentTrackIndex];
      const artist = track ? track.name : '';
      const title = getVideoTitle();
      const stoppedPrefix = stopped ? '[PAUSED] ' : '';
      const revealLabel = title ? `${stoppedPrefix}${artist} — ${title}` : `${stoppedPrefix}${artist}` || activeGenreLabel;
      document.getElementById('reveal-np-label').textContent = revealLabel;
      document.getElementById('reveal-np-label-dup').textContent = revealLabel;
      const rMarquee = revealNp.querySelector('.reveal-np-marquee');
      if (rMarquee) {
        rMarquee.style.animation = stopped ? 'none' : '';
        if (!stopped) { rMarquee.style.animation = 'none'; rMarquee.offsetHeight; rMarquee.style.animation = ''; }
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
  showScreen('radio');
  updateNowPlayingButton(false);
  showNebula(true);
  dimNebula(false);
  deepDimNebula(true);
  setZoomDrift(true);
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
  if (e.target.id === 'btn-harp' || e.target.closest('#btn-harp')) {
    const on = !isHarpEnabled();
    setHarpEnabled(on);
    document.getElementById('btn-harp').classList.toggle('is-active', on);
    nudgeWheel(on ? 3 : -4);
    // TRACKING
    trackHarpToggle(on ? 'enabled' : 'disabled');
  }
  if (e.target.id === 'btn-share' || e.target.closest('#btn-share')) {
    shareCurrentTrack();
  }
  if (e.target.id === 'btn-fav' || e.target.closest('#btn-fav')) {
    const track = tracks[currentTrackIndex];
    const nowFav = toggleFavorite(track.name);
    trackFavorite(track.name, nowFav ? 'add' : 'remove');
    updateFavoriteButton(nowFav);

    // FIND the active track in the list and toggle the class to trigger CSS transition
    const activeItem = document.querySelector('.track-item.active');
    if (activeItem) {
      activeItem.classList.toggle('is-favorited', nowFav);
    }
  }
});

async function copyAndToast(url, toast) {
  isLinkRecentlyCopied = true;
  setTimeout(() => { isLinkRecentlyCopied = false; }, 2000);
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(url); showToast(toast); return; }
    catch (err) { console.error("Clipboard API failed, trying fallback", err); }
  }
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { if (document.execCommand('copy')) showToast(toast); }
  catch (err) { console.error('Fallback copy failed', err); }
  document.body.removeChild(ta);
}

function getPlaylistShareFn() {
  return (playingGenreId === 'valentine' || playingGenreId === 'favorites') ? sharePlaylist : undefined;
}

// Dashboard share button — always shares the individual song
async function shareCurrentTrack() {
  const track = tracks[currentTrackIndex];
  if (!track) return;

  const videoId = getVideoIds(track)[trackVideoIndex.get(currentTrackIndex) || 0];
  const sign = venus ? venus.sign : '';
  const genre = activeGenreLabel || '';
  const time = Math.floor(getCurrentTime());
  const genreId = playingGenreId || '';
  const base = window.location.origin + window.location.pathname;

  const params = new URLSearchParams({
    vid: videoId,
    artist: track.name,
    gid: genreId,
    t: time,
    utm_source: 'share',
    utm_medium: 'clipboard',
    ...(sign && { sign }),
    ...(genre && { genre }),
  });

  trackShare(genreId, 'track_link');
  await copyAndToast(`${base}?${params}`, 'Link copied');
}

// Playlist share button — shares the whole valentine or favorites playlist
async function sharePlaylist() {
  const genreId = playingGenreId || '';
  const base = window.location.origin + window.location.pathname;

  let shareUrl, toast;
  
  if (genreId === 'valentine') {
    shareUrl = `${base}?utm_source=share&utm_medium=clipboard&utm_campaign=valentine#valentine`;
    toast = 'Valentine link copied';
    
    // New detailed tracker
    trackPlaylistShare('valentine', tracks.length);
    
  } else if (genreId === 'favorites') {
    const names = tracks.map(t => t.name).join(',');
    shareUrl = `${base}?utm_source=share&utm_medium=clipboard&utm_campaign=favorites#favorites=${encodeURIComponent(names)}`;
    toast = 'Favorites link copied';
    
    // New detailed tracker
    trackPlaylistShare('favorites', tracks.length);
    
  } else {
    // 🛑 Stops here for 'moon' or generic genres
    return;
  }


  await copyAndToast(shareUrl, toast);
}

function showUnmuteOverlay() {
  let overlay = document.getElementById('unmute-overlay');
  if (overlay) return; // already showing
  overlay = document.createElement('div');
  overlay.id = 'unmute-overlay';
  overlay.className = 'unmute-overlay';
  overlay.innerHTML = '<span>tap to unmute</span>';
  overlay.addEventListener('click', () => {
    unMute();
    overlay.remove();
  }, { once: true });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove('is-visible');
  toast.offsetHeight; // force reflow
  toast.classList.add('is-visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

document.getElementById('seeker').addEventListener('input', e => {
  const duration = getDuration();
  if (duration > 0) {
    const targetPct = (e.target.value / 1000) * 100;
    showBuffering(targetPct);
    glideToPosition(targetPct);
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
      document.getElementById('btn-harp').classList.remove('is-visible');
      showNebula(true);
      dimNebula(false);
      updateNowPlayingButton(true, isPaused);
      zoomOut({ duration: 1800 });
      break;
    case 'reveal':
      showNebula(true);
      dimNebula(false);
      showScreen('reveal');
      document.getElementById('btn-harp').classList.add('is-visible');
      updateNowPlayingButton(true, isPaused);
      if (tunedLongitude != null) updateTunedDisplay(tunedLongitude);
      break;
    case 'genre':
      rebuildGenreGrid();
      showNebula(true);
      dimNebula(true);
      showScreen('genre');
      updateNowPlayingButton(true, isPaused);
      break;
    case 'radio':
      showNebula(true);
      dimNebula(false);
      showScreen('radio');
      updateNowPlayingButton(false);
      break;
    case 'about':
      showScreen('about');
      break;
  }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') playTrack(currentTrackIndex - 1);
  if (e.key === 'ArrowRight') playTrack(currentTrackIndex + 1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});
