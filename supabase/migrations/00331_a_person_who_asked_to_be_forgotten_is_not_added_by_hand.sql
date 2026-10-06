-- 00331 · A person who asked to be forgotten is not added by hand.
--
-- create_person (00053) is the door a member adds a person through: POST contacts, and the calendar board, which
-- puts the people the feed's appointments name in People as it opens (apps/dashboard/src/server/calendar/people-seen.ts).
-- It looked for a living row by number and made one when none was there, and never asked whether the number had been
-- erased: the digest kept on the erased row (contacts.erased_phone_hash, "so the calendar import and a late call
-- event do not bring the person back") was read by the sweep's own insert (apps/edge/lib/calendar/calendar-people.ts)
-- and by import_person (00263), and not here. So an owner opening the Calendar or Today brought back, from their own
-- appointment, a person who had asked to be forgotten (the wiring trace, 5 October 2026; decision 0034, step 0).
--
-- Now the door makes the digest itself (00263 erasure_digest, legacy until the re-key, keyed after) and refuses the
-- number with import_person's words and code, PE001, which the board skips as one person refused, not everyone, and
-- the route answers as the door's own refusal. Everything else is 00053's: get-or-create by number, a name fills only
-- an empty one, consent untouched, a contact.added event saying where they came from. Re-runnable.

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
  -- Someone who asked to be forgotten is not brought back by their own appointment, nor by a member typing their
  -- number: the digest is made here (00263), never handed in, and the refusal is import_person's.
  if exists (
    select 1
      from contacts c
     where c.tenant_id = p_tenant_id
       and c.erased_phone_hash = public.erasure_digest(p_tenant_id, v_phone)
  ) then
    raise exception 'That person asked to be forgotten.' using errcode = 'PE001';
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
  'Owner or operator adds a person by phone — get-or-create; a name fills only an empty one; consent stays unknown; a contact.added event says where they came from. A number whose person asked to be forgotten is refused (PE001, 00331).';
