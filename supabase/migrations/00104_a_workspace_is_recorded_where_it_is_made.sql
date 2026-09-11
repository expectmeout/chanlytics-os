-- 00104 · A workspace is recorded where it is made.
--
-- Sign-up made the workspace on the spot, with the service role, for an
-- address nobody had proved -- and it was the only path that wrote the
-- workspace.created event, so a workspace made by its signed-in owner
-- through create_workspace (00021, 00072) left no record of having been
-- made at all. Sign-up creates no workspace now: what its form said waits
-- on the auth user, and the person who proves the inbox makes the workspace
-- through the same door a second workspace uses.
--
-- That door is a function, but a workspace is a row in tenants whichever
-- way it arrives, raw SQL during onboarding included. So the record is
-- written where the row is: an AFTER INSERT trigger beside the provisioning
-- one (00017), naming the session that did it when there was one. `by` is
-- auth.uid(): the signed-in owner through create_workspace, null for a
-- migration, a console, or the service role.

create or replace function public.record_workspace_created() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (new.id, 'workspace.created', 'workspace', 'tenant', new.id,
          jsonb_build_object('by', auth.uid(), 'slug', new.slug, 'timezone', new.timezone));
  return new;
end $$;

comment on function public.record_workspace_created() is
  'Writes the workspace.created event for a new tenants row, from any path. by is auth.uid(): the signed-in owner through create_workspace, null for a migration, a console, or the service role.';

revoke execute on function public.record_workspace_created() from public, anon, authenticated;

drop trigger if exists tenants_record_created on public.tenants;
create trigger tenants_record_created
  after insert on public.tenants
  for each row execute function public.record_workspace_created();
