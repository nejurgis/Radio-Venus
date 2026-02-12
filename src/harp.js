// ── Zodiac Harp: Karplus-Strong plucked string synthesis ─────────────────────
//
// Each artist dot on the zodiac wheel is a string. When the tuner needle
// crosses a dot, it plucks a note. Pitch is mapped to radial position
// (inner = low, outer = high) on a C major triad across octaves.
// Using only chord tones (C, E, G) guarantees every combination is harmonic.

let audioCtx = null;
let masterGain = null;
let enabled = false;

// Buffer pool to reduce GC pressure during fast plucking
const bufferPool = [];
const MAX_POOL = 6;

// Element → chord across 5 octaves, each always harmonic within itself
const ELEMENT_CHORDS = {
  // Fire: Major — bright, energetic, triumphant
  fire: [
    130.81, 164.81, 196.00,  // C3 E3 G3
    261.63, 329.63, 392.00,  // C4 E4 G4
    523.25, 659.25, 783.99,  // C5 E5 G5
    1046.5, 1318.5, 1568.0,  // C6 E6 G6
    2093.0, 2637.0, 3136.0,  // C7 E7 G7
  ],
  // Water: Minor — melancholic, emotional, deep
  water: [
    130.81, 155.56, 196.00,  // C3 Eb3 G3
    261.63, 311.13, 392.00,  // C4 Eb4 G4
    523.25, 622.25, 783.99,  // C5 Eb5 G5
    1046.5, 1244.5, 1568.0,  // C6 Eb6 G6
    2093.0, 2489.0, 3136.0,  // C7 Eb7 G7
  ],
  // Earth: Sus4 — heavy, tectonic, grounded (no 3rd = pure stability)
  // One octave lower than fire/water, capped at G5
  earth: [
    65.41,  87.31,  98.00,   // C2 F2 G2
    130.81, 174.61, 196.00,  // C3 F3 G3
    261.63, 349.23, 392.00,  // C4 F4 G4
    523.25, 698.46, 783.99,  // C5 F5 G5
  ],
  // Air: Add9 — dreamy, ethereal, positive (D adds openness, E keeps warmth)
  // Starts at C4: air is always higher than earth
  air: [
    261.63, 293.66, 329.63, 392.00,  // C4 D4 E4 G4
    523.25, 587.33, 659.25, 783.99,  // C5 D5 E5 G5
    1046.5, 1174.7, 1318.5, 1568.0,  // C6 D6 E6 G6
    2093.0, 2349.3, 2637.0, 3136.0,  // C7 D7 E7 G7
  ],
};

// Element → decay character
const ELEMENT_DECAY = {
  fire:  0.998,  // bright, longer ring
  water: 0.994,  // darker, shorter
  earth: 0.996,  // warm middle
  air:   0.997,  // light, clear
};

function ensureContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.25;

  // Two-tap delay for ethereal reverb
  const delay1 = audioCtx.createDelay(2);
  delay1.delayTime.value = 0.4;
  const fb1 = audioCtx.createGain();
  fb1.gain.value = 0.35;

  const delay2 = audioCtx.createDelay(2);
  delay2.delayTime.value = 0.65;
  const fb2 = audioCtx.createGain();
  fb2.gain.value = 0.25;

  // Darken the reverb tail with a lowpass
  const reverbFilter = audioCtx.createBiquadFilter();
  reverbFilter.type = 'lowpass';
  reverbFilter.frequency.value = 1800;

  const wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.45;

  // Dry path
  masterGain.connect(audioCtx.destination);

  // Wet path: master → filter → delay1 → fb1 → delay1 (loop)
  //                            delay1 → delay2 → fb2 → delay2 (loop)
  //                            delay1 + delay2 → wet → destination
  masterGain.connect(reverbFilter);
  reverbFilter.connect(delay1);
  delay1.connect(fb1);
  fb1.connect(delay1);

  reverbFilter.connect(delay2);
  delay2.connect(fb2);
  fb2.connect(delay2);

  delay1.connect(wetGain);
  delay2.connect(wetGain);
  wetGain.connect(audioCtx.destination);
}

/**
 * Pluck a harp string using Karplus-Strong synthesis.
 * @param {number} radialFrac - 0 (inner) to 1 (outer) → maps to pitch
 * @param {string} element - fire|water|earth|air → affects decay
 * @param {number} velocity - 0 to 1 → loudness & brightness
 */
export function pluck(radialFrac, element = 'air', velocity = 0.5) {
  if (!enabled) return;
  ensureContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  // Map radial position to element-specific chord note
  const chord = ELEMENT_CHORDS[element] || ELEMENT_CHORDS.air;
  const noteIdx = Math.floor(Math.min(0.999, radialFrac) * chord.length);
  const freq = chord[noteIdx];

  // Karplus-Strong parameters
  const sampleRate = audioCtx.sampleRate;
  // Lower notes ring longer (up to 5s), higher notes shorter (2.5s)
  const duration = 2.5 + (1 - radialFrac) * 2.5;
  const samples = Math.floor(sampleRate * duration);
  const period = Math.round(sampleRate / freq);
  const decay = ELEMENT_DECAY[element] || 0.996;

  const vel = Math.min(1, Math.max(0.1, velocity));

  // Reuse pooled buffer or allocate new one
  let buffer = bufferPool.findIndex(b => b.length >= samples);
  if (buffer >= 0) {
    buffer = bufferPool.splice(buffer, 1)[0];
  } else {
    buffer = audioCtx.createBuffer(1, samples, sampleRate);
  }
  const data = buffer.getChannelData(0);
  data.fill(0);

  // Seed delay line with noise, scaled gently
  for (let i = 0; i < period; i++) {
    data[i] = (Math.random() * 2 - 1) * vel * 0.6;
  }
  // Heavy pre-filtering for soft, rounded attack (more passes = mellower)
  const filterPasses = 4 + Math.floor((1 - vel) * 4);
  for (let pass = 0; pass < filterPasses; pass++) {
    for (let i = 1; i < period; i++) {
      data[i] = 0.6 * data[i] + 0.4 * data[i - 1];
    }
  }

  // Karplus-Strong loop
  for (let i = period; i < samples; i++) {
    const next = i - period + 1 < samples ? i - period + 1 : i - period;
    data[i] = decay * 0.5 * (data[i - period] + data[next]);
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const noteGain = audioCtx.createGain();
  noteGain.gain.value = vel * 0.35;

  source.connect(noteGain);
  noteGain.connect(masterGain);
  source.onended = () => {
    if (bufferPool.length < MAX_POOL) bufferPool.push(buffer);
  };
  source.start();
  source.stop(audioCtx.currentTime + duration);
}

export function setHarpEnabled(on) {
  enabled = on;
  if (on) ensureContext();
}

export function isHarpEnabled() {
  return enabled;
}
