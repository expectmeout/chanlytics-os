-- 00249 · An erased person's digest is keyed with a secret the database alone holds.
--
-- An erasure keeps one digest per identifier (00124 the number, 00125 the address, 00140 the never-again list) so the
-- passive doors can recognise the person and leave them erased. The digest was sha256 of "<tenant id>:<value>", and a
-- phone number is ten digits: anyone holding a dump of contacts or lead_suppressions and a workspace id could hash
-- every number in a country in minutes and read who asked to be forgotten (the scorecard, 26 and 28 September 2026).
--
-- Now the digest is keyed: 'h1:' || hmac-sha256(pepper, the old digest), the pepper a random secret in Vault that no
-- dump of the tables carries and no member, script or edge reads. Keying the OLD digest, not the value, is what lets
-- the stored rows be re-keyed at all: an erased person's number is gone, and only its old digest remains to key.
--
--   erasure_digest(tenant, value)   the one place a digest is made. Legacy (the old sha256) until the re-key has run,
--                                   keyed after it, so every writer and every reader agree at every moment: nothing
--                                   compares a keyed digest with a legacy one. lead_suppression_hash (00140), which 60
--                                   statements across the lead finder and Reach out call, now answers it.
--   erasure_digests(tenant, values) the same for the edge and the dashboard, in order, through the service role: they
--                                   no longer compute a digest (contracts' erasure.ts keeps the legacy one for tests).
--   erasure_rekey(apply, tenant)    counts what is still legacy, and with apply re-keys it in one transaction --
--                                   contacts' two erased digests, lead_suppressions, and the hashes Reach out's replies
--                                   keep for their undo (reach_out_replies.plan) -- then marks the database keyed. Only
--                                   rows not yet keyed are touched (the 'h1:' prefix), so a second run changes nothing.
--                                   A run kept to one workspace (a test's) keys its rows and leaves the mark alone.
--                                   A never-again row whose keyed twin already stands (the same value suppressed again
--                                   after the mark, while a row written during the re-key stayed legacy) goes, the
--                                   twin keeping the stronger reason, so the table's key stays unique.
--                                   tooling/scripts/ops/erasure-rekey.mjs runs it: a dry run by default, a JSONL
--                                   backup of every row it will change before it writes, --apply to mean it.
--   the two triggers                once the mark is set, a legacy digest that still arrives (a writer deployed before
--                                   it, a statement that began before the re-key committed) is keyed where it lands,
--                                   on contacts and on lead_suppressions, so nothing legacy is stored after the mark.
--   import_person (00170)           reads the database's own digest; the one it was handed is ignored.
--
-- Additive until the re-key runs: until then every digest is exactly what it was. Apply before the apps (the edge and
-- the dashboard ask erasure_digests); the re-key runs after both have deployed. Re-runnable.

set local lock_timeout = '3s';

-- The pepper, made here so it exists in Vault and nowhere else (as 00018 made the sweep key).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'erasure_pepper') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'erasure_pepper',
      'The key erased people''s digests are made with (00249). Never rotated in place: the stored digests are keyed with it.');
  end if;
end $$;

-- Whether the stored digests have been re-keyed: one row, written once by erasure_rekey.
create table if not exists public.erasure_keying (
  id        boolean primary key default true check (id),
  keyed_at  timestamptz
);
insert into public.erasure_keying (id) values (true) on conflict (id) do nothing;
alter table public.erasure_keying enable row level security;
revoke all on public.erasure_keying from public, anon, authenticated;
comment on table public.erasure_keying is
  'When the stored erasure digests were re-keyed (00249 erasure_rekey): null until then, and every digest is the legacy sha256 until then.';

-- The old digest: the inner half of the keyed one, and the only one there is until the re-key.
create or replace function public.erasure_digest_legacy(p_tenant_id uuid, p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(p_tenant_id::text || ':' || p_value, 'UTF8')), 'hex')
$$;
revoke execute on function public.erasure_digest_legacy(uuid, text) from public, anon, authenticated;

-- A legacy digest keyed with the pepper; one already keyed is answered as it is.
create or replace function public.erasure_key(p_digest text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pepper text;
begin
  if p_digest is null or p_digest like 'h1:%' then
    return p_digest;
  end if;
  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'erasure_pepper';
  if v_pepper is null then
    raise exception 'erasure_key: no pepper in Vault' using errcode = 'P0001';
  end if;
  return 'h1:' || encode(extensions.hmac(p_digest, v_pepper, 'sha256'), 'hex');
end $$;
revoke execute on function public.erasure_key(text) from public, anon, authenticated;
grant execute on function public.erasure_key(text) to service_role;

-- The one place a digest is made: legacy until the re-key, keyed after it.
create or replace function public.erasure_digest(p_tenant_id uuid, p_value text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_value is null then null
    when (select k.keyed_at from public.erasure_keying k where k.id) is null
      then public.erasure_digest_legacy(p_tenant_id, p_value)
    else public.erasure_key(public.erasure_digest_legacy(p_tenant_id, p_value))
  end
$$;
revoke execute on function public.erasure_digest(uuid, text) from public, anon, authenticated;
grant execute on function public.erasure_digest(uuid, text) to service_role;

-- 00140's digest, now the one above: every statement that calls it keeps its meaning and follows the re-key.
create or replace function public.lead_suppression_hash(p_tenant_id uuid, p_value text)
returns text
language sql
stable
set search_path = public
as $$
  select public.erasure_digest(p_tenant_id, p_value)
$$;
comment on function public.lead_suppression_hash(uuid, text) is
  'The erasure digest (00249 erasure_digest): legacy sha256 of "<tenant_id>:<value>" until the re-key, keyed with Vault''s pepper after it.';
revoke execute on function public.lead_suppression_hash(uuid, text) from public, anon, authenticated;

-- The same for the edge and the dashboard: one digest per value, in order, null for null.
create or replace function public.erasure_digests(p_tenant_id uuid, p_values text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(public.erasure_digest(p_tenant_id, v) order by n), '{}')
    from unnest(p_values) with ordinality as u(v, n)
$$;
revoke execute on function public.erasure_digests(uuid, text[]) from public, anon, authenticated;
grant execute on function public.erasure_digests(uuid, text[]) to service_role;

-- The re-key: counted always, written only with p_apply, once.
create or replace function public.erasure_rekey(p_apply boolean default false, p_tenant_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone   integer;
  v_email   integer;
  v_supp    integer;
  v_replies integer;
  v_keyed   timestamptz;
begin
  select count(*) into v_phone from contacts
   where erased_phone_hash is not null and erased_phone_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_email from contacts
   where erased_email_hash is not null and erased_email_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_supp from lead_suppressions
   where hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_replies from reach_out_replies o
   where (p_tenant_id is null or o.tenant_id = p_tenant_id)
     and exists (select 1 from jsonb_array_elements(
                   case when jsonb_typeof(o.plan->'changed'->'holds') = 'array' then o.plan->'changed'->'holds' else '[]'::jsonb end
                   || case when jsonb_typeof(o.plan->'changed'->'suppressions') = 'array' then o.plan->'changed'->'suppressions' else '[]'::jsonb end) x
                  where x->>'hash' is not null and x->>'hash' not like 'h1:%');
  select keyed_at into v_keyed from erasure_keying where id;
  if p_apply then
    update contacts set erased_phone_hash = erasure_key(erased_phone_hash)
     where erased_phone_hash is not null and erased_phone_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
    update contacts set erased_email_hash = erasure_key(erased_email_hash)
     where erased_email_hash is not null and erased_email_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
    -- A legacy row whose keyed twin stands: the twin keeps the stronger reason (an erasure wins, as 00177's writers
    -- say), and the legacy row goes, so re-keying it cannot collide on (tenant_id, kind, hash).
    create temporary table erasure_rekey_twins on commit drop as
      select s.id, s.tenant_id, s.kind, s.what, erasure_key(s.hash) as keyed
        from lead_suppressions s
       where s.hash not like 'h1:%' and (p_tenant_id is null or s.tenant_id = p_tenant_id);
    update lead_suppressions k set what = 'erased'
      from erasure_rekey_twins t
     where t.what = 'erased' and k.what <> 'erased'
       and k.tenant_id = t.tenant_id and k.kind = t.kind and k.hash = t.keyed;
    delete from lead_suppressions s
     using erasure_rekey_twins t
     where s.id = t.id
       and exists (select 1 from lead_suppressions k
                    where k.tenant_id = t.tenant_id and k.kind = t.kind and k.hash = t.keyed);
    update lead_suppressions s set hash = t.keyed
      from erasure_rekey_twins t
     where s.id = t.id;
    drop table erasure_rekey_twins;
    -- Only the two lists a reply keeps for its undo, each where it is; the rest of the plan as it was.
    update reach_out_replies o
       set plan = o.plan || jsonb_build_object('changed', (o.plan->'changed')
             || case when o.plan->'changed' ? 'holds'
                     then jsonb_build_object('holds', public.erasure_rekey_hashes(o.plan->'changed'->'holds'))
                     else '{}'::jsonb end
             || case when o.plan->'changed' ? 'suppressions'
                     then jsonb_build_object('suppressions', public.erasure_rekey_hashes(o.plan->'changed'->'suppressions'))
                     else '{}'::jsonb end)
     where jsonb_typeof(o.plan->'changed') = 'object' and (p_tenant_id is null or o.tenant_id = p_tenant_id)
       and exists (select 1 from jsonb_array_elements(
                     case when jsonb_typeof(o.plan->'changed'->'holds') = 'array' then o.plan->'changed'->'holds' else '[]'::jsonb end
                     || case when jsonb_typeof(o.plan->'changed'->'suppressions') = 'array' then o.plan->'changed'->'suppressions' else '[]'::jsonb end) x
                    where x->>'hash' is not null and x->>'hash' not like 'h1:%');
    -- The mark is the whole database's: a run kept to one workspace (a test's) keys its rows and marks nothing.
    if p_tenant_id is null then
      update erasure_keying set keyed_at = coalesce(keyed_at, now()) where id returning keyed_at into v_keyed;
    end if;
  end if;
  return jsonb_build_object(
    'applied', p_apply,
    'contacts_phone', v_phone,
    'contacts_email', v_email,
    'lead_suppressions', v_supp,
    'reach_out_replies', v_replies,
    'keyed_at', v_keyed);
end $$;
revoke execute on function public.erasure_rekey(boolean, uuid) from public, anon, authenticated;
grant execute on function public.erasure_rekey(boolean, uuid) to service_role;

-- A reply's kept holds or suppressions, each element's hash keyed; anything else as it was.
create or replace function public.erasure_rekey_hashes(p_list jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_list is null or jsonb_typeof(p_list) <> 'array' then p_list
    else coalesce((
      select jsonb_agg(case when jsonb_typeof(x->'hash') = 'string'
                            then jsonb_set(x, '{hash}', to_jsonb(public.erasure_key(x->>'hash')))
                            else x end
                       order by n)
        from jsonb_array_elements(p_list) with ordinality as e(x, n)), '[]'::jsonb)
  end
$$;
revoke execute on function public.erasure_rekey_hashes(jsonb) from public, anon, authenticated;

-- Once keyed, a legacy digest that still arrives is keyed where it lands: a writer deployed before the mark, or a
-- statement that began before the re-key committed. Before the mark it is left as it is, as every digest then is.
create or replace function public.erasure_digest_keyed_on_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  if (select k.keyed_at from public.erasure_keying k where k.id) is null then
    return NEW;
  end if;
  if TG_TABLE_NAME = 'contacts' then
    NEW.erased_phone_hash := public.erasure_key(NEW.erased_phone_hash);
    NEW.erased_email_hash := public.erasure_key(NEW.erased_email_hash);
  else
    NEW.hash := public.erasure_key(NEW.hash);
  end if;
  return NEW;
end $;
revoke execute on function public.erasure_digest_keyed_on_write() from public, anon, authenticated;

drop trigger if exists contacts_erasure_digest_keyed on public.contacts;
create trigger contacts_erasure_digest_keyed
  before insert or update of erased_phone_hash, erased_email_hash on public.contacts
  for each row
  when (coalesce(NEW.erased_phone_hash, 'h1:') not like 'h1:%' or coalesce(NEW.erased_email_hash, 'h1:') not like 'h1:%')
  execute function public.erasure_digest_keyed_on_write();

drop trigger if exists lead_suppressions_erasure_digest_keyed on public.lead_suppressions;
create trigger lead_suppressions_erasure_digest_keyed
  before insert or update of hash on public.lead_suppressions
  for each row
  when (NEW.hash not like 'h1:%')
  execute function public.erasure_digest_keyed_on_write();

create or replace function public.import_person(
  p_tenant_id    uuid,
  p_name         text,
  p_phone_e164   text,
  p_email        text,
  p_phone_digest text default null,
  p_email_digest text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_phone     text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_new_email text;
  v_id        uuid;
  v_email_out text := null;   -- 'set' | 'kept' | 'taken' | null
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
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  -- The erased stay erased: a line that names one is left alone (00124, 00125). The digests are the database's own
  -- (00249 erasure_digest, keyed once the re-key has run): a digest the caller hands in is not read, since only the
  -- database holds the pepper.
  if (v_phone is not null and exists (
        select 1 from contacts c
         where c.tenant_id = p_tenant_id and c.erased_phone_hash = public.erasure_digest(p_tenant_id, v_phone)))
     or (v_email is not null and exists (
        select 1 from contacts c
         where c.tenant_id = p_tenant_id and c.erased_email_hash = public.erasure_digest(p_tenant_id, v_email))) then
    raise exception 'That person asked to be forgotten.' using errcode = 'PE001';
  end if;

  -- Find, else make, in two attempts at most: a line that loses a race to make
  -- the same person (their number or their address written by another line
  -- between the look and the insert) looks again and fills the person who won,
  -- rather than dropping its name and its address.
  for v_try in 1..2 loop
    v_id := null;
    if v_phone is not null then
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
    end if;
    if v_id is null and v_email is not null then
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.email = v_email
         and c.erased_at is null and c.merged_into_contact_id is null
         and (v_phone is null or c.phone_e164 is null)  -- two numbers are two people
       limit 1;
    end if;
    exit when v_id is not null;

    -- Nobody: they are made, with the address only when nobody here holds it.
    v_new_email := case
      when v_email is not null
       and not exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email)
      then v_email
    end;
    -- Never a person with neither. The early checks make this impossible for
    -- the line as written; it reads what the insert would write, because the
    -- address may be one another person holds and so be left out.
    if v_phone is null and v_new_email is null then
      raise exception 'A number or an address is needed.' using errcode = '22023';
    end if;
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name)
      values (p_tenant_id, v_phone, v_new_email, v_name)
      returning id into v_id;
    exception when unique_violation then
      if v_try = 2 then
        raise;
      end if;
    end;
    if v_id is not null then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
              jsonb_build_object('source', 'import', 'title', null, 'by', v_user));
      return jsonb_build_object(
        'contact_id', v_id,
        'existed', false,
        'email', case when v_email is null then null when v_new_email is null then 'taken' else 'set' end);
    end if;
  end loop;

  -- Found. A name, a number or an address we did not have is worth keeping; one
  -- we have is never overwritten.
  if v_name is not null then
    update contacts set display_name = v_name, updated_at = now() where id = v_id and display_name is null;
  end if;
  if v_phone is not null then
    begin
      update contacts set phone_e164 = v_phone, updated_at = now() where id = v_id and phone_e164 is null;
    exception when unique_violation then
      null; -- another person here holds the number: theirs stays theirs
    end;
  end if;
  if v_email is not null then
    if exists (select 1 from contacts c where c.id = v_id and c.email is not null) then
      v_email_out := 'kept';
    elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email) then
      v_email_out := 'taken';
    else
      begin
        perform public.set_person_email(v_id, v_email);
        v_email_out := 'set';
      exception when unique_violation then
        v_email_out := 'taken'; -- another line wrote it between the look and the write
      end;
    end if;
  end if;

  return jsonb_build_object('contact_id', v_id, 'existed', true, 'email', v_email_out);
end $$;
