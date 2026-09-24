-- 00162 · A phone can be told.
--
-- The bell keeps every alert the edge raises as a row (00057) and the service
-- worker says push arrives "when the keys for it exist"; none did. A native
-- app registers the phone it runs on here, and a push_send job (the ledger,
-- 00098) carries a kept row to every phone of the people it is for.
--
-- A device is a PERSON's, not a workspace's: one phone, one account, however
-- many workspaces. A token that turns up under another account (the same
-- phone, signed in as someone else) is re-owned in one statement by the
-- definer door, which RLS alone could not do: a person may not delete a row
-- that is not theirs. Members read and forget their own; the edge reads all.

/* ------------------------------------------------------- the table --- */
create table if not exists public.push_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Expo's push token for the device ("ExponentPushToken[...]"), one row each.
  token        text not null unique check (char_length(token) between 1 and 200),
  platform     text not null check (platform in ('ios','android')),
  app_version  text check (char_length(app_version) <= 40),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists push_devices_user on public.push_devices (user_id);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_own_select on public.push_devices;
create policy push_devices_own_select on public.push_devices
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_devices from anon;
revoke insert, update, delete on public.push_devices from authenticated;
comment on table public.push_devices is
  'The phones people can be told on: one row per push token, owned by the person, registered and forgotten through two definer doors. The edge reads.';

/* ---------------------------------------------------- the two doors --- */
-- Register this person's phone. A token already held, by anyone, moves here.
create or replace function public.push_device_register(p_token text, p_platform text, p_app_version text default null)
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
  insert into push_devices (user_id, token, platform, app_version, last_seen_at)
  values (v_user, p_token, p_platform, p_app_version, now())
  on conflict (token) do update set platform = excluded.platform, app_version = excluded.app_version, last_seen_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.push_device_register(text, text, text) from public, anon;
grant execute on function public.push_device_register(text, text, text) to authenticated;

-- Forget this person's phone (sign-out). Someone else's row with that token is not theirs to forget.
create or replace function public.push_device_forget(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_gone integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  delete from push_devices where token = p_token and user_id = v_user;
  get diagnostics v_gone = row_count;
  return jsonb_build_object('forgotten', v_gone);
end $$;
revoke execute on function public.push_device_forget(text) from public, anon;
grant execute on function public.push_device_forget(text) to authenticated;

/* ----------------------------------------- the ledger learns push_send --- */
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send'));
