# The system map

Where this system is today, layer by layer, and what is between here and done.

Measured against the tree on **13 September 2026**, first at `6a1725d` and re-measured at
`9cda33d` after the day's work (see *What moved on 13 September*, below). Every count in
this document was taken from the code, not from a plan — the plan documents in
`docs/plans/` describe intent at the moment they were written and several of
them shipped without being re-ticked, so their checkboxes are the one signal
here that is *not* trusted. Where a number is a judgement rather than a count,
it says so.

There was no system map before this one. The closest things were the four-row
table in `README.md`, the surface classification in
`apps/dashboard/src/legacy-bridge/surface-registry.ts`, and eighteen plan
documents. This file is the join of those three against what is actually built.

---

## First: there are two finish lines, and only one of them is "100%"

This matters more than any number below, because the same codebase reads as
either 79% done or 100% done depending on which line you measure to.

**The receptionist product** is the thing a salon pays for: a customer texts or
phones, an AI answers within seconds, books, reschedules, and hands over what it
should not decide; an operator watches and takes over. That is the product, and
"100% in all layers" means *that* product complete, safe and observable.

**The mockup** is the ported HTML artifact in `apps/dashboard/src/legacy` —
28,061 lines of JSX across 69 files, 50 pages. It contains an entire second
product: an agent fleet, an agent store, an agent studio, a task manager, a
content tool, a sales pipeline. Those were drawn, never specified, and never
promised to anyone. From `apps/dashboard/src/legacy/CLAUDE.md:3-7`:

> The mockup-only surfaces — Agents (fleet, store, studio, tasks), Content,
> Pipeline and Leads, the shared report viewer — stay here and stay hidden from
> every real workspace. Ruben's decision: most of it is revisited **when the
> product is at 100%**; none of those features is built before then.

So the mockup's unbuilt half is not distance-to-100%. It is *after* 100%, by an
explicit decision recorded in three places (`legacy/CLAUDE.md`,
`surface-registry.ts:36-41`, `legacy-bridge/manifest.ts:56-60`). This map counts
it separately and never folds it into the gap.

---

## The scoreboard

| Layer | Where it is today | What 100% means | Distance |
|---|---|---|---|
| **Channels** | WhatsApp live with real customers. SMS code-complete, blocked on a carrier. Voice inbound-only. Email declared in the enum, absent in code. | Two channels a customer can actually reach, both observable. | **The largest gap in the system**, and mostly not ours to close |
| **Edge runtime** | 41 endpoints, all shipped. 4 retired but still deployed. | — | Complete for the receptionist product |
| **Shared packages** | 4 packages, `dist` committed and drift-guarded in CI. | — | Complete |
| **Schema & tenancy** | 118 migrations, 42 tables, RLS on all 42, 91 functions. | — | Complete; 4 consistency nits |
| **App plane (`/api/v1`)** | 124 handlers, every one declaring scope / role / rate / spend. 0 undeclared. | — | Complete |
| **Operator surfaces** | 22 real, 6 deferred by decision, 2 retired, 1 fall-through default. | Every surface a paying customer can reach shows real data or says it is not built. | Complete — *and never walked end to end* |
| **Quality & CI** | 250 test files, 2,027 tests, 0 failing. Two required checks. | The live path is executed, not read as text; a green PR means something. | **Was the second-largest gap; mostly closed** |
| **Observability** | 17 clocks registered and judged; deadman, sweeps, operator paging. | — | Complete; 4 alerts lack a consequence |
| **Commercial** | Stripe live end to end. Signup, onboarding, back office shipped. | — | One dead end: the waitlist |

---

## Layer 1 — Channels

The only layer where the honest answer is "one of four".

| Channel | State | What is actually missing |
|---|---|---|
| **WhatsApp** | **Live.** One real salon, real customers, real number. | Nothing |
| **SMS** | **Code-complete, carrier-blocked.** Ingress, signature verification, consent/STOP handling, footer, held-line behaviour, A2P registration and refiling are all built and executed by tests (`sms-ingress.test.mjs` runs the real planner over an in-memory database). | A carrier verdict. The campaign has been refused five times and there is no sixth verdict. `lines.sms_state` carries `otp_waiting` (sole-proprietor) and `hosting` (hosted SMS) as declared-but-unbuilt escape routes — `00066_lines.sql:26` says so in the CHECK itself. |
| **Voice** | **Inbound only.** Four Retell endpoints: inbound routing, the function bridge, availability, and the webhook. Whisper, hand-over and end-call all work from the dashboard. | No outbound calling anywhere in the tree (`create-phone-call` appears nowhere). Booking write-back from a voice call goes through the same path as text, but no e2e ever walks it. |
| **Email** | **Declared, absent.** `MESSAGE_CHANNELS` and the `tenant_channels.kind` CHECK both list `email`; no edge code implements it. | Everything. This is a channel the schema promises and the product does not have. |

The webhook door for voice deserves one precise sentence, because it is easy to
state wrongly in both directions: **the Retell signature is verified**
(`verifyRetellSignature`, over both the raw and re-stringified body, because
Retell's own em-dash handling made one form fail). But a valid signature is not
the *only* way in — a correct shared key also opens it — and if
`RETELL_WEBHOOK_KEY` is unset the edge falls back to `RETELL_API_KEY`, which is
not the badged key, so every signature fails and the shared key becomes the only
door in practice. The endpoint warns about exactly this on every request.

---

## Layer 2 — The edge runtime

41 endpoints in `apps/edge/api`, deployed as vanilla Vercel functions:

- **9 public/provider doors** — `whatsapp`, `inbound-sms`, `stripe-webhook`,
  four Retell endpoints, `health`, `diag`
- **22 key-guarded back-office doors** under `admin/`
- **8 cron sweeps** — `calendar`, `calls`, `deadman`, `google`, `health`,
  `lines`, `playbooks`, `registrations`
- **2 job endpoints** — `jobs/tick`, `jobs/fire`

Four of those are retired but still reachable: `jobs/fire.ts`,
`admin/backfill.ts`, `admin/backfill-calls.ts`, `admin/pause.ts`. Nothing calls
them; they are deployed surface area with no owner. Deleting them is a
half-hour's work and shrinks the attack surface by four doors.

The admin doors share one lock. `EDGE_CALL_SECRET` — the per-workspace,
per-person, one-minute token — is *optional*: `apps/dashboard/src/server/edge.ts:24`
accepts `EDGE_CALL_SECRET || DIAG_KEY`, and `admin-auth.ts:6` says the shared key
still works "while `EDGE_CALL_SECRET` is being rolled out." Until that variable
is set in production, one shared secret opens all 22.

Four job kinds exist and only four: `outbound_send`, `broadcast_send`,
`blob_thread_erase`, `line_provision`. Five earlier kinds were declared ahead of
their slice and then deliberately deleted rather than left as dead enum values —
`enums.ts:40-46` records why each one went. That is the discipline this layer is
held to, and it holds.

---

## Layer 3 — The shared packages

`contracts`, `db`, `channels`, `jobs`, `core`. Nothing outstanding.

The one thing to know: `packages/*/dist` is committed, because Vercel's
vanilla-function bundler will not follow pnpm symlinks into the lambda. CI
rebuilds and diffs it on every PR (`ci.yml:48-50`), and `dist-freshness.test.mjs`
catches it locally. This is guarded properly.

---

## Layer 4 — The schema and tenancy

118 migrations, replayed from zero on a fresh Postgres in `database.yml`.

| | Count |
|---|---|
| Tables | 42 |
| With RLS enabled | **42 — all of them** |
| With at least one policy | 36 |
| Deny-all by design (RLS, no policy) | 6 |
| `create policy` statements | 72 |
| Functions | 91 |

**The floor holds.** No policy targets `anon`. None uses `using (true)`. No
table is granted to `anon`. Every tenant-table policy scopes on `memberships`,
`auth.uid()`, `is_acting_member` or `is_workspace_owner`. The one
`SECURITY DEFINER` function executable by `authenticated` without a membership
guard is `profile_set` (`00068_profiles.sql:34`), which writes only the caller's
own row — correct.

Four consistency nits, none of them a live leak:

1. ~~**Four deny-all tables do not revoke their grants.**~~ **Closed 13 September** (`f9a7b00`; **applied to production 13 September**. The file is `00119_the_floor_is_uniform.sql` on this branch and was renumbered to `00120` when it landed, because the branch it stacked on added a `00119` of its own). `billing_events`, `jobs`,
   `platform_admins` and `sweep_status` have RLS on and no policy, which denies
   everything — but they never `revoke all ... from anon, authenticated`, so
   Supabase's default privileges leave both roles nominally holding
   SELECT/INSERT/UPDATE/DELETE with only RLS between them and the data. Three
   sibling tables do belt-and-brace it: `operator_pages` (`00105:26`),
   `waitlist` (`00088:46`), `rate_hits` (`00059:14`). **The inconsistency is the
   finding**, not the exposure — four one-line migrations closes it.
2. ~~**Nine policies omit the `TO` clause**~~ **Closed 13 September** (the same migration; the first census said eight — it missed `invitations_member_read`). and so default to `TO PUBLIC`, which
   includes `anon` (`00012:71,73,105,107`; `00029:15,24`; `00033:18`;
   `00073:39`). Not a leak — every predicate keys on `auth.uid()`, which is NULL
   for `anon` and matches zero rows — but off-pattern from the other 64.
3. **`idempotency_keys` is member-DELETE-able** (`00033:24`), so an operator can
   delete a key and replay a once-only request. Already narrowed once, and
   mitigated by the reply route scoping the key to the caller plus a request-hash
   compare. The DELETE right remains.
4. **The `events` partition precreate can wedge permanently.** A pg_cron job on
   the 25th creates the month-after-next's partition. A `DEFAULT` partition
   catches overflow so a lapsed precreate degrades ingest instead of aborting it
   — but once rows for month M land in `events_default`, creating M's own
   partition *raises*, and the cron then fails every month until a human moves
   the rows out. `sweep-health.ts:73` names this exact failure. Detection is
   indirect (a 35-day silence on `cron.job_run_details`), and nothing alerts on
   `events_default` row count. Separately, **there is no partition-level purge** —
   `purge_events` deletes rows by kind, nothing ever drops an old partition, so
   record-kind data grows forever.

**Tenancy by construction is done, and the plan that says otherwise is stale.**
`docs/plans/2026-09-09-the-system-it-should-be.md` still shows Phase 3 with five
open boxes; that phase was rewritten as
`docs/plans/2026-09-10-the-route-definition.md`, which is 13 of 13 shipped. The
rewrite explicitly decided *against* a workspace cookie — "selection stays per
tab; there is no cookie" — so the absence of a `chanlytics_ws` cookie and a
`workspaces/select` route is the design, not a gap.

---

## Layer 5 — The app plane

`apps/dashboard/app/api/v1`: 107 route modules, **124 handlers, 0 undeclared.**

Every handler is built with `read()` or `write()` and declares five things:
scope, role, rate, spend, input. One wrapper enforces all five in a fixed order.
`route-policy.test.mjs` imports every route module and holds it to
`route-policy.json`; `route-types.test.mjs` regenerates the typed client registry
in memory and byte-compares. This is the best-guarded layer in the repo and there
is nothing outstanding in it.

Worth remembering what it replaced, because it is the measure of the change:
before September 10th, 74 handlers read `?workspace=` by hand, 50 of 70 writes
assembled member→role→rate themselves, 12 writes took no rate token at all,
input was validated three different ways, and **no test ran a handler**.

---

## Layer 6 — The operator surfaces

`surface-registry.ts` is the authoritative classification: 31 rows, and anything
marked `demo` renders the honest "not in this release" card outside an explicit
demo session. A test fails CI if the shell declares a route this table does not
classify, so a fabrication cannot ship by forgetting.

| | Count | |
|---|---|---|
| **Real** — fed by live data through the SurfaceData seam | **22** | today, inbox, conversations, clients, segments, reports, live, calendar, outbound, broadcasts, messages, and 11 admin panes including the back office |
| **Retired** — the feature was folded into another surface | 2 | `leads`, `pipeline` → People. The booking is the conversion, and People shows who booked. Not pending work. |
| **Fall-through default** | 1 | `admin`, so an unlisted pane inherits the honest default rather than shipping unclassified |
| **Deferred to after 100%** | **6** | `shared`, `tasks`, `fleet`, `store`, `studio`, `content` |

Those 22 real surfaces are fed by 11 distinct SurfaceData overrides, and the
registry test pins that every real row has one and every override has a row.

**Against the receptionist finish line the surface layer is complete: 22 of 22.**
Against the mockup it is 22 of 28. The six deferred surfaces are unbuilt at
*every* layer — no half-finished route, no orphan table, no dead component. That
is worth stating plainly, because a partially-built feature is a liability and
none of these is one.

If any of the six were ever brought forward, the cheapest by a wide margin is
`shared` — the read-only report viewer — at an estimated 4–6 days, because the
numbers behind it are already real and the tokened-public-page pattern already
ships twice in this repo (`/b/[slug]` and `/yes/[slug]`). `tasks` is second at
5–8 days, since `jobs` already stores the five states it would need. These are
estimates, not commitments, and neither is on the path to 100%.

---

## Layer 7 — Quality and CI

This is the layer where the numbers look best and the reality is weakest.

**The numbers.** 250 test files. `pnpm test` with no credentials: **2,027 tests,
1,913 pass, 114 skip, 0 fail.** 35 Playwright spec files, 141 tests.

**The reality.** 1,039 of those assertions are `readCode`/`readRaw` source scans
— they read a file as text and assert a string is in it. A source scan proves the
code still *says* something; it does not prove the code *does* anything. The
repo knows this and fights it with a ratchet (`source-scan-baseline.json`, a
per-file count that may only fall), which is the right mechanism. But the
distribution is the problem:

| Layer | Execution coverage |
|---|---|
| `apps/dashboard/app/api/v1` | **Best.** 82 of 106 route modules imported and invoked against a fake database |
| `apps/dashboard/src/server` | Good — 29 of 45 executed |
| `apps/edge/lib` | Good — 31 of 52 executed |
| `packages/contracts` | Good — invoked by 152 test files through its entry point |
| the legacy-bridge | Weak — 12 of 39 executed; the two most-pinned modules in the whole repo (`surface-data.ts`, `LegacyApp.tsx`) are text-only, and this is the exact seam every "fabricated data" bug has lived in |
| **`apps/edge/api` handlers** | **Was the worst layer; now among the best.** 41 handlers; **30 execute** (was 5). 8 are still pinned by text — `whatsapp.ts`, `inbound-sms.ts`, `jobs/tick.ts`, `retell-inbound.ts`, `retell-fn.ts`, `retell-availability.ts`'s `POST`, and two retired doors. 3 are touched by nothing. |

That last row *was* the finding: on the morning of 13 September the path a real
customer's message travels was the least-executed layer in the system. By that
evening 30 of the 41 handlers ran under test — the Retell webhook, the lines
door, all eight cron sweeps and seventeen back-office doors — and the eight
that remain are exactly the ones whose work was not commissioned: the WhatsApp
door, the SMS door, the job tick and the two other Retell doors. Their plans
are written and their briefs are ready.

**What CI does not cover:**

- **No production build, anywhere.** Neither `next build` nor any build of
  `apps/edge` runs in CI — only typecheck and lint. A build-time failure reaches
  Vercel before it reaches a reviewer.
- **e2e never runs on a pull request.** `pnpm e2e` appears only in the 09:00 UTC
  nightly, against **production**.
- **The 112 database tests do not run on a PR.** They are in `ci.yml`'s `pnpm test`
  and they all skip without credentials, so a green PR proves nothing about RLS,
  CHECK constraints, triggers, `SKIP LOCKED`, tenancy or retention.
- **`database.yml` is not a required check.** Its own header says branch
  protection requires Secret scan and Typecheck only — so a red migrations replay
  does not block a merge.
- ~~**`packages/db/src/database.types.ts` is the one unguarded generated
  artifact.**~~ **Closed 13 September** (`97f803f`). `ci.yml:61-63` was a
  *comment describing a freshness check that was never implemented*; the check
  now exists — `tooling/scripts/check-db-types.mjs`, run in `database.yml`
  against the database the migrations replay, ignoring exactly one line
  (`PostgrestVersion`, which the generator reads off the running PostgREST) and
  exiting 2 when the CLI cannot be reached, so a check that cannot run never
  passes. **Its first CI run landed green on [#460](https://github.com/expectmeout/chanlytics-os/pull/460)** — the step is
  unconditional in the workflow, so a green job is the check passing, and the
  committed types do match the replayed migrations. Still owed: one deliberate
  red, to see the check fail on purpose.
- No coverage instrumentation, no dependency audit, no SAST beyond eslint and
  gitleaks, no migration linter, no rollback test. Playwright is Chromium-only.
- `pnpm check:dist` is wired to `package.json:10` and called by nothing — a
  stricter guard than the CI line, sitting dead.

One thing here is genuinely well-built and should not be lost:
`REQUIRE_SERVICE_CREDENTIALS=1` is the anti-hollow-run flag, and it makes three
separate guards bite (the node suite, the browser suite, and a skip ceiling). It
exists because the nightly once reported success four mornings running while
executing 24 of 128 specs. It is deliberately *not* keyed on `CI`, because GitHub
sets `CI=true` for the credential-free PR job too.

**Uncovered in e2e**, and the first name on the list is the one that matters:
the **inbox / conversation thread detail** — the product's central surface — has
no dedicated spec. Nothing exercises reply, take-over, escalation resolution or
the message lifecycle in a browser. Also uncovered: `admin/platform` (the back
office, which already shipped broken once), `admin/activity`, `admin/memory`,
`/b/[slug]`, `/reset-password`, `/data-deletion`.

---

## Layer 8 — Observability

17 clocks are registered as data in `sweep_status` and judged against
`cron.job_run_details`, so a sweep that stops running is a row that goes stale
rather than a silence nobody notices. The deadman watchdog pages a human when a
customer is waiting and nobody has answered; `pageOperator` gives platform-level
conditions durable per-key suppression so one condition is one page, not fifty.

Four registered alerts fire without a sentence saying what a human should
*do* about them. That is a documentation gap in the alert body, not a missing
alarm.

There are zero real `TODO`/`FIXME` markers in the repository.

---

## Layer 9 — Commercial

Stripe is live end to end: Checkout, the portal, subscription lifecycle,
trial-ending and payment bells, and a webhook that verifies, claims by event id,
releases the claim on failure so a retry is not answered "duplicate", and refuses
to be overwritten by a late word about a subscription the workspace has already
replaced. Signup, onboarding, line provisioning and the back office are shipped.

**One dead end: the waitlist has an intake and no drain.** `waitlist.invited_at`
and `waitlist.invited_by` are declared in the schema and written by nothing —
they appear only in the generated types. Someone joins the waitlist and there is
no mechanism, anywhere, to invite them.

---

## What moved on 13 September

Twelve commits, all on `claude/admiring-albattani-s9j8x9`, each written by an
implementer and then attacked by two independent adversarial reviewers —
mutation probes against the handler for the fidelity lens, a hygiene lens for
everything else — and fixed until both passed. Nine fix rounds in all; the
reviewers caught, among other things, a pin whose replacement was vacuous, a
guard that was not load-bearing, and a production seam whose default branch —
the one production actually takes — nothing exercised.

| | Before | After |
|---|---|---|
| `apps/edge/api` handlers executing under test | 5 of 41 | **30 of 41** |
| Source-text pins on those handlers | 100 | **19** (8 handlers, all uncommissioned or retired) |
| Tests in the suite | 1,854 | **2,027** |
| Source-scan reads across the suite | 1,039 | **960** |
| Generated artifacts with no freshness check | 1 | **0** |
| Policies applying to `PUBLIC` | 9 | **0** (after `db push`) |

Two things found along the way that are not yet fixed, both recorded rather
than quietly absorbed: five admin doors answer a `null` JSON body with a 500
where a 400 belongs (the body is parsed, becomes `null`, and the next property
read throws), and a pre-existing test had a clock bomb that began failing at
16:00 UTC that day on every branch — defused in `43b010d`.

## The distance to 100%, in order

Ordered by what actually stands between the product and done. Effort figures are
estimates.

| # | What | Why it is here | Effort |
|---|---|---|---|
| 1 | **Walk gate 9** — signup → first answered call, on production, as a new user with a phone in hand | The only launch gate with an empty state cell. Nine gates were defined; eight shipped. Nobody has ever walked the real product with fresh eyes, and its own PRD calls it "the highest-information hour available before launch." Everything below this list may be reordered by what that hour finds. | ~1 day |
| 2 | **The SMS carrier verdict** | The single largest functional gap, and mostly not ours to close. Five refusals, no sixth verdict. Every line of code behind it is written and tested. | Blocked externally |
| 3 | **Execute the edge handlers** | 33 of 41 handlers on the live customer path are pinned by text and never run. `apps/dashboard/app/api/v1` already proves the pattern works — 82 route modules invoked against a fake database. The same treatment applied to `whatsapp.ts`, `inbound-sms.ts`, `retell-webhook.ts`, `jobs/tick.ts` and the 8 crons would move the weakest layer to the strongest. **Approved 13 Sep; six of eight sessions done that day** — the Retell webhook, the lines door, all eight crons and seventeen back-office doors now execute (41 pins deleted). **Left:** the WhatsApp door, the SMS door + job tick, and the two other Retell doors — plan: `docs/plans/2026-09-13-the-edge-handlers-run.md`, tasks A, B and D. | ~3 days left |
| 4 | **Guard `database.types.ts`** | The one generated artifact with no check, where `ci.yml` carries a comment describing the check and no step implementing it. A dropped column typechecks clean and fails in production. **Done 13 Sep** (`97f803f`); first CI run green on #460. | done |
| 5 | **An e2e spec for the conversation thread** | The product's central surface has no browser test. Reply, take-over, escalation resolution, the message lifecycle. | 2–3 days |
| 6 | **Make `database.yml` a required check** | A red migrations replay currently does not block a merge, on a product whose entire safety model is in the schema. **Approved 13 Sep, not yet done** — plan: `docs/plans/2026-09-13-the-replay-is-a-required-check.md`; the final setting flip is yours. | ~1 hour |
| 7 | **Automate the `events` partition** | It can wedge permanently and self-perpetuatingly, with up to 35 days of detection lag, and the remediation is manual. Alert on `events_default` row count; add a partition-level purge. | 1–2 days |
| 8 | **Set `EDGE_CALL_SECRET`** and delete the 4 retired endpoints | One shared key currently opens 22 admin doors; four deployed doors have no caller. | ~half day |
| 9 | **Drain the waitlist** | People are joining a list nothing reads. | 1–2 days |
| 10 | **The four `revoke` migrations and the eight `TO authenticated` clauses** | Consistency, not exposure. Cheap, and it makes the tenancy floor uniform enough to audit at a glance. **Done 13 Sep** (`f9a7b00` — nine clauses, not eight); replayed green in CI and applied to production the same day, as `00120` after a renumber. | ~2 hours |
| 11 | **Add `next build` to CI** | A build failure should not first appear on Vercel. | ~1 hour |

Not on this list, deliberately: outbound calling, email as a channel, and the six
mockup surfaces. All three are real work; none of them is between here and the
receptionist product being complete.

---

## What this map deliberately does not count

- **Plan checkboxes.** `docs/plans/2026-09-09-the-system-it-should-be.md` shows 2
  of 74 complete. Five of its seven phases have since shipped under other names
  and were never re-ticked: Phase 0 as the source-scan ratchet, Phase 1 as the
  jobs ledger, Phase 2 as `schema-sets.generated.ts`, Phase 3 as
  `2026-09-10-the-route-definition.md` (13 of 13), Phase 4 as `operator_pages`
  and `page-operator.ts`. Counting its boxes would report this system as 3%
  finished, which is false by an order of magnitude. **Read the code, not the
  plan.**
- **The mockup's unbuilt half.** Six surfaces, deferred by a recorded decision to
  after 100%. Counting them as debt would report the product as permanently
  incomplete against a target nobody set.
- **Test *count*.** 1,913 passing tests is not 1,913 proofs. Where it matters,
  this map counts what executes.

## Keeping this map true

It will go stale, and the cheapest thing that keeps it honest is to re-derive the
counts rather than edit them by hand:

```bash
ls supabase/migrations/*.sql | wc -l                     # migrations
find apps/edge/api -name '*.ts' | wc -l                  # edge endpoints
python3 -c "import json;d=json.load(open('tooling/scripts/tests/route-policy.json'));print(len(d['routes']),'routes,',d['undeclared'],'undeclared')"
grep -c ': "real"' apps/dashboard/src/legacy-bridge/surface-registry.ts   # 22
find tooling/scripts/tests -name '*.test.mjs' | wc -l    # test files
corepack pnpm test                                        # the honest pass/skip split
```

Two statements in this repository were factually stale when this map was written
and were corrected the same day (`6a1725d`): the README described the edge as
four kinds of endpoint when it has 41, and the registry described Live's writes
as unbuilt when all three ship. A map is only worth having if it is corrected
when it drifts.
