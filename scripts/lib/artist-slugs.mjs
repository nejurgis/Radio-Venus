// Artist page URLs, shared by generate-artist-pages and generate-sign-pages so
// both agree on every /artist/<slug>/ (same filter, same order, same collision
// suffixes as the pages themselves).
import { toSlug } from '../../src/slug.js';

/** Artists that get a page: a Venus sign and a video to play. */
export function hasArtistPage(a) {
  return a.name !== '@' && !!a.venus?.sign && !!a.youtubeVideoId;
}

/** slug → artist, and artist name → slug, for the artists in `db` with a page. */
export function artistSlugs(db) {
  const bySlug = new Map();
  const byName = new Map();
  for (const artist of db.filter(hasArtistPage)) {
    const base = toSlug(artist.name) || artist.spotifyId || artist.youtubeVideoId;
    let slug = base;
    let n = 2;
    while (bySlug.has(slug)) slug = `${base}-${n++}`;
    bySlug.set(slug, artist);
    byName.set(artist.name, slug);
  }
  return { bySlug, byName };
}
