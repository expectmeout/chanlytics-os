-- Ask: the workspace assistant's threads.
--
-- A thread belongs to one person in one workspace and to nobody else: the
-- questions an owner asks about their customers are theirs, and a teammate
-- reading them would be reading over a shoulder. RLS is the door — the
-- session client writes and reads its own rows and never another member's —
-- and the tenant column keeps every row inside a workspace the person
-- actually belongs to.
--
-- Ask messages quote customers, so they have a shelf life: ninety days, then
-- gone, the same way the evidence rows go (00038). And when a person is
-- erased, the Ask turns that mention them go too — for every member of the
-- workspace, not just the owner who pressed Erase, which is why that scrub is
-- a definer function rather than a delete the session client could not reach.

create table public.ask_threads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default '',
  scope       jsonb,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now()
);
create index ask_threads_user_recent on public.ask_threads (user_id, tenant_id, last_at desc);

create table public.ask_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.ask_threads (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index ask_messages_thread on public.ask_messages (thread_id, created_at);
create index ask_messages_tenant on public.ask_messages (tenant_id, created_at);

alter table public.ask_threads enable row level security;
alter table public.ask_messages enable row level security;

-- Own rows, inside a workspace the person belongs to. The membership check is
-- on the write side only: a row that exists already passed it, and a member
-- who has since been removed loses the workspace, not the memory of asking.
create policy ask_threads_own_select on public.ask_threads
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy ask_threads_own_insert on public.ask_threads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.memberships m
                 where m.user_id = (select auth.uid()) and m.tenant_id = ask_threads.tenant_id)
  );
create policy ask_threads_own_update on public.ask_threads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy ask_threads_own_delete on public.ask_threads
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy ask_messages_own_select on public.ask_messages
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy ask_messages_own_insert on public.ask_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.ask_threads t
                 where t.id = ask_messages.thread_id
                   and t.user_id = (select auth.uid())
                   and t.tenant_id = ask_messages.tenant_id)
  );
create policy ask_messages_own_delete on public.ask_messages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Column-scoped grants, per 00037: a session client may move a thread's
-- title, scope and last_at and nothing else; a message is written once.
grant select, insert, delete on public.ask_threads to authenticated;
grant update (title, scope, last_at) on public.ask_threads to authenticated;
grant select, insert, delete on public.ask_messages to authenticated;

-- Ninety days, then gone. Deleting the thread cascades to its messages.
create or replace function public.purge_ask(p_keep interval default '90 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.ask_threads where last_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.purge_ask(interval) from public, anon, authenticated;
comment on function public.purge_ask(interval) is
  'Drops Ask threads (and their messages) untouched for longer than p_keep (default 90 days). Ask messages quote customers; they are not the record.';

select cron.unschedule('purge-ask') where exists (select 1 from cron.job where jobname = 'purge-ask');
select cron.schedule('purge-ask', '37 4 * * *', $$select public.purge_ask()$$);

-- The erase hook. An owner erasing a person takes every Ask turn in the
-- workspace that names that person's id or phone with it — across members,
-- which the session client's own-rows door cannot reach, so this runs as the
-- definer and checks the owner role itself.
create or replace function public.scrub_ask_for_contact(p_tenant_id uuid, p_contact_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n integer := 0;
  v_needle text;
begin
  if not exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id and m.role = 'owner'
  ) then
    raise exception 'scrub_ask_for_contact: owner role required';
  end if;
  delete from public.ask_messages
   where tenant_id = p_tenant_id
     and content::text like '%' || p_contact_id::text || '%';
  get diagnostics v_count = row_count;
  foreach v_needle in array coalesce(p_needles, '{}'::text[]) loop
    if length(v_needle) >= 7 then
      delete from public.ask_messages
       where tenant_id = p_tenant_id
         and content::text like '%' || v_needle || '%';
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
    end if;
  end loop;
  delete from public.ask_threads t
   where t.tenant_id = p_tenant_id
     and not exists (select 1 from public.ask_messages m where m.thread_id = t.id);
  return v_count;
end $$;
revoke execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) from public, anon;
grant execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) to authenticated;
comment on function public.scrub_ask_for_contact(uuid, uuid, text[]) is
  'Owner-only: removes every Ask message in the workspace that names the erased contact id or one of its phone spellings, then any thread left empty.';
