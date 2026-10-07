# Phase C, lens 1: Reviews, drawn from what is stored

## What changed in the from-scratch pass

The design below was built on 7 October 2026 in eleven commits on `reports/c1-reviews-drawn-from-what-is-stored` (T1 to T9, from `55d69455a` to `8a7821a3c`), and the same day built again from the data path up, in four more. A review of the lens against the rest of the product found it counting in the wrong places: seven requests of the dashboard's own for the reviews on record, a window cut at a UTC midnight that the browser's fold had to correct, Google read twice, six sentences made by the page, and the headline and the lens each holding a copy of one mechanism. Where the four commits and the design differ, the commits are the lens.

- **R1, the data path** (`2eaaccf24`). Decision Q1 went the other way: the reviews on record are counted by one SQL function, `reviews_ledger(p_tenant_id, p_days)` (migration 00346; SECURITY INVOKER, one statement, the window said once in the workspace's own zone), not by a fold over a bounded read and not by seven reads. It answers each profile review of the period and the one before on its day, with whether it has a reply, how long the reply took and who wrote it (the receptionist's own `google.replied` event, within six hours of the reply on the row), the counts of each origin, whether the record is the whole of Google's list (`google_connections.reviews_complete`, the sync's word) and the oldest five that wait with why a reply written for one was held. Google is read by one reader a turn, which `GET google` and the report share, so Ask's three periods in a turn read it once. `ReviewsLedgerDto` is the function's answer, and `ReviewsReportDto` carries `readable`. Apply 00346 before the edge deploys: its sync writes the column. C2's ledger and its seven reads, and F11's "no migration", are this and not what they say below.
- **R2, the fold** (`9ca2c7e40`). One `gainedWords` makes the head's clause and the Gained figure; the history of the record is the sync's word, else the day the connection began, never Google's count (two writers, two bases) nor the oldest review's date (the sync reads the newest, so the record has gaps); a waiting review is dated in the workspace's zone and year; `figures` is gone, `vm.state` says unavailable, unlinked or linked, and every sentence the page made is in `lines`. C2's rule 4 and C3's table are this and not what they say below.
- **R3, the client** (`a2c21d214`). One helper, `periodSurface`, for the headline and for Reviews; one follower state (`useFollower`: current, coming or failed); the surface holds the fold alone; Settings' Google verbs and the zone forget the lens's read instead of re-reading it from there; the demo draws `reviewsSample`; the page lists its reviews, draws stars as images that say their rating, offers a door only to who may use it, and puts who waits first on a phone. C6's table and T5 to T6 are this and not what they say below.
- **R4, tests, e2e and the documents** (the commit that holds this file). The nightly's workspace holds a listing, a Business Profile with no credentials and four reviews (`convergeGoogle` in `tooling/scripts/ops/e2e-workspace.mjs`), so `e2e/google.spec.ts` runs the linked lens live and asserts its five figures and the sentence at its head. The tests read back the events the edge's writers file (`by`, `why`), and the database test joins them to the function. `rows.googleListing`, `rows.googleConnection` and `rows.googleReview` make the rows; Ask's unlinked block carries the fold's words; `oldest_day` is out of the function, which nothing read; `GET reports/reviews` takes `period` alone. The documents (`docs/system-prd.md`, the lenses spec, its data catalog and `docs/api.md`) say what the lens reads.

Named for the pull request, and left to the owner to decide (none is built):

1. The frame still reads the report, the campaigns and the reach-outs on every lens, so Reviews waits on the slowest of them and fails with it (A1.3, F4). The close is a store for the period that the frame takes a window from, `ROUTE_SURFACE["reports/reviews"]` and Campaigns on `periodSurface`: about a day, and it changes the pinned trade-off that a move between lenses asks for nothing.
2. There is no `google` surface at all: Connections reads Google through Settings and Today through the headline. A surface of its own is a day and a half and two server DTOs.
3. The auto mode's reply is an UPDATE, and the live feed tells a workspace of inserts only, so the lens does not move when the receptionist answers. A trigger would; it is a migration, and waits for the owner's word.

The design as it was written, 6 October 2026, follows.

Written 6 Oct 2026 against branch `reports/c0-what-is-built-is-drawn` (PR #1455, 2c209d578 on main c6dba6909), read in `cm-glass`, by a read-only Sonnet design agent; saved by the controller (session 52fbff93) from the agent's report. Every path:line below was read from that tree. **[V]** is verified in code, **[I]** is inferred. Where this note and the code disagree, the code wins. Nothing was built, run or changed to write it.

Goal: the Reviews lens answers "what do customers say in public?" from what the database holds: one sentence in the head, the period against the one before, the mix of stars, how fast and how often reviews are answered, and what is waiting for a reply. The owner's Business Profile is the source of every figure that needs the whole set; with only Google's public five, the lens says so. Nothing is invented; a figure the stored rows cannot support is absent, never zero. Consent, sending and the edge's sync are not touched.

Controller's summary of the three biggest findings: (1) stored but never drawn: per-review stars, dates and reply text/time (so no mix, weekly count, answered share or time to reply), the `google.replied {by}` and `google.reply_held` events, `connection.words`, and the rating change that `toGoogleVM` computes and `RptFigure` drops; (2) the head sentence's data is in neither read the page holds (`lensAnswerOf("reviews")` undefined; `GET google` returns only the newest 20 reviews): it needs its own bounded read, `GET reports/reviews`, no migration; (3) B2's premise is false for Google: `googleOverride` has no `onDemand` and boots on every page (T8 fixes it). The trap: building the head or figures from the DTO the page holds (the newest 20 rows). Not met with stored data: languages, mix/answered/speed/weekly without the Business Profile, `google_insight_days` (no such table), asked → reviewed, competitors. Folders at the 20-file cap: `e2e`, `tests/reports`, `db/repositories`; `server/readers` is at 32, baselined.

---

## 0. Decisions to take (none blocks the build; each has a default the tasks are written for)

**Q1. Where the period's arithmetic lives.** Recommend: a pure fold in contracts over one bounded read in `packages/db`, no migration. Default: yes. Why: the pool is small and bounded (the profile sync reads at most 5 pages of 50 reviews, newest update first, and the rows persist: `google-profile.ts:20-22,49` [V]); a fold runs in `node:test` here, while a SQL function's suite skips without a stack; nothing to apply to production, either deploy order works, and "migration only on Ruben's word" never comes up. The cost is a departure from the spec's §6.4 ("`report_<lens>` in SQL, no whole-pool reads in TypeScript"), written against pools of thousands (people, deals). If Ruben wants SQL, only `reviewsLedger` and the fold's counting move; `ReviewsReportDto` is the contract and does not change. Main's migration head is 00341 [V]; the next free number is 00343 if the Campaigns lane's 00342 is still unmerged [I]; take it at branch time.

**Q2. Make Google's own read boot only where it is drawn.** The brief says B2 did this. It did not (A1). Recommend: yes, as the last task (T8), its own commit, droppable without touching the rest. Default: yes. Effect: every page except Today and Settings › Connections stops reading `GET google` at boot.

**Q3. Frame rules the lens leaves as they are.** (a) Reviews is shown to every workspace, though §6.2 says "a Google listing is linked" (`lenses.ts:101-112`; its comment at :34-38 says each lens narrows in its own change). Recommend keeping it shown: the empty state is the only door that leads an owner to connect Google (catalog item 8: "the gap is getting owners connected"); amend §6.2's row. (b) §6.2 says periods 30 / 90; the page offers 7 / 30 / 90 / Month on every lens under one stored key (`surface.ts:33`). Per-lens periods are a frame change, not this lens; the lens shows "—" and the count under a figure's minimum instead. Default: both kept.

**Q4. What the lens will not draw, for want of data.** Languages of reviews; a mix, an answered share or a weekly count without the Business Profile; competitors; asked → reviewed. Recommend: omit each, say so in one line where a door helps, propose no capture. Default: omit (F2, F3).

**Q5. The doors.** The bell's row, Today's review line and Setup's Google row all lead to `reports`, the Overview, where no review has been drawn since #1424 (A7). Recommend: lead them to `reports/reviews`. Default: yes (T7). Bell rows already stored keep `reports`; nothing is rewritten.

**Q6. Days in durations.** A reply to a review can take days; `durationWords` stops at hours ("52h 10m") and the chart axes read it too (`kit/charts/geometry.ts`). Recommend: leave it, one helper for every page. Default: leave.

---

## A. Verified current behaviour

### A1. Where the brief and the code differ

1. **Google's read does not boot only where the Reviews lens is drawn.** `googleOverride` has no `onDemand` (`legacy-bridge/google.ts:71-81` [V]); it is in the runner's list (`LegacyApp.tsx:174` [V]), so the boot reads it on every page and every pass. Only `reports` (`surface.ts:101`) and `reports_headline` (`headline.ts:69`) are on demand [V, grep `onDemand`]. Today names it in `ROUTE_DRAWS.today` (`surface-registry.ts:180`), and three pages draw it: Today's card (`today/pages/card.tsx:85`), Settings › Connections (`settings/connections/pane.tsx:223`), the Reviews lens (`lenses/reviews.tsx:12`).
2. **#1455's stated reason is half true.** Its body says a Reviews head sentence "needs Google's read at the head, which would boot Google on every lens". Google is already held on every page, so reading it at the head costs nothing more; the real reason not to is A4: what the head needs is not in that read.
3. **The Reviews lens is the one lens whose data is not in the one read the page holds.** `ReportsPage` draws every lens from `useSurface("reports")` and draws nothing without it (`reports-page.tsx:246,268`). Reviews draws from `google` beside it. Opening Reviews therefore reads `GET reports`, `reports/campaigns` and `reports/reach-outs` (`surface.ts:112-120`) for a lens that draws none of them, plus Google at boot. Making the frame independent of `reports` is its own change (F4); this lane adds no read to the other lenses.
4. **The spec's Reviews "Now" rows overstate what is stored** (A3): languages are null on profile rows; `google_insight_days` does not exist (0 matches in `supabase/schema.sql`); "receptionist vs you" is an event, not a column.

### A2. What the lens draws today

- `ReviewsLens` (`lenses/reviews.tsx:11-24`): `google` unread → nothing (failed → `FailedRead`, testid `reviews-failed`); `googleReadable(G)` false → `LensEmpty` (registry words); else `GoogleSection`. `googleReadable` = the deployment can look up, or can connect, or a listing is kept (`google.tsx:223-224`).
- `GoogleSection` (`google.tsx:226-263`): no listing → card `google-none` ("Find your business on Google once.", door "Find it" to `start/find`, `lenses.ts:107-111`); else a section "Google reviews" with `listing.name · checked …` as its meta, four figures (`google-tiles`, class `rpt-figures four`), the "Ratings gained, day by day" bar chart (`chart-google-gained`, `RPT_GAINED`) and the "Latest reviews" card (`chart-google-latest`, up to 20 rows, the reply composer for operators when the review came through the profile, `ReviewReply` `google.tsx:39-128`).
- The four figures are `toGoogleVM(G.dto, days).tiles` (`google.ts:581-631`): Rating on Google, Reviews on Google, Gained in N days, Newest review, each named by a metric id with its words (`report-metrics.ts:35-41`), drawn by `RptFigure` (`blocks.tsx:164-176`).
- `days` is the Reports period's count (`R.days`); Google's own surface is period-free. A period pick re-reads `reports`, not Google; the VM is re-derived in the browser.

### A3. What Google's read returns, and what is stored and never drawn

`GET google` → `readGoogle` (`google-actions.ts:28-38`) → `googleFor` (`server/connections/google.ts:79-113`): the listing row, the connection row, **the newest 20 reviews** (`REVIEWS_SHOWN = 20`, :35), **92 days of snapshots** (`DAYS_KEPT = 92`, :37), the Autonomy mode for reviews. There is no reader in `server/readers/` for it (the route calls the verb directly), so Ask cannot share it (A5).

What the tables hold (`00069`, `00070`):

| Stored | Where | Drawn today? |
|---|---|---|
| Rating and count now | `google_listings.rating/review_count` | yes (two figures) |
| Rating and count per read day | `google_listing_days` (one row per read day, since linking) | the gained chart and its total; the rating's change is computed (`google.ts:569-577`) and **dropped**: `RptFigure` reads `compare` (`blocks.tsx:171`), which Google sets null in all four tiles (`google.ts:590,600,615,629`) [V] |
| Every review's stars, date, words, author | `google_reviews` (profile: up to the 250 newest-by-update per sync, kept; places: five by relevance, replaced at the first profile sync, `profile-sync.ts:89-93`) | the newest 20 as rows; **never counted**: no mix, no weekly count, no period against the one before |
| Whether a review has a reply, and when | `reply_text`, `replied_at` (= the reply's `updateTime`, `google-profile.ts:191`; an edited reply moves it) | the reply text under a row; **never counted**: no answered share, no time to reply |
| Who replied | event `google.replied`, `by: "receptionist"` only on the auto mode's replies (`review-answers.ts:154-159`); a person's reply through Chanlytics writes it with no `by` (:203-206); a reply typed on Google has no event; each write swallows its failure (`.catch(() => {})`) | nowhere on Reports (read only by the activity feed, `activity.ts:190`). Not purged: 00115's evidence list does not name it [V] |
| A reply held back | event `google.reply_held {review_id, why: price\|money}` (`review-answers.ts:133-139`, `events.ts:64`) | nowhere on Reports (read only to not redraft, :112, and by the feed) |
| Connection state | `google_connections.last_synced_at/sync_error` | computed into `vm.connection.words` (`google.ts:521-529`), **not drawn** (`google.tsx:250` says only the listing's `checked`) |
| Language of a review | `google_reviews.language_code` | not drawable: **null on every profile row** (`profile-sync.ts:105`); on places rows it is the language of the text Places returned for the language asked, "en" by default [I, `google-places.ts:127-129,170-178`] |

Two more facts: `ratingSpark` turns a missing rating into 0 (`google.ts:561`; "absent is never zero"); and `source` says "every review, from your Business Profile" as soon as a location is chosen (`google.ts:530,551`), before the first sync has replaced the five public reviews [V].

### A4. The head sentence's data

`lensAnswerOf("reviews", …)` is `undefined` (`lens-answer.ts:27-28`); the head asks `lensAnswerOf(lens, R)` with `R` the `reports` surface (`head.ts:303-305`), which holds no Google data. A sentence needs the rating, the count, what the period gained and, with the profile, what was written and answered. The page holds the first three, and its "gained" is the count's rise between read days. **The tempting build**, `toGoogleVM(G.dto, days)` read at the head, would say "N new, M answered" from the newest 20 rows: wrong whenever more than 20 exist, blind to the period, and a second derivation beside the lens's figures. The data for the sentence must come from the same read as the lens's figures (C2).

### A5. How the lens boots, and what Ask says

- `reports` is on demand and is read as any `reports` address comes on screen (`routeSurfaceFor("reports", …)` falls to `ROUTE_SURFACE.reports`, `surface-registry.ts:379-396`). `routeDrawsFor` looks up `page`, or the person and Leads routes only (`:225-229`), so a draw cannot be named for one lens.
- Ask: `report` reads `report` and `campaignReport` (`ask/tools/read/report.ts:55-108`) and says nothing of Google. The only Google facts in Ask are "Google connected: yes/no" (`context.ts:205`) and Setup's row, "Name · 4.8 ★ · 213 reviews on Google" (`setup-rows.ts:511`, read by the `connections` action, `read/settings.ts:75`): the same two columns the figures read, through a second reader.

### A6. Empty, failed and edge states today

Reading (nothing drawn); failed (`FailedRead` + Retry, `reviews.tsx:15-17`); nothing linked (the registry words); Places-only (four figures, five reviews, "the five Google shows first", no replies); profile with no review yet ("no review yet"); the gained chart "needs a second day of reading" (`google.tsx:169,184-187`); a listing whose read failed says so in `checked` (`google.ts:337-343`). When the deployment can neither look up nor connect and nothing is linked, `googleReadable` is false and the lens draws the "Find it" empty, a door to something unavailable [V `reviews.tsx:19-23`; unchanged by this lane, F5].

### A7. The doors that still say `reports`

`google.ts:637` (`todayLine.to`), `today/notifications.ts:443` (the `review` kind), `setup/setup-rows.ts:501,513` (Setup's Google row, "Open Reports"), edge `listing-check.ts:129` and `profile-sync.ts:136,154` (the bell's `route`) [V]. Pinned by `google.test.mjs:588,700,735,746,794` (the last a source-text assertion on the edge file), `google-door.test.mjs:933,1532`, `cron-doors-b.test.mjs:1624`.

### A8. Bundle and folders

`bundle-budget.json`: route JS 735,708, ceiling 768,000; page `reports` 78,904 [V]. The brief reports Reports' own JS at 78,911 on main [I, not rebuilt here]. A change is held to +512 bytes without a raise (`docs/debt.md` rows 85-86 show the form). Contracts' browser entry is split by page, so a lens's words ride the Reports route alone (`debt.md:85`).

Module counts (files only, `find -maxdepth 1 -type f`; the ratchet fails at 21, `_measures.mjs:61,297-300`): `surfaces/reports` 13 (+ `lenses/` 7), `contracts/src/reports` 13, `contracts/src/google` 4, `db/src/repositories` **20**, `db/src/repositories/reports` 2, `server/readers` **32** (already baselined at 32, `tree-shape.json`), `tests/reports` **20**, `tests/reports/lenses` 4, `e2e` **20**. `legacy-bridge` is baselined at 34: edit, add no file.

---

## B. Options

**(1) A Reviews read of its own: one bounded repository read, a pure fold in contracts, its own on-demand surface. Recommended.** The lens draws everything it needs from one answer, the head reads the same answer, Ask reads the same reader, a period pick re-reads only this. Failure modes: a second surface to wire (the registry, the refresh map, four test lists); the frame still reads `reports` (F4); a business with more than 250 review updates in the window is undercounted by the sync's own cap, which the fold says when it can see it (C2 rule 4).

**(2) The same, with a SQL function (`report_reviews`).** Matches §6.4 and the Campaigns precedent (`campaign_series`). Failure modes: a migration production needs before the route works (a dashboard ahead of the database answers a 500, so the lens must say "couldn't read", not blank); a db suite that skips without a stack, so the SQL is unproven locally unless a throwaway stack is built; Ruben's word before `db push`. Choose it only if Q1 says so.

**(3) A fourth read inside `reportsOverride.apply`.** The house pattern of campaigns and reach-outs, no new surface. Failure modes: every lens, Today's Retry-all and every message-driven refresh now read Reviews too, the opposite of B2's rule ("a lens loads only what it draws"), for a read most workspaces cannot even use (no profile).

**(4) No new read: build the head and figures from the DTO the page holds.** Cheapest. Failure modes: the 20-row cap makes every count wrong past 20 and blind to the period (A4); raising the cap puts hundreds of rows into a read every page boots; the answered share, time to reply and mix could only say "of the newest 20", never "of the period".

---

## C. Recommendation: (1)

### C1. The one place for each rule

| Rule | Home |
|---|---|
| The window: today in the zone, `since`, `priorSince`, which day a review is on, how far back to read | `reviewsWindowOf`, `reviewsReadSince` in new `packages/contracts/src/reports/review-report.ts` |
| Stars mix, written, answered, time to reply, by whom, weekly bars, waiting, `source`, history known, the minimum of 3 | `toReviewsReportVM(dto, { days })` in the same module (pure); the VM carries `google: GoogleVM` from `toGoogleVM`, unchanged |
| Every sentence the lens, the head and Ask say | `ReviewsReportVM.lines` and the tiles in the same module; the metric words in `report-metrics.ts` |
| The head | `lensAnswerOf("reviews", { …, reviews })` returns `reviews.lines.head` (`lens-answer.ts`) |
| Rating, count, gained, newest, latest, connection words, reply words | the existing `toGoogleVM` (`google.ts`), called once by the new VM; not re-derived |
| Why a reply was held | `reviewHeldWords(why)` in `google/review-reply.ts`, beside `autoReplyHold`; `activity.ts:348-349`'s private table is built from it |
| The reads | `reviewsLedger` in new `packages/db/src/repositories/reports/review-report.ts` (the one place `google_reviews` and the two event kinds are read for a report; `readAllRows` pages it, `paged.ts:49`) |
| Google's DTO | `googleDtoFor(db, tenantId)` extracted from `readGoogle` into `server/connections/google.ts`; the route and the new reader both call it |
| The reader | `reviewsReport` in `server/readers/report.ts` beside `reportDaysFor` (not a 33rd file in `readers/`) |
| The route | `GET /api/v1/reports/reviews?period=`, `read({ scope: workspace, rate: "aggregate", query: ReportQuery })`, as `reports/campaigns/route.ts` |

### C2. The read and the view model

`ReviewsReportDto` (wire, snake_case): `{ timezone, today, days, google: GoogleDto, ledger: { written: [{ id, rating, published_at, has_reply, replied_at }], on_record: { profile, places }, waiting_total, waiting: GoogleReviewDto[] (profile rows with no reply, oldest first, at most 5), replies: [{ review_id, by: "receptionist" | null, at }], held: [{ review_id, why }] } }`. The reader: `today = zoneDayKey(now, zone)`; `googleDtoFor` (as the route calls it); and, only when a listing exists, `reviewsLedger(db, tenantId, reviewsReadSince(today, days))`. The ledger reads profile rows published from one day before `priorSince` (a day wider, so the fold's zone arithmetic decides the edge), the unanswered rows, `google.replied` events since then, and `google.reply_held` events for the waiting ids. `DAYS_KEPT` (92) stays: the 90-day period has no snapshot comparison, said as absent.

Rules (all in `review-report.ts`, each a small function; none over 150 lines or 30 branches):
1. **Window.** `since = shiftKey(today, -(days-1))`, `priorSince = shiftKey(since, -days)`; a review's day is `zoneDayKey(Date.parse(published_at), timezone)`; no date, in neither period.
2. **`source`.** `"profile"` only when the connection has a location **and** `last_synced_at` (the rows are the profile's; `syncProfile` sets it after the upsert, `profile-sync.ts:126-130`); else `"places"`. Fix `toGoogleVM`'s `source` words to the same test (A3).
3. **Profile figures** (over profile rows in the period): `written` (with the prior period's), `stars` (count per 1..5 of rows with a rating; `rated` is the n), `answered` (rows with a reply, of `written`), `replyTime` (median of `replied_at - published_at` over answered rows with both and `>= 0`, by `quantile`; **null under 3 replies**, with its n), `by` (a reply is the receptionist's when the latest `google.replied` event of that review has `by: "receptionist"`; every other reply is the owner's, written here or on Google), `weekly` (writes per Monday-week, `mondayOf`, each week of the period from the first the history covers).
4. **History known.** `knownFrom` is the earliest day the profile rows cover: none (complete) when `on_record.profile >= listing.review_count`, else the oldest stored `published_at` day. `written` is exact only when `knownFrom <= since`, and the prior period is comparable only when `knownFrom <= priorSince`; otherwise the figure is "—" with "history on record starts Sep 20", the prior count and every `compare` built on it are null, and weekly bars before `knownFrom` are not drawn. "None the 30 days before" would be a lie for a history the sync's 250-row window cut.
5. **Places figures:** the existing four tiles, with `compare` set (below); no mix, answered or weekly: the five reviews are Google's relevance sort, not a sample.
6. **Tiles** (`ReportTileVM[]`, one `metric` id each, drawn by `RptFigure`):
   - profile: Rating (`rating`; `compare` = "up from 4.7" / "down from 4.9" / "same as the 30 days before", from the snapshot before the period, null without one), Reviews (`reviews`, no compare), New (`reviews_written`, `compare = compareWords(written, prior, rangeLabel, history known)`), Answered (`reviews_answered`, value "5 of 6", meta "3 by the receptionist, 2 by you"), Time to reply (`review_reply_time`, `fmtSeconds` of the median, or "—" with "2 replies so far; the middle needs 3");
   - places: Rating, Reviews, Gained (`ratings_gained`, `compare = compareWords(total, previous, rangeLabel, previous !== null)`), Newest. `delta` is null for Google's tiles (the percentage the house took out, `report-tiles.ts:127-133`).
7. **Waiting** = `waiting_total` and up to five rows, each `GoogleReviewVM` plus `held: string | null` (`reviewHeldWords`). `latest` in profile mode drops the rows already in `waiting`, so one review is never drawn twice.
8. **`empty`** = no listing. A listing with no reviews is not empty: the sentence says so.

**Metric words** (new ids in `ReportMetric`, `report-tiles.ts:62-78`; `METRIC_WORDS` is a `Record`, so a missing definition is a compile error, `report-metrics.ts:12`): `reviews_written` "Reviews written in this period, with words or without, by the day Google dates them, from your Business Profile. A review Google later removed is not counted."; `reviews_answered` "Of the reviews written in this period, how many have a reply on Google, from you or the receptionist. A review with no reply yet is not answered. A reply counts as the receptionist's where the last reply Chanlytics recorded under the review was its own; every other reply is yours, written here or on Google."; `review_reply_time` "The middle time from a review being written to its reply, over this period's reviews that have one. A reply you changed later counts from the change. It needs three replies to be said." Sixteen definitions become nineteen (`report-metric-words.test.mjs:93-95`).

### C3. The head sentence, one derivation

`lines.head`, built once in `toReviewsReportVM` from the tiles' own numbers (`plural`; the rating as "4.8"), the period said by `rangeLabelOf(days)`:

| State | Head |
|---|---|
| no listing | none (the lens's empty draws; the head is the name alone) |
| listing, no reviews counted | "No reviews on Google yet." |
| profile, `written` > 0 | "4.8 on Google from 213 reviews; 6 new in the last 30 days, 5 answered." (all: "all answered"; none: "none answered yet") |
| profile, `written` = 0 | "4.8 on Google from 213 reviews; none new in the last 30 days." |
| places, gained known | "4.8 on Google from 213 reviews; 6 ratings gained in the last 30 days." (0: "none gained") |
| places, one read only | "4.8 on Google from 213 reviews; what changed needs a second day of reading." |

Under the cards: `lines.mix` "11 of the 14 reviews written in the last 30 days are 4 or 5 stars." (n always); `lines.speed` "5 of 6 answered; the middle reply took 6h." or, under three replies, "2 replies so far."; the weekly card "6 written over 4 weeks". Sentences live in contracts, none on the page.

### C4. What each of the five parts draws, by source

| Part | Profile | Places only |
|---|---|---|
| 1 Sentence | head (C3) | head (C3) |
| 2 Against the period before | New and Rating with their `compare`; weekly bars | Rating and Gained with their `compare`; the day-by-day gained chart (existing) |
| 3 Mix | stars mix, `BarList` (5 rows, one hue, count and share, table twin) | none: one line "Connect your Business Profile to see every review, who answered, and how fast", door to `admin/integrations` |
| 4 Speed | Answered, Time to reply | none |
| 5 Stuck now | "Waiting for a reply (n)" card (rows with the composer, the held note), then Latest | Latest (the five, as today) |

Profile connected but no location chosen (`connection.pending`) or first sync not done: Places mode, plus the connection's own words in the section meta (`vm.connection.words`, now drawn, also for a failed sync) and, for a pending location, a door to `admin/integrations`.

### C5. Kit parts

`Figure` (via `RptFigure`), `ChartCard`, `BarChart`, `BarList`, `EmptyState`, `FailedRead`, `LinkButton`, the composer's `Field` and `Button`: all exist. **No new kit class, no gallery entry, no `kit-primitives` or `style-values` movement**: the layout classes are `rpt-grid`, `rpt-span-5/7/12`, `rpt-figures` (five columns by default, `.four` for places; `reports.css:151-155`), `rp2-review*`. A page rule naming a kit class or a primitive's word is a red build; add none.

### C6. What loads where

| Surface | Boots | Read |
|---|---|---|
| `reports` | on demand, unchanged | every `reports` address |
| `reports_reviews` (new; value `{ dto, vm, period, fetchedAt }`) | `onDemand: true`; `ROUTE_DRAWS["reports/reviews"] = ["reports_reviews"]` | when the Reviews lens comes on screen (never read, kept by a pass, or aged: `isStale` as `headline.ts:70`); held by period (`heldViews`); `view: shownReportPeriod`; a period pick re-reads it only while `reports/reviews` is on screen |
| `google` | today every page; after T8 on demand, drawn at `today` and `admin/integrations` | not drawn by Reports at all |

B2's capability is used three ways: `onDemand`; a draw named in `ROUTE_DRAWS` for one lens (`routeDrawsFor` gains the `${page}/${param}` lookup that `routeSurfaceFor` already has, `surface-registry.ts:379-396`); and `readWhatWasMissed`. For the live refresh, `reports` joins `OWNS_WHAT_IT_DRAWS` (`:257`) so `onlyOnItsPage` hears `google_reviews` and `google_listings` while `reports/reviews` is on screen and not elsewhere. `google_reviews` is told on inserts only (`realtime.ts:42`), so a reply posted from the page must refresh the surface by name: the refresh map's `google` list and the reply verb add it (`refresh-map.ts:78,247`), as does `PATCH workspaces` (the zone moves the window, `:206`).

### C7. What Ask says

Ask's `report` tool loads `reviewsReport` beside `campaignReport` and returns `reviews`: `{ head, tiles: [{label, value, meta, change}], stars, waiting: {count, held} }` from the same `toReviewsReportVM`; `{ linked: false }` with no listing; `{ error: "the review numbers could not be read just now" }` where the read failed, never "no reviews"; no `answered`, `stars` or `waiting` keys in places mode. Its description gains one sentence, which `ask-registry.test.mjs:80-93,314-323` freezes byte for byte (add the replace, as the Campaigns words did).

---

## D. Behaviour

| State of the data | The lens shows | The head says | Ask says |
|---|---|---|---|
| `reports_reviews` unread | nothing | name only | n/a |
| The reviews read failed, nothing held | `FailedRead` "your Google reviews" + Retry (`surface="reports_reviews"`) | name only | `reviews: { error }` |
| Failed, a view held | the held view dimmed, the page's own "couldn't load" row | its old sentence | n/a |
| Deployment cannot look up or connect, nothing linked | the registry empty (unchanged, F5) | name only | `{ linked: false }` |
| Ready, no listing linked | `google-none` card, door "Find it" | name only | `{ linked: false }` |
| Places-only listing, five reviews, no reply data | four figures, gained chart, Latest five, the connect line | places head | tiles, head, no profile keys |
| Profile connected, location pending or first sync not done | as Places-only + connection words, door to Settings | places head | as Places-only |
| Profile synced, no reviews | Rating "—", Reviews "0" (or "—" before a first count), New 0, Answered "—" ("nothing to answer"), no mix | "No reviews on Google yet." | head, tiles |
| Profile, reviews, none replied | Answered "0 of 6", Time to reply "—" ("no replies yet"), the waiting card lists them | "…6 new in the last 30 days, none answered yet." | counts, waiting |
| Profile, reviews, some or all replied | Answered "5 of 6" with who, the median once 3 replies exist, mix, weekly | "…6 new …, 5 answered." | same numbers |
| Profile, a period with no new review | New 0 (a real zero where history is known), mix says "No review written in this period", weekly empty line | "…none new in the last 30 days." | same |
| History does not reach the period or the one before | New "—" or without a comparison, with where the history starts | unchanged or the places-style clause | `change: null` |
| Under 3 replies | median "—" and its count | unchanged | median null |
| Reply held (auto mode named a price or money), still unanswered | the waiting row says "The receptionist wrote a reply and held it: it named a price." | unchanged | `held: n` |
| Listing check failing | last stored figures, section meta "Google could not be read since 2d ago" | unchanged | unchanged |
| Profile sync failing | last stored figures, meta "could not sync since 2d ago" (the connection's words) | unchanged | unchanged |
| Viewer role | everything but the composer (`canDo("approve")`, `google.tsx:230`) | same | same |
| Demo session | nothing, as today (no sample; F6) | name only | n/a |

---

## E. Tasks (each one commit, the tree green after it; contracts, then db, then server, then surfaces, then tests and e2e)

Common to every task: new files `git add`ed before any ratchet runs; top-level names distinctive (no helper declared in three files); no `as unknown as`, `x!`, bare duration numbers (`DAY_MS`), `arr[0]` the compiler lets pass (use `.at(0)` or a default); format; rebuild `packages/*/dist` after any `packages/*/src` change and commit it. Run one test file per command. Report dead exports and tree-shape if they rise; never raise them.

**T1. Contracts: the fold, the words, the head.** Files: new `packages/contracts/src/reports/review-report.ts` (DTO, VM, `ReviewWaitingVM`, `toReviewsReportVM`, the window helpers); `reports/index.ts` (named exports); `report-tiles.ts` (3 ids); `report-metrics.ts` (3 definitions); `lens-answer.ts` (the `reviews` part, optional so `lensAnswerOf(lens, R)` still compiles); `google/google.ts` (`source` by C2.2, `compare` on the rating, gained and reviews tiles, `delta: null`, `ratingSpark` without the 0); `google/review-reply.ts` (`reviewHeldWords`); `workspace/activity.ts:348-349` (built from it); `browser.generated.ts` and the dists. Behaviour: C2, C3 and C2's words. Tests (new `tests/reports/lenses/review-report.test.mjs`, executing the real functions over rows): every row of D that is about the VM (profile and places crossed with no review, none replied, some replied, zero in the period, history short, held, 2 versus 3 replies, a review at the zone's day edge, a null date, a null rating), the sentences character for character, `source` before and after the first sync. Pins to update: `google/google.test.mjs` (tiles, :573), `google/google-profile.test.mjs:567,605`, `google/review-reply.test.mjs`, `reports/lenses/report-metric-words.test.mjs:93-95,148-157`, `reports/lenses/report-lenses.test.mjs`, `workspace/activity.test.mjs:744-748`, `repo/contracts-barrels.test.mjs`, `shipping/browser-entry.test.mjs`, folder `types`. Counts: `contracts/src/reports` 13 to 14. `google.ts` is 661 lines: it may not pass 800; the fold is the new file. Done: those files pass.

**T2. Db: one bounded read.** `packages/db/src/repositories/reports/review-report.ts` (that folder goes 2 to 3; `repositories/` itself is at 20 and takes nothing): `reviewsLedger(db, tenantId, sinceIso)` returning C2's `ledger`, `readAllRows` for the profile rows ordered by `id`, typed selects (the tables are in `database.types.ts`), a failed read throws; exported from `packages/db/src/index.ts` beside `reportSeries`. Tests: extend `tests/reports/report-repository.test.mjs` (that folder is at 20 files, so no new file) over `_fake-db.mjs`: another workspace's rows and a `places` row never in `written`; events of other kinds ignored; a failed read throws; more than 1000 rows page. Done: passes; `tables.json` does not rise (every table name is inside `packages/db`).

**T3. Server: the reader, the route, the one Google DTO.** `server/connections/google.ts` (`googleDtoFor`), `google-actions.ts` (`readGoogle` calls it, the same answer byte for byte), `readers/report.ts` (`reviewsReport`, name `"reviewsReport"`, `rows: [{ kind: "page", id: "reports", route: lensRoute("reviews"), label: "Reviews, 30 days" }]`), `app/api/v1/reports/reviews/route.ts`, `route-policy.json` (a `GET reports/reviews` row like `GET reports/campaigns`, :1239), then `node tooling/scripts/gen/route-types.mjs` and `corepack pnpm gen:api-reference`. Tests: `ask/readers.test.mjs` and `ask/ask-routes.test.mjs` gain a case (the route answers its reader's payload byte for byte, as :1591-1610 do for `reports`); `reports/periods/report-routes.test.mjs` (Month); `google/google-door.test.mjs` (`GET google` unchanged); the route-policy and api-doc tests. Done: pass; `routes.generated.ts`, `route-keys.generated.ts`, `docs/api.md` regenerated and committed.

**T4. Ask says the number the page shows.** `ask/tools/read/report.ts` (C7). Pins: `ask/ask-registry.test.mjs` (one more `.replace` over the frozen description; the schema bytes do not move), `ask/ask-turn.test.mjs:923-1023` (a `reviews` case beside the campaigns one: linked, unlinked, failed), `ask/ask-tool-names.test.mjs`; the fixture `fixtures/ask-tools-4-7.json` is not edited. Done: pass.

**T5. The surface.** New `surfaces/reports/reviews-surface.ts` (13 to 14 files): `reviewsOverride` (`key: "reports_reviews"`, `value`, `onDemand`, `isStale`, `view`, `events: ["surface:reports_reviews"]`, `refreshOnTables` with `refreshWhen: onlyOnItsPage`; `apply` reads `GET reports/reviews` for the shown period, builds `{ dto, vm }`, drops an answer for a period left, as `headline.ts:379-388`), `paintHeldReviews`; `surface-values.ts` (the type and `SURFACE_KEYS`, :146); `LegacyApp.tsx` (the list, :162-175); `surface-registry.ts` (`ROUTE_DRAWS["reports/reviews"]`, the `routeDrawsFor` lookup, `OWNS_WHAT_IT_DRAWS`); `refresh-map.ts` (C6's three entries); `reports/period.ts` (a pick refreshes it only while `reports/reviews` is on screen). Pins: `reports/headline/on-demand-boot.test.mjs` (add `reports_reviews` to its world: read where drawn and nowhere else), `shell/surfaces/surface-boot.test.mjs:495-540`, `message-fan-out.test.mjs`, `surface-registry.test.mjs`, `refresh-coverage.test.mjs`, `read-cache.test.mjs`, `zone-remembered.test.mjs`, the stub's list `_legacy-react.mjs:111-123`. Done: pass; no surface but `reports/reviews` reads it.

**T6. The page.** `lenses/reviews.tsx` draws from `useSurface("reports_reviews")` alone (reading, failed, empty via `googleReadable(dto.google)`, body as C4; its body is wrapped in `data-loading`/`data-dims` while its period is not `R.period`); `google.tsx` keeps `ReviewReply`, `reviewRow` (gains the held note), `latestCard`, and gains `starsCard` (testid `chart-reviews-stars`), `weeklyCard` (`chart-reviews-weekly`, `RPT_WRITTEN`), `waitingCard` (`reviews-waiting`) and the section meta of C4; the figures keep testid `google-tiles`; `head.ts` reads `useSurface("reports_reviews")` and passes `reviews` to `lensAnswerOf`. `googleReadable` takes a `GoogleDto`. Pins: `reports/lenses/reports-lens-page.test.mjs` (`BODIES.reviews`, :74; "Reviews says nothing of itself", :118; the unread, failed and unlinked tests, :133-190; `draw` also sets the new surface), `reports/reports-page.test.mjs:732-836`, `reports/lenses/report-metric-words.test.mjs:148-157`. Counts: `surfaces/reports` stays 14. Done: pass; `corepack pnpm lint` clean (a raw control or an inline `style` is a red build).

**T7. The doors.** `google.ts:637`, `notifications.ts:443`, `setup-rows.ts:501,513` and the edge's three `route`s read `lensRoute("reviews")` (edge: import it through `../packages/contracts.js`, as `profile-sync.ts:9` does for `autoReplyBell` [I: the facade re-exports contracts]). Pins: `google/google.test.mjs:588,700,735,746` and the source-text assertion at :794 (replace it with the executed door assertion, which banks a fall in `source-scan-baseline.json`), `google-door.test.mjs:933,1532`, `cron/cron-doors-b.test.mjs:1624`, `setup/setup.test.mjs`. Done: pass; edge and dashboard deploy in either order.

**T8. Google on demand (Q2).** `googleOverride` gains `onDemand: true`; `ROUTE_DRAWS` keeps `today` (:180) and gains `admin/integrations: ["google"]` (the Settings pane, `pane.tsx:223`); the `refresh-map` entries stay (a named refresh is still made). Pins: `on-demand-boot.test.mjs` (a Google row: read on `today`, not on `inbox`), `surface-boot.test.mjs`, `message-fan-out.test.mjs`, `e2e/settings/settings-integrations.spec.ts`. Done: pass; the commit reverts alone.

**T9. e2e, budget, spec.** `e2e/google.spec.ts:70-81` still visits the Overview (`/#/reports`) for `google-none` and `google-tiles`, which have been drawn on `/#/reports/reviews` since #1424: visit that address, expect 4 figures with a places source and 5 with a profile source, and allow the new values ("5 of 6", `fmtSeconds` words) in the value pattern; `e2e/reports.spec.ts` gains a Reviews address (`/w/<slug>/reports/reviews` loads on its own, `lens-reviews` is `aria-current`, a pick does not request a page). Both are existing files (`e2e/` is at 20). Bundle: build the dashboard, run `corepack pnpm check:bundle`, then `-- --raise js=<bytes> reports=<bytes>` by the growth CI prints, with its row under "Rises" in `docs/debt.md`; expect a few KB on the page (the surface, three cards) and about 2 KB of contracts on the route [I]. Amend the spec: §6.2's Reviews row (shown always, periods), §9's Reviews rows (languages struck; "receptionist vs you" as C2 defines it; `google_insight_days` does not exist). Done: the PR's Reports row in the job summary is inside its budget.

Ratchets that could move: dead exports (export only what non-test code imports: `reviewsReport`, `toReviewsReportVM`, `reviewsLedger`, `reviewHeldWords`), `tables.json` (no rise: every new table name is in `packages/db`; `connections/google.ts` stays at 5), `tree-shape.json` (no rise by the counts in A8), file-length (`google.ts`, `reports.ts` do not grow past 800), complexity (small functions), `copies.json`, `casts.json`, `unchecked-index.json`, `durations.json`, `wire-casing.json` (the DTO is snake_case), bundle (raise, T9), `source-scan-baseline.json` (falls in T7), `kit-primitives.json` and `style-values.json` (no movement), `lint-warnings.json`.

---

## F. Risks and the §18 questions

**F1. The head and the figures must agree.** Both read `ReviewsReportVM` (C3); a second derivation in the page or in Ask is the failure. `toGoogleVM`'s `todayLine` and tiles stay the single source for Today and the listing figures.

**F2. Review requests (§18.2). Recommend: not in this lane; default: not built.** It needs phase E (the trigger is "a day after a kept visit"), a message with Google's review link (`google_listings.place_id` is stored), a consent decision (an ask is marketing-shaped on WhatsApp), and it cannot be measured honestly: Google's reviews carry a display name, not a contact, so "asked → reviewed" is at best "asked N, the count rose by M the week after", a correlation and never an attribution. When built: every client who attended and said yes to messages, never filtered by how the visit went (review gating is against Google's rules [I]), one ask per person per period, and the lens says "asked N people" beside "gained M" without joining them.

**F3. Competitors near you (§18.4). Recommend: do not build; default: not built.** There is no stored data (no table, no capture). Reading other businesses' listings daily needs a Places read per competitor per day and a history table; Google's Places terms limit how long another business's content may be stored [I; check before any build]. If asked for later: at most three the owner names, read weekly, rating and count only, drawn as figures with no review text.

**F4. The frame still reads `reports` for this lens (A1.3).** `ReportsPage` needs `R` for the period picker (`R.vm.today`, `timezone`) and the head. A lens that reads nothing else needs the picker's window from its own read; that is the closing change of phase C, once each lens has its own surface, and it removes three reads from Reviews then. Until then Reviews costs what every lens costs plus one small read.

**F5. "Find it" where nothing can be found.** With neither door open on a deployment, the lens draws a door to nothing (A6). Left as is; one registry empty for "not available here" is a small follow-up, not this lens.

**F6. No demo sample.** The demo session draws nothing on Reviews today and after (`sample.ts` has no Google); the spec's §6.10 sample for this lens is owed, as the Campaigns lens's is.

**F7. The sync's window.** A business with more than 250 review updates since its profile connected loses nothing already stored, but history older than the sync's reach is never fetched: C2 rule 4 says so for the figures it touches, and the mix and counts are "of the reviews on record" with `on_record` beside the listing's count whenever they differ.

**F8. Replies: who.** `google.replied`'s write is best-effort (`review-answers.ts:159,206`), so a receptionist reply whose event failed counts as the owner's; the definition says "the last reply Chanlytics recorded", and the figure says so.

**F9. The mismatch moment.** After a period pick, `reports` and `reports_reviews` land separately; the lens dims itself while its period differs (T6) and its head names its own period, so no frame says two periods.

**F10. Latency and the edge call.** `googleDtoFor` calls `googleReadiness()`, which asks the edge on a cold cache (4 s timeout, cached 5 minutes per instance, `connections/google.ts:145-175`); the route pays it as `GET google` already does, and Ask's read of it is wrapped in `.catch(() => null)` like the campaigns read, so a slow edge costs the `reviews` block and not the turn.

**F11. Deploy and production.** No migration. Dashboard and edge deploy in either order (a dashboard ahead of the edge reads the same tables; an edge ahead only writes a different `route` string). Nothing to set. `google_reviews`, `google_listing_days` and `events` are read under the member's session (RLS).
