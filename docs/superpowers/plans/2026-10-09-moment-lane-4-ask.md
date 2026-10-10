# A moment holds many campaigns, lane 4: Ask on the Campaigns page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask sets campaigns going and changes them from the Campaigns page, where a sentence replaces a form and nothing sends at Approve: starters added in one press, a change card through one typed, recorded write, the page's rows as Ask's context, and doors that land.

**Architecture:** One judgement per rule. Contracts hold the bounds (`PLAYBOOK_LIMITS`), the change's keys and words (`playbooks/playbook-patch.ts`) and the card's spec (`playbook_change`); core judges a change against the row (`checkPlaybookPatch`); one migration writes it with its decision in one transaction (the `change_playbook` door, 00357's shape; numbered at build time and renumbered at push, Task 3 and Task 24); `PUT playbooks/[id]` declares a strict union and writes the patch through that door, with today's path for one release where the database lacks it (either deploy order works); Ask's `propose_campaign` gains the action `change` (no new tool); a starter card is checked whole before anything is filed, and fills the starter's own slots; the turn's words, the setup rule, the reads before round 1 and a code guard against a claimed write steer a setup; the browser sends the ledger's rows as the page's context and wears three doors. Evals are written, never run, and the eval workspace's Win-back is seeded only by hand (`--seed-win-back`): merging seeds nothing.

**Tech Stack:** TypeScript (contracts, core, db, the Next dashboard), zod 4 (server only), Supabase Postgres (plpgsql, RLS), node:test over the repo's database in memory (`_fake-db.mjs`) and stub React, Playwright (nightly, not run here).

**Spec:** `docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md` §4.9 (A0–A8), §6 group 4, §7 (Ask), and the report's corrections 46–55 with decisions D3, D4, D7–D9, D21–D35 (`Claude Video/reports/Campaigns ledger backend and Ask flow.md`, research note `research_notes/Campaigns ledger backend and Ask flow/ask_led_setup.md` §2, §4, §8, and `ag_ui_protocols.md` §5–6). M1–M5 are later and not in this plan.

---

## Read this first (the implementer has zero context)

- **Where.** Worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-campaigns-2`, branch
  `campaigns/a-moment-holds-many`. Run every command from that folder. Never `cd` elsewhere, never `git stash`, never
  push. Each task ends in one local commit of the exact files it names.
- **Lanes 1, 2 and 3 ran before you on this branch.** Where a step edits a file one of them made or moved, the step says
  "created in lane N" or "moved in lane N": **read the tree first** (`git log --oneline -40`, then the file). Their code
  wins over this plan's assumption; keep this plan's intent and note the difference in your report. **Main was merged
  in after lane 1** (`39857e8a4`: #1526, Reports' date range, with main's own 00360; #1528), and this plan's `file:line`
  citations were read before that merge (on `7ff179717`): re-read each file before you edit it, find every string and
  block by its words, and treat a line number as a hint. The names they provide that this lane uses:
  - **Main was merged in a second time** (10 Oct, `4b90c5556`, at `f9dc0cdd2`: #1530, #1527 the 9 October audit with
    production's migrations 00361–00371, #1532 Settings › Team), and lane 1's migrations were renumbered after it
    (`373e7046d`): **lane 1's are now 00372 (booking notice), 00373 (counts), 00374 (chains), 00375 (playbooks on the
    realtime topic), and this lane's migration starts at 00376** (still settled again at push, Task 24, if main moves).
    Since main's 00366 a member who is not the owner cannot read `tenant_config`: any config this lane reads goes
    through the dashboard's `config` reader or `configRowOf`, and any write through `tenant_config_write`, never
    `getTenantConfig(ctx.supabase…)` or a table update on a member's session.
  - lane 1 (numbers as first written; see the line above): migrations 00361–00364 after the merge (main's 00360 first; open PR #1527 holds its own 00361–00370 and
    another local branch, cm-glass, 00359/00360: every number is settled at push, Task 24); `packages/db` wrappers
    beside `campaignSeries`, which answer the database's object or `"missing"` on a database before their migration
    (`answerOrMissing`, `isMissingDoor`: this lane's `writePlaybookChange` copies that shape); `playbookRows` (exported from
    `srv/campaigns/playbooks.ts`; Ask's own private helper in `srv/ask/context/pages.ts` is renamed
    `playbookContextRows`, and this plan calls it by that name); the templates
    reader over `template_sends`; `playbooks` on the realtime topic; the throwaway stack (below).
  - lane 2: the four `lifecycle*` modules moved to `packages/contracts/src/playbooks/lifecycle/` (no barrel; the
    playbooks barrel re-exports them); `LIFECYCLE_WORDS` and `LIFECYCLE_TOAST` in
    `packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts`, with **`LIFECYCLE_TOAST.paused`** (`resumed` and
    `changed` already exist, each `(name: string) => LifecycleSentence`); `LifecycleRow` with `kind`, `id`, `name`;
    `CAMPAIGNS_RESULTS_PERIOD = "30d"` in `packages/contracts/src/reports/report-periods.ts` and `fixedDaysOf(period)`
    (a number for a fixed period); core's calendar rule and names in `packages/core/src/campaigns/check-playbook.ts`.
  - lane 3: `apps/dashboard/src/surfaces/campaigns/home/ledger/` and `useLedgerView(ledger, at)`, called **once, in
    `CampaignsHome`** (`home/home-page.tsx`), returning at least `{ status, group, query, sort, visibleGroups,
    visibleRows }`, `visibleRows: readonly LifecycleRow[]` being what the screen shows in order; the first day's hinted
    Turn on (the rail's hinted stage in `home/rail.tsx` on a desk, a group's `add` in `home/ledger/ledger.tsx` and, at
    ≤900px where there is no rail, `home/ledger/ledger-phone.tsx`); the composer address
    `campaigns/new:moment:<trigger>`; decision note 0040. **Lane 3's Task 12C renamed, before you start, words this
    lane moves or writes beside:** "A campaign is running or paused." (`srv/campaigns/playbook-row.ts:86`, pinned at
    `outbound-routes.test.mjs:1051`), "…or move the campaign to another list." (`srv/campaigns/playbooks.ts:431`), the
    bell's `Campaign “…” is ready` title (core `run-playbook.ts` and `vetoRunNotice`; `today-away.ts` reads both
    spellings), and Ask's list card (`ct/ask-proposals/lists.ts:42`). **This lane never writes "playbook" back into a
    word a person reads:** where a step below quotes such a sentence, copy it as the tree has it after lane 3.
- **Short names.** `ct/` = `packages/contracts/src/`, `srv/` = `apps/dashboard/src/server/`, `cmp/` =
  `apps/dashboard/src/surfaces/campaigns/`, `home/` = `cmp/home/`, `act/` = `srv/ask/tools/act/`.
- **Rules that turn a build red** (CLAUDE.md, read it): a value is a token; no raw `<button>`/`<input>` in
  `src/surfaces` (kit only); no `style` prop; durations are named constants; breakpoints only `tokens.css`'s (720, 900);
  a closed set is declared once; a table name or SQL function called by name only inside `packages/db`; browser code
  never imports `src/server` or core; one predicate per rule; tests execute the code they prove.
- **Measured things that may not grow** (`tooling/scripts/tests/baselines/`):
  - `complexity.json` holds `srv/ask/loop.ts::runAskTurn#1` (468 lines, 74 branches, depth 6) and
    `act/playbook.ts::proposePlaybook#1` (138 lines, 33 branches, depth 2). This plan adds **no line and no branch**
    to `runAskTurn` (the claim guard is a helper called on an existing line) and **shrinks** `proposePlaybook` (helpers
    move out); bank the fall (Conventions, R4).
  - `file-length.json`: a file under `apps/` or `packages/` over 800 lines is a new offender.
    `ct/ask/ask-answer.ts` is 782 lines, so `claimsWrite` goes in `ct/ask/answer-text.ts` (69 lines), not there.
  - `tree-shape.json`: a folder at 20 modules takes no 21st. `tooling/scripts/tests/ask/`,
    `tooling/scripts/tests/playbooks/` and `tooling/scripts/tests/broadcasts/` are each at 20. This lane's new tests go
    in two new folders, `tooling/scripts/tests/playbooks/change/` and `tooling/scripts/tests/playbooks/ask-setup/`, and
    in existing files. Count before adding anything else (`ls <dir> | grep -c '\.mjs$'`).
  - `bundle-budget.json`: main's route JS budget is 767,058 of the 768,000-byte ceiling (942 bytes of room after
    #1526; the branch's base had 766,137), and lane 3 spends more of it. This lane's browser bytes (the chips, the
    change card's spec, the scope, the bridge's provider, the Line's words) will take the route past the ceiling, which
    `--raise` cannot cross (`tooling/scripts/checks/bundle-budget.mjs:40-41`): Ruben approved raising it by the measured
    growth (D2), and Task 24 says how. Nothing in this lane imports zod into a browser module: the PUT's union lives in
    `srv/`, the change card's words are a plain contracts module. **Do not run `next build`.** The pull request's CI
    measures; the raise is made with CI's numbers.
  - `writers.json` ("one record, one door writes it"): `playbooks` has 8 writers, and the `change_playbook` door is a
    9th (the measure counts every live SQL function in `supabase/schema.sql` that writes the table; `control-plane.ts`
    stays one through `updatePlaybook` and `removePlaybook`). Task 3 raises it 8 → 9 with its row under "Rises", the
    one rise this lane makes on purpose.
  - `unchecked-index.json` (`tooling/scripts/tests/types/index-reads-are-counted.test.mjs`, which `tests/repo` does not
    run): an index read the compiler lets pass (`rows[0].name`) in a file at 0 is a new offender. Bind it and check it
    (`const [first] = rows; if (!first) …`).
  - `dead-exports.json` (`corepack pnpm check:dead-exports`, knip with no `ignoreExportsUsedInFile`): an export used only
    in its own file, or only by a test through a computed `import()`, counts. Export a name only where another module
    imports it.
  - `source-scan-baseline.json`: `ask/ask.test.mjs` holds 51 source-text assertions and may not gain one.
- **New names.** Every top-level name this plan adds was checked absent on `7ff179717`
  (`git grep -lw <name> -- apps packages tooling e2e`): `PLAYBOOK_LIMITS`, `PLAYBOOK_PATCH_KEYS`, `PLAYBOOK_PATCH_WORDS`,
  `PlaybookPatch`, `playbookNumber`, `checkPlaybookPatch`, `CheckPlaybookPatchPorts`, `PlaybookPatchRow`,
  `writePlaybookChange`, `playbookForChange`, `runningTwins`, `PLAYBOOK_PUT_BODY`, `patchPlaybook`,
  `archivedListRefusal`, `fileStarters`, `withStarterMessage`, `playbookChangeSpec`, `proposePlaybookChange`,
  `playbookChangeAction`, `withoutClaimedWrite`, `CAMPAIGNS_LINE`, `AFTER_APPROVAL_LINE`, `useLedgerOnScreen`,
  `AskDoor`, `SetUpAsk`, `setupCardsFails`, `toolsOrderNote`, `checkPlaybookMoment`, `checkPlaybookMomentInput`,
  `checkStarterPlaybook`, `starterWillHold`, `playbookCheckPorts`, `changeTheOldWay`, `convergeWinBack`. Re-check any
  you add.

## Conventions used by every task

- **R1, run one test file:** `node tooling/scripts/checks/test.mjs <file>` — one file per command. Never the whole
  suite (`corepack pnpm test` takes 20 minutes; Ruben forbade it locally).
- **R2, rebuild a package after editing it:** contracts `corepack pnpm --filter @chanlytics/contracts build`, core
  `corepack pnpm --filter @chanlytics/core build`, db `corepack pnpm --filter @chanlytics/db build`. Tests and the
  dashboard read the committed `dist`, so a test of a package change fails until it is rebuilt; commit the `dist`. After a
  contracts **export** changes, first `node tooling/scripts/gen/contracts-browser-entry.mjs` (it rewrites
  `ct/browser.generated.ts`).
- **R3, check:** `corepack pnpm -r typecheck` (or `--filter <pkg> typecheck`), `corepack pnpm lint`,
  `corepack pnpm exec prettier --write <changed files>` (`apps/dashboard/src/legacy/` is prettier-ignored: leave it
  as written, one change per line, never re-wrapped).
- **R4, bank a fall:** `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` (Git Bash
  syntax; PowerShell: `$env:UPDATE_BASELINES='1'; node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo`), then
  commit the baseline files it changed. A rise is never banked here.
- **R5, regenerate Ask's frozen tools** after any change to a tool's words, schema or examples (the fixture is what
  `ask-registry.test.mjs` holds the model's tools to, byte for byte):

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 SUPABASE_SERVICE_ROLE_KEY=test-only \
  node --conditions=react-server --import tsx --input-type=module -e '
  import fs from "node:fs";
  import { pathToFileURL } from "node:url";
  const { toApiTools } = await import(pathToFileURL("apps/dashboard/src/server/ask/tools/index.ts").href);
  const out = Object.fromEntries(["viewer", "operator", "partner", "owner"].map((r) => [r, toApiTools(r, true)]));
  fs.writeFileSync("tooling/scripts/tests/fixtures/ask-tools-4-7.json", JSON.stringify(out, null, 2) + "\n");
  '
  corepack pnpm exec prettier --write tooling/scripts/tests/fixtures/ask-tools-4-7.json
  ```

  Then `git diff --stat tooling/scripts/tests/fixtures/ask-tools-4-7.json` must show only the task's own words.
- **R6, the throwaway stack (database tasks only).** Never the shared local stack (`supabase_db_chanlytics-messaging`,
  ports 5432x), never `supabase link`, never `db push`, never production. Lane 1 made a throwaway stack: project_id
  `cm-moment-test`, every port +3200 (API `http://127.0.0.1:57521`, db `57522`), in a scratch folder lane 1's plan names
  (`docs/superpowers/plans/2026-10-09-moment-lane-1-*.md`; read it for the path). In the commands below:

  ```bash
  # Lane 1's env file (reconciled 9 Oct): sets SUPABASE_CLI, SUPABASE_WORKDIR, SUPABASE_URL and both keys, and refuses
  # any URL but 127.0.0.1:57521. Source it in the SAME command as every database step: a db suite without SUPABASE_URL
  # and the keys SKIPS (a skip is not a pass: look for `# skip 0`), and `--db` sets no environment.
  ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
  source "$ENV" && STACK="$SUPABASE_WORKDIR" && SUPA="$SUPABASE_CLI"
  ```

  The CLI is the pinned 2.116.0 exe, always called with `--workdir "$STACK"`; a reset is
  `"$SUPA" db reset --local --workdir "$STACK"`, as lane 1's are. **A reset wipes the stack, and other lanes use it (lane
  1 seeds it for timing measurements): reset it only after the coordinator confirms that nobody else is using it, and
  never stop it** (`supabase stop` is the program's teardown, not this lane's). If the stack is stopped (lane 1's Task 20), start it
  with `"$SUPA" start -x studio,imgproxy,mailpit,logflare,vector,edge-runtime,supavisor --workdir "$STACK"`; its keys do
  not change across a restart of the same project, but if a suite answers 401, read them again from
  `"$SUPA" status -o json --workdir "$STACK"` (JSON between the first `{` and the last `}`; `PUBLISHABLE_KEY` is
  `SUPABASE_ANON_KEY`, `SECRET_KEY` is `SUPABASE_SERVICE_ROLE_KEY`). Your shell keeps no variables between commands:
  every database command block starts with the `source` line above.
- **R7, commit:** `git add <exact files>` then

  ```bash
  git commit -m "<what changed, in the repo's sentence style>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

  New untracked files that a barrel or tree test reads through `git ls-files` need `git add -N <files>` before the test
  runs.

## File map

| File | What it holds after this lane | Task |
| --- | --- | --- |
| `ct/playbooks/playbook-triggers.ts` | `PLAYBOOK_LIMITS` beside `PLAYBOOK_HOURS` and `PLAYBOOK_NAME_MAX` | 1 |
| `ct/playbooks/playbook-patch.ts` (new) | `PLAYBOOK_PATCH_KEYS`, `PlaybookPatch`, `PLAYBOOK_PATCH_WORDS` | 1 |
| `ct/playbooks/index.ts` | the new exports | 1 |
| `packages/core/src/campaigns/check-playbook.ts` | `playbookNumber`; `checkPlaybookPatch` beside `checkPlaybookChannels`; `checkPlaybookMoment` (the moment, list and class, out of `checkPlaybook`) | 2 |
| `packages/core/src/campaigns/index.ts` | their exports | 2 |
| `supabase/migrations/<N>_a_playbook_changes_in_one_write.sql` (new; `<N>` the branch's next number at build time, renumbered at push) | `change_playbook`; `decisions_verb_check` with `change_playbook` | 3 |
| `tooling/scripts/tests/baselines/writers.json`, `docs/debt.md` | `playbooks` 8 → 9, with its row under "Rises" | 3 |
| `ct/shared/enums.ts`, `ct/activity/families.ts`, `ct/workspace/activity.ts` | the verb `change_playbook` | 4 |
| `packages/db/src/repositories/control-plane.ts` | `writePlaybookChange` (or `"missing"` before the migration); `setPlaybookState` gone | 5 |
| `packages/db/src/repositories/campaigns/campaign-channels.ts` | `playbookForChange`, `runningTwins` | 5 |
| `apps/dashboard/app/api/v1/playbooks/[id]/route.ts` | `input: PLAYBOOK_PUT_BODY` | 6 |
| `srv/campaigns/playbook-row.ts` | the union, `patchPlaybook`, `changeTheOldWay` (one release), `startNewPlaybook(ctx, req, member)` | 6, 7 |
| `srv/campaigns/playbooks.ts` | `archivedListRefusal`; `checkPlaybookMomentInput` | 6, 7 |
| `tooling/scripts/gen/api-reference.mjs`, `tooling/scripts/tests/routes/api-reference.test.mjs` | a body that is one of several objects, each said | 6 |
| `srv/campaigns/starter-templates.ts` | `checkStarterPlaybook`, `withStarterMessage` (`fileStarters` module-private) | 7, 10 |
| `apps/dashboard/app/api/v1/playbooks/route.ts` | passes `member`; `maxDuration` | 7 |
| `apps/dashboard/src/legacy-bridge/refresh-map.ts` | `POST playbooks` repaints the Library too | 7 |
| `ct/ask/ask.ts` | `playbook_change` kind; `playbook` scope kind; a drawer's scope | 8, 16 |
| `ct/ask-proposals/campaigns.ts`, `proposals.ts` | `playbookChangeSpec`; the playbook card's starter and doors | 8 |
| `act/playbook-change.ts` (new) | `proposePlaybookChange`, `playbookChangeAction` | 9 |
| `act/campaign.ts` | action `change` | 9 |
| `act/playbook.ts` | helpers out of `proposePlaybook`; the starter card; twins; the allowance; neutral words | 10, 13 |
| `act/broadcast.ts`, `act/policy.ts` | the allowance; the policy matrix | 11 |
| `srv/ask/tools/read/campaigns.ts`, `srv/ask/context/pages.ts`, `srv/readers/campaign-report.ts`, `act/playbook-channels.ts` | `last_30_days`; `campaigns`; the report kept a minute across turns; the channels card's row opens its drawer; the ledger's rows | 12, 17 |
| `srv/ask/prompt.ts` | the Campaigns line, the after-approval line, the setup rule, neutral words, "say campaign" | 13 |
| `ct/ask/ask-answer.ts` | the cards' sentence says each is its own press | 13 |
| `srv/ask/cross-page.ts` | setup reads before round 1; a playbook scope's read | 14, 16 |
| `ct/ask/answer-text.ts`, `srv/ask/loop.ts`, `srv/log.ts`, `tooling/scripts/eval-ask-context.mjs` | `claimsWrite` once; the guard; its log line | 15 |
| `apps/dashboard/src/legacy-bridge/ask/context.ts`, `palette.ts` | `OnScreen.key` "campaigns"; the ledger's rows; the chips' input | 17, 18 |
| `ct/ask/ask-suggestions.ts` | Campaigns' chips | 18 |
| `apps/dashboard/src/legacy/pages/ask-text.jsx`, `ask-real.jsx`, `ask-turn.jsx` | the placeholder, the card's word and icon, "Open in the composer" | 18 |
| `act/playbook.ts`, `act/playbook-channels.ts`, `read/campaigns.ts`, `ct/ask-proposals/campaigns.ts`, `ct/ask/ask-answer.ts`, `ct/ask/ask-suggestions.ts`, `ask-text.jsx`, `legacy-bridge/ask/palette.ts` | "campaign" where a person reads "playbook" (D19) | 18B |
| `home/ask-on-campaigns.tsx` (new) | `AskDoor`, `SetUpAsk`, `useLedgerOnScreen` (`ledgerOnScreen` module-private) | 17, 19 |
| `home/home-page.tsx`, `home/rail.tsx`, `home/ledger/ledger.tsx`, `home/ledger/ledger-phone.tsx` (lane 3's), `cmp/playbooks/card-detail.tsx`, `cmp/campaigns.css` | the doors; the first day's door as a slot, desk and phone | 19 |
| `ct/playbooks/lifecycle/lifecycle-words.ts` (moved in lane 2) | `LIFECYCLE_WORDS.ask` | 19 |
| `tooling/scripts/eval-ask.mjs`, `eval-ask-context.mjs`, `tooling/evals/rename-ask-tools.mjs`, `tooling/evals/ask-cases.json` | judge keys, `ADDED_SINCE`, the twelve cases | 9, 20, 21 |
| `tooling/scripts/ops/e2e-workspace.mjs` | a Win-back seeded only under `--seed-win-back`, which the nightly does not pass | 21 |
| `e2e/campaigns/playbooks.spec.ts` (rewritten in lane 3) | Ask's door | 22 |
| `docs/decisions/0041-ag-ui-not-now.md` (new), `docs/decisions/README.md`, `docs/system-prd.md`, `docs/api.md` | the note, its row, Ask's paragraph, the PUT's body | 6, 23 |
| Tests: `tooling/scripts/tests/playbooks/change/{check-playbook-patch,playbook-put,ask-playbook-change}.test.mjs`, `change-playbook.db.test.mjs`; `tooling/scripts/tests/playbooks/ask-setup/{starter-card,twins-and-allowance}.test.mjs` (new); edits to `ask-registry`, `ask-specs`, `ask-tool-names`, `ask`, `ask-turn`, `ask-answer`, `ask-commit`, `ask-context-contract`, `ask-page-context`, `eval-ask-context`, `outbound-routes`, `e2e-workspace`, `campaigns-home`, `rename-ask-tools`, `routes/api-reference` | | each task |


---

### Task 1: The bounds once, and a change's keys and words (contracts)

**Files:**
- Modify: `ct/playbooks/playbook-triggers.ts` (after `PLAYBOOK_HOURS`, line 137 on `7ff179717`)
- Create: `ct/playbooks/playbook-patch.ts`
- Modify: `ct/playbooks/index.ts` (and `ct/playbooks/playbooks.ts` if that is where `PLAYBOOK_HOURS` is re-exported from)
- Create (test): `tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`

`ct/playbooks/` held 15 modules on main; lane 2 moved four into `lifecycle/`. Count it first
(`ls packages/contracts/src/playbooks | grep -c '\.ts$'`); stop and report if it is already 20.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`:

```js
/**
 * A playbook changed in place (the moment spec §4.9 A5): the bounds of its whole numbers said once (contracts
 * PLAYBOOK_LIMITS, read by a new playbook's check and a change's), the six things a change may name, and the words a change
 * card says. Then (Task 2) core checkPlaybookPatch, the one judgement Ask's change card and PUT playbooks/:id both run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAYBOOK_HOURS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
} from "@chanlytics/contracts";

test("the bounds a playbook's whole numbers keep are said once: the hour the sending hours', a cap of 1 to 500, a gap of 7 to 365 days, a cadence of 1 to 90", () => {
  assert.deepEqual(PLAYBOOK_LIMITS, {
    run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
    cap_per_run: { min: 1, max: 500, what: "The cap" },
    gap_days: { min: 7, max: 365, what: "The gap" },
    cadence_days: { min: 1, max: 90, what: "The cadence" },
  });
  assert.equal(PLAYBOOK_NAME_MAX, 80);
});

test("a change names any of six things, in the order a card says them, and says each in the product's words", () => {
  assert.deepEqual(
    [...PLAYBOOK_PATCH_KEYS],
    ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days"],
  );
  const W = PLAYBOOK_PATCH_WORDS;
  assert.deepEqual(
    [W.title({ state: "paused" }, "Win-back"), W.title({ state: "running" }, "Win-back"), W.title({ name: "x" }, "Win-back")],
    ["Pause: Win-back", "Resume: Win-back", "Change: Win-back"],
  );
  assert.equal(W.name("Past clients"), "Renamed “Past clients”");
  assert.equal(W.run_hour(9, 10), "Runs at 9:00 AM by your clock, where it ran at 10:00 AM");
  assert.equal(W.cap_per_run(40, 25), "Up to 40 people a run, where it was 25");
  assert.equal(W.gap_days(60, 90), "Reaches a person again after 60 days, where it was 90");
  assert.equal(W.cadence_days(14, 30), "Every 14 days, where it was every 30");
  assert.equal(W.paused, "Nothing more runs until it is resumed");
  assert.equal(
    W.pausedWaits(12),
    "The run waiting for you (12 people) stays waiting: approve or skip it under Coming up",
  );
  assert.equal(W.pausedWaits(1), "The run waiting for you (1 person) stays waiting: approve or skip it under Coming up");
  assert.equal(
    W.resumed("Re-engage", "ask", "each run waits for you on Today"),
    "Runs again under “Re-engage” (ask): each run waits for you on Today",
  );
  assert.equal(W.same("Win-back"), "“Win-back” already reads so: say so, and change nothing");
});
```

If `W.run_hour(9, 10)` prints the hour another way, the product's clock (`ct/shared/clock.ts` `clockHour`) is the truth:
copy what it prints for 9 and 10 into the assertion.

- [ ] **Step 2: Run it to see it fail**

Run: `git add -N tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`
Expected: FAIL — `PLAYBOOK_LIMITS` (and the patch names) are `undefined`.

- [ ] **Step 3: Add `PLAYBOOK_LIMITS`**

In `ct/playbooks/playbook-triggers.ts`, directly after `export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;`:

```ts
/**
 * The whole numbers a playbook keeps, each with its range and the words a refusal names it by: what a new playbook's
 * check (core checkPlaybook), a change's (core checkPlaybookPatch) and Ask's starter card read, so a bound is written once.
 */
export const PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" },
} as const;
```

- [ ] **Step 4: Create the change's module**

Create `ct/playbooks/playbook-patch.ts`:

```ts
/**
 * A playbook changed in place (the moment spec §4.9 A5, decisions D8, D25, D26): the six things a change may name and the
 * words a change says. The drawer's Pause and Resume, Ask's change card and PUT playbooks/:id's patch body name them from
 * here; core checkPlaybookPatch judges a change against the playbook as it stands; the change_playbook door writes it
 * with its line in the ledger. English, as every card is (Spanish cards are one later lane for all of them, D31).
 */
import { clockHour } from "../shared/clock";
import type { PlaybookState } from "./playbook-triggers";

/** What a change may name, in the order a card says them. */
export const PLAYBOOK_PATCH_KEYS = ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days"] as const;
export type PlaybookPatchKey = (typeof PLAYBOOK_PATCH_KEYS)[number];

/** A change as it is asked or written: any of the six, none required. */
export interface PlaybookPatch {
  state?: PlaybookState;
  name?: string;
  run_hour?: number;
  cap_per_run?: number;
  gap_days?: number;
  cadence_days?: number;
}

/** The words of a change: a card's title and parts, and its refusals. */
export const PLAYBOOK_PATCH_WORDS = {
  title: (p: PlaybookPatch, name: string): string =>
    p.state === "paused" ? `Pause: ${name}` : p.state === "running" ? `Resume: ${name}` : `Change: ${name}`,
  name: (to: string): string => `Renamed “${to}”`,
  run_hour: (to: number, was: number): string =>
    `Runs at ${clockHour(to)} by your clock, where it ran at ${clockHour(was)}`,
  cap_per_run: (to: number, was: number): string => `Up to ${to} people a run, where it was ${was}`,
  gap_days: (to: number, was: number): string => `Reaches a person again after ${to} days, where it was ${was}`,
  cadence_days: (to: number, was: number): string => `Every ${to} days, where it was every ${was}`,
  paused: "Nothing more runs until it is resumed",
  /** D8: a pause leaves the run that waits; skipping it is a second card. */
  pausedWaits: (people: number): string =>
    `The run waiting for you (${people} ${people === 1 ? "person" : "people"}) stays waiting: approve or skip it under Coming up`,
  /** D7: a resume says its class's mode, in full. */
  resumed: (cls: string, mode: string, does: string): string => `Runs again under “${cls}” (${mode}): ${does}`,
  same: (name: string): string => `“${name}” already reads so: say so, and change nothing`,
  nothing: "Name what changes: state, name, run_hour, cap_per_run, gap_days or cadence_days.",
  state: "A campaign is running or paused.",
  nameMissing: "A name needs words.",
  nameLong: (max: number): string => `A name is at most ${max} characters.`,
  /** Only the month's offer runs every N days; every other playbook runs as people reach its moment. */
  cadenceOffer: (name: string): string =>
    `Only the month's offer runs on a cadence; “${name}” runs as people reach its moment.`,
} as const;
```

`state`'s words are the route's own (`srv/campaigns/playbook-row.ts:86`, pinned by `outbound-routes.test.mjs:1051`), as
lane 3's Task 12C renamed them ("A campaign is running or paused."); they move here so core says them. Copy the
sentence from the tree, not from this plan: if 12C has not renamed it, stop and report, never write "playbook" back.
Every other word above is new; none says "playbook".

- [ ] **Step 5: Export them**

Find where `PLAYBOOK_HOURS` reaches the barrel (`git grep -n "PLAYBOOK_HOURS" packages/contracts/src/playbooks/index.ts packages/contracts/src/playbooks/playbooks.ts`)
and add `PLAYBOOK_LIMITS,` right after it in each list that names it. Then in `ct/playbooks/index.ts`, after the
`playbook-channels` export lines:

```ts
export { PLAYBOOK_PATCH_KEYS, PLAYBOOK_PATCH_WORDS } from "./playbook-patch";
export type { PlaybookPatch, PlaybookPatchKey } from "./playbook-patch";
```

- [ ] **Step 6: Regenerate the browser entry and build contracts**

Run: `git add -N packages/contracts/src/playbooks/playbook-patch.ts`
Run: `node tooling/scripts/gen/contracts-browser-entry.mjs`
Run: `corepack pnpm --filter @chanlytics/contracts build`
Expected: both exit 0; `ct/browser.generated.ts` gains the three values.

- [ ] **Step 7: Run the tests**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`
Expected: PASS (2 tests).
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/playbooks packages/contracts/src/browser.generated.ts packages/contracts/dist tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs
git commit -m "A playbook's bounds are said once, and a change's six fields and words beside them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One judgement of a change, for the card and the route (core)

**Files:**
- Modify: `packages/core/src/campaigns/check-playbook.ts` (lane 2 changed `refuseMoment` and the names: read it first)
- Modify: `packages/core/src/campaigns/index.ts` (and `packages/core/src/index.ts` if it lists names)
- Test: `tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`

- [ ] **Step 1: Write the failing tests**

In `check-playbook-patch.test.mjs` add `REACH_OUT_IS_NOT_A_MOMENT` to the contracts import and the line
`import { checkPlaybookPatch, playbookNumber } from "@chanlytics/core";`, then append:

```js
/** A playbook as the database holds it now: a win-back by silence, running at ten, 25 a run, a 90-day gap. */
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Win-back",
  trigger: "quiet_30",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
};
/** Its list is live, or it runs on none: nothing keeps it paused. */
const LIVE = { archivedList: async () => null };
const refusedWith = (p, words) =>
  assert.rejects(p, (e) => {
    assert.equal(e.message, words);
    return true;
  });

test("one whole number by its field's bounds: none sent is the fallback, a number in range is itself, anything else is refused in the save's own sentence", () => {
  assert.equal(playbookNumber("run_hour", undefined, 10), 10);
  assert.equal(playbookNumber("run_hour", "", 10), 10);
  assert.equal(playbookNumber("run_hour", 9, 10), 9);
  assert.equal(playbookNumber("cap_per_run", "40", 25), 40, "a number written as words still counts");
  assert.throws(() => playbookNumber("run_hour", 7, 10), { message: "The hour must be a whole number from 9 to 20." });
  assert.throws(() => playbookNumber("cap_per_run", 9.5, 25), { message: "The cap must be a whole number from 1 to 500." });
  assert.throws(() => playbookNumber("gap_days", 6, 90), { message: "The gap must be a whole number from 7 to 365." });
  assert.throws(() => playbookNumber("cadence_days", 91, 30), {
    message: "The cadence must be a whole number from 1 to 90.",
  });
});

test("a change judged against the playbook as it stands: only what differs is set, and what each set field held is kept for the undo", async () => {
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { state: "paused" }), {
    set: { state: "paused" },
    was: { state: "running" },
  });
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { name: "  Past   clients ", run_hour: 9, cap_per_run: 25 }), {
    set: { name: "Past clients", run_hour: 9 },
    was: { name: "Win-back", run_hour: 10 },
  });
  // Nothing that differs is nothing to write: the card refuses it in words, the route answers what it is.
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { state: "running", run_hour: 10 }), { set: {}, was: {} });
  // The month's offer, and only it, runs on a cadence.
  const offer = { ...ROW, name: "Monthly offer", trigger: "everyone_monthly" };
  assert.deepEqual(await checkPlaybookPatch(LIVE, offer, { cadence_days: 14 }), {
    set: { cadence_days: 14 },
    was: { cadence_days: 30 },
  });
  assert.deepEqual(await checkPlaybookPatch(LIVE, ROW, { gap_days: 60 }), { set: { gap_days: 60 }, was: { gap_days: 90 } });
});

test("a change is refused in the product's words: nothing named, a field it does not know, a state it does not have, an empty name, a name past 80, a number out of bounds, a cadence off the month's offer", async () => {
  await refusedWith(checkPlaybookPatch(LIVE, ROW, {}), PLAYBOOK_PATCH_WORDS.nothing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { trigger: "lapsed" }), PLAYBOOK_PATCH_WORDS.nothing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { state: "sleeping" }), PLAYBOOK_PATCH_WORDS.state);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { name: "   " }), PLAYBOOK_PATCH_WORDS.nameMissing);
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { name: "x".repeat(81) }), PLAYBOOK_PATCH_WORDS.nameLong(80));
  assert.deepEqual((await checkPlaybookPatch(LIVE, ROW, { name: "x".repeat(80) })).set, { name: "x".repeat(80) });
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { run_hour: 21 }), "The hour must be a whole number from 9 to 20.");
  await refusedWith(checkPlaybookPatch(LIVE, ROW, { cadence_days: 14 }), PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
});

test("a resume on an archived list is refused in the port's words, a pause there is not; a reach-out's step is paused or resumed and nothing else", async () => {
  const kept = "Its list, Regulars, is archived. Restore it on People, or move the campaign to another list.";
  const archived = { archivedList: async () => kept };
  const onList = { ...ROW, trigger: "saved_list", state: "paused" };
  await refusedWith(checkPlaybookPatch(archived, onList, { state: "running" }), kept);
  assert.deepEqual(
    (await checkPlaybookPatch(archived, { ...onList, state: "running" }, { state: "paused" })).set,
    { state: "paused" },
    "the port is asked only of a resume",
  );
  const step = { ...ROW, name: "Movers in Austin", trigger: "lead_first" };
  assert.deepEqual((await checkPlaybookPatch(LIVE, step, { state: "paused" })).set, { state: "paused" });
  await assert.rejects(checkPlaybookPatch(LIVE, step, { name: "Renamed" }), (e) => {
    assert.equal(e.message, REACH_OUT_IS_NOT_A_MOMENT);
    assert.equal(e.status, 409);
    return true;
  });
});
```

`lead_first` is a reach-out step's trigger in `outbound-routes.test.mjs`; confirm `triggerOf("lead_first").kind` is
`"reach_out"` (`git grep -n "lead_first" packages/contracts/src/playbooks/playbook-triggers.ts`).

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`
Expected: FAIL — `checkPlaybookPatch is not a function` (and `playbookNumber`).

- [ ] **Step 3: Write `playbookNumber` and read it in `checkPlaybook`**

In `packages/core/src/campaigns/check-playbook.ts`:

1. Add `PLAYBOOK_LIMITS`, `PLAYBOOK_PATCH_KEYS`, `PLAYBOOK_PATCH_WORDS`, `PLAYBOOK_STATES` and `type PlaybookPatch`,
   `type PlaybookPatchKey` to the `@chanlytics/contracts` import. `PLAYBOOK_HOURS` becomes unused: remove it.
2. Replace the `IntRule` interface and the `int` function (lines 56–70 on `7ff179717`) with:

```ts
/**
 * One whole number of a playbook, by its field's bounds (contracts PLAYBOOK_LIMITS): `fallback` when none is sent, and a
 * refusal in the save's own sentence otherwise. A new playbook's check, a change's and Ask's starter card read it.
 */
export function playbookNumber(field: keyof typeof PLAYBOOK_LIMITS, v: unknown, fallback: number): number {
  const { min, max, what } = PLAYBOOK_LIMITS[field];
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}
```

3. In `checkPlaybook`'s return, replace the four `int(...)` calls with:

```ts
    run_hour: playbookNumber("run_hour", body?.run_hour, PLAYBOOK_DEFAULTS.runHour),
    cap_per_run: playbookNumber("cap_per_run", body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun),
    gap_days: playbookNumber("gap_days", body?.gap_days, PLAYBOOK_DEFAULTS.gapDays),
    cadence_days: playbookNumber("cadence_days", body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays),
```

- [ ] **Step 4: Write `checkPlaybookPatch`**

After `checkPlaybookChannels` (before `checkPlaybook`'s doc comment) add:

```ts
/** What a change in place reads beyond the playbook: why its list keeps it paused (decision 0009), or null. */
export interface CheckPlaybookPatchPorts {
  archivedList(row: { id: string; trigger: string }): Promise<string | null>;
}

/** A playbook as a change is judged against it: its row as the database holds it now, never a caller's copy. */
export interface PlaybookPatchRow {
  id: string;
  name: string;
  trigger: string;
  state: string;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
}

/** A name as a change keeps it: trimmed, its runs of space one, never empty and never past the bound (D25). */
function patchName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nameMissing);
  if (name.length > PLAYBOOK_NAME_MAX)
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nameLong(PLAYBOOK_NAME_MAX));
  return name;
}

/** A number a change names, by its field's bounds; undefined where the change names none. */
const patchNumber = (k: keyof typeof PLAYBOOK_LIMITS, v: unknown, was: number): number | undefined =>
  v === undefined ? undefined : playbookNumber(k, v, was);

/**
 * A playbook changed in place (the moment spec §4.9 A5): what Ask's change card proposes and PUT playbooks/:id's patch
 * writes, judged one way. `asked` names any of the six fields (contracts PLAYBOOK_PATCH_KEYS) and nothing else; each is
 * held to its bounds (PLAYBOOK_LIMITS; a name past PLAYBOOK_NAME_MAX is refused, never cut, so a card says exactly what
 * is stored), a cadence to the month's offer, a resume to a list that is not archived (by the port), and a reach-out's
 * step to its state alone (its sheet changes the rest). It answers only what differs from the row as it stands, `set`,
 * and what each of those held, `was`; nothing that differs is `{ set: {}, was: {} }`, which the card refuses in words and
 * the route answers without a write.
 */
export async function checkPlaybookPatch(
  ports: CheckPlaybookPatchPorts,
  row: PlaybookPatchRow,
  asked: Record<string, unknown>,
): Promise<{ set: PlaybookPatch; was: PlaybookPatch }> {
  const keys = Object.keys(asked).filter((k) => asked[k] !== undefined);
  if (keys.length === 0 || keys.some((k) => !(PLAYBOOK_PATCH_KEYS as readonly string[]).includes(k)))
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nothing);
  // A reach-out's step is changed on its own sheet (Reach out, Part 4); here it is paused or resumed, as the sheet's
  // Pause asks, and nothing else.
  if (triggerOf(row.trigger)?.kind === "reach_out" && keys.some((k) => k !== "state"))
    throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  if (asked.state !== undefined && !(PLAYBOOK_STATES as readonly unknown[]).includes(asked.state))
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.state);
  const next: Record<PlaybookPatchKey, unknown> = {
    state: asked.state,
    name: asked.name === undefined ? undefined : patchName(asked.name),
    run_hour: patchNumber("run_hour", asked.run_hour, row.run_hour),
    cap_per_run: patchNumber("cap_per_run", asked.cap_per_run, row.cap_per_run),
    gap_days: patchNumber("gap_days", asked.gap_days, row.gap_days),
    cadence_days: patchNumber("cadence_days", asked.cadence_days, row.cadence_days),
  };
  const set: Record<string, unknown> = {};
  const was: Record<string, unknown> = {};
  for (const k of PLAYBOOK_PATCH_KEYS)
    if (next[k] !== undefined && next[k] !== row[k]) {
      set[k] = next[k];
      was[k] = row[k];
    }
  if (set.cadence_days !== undefined && row.trigger !== "everyone_monthly")
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.cadenceOffer(row.name));
  if (set.state === "running") {
    const archived = await ports.archivedList(row);
    if (archived) throw new AppError("validation", archived);
  }
  return { set: set as PlaybookPatch, was: was as PlaybookPatch };
}
```

`set as PlaybookPatch` is a plain `as` from a `Record`, which the casts ratchet does not count (it counts `as unknown as`,
`as never` and `x!`). If typecheck refuses it, build `set`/`was` as `PlaybookPatch` with one `switch (k)` instead.

- [ ] **Step 4b: The moment, its list and its class, judged on their own (`checkPlaybookMoment`)**

A starter card (Task 7's route, Task 10's card) must be refused for everything a new playbook can be refused for
**before** its starter is filed, since a WhatsApp version sent to Meta cannot be taken back; the message is the one
thing it cannot be judged by until it is on file. So the part of `checkPlaybook` that does not read the message becomes
a function of its own, which `checkPlaybook` calls first, so a new playbook is still judged one way, in the same order
and the same words:

```ts
/** What a new playbook names before its message, judged: its moment (offered here, not a reach-out's step), its list, its class. */
export async function checkPlaybookMoment(
  ports: CheckPlaybookPorts,
  body: Record<string, unknown> | null,
  existing: { trigger: string } | null,
): Promise<{ trig: NonNullable<ReturnType<typeof triggerOf>>; cls: PlaybookPolicyClass; listName: string | null; listKey: string | null; listId: string | null }> {
```

Its body is `checkPlaybook`'s lines from `const trig = …` through `const cls = …` (the trigger's refusal, the reach-out's,
`refuseMoment`, `listOf`, the class), moved whole; `checkPlaybook` then reads
`const { trig, cls, listName, listKey, listId } = await checkPlaybookMoment(ports, body, existing);` where those lines
were. Nothing else in `checkPlaybook` moves, so a body wrong in two ways is refused for the same one as before. The
`existing` parameter's type stays `checkPlaybook`'s (`{ trigger: string; channels?: string[] | null } | null` is
assignable). Export `checkPlaybookMoment` beside `checkPlaybook` in Step 5.

- [ ] **Step 5: Export from core**

In `packages/core/src/campaigns/index.ts` replace

```ts
export { checkPlaybook, checkPlaybookChannels } from "./check-playbook";
export type { PlaybookInput, CheckPlaybookPorts } from "./check-playbook";
```

with

```ts
export {
  checkPlaybook,
  checkPlaybookChannels,
  checkPlaybookMoment,
  checkPlaybookPatch,
  playbookNumber,
} from "./check-playbook";
export type { PlaybookInput, CheckPlaybookPorts, CheckPlaybookPatchPorts, PlaybookPatchRow } from "./check-playbook";
```

If `packages/core/src/index.ts` lists the campaigns names one by one (`git grep -n "checkPlaybookChannels" packages/core/src/index.ts`),
add the same three values and two types there.

- [ ] **Step 6: Build core and run the tests**

Run: `corepack pnpm --filter @chanlytics/core build`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs`
Expected: PASS (6 tests).
The save's bounds now come from contracts; prove nothing about a save moved. List the files that pin it:
`git grep -ln "must be a whole number\|checkPlaybook\b" -- tooling/scripts/tests` and run each with R1 (at least
`tooling/scripts/tests/playbooks/outbound-routes.test.mjs` and `tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`).
Expected: PASS, unchanged: `checkPlaybookMoment` (Step 4b) moved lines, and every refusal of a new playbook is said in
the same order and the same words.

- [ ] **Step 7: Check and commit**

Run: `corepack pnpm --filter @chanlytics/core typecheck` — Expected: exit 0.

```bash
git add packages/core/src/campaigns/check-playbook.ts packages/core/src/campaigns/index.ts packages/core/src/index.ts packages/core/dist tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs
git commit -m "A playbook changed in place is judged once, against the row as it stands, for Ask's card and the route" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One write for a change and its line in the ledger (the `change_playbook` door)

**Files:**
- Create: `supabase/migrations/<N>_a_playbook_changes_in_one_write.sql` (`<N>` below)
- Create (test): `tooling/scripts/tests/playbooks/change/change-playbook.db.test.mjs`
- Regenerate: `supabase/schema.sql`, `packages/db/src/database.types.ts`, `ct/schema-sets.generated.ts`,
  `supabase/migrations-ledger.json` (`docs/data-model.md` lists tables only and should not change; run its gen to prove it)
- Raise: `tooling/scripts/tests/baselines/writers.json` (`playbooks` 8 → 9), with its row under "Rises" in `docs/debt.md`

Read first: `supabase/migrations/00357_a_deal_and_a_playbook_s_start_are_one_write.sql` (the shape copied:
`member_decision`, a function on the caller's rights, re-runnable, grants) and
`supabase/migrations/00326_two_records_of_one_person_become_one.sql:32-45` (how a verb joins `decisions_verb_check`).

**The number.** `<N>` is the branch's highest migration number plus one when you build: `ls supabase/migrations | tail -3`
(after main's merge, lane 1's are 00361–00364, so `<N>` is likely 00365). It is a local number only: open PR #1527
holds 00361–00370, and the push renumbers this file above every number production, main, each remote branch and each
open pull request holds (Task 24). So the prose, the comments and the code name the door, `change_playbook`, never its
number; the file's name and its first comment line (`-- <N> · …`) are the only places `<N>` is written. Below, where a
command needs the file, it reads `MIG=$(ls supabase/migrations/*_a_playbook_changes_in_one_write.sql)`.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/playbooks/change/change-playbook.db.test.mjs`:

```js
/**
 * A playbook changed in place and its line in the ledger are one write (the change_playbook door; the moment spec §4.9
 * A5, decision D26), against the replayed database: on the member's own rights, the row locked, only the columns named set,
 * the decision -- start_playbook, pause_playbook or change_playbook -- written as theirs in the same transaction, and what
 * each set column held answered as `was`. A viewer, a member of another workspace and a playbook of another workspace
 * are told it is not there (P0002), and nothing is written. The suites run as the service role, which passes RLS, so
 * every call here is made as a signed-in member.
 *
 * Runs against a local stack built from every migration. Never production: `supabase start`, then `pnpm test:db` with
 * its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes playbooks and decisions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

let db;
let tenantId;
let elsewhere;
let templateId;
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `change-${Date.now()}`, name: "Change" })
      .select("id")
      .single(),
  ).id;
  elsewhere = ok(
    await db
      .from("tenants")
      .insert({ slug: `change-else-${Date.now()}`, name: "Elsewhere" })
      .select("id")
      .single(),
  ).id;
  templateId = ok(
    await db
      .from("templates")
      .insert({
        tenant_id: tenantId,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        meta_status: "approved",
      })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  for (const t of [tenantId, elsewhere]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

async function signedIn(role, tenant) {
  const email = `change-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { client, id: made.data.user.id };
}

/** A win-back by silence, running at ten, as the service role writes one for the suite. */
const winBack = async () =>
  ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenantId,
        name: "Win-back",
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        policy_class: "reengage",
        state: "running",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        cadence_days: 30,
      })
      .select("id")
      .single(),
  ).id;

const row = async (id) =>
  ok(
    await db
      .from("playbooks")
      .select("name, state, run_hour, cap_per_run, gap_days, cadence_days")
      .eq("id", id)
      .single(),
  );
const decisions = async (id) =>
  ok(
    await db
      .from("decisions")
      .select("verb, actor_user_id, payload")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  );
const change = (who, id, set, over = {}) =>
  who.client.rpc("change_playbook", {
    p_tenant_id: tenantId,
    p_playbook_id: id,
    p_set: set,
    p_decision: { name: "Win-back", ...set },
    ...over,
  });

test(
  "change_playbook: an operator's change writes only what it names and its line in the ledger, as theirs, and answers what each field held",
  { skip },
  async () => {
    const id = await winBack();
    const operator = await signedIn("operator", tenantId);
    const out = ok(await change(operator, id, { name: "Past clients", run_hour: 9 }, { p_via: "ask" }));
    assert.deepEqual(
      [out.id, out.was, typeof out.decision_id, out.undo_dropped],
      [id, { name: "Win-back", run_hour: 10 }, "string", false],
    );
    assert.deepEqual(await row(id), {
      name: "Past clients",
      state: "running",
      run_hour: 9,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
    });
    const [line] = await decisions(id);
    assert.deepEqual(
      [line.verb, line.actor_user_id, line.payload.run_hour, line.payload.via],
      ["change_playbook", operator.id, 9, "ask"],
    );
    // A pause is pause_playbook, a resume start_playbook: the verbs the drawer's switch always wrote.
    ok(await change(operator, id, { state: "paused" }));
    ok(await change(operator, id, { state: "running" }));
    assert.deepEqual(
      (await decisions(id)).map((d) => d.verb),
      ["change_playbook", "pause_playbook", "start_playbook"],
    );
  },
);

test(
  "change_playbook refuses a column outside the six and a change of nothing, and writes neither the row nor a line",
  { skip },
  async () => {
    const id = await winBack();
    const operator = await signedIn("operator", tenantId);
    const before_ = await row(id);
    const strange = await change(operator, id, { template_id: templateId });
    assert.equal(strange.error?.code, "22023", strange.error?.message);
    const empty = await change(operator, id, {});
    assert.equal(empty.error?.code, "22023", empty.error?.message);
    assert.deepEqual(await row(id), before_);
    assert.deepEqual(await decisions(id), []);
  },
);

test(
  "a viewer, a member of another workspace, and a playbook named under another workspace are told it is not there (P0002), and nothing is written",
  { skip },
  async () => {
    const id = await winBack();
    const viewer = await signedIn("viewer", tenantId);
    const stranger = await signedIn("owner", elsewhere);
    const operator = await signedIn("operator", tenantId);
    for (const [who, over] of [
      [viewer, {}],
      [stranger, {}],
      [stranger, { p_tenant_id: elsewhere }],
      [operator, { p_tenant_id: elsewhere }],
    ]) {
      const r = await change(who, id, { state: "paused" }, over);
      assert.equal(r.error?.code, "P0002", r.error?.message);
    }
    assert.equal((await row(id)).state, "running");
    assert.deepEqual(await decisions(id), []);
  },
);
```

- [ ] **Step 2: Run it against the throwaway stack to see it fail**

Run (Git Bash, one command; `ENV` is R6's path, lane 1's env file):

```bash
source "$ENV" && echo "$SUPABASE_URL" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/change-playbook.db.test.mjs
```

Expected: FAIL — `Could not find the function public.change_playbook` (PGRST202). `SUPABASE_URL` must be
`http://127.0.0.1:57521`; if it is anything else, stop: that is not the throwaway stack.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<N>_a_playbook_changes_in_one_write.sql` (`<N>` as above):

```sql
-- <N> · A playbook changed in place and its line in the ledger are one write.
--
-- PUT playbooks/:id wrote a pause as two statements on the member's session, the state and then the route's own insert
-- into `decisions`, neither counted: a decision that failed left a playbook paused with nobody on record as having paused
-- it, and an update RLS refused raised nothing and answered success (the 8 October architecture review; the moment spec
-- §4.9 A5, decision D26). A rename or a new hour was rewritten whole, with no line at all. This is the one door for a
-- change in place, in 00357's shape:
--
--   change_playbook   the member's one call: the row, locked, on the CALLER's rights (security invoker, so the table's
--                     update policy and column grants judge it as the route's update was judged), only the columns
--                     p_set names written, then the decision as theirs (member_decision, 00357) in one transaction.
--                     The verb is start_playbook or pause_playbook where the state moves, as the drawer's switch always
--                     wrote, else change_playbook. It answers the row's id, what each written column held (`was`, read
--                     under the lock, so an undo puts back what was there), the decision's id and undo_dropped. A
--                     playbook the caller cannot see or change, or that is not the workspace's, is P0002, and nothing is
--                     written: a forbidden update raises nothing, so the row is locked first and the update counted.
--                     What a change may name, and each value's bounds, is core's checkPlaybookPatch before this is
--                     called; the six columns are held here too, so a caller can never write a seventh.
--   decisions_verb_check   00326's list, with 'change_playbook'.
--
-- Deploy order: either. A dashboard that finds no change_playbook here (PGRST202) writes the change the way it did
-- before, for one release (packages/db writePlaybookChange answers "missing"); the dashboard from before this keeps its
-- two statements and is not broken by it. Re-runnable.

/* ----------------------------------------------------------------------------------------------- the verb -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (
  verb = any (array[
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over',
    'hand_back', 'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent',
    'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
    'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
    'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list',
    'rename_list', 'change_list_rule', 'add_to_list', 'drop_from_list', 'archive_list', 'restore_list',
    'delete_list', 'import', 'open_recording', 'merge', 'change_playbook'
  ])
);

/* ----------------------------------------------------------------------------------------------- the door -- */

create or replace function public.change_playbook(
  p_tenant_id uuid,
  p_playbook_id uuid,
  p_set jsonb,
  p_decision jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_set   jsonb := case when jsonb_typeof(p_set) = 'object' then p_set else '{}'::jsonb end;
  v_was   public.playbooks;
  v_rows  integer;
  v_verb  text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_playbook_id is null then
    raise exception 'change_playbook: a playbook is named by its workspace and its id' using errcode = '22004';
  end if;
  -- The six columns a change may name, and nothing else: a key outside them is refused, never ignored.
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days or cadence_days'
      using errcode = '22023';
  end if;
  -- The row as it stands, locked until the transaction ends, read on the caller's rights: another workspace's row, or
  -- one their role may not change, is no row.
  select * into v_was
    from public.playbooks
   where id = p_playbook_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  update public.playbooks p
     set state        = coalesce(v_set ->> 'state', p.state),
         name         = coalesce(v_set ->> 'name', p.name),
         run_hour     = coalesce((v_set ->> 'run_hour')::integer, p.run_hour),
         cap_per_run  = coalesce((v_set ->> 'cap_per_run')::integer, p.cap_per_run),
         gap_days     = coalesce((v_set ->> 'gap_days')::integer, p.gap_days),
         cadence_days = coalesce((v_set ->> 'cadence_days')::integer, p.cadence_days)
   where p.id = p_playbook_id and p.tenant_id = p_tenant_id;
  -- A forbidden update raises nothing: counted, so a change the policy refused is never answered as made.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  v_verb := case v_set ->> 'state'
              when 'running' then 'start_playbook'
              when 'paused' then 'pause_playbook'
              else 'change_playbook'
            end;
  return jsonb_build_object(
           'id', p_playbook_id,
           'was', (select jsonb_object_agg(k, to_jsonb(v_was) -> k) from jsonb_object_keys(v_set) k))
      || public.member_decision(p_tenant_id, 'playbook', p_playbook_id, v_verb, coalesce(p_decision, '{}'::jsonb),
                                p_via, p_undo_of);
end $$;

revoke execute on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated, service_role;
comment on function public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A member changes a playbook in place and its line in the ledger together (the change_playbook door): the row locked on the caller''s rights, only the columns p_set names written (state, name, run_hour, cap_per_run, gap_days, cadence_days), then start_playbook, pause_playbook or change_playbook as theirs (member_decision), in one transaction. P0002 where the caller cannot see or change the row. Returns id, was (what each written column held), decision_id and undo_dropped.';
```

Before saving, compare the verb list with `supabase/schema.sql`'s current `decisions_verb_check` (the line that starts
`CONSTRAINT decisions_verb_check`, about line 21157 after lane 1, and every migration main or lane 1 added, if any
touched it): the list must be exactly that one plus `'change_playbook'`.

A SECURITY DEFINER function that reads `memberships` must gate a partner's seat; this one is SECURITY INVOKER and reads
no membership itself (`member_decision`, 00357, does), so `NOT_A_SEATS_DOOR` does not need it. If
`tooling/scripts/tests/database/*seat*` or `privileges.db.test.mjs` lists every function that writes `decisions`, add it
there as 00357's `start_playbook` is listed (`git grep -n "start_playbook" -- tooling/scripts/tests/database`).

- [ ] **Step 4: Replay the throwaway stack with it and run the test**

**First, ask the coordinator and wait for the answer:** a reset wipes the throwaway stack, which lane 1 seeds for its
timing measurements and other lanes may be using. Reset only once the coordinator confirms nobody else is using it.
Never stop the stack (R6).

Then check that the scratch folder's migrations are the branch's, every one of them (main's 00360 and lane 1's
renumbered files included), and nothing else:

```bash
source "$ENV" && diff -rq supabase/migrations "$SUPABASE_WORKDIR/supabase/migrations"
```

Expected: only `Only in supabase/migrations: <N>_a_playbook_changes_in_one_write.sql`. Any other line is a stale,
missing or extra copy: copy the branch's file over it (or remove the extra one from the scratch folder) and run the diff
again before the reset.

```bash
source "$ENV" && STACK="$SUPABASE_WORKDIR" && SUPA="$SUPABASE_CLI" && MIG=$(ls supabase/migrations/*_a_playbook_changes_in_one_write.sql) && cp "$MIG" "$STACK/supabase/migrations/" && "$SUPA" db reset --local --workdir "$STACK" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/change-playbook.db.test.mjs
```

(`ENV` is R6's path.) Expected: the reset replays every migration and `seed.sql` without error; the suite PASSES (3
tests, `# skip 0`). `db reset` is only ever run with `--workdir "$STACK"`.

The database suites that list who may call what were written against 00357's functions: run each that names
`start_playbook` against the same stack (`git grep -ln "start_playbook\|member_decision" -- tooling/scripts/tests/database tooling/scripts/tests/playbooks`,
each with `source "$ENV" && node tooling/scripts/checks/test.mjs <file>` in one command; at least `database/privileges.db.test.mjs` and
`playbooks/playbook-on-any-list.db.test.mjs`). Expected: PASS; where one enumerates the functions `authenticated` may
execute and fails on `change_playbook`, add it there beside `start_playbook`, as 00357's commit added that one.

- [ ] **Step 5: Regenerate from the clean replay**

The replay above is clean and after the last edit of the migration (re-running a migration by hand reorders grants: if
you edit the migration again, copy and reset again first, with the coordinator's word again).

```bash
source "$ENV" && corepack pnpm gen:schema-snapshot && corepack pnpm gen:db-types && corepack pnpm gen:schema-sets && corepack pnpm gen:data-model && node tooling/scripts/checks/migration-ledger.mjs --record
```

(The env file exports `SUPABASE_CLI` and `SUPABASE_WORKDIR`, which the gens read. Lane 1 regenerated these files
after its own and main's migrations: what moves now is this migration's alone.)

Expected: `supabase/schema.sql` gains `change_playbook` and the widened check; `database.types.ts` gains
`change_playbook` under `Functions`; `schema-sets.generated.ts` gains `"change_playbook"` in `decisions.verb`;
`docs/data-model.md` is unchanged (`git diff --stat docs/data-model.md` prints nothing); the ledger appends `<N>`.
Then run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migration-ledger.test.mjs` — Expected: PASS.

**The writers' rise.** `schema.sql` now holds a 9th live writer of `playbooks` (`change_playbook()`; the measure is
`writersByTable` in `tooling/scripts/tests/_measures.mjs`), so `writers.json` rises 8 → 9 (`control-plane.ts` still
writes the table through `updatePlaybook` and `removePlaybook`, so no writer leaves). It is the one rise this lane makes
on purpose, argued as #1527 argued its two:

```bash
UPDATE_BASELINES=raise node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo
git diff --stat tooling/scripts/tests/baselines
```

Expected: `writers.json` alone moved, `"playbooks": 8` → `9`. Anything else that rose is not this rise: restore that
baseline file as it was (`git checkout -- <that file>`) and report it. Add
the row under "Rises" in `docs/debt.md`, inside the table's column widths: "`writers.json` playbooks 8 → 9 · the
change_playbook door: a change in place and its decision in one transaction, the drawer's Pause and Resume, Ask's
change card and the reach-out sheet's Pause through it; the route's two uncounted statements and `setPlaybookState`
leave (Task 6)". Then `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs`
for the register's figures, and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` — Expected: PASS.
Do not commit yet: Task 4 makes the new closed-set member compile.

- [ ] **Step 6: Commit (with Task 4)**

This task's commit is made at the end of Task 4, which the regenerated `schema-sets.generated.ts` needs to compile.

---

### Task 4: The verb `change_playbook` in contracts' closed sets and Settings › Activity

**Files:**
- Modify: `ct/shared/enums.ts` (the decisions verbs, after `"pause_playbook"`, about line 629)
- Modify: `ct/activity/families.ts` (after `pause_playbook: "campaigns",`)
- Modify: `ct/workspace/activity.ts` (after `pause_playbook: "Paused a campaign",` (lane 3 Task 12C renamed it from "Paused a playbook"))
- Test: the activity and enum tests that iterate the verbs

- [ ] **Step 1: See what fails**

Run: `corepack pnpm --filter @chanlytics/contracts typecheck`
Expected: FAIL where a `Record` keyed by the decisions verb lacks `change_playbook` (families, the activity words), or
PASS if none is exhaustive. Then list the tests that hold the verb set:
`git grep -ln "pause_playbook" -- tooling/scripts/tests` and run each with R1. Expected: at least one FAIL naming
`change_playbook` (the enums held to the schema's closed set).

- [ ] **Step 2: Add the verb**

In `ct/shared/enums.ts`, replace

```ts
  /** A playbook started or paused: subject 'playbook'. Its runs are send_broadcast rows. */
  "start_playbook",
  "pause_playbook",
```

with

```ts
  /** A playbook started or paused: subject 'playbook'. Its runs are send_broadcast rows. */
  "start_playbook",
  "pause_playbook",
  /**
   * A playbook changed in place (the change_playbook door): its name, hour, cap, gap or cadence. Subject 'playbook'; the
   * payload names what changed. A pause or a resume stays pause_playbook or start_playbook.
   */
  "change_playbook",
```

In `ct/activity/families.ts`, after `pause_playbook: "campaigns",` add `change_playbook: "campaigns",`.
In `ct/workspace/activity.ts`, after `pause_playbook: "Paused a campaign",` (lane 3 Task 12C renamed it from "Paused a playbook") add `change_playbook: "Changed a campaign",`.
If `ct/activity/lines.ts` or `ct/activity/tones.ts` keeps an exhaustive record of verbs (the compiler says), add
`change_playbook` there beside `pause_playbook` with `start_playbook`'s line and no tone of its own.

- [ ] **Step 3: Build, regenerate the browser entry and run the tests**

Run: `node tooling/scripts/gen/contracts-browser-entry.mjs` then `corepack pnpm --filter @chanlytics/contracts build`
Run: `corepack pnpm --filter @chanlytics/contracts typecheck` — Expected: exit 0.
Run each file Step 1 listed with R1. Expected: PASS.

- [ ] **Step 4: Commit Tasks 3 and 4**

```bash
git add supabase/migrations/*_a_playbook_changes_in_one_write.sql supabase/schema.sql supabase/migrations-ledger.json packages/db/src/database.types.ts packages/contracts/src/schema-sets.generated.ts packages/contracts/src/shared/enums.ts packages/contracts/src/activity packages/contracts/src/workspace/activity.ts packages/contracts/src/browser.generated.ts packages/contracts/dist tooling/scripts/tests/playbooks/change/change-playbook.db.test.mjs tooling/scripts/tests/baselines/writers.json docs/debt.md
git commit -m "A playbook changed in place and its line in the ledger are one write, on the member's own rights" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add, by name, any database suite Task 3's Step 4 extended, `docs/takeover.md` if the register's bank wrote it, and
`docs/data-model.md` only if its gen changed it.)

---

### Task 5: The database's calls for a change, a change's row and a running twin (packages/db)

**Files:**
- Modify: `packages/db/src/repositories/control-plane.ts` (beside `startPlaybook`, line 313)
- Modify: `packages/db/src/repositories/campaigns/campaign-channels.ts` (beside `playbookForChannels`, line 81)
- Modify: `packages/db/src/index.ts` (the `campaign-channels` and `control-plane` export lists, lines 222–231 and 330–339)

- [ ] **Step 1: Write `writePlaybookChange`, and take `setPlaybookState` out**

In `control-plane.ts`, after `startPlaybook`, add:

```ts
/**
 * Change a playbook in place with its line in the ledger (the change_playbook door), on the member's own session: the
 * row locked, only the columns `set` names written, then the decision (start_playbook, pause_playbook or
 * change_playbook) as theirs, in one transaction. What each written column held comes back as `was`. A playbook the
 * caller cannot see or change is the database's P0002, which the caller words; an answer without its row and its
 * decision is a door that is not this one, and throws. `"missing"` on a database before the door's migration
 * (isMissingDoor), where the dashboard writes the change the way it did before, for one release, so either deploy order
 * works (the counts doors' rule, reports/report-series.ts answerOrMissing).
 */
export async function writePlaybookChange(
  db: Db,
  p: { tenantId: string; playbookId: string; set: Json; decision: Json; via: string | null; undoOf: string | null },
): Promise<
  | {
      data: { id: string; was: Record<string, unknown>; decisionId: string } | null;
      error: PostgrestError | null;
    }
  | "missing"
> {
  const { data, error } = await db.rpc("change_playbook", {
    p_tenant_id: p.tenantId,
    p_playbook_id: p.playbookId,
    p_set: p.set,
    p_decision: p.decision,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) return isMissingDoor(error) ? "missing" : { data: null, error };
  const made = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (typeof made.id !== "string" || typeof made.decision_id !== "string")
    throw new Error("change_playbook: the door answered without its row and its decision");
  const was = made.was !== null && typeof made.was === "object" && !Array.isArray(made.was) ? made.was : {};
  return { data: { id: made.id, was: was as Record<string, unknown>, decisionId: made.decision_id }, error: null };
}
```

Import `isMissingDoor` from `./templates` at the top of `control-plane.ts` if it is not there yet (`report-series.ts`
imports it the same way). Add `writePlaybookChange` to `packages/db/src/index.ts`'s control-plane export list.
(`setPlaybookState` stays until Task 6 takes its one caller away, then goes with it; the one-release path writes through
`updatePlaybook`, which stays.)

- [ ] **Step 2: Write `playbookForChange` and `runningTwins`**

In `campaign-channels.ts`, after `playbookForChannels`, add:

```ts
type PlaybookRowOf = Database["public"]["Tables"]["playbooks"]["Row"];

/**
 * One playbook as a change in place is judged against it (core checkPlaybookPatch; Ask's change card, PUT
 * playbooks/:id's patch): its row under the caller's RLS, and the run of it that waits for approval, with how many it is
 * for, which a pause leaves waiting (D8). Null where the workspace has no such playbook. A reach-out's root is one too:
 * its sheet's Pause is a change of its state.
 */
export async function playbookForChange(
  db: Db,
  tenantId: string,
  playbookId: string,
): Promise<
  | (Pick<
      PlaybookRowOf,
      | "id"
      | "name"
      | "trigger"
      | "state"
      | "policy_class"
      | "run_hour"
      | "cap_per_run"
      | "gap_days"
      | "cadence_days"
      | "list_id"
      | "list_key"
    > & { waiting: { id: string; recipient_count: number } | null })
  | null
> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, trigger, state, policy_class, run_hour, cap_per_run, gap_days, cadence_days, list_id, list_key")
    .eq("tenant_id", tenantId)
    .eq("id", playbookId)
    .maybeSingle();
  if (error) throw new Error(`playbook_for_change: ${error.message}`);
  if (!data) return null;
  const waiting = await db
    .from("broadcasts")
    .select("id, recipient_count")
    .eq("tenant_id", tenantId)
    .eq("playbook_id", playbookId)
    .eq("state", "pending_approval")
    .limit(1);
  if (waiting.error) throw new Error(`playbook_for_change: ${waiting.error.message}`);
  const w = (waiting.data ?? [])[0];
  return { ...data, waiting: w ? { id: w.id, recipient_count: w.recipient_count } : null };
}

/**
 * The running playbooks of a workspace on one moment, list and message (the moment spec, D9): a second "set up my
 * campaigns" proposed a twin win-back, which the week's breath then left reaching nobody. Each by its id and name.
 */
export async function runningTwins(
  db: Db,
  tenantId: string,
  on: { trigger: string; listId: string | null; listKey: string | null; templateId: string },
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, name, list_id, list_key")
    .eq("tenant_id", tenantId)
    .eq("state", "running")
    .eq("trigger", on.trigger)
    .eq("template_id", on.templateId);
  if (error) throw new Error(`running_twins: ${error.message}`);
  // The same list, or none on both: a moment's playbooks name no list, a list's name exactly one of the two.
  return (data ?? [])
    .filter((p) => (p.list_id ?? null) === on.listId && (p.list_key ?? null) === on.listKey)
    .map((p) => ({ id: p.id, name: p.name }));
}
```

Add `playbookForChange,` and `runningTwins,` to `packages/db/src/index.ts`'s `campaign-channels` export list.

- [ ] **Step 3: Build and check**

Run: `corepack pnpm --filter @chanlytics/db build` — Expected: exit 0.
Run: `corepack pnpm --filter @chanlytics/db typecheck` — Expected: exit 0.
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` — Expected: exit 0 (nothing reads the new calls yet).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/control-plane.ts packages/db/src/repositories/campaigns/campaign-channels.ts packages/db/src/index.ts packages/db/dist
git commit -m "The database's calls for a change in place, the row it is judged against, and a running twin" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: `PUT playbooks/[id]` declares its three bodies and writes a change through one door

**Files:**
- Modify: `apps/dashboard/app/api/v1/playbooks/[id]/route.ts`
- Modify: `srv/campaigns/playbook-row.ts`
- Modify: `srv/campaigns/playbooks.ts` (`refuseOnArchivedList`, line 420 after lane 1)
- Modify: `packages/db/src/repositories/control-plane.ts`, `packages/db/src/index.ts` (`setPlaybookState` goes)
- Modify: `tooling/scripts/gen/api-reference.mjs` (`fieldRows`: a body that is one of several objects), with its test
  `tooling/scripts/tests/routes/api-reference.test.mjs`
- Create (test): `tooling/scripts/tests/playbooks/change/playbook-put.test.mjs`
- Modify (test): `tooling/scripts/tests/playbooks/outbound-routes.test.mjs` (the one-playbook test, line 1035, and `ctxFor`, line 103)
- Regenerate: `apps/dashboard/src/client/routes.generated.ts` (if it changes), `docs/api.md`

Today the PUT declares no input, tells its bodies apart by counting keys, and writes a pause as two uncounted statements
(`srv/campaigns/playbook-row.ts:77-146`). After this task: a strict `z.union([patch, channels, whole])` on the route, all
of it in `srv/` (no browser module imports zod for it); a patch is judged by core `checkPlaybookPatch` and written by
`writePlaybookChange` (the change_playbook door), or, on a database before the door's migration, the way it was written
before, for one release (`changeTheOldWay`: either deploy order works); the channels and whole bodies keep their code.
The refusals a member reads keep the words lane 3's Task 12C gave them ("A campaign is running or paused.", "…or move
the campaign to another list."): copy them from the tree.

- [ ] **Step 1: Write the failing door test**

Create `tooling/scripts/tests/playbooks/change/playbook-put.test.mjs`:

```js
/**
 * PUT playbooks/:id, run through route() with the database in memory (the moment spec §4.9 A5, decision D26). The route
 * declares its body: a change in place (any of state, name, run_hour, cap_per_run, gap_days, cadence_days), the channels
 * alone, or the whole playbook, and no other key. A change is judged against the playbook as it stands (core
 * checkPlaybookPatch) and written with its line in the ledger in one call (the change_playbook door, modelled below),
 * which answers what each field held; nothing to change writes nothing. On a database before the door (PGRST202) the
 * same change is written as it was before, for one release, and answers the same: either deploy order works.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { PLAYBOOK_PATCH_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const playbook = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
beforeEach(() => setRateStore(memoryStore()));
afterEach(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const K1 = "99999999-9999-4999-8999-999999999991";
const K2 = "99999999-9999-4999-8999-999999999992";
const L1 = "66666666-6666-4666-8666-666666666661";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });

/** A win-back by silence in Bayside, running at ten, 25 a run, a 90-day gap; and one of Harbor's, where they are a viewer. */
const row = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const world = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  playbooks: [row(K1, A), row(K2, B)],
  broadcasts: [],
  segments: [],
  decisions: [],
  events: [],
  ...over,
});

/** The change_playbook door in memory: the columns named written, the decision as theirs, what each held answered. */
const changeDoor = (tables) => ({
  change_playbook: (a) => {
    const p = tables.playbooks.find((x) => x.id === a.p_playbook_id && x.tenant_id === a.p_tenant_id);
    if (!p) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
    const was = Object.fromEntries(Object.keys(a.p_set).map((k) => [k, p[k]]));
    Object.assign(p, a.p_set);
    const verb =
      a.p_set.state === "running" ? "start_playbook" : a.p_set.state === "paused" ? "pause_playbook" : "change_playbook";
    const decision = {
      id: `decision-${tables.decisions.length + 1}`,
      tenant_id: a.p_tenant_id,
      subject_type: "playbook",
      subject_id: p.id,
      verb,
      actor_user_id: USER,
      payload: { ...(a.p_decision ?? {}), ...(a.p_via ? { via: a.p_via } : {}) },
      undo_of: a.p_undo_of ?? null,
    };
    tables.decisions.push(decision);
    return { id: p.id, was, decision_id: decision.id, undo_dropped: false };
  },
});
/** A database before the door's migration: PostgREST's answer for a function it does not hold. */
const noDoor = () => ({
  change_playbook: () => {
    throw Object.assign(new Error("Could not find the function public.change_playbook"), { code: "PGRST202" });
  },
});
const ctxFor = (tables, id, door = changeDoor) => ({
  supabase: fakeDb(tables, {}, door(tables)),
  userId: USER,
  email: "ada@example.com",
  params: { id },
});
const put = (tables, id, body, door = changeDoor) =>
  playbook.PUT.run(
    new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(body) }),
    ctxFor(tables, id, door),
  );
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the route declares its body: a change in place, the channels alone, or the whole playbook, and never another key", () => {
  const body = playbook.PUT.input;
  assert.ok(body, "an input the API reference is written from");
  for (const ok of [
    { state: "paused" },
    { name: "Past clients", run_hour: 9 },
    { channels: ["whatsapp", "email"] },
    { name: null, trigger: "quiet_30", template_id: "t", params: [], run_hour: 10, cap_per_run: 25 },
  ])
    assert.equal(body.safeParse(ok).success, true, JSON.stringify(ok));
  for (const no of [{ name: "x", template: "y" }, { channels: ["sms"], name: "x" }, { trigger: "quiet_30" }, "paused"])
    assert.equal(body.safeParse(no).success, false, JSON.stringify(no));
});

test("a change in place: judged against the row as it stands, written with its line in the ledger in one call, answering what each field held", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  const out = await put(tables, K2, { name: "  Past   clients ", run_hour: 9 });
  assert.deepEqual(out, {
    id: K2,
    name: "Past clients",
    state: "running",
    was: { name: "Win-back", run_hour: 10 },
    decision_id: "decision-1",
  });
  const p = tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual([p.name, p.run_hour, p.cap_per_run], ["Past clients", 9, 25]);
  assert.deepEqual(
    tables.decisions.map((d) => [d.verb, d.payload.name, d.payload.run_hour]),
    [["change_playbook", "Past clients", 9]],
  );
  assert.deepEqual(tables.events, [], "the decision is the change's line: no second record of it");
  // The undo is the same door with what it held.
  const back = await put(tables, K2, out.was);
  assert.deepEqual([back.name, back.was], ["Win-back", { name: "Past clients", run_hour: 9 }]);
  // A pause is pause_playbook; the same state again is nothing written.
  const paused = await put(tables, K2, { state: "paused" });
  assert.deepEqual([paused.state, paused.was], ["paused", { state: "running" }]);
  assert.deepEqual(await put(tables, K2, { state: "paused" }), { id: K2, name: "Win-back", state: "paused", was: {} });
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["change_playbook", "change_playbook", "pause_playbook"],
  );
});

test("a change is refused in the product's words before anything is written: a state it does not have, a number out of bounds, a name past 80, a cadence off the month's offer, a resume on an archived list", async () => {
  const tables = world({
    playbooks: [
      row(K1, A),
      row(K2, B),
      row("99999999-9999-4999-8999-999999999993", B, { trigger: "saved_list", list_id: L1, state: "paused" }),
    ],
    segments: [{ id: L1, tenant_id: B, name: "Regulars", archived_at: "2026-09-01T00:00:00Z", rule: null }],
  });
  setServiceClient(fakeDb(tables));
  await refused(put(tables, K2, { state: "sleeping" }), "validation", 400, PLAYBOOK_PATCH_WORDS.state);
  await refused(put(tables, K2, { run_hour: 7 }), "validation", 400, "The hour must be a whole number from 9 to 20.");
  await refused(put(tables, K2, { name: "x".repeat(81) }), "validation", 400, PLAYBOOK_PATCH_WORDS.nameLong(80));
  await refused(put(tables, K2, { cadence_days: 14 }), "validation", 400, PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
  await refused(put(tables, K2, {}), "validation", 400, PLAYBOOK_PATCH_WORDS.nothing);
  await refused(
    put(tables, "99999999-9999-4999-8999-999999999993", { state: "running" }),
    "validation",
    400,
    "Its list, Regulars, is archived.",
  );
  await refused(put(tables, K1, { state: "paused" }), "forbidden", 403);
  assert.deepEqual(tables.decisions, []);
  assert.equal(tables.playbooks.find((x) => x.id === K2).run_hour, 10);
});

test("either deploy order works: on a database before the change_playbook door, a change is written as it was before, for one release, its record the one that database takes, and the same answer", async () => {
  const tables = world();
  setServiceClient(fakeDb(tables));
  const out = await put(tables, K2, { name: "Past clients", run_hour: 9 }, noDoor);
  assert.deepEqual(
    [out.id, out.name, out.state, out.was, out.decision_id],
    [K2, "Past clients", "running", { name: "Win-back", run_hour: 10 }, null],
  );
  const p = tables.playbooks.find((x) => x.id === K2);
  assert.deepEqual([p.name, p.run_hour], ["Past clients", 9]);
  // That database's ledger has no change_playbook: a rename or a new hour is the event the whole rewrite always wrote.
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.fields]),
    [["playbook.changed", ["name", "run_hour"]]],
  );
  const paused = await put(tables, K2, { state: "paused" }, noDoor);
  assert.deepEqual([paused.state, paused.was, typeof paused.decision_id], ["paused", { state: "running" }, "string"]);
  assert.deepEqual(
    tables.decisions.map((d) => d.verb),
    ["pause_playbook"],
    "a pause is pause_playbook, as the drawer's switch always wrote",
  );
  // The door's own refusals are core's, before either write: the old way refuses in the same words.
  await refused(put(tables, K2, { run_hour: 7 }, noDoor), "validation", 400, "The hour must be a whole number from 9 to 20.");
});
```

If `segments` rows need more columns for `listRow` (`packages/db/src/repositories/lists.ts:170`), the fake database's
refusal names the missing one: add it with a made-up value. The second order, a dashboard before this one on a database
with the door, is the route as it stands today and needs no test here: `outbound-routes.test.mjs` holds it until this
task changes it, and the migration adds a function and widens a check, which that dashboard never reads.

- [ ] **Step 2: Run it to see it fail**

Run: `git add -N tooling/scripts/tests/playbooks/change/playbook-put.test.mjs`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/playbook-put.test.mjs`
Expected: FAIL — `playbook.PUT.input` is undefined, and a `{ name, run_hour }` body is "re-checked as a whole new
playbook" ("Pick what starts it…").

- [ ] **Step 3: `archivedListRefusal` in `srv/campaigns/playbooks.ts`**

Replace `refuseOnArchivedList` (and its doc comment, about line 420 after lane 1) with the following. The sentence it
returns is the one the tree holds after lane 3's Task 12C ("…or move the campaign to another list."): copy it from the
tree; this lane never writes "playbook" back into it.

```ts
/**
 * Why a playbook on an archived list (00169, decision 0009) stays paused, in words, or null when its list is live or it
 * runs on none of the workspace's own: what a resume (core checkPlaybookPatch's port) and a run now ask. It is neither
 * resumed nor run until its list is restored or it is moved to another.
 */
export async function archivedListRefusal(
  ctx: Pick<RouteContext, "supabase">,
  p: { id: string; trigger: string },
): Promise<string | null> {
  if (p.trigger !== "saved_list") return null;
  const { data: on } = await ctx.supabase.from("playbooks").select("list_id").eq("id", p.id).maybeSingle();
  const listId = (on as { list_id?: string | null } | null)?.list_id ?? null;
  const list = listId ? await listRow(ctx.supabase, listId) : null;
  return list?.archived_at
    ? `Its list, ${list.name}, is archived. Restore it on People, or move the campaign to another list.`
    : null;
}

/** The same, refused: a run now of such a playbook is not made (app/api/v1/playbooks/[id]/run). */
export async function refuseOnArchivedList(
  ctx: Pick<RouteContext, "supabase">,
  p: { id: string; trigger: string },
): Promise<void> {
  const words = await archivedListRefusal(ctx, p);
  if (words) throw new AppError("validation", words);
}
```

- [ ] **Step 4: The union and the patch in `srv/campaigns/playbook-row.ts`**

1. Imports: add `import { z } from "zod";` and `import { checkPlaybookPatch } from "@chanlytics/core";`; from
   `@chanlytics/contracts` drop `PLAYBOOK_STATES` and add `type PlaybookPatch`; from `@chanlytics/db` drop
   `setPlaybookState` and add `playbookForChange, writePlaybookChange`; from `@/server/campaigns/playbooks` drop
   `refuseOnArchivedList` and add `archivedListRefusal`. `recordDecision` stays (`deletePlaybook` and `changeTheOldWay`
   read it), and so does `updatePlaybook`.
2. Rewrite the file's opening doc comment's PUT sentence to: "`{ state, name, run_hour, cap_per_run, gap_days,
   cadence_days }`, any of them, changes it in place, judged against it as it stands and written with its line in the
   ledger in one transaction (the change_playbook door; on a database before it, the way it was written before, for
   one release); `{ channels }` changes the channels it goes by and writes nothing else; the whole playbook is
   re-checked the way a new one is checked and rewritten (campaigns/playbooks.ts)."
3. After the `PlaybookRow` type add:

```ts
/** A change in place (the moment spec §4.9 A5): any of the six, and no other key. Core judges each value, in words. */
const PATCH_BODY = z.strictObject({
  state: z.string().optional(),
  name: z.string().optional(),
  run_hour: z.number().optional(),
  cap_per_run: z.number().optional(),
  gap_days: z.number().optional(),
  cadence_days: z.number().optional(),
});
/** The channels it goes by, alone (the drawer's Goes by row, Ask's channels card). */
const CHANNELS_BODY = z.strictObject({ channels: z.array(z.string()) });
/** The whole playbook (the composer's Save changes): re-checked as a new one is, in its own words. */
const WHOLE_BODY = z.strictObject({
  name: z.string().nullable().optional(),
  trigger: z.string(),
  list_id: z.string().nullable().optional(),
  list_key: z.string().nullable().optional(),
  policy_class: z.string().nullable().optional(),
  template_id: z.string(),
  params: z.array(z.unknown()).optional(),
  channels: z.array(z.string()).optional(),
  run_hour: z.number().optional(),
  cap_per_run: z.number().optional(),
  gap_days: z.number().optional(),
  cadence_days: z.number().optional(),
});
/**
 * What PUT playbooks/:id takes (decision D26): exactly one of the three, strict, so a key no body names is refused, never
 * ignored. Declared on the route, so docs/api.md says it; on the server alone, so no page's bundle carries it.
 */
export const PLAYBOOK_PUT_BODY = z.union([PATCH_BODY, CHANNELS_BODY, WHOLE_BODY]);
/** Not exported: only this module reads it, and knip counts an export nothing else imports (dead-exports.json). */
type PlaybookPutBody = z.infer<typeof PLAYBOOK_PUT_BODY>;
```

4. Replace the whole `changePlaybook` function (lines 77–146) with these five functions:

```ts
export async function changePlaybook(ctx: RouteContext, body: PlaybookPutBody, p: PlaybookRow) {
  if ("trigger" in body) return rewritePlaybook(ctx, body, p);
  if ("channels" in body) return changeChannels(ctx, body.channels, p);
  return patchPlaybook(ctx, body, p);
}

/**
 * A change in place (the moment spec §4.9 A5; decision D26): the drawer's Pause and Resume, Ask's change card, the
 * reach-out sheet's Pause. Judged against the playbook as the database holds it now (core checkPlaybookPatch: the six
 * fields' bounds, a cadence for the month's offer alone, a resume refused on an archived list, a reach-out's step paused
 * or resumed and nothing else), then written with its line in the ledger in one transaction (the change_playbook door):
 * the row locked, only what differs set, and what each field held answered as `was`, which an undo puts back. Nothing
 * that differs writes nothing and answers what it is, so a second press of Pause is no second line. On a database before
 * the door, written the way it was before (changeTheOldWay), for one release.
 */
async function patchPlaybook(ctx: RouteContext, asked: Record<string, unknown>, p: PlaybookRow) {
  const row = await playbookForChange(ctx.supabase, p.tenant_id, p.id);
  if (!row) throw new AppError("not_found", "Campaign not found.", 404); // a member reads it: lane 3's 12C word
  const { set, was } = await checkPlaybookPatch({ archivedList: (r) => archivedListRefusal(ctx, r) }, row, asked);
  if (Object.keys(set).length === 0) return { id: p.id, name: row.name, state: row.state, was: {} };
  const name = set.name ?? row.name;
  const wrote = await writePlaybookChange(ctx.supabase, {
    tenantId: p.tenant_id,
    playbookId: p.id,
    set: set as Record<string, string | number>,
    decision: { name, ...set },
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  const done = wrote === "missing" ? await changeTheOldWay(ctx, p, { set, was, name }) : wrote;
  if (done.error) throw playbookChangeError(done.error);
  if (!done.data) throw new Error("playbook not changed");
  return { id: p.id, name, state: set.state ?? row.state, was: done.data.was, decision_id: done.data.decisionId };
}

/**
 * A change in place on a database before the change_playbook door: written as the route wrote it before, so either
 * deploy order works (CLAUDE.md), for one release, then this goes. The row (`updatePlaybook`, uncounted, as it always
 * was), then its record: a pause or a resume is pause_playbook or start_playbook in the ledger, as the drawer's switch
 * wrote; any other change is the `playbook.changed` event the whole rewrite wrote (that database's decisions_verb_check
 * has no change_playbook), so its answer names no decision.
 */
async function changeTheOldWay(
  ctx: RouteContext,
  p: PlaybookRow,
  change: { set: PlaybookPatch; was: PlaybookPatch; name: string },
): Promise<{ data: { was: Record<string, unknown>; decisionId: string | null } | null; error: null }> {
  const { error } = await updatePlaybook(ctx.supabase, p.id, change.set);
  if (error) throw playbookWriteError(error);
  const others = Object.keys(change.set).filter((k) => k !== "state");
  if (others.length) await playbookEdited(ctx, p, change.name, others);
  const decisionId = change.set.state
    ? await recordDecision(ctx, p.tenant_id, "playbook", p.id, change.set.state === "running" ? "start_playbook" : "pause_playbook", { name: change.name })
    : null;
  return { data: { was: change.was as Record<string, unknown>, decisionId }, error: null };
}

/** A change the database refused: not there (P0002: another workspace's, or one the role may not change), else as it came. */
function playbookChangeError(error: { code?: string; message: string }): Error {
  return error.code === "P0002" ? new AppError("not_found", "Campaign not found.", 404) : new Error(error.message);
}

/**
 * { channels } alone (the drawer's Goes by row, Ask's card): the channels it goes by change and nothing else is read
 * from the caller or written, so a copy of the playbook taken before somebody edited it can put nothing back.
 */
async function changeChannels(ctx: RouteContext, asked: string[], p: PlaybookRow) {
  // A reach-out step is edited on its own sheet (Part 4); its state alone is a change in place.
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  // The channels it ticks now (a database 00298 has not reached has none to read or write).
  const kept = await keptChannels(ctx, p.id);
  const channels = await checkPlaybookChannelsInput(ctx, p.tenant_id, { ...p, channels: kept }, asked);
  if (channelsChanged(channels, kept)) {
    const { error } = await updatePlaybook(ctx.supabase, p.id, { channels });
    if (error) throw playbookWriteError(error);
    await playbookEdited(ctx, p, p.name, ["channels"]);
  }
  // What it went by before this write, for an undo: the channels as this request found them, never a card's copy.
  return { id: p.id, name: p.name, state: p.state, was: { channels: kept } };
}

/** The whole playbook (the composer's Save changes): re-checked the way a new one is, and rewritten. */
async function rewritePlaybook(ctx: RouteContext, body: Record<string, unknown>, p: PlaybookRow) {
  const id = p.id;
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  const kept = await keptChannels(ctx, id);
  const v = await checkPlaybookInput(ctx, p.tenant_id, body, { ...p, channels: kept });
  const { error } = await updatePlaybook(ctx.supabase, id, {
    name: v.name,
    trigger: v.trigger,
    // A playbook moved off a list leaves it (both null); one never on a list names no column 00155 or 00168 adds. A
    // playbook on a list names exactly one of the two (playbooks_one_list).
    ...(v.list_id || v.list_key || p.trigger === "saved_list" ? { list_id: v.list_id, list_key: v.list_key } : {}),
    template_id: v.template_id,
    template_name: v.template_name,
    template_language: v.template_language,
    params: v.params,
    policy_class: v.policy_class,
    run_hour: v.run_hour,
    cap_per_run: v.cap_per_run,
    gap_days: v.gap_days,
    cadence_days: v.cadence_days,
    ...(channelsChanged(v.channels, kept) ? { channels: v.channels } : {}),
  });
  if (error) throw playbookWriteError(error);
  await playbookEdited(ctx, p, v.name, [
    ...(v.name !== p.name ? ["name"] : []),
    ...(v.trigger !== p.trigger ? ["moment"] : []),
    ...(v.template_id !== p.template_id ? ["message"] : []),
    ...(channelsChanged(v.channels, kept) ? ["channels"] : []),
  ]);
  return { id, name: v.name, state: p.state };
}
```

`set as Record<string, string | number>` hands the patch to the `Json` parameter; if the compiler takes `set` as it is,
drop the `as`. `"trigger" in body` narrows the union to the whole body and `"channels" in body` to the channels body,
since neither strict object declares the other's key; if typecheck disagrees, narrow with
`WHOLE_BODY.safeParse(body).success` instead. `changeTheOldWay` is for one release: write a dated line in
`docs/debt.md`'s owed list ("PUT playbooks/:id's old path, once the change_playbook migration is on production") so the
release after removes it.

- [ ] **Step 5: Declare the input on the route**

Replace `apps/dashboard/app/api/v1/playbooks/[id]/route.ts`'s import line and PUT with:

```ts
import { write } from "@/server/route";
import { playbookScope } from "@/server/verbs";
import { PLAYBOOK_PUT_BODY, changePlaybook, deletePlaybook } from "@/server/campaigns/playbook-row";
```

```ts
export const PUT = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  input: PLAYBOOK_PUT_BODY,
  handle: ({ ctx, input, row }) => changePlaybook(ctx, input, row),
});
```

and its doc comment's PUT paragraph with: "PUT /api/v1/playbooks/:id — one of three bodies, strict (PLAYBOOK_PUT_BODY):
any of { state, name, run_hour, cap_per_run, gap_days, cadence_days }, a change in place judged against the playbook as it
stands and written with its line in the ledger in one transaction (the change_playbook door; on a database before it,
the way it was written before, for one release), answering what each field held (`was`);
{ channels } alone, the channels it goes by and nothing else, answering `was`; or the whole playbook, re-checked the way
a new one is checked and rewritten."

- [ ] **Step 6: `setPlaybookState` goes**

Delete `setPlaybookState` from `packages/db/src/repositories/control-plane.ts` (lines 261–265 on `7ff179717`) and from
`packages/db/src/index.ts`'s control-plane export list. Run `git grep -n "setPlaybookState" -- apps packages tooling`
(ignoring `dist/`): Expected: nothing. Run: `corepack pnpm --filter @chanlytics/db build`.

- [ ] **Step 7: The existing route tests read the new answers**

In `tooling/scripts/tests/playbooks/outbound-routes.test.mjs`:

1. After `withStartDoor` (line ~73) add:

```js
/**
 * The `change_playbook` door for a database in memory: the row the caller names in the workspace named, the columns the
 * set names written, then the decision as theirs -- start_playbook, pause_playbook or change_playbook -- in
 * `tables.decisions`; the row's id, what each written column held and the decision's id. No such row is P0002, and
 * nothing is written, as its one transaction leaves it.
 */
const withChangeDoor = (tables, rpcs = {}) => ({
  ...rpcs,
  change_playbook: (a) => {
    const row = (tables.playbooks ?? []).find((p) => p.id === a.p_playbook_id && p.tenant_id === a.p_tenant_id);
    if (!row) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
    const was = Object.fromEntries(Object.keys(a.p_set).map((k) => [k, row[k]]));
    Object.assign(row, a.p_set);
    const decisions = (tables.decisions ??= []);
    const verb =
      a.p_set.state === "running" ? "start_playbook" : a.p_set.state === "paused" ? "pause_playbook" : "change_playbook";
    const decision = {
      id: `decision-${decisions.length + 1}`,
      tenant_id: a.p_tenant_id,
      subject_type: "playbook",
      subject_id: row.id,
      verb,
      actor_type: "user",
      actor_user_id: USER,
      payload: { ...(a.p_decision ?? {}), ...(a.p_via ? { via: a.p_via } : {}) },
      undo_of: a.p_undo_of ?? null,
    };
    decisions.push(decision);
    return { id: row.id, was, decision_id: decision.id, undo_dropped: false };
  },
});
```

and in `ctxFor` replace `withStartDoor(tables, rpcs)` with `withChangeDoor(tables, withStartDoor(tables, rpcs))`.

2. In the test "one playbook: pause and resume on the ledger…" (line 1035) replace the two answers:

```js
  assert.deepEqual(
    await playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: K2 })),
    { id: K2, name: "Win-back", state: "running", was: {} },
    "the same state changes nothing",
  );
  const paused = await playbook.PUT.run(send("PUT", { state: "paused" }), ctxFor(tables, { id: K2 }));
  assert.deepEqual(paused, {
    id: K2,
    name: "Win-back",
    state: "paused",
    was: { state: "running" },
    decision_id: paused.decision_id,
  });
```

The `{ state: "sleeping" }` refusal keeps the words lane 3's Task 12C gave it ("A campaign is running or paused.", which
core says now, `PLAYBOOK_PATCH_WORDS.state`): its pin at line 1051 already reads them, and stays. The decisions list at
the end stays `[["pause_playbook", false], ["pause_playbook", true]]`.

- [ ] **Step 8: Run the tests**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/playbook-put.test.mjs` — Expected: PASS (4).
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/outbound-routes.test.mjs` — Expected: PASS.
Every other file that sends this PUT: `git grep -ln "playbooks/\[id\]/route\|PUT playbooks/\[id\]" -- tooling/scripts/tests`;
run each with R1 (at least `broadcasts/ask-campaign-channels.test.mjs`, `ask/ask-specs.test.mjs`, and the reach-out
tests it lists). Expected: PASS. A reach-out test that pauses a chain answers the new shape (`name`, `was`): read what it
asserts and widen it to the new answer, keeping what it proves.

- [ ] **Step 9: Regenerate the client and the API reference**

Run: `node tooling/scripts/gen/route-types.mjs` then `node tooling/scripts/gen/route-types.mjs --check` — Expected: exit 0.

The reference's generator says a body that is one of several objects as one row, "object or object or object"
(`tooling/scripts/gen/api-reference.mjs` `fieldRows`: JSON Schema's `anyOf` is not an object), which says nothing.
Teach it the shape first, test first. In `tooling/scripts/tests/routes/api-reference.test.mjs` add:

```js
test("a body that is one of several objects is said body by body, each its own fields, never 'object or object'", () => {
  const rows = fieldRows(z.union([z.strictObject({ state: z.string().optional() }), z.strictObject({ channels: z.array(z.string()) })]));
  assert.deepEqual(rows, [
    "One of 2 bodies.",
    "",
    "Body 1:",
    "",
    "| Field | Type | Required | Limits |",
    "| --- | --- | --- | --- |",
    "| `state` | string | no |  |",
    "",
    "Body 2:",
    "",
    "| Field | Type | Required | Limits |",
    "| --- | --- | --- | --- |",
    "| `channels` | array of string | yes |  |",
  ]);
});
```

(import `fieldRows` from the generator and `z` from `zod` as the file's other tests do; if the file's table head is
written by `generate` rather than `fieldRows`, match the lines the file already pins, and keep "Body n:" and the one
table per body.) Run it to see it fail; then in `fieldRows`, where `json.anyOf` holds only objects with `properties`,
return the lines above (each branch's rows by the same map the single object uses), and let `generate` print them where
it prints a body's table. Run the test: PASS.

Run: `corepack pnpm gen:api-reference` — Expected: `docs/api.md`'s `PUT /api/v1/playbooks/[id]` section says "One of 3
bodies." and each body's fields, in place of "Declares no body schema"; no other route's section moves
(`git diff --stat docs/api.md`: that section alone).
Run: `git grep -ln "api.md\|api-reference" -- tooling/scripts/tests` and run each with R1. Expected: PASS.
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` — Expected: exit 0 (the composer's `playbooks.update` body
and the reach-out sheet's `{ state: "paused" }` both fit the union; if the composer's body type does not, its object has
a key the whole body lacks: add that key to `WHOLE_BODY`, never loosen it to `passthrough`).

- [ ] **Step 10: The ratchets, and commit**

`setPlaybookState` left `control-plane.ts`, which is inside `packages/db`, so `tables.json` (table names outside
`packages/db`) does not move, and the file stays a writer of `playbooks` through `updatePlaybook` (Task 3 raised
`writers.json` for the door). Run `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` — Expected: PASS; if
it reports a fall, bank it with R4.

```bash
git add apps/dashboard/app/api/v1/playbooks/[id]/route.ts apps/dashboard/src/server/campaigns/playbook-row.ts apps/dashboard/src/server/campaigns/playbooks.ts packages/db/src/repositories/control-plane.ts packages/db/src/index.ts packages/db/dist apps/dashboard/src/client/routes.generated.ts docs/api.md docs/debt.md tooling/scripts/gen/api-reference.mjs tooling/scripts/tests/routes/api-reference.test.mjs tooling/scripts/tests/baselines tooling/scripts/tests/playbooks/change/playbook-put.test.mjs tooling/scripts/tests/playbooks/outbound-routes.test.mjs
git commit -m "PUT playbooks/:id says the three bodies it takes, and a change in place is one write with its line in the ledger" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add the reach-out test files Step 8 changed, by name.)

---

### Task 7: A new playbook may name a starter, which its Approve adds (A0)

**Files:**
- Modify: `srv/campaigns/starter-templates.ts` (`addStarterTemplates`, line 77)
- Modify: `srv/campaigns/playbooks.ts` (`checkPlaybookInput`'s ports shared with a new `checkPlaybookMomentInput`)
- Modify: `srv/campaigns/playbook-row.ts` (`startNewPlaybook`, line 40)
- Modify: `apps/dashboard/app/api/v1/playbooks/route.ts` (the POST's handle and doc; `maxDuration`)
- Modify: `apps/dashboard/src/legacy-bridge/refresh-map.ts` (`"POST playbooks"`, line 166)
- Modify: `ct/shell/campaign-rooms.ts` (`LIBRARY_STARTER_WORDS`: two refusals)
- Modify (test): `tooling/scripts/tests/playbooks/outbound-routes.test.mjs`

Decision D23: one press. `POST playbooks` with `starter_key` and no `template_id` adds that starter as the composer's
"add the starter" does (`cmp/playbooks/composer-acts.ts:51-58`: English, `POST templates/starter`), then starts the
playbook on it, and answers what became of the starter's WhatsApp version so the card's receipt can say it. The WhatsApp
version is submitted to Meta for review where a number exists, which cannot be unsent: the card says so (Task 10).

**Nothing reaches Meta before every check that could refuse the card has passed.** The route judges the playbook whole
first (`checkStarterPlaybook`: the moment, its list and class as a new playbook's, the starter is the moment's own, takes
no words of its own and fits the class, the numbers, the channels' purpose, and a channel its message will hold once
filed), and only then files the starter; a refused card files nothing. Its slots are filled with the starter's own
sources (contracts `defaultParamSpecs({ name: starter.name, variables: [] })`, which reads
`starterText(starter, "en_US").slots`): core refuses a message whose values do not match its slots ("This template
takes 2 values."), and the win-back's starter has two. Ask's starter card (Task 10) runs the same check at the card.

- [ ] **Step 1: Write the failing test**

In `outbound-routes.test.mjs` add `startersForTrigger`, `starterText`, `defaultParamSpecs`, `LIBRARY_STARTER_WORDS` and
`WIN_BACK_WORDS` to the `@chanlytics/contracts` import, then after the test "playbooks: the workspace's with their runs'
numbers and the business's clock; a new one is checked…" (line ~987) add the three tests below. The fixtures copy the
real shape: a starter's row carries the variables its submission writes, so the message has the starter's real slots
(the win-back's two), and Meta is stubbed at the edge, its calls counted.

```js
/** A starter's own WhatsApp row, as its submission writes it: its real variables, so its message has its real slots. */
const starterRow = (id, s, over = {}) =>
  tpl(id, B, {
    name: s.name,
    category: s.category,
    variables: starterText(s, "en_US").slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    ...over,
  });

/**
 * The edge's template submission, stubbed (Meta takes it for review), counting each call, as
 * templates/templates-doors.test.mjs:160-181 stubs it: what it answers and the row it writes are the edge's.
 */
function stubMeta(tables) {
  const calls = [];
  const was = { fetch: globalThis.fetch, url: process.env.EDGE_URL, secret: process.env.EDGE_CALL_SECRET };
  process.env.EDGE_URL = "https://edge.example.com";
  process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    // Answer, and write the row, as the edge does for a submission Meta took (read meta-templates.ts createTemplate).
    return metaTook(tables, JSON.parse(String(init?.body ?? "{}")));
  };
  const restore = () => {
    globalThis.fetch = was.fetch;
    if (was.url === undefined) delete process.env.EDGE_URL;
    else process.env.EDGE_URL = was.url;
    if (was.secret === undefined) delete process.env.EDGE_CALL_SECRET;
    else process.env.EDGE_CALL_SECRET = was.secret;
  };
  return { calls, restore };
}

const starterWorld = (over = {}) => ({
  memberships: both("viewer", "operator"),
  tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
  tenant_channels: [channelRows.number],
  templates: [],
  playbooks: [],
  decisions: [],
  events: [],
  broadcasts: [],
  broadcast_recipients: [],
  ...over,
});

test("a new playbook named by a starter's key and no message: the starter on file, its slots filled with the starter's own sources, the playbook going by it, and the answer saying what became of its WhatsApp version", async () => {
  const starter = startersForTrigger("quiet_30").find((s) => !s.retired);
  const tables = starterWorld({ templates: [starterRow(T1, starter)] });
  setServiceClient(fakeDb(tables));
  const meta = stubMeta(tables);
  try {
    const made = await playbooks.POST.run(
      send("POST", { trigger: "quiet_30", starter_key: starter.key, channels: ["whatsapp"] }, inB),
      ctxFor(tables),
    );
    assert.equal(made.state, "running");
    assert.deepEqual(made.starter, { key: starter.key, status: "exists", meta_status: "approved" });
    const row = tables.playbooks.find((p) => p.id === made.id);
    assert.deepEqual([row.trigger, row.template_id, row.channels], ["quiet_30", T1, ["whatsapp"]]);
    assert.deepEqual(row.params, defaultParamSpecs({ name: starter.name, variables: [] }), "the starter's own slots");
    assert.equal(row.params.length, starterText(starter, "en_US").slots.length);
    assert.deepEqual(meta.calls, [], "on file: nothing asked of Meta");
    // A body with its own message is the body as it came: the key is never read, and no starter is said.
    const own = await playbooks.POST.run(
      send("POST", { trigger: "quiet_30", template_id: T1, starter_key: "nope", params: row.params }, inB),
      ctxFor(tables),
    );
    assert.equal("starter" in own, false);
  } finally {
    meta.restore();
  }
});

test("a starter not on file is filed once every check has passed: its WhatsApp version goes to Meta, and the playbook goes by the message it began", async () => {
  const starter = startersForTrigger("quiet_30").find((s) => !s.retired);
  const tables = starterWorld();
  setServiceClient(fakeDb(tables));
  const meta = stubMeta(tables);
  try {
    const made = await playbooks.POST.run(
      send("POST", { trigger: "quiet_30", starter_key: starter.key, channels: ["whatsapp"] }, inB),
      ctxFor(tables),
    );
    assert.equal(made.starter.status, "submitted");
    assert.equal(meta.calls.length, 1, "one submission");
    const filed = tables.templates.find((t) => t.name === starter.name && t.channel === "whatsapp");
    assert.ok(filed, "the starter's WhatsApp row");
    assert.equal(tables.playbooks.find((p) => p.id === made.id).template_id, filed.id);
  } finally {
    meta.restore();
  }
});

test("a starter card the route would refuse files nothing: a number out of bounds, a moment not offered here, a starter not this moment's, a key the set does not have, a starter that takes words of its own; each in the product's words, and nothing reaches Meta", async () => {
  const winBack = startersForTrigger("quiet_30").find((s) => !s.retired);
  const reminder = startersForTrigger("visit_tomorrow").find((s) => !s.retired);
  const offer = startersForTrigger("everyone_monthly").find((s) => !s.retired);
  const tables = starterWorld();
  setServiceClient(fakeDb(tables));
  const meta = stubMeta(tables);
  const post = (body) => playbooks.POST.run(send("POST", body, inB), ctxFor(tables));
  try {
    await refused(
      post({ trigger: "quiet_30", starter_key: winBack.key, run_hour: 7 }),
      "validation",
      400,
      "The hour must be a whole number from 9 to 20.",
    );
    // The win-back by appointments needs a calendar, and this workspace has none.
    await refused(post({ trigger: "lapsed", starter_key: winBack.key }), "validation", 400, WIN_BACK_WORDS.lapsed);
    await refused(
      post({ trigger: "quiet_30", starter_key: reminder.key }),
      "validation",
      400,
      LIBRARY_STARTER_WORDS.notThisMoment("Win-back"),
    );
    await refused(post({ trigger: "quiet_30", starter_key: "nope" }), "validation", 400, "That starter is not");
    await refused(
      post({ trigger: "everyone_monthly", starter_key: offer.key }),
      "validation",
      400,
      LIBRARY_STARTER_WORDS.takesOwnWords(offer.title),
    );
    assert.deepEqual([tables.templates, tables.playbooks, tables.decisions], [[], [], []], "nothing filed, nothing started");
    assert.deepEqual(meta.calls, [], "nothing reached Meta");
  } finally {
    meta.restore();
  }
});
```

`channelRows`, `tpl`, `both`, `send`, `inB`, `refused` and `ctxFor` are this file's (lines ~1194, ~128, ~63). `metaTook`
is the stub's answer and row, written from what `createTemplate` sends and reads back: copy them from
`templates/templates-doors.test.mjs:160-181` and `apps/dashboard/src/server/campaigns/meta-templates.ts`. Where a label
or a key differs in this tree (the trigger's label in `notThisMoment`, `WIN_BACK_WORDS`' key, the reminder's trigger),
read it from contracts and keep the assertion. If `checkPlaybookInput` asks the world for a table it lacks (the fake
database names it), copy that table from the test at line ~987.

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/outbound-routes.test.mjs`
Expected: FAIL — `made.starter` is undefined (the key is ignored and `template_id` is missing: "Pick a message…"), and
the refusals are other words or none.

- [ ] **Step 3a: The two refusals' words, and the moment's check on its own in `srv/campaigns/playbooks.ts`**

In `ct/shell/campaign-rooms.ts`, inside `LIBRARY_STARTER_WORDS` after `pickAChannel`, add:

```ts
  /** A new playbook named by a starter that is not its moment's own, or by no starter the set has (A0). */
  notThisMoment: (moment: string): string =>
    `That starter is not one “${moment}” goes by: name the moment's own starter, or a message from the Library.`,
  /** A starter whose words are the owner's to write (the month's offer): it is started from the composer. */
  takesOwnWords: (title: string): string =>
    `The “${title}” starter takes words of its own: write them in the composer and start it there.`,
```

and build contracts (R2). In `srv/campaigns/playbooks.ts`, the ports `checkPlaybookInput` builds inline (the message's
ports, `listName`, `dealsOn`, `calendarOn`) move to one private function, `playbookCheckPorts(ctx, tenantId, known)`,
which `checkPlaybookInput` now passes to core `checkPlaybook` unchanged, and beside it add:

```ts
/**
 * A new playbook's moment, its list and its class, judged as checkPlaybookInput judges them (core checkPlaybookMoment,
 * over the same ports): what a starter card is held to before its starter is filed (starter-templates.ts
 * checkStarterPlaybook), so a refusal comes before anything reaches Meta.
 */
export async function checkPlaybookMomentInput(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown> | null,
  known?: ZoneAndSettings,
) {
  return checkPlaybookMoment(playbookCheckPorts(ctx, tenantId, known), body, null);
}
```

(import `checkPlaybookMoment` from `@chanlytics/core` beside `checkPlaybook`).

- [ ] **Step 3: `fileStarters`, `checkStarterPlaybook` and `withStarterMessage` in `srv/campaigns/starter-templates.ts`**

1. Imports: add `defaultParamSpecs`, `channelNeverCarries`, `enrolPurpose`, `messageFitsMoment`, `playbookChannelsRead`,
   `readyOrWhatsApp`, `startersForTrigger`, `starterEmailText`, `starterSmsText`, `type ParamSpec`,
   `type PlaybookPolicyClass` to the contracts import (`starterText`, `LIBRARY_STARTER_WORDS` and `StarterTemplate` are
   there); add `import { parseChannels, playbookNumber } from "@chanlytics/core";`,
   `import { load, readerContext } from "@/server/readers";`, `import { channelsReady, type ZoneAndSettings } from "@/server/readers/facts";`,
   `import { templates as templatesReader } from "@/server/readers/templates";` and
   `import { checkPlaybookMomentInput } from "@/server/campaigns/playbooks";`. (Lane 1 changed the templates reader over
   `template_sends`: keep whatever argument it takes for the composers' read, `{ all: false }` on main. If
   `ZoneAndSettings` is exported from another module, import it from there.)
2. Replace the head of `addStarterTemplates` so the body is read once and the rest is a function of the workspace:

```ts
/** What the starter set is asked for: the starters by key, their languages, and the channels to write them on. */
interface StartersAsked {
  keys?: unknown;
  languages?: unknown;
  channels?: unknown;
}

export async function addStarterTemplates(ctx: RouteContext, req: Request, member: Member) {
  return fileStarters(ctx, member.tenantId, ((await jsonBody(req)) as StartersAsked | null) ?? {});
}

/**
 * The starter set, filed for a workspace: the route's body (above), and a new playbook's one starter (withStarterMessage).
 * Everything the route did, unchanged, with the workspace by its id. Not exported: only this module files starters, and
 * knip counts an export nothing else imports.
 */
async function fileStarters(ctx: RouteContext, tenantId: string, body: StartersAsked) {
```

   and in the rest of that function's body (the old `addStarterTemplates`), delete the `const body = …jsonBody…` line and
   replace each `member.tenantId` with `tenantId` (five places: `sellsByOf`, `starterChannelsOf`, `templatesNamed`,
   `startersFiled`, `fileStarterVersions`, `createTemplate`, `syncTemplates`, `templateStatusOf` — every one the compiler
   flags). `body?.keys` etc. become `body.keys`.
3. After `fileStarters`, add:

```ts
/** A new playbook's starter, filed (A0): what became of its WhatsApp version, which the card's receipt says. Not exported. */
interface StarterFiled {
  key: string;
  status: Outcome;
  meta_status: string | null;
}

/** The channels a starter's message will hold once filed: WhatsApp where there is a number to make it for, and each
 *  email or text version the starter writes, of the channels asked (fileStarters files by the same rule). */
async function starterWillHold(ctx: RouteContext, tenantId: string, starter: StarterTemplate, asked: unknown) {
  const { whatsapp, number, own } = await starterChannelsOf(ctx, tenantId, asked);
  const writes = (c: OwnVersionChannel) =>
    c === "email" ? starterEmailText(starter, "en_US") !== null : starterSmsText(starter, "en_US") !== null;
  return [...(whatsapp && number ? (["whatsapp"] as const) : []), ...own.filter(writes)];
}

/**
 * A new playbook named by a starter, judged whole before anything is filed (the moment spec's A0, D23): a WhatsApp
 * version sent to Meta cannot be taken back, so every refusal the card could meet comes first, in the words a new
 * playbook is refused in. Its moment, list and class as a new playbook's (checkPlaybookMomentInput, core
 * checkPlaybookMoment); the starter is that moment's own and still offered, takes no words of its own, and its kind of
 * message fits the class (contracts messageFitsMoment); its numbers keep their bounds (core playbookNumber); a channel it
 * names is one its purpose carries (contracts channelNeverCarries); and it goes by a channel its message will hold once
 * filed. Answers the starter, the specs its slots are filled with (the starter's own sources, contracts
 * defaultParamSpecs, which reads starterText(starter, "en_US").slots) and the channels its message will hold. POST
 * playbooks runs it before it files (withStarterMessage); Ask's starter card runs it at the card (act/playbook.ts
 * proposeOnStarter): one judgement.
 */
export async function checkStarterPlaybook(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown>,
  known?: ZoneAndSettings,
): Promise<{ starter: StarterTemplate; params: ParamSpec[]; cls: PlaybookPolicyClass; holds: ConsentChannel[] }> {
  const { trig, cls } = await checkPlaybookMomentInput(ctx, tenantId, body, known);
  const key = typeof body.starter_key === "string" ? body.starter_key : "";
  const starter = startersForTrigger(trig.id).find((s) => s.key === key && !s.retired);
  if (!starter) throw new AppError("validation", LIBRARY_STARTER_WORDS.notThisMoment(trig.label));
  if (starterText(starter, "en_US").slots.some((s) => s.kind === "text"))
    throw new AppError("validation", LIBRARY_STARTER_WORDS.takesOwnWords(starter.title));
  const fit = messageFitsMoment(cls, starter.category);
  if (!fit.ok) throw new AppError("validation", fit.words);
  for (const k of ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const) playbookNumber(k, body[k], 0);
  const purpose = enrolPurpose(cls, { category: starter.category });
  const named = body.channels === undefined ? null : parseChannels(body.channels, null);
  const never = (named ?? []).map((c) => channelNeverCarries(c, purpose)).find((w) => w !== null);
  if (never) throw new AppError("validation", never);
  const holds = await starterWillHold(ctx, tenantId, starter, body.channels);
  if (holds.length === 0 || (named && !named.some((c) => holds.includes(c))))
    throw new AppError("validation", LIBRARY_STARTER_WORDS.pickAChannel);
  return { starter, params: defaultParamSpecs({ name: starter.name, variables: [] }), cls, holds };
}

/**
 * A new playbook named by a starter's key and no message (Ask's first-day card, the moment spec's A0, D23): judged whole
 * first (checkStarterPlaybook: a refused card files nothing and asks nothing of Meta), then the starter is added as the
 * composer's one press adds it (fileStarters: in English, on the channels the playbook names, every one where it names
 * none), then the playbook goes by that message, its slots filled with the starter's own sources, on the channels the
 * composer would open it on where it names none (contracts playbookChannelsRead with "new"), or, where that opens none of
 * the channels the message holds, those it holds (a run holds the people on one not ready yet, as any playbook's does).
 * A body with a message of its own, or with no key, is the body as it came, and no starter is filed.
 */
export async function withStarterMessage(
  ctx: RouteContext,
  member: Member,
  asked: Record<string, unknown> | null,
): Promise<{ body: Record<string, unknown> | null; starter: StarterFiled | null }> {
  const key = typeof asked?.starter_key === "string" ? asked.starter_key : "";
  if (!asked || !key || (typeof asked.template_id === "string" && asked.template_id))
    return { body: asked, starter: null };
  const { starter_key: _key, ...rest } = asked;
  // Every check that could refuse the card, before anything is filed: nothing reaches Meta for a card that is refused.
  const { starter, params, cls, holds } = await checkStarterPlaybook(ctx, member.tenantId, asked);
  const filed = await fileStarters(ctx, member.tenantId, { keys: [key], languages: ["en_US"], channels: rest.channels });
  const result = filed.results.find((r) => r.key === key) ?? null;
  const rc = readerContext(ctx, member);
  const message = (await load(rc, templatesReader, { all: false })).data.messages.find(
    (m) => m.offered && m.name === starter.name,
  );
  if (!result || !message)
    throw new AppError(
      "conflict",
      "The starter message could not be added just now, so nothing was started. Try again, or add it from the Library.",
      409,
    );
  const ready = readyOrWhatsApp((await load(rc, channelsReady, undefined)).data);
  const opens = playbookChannelsRead({ trigger: String(rest.trigger ?? ""), policy_class: cls }, "new", message, ready).kept;
  const channels = Array.isArray(rest.channels)
    ? rest.channels
    : opens.some((c) => holds.includes(c))
      ? opens.filter((c) => holds.includes(c))
      : holds;
  return {
    body: { ...rest, template_id: message.anchor.id, params, channels },
    starter: { key, status: result.status, meta_status: result.meta_status },
  };
}
```

The 409 above is a starter that Meta refused, or filed nowhere it can be sent from: every check that could refuse the
card ran before `fileStarters`, and a refused card files nothing (Step 1's third test). `addStarterTemplates` keeps its
own refusals ("Pick at least one starter template…" for its route's body). `checkStarterPlaybook` is exported because
`act/playbook.ts` imports it (Task 10); `fileStarters`, `starterWillHold` and `StarterFiled` are this module's alone.
If `playbookNumber`'s fallback must be a number in range for a check alone, pass the field's `PLAYBOOK_LIMITS` minimum.

- [ ] **Step 4: `startNewPlaybook` reads it**

In `srv/campaigns/playbook-row.ts`: import `withStarterMessage` from `@/server/campaigns/starter-templates` and
`type Member` from `@/server/route`; then replace the first three lines of `startNewPlaybook`:

```ts
export async function startNewPlaybook(ctx: RouteContext, req: Request, tenantId: string) {
  const body = (await jsonBody(req)) as Record<string, unknown> | null;
  const v = await checkPlaybookInput(ctx, tenantId, body, null);
```

with

```ts
export async function startNewPlaybook(ctx: RouteContext, req: Request, member: Member) {
  const tenantId = member.tenantId;
  // A starter named and no message (A0): the starter is filed first, and the playbook goes by it.
  const { body, starter } = await withStarterMessage(ctx, member, (await jsonBody(req)) as Record<string, unknown> | null);
  const v = await checkPlaybookInput(ctx, tenantId, body, null);
```

and its last line with

```ts
  return { id: made.id, name: v.name, state: "running", decision_id: made.decisionId, ...(starter ? { starter } : {}) };
```

Add to its doc comment: "A body naming `starter_key` and no message is judged whole, then files that starter
(withStarterMessage: a refused one files nothing), and the answer says what became of its WhatsApp version (`starter`)."

- [ ] **Step 5: The route passes the member, has the time a submission takes, and the Library repaints**

In `apps/dashboard/app/api/v1/playbooks/route.ts`: `handle: ({ ctx, req, member }) => startNewPlaybook(ctx, req, member),`
and in its doc comment's POST paragraph after "`channels?` }" add ", or `starter_key` in place of `template_id`: the
playbook is judged whole, then that starter is added as the composer's one press adds it (its WhatsApp version goes to
Meta for review where there is a number), then the playbook goes by it, and the answer's `starter` says what became of
it". Below the handlers add, as `app/api/v1/templates/starter/route.ts` has it:

```ts
/**
 * A playbook named by a starter submits that starter's WhatsApp version to Meta before it starts (A0): a round trip to
 * the edge and on to Meta, which the platform's default time may not hold, and a run killed there loses the answer that
 * says what was submitted. The starter route's room, for the same call.
 */
export const maxDuration = 60;
```

In `apps/dashboard/src/legacy-bridge/refresh-map.ts`, `"POST playbooks"` (line 166) re-reads the Library too, since a
starter's playbook files its message: `"POST playbooks": () => [...runsAndPeople(), templates],` (in the map's own form:
read how `"POST templates/starter": templates` names it, and how `runsAndPeople` is spelled, a list or a function).
Run `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs` — Expected: PASS.

- [ ] **Step 6: Run the tests**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/outbound-routes.test.mjs` — Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/templates/starter-templates.test.mjs` — Expected: PASS
(the starter route's refusals are unchanged).
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` — Expected: exit 0.
Run: `corepack pnpm gen:api-reference` — Expected: no change (the POST declares no schema; its words live in the route's
comment).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/server/campaigns/starter-templates.ts apps/dashboard/src/server/campaigns/playbooks.ts apps/dashboard/src/server/campaigns/playbook-row.ts apps/dashboard/app/api/v1/playbooks/route.ts apps/dashboard/src/legacy-bridge/refresh-map.ts packages/contracts/src/shell/campaign-rooms.ts packages/contracts/dist tooling/scripts/tests/playbooks/outbound-routes.test.mjs
git commit -m "A new playbook may name a starter, judged whole before its Approve files it as the composer's one press does" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The change card's spec, and the playbook card's starter and doors (contracts)

**Files:**
- Modify: `ct/ask/ask.ts` (`AskProposal.kind`, line 172)
- Modify: `ct/ask-proposals/campaigns.ts` (`playbookSpec`, line 90; the new spec after `playbookChannelsSpec`)
- Modify: `ct/ask-proposals/proposals.ts` (`PROPOSAL_SPECS`, its doc comment)
- Modify: `apps/dashboard/src/legacy/pages/ask-turn.jsx` (lines 57 and 61: the card's icon and word)
- Modify (test): `tooling/scripts/tests/ask/ask-specs.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs` (its
  `PROPOSAL_GATE` pin, line 1084)

Copy `playbookChannelsSpec` (`ct/ask-proposals/campaigns.ts:135-169`, the commit and undo of the same PUT) and
`listSpec.open` (`ct/ask-proposals/lists.ts:47-50`, a card that opens what it made from `outcome.undo`).

- [ ] **Step 1: Write the failing spec tests**

In `ask-specs.test.mjs`:

1. In `KINDS`, insert `"playbook_change",` after `"playbook_channels",` (before `"teleport"`), and change the header's
   "The seventeen kinds" to "The eighteen kinds".
2. In the gate table add `playbook_change: "approve",`; in `UNDO_OPEN` add
   `playbook_change: "000000000 111111000 111111000 111111000 111111000 111111000 111111000 111111000",`; in `OPEN` add
   `playbook_change: "outbound",` (no payload in the table names a playbook).
3. In `SHAPES` add `playbook_change: [card("playbook_change", CHANGE)],` and above `SHAPES` add:

```js
/** A playbook's change, as the act builds its card (server/ask/tools/act/playbook-change.ts): what it changes, and what it held. */
const CHANGE = {
  playbook_id: "pb1",
  playbook_name: "Win-back",
  name: "Past clients",
  run_hour: 9,
  was: { name: "Win-back", run_hour: 10 },
  run_waits: false,
  timezone: "America/New_York",
};
```

4. In "the seventeen kinds each have a spec…" rename it "the eighteen kinds…", change `KINDS.slice(0, 17)` to
   `KINDS.slice(0, 18)`, and add `playbook_change: ["PUT playbooks/[id]"],` to the expected routes.
5. In `ask.test.mjs`, the test "cards: an act tool never acts…" (line 1083) pins `PROPOSAL_GATE` whole: after
   `playbook_channels: "approve",` add `playbook_change: "approve",` (a pin of every kind, not a count).
6. Append to `ask-specs.test.mjs`:

```js
test("a playbook's change from a card (A5): its own PUT with what it changes and nothing else, the drawer's sentence as its receipt, and an undo that puts back what the route found", () => {
  const spec = PROPOSAL_SPECS.playbook_change;
  const p = card("playbook_change", CHANGE);
  assert.deepEqual([spec.needs, spec.gate], ["operator", "approve"]);
  assert.deepEqual(spec.commit(p, TAB), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { name: "Past clients", run_hour: 9 },
  });
  // A payload that carries more of a playbook sends none of it; one that changes nothing, or names no playbook, is never sent.
  const loose = card("playbook_change", { ...CHANGE, trigger: "lapsed", template_id: "t9", state: null });
  assert.deepEqual(spec.commit(loose, TAB).body, { name: "Past clients", run_hour: 9 });
  for (const broken of [{ ...CHANGE, playbook_id: null }, { playbook_id: "pb1", playbook_name: "Win-back", was: {} }])
    assert.deepEqual(spec.commit(card("playbook_change", broken), TAB), { refused: PROPOSAL_WORDS.cannotApprove });
  const sentence = (parts) => parts.map((x) => (typeof x === "string" ? x : x.b)).join("");
  // The route answers the name it stored; a pause and a resume say the drawer's own words.
  assert.equal(spec.receipt(p, { name: "Past clients" }), sentence(LIFECYCLE_TOAST.changed("Past clients")));
  const pause = card("playbook_change", { playbook_id: "pb1", playbook_name: "Win-back", state: "paused", was: { state: "running" } });
  const resume = card("playbook_change", { playbook_id: "pb1", playbook_name: "Win-back", state: "running", was: { state: "paused" } });
  assert.equal(spec.receipt(pause, { name: "Win-back" }), sentence(LIFECYCLE_TOAST.paused("Win-back")));
  assert.equal(spec.receipt(resume, {}), sentence(LIFECYCLE_TOAST.resumed("Win-back")));
  assert.deepEqual(
    [spec.undo.label(p), spec.undo.label(pause), spec.undo.label(resume), spec.undo.window],
    ["Put it back", "Resume it", "Pause it again", "ten_minutes"],
  );
  // The undo puts back what the route found when it wrote (its `was`), the card's copy only where a route answers none.
  const kept = spec.undo.record(p, { was: { name: "Spring win-back", run_hour: 11 } }, TAB);
  assert.deepEqual(kept, { playbook_id: "pb1", was: { name: "Spring win-back", run_hour: 11 } });
  assert.deepEqual(spec.undo.call(kept, TAB_AFTER), {
    route: "PUT playbooks/[id]",
    params: { id: "pb1" },
    body: { name: "Spring win-back", run_hour: 11 },
  });
  assert.deepEqual(spec.undo.record(p, {}, TAB).was, CHANGE.was);
  assert.deepEqual(spec.undo.call({ playbook_id: "pb1", was: {} }, TAB_AFTER), { refused: PROPOSAL_WORDS.noUndo });
  assert.equal(spec.undo.receipt({}), "It is as it was");
  assert.equal(spec.open(p, null), "campaigns/moment:pb1", "its drawer");
});

test("a playbook card (A0, the landing rule): a starter it names is committed in place of a message, it opens in the composer on its moment before Approve, and in the new drawer after, from the undo the commit kept", () => {
  const spec = PROPOSAL_SPECS.playbook;
  const onStarter = card("playbook", { trigger: "quiet_30", starter_key: "winback_reply", name: null, run_hour: 10, cap_per_run: 25 });
  const body = spec.commit(onStarter, TAB).body;
  assert.equal(body.starter_key, "winback_reply");
  assert.equal("template_id" in body, false, "no message: the route files the starter first");
  assert.equal(spec.commit(card("playbook", { trigger: "quiet_30", template_id: "t1" }), TAB).body.template_id, "t1");
  assert.equal(spec.open(onStarter, null), "campaigns/new:moment:quiet_30");
  assert.equal(spec.open(onStarter, done({ playbook_id: "pb9", decision_id: "d1" })), "campaigns/moment:pb9");
  assert.equal(spec.open(card("playbook", {}), null), "outbound");
  // The receipt says the starter's WhatsApp version went to Meta, where the route says it did.
  assert.match(spec.receipt(onStarter, { name: "Win-back", starter: { status: "submitted" } }), /Meta/);
  assert.doesNotMatch(spec.receipt(onStarter, { name: "Win-back" }), /Meta/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs`
Expected: FAIL — `PROPOSAL_SPECS.playbook_change` is undefined.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs`
Expected: FAIL — `PROPOSAL_GATE` has no `playbook_change` yet.

- [ ] **Step 3: The kind**

In `ct/ask/ask.ts`, in `AskProposal.kind`, after `| "playbook_channels"` add `| "playbook_change"` (keep the `;`).

- [ ] **Step 4: The spec and the playbook card's changes**

In `ct/ask-proposals/campaigns.ts`:

1. Add `import { PLAYBOOK_PATCH_KEYS } from "../playbooks/playbook-patch";`. Lane 2 moved `lifecycle-words`: the
   existing import reads `../playbooks/lifecycle/lifecycle-words` now; keep it.
2. In `playbookSpec`: replace `template_id: pl.template_id,` in `commit` with

```ts
      // A starter named and no message (A0): the route files the starter, then starts the playbook on it.
      ...(pl.starter_key && !pl.template_id ? { starter_key: pl.starter_key } : { template_id: pl.template_id }),
```

   replace `receipt` with the following, which says "Campaign", the word a person reads (D19: this lane never writes
   "Playbook" into a receipt it touches; Task 18B renames the rest):

```ts
  receipt: ({ payload: pl }, data) =>
    `Campaign “${rec(data).name ?? asText(pl.name)}” is running — its next run is under Coming up in Campaigns${
      rec(rec(data).starter).status === "submitted" ? " · its starter's WhatsApp version is with Meta for review" : ""
    }`,
```

   and move its pin with it: `tooling/scripts/tests/ask/ask-commit.test.mjs:676` becomes
   `receipt: "Campaign “Win-back” is running — its next run is under Coming up in Campaigns",` (`git grep -n "is running — its next run" -- tooling/scripts/tests e2e`
   lists any other).

   and replace `playbookSpec.open` with the following. Lane 3's Task 14 already replaced today's `open: () => "outbound",`
   with `open: (_card, outcome) => { const id = idIn(rec(outcome?.undo), "playbook_id"); return id ? … : "outbound"; }`
   (the new drawer after Approve); this keeps that branch first and adds the composer before Approve:

```ts
  // After Approve, the playbook it made, in its drawer (the id the commit kept for the undo, as a list card opens its
  // list); before, the composer on its moment, where the whole of it can be set by hand ("Open in the composer").
  open: ({ payload }, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    if (id) return `campaigns/moment:${id}`;
    const trigger = idIn(payload, "trigger");
    return trigger ? `campaigns/new:moment:${trigger}` : "outbound";
  },
```

3. After `playbookChannelsSpec`, add:

```ts
/** What a change card's commit sends: the fields it changes, and nothing else of the playbook. */
const patchIn = (pl: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(PLAYBOOK_PATCH_KEYS.filter((k) => pl[k] !== undefined && pl[k] !== null).map((k) => [k, pl[k]]));

/** One of the drawer's sentences (LIFECYCLE_TOAST) as a receipt's words. */
const toastWords = (parts: ReturnType<typeof LIFECYCLE_TOAST.changed>): string =>
  parts.map((part) => (typeof part === "string" ? part : part.b)).join("");

/**
 * A playbook changed in place from a card (the moment spec §4.9 A5): paused, resumed, renamed, or a new hour, cap, gap or
 * cadence. The commit is the playbook's own PUT with what changes ALONE: the server judges it against the playbook as it
 * stands then (core checkPlaybookPatch) and writes it with its line in the ledger (change_playbook), so a card approved after
 * somebody edited the playbook puts nothing of an older copy back. Its undo is the same PUT with what the route found
 * (`was`), never the card's reading. A pause leaves a run that waits waiting (D8): the card said so, and a skip is a
 * second card. Its receipt is the drawer's sentence: paused, resumed or changed.
 */
export const playbookChangeSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const body = patchIn(pl);
    if (!id || Object.keys(body).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body };
  },
  receipt: ({ payload: pl }, data) => {
    const name = asText(rec(data).name ?? pl.name ?? pl.playbook_name) || LIFECYCLE_TOAST.nameless;
    if (pl.state === "paused") return toastWords(LIFECYCLE_TOAST.paused(name));
    if (pl.state === "running") return toastWords(LIFECYCLE_TOAST.resumed(name));
    return toastWords(LIFECYCLE_TOAST.changed(name));
  },
  undo: {
    label: ({ payload }) =>
      payload.state === "paused" ? "Resume it" : payload.state === "running" ? "Pause it again" : "Put it back",
    window: "ten_minutes",
    // What the route found when it wrote (its answer's `was`), the card's own reading only where a route answers none.
    record: (p, data) => {
      const was = rec(data).was;
      return { playbook_id: p.payload.playbook_id, was: was && typeof was === "object" ? was : p.payload.was };
    },
    call: (u) => {
      const was = patchIn(rec(u.was));
      return !asText(u.playbook_id) || Object.keys(was).length === 0
        ? refuseWith(PROPOSAL_WORDS.noUndo)
        : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: was };
    },
    receipt: () => "It is as it was",
  },
  // Its drawer on Campaigns, where its state, clock and name are.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? `campaigns/moment:${id}` : "outbound";
  },
};
```

   If lane 2's `LIFECYCLE_TOAST.paused` has another signature than `(name: string) => LifecycleSentence`, call it as it
   is declared and keep the receipt its sentence. Update the file's opening comment to name the change card.
4. In `ct/ask-proposals/proposals.ts`: import `playbookChangeSpec` beside `playbookChannelsSpec`, add
   `playbook_change: playbookChangeSpec,` after `playbook_channels: playbookChannelsSpec,`, and in the doc comment's
   family list write "campaigns.ts (broadcast, playbook, playbook_channels, playbook_change, run)".

- [ ] **Step 5: The Line draws the new kind**

In `apps/dashboard/src/legacy/pages/ask-turn.jsx` (prettier-ignored; edit in place, one line each):
- line 57, in `AT_CARD_ICONS`, after `playbook_channels: "bolt",` insert `playbook_change: "bolt",`;
- line 61, in `KIND`, after `playbook_channels: t.kPlaybook,` insert `playbook_change: t.kPlaybook,`.

- [ ] **Step 6: Build and run the tests**

Run: `node tooling/scripts/gen/contracts-browser-entry.mjs` then `corepack pnpm --filter @chanlytics/contracts build`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-specs.test.mjs` — Expected: PASS.
Every file that iterates the card kinds: `git grep -ln "PROPOSAL_SPECS\|playbook_channels" -- tooling/scripts/tests`;
run each with R1 (at least `ask/ask-commit.test.mjs`, `ask/ask-palette.test.mjs`, `ask/ask.test.mjs`,
`ask/ask-registry.test.mjs`). Expected: PASS (`ask.test.mjs`'s `PROPOSAL_GATE` pin took its entry in Step 1). A test
that counts the kinds (17) counts 18 now: change the number and its words, nothing else; a test that pins every kind by
name (as `PROPOSAL_GATE`'s does) takes `playbook_change` beside `playbook_channels`.
Run: `corepack pnpm -r typecheck` — Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/ask/ask.ts packages/contracts/src/ask-proposals/campaigns.ts packages/contracts/src/ask-proposals/proposals.ts packages/contracts/src/browser.generated.ts packages/contracts/dist apps/dashboard/src/legacy/pages/ask-turn.jsx tooling/scripts/tests/ask/ask-specs.test.mjs tooling/scripts/tests/ask/ask.test.mjs tooling/scripts/tests/ask/ask-commit.test.mjs
git commit -m "Ask's change card commits a playbook's change alone, and a playbook card names its starter and opens what it made" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any count-only test Step 6 changed, by name.)

---

### Task 9: `propose_campaign` gains the action `change` (no new tool)

**Files:**
- Create: `act/playbook-change.ts` (`act/` holds 16 modules; this is the 17th)
- Modify: `act/campaign.ts`
- Modify: `act/playbook.ts` (export `MODE_WORDS`, line 77)
- Create (test): `tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs`
- Modify (tests): `tooling/scripts/tests/ask/ask-registry.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs` (line 1120)
- Modify: `tooling/evals/rename-ask-tools.mjs` (`ADDED_SINCE`)
- Regenerate: `tooling/scripts/tests/fixtures/ask-tools-4-7.json` (R5)

The owner is at the twenty tools the registry test pins (`ask-registry.test.mjs:276`), so a change is an action. Its
fields take the shapes the flat schema already gives them (`playbook_id`, `name` strings; `run_hour`, `cap_per_run`
`number`, never `.int()`, or the registry throws at load: `srv/ask/tools/registry.ts:182-196`). Copy
`act/playbook-channels.ts` (one playbook read, the PUT's own judgement, a card that carries only what changes).

- [ ] **Step 1: Write the failing tool test**

Create `tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs`:

```js
/**
 * propose_campaign's action change (the moment spec §4.9 A5): a playbook that exists paused, resumed, renamed or retimed,
 * proposed as a card through the real registry over a workspace in memory. The card is judged by the PUT's own core
 * judgement (checkPlaybookPatch, against the playbook as it stands), carries what changes and what it held and nothing
 * else of the playbook, says a pause leaves a waiting run waiting and a resume's mode in full, and its Approve and Undo
 * go to the real route.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PROPOSAL_SPECS, PLAYBOOK_PATCH_WORDS, REACH_OUT_IS_NOT_A_MOMENT } = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const playbookRoute = await import(at("apps/dashboard/app/api/v1/playbooks/[id]/route.ts"));
beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");
const PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const STEP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

const playbookRow = (over = {}) => ({
  id: PB,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  template_name: "month_offer",
  template_language: "en",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  channels: null,
  ...over,
});
const tables = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ }],
  policies: [{ tenant_id: A, class: "reengage", mode: "auto", subject_type: null, limits: null }],
  playbooks: [playbookRow()],
  broadcasts: [],
  segments: [],
  decisions: [],
  events: [],
  ...over,
});
/** The change_playbook door in memory, as the route calls it. */
const changeDoor = (rows) => ({
  change_playbook: (a) => {
    const p = rows.playbooks.find((x) => x.id === a.p_playbook_id && x.tenant_id === a.p_tenant_id);
    if (!p) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
    const was = Object.fromEntries(Object.keys(a.p_set).map((k) => [k, p[k]]));
    Object.assign(p, a.p_set);
    rows.decisions.push({ id: `d${rows.decisions.length + 1}`, verb: a.p_set.state ? `${a.p_set.state}` : "change_playbook" });
    return { id: p.id, was, decision_id: `d${rows.decisions.length}`, undo_dropped: false };
  },
});
const change = (input, rows = tables(), faults = {}) => {
  const supabase = fakeDb(rows, faults, changeDoor(rows));
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return buildProposal(t, "propose_campaign", { action: "change", playbook_id: PB, ...input });
};
const said = (r) => JSON.parse(r.result).error;
/** A card's commit or undo, sent to the real PUT over the same rows. */
const sendTo = async (rows, call) => {
  assert.equal(call.route, "PUT playbooks/[id]");
  setRateStore(memoryStore());
  return playbookRoute.PUT.run(new Request("http://localhost/api/v1/x", { method: "PUT", body: JSON.stringify(call.body) }), {
    supabase: fakeDb(rows, {}, changeDoor(rows)),
    userId: USER,
    email: "ada@example.com",
    params: call.params,
  });
};

test("a rename and a new hour: a card that carries what changes and what it held, in the product's words, and whose Approve and Undo are the playbook's own PUT", async () => {
  const rows = tables();
  const made = await change({ name: "Past clients", run_hour: 9 }, rows);
  assert.equal(made.isError, false, made.result);
  const p = made.proposal;
  assert.deepEqual([p.kind, p.needs, p.title, p.undo], ["playbook_change", "operator", "Change: Win-back", "Put it back"]);
  assert.equal(p.summary, [PLAYBOOK_PATCH_WORDS.name("Past clients"), PLAYBOOK_PATCH_WORDS.run_hour(9, 10)].join(" · "));
  assert.deepEqual(p.payload, {
    playbook_id: PB,
    playbook_name: "Win-back",
    name: "Past clients",
    run_hour: 9,
    was: { name: "Win-back", run_hour: 10 },
    run_waits: false,
    timezone: TZ,
  });
  const spec = PROPOSAL_SPECS.playbook_change;
  const approved = await sendTo(rows, spec.commit(p, { settings: null }));
  assert.deepEqual([rows.playbooks[0].name, rows.playbooks[0].run_hour], ["Past clients", 9]);
  const undo = spec.undo.call(spec.undo.record(p, approved, { settings: null }), { settings: null });
  await sendTo(rows, undo);
  assert.deepEqual([rows.playbooks[0].name, rows.playbooks[0].run_hour], ["Win-back", 10]);
});

test("a pause says the run that waits stays waiting; a resume says its class's mode in full, unattended under auto", async () => {
  const waiting = { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", tenant_id: A, playbook_id: PB, state: "pending_approval", recipient_count: 12 };
  const pause = await change({ state: "paused" }, tables({ broadcasts: [waiting] }));
  assert.equal(pause.isError, false, pause.result);
  assert.deepEqual([pause.proposal.title, pause.proposal.undo], ["Pause: Win-back", "Resume it"]);
  assert.equal(pause.proposal.summary, `${PLAYBOOK_PATCH_WORDS.paused} · ${PLAYBOOK_PATCH_WORDS.pausedWaits(12)}`);
  assert.equal(pause.proposal.payload.run_waits, true);
  const resume = await change({ state: "running" }, tables({ playbooks: [playbookRow({ state: "paused" })] }));
  assert.equal(resume.isError, false, resume.result);
  assert.equal(resume.proposal.title, "Resume: Win-back");
  assert.match(resume.proposal.summary, /^Runs again under “Re-engage” \(auto\): .*unattended/);
  // The mode is the one thing a resume says that it cannot know unread (D7): a failed read is no card, never a guess.
  const unread = await change(
    { state: "running" },
    tables({ playbooks: [playbookRow({ state: "paused" })] }),
    { "policies.select": { message: "the read failed" } },
  );
  assert.equal(unread.isError, true);
  assert.match(said(unread), /sending mode .* could not be read/);
});

test("a change is refused in words before any card: not an id, not this workspace's, a reach-out's step, a value out of bounds, a cadence off the month's offer, and nothing that would change", async () => {
  assert.match(said(await change({ playbook_id: "nope", state: "paused" })), /^playbook_id must be a playbook's id/);
  assert.match(
    said(await change({ playbook_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9", state: "paused" })),
    /^no such playbook in this workspace/,
  );
  const step = tables({ playbooks: [playbookRow({ id: STEP, kind: "reach_out", trigger: "lead_first", name: "Movers" })] });
  assert.match(said(await change({ playbook_id: STEP, state: "paused" }, step)), /reach-out is changed on its own sheet/);
  assert.equal(said(await change({ run_hour: 7 })), "The hour must be a whole number from 9 to 20.");
  assert.equal(said(await change({ name: "x".repeat(81) })), PLAYBOOK_PATCH_WORDS.nameLong(80));
  assert.equal(said(await change({ cadence_days: 14 })), PLAYBOOK_PATCH_WORDS.cadenceOffer("Win-back"));
  assert.equal(said(await change({ state: "running", run_hour: 10 })), PLAYBOOK_PATCH_WORDS.same("Win-back"));
  // A field only another action takes is refused by the registry, so a change card never quietly becomes another.
  assert.match(said(await change({ state: "paused", trigger: "lapsed" })), /trigger/);
  assert.ok(REACH_OUT_IS_NOT_A_MOMENT);
});
```

If the fake database refuses a column of `policies` or `broadcasts` named here, add the column it names with a made-up
value (`_rows.mjs`'s rule: a row fills every column the table has).

- [ ] **Step 2: Run it to see it fail**

Run: `git add -N tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs`
Expected: FAIL — `propose_campaign: action change` is not an action the schema lists.

- [ ] **Step 3: Export the mode words**

In `act/playbook.ts` line 77, change `const MODE_WORDS: Record<string, string> = {` to
`export const MODE_WORDS: Record<string, string> = {` and add to its comment "(also the change card's, act/playbook-change.ts)".

- [ ] **Step 4: Write the action**

Create `act/playbook-change.ts`:

```ts
import "server-only";
import { z } from "zod";
import {
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  PLAYBOOK_STATES,
  noteRows,
  triggerOf,
  type PlaybookPatch,
  type PlaybookPolicyClass,
} from "@chanlytics/contracts";
import { checkPlaybookPatch } from "@chanlytics/core";
import { listPolicies, playbookForChange } from "@chanlytics/db";
import { archivedListRefusal } from "../../../campaigns/playbooks";
import { UUID, actAction, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";
import { MODE_WORDS } from "./playbook";

/** Where a playbook's id is read, said as the model calls it. */
const PLAYBOOK_FROM = "campaigns with action playbooks";

/** How a resumed playbook's runs go, in full (D7): under auto, that nobody approves a run before it sends. */
const resumeDoes = (mode: string): string =>
  mode === "auto"
    ? `${MODE_WORDS.auto}, unattended: nobody approves a run before it sends`
    : (MODE_WORDS[mode] ?? mode);

/** A change's parts, in the card's words and the keys' order. */
function changeParts(set: PlaybookPatch, was: PlaybookPatch, how: { cls: string; mode: string; waits: number | null }) {
  const W = PLAYBOOK_PATCH_WORDS;
  const parts: string[] = [];
  if (set.state === "paused") parts.push(W.paused, ...(how.waits === null ? [] : [W.pausedWaits(how.waits)]));
  if (set.state === "running") parts.push(W.resumed(how.cls, how.mode, resumeDoes(how.mode)));
  if (set.name !== undefined) parts.push(W.name(set.name));
  for (const k of ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const) {
    const to = set[k];
    if (to !== undefined) parts.push(W[k](to, was[k] ?? to));
  }
  return parts;
}

/**
 * A playbook that exists, paused, resumed, renamed or retimed (the moment spec §4.9 A5): what its drawer does, proposed
 * as a card. It reads the one playbook (packages/db playbookForChange: its row, and a run of it that waits), never the
 * Playbooks page, and judges what is asked by the PUT's own judgement (core checkPlaybookPatch, against the playbook as
 * it stands), so a value its Approve would refuse is refused here in the same words. The card carries what changes and
 * what each field held, and nothing else of the playbook, so its Approve and its Undo change nothing else. A pause leaves
 * a run that waits waiting, and says so (D8); a resume says its class's mode, in full under auto (D7).
 */
async function proposePlaybookChange(
  t: ToolContext,
  input: PlaybookPatch & { playbook_id: string },
): Promise<ProposalOutcome> {
  // An id is one id in either case: the pattern takes both, so the row is asked for as the table writes it.
  const id = str(input.playbook_id, 40).toLowerCase();
  if (!UUID.test(id)) return refuse(`playbook_id must be a playbook's id, as ${PLAYBOOK_FROM} gives it`);
  const row = await playbookForChange(t.ctx.supabase, t.tenantId, id);
  if (!row) return refuse(`no such playbook in this workspace; ${PLAYBOOK_FROM} names them`);
  if (triggerOf(row.trigger)?.kind === "reach_out")
    return refuse("a reach-out is changed on its own sheet: say so, and open campaigns");
  // The playbook is a row the answer may cite, opened where its drawer is.
  noteRows(t.read, [{ kind: "playbook" as const, id: row.id, route: `campaigns/moment:${row.id}`, label: row.name }]);
  const asked = Object.fromEntries(PLAYBOOK_PATCH_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
  let judged: { set: PlaybookPatch; was: PlaybookPatch };
  try {
    judged = await checkPlaybookPatch({ archivedList: (r) => archivedListRefusal(t.ctx, r) }, row, asked);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const { set, was } = judged;
  if (Object.keys(set).length === 0) return refuse(PLAYBOOK_PATCH_WORDS.same(row.name));
  const cls = (row.policy_class ?? triggerOf(row.trigger)?.cls ?? "campaign") as PlaybookPolicyClass;
  // The mode its runs go under, read only for a resume, the one card that says it (D7: under auto a resume sends
  // unattended). A read that fails makes no card: the card would say a mode it does not know.
  const policies = set.state === "running" ? await listPolicies(t.ctx.supabase, t.tenantId).catch(() => null) : [];
  if (!policies)
    return refuse(
      `the sending mode of “${PLAYBOOK_CLASS_LABEL[cls] ?? cls}” could not be read just now, so a resume cannot say what its runs would do; say so, and try again in a moment`,
    );
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const waits = row.waiting ? row.waiting.recipient_count : null;
  return propose({
    kind: "playbook_change",
    title: PLAYBOOK_PATCH_WORDS.title(set, row.name),
    summary: changeParts(set, was, { cls: PLAYBOOK_CLASS_LABEL[cls] ?? cls, mode, waits }).join(" · "),
    payload: { playbook_id: row.id, playbook_name: row.name, ...set, was, run_waits: row.waiting !== null, timezone: t.timezone },
  });
}

const L = PLAYBOOK_LIMITS;

/** A playbook that exists, changed in place: propose_campaign's action change. */
export const playbookChangeAction = actAction({
  kind: "playbook_change",
  input: z.object({
    playbook_id: z.string(),
    state: z.enum(PLAYBOOK_STATES).optional(),
    name: z.string().optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    gap_days: z.number().optional(),
    cadence_days: z.number().optional(),
  }),
  examples: [
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", state: "paused" },
    { playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", name: "Win-back for past clients", run_hour: 9 },
  ],
  label: "Preparing a campaign's change",
  words: `Action change takes playbook_id, a playbook that exists, as ${PLAYBOOK_FROM} gives it (or the page's rows), and only what they asked to change: state (paused stops its next runs; running starts them again under its class's autonomy mode), name (at most ${PLAYBOOK_NAME_MAX} characters), run_hour (${L.run_hour.min} to ${L.run_hour.max} by the business's clock), cap_per_run (${L.cap_per_run.min} to ${L.cap_per_run.max} people a run), gap_days (${L.gap_days.min} to ${L.gap_days.max} days before a person is reached again) or cadence_days (${L.cadence_days.min} to ${L.cadence_days.max}, the month's offer alone). Nothing else about it moves: its moment, message and list are its drawer's, and its channels are action channels'. A run already waiting for approval stays waiting after a pause, and the card says so: propose action run with verb skip beside it when they want that run gone. A reach-out's step, a value outside its bounds and a playbook that already reads so are refused in words.`,
  build: proposePlaybookChange,
});
```

`row.policy_class` is the table's text; the `as PlaybookPolicyClass` names it as the class set (no `as unknown as`).
`PLAYBOOK_CLASS_LABEL` is keyed by the class set, so `?? cls` is only a guard; drop it if typecheck calls it dead. A
policies read that answers with no row for the class is no failure: the class then runs under the mode a missing row
means where a run reads it (00274's default, `ask`; read core's policy read and keep its default if it says another),
and the card says that one.

- [ ] **Step 5: Register it**

In `act/campaign.ts`: `import { playbookChangeAction } from "./playbook-change";`; in `actions` add
`change: playbookChangeAction` after `channels: playbookChannelsAction`; at the end of `description` replace
"…or the channels a playbook that exists goes by, changed." with "…the channels a playbook that exists goes by, changed,
or a playbook that exists paused, resumed, renamed or retimed."; in `tail`, after the sentence that ends "…the channels
it goes by now." insert " Call action change to pause, resume, rename or retime a playbook that exists, by its
playbook_id from campaigns with action playbooks or the page's rows."; add to the doc comment "and since 9 Oct 2026 a
playbook that exists changed in place (change: what its drawer's Pause, Resume and Edit of its name and clock do)".

- [ ] **Step 6: Run the tool test**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 7: The registry's tables and the frozen tools**

1. `tooling/evals/rename-ask-tools.mjs`: insert `"propose_campaign.change",` in `ADDED_SINCE` **before**
   `"propose_campaign.channels",` (the list is sorted as JavaScript sorts strings, and "change" sorts before "channels";
   `ask-registry.test.mjs:477-480` compares the sorted registry with `ADDED_SINCE` as it stands, so an unsorted list is a
   red test), and add "and 9 Oct 2026's action change" to its comment.
2. `tooling/scripts/tests/ask/ask.test.mjs` line 1120: `["propose_campaign", ["broadcast", "playbook", "run", "channels", "change"]],`.
3. `tooling/scripts/tests/ask/ask-registry.test.mjs`, in the invariant test:
   - the three enums at lines ~377–380 (`["broadcast", "playbook", "run", "channels"]`, one per role but the viewer's
     `null`) gain `"change"` at the end;
   - the destructure `const { broadcast_id: _b, verb: _v, playbook_id: playbookId, channels, ...fields } = now.input_schema.properties;`
     becomes `const { broadcast_id: _b, verb: _v, playbook_id: playbookId, channels, state: _s, gap_days: _g, cadence_days: _c, ...fields } = now.input_schema.properties;`
     and under it add
     `assert.deepEqual([_s, _g, _c].map(shapeOf), [{ type: "string", enum: ["running", "paused"] }, { type: "number" }, { type: "number" }], \`${role}: change's own three fields\`);`
     (if `shapeOf` drops `enum`, compare `_s` with `{ type: "string", enum: ["running", "paused"] }` directly);
   - the examples filter becomes `now.input_examples.filter((ex) => !["run", "channels", "change"].includes(ex.action))`;
   - after the two `now.description.includes(...)` lines add
     `assert.ok(now.description.includes(\` ${DEFS.get("propose_campaign").actions.change.words} \`), role);`;
   - in the file's header comment, after "PR 4.7 added propose_list…" add "; 9 Oct 2026 gave propose_campaign a change
     in place (change)".
4. R5: regenerate `ask-tools-4-7.json`. `git diff --stat` on it: only the three roles' `propose_campaign` change.

- [ ] **Step 8: Run the registry and its neighbours**

Run each with R1: `tooling/scripts/tests/ask/ask-registry.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs`,
`tooling/scripts/tests/ask/ask-tool-names.test.mjs`, `tooling/scripts/tests/ask/rename-ask-tools.test.mjs`,
`tooling/scripts/tests/ask/ask-turn.test.mjs`. Expected: PASS. `ask-tool-names` compares the old tools' answers, none of
which is `change`: it should pass unchanged.
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` — Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/src/server/ask/tools/act/playbook-change.ts apps/dashboard/src/server/ask/tools/act/campaign.ts apps/dashboard/src/server/ask/tools/act/playbook.ts tooling/evals/rename-ask-tools.mjs tooling/scripts/tests/ask/ask.test.mjs tooling/scripts/tests/ask/ask-registry.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs
git commit -m "Ask pauses, resumes, renames and retimes a playbook through a card, an action of propose_campaign" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 10: The playbook card adds a missing starter, refuses a running twin, and says the month's allowance

> **Decided 10 Oct (coordinator, option A, built in Task 7):** a starter's WhatsApp version is held only once Meta
> approves it, and core refuses a playbook none of whose channels the message holds. So before anything is filed the
> starter card needs a channel the message holds at once (an email or text version filed with it, or a WhatsApp version
> already approved), or it is refused in words with nothing filed and Meta never called. Where the card names no channels
> it goes by those at-once channels plus WhatsApp where the workspace has a number (the win-back: WhatsApp, held until
> Meta approves, and email, held until offers by email are set up), each kept channel holding its people until it can
> send. **This task's card says every channel it will go by and which hold people until they can**, from the existing
> words where they exist. The alternative (core accepting a playbook whose only channel is a WhatsApp version in review)
> is a product rule left to Ruben at review.

**Files:**
- Modify: `act/playbook.ts` (`heldStarter` line 140, `playbookChannelsSaid` line ~232, `proposePlaybook` line 278, the
  action's words line 467)
- Modify: `act/campaign.ts` (the tail's starter sentence)
- Create (tests): `tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs`,
  `tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`
- Modify (test): `tooling/scripts/tests/ask/ask-tool-names.test.mjs` (the reads a playbook card makes; its title's word),
  and every other test that pins a playbook card's title (`git grep -ln "Playbook: " -- tooling/scripts/tests e2e`)
- Regenerate: `ask-tools-4-7.json` (R5)

Three gaps, one function: a fresh workspace holds no starter, so the first-day setup proposed nothing (P0-6, D23); a
second "set up" proposed a twin (D9); and a card going by email or text never said the month's allowance would hold
people back (A7). `proposePlaybook` is a baselined function (138 lines, 33 branches): helpers move out of it first, so it
shrinks while it gains the three. The starter card is held to everything the route will hold it to at Approve, by the
same function (`checkStarterPlaybook`, Task 7): the moment offered here (`momentOffered`), its list, the starter the
moment's own, its slots, its numbers, its channels; and it says the same sentences the message card says (the moment
and its schedule, what holds its runs, the allowance, who said yes, the class's mode). Both cards' titles say
"Campaign", the word a person reads (D19): this task writes them, so it moves their pins (Task 18B renames the rest).

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs`. Its world is the one
`tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs` builds: copy that file's lines from `const A = …`
(line ~50) through the `beforeEach`/`after` pair (line ~233) verbatim (the people `row` builder, `PEOPLE`, `template`,
`version`, `tables`, `OPEN_EDGE`, `CLOSED_EDGE`, `edgeSays`, the fetch stub), with this file's own imports and header:

```js
/**
 * A playbook proposed on a moment whose starter this workspace does not hold yet (the moment spec's A0, D23): the card
 * carries the starter's key in place of a message, says the starter is added at Approve and that its WhatsApp version
 * goes to Meta for review, which cannot be taken back, and counts who the moment names that said the yes the starter
 * needs. Nothing is filed at the card. A starter that takes words of its own (the month's offer) is not proposed this way.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PROPOSAL_SPECS, WIN_BACK_WORDS, defaultParamSpecs, startersForTrigger } = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
```

then, after the copied world:

```js
const propose = (input, db = {}) => {
  const rows = tables({ templates: [], ...db });
  const supabase = fakeDb(rows, {}, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return { made: buildProposal(t, "propose_campaign", { action: "playbook", ...input }), rows };
};
const said = (r) => JSON.parse(r.result).error;

test("a moment whose starter is not on file: a card that names the starter, says it is added at Approve with its WhatsApp version sent to Meta for review, and commits the key in place of a message", async () => {
  const starter = startersForTrigger("quiet_30").find((s) => !s.retired);
  const { made, rows } = propose({ trigger: "quiet_30" });
  const r = await made;
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.kind, "playbook");
  assert.match(p.title, /^Campaign: /, "the word a person reads");
  assert.equal(p.payload.starter_key, starter.key);
  assert.equal("template_id" in p.payload, false);
  // Its slots, filled with the starter's own sources: what the route fills them with at Approve.
  assert.deepEqual(p.payload.params, defaultParamSpecs({ name: starter.name, variables: [] }));
  assert.match(p.summary, new RegExp(`adds the “${starter.title}” starter first`));
  assert.match(p.summary, /Meta for review, which cannot be taken back/);
  assert.match(p.summary, /said yes to offers/);
  const body = PROPOSAL_SPECS.playbook.commit(p, { settings: null }).body;
  assert.deepEqual([body.starter_key, body.template_id, body.trigger], [starter.key, undefined, "quiet_30"]);
  assert.deepEqual(body.params, p.payload.params);
  assert.equal(PROPOSAL_SPECS.playbook.open(p, null), "campaigns/new:moment:quiet_30", "Open in the composer");
  assert.deepEqual(rows.templates, [], "nothing is filed at the card");
});

test("a starter card is refused for what its Approve would be refused for, in the same words, and nothing is filed: a number out of bounds, a moment this workspace is not offered", async () => {
  const one = propose({ trigger: "quiet_30", run_hour: 7 });
  assert.equal(said(await one.made), "The hour must be a whole number from 9 to 20.");
  // The win-back by appointments needs a calendar, and this world has none: momentOffered refuses it, as the route does.
  const two = propose({ trigger: "lapsed" });
  assert.equal(said(await two.made), WIN_BACK_WORDS.lapsed);
  assert.deepEqual([one.rows.templates, two.rows.templates], [[], []]);
});

test("a starter card says what the message card says of a channel not ready: its runs hold everyone until WhatsApp is", async () => {
  // The copied world's CLOSED_EDGE and a workspace with no WhatsApp number (read how ask-campaign-channels.test.mjs
  // makes WhatsApp not ready, and do that here).
  const { made } = propose({ trigger: "quiet_30" }, { tenant_channels: [] });
  const r = await made;
  assert.equal(r.isError, false, r.result);
  assert.match(r.proposal.summary, /Its runs hold everyone until it is\./);
});

test("a starter that takes words of its own (the month's offer) is not proposed on a key: the model is told to ask for the words and name a message", async () => {
  const r = await propose({ trigger: "everyone_monthly" }).made;
  assert.equal(r.isError, true);
  assert.match(said(r), /takes words of its own/);
});
```

If `startersForTrigger("quiet_30")` returns no starter in this tree (lane 2 may rename the starters by the appointment
word), use the first trigger `PROPOSABLE_TRIGGERS` in `act/playbook.ts` offers that has one.

Create `tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs` with the same header shape (its own
comment below), the same imports plus `CAMPAIGN_MONTH_ALLOWANCE` from contracts and
`const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));`, the same copied world, and:

```js
/**
 * A playbook card is held to the running ones (D9): a second on the same moment, list and message is refused in words,
 * unless they named it apart; and a playbook or broadcast card going by email or text says what the month's allowance
 * will hold back (A7, contracts allowanceBeforeSend), read only where a metered channel is named.
 */
const OFFER_PB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5";
const running = {
  id: OFFER_PB,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: OFFER,
  template_name: "month_offer",
  template_language: "en",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_at: "2026-09-01T00:00:00Z",
  channels: null,
};
const propose = (input, db = {}, monthSent = { email: 0, sms: 0 }) => {
  const rows = tables(db);
  setServiceClient(fakeDb(rows, {}, { campaign_month_sent: (a) => monthSent[a.p_channel] ?? 0 }));
  const supabase = fakeDb(rows, {}, { people_list: () => PEOPLE });
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, "owner", TZ, NOW);
  return buildProposal(t, "propose_campaign", input);
};
const said = (r) => JSON.parse(r.result).error;
const WIN_BACK = { action: "playbook", trigger: "quiet_30", template_id: OFFER, params: [] };

test("a running twin is refused in words; a second named apart is a card", async () => {
  const twin = await propose(WIN_BACK, { playbooks: [running] });
  assert.equal(twin.isError, true);
  assert.equal(
    said(twin),
    "“Win-back” already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own",
  );
  assert.equal(said(await propose({ ...WIN_BACK, name: "Win-back" }, { playbooks: [running] })), said(twin));
  const apart = await propose({ ...WIN_BACK, name: "Win-back for past clients" }, { playbooks: [running] });
  assert.equal(apart.isError, false, apart.result);
  // A paused one, another message or another list is no twin.
  const paused = await propose(WIN_BACK, { playbooks: [{ ...running, state: "paused" }] });
  assert.equal(paused.isError, false, paused.result);
});

test("a card by email says what the month's allowance holds back, and says nothing while there is room or where it goes by WhatsApp alone", async () => {
  const byEmail = { ...WIN_BACK, channels: ["whatsapp", "email"] };
  const full = await propose(byEmail, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 });
  assert.equal(full.isError, false, full.result);
  assert.match(full.proposal.summary, /used up: .* held back/);
  const room = await propose(byEmail, {}, { email: 0, sms: 0 });
  assert.doesNotMatch(room.proposal.summary, /held back/);
  const whatsapp = await propose(WIN_BACK, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 });
  assert.doesNotMatch(whatsapp.proposal.summary, /held back/);
});
```

(Task 11 adds the broadcast's own test to this file.)

- [ ] **Step 2: Run them to see them fail**

Run: `git add -N tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs`
Expected: FAIL — the card is refused ("the … starter has no version this workspace can send yet…").
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`
Expected: FAIL — a twin is proposed; no allowance words.

- [ ] **Step 3: Imports**

In `act/playbook.ts` add to the contracts import `PLAYBOOK_DEFAULTS`, `PLAYBOOK_NAME_MAX`, `allowanceBeforeSend`,
`type PlaybookPolicyClass`, `type StarterTemplate`; add `import { checkStarterPlaybook } from "../../../campaigns/starter-templates";`,
`import { listPolicies, runningTwins } from "@chanlytics/db";` (replacing the `listPolicies` import),
`import { monthSentOrNull } from "../../../campaigns/month-sent";`, and change the `../../../campaigns/playbooks` import
to `import { checkPlaybookInput, noFollowUps, proposalFollowUps, type PlaybookInput } from "../../../campaigns/playbooks";`.
(`checkStarterPlaybook` holds the starter card to the route's checks, so this module needs neither `playbookNumber` nor
`starterText` of its own.)

- [ ] **Step 4: `heldStarter` says which starter it would add**

Replace `heldStarter`'s signature and last line:

```ts
async function heldStarter(
  t: ToolContext,
  trig: { id: string; label: string },
): Promise<{ id: string } | { refusal: string; starter: StarterTemplate | null }> {
```

```ts
  return {
    refusal: `the “${written[0]?.title ?? trig.label}” starter has no version this workspace can send yet; say so and suggest adding the starter set under ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}, or name a message from ${AUDIENCES_CALL}`,
    // The one a card may add at its Approve (A0): the moment's starter still offered.
    starter: written.find((s) => !s.retired) ?? null,
  };
```

and add to its doc comment: "Where none is, the starter a card may add at Approve (A0)."

- [ ] **Step 5: `playbookChannelsSaid` carries the allowance**

Give it a fourth parameter and append it to `waiting` in both returns:

```ts
function playbookChannelsSaid(
  how: CampaignHow,
  by: { channels: ConsentChannel[]; named: boolean },
  byChannel: Record<ConsentChannel, number> | undefined,
  held: string,
): { goes: string; waiting: string } {
  if (!by.named) {
    const wa = how.ready.whatsapp;
    return {
      goes: "",
      waiting: `${wa.ready ? "" : `${wa.why ?? "WhatsApp is not ready"} Its runs hold everyone until it is. · `}${held}`,
    };
  }
  const waiting = by.channels
    .filter((c) => !how.ready[c].ready)
    .map((c) => `${how.ready[c].why ?? `${c} is not ready`} Its runs hold those people until it can. · `);
  const counts = byChannel ?? { whatsapp: 0, sms: 0, email: 0 };
  return { goes: ` · ${proposalChannelsWords(by.channels, counts)}`, waiting: `${waiting.join("")}${held}` };
}
```

and add "and, where it goes by email or text, what the month's allowance holds back (allowanceHeld)" to its comment.

- [ ] **Step 6: The helpers out of `proposePlaybook`, and the new three**

Directly above `proposePlaybook` add:

```ts
type Trigger = NonNullable<ReturnType<typeof triggerOf>>;

/** The proposal follow-up (0006): only where deals are on, and one per workspace (00167); its refusal, or null. */
async function followUpRefusal(t: ToolContext, trig: Trigger): Promise<string | null> {
  if (trig.kind !== "deal") return null;
  const [sellsBy, one] = await Promise.all([
    sellsByOf(t.ctx, t.tenantId),
    t.ctx.supabase
      .from("playbooks")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .eq("trigger", trig.id)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!triggerOffered(trig, dealsAreOn(sellsBy))) return FOLLOW_UP_NEEDS_DEALS;
  return one.data ? FOLLOW_UP_ONE : null;
}

/**
 * A new playbook's body, checked by the route's own check (existing null: the check holds it to the moments offered now,
 * with this workspace's calendar, read from the zone and settings the turn holds, readers/facts.ts, never again); or its
 * refusal. The channels are the ones it names, or the composer's own default; a tick its purpose never carries is refused
 * in the composers' words.
 */
async function checkedPlaybook(
  t: ToolContext,
  input: PlaybookProposed,
  trig: Trigger,
  listRef: ListRef | null,
  said: { templateId: string; specs: ParamSpec[]; channels: ConsentChannel[] | undefined },
): Promise<PlaybookInput | { refusal: string }> {
  try {
    return await checkPlaybookInput(
      t.ctx,
      t.tenantId,
      {
        name: str(input.name, 80) || undefined,
        trigger: trig.id,
        ...(listRef ? (listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }) : {}),
        ...(listRef ? { policy_class: str(input.policy_class, 20) || undefined } : {}),
        template_id: said.templateId,
        params: said.specs,
        run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
        cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
        channels: said.channels,
      },
      null,
      zoneAndSettings(t.rc),
    );
  } catch (e) {
    return { refusal: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A second running playbook on the same moment, list and message (the moment spec, D9): a second "set up my campaigns"
 * proposed a twin win-back, which the week's breath then left reaching nobody. Refused in words, unless they named this
 * one apart from every one that runs: a name of its own is a second they asked for. Null where there is no twin.
 */
async function twinRefusal(t: ToolContext, checked: PlaybookInput, named: string | undefined): Promise<string | null> {
  const twins = await runningTwins(t.ctx.supabase, t.tenantId, {
    trigger: checked.trigger,
    listId: checked.list_id,
    listKey: checked.list_key,
    templateId: checked.template_id,
  });
  // Bound and checked, never `twins[0].name`: an index read the compiler lets pass is a new offender in a file at 0
  // (unchecked-index.json).
  const [first] = twins;
  if (!first) return null;
  const own = str(named, PLAYBOOK_NAME_MAX);
  if (own && !twins.some((x) => x.name === own)) return null;
  return `“${first.name}” already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own`;
}

/**
 * Who a new playbook's run reaches now, and who its moment names said the yes it needs, as a run counts them (audience.ts
 * poolList over the pool, the week's touches, a proposal's pace less whoever had their follow-up), with the workspace's
 * autonomy rows; or why not, in the model's words. `message` is the yes its words need; `how` the channels it goes by.
 */
async function reachNow(
  t: ToolContext,
  trig: Trigger,
  listRef: ListRef | null,
  message: { category: string | null },
  how: CampaignHow,
) {
  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
    // A proposal's moment is counted as the page counts it (0006): by the pace, less whoever had their follow-up.
    deal ? dealPaceRead(t.ctx, t.tenantId, t.now) : Promise.resolve(null),
    deal ? proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null) : Promise.resolve(noFollowUps()),
  ]);
  if (!followUps)
    return {
      refusal: "who already had a proposal follow-up could not be read just now; say so, and try again in a moment",
    };
  const untouched = { byThis: new Map<string, number>(), byAny: new Map<string, number>(), ...followUps };
  // A list's people, as a run counts them (listedPeople).
  const listed = listRef ? await listedPeople(t, pool, listRef) : { ids: null, label: null };
  if ("refusal" in listed) return listed;
  // By the channels it goes by, the workspace ready on them or not: a run holds the people it cannot reach there.
  const drawn = playbookRunReach(
    pool.rows,
    { trigger: trig.id, cap_per_run: 100_000, gap_days: 0, cadence_days: 0, message, ...how },
    untouched,
    t.now.getTime(),
    dealPaceOf(paceRead),
    listed.ids,
  );
  return { drawn, policies, listLabel: listed.label };
}

/**
 * What the month's email and text allowance will hold back of a run that goes by them (A7; contracts
 * allowanceBeforeSend, the composer's own sentence), with its separator; nothing while there is room, where it goes by
 * WhatsApp alone (no count is read), or where the month could not be counted.
 */
async function allowanceHeld(
  t: ToolContext,
  channels: readonly ConsentChannel[],
  byChannel: Record<ConsentChannel, number> | undefined,
  trigger: string | null,
  purpose: AskedPurpose,
): Promise<string> {
  if (!byChannel || !channels.some((c) => c !== "whatsapp")) return "";
  const words = allowanceBeforeSend(byChannel, await monthSentOrNull(t.tenantId, t.now), trigger, purpose);
  return words ? `${words} · ` : "";
}

/** What a starter card says it does first (A0): files the starter, its WhatsApp version going to Meta for review. */
const starterFirst = (title: string): string =>
  `adds the “${title}” starter first: its email and text versions are ready at once, and where there is a WhatsApp number its WhatsApp version goes to Meta for review, which cannot be taken back`;

/**
 * A playbook on a moment whose starter this workspace does not hold yet (the moment spec's A0, D23): the card names the
 * starter by its key, and its Approve files the starter as the composer's one press does (POST playbooks with
 * starter_key), then starts the playbook on it. Nothing is filed at the card: an act only checks and proposes. It is held
 * here to everything its Approve will be held to, by the route's own function (srv/campaigns/starter-templates.ts
 * checkStarterPlaybook: the moment offered here, momentOffered with the workspace's calendar; its list and class; the
 * starter the moment's own, with no words of its own to write; its numbers; its channels), in the same words, so a card
 * the route would refuse is never made. Its slots are the starter's own sources, which the payload carries and the
 * commit sends. It says what the message card says (the moment and its schedule, where it goes and what holds its runs,
 * the month's allowance, who said yes, the class's mode); its count is who the moment names that said the yes the
 * starter needs, by WhatsApp where it names no channel, as a card that names none counts.
 */
async function proposeOnStarter(
  t: ToolContext,
  input: PlaybookProposed,
  trig: Trigger,
  listRef: ListRef | null,
  starter: StarterTemplate,
): Promise<ProposalOutcome> {
  let judged: Awaited<ReturnType<typeof checkStarterPlaybook>>;
  try {
    judged = await checkStarterPlaybook(
      t.ctx,
      t.tenantId,
      {
        trigger: trig.id,
        starter_key: starter.key,
        ...(listRef ? (listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }) : {}),
        ...(listRef ? { policy_class: str(input.policy_class, 20) || undefined } : {}),
        run_hour: input.run_hour,
        cap_per_run: input.cap_per_run,
        ...(input.channels !== undefined ? { channels: input.channels } : {}),
      },
      zoneAndSettings(t.rc),
    );
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  const { params, cls } = judged;
  // By the channels it names, else WhatsApp, as a card that names none says it; what is not ready holds its runs.
  const by = { channels: input.channels ?? (["whatsapp"] as ConsentChannel[]), named: input.channels !== undefined };
  const how = await whatsappHow(t, messageAboutOfTrigger(trig.id));
  const reach = await reachNow(t, trig, listRef, { category: starter.category }, how);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, policies, listLabel } = reach;
  const held = await allowanceHeld(t, by.channels, drawn.reach.by_channel, trig.id, purposeOfPlaybook(cls));
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const name = str(input.name, PLAYBOOK_NAME_MAX);
  const clock = {
    trigger: trig.id,
    run_hour: input.run_hour ?? PLAYBOOK_DEFAULTS.runHour,
    cap_per_run: input.cap_per_run ?? PLAYBOOK_DEFAULTS.capPerRun,
    gap_days: PLAYBOOK_DEFAULTS.gapDays,
    cadence_days: PLAYBOOK_DEFAULTS.cadenceDays,
  };
  // The moment and its schedule in the workspace's word, as lane 2 made proposePlaybook say them (its `wordedMoment`
  // helper over readers/facts.ts businessShape; scheduleLine takes the word).
  const { word, moment } = await wordedMoment(t, trig);
  return propose({
    kind: "playbook",
    title: `Campaign: ${name || moment.label}`,
    summary: `${listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`} · ${scheduleLine(clock, word)}${goes} · ${waiting}${starterFirst(starter.title)} · ${saidYesWords("the list", purposeOfPlaybook(cls), drawn.reach.will, drawn.saidYes)} · under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}.`,
    payload: {
      trigger: trig.id,
      trigger_label: moment.label,
      starter_key: starter.key,
      starter_title: starter.title,
      params,
      ...clock,
      name: name || null,
      candidates: drawn.reach.will,
      policy_class: cls,
      list_id: listRef?.kind === "saved" ? listRef.id : null,
      list_key: listRef?.kind === "builtin" ? listRef.id : null,
      mode,
      ...namedChannels(by),
    },
  });
}
```

Add `type AskedPurpose` to the contracts import (`allowanceHeld`'s parameter). `scheduleLine`'s parameter type is
`Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">`; if `clock.trigger` must be
the trigger union, type `clock` as that `Pick` (import `type PlaybookDto`). `checkStarterPlaybook` refuses a starter
that takes words of its own in the route's words ("…takes words of its own: write them in the composer…"), which the
model reads as the refusal; the action's words (Step 8) tell it to ask for the words and name a message instead.

- [ ] **Step 7: The new `proposePlaybook`**

Replace the whole `proposePlaybook` function with:

```ts
async function proposePlaybook(t: ToolContext, input: PlaybookProposed): Promise<ProposalOutcome> {
  const trig = triggerOf(str(input.trigger, 30));
  if (!trig) return refuse(`trigger must be one of ${PROPOSABLE_TRIGGERS.join(", ")}`);
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(input.list, 60)) : null;
  if (trig.kind === "saved" && !listRef)
    return refuse(`a playbook on a list needs list: the list's token from ${AUDIENCES_CALL} (seg:<id> or list:<id>)`);
  const followUp = await followUpRefusal(t, trig);
  if (followUp) return refuse(followUp);
  let templateId = str(input.template_id, 40);
  if (templateId && !UUID.test(templateId))
    return refuse(`template_id must be an id ${AUDIENCES_CALL} returned, or omitted for the trigger's starter`);
  if (!templateId) {
    const own = await heldStarter(t, trig);
    // A starter not on file is added at the card's Approve (A0), never refused while one is offered.
    if ("refusal" in own) return own.starter ? proposeOnStarter(t, input, trig, listRef, own.starter) : refuse(own.refusal);
    templateId = own.id;
  }
  const about = messageAboutOfTrigger(trig.id);
  const saying = await proposedSaying(t, input, templateId, { cls: trig.cls, onList: listRef !== null }, about);
  if ("refusal" in saying) return refuse(saying.refusal);
  const { asked, specs, picked } = saying;
  const { message } = asked;
  const checked = await checkedPlaybook(t, input, trig, listRef, { templateId: message.anchor.id, specs, channels: picked.channels });
  if ("refusal" in checked) return refuse(checked.refusal);
  const twin = await twinRefusal(t, checked, input.name);
  if (twin) return refuse(twin);
  // By the channels it goes by: said and committed whenever they are more than WhatsApp alone by default.
  const by = { channels: checked.channels, named: picked.channels !== undefined };
  const how = await playbookHow(t, message, by, about);
  const reach = await reachNow(t, trig, listRef, { category: message.category }, how);
  if ("refusal" in reach) return refuse(reach.refusal);
  const { drawn, policies, listLabel } = reach;
  const cls = checked.policy_class;
  const held = await allowanceHeld(t, by.channels, drawn.reach.by_channel, trig.id, purposeOfPlaybook(cls));
  // A tick that cannot send yet stays on the playbook, and its run holds those people until it can: the card says so.
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel, held);
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const said = cardSays(asked, specs, by, 140);
  if ("refusal" in said) return refuse(said.refusal);
  // The card says the moment and its schedule in the workspace's word (lane 2, Task 7's helper over businessShape).
  const { word, moment } = await wordedMoment(t, trig);
  return propose({
    kind: "playbook",
    title: `Campaign: ${checked.name}`,
    summary: `${listLabel ? `On ${listLabel}` : `${moment.label} — ${moment.hint.toLowerCase()}`} · ${scheduleLine(checked, word)}${goes} · ${waiting}${saidYesWords("the list", purposeOfPlaybook(cls), drawn.reach.will, drawn.saidYes)} · under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}. Says: ${said.says}`,
    payload: {
      trigger: trig.id,
      trigger_label: moment.label,
      template_id: message.anchor.id,
      template_name: message.name,
      params: specs,
      run_hour: checked.run_hour,
      cap_per_run: checked.cap_per_run,
      gap_days: checked.gap_days,
      cadence_days: checked.cadence_days,
      name: checked.name,
      candidates: drawn.reach.will,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode,
      // Named only when the proposal named some: a card that named none commits as it always did.
      ...namedChannels(by),
    },
  });
}
```

The summary and payload are byte for byte the card lane 2 left (its moment, schedule and `trigger_label` in the
workspace's word: `wordedMoment`, `word`, `moment`, `scheduleLine(checked, word)`; read the tree, and where lane 2
spelled these otherwise keep lane 2's spelling in both functions above); what moved is the title's first word
("Campaign: …", D19), the order of three reads (`playbookHow` before the pool), one read more (`runningTwins`), and the
allowance's words where a metered channel is named. `wordedMoment` is lane 2's helper in this file; `scheduleLine` takes
the word as a required argument since lane 2.

- [ ] **Step 8: The words**

In `playbookAction.words` replace "or omitted for the trigger's starter when the workspace holds it;" with "or omitted
for the trigger's starter, which the card adds at its Approve where the workspace does not hold it yet (its WhatsApp
version then goes to Meta for review, which the card says), but for a starter that takes words of its own such as the
month's offer;". In `act/campaign.ts`'s `tail`, replace "and a starter the workspace does not hold, or a typed value
left blank, is refused in words." with "a starter the workspace does not hold yet is added at the card's Approve, a typed
value left blank is refused in words, and a second running playbook on the same moment, list and message is refused
unless they name it apart."

- [ ] **Step 9: Run the tests and bank the fall**

Run each with R1: `tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs`,
`tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`, `tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`,
`tooling/scripts/tests/ask/ask-turn.test.mjs`. Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs`
Expected: FAIL on the two `propose_playbook` quiet_30 cards: one `playbooks.select` more, and the title's word. Fix in
the test. Lane 1 left the reads' last step as `withTotals` (`const reads = NAMES[old] === "report" ? withReviewReads(withTotals) : withTotals;`,
line ~903); just above that line add:

```js
    // 9 Oct 2026 (the moment spec, D9): a playbook proposed is held to the running ones on its moment, list and message
    // (packages/db runningTwins): one `playbooks` read more for a call that reaches its card.
    const readsTwins = NAMES[old] === "propose_campaign.playbook" && !want.isError;
    const withTwins = readsTwins ? [...withTotals, "playbooks.select"] : withTotals;
```

and change that line to `const reads = NAMES[old] === "report" ? withReviewReads(withTwins) : withTwins;`. Above
`function againstOffered` add the title's adjuster:

```js
/**
 * 9 Oct 2026 (the moment spec, decision 19): a playbook card's title says what a person calls it, "Campaign: …", where
 * these bytes say "Playbook: …". The kind, the action and the payload keep their names. The fixture stays as it was made.
 */
function withCampaignWord(frozen) {
  return frozen.replace('"card":"Playbook: ', '"card":"Campaign: ').replace('"title":"Playbook: ', '"title":"Campaign: ');
}
```

and, for `NAMES[old] === "propose_campaign.playbook"`, apply it to `result` and to the card the loop compares (wrap
whatever adjuster already stands there last). Every other pin of a playbook card's title moves to the new word now
(`git grep -ln "Playbook: " -- tooling/scripts/tests e2e`; a fixture's own words, such as Task 18's and Task 13's, are
Task 18B's). Run it again: Expected: PASS.
R5: regenerate `ask-tools-4-7.json` (the playbook action's and the tail's words). Run
`tooling/scripts/tests/ask/ask-registry.test.mjs` with R1. Expected: PASS.
R4: `proposePlaybook` shrank; bank its fall in `complexity.json` (or its removal, if it is now under every limit).
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/types/index-reads-are-counted.test.mjs` — Expected: PASS
(`act/playbook.ts` reads no index unchecked: `twinRefusal` binds its first twin).

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/src/server/ask/tools/act/playbook.ts apps/dashboard/src/server/ask/tools/act/campaign.ts tooling/scripts/tests/playbooks/ask-setup tooling/scripts/tests/ask/ask-tool-names.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json tooling/scripts/tests/baselines
git commit -m "Ask's playbook card adds a starter the workspace lacks, refuses a running twin, and says what the month's allowance holds back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add, by name, every other test whose pin of a card's title Step 9 moved.)

---

### Task 11: The broadcast card says the allowance; autonomy is judged by the policy matrix

**Files:**
- Modify: `act/broadcast.ts` (`broadcastReach` line 119; `proposeBroadcast`'s summary, line ~214)
- Modify: `act/policy.ts`
- Modify (tests): `tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs` (the broadcast assertion),
  `tooling/scripts/tests/ask/ask-turn.test.mjs` (line 1860), `tooling/scripts/tests/ask/ask-registry.test.mjs`
- Regenerate: `ask-tools-4-7.json` (R5)

`propose_autonomy` refused veto for every class but replies (`act/policy.ts:29`), while the product offers veto on the
re-engage and offer rows (`POLICY_CLASS_MODES`, `ct/config/workspace-config/policy-classes.ts:125`): a second rule for one
fact. It is judged by `policyModeRefusal` now, and its summary says the Autonomy page's words, not a class id.

- [ ] **Step 1: Write the failing tests**

1. Append to `tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`:

```js
test("a broadcast card by email says what the month's allowance holds back, as the send screen does; by WhatsApp alone it reads no count", async () => {
  const broadcast = { action: "broadcast", template_id: OFFER, audience_kind: "everyone", params: [] };
  const full = await propose({ ...broadcast, channels: ["whatsapp", "email"] }, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 });
  assert.equal(full.isError, false, full.result);
  assert.match(full.proposal.summary, /used up: .* held back/);
  const room = await propose({ ...broadcast, channels: ["whatsapp", "email"] }, {}, { email: 0, sms: 0 });
  assert.doesNotMatch(room.proposal.summary, /held back/);
  const whatsapp = await propose(broadcast, {}, { email: CAMPAIGN_MONTH_ALLOWANCE.email, sms: 0 });
  assert.doesNotMatch(whatsapp.proposal.summary, /held back/);
});
```

2. In `ask-turn.test.mjs` replace line 1860
   `assert.match((await p("propose_autonomy", { class: "booking", mode: "veto" })).result, /only replies can be held/);`
   with:

```js
  // One rule (contracts POLICY_CLASS_MODES): bookings have nothing to hold for review; the re-engage row holds a run.
  assert.match(
    (await p("propose_autonomy", { class: "booking", mode: "veto" })).result,
    /The Bookings row has nothing to hold for review\./,
  );
  const holds = await p("propose_autonomy", { class: "reengage", mode: "veto" });
  assert.equal(holds.isError, false, holds.result);
  assert.equal(holds.proposal.summary, "Re-engage quiet customers: holds it");
```

   (`POLICY_CLASS_WORDS.reengage.name` and `POLICY_MODE_WORDS.veto.chip`; if either reads otherwise in this tree, the
   assertion says what they say.)

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs` — Expected: FAIL on those lines.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`
Expected: FAIL on the broadcast block.

- [ ] **Step 3: The broadcast's allowance**

In `act/broadcast.ts`: add `allowanceBeforeSend` to the contracts import and
`import { monthSentOrNull } from "../../../campaigns/month-sent";`. Make `broadcastReach` return each channel's count:

```ts
function broadcastReach(
  rows: PersonRowVM[],
  purpose: AskedPurpose,
  by: { how: CampaignHow; channels: ConsentChannel[]; named: boolean },
): { count: number; says: string; kept: { channels?: ConsentChannel[] }; byChannel: Record<ConsentChannel, number> } {
  if (!by.named) {
    const count = eligibleFor(rows, "everyone", null, null, purpose, by.how).length;
    return { count, says: "", kept: {}, byChannel: { whatsapp: count, sms: 0, email: 0 } };
  }
  const split = reachSplit(rows, purpose, by.how);
  return {
    count: split.reached,
    says: ` · ${proposalChannelsWords(by.channels, split.byChannel)}`,
    kept: namedChannels(by),
    byChannel: split.byChannel,
  };
}
```

In `proposeBroadcast`, change `const { count, says, kept } = broadcastReach(rows, purpose, by);` to
`const { count, says, kept, byChannel } = broadcastReach(rows, purpose, by);`, and just before `return propose({` add:

```ts
  // What the month's email and text allowance will hold back of it, where it goes by them (A7): the composer's sentence.
  const held = by.channels.some((c) => c !== "whatsapp")
    ? allowanceBeforeSend(byChannel, await monthSentOrNull(t.tenantId, t.now), null, purpose)
    : null;
```

and in its summary insert `${held ? ` · ${held}` : ""}` right after `${says}`. (`purpose` is `AskedPurpose`, a member of
`SendPurpose`; if `split.byChannel` is typed otherwise, pass it as the send screen does,
`cmp/broadcasts/page/send-screen.tsx:91`.)

- [ ] **Step 4: Autonomy by the matrix**

In `act/policy.ts`:
1. Contracts import: add `POLICY_CLASS_WORDS`, `POLICY_MODE_WORDS`, `PLAYBOOK_VETO_DELAY_WORDS`, `policyModeRefusal`,
   `type PolicyClass`, `type PolicyMode`.
2. Replace `if (mode === "veto" && cls !== "reply") return refuse("only replies can be held for review");` with:

```ts
  // What each class may be set to is one rule, the Autonomy page's (contracts POLICY_CLASS_MODES), in its words.
  const notOffered = mode ? policyModeRefusal(cls as PolicyClass, mode as PolicyMode) : null;
  if (notOffered) return refuse(notOffered);
```

3. Delete the `MODE_LABEL` table and make the summary's first part
   `mode ? \`${POLICY_CLASS_WORDS[cls as PolicyClass].name}: ${POLICY_MODE_WORDS[mode as PolicyMode].chip}\` : null,`.
4. In `propose_autonomy.description` replace "veto is for replies only." with
   `\`Each class takes the modes its row on the Autonomy page offers (veto holds a reply, or a campaign's run for ${PLAYBOOK_VETO_DELAY_WORDS}, so a person can stop it), and a mode a class does not take is refused in that page's words.\``
   (the description becomes a template string).

- [ ] **Step 5: The registry holds the new sentence**

In `ask-registry.test.mjs`: add `"propose_autonomy"` to `CHANGED`; above `const REPORT_HOLD_WORDS` add

```js
/**
 * 9 Oct 2026 (the moment spec, A7): propose_autonomy is judged by the Autonomy page's rule (policyModeRefusal), so its
 * words say each class takes the modes its row offers, where they said veto is for replies only. The one sentence.
 */
const AUTONOMY_MODES_WORDS = [
  "veto is for replies only.",
  "Each class takes the modes its row on the Autonomy page offers (veto holds a reply, or a campaign's run for 30 minutes, so a person can stop it), and a mode a class does not take is refused in that page's words.",
];
```

(the "30 minutes" is `PLAYBOOK_VETO_DELAY_WORDS`: import it from contracts and build the string with it if you prefer),
and in the invariant test's `for (const role of ["operator", "partner", "owner"])` loop add:

```js
    assert.equal(
      tool(role, "propose_autonomy").description,
      was(role, "propose_autonomy").description.replace(...AUTONOMY_MODES_WORDS),
      role,
    );
    assert.deepEqual(words(tool(role, "propose_autonomy")), words(was(role, "propose_autonomy")), role);
```

R5: regenerate `ask-tools-4-7.json`.

- [ ] **Step 6: Run the tests**

Run each with R1: `tooling/scripts/tests/ask/ask-turn.test.mjs`, `tooling/scripts/tests/ask/ask-registry.test.mjs`,
`tooling/scripts/tests/ask/ask.test.mjs`, `tooling/scripts/tests/ask/ask-routes.test.mjs`,
`tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs`,
`tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`, `tooling/scripts/tests/ask/ask-tool-names.test.mjs`.
Expected: PASS. (`ask-tool-names`: a frozen `propose_autonomy` answer whose summary said a class id reads the page's
words now; if one does, add a normaliser in the file's style, `withTheMatrixWords`, rewriting `"<class>: acts on its own"`
to the new words, and say it in your report.)

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/server/ask/tools/act/broadcast.ts apps/dashboard/src/server/ask/tools/act/policy.ts tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs tooling/scripts/tests/ask/ask-registry.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json
git commit -m "A broadcast card says what the month's allowance holds back, and Ask's autonomy card is judged by the Autonomy page's own rule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The campaigns read and the page say the last 30 days, and Campaigns' own word (A6)

**Files:**
- Modify: `srv/ask/tools/read/campaigns.ts` (`listPlaybooksTool`, line 250; the `playbooks` action's words, line ~452)
- Modify: `srv/ask/context/pages.ts` (`playbookContextRows`: Ask's private `playbookRows`, renamed in lane 1, Task 14,
  because `playbookRows` is now `srv/campaigns/playbooks.ts`' export; read the tree for its line)
- Modify: `srv/readers/campaign-report.ts` (`ttlMs`), `act/playbook-channels.ts` (its row's route, line 58)
- Modify (tests): `tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs` (the test at line 673),
  `tooling/scripts/tests/ask/ask-tool-names.test.mjs`, `tooling/scripts/tests/ask/ask-registry.test.mjs`
- Regenerate: `ask-tools-4-7.json` (R5)

D35: Ask says a playbook's last 30 days (`campaign_series`' sources, through the `campaignReport` reader, the number the
ledger's row shows), never all-time totals; and the read and the page name `campaigns`, not `outbound`. The days are
lane 2's `fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD)` (30), read where lane 2 put them
(`git grep -n "CAMPAIGNS_RESULTS_PERIOD" packages/contracts/src`). `campaign_series` is now read by every Campaigns
turn (the page's context and the campaigns read; the turn's cache reads it once a turn): Step 4b keeps it a minute
across turns, as `facts` keeps five, so a conversation on Campaigns does not ask it again each question; a route's read
is fresh as ever (only a turn's context keeps, `readers/index.ts`).

- [ ] **Step 1: Write the failing test**

In `ask-campaign-channels.test.mjs`, in the test "campaigns with action playbooks says the channels each playbook goes by
now…" (line 673), change the `fakeDb` third argument to model the report and assert the new fields:

```js
    {
      people_list: () => PEOPLE,
      // The Campaigns lens's 30 days (00329 campaign_series): one source for the visit reminder, none for the other.
      campaign_series: () => ({
        timezone: TZ,
        days: 30,
        span_days: 60,
        series: [],
        sources: [
          {
            id: VISIT_PB,
            kind: "playbook",
            name: "Visit reminder",
            template_name: "visit_reminder",
            runs: 4,
            sent: 40,
            delivered: 38,
            read: 0,
            replied: 6,
            last_at: null,
          },
        ],
      }),
    },
```

and after the `listed` assertion:

```js
  const read = JSON.parse(out.result);
  assert.equal(read.route, "campaigns", "Campaigns' own word, never outbound");
  const days = Object.fromEntries(read.playbooks.map((p) => [p.name, p.last_30_days]));
  assert.deepEqual(days, { "Visit reminder": { sent: 40, replied: 6 }, "Reminder by all three": { sent: 0, replied: 0 } });
  for (const p of read.playbooks) for (const k of ["runs", "sent", "replied"]) assert.equal(k in p, false, `no all-time ${k}`);
```

If `campaignReport` reads the series through another call in this tree (lane 1 wrapped it), model that call by the name
the fake database asks for.

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`
Expected: FAIL — `route` is "outbound"; `last_30_days` is undefined.

- [ ] **Step 3: The read**

In `srv/ask/tools/read/campaigns.ts`: add `CAMPAIGNS_RESULTS_PERIOD` and `fixedDaysOf` to the contracts import and
`import { campaignReport } from "../../../readers/campaign-report";`. In `listPlaybooksTool`:

```ts
  const [read, policies, sources] = await Promise.all([
    load(t.rc, playbooks, undefined),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    // The last 30 days by playbook (campaign_series' sources, Reports' Campaigns lens): what the ledger's row says. Null
    // where it could not be read, never all-time totals in its place (D35).
    load(t.rc, campaignReport, { days: fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD) }).then(
      (r) => r.data.report.sources ?? [],
      () => null,
    ),
  ]);
```

after `const modeOf = …` add

```ts
  // A playbook's last 30 days: its source's sends and replies, nothing sent where it has none, null where unread.
  const lastDays = (id: string) => {
    if (!sources) return null;
    const s = sources.find((x) => x.kind === "playbook" && x.id === id);
    return { sent: s?.sent ?? 0, replied: s?.replied ?? 0 };
  };
```

change `route: "outbound",` to `route: "campaigns",`, and in each playbook replace

```ts
      runs: p.totals.runs,
      sent: p.totals.sent,
      replied: p.totals.replied,
```

with `last_30_days: lastDays(p.id),`. In the `playbooks` action's words replace "what its runs earned," with "what it sent
and how many replied over the last 30 days (last_30_days, null where that could not be read),".

- [ ] **Step 4: The page's context**

In `srv/ask/context/pages.ts`: add `CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf` to the contracts import and
`import { campaignReport } from "../../readers/campaign-report";`. In `playbookContextRows` (lane 1's name; never name
it `playbookRows` again: a third declaration fails the copies ratchet) read the report beside the playbooks and say it
on each line:

```ts
async function playbookContextRows(rc: ReaderContext, ids: string[]) {
  const [read, sources] = await Promise.all([
    load(rc, playbooksReader, undefined),
    load(rc, campaignReport, { days: fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD) }).then(
      (r) => r.data.report.sources ?? [],
      () => null,
    ),
  ]);
  const pb = read.data;
  const byId = new Map(pb.playbooks.map((p) => [p.id, p]));
  const refs = refsOf(read.rows);
  // A playbook's last 30 days, as the ledger's row says them (D35); unread, said so, never all-time totals.
  const lastDays = (id: string) => {
    if (!sources) return "last 30 days not read";
    const s = sources.find((x) => x.kind === "playbook" && x.id === id);
    return s ? `last 30 days ${s.sent} sent, ${s.replied} replied` : "nothing sent in the last 30 days";
  };
```

and in its `line([...])` replace `` `${p.totals.runs} runs, ${p.totals.sent} sent, ${p.totals.replied} replied`, `` with
`lastDays(id),` and `` `outbound/${id}` `` with `` `campaigns/moment:${id}` ``.

- [ ] **Step 4b: The report kept a minute across turns, and the channels card's row opens its drawer**

In `srv/readers/campaign-report.ts`, give `campaignReport` `ttlMs: MIN_MS` (import `MIN_MS` from contracts, as
`readers/facts.ts` imports its time) with a line in its comment: "Kept a minute across an Ask turn's next questions
(only a turn keeps: a route reads it fresh), since every Campaigns turn reads it for its rows." A reader with a ttl
"may depend on nothing but its arguments and the workspace" (`readers/index.ts:29`): this one does.

In `act/playbook-channels.ts:58`, the row the channels card notes for a citation opens where the change card's does:
`` route: `campaigns/moment:${p.id}` `` in place of `` `outbound/${p.id}` ``, and its pin moves with it
(`git grep -n "outbound/\\\${" -- tooling/scripts/tests/broadcasts tooling/scripts/tests/ask`; a pin of the playbooks
reader's own rows, `readers/playbooks.ts`, is not this one and stays).

- [ ] **Step 5: The frozen answers and words**

1. `ask-tool-names.test.mjs`: above `function againstOffered` add

```js
/**
 * 9 Oct 2026 (the moment spec, A6, D35): campaigns.playbooks says each playbook's last 30 days (last_30_days, from
 * campaign_series' sources; null where that read fails, as in this world, which models no campaign_series) in the place
 * of its all-time runs, sent and replied, and its route is Campaigns' own word. Nothing else moved.
 */
function withLastThirtyDays(frozen) {
  const said = JSON.parse(frozen);
  if (!Array.isArray(said.playbooks)) return frozen;
  const playbooks = said.playbooks.map((p) =>
    Object.fromEntries(
      Object.entries(p).flatMap(([k, v]) =>
        k === "runs" ? [["last_30_days", null]] : k === "sent" || k === "replied" ? [] : [[k, v]],
      ),
    ),
  );
  return JSON.stringify({ ...said, route: said.route === "outbound" ? "campaigns" : said.route, playbooks });
}
```

   and change `? againstOffered(got.result, result)` to `? againstOffered(got.result, withLastThirtyDays(result))`. If
   the run shows `rpc:campaign_series` among `campaigns.playbooks`' reads, add it to `reads` for that tool the way
   `withTwins` adds its read.
2. `ask-registry.test.mjs`: under `PLAYBOOK_CHANNELS_WORDS` add

```js
/** 9 Oct 2026 (the moment spec, A6, D35): each playbook says its last 30 days, where it said what its runs earned. */
const PLAYBOOK_RESULTS_WORDS = [
  "its list when it runs on one, what its runs earned,",
  "its list when it runs on one, what it sent and how many replied over the last 30 days (last_30_days, null where that could not be read),",
];
```

   and in the invariant test's campaigns assertion change `).replace(...PLAYBOOK_CHANNELS_WORDS),` to
   `).replace(...PLAYBOOK_CHANNELS_WORDS).replace(...PLAYBOOK_RESULTS_WORDS),`. (Check the frozen words say "its list
   when it runs on one, what its runs earned," exactly; quote whatever span they have.)
3. R5: regenerate `ask-tools-4-7.json`.

- [ ] **Step 6: Run the tests**

Run each with R1: `tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`,
`tooling/scripts/tests/ask/ask-tool-names.test.mjs`, `tooling/scripts/tests/ask/ask-registry.test.mjs`,
`tooling/scripts/tests/ask/ask-context.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs`, and every file
`git grep -ln "runs, .* sent, .* replied\|outbound/\${" -- tooling/scripts/tests/ask` lists. Expected: FAIL in
`ask-context.test.mjs`'s Campaigns test (line ~779), which pins the line's route: change
``assert.ok(textOf(pb.blocks[1]).endsWith(`route: outbound/${PB1}`));`` to
``assert.ok(textOf(pb.blocks[1]).endsWith(`route: campaigns/moment:${PB1}`));`` and, where a line pinned
"N runs, N sent, N replied", expect "last 30 days not read" (that world models no `campaign_series`). Change those
strings, nothing else; then PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/server/ask/tools/read/campaigns.ts apps/dashboard/src/server/ask/context/pages.ts apps/dashboard/src/server/readers/campaign-report.ts apps/dashboard/src/server/ask/tools/act/playbook-channels.ts tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs tooling/scripts/tests/ask/ask-registry.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json
git commit -m "Ask says a campaign's last 30 days, as its row does, and names Campaigns, never outbound" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The turn's Campaigns line, the setup rule, words after an approval, neutral words (A2, A4, A7, A8)

**Files:**
- Modify: `srv/ask/prompt.ts` (`ASK_DEFINITIONS.playbook` line 69; `ASK_RULES`; `turnWords`)
- Modify: `act/playbook.ts` (the action's words, line 467: "win-back by visits, no visit in 45 days")
- Modify: `ct/ask/ask-answer.ts` (`answerForCards`' plural detail, line 734)
- Modify (tests): `tooling/scripts/tests/ask/ask.test.mjs`, `tooling/scripts/tests/ask/ask-answer.test.mjs` (line 924)
- Regenerate: `ask-tools-4-7.json` (R5)

The Campaigns line rides in the turn's words, after the page's breakpoint, so the cached system block stays the same
bytes on every surface (`srv/ask/prompt.ts:345-353`). The setup rule joins `ASK_RULES` (cached; it holds on Today and
Start too). Ask is told, after a card was approved, to read campaigns again, never the five-minute shape.

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/ask/ask.test.mjs`:

```js
test("on Campaigns the turn's words say what a sentence there is: a campaign to propose, a change on its id, results from the rows; after an approval, read campaigns again; and the rules carry the setup rule (the moment spec, A2 and A4)", async () => {
  const { turnWords, ASK_RULES, ASK_DEFINITIONS } = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/ask/prompt.ts")).href
  );
  const facts = {
    role: "owner",
    personLabel: "ada@example.com (owner)",
    scope: null,
    surface: "campaigns",
    language: "en",
    timezone: "America/New_York",
    closures: [],
    now: new Date(NOW),
  };
  const w = turnWords(facts);
  assert.ok(w.includes("They are on Campaigns,"), w);
  assert.ok(w.includes("is action change on its playbook_id"), w);
  assert.ok(!w.includes("They are on the campaigns page."), "the line, never the bare page");
  assert.ok(!turnWords({ ...facts, surface: "today" }).includes("They are on Campaigns,"));
  const since = [{ id: "p-1", title: "Playbook: Win-back", state: "done", receipt: "running", atMs: 1 }];
  assert.ok(turnWords({ ...facts, since }).includes("read campaigns with action playbooks again, never the shape"));
  assert.ok(!turnWords({ ...facts, since: [{ ...since[0], state: "dismissed" }] }).includes("never the shape"));
  const rule = ASK_RULES.find((r) => r.startsWith("Setting up campaigns is a few cards, never a claim."));
  assert.ok(rule, "the setup rule");
  assert.ok(rule.includes("Only batch tool calls that are independent of each other."));
  assert.ok(rule.includes("never that anything is set up, started or running"));
  // Words a person of any trade reads: the glossary's appointment, never a salon's visit.
  assert.ok(ASK_DEFINITIONS.playbook.includes("by appointments where a calendar is connected"));
  assert.ok(!/\bvisits?\b/.test(ASK_DEFINITIONS.playbook), ASK_DEFINITIONS.playbook);
  // D19: the person reads Ask's answers, so Ask says the word the pages say, on every page (the definition is read on
  // every turn; the Campaigns line only on Campaigns).
  assert.ok(ASK_DEFINITIONS.playbook.includes("say campaign, never playbook"), ASK_DEFINITIONS.playbook);
});
```

In `ask-answer.test.mjs` replace line 924's expected Spanish detail with
`"Cada una se aprueba por separado: apruébala, cámbiala o descártala; nada pasa hasta que lo hagas."` and add after it:

```js
  assert.equal(
    answerForCards([{ title: "a" }, { title: "b" }], "en").say.detail,
    "Each is its own press: approve, change or dismiss each one; nothing happens until you do.",
  );
```

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs` — Expected: FAIL on the new test.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-answer.test.mjs` — Expected: FAIL on the details.

- [ ] **Step 3: The words in `prompt.ts`**

1. `ASK_DEFINITIONS.playbook`: replace "win-back (by visits where a calendar is connected, by 30 days of silence where
   not)" with "win-back (by appointments where a calendar is connected, by 30 days of silence where not)", and "a reminder
   before a visit and a check after one" with "a reminder before an appointment and a check after one". Then, at its
   end, add one sentence (D19: a person reads Ask's answers, and no word they read says "playbook"; the definition is
   the one the model reads on every turn, on every page, where the Campaigns line rides only on Campaigns): " A person
   calls it a campaign: in every word they read, say campaign, never playbook; the tools' names, actions and fields keep
   playbook." This changes the cached system block (its bytes once, its prefix after), not a tool's bytes: R5's fixture
   moves only for this task's tool words (Step 4). The tests that read `ASK_DEFINITIONS` run in Step 6. No eval runs
   to measure it without Ruben's word.
2. In `ASK_RULES`, after the rule that starts "A proposal is one card." add:

```ts
  "Setting up campaigns is a few cards, never a claim. Read campaigns with action playbooks and action audiences together first, then propose one card per campaign in one round, each on a moment this workspace is offered and on a message it holds or its starter. Use one of People's lists before making one; when a new list is needed, propose the list and leave the campaign on it to a next question, for after it is approved. Only batch tool calls that are independent of each other. Never propose a reminder before or after an appointment (point to its Turn on on Campaigns), a moment not offered, anything for a lead, or an autonomy change they did not ask for. Each card is its own press: say in one sentence what the cards would do and that each run waits for them where its class asks, never that anything is set up, started or running.",
```

3. Above `turnWords` add:

```ts
/**
 * The Campaigns line (the moment spec §4.9 A2), in the turn's words and never in system, so the cached rules stay the
 * same bytes on every page: what a sentence on Campaigns is, and which action each kind of sentence is.
 */
const CAMPAIGNS_LINE =
  "They are on Campaigns, which lists what goes out on its own as a customer reaches each moment of their journey (campaigns that run by themselves) and what they send themselves. Words that describe a message at a moment or to a list are a campaign to propose: read campaigns with action playbooks and action audiences together, then call propose_campaign with action playbook once per campaign in the same round. Pausing, resuming, renaming, or a new hour, cap, gap or cadence of one that exists is action change on its playbook_id, which the page's rows carry. A question about results is answered from the page's rows: their numbers are the last 30 days.";

/** Said once a card of the thread was approved since the last answer (A4): the shape is minutes old; campaigns are read. */
const AFTER_APPROVAL_LINE =
  "Cards were approved since the workspace's shape above was read: for what runs now, read campaigns with action playbooks again, never the shape.";
```

4. In `turnWords`, after the `if (t.since?.length) { … }` block add
   `if (t.since?.some((o) => o.state === "done")) lines.push(AFTER_APPROVAL_LINE);`, and replace
   `else if (t.surface) lines.push(\`They are on the ${t.surface} page.\`);` with

```ts
  else if (t.surface === "campaigns") lines.push(CAMPAIGNS_LINE);
  else if (t.surface) lines.push(`They are on the ${t.surface} page.`);
```

- [ ] **Step 4: The playbook action's neutral words**

In `act/playbook.ts`'s `playbookAction.words`, replace "lapsed (win-back by visits, no visit in 45 days, where one is:"
with "lapsed (win-back by appointments, none in 45 days, where a calendar is connected:". `git grep -n "visit" apps/dashboard/src/server/ask/tools/act/playbook.ts`
then shows no word a model reads that says "visit" but ids (`visit_tomorrow`, `kind !== "visit"`).

- [ ] **Step 5: Each card its own press (A7)**

In `ct/ask/ask-answer.ts`'s `answerForCards`, replace the plural detail pair

```ts
      : es
        ? "Aprueba, cambia o descarta cada una: nada pasa hasta que lo hagas."
        : "Approve, change or dismiss each: nothing happens until you do.";
```

with

```ts
      : es
        ? "Cada una se aprueba por separado: apruébala, cámbiala o descártala; nada pasa hasta que lo hagas."
        : "Each is its own press: approve, change or dismiss each one; nothing happens until you do.";
```

(the file stays 782 lines). Build contracts (R2).

- [ ] **Step 6: Run the tests and regenerate**

R5: regenerate `ask-tools-4-7.json` (the playbook action's words).
Run each with R1: `tooling/scripts/tests/ask/ask.test.mjs`, `tooling/scripts/tests/ask/ask-answer.test.mjs`,
`tooling/scripts/tests/ask/ask-turn.test.mjs`, `tooling/scripts/tests/ask/ask-registry.test.mjs`,
`tooling/scripts/tests/ask/honesty/ask-says-what-is-true.test.mjs`, `tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs`
(it reads `ASK_DEFINITIONS`), and the trade words' test (`git grep -ln "trade-neutral" -- tooling/scripts/tests`).
Expected: PASS. A test that pinned the old plural sentence (`git grep -ln "dismiss each:" -- tooling/scripts/tests e2e`)
takes the new one.

Lane 2's ratchet of "visit" in quoted strings (`tooling/scripts/tests/journey/journey.test.mjs`, baseline
`tooling/scripts/tests/baselines/appointment-words.json`) scans `apps/dashboard/src/server`, so the words this task
neutralised are a fall it fails on until banked (an unbanked fall is red, `_ratchet.mjs`):

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/journey/journey.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
```

Expected: the second run PASSES; `git diff --stat tooling/scripts/tests/baselines/appointment-words.json docs/debt.md`
shows only falls (a rise means a new string says "visit": say the workspace's word or none instead, never raise).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/server/ask/prompt.ts apps/dashboard/src/server/ask/tools/act/playbook.ts packages/contracts/src/ask/ask-answer.ts packages/contracts/dist tooling/scripts/tests/ask/ask.test.mjs tooling/scripts/tests/ask/ask-answer.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json tooling/scripts/tests/baselines/appointment-words.json docs/debt.md
git commit -m "On Campaigns Ask is told what a sentence there is, a setup is a few cards and never a claim, and an approval sends it back to the reads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: A setup's reads ride into round 1, on Campaigns too (A4)

**Files:**
- Modify: `srv/ask/cross-page.ts` (`ON_PAGE`, line 86; `crossPagePlan`, line 100)
- Modify (test): `tooling/scripts/tests/ask/ask.test.mjs` (the cross-page test, line 1476)

A setup is a setup of campaigns, asked for. A bare "set up" also asks whether something is ready ("is our email mailbox
set up, and is the calendar connected?", the eval's `connections_read`) and names Start's own steps: those must keep
the reads they have, so `SETUP` names campaigns, never "set up" alone.

On Campaigns both setup reads were skipped as "on the page" (`cross-page.ts:86-94`), but the page carries the playbooks,
not the moments offered with their starters nor a single audience or message: with three rounds, the last unable to call
a tool, a model that read one thing at a time had no round left for cards.

- [ ] **Step 1: Write the failing assertions**

In the cross-page test, after `assert.deepEqual(names("what playbooks are running right now?", "campaigns"), []);` add:

```js
  // A setup (the moment spec, A4): what runs, the moments offered with their starters, the lists and the messages, read
  // before round 1 on any page -- on Campaigns too, whose rows are the playbooks and hold neither the moments nor a message.
  const setupReads = ['campaigns {"action":"playbooks"}', 'campaigns {"action":"audiences"}'];
  assert.deepEqual(names("Set up my campaigns", "campaigns"), setupReads);
  assert.deepEqual(names("set up my campaigns"), setupReads);
  assert.deepEqual(names("Prepara mis campañas", "campaigns"), setupReads);
  assert.deepEqual(names("set up campaigns for a consultancy that sends proposals", "today"), setupReads);
  // The audiences are no page's rows: asked of offers on Campaigns, they are read.
  assert.deepEqual(names("how many people can I send offers to?", "campaigns"), ['campaigns {"action":"audiences"}']);
  // "Set up" as a state, not a setup: a question about whether something is set up reads what it always read.
  const asked = names("is our email mailbox set up, and is the calendar connected?", "today");
  assert.ok(!asked.includes('campaigns {"action":"playbooks"}'), JSON.stringify(asked));
  assert.ok(
    !names("how far along is my setup?", "start").includes('campaigns {"action":"playbooks"}'),
    "Start's own setup is not a campaign's",
  );
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs`
Expected: FAIL — `[]` on Campaigns, and the Today case reads the pipeline second.

- [ ] **Step 3: The setup's reads**

In `srv/ask/cross-page.ts`:
1. After `const HELD = …` add:

```ts
/**
 * A setup, asked in the open (the moment spec, A4): what runs and the moments offered with their starters
 * (campaigns.playbooks), and the lists and messages a campaign may go by (campaigns.audiences), read before round 1 on
 * any page, Campaigns included, so the first round can propose the cards. Only a setup of campaigns, asked for: "is our
 * mailbox set up?" and Start's own setup are not one, and read what they always read.
 */
const SETUP =
  /\bset ?up (my |our |the |some )?(campaigns?|playbooks?|nudges?|follow[- ]?ups?|win-?backs?|reminders?)\b|\bstart (my |our |the |some )?(campaigns?|nudges?|follow[- ]?ups?)\b|\b(prepara|configura) (mis |las |unas |nuestras )?campañas\b/i;
```

2. In `ON_PAGE`, `campaigns: new Set(["campaigns.playbooks"]),` (the page carries no audience or message).
3. In `crossPagePlan`, after the `add` arrow add

```ts
  // A setup's two reads come first and are read whatever page asks (A4): the page's rows hold neither.
  if (SETUP.test(q)) for (const action of ["playbooks", "audiences"]) out.push({ name: "campaigns", input: { action } });
```

and make `add` skip what is already planned (it does: `!out.some(...)`). Update the module comment's last paragraph
with "A setup's reads (SETUP) come first, on every page."

- [ ] **Step 4: Run it**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask.test.mjs` — Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs` — Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/eval-ask-context.test.mjs` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/ask/cross-page.ts tooling/scripts/tests/ask/ask.test.mjs
git commit -m "A setup's reads ride into Ask's first round on every page, Campaigns too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: A claimed write beside cards is said as the cards' sentence, once, in code (A4)

**Files:**
- Modify: `ct/ask/answer-text.ts` (`claimsWrite` and `unquoted` move here)
- Modify: `ct/ask/index.ts` (the barrel)
- Modify: `tooling/scripts/eval-ask-context.mjs` (lines 483–499: the declarations go, imports and re-exports stay)
- Modify: `srv/ask/loop.ts` (a module-level helper; two existing lines)
- Modify: `srv/log.ts` (`DASHBOARD_LOG_EVENTS`)
- Modify (tests): `tooling/scripts/tests/ask/ask-answer.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs`

`claimsWrite` lived only in the eval (`tooling/scripts/eval-ask-context.mjs:499`); at runtime the rule was a prompt line,
and Opus 5.5 at `low` claimed a card twice on 23 Sep. It moves to contracts' answer rules (not `ask-answer.ts`, at 782
of 800 lines) and the eval reads it from there: one predicate. Its set gains the setup's verbs (set up, started, turned
on, scheduled, resumed, renamed).

- [ ] **Step 1: Write the failing tests**

In `ask-answer.test.mjs` add `claimsWrite` to its contracts import and append:

```js
test("a write claimed is one predicate (the moment spec, A4): what the eval judged, the loop now catches; a quote claims nothing", () => {
  for (const said of [
    "I've set up your win-back.",
    "I started the follow-up for you.",
    "I paused it.",
    "I have resumed the offer.",
    "I renamed it to Past clients.",
    "He configurado tus campañas.",
    "I sent it.",
  ])
    assert.equal(claimsWrite(said), true, said);
  for (const said of [
    "Two cards to review: a win-back and a follow-up.",
    "Once you approve it, it starts running.",
    "The card is waiting for your approval.",
    'Here is the reply, ready to approve: "I\'ve set up your visit."',
  ])
    assert.equal(claimsWrite(said), false, said);
});
```

In `ask-turn.test.mjs`, after the test "words beside a card are the model thinking aloud…" (line ~577) add:

```js
test("an answer beside its cards that claims a write is said as the cards' own sentence, its detail kept, and logged: nothing is done until a person presses a card (the moment spec, A4)", async () => {
  const invite = tool("propose_team", { action: "invite", email: "ada@example.com", role: "viewer" });
  const claimed = scripted([ROUND([prose(answerJson("I've invited Ada for you.")), invite])]);
  const { result: r, lines } = await logged("ask_answer_claimed_write", () =>
    runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(claimed.round)),
  );
  assert.deepEqual(
    [r.answer.say.headline, r.proposals.length, lines.length],
    ["One card to review: Invite ada@example.com.", 1, 1],
  );
  const honest = scripted([ROUND([prose(answerJson("One card: an invitation for Ada.")), invite])]);
  const r2 = await runAskTurn(turn(ctxFor(), AN_OWNER).input, ports(honest.round));
  assert.equal(r2.answer.say.headline, "One card: an invitation for Ada.", "an answer that claims nothing stands");
});
```

(`tool`, `prose`, `answerJson`, `ROUND`, `scripted`, `logged`, `turn`, `ctxFor`, `AN_OWNER` and `ports` are that file's
own helpers, used by the test above it.)

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-answer.test.mjs` — Expected: FAIL (`claimsWrite`
is not exported by contracts).
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs` — Expected: FAIL (the claim
stands as the headline; no log line).

- [ ] **Step 3: Move the predicate**

Append to `ct/ask/answer-text.ts`:

```ts
/* ---------------------------------------------------------- a write claimed */

/**
 * An answer's own words, without what it quotes: a message or a draft it quotes ("…", “…”, «…», and '…' after a space or
 * a colon, never an apostrophe) is someone else's words, never a sentence of its own. Moved from the eval
 * (tooling/scripts/eval-ask-context.mjs), which reads it from here: the headline's one-sentence check and the write
 * claims read only this.
 */
export const unquoted = (s: string | null | undefined): string =>
  (s ?? "").replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, "…").replace(/(^|[\s:(])'[^']*\s[^']*'/g, "$1…");

/**
 * What an answer may never say: that it did something. Ask proposes and a person approves, so a sentence that says a
 * message went, a setting changed, a card was approved or a campaign was set up is a claim no turn can make true. "I",
 * "I have" and "I've" alike; the Spanish "he …" and "aprobé".
 */
const WRITE_CLAIMS = [
  /\bI(?: have|['’]ve)? (?:sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|resumed|renamed|deleted|approved|started|set up|turned on|scheduled)\b/i,
  /\bhe (?:enviado|cambiado|actualizado|cerrado|aprobado|pausado|iniciado|configurado|programado)\b/i,
  /(?<![\p{L}\p{N}])aprob[eé](?![\p{L}\p{N}])/iu,
  /\bdone[,.!]/i,
];

/**
 * Whether an answer's own words claim a write (WRITE_CLAIMS): a draft it quotes claims nothing. The eval's `no_write`
 * reads it, and the turn's loop, which says a claiming headline beside cards as the cards' own sentence (srv/ask/loop.ts).
 */
export const claimsWrite = (text: string | null | undefined): boolean =>
  WRITE_CLAIMS.some((re) => re.test(unquoted(text)));
```

Copy the existing regexes from `eval-ask-context.mjs:490-496` exactly first and add only the new verbs, so nothing the
eval caught stops being caught. In `ct/ask/index.ts`, add `claimsWrite, unquoted` to the `./answer-text` export list.
In `tooling/scripts/eval-ask-context.mjs`, delete `unquoted`, `WRITE_CLAIMS` and `claimsWrite` (lines ~479–499, keeping
neither their comments nor a copy), add `claimsWrite, unquoted` to its `@chanlytics/contracts` import (line 32), and add
`export { claimsWrite, unquoted };` beside the file's other exports, so `eval-ask.mjs` and the tests import them as
before.

- [ ] **Step 4: The loop says the cards' sentence**

In `srv/log.ts`'s `DASHBOARD_LOG_EVENTS`, after `"ask_answer_beside_refused_card",` add `"ask_answer_claimed_write",`.
In `srv/ask/loop.ts`, add `claimsWrite` to the contracts import and, above `runAskTurn`, add:

```ts
/**
 * An answer beside the turn's cards that claims a write (contracts claimsWrite: "I've set up", "I paused"): nothing is
 * done until a person presses a card, so its headline is the cards' own count sentence and its detail stays. Logged,
 * since the rule the model is told did not hold (the moment spec, A4).
 */
function withoutClaimedWrite(
  answer: AskAnswer,
  input: Pick<TurnInput, "language" | "tenantId">,
  made: readonly AskProposal[],
): AskAnswer {
  if (made.length === 0 || !claimsWrite(answer.say.headline)) return answer;
  log.warn("ask_answer_claimed_write", { cards: made.length, tenant_id: input.tenantId });
  return { ...answer, say: { ...answer.say, headline: answerForCards(made, input.language).say.headline } };
}
```

Then change two existing lines inside `runAskTurn`, adding no line and no branch to it:
- `answer = shaped.answer;` becomes `answer = withoutClaimedWrite(shaped.answer, input, proposals);`
- `answer = proseAnswer(written, input.language);` becomes
  `answer = withoutClaimedWrite(proseAnswer(written, input.language), input, proposals);`

(`TurnInput` is this file's own type; if it is named otherwise, use the type `runAskTurn`'s `input` has.) Run
`corepack pnpm exec prettier --write apps/dashboard/src/server/ask/loop.ts` and check neither line wrapped.

- [ ] **Step 5: Build and run the tests**

Run: `node tooling/scripts/gen/contracts-browser-entry.mjs` then `corepack pnpm --filter @chanlytics/contracts build`
Run each with R1: `tooling/scripts/tests/ask/ask-answer.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs`,
`tooling/scripts/tests/ask/eval-ask-context.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs`,
`tooling/scripts/tests/repo/log-events.test.mjs`, `tooling/scripts/tests/shipping/browser-entry.test.mjs`. Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` — Expected: PASS: `runAskTurn` is no longer than
its baseline (468 lines, 74 branches), no copy of `claimsWrite` remains.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/ask/answer-text.ts packages/contracts/src/ask/index.ts packages/contracts/src/browser.generated.ts packages/contracts/dist tooling/scripts/eval-ask-context.mjs apps/dashboard/src/server/ask/loop.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/ask/ask-answer.test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs
git commit -m "A headline that claims a write beside Ask's cards is said as the cards' own sentence, one predicate for the loop and the eval" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: A campaign's drawer is a scope Ask knows (A1, A2)

**Files:**
- Modify: `ct/ask/ask.ts` (`ASK_SCOPE_KINDS`, line 259; `scopeFromRoute`, line 274)
- Modify: `ct/ask/ask-context.ts` (`itemFocus`'s comment)
- Modify: `srv/ask/cross-page.ts` (`scopedRead`, line 135)
- Modify (tests): `tooling/scripts/tests/ask/ask-context-contract.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs`

With a drawer open (`campaigns/moment:<id>`), Ask's scope is that playbook: "Ask about this campaign" (Task 19) opens
Ask there, and "this" means it. `playbook` is already a kind a citation names and a context row is
(`ASK_CONTEXT_ROW_KINDS`), and its mark in the Line is "bolt" (`ask-turn.jsx:26`).

- [ ] **Step 1: Write the failing tests**

In `ask-context-contract.test.mjs`, append:

```js
test("a campaign's drawer is a scope of its own (the moment spec, A1): campaigns/moment:<id>, and the old outbound address, name its playbook", () => {
  assert.ok(ASK_SCOPE_KINDS.includes("playbook"));
  assert.deepEqual(scopeFromRoute("campaigns", `moment:${RUN}`, "Win-back"), { kind: "playbook", id: RUN, label: "Win-back" });
  assert.deepEqual(scopeFromRoute("outbound", `moment:${RUN}`), { kind: "playbook", id: RUN, label: "this campaign" });
  assert.equal(scopeFromRoute("campaigns", "moment:nope"), null);
  assert.equal(scopeFromRoute("campaigns", "new:moment:quiet_30"), null, "the composer is no row");
  assert.equal(scopeFromRoute("campaigns", null), null);
});
```

(`RUN` is that file's run id, a uuid.) In `ask.test.mjs`, the test "the surfaces are one list, Leads among them…"
(line ~449) pins the citation kinds no page opens as a scope; a campaign is one now, so its list loses `"playbook"`:

```js
  assert.deepEqual(
    ASK_CITATION_KINDS.filter((k) => !ASK_SCOPE_KINDS.includes(k)),
    ["deal", "list", "broadcast", "template", "domain"],
    "the rows a reader returns that no page opens as a scope",
  );
```

Then append to `ask.test.mjs`:

```js
test("a campaign's scope is read before the model is asked, by the read that names it (campaigns.playbooks)", async () => {
  const { scopedRead } = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/server/ask/cross-page.ts")).href
  );
  assert.deepEqual(scopedRead({ kind: "playbook", id: "p1", label: "Win-back" }), {
    name: "campaigns",
    input: { action: "playbooks" },
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context-contract.test.mjs` — Expected: FAIL.

- [ ] **Step 3: The kind, the address, the read**

1. `ct/ask/ask.ts`: `export const ASK_SCOPE_KINDS = ["thread", "conversation", "call", "person", "page", "lead", "search", "run", "playbook"] as const;`
   and in `scopeFromRoute`, after the `broadcasts` branch:

```ts
  // A campaign open in its drawer on Campaigns' home (home/address.ts), and the old Playbooks address it replaced.
  if ((page === "campaigns" || page === "outbound") && param.startsWith("moment:") && UUID.test(param.slice(7)))
    return { kind: "playbook", id: param.slice(7), label: label || "this campaign" };
```

   and add "a campaign `campaigns/moment:<id>`" to its doc comment's list of addresses.
2. `ct/ask/ask-context.ts`: in `itemFocus`'s comment, move "a playbook" from the kinds that name no focus to the ones that
   are as they are.
3. `srv/ask/cross-page.ts` `scopedRead`: after the `run` line add
   `if (scope?.kind === "playbook") return { name: "campaigns", input: { action: "playbooks" } };` and "a campaign
   (campaigns.playbooks, which names it among the rest)" to its comment.

- [ ] **Step 4: Build and run the tests**

Run: `corepack pnpm --filter @chanlytics/contracts build`
Run each with R1: `tooling/scripts/tests/ask/ask-context-contract.test.mjs`, `tooling/scripts/tests/ask/ask.test.mjs`,
`tooling/scripts/tests/ask/ask-palette.test.mjs`, `tooling/scripts/tests/ask/ask-page-context.test.mjs`,
`tooling/scripts/tests/ask/ask-routes.test.mjs`, `tooling/scripts/tests/ask/eval-ask-context.test.mjs`. Expected: PASS.
Run: `corepack pnpm -r typecheck` — Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ask/ask.ts packages/contracts/src/ask/ask-context.ts packages/contracts/dist apps/dashboard/src/server/ask/cross-page.ts tooling/scripts/tests/ask/ask-context-contract.test.mjs tooling/scripts/tests/ask/ask.test.mjs
git commit -m "A campaign open in its drawer is the scope Ask is asked about" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 17: Ask's context is the rows the ledger shows, under the view they are under (A2)

**Files:**
- Create: `home/ask-on-campaigns.tsx` (`home/` held 13 modules on main and lane 2 added `results-surface.ts`; lane 3's
  new modules are in `home/ledger/`; count it)
- Modify: `home/home-page.tsx` (created in lane 3's form: read the tree; `useLedgerView` is called once in `CampaignsHome`)
- Modify: `apps/dashboard/src/legacy-bridge/ask/context.ts` (`OnScreen.key`, line 34; the `campaigns` provider, line 140)
- Modify: `srv/ask/context/pages.ts` (the `campaigns` provider, line 136)
- Modify (tests): `tooling/scripts/tests/ask/ask-page-context.test.mjs`, `tooling/scripts/tests/ask/ask-context.test.mjs`,
  `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`

Today the tab sends every playbook (`window.__PLAYBOOKS.rows`) with the view "playbooks", whatever the ledger shows. After
this task the home says what its ledger shows (at most 40 rows, `ASK_CONTEXT_MAX_ROWS`; a one-off send's run spelled
`run:<id>`), the view says the status, group and search (`playbooks:needs:in:quiet:search`), and the server's context
cache, keyed on the view and the rows already (`srv/ask/context.ts:155-160`), keeps one build per view.

- [ ] **Step 1: Write the failing tests**

1. `ask-page-context.test.mjs`, after the test "Reports: the period; Campaigns: the tab's own rows…":

```js
test("Campaigns' home sends the rows its ledger shows and the view they are under (the moment spec, A2): a campaign as a playbook, a one-off send as its run; the playbooks the surface read only before the ledger has drawn; a drawer open is the scope", () => {
  const g = {
    __askOnScreen: { key: "campaigns", ids: [U(1), `run:${U(2)}`], labels: ["Win back", "Monday offer"], view: "playbooks:needs" },
    __PLAYBOOKS: { rows: [{ id: U(9), name: "An older read" }] },
  };
  const out = ctx(g, "campaigns");
  assert.deepEqual(
    [out.surface, out.view, out.rows],
    ["campaigns", "playbooks:needs", [{ kind: "playbook", id: U(1) }, { kind: "run", id: U(2) }]],
  );
  // Another page's on-screen is not believed: before the ledger draws, the surface's read stands in.
  const before = ctx({ ...g, __askOnScreen: { key: "people", ids: [U(3)], labels: [], view: null } }, "campaigns");
  assert.deepEqual([before.view, before.rows], ["playbooks", [{ kind: "playbook", id: U(9) }]]);
  assert.deepEqual(ctx(g, `campaigns/moment:${U(1)}`).focus, { kind: "playbook", id: U(1), label: "this campaign" });
});
```

2. `ask-context.test.mjs`, in the Campaigns test (line 703), after the `pb` assertions:

```js
  // The home's ledger (the moment spec, A2): its view says its status, group and search; its rows are its campaigns and
  // its one-off sends, each as its own page says it, and each a row a citation names.
  const ledger = await buildContext(
    rcIn(ctxFor(t)),
    page("campaigns", [{ kind: "playbook", id: PB1 }, { kind: "run", id: BC1 }], {
      route: "campaigns",
      view: "playbooks:needs:in:quiet",
    }),
  );
  assert.deepEqual(ledger.blocks.map((x) => x.source), ["page://campaigns", `playbook://${PB1}`, `run://${BC1}`]);
```

3. `campaigns-home.test.mjs`, after its imports add
   `const { useLedgerOnScreen } = await import(\`${SRC}/surfaces/campaigns/home/ask-on-campaigns.tsx\`);` and append
   the test below. It runs the hook the page calls, under the file's stub React (`again(...)`, which runs effects, as
   `deals/pipeline.test.mjs:3733-3760` reads People's and the Pipeline's `__askOnScreen`), and reads what it told Ask:
   `ledgerOnScreen` stays module-private (an export only a test imports through a computed `import()` is a dead export
   to knip).

```js
test("what Ask is told the ledger shows (the moment spec, A2): its rows in order, forty at most, a one-off send as its run, the receptionist, the call's text and a reach-out left out, and the view they are under", () => {
  const row = (id, kind, name) => ({ id, kind, name });
  const rows = [
    row("r", "receptionist", "The receptionist"),
    row("p1", "playbook", "Win-back"),
    row("c1", "chain", "Movers in Austin"),
    row("b1", "sent_once", "Monday offer"),
    ...Array.from({ length: 45 }, (_, i) => row(`p${i + 2}`, "playbook", `Campaign ${i + 2}`)),
  ];
  const told = (view) => {
    delete globalThis.window.__askOnScreen;
    again(() => useLedgerOnScreen(view));
    return globalThis.window.__askOnScreen;
  };
  const said = told({ status: "needs", group: "quiet", query: "win", visibleRows: rows });
  assert.equal(said.key, "campaigns");
  assert.deepEqual(said.ids.slice(0, 3), ["p1", "run:b1", "p2"]);
  assert.equal(said.ids.length, contracts.ASK_CONTEXT_MAX_ROWS);
  assert.deepEqual(said.labels.slice(0, 2), ["Win-back", "Monday offer"]);
  assert.equal(said.view, "playbooks:needs:in:quiet:search");
  assert.equal(told({ status: "all", group: null, query: "", visibleRows: [] }).view, "playbooks:all");
});
```

   (Use lane 3's status words for "all" and "needs"; the view is whatever they are, after "playbooks:". If this file's
   helper that runs a hook is not named `again`, use the one lane 3's ledger tests use for `useLedgerView`.)

- [ ] **Step 2: Run them to see them fail**

Run each with R1: `tooling/scripts/tests/ask/ask-page-context.test.mjs` (FAIL: the rows are `__PLAYBOOKS`'),
`tooling/scripts/tests/ask/ask-context.test.mjs` (FAIL: a view other than "playbooks" reads the templates),
`tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs` (FAIL: the module does not exist).

- [ ] **Step 3: The home says what its ledger shows**

Create `home/ask-on-campaigns.tsx`:

```tsx
/**
 * Ask on Campaigns' home (the moment spec §4.9 A1–A2): what Ask is told the ledger shows, the head's door to Ask, the first
 * day's "Set up my campaigns" and the drawer's "Ask about this campaign". The doors open Ask (legacy-verbs askAbout); the
 * rows go with the page's context (legacy-bridge/ask/context.ts), whose ids the server reads again under the person's RLS.
 */
import { useEffect } from "react";
import { ASK_CONTEXT_MAX_ROWS } from "@chanlytics/contracts";
import { askOnScreenKey, setAskOnScreen, type AskOnScreen } from "../../legacy-verbs";
import type { LedgerView } from "./ledger/use-ledger-view";

/**
 * What the ledger shows, as far as Ask is told it: lane 3's useLedgerView's own fields (its status, group, search and rows),
 * so a name lane 3 changes is the compiler's to catch. (Lane 3's `use-ledger-view.ts` keeps a private `LedgerShown`;
 * never declare that name a second time here.)
 */
type LedgerForAsk = Pick<LedgerView, "status" | "group" | "query" | "visibleRows">;

/** Rows that are no row of Campaigns' Ask can open: the receptionist, the call's text, and a reach-out (its own sheet). */
const NOT_A_ROW: ReadonlySet<string> = new Set(["receptionist", "call_text", "chain"]);

/**
 * What Ask is told is on screen: the ledger's rows in its order, forty at most, a one-off send's run spelled `run:<id>`,
 * each with the name it shows (which stays in the tab), and the view they are under, `playbooks:<status>[:in:<group>]
 * [:search]`, on which Ask's kept context is keyed. Module-private: the hook below is what the page and the test call.
 */
function ledgerOnScreen(view: LedgerForAsk): AskOnScreen {
  const rows = view.visibleRows.filter((r) => !NOT_A_ROW.has(r.kind)).slice(0, ASK_CONTEXT_MAX_ROWS);
  return {
    key: "campaigns",
    ids: rows.map((r) => (r.kind === "sent_once" ? `run:${r.id}` : r.id)),
    labels: rows.map((r) => r.name),
    view: ["playbooks", view.status, view.group ? `in:${view.group}` : "", view.query.trim() ? "search" : ""]
      .filter(Boolean)
      .join(":"),
  };
}

/** Says it as the ledger draws, and takes it back when the ledger goes, as People's list does (people/page/cells-hook.ts). */
export function useLedgerOnScreen(view: LedgerForAsk): void {
  useEffect(() => {
    setAskOnScreen(ledgerOnScreen(view));
    return () => {
      if (askOnScreenKey() === "campaigns") setAskOnScreen(null);
    };
  });
}
```

`AskOnScreen` is `apps/dashboard/src/surfaces/legacy-verbs.ts:341`'s type, exported already, so `legacy-verbs.ts` does
not change (leave it out of the commit if `git status` shows it untouched). Then in `home/home-page.tsx`, import `useLedgerOnScreen` from `./ask-on-campaigns` and call
`useLedgerOnScreen(view);` on the line after lane 3's one `useLedgerView(…)` call (lane 3's plan makes it inside its
`useLedgerPage` hook, `const view = useLedgerView(home.ledger, { … });`, which `CampaignsHome` calls once), so it runs
exactly where the ledger's view is made, in the same order every draw. A sample (demo) session draws the samples: the hook
then says the samples' rows, which is what the screen shows.

- [ ] **Step 4: The bridge believes the ledger**

In `apps/dashboard/src/legacy-bridge/ask/context.ts`:
1. `OnScreen.key`: `key: "inbox" | "people" | "pipeline" | "calendar" | "campaigns";`
2. In the `campaigns` provider, replace the `if (route.page === "outbound" || route.page === "campaigns")` branch with:

```ts
  if (route.page === "outbound" || route.page === "campaigns") {
    // The ledger says what it shows (home/ask-on-campaigns.tsx): its rows in its order, forty at most, a one-off send's run
    // spelled `run:<id>`, under the view it is set to. Before it has drawn, the playbooks the surface read.
    const s = w.__askOnScreen;
    if (s && s.key === "campaigns") {
      const labels = arr<string>(s.labels);
      return {
        view: typeof s.view === "string" ? s.view : "playbooks",
        rows: arr<string>(s.ids)
          .filter((id) => typeof id === "string" && id)
          .map((id, i): Row => {
            const row: Row = id.startsWith("run:") ? { kind: "run", id: id.slice(4) } : { kind: "playbook", id };
            return typeof labels[i] === "string" ? { ...row, label: labels[i] } : row;
          }),
      };
    }
    return {
      view: "playbooks",
      rows: arr<{ id: string; name?: string }>(w.__PLAYBOOKS?.rows).map((p) => ({
        kind: "playbook",
        id: p.id,
        label: p.name,
      })),
    };
  }
```

   and change the provider's doc comment to "Campaigns is its home, whose rows are the ledger's (or, before it draws, the
   playbooks), and two rooms, Sent and the Library: …".

- [ ] **Step 5: The server reads the ledger's rows**

In `srv/ask/context/pages.ts`, above `export const campaigns`, add:

```ts
/**
 * The home's rows (a view of `playbooks`, then the ledger's status, group and search): its campaigns as
 * campaigns.playbooks says them, then its one-off sends as Sent's rows say them, each a row a citation names.
 */
async function ledgerRows(rc: ReaderContext, ctx: Parameters<Provider>[1]) {
  const runs = idsOf(ctx, "run").map((r) => r.id);
  const [pb, sent] = await Promise.all([
    playbookContextRows(
      rc,
      idsOf(ctx, "playbook").map((r) => r.id),
    ),
    runs.length ? broadcastRows(rc, runs) : Promise.resolve(null),
  ]);
  return { rows: [...pb.rows, ...(sent?.rows ?? [])], aggregate: pb.aggregate };
}
```

and in `campaigns` replace `ctx.view === "playbooks" ? await playbookContextRows(…)` (lane 1's name) with
`ctx.view?.startsWith("playbooks") ? await ledgerRows(rc, ctx)`. Update the provider's comment: "Campaigns: the home's
ledger (its campaigns and one-off sends), Sent's runs or the Library's messages, whichever the page is".

- [ ] **Step 6: Run the tests**

Run each with R1: `tooling/scripts/tests/ask/ask-page-context.test.mjs`, `tooling/scripts/tests/ask/ask-context.test.mjs`,
`tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`, `tooling/scripts/tests/ask/ask-palette.test.mjs`,
`tooling/scripts/tests/ask/eval-ask-context.test.mjs` (the eval builds a Campaigns page with view "playbooks", which still
reads as the ledger's). Expected: PASS.
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` — Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/surfaces/campaigns/home/ask-on-campaigns.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/legacy-verbs.ts apps/dashboard/src/legacy-bridge/ask/context.ts apps/dashboard/src/server/ask/context/pages.ts tooling/scripts/tests/ask/ask-page-context.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
git commit -m "Ask on Campaigns reads the rows the ledger shows, under the view they are under" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Ask at rest on Campaigns: its placeholder, its chips, and "Open in the composer" (A3, A7)

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (en after `describeLeads`, line 23; es after line 108; `openIt`
  lines 88 and 171)
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (line 881, the field's placeholder; one line, the file may not grow)
- Modify: `apps/dashboard/src/legacy/pages/ask-turn.jsx` (`AskCardActs`' Open, line 106)
- Modify: `ct/ask/ask-suggestions.ts`
- Modify: `apps/dashboard/src/legacy-bridge/ask/palette.ts` (`suggestions`, line 228)
- Modify (tests): `tooling/scripts/tests/ask/ask-context-contract.test.mjs` (the suggestions tests),
  `tooling/scripts/tests/ask/ask-palette.test.mjs`

`ask-real.jsx` is in `file-length.json` at 1,040 lines and may not grow: its change is one line replaced. The legacy
files are prettier-ignored: edit in place.

- [ ] **Step 1: Write the failing tests**

In `ask-context-contract.test.mjs`, beside its other `buildAskSuggestions` tests, append:

```js
test("Ask at rest on Campaigns (the moment spec, A3): three ideas on the first day, then chips from the rows -- why one waits, what is working -- and a win-back offered only where none runs", () => {
  const base = { surface: "campaigns", language: "en", needsYou: 0, heldDrafts: 0, missedToday: 0, liveNow: 0, hasCalendar: false, canAct: true };
  const qs = (input) => buildAskSuggestions({ ...base, ...input }).map((s) => s.q);
  const first = qs({ campaigns: { rows: [] } });
  assert.deepEqual(first.slice(0, 3), ["Set up my campaigns", "Win back customers who went quiet", "What should go out this month?"]);
  const rows = [
    { name: "Win-back", trigger: "quiet_30", state: "running", waiting: true },
    { name: "Monthly offer", trigger: "everyone_monthly", state: "paused", waiting: false },
  ];
  const later = qs({ campaigns: { rows } });
  assert.deepEqual(later.slice(0, 2), ["Why is Win-back waiting?", "What's working?"]);
  assert.ok(!later.includes("Win back customers who went quiet"), "a win-back runs");
  assert.ok(!later.includes("Start a win-back playbook for the quiet clients"), "nor its act");
  const none = qs({ campaigns: { rows: [{ ...rows[0], state: "paused", waiting: false }] } });
  assert.ok(none.includes("Win back customers who went quiet"), "a paused win-back runs nothing");
  const es = buildAskSuggestions({ ...base, language: "es", campaigns: { rows: [] } })[0].q;
  assert.equal(es, "Prepara mis campañas");
});
```

In `ask-palette.test.mjs`, after the Leads test ("on Leads the Line is the finder…", line ~3276, whose helpers `ask`,
`render`, `later`, `inputOf`, `Palette` and `OPEN` these use), append:

```js
test("on Campaigns the field asks what should go out, and when (the moment spec, A3)", async () => {
  const hash = globalThis.window.location.hash;
  globalThis.window.location.hash = "#/campaigns";
  try {
    ask([]);
    render(Palette, OPEN);
    const tree = await later(Palette, OPEN);
    assert.equal(inputOf(tree).props.placeholder, "Describe what should go out, and when");
  } finally {
    globalThis.window.location.hash = hash;
  }
});

test("a campaign card opens in the composer on its moment before Approve, and says so (the moment spec, A7)", () => {
  const { AskCard } = globalThis.window.AskAnswerKit;
  const t = globalThis.window.askText("en");
  const card = {
    id: "p1",
    kind: "playbook",
    needs: "operator",
    title: "Playbook: Win-back",
    summary: "Win-back — nothing heard in 30 days",
    payload: { trigger: "quiet_30" },
    undo: "Delete it — nothing will run",
  };
  const went = [];
  const tree = render(AskCard, { p: card, messageId: "x", t, onNav: (to) => went.push(to) });
  const open = find(tree, (n) => n.type === "button" && textOf(n) === "Open in the composer");
  assert.ok(open, "the card's Open, in the composer's words");
  open.props.onClick();
  assert.deepEqual(went, ["campaigns/new:moment:quiet_30"]);
  assert.equal(globalThis.window.askText("es").openComposer, "Abrir en el redactor");
  assert.equal(globalThis.window.askText("es").describeCampaigns, "Describe qué debe salir, y cuándo");
});
```

(The card's Open is contracts' `cardOpenRoute`, which reads Task 8's `playbookSpec.open`, through `window.__ask`; if that
test file stubs `__ask.cardOpenRoute`, set it to the contracts function for this test.)

- [ ] **Step 2: Run them to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context-contract.test.mjs` — Expected: FAIL.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-palette.test.mjs` — Expected: FAIL.

- [ ] **Step 3: The words**

In `ask-text.jsx`, en, after `describeLeads: "Describe the businesses you want",` add
`    // On Campaigns (the moment spec, A3): the field's placeholder.` and
`    describeCampaigns: "Describe what should go out, and when",`; after `openIt: "Open it",` add
`    openComposer: "Open in the composer",`. Es: after `describeLeads: "Describe los negocios que quieres",` add
`    describeCampaigns: "Describe qué debe salir, y cuándo",`; after `openIt: "Abrirlo",` add
`    openComposer: "Abrir en el redactor",`.

In `ask-real.jsx` line 881 replace the line with:

```jsx
          placeholder={talk.listening ? t.listening : active ? t.follow : surface === "leads" ? t.describeLeads : surface === "campaigns" ? t.describeCampaigns : t.placeholder}
```

In `ask-turn.jsx`'s `AskCardActs`, replace the Open line (line 106) with:

```jsx
      {openRoute && !hideOpen ? <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>{/^campaigns\/new:/.test(openRoute) ? t.openComposer : t.openIt}</button> : null}
```

- [ ] **Step 4: Campaigns' chips**

In `ct/ask/ask-suggestions.ts`:
1. `import { isWinBack } from "../playbooks/playbook-triggers";`
2. In `SuggestionInput` add:

```ts
  /**
   * On Campaigns (the moment spec, A3): its campaigns as the page read them, each by its name, moment, state and whether
   * a run of it waits; none read yet is null, and the page's own chips wait for it.
   */
  campaigns?: { rows: ReadonlyArray<{ name: string; trigger: string; state: string; waiting: boolean }> } | null;
```

3. In `T.en` add `setUp: "Set up my campaigns", winBackIdea: "Win back customers who went quiet", offerIdea: "What should go out this month?", whyWaiting: "Why is {name} waiting?", working: "What's working?",`
   and in `T.es` `setUp: "Prepara mis campañas", winBackIdea: "Recupera a los clientes que dejaron de escribir", offerIdea: "¿Qué debería salir este mes?", whyWaiting: "¿Por qué espera {name}?", working: "¿Qué está funcionando?",`.
4. `buildAskSuggestions` is held in `tooling/scripts/tests/baselines/complexity.json` (59 lines, 45 branches, depth 3)
   and may not grow by a line or a branch (reconciled 9 Oct). So a page's own chips leave it for a helper: add, above
   `buildAskSuggestions`,

```ts
/**
 * A page's own chips, which come first: on Leads the first day's ideas, each a search to propose, or the latest searches'
 * own words to find more; on Campaigns (the moment spec, A3) three ideas on the first day, each a setup to ask, then why a
 * campaign waits and what is working, and a win-back only where none runs. Answers whether a win-back runs here, which
 * the Act group reads. (Out of buildAskSuggestions, which the complexity ratchet holds.)
 */
function pageChips(
  input: SuggestionInput,
  t: (typeof T)[keyof typeof T],
  add: (q: string, kind: AskSuggestion["kind"], icon: string, fast?: boolean, label?: string) => void,
): boolean {
  if (input.surface === "leads") {
    const ideas = (input.leadIdeas ?? []).filter(Boolean).slice(0, 3);
    for (const w of ideas) add(w, "ask", "search");
    // A search's own words can run long; the chip shows them clipped, the question sent keeps them whole.
    if (!ideas.length)
      for (const a of (input.leadSearches ?? []).filter(Boolean).slice(0, 2))
        add(t.moreLike.replace("{asked}", a), "ask", "search", false, t.moreLike.replace("{asked}", clipWords(a, 40)));
    return false;
  }
  const rows = input.surface === "campaigns" ? (input.campaigns?.rows ?? null) : null;
  const winBackRuns = !!rows?.some((r) => isWinBack(r.trigger) && r.state === "running");
  if (rows && rows.length === 0) for (const k of ["setUp", "winBackIdea", "offerIdea"] as const) add(t[k], "ask", "bolt");
  if (rows && rows.length > 0) {
    const waiting = rows.find((r) => r.waiting);
    if (waiting) add(t.whyWaiting.replace("{name}", waiting.name), "ask", "clock");
    add(t.working, "ask", "trending-up");
    if (!winBackRuns) add(t.winBackIdea, "ask", "bolt");
  }
  return winBackRuns;
}
```

   (`clipWords` is declared above `buildAskSuggestions` in this file; if it is declared below `pageChips`, a function
   declaration is hoisted, so the order does not matter.) In `buildAskSuggestions`, replace the Leads block (from the
   comment `// On Leads the page's own chips come first…` through its closing `}`) with the two lines

```ts
  // A page's own chips come first (Leads', Campaigns'), and whether a win-back runs here.
  const winBackRuns = pageChips(input, t, add);
```

   and change the act line `if (at === "people" || at === "other") act(t.actPlaybook, t.actPlaybookQ, "bolt");` to
   `if ((at === "people" || at === "other") && !winBackRuns) act(t.actPlaybook, t.actPlaybookQ, "bolt");`. The function
   loses about eight lines and the Leads block's branches and gains one `&&`: a fall, banked in Step 6 (R4).
   `isWinBack(trigger)` is contracts' one test of a win-back's moment (`playbook-triggers.ts`); if it takes another
   shape, read it there.

- [ ] **Step 5: The palette hands it the rows**

In `apps/dashboard/src/legacy-bridge/ask/palette.ts`, import `surfaceValue` from `@/surfaces/surface-values` (as
`context.ts` does) and in `suggestions`'s `buildAskSuggestions({ … })` add, after `leadSearches`:

```ts
        // On Campaigns: the campaigns the playbooks surface read, each by name, moment, state and a run that waits.
        campaigns: (() => {
          const rows = surfaceValue("playbooks")?.rows;
          return rows
            ? { rows: rows.map((r) => ({ name: r.name, trigger: r.trigger, state: r.state, waiting: !!r.totals?.waiting })) }
            : null;
        })(),
```

(If `surfaceValue("playbooks")` is typed loosely, read `rows` as `PlaybooksSurface["rows"]` by a type import from
`@/surfaces/campaigns/playbooks/surface`, which is browser code.)

- [ ] **Step 6: Build and run the tests**

Run: `corepack pnpm --filter @chanlytics/contracts build`
Run each with R1: `tooling/scripts/tests/ask/ask-context-contract.test.mjs`, `tooling/scripts/tests/ask/ask-palette.test.mjs`,
`tooling/scripts/tests/ask/ask.test.mjs` (line 406 lists the acts), `tooling/scripts/tests/playbooks/playbooks.test.mjs`
(line 717 asks for the win-back act on a page with none running). Expected: PASS.
Run: R4 (`UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo`: `buildAskSuggestions`
fell in `complexity.json`), then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` — Expected: PASS
(`ask-real.jsx` did not grow; no function rose). Add `tooling/scripts/tests/baselines docs/debt.md docs/takeover.md` to the
commit if the bank wrote them.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/legacy/pages/ask-text.jsx apps/dashboard/src/legacy/pages/ask-real.jsx apps/dashboard/src/legacy/pages/ask-turn.jsx packages/contracts/src/ask/ask-suggestions.ts packages/contracts/dist apps/dashboard/src/legacy-bridge/ask/palette.ts tooling/scripts/tests/ask/ask-context-contract.test.mjs tooling/scripts/tests/ask/ask-palette.test.mjs
git commit -m "Ask at rest on Campaigns asks what should go out, offers chips from its campaigns, and opens a campaign card in the composer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18B: Ask says "campaign" wherever a person reads it, never "playbook" (D19)

Decision 19 takes "playbook" out of every word a person reads, in this program; lane 3 changes the words Campaigns' own
pages say (its Task 12B) and every other word a person reads outside Ask (its Task 12C), and Ask's are this lane's
(reconciled 9 Oct). A tool's name, an action's name (`playbook`), a card's kind, an id, a payload key and the words the
model alone reads (a tool's `words`, its answers to its tools, the turn's lines) keep theirs; the model is told to say
"campaign" to the person (Task 13).

**The boundary with lane 3's 12C, both ways, so nothing is left and nothing is done twice.** This task owns exactly the
files 12C's sweep leaves to it (12C Step 3: `ct/ask-proposals/campaigns.ts`, `act/playbook*.ts`, `srv/ask/tools/read/*.ts`,
`ask-text.jsx`, `legacy-bridge/ask/palette.ts`) and three more, `ct/ask/ask-answer.ts`, `ct/ask/ask-suggestions.ts` and
`legacy/pages/ask-turn.jsx` (~143: "The playbook and its schedule go…", found by the 10 Oct review of 12C), whose
person-read words are Ask's. The member-read 404 "Playbook not found." in this lane's own route code (Task 6's
`patchPlaybook` and `playbookChangeError`) is written "Campaign not found." from the start, as 12C wrote it in
`playbook-row.ts` and `verbs.ts`; the P0002 messages inside SQL and thrown errors the code maps are never read. 12C owns, and has already renamed before this lane runs: Ask's list card
(`ct/ask-proposals/lists.ts:42`), the route's "A campaign is running or paused." (`playbook-row.ts:86`), "…or move the
campaign to another list." (`playbooks.ts:431`), and the bell's `Campaign “…” is ready` title (core `run-playbook.ts`,
`vetoRunNotice`, `today-away.ts`). This task never edits those. Where 12C's sweep already changed one of this task's
strings, keep its words, skip that step's edit, and say so in your report. Tasks 8 and 10 already moved the playbook
card's receipt and both cards' titles, with their pins; this task does the rest.

**Files:**
- Modify: `act/playbook.ts` (the tool's `label`, line ~465), `act/playbook-channels.ts` (its `label`, line ~95),
  `srv/ask/tools/read/campaigns.ts` (the `playbooks` action's `label`, line ~458)
- Modify: `ct/ask/ask-answer.ts` (the source kind's words, lines ~189 and ~204; a waiting run's `meta`, line ~358),
  `ct/ask/ask-suggestions.ts` (`actPlaybook`, `actPlaybookQ`, en and es)
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (`kPlaybook`, en line ~92 and es line ~175; prettier-ignored,
  edit in place), `apps/dashboard/src/legacy-bridge/ask/palette.ts` (a waiting run's fallback label, line ~179)
- Modify (tests): `tooling/scripts/tests/ask/ask-registry.test.mjs` (`LABELS`, ~856, ~868),
  `tooling/scripts/tests/ask/ask-answer.test.mjs` (~301), `tooling/scripts/tests/ask/ask.test.mjs` (`OFFER`, ~406; Task
  13's `since` fixture), `tooling/scripts/tests/ask/ask-context-contract.test.mjs` (Task 18's chip test),
  `tooling/scripts/tests/ask/ask-palette.test.mjs` (Task 18's card fixture)

- [ ] **Step 1: Move the pins first (they fail until Step 2)**

1. `ask-registry.test.mjs` `LABELS`: `list_playbooks: "Reading the campaigns",` and `propose_playbook: "Preparing a campaign",`.
   (`tooling/scripts/tests/fixtures/ask-tool-results-7405e34b.json` is the old registry's bytes and stays as it was
   made; if a test compares a label against it, the change is said in that test's own map, with a dated comment.)
2. (`ask-commit.test.mjs:676`, the playbook card's receipt: moved in Task 8.)
3. `ask-answer.test.mjs:301`: `["Win-back · quiet 30 days", "Campaign", "1 person", "broadcasts/run:r0"],`.
4. `ask.test.mjs:406`: `const OFFER = ["Remember that ", "Send the ", "Start a win-back campaign for the quiet clients"];`.
5. `ask-context-contract.test.mjs`, Task 18's chip test: `"Start a win-back playbook for the quiet clients"` becomes
   `"Start a win-back campaign for the quiet clients"`.
6. `ask-palette.test.mjs`, Task 18's card fixture, and `ask.test.mjs`, Task 13's `since` fixture (Task 13 put that
   test in `ask.test.mjs`, not `ask-turn.test.mjs`): `title: "Playbook: Win-back"` becomes `title: "Campaign: Win-back"`
   (a fixture's word, so the tests read as the cards do).
7. (`ask-tool-names.test.mjs`'s `withCampaignWord`: added in Task 10, with the titles.)

Run each with R1 and see the moved pins fail on the old words: `ask-registry`, `ask-answer`, `ask`,
`ask-context-contract`. A pin that already passes means 12C's sweep reached that string first: keep its words.

- [ ] **Step 2: Change the words**

1. `act/playbook.ts`: `label: "Preparing a playbook",` becomes `label: "Preparing a campaign",` (both cards' titles say
   "Campaign: …" since Task 10).
2. `act/playbook-channels.ts`: `label: "Preparing a campaign's channels",`.
3. `srv/ask/tools/read/campaigns.ts`: the `playbooks` action's `label: "Reading the campaigns",`.
4. (`ct/ask-proposals/campaigns.ts` `playbookSpec.receipt`: "Campaign “…”" since Task 8. Its other person-read
   strings, such as `playbookChannelsSpec`'s fallback `"The playbook"`, are this step's: `"The campaign"`, found by the
   sweep below.)
5. `ct/ask/ask-answer.ts`: the source kinds' words `playbook: "Campaign",` (en) and `playbook: "Campaña",` (es); the
   waiting run's `meta: "Campaign",`.
6. `ct/ask/ask-suggestions.ts`: en `actPlaybook: "Start a win-back campaign",`, `actPlaybookQ: "Start a win-back campaign for the quiet clients",`;
   es `actPlaybook: "Iniciar una campaña de recuperación",`, `actPlaybookQ: "Inicia una campaña de recuperación para los clientes inactivos",`.
7. `ask-text.jsx`: en `kPlaybook: "campaign"`, es `kPlaybook: "campaña"` (the key keeps its name).
8. `palette.ts`: `label: r.audience?.label || "Campaign",`.

Then list what a person may still read, with the sweep 12C uses (its regular expression, so the two lanes read the same
lines): `git grep -n -i -E "[\"'\`>“ ]playbooks?[ .,:\"'<\`)”]" -- apps/dashboard/src/server/ask packages/contracts/src/ask packages/contracts/src/ask-proposals apps/dashboard/src/legacy-bridge/ask apps/dashboard/src/legacy/pages/ask-*.jsx ':!packages/contracts/src/ask-proposals/lists.ts'`.
Every line it prints is a comment, an identifier, a kind, an action or payload key, words the model alone reads (a
tool's `words`, its answers to its tools, an error the model is handed), or one of 12C's files (never edited here); a
string a person reads is changed the same way, its pin moved with it. List in your report what you left and why.

- [ ] **Step 3: Build and run**

Run: `corepack pnpm --filter @chanlytics/contracts build`, then R5 (`git diff --stat` on the fixture: the labels are not
in it, so expect no change), then each with R1: `ask/ask-registry`, `ask/ask-commit`, `ask/ask-answer`, `ask/ask`,
`ask/ask-context-contract`, `ask/ask-tool-names`, `ask/ask-palette`, `ask/ask-turn`, `ask/ask-specs`,
`playbooks/ask-setup/starter-card`, `playbooks/ask-setup/twins-and-allowance`, `playbooks/change/ask-playbook-change`,
and every file `git grep -ln -E "Playbook: |Preparing a playbook|Reading the playbooks|win-back playbook" -- tooling/scripts/tests e2e`
lists (the evals' `ask-cases.json` keeps a person's own words, "start a win-back playbook…": a person may say it).
Expected: PASS. `corepack pnpm -r typecheck` — exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/server/ask/tools/act/playbook.ts apps/dashboard/src/server/ask/tools/act/playbook-channels.ts apps/dashboard/src/server/ask/tools/read/campaigns.ts packages/contracts/src/ask-proposals/campaigns.ts packages/contracts/src/ask/ask-answer.ts packages/contracts/src/ask/ask-suggestions.ts packages/contracts/dist apps/dashboard/src/legacy/pages/ask-text.jsx apps/dashboard/src/legacy-bridge/ask/palette.ts tooling/scripts/tests/ask
# (only the files this task changed: leave out any 12C had already changed, and never add one of 12C's)
git commit -m "Ask calls a campaign a campaign on its cards, its chips and its lines, never a playbook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: The doors: Ask in the head, "Set up my campaigns" on the first day, "Ask about this campaign" in the drawer (A1)

**Files:**
- Modify: `ct/playbooks/lifecycle/lifecycle-words.ts` (moved in lane 2; `LIFECYCLE_WORDS`)
- Modify: `home/ask-on-campaigns.tsx` (Task 17's)
- Modify: `home/home-page.tsx` (lane 3's: `headActs`; it hands the first day's door to the rail and the phone list)
- Modify: `home/rail.tsx` (lane 3's: the hinted stage's Turn on, on a desk), `home/ledger/ledger-phone.tsx` (lane 3's:
  the first group's Turn on, at ≤900px where there is no rail): each takes the door as a slot, never imports Ask
- Modify: `cmp/playbooks/card-detail.tsx` (`cardOwnActs`' `more`, line ~573 before lane 3 moved Pause's place on a phone)
- Modify: `cmp/campaigns.css`
- Modify (test): `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`

D21 and D22: Library · Ask · New message, Ask a quiet `Button` wearing the three (`cmh-ask`) from 721px up, the shell's ✦
below (the Leads finder's band rule, `docs/superpowers/specs/2026-09-24-ask-is-the-finder-design.md` F1); "Ask about this
campaign" in the drawer's More, opening Ask on the drawer's own scope (Task 16); and on the first day, beside the hinted
Turn on, "Set up my campaigns", a sentence Ask turns into cards, on a desk and on a phone. **Where the first day's door
goes:** lane 3 draws the hinted Turn on in the rail's hinted stage (`home/rail.tsx`) on a desk, and at ≤900px, where
there is no rail, as the first group's Turn on in the phone list (`home/ledger/ledger-phone.tsx`, the journey's line
as the list's spine). The door stands right after that Turn on in each: on a desk a quiet `Button` beside it; on a phone
under it, full width at the kit's touch size, its mark and its words ("✦ Set up my campaigns": an act on a phone keeps
its mark and its first word, never a bare glyph). It opens Ask with the sentence sent, so no field takes focus and no
keyboard rises on a touch screen. One door per layout. Check the class is new:
`git grep -nE "(^|[^a-zA-Z0-9_-])cmh-ask([^a-zA-Z0-9_-]|$)" -- apps/dashboard/src e2e tooling/scripts/tests` prints
nothing, and `apps/dashboard/app/globals.css` has no bare `.cmh-ask`.

- [ ] **Step 1: Write the failing page test**

Append to `campaigns-home.test.mjs` (and import `askAboutItem` beside `useLedgerOnScreen`):

```js
test("Ask's doors on Campaigns (the moment spec, A1): Ask in the head between the Library and New message, wearing the three; the drawer's More asks about its campaign; the first day's 'Set up my campaigns' asks it", () => {
  const asked = [];
  globalThis.askAbout = (about) => asked.push(about);
  surfaces();
  fresh();
  page();
  const head = headSaid();
  const door = byTestId(head, "cmh-ask");
  assert.ok(door, "the head's door");
  assert.match(String(door.props.className), /\bcmh-ask\b/, "the class the phone's width hides");
  assert.match(textOf(door), /Ask/);
  const acts = all(head, (n) => ["cmh-library", "cmh-ask", "cmh-new"].includes(n.props?.["data-testid"]));
  assert.deepEqual(acts.map((n) => n.props["data-testid"]), ["cmh-library", "cmh-ask", "cmh-new"]);
  pressed(door);
  assert.deepEqual(asked.at(-1), {}, "Ask opens on the page, its scope the address's");
  const item = askAboutItem();
  assert.equal(item.label, "Ask about this campaign");
  item.onSelect();
  assert.deepEqual(asked.at(-1), {}, "on the drawer's address, its scope is the campaign");
  // The first day: no campaign yet. "Set up my campaigns" stands beside the hinted Turn on and asks it as a sentence.
  surfaces({ playbooks: { rows: [] } });
  fresh();
  const setUp = byTestId(page(), "cmh-setup-ask");
  assert.ok(setUp, "beside the first day's Turn on");
  pressed(setUp);
  assert.deepEqual(asked.at(-1), { prompt: "Set up my campaigns" });
  // On a phone (≤900px, no rail): the same door, under the phone list's first Turn on, with its mark and its words.
  surfaces({ playbooks: { rows: [] } });
  fresh();
  const onPhone = byTestId(page({ phone: true }), "cmh-setup-ask");
  assert.ok(onPhone, "the phone's first day has its door too");
  assert.match(textOf(onPhone), /Set up my campaigns/);
  surfaces();
  fresh();
  assert.equal(byTestId(page(), "cmh-setup-ask"), null, "a workspace with campaigns has its ledger, not the first day's door");
});
```

If lane 3's first day is reached another way than an empty `rows` (read its page test for "first day"), set that up
instead; the assertions stay. Draw the phone the way lane 3's phone tests do (`ledger-phone` tests, the `useCmPhone`
stub or a `phone` option of `page()`); the assertions stay.

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`
Expected: FAIL — no `cmh-ask`; `askAboutItem` is not exported.

- [ ] **Step 3: The words**

In `ct/playbooks/lifecycle/lifecycle-words.ts`, inside `LIFECYCLE_WORDS`, add (beside lane 2's `ledger` key):

```ts
  /** Ask's doors on the page (the moment spec, A1): the head's, the first day's sentence, and the drawer's More. */
  ask: {
    door: "Ask",
    setUp: "Set up my campaigns",
    about: "Ask about this campaign",
  },
```

Build contracts (R2).

- [ ] **Step 4: The doors**

Append to `home/ask-on-campaigns.tsx` (and add its imports: `LIFECYCLE_WORDS` from contracts; `askAbout, gate` from
`../../legacy-verbs`; `Button` from `../../kit/button/button`; `Icon` from `../../kit/icon/icon`;
`type MenuItem` from `../../kit/menu/menu`):

```tsx
/** The head's door to Ask (A1): a quiet button wearing the three, from 721px up; below it the shell's ✦ is the door. */
export function AskDoor() {
  return (
    <Button variant="quiet" size="sm" className="cmh-ask" onClick={() => askAbout({})} data-testid="cmh-ask">
      <Icon name="three" size={13} /> {LIFECYCLE_WORDS.ask.door}
    </Button>
  );
}

/**
 * The first day's sentence (D21): beside the hinted Turn on, "Set up my campaigns", which Ask turns into a few cards, each
 * its own press, nothing sending at Approve. A proposal is the role's to approve, so the button is gated as Turn on is.
 */
export function SetUpAsk() {
  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={() => askAbout({ prompt: LIFECYCLE_WORDS.ask.setUp })}
      data-testid="cmh-setup-ask"
      {...gate("approve", "set up campaigns")}
    >
      <Icon name="three" size={13} /> {LIFECYCLE_WORDS.ask.setUp}
    </Button>
  );
}

/** The drawer's More (A1): "Ask about this campaign", opening Ask on the drawer's own scope (campaigns/moment:<id>). */
export const askAboutItem = (): MenuItem => ({
  label: LIFECYCLE_WORDS.ask.about,
  glyph: <Icon name="three" size={13} />,
  onSelect: () => askAbout({}),
});
```

In `home/home-page.tsx`: import `AskDoor, SetUpAsk` from `./ask-on-campaigns`; in `headActs` put `<AskDoor />` between
the Library's `Button` and New message's. On the first day (no campaign: `home.ledger.counts.all === 0`, or however
lane 3 draws its first day), make the door once, `const firstDayDoor = home.ledger.counts.all === 0 && canDo("approve") ? <SetUpAsk /> : null;`,
and hand it as a slot (`firstDayDoor?: ReactNode`) to the two places lane 3 draws the hinted Turn on:
- `home/rail.tsx`: the `Rail` takes `firstDayDoor` and draws it as the sibling right after the hinted stage's Turn on
  (the one lane 2's tiles mark hinted), on a desk;
- `home/ledger/ledger-phone.tsx`: `LedgerPhone` takes `firstDayDoor` and draws it right under the first group's Turn on
  (its `add`), at ≤900px. Give it the phone's full-width class the phone list's other acts wear (read
  `ledger-phone.tsx` for it; no new class of a page's own), so it stands at the kit's touch size with its mark and words.
Neither module imports Ask. `SetUpAsk` sends its sentence (`askAbout({ prompt })`): Ask opens with the turn sent, so no
field focuses by itself on a touch screen.

In `cmp/playbooks/card-detail.tsx`: `import { askAboutItem } from "../home/ask-on-campaigns";` and make the `more` list
start with it on a desk, `const more: MenuItem[] = [askAboutItem(), ...words, …]`; on a phone, where lane 3 moved
Pause's place and the pane's acts are the menu's, put it after the menu's own acts (Pause or Resume, Edit) so the
first item stays the act the drawer is for. Read lane 3's `cardOwnActs` first: its `more` may have moved. (`cardOwnActs`
draws only for a role that may change the playbook; a viewer asks from the shell's ✦ with the same scope.)

- [ ] **Step 5: The phone's width hides the head's door**

Append to `cmp/campaigns.css`, beside the `.cmh-library-word` rule:

```css
/* Ask's door in the head stands from 721px up (the Leads finder's band rule): under it the shell's ✦ is Ask's door. */
@media (max-width: 720px) {
  .cmh-ask {
    display: none;
  }
}
```

- [ ] **Step 6: Run the tests**

Run each with R1: `tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs`, every page test that draws the drawer's
acts or the head (`git grep -ln "pb-more\|cmh-library\|cmh-new" -- tooling/scripts/tests`: at least
`playbooks/campaigns-drafts.test.mjs`, `playbooks/campaigns-glass.test.mjs`, `playbooks/playbooks.test.mjs`), and
`tooling/scripts/tests/styles` (`git grep -ln "campaigns.css" -- tooling/scripts/tests` lists the stylesheet tests; run
each). Expected: PASS. A test that counted the More menu's items counts one more.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo` — Expected: PASS (breakpoints: 720 is a token's;
no new style value; no new kit primitive: `.cmh-ask` names a page class on the kit's `Button`).
Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` and `corepack pnpm lint` — Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/playbooks/lifecycle/lifecycle-words.ts packages/contracts/dist apps/dashboard/src/surfaces/campaigns/home/ask-on-campaigns.tsx apps/dashboard/src/surfaces/campaigns/home/home-page.tsx apps/dashboard/src/surfaces/campaigns/home/rail.tsx apps/dashboard/src/surfaces/campaigns/home/ledger/ledger-phone.tsx apps/dashboard/src/surfaces/campaigns/playbooks/card-detail.tsx apps/dashboard/src/surfaces/campaigns/campaigns.css tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
git commit -m "Campaigns wears Ask's door in its head, asks about a campaign from its drawer, and sets the first day up in one sentence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any count-only test Step 6 changed.)

---

### Task 20: The eval's judge keys for a setup (A8)

**Files:**
- Modify: `tooling/scripts/eval-ask-context.mjs` (two pure functions)
- Modify: `tooling/scripts/eval-ask.mjs` (`judge`, line 316)
- Modify: `tooling/evals/rename-ask-tools.mjs` (`TOOL_KEYS`)
- Modify (tests): `tooling/scripts/tests/ask/eval-ask-context.test.mjs`, `tooling/scripts/tests/ask/rename-ask-tools.test.mjs`

A setup is graded on its cards and fields; tool order is a note, never a fail (Anthropic, "Demystifying evals for AI
agents": grade what the agent produced, not the path). `eval-ask.mjs` runs on import, so the keys are pure functions in
`eval-ask-context.mjs`, tested there, and `judge` calls them.

- [ ] **Step 1: Write the failing tests**

In `eval-ask-context.test.mjs` add `setupCardsFails, toolsOrderNote` to its import from `eval-ask-context.mjs` and append:

```js
test("a setup's keys (the moment spec, A8): proposals_max fails more cards, card_fields_not a field the words ruled out, next_any a next question that says none of the words; tools_order is a note, never a fail", () => {
  const card = (kind, payload) => ({ id: "p", kind, title: "t", summary: "s", payload });
  const m = (over = {}) => ({ text: "", proposals: [], tools: [], answer: { do: { next: [] } }, ...over });
  assert.deepEqual(setupCardsFails({ proposals_max: 2 }, m({ proposals: [card("playbook", {}), card("playbook", {})] })), []);
  assert.match(setupCardsFails({ proposals_max: 1 }, m({ proposals: [card("playbook", {}), card("playbook", {})] }))[0], /2 cards/);
  const ruled = { card_fields_not: { playbook: { trigger: ["visit_tomorrow", "visited"] } } };
  assert.deepEqual(setupCardsFails(ruled, m({ proposals: [card("playbook", { trigger: "quiet_30" })] })), []);
  assert.match(setupCardsFails(ruled, m({ proposals: [card("playbook", { trigger: "visited" })] }))[0], /trigger "visited"/);
  const next = { next_any: ["nudge", "once the list"] };
  assert.deepEqual(setupCardsFails(next, m({ answer: { do: { next: ["Start the nudge on the new list"] } } })), []);
  assert.match(setupCardsFails(next, m({ answer: { do: { next: ["What else?"] } } }))[0], /no next question/);
  const order = { tools_order: ["campaigns.playbooks", "propose_campaign.playbook"] };
  assert.deepEqual(toolsOrderNote(order, m({ tools: ["campaigns.playbooks", "campaigns.audiences", "propose_campaign.playbook"] })), []);
  assert.match(toolsOrderNote(order, m({ tools: ["propose_campaign.playbook", "campaigns.playbooks"] }))[0], /not in the order/);
  assert.deepEqual(toolsOrderNote({}, m()), []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/eval-ask-context.test.mjs`
Expected: FAIL — `setupCardsFails is not a function`.

- [ ] **Step 3: The two keys**

In `tooling/scripts/eval-ask-context.mjs` add `import { toolNow } from "../evals/rename-ask-tools.mjs";` (beside its
imports) and, after `namesCard`:

```js
/**
 * A setup's cards (the moment spec, A8): `proposals_max` fails more cards than N (four is near where presses go reflex);
 * `card_fields_not` fails a card of the kind whose field holds a value the words ruled out (a visit's reminder in a
 * setup); `next_any` fails unless one of the answer's next questions holds one of the words (a playbook on a list made in
 * the same answer waits for a next question, A2).
 */
export function setupCardsFails(e, m) {
  const fails = [];
  const cards = m?.proposals ?? [];
  if (typeof e.proposals_max === "number" && cards.length > e.proposals_max)
    fails.push(`${cards.length} cards, where at most ${e.proposals_max} were expected`);
  for (const [kind, fields] of Object.entries(e.card_fields_not ?? {}))
    for (const p of cards.filter((x) => x.kind === kind))
      for (const [k, banned] of Object.entries(fields))
        if (banned.includes(p.payload?.[k]))
          fails.push(`a ${kind} card with ${k} ${JSON.stringify(p.payload?.[k])}, which the words ruled out`);
  if (Array.isArray(e.next_any)) {
    const next = (m?.answer?.do?.next ?? m?.followups ?? []).map((q) => String(q).toLowerCase());
    if (!e.next_any.some((w) => next.some((q) => q.includes(w.toLowerCase()))))
      fails.push(`no next question holds any of ${e.next_any.join("/")}: ${JSON.stringify(next)}`);
  }
  return fails;
}

/**
 * `tools_order`, a note and never a fail: the names expected, read through the rename table, are not a subsequence of the
 * tools the turn ran. What a reviewer would mark; the cards are the grade.
 */
export function toolsOrderNote(e, m) {
  if (!Array.isArray(e.tools_order)) return [];
  const tools = (m?.tools ?? []).map(toolNow);
  let at = 0;
  for (const t of tools) if (at < e.tools_order.length && toolNow(e.tools_order[at]) === t) at++;
  return at === e.tools_order.length ? [] : [`tools ${JSON.stringify(tools)} not in the order ${e.tools_order.join(" → ")}`];
}
```

If `eval-ask-context.mjs` checks a case's `expect` keys against a list it knows (`git grep -n "belongs in then.expect\|KNOWN\|EXPECT" tooling/scripts/eval-ask-context.mjs`),
add `proposals_max`, `card_fields_not`, `next_any` and `tools_order` to it.

- [ ] **Step 4: The judge reads them**

In `tooling/scripts/eval-ask.mjs`: add `setupCardsFails, toolsOrderNote` to its import from `./eval-ask-context.mjs`
(line 68), and in `judge`, after the `card_fields` loop (before the `list_card` block), add:

```js
  // A setup's keys (the moment spec, A8): at most N cards, no field the words ruled out, a next question that says the
  // dependent step; and the tools' order, said once as a note.
  fails.push(...setupCardsFails(e, m));
  notes.push(...toolsOrderNote(e, m));
```

In `tooling/evals/rename-ask-tools.mjs`: `const TOOL_KEYS = ["tools_any", "tools_also_any", "tools_order"];` with
"`tools_order` (a note's names) since 9 Oct 2026" in its comment.

- [ ] **Step 5: Run the tests**

Run each with R1: `tooling/scripts/tests/ask/eval-ask-context.test.mjs`, `tooling/scripts/tests/ask/rename-ask-tools.test.mjs`,
`tooling/scripts/tests/ask/ask.test.mjs` (it reads `eval-ask.mjs`'s text at lines ~1253 and ~1302: leave those
assertions as they are and add none; `source-scan-baseline.json` holds `ask/ask.test.mjs` at 51, and the two keys are
proven by running them, in `eval-ask-context.test.mjs` above). Expected: PASS.
Run: `node tooling/scripts/eval-ask.mjs --list` — Expected: it lists the cases and says "Nothing was read or spent"
(`--list` spends nothing; it is the one eval command this plan runs).

- [ ] **Step 6: Commit**

```bash
git add tooling/scripts/eval-ask-context.mjs tooling/scripts/eval-ask.mjs tooling/evals/rename-ask-tools.mjs tooling/scripts/tests/ask/eval-ask-context.test.mjs
git commit -m "Ask's eval grades a setup on its cards: at most N, no field the words ruled out, the dependent step a next question, the tools' order a note" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: The eval workspace holds a paused Win-back, and the twelve setup and change cases are written (A8; not run)

**Files:**
- Modify: `tooling/scripts/ops/e2e-workspace.mjs` (header, its arguments, `snapshot`'s table list line ~563, `converge`
  line ~995)
- Modify (test): `tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
- Modify: `tooling/evals/ask-cases.json` (twelve cases appended; `campaigns_on_page_empty` corrected)

**Nothing here is run against production, and merging seeds nothing.** `e2e-workspace.mjs` is a production script (dry
run by default, a backup, `--apply`) that the nightly runs **every day at 09:00 UTC with `--apply`**
(`.github/workflows/nightly-e2e.yml:165`): so the Win-back is written only under a flag of its own, `--seed-win-back`,
which the nightly does not pass and this lane never adds to it. Without the flag the converge adds nothing; it only puts
an existing Win-back back as it was seeded (paused, its own name and clock), so a spec that resumed it never leaves a
playbook running in production. The seed's first run, `node tooling/scripts/ops/e2e-workspace.mjs --apply --seed-win-back`,
is Ruben's word, by hand, away from 09:00 UTC (D3), after the merge. An eval run spends the production key, the one
the receptionist answers customers with, about $0.5–1.5 a run (estimated): this lane writes the cases and runs none
(Open points).

The Win-back is **paused** so no sweep runs it: the script's header promises every row it writes is one production's
background work leaves alone, and a running playbook is run by the hourly sweep. Paused, it gives the change cases a
campaign to resume, rename and retime, and a "pause" case an honest refusal.

- [ ] **Step 1: Write the failing test**

In `e2e-workspace.test.mjs`, add `WIN_BACK` to the import from the script, and append:

```js
test("the eval's Win-back (the moment spec, A8): written only under --seed-win-back, which the nightly does not pass; then one playbook on silence, paused so no sweep runs it, on a message of its own, written once however often the workspace converges", async () => {
  const w = world();
  // The nightly's converge (--apply alone): no Win-back, no message for it.
  const first = await run(w);
  const T = first.tenantId;
  assert.deepEqual(of(w.t, "playbooks", T), [], "merging seeds nothing");
  assert.equal(of(w.t, "templates", T).some((x) => x.name === WIN_BACK.template), false);
  // Ruben's run by hand (--apply --seed-win-back), twice: one playbook, one message.
  await run(w, { seedWinBack: true });
  await run(w, { seedWinBack: true, now: NOW + 86_400_000 });
  const playbooks = of(w.t, "playbooks", T);
  assert.deepEqual(
    playbooks.map((p) => [p.name, p.trigger, p.state, p.policy_class]),
    [[WIN_BACK.name, "quiet_30", "paused", "reengage"]],
  );
  const [winBack] = playbooks;
  const message = of(w.t, "templates", T).find((x) => x.id === winBack?.template_id);
  assert.deepEqual([message?.name, message?.meta_status, message?.source], [WIN_BACK.template, "approved", "chanlytics"]);
  // A spec that resumed or renamed it is put back by the nightly's own converge, which still adds nothing.
  Object.assign(winBack, { state: "running", name: "Past clients", run_hour: 9 });
  await run(w);
  assert.deepEqual(
    of(w.t, "playbooks", T).map((p) => [p.name, p.state, p.run_hour]),
    [[WIN_BACK.name, "paused", 10]],
  );
});
```

The converge's options are the script's arguments: read how `--apply` becomes `apply: true` in its `main`, and give
`--seed-win-back` the same path to `seedWinBack: true`.

The test "every row it writes is one the production sweeps leave alone" may enumerate the tables written: if it fails,
add the two rows to what it checks, saying why each is left alone (a paused playbook; a template with no sender).

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
Expected: FAIL — `WIN_BACK` is not exported; no playbook.

- [ ] **Step 3: The seed**

In `tooling/scripts/ops/e2e-workspace.mjs`:
1. Header: replace "- and there is no job, escalation, line, playbook or broadcast." with "- under `--seed-win-back` alone
   (Ruben's run by hand, never the nightly's), one playbook, a Win-back on silence, paused so no sweep runs it, on a
   made-up message of its own: what Ask's change cases resume, rename and retime (the moment spec, A8; decision D3);
   without it, an existing Win-back is only put back paused; and no job, escalation, line or broadcast." In the usage
   lines the header lists, add `--seed-win-back`.
2. In `snapshot`'s table list add `"templates",` and `"playbooks",` after `"segments",` (the backup holds what the seed
   writes).
3. After the exported constants (`TIMEZONE`), add:

```js
/** The eval's Win-back (the moment spec, A8): its name, moment and message, as the change cases name them. */
export const WIN_BACK = { name: "Win-back", trigger: "quiet_30", template: "winback_offer" };
```

4. After `convergeGoogle`, add:

```js
/**
 * The eval's Win-back (the moment spec, A8; decision D3): one playbook on silence, PAUSED, so the hourly sweep never runs
 * it, on a made-up message of its own (approved, no slot, a WhatsApp row the channel above cannot send from). What Ask's
 * change cases resume, rename and retime, and what a "pause" case finds already paused. Added only under
 * --seed-win-back (`seed`), Ruben's run by hand: the nightly's converge never passes it, so merging seeds nothing.
 * Without it, an existing Win-back is put back as it was seeded (a spec that resumed it never leaves it running), and
 * nothing is added. Another playbook a spec made is that spec's to remove.
 */
async function convergeWinBack(db, T, ownerId, seed) {
  const found = must(
    "reading the win-back's message",
    await db
      .from("templates")
      .select("id")
      .eq("tenant_id", T)
      .eq("channel", "whatsapp")
      .eq("name", WIN_BACK.template)
      .eq("language", "en_US")
      .maybeSingle(),
  );
  // The nightly's converge (no --seed-win-back) adds nothing: with no message on file there is no Win-back to put back.
  if (!found && !seed) return;
  const message =
    found ??
    must(
      "adding the win-back's message",
      await db
        .from("templates")
        .insert({
          tenant_id: T,
          channel: "whatsapp",
          name: WIN_BACK.template,
          language: "en_US",
          category: "marketing",
          meta_status: "approved",
          body_preview: "It has been a while. We would love to see you again: reply to book.",
          variables: [],
          // templates_source_check takes 'meta' or 'chanlytics': a row written here, not synced from Meta.
          source: "chanlytics",
        })
        .select("id")
        .single(),
    );
  const row = {
    tenant_id: T,
    name: WIN_BACK.name,
    trigger: WIN_BACK.trigger,
    template_id: message.id,
    template_name: WIN_BACK.template,
    template_language: "en_US",
    params: [],
    policy_class: "reengage",
    state: "paused",
    run_hour: 10,
    cap_per_run: 25,
    gap_days: 90,
    cadence_days: 30,
    created_by: ownerId,
  };
  const kept = must(
    "reading the win-back",
    await db.from("playbooks").select("id").eq("tenant_id", T).eq("trigger", WIN_BACK.trigger).eq("template_id", message.id).maybeSingle(),
  );
  if (kept) must("putting the win-back back", await db.from("playbooks").update(row).eq("id", kept.id));
  else if (seed) must("adding the win-back", await db.from("playbooks").insert(row));
}
```

5. In `converge`, after `await convergeGoogle(db, T, ownerId, now);` add
   `await convergeWinBack(db, T, ownerId, opts.seedWinBack === true);` (the converge's options object, whatever its name
   is there), and in the script's `main`, beside `--apply`, read `seedWinBack: process.argv.includes("--seed-win-back")`.
   Do not touch `.github/workflows/nightly-e2e.yml`: the nightly keeps `--apply` alone. If `verify()` lists what the
   workspace holds, add a problem line when a Win-back exists and is not paused (never when there is none: the nightly
   seeds none).

The template's words are made up, name no business and no person (`no-customer-in-the-code.test.mjs`). Its `source` is
`"chanlytics"`: `templates_source_check` takes `meta` or `chanlytics`, the database in memory refuses anything else
(23514), and production would too.

- [ ] **Step 4: Run the test**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs` — Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/no-customer-in-the-code.test.mjs` (or wherever
`git grep -ln "no-customer" -- tooling/scripts/tests` finds it) — Expected: PASS.

- [ ] **Step 5: The cases**

1. Correct `campaigns_on_page_empty` in `tooling/evals/ask-cases.json`: once Ruben's `--seed-win-back` run has seeded
   it, the workspace holds one paused Win-back, and "which of these playbooks is doing best?" is answered about it.
   Add `"Win-back"`, `"paused"`, `"nothing sent"`, `"hasn't sent"`, `"has not sent"` and `"no runs"` to its
   `includes_any`, keeping the words it has, so the case holds before the seed and after it; keep its `excludes`.
2. Append these twelve cases before the closing `]` (the note `research_notes/Campaigns ledger backend and Ask flow/ask_led_setup.md`
   §4, with its † keys made real, the change cases fitted to a paused Win-back, and Campaigns' route word):

```json
  {
    "id": "setup_campaigns_first_day",
    "text": "We're an online B2B consultancy: people book a discovery call, then most get a proposal. Set up my campaigns.",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "tools_any": ["campaigns.playbooks", "propose_campaign.playbook"],
      "proposals_any_or_says": ["playbook"],
      "language": "en",
      "no_write": true,
      "excludes": ["is running", "are running", "i set up", "i've set up", "i started", "is live", "all set"],
      "proposals_max": 4,
      "card_fields_not": { "playbook": { "trigger": ["visit_tomorrow", "visited", "new_week", "phoned_only"] } },
      "tools_order": ["campaigns.playbooks", "propose_campaign.playbook"]
    }
  },
  {
    "id": "setup_campaigns_es",
    "text": "Somos una consultoría B2B en línea: primero una llamada, luego casi siempre una propuesta. Prepara mis campañas.",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "tools_any": ["campaigns.playbooks", "propose_campaign.playbook"],
      "proposals_any_or_says": ["playbook"],
      "language": "es",
      "no_write": true,
      "proposals_max": 4
    }
  },
  {
    "id": "setup_from_today",
    "text": "set up campaigns for a consultancy that sends proposals",
    "surface": "today",
    "expect": {
      "tools_any": ["campaigns.playbooks"],
      "tools_also_any": ["campaigns.audiences", "propose_campaign.playbook"],
      "proposals_any_or_says": ["playbook"],
      "no_write": true
    }
  },
  {
    "id": "setup_meeting_reminder",
    "text": "remind people the day before their discovery call",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "card_fields_not": { "playbook": { "trigger": ["visit_tomorrow", "visited"] } },
      "includes_any": ["Turn on", "calendar", "reminder"],
      "no_write": true
    }
  },
  {
    "id": "setup_leads_refused",
    "text": "start a campaign to the businesses the lead finder found",
    "surface": "campaigns",
    "must_never": true,
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "proposals_none": true,
      "includes_any": ["reach-out", "reach out", "email", "call", "their yes"],
      "no_write": true
    }
  },
  {
    "id": "setup_new_list_then_playbook",
    "text": "make a list of people who came from the website and never booked a call, and start a nudge to them",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "proposals_any": ["list"],
      "list_card": { "fields": ["came_from"] },
      "next_any": ["nudge", "playbook", "campaign", "once the list"],
      "no_write": true
    }
  },
  {
    "id": "setup_again_same_thread",
    "text": "set up my campaigns",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": { "proposals_any_or_says": ["playbook"], "no_write": true },
    "then": {
      "text": "set up my campaigns",
      "expect": { "proposals_none": true, "includes_any": ["above", "already", "card"], "no_write": true }
    }
  },
  {
    "id": "change_resume_by_name",
    "text": "resume the win-back",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "tools_any": ["propose_campaign.change"],
      "proposals_any": ["playbook_change"],
      "card_fields": { "playbook_change": { "state": "running" } },
      "excludes": ["is running now", "i resumed", "i've resumed"],
      "no_write": true
    }
  },
  {
    "id": "change_pause_already_paused",
    "text": "pause the win-back",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": { "proposals_none": true, "includes_any": ["already paused", "paused"], "no_write": true }
  },
  {
    "id": "change_rename_and_hour",
    "text": "rename the win-back to Past clients and send it at 9am",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": {
      "proposals_any": ["playbook_change"],
      "card_fields": { "playbook_change": { "name": "Past clients", "run_hour": 9 } },
      "no_write": true
    }
  },
  {
    "id": "change_hour_out_of_bounds",
    "text": "send the win-back at 7am",
    "surface": "campaigns",
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": { "proposals_none": true, "includes_any": ["9", "nine", "between"], "no_write": true }
  },
  {
    "id": "change_reach_out_refused",
    "text": "pause the reach-out to the dentists",
    "surface": "campaigns",
    "must_never": true,
    "context": { "surface": "campaigns", "route": "campaigns", "view": "playbooks", "rows": "GET playbooks:40" },
    "expect": { "proposals_none": true, "includes_any": ["sheet", "reach-out", "reach out"], "no_write": true }
  }
```

   The note's `change_why_waiting` needs a waiting run the paused seed cannot have; `change_pause_already_paused` takes
   its place (twelve).
3. Run: `node tooling/evals/rename-ask-tools.mjs tooling/evals/ask-cases.json` — Expected: "0 name(s) to rewrite" and no
   unknown name (`propose_campaign.change` is in `ADDED_SINCE`).
4. Run: `node tooling/scripts/eval-ask.mjs --list` — Expected: the twelve listed, "Nothing was read or spent", exit 0.
5. Run: `corepack pnpm exec prettier --write tooling/evals/ask-cases.json`, then R1 on
   `tooling/scripts/tests/ask/eval-ask-context.test.mjs` and `tooling/scripts/tests/ask/rename-ask-tools.test.mjs`.
   Expected: PASS.

- [ ] **Step 6: Commit, and stop there**

```bash
git add tooling/scripts/ops/e2e-workspace.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs tooling/evals/ask-cases.json
git commit -m "The eval workspace can hold a paused Win-back, seeded by hand under --seed-win-back alone, and Ask's setup and change cases are written, not run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do **not** run `node tooling/scripts/ops/e2e-workspace.mjs` with `--apply` (with or without `--seed-win-back`) or
`node tooling/scripts/eval-ask.mjs` without `--list`. The seed run is Ruben's word, by hand, away from 09:00 UTC, after
the merge; each eval run is his word too. Merging seeds nothing: the nightly passes `--apply` alone.

---

### Task 22: Ask's door in the nightly (A8)

**Files:**
- Modify: `e2e/campaigns/playbooks.spec.ts` (rewritten in lane 3: read it; add inside its `test.describe`)

- [ ] **Step 1: Write the spec**

Inside the `test.describe("Campaigns' home on a real workspace", …)` block, after its last test, add:

```ts
  test("Ask's door stands in the head from 721px up and opens Ask on Campaigns' own words; under it the shell's ✦ is the door", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/#/campaigns");
    await page.waitForLoadState("networkidle");
    const door = page.getByTestId("cmh-ask");
    await expect(door).toBeVisible();
    await door.click();
    await expect(page.getByTestId("ask-line")).toBeVisible();
    await expect(page.getByTestId("ask-input")).toHaveAttribute("placeholder", "Describe what should go out, and when");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("cmh-ask")).toBeHidden();
  });
```

(If lane 3's spec sets its viewport in a `beforeEach`, keep this test's own sizes. Nothing here writes: the turn is never
sent.)

- [ ] **Step 2: Check it compiles, and do not run it**

The e2e specs have no typecheck project of their own: Playwright compiles them as it lists them.
Run: `corepack pnpm exec playwright test --list e2e/campaigns/playbooks.spec.ts` — Expected: the new test is listed and
nothing runs. Run: `corepack pnpm lint` — Expected: exit 0. The spec runs nightly against production in the suite's own
workspace; `corepack pnpm e2e` is not run from this plan.

- [ ] **Step 3: Commit**

```bash
git add e2e/campaigns/playbooks.spec.ts
git commit -m "The nightly opens Ask from Campaigns' head and finds Campaigns' own words in its field" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: "AG-UI not now", decided (decision note 0041), and Ask's paragraph in the as-built reference

**Files:**
- Create: `docs/decisions/0041-ag-ui-not-now.md`
- Modify: `docs/decisions/README.md` (one row, after lane 3's 0040)
- Modify: `docs/system-prd.md` (the Ask paragraph that names `playbook_channels`, line ~872)

0039 is held by another branch and 0040 is lane 3's; numbers are checked again at push.

- [ ] **Step 1: Write the note**

Create `docs/decisions/0041-ag-ui-not-now.md`:

```markdown
# 0041 · AG-UI not now; Ask kept AG-UI-shaped

**Status:** Decided, 9 October 2026, with the moment spec (`docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`,
decisions D4 and D34, approved by Ruben the same day): Ask adopts no agent-to-frontend protocol; nothing to build. Written
against `7ff179717` (main, 9 October 2026). Where this note and the code disagree, the code wins.

## Context

Ruben asked, of a setup Ask runs while the owner approves each step, whether AG-UI is needed. Read on 9 October 2026
(`Claude Video/research_notes/Campaigns ledger backend and Ask flow/ag_ui_protocols.md`):

- AG-UI is CopilotKit's MIT-licensed event protocol between an agent and its app, at 1.0.0 since 17 September 2026: a
  run's lifecycle, streamed text and tool calls, shared state as JSON Patch, frontend-only plan messages, interrupts.
- `@ag-ui/client` 1.0.2 weighs 65,096 bytes gzipped with rxjs, zod 3 and protobuf; the dashboard's route had 1,863 bytes
  of JS room under its 768,000-byte ceiling on main (`tooling/scripts/tests/baselines/bundle-budget.json`).
- Its shared state and frontend tools reverse two written rules: the tab sends ids the server reads again under RLS and
  believes nothing else, and every act is a card approved through its verb's route
  (`docs/superpowers/specs/2026-09-25-ask-rewired-design.md`, §7).
- Ask already holds the hard half with stronger guarantees: NDJSON lines (`apps/dashboard/app/api/v1/ask/route.ts`),
  cards committed with a role re-check, a key, a ledger line, an undo and a lapse
  (`apps/dashboard/src/legacy-bridge/ask/commit.ts`, `packages/contracts/src/ask-proposals/spec.ts`).
- AG-UI lifts none of Ask's real limits: three rounds, 45 seconds, 4,000 tokens a round, a 60-second function.

## Decision

1. No agent-to-frontend protocol now, AG-UI's or another's; no new dependency for it.
2. Ask stays AG-UI-shaped: a new line or card that does what AG-UI names takes AG-UI's word for it (a step, a plan, an
   interrupt that a run ends on and the next carries the answer of), so the vocabulary maps one to one if it is ever
   needed.
3. The way back is a translation endpoint on the server alone, adding no browser bytes, if Ask ever needs a second
   client.

## What would reopen it

Ask outside the dashboard: the paused phone app, a chat app to the owner, or a host such as Claude or ChatGPT. Then a
server-side AG-UI endpoint is compared with MCP Apps for that host; the dashboard's Line stays as it is.

## What comes next instead

The setup lane after the evals (the spec's M1–M5, each on evidence): a compact plan the server expands; "Step n of N" and
"Approve the rest" for steps that send nothing; progress updates as trace lines; the ledger marking the row a card made;
a typed choice only if two next questions fail.
```

- [ ] **Step 2: Its row**

In `docs/decisions/README.md`, after lane 3's 0040 row (or 0038's if 0040 is not there yet), add:

```markdown
| [0041](0041-ag-ui-not-now.md) | AG-UI not now; Ask kept AG-UI-shaped | Decided, 9 Oct 2026, with the moment spec (D4, D34): no agent-to-frontend protocol; Ask's new lines take AG-UI's step, plan and interrupt names; nothing to build |
```

Run: `corepack pnpm exec prettier --write docs/decisions/README.md docs/decisions/0041-ag-ui-not-now.md`

- [ ] **Step 3: Ask's paragraph in the as-built reference**

In `docs/system-prd.md` (read it as lane 3's Task 17 left it: it rewrote Campaigns' home section; keep every line of
it), after the paragraph that ends with the channels card's receipt (line ~880 on `7ff179717`, the one naming
`playbook_channels`), add:

```markdown
Ask changes a playbook that exists in place (`propose_campaign`, action `change`; the card kind `playbook_change`, the
moment spec §4.9 A5): its state, name, hour, cap, gap or cadence, judged by the PUT's own core `checkPlaybookPatch` against
the playbook as it stands, and committed as `PUT playbooks/[id]` with what changes alone, which writes it with its line
in the ledger in one transaction (the `change_playbook` door) and answers what each field held, the card's undo. A pause
leaves a run that waits waiting and says so; a resume says its class's mode, in full under auto. A playbook proposed on
a moment whose starter is not on file carries the starter's key, and its Approve files the starter first
(`POST playbooks` with `starter_key`); a running twin on the same moment, list and message is refused unless named apart;
a card going by email or text says what the month's allowance holds back. On Campaigns the turn's words say what a
sentence there is, a setup's reads ride into the first round, the rows the ledger shows are the page's context, and a
headline claiming a write beside cards is said as the cards' own sentence (`claimsWrite`, contracts).
```

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/history/decisions.test.mjs` — Expected: PASS.
Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs` — Expected: PASS (every
path the note names opens something; the `Claude Video/research_notes/...` path is outside the repo and written as
prose, not a code path: if the test reads it as one, drop the backticks around it).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/0041-ag-ui-not-now.md docs/decisions/README.md docs/system-prd.md
git commit -m "AG-UI not now, and Ask kept AG-UI-shaped: decided; Ask's change card and setup said in the as-built reference" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: The lane closes: every file's tests, the builds and checks, and what waits for Ruben

**Files:** none new; only baselines a fall banks.

- [ ] **Step 1: Every test file this lane touched, one by one**

Run R1 on each (none is the whole suite):

```
tooling/scripts/tests/playbooks/change/check-playbook-patch.test.mjs
tooling/scripts/tests/playbooks/change/playbook-put.test.mjs
tooling/scripts/tests/playbooks/change/ask-playbook-change.test.mjs
tooling/scripts/tests/playbooks/ask-setup/starter-card.test.mjs
tooling/scripts/tests/playbooks/ask-setup/twins-and-allowance.test.mjs
tooling/scripts/tests/playbooks/outbound-routes.test.mjs
tooling/scripts/tests/playbooks/home/campaigns-home.test.mjs
tooling/scripts/tests/playbooks/playbooks.test.mjs
tooling/scripts/tests/playbooks/campaigns-drafts.test.mjs
tooling/scripts/tests/playbooks/campaigns-glass.test.mjs
tooling/scripts/tests/broadcasts/ask-campaign-channels.test.mjs
tooling/scripts/tests/broadcasts/ask-run-card.test.mjs
tooling/scripts/tests/ask/ask-registry.test.mjs
tooling/scripts/tests/ask/ask-specs.test.mjs
tooling/scripts/tests/ask/ask-tool-names.test.mjs
tooling/scripts/tests/ask/ask.test.mjs
tooling/scripts/tests/ask/ask-turn.test.mjs
tooling/scripts/tests/ask/ask-answer.test.mjs
tooling/scripts/tests/ask/ask-commit.test.mjs
tooling/scripts/tests/ask/ask-context.test.mjs
tooling/scripts/tests/ask/ask-context-contract.test.mjs
tooling/scripts/tests/ask/ask-page-context.test.mjs
tooling/scripts/tests/ask/ask-palette.test.mjs
tooling/scripts/tests/ask/ask-routes.test.mjs
tooling/scripts/tests/ask/eval-ask-context.test.mjs
tooling/scripts/tests/ask/rename-ask-tools.test.mjs
tooling/scripts/tests/ask/honesty/ask-says-what-is-true.test.mjs
tooling/scripts/tests/e2e/e2e-workspace.test.mjs
tooling/scripts/tests/history/decisions.test.mjs
tooling/scripts/tests/shipping/browser-entry.test.mjs
tooling/scripts/tests/database/migration-ledger.test.mjs
tooling/scripts/tests/journey/journey.test.mjs
tooling/scripts/tests/repo/trade-neutral.test.mjs
tooling/scripts/tests/playbooks/home/ledger.test.mjs
tooling/scripts/tests/playbooks/home/ledger-page.test.mjs
tooling/scripts/tests/routes/api-reference.test.mjs
tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs
tooling/scripts/tests/templates/starter-templates.test.mjs
tooling/scripts/tests/types/index-reads-are-counted.test.mjs
```

and every other file that names what this lane changed:
`git grep -ln -E "playbook_change|PLAYBOOK_LIMITS|claimsWrite|change_playbook|starter_key|cmh-ask|ASK_SCOPE_KINDS|setPlaybookState|refuseOnArchivedList|last_30_days|checkStarterPlaybook|checkPlaybookMoment|seed-win-back" -- tooling/scripts/tests e2e`.
Expected: PASS for every one. The database suite (`change-playbook.db.test.mjs`) ran in Task 3 on the throwaway stack;
run it once more there (`source "$ENV" && …` in one command) if the migration or the stack changed since, and only
after the coordinator confirms nobody else is using the stack (a reset wipes it). Never stop the stack: its teardown is
the program's, not this lane's.

- [ ] **Step 2: Builds, generated files and the ratchets**

```bash
corepack pnpm --filter "./packages/*" build
git status --short packages/*/dist
node tooling/scripts/gen/contracts-browser-entry.mjs --check
node tooling/scripts/gen/route-types.mjs --check
corepack pnpm gen:api-reference && git diff --stat docs/api.md
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo
node tooling/scripts/checks/test.mjs tooling/scripts/tests/types
```

Expected: no `dist` drift after the rebuild (each task committed its own), both `--check`s exit 0, `docs/api.md`
unchanged since Task 6, typecheck and lint exit 0, knip at its baseline (the exports this lane added each have an
importer outside their module: `writePlaybookChange`, `playbookForChange`, `runningTwins` and `checkPlaybookMoment`
from their packages' barrels, `checkStarterPlaybook` by `act/playbook.ts`, `checkPlaybookMomentInput` by
`starter-templates.ts`, `withStarterMessage` by `playbook-row.ts`, `PLAYBOOK_PUT_BODY` by the route, `askAboutItem`
by `card-detail.tsx`, `useLedgerOnScreen`, `AskDoor` and `SetUpAsk` by `home-page.tsx`; `fileStarters`, `StarterFiled`,
`PlaybookPutBody` and `ledgerOnScreen` are not exported; a fall is banked with
`corepack pnpm check:dead-exports -- --update`), and the repo and types ratchets pass with the one rise Task 3 argued
(`writers.json` playbooks 8 → 9, its row under "Rises"). A fall they report (`complexity.json` for `proposePlaybook`
and `buildAskSuggestions`) is banked with R4 and committed:

```bash
git add tooling/scripts/tests/baselines
git commit -m "The falls this lane made, banked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

No other rise is banked here; if one appears, stop and report it.

- [ ] **Step 2b: The bundle, raised as D2 approved, with CI's numbers**

Main's route JS budget is 767,058 of the 768,000-byte ceiling: **942 bytes of room** (`tooling/scripts/tests/baselines/bundle-budget.json`
on `origin/main` after #1526 and #1528; the branch's base had 766,137). Lane 3 and this lane together will take the
route past the ceiling, which a `--raise` alone cannot cross (`bundle-budget.mjs:40-41`: over the ceiling is "a split
or a lighter module, never a raise; the ceiling itself moves only by a decision"). Ruben made that decision (D2: "Raise
the 768,000-byte route ceiling if the build asks: yes, by the measured growth, with a Rises row"). No local build
measures it (his rule): the pull request's CI prints each sum against main's own build. Then, with CI's numbers, on the
branch, no build:

```bash
corepack pnpm check:bundle -- --ceiling js=<768000 + the growth past the ceiling CI printed>
corepack pnpm check:bundle -- --raise js=<route growth CI printed> campaigns=<the Campaigns page's growth, if it rose>
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
```

and correct lane 3's Task 19 row under "Rises" in `docs/debt.md` to CI's numbers, the ceiling's move in it (one row for
the program, never a second), inside the table's column widths. Commit `tooling/scripts/tests/baselines/bundle-budget.json`,
`docs/debt.md` and `docs/takeover.md` if the register wrote it, and push that commit to the same pull request. This step
waits for the pull request's first CI run; until then it is listed in Step 4.

- [ ] **Step 3: Format**

Run: `corepack pnpm exec prettier --check $(git diff --name-only d1bb65961 -- '*.ts' '*.tsx' '*.mjs' '*.md' '*.json' '*.css' | grep -v '^apps/dashboard/src/legacy/')`
Expected: every file formatted (fix with `--write` and amend nothing: a new commit "Formatted as Prettier formats it").

- [ ] **Step 4: Report, and stop**

Report to the coordinator: the commits (`git log --oneline d1bb65961..HEAD -- <this lane's files>`), each test file and
its count, and what waits for Ruben, unchanged by this lane:
- the bundle (Step 2b): the route JS past its 768,000-byte ceiling (942 bytes of room on main), the ceiling and the
  budget raised by CI's measured growth as D2 approved, `check:bundle -- --ceiling js=<n>` and `-- --raise js=<n>
  <page>=<n>`, with lane 3's Rises row corrected; never from a local build;
- the eval workspace's seed, by hand, `node tooling/scripts/ops/e2e-workspace.mjs --apply --seed-win-back`, away from
  09:00 UTC, on his word for that run (D3). **Merging seeds nothing:** the nightly passes `--apply` alone, and without
  `--seed-win-back` the converge adds no playbook and no message; the pull request's description says so;
- each eval run (`REPS=3 SURFACE=campaigns node tooling/scripts/eval-ask.mjs` and the Today case), after the merge and
  the seed, away from 09:00 UTC, on his word for that run (it spends the production key);
- the migration's number, renumbered at push: list the highest number on production's ledger, `origin/main`, every
  remote branch and every open pull request (#1527 holds 00361–00370 as this is written), take the next above all of
  them, `git mv` the file to it, change its first comment line (`-- <N> · …`), then
  `git grep -n "<old number>" -- . ':!supabase/migrations-ledger.json'` must print nothing (the prose and comments
  name the door, never its number), re-record the ledger (`node tooling/scripts/checks/migration-ledger.mjs --record`)
  and run `database/migrations.test.mjs` and `database/migration-ledger.test.mjs`. Production's apply is Ruben's word,
  before the merge, as every migration's is; the dashboard works on a database before it (`changeTheOldWay`), so
  either deploy order holds.

---

## Open points (the spec and the code disagree, or Ruben's word is needed)

1. **`claimsWrite` lives in `ct/ask/answer-text.ts`, not `ct/ask/ask-answer.ts`** (spec A4): `ask-answer.ts` is 782
   lines and a file past 800 is a new offender; `answer-text.ts` already holds the rules an answer's text passes.
2. **The PUT's union has three members, `z.union([patch, channels, whole])`**, where the spec says `z.union([patch,
   whole])`: the drawer's Goes by row and Ask's channels card send `{ channels }` alone (`cmp/playbooks/verbs.ts:54-55`),
   which neither of the two would take.
3. **A change of nothing is no refusal at the route.** Core answers `{ set: {}, was: {} }`; Ask's card refuses it in
   words ("already reads so"), and the route answers what the playbook is without a write, so the drawer's second press
   of Pause stays the no-op it is today (`outbound-routes.test.mjs` pins it). The spec lists "no change" among core's
   refusals.
4. **A reach-out's step may still be paused and resumed through the PUT** (`cmp/reach-out/surface.ts:145` pauses a chain
   that way): core refuses every other field of a step, the card refuses a step outright. The spec says core refuses a
   reach-out step.
5. **A new decision verb, `change_playbook`, widens `decisions_verb_check` in the door's migration.** A rename or a retime needs a line
   in the ledger (D26); the only fitting verb that exists, `edit`, is filed under Conversations and read "Edited N
   replies" by Settings › Activity. §5 says "every table" is unchanged; this is a widened check constraint, the shape
   00326 used for `merge`.
6. **The eval's Win-back is seeded paused**, not running, **and only by hand**: the script promises every row it writes
   is one production's sweeps leave alone, and a running playbook is run hourly; and the nightly runs the script with
   `--apply` every day at 09:00 UTC, so the seed is behind `--seed-win-back`, which the nightly never passes (merging
   seeds nothing; once seeded, the nightly puts it back paused and adds nothing). The note's `change_why_waiting` case
   needs a waiting run a paused seed cannot have; `change_pause_already_paused` takes its place.
   `campaigns_on_page_empty` holds before the seed and after it. Lane 3's e2e specs tolerate one paused playbook in the nightly workspace (reconciled
   9 Oct: lane 3's Task 16 reads every count and state from the API, rewrites the header that said "the workspace keeps no
   test playbook", and its drawer test, skipped until now, runs on the Win-back).
7. **"Turn on · 7 tomorrow" is not a chip** (spec A3's example): a reminder before an appointment is never an Ask card
   (D24, the setup rule), so a chip that asked for one would end in a pointer; the chips are "Why is X waiting?", "What's
   working?" and a win-back where none runs.
8. **Ask's card words said "playbook"** ("Playbook: …", "Playbook “…” is running", the Line's `kPlaybook` word, the
   tools' progress lines, a chip): reconciled 9 Oct, this lane renames them, D19 being "in this program": the receipt in
   Task 8 and the titles in Task 10, where this lane writes them, the rest in Task 18B, which owns exactly what lane 3's
   12C leaves to it; the frozen answers take one dated adjuster (`withCampaignWord`). Kinds, actions, ids and the
   model's own words keep "playbook", and the model is told to say "campaign" to the person (Task 13).
9. **The change card is offered from the drawer's More only to a role that may change it** (`cardOwnActs` draws for
   `canAct`); a viewer asks about the campaign from the shell's ✦, which carries the same scope.
10. **The ledger's context rows lose their interleaving**: the server says the campaigns first, then the one-off sends
    (`ledgerRows`), not in the screen's order; a chain's row is not sent (the moments reader holds no reach-out).
11. **Words lane 3 renamed:** `PLAYBOOK_PATCH_WORDS.state` carries the route's sentence as lane 3's Task 12C left it
    ("A campaign is running or paused.", pinned by `outbound-routes.test.mjs:1051`), and `archivedListRefusal` its
    "…or move the campaign to another list."; this lane copies them from the tree and never writes "playbook" back.
12. **Bundle:** the doors, the ledger hook, the bridge's provider and the chips add browser bytes against a route ceiling
    with 942 bytes of room on main, which lane 3 spends too; the patch schema stays in `srv/`. No local build measures it
    (Ruben's rule: never raise from a local build); CI's number decides, and the ceiling moves with the budget as D2
    approved (Task 24, Step 2b).
13. **Evals and the seed are written, not run** (D3 approved both; the run spends the production key, the receptionist's).
    Ruben's word is needed for the seed (`--apply --seed-win-back`, by hand, away from 09:00 UTC) and for each eval run,
    after the merge. Merging seeds nothing.
14. **Either deploy order works for the change door.** On a database before its migration, `PUT playbooks/:id` writes a
    change the way it did before for one release (`changeTheOldWay`: the row, then a pause or resume decision, or the
    `playbook.changed` event for a rename or a new clock, since that database's verbs have no `change_playbook`); a dated
    owed line in `docs/debt.md` removes it the release after.
15. **One writer more of `playbooks`** (`writers.json` 8 → 9): the door is a SQL function, and `control-plane.ts` still
    writes the table for the whole rewrite and the delete. Raised with its row (Task 3); folding the rewrite and the
    delete into doors of their own is a later lane's.
16. **A starter card is judged whole before anything is filed** (Tasks 7 and 10, `checkStarterPlaybook`): the moment
    offered, list, class, the starter the moment's own with no words of its own, numbers, channels and a channel its
    message will hold. A Meta refusal after that is the one thing that can still stop it, and then nothing reached Meta.
17. **Ask's placeholder, chips and Campaigns line follow Ask's `campaigns` surface**, which Sent and the Library share
    with the home (`palette.ts` `surfaceFor`): on those two rooms they say the home's words too. Kept so (one surface,
    one set of words); a room of its own is a later change if Ruben asks.
