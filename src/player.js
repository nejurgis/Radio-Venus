let player = null;
let isReady = false;
let onEndCallback = null;
let onErrorCallback = null;
let onStateChangeCallback = null;

export function loadYouTubeAPI() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    window.onYouTubeIframeAPIReady = resolve;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
}

export function initPlayer(containerId, { onEnd, onError, onStateChange }) {
  onEndCallback = onEnd;
  onErrorCallback = onError;
  onStateChangeCallback = onStateChange;

  return new Promise(resolve => {
    player = new window.YT.Player(containerId, {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        iv_load_policy: 3,
        fs: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          isReady = true;
          resolve();
        },
        onStateChange: handleStateChange,
        onError: handleError,
      },
    });
  });
}

function handleStateChange(event) {
  const state = event.data;
  if (state === window.YT.PlayerState.ENDED && onEndCallback) {
    onEndCallback();
  }
  if (onStateChangeCallback) {
    onStateChangeCallback(state);
  }
}

function handleError(event) {
  const code = event.data;
  // 100 = video removed, 101/150 = embed restricted
  if (onErrorCallback) onErrorCallback(code);
}

export function loadVideo(videoId) {
  if (!player || !isReady) return;
  player.loadVideoById(videoId);
}

export function play() {
  if (player && isReady) player.playVideo();
}

export function pause() {
  if (player && isReady) player.pauseVideo();
}

export function togglePlay() {
  if (!player || !isReady) return;
  const state = player.getPlayerState();
  if (state === window.YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

export function isPlaying() {
  if (!player || !isReady) return false;
  return player.getPlayerState() === window.YT.PlayerState.PLAYING;
}

export function getDuration() {
  if (!player || !isReady) return 0;
  return player.getDuration() || 0;
}

export function getCurrentTime() {
  if (!player || !isReady) return 0;
  return player.getCurrentTime() || 0;
}

export function seekTo(seconds) {
  if (!player || !isReady) return;
  player.seekTo(seconds, true);
}

export function getVideoTitle() {
  if (!player || !isReady) return '';
  const data = player.getVideoData();
  return data?.title || '';
}

export function isMuted() {
  if (!player || !isReady) return false;
  return player.isMuted();
}

export function unMute() {
  if (player && isReady) player.unMute();
}
