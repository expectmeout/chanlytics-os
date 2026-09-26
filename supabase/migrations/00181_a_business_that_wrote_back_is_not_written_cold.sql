-- 00181 · A business that wrote back is not written to cold again.
--
-- Reach out, Part 2.6 (the review before Part 3). Every cold email's foot says "Not interested? Reply 'no thanks' and I
-- won't write again", and under CAN-SPAM a reply asking to stop, in any words, is an opt-out the sender must honour.
-- Nothing reads replies to decide whether one says no, so the door keeps the promise the plain way: a person who has
-- written back, on any channel, in any words, or phoned, is in a conversation, and is never sent a cold email again.
-- The conversation carries on in the Inbox, answered by a person or the receptionist, never by a reach-out.
--
--   outreach_facts(...)   gains `wrote_back`, true when any of these is:
--                           a message of this person's own on any of their threads, whatever the channel. An email
--                           the intake read as an automatic reply (an out-of-office: channels classifyReceived,
--                           meta.email.claim) is not one. Mail with a list's or a program's headers is: a helpdesk or
--                           a CRM sends a person's "no thanks" with them too, and a no missed is the one mistake that
--                           must not be made;
--                           an email from any address that answers or cites one sent to this person (In-Reply-To,
--                           References): a business written at info@ often answers from the owner's own address, and
--                           the intake files that under whoever sent it;
--                           a call they made to the business.
--                         Otherwise as 00180 left it.
--   two indexes           on received email's In-Reply-To and References, which that reads.

set local lock_timeout = '3s';

create index if not exists messages_email_in_reply_to_idx
  on public.messages (tenant_id, (meta->'email'->>'in_reply_to'))
  where channel = 'email' and direction = 'inbound';
create index if not exists messages_email_references_idx
  on public.messages using gin ((meta->'email'->'references') jsonb_path_ops)
  where channel = 'email' and direction = 'inbound';

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
    'wrote_back', (
      -- Their own words, on any of their threads (one per person in a workspace), an out-of-office aside.
      exists (
        select 1 from public.messages m
          join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
         where m.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and m.direction = 'inbound' and m.sender = 'customer'
           and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply'))
      -- A reply from another address to an email sent to them: it names that email, or cites it after a forward.
      or exists (
        select 1 from public.messages o
          join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
         where o.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
           and (exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
                or exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')))
      -- A call they made, answered or not: the receptionist's note of it is the system's words, not theirs.
      or exists (
        select 1 from public.calls k
         where k.tenant_id = p_tenant_id and k.contact_id = p_contact_id and k.direction = 'inbound')),
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
