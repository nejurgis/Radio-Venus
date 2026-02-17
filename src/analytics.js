// ── Analytics helpers (GA4 via gtag) ─────────────────────────────────────────
// Wraps gtag calls so they silently no-op if GA is blocked by ad blockers.

function send(event, params) {
  if (typeof gtag === 'function') {
    gtag('event', event, params);
  }
}

// ── 1. Heartbeat: periodic ping while music is playing ───────────────────────
let heartbeatInterval = null;
let sessionListenSec = 0;

export function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    sessionListenSec += 30;
    send('listening_heartbeat', {
      event_category: 'engagement',
      value: sessionListenSec,
    });
  }, 30_000);
}

export function stopHeartbeat() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;
}

// ── 2. Song events ───────────────────────────────────────────────────────────

export function trackSongStart(artist, genre) {
  send('song_start', {
    event_category: 'playback',
    artist,
    genre,
  });
}

export function trackSongComplete(artist, genre, durationSec) {
  send('song_complete', {
    event_category: 'playback',
    artist,
    genre,
    value: Math.floor(durationSec),
  });
}

export function trackSongSkip(artist, genre, listenedSec) {
  send('song_skip', {
    event_category: 'playback',
    artist,
    genre,
    skip_time: Math.floor(listenedSec),
  });
}

export function trackSongError(artist, reason) {
  send('song_error', {
    event_category: 'playback',
    artist,
    reason,
  });
}

// ── 3. User actions ──────────────────────────────────────────────────────────

export function trackShare(genre, method) {
  send('share', {
    event_category: 'interaction',
    genre,
    method,
  });
}

export function trackGenreSelect(genre, subgenre) {
  send('genre_select', {
    event_category: 'interaction',
    genre,
    ...(subgenre && { subgenre }),
  });
}

export function trackFavorite(artist, action) {
  send('favorite', {
    event_category: 'interaction',
    artist,
    action, // 'add' or 'remove'
  });
}

export function trackHarpToggle(state) {
  send('harpButton_toggle', {
    event_category: 'ui',
    state: state, // <--- Use the argument you passed in!
  });
}

export function trackPlaylistShare(genre, trackCount) {
  send('playlist_share', {
    event_category: 'interaction',
    genre: genre,      // e.g., 'valentine', 'favorites', 'moon'
    count: trackCount, // How many tracks were in the shared list?
  });
}

export function trackScreenView(screenName) {
  send('screen_view', {
    event_category: 'navigation',
    screen_name: screenName
  });
}

export function trackShuffle(state) {
  send('shuffle_toggle', {
    event_category: 'playback',
    state: state ? 'on' : 'off'
  });
}

export function trackNebulaInteraction(action) {
  // action: 'drag_rotate', 'click_sign', 'zoom_sign'
  send('nebula_interaction', {
    event_category: 'visualization',
    action: action
  });
}