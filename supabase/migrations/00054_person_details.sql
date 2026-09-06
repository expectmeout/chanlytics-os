-- 00054 · A person's name, and the owner's notes on them.
--
-- Most people arrive as a number: WhatsApp gives a profile name, the calendar
-- a guess, the phone nothing. The owner knows who they are, so the owner
-- can name them. And the owner knows things no message carries — who they
-- see, what they like, what not to say — so one short field of notes rides
-- into what both receptionists are told about the person. Never sent to the
-- customer, never read aloud; facts for the receptionist to use.
--
-- Two definer doors, owner or operator. A cleared name falls back to the
-- WhatsApp name or the number; a cleared note is simply gone. Each records
-- an event, so the profile can say who changed what.

alter table public.contacts add column if not exists notes text;
alter table public.contacts drop constraint if exists contacts_notes_check;
alter table public.contacts add constraint contacts_notes_check
  check (notes is null or char_length(notes) between 1 and 600);
comment on column public.contacts.notes is
  'The owner''s notes on this person, in their own words; the receptionist reads them. Never sent to the customer.';
grant select (notes) on public.contacts to authenticated;

create or replace function public.set_person_name(p_contact_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set display_name = v_name, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_build_object('name', v_name, 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'name', v_name);
end $$;

revoke execute on function public.set_person_name(uuid, text) from public, anon;
grant execute on function public.set_person_name(uuid, text) to authenticated;
comment on function public.set_person_name(uuid, text) is
  'Owner or operator names a person; empty clears it and the WhatsApp name or the number shows again.';

create or replace function public.set_person_notes(p_contact_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_notes is not null and char_length(v_notes) > 600 then
    raise exception 'Notes are at most 600 characters.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set notes = v_notes, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.noted', 'contact', 'contact', p_contact_id,
          jsonb_build_object('chars', coalesce(char_length(v_notes), 0), 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'notes', v_notes);
end $$;

revoke execute on function public.set_person_notes(uuid, text) from public, anon;
grant execute on function public.set_person_notes(uuid, text) to authenticated;
comment on function public.set_person_notes(uuid, text) is
  'Owner or operator writes the notes the receptionist reads about a person; empty clears them. Never sent to the customer.';
