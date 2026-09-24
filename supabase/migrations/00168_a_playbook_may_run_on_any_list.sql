-- 00168 · A playbook may run on any list (docs/decisions/0009-one-idea-of-a-list.md, phase 2b).
--
-- A playbook on a list ('saved_list', 00155) could name only one of the workspace's own lists (list_id). A list is one
-- idea now (0009): People's built-in lists are rules in the same language, so the same moment may run on one of them,
-- named by its id in list_key. One or the other, never both.
--
-- And the column grant that is the fence (00121) never named list_id: a member could put a playbook on a list and never
-- move it to another, the edit refused as "permission denied for column list_id". Both columns are grantable now.
--
-- Re-runnable: every statement guards itself.

alter table public.playbooks add column if not exists list_key text;
comment on column public.playbooks.list_key is
  'The People list a saved_list playbook runs on, by its id (contracts lists.ts BUILTIN_LISTS). Null when it runs on one of the workspace''s own lists (list_id), and for every other trigger.';

alter table public.playbooks drop constraint if exists playbooks_list_key_shape;
alter table public.playbooks add constraint playbooks_list_key_shape
  check (list_key is null or list_key ~ '^[a-z_]{1,40}$');

alter table public.playbooks drop constraint if exists playbooks_one_list;
alter table public.playbooks add constraint playbooks_one_list
  check (list_key is null or list_id is null);

revoke update on public.playbooks from authenticated, anon;
grant update (name, trigger, state, template_id, template_name, template_language, params,
              policy_class, run_hour, cap_per_run, gap_days, cadence_days, list_id, list_key)
  on public.playbooks to authenticated;
