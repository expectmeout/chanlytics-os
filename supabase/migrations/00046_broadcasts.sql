-- 00046 Broadcasts: one approved template to the people who said yes.
--
-- The first honest campaign. A broadcast names a template Meta approved, the
-- values for its variables, and an audience — one of People's lists, a list
-- kept by hand, or everyone — crossed with who said yes to offers. The
-- recipients are enrolled when the broadcast is made, so the owner sees who
-- and how many; the send re-checks each person at the wire (consent, a phone,
-- a human mid-thread) and records why anyone was held back. Delivery comes
-- from the message rows the status webhook already keeps, so nothing here
-- estimates: a broadcast's numbers are its messages' statuses.
--
-- Rows are made by the route with the session client; the send job (service
-- role) moves the recipients and the broadcast. The ledger records the
-- decision to send and the decision to cancel.

create table public.broadcasts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  name              text not null check (length(name) between 1 and 80),
  template_id       uuid not null references public.templates (id),
  template_name     text not null,
  template_language text not null,
  params            jsonb not null default '[]'::jsonb,
  audience          jsonb not null default '{}'::jsonb,
  state             text not null default 'scheduled'
                    check (state in ('scheduled', 'sending', 'sent', 'canceled', 'failed')),
  scheduled_for     timestamptz not null,
  started_at        timestamptz,
  finished_at       timestamptz,
  recipient_count   int not null default 0,
  failure           text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index broadcasts_tenant_created on public.broadcasts (tenant_id, created_at desc);
create trigger broadcasts_set_updated_at
  before update on public.broadcasts
  for each row execute function extensions.moddatetime('updated_at');

create table public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  state        text not null default 'queued' check (state in ('queued', 'sent', 'skipped', 'failed')),
  reason       text,
  message_id   uuid references public.messages (id) on delete set null,
  sent_at      timestamptz,
  primary key (broadcast_id, contact_id)
);
create index broadcast_recipients_queued on public.broadcast_recipients (broadcast_id) where state = 'queued';
create index broadcast_recipients_message on public.broadcast_recipients (message_id);

alter table public.broadcasts           enable row level security;
alter table public.broadcast_recipients enable row level security;

-- Members read; an acting member makes one in their own name and may move
-- its state (cancel) and nothing else about it; nobody deletes — a sent
-- broadcast is a record. The job writes with the service role.
create policy broadcasts_member_select on public.broadcasts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy broadcasts_acting_insert on public.broadcasts
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));
create policy broadcasts_acting_update on public.broadcasts
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));

create policy broadcast_recipients_member_select on public.broadcast_recipients
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy broadcast_recipients_acting_insert on public.broadcast_recipients
  for insert to authenticated
  with check (
    public.is_acting_member(tenant_id)
    and exists (select 1 from public.broadcasts b where b.id = broadcast_id and b.tenant_id = broadcast_recipients.tenant_id)
    and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = broadcast_recipients.tenant_id and c.erased_at is null)
  );

grant select, insert on public.broadcasts to authenticated;
grant update (state) on public.broadcasts to authenticated;
grant select, insert on public.broadcast_recipients to authenticated;

-- The ledger: subject 'broadcast', verbs 'send_broadcast' and 'cancel_broadcast'.
-- packages/contracts/src/enums.ts carries the same lists, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast'
  ));
