# Radio Venus

> Discover music through your Venus sign.

Radio Venus is an astrology-based music discovery app. Enter your birth date, the app calculates your Venus placement, you pick a genre, and it plays music from artists who share your Venus sign — streamed via YouTube.

The database spans from Vivaldi (1678) to contemporary electronic producers, covering classical orchestral works, ambient, techno, IDM, industrial, darkwave, trip-hop, and drum & bass.

## How it works

```
Birth date  ──►  Venus calculation  ──►  Sign + Element
                                              │
Genre pick  ──►  Filter database  ──────►  Playlist
                                              │
                                         YouTube Player
```

1. **Portal** — User enters their birth date (DD/MM/YYYY)
2. **Reveal** — Venus sign is calculated client-side and displayed with its glyph, degree, decan, and element
3. **Genre** — User picks from 8 genre categories
4. **Radio** — Matched artists play via the YouTube IFrame API with custom controls

### Venus calculation

Venus positions are computed using [astronomy-engine](https://github.com/cosinekitty/astronomy), a high-precision astronomical library. Birth dates use noon UTC (standard practice when birth time is unknown). The ecliptic longitude is converted to zodiac sign, degree within sign, and decan.

### Matching logic

The matcher uses a cascading fallback strategy to keep music playing:

1. **Exact match** — same Venus sign + selected genre
2. **Sign only** — same Venus sign, any genre
3. **Opposite sign** — astrological polarity (e.g., Aries ↔ Libra) + selected genre
4. **Same element** — fire/earth/air/water siblings + selected genre
5. **Genre only** — any artist in the selected genre

Results are shuffled each time for variety.

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
    main.js                         # Flow controller, date input, keyboard shortcuts
    venus.js                        # astronomy-engine wrapper (ESM, browser-native)
    matcher.js                      # Venus sign + genre filtering with fallbacks
    player.js                       # YouTube IFrame Player wrapper
    genres.js                       # Genre taxonomy (shared by build + client)
    ui.js                           # Screen transitions, track list, error states
    style.css                       # Dark atmospheric theme
  scripts/
    build-db.mjs                    # Wikidata + Venus calc + YouTube lookup
    seed-musicians.json             # Hand-curated artists with verified video IDs
  public/
    data/musicians.json             # Generated database (gitignored)
    favicon.svg                     # Venus glyph
```

**Build time** (Node.js): Queries Wikidata SPARQL for musicians with birth dates, calculates Venus positions, maps genres, merges with hand-curated seed data, searches YouTube for video IDs, outputs `musicians.json`.

**Runtime** (browser): Client-side Venus calculation + pre-built JSON database + YouTube IFrame Player API. Zero server calls beyond loading the static files and YouTube embeds.

## Database

**474 musicians** across all 12 Venus signs and 8 genres.

| Genre | Artists |
|-------|---------|
| Classical / Orchestral | 416 |
| Ambient / Drone | 25 |
| IDM / Experimental | 22 |
| Techno / House | 19 |
| Synthwave / Darkwave | 11 |
| Industrial / Noise | 11 |
| Trip-Hop / Downtempo | 8 |
| Drum & Bass / Jungle | 7 |

The seed file contains ~86 hand-curated artists with verified embeddable YouTube video IDs. Wikidata supplements this with additional musicians (primarily classical composers). The build script processes them in parallel batches of 5.

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
- **Element accent colors**: fire = red, earth = green, air = yellow, water = blue
- The accent color shifts based on the user's Venus element, theming the entire radio screen

Screens transition with opacity fades. A loading overlay with a spinning Venus glyph (&#9792;) plays during the calculation "dramatic pause."

## Key dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| [astronomy-engine](https://github.com/cosinekitty/astronomy) | Venus position calculation | Client + build |
| [ytsr](https://github.com/TimeForANinja/node-ytsr) | YouTube search (video IDs) | Build only (dev dep) |
| [vite](https://vitejs.dev) | Dev server + bundler | Dev only |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit date / advance |
| `←` / `→` | Previous / next track |
| `Space` | Play / pause |

## Known limitations

- **ytsr is partially broken** — YouTube changed their response format, so some searches return empty results. The seed data ensures core coverage; Wikidata artists without video IDs are skipped.
- **Embed restrictions** — Some YouTube videos block embedded playback. The app handles this with auto-skip and visual feedback, but some sign+genre combinations may have fewer playable tracks.
- **Birth time not considered** — Venus sign is calculated at noon UTC. For birth dates where Venus changes signs that day, the result may differ from a full natal chart with exact birth time.
- **Electronic genre coverage is thin vs. classical** — Wikidata has far more classical composers with birth dates than electronic musicians. The seed file compensates but could always use more entries.

## Extending the seed data

To add more artists, edit `scripts/seed-musicians.json`:

```json
{
  "name": "Artist Name",
  "birthDate": "YYYY-MM-DD",
  "genres": ["techno", "ambient"],
  "youtubeVideoId": "dQw4w9WgXcQ"
}
```

**Tip**: Use YouTube "Topic" channel videos (auto-generated, static artwork) — they're almost always embeddable. Search for `"Artist Name" - Topic` on YouTube.

Genre IDs: `ambient`, `techno`, `idm`, `industrial`, `darkwave`, `triphop`, `dnb`, `classical`

Then rebuild: `npm run build:db`
