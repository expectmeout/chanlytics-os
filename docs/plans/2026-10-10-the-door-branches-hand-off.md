# The door branches: a hand-off, 10 October 2026

Written so an agent on another machine can pick the work up. It is the plan for the step after
`docs/decisions/0031-records-events-reactions-and-doors.md`'s 9 October review, and it goes stale once the branches
land; delete it then.

Nothing below is on main or on production. Migrations 00346 to 00348 were applied to production on 9 October and
nothing after them. Ruben's word, 10 October: do not apply a migration to production unless he is present, and say so
in the pull request when one is waiting.

## Four branches, all based on `d1bb65961` (main on 9 October)

| Branch                                               | Holds                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude/chanlytics-os-architecture-analysis-ejqx0e`  | The 9 October review in 0031, and the road: the ledger compare by name, `migrate.yml`, `production-smoke.yml`, main's push running the tests of what it changed, the jobs ledger's lock in three database suites |
| `claude/a-run-and-its-decision-are-one-write`        | A broadcast's and a playbook's decision written inside `assemble_broadcast`; a reach-out chain's start decision inside its save; the billing reading and the workspace's status in one `billing_apply` door. Migrations 00360, 00361 |
| `claude/a-provider-s-stop-is-one-write`              | `record_provider_stop` (the row and its `contact.consent_changed` in one transaction); a failed `event_deliver` paged to the operator, not the customer's bell; the `control_until` index; `person.resolved` written only when it changed something. Migrations 00362, 00363 |
| `claude/take-over-and-hand-back-are-one-door`        | `conversation_take_over` and `conversation_hand_back`, each one transaction on the member's own session. Migration 00364 holds both |

## Before anything merges

1. **Main has moved.** On 10 October it was at `c368115b4`, seven pull requests past `d1bb65961`, and other sessions
   had taken migrations 00360 to 00369. The door branches use 00360 to 00364. Renumber theirs above main's head at the
   time (a migration that was never applied may be renamed), and the references to them in tests and docs. Look at
   `supabase/migrations/` on main again at merge time.
2. **Read #1527 first**, "Every finding of the 9 October audit is fixed, from consent and sends to billing, jobs and the
   page". It carries 00361 (a message taken in again changes no consent), 00362 (a member calls back only a send that
   has not started) and 00369 (a broadcast's email is claimed as it is written). It may already do part of what the
   consent, billing and broadcast branches do. Where it does, drop that part of the branch: a second implementation of a
   rule is a bug even when it agrees.
3. **None of the gates was re-run on the three door branches.** Their authors stopped on an API rate limit before they
   reported. The run-and-decision suite was seen passing, 7 of 7. Everything else is unverified: build, typecheck, lint,
   `format:check`, the ratchet and debt-register tests, the migrations test, each branch's database suites on a replayed
   stack, and the files `node tooling/scripts/checks/changed-tests.mjs --list origin/main HEAD` names.
4. **Generated files are not committed on the door branches** (`packages/*/dist`, `database.types.ts`, `schema.sql`,
   `schema-sets.generated.ts`, `data-model.md`, `migrations-ledger.json`): each branch would have generated them from
   itself alone and the three would conflict. Regenerate them once, after the merge and a clean replay.

## Steps

1. Merge main into the architecture branch.
2. Bring in the door branches in this order: the run and its decision, the provider's STOP, the take-over. Resolve
   against #1527 as item 2 says.
3. Renumber the migrations above main's head.
4. `corepack pnpm --filter "./packages/*" build`, then `corepack pnpm -r typecheck`, `corepack pnpm lint`,
   `corepack pnpm format`.
5. Replay the database from zero (`supabase db reset --local`), then `corepack pnpm gen:schema-snapshot`,
   `gen:db-types`, `gen:schema-sets`, `gen:data-model`, and `node tooling/scripts/checks/migration-ledger.mjs --record`.
6. Bank what fell with `UPDATE_BASELINES=1` on the ratchet tests. Each door commit's message names the falls it expects.
7. Run the gates and the changed tests, commit, and open one pull request with the migrations in it. Say in it which
   migrations are waiting for Ruben.

## What is not built from the 9 October review

- "May an automated message go" is still two gates, voice's `outbound-gate.ts` and text's `reply-gates.ts`.
- Cancelling a queued message is still written in five places.
- `escalation.opened` is not yet written in a door, which the owner's notice, the first real event subscriber, needs.
- An `appointment.*` subscriber that runs `reach_out_booked`, so a booking email's lead is reached without the hourly
  calendar sweep.
- Pruning the spine pieces nothing calls, and settling whether a paused subscription holds or drops its events.

## Ruben's, when he is back

- The GitHub Environment `production` with a required reviewer and the secrets `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD`, so `migrate.yml` can run.
- The merge settings: `enforce_admins`, merging by auto-merge only, branches kept up to date or a merge queue.
- Confirm Vercel posts a production `deployment_status`, so `production-smoke.yml` fires.
- `ledger_reader` select on `schema_migrations`, for the weekly `migration-ledger.yml`.
- Which workspace tries the WhatsApp switch; whether a paused subscription holds or drops; the alarm path.
- Drop the leftover `migration_staging` schema in production, which needs his confirmation.
- The production smoke check run from his machine, since the cloud container's network does not reach those hosts.
