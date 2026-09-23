-- 00155 · A list may keep a rule, and a playbook may run on a list.
--
-- A list kept by hand (00044) is a name and the people put on it. A smart list is a name and a RULE: who is on it is
-- judged every time it is read, over the facts a person's row already carries (contracts list-rules.ts), so it keeps
-- itself current the way People's built-in lists do. The rule is the one column that says which kind a list is: null
-- is a list kept by hand.
--
-- A playbook ran on six moments, three of them People's built-in lists. It may now run on one of the workspace's own
-- lists ('saved_list', naming it in list_id), and on the Lapsed list ('lapsed': no visit in 45 days, nothing booked),
-- the win-back a salon means, which had no playbook of its own.
--
-- Re-runnable: every statement guards itself.

alter table public.segments add column if not exists rule jsonb;
comment on column public.segments.rule is
  'A smart list''s rule, in contracts list-rules.ts''s vocabulary: who is on it is judged on every read. Null for a list kept by hand.';
alter table public.segments drop constraint if exists segments_rule_is_an_object;
alter table public.segments add constraint segments_rule_is_an_object
  check (rule is null or jsonb_typeof(rule) = 'object');

-- The column grant is the fence (00121): a session client may rename a list, and now change its rule, and nothing else.
revoke update on public.segments from authenticated, anon;
grant update (name, rule) on public.segments to authenticated;

alter table public.playbooks add column if not exists list_id uuid references public.segments (id) on delete set null;
comment on column public.playbooks.list_id is
  'The list a saved_list playbook runs on. A list deleted under it leaves null, and the run reaches nobody and says so.';
create index if not exists playbooks_list on public.playbooks (list_id) where list_id is not null;

alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check
  check (trigger in ('quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed', 'saved_list'));
