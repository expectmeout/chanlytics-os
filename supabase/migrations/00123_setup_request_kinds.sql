-- 00123 · two more things an owner can ask a person at Chanlytics for: to
-- bring the number they already have onto Chanlytics (a port), and to repair
-- a configuration the receptionist can no longer read (the wiring audit's
-- S14 and S8).
--
-- The one request was a phone line, so "Bring my number" filed a line
-- request and its row then said "set up your line"; and a broken
-- configuration told the owner Chanlytics repairs it, with no way to ask.
-- Same function and same record as 00065 -- a bell row for the workspace, a
-- setup.requested event for the platform, one ask a day per thing -- and each
-- thing now says what was asked for.

create or replace function public.setup_request(p_tenant_id uuid, p_what text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_title text;
  v_body text;
  v_route text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_what is null or p_what not in ('line', 'port', 'repair') then
    raise exception 'Unknown request.' using errcode = '22023';
  end if;

  select max(e.created_at) into v_last
    from events e
   where e.tenant_id = p_tenant_id
     and e.kind = 'setup.requested'
     and e.data->>'what' = p_what;
  if v_last is not null and v_last > now() - interval '1 day' then
    return jsonb_build_object('ok', true, 'already', true, 'requested_at', v_last);
  end if;

  if p_what = 'line' then
    v_title := 'We got your request for a phone line';
    v_body := 'A person at Chanlytics will set up your line with you — a number, the receptionist answering it, and forwarding from the number you have. You will hear from us by email.';
    v_route := 'admin/setup';
  elsif p_what = 'port' then
    v_title := 'We got your request to bring your number';
    v_body := 'A person at Chanlytics will move the number you have onto Chanlytics with you. Keep your current phone service until the move is finished — cancelling it first can lose the number. You will hear from us by email.';
    v_route := 'admin/setup';
  else
    v_title := 'We got your request to repair your settings';
    v_body := 'A person at Chanlytics will repair the business settings the receptionist can no longer read; until then it stays silent. You will hear from us by email.';
    v_route := 'admin/workspace';
  end if;

  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
  values (p_tenant_id, 'alert', v_title, v_body, v_route, 'setup', null);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'setup.requested', 'setup', 'tenant', p_tenant_id,
          jsonb_build_object('what', p_what, 'by', v_user));

  return jsonb_build_object('ok', true, 'already', false, 'requested_at', now());
end $$;

revoke all on function public.setup_request(uuid, text) from public, anon;
grant execute on function public.setup_request(uuid, text) to authenticated;
comment on function public.setup_request(uuid, text) is
  'Setup: the owner asks a person at Chanlytics for something the product cannot do by itself -- a phone line, bringing a number over, or repairing a configuration the receptionist cannot read. A bell row for the workspace, an event for the platform; idempotent within a day per thing.';
