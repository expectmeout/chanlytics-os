# Chanlytics OS

A multi-tenant, omnichannel AI receptionist and lead engine for any business
that turns a conversation into a booked appointment: a local shop or clinic, an
agency, a lender, an online seller. A customer writes on WhatsApp, texts the
business's number, phones its line or emails it; the receptionist answers
within seconds from the business's own facts, offers the times that are open,
sends the booking link, and hands over anything it should not decide. A team
watches it from a dashboard, takes a thread over, whispers into a live call,
and hands it back. The finder searches for new leads on the owner's behalf.
Playbooks and broadcasts send the routine messages around an appointment, to
the people who said yes.

It does not book. The booking tool behind the link does that, and the
receptionist is told never to confirm a slot itself: there is no appointments
table here, and nothing in the product can create, move or cancel one
(`docs/decisions/0002-appointments-record.md` proposes the record). It does
not decide money: the money class of the Autonomy matrix is locked to `never`
by a database trigger, and the prompt says so. It does not quote a price in a
reply: a deterministic check after generation replaces any reply carrying one
and hands the thread to a person, whatever the prompt said.

**This is live.** Real businesses are in production with real customers on real
numbers. Treat every change to `apps/edge` and `packages/channels` as something
a member of the public will experience. The first workspace was a hair salon,
and the code still uses it as its worked example in comments; the product is
not for salons, and `tooling/scripts/tests/trade-neutral.test.mjs` fails a
build that puts one trade's words in front of a customer of another.

**Read next.** `docs/glossary.md` for the words (and the one rule about
*tenant* versus *workspace*), `docs/architecture.md` for how it is put
together, `docs/system-prd.md` for the as-built reference sheet by sheet,
`docs/decisions/` for what is decided and not yet built.

---

## The four moving parts

| Path | What it is | Deployed as |
|---|---|---|
| `apps/edge` | The webhooks (WhatsApp, SMS and its statuses, four Retell doors, email, Stripe, Apify), the cron sweeps, the job runner, the key-guarded admin doors, diagnostics. Vanilla Vercel **Node** functions, no framework; not the Vercel Edge runtime, despite the name. Holds every provider key. | Vercel project `chanlytics-messaging` |
| `apps/dashboard` | Next.js: auth, the public pages, the operator UI, and the `/api/v1` app plane. Holds no provider key. | Vercel project `chanlytics-os` |
| `packages/*` | `contracts` (types, zod schemas, enums, view models, the prompt composer), `core` (the use cases as verbs over ports, and the one send door), `db` (Supabase repositories and generated types), `channels` (Meta, Retell, Twilio, Resend, Google, Apify adapters), `jobs` (the ledger, the tick, the handlers). | bundled into both apps |
| `supabase/migrations` | The schema. Postgres, RLS on every table, `events` partitioned monthly, pg_cron as the clock, Vault for credentials. | Supabase project |

Counts change weekly, so this file carries none. `find apps/edge/api -name
'*.ts' | wc -l` and `ls supabase/migrations | wc -l` answer the two most-asked.

The two apps deploy **independently**. A change that requires both to agree
must be shipped so that either order works — a dashboard-first deploy writing a
config shape the older edge cannot parse is how you take the live line down.

## Getting started

```bash
corepack pnpm install
corepack pnpm --filter "./packages/*" build   # apps typecheck against built dist
corepack pnpm -r typecheck
corepack pnpm test
```

`pnpm` is corepack-only here — bare `pnpm` is not on PATH. Node 22+ is required
(`.nvmrc`); the test suite runs under `tsx`, so a test can import the app's own
TypeScript — the edge handlers, the permission layer, the packages — and
execute it. It used to run on Node's type stripping, which could load only leaf
modules with no imports, and that limit is why so many tests assert on source
text instead of behaviour.

Copy `apps/edge/.env.example` and `apps/dashboard/.env.example`. Both are
complete and pinned by a test, so a variable the code reads cannot go
undocumented.

## Things that will surprise you

These are load-bearing and were each learned the hard way. Do not "clean them
up" without reading why.

**`packages/*/dist` is committed, and the edge imports it by relative path.**
Vercel's vanilla-function bundler does not follow pnpm workspace symlinks into
the lambda, so `apps/edge/lib/packages/*.ts` re-exports
`../../../../packages/<pkg>/dist/index.js`. Rebuild and commit `dist` whenever
you change a package — CI has a drift guard that will fail otherwise. Never add
`--sourcemap`: source maps are not byte-reproducible across platforms and the
guard will fail on someone else's machine.

**`apps/dashboard/src/legacy` is the operator UI, and it began as a design
mockup.** A hash-routed single-page shell of hand-written JSX, imported in a
fixed order by `src/legacy-bridge/manifest.ts`, talking through `window`
globals. Surfaces were made real one at a time by *branching inside the
existing components* (`XReal`/`XSeed`), never by redesigning them; the seam
that feeds a real surface from `/api/v1` is `src/legacy-bridge`, and
`surface-registry.ts` there is the table that says which routes are real. The
mockup's unbuilt surfaces (agent fleet, store, studio, tasks, content, the
pipeline board, the shared report viewer) stay in
the tree and hidden from every real workspace, by decision. The mockup's own
prose (its audits and demo scripts) lives in `docs/mockup/`, not in the app.

**`dynamic(ssr:false)` on the legacy app is required.** `inbox-data.jsx` does
unguarded module-scope `window` access and throws during prerender.

**Nothing in the UI may state a fact the database cannot support.** Unbacked
mockup regions stay behind `window.__DEMO_MODE`. A zero is a real measurement
and is shown; an invented number is not. This is the rule most likely to be
violated by accident.

**Postgres is the receptionist's only memory, and there is no lever on it.**
History, the pause and the rate cap are the same rows the dashboard reads and
writes; the dedupe is `ingest_inbound`'s atomic claim. A thread Postgres
cannot produce is handed to a person (`state_unavailable`) rather than
answered from an invented empty history — the receptionist never guesses that
a customer is new. The edge asks only for `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; without them the whole platform answers
`no_database`, and `/api/diag` reports `memory` as `postgres`.

**Row Level Security is the floor, not the door.** RLS stops cross-tenant
access. *Which member may do a thing* is decided in the route with
`requireRole` / `requireOperator`. Both are needed: the job that delivers a
message runs as service role, so RLS is not even in that path.

**A forbidden `UPDATE` does not raise.** Postgres RLS makes it match zero rows
and return success — only `INSERT` raises. Any permission-sensitive update must
`.select()` and count rows, or a blocked write reads as a successful one.

## Conventions

- **Names.** Storage says *tenant*; everything a person or the API sees says
  *workspace*; never both in one layer. A new table carries `tenant_id`. The
  product's nouns are People, Lists, Playbooks, Templates and Settings, and a
  new route or API path uses them (`docs/glossary.md` lists the five old names
  still in use). The thing that answers is the receptionist, never the bot or
  the agent.
- **No customer in the code.** A real business's name, number, link, address or
  prompt is configuration, read from the database or the environment, never a
  literal in the tree. Migrations that seeded the first workspace are history
  and stay as they are; nothing new follows them.
- **Commits.** An imperative subject under 72 characters that names the change;
  the reasoning goes in the body, not the subject.
- **Migrations.** Named for the schema change (`00148_jobs_drop_blob_thread_erase.sql`),
  re-runnable statements, a header of a few lines saying what changed. An applied
  migration is never edited or renamed. The lesson behind a change goes in the
  commit body or `docs/decisions/`.
- **Tests.** A new test executes the code it proves. A source-text assertion is
  the last resort, and `tooling/scripts/tests/source-scan-baseline.json` may
  only fall. Name a test for the unit it proves.
- **Either deploy order works.** A shape both apps must agree on is compatible
  whichever deploys first.
- **Production scripts** are dry-run by default, write a JSONL backup first, and
  take `--apply` to mean it.

## Testing

```bash
corepack pnpm test                    # unit + integration
```

Integration tests need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and
**skip** without them, which is what happens in CI — CI holds no live secrets by
design. Run them locally with credentials before shipping anything that touches
the database. They create throwaway rows against a smoke tenant and clean up
after themselves.

`tooling/scripts/golden-edge.mjs` is the frozen-contract check for the edge's
HTTP surface. It needs `BASE_URL` plus the Meta and Retell secrets.

### End-to-end, in a real browser

```bash
corepack pnpm e2e:install             # once, fetches Chromium
corepack pnpm e2e                     # runs against production by default
```

Twenty-two of the 141 need no credentials and pin the auth gate. The rest sign
in, and need four variables:

```
NEXT_PUBLIC_SUPABASE_URL       NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      E2E_USER_EMAIL
```

Without them those specs **skip**, with the reason printed. `E2E_BASE_URL`
points the run somewhere other than production.

A skip is not a pass, and an exit code cannot tell them apart — which is how
the nightly reported success four mornings running while executing 24 of 128
specs. So a run that is MEANT to be signed in says so with
`REQUIRE_SERVICE_CREDENTIALS=1`, and `e2e/coverage.spec.ts` then fails instead
of skipping. The node suite carries the same guard in
`tooling/scripts/tests/coverage-guard.test.mjs` for its 112 integration tests,
which live in 26 files and skip as a block without credentials.
The nightly sets the flag; `ci.yml`, which holds no live service secrets by
policy, does not.

The harness never types a password or a code: `e2e/session.ts` mints a session
over the API and hands the browser the cookie `@supabase/ssr` reads.
`generate_link` does **not** send mail, so this cannot reach a real inbox even
pointed at production. One session is minted per RUN, not per test: Supabase
allows 30 token verifications an hour, and a session per test spent a third of
that budget in one go.

The signed-in specs run in the suite's own workspace, never a customer's.
`tooling/scripts/e2e-workspace.mjs --apply` makes it, or puts it back, before
each nightly run: a test owner and a teammate at example.com, two fictional
people, one conversation, one call, and a WhatsApp channel with no credentials.
Every row is one the production sweeps leave alone, and the script refuses an
address outside example.com, so `E2E_USER_EMAIL` can never name a real account.
The specs do write there (a profile name, a saved view, a probe workspace that
`workspace-create.spec.ts` makes and deletes), and the script resets all of it.
Writes that would reach a person, such as consent, erasure, invitations, role
changes, lists, and autonomy or notification settings, are intercepted and
answered by the spec itself.

Two kinds of test skip unless asked for, and each says why. The five Ask tests
that run a real model turn cost money, so they need `E2E_PAID_MODEL=1`. The
sign-up probe needs `E2E_SIGNUP_EMAIL`, a real inbox its code can reach.

## Operational levers

| Want to | Do |
|---|---|
| Silence one business's receptionist | `tenant_channels.status = 'disabled'` — inbound is then recorded as unroutable and a human is emailed |
| Stop a queued reply | The cancel window in the UI, or `messages.status = 'canceled'` while it is still `queued` |
| See what the system did | `events` (append-only), `decisions` (every operator verb), `escalations` (what needed a human) |
