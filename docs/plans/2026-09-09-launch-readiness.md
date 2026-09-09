# Launch Readiness — nine PRDs

**Question this answers:** what has to be true before signup is opened to hundreds of businesses.

**Method:** every claim below is grounded in a file and line, a production env listing, a live database read, or a CI run. Where I could not verify something, it says so.

**Reading order:** P0 items are the ones I would not open signup without. P1 items are what makes the business operable once people are in. P2 is polish that changes what a customer perceives, not whether the product works.

> **Status, 9 September 2026: all four P0 gates are shipped and merged.** #291, #292, #293, #294. Migrations 00088 and 00089 applied; `sweep_health` reports 10 of 10 healthy. One decision is left with Ruben and is called out under gate 2: production still runs `open`, because closing somebody's front door is not a change to make without asking.
>
> **The 30913 consent split is shipped** — #304 and #305, migrations 00095–00096 applied. Marketing consent is now a separate answer from conversational consent, the `/yes` page asks twice, and the campaign was **resubmitted free** (`200`, `IN_PROGRESS`, no errors). What remains of that thread is one thing money would fix and one thing nothing can; both are under *Open, and Ruben's* in PRD 5's neighbour below.
>
> **Gates 6 and 8 are shipped** — #307 (the ops door), #309/#310/#311 (the hosted compliance page and the pre-flight). Eight of nine gates are done; **gate 9 is a walkthrough and it is Ruben's**, not an engineering task.
>
> **Gate 5 is shipped** — #299 (the boundary and the judgement), #300 (the page), #301 (the reason a refusal gives), migrations 00091–00093 applied. `platform_admins` is read for the first time since 00001, and Settings › Back office lists every workspace sorted by who needs a person. See the *Shipped* note under PRD 5.
>
> **Gate 7 is shipped too** — #296 (the machinery) and #297 (the product loop), migration 00090 applied. A business with no tax ID can now register for texting, is shown what that registration costs it before it commits, and is told the ceiling afterwards. One leg of it is specified and deliberately unbuilt; see the *Shipped* note under PRD 7, which names what it waits on and why.

| # | PRD | Priority | Size | Blocks signup? | State |
|---|---|---|---|---|---|
| 1 | Who may spend | P0 | ~1 day | **Yes** | **shipped** #291 |
| 2 | The front door | P0 | ~half day | **Yes** | **shipped** #293 · *env not flipped* |
| 3 | Sweeps that serve every tenant | P0 | ~1 day | Yes, at volume | **shipped** #294 |
| 4 | A green nightly and a true DR copy | P0 | ~half day | Yes | **shipped** #292 |
| 5 | The back office | P1 | ~2 days | No, but support is impossible without it | **shipped** #299 · #300 · #301 |
| 6 | An ops door a human can open | P1 | ~half day | No | **shipped** #307 |
| 7 | Businesses without an EIN | P1 | ~3 days | No — decides market size | **shipped** #296 · #297 · *OTP leg held* |
| 8 | Registration a salon can complete | P1 | ~2–3 days | No — decides onboarding cost | **shipped** #309 · #310 · #311 |
| 9 | What a paying customer actually sees | P2 | ~1 day | No | |

---

## PRD 1 — Who may spend

### Why

Three facts that are individually reasonable and together are a hole:

- A workspace created by signup gets `billing_accounts.status = 'none'` — no card, no subscription. `supabase/migrations/00073_billing.sql:83`
- `receptionistOn()` returns **true** for `'none'`, so `tenantStatusFor()` keeps that workspace `active`. `packages/contracts/src/billing.ts:66`
- `POST /api/v1/lines/buy` and `POST /api/v1/lines/register` check the caller's **role** and a **rate limit**, and nothing else. `apps/dashboard/app/api/v1/lines/buy/route.ts:15`, `.../register/route.ts:21`

Signup makes the caller an owner of their new workspace. So a stranger can sign up and, without ever entering a card:

- run a full receptionist indefinitely, and
- spend **$4.50 + $15.00** of Chanlytics' Twilio balance on an A2P filing, plus **$1.15/month** for a number, three times an hour (`rate-limit.ts:69,75`).

A hundred signups doing that is roughly **$2,000** charged to the parent Twilio account. That account's balance today was $12.85.

The `'none'` case was almost certainly written for the four workspaces that predate Stripe — three of the four live tenants are `mode: 'direct'` (verified in production). The rule is right for them and wrong for everyone who arrives from now on.

### Done means

- A `mode: 'stripe'` workspace with no card cannot buy a number or file a registration. It gets a clear sentence and a link to Billing, not a 403 with a code.
- A `mode: 'direct'` workspace is unaffected — verified against the three live ones.
- What `'none'` entitles a workspace to is written down in one place and tested, rather than implied by a list membership.
- The receptionist's *answering* and the workspace's *ability to spend* are separate decisions, because they always were and the code merged them.

### Design

Split the one predicate into two, beside each other in `packages/contracts/src/billing.ts`:

```ts
/** May the receptionist answer? Generous: an existing conversation is never
 *  cut off over billing state that a webhook is a few seconds behind on. */
export function receptionistOn(status: BillingStatus): boolean

/** May this workspace incur a cost on Chanlytics' account? Strict: a card,
 *  or a grandfathered direct workspace. Nothing else. */
export function maySpend(mode: BillingMode, status: BillingStatus): boolean {
  if (mode !== "stripe") return true;              // direct: invoiced by hand
  return status === "trialing" || status === "active" || status === "past_due";
}
```

`'none'` and `'incomplete'` are deliberately absent: `incomplete` is the minutes between Checkout and the first payment, which is *fine* for answering and *not* fine for spending — an abandoned Checkout leaves that status behind.

Enforcement goes in a shared server helper so it cannot be forgotten on the next money route:

```ts
// apps/dashboard/src/server/with-route.ts
export async function requireSpend(ctx, member): Promise<void>
```

It reads `billing_accounts` for the tenant and throws `AppError("payment_required", …, 402)` with the owner's words: *"Add a card before buying a number — nothing is charged until your trial ends."*

Applied to `lines/buy`, `lines/register`, and — as a belt — the edge's `op: "buy" | "register"` in `apps/edge/api/admin/lines.ts`, which is reachable with the diag key and should refuse on the same rule rather than trust its caller.

Setup's line row already knows how to say "waiting on you"; it gains the case where the next step is Billing rather than a number.

### Work

1. `maySpend` in contracts, with the reasoning in the comment. Unit test the matrix (2 modes × 9 statuses).
2. `requireSpend` in `with-route.ts`; 402 with a sentence, not a code.
3. Apply to both dashboard money routes; test that a `stripe/none` workspace is refused and a `direct/active` one is not.
4. Apply on the edge; test the same.
5. Setup row: when the line is the next step but the workspace cannot spend, the verb points at Billing.
6. Backfill check: run the matrix against the four live tenants and confirm none of them changes behaviour.

### Tests

- Contract matrix for `maySpend`.
- Route tests: `stripe/none` → 402; `stripe/trialing` → allowed; `direct/active` → allowed.
- A production read asserting the live tenants' modes and statuses still map to what they do today.

### Risk

Refusing a workspace that *should* be allowed is worse than the leak, because it blocks a paying customer at the moment they are trying to give you money. Mitigated by the direct-mode carve-out and the backfill check. Ship it with the Setup copy in the same PR so a refused owner is never confused about what to do.

---

## PRD 2 — The front door

### Why

`SIGNUP_CODE` is **not set in production** (verified against both Vercel projects). The route reads it as optional, so `code_required` is `false` and signup is fully open. `apps/dashboard/app/api/v1/signup/route.ts:50`

Rate limits exist and are real (5 signups per IP per hour, 3 per email — `rate-limit.ts:78`), so this is throttled abuse rather than unlimited abuse. But combined with PRD 1 it is the delivery mechanism for the money hole, and after PRD 1 it is still an unbounded queue of workspaces nobody asked for.

There is also no notification design for scale: `notifyPlatformSignup` emails on every signup, which is right at four and useless at four hundred.

### Done means

- You choose who gets in, deliberately, and can change that choice without a deploy.
- A person turned away is told something true and is not lost — they leave an address.
- Signup volume is visible without reading email.

### Design

Three postures, one switch, no new concepts:

| Posture | `SIGNUP_CODE` | Behaviour |
|---|---|---|
| **Invite** | set | today's behaviour: the code is the door |
| **Waitlist** | set to the sentinel `waitlist` | the form collects the address, writes a `waitlist` row, and says when you will be in touch |
| **Open** | unset | anyone, which is only safe after PRD 1 |

The waitlist is one table (`email`, `business`, `created_at`, `invited_at`) and one owner-only view inside the back office (PRD 5) with an **Invite** button that mails the code. Not a marketing tool — a queue you can drain.

Launch posture: **waitlist**, until PRD 1 has been live for a week with real signups.

### Work

1. Migration: `public.waitlist`, service-role only, deny-all RLS.
2. Signup route: the `waitlist` sentinel branch, returning the same shape as a successful signup so the form needs no new state.
3. The words: what the form says in each posture, in `contracts/signup.ts` beside the existing signup words.
4. Platform notification: batch the signup email to a daily digest above a threshold, keep the per-signup mail below it.
5. Set `SIGNUP_CODE=waitlist` in production.

### Tests

- Route tests for all three postures.
- A waitlist signup writes exactly one row and never a tenant.
- The words for each posture, pinned.

### Risk

Low. The failure mode is turning away someone you wanted — which is why the waitlist keeps the address rather than showing a wall.

---

## PRD 3 — Sweeps that serve every tenant

### Why

Two hourly sweeps read **every** row and do serial network work inside a 60-second function:

- `apps/edge/api/cron/calendar.ts:40` selects all of `tenant_config` with no limit, then for each workspace with an iCal URL performs an HTTP fetch and database writes, one after another. `maxDuration: 60`.
- `apps/edge/api/cron/playbooks.ts:40` groups every due playbook by tenant and iterates. It **sends**.

At four tenants this is instant. At four hundred it exceeds the function timeout partway through — and because the order never changes, the same early tenants are served every hour and the ones after the cutoff are **never served at all**, with no error anywhere. The sweep returns 200 having done a fraction of its job.

The fix already exists in this codebase. `apps/edge/lib/google.ts:272` picks its work like this:

```ts
.or(`checked_at.is.null,checked_at.lt.${before}`)
.order("checked_at", { ascending: true, nullsFirst: true })
.limit(limit)
```

Never-swept first, then least-recently-swept, capped. Every tenant is reached; nobody starves.

`playbooks` already has `last_run_at` (`00048_playbooks.sql:29`), so it needs ordering and a cap. `tenant_config` has no such column, so calendar needs one.

### Done means

- Both sweeps process a bounded number of tenants per tick, oldest-first.
- Every tenant with a feed is read at least once per its stated interval, at any tenant count.
- A sweep that could not finish its queue says so in its response, and the queue depth is visible.

### Design

- Migration: `tenant_config.calendar_checked_at timestamptz` — the same shape and meaning as `google_listings.checked_at`.
- `calendarDue(db, now, limit)` and `playbooksDue(db, now, limit)` in the edge lib, both modelled on `listingsDue`, both unit-tested against the in-memory double.
- `MAX_PER_TICK = 40` for calendar (a feed fetch is ~1s; 40 fits comfortably in 60s with headroom), `25` for playbooks (it sends, so the ceiling is lower).
- Each sweep returns `{ processed, remaining }`. When `remaining > 0` for **three consecutive ticks**, the sweep answers 503 so `sweep_health` turns it red — the same alerting lane PR #280 built. A backlog that drains is normal; a backlog that grows is a capacity signal, and it should reach you before a customer notices stale availability.

### Work

1. Migration for `calendar_checked_at`, plus the column comment saying why it exists.
2. `calendarDue` / `playbooksDue`, with the fake-db behaviour tests (rotation is exactly what a source-scan test cannot see).
3. Cap both loops; stamp the timestamp per tenant as each completes, so a timeout still records the work it did.
4. `{processed, remaining}` in both responses; the three-tick 503 rule.
5. A load check: seed 500 config rows in a scratch database and confirm every one is reached within its interval.

### Tests

- Behavioural: 100 tenants, cap 40 → three ticks reach all 100, none twice before all are once.
- A tenant whose feed fetch throws does not stop the tick and is retried next round.
- The 503 fires on the third consecutive tick with a backlog, and not the second.

### Risk

Stamping the timestamp before the work completes would silently skip a tenant for an hour. Stamp on success; a failure leaves the row due, which self-heals.

---

## PRD 4 — A green nightly and a true DR copy

### Why

The nightly journey test is **red**. The failing case is not cosmetic:

```
not ok 294 — GOLDEN: seeded Melany brain === the quarantined DR fallback, byte for byte
```

`tooling/scripts/tests/control-plane.integration.test.mjs:51` compares the live salon's stored config against `FALLBACK_BRAIN` in `apps/edge/lib/tenant-fallback.ts:21` — the copy the receptionist falls back to when the database cannot be read. Melany's config moved to v8 this morning (the published-number fix); the fallback did not.

So **a disaster-recovery restore today would reinstate the bug we just fixed** — telling every customer to call the transfer number.

> **Correction, made while executing this gate.** I first wrote that the nightly was "alternating pass/fail across the last six runs", which was wrong: I had counted manual `workflow_dispatch` runs fired during development as nightly runs. Filtered to `event: schedule`, the actual nightly is **green on every run except today's**, and today's is the real drift above. The suite is reliable; only the DR copy was wrong. Judge this workflow's health by scheduled runs alone.

### Done means

- The fallback matches the live config, and a drift between them fails a test the same day it happens rather than whenever someone looks.
- The nightly is green, and a red nightly means something is actually wrong.
- Health is judged on scheduled runs, not on manual dispatches fired mid-development.

### Design

Two separate problems, deliberately not conflated:

**The stale copy.** Regenerate `FALLBACK_BRAIN` from the live config, in the same PR as any change to that config from now on. Better: make it *derivable* — a script `tooling/scripts/refresh-dr-fallback.mjs` that reads the tenant and rewrites the literal between the existing `PROMPT-START` / `PROMPT-END` markers, so the update is mechanical and reviewable as a diff.

**The reading of it.** Classified: of the four red runs in the last ten, three were `workflow_dispatch` fired against in-progress work and one was today's real drift. Nothing needs quarantining. What needs changing is how the workflow is read — by `event: schedule` only — and that the golden, when it fails, names its own remedy so whoever sees the red is not left diffing five thousand characters by eye.

### Work

1. ~~Classify the last ten nightly failures.~~ Done: three manual dispatches against in-progress work, one real. Nothing to quarantine.
2. `refresh-dr-fallback.mjs`, dry-run by default (the production-script bar: dry run, idempotent, backup, `--apply`).
3. Run it; commit the regenerated fallback; the golden goes green.
4. ~~Fix or quarantine each flapping case.~~ Not needed — see the correction above.
5. Add a guard: if the DR fallback is older than the tenant's `tenant_config.updated_at`, the golden fails with *"the DR copy is behind the live config; run refresh-dr-fallback"* rather than a byte diff nobody can read.

### Tests

The golden itself, plus a test that the refresh script is idempotent — running it twice produces no diff.

### Risk

The fallback is what customers hear when the database is unreachable. Regenerating it from a config that is itself wrong would bake in a fresh bug. Read the composed prompt once, by eye, before committing.

---

## PRD 5 — The back office

### Why

There is no cross-tenant view. At hundreds of workspaces, every support question — *"why isn't my receptionist answering?"* — is you writing SQL by hand. Everything I did for the Chanlytics workspace today was a one-off script, and none of it is repeatable by anyone else.

The foundation is already there and unused: `public.platform_admins` was created in migration `00001_foundation.sql:36` and **nothing reads it**. An empty table waiting for a purpose.

### Done means

- One page lists every workspace with the four facts that answer most questions: is it paying, is its line answering, is its texting registered, when did it last do anything.
- Opening one workspace shows its Setup state, its line's saga step and last error, its billing status, and its recent events.
- Access is `platform_admins`, enforced in the database, not by a key or an env var.
- It is read-only in v1. Actions come later, and only ones that already exist as verbs.

### Design

Route `admin/platform` in the existing settings shell, hidden entirely unless the signed-in user is in `platform_admins`. New RPC `platform_overview()`, security-definer, whose first statement is:

```sql
if not exists (select 1 from public.platform_admins where user_id = auth.uid())
then raise exception 'not a platform admin'; end if;
```

That is the whole authorization model, in the one place that cannot be bypassed by a route that forgot.

It returns one row per tenant: name, slug, created, billing mode/status, line e164 and `voice_state`/`sms_state`, WhatsApp present, last inbound message, last error. All of it already exists; none of it is joined anywhere today.

The detail view is the Setup view-model you already have (`setupSteps`) run for another tenant — which is the point: support sees exactly what the customer sees, not a different rendering that can disagree with it.

### Work

1. Migration: `platform_overview()` + the admin check; grant to `authenticated`.
2. `GET /api/v1/platform/overview`, refusing anyone the RPC refuses.
3. The list page: sortable, one row per workspace, the four facts.
4. The detail pane: `setupSteps` for that tenant, plus line saga step, last error, recent events.
5. Add yourself to `platform_admins`.
6. Nav: the tab exists only when the overview call succeeds.

### Tests

- A non-admin gets nothing from the RPC — the test that matters, because this is the one place cross-tenant data is legitimate.
- The detail pane's rows equal the customer's own Setup rows for the same tenant.

### Risk

This is the only surface that deliberately crosses tenant boundaries. Every path to it goes through the RPC's own check, so there is one thing to review rather than one per route.

### Shipped — 9 September 2026

**#299 — the boundary and the judgement.** Three migrations, and the second and third exist because the first was checked with a real request rather than trusted:

- `is_platform_admin()` answers only about the caller, so every session may ask — the nav needs the bit, and an env var would be a second answer able to disagree with this one.
- `platform_overview()` is the cross-tenant read, with the check as its first statement. It turns the **service role** away too: the check is `auth.uid()`, not RLS, so a key alone opens nothing.
- `00092` moved the join into a SQL-language function, because Postgres does not parse a plpgsql body until the first call — and the first call here is somebody in support opening the page, which is both the worst moment to find a mistyped column and a moment CI cannot reach without an admin's session. A typo now fails the deploy.
- `00093` closed what `00092` left: `platform_overview_rows()` answered the service role `200` with every workspace in it, because Supabase grants `service_role` execute through default privileges and the revoke named the three roles I thought of. Not an escalation — that key already bypasses RLS — but a **second door**, named almost identically to the guarded one. The fix asks `pg_roles` rather than trusting a list, and the migration fails the deploy if a grant ever comes back.

**One assembly, two callers.** The 100-line Setup assembly moved out of the route into `src/server/setup.ts`. The workspace reads its own on the session client; the back office reads another's on the service client, after the database has said the caller is an admin. That is what makes "support sees exactly what the customer sees" true rather than aspirational, and a test compares the rendered rows against `setupSteps` directly so a second rendering cannot creep in.

**A verdict, not a table.** Ten verdicts, each a different next action — broken · billing · rehearsal · stalled · waiting on them · quiet · new · live · paused · test — sorted so the ones needing a person are at the top. `waiting on them` says the customer's own texting sentence, so support and customer cannot describe one state two ways.

**#300 — the page.** Settings › Back office, in the attention-row grammar People, Today and Setup already share. The tab is not in `SET_TABS`: the rail appends it only for a platform admin and the route resolves only for the same people, so a customer who types `admin/platform` lands on Profile rather than on a locked door they now know about. Read-only, visibly — not one Setup row on it carries a button.

**#301 — what a refusal says.** Reading the new page against the four live workspaces immediately turned up that the Chanlytics campaign had been refused again, and that all we had stored was the generic *"the carriers sent the registration back"*. `syncRegistration` read `brand.failure_reason` and nothing else, so every **campaign** rejection — the kind that can be fixed and resent for free — lost its causes. They were in `compliance[0].errors[]` the whole time, one level below where the code looked: the same mistake, in the same object, that once left every text held for weeks. `refusalWords()` now keeps both sides' reasons with their codes and fields.

### Open, and Ruben's

**Both refusals are answered and the campaign is back under review** (#304, #305 — resubmitted 9 September, `200`, `campaign_status: IN_PROGRESS`, `errors: []`). Editing a failed campaign is free: *"a vetting fee is assessed only once per Campaign."*

- `30886` (campaign description) — the description now states the separation outright, there are five samples rather than two, and the samples finally match the filing's own `HasEmbeddedLinks` / `HasEmbeddedPhone` declarations, which had always been `true` while no sample contained either.
- `30913` (marketing consent combined with other consents) — fixed properly rather than reworded. `contacts.marketing_consent` is a second axis with its own door; the `/yes` page asks twice with separate disclosures; `templates.category` and `playbooks.policy_class` — both of which have existed for months with nothing reading them — now decide which consent a send needs, failing closed on a null.

**One thing left, and it costs $15.** The opt-in confirmation message on the live campaign still reads *"You're subscribed to offers and news from Billing probe"* — a tenant name from before this workspace was renamed. Twilio's campaign UPDATE accepts the description, the message flow, the samples, four booleans and the two policy URLs, and nothing else: *"any parameters included in the original CREATE call, but not specifically mentioned in the update table, cannot be edited under any circumstances"*, naming opt-in, opt-out and help information. Changing it means deleting the campaign and creating a new one, which is a second vetting fee.

That is a judgement call rather than a blocker: the current rejection did not cite the name, and Twilio's guidance only says the brand name "should be aligned with the campaign information". Wait for this review; spend the $15 only if TCR asks.

Actions across tenants are deliberately absent from v1, and the PRD's rule holds for v2: only verbs that already exist as a workspace's own.

---

## PRD 6 — An ops door a human can open

### Why

`/api/admin/lines` — retry, register, refile, release — is gated on `DIAG_KEY`, which is stored in Vercel as a **sensitive** variable: write-only, unreadable by anyone including you in the dashboard UI. I hit this today: to refile the salon's A2P registration I had to import the library and drive it from a local script, recovering four values from Twilio and the database because the endpoint was unreachable.

That is fine once. It is not an operations model.

### Done means

- Every ops action that exists can be performed by a person who is a platform admin, from the product, without a secret.
- The diagnostic key remains for machine callers and stops being the only way in.

### Design

The ops actions are already implemented and already have owner-facing routes for the ones an owner should have. What is missing is the platform-admin path for the ones they should not: `refile`, `release`, `register` on another tenant's line.

Add them under `/api/v1/platform/lines/*`, authorized by the same `platform_admins` check as PRD 5, calling the same `edgeLines` helper with the server-side `DIAG_KEY` — which the dashboard already holds and which stays unreadable by humans. The key never leaves the server; the authorization is a person's session.

Keep every one of these actions writing an `events` row naming the admin who did it. An action taken on a customer's workspace by someone who is not in that workspace must be attributable, always.

### Work

1. `requirePlatformAdmin(ctx)` in `with-route.ts`, on the same RPC check.
2. Three routes: retry, refile, release. Each records an event with `by`.
3. Buttons in the PRD 5 detail pane, behind a confirmation naming what will be spent where money is involved.
4. Delete nothing: the diag-key path stays for the sweeps.

### Tests

- A non-admin is refused at the route and at the RPC.
- Each action writes an attributable event.
- The refile route refuses a filing that stands, exactly as the edge does.

### Risk

This is a privilege escalation surface by design. Keep it to actions that already exist, never a generic passthrough to the edge — a route that forwards an arbitrary `op` is a back door with extra steps.

### Shipped — 9 September 2026 (#307)

Three routes under `/api/v1/platform/lines/*`, each its own file carrying its own literal operation. The risk above is answered structurally rather than by care: a test walks the directory and asserts there are exactly three, that none reads the operation from the request body, and that `backOffice(ctx)` runs before the action in every one. The edge-operation mapping is a written-out table, not a parameter.

**Attribution is a precondition, not a side effect.** `platform.acted` — the admin's user id and the address they signed in with, against the line — is written BEFORE the action, and the action is refused if it cannot be written. What happened next is the line's own event from the edge, so the pair reads in order in one ledger.

**The cost lives in the contract.** `refile` is two actions wearing one name: a rejected campaign is corrected in place for nothing, a rehearsal is replaced by a real filing for ~$19.50 that cannot be undone. `platformLineActions` decides which one a line is offering and what it says; the page has no money figure in it at all, and a test asserts that. Actions the edge would refuse are not offered, and when it does refuse, its own words reach the screen unchanged.

Arm-then-confirm, cost said first. Verified on production: all three routes answer `401` without a session.

---

## PRD 7 — Businesses without an EIN

### Why

`brandTypeFor()` returns `SOLE_PROPRIETOR` when there is no tax id, and `soleProprietorUnsupported()` refuses that filing by name. `packages/channels/src/a2p.ts:79-93`

So a solo barber, a chair renter, a one-person salon — a large share of the market this product describes on its own homepage — can have calls and WhatsApp and **can never text**. They are not told this at signup; they discover it when they try.

The sole-proprietor path is also **ten times cheaper**: $4.50 and no $41.50 brand vetting, because there is no company to vet.

### Done means

- A business without a tax id can register for texting, or is told plainly at the point they enter their details that they cannot, and why.
- Whichever path they take, the Setup page and the texting row say something true about it.

### Design

Twilio's sole-proprietor path differs in three ways, and each is a real piece of work:

1. **A different profile policy** — the starter customer profile, not the business one.
2. **A one-time code** sent to the owner's *own mobile*, which they read back. That is a new state (`otp_waiting`, which the texting row already has words for — `connections.ts` handles it) and a new owner-facing input.
3. **Lower throughput** — T-Mobile caps sole-proprietor brands hard. Fine for a salon; it must not be sold as more.

The saga's shape already supports this: `nextA2PStep` is a list of steps over recorded receipts. Sole proprietor is a *different list*, not a different engine.

**Decide first, build second.** This is a market-size question, not an engineering one: if the answer is "we sell to registered businesses only", then the work is one honest sentence in the business-record form and a Setup row that says so — half a day instead of three days. I would not build the path until you have said which.

### Work (if the answer is "build it")

1. `A2P_POLICIES.soleProprietorProfile` and the starter-profile request builders.
2. A second step list in the saga, chosen by `brandTypeFor`.
3. The OTP: an edge verb to request it, a field on the business-record form to enter it, `sms_state: 'otp_waiting'` between them.
4. Words for the throughput cap wherever texting is described.
5. Remove `soleProprietorUnsupported`, and with it the refusal.

### Work (if the answer is "not yet")

1. The business-record form says, before the owner types anything: *"Texting registration needs a tax ID (EIN). Without one, your receptionist answers calls and WhatsApp but cannot text."*
2. The Setup texting row says the same thing rather than a generic refusal.
3. Signup does not change — they are still a customer, for two channels out of three.

### Risk

Building it and getting the OTP flow wrong strands a customer mid-registration with no way forward. The `otp_waiting` state must have a resend and an abandon path before it ships.

### Shipped — 9 September 2026

Ruben's answer was **build it**: *"of course businesses without ein are also customers if they cannot use certain features because of it until they provide what they need to then thats what it is."*

**#296 — the machinery.** The starter customer profile and sole-proprietor TrustProduct policies, read back from Twilio's live Policies API rather than copied from a blog; the request builders for both; a second step list in the saga chosen by `brandTypeFor`, skipping the representative the standard path needs and a sole proprietor does not have.

**#297 — the product loop.** `packages/contracts/src/registration-path.ts` is the fork, in one place:

- The form **asks before it renders either registration**, because an empty tax-ID box means both "there is none" and "not typed yet", and one of those answers files a permanent, capped brand. Three states, not two — the same shape `/signup` uses for its posture.
- **No new column for the answer.** A saved record already says which path it is on, held by an invariant the writers keep: a standard record cannot be saved without its tax ID, and a sole-proprietor record is never saved with one.
- **One rule for fields**, stated and tested against the request builders: a field appears on a path if, and only if, something that path files reads it. So a sole proprietor is never asked for a legal form they do not have, or a required website their registration never sends.
- **One validator, three writers.** `businessRecordProblems(record, path)` takes the path with no default; the route, the edge door and the filing all call it. The door's own hand-rolled list is gone, and so is `whatSoleProprietorNeeds`.
- **What was filed is remembered** (00090, `lines.reg_sole_prop`), because the record can change after the brand cannot. A working sole-proprietor line says its ceiling on Setup and on Connections, from one sentence.
- **The limits are said where the choice is made**, not after it — a registered brand cannot be withdrawn.

No invented price: the standard path's ~$19 is off a real invoice; the sole-proprietor path says the shape of the cost, because no such filing has been billed here yet. Put the number in from the first invoice.

### Still held: the OTP leg

The `otp_waiting` row used to offer **"Send it again"** against `verb:resend-otp`, which no page handled — a button that did nothing, on the one row in this product where a person is against a 24-hour clock. #297 removed the button and made the sentence say who asks for a new code, and `connections.test.mjs` now pins the general invariant: *every verb a row can offer is a verb the page runs.*

What it waits on, precisely:

1. **Nothing sets `otp_waiting`.** Which field of a sole-proprietor `BrandRegistration` reports "the code is out, waiting on the handset" is not something to guess — mapping it wrong flips a customer's row to "reply to the text" when no text was sent.
2. **The resend call's shape is unconfirmed.** Verifying either needs a real sole-proprietor brand to observe, and a brand costs money and cannot be withdrawn.

So this is Ruben's gate, not an engineering one: **authorise one real sole-proprietor filing** (a few dollars) and both answers come from watching it. Until then the path files, the row tells the owner the one thing they must do — reply from the handset — and nothing in the product pretends otherwise.

---

## PRD 8 — Registration a salon can complete

### Why

Chanlytics' own A2P campaign was rejected twice today, for reasons no salon owner could have diagnosed:

```
[30919] the privacy policy did not identify the business
[30907] the website URL did not match the brand and campaign
```

Fixing it took: a business-identification block on two of our pages, a workspace rename, a slug change, and an SMS-terms section added to a **separate marketing site in a different repository**. Every future customer needs the equivalent — an EIN, a website that identifies them, and a privacy policy carrying carrier-required SMS language on a domain that matches their brand.

Most salons have a Facebook page and a Booksy link. They cannot do this.

This is the single biggest gap between "sign up" and "texting works", and it is a **product** gap, not a bug.

### Done means

- A customer with no website and no privacy policy can complete a texting registration without writing anything.
- What we file on their behalf is true about them, and they can see it before it is sent.

### Design

Host the compliance surface per customer, on our domain, from facts they already gave us.

`app.chanlytics.com/b/<slug>` — a small public page carrying:

- who they are: legal name, trading name, address, phone (from `business_records`, which the carriers already vetted)
- what they do (from `brain.profile.services`)
- their SMS terms: consent, frequency, rates, STOP, HELP, and the mobile-information clause
- a link to the opt-in page that already exists at `/yes/<slug>`

Then file **that URL** as the campaign's website and privacy policy. It is on the same domain as the opt-in page and the brand's registered site — which is what reason 30907 was actually complaining about — and it identifies the business, which is what 30919 wanted.

A customer who *does* have a real website keeps using it; the hosted page is the floor, not the ceiling.

Second half: **a pre-flight check**. Before a filing is sent, run what the reviewer will check and show the owner the result: does the website resolve, does it name the business, does the privacy URL carry the SMS clauses, does the name on the record match the name in the samples. Every one of those is a rejection I have now seen in the wild, and every one is checkable in under a second.

### Work

1. `/b/<slug>` public page, built from `business_records` + `brain.profile`, with the SMS terms as a shared component with `/privacy` so they cannot drift.
2. `campaignFactsFor` uses it when the workspace has no website of its own.
3. `registrationPreflight(record, config)` in contracts: the four checks, each returning the owner's words for what to fix.

### Shipped — 9 September 2026 (#309, #310, #311)

**`/b/<slug>`**, built from `business_records` — the same facts the carriers vetted on the brand — plus the services the business told the receptionist. It carries who they are, what they do, the SMS clauses (from `SMS_CLAUSES` in contracts, which Chanlytics' own privacy policy now renders too, so the two cannot drift) and a *relative* link to `/yes/<slug>`, which is what puts both pages on one domain by construction. Indexed, unlike the opt-in page: a business a reviewer cannot look up is what 30919 was about.

**The wall came down.** `website_url` was REQUIRED on the standard path, which turned "you need a website that identifies your legal entity" into a stop at field seven of a form. It is asked and not required now, and the filing substitutes the hosted page once, before any request is built.

**`registrationPreflight`** runs the reviewer's checks before a fee is spent — the name the campaign will state against the name the brand registers (the "Billing probe" class, and the one whose consequence cannot be edited afterwards), whether the page we are about to file will actually render, whether anybody can say yes at all, and whether a given website is an address a reviewer can open. Loose enough on names not to nag about an apostrophe.

**Found on production, not in CI:** `/b/<slug>` shipped answering `307 → /login`, because the middleware's public-prefix list had one entry. The list is pinned by value in `auth-gate.test.mjs` precisely so widening it is a deliberate reviewed edit; #310 is that edit.

### Not done

A pre-flight that FETCHES — does the website resolve, does it name the business, does the privacy URL carry the clauses. Those need the network and belong on the edge; the four above are the ones answerable from facts we hold, which is most of them.
4. The business-record form runs it and blocks Submit on a failure with a fixable message.
5. A test per known rejection code we have actually received (30919, 30907), asserting the preflight catches it.

### Risk

A hosted page that says something the business would not say is worse than no page. Everything on it comes from fields the owner filled in and can edit; nothing is generated prose about their business.

---

## PRD 9 — What a paying customer actually sees

### Why

Nine of twenty surfaces are `demo` in the registry: `leads`, `pipeline`, `tasks`, `fleet`, `store`, `studio`, `content`, `shared`, `admin`. They are correctly hidden in production — but that means the People, Agents and Campaigns nav groups are far thinner for a paying customer than the mockup implies, and nobody has walked the real product as a new user with fresh eyes.

The standalone harness that renders the full mockup was, until today, crashing on load — so the two views have been drifting with nothing comparing them.

### Done means

- You have walked signup → first answered call as a new user, on production, and written down every place the product was thinner, slower or more confusing than expected.
- Each demo surface has a decision written next to it: **build**, **hide permanently**, or **delete**.
- Nothing in the shipped navigation leads to a page that explains itself as coming soon.

### Design

Not an engineering task first. A walkthrough, then a list, then the work the list implies. Do it after PRDs 1–4, on a real workspace created through the real signup, on production, with a phone in your hand for the call.

### Work

1. Create a workspace through the public signup. Time every step.
2. Reach a first answered call without touching the database. Note everything that required me, ops, or a script.
3. Per demo surface: build / hide / delete, with a sentence of reasoning.
4. File the gaps as their own PRDs.

### Risk

None, and it is the highest-information hour available before launch.

---

## What is already solid

Worth stating plainly, because the list above is all deficit and the foundations are not:

- **Tenant isolation** is RLS-first with security-definer RPCs; the one place that legitimately crosses tenants (PRD 5) does not exist yet, which is the right order.
- **Rate limits** are on every route and counted in Postgres, so a burst across serverless instances is limited in total rather than per instance.
- **Ten scheduled sweeps** are watched by `sweep_health` with alerting, and a sweep that cannot do its job now says so rather than returning 200.
- **The config** is a versioned compare-and-swap with an author and an event — "who changed what the receptionist says" is answerable.
- **The jobs ledger** paces its own recovery and settles both terminal paths in one place.
- **1,122 tests**, and the ones that matter most now run the code rather than reading it.
- **Honest state**: every place the carriers, Meta or Google touch, the product says what is actually true — including "this is a test filing and nothing is delivered", which is the class of lie that costs the most trust.

## Suggested order

**Week 1** — PRDs 1, 2, 4 (the money hole, the door, the safety net). Then PRD 3 before any cohort larger than ~50.

**Week 2** — PRDs 5 and 6 together; they share an authorization model and a page.

**Then** — PRD 7's *decision* (an hour), PRD 8's hosted page (the thing that makes texting sellable), PRD 9's walkthrough.

I would open a waitlist after week 1 and invite in tens, not hundreds, until PRD 3 and PRD 5 are in.
