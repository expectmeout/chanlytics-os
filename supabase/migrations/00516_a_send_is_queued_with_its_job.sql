-- 00516 · A send is queued with its job, and a run that finished says so once (decision 0089).
--
--   queue_send        the receptionist's held reply and its outbound_send job in one transaction. The draft used to be
--                     written, then its job: a run killed between the two left a queued reply nothing would send, found
--                     only by the deadman's orphan check ten minutes later. Now both are written or neither is. The
--                     address the reply goes to is frozen on the row (meta.to), where the send reads it first.
--   finish_broadcast  a run that sent its last batch is marked sent and its broadcast.sent written together. The state
--                     moved first and the event after, so a failed event write threw out of a run that had finished, and
--                     the ledger told its owner it had stopped partway. Two chains that both reach the end write one
--                     event, the first's.
--
-- Deploy order: this migration first, then the edge (its draft queue and its broadcast batch call these). Re-runnable.

set local lock_timeout = '3s';

create or replace function public.queue_send(p_message jsonb, p_due_at timestamptz, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid := coalesce(nullif(p_message ->> 'id', '')::uuid, gen_random_uuid());
  v_tenant uuid := (p_message ->> 'tenant_id')::uuid;
  v_conv   uuid := (p_message ->> 'conversation_id')::uuid;
begin
  if v_tenant is null or v_conv is null then
    raise exception 'queue_send: a queued send names its workspace and its thread';
  end if;
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                               status, meta)
  values (v_id, v_tenant, v_conv, nullif(p_message ->> 'contact_id', '')::uuid,
          coalesce(nullif(p_message ->> 'channel', ''), 'whatsapp'), 'outbound',
          coalesce(nullif(p_message ->> 'sender', ''), 'ai'), coalesce(nullif(p_message ->> 'type', ''), 'text'),
          p_message ->> 'body', 'queued', coalesce(p_message -> 'meta', '{}'::jsonb));
  -- The thread is stamped as a written outbound row stamps it (packages/db recordOutbound); a queued draft has not gone
  -- out, so it writes no message.sent: deliver() writes that when it leaves.
  update public.conversations set last_message_at = now() where id = v_conv and tenant_id = v_tenant;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (v_tenant, 'outbound_send', p_due_at,
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('message_id', v_id, 'conversation_id', v_conv));
  return v_id;
end $$;
revoke all on function public.queue_send(jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.queue_send(jsonb, timestamptz, jsonb) to service_role;
comment on function public.queue_send(jsonb, timestamptz, jsonb) is
  'A queued reply and its outbound_send job, written together or not at all (00516): the message (id, tenant_id, conversation_id, contact_id, channel, sender, type, body, meta) queued, its thread stamped, its job due at p_due_at with p_payload and the message''s id. Answers the message''s id. The service role''s alone.';

create or replace function public.finish_broadcast(p_tenant_id uuid, p_id uuid, p_event jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sequence_batches
     set state = 'sent', finished_at = now()
   where id = p_id and tenant_id = p_tenant_id and state = 'sending';
  -- Another chain of the same run finished it first (jobs settle.ts names the case): its event is the run's.
  if not found then
    return false;
  end if;
  -- The kind is this door's own; the row's other fields are packages/db's (rowOf), as for every event it builds.
  insert into public.events (tenant_id, kind, category, version, subject_type, subject_id, data, request_id)
  values (p_tenant_id, 'broadcast.sent', coalesce(nullif(p_event ->> 'category', ''), 'message'),
          coalesce((p_event ->> 'version')::smallint, 1), p_event ->> 'subject_type',
          nullif(p_event ->> 'subject_id', '')::uuid, coalesce(p_event -> 'data', '{}'::jsonb),
          coalesce(nullif(p_event ->> 'request_id', ''), public.request_id_of_caller()));
  return true;
end $$;
revoke all on function public.finish_broadcast(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_broadcast(uuid, uuid, jsonb) to service_role;
comment on function public.finish_broadcast(uuid, uuid, jsonb) is
  'A run that sent its last batch: marked sent, with its event (broadcast.sent and its tally, as packages/db builds every event row), in one transaction (00516). False when it was not sending (another chain finished it, or it was stopped), and then nothing is written. The service role''s alone.';
