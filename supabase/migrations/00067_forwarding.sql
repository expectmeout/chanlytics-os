-- 00067 · keep the number you have: a forwarded line (plan §5, part 4).
--
-- The owner's own number gets a `lines` row of kind 'forwarded' with
-- provider 'carrier' — no provisioning, only forwarding_state (instructed →
-- verified) and facts: the carrier, the mode, the receptionist's number the
-- calls go to, the phone the owner will test from, and the test window.
-- The two functions below are the only write paths from the dashboard; the
-- webhook (service role) marks a line verified when a test call arrives.

alter table public.lines drop constraint if exists lines_provider_check;
alter table public.lines add constraint lines_provider_check
  check (provider in ('twilio', 'dry', 'carrier'));

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
  if p_carrier is null or p_carrier not in ('verizon', 'att', 'tmobile', 'other') then
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
  'Keep my number: the one forwarded row per workspace — the number kept, the carrier, the mode, the receptionist''s line it forwards to, the phone to test from. Instructed until a test call proves it.';

create or replace function public.line_forwarding_test(p_tenant_id uuid, p_line_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz := now() + interval '30 minutes';
  v_found uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.lines
     set forwarding_state = 'instructed',
         state_since = now(),
         facts = facts || jsonb_build_object('test_started_at', now(), 'test_until', v_until) - 'verified_at' - 'verified_call_id' - 'verified_from'
   where id = p_line_id and tenant_id = p_tenant_id and kind = 'forwarded'
   returning id into v_found;
  if v_found is null then
    raise exception 'No such forwarded line.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'test_until', v_until);
end $$;
revoke all on function public.line_forwarding_test(uuid, uuid) from public, anon;
grant execute on function public.line_forwarding_test(uuid, uuid) to authenticated;
comment on function public.line_forwarding_test(uuid, uuid) is
  'Keep my number: open a 30-minute test window. A call to the kept number that arrives on the receptionist''s line inside it marks the row verified (the call webhook does that).';
