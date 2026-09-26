-- 00183 · A reach-out is a chain of playbooks, and each lead it writes to is a send.
--
-- Reach out, Part 3 (docs/superpowers/plans/2026-09-25-reach-out-part-3-the-engine.md, PR 1). Nothing sends yet.
--
--   playbooks            gains kind ('moment' | 'reach_out'), and for a reach-out: lead_search_id (the root's
--                        audience), after_playbook_id + after_days (a step after the one before it), gap_minutes (the
--                        pace) and domain_ids (empty = every verified domain). The trigger set gains lead_first and
--                        after_step, the class set outreach; one shape CHECK ties them together.
--   policies             gains the class outreach, veto for every workspace and in the provisioner: a chain's first
--                        run always waits for its owner, and a later one gives thirty minutes to be stopped.
--   reach_out_sends      one row per lead in a step's run: when it goes, from which domain, and how it went.
--   sessions             write none of the new columns, and insert no reach-out: until the reach-out sheet's door
--                        exists (Part 4), only the service role makes a chain. A step's parent and a root's search are
--                        its own workspace's (composite keys).

set local lock_timeout = '3s';

alter table public.playbooks
  add column if not exists kind text not null default 'moment',
  add column if not exists lead_search_id uuid,
  add column if not exists after_playbook_id uuid,
  add column if not exists after_days int,
  add column if not exists gap_minutes int,
  add column if not exists domain_ids uuid[] not null default '{}';

alter table public.playbooks drop constraint if exists playbooks_kind_check;
alter table public.playbooks add constraint playbooks_kind_check check (kind in ('moment', 'reach_out'));

alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check check (trigger in (
  'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed', 'saved_list',
  'proposal_waiting', 'lead_first', 'after_step'));

alter table public.playbooks drop constraint if exists playbooks_policy_class_check;
alter table public.playbooks add constraint playbooks_policy_class_check check (policy_class in (
  'reengage', 'campaign', 'booking', 'follow_up', 'outreach'));

-- One shape per kind: a reach-out is outreach on one of its two triggers, a root has a search and no parent, a step
-- has a parent and a delay; a moment carries none of it.
alter table public.playbooks drop constraint if exists playbooks_reach_out_shape;
-- Each branch is coalesced to false: a CHECK passes on NULL, and a NULL pace or delay must not pass for a value.
alter table public.playbooks add constraint playbooks_reach_out_shape check (
  case kind
    when 'reach_out' then coalesce(
      policy_class = 'outreach'
      and gap_minutes is not null and gap_minutes between 5 and 120
      and case trigger
            when 'lead_first' then lead_search_id is not null and after_playbook_id is null and after_days is null
            when 'after_step' then after_playbook_id is not null and after_days is not null
                                    and after_days between 2 and 30 and lead_search_id is null
            else false
          end, false)
    else coalesce(
      policy_class <> 'outreach' and trigger not in ('lead_first', 'after_step')
      and lead_search_id is null and after_playbook_id is null and after_days is null and gap_minutes is null
      and domain_ids = '{}', false)
  end);

-- A step's parent and a root's search are its own workspace's: keyed by (tenant_id, id), so no row can point across.
alter table public.playbooks drop constraint if exists playbooks_tenant_id_id_key;
alter table public.playbooks add constraint playbooks_tenant_id_id_key unique (tenant_id, id);
alter table public.lead_searches drop constraint if exists lead_searches_tenant_id_id_key;
alter table public.lead_searches add constraint lead_searches_tenant_id_id_key unique (tenant_id, id);
alter table public.playbooks drop constraint if exists playbooks_after_same_workspace;
alter table public.playbooks add constraint playbooks_after_same_workspace
  foreign key (tenant_id, after_playbook_id) references public.playbooks (tenant_id, id) on delete cascade;
alter table public.playbooks drop constraint if exists playbooks_search_same_workspace;
alter table public.playbooks add constraint playbooks_search_same_workspace
  foreign key (tenant_id, lead_search_id) references public.lead_searches (tenant_id, id) on delete restrict;

-- A chain, not a tree: one next step per step.
create unique index if not exists playbooks_one_next on public.playbooks (after_playbook_id)
  where after_playbook_id is not null;
create index if not exists playbooks_lead_search on public.playbooks (lead_search_id) where lead_search_id is not null;

-- Sessions: 00168's column grant stands as it is, so none of the new columns is a session's to write (a column grant
-- names its columns: 00121). And a session inserts moments only: a reach-out is the service role's to make until the
-- reach-out sheet's own door exists (Part 4), so no chain runs without the checks that door makes.
drop policy if exists playbooks_acting_insert on public.playbooks;
create policy playbooks_acting_insert on public.playbooks
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()) and kind = 'moment');

/* ------------------------------------------------------------------- the class -- */

alter table public.policies drop constraint if exists policies_class_check;
alter table public.policies add constraint policies_class_check check (class in (
  'reply', 'booking', 'faq', 'reengage', 'campaign', 'reviews', 'money', 'follow_up', 'outreach'));

insert into public.policies (tenant_id, class, mode, limits)
select t.id, 'outreach', 'veto', '{}'::jsonb from public.tenants t
on conflict (tenant_id, class, subject_type, subject_id) do nothing;

-- 00167's provisioner with one more class.
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
    ('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never'), ('follow_up','ask'),
    ('outreach','veto')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;

/* ------------------------------------------------------------ the sends -- */

create table if not exists public.reach_out_sends (
  id            uuid primary key,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  broadcast_id  uuid not null references public.broadcasts (id) on delete cascade,
  playbook_id   uuid references public.playbooks (id) on delete set null,
  -- The chain's root (its lead_first step): a lead is written to once per chain, whichever step.
  root_id       uuid not null references public.playbooks (id) on delete cascade,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  domain_id     uuid references public.sending_domains (id) on delete set null,
  send_at       timestamptz,
  state         text not null default 'planned'
                check (state in ('planned', 'claimed', 'queued', 'sent', 'skipped', 'failed')),
  reason        text check (reason is null or char_length(reason) <= 60),
  attempts      int not null default 0 check (attempts between 0 and 20),
  message_id    uuid references public.messages (id) on delete set null,
  claimed_at    timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (broadcast_id, lead_id),
    -- A planned send has its time; its domain may be gone (a removed domain), and the clock plans it on another. A queued
  -- or sent send's email row may be gone too (an erasure deletes it): the clock skips a queued one, and a sent one
  -- keeps when it left. Nothing an erasure or a removal takes away is required here.
  constraint reach_out_sends_planned_is_timed check (state <> 'planned' or send_at is not null),
  constraint reach_out_sends_sent_is_dated check (state <> 'sent' or sent_at is not null)
);

create index if not exists reach_out_sends_due on public.reach_out_sends (domain_id, send_at) where state = 'planned';
create index if not exists reach_out_sends_open on public.reach_out_sends (tenant_id, state) where state in ('claimed', 'queued');
create index if not exists reach_out_sends_lead on public.reach_out_sends (tenant_id, lead_id);
create index if not exists reach_out_sends_chain on public.reach_out_sends (root_id, lead_id);
create index if not exists reach_out_sends_message on public.reach_out_sends (message_id) where message_id is not null;
create index if not exists reach_out_sends_run on public.reach_out_sends (broadcast_id, state);

drop trigger if exists reach_out_sends_updated_at on public.reach_out_sends;
create trigger reach_out_sends_updated_at before update on public.reach_out_sends
  for each row execute function extensions.moddatetime('updated_at');

-- The moves, and only these. A deferred send goes back to planned (a wait refusal, C5); sent, skipped and failed
-- are final. A same-state update is not a move.
create or replace function public.reach_out_sends_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if not (
      (OLD.state = 'planned' and NEW.state in ('claimed', 'skipped')) or
      (OLD.state = 'claimed' and NEW.state in ('queued', 'planned', 'skipped', 'failed')) or
      (OLD.state = 'queued' and NEW.state in ('sent', 'planned', 'skipped', 'failed'))
    ) then
      raise exception 'reach_out_sends.state moves % -> % refused', OLD.state, NEW.state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists reach_out_sends_guard on public.reach_out_sends;
create trigger reach_out_sends_guard before update on public.reach_out_sends
  for each row execute function public.reach_out_sends_guard();

alter table public.reach_out_sends enable row level security;
drop policy if exists reach_out_sends_member_select on public.reach_out_sends;
create policy reach_out_sends_member_select on public.reach_out_sends
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.reach_out_sends from anon, authenticated;
grant select on public.reach_out_sends to authenticated;
grant all on public.reach_out_sends to service_role;

comment on table public.reach_out_sends is
  'Reach out: one lead in one step''s run. Planned (a time and a domain), claimed under the domain''s capacity, queued as an email row with its outbound_send job, then what that row became. Written by the service role only (the reach-out clock, apps/edge/lib/reach-out).';
