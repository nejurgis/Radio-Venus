// ── /astrochord/ page: the birth chart drawn on the circle of fifths and played
//
// The wheel is the zodiac in its natural order with Aries at the top. Planets
// sit at their real ecliptic degree; a spoke joins each one to the note of its
// sign. "Play planet by planet" plays every planet's note in turn, lighting it
// up, then strums the whole chord.
//
// Compatibility mode turns it into a bi-wheel: your planets inside the note
// ring, theirs outside it, played side by side (you panned left, them right).

import { calculateChartChord, ascendantLongitude, FAR_PLANETS, SIGNS, TUNINGS, signNoteName } from './chord.js';
import { ZONE_COORDS } from './zone-coords.js';
import { strum, stopStrum, STRUM_LEAD, beginPlayback, endPlayback, audioNow, playNoteAt } from './harp.js';
import { makeBirthDate } from './venus.js';
import { trackChordPage, trackOutboundClick } from './analytics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ELEMENTS = ['fire', 'earth', 'air', 'water'];          // by signIndex % 4
const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => `${g}︎`);
const ASPECTS = ['conjunct', 'semi-sextile', 'sextile', 'square', 'trine', 'quincunx', 'opposite'];
// Ptolemy's five; the semi-sextile and quincunx are "in aversion" in traditional astrology
const TRADITIONAL_ASPECTS = new Set(['conjunct', 'sextile', 'square', 'trine', 'opposite']);
const ASPECT_FEEL = { sextile: 'flowing', trine: 'flowing', square: 'tense', opposite: 'tense' };
const INTERVALS = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
];
const INTERVALS_UP = [...INTERVALS, 'octave'];
// Index = semitones (0–12). Short tag + one line, for the two-birthday reading.
const INTERVAL_CHARACTER = [
  ['kindred', 'The same note. Instant recognition and shared ground: little friction, little contrast.'],
  ['friction', 'A half step, the most grating rub in music: a catalytic pull that keeps you both changing.'],
  ['restless', 'A whole step: curious and a little tense; you keep nudging each other forward.'],
  ['tender', 'The colour of a minor chord: intimate, moody, a little melancholy.'],
  ['bright', 'The sweetness of a major chord: warm, easy affection you can lean on.'],
  ['open', 'Open and suspended. Like-minded, with one of you always reaching to resolve.'],
  ['magnetic', "The devil's interval: electric, unsettled, impossible to ignore."],
  ['steady', 'After the octave, the most consonant pair: stable, supportive, built to last.'],
  ['bittersweet', 'Yearning and bittersweet: depth, nostalgia, a pull toward the past.'],
  ['generous', 'Open-hearted and buoyant: lift, play and comfort.'],
  ['cool', 'Bluesy and unresolved: independent, at ease with a little distance.'],
  ['dreamy', 'Almost home: a shimmer of longing just short of the octave.'],
  ['mirror', 'The same note an octave apart: mirror images, one higher, one lower.'],
];
const BETWEEN_TEXT = 'Microtonal: it sits between the keys, a colour neither neighbouring interval names on its own.';
const MICROTONE_LIMIT = 25;   // more than this many cents off a key → "between" two intervals

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Wheel geometry
const R_NODE = 172;       // note circles sit on this ring, one per sign
const NODE_R = 17;
const R_GLYPH = 207;      // sign glyphs outside the ring
const PLANET_ORBITS = [130, 102, 74, 46];   // your planets, inside the ring; crowded ones step inward
const PARTNER_ORBITS = [242, 268];          // theirs, outside it (compatibility mode)
const VIEW_SINGLE = '-230 -230 460 460';
const VIEW_PAIR = '-292 -292 584 584';
const PLANET_R = 12;
const PLANET_GAP = PLANET_R * 2 + 3;   // min centre distance between two planets
const NUDGE_DEG = [6, -6, 12, -12, 18, -18];   // last resort for big stelliums

// Walk-through timing (seconds)
const STEP_PERSONAL = 0.75;
const STEP_OUTER = 0.5;
const PAUSE_BEFORE_CHORD = 0.6;
// Compatibility mode: your planet, then theirs a beat later; then both chords
const STEP_PAIR_PERSONAL = 1.0;
const STEP_PAIR_OUTER = 0.7;
const PAIR_OFFSET = 0.32;
const CHORD_GAP = 1.7;
const PAN = 0.6;          // you left, them right

const el = {
  form: document.getElementById('cp-form'),
  date: document.getElementById('cp-date'),
  wheel: document.getElementById('cp-wheel'),
  now: document.getElementById('cp-now'),
  when: document.getElementById('cp-when'),
  chordName: document.getElementById('cp-chord-name'),
  playWalk: document.getElementById('cp-play-walk'),
  playChord: document.getElementById('cp-play-chord'),
  playYou: document.getElementById('cp-play-you'),
  playThem: document.getElementById('cp-play-them'),
  list: document.getElementById('cp-planets'),
  tuningButtons: [...document.querySelectorAll('.cp-tuning-btn')],
  voicingButtons: [...document.querySelectorAll('.cp-voicing-btn')],
  chordCaption: document.getElementById('cp-chord-caption'),
  aspectLegend: document.getElementById('cp-aspect-legend'),
  title: document.getElementById('cp-title'),
  dateLabel: document.getElementById('cp-date-label'),
  modeButtons: [...document.querySelectorAll('.cp-mode-btn')],
  themField: document.querySelector('.cp-them-field'),
  pairDate: document.getElementById('cp-pair-date'),
  timeToggle: document.getElementById('cp-time-toggle'),
  timeFields: [...document.querySelectorAll('.cp-time-fields')],
  time: document.getElementById('cp-time'),
  tz: document.getElementById('cp-tz'),
  pairTime: document.getElementById('cp-pair-time'),
  pairTz: document.getElementById('cp-pair-tz'),
  chordThem: document.getElementById('cp-chord-them'),
  pairSection: document.getElementById('cp-pair'),
  pairLede: document.getElementById('cp-pair-lede'),
  pairResult: document.getElementById('cp-pair-result'),
  pairPlay: document.getElementById('cp-pair-play'),
  arpToggle: document.getElementById('cp-arp-toggle'),
  arpTempo: document.getElementById('cp-arp-tempo'),
  arpBpm: document.getElementById('cp-arp-bpm'),
  arpPattern: document.getElementById('cp-arp-pattern'),
  arpRepeats: document.getElementById('cp-arp-repeats'),
  arpOuter: document.getElementById('cp-arp-outer'),
};

let chart = null;          // result of calculateChartChord
let tuning = 'fifths';     // key of TUNINGS — the one in effect
// Each mode has its own default: a single chart sounds best on the circle of
// fifths; compatibility readings follow the chromatic Musical Astrology system
// (it's the one whose relationship intervals match their app). An explicit
// pick on the switch is remembered per mode.
const DEFAULT_TUNING = { single: 'fifths', pair: 'chromatic' };
const tuningChoice = { single: null, pair: null };
let shown = null;          // { iso, isToday } currently on screen
let partner = null;        // { iso, chart, markers } — the other birthday, kept even in single mode
let mode = 'single';       // 'single' | 'pair' (compatibility)
let voicing = 'classic';   // 'classic' (Sun root, Venus on top) | 'orbit' (slow = low)
const VOICING_CAPTION = {
  classic: 'the Sun is the root · Venus sings on top · outer planets shimmer above',
  orbit: 'slow planets low, fast planets high · Pluto, Neptune, Uranus in the bass · the Moon on top',
};
let exactTime = false;     // use birth times instead of noon UTC
let venusElement = 'air';
let themElement = 'water'; // their Venus element → their timbre
const cueTimers = new Set();
let arp = null;           // running arpeggiator state, see startArp()
// Planets switched out of the arpeggio (by key). The outer-three box toggles
// Uranus, Neptune and Pluto here; walks and chords also honour those three.
const arpExcluded = new Set();
const layers = {};

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Ecliptic longitude → [x, y] on the wheel, Aries centred at the top, clockwise. */
function polar(r, longitude) {
  const rad = ((longitude - 15) * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

const signCentre = signIndex => signIndex * 30 + 15;
const elementOf = signIndex => ELEMENTS[signIndex % 4];

const escapeHTML = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Chord names may only wrap before "(" or after a comma, so a token like ♭13 never splits. */
function setChordText(node, text) {
  node.innerHTML = escapeHTML(text).replace(/\(/g, '<wbr>(').replace(/,/g, ',<wbr>');
}

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Find a spot for each planet: its true degree on the first orbit, moving to
 * the next orbit while it would touch an already-placed planet. Only if every
 * orbit is taken (a big stellium) is it nudged a few degrees sideways.
 */
function placePlanets(planets, orbits, taken = []) {
  const free = ([x, y]) => taken.every(([tx, ty]) => Math.hypot(tx - x, ty - y) >= PLANET_GAP);
  for (const p of [...planets].sort((a, b) => a.longitude - b.longitude)) {
    let spot = null;
    for (const nudge of [0, ...NUDGE_DEG]) {
      for (const r of orbits) {
        const candidate = polar(r, p.longitude + nudge);
        if (free(candidate)) { spot = candidate; break; }
      }
      if (spot) break;
    }
    p.pos = spot || polar(orbits[0], p.longitude);
    taken.push(p.pos);
  }
}

// ── Static wheel: symmetric figures, ring, note nodes, sign glyphs ──────────

function drawWheel() {
  svg('circle', { class: 'cp-ring', r: R_NODE }, el.wheel);
  for (let i = 0; i < 12; i++) {
    const [x1, y1] = polar(R_NODE - 7, i * 30);
    const [x2, y2] = polar(R_NODE + 7, i * 30);
    svg('line', { class: 'cp-tick', x1, y1, x2, y2 }, el.wheel);
  }

  layers.shape = svg('g', { class: 'cp-shape-layer' }, el.wheel);
  layers.aspects = svg('g', { class: 'cp-aspect-layer' }, el.wheel);
  layers.spokes = svg('g', { class: 'cp-spokes' }, el.wheel);

  layers.nodes = svg('g', { class: 'cp-nodes' }, el.wheel);
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(R_NODE, signCentre(i));
    const node = svg('g', {
      class: 'cp-node',
      'data-sign': i,
      style: `--el: var(--${elementOf(i)})`,
    }, layers.nodes);
    svg('circle', { class: 'cp-halo', cx: x, cy: y, r: NODE_R + 9 }, node);
    svg('circle', { class: 'cp-dot', cx: x, cy: y, r: NODE_R }, node);
    const label = svg('text', { x, y }, node);
    label.dataset.sign = i;

    const [gx, gy] = polar(R_GLYPH, signCentre(i));
    const glyph = svg('text', { class: 'cp-sign-glyph', x: gx, y: gy, style: `--el: var(--${elementOf(i)})` }, layers.nodes);
    glyph.textContent = SIGN_GLYPHS[i];
    svg('title', {}, glyph).textContent = SIGNS[i];
  }

  layers.pair = svg('g', { class: 'cp-pair-layer' }, el.wheel);
  layers.planets = svg('g', { class: 'cp-planet-layer' }, el.wheel);
}

function labelNotes() {
  layers.nodes.querySelectorAll('text[data-sign]').forEach(t => {
    t.textContent = signNoteName(Number(t.dataset.sign), tuning);
  });
}

// ── Chart-specific layers: chord shape, spokes, planets ─────────────────────

function allPlanets() {
  return [...chart.planets, ...chart.outer];
}

/** Compatibility mode with a second birthday entered. */
const pairActive = () => mode === 'pair' && !!partner;
const theirsFor = p => partner.markers.find(m => m.pairOf === p.key);

/** A chart's personal-planet notes joined around the wheel. */
function drawShape(c, extraClass) {
  const members = rootIsAscendant(c) ? [c.ascendant, ...c.planets] : c.planets;   // the root is part of the chord
  const signs = [...new Set(members.map(p => p.signIndex))].sort((a, b) => a - b);
  if (signs.length < 2) return null;
  const points = signs.map(i => polar(R_NODE, signCentre(i)).join(',')).join(' ');
  return svg(signs.length === 2 ? 'polyline' : 'polygon', { class: `cp-shape${extraClass}`, points }, layers.shape);
}

function drawChart() {
  layers.shape.replaceChildren();
  layers.spokes.replaceChildren();
  layers.planets.replaceChildren();
  layers.pair.replaceChildren();
  el.wheel.setAttribute('viewBox', pairActive() ? VIEW_PAIR : VIEW_SINGLE);

  layers.shapeEl = drawShape(chart, '');
  layers.shapeThemEl = pairActive() ? drawShape(partner.chart, ' is-partner') : null;
  const chordSigns = new Set(chart.planets.map(p => p.signIndex));
  layers.nodes.querySelectorAll('.cp-node').forEach(n => {
    n.classList.toggle('is-in-chord', chordSigns.has(Number(n.dataset.sign)));
  });

  const markers = pairActive() ? partner.markers : [];
  const taken = [];
  placePlanets(myPoints(), PLANET_ORBITS, taken);
  placePlanets(markers, PARTNER_ORBITS, taken);
  for (const p of myPoints()) {
    const cls = p === chart.ascendant ? ' is-asc' : chart.outer.includes(p) ? ' is-outer' : '';
    drawMarker(p, cls, () => playOne(p));
  }
  for (const m of markers) {
    drawMarker(m, ` is-partner${m.pairOf === 'asc' ? ' is-asc' : m.outer ? ' is-outer' : ''}`, () => playPartnerNote(m));
  }
  drawPairLines(markers);
  drawAspectLines();
}

/**
 * Whole-sign aspects between your personal planets — the notes of the chord,
 * so every line is an interval you hear. Conjunctions share a note and get no
 * line. Hidden in compatibility mode, where the pair lines take over.
 */
function drawAspectLines() {
  layers.aspects.replaceChildren();
  for (const p of chart.planets) p.aspectEls = [];
  el.aspectLegend.hidden = pairActive();
  if (pairActive()) return;
  const ps = chart.planets;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const aspect = aspectBetween(ps[i], ps[j]);
      if (aspect === 'conjunct' || !showsAspect(aspect)) continue;
      const line = svg('line', {
        class: `cp-aspect is-${ASPECT_FEEL[aspect]}`,
        x1: ps[i].pos[0], y1: ps[i].pos[1], x2: ps[j].pos[0], y2: ps[j].pos[1],
      }, layers.aspects);
      svg('title', {}, line).textContent = `${ps[i].name} ${aspect} ${ps[j].name}`;
      ps[i].aspectEls.push(line);
      ps[j].aspectEls.push(line);
    }
  }
}

function drawMarker(p, extraClass, onPlay) {
  const [px, py] = p.pos;
  // Spokes reach the note circle from inside (yours) or outside (theirs)
  const [nx, ny] = polar(p.partner ? R_NODE + NODE_R : R_NODE - NODE_R, signCentre(p.signIndex));
  const elVar = `--el: var(--${elementOf(p.signIndex)})`;

  p.spokeEl = svg('line', { class: `cp-spoke${extraClass}`, x1: px, y1: py, x2: nx, y2: ny, style: elVar }, layers.spokes);

  const g = svg('g', {
    class: `cp-planet${extraClass}${p.key === 'venus' ? ' is-venus' : ''}`,
    style: elVar,
    tabindex: '0',
    role: 'button',
    'aria-label': `${p.name} in ${p.sign}, plays ${p.note}`,
  }, layers.planets);
  svg('circle', { class: 'cp-halo', cx: px, cy: py, r: PLANET_R + 7 }, g);
  svg('circle', { class: 'cp-dot', cx: px, cy: py, r: PLANET_R }, g);
  svg('text', { x: px, y: py }, g).textContent = p.glyph;
  svg('title', {}, g).textContent = `${p.name} · ${Math.floor(p.degree)}° ${p.sign} → ${p.note}`;
  g.addEventListener('click', onPlay);
  g.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(); }
  });
  p.planetEl = g;
}

/** Their planets as dashed markers on the outer ring, each tied to your same planet. */
function makePartnerMarkers(partnerChart) {
  const points = [...(partnerChart.ascendant ? [partnerChart.ascendant] : []), ...partnerChart.planets, ...partnerChart.outer];
  return points.map(p => ({
    ...p,
    key: `their-${p.key}`,
    name: `their ${p.name}`,
    pairOf: p.key,
    partner: true,
    outer: partnerChart.outer.includes(p),
  }));
}

/** Lines between matching planets. Sun and Venus always show; the rest appear as they play. */
function drawPairLines(markers) {
  for (const m of markers) {
    const mine = myPoints().find(p => p.key === m.pairOf);
    if (!mine) continue;   // only one of you has an Ascendant
    const quiet = m.pairOf !== 'sun' && m.pairOf !== 'venus';
    m.lineEl = svg('line', {
      class: `cp-pair-line is-${m.pairOf}${quiet ? ' is-quiet' : ''}`,
      x1: mine.pos[0], y1: mine.pos[1], x2: m.pos[0], y2: m.pos[1],
    }, layers.pair);
  }
}

// ── Planet list ──────────────────────────────────────────────────────────────

function formatCents(c) {
  const r = Math.round(c);
  return r === 0 ? '0¢' : `${r > 0 ? '+' : '−'}${Math.abs(r)}¢`;
}

/** Whole-sign aspect between two placements. */
function aspectBetween(a, b) {
  const signGap = Math.abs(a.signIndex - b.signIndex);
  return ASPECTS[Math.min(signGap, 12 - signGap)];
}

// Traditional aspects only: semi-sextiles and quincunxes are "in aversion"
const showsAspect = aspect => TRADITIONAL_ASPECTS.has(aspect);

/** The chord's root: the Ascendant (classic voicing, birth time given) or else the Sun. */
const rootOf = c => (c.voicing === 'classic' && c.ascendant ? c.ascendant : c.planets[0]);
const rootIsAscendant = c => rootOf(c) === c.ascendant;
/** Your Ascendant (if any) followed by your planets. */
const myPoints = () => [...(chart.ascendant ? [chart.ascendant] : []), ...allPlanets()];

function relationToRoot(p, sun = rootOf(chart)) {
  if (p === sun) return 'the root';
  const aspect = aspectBetween(p, sun);
  const interval = aspect === 'conjunct' ? 'unison' : INTERVALS[(p.pc - sun.pc + 12) % 12];
  // The space between two positions is rarely a pure interval — show how far off it is
  const off = p.cents - sun.cents;
  const offText = Math.abs(off) >= 5 ? ` ${formatCents(off)}` : '';
  const whose = sun.partner ? 'their' : 'the';
  const what = (sun.pairOf || sun.key) === 'asc' ? 'Ascendant' : 'Sun';
  const relation = showsAspect(aspect) ? `${aspect} ${whose} ${what}` : `in aversion to ${whose} ${what}`;
  return `${relation} · ${interval}${offText}`;
}

function describe(p) {
  return `${p.glyph} ${p.name} · ${Math.floor(p.degree)}° ${p.sign.toLowerCase()} → ${p.note} ${formatCents(p.cents)}`;
}

/** A link inside a Moon hint: switches exact time on and puts the cursor in that person's time field. */
function timeLink(text, timeEl) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'cp-hint-link';
  link.textContent = text;
  link.addEventListener('click', e => {
    e.stopPropagation();   // the row itself plays the planet
    if (!exactTime) setExactTime(true);
    timeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    timeEl.focus({ preventScroll: true });
  });
  link.addEventListener('keydown', e => e.stopPropagation());
  return link;
}

function renderList() {
  el.list.replaceChildren();
  const addRow = p => {
    const li = document.createElement('li');
    li.className = `cp-row${chart.outer.includes(p) ? ' is-outer' : ''}`;
    li.style.setProperty('--el', `var(--${elementOf(p.signIndex)})`);
    li.tabIndex = 0;
    li.innerHTML = `
      <span class="cp-row-glyph"></span>
      <span class="cp-row-main"><span class="cp-row-name"></span><span class="cp-row-sign"></span></span>
      <span class="cp-row-note"><span class="cp-row-pitch"></span><span class="cp-row-cents"></span></span>
      <span class="cp-row-rel"></span>`;
    li.querySelector('.cp-row-glyph').textContent = p.glyph;
    li.querySelector('.cp-row-name').textContent = p.name.toLowerCase();
    li.querySelector('.cp-row-sign').textContent = `${Math.floor(p.degree)}° ${p.sign.toLowerCase()}`;
    li.querySelector('.cp-row-pitch').textContent = p.note;
    li.querySelector('.cp-row-cents').textContent = formatCents(p.cents);
    li.querySelector('.cp-row-rel').textContent = relationToRoot(p);
    if (p.key === 'moon' && moonUncertain(p, el.time)) {
      const hint = document.createElement('span');
      hint.className = 'cp-row-hint';
      hint.append(`near the ${p.degree < 15 ? 'start' : 'end'} of ${p.sign.toLowerCase()}, so your Moon may be in the ${p.degree < 15 ? 'previous' : 'next'} sign — `,
        timeLink('add your birth time', el.time));
      li.appendChild(hint);
    }
    const m = pairActive() ? theirsFor(p) : null;
    if (m) {
      m.rowEl = li;
      const them = document.createElement('span');
      them.className = 'cp-row-them';
      them.textContent = `them · ${Math.floor(m.degree)}° ${m.sign.toLowerCase()} → ${m.note} ${formatCents(m.cents)} · ${describeInterval(intervalUp(p, m)).name}`;
      if (m.pairOf === 'moon' && moonUncertain(m, el.pairTime)) {
        them.append(` · their Moon may be in the ${m.degree < 15 ? 'previous' : 'next'} sign — `, timeLink('add their birth time', el.pairTime));
      }
      li.appendChild(them);
    }
    if (p !== chart.ascendant) {
      // Arpeggio on/off for this planet — only shown while the arpeggiator runs
      const toggle = document.createElement('label');
      toggle.className = 'cp-row-toggle';
      toggle.title = `${p.name} in the arpeggio`;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.key = p.key;
      box.setAttribute('aria-label', `Play ${p.name} in the arpeggio`);
      box.addEventListener('change', () => setArpIncluded(p.key, box.checked));
      for (const ev of ['click', 'keydown']) toggle.addEventListener(ev, e => e.stopPropagation());
      toggle.appendChild(box);
      li.prepend(toggle);
    }
    li.addEventListener('click', () => playOne(p));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playOne(p); }
    });
    p.rowEl = li;
    el.list.appendChild(li);
  };
  if (chart.ascendant) addRow(chart.ascendant);
  chart.planets.forEach(addRow);
  const divider = document.createElement('li');
  divider.className = 'cp-row-divider';
  divider.textContent = 'outer planets';
  el.list.appendChild(divider);
  chart.outer.forEach(addRow);
}

// ── Two birthdays: the space between ────────────────────────────────────────

/** Continuous pitch in semitones above C, cents included. */
const pitchOf = p => p.pc + p.cents / 100;

/** Interval going up from one position to another, 0–12 semitones (fractional). */
function intervalUp(from, to) {
  return (((pitchOf(to) - pitchOf(from)) % 12) + 12) % 12;
}

function describeInterval(semitones) {
  const nearest = Math.round(semitones);
  const off = (semitones - nearest) * 100;
  if (Math.abs(off) > MICROTONE_LIMIT) {
    const lower = Math.floor(semitones);
    const upper = lower + 1;
    return {
      name: `between ${INTERVALS_UP[lower]} & ${INTERVALS_UP[upper]}`,
      tag: `${INTERVAL_CHARACTER[lower][0]} ↔ ${INTERVAL_CHARACTER[upper][0]}`,
      text: BETWEEN_TEXT,
    };
  }
  // A hair under the octave reads as a unison a few cents flat
  const idx = nearest === 12 ? 0 : nearest;
  return {
    name: `${INTERVALS_UP[idx]} ${formatCents(off)}`,
    tag: INTERVAL_CHARACTER[idx][0],
    text: INTERVAL_CHARACTER[idx][1],
  };
}

function pairReading(key) {
  const mine = allPlanets().find(p => p.key === key);
  const theirs = partner.markers.find(m => m.pairOf === key);
  const up = intervalUp(mine, theirs);
  const gap = Math.abs(mine.longitude - theirs.longitude) % 360;
  return {
    mine,
    theirs,
    up,
    degreesApart: Math.round(gap > 180 ? 360 - gap : gap),
    youRoot: describeInterval(up),
    themRoot: describeInterval(12 - up),
  };
}

/**
 * Oscilloscope-style Lissajous figures of the pair intervals: x follows the
 * root, y the upper note. Like a real scope trace, the phase between the two
 * notes keeps sliding, so the figure turns and breathes: simple ratios roll
 * as clean loops, microtonal ones weave and drift.
 *
 * Cheap by design: small canvases, one shared requestAnimationFrame loop, and
 * only figures that are on screen are drawn (IntersectionObserver). Off screen,
 * in single mode or in a background tab the loop stops. No canvas blur/shadow —
 * the glow is a wide faint stroke under a thin bright one.
 */
const LISS_POINTS = 320;
const LISS_CYCLES = 6;          // cycles of the root drawn per frame
const LISS_PHASE_SPEED = 0.9;   // radians per second the upper note slides against the root
const LISS_FRAME_MS = 33;       // ~30 fps is plenty for a scope trace
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lissVisible = new Set();
let lissFrame = 0;
let lissLastPaint = 0;

const lissObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting) lissVisible.add(e.target);
    else lissVisible.delete(e.target);
  }
  if (lissVisible.size && !lissFrame && !reducedMotion) lissFrame = requestAnimationFrame(lissLoop);
}) : null;

function paintLissajous(canvas, phase) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 70;
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr);
  }
  const ctx = canvas.getContext('2d');
  const r = (canvas.width / 2) * 0.86;
  const c = canvas.width / 2;
  const ratio = canvas.lissRatio;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  for (let i = 0; i <= LISS_POINTS; i++) {
    const t = (i / LISS_POINTS) * LISS_CYCLES * 2 * Math.PI;
    const x = c + r * Math.sin(t + Math.PI / 2);
    const y = c - r * Math.sin(ratio * t + phase);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = canvas.lissColor;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.18;          // soft glow
  ctx.lineWidth = 3.5 * dpr;
  ctx.stroke();
  ctx.globalAlpha = 0.9;           // the trace
  ctx.lineWidth = 0.9 * dpr;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function lissLoop(now) {
  if (now - lissLastPaint >= LISS_FRAME_MS) {
    lissLastPaint = now;
    const phase = (now / 1000) * LISS_PHASE_SPEED;
    for (const canvas of lissVisible) paintLissajous(canvas, phase);
  }
  lissFrame = lissVisible.size ? requestAnimationFrame(lissLoop) : 0;
}

function drawLissajous(roleEl, semitones, label) {
  let canvas = roleEl.querySelector('canvas.cp-liss');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'cp-liss';
    canvas.setAttribute('role', 'img');
    roleEl.appendChild(canvas);
    lissObserver?.observe(canvas);
  }
  canvas.setAttribute('aria-label', `Lissajous figure of a ${label}`);
  canvas.lissRatio = Math.pow(2, semitones / 12);
  canvas.lissColor = getComputedStyle(canvas).color;
  paintLissajous(canvas, 0);   // first frame now (and the only one with reduced motion)
}

// Which tuning a reading uses changes it: the two orders disagree on semi-sextiles and quincunxes
const PAIR_TUNING_NOTE = {
  fifths: 'Read on the circle of fifths, where a quincunx sounds as a half step and a semi-sextile as a fifth. The chromatic tuning reverses those two.',
  pythagorean: 'Read in Pythagorean tuning: the circle of fifths in pure 3:2 fifths, so intervals sound a few cents wide, and one between Pisces and Aries carries the wolf.',
  chromatic: 'Read in the chromatic Musical Astrology tuning, where a semi-sextile sounds as a half step and a quincunx as a fourth or fifth.',
};

function renderPair() {
  el.pairSection.hidden = !pairActive();
  el.pairResult.hidden = !pairActive();
  if (!pairActive()) return;
  el.pairLede.textContent = `A relationship, read as the space between two birthdays: the interval your Suns make, and your Venuses. ${PAIR_TUNING_NOTE[tuning]}`;
  for (const key of ['sun', 'venus']) {
    const r = pairReading(key);
    const card = el.pairResult.querySelector(`[data-pair="${key}"]`);
    const aspect = aspectBetween(r.mine, r.theirs);
    card.querySelector('.cp-pair-notes').textContent =
      `you ${r.mine.note} ${formatCents(r.mine.cents)} · them ${r.theirs.note} ${formatCents(r.theirs.cents)} · ${r.degreesApart}° apart · ${showsAspect(aspect) ? aspect : 'in aversion'}`;
    card.querySelector('.cp-pair-you .cp-pair-name').textContent = r.youRoot.name;
    card.querySelector('.cp-pair-you .cp-pair-tag').textContent = r.youRoot.tag;
    card.querySelector('.cp-pair-you .cp-pair-text').textContent = r.youRoot.text;
    card.querySelector('.cp-pair-them .cp-pair-name').textContent = r.themRoot.name;
    card.querySelector('.cp-pair-them .cp-pair-tag').textContent = r.themRoot.tag;
    card.querySelector('.cp-pair-them .cp-pair-text').textContent = r.themRoot.text;
    drawLissajous(card.querySelector('.cp-pair-you'), r.up, r.youRoot.name);
    drawLissajous(card.querySelector('.cp-pair-them'), 12 - r.up, r.themRoot.name);
  }
}

// ── Highlighting ─────────────────────────────────────────────────────────────

function clearHighlights() {
  el.wheel.querySelectorAll('.is-active').forEach(n => n.classList.remove('is-active'));
  el.list.querySelectorAll('.is-active').forEach(n => n.classList.remove('is-active'));
}

function nodeFor(p) {
  return layers.nodes.querySelector(`.cp-node[data-sign="${p.signIndex}"]`);
}

function highlightPlanet(p) {
  clearHighlights();
  p.planetEl.classList.add('is-active');
  p.spokeEl.classList.add('is-active');
  p.rowEl.classList.add('is-active');
  nodeFor(p).classList.add('is-active');
  p.aspectEls?.forEach(l => l.classList.add('is-active'));
  el.now.textContent = `${describe(p)} · ${relationToRoot(p)}`;
}

/** Light a whole chord: 'you', 'them' or 'both' (compatibility mode). */
function highlightChord(who = 'you') {
  clearHighlights();
  const all = who === 'them' ? partner.markers
    : who === 'both' ? [...myPoints(), ...partner.markers]
      : myPoints();
  const list = all.filter(p => !farOff(p));
  for (const p of list) {
    p.planetEl.classList.add('is-active');
    p.spokeEl.classList.add('is-active');
    nodeFor(p).classList.add('is-active');
  }
  if (who !== 'them') {
    layers.shapeEl?.classList.add('is-active');
    layers.aspects.querySelectorAll('.cp-aspect').forEach(l => l.classList.add('is-active'));
  }
  if (who !== 'you') layers.shapeThemEl?.classList.add('is-active');
  setChordText(el.now, !pairActive() ? `all together · ${chart.name}`
    : who === 'you' ? `your chord · ${chart.name}`
      : who === 'them' ? `their chord · ${partner.chart.name}`
        : `side by side · ${chart.name} + ${partner.chart.name}`);
}

// ── Playback ─────────────────────────────────────────────────────────────────

/** Run fn after `ms`; stopAll() cancels anything still pending. */
function later(fn, ms) {
  const id = setTimeout(() => {
    cueTimers.delete(id);
    fn();
  }, Math.max(0, ms));
  cueTimers.add(id);
}

function resetIdle() {
  clearHighlights();
  el.wheel.classList.remove('is-playing');
  el.now.innerHTML = '&nbsp;';
}

function stopAll() {
  stopArp();
  stopSequence();
  setArpButton(false);
  stopStrum();
  cueTimers.forEach(clearTimeout);
  cueTimers.clear();
  clearHighlights();
  el.wheel.classList.remove('is-playing');
}

/** Schedule notes as one strum and fire visual cues on the same clock. */
function perform(notes, cues) {
  stopAll();
  const end = strum(notes, venusElement);
  el.wheel.classList.add('is-playing');
  for (const cue of cues) later(cue.run, (STRUM_LEAD + cue.at) * 1000);
  later(resetIdle, (STRUM_LEAD + end) * 1000);
}

// ── Live scheduling ──────────────────────────────────────────────────────────
// Walks, strums and the arpeggiator all run on a look-ahead scheduler: every
// TICK_MS it queues only the notes falling in the next LOOKAHEAD seconds on the
// audio clock. Timing stays tight, endless loops never pile up timers, and the
// controls act live — untick "outer planets" mid-way and the outer planets
// still to come are dropped (chords lose their outer shimmer too).

const TICK_MS = 30;
const LOOKAHEAD = 0.12;

const isOuter = p => chart.outer.includes(p) || !!p.outer;
const includeOuter = () => [...FAR_PLANETS].some(k => !arpExcluded.has(k));
/** One of Uranus/Neptune/Pluto that has been switched off. */
const farOff = p => isFar(p) && arpExcluded.has(p.pairOf || p.key);

/** Uranus, Neptune, Pluto — the only planets the "outer three" switch drops. */
const isFar = p => FAR_PLANETS.has(p.pairOf || p.key);

/** Notes to sound right now: chord notes tagged `far` drop out when the outer three are off. */
const liveNotes = notes => (includeOuter() ? notes : notes.filter(n => !n.far));

/** Play scheduled notes at audio time `when`; returns when the last one stops ringing. */
function sound(notes, when) {
  let tail = when;
  for (const n of liveNotes(notes)) {
    playNoteAt(n.freq, n.element, n.velocity, n.duration, when + n.delay, n.pan || 0);
    tail = Math.max(tail, when + n.delay + n.duration);
  }
  return tail;
}

// ── Sequencer: a list of steps played in order ──
// step = { notes, run (visual cue), gap (seconds to the next step), outer (skip when the outer three are off) }
let seq = null;

function playSequence(steps) {
  stopAll();
  beginPlayback();
  seq = { steps, i: 0, nextTime: audioNow() + STRUM_LEAD, tail: 0 };
  el.wheel.classList.add('is-playing');
  // Timer first: a short sequence (one strum) can finish inside its first tick
  seq.timer = setInterval(sequenceTick, TICK_MS);
  sequenceTick();
}

function sequenceTick() {
  const horizon = audioNow() + LOOKAHEAD;
  while (seq && seq.nextTime < horizon) {
    if (seq.i >= seq.steps.length) {
      // Everything is queued: let the last notes ring out, then go quiet
      clearInterval(seq.timer);
      const ringFor = Math.max(0, seq.tail - audioNow());
      seq = null;
      later(resetIdle, ringFor * 1000);
      endPlayback(ringFor + 0.5);
      return;
    }
    const step = seq.steps[seq.i++];
    if (step.skip?.()) continue;   // switched off live — no gap left behind
    const when = seq.nextTime;
    seq.tail = Math.max(seq.tail, sound(step.notes || [], when));
    if (step.run) later(step.run, (when - audioNow()) * 1000);
    seq.nextTime += step.gap;
  }
}

function stopSequence() {
  if (!seq) return;
  clearInterval(seq.timer);
  seq = null;
  endPlayback(0.5);
}

// ── Arpeggiator ──────────────────────────────────────────────────────────────
// Same scheduler, looping. Tempo, pattern and the outer-planet switch are read
// live; a pattern or outer-planet change rebuilds the cycle on the spot and
// carries on from the last note played.

const arpStep = () => 60 / Number(el.arpTempo.value) / 2;   // eighth notes

const arpVoice = p => p.freqs[p.freqs.length - 1];            // Sun: its upper root, not the bass

function arpOrder() {
  const list = allPlanets().filter(p => !arpExcluded.has(p.key));
  const byPitch = [...list].sort((a, b) => arpVoice(a) - arpVoice(b));
  switch (el.arpPattern.value) {
    case 'up': return byPitch;
    case 'down': return byPitch.reverse();
    case 'updown': return [...byPitch, ...byPitch.slice(1, -1).reverse()];
    case 'random': {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }
    default: return list;
  }
}

/** The pattern runs over your planets; in compatibility mode each is followed by theirs. */
function arpSequence() {
  const order = arpOrder();
  return pairActive() ? order.flatMap(p => [p, theirsFor(p)]) : order;
}

/** Pattern or outer planets changed mid-cycle: rebuild and resume after the last note played. */
function rebuildArp() {
  if (!arp) return;
  const upcoming = arp.order.slice(arp.step);
  const fresh = arpSequence();
  const lastAt = arp.last ? fresh.indexOf(arp.last) : -1;
  if (lastAt >= 0) {
    arp.step = lastAt + 1;
  } else {
    // The last note was one of the outer three, just switched off: go on from the next one kept
    const next = upcoming.find(p => fresh.includes(p));
    arp.step = next ? fresh.indexOf(next) : fresh.length;
  }
  arp.order = fresh;
}

function setArpIncluded(key, on) {
  if (on) arpExcluded.delete(key);
  else arpExcluded.add(key);
  syncArpUI();
  rebuildArp();
}

/** Reflect the arpeggio on/off set in the row boxes, the dimmed planets and the outer-three box. */
function syncArpUI() {
  el.list.querySelectorAll('.cp-row-toggle input').forEach(b => { b.checked = !arpExcluded.has(b.dataset.key); });
  for (const p of [...allPlanets(), ...(pairActive() ? partner.markers : [])]) {
    const off = arpExcluded.has(p.pairOf || p.key);
    p.rowEl?.classList.toggle('is-muted', off);
    p.planetEl?.classList.toggle('is-muted', off);
  }
  const on = [...FAR_PLANETS].filter(k => !arpExcluded.has(k)).length;
  el.arpOuter.checked = on === FAR_PLANETS.size;
  el.arpOuter.indeterminate = on > 0 && on < FAR_PLANETS.size;
}

function setArpButton(on) {
  document.body.classList.toggle('arp-on', on);
  el.arpToggle.setAttribute('aria-pressed', String(on));
  el.arpToggle.textContent = on ? '■ stop' : 'arpeggiate';
}

function startArp() {
  stopAll();
  beginPlayback();
  arp = { nextTime: audioNow() + STRUM_LEAD, step: 0, cycle: 0, order: arpSequence(), last: null };
  el.wheel.classList.add('is-playing');
  setArpButton(true);
  arp.timer = setInterval(arpTick, TICK_MS);
  arpTick();
  trackChordPage('arp', chart.name);
}

function arpTick() {
  const horizon = audioNow() + LOOKAHEAD;
  while (arp && arp.nextTime < horizon) {
    if (arp.step >= arp.order.length) {
      arp.step = 0;
      arp.cycle++;
      const repeats = Number(el.arpRepeats.value);   // 0 = until stopped
      if (repeats && arp.cycle >= repeats) {
        finishArp(arp.nextTime);
        return;
      }
      arp.order = arpSequence();
    }
    if (!arp.order.length) {   // every planet switched off: keep time silently
      arp.nextTime += arpStep();
      arp.step = 1;
      continue;
    }
    const when = arp.nextTime;
    const p = arp.order[arp.step];
    // A soft Sun pedal under the first note of every cycle
    if (arp.step === 0) {
      playNoteAt(rootOf(chart).freqs[0], venusElement, 0.35, 2.5, when, pairActive() ? -PAN : 0);
    }
    const velocity = (p.pairOf || p.key) === 'venus' ? 0.65 : isOuter(p) ? 0.3 : 0.45;
    const voice = voiceOf(p);
    playNoteAt(arpVoice(p), voice.element, velocity, 1.4, when, voice.pan);
    later(() => (p.partner ? lightPair([p], describe(p)) : highlightPlanet(p)), (when - audioNow()) * 1000);
    arp.last = p;
    arp.nextTime += arpStep();
    arp.step++;
  }
}

/** Last cycle done: land on the full chord, then go quiet. */
function finishArp(at) {
  clearInterval(arp.timer);
  arp = null;
  // Land on the chord — both chords at once in compatibility mode
  const finale = pairActive()
    ? [...chordNotes(chart, 0, false), ...chordNotes(partner.chart, 0, true)]
    : chordNotes(chart, 0, false);
  const ringFor = sound(finale, at) - audioNow();
  later(() => highlightChord(pairActive() ? 'both' : 'you'), (at - audioNow()) * 1000);
  later(() => {
    setArpButton(false);
    resetIdle();
  }, ringFor * 1000);
  endPlayback(ringFor + 0.5);
}

function stopArp() {
  if (!arp) return;
  clearInterval(arp.timer);
  arp = null;
  setArpButton(false);
  endPlayback(0.5);
}

/** Who is playing a note: their notes sit right in their timbre; yours left (or centre when alone). */
function voiceOf(p) {
  if (p.partner) return { pan: PAN, element: themElement };
  return { pan: pairActive() ? -PAN : 0, element: venusElement };
}

function planetNotes(p, at) {
  const velocity = (p.pairOf || p.key) === 'venus' ? 0.7 : isOuter(p) ? 0.3 : 0.55;
  const voice = voiceOf(p);
  return p.freqs.map(freq => ({ freq, velocity, delay: at, duration: isOuter(p) ? 1.6 : 2.2, ...voice }));
}

/** A chart's chord, offset to `at`, voiced as you or as them. */
function chordNotes(c, at, theirs) {
  const voice = theirs ? { pan: PAN, element: themElement } : { pan: pairActive() ? -PAN : 0, element: venusElement };
  return c.notes.map(n => ({ ...n, delay: n.delay + at, ...voice }));
}

/** Steps: your chord, then theirs, then both together. */
function bothChordsSteps() {
  return [
    { notes: chordNotes(chart, 0, false), run: () => highlightChord('you'), gap: CHORD_GAP },
    { notes: chordNotes(partner.chart, 0, true), run: () => highlightChord('them'), gap: CHORD_GAP },
    { notes: [...chordNotes(chart, 0, false), ...chordNotes(partner.chart, 0, true)], run: () => highlightChord('both'), gap: 0 },
  ];
}

const pauseStep = () => ({ gap: PAUSE_BEFORE_CHORD });

function pairCaption(p, m) {
  return `${p.glyph} ${p.name} · you ${p.note} ${formatCents(p.cents)} · them ${m.note} ${formatCents(m.cents)} · ${describeInterval(intervalUp(p, m)).name}`;
}

/** One person's chart on its own (compatibility mode): planet by planet, then their chord. Centred. */
function playSolo(who) {
  if (!pairActive()) return;
  const theirs = who === 'them';
  const list = theirs ? partner.markers : myPoints();
  const rootKey = rootOf(theirs ? partner.chart : chart).key;
  const sun = theirs ? list.find(m => m.pairOf === rootKey) : rootOf(chart);
  const centre = n => ({ ...n, pan: 0 });
  playSequence([
    ...list.map(p => ({
      notes: planetNotes(p, 0).map(centre),
      run: () => lightPair([p], `${describe(p)} · ${relationToRoot(p, sun)}`),
      gap: isOuter(p) ? STEP_OUTER : STEP_PERSONAL,
      skip: () => farOff(p),
    })),
    pauseStep(),
    { notes: chordNotes(theirs ? partner.chart : chart, 0, theirs).map(centre), run: () => highlightChord(who), gap: 0 },
  ]);
  trackChordPage(`solo_${who}`, theirs ? partner.chart.name : chart.name);
}

function playPairWalk() {
  const both = rootIsAscendant(chart) && rootIsAscendant(partner.chart) ? [chart.ascendant] : [];
  playSequence([
    ...[...both, ...allPlanets()].map(p => {
      const m = theirsFor(p);
      return {
        notes: [...planetNotes(p, 0), ...planetNotes(m, PAIR_OFFSET)],
        run: () => lightPair([p, m], pairCaption(p, m)),
        gap: isOuter(p) ? STEP_PAIR_OUTER : STEP_PAIR_PERSONAL,
        skip: () => farOff(p),
      };
    }),
    pauseStep(),
    ...bothChordsSteps(),
  ]);
  trackChordPage('pair_walk', `${chart.name} + ${partner.chart.name}`);
}

function playWalk() {
  if (pairActive()) {
    playPairWalk();
    return;
  }
  playSequence([
    ...[...(rootIsAscendant(chart) ? [chart.ascendant] : []), ...allPlanets()].map(p => ({
      notes: planetNotes(p, 0),
      run: () => highlightPlanet(p),
      gap: isOuter(p) ? STEP_OUTER : STEP_PERSONAL,
      skip: () => farOff(p),
    })),
    pauseStep(),
    { notes: chordNotes(chart, 0, false), run: () => highlightChord('you'), gap: 0 },
  ]);
  trackChordPage('walk', chart.name);
}

function playChord() {
  if (pairActive()) {
    playSequence(bothChordsSteps());
    trackChordPage('pair_chord', `${chart.name} + ${partner.chart.name}`);
    return;
  }
  playSequence([{ notes: chordNotes(chart, 0, false), run: () => highlightChord('you'), gap: 0 }]);
  trackChordPage('chord', chart.name);
}

// Two-birthday playback sits around middle C so both notes are easy to hear
const PAIR_BASE_MIDI = 60;
const midiFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

function pairNote(pos, at, velocity = 0.55, theirs = false) {
  const voice = theirs ? { pan: PAN, element: themElement } : { pan: -PAN, element: venusElement };
  return { freq: midiFreq(PAIR_BASE_MIDI + pos), velocity, delay: at, duration: 2.2, ...voice };
}

function lightPair(items, caption) {
  clearHighlights();
  for (const item of items) {
    item.planetEl?.classList.add('is-active');
    item.spokeEl?.classList.add('is-active');
    item.lineEl?.classList.add('is-active');
    item.rowEl?.classList.add('is-active');
    if (item.signIndex !== undefined) nodeFor(item).classList.add('is-active');
  }
  el.now.textContent = caption;
}

/**
 * While the arpeggiator runs, tapping a planet (row or wheel) switches it in or
 * out of the pattern, like its circle — it never stops the music. The
 * Ascendant is the root pedal, not a step, so tapping it does nothing then.
 */
function arpTap(p) {
  const key = p.pairOf || p.key;
  if (key !== 'asc') setArpIncluded(key, arpExcluded.has(key));
}

function playPartnerNote(m) {
  if (arp) {
    arpTap(m);
    return;
  }
  perform(planetNotes(m, 0), [{ at: 0, run: () => lightPair([m], describe(m)) }]);
}

function playPair() {
  if (!partner) return;
  const sun = pairReading('sun');
  const venus = pairReading('venus');
  const youPos = pitchOf(sun.mine);
  const themPos = pitchOf(sun.theirs);
  const notes = [];
  const cues = [];
  const step = (at, items, caption, ...ns) => {
    notes.push(...ns);
    cues.push({ at, run: () => lightPair(items, caption) });
  };
  step(0, [sun.mine], `☉ your Sun · ${sun.mine.note} ${formatCents(sun.mine.cents)}`,
    pairNote(youPos, 0));
  step(0.9, [sun.theirs], `☉ their Sun · ${sun.theirs.note} ${formatCents(sun.theirs.cents)}`,
    pairNote(themPos, 0.9, 0.55, true));
  step(1.8, [sun.mine, sun.theirs], `you as the root · ${sun.youRoot.name} · ${sun.youRoot.tag}`,
    pairNote(youPos, 1.8), pairNote(youPos + sun.up, 1.8 + 0.05, 0.55, true));
  step(3.6, [sun.mine, sun.theirs], `them as the root · ${sun.themRoot.name} · ${sun.themRoot.tag}`,
    pairNote(themPos, 3.6, 0.55, true), pairNote(themPos + (12 - sun.up), 3.6 + 0.05));
  const vPos = pitchOf(venus.mine);
  step(5.4, [venus.mine, venus.theirs], `♀ Venus to Venus · ${venus.youRoot.name} · ${venus.youRoot.tag}`,
    pairNote(vPos, 5.4, 0.6), pairNote(vPos + venus.up, 5.4 + 0.05, 0.6, true));
  // The highlights happen on the wheel — bring it into view if it's scrolled away
  const box = el.wheel.getBoundingClientRect();
  const visible = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
  if (visible < box.height / 2) el.wheel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  perform(notes, cues);
  trackChordPage('pair_play', `${sun.youRoot.name} / ${venus.youRoot.name}`);
}

function playOne(p) {
  if (arp) {
    arpTap(p);
    return;
  }
  const m = pairActive() ? theirsFor(p) : null;
  if (m) {
    perform([...planetNotes(p, 0), ...planetNotes(m, PAIR_OFFSET)], [{ at: 0, run: () => lightPair([p, m], pairCaption(p, m)) }]);
  } else {
    perform(planetNotes(p, 0), [{ at: 0, run: () => highlightPlanet(p) }]);
  }
  trackChordPage('planet', chart.name);
}

// ── Date handling ────────────────────────────────────────────────────────────

function parseISODate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return { y, mo, d };
}

// ── Birth time ───────────────────────────────────────────────────────────────
// Without a time the sky is taken at noon UTC, which can put a fast Moon up to
// ~7° off (it moves ~13° a day). With a time, the local wall-clock time is
// converted to UTC through the browser's time-zone data, which knows each
// zone's historical daylight-saving rules.

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const MOON_NOON_SLACK = 7.5;   // degrees the Moon can move in ±12 h

/** Offset of `tz` from UTC at a given instant, in minutes. */
function tzOffsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = type => Number(parts.find(p => p.type === type).value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - date.getTime()) / 60000;
}

/** Local wall-clock time in `tz` → the UTC instant (twice, to settle DST edges). */
function zonedTimeToUtc(y, mo, d, hh, mm, tz) {
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  let utc = wall;
  for (let i = 0; i < 2; i++) utc = wall - tzOffsetMinutes(tz, new Date(utc)) * 60000;
  return new Date(utc);
}

const validTime = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');

function fillTimeZones() {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* older browsers */ }
  if (!zones.includes(LOCAL_TZ)) zones.unshift(LOCAL_TZ);
  if (!zones.includes('UTC')) zones.push('UTC');
  for (const select of [el.tz, el.pairTz]) {
    select.replaceChildren(...zones.map(z => new Option(z.replace(/_/g, ' '), z)));
    select.value = LOCAL_TZ;
  }
}

/** The moment to cast a chart for: the exact birth time if given, else noon UTC. */
function birthInstant(iso, timeEl, tzEl) {
  const { y, mo, d } = parseISODate(iso);
  if (exactTime && validTime(timeEl.value)) {
    const [hh, mm] = timeEl.value.split(':').map(Number);
    return zonedTimeToUtc(y, mo, d, hh, mm, tzEl.value || LOCAL_TZ);
  }
  return makeBirthDate(d, mo, y);
}

const hasTime = timeEl => exactTime && validTime(timeEl.value);

const zoneCity = tz => (tz || '').split('/').pop().replace(/_/g, ' ');

/**
 * Cast a chart; with a birth time the Ascendant becomes the root. The time-zone
 * picker doubles as the birthplace: each zone is named after a city, and the
 * Ascendant is raised over that city's coordinates.
 */
function castChart(iso, timeEl, tzEl) {
  const instant = birthInstant(iso, timeEl, tzEl);
  const place = hasTime(timeEl) ? ZONE_COORDS[tzEl.value] : null;
  const options = place ? { ascendant: ascendantLongitude(instant, place[0], place[1]) } : {};
  return calculateChartChord(instant, tuning, voicing, options);
}

const timeLabel = (timeEl, tzEl, c) => (hasTime(timeEl)
  ? ` · ${timeEl.value} ${zoneCity(tzEl.value)}${c?.ascendant ? ` · ${c.ascendant.sign.toLowerCase()} rising` : ''}`
  : '');

/** A Moon this close to a sign edge may really be in the neighbouring sign at noon-UTC precision. */
const moonUncertain = (p, timeEl) => !hasTime(timeEl) && (p.degree < MOON_NOON_SLACK || p.degree > 30 - MOON_NOON_SLACK);

function setExactTime(on) {
  exactTime = on;
  el.timeToggle.checked = on;
  el.timeFields.forEach(f => { f.hidden = !on; });
}

function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function show(iso, isToday) {
  const { y, mo, d } = parseISODate(iso);
  stopAll();
  shown = { iso, isToday };
  chart = castChart(iso, el.time, el.tz);
  el.chordCaption.textContent = rootIsAscendant(chart)
    ? 'the Ascendant is the root · Venus sings on top · outer planets shimmer above'
    : VOICING_CAPTION[voicing];
  const venus = chart.planets[3];
  venusElement = elementOf(venus.signIndex);
  document.documentElement.style.setProperty('--venus-el', `var(--${venusElement})`);

  el.date.value = iso;
  const dateText = `${d} ${MONTHS[mo - 1]} ${y}`;
  setChordText(el.chordName, chart.name);
  el.now.innerHTML = '&nbsp;';
  if (partner) setPartner(partner.iso);

  if (pairActive()) {
    const t = parseISODate(partner.iso);
    el.when.textContent = `you ${isToday ? 'today' : dateText}${timeLabel(el.time, el.tz, chart)} · them ${t.d} ${MONTHS[t.mo - 1]} ${t.y}${timeLabel(el.pairTime, el.pairTz, partner.chart)}`;
    setChordText(el.chordThem, `them · ${partner.chart.name}`);
  } else {
    el.when.textContent = isToday ? `today's sky · ${dateText}` : `born ${dateText}${timeLabel(el.time, el.tz, chart)}`;
    if (mode === 'pair') el.now.textContent = 'add their birthday above to compare';
  }
  el.chordThem.hidden = !pairActive();
  el.playYou.hidden = !pairActive();
  el.playThem.hidden = !pairActive();
  labelNotes();
  drawChart();
  renderList();
  syncArpUI();
  renderPair();
}

function setPartner(iso) {
  const parsed = parseISODate(iso);
  if (!parsed) {
    partner = null;
    return;
  }
  const partnerChart = castChart(iso, el.pairTime, el.pairTz);
  partner = { iso, chart: partnerChart, markers: makePartnerMarkers(partnerChart) };
  themElement = elementOf(partnerChart.planets[3].signIndex);
  document.documentElement.style.setProperty('--them-el', `var(--${themElement})`);
  el.pairDate.value = iso;
}

function setVoicing(next) {
  voicing = next === 'orbit' ? 'orbit' : 'classic';
  el.voicingButtons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.voicing === voicing)));
}

function setMode(next) {
  mode = next === 'pair' ? 'pair' : 'single';
  el.modeButtons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  el.themField.hidden = mode !== 'pair';
  el.dateLabel.textContent = mode === 'pair' ? 'you' : 'born';
  el.title.textContent = mode === 'pair' ? 'harmony of two charts' : 'your chart, as a chord';
  document.body.dataset.mode = mode;
}

const effectiveTuning = () => tuningChoice[mode] || DEFAULT_TUNING[mode];
/** URL value for the tuning: only when it differs from the current mode's default. */
const tuningParam = () => (tuning === DEFAULT_TUNING[mode] ? null : tuning);

function setTuning(next) {
  tuning = TUNINGS[next] ? next : 'fifths';
  el.tuningButtons.forEach(b => b.setAttribute('aria-checked', String(b.dataset.tuning === tuning)));
  document.body.dataset.tuning = tuning;
}

function updateUrl(params) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  history.replaceState(null, '', url);
}

/** Read the form (dates, times, zones), recast the charts and update the URL. */
function applyForm() {
  const iso = el.date.value;
  if (!parseISODate(iso)) return false;
  if (mode === 'pair') {
    if (parseISODate(el.pairDate.value)) setPartner(el.pairDate.value);
    else partner = null;
  }
  const timed = (timeEl, tzEl) => (exactTime && validTime(timeEl.value) ? [timeEl.value, tzEl.value] : [null, null]);
  const [time, tz] = timed(el.time, el.tz);
  const [wtime, wtz] = pairActive() ? timed(el.pairTime, el.pairTz) : [null, null];
  updateUrl({ date: iso, with: pairActive() ? partner.iso : null, time, tz, wtime, wtz });
  show(iso, false);
  return true;
}

el.form.addEventListener('submit', e => {
  e.preventDefault();
  if (applyForm() && pairActive()) trackChordPage('pair', `${chart.name} + ${partner.chart.name}`);
});

// Times and zones apply as soon as they're entered — the Moon's sign (and the
// "near a sign change" hint) updates without pressing "show"
const timeOf = { [el.time.id]: el.time, [el.tz.id]: el.time, [el.pairTime.id]: el.pairTime, [el.pairTz.id]: el.pairTime };
for (const [input, event] of [[el.time, 'input'], [el.pairTime, 'input'], [el.tz, 'change'], [el.pairTz, 'change']]) {
  input.addEventListener(event, () => {
    if (validTime(timeOf[input.id].value)) applyForm();
  });
}

el.timeToggle.addEventListener('change', () => {
  setExactTime(el.timeToggle.checked);
  // On with a time already filled in, or off again: recast straight away
  if (!exactTime || validTime(el.time.value) || validTime(el.pairTime.value)) applyForm();
  if (exactTime && !validTime(el.time.value)) el.time.focus();
  trackChordPage(exactTime ? 'exact_time_on' : 'exact_time_off', chart.name);
});

el.voicingButtons.forEach(btn => btn.addEventListener('click', () => {
  if (btn.dataset.voicing === voicing) return;
  setVoicing(btn.dataset.voicing);
  updateUrl({ voicing: voicing === 'classic' ? null : voicing });
  show(shown.iso, shown.isToday);
  trackChordPage(`voicing_${voicing}`, chart.name);
}));

el.modeButtons.forEach(btn => btn.addEventListener('click', () => {
  if (btn.dataset.mode === mode) return;
  setMode(btn.dataset.mode);
  setTuning(effectiveTuning());
  updateUrl({ with: pairActive() ? partner.iso : null, tuning: tuningParam() });
  show(shown.iso, shown.isToday);
  if (mode === 'pair' && !partner) el.pairDate.focus();
  trackChordPage(`mode_${mode}`, chart.name);
}));

el.tuningButtons.forEach(btn => btn.addEventListener('click', () => {
  if (btn.dataset.tuning === tuning) return;
  tuningChoice[mode] = btn.dataset.tuning;
  setTuning(btn.dataset.tuning);
  updateUrl({ tuning: tuningParam() });
  show(shown.iso, shown.isToday);
  trackChordPage(`tuning_${tuning}`, chart.name);
}));

el.pairPlay.addEventListener('click', playPair);
el.arpToggle.addEventListener('click', () => {
  if (arp || el.arpToggle.getAttribute('aria-pressed') === 'true') stopAll();
  else startArp();
});
el.arpTempo.addEventListener('input', () => { el.arpBpm.textContent = el.arpTempo.value; });
// Live while playing: the arpeggiator rebuilds its cycle; walks and strums check every step
el.arpPattern.addEventListener('change', rebuildArp);
el.arpOuter.addEventListener('change', () => {
  for (const k of FAR_PLANETS) {
    if (el.arpOuter.checked) arpExcluded.delete(k);
    else arpExcluded.add(k);
  }
  syncArpUI();
  rebuildArp();
});
el.playWalk.addEventListener('click', playWalk);
el.playYou.addEventListener('click', () => playSolo('you'));
el.playThem.addEventListener('click', () => playSolo('them'));
el.playChord.addEventListener('click', playChord);

// ── First-visit explainer (+ LunarLog), like the Venus explainer on the main app ──

const EXPLAINER_KEY = 'rv_seen_astrochord_explainer';

function maybeShowExplainer() {
  try {
    if (localStorage.getItem(EXPLAINER_KEY)) return;
  } catch {
    return;   // storage blocked: don't show it on every visit
  }
  const overlay = document.getElementById('cp-explainer');
  document.getElementById('cp-explainer-when').textContent = shown?.isToday
    ? 'Right now, the sky plays'
    : 'When you were born, the sky played';
  setChordText(document.getElementById('cp-explainer-chord'), chart.name);

  const onKey = e => { if (e.key === 'Escape') dismiss('escape'); };
  function dismiss(action) {
    overlay.classList.remove('is-visible');
    try { localStorage.setItem(EXPLAINER_KEY, '1'); } catch { /* fine */ }
    document.removeEventListener('keydown', onKey);
    overlay.addEventListener('transitionend', () => { overlay.hidden = true; }, { once: true });
    trackChordPage(`explainer_${action}`, chart.name);
  }

  overlay.hidden = false;
  overlay.offsetHeight;   // force reflow so the fade-in transition runs
  overlay.classList.add('is-visible');
  overlay.querySelector('.cp-explainer-card').focus({ preventScroll: true });   // keyboard-ready, no ring on a button

  document.getElementById('cp-explainer-close').onclick = () => dismiss('close');
  overlay.onclick = e => { if (e.target === overlay) dismiss('backdrop'); };
  document.addEventListener('keydown', onKey);
  for (const [id, action] of [['cp-explainer-lunarlog', 'lunarlog'], ['cp-explainer-icon', 'lunarlog_icon'], ['cp-explainer-inline', 'lunarlog_inline']]) {
    document.getElementById(id).onclick = () => {
      trackOutboundClick('lunarlog');
      dismiss(action);
    };
  }
}

drawWheel();
const query = new URLSearchParams(location.search);
fillTimeZones();
if (validTime(query.get('time')) || validTime(query.get('wtime'))) {
  setExactTime(true);
  if (validTime(query.get('time'))) el.time.value = query.get('time');
  if (validTime(query.get('wtime'))) el.pairTime.value = query.get('wtime');
  for (const [param, select] of [['tz', el.tz], ['wtz', el.pairTz]]) {
    const z = query.get(param);
    if (z && [...select.options].some(o => o.value === z)) select.value = z;
  }
}
setVoicing(query.get('voicing'));
setPartner(query.get('with'));
setMode(partner ? 'pair' : 'single');
if (TUNINGS[query.get('tuning')]) tuningChoice[mode] = query.get('tuning');
setTuning(effectiveTuning());
const fromUrl = query.get('date');
if (parseISODate(fromUrl)) show(fromUrl, false);
else show(todayISO(), true);
setTimeout(maybeShowExplainer, 900);
