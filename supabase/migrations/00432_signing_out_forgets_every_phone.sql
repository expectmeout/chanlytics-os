-- 00432 · Signing out forgets every phone of the person who signed out.
--
-- The wiring's second audit, lane R11 (S8-3). Sign-out ended the session and left the phone's push_devices row: the
-- business went on pushing handoff and call alerts, with the customer's words, to a phone nobody was signed in to,
-- until someone else signed in on it, and nothing on the phone said so. push_device_forget (00162) forgets one token,
-- which the sign-out route does not hold (the phone's page keeps it). A sign-out ends every session of the person, on
-- every device (the route's signOut is global), so every phone of theirs is forgotten with it: this door, called by
-- the route before the session ends (apps/dashboard/app/auth/signout/route.ts, server/auth/sign-out.ts). A phone the
-- person signs in on again registers itself again, as it does at every sign-in.
--
-- Re-runnable.

create or replace function public.push_devices_forget_all()
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
  delete from push_devices where user_id = v_user;
  get diagnostics v_gone = row_count;
  return jsonb_build_object('forgotten', v_gone);
end $$;
revoke execute on function public.push_devices_forget_all() from public, anon;
grant execute on function public.push_devices_forget_all() to authenticated;
