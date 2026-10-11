-- 00405 · The Campaigns lens is read beyond the days' counts (Reports, the Campaigns lens).
--
-- campaign_series (00374, 00403) counts messages day by day: how many went out, were delivered, read, answered. It cannot
-- say how many PEOPLE a campaign reached or heard back from (a person on two runs is two sends), why sends failed, what a
-- run held back and why, which message earned a reply, how long a reply took, or how long an approval waited. The Campaigns
-- lens asks all of that, and this is its own read, `campaign_ledger(p_tenant_id, p_days, p_end)`: one statement, under the
-- caller's RLS (SECURITY INVOKER), over the window report_series reads (00360: `p_end` is its last day, null is today, a
-- day that has not come is today, in the workspace's zone) and the same number of days before it, for the parts that are
-- set against before. Counts only: no name, number, address or word a person or a provider wrote leaves it.
--
--   runs in reach  The workspace's `broadcasts` made from the period before's first instant, less `campaign_run_lead()`,
--                  to the window's end. A run is made, then waits (up to the 30 days contracts lets one be scheduled
--                  ahead, BROADCAST_SCHEDULE_MAX_DAYS, and a week for a hold or a throttle) and then sends, so a send in
--                  the span can belong to a run made before it. The lead is a bound from the earliest send the read looks
--                  at; the window is driven from `broadcasts_tenant_created` because `broadcast_recipients` has no index
--                  on (tenant_id, sent_at). The window's runs bound which recipients are kept; how they are read is the
--                  planner's (a hash join of the workspace's recipients at scale, measured 11 Oct 2026). A run's kind is
--                  read from its audience (`reach_out`, `moment`, else `broadcast`), never from `playbook_id`, which a
--                  deleted playbook sets to null; its time is `coalesce(started_at, scheduled_for)`.
--   sent           The recipients of those runs marked `sent` at an instant in the span, by `sent_at`, with the message
--                  each left (left-joined: a person erased has none) and the channel it went by (a row naming none went by
--                  WhatsApp, 00298). The reply probe is run_counts' shape (00374): one per send, the first inbound
--                  message of the customer's own words (message_is_a_persons_words) after the send and within
--                  campaign_reply_window(), on the thread the message is in, fenced by `offset 0` and naming no workspace.
--                  The same rule campaign_series counts replies by; a person on two runs answered once is a reply to
--                  each send, and one person here.
--   mature         A send counts toward a reply rate once its reply window is over, by the clock:
--                  `sent_at + campaign_reply_window() <= now()`. The probe counts a reply within the window whatever the
--                  read's window ends (the funnel's rule, campaign_series'), so the replies of a window that ended are
--                  all in once its sends are 72 hours old: every send in it is mature once 72 hours have passed since its
--                  end. One that ends today, or within the last 72 hours, holds sends that have had no time to be
--                  answered, so a plain comparison would read as a fall. `people.now.counting` is those people; a
--                  message's reply rate is of its mature sends.
--   people         Distinct people, now and before: sent to, wrote back (a person with a replied send), and, for the
--                  window, still counting. A person is one person on every run (the funnel counts sends, this counts
--                  people). An erased person is still one who was sent to: the run keeps its record of them and their
--                  messages are gone, so they are a send and a person and never a reply or a failure, and a reply rate
--                  can drift down as people are erased (campaign_series' does too). `runs` counts the runs that sent,
--                  by kind, of moments and broadcasts only: a reach-out step's run has no recipients (its people are
--                  reach_out_sends) and is never here.
--   held           The recipients of those runs the run did not send to (`skipped`, or `failed` at the wire), dated by
--                  their run's time, because a held person has no time of their own (broadcast_recipients has no
--                  timestamp and `sent_at` is null unless `sent`). By the recipient's reason if it is a word of ours
--                  (`^[a-z][a-z_]{0,39}$`; the column is free text), else `other`. A person still `queued` on a run that
--                  stopped was never reached and is not held.
--   stopped        The runs of moments and broadcasts that failed or were canceled, dated by their time; the failed ones by
--                  their `failure` if it is a code of ours (`^[a-z_]+(:[a-z]+)?$`), else `other`.
--   failed_sends   The sends made in the window that stand failed now: the recipients (any state) whose message was
--                  made in the window, by the message's own `created_at`, and is marked `failed` as it stands (one made
--                  last week that fails today is last week's). A late failure is only on the message: the recipient stays
--                  `sent`, and a campaign's late failure writes no event. By the channel, and by the provider's code,
--                  provider_code_of below (an email carries none: its word decides, as contracts' sendFailureWords reads
--                  it): or, where there is none, one word of a closed set (an email's `provider`, a text's `carrier`, a
--                  settled row's `reason`, or `outcome_unknown` for a send the provider never answered, which may have
--                  gone), else `unknown`. A body is never read out.
--   by_message     The window's sends by message, `(template_name, template_language)` of the run: never the first name of
--                  a source, never `messages.template_name` (null for a campaign). Sent, mature, and replied of the
--                  mature; the twenty with most sends.
--   first_reply    The window's sends that were answered, by the seconds to the first answer: the count, the median and
--                  how many in each of 15 minutes, 1 hour, 4 hours, 24 hours and 72 hours (each once, in the first it fits).
--   approval       The workspace's approvals made in the window: a `send_broadcast` decision with `payload.approved` true,
--                  against the run it approved (any kind, a reach-out step's too): the seconds from the run's being made
--                  to the decision. A `send_broadcast` written with the run and a `cancel_broadcast` are no wait.
--
-- Three functions, in this order. `campaign_run_lead()` says the lead once. `provider_code_of(error)` is the provider's
-- error code on a failed message, `providerCodeOf` in contracts' conversations/message-words.ts said again in SQL, and held
-- to it by reports/campaigns/provider-code.db.test.mjs: `errors[0].code`, then `code`, each a whole number above zero or
-- 3 to 6 digits in a string; then, if `body` is a string, `"code": <3 to 6 digits>` read from it (Graph's answer, cut short)
-- or `Twilio <5 digits>`, and if it is an object, `body.error.code`. The one difference: a number past the integer type is
-- none, since no provider has one. `campaign_ledger` is the read.
--
-- Free text never leaves: a reason, a failure and an error are text the database does not constrain, and each comes out
-- as a word of ours, a number of 3 to 6 digits or a word of a closed set, else `other` or `unknown`.
-- reports/campaigns/campaign-ledger.db.test.mjs holds all of it against a world whose answers are spelled out.
--
-- Either deploy order works: the dashboard says "no read yet" in words for a function the database lacks (isMissingDoor),
-- and nothing else reads these. Re-runnable: `create or replace`, the grants and comments said again.

set local lock_timeout = '3s';

create or replace function public.campaign_run_lead()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '37 days'
$$;
revoke execute on function public.campaign_run_lead() from public, anon;
grant execute on function public.campaign_run_lead() to authenticated, service_role;
comment on function public.campaign_run_lead() is
  'How long before a send its run may have been made: the 30 days a broadcast may be scheduled ahead (contracts BROADCAST_SCHEDULE_MAX_DAYS) plus a week for holds and throttles. campaign_ledger reads the runs made from the earliest instant it looks at, less this (00405).';

create or replace function public.provider_code_of(p_error jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select x.code
    from (select string_agg(chr(c), '') as ws
            from unnest(array[9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,
                              8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279]) c) w
   cross join lateral (values
           (1, p_error -> 'errors' -> 0 -> 'code'),
           (2, p_error -> 'code'),
           (3, case jsonb_typeof(p_error -> 'body')
                 when 'object' then p_error -> 'body' -> 'error' -> 'code'
                 when 'string' then to_jsonb(substring(p_error ->> 'body'
                                      from '"code"[' || w.ws || ']*:[' || w.ws || ']*([0-9]{3,6})'))
               end),
           (4, case jsonb_typeof(p_error -> 'body')
                 when 'string' then to_jsonb(substring(btrim(p_error ->> 'body', w.ws) from '^Twilio ([0-9]{5})$'))
               end)) c(ord, j)
   cross join lateral (
           select case jsonb_typeof(c.j)
                    when 'number' then
                      case when (c.j)::numeric > 0 and (c.j)::numeric = trunc((c.j)::numeric)
                                and (c.j)::numeric <= 2147483647
                           then (c.j)::numeric::integer end
                    when 'string' then
                      case when btrim(c.j #>> '{}', w.ws) ~ '^[0-9]{3,6}$' then btrim(c.j #>> '{}', w.ws)::integer end
                  end as code) x
   where x.code is not null
   order by c.ord
   limit 1
$$;
revoke execute on function public.provider_code_of(jsonb) from public, anon;
grant execute on function public.provider_code_of(jsonb) to authenticated, service_role;
comment on function public.provider_code_of(jsonb) is
  'The provider''s error code on a failed message, wherever the writer put it: the first of a receipt''s errors list, a receipt''s code, then the answer to the send itself as body (Graph''s JSON cut short, read for its "code", or "Twilio 30034"; or an object holding error.code). A code is a whole number above zero or 3 to 6 digits in a string; null when the row says none (a number past the integer type is none). contracts'' providerCodeOf says the same in TypeScript; reports/campaigns/provider-code.db.test.mjs holds the two equal (00405).';

create or replace function public.campaign_ledger(p_tenant_id uuid, p_days integer default 30, p_end date default null)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today  date;
  v_end    date;          -- the window's last day: today, or the earlier day a member picked (00360)
  v_start  timestamptz;   -- the window's first instant
  v_prior  timestamptz;   -- the period before's first instant
  v_stop   timestamptz;   -- the midnight after the window's last day, in the zone
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_prior := ((v_end - (v_days * 2 - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;

  with
  -- The window and the one before it, as periods: every part that is set against before reads both through this.
  periods(is_now) as (values (true), (false)),

  -- The runs a send in the span can belong to. The window is driven from broadcasts_tenant_created, since no index serves
  -- broadcast_recipients by (tenant_id, sent_at); its runs bound which recipients are kept, and the planner reads them
  -- (a hash join of the workspace's recipients at scale, 11 Oct 2026). The kind comes from the audience (a deleted
  -- playbook's run keeps it), the time from when the run started, else when it was to.
  runs_in_reach as (
    select b.id, b.state, b.failure, b.template_name, b.template_language,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.playbook_id is not null then 'moment'
                else 'broadcast' end                            as kind,
           coalesce(b.started_at, b.scheduled_for)              as run_at
      from broadcasts b
     where b.tenant_id = p_tenant_id
       and b.created_at >= v_prior - public.campaign_run_lead()
       and b.created_at <  v_stop
  ),

  -- Every recipient of those runs with the message they were sent, if any (a failed or erased one has none).
  rec as (
    select r.broadcast_id, r.contact_id, r.state, r.reason, r.sent_at,
           coalesce(r.channel, 'whatsapp')                      as channel,
           b.kind, b.run_at, b.template_name, b.template_language,
           m.conversation_id, m.status as message_status, m.error as message_error, m.created_at as message_at
      from runs_in_reach b
      join broadcast_recipients r on r.broadcast_id = b.id and r.tenant_id = p_tenant_id
      left join messages m on m.id = r.message_id
  ),

  -- What went out in the span: a person a run marked sent, whether they wrote back and how soon, and whether their
  -- reply window is over. One probe of messages_conversation_created (conversation_id, created_at) for each send,
  -- whatever the planner guesses: run_counts' shape (00374), which says why the probe is fenced and names no workspace.
  sent as (
    select s.*,
           (s.first_reply_at is not null)                                  as replied,
           (s.sent_at + public.campaign_reply_window() <= now())           as mature
      from (
        select r.broadcast_id, r.contact_id, r.channel, r.kind, r.template_name, r.template_language, r.sent_at,
               (r.sent_at >= v_start) as is_now,
               (select min(x.at)
                  from (select i.created_at as at
                          from messages i
                         where i.conversation_id = r.conversation_id
                           and i.direction = 'inbound'
                           and i.sender = 'customer'
                           and public.message_is_a_persons_words(i.meta)
                           and i.created_at > r.sent_at
                           and i.created_at <= r.sent_at + public.campaign_reply_window()
                        offset 0) x) as first_reply_at
          from rec r
         where r.state = 'sent'
           and r.sent_at >= v_prior and r.sent_at < v_stop
        -- Fenced here too: the probe is run once a send. Without it the planner pulls `s` up and copies the probe into
        -- `replied` as well, and every send is probed twice.
        offset 0
      ) s
  ),

  -- People, once each however many runs reached them; and the runs that sent, by kind (a reach-out run has no people here).
  people_stats as (
    select p.is_now,
           count(distinct s.contact_id)                                    as sent_to,
           count(distinct s.contact_id) filter (where s.replied)           as wrote_back,
           count(distinct s.contact_id) filter (where not s.mature)        as counting
      from periods p
      left join sent s on s.is_now = p.is_now
     group by p.is_now
  ),
  run_stats as (
    select p.is_now,
           count(distinct s.broadcast_id) filter (where s.kind = 'moment')    as moment,
           count(distinct s.broadcast_id) filter (where s.kind = 'broadcast') as broadcast
      from periods p
      left join sent s on s.is_now = p.is_now
     group by p.is_now
  ),

  -- Held: the people a run did not send to, dated by the run (they have no time of their own), told by a reason of ours.
  held_rows as (
    select r.state,
           case when r.reason ~ '^[a-z][a-z_]{0,39}$' then r.reason else 'other' end as reason
      from rec r
     where r.state in ('skipped', 'failed')
       and r.run_at >= v_start and r.run_at < v_stop
  ),
  held_stats as (
    select count(*)                                  as total,
           count(*) filter (where h.state = 'skipped') as skipped,
           count(*) filter (where h.state = 'failed')  as failed
      from held_rows h
  ),

  -- Stopped: the runs that failed or were canceled, dated by their time; the failed told by a code of ours.
  stopped_rows as (
    select b.state,
           case when b.failure ~ '^[a-z_]+(:[a-z]+)?$' then b.failure else 'other' end as failure
      from runs_in_reach b
     where b.kind in ('moment', 'broadcast')
       and b.state in ('failed', 'canceled')
       and b.run_at >= v_start and b.run_at < v_stop
  ),
  stopped_stats as (
    select count(*) filter (where b.state = 'failed')   as failed,
           count(*) filter (where b.state = 'canceled') as canceled
      from stopped_rows b
  ),

  -- Failed sends: a message marked failed in the window, by the channel it went by and the provider's code (an email has
  -- none); with none, one word of a closed set. The error is read and never repeated.
  failed_rows as (
    select f.channel, f.code,
           case when f.code is null then
                  case when f.channel = 'email' and f.error ->> 'provider' in ('bounced', 'failed', 'suppressed')
                         then f.error ->> 'provider'
                       when f.channel = 'sms' and f.error ->> 'carrier' in ('undelivered', 'failed', 'canceled')
                         then f.error ->> 'carrier'
                       when f.error ->> 'reason' in ('never_delivered', 'run_interrupted', 'orphaned')
                         then f.error ->> 'reason'
                       when f.error ->> 'outcome' = 'unknown' then 'outcome_unknown'
                       else 'unknown' end
           end as kind
      from (select r.channel, r.message_error as error,
                   -- An email carries no code: its word decides (sendFailureWords reads none for email either).
                   case when r.channel = 'email' then null else public.provider_code_of(r.message_error) end as code
              from rec r
             where r.message_status = 'failed'
               and r.message_at >= v_start and r.message_at < v_stop) f
  ),
  failed_by as (
    select f.channel, f.code, f.kind, count(*) as n
      from failed_rows f
     group by f.channel, f.code, f.kind
  ),

  -- By message: the window's sends by the name and language of the run's message; a reply rate is of the mature sends.
  by_message_rows as (
    select s.template_name as name, s.template_language as lang,
           count(*)                                          as sent,
           count(*) filter (where s.mature)                  as mature,
           count(*) filter (where s.mature and s.replied)    as replied
      from sent s
     where s.is_now
     group by s.template_name, s.template_language
     order by count(*) desc, s.template_name, s.template_language
     limit 20
  ),

  -- First reply: the window's answered sends, by seconds to the first answer, each in the first bucket it fits.
  reply_rows as (
    select extract(epoch from s.first_reply_at - s.sent_at)::double precision as seconds
      from sent s
     where s.is_now and s.replied
  ),
  reply_stats as (
    select count(*)                                                       as n,
           round(percentile_cont(0.5) within group (order by q.seconds))::bigint as median_s,
           count(*) filter (where q.seconds <= 900)                       as m15,
           count(*) filter (where q.seconds > 900   and q.seconds <= 3600)   as h1,
           count(*) filter (where q.seconds > 3600  and q.seconds <= 14400)  as h4,
           count(*) filter (where q.seconds > 14400 and q.seconds <= 86400)  as h24,
           count(*) filter (where q.seconds > 86400)                      as h72
      from reply_rows q
  ),

  -- Approval: an approval made in the window, from the run's being made to the decision. Joined to the run by id: the
  -- run may have been made long before, and may be of any kind.
  approval_rows as (
    select extract(epoch from d.created_at - b.created_at)::double precision as seconds
      from decisions d
      join broadcasts b on b.id = d.subject_id and b.tenant_id = d.tenant_id
     where d.tenant_id = p_tenant_id
       and d.subject_type = 'broadcast'
       and d.verb = 'send_broadcast'
       and d.payload ->> 'approved' = 'true'
       and d.created_at >= v_start and d.created_at < v_stop
  ),
  approval_stats as (
    select count(*)                                                       as n,
           round(percentile_cont(0.5) within group (order by q.seconds))::bigint as median_s,
           count(*) filter (where q.seconds <= 3600)                      as h1,
           count(*) filter (where q.seconds > 3600  and q.seconds <= 14400)  as h4,
           count(*) filter (where q.seconds > 14400 and q.seconds <= 86400)  as h24,
           count(*) filter (where q.seconds > 86400)                      as over
      from approval_rows q
  )

  select jsonb_build_object(
    'timezone', v_tz,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'days', v_days,
    'people', jsonb_build_object(
      'now', (select jsonb_build_object('sent_to', s.sent_to, 'wrote_back', s.wrote_back, 'counting', s.counting)
                from people_stats s where s.is_now),
      'before', (select jsonb_build_object('sent_to', s.sent_to, 'wrote_back', s.wrote_back)
                   from people_stats s where not s.is_now)),
    'runs', jsonb_build_object(
      'now', (select jsonb_build_object('moment', s.moment, 'broadcast', s.broadcast) from run_stats s where s.is_now),
      'before', (select jsonb_build_object('moment', s.moment, 'broadcast', s.broadcast)
                   from run_stats s where not s.is_now)),
    'held', (select jsonb_build_object(
               'total', s.total,
               'skipped', s.skipped,
               'failed', s.failed,
               'by_reason', coalesce((select jsonb_object_agg(t.reason, t.n) from (
                                select h.reason, count(*) as n from held_rows h group by h.reason) t), '{}'::jsonb))
               from held_stats s),
    'stopped', (select jsonb_build_object(
                  'failed', s.failed,
                  'canceled', s.canceled,
                  'by_failure', coalesce((select jsonb_object_agg(t.failure, t.n) from (
                                   select b.failure, count(*) as n from stopped_rows b
                                    where b.state = 'failed' group by b.failure) t), '{}'::jsonb))
                  from stopped_stats s),
    'failed_sends', jsonb_build_object(
      'total', (select count(*) from failed_rows),
      'by_code', coalesce((select jsonb_agg(jsonb_build_object(
                             'channel', f.channel, 'code', f.code, 'kind', f.kind, 'n', f.n)
                           order by f.n desc, f.channel, f.code, f.kind)
                             from failed_by f), '[]'::jsonb)),
    'by_message', coalesce((select jsonb_agg(jsonb_build_object(
                              'name', m.name, 'language', m.lang, 'sent', m.sent, 'mature', m.mature,
                              'replied', m.replied)
                            order by m.sent desc, m.name, m.lang)
                              from by_message_rows m), '[]'::jsonb),
    'first_reply', (select jsonb_build_object(
                      'n', s.n,
                      'median_s', s.median_s,
                      'buckets', jsonb_build_object('m15', s.m15, 'h1', s.h1, 'h4', s.h4, 'h24', s.h24, 'h72', s.h72))
                      from reply_stats s),
    'approval', (select jsonb_build_object(
                   'n', s.n,
                   'median_s', s.median_s,
                   'buckets', jsonb_build_object('h1', s.h1, 'h4', s.h4, 'h24', s.h24, 'over', s.over))
                   from approval_stats s)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.campaign_ledger(uuid, integer, date) from public, anon;
grant execute on function public.campaign_ledger(uuid, integer, date) to authenticated, service_role;

comment on function public.campaign_ledger(uuid, integer, date) is
  'Reports › Campaigns, beyond the days'' counts: over p_days and the same number of days before them, the people sent to and who wrote back (a person once, however many runs; sends whose 72-hour reply window is not over are still counting), the runs that sent by kind (moments and broadcasts), what runs held back and why (a reason of ours or other, dated by the run), the runs that failed or were canceled and why, why sends failed (the provider''s code, else one word of a closed set), each message''s sends, mature sends and replies, how soon the first reply came, and how long approvals waited. Counts only: nothing a person or a provider wrote comes out. SECURITY INVOKER: the caller''s RLS decides what a member reads. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today (00405).';
