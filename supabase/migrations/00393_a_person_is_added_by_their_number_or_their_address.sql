-- 00393 · A person is added by their number or their address.
--
-- Add people's one person (Ruben, 10 Oct 2026: "only required info is needed if it's only a number or email"). The
-- member's door to a person typed by hand, create_person (00053, 00331, 00342), takes a number alone, so a client known
-- only by an email could be brought in from a file (import_person, 00170) but not added. add_person is that door with
-- either: a number in international form, an address, or both, and a name if known; through resolve_person, the one door
-- a person is resolved by (decision 0034): found by the number, then the address, two numbers being two people; filled
-- where empty and never overwritten; never merged, a doubt answered instead; a person who asked to be forgotten refused
-- (PE001); asserted, since a member typed it; the added event saying where they came from (the source, 'manual' by
-- default, as create_person's). create_person keeps its signature and its callers, so either deploy order holds: an app
-- that does not know add_person calls what it called.

create or replace function public.add_person(
  p_tenant_id uuid,
  p_phone_e164 text,
  p_email text,
  p_display_name text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), '');
  v_phone  text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_out    jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  -- import_person's rule for an address (00170), so a person added by hand and one brought in from a file are read alike.
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  v_out := public.resolve_person(p_tenant_id, null, null, v_phone, v_email, v_name, 'asserted', v_source,
                                 jsonb_build_object('title', null));
  return jsonb_build_object(
    'contact_id', v_out->>'contact_id',
    'existed', (v_out->>'existed')::boolean,
    'email', v_out->'email',
    'source', v_source
  );
end $$;

revoke execute on function public.add_person(uuid, text, text, text, text) from public, anon;
grant execute on function public.add_person(uuid, text, text, text, text) to authenticated;
comment on function public.add_person(uuid, text, text, text, text) is
  'Owner or operator adds a person by their number, their address or both, through resolve_person (00342): get-or-create by number then address; a name and an address fill only what is empty; consent stays unknown; the added event says where they came from. A person who asked to be forgotten is refused (PE001).';
