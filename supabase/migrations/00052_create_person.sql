-- 00052 · A person added by hand: from an appointment on the calendar, or
-- any place an owner meets a number before the number writes in.
--
-- Until now people were created only by the receptionist, when they wrote
-- or called. An appointment on the owner's calendar carries the phone a
-- booking tool wrote, and the owner wants that person in People before
-- they ever message — so their next visit shows on their profile and the
-- receptionist knows them the day they do call.
--
-- Get-or-create by phone, through a definer door: the session role does
-- not insert into contacts, and `contacts_tenant_phone_uq` is a partial
-- index PostgREST cannot target. A name fills only an empty one. Consent
-- stays 'unknown' — a booking is not a yes to offers by WhatsApp. Owner or
-- operator.

create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_name    text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), '');
  v_phone   text := btrim(coalesce(p_phone_e164, ''));
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
    exception when unique_violation then
      -- Someone else won the race: theirs is the one, nothing is created twice.
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
       limit 1;
      v_existed := true;
    end;
  end if;

  return jsonb_build_object('contact_id', v_id, 'existed', v_existed, 'source', coalesce(p_source, 'manual'));
end $$;

revoke execute on function public.create_person(uuid, text, text, text) from public, anon;
grant execute on function public.create_person(uuid, text, text, text) to authenticated;
comment on function public.create_person(uuid, text, text, text) is
  'Owner or operator adds a person by phone — get-or-create; a name fills only an empty one; consent stays unknown.';
