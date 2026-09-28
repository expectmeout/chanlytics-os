-- 00239 · A person's moments are kept.
--
-- Decision 0021, step 1 (docs/decisions/0021-people-are-paged-by-a-moment-the-database-keeps.md). People orders its
-- list by when each person was last in touch, and people_list (00170) works that out for everyone in the workspace,
-- from every message and call they ever had, before it keeps one page. The moments are now kept: one narrow row per
-- person, moved by the statements that move them, in their own transaction. Nothing reads the table yet; step 2 takes
-- People's page from it, and step 4 Today's new people.
--
--   person_moments            one row per person: when they were last in touch (the list's order), when they first
--                             got in touch and whether a history was moved in (who is new). Members read it; only
--                             the triggers and the fill write it.
--   message_moment            when a message happened, whether it was spoken, and whether it came in with a history
--                             moved in, as people_list's `ev` says (00170): the one statement of the three, which the
--                             triggers read through, and step 2's people_list will. One call answers all three: each
--                             call of a function with its search_path pinned costs as much as the rest of the write. It
--                             takes the message's columns, not its row: a function of a table's row is a column
--                             PostgREST serves, and the generated types give messages one.
--   person_moments_of         a person's moments worked out from their rows, the one statement of them.
--   person_moments_recompute  those moments written, under the person's lock: a write in flight is read, or moves the
--                             moments after, from what this wrote.
--   the triggers              an insert on contacts makes the row. On messages and on calls, one statement trigger
--                             per event reads the rows the statement changed (a transition table takes one event per
--                             trigger). A new spoken message or connected call moves the moments by greatest and
--                             least, so two statements for one person, in either order, leave the same row. What can
--                             move them back (a sent reply that fails, a message moved to another person, a delete, a
--                             call that stops counting or moves) recomputes the people it touched. A receipt, and a
--                             call's summary, change nothing the moments read, and pass.
--   person_moments_fill       one batch of the fill, for tooling/scripts/person-moments-fill.mjs.
--   person_moments_check      a workspace's kept moments against its rows, paged as the fill is: each person whole,
--                             missing or differing.
--
-- The fill runs after this file, from the script, in batches of a few hundred people, each its own transaction. Until
-- it has run over a workspace, a person with no row, or a row a trigger began, is not whole: person_moments_check says
-- who, and step 2 reads the table only once it finds every workspace whole.
--
-- Creating a trigger on messages, calls and contacts takes a lock that stops their writes until this file commits,
-- so the same lock guard as 00140 and 00142. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the table -- */

create table if not exists public.person_moments (
  contact_id    uuid primary key references public.contacts (id) on delete cascade,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- The person's created_at: the order's second key. It never changes.
  added_at      timestamptz not null,
  -- Their last spoken message (people_list's lm.at) and their last connected call's start (lk.last_at).
  last_word_at  timestamptz,
  last_call_at  timestamptz,
  -- Their first spoken message (ma.first_at) and their first connected call's start (lk.first_at).
  first_word_at timestamptz,
  first_call_at timestamptz,
  -- Their first message or connected call written (earliest_row_at).
  first_row_at  timestamptz,
  -- A history moved in (has_backfill).
  moved_in      boolean not null default false,
  -- The list's order. -infinity puts the people nobody has heard from last, as `nulls last` does today, and lets the
  -- order compare as one row.
  in_touch_at   timestamptz not null generated always as
                  (coalesce(greatest(last_word_at, last_call_at), '-infinity'::timestamptz)) stored,
  -- When they became new: their first contact, else their first row; never, for a history moved in.
  new_at        timestamptz generated always as
                  (case when not moved_in then coalesce(least(first_word_at, first_call_at), first_row_at) end) stored
);

create index if not exists person_moments_order
  on public.person_moments (tenant_id, in_touch_at desc, added_at desc, contact_id desc);
create index if not exists person_moments_new
  on public.person_moments (tenant_id, new_at) where new_at is not null;

alter table public.person_moments enable row level security;
-- Members read their workspace's moments (the 00002 shape); nobody signed in writes one. Every write is a trigger or
-- the fill below.
drop policy if exists person_moments_member_select on public.person_moments;
create policy person_moments_member_select on public.person_moments
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.person_moments from anon, authenticated;
grant select on public.person_moments to authenticated;
grant all on public.person_moments to service_role;
comment on table public.person_moments is
  'Each person''s moments, kept as their messages and calls are written (0021): when they were last in touch, which orders People, and when they first got in touch, which says who is new. Written only by the triggers on contacts, messages and calls, and by the fill.';

/* ---------------------------------------------------- 2. a message's moment -- */

create or replace function public.message_moment(
  p_meta jsonb, p_channel_ts timestamptz, p_created_at timestamptz, p_type text, p_status text,
  out at timestamptz, out spoken boolean, out moved_in boolean
)
language plpgsql
immutable
set search_path = public
as $$
begin
  -- A history moved in (meta.backfill) keeps the time the provider gave it, or none; anything else, when the provider
  -- says, else when it was written.
  moved_in := coalesce(p_meta->>'backfill', 'false') = 'true';
  at := case when moved_in then p_channel_ts else coalesce(p_channel_ts, p_created_at) end;
  -- Something the customer actually saw or said. A reply still in its cancel window, a canceled or failed send, an
  -- internal note and a call's own summary row are not a word in the thread.
  spoken := p_type in ('text', 'template', 'media') and p_status not in ('queued', 'canceled', 'failed');
end $$;

revoke execute on function public.message_moment(jsonb, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.message_moment(jsonb, timestamptz, timestamptz, text, text) to authenticated, service_role;
comment on function public.message_moment(jsonb, timestamptz, timestamptz, text, text) is
  'When a message happened, whether it was spoken, and whether it came in with a history moved in, from its meta, channel_ts, created_at, type and status: people_list''s ev (00170) in one place. Its columns, not its row: a function of a table''s row is a column PostgREST serves.';

/* ------------------------------------------------ 3. a person's moments -- */

create or replace function public.person_moments_of(p_contacts uuid[])
returns table (
  contact_id uuid, tenant_id uuid, added_at timestamptz,
  last_word_at timestamptz, last_call_at timestamptz, first_word_at timestamptz, first_call_at timestamptz,
  first_row_at timestamptz, moved_in boolean
)
language sql
stable
set search_path = public
as $$
  select c.id, c.tenant_id, c.created_at,
         mm.last_word_at, kk.last_call_at, mm.first_word_at, kk.first_call_at,
         least(mm.first_row_at, kk.first_row_at),
         coalesce(mm.moved_in, false)
    from public.contacts c
    left join lateral (
      select max(e.at) filter (where e.spoken) as last_word_at,
             min(e.at) filter (where e.spoken) as first_word_at,
             min(m.created_at) as first_row_at,
             bool_or(e.moved_in) as moved_in
        from public.messages m
        cross join lateral public.message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
       where m.contact_id = c.id
    ) mm on true
    left join lateral (
      select max(k.started_at) as last_call_at,
             min(k.started_at) as first_call_at,
             min(k.created_at) as first_row_at
        from public.calls k
       where k.contact_id = c.id
         and k.status <> 'not_connected'
    ) kk on true
   where c.id = any(p_contacts)
$$;

create or replace function public.person_moments_recompute(p_contacts uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_contacts is null or cardinality(p_contacts) = 0 then
    return 0;
  end if;
  -- Each person's row, then its lock, then their moments from their rows, each its own statement. A write in flight
  -- for one of them either committed before the lock was taken, and is read here, or waits for it, and moves the
  -- moments after, from what this wrote. The locks are taken in one order, so two recomputes never wait on each other
  -- in a circle.
  insert into public.person_moments (contact_id, tenant_id, added_at)
  select c.id, c.tenant_id, c.created_at
    from public.contacts c
   where c.id = any(p_contacts)
   order by c.id
  on conflict (contact_id) do nothing;
  perform 1 from public.person_moments pm where pm.contact_id = any(p_contacts) order by pm.contact_id for update;
  update public.person_moments pm
     set last_word_at = o.last_word_at,
         last_call_at = o.last_call_at,
         first_word_at = o.first_word_at,
         first_call_at = o.first_call_at,
         first_row_at = o.first_row_at,
         moved_in = o.moved_in
    from public.person_moments_of(p_contacts) o
   where pm.contact_id = o.contact_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.person_moments_of(uuid[]) from public, anon, authenticated;
revoke execute on function public.person_moments_recompute(uuid[]) from public, anon, authenticated;
grant execute on function public.person_moments_of(uuid[]) to service_role;
grant execute on function public.person_moments_recompute(uuid[]) to service_role;
comment on function public.person_moments_of(uuid[]) is
  'Each person''s moments worked out from their messages and connected calls, as people_list reads them (00170).';
comment on function public.person_moments_recompute(uuid[]) is
  'Writes each person''s moments from their rows, under the person''s lock; answers how many were written.';

/* -------------------------------------------------------- 4. the triggers -- */

-- A new person has a row, with no moments.
create or replace function public.person_moments_contacts_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.person_moments (contact_id, tenant_id, added_at)
  select n.id, n.tenant_id, n.created_at
    from new_rows n
   order by n.id
  on conflict (contact_id) do nothing;
  return null;
end $$;

-- New messages move their people's moments forward: the latest word later, the first word and the first row earlier,
-- and a history moved in stays moved in.
create or replace function public.person_moments_messages_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.person_moments as pm
         (contact_id, tenant_id, added_at, last_word_at, first_word_at, first_row_at, moved_in)
  select c.id, c.tenant_id, c.created_at, n.last_word_at, n.first_word_at, n.first_row_at, n.moved_in
    from (
      select x.contact_id,
             max(e.at) filter (where e.spoken) as last_word_at,
             min(e.at) filter (where e.spoken) as first_word_at,
             min(x.created_at) as first_row_at,
             bool_or(e.moved_in) as moved_in
        from new_rows x
        cross join lateral public.message_moment(x.meta, x.channel_ts, x.created_at, x.type, x.status) e
       where x.contact_id is not null
       group by x.contact_id
    ) n
    join public.contacts c on c.id = n.contact_id
   order by c.id
  on conflict (contact_id) do update
     set last_word_at = greatest(pm.last_word_at, excluded.last_word_at),
         first_word_at = least(pm.first_word_at, excluded.first_word_at),
         first_row_at = least(pm.first_row_at, excluded.first_row_at),
         moved_in = pm.moved_in or excluded.moved_in;
  return null;
end $$;

-- A changed message. Becoming spoken (a queued reply sent; an email whose outcome came back) moves the moments forward,
-- as a new message does. What can move them back recomputes the people it touched: a message that stops being spoken
-- (a sent reply that fails), one that moves to another person, and one whose moment or history changes. Anything else
-- (a receipt, a status's time in meta) moves nothing, and passes.
create or replace function public.person_moments_messages_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_back    uuid[];
  v_people  uuid[];
  v_at      timestamptz[];
begin
  -- One pass over the statement's rows: the people to recompute, and the words that became spoken.
  select coalesce(array_agg(distinct b.contact_id order by b.contact_id) filter (where b.contact_id is not null), '{}'),
         coalesce(array_agg(f.contact_id order by f.contact_id) filter (where f.contact_id is not null), '{}'),
         coalesce(array_agg(f.at order by f.contact_id) filter (where f.contact_id is not null), '{}')
    into v_back, v_people, v_at
    from old_rows o
    join new_rows n on n.id = o.id
    cross join lateral public.message_moment(o.meta, o.channel_ts, o.created_at, o.type, o.status) eo
    cross join lateral public.message_moment(n.meta, n.channel_ts, n.created_at, n.type, n.status) en
    cross join lateral (
      select o.contact_id is distinct from n.contact_id
             or (eo.spoken and not en.spoken)
             or eo.at is distinct from en.at
             or eo.moved_in is distinct from en.moved_in as back
    ) w
    left join lateral (values (o.contact_id), (n.contact_id)) b (contact_id) on w.back
    left join lateral (select n.contact_id, en.at) f (contact_id, at)
      on not w.back and not eo.spoken and en.spoken;
  if cardinality(v_people) > 0 then
    insert into public.person_moments as pm (contact_id, tenant_id, added_at, last_word_at, first_word_at)
    select c.id, c.tenant_id, c.created_at, s.last_word_at, s.first_word_at
      from (
        select u.contact_id, max(u.at) as last_word_at, min(u.at) as first_word_at
          from unnest(v_people, v_at) u (contact_id, at)
         where not (u.contact_id = any(v_back))
         group by u.contact_id
      ) s
      join public.contacts c on c.id = s.contact_id
     order by c.id
    on conflict (contact_id) do update
       set last_word_at = greatest(pm.last_word_at, excluded.last_word_at),
           first_word_at = least(pm.first_word_at, excluded.first_word_at);
  end if;
  if cardinality(v_back) > 0 then
    perform public.person_moments_recompute(v_back);
  end if;
  return null;
end $$;

-- Deleted messages (an erasure, a thread removed with its messages) recompute their people.
create or replace function public.person_moments_messages_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_back uuid[];
begin
  v_back := array(select distinct o.contact_id from old_rows o where o.contact_id is not null order by 1);
  if cardinality(v_back) > 0 then
    perform public.person_moments_recompute(v_back);
  end if;
  return null;
end $$;

-- New connected calls move their people's moments forward, as new messages do.
create or replace function public.person_moments_calls_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.person_moments as pm
         (contact_id, tenant_id, added_at, last_call_at, first_call_at, first_row_at)
  select c.id, c.tenant_id, c.created_at, n.last_call_at, n.first_call_at, n.first_row_at
    from (
      select k.contact_id,
             max(k.started_at) as last_call_at,
             min(k.started_at) as first_call_at,
             min(k.created_at) as first_row_at
        from new_rows k
       where k.contact_id is not null
         and k.status <> 'not_connected'
       group by k.contact_id
    ) n
    join public.contacts c on c.id = n.contact_id
   order by c.id
  on conflict (contact_id) do update
     set last_call_at = greatest(pm.last_call_at, excluded.last_call_at),
         first_call_at = least(pm.first_call_at, excluded.first_call_at),
         first_row_at = least(pm.first_row_at, excluded.first_row_at);
  return null;
end $$;

-- A changed call recomputes its people when what the moments read changed: whether it counts, when it started, when
-- it was written, or whose it is. Its lifecycle's other writes (a summary, a recording, a cost) pass.
create or replace function public.person_moments_calls_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.person_moments_recompute(array(
    select distinct x.contact_id
      from (
        select o.contact_id as a, n.contact_id as b
          from old_rows o
          join new_rows n on n.id = o.id
         where o.contact_id is distinct from n.contact_id
            or (o.status = 'not_connected') is distinct from (n.status = 'not_connected')
            or o.started_at is distinct from n.started_at
            or o.created_at is distinct from n.created_at
      ) p
      cross join lateral (values (p.a), (p.b)) x (contact_id)
     where x.contact_id is not null
     order by 1
  ));
  return null;
end $$;

-- Deleted calls recompute their people.
create or replace function public.person_moments_calls_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_back uuid[];
begin
  v_back := array(select distinct o.contact_id from old_rows o where o.contact_id is not null order by 1);
  if cardinality(v_back) > 0 then
    perform public.person_moments_recompute(v_back);
  end if;
  return null;
end $$;

revoke execute on function public.person_moments_contacts_added() from public, anon, authenticated;
revoke execute on function public.person_moments_messages_added() from public, anon, authenticated;
revoke execute on function public.person_moments_messages_changed() from public, anon, authenticated;
revoke execute on function public.person_moments_messages_removed() from public, anon, authenticated;
revoke execute on function public.person_moments_calls_added() from public, anon, authenticated;
revoke execute on function public.person_moments_calls_changed() from public, anon, authenticated;
revoke execute on function public.person_moments_calls_removed() from public, anon, authenticated;

drop trigger if exists person_moments_added on public.contacts;
create trigger person_moments_added after insert on public.contacts
  referencing new table as new_rows
  for each statement execute function public.person_moments_contacts_added();

drop trigger if exists person_moments_added on public.messages;
create trigger person_moments_added after insert on public.messages
  referencing new table as new_rows
  for each statement execute function public.person_moments_messages_added();
drop trigger if exists person_moments_changed on public.messages;
create trigger person_moments_changed after update on public.messages
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.person_moments_messages_changed();
drop trigger if exists person_moments_removed on public.messages;
create trigger person_moments_removed after delete on public.messages
  referencing old table as old_rows
  for each statement execute function public.person_moments_messages_removed();

drop trigger if exists person_moments_added on public.calls;
create trigger person_moments_added after insert on public.calls
  referencing new table as new_rows
  for each statement execute function public.person_moments_calls_added();
drop trigger if exists person_moments_changed on public.calls;
create trigger person_moments_changed after update on public.calls
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.person_moments_calls_changed();
drop trigger if exists person_moments_removed on public.calls;
create trigger person_moments_removed after delete on public.calls
  referencing old table as old_rows
  for each statement execute function public.person_moments_calls_removed();

/* ------------------------------------------------- 5. the fill, the check -- */

create or replace function public.person_moments_fill(p_tenant_id uuid, p_after uuid, p_limit integer)
returns table (filled integer, last_contact_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid[];
begin
  if p_tenant_id is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'a batch is one workspace''s next 1 to 1,000 people' using errcode = '22023';
  end if;
  select coalesce(array_agg(b.id order by b.id), '{}')
    into v_batch
    from (
      select c.id
        from public.contacts c
       where c.tenant_id = p_tenant_id
         and (p_after is null or c.id > p_after)
       order by c.id
       limit p_limit
    ) b;
  filled := public.person_moments_recompute(v_batch);
  last_contact_id := v_batch[cardinality(v_batch)];
  return next;
end $$;

create or replace function public.person_moments_check(p_tenant_id uuid, p_after uuid default null, p_limit integer default null)
returns table (contact_id uuid, what text)
language sql
stable
security definer
set search_path = public
as $$
  -- The workspace's people after p_after, by id, at most p_limit of them (all, when null), each whole, missing or
  -- differing: paged as the fill is, so a workspace of any size is checked a batch at a time, and the batch's last
  -- person says where the next begins.
  with people as (
    select c.id
      from public.contacts c
     where c.tenant_id = p_tenant_id
       and (p_after is null or c.id > p_after)
     order by c.id
     limit p_limit
  )
  select d.contact_id,
         case when k.contact_id is null then 'missing'
              when (d.last_word_at, d.last_call_at, d.first_word_at, d.first_call_at, d.first_row_at, d.moved_in, d.added_at)
                   is distinct from
                   (k.last_word_at, k.last_call_at, k.first_word_at, k.first_call_at, k.first_row_at, k.moved_in, k.added_at)
                then 'differs'
              else 'whole' end
    from public.person_moments_of(array(select pe.id from people pe)) d
    left join public.person_moments k on k.contact_id = d.contact_id
   order by 1
$$;

revoke execute on function public.person_moments_fill(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.person_moments_check(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.person_moments_fill(uuid, uuid, integer) to service_role;
grant execute on function public.person_moments_check(uuid, uuid, integer) to service_role;
comment on function public.person_moments_fill(uuid, uuid, integer) is
  'One batch of the fill: a workspace''s next people after p_after, by id, written from their rows. Answers how many, and the last one, for the next batch to start after.';
comment on function public.person_moments_check(uuid, uuid, integer) is
  'A workspace''s kept moments against its rows, its people after p_after by id, at most p_limit (all, when null): each person whole, missing (no row), or differing from what their rows say.';
