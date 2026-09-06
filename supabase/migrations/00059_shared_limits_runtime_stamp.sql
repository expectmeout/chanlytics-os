/* ------------------------------------------------ shared request limits -- */

-- The dashboard's limits counted per serverless instance: a burst spread
-- across instances was limited per instance, not in total. One row per hit
-- and one door make the count exact across every instance. Service role only:
-- the dashboard counts on the server, never the browser.
create unlogged table if not exists public.rate_hits (
  bucket text        not null,
  actor  uuid        not null,
  at     timestamptz not null default clock_timestamp()
);
create index if not exists rate_hits_key on public.rate_hits (bucket, actor, at);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;

-- Count this hit against the bucket, or say when to try again. The advisory
-- lock serialises one actor's one bucket, so two concurrent requests cannot
-- both squeeze under the ceiling. Stale rows for the key are pruned on the way.
create or replace function public.take_rate(p_bucket text, p_actor uuid, p_limit int, p_window_ms int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_since  timestamptz := clock_timestamp() - make_interval(secs => p_window_ms / 1000.0);
  v_n      int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_actor::text));
  delete from public.rate_hits where bucket = p_bucket and actor = p_actor and at < v_since;
  select count(*), min(at) into v_n, v_oldest
    from public.rate_hits where bucket = p_bucket and actor = p_actor;
  if v_n >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_oldest + v_window - clock_timestamp())))::int)
    );
  end if;
  insert into public.rate_hits (bucket, actor) values (p_bucket, p_actor);
  return jsonb_build_object('allowed', true, 'used', v_n + 1);
end
$$;
revoke all on function public.take_rate(text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.take_rate(text, uuid, int, int) to service_role;

-- Keys nobody touches again keep at most a window of rows; sweep them nightly.
select cron.schedule('purge-rate-hits', '13 4 * * *',
  $$delete from public.rate_hits where at < now() - interval '2 hours'$$);

/* ------------------------------------------- the runtime's freshness stamp -- */

-- The edge builds a tenant's runtime (persona, policy, timezone) from three
-- tables and cached it for a minute, so a setting saved on the dashboard
-- reached the receptionist up to a minute later. One cheap read answers
-- "did anything the runtime is built from change?": the config's version, the
-- newest policy row, the tenant row. Same stamp, same runtime; a different
-- stamp reloads. Service role only: the edge asks, nothing else needs it.
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
    coalesce((select t.updated_at::text from public.tenants t where t.id = p_tenant_id), '-')
  );
$$;
revoke all on function public.runtime_stamp(uuid) from public, anon, authenticated;
grant execute on function public.runtime_stamp(uuid) to service_role;
