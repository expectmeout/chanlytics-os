-- 00108 · An owner's activation of a capability is a record.
--
-- Readiness is computed from records the workspace already holds: the line,
-- the channel row, Meta's approval, the business facts. Nothing recorded that
-- the owner tried the capability and switched it on; "answering" was the only
-- claim the product made. PRD ON-02: readiness and owner activation are
-- separate, test evidence is recorded, blockers are machine-readable. This
-- table is the activation. contracts/capabilities.ts computes the rest from
-- what the workspace has (capabilityStatus), and evidence is what the records
-- show -- a call answered, a message replied to -- never a claim.
--
-- Activation gates nothing at runtime yet. The pilot workspace answers today
-- and keeps answering; what activation gates (the recurring service, the
-- sales copy) is a G2 decision, and the record is what makes it possible.
--
-- Phase two B, Task 3 (docs/plans/2026-09-11-phase-two-b-paid-activation.md).

create table public.capability_activations (
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  capability     text not null check (capability in ('voice', 'whatsapp', 'sms')),
  activated_at   timestamptz not null default now(),
  activated_by   uuid references auth.users (id) on delete set null,
  deactivated_at timestamptz,
  note           text check (note is null or length(note) <= 200),
  primary key (tenant_id, capability)
);

comment on table public.capability_activations is
  'One row per capability an owner has switched on for their workspace: when, by whom, and when switched off again. Readiness and test evidence are computed from other records (contracts capabilityStatus); this is the owner''s act.';
comment on column public.capability_activations.deactivated_at is
  'Set when the owner switches the capability off again; the row stays, so the history of the decision does.';

alter table public.capability_activations enable row level security;

-- Every member may read; only an owner may write, through the dashboard's
-- route with the session client, so RLS is the enforcement.
create policy capability_activations_member_read on public.capability_activations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy capability_activations_owner_write on public.capability_activations
  for all to authenticated
  using (public.is_workspace_owner(tenant_id))
  with check (public.is_workspace_owner(tenant_id));

-- Setup and Connections repaint when it changes, in every tab.
alter publication supabase_realtime add table public.capability_activations;
