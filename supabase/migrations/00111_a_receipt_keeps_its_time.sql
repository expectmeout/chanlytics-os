-- A receipt keeps its time.
--
-- WhatsApp's receipts (sent, delivered, read) moved messages.status and
-- status_updated_at, so a row knew only when its LATEST status arrived. A
-- recipient's line on a broadcast wants "delivered 10:32 · read 10:40", and
-- the times were thrown away as each receipt overwrote the last. The guard
-- that already runs on every status change now also stamps
-- meta.status_at.<status> = now(), on the same row, in the same write.
--
-- The body is 00015's with that one block added; the trigger binding is
-- unchanged (create or replace keeps it). meta is never null (00002 default),
-- and coalesce guards a row written before the default existed.

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
    -- Each status keeps its own time: status_updated_at knows only the
    -- latest, and "delivered at 10:32, read at 10:40" is what a recipient's
    -- line on a broadcast shows. meta.status_at.<status> = now(), on the row
    -- the receipt already updates.
    NEW.meta := coalesce(NEW.meta, '{}'::jsonb)
      || jsonb_build_object('status_at',
           coalesce(NEW.meta->'status_at', '{}'::jsonb) || jsonb_build_object(NEW.status, now()));
  end if;
  return NEW;
end $$;
