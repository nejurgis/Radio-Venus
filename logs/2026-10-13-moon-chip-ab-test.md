# A/B test: "today's moon playlist" on the start screen — 2026-10-13

Live on radio-venus.club since 2026-10-13 (deployed by `gh-pages` from a clean
build of `26c468f`). Commits `d9f17b0`, `88bbb12`, `26c468f`.

**Check back 2026-11-13** (one month). Read the results as described below and
decide: keep the chip for everyone, remove it, or run another month.

> **Push `master` before anything else lands on it.** On 2026-10-13 these commits
> (and `ef082f3`, `da22ebb`, `07b067e`) were only local. `deploy.yml` rebuilds the
> site from `origin/master` on every push — including pushes made by the
> admin add-artist workflow — so a push without them would silently remove the
> chip mid-test.

## Why

From Feb–Oct 2026, of 1,720 visitors only 46% entered a birthday and 43% played
a song; the rest left on the start screen. The Moon and Sun playlists were the
most-picked "genres" (388 and 355 picks), but the Moon one was only reachable
after entering a birthday (by hovering the Moon dot) or from a shared `#moon`
link. Hypothesis: a way in that needs no birthday keeps more first-time
visitors listening, and gives them a reason to come back daily.

## What changed

- Under the Enter button, a "today's moon playlist" button styled exactly like
  the genre page's moon button (`.genre-btn[data-genre="moon"]`). Hover shows
  today's Moon sign. Click starts the Moon playlist (`startRadio('moon')`),
  loading the database first if needed.
- 50/50 split, sticky per browser (`localStorage.rv_test_portal_moon` =
  `chip` | `control`). Browsers that block storage always get `control`.
- Only visitors who land on the start screen are counted (not share links or
  `#playlist` links).

Code: `index.html` (`#btn-portal-moon`), `src/main.js`
(`getPortalMoonVariant`, the block after `calculateMoon()`), `src/style.css`
(`.portal-moon-chip`), `src/analytics.js` (`trackExperiment`,
`trackPortalShortcut`).

Preview either version: `https://radio-venus.club/?moonchip=1` (chip) or
`?moonchip=0` (control). The choice sticks in that browser and preview visits
don't log exposure.

## Measurement (GA4 property 524648585)

- User property `portal_moon_test` = `chip` | `control`, registered as the
  user-scoped custom dimension **Portal moon test** (2026-10-13, not
  retroactive).
- Event `experiment_exposure` {experiment, variant} on each start-screen view.
- Event `portal_shortcut` {playlist: moon} when the chip is clicked.

### Baseline: the 4 weeks before (2026-09-15 → 10-12, radio-venus.club only)

| | Users | Share |
|---|---|---|
| Visitors | 141 | |
| Entered a birthday (`chart_calculated`) | 71 | 50% |
| Started a song (`song_start`) | 53 | 38% |
| Listened 30s+ (`listening_heartbeat`) | 32 | 23% |
| Played the Moon playlist | 18 | 13% |
| Returning visitors | 24 | 17% |

Average engagement: 135 s per visitor, engagement rate 59%.

### How to read it on 2026-11-13

GA → Explore → Free form. Rows: **Portal moon test**. Values: Total users.
Add a filter per question (event name exactly matches…) and compare `chip`
against `control`:

1. `experiment_exposure`: group sizes (expect roughly equal; ~60 each).
2. `song_start`: share who play anything. **Main metric.**
3. `listening_heartbeat`: share who listen 30s+.
4. `chart_calculated`: share who still enter a birthday (does the chip steal
   from the full experience?).
5. `portal_shortcut`: how many in `chip` clicked it.
6. Rows = Portal moon test × New / returning: return rate.

**Decision rule:** if `chip` beats `control` on song starts and 30s+ listens by
roughly 8+ percentage points without birthday entries dropping by more than
that, show it to everyone. If the gap is smaller than that, run a second month
before deciding — ~60 visitors per group can only show a large effect.

To end the test: show the button to all (set the variant to `chip` in
`getPortalMoonVariant`, drop the exposure tracking) or remove `#btn-portal-moon`
and its CSS.

## Same day, related

- **GA goals:** `click_lunarlog` (link contains `id6778718909`),
  `click_astrology` (link contains `astrolog`), and `generate_lead` (newsletter)
  are key events; data kept 14 months.
- **Newsletter:** the "Radio Venus Mailing Collection" Apps Script (v2) also
  adds each new email to the Astrology Office Mailing List sheet ("radio venus"
  in A, email in C, no duplicates) and emails a notification.
- **Astrology links:** `jurgis.info/astrology` → `astrologyoffice.com`
  (`ef082f3`). About gets an "astrology readings" section with a "book an
  astrology reading" button to `cal.com/astrologyoffice/natal-consultation`
  (`da22ebb`, wording `07b067e`). Before: 119 of 1,797 visitors ever opened
  About.
- **Search Console validations (all three "failed"):** www/http variants and
  no-slash URLs each 301 once to the right page — expected, nothing to fix.
  Sign×genre and artist pages are "Crawled – currently not indexed": a
  content-quality call by Google, not a bug.
