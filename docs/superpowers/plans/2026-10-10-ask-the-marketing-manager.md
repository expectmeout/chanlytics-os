# Ask, the marketing manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner says "10% off colour all of November" or "set up my campaigns" and Ask answers with a plan they approve in one sitting: the silent steps (a message written for every channel, a list, a dated note, a change) in one press, each send its own press, every send behind the gates that already exist, and the receptionist knowing the offer while it runs.

**Architecture:** The model states an intent; a pure contracts function (`planOf`) expands it into steps, deciding reuse or create in code that is tested with no model. A plan is a numbered *group of ordinary cards*: each step is proposed through the act handler its card already has, stamped `plan: { id, step, of, silent }`, and committed through its own route by the commit runner that exists, so no new card kind, no new commit route and no new policy row are needed for the plan itself. Three reads are projections of readers that exist (`campaigns.journey`, `campaigns.messages`, `calendar.room`); one new door files a written message as a starter is filed (`POST templates/message`); dates live on the records (`note.until`, `playbooks.until`, `playbooks.trial_until`), and a one-off send honours the week's breath by default.

**Tech Stack:** TypeScript (contracts, core, db, the Next dashboard), zod 4 (server only), Supabase Postgres (plpgsql, RLS), node:test over the repo's database in memory (`_fake-db.mjs`) and stub React, Playwright (the nightly's workspace, run once by hand here), the Ask eval runner (`tooling/scripts/eval-ask.mjs`, run by Ruben).

**Spec:** `docs/superpowers/specs/2026-10-10-ask-the-marketing-manager-design.md` (approved 10 October 2026), **as amended by this plan** (the block below): §3 D1–D10, §5.1–5.9, §6, §7 P0–P5, §8, §12.

## Amendments to the spec, decided while planning (the code wins over the spec where they differ)

1. **No `plan` card kind, no `POST campaigns/plan`, no `srv/campaigns/apply-plan.ts`.** A plan is the group of
   ordinary cards its steps make (spec §5.4 "two proposals" becomes "N cards with one stamp"); the silent ones are
   committed in order by `commitPlan` in `legacy-bridge/ask/commit.ts`, each through its own spec and route (role and
   state re-checked there, as today), under the key `plan:<id>:<n>`; the sends unlock when the steps they name are done.
   Undo stays per card. The 0031 rule holds per record: each step's door writes its record and its decision as it does
   alone.
2. **`propose_plan` is the action `propose_campaign.plan`**, not a twenty-first tool: `ask-registry.test.mjs:274` holds
   every role to at most twenty tools (the strict-tools cap), the precedent being lane 4's `change`.
3. **`lapseMs` on the spec is dropped**: `askCardLapsed` reads the card's `plan` stamp and gives a stamped card seven
   days (`ASK_PLAN_FRESH_MS`).
4. **The review ask is a second starter**, `after_visit_review` (utility, trigger `visited`, three channels, `{{3}}` the
   review link), offered where the workspace has the link, not an optional line on `after_visit_check` (a starter's
   text is one Meta template; two texts are two).
5. **The `change_playbook` door is replaced in migration B** to take the keys `params`, `until` and `trial_until`
   (`mig/00377_a_playbook_changes_in_one_write.sql` maps each key by name).
6. **Writing a message is one door, `POST templates/message`**, in the shape of the starter route
   (`srv/campaigns/starter-templates.ts` `addStarterTemplates`): every version filed, WhatsApp submitted, one answer.
7. **A tool call may return several cards**: `ProposalOutcome.proposals` beside `proposal` (`srv/ask/tools/context.ts`),
   accumulated by the loop where it accumulates one.

---

## Read this first (the implementer has zero context)

- **Where.** Worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-ask-manager`, branch
  `ask/the-marketing-manager`, from `origin/main` at `ef0aea36a`. Run every command from that folder. Never `cd`
  elsewhere, never `git stash`, never push, never touch production or the shared local Supabase stack. Each task ends in
  one local commit of the exact files it names.
- **The worktree has no `node_modules` and no `.next`.** Task 1 installs. Disk: 20 GB free on 10 October (enough).
- **The code wins.** Every `file:line` here was read on `ef0aea36a` by three read-only explorations and by hand. Before
  each edit, read the current file and find the block by its words; a line number is a hint. Where the tree disagrees
  with this plan, keep the plan's intent, follow the tree's shape, and say so in your report.
- **Earlier tasks' names are in their Interfaces blocks.** Read the tree for their code; this plan does not repeat it.
- **Tests execute the code they prove.** A source-text assertion is the last resort (`source-scan-baseline.json` may only
  fall). Fixtures copy the real shape (`_rows.mjs` fills every column a table has and refuses one it does not).
- **Never a whole suite locally.** One file per command (R1). The lane's close (Task 21) runs `corepack pnpm check:local`,
  which runs the tests of what the branch changes.
- **Words.** The page's word is **campaign** (never "playbook" to a person, never "sequence"); a **message** has a
  **version** per channel; a **moment**; a **list**; an **offer** is a marketing message; a **plan** is this lane's word
  for steps the server expands. Customer-facing strings pass `trade-neutral.test.mjs` (no one trade's words).
- **Migrations:** 00394 and 00395 provisionally (the evidence lane in `cm-glass` holds 00392/00393, unmerged); Task 21
  renumbers if main took them. Forward-only, re-runnable statements, a header of a few lines, RLS and grants as the
  table's.
- **No customer in the code.** Fixtures take 555-01xx numbers and example.com links.

## Conventions used by every task

- **R1, run one test file:** `node tooling/scripts/checks/test.mjs <file>`.
- **R2, rebuild a package after editing it:** contracts `corepack pnpm --filter @chanlytics/contracts build`, core
  `corepack pnpm --filter @chanlytics/core build`, db `corepack pnpm --filter @chanlytics/db build`. Tests and the
  dashboard read the committed `dist`; commit the `dist`. After a contracts **export** changes, first
  `node tooling/scripts/gen/contracts-browser-entry.mjs` (rewrites `ct/browser.generated.ts`).
- **R3, check:** `corepack pnpm -r typecheck` (or `--filter <pkg> typecheck`), `corepack pnpm lint`,
  `corepack pnpm exec prettier --write <changed files>` (`apps/dashboard/src/legacy/` is prettier-ignored: one change
  per line, never re-wrapped).
- **R4, bank a fall:** `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo`, then
  commit the baselines it changed. A rise is never banked here; a rise this lane needs is argued in Task 21.
- **R5, regenerate Ask's frozen tools** after any change to a tool's words, schema or examples:

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 SUPABASE_SERVICE_ROLE_KEY=test-only \
  node --conditions=react-server --import tsx --input-type=module -e '
  import fs from "node:fs";
  import { pathToFileURL } from "node:url";
  const m = await import(pathToFileURL("apps/dashboard/src/server/ask/tools/index.ts").href);
  const { toApiTools } = m.toApiTools ? m : m.default; // tsx hands the module's exports under `default` (Task 3)
  const out = Object.fromEntries(["viewer", "operator", "partner", "owner"].map((r) => [r, toApiTools(r, true)]));
  fs.writeFileSync("tooling/scripts/tests/fixtures/ask-tools-4-7.json", JSON.stringify(out, null, 2) + "\n");
  '
  corepack pnpm exec prettier --write tooling/scripts/tests/fixtures/ask-tools-4-7.json
  ```

  Then `git diff --stat tooling/scripts/tests/fixtures/ask-tools-4-7.json` shows only the task's own words. A new
  action is also inserted, sorted, in `ADDED_SINCE` of `tooling/evals/rename-ask-tools.mjs`
  (`ask-registry.test.mjs:477-480` compares the sorted registry with it).
- **R6, the throwaway stack (database tasks only):** never the shared stack, never `supabase link`, never `db push`,
  never production. Make this lane's own stack as lane 1 of the moment lane did
  (`cm-campaigns-2/docs/superpowers/plans/2026-10-09-moment-lane-1-floors-and-backend.md`, its Task 2: project id
  `cm-ask-test`, ports +3400, pinned CLI 2.116.0, an env file in this session's scratchpad that refuses any other URL).
  A db suite without `SUPABASE_URL` and the keys SKIPS; look for `# skip 0`. Source the env file in the same command as
  every database step.
- **R7, commit:** `git add <exact files>` then
  `git commit -m "<what changed, in the repo's sentence style>" -m "Co-Authored-By: <the model that made the commit> <noreply@anthropic.com>"`
  (an implementer on Opus 5.5 writes `Claude Opus 5.5`).
  New untracked files a barrel or tree test reads need `git add -N <files>` before the test runs.
- **R8, a new top-level name** must not be declared in a third file: `git grep -nE "(function|const|let|class|interface|type) <Name>\b" -- apps packages ':!*/dist/*'`.
- **R9, Ask's test fixtures:** `tooling/scripts/tests/ask/*.test.mjs` run the real registry over `_fake-db.mjs`; a new
  action needs its row in `ask-specs.test.mjs` (every kind has a spec), `ask-registry.test.mjs` (the invariant list) and
  `ask-tool-names.test.mjs`.

## Words used below

`ct/` is `packages/contracts/src/`, `core/` `packages/core/src/`, `db/` `packages/db/src/`, `srv/`
`apps/dashboard/src/server/`, `act/` `srv/ask/tools/act/`, `read/` `srv/ask/tools/read/`, `bridge/`
`apps/dashboard/src/legacy-bridge/`, `legacy/` `apps/dashboard/src/legacy/`, `cmp/` `apps/dashboard/src/surfaces/campaigns/`,
`edge/` `apps/edge/lib/`, `mig/` `supabase/migrations/`, `tests/` `tooling/scripts/tests/`, `evals/` `tooling/evals/`.
Dn is decision n of the spec's §3.

## File map

**Created**

| File | Responsibility |
| --- | --- |
| `ct/ask/plan.ts` | `PlanIntent`, `PlanStep`, `PlanWorld`, `planOf`, `STEP_TOKEN`, `stepToken`, `resolveSteps`, `planWords` |
| `ct/journey/journey-guide.ts` | `journeyGuide({ calendarOn, dealsOn })`: the touch points per stage, trade-neutral |
| `act/plan.ts` | `planAction`: reads the world, `planOf`, runs each step through its sibling handler, stamps the cards |
| `act/message.ts` | `messageAction`: a message with a version per channel, checked, quoted whole |
| `srv/campaigns/write-message.ts` | `writeMessage(ctx, member, body)`: files every version, submits WhatsApp, answers each version's state |
| `apps/dashboard/app/api/v1/templates/message/route.ts` | `POST templates/message` |
| `mig/00394_a_listing_keeps_its_review_link.sql` | `google_listings.new_review_uri` |
| `mig/00395_a_campaign_ends_and_runs_on_trial.sql` | `playbooks.until`, `playbooks.trial_until`; `change_playbook` replaced for `params`, `until`, `trial_until` |
| `tests/ask/plan/plan-of.test.mjs` | `planOf` by world, no model (`tests/ask/` holds 20 files already: this lane's Ask tests live in subfolders, lane 4's `tests/playbooks/change/` precedent) |
| `tests/ask/plan/plan-cards.test.mjs` | the `plan` action's cards, tokens, stamps, refusals |
| `tests/ask/plan/plan-commit.test.mjs` | `commitPlan` over a stub client: order, keys, a stop, a held send, resolution |
| `tests/ask/tools/message-card.test.mjs` | the `message` action and its spec |
| `tests/templates/write-message.test.mjs` | the door over `_fake-db.mjs` (no new `tests/campaigns/` folder: the one-module rule covers `tooling/scripts`, so each test joins its domain's folder) |
| `tests/playbooks/change/trial-and-until.test.mjs` | `effectiveMode`, a run on trial, a run past `until` |
| `tests/broadcasts/broadcast-breath.test.mjs` (or a `breath/` subfolder of two files if `tests/broadcasts/` is at its 20) | a one-off send holds who heard this week |
| `tests/playbooks/change/playbook-change-words.test.mjs` | `params`, `until`, `trial_until` through `checkPlaybookPatch` |
| `tests/journey/journey-guide.test.mjs` | the guide's rows and words |
| `tests/ask/tools/ask-tools-size.test.mjs` | the tools block in characters per role, under `ASK_TOOLS_CHARS_CEILING` |
| `tests/playbooks/change/change-playbook-keys.db.test.mjs` | migration B applies twice; the door takes the three keys |
| `e2e/ask/plan.spec.ts` | a plan approved on the e2e workspace, email-only, sends refused |
| `docs/decisions/0043-a-plan-is-steps-the-server-expands.md` | the decision note |

**Modified**

| File | Change |
| --- | --- |
| `ct/ask/ask.ts` | kind `message`; `AskPlanStamp`, `AskProposal.plan`; `ASK_PLAN_FRESH_MS`; `askCardLapsed` by stamp |
| `ct/ask/ask-answer.ts` | the count sentence for a plan |
| `ct/ask/ask-settings-change.ts` | `add_note` takes `until` |
| `ct/ask-proposals/campaigns.ts`, `proposals.ts` | `messageSpec`; `broadcastSpec` says who waits a week |
| `ct/config/workspace-config/business-profile.ts`, `compose.ts` | `NoteSchema.until`; `notesSection` renders and expires |
| `ct/templates/starter-templates.ts`, `starter-lookup.ts`, `template-preview.ts`, `templates.ts` | `after_visit_review`; slot kind `review_link` |
| `ct/playbooks/playbook-patch.ts`, `playbook-triggers.ts`, `playbook-schedule.ts`, `lifecycle/lifecycle-ledger.ts` | the three keys and their words; `effectiveMode`; "ended", "on trial" |
| `ct/broadcasts/broadcast-audience.ts`, `broadcasts.ts` | `RECIPIENT_REASON_HEARD`; held words |
| `ct/journey/index.ts`, `ct/ask/index.ts`, `ct/browser.generated.ts` | barrels |
| `core/campaigns/check-playbook.ts`, `run-playbook.ts`, `create-broadcast.ts`, `template-values.ts` | the patch keys; trial and `until`; the breath; `reviewLink` port |
| `db/repositories/google-listings*.ts` (the listing's writer), `database.types.ts` | `new_review_uri` |
| `packages/channels/src/google/google-profile.ts`'s caller | writes the link it already reads |
| `srv/readers/templates.ts`, `read/campaigns.ts`, `read/calendar.ts` | `messages`, `journey`, `room` |
| `act/campaign.ts`, `act/playbook.ts`, `act/playbook-change.ts`, `act/broadcast.ts`, `act/settings.ts` | `message`, `plan`; offered moments; the keys; `@review_link`; `breathe`; note `until` |
| `srv/ask/tools/context.ts`, `srv/ask/loop.ts` | `ProposalOutcome.proposals`; the loop accumulates several |
| `srv/ask/prompt.ts` | three rules (spec §5.7) |
| `apps/dashboard/app/api/v1/playbooks/[id]/route.ts`, `broadcasts/route.ts` | `params`/`until`/`trial_until`; `breathe` |
| `bridge/ask/commit.ts` | `commitPlan`, `resolveSteps` before `spec.commit` |
| `legacy/pages/ask-turn.jsx`, `legacy/styles/ask.css` | the group: "Step n of N", one press for the silent steps, a held send; the message card's versions |
| `cmp/broadcasts/...` composer, `cmp/...` settings notes form | the "also send to the N who heard" switch; a note's `until` |
| `tooling/scripts/tests/route-policy.json`, `docs/api.md`, `apps/dashboard/src/client/routes.generated.ts`, `ct/route-keys.generated.ts` | the new route |
| `tests/ask/ask-registry.test.mjs`, `ask-specs.test.mjs`, `ask-tool-names.test.mjs`, `tests/fixtures/ask-tools-4-7.json`, `evals/rename-ask-tools.mjs`, `evals/ask-cases.json` | the actions, the fixture, the cases |
| `docs/system-prd.md`, `docs/glossary.md`, the spec | the Ask and campaigns sheets; "plan"; "As built" |

## Review Focus

Inputs the spec implies but no task's tests would otherwise exercise; each line's test is added to the owning task.

1. An offer whose `until` is before `from`, or whose `from` is in the past: `planOf` refuses in words (Task 15).
2. An offer on a workspace with no channel that can carry one (no WhatsApp number, email offers not ready): `planOf`
   refuses with the channel's own words, never a plan with zero sends (Task 15).
3. A plan approved twice (a double press, a reload mid-way): every step's key is `plan:<id>:<n>`, so the second press
   answers the first's result (decision 0035) and makes nothing twice (Task 16).
4. A send card whose step was undone: its commit refuses with `PROPOSAL_WORDS.planUndone`, never a send to a list that
   no longer exists (Task 16).
5. A note whose `until` is today: rendered today, gone tomorrow, on the business's clock, not UTC (Task 13).

---

## P0 Evidence

### Task 1: The worktree builds, and the tools block is measured

**Files:**
- Create: `tests/ask/tools/ask-tools-size.test.mjs`
- Modify: `ct/ask/ask.ts` (one constant)

**Interfaces:**
- Produces: `ASK_TOOLS_CHARS_CEILING = 72_000` in `ct/ask/ask.ts` (the owner's block, in characters of
  `JSON.stringify(toApiTools("owner", true))`; the spec measured 50,153 on 27 September and this lane adds five actions).

- [ ] **Step 1: Install and build**

Run: `corepack pnpm install && corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck`
Expected: no errors; `git status --short` shows no dist drift (the dist is committed).

- [ ] **Step 2: Write the measurement test**

`tests/ask/ask-tools-size.test.mjs`: for each role in `["viewer","operator","partner","owner"]`, `const chars =
JSON.stringify(toApiTools(role, true)).length`; print one line `tools-block role=<role> chars=<n>`; assert
`chars <= ASK_TOOLS_CHARS_CEILING`. Import `toApiTools` as `ask-registry.test.mjs` does (the env it sets for the import).

- [ ] **Step 3: Run it; record the four numbers in your report**

Run (R1): `tests/ask/ask-tools-size.test.mjs`. Expected: PASS, four printed lines. The owner's number is the lane's baseline.

- [ ] **Step 4: Commit (R7)**: the test and `ct/ask/ask.ts` (+ dist after R2).

### Task 2: The cases this lane must pass, written first

**Files:**
- Modify: `evals/ask-cases.json` (append), `evals/rename-ask-tools.mjs` (no change yet; read `ADDED_SINCE`'s shape)
- Test: `tests/ask/rename-ask-tools.test.mjs` (exists; run it)

**Interfaces:**
- Produces: case ids `offer_november_colour`, `setup_with_calendar`, `setup_without_calendar`, `write_winback_spanish`,
  `remind_day_before`, `never_text_an_offer`, and eight ids `covers_<tool>_<action>` for `propose_campaign.broadcast`,
  `propose_campaign.channels`, `propose_lead_search`, `propose_whisper`, `propose_deal`, `propose_autonomy`,
  `propose_thread_verb`, `propose_person.mode`.

- [ ] **Step 1: Read three existing cases** with `expect.tools_order`, `expect.proposals_max` and `expect.card_fields_not`
  (grep the file) and the judge in `tooling/scripts/eval-ask.mjs` for how each key is judged.

- [ ] **Step 2: Append the fourteen cases**, with the spec's §8 expectations verbatim:
  - `offer_november_colour` (surface `campaigns`, text "I want to offer 10% off colour all of November"): `tools_order:
    ["campaigns", "propose_campaign"]`, `proposals_any: ["message", "broadcast"]`, `proposals_max: 6`,
    `card_fields_not: ["template_id"]` on kind `message`, `no_write: true`.
  - `setup_with_calendar` (context: a calendar connected, nothing running): `tools_any: ["propose_campaign"]`,
    `proposals_any: ["playbook"]`, `proposals_max: 3`, `no_write: true`.
  - `setup_without_calendar`: `proposals_max: 1` (Win-back by silence only), `next_any: ["settings"]`.
  - `write_winback_spanish` ("write a win-back for people who haven't been in since summer, in Spanish too"):
    `proposals_any: ["message"]`, `card_fields_not: ["sms"]` on kind `message`.
  - `remind_day_before` (calendar connected): `proposals_any: ["playbook"]`, and the card's payload `trigger` is
    `visit_tomorrow` (`card_fields: { trigger: "visit_tomorrow" }` if the judge has it, else `tools_any` alone).
  - `never_text_an_offer` ("send everyone a text with 10% off"): `must_never: ["sms"]` in any card's versions, and the
    answer names why (`say_any: ["text"]` if the judge has it).
  - The eight `covers_*` cases: one plain sentence each on the right surface, `tools_any: [<tool>]`, `proposals_any:
    [<kind>]`, `no_write: true`.

- [ ] **Step 3: Run the case file's own test** (R1): `tests/ask/rename-ask-tools.test.mjs` and whatever test lints
  `ask-cases.json` (grep `ask-cases` under `tests/`). Expected: PASS (shape only; the cases are not run here).

- [ ] **Step 4: Commit (R7).**

## P1 Reads

### Task 3: `campaigns.messages`: the whole library, versions in review included

**Files:**
- Modify: `srv/readers/templates.ts` (export the messages projection), `read/campaigns.ts` (action `messages`),
  `tests/ask/ask-registry.test.mjs`, `tests/ask/ask-tool-names.test.mjs`, `evals/rename-ask-tools.mjs`
- Regenerate: `tests/fixtures/ask-tools-4-7.json` (R5)
- Test: `tests/ask/readers.test.mjs` (append)

**Interfaces:**
- Produces: `campaigns` action `messages` → `{ messages: MessageRead[] }`, with `MessageRead` **declared in contracts,
  `ct/ask/ask.ts`** beside the other read shapes (Task 15's `planOf` takes it, and contracts never imports the
  dashboard): `MessageRead = { name: string; language: string; category: "marketing" | "utility"; versions: { channel:
  "whatsapp" | "sms" | "email"; id: string; state: "approved" | "pending" | "rejected" | "paused" | "disabled" }[];
  slots: { position: number; label: string; kind: string }[]; used_by: { id: string; name: string }[] }` (the campaigns
  naming the message, from the playbooks the reader already reads). Rows cite kind `template`.

- [ ] **Step 1: Write the failing test** in `readers.test.mjs`: a world with one message holding an approved email
  version and a pending WhatsApp version → `campaigns.messages` returns one message with two versions, states
  `approved` and `pending`; `audiences` (unchanged) still lists only the sendable one.

- [ ] **Step 2: Run it** (R1). Expected: FAIL, unknown action `messages`.

- [ ] **Step 3: Implement.** `srv/readers/templates.ts` already builds `messages = campaignMessagesOf(every)` (line ~140):
  return it on the reader's data under `messages` if it is not already, with each version's `meta_status` as `state`.
  `read/campaigns.ts`: `messages: readAction({ input: z.object({}), words: <3–4 sentences: the whole library, including
  versions still in review, so a twin is never written; when to prefer audiences>, run })`.

- [ ] **Step 4: Run the test, R5, the registry tests** (R1 each: `readers`, `ask-registry`, `ask-tool-names`). Expected: PASS.

- [ ] **Step 5: Commit (R7).**

### Task 4: `campaigns.journey`: the stages, their coverage, and the guide

**Files:**
- Create: `ct/journey/journey-guide.ts`, `tests/journey/journey-guide.test.mjs`
- Modify: `ct/journey/index.ts`, `read/campaigns.ts` (action `journey`), registry tests, `rename-ask-tools.mjs`
- Regenerate: fixture (R5), `ct/browser.generated.ts` (R2)
- Test: `tests/ask/readers.test.mjs` (append)

**Interfaces:**
- Produces: `journeyGuide(input: { calendarOn: boolean; dealsOn: boolean }): GuideRow[]`, `GuideRow = { stage:
  JourneyStageId; moment: PlaybookTriggerId | null; sends: string; why: string }` (one row per stage the workspace can
  run; words trade-neutral: "the day before an appointment, a reminder"; "the day after, a thank-you and a review ask";
  "quiet six weeks or more, a win-back"; "every month, one offer to those who said yes").
- `campaigns` action `journey` → `{ covered: number; of: number; stages: { id: JourneyStageId; label: string; covered:
  boolean; state: string; moment: PlaybookTriggerId | null; campaigns: { id: string; name: string; state: string }[]
  }[]; guide: GuideRow[] }`, computed from `campaignsHomeOf` over the `playbooks`, `broadcasts` and `reachOutChains`
  readers (`srv/readers/playbooks.ts:58,140`) exactly as `cmp/home/use-home.ts:83` composes it.

- [ ] **Step 1: Write the failing tests.** `journey-guide.test.mjs`: with a calendar, five rows incl. `before` and
  `after`; without, no `before`/`after`; `dealsOn: false` has no `proposal` row; every `sends` and `why` string passes the
  neutral-words check `trade-neutral.test.mjs` applies (import its predicate or copy its regex). `readers.test.mjs`: a
  world with a calendar and one running Win-back → `journey` says `covered: 2` (first contact + quiet), `of: 4`, the
  `quiet` stage's `campaigns` names it, `guide` has the `before` row.

- [ ] **Step 2: Run both** (R1). Expected: FAIL.

- [ ] **Step 3: Implement** `journey-guide.ts` and the action (`words`: what the page's rail says, as data; when to call it:
  "what am I missing", a setup; its sibling `playbooks` for one campaign's detail).

- [ ] **Step 4: Run both, R2, R5, the registry tests.** Expected: PASS.

- [ ] **Step 5: Commit (R7).**

### Task 5: `calendar.room`: open slots in the next fourteen days

**Files:**
- Modify: `read/calendar.ts` (action `room`), registry tests, `rename-ask-tools.mjs`; fixture (R5)
- Test: `tests/ask/readers.test.mjs` (append)

**Interfaces:**
- Produces: `calendar` action `room` → `{ days: 14; open: number; taken: number; by_day: { day: string; open: number
  }[]; none?: "no_calendar" }` from the `openings` reader (`srv/readers/openings.ts`) with `day: null, service: null`, summing the openings
  `openingsFor` returns across `BOOKING_DEFAULTS.max_days_ahead` (14) days; `taken` from the record's busy blocks the
  reader already subtracts. No calendar connected → `{ days: 14, open: 0, taken: 0, by_day: [], none: "no_calendar" }`.

- [ ] **Step 1: Failing test:** a world with a calendar whose feed holds two busy hours tomorrow and hours 9–17 →
  `room.open` equals the count `freeWindows` gives at `slot_min` 30 over 14 days; `by_day[0].day` is tomorrow's date in
  the workspace's zone. Without a calendar: `none: "no_calendar"`.

- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement** the action (`words`: how full the book is, for pacing; never a chair or staff count).
- [ ] **Step 4: Run, R5, registry tests.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

## P2 Words

### Task 6: The review link: stored, a slot kind, a port (migration A)

**Files:**
- Create: `mig/00394_a_listing_keeps_its_review_link.sql`
- Modify: `packages/channels/src/google/google-profile.ts`'s caller (the sync that writes `google_listings`, find it with
  `git grep -n "maps_uri" -- packages/db apps/edge`), `db/` the listing repository, `db/database.types.ts`
  (`gen:db-types`), `ct/templates/templates.ts` (slot kind), `ct/templates/template-preview.ts` (`OwnFacts.review_link`,
  the label "Review link"), `core/campaigns/template-values.ts` (a `reviewLink()` port beside `bookingLink()`, line ~99),
  the port wiring where `bookingLink` is wired (`git grep -n "bookingLink" -- packages/jobs apps/dashboard/src/server`),
  `act/broadcast.ts:53-68` (`@review_link` beside `@booking_link`), `srv/campaigns/templates.ts:103` (the slot rules name it)
- Test: `tests/campaigns/` the template-values test that exists (append), `tests/campaigns/change-playbook-keys.db.test.mjs`
  is Task 10's; here a db test `tests/google/review-link.db.test.mjs` (apply twice; the column is null by default)

**Interfaces:**
- Produces: `ParamSpec.kind` gains `"review_link"`; `TemplateValuesPorts.reviewLink(): Promise<string | null>`; a send
  with a `review_link` slot and no link is refused with `TEMPLATE_VALUE_WORDS.noReviewLink` ("Connect your Google
  listing so the review link can be filled") as `booking_link` is at `template-values.ts:99`.

- [ ] **Step 1: Migration A** (`alter table public.google_listings add column if not exists new_review_uri text null;`
  with the header; no RLS change).
- [ ] **Step 2: Failing tests:** template-values: a spec with `review_link` and a port answering null → refused with
  the words; answering a URL → filled. db test: applies twice.
- [ ] **Step 3: Implement** the column's writer (the sync already reads `newReviewUri`, `google-profile.ts:154`), the
  kind, the preview label, the port and its wiring, Ask's `@review_link`.
- [ ] **Step 4: Run** the tests (R1; the db test under R6), R2 for contracts/core/db, `gen:db-types`, `gen:schema-snapshot`,
  `gen:data-model` (R6 for the two that need the stack). Expected: PASS.
- [ ] **Step 5: Commit (R7)** including the generated files.

### Task 7: The starter `after_visit_review`

**Files:**
- Modify: `ct/templates/starter-templates.ts` (after `after_visit_check`, line ~215), `starter-lookup.ts`
  (`startersForTrigger("visited")` lists it; `starterForTrigger` keeps `after_visit_check`), `ct/journey/journey-guide.ts`
  (the `after` row names the review ask)
- Test: `tests/templates/` the starters test that exists (append); `tests/repo/trade-neutral.test.mjs` (R1)

**Interfaces:**
- Produces: `STARTER_TEMPLATES` entry `key: "after_visit_review"`, title "After the appointment, with a review ask",
  `category: "utility"`, `trigger: "visited"`, texts `en_US` and `es` for WhatsApp and email and a text version
  (`starterSmsText`), slots `[FIRST, BUSINESS, { kind: "review_link", label: "Review link", example:
  "https://g.page/r/example/review" }]`; `startersForTrigger("visited")` → `[after_visit_check, after_visit_review]`.

- [ ] **Step 1: Failing test:** `startersForTrigger("visited")` has both keys; the new starter's three texts hold
  `{{3}}`; its words pass the neutral check; `starterSmsText` returns a body.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Write the starter** (customers read "appointment"/"cita", never "visit"; `trade-neutral` and the
  `appointment-words.json` ratchet hold it).
- [ ] **Step 4: Run** the starters test, `trade-neutral`, `tests/journey/journey.test.mjs` (the ratchet), R2. Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 8: `POST templates/message`: a written message filed as a starter is filed

**Files:**
- Create: `srv/campaigns/write-message.ts`, `apps/dashboard/app/api/v1/templates/message/route.ts`,
  `tests/campaigns/write-message.test.mjs`
- Modify: `tooling/scripts/tests/route-policy.json` (row), `docs/api.md` (`gen:api-reference`), the typed client
  (`node tooling/scripts/gen/route-types.mjs`)

**Interfaces:**
- Produces: route `POST templates/message`, policy `{ kind: "write", scope: "workspace", role: "operator", rate:
  "settings", spend: false }`, body `WriteMessageBody = { name: string; language: string; category: "marketing" |
  "utility"; versions: { whatsapp?: { body: string; footer?: string }; email?: { subject: string; body: string }; sms?:
  { body: string } }; slots: { position: number; label: string; example?: string; kind: ParamSpec["kind"] }[] }`;
  answer `WriteMessageAnswer = { name: string; language: string; versions: { channel: ConsentChannel; id: string;
  state: "approved" | "pending" }[]; refused?: { channel: ConsentChannel; words: string } }`.
- `writeMessage(ctx: RouteContext, member: Member, body: WriteMessageBody): Promise<WriteMessageAnswer>`: email and
  sms through `save_template_version` as `POST templates/versions` does (`srv/campaigns/template-versions.ts`
  `beginMessage`), then WhatsApp through `submitTemplate` (`srv/campaigns/template-submit.ts`) — in that order, so a Meta
  refusal leaves the others filed and is answered under `refused`, never thrown.

- [ ] **Step 1: Failing test** over `_fake-db.mjs`: (a) email + sms → two rows in `templates`, states `approved`; (b)
  email + whatsapp with the edge stubbed to accept → the WhatsApp row `pending`; (c) the edge refusing (409) → email
  filed, `refused.channel === "whatsapp"`; (d) a `marketing` message with an `sms` version → 400 with
  `reach-for.ts:101`'s words before anything is filed; (e) a twin (same name and language) → 409.
- [ ] **Step 2: Run** (R1). Expected: FAIL, route not found.
- [ ] **Step 3: Implement** the route (`write({...})` as `templates/starter/route.ts:21`) and `writeMessage`.
- [ ] **Step 4: Run the test, `gen:api-reference`, `route-types.mjs`, R1 on `tests/route-policy*.test.mjs` and the
  route-types test.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 9: `propose_campaign.message` and the `message` card

**Files:**
- Create: `act/message.ts`, `tests/ask/tools/message-card.test.mjs`
- Modify: `act/campaign.ts` (action `message`), `ct/ask/ask.ts` (kind), `ct/ask-proposals/campaigns.ts` (`messageSpec`),
  `ct/ask-proposals/proposals.ts` (the map), `act/says.ts` (quote every version), `legacy/pages/ask-turn.jsx`
  (`?v=` bump; the `message` card lists each version under its channel's word in `.ask-card-said`), registry tests,
  `ask-specs.test.mjs`, `rename-ask-tools.mjs`; fixture (R5); `ct/browser.generated.ts`

**Interfaces:**
- Produces: `messageAction` (`actAction`): input `{ name: string; language: "en" | "es"; category: "marketing" |
  "utility"; versions: { whatsapp?: { body: string }; email?: { subject: string; body: string }; sms?: { body: string }
  }; slots?: { position: number; label: string; kind: ParamSpec["kind"] }[] }`, kind `message`, two examples. Refusals
  (words in `ct/ask-proposals/campaigns.ts` `MESSAGE_WORDS`): `smsOffer` (a marketing message with an sms version),
  `twin` (a name and language `campaigns.messages` already holds), `noNumber` (whatsapp without an active number),
  `noMailbox` (email without one), `tooLong` (WhatsApp body past its limit). The card's `summary` quotes every version
  as `previewSays` renders it with example slots, then "Goes by email now; WhatsApp waits on Meta's review (usually
  minutes, sometimes a day)".
- `messageSpec`: needs `operator`, gate `approve`, `commit` → `POST templates/message` with the payload, `receipt` from
  the answer (filed channels, the refused one), `undo` → one `DELETE templates/versions/[id]` per `versions[].id` within
  `ASK_UNDO_MS` (a WhatsApp version Meta approved is left and said), `open` → the Library's message route.

- [ ] **Step 1: Failing tests:** each refusal; a good input makes a card with every version quoted; the spec's commit
  names the route and body; undo records the ids; the registry still offers at most twenty tools per role.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement** the action, the spec, the card's rows in `ask-turn.jsx` (legacy: one change per line).
- [ ] **Step 4: Run** `message-card`, `ask-specs`, `ask-registry`, `ask-tool-names`, `ask-turn` (R1 each), R2, R5.
  Expected: PASS; the fixture diff shows only `message`.
- [ ] **Step 5: Commit (R7).**

## P3 Dates

### Task 10: Migration B: a campaign ends, runs on trial, and changes its words

**Files:**
- Create: `mig/00395_a_campaign_ends_and_runs_on_trial.sql`, `tests/campaigns/change-playbook-keys.db.test.mjs`
- Regenerate: `db/database.types.ts`, `ct/schema-sets.generated.ts`, `supabase/schema.sql`, `docs/data-model.md` (R6)

**Interfaces:**
- Produces: `playbooks.until date null`, `playbooks.trial_until timestamptz null`; `change_playbook` replaced (`create or
  replace`, same signature as `mig/00377`) mapping `p_set ->> 'params'` (jsonb array of strings), `(p_set ->> 'until')::date`,
  `(p_set ->> 'trial_until')::timestamptz` beside the six keys it maps today; the decision row's `data` names each key
  changed as it does for the six.

- [ ] **Step 1: Read `mig/00377_a_playbook_changes_in_one_write.sql`** whole; copy its function with the three keys added.
- [ ] **Step 2: Failing db test:** apply the migration twice (re-runnable); `change_playbook` with `p_set = {"until":
  "2026-11-30"}` sets the column and writes the decision; with `{"trial_until": ...}` and `{"params": ["10% off colour"]}`
  likewise; an unknown key is ignored as today.
- [ ] **Step 3: Run under R6.** Expected: FAIL before, PASS after; `# skip 0`.
- [ ] **Step 4: Regenerate** the four files (R6 where needed); R2 for db and contracts.
- [ ] **Step 5: Commit (R7)** the migration, the test, the generated files.

### Task 11: Contracts and core know the three keys, the trial and the end

**Files:**
- Modify: `ct/playbooks/playbook-patch.ts` (`PLAYBOOK_PATCH_KEYS` + `"params" | "until" | "trial_until"`,
  `PLAYBOOK_PATCH_WORDS`), `ct/playbooks/playbook-schedule.ts` (`effectiveMode`), `ct/playbooks/lifecycle/lifecycle-ledger.ts`
  (state words "ended {date}", "on trial until {date}"), `core/campaigns/check-playbook.ts` (`checkPlaybookPatch`:
  `params` must match the message's slot count; `until` a date today or later; `trial_until` null or a timestamp),
  `core/campaigns/run-playbook.ts` (`const mode = effectiveMode(p, ctx.modes.get(p.policy_class) ?? "ask", now)`; a run
  on a day past `p.until` → `off("ended")`; the veto notice says "on trial until" when the trial made it veto),
  `apps/dashboard/app/api/v1/playbooks/[id]/route.ts` (the PUT's patch union takes the three)
- Create: `tests/campaigns/trial-and-until.test.mjs`, `tests/playbooks/change/playbook-change-words.test.mjs`

**Interfaces:**
- Produces: `effectiveMode(p: { trial_until: string | null }, mode: PolicyMode, now: Date): PolicyMode` (`auto` →
  `veto` while `now < trial_until`; every other mode unchanged); `Skipped` gains `"ended"`; `LIFECYCLE_WORDS.ended(date)`,
  `.onTrial(date)`.

- [ ] **Step 1: Failing tests:** `effectiveMode` by mode and clock; `runPlaybook` on trial plans `veto` and notices
  "on trial until"; a run past `until` records `ended` once and sends nothing; `checkPlaybookPatch` accepts the three and
  refuses `until` in the past, `params` of the wrong count; the ledger's words.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, R2 (contracts, core), `tests/playbooks/change/playbook-put.test.mjs` (exists).** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 12: Ask changes the words, ends a campaign, starts one on trial, and may propose a reminder (D2, D5)

**Files:**
- Modify: `act/playbook-change.ts` (fields `params?: string[]`, `until?: string`, `trial_until?: string | null`),
  `act/playbook.ts` (`PROPOSABLE_TRIGGERS` → the moments `momentOffered` allows for this workspace, read from the facts
  the handler already loads plus the calendar's state from the `connections` reader; every new playbook card sets
  `trial_until = now + 7 days` and its summary says "on trial for a week: for seven days each run waits half an hour
  with a Stop"), `srv/ask/prompt.ts` (the reminder line of spec §5.3), registry tests, `rename-ask-tools.mjs`; fixture (R5)
- Test: `tests/playbooks/change/ask-playbook-change.test.mjs` (exists; append), `tests/playbooks/ask-setup/starter-card.test.mjs`
  (exists; append)

**Interfaces:**
- Consumes: Task 11's keys and words.
- Produces: `playbook` cards carry `payload.trial_until`; `change` cards may carry the three keys; a `visit_tomorrow`
  card is made where a calendar is connected and refused with `checkPlaybook`'s calendar words where not.

- [ ] **Step 1: Failing tests:** `change` with `params` → a card whose summary quotes the new words; with `until` →
  "ends 30 Nov"; a `playbook` card's payload has `trial_until` seven days out and the summary says so; `visit_tomorrow`
  with a calendar → a card; without → the refusal.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement**, the prompt line, R5.
- [ ] **Step 4: Run the two tests, `ask-registry`, `ask-tool-names`.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 13: A note ends: `until` on the record, rendered and expired on the business's clock

**Files:**
- Modify: `ct/config/workspace-config/business-profile.ts` (`NoteSchema.until: z.string().regex(YYYY-MM-DD).optional()`),
  `ct/ask/ask-settings-change.ts` (`add_note` takes `until`), `ct/config/workspace-config/compose.ts` (`notesSection`
  takes the clock: renders "- {title} (until {date}): {text}", omits a note whose `until` is before today in the
  workspace's zone), `act/settings.ts` (`until?` on `add_note`; the card says "until"), the settings notes form
  (`git grep -n "noteTitle" -- apps/dashboard/src/surfaces` to find it; a kit date field "Until", optional; an ended note
  reads "ended {date}")
- Test: the compose test that exists (`git grep -ln "Other things to know" -- tooling/scripts/tests`), `tests/ask/ask.test.mjs`
  (the settings card), the settings surface test

**Interfaces:**
- Produces: `Note.until?: string`; `notesSection({ profile, today })` where `today` is the business's local date
  (`localDate(tz, now)` from contracts, as `run-playbook` uses).

- [ ] **Step 1: Failing tests:** a note with `until` tomorrow renders with "(until …)"; one with `until` yesterday is
  omitted; one with `until` today renders (Review Focus 5: at 23:30 in `America/New_York` and 04:30 UTC the next day it
  still renders); `add_note` with `until` → a settings change whose preview says it; the form shows "Until".
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement.** The edge's `compose` call sites pass the clock they already have (`describeNow`'s inputs,
  `edge/receptionist/steer.ts:216`, `eval.ts:90`).
- [ ] **Step 4: Run, R2.** Expected: PASS. Either deploy order: `NoteSchema` is `.strip()`, so an older edge drops `until`.
- [ ] **Step 5: Commit (R7).**

### Task 14: A one-off send honours the breath

**Files:**
- Modify: `core/campaigns/create-broadcast.ts` (the audience step: recipients who heard this week → `skipped`, reason
  `RECIPIENT_REASON_HEARD`, unless `cmd.breathe === false`), `ct/broadcasts/broadcasts.ts` (`RECIPIENT_REASON_HEARD =
  "heard_this_week"`), `ct/broadcasts/broadcast-audience.ts` (`heardWords` → "N wait a week" when held; the switch's
  words), `apps/dashboard/app/api/v1/broadcasts/route.ts` (`breathe?: boolean`, default true), the broadcast composer
  (`git grep -n "heardWords" -- apps/dashboard/src/surfaces`; a kit switch "Also send to the N who heard this week",
  off), `act/broadcast.ts` (the card says "N wait a week", never sets `breathe: false`), `ct/ask-proposals/campaigns.ts`
  (`broadcastSpec`'s summary line)
- Create: `tests/campaigns/broadcast-breath.test.mjs`
- Check: `supabase/schema.sql` for a CHECK on `broadcast_recipients.state`/`reason` (if one lists reasons, add
  `heard_this_week` in a migration appended to Task 10's file before Task 21 renumbers; the reader found none)

**Interfaces:**
- Produces: `CreateBroadcastCommand.breathe?: boolean`; recipients `{ state: "skipped", reason: "heard_this_week" }`.

- [ ] **Step 1: Failing tests:** three recipients, one heard from a run two days ago → two queued, one skipped with the
  reason; `breathe: false` → three queued; the Ask card's summary says "1 waits a week"; the route's body accepts the flag.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement**; R5 if the card's words changed.
- [ ] **Step 4: Run, R2, the composer's test, `gen:api-reference` if the body changed.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

## P4 The plan

### Task 15: `planOf`: the steps of an offer and of a setup, with no model

**Files:**
- Create: `ct/ask/plan.ts`, `tests/ask/plan/plan-of.test.mjs`
- Modify: `ct/ask/index.ts` (barrel), `ct/browser.generated.ts` (R2)

**Interfaces:**
- Produces:
  - `PlanIntent = { intent: "offer"; offer: { words: string; from: string; until: string; service?: string; who?: string;
    channels?: ConsentChannel[] }; say?: string } | { intent: "cover_journey"; stages?: JourneyStageId[] }`.
  - `PlanWorld = { now: Date; tz: string; language: "en" | "es"; channels: { whatsapp: boolean; email_offers: boolean };
    messages: MessageRead[]; lists: { token: string; name: string; rule: unknown; count: number | null }[]; playbooks:
    { id: string; name: string; trigger: string; state: string; template_name: string | null }[]; notes: Note[]; room:
    { open: number } | null; journey: { id: JourneyStageId; covered: boolean; moment: string | null }[] | null;
    offersList: string }` (`offersList` is the built-in offers list's token, `seg:offers_ok`).
  - `PlanStep = { n: number; kind: "message" | "list" | "note" | "change" | "broadcast" | "playbook"; silent: boolean;
    input: Record<string, unknown>; why: string; after: number[] }`.
  - `planOf(intent: PlanIntent, world: PlanWorld): { steps: PlanStep[]; words: string } | { refused: string }`.
  - `STEP_TOKEN = /^@step:(\d+)$/`, `stepToken(n: number): string`, `resolveSteps(payload: Record<string, unknown>,
    made: Record<number, { kind: string; id: string }>): Record<string, unknown> | { unresolved: number }`.
  - `PLAN_WORDS`: `fromAfterUntil`, `fromPast`, `noChannel`, `noOffersList`, `countZero(n)`, `paced(open, audience)`.
  - The rules, one test row each (spec §5.4's table): message reuse by category, language and slots vs a `message`
    step with a version per channel the workspace can carry (`whatsapp` if a number, `email` if `email_offers`, never
    `sms`), written from the starter's shape with the owner's words in `OFFER`'s slot and the date one day before the
    first send when a WhatsApp version is made; list reuse by rule (compare `listRuleParts` output) vs a `list` step
    `{ name, all: [{ field: "said_yes", ... offers }, { field: "booked", op: "none_since", from }], cannot: "" }` for the
    20th; `note` step `{ change: { op: "add_note", title: "Offer: {words}", text: "...from {from} to {until}", until } }`
    unless one titled so exists with the same `until`; `broadcast` on `from` at 10:00 in `tz` (`scheduled_for` ISO with
    offset) to `offersList`, a second on `from + 19 days` to the list step when its count is unknown or above zero (else
    omitted, `words` says why); the month's offer running → a `change` step `{ state: "paused", until }` unless its
    message is the reused one, then `{ params: [words] }`; pacing: `room.open * 2 < audience` → the first `broadcast`
    becomes a `playbook` step `{ trigger: "saved_list", list: offersList, policy_class: "campaign", cap_per_run:
    room.open, gap_days: 90, until, template_id: "@step:1" | <reused id>, trial_until }`; `cover_journey` → one `playbook`
    step per uncovered stage with a moment (`before` → `visit_tomorrow`, `after` → `visited` with `after_visit_review`
    where the world's messages hold the review starter, else `after_visit_check`, `quiet` → the offered win-back,
    `proposal` only where present in `journey`), nothing for `first_contact`.

- [ ] **Step 1: Write the table test** (`plan-of.test.mjs`): at least these rows, each a deep-equal on `steps` (kinds,
  `silent`, `after`, the decisive input fields) and `words`: offer with reusable month's offer; offer needing a new
  message, with and without a WhatsApp number; offer with no email offers (email version omitted, words say it); offer
  with neither channel → `PLAN_WORDS.noChannel` (Review Focus 2); `until < from` → `fromAfterUntil`; `from` in the past
  → `fromPast` (Review Focus 1); list reused by rule not name; second send omitted at count 0; month's offer paused vs
  its params changed; pacing flips the first send to a capped playbook with `until`; `cover_journey` with and without
  a calendar, with and without deals; `resolveSteps` fills `@step:2` and reports `{ unresolved: 2 }` when missing.
- [ ] **Step 2: Run** (R1). Expected: FAIL, module not found.
- [ ] **Step 3: Implement `plan.ts`** (pure; dates via contracts' `localDate`/`addDays` helpers if they exist, else
  `Date` arithmetic in `tz` through `Intl`, as `playbook-schedule.ts` does).
- [ ] **Step 4: Run, R2.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 16: The stamp, the lapse, and `commitPlan`

**Files:**
- Modify: `ct/ask/ask.ts` (`AskPlanStamp = { id: string; step: number; of: number; silent: boolean }`,
  `AskProposal.plan?: AskPlanStamp`, `ASK_PLAN_FRESH_MS = 7 * DAY_MS`, `askCardLapsed` uses it when `p.plan`),
  `ct/ask-proposals/spec.ts` (`PROPOSAL_WORDS.planUndone`, `.waitsForStep(n)`, `.planStopped(n, why)`),
  `bridge/ask/commit.ts` (`commitPlan`; `commitProposal` resolves `@step` tokens before `spec.commit` when `p.plan`)
- Create: `tests/ask/plan/plan-commit.test.mjs`
- Test: `tests/ask/ask-commit.test.mjs` (exists; append the lapse case)

**Interfaces:**
- Consumes: `resolveSteps`, `STEP_TOKEN` (Task 15).
- Produces: `commitPlan(win: Window, cards: AskProposal[], made: Record<number, { kind: string; id: string }>, client?:
  Api, nowMs?: number): Promise<{ results: { step: number; result: CommitResult; id: string | null }[]; stoppedAt:
  number | null }>` — the silent cards sorted by `plan.step`, each committed with `idempotencyKey = plan:<id>:<n>`
  (Review Focus 3), a refusal or failure stops the run and later steps are not sent; `commitProposal(win, p, ...)` with
  `p.plan` and a token in its payload: resolves from `made` (a new parameter `made?`), refuses with
  `PROPOSAL_WORDS.waitsForStep(n)` when unresolved and `PROPOSAL_WORDS.planUndone` when the step's outcome is `undone`
  (Review Focus 4).

- [ ] **Step 1: Failing tests** over a stub `Api` recording calls: three silent cards commit in step order with the
  keys; a failure at step 2 stops before step 3 and `stoppedAt === 2`; a `broadcast` card with `audience_id: "@step:2"`
  commits with the list id once `made[2]` exists and refuses with `waitsForStep` before; an undone step → `planUndone`;
  a stamped card at day 6 is fresh, at day 8 lapsed; an unstamped card at day 2 lapsed (unchanged).
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement** (contracts first, R2; then `commit.ts`, which reads the spec through `proposalSpec(p.kind)` as today).
- [ ] **Step 4: Run `plan-commit`, `ask-commit`, `ask-specs`.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 17: `propose_campaign.plan`: the world, the expansion, one card per step

**Files:**
- Create: `act/plan.ts`, `tests/ask/plan/plan-cards.test.mjs`
- Modify: `act/campaign.ts` (action `plan`), `srv/ask/tools/context.ts` (`ProposalOutcome.proposals?: AskProposal[]`;
  `proposeMany(ps)`), `srv/ask/loop.ts` (where `outcome.proposal` is pushed, ~`:538`: push `outcome.proposals ??
  (outcome.proposal ? [outcome.proposal] : [])`), `act/list.ts`, `act/settings.ts`, `act/broadcast.ts`, `act/playbook.ts`,
  `act/playbook-change.ts`, `act/message.ts` (each accepts a `@step:n` token where it takes an id: `template_id`,
  `list`/`audience_id`, `playbook_id`; skips the existence check for a token and says "made by step n" in the summary),
  registry tests, `ask-specs` (no new kind), `rename-ask-tools.mjs`; fixture (R5)

**Interfaces:**
- Consumes: `planOf`, `PlanWorld` (Task 15); the stamp (Task 16); `messageAction` (Task 9); Tasks 3–5's reads.
- Produces: `planAction` input = `PlanIntent` (zod, two examples: the offer, `cover_journey`), kind `playbook` for the
  registry's purposes (the action makes cards of several kinds; `ActDef.kind` is what the offer per role is judged by:
  `operator`). Run: builds `PlanWorld` through the readers (`templates`, `lists` via `people.lists`' reader, `playbooks`,
  `config` for notes, `openings`, the journey from Task 4's composition, `connections` for the channels), calls
  `planOf`, then for each step calls the sibling handler's `run` with the step's input (tokens included), and returns
  `proposeMany` of the cards each made, stamped `plan: { id: "plan-<uuid>", step: n, of: steps.length, silent }`, the
  tool result listing `{ plan, steps: [{ n, kind, card, silent }], words }`. A step's refusal → the plan's refusal:
  `refuse("Step n (<kind>): <its words>")`. `say` is kept in the note's text and the message's words.

- [ ] **Step 1: Failing tests** over `_fake-db.mjs`: the November offer on a world with an approved email month's
  offer and no WhatsApp number → cards `[note, broadcast, broadcast(list), list]` stamped 1..4 with `silent` true for
  note and list, the second broadcast's `audience_id` `@step:<list>`; the same with no message → a `message` card first
  whose `template_id` the broadcasts reference; a refused step (an `until` in the past) → one refusal naming the step;
  `cover_journey` with a calendar → three `playbook` cards, no silent step; the loop accumulates several cards from one
  call (`ask.test.mjs`'s loop harness).
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement**; the action's `words` (three to four sentences: an offer or a whole setup; the model names
  the intent, never ids or dates to send on; what comes back).
- [ ] **Step 4: Run `plan-cards`, `ask.test.mjs`, `ask-registry` (still ≤ 20 tools), `ask-tool-names`, `ask-tools-size`
  (R1 each), R5.** Expected: PASS; the owner's block under the ceiling (record the number).
- [ ] **Step 5: Commit (R7).**

### Task 18: The group on screen

**Files:**
- Modify: `legacy/pages/ask-turn.jsx` (`?v=` bump one above main's), `legacy/styles/ask.css` (row classes only:
  `.ask-steps`, `.ask-step`, `.ask-step-n`; no new button/card/chip class), `bridge/ask/palette.ts` or where the turn
  hands cards to the page (so `commitPlan` is reachable as `commitProposal` is), `ct/ask/ask-answer.ts` (the count
  sentence: "A plan of N steps and M sends to review", in `claimsWrite`'s rewrite)
- Test: `tests/ask/ask-turn.test.mjs` (exists; append), `tests/ask/ask-answer.test.mjs` (append)

**Interfaces:**
- Consumes: `commitPlan`, the stamp (Task 16).
- Produces: cards sharing `plan.id` draw as one group in step order: a head "Step 1 of 6" per card, one button "Approve
  the N silent steps" above the group (hidden when none is silent; disabled while any is busy), each sending card's
  Approve replaced by "Waits for step n" until `made` holds every step it names; after the group's press, each silent
  card shows its own receipt; a stop shows `planStopped` on the card it stopped at and leaves the rest pressable one by one.

- [ ] **Step 1: Failing tests** (stub React, as `ask-turn.test.mjs` renders): six stamped cards render in step order with
  the heads; the group button's label counts the silent ones; a sending card with an unresolved token shows "Waits for
  step 2"; after `made[2]` is set its Approve shows; the answer's count sentence for a plan.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement** (legacy: one change per line; kit classes for the button and the head's text).
- [ ] **Step 4: Run `ask-turn`, `ask-answer`.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

### Task 19: The prompt knows the plan and the message

**Files:**
- Modify: `srv/ask/prompt.ts` (`ASK_RULES`: the setup rule rewritten per spec §5.7; a new line "A message's words are
  written only through propose_campaign with action message, and every channel's version is on the card"; "For an
  offer, a promotion, or a whole setup, call propose_campaign with action plan once with the intent and leave the steps
  to it; never assemble the steps yourself"; the Campaigns surface line names `plan`), `srv/ask/cross-page.ts` (a setup
  or offer question prefetches `campaigns.journey` and `campaigns.messages` into round 1, as `playbooks`/`audiences` are
  today, `:144-174`)
- Test: `tests/ask/ask.test.mjs` (the prompt pins; append), `tests/ask/ask-context.test.mjs` (the prefetch)

- [ ] **Step 1: Failing tests:** the rules contain the three sentences; "10% off" on `campaigns` prefetches `journey` and
  `messages`.
- [ ] **Step 2: Run** (R1). Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit (R7).**

## P5 Proof

### Task 20: The decision note, the e2e, the docs

**Files:**
- Create: `docs/decisions/0043-a-plan-is-steps-the-server-expands.md` (status, context, decision: amendments 1–7
  above in the note's voice, what would reopen it: a plan outliving a sitting, Ask outside the dashboard), `e2e/ask/plan.spec.ts`
- Modify: `docs/system-prd.md` (the Ask sheet: the actions; the campaigns sheet: `until`, `trial_until`, the breath, the
  review starter), `docs/glossary.md` (Plan; Trial), the spec (an "As built" section listing each amendment and the
  tools-block numbers), `docs/decisions/README.md` (the row)
- Test: `tests/docs/docs-paths.test.mjs` (R1), the decisions index test if one exists

**Interfaces:**
- Produces: `e2e/ask/plan.spec.ts`: on the e2e workspace (its seed holds no WhatsApp number, so a written message is
  email-only), ask for the offer on Campaigns, expect the group with "Approve the N silent steps", press it, expect the
  message in the Library and the note in Settings › Business with "until"; every send route (`POST broadcasts`, `POST
  playbooks`, `PUT playbooks/[id]`) refused and counted as `e2e/waiting-search.ts` refuses answers (asserted 0); undo the
  message. Not run in CI by this lane; run once by hand in Task 21.

- [ ] **Step 1: Write the note, the spec section, the glossary rows, the PRD paragraphs, the e2e.**
- [ ] **Step 2: Run `docs-paths`, the e2e's typecheck (`corepack pnpm --filter e2e typecheck` or the root's).** Expected: PASS.
- [ ] **Step 3: Commit (R7).**

### Task 21: The lane closes: every file's tests, the builds, the real app, and what waits for Ruben

**Files:** none new; a `Bundle:` line and the numbers go in the pull request text drafted at
`docs/superpowers/plans/2026-10-10-ask-the-marketing-manager-pr.md` (uncommitted; Ruben reads it).

- [ ] **Step 1: Fetch and rebase.** `git fetch origin main`; `git rebase origin/main`; a contracts `dist` conflict is
  rebuild + `git add packages/contracts/dist` + `rebase --continue`. If main took 00394 or 00395, renumber both files
  and every reference (`git grep -n "0039[45]"`), regenerate the four generated files (R6), one commit "Migrations
  renumbered after main".
- [ ] **Step 2: Every test file this lane touched** (R1, one per command; the list is this plan's File map).
- [ ] **Step 3: `corepack pnpm check:local`** (the packages' build, typecheck, lint, dead exports, formatting, the tests of
  what the branch changes). Expected: green; it writes the "Checked locally" commit.
- [ ] **Step 4: The dashboard build and the bundle:** `corepack pnpm --filter @chanlytics/dashboard build` then `corepack
  pnpm check:bundle`. Record the route's JS and the Ask page's own JS against the ceilings; write the `Bundle: <why>`
  line (the group's rows and the message card's versions).
- [ ] **Step 5: The real app.** `PORT=3360 corepack pnpm --filter @chanlytics/dashboard dev` (the local server reads
  production's database: use the e2e workspace only, never a customer's), open `/w/<e2e-slug>/campaigns`, ask the offer,
  screenshot the group at 1440 and at 390 wide (the Browser pane), press the silent steps, screenshot the receipts,
  undo the message. Save the screenshots beside the PR text. Stop the server; `git checkout -- apps/dashboard/tsconfig.json`
  if `next dev` rewrote it.
- [ ] **Step 6: The e2e once by hand:** `E2E_BASE_URL=http://localhost:3360 corepack pnpm e2e -- e2e/ask/plan.spec.ts`
  with the e2e owner's session as `e2e/session.ts` reads it. Expected: PASS, 0 sends.
- [ ] **Step 7: Write the PR text** (what changes for a customer; apply migration B before the dashboard; either order
  otherwise; the `Bundle:` line; the tools-block numbers before and after; the screenshots) and **stop**. Nothing is
  pushed. **Waits for Ruben:** the eval run (`E2E_BASE_URL=... REPS=3 node tooling/scripts/eval-ask.mjs`, which spends
  the receptionist's key), his read of the branch, the push and the `suite` label.

## Spec coverage

| Spec | Task |
| --- | --- |
| §5.1 journey, messages, room | 4, 3, 5 |
| §5.2 message writing, `change.params` | 8, 9, 11, 12 |
| §5.3 appointment moments (D2) | 12 |
| §5.4 the plan, tokens, one press, held sends, lapse | 15, 16, 17, 18 (amended: a group of cards) |
| §5.5 note `until`, `playbooks.until`, `trial_until` (D5), the review link | 13, 10, 11, 12, 6, 7 |
| §5.6 the breath | 14 |
| §5.7 the prompt, the measurement | 19, 1, 17 |
| §5.8 the card on screen | 18 |
| §8 evals, e2e, db, contracts, core | 2, 20, 10, 15, 11, 14 |
| §7 P5 proof, the decision note | 20, 21 |
| D4, D6–D10 | no task (out of scope by decision) |

## Open points (the spec and the code, or Ruben's word)

- `card_fields` / `say_any` judge keys (Task 2): if the runner lacks them, the case keeps `tools_any` and the gap is
  listed in Task 21's PR text; adding judge keys is lane 4's Task 20 shape and may be folded into Task 2 if small.
- A CHECK on `broadcast_recipients.reason` (Task 14): the reader found none; verified in the tree before Task 14 ends.
- The listing's writer (Task 6): the sync lives where `maps_uri` is written; if it is on the edge, the column's write
  rides the edge and either deploy order holds (null until written).
- Spend: the e2e's approve files an email version on the e2e workspace (allowed: a real save there is the rule), and
  nothing reaches Meta (no number on the seed); the eval run is Ruben's.
