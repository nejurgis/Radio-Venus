# Radio Venus

> Discover music through your Venus sign.

Radio Venus is an astrology-based music discovery app. Enter your birth date, the app calculates your Venus placement, you pick a genre, and it plays music from artists who share your Venus sign — streamed via YouTube.

The database spans from Vivaldi (1678) to contemporary electronic producers, covering classical orchestral works, ambient, techno, IDM, industrial, darkwave, trip-hop, and drum & bass.

## How it works

```
Birth date  ──►  Venus calculation  ──►  Sign + Degree + Decan + Element
                                              │
Genre pick  ──►  Subgenre filter  ──►  Venus similarity sort  ──►  Playlist
                                                                       │
                                                                  YouTube Player
```

1. **Portal** — User enters their birth date (DD/MM/YYYY). A zodiac nebula ring shows the distribution of all ~430 artists as element-colored dots at their ecliptic longitudes, with whole-sign sector outlines. Hover over any dot to see the artist name and Venus position in a center readout.
2. **Reveal** — Venus sign is calculated client-side and displayed with its glyph, degree, decan, and element
3. **Genre** — User picks from 8 genre categories, each showing clickable subgenre chips underneath. The nebula zooms into the user's sign sector as a background, showing just the 30° wedge of their Venus sign.
4. **Radio** — Matched artists play via the YouTube IFrame API, sorted by Venus proximity (0-100%). Each track shows the artist's Venus sign and degree.

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

### Embed error handling

YouTube videos frequently block embedded playback (Error 150/101). The player handles this gracefully:
- Failed tracks are visually struck through and marked "restricted"
- The player auto-skips to the next playable track
- Failed video IDs are tracked per session to avoid retrying them

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
    seed-musicians.json             # 174 hand-curated artists with verified video IDs + subgenres
    manual-overrides.json           # Birth dates for artists invisible to all databases
  public/
    data/musicians.json             # Generated database (gitignored, ~430 artists)
    favicon.svg                     # Venus glyph
  .github/workflows/
    deploy.yml                      # Auto-deploy to GitHub Pages on push to master
```

**Build time** (Node.js, `scripts/build-db.mjs`):
1. Loads seed data (174 artists with subgenres + YouTube IDs)
2. Queries Wikidata SPARQL for musicians with birth dates
3. Maps raw genre tags through `categorizeGenres()` from `src/genres.js`
4. Calculates Venus positions (sign, degree, decan, element) using astronomy-engine
5. Merges seed + Wikidata (seed takes priority), preserves cached YouTube IDs
6. Searches YouTube for any artists still missing video IDs
7. Outputs `public/data/musicians.json`

**Discovery** (Node.js, `scripts/smart-match.mjs`):
- Takes a seed artist name, scrapes Last.fm's "similar artists" page
- Cross-references Wikidata/MusicBrainz/Wikipedia for birth dates (4-tier fallback)
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

**~430 musicians** across all 12 Venus signs and 8 genres.

| Genre | Artists |
|-------|---------|
| Classical / Orchestral | ~300 |
| Ambient / Drone | ~25 |
| IDM / Experimental | ~22 |
| Techno / House | ~19 |
| Synthwave / Darkwave | ~11 |
| Industrial / Noise | ~11 |
| Trip-Hop / Downtempo | ~8 |
| Drum & Bass / Jungle | ~7 |

The seed file contains **174 hand-curated artists** with verified embeddable YouTube video IDs and hand-assigned subgenres. Wikidata supplements this with additional musicians (primarily classical composers, who have `subgenres: []`). The build script processes them in parallel batches of 5.

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
  "youtubeVideoId": "Xw5AiRVqfqk"
}
```

- **`venus.degree`** — 0-30° within the sign (1 decimal precision)
- **`venus.decan`** — 1 (0-10°), 2 (10-20°), or 3 (20-30°)
- **`venus.element`** — fire/earth/air/water (derived from sign)
- **`genres`** — top-level category IDs (used for filtering)
- **`subgenres`** — Discogs-derived subgenre IDs (used for subgenre chip filtering)

The matcher reconstructs the full ecliptic longitude from `sign + degree` for similarity calculations. The browser-side `venus.js` also returns the raw `longitude` (0-360°) for the user's Venus.

## Genre taxonomy

Radio Venus uses a two-level genre system: **8 top-level categories** for primary UI filtering, and **~60 Discogs-derived subgenres** displayed as clickable chips beneath each genre button. Subgenres with 7+ artists in the database are interactive (accent-colored, clickable); those with fewer are shown dimmed as informational tags. All genre/subgenre data lives in `src/genres.js` — the single source of truth imported by both build scripts and the browser client.

### Research methodology

The genre taxonomy was built by cross-referencing three sources:

1. **MusicBrainz** — 2,000 official curated genres with user-voted popularity counts. Queried via the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) (`inc=genres+tags`) for all seed artists to identify unmapped tags.

2. **Discogs** — 15 top-level genres and ~300 styles (81 electronic). Analyzed via the [AcousticBrainz Genre Dataset](https://mtg.github.io/acousticbrainz-genre-dataset/) (Zenodo), which contains Discogs genre annotations for 905K recordings across 118K release groups. Co-occurrence analysis of electronic subgenres confirmed the 8-category clustering.

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

### Subgenre coverage

Of the ~60 subgenres defined, **15 have 7+ artists** in the seed data and are clickable in the UI:

| Subgenre | Artists | Parent genre |
|----------|---------|-------------|
| ambient | 57 | ambient |
| experimental | 48 | idm |
| idm | 45 | idm |
| techno | 28 | techno |
| modern-classical | 14 | classical |
| trip-hop | 13 | triphop |
| industrial | 13 | industrial |
| dub-techno | 13 | techno |
| romantic | 13 | classical |
| acid | 12 | techno |
| glitch | 12 | idm |
| minimal | 10 | techno |
| downtempo | 8 | triphop |
| minimalist | 8 | classical |
| drone | 7 | ambient |

The remaining ~45 subgenres have 1-6 artists each and appear as dimmed (non-clickable) chips. Only the 174 seed artists have hand-curated subgenres; the ~257 Wikidata artists have empty subgenre arrays. Improving subgenre coverage for Wikidata artists is a future improvement (see AcousticBrainz section below).

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

The `build:db` step is required before first run — it generates `public/data/musicians.json` which is gitignored. If Wikidata is unavailable, the build falls back to seed data only.

## Design

Dark atmospheric UI inspired by [cosine.club](https://cosine.club):

- **Background**: `#0a0a0c`
- **Typography**: Monospace (`SF Mono`, `Fira Code`, `JetBrains Mono`)
- **Element accent colors**: fire = `#c0392b`, earth = `#27ae60`, air = `#d4ac0d`, water = `#2980b9`
- The accent color shifts based on the user's Venus element, theming the entire radio screen

Screens transition with opacity fades. A loading overlay with a spinning Venus glyph (&#9792;) plays during the calculation "dramatic pause."

### Zodiac Nebula

A Canvas-based visualization (`src/viz.js`) draws all ~430 artists as a ring of element-colored dots at their ecliptic longitudes. Key features:

- **Whole-sign sector outlines** — 12 annular wedges with white outlines, signs progress counter-clockwise (astrological convention)
- **Element colors** — fire (red), earth (green), air (yellow), water (blue)
- **Deterministic jitter** — Artist positions are hashed from their name, so the nebula is stable across renders (no `Math.random()`)
- **Additive blending** — `globalCompositeOperation: 'lighter'` makes overlapping dots glow where signs are dense
- **Slow rotation** — 360° in 240 seconds
- **Hover readout** — Mousemove hit-testing finds the nearest dot (8px threshold), expands it to 5px white, and shows the artist name + Venus sign/degree in the ring center. Custom 24px crosshair cursor generated as a canvas data URL.
- **User Venus dot** — Pulsing dot with radial gradient glow at the user's exact ecliptic longitude
- **HiDPI** — Scaled by `devicePixelRatio` for crisp Retina rendering

**Zoom mode:** When navigating to the genre screen, `zoomToSign(signIndex)` locks rotation and applies a canvas scale/translate transform so only the user's 30° sign sector fills the background. The scale factor is `viewport height × 0.7 / band width`, making the artist dots large and visible behind the genre grid. The radial vignette fades out during zoom.

The nebula container lives at body level (outside screens) so it persists across screen transitions. Visibility is toggled per screen: visible on portal (full ring) and genre (zoomed), hidden on reveal and radio.

### Genre screen

The genre grid is a 2-column layout (480px max-width) where each cell contains:
- A `.genre-btn` button (the main genre selector)
- A `.subgenre-chips` row of small tags beneath it

Subgenre chips at 0.6rem monospace, no background. **Active chips** (7+ artists) use the element accent color and show an underline on hover. **Inactive chips** (<7 artists) are dimmed to 40% opacity as informational tags. Hover tooltips show the exact artist count.

### Track list

Each track displays: artist name (left, truncated with ellipsis if long), Venus similarity percentage in accent color, and Venus sign with degree (right, e.g. "Gemini 13°"). The active track is highlighted in the accent color. Failed/restricted tracks are struck through at 25% opacity.

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

- **Subgenre coverage is partial** — Only the 174 seed artists have hand-curated subgenres. The ~257 Wikidata artists have empty `subgenres` arrays and won't appear in subgenre-filtered results. This means subgenre filtering mainly works for electronic artists (well-curated) and is sparse for classical.
- **Embed restrictions** — Some YouTube videos block embedded playback (Error 150/101). The app handles this with auto-skip and visual feedback, but some sign+genre combinations may have fewer playable tracks.
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
  "youtubeVideoId": "dQw4w9WgXcQ"
}
```

**Tip**: Use YouTube "Topic" channel videos (auto-generated, static artwork) — they're almost always embeddable. Search for `"Artist Name" - Topic` on YouTube.

Genre IDs: `ambient`, `techno`, `idm`, `industrial`, `darkwave`, `triphop`, `dnb`, `classical`

Subgenre IDs: see the taxonomy table above, or check `SUBGENRES` in `src/genres.js`.

Then rebuild: `npm run build:db`

## Future improvements

### What we used vs. what's available

The genre research drew on three datasets. Here's an honest accounting of what actually made it into the codebase and what remains untapped.

#### AcousticBrainz Genre Dataset (905K recordings)

**Used:**
- Extracted the Discogs electronic subgenre vocabulary (81 styles) → became the `SUBGENRES` and `SUBGENRE_MAP` in `src/genres.js`
- Co-occurrence analysis of subgenre pairs validated the 8-category clustering (e.g., electro+synth-pop co-occur 1,192 times → confirms darkwave cluster)
- Gap analysis against our `GENRE_MAP` identified ~30 unmapped MusicBrainz/Last.fm tags

**Not used (available for future work):**
- **Recording-level cross-referencing** — The dataset maps MusicBrainz Recording IDs (MBIDs) to Discogs genre annotations. We could look up our artists' recordings and auto-assign subgenres instead of hand-curating them. This would be especially valuable for the ~300 Wikidata artists that currently have no subgenres.
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
- **Subgenre coverage for Wikidata artists** — The 257 Wikidata artists have empty `subgenres` arrays. The build script could use `categorizeSubgenres()` on the raw Wikidata genre labels to auto-populate these, or AcousticBrainz recording-level lookups could provide more precise assignments.
