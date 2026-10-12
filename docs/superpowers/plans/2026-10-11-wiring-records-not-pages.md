# Wiring records, not pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page that shows a record hears when it changes, every link opens exactly what it names, every record
reads the same everywhere, and the next page that starts reading a record cannot be left unwired.

**Architecture:** Lanes L1–L6 of the Wiring Blueprint (approved by Ruben 11 Oct 2026, "all approved end to end as you
suggest"; L7, one store, waits for 0015 steps 12–13). L1 fixes what the owner sees with the feed as it is. L2 puts the
silent records on the live feed (decision 0019's mechanism, named by record kind) and makes your own change cost one
read. L3 makes each surface declare the record kinds it draws and adds the coverage test that fails an undeclared read.
L4 gives each record one address, one set of words and acts; L5 one list of what needs you; L6 retires the old wiring.

**Tech stack:** Next.js 15 dashboard (TSX surfaces + legacy JSX frame), Supabase Postgres + Realtime broadcast,
Vercel edge functions, pnpm workspaces (packages contracts/core/db/jobs/channels with committed dist), node:test suites
under `tooling/scripts/tests`.

**Source of truth for each fix:** the Wiring Blueprint and its evidence,
`Claude Video/docs/2026-10-11-chanlytics-wiring-blueprint.md` and `…-evidence/v-*.json` (each finding has `seen`,
`fix`, `fix_technical`, `evidence` as path:line at b43a8a9ab). Main has moved since (#1556, #1557): re-read every cited
line on this branch before changing it, and say in the task report when a finding was already fixed.

---

## Ground rules for every task (Ruben's standing orders and the repo's rules)

- Worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-prd-channels`, branch `wiring/records-not-pages`.
  Never `git commit`, `git push`, `git stash`, `git checkout <other branch>`, or touch another worktree.
- A task is done when its tests are green; then `git add` exactly the files it changed (new files too). The index is the
  last verified state; the next task's work is `git diff`.
- TDD: write the failing test first (`node tooling/scripts/checks/test.mjs <file>`, one file per command), see it fail,
  implement, see it pass. Tests execute the code; a source-text assertion is the last resort and
  `source-scan-baseline.json` may only fall.
- After changing `packages/*/src`: `corepack pnpm --filter "./packages/*" build` (dist is committed and CI fails drift);
  a new contracts export goes in its folder's barrel and `node tooling/scripts/gen/contracts-browser-entry.mjs`.
- Before reporting: `corepack pnpm -r typecheck`, `corepack pnpm lint` (no new warnings; never `--raise` without
  saying why), `corepack pnpm exec prettier --check <changed files>`, and the test files of every folder the change
  touches plus any test that greps a name you changed (`grep -rl <name> tooling/scripts/tests`). Never the whole suite.
- Ratchets: files ≤ 800 lines, functions ≤ 150 lines / 30 branches / 5 levels, folders ≤ 20 modules, no new window
  globals, no new `as unknown as`, dead exports may only fall. A fall is banked with `UPDATE_BASELINES=1` on the ratchet's
  test (and `node tooling/scripts/checks/dead-exports.mjs --update`); a rise needs a row under "Rises" in docs/debt.md.
- New file traps: a folder already at 20 modules takes the file in a sibling folder; `git add -N` a new file before
  running tools that list tracked files; the Edit tool keeps CRLF; never run `sed -i` from Git Bash on repo files.
- Never touch production: no `supabase db push`, no prod scripts. The local dev server reads production: do not run it
  for writes. Database tests run on a throwaway stack only (`reference_throwaway_supabase_stack`): start one for L2 and
  stop it at the end.
- Words: plain sentences, the product's words (`docs/glossary.md`); every sentence a page says comes from contracts.
- Nothing reaches Expo.

---

## Task 0: Decision notes

**Files:** Create `docs/decisions/0047-a-page-hears-the-record-it-draws.md`,
`docs/decisions/0048-one-list-of-what-needs-you.md`; modify `docs/decisions/README.md` (index rows).

- [ ] 0047 (amends 0019 and 0031's invariant on readers): every table a page draws a record from is told to its workspace
  (0019's `tell_the_workspace`, column-filtered so a stamp tells nothing); a notice carries its table, operation and the
  transaction's clock `at`, never a row; contracts names each table's record kind; each surface declares the kinds it
  draws and its freshness rule, and its live tables are derived from them; a coverage test fails a surface that reads a
  table it does not hear or list as an exception; a write's own notice is skipped when the surface was read after it.
  Notices from the events ledger replace table notices when 0031's invariant 2 reaches zero. Steps = L2, L3.
- [ ] 0048 (0046 lane A step 4): one read of what needs you (holds, runs waiting for approval, held sends), one count
  for the badge, the tab title, the phone and Today; a kept bell row closes when its subject stops waiting; a customer's
  STOP is news, not a wait (told once, never held); the bell row and the push never wait on the mail.
- [ ] Verify: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/decisions-index.test.mjs` (or the docs
  folder's index test that exists) passes; stage.

## Lane L1 — Make what the owner sees true

### Task 1.1: Visits reach every reader; Today's Worth a look and Reports refresh where drawn
Findings: F1, S1-06, S1-01/S1-05 (pages), F2a, N4, F10a, F10b, F8c (receptionist and overview tables).
**Files:** `apps/dashboard/src/legacy-bridge/refresh-map.ts`; `apps/dashboard/src/surfaces/people/surface.ts`;
`apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts`; `…/campaigns/broadcasts/surface.ts`;
`apps/dashboard/src/surfaces/reports/{headline.ts,surface.ts,receptionist-surface.ts,period-surface.ts}`;
`apps/dashboard/src/surfaces/today/` (a midnight re-read); tests under `tooling/scripts/tests/shell/` and
`tooling/scripts/tests/reports/` beside the existing refresh-map and surface-realtime tests.
- [ ] Failing tests: running AFTER["POST calendar/visits/[id]"] names calendar, people, playbooks, broadcasts and (when on
  screen) reports_headline, reports, reports_people, reports_receptionist; `wantsRefresh` for people/playbooks/
  broadcasts takes an `appointments` change; the headline re-reads after a thread write when Today owns the screen and
  is forgotten otherwise; Reports' overview is forgotten (not read) by a consent write when not on screen; a Today midnight
  timer in the business's zone re-reads today and the headline.
- [ ] Implement per the findings' `fix_technical` (lens pattern: forget + ownsTheScreen; appointments in live tables
  under the existing onlyOnItsPage rule; settingsWrite drops todayOverride; the four premature rows become behind).
- [ ] Green, typecheck, lint, stage.

### Task 1.2: Bell rows refresh what they announce; the pages that draw channels, billing, rules and you hear them
Findings: N2/NS-2, F6, F7a, F7b, S1-02, S1-10, S1-13, NS-1, S1-17, S1-18, F8e, F5a, F5c, OW4, OW7, F3b, N1.
**Files:** `apps/dashboard/src/legacy-bridge/surfaces/notifications.ts` (+ a `notice-re-reads.ts` beside refresh-map);
`apps/dashboard/src/surfaces/today/surface.ts`; `apps/dashboard/src/surfaces/live/surface.ts`;
`…/campaigns/{playbooks,broadcasts}/surface.ts`; `refresh-map.ts` (PUT policies, PUT me);
`apps/dashboard/src/legacy-bridge/inbox-verbs.ts` (drop the duplicate policy:changed);
`apps/dashboard/app/api/v1/calendar/route.ts` + `surfaces/calendar/surface.ts` (people_added → People);
`apps/dashboard/src/surfaces/people/person/person-real.tsx` (its person's new message, call or note re-reads it).
- [ ] Failing tests: a new kept row of kind template_ready / template_blocked / booking_notice / calendar_people /
  offers-paused re-reads (or keeps for its page) the surfaces it is about, and the first read of the bell re-reads
  nothing; today hears tenant_channels, lines, billing_accounts; live hears tenant_channels; the composers hear
  billing_accounts, tenant_channels, lines under onlyOnItsPage; PUT policies re-reads campaigns' surfaces where drawn and
  announces policy:changed once; PUT me re-reads workspace and settings; a calendar read that added people re-reads
  People; the open person page re-reads on a conversations/inbox change for its own person only.
- [ ] Implement; green; typecheck; lint; stage.

### Task 1.3: Today says the truth about steps and visits
Findings: D1-step-today + O2a (a due step is a row type in Today's queue, with Done: my call, the day pane stays
dropped), D1-visit-today-mark, D1-closing-window-stop.
**Files:** `packages/contracts/src/today/{today-queue.ts,today-day.ts,today-facts.ts,today-brief-words.ts}` (as found),
`apps/dashboard/src/surfaces/today/pages/{queue*.tsx,strip.tsx}`; tests under `tooling/scripts/tests/today/` (or a
sibling folder if at 20 modules).
- [ ] Failing tests: todayQueue over people rows with a step due today or overdue yields 'step' rows (oldest first, three
  at most, then one row opening People's Steps due) whose act is Done; a cancelled visit is not counted, not next and not
  in the brief's count; a marked visit carries Kept/Missed; a past day's brief says it is over without ", all done"; the
  closing-window row leaves out a person who asked to stop.
- [ ] Implement (Done calls the person-notes done verb the Inbox header uses; the refresh map's notes() gains Today);
  green; typecheck; lint; build packages; stage.

### Task 1.4: One true sentence for a switched-off line and a paused workspace
Finding: D1-line-off-words. **Files:** `packages/contracts/src/{channels/channels.ts,billing/billing.ts}` (as found), the
callers in Live (`surfaces/live/list.tsx`), Start (`surfaces/setup/rows/setup-rows-phone.ts`, `setup-rows.ts`) and
Today (`today-bands.ts`); a contracts test.
- [ ] Failing test: Live, Start and Today's words for a switched-off line and for a paused workspace are the contracts
  standing sentence (what a caller gets), and no page-owned sentence says "not answering" / "not picking up" where the
  standing says the call is still picked up. Implement; green; build; stage.

### Task 1.5: The booking link is offered only to someone who may receive it
Finding: D1-booking-link-stop. **Files:** contracts `person-reach.ts`, `person-row.ts`, `calendar.ts`;
`surfaces/calendar/panel.tsx`. Failing test: a stopped or do-not-contact person's row and calendar block have
`bookingLinkAction.ready === false` with the reason; implement; green; build; stage.

### Task 1.6: Links land exactly (pages and Ask)
Findings: A1, D1-visit-open, D1-activity-no-door, Links-N1, A2e, A2f, A3c, Links-N3.
**Files:** `packages/contracts/src/activity/lines.ts` (activityDoor cases: playbook, template, line, mailbox,
sending_domain, listing; appointment → `calendar/<day>:a-<id>`), `packages/db/src/events.ts` (the subject's day),
`apps/dashboard/src/server/metrics/activity.ts`, `apps/dashboard/src/surfaces/calendar/{address.ts,calendar-page.tsx}`
(open the visit once its day is drawn), person timeline / People visit links, `packages/contracts/src/ask/{citations.ts,
ask-answer.ts}` (page citations checked against real page shapes; one door per canonical route),
`apps/dashboard/src/legacy-bridge/surface-registry.ts` + `legacy/pages/app-routes.jsx` (unknown Settings address opens
Profile; a moved address draws nothing while it moves), `surfaces/today/pages/away.tsx` (a group of rows with different
doors opens the list).
- [ ] Failing tests per behaviour (activityDoor for every subject type the events table carries, or a listed reason; the
  calendar address round-trips day + visit; citations drop unknown shapes; oneDoor treats outbound/<id> and
  campaigns/moment:<id> as one; registry classifies admin/setup and an unknown admin pane). Implement; green; stage.

### Task 1.7: Links land exactly (mails, notices, Google's return)
Findings: A2a, NS-4, A2b, A2d, Links-N2.
**Files:** `apps/edge/lib/ops/notify.ts` (an "Open it" link at the foot of every alert mail from one `appLink(slug,
route)` in contracts shell/address.ts), the notice writers named in A2b (deadman-sweep, unfinished, core broadcast.ts and
broadcast-stops.ts, voice/call-event.ts, calendar/booking-read.ts), `contracts today/notifications.ts`
(serverNotificationRows: a group of 2+ uses the kind's list door), the Google callback, `apps/edge/lib/ops/you-are-live.ts`.
- [ ] Failing tests: every emailed kind's body carries the link for its route; each named notice carries its record's
  route; Google's return names the workspace; the alert-test link has a workspace or falls back to the front door.
  Implement; green; build; stage.

### Task 1.8: A STOP is news, not a wait; the bell and the push never wait on the mail
Findings: NS-6, S1-15 (decision 0048).
**Files:** the receptionist's gate that opens the opt_out hold (`apps/edge/lib/receptionist/gates.ts` or where found),
`packages/contracts` notification kinds (a 'stopped' bell line, mail by choice), `apps/edge/lib/ops/notify.ts`
keepThenMail (row and push first; a failed mail is retried alone).
- [ ] Failing tests: a typed STOP writes the consent, opens no escalation, and keeps one bell row (no mail by default);
  standingOf/todayQueue have no opt_out wait; a hold's bell row and push are kept when the mail fails, and the retry sends
  only the mail. Implement; green; stage.

## Lane L2 — One change signal per record (decision 0047)

### Task 2.1: The silent records join the feed
Findings: F3a, F4, F5b, F7c, N3, S1-07, S1-09, S1-19, S1-20, NS-5, F7a/F7b/S1-13 (the table side).
**Files:** `supabase/migrations/004NN_a_page_hears_the_record_it_draws.sql` (next free number at the time),
`packages/db/src/realtime.ts` (WATCHED rows), the each-workspace-is-told db test.
- [ ] Triggers via 0019's function: contacts (INSERT; UPDATE OF the identity, consent, stop, merge, erase columns),
  tenant_config (UPDATE when version changes), policies (all events), templates (INSERT, UPDATE OF status columns,
  DELETE), mailboxes (UPDATE OF offers pause columns), appointment_notices (INSERT, UPDATE), memberships and invitations
  (all), tenants (UPDATE OF status); the payload gains `at` (clock_timestamp()). A db test holds WATCHED equal to the
  triggers and holds WATCHED ⊇ the tables runtime_stamp reads (NS-5). Replay on the throwaway stack; regenerate
  schema.sql / db types / schema sets; stage.

### Task 2.2: The pages hear them
- [ ] settings: tenant_config, policies, templates, memberships, invitations; workspace: memberships, tenants; inbox and
  conversations: contacts, templates (forget the kept templates); people: contacts, playbooks, tenant_channels,
  billing_accounts, policies, templates (onlyOnItsPage); playbooks/broadcasts: contacts, templates, mailboxes, policies,
  tenant_config (onlyOnItsPage); calendar: appointment_notices, tenant_config; reach_outs and campaign_results:
  reach_out_replies; reports lenses: contacts (as counted). Tests per surface rule; stage.

### Task 2.3: Your own change costs one read (F9)
- [ ] The notice's `at` reaches `wantsRefresh`; each surface remembers when its last read started; refreshSoon drops a
  notice whose `at` is before that start (250 ms margin). Failing test: a reply's own messages notice after the write's
  re-read asks for nothing; a teammate's later notice still reads. Stage.

### Task 2.4: Facts that ride their transaction
- [ ] S1-08: a YES to offers is written in the message's transaction or retried by its job. S1-19: a member joining
  writes one bell line. OW3: the person page's extra carriers (deal:recorded, note:saved) go once the feed carries the
  person. Tests per behaviour; stage.

## Lane L3 — Pages declare what they draw (decision 0047)

### Task 3.1: Record kinds and declared reads
- [ ] `packages/contracts/src/shell/record-kinds.ts`: RECORD_KINDS (person, conversation, call, hold, visit, step, deal,
  list, lead, campaign, send, template, reach_out, review, facts, rules, channel, team, notification, billing) → tables.
  Each surface override declares `reads: RecordKind[]` and its freshness (`live` | `on-its-page` | `aged` | `own-change`);
  `refreshOnTables` is derived (`liveTablesOf`). All surfaces migrate; behaviour equal (test: derived tables ⊇ today's).

### Task 3.2: The coverage test
- [ ] `tooling/scripts/tests/shell/surfaces/reads-are-heard.test.mjs` with a tracer in `tooling/scripts/tests/_reads.mjs`
  (ported from the evidence's `tools/deps.mjs`): for each surface, the tables its GET routes read must be in its declared
  kinds or in `baselines/reads-not-heard.json` with a reason; the baseline may only fall. A second check: every AFTER row
  re-reads each surface that declares a kind the write changes, or the row says why not. Fix what it finds (F8a, F8c);
  stage.

### Task 3.3: Templates read once (OW2)
- [ ] The Inbox picker, the composers and the New conversation sheet draw the settings read's templates; HOOKS and
  `__refreshBroadcasts` / `__refreshPlaybooks` go. Tests; stage.

## Lane L4 — One address, one set of words and acts per record

### Task 4.1: addressOf and the address registry
- [ ] contracts `addressOf(ref)` for every record kind; a registry of the shapes each page opens (each page's own parse);
  a test that every writer (activityDoor, notification routes, Ask citations, person timeline, Today rows, People rows)
  produces an address its page opens exactly. A2c: the Inbox and Conversations open a thread not among the newest by id.

### Task 4.2: One word per state
- [ ] A contracts test fails when one label names two states across the label maps. Then: 'Needs you' / 'You have it' /
  'Waiting for your approval' (D1-waiting-on-you, D1-hold-words), run words and stop verb (D1-run-words), campaign state
  (D1-campaign-state), template marks (D1-template-marks), stop words (D1-stop-words), message status in History
  (D1-message-status), call outcome (D1-call-ended-words), member names (D1-member-name, D1-member-fallbacks), list group
  names (D1-list-names), lead classes (D1-lead-class-words), reach-out reading tones (D1-reply-chip-tone), plural
  (D1-lead-one-reviews), snoozed hold on People (D1-snoozed-hold), Connections' own-line row (D1-line-row-derivations).

### Task 4.3: One face and the stopped mark
- [ ] One person face (initials, or one glyph for a number- or address-named person) on every page (D1-face-number,
  D1-face-email); the stopped mark wherever a person is offered as someone to contact (D1-stop-unseen).

### Task 4.4: One visit line, marked where it is seen
- [ ] One visit line VM (time, title, person, state word, acts) for the Calendar, People's cell, the person page, the
  Inbox chip and Today (D1-visit-mark, D1-visit-match-words, D1-consult-held); Kept / Missed on the person page; a
  "Did they come?" row type in Today's queue for yesterday's unmarked visits (my call).

### Task 4.5: Acts follow the record
- [ ] A reach-out run is approved on its sheet everywhere (D1-run-reachout-approve); a hold's reason carries its act, a
  STOP offers Done, not reply (D1-hold-reasons); a converted lead opens its person and the reach-out sheet opens its leads
  (D1-lead-person-door); Ask is told what is on screen one way (OW6).

## Lane L5 — One list of what needs you (decision 0048)

### Task 5.1: One count
- [ ] contracts `waitsOf(...)` over the holds, the runs waiting and the held sends; the badge, the phone tab, the
  title, the phone app's badge and Today read it (OW1, OW5, D1-phone-badge).

### Task 5.2: The bell closes what is done, and draws one way
- [ ] A kept row whose subject no longer waits reads as read (a run approved or skipped, a booking notice dismissed, an
  invitation accepted) (NS-3); the away card and the bell share one grouping (D1-notice-two-drawings); a review is drawn
  once on Today, its notice cleared by its answer, and the lens opens one review (D1-review-twice).

## Lane L6 — Retire the old wiring; reads never write

### Task 6.1: Dead and demo-only wiring
- [ ] The five listeners nothing sends to (O1a); demo listeners registered only in a demo (O1b); SOON_META's live rows
  (A3b); the keyboard sheet's door in the account menu on a desk (OW10, his 23 Sep ruling); the usage dot from the day's
  model budget (O3).

### Task 6.2: Names nothing reads
- [ ] The ~81 window names nothing reads (O4b), askAbout / navigate in a bridge module (O5b), the mockup's seeds out of
  the real manifest (OW8), the undrawn day pane (O2b, after Task 1.3). Rebank the window-globals and legacy-files
  baselines.

### Task 6.3: Reads never write
- [ ] GET calendar adds no people (the sweep does; the board offers "Add to People" for a name it cannot match) (R1a,
  0034 §4); joining a workspace from an invitation is one POST the shell makes once and says (R1c); the leads export is a
  POST (R1d). A ratchet lists the reads that write, with the downloads' audit rows as the stated exceptions.

## Finish

- [ ] One review round over the whole branch (a reviewer subagent per lane's diff), fixes, then: `corepack pnpm -r
  typecheck`, lint, format check, dead exports, every touched folder's tests, the db tests on the throwaway stack, a
  production build with `check:bundle` (argue any growth in a `Bundle:` line), `.next` deleted, stack stopped.
- [ ] A PR description in `docs/superpowers/plans/2026-10-11-wiring-records-not-pages.pr.md`; nothing committed; Ruben
  reviews, then commit, `check:local`, push once.
