# The generated types are guarded

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One session.

**Goal:** `packages/db/src/database.types.ts` cannot drift from the migrations without CI saying so. Today it is the one generated artifact in the repository with no check: `.github/workflows/ci.yml:61-63` is a comment describing a freshness check and no step implementing it; no test references the file; `eslint.config.mjs:57-58` ignores it. An added column fails typecheck the moment code uses it, but a **dropped or retyped** column stays in the types, typechecks clean, and fails in production.

**Architecture:** The check lives where the database already exists in CI. `.github/workflows/database.yml` replays all 118 migrations from zero with `supabase start` (CLI 2.116.0) and already proves one generated file against that database — `node tooling/scripts/gen-schema-sets.mjs --check` (`database.yml:67`). The types get the same treatment: regenerate from the **local** stack (`supabase gen types typescript --local`, which needs no access token) and compare with the committed file through a small node script with a `--check` mode, modelled on `gen-schema-sets.mjs`. The comparison ignores exactly one line and says why.

**Tech stack:** GitHub Actions, the Supabase CLI already pinned in the workflow, one `.mjs` script under `tooling/scripts/`, one `node:test` behaviour test for the comparison. `pnpm` is corepack-only.

**Rules:** No `readCode`/`readRaw` in the new test — the comparison is a function, test it with two strings. The regen command stays documented in one place. Commit messages are one sentence in the house voice.

---

## Why (measured 13 September 2026)

- Generation: `packages/db/package.json:18` — `"gen:types": "supabase gen types typescript --linked > src/database.types.ts"`. `--linked` needs `SUPABASE_ACCESS_TOKEN`, which CI does not hold by policy (`ci.yml:64`).
- The house rule (`docs/plans/2026-09-09-the-system-it-should-be.md:23`): "Every migration is followed by `cd packages/db && supabase gen types typescript --linked > src/database.types.ts` and the regenerated types are committed with it." A rule with no check is a convention, and this one has a subtle flaw: `--linked` reads the *linked project's* schema, which carries a new migration only after `supabase db push` — so the rule, followed literally before the push, generates yesterday's types.
- The file: 3,294 lines, no CLI banner. One environment-dependent line — `packages/db/src/database.types.ts:13` `PostgrestVersion: "14.5"` inside `__InternalSupabase` — which the generator takes from the running PostgREST. The local stack may report another version; that line is noise, not drift.
- `database.yml` is path-filtered and `packages/db/src/**` and `supabase/**` are both triggers, so any migration and any regeneration already fire it. (Making it a *required* check is its own plan: `2026-09-13-the-replay-is-a-required-check.md`.)

## Task 1 — The check script

**Files:**
- Create: `tooling/scripts/check-db-types.mjs`
- Create: `tooling/scripts/tests/check-db-types.test.mjs`
- Modify: `package.json` (root scripts) — `"check:db-types": "node tooling/scripts/check-db-types.mjs --check"`, `"gen:db-types": "node tooling/scripts/check-db-types.mjs"`
- Modify: `packages/db/package.json` — keep `gen:types` or point it at the root script; one documented way to regenerate, not two that disagree.

- [ ] **Step 1: the comparison, as a function.** Export `normalise(src)` (drops the single `PostgrestVersion: "…"` line, normalises CRLF to LF) and `compare(committed, generated) → { same: boolean, committedVersion, generatedVersion, diffHint }`. Keep it dependency-free.
- [ ] **Step 2: the script.** Runs `supabase gen types typescript --local` (honour `SUPABASE_CLI` like `gen-schema-sets.mjs` does, including the `.js` launcher case), reads `packages/db/src/database.types.ts`, and: without `--check` writes the generated file in place; with `--check` exits 0 when `same`, otherwise exits 1 printing the two `PostgrestVersion`s (information only) and the fix — `supabase start && corepack pnpm gen:db-types`, then commit. Refuse loudly (exit 2) when the CLI cannot be reached, as `gen-schema-sets.mjs` does — a check that cannot run must not pass.
- [ ] **Step 3: the test.** `compare()` over two strings: identical → same; differing only in `PostgrestVersion` → same, both versions reported; a renamed column → not same; a dropped table → not same. No source reads.

## Task 2 — The workflow

**Files:**
- Modify: `.github/workflows/database.yml` — after `supabase start` and beside the schema-sets check, add `- run: corepack pnpm check:db-types` (or `node tooling/scripts/check-db-types.mjs --check`), with a two-line comment in the file's register saying what it proves and what to run when it is red.
- Modify: `.github/workflows/ci.yml:61-63` — replace the comment that describes the never-built check with one line pointing at `database.yml`.

- [ ] **Step 1: add the step; keep `supabase stop --no-backup` with `if: always()` last.**
- [ ] **Step 2: grep first.** `grep -rn 'ci.yml\|database.yml\|database.types' tooling/scripts/tests/` — move or update any pin on those files before editing them.

## Task 3 — Prove it bites, then prove it is green

- [ ] **Step 1:** Open the PR. `database.yml` runs (the workflow file is in its own trigger list). Expect green: the committed types match the replayed migrations. If they do **not**, that is a real finding — the file has already drifted — and the fix is to regenerate and commit, in this PR, saying so in the PR body.
- [ ] **Step 2:** Push one deliberate red: edit one field name in `database.types.ts`, watch the check fail with the message that names the fix, revert. (A check nobody has seen fail has not been proven.)
- [ ] **Step 3:** Update `docs/plans/2026-09-09-the-system-it-should-be.md:23`'s regen sentence to the new command, and the "What CI does not cover" list in `docs/system-map.md` (strike the `database.types.ts` line; move item 4 of "The distance to 100%" to done with the PR number).

## Done means

- A schema change that is not followed by a regeneration turns the Database check red on the PR, with a message that says what to run.
- The comparison ignores exactly one line and the script says which and why.
- `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test` green; the baseline unchanged (this plan adds no source reads).
