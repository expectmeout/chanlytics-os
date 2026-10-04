-- 00288 · Expired voice sessions are swept.
--
-- A voice conversation's row (00287) carries the member's access token, sealed, good for the token's own hour: the
-- brain door opens no row whose token has expired, and the browser or the post-call webhook ends the row before
-- that. What a row holds after its hour is a sealed token nobody can open and the conversation's minutes, which the
-- webhook's log line kept too. A row goes a day after its token expired, nightly, a thousand at a time, so no one
-- statement holds the table for long (contracts' RETENTION_DAYS, ask_voice_sessions). Judged on its runs, like the
-- purges (00107, 00215).

create or replace function public.sweep_voice_sessions(p_after interval default '1 day')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.ask_voice_sessions s
     where s.id in (
       select c.id from public.ask_voice_sessions c
        where c.token_expires_at < now() - p_after
        limit 1000
     );
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;
revoke execute on function public.sweep_voice_sessions(interval) from public, anon, authenticated;
comment on function public.sweep_voice_sessions(interval) is
  'Nightly. Deletes voice sessions a day after their token expired, a thousand at a time (00288). Numbers: contracts'' RETENTION_DAYS (ask_voice_sessions).';

select cron.unschedule('sweep-voice-sessions') where exists (select 1 from cron.job where jobname = 'sweep-voice-sessions');
select cron.schedule('sweep-voice-sessions', '43 4 * * *', $$select public.sweep_voice_sessions()$$);

-- Judged on its runs, like the purges (00107): a night it does not run is a clock the health sweep names.
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('sweep_voice_sessions', 'sweep-voice-sessions', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;
