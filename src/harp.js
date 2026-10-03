// ── Zodiac Harp: Karplus-Strong plucked string synthesis ─────────────────────
//
// Each artist dot on the zodiac wheel is a string. When the tuner needle
// crosses a dot, it plucks a note. Pitch is mapped to radial position
// (inner = low, outer = high) on a C major triad across octaves.
// Using only chord tones (C, E, G) guarantees every combination is harmonic.

let audioCtx = null;
let masterGain = null;
let enabled = false;
let silentAudio = null;
let strumReleaseTimer = null;
const strumVoices = new Set();
// Strums start slightly ahead of "now" so every string in the chord is scheduled in time
export const STRUM_LEAD = 0.05;

// Rate limiting — minimum ms between plucks so notes can breathe
const MIN_INTERVAL = 35;
let lastPluckTime = 0;

// Buffer pool to reduce GC pressure during fast plucking
const bufferPool = [];
const MAX_POOL = 8;

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
  // Air: Maj9(no3) — glassy, open stacked 5ths (no E avoids Fire overlap)
  // Starts at C4: air floats above earth
  air: [
    261.63, 392.00, 493.88, 587.33,  // C4 G4 B4 D5
    523.25, 783.99, 987.77, 1174.7,  // C5 G5 B5 D6
    1046.5, 1568.0, 1975.5, 2349.3,  // C6 G6 B6 D7
    2093.0, 3136.0, 3951.1, 4698.6,  // C7 G7 B7 D8
  ],
};

// Element → decay character
const ELEMENT_DECAY = {
  fire:  0.990,  // bright, longer ring
  water: 0.994,  // darker, shorter
  earth: 0.996,  // warm middle
  air:   0.999,  // light, clear
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
  const now = performance.now();
  if (now - lastPluckTime < MIN_INTERVAL) return;
  lastPluckTime = now;
  ensureContext();
  if (audioCtx.state !== 'running') audioCtx.resume();

  // Map radial position to element-specific chord note
  const chord = ELEMENT_CHORDS[element] || ELEMENT_CHORDS.air;
  const noteIdx = Math.floor(Math.min(0.999, radialFrac) * chord.length);
  const freq = chord[noteIdx];

  // Lower notes ring longer (up to 2s), higher notes shorter (1s)
  // Reverb tail adds sustain, so buffers can be short
  const duration = 1.0 + (1 - radialFrac) * 1.0;
  playString(freq, element, velocity, duration, audioCtx.currentTime);
}

/**
 * Karplus-Strong plucked string at an exact frequency.
 * @param {number} freq - Hz
 * @param {string} element - fire|water|earth|air → decay & tone colour
 * @param {number} velocity - 0 to 1 → loudness & brightness
 * @param {number} duration - seconds of buffer to render
 * @param {number} when - AudioContext time to start
 */
function playString(freq, element, velocity, duration, when) {
  const sampleRate = audioCtx.sampleRate;
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

  // Seed delay line — element shapes the noise amplitude
  const noiseAmp = element === 'earth' ? 0.48 : element === 'air' ? 0.72 : 0.6;
  for (let i = 0; i < period; i++) {
    data[i] = (Math.random() * 2 - 1) * vel * noiseAmp;
  }
  // Pre-filtering: more passes = duller (gut string), fewer = brighter (steel)
  const basePasses = element === 'earth' ? 8 : element === 'air' ? 8 : element === 'fire' ? 3 : 4;
  const filterPasses = basePasses + Math.floor((1 - vel) * 4);
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
  const gainMod = element === 'earth' ? 1.3 : 1.0;
  noteGain.gain.value = vel * 0.35 * gainMod;

  source.connect(noteGain);
  noteGain.connect(masterGain);
  source.onended = () => {
    if (bufferPool.length < MAX_POOL) bufferPool.push(buffer);
  };
  source.start(when);
  source.stop(when + duration);
}

// ── Piano voice (chart chord) ────────────────────────────────────────────────
// Additive synthesis on oscillators, so all the work happens on the audio
// thread: slightly stretched (inharmonic) partials like real piano strings,
// a doubled, faintly detuned fundamental for the chorus of a piano's unison
// strings, a short hammer thump, and a lowpass that darkens as the note decays.

const PIANO_PARTIALS = [1, 0.42, 0.26, 0.15, 0.08, 0.045];
const PIANO_INHARMONICITY = 0.0004;
// Element → brightness of the hammer and filter
const PIANO_BRIGHTNESS = { fire: 1.25, air: 1.1, earth: 0.85, water: 0.75 };
let hammerNoise = null;

function getHammerNoise() {
  if (!hammerNoise) {
    const len = Math.floor(audioCtx.sampleRate * 0.03);
    hammerNoise = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = hammerNoise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  return hammerNoise;
}

/**
 * One piano note.
 * @returns {{ noteGain: GainNode, stop: (t:number) => void, source: AudioScheduledSourceNode }}
 */
function playPiano(freq, element, velocity, duration, when, pan = 0) {
  const vel = Math.min(1, Math.max(0.1, velocity));
  const bright = PIANO_BRIGHTNESS[element] || 1;
  // Low notes sustain longer, high notes die quickly — like a real piano
  const tau = Math.min(1.5, Math.max(0.3, 0.2 + 120 / freq));
  const end = when + duration;

  const noteGain = audioCtx.createGain();
  const peak = vel * 0.55;
  noteGain.gain.setValueAtTime(0, when);
  noteGain.gain.linearRampToValueAtTime(peak, when + 0.005);
  noteGain.gain.setTargetAtTime(peak * 0.45, when + 0.005, 0.09);   // fast initial drop
  noteGain.gain.setTargetAtTime(0, when + 0.25, tau);               // long tail
  noteGain.gain.setTargetAtTime(0, end - 0.2, 0.05);                // click-free cut

  const tone = audioCtx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.4;
  tone.frequency.setValueAtTime(Math.min(12000, freq * 7 * bright * (0.6 + vel)), when);
  tone.frequency.setTargetAtTime(Math.min(8000, freq * 2.5 * bright), when + 0.02, 0.5);
  tone.connect(noteGain);
  if (pan && audioCtx.createStereoPanner) {
    // Side by side: e.g. one person left, the other right
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = pan;
    noteGain.connect(panner);
    panner.connect(masterGain);
  } else {
    noteGain.connect(masterGain);
  }

  const oscs = [];
  const addOsc = (f, amp, decay) => {
    const osc = audioCtx.createOscillator();
    osc.frequency.value = f;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(amp, when);
    if (decay) g.gain.setTargetAtTime(0, when + 0.01, decay);
    osc.connect(g);
    g.connect(tone);
    osc.start(when);
    osc.stop(end);
    oscs.push(osc);
  };

  // Fundamental as two strings ±1 cent apart
  addOsc(freq * Math.pow(2, -1 / 1200), 0.5, 0);
  addOsc(freq * Math.pow(2, 1 / 1200), 0.5, 0);
  // Upper partials, stretched and decaying faster the higher they go
  for (let n = 2; n <= PIANO_PARTIALS.length; n++) {
    const f = freq * n * Math.sqrt(1 + PIANO_INHARMONICITY * n * n);
    if (f > 16000) break;
    addOsc(f, PIANO_PARTIALS[n - 1] * (0.5 + vel * 0.7), tau * 1.4 / n);
  }

  // Hammer: a 30 ms bandpassed noise tick
  const hammer = audioCtx.createBufferSource();
  hammer.buffer = getHammerNoise();
  const hammerTone = audioCtx.createBiquadFilter();
  hammerTone.type = 'bandpass';
  hammerTone.frequency.value = Math.min(5000, 1800 * bright + freq);
  const hammerGain = audioCtx.createGain();
  hammerGain.gain.value = vel * 0.06 * bright;
  hammer.connect(hammerTone);
  hammerTone.connect(hammerGain);
  hammerGain.connect(noteGain);
  hammer.start(when);
  oscs.push(hammer);

  return {
    noteGain,
    source: oscs[0],
    stop: t => oscs.forEach(o => { try { o.stop(t); } catch { /* already stopped */ } }),
  };
}

/**
 * Play a chord (or a sequence) on the piano voice, e.g. the natal chart chord
 * from chord.js. Plays regardless of lyre mode — it's an explicit tap, not
 * ambient plucking. Must be called from a user gesture so iOS unlocks audio.
 * @param {{freq:number, velocity:number, delay:number, duration:number, pan?:number, element?:string}[]} notes
 * @param {string} element - fire|water|earth|air → piano brightness (a note's own `element` wins)
 * @returns {number} seconds until the last note finishes
 */
export function strum(notes, element = 'air') {
  beginPlayback();
  const start = audioCtx.currentTime + STRUM_LEAD;
  let end = 0;
  for (const n of notes) {
    playNoteAt(n.freq, n.element || element, n.velocity, n.duration, start + n.delay, n.pan || 0);
    end = Math.max(end, n.delay + n.duration);
  }
  endPlayback(end + 0.5);
  return end;
}

/**
 * Open a playback session: create/unlock audio and keep the iOS playback
 * route open until endPlayback(). Call from a user gesture.
 */
export function beginPlayback() {
  ensureContext();
  unlockAudio();
  clearTimeout(strumReleaseTimer);
}

/** Let the iOS playback route close `afterSeconds` from now, unless lyre mode needs it. */
export function endPlayback(afterSeconds = 0) {
  clearTimeout(strumReleaseTimer);
  strumReleaseTimer = setTimeout(() => {
    if (!enabled && silentAudio) silentAudio.pause();
  }, afterSeconds * 1000);
}

/** The audio clock, for schedulers that queue notes ahead of time. */
export function audioNow() {
  ensureContext();
  return audioCtx.currentTime;
}

/** Schedule one piano note at an exact audio-clock time; stopStrum() can cancel it. */
export function playNoteAt(freq, element, velocity, duration, when, pan = 0) {
  const voice = playPiano(freq, element, velocity, duration, when, pan);
  strumVoices.add(voice);
  voice.source.addEventListener('ended', () => strumVoices.delete(voice));
}

/**
 * Strike a gong/bell when the needle crosses a zodiac sign boundary.
 * Layered inharmonic sine partials with slow decay — like a temple bell.
 * @param {string} element - fire|water|earth|air → tints the pitch
 * @param {number} velocity - 0 to 1 → loudness
 */
export function gong(element = 'air', velocity = 0.4) {
  if (!enabled) return;
  ensureContext();
  if (audioCtx.state !== 'running') audioCtx.resume();

  const now = audioCtx.currentTime;
  const vel = Math.min(1, Math.max(0.1, velocity));

  // Base frequency per element — lower = more gravitas
  const baseFreq = { earth: 1055, water: 1155, fire: 1255, air: 1355 }[element] || 65;

  // Inharmonic partials (like a real bell — not integer multiples)
  const partials = [1, 1.5, 2.4, 3.2, 4.7];
  const decays   = [4, 3,   2.5, 2,   1.5];
  const amps     = [1, 0.6, 0.4, 0.25, 0.15];

  const mix = audioCtx.createGain();
  mix.gain.value = vel * 0.09;
  mix.connect(masterGain);

  for (let i = 0; i < partials.length; i++) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = baseFreq * partials[i];

    const env = audioCtx.createGain();
    env.gain.setValueAtTime(amps[i], now);
    env.gain.exponentialRampToValueAtTime(0.001, now + decays[i]);

    osc.connect(env);
    env.connect(mix);
    osc.start(now);
    osc.stop(now + decays[i]);
  }
}

/**
 * Half a second of real silence (8 kHz, 8-bit mono) as a data: URI.
 * The old hard-coded WAV had a zero-length data chunk; looping it made the
 * <audio> element restart continuously and pinned a CPU core (~85%), even
 * after pause().
 */
function silentWavDataUri() {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => [...text].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);     // fmt chunk size
  view.setUint16(20, 1, true);      // PCM
  view.setUint16(22, 1, true);      // mono
  view.setUint32(24, 8000, true);   // sample rate
  view.setUint32(28, 8000, true);   // byte rate
  view.setUint16(32, 1, true);      // block align
  view.setUint16(34, 8, true);      // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);              // 8-bit PCM silence is the midpoint
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
}

function unlockAudio() {
  // iOS requires resume() + a silent buffer play during a user gesture
  // to fully unlock audio output. pluck() fires from rAF which can't unlock.
  audioCtx.resume().then(() => {
    // Play a silent buffer to force iOS to open the audio route
    const silent = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const src = audioCtx.createBufferSource();
    src.buffer = silent;
    src.connect(audioCtx.destination);
    src.start();
  });
  // Force iOS "playback" audio session so audio ignores the mute switch.
  // Web Audio alone uses "ambient" category (respects mute switch).
  // Playing through an <audio> element switches to "playback" category.
  if (!silentAudio) {
    silentAudio = new Audio(silentWavDataUri());
    silentAudio.loop = true;
    silentAudio.volume = 0;
  }
  silentAudio.play().catch(() => {});
}

/** Quickly fade out every string still ringing (or waiting to ring) from strum(). */
export function stopStrum() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const { noteGain, stop } of strumVoices) {
    noteGain.gain.cancelScheduledValues(now);
    noteGain.gain.setTargetAtTime(0, now, 0.03);
    stop(now + 0.2);
  }
  strumVoices.clear();
}

export function setHarpEnabled(on) {
  enabled = on;
  if (on) {
    ensureContext();
    unlockAudio();
  } else if (silentAudio) {
    silentAudio.pause();
  }
}

/** Call from any user gesture to keep iOS audio alive */
export function pokeAudio() {
  if (!enabled || !audioCtx) return;
  audioCtx.resume();
}

export function isHarpEnabled() {
  return enabled;
}
