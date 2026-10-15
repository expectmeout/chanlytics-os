-- 00440 · One loop runs every sequence (decision 0060, step S2).
--
-- 00439 made one storage. This moves the loop onto it:
--
--   sequence_claim_from        A mailbox's due sends to leads, claimed within its day under its lock: reach_out_claim_from
--                              over sequence_sends, its body the same. The lock's key is the old one, so a clock of either
--                              build waits for the other on the same mailbox while both are deployed.
--   sequence_claim_drafts      The due sends of a sequence its owner sends, claimed to be drafted (reach_out_claim_drafts).
--   sequence_held_stale        Holds and drafts left past a day (reach_out_held_stale).
--   sequence_stale_sends       Planned sends left past a time in batches that go ahead (reach_out_stale_sends).
--
-- Each returns sequence_sends' own rows, so the clock reads a send by its new names (batch_id, step_id, sequence_id). The
-- old five stay over their view until the deploy, and go with it (S6).
--
-- Deploy order: this migration first (00439 before it). Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------- 1. the lead clock's send readers -- */

create or replace function public.sequence_claim_from(p_mailbox_id uuid, p_cap integer, p_at timestamptz, p_limit integer)
returns setof public.sequence_sends
language plpgsql security definer
set search_path = public
as $$
declare
  v_room int;
begin
  if p_mailbox_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per mailbox at a time, whichever build's clock it is: the count below and the claim after it are one
  -- step (C7). The key is reach_out_claim_from's.
  perform pg_advisory_xact_lock(hashtext('reach_out_claim_mailbox:' || p_mailbox_id::text));
  if not exists (select 1 from public.mailbox_connections
                  where id = p_mailbox_id and state = 'connected'
                    and (resting_until is null or resting_until <= p_at)) then
    return;
  end if;
  v_room := least(p_limit, p_cap - (public.mailbox_capacity(p_mailbox_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then
    return;
  end if;
  -- Picked once, then claimed (00213): a materialized pick runs exactly once, so the claim is at most v_room rows.
  return query
  with picked as materialized (
     select s2.id from public.sequence_sends s2
       join public.sequence_steps p on p.id = s2.step_id
       join public.sequence_steps r on r.id = s2.sequence_id
       join public.sequence_batches b on b.id = s2.batch_id
      where s2.mailbox_id = p_mailbox_id and s2.lead_id is not null and s2.state = 'planned' and s2.send_at <= p_at
        and s2.checked_at is not null
        and not r.owner_sends
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by (p.after_step_id is null), s2.send_at
      limit v_room
      for update of s2 skip locked)
  update public.sequence_sends s
     set state = 'claimed', claimed_at = p_at
    from picked
   where s.id = picked.id
  returning s.*;
end $$;

comment on function public.sequence_claim_from(uuid, integer, timestamptz, integer) is
  'A connected mailbox''s due sends to leads, claimed within its day (p_cap less what it has used), at most p_limit, under the mailbox''s lock (C7, 00424; the key reach_out_claim_from takes): a step after the first before a first email, and never a send of a sequence its owner sends (00429). Nothing for a mailbox that is not connected, or resting. Service role only (0060).';

create or replace function public.sequence_claim_drafts(p_at timestamptz, p_limit integer, p_tenant_id uuid default null)
returns setof public.sequence_sends
language plpgsql security definer
set search_path = public
as $$
begin
  if p_at is null or p_limit is null or p_limit <= 0 then
    return;
  end if;
  return query
  with picked as materialized (
     select s2.id from public.sequence_sends s2
       join public.sequence_steps p on p.id = s2.step_id
       join public.sequence_steps r on r.id = s2.sequence_id
       join public.sequence_batches b on b.id = s2.batch_id
      where s2.lead_id is not null and s2.state = 'planned' and s2.send_at <= p_at and s2.checked_at is not null
        and (p_tenant_id is null or s2.tenant_id = p_tenant_id)
        and (r.owner_sends or (s2.mailbox_id is null and p.after_step_id is not null))
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by (p.after_step_id is null), s2.send_at
      limit p_limit
      for update of s2 skip locked)
  update public.sequence_sends s
     set state = 'claimed', claimed_at = p_at, mailbox_id = null
    from picked
   where s.id = picked.id
  returning s.*;
end $$;

comment on function public.sequence_claim_drafts(timestamptz, integer, uuid) is
  'The due sends of sequences their owners send (00429), claimed to be drafted, at most p_limit: planned, checked and due, in a running sequence and a batch that goes ahead, a step after the first before a first email. Their mailbox is let go. A step after the first planned with no mailbox while its owner sent the sequence is taken too, whoever sends it now. Service role only (0060).';

create or replace function public.sequence_held_stale(p_before timestamptz, p_limit integer, p_tenant_id uuid default null)
returns setof public.sequence_sends
language sql stable security definer
set search_path = public
as $$
  select s.* from public.sequence_sends s
   where s.lead_id is not null
     and ((s.state = 'held' and s.created_at < p_before) or (s.state = 'drafted' and s.drafted_at < p_before))
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
   order by coalesce(s.drafted_at, s.created_at)
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_held_stale(timestamptz, integer, uuid) is
  'A lead''s sends held since before p_before, or drafted for their owner since before it (00197, 00429: fourteen days), oldest first, at most p_limit. Service role only (0060).';

create or replace function public.sequence_stale_sends(p_before timestamptz, p_limit integer, p_tenant_id uuid default null)
returns setof public.sequence_sends
language sql stable security definer
set search_path = public
as $$
  select s.* from public.sequence_sends s
    join public.sequence_batches b on b.id = s.batch_id
    join public.sequence_steps p on p.id = s.step_id
    join public.sequence_steps r on r.id = s.sequence_id
   where s.lead_id is not null and s.state = 'planned' and s.send_at <= p_before
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running'
   order by s.send_at
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_stale_sends(timestamptz, integer, uuid) is
  'A lead''s planned sends due since before p_before in batches that go ahead, of a running step of a running sequence, oldest first, at most p_limit (00186). Service role only (0060).';

revoke all on function public.sequence_claim_from(uuid, integer, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.sequence_claim_drafts(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.sequence_held_stale(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.sequence_stale_sends(timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.sequence_claim_from(uuid, integer, timestamptz, integer) to service_role;
grant execute on function public.sequence_claim_drafts(timestamptz, integer, uuid) to service_role;
grant execute on function public.sequence_held_stale(timestamptz, integer, uuid) to service_role;
grant execute on function public.sequence_stale_sends(timestamptz, integer, uuid) to service_role;

/* -------------------------------------------- 2. a customer's sequence takes more steps (D6), and new words wait -- */

-- A step after the first of a customer's sequence: some days after the one before (1 to 90), only if they have not booked
-- or not written since (only_if), under its first step's class. A sequence to leads keeps its own shape.
alter table public.sequence_steps add column if not exists only_if text[] not null default '{}';
alter table public.sequence_steps add column if not exists next_template_id uuid;
alter table public.sequence_steps add column if not exists next_template_name text;
alter table public.sequence_steps add column if not exists next_template_language text;
-- The values the waiting words take (their slots may differ from the words they replace), promoted with them.
alter table public.sequence_steps add column if not exists next_params jsonb;

alter table public.sequence_steps drop constraint if exists sequence_steps_reach_out_shape;
alter table public.sequence_steps drop constraint if exists sequence_steps_shape;
alter table public.sequence_steps add constraint sequence_steps_shape check (
  case kind
    when 'reach_out' then coalesce(
      policy_class = 'outreach' and gap_minutes is not null and gap_minutes between 5 and 120
      and case trigger
            when 'lead_first' then lead_search_id is not null and after_step_id is null and after_days is null
            when 'after_step' then after_step_id is not null and after_days between 2 and 30 and lead_search_id is null
            else false
          end, false)
    else coalesce(
      policy_class <> 'outreach' and trigger <> 'lead_first' and lead_search_id is null and gap_minutes is null
      and domain_ids = '{}'
      and case trigger
            when 'after_step' then after_step_id is not null and after_days between 1 and 90
            else after_step_id is null and after_days is null
          end, false)
  end);

alter table public.sequence_steps drop constraint if exists sequence_steps_only_if_check;
alter table public.sequence_steps add constraint sequence_steps_only_if_check check (
  only_if <@ array['no_booking', 'no_reply']
  and (only_if = '{}' or (kind = 'moment' and trigger = 'after_step')));

alter table public.sequence_steps drop constraint if exists sequence_steps_next_words_whole;
-- The waiting words are named whole; the row they were filed as may go (its id set null) and its name still waits, as
-- the WhatsApp version approved under that name takes the step (sequence_steps_take_new_words).
alter table public.sequence_steps add constraint sequence_steps_next_words_whole check (
  (next_template_name is null) = (next_template_language is null)
  and (next_template_id is null or next_template_name is not null)
  and (next_params is null or next_template_name is not null));

alter table public.sequence_steps drop constraint if exists sequence_steps_next_template_id_same_workspace;
alter table public.sequence_steps add constraint sequence_steps_next_template_id_same_workspace
  foreign key (tenant_id, next_template_id) references public.templates (tenant_id, id) on delete set null (next_template_id);

comment on column public.sequence_steps.only_if is
  'A customer''s step after the first (D6): what must still hold of the person when it is due, else they leave the sequence: no_booking (no appointment ahead of them), no_reply (nothing written since the step before went). Empty: it goes to everyone due.';
comment on column public.sequence_steps.next_template_id is
  'New words for this step that wait for WhatsApp to approve them (0060): the step keeps sending its message (template_*) until WhatsApp approves these, which then become its message. Null: nothing waits.';

-- New words take a step's place the moment WhatsApp approves them; the step never stops for them.
create or replace function public.sequence_steps_take_new_words() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.sequence_steps s
     set template_id = coalesce(s.next_template_id, NEW.id),
         template_name = s.next_template_name,
         template_language = s.next_template_language,
         params = coalesce(s.next_params, s.params),
         next_template_id = null, next_template_name = null, next_template_language = null, next_params = null
   where s.tenant_id = NEW.tenant_id
     and s.next_template_name = NEW.name and s.next_template_language = NEW.language;
  return null;
end $$;

drop trigger if exists templates_approved_words_take_their_step on public.templates;
create trigger templates_approved_words_take_their_step
  after insert or update of meta_status on public.templates
  for each row when (NEW.channel = 'whatsapp' and NEW.meta_status = 'approved')
  execute function public.sequence_steps_take_new_words();

/* -------------------------------------------------- 3. someone in a sequence: where they stand, why they left -- */

create table if not exists public.sequence_enrollments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  sequence_id uuid not null,
  contact_id  uuid,
  lead_id     uuid,
  state       text not null default 'in' check (state in ('in', 'done', 'left')),
  place       integer not null default 1 check (place between 1 and 20),
  sent_at     timestamptz,
  next_at     timestamptz,
  why         text check (why is null or char_length(why) between 1 and 60),
  left_by     uuid references auth.users(id) on delete set null,
  entered_at  timestamptz not null default now(),
  moved_at    timestamptz not null default now(),
  ended_at    timestamptz,
  unique (tenant_id, id),
  constraint sequence_enrollments_someone check (lead_id is not null or contact_id is not null),
  constraint sequence_enrollments_ended_is_dated check ((state = 'in') = (ended_at is null)),
  constraint sequence_enrollments_left_says_why check (state <> 'left' or why is not null),
  constraint sequence_enrollments_sequence_id_same_workspace foreign key (tenant_id, sequence_id)
    references public.sequences (tenant_id, id) on delete cascade,
  constraint sequence_enrollments_contact_id_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete cascade,
  constraint sequence_enrollments_lead_id_same_workspace foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete cascade
);

comment on table public.sequence_enrollments is
  'Decision 0060: someone in a sequence. In while a step of theirs is to come; done when the last one went; left, with why (the reason of the send that went nowhere, booked, replied, removed). Kept by their sends as each is written and moves (sequence_sends_move_enrollment), and by the leave door. A customer enters again on a first step''s send of a new occasion; a lead enters once.';
comment on column public.sequence_enrollments.sent_at is 'When their last step went.';
comment on column public.sequence_enrollments.next_at is 'A customer''s sequence: when their next step is due (their last step''s send and the next step''s wait). Null when none is.';

create unique index if not exists sequence_enrollments_one_in_customer on public.sequence_enrollments (sequence_id, contact_id)
  where state = 'in' and lead_id is null;
create unique index if not exists sequence_enrollments_one_in_lead on public.sequence_enrollments (sequence_id, lead_id)
  where state = 'in' and lead_id is not null;
create index if not exists sequence_enrollments_of_sequence on public.sequence_enrollments (sequence_id, state, place);
create index if not exists sequence_enrollments_person on public.sequence_enrollments (tenant_id, contact_id);
create index if not exists sequence_enrollments_lead on public.sequence_enrollments (tenant_id, lead_id) where lead_id is not null;
create index if not exists sequence_enrollments_due on public.sequence_enrollments (sequence_id, place, next_at)
  where state = 'in' and next_at is not null;

alter table public.sequence_enrollments enable row level security;
drop policy if exists sequence_enrollments_member_select on public.sequence_enrollments;
create policy sequence_enrollments_member_select on public.sequence_enrollments for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.sequence_enrollments from anon, authenticated;
grant select on public.sequence_enrollments to authenticated;
grant select, insert, update, delete on public.sequence_enrollments to service_role;

drop trigger if exists sequence_enrollments_set_moved_at on public.sequence_enrollments;
create trigger sequence_enrollments_set_moved_at before update on public.sequence_enrollments
  for each row execute function extensions.moddatetime('moved_at');

-- No tell of its own: it moves with each send, one statement a person, as a batch goes (the sends are not told either:
-- a batch's page reads them when it opens). Who is in a sequence is read with it, and follows its batches' tells.
drop trigger if exists workspace_tell_insert on public.sequence_enrollments;
drop trigger if exists workspace_tell_update on public.sequence_enrollments;
drop trigger if exists workspace_tell_delete on public.sequence_enrollments;

-- A send written or moved moves its person in the sequence. A first step's send to a customer who is not at the start
-- of an occasion begins a new one; any later step continues the one they are in, or takes back up the one a send gone
-- nowhere ended (a batch canceled and planned again). A send that went moves them on: to their next step's day, or done.
-- A send gone nowhere while nothing else of theirs is pending takes them out, with its reason.
create or replace function public.sequence_sends_move_enrollment() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_place int;
  v_e public.sequence_enrollments%rowtype;
  v_next_days int;
  v_has_next boolean;
begin
  select st.place into v_place from public.sequence_steps st where st.id = NEW.step_id;
  if v_place is null then
    return null;
  end if;
  select e.* into v_e from public.sequence_enrollments e
   where e.sequence_id = NEW.sequence_id
     and case when NEW.lead_id is null then e.lead_id is null and e.contact_id = NEW.contact_id
              else e.lead_id = NEW.lead_id end
   order by e.entered_at desc, e.id desc
   limit 1
   for update;

  if TG_OP = 'INSERT' then
    if v_e.id is null
       or (NEW.lead_id is null and v_place = 1 and (v_e.state <> 'in' or v_e.place > 1)) then
      if v_e.id is not null and v_e.state = 'in' then
        update public.sequence_enrollments
           set state = 'left', why = 'started_again', ended_at = now(), next_at = null
         where id = v_e.id;
      end if;
      insert into public.sequence_enrollments (tenant_id, sequence_id, contact_id, lead_id, place)
      values (NEW.tenant_id, NEW.sequence_id, NEW.contact_id, NEW.lead_id, v_place);
    else
      update public.sequence_enrollments
         set state = 'in', why = null, ended_at = null, next_at = null, left_by = null,
             place = greatest(case when state = 'in' then place else 0 end, v_place)
       where id = v_e.id;
    end if;
    return null;
  end if;

  if v_e.id is null or NEW.state is not distinct from OLD.state then
    return null;
  end if;
  if NEW.state in ('sent', 'handed') then
    select true, n.after_days into v_has_next, v_next_days
      from public.sequence_steps n
     where n.sequence_id = NEW.sequence_id and n.place = v_place + 1;
    if coalesce(v_has_next, false) then
      update public.sequence_enrollments
         set state = 'in', why = null, ended_at = null, place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()),
             next_at = coalesce(NEW.sent_at, now()) + make_interval(days => coalesce(v_next_days, 0))
       where id = v_e.id;
    else
      update public.sequence_enrollments
         set state = 'done', why = null, ended_at = coalesce(ended_at, now()), place = greatest(place, v_place),
             sent_at = coalesce(NEW.sent_at, now()), next_at = null
       where id = v_e.id;
    end if;
  elsif NEW.state in ('skipped', 'failed')
        and not (NEW.lead_id is null and NEW.state = 'failed' and NEW.reason = 'outcome_unknown') then
    if v_e.state = 'in' and v_e.place <= v_place
       and not exists (select 1 from public.sequence_sends o
                        where o.sequence_id = NEW.sequence_id and o.id <> NEW.id
                          and case when NEW.lead_id is null then o.lead_id is null and o.contact_id = NEW.contact_id
                                   else o.lead_id = NEW.lead_id end
                          and o.state in ('planned', 'held', 'claimed', 'queued', 'drafted')) then
      update public.sequence_enrollments
         set state = 'left', why = left(coalesce(NEW.reason, NEW.state), 60), ended_at = now(), next_at = null
       where id = v_e.id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists sequence_sends_move_enrollment on public.sequence_sends;
create trigger sequence_sends_move_enrollment after insert or update of state on public.sequence_sends
  for each row execute function public.sequence_sends_move_enrollment();

-- Who is in each sequence now, from the sends already written: the person's latest send in it says where they stand.
insert into public.sequence_enrollments (tenant_id, sequence_id, contact_id, lead_id, state, place, sent_at, why,
                                         entered_at, moved_at, ended_at)
select x.tenant_id, x.sequence_id, x.contact_id, x.lead_id,
       case when x.state in ('sent', 'handed') then (case when x.has_next then 'in' else 'done' end)
            when x.state in ('skipped', 'failed') then 'left' else 'in' end,
       x.place, x.sent_at,
       case when x.state in ('skipped', 'failed') then left(coalesce(x.reason, x.state), 60) end,
       x.first_at, x.created_at,
       case when x.state in ('sent', 'handed') and not x.has_next then coalesce(x.sent_at, x.created_at)
            when x.state in ('skipped', 'failed') then x.created_at end
  from (
    select distinct on (s.sequence_id, coalesce(s.lead_id, s.contact_id))
           s.tenant_id, s.sequence_id, s.contact_id, s.lead_id, s.state, s.reason, s.sent_at, s.created_at, st.place,
           min(s.created_at) over (partition by s.sequence_id, coalesce(s.lead_id, s.contact_id)) as first_at,
           exists (select 1 from public.sequence_steps n where n.sequence_id = s.sequence_id and n.place = st.place + 1)
             as has_next
      from public.sequence_sends s
      join public.sequence_steps st on st.id = s.step_id
     order by s.sequence_id, coalesce(s.lead_id, s.contact_id), s.created_at desc, s.id desc
  ) x
 where not exists (select 1 from public.sequence_enrollments e where e.sequence_id = x.sequence_id
                     and coalesce(e.lead_id, e.contact_id) = coalesce(x.lead_id, x.contact_id));

/* ------------------------------------------------------------------- 4. what the loop reads and the leave door -- */

-- The running steps of one kind due at p_at by their workspace's own clock (playbooks_due's rule, over the steps): a
-- customer's step after the first only while its first step runs and its sequence is on.
create or replace function public.sequence_steps_due(p_kind text, p_at timestamptz, p_last_hour integer, p_limit integer,
                                                    p_tenant_id uuid default null)
returns table(step jsonb, timezone text, due_total bigint)
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(s), z.tz, count(*) over ()
    from public.sequence_steps s
    join public.sequence_steps r on r.id = s.sequence_id
    join public.sequences q on q.id = s.sequence_id
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where s.state = 'running' and s.kind = p_kind
     and (s.kind = 'reach_out' or (r.state = 'running' and q.state = 'on'))
     and t.status <> 'paused'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_steps_due(text, timestamptz, integer, integer, uuid) is
  'The running steps of one kind due at p_at by their workspace''s own clock, a paused workspace''s never, never run first, then least recently run, with due_total the count of all that were due: the hourly sweep''s pages (playbooks_due''s rule, 00245). A customer''s step after the first is due only while its sequence is on (0060).';

-- Who a customer's step after the first is due to on the business's day p_run_for: in its sequence, one step before it,
-- with their wait over by that day. What still holds of them (only_if) is the run's to judge, by its own reads.
create or replace function public.sequence_follow_ups_due(p_step_id uuid, p_run_for date)
returns table(enrollment_id uuid, contact_id uuid, sent_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.contact_id, e.sent_at
    from public.sequence_steps st
    join public.tenants t on t.id = st.tenant_id
    join public.sequence_enrollments e on e.sequence_id = st.sequence_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
   where st.id = p_step_id and st.kind = 'moment' and st.trigger = 'after_step'
     and e.state = 'in' and e.lead_id is null and e.contact_id is not null and e.place = st.place - 1
     and e.next_at is not null and (e.next_at at time zone z.tz)::date <= p_run_for
   order by e.next_at, e.id
$$;

comment on function public.sequence_follow_ups_due(uuid, date) is
  'D6: the people a customer''s step after the first is due to on the business''s day p_run_for, each with when their step before it went, oldest wait first. Service role only (0060).';

-- People taken out of a sequence: each still in it leaves with why (60 characters at most), and a send of theirs not yet
-- gone is skipped with the same reason. A member who did it is named. How many left.
create or replace function public.sequence_enrollments_leave(p_tenant_id uuid, p_ids uuid[], p_why text,
                                                            p_by uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_why text := left(nullif(btrim(coalesce(p_why, '')), ''), 60);
  v_n int;
begin
  if p_tenant_id is null or v_why is null or coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  with gone as (
    update public.sequence_enrollments e
       set state = 'left', why = v_why, ended_at = now(), next_at = null, left_by = p_by
     where e.tenant_id = p_tenant_id and e.id = any (p_ids) and e.state = 'in'
    returning e.sequence_id, e.contact_id, e.lead_id),
  skipped as (
    update public.sequence_sends s
       set state = 'skipped', reason = v_why
      from gone g
     where s.tenant_id = p_tenant_id and s.sequence_id = g.sequence_id
       and case when g.lead_id is null then s.lead_id is null and s.contact_id = g.contact_id
                else s.lead_id = g.lead_id end
       and s.state in ('planned', 'held', 'queued', 'drafted')
    returning s.id)
  select count(*) into v_n from gone;
  return v_n;
end $$;

comment on function public.sequence_enrollments_leave(uuid, uuid[], text, uuid) is
  'People taken out of a sequence (0060): each of p_ids still in it leaves with p_why, and a send of theirs not yet gone is skipped with it. p_by names the member who did it. Service role only: a member''s door writes its decision beside it.';

revoke all on function public.sequence_steps_take_new_words() from public, anon, authenticated;
revoke all on function public.sequence_sends_move_enrollment() from public, anon, authenticated;
revoke all on function public.sequence_steps_due(text, timestamptz, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.sequence_follow_ups_due(uuid, date) from public, anon, authenticated;
revoke all on function public.sequence_enrollments_leave(uuid, uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.sequence_steps_take_new_words() to service_role;
grant execute on function public.sequence_sends_move_enrollment() to service_role;
grant execute on function public.sequence_steps_due(text, timestamptz, integer, integer, uuid) to service_role;
grant execute on function public.sequence_follow_ups_due(uuid, date) to service_role;
grant execute on function public.sequence_enrollments_leave(uuid, uuid[], text, uuid) to service_role;

/* ------------------------------------------------- 5. the lead clock's three reads that hand back whole sends -- */

-- Each is its reach_out_ twin over sequence_sends, so the send it hands back carries the new names.
create or replace function public.sequence_queued_outcomes(p_limit integer, p_tenant_id uuid default null)
returns table(send jsonb, status text, error jsonb, sent_at text, written_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(s), m.status, m.error, m.meta->'status_at'->>'sent', m.created_at
    from public.sequence_sends s
    left join public.messages m on m.id = s.message_id
   where s.lead_id is not null and s.state = 'queued' and (p_tenant_id is null or s.tenant_id = p_tenant_id)
   order by (m.id is not null and (m.status = 'queued'
                                   or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))),
            s.updated_at
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_queued_outcomes(integer, uuid) is
  'A lead''s queued sends with what became of their emails, the ones with an outcome to read first (00186 reach_out_queued_outcomes over sequence_sends). Service role only (0060).';

create or replace function public.sequence_closed_sends(p_stuck_before timestamptz, p_limit integer,
                                                       p_tenant_id uuid default null)
returns table(send jsonb, email_status text)
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(s), m.status
    from public.sequence_sends s
    join public.sequence_batches b on b.id = s.batch_id
    left join public.messages m on m.id = s.message_id
   where s.lead_id is not null and b.state in ('canceled', 'failed')
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (s.state in ('planned', 'held', 'queued', 'drafted') or (s.state = 'claimed' and s.claimed_at < p_stuck_before))
   limit greatest(coalesce(p_limit, 0), 0)
$$;

comment on function public.sequence_closed_sends(timestamptz, integer, uuid) is
  'A lead''s open sends in canceled or failed batches, with their email''s state (00186 reach_out_closed_sends over sequence_sends). Service role only (0060).';

create or replace function public.sequence_unchecked(p_limit integer, p_per_workspace integer, p_ahead_minutes integer,
                                                    p_tenant_id uuid default null)
returns table(send jsonb, check_gen integer, template_id uuid, template_language text, signed_by text,
              included_for text[], business_name text, category text, city text, region text, rating numeric,
              reviews integer, website_host text, hours jsonb, about text, email text, why_it_fits text,
              what_you_asked text, site_listings integer, name_listings integer, email_domain_shared boolean,
              reviews_dist jsonb, claimed boolean)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if coalesce(p_limit, 0) <= 0 or coalesce(p_per_workspace, 0) <= 0 then
    return;
  end if;
  with candidates as (
    select s.id,
           row_number() over (partition by s.tenant_id
                              order by coalesce(s.check_after, s.created_at), s.send_at, s.id) as turn,
           coalesce(s.check_after, s.created_at) as waiting_since
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
      join public.sequence_steps p on p.id = s.step_id
      join public.sequence_steps r on r.id = s.sequence_id
     where s.lead_id is not null and s.state = 'planned' and s.checked_at is null
       and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       and (s.check_after is null or s.check_after <= now())
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
       and (b.state = 'pending_approval'
            or s.send_at <= now() + make_interval(mins => greatest(coalesce(p_ahead_minutes, 0), 0)))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  ), picked as (
    select c.id from candidates c
     where c.turn <= p_per_workspace
     order by c.turn, c.waiting_since, c.id
     limit p_limit
  ), locked as (
    select s.id from public.sequence_sends s
     where s.id in (select id from picked)
     for update of s skip locked
  ), leased as (
    update public.sequence_sends s
       set check_started_at = now()
      from locked
     where s.id = locked.id and s.state = 'planned' and s.checked_at is null
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from leased;

  return query
  select to_jsonb(s), s.check_gen, p.template_id, p.template_language, r.signed_by,
         array(select distinct x
                 from public.sequence_sends o, unnest(o.included_for) as x
                where o.tenant_id = s.tenant_id and o.sequence_id = s.sequence_id and o.lead_id = s.lead_id
                order by x),
         rec.business_name, rec.category, rec.city, rec.region, rec.rating, rec.reviews, rec.website_host,
         rec.hours, rec.about, rec.email, rec.why_it_fits, rec.what_you_asked,
         rec.site_listings, rec.name_listings, rec.email_domain_shared, rec.reviews_dist, rec.claimed
    from public.sequence_sends s
    join public.sequence_steps p on p.id = s.step_id
    join public.sequence_steps r on r.id = s.sequence_id
    cross join lateral public.reach_out_record(s.tenant_id, r.lead_search_id, s.lead_id) rec
   where s.id = any (v_ids)
   order by s.send_at, s.id;
end $$;

comment on function public.sequence_unchecked(integer, integer, integer, uuid) is
  'The sends to leads the check clock takes this tick, leased under their row locks, round-robin by workspace, each with its words'' step, the name its sequence signs with, the holds its owner included it past and its business''s record (00197 reach_out_unchecked over sequence_sends). Service role only (0060).';

revoke all on function public.sequence_queued_outcomes(integer, uuid) from public, anon, authenticated;
revoke all on function public.sequence_closed_sends(timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.sequence_unchecked(integer, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.sequence_queued_outcomes(integer, uuid) to service_role;
grant execute on function public.sequence_closed_sends(timestamptz, integer, uuid) to service_role;
grant execute on function public.sequence_unchecked(integer, integer, integer, uuid) to service_role;
