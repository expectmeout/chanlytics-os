# A moment holds many campaigns, lane 3: the home (rail, ledger, phone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campaigns' home draws every campaign in one ledger under the rail, grouped by moment in the journey's order, narrowed by a card, a tab, a search or one key, and decided where it stands (Approve, Skip, Resume), on a desk and on a phone; with the address, the doors that land, the customer-facing neutral words, the e2e specs, the docs, the bundle measure and a look on the rig.

**Architecture:** Lane 2 has already built the view model (`LifecycleHome.ledger`: `LifecycleLedger`, `LifecycleGroup`, `LifecycleRow`, every word) in `packages/contracts/src/playbooks/lifecycle/`. This lane draws it: a pure `ledgerViewOf` plus a `useLedgerView` hook decide what the screen shows; `ledger.tsx` (desk, a CSS grid with subgrid rows copied from Sent's `.bc-runs`), `ledger-phone.tsx` (the journey's line as the list's spine, the kit's `ListRow` with a new `mark` variant) and `rail.tsx` (a card's body a toggle that writes `campaigns/in:<group>`) compose kit parts only. The group lives in the address (replaced, kept under sheets); status, search, sort and grouping are page state.

**Tech Stack:** React 19 TSX under Next (App Router), the dashboard's kit (`apps/dashboard/src/surfaces/kit/`, Base UI parts), contracts view models (`@chanlytics/contracts`, consumed through committed `dist`), node:test page tests on the repo's stub React (`tooling/scripts/tests/_legacy-react.mjs`), Playwright e2e (nightly, against production).

---

## Read this first (the implementer has zero context)

- **Where.** Worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-campaigns-2`, branch `campaigns/a-moment-holds-many`. Run every command from the worktree root. Never `cd` elsewhere, never touch another worktree, **never `git stash`**, **never push**. Each task ends with a local commit of the exact files it names.
- **Lanes before you.** Lane 1 (floors, backend) and lane 2 (contracts, core, reads) are committed on this branch before you start. **Lane 2's code wins over this plan's assumptions.** Task 1 makes you read it and write down the names it really used; every later task uses the names in the table you write there.
- **Main was merged in before you start.** `origin/main` at `39857e8a4` (#1526, Reports' date range and the bell; #1528, a range's first press) was merged into this branch before lane 3 began, and lane 1's migrations are 00361 to 00364 after it (main's 00360 comes first). This plan's `file:line` citations were read before that merge (on `7ff179717`, or `45a15ee23` where a task says so): **re-read each file before you edit it**, find every string and block by its words, and treat a line number as a hint. Files main changed that this lane edits: `tooling/scripts/tests/styles/kit-components.test.mjs`, `tooling/scripts/e2e-harness/kit-gallery.mjs`, `apps/dashboard/src/surfaces/kit/kit.css` and `classes.json` (Task 5); `tooling/scripts/tests/today/bell-rows.test.mjs` (Task 14); `e2e/shell/phone.spec.ts` (Task 16); `packages/contracts/src/reports/lenses.ts`, `apps/dashboard/src/surfaces/reports/blocks.tsx` (Task 12C); `docs/system-prd.md`, `docs/debt.md` (Tasks 17, 19).
- **Rules you will trip on** (each is a red build; `CLAUDE.md` has them all):
  - No raw `<button>`, `<input>` in `apps/dashboard/src/surfaces` (lint): use the kit (`Button`, `LinkButton`, `Field`, `SubTabs`, `Menu`, `Meter`, `ListRow`, `StatePill`, `Confirm`, `EmptyState`), imported **by path** (`../../kit/button/button`), never through `kit/index` (`campaigns-kit-parts.test.mjs`).
  - **Every sentence the page shows comes from contracts.** No new English in TSX. A word the page needs and contracts lacks is added to contracts (Task 1, Task 13).
  - CSS: values are tokens (`var(--…)`), no `style` prop, no class whose words name a primitive (`search`, `tab`, `toggle`, `tile`, `card`, `panel`, `mark`, `field`, `menu`, `drawer`, `empty`, `meter`, `pill`, `chip`, `sheet`…; `tooling/scripts/tests/_css.mjs` `PRIMITIVE_WORDS`), no page rule naming a kit class (`.cmh-row > .pill` is a red build). Media-query widths only 720/900 (`tokens.css`); container queries (`@container cmh (…)`) are free.
  - Functions in `apps/dashboard/src/surfaces` are under 150 lines, 30 branches, depth 5, and **at most 4 parameters** (lint; the tree is in `LIMITED_TREES`). Files under 800 lines. A folder takes at most 20 modules (`tooling/scripts/tests/playbooks/` is **full at 20**: new test files go in `tooling/scripts/tests/playbooks/home/`, which holds 4).
  - A new top-level name declared in a third file fails the copies ratchet: before adding a top-level name, `git grep -n "\b<Name>\b" -- apps packages` and make sure at most one other file declares it.
  - Before every new CSS class: `git grep -nE "(^|[^a-zA-Z0-9_-])<name>([^a-zA-Z0-9_-]|$)" -- apps/dashboard/src e2e tooling/scripts/tests` must print nothing, and `apps/dashboard/app/globals.css` must not declare it bare. (Every class this plan introduces was checked absent on `7ff179717`; re-check, lane 2 may have added one.)
  - A package change (`packages/*`) is rebuilt and its `dist` committed: `corepack pnpm --filter @chanlytics/contracts build` (or `--filter "./packages/*"`).
  - **A contracts barrel changed (`packages/contracts/src/**/index.ts`) regenerates the browser's entry before the build**: `node tooling/scripts/gen/contracts-browser-entry.mjs`, then the build, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs`, and `packages/contracts/src/browser.generated.ts` is committed with the task. A page imports contracts through `dist/browser.js` (`packages/contracts/package.json`, the `browser` condition), so a value missing from it is a page that does not build. Tasks 1, 13, 14 and 15 change barrels.
  - **A new test file imports a dashboard module by a literal path** (`await import("../../../../../apps/dashboard/src/…")`), never through a `${SRC}` template: knip cannot follow a template, so an export only a test reads would be a new dead export (`check:dead-exports`, a CI step).
  - **A hover is a pointer's** (memory `reference_touch_hover_sticks`: a touch screen keeps `:hover` on the last thing tapped): a `:hover` rule this lane writes stands inside `@media (hover: hover)`.
- **Tests.** One file per command: `node tooling/scripts/checks/test.mjs <file>`. **Never** `corepack pnpm test` (20 minutes; Ruben forbade it locally). Typecheck: `corepack pnpm --filter @chanlytics/dashboard typecheck` (and `--filter @chanlytics/contracts`). Lint: `corepack pnpm lint`. Format: `corepack pnpm exec prettier --write <files>`.
- **Commit messages** are the repo's sentence style (what changed, as a sentence), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use a heredoc:

  ```bash
  git commit -F - <<'EOF'
  <sentence>

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  EOF
  ```
- **Shell hazards** (memory): Git Bash `sed -i` flips CRLF; edit files with the Edit tool, never `sed -i`. Write scripts with the Write tool. PowerShell 5.1 has no `&&`.
- **The dev server reads the PRODUCTION database.** Only Task 20 runs it, behind the campaigns rig, which answers every write itself. Nothing else in this plan starts a server or a stack.

## Seams with the other lanes (fixed names)

- **Lane 2 provides** (read it, Task 1): `LifecycleLedger`, `LifecycleGroup`, `LifecycleRow` on `LifecycleHome.ledger` (spec §4.1), `strips`/`lifecycleStrips`/`alsoRunning` gone; `LifecycleStage.summary`, `.bar`, `.act` (the lead's drawer, `open`, even when paused: the card's Resume is the lead row's own `act` in the ledger, Task 8); `JourneyStageId` (`first_contact | before | after | proposal | quiet`); `LIFECYCLE_WORDS.ledger` / `LedgerWords`; `LIFECYCLE_TOAST.paused`; paused's tone plain; `journeyOf`; `CAMPAIGNS_RESULTS_PERIOD`; the `campaign_results` surface and `GET playbooks`' business shape.
- **This lane provides** (lane 4 builds on it): `apps/dashboard/src/surfaces/campaigns/home/ledger/` (`ledger.tsx`, `ledger-row.tsx`, `ledger-phone.tsx`, `use-ledger-view.ts`, plus `ledger-tools.tsx`, `ledger-acts.tsx`, `ledger-keys.ts`); `useLedgerView(ledger, at)` returning at least `{ status, group, query, sort, visibleGroups, visibleRows, … }` with `visibleRows: readonly LifecycleRow[]` the rows the screen shows in order (lane 4 sends at most 40 to Ask), called **once, in `CampaignsHome`** (`home-page.tsx`), where lane 4 reads it; the address `in:<group>`; `ListRow`'s `mark`; decision note `docs/decisions/0040-the-journey-follows-the-business.md`.
- **Lane 4 owns** Ask's words, chips, cards (but this lane moves the `playbook` card's **Open** to the new drawer, §4.6), the head's `cmh-ask` door, the drawer's "Ask about this campaign".
- No migration in this lane.

## File map

| File | What it is | Task |
| --- | --- | --- |
| `packages/contracts/src/playbooks/lifecycle/lifecycle-ledger.ts` (lane 2's) | `LEDGER_STATUSES`, `LedgerStatus`, `ledgerRowIn` (the one predicate the tabs' counts and the filter read), only if lane 2 lacks them; lane 2's `isCampaign` exported as `isLedgerCampaign` (what "how many campaigns" counts, on every line that says it); `ledgerPhoneLine` (a phone row's one line, spec §4.4) | 1 |
| `packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts` (lane 2's) | the ledger words the page reads, where lane 2 lacks one; the composer's title, notice and two doors | 1, 13 |
| `packages/contracts/src/playbooks/index.ts`, `packages/contracts/src/browser.generated.ts` (regenerated) | the new exports, `LifecycleWaiting` among them (lane 2's plan names it in no barrel) | 1, 13, 14, 15 |
| `apps/dashboard/src/surfaces/campaigns/home/address.ts` | `HomeAddress.group`, `parseHome("in:<group>")`, `groupRoute` | 2 |
| `apps/dashboard/src/surfaces/campaigns/home/use-home.ts` | `useKeptGroup`; `useHomeNav` closes with `history.back()` whenever the home is behind; drafts reopen through `swap` | 2 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts` | `ledgerViewOf` (pure) and `useLedgerView` | 3 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts` | `onLedgerKey` (People's keys), the cursor, focus coming home, row marks (settle, arrival) | 4 |
| `apps/dashboard/src/surfaces/kit/list-row/list-row.tsx` + `list-row.type-test.ts` + `kit.css` + `classes.json` + `tooling/scripts/e2e-harness/kit-gallery.mjs` + `tooling/scripts/tests/styles/kit-components.test.mjs` | `ListRow`'s `mark` variant and its gallery entry | 5 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx` | `WaitingActs` (moved from `tiles.tsx`), `ResumeAct`, `AddAct`, `LedgerApproval`, `LedgerActs` | 6 |
| `apps/dashboard/src/surfaces/campaigns/home/tiles.tsx` | Coming up keeps the time and "Waiting on you", no acts; its door goes to Sent; `TileRead` exported; `PhoneReachLine` removed | 6, 9 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-row.tsx` | one desk row | 7 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-tools.tsx` | the tool line, the column heads, the one-off footer | 7 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger.tsx` | the desk ledger | 7 |
| `apps/dashboard/src/surfaces/campaigns/home/rail.tsx` | the card toggle, siblings, `Meter`, Resume; strips and the phone rail gone; hosts the ledger | 8 |
| `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx` | the phone's spine | 9 |
| `apps/dashboard/src/surfaces/campaigns/campaigns.css` | `.cmh-ledger*`, `.cmh-group*`, `.cmh-row*`, the phone's spine; `.cmh-strip*`, `.cmh-vrail*`, `.cmh-vstage*` gone; figures, pad, J3 | 7, 8, 9 |
| `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx` | the wiring | 10 |
| `apps/dashboard/src/surfaces/campaigns/home/new-message.tsx` | "Turn on <moment>" title, no kind switch | 13 |
| `apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx`, `reach-out/row.tsx` | Delete and Remove close the sheet, then toast; the phone drawer's docked Pause/Resume | 12 |
| `apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx`, `composer-sections.tsx`, `composer-acts.ts` | the two doors, the "already has a campaign" notice, the saved id | 13 |
| `packages/contracts/src/today/notifications.ts`, `apps/edge/lib/reach-out/day-numbers.ts` | the bell's reach-out day opens `campaigns/in:reach_out` | 14 |
| `packages/contracts/src/ask-proposals/campaigns.ts` | Ask's playbook card opens the new campaign's drawer | 14 |
| `packages/contracts/src/setup/first-run.ts`, `apps/dashboard/src/surfaces/today/pages/setup-card.tsx` | Today's follow-up card's one door to `campaigns/new:moment:visit_tomorrow` | 14 |
| `packages/contracts/src/consent/consent-page.ts`, `consent/offers-unsubscribe.ts`, `templates/sender-words.ts`, `templates/starter-templates.ts`, `apps/edge/lib/lines/a2p-campaign-facts.ts` | customer-facing "appointment" / "cita" | 15 |
| `tooling/scripts/tests/repo/trade-neutral.test.mjs`; `tooling/scripts/tests/baselines/appointment-words.json` (lane 2's ratchet, banked) | the customer words held; what fell banked | 15 |
| `e2e/shell/phone.spec.ts`, `e2e/campaigns/playbooks.spec.ts` | heads on the line, rows under them; counts read from the answer; J3; rows decide runs | 16 |
| `docs/system-prd.md`, `docs/decisions/0040-the-journey-follows-the-business.md`, `docs/decisions/README.md` | the as-built page; the journey's note | 17 |
| `tooling/scripts/tests/playbooks/home/ledger-view.test.mjs` (new) | the pure decisions: view, keys | 3, 4 |
| `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (new) | the page on the stub React | 6–10 |
| `docs/debt.md` (Rises) | the bundle's row: its reason written in Task 19, its numbers the pull request's CI line, added at the push | 19 |
| `Claude Video/dev-tools/campaigns-rig-scenarios.mjs` (outside the repo) | `salon-many` | 20 |

---

## Task 1: Read lane 2's tree, write down its names, and add what the page reads that it lacks

The view model is lane 2's. This task makes every later task's names true. It changes contracts only where a name the page needs is missing, and keeps lane 2's spelling wherever lane 2 has one.

**Files:**
- Read: `packages/contracts/src/playbooks/lifecycle/` (all of it), `packages/contracts/src/journey/`, lane 2's tests
- Modify (only if a name is missing): `packages/contracts/src/playbooks/lifecycle/lifecycle-ledger.ts`, `packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts`, `packages/contracts/src/playbooks/index.ts` (the barrel names new exports), `packages/contracts/src/browser.generated.ts` (regenerated)
- Test: lane 2's ledger test (find it in Step 1)
- Write (outside the repo, not committed): `C:\Users\Ruben\AppData\Local\Temp\claude\C--Users-Ruben-Documents-Claude-Projects-Claude-Video\67a86058-ecd1-438c-a9fe-a84747bd08bd\scratchpad\lane3-names.md`

- [ ] **Step 1: Read what lanes 1 and 2 committed**

Run:
```bash
git log --oneline d1bb65961..HEAD
git rev-parse HEAD
git ls-files packages/contracts/src/playbooks/lifecycle packages/contracts/src/journey
git ls-files tooling/scripts/tests | grep -E "ledger|journey|lifecycle"
```
Expected: lane 1's and lane 2's commits and the merge of `origin/main`; the five `lifecycle*` modules under `lifecycle/`; `journey/appointment-word.ts`, `journey/journey.ts` (and its barrel if lane 2 made one); lane 2's `ledger.test.mjs` and `journey.test.mjs`. Write the `rev-parse` sha at the top of the names table as **lane 3's base**: Task 18 lists what this lane touched from it.

Read in full: `lifecycle-types.ts`, `lifecycle-ledger.ts`, `lifecycle-words.ts`, `journey/journey.ts`, `journey/appointment-word.ts`, and lane 2's `ledger.test.mjs`.

- [ ] **Step 2: Write the names table**

Create the scratch file `lane3-names.md` (path above) with one row per name this plan uses, and the name lane 2's code really has beside it. This plan was written against lane 2's plan (`docs/superpowers/plans/2026-10-09-moment-lane-2-contracts-core-reads.md`, "What lane 3 receives" and its Tasks 10-11), so the left column is what that plan says it builds; the code wins where it differs:

| This plan uses (from lane 2's plan) | In lane 2's code (fill in) |
| --- | --- |
| `LifecycleHome.ledger: LifecycleLedger` `{ groups, counts {all, running, needs, paused}, tools, sentOnce {n, open} \| null, period, results, words }`, `words: LedgerWords = typeof LIFECYCLE_WORDS.ledger` | |
| `LifecycleGroup` `{ id, caps, glyph, meta, rows, add }`; `id` is `JourneyStageId \| "lists" \| "reach_out" \| "sent_once"` and equals the stage's `LifecycleStage.id`; `add` is Turn on, the calendar's door (a `route` act), "Find businesses to write to", or null | |
| `LifecycleRow` `{ id, kind, name, hint, status, stateWords, phoneWords, tone, needs, needsWords, channels, people {n, unit}, results: LifecycleRowResults, next {words, atMs}, open, waiting, act, search }`; a playbook row's `id` is the playbook's id, a chain's its `root_id` | |
| `LifecycleWaiting` `{ runId, people, refusal }` (Coming up's lines keep theirs; the page stops drawing acts there). **Not in any barrel**: lane 2's plan (Task 11 Step 7) names `LedgerWords`, `LifecycleBar`, `LifecycleGroup`, `LifecycleLedger`, `LifecycleRow` and `LifecycleRowResults` in `playbooks/index.ts`, and `LifecycleWaiting` stood in none before it; Step 7 adds it | |
| lane 2's `isCampaign` in `lifecycle-ledger.ts` (not exported: the counts' "a campaign", the receptionist, the call's text and the month's offer before it is made left out) | |
| `LifecycleStage.summary: string \| null` (one campaign: "Visit reminder · daily 9:00 AM"; many: "3 campaigns · 2 on · 1 paused"), `LifecycleStage.bar: LifecycleBar \| null` = `{ on, waiting, paused, of }` (two or more only) | |
| `LifecycleAct` `resume` carries `ask: { question: string; detail: string }`; Yes is `LIFECYCLE_WORDS.ledger.resume.yes`; under `auto` the `detail` ends with `LIFECYCLE_WORDS.ledger.resume.auto` (lane 2 reads the class's mode from GET playbooks' `modes`) | |
| A paused stage's `act` is still `{ kind: "open" }` (lane 2's `playbookStage`); the card's Resume is the lead row's `act` | |
| `ledgerOrder(by)`, `LEDGER_SORTS`, `type LedgerSort` (contracts, `lifecycle-ledger.ts`) | |
| `LIFECYCLE_WORDS.needsCalendar.door` ("Connect your calendar"); `CALENDAR_SETTING_ROUTE` (contracts `setup/calendar-source.ts`, exists on `7ff179717`) | |
| `home.failed.templates`, `.chains`, `.counts`, `.report` (the results surface's failure), `.reach`, `.coming`, `.results` | |
| `home.rail.phoneWords`, `home.reach.phone { words, offers, yes }`, `home.head.channels` | |
| `journeyOf({ calendarOn, dealsOn, word, held: ReadonlySet<JourneyStageId> }): JourneyStage[]`, `journeyStageOf(trigger)`, `appointmentWordOf({ stored, sellsBy })` | |
| `GET playbooks` answers `calendar`, `deals_on`, `appointment_word`, `bookings_by_email`; the playbooks surface carries `shape: { calendar: "feed" \| "email" \| "none"; dealsOn; word }` | |
| lane 2's bridge in `home/rail.tsx`, `alsoLines` (and its `AlsoLine` type), which this lane deletes with the strips' CSS (Task 8) | |
| lane 2's tests: `tooling/scripts/tests/playbooks/home/ledger.test.mjs`, `tooling/scripts/tests/journey/journey.test.mjs` (which holds the `appointment-words.json` ratchet) | |

If lane 2's resume act carries no `ask` (nothing that says when and to how many), **stop and report it to the coordinator**: those words need the next run as if resumed, which only lane 2's builder reads; do not invent them here.

- [ ] **Step 3: Check the ledger words the page reads**

The page reads these members of `LIFECYCLE_WORDS.ledger` (lane 2's plan, Task 11 Step 4): `heads { campaign, goesBy, people, results, next }`, `tabs { all, needs, paused }`, `needsOf(n)`, `search(n)`, `showing(n, of)`, `showingIn(caps, n, of)`, `clear`, `sort { label, next, name, people, replied }`, `group { label, moment, none }`, `empty`, `dash`, `turnOn`, `results(r)`, `sentOnce { footer(n), open }`, `approve(n)`, `skip`, `resume { label, question(name), detail(when, n), yes }`, `kicker`. Where lane 2's code spelled one otherwise, use lane 2's spelling wherever this plan writes `W.<member>`.

Four names a screen reader is told are not in lane 2's plan; add them to `LIFECYCLE_WORDS.ledger` (and so to `LedgerWords`, its type), beside `heads`:

```ts
    /** The ledger's name to a screen reader. */
    label: "Your campaigns",
    /** The phone's strip of chips, to a screen reader. */
    strip: "Campaigns by moment",
    /** The phone's search circle, which opens the search. */
    find: "Search campaigns",
```
and inside `tabs`: `label: "Campaigns by state",` (the desk's status tabs, to a screen reader).

Lane 2's `needsOf(n)` ("2 campaigns need you", decision 19: "Needs you" names its unit) is the Needs-you tab's `hint` and chip's `hint` (Tasks 7 and 9); write down its spelling.

A phone row's one line (spec §4.4: "Visit tomorrow · today 9:00 AM · 7 people") is not in lane 2's plan: Step 7 adds it as `ledgerPhoneLine(row, caps)` in `lifecycle-ledger.ts`, from the row's own words, so the page draws it and says no word of its own.

Also check `LIFECYCLE_WORDS.coming.link`: Coming up's door goes to Sent's week now (spec §4.3). If lane 2 left it `"Calendar"`, set it to `CAMPAIGN_ROOMS.sent` (already imported in `lifecycle-words.ts` as `CAMPAIGN_ROOMS`).

- [ ] **Step 4: Check the one status predicate**

The status tabs are All, Needs you and Paused (`LIFECYCLE_WORDS.ledger.tabs`; Needs you the one amber, decision 13). The tabs' counts and the page's filter must read one predicate (CLAUDE.md, "One predicate per rule"): lane 2's plan counts them in `lifecycle-ledger.ts`'s `countsOf` (needs: `tone === "warn"`, paused: `status === "paused"`) and exports no predicate for the filter. If lane 2's code exported one, write its name in the table and use it in Task 3; if not, add it (Steps 5-7), and make `countsOf` read it.

So is "how many campaigns": the All tab and "Search 19 campaigns" say `counts.all`, campaigns alone (`isCampaign`), and the tool line's "Showing 7 of 19" must count the same rows, not the receptionist, the call's text or the month's offer before it is made. Step 7 exports lane 2's `isCampaign` as `isLedgerCampaign`, and Task 3 counts with it.

- [ ] **Step 5: Write the failing test**

Append to `tooling/scripts/tests/playbooks/home/ledger.test.mjs` (lane 2's; it imports contracts as `C` in lane 2's plan, and builds homes with its own `home(…)`/`playbooks(…)`/`playbook(…)` helpers; use the names the file really has):

```js
test("a status tab counts what it shows: the counts and the page's filter read one predicate", () => {
  const rows = [
    { kind: "playbook", status: "waiting", tone: "warn" },
    { kind: "list", status: "on", tone: "warn" },
    { kind: "playbook", status: "paused", tone: "plain" },
    { kind: "playbook", status: "on", tone: "ok" },
    { kind: "sent_once", status: "on", tone: "plain" },
    // The call's text with no message is amber, but it is First contact's own row, not a campaign: no tab counts it.
    { kind: "call_text", status: "off", tone: "warn" },
  ];
  assert.deepEqual([...C.LEDGER_STATUSES], ["all", "needs", "paused"]);
  assert.deepEqual(rows.map((r) => C.ledgerRowIn(r, "needs")), [true, true, false, false, false, false], "a run waiting, an archived list");
  assert.deepEqual(rows.map((r) => C.ledgerRowIn(r, "paused")), [false, false, true, false, false, false]);
  assert.ok(rows.every((r) => C.ledgerRowIn(r, "all")), "All holds the one-off sends too: the rows add up to what came back");
  // And the ledger's own counts are that predicate's, over a real home (lane 2's file builds it with `ledger(over)`).
  const l = ledger({ playbooks: playbooks([playbook(), playbook({ id: "pb-p", state: "paused", next: "paused" })]) });
  const all = l.groups.flatMap((g) => g.rows);
  for (const s of ["needs", "paused"]) assert.equal(l.counts[s], all.filter((r) => C.ledgerRowIn(r, s)).length, s);
});

test("the ledger's names to a screen reader are contracts' too", () => {
  const W = C.LIFECYCLE_WORDS.ledger;
  assert.deepEqual([W.label, W.tabs.label, W.strip, W.find], [
    "Your campaigns",
    "Campaigns by state",
    "Campaigns by moment",
    "Search campaigns",
  ]);
});

test("how many campaigns is one count: the receptionist, the call's text and an offer not made yet are no campaign", () => {
  const l = ledger({ playbooks: playbooks([playbook(), playbook({ id: "pb-p", state: "paused", next: "paused" })]) });
  const all = l.groups.flatMap((g) => g.rows);
  assert.equal(all.filter(C.isLedgerCampaign).length, l.counts.all, "the All tab's figure is the rows it counts");
  assert.deepEqual(
    all.filter((r) => !C.isLedgerCampaign(r)).map((r) => r.kind).sort(),
    ["call_text", "offer", "receptionist"],
  );
});

test("a phone row says its moment, its next run and who is at it, in one line; a run that waits says so once, on its pill", () => {
  const rows = [
    playbook({ id: "pb-v", name: "Reminder", trigger: "visit_tomorrow", named: { pool: 7, saidYes: 7 } }),
    playbook(),
    playbook({ id: "pb-p", state: "paused", next: "paused" }),
    playbook({ id: "pb-w", trigger: "lapsed", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
  ];
  const l = ledger({ playbooks: playbooks(rows), broadcasts: broadcasts([run({ playbook_id: "pb-w" })]) });
  const line = (id) => {
    const g = l.groups.find((x) => x.rows.some((r) => r.id === id));
    return C.ledgerPhoneLine(row(l, id), g.caps);
  };
  assert.equal(line("pb-v"), "Appointment tomorrow · tomorrow 10:00 AM · 7 people");
  assert.equal(line("pb-p"), "Quiet or lapsed · Paused · 5 people", "a paused row's end is its Resume: the line says it rests");
  assert.equal(line("pb-w"), "Quiet or lapsed · 5 people", "Waiting on you is the pill's, said once");
  assert.equal(line("receptionist"), `First contact · ${row(l, "receptionist").people.n} this week`, "no next run: none said");
});
```

(The figures are lane 2's fixture's: `named.pool`, the moment's caption and its `next`. Where lane 2's code words a caption or a unit otherwise, assert its words, as its own tests do.)

- [ ] **Step 6: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs`
Expected: FAIL (`C.ledgerRowIn is not a function`, `C.isLedgerCampaign` and `C.ledgerPhoneLine` too; the four words undefined).

- [ ] **Step 7: Add what is missing**

In `packages/contracts/src/playbooks/lifecycle/lifecycle-ledger.ts`, before lane 2's `countsOf`:

```ts
/** The ledger's status tabs, in the order they stand: All, Needs you (the one amber, decision 13), Paused. */
export const LEDGER_STATUSES = ["all", "needs", "paused"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * Whether a row stands under a status tab: the one predicate the tabs' counts and the page's filter both read. Needs you
 * is what the row's tone asks to be seen for (a run waiting on the owner, a list archived under a running campaign);
 * Paused is paused; a one-off send, the receptionist and the call's text stand under All alone (the counts are
 * campaigns', lane 2's `countsOf`).
 */
export function ledgerRowIn(row: Pick<LifecycleRow, "kind" | "status" | "tone">, status: LedgerStatus): boolean {
  if (status === "all") return true;
  if (row.kind === "sent_once" || row.kind === "receptionist" || row.kind === "call_text") return false;
  return status === "needs" ? row.tone === "warn" : row.status === "paused";
}
```

and in `countsOf`, `needs` and `paused` read it (`running` stays lane 2's: it is a count no tab filters by):

```ts
    needs: campaigns.filter((r) => ledgerRowIn(r, "needs")).length,
    paused: campaigns.filter((r) => ledgerRowIn(r, "paused")).length,
```

Make lane 2's `isCampaign` the exported `isLedgerCampaign` (rename it where it is declared, `lifecycle-ledger.ts` ~419, and in `groupMetaOf` and `countsOf`, its two readers; lane 2 named the plan's `metaOf` `groupMetaOf` for the copies ratchet), with its comment:

```ts
/** A campaign, as every "how many campaigns" counts it: not First contact's own rows, nor the month's offer before it is made. */
export const isLedgerCampaign = (r: LifecycleRow): boolean =>
  r.kind !== "receptionist" && r.kind !== "call_text" && !(r.kind === "offer" && r.status === "off");
```

and after `ledgerOrder`:

```ts
/**
 * A row's one line on a phone (spec 2026-10-09 §4.4): its moment, its next run and who is at it now ("Appointment
 * tomorrow · tomorrow 10:00 AM · 7 people"), each said where it is known. A run that waits says so on the row's pill, so
 * the line leaves it out; a paused row's end is its Resume, so the line says it rests.
 */
export function ledgerPhoneLine(r: LifecycleRow, caps: string): string {
  const dash = LIFECYCLE_WORDS.ledger.dash;
  const next = r.status === "waiting" || r.next.words === dash ? null : r.next.words;
  const people = r.people.n === null ? null : `${r.people.n} ${r.people.unit}`;
  return [caps, next, people].filter((p): p is string => !!p).join(" · ");
}
```

Name them in `packages/contracts/src/playbooks/index.ts` beside lane 2's line for the ledger: `export { LEDGER_SORTS, LEDGER_STATUSES, isLedgerCampaign, ledgerOrder, ledgerPhoneLine, ledgerRowIn } from "./lifecycle/lifecycle-ledger";` and `export type { LedgerSort, LedgerStatus } from "./lifecycle/lifecycle-ledger";`, and add `LifecycleWaiting` to the `export type { … } from "./lifecycle/lifecycle-types";` list (the row's acts import it, Task 6). Add the four words of Step 3 to `LIFECYCLE_WORDS.ledger`. (Check `ledgerRowIn`, `LEDGER_STATUSES`, `isLedgerCampaign` and `ledgerPhoneLine` are free names: `git grep -n "ledgerRowIn\|LEDGER_STATUSES\|isLedgerCampaign\|ledgerPhoneLine" -- apps packages`.)

- [ ] **Step 8: Build contracts and run the test**

Run:
```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
```
Expected: PASS ×3. The barrel changed, so the browser's entry is regenerated before the build, every time (Read this first).

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist tooling/scripts/tests/playbooks/home/ledger.test.mjs
git commit -F - <<'EOF'
The ledger's tabs count what they show through one predicate, and its words are all in contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 2: The group in the address, kept under sheets

`campaigns/in:<group>` names the group the ledger shows alone. `in:` and `moment:` share one param (`home/route.tsx` reads `route.split("/")[1]`), so while a sheet stands the address names the sheet and the page keeps the group it had. A filter replaces the address, never pushes. A sheet closes with `history.back()` whenever the home is the entry behind it, whoever pushed it (a bell row, Ask's card, a door the page drew); one the page arrived at by a link has no entry behind, and closing replaces the address with the kept group's.

**Files:**
- Modify: `apps/dashboard/src/surfaces/campaigns/home/address.ts`
- Modify: `apps/dashboard/src/surfaces/campaigns/home/use-home.ts` (`useHomeNav` and `useReopenDrafts`, lines 91-135 at `7ff179717`, below where lane 2's `useHomeData` grew: find them by name; add `useKeptGroup`)
- Test: `tooling/scripts/tests/playbooks/campaigns-routes.test.mjs:33-67`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/playbooks/campaigns-routes.test.mjs`, change line 19 to also import `groupRoute`:

```js
const { parseHome, momentRoute, composeRoute, groupRoute } = await import(`${S}/campaigns/home/address.ts`);
```

Replace the expected objects of the first home test (lines 34-52) so each carries `group: null` first:

```js
  assert.deepEqual(parseHome(null), { group: null, moment: null, compose: null });
  assert.deepEqual(parseHome("moment:pb-1"), { group: null, moment: "pb-1", compose: null });
  assert.deepEqual(parseHome("new"), { group: null, moment: null, compose: { mode: "once", to: null } });
  assert.deepEqual(
    parseHome("new:to:s1"),
    { group: null, moment: null, compose: { mode: "once", to: "s1" } },
    "the audience it is for",
  );
  assert.deepEqual(parseHome("new:to:"), parseHome("new"), "no audience named is no audience");
  assert.deepEqual(parseHome("new:every"), {
    group: null,
    moment: null,
    compose: { mode: "every", moment: null, edit: null },
  });
  assert.deepEqual(parseHome("new:moment:quiet_30"), {
    group: null,
    moment: null,
    compose: { mode: "every", moment: "quiet_30", edit: null },
  });
  assert.deepEqual(parseHome("new:edit:pb-1"), {
    group: null,
    moment: null,
    compose: { mode: "every", moment: null, edit: "pb-1" },
  });
```

Add a test after it:

```js
test("the ledger's group is the address's own: campaigns/in:<group>, word-free, spelled back as it was read", () => {
  assert.deepEqual(parseHome("in:before"), { group: "before", moment: null, compose: null });
  assert.deepEqual(parseHome("in:reach_out"), { group: "reach_out", moment: null, compose: null });
  // Word-free ids only (decision 46): a word, a hyphen, a capital or nothing is the home, never a group of nothing.
  for (const odd of ["in:", "in:Before", "in:visit-tomorrow", "in:../x", "in:1st", "in:before:x"])
    assert.deepEqual(parseHome(odd), parseHome(null), odd);
  assert.equal(groupRoute("before"), "campaigns/in:before");
  assert.equal(groupRoute(null), "campaigns", "every group is the home");
  assert.equal(parseHome(groupRoute("lists").split("/")[1]).group, "lists", "and back");
  // A sheet's address names the sheet alone: the group it stood over is kept by the page (use-home.ts useKeptGroup).
  assert.equal(momentRoute("pb-1"), "campaigns/moment:pb-1");
  assert.equal(composeRoute("every", { moment: "visited" }), "campaigns/new:moment:visited");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs`
Expected: FAIL (`groupRoute is not a function`, and the deepEquals lack `group`).

- [ ] **Step 3: Write the address**

Replace the whole of `apps/dashboard/src/surfaces/campaigns/home/address.ts` with:

```ts
/**
 * Campaigns' home addresses (`campaigns/<param>`): the page, the group its ledger shows, a moment open beside it, and the
 * composer.
 *
 *   campaigns                        the home, every group
 *   campaigns/in:<group>             the ledger narrowed to one group: a journey stage's word-free id (`before`), `lists`,
 *                                    `reach_out` or `sent_once` (decision 46); a card's press or a phone's chip replaces it
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer, the address every old `outbound/<id>` lands on
 *   campaigns/new                    the composer, on Send once
 *   campaigns/new:to:<audience>      the same, on the list or audience it was asked for (every old `broadcasts/<audience>` lands here)
 *   campaigns/new:every              the composer, on Every time a moment comes
 *   campaigns/new:moment:<trigger>   the same, on the moment a Turn on was pressed for
 *   campaigns/new:edit:<id>          the same, changing the playbook the drawer showed; a reach-out's id opens its own sheet
 *
 * The drawer and the composer are the address's, as the Inbox's thread is: opened by the page, pushed so Back closes it;
 * arrived at by a link, replaced when closed. A composer opened over a drawer is pushed over it, so Back, and Cancel, return to
 * the detail it came from. The group is replaced, never pushed (decision 11), and one param holds either it or a sheet, so
 * while a sheet stands the page keeps the group it had (use-home.ts useKeptGroup). A word the page does not know is the
 * home (a link must never land on nothing).
 */

/** What the address asks of the page: the group its ledger shows, a moment open, and the composer. */
export interface HomeAddress {
  /** The group the ledger shows alone, or null for every group. */
  group: string | null;
  /** The playbook or reach-out open in the drawer. */
  moment: string | null;
  /**
   * The composer: Send once (on the audience asked for, or the one it opens on), or Every time a moment comes, on a moment,
   * or changing one.
   */
  compose: null | { mode: "once"; to: string | null } | { mode: "every"; moment: string | null; edit: string | null };
}

/** The home itself. Read here alone: use-home.ts closes to `groupRoute(null)`, so an export would be a dead one. */
const HOME_ROUTE = "campaigns";

const NONE: HomeAddress = { group: null, moment: null, compose: null };

/** A group's id as an address writes it: word-free, lower case, words joined by underscores (`before`, `reach_out`). */
const GROUP_ID = /^[a-z]+(?:_[a-z]+)*$/;

/** The composer an address names, or null where it names none. */
function composeOf(param: string): HomeAddress["compose"] | undefined {
  if (param === "new") return { mode: "once", to: null };
  if (param.startsWith("new:to:")) {
    const to = param.slice("new:to:".length);
    return { mode: "once", to: to || null };
  }
  if (param === "new:every") return { mode: "every", moment: null, edit: null };
  if (param.startsWith("new:moment:")) {
    const moment = param.slice("new:moment:".length);
    return { mode: "every", moment: moment || null, edit: null };
  }
  if (param.startsWith("new:edit:")) {
    const edit = param.slice("new:edit:".length);
    return edit ? { mode: "every", moment: null, edit } : undefined;
  }
  return undefined;
}

/** What an address's param says (`campaigns/<param>`, the part after the slash, or null for the home). */
export function parseHome(param: string | null): HomeAddress {
  if (!param) return NONE;
  if (param.startsWith("in:")) {
    const group = param.slice("in:".length);
    return GROUP_ID.test(group) ? { ...NONE, group } : NONE;
  }
  if (param.startsWith("moment:")) {
    const id = param.slice("moment:".length);
    return id ? { ...NONE, moment: id } : NONE;
  }
  const compose = composeOf(param);
  return compose ? { ...NONE, compose } : NONE;
}

/** The route an address is spelled as: the shell's, `campaigns/moment:<id>`. */
function homeRoute(a: HomeAddress): string {
  if (a.moment) return `${HOME_ROUTE}/moment:${a.moment}`;
  const c = a.compose;
  if (!c) return a.group ? `${HOME_ROUTE}/in:${a.group}` : HOME_ROUTE;
  if (c.mode === "once") return c.to ? `${HOME_ROUTE}/new:to:${c.to}` : `${HOME_ROUTE}/new`;
  if (c.edit) return `${HOME_ROUTE}/new:edit:${c.edit}`;
  return c.moment ? `${HOME_ROUTE}/new:moment:${c.moment}` : `${HOME_ROUTE}/new:every`;
}

/** A moment open in the drawer. */
export const momentRoute = (id: string): string => homeRoute({ ...NONE, moment: id });

/** The ledger narrowed to one group, or every group for null: what a card's press and a phone's chip replace the address with. */
export const groupRoute = (group: string | null): string => homeRoute({ ...NONE, group });

/** What the composer is opened on: the audience a send is for, the moment a Turn on was pressed for, the playbook being changed. */
interface ComposeOn {
  to?: string | null;
  moment?: string | null;
  edit?: string | null;
}

/** The composer on a mode: Send once (on an audience), or Every time a moment comes, on a moment or changing one. */
export const composeRoute = (mode: "once" | "every", on: ComposeOn = {}): string =>
  homeRoute({
    ...NONE,
    compose: mode === "once" ? { mode, to: on.to ?? null } : { mode, moment: on.moment ?? null, edit: on.edit ?? null },
  });
```

- [ ] **Step 4: Keep the group, and close to it**

In `apps/dashboard/src/surfaces/campaigns/home/use-home.ts`:

Change its import of `./address` (near the top) to:
```ts
import { composeRoute, groupRoute } from "./address";
import type { HomeAddress } from "./address";
```
(`HOME_ROUTE` is no longer read here, and address.ts no longer exports it: `git grep -n "HOME_ROUTE" -- apps tooling e2e` prints address.ts alone.)

Replace `useHomeNav` (with the comment above it) and `useReopenDrafts` (with its comment) with:

```ts
/**
 * The group the ledger shows: the address's while it names no sheet, and the one it had while a sheet stands, since one
 * param holds either (address.ts). A drawer opened from "Visit tomorrow" leaves the ledger behind it narrowed as it was.
 */
export function useKeptGroup(address: HomeAddress): string | null {
  const kept = useRef<string | null>(address.group);
  if (address.moment === null && address.compose === null) kept.current = address.group;
  return kept.current;
}

/**
 * Opening and closing what the address names. Opening pushes an entry, so Back closes it (a peek's rule: Leads', the
 * Pipeline's); changing one thing for another, and narrowing the ledger, replace it. A sheet that opened over the home the
 * page stood on has the home behind it, whoever pushed it (a bell row, Ask's card, a door the page drew): closing goes
 * back. One the page swapped in, or a link arrived at, has no entry of the page's behind it: closing replaces the address
 * with the home, narrowed to the group it kept.
 */
export function useHomeNav(address: HomeAddress, group: string | null) {
  // How many entries stand over the home: the drawer, and a composer opened over it.
  const pushed = useRef(0);
  const swapped = useRef(false);
  const open = address.moment !== null || address.compose !== null;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (!open) pushed.current = 0;
    else if (!wasOpen.current && pushed.current === 0 && !swapped.current) pushed.current = 1;
    swapped.current = false;
    wasOpen.current = open;
  }, [open]);
  const push = (route: string) => {
    pushed.current += 1;
    navigate(route);
  };
  const swap = (route: string) => {
    swapped.current = true;
    replaceRoute(route);
  };
  // The ledger narrowed, or let go: the home's own address replaced, which opens no sheet, so it marks no swap (a mark
  // left by it would make the next sheet a bell row pushes close past the home).
  const narrow = (to: string | null) => replaceRoute(groupRoute(to));
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else replaceRoute(groupRoute(group));
  };
  return { push, swap, narrow, close };
}

/**
 * Words half-written when the page was left come back as the page does (the tab kept them, useUnsavedWork): a send under
 * "new", a playbook under "new:every", a change to a playbook under its own address. Once, on arrival at the home itself,
 * swapped in (`swap`), so its sheet has no home behind it to go back to.
 */
export function useReopenDrafts(
  address: HomeAddress,
  playbooks: PlaybooksSurface | undefined,
  swap: (route: string) => void,
) {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !playbooks) return;
    asked.current = true;
    if (address.moment !== null || address.compose !== null) return;
    if (tabDraft("broadcast")) swap(composeRoute("once"));
    else if (tabDraft("playbook", "new")) swap(composeRoute("every"));
    else {
      const editing = playbooks.rows.find((p) => !!tabDraft("playbook", p.id));
      if (editing) swap(composeRoute("every", { edit: editing.id }));
    }
  }, [playbooks]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the first read lands
}
```

The `replaceRoute` import stays (used by `close`). `home-page.tsx` calls these in Task 10; until then it still compiles against the old signatures? No: update its two calls now so the tree typechecks:

In `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx`, change these lines of `CampaignsHome` (195-201 at `7ff179717`; from `const address = parseHome(param);` to `useReopenDrafts(address, playbooks);`) to:
```tsx
  const address = parseHome(param);
  const group = useKeptGroup(address);
  const nav = useHomeNav(address, group);
  const [toastNode, flash] = useLegacyToast();
  const phone = useCmPhone();
  // Who may start, change or run a playbook, or send: the role store's answer, View-as included.
  const canAct = !!canDo("approve");
  useReopenDrafts(address, playbooks, nav.swap);
```
and its import of `./use-home` to `import { useHomeData, useHomeNav, useKeptGroup, useReopenDrafts } from "./use-home";`.

- [ ] **Step 5: Run the tests**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-drafts.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS, PASS, no type errors. (`campaigns-drafts` holds the drafts' reopen: it reads `replaced`, which `swap` still writes.)

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/surfaces/campaigns/home/address.ts apps/dashboard/src/surfaces/campaigns/home/use-home.ts apps/dashboard/src/surfaces/campaigns/home/home-page.tsx tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
git commit -F - <<'EOF'
Campaigns' address names the group its ledger shows, kept while a sheet stands, and a sheet over the home closes back to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 3: What the ledger shows (`ledgerViewOf`, `useLedgerView`)

One pure function decides which groups and rows the screen shows, in which order, and how many of how many; a hook holds the page's state around it. Status, search, sort and grouping are page state (reset on reload, decision 7); the group is the address's (Task 2). Under seven rows (`ledger.tools` false) only the group narrows. A phone holds one choice, sorts by Next and keeps the groups (decision 16).

**Files:**
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts`
- Create: `tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`:

```js
/**
 * Campaigns' ledger, the decisions with no markup (spec 2026-10-09 §4.3, §4.4): what the screen shows for a status, a
 * group, words searched, an order and a grouping (ledgerViewOf), how the page holds them (useLedgerView, on the stub
 * React), and what a key does (onLedgerKey, Task 4). Rows here are made by hand in the view model's shape (contracts
 * LifecycleRow), so each rule is seen alone; the page over the real view model is ledger-page.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

installLegacyReact();
// Literal paths, so knip sees the exports these tests read (Read this first).
const { ledgerViewOf, useLedgerView } = await import(
  "../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts"
);

const NOW = Date.parse("2026-10-09T13:00:00Z");
const HOUR = 3_600_000;

/** A row in the view model's shape, a playbook running by default, with whatever a test changes of it. */
const row = (id, over = {}) => ({
  id,
  kind: "playbook",
  name: id,
  hint: "",
  status: "on",
  stateWords: "On",
  phoneWords: "",
  tone: "ok",
  needs: "messages",
  needsWords: "",
  channels: [],
  people: { n: 0, unit: "people" },
  results: "none",
  next: { words: "", atMs: null },
  open: null,
  waiting: null,
  act: null,
  search: id,
  ...over,
});
const group = (id, rows, add = null) => ({ id, caps: id.toUpperCase(), glyph: "bell", meta: "", rows, add });
const ledgerOf = (groups, tools = true) => ({
  groups,
  counts: { all: 0, running: 0, needs: 0, paused: 0 },
  tools,
  sentOnce: null,
  period: "Last 30 days",
  results: "read",
  words: {},
});
const ASK = { status: "all", group: null, query: "", sort: "next", grouping: "moment" };
const ids = (shown) => shown.rows.map((r) => r.id);
const TURN_ON = { kind: "turn_on", label: "Turn on", moment: "visited" };

test("Next puts a run that waits first, then the soonest, and what has no time last; ties go by name", () => {
  const l = ledgerOf([
    group("before", [
      row("paused", { status: "paused", next: { words: "Paused", atMs: null } }),
      row("later", { next: { words: "tomorrow", atMs: NOW + 20 * HOUR } }),
      row("soon", { next: { words: "today", atMs: NOW + HOUR } }),
      row("waits", { status: "waiting", tone: "warn", next: { words: "now", atMs: NOW } }),
      row("also-soon", { next: { words: "today", atMs: NOW + HOUR } }),
    ]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, ASK)), ["waits", "also-soon", "soon", "later", "paused"]);
});

test("a desk sorts by name, by who is at it now, or by what came back, the uncounted last", () => {
  const l = ledgerOf([
    group("quiet", [
      row("b", { people: { n: 4, unit: "people" }, results: { kind: "sent", sent: 10, replied: 1 } }),
      row("a", { people: { n: null, unit: "people" }, results: "uncounted" }),
      row("c", { people: { n: 9, unit: "people" }, results: { kind: "written", written: 40, wroteBack: 6 } }),
    ]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "name" })), ["a", "b", "c"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "people" })), ["c", "b", "a"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, sort: "replied" })), ["c", "b", "a"]);
});

test("a status tab shows what the one predicate says it holds; a one-off send stands under All alone", () => {
  const l = ledgerOf([
    group("before", [row("on"), row("waits", { status: "waiting", tone: "warn" }), row("rest", { status: "paused", tone: "plain" })]),
    group("sent_once", [row("once", { kind: "sent_once" })]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "needs" })), ["waits"]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "paused" })), ["rest"]);
  assert.ok(ids(ledgerViewOf(l, ASK)).includes("once"), "All counts the one-off sends, so the rows add up");
});

test("a group narrows to itself, a group the ledger has not got narrows nothing, and the count says how many of how many", () => {
  const l = ledgerOf([group("before", [row("r1"), row("r2")]), group("quiet", [row("w1")])]);
  const one = ledgerViewOf(l, { ...ASK, group: "quiet" });
  assert.deepEqual(ids(one), ["w1"]);
  assert.equal(one.chosen.id, "quiet");
  assert.deepEqual([one.shown, one.total, one.filtered], [1, 3, true]);
  const none = ledgerViewOf(l, { ...ASK, group: "proposal" });
  assert.equal(none.chosen, null, "an address naming a group that is not here is the whole ledger");
  assert.deepEqual([none.shown, none.filtered], [3, false]);
});

test("how many is campaigns': the receptionist and the call's text are drawn, never counted, as the All tab counts", () => {
  const l = ledgerOf([
    group("first_contact", [row("receptionist", { kind: "receptionist", status: "always" }), row("call_text", { kind: "call_text" }), row("w1")]),
  ]);
  const shown = ledgerViewOf(l, ASK);
  assert.deepEqual([shown.rows.length, shown.shown, shown.total], [3, 1, 1]);
});

test("words searched match the row's own words for a search, any case, and an empty moment stands with its Turn on under All alone", () => {
  const l = ledgerOf([
    group("before", [row("r1", { name: "Visit reminder", search: "visit reminder whatsapp" })]),
    group("after", [], TURN_ON),
    group("quiet", [row("w1", { name: "Win-back", search: "win-back quiet 30 days" })]),
  ]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, query: "  WhatsApp " })), ["r1"]);
  assert.deepEqual(
    ledgerViewOf(l, ASK).groups.map((g) => g.id),
    ["before", "after", "quiet"],
    "under All the empty moment draws, with its Turn on",
  );
  assert.deepEqual(
    ledgerViewOf(l, { ...ASK, query: "win" }).groups.map((g) => g.id),
    ["quiet"],
    "under a filter it does not",
  );
});

test("a row decided under a filter keeps its place until the filter changes: nothing slides from under the pointer", () => {
  const l = ledgerOf([group("before", [row("approved", { status: "on" }), row("waits", { status: "waiting", tone: "warn" })])]);
  assert.deepEqual(ids(ledgerViewOf(l, { ...ASK, status: "needs" })), ["waits"]);
  assert.deepEqual(
    ids(ledgerViewOf(l, { ...ASK, status: "needs", keep: "approved" })),
    ["waits", "approved"],
    "the row just approved stays on the screen under the tab it was decided in, its state changed in place",
  );
});

test("without grouping the rows are one list in the order chosen", () => {
  const l = ledgerOf([group("before", [row("b")]), group("quiet", [row("a"), row("c")])]);
  const flat = ledgerViewOf(l, { ...ASK, sort: "name", grouping: "none" });
  assert.equal(flat.grouped, false);
  assert.deepEqual(flat.groups, []);
  assert.deepEqual(ids(flat), ["a", "b", "c"]);
});

test("under seven rows only the group narrows; a phone holds one choice, sorts by Next and keeps the groups", () => {
  const groups = [
    group("before", [row("b", { next: { words: "", atMs: NOW + 2 * HOUR } })]),
    group("quiet", [row("a", { status: "paused", tone: "plain", next: { words: "Paused", atMs: null } })]),
  ];
  const went = [];
  const at = (over = {}) => ({ group: null, onGroup: (g) => went.push(g), phone: false, ...over });
  // Few rows: no tools, so a status, words and an order set earlier are not applied.
  fresh();
  let view = again(() => useLedgerView(ledgerOf(groups, false), at()));
  view.setStatus("paused");
  view.setQuery("zzz");
  view.setSort("name");
  view = again(() => useLedgerView(ledgerOf(groups, false), at()));
  assert.deepEqual([view.status, view.query, view.sort], ["all", "", "next"]);
  assert.deepEqual(view.visibleRows.map((r) => r.id), ["b", "a"]);
  // A phone: a status clears the group the address names, a group clears the status, and the order is Next.
  fresh();
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "quiet", phone: true })));
  view.setSort("name");
  view.setStatus("needs");
  assert.deepEqual(went, [null], "Needs you lets go of in:<group>");
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: null, phone: true })));
  assert.equal(view.sort, "next", "a phone sorts by Next");
  view.setGroup("before");
  assert.deepEqual(went, [null, "before"]);
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "before", phone: true })));
  assert.equal(view.status, "all", "a group chip clears the status");
  // A desk composes the two: a status keeps the group.
  fresh();
  went.length = 0;
  view = again(() => useLedgerView(ledgerOf(groups), at({ group: "quiet" })));
  view.setStatus("paused");
  assert.deepEqual(went, [], "on a desk a tab and a card compose");
});

test("Escape lets go of the words first, then of the filter; Clear lets go of all at once", () => {
  const groups = [group("before", [row("b")]), group("quiet", [row("a")])];
  const went = [];
  const at = { group: "quiet", onGroup: (g) => went.push(g), phone: false };
  fresh();
  let view = again(() => useLedgerView(ledgerOf(groups), at));
  view.setQuery("a");
  view.setStatus("paused");
  view = again(() => useLedgerView(ledgerOf(groups), at));
  view.clearOne();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.query, view.status, went], ["", "paused", []], "the words go first");
  view.clearOne();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.status, went], ["all", [null]], "then the status and the group");
  went.length = 0;
  view.setQuery("b");
  view = again(() => useLedgerView(ledgerOf(groups), at));
  view.clearAll();
  view = again(() => useLedgerView(ledgerOf(groups), at));
  assert.deepEqual([view.query, view.status, went], ["", "all", [null]]);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`
Expected: FAIL (`Cannot find module …/use-ledger-view.ts`).

- [ ] **Step 3: Write the module**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts` (if Task 1 recorded other names for `ledgerRowIn`, `LedgerStatus` or `LEDGER_STATUSES`, use them):

```ts
/**
 * Campaigns' ledger, as the page narrows it (spec 2026-10-09 §4.3, §4.4; decisions 7, 8, 15 and 16): the status a tab
 * picks, the group the address names (`campaigns/in:<group>`), the words searched for, the order, and whether the rows
 * stand in their groups. The status, the words, the order and the grouping are the page's own and reset on reload; the
 * group is the address's, replaced as it changes and kept while a sheet stands (use-home.ts useKeptGroup).
 *
 * `ledgerViewOf` is the decision, pure, over the view model's groups (contracts LifecycleLedger): which groups and rows
 * the screen shows, in which order, and how many of how many. `useLedgerView` holds the page's state around it, once, in
 * the page (home-page.tsx), where Ask's door reads `visibleRows`: what the screen shows, in order.
 *
 * Under seven rows (`ledger.tools` false) there is no tool line, so only the group narrows the list: the status is All,
 * nothing is searched, the order is Next and the rows stand in their groups. A phone holds one choice (a group or a
 * status, never both), sorts by Next and keeps the groups; a desk composes a card and a tab.
 */
import { useState } from "react";
import { isLedgerCampaign, ledgerOrder, ledgerRowIn } from "@chanlytics/contracts";
import type { LedgerSort, LedgerStatus, LifecycleGroup, LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";

/** Whether the rows stand under their groups' heads, or as one list in the order chosen. */
export const LEDGER_GROUPINGS = ["moment", "none"] as const;
export type LedgerGrouping = (typeof LEDGER_GROUPINGS)[number];

/** What the page asks of the ledger. */
interface LedgerAsk {
  status: LedgerStatus;
  group: string | null;
  query: string;
  sort: LedgerSort;
  grouping: LedgerGrouping;
  /**
   * A row decided where it stands (approved, skipped, resumed): it keeps its place under the filter it was decided in,
   * its state changed in place, until the filter changes (spec §4.3: nothing slides out from under the pointer).
   */
  keep?: string | null;
}

/** What the screen shows. */
interface LedgerShown {
  /** The groups drawn, each with the rows it shows, in order; none where the rows do not stand in groups. */
  groups: readonly LifecycleGroup[];
  /** Every row drawn, in the order the screen shows them. */
  rows: readonly LifecycleRow[];
  /** Whether the rows stand under their groups' heads. */
  grouped: boolean;
  /** The group the address names, where the ledger holds it. */
  chosen: LifecycleGroup | null;
  /**
   * How many campaigns the ledger holds, and how many of them are shown: the All tab's count (contracts isLedgerCampaign),
   * so "Showing 7 of 19" and "Search 19 campaigns" say one number. The receptionist and the call's text are drawn, not
   * counted; whether anything is drawn is `rows`.
   */
  total: number;
  shown: number;
  /** Whether anything narrows the list: a status but All, a group, words searched. */
  filtered: boolean;
}

/** Whether a row answers the words searched: its own words for a search (the view model's `search`), any case. */
const answers = (r: LifecycleRow, words: string): boolean => words === "" || r.search.toLowerCase().includes(words);

/** The ledger as the screen shows it, for what the page asks. */
export function ledgerViewOf(ledger: LifecycleLedger, ask: LedgerAsk): LedgerShown {
  const words = ask.query.trim().toLowerCase();
  const chosen = ledger.groups.find((g) => g.id === ask.group) ?? null;
  const filtered = ask.status !== "all" || chosen !== null || words !== "";
  // The order is contracts' one (lifecycle-ledger.ts ledgerOrder): Next is a run waiting, then what runs by its time,
  // then what does not, paused last; ties by name.
  const order = ledgerOrder(ask.sort);
  const keep = (r: LifecycleRow) => r.id === ask.keep || (ledgerRowIn(r, ask.status) && answers(r, words));
  const groups = ledger.groups
    .filter((g) => chosen === null || g.id === chosen.id)
    .map((g) => ({ ...g, rows: g.rows.filter(keep).sort(order) }))
    // Under All an empty moment stands with its Turn on (decision 16); under a filter a group with no row is not drawn.
    .filter((g) => g.rows.length > 0 || (!filtered && g.add !== null));
  const total = ledger.groups.reduce((n, g) => n + g.rows.filter(isLedgerCampaign).length, 0);
  const inGroups = groups.flatMap((g) => g.rows);
  const shown = inGroups.filter(isLedgerCampaign).length;
  if (ask.grouping === "moment") {
    return { groups, rows: inGroups, grouped: true, chosen, total, shown, filtered };
  }
  const rows = [...inGroups].sort(order);
  return { groups: [], rows, grouped: false, chosen, total, shown, filtered };
}

/** Where the group lives and how it changes (the address's, replaced: home-page.tsx), and whether this is a phone. */
interface LedgerAt {
  group: string | null;
  onGroup: (group: string | null) => void;
  phone: boolean;
  /** The row just decided where it stands (ledger-keys.ts useRowMarks), which keeps its place. */
  keep?: string | null;
}

/** What the page holds of the ledger, and how it changes it. */
export interface LedgerView extends LedgerShown {
  status: LedgerStatus;
  /** The group shown alone, where the ledger holds the one the address names. */
  group: string | null;
  query: string;
  sort: LedgerSort;
  grouping: LedgerGrouping;
  /** The groups the screen shows, in order. */
  visibleGroups: readonly LifecycleGroup[];
  /** The rows the screen shows, in order: what the keys walk, and the rows Ask is told (the first forty). */
  visibleRows: readonly LifecycleRow[];
  setStatus: (status: LedgerStatus) => void;
  setGroup: (group: string | null) => void;
  setQuery: (query: string) => void;
  setSort: (sort: LedgerSort) => void;
  setGrouping: (grouping: LedgerGrouping) => void;
  /** Escape: the words searched go first, then the filter (the status and the group). */
  clearOne: () => void;
  /** Clear: every narrowing at once. */
  clearAll: () => void;
}

/** The page's ledger: its state, what it shows, and the presses that change it. */
export function useLedgerView(ledger: LifecycleLedger, at: LedgerAt): LedgerView {
  const [status, setStatus] = useState<LedgerStatus>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LedgerSort>("next");
  const [grouping, setGrouping] = useState<LedgerGrouping>("moment");
  const tools = ledger.tools;
  const ask: LedgerAsk = {
    status: tools ? status : "all",
    group: at.group,
    query: tools ? query : "",
    sort: tools && !at.phone ? sort : "next",
    grouping: tools && !at.phone ? grouping : "moment",
    keep: at.keep ?? null,
  };
  const shown = ledgerViewOf(ledger, ask);
  const group = shown.chosen ? shown.chosen.id : null;
  // A phone holds one choice: a status lets go of the group, a group lets go of the status.
  const pickStatus = (next: LedgerStatus) => {
    setStatus(next);
    if (at.phone && group !== null) at.onGroup(null);
  };
  const pickGroup = (next: string | null) => {
    if (at.phone) setStatus("all");
    at.onGroup(next);
  };
  const clearAll = () => {
    setQuery("");
    setStatus("all");
    if (group !== null) at.onGroup(null);
  };
  const clearOne = () => {
    if (ask.query !== "") setQuery("");
    else clearAll();
  };
  return {
    ...shown,
    status: ask.status,
    group,
    query: ask.query,
    sort: ask.sort,
    grouping: ask.grouping,
    visibleGroups: shown.groups,
    visibleRows: shown.rows,
    setStatus: pickStatus,
    setGroup: pickGroup,
    setQuery,
    setSort,
    setGrouping,
    clearOne,
    clearAll,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck, lint, format**

Run:
```bash
corepack pnpm --filter @chanlytics/dashboard typecheck
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts tooling/scripts/tests/playbooks/home/ledger-view.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts
```
Expected: no errors. (knip may call the new exports dead until Task 10 reads them; it is not run until Task 18.)

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/surfaces/campaigns/home/ledger/use-ledger-view.ts tooling/scripts/tests/playbooks/home/ledger-view.test.mjs
git commit -F - <<'EOF'
Campaigns' ledger decides once what the screen shows: a status, a group, words searched, an order, its groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 4: The keys, the cursor, focus coming home, and the row's marks

People's list keys on the ledger (decision 18), copied in the shape of `apps/dashboard/src/surfaces/people/hooks/keyboard.ts` and reading People's own `PL_CONTROL`, `PL_OVERLAY` and `plTyping` (`apps/dashboard/src/surfaces/people/words.ts:263-289`; that module is already in every page's bundle through `people-globals.ts`, so importing it costs no byte). Focus comes home: a sheet that closes gives it to the opener of the row it was opened from; an act decided in a row leaves it on the row's name. The marks: a row decided in place settles once; an arrival (just made, just changed) is scrolled to and washed once.

**Files:**
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts`
- Test: `tooling/scripts/tests/playbooks/home/ledger-view.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`:

```js
/* ------------------------------------------------------- the keys ------------------------------------------------------- */

const { onLedgerKey, rowOpener, useFocusComesHome } = await import(
  "../../../../../apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts"
);

/** A key event as the window hears it, pressed on the page (a div), unless a test says where. */
const key = (k, over = {}) => ({
  key: k,
  target: { nodeType: 1, tagName: "DIV", closest: () => null, getAttribute: () => null },
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  ...over,
});
/** The doors the listener reads, each press written down. */
const doors = (over = {}) => {
  const did = [];
  return {
    did,
    ids: ["r1", "r2", "r3"],
    cursor: null,
    move: (step) => did.push(["move", step]),
    open: (id) => did.push(["open", id]),
    focusSearch: () => did.push(["search"]),
    narrowed: false,
    clearOne: () => did.push(["clear"]),
    sheetOpen: false,
    ...over,
  };
};

test("J and K, or the arrows, walk the rows; Enter opens the one under the cursor; / goes to the search", () => {
  globalThis.document.querySelector = () => null;
  const d = doors({ cursor: "r2" });
  for (const k of ["j", "J", "ArrowDown"]) onLedgerKey(d, key(k));
  for (const k of ["k", "ArrowUp"]) onLedgerKey(d, key(k));
  onLedgerKey(d, key("Enter"));
  onLedgerKey(d, key("/"));
  assert.deepEqual(d.did, [["move", 1], ["move", 1], ["move", 1], ["move", -1], ["move", -1], ["open", "r2"], ["search"]]);
});

test("Escape lets go only where something narrows the list, and from the search box too", () => {
  globalThis.document.querySelector = () => null;
  const idle = doors();
  onLedgerKey(idle, key("Escape"));
  assert.deepEqual(idle.did, [], "nothing to let go of: the key is not taken");
  const d = doors({ narrowed: true });
  const e = key("Escape");
  onLedgerKey(d, e);
  assert.deepEqual(d.did, [["clear"]]);
  assert.equal(e.prevented, true);
  const box = { nodeType: 1, tagName: "INPUT", type: "search", closest: () => null, getAttribute: (a) => (a === "data-testid" ? "cmh-ledger-search" : null) };
  const typed = doors({ narrowed: true });
  onLedgerKey(typed, key("Escape", { target: box }));
  onLedgerKey(typed, key("j", { target: box }));
  assert.deepEqual(typed.did, [["clear"]], "Escape in the search lets go of the words; a letter typed there is a letter");
});

test("never behind a sheet or a menu, never with a modifier, and Enter on a focused control is the control's", () => {
  const d = doors({ cursor: "r1" });
  onLedgerKey({ ...d, sheetOpen: true }, key("j"));
  onLedgerKey(d, key("j", { metaKey: true }));
  onLedgerKey(d, key("j", { defaultPrevented: true }));
  globalThis.document.querySelector = (sel) => (sel.includes(".sheet[role=\"dialog\"]") ? {} : null);
  onLedgerKey(d, key("j"));
  globalThis.document.querySelector = () => null;
  onLedgerKey(d, key("Enter", { target: { nodeType: 1, tagName: "A", closest: () => ({}), getAttribute: () => null } }));
  assert.deepEqual(d.did, []);
});

test("a row's opener is found by its id, and a sheet that closes gives the focus back to the row it was opened from", () => {
  assert.equal(rowOpener("pb-1"), '[data-row="pb-1"] [data-row-open]');
  assert.equal(rowOpener('a"b'), '[data-row="a\\"b"] [data-row-open]');
  const focused = [];
  globalThis.document.querySelector = (sel) => ({ focus: () => focused.push(sel), scrollIntoView() {} });
  fresh();
  again(() => useFocusComesHome("pb-1"));
  again(() => useFocusComesHome(null));
  assert.deepEqual(focused, ['[data-row="pb-1"] [data-row-open]']);
  again(() => useFocusComesHome(null));
  assert.equal(focused.length, 1, "once");
  globalThis.document.querySelector = () => null;
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`
Expected: FAIL (`Cannot find module …/ledger-keys.ts`).

- [ ] **Step 3: Write the module**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts`:

```ts
/**
 * Campaigns' ledger and the keyboard (decision 18): People's list keys, in the shape of its listener
 * (surfaces/people/hooks/keyboard.ts) and reading People's own rules for what is typing, what a control is and what
 * stands over the page (surfaces/people/words.ts). `/` goes to the search, J/K or ↓/↑ walk a cursor down the rows the
 * screen shows (focus goes to the row's name with it, so Tab reaches its acts and Enter opens it as a link does), Enter
 * opens the row under the cursor, Escape lets go of the words searched and then of the filter. Never while typing (but
 * Escape in the search box), never with a modifier, never behind a menu or a sheet.
 *
 * Focus comes home: a sheet that closes gives it to the opener of the row it was opened from
 * (`[data-row="<id>"] [data-row-open]`): the kit's Sheet would give it to what held it when it opened, which an Edit that
 * swapped one sheet for another has taken away. An act decided in a row leaves it on the row's name, since the button
 * that held it is gone. And the marks a row wears for its next draw: decided in place, it settles once (the kit's save
 * settle); arrived (just made, just changed), it is scrolled to and washed once (the kit's wash of a changed line).
 */
import { useEffect, useRef, useState } from "react";
import { PL_CONTROL, PL_OVERLAY, plTyping } from "@/surfaces/people/words";

/** What the one listener reads, left by the page as its draw ends. */
interface LedgerKeyDoors {
  /** The rows the screen shows, in order. */
  ids: readonly string[];
  cursor: string | null;
  move: (step: number) => void;
  /** Open a row: its opener pressed, as a press on the row would. */
  open: (id: string) => void;
  focusSearch: () => void;
  /** Whether Escape has something to let go of: words searched, a status, a group. */
  narrowed: boolean;
  clearOne: () => void;
  /** A sheet stands over the page (the drawer, the composer): it has the keys. */
  sheetOpen: boolean;
}

/** The search box's own id: Escape typed there lets go of the words, which a typing box otherwise keeps. */
const SEARCH_ID = "cmh-ledger-search";

/** A row's opener, by its id: the name a press anywhere on the row presses (parts/head.tsx cmRowPress). */
export const rowOpener = (id: string): string => `[data-row="${id.replace(/["\\]/g, "\\$&")}"] [data-row-open]`;

/** The page's one element for a selector, where there is a document to ask. */
function found(selector: string): HTMLElement | null {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
  return document.querySelector<HTMLElement>(selector);
}

/** Once the page has drawn what it is about to: after a sheet closes, after a row is decided. */
function afterDraw(run: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else run();
}

/** Focus to a row's opener, once the page has drawn. */
function focusRowOpener(id: string): void {
  afterDraw(() => found(rowOpener(id))?.focus());
}

/** A row's opener pressed: what Enter does to the row under the cursor. */
export function pressRowOpener(id: string): void {
  found(rowOpener(id))?.click();
}

/** A row brought into view, the least scroll that shows it: an arrival. */
function scrollToRow(id: string): void {
  afterDraw(() => found(`[data-row="${id.replace(/["\\]/g, "\\$&")}"]`)?.scrollIntoView({ block: "nearest" }));
}

/** A key typed in a box: only Escape in the ledger's own search is the ledger's. */
function typingKey(k: LedgerKeyDoors, e: KeyboardEvent, from: Element | null): void {
  if (e.key !== "Escape" || !k.narrowed || from?.getAttribute?.("data-testid") !== SEARCH_ID) return;
  e.preventDefault();
  k.clearOne();
}

/** A key that walks or opens the rows. Enter and Space on a focused button, link or tab are that control's. */
function rowKey(k: LedgerKeyDoors, e: KeyboardEvent, from: Element | null): void {
  if ((e.key === "Enter" || e.key === " ") && from?.closest?.(PL_CONTROL)) return;
  const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";
  const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";
  // A held key walks on; a held Enter opens once.
  if (e.repeat && !(down || up)) return;
  if (down || up) {
    e.preventDefault();
    k.move(down ? 1 : -1);
  } else if (e.key === "Enter" && k.cursor) {
    e.preventDefault();
    k.open(k.cursor);
  }
}

/** A key on the page: the ledger's, or nothing. */
export function onLedgerKey(k: LedgerKeyDoors | null, e: KeyboardEvent): void {
  // Where the key was pressed, not where focus is now: a field's own Escape can take the focus with it.
  const from = e.target && (e.target as Node).nodeType === 1 ? (e.target as Element) : document.activeElement;
  if (!k || e.defaultPrevented || k.sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  if (plTyping(from)) {
    typingKey(k, e, from);
    return;
  }
  // A menu, Ask, the notifications or the kit's sheet open over the page has the keys.
  if (found(PL_OVERLAY)) return;
  if (e.key === "/") {
    e.preventDefault();
    k.focusSearch();
    return;
  }
  if (e.key === "Escape") {
    if (k.narrowed) {
      e.preventDefault();
      k.clearOne();
    }
    return;
  }
  if (k.ids.length > 0) rowKey(k, e, from);
}

/** The page's one listener for its life, reading what the latest draw left (People's usePlPlace). */
export function useLedgerKeys(doors: LedgerKeyDoors): void {
  const keys = useRef<LedgerKeyDoors | null>(null);
  useEffect(() => {
    keys.current = doors;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onLedgerKey(keys.current, e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The cursor over the rows the screen shows: none until a key moves it; a row that leaves the screen takes it away. */
export function useLedgerCursor(ids: readonly string[]): { cursor: string | null; move: (step: number) => void } {
  const [cursor, setCursor] = useState<string | null>(null);
  const at = cursor !== null && ids.includes(cursor) ? cursor : null;
  const move = (step: number) => {
    const from = at === null ? (step > 0 ? -1 : ids.length) : ids.indexOf(at);
    const next = ids[Math.min(ids.length - 1, Math.max(0, from + step))];
    if (next === undefined) return;
    setCursor(next);
    focusRowOpener(next);
  };
  return { cursor: at, move };
}

/** The row a sheet was opened from gets the focus back as the sheet closes. `open`: the row the open sheet is about. */
export function useFocusComesHome(open: string | null): void {
  const from = useRef<string | null>(open);
  useEffect(() => {
    if (open !== null) from.current = open;
    else if (from.current !== null) {
      focusRowOpener(from.current);
      from.current = null;
    }
  }, [open]);
}

/** What a row wears for its next draw: decided in place (it settles once), or arrived (scrolled to, washed once). */
export type RowMark = { id: string; kind: "settled" | "arrived" } | null;

/**
 * The page's marks: one row at a time, the last one marked, until it is let go of (`clear`). An arrival is only marked
 * here: a campaign just made has no row until the playbooks are read again, so it is scrolled to when its row is drawn
 * (`useArrivalLands`).
 */
export function useRowMarks(): {
  mark: RowMark;
  settle: (id: string) => void;
  arrive: (id: string) => void;
  clear: () => void;
} {
  const [mark, setMark] = useState<RowMark>(null);
  const settle = (id: string) => {
    setMark({ id, kind: "settled" });
    focusRowOpener(id);
  };
  const arrive = (id: string) => setMark({ id, kind: "arrived" });
  return { mark, settle, arrive, clear: () => setMark(null) };
}

/** An arrival is scrolled to, and its name takes the focus, once, the first draw its row is among the rows shown. */
export function useArrivalLands(mark: RowMark, ids: readonly string[]): void {
  const landed = useRef<string | null>(null);
  const arrived = mark && mark.kind === "arrived" ? mark.id : null;
  const here = arrived !== null && ids.includes(arrived);
  useEffect(() => {
    if (!here || arrived === null || landed.current === arrived) return;
    landed.current = arrived;
    scrollToRow(arrived);
    focusRowOpener(arrived);
  }, [arrived, here]);
}

/**
 * Let go of something when a key changes after the first draw: the page lets go of a row's mark when the list's filter
 * changes (the status, the group and the words, as one key), so a row decided under a tab keeps its place until then.
 */
export function useLetGo(key: string, letGo: () => void): void {
  const was = useRef(key);
  useEffect(() => {
    if (was.current === key) return;
    was.current = key;
    letGo();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key alone says when
}
```

- [ ] **Step 4: Run the test**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-view.test.mjs`
Expected: PASS (14 tests).

- [ ] **Step 5: Typecheck, lint, format**

Run:
```bash
corepack pnpm --filter @chanlytics/dashboard typecheck
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts tooling/scripts/tests/playbooks/home/ledger-view.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts
```
Expected: no errors. If the dashboard's lint refuses the `as Node` / `as Element` casts, copy People's exact line (`keyboard.ts:96`), which the lint already accepts.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-keys.ts tooling/scripts/tests/playbooks/home/ledger-view.test.mjs
git commit -F - <<'EOF'
Campaigns' ledger takes People's list keys, and focus comes back to the row a sheet or an act left

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 5: The kit's `ListRow` takes a `mark` (a row's kind, never a face)

A campaign's row on a phone wears its kind as a mark, never a face (`kit/face/face.tsx:2-3`: a face is a person; `SKILL.md`, "One shape per job": a mark is a row's kind, neutral always). The kit lacks it, so it is a variant of `ListRow` with its gallery entry (CLAUDE.md, "One kit"; `SKILL.md`, "Add a variant").

**Files:**
- Modify: `apps/dashboard/src/surfaces/kit/list-row/list-row.tsx`
- Modify: `apps/dashboard/src/surfaces/kit/list-row/list-row.type-test.ts`
- Modify: `apps/dashboard/src/surfaces/kit/kit.css` (after `.list-row:not(:has(> .list-row-said)) > .list-row-face`, ~line 2874)
- Modify: `apps/dashboard/src/surfaces/kit/classes.json` (between `"list-row-facts"` and `"list-row-name"`, ~line 79)
- Modify: `tooling/scripts/e2e-harness/kit-gallery.mjs:246-256, 1711-1724`
- Test: `tooling/scripts/tests/styles/kit-components.test.mjs:527-547`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/styles/kit-components.test.mjs`, extend the gallery's row helper and family map (lines 527-547):

```js
/** A person's row, as the gallery draws it, with what was said or not, a note or not, an address or none, and a row's kind as its mark instead of a face. */
const row = ({ said = true, note = false, href = undefined, mark = false } = {}) =>
  h(ListRow, {
    ...(mark ? { mark: glyph() } : { face: { initials: "AR" } }),
    name: "Aisha Rahman",
    end: (place) => h("span", { className: cx("pill pill-warn", place) }, "Needs you"),
    said: said ? "asked about Saturday" : undefined,
    facts: ["Sat · 10:00", "2 h ago"],
    note: note ? "Next step: call back on Monday" : undefined,
    href,
  });

/**
 * The gallery's List row family, entry by entry: the three shapes, a row with a page of its own, and a row whose first
 * column is its kind (a campaign on Campaigns' phone list).
 */
const LIST_ROWS = {
  "list-row": () => row(),
  "list-row-two": () => row({ said: false }),
  "list-row-note": () => row({ note: true }),
  "list-row-door": () => row({ note: true, href: "#kit" }),
  "list-row-mark": () => row({ said: false, mark: true }),
};
```

And at the end of the test `"ListRow draws the gallery's List row family, …"` (after the `door` assertions, ~line 591), add:

```js
  const kind = drawn(h(ListRow, { mark: glyph(), name: "Win-back", facts: ["Quiet or lapsed"] }));
  assert.equal(
    spell(settle(drawnSkeleton(kind))),
    "div.list-row(span.mark.list-row-mark[aria-hidden=true](svg.icon) div.list-row-name div.list-row-facts(span))",
    "a row's kind stands in the face's column as the kit's mark, neutral, hidden from a screen reader",
  );
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs`
Expected: FAIL: the family's parting lists `list-row-mark` as `unknown` (no gallery entry), and the skeleton draws a face.

- [ ] **Step 3: Add the variant**

In `apps/dashboard/src/surfaces/kit/list-row/list-row.tsx`, change the header's first paragraph's opening to say it ("The face beside up to three lines" → "The face, or the row's kind as the kit's mark, beside up to three lines"), import `ReactElement`, and change the lines' type and the component:

```ts
import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";
```

```ts
/**
 * Who or what the row is, in its first column: the kit's face, for a person, a lead or a conversation; or, for a row
 * that is a thing of a kind (a campaign), the kit's mark holding the kind's glyph (the Icon), neutral always.
 */
type ListRowFirst = { face: FaceProps; mark?: undefined } | { mark: ReactElement; face?: undefined };

/** The row's lines, which are its props: it takes no children. */
type ListRowLines = ListRowFirst & {
  /** The first line. */
  name: ReactNode;
```
(the rest of `ListRowLines` unchanged: `end`, `said`, `facts`, `note`; delete its old `face` member.)

```tsx
/** The first column: the face, or the kind's mark. */
function firstOf(first: ListRowFirst) {
  if (first.mark !== undefined) {
    return (
      <span className="mark list-row-mark" aria-hidden="true">
        {first.mark}
      </span>
    );
  }
  return <Face {...first.face} className={cx("list-row-face", first.face.className)} />;
}

/** A row of a list: its face or its kind, its lines, and what trails its name; a link where it has an address. */
export function ListRow({ face, mark, name, end, said, facts = [], note, className, ...element }: ListRowProps) {
  const classes = cx("list-row", className);
  const lines = (
    <>
      {firstOf(mark !== undefined ? { mark } : { face: face as FaceProps })}
      <div className="list-row-name">{name}</div>
      {end?.("list-row-end")}
      {saidLine(said)}
      {factsLine(facts)}
      {drawsSomething(note) ? <div className="list-row-note">{note}</div> : null}
    </>
  );
```
(the rest of the function unchanged.) If the lint refuses `face as FaceProps`, write `firstOf(mark !== undefined ? { mark } : face !== undefined ? { face } : { face: { initials: "" } })` instead; the type makes the last branch unreachable.

- [ ] **Step 4: The rule, the name, the gallery entry**

In `apps/dashboard/src/surfaces/kit/kit.css`, after the rule `.list-row:not(:has(> .list-row-said)) > .list-row-face { grid-row: 1 / span 2; }`:

```css
/* A row that is a thing of a kind, not someone (a campaign on Campaigns' phone list): the kit's mark in the face's
   column, centred in it, neutral always (the badges' rule: a mark is a row's kind). */
.list-row-mark {
  grid-column: 1;
  grid-row: 1 / span 3;
  align-self: start;
  justify-self: center;
}
.list-row:not(:has(> .list-row-said)) > .list-row-mark {
  grid-row: 1 / span 2;
}
```

In `apps/dashboard/src/surfaces/kit/classes.json`, under `classes`, between `"list-row-facts",` and `"list-row-name",`:
```json
    "list-row-mark",
```

In `tooling/scripts/e2e-harness/kit-gallery.mjs`, give `listRow` a `mark` option (lines 246-256):

```js
/**
 * A person's row on a phone, as the kit draws it, with a line of words said or not, a note under it or not, as a link to
 * their page or not, and a row whose first column is its kind (the kit's mark) instead of someone's face.
 */
const listRow = ({ said = true, note = false, door = false, mark = false } = {}) =>
  (door ? `<a class="list-row" href="#kit">` : `<div class="list-row">`) +
  (mark
    ? `<span class="mark list-row-mark" aria-hidden="true">${icon("bell", 13)}</span>`
    : `<span class="face list-row-face" aria-hidden="true"><span>AR</span></span>`) +
  `<div class="list-row-name">Aisha Rahman</div><span class="pill pill-warn list-row-end">Needs you</span>` +
  (said ? `<div class="list-row-said">asked about Saturday</div>` : "") +
  `<div class="list-row-facts"><span>Sat · 10:00</span><span>2 h ago</span></div>` +
  (note ? `<div class="list-row-note">Next step: call back on Monday</div>` : "") +
  (door ? `</a>` : `</div>`);
```
(`icon` is the gallery's own helper, defined above its first use; if it is defined after line 256, move nothing: a function declaration hoists, a `const` does not, so check with `grep -n "const icon\|function icon" tooling/scripts/e2e-harness/kit-gallery.mjs` and, if it is a `const` declared later, write the mark's svg as the face-glyph entry at line ~1680 writes it.)

And the family (lines 1711-1724): add to its `about` " and a row whose first column is its kind, the kit's mark in the face's place (Campaigns' phone list, surfaces/campaigns/home/ledger/ledger-phone.tsx)", and the entry after `list-row-door`:
```js
      { id: "list-row-mark", html: listRow({ said: false, mark: true }) },
```

- [ ] **Step 5: The type test**

In `apps/dashboard/src/surfaces/kit/list-row/list-row.type-test.ts`, add a positive after the "said line" call (line ~150) and two negatives after the existing ones:

```ts
  // A thing of a kind: the kit's mark holding its glyph, in the face's column.
  ListRow({ mark: line("icon"), name: "Win-back", facts: ["Quiet or lapsed"] });
```
```ts
  // @ts-expect-error a row's first column is a face or a mark, never both
  ListRow({ face: { initials: "AR" }, mark: line("icon"), name: "Aisha Rahman" });
  // @ts-expect-error a mark is the kind's glyph, an element, never words
  ListRow({ mark: "bell", name: "Win-back" });
```
and say so in its header's list ("…a row with no face or mark, a face and a mark both, a mark that is words, …").

- [ ] **Step 6: Run the tests and the type test**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-gallery.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-css.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
git grep -l -E "ListRow|list-row" -- tooling/scripts/tests e2e
```
Expected: PASS, PASS, PASS, no type errors. Run each test file the last command lists that this step has not run (People's and Leads' rows: e.g. `tooling/scripts/tests/people/…`), one per command; each still PASSes (a row with a face draws exactly what it drew).

Then, if a browser is installed (it usually is; `npx playwright --version`), run the gallery's own spec:
```bash
corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit
```
Expected: PASS. If Playwright's browsers are not installed, say so in the commit message and leave the spec to CI's nightly; do not install anything.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/surfaces/kit/list-row apps/dashboard/src/surfaces/kit/kit.css apps/dashboard/src/surfaces/kit/classes.json tooling/scripts/e2e-harness/kit-gallery.mjs tooling/scripts/tests/styles/kit-components.test.mjs
git commit -F - <<'EOF'
The kit's list row takes a row's kind as its mark, in the face's place, with its gallery entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 6: A row's acts (`ledger-acts.tsx`), and Coming up keeps the time alone

One decision per run per screen (decision 14): Approve and Skip move from Coming up's line (`home/tiles.tsx:195-279`) to the run's row. Coming up keeps the time and "Waiting on you", and its door goes to Sent's week (spec §4.3). Resume is asked in place (decision 7). One word per act (decision 19): "Approve · 7 people" and "Skip".

**Files:**
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx`
- Modify: `apps/dashboard/src/surfaces/campaigns/home/tiles.tsx` (remove `ComingApproval` and `WaitingActs`, lines 195-279; `ComingLine` and `ComingBlock` without acts; export `TileRead`)
- Create: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (this file grows through Tasks 6-10; its harness is campaigns-home.test.mjs's, copied):

```js
/**
 * Campaigns' ledger, the page (spec 2026-10-09 §4.2-§4.6): drawn on the stub React over the view model the real surfaces
 * make (the Playbooks and Broadcasts samples, through contracts' campaignsHomeOf), with more campaigns added where a test
 * needs the tool line. What is proved here is what the page does with the ledger (its decisions are
 * ledger-view.test.mjs's, its words and numbers lane 2's ledger.test.mjs's): a row's acts, the rows and their doors, the
 * tool line, the rail's toggle, the phone's spine, the keys and where focus and the address go.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: tomorrow is Saturday the 3rd. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

const went = [];
const replaced = [];
const toasts = [];
const said = [];
installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, back: () => said.push(["back"]) },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
const SRC = "../../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { WaitingActs, ResumeAct } = await import(`${SRC}/surfaces/campaigns/home/ledger/ledger-acts.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { playbooks: verbs } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "reach_outs", "settings", "campaign_results"]) setSurfaceValue(k, undefined);
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.document.querySelector = () => null;
});
globalThis.document.querySelector = () => null;

const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
  said.length = 0;
};
const allBy = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);

/** A row in the view model's shape (contracts LifecycleRow), for the acts drawn alone. */
const ROW = {
  id: "pb-1",
  kind: "playbook",
  name: "Win-back",
  hint: "",
  status: "waiting",
  stateWords: "Waiting on you",
  phoneWords: "",
  tone: "warn",
  needs: "offers",
  needsWords: "",
  channels: [],
  people: { n: 7, unit: "people" },
  results: "none",
  next: { words: "Waiting on you", atMs: NOW },
  open: { kind: "open", label: "Open", playbookId: "pb-1" },
  waiting: { runId: "b-1", people: 7, refusal: null },
  act: null,
  search: "win-back",
};
/** An approval as the page holds one (home-page.tsx useApproval), every press written down. */
const approvalOf = (over = {}) => {
  const did = [];
  return {
    did,
    busy: null,
    asking: null,
    onAsk: (id) => did.push(["ask", id]),
    onApprove: async (r) => did.push(["approve", r.id]),
    onSkip: async (r) => did.push(["skip", r.id]),
    canAct: true,
    gated: {},
    ...over,
  };
};

test("a waiting run's row says Approve with its count and Skip, each naming the run; Skip asks before it skips", async () => {
  fresh();
  const a = approvalOf();
  const w = { runId: "b-1", people: 7, refusal: null };
  let acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: a }));
  const approve = byTestId(acts, "cmh-approve");
  assert.match(textOf(approve), /Approve · 7 people/);
  assert.equal(approve.props["aria-label"], "Approve this run of Win-back");
  assert.equal(textOf(byTestId(acts, "cmh-skip")).trim(), "Skip");
  await approve.props.onClick();
  press(byTestId(acts, "cmh-skip"));
  assert.deepEqual(a.did, [["approve", "pb-1"], ["ask", "b-1"]]);
  acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: { ...a, asking: "b-1" } }));
  assert.match(textOf(byTestId(acts, "cmh-skip-confirm")), /Skip this run of Win-back\?/);
  assert.equal(byTestId(acts, "cmh-approve"), null, "the question stands where the acts stood");
});

test("a run the verb would refuse says why and offers Skip alone; a role that may not skip has nothing to press", () => {
  fresh();
  const w = { runId: "b-1", people: 7, refusal: "This run was made for Sep 30 and that day has passed." };
  const acts = again(() => WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: approvalOf() }));
  assert.equal(byTestId(acts, "cmh-approve"), null);
  assert.match(textOf(byTestId(acts, "cmh-row-refusal")), /that day has passed/);
  assert.ok(byTestId(acts, "cmh-skip"));
  const viewer = again(() =>
    WaitingActs({ r: ROW, w, approve: "Approve · 7 people", approval: approvalOf({ canAct: false }) }),
  );
  assert.equal(byTestId(viewer, "cmh-waiting-acts"), null);
  assert.match(textOf(viewer), /that day has passed/, "its words still say why it waits");
});

test("Resume asks in place, saying when and to how many; No puts the press back, Yes resumes", () => {
  fresh();
  const pressed = [];
  const act = {
    kind: "resume",
    label: "Resume",
    playbookId: "pb-1",
    ask: { question: "Resume Win-back?", detail: "Next run today 9:00 AM, about 25 people" },
  };
  const draw = () => again(() => ResumeAct({ act, onAct: (x) => pressed.push(x.playbookId), gated: {} }));
  press(byTestId(draw(), "cmh-resume"));
  let tree = draw();
  const ask = byTestId(tree, "cmh-resume-confirm");
  assert.match(textOf(ask), /Resume Win-back\?/);
  assert.match(textOf(ask), /Next run today 9:00 AM, about 25 people/);
  assert.deepEqual(pressed, [], "nothing resumes on the first press");
  press(byTestId(tree, "cmh-resume-no"));
  tree = draw();
  assert.ok(byTestId(tree, "cmh-resume"), "No puts Resume back");
  press(byTestId(tree, "cmh-resume"));
  press(byTestId(draw(), "cmh-resume-yes"));
  assert.deepEqual(pressed, ["pb-1"]);
});
```

(`press` calls `onClick` with a fake event; Confirm's Yes and No are `${testid}-yes` and `${testid}-no`, its line `${testid}-confirm`, as `cmh-skip-*` are today.)

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`
Expected: FAIL (`Cannot find module …/ledger-acts.tsx`).

- [ ] **Step 3: Write the acts**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx` (the words of the approval are `LIFECYCLE_WORDS.coming.approval`'s, which `tiles.tsx` read; if lane 2 moved them, read them where lane 2 put them):

```tsx
/**
 * What a row of Campaigns' ledger presses where it stands (spec 2026-10-09 §4.3; decisions 5, 7, 14 and 19). A run that
 * waits is approved or skipped on its row and nowhere else on the screen: "Approve · 7 people" and "Skip", each naming
 * its run to a screen reader, Skip asking first (the kit's Confirm, as Sent's row asks it), and where the verb would
 * refuse the approval (its day has passed, the workspace is paused) its whole sentence and Skip alone. A paused campaign
 * is resumed by a question in place that says when it runs next and to about how many, and an `auto` mode in full. An
 * empty moment's Turn on and a group's add are a press, or a door where they open a page. No switch on a row (decision
 * 5): these are the only presses a row carries. Moved from Coming up's line (tiles.tsx), which keeps the time and
 * "Waiting on you".
 */
import { useEffect, useRef, useState } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { LifecycleAct, LifecycleRow, LifecycleWaiting } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import type { RouteDoor } from "../../../legacy-verbs";

/**
 * What a waiting run's acts press (home-page.tsx decides; the row only says which): approve it, or skip it once the
 * question is answered. One run at a time: while one is with the server, every row's acts wait.
 */
export interface LedgerApproval {
  /** The run a press is working on now. */
  busy: string | null;
  /** The run whose Skip was pressed and waits for its answer. */
  asking: string | null;
  onAsk: (runId: string | null) => void;
  onApprove: (r: LifecycleRow) => Promise<void>;
  onSkip: (r: LifecycleRow) => Promise<void>;
  /** Whether the role may approve or skip; Approve is drawn for every role and says who may (`gated`). */
  canAct: boolean;
  gated: Record<string, unknown>;
}

/** What the ledger's rows and heads press: the page decides (home-page.tsx). */
export interface LedgerActs {
  /** The door a row's name or a group's add is, where its act opens a page (the drawer, pushed; Sent, the Library). */
  door: (act: LifecycleAct) => RouteDoor | null;
  /** A press that acts where it stands: Turn on, Resume once asked. */
  onAct: (act: LifecycleAct) => void;
  /** The role's gate on Turn on and Resume. */
  gated: Record<string, unknown>;
  approval: LedgerApproval;
}

interface WaitingProps {
  r: LifecycleRow;
  w: LifecycleWaiting;
  /** "Approve · 7 people": the ledger's words for it (decision 19). */
  approve: string;
  approval: LedgerApproval;
}

/** A waiting run's acts, or the question Skip asks in their place. A No hands the keyboard back to the Skip that asked. */
export function WaitingActs({ r, w, approve, approval }: WaitingProps) {
  const W = LIFECYCLE_WORDS.coming.approval;
  const asking = approval.canAct && approval.asking === w.runId;
  const skip = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) skip.current?.focus();
    asked.current = asking;
  }, [asking]);
  const busy = approval.busy === w.runId;
  const inFlight = approval.busy !== null;
  // A role that may not skip a run the verb would refuse has nothing to press: its words say why it waits.
  if (w.refusal && !approval.canAct) {
    return (
      <span className="cmh-dim cmh-row-why" data-testid="cmh-row-refusal">
        {w.refusal}
      </span>
    );
  }
  return (
    <div className="cmh-row-decide" data-testid="cmh-waiting-acts">
      {asking ? (
        <Confirm
          question={W.question(r.name)}
          detail={W.detail}
          yes={W.yes}
          danger
          busy={busy}
          ready={!inFlight || busy}
          onYes={() => void approval.onSkip(r)}
          onNo={() => approval.onAsk(null)}
          testid="cmh-skip"
        />
      ) : (
        <>
          {w.refusal ? (
            <span className="cmh-dim cmh-row-why" data-testid="cmh-row-refusal">
              {w.refusal}
            </span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={inFlight}
              onClick={() => approval.onApprove(r)}
              aria-label={busy ? undefined : W.approveOf(r.name)}
              data-testid="cmh-approve"
              {...approval.gated}
            >
              <Icon name="check" size={12} /> {busy ? W.approving : approve}
            </Button>
          )}
          {approval.canAct ? (
            <Button
              ref={skip}
              size="sm"
              disabled={inFlight}
              onClick={() => approval.onAsk(w.runId)}
              aria-label={W.skipOf(r.name)}
              data-testid="cmh-skip"
            >
              {LIFECYCLE_WORDS.ledger.skip}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

type ResumeOf = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A Resume's question, held by whoever draws it: the press and the question where the press stood (a desk row, a card),
 * or apart (a phone row: the press at the row's end, the question under the row at its whole width, as a waiting run's
 * acts stand). No puts the press back with the keyboard on it.
 */
export function useResumeAsk() {
  const [asking, setAsking] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) back.current?.focus();
    asked.current = asking;
  }, [asking]);
  return { asking, setAsking, back };
}
type ResumeAsk = ReturnType<typeof useResumeAsk>;

interface ResumePartProps {
  act: ResumeOf;
  ask: ResumeAsk;
  testid?: string;
  /** The class a row hands it (a phone row's end, or its line under the row). */
  className?: string;
}

/** Resume's press: drawn while nothing is asked. */
export function ResumePress({ act, ask, gated, testid = "cmh-resume", className }: ResumePartProps & { gated: Record<string, unknown> }) {
  if (ask.asking) return null;
  return (
    <Button
      ref={ask.back}
      size="sm"
      className={className}
      onClick={() => ask.setAsking(true)}
      data-testid={testid}
      {...gated}
    >
      <Icon name="play" size={12} /> {act.label}
    </Button>
  );
}

/**
 * Resume's question (decision 7): when it runs next and to about how many, and an `auto` mode in full, in the view
 * model's words; Yes resumes, No puts the press back.
 */
export function ResumeQuestion({ act, ask, onAct, testid = "cmh-resume", className }: ResumePartProps & { onAct: (act: LifecycleAct) => void }) {
  if (!ask.asking) return null;
  return (
    <Confirm
      question={act.ask.question}
      detail={act.ask.detail}
      yes={LIFECYCLE_WORDS.ledger.resume.yes}
      onYes={() => {
        ask.setAsking(false);
        onAct(act);
      }}
      onNo={() => ask.setAsking(false)}
      className={className}
      testid={testid}
    />
  );
}

interface ResumeProps {
  act: ResumeOf;
  onAct: (act: LifecycleAct) => void;
  gated: Record<string, unknown>;
  testid?: string;
}

/** A paused campaign's Resume, asked in place (decision 7): its press, or its question where the press stood. */
export function ResumeAct({ act, onAct, gated, testid = "cmh-resume" }: ResumeProps) {
  const ask = useResumeAsk();
  return ask.asking ? (
    <ResumeQuestion act={act} ask={ask} onAct={onAct} testid={testid} />
  ) : (
    <ResumePress act={act} ask={ask} gated={gated} testid={testid} />
  );
}

/** A group's add or an empty moment's Turn on: a door where it opens a page (Leads), a press where it acts. */
export function AddAct({ act, acts, testid }: { act: LifecycleAct; acts: LedgerActs; testid: string }) {
  const door = acts.door(act);
  const glyph = act.kind === "turn_on" ? <Icon name="plus" size={12} /> : null;
  if (door) {
    return (
      <Button variant="quiet" size="sm" {...door} data-testid={testid}>
        {glyph} {act.label}
      </Button>
    );
  }
  return (
    <Button variant="quiet" size="sm" onClick={() => acts.onAct(act)} data-testid={testid} {...acts.gated}>
      {glyph} {act.label}
    </Button>
  );
}
```

- [ ] **Step 4: Coming up keeps the time alone**

In `apps/dashboard/src/surfaces/campaigns/home/tiles.tsx`:

1. Delete `ComingApproval` (lines 195-210) and `WaitingActs` (lines 212-279), and the `useEffect`, `useRef` and `Confirm` imports they alone used (keep what `Bar`, `RungBar` and the rest still read).
2. `ComingLine` (lines 281-319): drop the `approval` prop, the refusal branch and `<WaitingActs …/>`; a waiting run's line keeps its time, its name (the door to the run, as today) and its pill ("Waiting on you"):

```tsx
/**
 * One line of "Coming up": when, what, who will get it, and its act. A run that waits says so ("Waiting on you") and is
 * decided on its row of the ledger, never here (decision 14: one decision per run per screen).
 */
function ComingLine({ r, acts }: { r: LifecycleComing; acts: RailActs }) {
  const turnOn = r.act.kind === "turn_on";
  return (
    <li className="cmh-coming-line" data-kind={r.kind} data-testid="cmh-coming-line">
      <span className="cmh-when">
        <span>{r.when.day}</span>
        <span>{r.when.at}</span>
      </span>
      <span className="cmh-what">
        {turnOn ? (
          <span className="cmh-what-name">{r.what}</span>
        ) : (
          <LinkButton className="cmh-what-name" onClick={() => acts.onAct(r.act)} data-testid="cmh-coming-open">
            {r.what}
          </LinkButton>
        )}
        <span className="cmh-dim">{r.why}</span>
      </span>
      {r.pill ? <StatePill kind="tone" value={r.pill.tone} label={r.pill.label} /> : null}
      {turnOn ? (
        <Button size="sm" onClick={() => acts.onAct(r.act)} data-testid="cmh-coming-turn-on" {...acts.gated}>
          {r.act.label}
        </Button>
      ) : null}
    </li>
  );
}
```
3. `ComingBlock` (lines 321-355): drop its `approval` prop and pass none to `ComingLine`; its door goes to Sent's week:
```tsx
      <BlockHead title={W.title} note={W.window} door={{ label: W.link, to: "broadcasts" }} />
```
4. Export `TileRead` (line 94: `export function TileRead(`), which the phone's meta line reads in Task 9.

In `campaigns.css`, delete the rules only the removed acts drew: `.cmh-coming-acts { … }` (~line 5312), `.cmh[data-phone] .cmh-coming-line > .cmh-coming-acts { … }` (~5320) and `.cmh-coming-why { … }` (~5324). (`grep -n "cmh-coming-acts\|cmh-coming-why" apps/dashboard/src/surfaces/campaigns/campaigns.css` finds them.)

`home-page.tsx` reads `ComingApproval` and passes `approval` to `ComingBlock`; so the tree typechecks between this task and Task 10 (which writes the page whole, with the rows' approval), delete from it now: the two `approval={approval}` props on `ComingBlock`, the `const approval = useApproval(flash, canAct);` line, the `useApproval` function (lines 118-176 at `7ff179717`), the `ComingApproval` type import, and the imports only that function read (`Output`, `bcWhenWords`, `LifecycleComing`, and `useRef` and `useState` if nothing else in the file reads them). Until Task 10 no surface approves a run on the home; the drawer's Approve still does.

- [ ] **Step 5: Run the tests**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS (3 tests); no type errors. `campaigns-home.test.mjs` now fails on Coming up's approval tests; Task 10 moves them to the rows. Do not run the whole suite.

- [ ] **Step 6: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx apps/dashboard/src/surfaces/campaigns/home/tiles.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home
git add apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-acts.tsx apps/dashboard/src/surfaces/campaigns/home/tiles.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
git commit -F - <<'EOF'
A waiting run is decided on its row and a paused campaign resumed by a question in place; Coming up keeps the time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 7: The desk ledger (`ledger-row.tsx`, `ledger-tools.tsx`, `ledger.tsx`) and its grid

In the rail's pane, under the moments: past seven rows a sticky tool line (search, the status tabs with none at zero but All, "Showing 7 of 19", Sort and Group menus) and the column heads once, in caps, the sorted one in the chosen ink; then the groups (a head with its glyph in a 22px ring, caps, meta and its add) and their rows. Under seven: the rows alone, no tools, no heads; one-off sends a footer. A row copies Sent's run row part for part (`apps/dashboard/src/surfaces/campaigns/broadcasts/ledger.tsx:461-581`): a subgrid line, a press anywhere that is not a control opens it (`cmRowPress`), its name an `href` door.

**Files:**
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-row.tsx`
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-tools.tsx`
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger.tsx`
- Modify: `apps/dashboard/src/surfaces/campaigns/campaigns.css` (a new block after the rail's rules, before `/* The three tiles. */`, ~line 5191)
- Test: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`:

```js
/* ---------------------------------------------- the desk ledger, drawn alone ---------------------------------------------- */

const { Ledger } = await import(`${SRC}/surfaces/campaigns/home/ledger/ledger.tsx`);
const { useLedgerView } = await import(`${SRC}/surfaces/campaigns/home/ledger/use-ledger-view.ts`);
const { Menu } = await import(`${SRC}/surfaces/kit/menu/menu.tsx`);
const h = globalThis.React.createElement;

/** The ledger's words: contracts' own (their test is lane 2's ledger.test.mjs), so a ledger drawn alone says what the page says. */
const WORDS = contracts.LIFECYCLE_WORDS.ledger;
const rowOf = (id, over = {}) => ({ ...ROW, id, name: id, status: "on", tone: "ok", waiting: null, search: id, open: { kind: "open", label: "Open", playbookId: id }, next: { words: "tomorrow 9:00 AM", atMs: NOW + 3_600_000 }, ...over });
const groupOf = (id, rows, add = null) => ({ id, caps: id.replace("_", " ").toUpperCase(), glyph: "bell", meta: "", rows, add });
const ledgerOf = (groups, over = {}) => ({
  groups,
  // NINE's own: seven campaigns (the receptionist and the call's text are no campaign), one waiting, one paused.
  counts: { all: 7, running: 6, needs: 1, paused: 1 },
  tools: true,
  sentOnce: null,
  period: "Last 30 days",
  results: "read",
  words: WORDS,
  ...over,
});
const NO_FAILED = { templates: null, chains: null, report: null };
/** What the page hands the rows: doors as links (routeDoor, pushed for a drawer), presses written down. */
const ledgerActs = () => {
  const did = [];
  return {
    did,
    door: (act) =>
      act.kind === "open"
        ? { href: `/w/studio/campaigns/moment:${act.playbookId}`, onClick: () => went.push(`campaigns/moment:${act.playbookId}`) }
        : act.kind === "route"
          ? { href: `/w/studio/${act.route}`, onClick: () => went.push(act.route) }
          : null,
    onAct: (act) => did.push(act.kind),
    gated: {},
    approval: approvalOf(),
  };
};
/** The ledger as the page draws it: its view held over the stub React, then the component. */
const drawLedger = (ledger, { group = null, mark = null, failed = NO_FAILED } = {}) => {
  const acts = ledgerActs();
  const draw = () =>
    again(() => {
      const view = useLedgerView(ledger, { group, onGroup: (g) => went.push(["group", g]), phone: false });
      return h(Ledger, { ledger, failed, view, acts, cursor: null, mark, searchRef: { current: null } });
    });
  return { draw, acts };
};
const NINE = () =>
  ledgerOf([
    groupOf("first_contact", [rowOf("receptionist", { kind: "receptionist", status: "always", open: null }), rowOf("call_text", { kind: "call_text", open: { kind: "route", label: "Library", route: "messages" } })]),
    groupOf("before", [rowOf("pb-a", { results: { kind: "sent", sent: 212, replied: 48 }, people: { n: 7, unit: "people" } }), rowOf("pb-b", { status: "waiting", tone: "warn", waiting: { runId: "b-1", people: 7, refusal: null } })]),
    groupOf("after", [], { kind: "turn_on", label: "Turn on", moment: "visited" }),
    groupOf("quiet", [rowOf("pb-c", { status: "paused", tone: "plain", results: "uncounted", act: { kind: "resume", label: "Resume", playbookId: "pb-c", ask: { question: "Resume pb-c?", detail: "Next run today 10:00 AM, about 25 people" } } }), rowOf("pb-d")]),
    groupOf("lists", [rowOf("pb-e"), rowOf("pb-f")]),
    groupOf("reach_out", [rowOf("ch-1", { kind: "chain", results: { kind: "written", written: 40, wroteBack: 6 } })], { kind: "route", label: "Find businesses to write to", route: "clients/leads" }),
  ]);

test("past seven rows the tool line stands: the search, a tab per status above zero, how many are shown, Sort and Group", () => {
  fresh();
  const tree = drawLedger(NINE()).draw();
  const tools = byTestId(tree, "cmh-ledger-tools");
  assert.ok(byTestId(tools, "cmh-ledger-search"), "the search");
  assert.deepEqual(
    all(tools, (n) => /^cmh-status-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["cmh-status-all", "cmh-status-needs", "cmh-status-paused"],
  );
  assert.equal(textOf(byTestId(tools, "cmh-ledger-say")), "Showing 7 of 7", "campaigns, as the All tab counts them");
  assert.equal(byTestId(tools, "cmh-ledger-search").props.placeholder, "Search 7 campaigns", "one number on one line");
  assert.equal(
    find(tools, (n) => n.props?.["data-testid"] === "cmh-status-needs" && "title" in n.props)?.props.title,
    WORDS.needsOf(1),
    "Needs you names its unit (decision 19)",
  );
  const menus = all(tools, (n) => n.type === Menu);
  assert.deepEqual(menus.map((m) => m.props.groups[0].choose.value), ["next", "moment"], "Sort, then Group, each a set to choose one of");
  menus[0].props.groups[0].choose.onChoose("name");
  const heads = byTestId(drawLedger(NINE()).draw(), "cmh-ledger-heads");
  assert.ok(heads, "the column heads, once");
});

test("a status at zero has no tab, but All", () => {
  fresh();
  const tree = drawLedger(ledgerOf(NINE().groups, { counts: { all: 7, running: 5, needs: 0, paused: 2 } })).draw();
  assert.deepEqual(
    all(tree, (n) => /^cmh-status-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["cmh-status-all", "cmh-status-paused"],
  );
});

test("under seven rows: no tool line, no heads, the rows in their groups, an empty moment with its Turn on, one-off sends a footer", () => {
  fresh();
  const few = ledgerOf(
    [groupOf("before", [rowOf("pb-a")]), groupOf("after", [], { kind: "turn_on", label: "Turn on", moment: "visited" })],
    { tools: false, sentOnce: { n: 3, open: { kind: "route", label: "Sent", route: "broadcasts" } } },
  );
  const tree = drawLedger(few).draw();
  assert.equal(byTestId(tree, "cmh-ledger-tools"), null);
  assert.equal(byTestId(tree, "cmh-ledger-heads"), null);
  assert.deepEqual(allBy(tree, "cmh-group-head").map((g) => textOf(g).includes("Turn on")), [false, true]);
  const once = byTestId(tree, "cmh-sent-once");
  assert.match(textOf(once), /Sent once · last 30 days · 3/);
  press(byTestId(once, "cmh-sent-once-open"));
  assert.deepEqual(went, ["broadcasts"], "a door to Sent");
});

test("a row: its name a link to its drawer, the whole row its press, what came back in words, the next run, and its one act", () => {
  fresh();
  const { draw, acts } = drawLedger(NINE());
  const tree = draw();
  const rows = allBy(tree, "cmh-row");
  const a = rows.find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-kind"], "playbook");
  assert.equal(a.props["data-state"], "on");
  const name = byTestId(a, "cmh-row-open");
  assert.equal(name.props.href, "/w/studio/campaigns/moment:pb-a", "a link, so a middle-click opens a tab");
  assert.ok("data-row-open" in name.props, "the row's press presses it (cmRowPress)");
  assert.match(textOf(a), /212 sent · 48 replied/);
  assert.match(textOf(a), /tomorrow 9:00 AM/);
  const c = rows.find((r) => r.props["data-row"] === "pb-c");
  assert.match(textOf(c), /—/, "a number not counted is a dash");
  assert.ok(byTestId(c, "cmh-resume"), "a paused row resumes, asked");
  const b = rows.find((r) => r.props["data-row"] === "pb-b");
  assert.equal(b.props["data-state"], "waiting");
  assert.match(textOf(byTestId(b, "cmh-approve")), /Approve · 7 people/);
  const chain = rows.find((r) => r.props["data-row"] === "ch-1");
  assert.match(textOf(chain), /40 written · 6 wrote back/, "a chain in Reports' words");
  const call = rows.find((r) => r.props["data-row"] === "call_text");
  assert.equal(byTestId(call, "cmh-row-open").props.href, "/w/studio/messages", "the call's text is a door to the Library");
  const receptionist = rows.find((r) => r.props["data-row"] === "receptionist");
  assert.equal(byTestId(receptionist, "cmh-row-open"), null, "the receptionist has no page to open");
  // Turn on on an empty moment's head is a press; Reach-outs' add is a door to Leads.
  const heads = allBy(tree, "cmh-group-add");
  press(heads.find((n) => textOf(n).includes("Turn on")));
  assert.deepEqual(acts.did, ["turn_on"]);
  assert.equal(heads.find((n) => textOf(n).includes("Find businesses")).props.href, "/w/studio/clients/leads");
});

test("a chain whose run waits opens that run from its row: its act is a door, as lane 2's view model says", () => {
  fresh();
  const waits = rowOf("ch-w", {
    kind: "chain",
    status: "waiting",
    tone: "warn",
    act: { kind: "route", label: "Open the run", route: "broadcasts/run:r-9" },
  });
  const tree = drawLedger(ledgerOf([groupOf("reach_out", [waits])], { tools: false })).draw();
  const door = byTestId(allBy(tree, "cmh-row")[0], "cmh-row-run");
  assert.equal(door.props.href, "/w/studio/broadcasts/run:r-9");
  assert.match(textOf(door), /Open the run/);
});

test("a chosen group says which, how many of how many, and Clear; nothing matching says so, with Clear", () => {
  fresh();
  let tree = drawLedger(NINE(), { group: "quiet" }).draw();
  assert.equal(textOf(byTestId(tree, "cmh-ledger-say")), "QUIET · showing 2 of 7");
  press(byTestId(tree, "cmh-ledger-clear"));
  assert.deepEqual(went, [["group", null]]);
  // Under seven rows the line still says the group and its Clear, and nothing else.
  fresh();
  tree = drawLedger(ledgerOf([groupOf("before", [rowOf("pb-a")]), groupOf("quiet", [rowOf("pb-c")])], { tools: false }), { group: "quiet" }).draw();
  assert.equal(byTestId(tree, "cmh-ledger-search"), null);
  assert.equal(textOf(byTestId(tree, "cmh-ledger-say")), "QUIET · showing 1 of 2");
  // A filter nothing answers says so, with its Clear: here the address names a moment that holds no campaign.
  fresh();
  tree = drawLedger(NINE(), { group: "after" }).draw();
  const none = byTestId(tree, "cmh-ledger-none") ?? find(tree, (n) => n.props?.testid === "cmh-ledger-none");
  assert.ok(none, "the empty state, in its line kind");
  assert.match(textOf(none), /No campaigns match/);
  assert.equal(allBy(tree, "cmh-group").length, 0, "and no group drawn empty under a filter");
});

test("a row decided in place settles once; a row that arrived is drawn anew and washed", () => {
  fresh();
  let tree = drawLedger(NINE(), { mark: { id: "pb-a", kind: "settled" } }).draw();
  let a = allBy(tree, "cmh-row").find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-settled"], "true");
  assert.equal(a.props["data-arrived"], undefined);
  fresh();
  tree = drawLedger(NINE(), { mark: { id: "pb-a", kind: "arrived" } }).draw();
  a = allBy(tree, "cmh-row").find((r) => r.props["data-row"] === "pb-a");
  assert.equal(a.props["data-arrived"], "true");
});

test("a read that failed keeps its place: the templates in First contact, the chains in Reach-outs, the numbers in the tool line", () => {
  fresh();
  const F = (what, surface) => ({ what, body: "The rest is current.", surface });
  const tree = drawLedger(NINE(), {
    failed: { templates: F("your templates", "settings"), chains: F("your reach-outs", "reach_outs"), report: F("this period's numbers", "campaign_results") },
  }).draw();
  const groups = allBy(tree, "cmh-group");
  const inGroup = (id, testid) => byTestId(groups.find((g) => g.props["data-group"] === id), testid);
  assert.ok(inGroup("first_contact", "cmh-templates-failed"));
  assert.ok(inGroup("reach_out", "pb-chains-failed"));
  assert.ok(byTestId(byTestId(tree, "cmh-ledger-tools"), "cmh-ledger-failed"));
});
```

(The stub React draws a component function as it is created and walks what it drew, so a kit component on Base UI is found by its props: `Menu`'s `groups`, a `SubTabs` tab's `data-testid`, `Field`'s control's `data-testid`. A Base UI part itself is an object the stub does not draw, which is why the tests read props and press `onClick`s rather than open a menu.)

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`
Expected: FAIL (`Cannot find module …/ledger.tsx`).

- [ ] **Step 3: Write the row**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-row.tsx`:

```tsx
/**
 * One row of Campaigns' ledger on a desk (spec 2026-10-09 §4.3), Sent's run row part for part (broadcasts/ledger.tsx
 * BcRunCard): one subgrid line of the ledger's grid, a press anywhere on it that is not one of its controls pressing its
 * opener (parts/head.tsx cmRowPress), its name the door, a link with its address, so a middle-click opens a tab. A dot in
 * its state's tone, its name and hint; the channels it goes by; who is at its moment now; what came back in the last 30
 * days ("212 sent · 48 replied", a chain's "40 written · 6 wrote back", "Nothing sent", or "—" where it was not counted);
 * when it goes next, warn where it waits and plain where paused; and its one act. 44px, a hairline between rows, no
 * zebra. Under 1000px of page the channels and the people fold under the name. Every word is the view model's.
 */
import type { LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ChannelMarks } from "../../parts/channels-line";
import { cmRowPress } from "../../parts/head";
import { AddAct, ResumeAct, WaitingActs } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";

/** The ledger's words, as the view model hands them. */
type Words = LifecycleLedger["words"];

/** What came back of a row in the last 30 days, in the ledger's words, and whether it is said dim (nothing, or not counted). */
export function resultsWords(r: LifecycleRow, W: Words): { words: string; dim: boolean } {
  return { words: W.results(r.results), dim: typeof r.results !== "object" };
}

/** Who is at a row's moment now, or a dash where it was not counted. */
const peopleWords = (r: LifecycleRow, W: Words): string => (r.people.n === null ? W.dash : String(r.people.n));

/** A row's name: its door where it opens something (a drawer, the Library, a run), else its words. */
export function RowName({ r, acts }: { r: LifecycleRow; acts: LedgerActs }) {
  const door = r.open ? acts.door(r.open) : null;
  if (!door) return <span className="cmh-row-name">{r.name}</span>;
  return (
    <LinkButton {...door} className="cmh-row-name" data-row-open data-testid="cmh-row-open">
      {r.name}
      {r.kind === "call_text" ? <Icon name="chevron" size={12} /> : null}
    </LinkButton>
  );
}

/**
 * A row's one act: Approve and Skip where its run waits, Resume (asked) where it is paused, Turn on where it is off,
 * and a door where its act opens a page (a chain's waiting run, decided on its own page: lane 2's "Open the run").
 */
function RowAct({ r, W, acts }: { r: LifecycleRow; W: Words; acts: LedgerActs }) {
  if (r.waiting) return <WaitingActs r={r} w={r.waiting} approve={W.approve(r.waiting.people)} approval={acts.approval} />;
  const act = r.act;
  if (act && act.kind === "resume") return <ResumeAct act={act} onAct={acts.onAct} gated={acts.gated} />;
  if (act && act.kind === "turn_on") return <AddAct act={act} acts={acts} testid="cmh-row-turn-on" />;
  if (act && act.kind === "route") return <AddAct act={act} acts={acts} testid="cmh-row-run" />;
  return null;
}

interface LedgerRowProps {
  r: LifecycleRow;
  W: Words;
  acts: LedgerActs;
  /** The keys' cursor is on it: it shows its acts as a hovered row does. */
  cursor: boolean;
  /** Decided here a moment ago (it settles once), or just arrived (washed once). */
  mark: "settled" | "arrived" | null;
}

/** One row of the ledger, on a desk. */
export function LedgerRow({ r, W, acts, cursor, mark }: LedgerRowProps) {
  const results = resultsWords(r, W);
  const people = peopleWords(r, W);
  return (
    <div
      className="cmh-row"
      data-row={r.id}
      data-kind={r.kind}
      data-state={r.status}
      data-cursor={cursor ? "true" : undefined}
      data-settled={mark === "settled" ? "true" : undefined}
      data-arrived={mark === "arrived" ? "true" : undefined}
      data-testid="cmh-row"
    >
      {/* A press anywhere on the line that is not one of its controls opens the row, as Sent's runs and People's rows. */}
      <div className="cmh-row-line" role="presentation" onClick={cmRowPress}>
        <div className="cmh-row-what">
          <span className="cmh-row-dot" data-tone={r.tone} aria-hidden="true" />
          <RowName r={r} acts={acts} />
          {r.hint ? <span className="cmh-dim cmh-row-hint">{r.hint}</span> : null}
          {/* Under 1000px of page the two columns that leave stand here, under the name (campaigns.css). */}
          <span className="cmh-row-fold" aria-hidden="true">
            <ChannelMarks marks={r.channels} />
            <span className="tabular">{people}</span>
          </span>
        </div>
        <div className="cmh-row-by">
          <ChannelMarks marks={r.channels} testid="cmh-row-chans" />
        </div>
        <div className="cmh-row-people tabular" data-testid="cmh-row-people">
          {people}
        </div>
        <div className="cmh-row-results tabular" data-dim={results.dim ? "true" : undefined}>
          {results.words}
        </div>
        <div className="cmh-row-next" data-testid="cmh-row-next">
          {r.next.words}
        </div>
        {/* A question asked here is answered here: a press on its words is not the row's. */}
        <div className="cmh-row-acts" role="presentation" onClick={(e) => e.stopPropagation()}>
          <RowAct r={r} W={W} acts={acts} />
        </div>
      </div>
    </div>
  );
}
```
- [ ] **Step 4: Write the tool line, the heads and the footer**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-tools.tsx`:

```tsx
/**
 * Campaigns' ledger's tool line, its column heads and its one-off footer (spec 2026-10-09 §4.3; decision 15). Past seven
 * rows: the search ("Search 19 campaigns"), the status tabs (a tab for each status above zero, All always; "Needs you"
 * the one in amber, as Sent's band draws its states: broadcasts/ledger.tsx BcBand), how many are shown ("Showing 7 of
 * 19", or "Visit tomorrow · showing 3 of 19" with a card chosen, and Clear), and Sort and Group, each a set to choose
 * one of; and the heads once, in caps, the sorted one in the chosen ink. Under seven rows: a group chosen says so, with
 * its Clear, and nothing else. A read of the numbers that failed is said here, once. Every word is the view model's.
 */
import type { RefObject } from "react";
import { LEDGER_SORTS, LEDGER_STATUSES } from "@chanlytics/contracts";
import type { LedgerSort, LedgerStatus, LifecycleFailedRead, LifecycleLedger } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Menu } from "../../../kit/menu/menu";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import type { SubTab } from "../../../kit/sub-tabs/sub-tabs";
import { HomeFailed } from "../failed";
import type { LedgerActs } from "./ledger-acts";
import { LEDGER_GROUPINGS } from "./use-ledger-view";
import type { LedgerGrouping, LedgerView } from "./use-ledger-view";

type Words = LifecycleLedger["words"];

/** A tab's id read back as the status it names; one it does not know is All. */
const statusOfTab = (id: string): LedgerStatus => LEDGER_STATUSES.find((s) => s === id) ?? "all";
const sortOf = (id: string): LedgerSort => LEDGER_SORTS.find((s) => s === id) ?? "next";
const groupingOf = (id: string): LedgerGrouping => LEDGER_GROUPINGS.find((s) => s === id) ?? "moment";

/** The status tabs: All always, the others only above zero; Needs you the amber one. */
function statusTabs(ledger: LifecycleLedger): SubTab[] {
  const W = ledger.words.tabs;
  const c = ledger.counts;
  const tab = (id: LedgerStatus, label: string, count: number): SubTab => ({
    id,
    label,
    count,
    // Needs you names its unit (decision 19): "2 campaigns need you", on hover.
    ...(id === "needs" ? { tone: "warn" as const, hint: ledger.words.needsOf(count) } : {}),
    testid: `cmh-status-${id}`,
  });
  return [
    tab("all", W.all, c.all),
    ...(c.needs > 0 ? [tab("needs", W.needs, c.needs)] : []),
    ...(c.paused > 0 ? [tab("paused", W.paused, c.paused)] : []),
  ];
}

/** How many are shown, and Clear where something narrows the list. */
function ToolSay({ view, W }: { view: LedgerView; W: Words }) {
  const say = view.chosen ? W.showingIn(view.chosen.caps, view.shown, view.total) : W.showing(view.shown, view.total);
  return (
    <>
      <span className="cmh-ledger-say" data-testid="cmh-ledger-say">
        {say}
      </span>
      {view.filtered ? (
        <LinkButton onClick={view.clearAll} data-testid="cmh-ledger-clear">
          {W.clear}
        </LinkButton>
      ) : null}
    </>
  );
}

/** Sort and Group: each a menu of one set to choose from, its control saying what is chosen. */
function ChooseMenus({ view, W }: { view: LedgerView; W: Words }) {
  const tick = <Icon name="check" size={13} />;
  return (
    <>
      <Menu
        label={W.sort.label}
        trigger={
          <Button variant="quiet" size="sm" data-testid="cmh-ledger-sort">
            {W.sort.label} <span className="cmh-dim">{W.sort[view.sort]}</span>
          </Button>
        }
        groups={[
          {
            choose: {
              value: view.sort,
              onChoose: (v) => view.setSort(sortOf(v)),
              tick,
              options: LEDGER_SORTS.map((id) => ({ value: id, label: W.sort[id] })),
            },
          },
        ]}
      />
      <Menu
        label={W.group.label}
        trigger={
          <Button variant="quiet" size="sm" data-testid="cmh-ledger-group">
            {W.group.label} <span className="cmh-dim">{W.group[view.grouping]}</span>
          </Button>
        }
        groups={[
          {
            choose: {
              value: view.grouping,
              onChoose: (v) => view.setGrouping(groupingOf(v)),
              tick,
              options: LEDGER_GROUPINGS.map((id) => ({ value: id, label: W.group[id] })),
            },
          },
        ]}
      />
    </>
  );
}

interface ToolsProps {
  ledger: LifecycleLedger;
  view: LedgerView;
  /** The numbers' read that failed, said once here; null where it was read. */
  failed: LifecycleFailedRead | null;
  searchRef: RefObject<HTMLInputElement | null>;
}

/** The ledger's tool line: everything past seven rows, the chosen group and its Clear under them, nothing else. */
export function LedgerTools({ ledger, view, failed, searchRef }: ToolsProps) {
  const W = ledger.words;
  const said = failed ? <HomeFailed failed={failed} testid="cmh-ledger-failed" /> : null;
  if (!ledger.tools) {
    if (!view.chosen && !said) return null;
    return (
      <div className="cmh-ledger-line" data-testid="cmh-ledger-tools">
        {view.chosen ? <ToolSay view={view} W={W} /> : null}
        {said}
      </div>
    );
  }
  return (
    <div className="cmh-ledger-line" data-testid="cmh-ledger-tools">
      <Field
        type="search"
        aria-label={W.search(ledger.counts.all)}
        placeholder={W.search(ledger.counts.all)}
        value={view.query}
        onValueChange={view.setQuery}
        ref={searchRef}
        className="cmh-ledger-find"
        data-testid="cmh-ledger-search"
      />
      <SubTabs
        label={W.tabs.label}
        value={view.status}
        tabs={statusTabs(ledger)}
        onSelect={(id) => view.setStatus(statusOfTab(id))}
        quietCounts
        dense
        className="cmh-ledger-states"
      />
      <ToolSay view={view} W={W} />
      <ChooseMenus view={view} W={W} />
      {said}
    </div>
  );
}

/** Which column a sort is read in: the head that wears the chosen ink. */
const SORTED_HEAD: Record<LedgerSort, keyof Words["heads"]> = {
  name: "campaign",
  people: "people",
  replied: "results",
  next: "next",
};

/** The column heads, once, in caps: Campaign · Goes by · People now · Last 30 days · Next, the sorted one in the ink. */
export function LedgerHeads({ W, sort }: { W: Words; sort: LedgerSort }) {
  const head = (col: keyof Words["heads"]) => (
    <span className="cmh-ledger-head" data-col={col} data-sorted={SORTED_HEAD[sort] === col ? "true" : undefined}>
      {W.heads[col]}
    </span>
  );
  return (
    <div className="cmh-ledger-heads" aria-hidden="true" data-testid="cmh-ledger-heads">
      {head("campaign")}
      {head("goesBy")}
      {head("people")}
      {head("results")}
      {head("next")}
      <span />
    </div>
  );
}

/** One-off sends under seven rows: one line, how many went in the last 30 days, and the door to Sent. */
export function SentOnce({ ledger, acts }: { ledger: LifecycleLedger; acts: LedgerActs }) {
  const once = ledger.sentOnce;
  if (!once) return null;
  const door = acts.door(once.open);
  return (
    <p className="cmh-once" data-testid="cmh-sent-once">
      <span>{ledger.words.sentOnce.footer(once.n)}</span>
      {door ? (
        <LinkButton {...door} data-testid="cmh-sent-once-open">
          {ledger.words.sentOnce.open}
        </LinkButton>
      ) : null}
    </p>
  );
}
```

(`Field`'s `ref` reaches the input; `searchRef` is the page's, which `/` focuses. Base UI's `Tabs` is in every page already (the frame's `ViewTabs`, `kit/view-tabs/view-tabs.tsx`), its `Menu` in the Campaigns page (`playbooks/card-detail.tsx`) and its `Field` there too (`playbooks/composer.tsx`).)

- [ ] **Step 5: Write the ledger**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger.tsx`:

```tsx
/**
 * Campaigns' ledger on a desk (spec 2026-10-09 §4.3; option A of the canvas of 9 October): every campaign in one place, in
 * the rail's pane under the moments, grouped by moment in the journey's order, then Lists & offers, Reach-outs and
 * one-off sends. Past seven rows a sticky tool line and the column heads, the groups' heads sticking under it; under
 * seven, the rows alone and one-off sends a footer. One grid, each group, row and line a subgrid of it, as Sent's runs
 * are (campaigns.css .bc-runs). A filter is answered with the kit's swap (useSwapMotion on the groups); typing moves
 * nothing; a row decided in place settles once; an arrival is drawn anew, so the kit's wash plays once. A read that
 * failed keeps its place: the templates' in First contact, the chains' in Reach-outs, the numbers' in the tool line.
 */
import type { ReactNode, RefObject } from "react";
import type { LifecycleFailed, LifecycleGroup, LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { useSwapMotion } from "../../../kit/motion/use-swap-motion";
import { HomeFailed } from "../failed";
import { AddAct } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";
import type { RowMark } from "./ledger-keys";
import { LedgerRow } from "./ledger-row";
import { LedgerHeads, LedgerTools, SentOnce } from "./ledger-tools";
import type { LedgerView } from "./use-ledger-view";

/** The reads the ledger says it could not make, where their data would be. */
type LedgerFailed = Pick<LifecycleFailed, "templates" | "chains" | "report">;

/** A failed read said inside its group: the call's text's templates in First contact, the chains in Reach-outs. */
function failedIn(id: LifecycleGroup["id"], failed: LedgerFailed): ReactNode {
  if (id === "first_contact" && failed.templates) {
    return <HomeFailed failed={failed.templates} testid="cmh-templates-failed" />;
  }
  if (id === "reach_out" && failed.chains) return <HomeFailed failed={failed.chains} testid="pb-chains-failed" />;
  return null;
}

/** A group: its head (its glyph in a ring, its caps, what it says of itself, its add), its rows, a read that failed. */
function LedgerGroup({ g, acts, children, failed }: { g: LifecycleGroup; acts: LedgerActs; children: ReactNode; failed: ReactNode }) {
  return (
    <section className="cmh-group" data-group={g.id} aria-label={g.caps} data-testid="cmh-group">
      <div className="cmh-group-head" data-testid="cmh-group-head">
        <span className="cmh-group-ring" aria-hidden="true">
          <Icon name={g.glyph} size={12} />
        </span>
        <h3 className="cmh-group-caps">{g.caps}</h3>
        <span className="cmh-dim cmh-group-meta">{g.meta}</span>
        {g.add ? <AddAct act={g.add} acts={acts} testid="cmh-group-add" /> : <span />}
      </div>
      {children}
      {failed}
    </section>
  );
}

interface LedgerProps {
  ledger: LifecycleLedger;
  failed: LedgerFailed;
  view: LedgerView;
  acts: LedgerActs;
  cursor: string | null;
  mark: RowMark;
  searchRef: RefObject<HTMLInputElement | null>;
}

/** The desk's ledger: the tool line, the heads, the groups and their rows, the one-off footer. */
export function Ledger(p: LedgerProps) {
  const { ledger, view, acts, failed } = p;
  const list = useSwapMotion<HTMLElement>(`${view.status}|${view.group ?? ""}`, ".cmh-group");
  const markOf = (id: string) => (p.mark && p.mark.id === id ? p.mark.kind : null);
  // An arrival is keyed anew, so its row is a new element and the wash's starting style plays once (kit.css's rule for a
  // changed line, which campaigns.css's row copies).
  const drawRow = (r: LifecycleRow) => (
    <LedgerRow
      key={markOf(r.id) === "arrived" ? `${r.id}:arrived` : r.id}
      r={r}
      W={ledger.words}
      acts={acts}
      cursor={p.cursor === r.id}
      mark={markOf(r.id)}
    />
  );
  const chainsAlone = !view.filtered && failed.chains && !view.visibleGroups.some((g) => g.id === "reach_out");
  return (
    <section
      ref={list}
      className="cmh-ledger"
      aria-label={ledger.words.label}
      data-tools={ledger.tools ? "true" : undefined}
      data-testid="cmh-ledger"
    >
      <LedgerTools ledger={ledger} view={view} failed={failed.report} searchRef={p.searchRef} />
      {ledger.tools ? <LedgerHeads W={ledger.words} sort={view.sort} /> : null}
      {view.rows.length === 0 && view.filtered ? (
        <div className="cmh-ledger-none">
          <EmptyState
            kind="line"
            title={ledger.words.empty}
            action={{ label: ledger.words.clear, onClick: view.clearAll }}
            testid="cmh-ledger-none"
          />
        </div>
      ) : null}
      {view.grouped ? (
        view.visibleGroups.map((g) => (
          <LedgerGroup key={g.id} g={g} acts={acts} failed={failedIn(g.id, failed)}>
            {g.rows.map(drawRow)}
          </LedgerGroup>
        ))
      ) : (
        <div className="cmh-group" data-testid="cmh-group">
          {view.visibleRows.map(drawRow)}
        </div>
      )}
      {chainsAlone && failed.chains ? <HomeFailed failed={failed.chains} testid="pb-chains-failed" /> : null}
      <SentOnce ledger={ledger} acts={acts} />
    </section>
  );
}
```

(`EmptyState`'s props are `kind`, `title`, `body`, `action { label, onClick | to }`, `testid`: `kit/empty/empty.tsx:27-50`. If its `action.label` is typed `ReactNode`, a string is fine.)

- [ ] **Step 6: The grid and the row in `campaigns.css`**

Before the block `/* The three tiles. */` (~line 5191 of `apps/dashboard/src/surfaces/campaigns/campaigns.css`), add (every class here was checked absent; re-run the grep of "Read this first" for each before you write it):

```css
/* The ledger (home/ledger/ledger.tsx; spec 2026-10-09 §4.3): every campaign in the rail's pane, under the moments. One
   grid for the whole list, and each group, row and line a subgrid of it, as Sent's runs are (.bc-runs, above), so a
   column is one width down the list whatever a row holds. The columns: the campaign (its dot, name and hint), what it
   goes by, who is at it now, the last 30 days, the next run, its act (fit to it, as Sent's acts' track is: "Approve ·
   7 people" and Skip side by side). The tool line sticks at the page's top past seven rows, at a height of its own so
   the groups' heads can stick under it. The pane is clipped, not hidden, so the page's scroll is the one they stick to. */
.cmh .cmh-rail-block {
  overflow: clip;
}
.cmh-ledger {
  --cmh-tools-h: 52px;
  display: grid;
  /* Sent's track shape (.bc-runs): every column but the act's may give way, so the grid never runs past the pane between
     the fold below (1000px of page) and the width where every column has its room (about 1,130px). Fixed tracks here
     overflowed the clipped pane at 1280-1440px windows. */
  grid-template-columns:
    minmax(0, 1.7fr) minmax(0, 150px) minmax(0, 96px) minmax(0, 190px) minmax(0, 168px)
    fit-content(240px);
  column-gap: 14px;
  margin-top: var(--space-3);
  border-top: 1px solid var(--line);
}
.cmh-ledger > *,
.cmh-group > *,
.cmh-row-line {
  grid-column: 1 / -1;
}
.cmh-group,
.cmh-row,
.cmh-row-line,
.cmh-ledger-heads {
  display: grid;
  grid-template-columns: subgrid;
}
.cmh-ledger-line {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-sizing: border-box;
  min-height: var(--cmh-tools-h);
  padding: var(--space-2) 22px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  /* The pane's own fill, laid opaque over what it sits on (tokens.css, the glass's solids): the rows do not show through
     the band, and the band reads as the clear pane it stands in. */
  background: var(--surface-pane-solid);
}
.cmh-ledger-find {
  flex: 0 1 240px;
  min-width: 160px;
}
.cmh-ledger-states {
  flex: 1 1 auto;
  min-width: 0;
}
.cmh-ledger-say {
  flex: none;
  font-size: var(--text-sm);
  color: var(--ink-dim);
  white-space: nowrap;
}
.cmh-ledger-heads {
  padding: var(--space-2) 22px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-dim);
}
.cmh-ledger-head[data-sorted="true"] {
  color: var(--ink);
}
.cmh-ledger-none {
  padding: var(--space-4) 22px;
}
/* A group's head: its glyph in a 22px ring, its caps, what it says of itself, its add at the right. It sticks under the
   tool line where there is one, at the page's top where there is not. */
.cmh-group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: 22px auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) 22px var(--space-1);
  background: var(--surface-pane-solid);
}
.cmh-ledger[data-tools="true"] .cmh-group-head {
  top: var(--cmh-tools-h);
}
.cmh-group-ring {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--line-strong);
  border-radius: var(--radius-circle);
  color: var(--ink-dim);
}
.cmh-group-caps {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  font-weight: var(--weight-regular);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--ink-muted);
}
.cmh-group-meta {
  min-width: 0;
  font-size: var(--text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* A row: 44px, a hairline between two, no zebra; the hover's grey, and the keys' cursor wearing it too. */
.cmh-row + .cmh-row {
  border-top: 1px solid var(--line);
}
.cmh-row-line {
  align-items: center;
  box-sizing: border-box;
  min-height: 44px;
  padding: var(--space-1) 22px;
  cursor: pointer;
}
.cmh-row[data-cursor="true"] > .cmh-row-line {
  background: var(--bg-hover);
}
/* A pointer's hover alone: a touch screen keeps :hover on the last row tapped (memory reference_touch_hover_sticks). */
@media (hover: hover) {
  .cmh-row-line:hover {
    background: var(--bg-hover);
  }
  .cmh .cmh-row-name:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
}
.cmh-row-what {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.cmh-row-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-circle);
  background: var(--line-strong);
}
.cmh-row-dot[data-tone="ok"] {
  background: var(--ok);
}
.cmh-row-dot[data-tone="warn"] {
  background: var(--warn);
}
.cmh .cmh-row-name {
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmh-row-hint {
  min-width: 0;
  font-size: var(--text-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmh-row-fold {
  display: none;
}
.cmh-row-people,
.cmh-row-results,
.cmh-row-next {
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmh-row-results[data-dim="true"] {
  color: var(--ink-faint);
}
.cmh-row[data-state="waiting"] .cmh-row-next {
  color: var(--warn-ink);
}
.cmh-row-acts {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}
.cmh-row-decide {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}
.cmh-row-why {
  font-size: var(--text-xs);
}
.cmh-once {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3) 22px;
  border-top: 1px solid var(--line);
  font-size: var(--text-sm);
  color: var(--ink-dim);
}
/* A row decided where it stands (Approve, Skip, Resume) keeps its place and settles once: its next run arrives on the
   kit's own rise-in, as a record row's value does after its editor's save (kit.css, the save settle). */
.cmh-row[data-settled="true"] .cmh-row-next {
  animation: rise-in var(--duration-base) var(--ease-out) backwards;
}
/* A campaign just made or changed is scrolled to and washed once in the kit's on-and-ok tint, let go over 400ms, as the
   kit washes the line a draft changed (kit.css, .rec-says-line[data-changed]): the row is a new element as it arrives
   (keyed by its mark, ledger.tsx), so the transition from where it starts plays once. Its ground alone moves. */
.cmh-row[data-arrived="true"] > .cmh-row-line {
  transition: background-color calc(2 * var(--duration-base)) var(--ease-out);
}
@starting-style {
  .cmh-row[data-arrived="true"] > .cmh-row-line {
    background-color: var(--ok-soft);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cmh-row[data-settled="true"] .cmh-row-next {
    animation: none;
  }
  .cmh-row[data-arrived="true"] > .cmh-row-line {
    transition: none;
  }
}
/* Under 1000px of page the channels and the people fold under the campaign's name, and their columns leave. */
@container cmh (max-width: 1000px) {
  .cmh-ledger {
    grid-template-columns: minmax(0, 1fr) minmax(0, 170px) minmax(0, 150px) fit-content(220px);
  }
  .cmh-row-by,
  .cmh-row-people,
  .cmh-ledger-head:is([data-col="goesBy"], [data-col="people"]) {
    display: none;
  }
  .cmh-row-what {
    flex-wrap: wrap;
    row-gap: 2px;
  }
  .cmh-row-fold {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }
}
/* A thumb's press on a desk-sized touch screen: the name answers toward 44px, as the moments' names do. */
@media (pointer: coarse) {
  .cmh .cmh-row-name {
    position: relative;
  }
  .cmh .cmh-row-name::after {
    content: "";
    position: absolute;
    inset: -12px 0;
  }
}
```

(A note for the reviewer: `.cmh-ledger-line` and the groups' heads read `--surface-pane-solid`, the pane's fill made opaque (`tokens.css`, light and dark), so the rows do not show through them as they scroll under; check both themes on the rig, Task 20.)

- [ ] **Step 7: Run the tests and the style measures**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-css.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS (11 tests in ledger-page so far), PASS, PASS (no new literal style value, primitive class, breakpoint or complexity entry), no type errors. Then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/touch-hover.test.mjs`: PASS. If `code-health-ratchets` reports a fall (it will not yet: Task 8 deletes the strips' CSS), bank it then, not now.

- [ ] **Step 8: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/ledger apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home/ledger
git add apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-row.tsx apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-tools.tsx apps/dashboard/src/surfaces/campaigns/home/ledger/ledger.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
git commit -F - <<'EOF'
Campaigns' ledger draws every campaign in one grid, past seven rows with its search, tabs, count, sort and grouping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 8: The rail's card: its body a toggle, its name and Turn on beside it, a Meter where it holds many, and J3

A card keeps its caps, figure, unit, node, marks and needs (decision 1). Its caps, figure, unit and summary are one toggle (`Button variant="quiet"`, `aria-pressed`) that sets or lets go of `in:<group>`; the lead's name (`cmh-open`, the drawer, an `href` door) and Turn on are siblings, never inside it (`kit/press.tsx`: a button holds no button). A `Meter size="sm"` only where a moment holds two or more, unanimated. A paused moment offers Resume, asked. The strips under the rail go (the ledger holds them now). Figures and pads come down; under 1100px of page the rail keeps one line and scrolls across (J3), its edges fading only while it is wider than its pane. (`journeyOf` draws five moments at most in this program, so "past five moments" is the journey lane's: an overflow measured, not a count, covers it then.)

**Files:**
- Modify: `apps/dashboard/src/surfaces/campaigns/home/rail.tsx` (read it as lane 2 left it first)
- Modify: `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx` (the rail's acts)
- Modify: `apps/dashboard/src/surfaces/campaigns/campaigns.css` (the rail's block, ~lines 4790-5190)
- Test: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`:

```js
/* ------------------------------------------------------- the rail ------------------------------------------------------- */

const { Rail } = await import(`${SRC}/surfaces/campaigns/home/rail.tsx`);
const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);

/** A moment on the rail in the view model's shape (contracts LifecycleStage), on with one campaign by default. */
const stageOf = (id, over = {}) => ({
  id,
  caps: id.toUpperCase(),
  name: `${id} lead`,
  glyph: "bell",
  moment: id === "first_contact" ? null : `${id}_trigger`,
  playbookId: `pb-${id}`,
  people: 3,
  unit: "people",
  state: "on",
  stateWords: "On · daily 9:00 AM",
  phoneWords: "daily 9:00 AM",
  tone: "ok",
  needs: "messages",
  needsWords: "Reaches a yes to messages",
  covered: true,
  waits: false,
  hint: null,
  act: { kind: "open", label: "Open", playbookId: `pb-${id}` },
  channels: [],
  summary: "daily 9:00 AM",
  bar: null,
  ...over,
});
const railHome = (stages, groups = []) => ({
  rail: { title: "Your customer, start to finish", coveredWords: "3 of 4 moments covered", phoneWords: "3 of 4 on", stages },
  head: { channels: null },
  failed: { counts: null },
  // The ledger's groups, as far as the rail reads them: a paused moment's Resume is its lead row's own act.
  ledger: { groups },
});
const railActs = (chosen = null) => {
  const did = [];
  return {
    did,
    onAct: (act) => did.push(act.kind),
    door: (act) => (act.kind === "open" ? { href: `/w/studio/campaigns/moment:${act.playbookId}`, onClick: () => did.push(`open:${act.playbookId}`) } : null),
    gated: {},
    chosen,
    onChoose: (g) => did.push(["choose", g]),
  };
};
const card = (tree, id) => allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === id);

test("a card's body is one toggle that narrows the ledger to its moment, and lets go pressed again; its name and Turn on stand beside it", () => {
  fresh();
  const stages = [
    stageOf("before"),
    stageOf("after", { state: "off", playbookId: null, act: { kind: "turn_on", label: "Turn on · 3 tomorrow", moment: "visited" }, hint: "Turn on · 3 tomorrow" }),
  ];
  let acts = railActs();
  let tree = again(() => h(Rail, { home: railHome(stages), acts }));
  const toggle = byTestId(card(tree, "before"), "cmh-stage-press");
  assert.equal(toggle.props["aria-pressed"], false);
  assert.equal(find(toggle, (n) => n.props?.["data-testid"] === "cmh-open"), null, "the name is never inside the toggle");
  assert.equal(find(byTestId(card(tree, "after"), "cmh-stage-press"), (n) => n.props?.["data-testid"] === "cmh-turn-on"), null, "nor Turn on");
  press(toggle);
  assert.deepEqual(acts.did, [["choose", "before"]]);
  press(byTestId(card(tree, "before"), "cmh-open"));
  assert.deepEqual(acts.did.at(-1), "open:pb-before", "the name opens the drawer");
  assert.equal(byTestId(card(tree, "before"), "cmh-open").props.href, "/w/studio/campaigns/moment:pb-before");
  press(byTestId(card(tree, "after"), "cmh-turn-on"));
  assert.equal(acts.did.at(-1), "turn_on");
  // Chosen: the card wears the chosen state, and its toggle lets go.
  acts = railActs("before");
  tree = again(() => h(Rail, { home: railHome(stages), acts }));
  assert.equal(card(tree, "before").props["data-chosen"], "true");
  assert.equal(byTestId(card(tree, "before"), "cmh-stage-press").props["aria-pressed"], true);
  press(byTestId(card(tree, "before"), "cmh-stage-press"));
  assert.deepEqual(acts.did, [["choose", null]]);
});

test("a Meter stands only where a moment holds two or more; a paused moment offers Resume, asked", () => {
  fresh();
  const bar = { on: 2, waiting: 0, paused: 1, of: 3 };
  const ask = { question: "Resume Win-back?", detail: "Next run today 10:00 AM, about 25 people" };
  const stages = [
    stageOf("before", { summary: "before lead · daily 9:00 AM" }),
    stageOf("quiet", { summary: "3 campaigns · 2 on · 1 paused", bar }),
    // Lane 2's stage keeps its act the drawer's door (`open`); the Resume a paused card offers is its lead row's act.
    stageOf("after", { state: "paused", tone: "plain", stateWords: "Paused" }),
  ];
  const groups = [{ id: "after", rows: [{ id: "pb-after", act: { kind: "resume", label: "Resume", playbookId: "pb-after", ask } }] }];
  const tree = again(() => h(Rail, { home: railHome(stages, groups), acts: railActs() }));
  assert.equal(find(card(tree, "before"), (n) => n.type === Meter), null, "one campaign: no bar");
  assert.equal(
    find(byTestId(card(tree, "before"), "cmh-stage-press"), (n) => n.props?.className === "cmh-summary"),
    null,
    "one campaign's name and clock are its door's and its state's, not said twice",
  );
  const meter = find(card(tree, "quiet"), (n) => n.type === Meter);
  assert.equal(meter.props.size, "sm");
  assert.deepEqual(meter.props.parts.map((p) => p.share), [2, 0, 1], "on, waiting, paused");
  assert.equal(meter.props["aria-label"], "3 campaigns · 2 on · 1 paused");
  assert.match(textOf(byTestId(card(tree, "quiet"), "cmh-stage-press")), /3 campaigns · 2 on · 1 paused/, "the summary is the toggle's");
  assert.ok(byTestId(card(tree, "after"), "cmh-stage-resume"), "Resume, which asks first");
  assert.equal(
    byTestId(card(tree, "after"), "cmh-open").props.href,
    "/w/studio/campaigns/moment:pb-after",
    "and a paused moment's name still opens its drawer",
  );
});

test("the rail holds the ledger under its moments, and its edges fade only where it is wider than its pane", () => {
  fresh();
  const five = ["first_contact", "before", "after", "proposal", "quiet"].map((id) => stageOf(id));
  const tree = again(() => h(Rail, { home: railHome(five), acts: railActs() }, h("div", { "data-testid": "the-ledger" })));
  // Nothing measured (the stub has no ResizeObserver): nothing is said to overflow, so nothing fades.
  assert.equal(find(tree, (n) => n.props?.className === "cmh-rail").props["data-overflows"], undefined);
  assert.ok(byTestId(byTestId(tree, "cmh-rail"), "the-ledger"), "the ledger stands in the rail's pane");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`
Expected: FAIL (no `cmh-stage-press`; `Rail` takes no children).

- [ ] **Step 3: Rewrite the desk rail**

In `apps/dashboard/src/surfaces/campaigns/home/rail.tsx`:

1. Header comment: replace its first sentence's "and under it one quiet line for every other playbook or campaign" with "and under it the ledger, every campaign in one place (ledger/ledger.tsx), which a card's body narrows to its moment".
2. Imports: drop `LifecycleFailed`, `cmRowPress`, and whatever only lane 2's bridge read (`AlsoLine` and its imports); add `LifecycleBar` to the contracts type import, and:
```ts
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Meter } from "../../kit/meter/meter";
import type { RouteDoor } from "../../legacy-verbs";
import { ResumeAct } from "./ledger/ledger-acts";
```
3. Replace `RailActs`, `nodeGlyph`, `momentFoot`, `Stage`, `StripLine`, `StripLines`, lane 2's bridge (`alsoLines`, `alsoKind`, `alsoGlyph` and the `AlsoLine` type: lane 2's plan, Task 11, says this lane deletes it; lane 2 added `alsoGlyph` so the call's text and the month's offer kept their glyphs) and `Rail` (lines 25-192 at `7ff179717`, as lane 2 left them: replace whatever stands between the imports and `PhoneStage`) with:

```tsx
/** What a press on the rail does: the page decides (home-page.tsx), the rail only says which. */
export interface RailActs {
  onAct: (act: LifecycleAct) => void;
  /** The door a name is where its act opens a page: a moment's drawer, pushed so Back closes it. */
  door: (act: LifecycleAct) => RouteDoor | null;
  /** Whether the role may turn a moment on, resume one or open the composer; the buttons are gated where it may not. */
  gated: Record<string, unknown>;
  /** The group the ledger shows alone (`campaigns/in:<group>`), which a card wears chosen; null for every group. */
  chosen: string | null;
  /** A card's body pressed: narrow the ledger to its moment, or let go of it. */
  onChoose: (group: string | null) => void;
}

/** A state as a pill, in the tone the view model gave it. */
function StateWords({ tone, words, testid }: { tone: "ok" | "warn" | "plain"; words: string; testid?: string }) {
  return <StatePill kind="tone" value={tone} label={words} testid={testid} />;
}

/**
 * A moment's node on the line: a clock while a run of one of its campaigns waits for the owner (the pill beside it says
 * "Waiting on you"), the check once it is covered, else the moment's own glyph. The phone's spine draws it too.
 */
export const nodeGlyph = (s: LifecycleStage) => (s.waits ? "clock" : s.covered ? "check" : s.glyph);

/**
 * A moment's bar, where it holds two or more (lane 2's `LifecycleBar`): on in the ok tone, waiting in the warn, paused at
 * rest in the strong hairline; never animated (the kit's Meter has no transition). It says to a screen reader what the
 * card's summary says ("3 campaigns · 2 on · 1 paused").
 */
function StageBar({ bar, label }: { bar: LifecycleBar; label: string }) {
  const parts = [
    { share: bar.on, tone: "ok" as const },
    { share: bar.waiting, tone: "warn" as const },
    { share: bar.paused, color: "var(--line-strong)" },
  ];
  return <Meter size="sm" className="cmh-stage-bar" parts={parts} aria-label={label} />;
}

type ResumeOf = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A paused moment's Resume (spec §4.2): its lead's own row's act in the ledger, asked in the same words (when, to about
 * how many, the mode in full under `auto`). Lane 2's stage keeps its `act` the drawer's door, so the name still opens it.
 */
function leadResume(home: LifecycleHome, s: LifecycleStage): ResumeOf | null {
  if (s.state !== "paused" || !s.playbookId) return null;
  const act = home.ledger.groups.find((g) => g.id === s.id)?.rows.find((r) => r.id === s.playbookId)?.act;
  return act && act.kind === "resume" ? act : null;
}

/** What a moment says under its name: Turn on where it holds nothing, its state, and Resume (asked) where it is paused. */
function momentFoot(s: LifecycleStage, acts: RailActs, resume: ResumeOf | null) {
  const act = s.act;
  if (s.state === "off" && act && act.kind === "turn_on") {
    return (
      <Button
        size="sm"
        variant={s.hint ? "primary" : "secondary"}
        className="cmh-turn-on"
        onClick={() => acts.onAct(act)}
        data-testid="cmh-turn-on"
        {...acts.gated}
      >
        <Icon name="plus" size={12} /> {act.label}
      </Button>
    );
  }
  return (
    <>
      <StateWords tone={s.tone} words={s.stateWords} testid="cmh-state" />
      {resume ? <ResumeAct act={resume} onAct={acts.onAct} gated={acts.gated} testid="cmh-stage-resume" /> : null}
    </>
  );
}

/**
 * One moment on the desk's rail. Its caps, figure, unit and summary are one press (a quiet button, `aria-pressed`) that
 * narrows the ledger to the moment, and lets go pressed again (decision 12: the body filters, the name opens). The
 * lead's name, the door to its drawer, and Turn on stand beside it, never inside it: a button holds no button.
 */
function Stage({ s, acts, resume }: { s: LifecycleStage; acts: RailActs; resume: ResumeOf | null }) {
  const chosen = acts.chosen === s.id;
  // The name is a door where the moment's act opens something: its lead's drawer, or, for a moment of the appointment
  // with no calendar ("Needs your calendar", decision 44), the calendar's setting.
  const door = s.act && (s.act.kind === "open" || s.act.kind === "route") ? acts.door(s.act) : null;
  return (
    <li
      className="cmh-stage"
      data-stage={s.id}
      data-state={s.state}
      data-hint={s.hint ? "true" : undefined}
      data-waits={s.waits ? "true" : undefined}
      data-chosen={chosen ? "true" : undefined}
      data-testid="cmh-stage"
    >
      <Button
        variant="quiet"
        className="cmh-stage-press"
        aria-pressed={chosen}
        onClick={() => acts.onChoose(chosen ? null : s.id)}
        data-testid="cmh-stage-press"
      >
        <span className="cmh-caps">{s.caps}</span>
        <span className="cmh-figure tabular" data-testid="cmh-people">
          {s.people === null ? "—" : s.people}
        </span>
        <span className="cmh-unit">{s.unit}</span>
        {/* The summary where the moment holds two or more ("3 campaigns · 2 on · 1 paused"); one campaign's summary is
            its name and clock, which its name's door and its state say beside the toggle already. */}
        {s.bar && s.summary ? <span className="cmh-summary">{s.summary}</span> : null}
      </Button>
      <span className="cmh-track" aria-hidden="true">
        <span className="cmh-node">
          <Icon name={nodeGlyph(s)} size={14} />
        </span>
      </span>
      <div className="cmh-moment" data-state={s.state}>
        {door ? (
          <LinkButton {...door} className="cmh-moment-name" data-row-open data-testid="cmh-open">
            {s.name}
          </LinkButton>
        ) : (
          <span className="cmh-moment-name">{s.name}</span>
        )}
        {momentFoot(s, acts, resume)}
        {s.bar ? <StageBar bar={s.bar} label={s.summary ?? s.stateWords} /> : null}
        <ChannelMarks marks={s.channels} testid="cmh-chans" />
        <span className="cmh-needs" data-needs={s.needs}>
          <Icon name="shield" size={12} />
          {s.needsWords}
        </span>
      </div>
    </li>
  );
}

/**
 * Whether the line of moments is wider than its pane, as the browser lays it out: only then do its edges fade (J3), so
 * a rail that fits draws its first and last card whole. Measured as the pane resizes, and again when the number of
 * moments changes (the line is drawn once they are read); nothing where nothing measures.
 */
function useOverflows<T extends HTMLElement>(count: number): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const look = () => setOver(el.scrollWidth > el.clientWidth + 1);
    look();
    const watch = new ResizeObserver(look);
    watch.observe(el);
    return () => watch.disconnect();
  }, [count]);
  return [ref, over];
}

/**
 * The desk's rail, and the ledger under it in the same pane (`children`, home-page.tsx). Under 1100px of page it keeps
 * one line and scrolls across (J3, campaigns.css), its edges fading while it is wider than the pane.
 */
export function Rail({ home, acts, children }: { home: LifecycleHome; acts: RailActs; children?: ReactNode }) {
  const { rail } = home;
  const [line, overflows] = useOverflows<HTMLOListElement>(rail.stages.length);
  if (rail.stages.length === 0 && !children) return null;
  return (
    <Panel
      as="section"
      size="flush"
      className="cmh-block cmh-rail-block"
      aria-label={rail.title}
      data-testid="cmh-rail"
    >
      <header className="cmh-block-head">
        <h2 className="cmh-h">{rail.title}</h2>
        {rail.coveredWords ? <span className="cmh-dim">{rail.coveredWords}</span> : null}
        {/* Where the workspace stands on its channels, at the rail's right on a desk: the frame keeps the head's own line
            for a screen reader (a tab's list opens on its acts alone), so the page says it where the eye is. */}
        <ChannelsLine parts={home.head.channels} testid="cmh-channels-rail" />
      </header>
      {home.failed.counts ? <HomeFailed failed={home.failed.counts} testid="pb-counts-failed" /> : null}
      {rail.stages.length > 0 ? (
        <ol ref={line} className="cmh-rail" data-n={rail.stages.length} data-overflows={overflows ? "true" : undefined}>
          {rail.stages.map((s) => (
            <Stage key={s.id} s={s} acts={acts} resume={leadResume(home, s)} />
          ))}
        </ol>
      ) : null}
      {children}
    </Panel>
  );
}
```

4. `PhoneStage` and `PhoneRail` stay until Task 10 removes them; in `PhoneRail`, delete the "Also" panel (the `{strips.length > 0 ? (<Panel … data-testid="cmh-also"> … </Panel>) : null}` block and the `const strips = alsoLines(home);` lane 2 put above it), so the file compiles with the bridge gone. `PhoneStage`'s name stays a `LinkButton` with `onClick`, as it was; it leaves with Task 10.

- [ ] **Step 4: The page hands the rail its new acts**

In `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx`, replace the `acts` constant (lines 205-209) with:

```tsx
  const door = (act: LifecycleAct): RouteDoor | null => {
    if (act.kind === "open") return routeDoor(momentRoute(act.playbookId), nav.push);
    if (act.kind === "route") return routeDoor(act.route);
    return null;
  };
  const acts: RailActs & { onCopy: (phrase: string) => void } = {
    onAct,
    onCopy,
    door,
    gated: gate("approve", "turn on, resume or start a campaign"),
    chosen: group,
    onChoose: nav.narrow,
  };
```
and import `RouteDoor` as a type from `../../legacy-verbs` beside the values already imported there (`routeDoor` is already imported). ("playbook" leaves the gate's words: decision 19.)

- [ ] **Step 5: The rail's styles**

In `apps/dashboard/src/surfaces/campaigns/campaigns.css`:

1. **The toggle and the summary.** After `.cmh-unit { … }` (~line 4820), add:
```css
/* A card's caps, figure, unit and summary are one press (rail.tsx Stage): a quiet button the width of the column, its
   words standing as they stood, that narrows the ledger to its moment. Chosen, it wears the kit's selected ground. */
.cmh .cmh-stage-press {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: auto;
  padding: 0 0 var(--space-1);
  white-space: normal;
}
.cmh-stage[data-chosen="true"] > .cmh-stage-press,
.cmh-stage[data-chosen="true"] > .cmh-moment {
  background: var(--selected-fill);
}
.cmh-summary {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--ink-dim);
}
.cmh-stage-bar {
  align-self: stretch;
}
```
2. **Figures and pads.** The figure now stands inside the toggle, so the rule that spaced it under the caps names the
   toggle: change the selector `.cmh-stage > .cmh-figure` (~4817, `margin-top: var(--space-2)`) to
   `.cmh-stage-press > .cmh-figure`. Add after it:
```css
/* The rail's figures a step down (spec §4.2): the page's figure scale's next step, so the rail stands about 170px. */
.cmh-stage .cmh-figure {
  font-size: var(--text-hero);
}
```
and in `.cmh-track` set `height: 30px;` and `margin: var(--space-2) 0;` (were 34px and `var(--space-3) 0 10px`), and in `.cmh-moment` set `min-height: 0;` and `padding: var(--space-2) 10px;` and `gap: var(--space-1);` (were 104px, `var(--space-3) 10px`, 6px), and add `flex: 1 1 auto;`: the 104px floor kept the cards one height, and without it each card fills its column's height instead, so a card with Turn on stands as tall as one with its marks and its bar.
3. **The node rules name the phone's head** (Task 9): change the three selectors `:is(.cmh-stage, .cmh-vstage)` (~lines 4865, 4870, 4876) to `:is(.cmh-stage, .cmh-spine-head)`.
4. **J3: one line, scrolling.** Replace the whole `@container cmh (max-width: 1100px) { … }` block that stands the moments down a line (~lines 5083-5158, from `/* Under 1100px of page the five moments no longer fit` to the block's closing brace) with:
```css
/* Under 1100px of page the moments keep their one line and the rail scrolls across (J3), a moment snapping to its start.
   It stood down a line under 1100px, which put the ledger a screen below the moments. */
@container cmh (max-width: 1100px) {
  .cmh-rail {
    grid-auto-columns: minmax(168px, 1fr);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
  }
  .cmh-stage {
    scroll-snap-align: start;
  }
}
/* The edges fade only while more stands past them (rail.tsx useOverflows): a rail that fits draws its first and last
   card whole, at whatever width. */
.cmh-rail[data-overflows="true"] {
  mask-image: linear-gradient(
    90deg,
    transparent,
    var(--ink) var(--space-5),
    var(--ink) calc(100% - var(--space-5)),
    transparent
  );
}
```
(A mask reads only alpha; `_css.mjs` counts no colour in `mask-image`.)
5. **The strips go.** Delete these rules whole: `.cmh-strips .cmh-failed`, `.cmh-strips > .cmh-strip-failed` (~4782-4788), `.cmh-strip-words > .cmh-chans` (~4966), the block `/* Under the rail: one quiet line … */` with `.cmh-strips`, `.cmh-strip`, `.cmh-strip-words`, `.cmh .cmh-strip-name`, `.cmh-strip-more::before` (~5159-5190), `.cmh-strips` inside `@container cmh (max-width: 720px)` (keep that block's `.cmh-grid` rule), and `.cmh .cmh-strip-name` and `.cmh .cmh-strip-name::after` from the `@media (pointer: coarse)` list (~5611-5618, keeping the moment's and what-name's). The phone's strip rules (`.cmh[data-phone] .cmh-strip*`, `.cmh-also-block*`, `.cmh-strip > svg`) go in Task 9 with the phone's rail.

Check nothing still names them: `git grep -n "cmh-strip\b\|cmh-strips\|cmh-strip-" -- apps/dashboard/src` prints only `campaigns.css`'s phone rules (Task 9) and nothing in TSX.

- [ ] **Step 6: Run the tests and the measures**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: ledger-page PASS (14); typecheck clean. With lane 2's bridge gone, the tests that read its lines (`cmh-strip` in `campaigns-home`, `reach-out-rows`, `reports-honest`, `playbook-composer`) fail until Tasks 10 and 11 move them to the ledger's rows: expected, and nothing to fix here. `code-health-ratchets` may report falls (the strips' CSS held literal values or primitive selectors): bank them with
`UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, then
`UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs` (rewrites the measured blocks of `docs/debt.md` and `docs/takeover.md`), and run both again plain: PASS. A **rise** there means a rule above reads a literal: replace it with a token, never raise.

- [ ] **Step 7: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/rail.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home
git add apps/dashboard/src/surfaces/campaigns/home/rail.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -F - <<'EOF'
A moment's card narrows the ledger to it while its name opens the drawer; the rail keeps one line and scrolls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
(Leave out the baselines and the two pages from `git add` if nothing was banked.)

---

## Task 9: The phone's spine (`ledger-phone.tsx`)

On a phone (≤900px, `useCmPhone`) the journey's line is the list's spine (decision 16): the Moments head says one meta line ("3 of 4 on · 41 of 60 can hear you") and the channels' standing only where one is closed; past seven rows a sticky `SubTabs dense` strip of chips (All · Needs you · each moment · Lists · Reach-outs, a chip only above zero) and a search circle; then the groups, each moment's head its node on the line (glyph ring, caps, figure, state; an empty one carrying Turn on), its rows under it; Lists & offers, Reach-outs and one-offs off the line after them. One choice, sorted by Next, no page swipe. A row is the kit's `ListRow` wearing its kind as a `mark` (Task 5): its name, its state's pill in the phone's words (`phoneWords`, the clock alone while it is on), its one line (contracts `ledgerPhoneLine`, Task 1: "Appointment tomorrow · tomorrow 9:00 AM · 7 people"), and its channels and what came back. Under a row stands what it decides at the row's whole width: Approve and Skip, Resume's question (its press stands at the row's end, drawn at the small control's height), or a chain's "Open the run".

This task builds the component and its styles and proves it drawn alone; Task 10 puts it on the page and removes the old phone rail.

**Files:**
- Create: `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx`
- Modify: `apps/dashboard/src/surfaces/campaigns/campaigns.css` (the phone block, ~line 5401 `/* The phone: the moments down a line … */`)
- Test: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`:

```js
/* ------------------------------------------------------- the phone ------------------------------------------------------- */

const { LedgerPhone } = await import(`${SRC}/surfaces/campaigns/home/ledger/ledger-phone.tsx`);
const { ListRow } = await import(`${SRC}/surfaces/kit/list-row/list-row.tsx`);

/** The home as the phone reads it: the rail's stages for the heads, who can hear you, the channels, the ledger. */
const phoneHome = (ledger, over = {}) => ({
  rail: {
    title: "Your customer, start to finish",
    coveredWords: null,
    phoneWords: "3 of 4 on",
    stages: [stageOf("first_contact"), stageOf("before"), stageOf("after", { state: "off", people: 2, act: { kind: "turn_on", label: "Turn on", moment: "visited" } }), stageOf("quiet")],
  },
  reach: {
    read: "read",
    rungs: null,
    yes: null,
    phone: { words: "41 of 60 can hear you", offers: { words: "12 to offers", tone: "ok" }, yes: null },
  },
  head: { channels: [{ channel: null, channels: ["whatsapp"], open: true, words: "Sending on WhatsApp", door: null }] },
  failed: { counts: null, reach: null, templates: null, chains: null, report: null },
  ledger,
  ...over,
});
const drawPhone = (home, { group = null } = {}) => {
  const acts = ledgerActs();
  const draw = () =>
    again(() => {
      const view = useLedgerView(home.ledger, { group, onGroup: (g) => went.push(["group", g]), phone: true });
      return h(LedgerPhone, { home, view, acts, mark: null, searchRef: { current: null } });
    });
  return { draw, acts };
};

test("on a phone the Moments head says one meta line, and the channels only where one is closed", () => {
  fresh();
  let tree = drawPhone(phoneHome(NINE())).draw();
  const meta = byTestId(tree, "cmh-reach");
  assert.match(textOf(meta), /3 of 4 on/);
  assert.match(textOf(meta), /41 of 60 can hear you/);
  assert.equal(byTestId(meta, "cmh-channels"), null, "every channel open: nothing said of them");
  fresh();
  const closed = [
    { channel: null, channels: ["whatsapp"], open: true, words: "Sending on WhatsApp", door: null },
    { channel: "sms", channels: ["sms"], open: false, words: "Text: No texting line yet", door: "admin/integrations" },
  ];
  tree = drawPhone(phoneHome(NINE(), { head: { channels: closed } })).draw();
  assert.ok(byTestId(byTestId(tree, "cmh-reach"), "cmh-channels"), "one closed: the line, with its door");
});

test("past seven rows a strip of chips, one choice: a moment's chip narrows to it, Needs you lets go of it, All of both", () => {
  fresh();
  const { draw } = drawPhone(phoneHome(NINE()));
  const tree = draw();
  const strip = byTestId(tree, "cmh-phone-strip");
  assert.deepEqual(
    all(strip, (n) => /^cmh-chip-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props["data-testid"]),
    ["cmh-chip-all", "cmh-chip-needs", "cmh-chip-first_contact", "cmh-chip-before", "cmh-chip-quiet", "cmh-chip-lists", "cmh-chip-reach_out"],
    "a chip only above zero: After holds nothing, so it has none",
  );
  assert.ok(byTestId(strip, "cmh-phone-find"), "and the search circle");
  const root = find(strip, (n) => typeof n.props?.onValueChange === "function");
  root.props.onValueChange("in:quiet");
  assert.deepEqual(went, [["group", "quiet"]]);
});

test("each moment's head is its node on the line, an empty one with its Turn on; its rows under it wear their kind as a mark", () => {
  fresh();
  const tree = drawPhone(phoneHome(NINE())).draw();
  const heads = allBy(tree, "cmh-group-head");
  const head = (id) => heads.find((x) => x.props["data-group"] === id);
  assert.equal(head("before").props["data-stage"], "before", "a moment's head is its stage");
  assert.ok(find(head("before"), (n) => n.props?.className === "cmh-node"), "with its node on the line");
  assert.match(textOf(head("before")), /BEFORE/);
  assert.ok(byTestId(head("after"), "cmh-turn-on"), "an empty moment carries its Turn on");
  assert.equal(head("lists").props["data-stage"], undefined, "Lists stand off the line");
  const rows = allBy(tree, "cmh-row");
  const a = rows.find((r) => r.props["data-row"] === "pb-a");
  const line = find(a, (n) => n.type === ListRow);
  assert.ok(line.props.mark, "a mark, never a face");
  assert.equal(line.props.face, undefined);
  assert.equal(byTestId(a, "cmh-row-open").props.href, "/w/studio/campaigns/moment:pb-a", "the drawer's door");
  // Its state once, on its pill in the phone's words; its one line is contracts' (ledgerPhoneLine).
  assert.equal(line.props.said, contracts.ledgerPhoneLine(NINE().groups[1].rows[0], "BEFORE"));
  const pill = find(line, (n) => n.props?.className === "list-row-end" && "label" in n.props);
  assert.equal(pill.props.label, NINE().groups[1].rows[0].phoneWords, "the pill says the phone's words, once");
  const b = rows.find((r) => r.props["data-row"] === "pb-b");
  assert.ok(byTestId(b, "cmh-approve") && byTestId(b, "cmh-skip"), "Approve and Skip under a waiting row");
});

test("a paused row's Resume stands at its end, and its question under the row, at the row's whole width", () => {
  fresh();
  const { draw } = drawPhone(phoneHome(NINE()));
  const paused = (t) => allBy(t, "cmh-row").find((r) => r.props["data-row"] === "pb-c");
  const listRowOf = (t) => find(paused(t), (n) => n.type === ListRow);
  let tree = draw();
  assert.ok(byTestId(listRowOf(tree), "cmh-resume"), "Resume at the row's end, drawn by the row");
  press(byTestId(paused(tree), "cmh-resume"));
  tree = draw();
  assert.ok(byTestId(paused(tree), "cmh-resume-confirm"), "the question is asked");
  assert.equal(byTestId(listRowOf(tree), "cmh-resume-confirm"), null, "under the row, never inside it");
});

test("under seven rows the phone has no strip, and sorts by Next in its groups", () => {
  fresh();
  const few = ledgerOf([groupOf("before", [rowOf("pb-a")])], { tools: false });
  const tree = drawPhone(phoneHome(few)).draw();
  assert.equal(byTestId(tree, "cmh-phone-strip"), null);
  assert.equal(allBy(tree, "cmh-row").length, 1);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`
Expected: FAIL (`Cannot find module …/ledger-phone.tsx`).

- [ ] **Step 3: Write the phone's spine**

Create `apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx`:

```tsx
/**
 * Campaigns on a phone (≤900px; spec 2026-10-09 §4.4; decision 16): one list on the journey's line. The Moments head says
 * one meta line (how many moments are on, who can hear you) and the channels' standing only where one is closed; past
 * seven rows a sticky strip of chips (All, Needs you, each moment, Lists, Reach-outs, each above zero) and a search circle;
 * then the groups, each moment's head its node on the line (glyph ring, caps, figure, state; an empty one's Turn on), its
 * rows under it, and Lists & offers, Reach-outs and one-offs off the line after them. A row is the kit's ListRow wearing
 * its kind as a mark (never a face: a face is someone), its name the door to its drawer, its state a pill in the phone's
 * words, its moment, next run and people in one line (contracts ledgerPhoneLine), its channels and what came back. What
 * a row decides stands under it at its whole width: Approve and Skip, Resume's question (its press at the row's end), a
 * chain's door to its run. One choice at a time (a moment, or a status), the order Next, and no page swipe: the strip
 * scrolls across under a thumb and walks no view. Every word is the view model's.
 */
import { useState } from "react";
import type { RefObject } from "react";
import { LIFECYCLE_WORDS, ledgerPhoneLine } from "@chanlytics/contracts";
import type { LifecycleGroup, LifecycleHome, LifecycleLedger, LifecycleRow, LifecycleStage } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { EmptyState } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { useSwapMotion } from "../../../kit/motion/use-swap-motion";
import { Panel } from "../../../kit/panel/panel";
import { StatePill } from "../../../kit/pill/state-pill";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import type { SubTab } from "../../../kit/sub-tabs/sub-tabs";
import { focusAsDrawn, routeDoor } from "../../../legacy-verbs";
import { ChannelMarks, ChannelsLine } from "../../parts/channels-line";
import { CmDot, cmRowPress } from "../../parts/head";
import { HomeFailed } from "../failed";
import { nodeGlyph } from "../rail";
import { TileRead } from "../tiles";
import { AddAct, ResumePress, ResumeQuestion, WaitingActs, useResumeAsk } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";
import type { RowMark } from "./ledger-keys";
import { RowName, resultsWords } from "./ledger-row";
import { SentOnce } from "./ledger-tools";
import type { LedgerView } from "./use-ledger-view";

/** What the phone reads of the home. */
type PhoneHome = Pick<LifecycleHome, "rail" | "reach" | "head" | "failed" | "ledger">;

/** One meta line under Moments: how many are on and who can hear you; the channels' standing only where one is closed. */
function PhoneMeta({ home }: { home: PhoneHome }) {
  const phone = home.reach.phone;
  const on = home.rail.phoneWords;
  const closed = (home.head.channels ?? []).some((c) => !c.open);
  return (
    <div className="cmh-meta" role="group" aria-label={LIFECYCLE_WORDS.reach.title} data-testid="cmh-reach">
      <TileRead read={home.reach.read} failed={home.failed.reach} testid="cmh-reach" />
      <p className="cmh-meta-line">
        {on ? <span>{on}</span> : null}
        {on && phone ? <CmDot /> : null}
        {phone ? <span>{phone.words}</span> : null}
        {phone ? <StatePill kind="tone" value={phone.offers.tone} label={phone.offers.words} /> : null}
      </p>
      {phone?.yes ? (
        <LinkButton className="cmh-meta-yes" {...routeDoor(phone.yes.route)} data-testid="cmh-phone-yes">
          {phone.yes.label}
        </LinkButton>
      ) : null}
      {closed ? <ChannelsLine parts={home.head.channels} testid="cmh-channels" /> : null}
    </div>
  );
}

/** The chips: All, Needs you where something waits, each group with rows but the one-offs, a chip only above zero. */
function chipsOf(ledger: LifecycleLedger): SubTab[] {
  const W = ledger.words;
  return [
    { id: "all", label: W.tabs.all, testid: "cmh-chip-all" },
    ...(ledger.counts.needs > 0
      ? [
          {
            id: "needs",
            label: W.tabs.needs,
            count: ledger.counts.needs,
            tone: "warn" as const,
            hint: W.needsOf(ledger.counts.needs),
            testid: "cmh-chip-needs",
          },
        ]
      : []),
    ...ledger.groups
      .filter((g) => g.id !== "sent_once" && g.rows.length > 0)
      .map((g): SubTab => ({ id: `in:${g.id}`, label: g.caps, count: g.rows.length, testid: `cmh-chip-${g.id}` })),
  ];
}

/** Past seven rows: the strip of chips, one choice (a group writes the address and lets go of the status), and the circle. */
function PhoneStrip({ ledger, view, searchRef }: { ledger: LifecycleLedger; view: LedgerView; searchRef: RefObject<HTMLInputElement | null> }) {
  const [finding, setFinding] = useState(view.query !== "");
  const W = ledger.words;
  const value = view.group !== null ? `in:${view.group}` : view.status === "needs" ? "needs" : "all";
  const pick = (id: string) => {
    if (id.startsWith("in:")) view.setGroup(id.slice("in:".length));
    else if (id === "needs") view.setStatus("needs");
    else view.clearAll();
  };
  return (
    <div className="cmh-phone-strip" data-testid="cmh-phone-strip">
      <SubTabs label={W.strip} value={value} tabs={chipsOf(ledger)} onSelect={pick} quietCounts dense />
      {finding ? (
        <Field
          type="search"
          aria-label={W.search(ledger.counts.all)}
          placeholder={W.search(ledger.counts.all)}
          value={view.query}
          onValueChange={view.setQuery}
          ref={searchRef}
          // A search its button revealed: ready to type under a mouse and keys, waiting for a tap on a touch screen
          // (legacy-verbs focusAsDrawn: false on a coarse pointer; Ruben, 8 and 9 Oct 2026).
          autoFocus={focusAsDrawn()}
          className="cmh-phone-find"
          data-testid="cmh-ledger-search"
        />
      ) : (
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={W.find}
          onClick={() => setFinding(true)}
          data-testid="cmh-phone-find"
        >
          <Icon name="search" size={14} />
        </Button>
      )}
    </div>
  );
}

/** A group's head: a moment's node on the line (its glyph or clock or check, caps, figure, state, or Turn on), or a group off the line. */
function PhoneHead({ g, stage, acts }: { g: LifecycleGroup; stage: LifecycleStage | null; acts: LedgerActs }) {
  const turnOn = g.add && g.rows.length === 0 ? g.add : null;
  return (
    <div
      className="cmh-spine-head"
      data-group={g.id}
      data-stage={stage ? stage.id : undefined}
      data-state={stage ? stage.state : undefined}
      data-hint={stage?.hint ? "true" : undefined}
      data-waits={stage?.waits ? "true" : undefined}
      data-testid="cmh-group-head"
    >
      <span className="cmh-node" aria-hidden="true">
        <Icon name={stage ? nodeGlyph(stage) : g.glyph} size={13} />
      </span>
      <span className="cmh-group-caps">{g.caps}</span>
      {stage ? (
        <span className="cmh-figure tabular" data-testid="cmh-people">
          {stage.people === null ? "—" : stage.people}
        </span>
      ) : (
        <span className="cmh-dim">{g.meta}</span>
      )}
      {turnOn ? (
        <AddAct act={turnOn} acts={acts} testid="cmh-turn-on" />
      ) : stage ? (
        <StatePill kind="tone" value={stage.tone} label={stage.phoneWords} />
      ) : (
        <span />
      )}
    </div>
  );
}

interface PhoneRowProps {
  r: LifecycleRow;
  g: LifecycleGroup;
  W: LifecycleLedger["words"];
  acts: LedgerActs;
  mark: "settled" | "arrived" | null;
}

/**
 * One row: the kit's ListRow wearing its group's glyph as a mark, the whole row its press, its state once (its pill, in
 * the phone's words), its one line (contracts ledgerPhoneLine), and what it decides under it at its whole width.
 */
function PhoneRow({ r, g, W, acts, mark }: PhoneRowProps) {
  const resume = r.act && r.act.kind === "resume" ? r.act : null;
  const door = r.act && r.act.kind === "route" ? r.act : null;
  const ask = useResumeAsk();
  return (
    <div
      className="cmh-phone-row"
      data-row={r.id}
      data-kind={r.kind}
      data-state={r.status}
      data-settled={mark === "settled" ? "true" : undefined}
      data-arrived={mark === "arrived" ? "true" : undefined}
      data-testid="cmh-row"
    >
      <ListRow
        mark={<Icon name={g.glyph} size={13} />}
        name={<RowName r={r} acts={acts} />}
        end={(place) =>
          resume ? (
            <ResumePress act={resume} ask={ask} gated={acts.gated} className={`${place} cmh-row-resume`} />
          ) : (
            <StatePill kind="tone" value={r.tone} label={r.phoneWords} className={place} />
          )
        }
        said={ledgerPhoneLine(r, g.caps)}
        facts={[<ChannelMarks key="by" marks={r.channels} />, resultsWords(r, W).words]}
        className="cmh-phone-line"
        role="presentation"
        onClick={cmRowPress}
      />
      {r.waiting ? (
        <WaitingActs r={r} w={r.waiting} approve={W.approve(r.waiting.people)} approval={acts.approval} />
      ) : null}
      {resume ? <ResumeQuestion act={resume} ask={ask} onAct={acts.onAct} className="cmh-row-ask" /> : null}
      {door ? (
        <div className="cmh-row-door">
          <AddAct act={door} acts={acts} testid="cmh-row-run" />
        </div>
      ) : null}
    </div>
  );
}

/** A moment the line runs solid through: always on (the receptionist) or on. */
const isOn = (s: LifecycleStage | null): boolean => !!s && (s.state === "always" || s.state === "on");

interface LedgerPhoneProps {
  home: PhoneHome;
  view: LedgerView;
  acts: LedgerActs;
  mark: RowMark;
  searchRef: RefObject<HTMLInputElement | null>;
}

/** The phone's list: the Moments head and its meta line, the strip past seven rows, the groups on the journey's line. */
export function LedgerPhone({ home, view, acts, mark, searchRef }: LedgerPhoneProps) {
  const ledger = home.ledger;
  const W = ledger.words;
  const list = useSwapMotion<HTMLDivElement>(`${view.status}|${view.group ?? ""}`, ".cmh-group");
  const stageOf = (id: string) => home.rail.stages.find((s) => s.id === id) ?? null;
  const markOf = (id: string) => (mark && mark.id === id ? mark.kind : null);
  return (
    <Panel as="section" size="flush" className="cmh-block cmh-spine-block" aria-label={home.rail.title} data-testid="cmh-rail">
      <header className="cmh-block-head">
        <h2 className="cmh-h">{LIFECYCLE_WORDS.phone.moments}</h2>
      </header>
      <PhoneMeta home={home} />
      {home.failed.counts ? <HomeFailed failed={home.failed.counts} testid="pb-counts-failed" /> : null}
      {ledger.tools ? <PhoneStrip ledger={ledger} view={view} searchRef={searchRef} /> : null}
      <div ref={list} className="cmh-spine" aria-label={W.label} data-testid="cmh-ledger">
        {view.rows.length === 0 && view.filtered ? (
          <EmptyState kind="line" title={W.empty} action={{ label: W.clear, onClick: view.clearAll }} testid="cmh-ledger-none" />
        ) : null}
        {view.visibleGroups.map((g) => (
          <section
            key={g.id}
            className="cmh-group"
            data-group={g.id}
            data-line={stageOf(g.id) ? "true" : undefined}
            // The line runs solid through a moment that is on: said here, so no :has() restyles the page (campaigns.css).
            data-on={isOn(stageOf(g.id)) ? "true" : undefined}
            aria-label={g.caps}
            data-testid="cmh-group"
          >
            <PhoneHead g={g} stage={stageOf(g.id)} acts={acts} />
            {g.rows.map((r) => (
              <PhoneRow key={markOf(r.id) === "arrived" ? `${r.id}:arrived` : r.id} r={r} g={g} W={W} acts={acts} mark={markOf(r.id)} />
            ))}
            {g.id === "first_contact" && home.failed.templates ? (
              <HomeFailed failed={home.failed.templates} testid="cmh-templates-failed" />
            ) : null}
            {g.id === "reach_out" && home.failed.chains ? (
              <HomeFailed failed={home.failed.chains} testid="pb-chains-failed" />
            ) : null}
          </section>
        ))}
        {!view.filtered && home.failed.chains && !view.visibleGroups.some((g) => g.id === "reach_out") ? (
          <HomeFailed failed={home.failed.chains} testid="pb-chains-failed" />
        ) : null}
        <SentOnce ledger={ledger} acts={acts} />
      </div>
    </Panel>
  );
}
```

(`ListRow`'s element props pass through to its `<div>`: `role` and `onClick` are the page's, as the kit's header says. `StatePill` takes a `className`, which places it at the row's end. `SentOnce` is `ledger-tools.tsx`'s. The phone's search box takes no focus by itself on a touch screen: `focusAsDrawn()` (`legacy-verbs.ts`) answers false on a coarse pointer and true under a mouse, Ruben's rule of 8 and 9 October 2026 for a search its button reveals. `isOn` is a new top-level name: check it is declared in at most one other file, `git grep -nE "(function|const) isOn\b" -- apps packages`.)

- [ ] **Step 4: The phone's styles**

In `apps/dashboard/src/surfaces/campaigns/campaigns.css`, at the start of the phone block (`/* The phone: the moments down a line, … */`, ~line 5401), after the `.cmh[data-phone] { … }` rule, add (check each class absent first):

```css
/* The phone's list on the journey's line (home/ledger/ledger-phone.tsx; spec 2026-10-09 §4.4): the Moments head's one
   meta line, the strip of chips past seven rows (sticky, scrolling across under a thumb), then the groups, each moment's
   head its node on a line down the left that runs through its rows, the groups off the line after them. The pane is
   clipped, not hidden (the kit's flush panel hides), so the page's scroll is the one the strip sticks to. */
.cmh .cmh-spine-block {
  overflow: clip;
}
.cmh-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-1) 22px var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}
.cmh-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin: 0;
}
.cmh-meta > .cmh-channels {
  margin-top: 0;
}
.cmh-meta > .route-reading.cmh-reading {
  padding: 0;
}
.cmh-meta > .cmh-failed {
  margin: 0;
}
.cmh-meta-yes {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  min-height: 44px;
  margin-block: calc(var(--space-3) * -1);
}
.cmh-phone-strip {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--line);
  background: var(--surface-pane-solid);
}
.cmh-phone-strip > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.cmh-phone-find {
  flex: 0 1 160px;
}
.cmh-spine {
  padding: var(--space-1) 0 var(--space-2);
}
.cmh-spine-head {
  position: relative;
  display: grid;
  grid-template-columns: 28px auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
}
.cmh-spine-head > .cmh-node {
  width: 28px;
  height: 28px;
}
.cmh-spine-head > .cmh-figure {
  font-size: var(--text-lg);
}
/* The line down the left, through a moment's head and its rows, solid where the moment is on, dashed where it is not; a
   group off the line draws none. */
.cmh-group[data-line="true"] {
  position: relative;
}
.cmh-group[data-line="true"]::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--space-3) + 13px);
  border-left: 2px dashed var(--line-strong);
}
.cmh-group[data-on="true"]::before {
  border-left-style: solid;
  border-left-color: var(--ink);
}
.cmh-phone-row {
  position: relative;
  padding-left: calc(var(--space-3) + 28px);
}
.cmh-phone-row + .cmh-phone-row {
  border-top: 1px solid var(--line);
}
.cmh-phone-line {
  cursor: pointer;
}
.cmh-phone-row > .cmh-row-decide,
.cmh-phone-row > .cmh-row-why,
.cmh-phone-row > .cmh-row-door {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-3) var(--space-2);
}
/* Resume's question under the row, at its whole width, as a waiting run's acts stand. */
.cmh-phone-row > .cmh-row-ask {
  margin: 0 var(--space-3) var(--space-2);
}
/* Resume's press at the row's end is a small control: drawn at its height on a touch screen too (legacy.css gives every
   button 44px there), its thumb's 44px an invisible margin (memory reference_touch_floor_outranks_height). */
.cmh-row-resume {
  height: var(--control-h-sm);
  min-height: var(--control-h-sm);
}
@media (pointer: coarse) {
  .cmh-row-resume {
    position: relative;
  }
  .cmh-row-resume::after {
    content: "";
    position: absolute;
    inset: -8px 0;
  }
}
.cmh-phone-row[data-settled="true"] .cmh-phone-line {
  animation: rise-in var(--duration-base) var(--ease-out) backwards;
}
.cmh-phone-row[data-arrived="true"] > .cmh-phone-line {
  transition: background-color calc(2 * var(--duration-base)) var(--ease-out);
}
@starting-style {
  .cmh-phone-row[data-arrived="true"] > .cmh-phone-line {
    background-color: var(--ok-soft);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cmh-phone-row[data-settled="true"] .cmh-phone-line {
    animation: none;
  }
  .cmh-phone-row[data-arrived="true"] > .cmh-phone-line {
    transition: none;
  }
}
@media (pointer: coarse) {
  .cmh-phone-row .cmh-row-name {
    position: relative;
  }
  .cmh-phone-row .cmh-row-name::after {
    content: "";
    position: absolute;
    inset: -12px 0;
  }
}
```

(The solid line reads the section's own `data-on`, written by `LedgerPhone`, not a `:has()` over its head: a `:has()` asks the browser to look again at what it styles whenever a press might change it (memory `reference_has_full_restyle`). Check `cmh-row-resume`, `cmh-row-ask` and `cmh-row-door` absent first, as every new class.)

- [ ] **Step 5: Run the tests and the measures**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS (19), PASS, clean.

- [ ] **Step 6: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/home/ledger
git add apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
git commit -F - <<'EOF'
On a phone Campaigns is one list on the journey's line: each moment's head its node, its campaigns under it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 10: The page (`home-page.tsx`): the view held once, the keys, the marks, the phone; the old phone rail gone; the home's tests on rows

**Files:**
- Modify: `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx` (whole file below)
- Modify: `apps/dashboard/src/surfaces/campaigns/home/rail.tsx` (delete `PhoneStage`, `PhoneRail`)
- Modify: `apps/dashboard/src/surfaces/campaigns/home/tiles.tsx` (delete `PhoneReachLine`)
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/composer-acts.ts:26`, `playbooks/composer.tsx:48`, `home/new-message.tsx:48` (the saved campaign's id reaches the page)
- Modify: `apps/dashboard/src/surfaces/campaigns/campaigns.css` (the phone rail's and the strips' last rules)
- Test: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (append), `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs` (move to rows)

- [ ] **Step 1: Write the failing page tests**

Append to `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`. First copy, verbatim, the `surfaces(over)` helper from `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs` **as lane 2 left it** (it sets the surfaces `useHomeData` reads: `playbooks`, `broadcasts`, `reach_outs`, `settings`, and lane 2's `campaign_results` if it added it), then:

```js
/* ------------------------------------------------------ the page ------------------------------------------------------ */

const { CampaignsHome } = await import(`${SRC}/surfaces/campaigns/home/home-page.tsx`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const page = (param = null) => again(() => CampaignsHome({ param, nowMs: NOW }));
const sheetOf = (tree) => find(tree, (n) => n.type === PaneSheet);
const rowIds = (tree) => allBy(tree, "cmh-row").map((r) => r.props["data-row"]);
/** A document that finds every row's opener, focuses and presses it, and opens nothing over the page. */
const documentOf = (log) => (sel) =>
  sel.includes("[role=")
    ? null
    : { focus: () => log.push(["focus", sel]), click: () => log.push(["click", sel]), scrollIntoView: () => log.push(["scroll", sel]) };
const keydown = (k) =>
  globalThis.dispatchEvent({
    type: "keydown",
    key: k,
    target: { nodeType: 1, tagName: "DIV", closest: () => null, getAttribute: () => null },
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    preventDefault() {},
  });

test("the page draws every campaign as a row of the ledger, in the rail's pane under the moments", () => {
  surfaces();
  fresh();
  const tree = page();
  const rail = byTestId(tree, "cmh-rail");
  assert.ok(byTestId(rail, "cmh-ledger"), "the ledger stands in the moments' pane");
  for (const id of ["pb-sample-winback", "pb-sample-welcome", "pb-sample-reminder"])
    assert.ok(rowIds(tree).includes(id), `${id} is a row`);
  assert.ok(allBy(tree, "cmh-stage").length >= 4, "and the moments above it");
});

test("a card's press replaces the address with its group; a drawer over the narrowed ledger keeps it; closing goes back to it", () => {
  surfaces();
  fresh();
  let tree = page();
  const quiet = allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet");
  press(byTestId(quiet, "cmh-stage-press"));
  assert.deepEqual(replaced, ["campaigns/in:quiet"], "replaced, never pushed");
  tree = page("in:quiet");
  assert.deepEqual(rowIds(tree), ["pb-sample-winback"], "the ledger shows the moment's campaigns alone");
  assert.equal(allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet").props["data-chosen"], "true");
  press(byTestId(allBy(tree, "cmh-row")[0], "cmh-row-open"));
  assert.deepEqual(went, ["campaigns/moment:pb-sample-winback"], "the drawer is pushed");
  tree = page("moment:pb-sample-winback");
  assert.deepEqual(rowIds(tree), ["pb-sample-winback"], "the ledger behind the drawer keeps its group");
  sheetOf(tree).props.onClose();
  assert.deepEqual(said, [["back"]], "closing goes back to campaigns/in:quiet");
});

test("a sheet a link arrived at closes to the home; one another door pushed over the home closes back to it", () => {
  surfaces();
  fresh();
  sheetOf(page("moment:pb-sample-winback")).props.onClose();
  assert.deepEqual(replaced, ["campaigns"], "nothing of the page's behind it: replaced");
  fresh();
  page();
  // A bell row, or Ask's card, moves the address over the home the page stands on.
  sheetOf(page("moment:pb-sample-winback")).props.onClose();
  assert.deepEqual(said, [["back"]], "the home is behind it: back");
  assert.deepEqual(replaced, []);
});

test("the keys: J walks to a row and gives its name the focus, Enter presses it, and behind a sheet the keys are the sheet's", () => {
  surfaces();
  fresh();
  const log = [];
  globalThis.document.querySelector = documentOf(log);
  page();
  keydown("j");
  page();
  const focused = log.find(([what]) => what === "focus");
  assert.ok(focused && focused[1].endsWith("[data-row-open]"), "the first row's name has the focus");
  keydown("Enter");
  assert.deepEqual(log.at(-1), ["click", focused[1]], "Enter opens the row under the cursor");
  log.length = 0;
  fresh();
  page("moment:pb-sample-winback");
  keydown("j");
  assert.deepEqual(log.filter(([what]) => what !== "scroll"), [], "behind the drawer nothing moves");
});

test("a campaign the composer just saved arrives: the sheet closes, the toast says it, its row is scrolled to and washed", () => {
  surfaces();
  fresh();
  const log = [];
  globalThis.document.querySelector = documentOf(log);
  const tree = page("new:edit:pb-sample-winback");
  find(tree, (n) => n.type === PlaybookComposer).props.onDone({ id: "pb-sample-winback", name: "Win-back" }, true);
  assert.deepEqual(replaced, ["campaigns"], "the sheet a link arrived at closes to the home");
  assert.match(textOf(toasts.at(-1).msg), /Win-back changed/);
  const row = allBy(page(), "cmh-row").find((r) => r.props["data-row"] === "pb-sample-winback");
  assert.equal(row.props["data-arrived"], "true");
  assert.deepEqual(log.find(([what]) => what === "scroll"), ["scroll", '[data-row="pb-sample-winback"]']);
});

test("on a phone the moments' pane holds the one list on the journey's line, and no rail of its own", () => {
  surfaces();
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const tree = page();
  assert.ok(byTestId(byTestId(tree, "cmh-rail"), "cmh-ledger"));
  assert.ok(allBy(tree, "cmh-group-head").some((g) => g.props["data-stage"] === "quiet"), "a moment's head is its node");
  assert.equal(allBy(tree, "cmh-stage").length, 0, "no desk rail on a phone");
  assert.equal(byTestId(tree, "cmh-also"), null);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`
Expected: the six new tests FAIL (the page draws no `cmh-ledger`).

- [ ] **Step 3: The saved campaign's id reaches the page**

The routes already answer it (`startNewPlaybook` returns `{ id, name, state, decision_id }`: `apps/dashboard/src/server/campaigns/playbook-row.ts:75`); only the types drop it:
- `apps/dashboard/src/surfaces/campaigns/playbooks/composer-acts.ts:26`: `onDone: (d: { id?: string; name?: string }, changed: boolean) => void;`
- `apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx:48` (`ComposerProps.onDone`): the same type.
- `apps/dashboard/src/surfaces/campaigns/home/new-message.tsx` (`NewMessageProps.onSaved`, line 48): `onSaved: (d: { id?: string; name?: string }, changed: boolean) => void;`

- [ ] **Step 4: Write the page**

Replace `apps/dashboard/src/surfaces/campaigns/home/home-page.tsx` whole (keep lane 2's changes to `useHomeData`'s call and to the tiles' props if it made any: diff against `git show HEAD:apps/dashboard/src/surfaces/campaigns/home/home-page.tsx` before writing, and carry over anything of lane 2's this listing lacks):

```tsx
/**
 * Campaigns, the home (canvas A, "Lifecycle", approved 2 Oct 2026; its ledger, option A of 9 Oct): what goes out on its own
 * as a customer reaches a moment, and what you send yourself. A head with the Library and New message; the rail of moments
 * around a customer, and under it in the same pane the ledger, every campaign in one place, grouped by moment, narrowed by a
 * card, a tab, a search or a key, and decided where it stands; then three tiles, who can hear you, what is coming and what
 * came back. On a phone the moments are the one list's spine. A campaign's name opens it in a sheet from the side; New
 * message opens the composer in one. The old Playbooks list is this page, and the Broadcasts and Templates pages are its
 * rooms (Sent and the Library).
 *
 * Every word and number is the view model's (contracts campaignsHomeOf); the page composes it and presses. The ledger's
 * view is held here, once (ledger/use-ledger-view.ts), where Ask's door reads the rows on screen. The toast host is the
 * page's, so a toast outlives the sheet that raised it (a send closes the composer in the same breath, and the toast that
 * offers to stop it must not go with it).
 */
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { LIFECYCLE_TOAST } from "@chanlytics/contracts";
import type { LifecycleAct, LifecycleHome, LifecycleRow } from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { canDo, gate, routeDoor, navigate, useLegacyToast } from "../../legacy-verbs";
import type { RouteDoor } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { bcWhenWords } from "../broadcasts/when-words";
import { playbooks as verbs } from "../playbooks/verbs";
import { CmDot, CmHead } from "../parts/head";
import { useCmPhone } from "../parts/split";
import type { PlaybookCardVM } from "../playbooks/surface";
import { ReachOutSheet } from "../reach-out/sheet";
import { composeRoute, momentRoute, parseHome } from "./address";
import type { HomeAddress } from "./address";
import { MomentDrawer } from "./drawer";
import { Ledger } from "./ledger/ledger";
import type { LedgerActs, LedgerApproval } from "./ledger/ledger-acts";
import {
  pressRowOpener,
  useArrivalLands,
  useFocusComesHome,
  useLedgerCursor,
  useLedgerKeys,
  useLetGo,
  useRowMarks,
} from "./ledger/ledger-keys";
import { LedgerPhone } from "./ledger/ledger-phone";
import { useLedgerView } from "./ledger/use-ledger-view";
import { NewMessageLabel } from "./new-label";
import { NewMessage } from "./new-message";
import { Rail } from "./rail";
import type { RailActs } from "./rail";
import { SentenceParts } from "./sentence";
import { ComingBlock, ReachBlock, ResultsBlock } from "./tiles";
import { useHomeData, useHomeNav, useKeptGroup, useReopenDrafts } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];
type Nav = ReturnType<typeof useHomeNav>;

/**
 * The head's line: the page's numbers in the page's emphasis, and a quiet line while offers by email are paused. Where
 * the workspace stands on its channels is drawn where it is seen, at the rail's head (in the Moments head on a phone): the
 * frame's head is a screen reader's line under Glass, clipped to a point on a desk and gone on a phone.
 */
function sentenceOf(home: LifecycleHome): ReactNode {
  const { sentence, pausedLine } = home.head;
  return (
    <>
      <SentenceParts parts={sentence} />
      {pausedLine ? (
        <>
          <CmDot />
          <span data-testid="cmh-paused">{pausedLine}</span>
        </>
      ) : null}
    </>
  );
}

/** The head's two acts: the Library, which is the Templates page now, and New message, the page's one primary act. */
function headActs(home: LifecycleHome, newMessage: () => void) {
  const { library } = home.head;
  return (
    <>
      <Button size="sm" className="cmh-library" {...routeDoor("messages")} data-testid="cmh-library">
        <Icon name="content" size={13} /> <span className="cmh-library-word">{library.label}</span>
        {library.count !== null ? <span className="cmh-n tabular">{library.count}</span> : null}
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={newMessage}
        data-testid="cmh-new"
        {...gate("approve", "send a message")}
      >
        <Icon name="plus" size={12} /> <NewMessageLabel />
      </Button>
    </>
  );
}

/**
 * What a press on a moment, a row, a line or a button does. A door to a campaign is its drawer, pushed so Back closes
 * it; a door to a page is a link the app's way. Starting or resuming a campaign is the role's. `onDecided`: a campaign
 * resumed where it stood settles there.
 */
function useActs(home: LifecycleHome, nav: Nav, flash: Flash, onDecided: (id: string) => void) {
  const nameOf = (id: string) =>
    home.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.name ??
    home.rail.stages.find((s) => s.playbookId === id)?.name ??
    LIFECYCLE_TOAST.nameless;
  const resume = async (id: string) => {
    const name = nameOf(id);
    const r = await verbs.resume(id, {
      onAccepted: () => {
        onDecided(id);
        flash({ tone: "ok", msg: <SentenceParts parts={LIFECYCLE_TOAST.resumed(name)} /> });
      },
    });
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  const onAct = (act: LifecycleAct) => {
    if (act.kind === "open") nav.push(momentRoute(act.playbookId));
    else if (act.kind === "turn_on") nav.push(composeRoute("every", { moment: act.moment }));
    else if (act.kind === "resume") void resume(act.playbookId);
    else navigate(act.route);
  };
  const door = (act: LifecycleAct): RouteDoor | null => {
    if (act.kind === "open") return routeDoor(momentRoute(act.playbookId), nav.push);
    if (act.kind === "route") return routeDoor(act.route);
    return null;
  };
  // A browser that will not copy (no clipboard on an insecure page, or a refusal) says the phrase, to be typed or copied by hand.
  const onCopy = (phrase: string) => {
    const refused = () => flash({ tone: "warn", msg: <>{LIFECYCLE_TOAST.copyFailed(phrase)}</> });
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      refused();
      return;
    }
    void navigator.clipboard.writeText(phrase).then(() => flash({ msg: <>{LIFECYCLE_TOAST.phraseCopied}</> }), refused);
  };
  return { onAct, onCopy, door };
}

/**
 * A waiting run approved or skipped on its row (the broadcast's own doors, playbooks/verbs.ts): one at a time, each said
 * the moment the server takes it, from what it answered -- how many, and when it really goes, since the server moves an
 * approval outside the sending hours to the next nine o'clock (broadcasts/when-words.ts). The row keeps its place and
 * settles; the page repaints from the re-read behind it; a refusal is the server's own words.
 */
function useApproval(flash: Flash, canAct: boolean, onDecided: (id: string) => void): LedgerApproval {
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  // A second press before the first has drawn its busy state would be a second request: the ref holds it at once.
  const working = useRef(false);
  const answer = async <D,>(
    row: LifecycleRow,
    runId: string,
    send: (o: { onAccepted: (d: D) => void }) => Promise<{ ok: true; data: D } | { ok: false; message: string }>,
    said: (d: D) => ReactNode,
  ): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setBusy(runId);
    let done = false;
    const say = (d: D) => {
      done = true;
      onDecided(row.id);
      flash({ tone: "ok", msg: said(d) });
    };
    try {
      const r = await send({ onAccepted: say });
      if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
      else if (!done) say(r.data);
    } finally {
      // Whatever the send did, the next press is taken; and the question this press answered closes, never one asked
      // on another row while this was with the server.
      working.current = false;
      setBusy(null);
      setAsking((open) => (open === runId ? null : open));
    }
  };
  const onApprove = async (row: LifecycleRow): Promise<void> => {
    const w = row.waiting;
    if (!w || w.refusal || !canAct) return;
    await answer(
      row,
      w.runId,
      (o) => verbs.approveRun(w.runId, o),
      (d: Output<"POST broadcasts/[id]/approve">) => (
        <SentenceParts parts={LIFECYCLE_TOAST.approved(row.name, d.recipient_count || w.people, bcWhenWords(d))} />
      ),
    );
  };
  const onSkip = async (row: LifecycleRow): Promise<void> => {
    const w = row.waiting;
    if (!w || !canAct) return;
    await answer(
      row,
      w.runId,
      (o) => verbs.skipRun(w.runId, o),
      // What the server stopped, by what the run was when it did: one a teammate approved a moment before is going.
      (d: Output<"POST broadcasts/[id]/cancel">) => <SentenceParts parts={LIFECYCLE_TOAST.skipped(row.name, d.was)} />,
    );
  };
  return { busy, asking, onAsk: setAsking, onApprove, onSkip, canAct, gated: gate("approve", "approve a run") };
}

/**
 * The ledger as the page holds it, once: its view (what the screen shows; Ask's door reads its rows), the row marks (a
 * row decided in place keeps its place until the filter changes, and settles; an arrival is washed), the keys over the
 * rows the screen shows, and focus coming back to the row a sheet was opened from.
 */
function useLedgerPage(home: LifecycleHome, address: HomeAddress, at: { group: string | null; nav: Nav; phone: boolean }) {
  const marks = useRowMarks();
  const settled = marks.mark && marks.mark.kind === "settled" ? marks.mark.id : null;
  const view = useLedgerView(home.ledger, { group: at.group, onGroup: at.nav.narrow, phone: at.phone, keep: settled });
  useLetGo(`${view.status}|${view.group ?? ""}|${view.query}`, marks.clear);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const ids = view.visibleRows.map((r) => r.id);
  const cursor = useLedgerCursor(ids);
  useLedgerKeys({
    ids,
    cursor: cursor.cursor,
    move: cursor.move,
    open: pressRowOpener,
    focusSearch: () => searchRef.current?.focus(),
    narrowed: view.filtered,
    clearOne: view.clearOne,
    sheetOpen: address.moment !== null || address.compose !== null,
  });
  // Since the review of Tasks 4–6, the hook takes the ids the screen shows, so focus has a row to go to when the
  // opener is gone (the row now at its index, else the last, else the search): pass the view's shown row ids.
  useFocusComesHome(
    address.moment ?? (address.compose && address.compose.mode === "every" ? address.compose.edit : null),
    view.groups.flatMap((g) => g.rows.map((r) => r.id)),
  );
  // A campaign just made has no row until the playbooks are read again: it is scrolled to when its row is drawn.
  useArrivalLands(marks.mark, ids);
  return { marks, view, searchRef, cursor: cursor.cursor };
}

/** What the composer says once the server took a playbook. */
const composerDone = (flash: Flash) => (d: { name?: string }, changed: boolean) => {
  const name = d.name ?? LIFECYCLE_TOAST.nameless;
  flash({
    msg: <SentenceParts parts={changed ? LIFECYCLE_TOAST.changed(name) : LIFECYCLE_TOAST.running(name)} />,
  });
};

interface CampaignsHomeProps {
  /** The address's param, `campaigns/<param>`: the group the ledger shows, a moment open, or the composer. */
  param: string | null;
  /** The clock the page is read at, for a test; the moment it draws otherwise. */
  nowMs?: number;
}

export function CampaignsHome({ param, nowMs }: CampaignsHomeProps) {
  const { playbooks, broadcasts, reachOuts, home } = useHomeData(nowMs);
  const address = parseHome(param);
  const group = useKeptGroup(address);
  const nav = useHomeNav(address, group);
  const [toastNode, flash] = useLegacyToast();
  const phone = useCmPhone();
  // Who may start, change or run a campaign, or send: the role store's answer, View-as included.
  const canAct = !!canDo("approve");
  useReopenDrafts(address, playbooks, nav.swap);
  const ledger = useLedgerPage(home, address, { group, nav, phone });
  const { onAct, onCopy, door } = useActs(home, nav, flash, ledger.marks.settle);
  const approval = useApproval(flash, canAct, ledger.marks.settle);
  if (!playbooks) return null;
  const acts: RailActs & { onCopy: (phrase: string) => void } = {
    onAct,
    onCopy,
    door,
    gated: gate("approve", "turn on, resume or start a campaign"),
    chosen: ledger.view.group,
    onChoose: ledger.view.setGroup,
  };
  const ledgerActs: LedgerActs = { door, onAct, gated: acts.gated, approval };
  const newMessage = () => nav.push(composeRoute("once"));
  // A change is pushed over the drawer that showed it, so Cancel, and Back, return to the detail.
  const changeAt = (id: string) => nav.push(composeRoute("every", { edit: id }));
  // A reach-out's change is its own sheet (the record sheet, which stands on the page and so cannot stand under the drawer's
  // modal), so the address that names one closes the drawer and opens that sheet in its place.
  const changing = address.compose && address.compose.mode === "every" ? address.compose.edit : null;
  const chain = changing && Array.isArray(reachOuts) ? (reachOuts.find((c) => c.root_id === changing) ?? null) : null;
  return (
    <div className="cmh" data-testid="campaigns-home" data-phone={phone ? "true" : undefined}>
      <CmHead title="Campaigns" quiet testid="cmh-head" sub={sentenceOf(home)} right={headActs(home, newMessage)} />
      {phone ? (
        <>
          <LedgerPhone
            home={home}
            view={ledger.view}
            acts={ledgerActs}
            mark={ledger.marks.mark}
            searchRef={ledger.searchRef}
          />
          <ComingBlock tile={home.coming} failed={home.failed.coming} acts={acts} />
          <ResultsBlock tile={home.results} failed={home.failed} onOpen={navigate} />
        </>
      ) : (
        <>
          <Rail home={home} acts={acts}>
            <Ledger
              ledger={home.ledger}
              failed={home.failed}
              view={ledger.view}
              acts={ledgerActs}
              cursor={ledger.cursor}
              mark={ledger.marks.mark}
              searchRef={ledger.searchRef}
            />
          </Rail>
          <div className="cmh-grid">
            <ReachBlock tile={home.reach} failed={home.failed.reach} acts={acts} />
            <ComingBlock tile={home.coming} failed={home.failed.coming} acts={acts} />
            <ResultsBlock tile={home.results} failed={home.failed} onOpen={navigate} />
          </div>
        </>
      )}
      <MomentDrawer
        id={address.moment}
        home={home}
        playbooks={playbooks}
        reachOuts={reachOuts}
        canAct={canAct}
        flash={flash}
        onClose={nav.close}
        onEdit={(p: PlaybookCardVM) => changeAt(p.id)}
        onEditChain={(c) => changeAt(c.root_id)}
      />
      {chain && chain.search ? (
        <ReachOutSheet key={chain.root_id} search={chain.search} chain={chain} onClose={nav.close} onGo={nav.swap} />
      ) : null}
      <NewMessage
        compose={chain ? null : address.compose}
        home={home}
        playbooks={playbooks}
        broadcasts={broadcasts}
        reachOuts={reachOuts}
        flash={flash}
        onClose={nav.close}
        onYes={nav.swap}
        onKind={(mode) => nav.swap(composeRoute(mode))}
        onSaved={(d, changed) => {
          nav.close();
          composerDone(flash)(d, changed);
          if (d.id) ledger.marks.arrive(d.id);
        }}
      />
      {toastNode}
    </div>
  );
}
```

(Hooks all run before `if (!playbooks) return null`, in one order every draw. `useLedgerPage` and `useApproval` take at most four parameters. If `home.ledger` can be absent before the playbooks land in lane 2's view model, guard `useLedgerView` with lane 2's empty ledger, never by calling it conditionally.)

- [ ] **Step 5: The old phone rail leaves**

1. `apps/dashboard/src/surfaces/campaigns/home/rail.tsx`: delete `PhoneStage` and `PhoneRail` and the imports only they read (`LIFECYCLE_WORDS`, `PhoneReachLine`). Update the header's last sentence: "On a phone the same moments are the heads of the one list (ledger/ledger-phone.tsx)".
2. `apps/dashboard/src/surfaces/campaigns/home/tiles.tsx`: delete `PhoneReachLine` (and `ChannelStandingPart`, `ChannelsLine`, `routeDoor` imports if nothing else there reads them); update its header's last sentence: "The phone says the first as a line in its Moments head (ledger/ledger-phone.tsx PhoneMeta) and draws the other two the same as the desk."
3. `apps/dashboard/src/surfaces/campaigns/campaigns.css`: delete the phone rail's and the strips' last rules: `.cmh-vrail-reach`, `.cmh-vrail-hear`, `.cmh-vrail-reach > .cmh-channels`, `.cmh-vrail-reach > .route-reading.cmh-reading`, `.cmh-vrail-reach > .cmh-failed`, `.cmh-vrail-yes`, `.cmh-vrail`, `.cmh-vstage`, `.cmh-vstage::before`, `.cmh-vstage:is([data-state="always"], [data-state="on"])::before`, `.cmh-vstage:first-child::before`, `.cmh-vstage:last-child::before`, `.cmh-vstage > .cmh-node`, `.cmh-vwords`, `.cmh[data-phone] .cmh-strip-words` (both), `.cmh[data-phone] .cmh-strip-more::before`, `.cmh-also-block .cmh-strips`, `.cmh-also-block .cmh-strip`, `.cmh-strip > svg`, `.cmh .cmh-strip-name` (the text-align one), `.cmh[data-phone] .cmh-strip`, `.cmh[data-phone] .cmh-strip-words + *`, with their comments. Then:
```bash
git grep -n -E "cmh-(strip|vrail|vstage|vwords|also)" -- apps/dashboard/src e2e tooling/scripts/tests
```
Expected after Step 7: nothing (the e2e spec's `cmh-also` goes in Task 16; until then it is the one hit).

- [ ] **Step 6: Move the home's tests to the rows**

In `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs` (line numbers are `7ff179717`'s; find each by its test's title):

1. **"the home draws the rail's moments in order, …"** (~line 143): the stage ids are lane 2's journey for the sample's shape (a calendar, no deals): `["first_contact", "before", "after", "quiet"]` (keep lane 2's if it already changed them); replace the last assertion (`cmh-strip`) with:
```js
  assert.ok(allBy(tree, "cmh-row").length >= 3, "every campaign is a row of the ledger under the moments");
```
2. **"the page draws nothing before the playbooks have landed, …"** (~line 223): `allBy(tree, "cmh-stage")[3]` becomes `allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet")`.
3. **"the phone opens on the moments, …"** (~lines 226-261): replace the whole test with:
```js
test("the phone opens on the moments: who can hear you one line in their head, and every campaign under them on the journey's line", () => {
  surfaces();
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const tree = page();
  const home = byTestId(tree, "campaigns-home");
  assert.equal(home.props["data-phone"], "true");
  assert.equal(allBy(tree, "cmh-rung").length, 0, "no ladder on a phone: one line");
  assert.equal(byTestId(tree, "cmh-also"), null, "no Also tile: the lists and the reach-outs are groups of the one list");
  const rail = byTestId(tree, "cmh-rail");
  const reach = byTestId(rail, "cmh-reach");
  assert.ok(reach, "the reach is said inside the moments' pane");
  assert.equal(allBy(tree, "cmh-reach").filter((n) => typeof n.type === "string").length, 1, "once");
  assert.match(textOf(reach), /7 of 29 can hear you/);
  assert.match(textOf(reach), /0 to offers/);
  assert.equal(all(reach, (n) => n.type === Meter).length, 0, "no bar: the figure says it");
  // The sample has no texting line: a channel is closed, so where the workspace stands is said, with its door.
  assert.ok(byTestId(reach, "cmh-channels"));
  const yes = all(reach, (n) => n.type === "a" && n.props?.["data-testid"] === "cmh-phone-yes")[0];
  assert.ok(yes, "the door is a link");
  assert.equal(textOf(yes), "Get their yes");
  assert.match(String(yes.props.href), /broadcasts\/get-yes$/);
  assert.ok(byTestId(rail, "cmh-ledger"), "the campaigns stand in the same pane, under the line");
  const blocks = all(
    home,
    (n) => typeof n.type === "string" && String(n.props?.className ?? "").split(" ").includes("cmh-block"),
  );
  assert.equal(blocks[0].props["data-testid"], "cmh-rail", "the moments are the page's first pane");
  assert.ok(byTestId(tree, "cmh-coming") && byTestId(tree, "cmh-results"), "what is coming and what came back stand below");
});
```
4. **"a Turn on opens the composer on the moment it was pressed for"** (~line 282): `s.props["data-stage"] === "visit"` becomes `=== "before"` (lane 2's word-free id), if lane 2 left it.
5. **"a line that is paused resumes in place, …"** (~lines 306-339): replace the part from `fresh();` (after the second `surfaces(…)`) to the end of the test with:
```js
  fresh();
  verbs.resume = async (id, opts) => {
    said.push(["resume", id]);
    opts.onAccepted({});
    return { ok: true, data: {} };
  };
  const monthRow = (t) => allBy(t, "cmh-row").find((r) => r.props["data-row"] === "pb-month");
  assert.ok(monthRow(page()), "the month's offer is a row of the ledger");
  pressed(byTestId(monthRow(page()), "cmh-resume"));
  const ask = byTestId(monthRow(page()), "cmh-resume-confirm");
  assert.ok(ask, "Resume asks first, in place (decision 7)");
  assert.match(textOf(ask), /The month's offer/);
  assert.deepEqual(said, [], "nothing resumes on the first press");
  pressed(byTestId(monthRow(page()), "cmh-resume-yes"));
  await settle();
  assert.deepEqual(said, [["resume", "pb-month"]]);
  assert.match(textOf(toasts[0].msg), /The month's offer resumed/);
  assert.equal(monthRow(page()).props["data-settled"], "true", "it keeps its place and settles once");
```
and rename the test "a paused campaign resumes from its row, asked in place, through the playbooks' own verb, and says so".
6. **The waiting run's block** (~lines 361-614). Replace the helper `waitingLine` with:
```js
const waitingLine = (tree) => allBy(tree, "cmh-row").find((r) => r.props["data-state"] === "waiting");
```
and then:
   - **"a run waiting on you is approved on its line in Coming up, …"**: rename "… approved on its row, …"; replace `assert.equal(line.props["data-kind"], "run");` with `assert.equal(line.props["data-state"], "waiting");`; replace `assert.match(textOf(line), /4 people\. Nothing sends until you say so\./);` with nothing (it moves below); change `assert.match(textOf(approve), /Approve/);` to `assert.match(textOf(approve), /Approve · 4 people/);`; replace the last two lines (`pressed(byTestId(line, "cmh-coming-open"));` and its `went` match) with:
```js
    const after = allBy(page(), "cmh-row").find((r) => r.props["data-row"] === line.props["data-row"]);
    assert.equal(after.props["data-settled"], "true", "the row keeps its place and settles once");
    // Coming up keeps the run's time and says it waits; it decides nothing (one decision per run per screen).
    const coming = allBy(page(), "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
    assert.match(textOf(coming), /4 people\. Nothing sends until you say so\./);
    assert.equal(byTestId(coming, "cmh-waiting-acts"), null);
    // The name is the door to the campaign's drawer, which shows the run and its door to Sent.
    pressed(byTestId(line, "cmh-row-open"));
    assert.equal(went.at(-1), `campaigns/moment:${line.props["data-row"]}`);
```
   - **"a run that is decided on its sheet has no acts on its line: …"**: replace the whole test with (the playbooks' own waiting runs set to none, so neither source can make one):
```js
test("a run that is decided on its sheet has no acts anywhere on the page: a reach-out's, and one whose playbook is gone", () => {
  const noneWaiting = playbooksSample(new Date(NOW)).rows.map((p) => ({ ...p, totals: { ...p.totals, waiting: null } }));
  surfaces({
    playbooks: { rows: noneWaiting },
    broadcasts: { rows: waitingRows({ playbook_id: null, audience: { kind: "reach_out" }, recipient_count: 12 }) },
  });
  fresh();
  let tree = page();
  assert.equal(allBy(tree, "cmh-waiting-acts").length, 0, "no one-tap approval of first cold emails");
  let line = allBy(tree, "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
  assert.match(textOf(line), /12 businesses\. Nothing sends until you say so\./);
  pressed(byTestId(line, "cmh-coming-open"));
  assert.match(went.at(-1), /^broadcasts\/run:b-sample-2$/);
  surfaces({ playbooks: { rows: noneWaiting }, broadcasts: { rows: waitingRows({ playbook_id: "pb-gone" }) } });
  fresh();
  tree = page();
  assert.equal(allBy(tree, "cmh-waiting-acts").length, 0);
  line = allBy(tree, "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
  assert.ok(byTestId(line, "cmh-coming-open"), "Coming up's name is the door to its sheet");
});
```
   - **"two runs wait: …"**: the second run is the win-back's; give the win-back its waiting run in the playbooks surface too (so lane 2's row has it whichever source it reads), and find rows:
```js
  const rows = playbooksSample(new Date(NOW)).rows.map((p) =>
    p.id === "pb-sample-winback" ? { ...p, totals: { ...p.totals, waiting: { id: "b-second", recipient_count: 6 } } } : p,
  );
  surfaces({ playbooks: { rows }, broadcasts: { rows: [...waitingRows(), second] } });
  fresh();
  const lineOf = (name) =>
    allBy(page(), "cmh-row").find((r) => r.props["data-state"] === "waiting" && textOf(r).includes(name));
```
   (replacing its `surfaces(…)`, `fresh()` and `lineOf`; the rest of the test stands).
   - The other tests of the block ("an approval the server refuses …", "Skip asks …", "the demo's waiting run …", "while the workspace is paused …", "a skip of a run that was already going …", "a press that throws …", "a run whose day has passed …") stand as they are: they read `waitingLine`, which is the row now, and the row draws the verb's sentence where it refuses (`cmh-row-refusal`).
7. **"a moment whose playbook has a run waiting wears a clock …"** (~line 617): in `nodeOf`, find the moment among the desk's cards or the phone's heads:
```js
    const stage = [...allBy(tree, "cmh-stage"), ...allBy(tree, "cmh-group-head")].find((s) => s.props["data-stage"] === id);
```
   and its last assertion's message: "the phone's head on the line says it too".
8. **"a templates read that failed …"** (~line 796): replace the `cmh-strip` assertion with:
```js
  assert.equal(
    allBy(tree, "cmh-row").filter((r) => r.props["data-kind"] === "call_text").length,
    0,
    "it stands where the call's text's row would, not beside it",
  );
```
9. **"a reach-outs read that failed …"** (~line 851): `allBy(tree, "cmh-strip").filter((s) => s.props["data-kind"] === "reach_out")` becomes `allBy(tree, "cmh-row").filter((r) => r.props["data-kind"] === "chain")`.
10. **"on a phone a failed read is said in the same places: …"** (~line 903): rename "… over the moments, in the list, and in what came back"; replace the last assertion with:
```js
  assert.ok(
    find(byTestId(tree, "cmh-rail"), (n) => n.props?.["data-testid"] === "pb-chains-failed"),
    "in the one list, where the reach-outs would stand",
  );
```

- [ ] **Step 7: Run every test of the page**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-drafts.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-glass.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: all PASS (ledger-page: 25); typecheck clean. A failure in `campaigns-home` that names a word (a stage's caps, a row's words) is lane 2's word: read lane 2's test for the same thing and match it; never change a contracts word here to fit a page test.

- [ ] **Step 8: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns tooling/scripts/tests/playbooks/home
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns
git add apps/dashboard/src/surfaces/campaigns/home apps/dashboard/src/surfaces/campaigns/playbooks/composer-acts.ts apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home
git commit -F - <<'EOF'
Campaigns' home holds its ledger once: a card narrows it, a key walks it, a row decides its run, and a saved campaign arrives marked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 11: The other page tests that drew strips

Five more files draw the home (`git grep -l -E "home-page|CampaignsHome|cmh-" -- tooling/scripts/tests`): three pinned strips, two pin only the moments.

**Files:**
- Modify: `tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs:362-420`
- Modify: `tooling/scripts/tests/reports/reports-honest.test.mjs:278-296`
- Modify: `tooling/scripts/tests/playbooks/playbook-composer.test.mjs:485-512`
- Run: `tooling/scripts/tests/playbooks/playbooks.test.mjs`, `tooling/scripts/tests/playbooks/runs-honest.test.mjs`

- [ ] **Step 1: A chain is a row**

In `tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs`, replace `reachLines` and the two tests after it (from `const reachLines =` through the end of `"a paused chain's line resumes it in place …"`) with:

```js
const reachLines = (tree) =>
  all(tree, (n) => n.props?.["data-testid"] === "cmh-row" && n.props["data-kind"] === "chain");

test("a chain is a row of the ledger -- its name, its steps and search, its state, Resume where paused -- and its report is read when it opens, never before (R23)", async () => {
  const pressed = verbs();
  went.length = 0;
  const tree = homeAt(null, [chainOf(), chainOf({ root_id: "r2", name: "Reach out · Florists", state: "paused" })]);
  const lines = reachLines(tree);
  assert.deepEqual(
    lines.map((l) => l.props["data-row"]),
    [ROOT, "r2"],
  );
  const said = textOf(lines[0]);
  for (const part of ["Reach out · Personal trainers", "Personal trainers · Austin", "2 steps"])
    assert.ok(said.includes(part), `${part}: ${said}`);
  assert.deepEqual(
    lines.map((l) => !!byTestId(l, "cmh-resume")),
    [false, true],
    "a paused one resumes, asked; a running one is opened by its row",
  );
  assert.deepEqual(pressed, [], "a row reads no report: it is read when the reach-out opens (R23)");
  // Its name opens it by its address, pushed so Back closes it; there, its pane reads the report once.
  press(byTestId(lines[0], "cmh-row-open"));
  assert.deepEqual(went, [`campaigns/moment:${ROOT}`]);
  homeAt(`moment:${ROOT}`);
  await settle();
  const open = homeAgain(`moment:${ROOT}`);
  assert.deepEqual(pressed, [["report", ROOT]], "read when it opens, once");
  assert.ok(
    find(open, (n) => n.type === ReachOutPane),
    "its own pane, in the sheet",
  );
  assert.ok(byTestId(open, "ro-steps"), "with the report's counts in it");
  // A read of the chains that failed draws no row, and the moments are still there: null, never an empty list.
  const failed = homeAt(null, null);
  assert.equal(reachLines(failed).length, 0);
  assert.ok(byTestId(failed, "campaigns-home"));
});

test("a paused chain's row resumes it, asked in place, through the playbooks' own verb, and says so", async () => {
  const kept = playbookVerbs.resume;
  const resumed = [];
  playbookVerbs.resume = async (id, opts) => {
    resumed.push(id);
    opts.onAccepted({});
    return { ok: true, data: {} };
  };
  try {
    const tree = homeAt(null, [chainOf({ state: "paused" })]);
    toasts.length = 0;
    press(byTestId(reachLines(tree)[0], "cmh-resume"));
    assert.deepEqual(resumed, [], "asked first");
    press(byTestId(reachLines(homeAgain())[0], "cmh-resume-yes"));
    await settle();
    assert.deepEqual(resumed, [ROOT], "the chain's root, the door its own Resume presses (the bridge's verbs, below)");
    assert.match(textOf(toasts.at(-1).msg), /Reach out · Personal trainers resumed/);
  } finally {
    playbookVerbs.resume = kept;
  }
});
```
(The row's hint is lane 2's words for a chain; if lane 2 says its search and steps otherwise, assert lane 2's words, as its own test does.)

- [ ] **Step 2: Every campaign is a row in Reports' honesty test**

In `tooling/scripts/tests/reports/reports-honest.test.mjs`, replace the block from `let tree = homeAt();` to `assert.deepEqual(went, ["campaigns/moment:pb-3"]);` (~lines 278-291) with:

```js
  let tree = homeAt();
  // The win-back is the moment it does; every campaign is a row of the ledger, the moment's own among them, said once.
  const quiet = stagesOf(tree).find((s) => s.props["data-stage"] === "quiet");
  assert.equal(quiet.props["data-state"], "on");
  const rows = all(tree, (n) => n.props?.["data-testid"] === "cmh-row");
  const row = (id) => rows.find((r) => r.props["data-row"] === id);
  assert.ok(row("pb-1") && row("pb-2") && row("pb-3"), "every campaign is a row, the moment's lead among them");
  assert.equal(rows.filter((r) => r.props["data-row"] === "pb-1").length, 1, "and once");
  // A run waiting on the owner: its row says so and decides it; the drawer's own verbs are not drawn.
  assert.ok(textOf(row("pb-3")).includes("Waiting on you"), textOf(row("pb-3")));
  assert.ok(byTestId(row("pb-3"), "cmh-approve"), "decided where it waits");
  assert.equal(byTestId(tree, "pb-approve"), null, "the page carries no verbs of a drawer that is not open");
  press(find(row("pb-3"), (n) => n.props?.["data-testid"] === "cmh-row-open"));
  assert.deepEqual(went, ["campaigns/moment:pb-3"]);
```
(The rest of the test, the drawer at `moment:pb-3`, stands.) If lane 2's rows take a waiting run from the broadcasts' runs rather than the playbook's `totals.waiting`, give this test's broadcasts surface the run too: a row in `broadcastsSample(new Date(NOW)).rows`'s pending shape with `id: "b-w"`, `playbook_id: "pb-3"`, `recipient_count: 186`, `run_for` the business's today.

- [ ] **Step 3: The composer moves nothing on the page, rows included**

In `tooling/scripts/tests/playbooks/playbook-composer.test.mjs` (~lines 485-512): rename the test "REGRESSION: opening the composer moves nothing on the page -- … on the home it is a sheet over a rail and a ledger that stay"; replace `const lines = (t) => allByTestId(t, "cmh-strip").map((s) => s.props["data-strip"]);` with
```js
  const lines = (t) => allByTestId(t, "cmh-row").map((s) => s.props["data-row"]);
```
and `"and every line under them"` with `"and every row of the ledger under them"`.

- [ ] **Step 4: Run every file that draws the home**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbooks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/runs-honest.test.mjs
```
Expected: PASS ×5. `playbooks.test.mjs` and `runs-honest.test.mjs` read `cmh-stage` only; a failure there on a stage id is lane 2's rename (`visit` → `before`), fixed in the test to lane 2's id.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs tooling/scripts/tests/reports/reports-honest.test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs tooling/scripts/tests/playbooks/playbooks.test.mjs tooling/scripts/tests/playbooks/runs-honest.test.mjs
git commit -F - <<'EOF'
The tests that drew a line under the rail read the ledger's row: a chain's, a waiting run's, the composer's page behind it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 12: The drawer: Delete and Remove close it, then toast; on a phone its foot holds Pause or Resume

Spec §4.3: "Delete and Remove close the sheet, then toast" (today a deleted playbook leaves a "gone" sheet: `home/drawer.tsx`'s `pb-gone`). Spec §4.4: the phone drawer's docked foot holds Pause or Resume when nothing waits (`cmp/parts/split.tsx`: a phone's pane docks its foot at the screen's edge; today Pause sits behind the head's menu on a phone, three presses away).

**Files:**
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx` (`ActsIn`, `cardActs.remove`, `cardOwnActs`, `useCard`, `PlaybookPane`)
- Modify: `apps/dashboard/src/surfaces/campaigns/reach-out/row.tsx` (`ReachOutActs`, `ReachOutOpen`, `ReachOutPane`)
- Test: `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs` (append), `tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs` (the Remove test, ~line 245)

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/playbooks/home/ledger-page.test.mjs`:

```js
/* ------------------------------------------------------- the drawer ------------------------------------------------------- */

const { PlaybookPane } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);

test("Delete closes the drawer, then says so: never a sheet left saying the campaign is gone", async () => {
  surfaces();
  fresh();
  const real = verbs.remove;
  verbs.remove = async (id, opts) => {
    opts.onAccepted({});
    return { ok: true, data: {} };
  };
  try {
    let tree = page("moment:pb-sample-winback");
    const more = find(tree, (n) => n.type === Menu && /More for Win-back/.test(n.props.label ?? ""));
    more.props.groups[0].items.find((i) => i.label === "Delete…").onSelect();
    tree = page("moment:pb-sample-winback");
    press(byTestId(tree, "pb-delete-yes"));
    await settle();
    assert.deepEqual(replaced, ["campaigns"], "the drawer a link opened closes to the home");
    assert.equal(toasts.length, 1, "and the toast says what left the screen");
    assert.match(textOf(toasts[0].msg), /Win-back/);
  } finally {
    verbs.remove = real;
  }
});

test("on a phone the drawer's docked foot holds Pause, or Resume, when no run waits", () => {
  surfaces();
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const running = page("moment:pb-sample-winback");
  assert.match(textOf(byTestId(running, "pb-pause-foot")), /Pause/);
  fresh();
  const paused = page("moment:pb-sample-reminder");
  assert.match(textOf(byTestId(paused, "pb-pause-foot")), /Resume/);
  fresh();
  const waits = page("moment:pb-sample-welcome");
  assert.equal(byTestId(waits, "pb-pause-foot"), null, "a run waits: the foot is its Approve and Skip");
  assert.ok(byTestId(waits, "pb-approve"));
});
```

In `tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs`, in the Remove test (~line 245), name the pane's state and hold the close:
```js
  fresh();
  const removing = { open: true };
  r = openPane(chainOf(), removing);
```
(replacing `r = openPane(chainOf(), { open: true });`), and after `assert.deepEqual(pressed.slice(1), [["remove", ROOT]]);`:
```js
  assert.equal(removing.open, false, "Remove closes the drawer");
  assert.equal(toasts.at(-1).tone, "ok", "then says so");
```

- [ ] **Step 2: Run them and see them fail**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs
```
Expected: FAIL (`replaced` is empty after Delete; no `pb-pause-foot`; `removing.open` stays true).

- [ ] **Step 3: Delete closes the drawer**

In `apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx`:

1. `ActsIn` (line 141): add
```ts
  /** The pane's own close: a campaign deleted leaves the screen before its toast says so. */
  onGone: () => void;
```
2. `cardActs` destructures `onGone` and its `remove` becomes:
```ts
  const remove = () => {
    setSure(false);
    void act(
      // Closed the moment the server takes it, then said: a sheet left saying "That playbook isn't here any more" was the
      // page talking about what it had just done (spec 2026-10-09 §4.3).
      (o) =>
        V.remove(p.id, {
          onAccepted: (d) => {
            onGone();
            o.onAccepted(d);
          },
        }),
      () => (
        <>
          <b>{p.name}</b> {PLAYBOOK_DELETE_WORDS.done}
        </>
      ),
    );
  };
```
3. `useCard` takes `onClose` and passes it on: its parameter becomes `Pick<CardProps, "p" | "canAct" | "onEdit" | "flash"> & { onClose: () => void }`, and `const acts = cardActs({ p, busy, setBusy, setSure, setSkipSure, flash, onGone: onClose });`. In `PlaybookPane`: `const c = useCard({ p, canAct, onEdit, flash, onClose });`. (If `CardProps` is also used by a pane drawn elsewhere, give it `onClose` there too: `git grep -n "useCard\|CardProps" -- apps/dashboard/src` shows every caller.)

- [ ] **Step 4: The phone's foot holds Pause or Resume**

In `cardOwnActs` (~line 556), on a phone the menu keeps Pause/Resume only while a run waits (the foot is then the run's); replace the `words` constant with:
```ts
  const pauseItem: MenuItem = {
    label: p.state === "paused" ? "Resume" : "Pause",
    glyph: <Icon name={p.state === "paused" ? "play" : "pause"} size={13} />,
    disabled: busy,
    onSelect: () => void acts.toggle(),
  };
  // On a phone the pane's head is a capsule a thumb wide: its acts are the menu's, as a thread's are, but Pause or Resume,
  // which the docked foot holds while no run waits (PlaybookPane).
  const words: MenuItem[] = phone
    ? [
        ...(waiting ? [pauseItem] : []),
        { label: "Edit", glyph: <Icon name="pencil" size={13} />, disabled: busy, onSelect: () => onEdit(p) },
      ]
    : [];
```
In `PlaybookPane` (~line 694), the foot gains its last case:
```tsx
  const foot = asking ? (
    <div className="pb-pane-foot">{asking}</div>
  ) : waiting ? (
    <div className="pb-pane-foot">
      <span className="pb-pane-foot-say" data-testid="pb-waiting">
        This run waits on you
      </span>
      {cardWaitActs(c)}
    </div>
  ) : phone && canAct ? (
    <div className="pb-pane-foot">
      <Button size="sm" disabled={c.busy} onClick={() => void c.acts.toggle()} data-testid="pb-pause-foot">
        <Icon name={p.state === "paused" ? "play" : "pause"} size={12} /> {p.state === "paused" ? "Resume" : "Pause"}
      </Button>
    </div>
  ) : null;
```
(`canAct` is `PlaybookPane`'s prop; the words "Pause" and "Resume" are the ones the desk's head button already draws, `pb-pause`. No new sentence.)

- [ ] **Step 5: Remove closes the reach-out's drawer**

In `apps/dashboard/src/surfaces/campaigns/reach-out/row.tsx`:
1. `ActsProps` gains `onGone: (() => void) | null;`; `ReachOutActs` destructures it and `remove` becomes:
```ts
  const remove = () => {
    setSure(false);
    void act(async () => {
      const r = await V.remove(chain.root_id);
      // Closed as the server takes it, then said (spec 2026-10-09 §4.3).
      if (r && r.ok && onGone) onGone();
      return r;
    }, RW.removed(chain.name));
  };
```
2. Thread it: `ReachOutPane` passes `onGone={onClose}` to `ReachOutOpen`, which passes it to `ReachOutActs` (add the prop to `ReachOutOpen`'s props type; every other caller of `ReachOutActs`/`ReachOutOpen`, if any, passes `onGone={null}`: `git grep -n "ReachOutActs\|ReachOutOpen" -- apps/dashboard/src`).

- [ ] **Step 6: Run the tests, and every test that draws the drawer**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-drafts.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/confirm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbooks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/runs-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/the-pages-say-only-what-is-true.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: all PASS. A test that pressed Delete and then looked for `pb-gone` in the same sheet now finds the sheet closed: change it to assert the close (`replaced` or the pane's `onClose`), never to keep the gone sheet. (A link to a playbook deleted earlier still lands on `pb-gone`: that path, `home/drawer.tsx`, is unchanged.)

- [ ] **Step 7: Format, lint, commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx apps/dashboard/src/surfaces/campaigns/reach-out/row.tsx tooling/scripts/tests/playbooks/home/ledger-page.test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx apps/dashboard/src/surfaces/campaigns/reach-out/row.tsx
git add apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx apps/dashboard/src/surfaces/campaigns/reach-out/row.tsx tooling/scripts/tests/playbooks/home/ledger-page.test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-rows.test.mjs
git commit -F - <<'EOF'
Delete and Remove close the drawer before the toast says so, and a phone's drawer docks Pause or Resume in its foot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 12B: One word per act and thing on Campaigns' own pages (D19)

Decision 19: "Approve · 7 people" and "Skip" everywhere a run is decided, and "campaign" wherever a person reads, never "playbook". The view model's words are lane 2's and Ask's lane 4's; this task changes the words Campaigns' TSX still says itself: the drawer's and Sent's acts, and the few person-read "playbook"s in `apps/dashboard/src/surfaces/campaigns`.

**Files:**
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx:535` (Skip), `:300` (a tooltip)
- Modify: `apps/dashboard/src/surfaces/campaigns/broadcasts/run.tsx:507` (Approve), `broadcasts/run-sheet.tsx:308` (Skip), `:341` ("Playbook · …")
- Modify: `apps/dashboard/src/surfaces/campaigns/broadcasts/ledger.tsx:415-422` (the "Playbook" door's words), `broadcasts/page/ledger-screen.tsx:162, 176`, `campaigns/routes.ts:34` (the crumb before a read)
- Test: `tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs:1756, 1830, 3947`, `tooling/scripts/tests/playbooks/campaigns-routes.test.mjs:70, 73`

- [ ] **Step 1: Move the pins first (they fail until Step 2)**

- `broadcasts-honest.test.mjs:1756` and `:1830`: the run's Approve says `Approve · <n> people` where `<n>` is that test's run's `recipient_count` (read it from the fixture above each line; `1 person` where it is one).
- `broadcasts-honest.test.mjs:3947`: `"Playbook · Win-back"` → `"Campaign · Win-back"`.
- `campaigns-routes.test.mjs:70` and `:73`: the crumb before the surfaces hold the name, `"Playbook"` → `"Campaign"`.

Run, one per command, and see each fail on the new words:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
```

- [ ] **Step 2: Change the words**

1. `playbooks/card-detail.tsx:535`: the drawer's `Skip this run` becomes `{LIFECYCLE_WORDS.ledger.skip}` (import `LIFECYCLE_WORDS` from `@chanlytics/contracts` if the file does not); and its Approve (`:546`, `Approve · {pbPeople(waiting.recipient_count)}`) becomes `{LIFECYCLE_WORDS.ledger.approve(waiting.recipient_count)}`, the one spelling (drop the `pbPeople` import if nothing else in the file reads it). Its question stays ("Skip this run of Win-back?": `runs-honest.test.mjs:700` holds it), as the row's does.
2. `broadcasts/run.tsx:507`: `{approving ? "Approving…" : "Approve the run"}` becomes `{approving ? "Approving…" : LIFECYCLE_WORDS.ledger.approve(row.recipient_count)}` (import `LIFECYCLE_WORDS` from `@chanlytics/contracts`).
3. `broadcasts/run-sheet.tsx:308`: `Skip this run` becomes `{LIFECYCLE_WORDS.ledger.skip}`; `:341` `Playbook · {hint} · {avm.goes}` becomes `Campaign · {hint} · {avm.goes}`.
4. `broadcasts/ledger.tsx:415-422` (`bcRunSub`): the door's words `Playbook` become `Campaign`, and its `aria-label` `` `Playbook ${pb ? pb.name : row.name}` `` becomes `` `Campaign ${pb ? pb.name : row.name}` ``; it also opens the campaign's drawer by its address now: `onClick={() => navigate(\`campaigns/moment:${playbookId}\`)}` (was `outbound/${playbookId}`, which lands there one move later). (`data-testid="bc-history-playbook"` stays: an id is not a word.)
5. `broadcasts/page/ledger-screen.tsx:162`: `"No playbook has run yet."` → `"No campaign has run yet."`; `:176`: `"…the ones your playbooks send."` → `"…the ones your campaigns send."`.
6. `playbooks/card-detail.tsx:300`: `"The list this playbook watches — …"` → `"The list this campaign watches — …"`.
7. `campaigns/routes.ts:34`: the crumb's fallback `"Playbook"` → `"Campaign"`.

Then list what is left for a person to read: `git grep -n -i -E "[\"'> ]playbooks?[ .,\"'<]" -- apps/dashboard/src/surfaces/campaigns ':!*.css'`. Every line it prints is a comment, an identifier, an id or a test id; a string a person reads that still says "playbook" is changed the same way (and its pin moved with it).

- [ ] **Step 3: Run**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/runs-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbooks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
git grep -l -E "Approve the run\b|No playbook has run yet|ones your playbooks send" -- tooling/scripts/tests e2e
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS ×5; the grep prints only Ask's card titles (`ask-palette`, `ask-run-card`: "Approve the run: …" is the card's title, contracts', lane 4's), which stay; typecheck clean.

- [ ] **Step 4: Commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/campaigns tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
git add apps/dashboard/src/surfaces/campaigns tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs tooling/scripts/tests/playbooks/campaigns-routes.test.mjs
git commit -F - <<'EOF'
One word per act on Campaigns' own pages: Approve with its count and Skip, and a campaign is never a playbook to its reader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 12C: "Campaign" wherever else a person reads "playbook": Today, the Inbox, People, Reports, Settings and the refusals (D19)

Added 9 Oct by the plan reconciliation's follow-up: D19 takes "playbook" out of every word a person reads in this
program, and no lane owned the words outside Campaigns' own TSX (12B) and Ask (lane 4's 18B). This task changes them.
**The rule:** "playbook" becomes "campaign", and nothing else moves: "broadcast" stays where it stands (D19 does not
take it; whether a one-off send is "a broadcast" or "a one-off send" outside the ledger is a question for Ruben's review,
not this task). Comments, identifiers, ids, test ids, decision kinds (`start_playbook`), event names (they never
change: alerting greps them), route keys and Ask's tool descriptions (read by the model, pinned by
`fixtures/ask-tools-4-7.json`, lane 4's) are not words a person reads, and stay. So do Ask's answers to its tools
(`srv/ask/tools/**`, e.g. `read/broadcasts`' "a playbook", pinned by `broadcasts/ask-broadcasts-reads.test.mjs:159, 185`):
the model reads them, and they are lane 4's. The legacy demo pages (`legacy/demo/**`) and the Inbox's seeded agent rail
(`surfaces/inbox/pages/agent-rail.tsx`, drawn only for the mockup's roster) are the demo's, and stay. **The code wins:**
lanes 1 and 2 touched some of these files, and main was merged in after these lines were read (on `45a15ee23`): read
each one before editing, and find each string by its words, not its line.

Two rows touch lane 4's ground, and say so: `ask-proposals/lists.ts` is Ask's list card, lane 4's file, whose plan does
not rename this sentence (its 18B covers `ask-proposals/campaigns.ts` alone), so it changes here with People's door, one
sentence in two places. And `srv/campaigns/playbook-row.ts:86`'s "A playbook is running or paused." is a refusal a
member reads: lane 4's plan moves it into `PLAYBOOK_PATCH_WORDS.state` (its Task 1) and keeps "playbook" there (its
open point 11), so it is renamed here, and lane 4's Task 1 must carry the renamed words (its plan's code wins rule):
say so in the hand-back, for the coordinator to tell lane 4.

**Files** (each `old` → `new`; the tests that pin the old words move with them):

| Where | Words a person reads | Pinned by |
| --- | --- | --- |
| `packages/contracts/src/today/today-runs.ts:51` | `const kind = reach ? "Reach-out" : "Playbook"` → `"Campaign"` (Today's run rows: "Campaign · ready"); its comment at `:24` | `today/today-page.test.mjs:964`, `today/today-leaks.test.mjs:875, 886, 934` |
| `packages/contracts/src/people/person-profile.ts:375` | `"Playbook" : "Broadcast"` → `"Campaign" : "Broadcast"` (a person's timeline); the comment at `person-dto.ts:277` | `people/person-honest.test.mjs:1702, 1918` |
| `packages/contracts/src/conversations/message-author.ts:105` and `apps/dashboard/src/surfaces/inbox/thread/timeline.tsx:202` | `` `the ${name} playbook` `` → `` `the ${name} campaign` `` (who sent a message, in the Inbox and on a person's page), and the comment's example at `:104` | `people/person-honest.test.mjs:1739, 1749, 1758-1759` ("The Win-back playbook", "The month's offer playbook"), `conversations/inbox/conversations-doors.test.mjs:144`, `conversations/inbox/inbox-true.test.mjs:150` ("Last message: the … playbook"); and two that read `timeline.tsx`'s own text, `broadcasts/broadcasts.test.mjs:993` and `playbooks/playbooks.test.mjs:737` (`` readCode(…).includes("`the ${entry.via.name} playbook`") ``), moved to the new spelling with it |
| `apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx:74` | `playbook: "Playbook sent"` → `"Campaign sent"` (the key stays) | grep `Playbook sent` under `tooling/scripts/tests e2e` (none on `45a15ee23`) |
| `packages/contracts/src/templates/templates.ts:460` | `` `${name} playbook` `` → `` `${name} campaign` `` (the Library's "used by") | `playbooks/outbound-routes.test.mjs:557` (`templateUseWords(…) === "Win-back playbook"`), and grep `" playbook` in `broadcasts/broadcasts.test.mjs`, `playbooks/playbooks.test.mjs`, `playbooks/home/moments-offered.test.mjs` |
| `packages/contracts/src/templates/templates.ts:289` | `` `${quoted[0] ?? "A playbook"} still uses this template.` ``: the fallback `"A playbook"` → `"A campaign"` (a template's delete, refused) | the named form, `broadcasts/broadcasts-honest.test.mjs:3005` and `playbooks/outbound-routes.test.mjs:831`, does not change; grep `A playbook still uses` for the fallback |
| `packages/contracts/src/templates/campaign-message.ts:321` | "…until it has one again or the playbook sends another." → "…or the campaign sends another." (a run's message with no version it can send) | `playbooks/playbook-composer.test.mjs:1464` |
| `packages/contracts/src/playbooks/playbook-approval.ts:115`, `packages/contracts/src/broadcasts/broadcast-audience.ts:274` | "heard from a playbook this week" → "heard from a campaign this week"; "heard from a playbook or a broadcast this week" → "heard from a campaign or a broadcast this week"; the comments in `surfaces/campaigns/parts/reach.tsx:21, 93` | `playbooks/approval-sheet.test.mjs`, `broadcasts/broadcasts-honest.test.mjs` |
| `packages/contracts/src/broadcasts/email-offers.ts:117` | "playbook that goes only by email" → "campaign that goes only by email" | grep the words |
| `packages/contracts/src/config/workspace-config/policy-classes.ts:47, 52, 64` | the notes' "playbooks" / "playbook" → "campaigns" / "campaign" | `playbooks/playbooks.test.mjs` |
| `packages/contracts/src/reports/lenses.ts:98`, `apps/dashboard/src/surfaces/reports/blocks.tsx:291` (on main since #1526; 97 and 283 before it) | "No broadcast or playbook run reached anyone…" → "No broadcast or campaign run reached anyone…" | grep the words |
| `packages/contracts/src/reports/campaign-report.ts:239` | `kindLabel: … "Playbook" : "Broadcast"` → `"Campaign" : "Broadcast"` (Reports' source kind) | `reports/campaign-report.test.mjs:126` |
| `packages/contracts/src/reports/campaign-report.ts:333-334` | "From one broadcast or playbook run." → "From one broadcast or campaign run."; `` `From ${sends} broadcast and playbook runs.` `` → `` `…broadcast and campaign runs.` `` (Reports' Campaigns lens) | `reports/campaign-report.test.mjs:230, 238`, `reports/reports-page.test.mjs:374` |
| `packages/contracts/src/reports/report-metrics.ts:16, 28` | "…a broadcast or a playbook message is nobody's answer." → "…a broadcast or a campaign message…"; "Messages your broadcasts and playbook runs sent in this period…" → "…your broadcasts and campaign runs sent…" (Reports' metric hints) | grep the words (none on `45a15ee23`) |
| `apps/dashboard/src/surfaces/reports/lenses/campaigns.tsx:139, 156` | "By playbook and broadcast" → "By campaign and broadcast"; "what your broadcasts and playbooks sent" → "what your broadcasts and campaigns sent" (and the comment at `reports/surface.ts:62`) | `shell/chart-kit.test.mjs`, `reports/reports-page.test.mjs` |
| `apps/dashboard/src/surfaces/today/pages/queue.tsx:135` | `what="the playbook runs"` → `"the campaign runs"` | `today/today-page.test.mjs:876` ("Couldn't read the playbook runs") |
| `packages/contracts/src/today/today-day.ts:213` | "…— a playbook can write the day before an appointment…" → "…— a campaign can write…" (Today's day, no reminder yet). Its "visit" words stay: the sweep lane's (lane 2's ratchet counts the string either way) | `today/today-day.test.mjs:205` |
| `packages/contracts/src/today/notification-kinds.ts:127-128` | "A playbook's run needs you, or could not run" → "A campaign's run needs you, or could not run"; "…And when a playbook could not run for the day…" → "…when a campaign could not run…" (Settings › Notifications; the kind `playbook` stays) | grep the words (none on `45a15ee23`) |
| `packages/core/src/campaigns/run-playbook.ts:296`, `packages/contracts/src/playbooks/playbook-triggers.ts:175`, `packages/contracts/src/today/today-away.ts:39, 65` (one change: the bell's titles and what reads them) | core's `` `Playbook “${p.name}” is ready: …` `` and `vetoRunNotice`'s `` `Playbook “${name}” sends ${when}: ${who}` `` → `Campaign “…”` (the bell's row and the mail an owner reads); `today-away.ts`'s `readyRunTitle`, which finds the queue's run in a kept row's title, reads **both** words (rows kept before this release say `Playbook “…”`, and production keeps them); `AWAY_NOUN.playbook` → `["campaign is ready", "campaigns are ready"]` (the key stays) | `playbooks/core-run-playbook.test.mjs:560, 571, 618, 625`, `cron/cron-playbooks-door.test.mjs:1011`; `today/today-leaks.test.mjs:569` and `today/today-page.test.mjs:1628` are rows kept before: keep their `Playbook “…”` and add one in the new words beside each, so both group |
| `apps/edge/lib/reach-out/playbook-failed.ts:63-68, 95`, `packages/contracts/src/playbooks/playbook-failed.ts:32` | Who reads them: `:63-68` is the platform's page (`pageOperator`, Chanlytics's own mailbox): "A playbook could not run in workspace…" → "A campaign could not run…", "Playbooks could not run…" → "Campaigns…", `` `${n} playbooks` `` → `` `${n} campaigns` ``, "Playbook:"/"Playbooks:" → "Campaign:"/"Campaigns:"; `:95` the redacted mail sent to the platform where a workspace names no recipient: "A playbook could not run today in this workspace." → "A campaign…"; and the owner's notice (the bell and the mail), contracts `playbookFailedWords`, whose fallback label `:32` "A playbook" (a blank name) → "A campaign". The pager's key `playbook_failed:<tenant>` and the log line `playbook_failed_told` stay | `cron/cron-playbooks-door.test.mjs:1189, 1291` (the page's subjects); the owner's titles at `:1204, 1208, 1298-1299` name the campaign and do not change |
| `packages/contracts/src/activity/lines.ts:112` | `` `Playbooks ran ${n} times` `` → `` `Campaigns ran ${n} times` `` (Settings › Activity) | grep the words |
| `packages/contracts/src/workspace/activity.ts:147, 148` | "Started a playbook" / "Paused a playbook" → "Started a campaign" / "Paused a campaign" (Settings › Activity; lane 4 Task 4 adds "Changed a campaign" after the second, and its plan anchors on the new words) | grep the words |
| `packages/contracts/src/people/lists/lists.ts:542`, `apps/dashboard/src/server/people/list-write.ts:112, 197`, `apps/dashboard/src/server/people/audience.ts:95` | the refusals' "a playbook's run" → "a campaign's run", "Move the playbook first" → "Move the campaign first", "A playbook was just put on this list" → "A campaign was just put on this list", "run a playbook on it" → "run a campaign on it" | `people/lists/a-list-has-a-life.test.mjs:111, 352`; `playbooks/runs-honest.test.mjs` (grep) |
| `apps/dashboard/src/server/campaigns/playbooks.ts:431` (`refuseOnArchivedList`, read on `eec979f29`) | "Its list, X, is archived. Restore it on People, or move the playbook to another list." → "…or move the campaign to another list." (lane 4 Tasks 1 and 6 copy this sentence from the tree after this task, and stop if it still says "playbook") | `people/lists/a-list-has-a-life.test.mjs:342` |
| `packages/contracts/src/ask-proposals/lists.ts:42` (**lane 4's file**: Ask's list card; lane 4's plan does not rename this string), `apps/dashboard/src/surfaces/people/lists/doors.tsx:52` | "a playbook runs on it" → "a campaign runs on it" (one sentence in two places: People's list door and Ask's list card) | `ask/ask-specs.test.mjs:609` |
| `apps/dashboard/src/server/campaigns/playbook-row.ts:86` | "A playbook is running or paused." → "A campaign is running or paused." (a pause or resume the route refuses). Lane 4's Task 1 moves this sentence into `PLAYBOOK_PATCH_WORDS.state` with today's words: it must take these (above) | `playbooks/outbound-routes.test.mjs:1051` |
| `apps/dashboard/src/server/rate-limit.ts:94` | `noun: "playbook changes"` → `"campaign changes"` (the 429's "Too many … in a short time"; the key `playbook` stays) | none: grep `Too many playbook changes` (`playbooks-run-door.test.mjs:298`'s "playbook changes nothing" is a test's title) |

- [ ] **Step 1: Move the pins first.** Each test in the table's last column: change the old words to the new, and run
  it (one per command) to see it fail on them. Then, for every row, search its old words **without a quote mark**, so
  a pin in double quotes, single quotes or a template is found alike, case-blind (a sentence's first word is a capital
  where it starts a pin): `git grep -n -i -F "<old words>" -- tooling/scripts/tests e2e` (e.g. `"Win-back playbook"`,
  `"playbook runs on it"`, `"broadcast or playbook run"`). A pin that reads a source file's text
  (`readCode(…).includes(…)`) moves with the source. None found is fine.

- [ ] **Step 2: Change the words** as the table says, in contracts, core, the edge and the dashboard. Then rebuild
  contracts and core (`corepack pnpm --filter @chanlytics/contracts build`, `corepack pnpm --filter @chanlytics/core
  build`) so the tests read the new `dist`. No barrel changes here, so the browser's entry stands.

- [ ] **Step 3: Sweep what is left.** Run
  `git grep -n -i -E "[\"'\`> ]playbooks?[ .,:\"'<\`)]" -- packages/contracts/src apps/dashboard/src apps/edge packages/core/src ':!apps/dashboard/src/legacy/demo' ':!*.css' ':!*.generated.ts'`
  and read every line it prints: each is a comment, an identifier, a key, an id, a closed set's member, a table name,
  Ask's (lane 4's 18B: `ask-proposals/campaigns.ts`, `act/playbook*.ts`, `read/*.ts`, `ask-text.jsx`, `palette.ts`), the
  demo's, or a word a person reads. Change any of the last the same way, with its pin; list in the report what you
  left and why.

- [ ] **Step 4: Run**, one per command: every test in the table, plus
  `tooling/scripts/tests/ask/ask-registry.test.mjs`, `tooling/scripts/tests/ask/ask-tool-names.test.mjs` (Ask's frozen
  answers must not move: none of these words is in them), `tooling/scripts/tests/repo/trade-neutral.test.mjs`,
  `tooling/scripts/tests/journey/journey.test.mjs` (lane 2's ratchet: `today-day.ts:213` keeps its count),
  `tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, then `corepack pnpm -r typecheck`. Expected: all pass;
  `git status` shows no `dist` drift after the builds.

- [ ] **Step 5: Commit** (exact files: the table's sources, their pins, `packages/contracts/dist`, `packages/core/dist`):

```bash
git commit -F - <<'EOF'
"Campaign" wherever else a person reads "playbook": Today's runs and the bell, the Inbox, a person's timeline, Reports, Settings and the refusals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 13: The composer: "Turn on <moment>" with no kind switch, its two doors, and "already has a campaign"

Decision 20 lifts the composer's freeze for three things only: a Turn on opens a sheet titled for its moment with no choice of kind (`home/new-message.tsx:98-127`); the calendar and number sentences become doors (`playbooks/composer-sections.tsx:190-194`, `playbooks/composer.tsx:104-118`); and the composer says when the moment already holds a campaign ("Visit reminder · On"). The words go to contracts.

**Files:**
- Modify: `packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts` (`LIFECYCLE_WORDS.compose`, and `momentHoldsWords`)
- Modify: `packages/contracts/src/playbooks/index.ts` (name `momentHoldsWords`), `packages/contracts/src/browser.generated.ts` (regenerated)
- Modify: `apps/dashboard/src/surfaces/campaigns/home/new-message.tsx`
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx` (`SectionCtx` gets `editingId`; `numberWarning`)
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/composer-sections.tsx` (`SectionCtx`, `whoSection`)
- Modify: `apps/dashboard/src/surfaces/campaigns/campaigns.css` (`.pb-holds`)
- Test: `tooling/scripts/tests/playbooks/playbook-composer.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/playbooks/playbook-composer.test.mjs` (its harness: `composing(over, moment, changing)` draws the composer over the sample's surface; `CampaignsHome` and `PaneSheet` are imported at its top):

```js
/* ---------------------------------- decision 20: the title, the doors, the notice ---------------------------------- */

test("a Turn on opens a sheet titled for its moment, with no kind switch; New message keeps its title and its choice", () => {
  setSurfaceValue("playbooks", playbooksSample(new Date(NOW)));
  fresh();
  const turnOn = find(again(() => CampaignsHome({ param: "new:moment:visited", nowMs: NOW })), (n) => n.type === PaneSheet);
  assert.match(String(turnOn.props.title), /^Turn on \S/, "Turn on, and the moment's campaign by name");
  assert.equal(turnOn.props.tools, undefined, "a Turn on is no choice of kind");
  fresh();
  const plain = find(again(() => CampaignsHome({ param: "new", nowMs: NOW })), (n) => n.type === PaneSheet);
  assert.equal(plain.props.title, "New message");
  assert.ok(plain.props.tools, "New message chooses between Send once and Every time a moment comes");
});

test("a moment that already holds a campaign says so as the composer opens on it; the one being changed is not news", () => {
  // The harness's surface holds no campaign (`surface()`, rows []): this one holds the file's own Win-back (`playbook()`).
  const holds = { rows: [playbook()] };
  const winback = composing(holds, "quiet_30");
  assert.match(textOf(byTestId(winback, "pb-holds")), /Win-back · On/);
  assert.equal(byTestId(composing(holds, "visited"), "pb-holds"), null, "a moment holding none says nothing");
  assert.equal(byTestId(composing(holds, null, "pb-1"), "pb-holds"), null, "changing the Win-back says nothing of itself");
});

test("the composer's calendar and number sentences are doors to where they are mended", () => {
  // A reminder being changed: a moment of the appointment, no calendar, no WhatsApp number, and it goes by WhatsApp.
  const reminder = playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow", template_id: "tpl-visit_reminder", template_name: "visit_reminder", policy_class: "booking" });
  const tree = composing(
    { rows: [reminder], calendar: "none", number: { present: false, health: { canSend: false, refusal: null } } },
    null,
    "pb-r",
  );
  const cal = byTestId(tree, "pb-calendar");
  assert.ok(cal, "a moment of the appointment, with no calendar");
  assert.match(String(byTestId(cal, "pb-calendar-door").props.href), /admin\/workspace\/calendar$/, "the calendar's own row");
  const num = byTestId(tree, "pb-number");
  assert.ok(num, "no WhatsApp number, and the campaign goes by WhatsApp");
  assert.match(String(byTestId(num, "pb-number-door").props.href), /admin\/integrations$/);
});
```
(`surface(over)` spreads `over` over a surface whose `rows` is `[]` (`playbook-composer.test.mjs:115-126` at `7ff179717`), so a test about what a moment holds, or a campaign being changed, puts the file's own `playbook()` fixture (l.89) in `rows`; `composing(over, moment, changing)` finds the one changed by its id among them. If the reminder's channels do not keep WhatsApp in the composer's model, give `reminder` `channels: ["whatsapp"]`, as the file's other WhatsApp tests do (`grep -n "channels:" tooling/scripts/tests/playbooks/playbook-composer.test.mjs`). If lane 2's D44 already takes the calendar sentence out for a calendar-less workspace, keep the `pb-calendar` assertions only for the editing case this test draws.)

- [ ] **Step 2: Run them and see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs`
Expected: the three new tests FAIL (title "New message"; no `pb-holds`; no door).

- [ ] **Step 3: The words, in contracts**

In `packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts`, inside `LIFECYCLE_WORDS.compose` (after `every`), add:

```ts
    /** The sheet a moment's Turn on opens, titled for the campaign it starts (spec §4.2): "Turn on Visit reminder". */
    turnOn: (name: string): string => `Turn on ${name}`,
    /** A campaign the moment already holds, said as the composer opens on it (decision 20): "Visit reminder · On". */
    holds: (name: string, paused: boolean): string => `${name} · ${paused ? "Paused" : "On"}`,
    /**
     * The composer's two sentences that name a setting, each with its door to it (spec §4.2): the calendar's is the one
     * "Needs your calendar" opens (Settings › Business, the calendar's row), with its words; the number's is Connections.
     */
    calendar: {
      words: "This moment reads your calendar: a run can send once it is connected.",
      door: { label: NEEDS_CALENDAR.door, to: CALENDAR_SETTING_ROUTE },
    },
    number: {
      words: "No WhatsApp number is connected yet: a run cannot send by WhatsApp until one is.",
      door: { label: "Open Connections", to: CHANNELS_DOOR },
    },
```
An object literal cannot read a key of itself, so lift lane 2's `needsCalendar` entry out of `LIFECYCLE_WORDS` into a constant above it, and point the entry at it (one spelling of the door's words):
```ts
/** An appointment moment where no calendar feeds it (decision 44): what it says instead of a figure, and its door's words. */
const NEEDS_CALENDAR = { none: "Needs your calendar", email: "Needs your calendar feed", door: "Connect your calendar" } as const;
```
and inside `LIFECYCLE_WORDS`: `needsCalendar: NEEDS_CALENDAR,` (keeping lane 2's comment above it). Imports at the top, by their paths from `lifecycle/`: `import { CHANNELS_DOOR } from "../../broadcasts/channels-standing";` and `import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";` (lane 2's `lifecycle-ledger.ts` imports the latter the same way). Check `NEEDS_CALENDAR` is a free name first (`git grep -n "NEEDS_CALENDAR" -- apps packages`).

After `LIFECYCLE_TOAST`, add:

```ts
/**
 * What a moment already holds, said in the composer opened on it (decision 20): one line per campaign on the same moment
 * ("Visit reminder · On", "Win-back · Paused"), the campaign being changed left out; none for a moment that holds none,
 * and none for a list (a list holds as many campaigns as it is given, and that is no news). The win-back's two moments
 * are one, as the rail groups them (isWinBack).
 */
export function momentHoldsWords(
  rows: readonly { id: string; name: string; trigger: string; state: string }[],
  trigger: string,
  editing: string | null,
): string[] {
  // "On a list" (decision 0009) is the one trigger of kind `saved`: each of its campaigns names its own list.
  if (triggerOf(trigger)?.kind === "saved") return [];
  const same = (t: string) => t === trigger || (isWinBack(t) && isWinBack(trigger));
  return rows
    .filter((p) => p.id !== editing && same(p.trigger))
    .map((p) => LIFECYCLE_WORDS.compose.holds(p.name, p.state !== "running"));
}
```
importing `isWinBack` and `triggerOf` from `../playbook-triggers` beside `SENDING_HOURS_WORDS` (a trigger's `list` field is the People list it reads, `quiet` for the win-back, so it is no test of "a list"; `kind: "saved"` is: `playbook-triggers.ts`, `saved_list`). Name `momentHoldsWords` in `packages/contracts/src/playbooks/index.ts`. Check the name is free: `git grep -n "momentHoldsWords" -- apps packages` prints nothing before you add it.

Add to `tooling/scripts/tests/playbooks/home/ledger.test.mjs` (lane 2's; contracts is `C` there) a test of it:
```js
test("the composer says what a moment already holds, never the campaign being changed nor a list's", () => {
  const rows = [
    { id: "a", name: "Win-back", trigger: "quiet_30", state: "running" },
    { id: "b", name: "Old win-back", trigger: "lapsed", state: "paused" },
    { id: "c", name: "Visit reminder", trigger: "visit_tomorrow", state: "running" },
  ];
  assert.deepEqual(C.momentHoldsWords(rows, "quiet_30", null), ["Win-back · On", "Old win-back · Paused"]);
  assert.deepEqual(C.momentHoldsWords(rows, "quiet_30", "a"), ["Old win-back · Paused"]);
  assert.deepEqual(C.momentHoldsWords(rows, "visited", null), []);
  assert.deepEqual(
    C.momentHoldsWords([...rows, { id: "d", name: "Spring list", trigger: "saved_list", state: "running" }], "saved_list", null),
    [],
    "a list holds as many as it is given",
  );
});
```
(`quiet_30` and `lapsed` are the win-back's two moments: `playbook-triggers.ts`, `WIN_BACKS`.)

- [ ] **Step 4: Build contracts**

Run:
```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
```
Expected: PASS ×2. `momentHoldsWords` is a new value in the playbooks barrel, which `composer-sections.tsx` imports: without the regenerated entry the page does not build.

- [ ] **Step 5: The sheet's title and no switch**

In `apps/dashboard/src/surfaces/campaigns/home/new-message.tsx`, add above `NewMessage`:

```tsx
/**
 * The sheet's title: "Turn on Visit reminder" where a moment's Turn on opened it, named as the campaign it would start (the
 * moment's own name while it holds none, by the workspace's word); New message otherwise, and where the moment already
 * holds a campaign, whose name is no title for a second (the composer says it holds one: decision 20).
 */
function composeTitleOf(compose: Compose, home: LifecycleHome): string {
  const W = LIFECYCLE_WORDS.compose;
  if (compose.mode !== "every" || compose.edit || !compose.moment) return W.title;
  const stage = home.rail.stages.find((s) => s.moment === compose.moment);
  return stage && stage.state === "off" ? W.turnOn(stage.name) : W.title;
}
```
and in `NewMessage`: `title={composeTitleOf(compose, p.home)}`, and the switch only for a new message on no moment:
```tsx
      tools={
        compose.mode === "every" && (compose.edit || compose.moment) ? undefined : (
          <Segmented … unchanged … />
        )
      }
```
(Update the header's "Changing a playbook is not choosing a kind: the choice is drawn only for a new message" to "Changing a campaign, or turning a moment on, is not choosing a kind: the choice is drawn only for a new message on no moment, and a Turn on's sheet is titled for its moment".)

- [ ] **Step 6: The notice and the doors**

In `apps/dashboard/src/surfaces/campaigns/playbooks/composer-sections.tsx`:
1. `SectionCtx` (~line 58) gains `editingId: string | null;` beside `editingTemplateName`.
2. Import `LIFECYCLE_WORDS, momentHoldsWords` from `@chanlytics/contracts` (into the existing import list).
3. In `whoSection`, after `{momentPicker(x)}`:
```tsx
      {/* What the moment already holds (decision 20): a second campaign on it is allowed, and said, never a surprise. */}
      {momentHolds(x)}
```
with, above `whoSection`:
```tsx
/** The campaigns the chosen moment already holds, one line each: "Visit reminder · On". None where it holds none. */
function momentHolds(x: SectionCtx) {
  const holds = momentHoldsWords(x.data.rows, x.f.trigger, x.editingId);
  if (holds.length === 0) return null;
  return (
    <p className="pb-holds" data-testid="pb-holds">
      {holds.map((h) => (
        <span key={h}>{h}</span>
      ))}
    </p>
  );
}
```
4. The calendar sentence (~line 190-194) becomes:
```tsx
      {visits && data.calendar !== "ok" && (
        <p className="pb-warn" data-testid="pb-calendar">
          {LIFECYCLE_WORDS.compose.calendar.words}{" "}
          <LinkButton {...routeDoor(LIFECYCLE_WORDS.compose.calendar.door.to)} data-testid="pb-calendar-door">
            {LIFECYCLE_WORDS.compose.calendar.door.label}
          </LinkButton>
        </p>
      )}
```
In `apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx`:
1. In the `x: SectionCtx` literal, add `editingId: editing ? editing.id : null,` beside `editingTemplateName`.
2. `numberWarning` (~lines 104-118) becomes:
```tsx
/**
 * What stops a run from sending from the number: a number that cannot send, or none. Said while the playbook goes by
 * WhatsApp, the one channel that has a number; one that goes by email alone never asks. Each says it with its door to
 * Settings › Connections, where it is mended (decision 20).
 */
function numberWarning({ data, kept }: SectionCtx) {
  if (!data.number || !kept.includes("whatsapp")) return null;
  const W = LIFECYCLE_WORDS.compose.number;
  const door = (
    <LinkButton {...routeDoor(W.door.to)} data-testid="pb-number-door">
      {W.door.label}
    </LinkButton>
  );
  if (data.number.present && !data.number.health.canSend)
    return (
      <p className="pb-warn" data-testid="pb-number">
        {data.number.health.refusal} {door}
      </p>
    );
  // Where nothing can send at all, the Send by row has already said so, WhatsApp's number among its doors.
  return data.number.present || cmNothingOpen(data.ready) ? null : (
    <p className="pb-warn" data-testid="pb-number">
      {W.words} {door}
    </p>
  );
}
```
with imports `LIFECYCLE_WORDS` from `@chanlytics/contracts`, `LinkButton` from `../../kit/link-button/link-button` and `routeDoor` from `../../legacy-verbs` (beside `canDo`). (`routeDoor` and `LinkButton` are already in this page's bundle.)

In `apps/dashboard/src/surfaces/campaigns/campaigns.css`, beside the composer's `.pb-warn` rules (`grep -n "^\.pb-warn" apps/dashboard/src/surfaces/campaigns/campaigns.css`), add (check `pb-holds` absent first):
```css
/* What the moment already holds (decision 20): one quiet line per campaign under the moment's choice. */
.pb-holds {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--ink-dim);
}
```

- [ ] **Step 7: Run every test of the composer**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/moments-offered.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-drafts.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-glass.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/visit-playbooks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcasts-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/e2e/e2e-harness-campaigns.test.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
```
Expected: PASS. A test that matched the old sentences ("A visit moment reads the calendar", "No WhatsApp number connected — connect one in Settings › Connections") now matches the new words from `LIFECYCLE_WORDS.compose` (assert against the constant, not a copy of its text).

- [ ] **Step 8: Format, lint, commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/playbooks apps/dashboard/src/surfaces/campaigns/home/new-message.tsx apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx apps/dashboard/src/surfaces/campaigns/playbooks/composer-sections.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/playbook-composer.test.mjs
corepack pnpm exec eslint apps/dashboard/src/surfaces/campaigns packages/contracts/src/playbooks
git add packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist apps/dashboard/src/surfaces/campaigns/home/new-message.tsx apps/dashboard/src/surfaces/campaigns/playbooks/composer.tsx apps/dashboard/src/surfaces/campaigns/playbooks/composer-sections.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/playbook-composer.test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
git commit -F - <<'EOF'
A Turn on's sheet is titled for its moment, the composer's settings sentences are doors, and it says what a moment already holds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 14: Doors that land (§4.6): the bell's reach-out day, Ask's new campaign, Today's one door

One landing rule: a door opens what it names. A campaign's drawer (from a name: Tasks 7-10), a run (Coming up, Sent: unchanged), a thing just made scrolled to and washed (Task 10). This task moves the three doors that still open the bare home: the bell's reach-out day (`packages/contracts/src/today/notifications.ts:461`, and the edge that writes its row, `apps/edge/lib/reach-out/day-numbers.ts:46`) opens `campaigns/in:reach_out`; Ask's playbook card (`packages/contracts/src/ask-proposals/campaigns.ts:119`) opens the new campaign's drawer from `outcome.undo`, as the list card does (`ask-proposals/lists.ts:47-50`); and Today's follow-up card carries one door to `campaigns/new:moment:visit_tomorrow` (decision 22: at the first run's payoff, no new first-run step).

**Files:**
- Modify: `packages/contracts/src/today/notifications.ts` (+ `packages/contracts/src/today/index.ts`, and `packages/contracts/src/browser.generated.ts` regenerated)
- Modify: `apps/edge/lib/reach-out/day-numbers.ts:46`
- Modify: `packages/contracts/src/ask-proposals/campaigns.ts:119`
- Modify: `packages/contracts/src/setup/first-run.ts` (`SetupCardVM`, `setupCardOf`) (+ `packages/contracts/src/setup/index.ts`)
- Modify: `apps/dashboard/src/surfaces/today/pages/setup-card.tsx`
- Modify: `apps/dashboard/src/legacy/styles/dashboard-a-v2.css` (beside `.today-setup`, ~line 1180)
- Test: `tooling/scripts/tests/today/bell-rows.test.mjs`, `tooling/scripts/tests/reach-out-back/day-numbers.test.mjs:55-69`, `tooling/scripts/tests/ask/ask-specs.test.mjs`, `tooling/scripts/tests/setup/first-run.test.mjs`, `tooling/scripts/tests/today/today-doors.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/today/bell-rows.test.mjs` (main changed it in #1526: read it first), append the test below. It imports contracts' members by name (`import { …, serverNotificationRows, … } from "@chanlytics/contracts"`): add `REACH_OUT_DAY_ROUTE` to that list, and write the test's `contracts.REACH_OUT_DAY_ROUTE` and `contracts.serverNotificationRows` as the bare names.

```js
test("the day's reach-out numbers open Campaigns at its Reach-outs, whatever route the row was kept with", () => {
  const rows = contracts.serverNotificationRows({
    seen_at: null,
    notifications: [
      { id: "n1", kind: "reach_out_day", title: "Today's reach-outs", body: "1 bounced.", route: "outbound", created_at: "2026-09-28T22:00:00Z", read: false, dismissed: false, subject_type: "reach_out_day", subject_id: "2026-09-28" },
      { id: "n2", kind: "reach_out_day", title: "Today's reach-outs", body: "1 bounced.", route: contracts.REACH_OUT_DAY_ROUTE, created_at: "2026-09-29T22:00:00Z", read: false, dismissed: false, subject_type: "reach_out_day", subject_id: "2026-09-29" },
    ],
  });
  assert.equal(contracts.REACH_OUT_DAY_ROUTE, "campaigns/in:reach_out");
  assert.deepEqual(rows.map((r) => r.to), ["campaigns/in:reach_out", "campaigns/in:reach_out"], "a row kept before this lands there too");
  assert.deepEqual(rows.map((r) => r.action), ["Open Campaigns", "Open Campaigns"]);
});
```
(If the file's other tests build a `NotificationDto` with more fields, copy one of theirs and change `kind`, `route` and the subject.)

In `tooling/scripts/tests/reach-out-back/day-numbers.test.mjs` (~lines 63 and 67), the two expected `"outbound"` routes become `"campaigns/in:reach_out"`.

In `tooling/scripts/tests/ask/ask-specs.test.mjs`, after the `playbook_channels` test (~line 370):

```js
test("Ask's new campaign opens its drawer once it is made, by the id the route answered; before then the home", () => {
  const spec = PROPOSAL_SPECS.playbook;
  assert.equal(spec.open(card("playbook", {}), done({ playbook_id: "pb9", decision_id: "d9" })), "campaigns/moment:pb9");
  assert.equal(spec.open(card("playbook", {}), null), "outbound", "not approved yet: the home, where the old address lands");
  assert.equal(spec.open(card("playbook", {}), done(null)), "outbound");
});
```
(The frozen table `OPEN.playbook` stays `"outbound"`: none of its `CASES` carries a `playbook_id` in its undo.)

In `tooling/scripts/tests/setup/first-run.test.mjs`, beside the `setupCardOf` tests (~line 312, which build `live()`):

```js
test("after the first run, with the calendar in, Today's card carries one door to the appointment reminder; never before", () => {
  const before = setupCardOf(setupSteps(empty(), NOW));
  assert.equal(before.remind, null, "while a step is open, the card is the first run's");
  const live = setupCardOf(setupSteps(liveWithCalendar(), NOW));
  assert.deepEqual(live.remind, {
    words: "Your calendar is in. Remind tomorrow's customers of their appointment too?",
    label: "Turn on",
    to: "campaigns/new:moment:visit_tomorrow",
  });
  const noCalendar = setupCardOf(setupSteps(liveWithoutCalendar(), NOW));
  assert.equal(noCalendar?.remind ?? null, null, "no calendar: no reminder to offer");
});
```
Define `liveWithCalendar` and `liveWithoutCalendar` just above the test from the file's own `live()` builder: `const liveWithCalendar = () => live({ calendar: { …the shape its calendar tests give a connected calendar… } })` and `const liveWithoutCalendar = () => live({ calendar: { …state "none"… } })` (`grep -n "calendar:" tooling/scripts/tests/setup/first-run.test.mjs` shows the shape `SetupDto.calendar` takes there; `packages/contracts/src/setup/setup.ts:55` is its type).

In `tooling/scripts/tests/today/today-doors.test.mjs`, in "the card once it answers: …" (~line 429), after the card is drawn with a calendar connected, assert the door:
```js
  const remind = find(card, (n) => n.props?.["data-testid"] === "today-setup-remind-go");
  assert.ok(remind, "one door to the appointment reminder");
  assert.match(String(remind.props.href), /campaigns\/new:moment:visit_tomorrow$/);
```
(If that test's setup has no calendar, add a sibling test drawing `TodaySetup` over a setup surface whose calendar row is ready, as the file's `card()` helper draws it.)

- [ ] **Step 2: Run them and see them fail**

Run, one per command:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/bell-rows.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/day-numbers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/setup/first-run.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-doors.test.mjs
```
Expected: each FAILs on its new assertion.

- [ ] **Step 3: The bell's reach-out day**

In `packages/contracts/src/today/notifications.ts`, above `SERVER_LOOK`:
```ts
/**
 * Where the day's reach-out numbers open (spec 2026-10-09 §4.6): Campaigns narrowed to its Reach-outs, the chains the
 * numbers are about. The edge writes it on the row; a row kept before then says `outbound`, and opens here too.
 */
export const REACH_OUT_DAY_ROUTE = "campaigns/in:reach_out";
```
In `SERVER_LOOK`, `reach_out_day: { icon: "mail", tone: "", action: "Open Campaigns", to: REACH_OUT_DAY_ROUTE },` (and its comment: "with the chains on Campaigns, at its Reach-outs"). In `serverNotificationRows`, the route:
```ts
      // The day's reach-out numbers open the Reach-outs, whatever route their row was kept with.
      const route = job ? job.route : n.kind === "reach_out_day" ? REACH_OUT_DAY_ROUTE : n.route;
```
Name `REACH_OUT_DAY_ROUTE` in `packages/contracts/src/today/index.ts`. In `apps/edge/lib/reach-out/day-numbers.ts`, import it beside `reachOutDayWords` (`import { REACH_OUT_DAY_ROUTE, reachOutDayWords } from "../packages/contracts.js";`) and write `route: REACH_OUT_DAY_ROUTE,`. Either deploy order works: an older dashboard reads `campaigns/in:reach_out` as the home (its `parseHome` knows no `in:`), and this one reads an older row's `outbound` as the Reach-outs.

- [ ] **Step 4: Ask's new campaign opens its drawer**

In `packages/contracts/src/ask-proposals/campaigns.ts`, `playbookSpec.open` (line 119) becomes:
```ts
  // The new campaign's drawer on Campaigns' home once it is made (spec §4.6, one landing rule), by the id its commit kept
  // for the undo, as the list card opens the list it made; before then the home, where the old Playbooks address lands.
  open: (_card, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  },
```
(`idIn` and `rec` are already imported there.)

- [ ] **Step 5: Today's one door**

In `packages/contracts/src/setup/first-run.ts`:
1. `SetupCardVM` gains:
```ts
  /**
   * After the first run, with the calendar in: the one door to the appointment reminder, at the payoff (decision 22:
   * no new first-run step). Null while a step is open, and without a calendar, which the reminder reads.
   */
  remind: { words: string; label: string; to: string } | null;
```
2. Beside `CARD_SKIP`:
```ts
/** Today's door to the reminder (decision 22): the composer opened on the day-before moment. */
const CARD_REMIND = {
  words: "Your calendar is in. Remind tomorrow's customers of their appointment too?",
  label: "Turn on",
  to: "campaigns/new:moment:visit_tomorrow",
} as const;
```
3. In `setupCardOf`, the first-run branch returns `remind: null`, and the rows branch:
```ts
  const calendar = rowOf(vm, "calendar");
  return {
    title: FINISH_SETTING_UP,
    left: `${rows.length} left`,
    start: null,
    rows,
    hide: { put: "Hide", said },
    skip: CARD_SKIP,
    remind: calendar && calendar.state === "ready" ? { ...CARD_REMIND } : null,
  };
```
(Check `CARD_REMIND` is a free name: `git grep -n "CARD_REMIND" -- packages apps`.)

In `apps/dashboard/src/surfaces/today/pages/setup-card.tsx`, import `Button` from `../../kit/button/button` and `routeDoor` from `../../legacy-verbs`, and after `{card.start ? startRow(…) : optionalRows(…)}`:
```tsx
      {card.remind ? (
        <p className="today-setup-remind" data-testid="today-setup-remind">
          <span>{card.remind.words}</span>
          <Button size="sm" {...routeDoor(card.remind.to)} data-testid="today-setup-remind-go">
            {card.remind.label}
          </Button>
        </p>
      ) : null}
```
In `apps/dashboard/src/legacy/styles/dashboard-a-v2.css`, after `.today-setup .setup-chooser { … }` (~line 1185), add (check `today-setup-remind` absent first):
```css
/* After the first run, the one door to the appointment reminder (decision 22), under the card's rows. */
.today-setup-remind { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin: 0; padding: var(--space-2) 0; font-size: var(--text-sm); color: var(--ink-muted); }
```

- [ ] **Step 6: Build and run**

Run:
```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/bell-rows.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/day-numbers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/setup/first-run.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-doors.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/notifications-durable.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ops/notify-transport.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
corepack pnpm -r typecheck
```
Expected: PASS ×9, typecheck clean. (`REACH_OUT_DAY_ROUTE` is a new value in the today barrel: the browser's entry is regenerated before the build.) `code-health-ratchets` holds `dashboard-a-v2.css`'s literal values: the rule above reads tokens only.

- [ ] **Step 7: Format, lint, commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/today packages/contracts/src/ask-proposals/campaigns.ts packages/contracts/src/setup apps/edge/lib/reach-out/day-numbers.ts apps/dashboard/src/surfaces/today/pages/setup-card.tsx apps/dashboard/src/legacy/styles/dashboard-a-v2.css tooling/scripts/tests/today tooling/scripts/tests/reach-out-back/day-numbers.test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs tooling/scripts/tests/setup/first-run.test.mjs
corepack pnpm lint
git add packages/contracts/src/today packages/contracts/src/ask-proposals/campaigns.ts packages/contracts/src/setup packages/contracts/src/browser.generated.ts packages/contracts/dist apps/edge/lib/reach-out/day-numbers.ts apps/dashboard/src/surfaces/today/pages/setup-card.tsx apps/dashboard/src/legacy/styles/dashboard-a-v2.css tooling/scripts/tests/today/bell-rows.test.mjs tooling/scripts/tests/today/today-doors.test.mjs tooling/scripts/tests/reach-out-back/day-numbers.test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs tooling/scripts/tests/setup/first-run.test.mjs
git commit -F - <<'EOF'
Doors land on what they name: the bell's reach-out day on Campaigns' Reach-outs, Ask's new campaign on its drawer, Today on the reminder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 15: What customers of every trade read says "appointment" (D6), held; the page's own "visit"s, and lane 2's ratchet banked

Decision 6: neutral customer-facing words now. The consent and unsubscribe pages (`packages/contracts/src/consent/consent-page.ts:217, 275`; `consent/offers-unsubscribe.ts:70-110`), the email foot (`templates/sender-words.ts:51, 64`) and one starter body (`templates/starter-templates.ts:473`, a retired starter, so nothing is resubmitted to Meta) say "appointment" ("cita"). The consent label "Visit messages" (`people/person/settings-card.tsx`) is **not** renamed (D6). The A2P campaign's facts quote the consent page's heading word for word (`apps/edge/lib/lines/a2p-campaign-facts.ts:280`), so they read it from the one constant. Then the holds: an executed test that every one of those builders says no "visit"; the Campaigns strings that still say it (the drawer's, the composer's) say appointment; and lane 2's ratchet over every string a person reads (`tooling/scripts/tests/journey/journey.test.mjs`, `baselines/appointment-words.json`, spec §4.8) banks what fell.

**Files:**
- Modify: `packages/contracts/src/consent/consent-page.ts` (+ `packages/contracts/src/consent/index.ts`, and `packages/contracts/src/browser.generated.ts` regenerated), `packages/contracts/src/consent/offers-unsubscribe.ts`, `packages/contracts/src/templates/sender-words.ts`, `packages/contracts/src/templates/starter-templates.ts:473`
- Modify: `apps/edge/lib/lines/a2p-campaign-facts.ts:280`
- Modify (their pins): `tooling/scripts/tests/broadcasts/broadcast-by-channel.test.mjs:266`, `tooling/scripts/tests/broadcasts/core-broadcast.test.mjs:1189, 1264`, `tooling/scripts/tests/broadcasts/preview-by-channel.test.mjs:206`, `tooling/scripts/tests/consent/email-offers.test.mjs:619, 705, 708, 716, 763, 837`, `tooling/scripts/tests/email/unsubscribe-offers.test.mjs:117, 132, 176, 303`, `tooling/scripts/tests/lines/campaign-facts.test.mjs:30, 57`, `tooling/scripts/tests/playbooks/playbook-composer.test.mjs:1226`
- Test: `tooling/scripts/tests/repo/trade-neutral.test.mjs` (append)
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx:297`, `playbooks/composer-sections.tsx:462-464`, `playbooks/words.tsx:243` (and their pins)
- Bank: `tooling/scripts/tests/baselines/appointment-words.json` (lane 2's), and the measured blocks of `docs/debt.md` and `docs/takeover.md` if the bank rewrites them

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/repo/trade-neutral.test.mjs`:

```js
test("what a customer of any trade reads says appointment, never one trade's visit (decision 6)", async () => {
  const c = await import("@chanlytics/contracts");
  const VISIT = /(?<![\w-])visit(?:a)?s?(?![\w-])/i;
  const page = c.consentPageVM({ businessName: "Harbor Studio", whatsappE164: "+13055550100", smsE164: "+13055550100" });
  const consent = [page.title, page.lead, ...page.asks.flatMap((a) => [a.title, a.lead, ...a.terms])];
  const unsubscribe = ["en", "es"].flatMap((language) =>
    ["ask", "done", "stop_ask", "stopped"].flatMap((kind) => {
      const w = c.offerUnsubscribeWords({ kind, business: "Harbor Studio" }, language);
      return [w.title, w.lead, w.body, w.foot ?? ""];
    }),
  );
  const foot = Object.values(c.SENDER_WORDS).flatMap((w) => [
    w.visitProposal("Harbor Studio"),
    w.visitBooked("Harbor Studio"),
    w.visitInTouch("Harbor Studio"),
  ]);
  const starters = c.STARTER_TEMPLATES.flatMap((s) => Object.values(s.texts ?? {}).map((t) => t.body));
  const said = [...consent, ...unsubscribe, ...foot, ...starters];
  assert.ok(said.length > 20, "the builders were read");
  assert.deepEqual(
    said.filter((s) => VISIT.test(s)),
    [],
    "a customer reads the glossary's word, appointment (cita), whatever the business's trade",
  );
  assert.equal(c.CONVERSATIONAL_ASK_TITLE, "Messages about your appointment", "the consent page's heading, in one place");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs`
Expected: FAIL, listing "Messages about your visit", "…messages about your visits.", "…because of your visit with Harbor Studio.", "Recibes esto por tu visita con Harbor Studio.", the starter's "…your next visit…".

- [ ] **Step 3: Change the words**

1. `packages/contracts/src/consent/consent-page.ts`: above `askWords` (~line 205),
```ts
/**
 * The heading of the ask for messages about a person's own appointments, on the public page and its paper form, and in
 * the A2P campaign's facts, which quote the page word for word (apps/edge/lib/lines/a2p-campaign-facts.ts): the glossary's
 * word, appointment, whatever the trade (decision 6 of the spec of 9 October 2026).
 */
export const CONVERSATIONAL_ASK_TITLE = "Messages about your appointment";
```
`askWords`' `conversational.title` becomes `CONVERSATIONAL_ASK_TITLE`, and line ~275's lead `…your own phone: messages about your visit. ${name} never sells…` becomes `…your own phone: messages about your appointment. ${name} never sells…`. Name `CONVERSATIONAL_ASK_TITLE` in `packages/contracts/src/consent/index.ts`. (Check the name is free: `git grep -n "CONVERSATIONAL_ASK_TITLE" -- apps packages`.)
2. `packages/contracts/src/consent/offers-unsubscribe.ts`: lines 70, 76, 82 say "visits" → "appointments" ("You'll still get messages about your appointments.", "That includes reminders and confirmations about your appointments. …"); lines 98, 104, 110 say "visitas" → "citas" ("Seguirás recibiendo mensajes sobre tus citas.", "Eso incluye los recordatorios y las confirmaciones de tus citas. …").
3. `packages/contracts/src/templates/sender-words.ts`: line 51 `` `You're getting this because of your appointment with ${who}.` ``; line 64 `` `Recibes esto por tu cita con ${who}.` ``. (The member keeps its name, `visitBooked`: a name is not copy.)
4. `packages/contracts/src/templates/starter-templates.ts:473`: "When you're ready for your next appointment, pick a time here: {{3}}." (Its Spanish already says "cita".)
5. `apps/edge/lib/lines/a2p-campaign-facts.ts:280`: `` …public: under "${CONVERSATIONAL_ASK_TITLE}" it states that… `` with `import { CONVERSATIONAL_ASK_TITLE } from "../packages/contracts.js";` (the edge's contracts door re-exports the package whole). The facts' flow is chosen to fit 2,048 characters (`MESSAGE_FLOW_MAX`): six characters longer may pick the shorter variant for a long name; `campaign-facts.test.mjs` says which.

- [ ] **Step 4: Move the pins to the new words**

Each line below matched the old words; it now matches the new (exact replacements):
- `broadcasts/broadcast-by-channel.test.mjs:266`, `broadcasts/core-broadcast.test.mjs:1189` and `:1264`, `consent/email-offers.test.mjs:619`, `playbooks/playbook-composer.test.mjs:1226`: "You're getting this because of your visit with" → "You're getting this because of your appointment with".
- `broadcasts/preview-by-channel.test.mjs:206`: "You're getting this because of your visit" → "You're getting this because of your appointment".
- `consent/email-offers.test.mjs:705` and `email/unsubscribe-offers.test.mjs:117`, `:132`: "messages about your visits" → "messages about your appointments".
- `consent/email-offers.test.mjs:708`: `"You'll still get messages about your appointments."`.
- `consent/email-offers.test.mjs:716` and `email/unsubscribe-offers.test.mjs:176`: "reminders and confirmations about your visits" → "reminders and confirmations about your appointments".
- `consent/email-offers.test.mjs:763`: "Recibes esto por tu visita con" → "Recibes esto por tu cita con".
- `consent/email-offers.test.mjs:837` and `email/unsubscribe-offers.test.mjs:303`: "sobre tus visitas" → "sobre tus citas".
- `lines/campaign-facts.test.mjs:30` and `:57`: `under "Messages about your visit"` → `under "Messages about your appointment"`.

- [ ] **Step 5: Build, run the words' tests**

Run, one per command (`CONVERSATIONAL_ASK_TITLE` is a new value in the consent barrel: the browser's entry is regenerated before the build):
```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcast-by-channel.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/core-broadcast.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/preview-by-channel.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/consent/email-offers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/consent/consent-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/consent/marketing-consent.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/public/public-page-titles.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/email/unsubscribe-offers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/campaign-facts.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs
git grep -l -i -E "about your visit|your visit with|tus visitas|tu visita con|your next visit" -- tooling/scripts/tests e2e
```
Expected: PASS ×13. The last command prints only fixtures that are not these builders' words (`ai/money-and-prices`, `ask/ask-turn`, `new-conversation/write-ways`: their own made-up message bodies); leave those. If `campaign-facts` fails on the 2,048-character fit for its long-name case, the variant it picks changed: assert the variant the facts now pick, and say so in the commit message (it is the carriers' text, and the change is the page's own heading).

- [ ] **Step 6: The page's own "visit" strings**

Lane 2's ratchet (`tooling/scripts/tests/journey/journey.test.mjs`, `baselines/appointment-words.json`) counts, per file, the strings a person reads that say "visit"; its plan leaves "the drawer's and the composer's" to this lane. **One page, one word** (spec §4.8 names the drawer and the composer): these say **the workspace's word**, never a fixed "appointment", since a workspace where deals are on reads "meeting" (lane 2's `appointmentWordOf`). The word is the playbooks surface's `shape.word` (lane 2), its phrases contracts' `appointmentWords(word)` (`.one`, `.many`, `.tomorrowWho`). Find the strings: `git grep -n -i -E "visit(s|ed)?\b" -- apps/dashboard/src/surfaces/campaigns ':!*.css'`, and skip comments, identifiers and ids such as `visit_tomorrow`:

- `playbooks/card-detail.tsx:297` (the pool's tip): "Everyone with a recorded yes — the day's visits are picked from them · click to open them in People" → `` `Everyone with a recorded yes — the day's ${W.many} are picked from them · click to open them in People` ``, `W = appointmentWords(word)`. The card reads its surface already (`useCard`: `useSurface("playbooks")`): carry `word: surface?.shape.word ?? "appointment"` on the `CardCtx` that `cardRead` builds, beside what it reads of the surface (lane 2's own fallback word where the surface is not read yet).
- `playbooks/composer-sections.tsx:462`: `"everyone with a visit the next day"` → `W.tomorrowWho` ("everyone with an appointment tomorrow"); `:464` the text `— one message per visit.` → `` — one message per {W.one}. `` (`W = appointmentWords(x.data.shape.word)`; `x.data` is the playbooks surface).
- `playbooks/words.tsx:243` (`pbGuardWords`): `"One message per visit."` → `` `One message per ${W.one}.` ``. `pbGuardWords` has four parameters, the surfaces' limit: widen its first, `kind: string`, to `on: { kind: string; word: AppointmentWord }`, never a fifth, and give each caller (`git grep -n "pbGuardWords" -- apps/dashboard/src`) the surface's word.
- (`composer-sections.tsx:192`'s sentence left with Task 13; `playbooks/sample.ts`'s "Visit reminder" is the demo's own campaign name and stays.)

Find their pins and move them: `git grep -n -i -E "day's visits are picked|everyone with a visit the next day|one message per visit" -- tooling/scripts/tests e2e`, each to the words its fixture's word makes (a fixture with no `shape` reads "appointment").

- [ ] **Step 7: Bank what fell in lane 2's ratchet**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
```
Expected: the ratchet FAILs on falls only (the consent page, the unsubscribe page, the email's foot, the starter, the drawer's and the composer's words: each file's count lower than its baseline), never a rise. Bank them:
```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
```
Expected: the last two PASS. Say in the commit message how many strings fell, and from what total. (A rise means a new string says visit: say appointment there instead, never raise.)

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/consent packages/contracts/src/templates/sender-words.ts packages/contracts/src/templates/starter-templates.ts packages/contracts/src/browser.generated.ts packages/contracts/dist apps/edge/lib/lines/a2p-campaign-facts.ts apps/dashboard/src/surfaces/campaigns/playbooks tooling/scripts/tests/repo/trade-neutral.test.mjs tooling/scripts/tests/baselines/appointment-words.json docs/debt.md docs/takeover.md tooling/scripts/tests/broadcasts/broadcast-by-channel.test.mjs tooling/scripts/tests/broadcasts/core-broadcast.test.mjs tooling/scripts/tests/broadcasts/preview-by-channel.test.mjs tooling/scripts/tests/consent/email-offers.test.mjs tooling/scripts/tests/email/unsubscribe-offers.test.mjs tooling/scripts/tests/lines/campaign-facts.test.mjs tooling/scripts/tests/playbooks/playbook-composer.test.mjs
git commit -F - <<'EOF'
Customers of every trade read "appointment" on the consent and unsubscribe pages, in the email's foot and the last starter, and the word is held

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 16: The two e2e specs: heads on the line, counts read from the answer, rows decide runs, J3

The nightly runs these against production in the suite's own workspace (`e2e/session.ts`); they cannot run here without its session, so this task writes them and proves they compile and list. They change because the page changed: phone.spec's pinned stages become "heads on the line, rows under them" (decision 16); playbooks.spec's stage count is read from the answer (spec §4.8: the journey follows the business), its waiting run is read on its row (decision 14), and its 901-1440px test holds J3's one scrolling line.

**Files:**
- Modify: `e2e/shell/phone.spec.ts:296-345` (at `7ff179717`; main's #1526 changed this file, so find the test by its title)
- Modify: `e2e/campaigns/playbooks.spec.ts:1-14, 30-110, 196-232` and a new test

- [ ] **Step 1: phone.spec, heads on the line**

Replace the test that starts `test("Campaigns: every control on the home is inside the screen, the moments stand down a line, …"` and its comment (~lines 296-345) with:

```ts
  /**
   * Campaigns' home on a phone (decision 16 of the spec of 9 October 2026): the moments are the one list's spine, each
   * moment's head on the line, one under another, its campaigns under it; the tiles are one column; every control is
   * inside the screen; and New message, the page's act, is whole on the first screen. Its composer, in a sheet from the
   * bottom, holds nothing past the edge either.
   */
  test("Campaigns: every control on the home is inside the screen, the moments' heads stand down a line with their campaigns under them, and the page opens on the work", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    const home = page.getByTestId("campaigns-home");
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("data-phone", "true");
    await expect(page.getByTestId("cmh-new")).toBeInViewport({ ratio: 1 });
    // Heads on the line: each moment's head is below the one before it, never two on one line.
    const heads = home.locator('[data-testid="cmh-group-head"][data-stage]');
    expect(await heads.count()).toBeGreaterThanOrEqual(4);
    const tops = await heads.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(tops, "the moments stand one under another").toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops.map(Math.round)).size, "no two moments on one line").toBe(tops.length);
    // Rows under them: every campaign of a group stands below its group's head.
    const underTheirHeads = await home.getByTestId("cmh-group").evaluateAll((groups) =>
      groups.every((g) => {
        const head = g.querySelector('[data-testid="cmh-group-head"]');
        if (!head) return false;
        const foot = head.getBoundingClientRect().bottom;
        return [...g.querySelectorAll('[data-testid="cmh-row"]')].every((r) => r.getBoundingClientRect().top >= foot - 1);
      }),
    );
    expect(underTheirHeads, "each group's campaigns stand under its head").toBe(true);
    // Who can hear you is one line in the moments' head, inside their pane: nothing of the page's own stands above it.
    const rail = home.getByTestId("cmh-rail");
    await expect(rail.getByTestId("cmh-reach")).toBeVisible();
    await expect(home.getByTestId("cmh-reach")).toHaveCount(1);
    await expect(home.getByTestId("cmh-also")).toHaveCount(0);
    const railTop = (await rail.boundingBox())?.y ?? 0;
    for (const id of ["cmh-coming", "cmh-results"]) {
      const box = await home.getByTestId(id).first().boundingBox();
      if (box) expect(box.y, `${id} stands under the moments`).toBeGreaterThan(railTop);
    }
    // The marks a campaign goes by (8 Oct 2026): on a phone each keeps its word beside its dot, inside the screen, and
    // the whole says itself to a screen reader. Which campaigns carry marks is playbooks.spec's, against the API.
    const width = page.viewportSize()?.width ?? 0;
    const marks = home.getByTestId("cmh-row").locator(".cmh-chans");
    for (let i = 0; i < (await marks.count()); i++) {
      const m = marks.nth(i);
      await expect(m).toHaveAttribute("aria-label", /Goes by |waits?\b/);
      await expect(m.locator(".cmh-chan").first()).toBeVisible();
      for (const word of await m.locator(".cmh-chan-word").all()) await expect(word).toBeVisible();
      const box = await m.boundingBox();
      expect(box, "the marks are drawn").not.toBeNull();
      expect(box!.x + box!.width, "the marks stay inside the screen").toBeLessThanOrEqual(width);
    }
    await controlsInsideTheScreen(page, home);
    await page.getByTestId("cmh-new").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/new$/));
    const composer = page.getByTestId("cmh-composer");
    await expect(composer).toBeVisible();
    await controlsInsideTheScreen(page, composer);
  });
```
(The swipe test at ~line 1079 stands: a swipe across Campaigns goes nowhere, `campaigns$`; the chip strip is a strip of chips, not a view deck.)

- [ ] **Step 2: playbooks.spec, the count from the answer and the rows**

In `e2e/campaigns/playbooks.spec.ts`:

1. Import the journey (e2e reads contracts from source, as `offered.ts` does): add
```ts
import { appointmentWordOf, journeyOf, journeyStageOf, type JourneyStageId } from "../../packages/contracts/src/index";
```
(Lane 2's plan names them in `packages/contracts/src/journey/index.ts`, which the root index names; if not, import them from `../../packages/contracts/src/journey/journey` and `…/journey/appointment-word`.)
2. Widen the answer's type (~line 43) and replace the stage count (lines 51-52) with the journey read from the same answer the page reads (lane 2's plan: `GET playbooks` answers `calendar`, `deals_on` and `appointment_word`, and the home derives its shape from them the same way):
```ts
    const body = (await pb.json()).data as {
      playbooks: { id: string; state: string; trigger: string }[];
      deals_on: boolean;
      calendar?: string | null;
      appointment_word?: string | null;
    };
    …
    // The rail is the journey this business follows (journeyOf, spec §4.8), worked out from the answer the page reads:
    // four moments, or five where deals are on or a follow-up is held; a stage a campaign stands on always draws.
    const held = new Set(
      body.playbooks.map((p) => journeyStageOf(p.trigger)).filter((id): id is JourneyStageId => id !== null),
    );
    const journey = journeyOf({
      calendarOn: (body.calendar ?? "none") !== "none",
      dealsOn: body.deals_on,
      word: appointmentWordOf({ stored: body.appointment_word ?? null, sellsBy: body.deals_on ? "proposal" : null }),
      held,
    });
    await expect(home.getByTestId("cmh-stage")).toHaveCount(journey.length);
```
(If lane 2's code types `appointmentWordOf`'s `stored` as its closed set, narrow the answer's `appointment_word` with lane 2's own guard, as its home's input does.)
3. After the marks loop (~line 92), every campaign the answer holds is a row of the ledger (a reach-out's steps are its chain's one row, by its root):
```ts
    // Every campaign the workspace keeps is a row of the ledger under the moments, once (spec §4.3).
    for (const p of body.playbooks.filter((x) => !["lead_first", "after_step"].includes(x.trigger)))
      await expect(home.locator(`[data-testid="cmh-row"][data-row="${p.id}"]`)).toHaveCount(1);
```
4. Replace the waiting-run read (~lines 100-107) with the row's:
```ts
    // A run waiting on the owner is approved or skipped on its row (decision 14: one decision per run per screen): Approve
    // unless the verb would refuse it (its day has passed), and then Skip alone. Read here, never pressed: the workspace
    // keeps no test run, and one that happens to wait is the nightly's own to send or not. Coming up keeps its time.
    const waiting = home.getByTestId("cmh-row").filter({ has: page.getByTestId("cmh-waiting-acts") });
    for (let i = 0; i < (await waiting.count()); i++) {
      const row = waiting.nth(i);
      await expect(row).toHaveAttribute("data-state", "waiting");
      await expect(row.getByTestId("cmh-approve").or(row.getByTestId("cmh-skip")).first()).toBeVisible();
    }
    await expect(home.getByTestId("cmh-coming").getByTestId("cmh-waiting-acts")).toHaveCount(0);
```
5. Replace the test `"the home draws inside its page from 901 to 1440px: the rail stands down the line where five columns no longer fit"` and its comment (~lines 196-232) with:
```ts
  /**
   * The rail keeps one line at every desk width (J3 of the spec of 9 October 2026): five columns need about 1100px of page,
   * and under that the rail scrolls across inside its pane, a moment snapping to its edge. Between a
   * phone's 900px and a wide desk nothing may run out of the pane, or off the page. Geometry, so it is measured in a real
   * browser.
   */
  test("the home draws inside its page from 901 to 1440px: the moments keep one line, and the rail scrolls across where they no longer fit", async ({
    page,
  }) => {
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("campaigns-home")).toBeVisible();
    // 1280 to 1440 is where the ledger's six columns stand side by side under the sidebar: nothing of a row may be clipped.
    for (const width of [901, 1000, 1100, 1200, 1280, 1330, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const rail = page.getByTestId("cmh-rail");
      await expect(rail).toBeVisible();
      const tops = await rail
        .getByTestId("cmh-stage")
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
      expect(new Set(tops).size, `${width}px: the moments stand on one line`).toBe(1);
      const runOut = await rail.evaluate((el) => {
        const edge = el.getBoundingClientRect();
        // Inside a scroller of the pane's own (the rail, the tool line) a part past its edge is reached by scrolling.
        const scrolled = (n: Element) => {
          for (let p = n.parentElement; p && p !== el; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o === "auto" || o === "scroll") return true;
          }
          return false;
        };
        return [...el.querySelectorAll<HTMLElement>("*")]
          .filter((n) => !scrolled(n))
          .filter((n) => {
            const box = n.getBoundingClientRect();
            return box.width > 0 && (box.right > edge.right + 1 || box.left < edge.left - 1);
          })
          .map((n) => n.className || n.tagName);
      });
      expect(runOut, `${width}px: parts of the pane run out of it`).toEqual([]);
      const line = await rail
        .locator(".cmh-rail")
        .evaluate((ol) => ({ wider: ol.scrollWidth > ol.clientWidth + 1, overflow: getComputedStyle(ol).overflowX }));
      if (line.wider) expect(line.overflow, `${width}px: a rail wider than its pane scrolls across`).toBe("auto");
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `${width}px: the page scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
```
6. Add, after the drawer's test (`"a moment opens in the sheet by its address, …"`):
```ts
  test("the ledger's group is the address's own: a moment's card narrows it and lets go, replacing the address, never pushing", async ({
    page,
  }) => {
    await page.goto("/#/campaigns/in:quiet");
    await expect(page).toHaveURL(atRoute(/^campaigns\/in:quiet$/));
    const home = page.getByTestId("campaigns-home");
    await expect(home).toBeVisible();
    const card = home.locator('[data-testid="cmh-stage"][data-stage="quiet"]');
    await expect(card).toHaveAttribute("data-chosen", "true");
    await expect(card.getByTestId("cmh-stage-press")).toHaveAttribute("aria-pressed", "true");
    // Every row shown is the moment's, or nothing matches and the ledger says so.
    const rows = home.getByTestId("cmh-row");
    if ((await rows.count()) === 0) await expect(home.getByTestId("cmh-ledger-none")).toBeVisible();
    const depth = await page.evaluate(() => history.length);
    await card.getByTestId("cmh-stage-press").click();
    await expect(page).toHaveURL(atRoute(/^campaigns$/));
    expect(await page.evaluate(() => history.length), "let go by a replace, no entry added").toBe(depth);
    await expect(card).not.toHaveAttribute("data-chosen", "true");
  });
```
7. Update the file's header comment: "the moments are the workspace's own playbooks and their pools" becomes "the moments are the journey the workspace follows, with every campaign in the ledger under them"; "A playbook is `campaigns/moment:<id>`" becomes "A campaign is `campaigns/moment:<id>`, and the ledger's group `campaigns/in:<group>`"; and "the workspace keeps no test playbook" becomes "the workspace keeps one campaign, a PAUSED Win-back on silence that Ask's evals change (lane 4's seed, `tooling/scripts/ops/e2e-workspace.mjs` `WIN_BACK`), which nothing here resumes, renames or pauses".
8. **The nightly workspace holds that paused Win-back** once lane 4's seed is applied (after the merge), and none before: every assertion above reads the count, the rows and the states from the API's answer, so both pass. Check it by reading, nothing to run: the marks loop takes `paused` with its marks; the rows loop expects the Win-back's row (`data-state="paused"`, Resume at its end, never pressed); the `quiet` group under `in:quiet` holds that row rather than `cmh-ledger-none`; the drawer test (`"a moment opens in the sheet by its address, …"`), skipped while the workspace held no playbook, now runs on the Win-back: its Goes by row is drawn (a win-back is no follow-up), with its three switches, and Escape returns to `campaigns`. No assertion may expect zero campaigns, a `Turn on` on the quiet moment, or a moment `off` there.

- [ ] **Step 3: The specs compile and list**

Run:
```bash
corepack pnpm exec playwright test --list e2e/shell/phone.spec.ts e2e/campaigns/playbooks.spec.ts
corepack pnpm lint
```
Expected: both files list their tests with no compile error (they skip at run time without the suite's session, `HAVE_SESSION`); lint clean. Do not run them against production here: the nightly does, after the merge and the deploy.

- [ ] **Step 4: Commit**

```bash
corepack pnpm exec prettier --write e2e/shell/phone.spec.ts e2e/campaigns/playbooks.spec.ts
git add e2e/shell/phone.spec.ts e2e/campaigns/playbooks.spec.ts
git commit -F - <<'EOF'
The nightly holds the home's new shape: heads on the line with their rows, the journey counted from the answer, runs decided on their rows, one scrolling rail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 17: The as-built reference and the journey's decision note (0040)

**Files:**
- Modify: `docs/system-prd.md` (S-12's surfaces table, the `Playbooks` row ~line 687; and a paragraph after "**A campaign says where it goes**", ~line 790)
- Create: `docs/decisions/0040-the-journey-follows-the-business.md`
- Modify: `docs/decisions/README.md` (a row after 0038's)

- [ ] **Step 1: system-prd's surfaces table**

In `docs/system-prd.md`, S-12's table, replace the stale `| Playbooks | \`#/outbound\` | … |` row with a Campaigns row (the table's three cells: Route, Shows and from where, Does):

```markdown
| Campaigns     | `/w/<slug>/campaigns[/in:<group>\|moment:<id>\|new…]`                                                      | The journey the business follows (contracts `journeyOf`: First contact, the day before the appointment, after it, Proposal waiting where deals are on or a follow-up is held, Quiet or lapsed), each moment a card with who is at it now and what its campaigns are; under the moments, in the same pane, every campaign in one ledger (contracts `LifecycleLedger`): the receptionist and the call's text, each moment's playbooks, lists and the month's offer, reach-out chains by their root, one-off sends (a footer under seven rows, a group past them), grouped by moment in the journey's order, each row with what it goes by, who is at it now, its last 30 days (`campaign_series`' sources; a chain's from `reach_out_chain_totals`), its next run and its one act; Who can hear you, Coming up (its time and "Waiting on you") and What came back. On a phone the moments are the one list's spine | Narrow by a card (the address's group, `in:<group>`, replaced), a status tab, a search or People's list keys; sort and group past seven rows; approve or skip a waiting run on its row; resume a paused campaign, asked in place; open any in its drawer (Pause, Resume, Edit, Run now, Delete, which closes it); Turn on a moment ("Turn on Visit reminder"); New message; the Library |
```
(Prettier pads the cells; keep the `\|` escapes inside the backticks, which Markdown tables need.)

Also in `docs/system-prd.md` §11.2, the SurfaceData table (~lines 631–651, read it first: lane 2 Task 8 added the
surface): add a `campaign_results` row in the table's own shape (what it holds: Campaigns' last 30 days, `campaign_series`
and `reach_out_report` with `reach_out_chain_totals`, over `CAMPAIGNS_RESULTS_PERIOD`; who reads it: Campaigns alone, on
demand, as `periodSurface` reads Reports' lenses), and raise the surface count that section states by one. Check the
count against `apps/dashboard/src/surfaces/surface-values.ts` rather than adding one by hand.

- [ ] **Step 2: system-prd's paragraph**

After the paragraph that starts `**A campaign says where it goes** (8 October 2026, …)`, add:

```markdown
**A moment holds many campaigns** (9 October 2026, `docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`):
Campaigns' home draws every campaign in one ledger under the rail, grouped by moment in the journey's order, then Lists
& offers, Reach-outs and one-off sends. A moment's card summarises its group ("3 campaigns · 2 on · 1 paused", a bar
where it holds two or more); its body narrows the ledger to it and writes `campaigns/in:<group>` (replaced, never pushed,
kept while a sheet stands over the page), its lead's name opens the drawer. Past seven rows a sticky tool line: a search,
the status tabs (All, then Needs you, the one amber, and Paused, each above zero), how many are shown, Sort (Next, Name,
People now, Replied) and Group; the column heads once, the sorted one in the ink. A row says its last 30 days ("212 sent ·
48 replied", a chain's "40 written · 6 wrote back", "Nothing sent", or "—" where nothing was counted) and its next run,
and carries one act: Approve and Skip where a run waits (one decision per run per screen: Coming up keeps the time), Resume
asked in place with when and to about how many. People's list keys walk it (`/`, J/K or the arrows, Enter, Escape), and
focus comes back to the row a sheet was opened from. A decided row keeps its place and settles; a campaign just made or
changed is scrolled to and washed once. On a phone the moments are the list's spine: each moment's head is its node on the
line, its campaigns under it as list rows wearing their kind as a mark, a strip of chips past seven rows (one choice, no
swipe), and the drawer docks Pause or Resume in its foot. The doors land on what they name: a campaign's drawer, a run, the
bell's reach-out day on `campaigns/in:reach_out`, Ask's new campaign on its drawer, Today's follow-up card on the
appointment reminder's composer. What customers read says "appointment" ("cita") on the consent and unsubscribe pages and
in the email's foot, whatever the trade (decision 0040).
```

- [ ] **Step 3: The decision note**

Create `docs/decisions/0040-the-journey-follows-the-business.md`:

```markdown
# 0040 · The journey follows the business

**Status:** Decided on 9 October 2026 by Ruben, with "A moment holds many campaigns"
(`docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`, §4.8, decisions 40 to 49). Steps J1 to J3
built on the branch `campaigns/a-moment-holds-many`, not yet merged; J4 is a lane of its own. Written against commit
`7ff179717` (main, 9 October 2026). Where this note and the code disagree, the code wins.

## Context

- The moments around a customer were one constant, `STAGES` (`packages/contracts/src/playbooks/lifecycle.ts` at
  `7ff179717`): First contact, Visit tomorrow, After a visit, Quiet or lapsed, Proposal out, in that order, the same for a
  salon and a consultancy; "How customers buy" (`tenants.sells_by`) and the calendar only took one away.
- "Visit" stood in 82 contracts files, mostly ids, with about 60 strings a person or a model reads, while the glossary's
  word is appointment (`docs/glossary.md`); `tooling/scripts/tests/repo/trade-neutral.test.mjs` banned only salon words.
- Without a calendar the appointment moments were still offered, showed a 0 nobody counted, started a playbook that
  skipped every day, and counted as covered.
- A draft put the appointment word in `tenant_config.config.brain`, which the receptionist parses on every message, where
  a strict closed set can silence it (decision 0008).

## Decision

1. **J1, the word, derived now.** `APPOINTMENT_WORDS` is appointment, visit, meeting, session, lesson ("call" is the
   glossary's Call, "consultation" and "booking" are taken; "class" is not added). `appointmentWordOf({ stored, sellsBy })`
   is the stored word, else meeting where deals are on, else appointment; nothing is stored in this program and nothing is
   backfilled, so a salon reads "appointment" until it picks. Its home is `tenants.appointment_word`, beside `sells_by`.
2. **One page, one word.** The rail, the drawer, the approval sheet, the composer, Coming up, Sent and core's refusals say
   the workspace's word; "After a visit" and "After the visit" are one; a new playbook is named by the word through core's
   ports, and a stored name keeps its words until an opt-in rename of exact default names (decision 43). Ids never change.
3. **Customers read "appointment" now** ("cita"): the consent and unsubscribe pages, the email's foot, the last starter
   that said otherwise. The consent label "Visit messages" is not renamed here (decision 6).
4. **J2, the journey.** `journeyOf({ calendarOn, dealsOn, word, held })` is pure: First contact, then the day before the
   appointment, after it, Proposal waiting (where deals are on, or a follow-up is held), Quiet or lapsed. The ids are
   word-free (`visit` became `before`), so an address that names one (`campaigns/in:before`) survives a change of word. A
   stage that holds a campaign always draws.
5. **Needs your calendar.** Without a calendar, the appointment moments say so, with no figure, no Turn on and a door to the
   calendar's setting, and are never covered; `momentOffered` and core's refusal require a calendar.
6. **J3, the rail scrolls.** Past five stages, or on a narrow desk, the rail keeps one line and scrolls across.
7. **J4, later and its own spec.** The journey as references on `tenants.journey` (eight stages, three pinned lists,
   built-ins hideable but First contact), the word's Settings › Business row and its rename, Ask's journey action.

## Shape

- `packages/contracts/src/journey/appointment-word.ts` and `journey.ts`; the view model reads them
  (`packages/contracts/src/playbooks/lifecycle/`), and so do core's refusals.
- The page's group address, `campaigns/in:<group>`, takes a stage's word-free id
  (`apps/dashboard/src/surfaces/campaigns/home/address.ts`).

## Steps

1. J1 to J3, in one pull request of four commit groups (the floors, the backend, the ledger, Ask), no migration for these.
   Either deploy order works: the dashboard derives the word and the journey from what the database already holds.
2. J4: one migration adding `tenants.journey` and `tenants.appointment_word`, their Settings row, the opt-in rename; the
   dashboard reads the stored word where it is set and derives it where not, so either deploy order works there too.

## Tests

- `tooling/scripts/tests/journey/journey.test.mjs`: `journeyOf` by shape and word, every string of the view models, and
  the ratchet over `tooling/scripts/tests/baselines/appointment-words.json`: the strings that still say "visit" may only
  fall.
- `trade-neutral.test.mjs`: the customer-facing builders say no "visit".
- `e2e/campaigns/playbooks.spec.ts` reads the rail's count from the journey of the answer it reads.

## Risks

- A word changed on a running workspace: every salon reads "appointment" from this release, its playbooks keep their names,
  and customers of every trade read it on the consent pages and in the email's foot.
- The A2P campaign's facts quote the consent page's heading; registrations made before it quote the old one.

## Open questions

- "class" as a sixth word (decision 41, left out by default).
- A renewal stage and `deals.renews_on` (decision 49, not in this program).
```

(If lane 2's journey test stands elsewhere than `tooling/scripts/tests/journey/`, write its real path here.)

- [ ] **Step 4: The decisions' index**

In `docs/decisions/README.md`, after the `[0038]` row, add:
```markdown
| [0040](0040-the-journey-follows-the-business.md)                        | The journey follows the business                                          | Decided, 9 Oct 2026 (Ruben, with "A moment holds many campaigns"); J1 to J3 built on its branch, not yet merged; J4 waits on its own spec |
```

- [ ] **Step 5: Run the docs' tests**

Run:
```bash
corepack pnpm exec prettier --write docs/system-prd.md docs/decisions/0040-the-journey-follows-the-business.md docs/decisions/README.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/history/decisions.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
git grep -l "system-prd" -- tooling/scripts/tests
```
Expected: PASS ×3 (the note has one row, and the row and the note both read as built); run each file the last command prints, one per command: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/system-prd.md docs/decisions/0040-the-journey-follows-the-business.md docs/decisions/README.md
git commit -F - <<'EOF'
The as-built reference says what Campaigns' home is now, and decision 0040 says the journey follows the business

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 18: The lane whole: build, typecheck, lint, format, dead exports, every test it touched

**Files:** none new; this task may bank falls and un-export what nothing imports.

- [ ] **Step 1: Packages, types, lint, format**

Run:
```bash
corepack pnpm --filter "./packages/*" build
git status --short packages/*/dist
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm format:check
```
Expected: the build leaves no dist drift (`git status` prints nothing for `packages/*/dist`: everything was committed with its task); typecheck clean; lint clean (no new warning: the lint's baseline is per file and rule); format clean. (`format:check` reads every file on disk: if it names only untracked files under `docs/superpowers/` that this lane did not write, leave them and say so.)

- [ ] **Step 2: Dead exports**

Run: `corepack pnpm check:dead-exports`
Expected: no new dead export. The ones this lane removed (`PhoneRail`, `PhoneReachLine`, `ComingApproval`, the strips' words, if lane 2 left any of them) are falls: bank them with `corepack pnpm check:dead-exports -- --update`. A new one named here (an export only its own file reads) is un-exported, never raised. `ledgerViewOf`, `onLedgerKey`, `rowOpener` and `useFocusComesHome`'s tests import them by literal paths (Tasks 3 and 4), which knip follows from its `tests/**/*.mjs` entries; a template import (`` `${SRC}/…` ``) it cannot follow, so if knip names one of them, an import in `ledger-view.test.mjs` was written as a template: make it literal. `HOME_ROUTE` is no export since Task 2.

- [ ] **Step 3: The ratchets**

Run:
```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-css.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-gallery.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/campaigns-kit-parts.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs
```
Expected: PASS. A fall reported (strings that say visit, literal style values, kit primitives) is banked with `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs <that file>`, then `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs`, then both again plainly. A rise is fixed in the code.

- [ ] **Step 4: Every test file the lane touched or that names what it changed**

List them:
```bash
git diff --name-only <lane 3's base, Task 1 Step 1>..HEAD -- tooling/scripts/tests e2e | sort -u
git grep -l -E "cmh-|home-page|CampaignsHome|ListRow|list-row|LIFECYCLE_WORDS|serverNotificationRows|setupCardOf|PROPOSAL_SPECS|SENDER_WORDS|offerUnsubscribeWords|consentPageVM|STARTER_TEMPLATES|parseHome|PlaybookPane|PlaybookComposer|ReachOutPane|ledgerPhoneLine|isLedgerCampaign|readyRunTitle|vetoRunNotice|playbookFailedWords" -- tooling/scripts/tests | sort -u
```
Run every `.test.mjs` the two lists print (not the `.db.test.mjs`, which skip without a stack), one per command:
```bash
node tooling/scripts/checks/test.mjs <file>
```
Expected: every one PASSes. Write the list and its result in the commit message of Step 5 (this is the evidence a green pull request is a green nightly).

- [ ] **Step 5: Commit what was banked (skip if nothing changed)**

```bash
git add tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -F - <<'EOF'
Campaigns' home lane banks what fell: the strips' styles and words, and the phone rail's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 19: The bundle: what this lane adds, and the row CI's number fills at the push

On main at `39857e8a4` (9 October 2026; #1526 and #1528, merged into this branch before lane 3 began) the workspace route's JS budget is **767,058 bytes gzipped under a 768,000 ceiling: 942 bytes of room** (`tooling/scripts/tests/baselines/bundle-budget.json`). The Campaigns page's own JS is 204,372 of 262,144, Today's 207. Decision 2 approved raising the route's ceiling by the growth, with a Rises row. CI holds each pull request to what it adds against main's own recorded build (`tooling/scripts/checks/bundle-budget.mjs`'s header), and **a budget is never raised from a local build**: a local build read about 390 bytes higher than CI's on the same commit, so "local minus main's CI number" invented a +596 growth and a wrong row (#1492; memory `feedback_draw_the_states_the_workspace_lacks`, "Bundle growth is the line CI prints"). So this task builds nothing and raises nothing: it writes the row's reason, says what it expects, and leaves the row's numbers and the raise to the push, from the pull request's CI line.

**Files:** none committed. The row's text goes in the hand-back; `docs/debt.md` and `bundle-budget.json` change at the push (Step 3).

- [ ] **Step 1: The budget as the branch holds it**

```bash
node -e "const b=require('./tooling/scripts/tests/baselines/bundle-budget.json'); console.log(b.js, b.ceiling.js, b.ceiling.js-b.js, b.page.campaigns, b.page.today)"
```
Expected: `767058 768000 942 204372 207`, unless lane 1 or 2 raised it (then write down theirs, and their Rises row's name, for the hand-back).

- [ ] **Step 2: What the shared chunk's contracts grew by (an estimate for the hand-back, never a raise)**

The view model's words are contracts', which every page's route chunk carries; that part a local reading gives exactly:
```bash
git show 39857e8a4:packages/contracts/dist/browser.js | gzip -9 | wc -c
gzip -9 < packages/contracts/dist/browser.js | wc -c
```
Write both and their difference down: lanes 2 and 3's contracts growth, near the route's whole growth from contracts. The pages' own JS (the ledger, the phone's list) only CI's build measures. No `next build` here.

- [ ] **Step 3: The Rises row's words, for the push**

Write this row into the hand-back report (not into `docs/debt.md`): the first cell's `<…>` are CI's numbers, which only the pull request's run prints:
```markdown
| Workspace route JS budget 767,058 to <767,058 + CI's route growth> bytes gzipped, +<CI's route growth>, its ceiling 768,000 to <the new budget, rounded up to the next 1,000> (decision 2 of the spec of 9 October 2026); the Campaigns page's own JS 204,372 to <204,372 + CI's growth>, +<CI's growth>; <each other page CI says grew, the same way>. CI's growth against main's own build, read from the pull request's job summary | A moment holds many campaigns: the ledger under the rail (search, the status tabs, Sort and Group, the keys), the phone's one list on the journey's line, the journey's words in contracts every page loads (the view model is contracts', which the route's shared chunk carries), the composer's doors and notice, Today's one door. Nothing the page loads does it: the kit's Field, SubTabs, Menu and ListRow are already in the Campaigns page, and no new primitive or Base UI part is drawn | The journey's words leave the route's shared chunk for Campaigns' own page once contracts splits its view models from what every page reads (the bundle's next split), and the route falls back under 768,000 |
```

**At the push (the coordinator, not now):** the pull request's first CI run fails the bundle step by design; read its line, `gh run view <run> --log | grep -E "route JS [+-]|page [a-z]+ [+-]|against main"`, then, with no build:
```bash
corepack pnpm check:bundle -- --raise js=<CI's route growth> campaigns=<CI's campaigns growth> <page>=<growth>…
corepack pnpm check:bundle -- --ceiling js=<the new route budget, rounded up to the next 1,000>
```
and add the row above with CI's numbers to "## Rises, each with its reason" in `docs/debt.md`, in the same commit: `corepack pnpm exec prettier --write docs/debt.md` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs` (PASS: a Rises row is three cells, none empty). Never `--raise` to a local number, and never past the growth CI printed. Lane 4 adds to this row the same way.

---

## Task 20: A look on the campaigns rig: `salon-many` and its states at 1440, 1330, 1280, 1000 and 390, light and dark

The page must be seen, not only tested (CLAUDE.md, "To look at a page you changed, run the app"). The campaigns rig (memory `reference_campaigns_rig`) proxies `127.0.0.1:3346` to this worktree's `next dev` on `:3344`, mints the e2e owner's session for 127.0.0.1 only, lays a fictional salon over the e2e workspace's reads, and **answers every non-GET itself**: the dev server reads the PRODUCTION database, and nothing the page presses may reach it. This task adds a `salon-many` scenario (nineteen-odd campaigns, so the tools, the groups and the strip draw) and its variants, looks, and fixes what it sees. The e2e workspace has three people, no calendar and no steps (memory `feedback_draw_the_states_the_workspace_lacks`): every state below it lacks is drawn here, on the rig, or by hand on the running page.

**Files:**
- Modify (outside the repository, not committed): `C:\Users\Ruben\Documents\Claude Projects\Claude Video\dev-tools\campaigns-rig-scenarios.mjs`
- Modify (only for what the look finds): this lane's files, each fix with its test where it is behaviour

- [ ] **Step 1: The `salon-many` scenario**

In `dev-tools/campaigns-rig-scenarios.mjs` (read it whole first; it is re-read on every request):

1. In `PRESETS`, after `"salon-rows"`:
```js
  // Lane 3 of "A moment holds many campaigns" (9 Oct 2026): a salon with many campaigns, so the ledger draws its tools,
  // its groups, a moment holding three, lists, reach-outs and one-off sends past the footer.
  "salon-many": { email: true, whatsapp: true, running: true, starters: true, many: true },
  // ...and where deals are on: five moments (Proposal waiting among them), a follow-up running, and the word "meeting".
  "salon-many-deals": { email: true, whatsapp: true, running: true, starters: true, many: true, deals: true },
  // ...and with no calendar: the appointment moments say "Needs your calendar", their campaigns "Not running here".
  "salon-many-nocal": { email: true, whatsapp: true, running: true, starters: true, many: true, noCalendar: true },
```
   (`salon`, the preset with four campaigns, is the ledger under seven rows: no tool line, the one-off footer.)
2. In `playbooksChange`'s answer (`return { ...json, playbooks: rows, pools, calendar: "ok", …, deals_on: false }`), pin
   what lane 2's surface reads the business's shape from, so the e2e workspace's own answer cannot leak into the look:
```js
      calendar: st.noCalendar ? "none" : "ok",
      deals_on: !!st.deals,
      // The word is derived where nothing is stored (lane 2: appointmentWordOf from deals_on): appointment, or meeting.
      appointment_word: null,
      bookings_by_email: false,
```
   and inside item 3's `if (st.many)`, after its `rows.push(…)`, where `st.deals` push a running follow-up:
   `if (st.deals) rows.push(playbook("pb-follow", "Proposal follow-up", "proposal_waiting", "quick_note", "deal", "running", { run_hour: 11, totals: quiet }));`
   (check its `policy_class` against `PLAYBOOK_TRIGGERS`' `proposal_waiting` before you write it).
3. In `playbooksChange`, after the four playbooks are pushed (inside `if (st.running) { … }`), add:
```js
      if (st.many) {
        const quiet = { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] };
        const listOn = (id, name, key, template, state) =>
          playbook(id, name, "saved_list", template, "campaign", state, { list_key: key, totals: quiet });
        rows.push(
          playbook("pb-visit-2", "Visit reminder · two hours before", "visit_tomorrow", "visit_reminder", "booking", "running", { run_hour: 8, totals: quiet }),
          playbook("pb-visit-3", "Visit reminder · Spanish", "visit_tomorrow", "visit_reminder", "booking", "paused", { totals: quiet }),
          playbook("pb-after-2", "Ask for a review", "visited", "after_visit_check", "booking", "running", { run_hour: 15, totals: quiet }),
          playbook("pb-winback-2", "Win-back · 60 days", "lapsed", "winback_reply", "reengage", "paused", { totals: quiet }),
          playbook("pb-welcome", "Welcome", "new_week", "quick_note", "campaign", "running", { totals: quiet }),
          listOn("pb-list-1", "VIP regulars", "vip", "this_months_offer", "running"),
          listOn("pb-list-2", "Colour clients", "colour", "this_months_offer", "running"),
          listOn("pb-list-3", "New this month", "new_month", "quick_note", "paused"),
          listOn("pb-list-4", "Friends of the studio", "friends", "quick_note", "running"),
        );
      }
```
4. In `broadcastsChange`, after the rows are pushed (inside `if (st.running)`), add three one-off sends more:
```js
      if (st.many) {
        for (const [i, name] of ["Saturday hours", "Gift cards are back", "Parking on Main St"].entries()) {
          const at = NOW() - (4 + 5 * i) * DAY + 10 * HOUR;
          rows.push(
            broadcast(`b-once-${i}`, name, "quick_note", { kind: "everyone", id: null, label: "Everyone" }, "sent", at, 20 + i, {
              sent: 20 + i,
              delivered: 19 + i,
              read: 12,
              replied: 2 + i,
              sent_by: { whatsapp: 14, sms: 0, email: 6 + i },
            }),
          );
        }
      }
```
5. In `reportChange`, after `sources` is built, add the new campaigns' and sends' sources when `st.many`:
```js
    if (st.many) {
      const src = (id, kind, name, template, sent, replied) => ({ id, kind, name, template_name: template, runs: kind === "broadcast" ? 1 : 12, sent, delivered: sent, read: Math.round(sent * 0.6), replied, last_at: iso(NOW() - 2 * DAY) });
      sources.push(
        src("pb-visit-2", "playbook", "Visit reminder · two hours before", "visit_reminder", 64, 9),
        src("pb-after-2", "playbook", "Ask for a review", "after_visit_check", 31, 12),
        src("pb-list-1", "playbook", "VIP regulars", "this_months_offer", 18, 4),
        src("b-once-0", "broadcast", "Saturday hours", "quick_note", 20, 2),
        src("b-once-1", "broadcast", "Gift cards are back", "quick_note", 21, 3),
        src("b-once-2", "broadcast", "Parking on Main St", "quick_note", 22, 4),
      );
    }
```
(`sources` is a `const` array there; `push` is fine.)
6. Reach-outs: lane 2's surfaces read `GET reach-outs` (`{ chains }`) and the chains' report (lane 2's route; read its path in `apps/dashboard/src/surfaces/campaigns/home/results-surface.ts`). Add a change for `GET reach-outs` laying three fictional chains when `st.many` (made-up names, example.com hosts), each in `ReachOutChainDto`'s shape (`packages/contracts/src/reach-out/reach-out-dtos.ts:36-53`):
```js
function chain(rootId, name, search, state) {
  return {
    root_id: rootId,
    name,
    search: { id: `s-${rootId}`, name: search },
    state,
    include_unconfirmed: false,
    gap_minutes: 12,
    domain_ids: [],
    signed_by: "Luna",
    steps: [
      { id: rootId, n: 0, after_days: null, subject: "A quick hello", body: "{{opening}}", template_id: null, state, hand: null },
      { id: `${rootId}-2`, n: 1, after_days: 4, subject: null, body: "Just checking in.", template_id: null, state, hand: null },
    ],
    domains: [{ host: "mail.example.com", sent_days: 30 }],
    next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
    created_at: iso(NOW() - 40 * DAY),
  };
}
function reachOutsChange(st) {
  return (json) =>
    st.many
      ? {
          ...json,
          chains: [
            chain("ro-a", "Wedding planners nearby", "Wedding planners · Miami", "running"),
            chain("ro-b", "Hotels with spas", "Hotels · Coral Gables", "running"),
            chain("ro-c", "Photographers", "Photographers · Miami Beach", "paused"),
            // A chain whose run waits: decided on its own page, so its row's act is "Open the run" (Task 7).
            { ...chain("ro-d", "Florists", "Florists · Miami", "running"), next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: "b-ro-d" } },
          ],
        }
      : json;
}
```
and in `reads`, `if (route === "reach-outs") return onData(reachOutsChange(st));`. For the chains' report route lane 2 reads, lay per-chain numbers the same way (`{ written, wroteBack }` per `root_id`, in the field lane 2's reader answers: read its type in `apps/dashboard/src/server/readers/campaign-report.ts`), e.g. ro-a 40 written · 6 wrote back, ro-b 22 · 1, ro-c none.

Check the file still loads: `node -e "import('file:///C:/Users/Ruben/Documents/Claude%20Projects/Claude%20Video/dev-tools/campaigns-rig-scenarios.mjs').then(m => console.log(Object.keys(m)))"`. Expected: `[ 'reads', 'writes' ]`.

- [ ] **Step 2: Start the app and the rig**

The dev server is the entry `campaigns2-app` of `C:\Users\Ruben\Documents\Claude Projects\Claude Video\.claude\launch.json` (`next dev --port 3344` in this worktree's dashboard). Start it with the Browser pane's `preview_start` (name `campaigns2-app`) where the pane is available, else in the background from Bash: `cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2/apps/dashboard" && node ../../node_modules/next/dist/bin/next dev --port 3344` (`run_in_background`). Then the rig, in the background, from `Claude Video`: `node dev-tools/campaigns-rig.mjs 3346 3344`. If something already listens on 3346 (a prior session's rig), use it; never stop a process you did not start.

Open `http://127.0.0.1:3346/__rig/signin?to=/w/chanlytics-e2e/campaigns` (the rig mints the e2e owner's cookie for 127.0.0.1 only, from the service key it reads from `.env.local` by file; never print it), then `http://127.0.0.1:3346/__rig/set?s=salon-many`, clear the tab's `sessionStorage` (the surface cache), and reload the Campaigns page. Each later scenario is the same `__rig/set?s=<name>`, the cache cleared, the page reloaded.

- [ ] **Step 3: Look, at five widths and in both themes**

For each width (`resize_window` 1440×900, 1330×900, 1280×900, 1000×900, then the `mobile` preset, 390 wide) and each theme (the app's own theme control in the account menu, or for the look alone `document.documentElement.dataset.theme = "dark"` through `javascript_tool`), look at a screenshot and check, writing down what you see:

- **1440, 1330, 1280:** the rail's height at 1440 (`document.querySelector('.cmh-rail').getBoundingClientRect().height`; the spec expects about 170px) and that a card's toggle, its name and its Turn on/Resume are three presses; the cards one height; the tool line (search "Search N campaigns", the tabs with Needs you in amber and "N campaigns need you" on hover, "Showing N of N" with the All tab's N, Sort and Group); the column heads aligned with the rows' cells (one grid); the Visit group's head with three rows; the one-off sends as a group; a paused row resting (no amber); **no act clipped**: at each of the three widths, for every row, `row.querySelector('.cmh-row-acts').getBoundingClientRect().right` is within `document.querySelector('.cmh-rail-block').getBoundingClientRect().right` (the ledger's six columns stand under the sidebar here); scrolling the page: the tool line sticks, the groups' heads stick under it, rows do not show through either in either theme, and both bands read as the pane they stand in.
- **A card pressed:** the address reads `campaigns/in:<id>`, the card wears the chosen ground, the line says "<moment> · showing n of N · Clear"; pressed again, all comes back. On the empty moment's card: "No campaigns match" and Clear.
- **Sort and Group:** Sort by Name and by Replied reorder the rows; Group › No groups draws one list, its heads gone.
- **Keys:** J walks with the focus ring on the name, Enter opens the drawer, Escape closes it and the focus is back on that row's name; `/` goes to the search; Escape clears it.
- **Approve on a waiting row** (the rig answers): the toast says the count and when; the row keeps its place and settles. **Resume** on a paused row asks "Resume …?" with when and how many. The chain whose run waits (`ro-d`) offers "Open the run", a link to `broadcasts/run:b-ro-d`.
- **1000:** the moments keep one line and scroll across, their edges fading only while more stands past them (`data-overflows`); widen to 1440 and the fade goes; the ledger's Goes by and People fold under the names, nothing runs past the pane, the page does not scroll sideways.
- **390:** the Moments head's one meta line, the chips strip (sticky as the page scrolls, scrolling across, a chip only above zero), each moment's head on the line with its node (the line solid through a moment that is on), its campaigns under it with their marks; each row's pill says its state once in the phone's words and its line "<moment> · <next> · <people>"; Approve and Skip under the waiting row; Resume at the paused row's end, drawn no taller than the pill beside it, and its question under the row at the row's width; "Open the run" under the waiting chain's row; the drawer's foot holds Pause or Resume; no field takes the focus by itself (the search circle opens its box with no keyboard: check with a touch context, `resize_window` mobile); a swipe across the page goes nowhere.

Then the states `salon-many` lacks, each at 1440 and 390 in one theme (the other theme once, on the worst of them):

- **Under seven rows** (`salon`): no tool line, no column heads, the rows in their groups, the one-off footer "Sent once · last 30 days · N" with its door to Sent.
- **Deals on** (`salon-many-deals`): five moments, Proposal waiting before Quiet or lapsed, its follow-up a row; the word is "meeting" on the rail ("Meeting tomorrow", "After the meeting"), in the drawer's pool tip and in the composer's "everyone with a meeting tomorrow" (Task 15's one word), and the rail still on one line at 1280.
- **No calendar** (`salon-many-nocal`): the two appointment moments say "Needs your calendar" with no figure, their group heads carry "Connect your calendar" (a door to Settings › Business), their campaigns read "Not running here" with no act.
- **An archived list** (Needs you through a list), **a failed read** (the templates', the chains', the numbers'), and **a viewer** (View as, in the account menu): the rig cannot lay the first two without a lists route and a failing answer it does not have; draw them by hand on the running page (memory `feedback_draw_the_states_the_workspace_lacks`: with `javascript_tool`, set the row's `data-state`, pill tone and words, or the failed read's line, exactly as the component would, and measure the row's height against its neighbours'), and for a viewer check that Approve says who may, and Skip, Resume and Turn on are not offered.
- **Reduced motion**, where the browser can emulate `prefers-reduced-motion` (the Browser pane may not: then say it was not seen, and the rules' own `@media (prefers-reduced-motion: reduce)` blocks, at the same specificity and after the motion, are the proof): an approval settles with no rise, an arrival with no wash.

Then prove nothing wrote: open `http://127.0.0.1:3346/__rig/log?brief=1`. Expected: only the rig-answered writes (approve, cancel, PUT playbooks for a resume) and the app's vitals and client errors; none of them left this machine.

- [ ] **Step 4: Fix what the look found**

A misplaced or overlapping part is a CSS fix in `campaigns.css` (tokens only; re-run `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`); a behaviour is a fix with its test in `ledger-page.test.mjs` first. Commit each fix by itself, its message saying what the look showed.

- [ ] **Step 5: Stop and clean up**

Stop the dev server and the rig you started (`preview_stop`, or the background tasks). Then:
```bash
git checkout -- apps/dashboard/tsconfig.json apps/dashboard/next-env.d.ts
rm -rf apps/dashboard/.next
git status --short
```
Expected: `git status` shows nothing but the untracked spec and plans (next dev rewrites the two files: memory `feedback_next_dev_rewrites_tsconfig`). The scenario file stays in `dev-tools` (outside the repository) for the next look.

- [ ] **Step 6: Report**

In the hand-back to the coordinator, say: the rail's measured height at 1440; what was seen at each width, theme and state, and which states were drawn by hand rather than seen on the rig; the fixes committed; the `__rig/log` summary; Task 19's budget reading, contracts' estimated growth and the Rises row's text; and Task 12C's note for lane 4 (the renamed "A campaign is running or paused.").

---

## Open points (the spec against the code, and what needs Ruben's word)

1. **Written against lane 2's plan, not its code.** Lane 2's plan (`docs/superpowers/plans/2026-10-09-moment-lane-2-contracts-core-reads.md`) was on disk when this was written, and this plan uses its names (`LIFECYCLE_WORDS.ledger`'s members, `ledgerOrder`, `LEDGER_SORTS`, `LifecycleBar`, `act.ask`, `journeyOf`'s `held` set, the bridge `alsoLines`). Task 1 checks each against lane 2's code; the code wins.
2. **A one-campaign moment's summary.** Lane 2's `summary` for one campaign is its name and clock ("Visit reminder · daily 9:00 AM"), which the card's name (the drawer's door) and its state pill already say; the toggle draws the summary only where the moment holds two or more ("3 campaigns · 2 on · 1 paused", with its bar). If Ruben wants the summary on every card, the name's door and the state pill would say it twice.
3. **Lane 2's words decide some of this lane's assertions.** The row's hint for a chain, a waiting row's Next words ("Waiting on you"), a stage's caps, the resume question: the plan reads them from the view model and asserts the spec's examples. Where lane 2 said them otherwise, the page tests follow lane 2's words (Task 1's table), never the reverse.
4. **A resume asked "with when and to how many, `auto` in full" (D7).** Resolved in lane 2 (reconciled 9 Oct): GET playbooks answers `modes`, the playbooks surface carries it, and lane 2's `resumeOf` ends `act.ask.detail` with `LIFECYCLE_WORDS.ledger.resume.auto` where the campaign's class is `auto`. This lane draws `act.ask.detail` as it comes (`ResumeAct`, Task 6), on the row and on a paused moment's card (Task 8, the lead row's act), so it says the mode in full with no code of its own.
5. **The acts column.** The spec's grid ends `… 168px 112px`; "Approve · 7 people" and "Skip" side by side do not fit 112px. The plan ends it `fit-content(240px)`, as Sent's acts' track is `fit-content(220px)` (`campaigns.css` `.bc-runs`).
6. **The rail's figures.** The spec says 34px → 28px; the code's figure is `--text-3xl`, 30px in Glass (`tokens.css:307`), and no 28px step exists. The plan uses `--text-hero` (26px) rather than add a token; the look (Task 20) measures the rail's height against the spec's "about 170px".
7. **Under seven rows, "no … heads".** The plan reads D15's "heads" as the column heads; the groups' heads stay, since an empty moment's Turn on stands in its group's head (D16). If Ruben meant the group heads too, the short ledger becomes a flat list.
8. **A decided row "keeps its place".** The plan keeps it on the screen under the filter it was decided in until the filter changes; its order may still move under Next (a waiting run approved now goes later). Freezing the order too would need the row's order at the moment of the decision held by the page.
9. **"A sheet closes with `history.back()` whenever the home is behind it."** The address carries no marker of who pushed, so the page counts a sheet that opened over the home it stood on as having the home behind it, unless the page itself swapped it in (Task 2). A door that *replaces* the home with a sheet from outside the page (none does on `7ff179717`) would be closed with a back that leaves the page.
10. **The sticky tool line in Glass.** It and the groups' heads read `--surface-pane-solid`, the clear pane's fill made opaque (`tokens.css`, both themes), so rows do not show through and the band is the pane's own; the frame's own sticky head under Glass may stand over it at the page's top. The look (Task 20) checks both themes; a fix there may need the frame's head height as a token.
11. **The A2P campaign's facts** quote the consent page's heading (`apps/edge/lib/lines/a2p-campaign-facts.ts:280`); they now read it from `CONVERSATIONAL_ASK_TITLE`, so a registration made after this release quotes "Messages about your appointment". Registrations already made quote the old heading; the carriers' reviewers saw the old page. Worth Ruben's word before the push.
12. **The email's foot is customer copy in the send path's output** (`SENDER_WORDS.visitBooked`, read by core when it composes an email). D6 approves the words; the pull request must say "booking notices stop counting as replies, and the consent and unsubscribe pages and the email foot say appointment" (spec §6).
13. **Today's door** is drawn only while Today's setup card stands (after the first run, rows left) and the calendar row is ready; the setup surface knows nothing of playbooks, so it does not hide where a reminder already runs (the composer then says the moment holds one: D20). Reading playbooks on Today would make Today pay for Campaigns' reads, which the spec forbids (§1).
14. **The bundle.** On main at `39857e8a4` (9 October 2026) the route has 942 bytes of room (767,058 of 768,000); lanes 2 and 3 will pass the ceiling. The plan builds nothing locally (a local build reads about 390 bytes higher than CI's) and leaves the raise (budget, ceiling and the Rises row) to the push, by the pull request's CI line (Task 19).
15. **`campaigns/in:<group>` on an older dashboard.** A bell row written with the new route and read by a dashboard deployed before this one lands on the home (its `parseHome` knows no `in:`): either deploy order works, the older one less exactly.
16. **The spec is untracked.** `docs/system-prd.md` and decision 0040 cite `docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`, which is not committed on this branch yet; the pull request should carry it (no test reads those two citations, so nothing turns red without it).
17. **"Playbook" outside Campaigns' own TSX.** Decision 19 takes "playbook" out of every word a person reads. Task 12B changes the words Campaigns' pages type themselves; Task 12C (added 9 Oct) changes the rest a person reads: Today's run rows and its day, the bell's run titles and Settings › Notifications, the Inbox, a person's timeline, the Library's "used by" and a template's refused delete, Reports' empty line, source kind, sends line and metric hints, Settings' Activity and policy notes, the refusals, and the platform's and the owner's notices of a campaign that could not run. Ask's words are lane 4's (18B); "broadcast" stays wherever it stands, which is Ruben's to revisit at review. Two rows touch lane 4: Ask's list card (`ask-proposals/lists.ts:42`, its file, whose plan leaves the sentence) and the route's "A playbook is running or paused." (`playbook-row.ts:86`), which lane 4's Task 1 moves into `PLAYBOOK_PATCH_WORDS.state` with today's words: it must take the renamed ones.
