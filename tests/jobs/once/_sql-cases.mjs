/**
 * The ledger's promises that only a real database can keep (the plan "Prove it works", lane 7), each a body for a
 * transaction that never commits: a DO block that fills `seen` (jsonb) and is ended by raising it, so nothing it wrote
 * stays. The database suite beside this file runs each through the CLI on CI's stack; the same bodies were run on a
 * Postgres engine with main's schema before they were pushed (this PC has no stack).
 *
 * `expect` is what `seen` must be.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** A workspace, a person and their thread: `t`, `cid` and `conv` are declared by the case. */
const A_THREAD = `
  insert into public.tenants (slug, name) values ('once-' || gen_random_uuid(), 'Once') returning id into t;
  insert into public.contacts (tenant_id) values (t) returning id into cid;
  insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;`;

export const SQL_CASES = [
  {
    name: "a transaction that fails leaves no record, no event and no job: a reply whose job cannot be written is not kept either",
    // The reply is written first and its job second, in one statement (queue_send, 00527). A job with no time to run
    // at is refused by the ledger after the reply's row was written: the row goes with it.
    body: `
    t uuid; cid uuid; conv uuid; refused text := null;
    begin
      ${A_THREAD}
      begin
        perform public.queue_send(
          jsonb_build_object('tenant_id', t, 'conversation_id', conv, 'contact_id', cid, 'channel', 'whatsapp',
                             'sender', 'ai', 'body', 'We have 3pm free.', 'meta', jsonb_build_object('to', '+15550100142')),
          null,
          '{"to_phone": "+15550100142"}'::jsonb);
      exception when others then
        refused := sqlstate;
      end;
      seen := jsonb_build_object(
        'refused', refused is not null,
        'messages', (select count(*) from public.messages where tenant_id = t),
        'jobs', (select count(*) from public.jobs where tenant_id = t),
        'events', (select count(*) from public.events where tenant_id = t and kind like 'message.%'));`,
    expect: { refused: true, messages: 0, jobs: 0, events: 0 },
  },
  {
    name: "a worker that dies after claiming: nothing takes the row while its lease holds, one claim takes it back after, counted",
    // The ledger is one queue: every other due row is moved out of reach for the moment the case takes, as the lanes'
    // suite does, so the only claim there is to make is this one's.
    body: `
    t uuid; j uuid; a record; b record; c record; none int;
    begin
      lock table public.jobs in share row exclusive mode;
      update public.jobs set due_at = now() + interval '1 day' where state = 'scheduled' and due_at <= now() + interval '1 minute';
      update public.jobs set lease_until = now() + interval '1 day' where state = 'fired';
      insert into public.tenants (slug, name) values ('once-' || gen_random_uuid(), 'Once') returning id into t;
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (t, 'push_receipts', now() - interval '1 second', '{"tickets": []}') returning id into j;
      select * into a from public.claim_due_jobs(1, 90);
      -- The run that claimed it dies here. Its lease holds: no other runner takes it.
      select count(*) into none from public.claim_due_jobs(1, 90);
      -- The lease runs out.
      update public.jobs set lease_until = now() - interval '1 second' where id = j;
      select * into b from public.claim_due_jobs(1, 90);
      select * into c from public.claim_due_jobs(1, 90);
      seen := jsonb_build_object(
        'first', a.id = j and a.attempts = 1 and a.state = 'fired',
        'while_held', none,
        'taken_back', b.id = j and b.attempts = 2,
        'once', c.id is null);`,
    expect: { first: true, while_held: 0, taken_back: true, once: true },
  },
  {
    name: "an event relayed twice has one delivery and one job for each subscriber",
    // The relay takes an event off the outbox; put back (a late commit seen twice, a relay that died after its writes
    // and before the outbox row went), the same event is relayed again and writes nothing new.
    body: `
    t uuid; cid uuid; conv uuid; e uuid; first int; again int;
    begin
      ${A_THREAD}
      insert into public.event_subscriptions (kind, subscriber, lane) values ('message.received', 'audit', 2) on conflict do nothing;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (t, 'message.received', 'message', 'conversation', conv, '{}') returning id into e;
      first := public.relay_events(500);
      insert into public.event_outbox (event_id, tenant_id, kind, event_at)
      select e, t, 'message.received', now()
       where not exists (select 1 from public.event_outbox o where o.event_id = e);
      again := public.relay_events(500);
      seen := jsonb_build_object(
        'relayed', first >= 1,
        'deliveries', (select count(*) from public.event_deliveries d where d.event_id = e and d.subscriber = 'audit'),
        'jobs', (select count(*) from public.jobs j where j.tenant_id = t and j.kind = 'event_deliver'
                    and j.payload ->> 'event_id' = e::text and j.payload ->> 'subscriber' = 'audit'),
        'outbox', (select count(*) from public.event_outbox o where o.event_id = e));`,
    expect: { relayed: true, deliveries: 1, jobs: 1, outbox: 0 },
  },
];
