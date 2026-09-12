-- 00116 · Two more state machines keep their edges: a broadcast's recipient, and a line's texting state.
--
-- Five state columns were read for a guard on 00106's model, every writer of
-- each followed to its line. Three keep no edge a trigger could honestly
-- refuse, and get none:
--   conversations.state   moves between all four states by design: a customer's
--                         message reopens an archived thread (ingest_inbound), a
--                         handoff lands on whatever state the thread is in
--                         (pauseConversation, recordEchoAndPause), and snooze
--                         and archive take any state.
--   playbooks.state       running <-> paused, both directions, nothing final.
--   templates.meta_status follows Meta's answer in every direction: an appeal
--                         takes rejected back to pending, a quality drop takes
--                         approved to paused, a re-enable takes disabled to
--                         approved (waba-events, templates-sync).
-- Two do.
--
-- ------------------------------------------------------ broadcast_recipients
--   queued -> sent | skipped | failed     the handler marks each recipient once
--                                         (packages/jobs handlers, core/messages/broadcast)
--   sent, skipped, failed                 final. A resumed batch may re-mark a
--                                         row it already marked: same state, not a move.
-- Nothing in the repo can write a row back to queued -- RecipientMark cannot
-- say it -- and this makes that the database's word as well.
create or replace function public.broadcast_recipients_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if OLD.state in ('sent', 'skipped', 'failed') then
      raise exception 'broadcast_recipients.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    -- From queued the CHECK admits only sent, skipped and failed.
  end if;
  return NEW;
end $$;
drop trigger if exists broadcast_recipients_guard on public.broadcast_recipients;
create trigger broadcast_recipients_guard before update on public.broadcast_recipients
  for each row execute function public.broadcast_recipients_guard();
comment on function public.broadcast_recipients_guard() is
  'queued -> sent|skipped|failed, once; sent, skipped and failed are final. A same-state update is not a move.';

-- ----------------------------------------------------------- lines (texting)
-- The hourly sync (a2p.ts syncRegistration) writes what Twilio answers, and
-- Twilio's answer moves both ways: approved -> registering when a refile
-- resets the campaign, active -> approved when a campaign is vetted again, a
-- transient read falls through to registering. So every move among
-- needs_record, registering, approved, active, rejected and failed is a move
-- a writer makes, and the guard allows them all. What no writer does:
--   -> none          a line is released (the row is deleted), not reset: the voice rule (00106) again
--   -> otp_waiting   the sole-proprietor path is not built; the CHECK keeps the word, this keeps a stray write out
--   -> hosting       hosted SMS is not built; the same
create or replace function public.lines_sms_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.sms_state is distinct from OLD.sms_state then
    if NEW.sms_state = 'none' then
      raise exception 'a line does not go back to sms_state none (% refused); release it instead', OLD.sms_state;
    end if;
    if NEW.sms_state in ('otp_waiting', 'hosting') then
      raise exception 'sms_state % is not built (% -> % refused)', NEW.sms_state, OLD.sms_state, NEW.sms_state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists lines_sms_guard on public.lines;
create trigger lines_sms_guard before update on public.lines
  for each row execute function public.lines_sms_guard();
comment on function public.lines_sms_guard() is
  'sms_state moves as the hourly sync and the refile doors move it, in both directions among needs_record, registering, approved, active, rejected and failed. Never back to none (a line is released, which deletes the row); never into otp_waiting or hosting, which are not built.';
comment on function public.lines_voice_guard() is
  'Forward moves only on voice_state: none -> provisioning -> answering|failed, failed -> provisioning, answering -> failed. Never back to none (a line is released, which deletes the row); never answering -> provisioning. sms_state has its own guard (lines_sms_guard, 00116).';
