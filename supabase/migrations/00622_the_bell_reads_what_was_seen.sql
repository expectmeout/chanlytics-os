-- 00622 · The bell reads what was seen (decision 0124, amended: the review of its first stage, 12 Nov 2026).
--
-- Three things the first stage left.
--
-- Mark all read read every note up to the moment of the press, the one that arrived a second before and was not on
-- the screen yet among them. notifications_read_through takes the moment the bell had listed up to, and a third
-- argument, p_read, that says the moment is a read: everything up to it is read, never past now and never back (a tab
-- that listed less than another device has read moves nothing but the look), it is a look (seen_at now), and it answers
-- the moment the member stood at before (was), which is what an Undo hands back. A moment without p_read is that Undo,
-- as it was: back to it, never forward. No moment is a read up to now, as it was. The build live before this sends
-- those two, by name, so it runs unchanged on this database.
--
-- A member's bell starts when they join. A seat had no row in notification_reads until its first look, so every note
-- of the bell's thirty days was new to a teammate who joined yesterday, and after that first look every one of them
-- wore a dot (00614: a look reads nothing). memberships_start_the_bell makes the row as the seat is made, both moments
-- at the seat's own created_at. A member who comes back has a row already: its moments move up to the new seat's where
-- they are earlier, so what happened while they were away is not theirs to read, and what they read past it is kept.
-- It never stops a seat from being made: a failure is a warning.
--
-- The seats made in the last thirty days are given the same: a row where they have none, and moments no earlier than
-- the seat. An older seat is left as it is: every note the bell holds is after it joined.
--
-- Deploy order: this migration before the build that sends the moment with Mark all read (PUT notifications
-- { read_all, read_through }): a database before it has no door of three arguments, and refuses that press.
-- Re-runnable: the door of two arguments is dropped where it still stands, the function and the trigger are replaced,
-- and a seat whose row stands at or past its own moment is passed over.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------------- the door -- */

-- One door by this name: PostgREST cannot choose between two, so the door of two arguments goes as the door of three
-- is made, in this one transaction. A call that names one or two arguments reaches the new door by its defaults.
drop function if exists public.notifications_read_through(uuid, timestamptz);

create or replace function public.notifications_read_through(
  p_tenant_id uuid,
  p_through timestamptz default null,
  p_read boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now  timestamptz := now();
  v_was  timestamptz;
  v_to   timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select r.read_through_at into v_was from notification_reads r
   where r.tenant_id = p_tenant_id and r.user_id = v_user for update;
  if not found then
    -- A seat from before this migration that never looked: it stands where it joined.
    select m.created_at into v_was from memberships m where m.user_id = v_user and m.tenant_id = p_tenant_id;
    insert into notification_reads (tenant_id, user_id, seen_at, read_through_at)
    values (p_tenant_id, v_user, v_was, v_was)
    on conflict (tenant_id, user_id) do nothing;
  end if;
  -- Never past now: a browser whose clock runs ahead reads nothing that has not happened yet.
  v_to := least(coalesce(p_through, v_now), v_now);
  if p_through is null or coalesce(p_read, false) then
    -- A read: everything up to the moment is read, and looked at. Never back: a tab that listed less than another
    -- device has read leaves what that device read as it is.
    v_to := greatest(v_to, v_was);
    update notification_reads set read_through_at = v_to, seen_at = v_now
     where tenant_id = p_tenant_id and user_id = v_user;
    return jsonb_build_object('tenant_id', p_tenant_id, 'seen_at', v_now, 'read_through_at', v_to, 'was', v_was);
  end if;
  if v_to < v_was then
    -- Its Undo: back to the moment it stood at. The look stays.
    update notification_reads set read_through_at = v_to
     where tenant_id = p_tenant_id and user_id = v_user;
    return jsonb_build_object('tenant_id', p_tenant_id, 'read_through_at', v_to);
  end if;
  -- An Undo never goes forward.
  return jsonb_build_object('tenant_id', p_tenant_id, 'read_through_at', v_was, 'unchanged', true);
end $$;

revoke execute on function public.notifications_read_through(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.notifications_read_through(uuid, timestamptz, boolean) to authenticated, service_role;

comment on function public.notifications_read_through(uuid, timestamptz, boolean) is
  'A member reads their bell through (00614, 00622, decision 0124). No moment: Mark all read up to now. A moment with p_read: a read up to it, never past now and never back, with seen_at now and the moment they stood at answered as was. A moment without p_read: its Undo, read_through_at back to it and never forward, the look left. The caller''s own row alone; any member of the workspace.';

/* -------------------------------------------------------------------------------------------- where it starts -- */

create or replace function public.memberships_start_the_bell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into notification_reads (tenant_id, user_id, seen_at, read_through_at)
    values (new.tenant_id, new.user_id, new.created_at, new.created_at)
    on conflict (tenant_id, user_id) do update
      set seen_at = greatest(notification_reads.seen_at, excluded.seen_at),
          read_through_at = greatest(notification_reads.read_through_at, excluded.read_through_at);
  exception when others then
    -- The seat is made whatever becomes of its bell: without the row the member's first look finds every note unread.
    raise warning 'memberships_start_the_bell: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end $$;

revoke execute on function public.memberships_start_the_bell() from public, anon, authenticated;

comment on function public.memberships_start_the_bell() is
  'A member''s bell starts when they join (00622, decision 0124): their row in notification_reads, both moments at the seat''s created_at, so nothing from before is new or unread to them. A member who comes back starts again from the new seat, and keeps what they read past it. It never stops a seat from being made.';

drop trigger if exists memberships_start_the_bell on public.memberships;
create trigger memberships_start_the_bell
  after insert on public.memberships
  for each row execute function public.memberships_start_the_bell();

-- The seats made in the bell's thirty days: one that never looked stands where it joined, and one whose row is from
-- before the seat (a member who came back) is moved up to it. A row at or past its seat is not touched.
insert into public.notification_reads (tenant_id, user_id, seen_at, read_through_at)
select m.tenant_id, m.user_id, m.created_at, m.created_at
  from public.memberships m
 where m.created_at > now() - interval '30 days'
on conflict (tenant_id, user_id) do update
  set seen_at = greatest(notification_reads.seen_at, excluded.seen_at),
      read_through_at = greatest(notification_reads.read_through_at, excluded.read_through_at)
  where notification_reads.seen_at < excluded.seen_at
     or notification_reads.read_through_at < excluded.read_through_at;
