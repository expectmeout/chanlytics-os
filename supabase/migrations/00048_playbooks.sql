-- 00048 Playbooks: a standing rule that sends one approved template to
-- newly eligible people who said yes, under the workspace's autonomy mode.
--
-- Broadcasts is "send this once"; a playbook is "keep doing this". A run is
-- a broadcast row made by the hourly sweep for the people who became
-- eligible since the last run — the same job, the same receipts, the same
-- detail of who got it. Under the ask mode a run waits as pending_approval
-- until a person approves or skips it. One run per playbook per local day.
-- Touches are never stored twice: a person's sent recipient rows on the
-- broadcasts of a playbook are the record of when they last heard from it.

create table public.playbooks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  name              text not null check (length(name) between 1 and 80),
  trigger           text not null check (trigger in ('quiet_30', 'new_week', 'phoned_only', 'everyone_monthly')),
  template_id       uuid not null references public.templates (id),
  template_name     text not null,
  template_language text not null,
  params            jsonb not null default '[]'::jsonb,
  policy_class      text not null check (policy_class in ('reengage', 'campaign')),
  state             text not null default 'running' check (state in ('running', 'paused')),
  run_hour          int  not null default 10 check (run_hour between 9 and 20),
  cap_per_run       int  not null default 25 check (cap_per_run between 1 and 500),
  gap_days          int  not null default 90 check (gap_days between 7 and 365),
  cadence_days      int  not null default 30 check (cadence_days between 1 and 90),
  created_by        uuid references auth.users (id) on delete set null,
  last_run_for      date,
  last_run_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index playbooks_tenant_state on public.playbooks (tenant_id, state);
create trigger playbooks_set_updated_at
  before update on public.playbooks
  for each row execute function extensions.moddatetime('updated_at');

-- A run is a broadcast: which playbook, and which local day it ran for.
alter table public.broadcasts
  add column playbook_id uuid references public.playbooks (id) on delete set null,
  add column run_for     date;
create unique index broadcasts_playbook_run on public.broadcasts (playbook_id, run_for) where playbook_id is not null;

-- Under the ask mode a run waits for a person.
alter table public.broadcasts drop constraint if exists broadcasts_state_check;
alter table public.broadcasts add constraint broadcasts_state_check
  check (state in ('pending_approval', 'scheduled', 'sending', 'sent', 'canceled', 'failed'));

alter table public.playbooks enable row level security;
create policy playbooks_member_select on public.playbooks
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy playbooks_acting_insert on public.playbooks
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));
create policy playbooks_acting_update on public.playbooks
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));
create policy playbooks_acting_delete on public.playbooks
  for delete to authenticated
  using (public.is_acting_member(tenant_id));

-- Column-scoped, per 00037: the session client edits what a person may
-- change; the sweep (service role) alone moves last_run_for and last_run_at.
grant select, insert, delete on public.playbooks to authenticated;
grant update (name, state, template_id, template_name, template_language, params, policy_class, run_hour, cap_per_run, gap_days, cadence_days)
  on public.playbooks to authenticated;

-- The ledger: subject 'playbook', verbs 'start_playbook' and 'pause_playbook'.
-- A run that sends on its own is a send_broadcast by actor system; an
-- approved run is a send_broadcast by the person who approved it.
alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast', 'playbook'
  ));
alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook'
  ));

-- The hourly sweep, the same door the deadman and health sweeps use.
create or replace function public.trigger_playbooks_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_url text;
  v_id  bigint;
begin
  select public.get_cron_sweep_key() into v_key;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_base_url';
  if v_key is null or v_url is null then
    raise warning 'playbooks sweep not configured (missing cron_sweep_key or edge_base_url)';
    return null;
  end if;
  select net.http_post(
    url     := v_url || '/api/cron/playbooks',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.trigger_playbooks_sweep() from public, anon, authenticated;

-- Every hour at :05. A playbook runs in the hour the owner picked, by the
-- business's own clock; the edge decides which hour that is.
select cron.unschedule('playbooks-sweep') where exists (select 1 from cron.job where jobname = 'playbooks-sweep');
select cron.schedule('playbooks-sweep', '5 * * * *', $$select public.trigger_playbooks_sweep()$$);
