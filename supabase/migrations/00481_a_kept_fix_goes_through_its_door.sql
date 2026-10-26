-- 00481 · A kept fix goes through its door (decision 0069): the member's own write of a fix kept from a rehearsal.
--
-- Settings › How it answers' Keep writes the settings on the member's session, then appends the fix to its rehearsal,
-- the list "Trained: 3 things" counts. Members read rehearsals and the edge's doors write them (00476), so the
-- dashboard appended the fix through the service role, scoped by hand. This door is that append, as the member:
--
--   rehearsal_fix_keep   A member who may change the workspace's settings (caller_has_permission(..., 'settings'), the
--                        check tenant_config's own update policy makes) appends one fix { op, field, said, version } to
--                        a rehearsal of that workspace, under the row's lock and stamped with the moment, and writes
--                        settings.fix_kept beside it (never the words). Answers how many fixes the rehearsal now keeps.
--                        A viewer, a partner without the second factor and a stranger find no rehearsal.
--
-- Either deploy order works: a dashboard without the code keeps the fix as it did, and one with it on a database
-- without the door logs the count short, as any failed append does. Re-runnable throughout.

set local lock_timeout = '3s';

create or replace function public.rehearsal_fix_keep(
  p_tenant_id    uuid,
  p_rehearsal_id uuid,
  p_fix          jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_op      text;
  v_field   text;
  v_said    text;
  v_version numeric;
  v_fixes   jsonb;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule).
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whoever may write the settings may keep a fix from them; anyone else finds no rehearsal, and learns nothing.
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Rehearsal not found.' using errcode = 'P0002';
  end if;
  -- A fix's four words (contracts RehearsalFixDto; its moment is the door's): the op, the field as the owner reads it,
  -- the line it showed (your own words are the longest, twenty thousand characters and their label), and the settings
  -- version the Keep wrote, one the workspace's settings have reached.
  if p_fix is null or jsonb_typeof(p_fix) <> 'object'
     or jsonb_typeof(p_fix->'op') is distinct from 'string'
     or jsonb_typeof(p_fix->'field') is distinct from 'string'
     or jsonb_typeof(p_fix->'said') is distinct from 'string'
     or jsonb_typeof(p_fix->'version') is distinct from 'number' then
    raise exception 'A fix is { op, field, said, version }.' using errcode = '22023';
  end if;
  v_op := p_fix->>'op';
  v_field := btrim(p_fix->>'field');
  v_said := btrim(p_fix->>'said');
  v_version := (p_fix->>'version')::numeric;
  if v_op !~ '^[a-z_]{1,40}$'
     or char_length(v_field) not between 1 and 80
     or char_length(v_said) not between 1 and 20100
     or v_version <> trunc(v_version)
     or v_version < 1
     or v_version > coalesce((select c.version from public.tenant_config c where c.tenant_id = p_tenant_id), 0) then
    raise exception 'A fix is { op, field, said, version }.' using errcode = '22023';
  end if;
  -- Two Keeps at once on one rehearsal each append theirs: the second waits for the first's row.
  select r.fixes into v_fixes from public.rehearsals r
   where r.id = p_rehearsal_id and r.tenant_id = p_tenant_id
     for update;
  if not found then
    raise exception 'Rehearsal not found.' using errcode = 'P0002';
  end if;
  -- Far past what one review names: a list that long is a loop, not an owner.
  if jsonb_array_length(v_fixes) >= 100 then
    raise exception 'A rehearsal keeps a hundred fixes at most.' using errcode = '54000';
  end if;
  v_fixes := v_fixes || jsonb_build_array(jsonb_build_object(
    'op', v_op, 'field', v_field, 'said', v_said, 'version', v_version::integer,
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  update public.rehearsals set fixes = v_fixes where id = p_rehearsal_id and tenant_id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.fix_kept', 'settings', 'workspace', p_tenant_id,
          jsonb_build_object('rehearsal_id', p_rehearsal_id, 'op', v_op, 'field', v_field,
                             'version', v_version::integer, 'by', v_actor));
  return jsonb_array_length(v_fixes);
end $$;

revoke execute on function public.rehearsal_fix_keep(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rehearsal_fix_keep(uuid, uuid, jsonb) to authenticated;
comment on function public.rehearsal_fix_keep(uuid, uuid, jsonb) is
  'A change kept from a rehearsal or a reviewed call (decision 0069), appended to rehearsals.fixes under the row''s lock: { op, field, said, version } with the moment, the version one the settings have reached, and settings.fix_kept (never the words). A member who may change the workspace''s settings; anyone else finds no rehearsal. Answers how many fixes the rehearsal now keeps.';
