# Their receptionist, before they sign up: the build

The spec is `docs/superpowers/specs/2026-10-30-their-receptionist-before-they-sign-up-design.md` (decided by Ruben on
30 Oct 2026), and the decision note is 0079. Built on `leads/their-receptionist-before-they-sign-up` in the
`cm-lead-preview` worktree from `5d7e3d533`, one branch, one pull request. The migration takes the next free number
when it is pushed (00497, claimed 31 Oct in `Claude Video/docs/migration-claims.md`, above #1964's 00495 and #1962's 00496) and goes to production
before the merge (`land --applied`). `LEAD_PREVIEWS` is set on the edge after it.

**L1 as built (30 Oct 2026, uncommitted in `cm-lead-preview`).** Tasks 1 to 7, with what the build found on the way:

- **The migration** also has two triggers (a row deleted takes its workspace; a lead blanked or erased ends its preview)
  and registers the table where a new table must be: `delete-tenant.mjs`, the erasure registry and its completeness
  test, the tenancy test, `NOT_A_SEATS_DOOR` (the claim counts owned workspaces, reads no seat), the three sweep lists
  and `_clocks.mjs` (`due`, over `lead_previews.ends_at`), `EVENT_KINDS` and the activity families (`preview` is
  leads'), and the job kind's words (`health-clocks.ts`, `notifications.ts`). `never-again.db.test.mjs` reads
  `lead_convert_by`'s new words.
- **`askPreview`** (`apps/edge/lib/previews/make.ts`) is the one way a preview is made, for the sender and the press
  alike, and the job kind's caller.
- **Three fixes the new table needed elsewhere:** `tenant-db.ts` names its builder's type (inferred, its declaration
  outgrew TS7056); `person-details.ts` calls its doors on the client, not a bound `rpc` (TS2589); and
  `erasure-completeness.db.test.mjs` passes its search in a file (`--file`), past Windows' 32 KB command line.
- **Dead exports left for L2 to L5:** the repository's doors and reads, and `PREVIEW_LIMITS`, are called by the page, the
  claim and the sender; until then knip counts them.

**How each task runs:**

- Each task writes its test first and runs that one file, red, then makes it pass:
  `node tooling/scripts/checks/test.mjs <file>`, one file per run, never an empty file argument.
- A `.db.test.mjs` runs against this lane's local stack, which `supabase start` makes. Run it with
  `--test-concurrency=3`, and never point it at production.
- Lint (uncached, on the touched files), typecheck, format and dead exports run once, in task 12.
- Every commit waits for Ruben's word ("no commit until approved").

## L1. Preview workspaces and their build

### 1. The migration

Files:

- `supabase/migrations/00497_a_lead_sees_its_own_receptionist.sql` (new)
- `tooling/scripts/tests/previews/previews.db.test.mjs` (new)
- the generated files, from the local stack: `gen:schema-sets`, `gen:schema-snapshot`, `gen:db-types`, `gen:data-model`

Steps:

1. **The test,** over `tooling/scripts/tests/_rows.mjs` with made-up leads (example.com sites, 555-01xx numbers):
   - **Make:**
     - `preview_make` for an `ours` workspace's ready place lead makes a `preview` tenant (its config and policies by
       00017's trigger), a `building` row and a 22-character token.
     - A second call answers the same row.
     - A workspace not `ours`, a company lead, an archived lead and an erased one are each refused.
   - **The clock:**
     - `preview_built(ok)` sets `ready`, `built_at` and `ends_at` (plus 30 days).
     - `preview_built(false, 'no_name')` sets `failed`.
     - `preview_sent` once moves `ends_at` to 30 days after it, and a second call changes nothing.
   - **The counts:**
     - `preview_said` twenty times, then `54000`. `tried_at` is set once, and `turns` holds 40.
     - `preview_called` adds a call and its seconds.
     - `preview_not_right` ten times, then `54000`.
   - **The claim:**
     - `preview_claim` as a signed-in user: the tenant is `active`, an owner membership exists, and the row is
       `claimed`.
     - The lead is `converted` with `lead.converted {how: claimed}`.
     - Its `in` enrollments are `left` with why `made_it_theirs`, and its planned and held sends are skipped with that
       reason.
     - A second claim is refused ("is already set up"), as are a claim of a `failed` or `ended` row and one by a user
       who owns ten.
     - Two claims at once (two connections) make one owner.
   - **The end:** `preview_end` deletes the preview tenant (`rehearsals` and `business_reads` go with it), clears
     `turns` and `not_right`, sets `ended`, and keeps `asked_count`, `call_count` and `call_seconds`.
   - **Row security:** a member of the sender reads the row; a member of another workspace reads nothing; nobody but
     the doors writes.
   - **The slug's move:** `create_workspace_for` still makes a workspace, a slug, its collision suffix and the partner
     credit, as `tooling/scripts/tests/workspace/` already proves. Run those files too.
2. **The migration, re-runnable:**
   - `tenants_status_check` dropped and added with `preview`.
   - `lead_previews` with the spec's columns and checks:
     - `token ~ '^[A-Za-z0-9_-]{22}$'`
     - `failed_why` present exactly when the state is `failed`
     - `jsonb_typeof` arrays, with lengths at most 40 and 10
     - `asked_count` from 0 to 20
   - **Indexes:** unique `(tenant_id, lead_id)` and unique `token`, plus partial ones:
     - `(ends_at) where state in ('building','ready','failed')`
     - `(tenant_id, tried_at) where tried_at is not null`
   - **Row security** as `leads`: select for `is_member(tenant_id)`, nothing else granted.
   - **The token** is made in `preview_make` as
     `translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_')` cut to 22.
   - **`slug_for_workspace(p_name text) returns text`** is `create_workspace_for`'s slug block as it stands. Re-create
     `create_workspace_for` calling it, with the rest of its body copied from `supabase/schema.sql` unchanged.
   - **The doors** as the spec says, each `security definer set search_path to 'public'`:
     - EXECUTE revoked from `public`, `anon` and `authenticated`, and granted to `service_role`.
     - `preview_claim` is the exception, granted to `authenticated`.
     - `preview_claim` locks the row by token (`for update`) before any check.
     - It ends the lead's places with `sequence_enrollments_leave(..., 'made_it_theirs', auth.uid())`, and skips sends
       as `reach_out_lead_stop` does (states `planned`, `held`, `drafted` in live runs).
   - **`lead_convert_by`** re-created from its newest form, its how list taking `claimed`.
   - **`jobs_kind_check`** takes `preview_build`, and the jobs lane expression puts it in lane 1 beside `website_read`.
     Copy both from 00479's form.
   - **The sweep's clock:** `trigger_previews_sweep()` as `trigger_deadman_sweep()` (00018, through 00026's
     `sweep_status`), its `sweep_status` row `previews`, and `cron.schedule('previews-sweep', '41 * * * *', …)`.
3. **The generated files,** on this lane's local stack.

### 2. The repository

Files:

- `packages/db/src/repositories/campaigns/lead-previews.ts` (new; the repositories' root is at its 20 modules)
- `packages/db/src/index.ts`
- `tooling/scripts/tests/previews/previews.db.test.mjs`

Steps:

1. **The test:** every function over the stack, answering the door's shape. `leadPreviewByToken` of an unknown token
   is null.
2. **The functions,** typed from `database.types.ts`:
   - one per door: `makeLeadPreview`, `previewBuilt`, `previewSent`, `previewOpened`, `previewSaid`, `previewCalled`,
     `previewNotRight`, `claimPreview`, `endPreview`
   - `leadPreviewOf(db, tenantId, leadId)`
   - `leadPreviewByToken(db, token)`, with the service role
   - `previewsTriedSince(db, tenantId, since)`
   - `previewsPastTheirEnd(db, now, limit)`

   A door's raised `54000` is answered as `{ ok: false, reason: "limit" }`, and `P0002` as `"not_found"`.

### 3. The lead as a listing (contracts)

Files:

- `packages/contracts/src/previews/lead-as-listing.ts` (new)
- `packages/contracts/src/reach-out/lead-hours.ts`
- `packages/contracts/src/previews/index.ts` (new)
- `tooling/scripts/tests/previews/lead-as-listing.test.mjs` (new)

Steps:

1. **The test.**
   - `listingPeriodsOf`:
     - a week of "9 AM to 6 PM", Saturday "10 AM to 2 PM" and Sunday "Closed" gives six periods, Sunday absent
     - a day that doesn't read gives null
     - "Open 24 hours" every day gives `[{ open: {day:0,hour:0,minute:0}, close: null }]`
     - "6 PM to 2 AM" closes on the next day
   - `leadAsListing`: the called-by name, the address line, `phone_e164`, the website from `website_host`,
     `primary_type_label` from `category`, and `time_zone` from `zoneOfRegion`.
   - `firstReceptionistOf({ workspaceName, listing: leadAsListing(lead) })` holds the week through `hoursFromGoogle`,
     with no booking link and no number.
2. **The code.**
   - `listingPeriodsOf(hours: unknown): GooglePeriod[] | null` beside `saidWeekOf`, over `weekHoursOf`'s day reader. A
     day it cannot read gives null for the whole week.
   - `leadAsListing(lead: LeadListingInput): FirstReceptionistKnown["listing"]`.
   - No guardrail of its own: `never_quote_prices` holds unless a row stores false (contracts `guardrailsInForce`), and a
     preview wears no price; the test proves it in force.
3. The browser entry stays unchanged (nothing here is the browser's yet). Run the generator's `--check` in task 12.

### 4. Found for you's adds, shared (contracts and the first run)

Files:

- `packages/contracts/src/imports/found-adds.ts` (new)
- `packages/contracts/src/imports/index.ts`
- `apps/dashboard/src/surfaces/setup/first-run/found.tsx`
- `tooling/scripts/tests/imports/business-reads.test.mjs`
- the first run's tests in `tooling/scripts/tests/setup/` (`first-run-check.test.mjs`)

Steps:

1. **The test:**
   - `withFoundServices` keeps `PROFILE_LIMITS.services` and each service's price where `prices: true`.
   - `withFoundClosure`, `withFoundRule` (into `booking_rules.notes`, cut at `PROFILE_LIMITS.ruleNote`) and
     `withFoundNote`.
   - `withFoundWorn(profile, foundOf(reads, record))` adds every service without its `price_note`, every day, rule and
     answer, and the description where the record has none.
   - Found for you's own presses still make what they made (the first run's tests, unchanged).
2. **The move:** `foundActs`' four profile changes become the four functions, and `found.tsx` calls them (prove the
   move by values: the same profile in, the same out).

### 5. The website read, lifted (edge)

Files:

- `apps/edge/lib/imports/website-read.ts`
- `tooling/scripts/tests/imports/a-website-is-read-for-check.test.mjs`

Steps:

1. **The test:** unchanged, and green before and after.
2. **The lift:** `readWebsite(db, tenantId, url, deadline): Promise<BusinessReadFacts | null>`, which is
   `websiteReader.read`'s body from `feedUrlOk` to `keepBusinessRead`. `read` calls it with the job's payload.

### 6. The build (edge and jobs)

Files:

- `apps/edge/lib/previews/build.ts` (new)
- `packages/jobs/src/handlers.ts`, `context.ts` and `schedule.ts` (`preview_build:${preview_id}`)
- `apps/edge/lib/ops/jobs-tick.ts` (the runner's wiring: `previews: previewBuilder(db)` beside `websiteReader(db)`)
- `apps/edge/lib/env.ts` and `apps/edge/.env.example` (`LEAD_PREVIEWS`)
- `apps/edge/lib/log.ts` (`LOG_EVENTS`)
- `tooling/scripts/tests/previews/preview-build.test.mjs` (new)
- `tooling/scripts/tests/jobs/jobs-ledger.test.mjs` (the kind and its lane)
- `tooling/scripts/tests/repo/env-manifest.test.mjs`

Steps:

1. **The test,** over `_fake-db.mjs`, with the website stubbed:
   - **The build:**
     - It writes the receptionist (the price rule on, the hours as listed) through `putTenantConfig` at the config's
       version.
     - It reads the site, keeps the read, and wears services without prices and the day closed.
     - It answers `preview_built(true)`.
   - **When something is missing or fails:**
     - A site that cannot be read is still `ready`, with the listing alone.
     - A lead with no website skips the read.
     - A lead with no name gives `failed`, `no_name`.
     - A thrown write gives a retry, and a second throw gives `failed`, `build_failed`.
   - **Off:** with `LEAD_PREVIEWS` unset the handler builds nothing and leaves the row `building`, and the sender makes
     no job (task 10).
2. **The code:** `buildPreview(ctx, job)` in the order the spec gives. The handler in `handlers.ts` is
   `preview_build: previewBuild` through what the edge injects (`ctx.previews`), as `website_read` is.

### 7. The sweep (edge, channels)

Files:

- `apps/edge/lib/previews/sweep.ts` (new)
- `apps/edge/api/cron/previews.ts` (new, `sweepDoor`)
- `apps/edge/vercel.json` (its limit)
- `packages/channels/src/voice/` (the Retell client: `deleteAgent`, `deleteRetellLlm`)
- `tooling/scripts/tests/edge/door-policy.json`
- `tooling/scripts/tests/previews/previews-sweep.test.mjs` (new)

Steps:

1. **Read Retell's API reference** for the two delete paths (`DELETE /delete-agent/{agent_id}`,
   `DELETE /delete-retell-llm/{llm_id}` as remembered; check them) and write the requests as the client's others are.
2. **The test:**
   - A preview past its end with an agent has its agent and LLM deleted, then `preview_end`.
   - A 404 at Retell is gone.
   - A 500 leaves the preview for the next hour and logs `preview_end_failed`.
   - A claimed preview is never touched.
   - The door's knock is pinned.

## L2. The page

**L2 as built (31 Oct 2026, uncommitted in `cm-lead-preview`).** Tasks 8 and 9, with what the build found:

- **The words** are `LEAD_PREVIEW_WORDS` in their own module (`previews/preview-words.ts`), since `PREVIEW_WORDS` is a
  campaign preview's, and the page carries none of the server's views. The head says "Chanlytics set this up for
  {business}.": nothing records a signer a page could name. "What it knows" is hours, address, phone, website and
  services; the record keeps no booking link. `previewLineOf` (the sender's line) moved to L5, where it is drawn.
- **The server:** `server/public/preview-page.ts` reads by token (the look through `link-page.ts`'s `linkPageLookOf`),
  `server/previews/preview-doors.ts` answers the three doors, and `server/previews/public-route.ts` is their one knock
  (same origin, `preview_ip`, the envelope). `tryReceptionist` takes a null person. `next.config.ts` sends the page's
  `X-Robots-Tag`, `Referrer-Policy` and `no-store`.
- **The kit's stylesheet** is imported by the surface (`surfaces/preview/preview-page.tsx`), so the preview's route alone
  loads it: in `globals.css`, every page in the shell would load it twice (`globals.css` says so).
- **Tests:** the auth gate names the three doors and holds each to `previewRoute` (its check was a text search for
  `withRoute`); the route policy lists them as their own doors; the 404 test gains the preview's addresses; the page is
  drawn by an esbuild bundle over the dashboard's own React, state by state.
- **The walk** (31 Oct, the throwaway stack, a stand-in for the edge's eval door on a loopback port; rig in the session's
  scratchpad, `lead-preview-rig` in `Claude Video/.claude/launch.json`): a starter and a typed price question answered
  with their `then` lines, the price rule handing it to the owner, Not right kept, the chat back after a reload, the
  opening counted once a load, an unknown token a 404, at a desk and a phone width. The page follows the app's theme,
  dark until the light-default lane lands.


### 8. The page's views and words (contracts)

Files:

- `packages/contracts/src/previews/lead-preview.ts` (new)
- `packages/contracts/src/previews/starters.ts` (new)
- `tooling/scripts/tests/previews/lead-preview.test.mjs` (new)

Steps:

1. **The test:**
   - `previewPageOf` gives each state: building, ready, back again (turns kept), at the limit, ended (past `ends_at`
     or `ended`), made theirs (by the viewer, or by anyone else), and not found.
   - `previewLineOf` gives every line the spec lists, with counts in words ("Opened twice · 4 messages · a call of a
     minute").
   - `previewStartersOf`: a closed Sunday gives "Are you open on Sunday?", a service gives "How much is a {service}?",
     and none gives "What are your hours?". It gives three at most, and none repeats.
   - Every string comes from `PREVIEW_WORDS`.
2. **The code,** as the spec's §2. The words are the brief's §7, short and in the owner's voice.

### 9. The page and its routes (dashboard)

Files:

- `apps/dashboard/app/preview/[token]/page.tsx` (new)
- `apps/dashboard/src/server/public/preview-page.ts` (new)
- `apps/dashboard/src/server/public/public-page-gate.ts`
- `apps/dashboard/app/api/v1/previews/[token]/{message,call,opened,not-right}/route.ts` (new)
- `apps/dashboard/src/server/previews/` (new: `message.ts`, `call.ts`)
- `apps/dashboard/proxy.ts` (`/preview/` and `/api/v1/previews/`, each with its argument)
- `apps/dashboard/src/server/rate-limit.ts` (`preview_ip`: 40 an hour; `preview_call_ip`: 6 an hour)
- `apps/dashboard/src/surfaces/preview/` (new: the page, its chat, its call row, What it knows, the sticky foot)
- `tooling/scripts/tests/route-policy.json`, then `node tooling/scripts/gen/route-types.mjs` and
  `corepack pnpm gen:api-reference`
- `tooling/scripts/tests/previews/preview-page.test.mjs` and `preview-routes.test.mjs` (new)
- `tooling/scripts/tests/auth/auth-gate.test.mjs`

Steps:

1. **Read `.claude/skills/chanlytics-interface/SKILL.md` first.** Every part comes from the kit:
   - the thread's bubbles
   - Try it's answer and `then` line (`tryItVM`)
   - the button, the chip, the field, the sheet
   - the first run's building lines
   - 0075's look (the mark, the accent on the one button and the links)

   No page primitive and no literal value. The page is light by default and dark by the system, with one column of at
   most 560 px.
2. **The test,** over stub React and a fake database:
   - **The page** draws every state of task 8.
   - **Messages:**
     - A message sends the earlier turns from the row (at most 12), never the browser's.
     - It calls the eval door with `user: null` and the preview's workspace.
     - It keeps the reply with `preview_said`, and the twenty-first is refused with the limit's words.
   - **Buckets:** the network's bucket refuses the forty-first.
   - **Tokens:** an unknown token is a 404 before any read of a workspace, and so is an ended one's message route.
   - **Opening:** `opened` counts once per page load, and the page posts it only after it has drawn.
   - **The response:** it carries `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
   - **The gate:** the proxy's gate lets `/preview/x` and `/api/v1/previews/x/message` through, and nothing else new.
3. **The code:**
   - The message route is `tryReceptionist`'s call (`server/receptionist/try.ts`) for the preview's workspace, its
     answer through `tryItVM`.
   - What it knows reads the preview workspace's profile through the service role. Each row says where it came from:
     - Google for hours, the address and the number
     - your site for services, rules, answers and the booking link

## L3. Call it

**L3 as built (31 Oct 2026, uncommitted in `cm-lead-preview`).** Task 10, with what the build found:

- **The minutes:** `rehearsalAllowance` takes a required `preview`, and its window `preview` is six minutes in all
  (`REHEARSAL_LIMITS.previewMs`, read by `PREVIEW_LIMITS.callMs`). The edge's `allowanceOf` asks whether the workspace
  is a preview by its row (`leadPreviewOfWorkspace`, not claimed), not by `tenants.status`.
- **Counted once:** the webhook settles a call's end twice (`call_ended`, then `call_analyzed`), so `preview_called` is
  asked on the first end alone, when the rehearsal had not ended.
- **The door:** `previewCall` in `server/previews/preview-doors.ts`, through `startRehearsal` with no person (its body
  names no `user_id` then), its refusals said in the page's words; `previewRoute` takes its bucket by name, and a call's
  is `preview_call_ip` (six an hour per network). A preview that has said its twenty messages can still be called.
- **The page:** `surfaces/preview/call.tsx` over the rehearsal's own call module: connecting, on the call, mute, end,
  the minutes left, and the microphone or a refused start in the page's words. No live transcript: the rehearsal keeps
  the words, read by whoever makes it theirs (a public read of them would be a fifth door; not worth it here).
- **Tests:** `previews/preview-call.test.mjs` is the first unit test of the edge's call door and its settle (the voice
  test covers the agent alone); the routes test gains the call door; the page test draws the call row.
- **The walk** showed the refusal path only: the stand-in edge has no call door. A real call needs the deployed edge
  and Retell.


### 10. The call (edge, dashboard)

Files:

- `packages/contracts/src/rehearsal/rehearsal.ts` (`previewMs`, the window `preview`)
- `apps/edge/lib/voice/rehearsal-call.ts`
- `apps/dashboard/src/server/previews/call.ts`
- `apps/dashboard/src/surfaces/preview/` (the call row, over `legacy-bridge/rehearse/call.ts`)
- `tooling/scripts/tests/voice/the-receptionist-is-made-before-any-number.test.mjs`
- `tooling/scripts/tests/previews/preview-routes.test.mjs`

Steps:

1. **The test:**
   - **The allowance:** `rehearsalAllowance({ preview: true, spentMs })` gives six minutes in all, and
     `rehearsalCallMs` three at most.
   - **The edge:**
     - The call door counts a preview workspace's minutes in its window.
     - The webhook's end of its call answers `preview_called` with the seconds.
     - A workspace that is not a preview is unchanged.
   - **The route:**
     - It calls the edge's rehearsal call with `user: null`.
     - It answers what the browser joins with.
     - A seventh call from one network in an hour is refused.
   - **The page:** a microphone refused says "Your browser kept the microphone off. You can type instead." A failed
     call says the rehearsal's own words.
2. **The code:** `allowanceOf` reads `tenants.status` beside the plan, and `settleRehearsalEvent` reads it on an end.

## L4. Make it mine

**L4 as built (31 Oct 2026, uncommitted in `cm-lead-preview`).** Task 11, with what the build found:

- **The address:** Make it mine opens `/preview/<token>/mine`, not `/signup?preview=<token>`.
  - It is a server page under the preview's public prefix. It reads the preview (`previewForSignup`,
    `server/previews/claim.ts`) and draws sign-up's screen, moved whole into `src/auth/SignupScreen.tsx`. `/signup`
    draws the same screen with no preview.
  - Why: read in the browser, the page drew "Create your workspace" and the business-name box until the read answered
    (the walk saw it). Read on the server, the business's words are the first paint. It also means no public read of
    the address, `/signup` stays static, and the proxy still sends a signed-in person away from `/signup`.
  - A preview that can no longer be made theirs goes back to its page, which says why. A token that names nothing is
    Not found (`public-page-gate.ts`). Both addresses send no-store, noindex and no-referrer.
- **The posture:** `signupPostureFor(posture, previewLive)` in contracts, asked by the sign-up route and the screen,
  replaces `firstWorkspaceDoor`'s `previewMatches`. The claim needs no door, since the token is the invite and
  `preview_claim` checks it. The create route makes workspaces and claims nothing.
- **The address filled in** is the lead's `email`, which `leadForPreview` reads now. It reaches the form through the
  server page, never a URL.
- **What sign-up keeps:** `PendingWorkspace.preview`. The route keeps it only while the link is live, and a value that
  is not a token is dropped while the name and clock stand.
- **The claim:** `POST preview-claims`, on the account with no role, in the `create_workspace` bucket, its body
  declared. `claimPreviewFor` asks the door on the claimer's session, then does what a first workspace does:
  `notifyPlatformSignup`, `giveFirstAlertAddress`, the first-run marks, and `clearPendingWorkspace` (lifted out of
  `workspace-create.ts`, one copy). A refusal is the door's own words: 409 for someone's own, ended or ten workspaces,
  404 for none.
- **Three ways in:**
  - A new account claims as its code signs it in, on the screen.
  - An account that comes back later claims on the first screen (`CreateWorkspace.tsx`, from the kept token, whatever
    the posture). Refused, it shows the form with the door's sentence.
  - Someone signed in claims with one press, or chooses Use another account. Google comes back to the same address.
- **The landing:** the first run reads where it stands. What the preview was used for becomes the claimer's own Setup
  marks (`previewFirstRunMarks`): talked to or called gives `receptionist-met`; called gives `rehearse-skipped`, so the
  wait for a review is put off.
- **The form under a preview:** the business's heading and lead, Google's hint, and Make it mine on the press. There is
  no business-name box and no device clock, since the preview keeps its business's own clock.
- **Found on the way:**
  - The activity feed had no words for `preview.made` and `preview.claimed`. That was missed in L1, and the B13 test
    caught it.
  - The routes test's stand-in for the said door returned its refusal instead of raising. fakeDb makes the error
    envelope from a throw, so it raises now.
- **Tests:**
  - New: `previews/preview-claim.test.mjs`.
  - Added to: the three sign-up tests, `create-workspace-screen`, `auth-gate` (both preview addresses' headers), the
    public gate, `preview-page` and `activity`.
- **The walk, on the stack:**
  - Fixture Barbers (3 messages, no call): Make it mine, the form with its address, the code, then the claim. It opened
    at 3 of 5 · Rehearse. The rows: active, owner, `receptionist-met`, lead converted, both `preview.claimed`, the first
    alert address, the kept answers cleared. Its Make it mine now goes back to "Fixture Barbers is already set up."
  - Fixture Florist (untried), signed in: one press, and it opened at 2 of 5 · Your receptionist.
- **Not walked:** Google's way back (it needs Google) and the platform's notice (the stand-in edge).
- **Left for later:** "Already have a workspace? Sign in" lands home after sign-in, not back on Make it mine. The person
  opens the link again and presses once.

### 11. The claim (contracts, dashboard)

Files:

- `packages/contracts/src/workspace/signup.ts` and `signup-schema.ts`
- `apps/dashboard/app/api/v1/signup/route.ts`
- `apps/dashboard/src/server/platform/signup.ts`
- `apps/dashboard/app/signup/page.tsx` and its surface
- `apps/dashboard/app/api/v1/preview-claims/route.ts` (new)
- `apps/dashboard/src/server/previews/claim.ts` (new)
- `tooling/scripts/tests/route-policy.json` and the generated client
- `tooling/scripts/tests/auth/signup.test.mjs`, `signup-posture.test.mjs` and `signup-screen.test.mjs`
- `tooling/scripts/tests/previews/preview-routes.test.mjs`

Steps:

1. **The test:**
   - **Sign-up:**
     - With a live preview token, sign-up opens under `invite` and `waitlist` (`firstWorkspaceDoor`'s
       `previewMatches`).
     - An ended or claimed token doesn't open it, and an unknown one says nothing about tokens.
     - The pending workspace keeps the token.
     - The screen says "{business}'s receptionist is waiting for you", with the address filled in.
   - **The claim:**
     - `POST preview-claims` signed in calls `preview_claim` as the member.
     - It gives the first alert address, notifies the platform and clears the pending workspace, as
       `workspace-create.ts` does after its door.
     - It answers the workspace in `/api/v1/workspaces`' shape.
     - A second claim gives 409 with "{business} is already set up."
   - **The landing:** it is the workspace's first run, where business and receptionist read filled, and rehearse reads
     filled where the preview had a call.
2. **The code.** The page's Make it mine has two paths:
   - signed out: `/signup?preview=<token>&email=<the address>`
   - signed in: one press to the claim route

   Then the page goes to the claimed workspace.

## L5. The slot and what the sender sees

**L5 as built (31 Oct 2026, uncommitted in `cm-lead-preview`, on main's `5b255865c`).** Tasks 12 and 13, with what the
build found:

- **The base:** main had moved under the lane (#1961 and #1963 changed the reach-out words, the cold ending and the
  edge's request). The lane had no commits of its own, so it was fast-forwarded to main, and L1-L4 stayed uncommitted
  on top. Only the generated browser entry overlapped, and it was regenerated.
- **The slot:** `their preview`, the eleventh. `linkCount` counts it.
  - A first step naming it is `first_has_their_preview`: "A first email carries no link. Put their preview in a later
    step."
  - `SlotLead.preview` is a `LeadPreviewSlot` (open with its link, building, or gone), not a bare `preview_url`.
    Contracts `previewSlotOf(row, now, origin)` says which.
  - A step that names it ends with the mailbox's signature as a first email's does, less each line that holds a link
    (#1963's `coldSignatureOf`), rather than never with the signature. The preview is the step's one link.
  - A card or a test mail shows the slot as "made when it goes", never as a hole.
- **The sender:** `previewForWords` reads the lead's preview only for words that name it.
  - Open: the link goes in, and `preview_sent` starts its thirty days.
  - Being made: the send is held (`preview_building`, an hour on).
  - None yet: `askPreview` is asked once the switch is on; with the switch off, nothing is made.
  - Failed, ended, someone's own, or refused by its door for good: skipped (`no_preview`), with the skip's words.
  - The sheet's preview of a send reads it the same way and makes nothing.
- **The press:** Make their preview goes through the edge (`POST /api/admin/previews/make`, `makePreviewFor` over
  `askPreview`), so the switch and the one way it is made hold for it too. The admin folder is over its module count,
  so the door is `api/admin/previews/make.ts`.
- **The line:** contracts `previews/preview-line.ts`, apart from the page's words (`previewLineOf`,
  `PREVIEW_LINE_WORDS`, `LeadPreviewDto`). The sheet's section is `surfaces/leads/sheet/preview.tsx`, over
  `GET`/`POST leads/:id/preview`. A refusal is said in place, and Copy is the kit's own.
- **Open it:** `?look=1` draws the page with what it has said and what it knows, nothing to press, and no open
  counted.
- **Today:** `GET lead-previews` (reader `previewsTried` in `readers/leads.ts`, three days back) feeds the `tried` row.
  It sorts after everyone waiting, is not a person, opens the lead, and its words are `NEED_YOU_WORDS.tried`. The
  browser's Today, the server's Today and Ask's read it alike.
- **The step editor:** GET settings says `previews` (ours), read with the workspace row the settings read already
  takes. The leads step sheet's Insert offers the slot from step two (`leadPreviewOfferOf`); for a first email or a
  company's lead it says why not. The new-sequence words sheet names it after the first email.
- **Ask's drafter:** one more rule, only for a workspace that makes previews.
- **The Console:** the verdict `preview`, its own group "Previews", left out of the customers and the paying, counted
  as "Previews: N". `hasPublicPages` refuses `preview`.
- **Found on the way:**
  - The edge's door pin had no line for L1's previews sweep. It does now.
  - "Not right" sends a fact by its label, so the line reads either a label or a key.
- **Tests:**
  - New: `previews/preview-line.test.mjs`.
  - Added to: `reach-out-step-words`, `reach-out-request`, `reach-out-sender.db` (the stack), `preview-page`,
    `today-queue`, `console-contracts`, the public pages, `sequence-draft`, `lead-sequence-build` and `ask/readers`.
- **The walk:**
  - Today's row for Fixture Barbers (the "Not right" line in their words; "made it theirs"; Open the lead).
  - Open it on Fixture Dental, which counted nothing, then the lead's own visit, which did.
- **Not walked:**
  - The lead sheet's section in the app: the rig's made-up leads come from no real search, and the Leads page lists
    none of them.
  - Make their preview against a real edge.

### 12. The slot and the sender's hold (contracts, edge)

Files:

- `packages/contracts/src/reach-out/reach-out-words.ts` (`REACH_OUT_SLOTS`, `linkCount`, `validateReachOutWords`)
- `packages/contracts/src/reach-out/reach-out-rules.ts` (`SlotLead`, `reachOutValues`, 0077's `coldEndingOf`)
- `apps/edge/lib/reach-out/request.ts` and `sender.ts`
- `tooling/scripts/tests/reach-out/reach-out-words.test.mjs`, `reach-out-request.test.mjs`, `reach-out-rules.test.mjs`
  and `reach-out-sender.db.test.mjs`

Steps:

1. **The test:**
   - **The save:**
     - `{{their preview}}` is a slot (`REACH_OUT_SLOTS[10]`).
     - It is refused in step one with the spec's words.
     - It counts as a link, so a step with it and another link is refused.
     - A step naming it signs with the Signed line.
   - **The fill:** `reachOutEmailOf` fills it from `preview_url`.
   - **`reachOutWords`:** `preview_building` for a lead with none or one building, and `no_preview` for a failed or
     ended one, both before the lead's values.
   - **The sender:**
     - It holds `preview_building` and asks for the preview (`askPreview`, L1), whose build is scheduled once.
     - It skips `no_preview`.
     - A sent email naming the slot answers `preview_sent`.
     - With `LEAD_PREVIEWS` off it holds the send and makes nothing.
   - **Old words:** a stored version from before the slot reads as before.
2. **The code:** the sender reads the lead's preview beside its slots (`leadPreviewOf`) and builds `preview_url` as
   `${dashboardOrigin()}/preview/${token}` (`apps/edge/lib/dashboard-origin.ts`). No new variable.

### 13. What the sender sees (dashboard, Ask)

Files:

- `apps/dashboard/app/api/v1/leads/[id]/preview/route.ts` (new)
- `apps/dashboard/src/server/leads/lead-preview.ts` (new)
- `apps/dashboard/src/surfaces/leads/sheet/panes.tsx`
- `apps/dashboard/src/server/readers/today.ts`
- `packages/contracts/src/today/today-facts.ts`, `today-queue.ts` and `today-vm.ts`
- `packages/contracts/src/need-you/need-you-words.ts`
- `apps/dashboard/src/surfaces/campaigns/sequences/new/new-message-sheets.tsx`
- `apps/dashboard/src/server/sequences/draft.ts`
- `apps/dashboard/src/surfaces/console/` (the previews count)
- `packages/contracts/src/workspace/platform.ts` and `billing.ts`
- `packages/contracts/src/console/console.ts`
- the tests:
  - `tooling/scripts/tests/today/` (the queue)
  - `tooling/scripts/tests/leads/` (the sheet)
  - `tooling/scripts/tests/console/console-contracts.test.mjs`
  - `tooling/scripts/tests/public/a-paused-workspace-asks-nobody-for-a-yes.test.mjs`
  - `tooling/scripts/tests/sequences/sequence-draft.test.mjs`
  - `tooling/scripts/tests/route-policy.json`

Steps:

1. **The test:**
   - **The lead sheet:**
     - It draws the line for each state, with Make their preview (an `ours` workspace only), Open it (`?look=1`, which
       counts nothing) and Copy link.
     - The route makes one and answers its line.
     - A workspace not `ours` is refused with words.
   - **Today:** a lead who tried theirs since the queue last read is a `tried` row, newest first, and opens the lead.
     A failed read is null, and the rest of the page stands.
   - **The Console:** the verdict `preview` is left out of the customers and counted as "Previews: N".
   - **Public pages:** `hasPublicPages("preview", "open")` is false.
   - **The step editor:** it offers the slot from step two, and for an agency search it says why not.
   - **Ask's drafter:** its rules say the slot for a workspace that makes previews, and nothing for one that does not.
2. **The code,** as the spec's §4.

## 14. Checks, docs and landing

1. **Read `status`'s readers once more:**

   ```bash
   git grep -nE "\"test\"|'test'" -- packages apps supabase/migrations
   ```

   Every place that leaves out `test` as a workspace's status leaves out `preview` too, or says why not.
2. **The checks:**
   - lint uncached on the touched files
   - `corepack pnpm -r typecheck`
   - Prettier
   - the tests of every touched folder
   - `node tooling/scripts/gen/contracts-browser-entry.mjs`, then the same with `--check`
   - `check:dead-exports`
3. **One walk in the real app on the local stack** (browser pane):
   1. Make a preview for a made-up lead.
   2. Open `/preview/<token>`, text it three times and call it for a minute.
   3. Press Not right, then Make it mine through sign-up.
   4. Read the first run.
   5. Read the lead's line and Today's row as the sender.

   Screenshot each state.
4. **The docs:**
   - `docs/system-prd.md`: the leads sheet, the sequences sheet and the public pages
   - decision 0079's status and README row, set to built
   - `docs/architecture.md`'s public pages, if it lists them
5. **Landing,** on Ruben's word for each step:
   1. Commit.
   2. `land`, with no auto-merge, because of the migration.
   3. Apply the migration to production and read it back.
   4. Merge.
   5. Smoke.
   6. Set `LEAD_PREVIEWS=on` on the edge.
   7. Make one preview for a lead on production and open it.
