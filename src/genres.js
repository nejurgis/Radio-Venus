export const GENRE_CATEGORIES = [
  { id: 'ambient',    label: 'Ambient / Drone' },
  { id: 'techno',     label: 'Techno / House' },
  { id: 'idm',        label: 'IDM / Experimental' },
  { id: 'industrial', label: 'Industrial / Noise' },
  { id: 'darkwave',   label: 'Synthwave / Darkwave' },
  { id: 'triphop',    label: 'Trip-Hop / Downtempo' },
  { id: 'dnb',        label: 'Drum & Bass / Jungle' },
  { id: 'artpop',     label: 'Art Pop / Avant-Garde' },
  { id: 'jazz',       label: 'Jazz / Spiritual' },
  { id: 'classical',  label: 'Classical / Orchestral' },
];

// ── Subgenre vocabulary (Discogs-derived) ────────────────────────────────────
// Each top-level genre contains subgenres sourced from the Discogs taxonomy
// (validated against 905K recordings in the AcousticBrainz Genre Dataset).

export const SUBGENRES = {
  ambient:    ['ambient', 'dark-ambient', 'drone', 'berlin-school', 'new-age', 'space-ambient'],
  idm:        ['idm', 'experimental', 'abstract', 'glitch', 'leftfield', 'electronica', 'folktronica'],
  techno:     ['techno', 'house', 'deep-house', 'minimal', 'dub-techno', 'tech-house', 'acid', 'electro', 'trance', 'progressive-house'],
  triphop:    ['trip-hop', 'downtempo', 'dub', 'future-jazz', 'chillout', 'broken-beat', 'nu-jazz'],
  industrial: ['industrial', 'noise', 'ebm', 'power-electronics', 'rhythmic-noise', 'harsh-noise'],
  darkwave:   ['darkwave', 'synth-pop', 'new-wave', 'coldwave', 'synthwave', 'darksynth', 'krautrock'],
  dnb:        ['drum-n-bass', 'jungle', 'breakbeat', 'breakcore', 'dubstep', 'grime', 'uk-garage', 'future-garage', 'footwork'],
  artpop:     ['art-pop', 'avant-garde-pop', 'baroque-pop', 'chamber-pop', 'experimental-pop', 'art-rock', 'glam'],
  jazz:       ['spiritual-jazz', 'dark-jazz', 'doom-jazz', 'free-jazz', 'modal-jazz', 'jazz-fusion', 'soul-jazz', 'cosmic-jazz', 'ambient-jazz'],
  classical:  ['classical', 'baroque', 'romantic', 'contemporary', 'neo-classical', 'impressionist', 'modern-classical', 'opera', 'minimalist'],
};

// ── Raw tag → top-level genre mapping ────────────────────────────────────────
// Maps tags from MusicBrainz, Last.fm, and Wikidata to the 8 Radio Venus
// genre buckets. Assembled from cross-referencing MusicBrainz's 2,000 official
// genres, Discogs' 81 electronic subgenres, and Last.fm folksonomy tags.

const GENRE_MAP = {
  // ── Electronic (catch-all) ──
  'electronic music': ['idm'],
  'electronic': ['idm'],
  'electronica': ['idm'],
  'progressive electronic': ['idm'],

  // ── Techno / House ──
  'techno': ['techno'],
  'house music': ['techno'],
  'house': ['techno'],
  'minimal techno': ['techno'],
  'acid house': ['techno'],
  'acid techno': ['techno'],
  'acid': ['techno'],
  'detroit techno': ['techno'],
  'deep house': ['techno'],
  'tech house': ['techno'],
  'dub techno': ['techno', 'ambient'],
  'microhouse': ['techno'],
  'electro': ['techno'],
  'trance': ['techno'],
  'progressive house': ['techno'],
  'progressive trance': ['techno'],
  'bleep techno': ['techno'],
  'hardcore techno': ['techno', 'industrial'],
  'ambient house': ['ambient', 'techno'],
  'ambient techno': ['ambient', 'techno'],

  // ── Ambient / Drone ──
  'ambient music': ['ambient'],
  'ambient': ['ambient'],
  'dark ambient': ['ambient'],
  'drone music': ['ambient'],
  'drone': ['ambient'],
  'new age': ['ambient'],
  'space music': ['ambient'],
  'berlin-school': ['ambient'],
  'berlin school': ['ambient'],

  // ── IDM / Experimental ──
  'idm': ['idm'],
  'intelligent dance music': ['idm'],
  'experimental music': ['idm'],
  'experimental': ['idm'],
  'experimental electronic': ['idm'],
  'glitch': ['idm'],
  'electroacoustic': ['idm'],
  'musique concrète': ['idm'],
  'leftfield': ['idm'],
  'folktronica': ['idm'],
  'deconstructed club': ['idm'],
  'hyperpop': ['idm'],
  'vaporwave': ['idm'],

  // ── Industrial / Noise ──
  'industrial music': ['industrial'],
  'industrial': ['industrial'],
  'noise music': ['industrial'],
  'noise': ['industrial'],
  'power electronics': ['industrial'],
  'death industrial': ['industrial'],
  'harsh noise': ['industrial'],
  'noise rock': ['industrial'],
  'industrial rock': ['industrial'],
  'post-industrial': ['industrial'],
  'rhythmic noise': ['industrial'],
  'ebm': ['industrial', 'darkwave'],
  'electronic body music': ['industrial', 'darkwave'],
  'electro-industrial': ['industrial', 'darkwave'],

  // ── Synthwave / Darkwave ──
  'synthwave': ['darkwave'],
  'darkwave': ['darkwave'],
  'dark wave': ['darkwave'],
  'coldwave': ['darkwave'],
  'post-punk': ['darkwave'],
  'synthpop': ['darkwave'],
  'synth-pop': ['darkwave'],
  'new wave': ['darkwave'],
  'minimal wave': ['darkwave'],
  'gothic rock': ['darkwave'],
  'electropunk': ['darkwave'],
  'darksynth': ['darkwave'],
  'krautrock': ['darkwave'],

  // ── Trip-Hop / Downtempo ──
  'trip hop': ['triphop'],
  'trip-hop': ['triphop'],
  'downtempo': ['triphop'],
  'chillout': ['triphop'],
  'chill out': ['triphop'],
  'lounge': ['triphop'],
  'dub': ['triphop'],
  'reggae fusion': ['triphop'],
  'ambient dub': ['ambient', 'triphop'],
  'nu jazz': ['triphop'],
  'future jazz': ['triphop'],
  'broken beat': ['triphop'],

  // ── Drum & Bass / Jungle ──
  'drum and bass': ['dnb'],
  'drum & bass': ['dnb'],
  'drum n bass': ['dnb'],
  'jungle': ['dnb'],
  'breakcore': ['dnb'],
  'breakbeat': ['dnb'],
  'uk garage': ['dnb'],
  'dubstep': ['dnb'],
  'grime': ['dnb'],
  'footwork': ['dnb'],
  'juke': ['dnb'],
  'future garage': ['dnb'],
  '2-step': ['dnb'],
  'drill and bass': ['dnb', 'idm'],
  'acid breaks': ['dnb', 'techno'],

  // ── Art Pop / Avant-Garde ──
  'art pop': ['artpop'],
  'art-pop': ['artpop'],
  'avant-garde pop': ['artpop'],
  'baroque pop': ['artpop'],
  'chamber pop': ['artpop'],
  'experimental pop': ['artpop'],
  'art rock': ['artpop'],
  'glam rock': ['artpop'],
  'dream pop': ['artpop'],
  'ethereal wave': ['artpop', 'darkwave'],
  'shoegaze': ['artpop'],
  'avant-garde': ['artpop'],

  // ── Jazz / Spiritual ──
  'jazz': ['jazz'],
  'spiritual jazz': ['jazz'],
  'free jazz': ['jazz'],
  'dark jazz': ['jazz'],
  'doom jazz': ['jazz'],
  'modal jazz': ['jazz'],
  'jazz fusion': ['jazz'],
  'fusion': ['jazz'],
  'soul jazz': ['jazz'],
  'soul-jazz': ['jazz'],
  'cosmic jazz': ['jazz'],
  'afrofuturism': ['jazz'],
  'avant-garde jazz': ['jazz'],
  'third stream': ['jazz'],

  // ── Classical / Orchestral ──
  'classical music': ['classical'],
  'classical': ['classical'],
  'orchestral': ['classical'],
  'opera': ['classical'],
  'symphony': ['classical'],
  'chamber music': ['classical'],
  'baroque music': ['classical'],
  'baroque': ['classical'],
  'romantic music': ['classical'],
  'impressionist music': ['classical'],
  'minimalism': ['classical'],
  'minimalist music': ['classical'],
  'contemporary classical': ['classical'],
  'neoclassical': ['classical'],
  'modern classical': ['classical'],
  'piano music': ['classical'],
  'choral music': ['classical'],
  'art music': ['classical'],
  'concerto': ['classical'],
  'sonata': ['classical'],
  'cantata': ['classical'],
  'oratorio': ['classical'],
  'post-minimalism': ['classical'],
  'serial music': ['classical'],
  'atonal music': ['classical'],
  'twelve-tone technique': ['classical'],
};

// ── Raw tag → Discogs-style subgenre ID ──────────────────────────────────────

const SUBGENRE_MAP = {
  // ambient
  'ambient': 'ambient', 'ambient music': 'ambient',
  'dark ambient': 'dark-ambient',
  'drone': 'drone', 'drone music': 'drone',
  'berlin-school': 'berlin-school', 'berlin school': 'berlin-school',
  'new age': 'new-age',
  'space music': 'space-ambient',

  // idm
  'idm': 'idm', 'intelligent dance music': 'idm',
  'experimental': 'experimental', 'experimental music': 'experimental',
  'experimental electronic': 'experimental',
  'glitch': 'glitch',
  'electroacoustic': 'experimental', 'musique concrète': 'experimental',
  'leftfield': 'leftfield',
  'electronica': 'electronica', 'electronic': 'electronica', 'electronic music': 'electronica',
  'folktronica': 'folktronica',
  'deconstructed club': 'experimental',
  'hyperpop': 'experimental',
  'vaporwave': 'experimental',
  'progressive electronic': 'experimental',

  // techno
  'techno': 'techno',
  'house': 'house', 'house music': 'house',
  'deep house': 'deep-house',
  'minimal techno': 'minimal', 'microhouse': 'minimal',
  'dub techno': 'dub-techno',
  'tech house': 'tech-house',
  'acid house': 'acid', 'acid techno': 'acid', 'acid': 'acid',
  'detroit techno': 'techno',
  'electro': 'electro',
  'trance': 'trance', 'progressive trance': 'trance',
  'progressive house': 'progressive-house',
  'bleep techno': 'techno',
  'ambient house': 'house', 'ambient techno': 'techno',
  'hardcore techno': 'techno',

  // triphop
  'trip hop': 'trip-hop', 'trip-hop': 'trip-hop',
  'downtempo': 'downtempo',
  'chillout': 'chillout', 'chill out': 'chillout', 'lounge': 'chillout',
  'dub': 'dub', 'ambient dub': 'dub',
  'nu jazz': 'nu-jazz', 'future jazz': 'future-jazz',
  'broken beat': 'broken-beat',

  // industrial
  'industrial': 'industrial', 'industrial music': 'industrial',
  'noise': 'noise', 'noise music': 'noise',
  'harsh noise': 'harsh-noise', 'noise rock': 'noise',
  'power electronics': 'power-electronics',
  'death industrial': 'industrial',
  'industrial rock': 'industrial',
  'post-industrial': 'industrial',
  'rhythmic noise': 'rhythmic-noise',

  // darkwave
  'ebm': 'ebm', 'electronic body music': 'ebm', 'electro-industrial': 'ebm',
  'synthwave': 'synthwave',
  'darkwave': 'darkwave', 'dark wave': 'darkwave',
  'coldwave': 'coldwave',
  'synth-pop': 'synth-pop', 'synthpop': 'synth-pop',
  'new wave': 'new-wave',
  'minimal wave': 'darkwave',
  'gothic rock': 'darkwave',
  'electropunk': 'darkwave',
  'darksynth': 'darksynth',
  'krautrock': 'krautrock',

  // dnb
  'drum and bass': 'drum-n-bass', 'drum & bass': 'drum-n-bass', 'drum n bass': 'drum-n-bass',
  'jungle': 'jungle',
  'breakbeat': 'breakbeat', 'breakcore': 'breakcore',
  'dubstep': 'dubstep',
  'grime': 'grime',
  'uk garage': 'uk-garage', '2-step': 'uk-garage',
  'future garage': 'future-garage',
  'footwork': 'footwork', 'juke': 'footwork',
  'drill and bass': 'breakbeat',
  'acid breaks': 'breakbeat',

  // artpop
  'art pop': 'art-pop', 'art-pop': 'art-pop',
  'baroque pop': 'baroque-pop', 'chamber pop': 'chamber-pop',
  'experimental pop': 'experimental-pop', 'avant-garde pop': 'avant-garde-pop',
  'art rock': 'art-rock', 'glam rock': 'glam',
  'dream pop': 'art-pop', 'shoegaze': 'art-pop',
  'ethereal wave': 'art-pop',
  'avant-garde': 'avant-garde-pop',

  // jazz
  'jazz': 'spiritual-jazz',
  'spiritual jazz': 'spiritual-jazz',
  'free jazz': 'free-jazz', 'avant-garde jazz': 'free-jazz',
  'dark jazz': 'dark-jazz', 'doom jazz': 'doom-jazz',
  'modal jazz': 'modal-jazz',
  'jazz fusion': 'jazz-fusion', 'fusion': 'jazz-fusion',
  'soul jazz': 'soul-jazz', 'soul-jazz': 'soul-jazz',
  'cosmic jazz': 'cosmic-jazz', 'afrofuturism': 'cosmic-jazz',
  'third stream': 'free-jazz',

  // classical
  'classical': 'classical', 'classical music': 'classical',
  'baroque': 'baroque', 'baroque music': 'baroque',
  'romantic music': 'romantic',
  'contemporary classical': 'contemporary',
  'neoclassical': 'neo-classical',
  'modern classical': 'modern-classical',
  'impressionist music': 'impressionist',
  'opera': 'opera',
  'minimalism': 'minimalist', 'minimalist music': 'minimalist', 'post-minimalism': 'minimalist',
  'orchestral': 'classical', 'symphony': 'classical',
  'chamber music': 'classical', 'choral music': 'classical',
  'piano music': 'classical', 'art music': 'classical',
  'concerto': 'classical', 'sonata': 'classical', 'cantata': 'classical', 'oratorio': 'classical',
  'serial music': 'contemporary', 'atonal music': 'contemporary', 'twelve-tone technique': 'contemporary',
};

// ── Genre categorization ─────────────────────────────────────────────────────

export function categorizeGenres(rawGenres) {
  const categories = new Set();
  for (const raw of rawGenres) {
    const normalized = raw.toLowerCase().trim();
    if (GENRE_MAP[normalized]) {
      GENRE_MAP[normalized].forEach(c => categories.add(c));
    } else {
      for (const [key, cats] of Object.entries(GENRE_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          cats.forEach(c => categories.add(c));
        }
      }
    }
  }
  return [...categories];
}

export function categorizeSubgenres(rawGenres) {
  const subgenres = new Set();
  for (const raw of rawGenres) {
    const normalized = raw.toLowerCase().trim();
    if (SUBGENRE_MAP[normalized]) {
      subgenres.add(SUBGENRE_MAP[normalized]);
    } else {
      for (const [key, sub] of Object.entries(SUBGENRE_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          subgenres.add(sub);
        }
      }
    }
  }
  return [...subgenres];
}
