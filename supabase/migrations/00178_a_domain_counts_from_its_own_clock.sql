-- 00178 · A domain counts from its own clock.
--
-- Reach out, Part 2.5 (docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md, PR 2).
--
--   counted_since             The reputation count's own clock, apart from the ramp's (clean_since): set when a domain
--                             is first verified and when its owner resumes it, never by a release from a DNS hold. So
--                             a complaint made while the domain was held for its records still holds it after.
--   held_why 'provider'       The mail provider no longer knows the domain, or answers a state nobody reads: held, and
--                             the owner is told to remove it and add it again.
--   sending_domain_counts     Only a permanent bounce counts toward the 2%.

set local lock_timeout = '3s';

alter table public.sending_domains add column if not exists counted_since timestamptz;
update public.sending_domains
   set counted_since = coalesce(verified_at, clean_since)
 where counted_since is null and (verified_at is not null or clean_since is not null);
comment on column public.sending_domains.counted_since is
  'Where the reputation count starts (bounces, complaints): set when the domain is first verified and when its owner resumes it, never by a DNS release. clean_since is the ramp''s clock (contracts domainDailyCap).';

alter table public.sending_domains drop constraint if exists sending_domains_held_why_check;
alter table public.sending_domains add constraint sending_domains_held_why_check
  check (held_why in ('verification', 'dmarc', 'bounces', 'complaint', 'provider'));

-- 00176's count, with one edit: a permanent bounce only.
create or replace function public.sending_domain_counts(p_tenant_id uuid, p_host text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = lower(p_host)
       and m.created_at >= now() - interval '90 days'
  ), recent as (
    select o.status, o.error from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and (o.status in ('sent', 'delivered') or (o.status = 'failed' and o.error->>'provider' in ('bounced', 'failed')))
     order by o.created_at desc
     limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A permanent bounce only: a full mailbox or a greylisting server says nothing about the domain that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;
