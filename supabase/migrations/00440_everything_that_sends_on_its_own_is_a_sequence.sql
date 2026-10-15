-- 00440 · Everything that sends on its own is a sequence: one storage for every kind (decision 0060, step S1).
--
-- A reminder before a visit, a win-back, a one-off for a date and emails to leads were kept in five tables under four
-- names. They are now one model, each workspace's own:
--
--   sequences                  NEW. What it is and how it starts (at a moment of a customer's journey, when someone joins
--                              a list, when a lead joins a list, or on a date) and whether it is on. A sequence's first
--                              step shares its id, and so does a one-off's only batch: every key that named a root playbook
--                              or a one-off broadcast already names its sequence.
--   sequence_steps             playbooks, renamed: each step in its place (place 1 is the first). after_playbook_id is
--                              after_step_id.
--   sequence_batches           broadcasts, renamed: what goes at one time, the unit a person approves. playbook_id is
--                              step_id, and each batch names its sequence.
--   sequence_sends             broadcast_recipients and reach_out_sends, merged: one message to one person. A customer's
--                              send has a contact_id and no lead_id; a lead's has its lead_id. reach_out_sends' ids are
--                              kept; broadcast_id is batch_id, playbook_id step_id, root_id sequence_id, attempt attempts.
--                              Each family keeps its states, its guard and its keys.
--   sequence_replies           reach_out_replies, renamed: what came back, read once; send_id keys sequence_sends.
--
-- The five old names stay as views of the new tables (security_invoker, automatically updatable), so every function and
-- caller that names them reads and writes the same rows under the caller's own rights until it moves; they go after the
-- deploy (0060, step S6). The five functions that returned reach_out_sends' rows are made again over its view, their
-- bodies unchanged. Production's 30 rows (7 playbooks, 6 broadcasts, 17 recipients) are carried here.
--
-- Deploy order: this migration first. The apps from before keep working through the views; the apps after it name the
-- new tables. A tab of the old dashboard repaints on its own tables' names, which the tells now say by their new ones.
-- Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------------ 1. sequences -- */

create table if not exists public.sequences (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  starts      text not null check (starts in ('moment', 'list', 'leads', 'date')),
  state       text not null default 'on' check (state in ('draft', 'on', 'paused', 'ended')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

comment on table public.sequences is
  'Decision 0060: anything that sends on its own. How it starts (moment: a moment of a customer''s journey; list: someone joins a list; leads: a lead joins a list; date: once, on a date), its name, and whether it is on. Its first step (sequence_steps) shares its id, and so does a one-off''s only batch.';
comment on column public.sequences.state is
  'draft: not started; on: it runs; paused: it waits; ended: it sends no more, its history kept (a one-off that went, a sequence whose steps were removed after it sent).';

/* ------------------------------------------------------------------------------------------------ 2. the renames -- */

do $$
begin
  if to_regclass('public.sequence_steps') is null then
    alter table public.playbooks rename to sequence_steps;
    alter table public.sequence_steps rename column after_playbook_id to after_step_id;
  end if;
  if to_regclass('public.sequence_batches') is null then
    alter table public.broadcasts rename to sequence_batches;
    alter table public.sequence_batches rename column playbook_id to step_id;
  end if;
  if to_regclass('public.sequence_replies') is null then
    alter table public.reach_out_replies rename to sequence_replies;
  end if;
end $$;

/* ------------------------------------------------------------------------- 3. steps: each in its sequence and place -- */

alter table public.sequence_steps add column if not exists sequence_id uuid;
alter table public.sequence_steps add column if not exists place integer;

insert into public.sequences (id, tenant_id, name, starts, state, created_by, created_at, updated_at)
select s.id, s.tenant_id, s.name,
       case when s.kind = 'reach_out' then 'leads' when s.trigger = 'saved_list' then 'list' else 'moment' end,
       case s.state when 'running' then 'on' else 'paused' end,
       s.created_by, s.created_at, s.updated_at
  from public.sequence_steps s
 where s.after_step_id is null
on conflict (id) do nothing;

with recursive chain as (
  select s.id, s.id as root, 1 as place from public.sequence_steps s where s.after_step_id is null
  union all
  select s.id, c.root, c.place + 1 from public.sequence_steps s join chain c on s.after_step_id = c.id
)
update public.sequence_steps s
   set sequence_id = c.root, place = c.place
  from chain c
 where c.id = s.id and s.sequence_id is null;

alter table public.sequence_steps alter column sequence_id set not null;
alter table public.sequence_steps alter column place set not null;
alter table public.sequence_steps drop constraint if exists sequence_steps_place_check;
alter table public.sequence_steps add constraint sequence_steps_place_check check (place between 1 and 20);
alter table public.sequence_steps drop constraint if exists sequence_steps_sequence_id_same_workspace;
alter table public.sequence_steps add constraint sequence_steps_sequence_id_same_workspace
  foreign key (tenant_id, sequence_id) references public.sequences (tenant_id, id) on delete cascade;
create unique index if not exists sequence_steps_place on public.sequence_steps (sequence_id, place);

comment on column public.sequence_steps.sequence_id is 'The sequence this step is part of (0060); the first step''s own id.';
comment on column public.sequence_steps.place is 'Where this step stands in its sequence: 1 is the first, each after_step_id one more.';

/* ---------------------------------------------------------------------------- 4. batches: each in its sequence -- */

alter table public.sequence_batches add column if not exists sequence_id uuid;

-- A one-off (no step) is a sequence of its own on a date, with its id. A run whose step was removed is one too: it went.
insert into public.sequences (id, tenant_id, name, starts, state, created_by, created_at, updated_at)
select b.id, b.tenant_id, b.name, 'date',
       case when b.state in ('sent', 'canceled', 'failed') then 'ended' else 'on' end,
       b.created_by, b.created_at, b.updated_at
  from public.sequence_batches b
 where b.step_id is null
on conflict (id) do nothing;

update public.sequence_batches b
   set sequence_id = coalesce((select s.sequence_id from public.sequence_steps s where s.id = b.step_id), b.id)
 where b.sequence_id is null;

alter table public.sequence_batches alter column sequence_id set not null;
alter table public.sequence_batches drop constraint if exists sequence_batches_sequence_id_same_workspace;
alter table public.sequence_batches add constraint sequence_batches_sequence_id_same_workspace
  foreign key (tenant_id, sequence_id) references public.sequences (tenant_id, id) on delete cascade;
create index if not exists sequence_batches_history on public.sequence_batches (sequence_id, created_at desc);

comment on column public.sequence_batches.sequence_id is 'The sequence this batch is a day of (0060): its step''s, or a one-off''s own id.';

/* ------------------------------------------------------------------------- 5. sends: one table, two families -- */

create table if not exists public.sequence_sends (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  sequence_id      uuid not null,
  step_id          uuid,
  batch_id         uuid not null,
  contact_id       uuid,
  lead_id          uuid,
  state            text not null,
  reason           text,
  attempts         integer not null default 0,
  message_id       uuid,
  sent_at          timestamptz,
  facts            jsonb,
  channel          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A lead's send: where it is in the clock's day, and what its check found.
  domain_id        uuid,
  send_at          timestamptz,
  claimed_at       timestamptz,
  opening          text,
  angle            text,
  facts_used       text[] not null default '{}',
  checked_at       timestamptz,
  check_tries      integer not null default 0,
  hold_detail      text,
  check_after      timestamptz,
  check_started_at timestamptz,
  check_first_at   timestamptz,
  check_gen        integer not null default 0,
  checked_words    text,
  included_for     text[] not null default '{}',
  mailbox_id       uuid,
  drafted_at       timestamptz,
  draft            jsonb,
  said_at          timestamptz,
  said_by          uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  unique (batch_id, lead_id),
  constraint sequence_sends_someone check (lead_id is not null or contact_id is not null),
  constraint sequence_sends_state_check check (
    state in ('planned', 'held', 'claimed', 'queued', 'drafted', 'sent', 'skipped', 'failed', 'handed')),
  constraint sequence_sends_customer_states check (lead_id is not null or state in ('queued', 'sent', 'skipped', 'failed')),
  constraint sequence_sends_attempts_check check (attempts >= 0 and (lead_id is null or attempts <= 20)),
  constraint sequence_sends_channel_check check (channel is null or channel in ('whatsapp', 'sms', 'email')),
  constraint sequence_sends_reason_check check (lead_id is null or reason is null or char_length(reason) <= 60),
  constraint sequence_sends_check_is_whole check (
    (opening is null or char_length(opening) between 1 and 400)
    and (angle is null or char_length(angle) between 1 and 40)
    and (hold_detail is null or char_length(hold_detail) <= 120)
    and (checked_words is null or char_length(checked_words) between 1 and 64)
    and check_tries between 0 and 100 and check_gen >= 0 and cardinality(facts_used) <= 12
    and included_for <@ array['customer_domain', 'chain', 'language', 'unbacked_fact', 'reads_like_spam', 'check_unavailable', 'abroad']),
  constraint sequence_sends_drafted_is_whole check (
    (state <> 'drafted' or (drafted_at is not null and draft is not null))
    and (draft is null or (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 16000))),
  constraint sequence_sends_handed_is_dated check (state <> 'handed' or sent_at is not null),
  constraint sequence_sends_held_says_why check (
    state <> 'held'
    or reason in ('customer_domain', 'chain', 'language', 'unbacked_fact', 'reads_like_spam', 'check_unavailable', 'abroad')),
  constraint sequence_sends_planned_is_timed check (state <> 'planned' or send_at is not null),
  constraint sequence_sends_sent_is_dated check (lead_id is null or state <> 'sent' or sent_at is not null),
  constraint sequence_sends_sequence_id_same_workspace foreign key (tenant_id, sequence_id)
    references public.sequences (tenant_id, id) on delete cascade,
  constraint sequence_sends_step_id_same_workspace foreign key (tenant_id, step_id)
    references public.sequence_steps (tenant_id, id) on delete set null (step_id),
  constraint sequence_sends_batch_id_same_workspace foreign key (tenant_id, batch_id)
    references public.sequence_batches (tenant_id, id) on delete cascade,
  constraint sequence_sends_contact_id_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete cascade,
  constraint sequence_sends_lead_id_same_workspace foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade,
  constraint sequence_sends_message_id_same_workspace foreign key (tenant_id, message_id)
    references public.messages (tenant_id, id) on delete set null (message_id),
  constraint sequence_sends_domain_id_same_workspace foreign key (tenant_id, domain_id)
    references public.sending_domains (tenant_id, id) on delete set null (domain_id),
  constraint sequence_sends_mailbox_id_same_workspace foreign key (tenant_id, mailbox_id)
    references public.mailbox_connections (tenant_id, id) on delete set null (mailbox_id)
);

comment on table public.sequence_sends is
  'Decision 0060: one message of a sequence to one person. A customer''s (contact_id, no lead_id): queued, then sent, skipped or failed, once. A lead''s (lead_id): planned (a time and a mailbox), held while its check doubts it, claimed under the mailbox''s day, queued as an email or drafted for its owner, then sent, skipped, failed or handed to the team.';
comment on column public.sequence_sends.facts is 'A customer''s send: the words its batch resolved for them when it was made (a visit''s time and service); the send fills the message''s slots from them. Cleared when the person is erased.';
comment on column public.sequence_sends.channel is 'The channel this person is reached on, picked once at enrolment (contracts'' reachFor) from the batch''s channels. Null: a send kept from before the channels, which went by WhatsApp.';
comment on column public.sequence_sends.attempts is 'A customer''s send: how many times it was claimed and given back (throttled, not_taken), counted by the guard. A lead''s: how many times the clock tried it.';
comment on column public.sequence_sends.domain_id is 'Retired (decision 0056): the sending domain a lead''s send left from on the cold Resend lane. Nothing writes it now; mailbox_id is the send''s.';
comment on column public.sequence_sends.mailbox_id is 'A lead''s send: the mailbox it leaves from (00424), planned with it, claimed under its day, and kept by its lead for the whole sequence.';
comment on column public.sequence_sends.drafted_at is 'A lead''s send handed to its owner, written and checked (00429): its fourteen days to be sent start here.';
comment on column public.sequence_sends.draft is 'The email handed to the owner (00429): {to, subject, body, text, parent_id?}, the words with their values in and, in text, with the foot.';
comment on column public.sequence_sends.said_at is 'When the owner said this drafted email went, or did not (00429).';
comment on column public.sequence_sends.said_by is 'The member who said it (00429).';

-- The data, once: a lead's send keeps its id; a customer's is dated by its batch.
do $$
begin
  if to_regclass('public.reach_out_sends') is not null
     and (select c.relkind from pg_class c where c.oid = 'public.reach_out_sends'::regclass) = 'r' then
    insert into public.sequence_sends (
      id, tenant_id, sequence_id, step_id, batch_id, contact_id, lead_id, state, reason, attempts, message_id, sent_at,
      created_at, updated_at, domain_id, send_at, claimed_at, opening, angle, facts_used, checked_at, check_tries,
      hold_detail, check_after, check_started_at, check_first_at, check_gen, checked_words, included_for, mailbox_id,
      drafted_at, draft, said_at, said_by)
    select r.id, r.tenant_id, r.root_id, r.playbook_id, r.broadcast_id, r.contact_id, r.lead_id, r.state, r.reason,
           r.attempts, r.message_id, r.sent_at, r.created_at, r.updated_at, r.domain_id, r.send_at, r.claimed_at,
           r.opening, r.angle, r.facts_used, r.checked_at, r.check_tries, r.hold_detail, r.check_after,
           r.check_started_at, r.check_first_at, r.check_gen, r.checked_words, r.included_for, r.mailbox_id,
           r.drafted_at, r.draft, r.said_at, r.said_by
      from public.reach_out_sends r
    on conflict (id) do nothing;
  end if;
  if to_regclass('public.broadcast_recipients') is not null
     and (select c.relkind from pg_class c where c.oid = 'public.broadcast_recipients'::regclass) = 'r' then
    insert into public.sequence_sends (
      tenant_id, sequence_id, step_id, batch_id, contact_id, state, reason, attempts, message_id, sent_at, facts,
      channel, created_at, updated_at)
    select r.tenant_id, b.sequence_id, b.step_id, r.broadcast_id, r.contact_id, r.state, r.reason, r.attempt,
           r.message_id, r.sent_at, r.facts, r.channel, b.created_at, coalesce(r.sent_at, b.created_at)
      from public.broadcast_recipients r
      join public.sequence_batches b on b.id = r.broadcast_id;
  end if;
end $$;

create unique index if not exists sequence_sends_person_once on public.sequence_sends (batch_id, contact_id)
  where lead_id is null;
create unique index if not exists sequence_sends_one_first on public.sequence_sends (tenant_id, lead_id)
  where lead_id is not null and step_id = sequence_id
    and not (state = 'skipped' and reason in ('run_canceled', 'owner_took_back'));
create index if not exists sequence_sends_batch on public.sequence_sends (batch_id, state);
create index if not exists sequence_sends_step on public.sequence_sends (step_id, state);
create index if not exists sequence_sends_chain on public.sequence_sends (sequence_id, lead_id);
create index if not exists sequence_sends_person on public.sequence_sends (tenant_id, contact_id);
create index if not exists sequence_sends_contact_sent on public.sequence_sends (tenant_id, contact_id, sent_at desc)
  where state = 'sent' and contact_id is not null;
create index if not exists sequence_sends_lead on public.sequence_sends (tenant_id, lead_id) where lead_id is not null;
create index if not exists sequence_sends_message on public.sequence_sends (message_id) where message_id is not null;
create index if not exists sequence_sends_open on public.sequence_sends (tenant_id, state) where state in ('claimed', 'queued');
create index if not exists sequence_sends_drafted on public.sequence_sends (batch_id, drafted_at) where state = 'drafted';
create index if not exists sequence_sends_due on public.sequence_sends (domain_id, send_at) where state = 'planned';
create index if not exists sequence_sends_mailbox on public.sequence_sends (mailbox_id, state) where mailbox_id is not null;
create index if not exists sequence_sends_mailbox_due on public.sequence_sends (mailbox_id, send_at) where state = 'planned';
create index if not exists sequence_sends_held on public.sequence_sends (created_at) where state = 'held';
create index if not exists sequence_sends_unchecked on public.sequence_sends (tenant_id, check_after)
  where state = 'planned' and checked_at is null;

-- A reply keys the send it answered, now in sequence_sends.
alter table public.sequence_replies drop constraint if exists reach_out_replies_send_id_same_workspace;
alter table public.sequence_replies drop constraint if exists sequence_replies_send_id_same_workspace;
alter table public.sequence_replies add constraint sequence_replies_send_id_same_workspace
  foreign key (tenant_id, send_id) references public.sequence_sends (tenant_id, id) on delete set null (send_id);

/* --------------------------------------------- 6. the old names, as views; the two old send tables go -- */

-- Each old name reads and writes its new table under the caller's own rights (security_invoker), automatically
-- updatable, with its old columns' names.
create or replace view public.playbooks with (security_invoker = true) as
select s.id, s.tenant_id, s.name, s.trigger, s.template_id, s.template_name, s.template_language, s.params,
       s.policy_class, s.state, s.run_hour, s.cap_per_run, s.gap_days, s.cadence_days, s.created_by, s.last_run_for,
       s.last_run_at, s.created_at, s.updated_at, s.list_id, s.list_key, s.kind, s.lead_search_id,
       s.after_step_id as after_playbook_id, s.after_days, s.gap_minutes, s.domain_ids, s.signed_by,
       s.include_unconfirmed, s.hand, s.channels, s.until, s.trial_until, s.mailbox_ids, s.owner_sends
  from public.sequence_steps s;

create or replace view public.broadcasts with (security_invoker = true) as
select b.id, b.tenant_id, b.name, b.template_id, b.template_name, b.template_language, b.params, b.audience, b.state,
       b.scheduled_for, b.started_at, b.finished_at, b.recipient_count, b.failure, b.created_by, b.created_at,
       b.updated_at, b.step_id as playbook_id, b.run_for, b.channels
  from public.sequence_batches b;

create or replace view public.reach_out_replies with (security_invoker = true) as
select r.message_id, r.tenant_id, r.conversation_id, r.contact_id, r.lead_id, r.lead_contact_id, r.send_id,
       r.answered_message_id, r.claim, r.intent, r.summary, r.named_day, r.refer_to, r.unread, r.rereads, r.reread_at,
       r.until_at, r.plan, r.draft, r.draft_state, r.draft_why, r.tell_claimed_at, r.told_at, r.read_at, r.undone_at,
       r.undone_by, r.signer_name, r.signer_title, r.signer_state, r.signer_was, r.signer_settled_at,
       r.signer_settled_by, r.said_by
  from public.sequence_replies r;

-- The two send tables give way to their views. The functions that return reach_out_sends' row type are bound to the
-- table: each is made again, its body unchanged, over the view that stands in the table's place.
do $$
declare
  f record;
  v_defs text[] := '{}';
  v_sigs text[] := '{}';
  v_notes text[] := '{}';
begin
  if to_regclass('public.broadcast_recipients') is not null
     and (select c.relkind from pg_class c where c.oid = 'public.broadcast_recipients'::regclass) = 'r' then
    drop table public.broadcast_recipients;
    create view public.broadcast_recipients with (security_invoker = true) as
    select s.batch_id as broadcast_id, s.contact_id, s.tenant_id, s.state, s.reason, s.message_id, s.sent_at, s.facts,
           s.channel, s.attempts as attempt
      from public.sequence_sends s
     where s.lead_id is null
    with cascaded check option;
  end if;
  if to_regclass('public.reach_out_sends') is not null
     and (select c.relkind from pg_class c where c.oid = 'public.reach_out_sends'::regclass) = 'r' then
    for f in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prorettype = (select c.reltype from pg_class c where c.oid = 'public.reach_out_sends'::regclass)
    loop
      v_defs := v_defs || pg_get_functiondef(f.oid);
      v_sigs := v_sigs || f.oid::regprocedure::text;
      v_notes := v_notes || obj_description(f.oid, 'pg_proc');
      execute format('drop function %s', f.oid::regprocedure);
    end loop;
    drop table public.reach_out_sends;
    create view public.reach_out_sends with (security_invoker = true) as
    select s.id, s.tenant_id, s.batch_id as broadcast_id, s.step_id as playbook_id, s.sequence_id as root_id, s.lead_id,
           s.contact_id, s.domain_id, s.send_at, s.state, s.reason, s.attempts, s.message_id, s.claimed_at, s.sent_at,
           s.created_at, s.updated_at, s.opening, s.angle, s.facts_used, s.checked_at, s.check_tries, s.hold_detail,
           s.check_after, s.check_started_at, s.check_first_at, s.check_gen, s.checked_words, s.included_for,
           s.mailbox_id, s.drafted_at, s.draft, s.said_at, s.said_by
      from public.sequence_sends s
     where s.lead_id is not null
    with cascaded check option;
    for i in 1 .. coalesce(array_length(v_defs, 1), 0) loop
      execute v_defs[i];
      execute format('revoke all on function %s from public, anon, authenticated', v_sigs[i]);
      execute format('grant execute on function %s to service_role', v_sigs[i]);
      if v_notes[i] is not null then
        execute format('comment on function %s is %L', v_sigs[i], v_notes[i]);
      end if;
    end loop;
  end if;
end $$;

drop function if exists public.broadcast_recipients_guard();
drop function if exists public.reach_out_sends_guard();

/* ------------------------------------------------------- 7. the renamed tables' parts take their tables' names -- */

do $$
declare
  t record;
  r record;
  fresh text;
begin
  for t in
    select * from (values ('sequence_steps', 'playbooks_'), ('sequence_batches', 'broadcasts_'),
                          ('sequence_replies', 'reach_out_replies_')) v(rel, old)
  loop
    for r in
      select c.conname as name from pg_constraint c
       where c.conrelid = ('public.' || t.rel)::regclass and starts_with(c.conname, t.old)
    loop
      fresh := t.rel || '_' || replace(replace(substr(r.name, length(t.old) + 1), 'playbook_id', 'step_id'), 'playbook', 'step');
      execute format('alter table public.%I rename constraint %I to %I', t.rel, r.name, fresh);
    end loop;
    for r in
      select i.relname as name from pg_index x join pg_class i on i.oid = x.indexrelid
       where x.indrelid = ('public.' || t.rel)::regclass and starts_with(i.relname, t.old)
    loop
      fresh := t.rel || '_' || replace(replace(substr(r.name, length(t.old) + 1), 'playbook_id', 'step_id'), 'playbook', 'step');
      execute format('alter index public.%I rename to %I', r.name, fresh);
    end loop;
    for r in
      select p.polname as name from pg_policy p
       where p.polrelid = ('public.' || t.rel)::regclass and starts_with(p.polname, t.old)
    loop
      execute format('alter policy %I on public.%I rename to %I', r.name, t.rel, t.rel || '_' || substr(r.name, length(t.old) + 1));
    end loop;
    for r in
      select g.tgname as name from pg_trigger g
       where g.tgrelid = ('public.' || t.rel)::regclass and not g.tgisinternal and starts_with(g.tgname, t.old)
    loop
      execute format('alter trigger %I on public.%I rename to %I', r.name, t.rel, t.rel || '_' || substr(r.name, length(t.old) + 1));
    end loop;
  end loop;
  if to_regprocedure('public.broadcasts_guard()') is not null then
    alter function public.broadcasts_guard() rename to sequence_batches_guard;
  end if;
end $$;

/* ------------------------------------------------------------------------------- 8. how the rows keep together -- */

-- A step made without its sequence: a first step makes one with its id, a later one joins its step's, one place on.
create or replace function public.sequence_steps_place() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.sequence_id is null then
    if NEW.after_step_id is null then
      insert into public.sequences (id, tenant_id, name, starts, state, created_by)
      values (NEW.id, NEW.tenant_id, NEW.name,
              case when NEW.kind = 'reach_out' then 'leads' when NEW.trigger = 'saved_list' then 'list' else 'moment' end,
              case NEW.state when 'running' then 'on' else 'paused' end,
              NEW.created_by);
      NEW.sequence_id := NEW.id;
      NEW.place := 1;
    else
      select s.sequence_id, s.place + 1 into NEW.sequence_id, NEW.place
        from public.sequence_steps s
       where s.id = NEW.after_step_id;
      -- No such step: its own id stands in, and the keys refuse the row as a step of another workspace (23503).
      NEW.sequence_id := coalesce(NEW.sequence_id, NEW.after_step_id);
      NEW.place := coalesce(NEW.place, 2);
    end if;
  end if;
  return NEW;
end $$;

-- Which sequence a step is in, and after which step, never changes.
create or replace function public.sequence_steps_stay() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.sequence_id is distinct from OLD.sequence_id or NEW.place is distinct from OLD.place
     or NEW.after_step_id is distinct from OLD.after_step_id then
    raise exception 'a step stays in its sequence and its place' using errcode = '23514';
  end if;
  return NEW;
end $$;

-- The first step's name and state are its sequence's.
create or replace function public.sequence_steps_say_sequence() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.sequences q
     set name = NEW.name,
         state = case when q.state = 'ended' then 'ended' when NEW.state = 'running' then 'on' else 'paused' end
   where q.id = NEW.sequence_id
     and (q.name is distinct from NEW.name
          or q.state is distinct from case when q.state = 'ended' then 'ended' when NEW.state = 'running' then 'on' else 'paused' end);
  return null;
end $$;

-- A first step removed: a sequence that made a batch ends, its batches kept (a canceled one says so); a sequence to leads
-- takes its emails with it, none of which went (reach_out_remove refuses one that wrote). One that never made a batch goes.
create or replace function public.sequence_steps_first_gone() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.sequence_batches b where b.sequence_id = OLD.sequence_id) then
    if OLD.kind = 'reach_out' then
      delete from public.sequence_sends where sequence_id = OLD.sequence_id and lead_id is not null;
    end if;
    update public.sequences set state = 'ended' where id = OLD.sequence_id;
  else
    delete from public.sequences where id = OLD.sequence_id;
  end if;
  return null;
end $$;

drop trigger if exists sequence_steps_place on public.sequence_steps;
create trigger sequence_steps_place before insert on public.sequence_steps
  for each row execute function public.sequence_steps_place();
drop trigger if exists sequence_steps_stay on public.sequence_steps;
create trigger sequence_steps_stay before update of sequence_id, place, after_step_id on public.sequence_steps
  for each row execute function public.sequence_steps_stay();
drop trigger if exists sequence_steps_say_sequence on public.sequence_steps;
create trigger sequence_steps_say_sequence after insert or update of name, state on public.sequence_steps
  for each row when (NEW.id = NEW.sequence_id) execute function public.sequence_steps_say_sequence();
drop trigger if exists sequence_steps_first_gone on public.sequence_steps;
create trigger sequence_steps_first_gone after delete on public.sequence_steps
  for each row when (OLD.id = OLD.sequence_id) execute function public.sequence_steps_first_gone();

-- A batch made without its sequence: a step's names the step's; a one-off is a sequence of its own, on a date.
create or replace function public.sequence_batches_place() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.sequence_id is null then
    if NEW.step_id is not null then
      select s.sequence_id into NEW.sequence_id
        from public.sequence_steps s
       where s.id = NEW.step_id;
      NEW.sequence_id := coalesce(NEW.sequence_id, NEW.step_id);
    else
      insert into public.sequences (id, tenant_id, name, starts, state, created_by)
      values (NEW.id, NEW.tenant_id, NEW.name, 'date',
              case when NEW.state in ('sent', 'canceled', 'failed') then 'ended' else 'on' end, NEW.created_by);
      NEW.sequence_id := NEW.id;
    end if;
  end if;
  return NEW;
end $$;

-- A one-off's name and state are its sequence's: it ends when its batch went, failed or was canceled.
create or replace function public.sequence_batches_say_sequence() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_state text := case when NEW.state in ('sent', 'canceled', 'failed') then 'ended' else 'on' end;
begin
  update public.sequences q
     set name = NEW.name, state = v_state
   where q.id = NEW.sequence_id and q.starts = 'date'
     and (q.name is distinct from NEW.name or q.state is distinct from v_state);
  return null;
end $$;

-- A one-off's batch removed takes its sequence.
create or replace function public.sequence_batches_one_off_gone() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.sequences where id = OLD.sequence_id and starts = 'date';
  return null;
end $$;

drop trigger if exists sequence_batches_place on public.sequence_batches;
create trigger sequence_batches_place before insert on public.sequence_batches
  for each row execute function public.sequence_batches_place();
drop trigger if exists sequence_batches_say_sequence on public.sequence_batches;
create trigger sequence_batches_say_sequence after update of name, state on public.sequence_batches
  for each row when (NEW.id = NEW.sequence_id) execute function public.sequence_batches_say_sequence();
drop trigger if exists sequence_batches_one_off_gone on public.sequence_batches;
create trigger sequence_batches_one_off_gone after delete on public.sequence_batches
  for each row when (OLD.id = OLD.sequence_id) execute function public.sequence_batches_one_off_gone();

-- A send made without its sequence and step takes its batch's; its first state is its family's.
create or replace function public.sequence_sends_place() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.sequence_id is null or (NEW.step_id is null and NEW.lead_id is null) then
    select coalesce(NEW.sequence_id, b.sequence_id), coalesce(NEW.step_id, b.step_id)
      into NEW.sequence_id, NEW.step_id
      from public.sequence_batches b
     where b.id = NEW.batch_id;
    NEW.sequence_id := coalesce(NEW.sequence_id, NEW.batch_id);
  end if;
  NEW.state := coalesce(NEW.state, case when NEW.lead_id is null then 'queued' else 'planned' end);
  return NEW;
end $$;

-- The moves each family's send may take.
create or replace function public.sequence_sends_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (NEW.lead_id is null) <> (OLD.lead_id is null) then
    raise exception 'sequence_sends: a send stays a customer''s or a lead''s' using errcode = '23514';
  end if;
  if NEW.state is distinct from OLD.state then
    if NEW.lead_id is null then
      -- The claim, settled: the one failed that is not a verdict.
      if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state in ('sent', 'skipped') then
        return NEW;
      end if;
      -- Or released, when WhatsApp did not take the send -- too many, too fast, or never reached at all: nothing was
      -- taken, and the release says which. Its next try is a new attempt (00301).
      if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state = 'queued'
         and NEW.reason in ('throttled', 'not_taken') then
        NEW.attempts := OLD.attempts + 1;
        return NEW;
      end if;
      if OLD.state in ('sent', 'skipped', 'failed') then
        raise exception 'sequence_sends.state is terminal (% -> % refused)', OLD.state, NEW.state;
      end if;
      -- From queued the CHECK admits only sent, skipped and failed.
    else
      if not (
        (OLD.state = 'planned' and NEW.state in ('claimed', 'skipped', 'held')) or
        (OLD.state = 'held' and NEW.state in ('planned', 'skipped')) or
        (OLD.state = 'claimed' and NEW.state in ('queued', 'drafted', 'planned', 'skipped', 'failed')) or
        (OLD.state = 'queued' and NEW.state in ('sent', 'planned', 'skipped', 'failed')) or
        (OLD.state = 'drafted' and NEW.state in ('sent', 'skipped')) or
        (OLD.state = 'skipped' and NEW.state = 'sent' and OLD.drafted_at is not null)
      ) then
        raise exception 'sequence_sends.state moves % -> % refused', OLD.state, NEW.state;
      end if;
      if NEW.state = 'claimed' and NEW.checked_at is null then
        raise exception 'sequence_sends: a send is claimed only once it is checked';
      end if;
    end if;
  end if;
  return NEW;
end $$;

comment on function public.sequence_sends_guard() is
  'A customer''s send: queued -> sent|skipped|failed, once; a claim (failed, outcome_unknown) -> sent|skipped, or back to queued as throttled or not_taken, which counts a new attempt (00301). A lead''s: planned -> claimed|skipped|held; held -> planned|skipped; claimed -> queued|drafted|planned|skipped|failed (claimed only once checked); queued -> sent|planned|skipped|failed; drafted -> sent|skipped; skipped -> sent for a drafted one. A same-state update is not a move; a send never changes family.';

drop trigger if exists sequence_sends_place on public.sequence_sends;
create trigger sequence_sends_place before insert on public.sequence_sends
  for each row execute function public.sequence_sends_place();
drop trigger if exists sequence_sends_guard on public.sequence_sends;
create trigger sequence_sends_guard before update on public.sequence_sends
  for each row execute function public.sequence_sends_guard();
drop trigger if exists sequence_sends_set_updated_at on public.sequence_sends;
create trigger sequence_sends_set_updated_at before update on public.sequence_sends
  for each row execute function extensions.moddatetime('updated_at');
drop trigger if exists sequences_set_updated_at on public.sequences;
create trigger sequences_set_updated_at before update on public.sequences
  for each row execute function extensions.moddatetime('updated_at');

-- An erased person's words leave every send that kept them.
create or replace function public.sequence_sends_on_erase() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    update public.sequence_sends s
       set facts = null
     where s.tenant_id = NEW.tenant_id and s.contact_id = NEW.id and s.facts is not null;
  end if;
  return null;
end $$;

comment on function public.sequence_sends_on_erase() is
  'When a person is erased, the words each batch kept for them (a visit''s time, service and calendar key, a proposal''s link) are cleared; the send keeps its state and reason, which the counts read (00391).';

drop trigger if exists contacts_erase_clears_run_words on public.contacts;
create trigger contacts_erase_clears_run_words after update of erased_at on public.contacts
  for each row execute function public.sequence_sends_on_erase();
drop function if exists public.broadcast_recipients_on_erase();

revoke all on function public.sequence_steps_place() from public, anon, authenticated;
revoke all on function public.sequence_steps_stay() from public, anon, authenticated;
revoke all on function public.sequence_steps_say_sequence() from public, anon, authenticated;
revoke all on function public.sequence_steps_first_gone() from public, anon, authenticated;
revoke all on function public.sequence_batches_place() from public, anon, authenticated;
revoke all on function public.sequence_batches_say_sequence() from public, anon, authenticated;
revoke all on function public.sequence_batches_one_off_gone() from public, anon, authenticated;
revoke all on function public.sequence_sends_place() from public, anon, authenticated;
revoke all on function public.sequence_sends_guard() from public, anon, authenticated;
revoke all on function public.sequence_sends_on_erase() from public, anon, authenticated;
grant execute on function public.sequence_steps_place() to service_role;
grant execute on function public.sequence_steps_stay() to service_role;
grant execute on function public.sequence_steps_say_sequence() to service_role;
grant execute on function public.sequence_steps_first_gone() to service_role;
grant execute on function public.sequence_batches_place() to service_role;
grant execute on function public.sequence_batches_say_sequence() to service_role;
grant execute on function public.sequence_batches_one_off_gone() to service_role;
grant execute on function public.sequence_sends_place() to service_role;
grant execute on function public.sequence_sends_guard() to service_role;
grant execute on function public.sequence_sends_on_erase() to service_role;

/* --------------------------------------------------------------------- 9. row security and grants, new tables -- */

alter table public.sequences enable row level security;
drop policy if exists sequences_member_select on public.sequences;
create policy sequences_member_select on public.sequences for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.sequences from anon, authenticated;
grant select on public.sequences to authenticated;
grant select, insert, update, delete on public.sequences to service_role;

alter table public.sequence_sends enable row level security;
drop policy if exists sequence_sends_member_select on public.sequence_sends;
create policy sequence_sends_member_select on public.sequence_sends for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member enrols a customer on a batch of their workspace: someone not erased, and a message of theirs if any.
drop policy if exists sequence_sends_acting_insert on public.sequence_sends;
create policy sequence_sends_acting_insert on public.sequence_sends for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and lead_id is null
    and exists (select 1 from public.sequence_batches b
                 where b.id = sequence_sends.batch_id and b.tenant_id = sequence_sends.tenant_id)
    and exists (select 1 from public.contacts c
                 where c.id = sequence_sends.contact_id and c.tenant_id = sequence_sends.tenant_id and c.erased_at is null)
    and (message_id is null or exists (select 1 from public.messages m
                                        where m.id = sequence_sends.message_id and m.tenant_id = sequence_sends.tenant_id)));
revoke all on public.sequence_sends from anon, authenticated;
grant select on public.sequence_sends to authenticated;
grant insert (batch_id, contact_id, tenant_id, facts) on public.sequence_sends to authenticated;
grant select, insert, update, delete on public.sequence_sends to service_role;

/* ----------------------------------------------------------------------- 10. what the old names grant -- */

comment on view public.playbooks is 'Decision 0060: sequence_steps under its old name, while the code moves (step S6 drops it).';
comment on view public.broadcasts is 'Decision 0060: sequence_batches under its old name, while the code moves (step S6 drops it).';
comment on view public.broadcast_recipients is 'Decision 0060: a customer''s sequence_sends under its old name, while the code moves (step S6 drops it).';
comment on view public.reach_out_sends is 'Decision 0060: a lead''s sequence_sends under its old name, while the code moves (step S6 drops it).';
comment on view public.reach_out_replies is 'Decision 0060: sequence_replies under its old name, while the code moves (step S6 drops it).';

-- A view is read and written under the caller's rights on its table: each grants what its table granted.
revoke all on public.playbooks, public.broadcasts, public.broadcast_recipients, public.reach_out_sends,
  public.reach_out_replies from anon, authenticated;
grant select, insert, update, delete on public.playbooks, public.broadcasts, public.broadcast_recipients,
  public.reach_out_sends, public.reach_out_replies to service_role;
grant select, delete on public.playbooks to authenticated;
grant insert (tenant_id, created_by) on public.playbooks to authenticated;
grant insert (name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour,
  cap_per_run, gap_days, cadence_days, list_id, list_key, channels, until, trial_until),
  update (name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour,
  cap_per_run, gap_days, cadence_days, list_id, list_key, channels, until, trial_until)
  on public.playbooks to authenticated;
grant select, delete on public.broadcasts to authenticated;
grant insert (tenant_id, name, template_id, template_name, template_language, params, audience, recipient_count,
  created_by, playbook_id, run_for) on public.broadcasts to authenticated;
grant insert (state, scheduled_for), update (state, scheduled_for) on public.broadcasts to authenticated;
grant select on public.broadcast_recipients to authenticated;
grant insert (broadcast_id, contact_id, tenant_id, facts) on public.broadcast_recipients to authenticated;
grant select on public.reach_out_sends, public.reach_out_replies to authenticated;

/* ----------------------------------------------------------------------------------------- 11. the tells -- */

drop trigger if exists workspace_tell_insert on public.sequences;
create trigger workspace_tell_insert after insert on public.sequences
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_update on public.sequences;
create trigger workspace_tell_update after update on public.sequences
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_delete on public.sequences;
create trigger workspace_tell_delete after delete on public.sequences
  referencing old table as changed for each statement execute function public.workspace_tell_changes();

comment on table public.sequence_steps is
  'Decision 0060: each step of a sequence in its place (playbooks until 00440). A step is one message (a template, on the channels it ticks) or, last in a sequence to leads, a call or note for the team (hand).';
comment on table public.sequence_batches is
  'Decision 0060: what goes at one time in a sequence, the unit a person approves (broadcasts until 00440): a step''s run for a day (run_for), or a one-off''s only batch.';
comment on table public.sequence_replies is
  'Decision 0060: one reading of one reply to a sequence''s send, keyed by the message (reach_out_replies until 00440). The intent (or other, with why it could not be read), what the reading did (plan), and the draft it wrote.';

-- The rows just carried, read by the planner as they are.
analyze public.sequences, public.sequence_steps, public.sequence_batches, public.sequence_sends, public.sequence_replies;
