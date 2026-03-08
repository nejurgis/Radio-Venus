const SIGN_ELEMENTS   = ['fire','earth','air','water','fire','earth','air','water','fire','earth','air','water'];
const SIGN_MODALITIES = ['cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable','cardinal','fixed','mutable'];

function angularDist(a, b) { const d = Math.abs(a - b); return d > 180 ? 360 - d : d; }

function venusSimilarity(userLon, artistLon) {
  const d = angularDist(userLon, artistLon);
  const userSign    = Math.floor(userLon   / 30);
  const artistSign  = Math.floor(artistLon / 30);
  const sameSign    = userSign === artistSign;
  const userDecan   = Math.floor((userLon   % 30) / 10);
  const artistDecan = Math.floor((artistLon % 30) / 10);
  const sameDecan   = userDecan === artistDecan;
  if (sameSign && sameDecan)  return Math.round(100 - d);
  if (sameSign)               return Math.round(89 - (d / 30) * 19);
  const sameElement  = SIGN_ELEMENTS[userSign]   === SIGN_ELEMENTS[artistSign];
  const sameModality = SIGN_MODALITIES[userSign] === SIGN_MODALITIES[artistSign];
  if (sameElement || sameModality) {
    const nearBound = Math.min(
      angularDist(userLon, artistSign * 30),
      angularDist(userLon, artistSign * 30 + 30)
    );
    return Math.round(40 + (1 - nearBound / 180) * 24 + (1 - d / 180) * 5);
  }
  return Math.round((1 - d / 180) * 39);
}

// User: Gemini 21° (lon=81)
const user = 81;
console.log('=== T3 sign groups (Gemini 21°) ===');
const cases = [
  ['Virgo 1°   (T3 near)', 151],
  ['Virgo 15°  (T3)',      165],
  ['Virgo 28°  (T3 far)',  178],
  ['---'],
  ['Pisces 28° (T3 near)', 358],
  ['Pisces 15° (T3)',      345],
  ['Pisces 1°  (T3 far)',  331],
  ['---'],
  ['Libra 1°   (T3 near)', 181],
  ['Libra 15°  (T3)',      195],
  ['Libra 28°  (T3 far)',  208],
  ['---'],
  ['Aquarius 29° (T3)',    329],
  ['Aquarius 3°  (T3)',    303],
  ['---'],
  ['Sag 1°  (T3 far)',     241],
  ['---'],
  ['Leo 29.9° (T4)',       149.9],
  ['Taurus 21° (T4)',       51],
  ['Cancer 5°  (T4)',       95],
];
for (const c of cases) {
  if (c.length === 1) { console.log(''); continue; }
  const [label, lon] = c;
  console.log(`  ${label.padEnd(22)} → ${venusSimilarity(user, lon)}%`);
}
console.log('\nTier boundaries: T1=90-100, T2=70-89, T3=40-69, T4=0-39');
