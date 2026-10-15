-- 00439 · The business has one name.
--
-- The wiring's second audit, X4-5 (Ruben, 15 October 2026, as recommended). A workspace's name (tenants.name) is what its
-- sign-up page, the page's paper form, the desk sign, the unsubscribe page and a carrier filing call the business; the
-- receptionist introduces it by its settings' business name. Only Chanlytics could change the first, so a business that
-- renamed itself in Settings was answered under one name and asked for a yes under another.
--
--   tenants.name             an owner may change it, as they change the zone and how customers buy (00084, 00160): the
--                            column granted, and tenants_owner_update's policy (who may change settings) the floor.
--                            The dashboard renames it with the business's name an owner saves, and the ledger keeps
--                            the name it changed from and to (settings.changed). A filing's name does not follow: the
--                            carriers hold it, and a change to it is asked for (setup_request 'name', below).
--   sole_proprietor_of       whether a workspace's business on record has no tax id: the public page asks it to say a
--                            sole proprietor's whereabouts by city alone, and never reads the tax id itself.
--   setup_request            takes 'name': the owner asks a person at Chanlytics to change the name the carriers hold,
--                            which only a new campaign can.
--   lines.facts              each campaign already filed keeps the name it was filed under (a2p_campaign_name), which a
--                            START by text is confirmed in: the workspace's name, which no owner could change before
--                            this migration, so its name now. A filing from now on keeps it as it files the campaign.
--
-- Deploy order: this migration first. A dashboard that renames before it is applied is refused by the column grant
-- and says the name was not changed; a public page that asks sole_proprietor_of before it exists fails its read. Re-runnable.

set local lock_timeout = '3s';

grant update (name) on table public.tenants to authenticated;

update public.lines l
   set facts = l.facts || jsonb_build_object('a2p_campaign_name', t.name)
  from public.tenants t
 where t.id = l.tenant_id
   and l.campaign_sid is not null
   and jsonb_typeof(l.facts) = 'object'
   and not (l.facts ? 'a2p_campaign_name');

create or replace function public.sole_proprietor_of(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(btrim(r.ein), '') = '' from public.business_records r where r.tenant_id = p_tenant_id;
$$;
revoke execute on function public.sole_proprietor_of(uuid) from public, anon, authenticated;
grant execute on function public.sole_proprietor_of(uuid) to service_role;
comment on function public.sole_proprietor_of(uuid) is
  'Whether a workspace''s business on record has no tax id: filed as one person, a sole proprietor (00439); null with nothing on record. The public page asks it to say where such a business is by city alone, without ever reading the tax id. Service role: the public pages read with it.';

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
  if p_what is null or p_what not in ('line', 'port', 'repair', 'forwarding', 'name') then
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
  elsif p_what = 'name' then
    v_title := 'We got your request to change your name with the carriers';
    v_body := 'A person at Chanlytics will change the name the carriers hold for your texting to the one you saved. Until then, the text confirming a START says the name you filed. You will hear from us by email.';
    v_route := 'admin/workspace';
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
  'Setup: the owner asks a person at Chanlytics for something the product cannot do by itself -- a phone line, bringing a number over, setting up forwarding in an office phone system, repairing a configuration the receptionist cannot read, or changing the name the carriers hold (00439). A bell row for the workspace, an event for the platform; idempotent within a day per thing.';
