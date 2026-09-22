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
corepack pnpm lint
corepack pnpm format                          # Prettier over the tree; the pre-commit hook does this for staged files
corepack pnpm test                            # the node suite; database suites skip without credentials
corepack pnpm test:db                         # the database suites, against a running Supabase stack
corepack pnpm e2e                             # Playwright, against production by default
node tooling/scripts/gen-route-types.mjs      # the typed client, after a route changes (--check to verify)
corepack pnpm gen:schema-sets                 # the closed sets, after a migration changes one (needs the stack)
corepack pnpm gen:db-types                    # database.types.ts, after a migration (needs the stack)
```

`pnpm` is corepack-only. Node 22 or newer.

## The rules

Each of these is enforced by a test or a workflow. Breaking one is a red build, not a style note.

- **No customer in the code.** A real business's name, number, link or prompt is configuration,
  never a literal. `trade-neutral.test.mjs` fails one trade's words in front of another's customers.
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

| To add                                        | Copy                                                                                 | Notes                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| A webhook door on the edge                    | `apps/edge/api/inbound-sms.ts` with `apps/edge/lib/sms-ingress.ts`                   | The door verifies the wire and does the transport; the plan function decides, over a database in memory |
| A cron sweep                                  | `apps/edge/api/cron/deadman.ts`                                                      | Register its clock in `sweep_status`; every sweep that changes something is watched                     |
| A core verb                                   | `packages/core/src/conversations/snooze.ts` over `ports.ts`                          | A decision row plus a change to its subject; errors as `AppError`                                       |
| An app-plane route                            | `apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts`                       | `write()` or `read()` from `server/route.ts`; add the row to `route-policy.json`; regenerate the client |
| A repository                                  | `packages/db/src/repositories/thread.ts`                                             | The one place a table is typed; RLS decides reads on the session client                                 |
| A provider adapter                            | `packages/channels/src/sms.ts`                                                       | Owns the wire format; knows nothing about threads                                                       |
| A job handler                                 | `packages/jobs/src/handlers.ts`                                                      | Builds ports from the job's context and calls core                                                      |
| A migration                                   | `supabase/migrations/00125_a_person_may_have_an_email.sql`                           | Header of a few lines, re-runnable statements, RLS and grants like the other tenant tables              |
| A view model                                  | `packages/contracts/src/calendar.ts`                                                 | Pure; every sentence the page says comes from here                                                      |
| A real surface                                | `apps/dashboard/src/legacy/pages/calendar-real.jsx` with `legacy-bridge/calendar.ts` | Classify it in `surface-registry.ts`; feed it through the surface seam; never a raw fetch in a page     |
| An environment variable on the edge           | A getter in `apps/edge/lib/env.ts` and a line in `apps/edge/.env.example`            | `env-manifest.test.mjs` holds the two to the same list; blank is unset                                  |
| A log line on the edge                        | `logger({ tenant_id }).info("event_name", { fields })` from `apps/edge/lib/log.ts`   | One JSON object per line; the event name is the contract                                                |
| A test of a door                              | `tooling/scripts/tests/sms-door.test.mjs`                                            | A world over `_fake-db.mjs`; the real handler runs                                                      |
| A test of a verb                              | `tooling/scripts/tests/core-thread-verbs.test.mjs`                                   | Fakes for the ports                                                                                     |
| A database test                               | `tooling/scripts/tests/*.db.test.mjs`                                                | Runs against the replayed stack in CI when database paths change; skips without credentials             |
| A design that changes the shape of the system | `docs/decisions/0002-appointments-record.md`                                         | Written against a named commit, steps shippable in either deploy order                                  |

## Where new code goes

- A rule the product enforces: `packages/core`, or a SQL door when it needs the service role.
- A provider's wire: `packages/channels`.
- A type, a schema, an enum, a view model: `packages/contracts`.
- A read or write of a table: `packages/db`.
- An HTTP door for a provider, a sweep, or the job runner: `apps/edge/api`.
- A member-facing route: `apps/dashboard/app/api/v1`.
- Something a page draws: `apps/dashboard/src/legacy/pages`, fed through `src/legacy-bridge`.

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
