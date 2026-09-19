# Reports redesign: design spec

**Date:** 18 Sep 2026 · **Owner:** Ruben · **Status:** approved (spec review, 18 Sep; the review's changes applied, 19 Sep) · **Plan:** `docs/superpowers/plans/2026-09-18-reports-redesign.md`
**Prototype:** the scratchpad harness (`proto/proto.html`), built on the Reports harness fixture; screenshots in the PR.

## 1. Goal

Rebuild the Reports page (the `reports` route, `apps/dashboard/src/legacy/pages/reports.jsx`) so a salon owner who
is not technical gets the answers in order, in a calm and modern page that matches the rest of Chanlytics:

1. Is my receptionist handling my customers?
2. Who are my customers, and where and when do they reach me?
3. What did my campaigns earn?
4. What do people say about me? (Google reviews)

The charts get a shared, modular kit (area, bar, line, pie, radar, radial, heat strip, tooltips, legends), shaped like
shadcn/ui's charts but written in the legacy tree's own conventions, with a palette validated for colour vision in both
themes. The page reads real data only, and three new measurements join the report.

## 2. Decisions taken in brainstorming

| # | Decision | Why |
|---|---|---|
| D1 | Add three measurements with one migration: messages and calls by channel, a weekday x hour grid, and every receptionist reply with its day. | Unlocks "where" (pie), "when" (radar + hours) and a true reply-speed trend (line). Ruben: "Add them". |
| D2 | "Smart" means computed facts on the page plus an **Ask about this period** door. No AI-written summary on the page. | Facts are instant and always true; Ask already exists for the open questions. Ruben: "Facts + Ask door". |
| D3 | Own chart kit, shadcn-shaped, **zero new dependencies**. | Recharts 3.10.1 is ~151 KB gzipped with Redux and Immer inside; the legacy manifest loads every page eagerly, the harness would need its 593 KB UMD, and its defaults would be restyled anyway. Our charts are small (at most 90 days, at most 5 slices). Ruben: "Own kit". |
| D4 | Page order and chart jobs as in section 4, including two changes to #557: tiles carry a quiet comparison **in counts** ("up from 99"), and the period before leaves the daily columns (it stays on the area and radar charts). | #557 removed percentage deltas because they lied on small counts; counts don't. The dashed line zigzagged over daily columns. |
| D5 | Visual direction as prototyped, then **more compact**. | Ruben: "More compact": the first chart row sits above the fold at 1440 x 900. |
| D6 | Three PRs: data, kit, page. Claude pushes the migration to production (dry run, push, read back) before the data PR merges. | Ruben: "Yes, write the spec". |
| D7 | The review of 19 Sep: every sentence beside a number from the view model; comparisons only against a period someone reached the business in; weekdays as their own averages; the card owns the series and the area is the line; a tooltip placed in pixels; CSV cells by contracts' rule; the mockup draws the sample. | Ruben: "All of them", and "Load a built sample". |

## 3. Principles the page holds

- **Each number once.** A number lives in one place: the hero, a tile, a chart legend or a table. A card's one-line
  takeaway never restates a number from the tiles or the hero; it adds the next thing (a peak, a spread, a
  definition). #557's rule, kept.
- **Form before colour** (the dataviz method): a ratio is a radial meter, a count per day is a column, a trend is a
  line or an area, part-to-whole at a glance is a donut of at most five slices, a cycle (the week) is a radar.
- **Honest data.** Every number is a count over columns. A day with nothing to plot is a gap, never a dip to 0. A
  comparison appears only when the period before had something to compare with.
- **One period control**, above everything; every chart re-renders against it.
- **Every chart has a table twin and a CSV.** Tooltips enhance; they never gate a value.

## 4. The page

### 4.1 Layout (desktop, 12 columns, 12px gaps, column capped at `--measure-wide`)

```
[ 7 days | 30 days | 90 days ]  Aug 20 to Sep 18                       [ sparkle Ask about this period ]   <- sticky
[ Hero: ring 96% + "answered by your receptionist" (5) ][ Worth knowing: up to 3 facts, one line each (7) ]
[ Customer messages | Calls | New people | Booked | Needed you ]                                   <- tiles
The receptionist
[ Who answered, day by day: stacked columns (8)          ][ How fast it answers: line + spread strip (4) ]
[ Why it stopped: bar list (4) ][ Calls: columns + caller mood (4) ][ Asked, then booked: radial (4) ]
Your customers
[ Where they reach you: donut (4) ][ When they reach you: radar + hours (4) ][ New people, adding up: area (4) ]
Campaigns   what your broadcasts and playbooks sent
[ From sent to replied: funnel bars (5) ][ Sent, day by day: columns (7) ]
[ By playbook and broadcast: table (12) ]
Google reviews   (shown when this deployment can read listings, as today)
[ 4 tiles ][ Ratings gained, day by day: columns (5) ][ Latest reviews + reply (7) ]
```

Below 1180px: hero and facts take a full row each, 4-span cards take half, wider cards take the row, tiles wrap 3+2.
Below 760px (phone): one column in the same order, no dates in the head, the Ask button shows its icon only (with
an `aria-label`), the hero puts a 96px ring beside its lead and the sentence under both, facts wrap to two lines.

The page owns its scroll (a pane route): the scroller is full width so its bar sits at the window edge, the column
inside is measured, and the period row is sticky inside it.

### 4.2 Headline

- **Hero** (`data-testid="reports-hero"`): a radial meter of the receptionist's share of answered customer messages
  (`answered_ai / (answered_ai + answered_you + unanswered)`; each is a row of `first_replies`, one per inbound
  customer message, so the total is the Customer messages tile's), the share in the ring (29px), the lead "answered
  by your receptionist", and the view model's sentences (`vm.lines.hero`, `vm.lines.heroBefore`): "{ai} of {total}
  customer messages, without you. Half of its replies went out within {median}." and, when the period before had
  answers, a tick on the ring plus "{prior}% the {range} before". Nothing to answer: an empty ring with no number in
  it, and "No customer wrote in this period."
- **Worth knowing** (`data-testid="reports-facts"`, an `h2`): up to three facts from `reportFacts()` (section 6.4),
  each one line (icon, sentence, dim detail). A fact with a door is one button, the whole row its target, and the full
  sentence rides in its title. No facts: "A quiet period. Nothing stood out." An empty period shows no Worth knowing:
  the hero's line and the empty card already say it. The hero and the facts sit in one
  `<section aria-label="This period">`.
- **Tiles** (`data-testid="reports-tiles"`, a `<dl>`), each label (`dt`), value (22px, proportional figures) with the
  comparison beside it in dim text, and one meta line (`dd`; it may take two lines on a phone):

| Tile | Value | Meta | Comparison |
|---|---|---|---|
| Customer messages | messages_in | "on {d} of {n} days" | yes |
| Calls | calls | "{m} min on the phone · {v} to voicemail" (the view model's) | yes |
| New people | new_contacts | "first contact in this period, by evidence" | yes |
| Booked | booked | "of {asked} who asked" / "nobody asked" / "no calendar to read" / "the calendar could not be read" | no |
| Needed you | escalations | "times the receptionist stopped" / "the receptionist never stopped" | yes |

Comparison wording (contracts `compareWords`): "up from {p}", "down from {p}", "same as the {range} before", and "none
the {range} before" when the period before had people reaching the business but none of this. Nothing when the period
before had no customer message and no call at all (a workspace too young to compare), and nothing when both are zero.
Never a percentage, never a colour.

The old tiles "Receptionist answered" and "Median reply time" move into the hero; the campaign tile strip is gone
(its numbers live in the funnel card): each number once.

### 4.3 Cards

Every card is a `ChartCard` (section 7): title (13.5px, 500), an optional one-line takeaway (12.5px, ink-dim), the
legend for two or more series, and on the right a Chart/Table switch and a CSV button that show on hover or keyboard
focus (always on touch screens, and while the table is showing). Every takeaway is the view model's own sentence
(`vm.lines`, `cm.lines`): the page composes none. The `data-testid`s of today's cards are kept where the card survives.

| Card (testid) | Form | Takeaway (the view model's) | Table twin |
|---|---|---|---|
| Who answered, day by day (`chart-answered`) | stacked columns: receptionist (ink), you (lighter ink), unanswered (amber + alert icon); legend with totals | "Most messages on {date}: {n}." (the first of a tie) | today's `vm.table` (8 columns) |
| How fast it answers (`chart-reply`) | line of the median reply per day (7 days) or per week (30/90), a labelled "1 min" reference line; under it every reply by how long it took, as one part-bar in the ordinal ink ramp with counts | "Nine in ten within {p90}." with ten replies or more; under ten, "The slowest took {max}." (the median is the hero's) | Day or "Week of", Median reply, Slowest tenth, Replies |
| Why it stopped (`chart-reasons`) | bar list: label and value on one line, bar under; rows open the Inbox | none (the Needed you tile says what it counts) | Reason, Times |
| Calls (`chart-calls`) | columns per day; caller mood as one part-bar in its own order (positive ok-green, neither gray, negative danger-red, each named with its count) | "About {mean duration} a call." (by `fmtSeconds`; the minutes and voicemail are the tile's) | Day, Calls, Seconds on the phone |
| Asked, then booked (`chart-booking`) | radial of `booking.pct` beside the booking view model's own `words` (the count is the tile's). No calendar: its sentence and a door to Settings. A calendar that could not be read: a failed read, no door. Nobody asked: its words | none | none |
| Where they reach you (`chart-channels`) | donut by channel, "messages and calls" in the centre, legend with count and share; one channel alone is its number and its row, with no ring | "Mostly {top}, as the {range} before." / "{Top} leads." / "{Top} took over from {was}." (calls and email said as nouns: "Calls lead", "Mostly email") | Channel, this period, the period before |
| When they reach you (`chart-rhythm`) | radar of messages + calls per weekday (a week's counts; over 30 or 90 days each weekday's own average, because 30 days hold five of two weekdays and four of the rest), this period washed and the period before a gray line; under it the 24 hours as a heat strip (ordinal ink ramp, empty hours in the empty step, the view model's hour names) | the quiet side of the week: "Nothing on {days}." / "Only on {days}." / "Quietest on {weekday}s." (30/90) / "{Day} was the quietest day." (7) | the seven days, then the 24 hours |
| New people, adding up (`chart-people`) | area: the running total of new people over the period, beside the period before's running total (gray) | none (the New people tile says what someone new is) | Day, New people (daily) |
| From sent to replied (`chart-funnel`) | bar list, ordinal ink ramp: Sent, Delivered "{n} {pct}%", Wrote back "{n} {pct}%" | "{a} people said yes to messages, {b} asked to stop." (the general consent, a yes to messages; never "offers": a visit reminder is no offer) | none (the numbers are the bars' labels) |
| Sent, day by day (`chart-campaigns`) | columns | "From {n} broadcast and playbook runs." (the sends are the funnel's) | today's `cm.table` |
| By playbook and broadcast (`chart-sources`) | table: Source (a door to the playbook or the broadcast run) with kind and runs, Sent, Delivered %, Wrote back % (n), Last (folded away on a phone) | none | today's sources table |
| Google reviews (`google-tiles`, `chart-google-gained`, `chart-google-latest`, `google-review`, `google-reply*`) | as today, on the kit: the shared tiles, ratings gained as columns, the latest reviews with the reply composer and its drafting | the gained count is the tiles', so only "Needs a second day of reading." before there is one; the latest reviews' source line as today | as today |

Empty and failed states keep today's words: nothing came in (card EmptyState with "Look at 90 days"), no calls, nobody
new, it never stopped, nothing went out ("Open Broadcasts"), the campaign read failed (FailedRead: "The receptionist's
own numbers above are current."), no calendar (the booking view model's sentence with a door to Settings).

## 5. Visual language

### 5.1 Palette (new `styles/charts.css`)

Validated with the dataviz skill's `validate_palette.js` against the card surfaces (light `#ffffff`, dark
`oklch(0.2 0.006 260)` = `#141619`):

| Token | Light | Dark | Job |
|---|---|---|---|
| `--chart-1` | `#3a65b8` | `#5a84d4` | ink blue: the receptionist, this period, any single series, radial fills |
| `--chart-1-soft` | `#7398dc` | `#3c61a7` | answered by you (one ramp step off ink, so "answered" reads as one family) |
| `--chart-cat-1..5` | `#3a65b8 #d98854 #94559e #baa851 #bc598c` | `#5a84d4 #cb7b48 #a86cb1 #a39340 #c66897` | channels only, fixed order WhatsApp, Calls, Email, SMS, Instagram (colour follows the channel, never its rank) |
| `--chart-ramp-1..5` | `#95b3e9 #7398dc #547ecd #3a65b8 #234993` | `#2e4b83 #3c61a7 #4e78c7 #6991dc #92b2eb` | ordered things: funnel stages, reply-time buckets, the hour strip |
| `--chart-prior` | `#a3a5a8` | `#616368` | the period before (de-emphasis gray, solid line) |
| `--chart-track` | `oklch(0.945 0.02 262)` | `oklch(0.275 0.03 262)` | a radial's unfilled track (a pale step of ink) |
| `--chart-empty` | `oklch(0.965 0.004 80)` | `oklch(0.235 0.006 260)` | an empty heat cell |

Validation results: the categorical order passes as a 4- and a 5-slice ring (a donut's last slice touches its first):
worst adjacent CVD dE 8.6, worst normal-vision dE 17.4, both themes. The ramp is monotone with dL >= 0.06 and a light
end >= 2:1 in both themes. Status colours stay the app's own (`--warn` for unanswered, `--ok` and `--danger` for a
caller's mood) and always ride with an icon or a word. The coral accent never appears on this page (it is reserved
for live state). These values are the validator's passing output; a change to any chart token re-runs
`validate_palette.js` (categorical: `--mode light` and `--mode dark` against the surfaces above, with the first slot
appended to test the ring; ramp: `--ordinal`) before it ships.

### 5.2 Type, space, shape

Geist throughout; Geist Mono only for axis ticks (10.5px). Hero figure 29px, tile values 22px, both in proportional
figures; `tabular-nums` only in tables and ticks. Titles in sentence case, no uppercase micro-labels, no em dashes in
new copy. Cards: 12px radius, 1px `--line` border, `--bg-raised`, padding 14px 18px 16px. Controls: 7-8px radius.
Section titles 14.5px/500 with an optional dim meta beside them.

### 5.3 Marks and motion

Columns at most 24px wide and never filling their slot, 2px surface gaps between stacked segments, 4px rounded data
ends square at the baseline; lines 2px with round joins; area washes 16% to 1%; grids solid hairlines one step off the
card; a crosshair and dots with a 2px card-coloured ring on line and area charts; the hovered column stays while the
others step back to 42%. Charts draw in once (columns grow, lines draw, the ring sweeps, 500-1000ms `--ease-out`) on
arrival and on a new period, never looping, and not at all under `prefers-reduced-motion`.

## 6. Data

### 6.1 SQL: `report_series` v3 (one migration)

`create or replace function public.report_series(p_tenant_id uuid, p_days integer default 30)`: same signature,
`security invoker`, same grants, every existing field unchanged. Three fields join the result:

- `replies`: `[{ "day": "YYYY-MM-DD", "s": 23 }, ...]`, the current period only: every row of
  `first_replies(p_tenant_id, v_start)` with `who = 'ai'` and `ai_seconds is not null`, `day` from `asked_at` in the
  tenant's time zone. (`reply_seconds` stays for older clients.)
- `channels`: `{ "current": {...}, "previous": {...} }`, each `{ whatsapp, sms, email, instagram, voice }`:
  inbound customer messages by `messages.channel` in the period (a conversation is one per person and spans every
  channel, so the channel lives on the message), and `voice` = connected calls (`status <> 'not_connected'`). The unit
  is "messages and calls", the same as the radar and the hours. Backfilled messages excluded, as everywhere in this
  function. (`instagram` is not a message channel yet; its key reads 0 until it is.)
- `hours`: 7 rows (Monday first) of 24 integers: inbound customer messages plus connected calls in the current period,
  by `isodow` and hour in the tenant's time zone.

Migration number: the next free number on `origin/main` **re-checked right before the push** (main holds 00138 since #677
on 19 Sep; the plan writes 00139). Written re-runnable (`create or replace`).

### 6.2 API

`GET /api/v1/reports` is unchanged: it returns what the function returns. `ReportDto` gains the three optional fields.

### 6.3 Contracts (`packages/contracts/src`)

`toReportVM` adds, and a v2 payload (no new fields) still maps cleanly with the new parts `null`:

- `answered.share`, `answered.priorShare` (0..1 or null).
- `tiles[i].compare`: the counts wording in 4.2, from `compareWords(current, previous, rangeLabel, priorHadAny)`, where
  `priorHadAny` is whether the period before had any customer message or call (`delta` and `spark` stay for Ask).
- `speed: { unit: "day" | "week", points: [{ day, label, short, p50, p90, p50Label, p90Label, count }] } | null`: true
  medians and 90th percentiles from `replies`, by day up to 14 days, by week past that (weeks end on the period's last
  day; a first week of fewer than 4 days joins the next).
- `week: { axes, long, current, prior, busiest, quietest, unit }`: messages + calls per weekday, Monday first; the count
  when each weekday happened once, each weekday's average (one decimal) when some happened more than once (`unit` says
  which); `busiest` and `quietest` are the ONE largest and smallest, null on a tie.
- `hours: { values, peak, outside, labels } | null`: `peak` is the start hour of the busiest two-hour window; `outside`
  counts before 8am or from 8pm (named so in words, until business hours exist).
- `channels: [{ key, label, value, prior }] | null` in the fixed order, zero rows dropped.
- `people.cumulative: { points: [{ ...point, total }], prior: number[] | null }`.
- `calls.sentiments` in a mood's own order (positive, neither, negative), each with a `tone` (`callMoodTone`).
- `period: { now: "Last {range}", before: "The {range} before" }`, said the same way in every legend, tooltip and
  table.
- `lines: { hero, heroBefore, answered, reply, calls, channels, rhythm }`: the sentences in 4.2 and 4.3, each null where
  it would not be true.

`toCampaignReportVM` adds `lines: { funnel, sent }` (4.3) and its tiles `compare: null`; `toGoogleVM`'s tiles
`compare: null`. `toBookingReportVM` adds `calendar` ("ok" | "unavailable" | "none") and `words` (what the share is of;
its `sub` is the share and these words, unchanged).

### 6.4 Worth knowing: `reportFacts()`

Pure, deterministic, at most three, in this priority; a fact never restates a tile's number:

1. Unanswered > 0 (tone warn, icon alert): "{n} message has / messages have no reply yet" ("yet": the newest may have a
   reply being written) · door "Open the Inbox".
2. Escalations > 0 and a top reason: "Top reason it handed over: {reason, lower case}" · "{n} times", or with one reason
   "Why it handed over: {reason}" · "every time" (its count is the tile's) · door "See them" (Inbox).
3. The one busiest weekday: "{Weekday}s are your busiest day" (30/90) or "{Weekday} was your busiest day" (7) ·
   "peak {h} to {h+2}{, {k} outside 8am to 8pm}". A tie names none.
4. A campaign source with replies: "{name} drew the most replies" · "{replied} of {sent} wrote back" · door to it; for
   the same replies, the one that sent fewer.
5. A channel whose share moved 10 points or more against the period before: "{Channel} grew to {x}% of messages and
   calls" or "... fell to ...".

### 6.5 Ask door

"Ask about this period" calls `window.askAbout({ prompt: "What stood out in my last {range}?" })`, the existing
contract; Ask reads the workspace itself. No new endpoint.

## 7. The chart kit

`apps/dashboard/src/legacy/components/chart-*.jsx`: seven flat files with a `chart-` prefix (the load-list test,
`legacy-harness.test.mjs`, reads `components/` one level deep). Classic scripts (window globals, unique hook aliases
per file), each added to **both** `legacy-bridge/manifest.ts` and `Chanlytics.html` after `template-chips.jsx`, with
`?v=` keys. No React context: the test stub renders children before their parents, so the parts that need labels take
the `config` as a prop. A chart renders at a starting width (600px) until the ResizeObserver measures it, so nothing
paints blank.

The review of 19 Sep deepened the interface: the card owns the series, so there is no container; the area is the line
with a filled series; the x-y charts share one frame, one y axis and one x-label rule.

| File | Exports | Notes |
|---|---|---|
| `chart-core.jsx` | numbers and geometry (`ckNice`, `ckNiceSeconds`, `ckSecondsLabel`, `ckMonotone` (d3's monotoneX), `ckRuns`, `ckPolar`, `ckArc`, `ckArcLine`, `ckTopRound`, `ckAxisWidth`); the shared frame (`ckFrame`, `ckEvery`, `CkYAxis`, `CkXLabels`: the newest day always labelled); `useChartWidth`; `useChartNav` (one tab stop; a point held past a new period's end reads as none); `ckPointer` (a touch reads as a mouse); the default words (`ckTip`, `ckDescribe`, from `config`); `ChartTooltip` (placed in pixels: whichever side of the point holds 260px, else across the plot, always above it); `ChartTooltipContent` (line keys only); `ChartLive`; `ChartLegend` (none under two series); `ChartCard`; `ChartTable`; `ckSaveCsv` (cells by contracts' `csvCell`, `window.__csvCell`); `SegmentBar` | `config = { key: { label, color, icon?, shape? } }`, once per card: `ChartCard` publishes `--color-<key>` on its `<section>`, draws the legend, and owns the switch, the table twin (its `table`, or one made from `twin: { data, keys, first }`) and the CSV; the page places it with `className` |
| `chart-bar.jsx` | `BarChart` (columns, single or stacked), `BarList` (horizontal, label and value over the bar, optional door) | |
| `chart-line.jsx` | `LineChart`: series with gaps, a filled series (the area), the period before in gray, `scale: "count"` or `"seconds"`, an optional labelled reference line | |
| `chart-pie.jsx` | `PieChart` (donut, centre value, legend with count and share; one slice is its number and its row, no ring) | |
| `chart-radar.jsx` | `RadarChart` (hairline rings and spokes, the first series washed, `fill: false` a gray line) | |
| `chart-radial.jsx` | `RadialChart` (270-degree meter, same-ramp track, optional prior tick, children in the centre) | |
| `chart-heat.jsx` | `HeatStrip` (cells in the ordinal ramp, the view model's hour names every sixth hour, focus on the busiest) | |

Every plot is `role="group"` with `aria-roledescription="chart"`, takes `animKey` (a new period draws in again), and
answers to pointer events with `touch-action: pan-y`. `styles/charts.css` holds the tokens and the kit's chrome;
`legacy.css` imports it before `reports.css`. `icons.jsx` gains `download`.

The Reports page splits in two: `pages/reports.jsx` keeps the page shell (the period row, the real/demo switch) and the
Google section with `ReviewReply` (their source pins in google, google-profile and review-reply tests stay true where
they are read), and `pages/reports-sections.jsx` holds the hero, the facts, the tiles and the three sections. `RpTile`
stays exported from `reports.jsx` (`Object.assign(window, { RpTile });`) because Today draws its week with it.
Deleted: `ReportsSeed`, `RpShareDialog`, `RpAreaChart`, `RpStacked`, `RpColumns`, `RpBars`, `RpBuckets`, `RpShare`,
`useRpTip`, and the `rp-*`/`rp2-*` rules the new page no longer uses.

The demo renders the same page from a sample: `legacy-bridge/reports-sample.ts` builds a sample `ReportDto` (plus
campaign and booking samples) and maps it through the same contracts functions. The standalone mockup loads it as
`data/reports-sample.js`, which `tooling/scripts/serve-legacy.mjs` builds with esbuild (a direct dev dependency, at the
version tsx already installs) and which publishes `window.__reportsSample`. The app never enters a demo session, so it
never loads the sample. `data/reports-data.jsx` keeps `RP_TRUST`, `RP_AGENTS` and `window.TRUST`, which other surfaces
read.

## 8. Accessibility

One tab stop per chart (`role="group"`, named); focus lands on the latest point (the first slice on a donut, the
busiest hour on the strip); arrow keys walk, Home and End jump, Escape leaves; a polite live region says the point in
words. Legends for two or more series, identity never by colour alone, text always in ink tokens. Every chart card has
the table twin and its CSV. Focus rings on every control. Touch targets keep the shell's 44px floor on coarse pointers
(`legacy.css`), and a finger reads a chart by touch. Reduced motion stops every animation. The period row is sticky
with an edge; print draws the whole page.

## 9. Testing

- **Kit** (`chart-kit.test.mjs`): clean ticks; the curve inside its data; gaps; arcs; one x-label rule (the newest day
  labelled at 30 and 90 days); default words from `config`; the card's colours, legend (none for one series), twin and
  CSV (spelled by `csvCell`: a formula made text); the tooltip inside the card at every width from 320px; one tab stop
  and a clamped point; every chart drawn and read back.
- **Contracts** (`reports-where-when`, `reports-lines`, `report-facts`, and cases in `campaign-report` and
  `calendar-people`): a v2 payload maps; comparisons with the too-young and nothing-against-nothing gates; weekday
  averages over 30 days and ties; every branch of every card sentence; the hero's sentences; the mood's order; the
  facts' priority, the three-fact cap, "never restates a tile" and the tie-breaks.
- **SQL** (`report-series.db.test.mjs`, real Postgres): `report_series` v3 returns `replies`, `channels` and `hours` for
  a seeded tenant in its time zone, excluding backfill and unconnected calls; the old fields unchanged.
- **Page** (`reports-page.test.mjs`, on `_legacy-react.mjs`): the hero, facts, tiles and every card from a view model;
  empty, failed, unreadable-calendar and no-calendar states; a v2 payload; Ask; a period that fails to load; Google's
  section; the demo; the regressions moved from reports-honest (C13, C25 to C28).
- **Sample** (`reports-sample.test.mjs`): every total agrees with its parts, and the mockup's bundle publishes the same
  sample. `legacy-harness.test.mjs`: both load lists, and the sample loaded right after the stand-ins.
- **e2e** (`e2e/reports.spec.ts`): rewritten for the new structure; it first runs in the nightly.
- **Look**: the mockup at 1440 x 900 (light and dark), 1180 and a phone: no failed read, no sideways scroll, the first
  chart row above the fold.

## 10. Rollout

1. **Data PR:** migration + `ReportDto`/VM + `reportFacts` + tests. Before merge: dry run, push to production, read
   the function back (the three fields present, a real tenant's report still returns), then merge on green.
2. **Kit PR:** `components/chart-*.jsx`, `styles/charts.css`, the two icons, the kit's tests; nothing on the page yet.
3. **Page PR:** the new Reports page, the demo sample, the Google section restyled in place, e2e updates, and the docs
   (`legacy/CLAUDE.md` for the kit and its conventions, `docs/system-prd.md` for Reports).

## 11. Out of scope

Business hours (and a true "after hours"), a full 7 x 24 heatmap view, per-channel daily trends, a shared-link view of
Reports (the demo's share dialog goes), exporting the whole page, any change to Today's own charts.
