-- 00180 · A domain counts its day by when it sent.
--
-- Reach out, Part 2.6 (the review before Part 3). The door's day for a domain (00177's outreach_facts, sent_since)
-- counted emails by when they were QUEUED; the cold-receipt watch (00179) counts them by when they were SENT. A run
-- queued Monday behind its approval and sent Tuesday counted on neither day, so a domain could send twice its share in
-- one rolling day. Now both read one clock:
--
--   email_sent_at(meta, status_updated_at, created_at)   When an email left, or tried to: the time it became `sent`
--                                                          (messages_guard's meta.status_at, 00111), else the time its
--                                                          status last moved (a send whose outcome is unknown failed
--                                                          then), else when it was written.
--   outreach_facts(...)          sent_since by that clock. Otherwise as 00179 left it.
--   cold_receipts_owed(...)      by the same clock. What it answers is unchanged.

set local lock_timeout = '3s';

-- 1. When an email left, or tried to. Stable, not immutable: a text-to-timestamptz cast reads the session's zone.
create or replace function public.email_sent_at(p_meta jsonb, p_status_updated_at timestamptz, p_created_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce((p_meta->'status_at'->>'sent')::timestamptz, p_status_updated_at, p_created_at)
$$;
comment on function public.email_sent_at(jsonb, timestamptz, timestamptz) is
  'When an email row left, or tried to: status_at.sent, else status_updated_at, else created_at. The day''s share and the cold-receipt watch both count by it (00180).';
-- Read only inside the service role's functions below, which run as their owner.
revoke execute on function public.email_sent_at(jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.email_sent_at(jsonb, timestamptz, timestamptz) to service_role;

-- 2. 00179's door, with the day counted by when each email left. created_at bounds the read to 00176's index: an email
-- is written before it is sent, and one written more than two days before the window is not looked for.
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
    -- What left from the domain in the window (email_left), and any send whose outcome is unknown, by when it left.
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since - interval '2 days'
         and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) >= p_since
         and (public.email_left(m.status, m.error)
              or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) to service_role;

-- 3. 00179's watch, over the same clock. What it answers is unchanged: an email that left carries status_at.sent.
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
     and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) >= p_from
     and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) < p_to
   where d.state = 'verified'
   group by d.tenant_id, d.host
$$;
revoke execute on function public.cold_receipts_owed(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cold_receipts_owed(timestamptz, timestamptz) to service_role;
