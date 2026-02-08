import { calculateVenus, makeBirthDate } from '../src/venus.js';

const tests = [
  { name: 'Aphex Twin',    d: 18, m: 8,  y: 1971, expected: 'Leo' },
  { name: 'Frank Ocean',   d: 28, m: 10, y: 1987, expected: 'Scorpio' },
  { name: 'Thom Yorke',    d: 7,  m: 10, y: 1968, expected: 'Scorpio' },
  { name: 'David Bowie',   d: 8,  m: 1,  y: 1947, expected: 'Sagittarius' },
  { name: 'Bjork',         d: 21, m: 11, y: 1965, expected: 'Capricorn' },
  { name: 'Prince',        d: 7,  m: 6,  y: 1958, expected: 'Taurus' },
  { name: 'Kurt Cobain',   d: 20, m: 2,  y: 1967, expected: 'Pisces' },
  { name: 'Lana Del Rey',  d: 21, m: 6,  y: 1985, expected: 'Taurus' },
];

let pass = 0;
let fail = 0;

for (const t of tests) {
  const result = calculateVenus(makeBirthDate(t.d, t.m, t.y));
  const ok = result.sign === t.expected;
  if (ok) pass++; else fail++;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status} ${t.name}: Venus in ${result.sign} ${result.degree}° (decan ${result.decan}) — expected ${t.expected}`);
}

console.log(`\n${pass}/${tests.length} passed`);
if (fail > 0) process.exit(1);
