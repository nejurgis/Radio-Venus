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
let dots = [];

export function initNebula(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  canvas = document.createElement('canvas');
  canvas.className = 'nebula-canvas';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);
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
    });
  }

  if (!animId) tick();
}

export function setUserVenus(longitude, element) {
  const [r, g, b] = ELEMENT_COLORS[element] || ELEMENT_COLORS.air;
  userDot = { deg: longitude, r, g, b, birth: performance.now() };
}

export function clearUserVenus() {
  userDot = null;
}

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

  ctx.clearRect(0, 0, w, h);

  // Slow rotation: 360° in 240s
  rotation += (360 / 240) / 60; // ~60fps
  if (rotation >= 360) rotation -= 360;

  // ── Zodiac grid lines (12 sign boundaries) ─────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 12; i++) {
    const angle = ((i * 30) - 90 + rotation) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
    ctx.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
    ctx.stroke();
  }
  ctx.restore();

  // ── Artist dots ─────────────────────────────────────────────────────────
  // Use additive blending for the glow-overlap effect
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const dot of dots) {
    const angle = ((dot.deg + dot.jA) - 90 + rotation) * Math.PI / 180;
    const r = innerR + dot.jR * bandWidth;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    ctx.beginPath();
    ctx.arc(x, y, dot.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.alpha})`;
    ctx.fill();
  }

  ctx.restore();

  // ── User's Venus dot (pulsing) ──────────────────────────────────────────
  if (userDot) {
    const t = (performance.now() - userDot.birth) / 1000;
    const pulse = 1 + 0.3 * Math.sin(t * 2); // gentle pulse
    const angle = ((userDot.deg) - 90 + rotation) * Math.PI / 180;
    const midR = innerR + bandWidth * 0.5;
    const x = cx + midR * Math.cos(angle);
    const y = cy + midR * Math.sin(angle);

    // Glow halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 12 * pulse);
    grad.addColorStop(0, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.8)`);
    grad.addColorStop(0.5, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0.2)`);
    grad.addColorStop(1, `rgba(${userDot.r}, ${userDot.g}, ${userDot.b}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, 12 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Bright core
    ctx.beginPath();
    ctx.arc(x, y, 3 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
    ctx.fill();
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
}
