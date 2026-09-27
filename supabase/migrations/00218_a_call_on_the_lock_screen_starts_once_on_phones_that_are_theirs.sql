-- 00218 · A call on the Lock Screen starts once, on phones whose activity token is theirs alone.
--
-- The call's Live Activity (00191, apps/edge/lib/voice/call-activity.ts) is started from the Retell webhook. A
-- redelivered call_started started it again on every phone: calls.activity_started_at records the one start, won by
-- an update only the first delivery can make (as notified_at is for the post-call mail, 00034). And an activity token
-- was never unique, never re-owned and never cleared, so a phone passed from one person to the next went on showing
-- the first person's calls: one row holds a token, the register door takes it from any other row, and the edge clears
-- one Apple says is gone.
alter table public.calls add column if not exists activity_started_at timestamptz;
comment on column public.calls.activity_started_at is
  'When the call''s Live Activity was started on the workspace''s phones. Set once by an UPDATE ... WHERE activity_started_at IS NULL, so a redelivered call_started starts nothing twice.';

-- Two rows that share a token: the one seen most recently keeps it, so the index below can hold.
update public.push_devices d
   set activity_token = null
 where d.activity_token is not null
   and exists (
     select 1
       from public.push_devices o
      where o.activity_token = d.activity_token
        and o.id <> d.id
        and (o.last_seen_at, o.id) > (d.last_seen_at, d.id)
   );
create unique index if not exists push_devices_activity_token_key
  on public.push_devices (activity_token)
  where activity_token is not null;

create or replace function public.push_device_register(
  p_token text,
  p_platform text,
  p_app_version text default null,
  p_activity_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  delete from push_devices where token = p_token and user_id <> v_user;
  -- The activity token is this phone's now: another row that still holds it lets it go.
  if p_activity_token is not null then
    update push_devices set activity_token = null where activity_token = p_activity_token and token <> p_token;
  end if;
  insert into push_devices (user_id, token, platform, app_version, activity_token, last_seen_at)
  values (v_user, p_token, p_platform, p_app_version, p_activity_token, now())
  on conflict (token) do update
    set platform = excluded.platform,
        app_version = excluded.app_version,
        -- A phone that has not said its activity token this time keeps the one it said before.
        activity_token = coalesce(excluded.activity_token, push_devices.activity_token),
        last_seen_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.push_device_register(text, text, text, text) from public, anon;
grant execute on function public.push_device_register(text, text, text, text) to authenticated;
