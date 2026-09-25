-- 00179 · A domain that hears nothing back is noticed.
--
-- Reach out, Part 2.5 (docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md, PR 4): cold email's
-- receipts come from the second mail account, signed with RESEND_COLD_WEBHOOK_SECRET. Set wrong, every receipt is
-- refused at the door and nothing says so: the emails still leave, and each one stays `sent` for ever, so a bounce
-- never counts and a complaint never holds the domain. The domains sweep (apps/edge api/cron/domains.ts) asks this,
-- and pages the platform when a domain's emails of the last day have heard nothing back at all.

set local lock_timeout = '3s';

-- For each verified own domain, the emails that left it between p_from and p_to (the provider took them: sent, or
-- moved on from sent by a receipt), and how many of those are still `sent`, which is an email no delivery receipt
-- has reached. A failed row is neither: a bounce is a receipt, and a send the provider refused never left. By the
-- host each row left from (00176's email_from_host and its index), never a workspace's every message.
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
     and m.created_at >= p_from and m.created_at < p_to
     and m.status in ('sent', 'delivered', 'read')
   where d.state = 'verified'
   group by d.tenant_id, d.host
$$;
comment on function public.cold_receipts_owed(timestamptz, timestamptz) is
  'Per verified own domain: the emails that left it in the window, and how many no delivery receipt has reached (apps/edge api/cron/domains.ts).';
revoke execute on function public.cold_receipts_owed(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cold_receipts_owed(timestamptz, timestamptz) to service_role;
