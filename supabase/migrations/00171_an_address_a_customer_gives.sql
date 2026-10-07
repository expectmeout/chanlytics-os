-- 00171 · An address a customer gives.
--
-- When the receptionist has asked for an email address and the customer writes
-- one back, the edge keeps it at ingest (Part 0 of
-- docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md; the
-- plan is docs/superpowers/plans/2026-09-24-capture-emails-part-0.md, Task 11).
-- The edge holds the service key and no session, and set_person_email (00125)
-- refused that call with "Sign in required.", so the edge would have had to
-- write contacts.email directly, with no event -- the way the email intake
-- does. The door takes the edge's call instead, as set_marketing_consent does
-- (00142: no session at all is the edge, holding the service key, recording
-- what a customer texted), and its event says where the address came from:
-- 'customer_message' with no session, 'member' with one. A signed-in caller
-- still has to act where the person lives, and an erased person is not found,
-- whoever asks. Never the address in the event: events outlive an erasure
-- (00027), so nothing that identifies a person belongs in one.
--
-- Same signature as 00125, so every caller -- the details route, 00142's lead
-- conversion, 00170's import door -- keeps calling it, and 00170 and this file
-- may land in either order. The body is 00125's, word for word, but for the
-- session rule and the event's source. Re-runnable: create or replace, the
-- grants and the comment restated. No lock guard: replacing a function takes
-- no table lock; the guard in 00166, 00167 and 00170 is for the ACCESS
-- EXCLUSIVE an ALTER TABLE takes.

create or replace function public.set_person_email(p_contact_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  -- No session is the edge recording what a customer wrote; a session must be
  -- a member's where the person lives. Either way an erased person, or one in
  -- a workspace the caller does not act in, does not exist.
  if v_tenant is null or (v_user is not null and not public.is_acting_member(v_tenant)) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  begin
    update contacts set email = v_email, updated_at = now() where id = p_contact_id;
  exception when unique_violation then
    raise exception 'Another person here already has that address.' using errcode = '23505';
  end;
  -- Who, and which path: a member's id and 'member', or null and
  -- 'customer_message'. Never the address.
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.email_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_email is not null, 'by', v_user,
                             'source', case when v_user is null then 'customer_message' else 'member' end));
  return jsonb_build_object('contact_id', p_contact_id, 'email', v_email);
end $$;

-- The edge calls with the service key. service_role could already execute the
-- door through the default privileges a function in public is created with;
-- the grant says so where the door is defined, as 00142's does.
revoke execute on function public.set_person_email(uuid, text) from public, anon;
grant execute on function public.set_person_email(uuid, text) to authenticated, service_role;
comment on function public.set_person_email(uuid, text) is
  'Set or clear a person''s email address: a member where the person lives, or the edge with no session recording what the customer wrote. One address per person per workspace; the event says which of the two set it, never the address.';
