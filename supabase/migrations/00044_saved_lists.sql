-- 00044 Saved lists: a name and the people on it.
--
-- People v1 keeps six computed lists that keep themselves current. What a
-- salon also keeps is a list by hand — a stylist's own clients, the package
-- holders, the regulars — and that needed a table. A list is the workspace's,
-- not one member's: anyone who reads People sees it, anyone who may act in
-- the workspace (owner or operator) may make one, add to it, or delete it.
-- No ledger rows: a list changes nothing a customer experiences. The day a
-- broadcast goes to a list, the broadcast is the decision, and its audience
-- is the list crossed with who said yes.

create table public.segments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create trigger segments_set_updated_at
  before update on public.segments
  for each row execute function extensions.moddatetime('updated_at');

create table public.segment_members (
  segment_id uuid not null references public.segments (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  added_by   uuid references auth.users (id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (segment_id, contact_id)
);
create index segment_members_contact on public.segment_members (contact_id);

alter table public.segments        enable row level security;
alter table public.segment_members enable row level security;

-- Members read; acting members write. The membership row a stranger cannot
-- see keeps the workspace's lists invisible to them.
create policy segments_member_select on public.segments
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy segments_acting_insert on public.segments
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));
create policy segments_acting_update on public.segments
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));
create policy segments_acting_delete on public.segments
  for delete to authenticated
  using (public.is_acting_member(tenant_id));

-- A member row must name a list and a person of the same workspace, and the
-- person must still exist: an erased contact cannot be put on a list.
create policy segment_members_member_select on public.segment_members
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy segment_members_acting_insert on public.segment_members
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and added_by = (select auth.uid())
    and exists (select 1 from public.segments s where s.id = segment_id and s.tenant_id = segment_members.tenant_id)
    and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = segment_members.tenant_id and c.erased_at is null)
  );
create policy segment_members_acting_delete on public.segment_members
  for delete to authenticated
  using (public.is_acting_member(tenant_id));

-- Column-scoped grants, per 00037: a session client may rename a list and
-- nothing else about it; a member row is written once or removed.
grant select, insert, delete on public.segments to authenticated;
grant update (name) on public.segments to authenticated;
grant select, insert, delete on public.segment_members to authenticated;

-- An erased person leaves every list. erase_contact (00027) marks the row
-- rather than deleting it, so the cascade above never fires for an erasure;
-- this trigger is the leg that does.
create or replace function public.segment_members_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.segment_members where contact_id = new.id;
  end if;
  return new;
end $$;
create trigger contacts_erase_leaves_lists
  after update of erased_at on public.contacts
  for each row execute function public.segment_members_on_erase();
