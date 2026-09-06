-- 00053 · People from the calendar, on their own.
--
-- An appointment that carries a phone number puts its person in People
-- without a click: when an owner opens the Calendar (through the door
-- below, under their own membership) and every hour by a sweep on the
-- edge (with the service role). A person nobody wants is deleted from
-- their profile. Consent stays 'unknown' either way — a booking is not a
-- yes to offers by WhatsApp.
--
-- The door now records a `contact.added` event for each person it creates
-- (members may read events, never write them), naming the appointment,
-- so the profile can say "Added from your calendar (Maria Lopez - Balayage)".

drop function if exists public.create_person(uuid, text, text, text);

create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text, p_title text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_name    text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), '');
  v_phone   text := btrim(coalesce(p_phone_e164, ''));
  v_source  text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_id      uuid;
  v_existed boolean := false;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;

  select c.id into v_id
    from contacts c
   where c.tenant_id = p_tenant_id
     and c.phone_e164 = v_phone
     and c.erased_at is null
     and c.merged_into_contact_id is null
   limit 1;

  if v_id is not null then
    v_existed := true;
    -- A name we did not have is worth keeping; one we have is never overwritten.
    if v_name is not null then
      update contacts set display_name = v_name, updated_at = now()
       where id = v_id and display_name is null;
    end if;
  else
    begin
      insert into contacts (tenant_id, phone_e164, display_name)
      values (p_tenant_id, v_phone, v_name)
      returning id into v_id;
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
              jsonb_build_object('source', v_source, 'title', p_title, 'by', v_user));
    exception when unique_violation then
      -- Someone else won the race: theirs is the one, nothing is created twice.
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
       limit 1;
      v_existed := true;
    end;
  end if;

  return jsonb_build_object('contact_id', v_id, 'existed', v_existed, 'source', v_source);
end $$;

revoke execute on function public.create_person(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_person(uuid, text, text, text, text) to authenticated;
comment on function public.create_person(uuid, text, text, text, text) is
  'Owner or operator adds a person by phone — get-or-create; a name fills only an empty one; consent stays unknown; a contact.added event says where they came from.';

-- The hourly sweep, the same door the playbooks, deadman and health sweeps use.
create or replace function public.trigger_calendar_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'calendar sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/calendar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.trigger_calendar_sweep() from public, anon, authenticated;

select cron.schedule('calendar-people-sweep', '23 * * * *', $$select public.trigger_calendar_sweep()$$);
