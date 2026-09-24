-- 00169 · A list has a life (docs/decisions/0009-one-idea-of-a-list.md, phase 3).
--
-- A list something depends on -- a playbook names it, or another list's rule reads it -- is archived, not deleted: it
-- leaves People's rail and still resolves, and the playbooks on it pause until their owner restores it or moves them.
-- A list nothing depends on is deleted. The floor under that is the playbook's reference: a list a playbook names is
-- not deleted out from under it (NO ACTION, checked at the end of the statement, so a workspace deleted whole still
-- goes, its playbooks and lists together).
--
-- Names are unique among live lists regardless of case: "VIP" and "vip" were two lists. Making a list, renaming it,
-- changing its rule, putting people on or taking them off, archiving, restoring and deleting it are the ledger's
-- (decisions, subject 'list'), so Activity says who did what and when. Lists and their people are watched live, and
-- the read of every list's members by workspace has its index.
--
-- Pushed before the dashboard that writes the list verbs deploys: the ledger's CHECKs refuse them until it is applied.
-- Re-runnable: every statement guards itself.

/* ----------------------------------------------------------------- 1. archived -- */

alter table public.segments add column if not exists archived_at timestamptz;
comment on column public.segments.archived_at is
  'When the list was archived: it leaves People''s rail and still resolves for the playbooks that name it. Null for a live list.';

-- The column grant is the fence (00121): a session client may rename a list, change its rule, and archive or restore it.
revoke update on public.segments from authenticated, anon;
grant update (name, rule, archived_at) on public.segments to authenticated;

/* ------------------------------------------------------------- 2. one name each -- */

alter table public.segments drop constraint if exists segments_tenant_id_name_key;
create unique index if not exists segments_live_name
  on public.segments (tenant_id, lower(name)) where archived_at is null;

/* ------------------------------------------------- 3. a playbook keeps its list -- */

alter table public.playbooks drop constraint if exists playbooks_list_id_fkey;
alter table public.playbooks add constraint playbooks_list_id_fkey
  foreign key (list_id) references public.segments (id) on delete no action;
comment on column public.playbooks.list_id is
  'The list of the workspace''s own a saved_list playbook runs on. A list a playbook names is archived, never deleted (0009): the playbook pauses and keeps it.';

/* ------------------------------------------------------------ 4. every member -- */

create index if not exists segment_members_tenant on public.segment_members (tenant_id, segment_id);

/* --------------------------------------------------------- 5. the ledger's words -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review', 'export', 'end_call',
    'record_deal', 'make_list', 'rename_list', 'change_list_rule', 'add_to_list',
    'drop_from_list', 'archive_list', 'restore_list', 'delete_list'
  ));

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast', 'playbook', 'review', 'workspace',
    'deal', 'list'
  ));

/* ---------------------------------------------------------------- 6. live -- */

-- Realtime, added once: People re-reads its lists when a teammate changes one.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'segments'
  ) then
    alter publication supabase_realtime add table public.segments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'segment_members'
  ) then
    alter publication supabase_realtime add table public.segment_members;
  end if;
end $$;
