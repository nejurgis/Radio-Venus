export const GENRE_CATEGORIES = [
  { id: 'ambient',    label: 'Ambient / Drone' },
  { id: 'techno',     label: 'Techno / House' },
  { id: 'electronica', label: 'Electronica' },
  { id: 'idm',        label: 'IDM / Experimental' },
  { id: 'industrial', label: 'Industrial / Noise' },
  { id: 'darkwave',   label: 'Synthwave / Darkwave' },
  { id: 'triphop',    label: 'Trip-Hop / Downtempo' },
  { id: 'dnb',        label: 'Drum & Bass / Jungle' },
  { id: 'indiepop',   label: 'Indie / Experimental' },
  { id: 'altrock',    label: 'Alt Rock / Post-Punk' },
  { id: 'artpop',     label: 'Art Pop / Avant-Garde' },
  { id: 'folk',       label: 'Folk / Neofolk' },
  { id: 'jazz',       label: 'Jazz / Spiritual' },
  { id: 'classical',  label: 'Classical / Orchestral' },
  { id: 'hiphop',         label: 'Hip-Hop / R&B' },
  { id: 'intercelestial', label: 'Inter-Celestial' },
  { id: 'valentine', label: "Valentine's day special" },
  { id: 'moon', label: "Today's Moon playlist" },
];

// ── Subgenre vocabulary (Discogs-derived) ────────────────────────────────────
// Each top-level genre contains subgenres sourced from the Discogs taxonomy
// (validated against 905K recordings in the AcousticBrainz Genre Dataset).

export const SUBGENRES = {
  ambient:    ['ambient', 'dark-ambient', 'drone', 'berlin-school', 'new-age', 'space-ambient'],
  electronica: ['indietronica', 'chillwave', 'lo-fi', 'microhouse', 'folktronica', 'glitch-pop', 'nu-disco'],
  idm:        ['idm', 'experimental', 'abstract', 'glitch', 'leftfield'],
  techno:     ['techno', 'house', 'deep-house', 'minimal', 'dub-techno', 'tech-house', 'acid', 'electro', 'trance', 'progressive-house'],
  triphop:    ['trip-hop', 'downtempo', 'dub', 'future-jazz', 'chillout', 'broken-beat', 'nu-jazz'],
  industrial: ['industrial', 'noise', 'ebm', 'power-electronics', 'rhythmic-noise', 'harsh-noise'],
  darkwave:   ['darkwave', 'synth-pop', 'new-wave', 'coldwave', 'synthwave', 'darksynth', 'krautrock'],
  dnb:        ['drum-n-bass', 'jungle', 'breakbeat', 'breakcore', 'dubstep', 'grime', 'uk-garage', 'future-garage', 'footwork'],
  indiepop:   ['indie-pop', 'bedroom-pop', 'noise-pop', 'psych-pop', 'lo-fi-indie', 'jangle-pop', 'twee-pop'],
  altrock:    ['post-punk', 'britpop', 'shoegaze', 'post-rock', 'noise-rock', 'madchester', 'alternative-rock', 'indie-rock'],
  artpop:     ['art-pop', 'avant-garde-pop', 'baroque-pop', 'chamber-pop', 'experimental-pop', 'art-rock', 'glam'],
  folk:       ['neofolk', 'dark-folk', 'freak-folk', 'psychedelic-folk', 'chamber-folk', 'gothic-country', 'folk-rock', 'ambient-folk'],
  jazz:       ['spiritual-jazz', 'dark-jazz', 'doom-jazz', 'free-jazz', 'modal-jazz', 'jazz-fusion', 'soul-jazz', 'cosmic-jazz', 'ambient-jazz'],
  classical:  ['classical', 'baroque', 'romantic', 'contemporary', 'neo-classical', 'impressionist', 'modern-classical', 'opera', 'minimalist'],
  hiphop:        ['hip-hop', 'cloud-rap', 'trap', 'phonk', 'boom-bap', 'experimental-hiphop', 'lo-fi-hiphop', 'rnb', 'neo-soul'],
  intercelestial: ['world', 'field-recording', 'outsider', 'traditional', 'unclassifiable'],
};

// ── Raw tag → top-level genre mapping ────────────────────────────────────────
// Maps tags from MusicBrainz, Last.fm, and Wikidata to the 8 Radio Venus
// genre buckets. Assembled from cross-referencing MusicBrainz's 2,000 official
// genres, Discogs' 81 electronic subgenres, and Last.fm folksonomy tags.

const GENRE_MAP = {
  // ── Electronic (catch-all) ──
  'electronic music': ['electronica', 'idm'],
  'electronic': ['electronica'],
  'electronica': ['electronica'],
  'progressive electronic': ['electronica', 'idm'],
  'indietronica': ['electronica'],
  'indie electronic': ['electronica'],
  'alternative electronic': ['electronica'],
  'chillwave': ['electronica'],
  'lo-fi': ['electronica'],
  'lo-fi hip hop': ['hiphop', 'electronica', 'triphop'],
  'microhouse': ['electronica', 'techno'],
  'filter house': ['electronica', 'techno'],
  'nu-disco': ['electronica', 'techno'],
  'wonky': ['electronica', 'idm'],
  'glitch pop': ['electronica', 'idm'],

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
  'j-ambient': ['ambient'],        // Japanese ambient scene (Yoshimura, etc.)
  'ambient synth': ['ambient'],    // EN micro-genre for analog synth ambient
  'spectra': ['ambient'],          // EN cluster: Joanna Brouk, Laurel Halo, etc.
  'healing': ['ambient'],          // EN cluster: new age / meditation ambient (Iasos, etc.)
  'focus': ['ambient'],            // EN cluster: background / concentration music
  'soundscape': ['ambient'],
  'modular synth': ['ambient', 'idm'],  // Ariel Kalma, Don Slepian, etc.
  'synthesizer': ['electronica', 'ambient'],  // Vangelis, Mort Garson, etc.
  'moog': ['electronica', 'ambient'],
  'didgeridoo': ['ambient'],       // Ariel Kalma — drone instrument, not a wrong match
  'soundtrack': ['classical', 'ambient'],   // Mica Levi, Vangelis, etc.
  'library music': ['ambient'],    // Stringtronics — production/library composers

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
  'folktronica': ['electronica', 'folk'],
  'deconstructed club': ['idm'],
  'hyperpop': ['idm'],
  'vaporwave': ['idm'],
  'braindance': ['idm'],           // core IDM tag — Aphex Twin, Bradley Strider, etc.
  'abstract hip hop': ['hiphop', 'idm'],  // Alias, Boom Bip, Odd Nosdam, Sole, etc.
  'fluxwork': ['idm', 'artpop'],   // EN cluster: Holly Herndon, Babyfather, etc.
  'electra': ['idm', 'artpop', 'techno'],  // EN cluster: Helena Hauff, Arca, Kaitlyn Aurelia Smith
  'escape room': ['artpop', 'idm'],// EN cluster: SOPHIE, Oklou, Caroline Polachek, etc.
  'weightless': ['idm'],           // EN cluster: UK experimental bass
  'italian occult psychedelia': ['ambient', 'idm'],  // Lino Capra Vaccina, Alessandro Cortini

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
  'grave wave': ['darkwave'],      // EN cluster: post-punk/goth darkwave (Public Memory, etc.)
  'cyberpunk': ['industrial', 'darkwave'],  // Vangelis, industrial-adjacent
  'synth punk': ['darkwave', 'industrial'],

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

  // ── Indie / Experimental ──
  'indie pop': ['indiepop'],
  'indie rock': ['indiepop'],
  'bedroom pop': ['indiepop'],
  'noise pop': ['indiepop'],
  'psychedelic pop': ['indiepop', 'artpop'],
  'psych pop': ['indiepop', 'artpop'],
  'lo-fi indie': ['indiepop', 'electronica'],
  'jangle pop': ['indiepop'],
  'twee pop': ['indiepop'],
  'slacker rock': ['indiepop'],
  'lo-fi rock': ['indiepop'],
  'garage pop': ['indiepop'],
  'indie folk': ['indiepop', 'folk'],
  'sadcore': ['indiepop', 'artpop'],
  'slowcore': ['indiepop'],

  // ── Art Pop ──
  'etherpop': ['artpop'],          // EN cluster: My Brightest Diamond, etc.
  'melancholia': ['artpop', 'folk'],  // EN cluster: Nina Nastasia, Shannon Wright, Mazzy Star
  'crank wave': ['artpop'],        // EN micro-genre: Jockstrap, etc.
  'spytrack': ['electronica', 'artpop'],  // Francis Monkman — cinematic/spy-funk

  // ── Folk / Roots ──
  'kentucky roots': ['folk'],
  'american roots': ['folk'],
  'appalachian folk': ['folk'],

  // ── Alt Rock / Post-Punk ──
  'alternative rock': ['altrock'],
  'alt-rock': ['altrock'],
  'britpop': ['altrock'],
  'madchester': ['altrock', 'electronica'],
  'post-punk revival': ['altrock'],
  'post-rock': ['altrock'],
  'shoegaze': ['altrock', 'indiepop'],
  'noise rock': ['altrock', 'industrial'],
  'grunge': ['altrock'],
  'alternative dance': ['altrock', 'electronica'],
  'scottish indie': ['altrock'],
  'irish indie': ['altrock'],
  'dance rock': ['altrock', 'electronica'],

  // ── Art Pop / Avant-Garde ──
  'art pop': ['artpop'],
  'art-pop': ['artpop'],
  'avant-garde pop': ['artpop'],
  'baroque pop': ['artpop'],
  'chamber pop': ['artpop'],
  'experimental pop': ['artpop'],
  'art rock': ['artpop'],
  'glam rock': ['artpop'],
  'dream pop': ['indiepop', 'artpop'],
  'ethereal wave': ['artpop', 'darkwave'],
  'avant-garde': ['artpop'],

  // ── Folk / Neofolk ──
  'folk': ['folk'],
  'folk music': ['folk'],
  'folk rock': ['folk'],
  'indie folk': ['folk'],
  'contemporary folk': ['folk'],
  'neofolk': ['folk', 'darkwave'],
  'neo-folk': ['folk', 'darkwave'],
  'dark folk': ['folk', 'darkwave'],
  'gothic country': ['folk', 'darkwave'],
  'avant-folk': ['folk', 'darkwave'],
  'freak folk': ['folk'],
  'new weird america': ['folk'],
  'psychedelic folk': ['folk'],
  'acid folk': ['folk'],
  'free folk': ['folk'],
  'anti-folk': ['folk'],
  'nu folk': ['folk'],
  'chamber folk': ['folk'],
  'ambient folk': ['folk', 'ambient'],
  'pastoral': ['folk', 'ambient'],
  'gaian doom': ['folk', 'industrial'],

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
  'jazz funk': ['jazz'],          // prevents funk substring matching → hiphop
  'jazz vibraphone': ['jazz'],    // prevents vibraphone→rap substring false positive
  'cosmic jazz': ['jazz'],
  'afrofuturism': ['jazz'],
  'avant-garde jazz': ['jazz'],
  'third stream': ['jazz'],
  'bebop': ['jazz'],
  'hard bop': ['jazz'],
  'post-bop': ['jazz'],
  'contemporary post-bop': ['jazz'],
  'experimental jazz': ['jazz'],   // explicit — prevents substring match to idm via 'experimental'
  'ambient jazz': ['ambient', 'jazz'],
  'jazz trumpet': ['jazz'],
  'jazz harp': ['jazz'],
  'fourth world': ['ambient'],          // texture tag, not a jazz indicator — Yoshimura/Brouk are ambient, not jazz
  'tzadik': ['jazz', 'idm'],            // Zorn's label used as EN micro-genre (avant-garde/experimental)

  // ── Hip-Hop / R&B ──
  'hip hop': ['hiphop'],
  'hip-hop': ['hiphop'],
  'rap': ['hiphop'],
  'rap music': ['hiphop'],
  'alternative hip hop': ['hiphop'],
  'experimental hip hop': ['hiphop', 'idm'],
  'industrial hip hop': ['hiphop', 'industrial'],
  'psychedelic hip hop': ['hiphop'],
  'underground hip hop': ['hiphop'],
  'cloud rap': ['hiphop'],
  'trap': ['hiphop'],
  'trap music': ['hiphop'],
  'phonk': ['hiphop'],
  'drift phonk': ['hiphop'],
  'pop rap': ['hiphop'],
  'boom bap': ['hiphop'],
  'conscious hip hop': ['hiphop'],
  'gangsta rap': ['hiphop'],
  'emo rap': ['hiphop'],
  'jazz rap': ['hiphop', 'jazz'],
  'rap metal': ['hiphop', 'industrial'],
  'nu metal': ['hiphop', 'altrock'],
  'hip house': ['hiphop', 'techno'],
  'bubblegum bass': ['hiphop', 'dnb'],
  'r&b': ['hiphop'],
  'rnb': ['hiphop'],
  'soul': ['hiphop', 'triphop'],
  'classic soul': ['hiphop', 'triphop'],
  'motown': ['hiphop', 'triphop'],
  'funk': ['hiphop', 'electronica'],
  'disco': ['electronica', 'techno'],
  'quiet storm': ['hiphop', 'triphop'],
  'neo soul': ['hiphop'],
  'indie soul': ['hiphop', 'artpop'],
  'alternative r&b': ['hiphop'],
  'experimental r&b': ['hiphop', 'idm'],

  // ── K-Pop / C-Pop / City Pop (closest: Art Pop) ──
  'k-pop': ['artpop'],
  'c-pop': ['artpop'],
  'j-pop': ['artpop'],
  'korean city pop': ['artpop'],
  'city pop': ['artpop', 'electronica'],

  // ── Singer-Songwriter / Indie catch-alls ──
  'singer-songwriter': ['folk'],
  'countrygaze': ['folk', 'indiepop'],
  'mellow gold': ['folk'],
  'soft rock': ['folk', 'altrock'],
  'eurodance': ['techno'],
  'europop': ['techno', 'artpop'],
  'post-grunge': ['altrock'],
  'alternative metal': ['altrock', 'industrial'],
  // geographic indie tags → indiepop
  'nz indie': ['indiepop'],
  'manchester indie': ['indiepop'],
  'olympia wa indie': ['indiepop'],
  'boston indie': ['indiepop'],
  'popgaze': ['indiepop'],

  // ── Hardcore / Punk (closest: Alt Rock + Industrial) ──
  'hardcore punk': ['altrock', 'industrial'],
  'hardcore': ['altrock', 'industrial'],
  'california hardcore': ['altrock', 'industrial'],
  'modern hardcore': ['altrock', 'industrial'],
  'black punk': ['altrock', 'industrial'],

  // ── Sound Art / Musique Concrète adjacent ──
  'sound art': ['ambient', 'idm'],
  'sound collage': ['idm'],
  'tape music': ['ambient', 'idm'],
  'lowercase': ['ambient', 'idm'],
  'hauntology': ['ambient', 'idm'],
  'new isolationism': ['ambient', 'idm'],
  'prepared piano': ['classical', 'idm'],

  // ── Additional classical micro-genres ──
  'impressionism': ['classical'],
  'modern cello': ['classical'],
  'ethio-jazz': ['jazz'],
  'ecm-style jazz': ['jazz'],
  'jazz piano': ['jazz'],
  'compositional ambient': ['ambient'],
  'ambient pop': ['ambient', 'artpop'],
  'musica andina': ['folk'],
  'folklore boliviano': ['folk'],

  // ── Classical / Orchestral ──
  'medieval': ['classical'],       // Pérotin, Hildegard von Bingen, etc.
  'early music': ['classical'],    // pre-baroque historical performance
  'renaissance': ['classical'],
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
  'american contemporary classical': ['classical'],
  'neoclassical': ['classical'],
  'neo-classical': ['classical'],
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
  // geo-specific classical tags from Everynoise (correct matches, not wrong-artist noise)
  'czech classical': ['classical'],
  'polish classical': ['classical'],
  'polish contemporary classical': ['classical'],
  'ukrainian classical': ['classical'],
  'russian modern classical': ['classical'],
  'finnish classical': ['classical'],
  'icelandic classical': ['classical'],
  'japanese contemporary classical': ['classical'],
  'japanese classical': ['classical'],
  'japanese classical performance': ['classical'],
  'hungarian contemporary classical': ['classical'],
  'baltic classical': ['classical'],
  'german baroque': ['classical'],
  'italian baroque': ['classical'],
  'early modern classical': ['classical'],
  'early romantic era': ['classical'],
  'late romantic era': ['classical'],
  'german romanticism': ['classical'],
  'russian romanticism': ['classical'],
  'italian romanticism': ['classical'],
  'post-romantic era': ['classical'],
  'classical era': ['classical'],
  'classical drill': ['classical'],
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
  'electronica': 'indietronica', 'electronic': 'indietronica', 'electronic music': 'indietronica',
  'indietronica': 'indietronica', 'indie electronic': 'indietronica', 'alternative electronic': 'indietronica',
  'chillwave': 'chillwave', 'lo-fi': 'lo-fi', 'lo-fi hip hop': 'lo-fi',
  'microhouse': 'microhouse', 'filter house': 'microhouse',
  'nu-disco': 'nu-disco',
  'wonky': 'glitch-pop', 'glitch pop': 'glitch-pop',
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

  // indiepop
  'indie pop': 'indie-pop', 'indie rock': 'indie-pop',
  'bedroom pop': 'bedroom-pop', 'garage pop': 'bedroom-pop',
  'noise pop': 'noise-pop',
  'psychedelic pop': 'psych-pop', 'psych pop': 'psych-pop',
  'lo-fi indie': 'lo-fi-indie', 'lo-fi rock': 'lo-fi-indie', 'slacker rock': 'lo-fi-indie',
  'jangle pop': 'jangle-pop', 'twee pop': 'twee-pop',
  'dream pop': 'indie-pop', 'shoegaze': 'noise-pop',
  'sadcore': 'indie-pop', 'slowcore': 'indie-pop',

  // artpop
  'art pop': 'art-pop', 'art-pop': 'art-pop',
  'baroque pop': 'baroque-pop', 'chamber pop': 'chamber-pop',
  'experimental pop': 'experimental-pop', 'avant-garde pop': 'avant-garde-pop',
  'art rock': 'art-rock', 'glam rock': 'glam',
  'dream pop': 'art-pop', 'shoegaze': 'art-pop',
  'ethereal wave': 'art-pop',
  'avant-garde': 'avant-garde-pop',

  // folk
  'folk': 'folk-rock', 'folk music': 'folk-rock', 'folk rock': 'folk-rock',
  'indie folk': 'folk-rock',
  'contemporary folk': 'folk-rock', 'nu folk': 'folk-rock',
  'neofolk': 'neofolk', 'neo-folk': 'neofolk', 'avant-folk': 'dark-folk',
  'dark folk': 'dark-folk', 'gothic country': 'gothic-country',
  'freak folk': 'freak-folk', 'new weird america': 'freak-folk', 'anti-folk': 'freak-folk', 'free folk': 'freak-folk',
  'psychedelic folk': 'psychedelic-folk', 'acid folk': 'psychedelic-folk',
  'chamber folk': 'chamber-folk',
  'ambient folk': 'ambient-folk', 'pastoral': 'ambient-folk',
  'gaian doom': 'dark-folk',

  // jazz
  'jazz': 'spiritual-jazz',
  'spiritual jazz': 'spiritual-jazz',
  'free jazz': 'free-jazz', 'avant-garde jazz': 'free-jazz',
  'experimental jazz': 'free-jazz',
  'third stream': 'free-jazz',
  'bebop': 'free-jazz', 'hard bop': 'free-jazz', 'post-bop': 'free-jazz', 'contemporary post-bop': 'free-jazz',
  'dark jazz': 'dark-jazz', 'doom jazz': 'doom-jazz',
  'modal jazz': 'modal-jazz',
  'jazz fusion': 'jazz-fusion', 'fusion': 'jazz-fusion',
  'soul jazz': 'soul-jazz', 'soul-jazz': 'soul-jazz',
  'cosmic jazz': 'cosmic-jazz', 'afrofuturism': 'cosmic-jazz',
  'fourth world': 'cosmic-jazz',
  'tzadik': 'free-jazz',
  'jazz trumpet': 'free-jazz', 'jazz harp': 'free-jazz',
  'ambient jazz': 'ambient-jazz',

  // hiphop
  'hip hop': 'hip-hop', 'hip-hop': 'hip-hop', 'rap': 'hip-hop', 'rap music': 'hip-hop',
  'alternative hip hop': 'hip-hop', 'underground hip hop': 'hip-hop', 'pop rap': 'hip-hop',
  'conscious hip hop': 'hip-hop', 'jazz rap': 'hip-hop', 'gangsta rap': 'hip-hop',
  'experimental hip hop': 'experimental-hiphop', 'industrial hip hop': 'experimental-hiphop',
  'psychedelic hip hop': 'experimental-hiphop', 'abstract hip hop': 'experimental-hiphop',
  'cloud rap': 'cloud-rap', 'emo rap': 'cloud-rap',
  'trap': 'trap', 'trap music': 'trap',
  'phonk': 'phonk', 'drift phonk': 'phonk',
  'boom bap': 'boom-bap',
  'lo-fi hip hop': 'lo-fi-hiphop',
  'r&b': 'rnb', 'rnb': 'rnb', 'alternative r&b': 'rnb', 'experimental r&b': 'rnb', 'quiet storm': 'rnb',
  'soul': 'soul', 'classic soul': 'soul', 'motown': 'soul', 'funk': 'soul',
  'neo soul': 'neo-soul', 'indie soul': 'neo-soul',

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

// Returns true only if `needle` appears as a whole-word phrase inside `haystack`.
// Prevents short keys like "rap" from matching inside "vibraphone" or "drift" from
// matching inside "drift phonk" when we only have the tag "drift".
function phraseMatch(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 || !/[a-z0-9]/.test(haystack[idx - 1]);
  const after  = idx + needle.length >= haystack.length || !/[a-z0-9]/.test(haystack[idx + needle.length]);
  return before && after;
}

export function categorizeGenres(rawGenres) {
  const categories = new Set();
  for (const raw of rawGenres) {
    const normalized = raw.toLowerCase().trim();
    if (GENRE_MAP[normalized]) {
      GENRE_MAP[normalized].forEach(c => categories.add(c));
    } else {
      for (const [key, cats] of Object.entries(GENRE_MAP)) {
        if (phraseMatch(normalized, key)) {
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
        if (phraseMatch(normalized, key)) {
          subgenres.add(sub);
        }
      }
    }
  }
  return [...subgenres];
}
