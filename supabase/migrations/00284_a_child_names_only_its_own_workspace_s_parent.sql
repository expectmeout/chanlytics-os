-- 00284 · A row that names another row names one of its own workspace's.
--
-- A foreign key asks that the row it names exist, and ignores whose it is: workspace B's message can name workspace
-- A's conversation, and the database says yes. 00270 closed that for a member's session, in the insert policies. The
-- edge and the jobs write with the service role, which skips policies, so for them nothing held it but the
-- `tenant_id` their author remembered to put on both rows (the cross-workspace checklist, 29 September 2026).
--
-- Now the database holds it for every writer. Each single-column foreign key between two workspace tables becomes a
-- key that names the workspace too, `(tenant_id, x_id) references parent (tenant_id, id)`, as
-- `playbooks_after_same_workspace` (00183) already is for two columns. It REPLACES the old key with the same delete
-- rule (cascade, restrict, no action, and `set null` on the referencing column alone: the workspace stays) and the same
-- deferral, and it does not sit beside it: two relationships between one pair of tables make every embedded read
-- between them ambiguous to PostgREST (`contacts (phone_e164)` from a conversation), so the twin the first draft of
-- this file added would have broken the reads it sits under. The parents gain the unique `(tenant_id, id)` such a key
-- needs (playbooks and lead_searches had it).
--
-- Added NOT VALID: every new row and every changed one is held to it, and no existing row is read, so this cannot fail
-- on a row that is already there and takes only a brief lock on each pair of tables. The old key had proved every row
-- names a parent that exists, and the delete rule still runs for every row, valid or not. Each is validated once, after
-- production is known to hold no child that names another workspace's parent (validating names the row that does):
-- `alter table <child> validate constraint <name>;`, which reads the child while writes continue. What is still to
-- validate: select conrelid::regclass, conname from pg_constraint where conname like '%_same_workspace' and not
-- convalidated. The unique indexes build under a lock that blocks writes to their table for the build: small tables
-- today, and lock_timeout is 3 seconds, so a busy moment fails this migration rather than queues behind it.
-- `set null (column)` needs Postgres 15; the local stack and the linked project run 17.
--
-- Left out: google_listing_days and google_reviews, whose key is the workspace itself. Re-runnable: each key is made
-- only when it is not there, and the old one is dropped only when its replacement stands.

set local lock_timeout = '3s';

do $$
declare
  r record;
  v_old record;
  v_name text;
  v_rule text;
  v_defer text;
begin
  -- (child, column, parent): the census of 29 September 2026, every single-column key between two tables that both
  -- carry a tenant_id, less the two above.
  for r in
    select * from (values
      ('ask_messages', 'thread_id', 'ask_threads'),
      ('broadcast_recipients', 'broadcast_id', 'broadcasts'),
      ('broadcast_recipients', 'contact_id', 'contacts'),
      ('broadcast_recipients', 'message_id', 'messages'),
      ('broadcasts', 'playbook_id', 'playbooks'),
      ('broadcasts', 'template_id', 'templates'),
      ('calls', 'contact_id', 'contacts'),
      ('calls', 'conversation_id', 'conversations'),
      ('calls', 'message_id', 'messages'),
      ('calls', 'channel_id', 'tenant_channels'),
      ('contact_identities', 'contact_id', 'contacts'),
      ('contacts', 'merged_into_contact_id', 'contacts'),
      ('conversations', 'contact_id', 'contacts'),
      ('deals', 'contact_id', 'contacts'),
      ('deals', 'lead_id', 'leads'),
      ('decisions', 'undo_of', 'decisions'),
      ('escalations', 'conversation_id', 'conversations'),
      ('lead_judgments', 'round_id', 'lead_rounds'),
      ('lead_operations', 'search_id', 'lead_searches'),
      ('lead_places', 'lead_id', 'leads'),
      ('lead_preferences', 'from_lead_id', 'leads'),
      ('lead_rounds', 'search_id', 'lead_searches'),
      ('lead_runs', 'round_id', 'lead_rounds'),
      ('lead_search_members', 'round_id', 'lead_rounds'),
      ('lead_search_members', 'search_id', 'lead_searches'),
      ('lead_search_members', 'lead_id', 'leads'),
      ('lead_searches', 'thread_id', 'ask_threads'),
      ('leads', 'contact_id', 'contacts'),
      ('messages', 'contact_id', 'contacts'),
      ('messages', 'conversation_id', 'conversations'),
      ('person_moments', 'contact_id', 'contacts'),
      ('person_notes', 'contact_id', 'contacts'),
      ('person_notes', 'deal_id', 'deals'),
      ('playbooks', 'list_id', 'segments'),
      ('playbooks', 'template_id', 'templates'),
      ('reach_out_replies', 'contact_id', 'contacts'),
      ('reach_out_replies', 'lead_contact_id', 'contacts'),
      ('reach_out_replies', 'conversation_id', 'conversations'),
      ('reach_out_replies', 'lead_id', 'leads'),
      ('reach_out_replies', 'answered_message_id', 'messages'),
      ('reach_out_replies', 'message_id', 'messages'),
      ('reach_out_replies', 'send_id', 'reach_out_sends'),
      ('reach_out_sends', 'broadcast_id', 'broadcasts'),
      ('reach_out_sends', 'contact_id', 'contacts'),
      ('reach_out_sends', 'lead_id', 'leads'),
      ('reach_out_sends', 'message_id', 'messages'),
      ('reach_out_sends', 'playbook_id', 'playbooks'),
      ('reach_out_sends', 'root_id', 'playbooks'),
      ('reach_out_sends', 'domain_id', 'sending_domains'),
      ('segment_members', 'contact_id', 'contacts'),
      ('segment_members', 'segment_id', 'segments')
    ) as t(child, col, parent)
  loop
    -- The parent's (tenant_id, id): a key can only name a unique one. Named as the two that had it are.
    if not exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || r.parent)::regclass and c.contype in ('u', 'p')
         and (select array_agg(a.attname::text order by a.attname::text)
                from unnest(c.conkey) k(attnum)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) = array['id', 'tenant_id']
    ) then
      execute format(
        'alter table public.%I add constraint %I unique (tenant_id, id)', r.parent, r.parent || '_tenant_id_id_key'
      );
    end if;

    v_name := r.child || '_' || r.col || '_same_workspace';
    -- The single-column key this one replaces: its delete rule and deferral are kept.
    select c.conname, c.confdeltype, c.condeferrable, c.condeferred into v_old
      from pg_constraint c
     where c.contype = 'f' and c.conrelid = ('public.' || r.child)::regclass
       and c.confrelid = ('public.' || r.parent)::regclass and cardinality(c.conkey) = 1
       and (select a.attname::text from pg_attribute a where a.attrelid = c.conrelid and a.attnum = c.conkey[1]) = r.col;

    if not exists (
      select 1 from pg_constraint c where c.conname = v_name and c.conrelid = ('public.' || r.child)::regclass
    ) then
      v_rule := case v_old.confdeltype
        when 'c' then ' on delete cascade'
        when 'r' then ' on delete restrict'
        when 'n' then format(' on delete set null (%I)', r.col)
        when 'd' then format(' on delete set default (%I)', r.col)
        else ''
      end;
      v_defer := case
        when v_old.condeferrable and v_old.condeferred then ' deferrable initially deferred'
        when v_old.condeferrable then ' deferrable'
        else ''
      end;
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id, %I) references public.%I (tenant_id, id)%s%s not valid',
        r.child, v_name, r.col, r.parent, v_rule, v_defer
      );
    end if;

    if v_old.conname is not null then
      execute format('alter table public.%I drop constraint %I', r.child, v_old.conname);
    end if;
  end loop;
end
$$;
