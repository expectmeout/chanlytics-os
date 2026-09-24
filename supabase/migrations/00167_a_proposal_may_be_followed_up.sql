-- 00167 · A proposal may be followed up.
--
-- docs/decisions/0006-a-proposal-follow-up.md, and the Pipeline, worked (plan
-- 2026-09-23, PR 6). One new playbook trigger, proposal_waiting, in one new
-- Autonomy class, follow_up: one nudge per proposal, with its link, to
-- someone whose proposal has waited past the workspace's pace with nothing
-- back (contracts waitingOnProposal). It is conversational, as a visit
-- reminder is: it answers the person's own request.
--
-- The three CHECKs widen; one follow-up playbook per workspace, since two
-- would each owe every proposal its nudge and the sweep runs a workspace's due
-- playbooks over one reading of who was touched, so both could send in the
-- same hour; provision_tenant seeds the class as ask for a new
-- workspace (its body is 00073's with one more row); and every workspace on
-- record gets its row as ask, as 00071 gave each one reviews. A class with no
-- row runs as ask already (core run-playbook), so either deploy order holds.
--
-- Every statement re-runs. The constraints take ACCESS EXCLUSIVE on two
-- tables a live workspace reads, so the same lock guard as 00166.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.policies drop constraint if exists policies_class_check;
alter table public.policies add constraint policies_class_check
  check (class in ('reply','booking','faq','reengage','campaign','money','reviews','follow_up'));

alter table public.playbooks drop constraint if exists playbooks_policy_class_check;
alter table public.playbooks add constraint playbooks_policy_class_check
  check (policy_class in ('reengage', 'campaign', 'booking', 'follow_up'));

alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check
  check (trigger in ('quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed',
                     'saved_list', 'proposal_waiting'));

-- One proposal follow-up per workspace. The route says so in words (server/playbooks.ts playbookWriteError).
create unique index if not exists playbooks_one_follow_up on public.playbooks (tenant_id)
  where trigger = 'proposal_waiting';

-- Every workspace on record: ask.
insert into public.policies (tenant_id, class, mode, limits)
select t.id, 'follow_up', 'ask', '{}'::jsonb
  from public.tenants t
on conflict (tenant_id, class, subject_type, subject_id) do nothing;

-- A new workspace gets the same row from the provisioner. The body is 00073's with one more class.
create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never'), ('follow_up','ask')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  -- How the workspace pays: by card through Stripe, nothing subscribed yet.
  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;
