# One badge system: design spec

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** approved (23 Sep: option B, a quiet bell, the letter marks removed, "Yes, build it") · **Built:** branch `design/one-badge-system` · **Review page:** https://claude.ai/artifact/7gHvLSThQ8mnmm3xttY7D5 · **Plan:** `docs/superpowers/plans/2026-09-23-one-badge-system.md`

**Analysis:** every badge measured from the browser's computed styles on a local build of `main` at `18c79973` (#918), signed in to Melany's Beauty Salon, light theme: 13 pages and their tabs at 1440px, Today and People again at 390px. Contrast figures composite each tint over its real ground. `main` moved to `191ca9f7` (#920) during the analysis; that commit touches none of the files below.

## 1. Goal

A badge means one thing wherever it appears, and looks the same wherever it means that thing.

Ruben, 23 Sep: "make the badges actually make sense and be smartly colored, designed, sized, shaped, etc for consistency and not confuse users … the person page list badges seems too small compared to all other badges and the today page worth a look badges i dont like they seem to different in size and shape from the rest too big and bulky".

What was measured: more than forty different looks doing five jobs. The house pill is right (`tone.ts`, `StatePill`, `.pill` 20px / 11px, #451 #749 #850). Most of what sits around it drifted:

- **Twelve heights and nine type sizes.** Heights run 14, 15, 15.5, 16, 17, 18, 18.5, 20, 20.5, 21.3, 22 and 28px, and text runs 8 to 12.5px. Three badges are uppercase and one is monospace. Marks come in 20, 22, 24, 26, 28 and 30px, some square and some round.
- **"Needs you" has two colours.** It is amber on every pill and red on the sidebar count, the Inbox tab count, the bell, People's "2 need you", Today's "1 needs you" and the agenda's "Needs you — in Inbox".
- **The accent reads as an error.** `--accent` (oklch 0.62 0.19 25) and `--danger` (oklch 0.6 0.2 27) are two degrees of hue apart. Counts, TODAY and YOU wear the accent, which `tone.ts` saves for "live, right now".
- **Names wear state colours.** Lists are blue (info, "in progress"). The owner role is blue. Template marks are amber for marketing messages, and amber means "needs you" everywhere else.
- **One fact is said up to three times.** A Playbooks card tints its mark, pins a pill and colours its footer. Worth a look tints a tile and colours a word. A lead that is not a fit says so beside its name and again in Stage.
- **Words fail contrast.** List chip 3.36:1, lead-list chip 2.10, sidebar and tab counts 3.13, the bell 3.88 at 9px, "2 need you" 4.19, next visit 3.28, agenda windows 3.42, back office 2.36. Each of these uses a raw tone colour where the `-ink` token belongs.
- **Letter marks repeat their label.** A 14px circle with an 8px P, W or Y stands in front of "Phone Receptionist" on every Inbox, Conversations and Live row.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Option B.** A resting state (tone `ok` or `plain`) is a 6px dot and its word. A filled ground is for `warn`, `info`, `danger` and `accent` only. | Ruben's choice. A ground means "look here": People's list goes from seven filled pills to three, all worth a look. |
| D2 | The bell's unread count is the quiet count with a ring. | Ruben's choice. Unread is not urgent, and the Inbox's amber count is the one that asks for you. |
| D3 | The P / W / Y letter marks go. The words stay. | Ruben's choice. The row's channel icon and the words already say it. |
| D4 | "Needs you" is amber on every badge: sidebar, tabs, buckets, standing lines, Today's card, the agenda, the phone tab bar. | Approved with the review page. **This supersedes D6 of `2026-09-22-people-on-a-phone-design.md`** ("the standing line's N need you stays red"): that decision kept the line in step with a red sidebar count, and the sidebar count is amber now too. |
| D5 | The accent leaves badges. It stays on a live pill and its dot, a broadcast that is sending, the Calendar's now-line and today's date, and on buttons. | `tone.ts` already says so. The accent is the danger red's neighbour. |
| D6 | Worth a look: the tile goes. The tag becomes the house pill in the row's contract tone, in front of the sentence. "Waiting now" names become chips. `todayLeaks` turns "No reply" and "Booking gap" from `danger` to `warn`, so the page stops repainting them. | Ruben's complaint. One signal per row. A word still carries the tone, as the 19 Sep spec requires. |
| D7 | A role is a name: Team draws Owner, Operator and Viewer as chips, and `tone.ts`'s `role` row goes `plain`. Team's "You" is a chip. | A role is not a state. Blue said "in progress". |
| D8 | One branch (`design/one-badge-system`, worktree `cm-badges`), one PR. | Ruben: one thing to 100%. |

## 3. The system

### 3.1 Tones

`packages/contracts/src/tone.ts` is unchanged apart from D6 and D7. The six tones, and what each means on every badge:

| Tone | Means | Pill | Count | Word | Dot | Mark |
|---|---|---|---|---|---|---|
| accent | live, right now | filled, with the pulsing live dot | never | `--accent-ink`, the "now" time only | `--accent` | never |
| warn | a person is needed, or should look | filled | amber | `--warn-ink` | `--warn` | never |
| info | on its way, waiting on someone else | filled | never | `--info-ink` | `--info` | never |
| ok | done, healthy, connected | quiet: green dot + word | never | `--ink-muted` (B) | `--ok` | never |
| danger | failed, refused, broken | filled | never | `--danger-ink` | `--danger` | never |
| plain | neutral, resting, a total | quiet: grey dot + word | grey | `--ink-muted` | `--ink-faint` | always |
| (none) | a name, not a state | chip | | | | |

### 3.2 Shapes

| Shape | Job | Geometry | Ground and words |
|---|---|---|---|
| **Pill** | A state that asks to be seen (warn, info, danger, accent) | 20px tall · padding 0 8px · radius 999px · 11px / 500 · gap 5px | `--{tone}-soft` ground, `--{tone}-ink` words, no border. Only `accent` carries a dot: the pulsing live dot. |
| **Quiet state** | A resting state (ok, plain) | 20px box · no padding, no ground, no border · 6px dot · gap 6px · 11px / 500 | `--ink-muted` words; dot `--ok` for ok, `--ink-faint` for plain. Same classes as the pill (`.pill`, `.pill-ok`), so `StatePill` does not change. |
| **Chip** | A name you can open or remove: a list, a person, a service, a role, a source, a destination, a policy | 20px · padding 0 8px (0 3px 0 8px with ×) · radius 999px · 11px / 400 · gap 4px | No fill, 1px `--line`, `--ink-muted` words. Hover: `--ink` words, `--line-strong`. Focus: `--focus-ring`. × is a 14px round hit area with a 9px glyph. Never a tone. |
| **Count** | A number riding on a tab, a nav item, a filter or an icon | 16px · min-width 16px · padding 0 5px · radius 999px · 11px / 500 tabular | Total: `--bg-active` ground, `--ink-muted`. People who need you: `--warn-soft`, `--warn-ink`. On an icon: add `box-shadow: 0 0 0 2px var(--bg)`, and the amber ground turns opaque (`color-mix(in oklab, var(--warn) 22%, var(--bg-raised))`). In a rail or list row it is the bare number: `--ink-dim`, or `--warn-ink` for people who need you. Never the accent, never monospace. |
| **Mark** | What kind of row this is | 24px · radius 6px (`--radius-sm`) · 13px glyph | `--bg-sunken` ground, `--ink-muted` glyph, no border. Never toned: the row's pill or words carry the tone. Timeline nodes are the same, round. |
| **Dot** | A tone inside a sentence or a dense row | 6px | the tone's colour |
| **Word** | A tone inside a sentence | the sentence's own size | the tone's `-ink`; ok words `--ink-muted` (B). Never a raw tone colour. |

### 3.3 Rules

1. **A colour means one thing** on a pill, a count, a dot and a word.
2. **The job decides the shape.** A state is a pill, a name is a chip, a number is a count, a row's kind is a mark.
3. **One size per shape.** No page keeps its own size.
4. **Say it once.** One signal per fact per row. A dot inside a filled pill means live.
5. **Words people can read.** Tone words take the `-ink` token, which gives 4.5:1 or better on their ground. No uppercase, no monospace, nothing under 11px in a badge.

## 4. What changes where

"Pill" and "quiet" below follow D1: a StatePill needs no change, because its tone class already selects the shape.

| Page | Element | Today | Becomes | Files |
|---|---|---|---|---|
| Shell | Sidebar Inbox count `.nav-badge.urgent` | 16px, 10.5px, coral on coral 3.13:1 | amber count | components.css |
| Shell | Bell `.tb-bell-badge` | 14px, 9px/600, solid coral 3.88:1 | quiet count on an icon | components.css |
| Shell | Phone tab bar `.phone-tab-badge` | 16px, 10px, solid coral | amber count on an icon | mobile.css |
| Today | Worth a look `.tl-glyph` | 24px amber tile | removed | dashboard-a-week.jsx, dashboard-a-v2.css |
| Today | Worth a look `.tl-tag` | 11px amber word | `StatePill kind="tone"` in the row's tone | dashboard-a-week.jsx |
| Today | Worth a look `.tl-person` | 21.3px, 11.5px, fill + border | chip | dashboard-a-week.jsx, dashboard-a-v2.css |
| Today | Leak tones | "No reply", "Booking gap" `danger` | `warn` | contracts today.ts |
| Today | Day card "1 needs you" `b.warn` | `--danger-ink` | `--warn-ink` | dashboard-a-v2.css |
| Today | Agenda `.ag-item-flag` | red dot + `--danger-ink` | amber dot + `--warn-ink` | components.css |
| Today | Agenda `.ag-window` | 20.5px, outlined, raw `--ok` 3.42:1 | one line of words after the page's label: "Open 3 – 5 PM · 9:30 – 10:30 AM" | components.css |
| Today | Away and brief marks `.tbn-icon`, `.brief-beat-glyph`, `.ag-item-glyph` | 26 / 24 / 20px, toned or bordered | mark | components.css, dashboard-a-v2.css |
| Inbox | Tab counts `.stabs-badge` | 15px, 10px/600, coral | count: amber when it counts people who need you, else total | components.css, surface-tabs.jsx callers |
| Inbox | Bucket count `.ix-bucket-count`, `.ix-bucket.accent` | coral number on a coral tab | amber number; the tab's selected look is every tab's | inbox.css |
| Inbox | Thread head standing `.ix-th-standing .pill::before` | pill + dot | pill, no dot | inbox.css |
| Inbox, Conversations, Live | Letter marks `.agent-avatar` | 14px (Live 16px), 8px letter | removed | the rows' JSX |
| Conversations | Filter counts `.fleet-filter-count` | 16px, 10px, outlined | total count | dashboard-a-v2.css |
| Conversations | Row outcomes (plain pills) | filled grey pill | quiet | (CSS only, D1) |
| Live | Row pill `.lm-row-foot .pill` | 16px, 9.5px, uppercase | the one pill | live.css |
| People | Standing "N need you" `.pl-standing-needs` | raw `--danger` 4.19:1 | `--warn-ink` | clients.css |
| People | Rail counts `.cl-rail-row.smart .count` | coral on every smart list | `--ink-dim`; the needs-you list `--warn-ink` | clients.css (+ the rail's JSX for the needs-you marker) |
| People | Next visit `.cl-row-next`, `.pl-card-visit` | raw `--ok` 3.28:1 / `--ok-ink` | `--ink-muted`, the calendar icon stays | clients.css |
| People | Offers "No" `.cl-row-offers.no` | raw `--danger` | `--ink-muted` | clients.css |
| People | Active state filter `.cl-seg-filter` | 10.5px, raw `--info` | chip with × | clients-a.jsx |
| Person | Lists `.seg-chip` (and smart lists) | 17px, 10px, raw `--info` 3.36:1 | chip with × | client-profile.jsx, people.css |
| Person | Campaign outcome `.cl-prof-run-out[data-tone]` | ok words green | ok words `--ink-muted`; warn and danger keep their ink | clients.css |
| Person | Head standing `.cl-prof-now .pill` | quiet already, ok words green | unchanged: a dot and the word in the standing's ink for every tone (the Quiet record, #915) | clients.css |
| Inbox thread | Next visit `.ix-th-visit-*` | `--ok-ink` words | `--ink-muted` | inbox.css |
| Leads | Stage column plain pills | 97 filled grey pills | quiet (D1) | (CSS only) |
| Leads | "Not a fit" beside the name | a second pill for Stage's fact | removed | leads-finder.jsx |
| Leads | Fit in the table vs the peek | text vs green pill | no change: under B the peek's pill is the quiet state, so the two read alike (a dot is the only difference) | — |
| Leads | Placeholder initials `.ld-tile-initials` | tone inks by hash | `--ink-muted` | leads.css |
| Calendar | `.cal-today-chip` | 15.5px, 9px/600, uppercase, coral | removed (the date already wears the accent) | calendar-real.jsx, calendar.css |
| Campaigns | Tab counts `.stabs-campaigns .stabs-badge` | mono, 11px/400 | the one count (amber when waiting on you) | components.css |
| Campaigns | Head flag `.cm-flag` | 28px, 12.5px, dot | amber pill | components.css |
| Campaigns | Playbook card mark `.pb-tile-mark` | 30px, toned | mark | components.css |
| Campaigns | Playbook "Not set up" pill override | its own grey, no border | quiet | components.css |
| Campaigns | Footer words `.pb-tile-next.is-warn` | amber, repeating the pill | `--ink-muted` (the pill says it) | components.css |
| Campaigns | Policy chips `button.pill.pol-chip` | a pill as a button | chip, locked ones too ("Owner-only · …"): a lock is a rule, not a person needed | data-bits.jsx, components.css |
| Campaigns | Template row mark `.msg-row-mark` | 28px, amber for marketing | mark | components.css |
| Campaigns | Template source `.msg-tag` | 18px, 11px/400, grey fill | chip (toned `msg-tag`s become pills) | components.css |
| Campaigns | More languages `.lp-more` | 16px, 10.5px | total count | components.css |
| Campaigns | Recipients `.bc-person-pill` | ~19px, its own tone family | pill / quiet by tone | components.css |
| Campaigns | Run mark `.bc-run-mark` | 34px, amber or coral by state | mark (the run's pill says its state) | broadcasts-real.jsx, components.css |
| Reports | Fact marks `.rpt-fact-icon` | 24px, radius 7, toned | mark | reports.css |
| Settings | `.settings .pill` | 22px, 11.5px | the one pill (quiet for ok) | settings.css |
| Settings | Connections inner `.dot` in ok pills | a second dot under B | removed | integrations-real.jsx |
| Settings | Team "You" `.set-team-you` | 15px, 10px, uppercase, coral | chip | settings.jsx, settings.css |
| Settings | Team roles `RolePill` | Owner blue, others grey pills | chips | settings.jsx; contracts tone.ts (`role` plain) |
| Settings | Notifications `.set-notif-platform` | a pill | chip | settings.jsx |
| Settings | Business services `.rec-chip` | 22px, outlined | chip (20px) | record.css |
| Settings | Activity `.act-day-n`, `.act-glyph` | 18.5px count; 22px toned circles | total count; round mark; a warning's or a failure's words in its ink | activity.jsx, settings.css |
| Settings | Back office `.lead` words | raw tones 2.36 – 3.88:1 | tone inks | the back office's CSS |

The plan resolves each row to exact selectors and lines; a row whose element turns out to be mockup-only is left for its page's own slice and said so in the PR.

## 5. Left alone

- Buttons, segmented controls and filter pills (Conversations' All / Calls, Leads' chips, view switchers): only the counts inside them change. A control looks pressable; a badge does not.
- Avatars and photos, except the tone-coloured placeholder initials.
- The Calendar grid's open and taken blocks and the chart keys: they are data, not labels.
- Keyboard hints.
- The accent on buttons. The primary button sits two degrees from the danger red; that is worth its own look, not this pass.
- Mockup-only pages (fleet, store, pipeline, segments, agent studio) keep their private chips until their slice.

## 6. Verification

- The measuring probe from the analysis (computed styles of every badge-like element) is run on every page in §4 before and after, at 1440px and 390px, in light and dark. The PR states the before and after families: pill, quiet, chip, count, mark, and nothing else.
- Contrast re-measured for the count, chip and quiet words in both themes; each 4.5:1 or better.
- `node --test` suites that pin these classes are updated in the same commit as the class: `today-page`, `one-inbox`, `broadcasts-honest`, `business-tab-answers`, `business-tab-offer`, `record-kit`, `leads-honest`, `leads-peek`, `state-pill`, `the-pages-say-only-what-is-true`, `business-can`, `settings-doors`, `thread-controls`, and the Inbox suites that read `ix-th-standing`. No new `readCode` assertion.
- `e2e/today.spec.ts` (`tl-tag`) and `e2e/people.spec.ts` (`cl-row-next`) are updated, and `e2e/` is grepped for every class and word this changes.
- `check-dist` after the contracts edits; `Chanlytics.html` `?v=` keys bumped one past `main` and every open PR for each edited file.
