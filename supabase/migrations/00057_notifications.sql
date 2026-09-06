-- 00057 · Notifications that last.
--
-- The bell was computed in the browser from whatever surfaces it had loaded,
-- with read state in one device's storage, and every alert the edge raised
-- went out as an email and was gone. Now each alert is a row the workspace
-- keeps: what happened, where to go, who has seen it. The bell reads it,
-- read state follows the person across devices, and a phone can be told
-- later from the same rows. Email stays exactly as it was.
--
-- Written by the edge with the service role; members read their
-- workspace's rows; each member keeps their own seen mark and per-row marks
-- through two definer doors. Ninety days, then purged.

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  kind          text not null check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert')),
  title         text not null check (char_length(title) between 1 and 200),
  body          text not null check (char_length(body) <= 4000),
  -- A hash route without the leading "#/", or null when there is nowhere to go.
  route         text,
  subject_type  text,
  subject_id    text,
  created_at    timestamptz not null default now()
);
create index notifications_tenant_created on public.notifications (tenant_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_member_select on public.notifications
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.notifications is
  'What needed the workspace''s attention, kept: each alert the edge raised, where to go, when. Members read; the edge writes.';

create table public.notification_reads (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id   uuid not null,
  seen_at   timestamptz not null default 'epoch',
  primary key (tenant_id, user_id)
);
alter table public.notification_reads enable row level security;
create policy notification_reads_own_select on public.notification_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create table public.notification_marks (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  primary key (notification_id, user_id)
);
alter table public.notification_marks enable row level security;
create policy notification_marks_own_select on public.notification_marks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- "Mark all read": this person, this workspace, now. Any member — a viewer has a bell too.
create or replace function public.notifications_seen(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  insert into notification_reads (tenant_id, user_id, seen_at) values (p_tenant_id, v_user, now())
  on conflict (tenant_id, user_id) do update set seen_at = now();
  return jsonb_build_object('tenant_id', p_tenant_id, 'seen_at', now());
end $$;
revoke execute on function public.notifications_seen(uuid) from public, anon;
grant execute on function public.notifications_seen(uuid) to authenticated;

-- One row's marks for this person: true sets, false clears, null keeps.
create or replace function public.notification_mark(p_id uuid, p_read boolean default null, p_dismissed boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select n.tenant_id into v_tenant from notifications n where n.id = p_id;
  if v_tenant is null or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = v_tenant) then
    raise exception 'Notification not found.' using errcode = 'P0002';
  end if;
  insert into notification_marks (notification_id, user_id, read_at, dismissed_at)
  values (p_id, v_user, case when p_read then now() end, case when p_dismissed then now() end)
  on conflict (notification_id, user_id) do update set
    read_at      = case when p_read is null then notification_marks.read_at      when p_read then coalesce(notification_marks.read_at, now()) else null end,
    dismissed_at = case when p_dismissed is null then notification_marks.dismissed_at when p_dismissed then coalesce(notification_marks.dismissed_at, now()) else null end;
  return jsonb_build_object('notification_id', p_id);
end $$;
revoke execute on function public.notification_mark(uuid, boolean, boolean) from public, anon;
grant execute on function public.notification_mark(uuid, boolean, boolean) to authenticated;

-- Ninety days is a season of alerts; older rows and their marks go.
create or replace function public.purge_notifications(p_keep interval default '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  delete from notifications where created_at < now() - p_keep;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.purge_notifications(interval) from public, anon, authenticated;
select cron.schedule('purge-notifications', '41 4 * * *', $$select public.purge_notifications()$$);

-- The bell repaints as rows land.
alter publication supabase_realtime add table public.notifications;
