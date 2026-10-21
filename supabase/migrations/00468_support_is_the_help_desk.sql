-- 00468 · Support is the help desk (decision 0067): a report says what the member needs, so a question reaches Support
-- and something that isn't working reaches Health; the team's answers are acts in the Admin log; and what a setup ask
-- tells the owner says the promise, one business day.
--
--   support_reports.kind         how_to, setup, wrong or billing: what the member picked on Get help. A report with an
--                                error and no pick is wrong (Health's); everything else is Support's. The reports kept
--                                before this are judged the same way: an error id makes them wrong.
--   platform_acts.target_kind    gains report and ask: a question answered, a setup ask answered, a report sent to the
--                                inbox again, a report moved between Support and Health.
--   setup_request()              the five bell notes say "We answer by email within one business day", and what to
--                                have ready where a person will need it (a port's PIN, a phone system's sign-in).
--
-- Deploy order: either. A dashboard from before this writes reports with the column's default and reads nothing of it;
-- this dashboard reads the column. Re-runnable.

set local lock_timeout = '3s';

-- ------------------------------------------------------------------------------------------------- what they need

alter table public.support_reports add column if not exists kind text not null default 'how_to';
alter table public.support_reports drop constraint if exists support_reports_kind_check;
alter table public.support_reports
  add constraint support_reports_kind_check check (kind in ('how_to', 'setup', 'wrong', 'billing'));
comment on column public.support_reports.kind is
  'What the member needs (00468, decision 0067): how_to (How do I…), setup (Help setting up), wrong (Something isn''t working: Health''s), billing. Picked on Get help; a report with an error and no pick is wrong.';

-- The reports kept before the pick existed: an error caught means something wasn't working.
update public.support_reports set kind = 'wrong' where error_id is not null and kind = 'how_to';

create index if not exists support_reports_kind_created on public.support_reports (kind, created_at desc);

-- ------------------------------------------------------------------------------------------- what the team answered

alter table public.platform_acts drop constraint if exists platform_acts_target_kind_check;
alter table public.platform_acts
  add constraint platform_acts_target_kind_check
  check (target_kind in ('workspace', 'line', 'job', 'waitlist', 'partner', 'request', 'platform', 'report', 'ask'));

-- -------------------------------------------------------------------------------- what a setup ask tells the owner

create or replace function public.setup_request(p_tenant_id uuid, p_what text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_title text;
  v_body text;
  v_route text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_what is null or p_what not in ('line', 'port', 'repair', 'forwarding', 'name') then
    raise exception 'Unknown request.' using errcode = '22023';
  end if;

  select max(e.created_at) into v_last
    from events e
   where e.tenant_id = p_tenant_id
     and e.kind = 'setup.requested'
     and e.data->>'what' = p_what;
  if v_last is not null and v_last > now() - interval '1 day' then
    return jsonb_build_object('ok', true, 'already', true, 'requested_at', v_last);
  end if;

  if p_what = 'line' then
    v_title := 'We got your request for a phone line';
    v_body := 'A person at Chanlytics will set up your line with you — a number, the receptionist answering it, and forwarding from the number you have. We answer by email within one business day.';
    v_route := 'admin/setup';
  elsif p_what = 'port' then
    v_title := 'We got your request to bring your number';
    v_body := 'A person at Chanlytics will move the number you have onto Chanlytics with you. Have ready the account number and port-out PIN from your current carrier, and a recent bill. Keep your current phone service until the move is finished — cancelling it first can lose the number. We answer by email within one business day.';
    v_route := 'admin/setup';
  elsif p_what = 'forwarding' then
    v_title := 'We got your request to set up forwarding';
    v_body := 'A person at Chanlytics will set up forwarding in your phone system with you on a call; have its admin sign-in ready. We answer by email within one business day to find a time.';
    v_route := 'start/phone';
  elsif p_what = 'name' then
    v_title := 'We got your request to change your name with the carriers';
    v_body := 'A person at Chanlytics will change the name the carriers hold for your texting to the one you saved. Until then, the text confirming a START says the name you filed. We answer by email within one business day.';
    v_route := 'admin/workspace';
  else
    v_title := 'We got your request to repair your settings';
    v_body := 'A person at Chanlytics will repair the business settings the receptionist can no longer read; until then it stays silent. We answer by email within one business day.';
    v_route := 'admin/workspace';
  end if;

  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
  values (p_tenant_id, 'alert', v_title, v_body, v_route, 'setup', null);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'setup.requested', 'setup', 'tenant', p_tenant_id,
          jsonb_build_object('what', p_what, 'by', v_user));

  return jsonb_build_object('ok', true, 'already', false, 'requested_at', now());
end $$;

revoke all on function public.setup_request(uuid, text) from public, anon;
grant execute on function public.setup_request(uuid, text) to authenticated;
comment on function public.setup_request(uuid, text) is
  'Setup: the owner asks a person at Chanlytics for something the product cannot do by itself -- a phone line, bringing a number over, setting up forwarding in an office phone system, repairing a configuration the receptionist cannot read, or changing the name the carriers hold (00439). A bell row for the workspace that says the promise, one business day, and what to have ready (00468); an event for the platform; idempotent within a day per thing.';
