-- 00181 · A business that wrote back is not written to cold again.
--
-- Reach out, Part 2.6 (the review before Part 3). Every cold email's foot says "Not interested? Reply 'no thanks' and I
-- won't write again", and under CAN-SPAM a reply asking to stop, in any words, is an opt-out the sender must honour.
-- Nothing read replies to decide whether one says no, so the door keeps the promise the plain way: a person who has
-- written back, on any channel, in any words, is in a conversation, and is never sent a cold email again. The
-- conversation carries on in the Inbox, answered by a person or the receptionist, never by a reach-out.
--
--   outreach_facts(...)   gains `wrote_back`: whether this person ever sent a message of their own (an inbound one
--                         from them; an email's automatic reply or a program's mail is not a person writing).
--                         Otherwise as 00180 left it.

set local lock_timeout = '3s';

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
    -- Whether this person ever wrote a message of their own to this business, on any channel: in a conversation, never
    -- written to cold again. An out-of-office and a program's mail are the email intake's to name
    -- (channels classifyReceived: meta.email.claim), and are not a person writing.
    'wrote_back', exists (
      select 1 from public.messages m
        join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
       where m.tenant_id = p_tenant_id and c.contact_id = p_contact_id
         and m.direction = 'inbound' and m.sender = 'customer'
         and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') in ('auto_reply', 'automated'))),
    'domain', (
      select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since)
        from public.sending_domains d
       where d.tenant_id = p_tenant_id and d.host = lower(btrim(p_host))),
    -- What left from the domain in the window (email_left), and any send whose outcome is unknown, by when it left.
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since - interval '30 days'
         and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) >= p_since
         and (public.email_left(m.status, m.error)
              or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) to service_role;
