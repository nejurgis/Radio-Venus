// src/viz.js
import { trackNebulaInteraction } from './analytics.js';
// --- PRE-RENDER MOON STICKER (Gradient + Soft Shadow) ---
const moonCanvas = document.createElement('canvas');
moonCanvas.width = 64;  
moonCanvas.height = 64; 
const mCtx = moonCanvas.getContext('2d');

// ── 1. Draw the Base (The Lighted Part) ──
mCtx.beginPath();
// Center at 32, 32 | Radius 20
mCtx.arc(32, 32, 20, 0, Math.PI * 2); 

// DEFINE THE GRADIENT HERE (Local coordinates: 32,32)
// We use the "Lunar Blue" values (100, 180, 255) directly
const mGrad = mCtx.createRadialGradient(32, 32, 0, 32, 32, 20);

mGrad.addColorStop(0.5, `rgba(255, 255, 255, 0.9)`);

// 0% - White Core
mGrad.addColorStop(0.9, `rgba(255, 255, 255, 0.9)`);
// 40% - Lunar Blue Mid
mGrad.addColorStop(0.4, `rgba(100, 176, 247, 0.8)`);
// 100% - Soft Edge
mGrad.addColorStop(0.5, `rgba(100, 180, 255, 0.3)`);

mCtx.fillStyle = mGrad;
mCtx.shadowBlur = 4; // Slight bloom on the outer edge
mCtx.shadowColor = 'rgba(100, 180, 255, 1)';
mCtx.fill();


// ── 2. The Shadow Bite (The Eraser) ──
mCtx.globalCompositeOperation = 'destination-out';
mCtx.beginPath();

// Shift "Eraser" circle to LEFT (x=24) to leave a crescent on the RIGHT
// Radius 17 gives a nice thickness
mCtx.arc(24, 32, 17, 0, Math.PI * 2); 

// The eraser doesn't need a gradient, just opacity. 
// A slight shadowBlur here softens the "Terminator" line (where light meets dark)
mCtx.fillStyle = '#000000'; 
mCtx.shadowBlur = 4; 
mCtx.shadowColor = '#000000'; 
mCtx.fill();

// Reset
mCtx.globalCompositeOperation = 'source-over';
// ── Zodiac Nebula: artist distribution ring on the portal screen ─────────────
import { isHarpEnabled } from './harp.js';

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const ELEMENT_COLORS = {
  fire:  [192, 57, 43],   // --fire: #c0392b
  earth: [39, 174, 96],   // --earth: #27ae60
  air:   [212, 172, 13],  // --air: #d4ac0d
  water: [41, 128, 185],  // --water: #2980b9
};

const ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

// Tabler Icons zodiac signs (MIT, 24×24, stroke-based) — multi-path per sign
const ZODIAC_PATHS_RAW = [
  // Aries ♈
  ["M12 5a5 5 0 1 0 -4 8", "M16 13a5 5 0 1 0 -4 -8", "M12 21l0 -16"],
  // Taurus ♉
  ["M6 3a6 6 0 0 0 12 0", "M6 15a6 6 0 1 0 12 0a6 6 0 1 0 -12 0"],
  // Gemini ♊
  ["M3 3a21 21 0 0 0 18 0", "M3 21a21 21 0 0 1 18 0", "M7 4.5l0 15", "M17 4.5l0 15"],
  // Cancer ♋
  ["M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M15 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M3 12a10 6.5 0 0 1 14 -6.5", "M21 12a10 6.5 0 0 1 -14 6.5"],
  // Leo ♌
  ["M13 17a4 4 0 1 0 8 0", "M3 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M7 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M7 7c0 3 2 5 2 9", "M15 7c0 4 -2 6 -2 10"],
  // Virgo ♍
  ["M3 4a2 2 0 0 1 2 2v9", "M5 6a2 2 0 0 1 4 0v9", "M9 6a2 2 0 0 1 4 0v10a7 5 0 0 0 7 5", "M12 21a7 5 0 0 0 7 -5v-2a3 3 0 0 0 -6 0"],
  // Libra ♎
  ["M5 20l14 0", "M5 17h5v-.3a7 7 0 1 1 4 0v.3h5"],
  // Scorpio ♏
  ["M3 4a2 2 0 0 1 2 2v9", "M5 6a2 2 0 0 1 4 0v9", "M9 6a2 2 0 0 1 4 0v10a3 3 0 0 0 3 3h5", "M18 22l3 -3m-3 3l3 3"],
  // Sagittarius ♐
  ["M4 20l16 -16", "M13 4h7v7", "M6.5 12.5l5 5"],
  // Capricorn ♑
  ["M4 4a3 3 0 0 1 3 3v9", "M7 7a3 3 0 0 1 6 0v11a3 3 0 0 1 -3 3", "M16 17a3 3 0 1 0 0.001 0z"],
  // Aquarius ♒
  ["M3 10l3 -3l3 3l3 -3l3 3l3 -3l3 3", "M3 17l3 -3l3 3l3 -3l3 3l3 -3l3 3"],
  // Pisces ♓
  ["M5 3a21 21 0 0 1 0 18", "M19 3a21 21 0 0 0 0 18", "M5 12l14 0"],
];

// PERFORMANCE: Cache Path2D objects once so we don't parse strings every frame
const ZODIAC_PATHS = ZODIAC_PATHS_RAW.map(signPaths => 
  signPaths.map(d => new Path2D(d))
);

// Deterministic hash from artist name → stable jitter value (0-1)
function nameHash(name, seed = 0) {
  let h = seed;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return (h & 0x7fffffff) / 0x7fffffff;
}


let canvas = null;
let ctx = null;
let animId = null;
let rotation = 0;
let zoomDrift = 0;
let zoomDriftEnabled = false;
let userDot = null;
let previewDot = null;  // soft glow while typing birth date
let moonDot = null;     // current Moon position on the ecliptic
let dots = [];
let hoveredDot = null;
let mouseX = -1;
let mouseY = -1;
let zoomSign = null;       // null = full ring, sign index = zoomed
let containerEl = null;
let hoverCallback = null;  // called with { name, genres } or null
let clickCallback = null;  // called with { name, genres } when dot clicked in zoom
let rotationCallback = null; // called with tuned longitude each frame
let zoomTargetDeg = null;    // exact degree to center on (null = sign center)
let dragRotateEnabled = false;
let dragging = false;
let dragStartX = 0;
let dragLastX = 0;
let dragVelocity = 0;       // degrees per frame for inertia
let needleCrossCallback = null; // called when needle crosses a dot
let signCrossCallback = null;  // called when needle crosses a sign boundary
let prevNeedleSign = -1;       // sign index needle was in last frame
const prevOnNeedle = new Set(); // dot indices on needle last frame

// Zoom animation state
let zoomProgress = 0;      // 0 = full ring, 1 = fully zoomed
let zoomAnimating = false;
let zoomAnimStart = 0;
let zoomAnimDuration = 2000;
let zoomRotStart = 0;      // rotation snapshot when animation starts
let zoomResolve = null;    // promise resolver

// ── OPTIMIZED SPRITE GENERATOR (High-Res + Soft Glow Filter) ──────────────

const spriteCache = new Map();
const SPRITE_SCALE = 8; // Supersampling for Retina/High-DPI smoothness

function getDotSprite(r, g, b, size, alpha) {
  // Round params for cache hits
  const kSize = Math.round(size * 10) / 10; 
  const kAlpha = Math.round(alpha * 10) / 10;
  const key = `${r},${g},${b},${kSize},${kAlpha}`;
  
  if (spriteCache.has(key)) return spriteCache.get(key);

  const sCanvas = document.createElement('canvas');
  const drawRadius = kSize * 1.5; 
  const padding = 2; 
  
  // Canvas dimensions: Multiplied by SPRITE_SCALE for high resolution
  const dim = Math.ceil((drawRadius * 2 + padding * 2) * SPRITE_SCALE);
  const c = dim / 2;
  
  sCanvas.width = dim;
  sCanvas.height = dim;
  const sCtx = sCanvas.getContext('2d');
  
  sCtx.scale(SPRITE_SCALE, SPRITE_SCALE);
  sCtx.filter = 'blur(0.5px) saturate(1.2)';

  const grad = sCtx.createRadialGradient(
    (c / SPRITE_SCALE) - drawRadius * 0.35, 
    (c / SPRITE_SCALE) - drawRadius * 0.35, 
    drawRadius * 0.05, 
    c / SPRITE_SCALE, 
    c / SPRITE_SCALE, 
    drawRadius
  );
  
  const dr = r, dg = g, db = b;
  const lr = Math.min(255, dr + 100);
  const lg = Math.min(255, dg + 100);
  const lb = Math.min(255, db + 100);

  grad.addColorStop(0, `rgba(255, 255, 255, ${kAlpha})`);
  grad.addColorStop(0.2, `rgba(${lr}, ${lg}, ${lb}, ${kAlpha * 0.95})`);
  grad.addColorStop(0.5, `rgba(${dr}, ${dg}, ${db}, ${kAlpha * 0.9})`);
  grad.addColorStop(1, `rgba(${Math.round(dr * 0.1)}, ${Math.round(dg * 0.1)}, ${Math.round(db * 0.1)}, 0)`);
  
  sCtx.fillStyle = grad;
  sCtx.beginPath();
  sCtx.arc(c / SPRITE_SCALE, c / SPRITE_SCALE, drawRadius, 0, Math.PI * 2);
  sCtx.fill();
  
  spriteCache.set(key, sCanvas);
  return sCanvas;
}

const crosshairCursor = (() => {
  const s = 24, c = s / 2;
  const cur = document.createElement('canvas');
  cur.width = cur.height = s;
  const cx = cur.getContext('2d');
  cx.strokeStyle = 'rgba(0,0,0,0.5)';
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(c, 4); cx.lineTo(c, s - 4);
  cx.moveTo(4, c); cx.lineTo(s - 4, c);
  cx.stroke();
  cx.strokeStyle = 'rgba(255,255,255,0.9)';
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(c, 4); cx.lineTo(c, s - 4);
  cx.moveTo(4, c); cx.lineTo(s - 4, c);
  cx.stroke();
  return `url(${cur.toDataURL()}) ${c} ${c}, crosshair`;
})();

export function initNebula(containerId) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  canvas = document.createElement('canvas');
  canvas.className = 'nebula-canvas';
  containerEl.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: true }); 

  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high'; // Critical for downscaling high-res sprites

  resize();
  window.addEventListener('resize', resize);

  document.addEventListener('mousemove', (e) => {
    if (!canvas) return;
    const tag = e.target.tagName;
    const isInteractive = tag === 'INPUT' || tag === 'BUTTON' || tag === 'A'
      || tag === 'SELECT' || tag === 'TEXTAREA'
      || e.target.closest('button, a, input, select, textarea, .screen-inner');
    if (isInteractive) {
      mouseX = mouseY = -1;
      if (hoveredDot) { hoveredDot = null; document.body.style.cursor = ''; }
      return;
    }
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  document.addEventListener('mouseleave', () => {
    mouseX = mouseY = -1;
    hoveredDot = null;
    document.body.style.cursor = '';
  });
  document.addEventListener('click', (e) => {
    if (!hoveredDot || !clickCallback || zoomSign == null || isHarpEnabled()) return;
    if (e.target.closest('button, a, input, select, textarea, .screen-inner')) return;
    trackNebulaInteraction('click_artist');
    
    clickCallback({ name: hoveredDot.name, genres: hoveredDot.genres });
  });

  const DRAG_SENSITIVITY = 0.25; 

  function dragStart(x) {
    if (!dragRotateEnabled || zoomSign == null) return;
    dragging = true;
    dragStartX = x;
    dragLastX = x;
    dragVelocity = 0;

    // ── ANALYTICS ──
    // Tracks that the user is manually spinning the wheel
    trackNebulaInteraction('drag_rotate');
  }

  function dragMove(x) {
    if (!dragging) return;
    const delta = (x - dragLastX) * DRAG_SENSITIVITY;
    zoomDrift += delta;
    dragVelocity = delta;
    dragLastX = x;
  }

  function dragEnd() {
    dragging = false;
  }

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    dragStart(e.clientX);
  });
  document.addEventListener('mousemove', (e) => dragMove(e.clientX));
  document.addEventListener('mouseup', dragEnd);

  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    if (e.touches.length === 1) dragStart(e.touches[0].clientX);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (dragging && e.touches.length === 1) {
      e.preventDefault();
      dragMove(e.touches[0].clientX);
    }
  }, { passive: false });
  document.addEventListener('touchend', dragEnd);
  document.addEventListener('touchcancel', dragEnd);
}

function resize() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function renderNebula(musicians) {
  dots = [];
  spriteCache.clear(); 

  for (const m of musicians) {
    if (!m.venus || !m.venus.sign) continue;

    const signIndex = SIGNS.indexOf(m.venus.sign);
    const element = ELEMENTS[m.venus.sign] || 'air';
    const [r, g, b] = ELEMENT_COLORS[element];

    const jR = nameHash(m.name, 1);
    const jA = nameHash(m.name, 2);
    const jS = nameHash(m.name, 3);

    // Angular jitter ±3°, clamped to stay within the sign's 30° sector
    const degInSign = m.venus.degree || 15;
    const jittered = degInSign + (jA - 0.5) * 6;
    const clampedDeg = signIndex * 30 + Math.max(0.5, Math.min(29.5, jittered));

    const nGenres = (m.genres || []).length;
    const genreSize = nGenres <= 1 ? 1.2 : nGenres === 2 ? 1.5 : nGenres === 3 ? 1.8 : 2.1;
    const genreAlpha = nGenres <= 1 ? 0.35 : nGenres === 2 ? 0.5 : nGenres === 3 ? 0.65 : 0.8;

    const finalSize = genreSize + jS * 0.6;
    const finalAlpha = genreAlpha + jS * 0.1;

    // Pre-generate high-res sprite
    const sprite = getDotSprite(r, g, b, finalSize, finalAlpha);
    const logicalDrawSize = sprite.width / SPRITE_SCALE;

    dots.push({
      signIndex,
      deg: clampedDeg,
      jR,
      jA: 0, // jitter already baked into clampedDeg
      r, g, b,
      size: finalSize,
      alpha: finalAlpha,
      name: m.name,
      sign: m.venus.sign,
      genres: m.genres || [],
      sprite: sprite, 
      spriteDrawSize: logicalDrawSize,
      spriteOffset: logicalDrawSize / 2
    });
  }

  if (!animId) tick();
}

export function setUserVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  userDot = { deg: longitude, r, g, b, birth: performance.now() };
  previewDot = null;
}

export function clearUserVenus() { userDot = null; }

export function setPreviewVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  previewDot = { deg: longitude, r, g, b };
}

export function clearPreviewVenus() { previewDot = null; }
export function setMoonPosition(longitude) {
  moonDot = { deg: longitude, birth: performance.now() };
}
export function onNebulaHover(callback) { hoverCallback = callback; }
export function onNebulaClick(callback) { clickCallback = callback; }
export function onRotation(callback) { rotationCallback = callback; }
export function onNeedleCross(callback) { needleCrossCallback = callback; }
export function onSignCross(callback) { signCrossCallback = callback; }

// ── Zoom control ──────────────────────────────────────────────────────────────

export function zoomToSign(signIndex, { duration = 2000, animate = true, targetDeg = null } = {}) {
  zoomSign = signIndex;
  zoomTargetDeg = targetDeg;
  zoomDrift = 0;
  hoveredDot = null;
  if (containerEl) containerEl.classList.add('is-zoomed');

  if (animate) {
    zoomRotStart = rotation;
    zoomAnimStart = performance.now();
    zoomAnimDuration = duration;
    zoomAnimating = true;
    zoomProgress = 0;
    return new Promise(r => { zoomResolve = r; });
  } else {
    zoomProgress = 1;
    zoomAnimating = false;
    return Promise.resolve();
  }
}

export function zoomOut({ duration = 1800, animate = true } = {}) {
  if (animate && zoomSign != null) {
    zoomAnimStart = performance.now();
    zoomAnimDuration = duration;
    zoomAnimating = 'out';
    zoomProgress = 1;
    return new Promise(r => { zoomResolve = r; });
  }
  zoomSign = null;
  zoomTargetDeg = null;
  zoomProgress = 0;
  zoomAnimating = false;
  if (containerEl) containerEl.classList.remove('is-zoomed');
  return Promise.resolve();
}

export function showNebula(visible) { if (containerEl) containerEl.classList.toggle('is-hidden', !visible); }
export function dimNebula(dim) { if (containerEl) containerEl.classList.toggle('is-dimmed', dim); }
export function deepDimNebula(deep) { if (containerEl) containerEl.classList.toggle('is-deep-dimmed', deep); }
export function setZoomDrift(enabled) { zoomDriftEnabled = enabled; }
export function enableDragRotate(enabled) {
  dragRotateEnabled = enabled;
  if (!enabled) { dragging = false; dragVelocity = 0; }
}

export function nudgeWheel(degrees = 15) {
  dragVelocity += degrees;
}

// ── Render loop ───────────────────────────────────────────────────────────────

// Gradient cache — rebuilt only when canvas dimensions change
let _gradW = 0, _gradH = 0;
let _centerGlow, _tealRing, _thinRing, _iconGrad, _tubeGrad, _outerFade, _metalGrad;

function tick() {
  animId = requestAnimationFrame(tick);
  if (!ctx || !canvas) return;

  const w = canvas.style.width ? parseFloat(canvas.style.width) : canvas.width;
  const h = canvas.style.height ? parseFloat(canvas.style.height) : canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const innerR = minDim * 0.28;
  const outerR = minDim * 0.44;
  const bandWidth = outerR - innerR;
  const glyphR = innerR + bandWidth * 0.70;
  const dotBand = glyphR - innerR;
  const midR = (innerR + glyphR) / 2;
  const fullMidR = (innerR + outerR) / 2;

  // Rebuild gradients only when canvas size changes
  if (w !== _gradW || h !== _gradH) {
    _gradW = w; _gradH = h;
    _centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 0.9);
    _centerGlow.addColorStop(0, 'rgba(30, 50, 80, 0.25)');
    _centerGlow.addColorStop(0.6, 'rgba(15, 25, 50, 0.1)');
    _centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    _tealRing = ctx.createLinearGradient(cx - outerR, cy, cx + outerR, cy);
    _tealRing.addColorStop(0, '#2a4a4a');
    _tealRing.addColorStop(0.3, '#a0d4d4');
    _tealRing.addColorStop(0.7, '#c8ece8');
    _tealRing.addColorStop(1, '#2a4a4a');

    _thinRing = ctx.createLinearGradient(cx - outerR, cy, cx + outerR, cy);
    _thinRing.addColorStop(0, '#3a5858');
    _thinRing.addColorStop(0.5, '#4a7070');
    _thinRing.addColorStop(1, '#3a5858');

    _iconGrad = ctx.createLinearGradient(0, 0, 0, 24);
    _iconGrad.addColorStop(0, '#2a4a4a');
    _iconGrad.addColorStop(0.5, '#c8ece8');
    _iconGrad.addColorStop(1, '#2a4a4a');

    const outerBandW = minDim * 0.018;
    _tubeGrad = ctx.createRadialGradient(cx, cy, outerR - outerBandW / 2, cx, cy, outerR + outerBandW / 2);
    _tubeGrad.addColorStop(0, '#1a3838');
    _tubeGrad.addColorStop(0.5, '#c8ece8');
    _tubeGrad.addColorStop(1, '#1a3838');

    const fadeW = outerBandW * 2.5;
    _outerFade = ctx.createRadialGradient(cx, cy, outerR + outerBandW / 2, cx, cy, outerR + outerBandW / 2 + fadeW);
    _outerFade.addColorStop(0, 'rgba(0,0,0,0.7)');
    _outerFade.addColorStop(1, 'rgba(0,0,0,0)');

    _metalGrad = ctx.createLinearGradient(0, -2, 0, 2);
    _metalGrad.addColorStop(0, '#0a1a1a');
    _metalGrad.addColorStop(0.5, '#a0d4cc');
    _metalGrad.addColorStop(1, '#0a1a1a');
  }

  ctx.clearRect(0, 0, w, h);

  // Background glow
  ctx.fillStyle = _centerGlow;
  ctx.fillRect(0, 0, w, h);

  // ── Update Logic ────────────────────────────────────────────────
  if (zoomAnimating === true) {
    const elapsed = performance.now() - zoomAnimStart;
    const raw = Math.min(1, elapsed / zoomAnimDuration);
    zoomProgress = 1 - Math.pow(1 - raw, 3);
    if (raw >= 1) {
      zoomProgress = 1;
      zoomAnimating = false;
      if (zoomResolve) { zoomResolve(); zoomResolve = null; }
    }
  } else if (zoomAnimating === 'out') {
    const elapsed = performance.now() - zoomAnimStart;
    const raw = Math.min(1, elapsed / zoomAnimDuration);
    zoomProgress = Math.pow(1 - raw, 3);
    if (raw >= 1) {
      zoomProgress = 0;
      zoomAnimating = false;
      zoomSign = null;
      zoomTargetDeg = null;
      rotation = zoomRotStart;
      if (containerEl) containerEl.classList.remove('is-zoomed');
      if (zoomResolve) { zoomResolve(); zoomResolve = null; }
    }
  }

  if (!dragging && Math.abs(dragVelocity) > 0.01) {
    zoomDrift += dragVelocity;
    dragVelocity *= 0.93;
  } else if (!dragging) {
    dragVelocity = 0;
  }

  let rot;
  if (zoomSign != null) {
    const targetRot = zoomTargetDeg != null ? zoomTargetDeg : zoomSign * 30 + 15;
    if (zoomAnimating || zoomProgress < 1) {
      let delta = targetRot - zoomRotStart;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      rot = zoomRotStart + delta * zoomProgress;
    } else {
      if (zoomDriftEnabled && !dragRotateEnabled) zoomDrift += (360 / 600) / 60;
      rot = targetRot + zoomDrift;
    }
  } else {
    rotation += (360 / 240) / 60;
    if (rotation >= 360) rotation -= 360;
    rot = rotation;
  }

  // Fire tuner callback with longitude at the 12-o'clock needle
  if (zoomSign != null && rotationCallback) {
    rotationCallback(((rot % 360) + 360) % 360);
  }

  // ── Transform ──────────────────────────────────────
  const isZoomed = zoomSign != null;
  let viewScale = 1; 
  
  // Wrap everything (Rings + Dots) in the zoom transform to guarantee alignment
  if (isZoomed) {
    const targetScale = (h * 0.85) / bandWidth;
    const s = 1 + (targetScale - 1) * zoomProgress;
    viewScale = s;
    const focusX = cx;
    const focusY = cy - fullMidR;
    const tx = (w / 2 - focusX) * zoomProgress;
    const ty = (h / 2 - focusY) * zoomProgress;
    ctx.save();
    ctx.translate(focusX + tx, focusY + ty);
    ctx.scale(s, s);
    ctx.translate(-focusX, -focusY);
  }

  // ── Tuner needle (drawn first so the ring occludes it — behind the dial) ──
  if (dragRotateEnabled && zoomSign != null) {
    ctx.save();
    const nW = Math.max(0.3, 1.2 / viewScale);

    // Glow
    ctx.beginPath();
    ctx.moveTo(cx, cy - innerR + 2 / viewScale);
    ctx.lineTo(cx, cy - outerR - 2 / viewScale);
    ctx.strokeStyle = 'rgba(192, 57, 43, 0.25)';
    ctx.lineWidth = nW * 6;
    ctx.stroke();

    // Main line
    ctx.beginPath();
    ctx.moveTo(cx, cy - innerR + 2 / viewScale);
    ctx.lineTo(cx, cy - outerR - 2 / viewScale);
    ctx.strokeStyle = 'rgba(192, 57, 43, 0.85)';
    ctx.lineWidth = nW;
    ctx.stroke();

    ctx.restore();
  }

  // ── Spokes (drawn before rings so they appear behind the dial face) ────────
  {
    ctx.fillStyle = _metalGrad;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (-(i * 30) - 90 + rot) * Math.PI / 180;
      const cA = Math.cos(angle);
      const sA = Math.sin(angle);
      // Rotate (innerR, ±1.5) and (outerR, ±0.3) around center
      ctx.moveTo(cx + innerR * cA - 1.5 * sA, cy + innerR * sA + 1.5 * cA);
      ctx.lineTo(cx + outerR * cA - 0.3 * sA, cy + outerR * sA + 0.3 * cA);
      ctx.lineTo(cx + outerR * cA + 0.3 * sA, cy + outerR * sA - 0.3 * cA);
      ctx.lineTo(cx + innerR * cA + 1.5 * sA, cy + innerR * sA - 1.5 * cA);
    }
    ctx.fill();
  }

  ctx.save();

  // ── Thick outer ring ──────────────────────────────
  const outerBandW = minDim * 0.018;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + outerBandW / 2, 0, Math.PI * 2);
  ctx.arc(cx, cy, outerR - outerBandW / 2, 0, Math.PI * 2);
  ctx.fillStyle = _tubeGrad;
  ctx.fill('evenodd');

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = _tealRing;
  ctx.lineWidth = outerBandW * 0.9;
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Dark fuzzy outer edge
  const fadeW = outerBandW * 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + outerBandW / 2 + fadeW, 0, Math.PI * 2);
  ctx.arc(cx, cy, outerR + outerBandW / 2, 0, Math.PI * 2);
  ctx.fillStyle = _outerFade;
  ctx.fill('evenodd');

  // ── Inner rings ──────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, glyphR, 0, Math.PI * 2);
  ctx.strokeStyle = _thinRing;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Ticks & Icons ────────────────────────────────
  const glyphBandW = outerR - glyphR;
  const tickInner = glyphR;
  const iconScale = glyphBandW * 0.6 / 24;
  const iconR = glyphR + glyphBandW * 0.55;

  ctx.strokeStyle = 'rgba(100,160,155,0.35)';


  for (let sign = 0; sign < 12; sign++) {
    const centerAngle = (-(sign * 30 + 15) - 90 + rot) * Math.PI / 180;
    const ix = cx + iconR * Math.cos(centerAngle);
    const iy = cy + iconR * Math.sin(centerAngle);

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(centerAngle + Math.PI / 2);
    ctx.scale(iconScale, iconScale);
    ctx.translate(-12, -12);

    ctx.strokeStyle = _iconGrad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paths = ZODIAC_PATHS[sign];
    for (let k = 0; k < paths.length; k++) {
      ctx.stroke(paths[k]);
    }
    ctx.restore();

  }

  // ── Batched tick marks (2 draw calls instead of 360) ──
  {
    const majorLen = glyphBandW * 0.25;
    const minorLen = glyphBandW * 0.15;
    const majorPath = new Path2D();
    const minorPath = new Path2D();
    for (let deg = 0; deg < 360; deg++) {
      const angle = (-deg - 90 + rot) * Math.PI / 180;
      const cA = Math.cos(angle);
      const sA = Math.sin(angle);
      const isMajor = deg % 5 === 0;
      const len = isMajor ? majorLen : minorLen;
      const path = isMajor ? majorPath : minorPath;
      path.moveTo(cx + tickInner * cA, cy + tickInner * sA);
      path.lineTo(cx + (tickInner + len) * cA, cy + (tickInner + len) * sA);
    }
    ctx.strokeStyle = 'rgba(100, 162, 155, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke(majorPath);
    ctx.lineWidth = 0.4;
    ctx.stroke(minorPath);
  }
  
  ctx.restore(); // End ring drawing

  // ── Artist dots ──────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const needleDeg = (dragRotateEnabled && zoomSign != null)
    ? ((rot % 360) + 360) % 360 : -1;

  // Sign-boundary crossing: detect when needle enters a new sign
  if (needleDeg >= 0 && signCrossCallback) {
    const curSign = Math.floor(needleDeg / 30) % 12;
    if (prevNeedleSign >= 0 && curSign !== prevNeedleSign) {
      const element = ELEMENTS[SIGNS[curSign]] || 'air';
      const speed = Math.abs(dragVelocity);
      signCrossCallback({ sign: SIGNS[curSign], element, speed });
    }
    prevNeedleSign = curSign;
  } else if (needleDeg < 0) {
    prevNeedleSign = -1;
  }

  const curOnNeedle = new Set();

  let closestDot = null;
  let closestDistSq = isZoomed ? 16 : 64;

  let hitX = mouseX, hitY = mouseY;
  if (isZoomed && mouseX >= 0) {
    const scale = viewScale;
    const focusX = cx; 
    const focusY = cy - fullMidR;
    const tx = (w / 2 - focusX) * zoomProgress;
    const ty = (h / 2 - focusY) * zoomProgress;
    hitX = (mouseX - (focusX + tx)) / scale + focusX;
    hitY = (mouseY - (focusY + ty)) / scale + focusY;
  }

  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];

    // ── BOUNDARY CLAMPING LOGIC ─────────────────────────────
    // 1. Radial Clamp: Keep dot between Inner Ring and Glyph Ring
    // Add margin (dot size + 1px)
    const margin = dot.size + 1;
    const minR = innerR + margin;
    const maxR = glyphR - margin;
    let r = innerR + dot.jR * dotBand;
    // Force r to stay within safe zone
    r = Math.max(minR, Math.min(maxR, r));

    // 2. Angular Clamp: Keep dot within its 30-degree sector
    // Convert dot size to degrees at this radius (Arc Length formula: s = r*theta -> theta = s/r)
    // We add a safety buffer of ~1.5 degrees so it doesn't touch the spoke
    const degPadding = (margin / r) * (180 / Math.PI); 
    
    const signStart = dot.signIndex * 30;
    const signEnd = (dot.signIndex + 1) * 30;
    
    // Apply jitter to original degree
    let rawDeg = dot.deg + dot.jA;
    
    // Clamp degree between (Start + Padding) and (End - Padding)
    // We must handle the 0/360 wrap-around carefully if sign is Pisces, but 
    // since dot.deg is stored as 0-360 linear, standard min/max works fine.
    const constrainedDeg = Math.max(signStart + degPadding, Math.min(signEnd - degPadding, rawDeg));
    
    // Convert to render angle
    const angle = (-(constrainedDeg) - 90 + rot) * Math.PI / 180;
    
    // Calculate final X/Y and cache on dot for label pass
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    dot._x = x; dot._y = y;
    // ────────────────────────────────────────────────────────

    // Hit Test
    if (hitX >= 0) {
      const dx = x - hitX;
      const dy = y - hitY;
      const distSq = dx*dx + dy*dy;
      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestDot = dot;
      }
    }

    const isHovered = hoveredDot === dot;

    // Needle proximity — highlight dots the red line passes through
    let isOnNeedle = false;
    if (needleDeg >= 0) {
      const angDist = Math.abs(constrainedDeg - needleDeg);
      isOnNeedle = (angDist > 180 ? 360 - angDist : angDist) < 1;
    }

    // Harp crossing detection: fire callback when dot enters needle zone
    if (isOnNeedle && !prevOnNeedle.has(i) && needleCrossCallback) {
      const rFrac = (r - innerR) / dotBand; // 0 = inner, 1 = outer
      const element = ELEMENTS[dot.sign] || 'air';
      const speed = Math.abs(dragVelocity);
      needleCrossCallback({ name: dot.name, element, radialFrac: rFrac, speed });
    }

    const isHighlighted = isHovered || isOnNeedle;

    if (dot.sprite) {
        if (isHighlighted) {
             const drawSize = isHovered ? 7 : 5;
             const grad = ctx.createRadialGradient(x - drawSize*0.35, y - drawSize*0.35, drawSize*0.05, x, y, drawSize);
             grad.addColorStop(0, `rgba(255,255,255,1)`);
             grad.addColorStop(0.5, `rgba(${dot.r},${dot.g},${dot.b},0.9)`);
             grad.addColorStop(1, `rgba(${Math.round(dot.r*0.1)},${Math.round(dot.g*0.1)},${Math.round(dot.b*0.1)},0)`);
             ctx.fillStyle = grad;
             ctx.beginPath();
             ctx.arc(x, y, drawSize, 0, Math.PI*2);
             ctx.fill();
        } else {
             ctx.drawImage(
               dot.sprite, 
               x - dot.spriteOffset, 
               y - dot.spriteOffset, 
               dot.spriteDrawSize, 
               dot.spriteDrawSize
             );
        }
    // Track needle state for crossing detection
    if (isOnNeedle) curOnNeedle.add(i);
    }
  }

  // Swap needle tracking sets
  prevOnNeedle.clear();
  for (const idx of curOnNeedle) prevOnNeedle.add(idx);
  curOnNeedle.clear();

  // Render Labels
  if (isZoomed) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      
      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        if (dot === hoveredDot) continue;
        if (dot.alpha <= 0.3) continue;

        const x = dot._x;
        const y = dot._y;
        
        ctx.font = '1.3px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.alpha})`;
        ctx.fillText(dot.name, x, y + dot.size*1.5 + 0.95);
      }
      
      // Draw Hovered Label
      if (closestDot) {
        const dot = closestDot;
        const x = dot._x;
        const y = dot._y;
        
        const degInSign = Math.round((dot.deg % 30) * 10) / 10;
        
        ctx.font = '2.2px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(dot.name, x, y + 7 + 0.8);
        ctx.font = '1.8px monospace';
        ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, 1)`;
        ctx.fillText(`${dot.sign} ${degInSign}°`, x, y + 7 + 2.8);
      }
      
      ctx.restore();
  }

  const prevHovered = hoveredDot;
  hoveredDot = closestDot;
  if (hoveredDot) {
    document.body.style.cursor = crosshairCursor;
  } else if (document.body.style.cursor) {
    document.body.style.cursor = '';
  }
  if (hoverCallback && hoveredDot !== prevHovered) {
    hoverCallback(hoveredDot ? { name: hoveredDot.name, genres: hoveredDot.genres } : null);
  }

  ctx.restore(); // End Dots save

  // ── User's Venus / Preview ──────────────────────────────
  if (previewDot && !userDot) {
    const angle = (-(previewDot.deg) - 90 + rot) * Math.PI / 180;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const breath = 0.3 + 0.15 * Math.sin(performance.now() / 600);
    const glowR = isZoomed ? 8 : 16;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    grad.addColorStop(0, `rgba(${previewDot.r}, ${previewDot.g}, ${previewDot.b}, ${breath})`);
    grad.addColorStop(1, `rgba(${previewDot.r}, ${previewDot.g}, ${previewDot.b}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  if (userDot) {
    const t = (performance.now() - userDot.birth) / 1000;
    const pulse = 1 + 0.15 * Math.sin(t * 0.8);
    const angle = (-(userDot.deg) - 90 + rot) * Math.PI / 180;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);

    const ballR = isZoomed ? 3.5 : 5.5;
    const glowR = isZoomed ? 9 : 16;
    const { r: ur, g: ug, b: ub } = userDot;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR * pulse);
    glow.addColorStop(0, `rgba(${ur}, ${ug}, ${ub}, 0.5)`);
    glow.addColorStop(1, `rgba(${ur}, ${ug}, ${ub}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, glowR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    const ball = ctx.createRadialGradient(
      x - ballR * 0.35, y - ballR * 0.35, ballR * 0.05,
      x, y, ballR
    );
    ball.addColorStop(0, `rgba(255, 255, 255, 1)`);
    ball.addColorStop(0.5, `rgba(${ur}, ${ug}, ${ub}, 0.9)`);
    ball.addColorStop(1, `rgba(${Math.round(ur * 0.1)}, ${Math.round(ug * 0.1)}, ${Math.round(ub * 0.1)}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ball;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (isZoomed) {
      ctx.font = '1.8px monospace';
      ctx.fillStyle = `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.8)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('You', x, y + glowR * pulse + 1);
    } else {
      ctx.font = '9px monospace';
      ctx.fillStyle = `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.7)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('You', x, y + glowR * pulse + 3);
    }
    ctx.restore();
  }

  // ── Moon dot ──
// ── Moon Dot (Offset 3D Style) ──
// ── Moon Dot (Consolidated Style) ──
if (moonDot) {
  const mt = (performance.now() - moonDot.birth) / 1000;
  const mPulse = 1 + 0.15 * Math.sin(mt * 0.8);
  
  const mAngle = (-(moonDot.deg) - 90 + rot) * Math.PI / 180;
  const mx = cx + midR * Math.cos(mAngle);
  const my = cy + midR * Math.sin(mAngle);

  const coreScale = isZoomed ? 0.17 : 0.45; 
  const mGlowR = isZoomed ? 20 : 50; 
  const hazeR = mGlowR * mPulse;
  
  // Lunar Blue
  const mr = 100, mg = 180, mb = 255;

  // 1. Atmosphere (Centered)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mGlow = ctx.createRadialGradient(mx, my, 0, mx, my, hazeR);
  mGlow.addColorStop(0, `rgba(254, 254, 254, 0.33)`);
  mGlow.addColorStop(0.3, `rgba(${mr}, ${mg}, ${mb}, 0.5)`);
  mGlow.addColorStop(0.6, `rgba(${mr}, ${mg}, ${mb}, 0.1)`);
  mGlow.addColorStop(1, `rgba(${mr}, ${mg}, ${mb}, 0)`);
  ctx.fillStyle = mGlow;
  ctx.beginPath();
  ctx.arc(mx, my, hazeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Shape
  ctx.save();
  ctx.globalCompositeOperation = 'source-over'; 
  ctx.translate(mx, my);
  ctx.rotate(mAngle + Math.PI / 2); 
  ctx.scale(coreScale, coreScale);
  ctx.shadowBlur = 12; 
  ctx.shadowColor = `rgba(${mr}, ${mg}, ${mb}, 0.8)`;
  ctx.drawImage(moonCanvas, -32, -32); 
  ctx.restore();

  // 3. Label (Using your exact formula)
  // Only show if zoomed (or always, if you prefer)
  if (isZoomed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    
    // Match the artist dot font size
    ctx.font = '1.3px monospace'; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Use moon color with high alpha (0.9) for readability
    ctx.fillStyle = `rgba(${mr}, ${mg}, ${mb}, 0.9)`;
    
    // FORMULA APPLIED:
    // We use 'hazeR' as the proxy for 'dot.size' since the moon is bigger
    // We assume the visual "body" is about half the haze radius
    const visualBodySize = hazeR * 0.6; 
    
    ctx.fillText("Today's Moon", mx, my + visualBodySize * 1.5 + 0.95);
    
    ctx.restore();
  }
}




  if (isZoomed) ctx.restore(); // final restore for zoom transform
}

export function destroyNebula() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (canvas) canvas.remove();
  canvas = null;
  ctx = null;
  dots = [];
  spriteCache.clear();
  userDot = null;
  previewDot = null;
  moonDot = null;
  hoveredDot = null;
  mouseX = mouseY = -1;
  zoomSign = null;
  zoomTargetDeg = null;
  rotationCallback = null;
  containerEl = null;
}