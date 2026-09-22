# Runbook

How to run Chanlytics OS on a laptop, test it, deploy it, apply a migration,
and roll it back. `docs/architecture.md` says what the parts are; this page
says what to type. Where this page and a workflow file disagree, the workflow
is right.

## The three things that run

| Part             | Runs on                                                                           | Locally                                            |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/dashboard` | Vercel project `chanlytics-os`, root directory `apps/dashboard`, Next.js          | `corepack pnpm --filter @chanlytics/dashboard dev` |
| `apps/edge`      | Vercel project `chanlytics-messaging`, root directory `apps/edge`, Node functions | No dev script; see below                           |
| The database     | Supabase project (`supabase/config.toml` names it)                                | `supabase start` (needs Docker)                    |

Both Vercel projects deploy production from `main` on every merge and a
preview for every pull request, independently of each other. Vercel builds
with Node 24; CI runs Node 22.

## Run it locally

**Install and build once.** `corepack pnpm install`, then
`corepack pnpm --filter "./packages/*" build`. The apps import the built
`dist`, which is committed; rebuild it whenever a package changes.

**The dashboard.** Copy `apps/dashboard/.env.example` to
`apps/dashboard/.env.local` and fill in the Supabase URL and keys (a local
stack's, or a project you own). Then:

```bash
corepack pnpm --filter @chanlytics/dashboard dev
```

`.claude/launch.json` starts the same command on port 3100. An unset
`VERCEL_ENV` is a laptop, never production (`src/server/deployment.ts`): every
call that would reach a provider through the edge answers "not here" unless
`EDGE_PROVIDERS=live` and `EDGE_URL` point at an edge holding sandbox keys.

**The edge.** It has no dev server script. Its doors are standard
`Request`/`Response` handlers under `apps/edge/api`, so `vercel dev` inside
`apps/edge` with a `.env` copied from `.env.example` serves them. In practice a
door is exercised through its test world: `tooling/scripts/tests/*-door.test.mjs`
runs the real handler over an in-memory database, which is how the code is run
on a laptop most of the time.

**The database.** From the repository root:

```bash
supabase start          # the local stack; migrations and supabase/seed.sql apply
supabase status -o env  # the URL and the two published demo keys
supabase db reset       # replay every migration from zero, then the seed
supabase stop --no-backup
```

Point anything at it with `SUPABASE_URL=http://127.0.0.1:54321` and the keys
`supabase status` prints. They are the published local-stack keys, not secrets.

## Format it

Prettier owns formatting (`.prettierrc.json`); `.prettierignore` names what it
leaves alone and why. `corepack pnpm install` installs a pre-commit hook
(`.husky/pre-commit`, through `tooling/scripts/prepare-hooks.mjs`, which skips
on CI and on Vercel) that formats whatever is staged, so a commit made with the
hook on is always formatted. CI runs `pnpm format:check` and fails a commit
made without it.

```bash
corepack pnpm format          # the whole tree
corepack pnpm format:check    # what CI runs
git commit --no-verify        # skips the hook; CI will still check
```

**Bringing a branch across the formatting commit.** A branch older than the
commit that formatted the tree conflicts on every file it touched. Do not
resolve by hand: take the branch's side, format, continue. Which side is
"the branch's" depends on the operation, because git names them from the
point of view of what is being applied:

```bash
# Rebasing: the branch's commits are replayed onto main, so the branch is "theirs".
git rebase origin/main
git checkout --theirs -- <file>
corepack pnpm exec prettier --write <file>
git add <file>
git rebase --continue

# Merging main into the branch: the branch is the checkout, so it is "ours".
git merge origin/main
git checkout --ours -- <file>
corepack pnpm exec prettier --write <file>
git add <file>
git commit
```

Before opening the pull request, `corepack pnpm exec prettier --write` every
non-ignored file the branch touched, so `format:check` is green on the first
run. The ported shell and the committed dists are outside the check
(`.prettierignore`) and need nothing.

## Test it

| Suite                                                        | Command                                | Needs                                                                                              |
| ------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The node suite: routes, doors, verbs, view models over fakes | `corepack pnpm test`                   | Nothing. Database and integration suites skip, with the reason printed                             |
| The database suites: RLS, CHECKs, triggers, tenancy, erasure | `corepack pnpm test:db`                | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, usually the local stack's                          |
| The browser suite                                            | `corepack pnpm e2e`                    | Chromium (`corepack pnpm e2e:install` once); signed-in specs need the four variables in the README |
| The edge's frozen HTTP contract                              | `node tooling/scripts/golden-edge.mjs` | `BASE_URL` plus the Meta and Retell secrets                                                        |

A skip is not a pass. A run that is meant to hold credentials says so with
`REQUIRE_SERVICE_CREDENTIALS=1`, and the coverage guard then fails instead of
skipping. The nightly sets it; the pull-request jobs do not.

### A signed-in spec, on this machine

A signed-in spec needs a session, and no developer machine holds a service-role
key -- so those specs skip locally and are first RUN by the nightly, against
production. That is a slow way to find out a spec is wrong, and no way at all
to mutation-test one. `tooling/scripts/e2e-harness` closes the gap: a local
server that answers the two Supabase calls `e2e/session.ts` makes, serves the
standalone mockup from this worktree's source with a fixture first in its head,
and answers the spec's own `/api/v1` reads from a record.

```bash
corepack pnpm e2e:local -- e2e/settings-business.spec.ts
corepack pnpm e2e:local -- e2e/settings-business.spec.ts --scenario=salon
corepack pnpm e2e:local -- e2e/settings-business.spec.ts --grep "fits a phone"
```

It takes a free port, sets what `signIn()` reads, runs the REAL spec unmodified
and stops the server. Nothing leaves the machine, no key of any kind is needed,
and the harness cannot write: every route but the two auth calls answers a GET
or a HEAD and refuses the rest, so nothing on it can look like a write that
landed. It runs with `--retries=0`, where the config retries once locally: a
mutation run asks whether the journey went red, and a retry that passes turns a
caught mutant into a flake.

Two records. `nightly` is the seeded `chanlytics-e2e` workspace, DERIVED from
`tooling/scripts/e2e-workspace.mjs` -- the config it writes, the line it
provisions, the clock it sets -- so it changes when the seed changes rather than
drifting from it; `e2e-harness.test.mjs` holds the two together. `salon` is a
fuller, fictional record for the branches the nightly's data cannot reach: a
week of hours, closures at the cap, services, and one language short of the cap.

What it cannot prove: anything behind a Save (the page's saver refuses, by
design, and the specs that run here never press one), and anything about timing
in the real bundle -- the harness compiles the legacy tree with Babel in the
browser, so the runner raises the per-test timeout where production runs under
the config's own 45s. Green here is not a green nightly.

`e2e/settings-business.spec.ts` is the spec that runs on it today. Another
surface needs its own globals added to `e2e-harness/fixture-src.ts` -- whatever
that page's bridge publishes -- and any read it makes added to `answer()` in
`e2e-harness/server.mjs`.

One flake to know about, in the product and not in the harness: the week's copy
menu is an `escape` `MoreMenu`, which closes on any captured scroll event
(`data-bits.jsx`), so a scroll into view between the menu opening and the item
being clicked closes it and the item is never there -- rare, likelier on the
harness because its page is slower, and the nightly can hit it too.

## What CI proves

| Workflow                          | On                                                    | Proves                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`, Secret scan             | every pull request and push to main                   | No secret in what the pull request adds                                                                                                                                                                |
| `ci.yml`, Typecheck               | same                                                  | `dist` matches the sources; typecheck; lint, which includes the layer boundaries and the edge's env and log rules; the formatting check; the node suite; the dashboard builds the way Vercel builds it |
| `database.yml`, Migrations replay | same, and it replays only when database paths changed | Every migration from zero on a fresh Postgres; the closed sets and `database.types.ts` regenerate to what is committed; the database suites pass against that stack                                    |
| `nightly-e2e.yml`                 | 09:00 UTC                                             | The integration suites against real Postgres and the browser suite against production, in the suite's own workspace                                                                                    |

Branch protection requires Typecheck by name. Requiring the migrations replay
too is a repository setting worth flipping: the product's safety model lives
in the schema.

## Deploy

1. Merge to `main`. Both Vercel projects build and deploy production on their own.
2. A change both apps must agree on ships in a shape that works whichever
   lands first. Neither deploy waits for the other.
3. A Vercel environment variable reaches a running deployment only after a
   redeploy. Set it, then redeploy the project from its Deployments page.
4. Confirm: `GET /api/health` on the edge answers 200 when the platform's
   clocks are healthy and due work is draining; `GET /api/diag` (keyed) says
   what the deployment holds. The dashboard's `/api/version` names its build.

Each project's variables are listed in its `.env.example`, and a test fails
when the code reads one the file does not list. Provider keys live on the edge
only; the dashboard holds none.

## Apply a migration

1. Write it: the next free number, named for the schema change, re-runnable
   statements, a header of a few lines. Never edit or rename an applied one.
2. Replay it locally: `supabase db reset`. Then regenerate what the schema
   drives: `corepack pnpm gen:schema-sets` and `corepack pnpm gen:db-types`,
   and rebuild `dist` if a package changed. Commit the generated files.
3. Let CI replay it from zero and run the database suites against it.
4. Merge, and let both apps deploy.
5. Apply to production from a laptop linked to the project:

```bash
supabase db push --linked
```

Apply after the apps have deployed whenever the migration tightens something
the old code still writes (a CHECK, a dropped column, a renamed function);
apply before them when the new code reads something only the migration
provides. The migration's header should say which. Most migrations are safe in
either order, and say so by being additive.

## Roll back

**An app.** Vercel keeps every deployment. Promote the previous production
deployment from the project's Deployments page; it is live in seconds and the
code on `main` is unchanged. Then fix forward with a pull request.

**A migration.** Migrations are forward-only. Write a new migration that
undoes the change, replay it locally, and push it the same way. Never delete
or edit the applied file: the CLI keys applied migrations by version, and a
rewritten file replays differently on the next fresh database.

**A workspace, not the platform.** The levers in `docs/system-prd.md` S-23:
silence one receptionist (`tenant_channels.status = 'disabled'`), hold one
person, cap a workspace, stop a queued reply. None of them needs a deploy.

**What to look at first.** `events` is the append-only ledger of what
happened, `decisions` of what people did, `escalations` of what needed a
person. `sweep_status` and `/api/cron/health` say whether every clock is
running. The edge's logs are structured JSON with the tenant id and the tail
of the message id on every line.

## Scripts that touch production

Every writing script in `tooling/scripts` is a dry run by default, writes a
JSONL backup first, is idempotent, and takes `--apply` to mean it. Read the
header of the script before running it; each says what it needs and what it
refuses.
