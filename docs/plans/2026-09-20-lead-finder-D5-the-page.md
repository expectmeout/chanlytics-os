# Lead Finder D5 — the page, re-cut · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Leads page reads the way the *Lead Finder Redesign* canvas argues it should — three columns, a band bar that is also the class tabs, a two-slot reach glyph, four depths of disclosure (row → hover → peek → expanded), Needs review as a workbench, a phone deck, and a map — drawn on the product's own dark theme and tokens, for a lead from any source, with the listing's photo when there is one and a designed tile when there is not.

**Architecture:** Everything the boards show is a re-cut of data the doors already return. One migration (`00146`) adds the neighbourhood the Maps card already fetches and the fit split the band bar needs. Contracts grow the row view model (a sub-line, the two reach slots, the hover cards' facts, the row's state mark) and the band; the page draws from those and never derives a word. Hover surfaces are CSS (`:hover`, `:focus-within`, a delay, one open at a time, closed while the list scrolls) over content that is always in the DOM, so the honest tests read it. The map is Leaflet over OpenStreetMap tiles, drawn from the coordinates `leads_page` already returns.

**Tech Stack:** contracts (TypeScript, tsup dist), the hookless legacy JSX pages under the stub React (tests key hooks by call order), `leads.css` on `tokens.css`, Postgres doors re-declared by anchored deltas (the `gen-0014x.mjs` pattern), Leaflet (PR 3 only).

---

## What the canvas decided, and what this plan holds to

| Board | Taken | Changed, and why |
|---|---|---|
| The page (Main) | Three columns, the band bar as tabs, "Why it fits" off the row, the photo at 48px as a button, Found at rest turning into acts on hover, `Values ⁄ Signals` | The band keeps a **quiet fit mark on the row when a search's fits are mixed** ("Strong fit on every row carried no signal" is true of one search). The palette is the app's dark theme, not ivory; the four meaning colours (moss, ochre, rust, stone) become tokens over `--ok`, `--warn`, `--danger`, `--ink-dim`. |
| The peek | Photo band with Expand, identity with today's hours, the verdict card, reach rows, "what people say", the checks with a summary head, the trace, a pinned Call bar | "Find one" draws only once its courier exists (Task 4 of D3 waits on Ruben). |
| The photo, expanded | One photo, the hours as bars, "where it sits", the listing's facts, Open in Maps | **No gallery, no street view**: the card asks the actor for zero images and there is no street-view source. The filmstrip is not drawn. |
| Row anatomy | The two-slot glyph in five states, six row states | `unknown` (a mail server that would not answer) wears Unconfirmed's shape with its own sentence in the tip. |
| Hovers | Two tiers, four rules | Tips and cards are CSS-shown; the content is always in the DOM. |
| Review workbench | Queue left, the group's leads middle, "what each press does" right, the round that ran dry | Town names for nearby areas are not available (ZIP centroids only): the block says "near 97005". |
| Map | Pins in the fit colour, the area drawn, "Search this area instead" | Leaflet + OSM tiles (free); the pins are the loaded rows. |
| Mobile, back from the call | One lead at a time, thumb-sized Call, the six outcomes, the note, "Save and go to next" | Built on the peek, which already goes full screen on a phone; swipe moves the cursor. |
| Kit | The glyph, the radii, the meaning colours | The type is the app's (Geist, Geist Mono). |

**A lead from any source.** The row and the peek read a universal shape: a name; a sub-line of whatever the source gave (kind, neighbourhood, ZIP, distance); two reach slots (phone, mailbox) each in one of five states; a rating only where the source rates (blank otherwise, never a dash); a photo where there is one, else initials on a tint derived from the kind; a "found" line that names the source and the rank when there is one. Nothing on the row is Maps-only; `LEAD_SOURCE_WORD` stays the one place the source is named.

---

## File structure

- **Modify** `packages/contracts/src/leads.ts` — `LeadRowVM` gains `sub`, `slots`, `rated`, `mark`, `waitsOn`, `card`; `toLeadRowVM(r, tz, now, search?)`; `leadBand(search)`; `leadSlotWords`; `LEAD_WORDS` gains the peek's new words.
- **Modify** `apps/dashboard/src/legacy/pages/leads-scope.jsx` — `LEAD_COLUMNS` (business, reach, rated, found + off-by-default fit, why, stage, distance, source, website, search), `LeadSlot`, `LeadTile`, `LeadTip`, `LeadCard`, `LeadBand` (replaces `LeadClassTabs`), the `Values` toggle, the review bench (PR 2), the map (PR 3).
- **Modify** `apps/dashboard/src/legacy/pages/leads-peek.jsx` — the photo band, the summary head on the checks, the pinned act bar, the lightbox (`LeadLightbox`).
- **Modify** `apps/dashboard/src/legacy/styles/leads.css` — the meaning tokens, the row, the tile, the glyph, the band, the hovers, the peek re-cut, the lightbox, the bench, the deck, the map, the phone.
- **Modify** `apps/dashboard/src/legacy/pages/clients-a.jsx` — `values`, `lightboxId`, `deck` state and their acts; `cellCtxLeads` gains `values`, `mixedFits`, `onExpand`; `toLeadRowVM` is handed the row's search by the bridge.
- **Modify** `apps/dashboard/src/legacy-bridge/leads.ts` — the row VM takes its search; `LeadsSurface.month`.
- **Modify** `apps/dashboard/src/server/leads.ts` — the DTO carries `neighborhood`, `lat`, `lng`; the round carries `fits`; the surface carries `month`.
- **Create** `supabase/migrations/00146_the_row_reads_the_neighbourhood_and_the_band.sql` (by `gen-00146.mjs`, anchored deltas).
- **Tests:** `leads-vm.test.mjs`, `leads-honest.test.mjs`, `leads-peek.test.mjs`, `lead-routes.test.mjs`, `lead-engine.db.test.mjs`, `leads-bridge.test.mjs`.

Three pull requests: **PR 1** the row, the band, the glyphs, the hovers, the peek and the lightbox (Tasks 1–7); **PR 2** the review workbench and the phone deck (Tasks 8–10); **PR 3** the map (Task 11).

---

## PR 1 — the row, the band, the hovers, the peek

### Task 1: Migration 00146 — the neighbourhood, and the fit split

**Files:** create `supabase/migrations/00146_the_row_reads_the_neighbourhood_and_the_band.sql` via `$SCRATCH/gen-00146.mjs`; modify `packages/core/src/leads/ports.ts` (`LeadColumns.neighborhood`), `packages/core/src/leads/runner.ts` (the place object), `packages/db/src/database.types.ts` (regenerated). Tests: `lead-engine.db.test.mjs`, `lead-core.test.mjs`.

- [ ] **Step 1: The failing db test** (appended to `lead-engine.db.test.mjs`, self-contained like D2's): a commit whose place carries `neighborhood: "Hawthorne"` writes `leads.neighborhood`; `leads_page` returns it beside `lat`/`lng`; a known place fills it only where empty; `lead_blank` blanks it; `lead_searches_view` returns `strong`, `look`, `long` for a search with two strong, one look and one long qualified member and one review member (which counts in none).
- [ ] **Step 2: Red.** **Step 3:** the generator copies and deltas:
  - `alter table public.leads add column if not exists neighborhood text;`
  - `lead_collect_commit` from 00145: the insert list gains `neighborhood` after `postal_code`? No — appended at the end of the D2 eleven (`..., maps_url, rank, neighborhood)`), the values gain `left(v_pl->>'neighborhood', 120)`, the `on conflict … do update` gains `neighborhood = coalesce(public.leads.neighborhood, excluded.neighborhood)`.
  - `leads_page` from 00144: `drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid);` then the returns table gains `neighborhood text` after `rank integer`, the base select gains `l.neighborhood`, the outer select gains `b.neighborhood`.
  - `lead_blank` from 00144: `rank = null` → `rank = null, neighborhood = null`.
  - `lead_searches_view` from 00145 (replaced in place, columns appended last): the members lateral gains `count(*) filter (where m.class = 'qualified' and m.blanked_at is null and m.fit = 'strong') as strong` and the same for `look` and `long`; the outer select appends `coalesce(c.strong, 0) as strong, coalesce(c.look, 0) as look, coalesce(c.long, 0) as long` after `nearby`.
- [ ] **Step 4:** ports `LeadColumns.neighborhood: string | null`; runner place object `neighborhood: excluded ? null : c.raw.neighborhood`; `mapItem` already reads it. Apply locally, regenerate types, both db suites green.
- [ ] **Step 5: Commit** — "The row reads the neighbourhood, and the band reads the fit split (00146)".

### Task 2: Contracts — the row's new words

**Files:** `packages/contracts/src/leads.ts`, `tooling/scripts/tests/leads-vm.test.mjs`.

- [ ] **Step 1: The failing tests** in `leads-vm.test.mjs`:
  - `sub`: `"Book store · Hawthorne · 97214 · 1.2 mi"` from category, neighbourhood, ZIP, distance; a row with none of them reads `""`; a LinkedIn-shaped row (category only) reads `"Software company"`.
  - `slots`: phone `ok` when two sources agree, `part` with one source, `bad` when marked wrong, `none` without; mailbox `ok`/`part` (catch_all and unknown, with their own sentences)/`none`/`bad` (invalid)/`checking`. Each slot carries `value`, `word` and `tip` (two lines: the value and the sentence; "Press C to copy" for an email that can be copied).
  - `rated`: `{ score: "4.7", count: "1,284" }` or `null`; `spread` five numbers or `null`.
  - `mark`: `{ initials: "PB", tint: 1..6 }` deterministic on the category (the same category, the same tint), `image` when the listing has one.
  - `waitsOn`: the review group's label for a review row (`"Their mail server wouldn't answer"`), `null` otherwise; `state`: `"ready" | "contacted" | "talking" | "review" | "out"` with `stateTag` (`"Contacted · 3d"`, `"Talking"`, `"Put back"`) and `null` for Ready.
  - `card`: `{ about, today, where, links: {site, maps}, found: [{at, what}] }` — the name card's facts, the same derivations the peek uses.
  - `leadBand(search)`: `[{ id: "qualified", label: "19 qualified", count, on }, { id: "review", label: "2 need a look" }, { id: "excluded", label: "7 left out" }]` and `fits: [{ id: "strong", label: "Strong fit", count: 11 }, …]` with `mixed: true` when more than one fit has a count; `null` without a round.
- [ ] **Step 2: Red. Step 3:** implement in `toLeadRowVM(r, tz, now, search = null)` reusing `leadWhere`, `leadTodayLine`, `leadReviewGroups`, `initialsOf`; `LEAD_SLOT_WORDS` for the five states; `leadBand` from `search.round` (`qualified`, `review`, `excluded`, `fits`); `LeadSearchRoundDto.fits: { strong: number; look: number; long: number }` (optional on a fixture from before). The bridge hands `toLeadRowVM` the row's search.
- [ ] **Step 4: Green. Step 5: Commit** — "The row's words: a sub-line, two reach slots, a mark, what it waits on, and the band".

### Task 3: The row and the band

**Files:** `leads-scope.jsx`, `leads.css`, `clients-a.jsx`, `leads-honest.test.mjs`.

- [ ] **Step 1: The failing honest tests:** headings are `["Business", "Reach", "Rated", "Found"]` by default and `Fit`, `Why it fits`, `Stage` are in the Columns menu off; the business cell draws the tile as a button (`lead-photo`, `aria-label="Photos of <name>"`) that calls `x.onExpand(id)`, the name, the sub-line (`lead-sub`), and a fit tag (`lead-fit-tag`) only when `x.mixedFits`; the reach cell draws two slots (`lead-slot-phone`, `lead-slot-mailbox`) with `aria-label` = the slot's word and value, and in `x.values` mode the value beside each; the rated cell draws score and count apart (`lead-rated`); a contacted row wears `lead-state-tag` "Contacted · 3d"; a review row's sub-line is what it waits on; the band (`lead-band`) replaces the class tabs with the same test ids for the three classes (`lead-class-qualified` …) and a fit split (`lead-band-fits`) that draws only when mixed; picking a fit narrows the rows (`x.onPickFit` → the page's `chip` state, as the Excluded chips do).
- [ ] **Step 2: Red. Step 3:** `LeadTile` (the 48px photo button, the initials tint fallback, `onError` swaps to the tile), `LeadSlot` (five shapes: filled circle, half circle, dashed ring, ring with a slash, dashed arc spinning; colour by state; the tip as a sibling `LeadTip`), the four columns, `LeadBand`, the row's `className` by state (`ld-row-<state>`) through a new `rowClass(l)` the table takes (`PeopleTable` gains an optional `rowClass` prop, default none). CSS: the meaning tokens (`--lead-ok`, `--lead-part`, `--lead-none`, `--lead-bad`, and their inks), a 62px row, the tile at 48px with `--radius-lg`, the state edge (3px), the band bar (the three classes as tabs with counts; the fit split as a small stacked bar with words), the sub-line, the rated pair (mono).
- [ ] **Step 4: Green. Step 5: Commit** — "Three columns: the tile, the sub-line, two reach slots, and a band that is also the tabs".

### Task 4: The hover vocabulary

**Files:** `leads-scope.jsx`, `leads.css`, `clients-a.jsx`, `leads-honest.test.mjs`.

- [ ] **Step 1: The failing tests:** every tip is in the DOM with `role="tooltip"` and an `id` the control names in `aria-describedby`; the name card (`lead-card-name`) holds the photo, the name, the sub-line, the about, up to three checks in words, the distance, the site and Maps links and Call; the rated card (`lead-card-rated`) holds five bars with counts; the found card (`lead-card-found`) holds the trace lines; a review row's tip (`lead-tip-waits`) names what resolves it; the list's scroller sets `data-scrolling` while it moves (the page's `onScrolled` already tracks it) and no hover shows then.
- [ ] **Step 2: Red. Step 3:** `LeadTip` (a dark chip, `.ld-tip`, shown by the parent's `:hover`/`:focus-within` after 200ms, never takes the pointer: `pointer-events: none`), `LeadCard` (`.ld-card`, raised, `--shadow-lg`, shown after 400ms, stays while hovered; keyboard: `:focus-within` on the trigger opens it; Esc is the page's). CSS rule: `.pl-main[data-scrolling] .ld-tip, .pl-main[data-scrolling] .ld-card { display: none }`. The row's Found cell shows the acts on hover (`.ld-found-acts`: Call, Draft, More) without moving the time.
- [ ] **Step 4: Green. Step 5: Commit** — "Everything else lives one hover away: tips that confirm, cards that decide".

### Task 5: The peek re-cut, and the photo expanded

**Files:** `leads-peek.jsx`, `leads.css`, `clients-a.jsx`, `packages/contracts/src/leads.ts` (`LeadPeekVM.week`, `LeadPeekVM.facts`, `LEAD_WORDS`), `leads-peek.test.mjs`, `leads-vm.test.mjs`.

- [ ] **Step 1: The failing tests:** the peek's head is a photo band (`peek-photo-band`) with Expand (`peek-expand`, only with a photo or the tile) and Close; the identity block reads name, sub-line with today's hours, about, address with the distance; the checks group wears a summary head (`peek-checks-summary`: "5 checks passed · 2 couldn't tell") and opens/closes (`open` by default); the rated card (`peek-rated`) draws the score large, the count, five bars, the unclaimed note; the act bar (`peek-act`) is the last child of the peek with Call (or Draft when there is no phone) and More; `LeadLightbox` (`lead-lightbox`, `role="dialog"`) draws the photo (or the tile), "Where it sits" (address, distance, in-area line), the week's hours as bars (`peek-week`, seven rows, today marked, "Closed" rows empty), "From the listing" facts, Open in Maps, and closes on its Close button; `leadWeekBars(hours)` in contracts turns `"9 AM to 6 PM"` into `{ x: 37.5, w: 37.5 }` (percent of the day), `"Closed"` into `null`, `"Open 24 hours"` into `{ x: 0, w: 100 }`, and a line it cannot read into `null` with the text kept.
- [ ] **Step 2: Red. Step 3:** contracts `leadWeekBars`, `LeadPeekVM.week`, `LeadPeekVM.facts` (category, price, rated, listing, found at, other listings); the peek's new order: band → identity → stage row → verdict card (`pk-verdict`, the fit word, the sentence) → reach → rated card → checks (summary head, `<details open>`) → others → trace → act bar; `LeadLightbox` rendered by the page when `lightboxId` is set (a `useState` in `ClientsAReal`, unconditional, after `armed`), Esc closes it first (`PL_OVERLAY` counts it: `role="dialog"` with `.pl-peek`).
- [ ] **Step 4: Green. Step 5: Commit** — "The peek decides, the photo expands: a band, a verdict, what people say, the week's hours".

### Task 6: `Values ⁄ Signals`, and the Columns menu

**Files:** `leads-scope.jsx`, `clients-a.jsx`, `leads-honest.test.mjs`.

- [ ] **Step 1: The failing test:** a `Values` toggle (`leads-values`, `aria-pressed`) beside Columns; pressed, the reach cells draw the number and the address beside their glyphs; the choice is kept in `localStorage["leads.values"]` (read in a `try`, written in a `try`) and read on the page's first draw.
- [ ] **Step 2: Red. Step 3:** `values` state in `ClientsAReal`, `cellCtxLeads.values`, the toggle in `.cl-controls-right`. **Step 4: Green. Step 5: Commit** — "Values or Signals: the number in the row for anyone who dials from a desk phone".

### Task 7: Dists, types, the suite, the push, the record

- [ ] Rebuild dists (real diffs only); regenerate `database.types.ts` and `routes.generated.ts` if a route changed; typecheck; the full suite; lint. PR. Dry run lists only 00146; push; read back the view's three columns, `leads.neighborhood`, `leads_page`'s signature; merge; on production open the bookstores search and confirm the row, the band, a hover card and the peek.
- [ ] PRD §14: "**D5 — the page, re-cut (built).**" after D3.

## PR 2 — Needs review as a workbench, and the phone

### Task 8: The month on the surface

**Files:** `apps/dashboard/src/server/leads.ts` (`leadsPage` answers `month: { used, left, renews_on }` on the first page, from `lead_month_used` and the plan facts' `renewsOn`), `apps/dashboard/src/legacy-bridge/leads.ts` (`LeadsSurface.month`), `_fake-db.mjs`, `lead-routes.test.mjs`, `leads-bridge.test.mjs`.

- [ ] Failing route pin: `GET leads` with no `after` answers `month`; the bridge keeps it on the surface. Red, green, commit — "The leads surface knows the month".

### Task 9: The workbench

**Files:** `leads-scope.jsx` (`LeadReviewBench` replaces `LeadReviewGroups` when the class is review), `leads.css`, `clients-a.jsx`, `leads-honest.test.mjs`.

- [ ] Failing tests: the bench (`lead-bench`) draws the queue on the left (`lead-bench-queue`, one row per group with the count and its acts in words, the first selected by default, the page's `benchGroup` state), the group's leads in the middle as cards (`lead-bench-card`, the tile, the name, the phone, the sub-line, the "why", Keep · Exclude per card, the group's acts on a bar over them: "All 5 · Check again · Keep · Exclude"), and on the right "What each press does" (`lead-bench-costs`: Keep — "They join Ready and count against this month. 5 of your 238 left."; Exclude — "They don't count."; Check again — "About 1¢. Their answer lands here in a few minutes."; Find an email is not drawn until its courier exists), "What this search asked for" (the plan's criteria and exclusions in words), and, when the round ran dry, "This round ran dry" with the nearby areas as buttons that open the plan there (the strip's `look_further` route). The empty queue says "Nothing needs a look." Bulk acts go through the bar's existing handlers (`review.onKeep` …).
- [ ] Red, green, commit — "Needs review is a workbench: the pile in order, one press per group, and what each press costs".

### Task 10: The phone deck, and back from the call

**Files:** `leads-peek.jsx`, `leads.css`, `clients-a.jsx`, `leads-peek.test.mjs`.

- [ ] Failing tests: on a phone (`window.__phone`), the peek's head carries "3 of 19" and prev/next (`peek-deck-prev`, `peek-deck-next`) that move the page's cursor (the peek follows it); a swipe (touchstart/touchend 80px) moves it too; the act bar's Call is 52px; the call sheet (`LeadCallAsk`) draws the six outcomes as a 2×3 grid with their dots, the note, "Saving moves them to Talking", "I didn't call", and "Save and go to #4" which saves and moves the cursor; on a desktop nothing changes.
- [ ] Red, green, commit — "The phone is where calling happens: one lead at a time, and the question when you are back".

## PR 3 — the same leads, on the ground

### Task 11: The map

**Files:** `apps/dashboard/src/server/leads.ts` (`LeadRowDto.lat`, `lng` from `leads_page`), contracts (`LeadRowVM.point`), `apps/dashboard/package.json` (`leaflet`), `apps/dashboard/src/legacy/pages/leads-map.jsx` (new: in both file lists), `leads.css`, `clients-a.jsx` (`view.map`), `leads-honest.test.mjs` (the toggle and the list beside the map), `lead-routes.test.mjs` (`lat`/`lng` on the DTO).

- [ ] Failing tests: the rows carry `point` when the door gave one; a `Map` toggle beside Columns (`leads-map`) draws `LeadMap` (`lead-map`) with the loaded rows listed beside it sorted by distance (`lead-map-row`), the selected row's card, "Colour by Fit · Reach · Stage", "Search this area instead" (opens the plan with a `radius` area at the map's centre and its visible radius), and the area drawn from the plan's centre and radius. Leaflet mounts in an effect the page owns (one `useEffect`, unconditional, keyed on `view.map`), never in the hookless scope; the stub React test asserts the markup, not the tiles.
- [ ] Red, green, commit — "The same leads, on the ground". PR; merge; verify on production.

---

## Self-review

- **Spec coverage:** every board has a task; the two dropped boards (gallery, street view) are recorded above with why.
- **Placeholders:** none — each step names its test ids, its words and its files.
- **Type consistency:** `LeadRowVM.slots.{phone,mailbox}.state ∈ {"ok","part","none","bad","checking"}` everywhere; `leadBand` returns `null` without a round; `LeadSearchRoundDto.fits` optional on fixtures from before, `{0,0,0}` when absent.
