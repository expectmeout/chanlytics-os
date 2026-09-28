# Working in this repository

Read this first, whether you are a person or an agent. It says what the product
is, where the rules are written, and the one canonical example of each thing
you might add. `apps/dashboard/src/legacy/CLAUDE.md` holds the shell's own
conventions and applies inside that tree.

## What this is

Chanlytics OS is a multi-tenant, omnichannel AI receptionist and lead engine
for any business that turns a conversation into a booked appointment. A
customer writes on WhatsApp, texts, phones or emails; the receptionist answers
from the business's own facts and hands over what it should not decide; a team
supervises it from the dashboard; the finder sources leads; playbooks and
broadcasts send the routine messages around an appointment. It is live with
real customers. Treat `apps/edge` and `packages/channels` as something a member
of the public will experience.

## Read next, in this order

1. `README.md`: the moving parts, the things that will surprise you, the conventions.
2. `docs/glossary.md`: the words, and the one rule about _tenant_ versus _workspace_.
3. `docs/architecture.md`: how it is wired, and where to look for each concern.
4. `docs/runbook.md`: run it, test it, deploy it, roll it back.
5. `docs/decisions/`: what is decided and not yet built. Read the relevant note before
   touching the inbound path, appointments, or assignment.
6. `docs/takeover.md`: the codebase quality checklist, scored, with what to do next.

`docs/system-prd.md` is the as-built reference, sheet by sheet. `docs/plans/` is history.

## Commands

```bash
corepack pnpm install
corepack pnpm --filter "./packages/*" build   # apps typecheck against built dist; dist is committed
corepack pnpm -r typecheck
corepack pnpm lint                            # ESLint, warnings held per file and rule; -- --update banks a fall
corepack pnpm format                          # Prettier over the tree; the pre-commit hook does this for staged files
corepack pnpm test                            # the node suite; database suites skip without credentials
UPDATE_BASELINES=1 corepack pnpm test         # the same, banking every ratchet's reduction, and nothing else (docs/debt.md)
UPDATE_BASELINES=raise corepack pnpm test     # the same, raising a number that rose: argued under "Rises" in docs/debt.md
corepack pnpm check:dead-exports              # knip against a baseline that may only fall; -- --update banks a fall, -- --raise a rise
corepack pnpm check:bundle                    # after a dashboard build: the workspace route's JS and CSS against its budget
corepack pnpm test:db                         # the database suites, against a running Supabase stack
corepack pnpm e2e                             # Playwright, against production by default
node tooling/scripts/gen-route-types.mjs      # the typed client, after a route changes (--check to verify)
corepack pnpm gen:schema-sets                 # the closed sets, after a migration changes one (needs the stack)
corepack pnpm gen:db-types                    # database.types.ts, after a migration (needs the stack)
```

`pnpm` is corepack-only. Node 22 or newer.

**To look at a page you changed, run the app** -- `corepack pnpm --filter @chanlytics/dashboard dev`, then
`/w/<workspace-slug>/`. The standalone mockup (`Chanlytics.html`) stubs the bridge, so Today, the Calendar,
People, Leads and Live do not mount in it and a screenshot of it proves nothing about them. docs/runbook.md,
"See a real page", has the three things that trip it up.

## The rules

Each of these is enforced by a test or a workflow. Breaking one is a red build, not a style note.

- **No customer in the code.** A real business's name, number, link or prompt is configuration,
  never a literal, and a fixture takes made-up values: 555-01xx numbers, example.com links.
  `no-customer-in-the-code.test.mjs` fails the first customer's details anywhere but the migrations;
  `trade-neutral.test.mjs` fails one trade's words in front of another's customers.
- **Nothing in the UI states a fact the database cannot support.** A zero is shown; an invented
  number is not. `surface-registry.ts` decides what is real; `no-fabricated-data.spec.ts` checks it.
- **Storage says tenant, everything a person or the API sees says workspace.** Never both in one layer.
- **One predicate per rule.** Consent is `mayMessageFor`; standing is `standingOf`; the reply window
  is `replyWindow`. A second implementation of a rule is a bug even when it agrees.
- **One send door.** Everything a customer receives leaves through `packages/core/src/deliver.ts`.
- **Every route declares its policy** with `route()`: scope, role, rate, spend, input.
  `route-policy.json` pins the declarations; a change there is a change to who may do what.
- **RLS is the floor, the role check is the door.** Both are needed; a forbidden UPDATE does not
  raise, so a permission-sensitive update selects and counts.
- **Verbs over ports.** A use case in `packages/core` takes a ports object and a command and returns
  an outcome. No database client, framework, provider or environment inside a verb.
- **Rebuild and commit `packages/*/dist`** whenever a package changes. CI fails on drift.
- **Either deploy order works.** The two apps deploy independently; a shape both must agree on
  is compatible whichever deploys first.
- **A job kind arrives with its handler, its caller and the `jobs.kind` CHECK**, in one change.
- **Migrations are forward-only.** Named for the schema change, re-runnable statements, never
  edited or renamed once applied. Two files on one number fail the build.
- **Tests execute the code they prove.** A source-text assertion is the last resort, and
  `source-scan-baseline.json` may only fall.
- **What is measured may only fall.** `docs/debt.md` names every number the build holds and the
  baseline under `tooling/scripts/tests/baselines/` that holds it: functions over 150 lines, 30
  branches or 5 levels; files over 800 lines; directories over 20 modules; window globals and
  publishers; a helper declared in three files; `as unknown as`; a table name outside `packages/db`;
  dead exports; a duration written as a bare number (name it from `contracts/shared/time.ts`, or
  give it a constant); lint warnings. A new offender is a red build. `UPDATE_BASELINES=1` banks only
  what fell; a number that must rise is raised with `UPDATE_BASELINES=raise` (knip: `--raise`) in the
  same diff as its row under "Rises" in `docs/debt.md`, with the reason in the pull request. Where a
  tree's functions are all under the limits, the limits are lint errors (`LIMITED_TREES` in
  `eslint.config.mjs`): the change that banks a tree's last entry adds the tree there.
- **Production scripts** are dry-run by default, write a backup first, and take `--apply`.
- **The layers hold apart.** Browser code (`legacy-bridge`, `client`, `yes`, `auth`) never imports
  `src/server` or `@chanlytics/core|jobs|channels`; server code never imports the shell, the bridge
  or the client; the edge never imports the dashboard, `next` or `react`. Types cross freely.
  `eslint.config.mjs` enforces it.
- **The edge reads the environment through `lib/env.ts` and logs through `lib/log.ts`.** A
  `process.env` read or a `console` call anywhere else on the edge is a lint error. Event names
  never change; they are what alerting greps for.
- **Prettier owns formatting.** The hook formats what you stage; CI runs `format:check`. Never
  argue with it in a review.

## The canonical example of each thing

Copy the shape of these; do not invent a second one.

| To add                                        | Copy                                                                                   | Notes                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A webhook door on the edge                    | `apps/edge/api/inbound-sms.ts` with `apps/edge/lib/sms/sms-ingress.ts`                 | The door verifies the wire and does the transport; the plan function decides, over a database in memory |
| A cron sweep                                  | `apps/edge/api/cron/deadman.ts`                                                        | Register its clock in `sweep_status`; watch every sweep that changes something; limit in `vercel.json`  |
| A core verb                                   | `packages/core/src/conversations/snooze.ts` over `ports.ts`                            | A decision row plus a change to its subject; errors as `AppError`                                       |
| An app-plane route                            | `apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts`                         | `write()` or `read()` from `server/route.ts`; add the row to `route-policy.json`; regenerate the client |
| A repository                                  | `packages/db/src/repositories/thread.ts`                                               | The one place a table is typed; RLS decides reads on the session client                                 |
| A provider adapter                            | `packages/channels/src/sms.ts`                                                         | Owns the wire format; knows nothing about threads                                                       |
| A job handler                                 | `packages/jobs/src/handlers.ts`                                                        | Builds ports from the job's context and calls core                                                      |
| A migration                                   | `supabase/migrations/00125_a_person_may_have_an_email.sql`                             | Header of a few lines, re-runnable statements, RLS and grants like the other tenant tables              |
| A view model                                  | `packages/contracts/src/calendar/calendar.ts` with `calendar-vm.ts`                    | Pure; every sentence the page says comes from here                                                      |
| A real surface                                | `apps/dashboard/src/legacy/pages/calendar.jsx` with `legacy-bridge/calendar.ts`        | Classify it in `surface-registry.ts`; feed it through the surface seam; never a raw fetch in a page     |
| An environment variable on the edge           | A getter in `apps/edge/lib/env.ts` and a line in `apps/edge/.env.example`              | `env-manifest.test.mjs` holds the two to the same list; blank is unset                                  |
| A log line on the edge                        | `logger({ tenant_id }).info("event_name", { fields })` from `apps/edge/lib/log.ts`     | One JSON object per line; the event name is the contract, listed in `LOG_EVENTS`                        |
| A test of a door                              | `tooling/scripts/tests/sms/sms-door.test.mjs`                                          | A world over `_fake-db.mjs`; the real handler runs                                                      |
| A test of a verb                              | `tooling/scripts/tests/conversations/core-thread-verbs.test.mjs`                       | Fakes for the ports                                                                                     |
| A ratchet                                     | `tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, `_ratchet.mjs`, `_ast.mjs` | Measure the syntax tree, never the text; the baseline may only fall; a row in `docs/debt.md`            |
| A database test                               | `tooling/scripts/tests/<domain>/*.db.test.mjs`                                         | Runs against the replayed stack in CI when database paths change; skips without credentials             |
| A design that changes the shape of the system | `docs/decisions/0002-appointments-record.md`                                           | Written against a named commit, steps shippable in either deploy order                                  |

## Where new code goes

- A rule the product enforces: `packages/core`, or a SQL door when it needs the service role.
- A provider's wire: `packages/channels`.
- A type, a schema, an enum, a view model: `packages/contracts`, in its domain's folder, named in that
  folder's `index.ts` (never `export *`; a module imports another by its path, never through a barrel).
- A read or write of a table: `packages/db`.
- An HTTP door for a provider, a sweep, or the job runner: `apps/edge/api`.
- What such a door calls: `apps/edge/lib/<domain>/`, and `apps/edge/lib` itself for the
  plumbing every domain uses. A new domain earns a directory at its second module.
- A member-facing route: `apps/dashboard/app/api/v1`.
- What such a route calls: `apps/dashboard/src/server/<domain>/`, and `src/server` itself for the
  plumbing every domain uses (`route.ts`, `with-route.ts`, `edge.ts`, `tenant.ts` and their kind).
- Something a page draws: `apps/dashboard/src/legacy/pages`, fed through `src/legacy-bridge`.
- A test: `tooling/scripts/tests/<domain>/`, named for what it proves; a world or helper it
  shares stays at the root as `_name.mjs`.

## What not to introduce

- A second way to send, check consent, resolve the workspace, or declare a route.
- A fetch in a page, a provider key in the dashboard, a table name typed outside `packages/db`.
- A profile, number or link for a real business, anywhere in the tree.
- A fallback that answers in anyone's voice when the database cannot be read. It holds for a person.
- A new dependency where the repository already solves the problem (charts, calendar parsing,
  phone formatting are hand-rolled on purpose).
- A migration that edits history, or a job kind without its handler and CHECK.
- Counts in prose that go stale; measure and say when.

## Before you open a pull request

`corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`
must all pass, `git status` must show no dist drift, and the pull request must say what changes
for a customer, what to set or apply before merging (usually nothing), and which deploy order
it needs (usually either).
