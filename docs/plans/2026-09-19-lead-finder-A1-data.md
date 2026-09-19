# Lead Finder A1 (the data and the contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release A of the lead finder, first half: the engine's data and its contracts, with no screen and no provider call. One migration (00139) that holds a search, its rounds, its runs, the places found, each search's own judgment of each place, the month's allowance and searching budget with the two day caps, the undo records and the never-again list; the doors an owner's routes will call and the RPCs the edge's jobs will call, each one transaction; two contracts modules that decide everything with a right answer (the plan and its sentence, the class of a place from the judge's answers, how many places to ask for, when to stop and ask, which of the nine endings a round gets, the judge's schema and parser); and the proofs on a real Postgres. A2 (`docs/plans/2026-09-19-lead-finder-A2-pipeline.md`) brings the provider, the judge's call, the three jobs, the webhook, the sweep's handler and the routes, and starts at the next free migration number.

**Architecture:** The search is the saved object; a round is the unit of execution and money, final once ended; a run is one provider execution claimed before the provider is called and leased by owner token and generation while a page is read; a lead is a place, unique by place id in a workspace, never merged on a shared phone, email or host; a membership joins a lead to a search with that search's class. Counters are locked in one order inside one door (allowance, budget, the workspace's day, the platform's day) and settled as pages commit; nothing is held across a provider or model call. `lead_collect_commit` is one page in one transaction: the judgment kept by operation id, the leads and members inserted once, Qualified members counted up to the round's reservation, the usage settled, the offset moved by compare-and-set, the next job written once, the round moved, the events appended. Every write from a session goes through a `SECURITY DEFINER` door that judges `auth.uid()` and the role; the edge's RPCs are `service_role`'s alone; members read through row security in the 00002 shape. Contracts hold the plan (`LeadSearchPlanSchema`, zod 4), its sentence, `classify` (§0.1: code decides from per-criterion answers), `placesToAsk` (S6), `questionAfterProbe` (P4), `endingOfRound` (S7), the cleaner (§7.2), the cards' briefs, the judge's hand-written JSON schema and its zod parser; the stored sets are held to the database's own CHECKs at compile time.

**Tech Stack:** Supabase Postgres 17 (plpgsql, row security, pg_cron, the local stack through Supabase CLI 2.116.0), TypeScript 5.7 with zod 4 in `packages/contracts` (built by tsup into a committed `dist`), the jobs ledger in `packages/jobs`, `node:test` under `tsx`, the real local Postgres for the `*.db.test.mjs` suites.

---

## Read this first

**The spec** is PRD v3, `docs/plans/2026-09-17-people-table-and-lead-finder.md`: §0 (the five contracts), §7, §10, §12.3 to §12.6, §13.3, §14 (release A) and §16 (18 to 32). **The interface** both release A plans share is `docs/plans/2026-09-19-lead-finder-A-interface.md` (in the planning session's scratchpad; its contents are restated here wherever a name or a shape is used, so this plan stands alone): where the interface and the PRD disagree the interface wins for names and shapes, the PRD for behaviour. **The review brief** is `docs/plans/2026-09-18-lead-finder-review.md` (E1 to E11, S1 to S18, G3). The v2 plan (`docs/plans/2026-09-18-lead-finder.md`, sub-plan 1a) is raw material only: its cleaner, prices, words and month survive; its migration and its plan, verdict and counting shapes do not, and the twenty defects the reviewer found in it are listed under *What this plan does not repeat* below.

**What A1 is, and is not.** A1 lands with the switch off for everyone and no workspace listed: nothing runs, nothing spends, no owner sees Leads. It carries every table of PRD §12.4, every door and RPC of the interface, the contracts, and their proofs. It carries no provider client, no judge call, no job handler body (the three kinds are declared and reach a seam the edge injects in A2), no webhook, no sweep handler (the clock is registered and asks the edge only when there is lead work, so before A2 it never asks), and no route.

**Proven before this plan was written.** Every code block below was written into a worktree at origin/main `fbc5d871`, run, and copied here verbatim; the exact commands and outputs are in *Proven before this plan was written* at the end. In short: the two contracts test files pass (18 tests); the migration applies on the local Postgres inside a rolled-back transaction with no error, after the four migrations the local database lacked (00134, 00135, 00137, 00138), and 13 blocks of SQL asserts over its doors and RPCs held (the reservation and the refusals in a sentence, the claim, the lease, the compare-and-set commit, five asked and twenty qualified counting five, the shared-phone triple, keep/exclude/put back/undo, the hidden and out-of-area refusals, the check, the guard, answer/stop/more/remove/undo_search, the write-in link and the erasure, the member's reads under row security, retention, the clocks, the privileges); the CHECK sets read out of that database render `schema-sets.generated.ts` exactly as the generator does (73 sets); contracts typechecks; every package and app typechecks; the whole unit suite is `# fail 0` (3005 tests, 179 skipped without a database); lint reports 0 errors; the five dists rebuild with real diffs. The real-Postgres test of Task 5 parses, lints and skips without a database; its blocks are the SQL proof's, one for one, and it runs green in Task 5 on the replayed local stack.

**Where the interface and the code disagree, and what this plan does** (each was forced by code that exists on main; every other name and shape is the interface's):
1. **`jobs` has `due_at`, not `run_after`.** The interface says `insert jobs(..., run_after now())`; the column is `due_at` (00002). Every insert here writes `due_at`.
2. **`RETRY_WAITS_MS` gets two waits, not three, and none under the lease.** `jobs-ledger.test.mjs` holds every kind's waits to `length <= MAX_ATTEMPTS - 1` (two) and `every wait > LEASE_SECONDS * 1000` (90 s). The interface's `[30_000, 120_000, 600_000]` fails both; the three kinds get `[120_000, 600_000]`.
3. **`lead_search_create` and `lead_search_more` take `p_estimate_usd`.** The interface says so itself under `lead_round_estimate_usd` ("the route computes; SQL stores"); the function is not created.
4. **`lead.no_card` has a writer in A1.** `event-kinds.test.mjs` fails a declared kind nothing emits. `lead_search_create` refuses an unapproved card with `{error: 'no_card'}` and logs the ask as demand (§0.3) in that event; release B's planner may call it for the same purpose.
5. **The three job kinds reach an injected seam.** `packages/jobs/src/handlers.ts` holds `HANDLERS: Record<JobKind, Handler>`, so a kind without a handler does not build. `JobContext` gains `leads?: { roundStart, collect, check }` (the shape `provisionLine` and `email` already have), and each handler fails by name in a runtime without it. A2 binds the pipeline.
6. **`leads.place_id` is nullable with a partial unique index.** Blanking (retention, erasure) clears the place id so the same place found again is a new lead instead of a member pointing at a blanked one.
7. **Two bookkeeping columns on `lead_rounds`:** `month` and `day`, the counter periods the round reserved in, so the release at its end reaches the same rows across a month or a day boundary; and `ending_pending`, which the interface names.
8. **`has_permission(p_user, p_tenant_id, p_permission)` is new.** Nothing on main has it (00014 has `is_acting_member` only). It restates `ROLE_PERMS` once in SQL; `lead-engine.db.test.mjs` holds the two together.
9. **`p_page.round` also takes `target` and `ending_pending`; `p_page.judgment` may be an array.** A page of 100 items carries up to four judge batches, and the probe that passed raises the round's target to the plan's count.
10. **`lead_collect_commit` skips a suppressed place itself** (a customer, or an erased place, number or address), so an erasure mid-run (G3) holds inside the transaction, not only in A2's identity step.
11. **Refusals carry a `sentence`** beside `error` (`month_leads_used`, `budget_used`, `day_cap`, `paused`, `no_card`), so "the 501st is refused in a sentence" is the door's, not the route's.
12. **The tenancy proof lists `lead_searches_view`.** PostgREST describes views, and the suite demands a proof for anything with a `tenant_id`; the view runs as its reader (`security_invoker`) and is not writable.
13. **The clock asks only when there is work.** `trigger_leads_sweep()` calls the edge only when a run is live or a round waits or checks, and records a look otherwise (the heartbeat's shape, 00098), so registering the schedule in A1 pages nobody before A2 deploys `/api/cron/leads`.
14. **`leads_page` takes one key.** The interface's `p_after_key` carries the sort key and the member id as `<k>|<id>`; there is no `p_after_id`.

**What this plan does not repeat** (the reviewer's findings on v2's sub-plan 1a): the 90-day consent window and a four-argument `set_contact_consent` (the consent doors are untouched: main's 00137 five-argument one stands, and they are release B's); unique email or phone indexes on `leads`; merging on a shared host or phone; a single model verdict; `delivered` set by Include or Put back; a second retry system; three bookkeeping styles for one count; a session GUC; a state column revived by a guard; a plan mutated in place (the one amendment is Include's, while the round waits, as version + 1); `exhausted` as a boolean; suppression hashing everything alike; `lead_bulk_restore` taking "previous" from the browser; a create door that could not insert its job.

**House rules this plan follows:**
- **Never add a `readCode(` or `readRaw(` assertion.** `source-scan-ratchet.test.mjs` counts them per file; a count may only fall. Every new test here runs code. Where an existing pin's *value* changes (the `JOB_KINDS` list in `store-retired.test.mjs`, `RETENTION_DAYS` in `retention-words.test.mjs`), the assertion is edited, not added; the one lint widened (`store-retired.test.mjs`, "each one scheduled somewhere") reads the migrations with `fs.readFileSync`, so no `readRaw(` is added.
- **Migrations:** take the next free number and **re-list `supabase/migrations` immediately before pushing**. Main ends at `00138_a_person_says_where_they_came_from.sql` (#677, 18 Sep); this plan writes `00139_the_lead_finder_engine.sql`. Every statement is re-runnable (`if not exists`, `create or replace`, `drop … if exists`, `on conflict`). **The agent runs the production `db push`** (Ruben, 18 Sep): once CI is green, from the PR's branch, a dry run that lists only 00139, then `db push --linked --yes` with the cached CLI 2.116.0, a read-back, then the merge (Task 6). If the auto-mode classifier refuses, never reroute: hand Ruben the PowerShell one-liners.
- **Widening a CHECK set** takes the migration, the contracts list and `schema-sets.generated.ts`, which is generated from the database (`corepack pnpm gen:schema-sets` with the local stack running). So Task 3's list edits and Task 4's migration land in ONE commit: contracts does not typecheck between them.
- **Package dists are committed.** After any change under `packages/`, `node tooling/scripts/check-dist.mjs` rebuilds all five; keep only dists with a real diff (`git diff -w --ignore-cr-at-eol`), commit them, and expect `dist in sync with src` only after the commit. tsup inlines workspace packages: this change touches all five dists.
- **Tests that import `packages/*/src/*.ts` directly** (`lead-search.test.mjs`, `lead-judge.test.mjs`, `jobs-ledger.test.mjs`) are never a stale dist. Tests that import `@chanlytics/contracts` or `packages/jobs/dist` (`retention-words`, `gate-reason`, `event-kinds`, `exports`, `lead-jobs`, the db suites) read the built copy: rebuild before believing a red.
- **`emitEvent` kinds are linted from literals** (`event-kinds.test.mjs`): every lead event here is emitted from SQL, where the lint reads the first dotted literal of each `insert into events`.
- **Fixtures copy the real shape** with fictional values: phones in `555-0100..0199`, every domain under `.example`, place ids `ChIJfixture…`. No key-shaped string anywhere (Gitleaks reads every commit).
- **No `\u` escapes in a file the Write tool writes:** a typed `\uXXXX` lands as the literal character. The control-character class in `lead-judge.ts` is `/\p{Cc}/gu`, and the test builds its control characters with `String.fromCharCode`.
- **Commits:** one sentence in the house voice, no prefix, ending with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every PR is green on `corepack pnpm -r typecheck`, `corepack pnpm lint` and `corepack pnpm test`; `next build` runs once, before merge.

**Commands.** Every command runs in Git Bash from the worktree root. The tool's working directory does not persist, so start each command with `cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-lead-a1" && `. The commands below leave that prefix out.
- One test file: `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`
- Whole suite: `corepack pnpm test` (in a shell without the `SUPABASE_*` variables; with them set, the database suites join the run)
- The Supabase CLI (2.116.0, the version CI pins; also the binary `check-db-types.mjs` and `gen-schema-sets.mjs` want): `SB="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"`. It is not a repo dependency. If it is missing, ask Ruben before `npx -y supabase@2.116.0 --version`, which downloads it again.
- The local database's env, in the same command as the test: `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; export SUPABASE_CLI="$SB";`
- The local stack needs Docker Desktop. If `docker version --format '{{.Server.Version}}'` errors, start it with PowerShell `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` and poll until it answers (up to about 4 minutes). The stack (`supabase_*_chanlytics-messaging`) is shared by every worktree on this machine, and `db reset` (Task 4) replays every migration from zero on it.
- A rolled-back dry run of the migration, before the reset: `( echo 'begin;'; cat supabase/migrations/00139_the_lead_finder_engine.sql; echo 'rollback;' ) | docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1`

---

## File structure

| File | Change | Its one responsibility |
|---|---|---|
| `packages/contracts/src/lead-search.ts` | create | the stored sets, the caps, the plan and its sentence, versions, the endings and their words, the cards' briefs, the estimate, `placesToAsk`, `classify`, the question, the cleaner, `usPhone`/`siteHost`/`stateCode`, `leadMonth` |
| `packages/contracts/src/lead-judge.ts` | create | `PlaceFacts`, `JudgePlaceAnswer`, the hand-written JSON schema, the rubric, the quoted content, the zod parser, `judgeOpId` (a pure sha256) |
| `packages/contracts/src/index.ts` | modify | exports both |
| `packages/contracts/src/enums.ts` | modify | `JOB_KINDS` + 3, `EVENT_KINDS` + 2 |
| `packages/contracts/src/config.ts`, `refusal.ts` | modify | `ROLE_PERMS.find` (owner only) and its words |
| `packages/contracts/src/retention.ts` | modify | the three lead numbers and their sentence |
| `packages/contracts/src/erasure.ts` | modify | `leadSuppressionHash` over the existing keyed digest |
| `packages/contracts/src/schema-sets.ts`, `schema-sets.generated.ts` | modify (the second generated) | every lead set held to the database's CHECK |
| `packages/jobs/src/ledger.ts` | modify | the three kinds' retry waits |
| `packages/jobs/src/handlers.ts` | modify | the `leads` seam on `JobContext` and three handlers that reach it |
| `packages/db/src/database.types.ts` | modify (generated) | the thirteen tables, the view and the functions |
| `packages/*/dist/**` | modify (built) | the committed builds; all five carry a real diff |
| `supabase/migrations/00139_the_lead_finder_engine.sql` | create | the tables, row security, the jobs kinds and index, the helpers, the guards, the service RPCs, the doors, the view and the page, realtime, the clock, retention |
| `tooling/scripts/tests/lead-search.test.mjs`, `lead-judge.test.mjs` | create | the pure rules, run |
| `tooling/scripts/tests/lead-jobs.test.mjs` | create | the three kinds reach the seam; a runtime without it fails by name |
| `tooling/scripts/tests/lead-engine.db.test.mjs` | create | the engine on a real Postgres with real sessions |
| `tooling/scripts/tests/tenancy.db.test.mjs`, `sweep-registry.db.test.mjs` | modify | the thirteen tables and the view in the tenancy proof; the two clocks in the register |
| `tooling/scripts/tests/retention-words.test.mjs`, `store-retired.test.mjs` | modify | two pins' values; the kinds lint reads SQL schedulers too |
| `tooling/scripts/delete-tenant.mjs` | modify | the eleven tables with a `tenant_id` in the backup list |
| `apps/dashboard/src/legacy/CLAUDE.md`, `apps/dashboard/src/legacy-bridge/surface-registry.ts`, `docs/system-prd.md` | modify | the lifted decision, recorded where the old one is (PRD v3 top: "before any Leads code lands") |
| `docs/plans/2026-09-19-lead-finder-A1-data.md` | create (copy) | this plan, committed with the work |

---

## Task 0: A worktree of its own

**Files:** none changed yet (the plan is copied in at Step 6).

- [ ] **Step 1: Create the worktree from origin/main**

```bash
git -C "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads" fetch origin
git -C "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads" worktree add "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-lead-a1" -b feat/lead-finder-a1 origin/main
```

Expected: `Preparing worktree (new branch 'feat/lead-finder-a1')` and `HEAD is now at <origin/main>`.

- [ ] **Step 2: Install, in the worktree**

Run: `corepack pnpm install --frozen-lockfile --prefer-offline`
Expected: `Done in …` (about two minutes; thirteen seconds when the store is warm). The worktree gets its own `node_modules`, so `@chanlytics/*` resolve to its own packages.

- [ ] **Step 3: The suites this plan touches are green before anything changes**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/jobs-ledger.test.mjs tooling/scripts/tests/retention-words.test.mjs tooling/scripts/tests/gate-reason.test.mjs tooling/scripts/tests/exports.test.mjs tooling/scripts/tests/store-retired.test.mjs tooling/scripts/tests/delete-tenant.test.mjs tooling/scripts/tests/event-kinds.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs tooling/scripts/tests/line-provision.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 4: Re-check the migration number**

Run: `ls supabase/migrations | tail -3 && git ls-tree -r --name-only origin/main -- supabase/migrations | tail -1 && gh pr list --repo expectmeout/chanlytics-os --state open --limit 100 --json number,files | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))for(const f of p.files)if(f.path.startsWith('supabase/migrations/'))console.log('#'+p.number,f.path)})"`
Expected: the folder and main both end at `00138_a_person_says_where_they_came_from.sql`, and no open PR claims `00139`. If 00139 is taken, use the next free number here and in every later mention (Task 6, Step 3 lists them).

- [ ] **Step 5: Check what main changed since this plan was written**

Run: `git diff --stat fbc5d871..origin/main -- packages/contracts/src/enums.ts packages/contracts/src/config.ts packages/contracts/src/refusal.ts packages/contracts/src/retention.ts packages/contracts/src/erasure.ts packages/contracts/src/index.ts packages/contracts/src/schema-sets.ts packages/jobs/src/ledger.ts packages/jobs/src/handlers.ts supabase/migrations tooling/scripts/delete-tenant.mjs tooling/scripts/tests/tenancy.db.test.mjs tooling/scripts/tests/sweep-registry.db.test.mjs tooling/scripts/tests/store-retired.test.mjs tooling/scripts/tests/retention-words.test.mjs apps/dashboard/src/legacy/CLAUDE.md apps/dashboard/src/legacy-bridge/surface-registry.ts docs/system-prd.md`
Expected: no output. If a file is listed, read what changed before its task and fit the `old` texts to it; every edit below is anchored on text, never a line number. If `supabase/migrations` is listed, take the next free number in Task 4.

- [ ] **Step 6: Commit this plan with the work**

```bash
cp "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads/docs/plans/2026-09-19-lead-finder-A1-data.md" docs/plans/2026-09-19-lead-finder-A1-data.md
git add docs/plans/2026-09-19-lead-finder-A1-data.md
git commit -m "The lead finder's plan: release A1, the data and the contracts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 1: `lead-search.ts`, the rules with a right answer

**Files:**
- Create: `tooling/scripts/tests/lead-search.test.mjs`
- Create: `packages/contracts/src/lead-search.ts`

The module imports two types from `./lead-judge` (Task 2), so `tsc` on contracts runs at the end of Task 2; `tsx` erases type imports, so the tests run now.

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/lead-search.test.mjs`. (Task 2 adds the judge module to the last test's walk; the file below is Task 1's.)

```js
/**
 * The lead finder's rules with a right answer, run (PRD v3 §0.1, §0.2, §0.5,
 * §7.2, §13.3; release A1). Pure: nothing here reads a file or a database.
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture....
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LeadSearchPlanSchema, planSentence, planVersionOf, estimateRoundUsd, placesToAsk, classify, questionAfterProbe,
  endingOfRound, cleanEmailCandidates, usPhone, siteHost, stateCode, leadMonth,
  LEAD_ROUND_ENDINGS, LEAD_ENDING_WORDS, LEAD_CARDS, LEAD_PROBE_PLACES, LEAD_MAX_PLACES, LEAD_MONTHLY_ALLOWANCE,
  LEAD_MONTHLY_BUDGET_USD, LEAD_DAY_CAP_USD, LEAD_PLATFORM_DAY_CAP_USD, LEAD_QUESTION_THRESHOLD, LEAD_JUDGE_BATCH,
  LEAD_ESTIMATE_MARGIN,
} from "../../../packages/contracts/src/lead-search.ts";
import * as searchWords from "../../../packages/contracts/src/lead-search.ts";

/** The plan every test starts from: 200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms. */
const plan = (over = {}) => LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer", "strength coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
  ...over,
});
const facts = (over = {}) => ({ ref: 1, name: "Zilker Strength", category: "Personal trainer", city: "Austin", state: "TX", host: "zilkerstrength.example", rating: 4.9, reviews: 41, emails: ["hello@zilkerstrength.example"], phone_matches_site: true, ...over });
const answer = (criteria, over = {}) => ({ ref: 1, criteria, email_index: 0, reason: "An independent trainer with a site.", ...over });

test("the decisions are the constants the PRD names, and the nine endings are one closed set with words", () => {
  assert.deepEqual([LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD, LEAD_DAY_CAP_USD, LEAD_PLATFORM_DAY_CAP_USD, LEAD_QUESTION_THRESHOLD, LEAD_PROBE_PLACES, LEAD_JUDGE_BATCH, LEAD_MAX_PLACES], [500, 25, 10, 50, 0.6, 25, 25, 1000]);
  assert.deepEqual([...LEAD_ROUND_ENDINGS], ["target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches", "stopped", "source_failed", "question_unanswered", "paused"]);
  assert.deepEqual(Object.keys(LEAD_ENDING_WORDS).sort(), [...LEAD_ROUND_ENDINGS].sort(), "every ending has its words, and nothing else does");
  assert.equal(LEAD_ENDING_WORDS.stopped, "Stopped by you");
});

test("the plan schema keeps its keys unique and its shape whole; the sentence says the count, the kind, the area, each criterion and its standard, the contact standard and what is left out", () => {
  const p = plan();
  assert.equal(planSentence(p), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms.");
  const seen = plan({ contact: "phone", criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }], exclusions: [] });
  assert.equal(planSentence(seen), "Find 200 personal trainers in Austin, TX already sell OTC medicine (confirmed), a phone is enough.");
  assert.throws(() => plan({ exclusions: [{ key: "website", text: "Chain gyms", origin: "claude" }] }), /key of its own/);
  assert.throws(() => plan({ count: 1001 }));
  assert.throws(() => plan({ area: { ...p.area, state: "Texas" } }));
});

test("a change to the area, count, contact standard, criteria or exclusions makes a new version; a rename does not", () => {
  const p = plan();
  assert.equal(planVersionOf(p, { name: "trainers" }).version, 1);
  assert.equal(planVersionOf(p, { terms: ["trainer"] }).version, 1, "the terms are the source's words, not the promise");
  assert.equal(planVersionOf(p, { count: 50 }).version, 2);
  assert.equal(planVersionOf(p, { contact: "phone" }).version, 2);
  assert.equal(planVersionOf(p, { exclusions: [] }).version, 2, "Include removes a chip: a new version");
  assert.equal(planVersionOf(p, { criteria: [...p.criteria] }).version, 1, "the same criteria, restated, is no change");
  assert.equal(planVersionOf(planVersionOf(p, { count: 50 }), { count: 60 }).version, 3);
});

test("the estimate comes from the card's prices with room: discovery, contacts, the judge, the check under an email standard, a start per term", () => {
  const c = LEAD_CARDS[0];
  const perPlace = c.costPerPlaceUsd + c.contactsPerPlaceUsd + c.judgePerPlaceUsd + c.checkPerEmailUsd;
  assert.equal(estimateRoundUsd(plan(), "probe", 25), Math.round((25 * perPlace + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000);
  assert.equal(estimateRoundUsd(plan({ contact: "phone" }), "main", 260), Math.round((260 * (perPlace - c.checkPerEmailUsd) + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000, "a phone standard checks no mailbox");
  assert.ok(estimateRoundUsd(plan(), "probe", 25) < 0.5, "the probe costs cents; the $0.50 floor is the run cap's, not the estimate's");
});

test("placesToAsk spreads the probe's 25 across every term, and a later round asks for the remainder over the yield, clamped 1.2x..4x and inside what a term can return", () => {
  assert.deepEqual(placesToAsk(plan(), 200, null), { total: 25, perTerm: [13, 12] });
  assert.deepEqual(placesToAsk(plan({ terms: ["trainer", "coach", "gym"] }), 200, null), { total: 25, perTerm: [9, 8, 8] });
  assert.deepEqual(placesToAsk(plan(), 100, 0.5), { total: 200, perTerm: [100, 100] }, "100 over a 50% yield is 200");
  assert.deepEqual(placesToAsk(plan(), 100, 0.95), { total: 120, perTerm: [60, 60] }, "never under 1.2x the remainder");
  assert.deepEqual(placesToAsk(plan(), 50, 0.1), { total: 200, perTerm: [100, 100] }, "never over 4x the remainder");
  assert.deepEqual(placesToAsk(plan(), 50, 0), { total: 200, perTerm: [100, 100] }, "no yield yet is the 4x clamp, not infinity");
  assert.deepEqual(placesToAsk(plan(), 400, 0.5), { total: 240, perTerm: [120, 120] }, "one search on the source tops out near 120");
  assert.ok(placesToAsk(plan({ terms: ["trainer", "coach", "gym", "studio", "fitness"] }), 400, 0.3).total <= LEAD_MAX_PLACES);
});

test("classify: everything passing under the standard qualifies; a required fail excludes with that key; unknown, a seen criterion with no fact cited, out of area, or the email standard not met is review", () => {
  const p = plan();
  const ok = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name", "reviews"] }]), facts(), "ok", true);
  assert.deepEqual(ok, { class: "qualified", excluded_by: null, fit: "strong", reasons: [] });
  const chain = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "fail", facts: ["name"] }]), facts(), "ok", true);
  assert.deepEqual(chain, { class: "excluded", excluded_by: "chain", fit: null, reasons: ["fail:chain"] });
  const unsure = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "unknown", facts: [] }]), facts(), "ok", true);
  assert.deepEqual([unsure.class, unsure.fit, unsure.reasons], ["review", "look", ["unknown:chain"]]);
  const seen = plan({ criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }], exclusions: [] });
  const inferred = classify(seen, answer([{ key: "otc", answer: "pass", facts: [] }]), facts(), "ok", true);
  assert.deepEqual([inferred.class, inferred.reasons], ["review", ["inferred:otc"]], "a seen criterion answered by inference goes to review");
  const cited = classify(seen, answer([{ key: "otc", answer: "pass", facts: ["category"] }]), facts(), "ok", true);
  assert.equal(cited.class, "qualified");
  const away = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "ok", false);
  assert.deepEqual([away.class, away.reasons], ["review", ["out_of_area"]]);
  for (const state of ["catch_all", "unknown", "none", "invalid", "checking"]) {
    const r = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), state, true);
    assert.deepEqual([r.class, r.reasons], ["review", [`email:${state}`]], state);
  }
  const phone = plan({ contact: "phone" });
  assert.equal(classify(phone, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "none", true).class, "qualified", "a phone is enough");
  assert.deepEqual(classify(phone, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts({ phone_matches_site: null }), "none", true).reasons, ["phone:none"]);
  const soft = plan({ criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }] });
  const long = classify(soft, answer([{ key: "website", answer: "fail", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "ok", true);
  assert.deepEqual([long.class, long.fit], ["qualified", "long"], "a preferred criterion that fails is a long shot, never an exclusion");
  const missing = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }]), facts(), "ok", true);
  assert.deepEqual([missing.class, missing.reasons], ["review", ["unknown:chain"]], "a criterion the judge did not answer is unknown");
  assert.equal(classify(p, answer([{ key: "website", answer: "fail", facts: [] }, { key: "chain", answer: "fail", facts: [] }]), facts(), "ok", true).excluded_by, "website", "the first required fail names the reason");
});

test("the question fires under 60% of the first 25 and names the most common exclusion; it drops a term that returned mostly the wrong kind; it never fires on too few, on enough, or when nothing was left out", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(12).fill(m("qualified")), ...Array(9).fill(m("excluded", "chain", "strength coach")), ...Array(2).fill(m("excluded", "website")), ...Array(2).fill(m("review"))];
  const q = questionAfterProbe(p, members);
  assert.equal(q.ask, true);
  assert.equal(q.criterionKey, "chain");
  assert.equal(q.dropTerm, "strength coach");
  assert.equal(q.sentence, `Some of the first 25 are chain gyms and other kinds of places, which I'm leaving out. Is that what you meant? I'm dropping "strength coach": it mostly returned those.`);
  const half = questionAfterProbe(p, [...Array(12).fill(m("qualified")), ...Array(13).fill(m("excluded", "chain"))]);
  assert.equal(half.sentence, "Half of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?");
  assert.equal(half.dropTerm, null, "one term of two returned everything: nothing to drop");
  assert.match(questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "chain"))]).sentence, /^Most of the first 25/);
  assert.deepEqual(questionAfterProbe(p, [...Array(15).fill(m("qualified")), ...Array(10).fill(m("excluded", "chain"))]), { ask: false }, "60% is enough");
  assert.deepEqual(questionAfterProbe(p, [m("qualified"), ...Array(7).fill(m("excluded", "chain"))]), { ask: false }, "eight places are too few to ask about");
  assert.deepEqual(questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("review"))]), { ask: false }, "review is not an exclusion: the question is an intent check, not an accuracy measure");
  assert.equal(questionAfterProbe(plan({ terms: ["personal trainer"] }), members).dropTerm, null, "the only term is never dropped");
});

test("the ending of a round follows S7: what was done to it first, then the target, the allowance, the budget, then whether every term ran short", () => {
  const base = { counted: 10, target: 200, termsShort: [false, false], budgetLeftUsd: 5, allowanceLeft: 100, stopped: false, sourceFailed: false, unanswered: false, paused: false };
  assert.equal(endingOfRound({ ...base, paused: true, stopped: true }), "paused");
  assert.equal(endingOfRound({ ...base, stopped: true, sourceFailed: true }), "stopped");
  assert.equal(endingOfRound({ ...base, sourceFailed: true, counted: 200 }), "source_failed");
  assert.equal(endingOfRound({ ...base, unanswered: true }), "question_unanswered");
  assert.equal(endingOfRound({ ...base, counted: 200 }), "target_reached");
  assert.equal(endingOfRound({ ...base, allowanceLeft: 0 }), "month_leads_used");
  assert.equal(endingOfRound({ ...base, budgetLeftUsd: 0 }), "budget_used");
  assert.equal(endingOfRound({ ...base, termsShort: [true, true] }), "searched_everything", "only when every term returned fewer than asked");
  assert.equal(endingOfRound({ ...base, termsShort: [true, false] }), "few_new_matches", "otherwise the round ended at its limit");
  assert.equal(endingOfRound({ ...base, termsShort: [] }), "few_new_matches");
});

test("the cleaner keeps a business's own addresses first, says why each other was dropped, gives none of a partner list's, and five of a staff list", () => {
  const SITE = "zilkerstrength.example";
  const raw = [
    "support@vagaro.com", "filler@godaddy.com", "yourdomain@mail.com", "careers@zilkerstrength.example", "press@zilkerstrength.example", "x@2x.png",
    "Hello@ZilkerStrength.example", "hello@zilkerstrength.example", "newcase@www.zilkerstrength.example", "coach.sam@gmail.com", "not an address",
  ];
  const r = cleanEmailCandidates(raw, SITE);
  assert.deepEqual(r.kept, ["hello@zilkerstrength.example", "newcase@zilkerstrength.example", "coach.sam@gmail.com"]);
  assert.deepEqual(r.dropped.map((d) => d.why), ["junk_domain", "junk_domain", "placeholder", "role", "role", "image", "duplicate", "malformed"]);
  const cruise = Array.from({ length: 8 }, (_, i) => `claims@cruiseline${i}.example`);
  const list = cleanEmailCandidates(cruise, "maritimelaw.example");
  assert.deepEqual(list.kept, [], "eight foreign domains is a list, not the firm");
  assert.ok(list.dropped.every((d) => d.why === "foreign_list"));
  const staff = Array.from({ length: 23 }, (_, i) => `staff${i}@bigfirm.example`).concat(["intake@bigfirm.example"]);
  const kept = cleanEmailCandidates(staff, "bigfirm.example");
  assert.equal(kept.kept.length, 5);
  assert.equal(kept.kept[0], "intake@bigfirm.example", "a front-desk address ranks first");
  assert.equal(kept.dropped.filter((d) => d.why === "over_limit").length, 19);
});

test("phones, hosts and states are read by rules: placeholders and foreign numbers dropped, platforms are no site of their own, a state is its two letters", () => {
  for (const bad of ["1234567890", "123456789", "+6221123456789", "+118322305794", "5555555555", "0123456789"]) assert.equal(usPhone(bad), null, bad);
  assert.equal(usPhone("(512) 555-0100"), "+15125550100");
  assert.equal(usPhone("+1 512 555 0142"), "+15125550142");
  assert.equal(siteHost("https://www.vagaro.com/zilkerstrength"), null);
  assert.equal(siteHost("instagram.com/zilkerstrength"), null);
  assert.equal(siteHost("www.ZilkerStrength.example/contact"), "zilkerstrength.example");
  assert.equal(siteHost("not a url"), null);
  assert.equal(stateCode("Texas"), "TX");
  assert.equal(stateCode("tx"), "TX");
  assert.equal(stateCode("District of Columbia"), "DC");
  assert.equal(stateCode("Ontario"), null);
});

test("the month a lead counts in is the workspace's calendar month, in its zone", () => {
  assert.equal(leadMonth("America/Chicago", new Date("2026-10-01T03:30:00Z")), "2026-09", "still 30 September in Chicago");
  assert.equal(leadMonth("America/Chicago", new Date("2026-10-01T05:30:00Z")), "2026-10");
  assert.equal(leadMonth("UTC", new Date("2026-12-31T23:59:59Z")), "2026-12");
});

test("no word the product says names the vendor that runs the searches, in either module", () => {
  const strings = [];
  const seen = new WeakSet(); // zod schemas point back at themselves
  const walk = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (typeof v === "function") return;
    else if (v && typeof v === "object" && !seen.has(v)) { seen.add(v); Object.values(v).forEach(walk); }
  };
  walk({ ...searchWords });
  assert.ok(strings.length > 50, "the walk saw the words");
  assert.deepEqual(strings.filter((s) => /apify|compass|bounceverify|crawler/i.test(s)), []);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs`
Expected: `# fail 1` at the file level: `Cannot find module '…/packages/contracts/src/lead-search.ts'`.

- [ ] **Step 3: Write the module**

Create `packages/contracts/src/lead-search.ts`:

```ts
/**
 * The lead finder: the plan, the sets, the caps, and every rule with a right
 * answer (PRD 2026-09-17 v3 §0, §7.2, §10, §12, §13.3; release A1).
 *
 * Pure. The dashboard's routes, the edge's jobs and, later, the page read this
 * file. The model proposes a plan in these shapes and judges places criterion
 * by criterion (lead-judge.ts); everything decidable is decided here, by code:
 * what a junk address is, which class a place gets from the judge's answers
 * (§0.1), how many places a round asks for (S6), when the search stops to ask
 * (P4), which of the nine endings a round gets (S7), what a round is likely
 * to cost. No word here names the vendor that runs the searches: the owner
 * sees Claude finding businesses, and where each fact came from.
 */
import { z } from "zod";
import { normalizeEmail } from "./email-address";
import { normalizePhone } from "./phone";
import { dayInZone } from "./availability";
import type { JudgePlaceAnswer, PlaceFacts } from "./lead-judge";

/* ------------------------------------------------------ the stored sets -- */
// Each mirrors a CHECK in 00139 and is held to it in schema-sets.ts.

export const LEAD_SEARCH_VIAS = ["people", "ask"] as const;
export type LeadSearchVia = (typeof LEAD_SEARCH_VIAS)[number];
export const LEAD_ROUND_PURPOSES = ["probe", "main", "topup", "renew"] as const;
export type LeadRoundPurpose = (typeof LEAD_ROUND_PURPOSES)[number];
export const LEAD_ROUND_STATES = ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"] as const;
export type LeadRoundState = (typeof LEAD_ROUND_STATES)[number];
/** The nine endings, one closed set (§0.5, S7). */
export const LEAD_ROUND_ENDINGS = [
  "target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches",
  "stopped", "source_failed", "question_unanswered", "paused",
] as const;
export type LeadRoundEnding = (typeof LEAD_ROUND_ENDINGS)[number];
export const LEAD_ROUND_ANSWERS = ["keep", "include", "stop"] as const;
export type LeadRoundAnswer = (typeof LEAD_ROUND_ANSWERS)[number];
export const LEAD_RUN_PURPOSES = ["discover", "check"] as const;
export const LEAD_RUN_STATES = ["claimed", "starting", "running", "succeeded", "failed", "aborted", "timed_out", "unknown"] as const;
export type LeadRunState = (typeof LEAD_RUN_STATES)[number];
/** The five words of §10.4, plus `checking` while a batch is out. */
export const LEAD_EMAIL_STATES = ["none", "checking", "ok", "catch_all", "unknown", "invalid"] as const;
export type LeadEmailState = (typeof LEAD_EMAIL_STATES)[number];
export const LEAD_STAGES = ["ready", "nurture", "converted", "archived"] as const;
export const LEAD_CLOSED_REASONS = ["said_no", "not_a_fit", "customer", "stale", "search_removed"] as const;
export const LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"] as const;
export type LeadMemberClass = (typeof LEAD_MEMBER_CLASSES)[number];
export const LEAD_FITS = ["strong", "look", "long"] as const;
export type LeadFit = (typeof LEAD_FITS)[number];
export const LEAD_COUNTER_KINDS = ["allowance", "budget", "day"] as const;
export const LEAD_OPERATION_KINDS = ["undo_search", "keep", "exclude", "put_back", "include", "stop"] as const;
export const LEAD_PREFERENCE_KINDS = ["chain", "wrong_kind", "too_far"] as const;
export const LEAD_SUPPRESSION_KINDS = ["email", "place", "phone"] as const;
export const LEAD_SUPPRESSION_WHATS = ["email_opt_out", "customer", "erased"] as const;

/* -------------------------------------------------- the caps (§13.3, §16) -- */

/** §16.7, 18: Qualified leads a month, by the workspace's calendar month. */
export const LEAD_MONTHLY_ALLOWANCE = 500;
/** §16.32: what searching may cost a workspace a month: scraping, judging, checks, retries. */
export const LEAD_MONTHLY_BUDGET_USD = 25;
export const LEAD_DAY_CAP_USD = 10;
export const LEAD_PLATFORM_DAY_CAP_USD = 50;
/** §16.5: under this share of Qualified among the first places, the round stops and asks. */
export const LEAD_QUESTION_THRESHOLD = 0.6;
/** Below this many judged places the question is not asked: too little to go on. */
export const LEAD_QUESTION_MIN_EVIDENCE = 10;
export const LEAD_PROBE_PLACES = 25;
export const LEAD_JUDGE_BATCH = 25;
export const LEAD_MAX_PLACES = 1000;
/** Every fact a place gives the judge is cut to this many characters (§7.1). */
export const LEAD_FACT_MAX = 120;
/** The judge's one reason, in words (§0.1). */
export const LEAD_REASON_MAX_WORDS = 12;
/** A round's estimate is reserved with this much room (§13.3: the cap is the estimate with room). */
export const LEAD_ESTIMATE_MARGIN = 1.3;
/** The main round asks for the remainder over the probe's yield, clamped here (S6). */
export const LEAD_ASK_MIN_FACTOR = 1.2;
export const LEAD_ASK_MAX_FACTOR = 4;
/** An unanswered question ends the round after this long (§0.5). */
export const LEAD_QUESTION_WAIT_MS = 24 * 3_600_000;

/* ------------------------------------------------------------ the plan -- */

export type LeadContactStandard = "phone" | "email";
/** likely: Claude's read is enough. seen: a fact the card can show, cited by key (§0.1, 26). */
export type LeadCriterionStandard = "likely" | "seen";
export interface LeadCriterion { key: string; text: string; standard: LeadCriterionStandard; required: boolean; }
/** A "Leaving out" chip. The judge answers it as a required criterion: `fail` means the place is what is left out. */
export interface LeadExclusion { key: string; text: string; origin: "claude" | "you_said"; category_key?: string; }
export interface LeadArea {
  kind: "zip" | "city" | "radius";
  /** As the sentence says it: "Austin, TX". */
  label: string;
  /** Two letters. */
  state: string;
  /** Null for a city ask until the probe's coordinates give one (§12.5, 31). */
  center: { lat: number; lng: number } | null;
  radius_m: number;
  zip?: string;
  /** The card's own location query, built from the validated plan. */
  query: string;
}
export interface LeadSearchPlan {
  version: number;
  card: "local_businesses";
  /** Who is sought, plural, as the sentence says it: "personal trainers". */
  name: string;
  /** The owner's words, at most 400 characters. */
  asked: string;
  terms: string[];
  area: LeadArea;
  count: number;
  contact: LeadContactStandard;
  criteria: LeadCriterion[];
  exclusions: LeadExclusion[];
}

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const words = (min: number, max: number) => z.string().trim().min(min).max(max);

/** The route's input and the door's: the same shape, checked twice on purpose. */
export const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan> = z.object({
  version: z.number().int().min(1),
  card: z.literal("local_businesses"),
  name: words(2, 80),
  asked: words(1, 400),
  terms: z.array(words(2, 60)).min(1).max(5),
  area: z.object({
    kind: z.enum(["zip", "city", "radius"]),
    label: words(2, 80),
    state: z.string().regex(/^[A-Z]{2}$/),
    center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
    radius_m: z.number().int().min(500).max(200_000),
    zip: z.string().regex(/^\d{5}$/).optional(),
    query: words(2, 120),
  }),
  count: z.number().int().min(1).max(LEAD_MAX_PLACES),
  contact: z.enum(["phone", "email"]),
  criteria: z.array(z.object({ key: z.string().regex(KEY), text: words(2, 120), standard: z.enum(["likely", "seen"]), required: z.boolean() })).max(8),
  exclusions: z.array(z.object({ key: z.string().regex(KEY), text: words(2, 80), origin: z.enum(["claude", "you_said"]), category_key: z.string().regex(KEY).optional() })).max(8),
}).superRefine((p, ctx) => {
  const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "every criterion and exclusion has a key of its own", path: ["criteria"] });
});

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The plan as one sentence, whose words are the controls (§7 step 2, §8.3).
 * "Find 200 personal trainers in Austin, TX with a website, then find their
 * email and check it. Leaving out: chain gyms." A seen criterion says so.
 */
export function planSentence(plan: LeadSearchPlan): string {
  const have = plan.criteria.map((c) => (c.standard === "seen" ? `${lowerFirst(c.text)} (confirmed)` : lowerFirst(c.text)));
  const contact = plan.contact === "email" ? "then find their email and check it" : "a phone is enough";
  const head = `Find ${plan.count} ${plan.name} in ${plan.area.label}${have.length ? ` ${list(have)}` : ""}, ${contact}.`;
  const out = plan.exclusions.map((e) => lowerFirst(e.text));
  return out.length ? `${head} Leaving out: ${list(out)}.` : head;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The changed plan, with its version bumped when the area, count, contact standard, criteria or exclusions moved (S15). */
export function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan {
  const next: LeadSearchPlan = { ...plan, ...changed, version: plan.version };
  const material = (["area", "count", "contact", "criteria", "exclusions"] as const).some((k) => !same(plan[k], next[k]));
  return { ...next, version: material ? plan.version + 1 : plan.version };
}

/* -------------------------------------------------------- the endings -- */

export const LEAD_ENDING_WORDS: Record<LeadRoundEnding, string> = {
  target_reached: "Found what you asked for",
  searched_everything: "Searched everything this plan covers",
  month_leads_used: "This month's leads are used",
  budget_used: "This month's searching budget is used",
  few_new_matches: "Few new matches",
  stopped: "Stopped by you",
  source_failed: "The source failed",
  question_unanswered: "Question unanswered",
  paused: "Paused for everyone",
};

/**
 * Which of the nine endings a round gets, in the order the facts outrank each
 * other (S7). "Searched everything" only when every term returned fewer places
 * than it was asked for; otherwise the round ended at its limit with few new
 * matches, and the next step is another round in the same area.
 */
export function endingOfRound(x: {
  counted: number; target: number; termsShort: boolean[]; budgetLeftUsd: number; allowanceLeft: number;
  stopped: boolean; sourceFailed: boolean; unanswered: boolean; paused: boolean;
}): LeadRoundEnding {
  if (x.paused) return "paused";
  if (x.stopped) return "stopped";
  if (x.sourceFailed) return "source_failed";
  if (x.unanswered) return "question_unanswered";
  if (x.counted >= x.target) return "target_reached";
  if (x.allowanceLeft <= 0) return "month_leads_used";
  if (x.budgetLeftUsd <= 0) return "budget_used";
  if (x.termsShort.length > 0 && x.termsShort.every(Boolean)) return "searched_everything";
  return "few_new_matches";
}

/* ---------------------------------------------------------- the cards -- */

/** The half of a card Claude reads (§0.3, 23). The half code holds is A2's `CARDS`. */
export interface LeadCardBrief {
  id: "local_businesses";
  goodFor: string[];
  notFor: string[];
  settings: string[];
  /** Bronze prices, 18 Sep 2026 (§10.1). */
  costPerPlaceUsd: number;
  contactsPerPlaceUsd: number;
  judgePerPlaceUsd: number;
  checkPerEmailUsd: number;
  startUsd: number;
  /** One search on the source tops out near this many places (§7 step 3). */
  maxPerTerm: number;
  examples: string[];
  approved: true;
}

export const LEAD_CARDS: readonly LeadCardBrief[] = [
  {
    id: "local_businesses",
    goodFor: [
      "local businesses of a kind, in a city, a ZIP or around a point: the businesses that buy from you, or that your clients need next",
      "their listing facts: name, category, address, phone, website, rating and review count, open or closed",
      "emails and social profiles from the business's own website",
      "a mailbox check on the email found",
    ],
    notFor: [
      "people at home, or anyone who is not a business",
      "online sellers and shops with no local listing",
      "what a business stocks or sells inside (a listing does not show inventory: a seen standard on it cannot be met)",
      "businesses outside the US",
    ],
    settings: ["terms (up to five search phrases, widest first)", "area (a city, a ZIP, or a center and radius)", "count (1 to 1000)", "contact standard (phone, or email checked)"],
    costPerPlaceUsd: 0.003,
    contactsPerPlaceUsd: 0.002,
    judgePerPlaceUsd: 0.0023,
    checkPerEmailUsd: 0.00089,
    startUsd: 0.00005,
    maxPerTerm: 120,
    examples: [
      "200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms",
      "50 independent pharmacies in ZIP 78704 that could stock an OTC product, a phone is enough",
      "100 family law firms within 15 km of downtown Denver, email checked, leaving out referral networks",
    ],
    approved: true,
  },
];

const cardOf = (plan: LeadSearchPlan): LeadCardBrief => {
  const c = LEAD_CARDS.find((x) => x.id === plan.card);
  if (!c) throw new Error(`no card ${plan.card}`);
  return c;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * What a round is likely to cost, from the card's prices, with room (§13.3):
 * discovery and contacts per place asked, the judge per place, the mailbox
 * check per place under an email standard, and one start per term. The route
 * computes it, the door stores it, the counters reserve it.
 */
export function estimateRoundUsd(plan: LeadSearchPlan, purpose: LeadRoundPurpose, placesToAsk: number): number {
  const c = cardOf(plan);
  const places = Math.max(0, Math.floor(placesToAsk));
  const perPlace = c.costPerPlaceUsd + c.contactsPerPlaceUsd + c.judgePerPlaceUsd + (plan.contact === "email" ? c.checkPerEmailUsd : 0);
  const starts = plan.terms.length * (purpose === "probe" ? 1 : 1);
  return round4((places * perPlace + starts * c.startUsd) * LEAD_ESTIMATE_MARGIN);
}

/** `total` spread over `n` terms, the remainder on the first ones. */
function spread(total: number, n: number, cap: number): number[] {
  const each = Math.min(cap, Math.floor(total / n));
  const rest = Math.min(total - each * n, n);
  return Array.from({ length: n }, (_, i) => Math.min(cap, each + (i < rest ? 1 : 0)));
}

/**
 * How many places to ask the source for (S6). The probe asks for 25 spread
 * across every term (E10). A later round asks for the remainder over the
 * yield so far (new Qualified places per place asked), clamped between 1.2x
 * and 4x the remainder, never past LEAD_MAX_PLACES or what one term can
 * return. `yieldSoFar` null means the probe.
 */
export function placesToAsk(plan: LeadSearchPlan, remaining: number, yieldSoFar: number | null): { total: number; perTerm: number[] } {
  const n = Math.max(1, plan.terms.length);
  const cap = cardOf(plan).maxPerTerm;
  if (yieldSoFar === null) {
    const perTerm = spread(LEAD_PROBE_PLACES, n, cap);
    return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
  }
  const left = Math.max(1, Math.ceil(remaining));
  const wanted = yieldSoFar > 0 ? left / yieldSoFar : Number.POSITIVE_INFINITY;
  const clamped = Math.min(Math.max(wanted, left * LEAD_ASK_MIN_FACTOR), left * LEAD_ASK_MAX_FACTOR);
  const total = Math.min(LEAD_MAX_PLACES, cap * n, Math.ceil(clamped));
  const perTerm = spread(total, n, cap);
  return { total: perTerm.reduce((a, b) => a + b, 0), perTerm };
}

/* ------------------------------------------------- the class (§0.1, 26) -- */

export interface LeadClassification {
  class: LeadMemberClass;
  /** The criterion or exclusion whose required fail excluded the place; null otherwise. */
  excluded_by: string | null;
  /** For ordering only, never for counting. Null when excluded. */
  fit: LeadFit | null;
  /** Why it is not simply Qualified: `fail:<key>`, `unknown:<key>`, `inferred:<key>`, `out_of_area`, `email:<state>`, `phone:none`. */
  reasons: string[];
}

/** The reason tokens of a contact standard not met, so SQL and the check can find "the email was the only reason". */
export const LEAD_EMAIL_REASON = /^email:/;

/**
 * Code decides the class from the judge's per-criterion answers (§0.1). A
 * required criterion (or an exclusion: every exclusion is required) that fails
 * excludes, with that key as the reason. Any `unknown`, a seen criterion
 * answered with no fact cited (only inference), a place with no location or
 * one outside the area, or a contact standard not met sends the place to
 * review. Everything else qualifies. A fit band is derived for ordering.
 */
export function classify(plan: LeadSearchPlan, answer: JudgePlaceAnswer, facts: PlaceFacts, emailState: LeadEmailState, inArea: boolean): LeadClassification {
  const reasons: string[] = [];
  const rubric = [
    ...plan.criteria.map((c) => ({ key: c.key, standard: c.standard, required: c.required })),
    ...plan.exclusions.map((e) => ({ key: e.key, standard: "likely" as const, required: true })),
  ];
  let excludedBy: string | null = null;
  let softFail = false;
  let unknown = false;
  for (const r of rubric) {
    const a = answer.criteria.find((x) => x.key === r.key);
    const verdict = a?.answer ?? "unknown";
    if (verdict === "fail") {
      if (r.required) { excludedBy = excludedBy ?? r.key; reasons.push(`fail:${r.key}`); } else { softFail = true; }
    } else if (verdict === "unknown") {
      unknown = true; reasons.push(`unknown:${r.key}`);
    } else if (r.standard === "seen" && (a?.facts.length ?? 0) === 0) {
      unknown = true; reasons.push(`inferred:${r.key}`);
    }
  }
  if (excludedBy) return { class: "excluded", excluded_by: excludedBy, fit: null, reasons };
  if (!inArea) reasons.push("out_of_area");
  if (plan.contact === "email" && emailState !== "ok") reasons.push(`email:${emailState}`);
  if (plan.contact === "phone" && facts.phone_matches_site === null) reasons.push("phone:none");
  const fit: LeadFit = softFail ? "long" : unknown ? "look" : "strong";
  return { class: reasons.length ? "review" : "qualified", excluded_by: null, fit, reasons };
}

/* --------------------------------------------- the question after 25 (P4) -- */

export interface ProbeMember { class: LeadMemberClass; excluded_by: string | null; term?: string | null; }
export type LeadQuestion =
  | { ask: true; sentence: string; criterionKey: string; dropTerm: string | null }
  | { ask: false };

/**
 * An intent check, never an accuracy measure (P4). Over the probe's places,
 * when fewer than 60% qualified and something was left out, the round waits
 * and asks whether the search matches what the owner meant, from the most
 * common exclusion. A term that returned mostly the wrong kind is dropped
 * first, and the sentence says so. It never asks the owner to relax a fact.
 */
export function questionAfterProbe(plan: LeadSearchPlan, members: ProbeMember[]): LeadQuestion {
  const n = members.length;
  if (n < LEAD_QUESTION_MIN_EVIDENCE) return { ask: false };
  const qualified = members.filter((m) => m.class === "qualified").length;
  if (qualified / n >= LEAD_QUESTION_THRESHOLD) return { ask: false };
  const tally = new Map<string, number>();
  for (const m of members) if (m.class === "excluded" && m.excluded_by) tally.set(m.excluded_by, (tally.get(m.excluded_by) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return { ask: false };
  const textOf = (key: string) => lowerFirst(plan.exclusions.find((e) => e.key === key)?.text ?? plan.criteria.find((c) => c.key === key)?.text ?? key);
  const excluded = members.filter((m) => m.class === "excluded").length;
  const share = excluded / n;
  const lead = share >= 2 / 3 ? "Most" : share >= 0.5 ? "Half" : "Some";
  const what = tally.size > 1 ? `${textOf(top[0])} and other kinds of places` : textOf(top[0]);
  let dropTerm: string | null = null;
  if (plan.terms.length > 1) {
    for (const term of plan.terms) {
      const of = members.filter((m) => m.term === term);
      if (of.length >= 5 && of.filter((m) => m.class === "excluded").length / of.length >= 2 / 3) { dropTerm = term; break; }
    }
  }
  const drop = dropTerm ? ` I'm dropping "${dropTerm}": it mostly returned those.` : "";
  return { ask: true, sentence: `${lead} of the first ${n} are ${what}, which I'm leaving out. Is that what you meant?${drop}`, criterionKey: top[0], dropTerm };
}

/* ---------------------------------------------------- the cleaner (§7.2) -- */

/** Hosts that are a booking platform or a social page: a business there has no site of its own. */
export const LEAD_PLATFORM_HOSTS = [
  "vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddysites.com", "wixsite.com", "business.site",
  "facebook.com", "instagram.com", "linktr.ee", "yelp.com", "booksy.com", "fresha.com", "styleseat.com",
  "schedulicity.com", "mindbodyonline.com", "setmore.com", "acuityscheduling.com", "google.com",
] as const;
/** Address domains that are never the business: platforms, builders' placeholders, trackers. */
export const LEAD_JUNK_EMAIL_DOMAINS = [
  "vagaro.com", "square.site", "squareup.com", "glossgenius.com", "godaddy.com", "wix.com", "wixpress.com",
  "sentry.io", "example.com", "domain.com", "yourdomain.com", "email.com",
] as const;
/** Local parts that are a template's placeholder, not a mailbox. */
export const LEAD_PLACEHOLDER_LOCALS = [
  "filler", "yourdomain", "youremail", "your", "example", "email", "name", "user", "username", "test", "noreply", "no-reply", "donotreply",
] as const;
/** Corporate roles that are not how a business takes a customer (§7.2). */
export const LEAD_ROLE_LOCALS = ["careers", "career", "jobs", "recruiting", "recruitment", "hr", "media", "press", "pr", "privacy", "legal", "webmaster", "abuse", "postmaster"] as const;
export const LEAD_FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "msn.com", "me.com", "protonmail.com", "proton.me"] as const;
/** A front desk's addresses, first among a business's own. */
const DESK_LOCALS = ["intake", "info", "hello", "contact", "office", "team", "book", "booking", "bookings", "appointments", "studio", "frontdesk", "admin"];

const has = (xs: readonly string[], v: string) => xs.includes(v);

export interface CleanedEmails {
  /** Best first: the business's own (five at most, a front desk first), free-mail (three), another company's (two). */
  kept: string[];
  dropped: { email: string; why: "malformed" | "duplicate" | "junk_domain" | "placeholder" | "role" | "image" | "foreign_list" | "over_limit" }[];
}

/**
 * The addresses worth showing the judge, and why each of the others was
 * dropped (§7.2). When the page names more than three other companies'
 * domains, that is a list of partners or brands, not the business, and none
 * of theirs is kept.
 */
export function cleanEmailCandidates(emails: string[], host: string | null): CleanedEmails {
  const seen = new Set<string>();
  const own: string[] = [];
  const free: string[] = [];
  const foreign: string[] = [];
  const dropped: CleanedEmails["dropped"] = [];
  for (const raw of emails) {
    const fixed = String(raw ?? "").trim().replace(/^mailto:/i, "").replace(/@www\./i, "@");
    const address = normalizeEmail(fixed);
    if (!address) { dropped.push({ email: String(raw ?? ""), why: "malformed" }); continue; }
    if (seen.has(address)) { dropped.push({ email: address, why: "duplicate" }); continue; }
    seen.add(address);
    const [local, domain] = address.split("@");
    if (has(LEAD_JUNK_EMAIL_DOMAINS, domain)) { dropped.push({ email: address, why: "junk_domain" }); continue; }
    if (has(LEAD_PLACEHOLDER_LOCALS, local)) { dropped.push({ email: address, why: "placeholder" }); continue; }
    if (has(LEAD_ROLE_LOCALS, local.split(/[.+_-]/)[0])) { dropped.push({ email: address, why: "role" }); continue; }
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(domain)) { dropped.push({ email: address, why: "image" }); continue; }
    const isOwn = !!host && (domain === host || domain.endsWith(`.${host}`));
    (isOwn ? own : has(LEAD_FREE_MAIL, domain) ? free : foreign).push(address);
  }
  const deskRank = (a: string) => { const i = DESK_LOCALS.indexOf(a.split("@")[0]); return i < 0 ? DESK_LOCALS.length : i; };
  own.sort((a, b) => deskRank(a) - deskRank(b));
  const foreignDomains = new Set(foreign.map((a) => a.split("@")[1]));
  const keep = (xs: string[], limit: number) => { for (const x of xs.slice(limit)) dropped.push({ email: x, why: "over_limit" }); return xs.slice(0, limit); };
  const kept = [...keep(own, 5), ...keep(free, 3)];
  if (foreignDomains.size <= 3) kept.push(...keep(foreign, 2));
  else for (const x of foreign) dropped.push({ email: x, why: "foreign_list" });
  return { kept, dropped };
}

const NANP = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/** A US number anyone can dial, in E.164; null for a placeholder, a mis-prefixed number or a foreign one. */
export function usPhone(raw: string | null | undefined): string | null {
  const e164 = normalizePhone(raw);
  if (!e164 || !NANP.test(e164)) return null;
  const ten = e164.slice(2);
  if (/^(\d)\1{9}$/.test(ten) || ten === "1234567890") return null;
  return e164;
}

/** The website's host, www. removed; null when there is none of their own (a platform, a social page). */
export function siteHost(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!host.includes(".") || host.length > LEAD_FACT_MAX) return null;
  if (LEAD_PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`))) return null;
  return host;
}

/** The fifty states and DC, as a listing spells them. */
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE",
  nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const US_CODES = new Set(Object.values(US_STATES));

/** "Texas" or "TX" → "TX"; null for anything that is not a US state or DC. */
export function stateCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && US_CODES.has(up)) return up;
  return US_STATES[s.toLowerCase()] ?? null;
}

/* ---------------------------------------------------------- the month -- */

/** 'YYYY-MM' in the workspace's zone: the month a lead counts in (§0.2, 15). lead_month() in 00139 says the same. */
export function leadMonth(zone: string, at: Date): string {
  const d = dayInZone(zone, at.getTime());
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs`
Expected: `# tests 12`, `# pass 12`, `# fail 0`. Mutation checks, each restored after: change `LEAD_QUESTION_THRESHOLD` to `0.5` and "the question fires under 60%" fails ("60% is enough" fires); make `classify` treat a `seen` criterion's empty `facts` as a pass and "a seen criterion answered by inference goes to review" fails; change `LEAD_ASK_MAX_FACTOR` to `5` and "never over 4x the remainder" fails.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/lead-search.ts tooling/scripts/tests/lead-search.test.mjs
git commit -m "The lead finder's rules with a right answer: the plan, the class from the judge's answers, how many to ask for, when to stop and ask, the nine endings" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: `lead-judge.ts`, the schema, the rubric, the parser, the operation id

**Files:**
- Create: `tooling/scripts/tests/lead-judge.test.mjs`
- Create: `packages/contracts/src/lead-judge.ts`
- Modify: `packages/contracts/src/index.ts`, `tooling/scripts/tests/lead-search.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/lead-judge.test.mjs`:

```js
/**
 * The judge's contract, run (PRD v3 §0.1, §7.1; release A1): the schema is the
 * shape the API constrains to, the facts reach it capped and quoted, the answer
 * is read back by code and refused when it names what the plan or the place
 * does not have, and a batch's operation id is one hash.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  JUDGE_OUTPUT_SCHEMA, JUDGE_FACT_KEYS, judgeSystemPrompt, judgeUserContent, parseJudgeAnswer, judgeOpId, sha256Hex,
} from "../../../packages/contracts/src/lead-judge.ts";
import { LeadSearchPlanSchema, LEAD_FACT_MAX } from "../../../packages/contracts/src/lead-search.ts";

const plan = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "personal trainers in Austin",
  terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 25, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }, { key: "otc", text: "Already sell OTC medicine", standard: "seen", required: false }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});
const places = [
  { ref: 1, name: "Zilker Strength", category: "Personal trainer", city: "Austin", state: "TX", host: "zilkerstrength.example", rating: 4.9, reviews: 41, emails: ["hello@zilkerstrength.example", "coach.sam@gmail.com"], phone_matches_site: true },
  { ref: 2, name: "Barton Fit", category: null, city: "Austin", state: "TX", host: null, rating: null, reviews: null, emails: [], phone_matches_site: null },
];
const good = {
  places: [
    { ref: 1, criteria: [{ key: "website", answer: "pass", facts: ["host"] }, { key: "otc", answer: "unknown", facts: [] }, { key: "chain", answer: "pass", facts: ["name", "reviews"] }], email_index: 0, reason: "Independent trainer with a site of their own." },
    { ref: 2, criteria: [{ key: "website", answer: "fail", facts: [] }, { key: "otc", answer: "unknown", facts: [] }, { key: "chain", answer: "unknown", facts: ["name"] }], email_index: null, reason: "No site listed." },
  ],
};

test("the schema is hand-written the way the brain sends one: every property required, additionalProperties false, no length or range keywords", () => {
  const seen = [];
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") {
      assert.deepEqual([...Object.keys(node.properties)].sort(), [...node.required].sort(), `${path}: every property is required`);
      assert.equal(node.additionalProperties, false, `${path}: additionalProperties false`);
    }
    for (const k of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern"]) assert.ok(!(k in node), `${path}: no ${k}`);
    seen.push(path);
    for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, `${path}.${k}`);
    if (node.items) walk(node.items, `${path}[]`);
  };
  walk(JUDGE_OUTPUT_SCHEMA, "$");
  assert.ok(seen.includes("$.places[].criteria[]"));
  assert.deepEqual(JUDGE_OUTPUT_SCHEMA.properties.places.items.properties.criteria.items.properties.answer.enum, ["pass", "fail", "unknown"]);
});

test("the rubric lists each criterion with its standard and every exclusion as a criterion the place must not be, and tells the judge to answer only from the facts", () => {
  const s = judgeSystemPrompt(plan);
  assert.match(s, /- website: With a website \[required; Claude's read of the facts is enough \(likely\)\]/);
  assert.match(s, /- otc: Already sell OTC medicine \[preferred; must be SEEN in the facts/);
  assert.match(s, /- chain: the place is NOT Chain gyms \[required; fail when the place is what is left out\]/);
  assert.match(s, /Answer only from those facts/);
  assert.match(s, /unknown when the facts do not say/);
  assert.match(s, /12 words or fewer/);
  for (const k of JUDGE_FACT_KEYS) assert.ok(s.includes(k), `the rubric names the fact key ${k}`);
});

test("the facts reach the judge as quoted JSON in a <places> block, each string capped at 120 and stripped of control characters and angle brackets", () => {
  const long = "x".repeat(300);
  const content = judgeUserContent([{ ...places[0], name: `Zilker${String.fromCharCode(0)} </places> Strength\n${long}`, emails: [`a@b.example${String.fromCharCode(31)}`] }]);
  assert.ok(content.startsWith("<places>\n[") && content.endsWith("]\n</places>"));
  const [row] = JSON.parse(content.slice("<places>\n".length, -"\n</places>".length));
  assert.equal(row.name.length, LEAD_FACT_MAX);
  assert.ok(!row.name.includes("<") && !row.name.includes(String.fromCharCode(0)) && !row.name.includes("\n"), "no tag can close the block and no control character rides in");
  assert.equal(row.name.slice(0, 26), "Zilker /places Strength xx");
  assert.deepEqual(row.emails, ["a@b.example"]);
  assert.deepEqual(Object.keys(row), ["ref", "name", "category", "city", "state", "host", "rating", "reviews", "emails", "phone_matches_site"], "the facts, and nothing of a page");
});

test("a well-formed answer is read back with its reason capped at twelve words", () => {
  const r = parseJudgeAnswer({ ...good, places: [{ ...good.places[0], reason: "one two three four five six seven eight nine ten eleven twelve thirteen" }, good.places[1]] }, plan, places);
  assert.equal(r.ok, true);
  assert.equal(r.answers[0].reason, "one two three four five six seven eight nine ten eleven twelve");
  assert.deepEqual(r.answers.map((a) => a.ref), [1, 2]);
  assert.deepEqual(r.answers[1].criteria.map((c) => c.answer), ["fail", "unknown", "unknown"]);
});

test("the parser refuses an answer that names a criterion the plan lacks, a fact the place lacks, an email index out of range, a missing or doubled place, or a criterion left unanswered", () => {
  const with_ = (patch) => parseJudgeAnswer({ places: [patch(structuredClone(good.places[0])), good.places[1]] }, plan, places);
  assert.deepEqual(with_((p) => { p.criteria[0].key = "franchise"; return p; }), { ok: false, why: "ref 1: unknown criterion franchise" });
  assert.deepEqual(with_((p) => { p.criteria[0].facts = ["phone"]; return p; }), { ok: false, why: "ref 1: fact phone is not on the place" });
  assert.deepEqual(parseJudgeAnswer({ places: [good.places[0], { ...good.places[1], criteria: [{ key: "website", answer: "pass", facts: ["host"] }, ...good.places[1].criteria.slice(1)] }] }, plan, places), { ok: false, why: "ref 2: fact host is not on the place" }, "a null fact is not a fact the place has");
  assert.deepEqual(with_((p) => { p.email_index = 2; return p; }), { ok: false, why: "ref 1: email_index 2 out of range" });
  assert.deepEqual(with_((p) => { p.email_index = -1; return p; }), { ok: false, why: "ref 1: email_index -1 out of range" });
  assert.deepEqual(with_((p) => { p.ref = 9; return p; }), { ok: false, why: "ref 9 is not among the places" });
  assert.deepEqual(parseJudgeAnswer({ places: [good.places[0]] }, plan, places), { ok: false, why: "ref 2 not answered" });
  assert.deepEqual(parseJudgeAnswer({ places: [good.places[0], good.places[0]] }, plan, places), { ok: false, why: "ref 1 answered twice" });
  assert.deepEqual(with_((p) => { p.criteria = p.criteria.slice(0, 2); return p; }), { ok: false, why: "ref 1: criterion chain not answered" });
  assert.deepEqual(with_((p) => { p.criteria.push({ key: "chain", answer: "pass", facts: [] }); return p; }), { ok: false, why: "ref 1: a criterion answered twice" });
  assert.equal(parseJudgeAnswer({ places: [{ ...good.places[0], email_index: "0" }, good.places[1]] }, plan, places).ok, false, "the shape is zod's to refuse");
  assert.equal(parseJudgeAnswer("not json", plan, places).ok, false);
});

test("a batch's operation id is sha256 hex of run:offset:batch, the same the edge and the database would compute", () => {
  const id = judgeOpId("4f9e1b2a-0000-4000-8000-000000000001", 100, 2);
  assert.equal(id, createHash("sha256").update("4f9e1b2a-0000-4000-8000-000000000001:100:2").digest("hex"));
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const long = "The quick brown fox jumps over the lazy dog. ".repeat(20) + "ünïcödé";
  assert.equal(sha256Hex(long), createHash("sha256").update(long).digest("hex"), "multi-block input and UTF-8 agree with node's");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-judge.test.mjs`
Expected: `Cannot find module '…/packages/contracts/src/lead-judge.ts'`.

- [ ] **Step 3: Write the module**

Create `packages/contracts/src/lead-judge.ts`. `sha256Hex` is written out so `judgeOpId` is synchronous and needs no crypto import in the browser or on the edge; the test holds it to `node:crypto`.

```ts
/**
 * The judge's contract (PRD v3 §0.1, §7.1, 26): the facts a place shows it,
 * the schema its answer must fit, the rubric it reads, and the parser that
 * reads its answer back. The brain's split: contracts hold the schema and the
 * parser, packages/channels makes the call (A2's lead-judge.ts).
 *
 * The judge sees listing facts as quoted data, each capped and stripped of
 * control characters, never a page's text, and it answers each criterion
 * pass, fail or unknown with the fact keys it used. It never returns one
 * verdict for the place: code decides the class (lead-search.ts classify).
 */
import { z } from "zod";
import type { LeadSearchPlan } from "./lead-search";
import { LEAD_FACT_MAX, LEAD_REASON_MAX_WORDS } from "./lead-search";

/* ----------------------------------------------------------- the facts -- */

/** One place, as the judge is shown it. Every string is capped at LEAD_FACT_MAX and stripped of control characters by judgeUserContent. */
export interface PlaceFacts {
  ref: number;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  host: string | null;
  rating: number | null;
  reviews: number | null;
  /** The cleaned candidates, in the cleaner's order; the judge picks one by index. */
  emails: string[];
  /** The listing's number equals one on their site; null when the listing has no number. */
  phone_matches_site: boolean | null;
}

/** The keys a criterion's answer may cite: the facts, by name. */
export const JUDGE_FACT_KEYS = ["name", "category", "city", "state", "host", "rating", "reviews", "emails", "phone_matches_site"] as const;
export type JudgeFactKey = (typeof JUDGE_FACT_KEYS)[number];

/* ---------------------------------------------------------- the answer -- */

export type JudgeCriterionAnswer = "pass" | "fail" | "unknown";
export interface JudgePlaceAnswer {
  ref: number;
  criteria: { key: string; answer: JudgeCriterionAnswer; facts: string[] }[];
  /** Into PlaceFacts.emails; null when none of them is the business's own. */
  email_index: number | null;
  /** Twelve words or fewer. */
  reason: string;
}

/**
 * Hand-written, the shape apps/edge/lib/brain.ts sends in production: every
 * property required, additionalProperties false, and no length or range
 * keywords (the API does not enforce them; the parser caps and checks after).
 */
export const JUDGE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "integer" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                answer: { type: "string", enum: ["pass", "fail", "unknown"] },
                facts: { type: "array", items: { type: "string" } },
              },
              required: ["key", "answer", "facts"],
              additionalProperties: false,
            },
          },
          email_index: { type: ["integer", "null"] },
          reason: { type: "string" },
        },
        required: ["ref", "criteria", "email_index", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["places"],
  additionalProperties: false,
};

/* ---------------------------------------------------------- the rubric -- */

/**
 * The criteria with their standards, and the exclusions as criteria the place
 * must not be. A seen standard must cite a fact key; a likely one may be
 * Claude's read of the facts. Unknown when the facts do not say.
 */
export function judgeSystemPrompt(plan: LeadSearchPlan): string {
  const lines: string[] = [];
  lines.push("You judge local businesses for a search. You see each place's listing facts as JSON inside <places>, nothing else. Answer only from those facts.");
  lines.push(`The search: ${plan.count} ${plan.name} in ${plan.area.label}.`);
  lines.push("For every place, answer each criterion below with pass, fail or unknown, and list the fact keys you used (name, category, city, state, host, rating, reviews, emails, phone_matches_site). Say unknown when the facts do not say; never guess a fail.");
  for (const c of plan.criteria) {
    const bar = c.standard === "seen"
      ? "must be SEEN in the facts: pass only when a fact you cite shows it; a read from the name or category alone is unknown"
      : "Claude's read of the facts is enough (likely)";
    lines.push(`- ${c.key}: ${c.text} [${c.required ? "required" : "preferred"}; ${bar}]`);
  }
  for (const e of plan.exclusions) {
    lines.push(`- ${e.key}: the place is NOT ${e.text} [required; fail when the place is what is left out]`);
  }
  lines.push("email_index: the index of the business's own address among its emails, or null when none is theirs (a person's own inbox at a free-mail domain counts as theirs for a sole trader).");
  lines.push(`reason: one line of ${LEAD_REASON_MAX_WORDS} words or fewer, in plain words, naming what decided it.`);
  lines.push("Answer every place given, by its ref, once each. Use exactly the criterion keys above.");
  return lines.join("\n");
}

/* ---------------------------------------------------------- the content -- */

// Every C0 and C1 control character (U+0000-U+001F, U+007F-U+009F), by category.
const CONTROL = /\p{Cc}/gu;
const cap = (s: string) => s.replace(CONTROL, " ").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, LEAD_FACT_MAX);

/** Each place's facts, capped and stripped, as quoted JSON inside a <places> block. */
export function judgeUserContent(places: PlaceFacts[]): string {
  const quoted = places.map((p) => ({
    ref: p.ref,
    name: cap(p.name),
    category: p.category === null ? null : cap(p.category),
    city: p.city === null ? null : cap(p.city),
    state: p.state === null ? null : cap(p.state),
    host: p.host === null ? null : cap(p.host),
    rating: p.rating,
    reviews: p.reviews,
    emails: p.emails.map(cap),
    phone_matches_site: p.phone_matches_site,
  }));
  return `<places>\n${JSON.stringify(quoted)}\n</places>`;
}

/* ----------------------------------------------------------- the parser -- */

const AnswerSchema = z.object({
  places: z.array(z.object({
    ref: z.number().int(),
    criteria: z.array(z.object({ key: z.string(), answer: z.enum(["pass", "fail", "unknown"]), facts: z.array(z.string()) })),
    email_index: z.number().int().nullable(),
    reason: z.string(),
  })),
});

/** Which fact keys this place actually has: a key the place lacks cannot have been used. */
function factKeysOf(p: PlaceFacts): Set<string> {
  const keys = new Set<string>();
  for (const k of JUDGE_FACT_KEYS) {
    const v = p[k];
    if (v === null || v === undefined) continue;
    if (k === "emails" && p.emails.length === 0) continue;
    keys.add(k);
  }
  return keys;
}

const trimWords = (s: string) => s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, LEAD_REASON_MAX_WORDS).join(" ");

/**
 * The answer, read by code. Rejected whole when a place is missing or answered
 * twice, a ref is not among the places, a criterion key is not the plan's or
 * is answered twice or not at all, a fact key is not one the place has, or an
 * email index is out of range. The reason is capped to twelve words.
 */
export function parseJudgeAnswer(raw: unknown, plan: LeadSearchPlan, places: PlaceFacts[]): { ok: true; answers: JudgePlaceAnswer[] } | { ok: false; why: string } {
  const parsed = AnswerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, why: `shape: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  const byRef = new Map(places.map((p) => [p.ref, p]));
  const wanted = [...plan.criteria.map((c) => c.key), ...plan.exclusions.map((e) => e.key)];
  const answers: JudgePlaceAnswer[] = [];
  const seen = new Set<number>();
  for (const a of parsed.data.places) {
    const place = byRef.get(a.ref);
    if (!place) return { ok: false, why: `ref ${a.ref} is not among the places` };
    if (seen.has(a.ref)) return { ok: false, why: `ref ${a.ref} answered twice` };
    seen.add(a.ref);
    const keys = a.criteria.map((c) => c.key);
    for (const k of keys) if (!wanted.includes(k)) return { ok: false, why: `ref ${a.ref}: unknown criterion ${k}` };
    if (new Set(keys).size !== keys.length) return { ok: false, why: `ref ${a.ref}: a criterion answered twice` };
    for (const k of wanted) if (!keys.includes(k)) return { ok: false, why: `ref ${a.ref}: criterion ${k} not answered` };
    const have = factKeysOf(place);
    for (const c of a.criteria) for (const f of c.facts) if (!have.has(f)) return { ok: false, why: `ref ${a.ref}: fact ${f} is not on the place` };
    if (a.email_index !== null && (a.email_index < 0 || a.email_index >= place.emails.length)) return { ok: false, why: `ref ${a.ref}: email_index ${a.email_index} out of range` };
    answers.push({ ref: a.ref, criteria: a.criteria.map((c) => ({ key: c.key, answer: c.answer, facts: [...c.facts] })), email_index: a.email_index, reason: trimWords(a.reason) });
  }
  for (const p of places) if (!seen.has(p.ref)) return { ok: false, why: `ref ${p.ref} not answered` };
  return { ok: true, answers };
}

/* ------------------------------------------------------ the operation id -- */

// SHA-256 in plain TypeScript: synchronous, so an operation id can be made
// wherever a batch is, in the browser or on the edge, with no crypto import.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a UTF-8 string, as lower-case hex. */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** The judge's operation id for one batch: sha256 hex of `${runId}:${fromOffset}:${batch}`, so a replayed page finds its answer and pays nothing (E4). */
export function judgeOpId(runId: string, fromOffset: number, batch: number): string {
  return sha256Hex(`${runId}:${fromOffset}:${batch}`);
}
```

- [ ] **Step 4: Export both modules, and let the vendor test walk the judge's words too**

In `packages/contracts/src/index.ts`, after `export * from "./erasure";`, add:

```ts
export * from "./lead-search";
export * from "./lead-judge";
```

In `tooling/scripts/tests/lead-search.test.mjs`, after `import * as searchWords from "../../../packages/contracts/src/lead-search.ts";` add:

```js
import * as judgeWords from "../../../packages/contracts/src/lead-judge.ts";
```

and in the last test, after `walk({ ...searchWords });` add:

```js
  walk({ ...judgeWords });
```

- [ ] **Step 5: Run both files, and typecheck contracts**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-judge.test.mjs`
Expected: `# tests 18`, `# pass 18`, `# fail 0`.

Run: `corepack pnpm --filter @chanlytics/contracts typecheck`
Expected: `tsc --noEmit` with no error.

Mutation checks, each restored after: in `judgeUserContent` drop `.replace(/[<>]/g, " ")` and "no tag can close the block" fails; in `parseJudgeAnswer` drop the `factKeysOf` check and "fact phone is not on the place" fails; in `JUDGE_OUTPUT_SCHEMA` make `reason` optional (remove it from `required`) and the schema test fails.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/lead-judge.ts packages/contracts/src/index.ts tooling/scripts/tests/lead-judge.test.mjs tooling/scripts/tests/lead-search.test.mjs
git commit -m "The judge sees listing facts as quoted data and answers each criterion; code reads the answer back and refuses what the plan or the place does not have" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: the kinds, the permission, retention, the hash, the ledger's waits, the handlers' seam (no commit yet)

**Files:**
- Modify: `packages/contracts/src/enums.ts`, `config.ts`, `refusal.ts`, `retention.ts`, `erasure.ts`
- Modify: `packages/jobs/src/ledger.ts`, `packages/jobs/src/handlers.ts`
- Create: `tooling/scripts/tests/lead-jobs.test.mjs`
- Modify: `tooling/scripts/tests/retention-words.test.mjs`, `tooling/scripts/tests/store-retired.test.mjs`, `tooling/scripts/delete-tenant.mjs`

Adding three kinds to `JOB_KINDS` makes `schema-sets.ts` stop compiling (`Holds<Exactly<Of<typeof JOB_KINDS>, SchemaSet<"jobs.kind">>>`) until Task 4 regenerates the sets from the migrated database, and the contracts dist cannot build until then either. So this task edits and runs the suites that read source; it commits nothing. Task 4 commits both.

Every edit below is anchored on text that occurs once in its file. The files on disk are CRLF; use your editor's exact-text replace.

- [ ] **Step 1: The job kinds and the event kinds**

In `packages/contracts/src/enums.ts`, replace

```ts
  "email_ingest",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];
```

with

```ts
  "email_ingest",
  /**
   * The lead finder (00139, PRD v3 §12.5). lead_round_start starts one round:
   * a run per term, each claimed before the provider is called. lead_collect
   * reads one page of one run, judges it and commits it in one transaction;
   * seq is p<offset> for a page, final from the webhook, s<minute> from the
   * sweep, stop from the stop door. lead_check checks one batch of emails. A
   * provider's 429 or 5xx throws and is tried again by RETRY_WAITS_MS.
   */
  "lead_round_start",
  "lead_collect",
  "lead_check",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];
```

and replace

```ts
  "mailbox.created",
  "mailbox.renamed",
] as const;
```

with

```ts
  "mailbox.created",
  "mailbox.renamed",
  /** A lead search's round started, waited, or ended with one of the nine endings (00139). */
  "lead.round",
  /** An ask no source card fits, logged as demand (§0.3): the words asked, never a place. */
  "lead.no_card",
] as const;
```

- [ ] **Step 2: The permission `find`, owner only, with its words**

In `packages/contracts/src/config.ts`, replace

```ts
export const ROLE_PERMS: Record<Role, { approve: boolean; autonomy: boolean; disconnect: boolean; billing: boolean; team: boolean; settings: boolean; export: boolean }> = {
```

with

```ts
export const ROLE_PERMS: Record<Role, { approve: boolean; autonomy: boolean; disconnect: boolean; billing: boolean; team: boolean; settings: boolean; export: boolean; find: boolean }> = {
```

and replace

```ts
  // people a screen at a time, the owner may take them all at once.
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true,  export: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false, export: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false },
```

with

```ts
  // people a screen at a time, the owner may take them all at once.
  // `find` is the lead finder: starting a search, keeping a lead from review,
  // putting one back. Each spends the month's allowance, so it is the
  // owner's alone (PRD v3 §16.6, S9); has_permission() in 00139 says the
  // same, and lead-engine.db.test.mjs holds the two together.
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true,  export: true,  find: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false, export: false, find: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false, find: false },
```

In `packages/contracts/src/refusal.ts`, replace

```ts
  export: "export the customer list",
};
```

with

```ts
  export: "export the customer list",
  find: "find businesses for you",
};
```

(`PERM_DOING` is `Record<RolePerm, string>`, so the compiler demands this line; `gate-reason.test.mjs` reads "Only an owner can find businesses for you." from it.)

- [ ] **Step 3: Retention, and the pin that names its numbers**

In `packages/contracts/src/retention.ts`, replace

```ts
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14,
} as const;
```

with

```ts
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14,
  /** A found lead nobody worked (no contact, no export, no person): set aside, then its details removed (purge_leads, 00139). */
  leads_untouched: 90,
  leads_untouched_blanked: 180,
  /** A place a search left out: its details removed, while the count of what was left out stays (purge_leads, 00139). */
  leads_excluded_blanked: 30,
} as const;
```

and in `retentionWords()` replace the tail

```ts
are removed; the sweeps' run history is kept for ${d.cron_history} days and rate-limit counters for ${RATE_HITS_RETENTION_HOURS} hours. Everything else stays while the workspace exists.`;
```

with

```ts
are removed; the sweeps' run history is kept for ${d.cron_history} days and rate-limit counters for ${RATE_HITS_RETENTION_HOURS} hours. Leads nobody has worked are set aside after ${d.leads_untouched} days and their details removed after ${d.leads_untouched_blanked}; places a search left out lose their details after ${d.leads_excluded_blanked} days. Everything else stays while the workspace exists.`;
```

In `tooling/scripts/tests/retention-words.test.mjs`, replace

```js
  assert.deepEqual(RETENTION_DAYS, { call_recordings: 90, events_evidence: 30, ask_threads: 90, notifications: 90, cron_history: 14 });
```

with

```js
  assert.deepEqual(RETENTION_DAYS, { call_recordings: 90, events_evidence: 30, ask_threads: 90, notifications: 90, cron_history: 14, leads_untouched: 90, leads_untouched_blanked: 180, leads_excluded_blanked: 30 });
```

and after the line `  assert.match(words, /run history is kept for 14 days and rate-limit counters for 2 hours/);` add

```js
  assert.match(words, /Leads nobody has worked are set aside after 90 days and their details removed after 180; places a search left out lose their details after 30 days\./);
```

- [ ] **Step 4: The suppression hash, over the digest erasure already keeps**

In `packages/contracts/src/erasure.ts`, after the whole `erasedEmailHash` function, add:

```ts

/**
 * A lead's email, phone or place id on the never-again list (lead_suppressions,
 * 00139): the same keyed digest, so SQL's lead_suppression_hash(tenant, value)
 * and this agree byte for byte (lead-engine.db.test.mjs proves it). The value
 * is the one stored: E.164 with its "+", normalizeEmail's output, the place id.
 */
export function leadSuppressionHash(tenantId: string, value: string): Promise<string> {
  return keyedDigest(tenantId, value);
}
```

- [ ] **Step 5: The ledger's waits**

In `packages/jobs/src/ledger.ts`, replace

```ts
export const RETRY_WAITS_MS: Readonly<Record<string, readonly number[]>> = {
  email_ingest: [5 * 60_000, 30 * 60_000],
};
```

with

```ts
export const RETRY_WAITS_MS: Readonly<Record<string, readonly number[]>> = {
  email_ingest: [5 * 60_000, 30 * 60_000],
  // The lead finder's three (00139). Each is written to be run again: a start
  // claims its run row before it calls the provider, a collect commits a page
  // by compare-and-set on the offset, a check commits by lead id. A
  // provider's 429 or 5xx throws and lands here: two minutes covers a bad
  // minute, ten a short outage; the third claim fails the row and the round
  // ends "the source failed". Every wait outlasts the lease (jobs-ledger.test.mjs).
  lead_round_start: [2 * 60_000, 10 * 60_000],
  lead_collect: [2 * 60_000, 10 * 60_000],
  lead_check: [2 * 60_000, 10 * 60_000],
};
```

- [ ] **Step 6: The handlers' seam, and its test**

In `packages/jobs/src/handlers.ts`, inside `JobContext`, replace

```ts
  /**
   * Schedule a job of this tenant — how a broadcast continues itself, one
   * batch after another, through the same door the dashboard uses.
   */
  schedule: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
```

with

```ts
  /**
   * The lead finder's pipeline (00139), as the edge holds it. INJECTED like
   * the three above: the provider's token, the judge's client and the
   * webhook base live on the edge (release A2 binds them). Optional so a
   * test context need not supply one; a lead job in a runtime without it
   * fails loudly rather than guessing. Each takes the claimed job whole and
   * bounds itself to one page or one batch before ctx.deadline.
   */
  leads?: {
    roundStart: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    collect: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    check: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
  };
  /**
   * Schedule a job of this tenant — how a broadcast continues itself, one
   * batch after another, through the same door the dashboard uses.
   */
  schedule: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
```

Replace

```ts
type Handler = (ctx: JobContext, job: ClaimedJob) => Promise<void>;
```

with

```ts
type Handler = (ctx: JobContext, job: ClaimedJob) => Promise<void>;

/**
 * The lead finder's three, over the pipeline the edge injects (A2). Each is
 * written to be run again (RETRY_WAITS_MS): a start claims its run row before
 * the provider is called, a collect commits one page by compare-and-set, a
 * check commits by lead id.
 */
async function leadRoundStart(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_round_start: this runtime holds no lead pipeline");
  await ctx.leads.roundStart(ctx, job);
}
async function leadCollect(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_collect: this runtime holds no lead pipeline");
  await ctx.leads.collect(ctx, job);
}
async function leadCheck(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_check: this runtime holds no lead pipeline");
  await ctx.leads.check(ctx, job);
}
```

and in the dispatch map replace

```ts
  line_provision: lineProvision,
  email_ingest: emailIngest,
};
```

with

```ts
  line_provision: lineProvision,
  email_ingest: emailIngest,
  lead_round_start: leadRoundStart,
  lead_collect: leadCollect,
  lead_check: leadCheck,
};
```

Create `tooling/scripts/tests/lead-jobs.test.mjs` (it reads the jobs dist, so it goes green in Task 4 after the rebuild):

```js
/**
 * The lead finder's three job kinds reach the pipeline the edge injects, and
 * a runtime without one fails the job loudly instead of guessing (00139,
 * release A1; A2 binds the pipeline). Run over the committed jobs dist, the
 * way line-provision.test.mjs runs its kind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JOB_KINDS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { dispatchJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

const job = (kind, payload) => ({ id: "j1", tenant_id: "t1", kind, payload, due_at: "2026-09-19T12:00:00Z", attempts: 1 });
const ctx = (leads) => ({
  db: fakeDb({}), wire: null, alert: async () => {}, eraseThread: async () => true, schedule: async () => {}, deadline: Date.now() + 60_000,
  ...(leads ? { leads } : {}),
});

test("the three kinds are declared, and each reaches its half of the injected pipeline with the claimed job whole", async () => {
  for (const kind of ["lead_round_start", "lead_collect", "lead_check"]) assert.ok(JOB_KINDS.includes(kind), `${kind} is a kind the ledger holds`);
  const calls = [];
  const leads = {
    roundStart: async (_c, j) => { calls.push(["roundStart", j.payload]); },
    collect: async (_c, j) => { calls.push(["collect", j.payload]); },
    check: async (_c, j) => { calls.push(["check", j.payload]); },
  };
  assert.equal(await dispatchJob(ctx(leads), job("lead_round_start", { round_id: "r1" })), "done");
  assert.equal(await dispatchJob(ctx(leads), job("lead_collect", { run_id: "u1", seq: "p100" })), "done");
  assert.equal(await dispatchJob(ctx(leads), job("lead_check", { round_id: "r1", batch: 2 })), "done");
  assert.deepEqual(calls, [["roundStart", { round_id: "r1" }], ["collect", { run_id: "u1", seq: "p100" }], ["check", { round_id: "r1", batch: 2 }]]);
});

test("a runtime without the pipeline fails a lead job by name, never silently", async () => {
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_round_start", { round_id: "r1" })), /lead_round_start: this runtime holds no lead pipeline/);
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_collect", { run_id: "u1", seq: "final" })), /lead_collect: this runtime holds no lead pipeline/);
  await assert.rejects(() => dispatchJob(ctx(undefined), job("lead_check", { round_id: "r1", batch: 1 })), /lead_check: this runtime holds no lead pipeline/);
});
```

- [ ] **Step 7: The two source lints, and the backup script's list**

In `tooling/scripts/tests/store-retired.test.mjs`, replace

```js
  assert.deepEqual([...JOB_KINDS], ["outbound_send", "broadcast_send", "blob_thread_erase", "line_provision", "email_ingest"]);
```

with

```js
  assert.deepEqual([...JOB_KINDS], ["outbound_send", "broadcast_send", "blob_thread_erase", "line_provision", "email_ingest", "lead_round_start", "lead_collect", "lead_check"]);
```

and replace the block

```js
  // Something schedules each kind: a `schedule(...)` / `scheduleJob(...)` /
  // `ctx.schedule(...)` call, or the draft queue's row, naming it.
  const src = sourceTree(["apps/edge", "apps/dashboard/app", "apps/dashboard/src", "packages/jobs/src"]);
  for (const k of JOB_KINDS) {
    const named = new RegExp(`(schedule(?:Job)?\\([^;]*"${k}"|kind: "${k}")`, "s");
    assert.ok(named.test(src), `${k} is scheduled by something`);
  }
```

with

```js
  // Something schedules each kind: a `schedule(...)` / `scheduleJob(...)` /
  // `ctx.schedule(...)` call, or the draft queue's row, naming it -- or a
  // door in SQL that inserts the job itself (the lead finder's, 00139).
  const src = sourceTree(["apps/edge", "apps/dashboard/app", "apps/dashboard/src", "packages/jobs/src"]);
  const migrations = path.join(ROOT, "supabase/migrations");
  const sql = fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(path.join(migrations, f), "utf8")).join("\n");
  for (const k of JOB_KINDS) {
    const named = new RegExp(`(schedule(?:Job)?\\([^;]*"${k}"|kind: "${k}")`, "s");
    const inserted = new RegExp(`insert into (?:public\\.)?jobs\\b[^;]*'${k}'`, "s");
    assert.ok(named.test(src) || inserted.test(sql), `${k} is scheduled by something`);
  }
```

(`fs`, `path` and `ROOT` are already in that file; no `readRaw(` is added, so the ratchet's count for the file does not move.)

In `tooling/scripts/delete-tenant.mjs`, replace

```js
  "google_listings", "google_reviews", "idempotency_keys", "invitations", "jobs", "lines",
  "mailboxes", "memberships", "messages", "notification_reads", "notifications", "playbooks", "policies",
  "segment_members", "segments", "templates", "tenant_channels", "tenant_config",
];
```

with

```js
  "google_listings", "google_reviews", "idempotency_keys", "invitations", "jobs",
  "lead_counters", "lead_judgments", "lead_operations", "lead_places", "lead_preferences", "lead_rounds", "lead_runs",
  "lead_search_members", "lead_searches", "lead_suppressions", "leads", "lines",
  "mailboxes", "memberships", "messages", "notification_reads", "notifications", "playbooks", "policies",
  "segment_members", "segments", "templates", "tenant_channels", "tenant_config",
];
```

(`delete-tenant.test.mjs` reads every `create table` with a `tenant_id` out of the migrations; the eleven are the lead tables with one. `lead_platform` and `lead_niche_priors` have none.)

- [ ] **Step 8: Run what reads source now**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/jobs-ledger.test.mjs tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-judge.test.mjs`
Expected: `# fail 0` (`jobs-ledger` reads `ledger.ts` and `enums.ts` from source: the three kinds are declared, tried again, and every wait outlasts the lease).

Run: `corepack pnpm --filter @chanlytics/contracts typecheck`
Expected: exactly one error, `src/schema-sets.ts(69,9): error TS2344: Type 'false' does not satisfy the constraint 'true'.` (the `jobs.kind` line). Task 4 regenerates the sets and it goes. Do not commit.

---

## Task 4: The migration 00139, applied locally, the sets regenerated, one commit with Task 3

**Files:**
- Create: `supabase/migrations/00139_the_lead_finder_engine.sql`
- Modify: `packages/contracts/src/schema-sets.ts`; `packages/contracts/src/schema-sets.generated.ts` (generated); `packages/db/src/database.types.ts` (generated); `packages/*/dist/**` (built)

- [ ] **Step 1: Re-check the number, then write the migration**

Run the command of Task 0, Step 4 again. Expected: nothing holds 00139.

Create `supabase/migrations/00139_the_lead_finder_engine.sql`:

```sql
-- 00139 · The lead finder's engine: the data and the doors (release A1).
--
-- PRD v3 (docs/plans/2026-09-17-people-table-and-lead-finder.md) §0, §12.3,
-- §12.4; the plan is docs/plans/2026-09-19-lead-finder-A1-data.md. Nothing here
-- draws a screen and nothing here calls a provider: A2 brings the pipeline
-- (the three jobs, the webhook, the sweep's handler, the routes).
--
-- The shape, in one paragraph. A SEARCH is the saved object: its name, the
-- owner's words, its current plan. A ROUND is the unit of execution and of
-- money: the probe, each top-up, each Find new ones; it carries the exact plan
-- it ran, its reservation, its spend and one of nine endings, and it is final
-- once ended (lead_rounds_guard). A RUN is one provider execution, claimed
-- before the provider is called (lead_run_claim) and leased by owner token and
-- generation while a page is read (lead_run_lease). A LEAD is a place, one
-- physical location, unique by its place id in the workspace; a shared phone,
-- email or website host is a lookup and a mark, never a merge (25). A
-- MEMBERSHIP joins a lead to a search with that search's own judgment and
-- class. COUNTERS hold the month's allowance and searching budget and the two
-- day caps, reserved in one fixed order inside one transaction and settled as
-- pages commit (E2). OPERATIONS are the undo records (E9). Suppression is by
-- what happened (S8). The switch ships off: lead_platform.searches_on is
-- false, and only the workspaces listed in tenants_on may search (30).
--
-- Money is numeric(10,4). Every door is SECURITY DEFINER with search_path
-- pinned, checks the caller's membership and role through the existing
-- helpers, and returns a refusal as jsonb ({error: ...}) where the owner will
-- read a sentence, raising only for a caller's bug. Every service RPC runs as
-- one transaction and is the edge's alone (service_role). Members read their
-- workspace's rows through row-level security (the 00002 shape) and write
-- nothing directly.

/* ------------------------------------------------------------ 1. tables -- */

-- The platform's switch, one row (13, 30). No member policy: read through
-- lead_searches_on().
create table if not exists public.lead_platform (
  id                boolean primary key default true check (id),
  searches_on       boolean not null default false,
  tenants_on        uuid[]  not null default '{}',
  note              text check (char_length(note) <= 200),
  prices_checked_at timestamptz,
  updated_at        timestamptz not null default now()
);
insert into public.lead_platform (id) values (true) on conflict (id) do nothing;
comment on table public.lead_platform is
  'One row. searches_on is the kill switch for every workspace; tenants_on lists the workspaces that may search while it is off (release A''s internal runs). Read through lead_searches_on(); written by hand.';

-- What past searches found for a kind of business, platform-wide (§7.1 the
-- likely line). No member policy: read through lead_niche_prior().
create table if not exists public.lead_niche_priors (
  category_key text primary key check (category_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  places       integer not null default 0 check (places >= 0),
  matched      integer not null default 0 check (matched >= 0),
  with_email   integer not null default 0 check (with_email >= 0),
  updated_at   timestamptz not null default now()
);
comment on table public.lead_niche_priors is
  'Platform-wide counts per kind of business: places judged, how many qualified, how many had an email. Aggregates only; nothing names a workspace or a place.';

create table if not exists public.lead_searches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  via        text not null check (via in ('people', 'ask')),
  card       text not null,
  name       text not null check (char_length(name) between 1 and 120),
  asked      text not null check (char_length(asked) <= 400),
  plan       jsonb not null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_searches_tenant_created on public.lead_searches (tenant_id, created_at desc);
comment on table public.lead_searches is
  'The saved object: who was asked for, in the owner''s words, and the current plan. No state and no counters: lead_searches_view derives both from the rounds and the members.';

create table if not exists public.lead_rounds (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  search_id          uuid not null references public.lead_searches (id) on delete cascade,
  seq                integer not null check (seq >= 1),
  purpose            text not null check (purpose in ('probe', 'main', 'topup', 'renew')),
  plan               jsonb not null,
  plan_version       integer not null check (plan_version >= 1),
  target             integer not null check (target >= 0),
  state              text not null default 'queued'
                     check (state in ('queued', 'probing', 'waiting_on_owner', 'running', 'checking', 'ended')),
  ending             text check (ending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused')),
  -- The ending a collect decided while the emails were still being checked;
  -- the check's last batch ends the round with it (17, S12).
  ending_pending     text check (ending_pending in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused')),
  question           jsonb,
  answered           text check (answered in ('keep', 'include', 'stop')),
  waiting_since      timestamptz,
  allowance_reserved integer not null default 0 check (allowance_reserved >= 0),
  allowance_used     integer not null default 0 check (allowance_used >= 0),
  cost_reserved_usd  numeric(10,4) not null default 0 check (cost_reserved_usd >= 0),
  cost_usd           numeric(10,4) not null default 0 check (cost_usd >= 0),
  judge_tokens       integer not null default 0,
  judge_model        text,
  -- The counter rows this round reserved in: the month and the day of its
  -- creation, in the workspace's zone (the platform's day row is UTC).
  month              text not null check (month ~ '^\d{4}-\d{2}$'),
  day                text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  started_at         timestamptz,
  ended_at           timestamptz,
  created_at         timestamptz not null default now(),
  unique (search_id, seq),
  check ((state = 'ended') = (ending is not null))
);
create index if not exists lead_rounds_search_seq on public.lead_rounds (search_id, seq desc);
create index if not exists lead_rounds_live on public.lead_rounds (state) where state <> 'ended';
comment on table public.lead_rounds is
  'The unit of execution and of money: the probe (seq 1), each top-up and each Find new ones. Carries the plan it ran, its reservation and spend, one ending; final once ended (lead_rounds_guard). The search''s state is its latest round''s.';
comment on column public.lead_rounds.ending_pending is
  'Set by the collect that moved the round to checking, or by Stop during the checks; lead_check_commit''s last batch ends the round with it.';

create table if not exists public.lead_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  round_id           uuid not null references public.lead_rounds (id) on delete cascade,
  purpose            text not null check (purpose in ('discover', 'check')),
  term               text,
  actor              text not null,
  build              text not null,
  apify_run_id       text unique,
  dataset_id         text,
  state              text not null default 'claimed'
                     check (state in ('claimed', 'starting', 'running', 'succeeded', 'failed', 'aborted', 'timed_out', 'unknown')),
  claimed_by         text,
  claimed_at         timestamptz,
  webhook_token_hash text not null,
  lease_owner        text,
  lease_gen          integer not null default 0,
  lease_until        timestamptz,
  read_offset        integer not null default 0 check (read_offset >= 0),
  items_seen         integer not null default 0,
  cap_usd            numeric(10,4),
  usage_usd          numeric(10,4) not null default 0,
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create index if not exists lead_runs_round on public.lead_runs (round_id);
create index if not exists lead_runs_live on public.lead_runs (state) where state in ('claimed', 'starting', 'running', 'unknown');
comment on table public.lead_runs is
  'One provider execution: a discover run per term, a check run per batch of addresses. Written ''claimed'' (the row exists), claimed by a dispatch token before the provider is called (E1), leased by owner token and generation while a page is read (E3); the webhook token is made with the row and never rewritten.';

create table if not exists public.lead_judgments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  round_id     uuid not null references public.lead_rounds (id) on delete cascade,
  batch        integer not null default 0,
  op_id        text not null unique,
  request_hash text,
  answer       jsonb not null,
  model        text,
  tokens       integer not null default 0,
  created_at   timestamptz not null default now()
);
comment on table public.lead_judgments is
  'The judge''s answer for one batch, kept by operation id (sha256 of run:offset:batch), so a replayed page finds it and pays nothing (E4). No member policy: the peek reads the member''s own judgment.';

create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  place_id         text,
  business_name    text not null default '',
  category         text,
  street           text,
  city             text,
  region           text,
  postal_code      text,
  country          text not null default 'US',
  lat              double precision,
  lng              double precision,
  website_host     text,
  instagram_url    text,
  phone_e164       text,
  phone_sources    smallint not null default 0,
  phone_wrong      boolean not null default false,
  email            text,
  email_alternates jsonb not null default '[]'::jsonb,
  email_state      text not null default 'none' check (email_state in ('none', 'checking', 'ok', 'catch_all', 'unknown', 'invalid')),
  email_checked_at timestamptz,
  rating           numeric(2,1),
  reviews          integer,
  stage            text not null default 'ready' check (stage in ('ready', 'nurture', 'converted', 'archived')),
  closed_reason    text check (closed_reason in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed')),
  last_outcome     text,
  last_note        text,
  contacted_at     timestamptz,
  exported_at      timestamptz,
  contact_id       uuid references public.contacts (id) on delete set null,
  converted_at     timestamptz,
  found_at         timestamptz not null default now(),
  erased_at        timestamptz,
  blanked_at       timestamptz
);
-- A place is one lead in a workspace; a blanked lead has no place id, so the
-- same place found again is a new lead. No unique email or phone (25).
create unique index if not exists leads_tenant_place_uq on public.leads (tenant_id, place_id) where place_id is not null;
create index if not exists leads_tenant_phone on public.leads (tenant_id, phone_e164) where phone_e164 is not null;
create index if not exists leads_tenant_email on public.leads (tenant_id, email) where email is not null;
create index if not exists leads_tenant_host on public.leads (tenant_id, website_host) where website_host is not null;
create index if not exists leads_tenant_contact on public.leads (tenant_id, contact_id) where contact_id is not null;
comment on table public.leads is
  'A place: one physical location, outside contacts. Unique by place id in the workspace; a shared phone, email or website is looked up and marked on the member, never merged (25). Stage is the relationship; class lives on the membership.';

create table if not exists public.lead_places (
  id        uuid primary key default gen_random_uuid(),
  lead_id   uuid not null references public.leads (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  place_id  text not null,
  title     text,
  street    text,
  found_at  timestamptz not null default now(),
  unique (tenant_id, place_id)
);
comment on table public.lead_places is
  'A duplicate listing (the same name, address and phone) folded into the lead already held, so rediscovery maps back (E6).';

create table if not exists public.lead_search_members (
  id            uuid primary key default gen_random_uuid(),
  search_id     uuid not null references public.lead_searches (id) on delete cascade,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  round_id      uuid references public.lead_rounds (id) on delete set null,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  judgment      jsonb not null default '{}'::jsonb,
  class         text not null check (class in ('qualified', 'review', 'excluded')),
  excluded_by   text,
  fit           text check (fit in ('strong', 'look', 'long')),
  reason        text not null default '' check (char_length(reason) <= 120),
  distance_m    integer,
  counted       boolean not null default false,
  counted_month text check (counted_month ~ '^\d{4}-\d{2}$'),
  kept_at       timestamptz,
  kept_by       uuid,
  blanked_at    timestamptz,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  unique (search_id, lead_id),
  check (counted = (counted_month is not null))
);
create index if not exists lead_search_members_lead on public.lead_search_members (lead_id);
create index if not exists lead_search_members_round on public.lead_search_members (round_id);
create index if not exists lead_search_members_page on public.lead_search_members (tenant_id, search_id, class, created_at desc);
comment on table public.lead_search_members is
  'One lead in one search, with that search''s judgment ({answer, reasons, shares}), class, fit and distance. counted_month is the month it counted in (S11). The round''s tallies are counts over this table, never stored twice. version guards Undo (E9).';

create table if not exists public.lead_counters (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references public.tenants (id) on delete cascade,
  kind       text not null check (kind in ('allowance', 'budget', 'day')),
  period     text not null,
  used       numeric(10,4) not null default 0 check (used >= 0),
  reserved   numeric(10,4) not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, kind, period),
  check (kind = 'day' or tenant_id is not null),
  check (case kind when 'day' then period ~ '^\d{4}-\d{2}-\d{2}$' else period ~ '^\d{4}-\d{2}$' end)
);
comment on table public.lead_counters is
  'The month''s allowance (Qualified leads) and searching budget (usd) per workspace, and the day''s spend per workspace and for the platform (tenant_id null). Locked for update in one fixed order, allowance, budget, day, platform, inside one door, never across a provider or model call (E2).';

create table if not exists public.lead_operations (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind      text not null check (kind in ('undo_search', 'keep', 'exclude', 'put_back', 'include', 'stop')),
  search_id uuid references public.lead_searches (id) on delete cascade,
  lead_ids  uuid[] not null default '{}',
  before    jsonb not null default '{}'::jsonb,
  after     jsonb not null default '{}'::jsonb,
  version   integer not null,
  by        uuid,
  at        timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists lead_operations_search on public.lead_operations (search_id, at desc);
comment on table public.lead_operations is
  'Every undo-able act: what it changed, from what, by whom, when. lead_undo takes the id and the version the client saw and refuses when anyone changed the rows since (E9).';

create table if not exists public.lead_preferences (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  kind         text not null check (kind in ('chain', 'wrong_kind', 'too_far')),
  category_key text,
  example      text check (char_length(example) <= 120),
  from_lead_id uuid references public.leads (id) on delete set null,
  active       boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
comment on table public.lead_preferences is
  'Learned exclusions, scoped to the kind of business (P5). Release C draws them; A1 holds the rows.';

create table if not exists public.lead_suppressions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  kind       text not null check (kind in ('email', 'place', 'phone')),
  hash       text not null,
  what       text not null check (what in ('email_opt_out', 'customer', 'erased')),
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, hash)
);
comment on table public.lead_suppressions is
  'By what happened (S8): an email opt-out stops email to that address (calls stay); a customer is hidden from every search; an erasure hides the place, the number and the address for good. A bounce is email_state = invalid on the lead, never a row here. The hash is lead_suppression_hash().';

/* ------------------------------------------------------- 2. row security -- */

alter table public.lead_platform        enable row level security;
alter table public.lead_niche_priors    enable row level security;
alter table public.lead_searches        enable row level security;
alter table public.lead_rounds          enable row level security;
alter table public.lead_runs            enable row level security;
alter table public.lead_judgments       enable row level security;
alter table public.leads                enable row level security;
alter table public.lead_places          enable row level security;
alter table public.lead_search_members  enable row level security;
alter table public.lead_counters        enable row level security;
alter table public.lead_operations      enable row level security;
alter table public.lead_preferences     enable row level security;
alter table public.lead_suppressions    enable row level security;

-- Members read their workspace's rows (the 00002 shape); nobody signed in
-- writes a row directly. Every write goes through a door below.
drop policy if exists lead_searches_member_select on public.lead_searches;
create policy lead_searches_member_select on public.lead_searches
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_rounds_member_select on public.lead_rounds;
create policy lead_rounds_member_select on public.lead_rounds
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_runs_member_select on public.lead_runs;
create policy lead_runs_member_select on public.lead_runs
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists leads_member_select on public.leads;
create policy leads_member_select on public.leads
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_places_member_select on public.lead_places;
create policy lead_places_member_select on public.lead_places
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_search_members_member_select on public.lead_search_members;
create policy lead_search_members_member_select on public.lead_search_members
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_operations_member_select on public.lead_operations;
create policy lead_operations_member_select on public.lead_operations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_preferences_member_select on public.lead_preferences;
create policy lead_preferences_member_select on public.lead_preferences
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists lead_suppressions_member_select on public.lead_suppressions;
create policy lead_suppressions_member_select on public.lead_suppressions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- The service role's tables: no policy, and the privilege itself refused
-- (tenancy.db.test.mjs wants 42501, not an empty list).
revoke all on public.lead_platform     from public, anon, authenticated;
revoke all on public.lead_niche_priors from public, anon, authenticated;
revoke all on public.lead_judgments    from public, anon, authenticated;
revoke all on public.lead_counters     from public, anon, authenticated;
-- The rest: read only for a session. Supabase's default grant hands
-- authenticated every verb; RLS with no write policy refuses the rows, and
-- the revoke refuses the verb.
revoke insert, update, delete on public.lead_searches, public.lead_rounds, public.lead_runs, public.leads, public.lead_places,
  public.lead_search_members, public.lead_operations, public.lead_preferences, public.lead_suppressions from anon, authenticated;
revoke all on public.lead_searches, public.lead_rounds, public.lead_runs, public.leads, public.lead_places,
  public.lead_search_members, public.lead_operations, public.lead_preferences, public.lead_suppressions from anon;

/* ------------------------------------------------------------- 3. jobs -- */

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check'));

-- A collect is scheduled once per page, however often the webhook, the sweep
-- and the commit each ask for it: the key is the run and the page's seq.
create unique index if not exists jobs_lead_collect_once
  on public.jobs ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect';

/* ----------------------------------------------------------- 4. helpers -- */

create or replace function public.lead_month(p_tenant_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(p_at at time zone t.timezone, 'YYYY-MM') from public.tenants t where t.id = p_tenant_id
$$;
comment on function public.lead_month(uuid, timestamptz) is
  'The workspace''s calendar month of an instant, YYYY-MM, in tenants.timezone: the month a lead counts in and the allowance renews on (15). contracts'' leadMonth() says the same.';
revoke execute on function public.lead_month(uuid, timestamptz) from public, anon;
grant execute on function public.lead_month(uuid, timestamptz) to authenticated, service_role;

create or replace function public.lead_day(p_tenant_id uuid, p_at timestamptz default now())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(p_at at time zone coalesce((select t.timezone from public.tenants t where t.id = p_tenant_id), 'UTC'), 'YYYY-MM-DD')
$$;
comment on function public.lead_day(uuid, timestamptz) is
  'The workspace''s calendar day of an instant, YYYY-MM-DD, in its zone; the platform''s day (tenant null) is UTC. The period of the day counters.';
revoke execute on function public.lead_day(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.lead_searches_on(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.searches_on or p_tenant_id = any (p.tenants_on) from public.lead_platform p where p.id), false)
$$;
comment on function public.lead_searches_on(uuid) is
  'Whether this workspace may search: the platform switch is on, or the workspace is listed in lead_platform.tenants_on (30). Read before every start; ships false for everyone.';
revoke execute on function public.lead_searches_on(uuid) from public, anon;
grant execute on function public.lead_searches_on(uuid) to authenticated, service_role;

create or replace function public.lead_niche_prior(p_category_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('places', n.places, 'matched', n.matched, 'with_email', n.with_email)
    from public.lead_niche_priors n where n.category_key = p_category_key
$$;
comment on function public.lead_niche_prior(text) is
  'The platform-wide prior for a kind of business ({places, matched, with_email}), or null when the kind was never searched. Aggregates only.';
revoke execute on function public.lead_niche_prior(text) from public, anon;
grant execute on function public.lead_niche_prior(text) to authenticated, service_role;

-- ROLE_PERMS (packages/contracts/src/config.ts) in SQL. One derivation per
-- side, held together by lead-engine.db.test.mjs: a permission added to one
-- without the other fails there by name.
create or replace function public.has_permission(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_user and m.tenant_id = p_tenant_id
       and m.role = any (case p_permission
         when 'approve'    then array['owner', 'operator']
         when 'autonomy'   then array['owner', 'operator']
         when 'disconnect' then array['owner']
         when 'billing'    then array['owner']
         when 'team'       then array['owner']
         when 'settings'   then array['owner']
         when 'export'     then array['owner']
         when 'find'       then array['owner']
         else array[]::text[] end)
  )
$$;
comment on function public.has_permission(uuid, uuid, text) is
  'Whether this user may do this in this workspace, by role: contracts'' ROLE_PERMS, restated once in SQL. find (start a search, keep a lead from review, put one back: each spends the month''s allowance) is the owner''s alone.';
revoke execute on function public.has_permission(uuid, uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, uuid, text) to authenticated, service_role;

create or replace function public.lead_suppression_hash(p_tenant_id uuid, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_tenant_id::text || ':' || p_value, 'UTF8')), 'hex')
$$;
comment on function public.lead_suppression_hash(uuid, text) is
  'sha256 hex of "<tenant_id>:<value>", the keyed digest contracts'' erasure.ts computes (leadSuppressionHash), so a hash written here and one written on the edge agree byte for byte.';
revoke execute on function public.lead_suppression_hash(uuid, text) from public, anon, authenticated;

create or replace function public.lead_counter_take(p_tenant_id uuid, p_kind text, p_period text)
returns public.lead_counters
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.lead_counters;
begin
  insert into public.lead_counters (tenant_id, kind, period) values (p_tenant_id, p_kind, p_period)
  on conflict (tenant_id, kind, period) do nothing;
  select * into v from public.lead_counters
   where tenant_id is not distinct from p_tenant_id and kind = p_kind and period = p_period
   for update;
  return v;
end $$;
comment on function public.lead_counter_take(uuid, text, text) is
  'The counter row for a period, made if missing and locked for update. Callers take rows in one order only: allowance, budget, the workspace''s day, the platform''s day (E2).';
revoke execute on function public.lead_counter_take(uuid, text, text) from public, anon, authenticated;

create or replace function public.lead_renews_on(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select to_char(date_trunc('month', now() at time zone t.timezone) + interval '1 month', 'Mon FMDD') from public.tenants t where t.id = p_tenant_id
$$;
comment on function public.lead_renews_on(uuid) is 'The first day of the workspace''s next calendar month, as the sentence says it: "Oct 1".';
revoke execute on function public.lead_renews_on(uuid) from public, anon, authenticated;

-- Reserve a round's target and estimate, or say which cap binds. Counters are
-- taken in one fixed order and the whole reservation is one statement's
-- worth of locks; a refusal writes nothing but the counter rows themselves.
create or replace function public.lead_reserve(p_tenant_id uuid, p_month text, p_day text, p_leads integer, p_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance public.lead_counters;
  v_budget    public.lead_counters;
  v_day       public.lead_counters;
  v_platform  public.lead_counters;
  v_left      numeric;
begin
  v_allowance := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  if v_allowance.used + v_allowance.reserved + p_leads > 500 then
    v_left := greatest(500 - v_allowance.used - v_allowance.reserved, 0);
    return jsonb_build_object('error', 'month_leads_used', 'left', v_left::integer,
      'sentence', case when v_left <= 0
        then 'You have found this month''s 500 leads. Your leads renew on ' || public.lead_renews_on(p_tenant_id) || '.'
        else 'You have ' || v_left::integer || ' leads left this month. Find ' || v_left::integer || ' now, or all ' || p_leads || ' when your leads renew on ' || public.lead_renews_on(p_tenant_id) || '?' end);
  end if;
  v_budget := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  if v_budget.used + v_budget.reserved + p_usd > 25 then
    v_left := greatest(25 - v_budget.used - v_budget.reserved, 0);
    return jsonb_build_object('error', 'budget_used', 'left_usd', v_left,
      'sentence', 'This month''s searching is nearly used up. Try a smaller search, or a phone standard; it renews on ' || public.lead_renews_on(p_tenant_id) || '.');
  end if;
  v_day := public.lead_counter_take(p_tenant_id, 'day', p_day);
  if v_day.used + v_day.reserved + p_usd > 10 then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.');
  end if;
  v_platform := public.lead_counter_take(null, 'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  if v_platform.used + v_platform.reserved + p_usd > 50 then
    return jsonb_build_object('error', 'day_cap', 'sentence', 'Searching is busy today. Try again tomorrow.');
  end if;
  update public.lead_counters set reserved = reserved + p_leads, updated_at = now() where id = v_allowance.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_budget.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_day.id;
  update public.lead_counters set reserved = reserved + p_usd,   updated_at = now() where id = v_platform.id;
  return null;
end $$;
comment on function public.lead_reserve(uuid, text, text, integer, numeric) is
  'Reserves p_leads from the month''s allowance (500) and p_usd from the month''s budget ($25), the workspace''s day ($10) and the platform''s day ($50), in that lock order; null when reserved, else {error, sentence} naming the cap that binds (§0.2, §13.3).';
revoke execute on function public.lead_reserve(uuid, text, text, integer, numeric) from public, anon, authenticated;

create or replace function public.lead_release(p_tenant_id uuid, p_month text, p_day text, p_leads integer, p_usd numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.lead_counters;
begin
  v := public.lead_counter_take(p_tenant_id, 'allowance', p_month);
  update public.lead_counters set reserved = greatest(reserved - p_leads, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'day', p_day);
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(null, 'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  update public.lead_counters set reserved = greatest(reserved - p_usd, 0), updated_at = now() where id = v.id;
end $$;
comment on function public.lead_release(uuid, text, text, integer, numeric) is
  'Gives back what a round reserved and did not use, in the same lock order as lead_reserve. Never below zero.';
revoke execute on function public.lead_release(uuid, text, text, integer, numeric) from public, anon, authenticated;

-- Usage settles against the cost reservation: what was reserved moves to used
-- up to the reservation, and past it only used grows (retries and failed
-- runs included, 27).
create or replace function public.lead_settle_usage(p_tenant_id uuid, p_month text, p_day text, p_delta numeric, p_outstanding numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v      public.lead_counters;
  v_take numeric := least(greatest(p_delta, 0), greatest(p_outstanding, 0));
begin
  if p_delta <= 0 then return; end if;
  v := public.lead_counter_take(p_tenant_id, 'budget', p_month);
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(p_tenant_id, 'day', p_day);
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
  v := public.lead_counter_take(null, 'day', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
  update public.lead_counters set used = used + p_delta, reserved = greatest(reserved - v_take, 0), updated_at = now() where id = v.id;
end $$;
comment on function public.lead_settle_usage(uuid, text, text, numeric, numeric) is
  'A run''s new usage, settled against the month''s budget and both day counters: used grows by the delta; reserved shrinks by what the round still had outstanding.';
revoke execute on function public.lead_settle_usage(uuid, text, text, numeric, numeric) from public, anon, authenticated;

-- What blanking clears, named once (§0.4 take the least; §12.4 retention). An
-- allow-list: what a lead KEEPS is listed here, and everything else goes.
create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now())
   where id = p_lead_id;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  return v_n;
end $$;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';
revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;

/* ------------------------------------------------------------ 5. guards -- */

create or replace function public.lead_rounds_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.state <> 'queued' then
      raise exception 'a round starts queued (% refused)', NEW.state;
    end if;
    if exists (select 1 from public.lead_rounds r where r.search_id = NEW.search_id and r.state <> 'ended') then
      raise exception 'one live round per search';
    end if;
    -- Carry on, Try again, a top-up and Find new ones make a NEW round from an
    -- ended one, and only a signed-in person may: the edge and the sweep hold
    -- the service key, and they never revive a search (§12.3).
    if NEW.seq > 1 and auth.uid() is null then
      raise exception 'only a signed-in person may start a round after an ended one';
    end if;
    return NEW;
  end if;
  if OLD.state = 'ended' then
    raise exception 'a round is final once ended (% refused)', case when NEW.state is distinct from OLD.state then NEW.state else 'a change' end;
  end if;
  if NEW.state is distinct from OLD.state then
    if not (
         (OLD.state = 'queued'           and NEW.state in ('probing', 'running', 'ended'))
      or (OLD.state = 'probing'          and NEW.state in ('waiting_on_owner', 'running', 'checking', 'ended'))
      or (OLD.state = 'waiting_on_owner' and NEW.state in ('running', 'ended'))
      or (OLD.state = 'running'          and NEW.state in ('checking', 'ended'))
      or (OLD.state = 'checking'         and NEW.state in ('ended'))
    ) then
      raise exception 'lead_rounds.state % -> % refused', OLD.state, NEW.state;
    end if;
  end if;
  -- The plan a round runs is the plan it ran, except the one amendment
  -- Include makes while the round waits (§0.5 the only in-place change).
  if NEW.plan is distinct from OLD.plan or NEW.plan_version is distinct from OLD.plan_version then
    if OLD.state <> 'waiting_on_owner' or NEW.plan_version <> OLD.plan_version + 1 then
      raise exception 'a round''s plan changes only while it waits on the owner, as the next version';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists lead_rounds_guard on public.lead_rounds;
create trigger lead_rounds_guard before insert or update on public.lead_rounds
  for each row execute function public.lead_rounds_guard();
comment on function public.lead_rounds_guard() is
  'queued -> probing | running | ended; probing -> waiting_on_owner | running | checking | ended; waiting_on_owner -> running | ended; running -> checking | ended; checking -> ended; ended is final. One live round per search; a later round needs a signed-in person; the plan changes only while waiting, as version + 1.';
revoke execute on function public.lead_rounds_guard() from public, anon, authenticated;

create or replace function public.lead_runs_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.claimed_by is not null and NEW.claimed_by is distinct from OLD.claimed_by then
    raise exception 'a run''s claim is never rewritten (E1)';
  end if;
  if NEW.webhook_token_hash is distinct from OLD.webhook_token_hash then
    raise exception 'a run''s webhook token is made once and never rewritten (E1)';
  end if;
  if OLD.state in ('succeeded', 'failed', 'aborted', 'timed_out') and NEW.state is distinct from OLD.state then
    raise exception 'lead_runs.state is terminal (% -> % refused)', OLD.state, NEW.state;
  end if;
  return NEW;
end $$;
drop trigger if exists lead_runs_guard on public.lead_runs;
create trigger lead_runs_guard before update on public.lead_runs
  for each row execute function public.lead_runs_guard();
comment on function public.lead_runs_guard() is
  'The claim and the webhook token are written once; succeeded, failed, aborted and timed_out are final. The offset, the lease and the usage still move on a finished run: the final collect reads what is left.';
revoke execute on function public.lead_runs_guard() from public, anon, authenticated;

-- An erased person takes their leads with them (§0.4): every lead linked to
-- the contact is blanked, and its place, number and address are hashed onto
-- the never-again list first, so no search finds them again.
create or replace function public.leads_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    for r in select l.id, l.place_id, l.phone_e164, l.email from public.leads l where l.tenant_id = NEW.tenant_id and l.contact_id = NEW.id loop
      if r.place_id is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'place', public.lead_suppression_hash(NEW.tenant_id, r.place_id), 'erased') on conflict do nothing;
      end if;
      if r.phone_e164 is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'phone', public.lead_suppression_hash(NEW.tenant_id, r.phone_e164), 'erased') on conflict do nothing;
      end if;
      if r.email is not null then
        insert into public.lead_suppressions (tenant_id, kind, hash, what) values (NEW.tenant_id, 'email', public.lead_suppression_hash(NEW.tenant_id, r.email), 'erased') on conflict do nothing;
      end if;
      perform public.lead_blank(r.id);
      update public.leads set erased_at = now() where id = r.id;
    end loop;
  end if;
  return NEW;
end $$;
revoke execute on function public.leads_erase_on_contact() from public, anon, authenticated;
drop trigger if exists contacts_erase_blanks_leads on public.contacts;
create trigger contacts_erase_blanks_leads
  after update of erased_at on public.contacts
  for each row execute function public.leads_erase_on_contact();
comment on function public.leads_erase_on_contact() is
  'When a person is erased, each lead linked to them is hashed onto lead_suppressions as erased (place, phone, email) and blanked through lead_blank.';

-- A person who writes or calls in, whose number or address a lead holds, IS
-- that lead: the lead links to them and converts (§0.4, 25). Only the edge
-- makes such a person (auth.uid() is null); the desk's Add a person never
-- links, and a stage click never converts.
create or replace function public.lead_link_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  begin
    if auth.uid() is not null then return null; end if;
    if NEW.erased_at is not null or NEW.merged_into_contact_id is not null then return null; end if;
    if NEW.phone_e164 is null and NEW.email is null then return null; end if;
    select l.id into v_lead from public.leads l
     where l.tenant_id = NEW.tenant_id and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       and ((NEW.phone_e164 is not null and l.phone_e164 = NEW.phone_e164) or (NEW.email is not null and l.email = NEW.email))
     order by l.found_at desc
     limit 1;
    if v_lead is null then return null; end if;
    update public.leads
       set contact_id = NEW.id, stage = 'converted', closed_reason = null, converted_at = now(), contacted_at = coalesce(contacted_at, now())
     where id = v_lead;
    if not exists (select 1 from public.events e where e.tenant_id = NEW.tenant_id and e.subject_type = 'contact' and e.subject_id = NEW.id and e.kind = 'contact.added') then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (NEW.tenant_id, 'contact.added', 'contact', 'contact', NEW.id, jsonb_build_object('source', 'lead'));
    end if;
  exception when others then
    raise warning 'lead_link_contact: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.lead_link_contact() from public, anon, authenticated;
drop trigger if exists contacts_link_lead on public.contacts;
create trigger contacts_link_lead after insert on public.contacts
  for each row execute function public.lead_link_contact();
comment on function public.lead_link_contact() is
  'A person the edge makes from a message or a call, whose number or address a lead holds, links that lead and converts it; the event that says where they came from reads "a lead you found". A signed-in caller''s insert never links.';

/* ----------------------------------------------------- 6. service RPCs -- */

create or replace function public.lead_run_claim(p_run_id uuid, p_owner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set claimed_by = p_owner, claimed_at = now(), state = 'starting'
   where id = p_run_id and claimed_by is null and state = 'claimed';
  return found;
end $$;
comment on function public.lead_run_claim(uuid, text) is
  'The dispatch claim (E1): the run row is taken by one owner token before any provider call; a second start finds it taken and does nothing. True once, for the claimer.';

create or replace function public.lead_run_record_start(p_run_id uuid, p_owner text, p_apify_run_id text, p_dataset_id text, p_cap_usd numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set apify_run_id = p_apify_run_id, dataset_id = p_dataset_id, cap_usd = p_cap_usd, state = 'running'
   where id = p_run_id and claimed_by = p_owner and state = 'starting';
  return found;
end $$;
comment on function public.lead_run_record_start(uuid, text, text, text, numeric) is
  'The claimer records the provider''s answer: the run id, its dataset and the cap it was started with. Only the claimer, only from starting.';

create or replace function public.lead_run_mark_unknown(p_run_id uuid, p_owner text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set state = 'unknown'
   where id = p_run_id and claimed_by = p_owner and state = 'starting';
  return found;
end $$;
comment on function public.lead_run_mark_unknown(uuid, text) is
  'The start''s answer was lost: the run is unknown, reconciled by the sweep from the provider''s own list, never blindly started again (E1).';

create or replace function public.lead_run_reconcile(p_run_id uuid, p_apify_run_id text, p_dataset_id text, p_state text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('running', 'succeeded', 'failed', 'aborted', 'timed_out') then
    raise exception 'a reconciled run is running or finished (% refused)', p_state using errcode = '22023';
  end if;
  update public.lead_runs
     set apify_run_id = p_apify_run_id, dataset_id = p_dataset_id, state = p_state,
         finished_at = case when p_state = 'running' then null else coalesce(finished_at, now()) end
   where id = p_run_id and state = 'unknown';
  return found;
end $$;
comment on function public.lead_run_reconcile(uuid, text, text, text) is
  'The sweep found the unknown run in the provider''s list (ours carry the run row id in their input): record it and its state. Only from unknown.';

create or replace function public.lead_run_lease(p_run_id uuid, p_owner text, p_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gen integer;
begin
  update public.lead_runs
     set lease_owner = p_owner, lease_until = now() + make_interval(secs => p_seconds)
   where id = p_run_id and (lease_until is null or lease_until < now() or lease_owner = p_owner)
  returning lease_gen into v_gen;
  return v_gen;
end $$;
comment on function public.lead_run_lease(uuid, text, integer) is
  'Takes or renews the collect lease on a run: free, run out, or already this owner''s. Returns the generation the owner must present to commit; null when another owner holds it (E3).';

create or replace function public.lead_run_release(p_run_id uuid, p_owner text, p_gen integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lead_runs set lease_owner = null, lease_until = null
   where id = p_run_id and lease_owner = p_owner and lease_gen = p_gen;
  return found;
end $$;
comment on function public.lead_run_release(uuid, text, integer) is
  'Releases a lease, conditional on the owner and the generation: an old collector cannot release a newer one''s (E3).';

create or replace function public.lead_round_end(p_round_id uuid, p_ending text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.lead_rounds;
begin
  if p_ending not in ('target_reached', 'searched_everything', 'month_leads_used', 'budget_used', 'few_new_matches', 'stopped', 'source_failed', 'question_unanswered', 'paused') then
    raise exception 'not one of the nine endings: %', p_ending using errcode = '22023';
  end if;
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or r.state = 'ended' then
    return false;
  end if;
  update public.lead_rounds
     set state = 'ended', ending = p_ending, ended_at = now(), waiting_since = null
   where id = p_round_id;
  perform public.lead_release(r.tenant_id, r.month, r.day,
    greatest(r.allowance_reserved - r.allowance_used, 0), greatest(r.cost_reserved_usd - r.cost_usd, 0));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'lead.round', 'lead', 'lead_round', p_round_id,
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'ended', 'ending', p_ending,
                             'counted', r.allowance_used, 'cost_usd', r.cost_usd));
  return true;
end $$;
comment on function public.lead_round_end(uuid, text) is
  'Ends a round with one of the nine endings: state ended, ended_at, and what it reserved and did not use goes back to the counters. True once; false when already ended.';

-- One page of one run, as one transaction (E4): the lease and the offset are
-- checked first, then the judgment is kept by operation id, the places become
-- leads and members, Qualified members count against the round's reservation
-- up to what it reserved, the usage settles, the offset moves, the next job is
-- written once, the round moves, the events are appended.
create or replace function public.lead_collect_commit(p_run_id uuid, p_owner text, p_gen integer, p_from_offset integer, p_to_offset integer, p_page jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       public.lead_runs;
  v_round     public.lead_rounds;
  v_room      integer;
  v_counted   integer := 0;
  v_qualified integer := 0;
  v_review    integer := 0;
  v_excluded  integer := 0;
  v_month     text;
  v_usage     numeric;
  v_delta     numeric;
  v_n         integer;
  v_j         jsonb;
  v_el        jsonb;
  v_pl        jsonb;
  v_m         jsonb;
  v_dup       text;
  v_lead      uuid;
  v_class     text;
  v_next      jsonb;
  v_r         jsonb;
  v_state     text;
  v_counter   public.lead_counters;
begin
  select * into v_run from public.lead_runs where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  if v_run.lease_owner is distinct from p_owner or v_run.lease_gen <> p_gen then
    return jsonb_build_object('ok', false, 'why', 'lease');
  end if;
  if v_run.read_offset <> p_from_offset then
    return jsonb_build_object('ok', false, 'why', 'offset');
  end if;
  select * into v_round from public.lead_rounds where id = v_run.round_id for update;
  if v_round.state = 'ended' then
    return jsonb_build_object('ok', false, 'why', 'ended');
  end if;
  v_month := v_round.month;
  v_room  := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);

  -- The judge's answers for the page's batches, kept once each by op_id.
  for v_j in select * from jsonb_array_elements(
      case jsonb_typeof(p_page->'judgment') when 'array' then p_page->'judgment'
           when 'object' then jsonb_build_array(p_page->'judgment') else '[]'::jsonb end) loop
    insert into public.lead_judgments (tenant_id, round_id, batch, op_id, request_hash, answer, model, tokens)
    values (v_round.tenant_id, v_round.id, coalesce((v_j->>'batch')::integer, 0), v_j->>'op_id', v_j->>'request_hash',
            coalesce(v_j->'answer', '{}'::jsonb), v_j->>'model', coalesce((v_j->>'tokens')::integer, 0))
    on conflict (op_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      update public.lead_rounds
         set judge_tokens = judge_tokens + coalesce((v_j->>'tokens')::integer, 0),
             judge_model  = coalesce(v_j->>'model', judge_model)
       where id = v_round.id;
    end if;
  end loop;

  -- The places: a lead by place id (once), a duplicate listing folded into
  -- the lead it belongs to, a membership (once), the count.
  for v_el in select * from jsonb_array_elements(coalesce(p_page->'places', '[]'::jsonb)) loop
    v_pl  := v_el->'place';
    v_m   := v_el->'member';
    v_dup := v_el->>'duplicate_of_place_id';
    if v_pl->>'place_id' is null then continue; end if;
    -- Never a place, number or address on the never-again list: a customer
    -- is hidden from every search, an erased person from everything (S8).
    if exists (select 1 from public.lead_suppressions s where s.tenant_id = v_round.tenant_id and (
           (s.kind = 'place' and s.what in ('customer', 'erased') and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'place_id'))
        or (s.kind = 'phone' and s.what = 'erased' and v_pl->>'phone_e164' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'phone_e164'))
        or (s.kind = 'email' and s.what = 'erased' and v_pl->>'email' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'email')))) then
      continue;
    end if;
    v_lead := null;
    if v_dup is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = v_round.tenant_id and l.blanked_at is null and l.erased_at is null
         and (l.place_id = v_dup or exists (select 1 from public.lead_places p where p.tenant_id = l.tenant_id and p.lead_id = l.id and p.place_id = v_dup))
       limit 1;
      if v_lead is not null then
        insert into public.lead_places (lead_id, tenant_id, place_id, title, street)
        values (v_lead, v_round.tenant_id, v_pl->>'place_id', left(v_pl->>'business_name', 200), left(v_pl->>'street', 200))
        on conflict (tenant_id, place_id) do nothing;
      end if;
    end if;
    if v_lead is null then
      insert into public.leads (tenant_id, place_id, business_name, category, street, city, region, postal_code, country, lat, lng,
                                website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer)
      on conflict (tenant_id, place_id) where place_id is not null do nothing;
      select l.id into v_lead from public.leads l where l.tenant_id = v_round.tenant_id and l.place_id = v_pl->>'place_id';
    end if;
    if v_lead is null then continue; end if;
    v_class := coalesce(v_m->>'class', 'review');
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, excluded_by, fit, reason, distance_m)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            coalesce(v_m->'judgment', '{}'::jsonb) || jsonb_build_object('shares', coalesce(v_el->'shares', '[]'::jsonb)),
            v_class, v_m->>'excluded_by', v_m->>'fit', coalesce(left(v_m->>'reason', 120), ''), (v_m->>'distance_m')::integer)
    on conflict (search_id, lead_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    if v_class = 'qualified' then
      v_qualified := v_qualified + 1;
      if v_room > 0 then
        update public.lead_search_members set counted = true, counted_month = v_month
         where search_id = v_round.search_id and lead_id = v_lead;
        v_room := v_room - 1;
        v_counted := v_counted + 1;
      end if;
    elsif v_class = 'review' then
      v_review := v_review + 1;
    else
      v_excluded := v_excluded + 1;
    end if;
  end loop;

  -- Delivery settles against the reservation (E2): the round's used grows,
  -- the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = v_round.id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;

  -- The run's usage so far, as the provider reports it; only what is new
  -- settles.
  v_usage := (p_page->>'usage_usd')::numeric;
  if v_usage is not null and v_usage > v_run.usage_usd then
    v_delta := v_usage - v_run.usage_usd;
    perform public.lead_settle_usage(v_round.tenant_id, v_month, v_round.day, v_delta, v_round.cost_reserved_usd - v_round.cost_usd);
    update public.lead_rounds set cost_usd = cost_usd + v_delta where id = v_round.id;
    update public.lead_runs set usage_usd = v_usage where id = p_run_id;
  end if;

  -- The offset moves (compare-and-set held above), the run's state follows
  -- the provider's, and the next collect is written once.
  update public.lead_runs
     set read_offset = p_to_offset,
         items_seen  = coalesce((p_page->>'items_seen')::integer, items_seen),
         state       = coalesce(p_page->>'run_state', state),
         finished_at = case when coalesce(p_page->>'run_state', state) in ('succeeded', 'failed', 'aborted', 'timed_out') then coalesce(finished_at, now()) else finished_at end
   where id = p_run_id;
  v_next := p_page->'next';
  if v_next is not null and jsonb_typeof(v_next) = 'object' then
    if v_next->>'kind' = 'lead_check' then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_check', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'batch', coalesce((v_next->>'batch')::integer, 1)));
    else
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_collect', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('run_id', p_run_id, 'seq', coalesce(v_next->>'seq', 'p' || p_to_offset)))
      on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' do nothing;
    end if;
  end if;

  -- The round: a bigger target once the probe passed, the question, the
  -- pending ending, a state, or its ending (which releases and records).
  v_r := coalesce(p_page->'round', '{}'::jsonb);
  if v_r->>'target' is not null then
    update public.lead_rounds set target = greatest((v_r->>'target')::integer, target) where id = v_round.id;
  end if;
  if v_r->>'ending_pending' is not null then
    update public.lead_rounds set ending_pending = v_r->>'ending_pending' where id = v_round.id;
  end if;
  if v_r->'question' is not null and jsonb_typeof(v_r->'question') = 'object' then
    update public.lead_rounds set question = v_r->'question', waiting_since = now() where id = v_round.id;
  end if;
  if v_r->>'ending' is not null then
    perform public.lead_round_end(v_round.id, v_r->>'ending');
  elsif v_r->>'state' is not null and v_r->>'state' <> v_round.state then
    update public.lead_rounds
       set state = v_r->>'state', started_at = coalesce(started_at, now())
     where id = v_round.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_round.tenant_id, 'lead.round', 'lead', 'lead_round', v_round.id,
            jsonb_build_object('search_id', v_round.search_id, 'seq', v_round.seq, 'state', v_r->>'state'));
  end if;
  select state into v_state from public.lead_rounds where id = v_round.id;
  return jsonb_build_object('ok', true, 'counted', v_counted, 'qualified', v_qualified, 'review', v_review, 'excluded', v_excluded, 'round_state', v_state);
end $$;
comment on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) is
  'One page of one run, in one transaction (E4). Refuses {ok:false, why} on a stale lease, a wrong offset or an ended round. Keeps judgments by op_id, inserts leads (once per place id) and members (once per search), counts Qualified members up to the round''s reservation, settles usage, advances the offset, writes the next job once, moves the round, appends the events. Replayed with the same offset it does nothing twice; replayed after the offset moved it is refused.';

create or replace function public.lead_check_commit(p_round_id uuid, p_results jsonb, p_usage_usd numeric, p_last boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round   public.lead_rounds;
  v_r       jsonb;
  v_m       record;
  v_newly   integer := 0;
  v_counted integer := 0;
  v_room    integer;
  v_counter public.lead_counters;
  v_ended   boolean := false;
begin
  select * into v_round from public.lead_rounds where id = p_round_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'round');
  end if;
  v_room := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);
  for v_r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    update public.leads
       set email_state = v_r->>'email_state', email_checked_at = coalesce((v_r->>'checked_at')::timestamptz, now())
     where id = (v_r->>'lead_id')::uuid and tenant_id = v_round.tenant_id
       and (v_r->>'email_state') in ('ok', 'catch_all', 'unknown', 'invalid');
  end loop;
  -- A member the email standard alone held back, whose address now checks
  -- out, qualifies and counts: from the round's reservation first, then from
  -- the month's allowance, else it waits in review.
  for v_m in
    select m.search_id, m.lead_id, m.judgment
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.round_id = p_round_id and m.class = 'review' and m.blanked_at is null and l.email_state = 'ok'
       and jsonb_typeof(m.judgment->'reasons') = 'array'
       and jsonb_array_length(m.judgment->'reasons') > 0
       and not exists (select 1 from jsonb_array_elements_text(m.judgment->'reasons') x where x not like 'email:%')
  loop
    if v_room > 0 then
      v_room := v_room - 1;
    else
      v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_round.month);
      if v_counter.used + v_counter.reserved + 1 > 500 then
        continue;
      end if;
      update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
      update public.lead_rounds set allowance_reserved = allowance_reserved + 1 where id = p_round_id;
    end if;
    update public.lead_search_members
       set class = 'qualified', counted = true, counted_month = v_round.month, version = version + 1,
           judgment = judgment || jsonb_build_object('reasons', '[]'::jsonb)
     where search_id = v_m.search_id and lead_id = v_m.lead_id;
    v_newly := v_newly + 1;
    v_counted := v_counted + 1;
  end loop;
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = p_round_id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_round.month);
    update public.lead_counters set used = used + least(v_counted, greatest(v_round.allowance_reserved - v_round.allowance_used, 0)),
                                    reserved = greatest(reserved - least(v_counted, greatest(v_round.allowance_reserved - v_round.allowance_used, 0)), 0),
                                    updated_at = now()
     where id = v_counter.id;
  end if;
  if coalesce(p_usage_usd, 0) > 0 then
    perform public.lead_settle_usage(v_round.tenant_id, v_round.month, v_round.day, p_usage_usd, v_round.cost_reserved_usd - v_round.cost_usd);
    update public.lead_rounds set cost_usd = cost_usd + p_usage_usd where id = p_round_id;
  end if;
  if p_last then
    select * into v_round from public.lead_rounds where id = p_round_id;
    v_ended := public.lead_round_end(p_round_id, coalesce(v_round.ending_pending,
      case when v_round.allowance_used >= v_round.target then 'target_reached' else 'searched_everything' end));
  end if;
  return jsonb_build_object('ok', true, 'qualified', v_newly, 'counted', v_counted, 'ended', v_ended);
end $$;
comment on function public.lead_check_commit(uuid, jsonb, numeric, boolean) is
  'A batch of mailbox answers ([{lead_id, email_state, checked_at}]): each lead''s state is set; a member of the round held in review by the email standard alone, now ok, qualifies and counts through the reservation; the usage settles; the last batch ends the round with the ending the collect left pending.';

revoke execute on function public.lead_run_claim(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_run_record_start(uuid, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.lead_run_mark_unknown(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_run_reconcile(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.lead_run_lease(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.lead_run_release(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.lead_round_end(uuid, text) from public, anon, authenticated;
revoke execute on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.lead_check_commit(uuid, jsonb, numeric, boolean) from public, anon, authenticated;
grant execute on function public.lead_run_claim(uuid, text), public.lead_run_record_start(uuid, text, text, text, numeric),
  public.lead_run_mark_unknown(uuid, text), public.lead_run_reconcile(uuid, text, text, text), public.lead_run_lease(uuid, text, integer),
  public.lead_run_release(uuid, text, integer), public.lead_round_end(uuid, text), public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb),
  public.lead_check_commit(uuid, jsonb, numeric, boolean) to service_role;

/* ------------------------------------------------------------- 7. doors -- */

-- The plan's shape, as the door checks it: the route checked it with
-- LeadSearchPlanSchema already, and a shape the door will store is the door's
-- to refuse (a caller's bug: raised, not a sentence).
create or replace function public.lead_plan_check(p_plan jsonb)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then raise exception 'plan: an object' using errcode = '22023'; end if;
  if p_plan->>'card' is null then raise exception 'plan.card' using errcode = '22023'; end if;
  if coalesce(char_length(p_plan->>'name'), 0) not between 2 and 80 then raise exception 'plan.name' using errcode = '22023'; end if;
  if coalesce(char_length(p_plan->>'asked'), 0) not between 1 and 400 then raise exception 'plan.asked' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'terms') <> 'array' or jsonb_array_length(p_plan->'terms') not between 1 and 5 then raise exception 'plan.terms' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'area') <> 'object' or p_plan->'area'->>'label' is null or p_plan->'area'->>'state' !~ '^[A-Z]{2}$'
     or p_plan->'area'->>'kind' not in ('zip', 'city', 'radius') or coalesce((p_plan->'area'->>'radius_m')::integer, 0) <= 0
     or (jsonb_typeof(p_plan->'area'->'center') <> 'null' and (p_plan->'area'->'center'->>'lat' is null or p_plan->'area'->'center'->>'lng' is null)) then
    raise exception 'plan.area' using errcode = '22023';
  end if;
  if coalesce((p_plan->>'count')::integer, 0) not between 1 and 1000 then raise exception 'plan.count' using errcode = '22023'; end if;
  if p_plan->>'contact' not in ('phone', 'email') then raise exception 'plan.contact' using errcode = '22023'; end if;
  if jsonb_typeof(p_plan->'criteria') <> 'array' then raise exception 'plan.criteria' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_plan->'criteria') loop
    if v->>'key' !~ '^[a-z][a-z0-9_]{0,39}$' or v->>'text' is null or v->>'standard' not in ('likely', 'seen') or jsonb_typeof(v->'required') <> 'boolean' then
      raise exception 'plan.criteria[]' using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(p_plan->'exclusions') <> 'array' then raise exception 'plan.exclusions' using errcode = '22023'; end if;
  for v in select * from jsonb_array_elements(p_plan->'exclusions') loop
    if v->>'key' !~ '^[a-z][a-z0-9_]{0,39}$' or v->>'text' is null or v->>'origin' not in ('claude', 'you_said') then
      raise exception 'plan.exclusions[]' using errcode = '22023';
    end if;
  end loop;
end $$;
comment on function public.lead_plan_check(jsonb) is 'Raises 22023 naming the key when a plan is not the shape LeadSearchPlanSchema describes.';
revoke execute on function public.lead_plan_check(jsonb) from public, anon, authenticated;

create or replace function public.lead_search_create(p_tenant_id uuid, p_plan jsonb, p_via text, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_count  integer;
  v_month  text;
  v_day    text;
  v_err    jsonb;
  v_search uuid;
  v_round  uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can find businesses for you.' using errcode = '42501';
  end if;
  if p_via not in ('people', 'ask') then
    raise exception 'via is people or ask' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
  end if;
  perform public.lead_plan_check(p_plan);
  if coalesce((p_plan->>'version')::integer, 0) <> 1 then
    raise exception 'a new search starts at plan version 1' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;

  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  -- An unapproved card never runs for an owner (28). The ask is logged as
  -- demand: the words, never a place.
  if p_plan->>'card' <> 'local_businesses' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.no_card', 'lead', 'lead_search', null,
            jsonb_build_object('card', left(p_plan->>'card', 40), 'asked', left(p_plan->>'asked', 400), 'by', v_user));
    return jsonb_build_object('error', 'no_card', 'sentence', 'I can find local businesses for now.');
  end if;

  v_month := public.lead_month(p_tenant_id, now());
  v_day   := public.lead_day(p_tenant_id, now());
  v_err   := public.lead_reserve(p_tenant_id, v_month, v_day, v_count, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;

  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, v_user, p_via, p_plan->>'card', left(p_plan->>'name', 120), p_plan->>'asked', p_plan)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day)
  values (p_tenant_id, v_search, 1, 'probe', p_plan, 1, least(25, v_count), 'queued', v_count, p_estimate_usd, v_month, v_day)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', v_search, 'seq', 1, 'state', 'queued', 'purpose', 'probe', 'target', least(25, v_count), 'by', v_user));
  return jsonb_build_object('search_id', v_search, 'round_id', v_round);
end $$;
comment on function public.lead_search_create(uuid, jsonb, text, numeric) is
  'Owner. Checks the plan (version 1, the shape), the switch ({error: paused}), the card ({error: no_card}, logged as demand), then in one transaction reserves the count from the month''s allowance and the estimate from the budget and both day caps ({error: month_leads_used | budget_used | day_cap}, each with a sentence), inserts the search, its probe round (seq 1, target least(25, count)), the start job and the event. Returns {search_id, round_id}.';

create or replace function public.lead_round_answer(p_round_id uuid, p_answer text, p_plan jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  r       public.lead_rounds;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_answer not in ('keep', 'include', 'stop') then
    raise exception 'answer is keep, include or stop' using errcode = '22023';
  end if;
  select * into r from public.lead_rounds where id = p_round_id for update;
  if not found or not public.has_permission(v_user, r.tenant_id, 'find') then
    raise exception 'Round not found.' using errcode = 'P0002';
  end if;
  if r.state <> 'waiting_on_owner' then
    return jsonb_build_object('error', 'state', 'state', r.state);
  end if;
  if p_answer = 'stop' then
    update public.lead_rounds set answered = 'stop' where id = p_round_id;
    perform public.lead_round_end(p_round_id, 'stopped');
    return jsonb_build_object('round_id', p_round_id, 'state', 'ended');
  end if;
  if p_answer = 'include' then
    if p_plan is null then
      raise exception 'include carries the amended plan' using errcode = '22023';
    end if;
    perform public.lead_plan_check(p_plan);
    if coalesce((p_plan->>'version')::integer, 0) <> r.plan_version + 1 then
      raise exception 'the amended plan is version %', r.plan_version + 1 using errcode = '22023';
    end if;
    update public.lead_searches set plan = p_plan where id = r.search_id;
    update public.lead_rounds set plan = p_plan, plan_version = r.plan_version + 1 where id = p_round_id;
  end if;
  update public.lead_rounds
     set state = 'running', answered = p_answer, waiting_since = null,
         target = greatest(target, (coalesce(p_plan, r.plan)->>'count')::integer)
   where id = p_round_id;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (r.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', p_round_id, 'resume', true));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'lead.round', 'lead', 'lead_round', p_round_id,
          jsonb_build_object('search_id', r.search_id, 'seq', r.seq, 'state', 'running', 'answered', p_answer, 'by', v_user));
  return jsonb_build_object('round_id', p_round_id, 'state', 'running');
end $$;
comment on function public.lead_round_answer(uuid, text, jsonb) is
  'Owner answers the question after 25 on a round waiting on them. keep: the round runs on (a resume job for the same round); include: the amended plan (version + 1) is stored on the search and the round, then as keep; stop: the round ends stopped. {error: state} when the round is not waiting.';

create or replace function public.lead_round_stop(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  s        public.lead_searches;
  r        public.lead_rounds;
  v_rounds integer := 0;
  v_runs   integer := 0;
  v_live   integer;
  run      record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.is_acting_member(s.tenant_id) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  for r in select * from public.lead_rounds where search_id = p_search_id and state <> 'ended' for update loop
    v_rounds := v_rounds + 1;
    v_live := 0;
    for run in select * from public.lead_runs where round_id = r.id and purpose = 'discover' and state in ('claimed', 'starting', 'running', 'unknown') for update loop
      -- The generation moves: a late worker's commit is refused (E3).
      update public.lead_runs set lease_gen = lease_gen + 1 where id = run.id;
      if run.state = 'running' then
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (r.tenant_id, 'lead_collect', now(), jsonb_build_object('run_id', run.id, 'seq', 'stop'))
        on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' do nothing;
        v_live := v_live + 1;
      end if;
      v_runs := v_runs + 1;
    end loop;
    update public.lead_rounds set ending_pending = 'stopped' where id = r.id;
    -- Nothing running on the provider, and no emails being checked: the round
    -- ends now. Otherwise the collect that aborts the run, or the last check
    -- batch, ends it stopped (17: the emails of leads found are still checked).
    if v_live = 0 and r.state <> 'checking' then
      perform public.lead_round_end(r.id, 'stopped');
    end if;
  end loop;
  return jsonb_build_object('rounds', v_rounds, 'runs', v_runs);
end $$;
comment on function public.lead_round_stop(uuid) is
  'Operator. For every live round of the search: bumps the lease generation of its live runs, schedules a stop collect for each running discover run, records the ending as pending stopped; a round with nothing running and no checks out ends stopped at once. The strip says "Stopping · checking the emails" while the rest finish.';

create or replace function public.lead_search_more(p_search_id uuid, p_purpose text, p_plan jsonb, p_estimate_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  last      public.lead_rounds;
  v_count   integer;
  v_counted integer;
  v_target  integer;
  v_version integer;
  v_month   text;
  v_day     text;
  v_err     jsonb;
  v_round   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_purpose not in ('topup', 'renew') then
    raise exception 'purpose is topup or renew' using errcode = '22023';
  end if;
  if p_estimate_usd is null or p_estimate_usd < 0 or p_estimate_usd > 25 then
    raise exception 'estimate: 0 to 25 usd' using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  perform public.lead_plan_check(p_plan);
  select * into last from public.lead_rounds where search_id = p_search_id order by seq desc limit 1;
  if last.state <> 'ended' then
    return jsonb_build_object('error', 'live', 'state', last.state);
  end if;
  v_version := coalesce((p_plan->>'version')::integer, 0);
  if v_version not in ((s.plan->>'version')::integer, (s.plan->>'version')::integer + 1) then
    raise exception 'the plan is the current version or the next' using errcode = '22023';
  end if;
  v_count := (p_plan->>'count')::integer;
  if p_purpose = 'topup' then
    select count(*) into v_counted from public.lead_search_members m where m.search_id = p_search_id and m.counted;
    v_target := v_count - v_counted;
    if v_target <= 0 then
      return jsonb_build_object('error', 'nothing_to_add', 'counted', v_counted);
    end if;
  else
    v_target := v_count;
  end if;
  if not public.lead_searches_on(s.tenant_id) then
    return jsonb_build_object('error', 'paused', 'sentence', 'Lead searches are paused for now. Your leads are all here, and nothing is being counted.');
  end if;
  v_month := public.lead_month(s.tenant_id, now());
  v_day   := public.lead_day(s.tenant_id, now());
  v_err   := public.lead_reserve(s.tenant_id, v_month, v_day, v_target, p_estimate_usd);
  if v_err is not null then
    return v_err;
  end if;
  if v_version <> (s.plan->>'version')::integer then
    update public.lead_searches set plan = p_plan where id = p_search_id;
  end if;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, allowance_reserved, cost_reserved_usd, month, day)
  values (s.tenant_id, p_search_id, last.seq + 1, p_purpose, p_plan, v_version, v_target, 'queued', v_target, p_estimate_usd, v_month, v_day)
  returning id into v_round;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (s.tenant_id, 'lead_round_start', now(), jsonb_build_object('round_id', v_round));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.round', 'lead', 'lead_round', v_round,
          jsonb_build_object('search_id', p_search_id, 'seq', last.seq + 1, 'state', 'queued', 'purpose', p_purpose, 'target', v_target, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'round_id', v_round, 'seq', last.seq + 1, 'target', v_target);
end $$;
comment on function public.lead_search_more(uuid, text, jsonb, numeric) is
  'Owner. A new round on an ended search: topup reserves the count minus what already counted, renew the whole count, through the same reservation as create; the plan is the current version or the next (stored on the search). {error: live} while a round is open; {error: nothing_to_add} when the count is already met.';

-- The three member doors share one body: the state they expect, what they
-- write, and the operation record Undo reads.
create or replace function public.lead_member_move(p_search_id uuid, p_lead_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  s         public.lead_searches;
  m         public.lead_search_members;
  l         public.leads;
  v_month   text;
  v_counter public.lead_counters;
  v_before  jsonb;
  v_after   jsonb;
  v_op      uuid;
  v_counts  boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  select * into m from public.lead_search_members where search_id = p_search_id and lead_id = p_lead_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into l from public.leads where id = p_lead_id;
  if m.blanked_at is not null or l.blanked_at is not null or l.erased_at is not null then
    return jsonb_build_object('error', 'hidden');
  end if;
  v_before := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);

  if p_kind = 'exclude' then
    if m.class <> 'review' then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    update public.lead_search_members
       set class = 'excluded', excluded_by = 'owner', kept_at = null, kept_by = null, version = version + 1
     where id = m.id
    returning * into m;
  else
    if p_kind = 'put_back' then
      if m.class <> 'excluded' then
        return jsonb_build_object('error', 'state', 'class', m.class);
      end if;
      -- Neither Put back nor Keep revives a suppression or an out-of-area place (§0.1).
      if l.place_id is null or exists (select 1 from public.lead_suppressions x where x.tenant_id = s.tenant_id and x.kind = 'place'
                    and x.what in ('customer', 'erased') and x.hash = public.lead_suppression_hash(s.tenant_id, l.place_id)) then
        return jsonb_build_object('error', 'hidden');
      end if;
      if m.judgment->'reasons' ? 'out_of_area' then
        return jsonb_build_object('error', 'out_of_area');
      end if;
    elsif not (m.class = 'review' or (m.class = 'qualified' and not m.counted)) then
      return jsonb_build_object('error', 'state', 'class', m.class);
    end if;
    -- Keep and Put back count, through the month's allowance (§0.2).
    if not m.counted then
      v_month := public.lead_month(s.tenant_id, now());
      v_counter := public.lead_counter_take(s.tenant_id, 'allowance', v_month);
      if v_counter.used + v_counter.reserved + 1 > 500 then
        return jsonb_build_object('error', 'month_leads_used', 'left', 0,
          'sentence', 'You have found this month''s 500 leads. Your leads renew on ' || public.lead_renews_on(s.tenant_id) || '.');
      end if;
      update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
      v_counts := true;
    end if;
    update public.lead_search_members
       set class = 'qualified', excluded_by = null,
           counted = true, counted_month = coalesce(counted_month, v_month),
           kept_at = now(), kept_by = v_user, version = version + 1
     where id = m.id
    returning * into m;
  end if;

  v_after := jsonb_build_object('class', m.class, 'excluded_by', m.excluded_by, 'counted', m.counted, 'counted_month', m.counted_month, 'kept_at', m.kept_at, 'kept_by', m.kept_by);
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, p_kind, p_search_id, array[p_lead_id], v_before, v_after, m.version, v_user)
  returning id into v_op;
  return jsonb_build_object('op_id', v_op, 'version', m.version, 'counted', v_counts);
end $$;
comment on function public.lead_member_move(uuid, uuid, text) is
  'The body of lead_member_keep, lead_member_exclude and lead_member_put_back: the state each expects, the change, the allowance when it counts, and one lead_operations row with the member''s new version.';
revoke execute on function public.lead_member_move(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.lead_member_keep(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'keep') $$;
comment on function public.lead_member_keep(uuid, uuid) is
  'Owner (permission find). A member in review, or qualified and not yet counted, is kept: Qualified, counted this month through the allowance ({error: month_leads_used} when none is left). Returns {op_id, version}.';

create or replace function public.lead_member_exclude(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'exclude') $$;
comment on function public.lead_member_exclude(uuid, uuid) is
  'Owner (permission find). A member in review is excluded by the owner; free. Returns {op_id, version}.';

create or replace function public.lead_member_put_back(p_search_id uuid, p_lead_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$ select public.lead_member_move(p_search_id, p_lead_id, 'put_back') $$;
comment on function public.lead_member_put_back(uuid, uuid) is
  'Owner (permission find). An excluded member goes back through keep''s path and counts; refused for a hidden place ({error: hidden}: a customer or an erasure) and for one outside the area ({error: out_of_area}). Returns {op_id, version}.';

create or replace function public.lead_undo(p_op_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found or not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'undo_search' then
    -- The search comes back with the memberships its removal blanked, except
    -- a lead exported or copied since: those are kept as they are and stay
    -- charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    update public.lead_search_members m2
       set blanked_at = null, version = version + 1
      from public.leads l
     where m2.search_id = op.search_id and m2.lead_id = l.id and m2.lead_id = any (op.lead_ids)
       and l.exported_at is null and l.blanked_at is null and l.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;
comment on function public.lead_undo(uuid, integer) is
  'Owner. Undoes one operation by its id and the version the client saw: {error: changed} when the operation or any touched member moved since; restores `before`; returns a counted lead to the allowance of the month it counted in, never the budget; a removed search comes back without the leads exported since.';

create or replace function public.lead_search_rename(p_search_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  s      public.lead_searches;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'A name is 1 to 120 characters.' using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.is_acting_member(s.tenant_id) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  update public.lead_searches set name = v_name where id = p_search_id;
  return jsonb_build_object('search_id', p_search_id, 'name', v_name);
end $$;
comment on function public.lead_search_rename(uuid, text) is 'Operator. Renames a search; the plan and the rounds are untouched.';

create or replace function public.lead_search_remove(p_search_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  s       public.lead_searches;
  r       public.lead_rounds;
  run     record;
  v_ids   uuid[];
  v_op    uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  for r in select * from public.lead_rounds where search_id = p_search_id and state <> 'ended' for update loop
    for run in select * from public.lead_runs where round_id = r.id and state in ('claimed', 'starting', 'running', 'unknown') for update loop
      update public.lead_runs set lease_gen = lease_gen + 1 where id = run.id;
      if run.state = 'running' then
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (r.tenant_id, 'lead_collect', now(), jsonb_build_object('run_id', run.id, 'seq', 'stop'))
        on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' do nothing;
      end if;
    end loop;
    perform public.lead_round_end(r.id, 'stopped');
  end loop;
  -- Members whose lead is being worked (contacted, or a person now) stay;
  -- the rest of the memberships are blanked, and the operation remembers
  -- which, so Undo can bring them back.
  select coalesce(array_agg(m.lead_id), '{}') into v_ids
    from public.lead_search_members m join public.leads l on l.id = m.lead_id
   where m.search_id = p_search_id and m.blanked_at is null and l.stage not in ('nurture', 'converted');
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where search_id = p_search_id and lead_id = any (v_ids);
  update public.lead_searches set removed_at = now() where id = p_search_id;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'undo_search', p_search_id, v_ids, jsonb_build_object('removed_at', null), jsonb_build_object('removed_at', now()), 1, v_user)
  returning id into v_op;
  return jsonb_build_object('op_id', v_op, 'version', 1, 'blanked', coalesce(array_length(v_ids, 1), 0));
end $$;
comment on function public.lead_search_remove(uuid) is
  'Owner. Removes a search: live rounds end stopped (their running runs get a stop collect), memberships of leads not being worked are blanked, the rest stay, and one undo_search operation records which. Returns {op_id, version}.';

revoke execute on function public.lead_search_create(uuid, jsonb, text, numeric) from public, anon;
revoke execute on function public.lead_round_answer(uuid, text, jsonb) from public, anon;
revoke execute on function public.lead_round_stop(uuid) from public, anon;
revoke execute on function public.lead_search_more(uuid, text, jsonb, numeric) from public, anon;
revoke execute on function public.lead_member_keep(uuid, uuid) from public, anon;
revoke execute on function public.lead_member_exclude(uuid, uuid) from public, anon;
revoke execute on function public.lead_member_put_back(uuid, uuid) from public, anon;
revoke execute on function public.lead_undo(uuid, integer) from public, anon;
revoke execute on function public.lead_search_rename(uuid, text) from public, anon;
revoke execute on function public.lead_search_remove(uuid) from public, anon;
grant execute on function public.lead_search_create(uuid, jsonb, text, numeric), public.lead_round_answer(uuid, text, jsonb),
  public.lead_round_stop(uuid), public.lead_search_more(uuid, text, jsonb, numeric), public.lead_member_keep(uuid, uuid),
  public.lead_member_exclude(uuid, uuid), public.lead_member_put_back(uuid, uuid), public.lead_undo(uuid, integer),
  public.lead_search_rename(uuid, text), public.lead_search_remove(uuid) to authenticated;

/* ------------------------------------------------------------- 8. reads -- */

-- The search with its latest round and its counts, under the reader's own
-- row security (security_invoker): a member sees their workspace's searches
-- and nothing else.
create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.question, r.answered, r.target, r.plan_version, r.judge_tokens,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded, coalesce(c.counted, 0) as counted
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.question, r.answered, r.target, r.plan_version, r.judge_tokens
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted
      from public.lead_search_members m where m.search_id = s.id
  ) c on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, question, answered, target, plan_version, judge_tokens) and its counts over the members (qualified, review, excluded, counted). Excluded members stay counted after their details are blanked, so "40 left out" stays 40.';
revoke all on public.lead_searches_view from public, anon;
grant select on public.lead_searches_view to authenticated, service_role;

-- One page of a search's members joined to their leads, keyset-paged on the
-- sort key: found (newest first), fit (strong, look, long, then newest) or
-- distance (nearest first). The key carries the id: "<k>|<id>".
create or replace function public.leads_page(p_tenant_id uuid, p_search_id uuid default null, p_class text default 'qualified', p_sort text default 'found', p_after_key text default null, p_limit integer default 200)
returns table (
  member_id uuid, lead_id uuid, search_id uuid, round_id uuid, class text, excluded_by text, fit text, reason text, distance_m integer,
  counted boolean, counted_month text, shares jsonb,
  business_name text, category text, street text, city text, region text, postal_code text, lat double precision, lng double precision,
  website_host text, instagram_url text, phone_e164 text, phone_sources smallint, phone_wrong boolean, email text, email_state text,
  email_checked_at timestamptz, rating numeric, reviews integer, stage text, closed_reason text, contact_id uuid, found_at timestamptz,
  sort_key text
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select m.id as member_id, m.lead_id, m.search_id, m.round_id, m.class, m.excluded_by, m.fit, m.reason, m.distance_m,
           m.counted, m.counted_month, coalesce(m.judgment->'shares', '[]'::jsonb) as shares,
           l.business_name, l.category, l.street, l.city, l.region, l.postal_code, l.lat, l.lng, l.website_host, l.instagram_url,
           l.phone_e164, l.phone_sources, l.phone_wrong, l.email, l.email_state, l.email_checked_at, l.rating, l.reviews,
           l.stage, l.closed_reason, l.contact_id, l.found_at,
           case coalesce(p_sort, 'found')
             when 'fit' then (case m.fit when 'strong' then '0' when 'look' then '1' when 'long' then '2' else '3' end)
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             when 'distance' then lpad(coalesce(m.distance_m, 999999999)::text, 9, '0')
                             || lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
             else lpad((9999999999 - floor(extract(epoch from l.found_at)))::bigint::text, 10, '0')
           end as k
      from public.lead_search_members m
      join public.leads l on l.id = m.lead_id
     where m.tenant_id = p_tenant_id
       and (p_search_id is null or m.search_id = p_search_id)
       and m.class = coalesce(p_class, 'qualified')
       and (m.class <> 'qualified' or m.counted)
       and m.blanked_at is null and l.blanked_at is null and l.erased_at is null
  )
  select b.member_id, b.lead_id, b.search_id, b.round_id, b.class, b.excluded_by, b.fit, b.reason, b.distance_m,
         b.counted, b.counted_month, b.shares,
         b.business_name, b.category, b.street, b.city, b.region, b.postal_code, b.lat, b.lng, b.website_host, b.instagram_url,
         b.phone_e164, b.phone_sources, b.phone_wrong, b.email, b.email_state, b.email_checked_at, b.rating, b.reviews,
         b.stage, b.closed_reason, b.contact_id, b.found_at,
         b.k || '|' || b.member_id::text as sort_key
    from base b
   where p_after_key is null
      or (b.k, b.member_id::text) > (split_part(p_after_key, '|', 1), split_part(p_after_key, '|', 2))
   order by b.k, b.member_id::text
   limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;
comment on function public.leads_page(uuid, uuid, text, text, text, integer) is
  'A page of members of one class (qualified: the counted ones; review; excluded) joined to their leads, keyset-paged on sort_key (found newest first, fit best first, distance nearest first), under the caller''s row security. Pass the last row''s sort_key as p_after_key for the next page.';
revoke execute on function public.leads_page(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.leads_page(uuid, uuid, text, text, text, integer) to authenticated, service_role;

/* --------------------------------------------------------- 9. realtime -- */

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_rounds') then
    alter publication supabase_realtime add table public.lead_rounds;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lead_search_members') then
    alter publication supabase_realtime add table public.lead_search_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

/* ----------------------------------------------- 10. the sweep's clock -- */

-- Every five minutes the clock looks for lead work the pipeline could have
-- left behind (a running run with no collect, one past its time, an unknown
-- start, a question unanswered for a day, a stale lease) and asks the edge
-- only when there is some, recording that it looked otherwise, the way the
-- ledger's heartbeat does (00098). Before A2 deploys the handler no round
-- exists, so the edge is never asked and nothing pages.
create or replace function public.trigger_leads_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.lead_runs r where r.state in ('claimed', 'starting', 'running', 'unknown'))
     or exists (select 1 from public.lead_rounds r where r.state in ('waiting_on_owner', 'checking')) then
    return public.request_sweep('leads', '/api/cron/leads');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('leads', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_leads_sweep() from public, anon, authenticated;
comment on function public.trigger_leads_sweep() is
  'The lead finder''s clock. Calls the edge (/api/cron/leads) only when a run is live or a round waits or checks; otherwise records that it looked, so sweep_health() can tell a quiet engine from a stopped clock.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every five minutes, recording itself each time: fifteen minutes is three
  -- missed ticks. Seeded with a look so the first health run finds a row.
  ('leads',       'leads-sweep', interval '15 minutes', 'request', now()),
  -- the nightly purge, judged on its runs like the other purges (00107).
  ('purge_leads', 'purge-leads', interval '26 hours',   'run',     null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('leads-sweep') where exists (select 1 from cron.job where jobname = 'leads-sweep');
select cron.schedule('leads-sweep', '*/5 * * * *', $$select public.trigger_leads_sweep()$$);

/* ----------------------------------------------------- 11. retention -- */

create or replace function public.purge_leads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n     integer;
  r       record;
begin
  -- Untouched for 90 days: no person, no contact, no export. Set aside.
  update public.leads
     set stage = 'archived', closed_reason = 'stale'
   where stage = 'ready' and contact_id is null and contacted_at is null and exported_at is null
     and found_at < now() - interval '90 days' and erased_at is null and blanked_at is null;
  get diagnostics v_n = row_count; v_total := v_total + v_n;
  -- Set aside for 180 days since it was found: its details go.
  for r in select l.id from public.leads l
            where l.closed_reason = 'stale' and l.blanked_at is null and l.erased_at is null and l.found_at < now() - interval '180 days'
  loop
    v_total := v_total + public.lead_blank(r.id);
  end loop;
  -- A place a search left out, 30 days on: the membership's details go and
  -- the lead's with them when nothing else holds it; the membership stays,
  -- excluded, so the count of what was left out does not move.
  for r in select distinct m.lead_id from public.lead_search_members m
            where m.class = 'excluded' and m.blanked_at is null and m.created_at < now() - interval '30 days'
  loop
    if not exists (select 1 from public.lead_search_members m2 where m2.lead_id = r.lead_id and m2.class <> 'excluded' and m2.blanked_at is null)
       and not exists (select 1 from public.leads l where l.id = r.lead_id and (l.contact_id is not null or l.contacted_at is not null or l.exported_at is not null)) then
      v_total := v_total + public.lead_blank(r.lead_id);
    else
      update public.lead_search_members set judgment = '{}'::jsonb, reason = '', blanked_at = now()
       where lead_id = r.lead_id and class = 'excluded' and blanked_at is null;
    end if;
  end loop;
  -- The judge's answers outlive nothing they judged.
  delete from public.lead_judgments where created_at < now() - interval '180 days';
  return v_total;
end $$;
revoke execute on function public.purge_leads() from public, anon, authenticated;
comment on function public.purge_leads() is
  'Nightly. A lead untouched for 90 days is set aside (archived, stale); set aside and 180 days since it was found, its details are removed (lead_blank); a place a search left out loses its details after 30 days but stays counted as left out. Judgments older than 180 days go. Numbers: contracts'' RETENTION_DAYS.';

select cron.unschedule('purge-leads') where exists (select 1 from cron.job where jobname = 'purge-leads');
select cron.schedule('purge-leads', '47 4 * * *', $$select public.purge_leads()$$);
```

- [ ] **Step 2: Apply it inside a rolled-back transaction first**

Make sure Docker answers (see Commands), then `"$SB" status >/dev/null 2>&1 || "$SB" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector`.

Run: `( echo 'begin;'; cat supabase/migrations/00139_the_lead_finder_engine.sql; echo 'rollback;' ) | docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | grep -E "ERROR|ROLLBACK"`
Expected: `ROLLBACK` and no `ERROR` line. (If the local database is behind main, this dry run still passes: 00139 depends on nothing 00134 to 00138 added. The reset below replays everything.)

- [ ] **Step 3: Replay the local stack from zero, and regenerate what is generated from it**

Run: `"$SB" db reset`
Expected: every migration applies in order, ending `Applying migration 00139_the_lead_finder_engine.sql...` with no error, then `Finished supabase db reset`.

Run: `SUPABASE_CLI="$SB" corepack pnpm gen:schema-sets`
Expected: `wrote packages/contracts/src/schema-sets.generated.ts`. Then `git diff --stat -- packages/contracts/src/schema-sets.generated.ts` shows `30 insertions(+), 1 deletion(-)`: `jobs.kind` gains the three kinds and these nineteen entries appear, byte for byte (the generator's own rendering):

```ts
  "lead_counters.kind": ["allowance", "budget", "day"],
  "lead_operations.kind": ["undo_search", "keep", "exclude", "put_back", "include", "stop"],
  "lead_preferences.kind": ["chain", "wrong_kind", "too_far"],
  "lead_rounds.answered": ["keep", "include", "stop"],
  "lead_rounds.ending": [
    "target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches",
    "stopped", "source_failed", "question_unanswered", "paused",
  ],
  "lead_rounds.ending_pending": [
    "target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches",
    "stopped", "source_failed", "question_unanswered", "paused",
  ],
  "lead_rounds.purpose": ["probe", "main", "topup", "renew"],
  "lead_rounds.state": ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"],
  "lead_runs.purpose": ["discover", "check"],
  "lead_runs.state": [
    "claimed", "starting", "running", "succeeded", "failed", "aborted", "timed_out", "unknown",
  ],
  "lead_search_members.class": ["qualified", "review", "excluded"],
  "lead_search_members.fit": ["strong", "look", "long"],
  "lead_searches.via": ["people", "ask"],
  "lead_suppressions.kind": ["email", "place", "phone"],
  "lead_suppressions.what": ["email_opt_out", "customer", "erased"],
  "leads.closed_reason": ["said_no", "not_a_fit", "customer", "stale", "search_removed"],
  "leads.email_state": ["none", "checking", "ok", "catch_all", "unknown", "invalid"],
  "leads.stage": ["ready", "nurture", "converted", "archived"],
```

Run: `SUPABASE_CLI="$SB" corepack pnpm gen:db-types`
Expected: `wrote packages/db/src/database.types.ts (N lines)`; the diff adds the thirteen tables under `Tables`, `lead_searches_view` under `Views`, and the functions (`has_permission`, `lead_month`, `lead_searches_on`, `lead_niche_prior`, `lead_search_create`, `lead_round_answer`, `lead_round_stop`, `lead_search_more`, `lead_member_keep`, `lead_member_exclude`, `lead_member_put_back`, `lead_undo`, `lead_search_rename`, `lead_search_remove`, `leads_page`, the nine service RPCs and the helpers) under `Functions`.

- [ ] **Step 4: Hold every lead set to its column**

In `packages/contracts/src/schema-sets.ts`, after `import type { TEMPLATE_CATEGORIES } from "./templates";` add:

```ts
import type {
  LEAD_CLOSED_REASONS, LEAD_COUNTER_KINDS, LEAD_EMAIL_STATES, LEAD_FITS, LEAD_MEMBER_CLASSES, LEAD_OPERATION_KINDS,
  LEAD_PREFERENCE_KINDS, LEAD_ROUND_ANSWERS, LEAD_ROUND_ENDINGS, LEAD_ROUND_PURPOSES, LEAD_ROUND_STATES, LEAD_RUN_PURPOSES,
  LEAD_RUN_STATES, LEAD_SEARCH_VIAS, LEAD_STAGES, LEAD_SUPPRESSION_KINDS, LEAD_SUPPRESSION_WHATS,
} from "./lead-search";
```

and replace the end of `SchemaAgreement`

```ts
  Holds<Exactly<Of<typeof BUSINESS_TYPES>, SchemaSet<"business_records.business_type">>>,
  Holds<Exactly<Of<typeof COMPANY_TYPES>, SchemaSet<"business_records.company_type">>>,
];
```

with

```ts
  Holds<Exactly<Of<typeof BUSINESS_TYPES>, SchemaSet<"business_records.business_type">>>,
  Holds<Exactly<Of<typeof COMPANY_TYPES>, SchemaSet<"business_records.company_type">>>,

  // The lead finder (00139). A round's ending and its pending ending are one set.
  Holds<Exactly<Of<typeof LEAD_SEARCH_VIAS>, SchemaSet<"lead_searches.via">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_PURPOSES>, SchemaSet<"lead_rounds.purpose">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_STATES>, SchemaSet<"lead_rounds.state">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ENDINGS>, SchemaSet<"lead_rounds.ending_pending">>>,
  Holds<Exactly<Of<typeof LEAD_ROUND_ANSWERS>, SchemaSet<"lead_rounds.answered">>>,
  Holds<Exactly<Of<typeof LEAD_RUN_PURPOSES>, SchemaSet<"lead_runs.purpose">>>,
  Holds<Exactly<Of<typeof LEAD_RUN_STATES>, SchemaSet<"lead_runs.state">>>,
  Holds<Exactly<Of<typeof LEAD_EMAIL_STATES>, SchemaSet<"leads.email_state">>>,
  Holds<Exactly<Of<typeof LEAD_STAGES>, SchemaSet<"leads.stage">>>,
  Holds<Exactly<Of<typeof LEAD_CLOSED_REASONS>, SchemaSet<"leads.closed_reason">>>,
  Holds<Exactly<Of<typeof LEAD_MEMBER_CLASSES>, SchemaSet<"lead_search_members.class">>>,
  Holds<Exactly<Of<typeof LEAD_FITS>, SchemaSet<"lead_search_members.fit">>>,
  Holds<Exactly<Of<typeof LEAD_COUNTER_KINDS>, SchemaSet<"lead_counters.kind">>>,
  Holds<Exactly<Of<typeof LEAD_OPERATION_KINDS>, SchemaSet<"lead_operations.kind">>>,
  Holds<Exactly<Of<typeof LEAD_PREFERENCE_KINDS>, SchemaSet<"lead_preferences.kind">>>,
  Holds<Exactly<Of<typeof LEAD_SUPPRESSION_KINDS>, SchemaSet<"lead_suppressions.kind">>>,
  Holds<Exactly<Of<typeof LEAD_SUPPRESSION_WHATS>, SchemaSet<"lead_suppressions.what">>>,
];
```

Run: `corepack pnpm --filter @chanlytics/contracts typecheck`
Expected: no error.

- [ ] **Step 5: Rebuild the dists, keep the real diffs, and run every suite the change touches**

Run: `node tooling/scripts/check-dist.mjs; for d in contracts db jobs channels core; do if git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist; then git checkout -- packages/$d/dist; else echo "$d: real diff"; fi; done`
Expected: `DIST DRIFT` (it reads the uncommitted rebuild as drift; the commit below settles it) and then five lines, `contracts: real diff`, `db: real diff`, `jobs: real diff`, `channels: real diff`, `core: real diff` (tsup inlines contracts into the other four).

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-judge.test.mjs tooling/scripts/tests/lead-jobs.test.mjs tooling/scripts/tests/jobs-ledger.test.mjs tooling/scripts/tests/line-provision.test.mjs tooling/scripts/tests/retention-words.test.mjs tooling/scripts/tests/gate-reason.test.mjs tooling/scripts/tests/exports.test.mjs tooling/scripts/tests/event-kinds.test.mjs tooling/scripts/tests/store-retired.test.mjs tooling/scripts/tests/delete-tenant.test.mjs tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs`
Expected: `# fail 0`. `event-kinds` now sees `lead.round` and `lead.no_card` emitted (five `insert into events` in 00139 name `lead.round`, one names `lead.no_card`, one names `contact.added`); `store-retired` sees the three kinds handled and scheduled by SQL; `delete-tenant` sees the eleven tables listed.

- [ ] **Step 6: Commit Task 3 and Task 4 together**

```bash
git add packages/contracts/src packages/jobs/src packages/db/src packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist supabase/migrations/00139_the_lead_finder_engine.sql tooling/scripts/tests/lead-jobs.test.mjs tooling/scripts/tests/retention-words.test.mjs tooling/scripts/tests/store-retired.test.mjs tooling/scripts/delete-tenant.mjs
git commit -m "The lead finder's engine: a search, its rounds and runs, the places found, the month's allowance and budget reserved and settled in one transaction, the doors and the RPCs (00139)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then `corepack pnpm check:dist`. Expected: `dist in sync with src`.

---

## Task 5: The engine on a real Postgres

**Files:**
- Create: `tooling/scripts/tests/lead-engine.db.test.mjs`
- Modify: `tooling/scripts/tests/tenancy.db.test.mjs`, `tooling/scripts/tests/sweep-registry.db.test.mjs`

- [ ] **Step 1: Write the test**

Create `tooling/scripts/tests/lead-engine.db.test.mjs`. Its blocks are the SQL proof's (see *Proven*), one for one, through PostgREST and real sessions: a failed sign-in fails the test (E11).

```js
/**
 * The lead finder's engine (00139), proved on a real Postgres with real
 * sessions: the doors reserve, count, refuse and undo as PRD v3 §0 says; the
 * service RPCs commit one page in one transaction under a lease and an
 * offset; a member reads their own workspace and nothing else.
 *
 * Runs the way activations.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real: users are made with the admin API and sign in with a password through
 * the anon key, so a door judges auth.uid() as the dashboard's client would.
 * A failed sign-in fails the test (review E11).
 *
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture....
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ROLE_PERMS, leadMonth, leadSuppressionHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
    : !ANON
      ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
      : false;

let db;
let A; // the workspace under test, in America/Chicago
let B; // another workspace
let owner; // an owner of A
let operator; // an operator of A
let stranger; // an owner of B
const users = [];
const TZ = "America/Chicago";

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `lead-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** 200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms; the count as given. */
const plan = (count, version = 1) => ({
  version, card: "local_businesses", name: "personal trainers", asked: "personal trainers in Austin",
  terms: ["personal trainer", "strength coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

/** One place of a page, as the collect commits it: the lead's columns and the member's judgment. */
const place = (n, cls, { phone = null, reasons = [], shares = [], duplicateOf = null } = {}) => ({
  place: {
    place_id: `ChIJfixture${String(n).padStart(4, "0")}`, business_name: `Fixture ${n}`, category: "Personal trainer",
    street: `${n} Fixture St`, city: "Austin", region: "TX", postal_code: "78704", country: "US", lat: 30.25, lng: -97.75,
    website_host: `fixture${n}.example`, phone_e164: phone ?? `+1512555${String(100 + n).padStart(4, "0")}`, phone_sources: 2,
    email: `hello@fixture${n}.example`, email_state: cls === "qualified" ? "ok" : "catch_all", rating: 4.5, reviews: 12,
  },
  member: { judgment: { reasons }, class: cls, excluded_by: cls === "excluded" ? "chain" : null, fit: cls === "excluded" ? null : "strong", reason: "A fixture.", distance_m: 1200 },
  duplicate_of_place_id: duplicateOf,
  shares,
});

/** A discover run of a round, claimed, started and leased by `worker`. */
async function runOf(roundId, term, worker) {
  const run = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: roundId, purpose: "discover", term, actor: "card-a", build: "1", webhook_token_hash: `hash-${term}-${Date.now()}` }).select("id").single());
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: worker })), true, "the claim");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: worker, p_apify_run_id: `apr-${run.id}`, p_dataset_id: `ds-${run.id}`, p_cap_usd: 0.5 })), true, "the start");
  const gen = ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: worker, p_seconds: 60 }));
  return { id: run.id, gen };
}

const commit = (run, worker, gen, from, to, page) => db.rpc("lead_collect_commit", { p_run_id: run, p_owner: worker, p_gen: gen, p_from_offset: from, p_to_offset: to, p_page: page });
const counter = async (kind, period) => ok(await db.from("lead_counters").select("used, reserved").eq("tenant_id", A).eq("kind", kind).eq("period", period).single());
const member = async (searchId, leadId) => ok(await db.from("lead_search_members").select("*").eq("search_id", searchId).eq("lead_id", leadId).single());
const leadByPlace = async (placeId) => ok(await db.from("leads").select("*").eq("tenant_id", A).eq("place_id", placeId).single());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(await db.from("tenants").insert({ slug: `lead-engine-${Date.now()}`, name: "Lead engine", timezone: TZ }).select("id").single()).id;
  B = ok(await db.from("tenants").insert({ slug: `lead-engine-other-${Date.now()}`, name: "Other" }).select("id").single()).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  stranger = await memberClient("owner", B);
  // The switch stays off; this workspace is listed, as the nightly's is in release A (30).
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(await db.from("lead_platform").update({ tenants_on: [...(p.tenants_on ?? []), A] }).eq("id", true));
});

after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data) await db.from("lead_platform").update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) }).eq("id", true);
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const ids = {}; // what the tests hand each other, in order

test("has_permission is ROLE_PERMS in SQL: every role and permission agree, and find is the owner's alone", { skip }, async () => {
  const who = { owner: owner.userId, operator: operator.userId };
  for (const [role, perms] of Object.entries(ROLE_PERMS)) {
    if (role === "viewer") continue; // no viewer is seeded here; tenancy.db.test.mjs signs one in
    for (const [perm, may] of Object.entries(perms)) {
      assert.equal(ok(await db.rpc("has_permission", { p_user: who[role], p_tenant_id: A, p_permission: perm })), may, `${role}.${perm}`);
    }
  }
  assert.equal(ok(await db.rpc("has_permission", { p_user: stranger.userId, p_tenant_id: A, p_permission: "find" })), false, "a member of another workspace has nothing here");
  assert.equal(ok(await db.rpc("lead_month", { p_tenant_id: A, p_at: "2026-10-01T03:30:00Z" })), "2026-09", "still September in Chicago");
  assert.equal(ok(await db.rpc("lead_suppression_hash", { p_tenant_id: "11111111-1111-4111-8111-111111111111", p_value: "+15125550100" })).length, 64);
});

test("the suppression hash in SQL is contracts' keyed digest, byte for byte", { skip }, async () => {
  // lead_suppression_hash is the service role's; the digest is compared through a door that uses it: none reads it back, so compare the function itself.
  const t = "11111111-1111-4111-8111-111111111111";
  const fromSql = ok(await db.rpc("lead_suppression_hash", { p_tenant_id: t, p_value: "+15125550100" }));
  assert.equal(fromSql, await leadSuppressionHash(t, "+15125550100"));
});

test("create reserves the count and the estimate in one transaction, writes the probe round, its start job and the event; the switch and the card refuse first", { skip }, async () => {
  ok(await db.from("lead_platform").update({ tenants_on: [] }).eq("id", true));
  let r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 }));
  assert.equal(r.error, "paused", JSON.stringify(r));
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(await db.from("lead_platform").update({ tenants_on: [...(p.tenants_on ?? []), A] }).eq("id", true));
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: { ...plan(5), card: "etsy_shops" }, p_via: "people", p_estimate_usd: 0.05 }));
  assert.equal(r.error, "no_card", "an unapproved card never runs for an owner");
  const demand = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.no_card"));
  assert.equal(demand.length, 1, "the ask is logged as demand");
  assert.equal(demand[0].data.card, "etsy_shops");

  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 }));
  assert.ok(r.search_id && r.round_id, JSON.stringify(r));
  ids.search1 = r.search_id; ids.round1 = r.round_id;
  const round = ok(await db.from("lead_rounds").select("*").eq("id", r.round_id).single());
  const month = leadMonth(TZ, new Date());
  assert.deepEqual([round.state, round.seq, round.purpose, round.target, round.allowance_reserved, Number(round.cost_reserved_usd), round.plan_version, round.month], ["queued", 1, "probe", 5, 5, 0.05, 1, month]);
  assert.deepEqual(await counter("allowance", month), { used: "0.0000", reserved: "5.0000" });
  assert.deepEqual(await counter("budget", month), { used: "0.0000", reserved: "0.0500" });
  assert.deepEqual(await counter("day", round.day), { used: "0.0000", reserved: "0.0500" });
  const job = ok(await db.from("jobs").select("state, tenant_id").eq("kind", "lead_round_start").eq("payload->>round_id", r.round_id));
  assert.deepEqual(job, [{ state: "scheduled", tenant_id: A }], "the start job is written with the round");
  const ev = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", r.round_id));
  assert.equal(ev[0].data.state, "queued");

  const denied = await operator.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 });
  assert.match(denied.error?.message ?? "", /Only an owner can find businesses for you/, "an operator may not start a search");
  const other = await stranger.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 });
  assert.match(other.error?.message ?? "", /Only an owner/, "nor an owner of another workspace");
});

test("the allowance refuses in a sentence: the month's 500 are reserved once, and the 501st is refused with what is left", { skip }, async () => {
  let r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(496), p_via: "ask", p_estimate_usd: 0.5 }));
  assert.equal(r.error, "month_leads_used");
  assert.equal(r.left, 495);
  assert.match(r.sentence, /^You have 495 leads left this month\. Find 495 now, or all 496 when your leads renew on [A-Z][a-z]{2} 1\?$/);
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(495), p_via: "ask", p_estimate_usd: 0.5 }));
  assert.ok(r.search_id, "the rest of the month is taken");
  ids.search2 = r.search_id; ids.round2 = r.round_id;
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(1), p_via: "people", p_estimate_usd: 0.01 }));
  assert.equal(r.error, "month_leads_used");
  assert.equal(r.left, 0);
  assert.match(r.sentence, /^You have found this month's 500 leads\. Your leads renew on [A-Z][a-z]{2} 1\.$/);
});

test("the run is claimed once, leased by owner and generation, and a page commits by compare-and-set: five asked, twenty qualified, five counted, paid once", { skip }, async () => {
  const run = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: ids.round1, purpose: "discover", term: "personal trainer", actor: "card-a", build: "1", webhook_token_hash: "hash1" }).select("id").single());
  ids.run1 = run.id;
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w1" })), true, "the first claim wins");
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w2" })), false, "the second finds it taken");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: "w2", p_apify_run_id: "apr1", p_dataset_id: "ds1", p_cap_usd: 0.5 })), false, "only the claimer records");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: "w1", p_apify_run_id: "apr1", p_dataset_id: "ds1", p_cap_usd: 0.5 })), true);
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w1", p_seconds: 60 })), 0, "the first lease is generation 0");
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w2", p_seconds: 60 })), null, "held by another");

  const page = {
    judgment: { op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73", request_hash: "rh", answer: { places: [] }, model: "the-judge", tokens: 1200, batch: 1 },
    places: Array.from({ length: 20 }, (_, i) => place(i + 1, "qualified")),
    usage_usd: 0.02, items_seen: 20, run_state: null,
    next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
    round: { state: "probing" },
  };
  assert.deepEqual(ok(await commit(run.id, "w1", 1, 0, 20, page)), { ok: false, why: "lease" }, "a wrong generation");
  assert.deepEqual(ok(await commit(run.id, "w2", 0, 0, 20, page)), { ok: false, why: "lease" }, "a wrong owner");
  assert.deepEqual(ok(await commit(run.id, "w1", 0, 5, 20, page)), { ok: false, why: "offset" }, "a wrong offset");
  const r = ok(await commit(run.id, "w1", 0, 0, 20, page));
  assert.deepEqual(r, { ok: true, counted: 5, qualified: 20, review: 0, excluded: 0, round_state: "probing" });
  const round = ok(await db.from("lead_rounds").select("*").eq("id", ids.round1).single());
  assert.deepEqual([round.allowance_used, Number(round.cost_usd), round.judge_tokens, round.judge_model, round.state], [5, 0.02, 1200, "the-judge", "probing"]);
  const month = leadMonth(TZ, new Date());
  assert.deepEqual(await counter("allowance", month), { used: "5.0000", reserved: "495.0000" }, "five used; the other search's 495 still reserved");
  assert.deepEqual(await counter("budget", month), { used: "0.0200", reserved: "0.5300" });
  const { count: leads } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  assert.equal(leads, 20);
  const { count: counted } = await db.from("lead_search_members").select("id", { count: "exact", head: true }).eq("search_id", ids.search1).eq("counted", true);
  assert.equal(counted, 5, "five asked, twenty qualified, five counted");
  const { count: nextJobs } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "p20");
  assert.equal(nextJobs, 1, "the next collect is written");

  assert.deepEqual(ok(await commit(run.id, "w1", 0, 0, 20, page)), { ok: false, why: "offset" }, "a replayed page is refused, so nothing doubles");
  const again = ok(await commit(run.id, "w1", 0, 20, 23, {
    judgment: [{ op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73", tokens: 1200, model: "the-judge", answer: {} }],
    places: [20, 21, 22].map((n) => place(n, "qualified")), usage_usd: 0.03, items_seen: 23,
    next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
  }));
  assert.deepEqual([again.qualified, again.counted], [2, 0], "two new places; the reservation is spent");
  assert.equal(ok(await db.from("lead_rounds").select("judge_tokens, cost_usd").eq("id", ids.round1).single()).judge_tokens, 1200, "the judgment was kept and paid once");
  const { count: stillOne } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "p20");
  assert.equal(stillOne, 1, "the next collect is written once however often it is asked for");
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w2", p_gen: 0 })), false);
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 1 })), false);
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 0 })), true, "released by the holder with the generation");
});

test("the shared-phone triple: three places with one number, one already in the workspace; the other two are delivered and marked, and no person is made", { skip }, async () => {
  const person = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550177", display_name: "Corner Deli" }).select("id").single());
  const run = await runOf(ids.round2, "deli", "w1");
  let r = ok(await commit(run.id, "w1", run.gen, 0, 1, { places: [place(101, "qualified", { phone: "+15125550177" })], round: { state: "probing" } }));
  assert.equal(r.counted, 1);
  const held = (await leadByPlace("ChIJfixture0101")).id;
  const { count: before } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  const shares = [{ kind: "phone", lead_id: held }, { kind: "phone", contact_id: person.id }];
  r = ok(await commit(run.id, "w1", run.gen, 1, 3, { places: [place(102, "qualified", { phone: "+15125550177", shares }), place(103, "qualified", { phone: "+15125550177", shares })] }));
  assert.deepEqual([r.counted, r.qualified], [2, 2], "the other two are delivered");
  const { count: withNumber } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A).eq("phone_e164", "+15125550177");
  assert.equal(withNumber, 3, "three places, three leads, one number: never merged");
  for (const pid of ["ChIJfixture0102", "ChIJfixture0103"]) {
    const m = await member(ids.search2, (await leadByPlace(pid)).id);
    assert.ok(m.judgment.shares.some((s) => s.contact_id === person.id), "marked as sharing the number with the person");
  }
  const { count: after_ } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  assert.equal(after_, before, "no person was made");
  ids.run2 = run.id; ids.gen2 = run.gen;
});

test("a duplicate listing folds into the lead already held; an erased or customer place is never inserted (erasure mid-run)", { skip }, async () => {
  const held = (await leadByPlace("ChIJfixture0101")).id;
  ok(await db.from("lead_suppressions").insert([
    { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0105"), what: "erased" },
    { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0106"), what: "customer" },
  ]));
  const r = ok(await commit(ids.run2, "w1", ids.gen2, 3, 6, { places: [place(104, "qualified", { duplicateOf: "ChIJfixture0101" }), place(105, "qualified"), place(106, "qualified")] }));
  assert.equal(r.qualified, 0, "the duplicate is the lead already held (a member once), the hidden two are skipped");
  assert.equal(ok(await db.from("lead_places").select("lead_id").eq("tenant_id", A).eq("place_id", "ChIJfixture0104").single()).lead_id, held);
  const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A).in("place_id", ["ChIJfixture0104", "ChIJfixture0105", "ChIJfixture0106"]);
  assert.equal(count, 0);
});

test("ending a round releases what it reserved and did not use", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), true);
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), false, "and only once");
  assert.deepEqual(await counter("allowance", month), { used: "8.0000", reserved: "0.0000" }, "eight counted so far; the 495 reservation is released");
  const ev = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", ids.round2).order("created_at", { ascending: false }).limit(1));
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test("keep, exclude and put back write their operation rows; undo refuses a changed version and credits the month it counted in; a hidden or out-of-area place is never put back", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: ids.run1, p_owner: "w3", p_seconds: 60 })), 0);
  const r0 = ok(await commit(ids.run1, "w3", 0, 23, 28, { places: [
    place(201, "review", { reasons: ["email:catch_all"] }), place(202, "review", { reasons: ["unknown:chain"] }),
    place(203, "excluded"), place(204, "excluded", { reasons: ["fail:chain", "out_of_area"] }), place(205, "excluded"),
  ] }));
  assert.deepEqual([r0.review, r0.excluded], [2, 3]);
  const a = (await leadByPlace("ChIJfixture0201")).id;
  const b = (await leadByPlace("ChIJfixture0202")).id;
  const c = (await leadByPlace("ChIJfixture0203")).id;
  const d = (await leadByPlace("ChIJfixture0204")).id;

  const denied = await operator.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a });
  assert.match(denied.error?.message ?? "", /Search not found/, "an operator may not keep: the door does not even say the search exists");
  let r = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
  assert.ok(r.op_id && r.version === 2 && r.counted === true, JSON.stringify(r));
  let m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.counted_month, m.kept_by, m.version], ["qualified", true, month, owner.userId, 2]);
  assert.deepEqual(await counter("allowance", month), { used: "9.0000", reserved: "0.0000" }, "keep counts");
  const op = ok(await db.from("lead_operations").select("*").eq("id", r.op_id).single());
  assert.deepEqual([op.kind, op.before.class, op.after.class, op.version, op.by], ["keep", "review", "qualified", 2, owner.userId]);
  assert.equal(ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a })).error, "state", "kept twice is refused");

  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 })).error, "changed", "undo with the version the client did not see");
  r = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 2 }));
  assert.deepEqual(r, { ok: true, version: 3 });
  m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["review", false, null, 3], "back in review");
  assert.deepEqual(await counter("allowance", month), { used: "8.0000", reserved: "0.0000" }, "undo credits the month it counted in");
  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: 2 })).error, "undone", "undone once");

  r = ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: b }));
  assert.equal(r.version, 2);
  m = await member(ids.search1, b);
  assert.deepEqual([m.class, m.excluded_by, m.counted], ["excluded", "owner", false], "excluded by the owner, free");
  r = ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: b }));
  assert.deepEqual([r.version, r.counted], [3, true], "put back counts");
  m = await member(ids.search1, b);
  assert.deepEqual([m.class, m.counted, m.excluded_by], ["qualified", true, null]);
  assert.equal(ok(await db.from("lead_operations").select("kind").eq("id", r.op_id).single()).kind, "put_back");

  ok(await db.from("lead_suppressions").insert({ tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0203"), what: "customer" }));
  assert.equal(ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: c })).error, "hidden", "a customer is hidden");
  assert.equal(ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: d })).error, "out_of_area", "out of area stays out");
  assert.equal(ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: c })).error, "state", "exclude wants a member in review");
  assert.equal(ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: "00000000-0000-4000-8000-000000000000" })).error, "not_found");
});

test("the check qualifies a member the email standard alone held back; the last batch ends the round with the pending ending; a late page on an ended round is refused", { skip }, async () => {
  const a = (await leadByPlace("ChIJfixture0201")).id;
  let r = ok(await commit(ids.run1, "w3", 0, 28, 29, {
    places: [place(206, "review", { reasons: ["email:unknown"] })], run_state: "succeeded",
    next: { kind: "lead_check", batch: 1, run_after_seconds: 0 },
    round: { state: "checking", ending_pending: "few_new_matches" },
  }));
  assert.equal(r.round_state, "checking");
  assert.equal(ok(await db.from("lead_runs").select("state").eq("id", ids.run1).single()).state, "succeeded");
  const { count: checks } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_check").eq("payload->>round_id", ids.round1);
  assert.equal(checks, 1, "the check job");
  const e = (await leadByPlace("ChIJfixture0206")).id;
  r = ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_results: [{ lead_id: a, email_state: "ok", checked_at: new Date().toISOString() }, { lead_id: e, email_state: "invalid", checked_at: new Date().toISOString() }], p_usage_usd: 0.001, p_last: false }));
  assert.deepEqual([r.qualified, r.counted, r.ended], [1, 1, false]);
  let m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.version], ["qualified", true, 4], "the email was its only reason; now it counts");
  m = await member(ids.search1, e);
  assert.equal(m.class, "review", "a bounce stays in review, marked invalid on the lead");
  assert.equal((await leadByPlace("ChIJfixture0206")).email_state, "invalid");
  r = ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_results: [], p_usage_usd: 0.001, p_last: true }));
  assert.equal(r.ended, true, "the last batch ends the round");
  const round = ok(await db.from("lead_rounds").select("state, ending, cost_usd").eq("id", ids.round1).single());
  assert.deepEqual([round.state, round.ending, Number(round.cost_usd)], ["ended", "few_new_matches", 0.032]);
  assert.deepEqual(ok(await commit(ids.run1, "w3", 0, 29, 30, { places: [] })), { ok: false, why: "ended" });
  const late = await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round1);
  assert.match(late.error?.message ?? "", /final once ended/, "an ended round is final, to the service role too");
});

test("a top-up reserves the count minus what counted; the question waits on the owner and keep, include and stop answer it; Stop moves the generation so a late worker cannot publish", { skip }, async () => {
  let r = ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "topup", p_plan: plan(5), p_estimate_usd: 0.05 }));
  assert.equal(r.error, "nothing_to_add", "five asked and five counted");
  r = ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "topup", p_plan: plan(12, 2), p_estimate_usd: 0.05 }));
  assert.deepEqual([r.seq, r.target], [2, 5], "the count minus what counted");
  ids.round3 = r.round_id;
  assert.equal(ok(await db.from("lead_searches").select("plan").eq("id", ids.search1).single()).plan.version, 2, "the amended plan is the search's");
  assert.equal(ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "renew", p_plan: plan(12, 2), p_estimate_usd: 0.05 })).error, "live", "one live round");

  const run = await runOf(ids.round3, "personal trainer", "w4");
  ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "probing" } }));
  r = ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "waiting_on_owner", question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" } } }));
  assert.equal(r.round_state, "waiting_on_owner");
  const wrong = await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "include", p_plan: plan(12, 2) });
  assert.match(wrong.error?.message ?? "", /the amended plan is version 3/, "include carries the next version");
  r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "include", p_plan: { ...plan(12, 3), exclusions: [] } }));
  assert.equal(r.state, "running");
  const round = ok(await db.from("lead_rounds").select("plan_version, answered, target, waiting_since, plan").eq("id", ids.round3).single());
  assert.deepEqual([round.plan_version, round.answered, round.target, round.waiting_since, round.plan.exclusions], [3, "include", 12, null, []]);
  const { count: resumes } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_round_start").eq("payload->>round_id", ids.round3).eq("payload->>resume", "true");
  assert.equal(resumes, 1, "the resume job");
  assert.equal(ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "keep" })).error, "state", "not waiting any more");

  r = ok(await operator.client.rpc("lead_round_stop", { p_search_id: ids.search1 }));
  assert.deepEqual(r, { rounds: 1, runs: 1 }, "an operator may stop");
  const stopped = ok(await db.from("lead_runs").select("lease_gen").eq("id", run.id).single());
  assert.equal(stopped.lease_gen, 1, "the generation moved");
  assert.equal(ok(await db.from("lead_rounds").select("ending_pending, state").eq("id", ids.round3).single()).ending_pending, "stopped");
  const { count: stops } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "stop");
  assert.equal(stops, 1);
  assert.deepEqual(ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [] })), { ok: false, why: "lease" }, "the old worker's generation is refused");
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w4", p_seconds: 60 })), 1);
  r = ok(await commit(run.id, "w4", 1, 0, 0, { places: [], run_state: "aborted", round: { ending: "stopped" } }));
  assert.equal(r.round_state, "ended", "the abort ends the round stopped");
  assert.equal(ok(await db.from("lead_rounds").select("ending").eq("id", ids.round3).single()).ending, "stopped");
});

test("rename is the operator's; remove is the owner's and blanks what is not being worked; undo brings the search back without the leads exported since", { skip }, async () => {
  let r = ok(await operator.client.rpc("lead_search_rename", { p_search_id: ids.search1, p_name: "  Trainers,  Austin " }));
  assert.equal(r.name, "Trainers, Austin");
  const denied = await operator.client.rpc("lead_search_remove", { p_search_id: ids.search1 });
  assert.match(denied.error?.message ?? "", /Search not found/, "an operator may not remove");
  const worked = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).eq("counted", true).limit(1)).at(0).lead_id;
  ok(await db.from("leads").update({ stage: "nurture" }).eq("id", worked));
  r = ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 }));
  assert.ok(r.op_id && r.version === 1 && r.blanked >= 2, JSON.stringify(r));
  assert.ok(ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at);
  const { count: kept } = await db.from("lead_search_members").select("id", { count: "exact", head: true }).eq("search_id", ids.search1).is("blanked_at", null);
  assert.equal(kept, 1, "the worked lead's membership stays");
  assert.equal(ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 })).error, "removed");
  const exported = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).not("blanked_at", "is", null).limit(1)).at(0).lead_id;
  ok(await db.from("leads").update({ exported_at: new Date().toISOString() }).eq("id", exported));
  const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 }));
  assert.deepEqual(undone, { ok: true, restored: r.blanked - 1, kept: 1 }, "the exported lead stays as it is and stays charged");
  assert.equal(ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at, null);
});

test("a write-in whose number a lead holds is that lead (linked, converted, came from a lead you found); the desk's Add a person never links; erasing the person blanks the lead and suppresses its place and number", { skip }, async () => {
  const lead = await leadByPlace("ChIJfixture0003");
  const desk = ok(await owner.client.rpc("create_person", { p_tenant_id: A, p_phone_e164: lead.phone_e164, p_display_name: "Typed at the desk", p_source: "manual" }));
  assert.equal((await leadByPlace("ChIJfixture0003")).contact_id, null, "the desk never links");
  ok(await db.from("contacts").delete().eq("id", desk.contact_id));
  const person = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: lead.phone_e164 }).select("id").single());
  const linked = await leadByPlace("ChIJfixture0003");
  assert.deepEqual([linked.contact_id, linked.stage], [person.id, "converted"], "a write-in whose number a lead holds is that lead");
  const came = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "contact.added").eq("subject_id", person.id));
  assert.deepEqual(came.map((e) => e.data.source), ["lead"], "they came from a lead you found");
  ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", person.id));
  const gone = ok(await db.from("leads").select("blanked_at, erased_at, place_id, business_name").eq("id", lead.id).single());
  assert.ok(gone.blanked_at && gone.erased_at && gone.place_id === null && gone.business_name === "", "erasing the person blanks the lead");
  const hashes = ok(await db.from("lead_suppressions").select("kind, hash").eq("tenant_id", A).eq("what", "erased"));
  const phoneHash = await leadSuppressionHash(A, lead.phone_e164);
  const placeHash = await leadSuppressionHash(A, "ChIJfixture0003");
  assert.ok(hashes.some((h) => h.kind === "phone" && h.hash === phoneHash), "the number is on the never-again list");
  assert.ok(hashes.some((h) => h.kind === "place" && h.hash === placeHash), "and the place");
});

test("a member reads their workspace's searches with the latest round and the counts, and pages its leads; a member of another workspace reads nothing", { skip }, async () => {
  const mine = ok(await owner.client.from("lead_searches_view").select("*").eq("tenant_id", A));
  assert.equal(mine.length, 2, "both searches");
  const s2 = mine.find((s) => s.id === ids.search2);
  assert.deepEqual([s2.state, s2.ending, s2.qualified, s2.counted, s2.seq], ["ended", "stopped", 3, 3, 1], "the view carries the latest round and the counts");
  assert.deepEqual(ok(await owner.client.from("lead_searches_view").select("id").eq("tenant_id", B)), [], "nothing of another workspace");
  const first = ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 2 }));
  assert.equal(first.length, 2, "a page of two");
  const second = ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "found", p_after_key: first[1].sort_key, p_limit: 2 }));
  assert.equal(second.length, 1, "the next page carries on");
  assert.ok(!first.some((r) => r.lead_id === second[0].lead_id), "without repeating");
  assert.equal(ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "distance", p_after_key: null, p_limit: 50 })).length, 3);
  assert.deepEqual(ok(await stranger.client.from("lead_searches_view").select("id").eq("tenant_id", A)), [], "a stranger sees none of it");
  assert.deepEqual(ok(await stranger.client.rpc("leads_page", { p_tenant_id: A, p_search_id: null, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 50 })), [], "nor a page");
  assert.deepEqual(ok(await owner.client.rpc("leads_page", { p_tenant_id: B, p_search_id: null, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 50 })), [], "a wrong workspace reads nothing");
});

test("retention: an untouched lead is set aside at 90 days and blanked at 180; an excluded place is blanked at 30 but stays counted as left out", { skip }, async () => {
  const old = await leadByPlace("ChIJfixture0007");
  ok(await db.from("leads").update({ found_at: new Date(Date.now() - 91 * 86_400_000).toISOString() }).eq("id", old.id));
  const ex = await leadByPlace("ChIJfixture0205");
  ok(await db.from("lead_search_members").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("lead_id", ex.id));
  const before = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
  ok(await db.rpc("purge_leads"));
  let l = ok(await db.from("leads").select("stage, closed_reason, blanked_at").eq("id", old.id).single());
  assert.deepEqual([l.stage, l.closed_reason, l.blanked_at], ["archived", "stale", null], "set aside at 90 days, not yet blanked");
  const e = ok(await db.from("leads").select("blanked_at, place_id").eq("id", ex.id).single());
  assert.ok(e.blanked_at && e.place_id === null, "an excluded place loses its details at 30 days");
  const after_ = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
  assert.equal(after_, before, "and stays counted as left out");
  ok(await db.from("leads").update({ found_at: new Date(Date.now() - 181 * 86_400_000).toISOString() }).eq("id", old.id));
  ok(await db.rpc("purge_leads"));
  l = ok(await db.from("leads").select("blanked_at, business_name").eq("id", old.id).single());
  assert.ok(l.blanked_at && l.business_name === "", "blanked at 180");
});
```

- [ ] **Step 2: The tenancy proof learns the thirteen tables and the view**

In `tooling/scripts/tests/tenancy.db.test.mjs`, in `before()`, after the line `  await seed("jobs", { tenant_id: A, kind: "blob_thread_erase", due_at: new Date().toISOString(), payload: {} });` add:

```js
  // The lead finder (00139), in dependency order. The round is the search's
  // first (the guard allows one live round, and seq 1 needs no session).
  ctx.leadSearch = await seed("lead_searches", { tenant_id: A, via: "people", card: "local_businesses", name: "tenancy search", asked: "tenancy", plan: {} });
  ctx.leadRound = await seed("lead_rounds", { tenant_id: A, search_id: ctx.leadSearch, seq: 1, purpose: "probe", plan: {}, plan_version: 1, target: 5, month: "2026-09", day: "2026-09-19" });
  await seed("lead_runs", { tenant_id: A, round_id: ctx.leadRound, purpose: "discover", actor: "card-a", build: "1", webhook_token_hash: "tenancy" });
  await seed("lead_judgments", { tenant_id: A, round_id: ctx.leadRound, op_id: `tenancy-${Date.now()}`, answer: {} }, null);
  ctx.lead = await seed("leads", { tenant_id: A, place_id: "ChIJtenancy0001", business_name: "Tenancy Salon" });
  await seed("lead_places", { tenant_id: A, lead_id: ctx.lead, place_id: "ChIJtenancy0002" }, null);
  await seed("lead_search_members", { tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, round_id: ctx.leadRound, class: "review" }, null);
  await seed("lead_counters", { tenant_id: A, kind: "allowance", period: "2026-09" }, null);
  await seed("lead_operations", { tenant_id: A, kind: "keep", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 }, null);
  await seed("lead_preferences", { tenant_id: A, kind: "chain" }, null);
  await seed("lead_suppressions", { tenant_id: A, kind: "place", hash: "tenancy", what: "customer" }, null);
```

After the line `  await seed("waitlist", { email: \`${key}@example.com\` }, null); probes.push(["waitlist", "email", \`${key}@example.com\`]);` add:

```js
  // The lead finder's platform tables: the switch row is 00139's own; a prior is seeded and removed.
  await seed("lead_niche_priors", { category_key: `tenancy_${Date.now()}` }, null); probes.push(["lead_niche_priors", "category_key", `tenancy_${Date.now()}`]);
```

In `TENANT_TABLES`, after the `jobs:` entry (the last one), add:

```js
  // The lead finder (00139): members read, nobody signed in writes a row; the
  // judgments and the counters are the service role's. The view runs under
  // the reader's own row security (security_invoker), and is not writable.
  lead_searches: ["member", () => ({ tenant_id: A, via: "people", card: "local_businesses", name: "stranger search", asked: "stranger", plan: {} })],
  lead_rounds: ["member", () => ({ tenant_id: A, search_id: ctx.leadSearch, seq: 2, purpose: "topup", plan: {}, plan_version: 1, target: 1, month: "2026-09", day: "2026-09-19" })],
  lead_runs: ["member", () => ({ tenant_id: A, round_id: ctx.leadRound, purpose: "discover", actor: "card-a", build: "1", webhook_token_hash: "stranger" })],
  lead_judgments: ["none", () => ({ tenant_id: A, round_id: ctx.leadRound, op_id: "stranger", answer: {} })],
  leads: ["member", () => ({ tenant_id: A, place_id: "ChIJstranger0001", business_name: "Stranger" })],
  lead_places: ["member", () => ({ tenant_id: A, lead_id: ctx.lead, place_id: "ChIJstranger0002" })],
  lead_search_members: ["member", () => ({ tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, class: "review" })],
  lead_counters: ["none", () => ({ tenant_id: A, kind: "budget", period: "2026-09" })],
  lead_operations: ["member", () => ({ tenant_id: A, kind: "exclude", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 })],
  lead_preferences: ["member", () => ({ tenant_id: A, kind: "too_far" })],
  lead_suppressions: ["member", () => ({ tenant_id: A, kind: "email", hash: "stranger", what: "email_opt_out" })],
  lead_searches_view: ["member", () => ({ tenant_id: A, via: "people", card: "local_businesses", name: "stranger", asked: "stranger", plan: {} })],
```

In `OTHER_TABLES`, after `  waitlist: "none",` add:

```js
  lead_platform: "none", // the switch, one row; read through lead_searches_on()
  lead_niche_priors: "none", // platform-wide priors; read through lead_niche_prior()
```

- [ ] **Step 3: The register learns the two clocks**

In `tooling/scripts/tests/sweep-registry.db.test.mjs`, replace

```js
  registration: "registration-sweep",
  snoozes: "wake-stale-snoozes",
};
const RUN_JUDGED = ["partitions", "pauses", "purge_ask", "purge_cron_history", "purge_events", "purge_notifications", "purge_rate_hits", "snoozes"];
```

with

```js
  registration: "registration-sweep",
  snoozes: "wake-stale-snoozes",
  // The lead finder (00139): a five-minute clock that asks the edge only when
  // a run is live or a round waits, and its nightly purge.
  leads: "leads-sweep",
  purge_leads: "purge-leads",
};
const RUN_JUDGED = ["partitions", "pauses", "purge_ask", "purge_cron_history", "purge_events", "purge_leads", "purge_notifications", "purge_rate_hits", "snoozes"];
```

and in the header comment change `names all seventeen cron jobs` to `names all nineteen cron jobs`.

- [ ] **Step 4: Run the database suites on the replayed stack**

Run: `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; export SUPABASE_CLI="$SB"; node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-engine.db.test.mjs`
Expected: `# tests 15`, `# pass 15`, `# fail 0`. If sign-in fails, the test fails with the auth error: never a pass.

Run the whole database workflow the way CI does: `"$SB" db reset` (a clean database: the suites above left rows), then `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; export SUPABASE_CLI="$SB"; corepack pnpm test:db`
Expected: `# fail 0`. `privileges.db.test.mjs` needs `SUPABASE_CLI` exported, or its tests fail with a spawn ENOENT. If `jobs-outbox.db.test.mjs` "a claim takes what is due" returns `[]`, another file claimed the row first; re-run that file alone after a fresh reset before calling it a regression.

Run: `SUPABASE_CLI="$SB" corepack pnpm check:db-types && SUPABASE_CLI="$SB" node tooling/scripts/gen-schema-sets.mjs --check`
Expected: `packages/db/src/database.types.ts is current` and `schema-sets.generated.ts is current (73 sets).`

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/tests/lead-engine.db.test.mjs tooling/scripts/tests/tenancy.db.test.mjs tooling/scripts/tests/sweep-registry.db.test.mjs
git commit -m "The engine proved on Postgres: the reservation, the claim, the lease, one page in one transaction, five asked and twenty qualified count five, the shared-phone triple, keep and undo, a member reads only their own" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: The record, the whole suite, the PR, the production push, the merge

**Files:**
- Modify: `apps/dashboard/src/legacy/CLAUDE.md`, `apps/dashboard/src/legacy-bridge/surface-registry.ts`, `docs/system-prd.md`

- [ ] **Step 1: Record the lifted decision where the old one is written**

PRD v3's top says the lift is recorded "before any Leads code lands"; this is the first Leads code. In `apps/dashboard/src/legacy/CLAUDE.md`, in the status blockquote, replace

```md
> tasks), Content, Pipeline and Leads, the shared report viewer — stay here and stay hidden from every real workspace.
```

with

```md
> tasks), Content, Pipeline, the shared report viewer — stay here and stay hidden from every real workspace.
```

and after the line `> Nothing below this line is a plan to build them.` add:

```md
>
> **Lifted for Leads, 18 September 2026:** Ruben lifted "hidden until 100%" for the lead finder, table first
> (docs/plans/2026-09-17-people-table-and-lead-finder.md). Release A (00139, the engine) lands with no screen and the
> switch off; Leads becomes a scope of People (`clients/leads…`) in release B, built from `pages/people-table.jsx`
> lifted out of `clients-a.jsx`. The seeded `pages/leads.jsx` is retired. The stored sets are 00139's: a lead's stage is
> `ready`, `nurture`, `converted` or `archived` with a reason; `qualifying` and `new` are the mockup's and are never stored.
```

In `apps/dashboard/src/legacy-bridge/surface-registry.ts`, replace

```ts
  leads: "demo",     // retired into People: the booking is the conversion, and People shows who booked (SURFACE_RETIRED)
```

with

```ts
  // Lifted 18 Sep 2026 (Ruben): leads becomes a scope of People, clients/leads, in release B of the lead finder
  // (docs/plans/2026-09-17-people-table-and-lead-finder.md); 00139 holds the engine. Until then this route stays demo.
  leads: "demo",     // retired into People: the booking is the conversion, and People shows who booked (SURFACE_RETIRED)
```

In `docs/system-prd.md`, at the end of the paragraph beginning `The operator UI is a ported HTML mockup` (it ends `and none is built before then.`), append the sentence ` Ruben lifted the rule for the lead finder on 18 September 2026 (the table first): the mockup's Leads page is retired, release A of the finder (00139) is the engine with no screen, and Leads becomes a scope of People in release B.`

And in the paragraph beginning `Closed since the first edition:` replace `(Δ9, Δ10 — decided and written where the code is: hidden, revisited at 100%)` with `(Δ9, Δ10 — decided and written where the code is: hidden, revisited at 100%; Leads lifted 18 Sep 2026 for the lead finder, 00139 being its engine)`.

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/route-policy.test.mjs tooling/scripts/tests/route-types.test.mjs`
Expected: `# fail 0` (comments only: no surface, route or manifest changed).

```bash
git add apps/dashboard/src/legacy/CLAUDE.md apps/dashboard/src/legacy-bridge/surface-registry.ts docs/system-prd.md
git commit -m "The decision to keep Leads hidden is lifted for the lead finder, and said so where it was written" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 2: Bring the branch up to main**

Run: `git fetch origin && git log --oneline HEAD..origin/main`
Expected: no output. If main moved, `git rebase origin/main`, resolve anything in the files above, rebuild the dists (Task 4, Step 5), and re-run this task from Step 3.

- [ ] **Step 3: Re-check the migration number, right before pushing**

Run the command of Task 0, Step 4 again.
Expected: nothing else holds 00139. If something does, `git mv supabase/migrations/00139_the_lead_finder_engine.sql supabase/migrations/<next>_the_lead_finder_engine.sql`, then find every mention with `grep -rn "00139" --include=*.sql --include=*.mjs --include=*.ts --include=*.md . | grep -v node_modules` and change each: the migration's own header and comments, `lead-search.ts`, `lead-judge.ts`, `enums.ts`, `config.ts`, `retention.ts`, `erasure.ts`, `ledger.ts`, `handlers.ts`, the five test files, `CLAUDE.md`, `surface-registry.ts`, `docs/system-prd.md` and this plan. Rebuild the dists (the contracts `.d.ts` carries the comments), `db reset`, regenerate the types, and commit.

- [ ] **Step 4: The whole unit suite, the lint, the types, the build**

Run these in a fresh shell without the `SUPABASE_*` variables:
- `corepack pnpm test`. Expected: `# fail 0` (`# tests 3020` or so: 3005 before this plan plus the fifteen database tests, all skipped without env; `# skipped 194`).
- `corepack pnpm check:dist`. Expected: `dist in sync with src`.
- `corepack pnpm -r typecheck`. Expected: `Done` for all seven (five packages, two apps).
- `corepack pnpm lint`. Expected: `0 errors` (37 warnings are main's; none in the files this plan touches: `corepack pnpm exec eslint packages/contracts/src/lead-search.ts packages/contracts/src/lead-judge.ts packages/jobs/src/handlers.ts tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-judge.test.mjs tooling/scripts/tests/lead-jobs.test.mjs tooling/scripts/tests/lead-engine.db.test.mjs` prints nothing).
- `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-build-placeholder corepack pnpm --filter @chanlytics/dashboard build`, with CI's placeholders. Expected: the build completes.

- [ ] **Step 5: Push and open the PR**

Run: `git rev-parse --abbrev-ref HEAD` (expected `feat/lead-finder-a1`), then `git push -u origin feat/lead-finder-a1`.

Write this body to a file in your scratchpad with your file tool, then run `gh pr create --repo expectmeout/chanlytics-os --base main --head feat/lead-finder-a1 --title "The lead finder's engine: the data and the contracts (00139, release A1)" --body-file <that file>`:

```md
Release A1 of the lead finder, planned in docs/plans/2026-09-19-lead-finder-A1-data.md (PRD v3 §0, §12.3–12.6). No screen, no provider call, the switch off for everyone: the engine's data, its doors and RPCs, and the contracts.

## What changes
- **00139.** Thirteen tables (a search, its rounds and runs, the judge's answers by operation id, the places found, duplicate listings, one membership per search per place, the counters, the undo records, learned exclusions, the never-again list, platform priors, the switch); row security in the 00002 shape with no write policy; the doors an owner's routes will call (`lead_search_create` reserves the count and the estimate in one transaction and writes the probe round and its start job; answer, stop, more, keep/exclude/put back, undo, rename, remove) and the RPCs the edge's jobs will call (claim, record, lease, release, `lead_collect_commit` as one page in one transaction, `lead_check_commit`, `lead_round_end`); `lead_searches_view`; `leads_page`; the guards (a round is final once ended; a claim and a webhook token are written once); the write-in link and the erasure; the clock, registered, that asks the edge only when there is lead work; the nightly purge.
- **Contracts.** `lead-search.ts`: the plan (zod 4) and its sentence, versions, the nine endings and their words, the cards' briefs, the estimate, `placesToAsk` (S6), `classify` (§0.1: code decides from the judge's per-criterion answers), `questionAfterProbe` (P4), the cleaner (§7.2), `leadMonth`. `lead-judge.ts`: the facts, the hand-written JSON schema, the rubric, the quoted content, the zod parser, `judgeOpId`. `JOB_KINDS` + 3 with their retry waits and a seam on `JobContext` the edge fills in A2; `EVENT_KINDS` + 2; `ROLE_PERMS.find` (owner only), restated once in SQL as `has_permission`; retention's three numbers; `leadSuppressionHash`.

## Proof
`lead-search.test.mjs` (12), `lead-judge.test.mjs` (6) and `lead-jobs.test.mjs` (2) were red before their commits and green after; `lead-engine.db.test.mjs` (15) proves the engine on Postgres with real sessions: the reservation and the refusals in a sentence, the claim, the lease by owner and generation, the compare-and-set commit that never doubles, five asked and twenty qualified counting five, the shared-phone triple with no person made, keep/exclude/put back and undo by version, the hidden and out-of-area refusals, the check, Stop moving the generation, the write-in link, the erasure, a member's reads under row security, retention. The tenancy proof lists every new table and the view; the register lists the two clocks; the types and the sets are regenerated from the database.

## Order
This PR carries a migration, so 00139 goes to production first (a dry run, the push, a read-back), and then it merges. The code is safe on either side of it: nothing calls a door until A2's routes exist, and the clock asks the edge for nothing until a round exists.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Wait for CI (`gh pr checks <number> --repo expectmeout/chanlytics-os --watch`). If a check fails, read its log and fix it. A red Database job with every step failing in about 2 seconds is a billing block; read the run's annotations. **Do not merge yet**: the PR carries a migration.

- [ ] **Step 6: Push 00139 to production, then merge**

The production push is the agent's (Ruben, 18 Sep). Run it from this worktree, on the PR's branch, once CI is green. A worktree has no Supabase link of its own: if `supabase/.temp/project-ref` is missing, copy the main checkout's `supabase/.temp` in first.

```bash
SB="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
"$SB" db push --linked --dry-run </dev/null
```

Expected: the dry run lists exactly `00139_the_lead_finder_engine.sql`. If it lists anything else, stop and find out why before pushing.

```bash
"$SB" db push --linked --yes </dev/null
"$SB" db query --linked "select string_agg(version, ',' order by version desc) from (select version from supabase_migrations.schema_migrations order by version desc limit 3) t"
"$SB" db query --linked "select searches_on, tenants_on from public.lead_platform; select sweep, healthy, detail from public.sweep_health() where sweep in ('leads', 'purge_leads')"
```

Expected: the head starts with `00139`; `searches_on` is `false` and `tenants_on` is `{}` (nobody may search until Ruben lists the nightly's workspace for A2, or flips the switch); both clocks are `healthy` (`leads` on the look it was seeded with, `purge_leads` inside its first 26 hours). Then merge, from a folder that is not a git checkout: `gh pr merge <number> --repo expectmeout/chanlytics-os --squash --delete-branch`.

If Claude Code's auto-mode classifier refuses the push, never reroute it: finish everything else and hand Ruben these PowerShell one-liners, run from this worktree:

```powershell
Set-Location "C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-lead-a1"; & "$env:LOCALAPPDATA\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe" db push --linked --dry-run
```

```powershell
Set-Location "C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-lead-a1"; & "$env:LOCALAPPDATA\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe" db push --linked
```

**Phase 1 release A2 starts at the next free number.** A2 has no migration of its own (the interface's Migration 00139 is A1's whole database change); if A2 turns out to need one, it takes the number that is free then, never 00140 by assumption.

---

## Proven before this plan was written

Everything below ran in a worktree at origin/main `fbc5d871` on 19 September 2026 (Windows, Git Bash, Node 22, the local Supabase stack at Postgres 17.6). Nothing was committed anywhere and nothing reached the shared local database outside a rolled-back transaction.

**The contracts and their tests.**
- `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-judge.test.mjs` → `# tests 18`, `# pass 18`, `# fail 0`.
- `corepack pnpm --filter @chanlytics/contracts typecheck` (before the sets were regenerated) → exactly one error, `src/schema-sets.ts(69,9): error TS2344` (the `jobs.kind` line); after regeneration → no error.
- `corepack pnpm --filter @chanlytics/jobs typecheck` → no error.
- `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-jobs.test.mjs tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/jobs-ledger.test.mjs tooling/scripts/tests/line-provision.test.mjs` → `# tests 31`, `# pass 31`, `# fail 0`.
- `… retention-words.test.mjs gate-reason.test.mjs exports.test.mjs event-kinds.test.mjs jobs-ledger.test.mjs` (over the rebuilt dist) → `# tests 45`, `# pass 45`, `# fail 0`.
- `… store-retired.test.mjs delete-tenant.test.mjs source-scan-ratchet.test.mjs tenancy.db.test.mjs sweep-registry.db.test.mjs event-kinds.test.mjs` (no database in env) → `# tests 22`, `# pass 15`, `# fail 0`, `# skipped 7`.
- `corepack pnpm test` (no database in env) → `# tests 3005`, `# pass 2826`, `# fail 0`, `# skipped 179`. Before the two lint edits of Task 3, Step 7 the same run was `# fail 2`: `the script backs up every table that carries a tenant_id` and `the queue's kinds: each one handled and each one scheduled somewhere`; both are the reason for those edits.
- `corepack pnpm -r typecheck` → `Done` for contracts, channels, db, core, jobs, edge, dashboard.
- `corepack pnpm lint` → `✖ 37 problems (0 errors, 37 warnings)`, all on main already; `eslint` over the files this plan creates or edits → no output.
- `node tooling/scripts/check-dist.mjs` then the keep-real-diffs loop → all five dists carry a real diff (`contracts`, `db`, `jobs`, `channels`, `core`). Before the handlers' seam existed the jobs build failed with `error TS2739: Type '{ outbound_send… }' is missing the following properties from type 'Record<"outbound_send" | … | "lead_check", Handler>': lead_round_start, lead_collect, lead_check`, which is the reason for Task 3, Step 6.
- `node --check tooling/scripts/tests/lead-engine.db.test.mjs` → no output; `eslint` on it → no output; run without a database → `# tests 15`, `# skipped 15`.

**The migration.** The local database was at 00133, so each run applied 00134, 00135, 00137 and 00138 first, all inside one transaction that ended in `rollback`.
- `( echo 'begin;'; cat 00134… 00135… 00137… 00138… 00139_the_lead_finder_engine.sql; echo 'rollback;' ) | docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1` → the statements' own tags, `(0 rows)` twice (the two `cron.unschedule … where exists`), then `ROLLBACK`; exit 0; no `ERROR`.
- The same, with a proof script of thirteen `do $$ … assert … $$` blocks between the migration and the rollback (a world of two workspaces, an owner, an operator and a viewer in the first and an owner in the second, `auth.uid()` simulated by `set_config('request.jwt.claim.sub', …, true)`, the member path under `set local role authenticated`) → its last line `PROVED: every block of prove-00139.sql held`; exit 0. The blocks: A the helpers and mirrors (`lead_month` in Chicago, the hash equal to contracts' `leadSuppressionHash` for `11111111-…:+15125550100` = `fac8c45f…9ac9`, `has_permission` per role, the switch off then listed, the prior); B create (paused, no_card with its event, the ids, the round's target 5 and reservation, all four counters, the job, the event; 496 refused `left 495` with its sentence; 495 taken; 1 refused `left 0` "You have found this month's 500 leads. Your leads renew on Oct 1."; a stranger's create raises 42501; an estimate over 25 raises 22023; the day cap at 11, a search at 9, the second refused, released by `lead_round_end`, the budget binding at 20 used + 9); C the run (claim once, record by the claimer only, lease 0 then held by another, a wrong generation/owner/offset refused, `counted 5, qualified 20, round_state probing`, the round's `allowance_used 5`, `cost_usd 0.02`, `judge_tokens 1200`, the month counter `5 used / 495 reserved`, the budget `0.02 / 0.53`, 20 leads, 5 counted members, the next collect once, the judgment once, the replay refused by offset with nothing doubled, a second page with the same op_id paying nothing and its next job written once, release by holder and generation only); D the shared-phone triple (three leads, one number, two delivered and marked with the person, no person made, three counted); E a duplicate folding into the lead held and two suppressed places skipped; F keep/exclude/put back/undo (round 2 ended and released, `8 used / 0 reserved`; an operator's keep refused; keep → op, version 2, counted this month, `9 used`; kept twice refused; undo with version 1 refused `changed`; undo with 2 → version 3, back in review, `8 used`; undone twice refused; exclude → owner's, free; put back → counted; a customer's place `hidden`; `out_of_area`; exclude on an excluded member refused `state`; an unknown lead `not_found`); G the check (the round to `checking` with the run succeeded and a check job; one member qualifying on `ok`, a bounce staying in review with the lead marked `invalid`; the last batch ending the round `few_new_matches` with `cost_usd 0.032`; a late page refused `ended`); H the guard (an ended round's state and target refused; the edge's insert of a seq-2 round refused); I answer/stop/more/rename/remove/undo_search (`nothing_to_add`; a top-up of seq 2 with target 5 and the plan's new version on the search; `live`; the question waiting; include with the wrong version raising 22023; include with version 3 running with the plan amended and a resume job; keep on a running round `state`; Stop moving the generation, writing the stop collect, `ending_pending stopped`, the round still running; the old worker refused `lease`; the abort ending it `stopped`; rename trimmed; an operator's remove refused; remove blanking all but the worked lead; removed twice refused; undo restoring all but the exported lead); J the write-in link (the desk's insert never links; the edge's links and converts with `contact.added {source: lead}`; erasing the person blanks the lead and hashes its number and place as `erased`); K the reads under row security (the owner's two searches with the latest round and counts, nothing of the other workspace, two pages without repeats, a page by distance, a stranger reading nothing); L retention and the clocks (set aside at 91 days, not yet blanked; an excluded place blanked at 31 days with the view's `excluded` unchanged; blanked at 181; both clocks scheduled and registered; `sweep_health()` nineteen rows with `leads` and `purge_leads` healthy; the clock recording a look and asking nothing when nothing is live); M the privileges (the service role's four tables refuse `authenticated` the privilege; `anon` holds nothing; a session reads and never writes; a door executable by `authenticated` and not `anon`; an RPC by `service_role` and not `authenticated`; trigger functions callable by nobody; every lead function pins `search_path`; row security on everywhere).
- The generator's own query, run inside the same rolled-back transaction, returned 73 sets; rendered with the generator's `entry()` they differ from the committed `schema-sets.generated.ts` by exactly the `jobs.kind` change and the nineteen lead entries printed in Task 4, Step 3.

**What was not run,** and where the plan runs it: `supabase db reset` and `gen:db-types` on the shared local stack (Task 4, Step 3, in the executor's own worktree), `lead-engine.db.test.mjs` through PostgREST (Task 5, Step 4: its assertions are the proof's blocks), the Database workflow (CI), the production push (Task 6).

---

## Self-review against PRD §0 and §12.4, and the interface

**§0.1 Qualification.** The judge answers per criterion with the fact keys it used, picks the email by index, writes one reason (`lead-judge.ts`: the schema, the rubric, the parser); code decides the class (`classify`): a required fail excludes with its key, any unknown, a seen criterion answered without a fact, no location or out of area, or a contact standard not met is review; a fit band is derived for ordering only. Keep counts, Exclude is free, Put back is the owner's override through the same door and never revives a suppression or an out-of-area place (`lead_member_move`). Include re-judges under the amended plan (the round carries version + 1; A2 re-judges).
**§0.2 Counting and money.** Only Qualified counts (`lead_collect_commit` counts `class = 'qualified'` up to the round's reservation; `lead_check_commit` counts a member the email standard alone held back; `lead_member_keep`/`put_back` count through the month); five asked and twenty qualified count five (block C; the test). Reserve, settle, release in one lock order (`lead_reserve`, `lead_settle_usage`, `lead_release`, `lead_round_end`). Undo credits the month the lead counted in, never the budget; an exported lead stays charged (`lead_undo`). The owner sees one unit: the refusals are sentences about leads.
**§0.3 Sources.** No provider here; the card's brief (`LEAD_CARDS`) is the half Claude reads; an unapproved card never runs (`no_card`, logged as demand); no word names a vendor (the test walks every exported string of both modules).
**§0.4 Consent.** Leads live outside `contacts`; a lead becomes a person only when they write or call in (`lead_link_contact`, the edge's insert only); erasure blanks and writes the tombstones (`leads_erase_on_contact`, `lead_suppression_hash`); suppression is by what happened (`lead_suppressions.what`); take the least (`lead_blank`, `purge_leads`, retention's three numbers). The consent doors are untouched.
**§0.5 A search's life.** The search is the saved object; a round is the unit of execution and money with its plan version, reservation, spend and one of nine endings, final once ended (`lead_rounds_guard`); the states and endings are the interface's sets; size from yield (`placesToAsk`); the claim, the token made once, unknown reconciled, the lease by owner and generation, Stop moving the generation, one page one commit, the judgment by operation id (`lead_runs_guard`, the RPCs); the question is an intent check that names the most common exclusion and drops a term (`questionAfterProbe`); after Stop the emails are still checked (`ending_pending`, `lead_check_commit`).

**§12.4, table by table:** `lead_searches` (no state, no counters), `lead_rounds` (`unique (search_id, seq)`, the ending set, final once ended), `lead_runs` (the claim written once, the token never rewritten, the lease renewed and released by owner and generation, Stop bumping `lease_gen`), `lead_judgments` (`op_id` unique), `leads` (`unique (tenant_id, place_id)` partial, no unique email or phone, plain indexes on phone, email and host), `lead_places`, `lead_search_members` (`unique (search_id, lead_id)`, `counted_month`, `version`), `lead_counters` (`unique nulls not distinct`, the lock order), `lead_operations`, `lead_preferences`, `lead_suppressions`, `lead_niche_priors` (read through `lead_niche_prior`), `lead_platform` (`searches_on`, `tenants_on`, read through `lead_searches_on`). RLS: member select in the 00002 shape, no write policy, the four service-role tables refusing the privilege. Doors: `lead_search_create`, `lead_round_answer`, `lead_round_stop`, `lead_search_more`, `lead_member_keep`/`exclude`/`put_back`, `lead_undo`, `lead_search_rename`, `lead_search_remove`; readers `lead_searches_on`, `lead_niche_prior`, `lead_month`, `has_permission`. Service RPCs: `lead_run_claim`, `lead_run_record_start`, `lead_run_mark_unknown`, `lead_run_reconcile`, `lead_run_lease`, `lead_run_release`, `lead_collect_commit`, `lead_check_commit`, `lead_round_end`; `lead_round_estimate_usd` is not created (the route computes, `p_estimate_usd` is stored). `lead_searches_view` and `leads_page`. Triggers: `lead_rounds_guard`, `lead_runs_guard`, `leads_erase_on_contact` (the allow-list `lead_blank`), `lead_link_contact`. Jobs: the three kinds in the CHECK, `JOB_KINDS`, the sets, `RETRY_WAITS_MS`, the partial unique index on `(payload->>'run_id', payload->>'seq') where kind = 'lead_collect'`. Events: `lead.round`, `lead.no_card`, emitted from SQL. Realtime: `lead_rounds`, `lead_search_members`, `leads`. Retention: 90, 180, 30, in `purge_leads` and `RETENTION_DAYS`. The clock `leads` in `sweep_status` and `cron.job`, `purge_leads` beside the other purges.

**The interface, item by item:** the sets (all fourteen, held in `schema-sets.ts`); every id `uuid default gen_random_uuid()`; `tenant_id … on delete cascade` everywhere but the three platform tables (and nullable on `lead_counters`); member select except the four; the doors' signatures and behaviours (with `p_estimate_usd` on create and more, `due_at` for `run_after`); the service RPCs' signatures and refusals (`why: lease | offset`, plus `run` and `ended`); `lead_searches_view`'s columns; `leads_page`'s arguments and sort keys; the jobs payloads; the contracts' exports (every one listed under Contracts A1, with `LeadClassification`, `ProbeMember`, `LeadQuestion`, `CleanedEmails`, `LeadCardBrief` and the constants beside them); `lead-judge.ts`'s exports (with `JUDGE_FACT_KEYS`, `JudgeCriterionAnswer` and `sha256Hex` beside them). The fourteen departures are listed under *Read this first*.
