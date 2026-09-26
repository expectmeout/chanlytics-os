-- 00191 · A phone can be shown a call in progress.
--
-- A Live Activity (the Lock Screen and the Dynamic Island) is started from
-- the server with a push-to-start token the phone hands out once (iOS 17.2+),
-- apart from the push token Expo's service knows. It rides on the device's
-- row: the same phone, the same person, one more token. The register door
-- takes it as an optional fourth argument; the three-argument door goes, so
-- one signature stays.
alter table public.push_devices
  add column if not exists activity_token text check (char_length(activity_token) <= 200);

drop function if exists public.push_device_register(text, text, text);
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
