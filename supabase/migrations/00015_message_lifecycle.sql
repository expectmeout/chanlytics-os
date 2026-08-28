-- Three holes in the message lifecycle, plus the escalation reason the edge
-- now needs when it cannot read a thread's state.
--
-- 1. A DELIVERED MESSAGE COULD BE FLIPPED TO 'canceled'.
--    messages_guard ranks statuses to enforce monotonicity, but 'canceled' and
--    'failed' both fall into `else 9` (00003:55-57). So sent(2) -> canceled(9)
--    passes the `new_rank < old_rank` test, and the terminal-state check above
--    it only guards transitions OUT of canceled/failed, never INTO them from a
--    delivered state.
--
--    That is not cosmetic. readThreadState excludes canceled and failed rows
--    from the bot's history, so cancelling a message the customer has already
--    received makes the receptionist forget it ever said it — and it will
--    contradict itself in the next reply. It also makes the operator's Inbox
--    disagree with the customer's phone.
--
--    sent -> failed stays legal: Meta genuinely reports delivery failures after
--    accepting a send. Only 'canceled' is a claim about the past ("this never
--    went out") and only it is now refused.
--
-- 2. RLS DID NOT PIN WHO SENT IT.
--    messages_acting_member_insert (00014) checks the tenant and role, and
--    direction/sender, but not `sent_by` or `status`. An operator's own JWT
--    could therefore POST /rest/v1/messages attributing a message to a
--    colleague, or insert one already marked 'sent' that no job ever sent. The
--    honest path already satisfies both conditions, so pinning them costs
--    nothing and removes attribution forgery.
--
-- 3. 'state_unavailable' escalation reason.
--    When both memory sources fail (Postgres misses AND the Blob read errors)
--    the receptionist no longer answers from an invented empty history — it
--    hands the conversation to a human. That needs a reason the operator can
--    read, and every reason must be in this CHECK or the escalation insert
--    fails silently inside pgSafe.

-- ------------------------------------------------------- 1. status transitions
create or replace function public.messages_guard() returns trigger
language plpgsql as $$
declare
  old_rank int;
  new_rank int;
begin
  if NEW.conversation_id is distinct from OLD.conversation_id
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.channel     is distinct from OLD.channel
     or NEW.direction   is distinct from OLD.direction
     or NEW.sender      is distinct from OLD.sender
     or NEW.type        is distinct from OLD.type
     or NEW.body        is distinct from OLD.body
     or NEW.template_name is distinct from OLD.template_name
     or NEW.channel_ts  is distinct from OLD.channel_ts
     or NEW.created_at  is distinct from OLD.created_at
     or (OLD.external_id is not null and NEW.external_id is distinct from OLD.external_id)
  then
    raise exception 'messages content columns are immutable (P3)';
  end if;
  if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status then
    raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
  end if;
  -- A message that has left the building cannot be un-sent. 'canceled' asserts
  -- it never went out; on a delivered row that assertion is false, and it also
  -- hides the row from the bot's own history.
  if OLD.status in ('sent','delivered','read') and NEW.status = 'canceled' then
    raise exception 'a message that was already sent cannot be canceled (% -> % rejected)', OLD.status, NEW.status;
  end if;
  old_rank := case OLD.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  new_rank := case NEW.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  if new_rank < old_rank then
    raise exception 'messages.status is monotone (% -> % rejected)', OLD.status, NEW.status;
  end if;
  if NEW.status is distinct from OLD.status then
    NEW.status_updated_at := now();
  end if;
  return NEW;
end $$;

-- --------------------------------------------------- 2. attribution is pinned
drop policy if exists messages_acting_member_insert on public.messages;
create policy messages_acting_member_insert on public.messages
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and direction = 'outbound'
    and sender = 'human'
    -- you may only write yourself as the sender, and only as something not yet
    -- sent: 'sent' is the job's word to say, after the wire accepted it.
    and sent_by = (select auth.uid())
    and status = 'queued'
  );

-- ------------------------------------------------- 3. state_unavailable reason
alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable'));
