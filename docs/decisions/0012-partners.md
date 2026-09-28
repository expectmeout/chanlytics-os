# 0012 · A partner brings a workspace, sets it up, and earns a share

**Status:** decided; P1 (the role), P2 (attribution) and P3 (the ledger) merged (#1151); P4 (the partner's table)
merged (#1156); P5 (standing and payouts, 00205), the pause the Risks promise (00206), and what a review of
00201–00206 found (00207) merged (#1159). The first later step, email to a partner, is 0014 (00209). A closed partner may delete their account (00210, over 00208's door). Written against commit `b6f2216` (PR #1124, 26 September 2026); every file and line below was read
at that commit, before P1, so the Context describes the code P1 to P3 changed: `memberships.role` admits `partner`,
`has_permission()` and `ROLE_PERMS` carry its row, the setting-class routes declare `role: "partner"`, `requireRole`
refuses a role it does not know (00201, `with-route.ts`); `partners` and `partner_tenants` exist, `create_workspace`
takes the code the link's cookie left, `GET /workspaces` carries each role and the partner, and Settings › Partner is
the offer or the link (00202, `app/p/[code]`, `partner-real.jsx`); `partner_earnings` is written by the Stripe webhook
through `partner_earn` and `partner_reverse`, the daily clock `partners` runs `partner_earnings_sweep`, and the pane
says held, payable and paid from `partner_balance` (00203, `lib/partner-earnings.ts`, since moved to `lib/partners/earnings.ts`, `api/cron/partners.ts`).

What moved from the Shape below as written, each for a reason found in the code:

- **The link is `/p/<code>` alone**, a route that leaves the cookie and goes on to sign-up; nothing rides in the
  sign-up body, so one mechanism attributes whether the account arrives by email or by Google.
- **The card's fingerprint is not a column on `billing_accounts`.** Every member reads that row
  (`billing_accounts_member_select`, 00073); the fingerprint lives in `billing_card_marks`, which only the service role
  reads, written where every subscription is applied (`applySubscription`).
- **A reversal finds its invoice through the payment intent.** The pinned Stripe API has no `charge.invoice` and no
  `invoice.charge`; the webhook asks `invoicePayments.list` for the invoice a payment intent paid, and only for a
  workspace a partner brought. Every ledger row carries the Stripe event that wrote it, unique, so a replay writes
  nothing; a refund is written as the difference its running total makes; a dispute won gives back what its dispute
  took; all reversals together are capped at the share.
- **A held earning of a disqualified workspace is `void`**, not `reversed`: a reversal is a row of its own.
- **The partner's table is a section of Settings › Partner, not a table of its own**: the back office's row
  (`AttnRow`) for each workspace, judged by `platformRows`, over `platform_overview_rows_for(tenant ids)`, which 00204
  made the one join behind both (the back office asks for every workspace, `partner_overview` for the caller's). A
  workspace whose owner took the partner off its team keeps its money line (`partner_workspace_money`) and shows
  nothing else of the business: the share is for bringing it, the view is for working in it.
- **Standing is judged a week after the first share, or as soon as the card is known**, so a share paid before the
  subscription's card was marked is not judged on nothing.
- **The back office's two verbs name their subject in the body**, as the line actions do: `POST platform/partners/
standing` (`tenant_id`, `standing`, `why`) and `POST platform/partners/payout` (`partner_id`, `currency`,
  `reference`). A person's decision takes effect when it is made: disqualified voids what the workspace held, and
  qualified makes what is past its hold payable, rather than waiting for the night's sweep. A void share stays void.
- **A payout is one currency's payable earnings, netted, and there is no `planned` state**: it is recorded after the
  money left, so it is `sent` or it does not exist. A net that is not above zero records nothing. Each workspace it
  came from gets a `partner.paid` event with its own part and no reference, since a workspace's members read its
  events. The partners and who brought each workspace ride on `GET platform/overview`, as the waiting list does.
- **Pausing a partner is a verb, built with P5** (00206 `partner_status_set`, `POST platform/partners/status`): the
  Risks and the terms promised it and nothing set `partners.status`. A pause or a close makes each partner seat a
  viewer's and releases what the partner held in those conversations, as a departure does (00132); the workspace keeps
  `seat_held_at`, and a restore gives back only those seats, where the owner has not removed the partner since.
- **A partner joins a team only with the owner's yes.** The link's cookie credits nobody by itself: the create screen
  names the partner and asks (the first workspace is not made on arrival when a link brought the person), the route
  passes the code only when the body agrees with the cookie, and the cookie is cleared once a workspace is made.
- **What a review found, fixed in 00207.**
  - A partner may erase their account: `partners.user_id` is set null and the row closes itself, instead of erasure
    failing on the ledger's keys.
  - A refund that arrives before its share waits (`partner_reversals_waiting`) and is taken when the share is written.
  - A partner who has become the owner earns nothing.
  - A deleted workspace's shares mature for an active partner and write no event.
  - Disqualifying voids payable shares too, never a reversal; a payout settles only a qualified workspace's shares
    and every reversal, locks exactly the rows it totals, and refuses a total that is not the one the card showed.
  - A close takes the partner off every team.
  - A restore gives back only seats made before the pause.
  - Who, when and why of a partner's status is kept on the row.
  - The standing event no longer carries which check tripped: every member reads events.
- **The same-card check needs every card marked.** `billing_card_marks` is written as a subscription is applied, so a
  subscription from before 00203 has none until it changes. `tooling/scripts/partner-card-marks-backfill.mjs`
  (dry-run by default, a backup first, `--apply`) marks them through the webhook's own door, and `--rejudge` puts the
  sweep's own qualified decisions back to be judged with the marks in place. Run it once 00203 is applied.

## Context

### The idea, in the product's words

A **partner** is a person with a Chanlytics account who brings a business to Chanlytics, sets its workspace up for
it, and earns a share of what that workspace pays for as long as it pays. The business signs up through the
partner's link, pays for its own plan on its own card, and owns its workspace. The partner does the setting up the
owner would otherwise do: the business facts, the receptionist, the number, the channels, the calendar, the lead
finder. This is how the agency products in the same market are sold (an agency account over sub-accounts, a cut of
each), with one difference that matters here: the business is the customer and holds the money, the partner is a
member of its team.

### One login already spans workspaces, and the switcher already draws them

A person's workspaces are their `memberships` rows; `GET /workspaces` returns them all
(`apps/dashboard/app/api/v1/workspaces/route.ts:18-45`), and `WorkspaceMenu`
(`apps/dashboard/src/legacy/components/sidebar.jsx:212-246`) lists them with ⌘1–9 to switch. The "another
workspace" screen already names the case (`apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx:11`: "an agency
setting workspaces up for its clients"). The workspace-scoped door, `memberContext`
(`apps/dashboard/src/server/with-route.ts:194-221`), resolves a request to one of the caller's own memberships and
404s on any other, so a member of several workspaces is an ordinary session. Nothing here needs building.

### But a member who is not the owner cannot set a workspace up

Every write that setting up consists of is owner-only, in the route and in the database. From
`tooling/scripts/tests/route-policy.json`: `PUT settings` (:978) and `POST settings/receptionist` (:985), `POST
channels/whatsapp/connect` (:229), every `google/*` write but refresh and reviews (:474-509, :544), `POST mailboxes`
(:754), every `lines/*` write (:705-740), every `sending-domains/*` write (:1118-1139), `POST lead-searches` (:614)
and the keep/exclude/put-back verbs (:642-656), `PUT business-record` (:145), `POST capabilities/[kind]` (:208),
`PATCH workspaces` (:1111). The database says the same: `tenant_config_owner_update`
(`supabase/migrations/00012_control_plane.sql:107-111`), `is_workspace_owner` for the timezone and the mailbox
(`00084_workspace_timezone.sql:20`, `00129_an_owner_makes_the_mailbox.sql:50-51`), and `has_permission()`
(`00140_the_lead_finder_engine.sql:498-519`), which restates `ROLE_PERMS`
(`packages/contracts/src/config.ts:22-75`): an operator has `approve` and `autonomy` and nothing else.

The first run is the same. `shouldLandOnFirstRun` admits owners only (`packages/contracts/src/first-run.ts:594-601`);
Find is gated on `canDo("team")` as a stand-in for "owner" (`apps/dashboard/src/legacy/pages/first-run.jsx:1117`);
the phone step's buy and forward presses are gated on `team`, plan and start-now on `billing`
(`first-run.jsx:601-607`); Finish switches calls on through an owner route (`first-run-live.ts:79-80`).

So the role the product lacks is exactly the partner's: **someone who sets a workspace up and runs its receptionist
without holding its money or its team.** The rank ladder `viewer < operator < owner` (`with-route.ts:222-240`) has
no rung for it, and an operator membership would leave the partner unable to do the job they are paid for.

### Nothing records where a workspace came from

Sign-up keeps `{name, timezone, code?}` on the auth user as `user_metadata.pending_workspace`
(`apps/dashboard/src/server/signup.ts:101-109`) and reads no query string at all (`apps/dashboard/app/signup/page.tsx`).
`create_workspace` (`00072_signup.sql:109-125`, delegating to `create_workspace_for`, :12-99) writes the tenant and
one owner membership. The only provenance is the `workspace.created` event with `by = auth.uid()`
(`00104_a_workspace_is_recorded_where_it_is_made.sql:17-38`). `tenants` has no source column; the waitlist keeps the
Referer and nothing else (`00088_waitlist.sql:16-28`). There is no `ref`, `utm` or referral anywhere in the
dashboard or the migrations.

### Billing is per workspace, and a paid invoice leaves no amount behind

One `billing_accounts` row per workspace, one Stripe customer each (`00073_billing.sql:12-33`); `tenantOf` maps a
Stripe object back to its workspace by metadata then customer (`apps/edge/lib/billing.ts:169-187`). The webhook
keeps every delivery once by event id (`keepEvent`, `billing.ts:517-522`; `billing_events`, `00073:45-50`) and
handles subscription events, Checkout, the trial's end, `invoice.paid`, `invoice.payment_failed` and
`customer.deleted` (`apps/edge/api/stripe-webhook.ts:63-165`). `invoice.paid` writes `last_paid_at = now()` and
nothing else (`notePayment`, `billing.ts:555-559`): not the amount, the invoice id, the period or the currency.
`charge.refunded` and `charge.dispute.created` fall to `default` and are only recorded
(`billing-webhook.test.mjs:292-294` pins it). The card's brand and last four are read from the expanded payment
method (`billing.ts:154-163`); its fingerprint, which Stripe sends beside them, is not kept.

### A cross-workspace table already exists, with its check as its first statement

`platform_overview()` (`00092_validate_the_back_office_query_at_deploy.sql:126-173`, rows from
`platform_overview_rows()`, `00094:27-129`) returns one row per workspace with its billing status, its line's state
and its last inbound, and raises `42501` unless `is_platform_admin()` before it reads anything. The route is
`GET platform/overview` under the `platform` scope (`apps/dashboard/src/server/route.ts:156-157`); the page is
`PanePlatform` (`apps/dashboard/src/legacy/pages/platform.jsx:437`), a tab in Settings' rail that exists only when
`GET /workspaces` says `platform_admin` (`settings.jsx:125-131`); the surface is `admin/platform: real`
(`surface-registry.ts:80`). A partner's view of the workspaces they brought is this table with a different first
statement.

### The finder is the partner's prospecting tool, and it is already built

A workspace can search for businesses of a kind in a place, judge and verify them, and reach them by cold email
from its own domains with the deliverability holds of 00175 and 00188. That is the whole of "find local businesses
to sell to". A partner's own workspace, on a paid plan, is their sales desk; nothing here is partner-specific.

## Decision

1. **A fourth membership role, `partner`.** Between operator and owner on the ladder. May do what setting up and
   running the receptionist takes (`approve`, `autonomy`, `settings`, `disconnect`, `find`) and may not touch
   money, the team or the customer list as a file (`billing`, `team`, `export`). The words on the Team pane: _"Sets
   up and runs the receptionist for you — not billing or team."_ The owner may remove the partner from Team at any
   time; a partner may never be the last person standing, because a partner is never an owner.
2. **Attribution is fixed when the workspace is made, and only then.** A partner has a code; the link is
   `app.chanlytics.com/signup?partner=<code>` (the marketing site's `/p/<code>` redirects to it). The code is kept
   for thirty days in a first-touch cookie and on the pending workspace; `create_workspace` takes it, and in the
   same transaction as the tenant writes the attribution row and the partner's membership. A workspace that exists
   is never attributed later; a partner who is the caller is never attributed to their own workspace.
   _Since 0020: a workspace that exists may ask a partner to join it, and is credited to them only if it had never
   paid for a plan._
3. **The share is 25% of what Stripe collected on the workspace's plan invoices, for as long as it pays.** Computed
   on `amount_paid` of an invoice with a subscription, after discounts and credits, before Stripe's fees. One-time
   payments (lead packs, 0010) and pass-through costs earn nothing in this version. The rate is a column on the
   partner, read at the time of each invoice, never a constant in code.
4. **A share is held thirty days, then payable, and reversed by a refund or a dispute.** `invoice.paid` writes the
   earning as `held` with `payable_at = paid_at + 30 days`; a daily sweep moves held earnings past that date to
   `payable` when the workspace's standing is `qualified`; `charge.refunded` and `charge.dispute.created` reverse
   the earning for that invoice, and a reversal after payout is a negative earning netted from the next one.
5. **Self-referral is refused by structure and then reviewed by signal, never chased.** Refused: the partner's own
   account as the caller of `create_workspace`; a partner who is the workspace's owner. Reviewed (standing
   `review`, held until a platform admin decides): the same card fingerprint as a workspace the partner owns; the
   same Google listing or site as an older workspace. Anything else is `qualified`. A disqualified workspace earns
   nothing from then on; earnings already paid are not clawed back over a review.
6. **The partner's pages are the ones that exist.** The switcher lists their workspaces with the role beside each;
   the first run and Setup are the checklist they work through, with billing rows reading _waiting for the owner_;
   the back office's table, scoped to the partner's workspaces and with earnings columns, is their portfolio, as a
   Settings tab that exists only for a partner; the Team pane shows the partner to the owner. One new pane, no new
   page.
7. **Payouts are monthly and by hand in this version**, from a payable balance a platform admin can see and mark
   paid with a reference. Stripe Connect (identity, tax forms, transfers) replaces the hand when partners are more
   than a handful.
8. **The economics never reward an account for paying itself.** A partner's own workspaces are never attributed, a
   partner needs a paid plan of their own to use the finder (`maySpend`, `packages/contracts/src/billing.ts:145-161`,
   unchanged), and the share is on collected money after the hold, so the worst case of a partner routing their own
   business through a second account is a 25% discount thirty days late, on a workspace a platform admin can see.

Not decided here: a partner setting a price of their own and billing the business (reselling), a partner's brand on
the business's pages and mail (white label), a partner making a workspace and handing it to an owner (invite as
owner), presets per trade, and a directory of partners a business can pick from. Each is a later note; the shape
below leaves room for all of them and needs none.

## Shape

### Storage

- `memberships.role` gains `'partner'` in `memberships_role_check` (00012:14-17). `has_permission()` (00140:498-519)
  admits `partner` for `approve`, `autonomy`, `settings`, `disconnect` and `find`. The row policies that say
  `role = 'owner'` for a setting-class write are re-pointed at `has_permission(auth.uid(), tenant_id, 'settings')`:
  `tenant_config_owner_update` (00012:107-111), `is_workspace_owner`'s two callers (timezone, 00084; mailbox,
  00129). `is_workspace_owner` itself stays what it is for billing and team. One predicate per rule: `has_permission`
  is the one place a role becomes a permission in SQL, `ROLE_PERMS` the same table in TypeScript, and
  `lead-engine.db.test.mjs` already holds the two together.
- `partners` — `id`, `user_id` (unique: one partner per account), `code` (unique, lowercase, 3–24 chars, chosen
  once), `status` (`active` · `paused` · `closed`), `share_bp int not null default 2500`, `terms_accepted_at`,
  `payout_facts jsonb` (how they are paid, by hand for now), `created_at`, `updated_at`. RLS: the row's own user
  reads it; writes through functions.
- `partner_tenants` — `tenant_id` (primary key: one partner per workspace, for ever), `partner_id`, `code_used`,
  `attributed_at`, `standing` (`qualified` · `review` · `disqualified`), `standing_why text`, `standing_by uuid`,
  `standing_at`, `checks jsonb` (what the sweep found). RLS: the partner reads their rows; the workspace's owner
  reads the row for their workspace (the Team pane says who the partner is); writes through functions and the
  service role.
- `partner_earnings` — `id`, `partner_id`, `tenant_id`, `stripe_invoice_id` (unique with a sign: one earning and at
  most one reversal per invoice), `kind` (`share` · `reversal`), `amount_paid_cents`, `currency`, `share_bp`,
  `earned_cents` (negative for a reversal), `paid_at` (the invoice's own `status_transitions.paid_at`),
  `payable_at`, `state` (`held` · `payable` · `paid` · `reversed`), `payout_id`, `created_at`. RLS: the partner reads
  their rows.
- `partner_payouts` — `id`, `partner_id`, `period_start`, `period_end`, `total_cents`, `currency`, `state`
  (`planned` · `sent`), `reference`, `sent_at`, `sent_by`. Written by a platform admin.
- `billing_accounts.card_fingerprint text` beside `card_brand` and `card_last4`, from the same expanded payment
  method (`subscriptionFacts`, `billing.ts:151-166`).
- `create_workspace(p_name, p_timezone, p_partner_code default null)`: after the owner membership, if the code names
  an `active` partner whose `user_id <> auth.uid()`, insert `partner_tenants` and a `memberships` row
  `(tenant, partner.user_id, 'partner')`. An unknown, paused or self code attributes nothing and is written into
  the `workspace.created` event's data as `partner_code_ignored`. One transaction, as 00021 argued.
- Functions, all `security definer` with the check first, as `platform_overview()` does: `partner_become(p_code)`
  (the caller becomes a partner: one per account, the code's shape checked, terms recorded);
  `partner_overview()` (one row per `partner_tenants` row of the caller: `platform_overview_rows`' columns for
  those workspaces, plus `standing`, `earned_month_cents`, `payable_cents`, `paid_cents`);
  `partner_standing_set(p_tenant, p_standing, p_why)` (platform admin only; records `platform.acted`);
  `partner_payout_mark(p_partner, p_reference)` (platform admin only: every `payable` earning of the partner into
  one `sent` payout).
- `EVENT_KINDS` (`packages/contracts/src/enums.ts:121-236`) gains `partner.attributed`, `partner.earned`,
  `partner.reversed`, `partner.standing_changed`, `partner.paid`, on the workspace the earning is about. No
  notification kind: the bell is per workspace and a partner's news is per partner; email to the partner is a
  later step.

### Contracts

- `Role` gains `partner`; `ROLE_PERMS.partner` is the row above; `ROLE_WORDS.partner = "Partner"`
  (`identity.ts:31-35`); `ROLE_RANK` in `with-route.ts:222` becomes `viewer 0 · operator 1 · partner 2 · owner 3`,
  and **an unknown role refuses**: today `ROLE_RANK[unknown] < n` is `undefined < n`, which is false, so a row with
  a role the code does not know would pass every door. That is fixed in the same change, before any row can carry
  the new role.
- `shouldLandOnFirstRun` admits `owner` and `partner`; the first run's `who.owner` reads `canDo("settings")`, not
  `canDo("team")`; the phone step's buy and forward gate on `disconnect` (the channel permission), plan and start-now
  stay on `billing`, and a partner on the phone step sees the billing row as _waiting for the owner_ (Setup's
  `waiting_them`, `setup.ts:259-261`) with the owner's name.
- A `PartnerDto` view model (`packages/contracts/src/partner.ts`, pure, as `platform.ts:29-56` is for the back
  office): the code and link, the standing words, the earnings in words ("$100 held until Oct 26", "$300 payable",
  "$1,200 paid to date"), and the portfolio rows. Every sentence the pane says comes from here.
- `GET /workspaces` returns the caller's role per workspace (today only the active one's, `workspaces/route.ts:168-175`)
  and `user.partner: { code } | null`, the way it returns `platform_admin`.

### Doors

- Routes, each a row in `route-policy.json`: `POST partner` (account scope: become one), `GET partner` (account:
  the DTO), `GET partner/workspaces` (account: `partner_overview()`), `POST platform/partners/[tenant]/standing`
  and `POST platform/partners/[id]/payout` (platform scope). The rows a partner may now call flip from `owner` to
  `partner` in `route-policy.json`, each one a deliberate line in the diff: settings, receptionist, business record,
  capabilities, WhatsApp connect, the Google writes, mailboxes, lines, sending domains, the lead verbs, the
  workspace's timezone. Billing, team, the two exports and contacts delete stay `owner`.
- `POST workspaces/create` (`workspaces/create/route.ts:65-97`) reads the partner code from the cookie or the
  pending workspace and passes `p_partner_code`. The sign-up page reads `?partner=` and sets the cookie on load,
  first touch wins, thirty days, host-only; the code also rides in the sign-up body into `pending_workspace` so a
  device that drops cookies still attributes. Google sign-in needs nothing: the cookie is on the same host.
- The Stripe webhook: `invoice.paid` reads back the invoice, and when the workspace has a `partner_tenants` row and
  the invoice has a subscription, inserts the `share` earning (the invoice id makes a replay a no-op);
  `charge.refunded` and `charge.dispute.created` find the earning by `charge.invoice` and insert the `reversal`.
  Both keep their events as every branch does. `subscriptionFacts` carries the fingerprint.
- A cron door `apps/edge/api/cron/partner-earnings.ts`, daily, registered in `sweep_status`, shaped like
  `deadman.ts`: for each `partner_tenants` row with no standing yet, run the checks and set `qualified` or
  `review`; for each `held` earning past `payable_at` on a `qualified` workspace, set `payable`. It logs one line
  per change with the event names alerting will grep for: `partner_standing_set`, `partner_earning_payable`.

### Pages

- **Settings › Partner**, one pane, `admin/partner: real` in `surface-registry.ts`, in the rail only when
  `user.partner` is set or the account may become one. For a non-partner: the offer, the terms, one press
  ("Become a partner"), the code to choose. For a partner: the link to copy, the earnings in words, the portfolio
  table drawn by the back office's component over `GET partner/workspaces` (the same columns: paying, line
  answering, last inbound; plus standing and this month's earning). Nothing on it states a number the ledger does
  not hold.
- **Team** shows a `partner` member with the role's words and the owner's Remove; the owner's own Setup row
  "Team and alerts" mentions the partner by name.
- **The switcher** shows the role beside every workspace, so a partner's list reads "Ada's Bakery · Partner".
- **Back office** gains a Partners column and the two actions (standing, payout), the first actions across
  workspaces the back office has; 00091 reserved that for "ones that already exist as a workspace's own verb", and
  these are the platform's own verbs, so the check stays where it is: in the function.

### The words

The glossary gains one row: **Partner** — a member who brought the workspace and sets it up, with a share of what
it pays; `partners`, `partner_tenants`, `partner_earnings`. Storage says tenant, the API says workspace:
`partner_tenants` is the table and `GET partner/workspaces` the route. "Client" stays a stage word; the workspaces
a partner brought are "your workspaces as partner" on screen, never "your clients".

## Steps

Each shippable on its own, in either deploy order. The one ordering that matters is inside P1: the dashboard must
know the role before any row carries it, and P1's migration creates none.

1. **P1 — the role.** Contracts (`Role`, `ROLE_PERMS`, `ROLE_WORDS`), `ROLE_RANK` with the unknown-role refusal,
   the first-run gates, the Team pane's words; a migration widening `memberships_role_check` and `has_permission()`
   and re-pointing the three setting-class policies; the `route-policy.json` rows flipped to `partner`. No row has
   the role yet; the tests prove the ladder and the SQL agree. Deploy: either order, since nothing writes the role.
2. **P2 — attribution.** `partners`, `partner_tenants`, `create_workspace`'s third argument, `partner_become()`; the
   cookie and the query on sign-up; `POST workspaces/create` passing the code; `POST partner` and `GET partner`; the
   Partner pane's offer and link; `GET /workspaces` with per-workspace roles and `user.partner`; the switcher's role
   chip; Team showing the partner. Deploy: the migration first is safest but not required, since the route passes
   the argument only when the RPC has it (a `42883` falls back to the two-argument call and logs
   `partner_code_dropped`).
3. **P3 — the ledger.** `partner_earnings`, `card_fingerprint`, the webhook's three branches, the sweep and its
   `sweep_status` row, the earnings words on the pane. Either order: the webhook inserts only when the table exists
   and logs `partner_earning_skipped` otherwise; a replay after the migration writes it, since the event id is kept
   per delivery and Stripe retries a 500.
4. **P4 — the portfolio.** `partner_overview()`, `GET partner/workspaces`, the table on the pane over the back
   office's component; `admin/partner` becomes `real` here, not before, so `no-fabricated-data.spec.ts` sees a pane
   with numbers behind it.
5. **P5 — standing and payouts.** `partner_standing_set`, `partner_payouts`, `partner_payout_mark`, the back
   office's column and two actions, the review words on the partner's pane ("Under review · we'll write to you").
   Built as 00205 with `platform_partner_balances` and `platform_partner_workspaces` for the back office's card;
   either order, since the overview reads no partners on a database without it.
6. **Later, each its own note:** email to a partner (earned, payable, paid, under review: 0014, built); Stripe Connect Express
   for identity, tax forms and transfers; a partner making the workspace and inviting the owner (needs "invite as
   owner" and a hand-over); presets per trade on top of `firstReceptionistOf`; a directory of partners a business
   can pick from; white label; reselling.

## Tests

- **The ladder and the SQL agree.** `lead-engine.db.test.mjs` extended: for each role × permission, `ROLE_PERMS`
  equals `has_permission()`; a `partner` row passes `PUT settings` and `POST lead-searches` and is refused by
  `POST billing/checkout`, `POST team/invite`, `GET contacts/export`; an unknown role is refused by every door
  (`requireRole` throws, not passes). `route-policy.json`'s diff is the declaration and is pinned as today.
- **Attribution, against the replayed stack.** `create_workspace` with a good code writes the tenant, the owner, the
  partner membership and the `partner_tenants` row in one transaction; with the partner's own session it writes the
  tenant and no attribution and the event says `partner_code_ignored`; with a paused or unknown code the same; a
  second attribution of the same tenant is a primary-key refusal. The cookie: first touch wins, a second code does
  not overwrite, the body's code is used when the cookie is absent.
- **The webhook, over `billing-webhook.test.mjs`'s fixtures.** `invoice.paid` with a subscription on an attributed
  workspace writes one `share` earning at `share_bp`; the same delivery again writes nothing; an invoice without a
  subscription writes nothing; `charge.refunded` writes one `reversal` and a second one nothing; an unattributed
  workspace writes nothing.
- **The sweep, over `_fake-db.mjs`.** A held earning past `payable_at` on a `qualified` workspace becomes payable;
  on `review` it stays; on `disqualified` it is reversed; a fingerprint shared with a workspace the partner owns
  sets `review` with `checks.same_card = true`; the sweep's `sweep_status` row is touched on every run.
- **The pane.** `no-fabricated-data.spec.ts` covers `admin/partner` once it is real; a partner with no earnings sees
  zeros, never a placeholder; a non-partner sees the offer and no numbers.
- **The words.** `trade-neutral.test.mjs` and `no-customer-in-the-code.test.mjs` as today; fixtures use made-up
  businesses and example.com.

## Risks

- **A partner is a person with settings on many businesses' receptionists.** The blast radius of a bad or hacked
  partner account is every workspace they brought. Every write they make is a decision or event under their own
  user id, the owner can remove them in one press, and the platform can pause a partner (`status = 'paused'`
  demotes their partner memberships to `viewer` and keeps a record to restore). MFA on partner accounts is worth
  its own note before the programme is marketed.
- **The spend routes.** `lines/buy` and `lead-searches` spend the workspace's money and allowance, and a partner
  may call them. That is the job (the number is the setup), and `maySpend` already refuses until the workspace is
  paying, so a partner spends nothing before the owner has paid. Say so on the pane.
- **Deliverability.** Partners prospecting by cold email from their own workspaces are workspaces like any other
  under 00175 and 00188; a partner whose domain is held twice in thirty days waits for the platform, as anyone
  does. Nothing partner-specific, and nothing that should be loosened for them.
- **Marketing the programme.** "Start an AI business, earn $X a month" is the kind of claim the FTC's Business
  Opportunity Rule and its rules on earnings claims reach. The pane and the site describe the share and show a
  partner their own numbers; they promise no income. A lawyer reads the partner terms and the pitch before ads run.
- **Tax and identity.** Paying people by hand means collecting a W-9 above the reporting threshold and knowing who
  they are. Fine for a handful; Stripe Connect Express is the answer at scale and is the first of the later steps.
- **A refund after payout** is money already sent. The negative earning nets it from the next payout; a partner
  with no next payout is a small loss written off, which is why the hold is thirty days and not zero.
- **The share continues after the owner removes the partner.** The share is for bringing the workspace; the
  setting up is the partner's own offer to the business. An owner who removes a partner still pays Chanlytics the
  same, and Chanlytics still pays the partner. If that turns out wrong in practice, `partner_tenants.standing` is
  the one place to end it.

## Open questions (Ruben's)

1. Does the share pay on lead packs and other one-time payments, or on plan invoices only (decided: plan only,
   for now)?
2. Does a partner's own workspace need a paid plan to hold the partner role, or is the code enough? (The finder
   needs the plan anyway.)
3. Does any account become a partner on one press, or does a platform admin approve each one first? The shape
   allows both; `partners.status` starts `active` or `paused` accordingly.
4. When the marketing site's `/p/<code>` pages exist, do they carry the partner's name and a word from them, or
   only redirect?
