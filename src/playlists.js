// ── Curated playlists ───────────────────────────────────────────────────────
// Hand-made playlists in a fixed order, outside the astrology. Each shows as a
// chip in the genre grid, credits its curator and shares as radio-venus.club/#<id>.
// A playlist with a `season` ({ from: [month, day], to: [month, day] }, inclusive,
// the visitor's local date) exists only then: no chip and no link the rest of the year.
//
// Kept out of musicians.json on purpose: the roster's build and genre-cleanup
// scripts rewrite that file, and the first Valentine playlist (stored there as
// valentine-tagged artists) was lost to them in March 2026.
//
// Track fields: `name` (shown, and the favorites key — keep it unique),
// `youtubeVideoId`, optional `backupVideoIds` (the same recording, tried in
// order if the first can't play).

export const CURATED_PLAYLISTS = [
  {
    id: 'venus-retrograde-1',
    label: 'Venus Retrograde 1/2',
    curator: 'jinyoung choi',
    curatorUrl: 'https://www.instagram.com/fluidatopos/',
    description: 'as Venus is plunging backwards through Scorpio, this playlist accompanies her descent into the underground ✶⋆.˚',
    sign: 'Scorpio',
    tracks: [
      { name: 'Public Image Ltd. — The Order Of Death', youtubeVideoId: 'CrXzBljVaPc', backupVideoIds: ['Eith7hTCOek'] },
      { name: 'CCFX — 2Tru (Foreign Interior Dub Mix)', youtubeVideoId: 'CRk0lkMLyRk' },
      { name: 'Buttechno & Triš — spirit dub', youtubeVideoId: 'FSllY4WYvhM', backupVideoIds: ['SegZd6_MiQA'] },
      { name: 'Cyst, Iglooghost & daisy* — Rabbit', youtubeVideoId: 'nyh67_mL53A' },
      { name: 'Europa & R.I.C. — Roses', youtubeVideoId: 'jtkQmTgSkqg' },
      { name: 'Burial — Rodent', youtubeVideoId: 'E2TGmIQ0fHM', backupVideoIds: ['wqBiYJIlyzo'] },
      { name: 'wing! — Pack It In', youtubeVideoId: 'Nwv8bRpLxbc', backupVideoIds: ['mzJrHkALMEg'] },
      { name: 'Yawning Portal — Cut To The Feeling', youtubeVideoId: 'NINjd9zthIY' },
      { name: 'underscores — Bozo bozo bozo', youtubeVideoId: 'EhcIpIEKPFw' },
      { name: 'the sound chalk makes — Electronic Eyes (HORNET Re:mix)', youtubeVideoId: 'M3pK4GM53V4' },
      { name: 'nahdoitagain — MORE BASS', youtubeVideoId: '_4otmpzU0OE', backupVideoIds: ['AwPLso7ZG5M'] },
      { name: "james K — N'Balmed (JASSS Purple Mix)", youtubeVideoId: 'ya-Xk7s8FNw' },
      { name: 'Roza Terenzi & jd — Bedtime Ritual', youtubeVideoId: 'rFKdII8aljA', backupVideoIds: ['ESdaf1PixWY'] },
      { name: 'Roberto Musci — Ghost Train', youtubeVideoId: 'YQar3crAnqg' },
      { name: 'Dregs — Guilt Garden', youtubeVideoId: 'LO8kGPqon4Q' },
      { name: 'Coppice Halifax — Miniature Island Fantasy', youtubeVideoId: '1unSySD277Q' },
      { name: 'Telefon Tel Aviv — Ttv', youtubeVideoId: 'Mv_Pe3BeFEY', backupVideoIds: ['lcTt3VmoCCk'] },
      { name: 'Actress — Cosmo', youtubeVideoId: 'wiGAl2hyDwQ', backupVideoIds: ['1A9o71iP9p0'] },
      { name: 'Now Always Fades & Alias Error — Faceless Angel', youtubeVideoId: 'D5zlsYhdsLw' },
      { name: 'Casino Versus Japan — Aquarium', youtubeVideoId: 'AvYvRrJVzZA', backupVideoIds: ['8jBXaNpwp9k'] },
    ],
  },
  {
    id: 'venus-retrograde-2',
    label: 'Venus Retrograde 2/2',
    curator: 'jinyoung choi',
    curatorUrl: 'https://www.instagram.com/fluidatopos/',
    description: 'as Venus is slowly transiting backwards through Libra, her own sign, the tone has changed slightly ✶⋆.˚',
    sign: 'Libra',
    tracks: [
      { name: 'haloplus+ — Musicality', youtubeVideoId: 'IXQO3tAmtoU', backupVideoIds: ['VyY_cbr6hPM'] },
      { name: 'True Blue & The Bird — Boom Boom', youtubeVideoId: 'pdoIx0zWfPk' },
      { name: 'CCFX — The One to Wait', youtubeVideoId: 'klsFQZjZYBY', backupVideoIds: ['GW9vLkNmMVM'] },
      { name: 'Daniela Lalita & Dinamarca — Aurora', youtubeVideoId: '94xxrIs_8_c' },
      { name: 'Rina Sawayama — Cyber Stockholm Syndrome', youtubeVideoId: '6rLFDMF-e6Q', backupVideoIds: ['HKLxvdFtlZE'] },
      { name: 'Danny L Harle & DJ Danny — On A Mountain', youtubeVideoId: 'nwcyjGoGV-w', backupVideoIds: ['mlvYumlPNBE'] },
      { name: 'KiiiKiii — Candy Pink Magic Hole Flip Phone', youtubeVideoId: 'Ta42YSMVePU', backupVideoIds: ['fijudFxB2QA'] },
      { name: 'Ayegy — Trancendance', youtubeVideoId: '9TVkkE8bmSM' },
      { name: 'Jazz Lambaux — Resurrexion in B-Flat Major', youtubeVideoId: 'Wj3pXb0imbI' },
      { name: 'Requisit & Love Rosie & Poet Laureate — pink bikini', youtubeVideoId: 'BXgd2RwUhtU' },
      { name: 'Kim Petras — Need For Speed', youtubeVideoId: '3xwk3Fb_Uis', backupVideoIds: ['fzPUn5o8zog'] },
      { name: 'Britney Spears — Toxic (Y2K & Alexander Lewis Remix)', youtubeVideoId: 'ONBeMXx4Ta8' },
      { name: 'Brat Star — 5 Point Palm Exploding Heart Technique', youtubeVideoId: 'HdXR2_VGZ1s' },
      { name: 'Thoom — Midnight Princess', youtubeVideoId: '07Hkl1w8-LQ' },
      { name: 'Jam City & gianna — 2am', youtubeVideoId: '0gpa7xq655U' },
      { name: 'Vegyn — Beauty Stranger [155 BPM]', youtubeVideoId: 'JHgQEY97iqU' },
      { name: 'Bladee — Don\'t Worry', youtubeVideoId: 'EdKFth5KP-s' },
      { name: 'Daryl Hall & John Oates — Rich Girl', youtubeVideoId: 'AmHE65RAkSY', backupVideoIds: ['oIAkRVBS-0U'] },
      { name: 'Kero Kero Bonito — Flamingo', youtubeVideoId: 'rY-FJvRqK0E', backupVideoIds: ['oJIkBSaGiG0'] },
      { name: 'Mietze Conte & Otto Benson — Cauliflower', youtubeVideoId: 'm434c5tjofE' },
    ],
  },
  {
    // Valentine's week only
    id: 'valentine',
    label: "Valentine's day special",
    curator: 'jinyoung choi',
    curatorUrl: 'https://docs.google.com/document/d/1We4r9SyEyWY0rM8Njdcw7gkAy8e4lpBFb7aFTA7xtWY/edit?usp=sharing',
    sign: 'Aries',
    season: { from: [2, 7], to: [2, 14] },
    tracks: [
      { name: 'Iko Chérie — Luciférine', youtubeVideoId: '7jOkiDyxShI' },
      { name: 'Nathanial Young — I think about it every day', youtubeVideoId: 'igZrrKLe81I' },
      { name: 'Ouri — Love in Lungs', youtubeVideoId: 'QEh0WIY_ZRw' },
      { name: 'Angel Olsen — New Love Cassette', youtubeVideoId: 'W0J0m5sU_Ys' },
      { name: 'Sonic Youth — Shadow of a Doubt', youtubeVideoId: 'tFNnvQLvs7I' },
      { name: 'Cassandra Jenkins — Betelgeuse', youtubeVideoId: 'tsEbhrMh0mM' },
      { name: 'Sam Gendel — maken melodie', youtubeVideoId: 'eSwjSbgXM78' },
      { name: 'A. G. Cook — Official', youtubeVideoId: 'q2ZasIb0Hsw' },
      { name: 'james K — Friend', youtubeVideoId: 'FhpIE3uCn2E' },
      // Four Tet stood here; its video (vGeJVHwOZSk) was taken down
      { name: 'Yves Tumor — Romanticist / Dream Palette', youtubeVideoId: 'LJ4o9ppV4yg' },
      { name: 'Peter Kardas — I Saw You', youtubeVideoId: 'RmrlJpKlwcc' },
      { name: 'Kelly Moran — Lunar wave', youtubeVideoId: '6XVngfOBBas' },
      { name: 'The Memphis Mustangs — Express Your Love Theme', youtubeVideoId: '54Lqir2N_Eo' },
      { name: 'Semi Trucks — Hey Lover', youtubeVideoId: 'JUiUPj0eXn8' },
      { name: 'Vegyn — The Road To Hell Is Paved With Good Intentions', youtubeVideoId: 'Fi3tuTLa1C0' },
    ],
  },
];

export function getCuratedPlaylist(id) {
  return CURATED_PLAYLISTS.find(p => p.id === id) || null;
}

/** Whether a playlist is on today: always, or only inside its season. */
export function isInSeason(p, now = new Date()) {
  if (!p.season) return true;
  const day = (now.getMonth() + 1) * 100 + now.getDate();
  const [fromMonth, fromDay] = p.season.from, [toMonth, toDay] = p.season.to;
  return day >= fromMonth * 100 + fromDay && day <= toMonth * 100 + toDay;
}

/** A playlist's tracks for the player, in the curator's order, each tagged with the playlist id. */
export function curatedTracks(id) {
  const p = getCuratedPlaylist(id);
  return p ? p.tracks.map(t => ({ backupVideoIds: [], ...t, playlist: p.id })) : [];
}

/** Curated tracks among the given names (favorites made from a curated playlist). */
export function findCuratedTracks(names) {
  const wanted = new Set(names);
  return CURATED_PLAYLISTS.flatMap(p => curatedTracks(p.id)).filter(t => wanted.has(t.name));
}
