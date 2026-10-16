# GA4 report menu, trimmed reports and funnels — 2026-10-15

Same cleanup as Field Trips (2026-10-12), but the menu is built around what
Radio Venus is for: a personal, shareable way into music that also leads
people to astrology readings, the newsletter and LunarLog. All changes are in
the GA UI (property 524648585); no site code changed.

## Sidebar (Reports)

Reports snapshot, Realtime, **Radio Venus**, Search Console.

- Data import, Life cycle and User collections are unpublished (still in
  Reports → Library, one click to republish).
- Search Console was already linked and shows query data (mostly "radio
  venus" searches).

## "Radio Venus" collection

| Topic | Reports |
|---|---|
| Where listeners come from | Traffic acquisition (default: Session source/medium), Demographic details (country), Tech details (default: Device category) |
| Listening | **Listening** (new), Pages and screens |
| Astrology & leads | **Astrology & leads** (new) |

New reports (both from the Events template, saved in Library):

- **Listening**: event name matches
  `chart_calculated|song_start|listening_heartbeat|song_complete|portal_shortcut|share|playlist_share|favorite`.
  Columns: Event count, Total users.
- **Astrology & leads**: event name matches
  `click_astrology|generate_lead|click_lunarlog`. Columns: Event count, Total
  users. These key events only exist since 2026-10-13, so older data is empty.

Columns on the other reports:

| Report | Columns |
|---|---|
| Traffic acquisition | Active users, New users, Sessions, Avg engagement time per session, Key events |
| Demographic details | Active users, New users, Avg engagement time per active user, Key events, User key event rate |
| Tech details | same as Demographic details |
| Pages and screens | Views, Active users, Avg engagement time per active user, Key events |

Removed everywhere: revenue, event count, events per session, engaged
sessions, engagement rate, engaged sessions per user, views per user.

## Reports snapshot

- Top numbers: Active users, New users, Avg engagement time per active user,
  Key events.
- Cards: Sessions by source/medium, New vs returning, Active users by
  country, Active users by device, Key events by event name.

## Funnel exploration: Explore → "Radio Venus funnel"

Private to the creator (explorations aren't shared by default). Breakdown:
device category.

**Listening** tab, last 28 days (2026-09-17 → 10-14):

| Step | Event | Users |
|---|---|---|
| Visited | `session_start` | 153 |
| Entered birthday or moon playlist | `chart_calculated` OR `portal_shortcut` | 78 (51%) |
| Played a song | `song_start` | 58 (38%) |
| Listened 30s+ | `listening_heartbeat` | 35 (23%) |

Mobile visitors leave on the start screen more often: 57% on mobile vs 43%
on desktop.

**Readings** tab, same period:

| Step | Event | Users |
|---|---|---|
| Visited | `session_start` | 153 |
| Opened About | `screen_view` with Screen Name contains `about`, OR `page_view` with page_location contains `radio-venus.club/about` | 14 (9%) |
| Clicked astrology reading | `click_astrology` | 1 |

## Findings

- The readings offer is only in About (in-app and `/about/`), which about 1
  in 11 visitors opens. Moving a "book a reading" prompt into the listening
  flow (after the birthday reveal, or in the moon playlist) is likely to matter
  more than anything in GA. The Readings tab will show whether it helps.
- Astrology Office GA (540136421): 15 visitors came from radio-venus.club in
  2026 and none booked.
- Best sources by engagement (28 days): naiveweekly.com (10 people, ~2.7 min
  each) and Substack (14). Instagram brings 20 people but they stay ~40 s.

## Not done

- **Internal traffic filter.** The user's own visits still count: `/chord/`
  shows 298 views from 1 person. Field Trips and Astrology Office already
  exclude the user's IPs.
- Realtime pages can't be hidden from the sidebar.
- Default date range can't be set in GA; bookmark a report URL with
  `params=_u.dateOption%3Dlast7Days` instead.

## Site changes, 2026-10-16

The aim is to keep Radio Venus a showcase of taste first, with a quiet path to
readings and no sales-y prompts (the user's call).

- **Imprint:** "made by astrology office" links to
  `astrologyoffice.com/?utm_source=radiovenus&utm_medium=imprint`. Desktop:
  bottom-left, level with the info button. 601–700px: top-left.
- **Phones (≤600px), start screen:** the ring and title/date block are lifted
  by up to 5.5rem (`--portal-lift`). The moon chip, newsletter and imprint
  stack in one centred column at the bottom. The lift is undone when the Enter
  zoom starts (`.is-fading`) or any other screen shows. The title block moves
  with `top`, not `transform`, because a transform would capture the fixed moon
  chip inside it.
- **Venus explainer pop-up:** new copy by the user (what Radio Venus is, the
  Venus premise, "other projects by Astrology Office … LunarLog or
  Astrochord", "read deeper … here"). The Astrology Office link is tagged
  `utm_medium=explainer`. The Astrochord link opens `/astrochord/?date=<birthday>`
  and logs `explainer_interaction` action `astrochord_link`. The buttons are
  "show me LunarLog" and "ok, got it!", both pills of the same width. The card
  is 400px wide with line-height 1.35, radius 2rem and background alpha 0.5,
  and it scrolls if taller than the screen. The "Venus was in X" line was
  dropped (the reveal screen behind it already shows the sign).
- **Explainer repeats after 30 days** (`EXPLAINER_REPEAT_DAYS`).
  `rv_seen_explainer` now stores the dismissal time; the old value `'1'` counts
  as long ago, so earlier visitors see the new copy once.
- Note for testing: the ring animation starts only on a real pointer or
  keyboard event, so filling the form with a script freezes it mid-zoom.

### Venus Retrograde 1/2 playlist (since launch 2026-10-06, as of 10-16)

- 15 people opened it (`genre_select`, genre `venus-retrograde-1`), out of 25
  who picked any genre or playlist in that period.
- 18 people played at least one of its songs (114 plays). 6 listened 30s+
  (141 heartbeats, about 70 min in total). 31 songs played to the end.
- 7 people arrived via a copied `#venus-retrograde-1` link
  (`share / clipboard`); 1 share from inside the site.
- These counts include the user's own visits (no internal-traffic filter yet).
