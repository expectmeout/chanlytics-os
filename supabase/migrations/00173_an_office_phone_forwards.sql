-- 00173 · An office phone system forwards, and a person can set it up with you.
--
-- The first run's phone step, part 4c (docs/superpowers/plans/2026-09-24-first-run-4-phone.md; the spec's decision 3):
-- an office phone system (RingCentral, Vonage and the like) takes no star code, so the owner is shown the
-- receptionist's number to forward to in the system's own settings, with a person at Chanlytics offered to do it
-- with them on a call.
--
-- Two functions, each redefined whole with one more value and nothing else changed:
--   * line_forwarding_set (00067) takes the carrier 'office': the forwarded row then says the forwarding is set in a
--     phone system, and the test window and the call webhook prove it exactly as they prove a star code.
--   * setup_request (00123) takes 'forwarding': the owner asks a person to set the forwarding up with them. The same
--     bell row and setup.requested event as a line, a port or a repair, one ask a day, and its bell opens the phone
--     step (start/phone).
-- Same signatures, so every caller keeps calling them, and a dashboard that never sends either value is unchanged:
-- either deploy order works, and the office choice only succeeds once this has landed.

create or replace function public.line_forwarding_set(
  p_tenant_id uuid,
  p_number text,
  p_carrier text,
  p_mode text,
  p_test_from text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_destination text;
  v_facts       jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_number is null or p_number !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'The number to keep must be a full number, like +13055550100.' using errcode = '22023';
  end if;
  if p_carrier is null or p_carrier not in ('verizon', 'att', 'tmobile', 'other', 'office') then
    raise exception 'Unknown carrier.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('unanswered', 'always') then
    raise exception 'Unknown forwarding mode.' using errcode = '22023';
  end if;
  if p_test_from is not null and p_test_from !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'The phone you will test from must be a full number.' using errcode = '22023';
  end if;

  -- The receptionist's line: where the calls go. Without one there is nothing to forward to.
  select number_e164 into v_destination
    from public.tenant_channels
   where tenant_id = p_tenant_id and kind = 'voice' and status = 'active' and number_e164 is not null
   order by created_at
   limit 1;
  if v_destination is null then
    raise exception 'Your receptionist has no line to forward to yet.' using errcode = 'P0001';
  end if;
  if v_destination = p_number then
    raise exception 'That is the receptionist''s own number — forward the number you keep, not this one.' using errcode = '22023';
  end if;

  v_facts := jsonb_build_object(
    'carrier', p_carrier,
    'mode', p_mode,
    'destination_e164', v_destination,
    'test_from', p_test_from
  );

  select id into v_id from public.lines where tenant_id = p_tenant_id and kind = 'forwarded' order by created_at limit 1;
  if v_id is null then
    insert into public.lines (tenant_id, e164, kind, provider, forwarding_state, state_since, facts)
    values (p_tenant_id, p_number, 'forwarded', 'carrier', 'instructed', now(), v_facts)
    returning id into v_id;
  else
    update public.lines
       set e164 = p_number, forwarding_state = 'instructed', state_since = now(), facts = v_facts, last_error = null
     where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.line_forwarding_set(uuid, text, text, text, text) from public, anon;
grant execute on function public.line_forwarding_set(uuid, text, text, text, text) to authenticated;
comment on function public.line_forwarding_set(uuid, text, text, text, text) is
  'Keep my number: the one forwarded row per workspace — the number kept, the carrier (or an office phone system), the mode, the receptionist''s line it forwards to, the phone to test from. Instructed until a test call proves it.';

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
  if p_what is null or p_what not in ('line', 'port', 'repair', 'forwarding') then
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
  elsif p_what = 'forwarding' then
    v_title := 'We got your request to set up forwarding';
    v_body := 'A person at Chanlytics will set up forwarding in your phone system with you on a call. You will hear from us by email to find a time.';
    v_route := 'start/phone';
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
  'Setup: the owner asks a person at Chanlytics for something the product cannot do by itself -- a phone line, bringing a number over, setting up forwarding in an office phone system, or repairing a configuration the receptionist cannot read. A bell row for the workspace, an event for the platform; idempotent within a day per thing.';
