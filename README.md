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
| `apps/edge` | The webhooks. WhatsApp inbound, three Retell endpoints, the job runner, diagnostics. Vanilla Vercel functions, no framework. | Vercel project `chanlytics-messaging` |
| `apps/dashboard` | Next.js 15 operator dashboard, and the `/api/v1` app plane. | Vercel project `chanlytics-os` |
| `packages/*` | `contracts` (view models, zod config schema, enums), `db` (Supabase repositories), `channels` (WhatsApp + Retell adapters), `jobs` (scheduling + handlers). | bundled into both apps |
| `supabase/migrations` | The schema. Postgres, RLS everywhere, `events` partitioned monthly. | Supabase project |

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
refactored.** ~18,500 lines of hand-written JSX. Surfaces are converted to real
data one at a time by *branching inside the existing components*
(`XReal`/`XSeed`), never by redesigning them. The seam that swaps seed data for
real data is `src/legacy-bridge`.

**`dynamic(ssr:false)` on the legacy app is required.** `inbox-data.jsx` does
unguarded module-scope `window` access and throws during prerender.

**Nothing in the UI may state a fact the database cannot support.** Unbacked
mockup regions stay behind `window.__DEMO_MODE`. A zero is a real measurement
and is shown; an invented number is not. This is the rule most likely to be
violated by accident.

**`PG_READS` / `PG_WRITES` are the rollback levers.** Postgres is the bot's
memory; Blob is still written underneath so the flip is reversible by an env
change with no redeploy. That is why the Blob path still has to be correct.

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

Sixteen of these need no credentials and pin the auth gate. The rest sign in,
and need four variables:

```
NEXT_PUBLIC_SUPABASE_URL       NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      E2E_USER_EMAIL
```

Without them those specs **skip**, with the reason printed. `E2E_BASE_URL`
points the run somewhere other than production.

There is no password anywhere in this product — sign-in is an emailed
code — so `e2e/session.ts` mints a session over the API and hands the browser
the cookie `@supabase/ssr` reads, rather than typing anything into the form.
`generate_link` does **not** send mail, so this cannot reach a real inbox even
pointed at production. One session is minted per RUN, not per test: Supabase
allows 30 token verifications an hour, and a session per test spent a third of
that budget in one go.

The signed-in specs are read-only against real data with one deliberate
exception: `e2e/team-card.spec.ts` intercepts its own `POST`/`PATCH` and
answers them itself, so it proves the button issued the request without any
invitation being sent or any membership changing.

## Operational levers

| Want to | Do |
|---|---|
| Silence one business's receptionist | `tenant_channels.status = 'disabled'` — inbound is then recorded as unroutable and a human is emailed |
| Roll back to Blob memory | `PG_READS=off` in the edge project env; no redeploy needed |
| Stop a queued reply | The cancel window in the UI, or `messages.status = 'canceled'` while it is still `queued` |
| See what the system did | `events` (append-only), `decisions` (every operator verb), `escalations` (what needed a human) |
