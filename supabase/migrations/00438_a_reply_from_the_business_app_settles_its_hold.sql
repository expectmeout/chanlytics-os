-- 00438 · A reply from the WhatsApp Business app settles the hold it answers.
--
-- The wiring's second audit, S7-5 (Ruben, 15 October 2026). A customer needs a person; the owner answers them in the
-- WhatsApp Business app on their phone. The receptionist steps back (recordEchoAndPause, the owner_echo move), but the
-- hold stays open: the customer stays in the Inbox's Needs you, Today's queue and every badge with the owner's own reply
-- as the last message, and two hours on the owner is mailed and pushed "Still waiting: a customer has had no answer". A
-- reply from the dashboard resolves the hold it answers (core reply); one from the Business app now does too.
--
-- Only a reply a person typed. The Business app's greeting and away messages come back to us as the owner's own words
-- (an echo), and an automatic one must not settle a hold: until a real away message is seen arriving, a reply counts as
-- typed when it is text and no message of the customer's came in the quarter minute before it, since an automatic one
-- goes out within seconds of the customer's message and a person takes longer.
--
--   reply_was_typed            that rule, once: the settle door and the deadman both read it.
--   conversation_echo_settles  the service role's door the edge calls once the echo is kept with its pause: the open
--                              holds on its thread that wait on a person (the reasons the edge hands it: contracts
--                              WAITING_REASONS) and opened before the reply, resolved by one decision ('resolve', through
--                              team_decision, the one door the ledger has, with no member: the owner answered from their
--                              phone). Nothing when the reply was not typed, or no such hold is open: a redelivery of the
--                              echo finds the hold resolved and writes nothing twice. Resolving closes the hold's bell
--                              rows (escalation_closes_its_notices, 00421).
--   deadman_candidates         a hold a typed reply by a person answered after it opened is no candidate: "Still waiting"
--                              said of a customer the owner has answered is false (an echo that landed before its hold
--                              opened, a hold opened by an older writer, a settle that failed).
--
-- Deploy order: this migration first; an edge that calls a door the database does not hold keeps the echo and its pause
-- and owes the settle, which Meta's redelivery asks for again. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.reply_was_typed(p_tenant_id uuid, p_conversation_id uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (
    select 1
      from public.messages i
     where i.tenant_id = p_tenant_id
       and i.conversation_id = p_conversation_id
       and i.direction = 'inbound'
       and i.created_at > p_at - interval '15 seconds'
       and i.created_at <= p_at
  );
$$;
revoke execute on function public.reply_was_typed(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reply_was_typed(uuid, uuid, timestamptz) to service_role;
comment on function public.reply_was_typed(uuid, uuid, timestamptz) is
  'Whether a person''s reply on a thread at p_at was typed (00438): no message of the customer''s came in the quarter minute before it. The WhatsApp Business app''s greeting and away messages go out within seconds of the customer''s message and arrive as the owner''s own words; a reply a person typed takes longer.';

create or replace function public.conversation_echo_settles(
  p_tenant_id uuid,
  p_external_id text,
  p_reasons text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg      record;
  v_ids      uuid[];
  v_decision jsonb;
begin
  if p_tenant_id is null or p_external_id is null then
    raise exception 'conversation_echo_settles: a workspace and the echo''s id' using errcode = '22004';
  end if;
  -- The echo as recordEchoAndPause kept it: the owner's words on the thread, sent from their phone.
  select m.id, m.conversation_id, m.created_at, m.type, m.body
    into v_msg
    from public.messages m
   where m.tenant_id = p_tenant_id and m.external_id = p_external_id
     and m.direction = 'outbound' and m.sender = 'human';
  if v_msg.id is null then
    return jsonb_build_object('resolved', 0, 'why', 'no_echo');
  end if;
  if v_msg.type <> 'text' or coalesce(btrim(v_msg.body), '') = '' then
    return jsonb_build_object('resolved', 0, 'why', 'not_text');
  end if;
  if not public.reply_was_typed(p_tenant_id, v_msg.conversation_id, v_msg.created_at) then
    return jsonb_build_object('resolved', 0, 'why', 'automatic');
  end if;
  -- The holds it answers: open, waiting on a person, opened before the reply. Locked, so two deliveries of one echo
  -- cannot both resolve them and write two decisions.
  select array_agg(h.id)
    into v_ids
    from (
      select e.id
        from public.escalations e
       where e.tenant_id = p_tenant_id
         and e.conversation_id = v_msg.conversation_id
         and e.state = 'open'
         and e.reason = any(coalesce(p_reasons, '{}'::text[]))
         and e.created_at < v_msg.created_at
       for update
    ) h;
  if v_ids is null then
    return jsonb_build_object('resolved', 0, 'why', 'nothing_open');
  end if;
  v_decision := public.team_decision(p_tenant_id, null, 'conversation', v_msg.conversation_id, 'resolve',
                                     jsonb_build_object('message_id', v_msg.id), 'whatsapp_business_app', null);
  update public.escalations
     set state = 'resolved', decision_id = (v_decision ->> 'decision_id')::uuid
   where id = any(v_ids) and state = 'open';
  return jsonb_build_object('resolved', cardinality(v_ids)) || v_decision;
end $$;
revoke execute on function public.conversation_echo_settles(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.conversation_echo_settles(uuid, text, text[]) to service_role;
comment on function public.conversation_echo_settles(uuid, text, text[]) is
  'The owner answered a customer from the WhatsApp Business app (00438): the open holds on the echo''s thread that wait on a person (p_reasons) and opened before it, resolved by one resolve decision with no member, when the reply was typed (reply_was_typed, and text). Returns resolved, and decision_id and undo_dropped when it resolved any; resolved 0 with why otherwise. Idempotent: a redelivery finds nothing open.';

-- The same signature as 00433's, so its grants stand (service_role alone, 00018).
create or replace function public.deadman_candidates(p_older_than interval default '02:00:00'::interval)
returns table (
  escalation_id uuid,
  tenant_id uuid,
  conversation_id uuid,
  reason text,
  details text,
  opened_at timestamptz,
  phone_e164 text
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.tenant_id, e.conversation_id, e.reason, e.details, e.created_at, c.phone_e164
    from escalations e
    join conversations v on v.id = e.conversation_id
    left join contacts c on c.id = v.contact_id
   where e.state = 'open'
     and e.deadman_alerted_at is null
     and e.created_at < now() - p_older_than
     and v.state <> 'snoozed'
     -- Answered by a person since it opened (00438): a reply typed on the dashboard or in the WhatsApp Business app.
     and not exists (
       select 1
         from messages m
        where m.tenant_id = e.tenant_id
          and m.conversation_id = e.conversation_id
          and m.direction = 'outbound'
          and m.sender = 'human'
          and m.created_at > e.created_at
          and public.reply_was_typed(m.tenant_id, m.conversation_id, m.created_at)
     )
   order by e.created_at
   limit 50;
$$;
revoke execute on function public.deadman_candidates(interval) from public, anon, authenticated;
