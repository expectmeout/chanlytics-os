-- 00574 · A record of each thing Ask did (the answers canvas, D16).
--
-- What a card became was kept only on the turn that proposed it, as text in its JSON. An action that may run with no press,
-- from a lock screen or on a spoken yes needs a record of its own: who decided, how, why it was allowed, and how it ended.
--
--   ask_actions    One row per card acted on. It holds no person's words, only closed sets and ids: what the card said stays
--                  on its turn, which an erasure already reaches (scrub_ask_for_contact, 00501), so a row here outlives a
--                  scrubbed or deleted turn as a bare record that something was done. It names that turn by id alone, with
--                  no key: a turn gone is no reason to lose the record. A member who leaves leaves the row, without their name.
--
-- Written by the member's own session under RLS, at the act door (server/ask/act/run.ts). A row is unique per card, so a press
-- sent twice acts once. Deploy order: this first; the door treats a missing table as no record, and a press still goes.
-- Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.ask_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  message_id uuid,
  proposal_id text not null,
  kind text not null,
  by text not null,
  origin_by text,
  strangers boolean not null default false,
  reason text,
  state text not null default 'running',
  made_kind text,
  made_id text,
  code text,
  at timestamptz not null default now(),
  finished_at timestamptz,
  constraint ask_actions_by_check check (by in ('press', 'yes', 'row', 'lock_screen', 'mail')),
  constraint ask_actions_state_check check (state in ('running', 'done', 'failed', 'undone')),
  constraint ask_actions_origin_check check (origin_by is null or origin_by in ('asked', 'rule', 'follow_up', 'idea')),
  constraint ask_actions_one_per_card unique (tenant_id, message_id, proposal_id)
);
comment on table public.ask_actions is
  'What Ask did and why it was allowed (the answers canvas, D16): closed sets and ids alone, the words stay on the turn.';

create index if not exists ask_actions_recent on public.ask_actions (tenant_id, at desc);
create index if not exists ask_actions_user on public.ask_actions (user_id);

alter table public.ask_actions enable row level security;
drop policy if exists ask_actions_member_select on public.ask_actions;
create policy ask_actions_member_select on public.ask_actions for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists ask_actions_acting_insert on public.ask_actions;
create policy ask_actions_acting_insert on public.ask_actions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_acting_member(tenant_id));
drop policy if exists ask_actions_own_update on public.ask_actions;
create policy ask_actions_own_update on public.ask_actions for update to authenticated
  using (user_id = (select auth.uid()) and public.is_acting_member(tenant_id))
  with check (user_id = (select auth.uid()) and public.is_acting_member(tenant_id));
revoke all on public.ask_actions from anon, authenticated;
grant select on public.ask_actions to authenticated;
grant insert (tenant_id, user_id, message_id, proposal_id, kind, by, origin_by, strangers, reason) on public.ask_actions to authenticated;
grant update (state, made_kind, made_id, code, finished_at) on public.ask_actions to authenticated;
grant select, insert, update, delete on public.ask_actions to service_role;
