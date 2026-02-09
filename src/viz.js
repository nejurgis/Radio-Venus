// ── Zodiac Nebula: artist distribution ring on the portal screen ─────────────

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
let userDot = null;
let previewDot = null;  // soft glow while typing birth date
let dots = [];
let hoveredDot = null;
let mouseX = -1;
let mouseY = -1;
let zoomSign = null;       // null = full ring, sign index = zoomed
let containerEl = null;
let hoverCallback = null;  // called with { name, genres } or null
let clickCallback = null;  // called with { name, genres } when dot clicked in zoom

// Zoom animation state
let zoomProgress = 0;      // 0 = full ring, 1 = fully zoomed
let zoomAnimating = false;
let zoomAnimStart = 0;
let zoomAnimDuration = 2000;
let zoomRotStart = 0;      // rotation snapshot when animation starts
let zoomResolve = null;    // promise resolver

// Generate a minimal crosshair cursor (24×24, thin white lines with dark shadow)
const crosshairCursor = (() => {
  const s = 24, c = s / 2;
  const cur = document.createElement('canvas');
  cur.width = cur.height = s;
  const cx = cur.getContext('2d');
  // Shadow for visibility on bright dots
  cx.strokeStyle = 'rgba(0,0,0,0.5)';
  cx.lineWidth = 3;
  cx.beginPath();
  cx.moveTo(c, 4); cx.lineTo(c, s - 4);
  cx.moveTo(4, c); cx.lineTo(s - 4, c);
  cx.stroke();
  // Crisp white cross
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
  ctx = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  // Global mousemove for hover — no pointer-events needed on canvas,
  // so inputs/buttons on top always stay clickable.
  document.addEventListener('mousemove', (e) => {
    if (!canvas) return;
    // Skip hover when mouse is over interactive elements (inputs, buttons, links)
    const tag = e.target.tagName;
    const isInteractive = tag === 'INPUT' || tag === 'BUTTON' || tag === 'A'
      || tag === 'SELECT' || tag === 'TEXTAREA'
      || e.target.closest('button, a, input, select, textarea');
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
    if (!hoveredDot || !clickCallback || zoomSign == null) return;
    // Only fire if click wasn't on any UI content (track items, genre grid, etc.)
    if (e.target.closest('button, a, input, select, textarea, .screen-inner')) return;
    clickCallback({ name: hoveredDot.name, genres: hoveredDot.genres });
  });
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

  for (const m of musicians) {
    if (!m.venus || !m.venus.sign) continue;

    const signIndex = SIGNS.indexOf(m.venus.sign);
    const deg = signIndex * 30 + (m.venus.degree || 15);
    const element = ELEMENTS[m.venus.sign] || 'air';
    const [r, g, b] = ELEMENT_COLORS[element];

    // Deterministic jitter from name
    const jR = nameHash(m.name, 1);  // radial offset (0-1)
    const jA = nameHash(m.name, 2);  // angular wobble
    const jS = nameHash(m.name, 3);  // size variation

    dots.push({
      deg,
      jR,
      jA: (jA - 0.5) * 1.5, // ±0.75° angular wobble
      r, g, b,
      size: 1.2 + jS * 2,   // 1.2 - 3.2px
      alpha: 0.4 + jS * 0.3, // 0.4 - 0.7
      name: m.name,
      sign: m.venus.sign,
      genres: m.genres || [],
    });
  }

  if (!animId) tick();
}

export function setUserVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  userDot = { deg: longitude, r, g, b, birth: performance.now() };
  previewDot = null; // preview is replaced by the real dot
}

export function clearUserVenus() {
  userDot = null;
}

export function setPreviewVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  previewDot = { deg: longitude, r, g, b };
}

export function clearPreviewVenus() {
  previewDot = null;
}

export function onNebulaHover(callback) {
  hoverCallback = callback;
}

export function onNebulaClick(callback) {
  clickCallback = callback;
}

// ── Zoom control ──────────────────────────────────────────────────────────────

export function zoomToSign(signIndex, { duration = 2000, animate = true } = {}) {
  zoomSign = signIndex;
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
    // Reverse animation: progress goes from 1 → 0
    zoomAnimStart = performance.now();
    zoomAnimDuration = duration;
    zoomAnimating = 'out';
    zoomProgress = 1;
    return new Promise(r => { zoomResolve = r; });
  }
  zoomSign = null;
  zoomProgress = 0;
  zoomAnimating = false;
  if (containerEl) containerEl.classList.remove('is-zoomed');
  return Promise.resolve();
}

export function showNebula(visible) {
  if (containerEl) containerEl.classList.toggle('is-hidden', !visible);
}

// ── Render loop ───────────────────────────────────────────────────────────────

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
  const midR = (innerR + outerR) / 2;

  ctx.clearRect(0, 0, w, h);

  // ── Zoom animation update ────────────────────────────────────────────────
  if (zoomAnimating === true) {
    // Zoom in
    const elapsed = performance.now() - zoomAnimStart;
    const raw = Math.min(1, elapsed / zoomAnimDuration);
    zoomProgress = 1 - Math.pow(1 - raw, 3); // ease-out cubic
    if (raw >= 1) {
      zoomProgress = 1;
      zoomAnimating = false;
      if (zoomResolve) { zoomResolve(); zoomResolve = null; }
    }
  } else if (zoomAnimating === 'out') {
    // Zoom out (reverse)
    const elapsed = performance.now() - zoomAnimStart;
    const raw = Math.min(1, elapsed / zoomAnimDuration);
    zoomProgress = Math.pow(1 - raw, 3); // ease-in cubic (slow start, fast finish)
    if (raw >= 1) {
      zoomProgress = 0;
      zoomAnimating = false;
      zoomSign = null;
      rotation = zoomRotStart; // resume free-spin from where we locked
      if (containerEl) containerEl.classList.remove('is-zoomed');
      if (zoomResolve) { zoomResolve(); zoomResolve = null; }
    }
  }

  // Rotation: free-spin when full ring, interpolated when animating, locked when zoomed
  let rot;
  if (zoomSign != null) {
    const targetRot = zoomSign * 30 + 15;
    if (zoomAnimating || zoomProgress < 1) {
      // Smoothly rotate from free-spin angle to locked angle (shortest path)
      let delta = targetRot - zoomRotStart;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      rot = zoomRotStart + delta * zoomProgress;
    } else {
      rot = targetRot;
    }
  } else {
    rotation += (360 / 240) / 60; // ~60fps → 360° in 240s
    if (rotation >= 360) rotation -= 360;
    rot = rotation;
  }

  // ── Zoom transform (interpolated) ──────────────────────────────────────
  const isZoomed = zoomSign != null;
  if (isZoomed) {
    const targetScale = (h * 0.7) / bandWidth;
    const s = 1 + (targetScale - 1) * zoomProgress;
    const focusX = cx;
    const focusY = cy - midR;
    const tx = (w / 2 - focusX) * zoomProgress;
    const ty = (h / 2 - focusY) * zoomProgress;
    ctx.save();
    ctx.translate(focusX + tx, focusY + ty);
    ctx.scale(s, s);
    ctx.translate(-focusX, -focusY);
  }

  // ── Whole-sign sector outlines (12 annular wedges) ──────────────────────
  // Thin, crisp strokes inspired by Rudnick's ring aesthetic
  ctx.save();
  ctx.strokeStyle = isZoomed ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = isZoomed ? 0.2 : 0.2;
  for (let i = 0; i < 12; i++) {
    const a0 = (-(i * 30) - 90 + rot) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + outerR * Math.cos(a0), cy + outerR * Math.sin(a0));
    ctx.lineTo(cx + innerR * Math.cos(a0), cy + innerR * Math.sin(a0));
    ctx.stroke();
  }
  // Inner and outer ring circles — continuous thin strokes
  ctx.lineWidth = isZoomed ? 0.2 : 0.5;
  ctx.strokeStyle = isZoomed ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ── Artist dots ─────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Hit-test in both full-ring and zoomed modes
  let closestDot = null;
  let closestDist = isZoomed ? 4 : 8; // tighter threshold when zoomed (canvas space)

  // Convert mouse to canvas space when zoomed
  let hitX = mouseX, hitY = mouseY;
  if (isZoomed && mouseX >= 0) {
    const scale = (h * 0.7) / bandWidth;
    hitX = (mouseX - w / 2) / scale + cx;
    hitY = (mouseY - h / 2) / scale + (cy - midR);
  }

  for (const dot of dots) {
    const angle = (-(dot.deg + dot.jA) - 90 + rot) * Math.PI / 180;
    const r = innerR + dot.jR * bandWidth;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    // Hit-test
    if (hitX >= 0) {
      const dx = x - hitX;
      const dy = y - hitY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestDot = dot;
      }
    }

    const isHovered = hoveredDot === dot;
    // Scale up 1.5× since soft gradient edges look smaller than flat fills
    const baseSize = dot.size * 1.5;
    const drawSize = isHovered ? 7 : baseSize;
    const drawAlpha = isHovered ? 1 : dot.alpha;
    const dr = isHovered ? 255 : dot.r;
    const dg = isHovered ? 255 : dot.g;
    const db = isHovered ? 255 : dot.b;

    // Glassy "sharkot ball" gradient — hard graphic edge
    const grad = ctx.createRadialGradient(
      x - drawSize * 0.35, y - drawSize * 0.35, drawSize * 0.05,
      x, y, drawSize
    );
    const lr = Math.min(255, dr + 100);
    const lg = Math.min(255, dg + 100);
    const lb = Math.min(255, db + 100);
    grad.addColorStop(0, `rgba(255, 255, 255, ${drawAlpha})`);
    grad.addColorStop(0.2, `rgba(${lr}, ${lg}, ${lb}, ${drawAlpha * 0.95})`);
    grad.addColorStop(0.5, `rgba(${dr}, ${dg}, ${db}, ${drawAlpha * 0.9})`);
    grad.addColorStop(0.8, `rgba(${Math.round(dr * 0.5)}, ${Math.round(dg * 0.5)}, ${Math.round(db * 0.5)}, ${drawAlpha * 0.85})`);
    grad.addColorStop(0.95, `rgba(${Math.round(dr * 0.3)}, ${Math.round(dg * 0.3)}, ${Math.round(db * 0.3)}, ${drawAlpha * 0.7})`);
    grad.addColorStop(1, `rgba(${Math.round(dr * 0.1)}, ${Math.round(dg * 0.1)}, ${Math.round(db * 0.1)}, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, drawSize, 0, Math.PI * 2);
    ctx.fill();

    // Label under the dot (zoomed mode only): name + sign + degree
    if (isZoomed) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const degInSign = Math.round((dot.deg % 30) * 10) / 10;
      if (isHovered) {
        ctx.font = '2.2px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(dot.name, x, y + drawSize + 0.8);
        ctx.font = '1.8px monospace';
        ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, 1)`;
        ctx.fillText(`${dot.sign} ${degInSign}°`, x, y + drawSize + 2.8);
      } else {
        ctx.font = '1.3px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.alpha * 1})`;
        ctx.fillText(dot.name, x, y + drawSize + 0.95);
      }
      ctx.restore();
    }

  }

  const prevHovered = hoveredDot;
  hoveredDot = closestDot;
  if (hoveredDot) {
    document.body.style.cursor = crosshairCursor;
  } else if (document.body.style.cursor) {
    document.body.style.cursor = '';
  }
  // Notify listener when hovered dot changes
  if (hoverCallback && hoveredDot !== prevHovered) {
    hoverCallback(hoveredDot ? { name: hoveredDot.name, genres: hoveredDot.genres } : null);
  }

  ctx.restore();

  // ── Preview dot (soft glow while typing birth date) ────────────────────
  if (previewDot && !userDot) {
    const angle = (-(previewDot.deg) - 90 + rot) * Math.PI / 180;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Gentle breathing (slower + subtler than user dot)
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

  // ── User's Venus dot (pulsing) ──────────────────────────────────────────
  if (userDot) {
    const t = (performance.now() - userDot.birth) / 1000;
    const pulse = 1 + 0.3 * Math.sin(t * 2);
    const angle = (-(userDot.deg) - 90 + rot) * Math.PI / 180;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowR = isZoomed ? 6 : 12;
    const coreR = isZoomed ? 1.5 : 3;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR * pulse);
    grad.addColorStop(0, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.8)`);
    grad.addColorStop(0.5, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.2)`);
    grad.addColorStop(1, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, glowR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, coreR * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.restore();

    // "You" label under the user dot
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

  // Restore zoom transform
  if (isZoomed) {
    ctx.restore();
  }
}

export function destroyNebula() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  if (canvas) canvas.remove();
  canvas = null;
  ctx = null;
  dots = [];
  userDot = null;
  previewDot = null;
  hoveredDot = null;
  mouseX = mouseY = -1;
  zoomSign = null;
  containerEl = null;
}
