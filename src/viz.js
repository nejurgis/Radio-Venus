// src/viz.js
import { trackNebulaInteraction } from './analytics.js';

// ── Dynamic moon phase renderer ───────────────────────────────────────────────
// Renders to an offscreen canvas sized for crisp display at any DPR.
// Cached by phase angle (quantized to 0.5° — ~720 unique phases over a lunar cycle).
let _moonPhaseCanvas = null;
let _moonPhaseCached = -1;

const getMoonPhaseCanvas = (phaseAngle) => {
  const q = Math.round(phaseAngle * 2) / 2; // 0.5° quantization for cache
  if (_moonPhaseCanvas && _moonPhaseCached === q) return _moonPhaseCanvas;
  _moonPhaseCached = q;

  // 400×400 gives sharp rendering up to ~3× DPR at the sizes we draw the moon
  const SIZE = 400;
  const R    = 160; // leave ~40px padding for the shadow bloom
  const c    = SIZE / 2;

  if (!_moonPhaseCanvas) {
    _moonPhaseCanvas = document.createElement('canvas');
    _moonPhaseCanvas.width = SIZE;
    _moonPhaseCanvas.height = SIZE;
  }

  const mc = _moonPhaseCanvas.getContext('2d');
  mc.clearRect(0, 0, SIZE, SIZE);

  const p      = q * Math.PI / 180;
  const waxing = q < 180;

  // Phase-based color temperature: crescent (near horizon) = warm gold,
  // full moon (high in sky) = cool silver-white. warmth: 1 at new, 0 at full.
  const warmth = (Math.cos(p) + 1) / 2;
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  // core:  cool (235,245,255) ↔ warm (255,252,230)
  const [cr, cg, cb] = [lerp(235,255,warmth), lerp(245,252,warmth), lerp(255,230,warmth)];
  // mid:   cool (210,225,248) ↔ warm (255,238,180)
  const [mr, mg, mb] = [lerp(210,255,warmth), lerp(225,238,warmth), lerp(248,180,warmth)];
  // outer: cool (170,200,240) ↔ warm (255,210,120)
  const [or_, og, ob] = [lerp(170,255,warmth), lerp(200,210,warmth), lerp(240,120,warmth)];
  // limb:  cool (120,160,215) ↔ warm (210,150,70)
  const [lr, lg, lb] = [lerp(120,210,warmth), lerp(160,150,warmth), lerp(215,70,warmth)];

  const litG = mc.createRadialGradient(c + R * 0.2, c - R * 0.25, R * 0.05, c, c, R);
  litG.addColorStop(0,   `rgba(${cr},  ${cg},  ${cb},  1.00)`);
  litG.addColorStop(0.3, `rgba(${mr},  ${mg},  ${mb},  0.99)`);
  litG.addColorStop(0.7, `rgba(${or_}, ${og},  ${ob},  0.95)`);
  litG.addColorStop(1,   `rgba(${lr},  ${lg},  ${lb},  0.80)`);

  // 1. Lit semicircle — pie-slice from center avoids the diameter-chord seam
  mc.beginPath();
  mc.moveTo(c, c);
  if (waxing) {
    mc.arc(c, c, R, -Math.PI / 2, Math.PI / 2, false); // right half
  } else {
    mc.arc(c, c, R, -Math.PI / 2, Math.PI / 2, true);  // left half
  }
  mc.closePath();
  mc.fillStyle = litG;
  mc.fill();

  // 2. Terminator ellipse — carves crescent (transparent dark side) or extends to gibbous
  //    Crescent cases use destination-out so the dark side is fully transparent,
  //    not an opaque disc — matching the real moon against a dark sky.
  const rx = Math.abs(Math.cos(p)) * R;
  if (rx > 0.5) {
    mc.beginPath();
    mc.ellipse(c, c, rx, R, 0, 0, Math.PI * 2);
    const isCrescent = (waxing && q < 90) || (!waxing && q >= 270);
    if (isCrescent) {
      mc.globalCompositeOperation = 'destination-out';
      mc.fillStyle = 'rgba(0, 0, 0, 1)';
    } else {
      mc.globalCompositeOperation = 'source-over';
      mc.fillStyle = litG;
    }
    mc.fill();
    mc.globalCompositeOperation = 'source-over';
  }

  // 3. Soft rim — destination-in radial mask fades edge to transparent
  mc.globalCompositeOperation = 'destination-in';
  const rimFade = mc.createRadialGradient(c, c, R * 0.92, c, c, R);
  rimFade.addColorStop(0, 'rgba(0, 0, 0, 1)');  // fully opaque inside
  rimFade.addColorStop(1, 'rgba(0, 0, 0, 0)');  // fade to transparent at edge
  mc.fillStyle = rimFade;
  mc.beginPath();
  mc.arc(c, c, R, 0, Math.PI * 2);
  mc.fill();
  mc.globalCompositeOperation = 'source-over';

  return _moonPhaseCanvas;
};
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
let frameRequested = false;

// ── FPS counter ────────────────────────────────────────────────────────────────
let _fpsEl = null;
let _fpsFrameCount = 0;
let _fpsLastTime = 0;

// ── Tick + spoke path cache (rebuilt on resize, applied with canvas rotate) ───
let _tickMajorPath = null;
let _tickMinorPath = null;
let _spokePath = null;
let _tickCacheW = 0, _tickCacheH = 0;

// ── Static rings offscreen canvas (rebuilt on resize) ─────────────────────────
let _ringsCanvas = null;

// ── Zodiac glyph sprites (built once at init) ─────────────────────────────────
let _zodiacCanvases = null;

// ── Frame throttle: 30fps when idle, 60fps during interaction ─────────────────
let _lastTickTime = 0;
const _IDLE_INTERVAL = 1000 / 30; // ms between frames at idle rate
let fadeDeadline = 0; // timestamp after which all fade-ins are complete
let rotation = 0;
let zoomDrift = 0;
let zoomDriftEnabled = false;
let userDot = null;
let previewDot = null;  // soft glow while typing birth date
let moonDot = null;     // current Moon position on the ecliptic
let sunDot  = null;     // current Sun position on the ecliptic
let dots = [];
const signBirths = new Array(12).fill(0); // timestamp per sign, 0 = not yet revealed
let moonBirth = 0;                         // timestamp for moon reveal, 0 = hidden
let hoveredDot = null;
let mouseX = -1;
let mouseY = -1;
let zoomSign = null;       // null = full ring, sign index = zoomed
let containerEl = null;
let hoverCallback = null;  // called with { name, genres } or null
let clickCallback = null;  // called with { name, genres } when dot clicked in zoom
let moonHoverCallback = null; // called with boolean when moon hover state changes
let wasMoonActive = false;
let sunHoverCallback  = null; // called with boolean when sun hover state changes
let wasSunActive  = false;
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

// Drift-reset animation state (return to Venus position without changing zoom)
let driftResetAnimating = false;
let driftResetStart = 0;
let driftResetDuration = 1800;
let driftResetFrom = 0;

// ── OPTIMIZED SPRITE GENERATOR (High-Res + Soft Glow Filter) ──────────────

const spriteCache = new Map();
const SPRITE_SCALE = 4; // 4× is crisp at 2–3× DPR and creates sprites ~4× faster than 8×

function getDotSprite(r, g, b, size, alpha) {
  // Coarser quantisation → fewer unique canvases in the cache
  const kSize  = Math.round(size  * 2) / 2;  // 0.5-step buckets
  const kAlpha = Math.round(alpha * 5) / 5;  // 0.2-step buckets
  const key = `${r},${g},${b},${kSize},${kAlpha}`;

  if (spriteCache.has(key)) return spriteCache.get(key);

  const sCanvas = document.createElement('canvas');
  const drawRadius = kSize * 1.5;
  const padding = 2;

  const dim = Math.ceil((drawRadius * 2 + padding * 2) * SPRITE_SCALE);
  const c = dim / 2;

  sCanvas.width = dim;
  sCanvas.height = dim;
  const sCtx = sCanvas.getContext('2d');

  sCtx.scale(SPRITE_SCALE, SPRITE_SCALE);
  // No ctx.filter here — the radial gradient already produces a smooth glow,
  // and the blur/saturate filter was the dominant cost in sprite creation.

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

function buildZodiacCanvases() {
  // Render each glyph at full DPR resolution so drawImage stays crisp.
  const dpr  = window.devicePixelRatio || 1;
  const PAD  = 2, ICON = 24, CSS = ICON + PAD * 2;   // 28 CSS px
  const PHYS = Math.ceil(CSS * dpr);                  // physical pixels
  _zodiacCanvases = ZODIAC_PATHS.map(paths => {
    const c = document.createElement('canvas');
    c.width = c.height = PHYS;
    const gc = c.getContext('2d');
    gc.scale(dpr, dpr);  // render in CSS coords at device resolution
    const g = gc.createLinearGradient(0, 0, 0, CSS);
    g.addColorStop(0,   '#2a4a4a');
    g.addColorStop(0.5, '#c8ece8');
    g.addColorStop(1,   '#2a4a4a');
    gc.strokeStyle = g;
    gc.lineWidth = 2;
    gc.lineCap = 'round';
    gc.lineJoin = 'round';
    gc.translate(PAD, PAD);
    for (const path of paths) gc.stroke(path);
    return c;
  });
}

export function initNebula(containerId) {
  containerEl = document.getElementById(containerId);
  if (!containerEl) return;

  canvas = document.createElement('canvas');
  canvas.className = 'nebula-canvas';
  containerEl.appendChild(canvas);
  ctx = canvas.getContext('2d', { alpha: true }); 

  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high'; // Critical for downscaling high-res sprites

  // FPS counter — toggle with ?fps or localStorage.fpsCounter='1'
  const showFps = new URLSearchParams(location.search).has('fps') ||
                  localStorage.getItem('fpsCounter') === '1';
  if (showFps) {
    _fpsEl = document.createElement('div');
    _fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;background:rgba(0,0,0,.6);' +
      'font:12px monospace;padding:2px 6px;border-radius:4px;z-index:9999;pointer-events:none';
    document.body.appendChild(_fpsEl);
  }

  buildZodiacCanvases();
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
    requestFrame();
  });
  document.addEventListener('mouseleave', () => {
    mouseX = mouseY = -1;
    hoveredDot = null;
    document.body.style.cursor = '';
    requestFrame();
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
    requestFrame();
  }

  function dragEnd() {
    dragging = false;
  }

  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, a, input, select, textarea, .screen-inner')) return;
    dragStart(e.clientX);
  });
  document.addEventListener('mousemove', (e) => dragMove(e.clientX));
  document.addEventListener('mouseup', dragEnd);

  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, a, input, select, textarea, .screen-inner')) return;
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
  // Invalidate tick cache on resize
  _tickCacheW = 0; _tickCacheH = 0;
}

export function renderNebula(musicians) {
  dots = [];
  spriteCache.clear();
  const mobileScale = window.innerWidth < 640 ? 0.52 : 1;

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

    const finalSize = (genreSize + jS * 0.6) * mobileScale;
    const finalAlpha = genreAlpha + jS * 0.1;

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
      sprite: null,       // populated lazily below
      spriteBirth: 0,     // timestamp set when sprite is ready, drives fade-in
      spriteDrawSize: 0,
      spriteOffset: 0,
    });
  }

  // Fade-in takes ~300ms lead + 884/12 batches × 32ms + 800ms fade = ~4s total
  fadeDeadline = performance.now() + 4500;

  // Start the animation loop immediately — dots are invisible until their sprite
  // arrives, then fade in, so the nebula appears without any blocking delay.
  requestFrame();

  // Zodiac glyphs twinkle in one by one in shuffled order, ~80ms apart
  signBirths.fill(0);
  const signOrder = [0,1,2,3,4,5,6,7,8,9,10,11];
  for (let i = 11; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = signOrder[i]; signOrder[i] = signOrder[j]; signOrder[j] = tmp;
  }
  signOrder.forEach((sign, i) => setTimeout(() => { signBirths[sign] = performance.now(); }, i * 80));

  // Dots start 300ms after signs so the glyphs visibly lead
  moonBirth = 0;
  const order = dots.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  let idx = 0;
  function buildBatch() {
    const end = Math.min(idx + 12, order.length);
    while (idx < end) {
      const dot = dots[order[idx++]];
      const s = getDotSprite(dot.r, dot.g, dot.b, dot.size, dot.alpha);
      dot.sprite         = s;
      dot.spriteBirth    = performance.now();
      dot.spriteDrawSize = s.width / SPRITE_SCALE;
      dot.spriteOffset   = s.width / SPRITE_SCALE / 2;
    }
    // Use setTimeout instead of rAF so sprite creation never runs in the same
    // frame as tick(), keeping the animation smooth during the reveal
    if (idx < order.length) setTimeout(buildBatch, 32);
  }
  setTimeout(buildBatch, 300);

  // Moon appears last — after signs (~960ms) and most dots (~1250ms) are visible
  setTimeout(() => { moonBirth = performance.now(); }, 1500);
}

export function setUserVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  userDot = { deg: longitude, r, g, b, birth: performance.now() };
  previewDot = null;
  requestFrame();
}

export function clearUserVenus() { userDot = null; requestFrame(); }

export function setPreviewVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  previewDot = { deg: longitude, r, g, b };
  requestFrame();
}

export function clearPreviewVenus() { previewDot = null; requestFrame(); }
export function setMoonPosition(longitude, phaseAngle = 45) {
  moonDot = { deg: longitude, phaseAngle, birth: performance.now() };
  requestFrame();
}
export function setSunPosition(longitude) {
  sunDot = { deg: longitude, birth: performance.now() };
  requestFrame();
}
export function onNebulaHover(callback) { hoverCallback = callback; }
export function onNebulaClick(callback) { clickCallback = callback; }
export function onMoonHover(callback) { moonHoverCallback = callback; }
export function onSunHover(callback)  { sunHoverCallback  = callback; }
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
    requestFrame();
    return new Promise(r => { zoomResolve = r; });
  } else {
    zoomProgress = 1;
    zoomAnimating = false;
    requestFrame();
    return Promise.resolve();
  }
}

export function zoomOut({ duration = 1800, animate = true } = {}) {
  if (animate && zoomSign != null) {
    zoomAnimStart = performance.now();
    zoomAnimDuration = duration;
    zoomAnimating = 'out';
    zoomProgress = 1;
    requestFrame();
    return new Promise(r => { zoomResolve = r; });
  }
  zoomSign = null;
  zoomTargetDeg = null;
  zoomProgress = 0;
  zoomAnimating = false;
  if (containerEl) containerEl.classList.remove('is-zoomed');
  requestFrame();
  return Promise.resolve();
}

export function showNebula(visible) { if (containerEl) containerEl.classList.toggle('is-hidden', !visible); }
export function dimNebula(dim) { if (containerEl) containerEl.classList.toggle('is-dimmed', dim); }
export function deepDimNebula(deep) { if (containerEl) containerEl.classList.toggle('is-deep-dimmed', deep); }
export function setZoomDrift(enabled) { zoomDriftEnabled = enabled; requestFrame(); }
export function resetDrift(duration = 1800) {
  if (zoomDrift === 0) return;
  driftResetFrom = zoomDrift;
  driftResetStart = performance.now();
  driftResetDuration = duration;
  driftResetAnimating = true;
  requestFrame();
}
export function enableDragRotate(enabled) {
  dragRotateEnabled = enabled;
  if (!enabled) { dragging = false; dragVelocity = 0; }
  requestFrame();
}

export function nudgeWheel(degrees = 15) {
  dragVelocity += degrees;
  requestFrame();
}

// ── Render loop ───────────────────────────────────────────────────────────────

// Gradient cache — rebuilt only when canvas dimensions change
let _gradW = 0, _gradH = 0;
let _centerGlow, _metalGrad;

function requestFrame() {
  if (!frameRequested) {
    frameRequested = true;
    animId = requestAnimationFrame(tick);
  }
}

function tick() {
  frameRequested = false;
  animId = null;
  if (!ctx || !canvas) return;

  const now = performance.now(); // cached once — used for all fade/pulse calculations

  // ── FPS counter ──────────────────────────────────────────────────────────
  if (_fpsEl) {
    _fpsFrameCount++;
    if (now - _fpsLastTime >= 1000) {
      _fpsCurrent = _fpsFrameCount;
      _fpsFrameCount = 0;
      _fpsLastTime = now;
      _fpsEl.textContent = `${_fpsCurrent} fps`;
    }
  }

  // ── Idle throttle: 30fps when nothing is animating ───────────────────────
  const isIdle = !zoomAnimating && !dragging && Math.abs(dragVelocity) < 0.01 &&
                 !driftResetAnimating && now > fadeDeadline && hoveredDot == null;
  if (isIdle) {
    const elapsed = now - _lastTickTime;
    if (elapsed < _IDLE_INTERVAL) {
      frameRequested = true;
      animId = requestAnimationFrame(tick);
      return;
    }
  }
  _lastTickTime = now;

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

    const outerBandW = minDim * 0.018;

    _metalGrad = ctx.createLinearGradient(0, -2, 0, 2);
    _metalGrad.addColorStop(0, '#0a1a1a');
    _metalGrad.addColorStop(0.5, '#a0d4cc');
    _metalGrad.addColorStop(1, '#0a1a1a');

    // ── Rebuild rings offscreen canvas at full DPR resolution ─────────────
    const dpr = window.devicePixelRatio || 1;
    if (!_ringsCanvas) _ringsCanvas = document.createElement('canvas');
    _ringsCanvas.width  = Math.ceil(w * dpr);
    _ringsCanvas.height = Math.ceil(h * dpr);
    const rc = _ringsCanvas.getContext('2d');
    rc.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS coords, render at device res

    const rc_tealRing = rc.createLinearGradient(cx - outerR, cy, cx + outerR, cy);
    rc_tealRing.addColorStop(0, '#2a4a4a');
    rc_tealRing.addColorStop(0.3, '#a0d4d4');
    rc_tealRing.addColorStop(0.7, '#c8ece8');
    rc_tealRing.addColorStop(1, '#2a4a4a');

    const rc_thinRing = rc.createLinearGradient(cx - outerR, cy, cx + outerR, cy);
    rc_thinRing.addColorStop(0, '#3a5858');
    rc_thinRing.addColorStop(0.5, '#4a7070');
    rc_thinRing.addColorStop(1, '#3a5858');

    const rc_tubeGrad = rc.createRadialGradient(cx, cy, outerR - outerBandW / 2, cx, cy, outerR + outerBandW / 2);
    rc_tubeGrad.addColorStop(0, '#1a3838');
    rc_tubeGrad.addColorStop(0.5, '#c8ece8');
    rc_tubeGrad.addColorStop(1, '#1a3838');

    const rc_fadeW = outerBandW * 2.5;
    const rc_outerFade = rc.createRadialGradient(cx, cy, outerR + outerBandW / 2, cx, cy, outerR + outerBandW / 2 + rc_fadeW);
    rc_outerFade.addColorStop(0, 'rgba(0,0,0,0.7)');
    rc_outerFade.addColorStop(1, 'rgba(0,0,0,0)');

    // Outer tube ring
    rc.beginPath();
    rc.arc(cx, cy, outerR + outerBandW / 2, 0, Math.PI * 2);
    rc.arc(cx, cy, outerR - outerBandW / 2, 0, Math.PI * 2);
    rc.fillStyle = rc_tubeGrad;
    rc.fill('evenodd');

    rc.beginPath();
    rc.arc(cx, cy, outerR, 0, Math.PI * 2);
    rc.strokeStyle = rc_tealRing;
    rc.lineWidth = outerBandW * 0.9;
    rc.globalAlpha = 0.3;
    rc.stroke();
    rc.globalAlpha = 1;

    // Outer fade
    rc.beginPath();
    rc.arc(cx, cy, outerR + outerBandW / 2 + rc_fadeW, 0, Math.PI * 2);
    rc.arc(cx, cy, outerR + outerBandW / 2, 0, Math.PI * 2);
    rc.fillStyle = rc_outerFade;
    rc.fill('evenodd');

    // Inner rings
    rc.beginPath();
    rc.arc(cx, cy, glyphR, 0, Math.PI * 2);
    rc.strokeStyle = rc_thinRing;
    rc.lineWidth = 1.5;
    rc.stroke();

    rc.beginPath();
    rc.arc(cx, cy, innerR, 0, Math.PI * 2);
    rc.lineWidth = 2;
    rc.stroke();
  }

  ctx.clearRect(0, 0, w, h);

  // Background glow
  ctx.fillStyle = _centerGlow;
  ctx.fillRect(0, 0, w, h);

  // ── Update Logic ────────────────────────────────────────────────
  if (zoomAnimating === true) {
    const elapsed = now - zoomAnimStart;
    const raw = Math.min(1, elapsed / zoomAnimDuration);
    zoomProgress = 1 - Math.pow(1 - raw, 3);
    if (raw >= 1) {
      zoomProgress = 1;
      zoomAnimating = false;
      if (zoomResolve) { zoomResolve(); zoomResolve = null; }
    }
  } else if (zoomAnimating === 'out') {
    const elapsed = now - zoomAnimStart;
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

  if (driftResetAnimating) {
    const raw = Math.min(1, (now - driftResetStart) / driftResetDuration);
    const t = 1 - Math.pow(1 - raw, 3); // ease-out cubic
    zoomDrift = driftResetFrom * (1 - t);
    dragVelocity = 0;
    if (raw >= 1) { zoomDrift = 0; driftResetAnimating = false; }
  } else if (!dragging && Math.abs(dragVelocity) > 0.01) {
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

  // ── Build tick + spoke Path2D cache (rot=0, centered at origin) ─────────
  if (w !== _tickCacheW || h !== _tickCacheH) {
    _tickCacheW = w; _tickCacheH = h;

    // Spokes (12 trapezoids)
    _spokePath = new Path2D();
    for (let i = 0; i < 12; i++) {
      const a = (-(i * 30) - 90) * Math.PI / 180;
      const cA = Math.cos(a), sA = Math.sin(a);
      _spokePath.moveTo(innerR * cA - 1.5 * sA, innerR * sA + 1.5 * cA);
      _spokePath.lineTo(outerR * cA - 0.3 * sA, outerR * sA + 0.3 * cA);
      _spokePath.lineTo(outerR * cA + 0.3 * sA, outerR * sA - 0.3 * cA);
      _spokePath.lineTo(innerR * cA + 1.5 * sA, innerR * sA - 1.5 * cA);
    }

    // Tick marks (360 lines, major every 5°)
    const glyphBandW2 = outerR - glyphR;
    const majorLen2 = glyphBandW2 * 0.25;
    const minorLen2 = glyphBandW2 * 0.15;
    _tickMajorPath = new Path2D();
    _tickMinorPath = new Path2D();
    for (let deg = 0; deg < 360; deg++) {
      const a = (-deg - 90) * Math.PI / 180;
      const cA = Math.cos(a), sA = Math.sin(a);
      const isMajor = deg % 5 === 0;
      const len = isMajor ? majorLen2 : minorLen2;
      const path = isMajor ? _tickMajorPath : _tickMinorPath;
      path.moveTo(glyphR * cA,        glyphR * sA);
      path.lineTo((glyphR + len) * cA, (glyphR + len) * sA);
    }
  }

  // ── Spokes — apply rotation as a single canvas transform ─────────────────
  {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.fillStyle = _metalGrad;
    ctx.fill(_spokePath);
    ctx.restore();
  }

  // ── Static rings: single drawImage (pre-rendered on resize) ─────────────
  const outerBandW = minDim * 0.018;
  if (_ringsCanvas) ctx.drawImage(_ringsCanvas, 0, 0, w, h);

  // ── Zodiac icons + ticks — both need rotation, share one transform block ──
  {
    const glyphBandW = outerR - glyphR;
    const iconScale  = glyphBandW * 0.6 / 24;
    const iconR      = glyphR + glyphBandW * 0.55;
    const SPRITE_SZ  = 28; // 24px icon + 2px padding each side
    const HALF_SZ    = SPRITE_SZ / 2;

    for (let sign = 0; sign < 12; sign++) {
      if (signBirths[sign] === 0) continue;
      const alpha = Math.min(1, (now - signBirths[sign]) / 400);
      const centerAngle = (-(sign * 30 + 15) - 90 + rot) * Math.PI / 180;
      const ix = cx + iconR * Math.cos(centerAngle);
      const iy = cy + iconR * Math.sin(centerAngle);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(ix, iy);
      ctx.rotate(centerAngle + Math.PI / 2);
      ctx.scale(iconScale, iconScale);
      ctx.drawImage(_zodiacCanvases[sign], -HALF_SZ, -HALF_SZ);
      ctx.restore();
    }

    // Ticks share the same rotation — one combined transform
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.strokeStyle = 'rgba(100, 162, 155, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke(_tickMajorPath);
    ctx.lineWidth = 0.4;
    ctx.stroke(_tickMinorPath);
    ctx.restore();
  }

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

    if (isHighlighted) {
      const drawSize = isHovered ? 7 : 5;
      const grad = ctx.createRadialGradient(x - drawSize*0.35, y - drawSize*0.35, drawSize*0.05, x, y, drawSize);
      grad.addColorStop(0,   'rgba(255,255,255,1)');
      grad.addColorStop(0.5, `rgba(${dot.r},${dot.g},${dot.b},0.9)`);
      grad.addColorStop(1,   `rgba(${Math.round(dot.r*0.1)},${Math.round(dot.g*0.1)},${Math.round(dot.b*0.1)},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, drawSize, 0, Math.PI*2);
      ctx.fill();
    } else if (dot.sprite) {
      // Fade in over 400ms from when the sprite was first created
      const fadeAlpha = Math.min(1, (now - dot.spriteBirth) / 400);
      ctx.globalAlpha = fadeAlpha;
      ctx.drawImage(dot.sprite, x - dot.spriteOffset, y - dot.spriteOffset, dot.spriteDrawSize, dot.spriteDrawSize);
      ctx.globalAlpha = 1;
    }
    // null sprite → dot is invisible until its batch arrives (twinkling-in effect)
    if (isOnNeedle) curOnNeedle.add(i);
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
  } else if (wasMoonActive) {
    document.body.style.cursor = 'pointer';
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
    const breath = 0.3 + 0.15 * Math.sin(now / 600);
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
    const t = (now - userDot.birth) / 1000;
    const pulse = 1 + 0.15 * Math.sin(t * 0.8);
    const angle = (-(userDot.deg) - 90 + rot) * Math.PI / 180;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);

    const ballR = isZoomed ? 5 : Math.min(9, minDim * 0.018);
    const glowR = isZoomed ? 14 : Math.min(28, minDim * 0.055);
    const outerR = glowR * 2.2;
    const { r: ur, g: ug, b: ub } = userDot;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Outer haze ring
    const outerGlow = ctx.createRadialGradient(x, y, glowR * 0.6, x, y, outerR * pulse);
    outerGlow.addColorStop(0,   `rgba(${ur}, ${ug}, ${ub}, 0.18)`);
    outerGlow.addColorStop(0.5, `rgba(${ur}, ${ug}, ${ub}, 0.06)`);
    outerGlow.addColorStop(1,   `rgba(${ur}, ${ug}, ${ub}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, outerR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();

    // Inner glow
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR * pulse);
    glow.addColorStop(0, `rgba(${ur}, ${ug}, ${ub}, 0.7)`);
    glow.addColorStop(1, `rgba(${ur}, ${ug}, ${ub}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, glowR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Ball
    const ball = ctx.createRadialGradient(
      x - ballR * 0.35, y - ballR * 0.35, ballR * 0.05,
      x, y, ballR
    );
    ball.addColorStop(0, `rgba(255, 255, 255, 1)`);
    ball.addColorStop(0.5, `rgba(${ur}, ${ug}, ${ub}, 0.95)`);
    ball.addColorStop(1, `rgba(${Math.round(ur * 0.1)}, ${Math.round(ug * 0.1)}, ${Math.round(ub * 0.1)}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ball;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    if (isZoomed) {
      ctx.font = `${Math.max(2, ballR * 0.55)}px monospace`;
      ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(${ur}, ${ug}, ${ub}, 0.8)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('You', x, y + glowR * pulse + 1);
    } else {
      ctx.font = '10px monospace';
      ctx.fillStyle = `rgba(255, 255, 255, 0.85)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${ur}, ${ug}, ${ub}, 0.9)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('You', x, y + glowR * pulse + 3);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

// ── Sun dot ──────────────────────────────────────────────────────────────────
if (sunDot) {
  const sAngle = (-(sunDot.deg) - 90 + rot) * Math.PI / 180;
  const sx = cx + midR * Math.cos(sAngle);
  const sy = cy + midR * Math.sin(sAngle);

  const sunR   = isZoomed ? 6 : Math.min(12, minDim * 0.025);
  const coronaR = sunR * 5.0;

  // 1. Outer Corona Haze (Warm Burnt Orange)
  ctx.save();
  ctx.globalCompositeOperation = 'screen'; 
  const coronaG = ctx.createRadialGradient(sx, sy, 0, sx, sy, coronaR);
  coronaG.addColorStop(0,   'rgba(255, 160,  60, 0.55)'); // Golden-orange
  coronaG.addColorStop(0.3, 'rgba(255, 100,  20, 0.30)'); // Deep orange
  coronaG.addColorStop(0.7, 'rgba(180,  50,  10, 0.10)'); // Soft rust/red-orange
  coronaG.addColorStop(1,   'rgba(100,  20,   0, 0)');
  ctx.fillStyle = coronaG;
  ctx.beginPath();
  ctx.arc(sx, sy, coronaR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Inner Solar Disc (White core bleeding into golden-fire)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; 
  const discG = ctx.createRadialGradient(sx - sunR * 0.2, sy - sunR * 0.2, 0, sx, sy, sunR * 1.3);
  discG.addColorStop(0,   'rgba(255, 250, 240, 1.00)'); // Bright hot core
  discG.addColorStop(0.2, 'rgba(255, 180,  80, 0.95)'); // Bright gold
  discG.addColorStop(0.6, 'rgba(255,  80,  20, 0.70)'); // Fiery orange
  discG.addColorStop(1,   'rgba(200,  40,   0, 0)');    // Fade into background
  ctx.fillStyle = discG;
  ctx.beginPath();
  ctx.arc(sx, sy, sunR * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Label
  if (isZoomed) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.font         = '1.4px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = 'rgba(255, 180, 100, 0.85)'; // Warm gold text
    ctx.fillText('☉ Sun', sx, sy + sunR * 1.6);
    ctx.restore();
  }

  // Sun active: mouse proximity OR needle alignment
  const sunHitR = 3;
  const sdx = hitX - sx, sdy = hitY - sy;
  const isMouseOnSun  = mouseX >= 0 && (sdx * sdx + sdy * sdy) < sunHitR * sunHitR;
  const sunAngDist    = Math.abs(sunDot.deg - needleDeg);
  const isNeedleOnSun = needleDeg >= 0 && (sunAngDist > 180 ? 360 - sunAngDist : sunAngDist) < 5;
  const nowSunActive  = isMouseOnSun || isNeedleOnSun;
  if (nowSunActive !== wasSunActive) {
    wasSunActive = nowSunActive;
    if (sunHoverCallback) sunHoverCallback(nowSunActive);
  }
} else if (wasSunActive) {
  wasSunActive = false;
  if (sunHoverCallback) sunHoverCallback(false);
}

  // ── Moon dot ─────────────────────────────────────────────────────────────────
  if (moonDot && moonBirth > 0) {
    const moonFade = Math.min(1, (now - moonBirth) / 500);
    ctx.save();
    ctx.globalAlpha = moonFade; // all sub-saves inherit this; restored at the end
    const phaseAngle = moonDot.phaseAngle ?? 45;
    // Pulse only when zoomed — on the rotating full ring it makes the moon look nervous
    const mPulse = isZoomed
      ? 1 + 0.12 * Math.sin((now - moonDot.birth) / 1250)
      : 1;

    const mAngle = (-(moonDot.deg) - 90 + rot) * Math.PI / 180;
    const mx = cx + midR * Math.cos(mAngle);
    const my = cy + midR * Math.sin(mAngle);

    // Moon active: mouse proximity OR needle alignment (works on mobile too)
    const moonHitR = 3;
    const mdx = hitX - mx, mdy = hitY - my;
    const isMouseOnMoon = mouseX >= 0 && (mdx * mdx + mdy * mdy) < moonHitR * moonHitR;
    const moonAngDist = Math.abs(moonDot.deg - needleDeg);
    const isNeedleOnMoon = needleDeg >= 0 && (moonAngDist > 180 ? 360 - moonAngDist : moonAngDist) < 5;
    const nowMoonActive = isMouseOnMoon || isNeedleOnMoon;
    if (nowMoonActive !== wasMoonActive) {
      wasMoonActive = nowMoonActive;
      if (moonHoverCallback) moonHoverCallback(nowMoonActive);
    }

    // moonR: scale with canvas size so it's reasonable on small phone screens
    const moonR = isZoomed ? 5.5 : Math.min(15, minDim * 0.032);
    const hazeR = (isZoomed ? 18 : moonR * 3.5) * mPulse;

    // 1. Faint atmospheric halo — center stays dark, just a soft ring at the edges
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mGlow = ctx.createRadialGradient(mx, my, moonR * 0.9, mx, my, hazeR);
    mGlow.addColorStop(0,   'rgba(200, 220, 255, 0.12)');
    mGlow.addColorStop(0.5, 'rgba(140, 180, 255, 0.05)');
    mGlow.addColorStop(1,   'rgba(100, 150, 220, 0)');
    ctx.fillStyle = mGlow;
    ctx.beginPath();
    ctx.arc(mx, my, hazeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Phase disc — blurred so the boundary dissolves into the surrounding haze
    // phCanvas is 400×400 with an inner radius of 160; we crop the 320×320 centre
    const phCanvas = getMoonPhaseCanvas(phaseAngle);
    ctx.save();
    ctx.filter               = `blur(${Math.max(0.6, moonR * 0.25)}px)`;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur           = moonR * 3.5;
    ctx.shadowColor          = 'rgba(210, 230, 200, 0.55)';
    ctx.drawImage(phCanvas, 40, 40, 320, 320, mx - moonR, my - moonR, moonR * 2, moonR * 2);
    ctx.shadowBlur = 0;
    ctx.filter     = 'none';
    ctx.restore();

    // 4. Label
    if (isZoomed) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font         = '1.3px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = 'rgba(180, 210, 255, 0.9)';
      ctx.fillText("Today's Moon", mx, my + moonR * 1.5 + 0.95);
      ctx.restore();
    }
    ctx.restore(); // restore moonFade globalAlpha
  } else if (wasMoonActive) {
    wasMoonActive = false;
    if (moonHoverCallback) moonHoverCallback(false);
  }


  if (isZoomed) ctx.restore(); // final restore for zoom transform

  // ── Schedule next frame only if something still needs updating ───────────
  const perpetual =
    zoomSign === null ||                              // unzoomed ring always rotates
    (zoomDriftEnabled && !dragRotateEnabled) ||       // music playing — auto-drift (playlist bg)
    dragging ||                                       // active drag
    Math.abs(dragVelocity) > 0.01 ||                  // inertia still decaying
    zoomAnimating !== false ||                        // zoom animation in progress
    driftResetAnimating ||                            // drift-reset animation
    !!previewDot ||                                   // preview dot pulses
    !!userDot ||                                      // user Venus dot breathes continuously
    !!moonDot ||                                      // moon dot pulses
    now < fadeDeadline;                               // fade-in still running
  if (perpetual) requestFrame();
  // else: idle — loop stops. requestFrame() called again by any state-changing export.
}

export function destroyNebula() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (canvas) canvas.remove();
  canvas = null;
  ctx = null;
  dots = [];
  signBirths.fill(0);
  moonBirth = 0;
  spriteCache.clear();
  userDot = null;
  previewDot = null;
  moonDot = null;
  sunDot  = null;
  hoveredDot = null;
  mouseX = mouseY = -1;
  zoomSign = null;
  zoomTargetDeg = null;
  rotationCallback = null;
  containerEl = null;
}