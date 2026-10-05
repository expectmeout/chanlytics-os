-- 00300 · A voice session says how it went.
--
-- Ask, spoken (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026): the vendor's
-- record of a conversation is erased once its minutes are written (door D), so the session row is the one record of
-- what happened. Until now it said when a conversation began and ended, and nothing of why or how it felt. Of 23
-- conversations on 4 Oct, 19 ended inside nine seconds, every one by the browser, and the log said only "stopped":
-- a press on End, a tap that landed twice, a pane that went away and a connection the vendor cut all looked alike.
--
--   end_reason        the browser's word for how it ended, one of a closed set (contracts VOICE_END_REASONS):
--                     `button` (End pressed), `typed` (typing ends the spoken conversation), `superseded` (another
--                     use of the voice replaced it: a second tap, a brief read aloud), `navigated` (the Line closed),
--                     `vendor` (the connection ended from the far side), `start` (it never came up). Null while it
--                     runs, or when the webhook ended it first.
--   connect_ms        from the tap to the connection being up, as the browser measured it.
--   first_audio_ms    from the tap to the first audio the browser heard, as it measured it; null when none came.
--
-- Written by the member's own end (route /api/v1/ask/voice/end), so the three columns join the update grant the end
-- already has. Read by the voice doctor (docs/runbook.md). Re-runnable.

set local lock_timeout = '3s';

alter table public.ask_voice_sessions
  add column if not exists end_reason text,
  add column if not exists connect_ms integer,
  add column if not exists first_audio_ms integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ask_voice_sessions_end_reason_check'
      and conrelid = 'public.ask_voice_sessions'::regclass
  ) then
    alter table public.ask_voice_sessions
      add constraint ask_voice_sessions_end_reason_check
      check (end_reason is null or end_reason in ('button', 'typed', 'superseded', 'navigated', 'vendor', 'start'));
  end if;
end
$$;

comment on column public.ask_voice_sessions.end_reason is 'The browser''s word for how it ended: button, typed, superseded, navigated, vendor, start. Null while it runs.';
comment on column public.ask_voice_sessions.connect_ms is 'From the tap to the connection up, in ms, as the browser measured it.';
comment on column public.ask_voice_sessions.first_audio_ms is 'From the tap to the first audio heard, in ms, as the browser measured it; null when none came.';

-- The member writes how it went at the end (00287's fence, widened).
grant update (end_reason, connect_ms, first_audio_ms) on public.ask_voice_sessions to authenticated;
