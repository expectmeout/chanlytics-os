# Their receptionist, before they sign up

**Asked by Ruben, 30 October 2026.** He asked for five bold changes to the product, then a deeper pass on them, then
"Shape #3 first": a business in a cold-email sequence gets its own receptionist, built from its listing and website,
on a private page where the owner texts it, calls it and makes it theirs. The design brief (`Claude
Video/docs/2026-10-30-lead-preview-brief.md`, outside the repository) was approved with its spend: "Approve, write spec".
Written against main's `5d7e3d533` (#1960), by hand, no sub-agents. Decision note 0079.

**Status:** decided, not built. The lane is `leads/their-receptionist-before-they-sign-up` in `cm-lead-preview`, one
branch and one pull request, built in the order of the plan
(`docs/superpowers/plans/2026-10-30-their-receptionist-before-they-sign-up.md`). One migration, the next free number
when it is pushed (00497, claimed on 31 October above #1964's 00495 and #1962's 00496).

**What the code read changed from the brief.** Eight calls are simpler than the brief had them, each said where it
lands below:

1. Who may make previews is the workspace marked `ours` (00469), not a new Console switch.
2. The calls are counted in minutes: six, at most three in one call, by the rehearsal's own allowance.
3. Make it mine is the sign-up page, with the preview's link standing for an invite code.
4. The chat is kept on the sender's row, and the calls stay the preview workspace's own rehearsals.
5. The build starts at the first send that needs it, and batch planning is untouched.
6. Opening is counted by the page's own script, so a mail scanner's fetch isn't an open.
7. "Not right" reaches the sender only, never the claimed workspace.
8. The Need you row opens the lead, with no reply drafted ahead.

## Why

Read on main `5d7e3d533`:

- **A cold email asks a business to imagine the product.** Step one carries no link (0056); step two says what the
  product does. Nothing a business receives shows its own receptionist answering its own customers, though every part
  that would is built and keyed on a workspace.
- **Every part already exists, per workspace.**
  - **Try it:** the edge's eval door, `apps/edge/lib/receptionist/eval.ts`, answers one message for one workspace. It
    sends nothing and writes nothing. It returns what the live turn would do (`then`), and answers a workspace with no
    line as its chat would.
  - **The browser call:** `apps/edge/lib/voice/rehearsal-call.ts` makes the workspace's agent at Retell before any
    number (`ensureVoiceAgent`) and counts its minutes (`rehearsalAllowance`).
  - **The setup:** the first receptionist is written from a listing (contracts `firstReceptionistOf`).
  - **The website and the look:** the website read (`website_read`, 0073) reads the business's site, and 0075 wears the
    look it finds there.
- **The dashboard can already ask the edge for a workspace nobody is a member of.** `callEdge` takes `user: null`
  (`apps/dashboard/src/server/edge.ts:119`).
- **Deleting a workspace erases it whole.** 83 of the 87 foreign keys to `tenants` cascade. The other four
  (`billing_events`, `partner_earnings`, `platform_acts`, `privacy_requests`) are `ON DELETE SET NULL`, so a delete
  needs no new code.
- **A `test` workspace is already kept apart.** The Console leaves it out (`platform.ts` verdictFor, `console.ts`), and
  `hasPublicPages` refuses it public pages (contracts `workspace/billing.ts`). A preview needs the same two treatments.
- **A sequence already holds a send that waits on the workspace** and lets its lead keep its place (the sender's
  `HOLDS`, `apps/edge/lib/reach-out/sender.ts`). A send that waits on its preview is one more such hold.

So a preview is a workspace with a new status, built by the parts that exist, and reached by one new slot.

## What is decided

1. **A preview is a workspace of its own,** status `preview`, with no member. The tenants insert trigger (00017) gives
   it the policies and config every workspace starts with. It is left out wherever `test` is (the Console's customers,
   public pages) and counted apart in the Console as previews. No billing row is made, so nothing is billed. It is
   open to the model by `openToCustomersOf`'s own rule: a workspace with no billing row is judged by its standing alone.
2. **It is built from the lead.** The lead's row (its called-by name, category, address, phone, website, and its hours
   where every day reads) goes through `leadAsListing` into `firstReceptionistOf`. Its zone is `zoneOfRegion`
   (contracts `reach-out/us-zones.ts`), else New York. `profile.guardrails.never_quote_prices` is on in every preview.
3. **The website is read and worn.** Where the lead has a website, the preview's build reads it with the website
   read's own function. It keeps the read in `business_reads`, which wears the look as 0075 does. It then wears into the
   receptionist what Check would offer:
   - every service, without its price (`price_note` left out)
   - every day closed
   - every booking rule
   - every answer
   - the description

   The per-kind changes Found for you makes move from the browser (`surfaces/setup/first-run/found.tsx`) into
   contracts (`imports/found-adds.ts`), so the page and the build make the same change.
4. **Only the workspace marked `ours` (00469) may make previews.** Chanlytics' own sends are the only cold email that
   carries one in this version. A partner's turn, credited at claim on 0016's terms, is a later step of this note. The
   edge's `LEAD_PREVIEWS` switch (`on`, or anything else for off) turns the whole build off, as 0070's spenders are,
   and it ships off.
5. **One new slot, `their preview`,** the eleventh, at the end of `REACH_OUT_SLOTS` (a slot's number is its place in a
   stored version). Its value is the preview's link, `https://app.chanlytics.com/preview/<token>`:
   - The rule for links holds it. It counts as the step's one link (0056), so the save refuses it in a first email
     ("A first email carries no link. Put their preview in a later step."), and in a step that carries another link.
   - A step that names it ends with the mailbox's signature as a first email's does since 0077's amendment (#1963): less
     each line that holds a link. The preview is the step's one link.
   - The token is 22 characters of base64url over 16 random bytes, kept on the preview's row (it is the link, as an
     invitation's is). The page is `noindex` and sends `Referrer-Policy: no-referrer`.
6. **It is built at the first send that needs it, or on the sender's press.**
   - When a step that names the slot comes due for a lead with no preview, the sender makes the preview, schedules its
     build and holds the send (`preview_building`). The send is planned again an hour on, as every hold is (`HOLD_MS`),
     and the lead keeps its place.
   - A preview that could not be made skips that lead's send with `no_preview`, and the lead's line says why.
   - Batch planning is not changed. The lead sheet's "Make their preview" makes one by hand.
7. **The limits.**
   - **Messages:** 20, kept on the row, counted by the database.
   - **Calls:** six minutes in all, three at most in one call. This is a third window in the rehearsal's own allowance
     (`REHEARSAL_LIMITS.previewMs`), so the edge's call door counts it as it counts every rehearsal.
   - **How long it lasts:** 30 days from the first email that carried it, or from its build if no email ever does.
     Then it is ended: its Retell agent and LLM are deleted at Retell, its workspace is deleted, and its chat and Not
     right lines are cleared. The row keeps its counts and its dates.
8. **The chat is Try it's door,** asked by the dashboard for the preview workspace with no person (`user: null`). Each
   message's earlier turns come from the row, never from the browser, at most the door's 12. The reply and its `then`
   are kept on the row with the message. A call is a rehearsal of the preview workspace, kept in `rehearsals` as every
   rehearsal is. The webhook's end of a preview's call adds its seconds to the row.
9. **Opening is counted by the page itself:** a beacon its script posts once it has drawn, so a mail scanner fetching
   the link is no open. "Tried" is the first message or the first call.
10. **Make it mine is the sign-up page.**
    - `/preview/<token>/mine`, sign-up's screen with the preview read on the server, says whose receptionist is
      waiting, with the address it was sent to filled in. It asks for what sign-up asks (a password, then the code).
      (Built at this address rather than `/signup?preview=`; the plan's L4 note says why.)
    - The preview's link stands for an invite code whatever the sign-up posture, because only Chanlytics sends one.
    - Once the code signs them in, the page claims the preview instead of making a workspace.
    - Someone already signed in claims it with one press.
    - The claim seats the claimer as owner, makes the workspace `active` and lands in its first run at the first step
      not filled (0073). The preview's calls count as the rehearsal heard.
    - The first claim wins, and the door's lock makes two at once one claim.
11. **A claim ends the lead's sequence.** The lead becomes converted (`lead_convert_by`, a new how: `claimed`). Its
    places leave every sequence (`sequence_enrollments_leave`, why `made_it_theirs`). Its planned and held sends are
    skipped with the same reason. News on both workspaces: the sender's `preview.claimed`, and the claimed workspace's
    own first events as any new workspace has (the platform notice, the first alert address).
12. **"Not right" never changes the receptionist.** Up to ten lines (the fact and what is right, if they say it) are
    kept on the row for the sender. The page says "Thanks. You can fix it in a minute once it's yours."
13. **What the sender sees.**
    - **The lead sheet's line:** none, building, ready, sent, opened ×N, tried (N messages · a call of a minute), "says
      Saturday hours are wrong", made theirs, ended, or couldn't be made (why). Beside it: Make their preview, Open it
      (which counts nothing) and Copy link.
    - **Today:** a row on Need you once a lead has tried theirs ("{business} tried their receptionist · asked about
      Saturday hours"), whose button opens the lead.
    - **The step editor:** offers the slot from step two on.
    - **Ask's drafter:** may name `{{their preview}}` in a step after the first, for a workspace that makes previews.
14. **The digital-agency sequence gets none.** Its leads are partner prospects. The slot is for a business that takes
    bookings, which the step editor says when a sequence's search is an agency one.

## What changes, part by part

### 1. The database (one migration)

- **The status:** `tenants_status_check` takes `preview`.
- **The table `lead_previews`.**
  - Its columns:
    - `id`
    - `tenant_id`: the sender's workspace, cascading
    - `lead_id`: cascading, and unique with `tenant_id`
    - `preview_tenant_id`: set null on delete
    - `token`: unique, 22 base64url characters
    - `state`: `building`, `ready`, `failed`, `claimed` or `ended`
    - `failed_why`: at most 60 characters, and present exactly when the state is `failed`
    - `made_by`
    - `built_at`, `first_sent_at`, `ends_at`
    - `opened_count`, `opened_at`, `last_opened_at`
    - `turns`: jsonb, an array of at most 40
    - `asked_count`: 0 to 20
    - `tried_at`
    - `call_count`, `call_seconds`
    - `not_right`: jsonb, an array of at most 10
    - `claimed_at`, `claimed_by`
    - `ended_at`, `created_at`, `updated_at`
  - Row security: a member of `tenant_id` may select it. Nobody inserts or updates it but the doors below.
- **The doors.** Each is security definer, and EXECUTE is the service role's unless said.
  - `slug_for_workspace(p_name)` is lifted out of `create_workspace_for`, which is re-created to call it with its body
    otherwise unchanged.
  - `preview_make(p_tenant_id, p_lead_id, p_name, p_timezone, p_by)`:
    - Refuses unless `p_tenant_id` is `ours` and the lead is a place in `ready` or `nurture`, not erased.
    - Answers the lead's row where one stands. Otherwise it makes the workspace (status `preview`, its slug from
      `slug_for_workspace`) and the row in `building`.
    - Writes `preview.made` on the sender's workspace.
  - `preview_built(p_id, p_ok, p_why)` sets `ready` with `built_at` and `ends_at` (built plus 30 days), or `failed`
    with its why.
  - `preview_sent(p_id)` stamps `first_sent_at` once and moves `ends_at` to 30 days after it.
  - `preview_opened(p_id)`.
  - `preview_said(p_id, p_text, p_reply)`:
    - Appends the message and the reply, under a row lock.
    - Raises `54000` at 20 messages.
    - Stamps `tried_at` once.
  - `preview_called(p_preview_tenant_id, p_seconds)` adds one call and its seconds, and stamps `tried_at` once.
  - `preview_not_right(p_id, p_fact, p_said)` raises `54000` at ten lines.
  - `preview_claim(p_token)`: granted to `authenticated`, with `auth.uid()` the claimer.
    - It refuses unless the preview is `ready`:
      - a claimed one: "{business} is already set up."
      - an ended or failed one: "This preview has ended."
    - It refuses when the claimer owns ten workspaces, as `create_workspace_for` does.
    - Then it sets the workspace `active`, seats the owner and marks the row claimed.
    - It converts the lead, ends its places and skips its sends.
    - It writes `preview.claimed` on both workspaces.
    - It answers `{tenant_id, slug}`.
  - `preview_end(p_id)` clears `turns` and `not_right`, sets `ended`, and deletes the workspace where it is still a
    preview.
  - Two triggers keep a preview from outliving its lead: a row deleted takes its workspace with it, and a lead blanked
    or erased ends its preview at once (its words cleared, its workspace erased), so the erasure registry names
    `turns` and `not_right` as scrubbed with the lead.
- **What else widens:**
  - `lead_convert_by` takes the how `claimed` (re-created from its newest form).
  - `jobs_kind_check` and the jobs lane take `preview_build`, in lane 1 beside `website_read`.
  - `trigger_previews_sweep()` and a pg_cron line every hour (`previews-sweep`) ask the edge's previews door, as
    `deadman-sweep` asks its own (00018). Its clock is a `sweep_status` row.
- **`packages/db`:** `repositories/campaigns/lead-previews.ts` is the one place the table and the doors are named (the
  repositories' root is at its 20 modules):
  - `leadPreviewOf`, `leadPreviewByToken`, `previewsTriedSince`, `previewsPastTheirEnd`
  - one function per door

### 2. Contracts

- **New, `previews/`:**
  - `lead-preview.ts`:
    - `PREVIEW_LIMITS`: 20 messages, 30 days, 10 lines
    - `PREVIEW_STATES`
    - `LeadPreviewDto`
    - `previewLineOf`: the lead sheet's line
    - `previewPageOf`: the page's state from the row and the clock
    - `PREVIEW_WORDS`: every word the page, the sheet and Today say
  - `lead-as-listing.ts`: `leadAsListing`.
  - `starters.ts`: `previewStartersOf`, three starter questions from the receptionist's own facts:
    - a day it is closed
    - "Can I come in tomorrow at 2?"
    - the price of a service it lists, else its hours
- **`reach-out/lead-hours.ts`:** `listingPeriodsOf(hours)`, the lead's hours as Google's periods, only where every day
  reads, else null.
- **`imports/found-adds.ts`:**
  - `withFoundServices`, `withFoundClosure`, `withFoundRule`, `withFoundNote`
  - `withFoundWorn(profile, found)`: all of them at once, services without their prices
- **`reach-out/reach-out-words.ts`:**
  - `their preview` at the end of `REACH_OUT_SLOTS`
  - the slot counted by `linkCount`
  - the first-step refusal
- **`reach-out/reach-out-rules.ts`:** `SlotWorkspace` gains nothing; `SlotLead` gains `preview`, its link while open, being made, or gone
  (`LeadPreviewSlot`, `previewSlotOf`).
- **`rehearsal/rehearsal.ts`:** `REHEARSAL_LIMITS.previewMs` (six minutes), the window `preview`, and
  `rehearsalAllowance({ preview })`.
- **`workspace/billing.ts`:** `hasPublicPages` refuses `preview`.
- **`workspace/platform.ts` and `console/console.ts`:** the verdict `preview`, left out of the customers and counted
  apart.
- **`workspace/signup.ts` and `signup-schema.ts`:**
  - `SignupSchema` takes an optional `preview` token
  - `PendingWorkspace` keeps it
  - `signupPostureFor(posture, previewLive)`: a live link opens sign-up whatever the posture
- **`today/`:**
  - `TodayInput.previewsTried`
  - the queue's row kind `tried`
  - `NEED_YOU_WORDS.tried`

### 3. The edge

- **`lib/previews/build.ts`** is the `preview_build` job (payload `{ preview_id }`):
  1. Read the row and the lead.
  2. Write the receptionist through `putTenantConfig` (the write schema, the version) with `leadAsListing` and the price
     rule.
  3. Read the website and wear what it found (`readWebsite`, `withFoundWorn`).
  4. Answer `preview_built`.

  The job is retried once, as the runner retries. A second failure is `failed`, said as `build_failed`. A lead with no
  name is `no_name`.
- **`lib/imports/website-read.ts`:** `readWebsite(db, tenantId, url, deadline)` is lifted out of `websiteReader.read`,
  so the job and the build read a site the same way.
- **`lib/previews/sweep.ts`** is the hourly sweep, behind `api/cron/previews.ts` (`sweepDoor`, its limit in
  `vercel.json`):
  1. Find each preview past its `ends_at` that is not claimed.
  2. Delete its agent and LLM at Retell. A 404 there is already gone.
  3. Call `preview_end`.
- **The switch:** `LEAD_PREVIEWS` is a getter in `lib/env.ts` with a line in `.env.example`. The new log names go in
  `LOG_EVENTS`: `preview_built`, `preview_build_failed`, `preview_ended`, `preview_end_failed`.
- **`packages/channels`, the Retell client:** `deleteAgent` and `deleteRetellLlm`. Their paths are checked against
  Retell's API reference at the build.
- **`lib/reach-out/request.ts`:** `reachOutWords` refuses:
  - `preview_building`: the words name the slot and the lead's preview is building or not made
  - `no_preview`: it failed or has ended

  Both come before the lead's own values.
- **`lib/reach-out/sender.ts`:**
  - `HOLDS` takes `preview_building`.
  - On that refusal the sender asks for the preview (`lib/previews/make.ts` `askPreview`, the one way one is made: its
    door, then its build scheduled once while it waits).
  - A send that went out naming the slot answers `preview_sent`.
- **`lib/voice/rehearsal-call.ts`:** `allowanceOf` reads the workspace's status and counts a preview's minutes in the
  preview window. `settleRehearsalEvent`'s end of a call answers `preview_called` for a preview workspace.

### 4. The dashboard

- **The page.**
  - **`app/preview/[token]/page.tsx`:** public, over `src/server/public/preview-page.ts`. The token is read through the
    service role. An unknown token is the not-found page, as `public-page-gate.ts` decides for every public page.
  - **`src/surfaces/preview/`:** the page, drawn from the kit:
    - the thread's bubbles (Inbox)
    - Try it's view model (`tryItVM`)
    - the rehearsal's call (`legacy-bridge/rehearse/call.ts`)
    - the first run's building lines
    - 0075's look over the product's paper
- **The routes.**
  - **The page's four public routes:** `app/api/v1/previews/[token]/{message,call,opened,not-right}/route.ts`. Each
    makes the same-origin check, takes a bucket per network (`preview_ip`, 40 an hour), and leaves the cap to its
    door. They are public, as `/api/v1/signup` is, so they don't go through `withRoute`. `/preview/` and
    `/api/v1/previews/` join the proxy's public prefixes, with the argument each prefix has.
  - **The routes' paperwork:** each route's row in `tooling/scripts/tests/route-policy.json`, then the typed client
    (`gen/route-types.mjs`) and `gen:api-reference`.
  - **The claim:** `app/api/v1/preview-claims/route.ts`, signed in, through `withRoute`. It calls `preview_claim` as the
    member, then does what the first workspace's creation does after its door (`notifyPlatformSignup`,
    `giveFirstAlertAddress`, the pending workspace cleared).
  - **The sender's routes:** `app/api/v1/leads/[id]/preview/route.ts`, POST to make one and GET for its line.
- **Sign-up:** `app/preview/[token]/mine` draws sign-up's screen (`src/auth/SignupScreen.tsx`) with the preview read
  on the server. It says "{business}'s receptionist is waiting for you", fills in the address, and claims after the
  code.
- **The lead sheet:** `surfaces/leads/sheet/panes.tsx` draws the line and its three presses.
- **Today:** `server/readers/today.ts` gains the `previewsTried` read, additive, null where it fails. The queue draws
  the row.
- **The step editor and Ask:**
  - `surfaces/campaigns/sequences/new/new-message-sheets.tsx` offers the slot from step two.
  - `server/sequences/draft.ts`'s rules gain one line, for a workspace that makes previews.

## Either deploy order

The migration goes to production before the merge. It only widens two checks (`tenants_status_check`,
`jobs_kind_check`), re-creates two functions with the same signatures, and adds a table and doors nothing calls yet.

The edge ships with `LEAD_PREVIEWS` off, so no preview is built until it is set. A step can name the slot only after the
dashboard ships, and the edge refuses a slot it does not know (`unknown_slot`), which holds the send, so neither order
sends a brace.

## What this costs

Previews are platform-spent, as the website read is. Ruben's yes is in the brief.

- **A preview's build:** one website read on the smallest model, about a cent.
- **Its use at most:** 20 chat replies on the receptionist's route (about $0.40) and six minutes at Retell (about
  $0.70), so about $1.10.
- **Expected:** most are never opened, so about $15 to $45 a month at ten step-two emails a day. Retell's rate per
  minute was not read from here.

## What proves it

- **Contracts:**
  - `tooling/scripts/tests/previews/lead-as-listing.test.mjs`:
    - a lead with whole hours, one with a day that doesn't read, and one open 24 hours
    - the zone by region
    - `firstReceptionistOf` over the adapter with the price rule on
  - `tooling/scripts/tests/previews/lead-preview.test.mjs`: every state of the line and the page, the starters, and the
    limits.
  - `tooling/scripts/tests/imports/business-reads.test.mjs`: `withFoundWorn` drops prices, and `found-adds` makes what
    Found for you made.
  - `tooling/scripts/tests/reach-out/reach-out-words.test.mjs`: the slot refused in step one, counted as a link, and
    filled from `preview_url`.
- **The database:** `tooling/scripts/tests/previews/previews.db.test.mjs`:
  - make, idempotent; refused for a workspace not `ours`
  - built, sent and its clock
  - said up to 20, then `54000`
  - claim by one, the second refused, two at once one claim, the owner seated, the lead converted, its places gone and
    its sends skipped
  - end deleting the workspace and keeping the counts
  - a member of another workspace reads nothing
  - `create_workspace_for` unchanged by its slug's move
- **The edge:**
  - `tooling/scripts/tests/previews/preview-build.test.mjs` (fakes): the build's steps in order, the site read and worn,
    no prices, a site that can't be read still `ready`, no name `failed`, and the switch off making nothing.
  - `tooling/scripts/tests/previews/previews-sweep.test.mjs`: the agent deleted before the end, and a 404 taken as gone.
  - `tooling/scripts/tests/reach-out/reach-out-request.test.mjs` and `reach-out-sender.db.test.mjs`: `preview_building`
    held and made, `no_preview` skipped, `preview_sent` once.
  - `tooling/scripts/tests/voice/the-receptionist-is-made-before-any-number.test.mjs`: a preview's six minutes.
- **The dashboard:**
  - `tooling/scripts/tests/previews/preview-page.test.mjs` (stub React): every page state, the chat's turns from the
    row, the limit, the mic refused.
  - `tooling/scripts/tests/previews/preview-routes.test.mjs`: the buckets, the history from the row, `user: null`, and
    an unknown token's 404.
  - `tooling/scripts/tests/auth/signup.test.mjs` and `signup-posture.test.mjs`: a preview token opening sign-up under
    `invite` and `waitlist`.
  - `tooling/scripts/tests/public/a-paused-workspace-asks-nobody-for-a-yes.test.mjs`: `hasPublicPages` for `preview`.
  - `tooling/scripts/tests/console/console-contracts.test.mjs`: the verdict.
  - Today's queue tests: the row.
- **The real app:** a preview made on the local stack for a made-up lead, opened in the browser pane, texted, called,
  claimed through sign-up, and its first run read.

## Considered and not taken

- **A draft beside the lead, not a workspace.** The eval door, the rehearsal, the website read, the look and the first
  run all key on a workspace. A draft would copy each of them.
- **The partner hand-over (0016) as the claim.** It needs an owner's address at creation and sends an invitation then
  (`handover_sent_at` is NOT NULL). It seats the maker as partner and lets only ten wait per partner. Previews would hit
  that cap in a day and send invitations nobody asked for.
- **Live web chat on `/b/<slug>`.** It is its own lane. A preview needs nothing sent and nothing kept as a
  conversation, which Try it's door already is.
- **Building previews at batch planning, or for a whole list.** Planning has no step two's words in hand. Building for
  a list spends on leads no email will carry.
- **Two calls of three minutes.** The rehearsal counts minutes. Six minutes in one window is the same limit through the
  existing door.
- **"Not right" as a fact suggestion (0063) on the claimed workspace.** `fact_suggestions` needs a message it came from
  and a source of `steer` or `reply`. The claimed owner checks every fact in Check anyway.

## Later

- Partners making previews, credited at claim.
- A reply drafted ahead on the Need you row.
- Reply drafts offering the link when someone writes back curious.
- Prices offered at claim from the site's read.
- WhatsApp or a real number on a preview.
