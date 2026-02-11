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

1. **Portal** — User enters their birth date (DD/MM/YYYY). A zodiac nebula ring shows the distribution of all artists as glassy element-colored dots at their ecliptic longitudes, with crisp Rudnick-style sector outlines. Hover over any dot to see the artist name, sign, and Venus degree underneath. As you type, a preview dot glows at your Venus position. A "You" label marks the user's dot.
2. **Zoom transition** — On submit, the nebula smoothly zooms into the user's Venus sign over 2.5s with ease-out cubic easing. Rotation interpolates from free-spin to the locked sign position. The portal content fades away as the camera pushes in.
3. **Reveal** — Venus sign is displayed with degree and element. A red **tuner needle** sits at 12 o'clock on the zodiac ring — drag-rotate the ring to tune to any position, and the displayed Venus text and element color update in real-time. When music is playing, a now-playing marquee scrolls between the Venus text and the genre button (mix-blend-mode: difference against the nebula). Back button triggers a reverse zoom-out animation (1.8s) returning to the full ring.
4. **Genre** — User picks from 10 genre categories with Rudnick-palette color overlays that pop on hover. Each genre button has a dropdown arrow that reveals subgenre chips on click. The nebula remains zoomed as a background, showing just the 30° wedge of their Venus sign.
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
    build-db.mjs                    # Wikidata + Venus calc + YouTube lookup → musicians.json
    smart-match.mjs                 # Last.fm similarity graph → discover new artists
    find-backups.mjs                # Find 2 backup YouTube video IDs per artist
    seed-musicians.json             # 361 hand-curated artists with verified video IDs
    manual-overrides.json           # Birth dates for artists invisible to all databases
  public/
    data/musicians.json             # Generated database (712 artists)
    favicon.svg                     # Venus glyph
  .github/workflows/
    deploy.yml                      # Auto-deploy to GitHub Pages on push to master
```

**Build time** (Node.js, `scripts/build-db.mjs`):
1. Loads seed data (361 artists with subgenres + YouTube IDs)
2. Queries Wikidata SPARQL for musicians with birth dates
3. Maps raw genre tags through `categorizeGenres()` and `categorizeSubgenres()` from `src/genres.js`
4. Calculates Venus positions (sign, degree, decan, element) using astronomy-engine
5. Derives subgenres from genre categories for any artist with empty subgenres
6. Merges seed + Wikidata (seed takes priority), preserves cached YouTube IDs
7. Searches YouTube for any artists still missing video IDs
8. Preserves backup video IDs from previous builds
9. Outputs `public/data/musicians.json`

**Discovery** (Node.js, `scripts/smart-match.mjs`):
- Takes a seed artist name, scrapes Last.fm's "similar artists" page
- Cross-references Wikidata/MusicBrainz/Wikipedia for birth dates (4-tier fallback)
- **Entity disambiguation**: Wikidata lookups validate that matched entities are actually musicians (P106 occupation check: musician, singer, composer, producer, DJ, electronic musician) or musical groups (P31 instance-of check). Rejects non-musical entities, year < 1600, and future dates. MusicBrainz prefers `Person` type over `Group` and applies the same year sanity check.
- Gets genre tags from Last.fm, maps through `categorizeGenres()`
- Appends discovered artists to `seed-musicians.json`
- Supports BFS depth (e.g., `--depth 2` follows similarity chains)

**Runtime** (browser):
1. `main.js` loads `musicians.json` + YouTube IFrame API in parallel; `viz.js` initializes the zodiac nebula ring
2. User enters birth date → `venus.js` computes sign, degree, decan, element, longitude → user Venus dot appears on the nebula
3. User navigates to genre screen → nebula zooms into user's sign sector → `ui.js` renders genre grid with subgenre chips
4. User clicks genre or subgenre → `matcher.js` returns full pool sorted by Venus similarity
5. `player.js` loads YouTube embeds; failed tracks auto-skip
6. Navigation: genre ← back → portal; radio ← back → genre (nebula zoom/visibility toggles per screen)
7. Zero server calls beyond static files and YouTube embeds

## Database

**712 musicians** across all 12 Venus signs and 10 genres.

| Genre | Artists |
|-------|---------|
| Classical / Orchestral | 406 |
| IDM / Experimental | 130 |
| Ambient / Drone | 119 |
| Techno / House | 93 |
| Synthwave / Darkwave | 87 |
| Industrial / Noise | 44 |
| Art Pop | 43 |
| Trip-Hop / Downtempo | 42 |
| Drum & Bass / Jungle | 31 |
| Jazz | 19 |

The seed file contains **361 artists** with verified embeddable YouTube video IDs and hand-assigned subgenres. Wikidata supplements this with additional musicians (primarily classical composers). The build script auto-derives subgenres for all artists using `categorizeSubgenres()`, so all 712 artists participate in subgenre filtering. The build processes artists in parallel batches of 5.

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
  "youtubeVideoId": "Xw5AiRVqfqk",
  "backupVideoIds": ["2fmo1Sjmc_g", "GrC_yuzO-Ss"]
}
```

- **`venus.degree`** — 0-30° within the sign (1 decimal precision)
- **`venus.decan`** — 1 (0-10°), 2 (10-20°), or 3 (20-30°)
- **`venus.element`** — fire/earth/air/water (derived from sign)
- **`genres`** — top-level category IDs (used for filtering)
- **`subgenres`** — Discogs-derived subgenre IDs (used for subgenre chip filtering)
- **`backupVideoIds`** — up to 2 fallback YouTube video IDs for hot-swap on embed error

The matcher reconstructs the full ecliptic longitude from `sign + degree` for similarity calculations. The browser-side `venus.js` also returns the raw `longitude` (0-360°) for the user's Venus.

## Genre taxonomy

Radio Venus uses a two-level genre system: **10 top-level categories** for primary UI filtering, and **~60 Discogs-derived subgenres** displayed as clickable chips beneath each genre button. Subgenres with 7+ artists in the database are interactive (accent-colored, clickable); those with fewer are shown dimmed as informational tags. Each genre button has a small dropdown arrow that reveals/hides its subgenre chips. All genre/subgenre data lives in `src/genres.js` — the single source of truth imported by both build scripts and the browser client.

### Research methodology

The genre taxonomy was built by cross-referencing three sources:

1. **MusicBrainz** — 2,000 official curated genres with user-voted popularity counts. Queried via the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) (`inc=genres+tags`) for all seed artists to identify unmapped tags.

2. **Discogs** — 15 top-level genres and ~300 styles (81 electronic). Analyzed via the [AcousticBrainz Genre Dataset](https://mtg.github.io/acousticbrainz-genre-dataset/) (Zenodo), which contains Discogs genre annotations for 905K recordings across 118K release groups. Co-occurrence analysis of electronic subgenres confirmed the 10-category clustering.

3. **UPF ISMIR 2022** — Alonso-Jimenez, Serra & Bogdanov, "[Music Representation Learning Based on Editorial Metadata From Discogs](https://repositori.upf.edu/handle/10230/54473)". Trained contrastive models on the top-400 Discogs styles across 3.3M tracks. Their finding that artist-level associations produce the strongest genre representations (87.7 ROC-AUC) validates our artist-level genre tagging approach.

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

The remaining ~30 subgenres have 1-6 artists each and appear as dimmed (non-clickable) chips. The 361 seed artists have hand-curated subgenres; all 712 artists have subgenres either hand-curated or auto-derived from their genre categories via `categorizeSubgenres()`.

### Tag mapping

Raw tags from MusicBrainz, Last.fm, and Wikidata are normalized via `GENRE_MAP` (~130 entries) in `src/genres.js`. This is the single source of truth — both `build-db.mjs` and `smart-match.mjs` import from it. The map handles:

- **Exact matches**: `"dub techno"` → `['techno', 'ambient']`
- **Spelling variants**: `"synth-pop"` / `"synthpop"` → `['darkwave']`
- **Cross-taxonomy terms**: `"drum and bass"` / `"drum & bass"` / `"drum n bass"` → `['dnb']`
- **Substring fallbacks**: unknown tags are matched against existing keys via substring inclusion

### Key findings from co-occurrence analysis

From the AcousticBrainz Discogs dataset (electronic recordings only):

| Co-occurring subgenres | Count | Validates |
|------------------------|-------|-----------|
| electro + synth-pop | 1,192 | darkwave cluster |
| ambient + experimental | 1,124 | ambient/idm overlap |
| ambient + downtempo | 1,038 | ambient/triphop bridge |
| ebm + industrial | 568 | industrial cluster |
| ambient + idm | 533 | idm/ambient affinity |
| downtempo + trip hop | 490 | triphop cluster |
| house + techno | 446 | techno cluster |

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

Dark atmospheric UI inspired by [David Rudnick](https://davidrudnick.org) and [cosine.club](https://cosine.club):

- **Background**: `#0a0a0c`, surface: `#242424`
- **Typography**: IBM Plex Mono, Apple Garamond/EB Garamond (serif), Akzidenz-Grotesk/Archivo (sans)
- **Element accent colors**: fire = `#c0392b`, earth = `#27ae60`, air = `#d4ac0d`, water = `#2980b9`
- **Rudnick zodiac palette**: Each genre button has a per-genre color (deep teal, coral, bright gold, etc.) that stays hidden at rest (black background) and pops as a vivid overlay on hover with a matching glow box-shadow
- **Loading ring**: Rudnick ring SVG with `currentColor` fill, cycling through 12 zodiac palette colors via CSS keyframes (18s cycle)

Screens transition with opacity fades. The zoom animation replaces the loading overlay — submitting a birth date triggers a smooth 2.5s camera push into the zodiac ring.

### Zodiac Nebula

A Canvas-based visualization (`src/viz.js`) draws all 712 artists as a ring of element-colored dots at their ecliptic longitudes. Key features:

- **Whole-sign sector outlines** — 12 annular wedges with white outlines, signs progress counter-clockwise (astrological convention)
- **Element colors** — fire (red), earth (green), air (yellow), water (blue)
- **Glassy "sharkot ball" dots** — 6-stop radial gradient with specular highlight offset top-left, bright glare falloff, body color, darkened rim, and hard edge cutoff. Gives dots a gem-like, graphic quality. Scaled 1.5x to compensate for gradient edges.
- **Deterministic jitter** — Artist positions are hashed from their name, so the nebula is stable across renders (no `Math.random()`)
- **Additive blending** — `globalCompositeOperation: 'lighter'` makes overlapping dots glow where signs are dense
- **Tuner needle** — A red line at 12 o'clock on the zodiac ring (drawn behind the ring so it appears between the dots and the dial face). When zoomed in, drag-rotating the ring sweeps the needle across artist dots. Dots within ±1° of the needle get a hover-like glow highlight. The needle fires a rotation callback each frame with the current ecliptic longitude, updating the display and similarity scoring in real-time.
- **Slow rotation** — 360° in 240 seconds
- **Under-dot labels** — In zoomed mode, each dot shows the artist name underneath in element color. On hover, the label goes bold white with a second line showing zodiac sign + degree (e.g., "Gemini 14.2°")
- **"You" label** — The user's pulsing Venus dot has a "You" label beneath it in both full-ring and zoomed modes
- **Hover detection** — Document-level mousemove hit-testing finds the nearest dot, expands it to 7px white. Interactive elements (inputs, buttons) take priority. Custom 24px crosshair cursor generated as a canvas data URL. Hovering a dot on the genre screen highlights the matching genre button with Rudnick palette colors.
- **Click-to-play** — Clicking a dot on the genre screen navigates to that artist's radio stream
- **Preview dot** — As the user types their birth date, a soft breathing glow appears at the corresponding Venus position on the ring, giving immediate visual feedback before submitting
- **HiDPI** — Scaled by `devicePixelRatio` for crisp Retina rendering

**Animated zoom:** `zoomToSign()` returns a Promise and smoothly interpolates scale, translation, and rotation over a configurable duration (default 2.5s). The transform uses a focus-point interpolation — scaling around the target sign's position on the ring while simultaneously panning it toward screen center. Rotation takes the shortest angular path from the current free-spin angle to the locked position. `zoomOut()` plays the reverse animation (1.8s, ease-in cubic). The `zoomProgress` variable (0-1) drives all interpolations.

The nebula container lives at body level (outside screens) so it persists across screen transitions. Visibility is toggled per screen: visible on portal (full ring), reveal (zoomed, static), genre (zoomed, dimmed, static), and radio (zoomed, 8% opacity, slow drift rotation at 360°/600s).

### Genre screen

The genre grid is a 2-column layout (480px max-width) where each cell contains:
- A `.genre-btn` button — black at rest (`--bg-surface`), Rudnick palette color pop on hover/highlight via `--genre-color-pop` custom properties (0.6-0.75 opacity, white text, glow box-shadow)
- A `.subgenre-chips` row of small tags beneath it

**Active chips** (7+ artists) get solid accent fill with inverted text. **Inactive chips** (<7 artists) are dimmed as informational tags. Hover tooltips show the exact artist count. Hovering a nebula dot on the genre screen highlights the corresponding genre button with `.is-highlighted` class (same Rudnick color pop). Clicking a nebula dot navigates directly to that artist's radio stream.

### Track list

The track list stretches to the bottom of the viewport (`flex: 1` in the radio layout flex column). A `.track-list-wrap::after` pseudo-element creates a 3.5rem gradient fade at the bottom (transparent → background color), making the list appear to dissolve endlessly into the page.

Each track displays: artist name (left, truncated with ellipsis if long), Venus similarity percentage in accent color, and Venus sign with degree (right, e.g. "Gemini 13°"). Sign names are colored by their element. The active track has a left-border accent marker. Failed/restricted tracks are struck through at 25% opacity.

## Key dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | Venus position calculation (ecliptic longitude → sign/degree/decan) | Client + build |
| [yt-search](https://github.com/nicholasgasior/yt-search) | YouTube video ID lookup | Build only (dev dep) |
| [cheerio](https://cheerio.js.org) | HTML parsing for Last.fm scraping (smart-match) | Build only (dev dep) |
| [vite](https://vitejs.dev) | Dev server + bundler | Dev only |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit date / advance |
| `←` / `→` | Previous / next track |
| `Space` | Play / pause |

## Known limitations

- **Subgenre precision varies** — Seed artists (361) have hand-curated subgenres. Wikidata artists have subgenres auto-derived from their genre categories, which gives broad but less precise assignments (e.g., a classical composer gets `classical` and `opera` subgenres based on Wikidata labels, but not fine-grained tags like `romantic` or `impressionist` unless those labels were present).
- **Embed restrictions** — Some YouTube videos block embedded playback (Error 150/101). The app hot-swaps to backup video IDs before skipping, but some tracks may still fail if all IDs are restricted.
- **Birth time not considered** — Venus sign is calculated at noon UTC. For birth dates where Venus changes signs that day, the result may differ from a full natal chart with exact birth time. The similarity score could show ~100% for an artist whose actual Venus is in the adjacent sign.
- **Electronic genre coverage is thin vs. classical** — Wikidata has far more classical composers with birth dates than electronic musicians. The seed file compensates but could always use more entries.
- **Venus similarity precision** — Artist degrees in `musicians.json` are rounded to 1 decimal (0.1°), giving ~0.05% similarity precision. More than adequate for display purposes.
- **YouTube dependency** — The IFrame API is a cross-origin black box. No audio access for analysis, fragile video IDs, embed restrictions. See "Beyond YouTube" in future improvements.

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

## Future improvements

### What we used vs. what's available

The genre research drew on three datasets. Here's an honest accounting of what actually made it into the codebase and what remains untapped.

#### AcousticBrainz Genre Dataset (905K recordings)

**Used:**
- Extracted the Discogs electronic subgenre vocabulary (81 styles) → became the `SUBGENRES` and `SUBGENRE_MAP` in `src/genres.js`
- Co-occurrence analysis of subgenre pairs validated the 10-category clustering (e.g., electro+synth-pop co-occur 1,192 times → confirms darkwave cluster)
- Gap analysis against our `GENRE_MAP` identified ~30 unmapped MusicBrainz/Last.fm tags

**Not used (available for future work):**
- **Recording-level cross-referencing** — The dataset maps MusicBrainz Recording IDs (MBIDs) to Discogs genre annotations. We could look up our artists' recordings and assign more precise subgenres than the current genre-category-based derivation (e.g., distinguishing a `baroque` composer from a `romantic` one based on actual recordings rather than broad Wikidata labels).
- **Audio features** — AcousticBrainz provides pre-computed audio descriptors (danceability, mood, energy, timbre) for each recording. These could power a "sonic vibe" matching layer — e.g., if a user's Venus sign has no exact genre match, fall back to sonically similar artists rather than just same-element artists.
- **Multi-label ground truth** — The dataset has multiple genre annotations per recording. This could improve our `categorizeGenres()` by weighting tags by how often they co-occur in real recordings, rather than treating all tag→category mappings equally.

#### UPF ISMIR 2022 Paper (Alonso-Jimenez, Serra & Bogdanov)

**Used:**
- Their finding that **artist-level associations produce the strongest genre representations** (87.7 ROC-AUC vs. 85.2 for album-level) validated our entire approach of tagging genres at the artist level rather than per-track
- Confirmed Discogs taxonomy as a robust, well-structured genre system worth building on
- Referenced in README as academic grounding for the design

**Not used (available for future work):**
- **COLA (Contrastive Learning of Audio) framework** — They trained contrastive models on Discogs metadata using Essentia audio embeddings. Pre-trained Essentia models could generate audio embeddings for our artists' tracks, enabling true sonic similarity search beyond tag-based matching.
- **Multi-task genre prediction** — Their best model jointly predicts genre and style (subgenre). A similar approach could auto-classify new artists from audio alone, removing dependency on external tag databases.
- **Essentia pre-trained models** — Available at [essentia.upf.edu](https://essentia.upf.edu/models.html). Could extract features from YouTube audio to build a sonic similarity graph alongside the current Last.fm social similarity graph.

#### Essentia.js — browser-side audio intelligence

[Essentia.js](https://github.com/mtg/essentia.js/) is the JavaScript/WebAssembly port of the Essentia C++ library, built by the same MTG group at UPF behind the ISMIR 2022 paper. It runs entirely in the browser and includes pre-trained TensorFlow.js models:

| Model | Capability |
|-------|-----------|
| Discogs-EffNet | Classifies audio into 400 Discogs styles (same taxonomy as our subgenres) |
| MusiCNN | 50-tag music autotagging |
| Mood classifiers | Aggressive, happy, party, relaxed, sad (MIREX 5-cluster) |
| Arousal/Valence | Continuous emotion regression |
| Danceability | Danceability scoring |
| TempoCNN | BPM estimation |

**Current blocker:** Radio Venus plays audio via the YouTube IFrame API, which is a cross-origin iframe. There is no way to extract audio data from it — no `AudioContext` routing, no PCM samples, no Web Audio API access. The iframe is a black box, so real-time browser-side analysis of the currently playing track is not possible with YouTube embeds.

**Where essentia.js could work today:**

- **Build-time analysis (Node.js)** — Download sample audio for each artist, run essentia.js offline, store mood/danceability/energy scores in `musicians.json`. The matcher could then use these features for richer fallbacks ("no exact Venus+genre match, but here's a sonically similar artist with the same mood profile").
- **Genre validation** — At build time, verify that an artist's tagged genres actually match what the audio sounds like. Flag mismatches automatically.
- **Auto-subgenre assignment** — Use Discogs-EffNet to classify audio into the 400 Discogs styles, then map to our subgenre vocabulary. This would remove the need to hand-curate subgenres for new artists.

**Where essentia.js could work with a different audio backend:**

If Radio Venus moved away from YouTube embeds to an audio source that exposes raw audio data, essentia.js could power real-time features in the browser:
- Live mood/energy visualization while music plays
- "This track sounds like..." recommendations based on audio similarity
- Dynamic playlist reordering based on sonic characteristics

### Beyond YouTube

The YouTube IFrame API is currently the only audio backend. It's free, has massive catalog coverage, and requires zero infrastructure — but it comes with significant constraints:

**Current pain points:**
- **Embed restrictions** — Many videos block embedded playback (Error 150/101), requiring auto-skip logic and degrading the experience for some sign+genre combinations
- **No audio access** — The cross-origin iframe prevents any audio analysis, ruling out essentia.js and Web Audio API features
- **Fragile video IDs** — Videos get deleted, made private, or region-locked. IDs go stale and require periodic maintenance
- **ytsr is broken** — YouTube changed their response format, making automated video ID discovery unreliable. The seed file compensates but manual curation is needed
- **No official API for free playback** — The IFrame API is the only legal way to play YouTube audio in a web app without YouTube Data API quotas

**Alternative audio sources to explore:**

| Source | Pros | Cons |
|--------|------|------|
| **Self-hosted audio** (e.g., S3/Cloudflare R2) | Full Web Audio API access, no embed restrictions, essentia.js works | Licensing cost, storage/bandwidth, catalog limited to what you can legally host |
| **Bandcamp embeds** | Artist-friendly, good electronic catalog | Limited API, embed restrictions, no programmatic search |
| **Internet Archive** | Massive free catalog, direct audio URLs, Web Audio compatible | Inconsistent metadata, patchy electronic coverage, no streaming API |
| **Jamendo** | Creative Commons music, proper API, direct audio streams | Small catalog, mostly unknown artists, weak classical coverage |
| **ListenBrainz/MusicBrainz** | Open ecosystem, great metadata, ties into existing genre research | No audio hosting — only metadata, would need to pair with another source |
| **Web Audio API + audio files** | Full control, essentia.js real-time analysis, custom DSP | Need legal audio source, hosting costs, catalog building effort |

**Hybrid approach:** Keep YouTube as the primary player for catalog breadth, but add a secondary audio source (e.g., Internet Archive, self-hosted samples) for artists where YouTube embeds fail or where audio analysis is desired. The matcher could prefer the analyzable source when available and fall back to YouTube.

#### Other potential improvements

- **Confidence scoring for genre assignments** — Currently all genre tags are treated equally. Adding a confidence score (based on how many sources agree on a tag) would allow the matcher to prefer high-confidence assignments.
- **Preserve raw tags** — Store the original MusicBrainz/Last.fm/Wikidata tags alongside the normalized genres, so future re-categorization doesn't require re-fetching from APIs.
- **Venus element/modality-based discovery** — The matcher already falls back through sign → opposite sign → same element. Could add modality (cardinal/fixed/mutable) as another axis, or weight matches by astrological aspect (trine, sextile, square).
- **Finer subgenre assignment for Wikidata artists** — Currently Wikidata artists get subgenres derived from their broad genre categories (e.g., `classical` → `classical`). AcousticBrainz recording-level lookups could provide more precise assignments (e.g., distinguishing `romantic` from `baroque` based on actual recordings).
