-- Slice 2 / migration 0004 — Inbox substrate: escalations (the queue),
-- decisions (the ledger), templates (+ Melany seed), idempotency_keys,
-- claim_job (the QStash fire gate), and the app-plane RLS write policies
-- (session clients are the enforcement — Blueprint §8).

-- ---------------------------------------------------------------- escalations
create table public.escalations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  reason              text not null check (reason in ('human_token','non_text','refusal','rate_cap','policy_block','send_failed','deadman','brain_error','manual')),
  details             text,
  state               text not null default 'open' check (state in ('open','resolved')),
  resolved_by_user_id uuid references auth.users (id),
  decision_id         uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index escalations_one_open
  on public.escalations (conversation_id) where state = 'open';
create index escalations_tenant_open
  on public.escalations (tenant_id, created_at) where state = 'open';
create trigger escalations_set_updated_at
  before update on public.escalations
  for each row execute function extensions.moddatetime('updated_at');

-- ------------------------------------------------------------------ decisions
create table public.decisions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  subject_type  text not null check (subject_type in ('conversation','escalation','draft','lead','message','agent')),
  subject_id    uuid not null,
  verb          text not null check (verb in ('approve','edit','decline','snooze','take_over','hand_back','resolve','archive','reply','cancel_send','pause_agent','resume_agent')),
  actor_type    text not null check (actor_type in ('user','ai','system','owner_phone')),
  actor_user_id uuid references auth.users (id),
  payload       jsonb not null default '{}'::jsonb,
  undo_of       uuid references public.decisions (id),
  created_at    timestamptz not null default now(),
  check ((actor_type = 'user') = (actor_user_id is not null))
);
create index decisions_tenant_subject
  on public.decisions (tenant_id, subject_type, subject_id, created_at);

-- ------------------------------------------------------------------ templates
create table public.templates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  channel      text not null check (channel in ('whatsapp','voice','sms','email','instagram')),
  name         text not null,
  language     text not null,
  meta_status  text not null default 'pending' check (meta_status in ('approved','pending','rejected')),
  body_preview text,
  variables    jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, channel, name, language)
);
create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function extensions.moddatetime('updated_at');

insert into public.templates (tenant_id, channel, name, language, meta_status, body_preview, variables)
select id, 'whatsapp', 'booking_link_v1', 'en_US', 'approved',
       'Hi! Thanks for calling {{1}}. Book your appointment anytime here: {{2}} — walk-ins welcome too.',
       '[{"position":1,"label":"Business name","example":"Melany''s Beauty Salon"},{"position":2,"label":"Booking link","example":"booksy.com/..."}]'::jsonb
  from public.tenants where slug = 'melanys-beauty-salon'
on conflict (tenant_id, channel, name, language) do nothing;

-- ----------------------------------------------------------- idempotency_keys
create table public.idempotency_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  key          text not null,
  route        text not null,
  request_hash text,
  response     jsonb,
  created_at   timestamptz not null default now(),
  unique (tenant_id, key)
);

-- ------------------------------------------------------------------ claim_job
-- The QStash fire gate: exactly-once transition scheduled -> fired.
create or replace function public.claim_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
begin
  select * into v_job from jobs where id = p_job_id for update;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;
  if v_job.state <> 'scheduled' then
    return jsonb_build_object('claimed', false, 'reason', v_job.state);
  end if;
  update jobs set state = 'fired', fired_at = now(), attempts = attempts + 1
   where id = p_job_id;
  return jsonb_build_object(
    'claimed', true, 'id', v_job.id, 'tenant_id', v_job.tenant_id,
    'kind', v_job.kind, 'payload', v_job.payload, 'due_at', v_job.due_at);
end $$;
revoke execute on function public.claim_job(uuid) from public, anon, authenticated;

create or replace function public.fail_job(p_job_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update jobs set state = 'failed', last_error = left(p_error, 500) where id = p_job_id;
$$;
revoke execute on function public.fail_job(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS (§8)
alter table public.escalations      enable row level security;
alter table public.decisions        enable row level security;
alter table public.templates        enable row level security;
alter table public.idempotency_keys enable row level security;

create policy escalations_member_select on public.escalations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
create policy escalations_member_update on public.escalations
  for update to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy decisions_member_select on public.decisions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- the ledger is verifiable: a session can only write itself as the actor
create policy decisions_member_insert on public.decisions
  for insert to authenticated
  with check (
    tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
    and actor_type = 'user' and actor_user_id = (select auth.uid())
  );

create policy templates_member_select on public.templates
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy idempotency_member_all on public.idempotency_keys
  for all to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- app-plane verb writes (session-scoped; server code shapes the rows,
-- RLS scopes the tenant):
create policy conversations_member_update on public.conversations
  for update to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

create policy messages_member_insert on public.messages
  for insert to authenticated
  with check (
    tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
    and direction = 'outbound' and sender = 'human'
  );
create policy messages_member_update on public.messages
  for update to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));

-- --------------------------------------------------------- realtime (§5)
alter publication supabase_realtime add table public.escalations, public.decisions;
