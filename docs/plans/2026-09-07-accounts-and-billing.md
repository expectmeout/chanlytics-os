# Accounts and billing: the door a stranger can walk through

Status: step one (accounts) shipping 2026-09-07; step two (billing) built behind an env door and proven with Stripe test keys before live keys. Scope decided with Ruben on 2026-09-07: accounts and billing only — no legal pages, no phone alerts, no booking write-back, no lines or SMS, no dashboard translation. The UI is English; owners write their own material in any language.

## 1. The summary

Today an account is made by hand and a workspace runs on a direct arrangement. After this plan, a person types a business name and a work email, gets a code, and lands on Setup as the owner of a new workspace; the Setup page's first row says how to start the trial; Stripe holds the card and the subscription; a workspace that stops paying has its receptionist paused, not deleted, and the owner sees why and how to resume. Existing workspaces keep their direct arrangement and see none of it.

## 2. What the owner experiences

1. `/signup`: business name, work email, and an invite code when sign-up is by invitation. The time zone is read from the device and shown, never asked.
2. A 6-digit code arrives (the same code sign-in uses). Entering it opens the new workspace on Setup, as its owner.
3. Setup's first row, **Billing**: "Start your 14-day trial — no charge until <date>". The button goes to Stripe Checkout (card required, trial applied), and comes back to Settings › Billing with the outcome in a word.
4. Settings › Billing: the plan and its price as Stripe states it, the status (trial with days left · active with the next invoice · past due · paused), the card on file, **Manage billing** (Stripe's portal: card, invoices, cancel) and, when paused, **Resume**.
5. A card that fails: Stripe retries; the owner gets a bell and an email; after Stripe's retries the subscription pauses and so does the receptionist — messages still land in the Inbox, nothing is answered, a banner says so, and Resume brings it back.

## 3. Decisions (defaults chosen; say the word to change any)

| Decision | Default |
|---|---|
| Plans | One plan, monthly, one Stripe price (`STRIPE_PRICE_ID`). Tiers can come later as a `plan` on the same row. |
| Trial | 14 days, card required at Checkout (`trial_period_days`), cancel anytime in the portal. |
| Who is exempt | Every workspace on record at migration time is `mode = direct` and never gates. New sign-ups are `mode = stripe`. |
| What a pause means | WhatsApp: messages are stored and held for a person, none answered. Phone: the line is switched off through the same switch the owner has. Campaigns: no sends. The dashboard and Ask keep working. |
| Sign-up gate at launch | `SIGNUP_CODE` set on the dashboard → an invite code is required; unset → open. The Supabase project stays invite-only at the auth level either way (the route creates users with the service role). |
| Existing email signs up again | Gets a code and signs in to what they have; no second workspace is minted from the sign-up form (the sidebar's "New workspace" does that). The answer is the same sentence either way, so the form is not an oracle for who has an account. |

## 4. Step one: accounts

**Data (migration 00072).** The body of `create_workspace(p_name, p_timezone)` moves into `create_workspace_for(p_user, p_name, p_timezone)`, security definer, callable by the service role only; `create_workspace` keeps its signature and becomes the signed-in wrapper over it. Nothing else changes: slug, timezone check, the ten-workspace cap per account, the provisioning trigger.

**Route.** `POST /api/v1/signup`, public (listed in the middleware's `PUBLIC_PATHS` beside `/signup`), same-origin only, rate-limited per IP and per email through the existing Postgres-backed buckets, the invite code compared in constant time. With the service role: create the auth user (email confirmed; an existing address is recognised by Supabase's own error and left alone), create the workspace for a new user through `create_workspace_for`, then send the sign-in code with the anon client (`shouldCreateUser: false`). The answer is one neutral sentence and the way to `/login?email=…&sent=1`, which opens the code step. A new workspace records `workspace.created` and tells the platform mailbox through the edge (`admin/signup-notify`).

**Page.** `/signup` in the sign-in card's style. `/login` reads `?email=&sent=1` and opens at the code step; its foot links to sign-up.

**Tests.** The schema and words executed; wiring pins on the public paths, the guards, the service-role boundary (`server/signup.ts` is the only new place the service role is used, and it writes no tenant data), the migration's grants; e2e: the page, the readiness answer, a refused cross-site post, a refused bad body, and an opt-in probe sign-up that creates and then removes a workspace and its user with the service role.

## 5. Step two: billing (Stripe)

**Facts to verify against Stripe's current docs before writing the calls:** Checkout Session in `subscription` mode with `subscription_data.trial_period_days`, `customer` reuse by `metadata.tenant_id`, `success_url`/`cancel_url`; Billing Portal sessions; webhook signature (`Stripe-Signature`, `constructEvent`) and the events `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`; `subscriptions.resume` for a paused subscription; the SDK is `stripe` 22.x (Node ≥ 18).

**Data (migration 00073).** `billing_accounts` (tenant_id PK, `mode` stripe|direct, `stripe_customer_id`, `stripe_subscription_id`, `status` as Stripe spells it, `price_id`, `current_period_end`, `trial_end`, `cancel_at`, `card_brand`, `card_last4`, `updated_at`, `facts`); `billing_events` (Stripe event id PK, type, received_at) for idempotent webhooks; members read their row (RLS), the edge writes; every existing tenant gets `mode = direct, status = active`; `notifications.kind` learns `billing`; `tenants.status` becomes the one switch the runtime reads (active · paused), driven by billing for stripe-mode workspaces only.

**Edge.** `lib/billing.ts` (the Stripe client, the status map, the writes, the pause and resume of the receptionist), `api/stripe-webhook.ts` (signature verified, idempotent by event id, maps subscription status → row → tenant status → bell and email), `api/admin/billing.ts` ops `status | checkout | portal | invoices | resume` (diagnostic key). Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `BILLING_TRIAL_DAYS` (default 14). Nothing renders without the first three.

**The pause, honestly.** `tenant-runtime` reads `tenants.status`; a paused workspace's reply posture is "held for a person" with its own escalation reason and bell words, the outbound gate refuses campaign sends, and the phone line is switched off through the lines saga's own switch (and back on at resume). A `direct` workspace can still be paused by hand from the edge; billing never touches it.

**Dashboard.** `GET /api/v1/billing` (the row, readiness, words), `POST /api/v1/billing/checkout` and `/portal` and `/resume` (owner), `GET /api/v1/billing/invoices` (owner); `contracts/billing.ts` (DTO, `billingWords`, `toBillingVM`, the Setup row); Settings › Billing real; the Setup row first for stripe-mode workspaces; a shell banner while paused.

**Tests.** The status map and words executed (a truth table over Stripe statuses); the webhook verified with the SDK's own test-header helper; wiring pins; e2e on production against the live tenant (direct arrangement: the pane says so, no Setup row); the trial-to-paused loop walked with Stripe test keys and the 4242 card before live keys go in.

## 6. What it needs from Ruben

- Stripe: a **test-mode** secret key, the webhook signing secret for the edge endpoint `https://chanlytics-messaging.vercel.app/api/stripe-webhook`, and one recurring price id — so the loop is walked end to end with a test card first. Then the live equivalents.
- Whether sign-up opens or takes an invite code at launch (`SIGNUP_CODE` on the dashboard).

## 7. Verification

Step one: suite, lint, tsc; the migration applied before the merge; e2e `signup.spec.ts` on production; one probe sign-up walked by hand and removed. Step two: the same, plus the walk with test keys, then live keys with one real checkout that is cancelled in the portal.
