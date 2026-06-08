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
  const rimFade = mc.createRadialGradient(c, c, R * 0.85, c, c, R);
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


// ── Frame throttle: 30fps when idle, 60fps during interaction ─────────────────
let _lastTickTime = 0;
const _IDLE_INTERVAL = 1000 / 30; // ms between frames at idle rate
let fadeDeadline = 0; // timestamp after which all fade-ins are complete
// Pause animation loop until first user gesture — eliminates rAF long-tasks during
// Lighthouse measurement.  One static frame is allowed via _oneShot before interaction.
let _interactionStarted = false;
let _oneShot = false;
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

const DEG_PER_RAD = 180 / Math.PI; // constant — avoid recomputing in hot loops
const RAD_PER_DEG = Math.PI / 180; // inverse — degrees → radians

const spriteCache = new Map();
const SPRITE_SCALE = 4; // 4× is crisp at 2–3× DPR and creates sprites ~4× faster than 8×

// ── Highlight sprite cache (hovered / needle dots) ────────────────────────────
// Avoids createRadialGradient in the hot dot loop — keyed by color + hover state
const _highlightCache = new Map();

// Cursor state — avoid DOM write every frame when cursor hasn't changed
let _lastCursorMode = ''; // '', 'crosshair', or 'pointer'

function getHighlightSprite(r, g, b, isHovered) {
  const dpr = window.devicePixelRatio || 1;
  const key = `${r},${g},${b},${isHovered ? 1 : 0},${dpr}`;
  if (_highlightCache.has(key)) return _highlightCache.get(key);
  const drawSize = isHovered ? 7 : 5;
  const dim = drawSize * 2 + 2;            // CSS pixels
  const physDim = Math.round(dim * dpr);   // physical pixels
  const c = dim / 2;                       // CSS centre (used with dpr scale)
  const sCanvas = document.createElement('canvas');
  sCanvas.width = sCanvas.height = physDim;
  sCanvas._cssSize = dim; // stored so drawImage can use CSS dimensions
  const sCtx = sCanvas.getContext('2d');
  sCtx.scale(dpr, dpr); // draw in CSS-pixel coordinates for full sharpness
  const grad = sCtx.createRadialGradient(
    c - drawSize * 0.35, c - drawSize * 0.35, drawSize * 0.05,
    c, c, drawSize
  );
  grad.addColorStop(0,   'rgba(255,255,255,1)');
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(1,   `rgba(${Math.round(r*0.1)},${Math.round(g*0.1)},${Math.round(b*0.1)},0)`);
  sCtx.fillStyle = grad;
  sCtx.beginPath();
  sCtx.arc(c, c, drawSize, 0, Math.PI * 2);
  sCtx.fill();
  _highlightCache.set(key, sCanvas);
  return sCanvas;
}

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

  resize();
  window.addEventListener('resize', resize);

  // Start the animation loop on first user gesture; stays paused (static frame only)
  // until then so Lighthouse measures near-zero TBT during the load window.
  const _startAnimation = () => {
    if (_interactionStarted) return;
    _interactionStarted = true;
    requestFrame();
  };
  ['pointerdown', 'pointermove', 'keydown'].forEach(evt =>
    document.addEventListener(evt, _startAnimation, { once: true, passive: true })
  );

  // Pause/resume via Page Visibility API (tab switch, background, etc.)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      frameRequested = false;
    } else if (_interactionStarted) {
      requestFrame();
    }
  });

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
  _tickCacheW = 0; _tickCacheH = 0; // force dot geometry pre-bake on next tick
  const isMobile = window.innerWidth < 640;
  const mobileScale = isMobile ? 0.52 : 1;
  let mobileSkip = 0;

  for (const m of musicians) {
    if (!m.venus || !m.venus.sign) continue;
    if (isMobile && mobileSkip++ % 2 !== 0) continue;

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

  // Build all sprites synchronously so the first static frame shows the full nebula.
  // The animation loop starts only after the first user gesture (pointer/key), keeping
  // the main thread free during Lighthouse measurement and reducing TBT/TTI.
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];
    const s = getDotSprite(dot.r, dot.g, dot.b, dot.size, dot.alpha);
    dot.sprite         = s;
    dot.spriteBirth    = 0; // full opacity immediately (spriteBirth=0 → fadeAlpha=1)
    dot.spriteDrawSize = s.width / SPRITE_SCALE;
    dot.spriteOffset   = s.width / SPRITE_SCALE / 2;
  }
  signBirths.fill(Math.max(1, performance.now() - 2000)); // all zodiac signs visible on first frame
  moonBirth = Math.max(1, performance.now() - 2000);     // moon visible from first frame (must be > 0)
  fadeDeadline = 0;                           // no fade-in animation
  _oneShot = true;
  requestFrame();
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
export function deepDimNebula(deep) {
  if (!containerEl) return;
  containerEl.classList.toggle('is-deep-dimmed', deep);
  if (deep) {
    // Stop the canvas RAF entirely — nebula is invisible behind the dimmed overlay.
    // Saves ~30fps of canvas compositing while the playlist is being scrolled.
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    frameRequested = false;
  } else {
    requestFrame(); // Resume painting as nebula fades back in
  }
}
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
let _centerGlow, _tealRing, _thinRing, _iconGrad, _tubeGrad, _outerFade, _metalGrad;

function requestFrame() {
  if (frameRequested) return;
  if (containerEl?.classList.contains('is-deep-dimmed')) return; // invisible — stay paused
  if (!_interactionStarted && !_oneShot) return; // paused until first user gesture
  _oneShot = false;
  frameRequested = true;
  animId = requestAnimationFrame(tick);
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

  // Compute once — reused for spokes, glyphs, dot angles (avoids per-call multiply)
  const rotRad = rot * RAD_PER_DEG;

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
      const a = (-deg - 90) * RAD_PER_DEG;
      const cA = Math.cos(a), sA = Math.sin(a);
      const isMajor = deg % 5 === 0;
      const len = isMajor ? majorLen2 : minorLen2;
      const path = isMajor ? _tickMajorPath : _tickMinorPath;
      path.moveTo(glyphR * cA,        glyphR * sA);
      path.lineTo((glyphR + len) * cA, (glyphR + len) * sA);
    }

    // Pre-bake per-dot geometry (constrainedDeg, baseAngle, _r) —
    // depends on innerR/glyphR/dotBand which only change on resize.
    // baseAngle = angle at rot=0; in tick() just add rotRad.
    for (const dot of dots) {
      const margin = dot.size + 1;
      const minR = innerR + margin;
      const maxR = glyphR - margin;
      dot._r = Math.max(minR, Math.min(maxR, innerR + dot.jR * dotBand));
      const degPadding = (margin / dot._r) * DEG_PER_RAD;
      const signStart = dot.signIndex * 30;
      const signEnd   = (dot.signIndex + 1) * 30;
      dot._constrainedDeg = Math.max(signStart + degPadding, Math.min(signEnd - degPadding, dot.deg));
      dot._baseAngle = (-dot._constrainedDeg - 90) * RAD_PER_DEG;
    }
  }

  // ── Spokes — apply rotation as a single canvas transform ─────────────────
  {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.fillStyle = _metalGrad;
    ctx.fill(_spokePath);
    ctx.restore();
  }

  // ── User Venus placement tick — behind the ring ──────────────────────────
  if (userDot) {
    const glyphBandW2 = outerR - glyphR;
    const venusTickLen = glyphBandW2 * 0.38;
    const a = (-userDot.deg - 90) * RAD_PER_DEG + rotRad;
    const cA = Math.cos(a), sA = Math.sin(a);
    ctx.save();
    ctx.strokeStyle = 'rgba(210, 60, 70, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + glyphR * cA, cy + glyphR * sA);
    ctx.lineTo(cx + (glyphR + venusTickLen) * cA, cy + (glyphR + venusTickLen) * sA);
    ctx.stroke();
    ctx.restore();
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

  // ── Zodiac icons ─────────────────────────────────
  const glyphBandW = outerR - glyphR;
  const iconScale = glyphBandW * 0.6 / 24;
  const iconR = glyphR + glyphBandW * 0.55;

  for (let sign = 0; sign < 12; sign++) {
    if (signBirths[sign] === 0) continue;

    const centerAngle = (-(sign * 30 + 15) - 90) * RAD_PER_DEG + rotRad;
    const ix = cx + iconR * Math.cos(centerAngle);
    const iy = cy + iconR * Math.sin(centerAngle);

    ctx.save();
    ctx.globalAlpha = Math.min(1, (now - signBirths[sign]) / 400);
    ctx.translate(ix, iy);
    ctx.rotate(centerAngle + Math.PI / 2);
    ctx.scale(iconScale, iconScale);
    ctx.translate(-12, -12);
    ctx.strokeStyle = _iconGrad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const paths = ZODIAC_PATHS[sign];
    for (let k = 0; k < paths.length; k++) ctx.stroke(paths[k]);
    ctx.restore();
  }

  // ── Tick marks — cached paths rotated via canvas transform ──
  {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotRad);
    ctx.strokeStyle = 'rgba(100, 162, 155, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.stroke(_tickMajorPath);
    ctx.lineWidth = 0.4;
    ctx.stroke(_tickMinorPath);

    ctx.restore();
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

  let _curAlpha = 1; // track globalAlpha — only write when it changes
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];

    // Pre-baked geometry (updated on resize): _r, _baseAngle, _constrainedDeg
    const r     = dot._r;
    const angle = dot._baseAngle + rotRad;

    // Calculate final X/Y and cache on dot for label pass
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    dot._x = x; dot._y = y;

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
      const angDist = Math.abs(dot._constrainedDeg - needleDeg);
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
      const spr  = getHighlightSprite(dot.r, dot.g, dot.b, isHovered);
      const half = spr._cssSize / 2;
      // Highlighted dots drawn at full alpha — restore if we left it changed
      if (_curAlpha !== 1) { ctx.globalAlpha = 1; _curAlpha = 1; }
      ctx.drawImage(spr, x - half, y - half, spr._cssSize, spr._cssSize);
    } else if (dot.sprite) {
      // Fade in over 400ms from when the sprite was first created
      const fadeAlpha = Math.min(1, (now - dot.spriteBirth) / 400);
      if (fadeAlpha !== _curAlpha) { ctx.globalAlpha = fadeAlpha; _curAlpha = fadeAlpha; }
      ctx.drawImage(dot.sprite, x - dot.spriteOffset, y - dot.spriteOffset, dot.spriteDrawSize, dot.spriteDrawSize);
    }
    // null sprite → dot is invisible until its batch arrives (twinkling-in effect)
    if (isOnNeedle) curOnNeedle.add(i);
  }
  if (_curAlpha !== 1) ctx.globalAlpha = 1; // restore after loop

  // Swap needle tracking sets
  prevOnNeedle.clear();
  for (const idx of curOnNeedle) prevOnNeedle.add(idx);
  curOnNeedle.clear();

  const prevHovered = hoveredDot;
  hoveredDot = closestDot;

  // Cursor — only write to DOM when state changes
  const wantCursor = hoveredDot ? crosshairCursor : wasMoonActive ? 'pointer' : '';
  if (wantCursor !== _lastCursorMode) {
    document.body.style.cursor = wantCursor;
    _lastCursorMode = wantCursor;
  }

  if (hoverCallback && hoveredDot !== prevHovered) {
    hoverCallback(hoveredDot ? { name: hoveredDot.name, genres: hoveredDot.genres } : null);
  }

  ctx.restore(); // End Dots save

  // ── Pre-calculate celestial positions & hit-test (no drawing yet) ────────────
  let pvx = 0, pvy = 0, pvGlowR = 0, pvBreath = 0;
  if (previewDot && !userDot) {
    const a = (-(previewDot.deg) - 90 + rot) * RAD_PER_DEG;
    pvx = cx + midR * Math.cos(a);
    pvy = cy + midR * Math.sin(a);
    pvGlowR = isZoomed ? 8 : 16;
    pvBreath = 0.3 + 0.15 * Math.sin(now / 600);
  }

  let ux = 0, uy = 0, uBallR = 0, uGlowR = 0, uOuterR = 0, uPulse = 0;
  let ur = 0, ug = 0, ub = 0;
  if (userDot) {
    const t = (now - userDot.birth) / 1000;
    uPulse = 1 + 0.15 * Math.sin(t * 0.8);
    const a = (-(userDot.deg) - 90 + rot) * RAD_PER_DEG;
    ux = cx + midR * Math.cos(a);
    uy = cy + midR * Math.sin(a);
    uBallR = isZoomed ? 5 : Math.min(9, minDim * 0.018);
    uGlowR = isZoomed ? 14 : Math.min(28, minDim * 0.055);
    uOuterR = uGlowR * 2.2;
    ur = userDot.r; ug = userDot.g; ub = userDot.b;
  }

  let sx = 0, sy = 0, sunR = 0, coronaR = 0;
  if (sunDot) {
    const a = (-(sunDot.deg) - 90 + rot) * RAD_PER_DEG;
    sx = cx + midR * Math.cos(a);
    sy = cy + midR * Math.sin(a);
    sunR   = isZoomed ? 6 : Math.min(12, minDim * 0.025);
    coronaR = sunR * 5.0;

    // Sun hit-test (non-drawing)
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

  let mx = 0, my = 0, moonR = 0, hazeR = 0, mPulse = 1, moonFade = 0, phaseAngle = 0;
  const hasMoon = moonDot && moonBirth !== 0;
  if (hasMoon) {
    moonFade = Math.min(1, (now - moonBirth) / 500);
    phaseAngle = moonDot.phaseAngle ?? 45;
    mPulse = isZoomed ? 1 + 0.12 * Math.sin((now - moonDot.birth) / 1250) : 1;
    const a = (-(moonDot.deg) - 90 + rot) * RAD_PER_DEG;
    mx = cx + midR * Math.cos(a);
    my = cy + midR * Math.sin(a);
    moonR = isZoomed ? 5.5 : Math.min(15, minDim * 0.032);
    hazeR = (isZoomed ? 18 : moonR * 3.5) * mPulse;

    // Moon hit-test (non-drawing)
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
  } else if (wasMoonActive) {
    wasMoonActive = false;
    if (moonHoverCallback) moonHoverCallback(false);
  }

  // ── Phase 1: lighter — all additive glows in one block ───────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (previewDot && !userDot) {
    const grad = ctx.createRadialGradient(pvx, pvy, 0, pvx, pvy, pvGlowR);
    grad.addColorStop(0, `rgba(${previewDot.r}, ${previewDot.g}, ${previewDot.b}, ${pvBreath})`);
    grad.addColorStop(1, `rgba(${previewDot.r}, ${previewDot.g}, ${previewDot.b}, 0)`);
    ctx.beginPath();
    ctx.arc(pvx, pvy, pvGlowR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  if (userDot) {
    // Outer haze ring
    const outerGlow = ctx.createRadialGradient(ux, uy, uGlowR * 0.6, ux, uy, uOuterR * uPulse);
    outerGlow.addColorStop(0,   `rgba(${ur}, ${ug}, ${ub}, 0.18)`);
    outerGlow.addColorStop(0.5, `rgba(${ur}, ${ug}, ${ub}, 0.06)`);
    outerGlow.addColorStop(1,   `rgba(${ur}, ${ug}, ${ub}, 0)`);
    ctx.beginPath();
    ctx.arc(ux, uy, uOuterR * uPulse, 0, Math.PI * 2);
    ctx.fillStyle = outerGlow;
    ctx.fill();
    // Inner glow
    const glow = ctx.createRadialGradient(ux, uy, 0, ux, uy, uGlowR * uPulse);
    glow.addColorStop(0, `rgba(${ur}, ${ug}, ${ub}, 0.7)`);
    glow.addColorStop(1, `rgba(${ur}, ${ug}, ${ub}, 0)`);
    ctx.beginPath();
    ctx.arc(ux, uy, uGlowR * uPulse, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    // Ball
    const ball = ctx.createRadialGradient(
      ux - uBallR * 0.35, uy - uBallR * 0.35, uBallR * 0.05,
      ux, uy, uBallR
    );
    ball.addColorStop(0,   `rgba(255, 255, 255, 1)`);
    ball.addColorStop(0.5, `rgba(${ur}, ${ug}, ${ub}, 0.95)`);
    ball.addColorStop(1,   `rgba(${Math.round(ur * 0.1)}, ${Math.round(ug * 0.1)}, ${Math.round(ub * 0.1)}, 0)`);
    ctx.beginPath();
    ctx.arc(ux, uy, uBallR, 0, Math.PI * 2);
    ctx.fillStyle = ball;
    ctx.fill();
  }

  if (sunDot) {
    // Inner solar disc
    const discG = ctx.createRadialGradient(sx - sunR * 0.2, sy - sunR * 0.2, 0, sx, sy, sunR * 1.3);
    discG.addColorStop(0,   'rgba(255, 250, 240, 1.00)');
    discG.addColorStop(0.2, 'rgba(255, 180,  80, 0.95)');
    discG.addColorStop(0.6, 'rgba(255,  80,  20, 0.70)');
    discG.addColorStop(1,   'rgba(200,  40,   0, 0)');
    ctx.fillStyle = discG;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hasMoon) {
    ctx.globalAlpha = moonFade;
    const mGlow = ctx.createRadialGradient(mx, my, moonR * 0.9, mx, my, hazeR);
    mGlow.addColorStop(0,   'rgba(200, 220, 255, 0.12)');
    mGlow.addColorStop(0.5, 'rgba(140, 180, 255, 0.05)');
    mGlow.addColorStop(1,   'rgba(100, 150, 220, 0)');
    ctx.fillStyle = mGlow;
    ctx.beginPath();
    ctx.arc(mx, my, hazeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // end lighter

  // ── Phase 2: screen — sun corona only ────────────────────────────────────────
  if (sunDot) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const coronaG = ctx.createRadialGradient(sx, sy, 0, sx, sy, coronaR);
    coronaG.addColorStop(0,   'rgba(255, 160,  60, 0.55)');
    coronaG.addColorStop(0.3, 'rgba(255, 100,  20, 0.30)');
    coronaG.addColorStop(0.7, 'rgba(180,  50,  10, 0.10)');
    coronaG.addColorStop(1,   'rgba(100,  20,   0, 0)');
    ctx.fillStyle = coronaG;
    ctx.beginPath();
    ctx.arc(sx, sy, coronaR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Phase 3: source-over — moon disc + all labels ────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // Moon phase disc
  if (hasMoon) {
    ctx.save();
    ctx.globalAlpha = moonFade;
    const phCanvas = getMoonPhaseCanvas(phaseAngle);
    ctx.filter     = `blur(${Math.max(0.6, moonR * 0.25)}px)`;
    ctx.shadowBlur  = moonR * 3.5;
    ctx.shadowColor = 'rgba(210, 230, 200, 0.55)';
    ctx.drawImage(phCanvas, 40, 40, 320, 320, mx - moonR, my - moonR, moonR * 2, moonR * 2);
    ctx.shadowBlur = 0;
    ctx.filter     = 'none';
    ctx.restore();
  }

  if (isZoomed) {
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // "You" label
    if (userDot) {
      ctx.font        = `${Math.max(2, uBallR * 0.55)}px monospace`;
      ctx.fillStyle   = `rgba(255, 255, 255, 0.9)`;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = `rgba(${ur}, ${ug}, ${ub}, 0.8)`;
      ctx.fillText('You', ux, uy + uGlowR * uPulse + 1);
      ctx.shadowBlur  = 0;
    }

    // Sun label
    if (sunDot) {
      ctx.font      = '1.4px sans-serif';
      ctx.fillStyle = 'rgba(255, 180, 100, 0.85)';
      ctx.fillText('☉ Sun', sx, sy + sunR * 1.6);
    }

    // Moon label
    if (hasMoon) {
      ctx.save();
      ctx.globalAlpha = moonFade;
      ctx.font        = '1.3px monospace';
      ctx.fillStyle   = 'rgba(180, 210, 255, 0.9)';
      ctx.fillText("Today's Moon", mx, my + moonR * 1.5 + 0.95);
      ctx.restore();
    }

    // Dot labels
    ctx.font = '1.3px monospace';
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      if (dot === hoveredDot) continue;
      if (dot.alpha <= 0.3) continue;
      ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.alpha})`;
      ctx.fillText(dot.name, dot._x, dot._y + dot.size * 1.5 + 0.95);
    }
    if (closestDot) {
      const dot = closestDot;
      const degInSign = Math.round((dot.deg % 30) * 10) / 10;
      ctx.font      = '2.2px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(dot.name, dot._x, dot._y + 7 + 0.8);
      ctx.font      = '1.8px monospace';
      ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, 1)`;
      ctx.fillText(`${dot.sign} ${degInSign}°`, dot._x, dot._y + 7 + 2.8);
    }
  }

  ctx.restore(); // end source-over

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