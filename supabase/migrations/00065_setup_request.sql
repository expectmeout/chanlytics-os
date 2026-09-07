-- 00065 · a setup request: the owner asks for something only a person at
-- Chanlytics can do yet (a phone line, until lines provision themselves).
--
-- Recorded twice: as a notification the workspace's own bell shows ("we got
-- it"), and as an event the platform reads. Nothing is provisioned here. A
-- second ask for the same thing inside a day is the same ask.

create or replace function public.setup_request(p_tenant_id uuid, p_what text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_what is null or p_what not in ('line') then
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

  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
  values (p_tenant_id, 'alert',
          'We got your request for a phone line',
          'A person at Chanlytics will set up your line with you — a number, the receptionist answering it, and forwarding from the number you have. You will hear from us by email.',
          'admin/setup', 'setup', null);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'setup.requested', 'setup', 'tenant', p_tenant_id,
          jsonb_build_object('what', p_what, 'by', v_user));

  return jsonb_build_object('ok', true, 'already', false, 'requested_at', now());
end $$;

revoke all on function public.setup_request(uuid, text) from public, anon;
grant execute on function public.setup_request(uuid, text) to authenticated;
comment on function public.setup_request(uuid, text) is
  'Setup: the owner asks a person at Chanlytics for something the product cannot provision yet. A bell row for the workspace, an event for the platform; idempotent within a day.';
