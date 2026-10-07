-- 00341 · A note keeps nothing of a person erased elsewhere.
--
-- Decision 0036, its open question answered (Ruben, 6 October 2026): an erasure takes the person's own notes with them
-- (person_notes_erase_on_contact, 00158), but a note about someone else could still carry their number or address, as
-- "call Ana's husband on 555 010 0123", and nothing reached it. Now it is scrubbed in place: each spelling of the
-- person's numbers and each of their addresses, the needles the delivery and Ask scrubs find a person by (erasure.ts
-- erasureKeys), is overwritten with "[erased]" in every other note of the workspace. Nothing of anyone else's is
-- deleted, and names are left, since a name is not a key and matching one would take words that are not the person's.
-- The delivery and Ask scrubs delete the rows they find (00336, 00238); a note is someone else's record, so its words
-- stay and only the needle goes.
--
--   person_notes_scrub(p_tenant_id, p_contact_id, p_needles)
--       The notes of the workspace, but the person's own, that name a needle, matched without regard to case (a needle
--       of six characters or more, its %, _ and \ characters themselves); each needle replaced, longest first, so the
--       digits inside a longer spelling leave no tail; the version moved on, so an edit begun before it cannot write the
--       old words back. Answers how many notes changed. The service role's alone: the erasure route calls it after the
--       owner's check, before the rows go (fail closed) and again after (best effort), as it calls provider_events_scrub.
--
-- Either deploy order: a function nothing calls until the dashboard does, and a dashboard that calls it on a database
-- without it finds nothing to scrub. Re-runnable: the function replaced.

set local lock_timeout = '3s';

create or replace function public.person_notes_scrub(p_tenant_id uuid, p_contact_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needles  text[];
  v_patterns text[];
  v_needle   text;
  v_body     text;
  v_changed  integer := 0;
  r          record;
begin
  select coalesce(array_agg(n order by char_length(n) desc, n), '{}')
    into v_needles
    from (select distinct lower(btrim(x)) as n from unnest(coalesce(p_needles, '{}'::text[])) x) d
   where char_length(n) >= 6;
  if cardinality(v_needles) = 0 then
    return 0;
  end if;
  select array_agg('%' || replace(replace(replace(n, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into v_patterns
    from unnest(v_needles) n;

  for r in
    select n.id, n.body
      from public.person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id is distinct from p_contact_id
       and lower(n.body) like any (v_patterns)
       for update
  loop
    v_body := r.body;
    foreach v_needle in array v_needles loop
      -- Every character of the needle as itself: a number's + and ( are not the pattern's.
      v_body := regexp_replace(v_body, regexp_replace(v_needle, '([^[:alnum:]])', '\\\1', 'g'), '[erased]', 'gi');
    end loop;
    if v_body is distinct from r.body then
      update public.person_notes
         set body = left(v_body, 600), version = version + 1
       where id = r.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end $$;
revoke all on function public.person_notes_scrub(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.person_notes_scrub(uuid, uuid, text[]) to service_role;
comment on function public.person_notes_scrub(uuid, uuid, text[]) is
  'An erasure''s hand in other people''s notes (decision 0036): each of the person''s numbers and addresses overwritten with [erased] in place, the note''s version moved on; nothing deleted, names left. Answers how many notes changed. Service role only.';
