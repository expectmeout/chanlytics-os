# A moment holds many campaigns: design spec

**Status:** Approved 9 October 2026 by Ruben ("approved as you suggest best lets get it done end to end locally and
then will push as one pr after i approve and review"), as recommended by the report
`Claude Video/reports/Campaigns ledger backend and Ask flow.md` (57 corrections, 49 decisions), to be built end to
end on one local branch and pushed as one pull request after Ruben's review; nothing built yet. Branch
`campaigns/a-moment-holds-many`, worktree `cm-campaigns-2`, from `origin/main` at `d1bb65961` (#1523), fast-forwarded
to `7ff179717` (#1525, Ask's voice and Today's brief only; it raised the route JS budget to 766,137, so the room is
1,863 bytes, not the 2,361 cited below). Every
correction is folded in and every decision takes the recommended answer; the three left open take the conservative
default, and one recommendation is overridden by his word: one pull request, not four (§9). #1523 merged after the
readings below: it moved the pools to `srv/campaigns/playbook-pools.ts`, made `srv/readers/playbooks.ts` start the
pools' reads with the page's, and took migration 00359 (applied to production on 9 October), so the line numbers cited
for those two files are `ba00408e5`'s and the code wins; every other citation stands.

Written after his pick of option A ("Ledger") on the canvas of the same day
(https://claude.ai/artifact/6x1Px7rBxme97CifWRsv1V) and his ask to rewire the backend "with the best … patterns no
matter how advanced or complex the refactor is if it is optimal". Read on `ba00408e5` with four read-only explorations
(the view model and its tests, the readers and tables, the surface, kit and budgets, the core verbs), then corrected
by the report's five notes (`Claude Video/research_notes/Campaigns ledger backend and Ask flow/`). Every file:line was
read on that commit; the code wins where they disagree; nothing was run, so a figure not from a baseline file is an
estimate. `ct/` is `packages/contracts/src/`, `srv/` `apps/dashboard/src/server/`, `cmp/`
`apps/dashboard/src/surfaces/campaigns/`, `home/` `cmp/home/`, `kit/` `apps/dashboard/src/surfaces/kit/`; Dn is
decision n of §9. The page's word is **campaign** (`lifecycle.ts:377`; the 8 Oct spec), never the canvas's "sequence".

## 1. Goal

An owner with many campaigns (several playbooks on one moment, playbooks on lists, the month's offer, reach-out
chains, one-off sends) opens Campaigns and can, without opening anything:

1. see every campaign in one place, grouped by moment in the journey's order, with its last 30 days and next run;
2. find one by name, or narrow to the ones that need them, the paused, or one moment, in one press or one key;
3. act where it stands: approve or skip a run that waits, resume a paused one, open any;
4. set campaigns going, or change one, through Ask, where a sentence replaces a form and nothing sends at Approve.

A workspace with one playbook per moment keeps the page it has: the rail as today, a short ledger, no tools under
seven rows. Every number is one predicate, read once, and no other page pays for Campaigns' reads.

## 2. What the product does today (measured)

- **One playbook per moment; the rest are strips** with no number, search, filter, sort or group (`playbookOf`,
  `ct/playbooks/lifecycle.ts:135-141`; `lifecycleStrips`, `:381-400`; `home/rail.tsx:105-125, 241-283`); nineteen
  campaigns push the tiles below a 1440×900 fold. Only the picture limits a moment to one: no unique
  `(tenant_id, trigger)` but the follow-up's (00167), no refusal in the composer (`composer-model.ts:391-393`), two
  win-backs over one person (`tests/cron/cron-playbooks-door.test.mjs:609`).
- **The numbers exist:** `campaign_series` answers `sources[]` per `coalesce(playbook_id, broadcast_id)`
  (`supabase/schema.sql:908-1066`, 00329), typed and dropped (`reports/campaign-report.ts:134`;
  `broadcasts/surface.ts:169, 211-220, 280`); `reach_out_report` answers at most twenty chains (00241);
  `lifecycleComing` (`lifecycle-tiles.ts:331`) holds every running playbook's next run (`momentRow`, `:199-229`).
- **P0, the floors fixed first.** (1) Two definitions of a person's own words: TypeScript excludes a booking tool's
  notice (`ct/conversations/message-author.ts:39-52`, since #1469), SQL counts it (`schema.sql:8747-8752`), the
  parity test's list has neither it nor `forwarding_confirmation` (`campaign-channels.db.test.mjs:413-450`), and the
  claims are declared twice (`packages/channels/src/email/intake.ts:179`;
  `packages/core/src/messages/email-ingest.ts:38`). (2) `listRuns` is unpaged (`srv/campaigns/broadcasts.ts:375-384`):
  PostgREST keeps the newest 1,000 runs (`supabase/config.toml:18`), shared with reach-out step runs then discarded
  (`srv/campaigns/playbooks.ts:573-642`), and each 200-run chunk is cut again at 20,000 rows, in sequence
  (`broadcasts.ts:34, 148-179, 307-326`): about 150 round trips at 3,600 runs for short totals, on every page's boot
  (`legacy-bridge/LegacyApp.tsx:155-181`). (3) `reach_out_report` takes 7, 30 or 90 days (`schema.sql:15544-15546`),
  so Reports' "This month so far" answers 422 (`srv/readers/report.ts:171-177`; `srv/campaigns/reach-outs.ts:73-87`).
  (4) Calendar-less appointment moments are offered (`ct/playbooks/playbook-triggers.ts:238-244`), show a 0 nobody
  counted (`srv/calendar/people-visits.ts:70-77`), start a playbook that skips daily
  (`packages/core/src/campaigns/run-playbook.ts:127-130`) and count as covered (`lifecycle.ts:191, 224-237`).
  (5) The draft put the appointment word in `tenant_config.config.brain`, parsed on every message, where a strict
  closed set silences the receptionist (`ct/config/workspace-config/config-schema.ts:65-79`; decision 0008,
  `:51-60`). (6) A new workspace has no starter on file, so Ask's playbook card refuses
  (`srv/ask/tools/act/playbook.ts:140-153`; `cmp/playbooks/composer-acts.ts:51-57`).
- **P1, the seams.** `GET templates?all=1` scans all history on every boot (`srv/readers/templates.ts:34-45,
  86-145`); each message on Campaigns re-reads every page of People (`broadcasts/surface.ts:262-266`). The 72 hours
  are written twice (`ct/broadcasts/run-words.ts:13`; `schema.sql:964`), apart from WhatsApp's window
  (`ct/config/policy.ts:287-296`); Sent's `withCounts` would sit beside SQL; "held" means four things, one in the
  glossary (`docs/glossary.md:60`); a chain's "wrote back" is any inbound ever (`schema.sql:15554-15675`). Both
  reach-out GETs skip the readers; `PUT playbooks/[id]` declares no input, counts keys, fills defaults and pauses in
  two uncounted writes (`srv/campaigns/playbook-row.ts:78-146`; `packages/core/src/campaigns/check-playbook.ts:64-70`;
  `packages/db/src/repositories/control-plane.ts:262-284`); `playbooks` is off the realtime topic and the reach-outs
  surface hears nothing (`schema.sql:26507-26962`; `cmp/reach-out/surface.ts:107-121`). A waiting run has five doors,
  three spellings of Approve and two of Skip; one name opens two rooms (`lifecycle-tiles.ts:212, 274`); Ask's new
  campaign opens the home (`ct/ask-proposals/campaigns.ts:110-119`); one-offs appear nowhere
  (`home/new-message.tsx:52-66`); Delete leaves a "gone" sheet (`home/drawer.tsx:59-66`); paused is amber
  (`ct/shell/tone.ts:125, 165`). Ask cannot pause, resume, rename or retime; only the eval catches a claimed write;
  setup reads are skipped before round 1 (`srv/ask/cross-page.ts:86-94`; `srv/ask/loop.ts:386-388`); nothing refuses
  a duplicate; the shape goes stale and runs the fold (`srv/readers/shape.ts:36-66`); the `campaigns` read says
  all-time numbers (`srv/ask/tools/read/campaigns.ts:307-334`), its tool words frozen (`fixtures/ask-tools-4-7.json`).
- **Budgets and pins.** Route JS 765,639 of 768,000 (2,361 bytes of room; 766,137 and 1,863 after #1525), the page's JS 204,372 of 262,144, route
  CSS 151,340 of 163,840 (`baselines/bundle-budget.json`); `cmp/home/` holds 13 of 20 modules, contracts' `playbooks/`
  15, `srv/readers` its 32. Strips are pinned by `lifecycle.test.mjs` (L442-499), `channels-on-the-home`,
  `moments-offered`, `campaigns-home`, `playbook-composer:487`, `reach-out-rows:364-413`, `reports-honest:283`,
  `runs-honest`, `e2e/shell/phone.spec.ts:306-345` and `e2e/campaigns/playbooks.spec.ts:51-52, 207-268`.

## 3. Decisions

1. **Evolve, never replace.** The rail keeps its moments, nodes, figures, caps, needs, channel marks and Glass; what
   changes is what a card says of its campaigns, the moments' order (11) and what stands under the rail.
2. **A moment is a group, and a group holds many.** A card summarises its group ("Visit reminder · daily 9:00 AM";
   "3 campaigns · 2 on · 1 paused"); its body narrows the ledger, its name opens the drawer (D12). Groups run in the
   journey's order, then Lists & offers, Reach-outs and one-off sends (D17); an empty moment keeps Turn on (D16).
3. **One word: campaign** wherever a person reads, "playbook" nowhere (D19), never "sequence"; per the glossary's
   Campaigns row, the receptionist and the call's text are First contact's rows of their own kind, never counted.
4. **Every number is one the database counts, read once, on Campaigns alone:** last 30 days from
   `campaign_series.sources` and a per-chain aggregate (D38); People now, the card's pool; Next, `nextRunLabel`; "—"
   where uncounted, "Nothing sent" where counted and nothing went.
5. **No switch on a row (kept, D10;** Ruben, 22 Sep: indicators, not controls, in a list): Approve and Skip where a
   run waits, or Resume asked in place with when, to how many and an `auto` class in full (D7).
6. **"Needs you" is a tab (kept, D10), and the one amber:** the status `SubTabs`' warn tab; paused rests in the plain
   tone (D13), so amber means "Waiting on you" or an archived list.
7. **The group lives in the address, kept under sheets (D11):** `campaigns/in:<group>`, replaced, never pushed;
   status, search, sort and grouping are page state, reset on reload.
8. **The desk sorts, the phone groups:** Next (waiting first, then soonest, paused last), Name, People now, Replied;
   a phone keeps the groups, sorts by Next, holds one choice and takes no swipe (D16).
9. **Campaigns reads its own numbers:** `reach-outs` joins the head's reads; both 30-day reports move to an
   on-demand surface drawn by Campaigns alone.
10. **The backend first, its own commit group, with `run_counts` and `template_sends` (D36):** SQL replaces the
    TypeScript fold, Sent's counts and Settings' scan; `GET playbooks` keeps its shape byte for byte; no table changes.
11. **The journey follows the business, derived now, stored later (4.8):** Proposal waiting before Quiet (D45),
    word-free ids (D46), the derived appointment word (D40, D42), "Needs your calendar" (D44).
12. **Ask on the page as on Leads, once the starters work (4.9):** a door beside Turn on (D21), its words and chips,
    rows and view as context, a change card through one typed, recorded write (D26), Opens that land.
13. **Out, on purpose:** archiving; tags and folders; a channel filter; views B and C; a kit table; a free-form
    builder; a renewal stage and `deals.renews_on` (D49); "class" (D41); the consent label's rename (D6); Edit as the
    drawer's state (D20); a plan card before evals show stalls (D28); a journey action on Ask before J4.
14. **The floors first (D1):** a person's own words and a reach-out report's period say one thing each (4.0).
15. **One landing rule (4.6):** a door opens what it names: a campaign's drawer, a run, a thing just made (marked).
16. **One decision per run per screen (D14):** Approve and Skip on the row; Coming up, the time and "Waiting on you".
17. **People's list keys (D18):** `/`, J/K or the arrows, Enter, Escape; focus returns to the row it left.
18. **Seven rows before tools (D15):** under seven, no tool line, tabs, heads, phone strip or search; a judgment.
19. **One word per act (D19):** "Approve · 7 people" and "Skip" everywhere; "Needs you" names its unit (campaigns).
20. **Ask where a sentence replaces a form and nothing sends at Approve (D24, D27):** setup, changes, lists; a
    message's words, deals-on, the appointment word and reminders keep their forms (D29, D30); one press covers
    steps that send nothing, and a sending step has its own.
21. **AG-UI not now; Ask kept AG-UI-shaped (D4, D34):** its client is 65,096 bytes gzipped against 2,361 of room, and
    its shared state and frontend tools reverse two written rules (ids re-read on the server; every act a card); new
    lines take its step, plan and interrupt names, and a server-side translation is the way back.

## 4. Design

### 4.0 The floors

- `EMAIL_CLAIMS`, declared once in contracts beside `message-author.ts`, marks each claim a person's words or not;
  `booking_notice` and `forwarding_confirmation` are not (D5). Channels' `email/intake.ts:179`, core's
  `email-ingest.ts:38` and `NOT_A_PERSONS_CLAIMS` read it, and the parity test iterates it.
- A migration replaces `message_is_a_persons_words` (`language sql immutable`, `set search_path = ''`; no index reads
  it) with the same list: Reports' replies and People's "last wrote" stop counting both claims.
- A migration replaces `reach_out_report` with its latest body and `p_days between 1 and 90`, as `campaign_series`
  clamps (`schema.sql:914`); `reports/reach-out-month.db.test.mjs` asks for the month.

### 4.1 The view model and its files

- **Files.** The four `lifecycle*` modules (1,664 lines) move, alone in a commit, to `ct/playbooks/lifecycle/` with no
  barrel, as `config/workspace-config/` (a nested one fails `repo/contracts-barrels.test.mjs:1-160`);
  `lifecycle-ledger.ts` joins them; the journey earns `ct/journey/`; page files go in `home/ledger/` (`ledger.tsx`,
  `ledger-row.tsx`, `ledger-phone.tsx`, `use-ledger-view.ts`) and `home/results-surface.ts`.
- **Glossary first** (`docs/naming.md`): the senses of "held" (a run's people skipped or failed, the wire's `held`;
  the people a moment holds back for the week's breath, the follow-up's `held` too; a reach-out email the check
  stopped); Campaign (decision 3); the campaign reply window, apart from `replyWindow`; Journey; Appointment word.
- `LifecycleHome` gains `ledger` and loses `strips`, `lifecycleStrips`, `alsoRunning` and the strip kickers (knip
  banks the fall); `lifecycleKicker` reads the groups.

  ```ts
  interface LifecycleLedger {
    groups: readonly LifecycleGroup[]; // the journey's stages in order, then lists, reach_out, sent_once
    counts: { all: number; running: number; needs: number; paused: number }; // campaigns only
    tools: boolean; sentOnce: { n: number; open: LifecycleAct } | null; // rows >= 7; else the one-off footer
    period: string; results: LifecycleTileRead; words: LedgerWords; // "Last 30 days"; "—" while unread or failed
  }
  interface LifecycleGroup {
    id: JourneyStageId | "lists" | "reach_out" | "sent_once"; // word-free: campaigns/in:before
    caps: string; glyph: LifecycleGlyph; meta: string; rows: readonly LifecycleRow[];
    add: LifecycleAct | null; // Turn on; "Find businesses to write to"; none on Proposal waiting while one exists
  }
  interface LifecycleRow {
    id: string; kind: "receptionist" | "call_text" | "playbook" | "list" | "offer" | "chain" | "sent_once";
    name: string; hint: string; status: "always" | "on" | "waiting" | "paused" | "not_here" | "off";
    stateWords: string; phoneWords: string; tone: LifecycleTone; needs: LifecycleNeeds; needsWords: string;
    channels: readonly LifecycleChannelMark[]; people: { n: number | null; unit: string };
    results: { kind: "sent"; sent: number; replied: number } | { kind: "written"; written: number; wroteBack: number }
      | "none" | "uncounted"; // campaign_series, or a chain in Reports' words
    next: { words: string; atMs: number | null }; // waiting = now, paused = null
    open: LifecycleAct | null; waiting: LifecycleWaiting | null; act: LifecycleAct | null; search: string;
  }
  ```

- `open` is an `href` door (the drawer, the Library, a one-off's run in Sent); `waiting` carries Coming up's shape
  and acts; `act` is Resume, asked in place, or Turn on. One builder per row kind, a sort key and the counts, each
  under 30 branches and 150 lines. `LifecycleStage.playbookId` is the group's lead (running first, else newest), with
  `summary` and `bar`; covered is "on and countable". `LifecyclePlaybook` gains `candidates`, `named`, `next`;
  `LifecycleReport` comes from the results surface with `sources`; `LifecycleInput` gains `chains` (by `root_id`;
  absent is "—") and `shape: { calendar; dealsOn; word }`. Coming up's waiting line keeps its time, without acts.
- Words: `LIFECYCLE_WORDS.ledger`; `LIFECYCLE_TOAST.paused`; a paused playbook's tone plain (`ct/shell/tone.ts:165`;
  `lifecycle-words.ts:237-239`); `CAMPAIGNS_RESULTS_PERIOD = "30d"`, read by `PREFETCH_READS`, the results surface
  and `RESULTS_DAYS`.

### 4.2 The rail (desk)

- A card keeps its caps, figure, unit, node, marks and needs. Its caps, figure and summary are one toggle
  (`Button variant="quiet"`, `aria-pressed`) that sets or lets go of `in:<group>`; the lead's name (`cmh-open`, the
  drawer) and Turn on are siblings, never inside it (`kit/press.tsx:10-27`); the chosen card wears the chosen state.
- A `Meter size="sm"` (on `ok`, waiting `warn`, paused `rest`) only where a moment holds two or more, unanimated
  (`kit/kit.css:2934-2963`). A paused moment's card offers Resume; a playbook that runs nothing here opens its drawer.
- Turn on keeps its hint and opens "Turn on Visit reminder" with no kind switch (`home/new-message.tsx:105-122`); the
  composer's calendar and number sentences become doors (`cmp/playbooks/composer-sections.tsx:190-194`;
  `composer.tsx:104-118`), and it says "Visit reminder · On" where a moment already holds a campaign (D20).
- Figures go from 34px to 28px and the pad from 16px to 12px (about 170px tall at 1440); between 901 and 1100px the
  rail keeps one line and scrolls (J3), where today it stands down a line (`e2e/campaigns/playbooks.spec.ts:202-206`).

### 4.3 The ledger (desk)

- In the rail's `Panel`: past seven rows a sticky tool line, then the groups. The tool line holds `Field
  type="search"` ("Search 19 campaigns"), the status `SubTabs` (none at zero but All, as Sent's band,
  `cmp/broadcasts/ledger.tsx:185-187`), "Showing 7 of 19" ("Visit tomorrow · showing 3 of 19 · Clear" with a card
  chosen) and Sort and Group `Menu`s with `choose`. Heads once, in caps: Campaign · Goes by · People now · Last 30
  days · Next · (acts), the sorted one in the chosen ink. A group's head (glyph in a 22px ring, caps, meta, `add` as a
  quiet `Button`) sticks under the tool line; under All an empty moment draws with Turn on, under a filter not at all.
- A row (`cmh-row`, `data-row`, `data-kind`, `data-state`): dot, name and hint; `ChannelMarks`; people in `.tabular`;
  "212 sent · 48 replied" or "40 written · 6 wrote back", "Nothing sent" or "—" dim; next in words, warn where it
  waits, plain where paused; the act: `WaitingActs` ("Approve · 7 people", "Skip" with its `Confirm`), or Resume with
  its `Confirm` ("Resume Win-back?" · "Next run today 9:00 AM, about 25 people", the mode in full under `auto`). A
  chain's run opens its page. The whole row opens, as Sent's do (`cmp/broadcasts/ledger.tsx:482-553`), its name an
  `href` door, so a middle-click opens a tab; 44px, hairline-divided, no zebra.
- `.cmh-ledger { display: grid; grid-template-columns: minmax(260px, 1.7fr) 150px 96px 190px 168px 112px }`, subgrid
  rows as Sent's `.bc-runs` (`campaigns.css:1692-1738`; `_css.mjs:61-125` counts no `cmh-` class); Goes by and People
  fold into the name under `@container cmh (max-width: 1000px)`.
- One-off sends: under the threshold a footer, "Sent once · last 30 days · 3", a door to Sent; past it a group from
  `sources` of kind broadcast, each row opening its run, counted under All, so the rows add up to What came back.
  Reach-outs' `add` is "Find businesses to write to" (`cmp/reach-out/door.tsx:41-79`); the call's text is drawn as a
  door to the Library; Coming up's door is Sent's week (`cmp/broadcasts/ledger.tsx:255-357`).
- Keys: `/` searches, J/K or the arrows move a cursor, Enter opens, Tab reaches the acts, Escape clears the search,
  then the filter; never while typing or behind a sheet (`apps/dashboard/src/surfaces/people/hooks/keyboard.ts:1-7,
  93-125`). A closed sheet returns focus to `[data-row="<id>"] [data-row-open]`; an in-row act leaves it on the name.
- Motion: a filter is `useSwapMotion(status + "|" + group, ".cmh-group")` (`kit/motion/use-swap-motion.ts:1-12`);
  typing moves nothing; a decided or saved row keeps its place and settles once (`kit/kit.css:1393-1398`); an arrival
  is scrolled to and washed once (`kit/kit.css:1688-1704`); no `useRowsArrive`, no Meter motion; reduced motion stops
  all. A row's state changes in place; a toast carries counts, times, refusals and what left; Delete and Remove close
  the sheet, then toast. `EmptyState kind="line"` says "No campaigns match", with Clear; a failed read keeps its place
  (`HomeFailed` for the call's text and the chains, "—" in the results, one line in the tool line).

### 4.4 The phone (≤900px)

- One meta line ("3 of 4 on · 41 of 60 can hear you"); the channels line only when one is closed
  (`home/tiles.tsx:165-193`). The journey's line is the list's spine (D16): each group head is its moment's node
  (glyph ring, caps, figure, state), an empty one carrying Turn on; Lists & offers, Reach-outs and one-offs follow
  off the line. phone.spec's pinned stages become "heads on the line, rows under them".
- Past seven rows, a sticky `SubTabs dense` strip (All · Needs you · the moments · Lists · Reach-outs, a chip only
  above zero) and a search circle (People's bar). One choice: a group chip replaces `in:<group>` and clears the
  status, "Needs you" clears `in:`, All both; no page swipe (`e2e/shell/phone.spec.ts:1079-1085`); sort stays Next.
- A row is a `ListRow` wearing the kind as a mark, never a face (`kit/face/face.tsx:2-3`), through a `mark` variant
  with its gallery entry: name, `StatePill`, "Visit tomorrow · today 9:00 AM · 7 people", dots and results; the
  drawer's door at 44px, `WaitingActs` under a waiting row, Resume at a paused row's end; the drawer's docked foot
  holds Pause or Resume when nothing waits (`card-detail.tsx:561-572, 693-702`; `cmp/parts/split.tsx:2-6`).

### 4.5 The reads

- `home/results-surface.ts` (`campaign_results`, `onDemand` as `reports/period-surface.ts` is) reads both 30-day
  reports, each failure alone; the broadcasts surface drops its report; `ROUTE_DRAWS.campaigns`
  (`legacy-bridge/surface-registry.ts:200`) becomes `["broadcasts", "campaign_results", "reach_outs"]`, so Settings'
  reads leave the first paint (the playbooks override keeps the bare `templates` read). `PREFETCH_READS.campaigns`
  gains `reach-outs` and the reach-out report, `.broadcasts` loses `reports/campaigns`; the prefetch test follows.
- Readers `reachOutChains` (`srv/readers/playbooks.ts`) and `reachOutReport` (`srv/readers/campaign-report.ts`) join
  existing modules at the 32-module hold (never `reachOuts`, the copies ratchet); both reach-out GETs and Ask answer
  through them, held by a test. `reachOutReport` answers `chains` beside the report (4.7): past twenty a chain still
  says its numbers or "Nothing sent", and one absent says "—".
- On Campaigns a message re-reads the results surface, debounced as Reports' (`debounceMs: 800`,
  `apps/dashboard/src/surfaces/reports/surface.ts:109`), not every page of People: the broadcasts surface hears
  messages on Sent alone. No new route.

### 4.6 The address and where doors land

- `HomeAddress` gains `group`; `parseHome` takes `in:<group>` (`campaigns/in:before`, D46); a filter replaces, never
  pushes. `in:` and `moment:` share one param (`home/route.tsx:13-16`), so the ledger keeps its group while a sheet
  stands (`useKept`, `home/drawer.tsx:21-26`), and a sheet closes with `history.back()` whenever the home is behind
  it (`home/use-home.ts:97-116`).
- A line naming a campaign opens its drawer, which shows its waiting run and the run's door to Sent; a door naming a
  run opens the run; the bell's reach-out day opens `campaigns/in:reach_out` (`ct/today/notifications.ts:444, 461`);
  Ask's playbook card opens the new drawer from `outcome.undo`, as the list card does
  (`ct/ask-proposals/lists.ts:47-50`); after Start it or Save changes, the changed row is scrolled to and washed.

### 4.7 The backend

- **`playbook_totals(p_tenant_id uuid, p_history integer default 10) returns jsonb`**, called with `HISTORY_ON_CARD`
  (`srv/campaigns/playbooks.ts:70`): `language sql` (no cached generic plan for a cost that varies by orders of
  magnitude), `stable`, `security invoker` (RLS is the floor, as for `campaign_series`), `set search_path = ''`
  (lint 0011); moments only; one scalar `jsonb` by playbook id, which PostgREST's row cap never cuts: `runs`, `sent`,
  `delivered`, `replied`, `held` (skipped and failed), `last_run { id, state, run_for, recipient_count }`,
  `waiting { id, recipient_count, name, run_for, trigger }`, `history` newest first; a playbook with no run is absent.

  ```sql
  create or replace function public.campaign_reply_window() returns interval
  language sql immutable set search_path = '' as $$ select interval '72 hours' $$;
  create or replace function public.playbook_totals(p_tenant_id uuid, p_history integer default 10) returns jsonb
  language sql stable security invoker set search_path = '' as $$
    with runs as (  -- moments only: a reach-out step's runs share broadcasts and are never scanned
      select b.*, row_number() over (partition by b.playbook_id order by b.created_at desc, b.id desc) as n
        from public.broadcasts b
        join public.playbooks p on p.id = b.playbook_id and p.tenant_id = b.tenant_id and p.kind = 'moment'
       where b.tenant_id = p_tenant_id),
    per_run as (select x.*, c.value as c from runs x  -- each run's counts, as run_counts says them to Sent
      left join jsonb_each(public.run_counts(p_tenant_id, array(select id from runs))) c on c.key = x.id::text)
    select coalesce(jsonb_object_agg(playbook_id, totals), '{}'::jsonb)  -- one scalar: no row cap cuts it
      from (select playbook_id, jsonb_build_object('runs', count(*), 'sent', sum((c ->> 'sent')::int), …,
              'last_run', (array_agg(jsonb_build_object('id', id, …) order by n))[1],
              'waiting', (array_agg(… order by n) filter (where state = 'pending_approval'))[1],
              'history', coalesce(jsonb_agg(… order by n) filter (where n <= p_history), '[]'::jsonb)) as totals
            from per_run group by playbook_id) t
  $$;
  ```

- **One window, one count.** `run_counts(p_tenant_id uuid, p_run_ids uuid[]) returns jsonb` answers Sent, a run's
  sheet and the cards (`withCounts` reads it); replies count each thread a run reached once, from its first send there
  (`min(sent_at)`), where an inbound customer message that `message_is_a_persons_words` came within
  `campaign_reply_window()`, which `campaign_series` reads too (its 00329 body with that change) and a test holds to
  `REPLY_WINDOW_MS`. `template_sends` replaces the `GET templates?all=1` scan. Grants as `campaign_series`'.
- **The chains.** `reach_out_chain_totals(p_tenant_id uuid, p_days integer) returns jsonb` by `root_id`, one pass over
  `email_left`, `email_sent_at` and `outreach_wrote_back`: `security definer`, that helper being the service role's,
  behind one `may_read_workspace(p_tenant uuid)`, not an eleventh inline member check. It ships in this group.
- **The dashboard.** The calls live in `packages/db` beside `campaignSeries`, each answering "missing" through
  `isMissingDoor` (`packages/db/src/repositories/reports/report-series.ts:28-46`): for one release a missing function
  falls back to the old fold, scan or report, so either deploy order works. `toPlaybookTotals` maps `last_run` to
  `lastRun` behind `isPlaybookTotalsDto`, no cast; `listPlaybooks` splits into `playbookRows` (Ask's shape reads it
  with a light select) and the totals; `GET playbooks` falls from about eighteen queries and two loops to seventeen
  and one call, and takes the report routes' `aggregate` bucket (`route-policy.json:1176-1181, 1288-1308`).
- **Live.** `playbooks` joins the realtime topic in 00321's shape (`WATCHED` and its test); the playbooks and
  reach-outs surfaces add `playbooks` and `broadcasts` to `refreshOnTables`.
- **Seeded truth** (`tooling/scripts/tests/playbooks/playbook-totals.db.test.mjs`), since the fold is wrong past its
  caps and for a thread two recipients share (`srv/campaigns/broadcasts.ts:98-126`): three moment playbooks and a
  chain; 1,050 runs on one; a chunk past 20,000 rows; forty runs across states, one waiting; skipped and failed
  recipients, a failed one with a message; replies in and out of 72 hours, an `auto_reply` and a `booking_notice`
  inside; a thread on two runs and one two recipients share; an empty workspace and a signed-in member of another,
  both `{}` (the suites run as the service role, which bypasses RLS: `report-series.db.test.mjs:14-21`).
  `EXPLAIN (ANALYZE, BUFFERS)` at 3,600 runs × 25 goes with the pull request; an index is a measured follow-up.
- **Regenerated:** `supabase/schema.sql`, `database.types.ts`, `migrations-ledger.json`, `packages/*/dist`, not
  `docs/data-model.md` (tables only); `_fake-db.mjs` models the functions. Numbered at push, locally from 00360 in
  §6's order (00359 is #1523's, on production), re-checked before the push against the ledger, main, every remote
  branch and every open pull request; the push renumbers whichever lands second.

### 4.8 The journey follows the business

The moments are `STAGES` (`lifecycle.ts:108-121`), a constant shaped by "How customers buy" and the calendar
(`momentOffered`). "Visit" stands in 82 contracts files, mostly ids, with about 60 strings a person or model reads;
the glossary's word is "appointment" (`docs/glossary.md:86`); `trade-neutral.test.mjs:51` bans salon words alone.

- **J1, derived now.** `APPOINTMENT_WORDS = ["appointment", "visit", "meeting", "session", "lesson"]`
  (`ct/journey/appointment-word.ts`), with "call" (the glossary's Call), "consultation" and "booking" out and "class"
  not added (D41); `appointmentWordOf({ stored, sellsBy })` is `stored ?? (dealsAreOn(sellsBy) ? "meeting" :
  "appointment")`, `stored` null here and no backfill, so a salon reads "appointment" until it picks (D42);
  `appointmentWords` writes each phrase once. Its home is `tenants.appointment_word` beside `sells_by`
  (`schema.sql:23371-23373`), and the column and its Settings › Business row are the journey lane's (D40).
- **One page, one word:** the rail, the drawer, the approval sheet, the composer, Coming up, Sent and core's three
  refusals (`check-playbook.ts:208`; `template-values.ts:60, 76`); "After a visit" and "After the visit" become one
  (`lifecycle.ts:111`; `playbook-triggers.ts:60`); new playbooks are named by the word through core's ports, stored
  names keep theirs until an opt-in exact-match rename with the word's row (D43); ids never change.
- **Neutral to customers now (D6):** the consent and unsubscribe pages (`ct/consent/consent-page.ts:217, 275`;
  `offers-unsubscribe.ts:70-110`), the email foot (`ct/templates/sender-words.ts:51, 64`) and one starter body
  (`starter-templates.ts:473`) say "appointment" ("cita"), outside the send path. The consent label "Visit messages"
  (`people/person/settings-card.tsx:221, 339`) is not renamed in this program (D6).
- **J2.** `journeyOf({ calendarOn, dealsOn, word, held })` (`ct/journey/journey.ts`), pure: First contact → W
  tomorrow → After the W → Proposal waiting (deals on, or a follow-up held) → Quiet or lapsed (D45). Ids are
  word-free, `visit` becoming `before` (D46); a stage holding a campaign always draws; off rows and hints read the
  stage's kind, not a closed id (`lifecycle-tiles.ts:280-302`; `lifecycle.ts:272`).
- **Needs your calendar (D44):** without one, the appointment moments say so ("…feed" where bookings arrive only by
  email), with no figure, no Turn on, a door to the calendar's row, never covered; `momentOffered` and core's
  `refuseMoment` (`check-playbook.ts:90-103`) require a calendar, and one made before is "Not running here".
- **The shape reaches the page:** one `businessShape` reader (`srv/readers/facts.ts`) feeds `GET playbooks` and Ask;
  `PATCH workspaces` refreshes Campaigns (`legacy-bridge/refresh-map.ts:223-225`).
- **Held by tests:** `journey/journey.test.mjs` runs 4 shapes × 5 words over every string of the view models;
  `baselines/appointment-words.json` may only fall; the moved pins update (`lifecycle.test.mjs:144-155`,
  `e2e/shell/phone.spec.ts:306-345`, `e2e/campaigns/playbooks.spec.ts:51-52` with its count read from the answer).
- **J3.** Past five stages, or on a narrow desk, the rail scrolls across (`scroll-snap-type: x mandatory`, edge fades).

### 4.9 Ask on the page

As on Leads (`docs/superpowers/specs/2026-09-24-ask-is-the-finder-design.md`): one Ask, a door wearing the three, a
surface the prompt steers, rows as context, cards that land. Every real send stays behind gates set once: the class's
mode (`ask` by default, 00274), the run's approval, the week's limit, the cap, the hours, consent, the allowance.

- **A0. Starters first (D23).** `POST playbooks` takes a starter key and adds it as the composer does: one press, the
  WhatsApp version's Meta review said on the card.
- **A1. Doors (D21, D22).** Library · Ask · New message, Ask a quiet `Button` with the `three` glyph (`cmh-ask`) from
  721px up, the shell's ✦ below; "Ask about this campaign" (scope `playbook`) in the drawer's More. The first day's
  primary is the hinted Turn on, "Set up my campaigns" beside it; Today's follow-up card carries one door to
  `campaigns/new:moment:visit_tomorrow`, no new first-run step.
- **A2. The surface.** The Campaigns line rides in the turn's words, not `system`: a message at a moment or to a list
  is a playbook, after `campaigns` `playbooks` and `audiences`; pause, resume, rename, hour, cap, gap or cadence is
  action `change`. `ASK_RULES` gains the setup rule: a few cards, never a claim; People's lists first; a playbook on a
  new list left to `do.next`; "Only batch tool calls that are independent of each other"; never a reminder, a moment
  not offered, a lead or an unasked autonomy change. `playbook` joins `ASK_SCOPE_KINDS`, `OnScreen.key` gains
  `"campaigns"`, and the rows as shown (at most 40) go with the view, on which the context cache is keyed.
- **A3. At rest.** "Describe what should go out, and when" (es: "Describe qué debe salir, y cuándo"); three ideas on
  the first day, then chips from the rows ("Why is Win-back waiting?", "Turn on · 7 tomorrow", "What's working?"),
  no win-back chip where one runs.
- **A4. No claim, no repeat.** A setup question reads `campaigns.playbooks` and `.audiences` before round 1
  (`srv/ask/cross-page.ts`); `claimsWrite` moves to `ct/ask/ask-answer.ts`, so a headline claiming a write beside
  cards becomes their count sentence, logged; a running duplicate (trigger, list, message) is refused unless named
  (D9); after an approval the next turn re-reads campaigns, not the shape.
- **A5. Change (D8, D25, D26).** Action `change` (the owner is at twenty tools), card `playbook_change`: `playbook_id`
  and any of `state`, `name`, `run_hour`, `cap_per_run`, `gap_days`, `cadence_days`, typed `number`. One core
  `checkPlaybookPatch(ports, row, patch)` beside `checkPlaybookChannels` judges tool and route, with ranges from one
  `PLAYBOOK_LIMITS` beside `PLAYBOOK_HOURS` and `PLAYBOOK_NAME_MAX`; it refuses a name past 80, a cadence off the
  month's offer, a reach-out step, no change and a resume on an archived list (by port). The PUT declares a strict
  `z.union([patch, whole])` off the browser entry and writes through `change_playbook(p_tenant_id, p_playbook_id,
  p_set, p_decision, p_via, p_undo_of)`, 00357's shape: invoker, the row locked, `P0002` on zero rows, the decision
  through `member_decision` in one transaction, answering `{ id, was, decision_id }`; `docs/api.md` shows the body.
  The card says a waiting run stays (Skip is a second card) and a resume's mode in full under `auto`; its receipts
  are `LIFECYCLE_TOAST.paused`, `resumed`, `changed`; undo, ten minutes, from `was`; gate `approve`, needs operator.
- **A6. The row's number (D35):** the `campaigns` read says `last_30_days: { sent, replied }` through `campaignReport`,
  not all-time; the page context says the same and names `campaigns`, not `outbound`.
- **A7. How cards go (D27):** each card is its own press, and the answer says so; playbook and broadcast cards state
  the allowance; `propose_autonomy` is judged by the policy matrix (`policyModeRefusal`); a playbook card offers
  "Open in the composer".
- **A8. Regenerated:** `fixtures/ask-tools-4-7.json` (with the neutral words of `srv/ask/prompt.ts:69` and
  `act/playbook.ts:467`), `ADDED_SINCE`, `ask-specs`, `ask-registry`. Evals (D3): a Win-back seeded through
  `e2e-workspace.mjs` (`--apply`); keys `proposals_max`, `card_fields_not`, `next_any`, a `tools_order` note; the
  Ask note's twelve cases, against the deployed dashboard, after the merge.
- **Later, after the setup evals, if they ask:** M1, a compact `plan` action the server expands, if cards overrun the
  4,000-token round (`ct/ask/ask.ts:103-109`); M2, "Step n of N" and "Approve the rest" for steps that send nothing
  (D28); M3, progress updates as `trace` lines (D33); M4, the ledger marking a card's row; M5, a typed `do.choose`.

## 5. What does not change

The send path, consent, `reachFor`, the breath and the gap, the sweep, Who can hear you, What came back's funnel,
the Library, Sent, the Stage, the tokens and every table; the drawer but Pause's place on a phone; the composer but
its title, two doors and one notice (D20); the routes but `GET playbooks`' bucket and the PUT's declared body,
written through one door; the realtime topic but `playbooks` on it; the kit but `ListRow`'s mark (no new primitive).

## 6. Parts: one branch, four commit groups, one pull request

`campaigns/a-moment-holds-many` in `cm-campaigns-2`, from `d1bb65961`: four commit groups in order, built and
reviewed end to end locally, pushed as one pull request after Ruben's review (the report's four pull requests, by
his word). The migrations ship together, numbered at push (locally 00360 up), the fallback keeping either deploy
order. The pull request runs the whole suite (label `suite`) and says what customers see change: booking notices stop
counting as replies, and the consent and unsubscribe pages and the email foot say "appointment".

1. **The floors (4.0; corrections 1–3):** `EMAIL_CLAIMS`; two migrations; the parity and month tests.
2. **The backend (4.7; 4–12):** the counts, chains and topic migrations; `packages/db` wrappers; the guard, mapping
   and split; `withCounts`, the templates reader and the shape over the functions; the bucket; `refreshOnTables`;
   database tests; regenerated files; measured on the seeded stack before and after.
3. **The ledger (4.1–4.6, 4.8; 13–45), no migration:** (a) the `lifecycle/` move alone; (b) glossary rows; (c)
   contracts (ledger, builders, words, tone, period, `ct/journey/`, the word through the sentence files) with
   `ledger.test.mjs` and `journey.test.mjs`; (d) core's calendar rule, names and refusals; (e) reads, readers,
   `businessShape`, the refresh map, `route-prefetch.test.mjs`; (f) the home (`home/ledger/`, `rail.tsx`,
   `address.ts`, `campaigns.css` without `.cmh-strip*` and `.cmh-vrail*`, `home-page.tsx`), the composer's title,
   doors and notice, the phone drawer's foot, the `ListRow` mark, Today's door, the page tests moved to `cmh-row`;
   (g) customer words and the ratchet; (h) the two e2e specs, `docs/system-prd.md`, the journey's decision note
   (locally 0040; 0039 is held), the bundle against main's build with a Rises row (D2), and `salon-many` on the rig
   (`dev-tools/campaigns-rig-scenarios.mjs`, outside the repo) at 1440, 1000 and 390 in both themes.
4. **Ask (4.9; 46–55):** the starter key; doors; the turn's line, rule and reads; `claimsWrite`; duplicates; scope,
   rows, view; words and chips; `PLAYBOOK_LIMITS`, `checkPlaybookPatch`, the `change_playbook` migration, the PUT's
   input, the card, the client and `docs/api.md`; `last_30_days`; allowance, approval words, autonomy; fixtures,
   tables, eval seed, keys and cases; the note "AG-UI not now" (locally 0041).

**Later lanes, each its own spec (56; D47, D48):** the journey lane (J4 as references on `tenants.journey` beside
`tenants.appointment_word`, one migration; a pin left out while its list is gone; `campaigns/new:on:<token>`;
duplicate captions refused; 8 stages, 3 pins; built-ins hideable but First contact; presets only when pressed; the
word's row and rename; offers and win-backs only; Ask's journey action); the visit sweep; B2B list facts; "Ask sets
up while you approve" (M1–M5); archiving; views B and C; a settled per-run tally; deleting `listRuns` and the fold.

## 7. Tests

Nothing was run for this spec; each test is written and run file by file, the whole suite on the pull request.

- **Database:** seeded truth, never the fold alone (wrong past its caps), and again as a member of another
  workspace, since the suites run as the service role, which bypasses RLS: the parity set, the month,
  `playbook_totals`, `run_counts`, `template_sends`, the window, chains past twenty, the topic, `change_playbook`.
- **Contracts:** one playbook per moment, three on one, a deleted playbook's run, the chains absent, failed and past
  twenty, the counts, sort keys, six and seven rows, `journeyOf` per shape and word.
- **Page (stub React):** a card's body and name, tabs, count, search, Clear, keys, Approve and Skip on the row only,
  Resume's question, a viewer's gates, the group under a drawer, the phone's spine.
- **Ask:** the card's commit, undo and open; the scope kind; `checkPlaybookPatch`; the PUT over the fake database;
  the turn line; `claimsWrite`; reads before round 1; duplicates; the registry, `ask-specs`, the palette; the door in
  `e2e/campaigns/playbooks.spec.ts`; the evals after the merge. **Browser:** the nightly specs; the rig, three widths.

## 8. Risks

- **The ceiling:** the journey's words and Ask's card eat into 2,361 bytes of room; measured against main's build
  and raised by the growth with a Rises row (D2); the patch schema stays off the browser entry.
- **The Reports defect waits for the merge:** one pull request keeps the month's 422 live until it lands.
- **The oracle and the plan:** the fold is wrong past its caps, so the proof is seeded truth; nothing was run, so the
  plan on Supabase Micro is unknown until the `EXPLAIN`, and the work stays proportional to every recipient ever, in
  one round trip, until a settled per-run tally (D35).
- **Two numbers for one playbook:** the row's 30 days and the drawer's "N runs so far", each labelled.
- **A word changed on a running workspace:** every salon reads "appointment" from this release, its playbooks keep
  their names, and customers of every trade read it on the consent pages and the email foot.
- **Sends:** a resume under `auto` sends unattended (said in full, D7); a pause leaves a waiting run waiting; a
  starter's Meta review submission cannot be unsent; four cards a setup is near where presses go reflex.
- **Eval runs spend the receptionist's key,** the one that answers customers: about $0.5–1.5 a run (estimated).

## 9. Decisions taken, 9 October 2026

Ruben approved the report as recommended; (c) marks the three conservative defaults; D1 is overridden by his word.

1. Four lanes, the floors first: yes, in that order, as commit groups of one pull request (overridden).
2. Raise the 768,000-byte route ceiling if the build asks: yes, by the measured growth, with a Rises row.
3. Spend the production key on the new evals and seed the eval workspace with `--apply`: yes, away from 09:00 UTC.
4. Decision notes for the journey and for "AG-UI not now": both, numbered at push.
5. Booking-tool notices stop counting as replies and "last wrote": yes; Gmail's forwarding confirmation is no person's.
6. Neutral customer-facing words now: yes; the consent label "Visit messages" is not renamed in this program (c).
7. Resume from a row: a question in place saying when and to how many; `auto` said in full.
8. Pause while a run waits: the run stays, the card says so, Skip is a second card.
9. Refuse a second running playbook on the same moment, list and message unless named: yes.
10. Keep decisions 5 (no switch on a row) and 6 ("Needs you" as a tab): both.
11. The group in the address: yes, kept under sheets.
12. A rail card's press: the body filters, the name opens.
13. Paused: resting, not amber.
14. A waiting run is decided on the row; Coming up shows the time and "Waiting on you".
15. The threshold for tools and the phone strip: seven rows (a judgment).
16. The phone: one mixed strip, no page swipe, the journey's line as the list's spine; phone.spec changes.
17. One-off sends: a footer when small, a group past the threshold.
18. People's list keys on the ledger: yes.
19. "Playbook" out of every word a person reads, in this program: yes.
20. The composer's freeze lifts for its two doors and the "already has a campaign" notice; Edit is a kit call, later.
21. The first day's primary: the hinted Turn on; "Set up my campaigns" beside it once starters work.
22. A door at the first run's payoff: one, on Today's follow-up card; no new first-run step.
23. Starters through `POST playbooks` in one press; the Meta submission said on the card.
24. Ask-first: setup, changes and lists; forms for words, deals-on, the appointment word and reminders.
25. A4: add `gap_days`; refuse names past 80.
26. A4's route: a typed union on the PUT, and a decision row for Ask's edits.
27. One press for steps that send nothing; its own press for any step that would.
28. A plan card only if the evals show owners stall.
29. Deals-on through an Ask card: no; the form, Ask pointing to it.
30. Ask writing a campaign's message during setup: no; starters only.
31. Spanish words on every card: yes, in one later lane for all cards.
32. Effort above `low`, or a fallback on declines: measure first; neither yet.
33. Anthropic's progress updates through the edge: yes, after the setup evals.
34. Where "the AI does it" lives: the dashboard.
35. All-time totals: Ask moves to 30 days now; the drawer later; a settled tally is a later lane.
36. `run_counts` and `template_sends` in the backend's migration: yes.
37. `playbooks` on the realtime topic: yes.
38. Chains: a per-chain aggregate, not the report's twenty.
39. The backend's deploy order: a one-release fallback; `GET playbooks` gets a rate bucket.
40. J1: derived now; the column and its Settings row with the journey lane.
41. The set: appointment, visit, meeting, session, lesson, "call" out; "class" not added (c).
42. The default: meeting where deals are on, else appointment; no backfill.
43. Existing names after a word change: an opt-in rename of exact default names only.
44. Calendar-less appointment moments read "Needs your calendar" and are never covered: confirmed.
45. Proposal out before Quiet, captioned "Proposal waiting", `seg:proposal_out` unpinnable beside it: yes.
46. Word-free stage ids in addresses (`campaigns/in:before`): yes.
47. J4's record: `tenants.journey` (references), 8 stages, 3 pins, built-ins hideable but First contact.
48. Pinned lists run only offers and win-backs: accepted for now.
49. A renewal stage and `deals.renews_on`: not in this program (c).
