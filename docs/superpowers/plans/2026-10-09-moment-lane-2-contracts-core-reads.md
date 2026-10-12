# A moment holds many campaigns, lane 2: contracts, core and the ledger's reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Campaigns' home a view model that holds every campaign of a workspace in one grouped, counted, sortable ledger, in the journey's order and one appointment word, read from Campaigns' own on-demand numbers, so lane 3 can draw it without deriving anything.

**Architecture:** Spec `docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md` §6 group 3 (a)–(e): §4.1, §4.5 and the contracts and core parts of §4.8. Contracts gain `journey/` (the derived appointment word and `journeyOf`) and `playbooks/lifecycle/` (the four lifecycle modules, moved alone, plus `lifecycle-ledger.ts`); core learns the calendar rule and names a new playbook by the word through its ports; the dashboard gains one on-demand surface (`campaign_results`) for the two 30-day reports, readers for the chains, and the business's shape on `GET playbooks`. No migration, no new route.

**Tech Stack:** TypeScript (contracts, core, Next.js dashboard), node:test suites under `tooling/scripts/tests`, pnpm via corepack, tsup-built committed `dist`.

---

## Read this first (every task)

- **Where.** Worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-campaigns-2`, branch `campaigns/a-moment-holds-many`. Lane 1 (the floors and the backend) is already committed on this branch before you start. Never `cd` elsewhere, never `git stash`, never push. Every command below runs from the worktree's root.
- **The code wins.** Every `file:line` here was read on `d1bb65961` plus nothing of lane 1. Before each edit, read the current file (lane 1 changed `apps/dashboard/src/server/readers/playbooks.ts`, `apps/dashboard/src/server/campaigns/playbooks.ts`, `packages/db/src/repositories/reports/report-series.ts` and the playbooks/reach-outs surfaces' `refreshOnTables`). If a snippet's surrounding code differs, keep the snippet's intent and say so in your report.
- **Names lane 1 created that this plan uses** (read them in the tree; their code wins over this plan's assumption):
  - `reachOutChainTotals` in `packages/db` beside `campaignSeries`, committed by lane 1 as `reachOutChainTotals(db, tenantId: string, days: number): Promise<CountsByKey | "missing">` (the object, or "missing" where the function is absent; it throws on any other failure, a non-object answer among them, so its caller catches: Task 6's reader), its `Json` the `jsonb` of `reach_out_chain_totals(p_tenant_id, p_days)` from migration 00363: `{ "<root_id>": { "written": n, "wrote_back": n, "last_at": "…" | null }, … }`. If its return or keys differ, adapt `chainTotalsOf` (Task 4) and the reader (Task 6), nothing else.
  - `EMAIL_CLAIMS`, `playbookTotals`, `runCounts`, `templateSends` exist; this lane does not call them.
- **Tests.** One file per command: `node tooling/scripts/checks/test.mjs <file>`. Never `corepack pnpm test` (20 minutes; Ruben forbade the whole suite locally). Tests import `@chanlytics/contracts` and `@chanlytics/core` from their built `dist`: after any change under `packages/contracts` run `corepack pnpm --filter @chanlytics/contracts build`, after `packages/core` run `corepack pnpm --filter @chanlytics/core build`, **before** running a test. Commit the rebuilt `dist` with the task.
- **Checks you run at the end of every task that touched TypeScript:** `corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/core --filter @chanlytics/dashboard typecheck` (expected: no output after the package names, exit 0), then `corepack pnpm exec prettier --write <every file you changed>`.
- **Edit with the Edit or Write tool.** Never Git Bash `sed` (it flips CRLF), never PowerShell `Set-Content` (it double-encodes). A new file is `git add -N <file>` right after you create it: the barrel, tree and docs tests read `git ls-files`.
- **Ratchets.** A new top-level name must not be declared in a third file: before committing, run `git grep -nE "(function|const|let|class|interface|type) <Name>\b" -- apps packages ':!*/dist/*'` for each new name in the task and check it is declared at most twice. Functions stay under 150 lines, 30 branches, 5 levels; files under 800 lines. A fall is banked with `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
- **Browser entry.** After a change to any contracts barrel (`packages/contracts/src/**/index.ts`), run `node tooling/scripts/gen/contracts-browser-entry.mjs` and commit `packages/contracts/src/browser.generated.ts`; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs` must pass.
- **Commits.** `git add <exact files>` (never `-A`), then `git commit -m "<sentence>"` with a message in the repo's sentence style whose last lines are a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. In PowerShell use a single-quoted here-string with the closing `'@` at column 0.
- **Do not run** a dev server, `next build`, a Supabase stack, or anything against production. This lane needs none.

## Words used below

`ct/` is `packages/contracts/src/`, `core/` is `packages/core/src/`, `srv/` is `apps/dashboard/src/server/`, `cmp/` is `apps/dashboard/src/surfaces/campaigns/`, `home/` is `cmp/home/`, `tests/` is `tooling/scripts/tests/`. Dn is decision n of the spec's §9.

## File map

**Created**

| File | Responsibility |
| --- | --- |
| `ct/journey/appointment-word.ts` | `APPOINTMENT_WORDS`, `AppointmentWord`, `isAppointmentWord`, `appointmentWordOf({ stored, sellsBy })`, `appointmentWords(word)`: every phrase the word makes |
| `ct/journey/journey.ts` | `JOURNEY_STAGE_IDS`, `JourneyStageId`, `JourneyStage`, `journeyStageOf(trigger)`, `journeyOf({ calendarOn, dealsOn, word, held })` |
| `ct/journey/index.ts` | the domain's barrel |
| `ct/playbooks/lifecycle/lifecycle-ledger.ts` | the ledger: one builder per row kind, the groups, the counts, `ledgerOrder`, the channel marks |
| `home/results-surface.ts` | the on-demand `campaign_results` surface: both 30-day reports, each failing alone |
| `tests/playbooks/home/ledger.test.mjs` | the ledger, executed |
| `tests/journey/journey.test.mjs` | `journeyOf` per shape, the word, the one-word scan, the `appointment-words.json` ratchet |
| `tests/baselines/appointment-words.json` | seeded by the ratchet; may only fall |

**Moved (Task 1, alone):** `ct/playbooks/lifecycle.ts`, `lifecycle-tiles.ts`, `lifecycle-types.ts`, `lifecycle-words.ts` → `ct/playbooks/lifecycle/`.

**Modified**

| File | Change |
| --- | --- |
| `docs/glossary.md` | rows: the senses of "held", Campaign, Campaign reply window, Journey, Appointment word; Moment says "an appointment" |
| `ct/index.ts`, `ct/playbooks/index.ts`, `ct/reports/index.ts`, `ct/browser.generated.ts` | barrels |
| `eslint.config.mjs`, `docs/debt.md`, `docs/takeover.md`, `docs/architecture.md` | `ct/journey` joins `LIMITED_TREES`; counts and the drawn tree |
| `ct/reports/report-periods.ts` | `CAMPAIGNS_RESULTS_PERIOD`; `fixedDaysOf` overload |
| `ct/reports/reach-out-report.ts` | `ReachOutChainTotalsDto`, `chainTotalsOf`, `chainTotalsFromReport` |
| `ct/playbooks/playbook-triggers.ts` | appointment labels, `triggerWords`, `winBackWords` (replaces `WIN_BACK_WORDS`), the calendar rule in `momentOffered` |
| `ct/playbooks/playbook-schedule.ts`, `playbook-approval.ts` | `scheduleLine(p, word)`, `poolWords(trigger, word)`, `toApprovalVM`'s playbook carries `word` |
| `ct/playbooks/playbook-purpose.ts`, `ct/templates/templates.ts`, `ct/templates/campaign-message.ts`, `ct/shell/campaign-rooms.ts`, `ct/broadcasts/broadcast-failures.ts`, `ct/broadcasts/broadcasts.ts` | sentences that said "visit" become word-free |
| `ct/playbooks/lifecycle/*` | the ledger types, words, tone, stages over the journey, the tiles' report and period |
| `ct/shell/tone.ts` | a paused playbook's tone is plain |
| `ct/shell/route-prefetch.ts` | `PREFETCH_READS.campaigns` gains the reach-outs and its report; `.broadcasts` loses its report |
| `core/campaigns/check-playbook.ts`, `core/campaigns/template-values.ts` | the calendar rule, names by the word, the three refusals |
| `srv/campaigns/playbooks.ts` | core's `appointmentWord` port |
| `srv/readers/facts.ts`, `playbooks.ts`, `campaign-report.ts`, `shape.ts` | `businessShape`, `reachOutChains`, `reachOutReport`, the word on GET playbooks and in Ask's shape |
| `apps/dashboard/app/api/v1/reach-outs/route.ts`, `.../reports/reach-outs/route.ts` | answer through the readers |
| `srv/ask/tools/read/report.ts`, `read/campaigns.ts`, `act/playbook.ts`, `srv/ask/context.ts` | Ask reads the reach-outs through the readers and says the word |
| `apps/dashboard/src/legacy-bridge/surface-registry.ts`, `LegacyApp.tsx`, `refresh-map.ts` | `ROUTE_DRAWS.campaigns`, what Campaigns owns, the results surface registered, PATCH workspaces refreshes Campaigns |
| `apps/dashboard/src/surfaces/surface-values.ts` | the `campaign_results` key |
| `cmp/broadcasts/surface.ts`, `cmp/broadcasts/sample.ts` | the report leaves the broadcasts surface |
| `cmp/playbooks/surface.ts`, `cmp/playbooks/sample.ts`, `cmp/playbooks/card-detail.tsx`, `cmp/playbooks/composer-model.ts`, `cmp/broadcasts/verbs.ts`, `cmp/templates/verbs.ts`, `cmp/templates/composer-forms.tsx` | the word and the shape reach the page |
| `home/use-home.ts`, `home/rail.tsx`, `home/home-page.tsx` | the home's inputs; a bridge for the strips until lane 3 draws the ledger |

## What lane 3 receives (the seam)

`LifecycleHome.ledger: LifecycleLedger` (groups in the journey's order, then `lists`, `reach_out`, and `sent_once` past seven rows), every row's words, status, tone, door (`open`), waiting run (`waiting`), act (`act`, Resume with its question in `ask`, or Turn on), results and next; the counts the status tabs say; `ledgerOrder(by)` and `LEDGER_SORTS`; `LIFECYCLE_WORDS.ledger` (heads, tabs, search, showing, sort and group menus, results words, the footer, Approve and Skip, Resume's question, "Find businesses to write to"); `LIFECYCLE_WORDS.needsCalendar`; `LIFECYCLE_TOAST.paused`; `LifecycleStage.summary` and `.bar`; the stage ids `first_contact | before | after | proposal | quiet`. `strips`, `LifecycleStrip`, `LIFECYCLE_WORDS.alsoRunning` and `.kickers` are gone; `home/rail.tsx` carries a small bridge (`alsoLines`) that lane 3 deletes with the strips' CSS. Coming up's lines keep their `waiting` (so the page keeps Approve until lane 3 draws it on the row); lane 3 stops drawing them there (D14).

---

### Task 1: The four lifecycle modules move, alone (spec §6 3(a))

A pure move: four files change folder, their import paths gain one `../`, and every importer follows. Nothing else changes, and the values prove it.

**Files:**
- Move: `ct/playbooks/lifecycle.ts`, `ct/playbooks/lifecycle-tiles.ts`, `ct/playbooks/lifecycle-types.ts`, `ct/playbooks/lifecycle-words.ts` → `ct/playbooks/lifecycle/`
- Modify: `ct/playbooks/index.ts:80-82, 114`, `ct/ask-proposals/campaigns.ts:11`, `ct/browser.generated.ts` (regenerated)
- Test (run only): `tests/playbooks/home/lifecycle.test.mjs`, `tests/playbooks/home/channels-on-the-home.test.mjs`, `tests/playbooks/home/moments-offered.test.mjs`, `tests/playbooks/home/campaigns-home.test.mjs`, `tests/repo/contracts-barrels.test.mjs`, `tests/shipping/browser-entry.test.mjs`, `tests/repo/lint-boundaries.test.mjs`

No barrel goes in `ct/playbooks/lifecycle/`: an `index.ts` there would be read as a domain barrel the root index cannot name (`tests/repo/contracts-barrels.test.mjs`, "the root index is zod-config first…"), the way `ct/config/workspace-config/` has none. `packages/contracts/src/playbooks` is already in `LIMITED_TREES` and `WIDE_PARAMS` (`eslint.config.mjs:330, 383`), and `treeFiles` globs `<tree>/**`, so the new folder is held already; it is not a candidate tree of its own (it has no `index.ts`).

- [ ] **Step 1: Record the values before the move**

Run each, and keep the last line of each output:

```bash
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/lifecycle.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/channels-on-the-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/moments-offered.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
```

Expected: each ends `# fail 0`. Write the four `# pass N` counts in your report.

- [ ] **Step 2: Move the files with git**

```bash
mkdir -p packages/contracts/src/playbooks/lifecycle
git mv packages/contracts/src/playbooks/lifecycle.ts packages/contracts/src/playbooks/lifecycle/lifecycle.ts
git mv packages/contracts/src/playbooks/lifecycle-tiles.ts packages/contracts/src/playbooks/lifecycle/lifecycle-tiles.ts
git mv packages/contracts/src/playbooks/lifecycle-types.ts packages/contracts/src/playbooks/lifecycle/lifecycle-types.ts
git mv packages/contracts/src/playbooks/lifecycle-words.ts packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts
```

- [ ] **Step 3: Give each moved file's imports one more `../`**

Rule: a specifier `../x/y` becomes `../../x/y`; a specifier `./playbook-…` becomes `../playbook-…`; a specifier `./lifecycle-…` stays. Edit with the Edit tool. The resulting import blocks, exactly:

`ct/playbooks/lifecycle/lifecycle.ts`:

```ts
import { channelsStandingParts } from "../../broadcasts/channels-standing";
import { offersPausedLine } from "../../broadcasts/email-offers";
import type { ChannelsReady } from "../../broadcasts/reach-for";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS } from "../../consent/consent-channels";
import { emailTemplateRowsOf } from "../../reach-out/reach-out-sheet";
import { libraryCount } from "../../templates/library-count";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { bookingTemplate } from "../../templates/template-order";
import { plural } from "../../shared/words";
import { lifecycleComing, lifecycleReach, lifecycleResults } from "./lifecycle-tiles";
import { LIFECYCLE_WORDS, lifecycleStateOf } from "./lifecycle-words";
```

followed by its unchanged `import type { … } from "./lifecycle-types";`, then:

```ts
import {
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead,
  type PlaybookMessage,
} from "../playbook-channels";
import { isWinBack, triggerOf } from "../playbook-triggers";
```

`ct/playbooks/lifecycle/lifecycle-tiles.ts`:

```ts
import { zoneMidnight, shiftKey } from "../../calendar/day-keys";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS, countsByChannelWords, type ConsentChannel } from "../../consent/consent-channels";
import { GET_YES_ROUTE } from "../../people/people-lists";
import type { PersonRowVM } from "../../people/person-row";
import { fmtDay } from "../../reports/reports";
import { clockHour, clockNear, clockTime, zoneDayKey } from "../../shared/clock";
import { HOUR_MS } from "../../shared/time";
import { plural } from "../../shared/words";
```

then its unchanged `import type { … } from "./lifecycle-types";` and `import { LIFECYCLE_WORDS } from "./lifecycle-words";`, then:

```ts
import { todayRunWords } from "../../today/today-runs";
import { waitingRunOffer } from "../playbook-approval";
import { DAY_MS } from "../playbook-time";
import { playbookReach } from "../playbook-reach";
import { nextOpenMoment, nextRunOf } from "../playbook-schedule";
import { triggerOf } from "../playbook-triggers";
```

`ct/playbooks/lifecycle/lifecycle-types.ts`:

```ts
import type { ChannelStandingPart } from "../../broadcasts/channels-standing";
import type { ChannelsReady } from "../../broadcasts/reach-for";
import type { ConsentChannel } from "../../consent/consent-channels";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import type { CampaignMessage } from "../../templates/campaign-message";
import type { ChannelStand } from "../playbook-channels";
```

`ct/playbooks/lifecycle/lifecycle-words.ts`:

```ts
import type { ConsentChannel } from "../../consent/consent-channels";
import { clockHour } from "../../shared/clock";
import { CAMPAIGN_ROOMS, runStoppedWords } from "../../shell/campaign-rooms";
import { joinWords, plural } from "../../shared/words";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { WORKSPACE_PAUSED_FACT } from "../../workspace/billing";
import { SENDING_HOURS_WORDS } from "../playbook-triggers";
import type { LifecyclePlaybook, LifecycleSentence, LifecycleTone } from "./lifecycle-types";
```

- [ ] **Step 4: Point the barrel and the one direct importer at the new paths**

In `ct/playbooks/index.ts` replace:

```ts
export { campaignsHomeOf, lifecycleKicker } from "./lifecycle";
export { reachCountsOf } from "./lifecycle-tiles";
export { LIFECYCLE_WORDS, LIFECYCLE_TOAST, channelsGoesByWords } from "./lifecycle-words";
```

with:

```ts
export { campaignsHomeOf, lifecycleKicker } from "./lifecycle/lifecycle";
export { reachCountsOf } from "./lifecycle/lifecycle-tiles";
export { LIFECYCLE_WORDS, LIFECYCLE_TOAST, channelsGoesByWords } from "./lifecycle/lifecycle-words";
```

and `} from "./lifecycle-types";` (the end of the `export type { LifecycleAct, … }` block) with `} from "./lifecycle/lifecycle-types";`.

In `ct/ask-proposals/campaigns.ts:11` replace `from "../playbooks/lifecycle-words";` with `from "../playbooks/lifecycle/lifecycle-words";`.

Then find any importer this missed (expected: no output):

```bash
git grep -nE "from \"\.{1,2}/(playbooks/)?lifecycle(-tiles|-types|-words)?\"" -- packages apps ':!*/dist/*'
```

- [ ] **Step 5: Regenerate the browser entry, build, and prove nothing else changed**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
git diff -M --stat
git diff -M -- packages/contracts/src/playbooks/lifecycle
```

Expected: the stat shows four renames (`{ => lifecycle}/lifecycle….ts`) at 95% or more, `index.ts`, `campaigns.ts`, `browser.generated.ts` and `dist`; the second diff shows only `import` lines.

- [ ] **Step 6: Run the tests; the counts must equal Step 1's**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/lifecycle.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/channels-on-the-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/moments-offered.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/lint-boundaries.test.mjs
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/dashboard typecheck
```

Expected: every test file `# fail 0`, the four home files with the same `# pass` counts as Step 1; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/playbooks packages/contracts/src/ask-proposals/campaigns.ts packages/contracts/src/browser.generated.ts packages/contracts/dist
git commit -m "Campaigns' home's four lifecycle modules move, alone, to contracts' playbooks/lifecycle/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The glossary says the words first (spec §4.1 "Glossary first", §6 3(b))

**Files:**
- Modify: `docs/glossary.md` (the table under `## The words`, lines 40-104)
- Test (run only): `tests/docs/docs-paths.test.mjs`, `tests/docs/counts-are-dated.test.mjs`

`docs/naming.md` is the grammar and sends every new sense to the glossary ("a sense it does not give yet is written there first", `docs/naming.md:10-12`), so the rows go in `docs/glossary.md`'s one words table (see Open points). Cite no file this lane has not created yet: `docs-paths.test.mjs` fails a backticked path that opens nothing.

- [ ] **Step 1: Change the Moment row's last example**

In the `**Moment**` row replace `the month's offer, a visit, a proposal waiting` with `the month's offer, an appointment, a proposal waiting`.

- [ ] **Step 2: Add the two other senses of "held" after the `**Held** (a send)` row**

Insert these two rows directly under the row that begins `| **Held** (a send)`:

```markdown
| **Held** (a run's people) | The people a run did not reach: skipped by its checks or failed at the send | `broadcast_recipients.state` `skipped` and `failed`; the wire's `held` on a run's counts (`run_counts`, `playbook_totals`) | Sent's and a playbook's drawer's "held back" line. Not the breath's, below, and not a reach-out email the check stopped, above |
| **Held** (a moment's breath) | The people a moment would reach now who heard from the workspace this week and wait out the week's breath | `held` in a moment's pool (`triggerPools`, contracts `LifecyclePool.held`) and in the proposal follow-up's facts | One playbook message per person per week, across every moment (`PLAYBOOK_BREATH_MS`). Said as "heard from you this week and wait" |
```

- [ ] **Step 3: Add Campaign, the campaign reply window, Journey and the appointment word after the `**Campaigns**` row**

Insert under the row that begins `| **Campaigns**`:

```markdown
| **Campaign** | Anything the workspace sends on its own, one row each on Campaigns' home: a playbook on a moment or a list, the month's offer, a reach-out, a one-off send | `playbooks` (moments, lists, the month's offer; a reach-out is the `playbooks` rows of `kind = 'reach_out'`), and a `broadcasts` row with no `playbook_id` | The word a person reads, everywhere (D19): never "playbook" on a page, never "sequence". The receptionist and the call's text stand on First contact as rows of their own kind and are never counted among the campaigns |
| **Campaign reply window** | The 72 hours after a run first reached a thread, in which a person's own words count as a reply to it | `campaign_reply_window()`; contracts `REPLY_WINDOW_MS` and `REPLY_WINDOW_WORDS` say the same span | Not `replyWindow`, WhatsApp's 24-hour window for a free-form reply (contracts' `config/policy.ts`) |
| **Journey** | The moments a workspace's customers pass through, in order: First contact, the day before an appointment, the day after, a proposal waiting where deals are on, quiet or lapsed | None: made by contracts `journeyOf` from how its customers buy, whether a calendar is connected and the appointment word | Drawn as Campaigns' rail and the ledger's groups. Every number on it is a moment's pool, never a funnel: a person can stand at several moments, and nothing is stored per person. Pages say "moment", code says `JourneyStage` |
| **Appointment word** | What a workspace calls an appointment: appointment, visit, meeting, session or lesson | None yet: contracts `appointmentWordOf` derives it from `tenants.sells_by` (a meeting where deals are on, else an appointment); its column comes with the journey lane (D40) | Words only: it changes no moment, run, list or send, and the code keeps `visit` in its ids (`visit_tomorrow`, `visited`). Never call, consultation or booking, which each name something else here |
```

- [ ] **Step 4: Format and check**

```bash
corepack pnpm exec prettier --write docs/glossary.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/counts-are-dated.test.mjs
```

Expected: prettier realigns the table; both tests `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add docs/glossary.md
git commit -m "The glossary names a campaign, its reply window, the journey, the appointment word and the three senses of held

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The appointment word and the journey earn `ct/journey/` (spec §4.8 J1, J2; D40–D42, D45, D46)

**Files:**
- Create: `ct/journey/appointment-word.ts`, `ct/journey/journey.ts`, `ct/journey/index.ts`
- Create: `tests/journey/journey.test.mjs` (its first five tests; Task 12 adds the scan and the ratchet)
- Modify: `ct/index.ts:13`, `eslint.config.mjs:320-372` (`LIMITED_TREES`), `docs/debt.md:261`, `docs/takeover.md:66`, `docs/architecture.md` (the drawn tree), `ct/browser.generated.ts`
- Test: `tests/journey/journey.test.mjs`, `tests/repo/contracts-barrels.test.mjs`, `tests/repo/lint-boundaries.test.mjs`, `tests/repo/debt-register.test.mjs`, `tests/docs/docs-tree.test.mjs`, `tests/shipping/browser-entry.test.mjs`

A new contracts folder is a candidate tree (it has an `index.ts`) that the complexity ratchet holds nothing in, so it joins `LIMITED_TREES` in the same change (`tests/repo/lint-boundaries.test.mjs`, "a tree joins LIMITED_TREES…"); every function in it takes one object, so it does not join `WIDE_PARAMS`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/journey/journey.test.mjs`:

```js
/**
 * The journey follows the business (spec 2026-10-09 §4.8, J1 and J2): what a workspace calls an appointment, derived
 * now and stored later (appointmentWordOf), every phrase the word makes said once (appointmentWords), and the moments in
 * the order its customers pass through them (journeyOf), for the four shapes a workspace can have: with a calendar or
 * not, with deals or not. Executed over contracts' own functions; the one-word scan over the view models is below them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

/** The four shapes: a calendar connected or not, deals on or not. */
const SHAPES = [
  { calendarOn: false, dealsOn: false },
  { calendarOn: true, dealsOn: false },
  { calendarOn: true, dealsOn: true },
  { calendarOn: false, dealsOn: true },
];
const NONE_HELD = new Set();

test("the set is five words, and call, consultation, booking and class are not among them", () => {
  assert.deepEqual([...C.APPOINTMENT_WORDS], ["appointment", "visit", "meeting", "session", "lesson"]);
  for (const w of C.APPOINTMENT_WORDS) assert.equal(C.isAppointmentWord(w), true, w);
  for (const w of ["call", "consultation", "booking", "class", "Visit", "", null, 3])
    assert.equal(C.isAppointmentWord(w), false, String(w));
});

test("the word is the one picked, else a meeting where deals are on, else an appointment; nothing else is read", () => {
  assert.equal(C.appointmentWordOf({ stored: "session", sellsBy: "proposal" }), "session", "a pick outranks the shape");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "proposal" }), "meeting");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: "booking" }), "appointment");
  assert.equal(C.appointmentWordOf({ stored: null, sellsBy: null }), "appointment", "not asked yet: an appointment");
  assert.equal(C.appointmentWordOf({ stored: "class", sellsBy: null }), "appointment", "a word outside the set is no pick");
});

test("each word says its phrases once, with its own article and verb", () => {
  const visit = C.appointmentWords("visit");
  assert.deepEqual(
    [visit.before.caps, visit.before.name, visit.after.caps, visit.a],
    ["Visit tomorrow", "Visit reminder", "After the visit", "a visit"],
  );
  assert.equal(visit.offTomorrow(1), "Off · 1 person visits tomorrow");
  assert.equal(visit.offTomorrow(3), "Off · 3 people visit tomorrow");
  assert.equal(visit.offYesterday(2), "Off · 2 people visited yesterday");
  assert.equal(visit.tomorrowWho, "everyone with a visit tomorrow");
  assert.equal(visit.yesterdayWho, "everyone who visited yesterday");
  assert.equal(visit.lapsedHint, "No visit in 45 days, and nothing booked");
  const meeting = C.appointmentWords("meeting");
  assert.deepEqual(
    [meeting.before.caps, meeting.before.name, meeting.after.caps, meeting.a],
    ["Meeting tomorrow", "Meeting reminder", "After the meeting", "a meeting"],
  );
  assert.equal(meeting.offTomorrow(1), "Off · 1 person has a meeting tomorrow");
  assert.equal(meeting.offTomorrow(3), "Off · 3 people have a meeting tomorrow");
  assert.equal(meeting.offYesterday(3), "Off · 3 people had a meeting yesterday");
  assert.equal(meeting.byMany, "by meetings");
  const appointment = C.appointmentWords("appointment");
  assert.equal(appointment.a, "an appointment");
  assert.equal(appointment.before.hint, "The day before an appointment on the calendar");
  assert.equal(appointment.after.hint, "The day after an appointment, when nothing is booked next");
  assert.equal(appointment.startsWith, "an appointment tomorrow, an appointment yesterday");
  assert.equal(
    appointment.needsCalendar,
    "Appointments are read from your calendar, and none is connected. Connect one under Settings › Business.",
  );
});

test("journeyOf: the moments in the journey's order for each shape, Proposal waiting before Quiet, ids free of the word", () => {
  for (const shape of SHAPES) {
    const stages = C.journeyOf({ ...shape, word: "appointment", held: NONE_HELD });
    const ids = stages.map((s) => s.id);
    assert.deepEqual(
      ids,
      shape.dealsOn
        ? ["first_contact", "before", "after", "proposal", "quiet"]
        : ["first_contact", "before", "after", "quiet"],
      JSON.stringify(shape),
    );
    for (const id of ids) assert.ok(C.JOURNEY_STAGE_IDS.includes(id), id);
    assert.deepEqual(
      stages.filter((s) => s.unmet === "calendar").map((s) => s.id),
      shape.calendarOn ? [] : ["before", "after"],
      `${JSON.stringify(shape)}: the appointment moments need a calendar`,
    );
    assert.equal(stages.find((s) => s.id === "quiet").trigger, shape.calendarOn ? "lapsed" : "quiet_30");
    assert.equal(stages[0].kind, "receptionist");
    assert.ok(stages.slice(1).every((s) => s.kind === "moment"));
  }
  // A stage that holds a campaign is drawn whatever the shape: a follow-up made while deals were on.
  const held = C.journeyOf({ calendarOn: true, dealsOn: false, word: "appointment", held: new Set(["proposal"]) });
  assert.deepEqual(
    held.map((s) => s.id),
    ["first_contact", "before", "after", "proposal", "quiet"],
  );
  const session = C.journeyOf({ calendarOn: true, dealsOn: true, word: "session", held: NONE_HELD });
  assert.deepEqual(
    session.map((s) => s.caps),
    ["First contact", "Session tomorrow", "After the session", "Proposal waiting", "Quiet or lapsed"],
  );
  assert.deepEqual(
    session.map((s) => s.name),
    ["Your receptionist", "Session reminder", "How did it go", "Proposal follow-up", "Win-back"],
  );
  assert.deepEqual(
    session.map((s) => s.one),
    [false, false, false, true, false],
    "the follow-up is the one moment that holds at most one campaign (00167)",
  );
  const off = Object.fromEntries(session.map((s) => [s.id, s.off]));
  assert.equal(off.first_contact, null, "the receptionist is nobody's to turn on");
  assert.deepEqual([off.before.hint, off.before.when, off.before.why(3)], ["tomorrow", { day: "Every", at: "day" }, "Off · 3 people have a session tomorrow"]);
  assert.deepEqual([off.after.hint, off.after.when], ["yesterday", { day: "The day", at: "after" }]);
  assert.deepEqual([off.proposal.why(1), off.quiet.why(2)], ["Off · 1 proposal waiting", "Off · 2 people have gone quiet"]);
});

test("journeyStageOf: the stage a campaign's trigger stands on, and none for a list, the month's offer or a reach-out's step", () => {
  const cases = {
    new_week: "first_contact",
    phoned_only: "first_contact",
    visit_tomorrow: "before",
    visited: "after",
    proposal_waiting: "proposal",
    quiet_30: "quiet",
    lapsed: "quiet",
    saved_list: null,
    everyone_monthly: null,
    lead_first: null,
    after_step: null,
  };
  for (const [trigger, stage] of Object.entries(cases)) assert.equal(C.journeyStageOf(trigger), stage, trigger);
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
git add -N tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
```

Expected: FAIL, `C.APPOINTMENT_WORDS is not iterable` (or `undefined`).

- [ ] **Step 3: Write `ct/journey/appointment-word.ts`**

```ts
/**
 * What a workspace calls an appointment (J1; decisions 40 to 42 of the spec of 9 Oct 2026): appointment, visit, meeting,
 * session or lesson. Derived now, stored later: `appointmentWordOf` reads what the workspace picked (`stored`, null until
 * the journey lane gives it a column beside `tenants.sells_by` and a Settings › Business row) and else how its customers
 * buy: a meeting where some get a proposal first (dealsAreOn, 0008), an appointment everywhere else. Words only: it
 * changes no moment, run, list or send, and the code keeps `visit` in its ids (`visit_tomorrow`, `visited`, the `visit`
 * kind). Every phrase the word makes is written once here (`appointmentWords`), so a page is handed the word and says
 * nothing of its own.
 *
 * Out on purpose: "call" (the glossary's Call, a phone conversation, and People's Calls), "consultation" (0004's
 * consult-first appointment and its list) and "booking" (the act and the link, `bookings.tool`). "Class" is not in the set.
 */
import { dealsAreOn } from "../deals/sells-by";
import { capitalize, plural } from "../shared/words";

/** The words a workspace may call an appointment, in the order a picker offers them. */
export const APPOINTMENT_WORDS = ["appointment", "visit", "meeting", "session", "lesson"] as const;

export type AppointmentWord = (typeof APPOINTMENT_WORDS)[number];

/** Whether a value is one of the five: a stored word read back is checked, never trusted. */
export function isAppointmentWord(value: unknown): value is AppointmentWord {
  return typeof value === "string" && (APPOINTMENT_WORDS as readonly string[]).includes(value);
}

/**
 * What the workspace calls an appointment: the word it picked, else a meeting where some of its customers get a proposal
 * first and an appointment everywhere else. The one derivation: GET playbooks, Ask's shape and core's names all ask it.
 * Nothing is backfilled, so a salon reads "appointment" until it picks.
 */
export function appointmentWordOf(o: { stored: string | null; sellsBy: string | null }): AppointmentWord {
  if (isAppointmentWord(o.stored)) return o.stored;
  return dealsAreOn(o.sellsBy) ? "meeting" : "appointment";
}

/** How each word takes an article and a verb. Visit is the one that is a verb itself: "visits tomorrow", "visited". */
const FORMS: Record<AppointmentWord, { a: string; has: string; have: string; had: string }> = {
  appointment: { a: "an appointment", has: "has an appointment", have: "have an appointment", had: "had an appointment" },
  visit: { a: "a visit", has: "visits", have: "visit", had: "visited" }, // trade-word: the word's own forms, said once
  meeting: { a: "a meeting", has: "has a meeting", have: "have a meeting", had: "had a meeting" },
  session: { a: "a session", has: "has a session", have: "have a session", had: "had a session" },
  lesson: { a: "a lesson", has: "has a lesson", have: "have a lesson", had: "had a lesson" },
};

/** Every phrase the word makes, as Campaigns, its drawer, its approval sheet, its composer and core's refusals say it. */
export interface AppointmentPhrases {
  word: AppointmentWord;
  /** "appointment", "appointments", "an appointment", "Appointment". */
  one: string;
  many: string;
  a: string;
  Title: string;
  /** The day before: the moment's caption, a new campaign's name on it, and the trigger's hint. */
  before: { caps: string; name: string; hint: string };
  /** The day after: the moment's caption, which is also a new campaign's name on it, and the trigger's hint. */
  after: { caps: string; hint: string };
  /** The win-back by appointments' hint. */
  lapsedHint: string;
  /** A schedule's who: "everyone with an appointment tomorrow", "everyone who had an appointment yesterday". */
  tomorrowWho: string;
  yesterdayWho: string;
  /** What "of 312" counts: "with an appointment tomorrow", "who had an appointment yesterday". */
  withTomorrow: string;
  whoYesterday: string;
  /** The approval sheet's rule lines. */
  eachTomorrow: string;
  eachYesterday: string;
  /** Coming up's line for an off moment with people waiting. */
  offTomorrow: (n: number) => string;
  offYesterday: (n: number) => string;
  /** Core's refusal names the two moments: "an appointment tomorrow, an appointment yesterday". */
  startsWith: string;
  /** "by appointments": how the win-back reads people where a calendar is connected. */
  byMany: string;
  /** Core's refusal of an appointment moment where no calendar is connected. */
  needsCalendar: string;
}

export function appointmentWords(word: AppointmentWord): AppointmentPhrases {
  const f = FORMS[word];
  const Title = capitalize(word);
  const many = `${word}s`;
  const people = (n: number) => plural(n, "person", "people");
  return {
    word,
    one: word,
    many,
    a: f.a,
    Title,
    before: { caps: `${Title} tomorrow`, name: `${Title} reminder`, hint: `The day before ${f.a} on the calendar` },
    after: { caps: `After the ${word}`, hint: `The day after ${f.a}, when nothing is booked next` },
    lapsedHint: `No ${word} in 45 days, and nothing booked`,
    tomorrowWho: `everyone with ${f.a} tomorrow`,
    yesterdayWho: `everyone who ${f.had} yesterday`,
    withTomorrow: `with ${f.a} tomorrow`,
    whoYesterday: `who ${f.had} yesterday`,
    eachTomorrow: `each has ${f.a} tomorrow on the calendar`,
    eachYesterday: `each ${f.had} yesterday and has nothing booked next`,
    offTomorrow: (n) => `Off · ${people(n)} ${n === 1 ? f.has : f.have} tomorrow`,
    offYesterday: (n) => `Off · ${people(n)} ${f.had} yesterday`,
    startsWith: `${f.a} tomorrow, ${f.a} yesterday`,
    byMany: `by ${many}`,
    needsCalendar: `${capitalize(many)} are read from your calendar, and none is connected. Connect one under Settings › Business.`,
  };
}
```

- [ ] **Step 4: Write `ct/journey/journey.ts`**

```ts
/**
 * The journey (J2; decisions 44 to 46 of the spec of 9 Oct 2026): the moments a workspace's customers pass through, in
 * the order they pass, made from how the business works and never stored yet. First contact (the receptionist's), the day
 * before an appointment, the day after, a proposal waiting where deals are on, then quiet or lapsed: a proposal is out
 * before a customer goes quiet, so it stands before Quiet (D45). A stage that holds a campaign is drawn whatever the
 * shape, so a follow-up made while deals were on still says it runs nothing here. Without a calendar the two
 * appointment moments cannot be counted (`unmet`): Campaigns says they need one, never a zero (D44).
 *
 * Ids are free of the word (`before`, not `visit`, D46): they become addresses (`campaigns/in:before`), and an address
 * must not change when a workspace changes what it calls an appointment. Every number on a stage is its pool, never a
 * funnel: nothing is stored per person. What Turn on and an off line in Coming up say is the stage's own (`off`), so no
 * page or tile keys a sentence by a closed list of ids.
 */
import { plural } from "../shared/words";
import { appointmentWords, type AppointmentWord } from "./appointment-word";

export const JOURNEY_STAGE_IDS = ["first_contact", "before", "after", "proposal", "quiet"] as const;

export type JourneyStageId = (typeof JOURNEY_STAGE_IDS)[number];

/** The kit's glyphs a stage's node draws (a subset of Campaigns' LifecycleGlyph). */
export type JourneyGlyph = "chat" | "bell" | "check" | "deal" | "refresh";

export interface JourneyStage {
  id: JourneyStageId;
  /** The receptionist's (no campaign of its own leads it), or a moment campaigns run on. */
  kind: "receptionist" | "moment";
  caps: string;
  /** What its card is called while no campaign stands on it. */
  name: string;
  glyph: JourneyGlyph;
  /** What its figure counts: "this week", "people", "yesterday", "waiting". */
  unit: string;
  /** The moment a new campaign on it starts from: the win-back the workspace can read for Quiet; null for First contact. */
  trigger: string | null;
  /** The triggers whose campaigns stand on it: both win-backs on Quiet, the retired welcome and number-saver on First contact. */
  holds: readonly string[];
  /** The pool its figure is counted from: "new_week" for First contact, else its trigger. */
  poolKey: string;
  /** Why it cannot be counted here: the appointment moments without a calendar. Null where it can. */
  unmet: "calendar" | null;
  /** It holds one campaign at most (the follow-up, 00167): its Turn on leaves once one stands on it. */
  one: boolean;
  /** What Turn on says it reaches ("· 3 tomorrow") and what an off line in Coming up says; null for First contact. */
  off: { hint: string; when: { day: string; at: string }; why: (n: number) => string } | null;
}

/** Which stage each trigger's campaigns stand on: a list's, the month's offer and a reach-out's steps stand on none. */
const HOLDS: Record<JourneyStageId, readonly string[]> = {
  first_contact: ["new_week", "phoned_only"],
  before: ["visit_tomorrow"],
  after: ["visited"],
  proposal: ["proposal_waiting"],
  quiet: ["quiet_30", "lapsed"],
};

/** The stage a campaign's trigger stands on, or null for one that stands on none. */
export function journeyStageOf(trigger: string): JourneyStageId | null {
  return JOURNEY_STAGE_IDS.find((id) => HOLDS[id].includes(trigger)) ?? null;
}

const people = (n: number) => plural(n, "person", "people");

/**
 * The stages, in order, for a workspace's shape: `calendarOn` a calendar connected (its feed readable now or not),
 * `dealsOn` some customers get a proposal first, `word` what it calls an appointment, `held` the stages a campaign stands
 * on. Pure and total.
 */
export function journeyOf(s: {
  calendarOn: boolean;
  dealsOn: boolean;
  word: AppointmentWord;
  held: ReadonlySet<JourneyStageId>;
}): JourneyStage[] {
  const W = appointmentWords(s.word);
  const unmet = s.calendarOn ? null : ("calendar" as const);
  const winBack = s.calendarOn ? "lapsed" : "quiet_30";
  const every = { day: "Every", at: "day" };
  const stages: JourneyStage[] = [
    {
      id: "first_contact",
      kind: "receptionist",
      caps: "First contact",
      name: "Your receptionist",
      glyph: "chat",
      unit: "this week",
      trigger: null,
      holds: HOLDS.first_contact,
      poolKey: "new_week",
      unmet: null,
      one: false,
      off: null,
    },
    {
      id: "before",
      kind: "moment",
      caps: W.before.caps,
      name: W.before.name,
      glyph: "bell",
      unit: "people",
      trigger: "visit_tomorrow",
      holds: HOLDS.before,
      poolKey: "visit_tomorrow",
      unmet,
      one: false,
      off: { hint: "tomorrow", when: every, why: W.offTomorrow },
    },
    {
      id: "after",
      kind: "moment",
      caps: W.after.caps,
      name: "How did it go",
      glyph: "check",
      unit: "yesterday",
      trigger: "visited",
      holds: HOLDS.after,
      poolKey: "visited",
      unmet,
      one: false,
      off: { hint: "yesterday", when: { day: "The day", at: "after" }, why: W.offYesterday },
    },
    {
      id: "proposal",
      kind: "moment",
      caps: "Proposal waiting",
      name: "Proposal follow-up",
      glyph: "deal",
      unit: "waiting",
      trigger: "proposal_waiting",
      holds: HOLDS.proposal,
      poolKey: "proposal_waiting",
      unmet: null,
      one: true,
      off: { hint: "waiting", when: { day: "When one", at: "waits" }, why: (n) => `Off · ${plural(n, "proposal")} waiting` },
    },
    {
      id: "quiet",
      kind: "moment",
      caps: "Quiet or lapsed",
      name: "Win-back",
      glyph: "refresh",
      unit: "people",
      trigger: winBack,
      holds: HOLDS.quiet,
      poolKey: winBack,
      unmet: null,
      one: false,
      off: {
        hint: "quiet",
        when: every,
        why: (n) => `Off · ${people(n)} ${n === 1 ? "has" : "have"} gone quiet`,
      },
    },
  ];
  return stages.filter((x) => x.id !== "proposal" || s.dealsOn || s.held.has("proposal"));
}
```

- [ ] **Step 5: Write the barrel and name it in the root index**

Create `ct/journey/index.ts`:

```ts
/** The journey: what a workspace calls an appointment, and the moments its customers pass through, in order. */
export { APPOINTMENT_WORDS, appointmentWordOf, appointmentWords, isAppointmentWord } from "./appointment-word";
export type { AppointmentPhrases, AppointmentWord } from "./appointment-word";
export { JOURNEY_STAGE_IDS, journeyOf, journeyStageOf } from "./journey";
export type { JourneyGlyph, JourneyStage, JourneyStageId } from "./journey";
```

In `ct/index.ts`, after the line `export * from "./google";`, add:

```ts
export * from "./journey";
```

Then:

```bash
git add -N packages/contracts/src/journey/appointment-word.ts packages/contracts/src/journey/journey.ts packages/contracts/src/journey/index.ts
```

- [ ] **Step 6: The new tree joins `LIMITED_TREES`, and the pages that count the trees follow**

In `eslint.config.mjs`, in `LIMITED_TREES`, after `"packages/contracts/src/google",` add:

```js
  "packages/contracts/src/journey",
```

Then bank the register's block and redraw the architecture tree (both read `git ls-files`, hence the `git add -N` above):

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-tree.test.mjs
git diff -- docs/debt.md docs/takeover.md docs/architecture.md
```

Expected: `docs/debt.md:261` and `docs/takeover.md:66` read `trees the lint's limits hold         52   16 of them with max-params waiting`; `docs/architecture.md`'s tree gains `  journey/` under `packages/contracts/src/` between `google/` and `leads/`. If the bank did not rewrite a page, change `51` to `52` on that line by hand and add the `  journey/` line by hand, exactly as shown.

- [ ] **Step 7: Build, regenerate the browser entry, run the tests**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/lint-boundaries.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-tree.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm --filter @chanlytics/contracts typecheck
corepack pnpm exec prettier --write packages/contracts/src/journey eslint.config.mjs tooling/scripts/tests/journey/journey.test.mjs
```

Expected: every test file `# fail 0` (`journey.test.mjs`: `# pass 5`); typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/journey packages/contracts/src/index.ts packages/contracts/src/browser.generated.ts packages/contracts/dist eslint.config.mjs docs/debt.md docs/takeover.md docs/architecture.md tooling/scripts/tests/journey/journey.test.mjs
git commit -m "A workspace's appointment word is derived from how its customers buy, and its journey from its shape, in contracts' journey/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The period named once, a chain's own totals, and the types the reads hand the home (spec §4.1, §4.5; corrections 15–17)

Additive only: nothing reads these until Tasks 6–11.

**Files:**
- Modify: `ct/reports/report-periods.ts` (beside `REPORT_PERIOD_DEFAULT`, and `fixedDaysOf` at its line 35)
- Modify: `ct/reports/reach-out-report.ts` (after `ReachOutReportDto`)
- Modify: `ct/reports/index.ts`, `ct/playbooks/lifecycle/lifecycle-types.ts`, `ct/playbooks/index.ts`, `ct/browser.generated.ts`
- Test: `tests/reports/periods/report-periods.test.mjs`, `tests/reach-out-back/report-words.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/reports/periods/report-periods.test.mjs` (add `CAMPAIGNS_RESULTS_PERIOD` to its `import { … } from "@chanlytics/contracts"` list):

```js
test("Campaigns counts its campaigns over one of Reports' fixed periods, named once: thirty days", () => {
  assert.equal(CAMPAIGNS_RESULTS_PERIOD, "30d");
  assert.equal(fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD), 30);
});
```

(If `fixedDaysOf` is not yet in that file's import list, add it too.)

Append to `tooling/scripts/tests/reach-out-back/report-words.test.mjs` (add `chainTotalsOf, chainTotalsFromReport` to its contracts import):

```js
test("a chain's own totals: every chain counted by the function, each by its root; a report's twenty are not every chain", () => {
  const ROOT_A = "11111111-1111-4111-8111-111111111111";
  const ROOT_B = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(
    chainTotalsOf({
      [ROOT_A]: { written: 40, wrote_back: 6, last_at: "2026-09-28T15:00:00Z" },
      [ROOT_B]: { written: 0, wrote_back: 0, last_at: null },
    }),
    { complete: true, by_root: { [ROOT_A]: { written: 40, wrote_back: 6 }, [ROOT_B]: { written: 0, wrote_back: 0 } } },
  );
  assert.deepEqual(chainTotalsOf({}), { complete: true, by_root: {} }, "a workspace with no chain");
  for (const bad of [null, "x", [], { [ROOT_A]: { written: "40" } }, { [ROOT_A]: null }])
    assert.equal(chainTotalsOf(bad), null, `${JSON.stringify(bad)} is no answer of the function`);
  // A database before the function: the report's own chains, its steps summed, and not every chain.
  const step = (written, wrote_back) => ({ ...counts({ written, wrote_back }), id: "s", n: 1, hand: null });
  const fromReport = chainTotalsFromReport({
    chains: [{ root_id: ROOT_A, name: "A", state: "running", search: null, last_at: null, runs: 2, steps: [step(30, 4), step(10, 2)] }],
  });
  assert.deepEqual(fromReport, { complete: false, by_root: { [ROOT_A]: { written: 40, wrote_back: 6 } } });
});
```

(`counts` is that file's own helper at its top.)

- [ ] **Step 2: Run them to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/report-words.test.mjs
```

Expected: FAIL, `CAMPAIGNS_RESULTS_PERIOD` is `undefined` / `chainTotalsOf is not a function`.

- [ ] **Step 3: Name the period, and let a fixed period's days be typed as a number**

In `ct/reports/report-periods.ts`, after `export const REPORT_PERIOD_DEFAULT: ReportPeriodId = "30d";` add:

```ts
/**
 * The period Campaigns counts its campaigns over: the ledger's "Last 30 days", What came back, and the reads the
 * document's head starts for the page (shell/route-prefetch.ts) and its results surface makes. One of Reports' own fixed
 * counts of days, never Month, so its days are a number (fixedDaysOf).
 */
export const CAMPAIGNS_RESULTS_PERIOD = "30d" satisfies ReportPeriodId;
```

Replace the arrow `fixedDaysOf` with an overloaded function, so a fixed period's days need no fallback:

```ts
/** The days of a period that is a count of days; null for Month. A fixed period's are a number. */
export function fixedDaysOf(period: Exclude<ReportPeriodId, "month">): number;
export function fixedDaysOf(period: ReportPeriodId): number | null;
export function fixedDaysOf(period: ReportPeriodId): number | null {
  return REPORT_RANGES.find((r) => r.id === period)?.days ?? null;
}
```

In `ct/reports/index.ts`, beside `REPORT_PERIOD_DEFAULT,` in the `report-periods` export list, add `CAMPAIGNS_RESULTS_PERIOD,`.

- [ ] **Step 4: A chain's own totals, and the fallback from the report**

In `ct/reports/reach-out-report.ts`, after the `ReachOutReportDto` interface, add:

```ts
/**
 * Each reach-out's numbers over a period, by its first step's id (`reach_out_chain_totals`, one pass, every chain of the
 * workspace): what it wrote, and how many wrote back, in Reports' words. `complete` says every chain was counted, so one
 * absent from `by_root` wrote nothing; it is false where the numbers come from the report's own chains (a database
 * before the function, chainTotalsFromReport), which holds at most twenty, so one absent may be past the twenty and says
 * "—". GET reports/reach-outs answers it beside the report (spec 2026-10-09 §4.5).
 */
export interface ReachOutChainTotalsDto {
  complete: boolean;
  by_root: Record<string, { written: number; wrote_back: number }>;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** The function's answer, checked (no cast): each root's written and wrote back; null for anything else. */
export function chainTotalsOf(answer: unknown): ReachOutChainTotalsDto | null {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const by_root: ReachOutChainTotalsDto["by_root"] = {};
  for (const [root, value] of Object.entries(answer)) {
    const v = value as { written?: unknown; wrote_back?: unknown } | null;
    if (!v || !isCount(v.written) || !isCount(v.wrote_back)) return null;
    by_root[root] = { written: v.written, wrote_back: v.wrote_back };
  }
  return { complete: true, by_root };
}

/** The report's own chains, each its steps summed: what a database before the function can say, and not every chain. */
export function chainTotalsFromReport(report: Pick<ReachOutReportDto, "chains">): ReachOutChainTotalsDto {
  const by_root: ReachOutChainTotalsDto["by_root"] = {};
  for (const c of report.chains) {
    by_root[c.root_id] = {
      written: c.steps.reduce((sum, s) => sum + s.written, 0),
      wrote_back: c.steps.reduce((sum, s) => sum + s.wrote_back, 0),
    };
  }
  return { complete: false, by_root };
}
```

In `ct/reports/index.ts`, where `reach-out-report` is exported, add `chainTotalsOf, chainTotalsFromReport` to the value list and `ReachOutChainTotalsDto` to its `export type { … }` list (create that type line if the module has none: `export type { ReachOutChainTotalsDto } from "./reach-out-report";`).

- [ ] **Step 5: The types the reads hand the home (additive)**

In `ct/playbooks/lifecycle/lifecycle-types.ts`, add at the top among the imports:

```ts
import type { AppointmentWord } from "../../journey/appointment-word";
```

and after the `LifecycleReport` interface add:

```ts
/**
 * One campaign's last 30 days as campaign_series counts them (its `sources`): a playbook's by its id; a one-off send's,
 * and each run of a playbook since deleted (broadcasts.playbook_id is set null), by its run's id.
 */
export interface LifecycleSource {
  id: string;
  kind: "playbook" | "broadcast";
  name: string;
  sent: number;
  replied: number;
  /** When it last sent, an ISO time; null where it never did. */
  lastAt: string | null;
}

/**
 * Each reach-out's last 30 days, by its root (GET reports/reach-outs' `chains`). `complete`: every chain was counted, so
 * one absent wrote nothing; false where they come from the report's twenty, so one absent may be past them and says "—".
 */
export interface LifecycleChains {
  complete: boolean;
  byRoot: Readonly<Partial<Record<string, { written: number; wroteBack: number }>>>;
}

/** How the business works, as the home reads it (the playbooks surface's, from GET playbooks' businessShape). */
export interface LifecycleShape {
  /**
   * "feed": a calendar is connected, its feed readable now or not; "email": none, but a booking tool's notices arrive by
   * email; "none": neither. The appointment moments are counted only from a feed (decision 0002's readers lane owes the rest).
   */
  calendar: "feed" | "email" | "none";
  dealsOn: boolean;
  word: AppointmentWord;
}
```

Change the `LifecycleReport` interface's body to carry its sources (a new required field):

```ts
  /** Each campaign's own numbers over the period (campaign_series' `sources`): the ledger's "Last 30 days" per row. */
  sources: readonly LifecycleSource[];
```

placed after its `byChannel?` field. Then in `ct/playbooks/index.ts`'s `export type { … } from "./lifecycle/lifecycle-types";` list add `LifecycleChains`, `LifecycleShape`, `LifecycleSource` in alphabetical place.

`LifecycleReport` is built in one place today, `cmp/broadcasts/surface.ts` `reportOf`; give it `sources` now so the dashboard compiles, by changing its return to:

```ts
  return {
    days: vm.days,
    totals: vm.totals,
    sources: read.report.sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      sent: s.sent,
      replied: s.replied,
      lastAt: s.last_at,
    })),
    ...(byChannel.length > 0 ? { byChannel } : {}),
  };
```

and in `cmp/broadcasts/sample.ts:205` change `report: { days: 30, totals: { … } },` to add `sources: [],` after `totals`.

- [ ] **Step 6: Build, regenerate, run**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/report-words.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/dashboard typecheck
```

Expected: `# fail 0` each; typecheck exit 0. If typecheck names a test fixture or sample that builds a `LifecycleReport` without `sources`, add `sources: []` there.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/reports packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts apps/dashboard/src/surfaces/campaigns/broadcasts/sample.ts tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reach-out-back/report-words.test.mjs
git commit -m "Campaigns' period is named once, a reach-out's own totals are typed and checked, and a report carries each campaign's sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: An appointment moment needs a calendar, and says the workspace's word, in contracts and core (spec §4.8 "Needs your calendar", "One page, one word"; §6 3(d); D43, D44)

The calendar rule is one predicate (`momentOffered`) that core's check asks, so both change together. New campaigns are named in the word through core's ports; stored names keep theirs (D43); ids never change.

**Files:**
- Modify: `ct/playbooks/playbook-triggers.ts` (`PLAYBOOK_TRIGGERS` lines 45-76, `hintOf` and `WIN_BACK_WORDS` lines 222-228, `momentOffered` lines 230-244)
- Modify: `ct/playbooks/playbooks.ts` (its `export { … } from "./playbook-triggers"` list), `ct/playbooks/index.ts:13`
- Modify: `core/campaigns/check-playbook.ts` (imports; `CheckPlaybookPorts`; `refuseMoment`; `checkPlaybook`), `core/campaigns/template-values.ts:60, 76`
- Modify: `srv/campaigns/playbooks.ts` (`checkPlaybookInput`'s ports)
- Test: `tests/playbooks/home/moments-offered.test.mjs`, `tests/broadcasts/core-campaigns.test.mjs`, and the peers listed in Step 8

- [ ] **Step 1: Write the failing contracts tests**

In `tooling/scripts/tests/playbooks/home/moments-offered.test.mjs`, in the import list replace `WIN_BACK_WORDS,` with `triggerWords,` and `winBackWords,`. Replace the two `OFFERED` lines at the top of the first test with:

```js
  // Without a calendar: the win-back by silence, and no appointment moment (D44). With one: by visits, and both.
  assert.deepEqual(OFFERED(false), ["quiet_30", "everyone_monthly", "saved_list"]);
  assert.deepEqual(OFFERED(true), ["everyone_monthly", "visit_tomorrow", "visited", "lapsed", "saved_list"]);
```

replace `assert.deepEqual(Object.keys(WIN_BACK_WORDS).sort(), ["lapsed", "quiet_30"]);` with `assert.deepEqual(Object.keys(winBackWords("appointment")).sort(), ["lapsed", "quiet_30"]);`, and add after that first test:

```js
test("an appointment moment is offered only where a calendar is connected: without one it would skip every day (D44)", () => {
  for (const dealsOn of [false, true]) {
    assert.equal(
      OFFERED(false, dealsOn).some((id) => triggerOf(id).kind === "visit"),
      false,
      `deals ${dealsOn}: no calendar, no appointment moment`,
    );
    assert.deepEqual(
      OFFERED(true, dealsOn).filter((id) => triggerOf(id).kind === "visit"),
      ["visit_tomorrow", "visited"],
    );
  }
  assert.equal(triggerOffered(triggerOf("visit_tomorrow"), false), true, "one made before keeps running: the run never asks");
});

test("a trigger says its label and hint in the workspace's word, and so do the win-back's refusals", () => {
  const t = (id) => triggerOf(id);
  assert.deepEqual(triggerWords(t("visit_tomorrow"), "meeting"), {
    label: "Meeting reminder",
    hint: "The day before a meeting on the calendar",
  });
  assert.deepEqual(triggerWords(t("visited"), "lesson"), {
    label: "After the lesson",
    hint: "The day after a lesson, when nothing is booked next",
  });
  assert.deepEqual(triggerWords(t("lapsed"), "session"), {
    label: "Win-back",
    hint: "No session in 45 days, and nothing booked",
  });
  assert.deepEqual(triggerWords(t("quiet_30"), "session"), { label: "Win-back", hint: "Nothing heard in 30 days" });
  assert.deepEqual(
    [t("visit_tomorrow").label, t("visited").label, t("lapsed").hint],
    ["Appointment reminder", "After the appointment", "No appointment in 45 days, and nothing booked"],
    "the constant says the default word: a workspace that never picked reads appointment (D42)",
  );
  const visits = winBackWords("visit");
  assert.equal(
    visits.lapsed,
    "The win-back by visits needs your calendar, and none is connected. Start the one that goes by silence: nothing heard in 30 days.",
  );
  assert.equal(
    visits.quiet_30,
    "A calendar is connected here, so the win-back goes by visits: no visit in 45 days, and nothing booked. Start that one.",
  );
});
```

- [ ] **Step 2: Write the failing core test**

In `tooling/scripts/tests/broadcasts/core-campaigns.test.mjs`, in `fakes()`'s `answers` object add after `calendarOn: false,`:

```js
    // What the workspace calls an appointment (contracts appointmentWordOf): "visit" here, so every sentence and name
    // these tests wrote before the word existed reads as it did; a test that is about the word names another.
    appointmentWord: "visit",
```

and add this test after the one that ends with `FOLLOW_UP_NEEDS_DEALS,` (the moments test near line 1600):

```js
test("an appointment moment needs a calendar, said in the workspace's word; a new one is named in it; one made before is kept", async () => {
  const utility = messageOf({ whatsapp: template({ category: "utility" }) });
  const visit = (trigger, over = {}) => ({ trigger, template_id: T1, params: [], ...over });
  await refused(
    checkPlaybook(fakes({ calendarOn: false, appointmentWord: "meeting", message: utility }).ports, visit("visit_tomorrow"), null),
    "validation",
    400,
    "Meetings are read from your calendar, and none is connected. Connect one under Settings › Business.",
  );
  // A reminder made before the rule keeps running, and is changed where it is.
  const kept = await checkPlaybook(
    fakes({ calendarOn: false, message: utility }).ports,
    visit("visit_tomorrow", { name: "Kept" }),
    { trigger: "visit_tomorrow" },
  );
  assert.equal(kept.name, "Kept");
  // A new one given no name takes its moment's, in the word (D43: a stored name keeps its own).
  const made = await checkPlaybook(
    fakes({ calendarOn: true, appointmentWord: "session", message: utility }).ports,
    visit("visited"),
    null,
  );
  assert.match(made.name, /^After the session/);
  // The refusal that names the moments says them in the word too.
  await refused(
    checkPlaybook(fakes({ appointmentWord: "lesson" }).ports, { template_id: T1, params: [] }, null),
    "validation",
    400,
    "a lesson tomorrow, a lesson yesterday",
  );
  // The word is asked only where it is said: a month's offer with no name never asks it.
  const quiet = fakes({ appointmentWord: new Error("asked") });
  assert.equal((await checkPlaybook(quiet.ports, { trigger: "everyone_monthly", template_id: T1, params: [] }, null)).trigger, "everyone_monthly");
});
```

- [ ] **Step 3: Run both to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/moments-offered.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/core-campaigns.test.mjs
```

Expected: FAIL: `triggerWords is not a function`; the OFFERED(false) list still holds `visit_tomorrow`; the core test's first refusal is not raised.

- [ ] **Step 4: Contracts: the default word in the constant, the word through `triggerWords`, the calendar rule**

In `ct/playbooks/playbook-triggers.ts`:

Add after the existing imports:

```ts
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
```

In `PLAYBOOK_TRIGGERS`, change the `visit_tomorrow` entry's `label: "Visit reminder"` to `label: "Appointment reminder"`; the `visited` entry's `label: "After the visit"` to `label: "After the appointment"` and its `hint` to `"The day after an appointment, when nothing is booked next"`; the `lapsed` entry's `hint` to `"No appointment in 45 days, and nothing booked"`. Replace the comment above `visited` (lines 53-57) with:

```ts
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
```

Replace `const hintOf = …` and the whole `WIN_BACK_WORDS` constant (lines 222-228) with:

```ts
/**
 * A trigger's label and hint in the workspace's word (J1): an appointment moment's say it ("Session reminder", "After
 * the session", "No session in 45 days…"); every other trigger's are its own. What the composer, the drawer, Ask's card
 * and a new campaign's name read, so a page says one word.
 */
export function triggerWords(
  t: { id: string; label: string; hint: string },
  word: AppointmentWord,
): { label: string; hint: string } {
  const W = appointmentWords(word);
  if (t.id === "visit_tomorrow") return { label: W.before.name, hint: W.before.hint };
  if (t.id === "visited") return { label: W.after.caps, hint: W.after.hint };
  if (t.id === "lapsed") return { label: t.label, hint: W.lapsedHint };
  return { label: t.label, hint: t.hint };
}

/** What the check says of the win-back this workspace cannot read, when a new campaign asks for it, in its word. */
export function winBackWords(word: AppointmentWord): { quiet_30: string; lapsed: string } {
  const W = appointmentWords(word);
  const silence = (triggerOf("quiet_30")?.hint ?? "").toLowerCase();
  return {
    quiet_30: `A calendar is connected here, so the win-back goes ${W.byMany}: ${W.lapsedHint.toLowerCase()}. Start that one.`,
    lapsed: `The win-back ${W.byMany} needs your calendar, and none is connected. Start the one that goes by silence: ${silence}.`,
  };
}
```

Replace `momentOffered`'s doc and body (lines 230-244) with:

```ts
/**
 * Whether a moment is offered for a NEW campaign (2 Oct 2026, the lifecycle set): offered here at all
 * (triggerOffered), not retired (MOMENTS_RETIRED), of the two win-backs the one this workspace can read (by visits where
 * a calendar is connected, by silence where none is), and an appointment moment only where a calendar is connected
 * (decision 44 of 9 Oct 2026): without one its run reads nothing and skips every day. Campaigns' moments, its composer,
 * Ask's proposals and the check that makes a campaign ask this; the run never does, so one made before keeps running.
 * `calendarOn` is a calendar connected here, whether or not its feed can be read just now: the page's calendar state is
 * not "none".
 */
export function momentOffered(t: { id: string; kind: string }, o: { dealsOn: boolean; calendarOn: boolean }): boolean {
  if (!triggerOffered(t, o.dealsOn)) return false;
  if (t.id in MOMENTS_RETIRED) return false;
  if (t.id === "quiet_30") return !o.calendarOn;
  if (t.id === "lapsed" || t.kind === "visit") return o.calendarOn;
  return true;
}
```

In `ct/playbooks/playbooks.ts`'s `export { … } from "./playbook-triggers";` list replace `WIN_BACK_WORDS,` with `triggerWords,` and `winBackWords,`. In `ct/playbooks/index.ts`'s first export list replace `WIN_BACK_WORDS,` with `triggerWords,` and `winBackWords,`.

- [ ] **Step 5: Core: the word through the ports, the calendar rule, the three refusals**

In `core/campaigns/check-playbook.ts`, in the `@chanlytics/contracts` import list remove `WIN_BACK_WORDS,` and add `appointmentWords,`, `triggerWords,`, `winBackWords,` and `type AppointmentWord,`.

Add to `CheckPlaybookPorts`, after `calendarOn(): Promise<boolean>;`:

```ts
  /**
   * What the workspace calls an appointment (contracts appointmentWordOf): the words a refusal says, and the name a new
   * campaign on an appointment moment takes when it is given none. Asked only where one of those is said.
   */
  appointmentWord(): Promise<AppointmentWord>;
```

Replace `refuseMoment`'s doc's last sentence and its last three lines, so the function reads:

```ts
/**
 * The moment a playbook names: where it may run at all, and where it may be made new. A proposal follow-up where deals
 * are off has no proposal to follow (0006), whether it is made or changed; a playbook kept on its moment is not new,
 * so a retired moment's, the other win-back's and an appointment moment's made before a calendar was required keep
 * running and may be changed. A new one is held to what is offered now (contracts momentOffered), in the words for each
 * and in the workspace's word. Each fact is asked only of the moment it decides.
 */
async function refuseMoment(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  existing: { trigger: string } | null,
): Promise<void> {
  const dealsOn = trig.kind === "deal" ? await ports.dealsOn() : false;
  if (trig.kind === "deal" && !triggerOffered(trig, dealsOn)) throw new AppError("validation", FOLLOW_UP_NEEDS_DEALS);
  if (existing?.trigger === trig.id) return;
  const retired = MOMENTS_RETIRED[trig.id];
  if (retired) throw new AppError("validation", retired);
  const calendarOn = isWinBack(trig.id) || trig.kind === "visit" ? await ports.calendarOn() : false;
  if (momentOffered(trig, { dealsOn, calendarOn })) return;
  const word = await ports.appointmentWord();
  throw new AppError(
    "validation",
    trig.kind === "visit" ? appointmentWords(word).needsCalendar : winBackWords(word)[trig.id as "quiet_30" | "lapsed"],
  );
}

/** The name a campaign given none takes: its list's, an appointment moment's in the workspace's word, else its moment's. */
async function defaultLabel(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  listName: string | null,
): Promise<string> {
  if (listName) return listName;
  return trig.kind === "visit" ? triggerWords(trig, await ports.appointmentWord()).label : trig.label;
}
```

In `checkPlaybook`, replace the `if (!trig) throw new AppError("validation", "Pick what starts it: …");` statement with:

```ts
  if (!trig)
    throw new AppError(
      "validation",
      `Pick what starts it: win-back, the month's offer, ${appointmentWords(await ports.appointmentWord()).startsWith}, one of your lists, or a proposal waiting.`,
    );
```

and the returned `name:` line with:

```ts
    // A name when none was given: the moment's alone when it sends its own starter, else with the message's title; a
    // list's own name for a playbook on a list; an appointment moment's in the workspace's word (D43).
    name: (name || playbookName({ id: trig.id, label: await defaultLabel(ports, trig, listName) }, message)).slice(
      0,
      PLAYBOOK_NAME_MAX,
    ),
```

(the old comment above it goes; `name ||` short-circuits, so a named campaign never asks the word).

In `core/campaigns/template-values.ts`, change the refusal at line 60 to:

```ts
        "Each value is typed text, their first name, the business name, the booking link, the booked time or service, or a proposal's link.",
```

and the one at line 76 to:

```ts
          "Only a reminder the day before or the check the day after can fill in the booked time or service.",
```

- [ ] **Step 6: The dashboard's adapter answers the new port**

In `srv/campaigns/playbooks.ts` `checkPlaybookInput`, after the `calendarOn: async () => { … },` entry add:

```ts
      // What the workspace calls an appointment (contracts appointmentWordOf, the one derivation): a refusal's words, and
      // a new campaign's name on an appointment moment. Read only when one of them is said.
      appointmentWord: async () => appointmentWordOf({ stored: null, sellsBy: await sellsByOf(ctx, tenantId) }),
```

and add `appointmentWordOf` to that file's `@chanlytics/contracts` import (`sellsByOf` is already imported there; if not, import it from `"../people/deals"`).

- [ ] **Step 7: Build and run the two tests**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
corepack pnpm --filter @chanlytics/core build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/moments-offered.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/core-campaigns.test.mjs
```

Expected: both `# fail 0`. In `core-campaigns.test.mjs`, earlier tests that make a NEW campaign on `visit_tomorrow` or `visited` with `fakes()` (calendar off by default) now meet the calendar refusal; for each such failure whose message is "Visits are read from your calendar…", give that call's fakes `calendarOn: true` (the visit tests around lines 1113, 1333-1360 (`reminder()`), 1428, 1612, 1627, 1664-1690, 2004, 2053). A failure that quotes the old template-values words takes the new words of Step 5. Any other failure: stop and report it.

- [ ] **Step 8: Run every peer that pins these moments, labels or refusals**

```bash
for f in playbooks/visit-playbooks templates/message-versions broadcasts/campaigns-samples ask/ask-tool-names ask/ask-turn ask/ask-specs ask/readers broadcasts/ask-campaign-channels broadcasts/core-broadcast broadcasts/broadcasts-honest playbooks/playbook-composer playbooks/outbound-routes playbooks/playbooks calendar/calendar-counts playbooks/core-run-playbook playbooks/approval-sheet playbooks/runs-honest today/today-day today/today-page templates/message-versions-page templates/template-versions-meta playbooks/home/lifecycle playbooks/home/campaigns-home playbooks/home/channels-on-the-home; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
```

For each failure: an expectation of a list computed with `momentOffered(…, { calendarOn: false })` loses `visit_tomorrow` and `visited` (`message-versions.test.mjs:259`, `campaigns-samples.test.mjs:58`, `ask-tool-names.test.mjs:748`); an expected trigger label or hint read from `triggerOf(…)` takes the constant's new words ("Appointment reminder", "After the appointment", "The day after an appointment, when nothing is booked next", "No appointment in 45 days, and nothing booked"); an expected default name from a check takes the word of the fakes it ran with. A stored playbook name in a fixture ("Visit reminder") is a name, not a label, and stays. A home or composer test that offered an appointment moment with no calendar now gets none: give its fixture a connected calendar (`calendar: "ok"`) and leave its expectation. `ask/ask-tool-names.test.mjs` compares each old tool's answer with a frozen fixture and brings it up to date by named adjusters (`withCampaigns`, `withReviews`): if its `list_playbooks` answer now lacks `visit_tomorrow` and `visited` among `triggers` (that world has no calendar) or says their new default labels, add the adjuster `withJourneyWords(result)` that Task 7 Step 7 describes, now, for what this task changed. Anything else: stop and report.

- [ ] **Step 9: Typecheck, format, commit**

```bash
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/core --filter @chanlytics/dashboard typecheck
corepack pnpm exec prettier --write packages/contracts/src/playbooks/playbook-triggers.ts packages/contracts/src/playbooks/playbooks.ts packages/contracts/src/playbooks/index.ts packages/core/src/campaigns/check-playbook.ts packages/core/src/campaigns/template-values.ts apps/dashboard/src/server/campaigns/playbooks.ts tooling/scripts/tests
git add packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist packages/core/src/campaigns packages/core/dist apps/dashboard/src/server/campaigns/playbooks.ts tooling/scripts/tests
git commit -m "An appointment moment is offered only with a calendar, and a new campaign on one is named in the workspace's word

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add tooling/scripts/tests` takes only the test files you changed in Steps 1, 2, 7 and 8; check `git status` first and add those paths by name if anything else is listed.)

---

### Task 6: The readers: the business's shape, the chains, and the chains' report (spec §4.5 readers, §4.8 "The shape reaches the page"; corrections 14, 15, 42)

No reader module is added (`srv/readers` is held at 32, `tests/baselines/tree-shape.json`): `businessShape` joins `facts.ts`, `reachOutChains` joins `playbooks.ts` (a chain is a `playbooks` row of kind `reach_out`), `reachOutReport` joins `campaign-report.ts` (the campaigns' report's twin). `reachOutReport` is declared once today (`packages/db/src/repositories/reports/report-series.ts:48`), so the reader is its second declaration, which the copies ratchet allows; never `reachOuts` (`cmp/reach-out/surface.ts:142`).

**Files:**
- Modify: `srv/readers/facts.ts`, `srv/readers/playbooks.ts`, `srv/readers/campaign-report.ts`, `srv/readers/shape.ts`, `srv/ask/context.ts:194-214` (`shapeBlock`), `srv/ask/tools/read/report.ts`
- Modify: `apps/dashboard/app/api/v1/reach-outs/route.ts`, `apps/dashboard/app/api/v1/reports/reach-outs/route.ts`, `apps/dashboard/src/client/routes.generated.ts` and `packages/contracts/src/route-keys.generated.ts` (regenerated)
- Test: `tests/ask/readers.test.mjs`, `tests/ask/ask-context.test.mjs`, `tests/reach-out-sheet/reach-out-routes.test.mjs`, `tests/reach-out-back/back-routes.test.mjs`, `tests/ask/ask-tool-names.test.mjs`, `tests/ask/ask-turn.test.mjs`

- [ ] **Step 1: Write the failing reader tests**

In `tooling/scripts/tests/ask/readers.test.mjs`: add `businessShape` to the names it takes from `apps/dashboard/src/server/readers/facts.ts` (the destructuring at its line 36); append to `PLAYBOOKS_KEYS` (line ~3419), after `"month_sent",`:

```js
  // 9 Oct 2026 (spec 2026-10-09 §4.8): what the workspace calls an appointment, and whether its bookings arrive by a tool's
  // emails (readers/facts.ts businessShape), which the home's moments are said and counted by.
  "appointment_word",
  "bookings_by_email",
  // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): each autonomy class's mode as stored (readers/facts.ts policies), so a
  // Resume asked on Campaigns says in full that a campaign under `auto` sends on its own.
  "modes",
```

In the same file's test `"GET playbooks through its reader asks what it asked at origin/main, …"`, insert immediately
before the line `    // 9 Oct 2026: the pools' reads leave with the page's first ones (server/campaigns/playbook-pools.ts poolReads), so the`
(lane 1 inserted its own `playbook_totals` splice there too: keep it, and put this after it):

```js
    // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): the autonomy matrix's rows, so the page knows a class under `auto`
    // (control-plane listPolicies, the readers/facts.ts policies reader Ask's campaigns.playbooks already reads).
    want.push(["policies.select", "id, class, mode, subject_type, subject_id, limits, updated_at"]);
```

(The list is compared as a bag after its first entry, the door, so the place it is pushed does not matter. If the world
has no `policies` table and the fake refuses the read, the reader answers `modes: null` and the read is still asked.)

and add, after the test that uses `calTables` last:

```js
test("the business's shape (readers/facts.ts businessShape): how its customers buy, the word it derives, and whether bookings arrive by a tool's emails", async () => {
  const t = calTables(null);
  t.tenants[0].sells_by = "proposal";
  t.tenant_config[0].config.bookings = { tool: "booksy" };
  const r = await kernel.load(turnIn(ctxFor(t)), businessShape, undefined);
  assert.deepEqual(r.data, { sellsBy: "proposal", dealsOn: true, word: "meeting", bookingsByEmail: true });
  const bare = await kernel.load(turnIn(ctxFor(calTables(null))), businessShape, undefined);
  assert.deepEqual(bare.data, { sellsBy: null, dealsOn: false, word: "appointment", bookingsByEmail: false });
  const unreadable = calTables(null);
  unreadable.tenant_config = [];
  const none = await kernel.load(turnIn(ctxFor(unreadable)), businessShape, undefined);
  assert.equal(none.data.bookingsByEmail, false, "no settings row: no booking tool, and the shape still answers");
});
```

In `tooling/scripts/tests/reach-out-sheet/reach-out-routes.test.mjs`, after the test that begins `test("GET reach-outs lists each chain`, add:

```js
test("GET reach-outs answers its reader's payload (readers/playbooks.ts reachOutChains), the one Ask reads", async () => {
  const { load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
  const { reachOutChains } = await import(at("apps/dashboard/src/server/readers/playbooks.ts"));
  const page = await chains.GET.run(get(), ctxFor(tables("viewer")));
  const read = await load(readerContext(ctxFor(tables("viewer")), { tenantId: A, role: "viewer" }), reachOutChains, undefined);
  assert.deepEqual(read.data, page, "the route's payload is the reader's");
  assert.deepEqual(
    read.rows.map((r) => [r.kind, r.id, r.route]),
    page.chains.map((c) => ["playbook", c.root_id, `outbound/${c.root_id}`]),
    "each chain is a row a citation names, opened where its row opens",
  );
});
```

In `tooling/scripts/tests/reach-out-back/back-routes.test.mjs`: in `doors()`'s `rpcs`, add after `reach_out_report: …,`:

```js
      // 00363: each chain's own totals, by its root, which the report's answer carries as `chains`.
      reach_out_chain_totals: rec("reach_out_chain_totals", {}),
```

and replace the body of `test("GET reports/reach-outs asks its function for the workspace's period, and refuses any other"` with:

```js
  const d = doors();
  const out = await report.GET.run(get("&days=7"), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(out.report, { days: 30, has_reach_out: true, chains: [] });
  assert.deepEqual(out.chains, { complete: true, by_root: {} }, "every chain counted, none wrote");
  assert.deepEqual(
    [...d.asked].sort((a, b) => a[0].localeCompare(b[0])),
    [
      ["reach_out_chain_totals", { p_tenant_id: A, p_days: 7 }],
      ["reach_out_report", { p_tenant_id: A, p_days: 7 }],
    ],
  );
  await report.GET.run(get(), ctxFor(tables("viewer"), {}, d.rpcs));
  assert.deepEqual(d.asked.at(-1)[1], { p_tenant_id: A, p_days: 30 }, "thirty by default");
  await refused(report.GET.run(get("&days=14"), ctxFor(tables("viewer"), {}, d.rpcs)), "validation", 400);
```

and add after it:

```js
test("GET reports/reach-outs answers its reader's payload; a database without the chains' function says the report's own twenty, as not every chain", async () => {
  const { load, readerContext } = await import(at("apps/dashboard/src/server/readers/index.ts"));
  const { reachOutReport } = await import(at("apps/dashboard/src/server/readers/campaign-report.ts"));
  const d = doors();
  const page = await report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, d.rpcs));
  const read = await load(readerContext(ctxFor(tables("viewer"), {}, d.rpcs), { tenantId: A, role: "viewer" }), reachOutReport, { days: 30 });
  assert.deepEqual(read.data, page, "the route's payload is the reader's");
  const missing = doors({
    reach_out_report: () => ({
      days: 30,
      has_reach_out: true,
      chains: [{ root_id: "r1", name: "A", state: "running", search: null, last_at: null, runs: 1, steps: [] }],
    }),
    reach_out_chain_totals: () => {
      throw Object.assign(new Error("Could not find the function public.reach_out_chain_totals"), { code: "PGRST202" });
    },
  });
  const old = await report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, missing.rpcs));
  assert.deepEqual(old.chains, { complete: false, by_root: { r1: { written: 0, wrote_back: 0 } } });
  // A chains' read that fails (a member's statement past its 8 seconds) is no missing function: the report still
  // answers, its own chains said as not every chain, and the failure is logged, never thrown at the section.
  const slow = doors({
    reach_out_report: () => ({
      days: 30,
      has_reach_out: true,
      chains: [{ root_id: "r1", name: "A", state: "running", search: null, last_at: null, runs: 1, steps: [] }],
    }),
    reach_out_chain_totals: () => {
      throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    },
  });
  const timedOut = await report.GET.run(get("&period=30d"), ctxFor(tables("viewer"), {}, slow.rpcs));
  assert.equal(timedOut.report.chains.length, 1, "the report answers whatever the totals do");
  assert.deepEqual(timedOut.chains, { complete: false, by_root: { r1: { written: 0, wrote_back: 0 } } });
});
```

(Prove the log line the way the repo's other reader tests do, if one captures `log.error`; grep
`booking_report_failed` under `tooling/scripts/tests` for the precedent. If none captures it, the two assertions above
are the test.)

(If `_fake-db.mjs` answers a thrown rpc differently from an `{ error }` with that code, make the double answer the way the fake makes `isMissingDoor` true; read `isMissingDoor` in `packages/db/src/repositories/templates.ts` for the codes it accepts.)

Every other world that runs `GET reports/reach-outs` (or Ask's `report`) over the fake database now meets one call
more: lane 1 left `reach_out_chain_totals` in the schema the fake reads and gave it no twin (its plan's open point 9), so
an unmodelled call throws `fakeDb: rpc(reach_out_chain_totals) is not modelled`. Model it beside each such world's
`reach_out_report`: at least `tooling/scripts/tests/reports/headline/headline-boot.test.mjs` (its `rpcs`, ~line 220:
`reach_out_chain_totals: () => ({}),`; the headline still reads neither, which that test holds). Find the rest with
`git grep -ln "reach_out_report" -- tooling/scripts/tests ':!*.db.test.mjs'`.

- [ ] **Step 2: Run them to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
```

Expected: FAIL: `businessShape` is undefined; `reachOutChains` is undefined; `out.chains` is undefined; the playbooks keys lack the three new ones; GET playbooks does not ask `policies.select`.

- [ ] **Step 3: `businessShape` in `srv/readers/facts.ts`**

Change its contracts import to:

```ts
import { appointmentWordOf, dealsAreOn, parseTenantConfig, type AppointmentWord, type ChannelsReady, MIN_MS } from "@chanlytics/contracts";
```

and add after the `config` reader:

```ts
/** How the business works, as Campaigns' moments and Ask say it: one read of the facts that shape the journey. */
export interface BusinessShape {
  /** How its customers buy (tenants.sells_by, 0008); null where it was not asked yet or could not be read. */
  sellsBy: Awaited<ReturnType<typeof sellsByOf>>;
  dealsOn: boolean;
  /** What it calls an appointment (contracts appointmentWordOf): derived from how its customers buy until it is stored. */
  word: AppointmentWord;
  /**
   * Its bookings arrive by a booking tool's emails (the settings' `bookings.tool`, 00345). With no calendar feed, its
   * appointment moments need the feed (decision 0002 owes their reading of the appointments record).
   */
  bookingsByEmail: boolean;
}

/**
 * The business's shape (spec 2026-10-09 §4.8): GET playbooks answers it beside the moments' pools, and Ask's shape block
 * says it, through the turn's own readers of how customers buy and of the settings. Settings that cannot be read cost the
 * booking tool's word, never the shape.
 */
export const businessShape: Reader<undefined, BusinessShape> = {
  name: "businessShape",
  async read(rc) {
    const [sells, settings] = await Promise.all([
      load(rc, sellsBy, undefined).then((r) => r.data),
      load(rc, config, undefined).then(
        (r) => r.data,
        () => null,
      ),
    ]);
    const parsed = parseTenantConfig(settings?.config ?? null);
    return {
      data: {
        sellsBy: sells,
        dealsOn: dealsAreOn(sells),
        word: appointmentWordOf({ stored: null, sellsBy: sells }),
        bookingsByEmail: !!parsed?.bookings?.tool,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};
```

- [ ] **Step 4: GET playbooks answers the word and the booking tool; `reachOutChains` beside it**

In `srv/readers/playbooks.ts` (read it first: lane 1 split `listPlaybooks`; keep its changes):

Replace the two lines

```ts
    const howTheyBuy = load(rc, readers.sellsBy, undefined).then((r) => r.data);
    const dealsOnRead = howTheyBuy.then(dealsAreOn);
```

with

```ts
    // How the business works (readers/facts.ts businessShape): how its customers buy, which the pools and the follow-up
    // hang on, and the word and the booking tool the home's moments are said and counted by.
    const shaped = load(rc, readers.businessShape, undefined).then((r) => r.data);
    const dealsOnRead = shaped.then((s) => s.dealsOn);
```

In the `Promise.all` destructuring rename `sellsBy` to `shape` and its entry `howTheyBuy,` to `shaped,`; replace `const dealsOn = dealsAreOn(sellsBy);` with `const dealsOn = shape.dealsOn;`. Add an eighth entry at the end of that `Promise.all`, destructured as `policyRows`:

```ts
      // The autonomy matrix (readers/facts.ts policies, once a turn): a Resume asked on Campaigns says a class under `auto`
      // in full (decision 7). A read that fails costs that sentence, never the page.
      load(rc, readers.policies, undefined).then(
        (r) => r.data,
        () => null,
      ),
```

In the returned `data`, after `month_sent,` add:

```ts
        // What the workspace calls an appointment, and whether its bookings arrive by a tool's emails (businessShape).
        appointment_word: shape.word,
        bookings_by_email: shape.bookingsByEmail,
        // Each autonomy class's mode as stored (a class with no row is `ask`); null where the matrix could not be read.
        modes: policyRows ? Object.fromEntries(policyRows.map((p) => [p.class, p.mode])) : null,
```

In the `PlaybooksPage` interface (its doc says "the nine keys"; make it "the keys the Playbooks page reads, in the route's order") add after `month_sent: MonthSent | null;`:

```ts
  /** What the workspace calls an appointment (contracts appointmentWordOf), derived until it is stored. */
  appointment_word: AppointmentWord;
  /** Its bookings arrive by a booking tool's emails: with no calendar feed, its appointment moments need the feed. */
  bookings_by_email: boolean;
  /** Each autonomy class's mode by class (policies, workspace rows); null where unread. Resume says `auto` in full. */
  modes: Record<string, string> | null;
```

and add `type AppointmentWord` to its `@chanlytics/contracts` import (drop `dealsAreOn` from it if nothing else in the file uses it). Then add, at the end of the file:

```ts
/**
 * GET reach-outs, as the route answers it: every chain with its steps and what decides its next run, without its report
 * (R23: the report is read when a row opens; campaigns/reach-outs.ts chainsOf). The page's rows and Ask read the same
 * chains (spec 2026-10-09 §4.5). Each chain is a row a citation names, opened where its row opens.
 */
export const reachOutChains: Reader<undefined, { chains: ReachOutChainDto[] }> = {
  name: "reachOutChains",
  async read(rc) {
    const chains = await chainsOf(rc.ctx, rc.tenantId);
    return {
      data: { chains },
      rows: chains.map((c) => ({ kind: "playbook" as const, id: c.root_id, route: `outbound/${c.root_id}`, label: c.name })),
      stamp: stamp(),
    };
  },
};
```

with `import { chainsOf } from "../campaigns/reach-outs";` and `type ReachOutChainDto` added to the contracts import.

- [ ] **Step 5: `reachOutReport` in `srv/readers/campaign-report.ts`**

Change its imports to:

```ts
import "server-only";
import {
  AppError,
  chainTotalsFromReport,
  chainTotalsOf,
  type CampaignReportDto,
  type ReachOutChainTotalsDto,
  type ReachOutReportDto,
} from "@chanlytics/contracts";
import { campaignSeries, reachOutChainTotals } from "@chanlytics/db";
import { log } from "@/server/log";
import { reachOutReportOf } from "../campaigns/reach-out-report";
import { stamp, type Reader } from "./index";
```

(Keep `log`'s import where the file's other `@/server` imports sit if it already has one; `readers/report.ts:34` is the
spelling. In `apps/dashboard/src/server/log.ts`, add `"reach_out_chain_totals_read_failed"` to `DASHBOARD_LOG_EVENTS`
in its alphabetical place; `repo/log-events.test.mjs` holds the set.)

and add after `campaignReport`:

```ts
/**
 * GET reports/reach-outs, as the route answers it: what the reach-outs wrote over the period and what came of it (00241
 * reach_out_report, the route's body moved here whole), and beside it each chain's own totals by its root
 * (reach_out_chain_totals, 00363), so a chain past the report's twenty still says its numbers or "Nothing sent" (spec
 * 2026-10-09 §4.5). The report's own chains, said as not every chain (`complete: false`), stand in wherever the totals
 * cannot be read: for one release a database without the function (so either deploy order works), and always a read
 * that fails (a timeout, a refusal), logged, so the chains' totals never take the report down with them: the report is
 * what the section says, and the totals only what lies past its twenty. The campaigns' report's twin; Ask's report reads
 * it too.
 */
export const reachOutReport: Reader<
  { days: number },
  { report: ReachOutReportDto; chains: ReachOutChainTotalsDto | null }
> = {
  name: "reachOutReport",
  async read(rc, { days }) {
    const [{ report }, totals] = await Promise.all([
      reachOutReportOf(rc.ctx, rc.tenantId, days),
      reachOutChainTotals(rc.ctx.supabase, rc.tenantId, days).catch((e: unknown) => {
        log.error("reach_out_chain_totals_read_failed", {
          tenant_id: rc.tenantId,
          error: e instanceof Error ? e.message : String(e),
        });
        return "failed" as const;
      }),
    ]);
    const chains = typeof totals === "string" ? chainTotalsFromReport(report) : chainTotalsOf(totals);
    return { data: { report, chains }, rows: [], stamp: stamp() };
  },
};
```

(Lane 1 committed `reachOutChainTotals(db, tenantId, days): Promise<CountsByKey | "missing">` in
`packages/db/src/repositories/reports/report-series.ts`: the function's object, or `"missing"` where the database lacks
it, and it THROWS on any other failure, a non-object answer among them. The `.catch` is what keeps a failing chains'
read from failing all of `GET reports/reach-outs`, and so Reports' whole Reach-outs section and Ask's report; the
report's own read still throws as it does today. `chainTotalsOf` answering null on a malformed object stays as written:
the ledger then says "—" for every chain, which is honest.)

- [ ] **Step 6: Both reach-out GETs answer through their readers**

`apps/dashboard/app/api/v1/reach-outs/route.ts`: change the imports and the GET to:

```ts
import { ReachOutChainSchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { saveChain } from "@/server/campaigns/reach-outs";
import { load, readerContext } from "@/server/readers";
import { reachOutChains } from "@/server/readers/playbooks";
```

```ts
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), reachOutChains, undefined)).data,
});
```

and in its header comment, after "Any member.", add "The body is its reader's (readers/playbooks.ts reachOutChains), which Ask reads too."

`apps/dashboard/app/api/v1/reports/reach-outs/route.ts`:

```ts
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { reachOutReport } from "@/server/readers/campaign-report";
import { ReportQuery, reportDaysFor } from "@/server/readers/report";

/**
 * GET /api/v1/reports/reach-outs?period=7d|30d|90d|month — what the workspace's reach-outs wrote over Reports' period, and
 * what came of it (Reach out Part 6, H1, H3–H6): written, delivered, wrote back, interested, booked, said no and bounced,
 * each reach-out with its steps, replies by angle, sends by domain, and written by day; and each chain's own totals by
 * its root (`chains`). The twin of /api/v1/reports/campaigns, over the same four periods. The body is its reader's
 * (readers/campaign-report.ts reachOutReport), which Ask's report reads too. Any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reachOutReport, { days: await reportDaysFor(rc, input) })).data;
  },
});
```

`srv/campaigns/reach-out-report.ts` keeps `reachOutReportOf` (the reader calls it); its header's last sentence becomes "The reader (readers/campaign-report.ts reachOutReport) answers the route with it."

- [ ] **Step 7: Ask's shape says the word; Ask's report reads the reach-outs through the reader**

`srv/readers/shape.ts`: add `appointment_word: AppointmentWord;` to `WorkspaceShape` after `deals_on: boolean;` (and `type AppointmentWord` to its contracts import, dropping `dealsAreOn` if now unused); in `read`, replace `load(rc, facts.sellsBy, undefined).then((r) => r.data),` with `load(rc, facts.businessShape, undefined).then((r) => r.data),`, rename the destructured `sells` to `biz`, and in `data` replace `deals_on: dealsAreOn(sells),` with:

```ts
      deals_on: biz.dealsOn,
      appointment_word: biz.word,
```

`srv/ask/context.ts` `shapeBlock`: in the third line's array, after `` `Deals ${shape.deals_on ? "on" : "off"}`, `` add:

```ts
      `the appointment word: ${shape.appointment_word}`,
```

`tooling/scripts/tests/ask/ask-context.test.mjs`: in the shape test add `assert.match(one, /the appointment word: appointment/);` after the `booking link set` match, and add `appointment_word: "appointment",` to the `many` literal after `deals_on: false,`.

`srv/ask/tools/read/report.ts`: add to the contracts import `toReachOutReportVM, type ReachOutReportVM`; change the campaign-report import to `import { campaignReport, reachOutReport } from "../../../readers/campaign-report";`; add after `reviewsSaid`:

```ts
/** The Reach-outs section as Reports draws it (Reach out Part 6), where the workspace has a reach-out at all. */
function reachOutsSaid(ro: ReachOutReportVM) {
  if (!ro.present) return null;
  return { empty: ro.empty, totals: ro.totals, funnel: ro.lines.funnel, written: ro.lines.written };
}
```

in `getReport`'s `Promise.all` add a fourth read and name it:

```ts
    // The Reach-outs section's own read (readers/campaign-report.ts reachOutReport), the page's: null where it fails.
    load(t.rc, reachOutReport, { days }).then((x) => x.data.report, unread(t, "report", "reach_outs")),
```

(destructure it as `reachRead`), compute `const reachOuts = reachRead ? toReachOutReportVM(reachRead) : null;` beside `reviews`, and add as the answer's last key:

```ts
    // The Reach-outs section, as the page says it, where the workspace has one; an error where its read failed.
    reach_outs: reachOuts ? reachOutsSaid(reachOuts) : { error: "the reach-out numbers could not be read just now" },
```

`tooling/scripts/tests/ask/ask-tool-names.test.mjs` freezes each old tool's answer and adds each later key by a named adjuster (`withCampaigns`, `withReviews`). Add, after `withReviews`:

```js
/**
 * 9 Oct 2026 (spec 2026-10-09 §4.5): the report says the Reach-outs section after the Reviews lens, from its own reader
 * (readers/campaign-report.ts reachOutReport). This world's database has no reach_out_report, so it says the read failed.
 * The one change to the bytes of a report it answers; its reads gain the two functions the reader calls.
 */
function withReachOuts(result) {
  const said = JSON.parse(result);
  return said.error
    ? result
    : JSON.stringify({ ...said, reach_outs: { error: "the reach-out numbers could not be read just now" } });
}
```

apply it wherever `withReviews(` is applied (wrap: `withReachOuts(withReviews(…))`), and wherever that file adds the Reviews read's reads to the report's expected reads, add `rpc reach_out_report` and `rpc reach_out_chain_totals` in the same notation it uses for `rpc reviews_ledger`. If the world answers the chains' function as missing, the reader still calls it: keep both.

- [ ] **Step 8: Regenerate the typed client, build, run**

```bash
node tooling/scripts/gen/route-types.mjs
corepack pnpm --filter @chanlytics/dashboard typecheck
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/wire-casing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs
```

Expected: every file `# fail 0`. `wire-casing` passes because every new key is snake_case. GET playbooks' reader now
loads the autonomy matrix (`modes`): `campaigns.playbooks` already loads it in the same turn, and a turn reads a reader
once, so its frozen reads do not move; a frozen call that reads the playbooks reader WITHOUT the matrix (if
`ask-tool-names` or `ask-context` names one) gains one `policies.select`: add it beside that file's other read
adjustments with a dated comment ("9 Oct 2026: GET playbooks' reader reads the autonomy matrix for Resume's `auto`
sentence"), nothing else. If `code-health-ratchets` reports a fall in `route-doors` or `tables` (a route file no longer importing a server module directly is not counted; nothing should move), bank it with `UPDATE_BASELINES=1`.

- [ ] **Step 9: Commit**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/server/readers apps/dashboard/app/api/v1/reach-outs/route.ts apps/dashboard/app/api/v1/reports/reach-outs/route.ts apps/dashboard/src/server/campaigns/reach-out-report.ts apps/dashboard/src/server/ask tooling/scripts/tests/ask tooling/scripts/tests/reach-out-sheet/reach-out-routes.test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
git add apps/dashboard/src/server/readers/facts.ts apps/dashboard/src/server/readers/playbooks.ts apps/dashboard/src/server/readers/campaign-report.ts apps/dashboard/src/server/readers/shape.ts apps/dashboard/src/server/ask/context.ts apps/dashboard/src/server/ask/tools/read/report.ts apps/dashboard/src/server/campaigns/reach-out-report.ts apps/dashboard/app/api/v1/reach-outs/route.ts apps/dashboard/app/api/v1/reports/reach-outs/route.ts apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-routes.test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs tooling/scripts/tests/reports/headline/headline-boot.test.mjs
git commit -m "The business's shape, the reach-outs' chains and their report each have a reader, and the routes and Ask answer through them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If `route-keys.generated.ts` did not change, leave it out of `git add`.)

---

### Task 7: One page, one word: the sentence files and their callers (spec §4.8 "One page, one word"; correction 43)

Two kinds of change. A sentence that names an appointment moment takes the word as a required argument (`scheduleLine`, `poolWords`, the approval sheet's rules). A sentence that only mentioned "a visit" in passing says no appointment word at all, which needs no plumbing and keeps the send path untouched (`playbookRunNext` is read by core's `messages/broadcast-words.ts`). The playbooks surface publishes the business's shape, so every caller has the word.

**Files:**
- Modify: `ct/playbooks/playbook-schedule.ts:95-108` (`scheduleLine`), `ct/playbooks/playbook-approval.ts:73-84` (`poolWords`), `:316-372` (`toApprovalVM`)
- Modify (word-free): `ct/playbooks/playbook-purpose.ts:58-64`, `ct/templates/templates.ts:214-237`, `ct/templates/campaign-message.ts:363`, `ct/shell/campaign-rooms.ts:80`, `ct/broadcasts/broadcast-failures.ts:89-90`, `ct/broadcasts/broadcasts.ts:361`
- Modify (callers): `cmp/playbooks/surface.ts`, `cmp/playbooks/sample.ts`, `cmp/playbooks/card-detail.tsx`, `cmp/playbooks/composer-model.ts:349`, `cmp/broadcasts/verbs.ts:93-116`, `srv/ask/tools/read/campaigns.ts:300-345`, `srv/ask/tools/act/playbook.ts:300-420`
- Test: `tests/journey/journey.test.mjs`, `tests/playbooks/approval-sheet.test.mjs`, and the peers in Step 7

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/journey/journey.test.mjs`:

```js
test("the drawer's schedule and a card's pool say the workspace's word; a proposal's say none", () => {
  const p = { trigger: "visit_tomorrow", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  assert.equal(C.scheduleLine(p, "meeting"), "Daily 10:00 AM · everyone with a meeting tomorrow · up to 25");
  assert.equal(
    C.scheduleLine({ ...p, trigger: "visited" }, "visit"),
    "Daily 10:00 AM · everyone who visited yesterday · up to 25",
  );
  assert.equal(C.poolWords("visit_tomorrow", "appointment"), "with an appointment tomorrow");
  assert.equal(C.poolWords("visited", "lesson"), "who had a lesson yesterday");
  assert.equal(C.poolWords("proposal_waiting", "lesson"), "with a proposal waiting");
});
```

Append to `tooling/scripts/tests/playbooks/approval-sheet.test.mjs`:

```js
test("a reminder's run says the rule that made its list in the workspace's word", () => {
  const vm = (trigger, word) =>
    C.toApprovalVM(
      { broadcast: run(), recipients: people },
      opts({ playbook: { trigger, cap_per_run: 25, gap_days: 90, cadence_days: 30, word } }),
    );
  assert.deepEqual(vm("visit_tomorrow", "session").rules, [
    "each said yes to hearing from you",
    "each has a session tomorrow on the calendar",
  ]);
  assert.ok(vm("visited", "appointment").rules.includes("each had an appointment yesterday and has nothing booked next"));
});
```

and in that file's `opts()` give the default playbook `word: "visit"` (`playbook: { trigger: "everyone_monthly", cap_per_run: 250, gap_days: 90, cadence_days: 30, word: "visit" }`), and add `word: "visit"` to every other inline `playbook: { … }` it passes (the `winback` and `visit` cases of its first test), so the strings it pinned stay as they are.

- [ ] **Step 2: Run them to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/approval-sheet.test.mjs
```

Expected: FAIL: `scheduleLine` says "a visit" whatever the word; the session rule is missing.

- [ ] **Step 3: The three sentences that name a moment take the word**

`ct/playbooks/playbook-schedule.ts`: add `import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";` and replace `scheduleLine` with:

```ts
/**
 * "Daily 10:00 AM · up to 25 · once per person, again after 90 days". The hour is said by the product's clock
 * (shared/clock.ts clockHour), as a broadcast's time is: it said "10:00" and "18:00" beside "6:00 PM" until 8 Oct 2026. An
 * appointment moment's says who in the workspace's word (contracts appointmentWords).
 */
export function scheduleLine(
  p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">,
  word: AppointmentWord,
): string {
  const at = clockHour(p.run_hour);
  if (triggerOf(p.trigger)?.kind === "visit") {
    const W = appointmentWords(word);
    return `Daily ${at} · ${p.trigger === "visit_tomorrow" ? W.tomorrowWho : W.yesterdayWho} · up to ${p.cap_per_run}`;
  }
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} · up to ${p.cap_per_run} a day`;
  // One follow-up per proposal (0006): no gap to wait out.
  if (triggerOf(p.trigger)?.kind === "deal") return `Daily ${at} · up to ${p.cap_per_run} · once per proposal`;
  return `Daily ${at} · up to ${p.cap_per_run} · once per person, again after ${p.gap_days} days`;
}
```

`ct/playbooks/playbook-approval.ts`: add the same import; replace `poolWords` with:

```ts
/**
 * What "of 312" counts on a playbook's card, in its moment's own words: the trigger's list, everyone in People, or the
 * day's appointments in the workspace's word.
 */
export function poolWords(trigger: string, word: AppointmentWord): string {
  const t = triggerOf(trigger);
  if (!t) return "";
  if (t.kind === "visit") {
    const W = appointmentWords(word);
    return trigger === "visit_tomorrow" ? W.withTomorrow : W.whoYesterday;
  }
  if (t.kind === "deal") return "with a proposal waiting";
  return t.list || t.kind === "saved" ? "on the list" : "in People";
}
```

In `toApprovalVM`'s `opts` type, change the `playbook` field to:

```ts
    /** The playbook the run is of, with what its workspace calls an appointment; null where it is gone or unread. */
    playbook:
      | (Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> & { word: AppointmentWord })
      | null;
```

and its visit rule (lines 363-368) to:

```ts
    if (t.kind === "visit") {
      const W = appointmentWords(opts.playbook.word);
      rules.push(opts.playbook.trigger === "visit_tomorrow" ? W.eachTomorrow : W.eachYesterday);
    } else if (t.kind === "deal") {
```

- [ ] **Step 4: The sentences that said "visit" in passing say no word**

`ct/playbooks/playbook-purpose.ts` `MESSAGE_MOMENT_WORDS`:

```ts
export const MESSAGE_MOMENT_WORDS = {
  offer_on_texts:
    "This moment reaches anyone who said yes to texts, and this message is an offer, which only a yes to offers may get. Pick a reminder, a check after, or a follow-up.",
  texts_on_offers:
    "This moment sends offers, which only a yes to offers may get, and this message is a reminder, a check after or a follow-up. Pick an offer, or the moment it was written for.",
} as const;
```

`ct/templates/templates.ts`: in `PARAM_SOURCE_LABELS`, `visit_when: "Their booked time",` and `visit_service: "Their booked service",`; in `PARAM_SOURCE_HINTS`, `visit_when: "Each one's own, from the calendar",` and `visit_service: "Each one's own, from the calendar",`.

`ct/templates/campaign-message.ts:363`: `customIsAnOffer: "A message you write is an offer or news. Only a starter is a reminder, a check after or a follow-up.",`

`ct/shell/campaign-rooms.ts:80`: `own: "A message you write here is an offer or news. Reminders and follow-ups come from the starter set.",`

`ct/broadcasts/broadcast-failures.ts:90`: `return "It does not run again today, and a reminder belongs to its day, so the people it did not reach will not be sent it later.";`

`ct/broadcasts/broadcasts.ts:361`: the second string becomes `"Nobody there has said yes to messages yet. Even a reminder needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR in Sent."`

- [ ] **Step 5: The playbooks surface publishes the business's shape, and says the word**

`cmp/playbooks/surface.ts`: add to its contracts import `appointmentWordOf`, `triggerWords`, `type LifecycleShape`. Add to `PlaybooksSurface`, after `calendar: "ok" | "unavailable" | "none";`:

```ts
  /**
   * How the business works, as Campaigns' home reads it (contracts LifecycleShape, from GET playbooks' businessShape): the
   * calendar its appointment moments are counted from, whether deals are on, and what it calls an appointment.
   */
  shape: LifecycleShape;
```

In `apply`, after `const calendarOn = (pb.calendar ?? "none") !== "none";` add:

```ts
    // What the workspace calls an appointment (GET playbooks' businessShape). A server from before it answers none, and the
    // one derivation reads how its customers buy here instead, so either deploy order works.
    const word = appointmentWordOf({ stored: pb.appointment_word ?? null, sellsBy: pb.deals_on ? "proposal" : null });
    const shape: LifecycleShape = {
      calendar: calendarOn ? "feed" : pb.bookings_by_email === true ? "email" : "none",
      dealsOn: !!pb.deals_on,
      word,
    };
```

and in `setSurfaceValue("playbooks", { … })` add `shape,` after `pools,`; in the rows map replace

```ts
          triggerLabel: p.trigger === "saved_list" ? (listNameOf(p) ?? unnamed) : (t?.label ?? p.trigger),
          triggerHint: t?.hint ?? "",
          schedule: scheduleLine(p),
```

with

```ts
          triggerLabel: p.trigger === "saved_list" ? (listNameOf(p) ?? unnamed) : t ? triggerWords(t, word).label : p.trigger,
          triggerHint: t ? triggerWords(t, word).hint : "",
          schedule: scheduleLine(p, word),
```

and in the triggers map replace `label: t.label,` and `hint: t.hint,` with `label: triggerWords(t, word).label,` and `hint: triggerWords(t, word).hint,`.

`cmp/playbooks/sample.ts`: `schedule: scheduleLine(dto)` becomes `schedule: scheduleLine(dto, "appointment")`; add to the sample surface `shape: { calendar: <the sample's calendar> === "none" ? "none" : "feed", dealsOn: <the sample's deals_on or false>, word: "appointment" },` written with the sample's own values (read the file).

`cmp/playbooks/composer-model.ts:349`: `const of = poolWords(f.trigger, data.shape.word);`

`cmp/playbooks/card-detail.tsx`: give `CardCtx` a `word: AppointmentWord` (set in `useCard` from the playbooks surface it already reads: `surface ? surface.shape.word : appointmentWordOf({ stored: null, sellsBy: null })`), and at line 306 call `poolWords(p.trigger, c.word)`; import `appointmentWordOf` and `type AppointmentWord` from contracts.

`cmp/broadcasts/verbs.ts` `approval`: pass the playbook with the word, so its callers change nothing:

```ts
    return toApprovalVM(d, {
      // The playbook with what the workspace calls an appointment (the playbooks surface's shape; unread, the one
      // derivation over nothing known).
      playbook: playbook
        ? { ...playbook, word: surfaceValue("playbooks")?.shape.word ?? appointmentWordOf({ stored: null, sellsBy: null }) }
        : null,
```

(the rest of the call unchanged), importing `surfaceValue` from `"../../surface-values"` and `appointmentWordOf` from contracts.

- [ ] **Step 6: Ask says the word**

`srv/ask/tools/read/campaigns.ts` `listPlaybooksTool`: add `triggerWords` to the contracts import; after `const pb = read.data;` add:

```ts
  // The workspace's word (GET playbooks' businessShape): Ask says each appointment moment as the page does.
  const said = (id: string) => {
    const t = triggerOf(id);
    return t ? triggerWords(t, pb.appointment_word) : null;
  };
```

then `trigger_label: said(p.trigger)?.label ?? p.trigger,`, `schedule: scheduleLine(p, pb.appointment_word),`, and in the triggers map `label: triggerWords(x, pb.appointment_word).label,` and `when: triggerWords(x, pb.appointment_word).hint,`.

`srv/ask/tools/act/playbook.ts`: `proposePlaybook` is held in `tooling/scripts/tests/baselines/complexity.json` at
138 lines and 33 branches, and a held function may not grow by a line (`_ratchet.mjs` `rose`). So the lookup is a helper
above it:

```ts
/** A moment and its schedule in the workspace's word (readers/facts.ts businessShape), as the page says them. */
async function wordedMoment(t: ToolContext, trig: NonNullable<ReturnType<typeof triggerOf>>) {
  const word = (await load(t.rc, businessShape, undefined)).data.word;
  return { word, moment: triggerWords(trig, word) };
}
```

and inside `proposePlaybook` the blank line after `const { message } = asked;` becomes the one line
`const { word, moment } = await wordedMoment(t, trig);` (a line for a line: the function's count stays 138; check it
with `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, which must not
report `proposePlaybook` rising). Then in the summary replace `${trig.label} — ${trig.hint.toLowerCase()}` with `${moment.label} — ${moment.hint.toLowerCase()}` and `scheduleLine(checked)` with `scheduleLine(checked, word)`, and in `payload` replace `trigger_label: trig.label,` with `trigger_label: moment.label,`. Import `businessShape` from `"../../../readers/facts"`, `load` from `"../../../readers"` (if not already imported) and `triggerWords` from contracts.

- [ ] **Step 7: Build, run the two tests, then every peer that pins these sentences**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
corepack pnpm --filter @chanlytics/core build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/approval-sheet.test.mjs
for f in playbooks/playbooks playbooks/visit-playbooks shell/surfaces/one-clock broadcasts/campaigns-samples broadcasts/broadcasts-honest broadcasts/core-broadcast broadcasts/core-campaigns broadcasts/reach-for broadcasts/run-report consent/consent-channels messages/deliver playbooks/home/channels-on-the-home playbooks/playbook-composer templates/message-versions-page templates/template-versions-meta ask/ask-tool-names ask/ask-turn ask/readers playbooks/campaigns-drafts playbooks/runs-honest; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/core --filter @chanlytics/dashboard typecheck
```

Fix each failure by its kind, and nothing else: a direct call `scheduleLine(p)` / `poolWords(t)` in a test gains the word `"visit"` (`playbooks.test.mjs:374, 378, 847, 848`, `visit-playbooks.test.mjs:218-226`, `one-clock.test.mjs:106-108`, `campaigns-samples.test.mjs:24` with the sample's `"appointment"`); a literal that quoted a sentence of Step 4 takes its new words; a home or composer fixture that builds a `PlaybooksSurface` gains `shape: { calendar: "feed", dealsOn: <its deals_on>, word: "visit" }`, so its expected words stay. In `ask/ask-tool-names.test.mjs`, a frozen `list_playbooks` answer whose visit triggers now say the default word or are no longer offered (that world has no calendar, Task 5) is brought up to date by an adjuster beside `withReviews`, named `withJourneyWords(result)`, which removes `visit_tomorrow` and `visited` from the answer's `triggers` and re-says any appointment `trigger_label` and `schedule` in `"appointment"`, with a dated comment saying why, as the file's other adjusters do. Anything else: stop and report.

- [ ] **Step 8: Commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src apps/dashboard/src/surfaces/campaigns apps/dashboard/src/server/ask tooling/scripts/tests
git status --short
git add packages/contracts/src packages/contracts/dist packages/core/dist apps/dashboard/src/surfaces/campaigns apps/dashboard/src/server/ask tooling/scripts/tests/journey/journey.test.mjs tooling/scripts/tests/playbooks/approval-sheet.test.mjs
git commit -m "Every sentence on Campaigns about an appointment says the workspace's word, or none

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add by name each other test file Step 7 changed (`git status --short` lists them); never `git add -A`.

---

### Task 8: Campaigns reads its own numbers, on demand, and no other page pays for them (spec §4.5; corrections 13, 17, 18; decision 9)

Today the broadcasts surface reads `reports/campaigns?period=30d` on every page's boot for the home alone, and on Campaigns each message re-reads it with every page of People. After this task the two 30-day reports are one `onDemand` surface drawn by Campaigns alone (`reports/period-surface.ts`'s rule), re-read 800 ms after the last message while Campaigns is on screen (Reports' debounce, `apps/dashboard/src/surfaces/reports/surface.ts:109`), and the broadcasts surface hears messages on Sent alone. Settings leaves Campaigns' draws, so its reads leave the first paint.

**Files:**
- Create: `home/results-surface.ts`
- Modify: `ct/playbooks/lifecycle/lifecycle-types.ts` (`LifecycleBroadcasts.report` leaves; `LifecycleInput.report`; `LifecycleFailedRead.surface`), `ct/playbooks/lifecycle/lifecycle-tiles.ts` (`RESULTS_DAYS`, `lifecycleResults`), `ct/playbooks/lifecycle/lifecycle.ts` (`failedOf`), `ct/playbooks/lifecycle/lifecycle-words.ts` (`failed.report.surface`)
- Modify: `ct/shell/route-prefetch.ts:52-73`
- Modify: `apps/dashboard/src/surfaces/surface-values.ts`, `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:152-178`, `apps/dashboard/src/legacy-bridge/surface-registry.ts:198-200, 242-261`
- Modify: `cmp/broadcasts/surface.ts:137-140, 166-167, 210-220, 274-291, 386`, `cmp/broadcasts/sample.ts:204-205`, `home/use-home.ts`
- Test: `tests/shell/surfaces/route-prefetch.test.mjs`, `tests/shell/surfaces/message-fan-out.test.mjs`, and the peers in Step 8

- [ ] **Step 1: Write the failing tests**

`tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs`, in the test "what the head starts for a page is what its surfaces ask for first": add to the `overrides` list

```js
      (await importSrc(`${S}/surfaces/campaigns/home/results-surface.ts`)).campaignResultsOverride,
      (await importSrc(`${S}/surfaces/campaigns/reach-out/surface.ts`)).reachOutsOverride,
```

and change `alsoDrawn` and the comment above it to:

```js
  // What a page draws on its first screen from another page's surface, started with its own: Today's strip (the next
  // visit, the next opening) is the calendar's weeks, which the frame reads right after Today's own (ROUTE_DRAWS); and
  // Campaigns' home draws Sent's runs, its own 30 days (campaign_results) and the reach-outs' chains.
  const alsoDrawn = { today: ["calendar"], campaigns: ["broadcasts", "campaign_results", "reach_outs"] };
```

`tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs`: add to `REAL`, after the reach-outs override:

```js
  (await importSrc("apps/dashboard/src/surfaces/campaigns/home/results-surface.ts")).campaignResultsOverride,
```

Replace the test that begins `test("Campaigns' home owns what it draws:` with:

```js
test("Campaigns' home owns what it draws but Sent's runs: a message re-reads the playbooks and its own 30 days, never the broadcasts and every page of People behind them; what passed is read once as it comes back", async () => {
  win.location.hash = "#/campaigns";
  const r = await running();
  try {
    await r.message();
    assert.deepEqual(
      [...r.asked].sort(),
      ["campaign_results", "conversations", "inbox", "playbooks", "today"],
      "the home's own surface and its numbers: not the broadcasts, People, Reports or the Calendar",
    );
    r.asked.length = 0;

    win.location.hash = "#/today";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["google", "reports_headline"],
      "nothing Today owns was missed; the headline and Google's read, which Today draws and a run that opened on Campaigns never read, once",
    );
    r.asked.length = 0;
    await r.message();
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), ["conversations", "inbox", "today"]);
    r.asked.length = 0;

    win.location.hash = "#/campaigns";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual([...r.asked].sort(), ["campaign_results", "playbooks"], "read once, as the page it draws them on");
    r.asked.length = 0;
    win.location.hash = "#/campaigns/moment:pb-1";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(r.asked, [], "a moment opened is the same page: nothing passed it");
    await r.message();
    assert.deepEqual(
      [...new Set(r.asked)].sort(),
      ["campaign_results", "conversations", "inbox", "playbooks", "today"],
      "and with a moment open the home still hears them",
    );
    // Sent is the broadcasts' page: what passed them on Campaigns is read once as Sent comes on screen, and Sent hears messages.
    r.asked.length = 0;
    win.location.hash = "#/broadcasts";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.ok(r.asked.includes("broadcasts"), "the replies Campaigns let pass are read once on Sent");
    r.asked.length = 0;
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), ["broadcasts", "conversations", "inbox", "today"]);
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});
```

In the test "the page that owns what it draws is an explicit one", replace the three lines from `for (const key of ["playbooks", "broadcasts"]) assert.equal(owns(key, "campaigns"), true, key);` through `for (const key of ["settings", "reach_outs"]) assert.equal(owns(key, "campaigns/new"), true, key);` with:

```js
  for (const key of ["playbooks", "campaign_results"]) assert.equal(owns(key, "campaigns"), true, key);
  assert.equal(owns("broadcasts", "campaigns"), false, "Sent's runs are drawn on the home and re-read on Sent");
  // The reach-outs are drawn on the home too; they have no table of their own to refresh on a message, but a route that
  // draws them owns them for the refreshes that name a page. Settings is no longer drawn there.
  assert.equal(owns("reach_outs", "campaigns/new"), true);
  assert.equal(owns("settings", "campaigns/new"), false);
```

- [ ] **Step 2: Run them to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
```

Expected: FAIL: cannot find module `results-surface.ts`.

- [ ] **Step 3: The view model reads the report from its own input**

`ct/playbooks/lifecycle/lifecycle-types.ts`: delete the `report` field (and its doc) from `LifecycleBroadcasts`; add to `LifecycleInput`, after `reachOuts`:

```ts
  /**
   * The campaigns' last 30 days, with each campaign's own (the campaign_results surface's report): undefined before it is
   * read, null where it could not be. "What came back" and each row's "Last 30 days" are drawn from it.
   */
  report: LifecycleReport | null | undefined;
```

and change `LifecycleFailedRead`'s `surface` to `surface: "playbooks" | "settings" | "reach_outs" | "broadcasts" | "campaign_results";`.

`ct/playbooks/lifecycle/lifecycle-tiles.ts`: replace `const RESULTS_DAYS = 30;` with

```ts
/** How far back "What came back" looks: Campaigns' period (contracts CAMPAIGNS_RESULTS_PERIOD), a fixed count of days. */
const RESULTS_DAYS = fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD);
```

importing `import { CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf } from "../../reports/report-periods";`. In `lifecycleResults`, read the report from the input: replace `const days = b.report?.days ?? RESULTS_DAYS;` with `const report = input.report;` and `const days = report?.days ?? RESULTS_DAYS;`, `if (!b.report)` with `if (!report)`, `const t = b.report.totals;` with `const t = report.totals;`, and `b.report.byChannel` (twice) with `report.byChannel`. Update its doc's first sentence to "…the period's funnel from the campaign report (the campaign_results surface's: sent, delivered, read, replied…)".

`ct/playbooks/lifecycle/lifecycle.ts` `failedOf`: replace `report: b && b.report === null ? F.report : null,` with `report: input.report === null ? F.report : null,`.

`ct/playbooks/lifecycle/lifecycle-words.ts`: `report: { what: "this period's numbers", body: "The runs below stand.", surface: "campaign_results" },`.

- [ ] **Step 4: The results surface**

Create `apps/dashboard/src/surfaces/campaigns/home/results-surface.ts`:

```ts
/**
 * Campaigns' own numbers (spec 2026-10-09 §4.5): the campaigns' last 30 days (GET reports/campaigns, campaign_series with
 * each campaign's `sources`) and the reach-outs' (GET reports/reach-outs, with each chain's own totals by its root), read
 * where Campaigns is drawn and nowhere else (`onDemand`, as reports/period-surface.ts is), so no other page's boot pays
 * for a campaign_series call. Part of the SurfaceData seam; the home reads it through `useSurface("campaign_results")`.
 *
 * Each read fails alone: the home says "—" where its numbers would be, and the other stands. A message or a run moves
 * the replies and the sends: read again while Campaigns is on screen, 800 ms after the last (Reports' debounce), and once
 * when it comes back (surface-registry.ts onlyOnItsPage), never on another page.
 */
import {
  CAMPAIGNS_RESULTS_PERIOD,
  type CampaignReportDto,
  type LifecycleChains,
  type LifecycleReport,
  type ReachOutChainTotalsDto,
  toCampaignReportVM,
} from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue } from "../../surface-values";

/** What the home reads of its own 30 days: each null where its read failed, the other standing. */
export interface CampaignResultsSurface {
  report: LifecycleReport | null;
  chains: LifecycleChains | null;
  fetchedAt: number;
}

/** The campaign report as the home reads it: the totals of its funnel, what each channel sent, and each campaign's own. */
export function resultsReportOf(dto: CampaignReportDto): LifecycleReport {
  const vm = toCampaignReportVM(dto);
  // What each channel sent (0030), the most first, for the line under the funnel; none from a database before it.
  const byChannel = vm.channels.map((c) => ({ channel: c.channel, sent: c.sent }));
  return {
    days: vm.days,
    totals: vm.totals,
    sources: (dto.sources ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      sent: s.sent,
      replied: s.replied,
      lastAt: s.last_at,
    })),
    ...(byChannel.length > 0 ? { byChannel } : {}),
  };
}

/** Each chain's own totals as the home reads them; null where the answer carried none (a server from before them). */
export function resultsChainsOf(dto: ReachOutChainTotalsDto | null | undefined): LifecycleChains | null {
  if (!dto) return null;
  return {
    complete: dto.complete,
    byRoot: Object.fromEntries(
      Object.entries(dto.by_root).map(([root, c]) => [root, { written: c.written, wroteBack: c.wrote_back }]),
    ),
  };
}

/** The tables whose changes move the numbers: the messages a reply is, and the runs a send is. Heard on Campaigns alone. */
const RESULTS_TABLES: string[] = [...DEFAULT_REFRESH_TABLES, "broadcasts"];

/** When the surface was last read: an on-demand read is read again as its page comes on screen once it has aged. */
let readAt: number | undefined;

export const campaignResultsOverride: SurfaceOverride = {
  key: "campaign_results",
  value: "campaign_results",
  onDemand: true,
  isStale: () => readAged(readAt),
  events: ["surface:campaign_results"],
  refreshOnTables: RESULTS_TABLES,
  refreshWhen: onlyOnItsPage("campaign_results", RESULTS_TABLES),
  debounceMs: 800,
  apply: async () => {
    const period = CAMPAIGNS_RESULTS_PERIOD;
    const [campaigns, reachOuts] = await Promise.all([
      read("GET reports/campaigns", { query: { period } }).catch((e: unknown) => e as Error),
      read("GET reports/reach-outs", { query: { period } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("campaign_results_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("campaign_results_reach_outs_fetch_failed", reachOuts.message);
    readAt = Date.now();
    setSurfaceValue("campaign_results", {
      report: campaigns instanceof Error ? null : resultsReportOf(campaigns.report),
      chains: reachOuts instanceof Error ? null : resultsChainsOf(reachOuts.chains),
      fetchedAt: readAt,
    });
  },
};
```

```bash
git add -N apps/dashboard/src/surfaces/campaigns/home/results-surface.ts
```

`apps/dashboard/src/surfaces/surface-values.ts`: add `import type { CampaignResultsSurface } from "./campaigns/home/results-surface";` beside the other type imports; in `SurfaceValues`, after `reach_outs: ReachOutsSurface;`:

```ts
  /** Campaigns' own 30 days, read where Campaigns is drawn (campaigns/home/results-surface.ts): the funnel's and each row's. */
  campaign_results: CampaignResultsSurface;
```

and in `SURFACE_KEYS`, after `reach_outs: true,`, `campaign_results: true,`.

`apps/dashboard/src/legacy-bridge/LegacyApp.tsx`: import `campaignResultsOverride` from `"@/surfaces/campaigns/home/results-surface"` and add to `SURFACES` after `reachOutsOverride,`:

```ts
  // Campaigns' own 30 days, read where Campaigns is drawn and nowhere else (surfaces/campaigns/home/results-surface.ts).
  campaignResultsOverride,
```

- [ ] **Step 5: Campaigns draws its numbers, not Settings; and leaves Sent's runs to Sent**

`apps/dashboard/src/legacy-bridge/surface-registry.ts`, `ROUTE_DRAWS`:

```ts
  // Campaigns' home draws Sent's runs (Coming up, a row's waiting run, who can hear you) from the broadcasts, its own 30
  // days from campaign_results (read on demand: no other page's boot pays for them), and the reach-outs as rows. The call's
  // text and the Library's count are the playbooks surface's own read of the templates, so Settings is not drawn here.
  campaigns: ["broadcasts", "campaign_results", "reach_outs"],
```

After `OWNS_WHAT_IT_DRAWS`, add:

```ts
/**
 * What a page that owns what it draws still leaves to the surface's own page. Campaigns draws Sent's runs for Coming up
 * and a row's waiting run, and what a message moves of them (a run's replies) it reads from its own 30 days now
 * (campaign_results, spec 2026-10-09 §4.5): so a message on Campaigns no longer re-reads the broadcasts and every page of
 * People behind them. They are heard on Sent, their own page, and read once as Sent comes back.
 */
const LEFT_TO_THEIR_PAGE: Readonly<Record<string, readonly string[]>> = { campaigns: ["broadcasts"] };
```

and make `ownsTheScreen`'s last line:

```ts
  return (
    OWNS_WHAT_IT_DRAWS.has(page) &&
    routeDrawsFor(page, param).includes(key) &&
    !(LEFT_TO_THEIR_PAGE[page] ?? []).includes(key)
  );
```

Update `OWNS_WHAT_IT_DRAWS`'s doc's first sentence to "Campaigns' home is one page of four surfaces (the playbooks' moments, Sent's runs, its own 30 days, the reach-outs' chains), and a message moves the replies its rows and "What came back" say: left to another page, its numbers stood where they were read for as long as the home was open."

- [ ] **Step 6: The broadcasts surface drops its report; the head starts Campaigns' own reads**

`cmp/broadcasts/surface.ts`: delete the `report: LifecycleReport | null;` field and its doc from `BroadcastsSurface` (lines 136-140), the `HOME_REPORT_PERIOD` constant (166-167), the `reportOf` function (210-220), the eighth read of `apply`'s `Promise.all` (its comment and `read("GET reports/campaigns", …)`) with `campaigns` from the destructuring, and `report: reportOf(campaigns),` from `setSurfaceValue`. Remove `toCampaignReportVM` and `type LifecycleReport` from its contracts import if nothing else uses them. Its `refreshWhen` stays `onlyOnItsPage("broadcasts", DEFAULT_REFRESH_TABLES)`: with Step 5 it hears messages on Sent alone; change its comment's last sentence to "A message moves a run's replies: read again only while Sent is on screen, and once when it comes back (Campaigns reads its numbers from campaign_results, surface-registry.ts LEFT_TO_THEIR_PAGE)."

`cmp/broadcasts/sample.ts`: move the sample's `report` out of `broadcastsSample()` into an exported function in the same file:

```ts
/** A demo session's 30 days: the one run the sample sent, as the campaign report would count it over the last thirty days. */
export function campaignResultsSample(): { report: LifecycleReport; chains: null; fetchedAt: number } {
  return {
    report: { days: 30, totals: { sent: 18, delivered: 17, read: 11, replied: 3, optIns: 4, optOuts: 1 }, sources: [] },
    chains: null,
    fetchedAt: 0,
  };
}
```

(`type LifecycleReport` from contracts; delete the `report:` line and its comment from `broadcastsSample()`.)

`ct/shell/route-prefetch.ts`: import `CAMPAIGNS_RESULTS_PERIOD` beside `REPORT_PERIOD_DEFAULT` from `"../reports/report-periods"`. Make `broadcasts` end at `"settings",` (drop its report line and change its comment to "Sent: the runs, who an audience reaches and the composers' reads."). Replace `campaigns`' comment and list with:

```ts
  // Campaigns' home is the playbooks' moments first (surface-registry ROUTE_SURFACE), and beside them Sent's runs, its own
  // 30 days (campaign_results, the period named once) and the reach-outs' chains (ROUTE_DRAWS): each surface's first reads.
  campaigns: [
    "playbooks",
    "templates",
    "channels",
    "settings",
    "broadcasts",
    "contacts",
    "segments",
    `reports/campaigns?period=${CAMPAIGNS_RESULTS_PERIOD}`,
    `reports/reach-outs?period=${CAMPAIGNS_RESULTS_PERIOD}`,
    "reach-outs",
  ],
```

(`settings` stays: the playbooks surface reads `GET settings` itself, `cmp/playbooks/surface.ts:289`.)

- [ ] **Step 7: The home hands the report to its view model**

`home/use-home.ts`: import `campaignResultsSample` beside `broadcastsSample` from `"../broadcasts/sample"` and `import type { CampaignResultsSurface } from "./results-surface";`. Add `results: CampaignResultsSurface | null | undefined;` to `HomeData` (with a doc "Campaigns' own 30 days: undefined before read, null where it could not be"). In `useHomeData`:

```ts
  const liveResults = useSurface("campaign_results");
  const resultsFailed = useSurfaceFailed("campaign_results");
```

the sample becomes `{ playbooks: playbooksSample(), broadcasts: broadcastsSample(), results: campaignResultsSample() }`, and:

```ts
  // Campaigns' own 30 days: failed (null) where the seam says it could not be read, else not read yet (undefined).
  const results = liveResults ?? sample?.results ?? (resultsFailed ? null : undefined);
```

pass `report: results === undefined ? undefined : results === null ? null : results.report,` to `campaignsHomeOf`, add `results` to the `useMemo` dependencies, and return `results` in `HomeData`.

- [ ] **Step 8: Build, run, and move the fixtures that carried the report on the broadcasts surface**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
corepack pnpm --filter @chanlytics/dashboard typecheck
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
for f in shell/surfaces/surface-registry shell/surfaces/surface-boot shell/surfaces/refresh-coverage reports/headline/on-demand-boot reports/headline/headline-boot playbooks/home/lifecycle playbooks/home/channels-on-the-home playbooks/home/campaigns-home playbooks/runs-honest playbooks/campaigns-drafts ask/readers; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
```

Fix by kind: in `lifecycle.test.mjs` (and `channels-on-the-home.test.mjs` if it builds one), the `report` moves from the `broadcasts()` helper to `input()` (`report: report()`, and `report()` returns `sources: []` too); a call `broadcasts({ report: null })` becomes `home({ report: null })`. In `campaigns-home.test.mjs`'s `surfaces()` helper, after `setSurfaceValue("broadcasts", …)` add:

```js
  // Campaigns' own 30 days (campaign_results): the report a test hands the broadcasts surface is drawn from here now.
  setSurfaceValue("campaign_results", {
    report:
      over.broadcasts && "report" in over.broadcasts
        ? over.broadcasts.report
        : { days: 30, totals: { sent: 8, delivered: 8, read: 5, replied: 3, optIns: 3, optOuts: 2 }, sources: [] },
    chains: null,
    fetchedAt: 0,
  });
```

and add `"campaign_results"` to the keys its `afterEach` clears; its tests that pass a `report` with more fields keep passing it through `over.broadcasts`. A registry or boot test that lists every override module (`surface-registry.test.mjs`, `surface-boot.test.mjs`) and fails because `campaign_results` is not among them gains `"../surfaces/campaigns/home/results-surface"` in its list. Anything else: stop and report.

- [ ] **Step 9: Commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/playbooks/lifecycle packages/contracts/src/shell/route-prefetch.ts apps/dashboard/src/surfaces apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/surface-registry.ts tooling/scripts/tests
git status --short
git add packages/contracts/src/playbooks/lifecycle packages/contracts/src/shell/route-prefetch.ts packages/contracts/src/browser.generated.ts packages/contracts/dist apps/dashboard/src/surfaces/campaigns/home/results-surface.ts apps/dashboard/src/surfaces/campaigns/home/use-home.ts apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts apps/dashboard/src/surfaces/campaigns/broadcasts/sample.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/surface-registry.ts tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
git commit -m "Campaigns reads its own 30 days on demand, and a message there no longer re-reads Sent's runs and every page of People

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add by name each other test file Step 8 changed.

---

### Task 9: The home's inputs come from its own surfaces: the shape, the chains' totals, the library (spec §4.1 `LifecycleInput`, §4.5, §4.8 "The shape reaches the page"; correction 42)

Settings left Campaigns' draws in Task 8, so the call's text and the Library's count come from the playbooks surface's own read of the templates (`GET templates`, which it already makes: `cmp/playbooks/surface.ts:286-289`). The view model's input gains the business's shape and the chains' totals; nothing reads them until Task 10.

**Files:**
- Modify: `ct/playbooks/lifecycle/lifecycle-types.ts` (`LifecycleInput`), `ct/playbooks/lifecycle/lifecycle-words.ts` (`failed.templates.surface`)
- Modify: `cmp/playbooks/surface.ts`, `cmp/playbooks/sample.ts`, `home/use-home.ts`, `apps/dashboard/src/legacy-bridge/refresh-map.ts:70-74, 223-226`, `srv/readers/templates.ts` (GET templates names the call's text it finds: `booking`)
- Test: `tests/shell/surfaces/refresh-coverage.test.mjs`, `tests/receptionist/business-tab/business-tab-zone.test.mjs`, `tests/playbooks/home/campaigns-home.test.mjs`, `tests/ask/readers.test.mjs`, `tests/e2e/e2e-harness.test.mjs`, and the peers in Step 6

- [ ] **Step 1: Write the failing tests**

`tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs:196`:

```js
  assert.deepEqual(keysOf("PATCH workspaces"), ["settings", "people", "reports", "reports_headline", "today", "playbooks"]);
```

`tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs:108-112`:

```js
  assert.deepEqual(
    AFTER["PATCH workspaces"]().map((o) => o.key),
    ["settings", "people", "reports", "reports_headline", "today", "playbooks"],
    "the refresh map names the surfaces the workspace's own fields ride on, Campaigns' moments among them (how customers buy shapes them)",
  );
```

`tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`, in the `surfaces()` helper, replace the `setSurfaceValue("playbooks", { … })` call with:

```js
  // The call's text and the Library's count are the playbooks surface's own read of the templates (Settings is no longer
  // drawn on Campaigns): a test that hands Settings a library hands it here.
  const lib = over.settings && "templatesAll" in over.settings ? over.settings.templatesAll : pb.templates;
  setSurfaceValue("playbooks", {
    ...pb,
    pools: {
      new_week: pool(0),
      visit_tomorrow: pool(3, 3),
      visited: pool(2, 2),
      quiet_30: pool(5, 0, 0),
      ...(over.pools ?? {}),
    },
    library: lib,
    messages:
      over.settings && "messages" in over.settings
        ? over.settings.messages
        : lib
          ? contracts.campaignMessagesOf(lib)
          : null,
    ...(over.playbooks ?? {}),
  });
```

(keep its `setSurfaceValue("settings", …)` call: the composer still reads Settings' templates).

`tooling/scripts/tests/ask/readers.test.mjs`, after the test that begins `test("the templates, for the composers, Settings and Ask:`:

```js
test("GET templates names the call's text it finds among every WhatsApp row, a hidden one too, as the edge texts it: Campaigns' home keeps today's lookup without Settings' read", async () => {
  const w = usageWorld();
  w.templates = w.templates.map((t) => (t.name === "booking_link" ? { ...t, hidden_at: "2026-09-01T00:00:00Z" } : t));
  const r = await kernel.load(turnIn(dayCtx(w), B), templatesReader, { all: false });
  assert.equal(r.data.templates.some((t) => t.name === "booking_link"), false, "the composers are not offered it");
  assert.equal(r.data.booking?.name, "booking_link", "and the phone agent still texts it after a call");
});
```

(If `booking` is null there because the world's `booking_link` row is not one contracts `bookingTemplate` takes, give the
row what `outbound-routes.test.mjs`' "a template says what sends it" gives it; never loosen the lookup.)

- [ ] **Step 2: Run them to see them fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
```

Expected: FAIL: `PATCH workspaces` lacks `playbooks`; the templates' answer has no `booking`.

- [ ] **Step 3: The view model's input**

`ct/playbooks/lifecycle/lifecycle-types.ts` `LifecycleInput`: change the docs of `library` and `messages` to name their new source:

```ts
  /**
   * The rows the call's text is found among (the playbooks surface's `library`: the one GET templates names, `booking`,
   * found over every WhatsApp row as the edge sends it, or none); null where unread.
   */
  library: readonly LifecycleTemplate[] | null | undefined;
  /** The workspace's messages (the playbooks surface's `messages`), which the Library counts; null where unread. */
  messages: readonly Pick<CampaignMessage, "name" | "hidden">[] | null | undefined;
```

and add after `report`:

```ts
  /** How the business works (the playbooks surface's `shape`): undefined with that surface. */
  shape: LifecycleShape | undefined;
  /**
   * The reach-outs' last 30 days, by root (the campaign_results surface's `chains`): undefined before it is read, null
   * where it could not be, and a chain's row then says "—".
   */
  chains: LifecycleChains | null | undefined;
```

and in `LifecyclePlaybooks`, after `templates?: …;`:

```ts
  /**
   * Each autonomy class's mode by class (GET playbooks' `modes`): a Resume asked on a row says a class under `auto` in
   * full (decision 7). Null where unread, absent on a surface drawn without it: the question then says when and to how
   * many alone.
   */
  modes?: Readonly<Record<string, string>> | null;
```

`ct/playbooks/lifecycle/lifecycle-words.ts`, `failed.templates`: `surface: "playbooks",`.

- [ ] **Step 4: The playbooks surface publishes the library and the messages it reads**

`cmp/playbooks/surface.ts`: add to `PlaybooksSurface`, after `templates: PlaybookTemplate[] | null;`:

```ts
  /**
   * The call's text as its templates read names it (`booking`: found over every WhatsApp row, a hidden one too, as the
   * edge texts it after a call), one row or none: Campaigns' home says whether there is one. Null where that read failed.
   */
  library: LifecycleTemplate[] | null;
  /** Every message of the workspace, on every channel (its templates read's `messages`): the Library's count. Null where unread. */
  messages: CampaignMessage[] | null;
  /** Each autonomy class's mode (GET playbooks' `modes`): Resume says a class under `auto` in full. Null where unread. */
  modes: Readonly<Record<string, string>> | null;
```

(import `type LifecycleTemplate` and `type CampaignMessage` from contracts), and in `setSurfaceValue("playbooks", { … })` after `templates: …,`:

```ts
      // The call's text is looked up as today and as the edge sends it (voice/call-booking-link.ts): among EVERY WhatsApp
      // row, a hidden one too. The composers' rows leave hidden ones out, so the read names the one it found (`booking`).
      library: tpl instanceof Error ? null : tpl.booking ? [tpl.booking] : [],
      messages: tpl instanceof Error ? null : tpl.messages,
      // A server from before `modes` answers none: Resume then says when and to how many alone.
      modes: pb.modes ?? null,
```

`apps/dashboard/src/server/readers/templates.ts` (read it as lane 1, Task 15, left it): GET templates names the call's
text it finds, so the home keeps today's lookup without Settings' read. Before `if (!all) return …`, add:

```ts
  // The call's text: the WhatsApp message the phone agent texts a caller who asks to book, found among EVERY WhatsApp row
  // (a hidden one too), as the edge picks it (apps/edge/lib/voice/call-booking-link.ts) and as Settings says what sends it.
  // Campaigns' home says whether there is one (contracts bookingTemplate); null where there is none.
  const booking = bookingTemplate(every.filter((t) => t.channel === "whatsapp")) ?? null;
```

change `if (!all) return { templates, held, messages };` to `if (!all) return { templates, held, messages, booking };`,
in `templateUsage`'s argument replace `bookingName: bookingTemplate(every.filter((t) => t.channel === "whatsapp"))?.name ?? null,`
with `bookingName: booking?.name ?? null,`, and add `booking,` after `messages,` in the `all` branch's return (one shape
for both). Then the pins of the answer's keys: `tooling/scripts/tests/ask/readers.test.mjs` (the templates test, ~line
4608-4616) `["templates", "held", "messages"]` becomes `["templates", "held", "messages", "booking"]` (twice) and the
`all` list `["templates", "held", "messages", "booking", "usedBy", "sends"]`; `tooling/scripts/tests/e2e/e2e-harness.test.mjs`
(~lines 377, 395) the same two lists. Run both, then `node tooling/scripts/gen/route-types.mjs --check` (regenerate
without `--check` if it asks).

`cmp/playbooks/sample.ts`: give the sample surface `library` (its WhatsApp templates), `messages: campaignMessagesOf(<those templates>)`, written with the file's own template list, and `modes: null`.

- [ ] **Step 5: The home reads them, and hands the shape and the chains to its view model; a change of how customers buy refreshes Campaigns**

`home/use-home.ts` `useHomeData`: delete `const settings = useSurface("settings");`, `const settingsFailed = useSurfaceFailed("settings");`, the `sampled`, `library` and `messages` constants; add:

```ts
  // The call's text and the Library's count: the playbooks surface's own read of the templates (a demo session's sample's).
  const library = playbooks ? playbooks.library : undefined;
  const messages = playbooks ? playbooks.messages : undefined;
```

and make the `campaignsHomeOf` call:

```ts
      campaignsHomeOf({
        nowMs: now,
        tz: playbooks ? playbooks.timezone : "UTC",
        playbooks,
        broadcasts,
        library,
        messages,
        reachOuts,
        report: results === undefined ? undefined : results === null ? null : results.report,
        shape: playbooks?.shape,
        chains: results === undefined ? undefined : results === null ? null : results.chains,
      }),
    [now, playbooks, broadcasts, library, messages, reachOuts, results],
```

removing `campaignMessagesOf` from its contracts import if unused. Update the file's header: "the four surfaces its view model is made from (the playbooks' rows, pools, shape and templates, Sent's runs and reach, Campaigns' own 30 days, the reach-outs' chains)".

`apps/dashboard/src/legacy-bridge/refresh-map.ts`: the `templates()` list becomes `[settingsOverride, inboxOverride, playbooksOverride]` with its comment gaining "and by the playbooks surface, whose read of them is the call's text and the Library's count on Campaigns"; `"PATCH workspaces"` returns `[settingsOverride, peopleOverride, reportsOverride, reportsHeadlineOverride, todayOverride, playbooksOverride]`, and its comment gains "How its customers buy also shapes Campaigns' journey and the word it says (spec 2026-10-09 §4.8): the playbooks surface is read again."

- [ ] **Step 6: Build, run, and move the page fixtures that drove the library through Settings**

```bash
corepack pnpm --filter @chanlytics/contracts build
corepack pnpm --filter @chanlytics/dashboard typecheck
for f in shell/surfaces/refresh-coverage receptionist/business-tab/business-tab-zone playbooks/home/campaigns-home playbooks/home/lifecycle playbooks/campaigns-drafts playbooks/playbook-composer reach-out-sheet/reach-out-rows playbooks/runs-honest templates/message-versions-page ask/readers e2e/e2e-harness templates/templates-truth ask/ask-tool-names; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
```

Fix by kind: a pinned key list for a template write (`templates()` in the refresh map) gains `"playbooks"` at its end. In `campaigns-home.test.mjs`, the tests that made the library unreadable by failing the Settings surface (the ones that call `setSurfaceValue("settings", undefined)` with a failed status, around its lines 940 and 1070) make it unreadable on the playbooks surface instead: `surfaces({ playbooks: { library: null, messages: null } })`, keeping their expectations (`cmh-templates-failed` and the Library's count unread); its `testid`s and words are unchanged. A failed read's Retry now names `"playbooks"` (`LIFECYCLE_WORDS.failed.templates.surface`): an assertion of `"settings"` there takes `"playbooks"`. Anything else: stop and report.

- [ ] **Step 7: Commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/playbooks/lifecycle apps/dashboard/src/surfaces/campaigns apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests
git status --short
git add packages/contracts/src/playbooks/lifecycle packages/contracts/dist apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts apps/dashboard/src/surfaces/campaigns/playbooks/sample.ts apps/dashboard/src/surfaces/campaigns/home/use-home.ts apps/dashboard/src/legacy-bridge/refresh-map.ts apps/dashboard/src/server/readers/templates.ts tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/e2e/e2e-harness.test.mjs
git commit -m "Campaigns' home takes its shape, its chains' totals and its library from its own surfaces, and a change of how customers buy re-reads it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add by name each other test file Step 6 changed.

---

### Task 10: The rail's stages are the journey's, each a group's lead with its summary and meter; paused rests (spec §4.1 `LifecycleStage`, §4.8 J2 and "Needs your calendar"; D13, D44–D46)

**Files:**
- Modify: `ct/playbooks/lifecycle/lifecycle-types.ts` (`LifecycleStage`, a new `LifecycleBar`)
- Modify: `ct/playbooks/lifecycle/lifecycle-words.ts` (`needsCalendar`, `tallyWords`, paused's tone, `LIFECYCLE_TOAST.paused`)
- Modify: `ct/playbooks/lifecycle/lifecycle.ts` (the stages: lines 107-282 of the moved file; `chainStrip`'s tone; `campaignsHomeOf`)
- Modify: `ct/playbooks/lifecycle/lifecycle-tiles.ts` (`offWhy`, `OFF_WHEN`, `offRows`, `lifecycleComing`'s signature)
- Modify: `ct/shell/tone.ts:165`
- Test: `tests/playbooks/home/lifecycle.test.mjs`, and the peers in Step 7

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/playbooks/home/lifecycle.test.mjs`:

Give `input()` the business's shape, a calendar connected and the word the file's sentences were written in, after `reachOuts: [],`:

```js
  // How the business works (the playbooks surface's shape): a calendar connected, deals on, and "visit", the word every
  // sentence here was first written in, so the words stay; a test that is about the shape names its own.
  shape: { calendar: "feed", dealsOn: true, word: "visit" },
  chains: undefined,
```

Change the first test's expectations to the journey's order and ids:

```js
    [
      ["first_contact", "First contact", "Your receptionist"],
      ["before", "Visit tomorrow", "Visit reminder"],
      ["after", "After the visit", "How did it go"],
      ["proposal", "Proposal waiting", "Proposal follow-up"],
      ["quiet", "Quiet or lapsed", "Win-back"],
    ],
```

its people `[[0, "this week"], [3, "people"], [0, "yesterday"], [0, "waiting"], [5, "people"]]`, its needs words `["Answers whoever writes", "Reaches a yes to messages", "Reaches a yes to messages", "Reaches a yes to messages", "Needs a yes to offers"]` and needs `["none", "messages", "messages", "messages", "offers"]`. In the second test, the states become `["always", "Answers · asks for the yes", true], ["off", "Off", false], ["off", "Off", false], ["off", "Off", false], ["on", "On · daily 10:00 AM", true]`. Everywhere in the file, a stage looked up as `"visit"` is looked up as `"before"` (`stage(h, "visit")` → `stage(h, "before")`, `"off:visit"` → `"off:before"`). In the deals-off test pass `shape: { calendar: "feed", dealsOn: false, word: "visit" }` beside its `playbooks` and expect `["first_contact", "before", "after", "quiet"]`. In the paused test, the follow-up where deals are off now opens its drawer: `["not_here", false, { kind: "open", label: "Open", playbookId: "pb-9" }]`. In the strips' tests, a paused line's tone `"warn"` becomes `"plain"` (lines ~430 and ~496; Task 11 moves them to the ledger).

Add after the paused test:

```js
test("without a calendar the appointment moments say they need one: no figure, no Turn on, never covered; one made before runs nothing here (D44)", () => {
  const none = home({ shape: { calendar: "none", dealsOn: true, word: "visit" } });
  for (const id of ["before", "after"]) {
    const s = stage(none, id);
    assert.deepEqual(
      [s.state, s.stateWords, s.people, s.covered, s.hint],
      ["not_here", "Needs your calendar", null, false, null],
      id,
    );
    assert.deepEqual(s.act, { kind: "route", label: "Connect your calendar", route: "admin/workspace/calendar" }, id);
  }
  assert.equal(none.rail.coveredWords, "2 of 5 moments covered", "drawn, and never covered");
  assert.equal(
    none.coming.rows.some((r) => r.id === "off:before"),
    false,
    "no Turn on in Coming up for a moment that cannot run",
  );
  const email = home({ shape: { calendar: "email", dealsOn: true, word: "visit" } });
  assert.equal(stage(email, "before").stateWords, "Needs your calendar feed", "bookings arrive by email, and no feed");
  const made = home({
    shape: { calendar: "none", dealsOn: true, word: "visit" },
    playbooks: playbooks({ rows: [playbook(), playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow" })] }),
  });
  const before = stage(made, "before");
  assert.deepEqual([before.playbookId, before.stateWords, before.covered], ["pb-r", "Needs your calendar", false]);
  assert.deepEqual(before.act, { kind: "open", label: "Open", playbookId: "pb-r" }, "its drawer opens, to pause or delete it");
  assert.equal(before.summary, "Reminder · not running here");
  assert.equal(
    made.coming.rows.some((r) => r.id === "moment:pb-r"),
    false,
    "Coming up promises no run of it",
  );
});

test("a moment that holds several campaigns is led by the running one, says how they stand and carries a meter; one alone says its name and clock", () => {
  const rows = [
    playbook({ id: "pb-a", name: "Win-back · paused", state: "paused", next: "paused" }),
    playbook({ id: "pb-b", name: "Win-back · by visits", trigger: "lapsed" }),
    playbook({ id: "pb-c", name: "Win-back · spring" }),
  ];
  const quiet = stage(home({ playbooks: playbooks({ rows }) }), "quiet");
  assert.equal(quiet.playbookId, "pb-b", "a running one first, the newest of them (the rows come newest first)");
  assert.equal(quiet.summary, "3 campaigns · 2 on · 1 paused");
  assert.deepEqual(quiet.bar, { on: 2, waiting: 0, paused: 1, of: 3 });
  const one = stage(home(), "quiet");
  assert.equal(one.summary, "Win-back · daily 10:00 AM");
  assert.equal(one.bar, null, "a meter only where a moment holds two or more");
  assert.equal(stage(home(), "after").summary, null, "nothing stands on it");
});

test("a paused campaign rests: plain, not amber; a run waiting on you is the one amber (D13)", () => {
  const paused = home({ playbooks: playbooks({ rows: [playbook({ state: "paused", next: "paused" })] }) });
  assert.deepEqual([stage(paused, "quiet").state, stage(paused, "quiet").tone], ["paused", "plain"]);
  assert.equal(C.stateTone("playbook", "paused"), "plain");
  assert.equal(C.stateTone("playbook", "approval"), "warn");
  assert.deepEqual(C.LIFECYCLE_TOAST.paused("Win-back"), [{ b: "Win-back" }, " paused"]);
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/lifecycle.test.mjs
```

Expected: FAIL: the stages are in the old order with the id `visit`; `summary` is undefined.

- [ ] **Step 3: The stage's type, the words, the tone**

`ct/playbooks/lifecycle/lifecycle-types.ts`: add `import type { JourneyStageId } from "../../journey/journey";`. In `LifecycleStage`: `id: JourneyStageId;` with the doc "The journey's stage (journey.ts): free of the word, and the ledger's group and its address (`campaigns/in:before`)."; `playbookId`'s doc "The campaign that leads it: a running one first, else the newest; null where none stands on it, and for the receptionist."; `state`'s doc gains "; not_here: where it cannot run (deals off) or cannot be counted (no calendar)". Add after `channels`:

```ts
  /** What its card says of its campaigns: the one's name and clock ("Visit reminder · daily 9:00 AM"), or "3 campaigns · 2 on · 1 paused"; null where none stands on it. */
  summary: string | null;
  /** How its campaigns stand, for the card's meter: only where it holds two or more, else null. */
  bar: LifecycleBar | null;
```

and after the `LifecycleStage` interface:

```ts
/** How a moment's campaigns stand, for its card's meter (on in ok, waiting in warn, paused at rest), of how many. */
export interface LifecycleBar {
  on: number;
  waiting: number;
  paused: number;
  of: number;
}
```

`ct/playbooks/lifecycle/lifecycle-words.ts`: add to `LIFECYCLE_WORDS`, after `noLine`:

```ts
  // An appointment moment where no calendar feeds it (decision 44 of 9 Oct 2026): what it says instead of a figure, and its door.
  needsCalendar: { none: "Needs your calendar", email: "Needs your calendar feed", door: "Connect your calendar" },
```

add to `LIFECYCLE_TOAST`, after `resumed`:

```ts
  paused: (name: string): LifecycleSentence => [{ b: name }, " paused"],
```

in `lifecycleStateOf` change `if (p.state !== "running") return stated("Paused", "warn", true);` to

```ts
  // Paused rests (decision 13 of 9 Oct 2026): amber is for a run waiting on someone, never for a rule its owner stopped.
  if (p.state !== "running") return stated("Paused", "plain", true);
```

and add at the end of the file:

```ts
/** How a moment's or a group's campaigns stand, in a line: "3 campaigns · 2 on · 1 paused". */
export function tallyWords(n: number, t: { on: number; waiting: number; paused: number; off: number }): string {
  return [
    plural(n, "campaign"),
    t.on > 0 ? `${t.on} on` : "",
    t.waiting > 0 ? `${t.waiting} waiting` : "",
    t.paused > 0 ? `${t.paused} paused` : "",
    t.off > 0 ? `${t.off} not running here` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
```

`ct/shell/tone.ts:162-165`: `playbook: { running: "ok", paused: "plain", approval: "warn" },`, with a comment line above it: `// Paused rests (decision 13, 9 Oct 2026): amber is a run waiting on someone, never a rule its owner stopped.`

- [ ] **Step 4: The stages over the journey**

`ct/playbooks/lifecycle/lifecycle.ts`: add to the imports

```ts
import { journeyOf, journeyStageOf, type JourneyStage } from "../../journey/journey";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
```

add `tallyWords` to the `./lifecycle-words` import and `LifecycleBar`, `LifecycleShape` to the `./lifecycle-types` type import. Replace everything from `/** What a stage says of its people and what turning it on says it reaches ("3 tomorrow"). */` (the `STAGES` constant) through the end of `lifecycleStages` with the code below, but keep `hasLine` (it sits inside that range) exactly as it is, placed before `stageOf`:

```ts
/** The moment a new campaign on the win-back starts from: the one the workspace offers, by visits or by silence. */
function winBackMoment(playbooks: LifecyclePlaybooks, fallback: string | null): string | null {
  return playbooks.triggers.find((t) => t.offered && isWinBack(t.id))?.id ?? fallback;
}

/** The moment's pool by the key a stage counts it from: null where the moment was not counted. */
function poolOf(playbooks: LifecyclePlaybooks, key: string) {
  return playbooks.pools[key] ?? null;
}

/**
 * The playbooks as the home reads them: one on an appointment moment where no calendar feeds it runs nothing here
 * (decision 44), and says why, as a follow-up where deals are off does, so its state, its marks and Coming up follow.
 */
function calendarRead(playbooks: LifecyclePlaybooks, shape: LifecycleShape): LifecyclePlaybooks {
  if (shape.calendar === "feed") return playbooks;
  const why = LIFECYCLE_WORDS.needsCalendar[shape.calendar];
  return {
    ...playbooks,
    rows: playbooks.rows.map((p) => (!p.off && triggerOf(p.trigger)?.kind === "visit" ? { ...p, off: why } : p)),
  };
}

/** The campaigns that stand on a stage, newest first (the rows come newest first). */
export function stagePlaybooks(def: JourneyStage, rows: readonly LifecyclePlaybook[]): LifecyclePlaybook[] {
  return rows.filter((p) => def.holds.includes(p.trigger));
}

/** How campaigns stand: on, a run waiting on the person, paused (an archived list's among them), or running nothing here. */
export function tallyOf(own: readonly LifecyclePlaybook[]): { on: number; waiting: number; paused: number; off: number } {
  const t = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const p of own) {
    if (p.off) t.off += 1;
    else if (p.state !== "running") t.paused += 1;
    else if (p.totals.waiting) t.waiting += 1;
    else t.on += 1;
  }
  return t;
}

/** What a card says of its campaigns: the one's name and clock, or how many stand how; null where none stands on it. */
function summaryOf(own: readonly LifecyclePlaybook[]): string | null {
  if (own.length > 1) return tallyWords(own.length, tallyOf(own));
  const p = own.at(0);
  if (!p) return null;
  const short = lifecycleStateOf(p).short;
  return `${p.name} · ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
}

/** The card's meter: only where a moment holds two or more campaigns. */
function barOf(own: readonly LifecyclePlaybook[]): LifecycleBar | null {
  if (own.length < 2) return null;
  const t = tallyOf(own);
  return { on: t.on, waiting: t.waiting, paused: t.paused, of: own.length };
}

/** What a stage is drawn from beyond its definition. */
interface StageAt {
  playbooks: LifecyclePlaybooks;
  shape: LifecycleShape;
  line: boolean;
  ready: ChannelsReady | null;
}

/** A stage before its state is said. */
type StageBase = Omit<LifecycleStage, "state" | "stateWords" | "phoneWords" | "tone" | "covered" | "act">;

/** First contact: the receptionist's, always on where there is a line for it to answer on; with none it is off, in words. */
function receptionistStage(base: StageBase, line: boolean): LifecycleStage {
  if (!line)
    return {
      ...base,
      needsWords: LIFECYCLE_WORDS.noLine.needs,
      state: "off",
      stateWords: LIFECYCLE_WORDS.noLine.state,
      phoneWords: "Off",
      tone: "plain",
      covered: false,
      act: null,
    };
  return {
    ...base,
    state: "always",
    stateWords: LIFECYCLE_WORDS.receptionist,
    phoneWords: "Live",
    tone: "ok",
    covered: true,
    act: null,
  };
}

/**
 * An appointment moment without a calendar (decision 44): it cannot be counted here, so no figure and no Turn on; it
 * says it needs a calendar ("…feed" where bookings arrive only by email), and its card opens the campaign made there
 * before, else the calendar's row in Settings. Never covered.
 */
function unmetStage(base: StageBase, shape: LifecycleShape): LifecycleStage {
  const words = LIFECYCLE_WORDS.needsCalendar[shape.calendar === "email" ? "email" : "none"];
  const act: LifecycleAct = base.playbookId
    ? { kind: "open", label: "Open", playbookId: base.playbookId }
    : { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  return {
    ...base,
    people: null,
    channels: [],
    state: "not_here",
    stateWords: words,
    phoneWords: words,
    tone: "plain",
    covered: false,
    act,
  };
}

/** A moment a campaign leads: on with its clock, waiting on the person, paused, or running nothing here, its drawer a press away. */
function playbookStage(base: StageBase, p: LifecyclePlaybook): LifecycleStage {
  const s = lifecycleStateOf(p);
  const state = p.off ? "not_here" : s.paused ? "paused" : "on";
  return {
    ...base,
    state,
    stateWords: s.words,
    phoneWords: s.short,
    tone: s.tone,
    covered: state === "on",
    // On, and a run of it waits for the person: the node is a clock (the pill beside it says "Waiting on you").
    waits: state === "on" && !!p.totals.waiting,
    act: { kind: "open", label: "Open", playbookId: p.id },
  };
}

/** A moment no campaign stands on: off with Turn on where it is offered, else not offered here. */
function emptyStage(base: StageBase, offered: boolean, moment: string): LifecycleStage {
  if (!offered) {
    const words = "Not offered here";
    return { ...base, state: "not_here", stateWords: words, phoneWords: words, tone: "plain", covered: false, act: null };
  }
  return {
    ...base,
    state: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    covered: false,
    act: { kind: "turn_on", label: "Turn on", moment },
  };
}

/** One stage of the journey, with the campaign that leads it and its count. */
function stageOf(def: JourneyStage, at: StageAt): LifecycleStage {
  const { playbooks } = at;
  const own = def.kind === "moment" ? stagePlaybooks(def, playbooks.rows) : [];
  const p = own.find((x) => x.state === "running") ?? own.at(0) ?? null;
  const moment = def.id === "quiet" ? winBackMoment(playbooks, def.trigger) : def.trigger;
  const poolKey = def.kind === "receptionist" ? def.poolKey : (p?.trigger ?? moment ?? def.poolKey);
  const pool = def.unmet ? null : poolOf(playbooks, poolKey);
  const needs: LifecycleNeeds =
    moment === null
      ? "none"
      : purposeOfPlaybook(triggerOf(moment)?.cls ?? null) === "marketing"
        ? "offers"
        : "messages";
  const base: StageBase = {
    id: def.id,
    caps: def.caps,
    name: p ? p.name : def.name,
    glyph: def.glyph,
    moment,
    playbookId: p ? p.id : null,
    people: pool ? pool.pool : null,
    unit: def.unit,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    hint: null,
    waits: false,
    // A campaign's channels; the receptionist's and an empty moment's are none (what Turn on ticks is the composer's to say).
    channels: p ? channelMarksOf(p, playbooks.templates, at.ready) : [],
    summary: summaryOf(own),
    bar: barOf(own),
  };
  if (def.kind === "receptionist") return receptionistStage(base, at.line);
  if (def.unmet) return unmetStage(base, at.shape);
  if (p) return playbookStage(base, p);
  const offered = moment !== null && playbooks.triggers.some((t) => t.id === moment && t.offered);
  return emptyStage(base, offered, moment ?? def.poolKey);
}

/** The one off moment that has people it would reach: its Turn on says how many, in its own words ("Turn on · 3 tomorrow"). */
function withHint(
  stages: readonly LifecycleStage[],
  defs: readonly JourneyStage[],
  playbooks: LifecyclePlaybooks,
): LifecycleStage[] {
  const reachOf = (s: LifecycleStage) => poolOf(playbooks, s.moment ?? "")?.candidates ?? 0;
  const at = stages.findIndex((s) => s.state === "off" && reachOf(s) > 0);
  if (at < 0) return [...stages];
  return stages.map((s, i) => {
    if (i !== at || s.act?.kind !== "turn_on") return s;
    const hint = `Turn on · ${reachOf(s)} ${defs.find((d) => d.id === s.id)?.off?.hint ?? ""}`;
    return { ...s, hint, act: { ...s.act, label: hint } };
  });
}

/** The journey's stages for the workspace's shape (journey.ts journeyOf), each drawn, with their definitions. */
function lifecycleStages(at: StageAt): { defs: JourneyStage[]; stages: LifecycleStage[] } {
  const held = new Set(
    at.playbooks.rows.flatMap((p) => {
      const id = journeyStageOf(p.trigger);
      return id ? [id] : [];
    }),
  );
  const defs = journeyOf({ calendarOn: at.shape.calendar === "feed", dealsOn: at.shape.dealsOn, word: at.shape.word, held });
  return { defs, stages: withHint(defs.map((d) => stageOf(d, at)), defs, at.playbooks) };
}
```

In `chainStrip`, change `tone: paused || waiting ? "warn" : "ok",` to `tone: waiting ? "warn" : paused ? "plain" : "ok",`.

Replace `campaignsHomeOf` with:

```ts
/** The whole home: the head, the rail, the lines under it, the three tiles, and what could not be read. */
export function campaignsHomeOf(input: LifecycleInput): LifecycleHome {
  // A campaign on an appointment moment no calendar feeds runs nothing here, and every part of the page says so.
  const at: LifecycleInput =
    input.playbooks && input.shape ? { ...input, playbooks: calendarRead(input.playbooks, input.shape) } : input;
  const made: { defs: JourneyStage[]; stages: LifecycleStage[] } =
    at.playbooks && at.shape
      ? lifecycleStages({ playbooks: at.playbooks, shape: at.shape, line: hasLine(at.broadcasts), ready: readyOf(at) })
      : { defs: [], stages: [] };
  const { defs, stages } = made;
  const covered = stages.filter((s) => s.covered).length;
  return {
    head: lifecycleHeadOf(at, stages),
    rail: {
      title: LIFECYCLE_WORDS.rail,
      coveredWords: stages.length > 0 ? `${covered} of ${stages.length} moments covered` : null,
      phoneWords: stages.length > 0 ? `${covered} of ${stages.length} on` : null,
      stages,
    },
    strips: lifecycleStrips(at, stages),
    reach: lifecycleReach(at, stages),
    coming: lifecycleComing(at, stages, defs),
    results: lifecycleResults(at),
    failed: failedOf(at),
  };
}
```

Update the file's header: the moments are "the journey's (journey/journey.ts journeyOf), in the order the business's customers pass through them, Proposal waiting before Quiet or lapsed", and "an appointment moment without a calendar says it needs one".

- [ ] **Step 5: Coming up's off lines read the stage's own words**

`ct/playbooks/lifecycle/lifecycle-tiles.ts`: add `import type { JourneyStage } from "../../journey/journey";`; delete `offWhy` and `OFF_WHEN`; replace `offRows` with:

```ts
/** An off moment that has people waiting offers to be turned on, in its stage's own words (journey.ts `off`). */
function offRows(stages: readonly LifecycleStage[], defs: readonly JourneyStage[], nowMs: number): LifecycleComing[] {
  return stages.flatMap((s, i) => {
    const off = defs.find((d) => d.id === s.id)?.off;
    if (!off || s.state !== "off" || s.act?.kind !== "turn_on" || (s.people ?? 0) <= 0) return [];
    return [
      {
        id: `off:${s.id}`,
        kind: "off" as const,
        when: off.when,
        what: s.name,
        why: off.why(s.people ?? 0),
        pill: null,
        act: { kind: "turn_on" as const, label: "Turn on", moment: s.act.moment },
        waiting: null,
        atMs: nowMs + COMING_DAYS * DAY_MS + i,
      },
    ];
  });
}
```

and give `lifecycleComing` a third parameter, `defs: readonly JourneyStage[]`, passed to `offRows(stages, defs, nowMs)`.

- [ ] **Step 6: Build and run**

```bash
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/lifecycle.test.mjs
```

Expected: `# fail 0`.

- [ ] **Step 7: Run every peer that pins the stages' ids, order, words or tones**

```bash
for f in playbooks/home/channels-on-the-home playbooks/home/moments-offered playbooks/home/campaigns-home reports/reports-honest broadcasts/run-report reach-out-sheet/reach-out-rows playbooks/runs-honest playbooks/playbook-composer journey/journey; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/dashboard typecheck
```

Fix by kind: a stage id `"visit"` becomes `"before"` (`campaigns-home.test.mjs:149`, `reports/reports-honest.test.mjs:185, 220`); an expected order of stages puts `proposal` before `quiet`; "Proposal out" becomes "Proposal waiting" and "After a visit" becomes "After the visit"; a fixture building the home's input or the playbooks surface without `shape` gains `shape: { calendar: "feed", dealsOn: <its deals_on>, word: "visit" }`; a paused playbook's or chain's tone `"warn"` becomes `"plain"`. Anything else: stop and report.

- [ ] **Step 8: Commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/playbooks/lifecycle packages/contracts/src/shell/tone.ts tooling/scripts/tests
git status --short
git add packages/contracts/src/playbooks/lifecycle packages/contracts/src/shell/tone.ts packages/contracts/dist tooling/scripts/tests/playbooks/home/lifecycle.test.mjs
git commit -m "Campaigns' rail is the journey's, each moment led by its running campaign with a summary and a meter, and a paused one rests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add by name each other test file Step 7 changed.

---

### Task 11: The ledger: every campaign in one grouped, counted, sortable list (spec §4.1, §6 3(c); corrections 16, 19, 20, 26, 27, 31, 32; D13–D17, D19)

`LifecycleHome.ledger` replaces `strips`; `LifecycleStrip`, `LIFECYCLE_WORDS.alsoRunning` and `.kickers` go; `lifecycleKicker` reads the groups. One builder per kind of row, a sort key and the counts, each well under 30 branches and 150 lines. The page keeps drawing its lines under the rail through a small bridge in `home/rail.tsx` until lane 3 draws the ledger (`home/ledger/`) and deletes the bridge with the strips' CSS.

**Files:**
- Create: `ct/playbooks/lifecycle/lifecycle-ledger.ts`, `tests/playbooks/home/ledger.test.mjs`
- Modify: `ct/playbooks/lifecycle/lifecycle-types.ts`, `lifecycle-words.ts`, `lifecycle.ts`, `lifecycle-tiles.ts`, `ct/playbooks/index.ts`, `ct/browser.generated.ts`
- Modify: `home/rail.tsx:1-23, 100-200, 255-283`, `home/home-page.tsx:89-92`
- Test: `tests/playbooks/home/ledger.test.mjs`, `tests/playbooks/home/lifecycle.test.mjs`, `tests/playbooks/home/channels-on-the-home.test.mjs`, `tests/playbooks/home/moments-offered.test.mjs`, and the peers in Step 9

Before changing the strips, list every test that names them, and run each in Step 9: `git grep -l -E "strips|cmh-strip|alsoRunning|kickers|lifecycleKicker|LifecycleStrip" -- tooling/scripts/tests e2e` (expected today: `playbooks/home/{lifecycle,channels-on-the-home,moments-offered,campaigns-home}.test.mjs`, `playbooks/playbook-composer.test.mjs`, `reach-out-sheet/reach-out-rows.test.mjs`, and lane 3's e2e specs, which this lane does not run).

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/playbooks/home/ledger.test.mjs`:

```js
/**
 * Campaigns' ledger (spec 2026-10-09 §4.1): every campaign of a workspace in one list, grouped by the moment it stands
 * on in the journey's order, then Lists & offers, Reach-outs and, past seven rows, the one-off sends. EXECUTED through
 * contracts' campaignsHomeOf over fixtures in the surfaces' shape: one campaign per moment, three on one, a deleted
 * playbook's run, the chains absent, failed and past twenty, the counts, the sort keys, six rows and seven.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: "tomorrow 10:00 AM" is Saturday the 3rd, 14:00 UTC. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

/** A playbook as the playbooks surface's card holds it. */
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  cap_per_run: 25,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00 AM",
  triggerLabel: "Win-back",
  candidates: 4,
  held: 0,
  named: { pool: 5, saidYes: 4 },
  off: null,
  totals: { waiting: null },
  ...over,
});
const pool = (n, candidates = 0) => ({ candidates, held: 0, pool: n, saidYes: n });
const TRIGGERS = ["visit_tomorrow", "visited", "quiet_30", "proposal_waiting", "everyone_monthly", "saved_list"].map(
  (id) => ({ id, offered: true, candidates: 0, named: null }),
);
const playbooks = (rows, over = {}) => ({
  rows,
  pools: { new_week: pool(2), visit_tomorrow: pool(3, 3), visited: pool(1), quiet_30: pool(5, 4), proposal_waiting: pool(0) },
  triggers: TRIGGERS,
  timezone: ZONE,
  countsRead: true,
  ...over,
});
/** A run waiting on the person, as the broadcasts surface lists it. */
const run = (over = {}) => ({
  id: "r-1",
  name: "Win-back · Oct 3",
  state: "pending_approval",
  when: "tomorrow 10:00 AM",
  scheduled_for: "2026-10-03T14:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 7,
  playbook_id: "pb-1",
  counts: { sent: 0, replied: 0 },
  run_for: "2026-10-03",
  ...over,
});
const broadcasts = (rows = []) => ({
  rows,
  number: { present: true },
  optIn: { phrase: "YES OFFERS", link: null },
  reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 4 },
});
/** One campaign's last 30 days as campaign_series' `sources` say them. */
const source = (id, sent, replied, kind = "playbook", name = id) => ({
  id,
  kind,
  name,
  sent,
  replied,
  lastAt: "2026-09-28T15:00:00Z",
});
const report = (sources = []) => ({
  days: 30,
  totals: { sent: 0, delivered: 0, read: 0, replied: 0, optIns: 0, optOuts: 0 },
  sources,
});
/** A reach-out's chain as the reach-outs surface holds it, as far as its row reads it. */
const chain = (root_id, over = {}) => ({
  root_id,
  name: `Reach out · ${root_id}`,
  search: { id: "s-1", name: "Trainers" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: null,
  steps: [{}, {}],
  domains: [],
  next: { waiting_run_id: null },
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const input = (over = {}) => ({
  nowMs: NOW,
  tz: ZONE,
  playbooks: playbooks([playbook()]),
  broadcasts: broadcasts(),
  library: [],
  messages: [],
  reachOuts: [],
  report: report(),
  shape: { calendar: "feed", dealsOn: true, word: "appointment" },
  chains: undefined,
  ...over,
});
const ledger = (over = {}) => C.campaignsHomeOf(input(over)).ledger;
const group = (l, id) => l.groups.find((g) => g.id === id);
const row = (l, id) => l.groups.flatMap((g) => g.rows).find((r) => r.id === id);

test("one campaign per moment: the journey's groups in order, then Lists & offers and Reach-outs; each campaign once", () => {
  const rows = [
    playbook({ id: "pb-v", name: "Reminder", trigger: "visit_tomorrow", named: { pool: 3, saidYes: 3 } }),
    playbook({ id: "pb-a", name: "Check-in", trigger: "visited" }),
    playbook(),
  ];
  const l = ledger({ playbooks: playbooks(rows) });
  assert.deepEqual(
    l.groups.map((g) => g.id),
    ["first_contact", "before", "after", "proposal", "quiet", "lists", "reach_out"],
  );
  assert.deepEqual(
    group(l, "before").rows.map((r) => r.id),
    ["pb-v"],
  );
  assert.deepEqual(group(l, "proposal").rows, [], "an empty moment draws, with its Turn on");
  assert.deepEqual(group(l, "proposal").add, { kind: "turn_on", label: "Turn on", moment: "proposal_waiting" });
  assert.deepEqual([group(l, "before").caps, group(l, "before").meta], ["Appointment tomorrow", "1 campaign · 1 on"]);
  assert.deepEqual(l.counts, { all: 3, running: 3, needs: 0, paused: 0 });
  const v = row(l, "pb-v");
  assert.deepEqual(
    [v.kind, v.status, v.stateWords, v.tone, v.hint],
    ["playbook", "on", "On · daily 10:00 AM", "ok", "The day before an appointment on the calendar"],
  );
  assert.deepEqual(v.people, { n: 3, unit: "people" });
  assert.deepEqual(v.open, { kind: "open", label: "Open", playbookId: "pb-v" });
  assert.equal(v.act, null, "no switch on a row (decision 5): a running campaign's act is its drawer");
  assert.deepEqual(v.next, { words: "tomorrow 10:00 AM", atMs: Date.parse("2026-10-03T14:00:00Z") });
  assert.equal(v.results, "none", "counted, and nothing went in the period");
  assert.ok(v.search.includes("reminder") && v.search.includes("appointment tomorrow"), v.search);
  assert.deepEqual([l.period, l.results, l.tools, l.sentOnce], ["Last 30 days", "read", false, null]);
  assert.equal(l.words, C.LIFECYCLE_WORDS.ledger);
});

test("First contact holds the receptionist and the call's text as rows of their own kind: never counted, no Turn on", () => {
  const l = ledger();
  const fc = group(l, "first_contact");
  assert.equal(fc.add, null);
  const [receptionist, callText] = fc.rows;
  assert.deepEqual(
    [receptionist.kind, receptionist.status, receptionist.stateWords, receptionist.open, receptionist.results],
    ["receptionist", "always", "Answers · asks for the yes", null, "uncounted"],
  );
  assert.deepEqual(
    [callText.kind, callText.stateWords, callText.tone, callText.open],
    ["call_text", "No message for it yet", "warn", { kind: "route", label: "Open", route: "messages" }],
  );
  assert.equal(l.counts.needs, 0, "the call's text is not a campaign: its amber is not a campaign needing you");
});

test("three campaigns on one moment: all in its group, the stage's lead first, the group saying how they stand", () => {
  const rows = [
    playbook({ id: "pb-p", name: "Win-back · paused", state: "paused", next: "paused" }),
    playbook(),
    playbook({ id: "pb-l", name: "Win-back · by visits", trigger: "lapsed", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
  ];
  const over = { playbooks: playbooks(rows), broadcasts: broadcasts([run({ playbook_id: "pb-l" })]) };
  const l = ledger(over);
  const quiet = group(l, "quiet");
  assert.deepEqual(
    quiet.rows.map((r) => r.id),
    ["pb-1", "pb-p", "pb-l"],
    "the lead (a running one, the newest of them) first, then the rest as they came",
  );
  assert.equal(quiet.meta, "3 campaigns · 1 on · 1 waiting · 1 paused");
  const paused = row(l, "pb-p");
  assert.deepEqual([paused.status, paused.tone, paused.next], ["paused", "plain", { words: "Paused", atMs: null }]);
  assert.equal(paused.act.kind, "resume");
  assert.deepEqual(paused.act.ask, {
    question: "Resume Win-back · paused?",
    detail: "Next run tomorrow 10:00 AM, about 4 people",
  });
  const waiting = row(l, "pb-l");
  assert.deepEqual([waiting.status, waiting.stateWords, waiting.tone], ["waiting", "Waiting on you", "warn"]);
  assert.deepEqual(waiting.waiting, { runId: "r-1", people: 7, refusal: null }, "approved or skipped on its row (decision 14)");
  assert.deepEqual(waiting.next, { words: "Waiting on you", atMs: NOW });
  assert.deepEqual(l.counts, { all: 3, running: 2, needs: 1, paused: 1 });
  const stage = C.campaignsHomeOf(input(over)).rail.stages.find((s) => s.id === "quiet");
  assert.deepEqual(stage.bar, { on: 1, waiting: 1, paused: 1, of: 3 });
});

test("Resume under auto says in full that it sends on its own (decision 7); under ask, or with the mode unread, when and how many alone", () => {
  const rows = [playbook({ id: "pb-p", state: "paused", next: "paused", policy_class: "reengage" })];
  const detail = (modes) => row(ledger({ playbooks: playbooks(rows, { modes }) }), "pb-p").act.ask.detail;
  assert.equal(
    detail({ reengage: "auto" }),
    "Next run tomorrow 10:00 AM, about 4 people. It sends on its own: nothing will wait for your approval.",
  );
  assert.equal(detail({ reengage: "ask" }), "Next run tomorrow 10:00 AM, about 4 people");
  assert.equal(detail(null), "Next run tomorrow 10:00 AM, about 4 people", "unread: the mode is not guessed");
});

test("the counts are campaigns': running, needing you (a run waiting or an archived list, the one amber) and paused", () => {
  const rows = [
    playbook({ id: "pb-w", totals: { waiting: { id: "r-1", recipient_count: 7 } } }),
    playbook({ id: "pb-a", name: "Regulars", trigger: "saved_list", triggerLabel: "Regulars", state: "paused", listArchived: true }),
    playbook({ id: "pb-m", name: "Monthly", trigger: "everyone_monthly", state: "paused" }),
    playbook({ id: "pb-o", name: "Follow-up", trigger: "proposal_waiting", off: "Deals are off." }),
  ];
  const l = ledger({ playbooks: playbooks(rows), reachOuts: [chain("ro-1", { state: "paused" })] });
  assert.deepEqual(l.counts, { all: 5, running: 1, needs: 2, paused: 3 });
  const archived = row(l, "pb-a");
  assert.deepEqual([archived.kind, archived.stateWords, archived.tone, archived.act], ["list", "Its list is archived", "warn", null]);
  const off = row(l, "pb-o");
  assert.deepEqual([off.status, off.stateWords, off.act], ["not_here", "Not running here", null]);
  assert.equal(row(l, "pb-m").kind, "offer");
  assert.equal(row(l, "everyone_monthly"), undefined, "the month's offer made is its own row, not the Turn on line");
});

test("a deleted playbook's run and a one-off send are the period's sent-once, a footer under seven rows; a playbook's source naming no row is in none", () => {
  const l = ledger({
    report: report([
      source("b-old", 12, 2, "broadcast", "Win-back · Sep 14"),
      source("b-news", 30, 4, "broadcast", "Autumn news"),
      source("pb-gone", 9, 1),
    ]),
  });
  assert.deepEqual(l.sentOnce, { n: 2, open: { kind: "route", label: "Sent", route: "broadcasts" } });
  assert.equal(group(l, "sent_once"), undefined, "under seven rows: the footer, no group");
  assert.equal(row(l, "pb-gone"), undefined);
  assert.equal(l.counts.all, 1);
});

test("six rows keep the page short; the seventh brings the tools, and the one-off sends become a group counted under All", () => {
  const lists = (n) =>
    Array.from({ length: n }, (_, i) =>
      playbook({ id: `pb-${i}`, name: `List ${i}`, trigger: "saved_list", triggerLabel: `List ${i}` }),
    );
  const sources = [source("b-1", 30, 4, "broadcast", "Autumn news")];
  const six = ledger({ playbooks: playbooks(lists(6)), report: report(sources) });
  assert.deepEqual([six.counts.all, six.tools, six.sentOnce?.n], [6, false, 1]);
  const seven = ledger({ playbooks: playbooks(lists(7)), report: report(sources) });
  assert.deepEqual([seven.counts.all, seven.tools, seven.sentOnce], [8, true, null]);
  const once = group(seven, "sent_once");
  assert.deepEqual(
    once.rows.map((r) => [r.id, r.kind, r.results]),
    [["b-1", "sent_once", { kind: "sent", sent: 30, replied: 4 }]],
  );
  assert.deepEqual(once.rows[0].open, { kind: "route", label: "Open", route: "broadcasts/run:b-1" });
  assert.equal(once.meta, "1 send · last 30 days");
});

test("a reach-out's numbers: written and wrote back from its own totals; absent or failed say —; past the report's twenty it still says its numbers or Nothing sent", () => {
  const chains = [chain("ro-1"), chain("ro-2"), chain("ro-21")];
  const res = (l, id) => row(l, id).results;
  assert.equal(res(ledger({ reachOuts: chains, chains: undefined }), "ro-1"), "uncounted", "not read yet");
  assert.equal(res(ledger({ reachOuts: chains, chains: null }), "ro-1"), "uncounted", "could not be read");
  const every = ledger({
    reachOuts: chains,
    chains: { complete: true, byRoot: { "ro-1": { written: 40, wroteBack: 6 }, "ro-2": { written: 0, wroteBack: 0 } } },
  });
  assert.deepEqual(res(every, "ro-1"), { kind: "written", written: 40, wroteBack: 6 });
  assert.equal(res(every, "ro-2"), "none");
  assert.equal(res(every, "ro-21"), "none", "every chain counted: one past twenty that wrote nothing says so");
  const twenty = ledger({ reachOuts: chains, chains: { complete: false, byRoot: { "ro-1": { written: 40, wroteBack: 6 } } } });
  assert.equal(res(twenty, "ro-21"), "uncounted", "from the report's twenty: one not among them may be past them");
  const W = C.LIFECYCLE_WORDS.ledger;
  assert.equal(W.results(res(every, "ro-1")), "40 written · 6 wrote back");
  assert.equal(W.results({ kind: "sent", sent: 212, replied: 48 }), "212 sent · 48 replied");
  assert.equal(W.results("none"), "Nothing sent");
  assert.equal(W.results("uncounted"), "—");
  assert.deepEqual(group(every, "reach_out").add, {
    kind: "route",
    label: "Find businesses to write to",
    route: "clients/leads",
  });
  const paused = row(ledger({ reachOuts: [chain("ro-p", { state: "paused" })] }), "ro-p");
  assert.deepEqual([paused.status, paused.tone, paused.act.kind], ["paused", "plain", "resume"]);
  const waits = row(ledger({ reachOuts: [chain("ro-w", { next: { waiting_run_id: "r-9" } })] }), "ro-w");
  assert.deepEqual(
    [waits.status, waits.waiting, waits.act],
    ["waiting", null, { kind: "route", label: "Open the run", route: "broadcasts/run:r-9" }],
    "a chain's run is decided on its own page",
  );
});

test("the sort keys: Next puts a waiting run first, then the soonest, paused last; Name; People now; Replied", () => {
  const mk = (id, over) => ({
    id,
    name: id,
    status: "on",
    people: { n: 1, unit: "people" },
    results: "none",
    next: { words: "", atMs: 10 },
    ...over,
  });
  const rows = [
    mk("paused", { status: "paused", next: { words: "Paused", atMs: null } }),
    mk("later", { next: { words: "", atMs: 20 }, people: { n: 9, unit: "people" }, results: { kind: "sent", sent: 10, replied: 5 } }),
    mk("waiting", { status: "waiting", next: { words: "Waiting on you", atMs: 30 } }),
    mk("soon", { people: { n: null, unit: "people" }, results: "uncounted" }),
    mk("chain", { results: { kind: "written", written: 40, wroteBack: 6 }, next: { words: "—", atMs: null } }),
  ];
  const ids = (by) => [...rows].sort(C.ledgerOrder(by)).map((r) => r.id);
  assert.deepEqual([...C.LEDGER_SORTS], ["next", "name", "people", "replied"]);
  assert.deepEqual(ids("next"), ["waiting", "soon", "later", "chain", "paused"]);
  assert.deepEqual(ids("name"), ["chain", "later", "paused", "soon", "waiting"]);
  assert.deepEqual(ids("people"), ["later", "chain", "paused", "waiting", "soon"], "the most first, one not counted last");
  assert.deepEqual(ids("replied"), ["chain", "later", "paused", "waiting", "soon"], "a chain's wrote back beside replied");
});

test("without a calendar the appointment groups say they need one, with its door and no Turn on; a campaign made there before runs nothing here", () => {
  const l = ledger({
    shape: { calendar: "none", dealsOn: true, word: "appointment" },
    playbooks: playbooks([playbook(), playbook({ id: "pb-r", name: "Reminder", trigger: "visit_tomorrow" })]),
  });
  for (const id of ["before", "after"])
    assert.deepEqual(group(l, id).add, { kind: "route", label: "Connect your calendar", route: "admin/workspace/calendar" }, id);
  assert.equal(group(l, "after").meta, "Needs your calendar");
  assert.equal(group(l, "before").meta, "1 campaign · 1 not running here");
  const r = row(l, "pb-r");
  assert.deepEqual([r.status, r.stateWords, r.hint, r.channels], ["not_here", "Not running here", "Needs your calendar", []]);
});

test("before the playbooks are read the ledger holds nothing; the period's numbers say they are reading or failed", () => {
  const empty = ledger({ playbooks: undefined, shape: undefined });
  assert.deepEqual([empty.groups, empty.counts, empty.tools], [[], { all: 0, running: 0, needs: 0, paused: 0 }, false]);
  assert.equal(ledger({ report: undefined }).results, "reading");
  assert.equal(ledger({ report: null }).results, "failed");
  assert.equal(row(ledger({ report: null }), "pb-1").results, "uncounted");
  assert.deepEqual(row(ledger({ report: report([source("pb-1", 212, 48)]) }), "pb-1").results, {
    kind: "sent",
    sent: 212,
    replied: 48,
  });
});

test("the drawer's kicker is the campaign's group: its moment's caption, Lists & offers, Reach-outs", () => {
  const home = C.campaignsHomeOf(
    input({
      playbooks: playbooks([playbook(), playbook({ id: "pb-l", name: "Regulars", trigger: "saved_list", triggerLabel: "Regulars" })]),
      reachOuts: [chain("ro-1")],
    }),
  );
  assert.equal(C.lifecycleKicker(home, "pb-1"), "Quiet or lapsed");
  assert.equal(C.lifecycleKicker(home, "pb-l"), "Lists & offers");
  assert.equal(C.lifecycleKicker(home, "ro-1"), "Reach-outs");
  assert.equal(C.lifecycleKicker(home, "nobody"), "Campaign");
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
git add -N tooling/scripts/tests/playbooks/home/ledger.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
```

Expected: FAIL: `Cannot read properties of undefined (reading 'groups')`.

- [ ] **Step 3: The ledger's types**

`ct/playbooks/lifecycle/lifecycle-types.ts`:

Add `import type { LIFECYCLE_WORDS } from "./lifecycle-words";` (a type-only import: the words module imports these types back, and nothing runs). In `LifecycleAct`, make the resume variant carry its question:

```ts
  /** Start a paused campaign again, asked in place: when its next run is, and to how many (decision 7). */
  | { kind: "resume"; label: string; playbookId: string; ask: { question: string; detail: string } }
```

Delete the `LifecycleStrip` interface. Add, after `LifecycleComingTile`:

```ts
/** A row's last 30 days: a playbook's or a one-off's sent and replied (campaign_series), a chain's written and wrote back (Reports' words), counted where nothing went ("none"), or not counted ("uncounted", "—"). */
export type LifecycleRowResults =
  | { kind: "sent"; sent: number; replied: number }
  | { kind: "written"; written: number; wroteBack: number }
  | "none"
  | "uncounted";

/** One row of the ledger: a campaign, or one of First contact's own (the receptionist, the call's text). */
export interface LifecycleRow {
  id: string;
  kind: "receptionist" | "call_text" | "playbook" | "list" | "offer" | "chain" | "sent_once";
  name: string;
  /** What it is, in a line under its name: its moment's hint, its list, its cadence, a chain's search and steps. */
  hint: string;
  status: "always" | "on" | "waiting" | "paused" | "not_here" | "off";
  stateWords: string;
  /** The same on a phone: the clock alone while it is on. */
  phoneWords: string;
  tone: LifecycleTone;
  needs: LifecycleNeeds;
  needsWords: string;
  channels: readonly LifecycleChannelMark[];
  /** Who its moment or list names now (the card's pool), and what the number counts; null where not counted. */
  people: { n: number | null; unit: string };
  results: LifecycleRowResults;
  /** Its next run in words and the moment it is sorted by: a waiting run now, a paused one never (null). */
  next: { words: string; atMs: number | null };
  /** Its door, an address the page draws as a link: the drawer, the Library, a one-off's run in Sent; null for the receptionist. */
  open: LifecycleAct | null;
  /** A run of it waiting on the person, approved or skipped on the row (decision 14); null otherwise. */
  waiting: LifecycleWaiting | null;
  /** The one act its state asks: Resume (asked in place), Turn on, or a chain's waiting run; null for the rest. */
  act: LifecycleAct | null;
  /** What a search matches: its name, its hint and its group's caption, lower-cased. */
  search: string;
}

/** A group of the ledger: a moment of the journey, then Lists & offers, Reach-outs and the one-off sends. */
export interface LifecycleGroup {
  /** Free of the word: the address `campaigns/in:<id>`. */
  id: JourneyStageId | "lists" | "reach_out" | "sent_once";
  caps: string;
  glyph: LifecycleGlyph;
  /** "3 campaigns · 2 on · 1 paused", or what an empty moment says of itself ("Off", "Needs your calendar"). */
  meta: string;
  rows: readonly LifecycleRow[];
  /** Turn on (the hinted one where it is); the calendar's door; "Find businesses to write to"; none on a moment holding its one campaign. */
  add: LifecycleAct | null;
}

/** The words the ledger's page says once (LIFECYCLE_WORDS.ledger), handed over with it. */
export type LedgerWords = (typeof LIFECYCLE_WORDS)["ledger"];

/** Every campaign of the workspace, grouped, counted, and the words to draw it with. */
export interface LifecycleLedger {
  /** The journey's stages in order, then lists, reach_out, and sent_once where the tools stand. */
  groups: readonly LifecycleGroup[];
  /** Campaigns only: the receptionist and the call's text are never counted. */
  counts: { all: number; running: number; needs: number; paused: number };
  /** Seven campaigns or more (decision 15): the tool line, the tabs, the heads, the phone's strip and search. */
  tools: boolean;
  /** Under the tools, the period's one-off sends as a footer and its door to Sent; null where there are none or they are a group. */
  sentOnce: { n: number; open: LifecycleAct } | null;
  /** "Last 30 days". */
  period: string;
  /** Whether the period's numbers are in: "—" in every row while reading or failed. */
  results: LifecycleTileRead;
  words: LedgerWords;
}
```

In `LifecycleHome`, replace `strips: readonly LifecycleStrip[];` with:

```ts
  /** Every campaign, grouped by the moment it stands on (spec 2026-10-09 §4.1). */
  ledger: LifecycleLedger;
```

- [ ] **Step 4: The ledger's words**

`ct/playbooks/lifecycle/lifecycle-words.ts`: add `LifecycleRowResults` to its type import from `./lifecycle-types`; delete `alsoRunning: "Also running",` and the `kickers` entry with its comment; add, before `reach:`:

```ts
  // Campaigns' ledger (spec 2026-10-09 §4.3, §4.4): every word its page says once; each row's own are the view model's.
  ledger: {
    heads: { campaign: "Campaign", goesBy: "Goes by", people: "People now", results: "Last 30 days", next: "Next" },
    tabs: { all: "All", needs: "Needs you", paused: "Paused" },
    /** "Needs you" names its unit, where its count is said: "2 campaigns need you". */
    needsOf: (n: number): string => `${plural(n, "campaign")} ${n === 1 ? "needs" : "need"} you`,
    search: (n: number): string => `Search ${plural(n, "campaign")}`,
    showing: (n: number, of: number): string => `Showing ${n} of ${of}`,
    showingIn: (caps: string, n: number, of: number): string => `${caps} · showing ${n} of ${of}`,
    clear: "Clear",
    sort: { label: "Sort", next: "Next", name: "Name", people: "People now", replied: "Replied" },
    group: { label: "Group", moment: "By moment", none: "No groups" },
    groups: { lists: "Lists & offers", reach_out: "Reach-outs", sent_once: "Sent once" },
    /** A group no campaign stands on yet. */
    none: "No campaign yet",
    empty: "No campaigns match",
    /** What is not counted, or not known, in a cell: never a zero nobody counted. */
    dash: "—",
    turnOn: "Turn on",
    findBusinesses: "Find businesses to write to",
    archived: "Its list is archived",
    businesses: "businesses",
    chainNeeds: "Writes to the businesses a search found",
    openRun: "Open the run",
    /** A row's last 30 days, as its cell says them. */
    results: (r: LifecycleRowResults): string =>
      r === "uncounted"
        ? "—"
        : r === "none"
          ? "Nothing sent"
          : r.kind === "sent"
            ? `${r.sent} sent · ${r.replied} replied`
            : `${r.written} written · ${r.wroteBack} wrote back`,
    sentOnce: {
      footer: (n: number): string => `Sent once · last 30 days · ${n}`,
      open: "Sent",
      state: "Sent",
      hint: (when: string | null): string => (when ? `Sent once · ${when}` : "Sent once"),
    },
    /** One word per act (decision 19): "Approve · 7 people" and "Skip", everywhere a waiting run is decided. */
    approve: (n: number): string => `Approve · ${plural(n, "person", "people")}`,
    skip: "Skip",
    resume: {
      label: "Resume",
      question: (name: string): string => `Resume ${name}?`,
      detail: (when: string, n: number): string => `Next run ${when}, about ${plural(n, "person", "people")}`,
      chain: "Its next emails go out on its next run.",
      /** Said in full where the campaign's class sends without asking (`auto`, decision 7), where the page knows the mode. */
      auto: "It sends on its own: nothing will wait for your approval.",
      yes: "Yes, resume it",
    },
    /** What the drawer's head calls a campaign whose group the page does not hold. */
    kicker: "Campaign",
  },
```

- [ ] **Step 5: The tiles hand the ledger the three readings it shares with Coming up**

`ct/playbooks/lifecycle/lifecycle-tiles.ts`: export `nextRunLine` (add `export` before `function nextRunLine`); add after `whoWill`'s doc block, before `whoWill`:

```ts
/** How many a running campaign's next run reaches: its cap's share, or everyone for an appointment moment, which has no cap. */
export function nextShare(p: Pick<LifecyclePlaybook, "trigger" | "candidates" | "cap_per_run">): number {
  const all = p.candidates ?? 0;
  const cap = triggerOf(p.trigger)?.kind === "visit" ? 0 : (p.cap_per_run ?? 0);
  return cap > 0 ? Math.min(all, cap) : all;
}
```

and in `whoWill`'s `"sends"` case replace `const next = cap > 0 ? Math.min(all, cap) : all;` with `const next = nextShare(p);`. Add after `offerOf`:

```ts
/** What a waiting run may offer where it is drawn, by the business's clock (offerOf): a ledger row reads it, as Coming up's line does. */
export function waitingOffer(
  r: LifecycleRun,
  input: Pick<LifecycleInput, "nowMs" | "tz">,
  at: { paused: boolean; known: boolean },
) {
  return offerOf(r, input.nowMs, input.tz, at);
}
```

- [ ] **Step 6: Write `ct/playbooks/lifecycle/lifecycle-ledger.ts`**

```ts
/**
 * Campaigns' ledger (spec 2026-10-09 §4.1; canvas A, "Ledger", picked 9 Oct 2026): every campaign of the workspace in
 * one list, grouped by the moment it stands on in the journey's order (journey.ts), then Lists & offers, Reach-outs and,
 * past the threshold, the one-off sends; each row with its last 30 days as the database counts them (campaign_series'
 * `sources`, a chain's own totals), its next run, and the one act its state asks. Pure: one builder per kind of row, the
 * order a sort asks (`ledgerOrder`) and the counts the status tabs say; every word is LIFECYCLE_WORDS.ledger's.
 *
 * A number not counted is "uncounted" ("—"), never a zero; one counted where nothing went is "none" ("Nothing sent").
 * The receptionist and the call's text are First contact's rows of their own kind (the glossary's Campaign) and are
 * never counted. The marks a campaign goes by are read here once, for its row and for its moment's card (lifecycle.ts).
 */
import type { ChannelsReady } from "../../broadcasts/reach-for";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS } from "../../consent/consent-channels";
import type { AppointmentWord } from "../../journey/appointment-word";
import type { JourneyStage } from "../../journey/journey";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import { CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf } from "../../reports/report-periods";
import { periodWords } from "../../reports/reports";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
import { clockNear } from "../../shared/clock";
import { plural } from "../../shared/words";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { bookingTemplate } from "../../templates/template-order";
import {
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead,
  type PlaybookMessage,
} from "../playbook-channels";
import { nextRunLabel } from "../playbook-schedule";
import { PLAYBOOK_DEFAULTS, triggerOf, triggerWords } from "../playbook-triggers";
import { nextRunLine, nextShare, waitingOffer } from "./lifecycle-tiles";
import type {
  LifecycleAct,
  LifecycleChannelMark,
  LifecycleGroup,
  LifecycleInput,
  LifecycleLedger,
  LifecycleNeeds,
  LifecyclePlaybook,
  LifecyclePlaybooks,
  LifecycleRow,
  LifecycleRowResults,
  LifecycleSource,
  LifecycleStage,
  LifecycleTileRead,
  LifecycleTone,
  LifecycleWaiting,
} from "./lifecycle-types";
import { LIFECYCLE_WORDS, lifecycleStateOf, tallyWords } from "./lifecycle-words";

/** Campaigns before the tools: under seven, no tool line, tabs, heads, phone strip or search (decision 15, a judgment). */
const LEDGER_TOOLS_AT = 7;

/** The orders a desk may sort the rows by: Next (waiting first, then soonest, paused last), Name, People now, Replied. */
export const LEDGER_SORTS = ["next", "name", "people", "replied"] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

/** The period every number of the ledger is over: "Last 30 days". */
// periodWords takes (days, until) since main's #1526; null is a window ending today ("Last 30 days").
const LEDGER_PERIOD = periodWords(fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD), null).now;
/** Sent: where the one-off sends and a run open. */
const SENT_ROUTE = "broadcasts";
/** Leads: where a reach-out begins, from a search's businesses (cmp/reach-out/door.tsx). */
const LEADS_ROUTE = "clients/leads";

/**
 * Whether the workspace can send on each channel, as the home has it: the playbooks surface's own reading, else the
 * broadcasts', else null (the marks then say a ticked channel is on, and the head says nothing of channels).
 */
export function readyOf(input: Pick<LifecycleInput, "playbooks" | "broadcasts">): ChannelsReady | null {
  return input.playbooks?.ready ?? input.broadcasts?.ready ?? null;
}
```

followed, verbatim from `lifecycle.ts`, by `playbookMessageOf`, `channelMarksOf` (now `export function channelMarksOf`) and `chainMarksOf` with their doc comments, and by `stagePlaybooks` and `tallyOf` (both exported, as Task 10 wrote them). Then:

```ts
/** A playbook's or a one-off's last 30 days, by its source in campaign_series. */
function sentResultsOf(id: string, report: LifecycleInput["report"]): LifecycleRowResults {
  if (!report) return "uncounted";
  const s = report.sources.find((x) => x.id === id);
  return s && s.sent > 0 ? { kind: "sent", sent: s.sent, replied: s.replied } : "none";
}

/** A reach-out's, by its root: past the report's twenty, absent is "none" only where every chain was counted. */
function chainResultsOf(rootId: string, chains: LifecycleInput["chains"]): LifecycleRowResults {
  if (!chains) return "uncounted";
  const c = chains.byRoot[rootId];
  if (!c) return chains.complete ? "none" : "uncounted";
  return c.written > 0 ? { kind: "written", written: c.written, wroteBack: c.wroteBack } : "none";
}

/** What a search matches: the parts, lower-cased. */
const rowSearchOf = (...parts: string[]): string => parts.join(" ").toLowerCase();

/** No next run to say: "—". */
const NO_NEXT = { words: LIFECYCLE_WORDS.ledger.dash, atMs: null };

/** What a campaign's row is drawn from beyond the campaign: the input, readiness, the word, and its group. */
interface RowAt {
  input: LifecycleInput;
  playbooks: LifecyclePlaybooks;
  ready: ChannelsReady | null;
  word: AppointmentWord;
  /** Its group's caption (a search matches it) and the unit its people are counted in. */
  caps: string;
  unit: string;
}

function rowStatusOf(p: LifecyclePlaybook): LifecycleRow["status"] {
  if (p.off) return "not_here";
  if (p.state !== "running") return "paused";
  return p.totals.waiting ? "waiting" : "on";
}

/** The line under a campaign's name: its list, its cadence, why it runs nothing here, else its moment's hint in the word. */
function rowHintOf(p: LifecyclePlaybook, word: AppointmentWord): string {
  if (p.trigger === "saved_list") return `On a list · ${p.triggerLabel}`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days, to a yes to offers`;
  if (p.off) return p.off;
  const t = triggerOf(p.trigger);
  return t ? triggerWords(t, word).hint : p.triggerLabel;
}

function rowNextOf(p: LifecyclePlaybook, status: LifecycleRow["status"], input: LifecycleInput): LifecycleRow["next"] {
  if (status === "waiting") return { words: LIFECYCLE_WORDS.coming.waiting, atMs: input.nowMs };
  if (status === "paused") return { words: lifecycleStateOf(p).words, atMs: null };
  if (status !== "on") return NO_NEXT;
  return { words: p.next, atMs: nextRunLine(p, input.nowMs, input.tz).atMs };
}

/** Its run waiting on the person, as its row approves or skips it in place (the verb's own reading, waitingRunOffer). */
function rowWaitingOf(p: LifecyclePlaybook, at: RowAt): LifecycleWaiting | null {
  const id = p.totals.waiting?.id;
  const run = id ? at.input.broadcasts?.rows.find((r) => r.id === id) : undefined;
  if (!run) return null;
  const offer = waitingOffer(run, at.input, { paused: readyOf(at.input)?.paused === true, known: true });
  if (offer.kind === "open") return null;
  return { runId: run.id, people: run.recipient_count, refusal: offer.kind === "skip" ? offer.why : null };
}

/**
 * Resume, asked in place: when its next run would be, to about how many, and, where its class sends without asking
 * (`auto`, GET playbooks' `modes`), that in full (decision 7). Unread, the mode is not guessed: when and how many alone.
 */
function resumeOf(p: LifecyclePlaybook, input: LifecycleInput): LifecycleAct {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const when = nextRunLabel(
    { ...p, state: "running" as const },
    input.tz,
    new Date(input.nowMs),
    readyOf(input)?.paused === true,
  );
  const cls = p.policy_class ?? triggerOf(p.trigger)?.cls ?? null;
  const auto = cls !== null && input.playbooks?.modes?.[cls] === "auto";
  const detail = W.detail(when, nextShare(p));
  return {
    kind: "resume",
    label: W.label,
    playbookId: p.id,
    ask: { question: W.question(p.name), detail: auto ? `${detail}. ${W.auto}` : detail },
  };
}

/** A campaign on a moment, on a list, or the month's offer. */
function playbookRow(p: LifecyclePlaybook, at: RowAt): LifecycleRow {
  const s = lifecycleStateOf(p);
  const status = rowStatusOf(p);
  const hint = rowHintOf(p, at.word);
  const archived = !!p.listArchived;
  const needs: LifecycleNeeds =
    purposeOfPlaybook(p.policy_class ?? triggerOf(p.trigger)?.cls ?? null) === "marketing" ? "offers" : "messages";
  return {
    id: p.id,
    kind: p.trigger === "saved_list" ? "list" : p.trigger === "everyone_monthly" ? "offer" : "playbook",
    name: p.name,
    hint,
    status,
    stateWords: archived ? LIFECYCLE_WORDS.ledger.archived : s.words,
    phoneWords: archived ? LIFECYCLE_WORDS.ledger.archived : s.short,
    tone: archived ? "warn" : s.tone,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    channels: channelMarksOf(p, at.playbooks.templates, at.ready),
    people: { n: p.named ? p.named.pool : null, unit: at.unit },
    results: sentResultsOf(p.id, at.input.report),
    next: rowNextOf(p, status, at.input),
    open: { kind: "open", label: "Open", playbookId: p.id },
    waiting: status === "waiting" ? rowWaitingOf(p, at) : null,
    act: status === "paused" && !archived ? resumeOf(p, at.input) : null,
    search: rowSearchOf(p.name, hint, at.caps),
  };
}

/** The receptionist: First contact's own row, never counted, opening nothing. */
function receptionistRow(stage: LifecycleStage): LifecycleRow {
  return {
    id: "receptionist",
    kind: "receptionist",
    name: stage.name,
    hint: stage.needsWords,
    status: stage.state === "always" ? "always" : "off",
    stateWords: stage.stateWords,
    phoneWords: stage.phoneWords,
    tone: stage.tone,
    needs: "none",
    needsWords: stage.needsWords,
    channels: [],
    people: { n: stage.people, unit: stage.unit },
    results: "uncounted",
    next: NO_NEXT,
    open: null,
    waiting: null,
    act: null,
    search: rowSearchOf(stage.name, stage.caps),
  };
}

/** The call's text: the message the phone agent texts a caller who asks to book, a door to the Library. Never counted. */
function callTextRow(library: LifecycleInput["library"], caps: string): LifecycleRow {
  const W = LIFECYCLE_WORDS.callText;
  const found = library ? bookingTemplate(library) : null;
  // Unread says nothing here: a library that could not be read is the page's failed read (failedOf), in this row's place.
  const [status, stateWords, tone]: [LifecycleRow["status"], string, LifecycleTone] = !library
    ? ["off", "", "plain"]
    : found
      ? ["always", W.on, "ok"]
      : ["off", W.none, "warn"];
  return {
    id: "call_text",
    kind: "call_text",
    name: W.name,
    hint: W.words,
    status,
    stateWords,
    phoneWords: stateWords,
    tone,
    needs: "none",
    needsWords: LIFECYCLE_WORDS.needs.none,
    channels: [],
    people: { n: null, unit: "" },
    results: "uncounted",
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: "messages" },
    waiting: null,
    act: null,
    search: rowSearchOf(W.name, W.words, caps),
  };
}

/** The month's offer where none is made and it is offered: a line that turns it on, not a campaign. */
function offOfferRow(caps: string): LifecycleRow {
  const name = LIFECYCLE_WORDS.monthsOffer.name;
  const hint = `Every ${PLAYBOOK_DEFAULTS.cadenceDays} days, to a yes to offers`;
  return {
    id: "everyone_monthly",
    kind: "offer",
    name,
    hint,
    status: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    needs: "offers",
    needsWords: LIFECYCLE_WORDS.needs.offers,
    channels: [],
    people: { n: null, unit: "people" },
    results: "uncounted",
    next: NO_NEXT,
    open: null,
    waiting: null,
    act: { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "everyone_monthly" },
    search: rowSearchOf(name, hint, caps),
  };
}

/** A reach-out: a chain of cold emails to a search's leads. It goes by email; its run is decided on its own page. */
function chainRow(c: ReachOutChainDto, at: { input: LifecycleInput; ready: ChannelsReady | null; caps: string }): LifecycleRow {
  const W = LIFECYCLE_WORDS.ledger;
  const paused = c.state !== "running";
  const waitingRun = paused ? null : c.next.waiting_run_id;
  const status: LifecycleRow["status"] = paused ? "paused" : waitingRun ? "waiting" : "on";
  const stateWords = paused ? "Paused" : waitingRun ? LIFECYCLE_WORDS.coming.waiting : "On";
  const hint = `Cold email${c.search ? ` to ${c.search.name}` : ""} · ${plural(c.steps.length, "step")}`;
  const resume: LifecycleAct = {
    kind: "resume",
    label: W.resume.label,
    playbookId: c.root_id,
    ask: { question: W.resume.question(c.name), detail: W.resume.chain },
  };
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    hint,
    status,
    stateWords,
    phoneWords: stateWords,
    tone: waitingRun ? "warn" : paused ? "plain" : "ok",
    needs: "none",
    needsWords: W.chainNeeds,
    channels: chainMarksOf(at.ready),
    people: { n: null, unit: W.businesses },
    results: chainResultsOf(c.root_id, at.input.chains),
    next: waitingRun
      ? { words: LIFECYCLE_WORDS.coming.waiting, atMs: at.input.nowMs }
      : paused
        ? { words: "Paused", atMs: null }
        : NO_NEXT,
    open: { kind: "open", label: "Open", playbookId: c.root_id },
    waiting: null,
    act: paused ? resume : waitingRun ? { kind: "route", label: W.openRun, route: `broadcasts/run:${waitingRun}` } : null,
    search: rowSearchOf(c.name, hint, at.caps),
  };
}

/** A one-off send of the period, or a run of a playbook since deleted: its run's door in Sent. */
function sentOnceRow(s: LifecycleSource, at: { input: LifecycleInput; caps: string }): LifecycleRow {
  const W = LIFECYCLE_WORDS.ledger.sentOnce;
  const hint = W.hint(s.lastAt ? clockNear(Date.parse(s.lastAt), at.input.tz, at.input.nowMs) : null);
  return {
    id: s.id,
    kind: "sent_once",
    name: s.name,
    hint,
    status: "off",
    stateWords: W.state,
    phoneWords: W.state,
    tone: "plain",
    needs: "none",
    needsWords: "",
    channels: [],
    people: { n: null, unit: "" },
    results: s.sent > 0 ? { kind: "sent", sent: s.sent, replied: s.replied } : "none",
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: `${SENT_ROUTE}/run:${s.id}` },
    waiting: null,
    act: null,
    search: rowSearchOf(s.name, hint, at.caps),
  };
}

/** A campaign, not one of First contact's own rows nor the month's offer before it is made. */
const isCampaign = (r: LifecycleRow): boolean =>
  r.kind !== "receptionist" && r.kind !== "call_text" && !(r.kind === "offer" && r.status === "off");

/** A group's line under its caption: how its campaigns stand, else what it says of itself. */
function metaOf(rows: readonly LifecycleRow[], otherwise: string): string {
  const campaigns = rows.filter(isCampaign);
  if (campaigns.length === 0) return otherwise;
  const t = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const r of campaigns) {
    if (r.status === "on" || r.status === "always") t.on += 1;
    else if (r.status === "waiting") t.waiting += 1;
    else if (r.status === "paused") t.paused += 1;
    else t.off += 1;
  }
  return tallyWords(campaigns.length, t);
}

/**
 * A moment's add: Turn on (the hinted one where it is the one), the calendar's door where the moment needs one; none on
 * First contact, on a moment that holds its one campaign (the follow-up, 00167), or on one not offered here.
 */
function journeyAddOf(def: JourneyStage, stage: LifecycleStage, held: number, playbooks: LifecyclePlaybooks): LifecycleAct | null {
  if (def.kind === "receptionist") return null;
  if (def.unmet) return { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  if (def.one && held > 0) return null;
  const moment = stage.moment;
  if (!moment || !playbooks.triggers.some((t) => t.id === moment && t.offered)) return null;
  return { kind: "turn_on", label: stage.state === "off" && stage.hint ? stage.hint : LIFECYCLE_WORDS.ledger.turnOn, moment };
}

/** What every group's rows share. */
type GroupAt = Omit<RowAt, "caps" | "unit">;

/** A moment of the journey: its lead first, then the rest as they came; First contact's own rows before its campaigns. */
function journeyGroup(def: JourneyStage, stage: LifecycleStage, at: GroupAt): LifecycleGroup {
  const own = stagePlaybooks(def, at.playbooks.rows);
  const lead = own.find((p) => p.id === stage.playbookId);
  const ordered = lead ? [lead, ...own.filter((p) => p !== lead)] : own;
  const each = { ...at, caps: def.caps, unit: def.unit };
  const rows = [
    ...(def.kind === "receptionist" ? [receptionistRow(stage), callTextRow(at.input.library, def.caps)] : []),
    ...ordered.map((p) => playbookRow(p, each)),
  ];
  return {
    id: def.id,
    caps: def.caps,
    glyph: def.glyph,
    meta: metaOf(rows, stage.stateWords),
    rows,
    add: journeyAddOf(def, stage, own.length, at.playbooks),
  };
}

/** Lists & offers: the month's offer, the campaigns on a list, and any other that stands on no moment. */
function listsGroup(at: GroupAt, onStage: ReadonlySet<string>): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.lists;
  const each = { ...at, caps, unit: "people" };
  const offered = (id: string) => at.playbooks.triggers.some((t) => t.id === id && t.offered);
  const offers = at.playbooks.rows.filter((p) => p.trigger === "everyone_monthly");
  const rest = at.playbooks.rows.filter((p) => p.trigger !== "everyone_monthly" && !onStage.has(p.id));
  const rows = [
    ...(offers.length === 0 && offered("everyone_monthly") ? [offOfferRow(caps)] : offers.map((p) => playbookRow(p, each))),
    ...rest.map((p) => playbookRow(p, each)),
  ];
  return {
    id: "lists",
    caps,
    glyph: "bolt",
    meta: metaOf(rows, LIFECYCLE_WORDS.ledger.none),
    rows,
    add: offered("saved_list") ? { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "saved_list" } : null,
  };
}

/** Reach-outs: each chain, and the door to Leads, where one begins. */
function reachOutGroup(at: GroupAt): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.reach_out;
  const rows = (at.input.reachOuts ?? []).map((c) => chainRow(c, { input: at.input, ready: at.ready, caps }));
  return {
    id: "reach_out",
    caps,
    glyph: "send",
    meta: metaOf(rows, LIFECYCLE_WORDS.ledger.none),
    rows,
    add: { kind: "route", label: LIFECYCLE_WORDS.ledger.findBusinesses, route: LEADS_ROUTE },
  };
}

/** The period's one-off sends, past the threshold: each opens its run. */
function sentOnceGroup(sources: readonly LifecycleSource[], input: LifecycleInput): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.sent_once;
  return {
    id: "sent_once",
    caps,
    glyph: "send",
    meta: `${plural(sources.length, "send")} · ${LEDGER_PERIOD.toLowerCase()}`,
    rows: sources.map((s) => sentOnceRow(s, { input, caps })),
    add: null,
  };
}

/** The status tabs' counts: campaigns only. Needs you is the one amber: a run waiting, or an archived list (decision 13). */
function countsOf(rows: readonly LifecycleRow[]): LifecycleLedger["counts"] {
  const campaigns = rows.filter(isCampaign);
  return {
    all: campaigns.length,
    running: campaigns.filter((r) => r.status === "on" || r.status === "waiting").length,
    needs: campaigns.filter((r) => r.tone === "warn").length,
    paused: campaigns.filter((r) => r.status === "paused").length,
  };
}

/** The whole ledger, from the home's input (the playbooks as the home reads them) and the journey's stages, drawn. */
export function lifecycleLedger(at: {
  input: LifecycleInput;
  defs: readonly JourneyStage[];
  stages: readonly LifecycleStage[];
}): LifecycleLedger {
  const { input, defs, stages } = at;
  const results: LifecycleTileRead = input.report === undefined ? "reading" : input.report === null ? "failed" : "read";
  const said = { period: LEDGER_PERIOD, results, words: LIFECYCLE_WORDS.ledger };
  if (!input.playbooks || !input.shape)
    return { groups: [], counts: { all: 0, running: 0, needs: 0, paused: 0 }, tools: false, sentOnce: null, ...said };
  const from: GroupAt = { input, playbooks: input.playbooks, ready: readyOf(input), word: input.shape.word };
  const journey = defs.flatMap((def) => {
    const stage = stages.find((s) => s.id === def.id);
    return stage ? [journeyGroup(def, stage, from)] : [];
  });
  const onStage = new Set(journey.flatMap((g) => g.rows.map((r) => r.id)));
  const groups = [...journey, listsGroup(from, onStage), reachOutGroup(from)];
  const tools = countsOf(groups.flatMap((g) => g.rows)).all >= LEDGER_TOOLS_AT;
  const once = (input.report?.sources ?? []).filter((s) => s.kind === "broadcast");
  const every = tools && once.length > 0 ? [...groups, sentOnceGroup(once, input)] : groups;
  return {
    groups: every,
    counts: countsOf(every.flatMap((g) => g.rows)),
    tools,
    sentOnce:
      !tools && once.length > 0
        ? { n: once.length, open: { kind: "route", label: LIFECYCLE_WORDS.ledger.sentOnce.open, route: SENT_ROUTE } }
        : null,
    ...said,
  };
}

/** Where a status sorts under Next: a run waiting first, then what runs, then what does not, paused last. */
const NEXT_RANK: Record<LifecycleRow["status"], number> = {
  waiting: 0,
  on: 1,
  always: 2,
  off: 2,
  not_here: 2,
  paused: 3,
};

/** A row's replies, or a chain's wrote back, to sort by: nothing sent is 0, not counted last. */
function repliedOf(r: LifecycleRow): number {
  if (r.results === "uncounted") return -1;
  if (r.results === "none") return 0;
  return r.results.kind === "sent" ? r.results.replied : r.results.wroteBack;
}

/** How a desk sorts the rows (decision 8): ties by name. */
export function ledgerOrder(by: LedgerSort): (a: LifecycleRow, b: LifecycleRow) => number {
  const byName = (a: LifecycleRow, b: LifecycleRow) => a.name.localeCompare(b.name);
  if (by === "name") return byName;
  if (by === "people") return (a, b) => (b.people.n ?? -1) - (a.people.n ?? -1) || byName(a, b);
  if (by === "replied") return (a, b) => repliedOf(b) - repliedOf(a) || byName(a, b);
  const at = (r: LifecycleRow) => r.next.atMs ?? Number.MAX_SAFE_INTEGER;
  return (a, b) => NEXT_RANK[a.status] - NEXT_RANK[b.status] || at(a) - at(b) || byName(a, b);
}
```

```bash
git add -N packages/contracts/src/playbooks/lifecycle/lifecycle-ledger.ts
```

- [ ] **Step 7: `lifecycle.ts` draws the ledger instead of the strips**

In `ct/playbooks/lifecycle/lifecycle.ts`: delete `readyOf`, `playbookMessageOf`, `channelMarksOf`, `chainMarksOf`, `stagePlaybooks`, `tallyOf` (they live in `lifecycle-ledger.ts` now), and `stripOfPlaybook`, `callTextStrip`, `monthsOfferStrip`, `chainStrip`, `lifecycleStrips`. Add:

```ts
import { channelMarksOf, lifecycleLedger, readyOf, stagePlaybooks, tallyOf } from "./lifecycle-ledger";
```

and drop the imports nothing uses any more (`VERSION_CHANNEL_WORDS`, `bookingTemplate`, `plural` if unused, the `../playbook-channels` import, `LifecycleStrip`, `LifecycleTone`, `LifecycleChannelMark`, `LifecycleGlyph` where unused; `corepack pnpm lint` names any left). In `campaignsHomeOf` replace `strips: lifecycleStrips(at, stages),` with:

```ts
    ledger: lifecycleLedger({ input: at, defs, stages }),
```

and replace `lifecycleKicker` with:

```ts
/** What the drawer calls a campaign: its moment's caption where it leads one, else its group's ("Lists & offers"), else a campaign. */
export function lifecycleKicker(home: LifecycleHome, id: string): string {
  const stage = home.rail.stages.find((s) => s.playbookId === id);
  if (stage) return stage.caps;
  const group = home.ledger.groups.find((g) => g.rows.some((r) => r.id === id));
  return group ? group.caps : LIFECYCLE_WORDS.ledger.kicker;
}
```

Update the header's first paragraph: "…each covered or not, with every campaign in a ledger under it (lifecycle-ledger.ts)…".

`ct/playbooks/index.ts`: in the `export type { … } from "./lifecycle/lifecycle-types";` list remove `LifecycleStrip` and add `LedgerWords`, `LifecycleBar`, `LifecycleGroup`, `LifecycleLedger`, `LifecycleRow`, `LifecycleRowResults`; add the lines

```ts
export { LEDGER_SORTS, ledgerOrder } from "./lifecycle/lifecycle-ledger";
export type { LedgerSort } from "./lifecycle/lifecycle-ledger";
```

- [ ] **Step 8: The page keeps its lines under the rail through a bridge, until lane 3 draws the ledger**

`home/rail.tsx`: change the type import to

```ts
import type {
  LifecycleAct,
  LifecycleChannelMark,
  LifecycleFailed,
  LifecycleGlyph,
  LifecycleHome,
  LifecycleRow,
  LifecycleStage,
  LifecycleTone,
} from "@chanlytics/contracts";
```

and add, before `StripLine`:

```tsx
/**
 * A line under the rail, until the ledger draws every campaign (lane 3 of the 9 Oct 2026 plan replaces these lines and
 * their styles): a ledger row that is no moment's lead, in the strips' markup and words.
 */
interface AlsoLine {
  id: string;
  kind: "call_text" | "moment" | "list" | "reach_out";
  glyph: LifecycleGlyph;
  name: string;
  words: string;
  stateWords: string;
  tone: LifecycleTone;
  open: LifecycleAct;
  act: LifecycleAct;
  channels: readonly LifecycleChannelMark[];
}

/** The kind of line a ledger row was among the strips. */
function alsoKind(kind: LifecycleRow["kind"]): AlsoLine["kind"] | null {
  if (kind === "call_text") return "call_text";
  if (kind === "list") return "list";
  if (kind === "chain") return "reach_out";
  return kind === "playbook" || kind === "offer" ? "moment" : null;
}

/** The ledger's rows that lead no moment: the call's text, a moment's other campaigns, the offers and lists, the reach-outs. */
function alsoLines(home: LifecycleHome): AlsoLine[] {
  const leads = new Set(home.rail.stages.flatMap((s) => (s.playbookId ? [s.playbookId] : [])));
  return home.ledger.groups.flatMap((g) =>
    g.rows.flatMap((r) => {
      const kind = alsoKind(r.kind);
      const open = r.open ?? r.act;
      if (!kind || !open || leads.has(r.id)) return [];
      // A line's act was Resume, Turn on or its door; a chain's waiting run is opened from its door, as it was.
      const act = r.act && r.act.kind !== "route" ? r.act : open;
      const line: AlsoLine = {
        id: r.id,
        kind,
        glyph: g.glyph,
        name: r.name,
        words: r.hint,
        stateWords: r.stateWords,
        tone: r.tone,
        open,
        act,
        channels: r.channels,
      };
      return [line];
    }),
  );
}
```

Change `StripLine`'s prop type from `LifecycleStrip` to `AlsoLine`, `StripLines`' `strips: readonly LifecycleStrip[]` to `strips: readonly AlsoLine[]`, and in both `Rail` and the phone's rail replace `const { rail, strips } = home;` with `const { rail } = home;` and `const strips = alsoLines(home);`. Replace `aria-label={LIFECYCLE_WORDS.alsoRunning}` with `aria-label={LIFECYCLE_WORDS.phone.also}`.

`home/home-page.tsx` `nameOf`: replace `home.strips.find((s) => s.id === id)?.name ??` with `home.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.name ??`.

- [ ] **Step 9: Build, run the ledger, move the contracts tests off the strips, run the page tests**

```bash
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter @chanlytics/contracts build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/ledger.test.mjs
```

Expected: `# pass 12`, `# fail 0`.

Then move the contracts tests that read `strips`:
- `tests/playbooks/home/lifecycle.test.mjs`: delete the section headed `/* the strips */` (its `strip` helper and every test that reads `h.strips`): `ledger.test.mjs` proves those rows now. A test there that asserts a kicker takes the group's words ("Lists & offers", "Reach-outs", "Campaign").
- `tests/playbooks/home/channels-on-the-home.test.mjs`: each `h.strips.find((s) => s.id === X)` becomes `h.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === X)`; the marks it reads (`.channels`) are the row's, the same reading.
- `tests/playbooks/home/moments-offered.test.mjs:155`: `...home.strips.map((s) => s.act)` becomes `...home.ledger.groups.flatMap((g) => [g.add, ...g.rows.map((r) => r.act)]).filter(Boolean)`; `:208`: `welcome.strips.filter((l) => l.id.startsWith("pb-")).map((l) => [l.id, l.name, l.act.kind])` becomes `welcome.ledger.groups.flatMap((g) => g.rows).filter((r) => r.id.startsWith("pb-")).map((r) => [r.id, r.name, (r.act ?? r.open).kind])`.

```bash
for f in playbooks/home/lifecycle playbooks/home/channels-on-the-home playbooks/home/moments-offered playbooks/home/campaigns-home playbooks/playbook-composer reach-out-sheet/reach-out-rows playbooks/runs-honest reports/reports-honest journey/journey shipping/browser-entry repo/contracts-barrels repo/code-health-ratchets; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -3; done
corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/dashboard typecheck
corepack pnpm lint
node tooling/scripts/checks/dead-exports.mjs
```

The page tests (`campaigns-home`, `playbook-composer:492`, `reach-out-rows:364-413`) read the strips' markup, which the bridge keeps: they pass, but for the order of the lines (a moment's other campaign now comes before the lists, in the journey's order) — where one fails on order alone, sort both sides by `data-strip` before comparing; anything else: stop and report. `dead-exports` reports the removed `LifecycleStrip` and anything else that fell: bank it with `node tooling/scripts/checks/dead-exports.mjs --update`. If it reports a new dead export, it is a value only lane 3 will import: report it rather than raising.

- [ ] **Step 10: Commit**

```bash
corepack pnpm exec prettier --write packages/contracts/src/playbooks apps/dashboard/src/surfaces/campaigns/home tooling/scripts/tests/playbooks
git status --short
git add packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist apps/dashboard/src/surfaces/campaigns/home/rail.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx tooling/scripts/tests/playbooks/home tooling/scripts/tests/baselines/dead-exports.json
git commit -m "Every campaign stands in one ledger, grouped by its moment, counted, sortable, with its last 30 days and its one act

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add by name each other test file Step 9 changed.

---

### Task 12: One word, held: the scan over every string of the view models, and a ratchet that may only fall (spec §4.8 "Held by tests"; correction 44)

**Files:**
- Modify: `tooling/scripts/tests/_source.mjs` (gains the reader scope, its walk and `readerLines`), `tooling/scripts/tests/repo/trade-neutral.test.mjs` (reads them from there)
- Modify: `tests/journey/journey.test.mjs` (the scan; the ratchet)
- Create: `tests/baselines/appointment-words.json` (seeded by the ratchet)
- Modify: `docs/debt.md` (a row for the baseline)
- Test: `tests/journey/journey.test.mjs`, `tests/repo/trade-neutral.test.mjs`, `tests/repo/debt-register.test.mjs`, `tests/repo/source-scan-ratchet.test.mjs`

The ratchet counts, per file in the trade-neutral scan's trees, the quoted strings a reader reads that contain a space and the whole word visit, visits or visited (so ids like `"visit_tomorrow"` and `"visit"` are not words), skipping comments, member accesses and lines marked `trade-word:` (the one in `appointment-word.ts`). It may only fall: lane 3 and the sweep lane bank theirs. Importing `readerLines` from `trade-neutral.test.mjs` would register that file's tests inside this one, so the scope, the walk and `readerLines` move to `_source.mjs`, the root helper both read (no new module at the tests' root, which is at 20).

- [ ] **Step 1: Move the scan's scope, walk and reader lines to `_source.mjs`**

Append to `tooling/scripts/tests/_source.mjs` (it already imports `fs`, `path`, `fileURLToPath` and `pathToFileURL`; add any it lacks):

```js
/**
 * The trees whose words reach a person: a page, a prompt, a message, a refusal. The trade-neutral scan reads them
 * (repo/trade-neutral.test.mjs), and so does the appointment words' ratchet (journey/journey.test.mjs).
 */
export const READER_SCOPE = [
  "packages/contracts/src",
  "packages/channels/src",
  "packages/jobs/src",
  "apps/dashboard/src/server",
  "apps/dashboard/src/legacy-bridge",
  // A surface that has left the shell (decision 0015) is TSX here, and the words a page draws are scanned where its JSX
  // was: the sample a demo session draws (sample.ts) is scanned with them. The Inbox's own sample, which still says a salon's
  // words as its mockup's twin did, is not yet (its surface's lane).
  "apps/dashboard/src/surfaces/campaigns",
  "apps/dashboard/src/surfaces/live",
  "apps/dashboard/src/legacy/pages",
  "apps/dashboard/src/legacy/demo/pages",
  "apps/dashboard/src/legacy/components",
  "apps/edge/lib",
  "apps/edge/api",
];

const READER_EXT = [".ts", ".tsx", ".jsx", ".js"];

function* readerWalk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "dist") yield* readerWalk(p);
    } else if (READER_EXT.some((e) => name.endsWith(e)) && !name.endsWith(".d.ts") && !name.includes(".test.")) yield p;
  }
}

/** Every source file in the reader scope, by its absolute path: no tests, no declarations, nothing built or installed. */
export function* readerFiles() {
  for (const dir of READER_SCOPE) yield* readerWalk(path.join(ROOT, dir));
}

/** Lines that reach a reader: no comments, no member accesses, no `trade-word:` exemptions. */
export function readerLines(src) {
  const out = [];
  let inBlock = false;
  src.split(/\r?\n/).forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // Block comments that open on this line: drop what they cover.
    for (;;) {
      const start = line.indexOf("/*");
      if (start === -1) break;
      const end = line.indexOf("*/", start + 2);
      if (end === -1) {
        line = line.slice(0, start);
        inBlock = true;
        break;
      }
      line = line.slice(0, start) + line.slice(end + 2);
    }
    if (/trade-word:/.test(raw)) return;
    line = line.replace(/(^|\s)\/\/.*$/, "$1");
    line = line.replace(/\.\w+/g, "");
    if (line.trim()) out.push({ n: i + 1, text: line });
  });
  return out;
}
```

In `tooling/scripts/tests/repo/trade-neutral.test.mjs`: delete its `SCOPE`, `EXT`, `walk` and `readerLines` (keep `ALLOWED`, `BANNED` and both tests), import `{ ROOT as REPO, readerFiles, readerLines } from "../_source.mjs"`, and make its first test's loops:

```js
  for (const file of readerFiles()) {
    const rel = relative(REPO, file).split(sep).join("/");
    if (ALLOWED.has(rel)) continue;
    const src = readFileSync(file, "utf8");
    for (const { n, text } of readerLines(src)) {
      const m = BANNED.exec(text);
      if (m) hits.push(`${rel}:${n}: “${m[0]}” — ${text.trim().slice(0, 110)}`);
    }
  }
```

(drop its own `ROOT` constant and the `readdirSync`, `statSync`, `join` and `fileURLToPath` imports it no longer uses).

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs
```

Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 2: Write the scan and the ratchet (failing: the baseline is missing)**

Append to `tooling/scripts/tests/journey/journey.test.mjs` (add `import { readFileSync } from "node:fs";`, `import { relative, sep } from "node:path";`, `import { ratchet } from "../_ratchet.mjs";` and `import { ROOT, readerFiles, readerLines } from "../_source.mjs";` to its imports):

```js
/* ------------------------------------------- one page, one word ------------------------------------------- */

const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

/** Every string in a value, at any depth: what a view model says. The words' builders are functions, not strings. */
function stringsOf(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) stringsOf(v, out);
  return out;
}
/** A word's forms as a sentence writes them: the noun, its plural, and visit's verb. */
const formsOf = (w) => new RegExp(`\\b${w}(s|ed)?\\b`, "i");

/** Campaigns made on every moment, named in no word, so whatever the page says of an appointment is its own sentence. */
const card = (id, name, trigger, over = {}) => ({
  id,
  name,
  trigger,
  state: "running",
  run_hour: 10,
  cadence_days: 30,
  cap_per_run: 25,
  last_run_for: "2026-09-14",
  next: "tomorrow 10:00 AM",
  triggerLabel: name,
  candidates: 2,
  held: 1,
  named: { pool: 4, saidYes: 2 },
  off: null,
  totals: { waiting: null },
  ...over,
});
const MADE = [
  card("pb-b", "Reminder", "visit_tomorrow", { totals: { waiting: { id: "r-1", recipient_count: 3 } } }),
  card("pb-a", "Check-in", "visited", { state: "paused", next: "paused" }),
  card("pb-q", "Come back", "quiet_30"),
  card("pb-f", "Follow-up", "proposal_waiting"),
];
const homeFor = (shape, word, rows) => {
  const pools = Object.fromEntries(
    ["new_week", "visit_tomorrow", "visited", "quiet_30", "lapsed", "proposal_waiting"].map((k) => [
      k,
      { candidates: 3, held: 0, pool: 4, saidYes: 3 },
    ]),
  );
  const triggers = C.MOMENT_TRIGGERS.filter((t) => C.triggerOffered(t, shape.dealsOn)).map((t) => ({
    id: t.id,
    offered: C.momentOffered(t, shape),
    candidates: 3,
    named: null,
  }));
  return C.campaignsHomeOf({
    nowMs: NOW,
    tz: ZONE,
    playbooks: { rows, pools, triggers, timezone: ZONE, countsRead: true },
    broadcasts: {
      rows: [
        {
          id: "r-1",
          name: "Reminder · Oct 3",
          state: "pending_approval",
          when: "tomorrow 10:00 AM",
          scheduled_for: "2026-10-03T14:00:00Z",
          started_at: null,
          finished_at: null,
          recipient_count: 3,
          playbook_id: "pb-b",
          counts: { sent: 0, replied: 0 },
          run_for: "2026-10-03",
        },
      ],
      number: { present: true },
      optIn: { phrase: "YES OFFERS", link: null },
      reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 4 },
    },
    library: [],
    messages: [],
    reachOuts: [],
    report: { days: 30, totals: { sent: 0, delivered: 0, read: 0, replied: 0, optIns: 0, optOuts: 0 }, sources: [] },
    shape: { calendar: shape.calendarOn ? "feed" : "none", dealsOn: shape.dealsOn, word },
    chains: undefined,
  });
};
/** What the drawer, a card, the composer's moments, the win-back's refusals and the approval sheet say in a word. */
const sentencesOf = (word) => {
  const W = C.appointmentWords(word);
  const clock = { run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  const approval = (trigger) =>
    C.toApprovalVM(
      {
        broadcast: { recipient_count: 3, playbook_id: "pb-b", run_for: "2026-10-03", params: [{ kind: "first_name" }] },
        recipients: [{ contact_id: "c1", name: "Priya Nair", first_name: "Priya", state: "queued" }],
      },
      {
        playbook: { trigger, ...clock, word },
        businessName: "Harbor",
        today: "2026-10-02",
        open: { time: "10:00", moved: false, on: "2026-10-03" },
        day: (d) => d,
        paused: false,
      },
    );
  return [
    ...stringsOf(W),
    W.offTomorrow(1),
    W.offTomorrow(3),
    W.offYesterday(2),
    ...["visit_tomorrow", "visited"].flatMap((t) => [C.scheduleLine({ ...clock, trigger: t }, word), C.poolWords(t, word)]),
    ...C.PLAYBOOK_TRIGGERS.flatMap((t) => Object.values(C.triggerWords(t, word))),
    ...Object.values(C.winBackWords(word)),
    ...["visit_tomorrow", "visited"].flatMap((t) => stringsOf(approval(t))),
  ];
};

test("one page, one word: for 4 shapes × 5 words, every string Campaigns' view models say holds its word and no other", () => {
  for (const shape of SHAPES)
    for (const word of C.APPOINTMENT_WORDS) {
      const said = [
        ...stringsOf(homeFor(shape, word, MADE)),
        ...stringsOf(homeFor(shape, word, [])),
        ...sentencesOf(word),
      ];
      assert.ok(
        said.some((s) => formsOf(word).test(s)),
        `${JSON.stringify(shape)}: ${word} is said`,
      );
      for (const other of C.APPOINTMENT_WORDS.filter((w) => w !== word)) {
        const bad = said.filter((s) => formsOf(other).test(s));
        assert.deepEqual(bad, [], `${JSON.stringify(shape)}, ${word}: says ${other}`);
      }
    }
});

/* ------------------------------------- the words not yet the word's ------------------------------------- */

/** A quoted string a reader reads: its content is the second group. */
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const VISIT_WORD = /\bvisit(?:s|ed)?\b/i;

/**
 * Per file in the reader scope, the quoted strings a reader reads that hold a space and the whole word visit (ids like
 * "visit_tomorrow" hold neither), comments, member accesses and `trade-word:` lines left out (readerLines). It may only
 * fall: each sweep banks its file, and when it reaches zero "visit" joins trade-neutral's banned words.
 */
function appointmentWordsWrittenIn() {
  const out = {};
  for (const file of readerFiles()) {
    let n = 0;
    for (const { text } of readerLines(readFileSync(file, "utf8")))
      for (const m of text.matchAll(QUOTED)) if (/\s/.test(m[2]) && VISIT_WORD.test(m[2])) n += 1;
    if (n > 0) out[relative(ROOT, file).split(sep).join("/")] = n;
  }
  return out;
}

ratchet({
  name: "appointment words written in",
  file: "appointment-words.json",
  measure: appointmentWordsWrittenIn,
  advice:
    'A sentence a person reads says the workspace\'s appointment word (contracts appointmentWords), or none: never "visit" written in.',
});
```

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
```

Expected: the scan passes; the ratchet's two tests FAIL with "tooling/scripts/tests/baselines/appointment-words.json is missing — seed it".

- [ ] **Step 3: Seed the baseline, and register it**

```bash
UPDATE_BASELINES=raise node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
git add -N tooling/scripts/tests/baselines/appointment-words.json
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
```

Expected: the file exists, keyed by repo path (`apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx`, `packages/contracts/src/people/…` and the rest of the sweep's); the second run `# fail 0`. Open it and check that no file of Tasks 5–11 is in it but for a string that is not an appointment moment's sentence (a stored name in a sample, a trade's own check chip); if one is, fix the sentence, then re-seed.

Add a row to `docs/debt.md`'s table under `## What is measured`, after the `Primitives outside the kit` row:

```markdown
| Appointment words written in: the quoted strings a person reads that say "visit" (with a space, so the ids `visit_tomorrow` and `visit` are not words), per file, in the trade-neutral scan's trees | `baselines/appointment-words.json` | Empty: every sentence says the workspace's appointment word (contracts `appointmentWords`) or none, and "visit" joins `trade-neutral.test.mjs`'s banned words with `trade-word:` exemptions | The ledger's page lane banks the drawer's and the composer's; the sweep lane banks People's rows and lists, Setup, Today and the prompts, a file at a time |
```

```bash
corepack pnpm exec prettier --write docs/debt.md tooling/scripts/tests/_source.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/source-scan-ratchet.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs
```

Expected: `# fail 0` each. If `source-scan-ratchet` counts the new reads (it counts `readCode`/`readRaw` calls and helpers that read a source path; `readFileSync(file)` over a walked path is neither), report the count rather than raising.

- [ ] **Step 4: Commit**

```bash
git add tooling/scripts/tests/_source.mjs tooling/scripts/tests/repo/trade-neutral.test.mjs tooling/scripts/tests/journey/journey.test.mjs tooling/scripts/tests/baselines/appointment-words.json docs/debt.md
git commit -m "One page says one appointment word, held by a scan of every string Campaigns says and a count of the words not yet its own

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The lane, verified end to end, without the whole suite

**Files:** none new; this task runs checks and fixes only what they name.

- [ ] **Step 1: Build every package, typecheck, lint, format**

```bash
corepack pnpm --filter "./packages/*" build
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm exec prettier --check packages apps tooling docs
git status --short
```

Expected: builds and typecheck exit 0; lint reports no new warning (a fall is banked with `corepack pnpm lint -- --update`); prettier clean; `git status` shows no `dist` drift (if it does, the dist belongs to the task that changed its package: commit it now with "The packages' built dist follows lane 2's sources").

- [ ] **Step 2: The generated files are fresh**

```bash
node tooling/scripts/gen/route-types.mjs --check
node tooling/scripts/gen/contracts-browser-entry.mjs --check
corepack pnpm check:dead-exports
```

Expected: exit 0 each (a dead-exports fall: `-- --update`, committed).

- [ ] **Step 3: Run every test file this lane touched or that pins what it changed, one per command**

```bash
for f in journey/journey playbooks/home/ledger playbooks/home/lifecycle playbooks/home/channels-on-the-home playbooks/home/moments-offered playbooks/home/campaigns-home playbooks/approval-sheet playbooks/playbooks playbooks/visit-playbooks playbooks/playbook-composer playbooks/runs-honest playbooks/campaigns-drafts playbooks/outbound-routes playbooks/core-run-playbook broadcasts/core-campaigns broadcasts/core-broadcast broadcasts/campaigns-samples broadcasts/broadcasts-honest broadcasts/ask-campaign-channels broadcasts/run-report templates/message-versions templates/message-versions-page templates/template-versions-meta calendar/calendar-counts reach-out-sheet/reach-out-routes reach-out-sheet/reach-out-rows reach-out-back/back-routes reach-out-back/report-words reports/periods/report-periods reports/reports-honest reports/headline/on-demand-boot reports/headline/headline-boot ask/readers ask/ask-context ask/ask-tool-names ask/ask-turn shell/surfaces/route-prefetch shell/surfaces/message-fan-out shell/surfaces/refresh-coverage shell/surfaces/surface-registry shell/surfaces/surface-boot shell/surfaces/one-clock receptionist/business-tab/business-tab-zone today/today-day today/today-page routes/wire-casing repo/contracts-barrels repo/lint-boundaries repo/debt-register repo/code-health-ratchets repo/trade-neutral repo/source-scan-ratchet docs/docs-tree docs/docs-paths shipping/browser-entry; do echo "== $f"; node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs | tail -2; done
```

Expected: every file `# fail 0`. A failure here is fixed in a commit of its own, its message saying what it held.

- [ ] **Step 4: Report**

Report to the controller: each task's commit, the `# pass` counts of `journey.test.mjs` and `ledger.test.mjs`, the contents' size of `appointment-words.json` (files and total), and every place the code differed from this plan.

---

## Spec coverage (lane 2's part)

| Spec | Where |
| --- | --- |
| §4.1 files: the move alone, no barrel, `lifecycle-ledger.ts`, `ct/journey/` | Tasks 1, 3, 11 |
| §4.1 glossary first | Task 2 |
| §4.1 `LifecycleLedger` / `LifecycleGroup` / `LifecycleRow` exactly; builders, sort key, counts; `strips` and kickers gone; `lifecycleKicker` reads the groups | Task 11 |
| §4.1 `LifecycleStage.playbookId` the lead, `summary`, `bar`; covered = on and countable | Task 10 |
| §4.1 `LifecyclePlaybook` `candidates`/`named`/`next`; `LifecycleReport` with `sources`; `LifecycleInput` `chains`, `shape` | Tasks 4, 8, 9 (see Open points: the three playbook fields exist already) |
| §4.1 words: `LIFECYCLE_WORDS.ledger`, `LIFECYCLE_TOAST.paused`, paused plain, `CAMPAIGNS_RESULTS_PERIOD` in the prefetch, the surface and `RESULTS_DAYS` | Tasks 4, 8, 10, 11 |
| §4.5 `campaign_results` on demand, each failure alone; broadcasts drops its report; `ROUTE_DRAWS.campaigns`; `PREFETCH_READS`; the prefetch test | Task 8 |
| §4.5 readers `reachOutChains`, `reachOutReport` with `chains`; both GETs and Ask through them, held by tests | Tasks 4, 6 |
| §4.5 the results surface re-read 800 ms on Campaigns; broadcasts hears messages on Sent alone | Task 8 |
| §4.8 J1 `appointment-word.ts`; J2 `journey.ts`, Proposal before Quiet, word-free ids | Task 3 |
| §4.8 one page, one word: rail, drawer, approval sheet, composer, Coming up, Sent, core's three refusals; "After a visit"/"After the visit" one; names by the word through core's ports | Tasks 5, 7, 10 |
| §4.8 Needs your calendar: `momentOffered`, `refuseMoment`, never covered, "Not running here" | Tasks 5, 10, 11 |
| §4.8 the shape reaches the page: `businessShape` feeds GET playbooks and Ask; PATCH workspaces refreshes Campaigns | Tasks 6, 7, 9 |
| §4.8 held by tests: `journey.test.mjs` 4 × 5; `appointment-words.json` may only fall; moved pins in `lifecycle.test.mjs` | Tasks 3, 7, 10, 12 |

## Open points (spec against code, and what needs Ruben's word)

1. **Glossary rows go in `docs/glossary.md`, not `docs/naming.md`.** The spec and the brief say `docs/naming.md`; that page is the grammar and sends every new sense to the glossary's words table (`docs/naming.md:10-12`). Task 2 follows the code's rule.
2. **`LifecyclePlaybook` already has `candidates`, `named` and `next`** at `d1bb65961` (`lifecycle-types.ts:51-56`); the spec's "gains" needs no change. The row's `next` adds the sort moment (`atMs`) from Coming up's own rule.
3. **`LifecycleInput` also gains `report`** (the spec names `chains` and `shape`): the 30-day report leaves the broadcasts surface (§4.5), so the view model must take it from the new surface. Named beside `chains`.
4. **Coming up keeps its lines' `waiting` in this lane.** D14 moves Approve and Skip to the row, and the row carries them (`LifecycleRow.waiting`); the page still draws Coming up's (`home/tiles.tsx:213-280`, pinned by `campaigns-home.test.mjs` and `e2e/campaigns/playbooks.spec.ts`), so nulling them here would leave the desk without Approve until lane 3. Lane 3 stops drawing them there, or sets `runRow`'s `waiting` to `null` in `lifecycle-tiles.ts` in the commit that draws them on rows.
5. **A bridge in `home/rail.tsx`** (`alsoLines`) keeps the lines under the rail drawing from the ledger's non-lead rows, in the strips' markup, so lane 2's commits keep the page and its tests green. Lane 3 deletes it with `.cmh-strip*`.
6. **Resume's `auto` sentence reads the class's mode from GET playbooks' `modes`** (reconciled 9 Oct): Settings left Campaigns' draws, so GET playbooks reads the autonomy matrix once (`readers/facts.ts` `policies`, the reader Ask's `campaigns.playbooks` already loads; one `policies.select`), the playbooks surface carries `modes`, and `resumeOf` ends the question's `detail` with `LIFECYCLE_WORDS.ledger.resume.auto` where the campaign's class is `auto` (Tasks 6, 9, 11). No other page reads it.
7. **Ask reads the reach-outs' report through `reachOutReport` (its `report` tool); the chains' rows (`reachOutChains`) reach Ask with lane 4's Campaigns line,** to keep this lane's change to Ask's frozen answers to one adjuster.
8. **"…feed" needs a fact the spec's shape lacks:** whether bookings arrive by a tool's email. `LifecycleShape.calendar` is `"feed" | "email" | "none"` (three keys kept), fed by `bookings_by_email` on GET playbooks from `businessShape`.
9. **Word-free sentences instead of per-word ones** (Task 7 Step 4: the message-moment refusals, the slot labels and hints, a custom message's refusal, New message's line, Sent's run-stop line, the nobody-said-yes line; and two of core's three refusals, `template-values.ts:60, 76`, Task 5): each mentioned "visit" in passing, and `templateValues` is shared with the broadcast verb, whose ports know no word. Saying no word keeps one word on the page and the send path (`core/messages/broadcast-words.ts` reads `playbookRunNext`) untouched. The third refusal (`check-playbook.ts`, "Pick what starts it") says the word through the new port. Ruben may prefer the word in the others.
10. **The call's text keeps today's lookup** (reconciled 9 Oct). Today it is `bookingTemplate` over Settings' `templatesAll`, every WhatsApp row (`home/use-home.ts:72`), as the edge picks the text it sends after a call (`apps/edge/lib/voice/call-booking-link.ts:274` over `templatesToSend`, which does not filter `hidden_at`: `packages/db/src/repositories/templates.ts:99-107`). The bare `GET templates` leaves hidden rows out (`srv/readers/templates.ts:73-75`), so a workspace that hid its call's text from the composers would have read "No message for it yet" while the phone agent still texts it. GET templates now names the row it finds (`booking`, Task 9), and the playbooks surface's `library` is that row. A row awaiting Meta was never found (`bookingTemplate` takes approved rows alone), so nothing else changes.
11. **The appointment-words ratchet is seeded with `UPDATE_BASELINES=raise`,** as a new ratchet is ("is missing — seed it"); it is a new measure with its register row, not a rise of an old number, so no "Rises" row.
12. **Lane 1's shape (committed, `5bddf02a7` + `8a3a2d992`):** `reachOutChainTotals(db, tenantId, days): Promise<CountsByKey | "missing">`, throwing on any other failure (Task 6's reader catches it and logs `reach_out_chain_totals_read_failed`), and its answer's keys `written`, `wrote_back`, `last_at` by root. Adapt `chainTotalsOf` and the reader if lane 1's differ.
13. **Copies:** `reachOutReport` becomes a second declaration (db's and the reader's), allowed by the ratchet; check before committing that no third exists.
14. **A page literal still says "visit"** (`cmp/playbooks/card-detail.tsx:298`, "the day's visits are picked from them"); it is the drawer's, lane 3's, and the ratchet counts it until then.

