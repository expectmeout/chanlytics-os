# 0030 · A fact's event reaches its subscribers after the commit

**Status:** Decided on 6 October 2026 (Ruben: "all approved"), with 0029; not yet built. Proposed the same day. Written
against commit `b9a4d5c` (main, 5 October 2026) and verified against the code at it, and read again at `6a8e85f` (main,
6 October 2026), since which 0028's merge door (00326) and the message-status notice (00327) are in the code. Nothing of
it is built. Where this note and the code disagree, the code wins.

## Context

### The ledger of what happened has no reader that acts

`events` (`supabase/schema.sql`) is a partitioned, append-only ledger: `tenant_id`, `kind`, `category`,
`subject_type`, `subject_id`, `data`, `created_at`, the kind's schema `version` (00264) and `request_id`, which
defaults to `request_id_of_caller()` from the header `packages/db/src/observe.ts` sends. Record kinds are kept; evidence
kinds are purged at thirty days (00115). Its indexes are `(tenant_id, kind, created_at)` and
`(tenant_id, subject_type, subject_id, created_at)`. It is read by Activity, Setup, a person's page and the budget
(`apps/edge/lib/receptionist/budget.ts`), and acted on by nothing: no table names a subscriber of a kind, and no
trigger wakes a reader. The one case of a write that enqueues its own reaction is the pattern this note keeps:
`assemble_broadcast` (00282) writes the run, its recipients and the first `broadcast_send` job in one transaction, and
`lead_rounds_notify` writes a notification and a `push_send` job together.

### How a fact crosses an area today

Of the 38 wires traced between the Inbox, Campaigns, People, the Calendar and Setup on 5 October 2026, 19 are worked
out again on read and 9 wait for a clock. A booking reaches a lead an hour later, through the calendar sweep's
`reach_out_booked`; a reply's reading reaches the inbox through a job the intake schedules by hand
(`scheduleJobOnce`, `packages/jobs/src/schedule.ts`); a consent change reaches a running broadcast only because
`deliver()` re-reads it. Each of these is a subscription written as a clock or a re-read, because there is no way to
say "this happened" that something else can act on.

### What exists to build on

- The job ledger: `jobs` with `kind`, `due_at`, `payload`, `state`, `attempts`, `lease_until` and a generated `lane`
  (00281); `claim_due_jobs` with `SKIP LOCKED`; settlement, retries and `request_id` in the payload
  (`packages/jobs/src/ledger.ts`, `tick.ts`). Three partial unique indexes make three kinds idempotent
  (`jobs_email_ingest_uq`, `jobs_lead_collect_once`, `jobs_reply_read_once`, each `where state <> 'failed'`, the
  lesson of 00135).
- The notice: one statement trigger per watched table tells the workspace's private topic what changed (00265,
  `workspace_tell_changes`), once per transaction, never a row.
- The wake: `request_sweep` (00086) posts to an edge door through pg_net from SQL, and pg_cron calls it every ten
  seconds when a job is due (`trigger_jobs_tick`, 00098). Nothing in the tree calls `pg_notify` or listens; the edge is
  Vercel functions, which cannot hold a connection.

### Why not fan out in the writer's transaction

The first draft of the map had the writer's transaction insert one job per subscriber. The second review's objection
holds here: `ingest_inbound` (00110) is the path that must never wait, and a subscriber's rule failing (a lane a kind
does not name, a CHECK on `jobs.kind` an older edge wrote) would roll back a customer's message. The writer must not
know how many readers there are.

## Decision

1. **A fact and its event share a transaction.** Every door or verb that writes a record another area may care about
   writes its event in the same transaction, from a catalogue in contracts: the kind, its payload schema, the subject's
   kind. The catalogue is the list `repo/log-events.test.mjs` is for log names: closed, and a kind arrives with its
   schema.
2. **No door names a subscriber.** Who reacts to a kind is a row of `event_subscriptions` (kind, subscriber, lane,
   paused), never code in the door.
3. **Fan-out happens after the commit, by a relay with no cursor.** A trigger on `events` copies a subscribed kind
   into `event_outbox`, one small insert with no rule that can fail. The relay runs as the first step of every tick,
   drains the outbox under `SKIP LOCKED` (so an event whose transaction committed late is never skipped, which an id
   cursor would do), and writes one `event_deliveries` row per subscriber and one job each. A kind or subscriber the
   running edge does not know is kept and alarmed, as an unknown job kind is today (`ledger.ts`, 24 hours).
4. **One delivery per event and subscriber,** `unique (event_id, subscriber)`: retried, dead-lettered and re-driven
   apart from every other subscriber. A paused subscriber keeps its deliveries; a re-drive door replays them.
5. **At least once below the commit line, at most once at the wire.** Every subscriber, projector and workflow step
   assumes it may see a delivery twice, and `deliver()`'s claim before the wire (`SPEAKS_TO_A_PERSON`) stays the one
   exception. A model step records its answer by (run, step, attempt), so a redelivery never spends twice.
6. **Order is per subject.** `events` gains `aggregate_version` (nullable: only a mutable record has one) and
   `causation_id`; a projector applies a delivery only when its version is newer than what the projection holds, so
   the relay owes no order and projectors are idempotent by construction.
7. **A command's own next step stays in its transaction.** `assemble_broadcast` goes on writing its job; a
   workflow's first step and a notice's push are written where the fact is. Continuations in the transaction,
   subscriptions through the relay.
8. **Every verified delivery from a provider is kept briefly under the provider's own id** (`provider_events`), so an
   intake can be replayed locally after a fix instead of waiting for a redelivery Twilio never sends
   (`apps/edge/lib/sms/inbound-text.ts`), and intake lag is a number.

## Shape

```sql
alter table public.events
  add column if not exists aggregate_version integer,
  add column if not exists causation_id uuid;

create table public.event_subscriptions (
  kind        text not null,
  subscriber  text not null,
  lane        smallint not null check (lane in (0, 1, 2)),
  paused      boolean not null default false,
  primary key (kind, subscriber)
);

create table public.event_outbox (
  event_id   uuid primary key,
  tenant_id  uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);

create table public.event_deliveries (
  event_id    uuid not null,
  subscriber  text not null,
  tenant_id   uuid not null,
  state       text not null default 'scheduled' check (state in ('scheduled', 'done', 'failed', 'paused')),
  job_id      uuid,
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (event_id, subscriber)
);

-- In the writer's transaction: one insert, no rule of a subscriber's.
create or replace function public.events_outbox_copy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.event_subscriptions s where s.kind = new.kind and not s.paused) then
    insert into public.event_outbox (event_id, tenant_id, kind) values (new.id, new.tenant_id, new.kind)
    on conflict do nothing;
  end if;
  return null;
end $$;

-- After the commit, the first step of every tick: bounded, no cursor, fair per workspace.
create or replace function public.relay_events(p_limit integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0;
  r record;
begin
  for r in
    select o.event_id, o.tenant_id, o.kind
      from public.event_outbox o
     order by o.created_at
     limit p_limit
       for update skip locked
  loop
    insert into public.event_deliveries (event_id, subscriber, tenant_id)
    select r.event_id, s.subscriber, r.tenant_id
      from public.event_subscriptions s
     where s.kind = r.kind and not s.paused
    on conflict do nothing;
    -- one job per delivery, keyed so a second relay of the same event writes none (0031 dedupe_key)
    insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
    select r.tenant_id, 'event_deliver', now(),
           jsonb_build_object('event_id', r.event_id, 'subscriber', d.subscriber, 'kind', r.kind),
           'deliver:' || r.event_id::text || ':' || d.subscriber
      from public.event_deliveries d
     where d.event_id = r.event_id and d.state = 'scheduled' and d.job_id is null
    on conflict do nothing;
    delete from public.event_outbox where event_id = r.event_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
```

The job kind `event_deliver` carries the delivery; the handler in `packages/jobs/src/handlers.ts` looks the subscriber
up in a registry of core verbs (a projector, a workflow signal, the notifier) and settles the delivery row. Its lane is
the subscription's. The intake ledger:

```sql
create table public.provider_events (
  provider          text not null check (provider in ('meta', 'twilio', 'retell', 'resend', 'stripe', 'apify', 'elevenlabs')),
  provider_event_id text not null,
  tenant_id         uuid,
  received_at       timestamptz not null default now(),
  verified          boolean not null,
  payload           jsonb not null,
  primary key (provider, provider_event_id)
);
```

Kept seven days by the retention rows (a note to come); scrubbed on erasure by the identities it names.

## Steps

**1 · The envelope and the catalogue.** The two columns; the catalogue in `packages/contracts/src/shared/` with a
schema per kind; a test that every kind a door writes is in it. _Both orders:_ nullable columns and a list nobody reads.

**2 · Subscriptions, outbox, deliveries, the trigger.** Zero rows in `event_subscriptions`, so the trigger copies
nothing. _Both orders:_ tables neither app reads.

**3 · The relay in the tick, and the `event_deliver` kind** with its handler, its caller, the `jobs.kind` CHECK and
its lane together, as the rule says. One subscriber: an audit subscriber that records relay lag and nothing else.
_Both orders:_ an older edge sees a kind it does not know and keeps it, as today.

**4 · The intake ledger.** Every door writes `provider_events` before its verdict; a replay door under `admin/`
re-runs one. _Both orders:_ a table only the edge writes.

**5 · The first real subscriber:** receipts as events into the inbox projection (0029, phase 2). Each later
subscriber is a step of its own note.

## Tests

- **The relay** (`database/*.db.test.mjs` on the replayed stack): an event of a subscribed kind inserted in a
  transaction that commits late is still delivered; an unsubscribed kind leaves no outbox row; two relays of one event
  write one delivery and one job; a paused subscriber keeps its delivery undelivered; a kind the catalogue does not
  know is kept.
- **The double-delivery harness** (a world over `_fake-db.mjs`): every subscriber run twice on the same delivery
  leaves the same rows; the baseline of subscribers without the harness may only fall.
- **The writer** (`inbound-executed.test.mjs` and its kin, unchanged): `ingest_inbound`'s transaction grows one
  outbox insert and nothing that can refuse it.

## Risks

- **A trigger on the hot path.** One insert per subscribed event in `ingest_inbound`'s transaction, measured as 0019
  measured its notice (about 0.2 ms); the trigger copies nothing when no subscription names the kind.
- **A relay that falls behind** is a number (outbox depth) with an alarm, and the poll is its backstop.
- **Personal data in `provider_events`** is the cost of local replay: seven days, scrubbed by identity, never read
  by a page.

## Open questions

1. Should the relay be a SQL door, as above, or a core verb over ports? The claim under `SKIP LOCKED` is the
   database's own guarantee, so 0027 point 2 says a door.
2. One subscription row per workspace, or platform-wide? This note says platform-wide; a workspace's switch is the
   subscriber's own rule.
