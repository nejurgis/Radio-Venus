// ── Chart chord: natal planets → a playable chord ───────────────────────────
//
// The zodiac is laid over the circle of fifths with Aries = C, so neighbouring
// signs are a fifth apart. The astrological groupings then land exactly on the
// symmetric sets of 12-TET: elements are augmented triads (trine = major 3rd),
// modalities are diminished 7ths (square = minor 3rd), oppositions are
// tritones, sextiles are whole steps.
//
// A second tuning follows "Musical Astrology": signs in chromatic order with
// Aquarius = C, and every degree worth 100/30 = 3.33 cents, exact at 15° of a
// sign. Both orders give the same symmetric shapes (trines, squares,
// oppositions, sextiles); only semi-sextiles and quincunxes swap between a
// fifth and a semitone.
//
// Voicing: the Sun is the root in the bass, the personal planets (Moon,
// Mercury, Venus, Mars) build the chord, Venus sings on top, and the slow
// outer planets shimmer quietly above. The degree within each sign detunes its
// note, so two charts in the same signs still sound different.

import { Body, GeoVector, Ecliptic, SiderealTime, MakeTime } from 'astronomy-engine';

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

/**
 * How signs become pitches. `pitchClass` maps a sign index (Aries = 0) to a
 * pitch class; `centsPerDegree` detunes away from the sign's 15° centre.
 */
export const TUNINGS = {
  fifths: {
    label: 'circle of fifths',
    pitchClass: signIndex => (signIndex * 7) % 12,          // Aries = C, up a fifth per sign
    centsPerDegree: 8 / 15,                                  // a light ±8¢ shimmer
    noteNames: NOTE_NAMES,
  },
  pythagorean: {
    label: 'pythagorean',
    pitchClass: signIndex => (signIndex * 7) % 12,          // Aries = C, up a PURE 3:2 fifth per sign
    centsPerDegree: 0,                                       // pure ratios: no per-degree detune
    // How far the pure chain sits above 12-TET: 1.955¢ more per fifth. After
    // twelve fifths it overshoots the octave by the Pythagorean comma (23.46¢),
    // so the "wolf" fifth falls between Pisces and Aries — the year doesn't close.
    signCents: signIndex => signIndex * (1200 * Math.log2(3 / 2) - 700),
    noteNames: ['C', 'C♯', 'D', 'D♯', 'E', 'E♯', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],   // spelled up the chain
  },
  chromatic: {
    label: 'chromatic · musical astrology',
    pitchClass: signIndex => (signIndex + 2) % 12,          // Aquarius = C, up a semitone per sign
    centsPerDegree: 100 / 30,                                // exact: ±50¢, continuous across signs
    noteNames: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
  },
};

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// ︎ forces text (not emoji) presentation on iOS
const PERSONAL = [
  { key: 'sun',     name: 'Sun',     body: Body.Sun,     glyph: '☉' },
  { key: 'moon',    name: 'Moon',    body: Body.Moon,    glyph: '☽' },
  { key: 'mercury', name: 'Mercury', body: Body.Mercury, glyph: '☿' },
  { key: 'venus',   name: 'Venus',   body: Body.Venus,   glyph: '♀︎' },
  { key: 'mars',    name: 'Mars',    body: Body.Mars,    glyph: '♂︎' },
];

const OUTER = [
  { key: 'jupiter', name: 'Jupiter', body: Body.Jupiter, glyph: '♃' },
  { key: 'saturn',  name: 'Saturn',  body: Body.Saturn,  glyph: '♄' },
  { key: 'uranus',  name: 'Uranus',  body: Body.Uranus,  glyph: '♅' },
  { key: 'neptune', name: 'Neptune', body: Body.Neptune, glyph: '♆' },
  { key: 'pluto',   name: 'Pluto',   body: Body.Pluto,   glyph: '♇' },
];

const BASS_MIDI = 36;         // Sun root lands in C2–B2
const SHIMMER_MIDI = 72;      // outer planets start from C5–B5, lifted above Venus
const SHIMMER_MAX_MIDI = 96;  // C7 — keep the shimmer out of whistle range
const STRUM_GAP = 0.07;       // seconds between chord strings

// "By orbit speed" voicing: slow planets low, fast planets high, in Kepler's
// choir parts (Harmonices Mundi, 1619). Each planet sounds its sign's note in
// its part's octave: bass = the generational planets, tenor = Saturn and
// Jupiter, alto = Mars, Sun, Venus, Mercury, soprano = the Moon.
const ORBIT_OCTAVE = {
  pluto: 36, neptune: 36, uranus: 36,          // bass    C2–B2
  saturn: 48, jupiter: 48,                     // tenor   C3–B3
  mars: 60, sun: 60, venus: 60, mercury: 60,   // alto    C4–B4
  moon: 72,                                    // soprano C5–B5
};
const SLOW_TO_FAST = ['pluto', 'neptune', 'uranus', 'saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];
// The three furthest planets — the page's "outer three" switch can drop them (and only them)
export const FAR_PLANETS = new Set(['uranus', 'neptune', 'pluto']);

/** Orbit-speed voicing: sets each planet's `freqs` and returns the chord, rolled up from the bass. */
function orbitVoicing(planets, outer) {
  const all = [...planets, ...outer];
  const strings = [];
  for (const key of SLOW_TO_FAST) {
    const p = all.find(x => x.key === key);
    const midi = ORBIT_OCTAVE[key] + p.pc;
    p.freqs = [midiToFreq(midi, p.cents)];
    const shared = strings.find(t => t.midi === midi);
    if (shared) shared.planets.push(p);
    else strings.push({ midi, planets: [p] });
  }
  strings.sort((a, b) => a.midi - b.midi);
  return strings.map((t, i) => {
    const outerOnly = t.planets.every(p => outer.includes(p));
    const farOnly = t.planets.every(p => FAR_PLANETS.has(p.key));
    const cents = t.planets.reduce((sum, p) => sum + p.cents, 0) / t.planets.length;
    const hasVenus = t.planets.some(p => p.key === 'venus');
    return {
      freq: midiToFreq(t.midi, cents),
      velocity: hasVenus ? 0.65 : outerOnly ? 0.4 : 0.5,
      delay: i * STRUM_GAP,
      duration: t.midi < 48 ? 4 : 3,
      ...(farOnly ? { far: true } : {}),
    };
  });
}
const SHIMMER_START = 0.45;   // outer planets enter after the chord
const SHIMMER_GAP = 0.11;

/** Pitch class of a sign under a tuning (default: circle of fifths, Aries = C). */
export function signPitchClass(signIndex, tuning = 'fifths') {
  return TUNINGS[tuning].pitchClass(signIndex);
}

/** Display name of a sign's note under a tuning. */
export function signNoteName(signIndex, tuning = 'fifths') {
  return TUNINGS[tuning].noteNames[signPitchClass(signIndex, tuning)];
}

function placePlanet(planet, date, tuning) {
  return placePoint(planet, Ecliptic(GeoVector(planet.body, date, true)).elon, tuning);
}

/** Any ecliptic longitude (a planet, or the Ascendant) → sign, note and detune. */
function placePoint(point, longitude, tuning) {
  const signIndex = Math.floor(longitude / 30) % 12;
  const pc = signPitchClass(signIndex, tuning);
  const degree = longitude - signIndex * 30;
  return {
    key: point.key,
    name: point.name,
    glyph: point.glyph,
    longitude,
    signIndex,
    sign: SIGNS[signIndex],
    degree,
    pc,
    note: TUNINGS[tuning].noteNames[pc],
    cents: (degree - 15) * TUNINGS[tuning].centsPerDegree + (TUNINGS[tuning].signCents?.(signIndex) || 0),
  };
}

/**
 * The Ascendant: the ecliptic degree rising on the eastern horizon at a given
 * moment and place. Needs the birth time AND the birthplace — it sweeps through
 * all twelve signs every day, roughly one sign every two hours.
 * @param {Date} date - UTC instant
 * @param {number} latitude - degrees, north positive
 * @param {number} longitude - degrees, east positive
 * @returns {number} ecliptic longitude, 0–360
 */
export function ascendantLongitude(date, latitude, longitude) {
  const ramc = (((SiderealTime(date) * 15 + longitude) % 360) + 360) % 360;   // local sidereal time in degrees
  const centuries = MakeTime(date).tt / 36525;
  const obliquity = ((23.439291 - 0.0130042 * centuries) * Math.PI) / 180;
  const r = (ramc * Math.PI) / 180;
  const phi = (latitude * Math.PI) / 180;
  const asc = Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(obliquity) + Math.tan(phi) * Math.sin(obliquity)));
  return (((asc * 180) / Math.PI) % 360 + 360) % 360;
}

function midiToFreq(midi, cents = 0) {
  return 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);
}

/**
 * Name a pitch-class set relative to its root.
 * @param {Set<number>} intervals - semitones above the root, including 0
 */
export function chordSuffix(intervals) {
  // Every personal planet in one sign — a single note, not a major triad
  if (intervals.size === 1) return ' (unison)';
  const rest = new Set(intervals);
  rest.delete(0);
  const has = n => rest.has(n);

  const third = has(4) ? 4 : has(3) ? 3 : null;
  if (third) rest.delete(third);

  let fifth = null;
  if (has(7)) fifth = 7;
  else if (third === 3 && has(6)) fifth = 6;
  else if (third === 4 && has(8)) fifth = 8;
  if (fifth) rest.delete(fifth);

  let seventh = null;
  if (has(10)) seventh = 10;
  else if (has(11)) seventh = 11;
  else if (third === 3 && fifth === 6 && has(9)) seventh = 9;
  if (seventh) rest.delete(seventh);

  let sus = '';
  if (!third) {
    if (has(5)) { sus = 'sus4'; rest.delete(5); }
    else if (has(2)) { sus = 'sus2'; rest.delete(2); }
  }

  const sev = seventh === 11 ? 'maj7' : seventh === 10 ? '7' : '';
  let base;
  if (third === 4) {
    if (fifth === 8) base = seventh ? `${sev}♯5` : 'aug';
    else base = sev;
  } else if (third === 3) {
    if (fifth === 6) {
      base = seventh === 9 ? 'dim7' : seventh === 10 ? 'm7♭5' : seventh === 11 ? 'dim(maj7)' : 'dim';
    } else {
      base = seventh === 11 ? 'm(maj7)' : `m${sev}`;
    }
  } else if (sus) {
    base = `${sev}${sus}`;
  } else if (seventh) {
    base = `${sev}(no3)`;
  } else {
    base = fifth === 7 ? '5' : '';
  }

  // Leftover tones become extensions; spelling depends on whether a 7th is present
  const hasSeventh = seventh !== null;
  const EXT = {
    1: '♭9',
    2: '9',
    3: '♯9',
    5: '11',
    6: fifth === 7 ? '♯11' : '♭5',
    8: hasSeventh ? '♭13' : '♭6',
    9: hasSeventh ? '13' : '6',
    10: '♭7',
    11: 'maj7',
  };
  let exts = [...rest].sort((a, b) => a - b).map(n => EXT[n]);

  if (hasSeventh) {
    // 7 + 9 → 9, m7 + 9 → m9, maj7 + 9 → maj9
    if (exts.includes('9') && ['7', 'm7', 'maj7'].includes(base)) {
      base = base.replace('7', '9');
      exts = exts.filter(e => e !== '9');
    }
    return withParens(base, exts.join(','));
  }

  // No 7th: a major 6th reads as "6" (and 6 + 9 as "6/9")
  if (exts.includes('6') && ['', 'm', '5', 'sus4', 'sus2'].includes(base)) {
    const six = exts.includes('9') ? '6/9' : '6';
    exts = exts.filter(e => e !== '6' && e !== (six === '6/9' ? '9' : null));
    if (base === '5') base = `${six}(no3)`;
    else if (base.startsWith('sus')) base = `${six}${base}`;
    else base = `${base}${six}`;
  }
  if (!exts.length) return base;
  if (!base && exts.length === 1 && !/^[♭♯]/.test(exts[0])) return `add${exts[0]}`;
  return withParens(base, `add${exts.join(',')}`);
}

/** Append "(x)" to a chord suffix, merging into a trailing "(...)" instead of stacking two. */
function withParens(base, inner) {
  if (!inner) return base;
  if (base.endsWith(')')) return `${base.slice(0, -1)},${inner})`;
  return `${base}(${inner})`;
}

/** Keep any two chord strings at least a whole step apart by lifting the upper one an octave. */
function spreadSemitones(tones) {
  for (let pass = 0; pass < 8; pass++) {
    tones.sort((a, b) => a.midi - b.midi);
    const clash = tones.findIndex((t, i) => i > 0 && t.midi - tones[i - 1].midi === 1);
    if (clash < 0) return;
    tones[clash].midi += 12;
  }
}

/**
 * Compute the chord for a birth date.
 *
 * Every planet also gets `freqs` — the pitch(es) it plays on its own, in the
 * same voicing as the chord (Sun = bass + root, outer planets = shimmer octave),
 * so a page can walk through the chart one planet at a time.
 *
 * @param {Date} birthDate
 * @param {'fifths'|'chromatic'} [tuning]
 * @param {'classic'|'orbit'} [voicing] - classic: Sun root, Venus on top, outer planets shimmer above;
 *   orbit: slow planets low, fast planets high (choir parts)
 * @param {{ ascendant?: number }} [options] - ascendant: ecliptic longitude of the rising degree; when
 *   given it replaces the Sun as the root (bass, and the note the chord is named from)
 * @returns {{ name: string, root: string, tuning: string, planets: object[], outer: object[], notes: {freq:number, velocity:number, delay:number, duration:number}[] }}
 */
export function calculateChartChord(birthDate, tuning = 'fifths', voicing = 'classic', options = {}) {
  const planets = PERSONAL.map(p => placePlanet(p, birthDate, tuning));
  const outer = OUTER.map(p => placePlanet(p, birthDate, tuning));
  const [sun, , , venus] = planets;
  const ascendant = options.ascendant == null ? null
    : placePoint({ key: 'asc', name: 'Ascendant', glyph: 'AC' }, options.ascendant, tuning);
  // The Ascendant roots the classic voicing; "slow = low" has no single root, so it stays Sun-named
  const root = ascendant && voicing !== 'orbit' ? ascendant : sun;
  const rootPc = root.pc;
  const intervals = new Set([root, ...planets].map(p => (p.pc - rootPc + 12) % 12));
  const name = `${root.note}${chordSuffix(intervals)}`;

  if (voicing === 'orbit') {
    if (ascendant) ascendant.freqs = [midiToFreq(60 + ascendant.pc, ascendant.cents)];
    return { name, root: root.note, tuning, voicing, ascendant, planets, outer, notes: orbitVoicing(planets, outer) };
  }

  // ── Chord strings (root doubled — the Sun, or the Ascendant — then the personal planets) ──
  const bass = { midi: BASS_MIDI + rootPc, cents: root.cents, velocity: 0.6, planets: [root] };
  const rootUp = { midi: BASS_MIDI + 12 + rootPc, cents: root.cents, velocity: 0.45, planets: [root] };
  const tones = [bass, rootUp];
  const upper = [];
  for (const p of ascendant ? planets : planets.slice(1)) {
    if (p.pc === rootPc && p !== venus) {
      rootUp.planets.push(p);
      continue;
    }
    const existing = upper.find(t => t.pc === p.pc);
    if (existing) {
      existing.planets.push(p);
      continue;
    }
    const interval = (p.pc - rootPc + 12) % 12 || 12;
    upper.push({ pc: p.pc, midi: rootUp.midi + interval, cents: p.cents, velocity: 0.45, planets: [p] });
  }
  // A string shared by several planets sounds at their average detune
  for (const t of upper) t.cents = t.planets.reduce((sum, p) => sum + p.cents, 0) / t.planets.length;
  tones.push(...upper);
  spreadSemitones(tones);

  // Venus sings on top, at least a whole step above everything else
  const venusTone = upper.find(t => t.planets.includes(venus));
  venusTone.velocity = 0.7;
  const others = tones.filter(t => t !== venusTone);
  const ceiling = Math.max(...others.map(t => t.midi));
  while (venusTone.midi < ceiling + 2) venusTone.midi += 12;
  tones.sort((a, b) => a.midi - b.midi);

  const notes = tones.map((t, i) => ({
    freq: midiToFreq(t.midi, t.cents),
    velocity: t.velocity,
    delay: i * STRUM_GAP,
    duration: t === bass ? 4 : 3,
  }));

  for (const p of [root, ...planets]) {
    p.freqs = p === root
      ? [midiToFreq(bass.midi, p.cents), midiToFreq(rootUp.midi, p.cents)]
      : [midiToFreq(tones.find(t => t !== bass && t.planets.includes(p)).midi, p.cents)];
  }

  // ── Outer planets: soft high shimmer above Venus so it never rubs the melody ──
  const shimmerMidi = pc => {
    let midi = SHIMMER_MIDI + pc;
    while (midi < venusTone.midi + 2) midi += 12;
    return midi > SHIMMER_MAX_MIDI ? midi - 12 : midi;
  };
  for (const p of outer) p.freqs = [midiToFreq(shimmerMidi(p.pc), p.cents)];

  // In the chord itself, only the tones the personal planets lack
  const chordPcs = new Set([root, ...planets].map(p => p.pc));
  const shimmer = [];
  for (const p of outer) {
    if (chordPcs.has(p.pc)) continue;
    const shared = shimmer.find(s => s.pc === p.pc);
    if (shared) shared.keys.push(p.key);
    else shimmer.push({ pc: p.pc, midi: shimmerMidi(p.pc), cents: p.cents, keys: [p.key] });
  }
  shimmer.sort((a, b) => a.midi - b.midi);
  const shimmerStart = notes.length * STRUM_GAP + SHIMMER_START;
  shimmer.forEach((s, i) => {
    notes.push({
      freq: midiToFreq(s.midi, s.cents),
      velocity: 0.2,
      delay: shimmerStart + i * SHIMMER_GAP,
      duration: 2,
      // Lets playback drop it when Uranus/Neptune/Pluto are switched off (only if it's theirs alone)
      ...(s.keys.every(k => FAR_PLANETS.has(k)) ? { far: true } : {}),
    });
  });

  return {
    name,
    root: root.note,
    tuning,
    voicing,
    ascendant,
    planets,
    outer,
    notes,
  };
}
