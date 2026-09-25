-- 00176 · A domain answers for its bounces and its complaints.
--
-- Reach out, Part 2 (docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md, PR 5): bounces over 2% of the
-- last 500 sends, or any complaint, hold the domain; only the owner resumes it, and the ramp starts again. A
-- complaint arrives after delivery and used to leave its row untouched; now it stamps the row, so the domain it left
-- from can be counted. The domain a row left from is read from its frozen request's From, the one the door held it
-- to (core deliver.ts): no second field to disagree with it.

-- What the clock last counted, since the domain was last clean (apps/edge lib/email/sending-domains.ts). Null until
-- a verified domain is first counted.
alter table public.sending_domains
  add column if not exists sent_recent integer,
  add column if not exists bounced_recent integer,
  add column if not exists complaints integer;

create or replace function public.email_from_host(p_meta jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(substring(p_meta->'email'->'request'->>'from' from '@([^@<>[:space:]"]+)>?[[:space:]]*$'))
$$;
comment on function public.email_from_host(jsonb) is
  'The domain an email row left from: its frozen request''s From (channels mailboxHeader: "Name" <local@host>, or local@host).';
revoke execute on function public.email_from_host(jsonb) from public, anon, authenticated;
grant execute on function public.email_from_host(jsonb) to service_role;

-- A complaint, once, on the row it is about. True when this call stamped it; false when it was stamped before, or
-- the row is not this workspace's outbound email.
create or replace function public.stamp_email_complaint(p_tenant_id uuid, p_message_id uuid, p_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.messages m
     set meta = jsonb_set(m.meta, '{email,complained_at}', to_jsonb(p_at), true)
   where m.id = p_message_id and m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
     and m.meta ? 'email' and not (m.meta->'email' ? 'complained_at');
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke execute on function public.stamp_email_complaint(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.stamp_email_complaint(uuid, uuid, timestamptz) to service_role;

-- What one own domain sent since it was last clean: the last 500 that left (sent, delivered, or failed by a receipt;
-- a send the door refused or the provider never took is not the domain's), the bounces among them, and every
-- complaint in the window. Ninety days at most, however long it has been clean.
create or replace function public.sending_domain_counts(p_tenant_id uuid, p_host text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with gone as (
    select m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and m.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
       and (m.status in ('sent', 'delivered') or (m.status = 'failed' and m.error ? 'provider'))
       and public.email_from_host(m.meta) = lower(p_host)
  ), recent as (
    select * from gone order by created_at desc limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'),
    'complained', (select count(*) from gone where meta->'email' ? 'complained_at'))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;
