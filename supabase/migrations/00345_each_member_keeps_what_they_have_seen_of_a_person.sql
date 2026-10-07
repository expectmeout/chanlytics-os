-- 00345 · Each member keeps what they have seen of a person.
--
-- A thread never went from unread to read. The Inbox's dot meant "needs you" (a person is needed and nobody has it),
-- Conversations and People drew every row at one weight, and nothing recorded that a member had opened anyone
-- (Ruben, 7 October 2026: "they all appear as the same"). Now a row is new to a member when the customer's last message
-- or call (conversations.last_inbound_at, which every inbound writer moves, ingest_call among them) came after that
-- member last opened the person, or when the member put it back as unread. Per member: a teammate reading a thread
-- reads it for themselves, and a phone and a desk agree.
--
--   contact_reads   one row per member of a workspace: everything that came before `seen_at` is seen. Made here for
--                   every member there is, at now(), so the day this lands no list lights up at once. A member who
--                   joins later has no row and is held to the day they joined (memberships.created_at).
--   contact_marks   one row per member per person they opened or put back: `seen_at`, when they last opened the
--                   person; `unread_at`, when they marked it unread, cleared by the next opening.
--   contact_seen    reads a member's own floor and their marks for the people named, in one answer.
--   contact_mark    writes one mark for the caller: seen (opened), or unread (put back).
--
-- The bell's own pair is the shape (00057: notification_reads, notification_marks; their definer doors write only the
-- caller's rows). A person erased takes their marks with them (contacts on delete cascade), and so does a workspace.
--
-- Either deploy order: nothing reads or writes these before the dashboard that ships with them, and that dashboard
-- reads a workspace without them as one where nothing is unread. Re-runnable: tables and policies if not there, the
-- functions replaced, the floor inserted only where a member has none.

set local lock_timeout = '3s';

create table if not exists public.contact_reads (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id   uuid not null,
  seen_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table public.contact_reads enable row level security;
drop policy if exists contact_reads_own_select on public.contact_reads;
create policy contact_reads_own_select on public.contact_reads
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.contact_reads from anon, authenticated;
grant select on public.contact_reads to authenticated;
grant all on public.contact_reads to service_role;
comment on table public.contact_reads is
  'Per member of a workspace: every message or call a customer made before seen_at counts as seen by that member (00345). Made for each member there was when the unread rule landed; a member with no row is held to memberships.created_at. Members read their own row; nothing writes it after the migration yet.';

create table if not exists public.contact_marks (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id    uuid not null,
  seen_at    timestamptz,
  unread_at  timestamptz,
  primary key (contact_id, user_id)
);
create index if not exists contact_marks_member on public.contact_marks (tenant_id, user_id);
alter table public.contact_marks enable row level security;
drop policy if exists contact_marks_own_select on public.contact_marks;
create policy contact_marks_own_select on public.contact_marks
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.contact_marks from anon, authenticated;
grant select on public.contact_marks to authenticated;
grant all on public.contact_marks to service_role;
comment on table public.contact_marks is
  'Per member per person: seen_at is when the member last opened the person (their thread or their page), unread_at when they put it back as unread, cleared by the next opening (00345). A person is new to a member when conversations.last_inbound_at is after the later of this seen_at and the member''s floor (contact_reads), or unread_at is set. Written only by contact_mark, for the caller.';

-- Every member there is has seen everything up to now: the lists start quiet.
insert into public.contact_reads (tenant_id, user_id, seen_at)
select m.tenant_id, m.user_id, now() from public.memberships m
on conflict (tenant_id, user_id) do nothing;

-- A member's own floor and their marks for the people named. The caller's rows only.
create or replace function public.contact_seen(p_tenant_id uuid, p_contact_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_joined timestamptz;
  v_floor  timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select m.created_at into v_joined from memberships m where m.user_id = v_user and m.tenant_id = p_tenant_id;
  if v_joined is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select r.seen_at into v_floor from contact_reads r where r.tenant_id = p_tenant_id and r.user_id = v_user;
  return jsonb_build_object(
    'floor_at', coalesce(v_floor, v_joined),
    'marks', coalesce((
      select jsonb_agg(jsonb_build_object('contact_id', k.contact_id, 'seen_at', k.seen_at, 'unread_at', k.unread_at))
        from contact_marks k
       where k.tenant_id = p_tenant_id and k.user_id = v_user and k.contact_id = any (coalesce(p_contact_ids, '{}'))
    ), '[]'::jsonb));
end $$;
revoke execute on function public.contact_seen(uuid, uuid[]) from public, anon;
grant execute on function public.contact_seen(uuid, uuid[]) to authenticated;
comment on function public.contact_seen(uuid, uuid[]) is
  'What the calling member has seen of the people named, in a workspace they belong to: { floor_at, marks: [{ contact_id, seen_at, unread_at }] }. floor_at is the member''s contact_reads.seen_at, or the day they joined where they have none; marks are their own contact_marks rows for those people. Refuses a caller who is not signed in (28000) or not a member (P0002). The dashboard''s readers judge unseen from it (contracts conversations/unseen.ts).';

-- One mark for the caller: true says they opened the person now; false puts the person back as unread.
create or replace function public.contact_mark(p_contact_id uuid, p_seen boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_row    contact_marks;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_seen is null then
    raise exception 'Say seen or unread.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id;
  if v_tenant is null or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  insert into contact_marks (tenant_id, contact_id, user_id, seen_at, unread_at)
  values (v_tenant, p_contact_id, v_user, case when p_seen then now() end, case when p_seen then null else now() end)
  on conflict (contact_id, user_id) do update set
    seen_at   = case when p_seen then now() else contact_marks.seen_at end,
    unread_at = case when p_seen then null else now() end
  returning * into v_row;
  return jsonb_build_object('contact_id', v_row.contact_id, 'seen_at', v_row.seen_at, 'unread_at', v_row.unread_at);
end $$;
revoke execute on function public.contact_mark(uuid, boolean) from public, anon;
grant execute on function public.contact_mark(uuid, boolean) to authenticated;
comment on function public.contact_mark(uuid, boolean) is
  'The calling member''s own mark on a person of a workspace they belong to: true stamps seen_at now and clears unread_at (they opened the person); false stamps unread_at now and keeps seen_at (Mark as unread). Any member, a viewer too: it is their own reading. Answers { contact_id, seen_at, unread_at }; refuses a caller not signed in (28000), neither word (22023), and a person not theirs to see (P0002).';
