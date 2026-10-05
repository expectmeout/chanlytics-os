-- 00299 · A member reads their workspace's days.
--
-- The Reports lenses spec, K10. The rolled days (platform_metrics, 00277, widened by 00298) are the back office's table:
-- RLS on and no member policy, because latency, provider failures and, since 00298, dollars live in it. The lenses past
-- ninety days (the Overview's trends, Usage's earlier periods) need the part of a day that is a workspace's own, so
-- workspace_days returns exactly those columns and no others (day, messages_in, messages_out, asks, answered, handled,
-- topics, ai_tokens), to a member of that workspace. Never ai_usd, voice_usd, brain_p95_ms, provider_failures,
-- replies_* or the legacy tokens: they stay in a table no session can read, and this function names its columns, so a
-- column added to the table later is not in the answer until a migration puts it there.
--
-- Why a definer and not an invoker read. The read functions are SECURITY INVOKER, so RLS scopes every inner select to
-- the caller (docs/system-prd.md, the read functions: metrics_summary, report_series, campaign_series, first_replies,
-- people_list). Here an invoker read sees nothing, since the table has no member policy on purpose; a member policy
-- would hand an owner the dollars; column grants would break `select *` and the tenancy harness. So this is a definer
-- read, as team_roster (00022, 00068, 00261) and Reach out's member reads (reach_out_report, reach_out_search_lines,
-- reach_out_lead_timeline, reach_out_reach, reach_out_chain_report: 00211, 00241) are: one of the workspace-scoped
-- definer reads that check membership inline. Like team_roster it reads what no session may read (auth.users there,
-- platform_metrics here), SECURITY DEFINER with a pinned search_path, and checks the caller itself.
-- RLS stays the floor (the table is still closed to every session; tenancy.db.test.mjs pins it `none`) and the check
-- below is the door: the one membership predicate those six and recording_opened carry, a partner's seat counting
-- only on a session that showed its second factor (session_shows_second_factor, 00218). A session with no user (the
-- service role, anon) is refused. A route above it will declare the role (Usage is the owner's); no route reads it yet.
--
-- A day rolled before 00298 returns null in handled, topics and ai_tokens: absent, never zero. At most 800 days a call.
--
-- Either deploy order works (nothing reads it yet). No table is changed.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.workspace_days(p_tenant_id uuid, p_from date, p_to date)
returns table (
  day          date,
  messages_in  jsonb,
  messages_out jsonb,
  asks         integer,
  answered     integer,
  handled      jsonb,
  topics       jsonb,
  ai_tokens    jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- THE guard. A definer function that reads a table no member may read and does not check who is asking is a read of
  -- every workspace at once.
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
       and (m.role <> 'partner' or public.session_shows_second_factor())
  ) then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to - p_from > 799 then
    raise exception 'workspace_days: a range of at most 800 days, with both dates' using errcode = '22023';
  end if;
  -- Every reference is qualified: the OUT parameters are in scope for the whole body.
  return query
    select pm.day, pm.messages_in, pm.messages_out, pm.asks, pm.answered, pm.handled, pm.topics, pm.ai_tokens
      from public.platform_metrics pm
     where pm.tenant_id = p_tenant_id and pm.day >= p_from and pm.day <= p_to
     order by pm.day;
end $$;
revoke all on function public.workspace_days(uuid, date, date) from public, anon;
grant execute on function public.workspace_days(uuid, date, date) to authenticated;
comment on function public.workspace_days(uuid, date, date) is
  'A workspace''s rolled days between two dates, oldest first, for a member of that workspace (K10): the messages in and out by channel, the asks and how many were answered, how each customer message ended, what they asked about, and the model''s tokens by purpose. Never the operator''s columns (dollars, latency, provider failures). Checks membership itself (a partner''s seat only with its second factor shown); refuses a session with no user and a range over 800 days. A day rolled before 00298 reads null in the last three.';
