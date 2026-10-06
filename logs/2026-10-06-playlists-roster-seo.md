# Curated playlists, 15 new artists, date reliability, artist pages for SEO — 2026-10-06

All pushed to `master` and live on radio-venus.club (deploys via the GitHub
Pages action). Commits `e0fee36` … `8520567`.

**Check back ~2026-11-03:** Search Console → Pages → "Crawled – currently not
indexed" (was 209) and "Page with redirect" (was 798) should be falling;
Performance → filter pages containing `/artist/` for impressions/clicks.
Click **Validate fix** on both rows if not done yet.

## Curated playlists (`src/playlists.js`)

- Hand-made playlists now live in their own file, not in `musicians.json`.
  **Why:** the first Valentine playlist was stored as valentine-tagged artists
  in `musicians.json`; the genre-cleanup scripts wiped those tags in March 2026
  (commit 42e47aa) and the playlist silently broke.
- **Venus Retrograde 1/2** by jinyoung choi (credit links to her Instagram),
  20 tracks from her Spotify playlist, matched to YouTube by duration and
  checked embeddable via oEmbed. Track 8 is Yawning Portal — Cut To The Feeling
  (swapped in for Boom Bip). Description: "as Venus is plunging backwards
  through Scorpio, this playlist accompanies her descent into the underground ✶⋆.˚"
- **Valentine's day special** restored from git history (15 of 16 — Four Tet's
  video was taken down), shown only Feb 7–14 (`season` field): outside that
  window no chip and `#valentine` does nothing.
- Each playlist: chip at the top of the genre grid (Valentine-heart style),
  button under "Choose a genre", fixed order, "Curated by" credit +
  description, share link `/#<id>`. Sharing one of its songs shares the playlist
  (curated songs have no artist page).
- Instagram link with UTM tags:
  `https://radio-venus.club/?utm_source=instagram&utm_medium=social&utm_campaign=venus-retrograde-1#venus-retrograde-1`

## Player / UI

- One type scale for the player and playlists: `--fs-body` / `--fs-small` /
  `--fs-caption` (0.9/0.75/0.6rem phones, 1/0.8/0.65rem from 768px).
- Fixed: the active track scrolled under the sticky playlist header
  (first track hidden on shared playlist links).

## Roster: 15 artists added (via admin-resolve → admin-commit → build-db)

Public Image Ltd., Buttechno, Cyst, Europa, wing!, underscores, the sound chalk
makes, nahdoitagain, Roza Terenzi, Roberto Musci, Dregs, Coppice Halifax,
Telefon Tel Aviv, Now Always Fades, Iglooghost — each with its playlist song as
the handpicked track. Genres hand-corrected where Last.fm matched a namesake
(Cyst, wing!, Dregs, Europa — Europa's identity unconfirmed). 10 have no known
birth date and use their playlist song's release date (marked approximate).

**Gotcha:** `build-db` drops artists that are in `musicians.json` but not in the
seed. Erwin Schulhoff is one — re-added by hand this time; he'll vanish on the
next rebuild (incl. one triggered by the admin tool) unless added to the seed.

## Date reliability

- Every artist has `dateReliability`: `exact` | `approximate` (year-only, the
  Jan 1 / Jun 15 / mid-month placeholders, or a stand-in release date). Rule in
  `scripts/lib/date-reliability.mjs`, used by build-db and admin-resolve; a seed
  entry's own value overrides. Backfilled: 865 exact, 367 approximate.
- `EXACT_DATES_ONLY` in `src/matcher.js` (off) hides approximate ones site-wide.
- The add-artist tool flags dates it filled in and shows them with "≈" in the
  preview. "Exact" means complete, not verified (e.g. a lookup gave Joy Orbison 1936).

## Admin

- `radio-venus.club/admin` forwards to the add-artist Worker
  (`radio-venus-admin.nejurgis.workers.dev`) — GitHub Pages can't host it.
- Admin password changed (Worker secret `ADMIN_PASSWORD`; not in the repo).

## SEO / indexing

Diagnosis from Search Console (6 Oct 2026):

| Reason | Pages | Cause |
|---|---|---|
| Page with redirect | 798 | Old canonical-without-slash bug (fixed 2026-09-18, Google re-checking) + share links built without the trailing slash (fixed `b32c5b8`) |
| Crawled – currently not indexed | 209 | Artist pages were the app shell with only `<title>` changed — 1,231 near-copies of the homepage; plus similar sign×genre pages |
| Alternative page with proper canonical | 57 | Expected: genre variants and `?t=` links point to the main artist page |
| Redirect error | 1 | `/sign/pisces`, last crawled May — now one clean 301; validate fix |

Fixes:
- **Artist pages are real profiles** (`scripts/generate-artist-pages.mjs`):
  `/artist/<slug>/` is static HTML with name, Venus placement (approximate
  flagged), song with a play button into the player, genres linking to sign
  pages, 8 closest Venus placements + 8 of the same sign, MusicGroup +
  BreadcrumbList structured data. `/artist/<slug>/<genre>/` stay app shells for
  share links; old `?t=` links on the profile forward into playback.
- **Sign pages link artists to their profiles** (were deep links into the
  player), so every artist page is reachable by crawling (2,462 links, all
  resolve). Shared slug logic: `scripts/lib/artist-slugs.mjs`.
- **Analytics keeps UTM tags**: gtag config captures `page_location` inline,
  before the app's `replaceState` strips `?utm_` and `#playlist`.

Not done (ideas if indexing stays low): give sign×genre pages their own copy
about the pairing; stop repeating the 1,231-artist index on the genre-variant
app pages.
