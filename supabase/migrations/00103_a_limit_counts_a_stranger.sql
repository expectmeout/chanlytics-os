-- 00103 · A limit counts a stranger.
--
-- take_rate (00059) counts one actor's hits in one bucket, and its actor was a
-- uuid because every caller then was a signed-in person. The sign-up route --
-- the one door a stranger may use, and the one that most needs a ceiling --
-- counts by network and by address: `ip:<hash>` and `email:<hash>`. Postgres
-- refuses those as a uuid (22P02), the dashboard's store catches the error and
-- falls back to the memory of whichever serverless instance took the request,
-- and writes rate_store_failed to the log once a minute, for ever. So the public
-- door has had no shared limit since the day it opened, and a burst spread
-- across instances was never limited in total, which is the one thing 00059
-- exists to prevent.
--
-- An actor is a label. The column and the function say so. A signed-in
-- person's key is the text of the uuid it always was, so nobody's count moves.

alter table public.rate_hits alter column actor type text using actor::text;

drop function if exists public.take_rate(text, uuid, int, int);

create or replace function public.take_rate(p_bucket text, p_actor text, p_limit int, p_window_ms int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_since  timestamptz := clock_timestamp() - make_interval(secs => p_window_ms / 1000.0);
  v_n      int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_actor));
  delete from public.rate_hits where bucket = p_bucket and actor = p_actor and at < v_since;
  select count(*), min(at) into v_n, v_oldest
    from public.rate_hits where bucket = p_bucket and actor = p_actor;
  if v_n >= p_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_oldest + v_window - clock_timestamp())))::int)
    );
  end if;
  insert into public.rate_hits (bucket, actor) values (p_bucket, p_actor);
  return jsonb_build_object('allowed', true, 'used', v_n + 1);
end
$$;

revoke all on function public.take_rate(text, text, int, int) from public, anon, authenticated;
grant execute on function public.take_rate(text, text, int, int) to service_role;

comment on function public.take_rate(text, text, int, int) is
  'Count one hit for an actor in a bucket, or say when to try again. The actor is any label: a user id, or a hashed network or address for the public sign-up door.';
