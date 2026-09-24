# An answer re-judges the first places — Implementation Plan (PR 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the owner answers a search's question by changing the plan (Include, or Change what I asked), the
places the probe already judged are judged again under the new plan, so what the answer lets in comes back and what it
now leaves out goes.

**Architecture:** Spec item 5 of `docs/superpowers/specs/2026-09-24-the-question-takes-a-no-design.md`. PR 1 (#962,
`c64f6d12`) is merged. The runner does the reading and judging on the resume after an `include` answer, before the main
phase is sized; a new service door, `lead_round_rejudge`, commits the verdicts in one transaction. No new job kind, no
new round kind, nothing reserved: counting uses the round's own reservation, as the collect does.

**Worktree:** `cm-lead-question`, branch `feat/an-answer-rejudges-the-first-places`, off `c64f6d12`.

---

## Why the runner cannot just re-class what it stored

A left-out place keeps no email and no listing details (PRD §0.4; `memberOf` blanks them), so a chain the owner now
includes would come back as a name and a phone. The probe's own items are still at the source (a dataset outlives the
day a question waits), so they are read again (a read, not a run) and cleaned as the collect cleaned them.

## Tasks

### Task 1: The door, red first

**Files:** `tooling/scripts/tests/lead-engine.db.test.mjs` (test "an answer that changed the plan re-judges the first
places…"); then `supabase/migrations/00165_an_answer_rejudges_the_first_places.sql`.

- [ ] Commit the test alone; open the draft PR; wait for the database workflow to go red.
- [ ] `lead_round_rejudge(p_round_id uuid, p_plan_version integer, p_places jsonb, p_judgment jsonb default null)`,
  security definer, service role only:
  - lock the round; `{ok:false, why:'round'|'state'|'version'}` unless it is `running` at `p_plan_version`;
  - keep each judgment once by `op_id`, adding its tokens (as `lead_collect_commit`);
  - per place: the lead by place id (skip blanked or erased), its member in this search and round (skip blanked); skip
    the owner's decisions (`kept_at`, `excluded_by = 'owner'`, a lead past Ready or linked to a person) and a member
    already judged at this version (`judgment.plan_version`);
  - write class, exclusion, fit, reason, the judgment with `plan_version` and the old `shares`, `version + 1`;
  - leaving Excluded: fill the listing columns and the email where empty; entering Excluded: clear them (§0.4);
  - count a newly Qualified member while the reservation has room; un-count one no longer Qualified; move the round's
    `allowance_used` and the month counter's used/reserved by the difference;
  - one `lead.round` event `{rejudged, plan_version}`; answer `{ok, changed, counted, uncounted}`.
- [ ] Types: the function in `packages/db/src/database.types.ts` in generator order.

### Task 2: The runner

**Files:** `packages/core/src/leads/{ports,runner}.ts`, `apps/edge/lib/leads/lead-db.ts`,
`tooling/scripts/tests/_lead-world.mjs` (the door in memory), `tooling/scripts/tests/lead-runner.test.mjs`.

- [ ] `LeadMemberRow` gains `place_id` and `decided`; `MemberJudgment` gains `plan_version?`; `LeadDb.roundRejudge`.
- [ ] `rejudgeProbe(p, round)`: the members the judge answered below the round's version and not decided; the probe
  runs' items read again and cleaned (suppressions applied); a stored answer reused when it answers every key the plan
  asks (the kind, every exclusion, every criterion), else judged again in batches of 25 under the deadline (op id per
  version and batch); out-of-area by the plan's area; `memberOf` for each; marks read for places leaving Excluded; one
  commit per batch. A refused batch is left as it was.
- [ ] `startRound` calls it on the resume after an `include` answer, before reading the members it sizes from.
- [ ] Tests over the fake world: a pure lift re-classes from stored answers with no judge call, and the chains come
  back counted with their emails; a new key judges the pending places once; a second resume changes nothing.

### Task 3: Verify and ship

- [ ] Rebuild every package, commit real dist diffs; typecheck, lint, format, the full suite.
- [ ] One combined review; fix; push; the four checks green; `db push` 00165 (dry run lists only it); read back; merge.
