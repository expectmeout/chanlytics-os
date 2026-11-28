/**
 * The door walk: every function a signed-in person may call, called as the wrong person (decision 0150).
 *
 * A member's own act reaches the database as the member, so the fence is each door's own. The catalog rules
 * (database/privileges.db.test.mjs) read each door's text for a check; this calls each one. The list is the database's:
 * every function of `public` the session role may execute, so a new door is walked without anyone remembering it.
 *
 * `walkSql()` is ONE statement, a block that:
 *   1. seeds two workspaces inside its own transaction: A with an owner, an operator, a viewer and a partner, B with an
 *      owner, and one row for A in every table that names a workspace (filled from the catalog: what a column must hold,
 *      by its type, its closed set and what it points at; `SEED_VALUES` says what the catalog cannot);
 *   2. calls every door, its arguments filled from A's rows (`ARG_ROWS`, `DOOR_ARGS`; an id read out of a jsonb
 *      argument is filled the same way), as: nobody signed in; a session with no person in it; B's owner naming A; B's
 *      owner naming B and passing A's rows; A's viewer, operator and partner (on a password alone, then with the second
 *      factor shown); and A's owner. Each call is its own savepoint, undone once it is read, so every call meets the
 *      same rows;
 *   3. ends by raising what it found, so everything it wrote is rolled back.
 *
 * What a call is held to (the block's `offences`):
 *   - nobody signed in is refused;
 *   - a caller who is not a member changes no row of A's, at any door; at a door that names a workspace or a row they
 *     write nothing at all, and are answered exactly what they are answered for ids that exist nowhere: naming another
 *     workspace's rows tells and changes no more than naming nothing;
 *   - B's owner passing A's rows inside a call about B gets and writes what they get and write passing rows that do
 *     not exist;
 *   - nobody who is not a member is answered an id of A's that they did not pass;
 *   - a member whose seat passes no check the door's own text makes (a viewer at an acting door, an operator at an
 *     owner's) is refused, or answered as a stranger is.
 * And what the lists beside this hold, both ways:
 *   - A's owner, with the same arguments, is answered otherwise than B's owner: a door that answers everyone the same
 *     has not been asked anything, and is named in `SAME_FOR_EVERYONE` with why;
 *   - where a door's text makes no check the walk knows, a viewer writes nothing, or the door is in `A_VIEWER_WRITES`;
 *   - a partner on a password alone is answered as a stranger is, or the door is in `A_PASSWORD_ALONE_MAY`.
 *
 * Proved on PGlite first (dev-tools/db-without-docker example-doors-refuse.mjs runs this same statement); CI's stack is
 * the judge, through the CLI, as the catalog suites are.
 */
import { ARG_ROWS, DOOR_ARGS, SEED_MORE, SEED_VALUES } from "./_lists.mjs";

const q = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

/** The walk, as one statement. `only` names the doors to walk (a run by hand); none walks every door. */
export function walkSql({
  argRows = ARG_ROWS,
  doorArgs = DOOR_ARGS,
  seedValues = SEED_VALUES,
  seedMore = SEED_MORE,
  only = null,
} = {}) {
  // Sent as one argument to the CLI, so its indentation and its comments are left behind.
  return compact(String.raw`
do $walk$
declare
  a           constant uuid := gen_random_uuid();
  b           constant uuid := gen_random_uuid();
  u_owner     constant uuid := gen_random_uuid();
  u_operator  constant uuid := gen_random_uuid();
  u_viewer    constant uuid := gen_random_uuid();
  u_partner   constant uuid := gen_random_uuid();
  u_stranger  constant uuid := gen_random_uuid();
  arg_rows    constant jsonb := ${q(argRows)};
  door_args   constant jsonb := ${q(doorArgs)};
  seed_values constant jsonb := ${q(seedValues)};
  seed_more   constant jsonb := ${q(seedMore)};
  only_doors  constant jsonb := ${q(only)};
  uuid_re     constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  callers     jsonb;
  seeded      jsonb := '{}';   -- table, then the id of A's row there ('' where the table has no id)
  unseeded    jsonb := '{}';
  gates       jsonb := '{}';   -- caller, then check, then whether that seat passes it
  task        record;
  door        record;
  arg         record;
  key         record;
  who         text;
  shape       text;
  stmt        text;
  made        jsonb;
  forced      jsonb;
  call_text   text;
  args_real   text[];
  args_void   text[];
  names_ws    boolean;         -- the door takes a workspace's id
  names_row   boolean;         -- the door takes a row's id the walk has a row for
  unknown     text[];
  tbl         text;
  val_real    text;
  val_void    text;
  pairs_real  text[];
  pairs_void  text[];
  answer      jsonb;
  said        text;
  state       text;
  total       bigint;
  last_total  bigint;
  by_table    jsonb;
  last_by     jsonb;
  wrote       jsonb;
  prints      jsonb;           -- a written table, then the print of A's rows there, before the call is undone
  touched     text[];
  written     record;
  print       text;
  got         jsonb;           -- this door's calls: 'caller/shape', then what came back
  one         jsonb;
  body_checks text[];
  allowed     boolean;
  doors_n     integer := 0;
  calls_n     integer := 0;
  skipped     jsonb := '[]';
  unresolved  jsonb := '{}';
  offences    jsonb := '[]';
  same_for_everyone jsonb := '[]';
  no_check_known    jsonb := '[]';
  password_alone    jsonb := '[]';
  seat_answered     jsonb := '[]';
  no_person_answered jsonb := '[]';
  report      jsonb;
begin
  -- 1. Two workspaces and their people, then one row for A in every table that names a workspace. Written with
  -- triggers and the keys' checks off, as the rows would stand: what is proved is the doors, not the writers.
  insert into auth.users (id) values (u_owner), (u_operator), (u_viewer), (u_partner), (u_stranger);
  execute 'set local session_replication_role = replica';
  insert into public.tenants (id, slug, name) values
    (a, 'door-walk-a-' || replace(a::text, '-', ''), 'Door walk A'),
    (b, 'door-walk-b-' || replace(b::text, '-', ''), 'Door walk B');
  insert into public.memberships (user_id, tenant_id, role) values
    (u_owner, a, 'owner'), (u_operator, a, 'operator'), (u_viewer, a, 'viewer'), (u_partner, a, 'partner'),
    (u_stranger, b, 'owner');
  seeded := jsonb_build_object('tenants', a);

  for task in
    with recursive tenant_tables as (
      select c.oid, c.relname::text as tbl
        from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
         and c.relname <> 'memberships'
         and exists (select 1 from pg_attribute x
                      where x.attrelid = c.oid and x.attname = 'tenant_id' and not x.attisdropped)
    ), refs as (
      select distinct k.conrelid as child, k.confrelid as parent
        from pg_constraint k
       where k.contype = 'f' and k.conrelid <> k.confrelid
         and k.conrelid in (select oid from tenant_tables) and k.confrelid in (select oid from tenant_tables)
    ), depth (oid, d) as (
      select t.oid, 0 from tenant_tables t
      union
      select r.child, d.d + 1 from depth d join refs r on r.parent = d.oid where d.d < 8
    )
    select w.tbl, w.label, w.d
      from (
        select t.tbl, t.tbl as label, max(d.d) as d from tenant_tables t join depth d on d.oid = t.oid group by 1
        union all
        -- A second row of a table, after every table's first: SEED_MORE's.
        select m.value ->> 'table', m.key, 100 + (m.value ->> 'order')::integer from jsonb_each(seed_more) m
      ) w
     order by w.d, w.label
  loop
    -- What the lists say of this row, with '{a}' read as A's id and '{table}' as the id of A's row there.
    stmt := coalesce(case when task.label = task.tbl then seed_values -> task.tbl
                          else seed_more -> task.label -> 'values' end, '{}'::jsonb)::text;
    if stmt <> '{}' then
      stmt := replace(stmt, '{a}', a::text);
      for key in select s.key as name, s.value from jsonb_each_text(seeded) s where s.value <> '' loop
        stmt := replace(stmt, '{' || key.name || '}', key.value);
      end loop;
    end if;
    forced := stmt::jsonb;
    select format('insert into public.%I as t (%s) values (%s) returning to_jsonb(t.*)', task.tbl,
                  string_agg(quote_ident(cols.col), ', ' order by cols.attnum),
                  string_agg(cols.val, ', ' order by cols.attnum))
      into stmt
      from (
        select x.attname::text as col, x.attnum,
               case
                 when x.attgenerated <> '' then null
                 when forced ? x.attname::text
                   then format('%L::%s', forced ->> x.attname::text, format_type(x.atttypid, x.atttypmod))
                 when x.attname = 'tenant_id' then format('%L::uuid', a)
                 when not x.attnotnull or x.atthasdef or x.attidentity <> '' then null
                 when ref.tbl is not null and coalesce(seeded ->> ref.tbl, '') <> ''
                   then format('%L::uuid', seeded ->> ref.tbl)
                 when ref.users then format('%L::uuid', u_owner)
                 when ty.typcategory = 'A' then quote_literal('{}')
                 when sets.first is not null then quote_literal(sets.first)
                 when shapes.hex is not null then quote_literal(repeat('a', shapes.hex::integer))
                 when ty.typcategory = 'S' then quote_literal('doorwalk')
                 when x.atttypid = 'uuid'::regtype then 'gen_random_uuid()'
                 when ty.typcategory = 'N' then '1'
                 when ty.typcategory = 'B' then 'false'
                 when x.atttypid in ('jsonb'::regtype, 'json'::regtype) then quote_literal('{}')
                 when ty.typcategory = 'D' then 'now()'
                 when ty.typcategory = 'T' then quote_literal('1 hour')
                 when ty.typcategory = 'E' then (select quote_literal(e.enumlabel) from pg_enum e
                                                  where e.enumtypid = x.atttypid order by e.enumsortorder limit 1)
                 else null
               end as val
          from pg_attribute x
          join pg_type ty on ty.oid = x.atttypid
          left join lateral (
            select (select c2.relname::text from pg_class c2
                     where c2.oid = k.confrelid and c2.relnamespace = 'public'::regnamespace) as tbl,
                   k.confrelid = 'auth.users'::regclass as users
              from pg_constraint k
             cross join lateral unnest(k.conkey, k.confkey) as u(child_att, parent_att)
             where k.contype = 'f' and k.conrelid = x.attrelid and u.child_att = x.attnum
               and (select pa.attname from pg_attribute pa
                     where pa.attrelid = k.confrelid and pa.attnum = u.parent_att) = 'id'
             order by k.oid limit 1
          ) ref on true
          left join lateral (
            select (regexp_match(pg_get_constraintdef(k.oid), 'ARRAY\[''([^'']*)'''))[1] as first
              from pg_constraint k
             where k.contype = 'c' and k.conrelid = x.attrelid and k.conkey = array[x.attnum]
               and pg_get_constraintdef(k.oid) ~ '= ANY \(ARRAY\['
             order by k.oid limit 1
          ) sets on true
          left join lateral (
            select (regexp_match(pg_get_constraintdef(k.oid), '~ ''\^\[0-9a-f\]\{(\d+)[,}]'))[1] as hex
              from pg_constraint k
             where k.contype = 'c' and k.conrelid = x.attrelid and k.conkey = array[x.attnum]
               and pg_get_constraintdef(k.oid) ~ '~ ''\^\[0-9a-f\]\{\d+[,}]'
             order by k.oid limit 1
          ) shapes on true
         where x.attrelid = format('public.%I', task.tbl)::regclass and x.attnum > 0 and not x.attisdropped
      ) cols
     where cols.val is not null;
    begin
      execute stmt into made;
      seeded := seeded || jsonb_build_object(task.label, coalesce(made ->> 'id', ''));
    exception when others then
      unseeded := unseeded || jsonb_build_object(task.label, sqlstate || ' ' || sqlerrm);
    end;
  end loop;
  execute 'set local session_replication_role = origin';

  callers := jsonb_build_object(
    'nobody',    jsonb_build_object('role', 'anon'),
    'no_person', jsonb_build_object('role', 'authenticated'),
    'stranger',  jsonb_build_object('role', 'authenticated', 'aal', 'aal1', 'sub', u_stranger),
    'viewer',    jsonb_build_object('role', 'authenticated', 'aal', 'aal1', 'sub', u_viewer),
    'operator',  jsonb_build_object('role', 'authenticated', 'aal', 'aal1', 'sub', u_operator),
    'partner_password', jsonb_build_object('role', 'authenticated', 'aal', 'aal1', 'sub', u_partner),
    'partner',   jsonb_build_object('role', 'authenticated', 'aal', 'aal2', 'sub', u_partner),
    'owner',     jsonb_build_object('role', 'authenticated', 'aal', 'aal1', 'sub', u_owner));

  -- Which seat passes which of the house's checks, asked of the checks themselves, as each caller.
  for who in select k from jsonb_object_keys(callers) k where k not in ('nobody', 'no_person') loop
    begin
      perform set_config('request.jwt.claims', (callers -> who)::text, true);
      perform set_config('request.jwt.claim.sub', coalesce(callers -> who ->> 'sub', ''), true);
      perform set_config('request.jwt.claim.role', callers -> who ->> 'role', true);
      execute format('set local role %I', callers -> who ->> 'role');
      select jsonb_object_agg(g.name, g.passes) into one
        from (
          select 'is_acting_member' as name, coalesce(public.is_acting_member(a), false) as passes
          union all select 'may_read_workspace', coalesce(public.may_read_workspace(a), false)
          union all select 'is_workspace_owner', coalesce(public.is_workspace_owner(a), false)
          union all
          select 'permission:' || p, coalesce(public.caller_has_permission(a, p), false)
            from unnest(array['approve', 'autonomy', 'disconnect', 'billing', 'team', 'settings', 'export', 'find',
                              'add_files', 'ads']) p
        ) g;
      raise exception using errcode = 'DW000', message = 'undo';
    exception when sqlstate 'DW000' then
      gates := gates || jsonb_build_object(who, one);
    end;
  end loop;

  select coalesce(sum(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0) into last_total from pg_stat_xact_user_tables s;
  select coalesce(jsonb_object_agg(s.schemaname || '.' || s.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del), '{}')
    into last_by from pg_stat_xact_user_tables s where s.n_tup_ins + s.n_tup_upd + s.n_tup_del > 0;

  -- 2. Every door.
  for door in
    select p.oid, p.proname::text as name, p.oid::regprocedure::text as sig, p.prosecdef as definer,
           p.provolatile as volatility, p.prorettype, p.prosrc, p.proargtypes::oid[] as arg_types,
           coalesce(
             (select array_agg(n.name order by n.i)
                from unnest(coalesce(p.proargnames, '{}'),
                            coalesce(p.proargmodes,
                                     array_fill('i'::"char", array[cardinality(coalesce(p.proargnames, '{}'))])))
                     with ordinality as n(name, mode, i)
               where n.mode in ('i', 'b', 'v')),
             '{}') as arg_names
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
       and (only_doors = 'null'::jsonb or only_doors ? p.proname::text)
     order by p.proname, p.oid
  loop
    if door.prorettype = 'trigger'::regtype then
      -- Postgres runs a trigger function from a trigger alone: called by name it is refused whoever asks.
      skipped := skipped || jsonb_build_array(door.sig);
      continue;
    end if;
    doors_n := doors_n + 1;

    -- Its arguments, twice: A's rows, and ids that exist nowhere. A workspace's id is put in as a mark, and each
    -- call says which workspace stands there.
    args_real := '{}'; args_void := '{}';
    names_ws := false; names_row := false; unknown := '{}';
    for arg in
      select t.i, coalesce(door.arg_names[t.i], '') as name, format_type(t.ty, null) as type,
             (select ty.typrelid from pg_type ty where ty.oid = t.ty) as row_of
        from unnest(door.arg_types) with ordinality as t(ty, i)
       order by t.i
    loop
      if arg.type = 'uuid' and arg.name in ('p_tenant_id', 'p_tenant') then
        names_ws := true;
        args_real := args_real || '@workspace'::text;
        args_void := args_void || '@workspace'::text;
      elsif arg.type in ('uuid', 'uuid[]') then
        tbl := coalesce(door_args -> door.name ->> arg.name, arg_rows ->> arg.name);
        if tbl is null then
          select c.relname::text into tbl
            from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
             and c.relname::text in (
               regexp_replace(regexp_replace(arg.name, '^p_', ''), '_ids?$', '') || 's',
               regexp_replace(regexp_replace(arg.name, '^p_', ''), '_ids?$', '') || 'es',
               regexp_replace(regexp_replace(arg.name, '^p_', ''), '_ids?$', ''))
           order by length(c.relname) desc limit 1;
        end if;
        val_real := case tbl when '@owner' then u_owner::text when '@viewer' then u_viewer::text
                             when '@nothing' then null when '@null' then null
                             else nullif(seeded ->> tbl, '') end;
        if tbl is null or (val_real is null and left(tbl, 1) <> '@') then
          unknown := unknown || (arg.name || case when tbl is null then '' else ' (' || tbl || ', which has no row)' end);
        end if;
        if val_real is not null and left(tbl, 1) <> '@' then names_row := true; end if;
        if tbl = '@null' then
          args_real := args_real || format('null::%s', arg.type);
          args_void := args_void || format('null::%s', arg.type);
        elsif arg.type = 'uuid' then
          args_real := args_real || case when val_real is null then 'gen_random_uuid()'
                                         else format('%L::uuid', val_real) end;
          args_void := args_void || 'gen_random_uuid()'::text;
        else
          args_real := args_real || case when val_real is null then 'array[gen_random_uuid()]'
                                         else format('array[%L]::uuid[]', val_real) end;
          args_void := args_void || 'array[gen_random_uuid()]'::text;
        end if;
      elsif coalesce(arg.row_of, 0) <> 0 then
        -- A computed column: a row of its table, A's or none.
        select c.relname::text into tbl from pg_class c where c.oid = arg.row_of;
        val_real := nullif(seeded ->> tbl, '');
        if val_real is not null then names_row := true; end if;
        args_real := args_real || case when val_real is null then format('null::public.%I', tbl)
                                       else format('(select t from public.%I t where t.id = %L)', tbl, val_real) end;
        args_void := args_void || format('null::public.%I', tbl);
      elsif door_args -> door.name ? arg.name then
        args_real := args_real || format('%L::%s', door_args -> door.name ->> arg.name, arg.type);
        args_void := args_void || format('%L::%s', door_args -> door.name ->> arg.name, arg.type);
      elsif arg.type = 'jsonb' then
        -- An id the door reads out of the object (p_set ->> 'template_id') is a row's id passed inside it.
        pairs_real := '{}'; pairs_void := '{}';
        for key in
          select distinct m[1] as name
            from regexp_matches(door.prosrc, '\m' || arg.name || '\s*->>?\s*''(\w+_ids?)''', 'g') m
        loop
          tbl := arg_rows ->> ('p_' || key.name);
          if tbl is null then
            select c.relname::text into tbl
              from pg_class c
             where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
               and c.relname::text in (regexp_replace(key.name, '_ids?$', '') || 's',
                                       regexp_replace(key.name, '_ids?$', '') || 'es',
                                       regexp_replace(key.name, '_ids?$', ''))
             order by length(c.relname) desc limit 1;
          end if;
          val_real := case tbl when '@owner' then u_owner::text when '@viewer' then u_viewer::text
                               else nullif(seeded ->> tbl, '') end;
          if val_real is null then continue; end if;
          if left(tbl, 1) <> '@' then names_row := true; end if;
          if key.name like '%\_ids' then
            pairs_real := pairs_real || format('%L, jsonb_build_array(%L)', key.name, val_real);
            pairs_void := pairs_void || format('%L, jsonb_build_array(gen_random_uuid())', key.name);
          else
            pairs_real := pairs_real || format('%L, %L', key.name, val_real);
            pairs_void := pairs_void || format('%L, gen_random_uuid()', key.name);
          end if;
        end loop;
        args_real := args_real || ('jsonb_build_object(' || array_to_string(pairs_real, ', ') || ')');
        args_void := args_void || ('jsonb_build_object(' || array_to_string(pairs_void, ', ') || ')');
      else
        val_void := case arg.type
          when 'text' then quote_literal('door walk')
          when 'integer' then '1'
          when 'bigint' then '1'
          when 'numeric' then '1'
          when 'boolean' then 'false'
          when 'timestamp with time zone' then 'now()'
          when 'date' then 'current_date'
          when 'text[]' then 'array[]::text[]'
          else format('null::%s', arg.type) end;
        args_real := args_real || val_void;
        args_void := args_void || val_void;
      end if;
    end loop;
    if cardinality(unknown) > 0 then
      unresolved := unresolved || jsonb_build_object(door.sig, to_jsonb(unknown));
    end if;

    body_checks := array(
      select distinct g from (
        select 'is_acting_member' as g where door.prosrc ~ 'is_acting_member\s*\('
        union all select 'may_read_workspace' where door.prosrc ~ 'may_read_workspace\s*\('
        union all select 'is_workspace_owner' where door.prosrc ~ 'is_workspace_owner\s*\('
        union all
        select 'permission:' || m[1]
          from regexp_matches(door.prosrc,
                 'has_permission\s*\((?:[^;()]|\((?:[^()]|\([^()]*\))*\))*''(\w+)''\s*\)', 'g') m
      ) x);

    got := '{}';
    for who, shape in
      select v.who, v.shape from (values
        ('nobody', 'real', 1), ('no_person', 'real', 2), ('no_person', 'void', 3),
        ('stranger', 'real', 4), ('stranger', 'void', 5), ('stranger', 'cross', 6), ('stranger', 'cross_void', 7),
        ('viewer', 'real', 8), ('operator', 'real', 9), ('partner_password', 'real', 10), ('partner', 'real', 11),
        ('owner', 'real', 12)) as v(who, shape, n)
       where (v.shape not in ('cross', 'cross_void') or (names_ws and names_row))
       order by v.n
    loop
      calls_n := calls_n + 1;
      -- real: A and A's rows. void: a workspace and rows that exist nowhere. cross: B and A's rows. cross_void: B and
      -- rows that exist nowhere.
      call_text := format('public.%I(%s)', door.name, replace(
        array_to_string(case when shape in ('real', 'cross') then args_real else args_void end, ', '),
        '@workspace',
        case shape when 'real' then format('%L::uuid', a) when 'void' then 'gen_random_uuid()'
                   else format('%L::uuid', b) end));
      answer := null; said := null; wrote := '{}'; prints := '{}'; touched := '{}';
      begin
        perform set_config('request.jwt.claims', (callers -> who)::text, true);
        perform set_config('request.jwt.claim.sub', coalesce(callers -> who ->> 'sub', ''), true);
        perform set_config('request.jwt.claim.role', callers -> who ->> 'role', true);
        execute format('set local role %I', callers -> who ->> 'role');
        if door.prorettype = 'void'::regtype then
          execute 'select ' || call_text;
        else
          execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from ' || call_text || ' as t' into answer;
        end if;
        execute 'reset role';
        select coalesce(sum(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0) into total from pg_stat_xact_user_tables s;
        if total <> last_total then
          select coalesce(jsonb_object_agg(s.schemaname || '.' || s.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del), '{}')
            into by_table from pg_stat_xact_user_tables s where s.n_tup_ins + s.n_tup_upd + s.n_tup_del > 0;
          select coalesce(jsonb_object_agg(n.key, n.value::bigint - coalesce((last_by ->> n.key)::bigint, 0)), '{}')
            into wrote from jsonb_each_text(by_table) n
           where n.value::bigint <> coalesce((last_by ->> n.key)::bigint, 0);
          -- What A holds in each table this call wrote, read before the call is undone.
          if who in ('nobody', 'no_person', 'stranger') then
            for written in
              select distinct coalesce(parent.relname, c.relname)::text as tbl
                from jsonb_object_keys(wrote) w
                join pg_class c on c.oid = to_regclass(quote_ident(split_part(w, '.', 1)) || '.' || quote_ident(split_part(w, '.', 2)))
                left join pg_inherits i on i.inhrelid = c.oid
                left join pg_class parent on parent.oid = i.inhparent
               where split_part(w, '.', 1) = 'public'
                 and (coalesce(parent.relname, c.relname) = 'tenants' or exists (
                       select 1 from pg_attribute x
                        where x.attrelid = coalesce(parent.oid, c.oid) and x.attname = 'tenant_id' and not x.attisdropped))
            loop
              execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t where t.%I = %L',
                             written.tbl, case written.tbl when 'tenants' then 'id' else 'tenant_id' end, a) into print;
              prints := prints || jsonb_build_object(written.tbl, print);
            end loop;
          end if;
        end if;
        raise exception using errcode = 'DW000', message = 'undo';
      exception
        when sqlstate 'DW000' then
          state := 'ok';
          said := coalesce(answer::text, '');
        when others then
          state := sqlstate;
          said := sqlerrm;
          wrote := '{}';
          prints := '{}';
      end;
      -- The call is undone: A's rows stand as they were seeded, so what they print now is what they printed before.
      for written in select p.key as tbl, p.value as was from jsonb_each_text(prints) p loop
        execute format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t where t.%I = %L',
                       written.tbl, case written.tbl when 'tenants' then 'id' else 'tenant_id' end, a) into print;
        if print <> written.was then touched := touched || written.tbl; end if;
      end loop;
      -- The counters keep what an undone savepoint wrote, so the next call starts from where this one left them.
      select coalesce(sum(s.n_tup_ins + s.n_tup_upd + s.n_tup_del), 0) into total from pg_stat_xact_user_tables s;
      if total <> last_total then
        select coalesce(jsonb_object_agg(s.schemaname || '.' || s.relname, s.n_tup_ins + s.n_tup_upd + s.n_tup_del), '{}')
          into last_by from pg_stat_xact_user_tables s where s.n_tup_ins + s.n_tup_upd + s.n_tup_del > 0;
        last_total := total;
      end if;
      got := got || jsonb_build_object(who || '/' || shape, jsonb_build_object(
        's', state,
        'h', md5(regexp_replace(said, uuid_re, '<id>', 'g')),
        'w', wrote,
        'touched', to_jsonb(touched),
        'ids', (state = 'ok' and exists (
                 select 1 from jsonb_each_text(seeded) s
                  where s.value ~ ('^' || uuid_re || '$') and s.key <> 'tenants' and position(s.value in said) > 0
                    and position(s.value in call_text) = 0)),
        'said', left(regexp_replace(said, uuid_re, '<id>', 'g'), 160)));
    end loop;

    -- What each call is held to.
    if got -> 'nobody/real' ->> 's' = 'ok' then
      offences := offences || jsonb_build_object('door', door.sig, 'what', 'answered nobody signed in',
                                                 'got', got -> 'nobody/real');
    end if;
    foreach who in array array['no_person', 'stranger'] loop
      one := got -> (who || '/real');
      if one -> 'touched' <> '[]'::jsonb then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', who || ' changed this workspace''s rows', 'got', one);
      elsif (names_ws or names_row) and one -> 'w' <> '{}'::jsonb then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', who || ' wrote, at a door that names a workspace or a row', 'got', one);
      elsif (names_ws or names_row) and one ->> 's' = 'ok'
            and (one ->> 'h' <> got -> (who || '/void') ->> 'h' or got -> (who || '/void') ->> 's' <> 'ok') then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', who || ' was answered about this workspace''s rows otherwise than about rows that exist nowhere',
          'got', one, 'void', got -> (who || '/void'));
      elsif (one ->> 'ids')::boolean then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', who || ' was answered an id of this workspace''s that they did not pass', 'got', one);
      end if;
    end loop;
    -- A session with no person in it is nobody: a door that runs as its owner and names a workspace or a row refuses
    -- it outright (decision 0150), as it refuses nobody signed in.
    if door.definer and (names_ws or names_row) and got -> 'no_person/real' ->> 's' = 'ok' then
      no_person_answered := no_person_answered || jsonb_build_object('door', door.sig,
        'said', got -> 'no_person/real' ->> 'said', 'wrote', got -> 'no_person/real' -> 'w');
    end if;
    if got ? 'stranger/cross' then
      one := got -> 'stranger/cross';
      if one -> 'touched' <> '[]'::jsonb then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', 'another workspace''s owner, passing this workspace''s rows inside a call about their own, changed this workspace''s rows',
          'got', one);
      elsif one ->> 's' = 'ok' and (one ->> 'h' <> got -> 'stranger/cross_void' ->> 'h'
                                    or one -> 'w' <> got -> 'stranger/cross_void' -> 'w'
                                    or got -> 'stranger/cross_void' ->> 's' <> 'ok') then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', 'another workspace''s owner, passing this workspace''s rows inside a call about their own, got or wrote otherwise than with rows that exist nowhere',
          'got', one, 'void', got -> 'stranger/cross_void');
      elsif (one ->> 'ids')::boolean then
        offences := offences || jsonb_build_object('door', door.sig,
          'what', 'another workspace''s owner was answered an id of this workspace''s that they did not pass',
          'got', one);
      end if;
    end if;
    -- A seat that passes no check the door's text makes.
    if cardinality(body_checks) > 0 then
      foreach who in array array['viewer', 'operator'] loop
        select coalesce(bool_or(coalesce((gates -> who ->> g)::boolean, false)), false) into allowed
          from unnest(body_checks) g;
        one := got -> (who || '/real');
        if not allowed and one -> 'w' <> '{}'::jsonb then
          offences := offences || jsonb_build_object('door', door.sig,
            'what', who || ', whose seat passes none of ' || array_to_string(body_checks, ', ') || ', wrote',
            'got', one);
        elsif not allowed and one ->> 's' = 'ok' and one ->> 'h' <> got -> 'stranger/real' ->> 'h' then
          -- Not refused outright, and not answered as a stranger is: a refusal in words, which the list beside names.
          seat_answered := seat_answered || jsonb_build_object('door', door.sig, 'who', who,
            'checks', to_jsonb(body_checks), 'got', one, 'stranger', got -> 'stranger/real',
            'as_owner', one ->> 'h' = got -> 'owner/real' ->> 'h');
        end if;
      end loop;
    else
      no_check_known := no_check_known || jsonb_build_object('door', door.sig,
        'viewer_wrote', got -> 'viewer/real' -> 'w' <> '{}'::jsonb, 'wrote', got -> 'viewer/real' -> 'w');
    end if;
    -- A partner on a password alone is nobody's member (decision 0013): at a door that names a workspace or a row
    -- they write nothing and are answered as a stranger is.
    one := got -> 'partner_password/real';
    if (names_ws or names_row)
       and (one -> 'w' <> '{}'::jsonb
            or (one ->> 's' = 'ok' and one ->> 'h' <> got -> 'stranger/real' ->> 'h')) then
      password_alone := password_alone || jsonb_build_object('door', door.sig, 'got', one,
                                                             'stranger', got -> 'stranger/real');
    end if;
    -- Asked at all: the owner is answered otherwise than a stranger.
    if got -> 'owner/real' ->> 's' = got -> 'stranger/real' ->> 's'
       and got -> 'owner/real' ->> 'h' = got -> 'stranger/real' ->> 'h'
       and got -> 'owner/real' -> 'w' = got -> 'stranger/real' -> 'w' then
      same_for_everyone := same_for_everyone || jsonb_build_object('door', door.sig,
        'definer', door.definer, 'pure', (not door.definer and door.volatility = 'i'),
        'names', names_ws or names_row,
        'said', got -> 'owner/real' ->> 's' || ' ' || coalesce(got -> 'owner/real' ->> 'said', ''));
    end if;
  end loop;

  report := jsonb_build_object(
    'doors', doors_n, 'calls', calls_n, 'trigger_functions', skipped,
    'unseeded', unseeded, 'seeded_tables', (select count(*) from jsonb_object_keys(seeded)),
    'unresolved', unresolved, 'offences', offences, 'password_alone', password_alone,
    'seat_answered', seat_answered, 'no_person_answered', no_person_answered,
    'same_for_everyone', same_for_everyone, 'no_check_known', no_check_known, 'gates', gates);
  -- Always raised, so every row this wrote is rolled back.
  raise exception 'door walk: %;', replace(encode(convert_to(report::text, 'utf8'), 'base64'), E'\n', '');
end
$walk$;
`);
}

/** A statement without its indentation and its whole-line comments: no literal in the walk spans a line. */
function compact(sql) {
  return sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .join("\n");
}

/** What the walk raised, read back; null where it raised something else (the walk itself broke). */
export function reportOf(said) {
  const m = /door walk: ([A-Za-z0-9+/=]+);/.exec(String(said));
  if (!m) return null;
  return JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
}
