-- The deadman watchdog: nobody picked this up.
--
-- `deadman` has been declared as a job kind (00002), an escalation reason
-- (00004) and a UI label ("Nobody picked this up — flagged after silence")
-- since Slice 2, with no emitter and no handler anywhere. So the system has
-- always been able to DESCRIBE an abandoned customer and never able to notice
-- one: an escalation opens, the owner gets one email, and if that email is
-- missed the conversation sits open forever with nothing to raise its hand.
--
-- WHY A DATABASE SWEEP RATHER THAN A JOB. apps/edge cannot publish jobs — it
-- verifies QStash signatures, the dashboard holds the publish token — so
-- "schedule a deadman when the escalation opens" is not available at the point
-- escalations are created. pg_cron already runs expire-stale-pauses every 15
-- minutes (00006), so a sweep adds no new service, and a sweep is the more
-- honest shape anyway: it notices an abandoned conversation regardless of
-- which code path abandoned it, including ones written later.
--
-- The alert itself goes out through the edge, NOT from SQL, because addressing
-- a tenant correctly is real logic (apps/edge/lib/notify.ts) — one business's
-- customer must never be described in another business's inbox — and a second
-- copy of that rule written in plpgsql is the duplication this codebase keeps
-- being bitten by.
--
-- AUTH WITHOUT A NEW SECRET TO MANAGE: both ends read ONE Vault secret. The
-- cron job reads it to send a header; the edge reads it through a
-- SECURITY DEFINER function to compare. Nothing is added to Vercel's env, and
-- the value exists in exactly one place.

create extension if not exists pg_net with schema extensions;

-- --------------------------------------------------------------- once-only
-- The guard that makes this safe to run every few minutes: an escalation is
-- flagged at most once, no matter how long it stays open.
alter table public.escalations
  add column if not exists deadman_alerted_at timestamptz;

comment on column public.escalations.deadman_alerted_at is
  'When the watchdog flagged this as unanswered. Set once; NULL means never flagged.';

-- ------------------------------------------------------------- the candidates
/**
 * Escalations open longer than p_older_than that nobody has been warned about.
 * Returned to the edge, which owns how a tenant is addressed.
 */
create or replace function public.deadman_candidates(p_older_than interval default '2 hours')
returns table (
  escalation_id   uuid,
  tenant_id       uuid,
  conversation_id uuid,
  reason          text,
  details         text,
  opened_at       timestamptz,
  phone_e164      text
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.tenant_id, e.conversation_id, e.reason, e.details, e.created_at, c.phone_e164
    from escalations e
    join conversations v on v.id = e.conversation_id
    left join contacts c on c.id = v.contact_id
   where e.state = 'open'
     and e.deadman_alerted_at is null
     and e.created_at < now() - p_older_than
   order by e.created_at
   limit 50;
$$;

revoke execute on function public.deadman_candidates(interval) from public, anon, authenticated;

/** Stamp the ones the edge successfully warned about. */
create or replace function public.deadman_mark_alerted(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update escalations set deadman_alerted_at = now()
   where id = any(p_ids) and deadman_alerted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.deadman_mark_alerted(uuid[]) from public, anon, authenticated;

-- ------------------------------------------------------- the shared secret
-- Generated here so it exists in Vault and nowhere else — not in a repo, not
-- in an env var, not in a terminal. Both ends read it from here.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_sweep_key') then
    -- gen_random_uuid is core (pg13+); two of them is 64 hex chars of entropy
    -- and avoids depending on pgcrypto's schema placement.
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'cron_sweep_key',
      'Shared secret: pg_cron sweeps -> the edge sweep endpoint');
  end if;
  -- Where the edge lives. Not secret, but kept beside the key so the sweep has
  -- exactly one place to look and no environment of its own.
  if not exists (select 1 from vault.secrets where name = 'edge_base_url') then
    perform vault.create_secret('https://chanlytics-messaging.vercel.app', 'edge_base_url',
                                'Base URL the pg_cron sweeps call');
  end if;
end $$;

/** The edge compares the header it received against this. */
create or replace function public.get_cron_sweep_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_sweep_key';
$$;

revoke execute on function public.get_cron_sweep_key() from public, anon, authenticated;

-- --------------------------------------------------------------- the sweep
/**
 * Ask the edge to run the deadman sweep. Fire-and-forget: pg_net queues the
 * request, and the edge does the work and stamps the rows. If the request is
 * lost, the next tick finds the same candidates — the once-guard lives on the
 * ROW, not on this call.
 */
create or replace function public.trigger_deadman_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'deadman sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/deadman',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_id;
  return v_id;
end $$;

revoke execute on function public.trigger_deadman_sweep() from public, anon, authenticated;

-- Every 10 minutes. The threshold that decides "abandoned" is the edge's, not
-- this schedule's — the sweep just has to run more often than that threshold.
select cron.unschedule('deadman-sweep') where exists (select 1 from cron.job where jobname = 'deadman-sweep');
select cron.schedule('deadman-sweep', '*/10 * * * *', $$select public.trigger_deadman_sweep()$$);
