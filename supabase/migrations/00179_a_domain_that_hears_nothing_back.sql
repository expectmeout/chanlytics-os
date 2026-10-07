-- 00179 · A domain that hears nothing back is noticed.
--
-- Reach out, Part 2.5 (docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md, PR 4): cold email's
-- receipts come from the second mail account, signed with RESEND_COLD_WEBHOOK_SECRET. Set wrong, every receipt is
-- refused at the door and nothing says so: the emails still leave, each one stays `sent` for ever, so a bounce never
-- counts and a complaint never holds the domain. The domains sweep (apps/edge api/cron/domains.ts) asks this, and
-- pages the platform when a domain's emails of the last day have heard nothing back at all.
--
--   email_left(status, error)    Whether an email row left: one spelling, which 00176's count and 00177's door
--                                spelled apart until now. Both are re-created over it, unchanged in what they answer.
--   cold_receipts_owed(from, to) Per verified own domain, the emails that left it in the window, by when they were
--                                sent, and how many of those no receipt has reached. Service role only.
--
-- Apply before the edge deploys. Until it is applied, the sweep logs domains_receipts_unreadable each tick and
-- changes nothing else.

set local lock_timeout = '3s';

-- 1. Whether an email row left: the provider took it (sent, or moved on by a receipt: delivered, or failed by a bounce
-- or a failure receipt). A refusal at the door, a send the provider refused, one it suppressed, and a send whose
-- outcome is unknown did not, as far as anyone knows. Email never reaches `read`; it is here as 00176 had it.
create or replace function public.email_left(p_status text, p_error jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_status in ('sent', 'delivered', 'read')
      or (p_status = 'failed' and coalesce(p_error->>'provider', '') in ('bounced', 'failed'))
$$;
comment on function public.email_left(text, jsonb) is
  'Whether an email row left (the provider took it): sent, delivered, or failed by a bounce or failure receipt. 00179.';
-- Pure, and read only inside the service role's functions below (which run as their owner): nobody else needs it.
revoke execute on function public.email_left(text, jsonb) from public, anon, authenticated;
grant execute on function public.email_left(text, jsonb) to service_role;

-- 2. 00178's count, over the one spelling. What it answers is unchanged.
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
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;

-- 3. 00177's door, over the one spelling. What it answers is unchanged: a send whose outcome is unknown may have
-- left, so the daily cap counts it too.
create or replace function public.outreach_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_host text,
  p_since timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The lead still being written to wins over one closed; a person the finder never found has none.
    'lead_stage', (
      select l.stage from public.leads l
       where l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
         and l.erased_at is null and l.blanked_at is null
       order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
       limit 1),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'domain', (
      select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since)
        from public.sending_domains d
       where d.tenant_id = p_tenant_id and d.host = lower(btrim(p_host))),
    -- What left from the domain in the window (email_left), and any send whose outcome is unknown.
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since
         and (public.email_left(m.status, m.error)
              or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) to service_role;

-- 4. For each verified own domain, the emails that left it (email_left) SENT between p_from and p_to, and how many of
-- those are still `sent`, which no receipt has reached: a bounce or a failure receipt is a receipt, and says the
-- webhook works. Sent is when the row became `sent` (messages_guard's meta.status_at, 00111), not when it was queued:
-- a backlog that leaves late is not an email a receipt is owed for yet. created_at bounds the read to the index
-- (00176's messages_email_from_host): a row is queued before it is sent, and one queued two days before the window
-- and sent inside it is not looked for.
create or replace function public.cold_receipts_owed(p_from timestamptz, p_to timestamptz)
returns table (tenant_id uuid, host text, sent integer, unanswered integer)
language sql
stable
security definer
set search_path = public
as $$
  select d.tenant_id, d.host,
         count(*)::integer,
         (count(*) filter (where m.status = 'sent'))::integer
    from public.sending_domains d
    join public.messages m
      on m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound'
     and public.email_from_host(m.meta) = lower(d.host)
     and m.created_at >= p_from - interval '2 days' and m.created_at < p_to
     and public.email_left(m.status, m.error)
     and coalesce((m.meta->'status_at'->>'sent')::timestamptz, m.created_at) >= p_from
     and coalesce((m.meta->'status_at'->>'sent')::timestamptz, m.created_at) < p_to
   where d.state = 'verified'
   group by d.tenant_id, d.host
$$;
comment on function public.cold_receipts_owed(timestamptz, timestamptz) is
  'Per verified own domain: the emails that left it, sent in the window, and how many no receipt has reached (apps/edge api/cron/domains.ts). Service role only.';
revoke execute on function public.cold_receipts_owed(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cold_receipts_owed(timestamptz, timestamptz) to service_role;
