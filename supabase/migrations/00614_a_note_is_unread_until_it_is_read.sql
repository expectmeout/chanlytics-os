-- 00614 · A note is unread until it is read (decision 0124, the bell's stage 1).
--
-- A member's bell kept one moment, notification_reads.seen_at: when they last looked. It answered two questions at once,
-- what is new since they looked (the bell's number) and what they have read (a row's dot), and both closing the bell and
-- Mark all read wrote it. So a look read everything: the dots went, and Mark all read with them, without a press.
--
-- A second moment beside it, read_through_at, is how far the member has read. Mark all read moves it (and seen_at with
-- it, since reading everything is also a look); a look moves seen_at alone, through notifications_seen as before. A row
-- newer than read_through_at with no read mark of the member's wears its dot. The number is counted as it was, from
-- seen_at (contracts unreadFor): the phone's icon, a push's badge and Today's Since you looked read what they read.
--
-- Each member starts where they stand: read_through_at takes their seen_at, so nothing a look had read lights up again.
--
-- notifications_read_through is the member's own door, as notifications_seen is. With no moment it is Mark all read, and
-- answers the moment it stood at before, which is what an Undo hands back. With a moment it is that Undo: it moves
-- read_through_at back to it, never forward.
--
-- Deploy order: this migration before the build that reads the column (GET notifications selects it). The build before
-- it runs unchanged on this database: it neither reads the column nor calls the door.
-- Re-runnable: the starting update runs only while no member has read through yet, so a second run moves nothing.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------------ the moment -- */

-- A constant default: no row is rewritten by the column itself.
alter table public.notification_reads
  add column if not exists read_through_at timestamptz not null default '1970-01-01 00:00:00+00';

comment on column public.notification_reads.read_through_at is
  'How far this member has read their bell (00614, decision 0124): Mark all read moves it, a look does not. A row newer than it with no read mark of theirs is unread. Never later than seen_at.';

-- Where each member stands: what a look had read stays read. Only while nobody has a read-through moment yet, which is
-- the first run: once one has, the same update would read everything for whoever has looked since.
update public.notification_reads set read_through_at = seen_at
 where read_through_at < seen_at
   and not exists (select 1 from public.notification_reads r where r.read_through_at > '1970-01-01 00:00:00+00');

/* -------------------------------------------------------------------------------------------------- the door -- */

create or replace function public.notifications_read_through(p_tenant_id uuid, p_through timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_now  timestamptz := now();
  v_was  timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select r.read_through_at into v_was from notification_reads r
   where r.tenant_id = p_tenant_id and r.user_id = v_user for update;
  if p_through is null then
    -- Mark all read: everything up to now is read, and looked at.
    insert into notification_reads (tenant_id, user_id, seen_at, read_through_at)
    values (p_tenant_id, v_user, v_now, v_now)
    on conflict (tenant_id, user_id) do update set seen_at = v_now, read_through_at = v_now;
    return jsonb_build_object('tenant_id', p_tenant_id, 'seen_at', v_now, 'read_through_at', v_now,
                              'was', coalesce(v_was, '1970-01-01 00:00:00+00'::timestamptz));
  end if;
  -- Undo: back to the moment it stood at. Never forward, and nothing to move for a member who never read through.
  if v_was is null or p_through >= v_was then
    return jsonb_build_object('tenant_id', p_tenant_id,
                              'read_through_at', coalesce(v_was, '1970-01-01 00:00:00+00'::timestamptz),
                              'unchanged', true);
  end if;
  update notification_reads set read_through_at = p_through
   where tenant_id = p_tenant_id and user_id = v_user;
  return jsonb_build_object('tenant_id', p_tenant_id, 'read_through_at', p_through);
end $$;

revoke execute on function public.notifications_read_through(uuid, timestamptz) from public, anon;
grant execute on function public.notifications_read_through(uuid, timestamptz) to authenticated, service_role;

comment on function public.notifications_read_through(uuid, timestamptz) is
  'A member reads their bell through (00614, decision 0124). With no moment: Mark all read, read_through_at and seen_at both now, and the moment it stood at before answered as was. With a moment: its Undo, read_through_at back to it, never forward. The caller''s own row alone; any member of the workspace.';
