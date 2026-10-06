-- 00328 · The runtime stamp covers channels, listings and lines.
--
-- The receptionist reads its workspace once per message through loadTenantRuntime (apps/edge/lib/tenant-runtime.ts):
-- the settings, the policies, the channel rows with their credentials, the workspace row and its Google listing,
-- kept per instance for up to ten minutes and read again only when runtime_stamp (00059) says something changed.
-- The stamp named three of the five: the settings' version, the policies' newest change and the workspace row. A
-- channel reconnected, a number provisioned, a listing relinked or a token rewritten changed nothing in it, so a warm
-- instance went on answering from what it had read, for up to ten minutes (the wiring trace, 5 October 2026).
--
-- Now the stamp carries each of the tables the runtime reads: the channels (how many, and the newest change;
-- moddatetime keeps updated_at, and put_channel_credentials touches the row when a token is written), the listings
-- and the lines. Three indexed reads by tenant more on a call the runtime already makes per message. Re-runnable.

create or replace function public.runtime_stamp(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws('|',
    coalesce((select c.version::text from public.tenant_config c where c.tenant_id = p_tenant_id), '-'),
    coalesce((select max(p.updated_at)::text from public.policies p where p.tenant_id = p_tenant_id), '-'),
    coalesce((select t.updated_at::text from public.tenants t where t.id = p_tenant_id), '-'),
    -- A count beside the newest change: a row deleted (a line released) moves the count where it cannot move the max.
    coalesce((select count(*)::text || '@' || max(ch.updated_at)::text
                from public.tenant_channels ch where ch.tenant_id = p_tenant_id), '-'),
    coalesce((select count(*)::text || '@' || max(g.updated_at)::text
                from public.google_listings g where g.tenant_id = p_tenant_id), '-'),
    coalesce((select count(*)::text || '@' || max(l.updated_at)::text
                from public.lines l where l.tenant_id = p_tenant_id), '-')
  );
$$;

revoke all on function public.runtime_stamp(uuid) from public, anon, authenticated;
grant execute on function public.runtime_stamp(uuid) to service_role;
comment on function public.runtime_stamp(uuid) is
  'What the receptionist''s runtime was read from, as one string: the settings'' version, the policies'' and the workspace row''s newest change, and the channels'', listings'' and lines'' count and newest change (00328). A warm instance reads the runtime again when it differs.';
