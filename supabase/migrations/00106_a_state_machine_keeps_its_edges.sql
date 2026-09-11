-- 00106 · A state machine keeps its edges: broadcasts, escalations, and a line's voice.
--
-- jobs (00098) and messages are guarded by a trigger. These three have a CHECK
-- on the value and nothing on the move, and most of their writers key on the
-- id alone: a late callback could flip a sent broadcast back to scheduled and
-- send it twice, resolve an escalation nobody opened, or re-provision an
-- answering line. The edges below are the ones every writer in the repo
-- actually takes (read from the dashboard routes, the jobs handlers, the
-- playbooks, the lines saga and the resume sweep); a same-state update is
-- always allowed, because refreshing a row's details is not a move.
--
-- Phase two A, Task 2 (docs/plans/2026-09-11-phase-two-a-sound-and-observable.md).

-- ----------------------------------------------------------------- broadcasts
--   pending_approval -> scheduled          the owner approved it
--   pending_approval -> canceled           the owner declined it
--   pending_approval -> failed             its recipients could not be written
--   scheduled        -> sending            the handler claimed it
--   scheduled        -> canceled           the owner withdrew it
--   scheduled        -> failed             enrollment or scheduling failed
--   scheduled        -> pending_approval   the approve route rolls back a schedule it could not queue
--   sending          -> sent | failed | canceled
--   sent, canceled, failed                 final
create or replace function public.broadcasts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if OLD.state in ('sent', 'canceled', 'failed') then
      raise exception 'broadcasts.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    if OLD.state = 'pending_approval' and NEW.state not in ('scheduled', 'canceled', 'failed') then
      raise exception 'a broadcast awaiting approval may only be scheduled, canceled or failed (% refused)', NEW.state;
    end if;
    if OLD.state = 'scheduled' and NEW.state not in ('sending', 'canceled', 'failed', 'pending_approval') then
      raise exception 'a scheduled broadcast may only start sending, be canceled, fail, or go back for approval (% refused)', NEW.state;
    end if;
    if OLD.state = 'sending' and NEW.state not in ('sent', 'failed', 'canceled') then
      raise exception 'a sending broadcast may only finish, fail or be canceled (% refused)', NEW.state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists broadcasts_guard on public.broadcasts;
create trigger broadcasts_guard before update on public.broadcasts
  for each row execute function public.broadcasts_guard();
comment on function public.broadcasts_guard() is
  'The edges a broadcast may take: pending_approval -> scheduled|canceled|failed; scheduled -> sending|canceled|failed|pending_approval; sending -> sent|failed|canceled; sent, canceled and failed are final. A same-state update is not a move.';

-- ---------------------------------------------------------------- escalations
--   open -> resolved, once. A new concern is a new row; escalations_one_open
--   (00004) keeps it to one open row per conversation.
create or replace function public.escalations_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if OLD.state = 'resolved' then
      raise exception 'escalations.state is terminal (% -> % refused); a new concern is a new row', OLD.state, NEW.state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists escalations_guard on public.escalations;
create trigger escalations_guard before update on public.escalations
  for each row execute function public.escalations_guard();
comment on function public.escalations_guard() is
  'open -> resolved, once. A resolved escalation is not reopened; a new concern is a new row.';

-- ------------------------------------------------------------- lines (voice)
--   none        -> provisioning            the number was bought
--   provisioning-> answering | failed      the saga finished, or did not
--   failed      -> provisioning            a person's Retry, or the resume sweep
--   answering   -> failed                  the provider took the number away
--   never back to none                     a line is released (the row is deleted), not reset
--   never answering -> provisioning        a late retry does not re-provision a line that answers
--   sms_state is untouched here: the texting phase comes last.
create or replace function public.lines_voice_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.voice_state is distinct from OLD.voice_state then
    if NEW.voice_state = 'none' then
      raise exception 'a line does not go back to voice_state none (% refused); release it instead', OLD.voice_state;
    end if;
    if OLD.voice_state = 'answering' and NEW.voice_state = 'provisioning' then
      raise exception 'an answering line is not re-provisioned (answering -> provisioning refused)';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists lines_voice_guard on public.lines;
create trigger lines_voice_guard before update on public.lines
  for each row execute function public.lines_voice_guard();
comment on function public.lines_voice_guard() is
  'Forward moves only on voice_state: none -> provisioning -> answering|failed, failed -> provisioning, answering -> failed. Never back to none (a line is released, which deletes the row); never answering -> provisioning. sms_state is not guarded yet.';
