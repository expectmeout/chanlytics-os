# The tenancy floor is uniform

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One session, one migration.

**Goal:** The four deny-all tables revoke their default privileges the way their three siblings do, and the nine policies written without a `TO` clause say `to authenticated` like the other fifty-six live ones (sixty-three of the seventy-two ever written) — so the floor reads the same everywhere and can be audited at a glance. Consistency, not exposure: nothing here closes a live leak, and the plan is honest about that.

**Architecture:** One migration, `supabase/migrations/00119_the_floor_is_uniform.sql`, of four `revoke` statements and nine `alter policy … to authenticated` statements — thirteen in all. `ALTER POLICY` changes only the roles a policy applies to and leaves every predicate byte-for-byte as written — which is why it is chosen over drop-and-recreate, even though it has no precedent in this repository yet. The tenancy suite then proves the *privilege* (a member's read is refused, not merely empty), so a future table that turns on RLS and forgets the revoke is caught.

**Tech stack:** SQL; the Database workflow (`.github/workflows/database.yml`) replays it on the PR because `supabase/**` is a trigger; `tooling/scripts/tests/tenancy.db.test.mjs` runs there with real sessions. The migration reaches production only by `supabase db push --linked` after the merged code is deployed — an ops step, not this session's.

**Rules:** No `readCode`/`readRaw`. Migration header in the house register (see `00118_the_ledger_names_a_call_ended_by_hand.sql`): what, why, and what does not change. Commit messages are one sentence in the house voice.

---

## Why (measured 13 September 2026; the policy count corrected the same day — the first census missed `invitations_member_read`, the migration did not)

**The four tables.** RLS enabled, zero policies, no revoke — so `anon` and `authenticated` nominally hold Supabase's default `SELECT/INSERT/UPDATE/DELETE` with only RLS between them and the rows:

| table | RLS enabled at |
|---|---|
| `billing_events` | `00073_billing.sql:51` |
| `jobs` | `00002_conversations.sql:222` |
| `platform_admins` | `00001_foundation.sql:44` |
| `sweep_status` | `00026_sweep_health.sql:91` |

The three siblings that belt-and-brace it, verbatim: `revoke all on public.operator_pages from public, anon, authenticated;` (`00105_operator_pages.sql:26`), `revoke all on public.waitlist from anon, authenticated;` (`00088_waitlist.sql:46`), `revoke all on public.rate_hits from anon, authenticated;` (`00059_shared_limits_runtime_stamp.sql:14`). Use the fuller `from public, anon, authenticated` form. `service_role` keeps its own grants; `operator_pages` is written by the edge under it in production today.

**The nine policies**, all still live (no later `drop policy` names any of them — checked against every `drop policy` in the tree):

| policy | table | written at |
|---|---|---|
| `invitations_member_read` | `invitations` | `00012_control_plane.sql:35` |
| `policies_member_read` | `policies` | `00012_control_plane.sql:71` |
| `policies_owner_update` | `policies` | `00012_control_plane.sql:73` |
| `tenant_config_member_read` | `tenant_config` | `00012_control_plane.sql:105` |
| `tenant_config_owner_update` | `tenant_config` | `00012_control_plane.sql:107` |
| `policies_owner_insert_person` | `policies` | `00029_person_reply_mode.sql:15` |
| `policies_owner_delete_person` | `policies` | `00029_person_reply_mode.sql:24` |
| `policies_acting_member_update` | `policies` | `00033_doors_and_rows.sql:18` |
| `billing_accounts_member_select` | `billing_accounts` | `00073_billing.sql:39` |

Every predicate keys on `auth.uid()` (null for `anon` → zero rows), so `TO PUBLIC` is not a leak; it is off-pattern.

**Safety, checked 13 September.** A revoke turns "zero rows" into a `42501` raise for any `SECURITY INVOKER` function that reads these tables under a member's session. Every function whose body names the four tables is `SECURITY DEFINER` (`claim_job`, `fail_job`, `erase_contact`, `trigger_*`, `sweep_health`, `claim_due_jobs`, `jobs_backlog`, `is_platform_admin`, `platform_admin_add`, `sweep_mark_alerted`, `request_sweep`, `note_sweep_backlog`) except two **trigger functions** — `jobs_guard` (`00098:95`, a trigger on `jobs`) and `sweep_status_registered` (`00107:82`, before insert on `sweep_status`) — which fire only on writes those roles cannot make. No behaviour changes for any caller that exists.

**The suite already tolerates the change.** `tenancy.db.test.mjs` marks `jobs` and `billing_events` mode `"none"` in `TENANT_TABLES` (`:187,:197`) and `platform_admins`/`sweep_status` in `OTHER_TABLES` (`:205,:207`); its `nothing(x)` accepts either zero rows or an `error:` string, so a `42501` passes today. Task 2 makes it *require* the error.

**Text pins that touch these files stay green:** `billing.test.mjs:153` pins `create policy billing_accounts_member_select` in `00073` (unchanged file); `doors-and-rows.test.mjs:86-87` pins `00033` (unchanged). No generated file changes: policies and grants appear neither in `database.types.ts` nor in `schema-sets.generated.ts`.

**Out of scope, named so nobody reaches for it here:** the `events` partition asymmetry (`ensure_events_partition` enables RLS on each new partition and creates no policy, while `events_default` has one, `00003:69-81` vs `00016:45`); `idempotency_keys`' member DELETE right (`00033:24`). Both are in `docs/system-map.md` and are separate decisions.

## Task 1 — The migration

**Files:**
- Create: `supabase/migrations/00119_the_floor_is_uniform.sql`

- [ ] **Step 1: re-run the safety check** before writing a line: list every function whose body names `billing_events`, `jobs`, `platform_admins` or `sweep_status` and confirm each is `security definer` or a trigger function. (One way: for each migration, match `create (or replace )?function public.<name>(…)$$…$$` and grep the body; the 13 September result is above — confirm nothing since `00118` changed it.)
- [ ] **Step 2: write the migration.** Header in the house register (the why above, compressed; "nothing changes for any caller that exists; the predicates are untouched"). Then:
  ```sql
  revoke all on public.billing_events  from public, anon, authenticated;
  revoke all on public.jobs            from public, anon, authenticated;
  revoke all on public.platform_admins from public, anon, authenticated;
  revoke all on public.sweep_status    from public, anon, authenticated;

  alter policy invitations_member_read        on public.invitations      to authenticated;
  alter policy policies_member_read           on public.policies         to authenticated;
  alter policy policies_owner_update          on public.policies         to authenticated;
  alter policy policies_owner_insert_person   on public.policies         to authenticated;
  alter policy policies_owner_delete_person   on public.policies         to authenticated;
  alter policy policies_acting_member_update  on public.policies         to authenticated;
  alter policy tenant_config_member_read      on public.tenant_config    to authenticated;
  alter policy tenant_config_owner_update     on public.tenant_config    to authenticated;
  alter policy billing_accounts_member_select on public.billing_accounts to authenticated;
  ```
- [ ] **Step 3: `grep -rn 'revoke all\|policies_member_read\|tenant_config_member_read' tooling/scripts/tests/`** — confirm no pin asserts the *absence* of a `TO` clause or the *absence* of a revoke.

## Task 2 — The proof

**Files:**
- Modify: `tooling/scripts/tests/tenancy.db.test.mjs`

- [ ] **Step 1: privilege, not only policy.** For every table whose mode is `"none"` (in `TENANT_TABLES` and `OTHER_TABLES`), a viewer's and a stranger's `select` must come back as a **privilege refusal** — `error.code === "42501"` — not as an empty array. Add that expectation beside the existing `nothing()` check with a sentence saying why (a table that turns on RLS and forgets the revoke reads as safe until someone grants it something). This is the assertion that would have named the four tables.
- [ ] **Step 2 (optional, cheap):** one `supabase db query` step in `database.yml`, after the replay: `select count(*) from pg_policies where schemaname = 'public' and roles = '{public}'` must be `0`. It proves the nine and guards the next one. Skip if it complicates the workflow while `2026-09-13-the-replay-is-a-required-check.md` is also in flight.

## Task 3 — Ship

- [ ] **Step 1:** `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test` green locally (the db suite skips without credentials — expected). Open the PR; the Database workflow replays 119 migrations and runs `tenancy.db.test.mjs` with real sessions. Read the run.
- [ ] **Step 2:** PR body: what changed, what did not (no caller's behaviour), the safety check's result, and the ops step that follows the merge — `supabase db push --linked` after the deploy.
- [ ] **Step 3:** `docs/system-map.md`: under "Schema and tenancy", strike nits 1 and 2; mark item 10 of "The distance to 100%" done with the PR number.

## Done means

- The replayed database has zero policies with `roles = '{public}'` and the four tables refuse a member with `42501`.
- The tenancy suite would fail if either regressed.
- Nothing any existing caller does has changed.
