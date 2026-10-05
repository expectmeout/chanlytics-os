-- 00289 · A voice session names a thread of its own workspace.
--
-- 00287 gave ask_voice_sessions a single-column key to ask_threads (thread_id), the shape 00279 retired a week earlier
-- for every pair of workspace tables: a key that names the parent by its id alone lets a row name another workspace's
-- thread, and the service role, which the brain door and the webhook write with, skips the policies that would have
-- caught it. The replay's rule (a-child-names-its-workspaces-parent.db.test.mjs) found it. As 00279 does: the key
-- becomes `(tenant_id, thread_id) references ask_threads (tenant_id, id)`, NOT VALID (no existing row is read; every
-- new or changed one is held), with the same delete rule and deferral as the key it replaces, which is dropped once
-- the replacement stands; ask_threads has its unique (tenant_id, id) from 00279. To validate once production holds no
-- stray row: alter table public.ask_voice_sessions validate constraint ask_voice_sessions_thread_id_same_workspace;
-- Re-runnable: the key is made only when it is not there, the old one dropped only when it is.

set local lock_timeout = '3s';

do $$
declare
  v_old record;
  v_name text := 'ask_voice_sessions_thread_id_same_workspace';
  v_rule text;
  v_defer text;
begin
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.ask_threads'::regclass and c.contype in ('u', 'p')
       and (select array_agg(a.attname::text order by a.attname::text)
              from unnest(c.conkey) k(attnum)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) = array['id', 'tenant_id']
  ) then
    alter table public.ask_threads add constraint ask_threads_tenant_id_id_key unique (tenant_id, id);
  end if;

  select c.conname, c.confdeltype, c.condeferrable, c.condeferred into v_old
    from pg_constraint c
   where c.contype = 'f' and c.conrelid = 'public.ask_voice_sessions'::regclass
     and c.confrelid = 'public.ask_threads'::regclass and cardinality(c.conkey) = 1
     and (select a.attname::text from pg_attribute a where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) = 'thread_id';

  if not exists (
    select 1 from pg_constraint c where c.conname = v_name and c.conrelid = 'public.ask_voice_sessions'::regclass
  ) then
    v_rule := case v_old.confdeltype
      when 'c' then ' on delete cascade'
      when 'r' then ' on delete restrict'
      when 'n' then ' on delete set null (thread_id)'
      when 'd' then ' on delete set default (thread_id)'
      else ''
    end;
    v_defer := case
      when v_old.condeferrable and v_old.condeferred then ' deferrable initially deferred'
      when v_old.condeferrable then ' deferrable'
      else ''
    end;
    execute format(
      'alter table public.ask_voice_sessions add constraint %I foreign key (tenant_id, thread_id) references public.ask_threads (tenant_id, id)%s%s not valid',
      v_name, v_rule, v_defer
    );
  end if;

  if v_old.conname is not null then
    execute format('alter table public.ask_voice_sessions drop constraint %I', v_old.conname);
  end if;
end
$$;
