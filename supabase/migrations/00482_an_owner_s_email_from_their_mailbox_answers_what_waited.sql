-- 00482 · An email the owner sends from their own mailbox is kept in the thread, and answers what waited.
--
-- Decision 0073, R13 made the business's email its mailbox: what people write to it comes into the Inbox, and each
-- email waits in Need you with a reply drafted. The owner still answers from Gmail or Outlook, as they always have; the
-- mailbox's sync read nothing the mailbox sent, so the thread lacked the owner's answer, the Need you item stayed open
-- with its draft, a teammate could answer a second time, and two hours on the owner was told "Still waiting" about a
-- customer they had answered. The six months brought in keep the owner's mail to one person (00478 ingest_before); the
-- mail sent from now on is kept here.
--
--   mailbox_owner_wrote   the service role's door the mailboxes clock calls for an email the mailbox sent that Chanlytics
--                         did not send: kept in the thread of the one person it went to, when the workspace already knows
--                         them (their email identity, else the address on a living record; never one made from an address
--                         alone, so the owner's mail to a supplier stays theirs), once by the provider's id, as a
--                         person's words (outbound, sender human, sent); and in the same write the open holds on that
--                         thread that wait on a person (the reasons the edge hands it: contracts WAITING_REASONS) and
--                         opened before it was sent, resolved by one decision ('resolve', through team_decision with no
--                         member, via 'mailbox'), as a reply typed in the WhatsApp Business app settles its holds
--                         (00438). Nothing else moves: no consent, no pause, nobody told. A second call with the same id
--                         keeps nothing twice and resolves nothing twice.
--
-- Deploy order: this migration first; an edge without the code that calls it reads nothing the mailbox sent, as before.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.mailbox_owner_wrote(
  p_tenant_id   uuid,
  p_address     text,
  p_external_id text,
  p_body        text,
  p_channel_ts  timestamptz,
  p_meta        jsonb,
  p_reasons     text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address  text := nullif(lower(btrim(coalesce(p_address, ''))), '');
  v_contact  uuid;
  v_conv     uuid;
  v_message  uuid;
  v_ids      uuid[];
  v_decision jsonb;
begin
  if p_tenant_id is null or v_address is null or nullif(btrim(coalesce(p_external_id, '')), '') is null
     or p_channel_ts is null then
    raise exception 'mailbox_owner_wrote: a workspace, the address it went to, the provider''s id and when it was sent'
      using errcode = '22004';
  end if;
  -- Who it went to, as resolve_person matches an address (00413): the email identity, then the address on a living
  -- record. Nobody is made: an address the workspace does not know is the owner's own business.
  select coalesce(c.merged_into_contact_id, c.id)
    into v_contact
    from public.contact_identities i
    join public.contacts c on c.id = i.contact_id
   where i.tenant_id = p_tenant_id and i.channel = 'email' and i.external_id = v_address
     and c.erased_at is null
   limit 1;
  if v_contact is null then
    select c.id
      into v_contact
      from public.contacts c
     where c.tenant_id = p_tenant_id and c.email = v_address
       and c.erased_at is null and c.merged_into_contact_id is null
     limit 1;
  end if;
  if v_contact is null then
    return jsonb_build_object('kept', false, 'why', 'not_known');
  end if;

  -- Their thread, made where there is none yet, its recency moved only forward.
  insert into public.conversations (tenant_id, contact_id, last_message_at)
  values (p_tenant_id, v_contact, p_channel_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at)
  returning id into v_conv;

  -- Once by the provider's id: a sync that reads the same email again keeps nothing twice.
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                               type, body, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conv, v_contact, 'email', 'outbound', 'human',
          'text', nullif(p_body, ''), p_external_id, p_channel_ts, 'sent', coalesce(p_meta, '{}'::jsonb))
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message;
  if v_message is null then
    return jsonb_build_object('kept', false, 'why', 'already', 'conversation_id', v_conv);
  end if;

  -- The holds it answers: open, waiting on a person, opened before it was sent. Locked, so two syncs of one email cannot
  -- both resolve them and write two decisions.
  select array_agg(h.id)
    into v_ids
    from (
      select e.id
        from public.escalations e
       where e.tenant_id = p_tenant_id
         and e.conversation_id = v_conv
         and e.state = 'open'
         and e.reason = any(coalesce(p_reasons, '{}'::text[]))
         and e.created_at < p_channel_ts
       for update
    ) h;
  if v_ids is null then
    return jsonb_build_object('kept', true, 'message_id', v_message, 'conversation_id', v_conv, 'resolved', 0);
  end if;
  v_decision := public.team_decision(p_tenant_id, null, 'conversation', v_conv, 'resolve',
                                     jsonb_build_object('message_id', v_message), 'mailbox', null);
  update public.escalations
     set state = 'resolved', decision_id = (v_decision ->> 'decision_id')::uuid
   where id = any(v_ids) and state = 'open';
  return jsonb_build_object('kept', true, 'message_id', v_message, 'conversation_id', v_conv,
                            'resolved', cardinality(v_ids)) || v_decision;
end $$;
revoke all on function public.mailbox_owner_wrote(uuid, text, text, text, timestamptz, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.mailbox_owner_wrote(uuid, text, text, text, timestamptz, jsonb, text[])
  to service_role;
comment on function public.mailbox_owner_wrote(uuid, text, text, text, timestamptz, jsonb, text[]) is
  'An email the owner sent from their connected mailbox, not through Chanlytics (00482): kept in the thread of the one person it went to when the workspace knows them (the email identity, else the address on a living record; nobody is made), once by the provider''s id, outbound by a person; and the open holds on that thread that wait on a person (p_reasons) and opened before it was sent, resolved by one resolve decision with no member, via mailbox. Returns kept, why (not_known, already) when not kept, message_id, conversation_id, resolved, and decision_id when it resolved any. Service role only.';
