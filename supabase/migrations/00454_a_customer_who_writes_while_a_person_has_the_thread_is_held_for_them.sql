-- 00454 · A customer who writes while a person has the thread is held for that person.
--
-- The closed-loop audit of 17 October 2026, B. A person's reply claims the thread as a take-over does (reply_claim), and
-- the receptionist stays out of it for the workspace's pause, 24 hours by default. A message the customer wrote inside
-- that pause was set aside (reply-gates.ts, human_has_it) with no hold, no bell and no mail, so the deadman never saw
-- it; when the pause ran out (expire_stale_pauses, which lets a pause go only while no hold is open) the thread went
-- back to the receptionist with the question unanswered. Now the inbound path opens, or refreshes, a hold of its own
-- reason, `wrote_while_held`: a person's reply resolves it as it resolves every hold on the thread, the deadman watches
-- it, and an open hold keeps the pause from lapsing past it.
--
-- The hold door (escalation_open, 00388) gains one rule: `wrote_while_held` never takes another reason's place. A thread
-- the receptionist handed over is already held ("asked for a person", a call back) and the deadman already watches it,
-- so a message under that hold leaves it as it is and answers `refreshed`, writing nothing; only a thread whose claim
-- left no hold open (a person replied, which resolves the thread's holds, or took it over, which opens none) gets one.
-- Deploy order: this migration first; an edge that opens the new reason against the old CHECK fails the write, and the
-- message is kept and set aside as it was before. Re-runnable.

set local lock_timeout = '3s';

alter table public.escalations drop constraint if exists escalations_reason_check;
alter table public.escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask',
                    'callback','paused','carriers','email_review','booking_request',
                    'booking_reply','wrote_while_held'));

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
    -- A customer writing while a person has the thread is the open hold's, whatever its reason (00454): nothing written.
    if p_reason = 'wrote_while_held' then
      select e.id into v_id
        from public.escalations e
       where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
         and e.reason is distinct from p_reason;
      if v_id is not null then
        return 'refreshed';
      end if;
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
  'The one door a thread is handed to a person by (00388): a new open escalation with its escalation.opened event (opened), the open one taking another reason (changed; escalations_note_change writes escalation.changed), or the same reason''s words moved (refreshed), in one transaction. A wrote_while_held asked of a thread already held never takes the open reason''s place: it writes nothing and answers refreshed (00454). An open one resolved in between leaves room, and a new one is opened. The service role''s.';
