import { calculateVenus, calculateMoon, makeBirthDate } from './venus.js';
import { GENRE_CATEGORIES, SUBGENRES } from './genres.js';
import { loadDatabase, getDatabase, match, matchFavorites, matchMoon, matchSun, getSubgenreCounts } from './matcher.js';
import { getFavorites, toggleFavorite, isFavorite } from './favorites.js';
import { initNebula, renderNebula, setUserVenus, setPreviewVenus, clearPreviewVenus, setMoonPosition, setSunPosition, zoomToSign, zoomOut, showNebula, dimNebula, deepDimNebula, setZoomDrift, enableDragRotate, nudgeWheel, resetDrift, onNebulaHover, onNebulaClick, onRotation, onNeedleCross, onSignCross, onMoonHover, onSunHover } from './viz.js';
import { pluck, gong, setHarpEnabled, isHarpEnabled, pokeAudio } from './harp.js';
import { loadYouTubeAPI, initPlayer, loadVideo, cueVideo, togglePlay, isPlaying, getDuration, getCurrentTime, seekTo, getVideoTitle, isMuted, unMute } from './player.js';
import {
  initScreens, showScreen, setElementTheme,
  renderReveal, renderGenreGrid, renderRadioHeader,
  renderTrackList, setActiveTrack, updateNowPlaying, setNowPlayingPaused, updatePlayButton, updateFavoriteButton, showEmptyState,
  markTrackFailed,
  highlightGenres,
  updateProgress, resetProgress, glideToPosition,
  showBuffering, hideBuffering,
  renderArtistIndex,
  updateArtistIndexPlaying,
} from './ui.js';
import {
  startHeartbeat, stopHeartbeat,
  trackSongStart, trackSongComplete, trackSongSkip, trackSongError,
  trackShare, trackGenreSelect, trackFavorite, trackHarpToggle, trackPlaylistShare, trackShuffle,
} from './analytics.js';

// ── State ───────────────────────────────────────────────────────────────────

let venus = null;
let tracks = [];
let currentTrackIndex = 0;
let playingGenreId = null;
let playingSubgenreId = null;
let displayedGenreId = null;   // what's currently shown in the track list (may differ from playingGenreId while music plays)
let displayedTracks = null;    // non-null only when displayed list differs from tracks (preview mode)
let currentPlayingTrack = null; // the actual track object playing (survives tracks[] reshuffles)
// Progress loop — rAF-driven for smooth 60fps, polls YouTube API at 4Hz
let _progressRaf   = null;
let _progTime      = 0;   // last polled currentTime
let _progDur       = 0;   // last polled duration
let _progPollAt    = -Infinity; // performance.now() of last poll
const _PROG_POLL_MS = 250; // poll YouTube API 4×/sec (fast enough, avoids IPC overhead)

function startProgressLoop() {
  if (_progressRaf) cancelAnimationFrame(_progressRaf);
  function loop(now) {
    _progressRaf = requestAnimationFrame(loop);
    if (now - _progPollAt >= _PROG_POLL_MS || _progDur === 0) {
      _progTime   = getCurrentTime();
      _progDur    = getDuration();
      _progPollAt = now;
    }
    // Linearly interpolate between polls; freeze when paused
    const elapsed = isPaused ? 0 : Math.min((now - _progPollAt) / 1000, _PROG_POLL_MS / 1000);
    updateProgress(_progTime + elapsed, _progDur);
  }
  _progressRaf = requestAnimationFrame(loop);
}

function stopProgressLoop() {
  if (_progressRaf) cancelAnimationFrame(_progressRaf);
  _progressRaf = null;
}
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
const REPORT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwDSNsMTMViSpOh4ZUZg8juXjI6MVY4Ptr8uu7ZWyjaiqP22hHouMkl7fqXEk1dEfVL/exec';
const NEWSLETTER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw3e83Z12sIjcW7uC3vJ9r1y5fzvYPLMD5W3mlKUVj0me3r4SI7Ixj4obBl-v68LnbO/exec'; // new Apps Script with doGet writing email to sheet // paste deployed Google Apps Script web app URL here
let pendingSeekTime = 0;  // for shared links — seek once on first PLAYING

let activeGenreLabel = null;       // label of the currently playing genre
let tunedLongitude = null;         // current longitude at the tuner needle
let playerInitPromise = null;      // lazy YouTube player init

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

// ── Lazy YouTube player initialization ──────────────────────────────────────

function ensurePlayerReady() {
  if (!playerInitPromise) {
    playerInitPromise = loadYouTubeAPI().then(() => initPlayer('yt-player', {
      onEnd: () => {
        const track = tracks[currentTrackIndex];
        if (track) trackSongComplete(track.name, playingGenreId, getDuration());
        playTrack(currentTrackIndex + 1);
      },
      onError: (code) => {
        if (code === 2 && !hasPlayed) {
          console.warn(`[Radio Venus] Handshake glitch (Error 2). Retrying track...`);
          const track = tracks[currentTrackIndex];
          if (track) {
            loadVideo(getVideoIds(track)[trackVideoIndex.get(currentTrackIndex) || 0]);
            return;
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
          startHeartbeat(() => ({ artist: tracks[currentTrackIndex]?.name ?? 'Unknown', genre: playingGenreId ?? 'general' }));
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
          if (isMuted()) showUnmuteOverlay();
          updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'));

          startProgressLoop();
        } else {
          stopHeartbeat();
          stopProgressLoop();
          if (hasPlayed && state === window.YT.PlayerState.BUFFERING) {
            const dur = getDuration();
            const cur = getCurrentTime();
            if (dur > 0) showBuffering((cur / dur) * 100);
          }
          if (hasPlayed && state === window.YT.PlayerState.PAUSED) {
            isPaused = true;
            const track = tracks[currentTrackIndex];
            if (track) setNowPlayingPaused(track.name, getVideoTitle());
            updateNowPlayingButton(!document.getElementById('screen-radio').classList.contains('active'), true);
          }
        }
      },
    }));
  }
  return playerInitPromise;
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initScreens();

  // Newsletter form
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('.newsletter-input');
      const email = input.value.trim();
      if (!email || !email.includes('@')) { input.focus(); return; }
      input.value = '';
      input.blur();
      showToast('subscribed! — thank you ✶');
      const url = new URL(NEWSLETTER_ENDPOINT);
      url.searchParams.set('email', email);
      url.searchParams.set('timestamp', new Date().toISOString());
      fetch(url.toString(), { mode: 'no-cors' }).catch(() => {});
    });
  });

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
  document.getElementById('your-venus').addEventListener('click', () => {
    if (!venus) return;
    tunedLongitude = venus.longitude;
    updateTunedDisplay(venus.longitude);
    resetDrift(1400);
  });
  document.getElementById('btn-back-genre').addEventListener('click', () => history.back());
  document.getElementById('btn-info').addEventListener('click', async () => {
    showScreen('about');
    history.pushState({ screen: 'about' }, '', '#about');
    // DB may still be loading — wait for it if needed
    let db = getDatabase();
    if (!db.length) {
      await loadDatabase();
      db = getDatabase();
    }
    renderArtistIndex(db);
    updateArtistIndexPlaying(currentPlayingTrack?.name);
    updateNowPlayingButton(true, isPaused);
  });
  document.getElementById('btn-back-about').addEventListener('click', () => history.back());
  document.getElementById('artist-index').addEventListener('click', e => {
    const span = e.target.closest('.index-artist');
    if (!span) return;
    playArtistFromIndex(span.dataset.name);
  });
  document.addEventListener('click', e => {
    if (e.target.closest('.resonance-info-btn')) {
      showScreen('about');
      updateNowPlayingButton(true, isPaused);
      updateArtistIndexPlaying(currentPlayingTrack?.name);
      document.getElementById('about-resonance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.getElementById('btn-lyre').addEventListener('click', () => {
    setHarpEnabled(true);
    showToast('Lyre mode activated');
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
  const cameFromAbout = window.location.hash === '#about';
  if (cameFromAbout) {
    showScreen('about');
    history.pushState({ screen: 'about' }, '', '#about');
  }

  // Defer nebula canvas to keep critical path clear — fires within 300ms for real users
  let nebulaReady = false;
  const startNebula = () => {
    initNebula('nebula-container');
    const db = getDatabase();
    renderNebula(db.length ? db : []);
    nebulaReady = true;
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(startNebula, { timeout: 300 });
  } else {
    setTimeout(startNebula, 50);
  }

  const moonNow = calculateMoon();
  setMoonPosition(moonNow.longitude, moonNow.phaseAngle);
  setSunPosition(moonNow.sunLongitude);
  onNebulaHover(info => highlightGenres(info ? info.genres : null));
  onMoonHover(active => {
    document.getElementById('btn-moon-playlist').classList.toggle('visible', active);
  });
  document.getElementById('btn-moon-playlist').addEventListener('click', () => {
    launchMoonPlaylist();
  });
  onSunHover(active => {
    document.getElementById('btn-sun-playlist').classList.toggle('visible', active);
  });
  document.getElementById('btn-sun-playlist').addEventListener('click', () => {
    launchSunPlaylist();
  });
  onNeedleCross(({ radialFrac, element, speed }) => {
    const velocity = Math.min(1, 0.2 + speed * 0.8);
    pluck(radialFrac, element, velocity);
  });
  onSignCross(({ element, speed }) => {
    const velocity = Math.min(1, 0.15 + speed * 0.5);
    gong(element, velocity);
  });
  onRotation(longitude => {
    // Only update tunedLongitude from manual drag (reveal screen active).
    // During radio the nebula drifts — that should not shift the user's Venus position.
    if (document.getElementById('screen-reveal').classList.contains('active')) {
      tunedLongitude = longitude;
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

  const dbResult = await loadDatabase()
    .then(() => ({ status: 'fulfilled' }))
    .catch(e => ({ status: 'rejected', reason: e }));

  // If user landed on #about, render the index now that DB is loaded
  if (cameFromAbout) {
    renderArtistIndex(getDatabase());
    updateArtistIndexPlaying(currentPlayingTrack?.name);
  }

  // Pre-warm YouTube player during idle time (before user needs it)
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => ensurePlayerReady(), { timeout: 3000 });
  } else {
    setTimeout(() => ensurePlayerReady(), 1000);
  }

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
      ensurePlayerReady().then(() => cueVideo(tracks[0].youtubeVideoId));
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
      ensurePlayerReady().then(() => cueVideo(tracks[0].youtubeVideoId));
      updatePlayButton(false);

      const signIdx = ZODIAC_SIGNS.indexOf('Aries');
      if (signIdx >= 0) zoomToSign(signIdx, { duration: 2500 });
      updateNowPlayingButton(false);
    }
  }

  // ── Handle #moon link (Today's Moon) ──
  if (window.location.hash === '#moon' && dbResult.status === 'fulfilled') {
    history.replaceState({ screen: 'portal' }, '', window.location.pathname);
    launchMoonPlaylist();
  }

  // ── Handle #sun link (Today's Sun) ──
  if (window.location.hash === '#sun' && dbResult.status === 'fulfilled') {
    history.replaceState({ screen: 'portal' }, '', window.location.pathname);
    launchSunPlaylist();
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
      if (sharedGenreId) {
        const candidateTracks = match(sign, sharedGenreId, el, { userLongitude: 0 });
        if (candidateTracks.length > 0) {
          tracks = candidateTracks;
          playingGenreId = sharedGenreId;
          activeGenreLabel = sharedGenre || genreCat?.label || sharedGenreId;

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

          pendingSeekTime = sharedTime;
          ensurePlayerReady().then(() => cueVideo(sharedVid));
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
  } else if (nebulaReady) {
    renderNebula(getDatabase()); // nebula already init'd — populate artist dots now
    // If nebula isn't ready yet, startNebula() will call renderNebula with the loaded db
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
    `${deg}° ${sign}`;
  const detail = document.getElementById('reveal-detail');
  detail.textContent = element;
  detail.style.color = `var(--${element})`;

  // Show "Your" only when dial is near natal Venus tick
  const yourEl = document.getElementById('your-venus');
  if (yourEl && venus) {
    let diff = Math.abs(longitude - venus.longitude);
    if (diff > 180) diff = 360 - diff;
    const opacity = Math.max(0, 1 - diff / 6);
    yourEl.style.opacity = opacity;
    const isNatal = diff < 2;
    yourEl.classList.toggle('is-natal', isNatal);
    yourEl.style.color = isNatal ? `var(--${venus.element})` : '';
  }
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
    const special = ['moon', 'sun'];
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

function startRadio(genreId, genreLabel, subgenreId = null, targetArtistName = null) {
  trackGenreSelect(genreId, subgenreId);

  // 1. DEFINE SHARE PERMISSION
  // This enables the button for Moon, Valentine, and Favorites
  const playlistShareFn = (genreId === 'valentine' || genreId === 'favorites' || genreId === 'moon' || genreId === 'sun')
    ? sharePlaylist
    : undefined;

  const playlistDescription =
    genreId === 'moon' ? 'The immediate emotional weather. This playlist tracks the Moon\'s rapid movement, capturing the fleeting, intuitive mood of the next 48 hours.' :
    genreId === 'sun'  ? 'A living playlist that expresses the current astrological season, evolving in real-time with the transit of the Sun.' :
    null;

  // 2. SETUP CONTEXT
  const effectiveLong = tunedLongitude != null ? tunedLongitude : (venus ? venus.longitude : 0);
  const effectiveSign = signFromLongitude(effectiveLong);
  const effectiveElement = ZODIAC_ELEMENTS[effectiveSign] || 'air';

  // Venus position note for the resonance label in regular genre playlists
  const isUserVenus = venus && Math.abs(effectiveLong - venus.longitude) < 0.5;
  const _deg = (effectiveLong % 30).toFixed(1);
  const venusNote = isUserVenus
    ? `Artists sorted by their Venus resonance with your natal Venus at ${effectiveSign} ${_deg}°`
    : `Artists sorted by their Venus resonance with Venus at ${effectiveSign} ${_deg}°`;

  displayedGenreId = genreId;
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

  // 3. OPTIMIZATION: If clicking the active genre, just re-render and return.
  if (tracks.length > 0 && genreId === playingGenreId && subgenreId === playingSubgenreId) {
    renderTrackList(tracks, currentTrackIndex, i => playTrack(i), failedIds, new Set(getFavorites()), playlistShareFn, playlistDescription, venusNote);
    return tracks;
  }

  // 4. FIND TRACKS
  let candidateTracks;

  if (genreId === 'favorites') {
    candidateTracks = matchFavorites(getFavorites(), effectiveLong);
  } 
  else if (genreId === 'moon') {
    // ── MOON LOGIC ──
    const now = new Date();
    const moonData = calculateMoon(now);

    // Update Header
    const moonSign = moonData.sign;
    const moonDeg = Math.round(moonData.longitude % 30);
    renderRadioHeader(moonSign, `Moon in ${moonSign} ${moonDeg}°`);

    // Find Artists
    candidateTracks = matchMoon(moonData.longitude);
  }
  else if (genreId === 'sun') {
    // ── SUN LOGIC ──
    const sunData = calculateMoon(new Date());
    const sunSign = sunData.sunSign;
    const sunDeg = Math.round(sunData.sunLongitude % 30);
    renderRadioHeader(sunSign, `Sun in ${sunSign} ${sunDeg}°`);
    candidateTracks = matchSun(sunData.sunLongitude);
  }
  else {
    // ── STANDARD LOGIC ──
    candidateTracks = match(effectiveSign, genreId, effectiveElement, {
      subgenre: subgenreId,
      userLongitude: effectiveLong,
    });
  }

  // 5. HANDLE RESULTS
  const newLabel = subgenreId ? `${genreLabel} · ${subgenreId}` : genreLabel;

  if (candidateTracks.length === 0) {
    showEmptyState(true);
    return candidateTracks;
  }
  showEmptyState(false);

  // Reset State
  originalTrackOrder = null;
  isShuffled = false;
  document.getElementById('btn-shuffle').classList.remove('is-active');

  // 6. PLAY & RENDER
  const isSpecialPlaylist = genreId === 'moon' || genreId === 'sun';
  if (targetArtistName || !(isPlaying() && hasPlayed) || isSpecialPlaylist) {
    tracks = candidateTracks;
    playingGenreId = genreId;
    playingSubgenreId = subgenreId;
    activeGenreLabel = newLabel;
    failedIds.clear();
    trackVideoIndex.clear();

    const startIdx = targetArtistName
      ? Math.max(0, tracks.findIndex(t => t.name === targetArtistName))
      : 0;
    renderTrackList(tracks, startIdx, i => playTrack(i), failedIds, new Set(getFavorites()), playlistShareFn, playlistDescription, venusNote);
    playTrack(startIdx);
  } else {
    renderTrackList(candidateTracks, -1, (i) => {
      tracks = candidateTracks;
      playingGenreId = genreId;
      playingSubgenreId = subgenreId;
      activeGenreLabel = newLabel;
      failedIds.clear();
      trackVideoIndex.clear();
      playTrack(i);
    }, new Set(), new Set(getFavorites()), playlistShareFn, playlistDescription, venusNote);
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

function launchMoonPlaylist() {
  const moonData = calculateMoon(new Date());
  const moonSign = moonData.sign;
  const moonDeg = Math.round(moonData.longitude % 30);
  const el = ZODIAC_ELEMENTS[moonSign] || 'water';

  setElementTheme(el);
  renderRadioHeader(moonSign, `Moon in ${moonSign} ${moonDeg}°`);
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

  tracks = matchMoon(moonData.longitude);
  playingGenreId = 'moon';
  activeGenreLabel = "Today's Moon";
  currentTrackIndex = 0;
  failedIds.clear();
  trackVideoIndex.clear();

  renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()), sharePlaylist,
    'The immediate emotional weather. This playlist tracks the Moon\'s rapid movement, capturing the fleeting, intuitive mood of the next 48 hours.');

  if (tracks.length > 0) {
    updateNowPlaying(tracks[0].name);
    updateFavoriteButton(isFavorite(tracks[0].name));
    ensurePlayerReady().then(() => cueVideo(tracks[0].youtubeVideoId));
    updatePlayButton(false);
  }

  const signIndex = ZODIAC_SIGNS.indexOf(moonSign);
  if (signIndex >= 0) zoomToSign(signIndex, { duration: 2500, targetDeg: moonData.longitude });
  updateNowPlayingButton(false);
}

function launchSunPlaylist() {
  const moonData = calculateMoon(new Date());
  const sunSign = moonData.sunSign;
  const sunDeg = Math.round(moonData.sunLongitude % 30);
  const el = ZODIAC_ELEMENTS[sunSign] || 'fire';

  setElementTheme(el);
  renderRadioHeader(sunSign, `Sun in ${sunSign} ${sunDeg}°`);
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

  tracks = matchSun(moonData.sunLongitude);
  playingGenreId = 'sun';
  activeGenreLabel = "Today's Sun";
  currentTrackIndex = 0;
  failedIds.clear();
  trackVideoIndex.clear();

  renderTrackList(tracks, 0, i => playTrack(i), failedIds, new Set(getFavorites()), sharePlaylist,
    'A living playlist that expresses the current astrological season, evolving in real-time with the transit of the Sun.');

  if (tracks.length > 0) {
    updateNowPlaying(tracks[0].name);
    updateFavoriteButton(isFavorite(tracks[0].name));
    ensurePlayerReady().then(() => cueVideo(tracks[0].youtubeVideoId));
    updatePlayButton(false);
  }

  const signIndex = ZODIAC_SIGNS.indexOf(sunSign);
  if (signIndex >= 0) zoomToSign(signIndex, { duration: 2500, targetDeg: moonData.sunLongitude });
  updateNowPlayingButton(false);
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
  currentPlayingTrack = track;

  trackSongStart(track.name, playingGenreId);

  stopProgressLoop();
  resetProgress();
  // Pick a random video ID from all available (main + backups) for variety
  const allIds = getVideoIds(track).filter(Boolean);
  const startIdx = allIds.length > 1 ? Math.floor(Math.random() * allIds.length) : 0;
  trackVideoIndex.set(currentTrackIndex, startIdx);

  ensurePlayerReady().then(() => {
    loadVideo(allIds[startIdx]);
    startSilentFailTimer();
  });
  startLoadingProgress();
  // Paint the active-track highlight first, then defer heavier UI work to next frame
  setActiveTrack(currentTrackIndex);
  updatePlayButton('buffering');
  requestAnimationFrame(() => {
    updateNowPlaying('Loading...'); // cancels + restarts marquee WAAPI — defer so it doesn't block repaint
    updateFavoriteButton(isFavorite(track.name)); // rebuilds DOM — defer too
    updateArtistIndexPlaying(track.name); // querySelector over 1200+ elements — defer
  });
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

function playArtistFromIndex(artistName) {
  // If the artist is already in the current playlist, just navigate and play
  const idx = tracks.findIndex(t => t.name === artistName);
  if (idx >= 0) {
    showScreen('radio');
    if (history.state?.screen !== 'radio') history.pushState({ screen: 'radio' }, '');
    playTrack(idx);
    return;
  }
  // Find the artist in DB, load their primary genre
  const db = getDatabase();
  const artist = db.find(a => a.name === artistName);
  if (!artist?.genres?.length) return;
  const genreId = artist.genres[0];
  const genreCat = GENRE_CATEGORIES.find(g => g.id === genreId);
  if (!genreCat) return;
  startRadio(genreId, genreCat.label, null, artistName);
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
    trackShuffle(isShuffled);
  }
  if (e.target.id === 'btn-harp' || e.target.closest('#btn-harp')) {
    const on = !isHarpEnabled();
    setHarpEnabled(on);
    showToast(on ? 'Lyre mode activated' : 'Lyre mode deactivated');
    document.getElementById('btn-harp').classList.toggle('is-active', on);
    nudgeWheel(on ? 3 : -4);
    // TRACKING
    trackHarpToggle(on ? 'enabled' : 'disabled');
  }
  if (e.target.id === 'btn-share' || e.target.closest('#btn-share')) {
    shareCurrentTrack();
  }
  if (e.target.id === 'btn-fav' || e.target.closest('#btn-fav')) {
    const track = currentPlayingTrack || tracks[currentTrackIndex];
    const isFirst = getFavorites().length === 0;
    const nowFav = toggleFavorite(track.name);
    trackFavorite(track.name, nowFav ? 'add' : 'remove');
    updateFavoriteButton(nowFav);
    if (nowFav) showToast(isFirst ? 'Favorites playlist created' : 'Added to favorites playlist');
    else showToast('Removed from favorites playlist');

    // FIND the active track in the list and toggle the class to trigger CSS transition
    const activeItem = document.querySelector('.track-item.active');
    if (activeItem) activeItem.classList.toggle('is-favorited', nowFav);

    // If favorites playlist is displayed, re-render it to reflect the change
    if (displayedGenreId === 'favorites') refreshFavoritesDisplay();
  }
  const reportBtn = e.target.closest('.btn-report');
  if (reportBtn) {
    const name = reportBtn.dataset.name;
    const trackItem = reportBtn.closest('.track-item');
    if (trackItem) trackItem.remove();
    else reportBtn.remove();
    showToast('reported! — thank you');
    const url = new URL(REPORT_ENDPOINT);
    url.searchParams.set('artist', name);
    url.searchParams.set('timestamp', new Date().toISOString());
    fetch(url.toString(), { mode: 'no-cors' }).catch(() => {}); // fire-and-forget
    return;
  }
  const favContainer = e.target.closest('.track-fav-container');
  if (favContainer) {
    const item = favContainer.closest('.track-item');
    if (!item) return;
    const idx = parseInt(item.dataset.index, 10);
    const trackList = displayedTracks || tracks;
    if (isNaN(idx) || !trackList[idx]) return;
    const track = trackList[idx];
    const isFirst = getFavorites().length === 0;
    const nowFav = toggleFavorite(track.name);
    trackFavorite(track.name, nowFav ? 'add' : 'remove');
    item.classList.toggle('is-favorited', nowFav);
    if (idx === currentTrackIndex) updateFavoriteButton(nowFav);
    if (nowFav) showToast(isFirst ? 'Favorites playlist created' : 'Added to favorites playlist');
    else showToast('Removed from favorites playlist');

    if (displayedGenreId === 'favorites') refreshFavoritesDisplay();
  }
});

function refreshFavoritesDisplay() {
  const elong = tunedLongitude != null ? tunedLongitude : (venus ? venus.longitude : 0);
  const freshTracks = matchFavorites(getFavorites(), elong);
  if (playingGenreId === 'favorites') {
    // Favorites is also the playing list — update tracks and re-render in place
    tracks = freshTracks;
    displayedTracks = null;
    // Resync currentTrackIndex to follow the playing track object through list changes
    const newIdx = currentPlayingTrack ? tracks.findIndex(t => t.name === currentPlayingTrack.name) : -1;
    if (newIdx >= 0) currentTrackIndex = newIdx;
    renderTrackList(tracks, newIdx, i => playTrack(i), failedIds, new Set(getFavorites()), getPlaylistShareFn());
  } else {
    // Favorites displayed but different genre playing — re-render preview list
    displayedTracks = freshTracks;
    renderTrackList(freshTracks, -1, (i) => {
      tracks = freshTracks;
      displayedTracks = null;
      playingGenreId = 'favorites';
      playingSubgenreId = null;
      failedIds.clear();
      trackVideoIndex.clear();
      playTrack(i);
    }, new Set(), new Set(getFavorites()), sharePlaylist);
  }
}

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
  return (playingGenreId === 'valentine' || playingGenreId === 'favorites' || playingGenreId === 'moon' || playingGenreId === 'sun') ? sharePlaylist : undefined;
}

function toArtistSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Dashboard share button — always shares the individual song
async function shareCurrentTrack() {
  const track = tracks[currentTrackIndex];
  if (!track) return;

  const time = Math.floor(getCurrentTime());
  const slug = toArtistSlug(track.name) || track.youtubeVideoId;
  // Use the active genre for context-specific OG tags; fall back to artist's first genre
  const specialGenres = new Set(['valentine', 'favorites', 'moon', 'sun']);
  const gid = (!specialGenres.has(playingGenreId) && playingGenreId)
    ? playingGenreId
    : (track.genres?.[0] ?? '');
  const shareUrl = `${window.location.origin}/artist/${slug}${gid ? `/${gid}` : ''}?t=${time}`;

  trackShare(playingGenreId || '', 'track_link');
  await copyAndToast(shareUrl, 'Current track link copied');
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
    
  } else if (genreId === 'moon') {
    shareUrl = `${base}?utm_source=share&utm_medium=clipboard&utm_campaign=moon#moon`;
    toast = 'Moon playlist copied';
    trackPlaylistShare('moon', tracks.length);
  } else if (genreId === 'sun') {
    shareUrl = `${base}?utm_source=share&utm_medium=clipboard&utm_campaign=sun#sun`;
    toast = 'Sun playlist copied';
    trackPlaylistShare('sun', tracks.length);
  } else {
    // 🛑 Stops here or generic genres
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
    _progPollAt = -Infinity; // force immediate re-poll so interpolation starts from new position
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
      if (tunedLongitude != null) {
        updateTunedDisplay(tunedLongitude);
        resetDrift(1800);
      }
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
      updateNowPlayingButton(true, isPaused);
      updateArtistIndexPlaying(currentPlayingTrack?.name);
      break;
  }
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') playTrack(currentTrackIndex - 1);
  if (e.key === 'ArrowRight') playTrack(currentTrackIndex + 1);
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});
