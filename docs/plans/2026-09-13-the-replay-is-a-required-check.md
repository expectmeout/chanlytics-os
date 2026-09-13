# The replay is a required check

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One session, and the last step is Ruben's.

**Goal:** A red migrations replay blocks a merge, on a product whose entire safety model lives in the schema — and a pull request that leaves the database alone is not held for a check that never ran. Today branch protection requires only `Secret scan` and `Typecheck` (the two jobs of `ci.yml`); `database.yml`'s job, `Migrations replay, SQL rules hold`, is path-filtered and therefore cannot be required: a PR that touches no database path would produce no check and wait forever.

**Architecture:** One workflow, always present on a pull request, cheap when the database could not have changed. `database.yml`'s `pull_request` trigger loses its `paths`; a first step decides from the PR's changed files whether the database could have changed; every heavy step is gated on that answer; the job succeeds either way and says which case it was. The decision is a function in `tooling/scripts/`, executed by a test, so the path list is code rather than YAML in two places. Then a human makes the check required in GitHub's branch settings — there is no API tool in this session for that, and the plan says so rather than pretending.

**Tech stack:** GitHub Actions; `git diff --name-only` against the PR base with `fetch-depth: 0`; one `.mjs` script and one `node:test` file. `pnpm` is corepack-only.

**Rules:** The path list lives once. No `readCode`/`readRaw`. The header comment of `database.yml` (lines 2–18), which today explains why the check is *not* required, is rewritten to explain the new shape. Commit messages are one sentence in the house voice.

---

## Why (measured 13 September 2026)

- `.github/workflows/database.yml:15-18`: "Branch protection requires Secret scan and Typecheck only, so a pull request that leaves the database alone is not held for a check that did not run. Two workflows on every push spent the included minutes by 11 September." Both constraints are real and both survive this plan: an ungated run is a checkout and one `git diff` (~30 s), not a `supabase start`.
- `database.yml` job id `replay`, `name: Migrations replay, SQL rules hold` — GitHub matches a required status check by that job name.
- Triggers today (`pull_request` and `push: main`, same list): `supabase/**`, `tooling/scripts/tests/*.db.test.mjs`, `tooling/scripts/tests/*.integration.test.mjs`, `packages/db/src/**`, `tooling/scripts/gen-schema-sets.mjs`, `packages/contracts/src/schema-sets.generated.ts`, `.github/workflows/database.yml`, `package.json`, `pnpm-lock.yaml`.
- Concurrency: `database-${{ github.event.pull_request.number || github.ref }}`, `cancel-in-progress: true` — keep.
- The GitHub-documented alternative — a twin workflow with the same `name` and job name on `paths-ignore` that exits 0 — keeps two files in lockstep and is rejected here for that reason; it remains the fallback if the single-job shape proves awkward.

## Task 1 — The decision, as a function

**Files:**
- Create: `tooling/scripts/db-paths-changed.mjs` — exports `DB_PATHS` (the list above, as patterns) and `couldTheDatabaseHaveChanged(files: string[]) → boolean`; as a CLI, reads newline-separated paths on stdin and exits 0 when true, 1 when false, printing one sentence either way.
- Create: `tooling/scripts/tests/db-paths-changed.test.mjs` — `supabase/migrations/00119_x.sql` → true; `tooling/scripts/tests/tenancy.db.test.mjs` → true; `apps/dashboard/src/x.tsx` alone → false; an empty list → false; `pnpm-lock.yaml` → true.

- [ ] **Step 1: write the function and its test; run the one file.**

## Task 2 — The workflow

**Files:**
- Modify: `.github/workflows/database.yml`

- [ ] **Step 1: `pull_request` loses `paths`; `push: main` keeps its list** (a push has no required-check semantics; keep it cheap). Add a comment beside the push list saying the pull-request list is `tooling/scripts/db-paths-changed.mjs` and the two must agree.
- [ ] **Step 2: checkout with `fetch-depth: 0`, then the decision step:**
  ```yaml
  - id: changed
    name: Could the database have changed?
    run: |
      if [ "${{ github.event_name }}" != "pull_request" ]; then echo "db=true" >> "$GITHUB_OUTPUT"; exit 0; fi
      if git diff --name-only "origin/${{ github.base_ref }}...HEAD" | node tooling/scripts/db-paths-changed.mjs; then
        echo "db=true" >> "$GITHUB_OUTPUT"
      else
        echo "db=false" >> "$GITHUB_OUTPUT"
      fi
  ```
  (`node` is on the runner before `setup-node`; if the script needs a newer Node than the runner's default, move `setup-node` above it — it is cheap.)
- [ ] **Step 3: gate every heavy step** — `pnpm/action-setup`, `setup-node`, `supabase/setup-cli`, `pnpm install`, `supabase start`, the schema-sets check, the env step, `pnpm test:db`, and the types check if `2026-09-13-the-generated-types-are-guarded.md` has landed — with `if: steps.changed.outputs.db == 'true'`; the final stop becomes `if: always() && steps.changed.outputs.db == 'true'`.
- [ ] **Step 4: rewrite the header comment** (lines 2–18) to describe the new shape: always reported on a PR, replayed only when the database could have changed, required by branch protection.
- [ ] **Step 5: grep first.** `grep -rn 'database.yml' tooling/scripts/tests/ docs/` — update any pin or reference before editing.

## Task 3 — Prove both paths

- [ ] **Step 1:** Open the PR. This PR edits `database.yml`, so the decision says **true** and the full replay runs — proof of the heavy path. Read the run.
- [ ] **Step 2:** The light path is proven by the unit test (Task 1) and, after merge, by the first unrelated PR: its Database check appears, finishes in under a minute, and prints the "not needed" sentence. Say in the PR body that this is what to look for.

## Task 4 — The setting (Ruben's)

- [ ] **Step 1:** After merge: GitHub → the repository's **Settings → Branches** (or **Rules → Rulesets**) → the rule for `main` → *Require status checks to pass before merging* → add **`Migrations replay, SQL rules hold`** beside `Secret scan` and `Typecheck`. Name the check exactly. This session cannot do it — no branch-protection tool is available here — so the PR body ends with this instruction, verbatim, and the session stops.
- [ ] **Step 2:** Once flipped, `docs/system-map.md`: strike the "not a required check" line under "What CI does not cover" and mark item 6 done with the PR number.

## Done means

- Every pull request shows `Migrations replay, SQL rules hold`; on one that touches the database it is the full replay, on one that does not it is a sentence and a green tick.
- The path list exists once, in a function with a test.
- The setting is on, and a deliberately broken migration on a scratch branch cannot be merged.
