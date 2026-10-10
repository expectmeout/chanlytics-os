-- 00380 · An escalation is opened with its event, by one door.
--
-- Every path that hands a thread to a person (the text receptionist's holds, the phone's callback and its words, a
-- send that failed, a model turn that never finished, a reach-out's email receipts) came through one TypeScript
-- function, packages/jobs escalate.ts upsertEscalation, and it was three statements: the insert, then, when the thread
-- already had one open, an update that changed its reason or one that moved its words; and escalation.opened written
-- after the insert, best effort, apart from it. An event that was lost left a hold nothing on the ledger knew of, and
-- that event is what the owner's notice will be read from (0031's review of 9 October: its first real subscriber).
-- And a hold resolved between the insert that found it open and the update after came back "refreshed": the caller
-- stayed quiet about a thread nothing was holding.
--
--   escalation_open(tenant, conversation, reason, details)
--       In one transaction: a new open escalation and its escalation.opened ({reason}, on the conversation, as the
--       TypeScript writer wrote it) -> 'opened'; the thread's open one, for another reason, takes this one
--       (escalations_note_change writes escalation.changed in the same transaction) -> 'changed'; the same reason
--       saying itself again moves only its words -> 'refreshed'. An open one resolved in between leaves room for a new
--       one, which is opened. The service role's.
--
-- Deploy order: this migration first. An edge that calls a door the database does not hold reads it as a hold that
-- did not land ('failed') and says so, as it does any other. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.escalation_open(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_reason text,
  p_details text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null or p_conversation_id is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'escalation_open: a thread is handed to a person in a workspace, for a reason' using errcode = '22004';
  end if;
  -- Twice at most: a hold found open and resolved before it could be changed leaves room for a new one.
  for attempt in 1 .. 2 loop
    insert into public.escalations (tenant_id, conversation_id, reason, details)
    values (p_tenant_id, p_conversation_id, p_reason, p_details)
    on conflict (conversation_id) where state = 'open' do nothing
    returning id into v_id;
    if v_id is not null then
      insert into public.events (tenant_id, kind, category, version, subject_type, subject_id, data)
      values (p_tenant_id, 'escalation.opened', 'message', 1, 'conversation', p_conversation_id,
              jsonb_build_object('reason', p_reason));
      return 'opened';
    end if;
    -- One open escalation per thread (escalations_one_open): another reason replaces it, held by the row it updates.
    update public.escalations e
       set reason = p_reason, details = p_details
     where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
       and e.reason is distinct from p_reason
    returning e.id into v_id;
    if v_id is not null then
      return 'changed';
    end if;
    update public.escalations e
       set details = p_details
     where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
    returning e.id into v_id;
    if v_id is not null then
      return 'refreshed';
    end if;
  end loop;
  raise exception 'escalation_open: the thread''s hold moved twice while it was opened' using errcode = '40001';
end $$;

revoke all on function public.escalation_open(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.escalation_open(uuid, uuid, text, text) to service_role;
comment on function public.escalation_open(uuid, uuid, text, text) is
  'The one door a thread is handed to a person by (00380): a new open escalation with its escalation.opened event (opened), the open one taking another reason (changed; escalations_note_change writes escalation.changed), or the same reason''s words moved (refreshed), in one transaction. An open one resolved in between leaves room, and a new one is opened. The service role''s.';
