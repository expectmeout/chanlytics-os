-- 00105 · When the platform itself is wrong, one person is paged once.
--
-- alertFor addresses a workspace owner about a thing that happened to their
-- workspace. Nothing addressed the operator about a condition that is the
-- platform's: a provider rejecting every send with 401, a heartbeat that fails
-- fifty jobs in one run, a ledger nobody is draining. Those produced N owner
-- emails hours later and zero pages. This table is the pager's memory: one row
-- per condition key, and alerted_at is the suppression stamp, written only
-- after a page was delivered -- a page that did not send earns no quiet.
--
-- Platform-only. Row level security is on with no policies, like sweep_status:
-- the service role writes it from the edge, and no session reads it.

create table public.operator_pages (
  key        text primary key,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  count      integer not null default 1,
  alerted_at timestamptz
);

comment on table public.operator_pages is
  'Systemic conditions (provider auth failing, heartbeat mass-failing, ledger backlog) keyed by condition. alerted_at is the suppression stamp: one page per key per window, stamped only after delivery.';

alter table public.operator_pages enable row level security;
revoke all on public.operator_pages from public, anon, authenticated;

-- Ledger backlog: due work nobody has claimed. The honest measure of whether
-- the heartbeat is draining, read by the health sweep and shown on /api/diag.
create or replace function public.jobs_backlog(p_wait interval default interval '2 minutes')
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.jobs
   where state = 'scheduled' and due_at < now() - p_wait;
$$;

comment on function public.jobs_backlog(interval) is
  'How many scheduled jobs have been due for longer than p_wait (default two minutes) and not been claimed. Zero when the heartbeat is draining.';

revoke execute on function public.jobs_backlog(interval) from public, anon, authenticated;
grant execute on function public.jobs_backlog(interval) to service_role;
