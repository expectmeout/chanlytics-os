-- 00575 · A browser may be told, and Ask tells a business one thing a morning (the answers canvas, D12 and D20).
--
--   web_push_subscriptions   A member's browsers that said yes to being told, by the address their browser gave. A person's own,
--                            as push_devices is: read by user_id, written on their own session, read by the job with the service
--                            role. Dormant until the deployment holds its VAPID keys: nothing is sent without them.
--   ask_notice_days          One row per business per day: Ask has looked this morning, and what it told. It holds a key and a
--                            day, never a person's words. It is what makes a morning once a day, and a notice never twice in a week.
--
-- Deploy order: this first; the code reads a missing table as nobody to tell. Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  failed_at timestamptz,
  constraint web_push_subscriptions_endpoint_len check (length(endpoint) <= 1000),
  constraint web_push_subscriptions_one unique (user_id, endpoint)
);
comment on table public.web_push_subscriptions is
  'A member''s browsers that said yes to being told (the answers canvas, D12), as push_devices is their phones.';

alter table public.web_push_subscriptions enable row level security;
drop policy if exists web_push_subscriptions_own on public.web_push_subscriptions;
create policy web_push_subscriptions_own on public.web_push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.web_push_subscriptions from anon, authenticated;
grant select, insert, delete on public.web_push_subscriptions to authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to service_role;

create table if not exists public.ask_notice_days (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day date not null,
  key text,
  told_at timestamptz not null default now(),
  primary key (tenant_id, day)
);
comment on table public.ask_notice_days is
  'One morning per business (the answers canvas, D20): Ask looked, and told this key, if any. Written by the sweep.';

alter table public.ask_notice_days enable row level security;
drop policy if exists ask_notice_days_member_select on public.ask_notice_days;
create policy ask_notice_days_member_select on public.ask_notice_days for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ask_notice_days from anon, authenticated;
grant select on public.ask_notice_days to authenticated;
grant select, insert, update, delete on public.ask_notice_days to service_role;
