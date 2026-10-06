-- 00335 · Every verified delivery is kept seven days under the provider's own id.
--
-- Decision 0031, step 4: the intake ledger. A provider's webhook was read, judged and gone; a delivery a fix could have
-- taken in waited for a redelivery the provider never sends (Twilio retries nothing on its own; Retell three times;
-- Meta for a while). Now every door keeps the delivery it verified before its verdict, under the provider's own id, for
-- a week, but two. ElevenLabs' post-call webhook carries the transcript of a conversation with Ask, which names
-- customers, and its door keeps nothing of what was said (0026), so the vendor's redelivery after a 503 is its replay.
-- Apify's url carries the run's token, which the database keeps only as its hash, and its body is a pointer the
-- collect reads the run back by, so the provider's redelivery is its replay too.
--
--   provider_events         (provider, provider_event_id) the key the provider gave, or a digest of the body where it
--                           gave none (Meta's batches); door and url, the address it came to, so a replay
--                           knocks on the same door with the same signature; the headers the signature reads; the body
--                           as it came; verified, which is always true here (an unverified body is nobody's and is not
--                           kept); the workspace where the door knew it at the time, else null.
--   purge_provider_events   nightly, a week on (contracts RETENTION_DAYS.provider_events), on its registered clock.
--   provider_events_scrub   an erasure's hand: the rows of a workspace, or of no workspace, whose body names the person
--                           by any key the erasure finds a copy by (the digits of their numbers, the ways a sentence
--                           spells them, their addresses) are deleted with them. Matched without regard to case, an
--                           address also as a form-encoded body spells it (Twilio's: `%40` for `@`), and a needle's own
--                           `%`, `_` or backslash is a character, never a wildcard.
--
-- The replay is an admin door on the edge (api/admin/intake/replay): the kept delivery knocks on its own door
-- again in-process, so its signature is proved again. A provider whose signature carries a timestamp (Resend, Stripe)
-- replays within its window only, and the door answers what the signature answers.
--
-- The floor: the platform's table. RLS on with no policy, so only the service role reaches it; tenant_id cascades.
-- Either deploy order: a table only the edge writes. Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.provider_events (
  provider          text not null check (provider in ('meta', 'twilio', 'retell', 'resend', 'stripe')),
  provider_event_id text not null,
  door              text not null,
  url               text not null,
  tenant_id         uuid references public.tenants (id) on delete cascade,
  verified          boolean not null default true,
  headers           jsonb not null default '{}'::jsonb check (jsonb_typeof(headers) = 'object'),
  body              text not null,
  received_at       timestamptz not null default now(),
  primary key (provider, provider_event_id)
);
create index if not exists provider_events_received on public.provider_events (received_at);
create index if not exists provider_events_tenant on public.provider_events (tenant_id) where tenant_id is not null;
alter table public.provider_events enable row level security;
revoke all on public.provider_events from anon, authenticated;
grant all on public.provider_events to service_role;
comment on table public.provider_events is
  'Every verified delivery a provider made to a door, as it came, under the provider''s own id (decision 0031): the door and url it came to, the headers its signature reads, the body, and the workspace the door knew at the time. Kept a week (purge_provider_events), scrubbed on erasure (provider_events_scrub), replayed by api/admin/intake/replay. RLS on with no policy: the service role alone.';

create or replace function public.purge_provider_events(p_keep interval default '7 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.provider_events e
     where (e.provider, e.provider_event_id) in (
       select c.provider, c.provider_event_id from public.provider_events c
        where c.received_at < now() - p_keep
        limit 1000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;
revoke all on function public.purge_provider_events(interval) from public, anon, authenticated;
grant execute on function public.purge_provider_events(interval) to service_role;
comment on function public.purge_provider_events(interval) is
  'Nightly. Deletes kept deliveries a week after they came (contracts RETENTION_DAYS.provider_events), a thousand at a time. Answers how many.';

select cron.unschedule('purge-provider-events') where exists (select 1 from cron.job where jobname = 'purge-provider-events');
select cron.schedule('purge-provider-events', '46 4 * * *', $$select public.purge_provider_events()$$);

-- Judged on its runs, like the other purges (00107, 00215).
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_provider_events', 'purge-provider-events', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

create or replace function public.provider_events_scrub(p_tenant_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patterns text[];
  v_n        integer;
begin
  if p_tenant_id is null or p_needles is null then
    return 0;
  end if;
  -- One pattern per needle of six characters or more, lower-cased, its LIKE characters escaped, and an address again
  -- as a form-encoded body spells it; the body is lower-cased once a row and read against them all.
  select array_agg(distinct '%' || replace(replace(replace(v.needle, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into v_patterns
    from unnest(p_needles) as n(needle)
    cross join lateral (values (lower(n.needle)), (replace(lower(n.needle), '@', '%40'))) as v(needle)
   where length(n.needle) >= 6;
  if v_patterns is null then
    return 0;
  end if;
  -- The workspace's own rows, and the rows no door could place (a batch of several numbers), by what the body says.
  delete from public.provider_events e
   where (e.tenant_id = p_tenant_id or e.tenant_id is null)
     and lower(e.body) like any (v_patterns);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.provider_events_scrub(uuid, text[]) from public, anon, authenticated;
grant execute on function public.provider_events_scrub(uuid, text[]) to service_role;
comment on function public.provider_events_scrub(uuid, text[]) is
  'An erasure''s hand on the intake ledger (decision 0031): the kept deliveries of the workspace, or of no workspace, whose body names the person by any of the needles (six characters or more; without regard to case; an address also form-encoded; a needle''s LIKE characters literal) are deleted. Answers how many.';
