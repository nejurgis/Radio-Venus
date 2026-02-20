# Radio Venus

> Discover music through your Venus sign.

Radio Venus is an astrology-based music discovery app. Enter your birth date, the app calculates your Venus placement, you pick a genre, and it plays music from artists who share your Venus sign — streamed via YouTube.

The database spans from Hildegard von Bingen (1098) to contemporary electronic producers, covering classical orchestral works, ambient, techno, IDM, industrial, darkwave, trip-hop, drum & bass, art pop, and jazz.

## How it works

```
Birth date  ──►  Venus calculation  ──►  Sign + Degree + Decan + Element
                                              │
Genre pick  ──►  Subgenre filter  ──►  Venus similarity sort  ──►  Playlist
                                                                       │
                                                                  YouTube Player
```

1. **Portal** — User enters their birth date (DD/MM/YYYY). A zodiac nebula ring shows the distribution of all artists as glassy element-colored dots at their ecliptic longitudes, with crisp sector outlines. Hover over any dot to see the artist name, sign, and Venus degree underneath. As you type, a preview dot glows at your Venus position. A "You" label marks the user's dot.
2. **Zoom transition** — On submit, the nebula smoothly zooms into the user's Venus sign over 2.5s with ease-out cubic easing. Rotation interpolates from free-spin to the locked sign position. The portal content fades away as the camera pushes in.
3. **Reveal** — Venus sign is displayed with degree and element. A red **tuner needle** sits at 12 o'clock on the zodiac ring — drag-rotate the ring to tune to any position, and the displayed Venus text and element color update in real-time. When music is playing, a now-playing marquee scrolls between the Venus text and the genre button (mix-blend-mode: difference against the nebula). Back button triggers a reverse zoom-out animation (1.8s) returning to the full ring.
4. **Genre** — User picks from 10 genre categories with color overlays that pop on hover. Each genre button has a dropdown arrow that reveals subgenre chips on click. The nebula remains zoomed as a background, showing just the 30° wedge of their Venus sign.
5. **Radio** — Matched artists play via a hidden YouTube iframe with custom controls (progress bar, seeker, time display, buffering spinner). Similarity scoring uses the **tuned position** from the reveal screen's needle, not just the natal Venus — rotate to explore different cosmic neighborhoods. The track list stretches to the bottom of the viewport with a fade-out gradient. Each track shows the artist's Venus sign (element-colored) and degree. A shuffle button randomizes the order. The zoomed nebula drifts slowly behind at 8% opacity.

### Venus calculation

Venus positions are computed using [astronomy-engine](https://github.com/cosinekitty/astronomy), a high-precision astronomical library. Birth dates use noon UTC (standard practice when birth time is unknown). The ecliptic longitude is converted to zodiac sign, degree within sign, and decan.

### Matching logic

The matcher (`src/matcher.js`) returns the **entire genre pool sorted by Venus proximity** when the user's longitude is available. Same-sign artists naturally rank highest, so there's no need for hard tier cutoffs — the similarity percentage tells the full story.

**Subgenre filtering:** When the user clicks a subgenre chip (e.g., "dub-techno" under Techno / House), the pool narrows to artists tagged with that subgenre. If fewer than 3 artists match, it silently falls back to the full genre pool.

**Without longitude** (edge case), a cascading fallback is used: same Venus sign → opposite sign → same element → all genre artists, with random shuffle.

### Venus similarity scoring (decanic precision)

Results are sorted by **Venus proximity** with a two-tier scoring system that respects sign boundaries — any degree in the same sign always ranks higher than any degree in a different sign:

**Same sign (50-100%):**
```
similarity = 50 + 50 × (1 - |degreeOffset| / 30)
```

**Different sign (0-49%):**
```
similarity = 49 × (1 - angularDistance / 180°)
```

| Relationship | Example | Similarity |
|----------|---------|-----------|
| Same degree | User 7° Gemini, artist 7° Gemini | 100% |
| Same sign, far | User 0° Gemini, artist 29° Gemini | 52% |
| Adjacent sign, close | User 29° Taurus, artist 0° Gemini | 49% |
| One sign apart | ~30° angular distance | 41% |
| Same element (sextile) | ~60° angular distance | 33% |
| Square | ~90° angular distance | 25% |
| Trine | ~120° angular distance | 16% |
| Opposition | 180° angular distance | 0% |

Artist Venus longitudes are reconstructed from `sign + degree` stored in `musicians.json`. The similarity percentage is displayed next to each artist in the track list alongside their Venus sign and degree.

This means if a user has Venus at 7° Gemini, they'll see all Gemini artists at the top (50-100%), with the closest degrees first, followed by all other signs ranked by ecliptic distance (0-49%).

### Custom playback UI ("Ghost Player")

The YouTube iframe runs hidden (`height: 1px; opacity: 0`) while a custom UI drives it:
- **Progress bar** — accent-colored fill with invisible range input overlay for click/drag seeking
- **Buffering indicator** — grey "reaching" bar with shimmer animation, inline SVG spinner replaces the play button during load
- **Time display** — `m:ss` current time and duration flanking the play button
- **Song titles** — actual YouTube video title shown below artist name via `player.getVideoData()`
- **Shuffle** — Fisher-Yates randomize button, preserves current track and failed state

The nebula background stays visible on the radio screen at 8% opacity with a slow drift rotation (360° in 600s), creating an ambient backdrop.

### Embed error handling

YouTube videos frequently block embedded playback (Error 150/101). The player handles this with a **multi-source fallback system**:
- Each non-classical artist stores up to 2 backup video IDs (`backupVideoIds` array)
- On error, the player **hot-swaps** to the next backup ID before marking the track as failed
- Failed tracks are visually struck through and marked "restricted"
- The player auto-skips to the next playable track after all IDs are exhausted
- 265 of 306 non-classical artists have backup video IDs

The `scripts/find-backups.mjs` script searches YouTube for backup videos per artist using queries like `"Artist genre full track"`, `"Artist topic"`, and `"Artist live"`, filtering for 1-60 minute duration.

## Architecture

Static single-page app — **Vite + vanilla JS**, no backend needed.

```
Radio-Venus/
  index.html                        # 4-screen SPA
  src/
    main.js                         # Flow controller, date input, startRadio(), keyboard shortcuts
    venus.js                        # astronomy-engine wrapper — sign, degree, decan, longitude
    matcher.js                      # Venus similarity scoring + genre/subgenre filtering
    player.js                       # YouTube IFrame Player wrapper
    genres.js                       # Genre taxonomy: GENRE_MAP, SUBGENRES, SUBGENRE_MAP (single source of truth)
    ui.js                           # Screen transitions, genre grid with subgenre chips, track list
    viz.js                          # Zodiac Nebula canvas: artist ring, hover readout, sign zoom
    style.css                       # Dark atmospheric theme with element-colored accents
  scripts/
    build-db.mjs                    # Wikidata + Venus calc + YouTube lookup → musicians.json + musicians.db
    smart-match.mjs                 # Last.fm similarity graph → discover new artists
    find-backups.mjs                # Find 2 backup YouTube video IDs per artist
    db-import.mjs                   # One-time / re-sync: musicians.json → musicians.db
    db-stats.mjs                    # SQLite dashboard: sign/genre distribution, gaps, anchors
    seed-musicians.json             # 460 hand-curated artists with verified video IDs
    musicians.db                    # SQLite DB (gitignored) — for ad-hoc queries
    manual-overrides.json           # Birth dates for artists invisible to all databases
  public/
    data/musicians.json             # Generated database (520 artists)
    favicon.svg                     # Venus glyph
  .github/workflows/
    deploy.yml                      # Auto-deploy to GitHub Pages on push to master
```

**Build time** (Node.js, `scripts/build-db.mjs`):
1. Loads seed data with manual subgenres, Everynoise raw tags (`enTags`), and YouTube IDs
2. Queries Wikidata SPARQL for musicians with birth dates
3. Maps raw genre tags through `categorizeGenres()` and `categorizeSubgenres()` from `src/genres.js`
4. Calculates Venus positions (sign, degree, decan, element) using astronomy-engine
5. Derives subgenres in priority order: (a) manual seed subgenres, (b) `categorizeSubgenres(enTags)` for EN-enriched artists, (c) `categorizeSubgenres(genres)` fallback for Wikidata artists — merged as a Set to avoid duplicates
6. Merges seed + Wikidata (seed takes priority), preserves cached YouTube IDs
7. Searches YouTube for any artists still missing video IDs
8. Preserves backup video IDs from previous builds
9. Outputs `public/data/musicians.json`

**Discovery** (Node.js, `scripts/smart-match.mjs`):

```
Seed artist
    ↓
Last.fm "similar artists"  ──┐  different signals:
Everynoise "fans also like" ──┤  scrobble co-listening vs Spotify data
                              ↓  merged + deduplicated candidate pool
           For each candidate:
                ↓
     Birth date  →  Wikidata → MusicBrainz → Wikipedia → RateYourMusic
                ↓
     Pre-1940 sanity check  +  MBID deduplication
                ↓
     Genre tags: Everynoise (primary) → Last.fm tags (fallback) → categorizeGenres()
                ↓
     [--filter]  Groq vibe check — raw tags sent for aesthetic judgment
                ↓
     Append to seed-musicians.json
```

- **Everynoise** (always-on): headless Playwright scrapes `research.cgi` for genres and `artistprofile.cgi` for "fans also like" — typically adds ~15 artists not on Last.fm per run. One shared browser instance per run. `verify-genres.mjs` uses `waitForSelector` (20s timeout) rather than a fixed delay — EN is slow for niche/experimental/jazz artists and a fixed wait caused false "not found" results.
- **Entity disambiguation**: Wikidata validates P106 occupation (musician/singer/composer/producer/DJ) or P31 instance-of (musical group). MusicBrainz prefers `Person` over `Group`. Both reject year < 1600 or future dates.
- **MBID deduplication**: MusicBrainz ID stored on entry; catches rename/alias cases (e.g. "Clark" vs "Chris Clark") that name-matching alone misses.
- **Pre-1940 rejection**: birth years < 1940 flagged as implausible for non-classical contexts — MusicBrainz often returns the wrong person for common names.
- **Groq filter** (`--filter`): raw Last.fm tags (not normalized categories) sent to `llama-3.3-70b` at temperature 0.2 for aesthetic fit judgment against the Radio Venus reference aesthetic.
- Supports BFS depth (`--depth 2` follows similarity chains two levels deep)

**Runtime** (browser):
1. `main.js` initializes the zodiac nebula ring immediately (empty dots), then loads `musicians.json` + YouTube IFrame API in parallel — nebula ring is visible from the first frame with no waiting
2. User enters birth date → `venus.js` computes sign, degree, decan, element, longitude → user Venus dot appears on the nebula
3. User navigates to genre screen → nebula zooms into user's sign sector → `ui.js` renders genre grid with subgenre chips
4. User clicks genre or subgenre → `matcher.js` returns full pool sorted by Venus similarity
5. `player.js` loads YouTube embeds; failed tracks auto-skip
6. Navigation: genre ← back → portal; radio ← back → genre (nebula zoom/visibility toggles per screen)
7. Zero server calls beyond static files and YouTube embeds

## Database

**520 musicians** across all 12 Venus signs and 10 genres.

| Genre | Artists |
|-------|---------|
| IDM / Experimental | 214 |
| Ambient / Drone | 211 |
| Classical / Orchestral | 116 |
| Techno / House | 107 |
| Synthwave / Darkwave | 98 |
| Art Pop | 59 |
| Trip-Hop / Downtempo | 57 |
| Industrial / Noise | 54 |
| Jazz | 33 |
| Drum & Bass / Jungle | 33 |

The seed file contains **460 artists** with verified embeddable YouTube video IDs and hand-assigned subgenres. Wikidata supplements this with additional musicians. The build script auto-derives subgenres for all artists using `categorizeSubgenres()`. Classical is intentionally curated: the ~116 kept are minimalists, impressionists, 20th-century avant-garde, and household icons — not the full Wikidata dump. The build processes artists in parallel batches of 5.

### Data model

Each artist in `musicians.json` has this structure:

```json
{
  "name": "Aphex Twin",
  "birthDate": "1971-08-18",
  "venus": {
    "sign": "Cancer",
    "degree": 14.2,
    "decan": 2,
    "element": "water"
  },
  "genres": ["idm", "ambient", "techno"],
  "subgenres": ["idm", "acid", "ambient"],
  "enTags": ["intelligent dance music", "experimental electronic", "acid techno"],
  "youtubeVideoId": "Xw5AiRVqfqk",
  "backupVideoIds": ["2fmo1Sjmc_g", "GrC_yuzO-Ss"]
}
```

- **`venus.degree`** — 0-30° within the sign (1 decimal precision)
- **`venus.decan`** — 1 (0-10°), 2 (10-20°), or 3 (20-30°)
- **`venus.element`** — fire/earth/air/water (derived from sign)
- **`genres`** — top-level category IDs (used for filtering)
- **`subgenres`** — Discogs-derived subgenre IDs (used for subgenre chip filtering); merged from manual seed curation + EN-derived tags
- **`enTags`** — raw Everynoise genre strings (present when enriched via `verify-genres --save-tags`); source material for subgenre derivation and future micro-genre features
- **`backupVideoIds`** — up to 2 fallback YouTube video IDs for hot-swap on embed error

The matcher reconstructs the full ecliptic longitude from `sign + degree` for similarity calculations. The browser-side `venus.js` also returns the raw `longitude` (0-360°) for the user's Venus.

## Genre taxonomy

Radio Venus uses a two-level genre system: **10 top-level categories** for primary UI filtering, and **~60 Discogs-derived subgenres** displayed as clickable chips beneath each genre button. Subgenres with 7+ artists in the database are interactive (accent-colored, clickable); those with fewer are shown dimmed as informational tags. Each genre button has a small dropdown arrow that reveals/hides its subgenre chips. All genre/subgenre data lives in `src/genres.js` — the single source of truth imported by both build scripts and the browser client.

### Research methodology

The genre taxonomy was built by cross-referencing four sources:

1. **MusicBrainz** — 2,000 official curated genres with user-voted popularity counts. Used to build the initial `GENRE_MAP` tag vocabulary. No longer queried at runtime for genre tagging — community votes introduced too much noise compared to Everynoise. Still used for birth date lookup (`getMusicBrainzBirthDate`) as a fallback after Wikidata.

2. **Discogs** — 15 top-level genres and ~300 styles (81 electronic). Analyzed via the [AcousticBrainz Genre Dataset](https://mtg.github.io/acousticbrainz-genre-dataset/) (Zenodo), which contains Discogs genre annotations for 905K recordings across 118K release groups. Co-occurrence analysis of electronic subgenres confirmed the 10-category clustering.

3. **UPF ISMIR 2022** — Alonso-Jimenez, Serra & Bogdanov, "[Music Representation Learning Based on Editorial Metadata From Discogs](https://repositori.upf.edu/server/api/core/bitstreams/7f84b040-451b-4aa4-ae15-4a6153ac806e/content)". Trained contrastive models on the top-400 Discogs styles across 3.3M tracks. Their finding that artist-level associations produce the strongest genre representations (87.7 ROC-AUC) validates the artist-level genre tagging approach. Heavily referenced for quality music discovery throughout the project.

4. **[cosine.club](https://cosine.club)** — Used for discovering and validating artists that fit the project's aesthetic. Provided a high-quality lens for underground and experimental music that formal taxonomies miss.

The [MetaBrainz genre-matching project](https://github.com/metabrainz/genre-matching) provided cross-taxonomy mappings between Discogs, Last.fm, and MusicBrainz, confirming high compatibility between the systems.

### Top-level categories

| ID | Label | Subgenres |
|----|-------|-----------|
| `ambient` | Ambient / Drone | ambient, dark-ambient, drone, berlin-school, new-age, space-ambient |
| `techno` | Techno / House | techno, house, deep-house, minimal, dub-techno, tech-house, acid, electro, trance |
| `idm` | IDM / Experimental | idm, experimental, abstract, glitch, leftfield, electronica, folktronica |
| `industrial` | Industrial / Noise | industrial, noise, ebm, power-electronics, rhythmic-noise, harsh-noise |
| `darkwave` | Synthwave / Darkwave | darkwave, synth-pop, new-wave, coldwave, synthwave, darksynth, krautrock |
| `triphop` | Trip-Hop / Downtempo | trip-hop, downtempo, dub, future-jazz, chillout, broken-beat, nu-jazz |
| `dnb` | Drum & Bass / Jungle | drum-n-bass, jungle, breakbeat, breakcore, dubstep, grime, uk-garage, future-garage, footwork |
| `classical` | Classical / Orchestral | classical, baroque, romantic, contemporary, neo-classical, impressionist, modern-classical, opera, minimalist |
| `artpop` | Art Pop | art-pop, art-rock, post-punk, shoegaze, dream-pop, indie-pop, noise-pop |
| `jazz` | Jazz | spiritual-jazz, free-jazz, nu-jazz, jazz-fusion, modal-jazz, avant-garde-jazz |

### Subgenre coverage

Of the ~60 subgenres defined, **28 have 7+ artists** and are clickable in the UI:

| Subgenre | Artists | Parent genre |
|----------|---------|-------------|
| classical | 307 | classical |
| ambient | 92 | ambient |
| experimental | 75 | idm |
| idm | 72 | idm |
| opera | 69 | classical |
| darkwave | 54 | darkwave |
| techno | 47 | techno |
| industrial | 32 | industrial |
| contemporary | 29 | classical |
| synth-pop | 21 | darkwave |
| trip-hop | 19 | triphop |
| modern-classical | 18 | classical |
| glitch | 15 | idm |
| dub-techno | 15 | techno |
| electro | 15 | techno |
| downtempo | 15 | triphop |
| drone | 15 | ambient |
| minimal | 13 | techno |
| romantic | 13 | classical |
| acid | 12 | techno |
| spiritual-jazz | 12 | jazz |
| free-jazz | 11 | jazz |
| art-pop | 11 | artpop |
| minimalist | 10 | classical |
| new-wave | 10 | darkwave |
| dubstep | 9 | dnb |
| house | 9 | techno |
| dub | 9 | triphop |

The remaining ~30 subgenres have 1-6 artists each and appear as dimmed (non-clickable) chips. Raw tags from MusicBrainz, Last.fm, and Wikidata are normalized via `GENRE_MAP` (~160 entries) in `src/genres.js` — the single source of truth imported by both build scripts and the browser client.

## Valentine's playlist

Visiting `radio-venus.club/#valentine` activates a hand-curated playlist of 16 tracks, bypassing astrology entirely. Artists tagged with `genres: ["valentine"]` in `musicians.json` are sorted by `sequenceIndex` (0-based) regardless of the user's Venus sign:

> Iko Chérie → Nathanial Young → Ouri → Angel Olsen → Sonic Youth → Cassandra Jenkins → Sam Gendel → A. G. Cook → James K → Four Tet → Yves Tumor → Peter Kardas → Kelly Moran → The Memphis Mustangs → Semi Trucks → Vegyn

Some of these artists also exist as separate entries in other genre pools (e.g. Four Tet in `techno/idm`, Vegyn in `idm/ambient/triphop`) — the valentine-tagged entries are distinct records with specific YouTube video IDs chosen for the playlist mood. Sorting uses `?? 999` (not `|| 999`) so index 0 sorts correctly.

## Database stats & discovery workflow

The database has two layers: `public/data/musicians.json` (browser + git) and `scripts/musicians.db` (SQLite, gitignored). The SQLite layer enables zero-token ad-hoc queries via the `sqlite3` CLI without parsing the full JSON.

```bash
npm run db:stats                       # full dashboard (sign/genre distribution, gaps)
npm run db:stats -- --gaps             # only underrepresented signs & genres
npm run db:stats -- --anchors          # suggest smart-match commands for weak signs
npm run db:import                      # re-sync musicians.db from musicians.json

# Ad-hoc SQL queries (no build step needed)
sqlite3 scripts/musicians.db "SELECT name, genres FROM musicians WHERE genres LIKE '%classical%' ORDER BY name"
sqlite3 scripts/musicians.db "SELECT venus_sign, count(*) as n FROM musicians GROUP BY venus_sign ORDER BY n DESC"
```

### Current coverage gaps

**Underrepresented Venus signs** (seed artists, target is ~31 each):

| Sign | Seed | Gap |
|------|------|-----|
| Sagittarius | 17 | needs ~14 more |
| Libra | 18 | needs ~13 more |
| Virgo | 22 | needs ~9 more |
| Pisces | 22 | needs ~9 more |

**Underrepresented genres**: Jazz (19 seed), Drum & Bass / Jungle (31 seed).

**Stray tags**: `electronic`, `soul` — unmapped Wikidata genre labels that need cleanup or mapping in `GENRE_MAP`.

### Discovery workflow

`smart-match.mjs` traverses social similarity graphs to find new artists while preserving the underground aesthetic — it follows real listener connections rather than dumping label rosters.

**Why two sources for discovery?** Last.fm and Everynoise use different signals. Last.fm tracks scrobble co-listening; Everynoise uses Spotify play data curated by Glenn McDonald. Overlap is typically only ~25% — so merging both roughly doubles the candidate pool. For very niche artists (e.g. Tonstartssbandht), Last.fm returns 0 but Everynoise returns 20.

**Genre tagging uses Everynoise only** — Last.fm folksonomy tags are noisy and inconsistent (community-voted, often too broad). Everynoise is the same source used for verification, so new artists enter the DB already consistent with the ground truth. Last.fm tags are kept as a fallback for artists not on Everynoise, and for the Groq aesthetic filter (raw tags rather than normalized categories).

**Typical session:**
1. `node scripts/db-stats.mjs --anchors` — find underrepresented Venus signs
2. Pick a seed artist with a strong graph (Four Tet, Tim Hecker, Grace Ives, Anna von Hausswolff…)
3. `node scripts/smart-match.mjs "Artist Name" --filter` — discover, filter, save
4. Spot-check a few birth dates (Wikidata/Google — MusicBrainz occasionally returns the wrong person)
5. `node scripts/build-db.mjs` — fetch YouTube IDs and rebuild `musicians.json`
6. `node scripts/db-stats.mjs` — verify coverage improved

**Flags:**
```
--filter    Groq vibe check before saving (recommended)
--depth 2   BFS two levels deep — much slower, use sparingly
--dry-run   Preview without writing
```

**Other discovery sources** (manual, used alongside smart-match):
- Spotify liked songs → find similar via Last.fm
- Label rosters (Warp, Raster-Noton, PAN, Hyperdub, Editions Mego) → cherry-pick standout artists
- Direct artist knowledge → add to seed-musicians.json manually

## Genre verification status

Cross-checked against [Everynoise](https://everynoise.com) via `scripts/verify-genres.mjs`.
Corrections applied via one-time patch scripts in `scripts/`.

All 14 genres have been cross-checked and corrected. Key patterns found: EN reliably distinguishes techno/triphop/IDM/electronica (many stored tags were over-broad); `experimental` correctly maps to IDM for electronic artists but needs explicit overrides for jazz (Sun Ra, Eric Dolphy) to prevent false IDM tags; ambient is systematically under-tagged by EN for IDM crossover artists — preserved manually.

| Genre | Artists | Status | Patch |
|-------|---------|--------|-------|
| techno | 103 | ✅ verified 2026-02-18 | patch-techno-genres.mjs |
| darkwave | 100 | ✅ verified 2026-02-18 | patch-darkwave-genres.mjs |
| ambient | 214 | ✅ verified 2026-02-18 | patch-ambient-genres.mjs |
| altrock | 10 | ✅ verified 2026-02-18 (new genre, hand-curated) | patch-altrock-genres.mjs |
| artpop | 111 | ✅ verified 2026-02-19 | patch-artpop-genres.mjs |
| electronica | 46 | ✅ verified 2026-02-19 | patch-electronica-dnb-classical-genres.mjs |
| dnb | 40 | ✅ verified 2026-02-19 | patch-electronica-dnb-classical-genres.mjs |
| classical | 91 | ✅ verified 2026-02-19 | patch-electronica-dnb-classical-genres.mjs |
| idm | 242 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |
| industrial | 54 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |
| jazz | 42 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |
| triphop | 60 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |
| indiepop | 28 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |
| folk | 20 | ✅ verified 2026-02-19 | patch-folk-indiepop-idm-industrial-jazz-triphop-genres.mjs |

## Roster log

Tracks manual additions and discovery runs — who was added, when, and what prompted it.

| Date | Artist(s) | Source / anchor |
|------|-----------|-----------------|
| 2026-02-18 | Joanna Brouk | Manual — direct knowledge, born 1949-02-20, Venus Aquarius 17.6° |
| 2026-02-18 | Laraaji, Suzanne Ciani, Laurie Spiegel, Steve Roach, Pauline Anna Strom, Fripp & Eno, Colleen, Ana Roxanne, Emerald Web, Ariel Kalma, Satoshi Ashikawa, Chihei Hatakeyama, Jonny Nash, + 24 more (37 total) | `smart-match "Joanna Brouk" --depth 2 --filter` |
| 2026-02-18 | David Casper | Manual — Gemini suggestion, Pacific NW sound sculptor, born 1953-09-25, Venus Virgo 1.6° |
| 2026-02-18 | Clark, Caribou, Joy Orbison, Jamie xx, Burial & Four Tet, Burial & Four Tet & Thom Yorke, Massive Attack vs Burial, Nathan Fake, Modeselektor (10 total) | `smart-match "Four Tet" --depth 2 --filter` |
| 2026-02-18 | Roly Porter, Abul Mogard, Blanck Mass, Emptyset (4 total) | `smart-match "Ben Frost" --depth 1 --filter` |
| 2026-02-18 | Chelsea Wolfe, Emma Ruth Rundle, Shannon Wright, Esben and the Witch, Midwife, Big Brave, Cate Le Bon, Elysian Fields, My Brightest Diamond, Nina Nastasia, + 9 more (19 total) | `smart-match "Marissa Nadler" --depth 2 --filter` (proxy for Anna von Hausswolff orbit — Last.fm has no graph for Anna) |
| 2026-02-18 | Slowdive, Dead Can Dance, This Mortal Coil, my bloody valentine, Mazzy Star, Hope Sandoval & The Warm Inventions, Julee Cruise, Robin Guthrie, Cranes, Lycia, Claire Voyant, Black Tape for a Blue Girl, Bel Canto, His Name Is Alive, Pale Saints, An April March, Love Spirals Downwards, Kitchens of Distinction, Soul Whirling Somewhere, + 18 more (37 total) | `smart-match "Cocteau Twins" --depth 2 --filter` |
| 2026-02-18 | Grace Ives | Manual — born 1995-04-03, Venus Aries 9.4° |
| 2026-02-18 | Avey Tare, Dirty Beaches, Animal Collective, John Maus, The Cleaners From Venus, Exploded View, Anika, Ought, Deakin, Preoccupations (10 total) | `smart-match "Tonstartssbandht" --filter` |
| 2026-02-18 | Dora Jar, Empress Of, Tirzah, Okay Kaya, Issy Wood, Sudan Archives, Jockstrap, U.S. Girls, Caroline Polachek (9 total) | `smart-match "Grace Ives" --filter` |

## Deployment

Pushes to `master` trigger a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the project and deploys `dist/` to the `gh-pages` branch via [JamesIves/github-pages-deploy-action](https://github.com/JamesIves/github-pages-deploy-action).

## Setup

Requires **Node.js 18+** (uses Vite 6).

```bash
npm install
npm run build:db    # Generate musicians.json (queries Wikidata + YouTube)
npm run dev         # Start dev server at localhost:5173
```

The `build:db` step regenerates `public/data/musicians.json` (checked into the repo, so the app works without rebuilding). If Wikidata is unavailable, the build falls back to seed data only.

## Design

Dark atmospheric UI:

- **Background**: `#0a0a0c`, surface: `#242424`
- **Typography**: IBM Plex Mono, Apple Garamond/EB Garamond (serif), Akzidenz-Grotesk/Archivo (sans)
- **Element accent colors**: fire = `#c0392b`, earth = `#27ae60`, air = `#d4ac0d`, water = `#2980b9`
- **Zodiac palette**: Each genre button has a per-genre color (deep teal, coral, bright gold, etc.) that stays hidden at rest (black background) and pops as a vivid overlay on hover with a matching glow box-shadow
- **Loading ring**: Ring SVG with `currentColor` fill, cycling through 12 zodiac palette colors via CSS keyframes (18s cycle)

Screens transition with opacity fades. The zoom animation replaces the loading overlay — submitting a birth date triggers a smooth 2.5s camera push into the zodiac ring.

### Zodiac Nebula

A Canvas-based visualization (`src/viz.js`) draws all artists as a ring of element-colored dots at their ecliptic longitudes.

- **Glassy dots** — 6-stop radial gradient gives a gem-like quality. Additive blending (`globalCompositeOperation: 'lighter'`) makes dense signs glow.
- **Deterministic jitter** — positions hashed from artist name, stable across renders
- **Tuner needle** — red line at 12 o'clock; drag-rotating the ring in zoomed mode updates similarity scoring in real-time via a longitude callback
- **Hover / click** — nearest dot expands, shows name + sign + degree; clicking on the genre screen navigates directly to that artist's stream
- **Preview dot** — breathing glow at the user's Venus position as they type, before submitting
- **Animated zoom** — `zoomToSign()` interpolates scale, translation, and rotation over 2.5s; `zoomOut()` reverses in 1.8s. The nebula persists across all screens, visibility toggled per screen.

### Genre screen

The genre grid is a 2-column layout (480px max-width) where each cell contains:
- A `.genre-btn` button — black at rest (`--bg-surface`), palette color pop on hover/highlight via `--genre-color-pop` custom properties (0.6-0.75 opacity, white text, glow box-shadow)
- A `.subgenre-chips` row of small tags beneath it

**Active chips** (7+ artists) get solid accent fill with inverted text. **Inactive chips** (<7 artists) are dimmed as informational tags. Hover tooltips show the exact artist count. Hovering a nebula dot on the genre screen highlights the corresponding genre button with `.is-highlighted` class (same color pop). Clicking a nebula dot navigates directly to that artist's radio stream.

### Track list

The track list stretches to the bottom of the viewport (`flex: 1` in the radio layout flex column). A `.track-list-wrap::after` pseudo-element creates a 3.5rem gradient fade at the bottom (transparent → background color), making the list appear to dissolve endlessly into the page.

Each track displays: artist name (left, truncated with ellipsis if long), Venus similarity percentage in accent color, and Venus sign with degree (right, e.g. "Gemini 13°"). Sign names are colored by their element. The active track has a left-border accent marker. Failed/restricted tracks are struck through at 25% opacity.

## Key dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | Venus position calculation (ecliptic longitude → sign/degree/decan) | Client + build |
| [yt-search](https://github.com/nicholasgasior/yt-search) | YouTube video ID lookup | Build only (dev dep) |
| [cheerio](https://cheerio.js.org) | HTML parsing for Last.fm scraping (smart-match) | Build only (dev dep) |
| [playwright](https://playwright.dev) | Headless browser for everynoise.com scraping (`--everynoise` flag) | Build only (dev dep) |
| [vite](https://vitejs.dev) | Dev server + bundler | Dev only |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit date / advance |
| `←` / `→` | Previous / next track |
| `Space` | Play / pause |

## Known limitations

- **Subgenre precision varies** — Seed artists with Everynoise enrichment (`enTags`) get the richest subgenres (e.g., `["neofolk", "dark-folk", "gaian-doom"]`). Seed artists without EN enrichment have hand-curated subgenres. Wikidata artists get subgenres auto-derived from broad genre categories, which is less precise (e.g., a classical composer gets `classical` and `opera` but not `romantic` unless those labels appeared in Wikidata).
- **Embed restrictions** — Some YouTube videos block embedded playback (Error 150/101). The app hot-swaps to backup video IDs before skipping, but some tracks may still fail if all IDs are restricted.
- **Birth time not considered** — Venus sign is calculated at noon UTC. For birth dates where Venus changes signs that day, the result may differ from a full natal chart with exact birth time. The similarity score could show ~100% for an artist whose actual Venus is in the adjacent sign.
- **Electronic genre coverage is thin vs. classical** — Wikidata has far more classical composers with birth dates than electronic musicians. The seed file compensates but could always use more entries.
- **Venus similarity precision** — Artist degrees in `musicians.json` are rounded to 1 decimal (0.1°), giving ~0.05% similarity precision. More than adequate for display purposes.
- **YouTube dependency** — The IFrame API is a cross-origin black box. No audio access for analysis, fragile video IDs, embed restrictions.

## Extending the seed data

To add more artists, edit `scripts/seed-musicians.json`:

```json
{
  "name": "Artist Name",
  "birthDate": "YYYY-MM-DD",
  "genres": ["techno", "ambient"],
  "subgenres": ["dub-techno", "ambient"],
  "youtubeVideoId": "dQw4w9WgXcQ",
  "backupVideoIds": ["abc123", "def456"]
}
```

**Tip**: Use YouTube "Topic" channel videos (auto-generated, static artwork) — they're almost always embeddable. Search for `"Artist Name" - Topic` on YouTube.

Genre IDs: `ambient`, `techno`, `idm`, `industrial`, `darkwave`, `triphop`, `dnb`, `classical`, `artpop`, `jazz`

Subgenre IDs: see the taxonomy table above, or check `SUBGENRES` in `src/genres.js`.

Then rebuild: `npm run build:db`

## Subgenre enrichment workflow

Seed artists can be enriched with Everynoise micro-genre tags (`enTags`) which are then auto-normalized into `subgenres` during the build. This enables finer filtering (e.g., "gaian doom" under Folk, "dub-techno" under Techno) and is the foundation for future decan-level and iOS app features.

```bash
# Enrich a genre's artists with EN tags (saves enTags to seed-musicians.json)
node scripts/verify-genres.mjs --genre=folk --save-tags

# Enrich all artists (slow — ~13s per artist)
node scripts/verify-genres.mjs --save-tags

# Rebuild musicians.json (picks up enTags → normalized subgenres automatically)
npm run build:db
```

The `--save-tags` flag writes raw EN strings to each artist's `enTags` field in `seed-musicians.json`. During build, `categorizeSubgenres(enTags)` converts those to normalized IDs and merges them with the manually curated `subgenres` (no duplicates). The raw `enTags` strings are also preserved in `musicians.json` for future use (iOS app, decan-level filtering, etc.).

## Potential improvements

- **Decan-level filtering (iOS app)** — Venus decans (0-10°, 10-20°, 20-30° within a sign) each have a distinct astrological flavor. The `enTags` field now stored per artist provides the micro-genre data needed to surface, e.g., "neofolk artists with Scorpio Venus decan 2." Planned for a future iOS companion app.
- **Alternative audio backend** — YouTube embeds are a cross-origin black box: no audio access, fragile video IDs, embed restrictions. Internet Archive, Bandcamp, or self-hosted audio would unlock Web Audio API analysis and real-time features.
- **Finer subgenre assignment** — Run `verify-genres.mjs --save-tags` for all genres to fully enrich the seed with EN micro-genre data. Currently only a subset of artists have `enTags`.
- **Venus modality matching** — Add cardinal/fixed/mutable as a matching axis alongside element, or weight matches by astrological aspect (trine, sextile, square).
- **Confidence scoring** — Weight genre tags by how many sources agree on them rather than treating all tags equally.

## SEO & discoverability

The site includes several layers of search engine and AI optimization, all additive — no visible UI changes:

- **Meta tags** — Descriptive `<title>`, `<meta description>`, canonical URL (`radio-venus.club`)
- **Open Graph / Twitter Cards** — Social sharing previews with title, description, and image path
- **JSON-LD structured data** — `WebApplication` schema for rich search results
- **Crawlable about copy** — The about text is duplicated inside `#screen-portal` (visually hidden via `clip`) so search engines index it on the landing page without requiring JS navigation
- **Venus sign index** — A `<footer>` with descriptions of all 12 Venus sign musical aesthetics, targeting long-tail queries like "Venus in Scorpio music taste." Visually hidden but in the DOM
- **`robots.txt`** — Allows all crawlers, points to sitemap
- **`sitemap.xml`** — Single-page sitemap for `radio-venus.club`
- **`llms.txt`** — Plain text file ([llmstxt.org](https://llmstxt.org) convention) describing the app for AI crawlers — what it is, how it works, all 12 Venus sign aesthetics, and creator info

## Built with Claude

This project was built in close collaboration with [Claude Code](https://claude.ai/claude-code) (Anthropic's AI coding agent, model: Claude Sonnet 4.6). Claude served as a pair programmer throughout — architecture decisions, data pipeline design, genre taxonomy research, Venus similarity scoring, SQLite migration, and the Valentine playlist feature. The README itself was co-written.

What Claude helped build:
- The two-tier Venus similarity scoring system (same-sign vs. cross-sign formulas)
- `build-db.mjs` and `smart-match.mjs` data pipelines (Wikidata SPARQL, Last.fm scraping, YouTube lookups)
- SQLite management layer (`db-import.mjs`, `db-stats.mjs`) for zero-token DB queries
- Backup video ID hunting (`find-backups.mjs`)
- SEO layer (meta tags, structured data, crawlable content, robots.txt, sitemap, llms.txt)
- Valentine's playlist sequencing and the `sequenceIndex` sort fix
- Everynoise `enTags` pipeline (`--save-tags` flag + build-db enrichment) for future decan/iOS filtering
- Zodiac nebula early-render (ring visible before DB loads, dots populate async)

The human (Jurgis) brought the astrological premise, musical curation, visual design direction, and all creative decisions. Claude brought the engineering execution and research throughput.
