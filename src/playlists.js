// ── Curated playlists ───────────────────────────────────────────────────────
// Hand-made playlists in a fixed order, outside the astrology. Each shows as a
// chip in the genre grid (unless `hidden`, for seasonal ones still reachable by
// their link), credits its curator and shares as radio-venus.club/#<id>.
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
    curator: '최진영',
    curatorUrl: 'https://open.spotify.com/playlist/0wZJeaHWteex9KB0eD8PXO',
    description: 'As Venus is plunging backwards through Scorpio, Jinyoung created a playlist to capture her descent into the underground.',
    sign: 'Scorpio',
    tracks: [
      { name: 'Public Image Ltd. — The Order Of Death', youtubeVideoId: 'CrXzBljVaPc', backupVideoIds: ['Eith7hTCOek'] },
      { name: 'CCFX — 2Tru (Foreign Interior Dub Mix)', youtubeVideoId: 'CRk0lkMLyRk' },
      { name: 'Buttechno & Triš — spirit dub', youtubeVideoId: 'FSllY4WYvhM', backupVideoIds: ['SegZd6_MiQA'] },
      { name: 'Cyst, Iglooghost & daisy* — Rabbit', youtubeVideoId: 'nyh67_mL53A' },
      { name: 'Europa & R.I.C. — Roses', youtubeVideoId: 'jtkQmTgSkqg' },
      { name: 'Burial — Rodent', youtubeVideoId: 'E2TGmIQ0fHM', backupVideoIds: ['wqBiYJIlyzo'] },
      { name: 'wing! — Pack It In', youtubeVideoId: 'Nwv8bRpLxbc', backupVideoIds: ['mzJrHkALMEg'] },
      { name: 'Boom Bip & Doseone — Mannequin Hand Trapdoor I Reminder', youtubeVideoId: 'kdqvD__Bvtw' },
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
    // Seasonal: hidden from the grid, still playable from radio-venus.club/#valentine
    id: 'valentine',
    label: "Valentine's day special",
    curator: '최진영',
    curatorUrl: 'https://docs.google.com/document/d/1We4r9SyEyWY0rM8Njdcw7gkAy8e4lpBFb7aFTA7xtWY/edit?usp=sharing',
    sign: 'Aries',
    hidden: true,
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
