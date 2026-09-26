-- 00188 · A domain is held for its unsubscribes, and a second hold in thirty days is the platform's to lift.
--
-- Reach out, Part 3 (the plan's PR 7).
--
--   resume_by       (D16) who may lift a reputation hold: its owner, with Resume, or, when the same domain was held for
--                   its reputation once already in the last thirty days, the platform, which is paged when it happens.
--                   A domain that keeps drawing bounces, complaints or unsubscribes is not one more press of Resume.
--   unsubscribes    (D18) a reputation hold of its own: Gmail sends no per-message complaints, so the people who press
--                   Unsubscribe are the nearest thing to them a cold domain hears. Past 2% of what it sent (over at
--                   least 150), as bounces are (contracts reputationHoldOf).
--   sending_domain_counts gains `unsubscribed`: the emails among its window (the last 500 that left since its count
--                   began) that an unsubscribe names (the contact.consent_changed event set_email_marketing writes
--                   with the message it came from, 00174/00177). A complaint is counted as `complained`, never here.
--                   And `complained_new`: the complaints about emails sent since the count began. A late spam report
--                   about mail from before a Resume still holds the domain (`complained`), but it is the episode its
--                   owner already answered, so it never makes the hold the platform's (D16). What it answered before
--                   is unchanged.

set local lock_timeout = '3s';

alter table public.sending_domains add column if not exists resume_by text not null default 'owner';
alter table public.sending_domains drop constraint if exists sending_domains_resume_by_check;
alter table public.sending_domains add constraint sending_domains_resume_by_check
  check (resume_by in ('owner', 'platform'));
comment on column public.sending_domains.resume_by is
  'Who lifts its reputation hold: the owner (Resume), or the platform, when it was held for its reputation twice in thirty days (Reach out D16, 00188).';

alter table public.sending_domains drop constraint if exists sending_domains_held_why_check;
alter table public.sending_domains add constraint sending_domains_held_why_check
  check (held_why in ('verification', 'dmarc', 'bounces', 'complaint', 'provider', 'unsubscribes'));

create or replace function public.sending_domain_counts(p_tenant_id uuid, p_host text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = lower(p_host)
       and m.created_at >= now() - interval '90 days'
  ), recent as (
    select o.id, o.status, o.error from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
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
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    'complained_new', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)
         and created_at >= coalesce(p_since, '-infinity'::timestamptz)),
    -- An unsubscribe comes after its email left, so after the count began: read from then (the index on the
    -- workspace's events by kind and time), never before the ninety days the emails are read over.
    'unsubscribed', (
      select count(*) from recent r
       where exists (
         select 1 from public.events e
          where e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed'
            and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
            and e.data->>'purpose' = 'email_marketing' and e.data->>'source' = 'unsubscribe'
            and e.data->>'message_id' = r.id::text)))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;
