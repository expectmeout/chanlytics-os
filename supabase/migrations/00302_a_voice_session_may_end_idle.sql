-- 00302 · A voice session may end idle.
--
-- Ask, spoken (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026, evening): the
-- hold is the one mic. A session connects on the press, its microphone muted, and the words the browser heard go to
-- the agent as a text turn; between questions it waits silently, and the browser ends it a minute after the last
-- (contracts ASK_VOICE_IDLE_MS) with its own word for why, `idle`, which 00300's set did not have. Re-runnable.

set local lock_timeout = '3s';

alter table public.ask_voice_sessions drop constraint if exists ask_voice_sessions_end_reason_check;
alter table public.ask_voice_sessions
  add constraint ask_voice_sessions_end_reason_check
  check (end_reason is null or end_reason in ('button', 'typed', 'superseded', 'navigated', 'vendor', 'start', 'idle'));

comment on column public.ask_voice_sessions.end_reason is 'The browser''s word for how it ended: button, typed, superseded, navigated, vendor, start, idle (a minute with nothing asked). Null while it runs.';
