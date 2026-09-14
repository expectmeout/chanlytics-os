# Chanlytics OS

A multi-tenant AI receptionist. Customers text a business's WhatsApp number or
phone its Retell voice line; an AI answers within seconds, books and reschedules
appointments, and hands anything it should not decide to a human. The operator
works from a dashboard that shows what the AI did and lets them take over.

**This is live.** One tenant (a real salon) is in production with real customers
on a real number. Treat every change to `apps/edge` and `packages/channels` as
something a member of the public will experience.

---

## The four moving parts

| Path | What it is | Deployed as |
|---|---|---|
| `apps/edge` | The webhooks. 41 endpoints: WhatsApp inbound, four Retell endpoints, Stripe, inbound SMS, 8 cron sweeps, the job runner, 22 key-guarded back-office doors, diagnostics. Vanilla Vercel functions, no framework. | Vercel project `chanlytics-messaging` |
| `apps/dashboard` | Next.js 15 operator dashboard, and the `/api/v1` app plane. | Vercel project `chanlytics-os` |
| `packages/*` | `contracts` (view models, zod config schema, enums), `db` (Supabase repositories), `channels` (WhatsApp + Retell adapters), `jobs` (scheduling + handlers). | bundled into both apps |
| `supabase/migrations` | The schema. Postgres, RLS everywhere, `events` partitioned monthly. | Supabase project |

`docs/system-map.md` is the layer-by-layer picture: what is built, what is
deferred by decision, and what is actually between here and done. Re-derive its
counts rather than trusting them — it says how.

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
the lambda, so `apps/edge/lib/workspace/*.ts` re-exports
`../../../../packages/<pkg>/dist/index.js`. Rebuild and commit `dist` whenever
you change a package — CI has a drift guard that will fail otherwise. Never add
`--sourcemap`: source maps are not byte-reproducible across platforms and the
guard will fail on someone else's machine.

**`apps/dashboard/src/legacy` is a ported HTML mockup and is deliberately not
refactored.** ~28,000 lines of hand-written JSX across 50 pages. Surfaces are converted to real
data one at a time by *branching inside the existing components*
(`XReal`/`XSeed`), never by redesigning them. The seam that swaps seed data for
real data is `src/legacy-bridge`.

**`dynamic(ssr:false)` on the legacy app is required.** `inbox-data.jsx` does
unguarded module-scope `window` access and throws during prerender.

**Nothing in the UI may state a fact the database cannot support.** Unbacked
mockup regions stay behind `window.__DEMO_MODE`. A zero is a real measurement
and is shown; an invented number is not. This is the rule most likely to be
violated by accident.

**`PG_READS` is the rollback lever — `PG_WRITES` is not.** Postgres is the
bot's memory; Blob is still written underneath, which is what makes the
`PG_READS` flip reversible. The env change needs a redeploy to take effect —
measured, not assumed — so budget a couple of minutes, and confirm with
`/api/diag`, which reports `memory` as `postgres` or `blob`. That is why the
Blob path still has to be correct. `PG_WRITES` was the Slice 1 dual-write
switch and reads as a second lever, but the edge now holds its ONLY database
behind that gate: withholding it would not fall back to Blob, it would answer
`no_database` from every sweep, the jobs tick, every admin door and the public
`/api/health`. The client asks only for `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` now, so there is no lever left to pull by mistake.

**Row Level Security is the floor, not the door.** RLS stops cross-tenant
access. *Which member may do a thing* is decided in the route with
`requireRole` / `requireOperator`. Both are needed: the job that delivers a
message runs as service role, so RLS is not even in that path.

**A forbidden `UPDATE` does not raise.** Postgres RLS makes it match zero rows
and return success — only `INSERT` raises. Any permission-sensitive update must
`.select()` and count rows, or a blocked write reads as a successful one.

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
| Roll back to Blob memory | `PG_READS=off` in the edge project env, **then redeploy** — a Vercel env change alone does not reach a running deployment. Confirm with `/api/diag`: `memory` reads `blob`. Not available while `BLOB_SHADOW=off`. |
| Retire Blob as a memory | `BLOB_SHADOW=off` in the edge project env, then redeploy. Confirm with `/api/diag`: `store` reads `off`, `memory` reads `postgres`, the probe says skipped. Blob is neither read nor written; a Postgres miss hands the thread to a human. Remove the variable and redeploy to bring the shadow back. |
| Stop a queued reply | The cancel window in the UI, or `messages.status = 'canceled'` while it is still `queued` |
| See what the system did | `events` (append-only), `decisions` (every operator verb), `escalations` (what needed a human) |
