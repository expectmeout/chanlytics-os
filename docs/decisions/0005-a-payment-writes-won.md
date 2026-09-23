# 0005 · A payment writes won

**Status:** decided, not built. Written against commit `e3d9dc6c` (PR #885,
23 September 2026), and verified against the code at it. Where this note and
the code disagree, the code wins. It is step 5 of
[0004](0004-deals-record.md), the first of the three items that note held for
later.

## Context

### The deals table already names a payment, and nothing writes one

`deals.source` allows two values, `person` and `payment`
(`supabase/migrations/00156_a_deal_is_a_record.sql:46`), and contracts mirror
them (`DEAL_SOURCES`, `packages/contracts/src/deals.ts:18`; the closed set
`"deals.source"` in `schema-sets.generated.ts:32`). The literal `payment`
appears nowhere else. `DealDto` (`deals.ts:53-67`) has no `source` field, and
`people_list`'s `deal_*` columns (00156 `:340-347`) do not carry it. The
person's timeline says every move of a deal in the first person: `who: "You"`
(`packages/contracts/src/people.ts:2013`). A Client that a payment recorded
would read as one somebody typed.

### The door refuses anyone who is not a signed-in member

`deal_record` is `security definer` (00156 `:94-105`). It opens with
`v_user uuid := auth.uid()` and raises `28000` without one (`:112`,
`:120-122`), then answers `not_found` unless `is_acting_member` holds, which
checks `auth.uid()` against an owner's or operator's membership (`:142-144`;
`00014_app_plane_write_roles.sql:24-37`). Execute is granted to
`authenticated` only (`:238-239`). A webhook runs as the service role, with no
`auth.uid()`, so it cannot call this door. The door's rules are still the ones
a payment must meet:

- **A new row starts at `proposed`** (`bad_move`, `:148-150`).
- **A move names its row, and a stale `version` answers `moved`** (`:179-181`).
- **Nothing leaves `ended`** (`:182-185`).
- **A same-stage write is a refresh, not a move,** and writes no event
  (`:210-212`).
- **Every move writes one `deal.*` event** whose `data` carries `by: v_user`
  (`:215-233`).
- **One open engagement per person per service,** held by `deals_open_uq`
  (`:56-58`).

The house has a shape for a door only the service role may call:
`revoke execute ... from public, anon, authenticated` and
`grant execute ... to service_role`, as `lead_check_commit` does
(`00140_the_lead_finder_engine.sql:1294-1306`). The decisions ledger already allows a system actor:
`actor_type in ('user','ai','system','owner_phone')`, with a user id exactly
when the actor is a user (`00004_inbox.sql:34`, `:39`).

### Stripe is here, but only for the workspace paying Chanlytics

There is one platform key and one price: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID` (`apps/edge/.env.example:98-112`,
`apps/edge/lib/env.ts:160-167`). There is one client, built with no
`stripeAccount` option (`apps/edge/lib/billing.ts:52-60`). Checkout makes one
subscription per workspace, tagged `metadata: { tenant_id }`
(`billing.ts:289-330`). The file says of itself that it is _"the only place
the secret key is handled"_ (`:5-7`).

The webhook door is already the pattern a second one would copy
(`apps/edge/api/stripe-webhook.ts`):

- **It verifies over the raw body.** `constructEvent(raw, sig, secret)`, with
  400 `signature` on a failure (`:41-49`).
- **It takes each event once.** `keepEvent` inserts the event id into
  `billing_events`, whose `id text primary key` turns a replay into a 23505
  (`billing.ts:478-483`; `00073_billing.sql:45-50`).
- **A failed apply gives the claim back** through `forgetEvent` before the 500,
  so Stripe's retry is not lost (`stripe-webhook.ts:173-178`;
  `billing.ts:495-498`).
- **It keeps a type it does not act on,** _"so a type we do not act on is still
  on record once"_ (`:168-171`).

Nothing observes a customer paying a workspace. A search for Connect's words
(`stripe_account`, `Stripe-Account`, `accountLinks`, `on_behalf_of`,
`application_fee`, `transfer_data`) finds only a line in a mockup's gap
analysis. The Connections page keeps a row for it under _Later_:
`kind: "deposits"`, _"Deposits and payments taken by the receptionist."_,
`state: "later"`, no verb (`packages/contracts/src/connections.ts:652-663`).

### A workspace's own provider already has a shape: Google

`google_connections` (`00070_google_profile.sql:15-46`) is one row per
workspace with the account's identity, `connected_by`, `connected_at`,
`last_synced_at`, `sync_error` and a `credentials_ref` into Vault, readable by
members and realtime. Its secrets go through three service-role functions,
`put_`, `get_` and `drop_google_credentials` (`:48-114`); _"Disconnecting
forgets the token as well as the row"_ (`:94`). The connect flow is an admin
op on the edge, `{ op: "connect", tenant_id, user_id, code }`
(`apps/edge/api/admin/google.ts:12`), and the client secret never leaves the
edge (`:19`).

### A payer is matched to a person by address or number

`contacts.email` is unique per workspace where set, lower-cased and trimmed by
a CHECK (`00125_a_person_may_have_an_email.sql:22-42`). `normalizeEmail`
(`packages/contracts/src/email-address.ts:25-32`) and `normalizePhone`
(`packages/contracts/src/phone.ts:10`) are the two spellings. The email intake
already finds a person by address as the service role, skipping the erased and
the merged (`packages/db/src/repositories/email.ts:59-68`), and
`readDealForPhone` finds a person's current deal by number
(`packages/db/src/repositories/thread.ts:302-320`).

## Decision

**A payment the business itself received moves a deal to `won`, through a
payment connection the owner makes, and through a door only the service role
may call.** Nothing else changes about who writes a deal: a person, an Ask card
the person approves, and now a payment, each named on the row. The
receptionist still never writes one, and never sees an amount.

**The first provider is Stripe, through Connect.** The owner connects their own
Stripe account from Connections, the way they connect Google. Stripe then sends
that account's events to one Chanlytics endpoint, signed with one Connect
secret, and names the account on each event. The workspace is the one whose
connection holds that account id. No workspace key is stored for this: the
events carry what the door needs. A second provider is its own adapter behind
the same plan function.

**What counts as paid.** A completed Checkout Session (`payment_status` paid),
a paid invoice, or a succeeded Payment Intent that no Checkout Session owns, in
live mode. The amount is what was paid. `per` comes from the price's interval:
`month` and `year` as they are, a one-off as `once`, and anything else as no
`per` at all. The currency is the payment's, upper-cased. A test-mode event is
kept and acts on nothing.

**Who paid.** The payer's email, normalised, matched to `contacts.email`. Then
their phone, normalised, matched to `contacts.phone_e164`. A payer who matches
nobody moves nothing: the event is kept, and the connection's row says a
payment came from someone the workspace does not know. The product never
creates a person from a payment.

**Which deal.** In this order, and the first that applies wins:

1. **The person has one open `proposed` deal:** it moves to `won`.
2. **The person has several open `proposed` deals:** the one whose service the
   payment's line item names (the same match `isConsultationTitle` makes of a
   title, `deals.ts:254-266`). No match, or two: nothing moves, and the row
   says a payment needs a person to place it.
3. **The person's deal is already `won`:** a refresh. The amount and `per`
   update if they were empty, and no event is written, as the door does now.
4. **The person has no open deal:** a `won` deal is created, `source:
'payment'`. A payment is stronger evidence than a person's word, so it
   needs no proposal first. This is the one place a row may start past
   `proposed`, and only this door may do it.

**What it never does.** It never moves a deal to `lost` or `ended`. A refund, a
dispute or a cancelled subscription is kept as an event and said on the
connection's row, and a person decides what it means. It never writes an
amount into a prompt, and never tells the customer anything.

## Shape

```sql
-- <next free number, 00157 at e3d9dc6c> · A payment writes won.
create table if not exists public.payment_connections (
  tenant_id      uuid primary key references public.tenants (id) on delete cascade,
  provider       text not null check (provider in ('stripe')),
  account_id     text not null,               -- Stripe's acct_…: the event's `account`
  account_name   text,                        -- the account's own display name
  livemode       boolean not null,
  connected_by   uuid references auth.users (id) on delete set null,
  connected_at   timestamptz not null default now(),
  last_event_at  timestamptz,
  unplaced       integer not null default 0,  -- payments kept that moved nothing
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists payment_connections_account_uq
  on public.payment_connections (provider, account_id);

-- Each event once, whatever it did. The outcome is what the connection's row reads.
create table if not exists public.payment_events (
  id           text primary key,              -- the provider's event id
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  type         text not null,
  outcome      text not null check (outcome in ('won','refreshed','no_person','unplaced','test','kept')),
  contact_id   uuid references public.contacts (id) on delete set null,
  deal_id      uuid references public.deals (id) on delete set null,
  received_at  timestamptz not null default now()
);
-- Both tables: RLS on, one member-select policy, the 00120 revokes, realtime on
-- payment_connections, as 00126 and 00070 do.

-- The door. Service role only, in lead_check_commit's grant shape (00140).
create or replace function public.deal_paid(
  p_tenant_id    uuid,
  p_contact_id   uuid,
  p_service      text,         -- the line item's service, when it names one
  p_amount_cents integer,
  p_per          text,
  p_currency     text,
  p_when         timestamptz,
  p_evidence     jsonb         -- {"payment": {"provider": "stripe", "event": "evt_…", "object": "cs_…"}}
) returns jsonb
language plpgsql security definer set search_path = public as $$ … $$;
revoke execute on function public.deal_paid(uuid, uuid, text, integer, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.deal_paid(uuid, uuid, text, integer, text, text, timestamptz, jsonb)
  to service_role;
```

`deal_paid` applies the four rules in _Which deal_ under the row lock
`deal_record` takes. It writes `source = 'payment'`, `created_by = null`, and
one `deal.won` event whose `data` carries `by: null, via: 'payment'` beside the
fields `deal_record` writes. It answers `{ deal, from, outcome }`. The edge
writes the ledger row with `actor_type: 'system'`.

The plan function, in the email door's shape:

```ts
// apps/edge/lib/payments/payment-ingress.ts — THE JUDGEMENT, NOT THE WIRE.
export type PaymentVerdict =
  | { kind: "refuse"; status: 400; log: string }
  | { kind: "ignore"; eventId: string; tenantId: string | null; outcome: "test" | "kept" }
  | {
      kind: "paid";
      eventId: string;
      tenantId: string;
      payer: { email: string | null; phone: string | null };
      service: string | null;
      amountCents: number;
      per: "once" | "month" | "year" | null;
      currency: string;
      at: string;
      evidence: { payment: { provider: "stripe"; event: string; object: string } };
    };

export async function planPaymentEvent(x: {
  rawBody: string;
  signature: string | null;
  secret: string;
  db: Db;
  nowMs: number;
}): Promise<PaymentVerdict>;
```

The door `apps/edge/api/payments-webhook.ts` verifies nothing itself. It reads
the raw body, asks the plan, and then claims the event in `payment_events`,
calls `deal_paid`, writes the ledger row and stamps the connection. A failed
apply gives the claim back and answers 500, as the billing door does.

Contracts: `DealDto` and the `people_list` deal columns gain `source`, and the
timeline says a payment's `won` as `who: "Payment"`, `Paid · Ad management ·
$2,500 a month`. The Connections row `deposits` becomes `payments`, _Payments_,
with a verb: _Connect Stripe_ at rest; the account's name and the last payment
placed once connected; _N payments to place_ when `unplaced` is above zero,
linking to the list.

## Steps

The README rule governs every step: the two apps deploy independently, and the
database is pushed by hand, so each must be correct whichever goes first.

**1 · The tables and the door, called by nothing.** The migration above, the
`tenancy.db.test.mjs` fixtures for both tables, and the regenerated sets and
types. `DealDto.source` is optional. _Both orders:_ nothing calls the door, and
an older dashboard never asked for the column.

**2 · The words.** Contracts' `source` on the deal view model, the timeline's
_Payment_ line, and the Connections row as _Later_ still. _Both orders:_ a
deal with no `source` reads as `person`, which every existing row is.

**3 · The webhook.** `planPaymentEvent` and the door, two edge environment
variables (`STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`) through
`lib/env.ts` and `.env.example`, and the endpoint registered on the platform
account. _Both orders:_ with no connection rows, every event is kept as
`kept` and moves nothing.

**4 · Connect and disconnect.** Connections' verb starts Stripe's OAuth; its
return lands on an edge admin op in Google's shape that stores the account id,
name and mode. Disconnect deauthorises the account and deletes the row. The
route is declared with `route()`, owner-only, under the `disconnect`
permission. _Both orders:_ the dashboard's verb calls an edge op that exists
once step 3 has shipped. The verb stays hidden until the edge answers.

**5 · Payments to place.** The list behind _N payments to place_: each kept
payment that moved nothing, with who paid and how much, and a press that opens
the person's Deal row with the amount filled in. A person places it. The door
is never called from the page.

## Tests

- **A new `payment-ingress.test.mjs`**, a world over `_fake-db.mjs` in
  `sms-door.test.mjs`'s shape, where the real handler runs:
  - a bad signature answers 400;
  - an account no workspace holds is kept and moves nothing;
  - the same event twice moves one deal once;
  - a test-mode event moves nothing;
  - a payer matched by email moves their one proposal to `won` with the amount
    and `per`;
  - a payer matched only by phone does the same;
  - a payer nobody knows counts one to place;
  - two open proposals and a line item naming neither move nothing;
  - a refund moves nothing.
- **`deals.db.test.mjs`** gains `deal_paid`:
  - `authenticated` is refused, so no member can call it;
  - `proposed → won` writes one event, with `via: 'payment'`;
  - a second call on a `won` deal is a refresh with no event;
  - a person with no open deal gets a `won` row with `source = 'payment'`;
  - `deals_open_uq` still holds.
- **`person-honest.test.mjs`:** a payment's `won` says _Payment_, never _You_.
- **`connections.test.mjs`:** the row's three states, and its verb only for an
  owner.

## Risks

- **The wrong person.** A partner pays with their own card and their own
  address. The match is by the payer's details, so the payment is kept as one
  to place, which is honest. The converse is worse: an address two people share
  in real life, stored on one of them. The evidence names the event, and a
  person can undo a `won` exactly as they undo their own (`won → proposed`
  keeps its date, 0004).
- **A payment that is not for this.** A shop's sale of a product through the
  same Stripe account would make its buyer a Client. The line-item match helps
  only where there are several proposals. Hence open question 2.
- **The platform account.** Connect is set up on Chanlytics' own Stripe
  account, which today exists only to bill workspaces. A Connect webhook
  secret is a second secret on the edge, and a leak of it would let someone
  forge a payment. The door's claim table and the evidence make every write
  traceable, and the connection's row shows each one.
- **Amounts in the ledger.** An amount is already on the row by 0004's
  decision, visible to viewers, and never in a prompt. Nothing here changes
  that.

## Open questions for the owner

1. **Connect, or a key per workspace?** Connect needs Chanlytics' Stripe
   account enabled for Connect, a client id and a second webhook. A restricted
   key per workspace with its own webhook needs neither, but stores a secret
   per workspace in Vault and asks each owner to paste one. This note takes
   Connect.
2. **Every payment, or only some?** Should any payment from a known person make
   them a Client, or only payments for a service the profile lists? The second
   is safer for a business that also sells products, and misses a payment
   whose line item is named differently.
3. **May a payment create a Client with no proposal?** This note says yes (rule
   4). The alternative keeps 0004's rule that a deal starts at a proposal, and
   sends such a payment to _payments to place_.
4. **Does a cancelled subscription end a retainer?** This note says no, and
   shows it on the connection's row. An owner who bills retainers by
   subscription would like `ended` written for them.
5. **Other providers.** Square, PayPal or a bank feed each need their own
   adapter behind `planPaymentEvent`. Which comes second, if any?
