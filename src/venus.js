import { Body, GeoVector, Ecliptic } from 'astronomy-engine';

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const SIGN_GLYPHS = {
  Aries: '\u2648', Taurus: '\u2649', Gemini: '\u264A', Cancer: '\u264B',
  Leo: '\u264C', Virgo: '\u264D', Libra: '\u264E', Scorpio: '\u264F',
  Sagittarius: '\u2650', Capricorn: '\u2651', Aquarius: '\u2652', Pisces: '\u2653',
};

const ELEMENTS = {
  Aries: 'fire', Leo: 'fire', Sagittarius: 'fire',
  Taurus: 'earth', Virgo: 'earth', Capricorn: 'earth',
  Gemini: 'air', Libra: 'air', Aquarius: 'air',
  Cancer: 'water', Scorpio: 'water', Pisces: 'water',
};

export function calculateVenus(birthDate) {
  const geo = GeoVector(Body.Venus, birthDate, true);
  const ecl = Ecliptic(geo);
  const longitude = ecl.elon;

  const signIndex = Math.floor(longitude / 30);
  const degreeInSign = longitude - signIndex * 30;
  const decan = Math.floor(degreeInSign / 10) + 1;
  const sign = SIGNS[signIndex];

  return {
    sign,
    glyph: SIGN_GLYPHS[sign],
    element: ELEMENTS[sign],
    degree: Math.round(degreeInSign * 10) / 10,
    decan,
    longitude,
  };
}

export function calculateMoon() {
  const now = new Date();
  const geoMoon = GeoVector(Body.Moon, now, true);
  const eclMoon = Ecliptic(geoMoon);
  const longitude = eclMoon.elon;

  const geoSun = GeoVector(Body.Sun, now, true);
  const eclSun = Ecliptic(geoSun);
  // Phase angle: 0=new, 90=first quarter, 180=full, 270=last quarter
  const phaseAngle = ((longitude - eclSun.elon) % 360 + 360) % 360;

  const signIndex = Math.floor(longitude / 30);
  const sign = SIGNS[signIndex];

  const sunSignIndex = Math.floor(eclSun.elon / 30);

  return {
    sign,
    glyph: SIGN_GLYPHS[sign],
    element: ELEMENTS[sign],
    longitude,
    phaseAngle,
    sunLongitude: eclSun.elon,
    sunSign: SIGNS[sunSignIndex],
  };
}

export function makeBirthDate(day, month, year) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}
