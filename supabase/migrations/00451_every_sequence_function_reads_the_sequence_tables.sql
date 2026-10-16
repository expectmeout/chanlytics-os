-- 00451: every function that read a sequence through one of the five old names reads the sequence tables themselves
-- (decision 0060, S2 and S6). 00440 moved what sends on its own to sequence_steps, sequence_batches, sequence_sends and
-- sequence_replies and left a view under each old name (playbooks, broadcasts, broadcast_recipients, reach_out_sends,
-- reach_out_replies) so every function kept working while the code moved; the code has moved, and these 72 functions are
-- the last readers of the views, which 00452 drops.
--
-- Each body is the one production runs, with nothing changed but the names it reads by: a view's table, the columns the
-- view renamed (after_playbook_id is after_step_id, playbook_id step_id, broadcast_id batch_id, root_id sequence_id,
-- attempt attempts; a bare select item keeps its old name as its alias, so every key and column a caller reads stays),
-- and a send view's own filter written where each one was read (lead_id is not null for a lead's send, as
-- reach_out_sends filtered; lead_id is null for a customer's, as broadcast_recipients did). Signatures, grants, owners and
-- every answer's shape are unchanged, so either deploy order works. Checked on a replay with the views dropped:
-- plpgsql_check finds nothing, and every SQL function is created again without an error. Re-runnable.

create or replace function public.approve_broadcast(p_tenant_id uuid, p_broadcast_id uuid, p_send_at timestamp with time zone, p_job jsonb, p_decision jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_released uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_send_at is null then
    raise exception 'approve_broadcast: a run is released for a moment' using errcode = '22004';
  end if;
  -- Only a run still waiting, and this workspace's: the row carries the time its job carries (00119). No row is a run
  -- that moved while the person looked (approved by someone else, skipped, canceled), and nothing else is written.
  update public.sequence_batches
     set state = 'scheduled', scheduled_for = p_send_at
   where id = p_broadcast_id and tenant_id = p_tenant_id and state = 'pending_approval'
  returning id into v_released;
  if v_released is null then
    return null;
  end if;
  -- The send, on the ledger no session may write: what the caller carries with it (the request it was approved in)
  -- rides in the payload, and the run it sends is named here, never by the caller.
  if p_job is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'broadcast_send', p_send_at,
            (case when jsonb_typeof(p_job) = 'object' then p_job else '{}'::jsonb end)
              || jsonb_build_object('broadcast_id', p_broadcast_id));
  end if;
  return public.team_decision(p_tenant_id, v_actor, 'broadcast', p_broadcast_id, 'send_broadcast',
                              coalesce(p_decision, '{}'::jsonb), p_via, p_undo_of);
end $$;

create or replace function public.assemble_broadcast(p_tenant uuid, p_run jsonb, p_recipients jsonb, p_send_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_id uuid;
  v_asked int := jsonb_array_length(coalesce(p_recipients, '[]'::jsonb));
  v_enrolled int;
  v_off int;
  -- The channels the run ticks, as given; none given is WhatsApp alone, as every run was before. A list that is not the
  -- three channels, each once, is the column's CHECK to refuse, and a value that is no list raises here.
  v_channels text[] := case
    when coalesce(jsonb_typeof(p_run->'channels'), 'null') = 'null' then array['whatsapp']
    else array(select jsonb_array_elements_text(p_run->'channels'))
  end;
begin
  if (p_run->>'template_id') is not null and not exists (
       select 1 from public.templates t where t.id = (p_run->>'template_id')::uuid and t.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the template is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  if (p_run->>'playbook_id') is not null and not exists (
       select 1 from public.sequence_steps b where b.id = (p_run->>'playbook_id')::uuid and b.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the playbook is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, params, audience,
                                 state, scheduled_for, recipient_count, created_by, step_id, run_for, channels)
  values (p_tenant, p_run->>'name', (p_run->>'template_id')::uuid, p_run->>'template_name',
          p_run->>'template_language', coalesce(p_run->'params', '[]'::jsonb), coalesce(p_run->'audience', '{}'::jsonb),
          p_run->>'state', (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int,
          (p_run->>'created_by')::uuid, (p_run->>'playbook_id')::uuid, (p_run->>'run_for')::date, v_channels)
  returning id into v_id;

  -- Each person is on a channel the run ticks. None named is WhatsApp (a recipient written before the channels), so a run
  -- that does not tick WhatsApp refuses a person with none, as it refuses one on a channel it did not tick.
  select count(*)::int into v_off
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(contact_id uuid, facts jsonb, channel text)
   where coalesce(x.channel, 'whatsapp') <> all (v_channels);
  if v_off > 0 then
    raise exception 'assemble_broadcast: % of the % people are on a channel the run does not tick', v_off, v_asked
      using errcode = '22023';
  end if;

  insert into public.sequence_sends (batch_id, contact_id, tenant_id, facts, channel)
  select v_id, x.contact_id, p_tenant, x.facts, x.channel
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(contact_id uuid, facts jsonb, channel text)
   where exists (select 1 from public.contacts c
                  where c.id = x.contact_id and c.tenant_id = p_tenant and c.erased_at is null);
  get diagnostics v_enrolled = row_count;
  if v_enrolled <> v_asked then
    raise exception 'assemble_broadcast: % of the % people are not this workspace''s to send to', v_asked - v_enrolled,
      v_asked using errcode = '42501';
  end if;

  if p_send_at is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant, 'broadcast_send', p_send_at, jsonb_build_object('broadcast_id', v_id));
  end if;
  return v_id;
end $$;

create or replace function public.campaign_answers(p_tenant_id uuid, p_since timestamp with time zone, p_until timestamp with time zone)
 returns TABLE(broadcast_id uuid, contact_id uuid, event_id uuid, at timestamp with time zone, consent text, purpose text, exact boolean)
 language sql
 stable
 set search_path to ''
as $$
  with said as (
    -- Every yes and stop of a live person from p_since on, with the purpose it is about and the key it carries (null where
    -- it carries none of its own kind).
    select e.id, e.subject_id as contact_id, e.created_at,
           date_trunc('milliseconds', e.created_at) as ms,
           x.consent, x.purpose,
           case when x.purpose = 'email_marketing' and x.consent = 'opted_out'
                 and x.source in ('unsubscribe', 'complaint', 'reply')
                 and jsonb_typeof(e.data -> 'message_id') = 'string' and e.data ->> 'message_id' <> ''
                then e.data ->> 'message_id' end as key_mail,
           case when x.source in ('carrier', 'whatsapp')
                 and jsonb_typeof(e.data -> 'message_external_id') = 'string' and e.data ->> 'message_external_id' <> ''
                then e.data ->> 'message_external_id' end as key_wire
      from public.events e
      join public.contacts c
        on c.tenant_id = e.tenant_id and c.id = e.subject_id
       and c.erased_at is null and c.merged_into_contact_id is null
     cross join lateral (
       select e.data ->> 'consent' as consent,
              e.data ->> 'source'  as source,
              case when e.data ->> 'purpose' in ('email_marketing', 'marketing')
                   then e.data ->> 'purpose' else 'conversational' end as purpose) x
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= p_since
       and x.consent in ('opted_in', 'opted_out')
       and coalesce(x.source, '') not in ('merge', 'stop')
  ),
  -- The ones that can stand for a run: those within the reply window past p_until, where a later answer by the clock can
  -- still come, and those with a key, which belong to their send whenever they came.
  ev as (
    select s.*
      from said s
     where s.created_at < p_until + public.campaign_reply_window()
        or s.key_mail is not null or s.key_wire is not null
  ),
  -- An event that carries a key belongs to the person's send that key names, and to no other.
  by_key as (
    select r.batch_id as broadcast_id, v.contact_id, v.id as event_id, v.created_at as at, v.ms, v.consent, v.purpose
      from ev v
      join public.sequence_sends r
        on r.lead_id is null and ( r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent'
       and r.message_id::text = v.key_mail)
     where v.key_mail is not null
    union all
    select r.batch_id as broadcast_id, v.contact_id, v.id, v.created_at, v.ms, v.consent, v.purpose
      from ev v
      join public.messages m
        on m.tenant_id = p_tenant_id and m.external_id = v.key_wire
      join public.sequence_sends r
        on r.lead_id is null and ( r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent' and r.message_id = m.id)
     where v.key_wire is not null
  ),
  -- Every other event belongs to each send of the person it came after, within the reply window; an answer about offers
  -- by email, to a send that went by email.
  by_time as (
    select r.batch_id as broadcast_id, v.contact_id, v.id as event_id, v.created_at as at, v.ms, v.consent, v.purpose
      from ev v
      join public.sequence_sends r
        on r.lead_id is null and ( r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent')
     where v.key_mail is null and v.key_wire is null
       and v.ms > date_trunc('milliseconds', r.sent_at)
       and v.ms <= date_trunc('milliseconds', r.sent_at) + public.campaign_reply_window()
       and (v.purpose <> 'email_marketing' or r.channel = 'email')
  ),
  attributed as (
    select k.*, true as exact from by_key k
    union all
    select t.*, false as exact from by_time t
  ),
  -- The latest a person said to a run stands for it.
  latest as (
    select distinct on (a.broadcast_id, a.contact_id) a.*
      from attributed a
     order by a.broadcast_id, a.contact_id, a.ms desc, a.event_id::text collate "C" desc
  )
  select l.broadcast_id, l.contact_id, l.event_id, l.at, l.consent, l.purpose, l.exact
    from latest l
   where l.at >= p_since and l.at < p_until
$$;

create or replace function public.campaign_ledger(p_tenant_id uuid, p_days integer DEFAULT 30, p_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
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
                when b.audience ->> 'kind' = 'playbook' or b.step_id is not null then 'moment'
                else 'broadcast' end                            as kind,
           coalesce(b.started_at, b.scheduled_for)              as run_at
      from sequence_batches b
     where b.tenant_id = p_tenant_id
       and b.created_at >= v_prior - public.campaign_run_lead()
       and b.created_at <  v_stop
  ),

  -- Every recipient of those runs with the message they were sent, if any (a failed or erased one has none).
  rec as (
    select r.batch_id as broadcast_id, r.contact_id, r.state, r.reason, r.sent_at,
           coalesce(r.channel, 'whatsapp')                      as channel,
           b.kind, b.run_at, b.template_name, b.template_language,
           m.conversation_id, m.status as message_status, m.error as message_error, m.created_at as message_at
      from runs_in_reach b
      join sequence_sends r on r.lead_id is null and ( r.batch_id = b.id and r.tenant_id = p_tenant_id)
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
      join sequence_batches b on b.id = d.subject_id and b.tenant_id = d.tenant_id
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

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer DEFAULT 30, p_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_end    date;
  v_start  timestamptz;
  v_stop   timestamptz;
  v_cur    date;
  v_cur_start timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_span - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  v_cur   := v_end - (v_days - 1);
  -- The current period's first instant: an answer from here on is the current period's, one before it the period before's.
  v_cur_start := v_cur::timestamp at time zone v_tz;

  with days as (
    select (v_end - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- Every message a broadcast or a playbook run actually sent in the span,
  -- with the receipt WhatsApp gave it and the thread it landed in.
  sent as (
    select r.batch_id as broadcast_id, r.contact_id, r.sent_at,
           -- The channel it went by (00298); a row from before channels went by WhatsApp, as every run then did.
           coalesce(r.channel, 'whatsapp') as channel,
           (r.sent_at at time zone v_tz)::date as day,
           m.status as message_status, m.conversation_id,
           b.step_id as playbook_id, b.name as broadcast_name, b.template_name
      from sequence_sends r
      join sequence_batches b on b.id = r.batch_id
      left join messages m on m.id = r.message_id
     where r.lead_id is null and ( r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and r.sent_at >= v_start and r.sent_at < v_stop)
  ),
  -- Replied: the customer wrote in that thread after the message went out, in their own words: not a call's note
  -- (an inbound row the system wrote) and not a program writing from their address (message_is_a_persons_words, 00299).
  -- The same rule the Broadcasts page counts by (the dashboard's broadcasts reader, contracts isPersonsWords).
  sent_r as (
    select s.*,
           (s.message_status in ('delivered', 'read')) as delivered,
           (s.message_status = 'read')                as was_read,
           exists (select 1 from messages i
                    where i.conversation_id = s.conversation_id
                      and i.direction = 'inbound'
                      and i.sender = 'customer'
                      and public.message_is_a_persons_words(i.meta)
                      and i.created_at > s.sent_at
                      and i.created_at <= s.sent_at + public.campaign_reply_window())  as replied
      from sent s
  ),
  -- A yes or a stop is an answer to a campaign (00403): what a person said to a run that reached them, from the desk or in
  -- their own words, the unsubscribe an offer by email invites among them (00174) and a carrier's or WhatsApp's STOP, and
  -- not the consent ledger as a whole (campaign_answers says which events are one). A person counts once a period and
  -- answer, on the day of the earliest, whatever runs they said it to: the unsubscribe page's "stop all" writes the STOP
  -- and email's own no for one press (stop_all_messages), and that is one stop.
  consent as (
    select distinct on (a.contact_id, a.consent, (a.at >= v_cur_start))
           (a.at at time zone v_tz)::date as day, a.contact_id, a.consent
      from public.campaign_answers(p_tenant_id, v_start, v_stop) a
     order by a.contact_id, a.consent, (a.at >= v_cur_start), a.at, a.event_id
  ),
  -- Each day from one pass over each source, grouped by the day (00251), where a scalar subquery per day and per
  -- count scanned both again for every day.
  per_day as (
    select d.day,
           coalesce(s.sent, 0)      as sent,
           coalesce(s.delivered, 0) as delivered,
           coalesce(s.was_read, 0)  as was_read,
           coalesce(s.replied, 0)   as replied,
           coalesce(c.opt_ins, 0)   as opt_ins,
           coalesce(c.opt_outs, 0)  as opt_outs
      from days d
      left join (select s.day, count(*) as sent,
                        count(*) filter (where s.delivered) as delivered,
                        count(*) filter (where s.was_read)  as was_read,
                        count(*) filter (where s.replied)   as replied
                   from sent_r s group by s.day) s on s.day = d.day
      left join (select c.day,
                        count(*) filter (where c.consent = 'opted_in')  as opt_ins,
                        count(*) filter (where c.consent = 'opted_out') as opt_outs
                   from consent c group by c.day) c on c.day = d.day
  ),
  -- The current period by source: a playbook's runs together, a one-off
  -- broadcast on its own.
  sources as (
    select coalesce(s.playbook_id, s.broadcast_id) as id,
           (s.playbook_id is not null)             as is_playbook,
           coalesce(max(p.name), max(s.broadcast_name)) as name,
           max(s.template_name)                    as template_name,
           count(distinct s.broadcast_id)          as runs,
           count(*)                                as sent,
           count(*) filter (where s.delivered)     as delivered,
           count(*) filter (where s.was_read)      as was_read,
           count(*) filter (where s.replied)       as replied,
           max(s.sent_at)                          as last_at
      from sent_r s
      left join sequence_steps p on p.id = s.playbook_id
     where s.day >= v_cur
     group by coalesce(s.playbook_id, s.broadcast_id), (s.playbook_id is not null)
  ),
  -- The current period by the channel each message went by (0030): each channel's own receipts, read receipts
  -- WhatsApp's alone, so a share of them is said over WhatsApp's own sends.
  by_channel as (
    select s.channel,
           count(*)                            as sent,
           count(*) filter (where s.delivered) as delivered,
           count(*) filter (where s.was_read)  as was_read,
           count(*) filter (where s.replied)   as replied
      from sent_r s
     where s.day >= v_cur
     group by s.channel
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'end', to_char(v_end, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'sent', p.sent,
                 'delivered', p.delivered,
                 'read', p.was_read,
                 'replied', p.replied,
                 'opt_ins', p.opt_ins,
                 'opt_outs', p.opt_outs) order by p.day)
               from per_day p),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', x.id,
                 'kind', case when x.is_playbook then 'playbook' else 'broadcast' end,
                 'name', x.name,
                 'template_name', x.template_name,
                 'runs', x.runs,
                 'sent', x.sent,
                 'delivered', x.delivered,
                 'read', x.was_read,
                 'replied', x.replied,
                 'last_at', x.last_at) order by x.sent desc, x.last_at desc)
               from sources x), '[]'::jsonb),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object(
                 'channel', c.channel,
                 'sent', c.sent,
                 'delivered', c.delivered,
                 'read', c.was_read,
                 'replied', c.replied) order by c.sent desc, c.channel)
               from by_channel c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

create or replace function public.campaign_stuck(p_tenant_id uuid)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
as $$
declare
  v_since  constant timestamptz := now() - interval '30 days';
  v_reach  constant timestamptz := now() - interval '30 days' - public.campaign_run_lead();
  v_result jsonb;
begin
  if not exists (select 1 from tenants where id = p_tenant_id) then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  with
  -- Waiting for an OK: the oldest 500, any kind. The kind comes from the audience (a deleted playbook's run keeps it).
  waiting as (
    select b.id, b.name, b.step_id as playbook_id, b.run_for, b.created_at, b.recipient_count,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.step_id is not null then 'moment'
                else 'broadcast' end       as kind,
           b.audience ->> 'trigger'        as run_trigger,
           b.audience ->> 'kind'           as audience_kind
      from sequence_batches b
     where b.tenant_id = p_tenant_id
       and b.state = 'pending_approval'
     order by b.created_at, b.id
     limit 500
  ),

  -- Failed in the last 30 days: the newest 500, told by a failure of ours. A run is made up to the lead before it ends.
  failed as (
    select b.id, b.name,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.step_id is not null then 'moment'
                else 'broadcast' end       as kind,
           case when b.failure ~ '^[a-z_]+(:[a-z]+)?$' then b.failure else 'other' end as failure,
           coalesce(b.finished_at, b.updated_at) as finished_at
      from sequence_batches b
     where b.tenant_id = p_tenant_id
       and b.state = 'failed'
       and b.created_at >= v_reach
       and coalesce(b.finished_at, b.updated_at) >= v_since
     order by coalesce(b.finished_at, b.updated_at) desc, b.id
     limit 500
  ),

  -- The sends of the last 30 days, of moments and broadcasts, to a thread that could be waiting on a person (a superset of
  -- standingOfThread's flagged: needs_human, any pause, an open escalation), and the first answer each got. The filter is
  -- applied before the probe, so only those threads are looked into; the probe is campaign_ledger's, once per send. The
  -- open hold's reason rides with it (00409): whether a hold waits on a person is waitsOnAPerson's to say, in TypeScript.
  reached as (
    select s.conversation_id, s.state, s.paused_until, s.assignee_user_id, s.open_escalation,
           s.open_escalation_reason, f.at as first_reply_at
      from (
        select m.conversation_id, r.sent_at, c.state, c.paused_until, c.assignee_user_id,
               exists (select 1 from escalations e where e.conversation_id = c.id and e.state = 'open') as open_escalation,
               (select e.reason from escalations e
                 where e.conversation_id = c.id and e.state = 'open'
                 order by e.created_at desc limit 1) as open_escalation_reason
          from sequence_batches b
          join sequence_sends r on r.lead_id is null and ( r.batch_id = b.id and r.tenant_id = p_tenant_id)
          join messages m on m.id = r.message_id
          join conversations c on c.id = m.conversation_id and c.tenant_id = p_tenant_id
         where b.tenant_id = p_tenant_id
           and b.created_at >= v_reach
           and b.audience ->> 'kind' is distinct from 'reach_out'
           and r.state = 'sent'
           and r.sent_at >= v_since
      ) s
      cross join lateral (
        select min(x.at) as at
          from (select i.created_at as at
                  from messages i
                 where i.conversation_id = s.conversation_id
                   and i.direction = 'inbound'
                   and i.sender = 'customer'
                   and public.message_is_a_persons_words(i.meta)
                   and i.created_at > s.sent_at
                   and i.created_at <= s.sent_at + public.campaign_reply_window()
                offset 0) x
      ) f
     where (s.state = 'needs_human' or s.paused_until is not null or s.open_escalation)
       and f.at is not null
  ),
  -- One row a thread: the later of its sends' first answers. The oldest 500.
  flagged as (
    select r.conversation_id, r.state, r.paused_until, r.assignee_user_id, r.open_escalation, r.open_escalation_reason,
           max(r.first_reply_at) as replied_at
      from reached r
     group by r.conversation_id, r.state, r.paused_until, r.assignee_user_id, r.open_escalation, r.open_escalation_reason
     order by max(r.first_reply_at), r.conversation_id
     limit 500
  ),

  -- What Meta stopped: a WhatsApp message that is not hidden, used or not.
  tpl as (
    select t.name, t.language, t.meta_status, t.quality
      from templates t
     where t.tenant_id = p_tenant_id
       and t.channel = 'whatsapp'
       and t.hidden_at is null
       and t.meta_status in ('paused', 'disabled', 'rejected')
     order by t.name, t.language
     limit 100
  )

  select jsonb_build_object(
    'runs_waiting', coalesce((select jsonb_agg(jsonb_build_object(
                                'id', w.id, 'name', w.name, 'kind', w.kind, 'playbook_id', w.playbook_id,
                                'run_for', w.run_for, 'trigger', w.run_trigger, 'audience_kind', w.audience_kind,
                                'created_at', w.created_at, 'recipient_count', w.recipient_count)
                              order by w.created_at, w.id)
                                from waiting w), '[]'::jsonb),
    'runs_failed', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', f.id, 'name', f.name, 'kind', f.kind, 'failure', f.failure,
                               'finished_at', f.finished_at)
                             order by f.finished_at desc, f.id)
                               from failed f), '[]'::jsonb),
    'replies', coalesce((select jsonb_agg(jsonb_build_object(
                           'state', t.state, 'paused_until', t.paused_until, 'assignee_user_id', t.assignee_user_id,
                           'open_escalation', t.open_escalation, 'open_escalation_reason', t.open_escalation_reason,
                           'replied_at', t.replied_at)
                         order by t.replied_at, t.conversation_id)
                           from flagged t), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object(
                             'name', t.name, 'language', t.language, 'status', t.meta_status, 'quality', t.quality)
                           order by t.name, t.language)
                             from tpl t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

create or replace function public.change_playbook(p_tenant_id uuid, p_playbook_id uuid, p_set jsonb, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_set   jsonb := case when jsonb_typeof(p_set) = 'object' then p_set else '{}'::jsonb end;
  v_was   public.sequence_steps;
  v_diff  jsonb;
  v_rows  integer;
  v_verb  text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_playbook_id is null then
    raise exception 'change_playbook: a playbook is named by its workspace and its id' using errcode = '22004';
  end if;
  -- The nine columns a change may name, and nothing else: a key outside them is refused, never ignored.
  if v_set = '{}'::jsonb or exists (
    select 1 from jsonb_object_keys(v_set) k
     where k not in ('state', 'name', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days', 'params', 'until',
                     'trial_until')
  ) then
    raise exception 'change_playbook: name what changes: state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until or trial_until'
      using errcode = '22023';
  end if;
  -- A null is no value for the seven columns that are never empty, so it is refused, never read as "keep what it
  -- holds". The two dates take it: it clears them.
  if exists (select 1 from jsonb_each(v_set) e
              where jsonb_typeof(e.value) = 'null' and e.key not in ('until', 'trial_until')) then
    raise exception 'change_playbook: name a value for each column named: only until and trial_until may be cleared'
      using errcode = '22023';
  end if;
  -- The message's slots are an array, as a run reads them; anything else is refused. What each element is (the slot
  -- specs the route builds) is core's to judge, so whatever a row holds is written back by an undo.
  if v_set ? 'params' and jsonb_typeof(v_set -> 'params') <> 'array' then
    raise exception 'change_playbook: params is the message''s slots, an array' using errcode = '22023';
  end if;
  -- The two dates in the spelling the row's own are read in (to_jsonb of the cast), so the same day or instant written
  -- another way differs from nothing; a value that is no date is refused by its cast here (22007), before the lock.
  if v_set ? 'until' and jsonb_typeof(v_set -> 'until') <> 'null' then
    v_set := jsonb_set(v_set, '{until}', to_jsonb((v_set ->> 'until')::date));
  end if;
  if v_set ? 'trial_until' and jsonb_typeof(v_set -> 'trial_until') <> 'null' then
    v_set := jsonb_set(v_set, '{trial_until}', to_jsonb((v_set ->> 'trial_until')::timestamptz));
  end if;
  -- The row as it stands, locked until the transaction ends, read on the caller's rights: a lock asks the update
  -- policy as well as the select policy, so another workspace's row, or one their seat may not change, is no row.
  select * into v_was
    from public.sequence_steps
   where id = p_playbook_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  -- What differs from the row as it stands, under the lock: only that is written, answered as `was` and recorded. Where
  -- nothing does, nothing is written and no line is (a second press of Pause, or two at once): the lock above has already
  -- asked the caller's rights, so a seat that may not change it is still told it is not there.
  select coalesce(jsonb_object_agg(k, v_set -> k), '{}'::jsonb) into v_diff
    from jsonb_object_keys(v_set) k
   where (to_jsonb(v_was) ->> k) is distinct from (v_set ->> k);
  if v_diff = '{}'::jsonb then
    return jsonb_build_object('id', p_playbook_id, 'was', '{}'::jsonb, 'decision_id', null, 'undo_dropped', false);
  end if;
  update public.sequence_steps p
     set state        = coalesce(v_diff ->> 'state', p.state),
         name         = coalesce(v_diff ->> 'name', p.name),
         run_hour     = coalesce((v_diff ->> 'run_hour')::integer, p.run_hour),
         cap_per_run  = coalesce((v_diff ->> 'cap_per_run')::integer, p.cap_per_run),
         gap_days     = coalesce((v_diff ->> 'gap_days')::integer, p.gap_days),
         cadence_days = coalesce((v_diff ->> 'cadence_days')::integer, p.cadence_days),
         params       = coalesce(v_diff -> 'params', p.params),
         until        = case when v_diff ? 'until' then (v_diff ->> 'until')::date else p.until end,
         trial_until  = case when v_diff ? 'trial_until' then (v_diff ->> 'trial_until')::timestamptz
                             else p.trial_until end
   where p.id = p_playbook_id and p.tenant_id = p_tenant_id;
  -- A forbidden update raises nothing: counted, so a change the policy refused is never answered as made.
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Playbook not found.' using errcode = 'P0002';
  end if;
  -- The verb follows the state that moved, never the one named: a state named as it stands is in no diff.
  v_verb := case v_diff ->> 'state'
              when 'running' then 'start_playbook'
              when 'paused' then 'pause_playbook'
              else 'change_playbook'
            end;
  return jsonb_build_object(
           'id', p_playbook_id,
           'was', (select jsonb_object_agg(k, to_jsonb(v_was) -> k) from jsonb_object_keys(v_diff) k))
      || public.member_decision(p_tenant_id, 'playbook', p_playbook_id, v_verb, coalesce(p_decision, '{}'::jsonb),
                                p_via, p_undo_of);
end $$;

create or replace function public.erasure_rekey(p_apply boolean DEFAULT false, p_tenant_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_phone   integer;
  v_email   integer;
  v_supp    integer;
  v_replies integer;
  v_keyed   timestamptz;
begin
  select count(*) into v_phone from contacts
   where erased_phone_hash is not null and erased_phone_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_email from contacts
   where erased_email_hash is not null and erased_email_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_supp from lead_suppressions
   where hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
  select count(*) into v_replies from sequence_replies o
   where (p_tenant_id is null or o.tenant_id = p_tenant_id)
     and exists (select 1 from jsonb_array_elements(
                   case when jsonb_typeof(o.plan->'changed'->'holds') = 'array' then o.plan->'changed'->'holds' else '[]'::jsonb end
                   || case when jsonb_typeof(o.plan->'changed'->'suppressions') = 'array' then o.plan->'changed'->'suppressions' else '[]'::jsonb end) x
                  where x->>'hash' is not null and x->>'hash' not like 'h1:%');
  select keyed_at into v_keyed from erasure_keying where id;
  if p_apply then
    update contacts set erased_phone_hash = erasure_key(erased_phone_hash)
     where erased_phone_hash is not null and erased_phone_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
    update contacts set erased_email_hash = erasure_key(erased_email_hash)
     where erased_email_hash is not null and erased_email_hash not like 'h1:%' and (p_tenant_id is null or tenant_id = p_tenant_id);
    -- A legacy row whose keyed twin stands: the twin keeps the stronger reason (an erasure wins, as 00177's writers
    -- say), and the legacy row goes, so re-keying it cannot collide on (tenant_id, kind, hash).
    create temporary table erasure_rekey_twins on commit drop as
      select s.id, s.tenant_id, s.kind, s.what, erasure_key(s.hash) as keyed
        from lead_suppressions s
       where s.hash not like 'h1:%' and (p_tenant_id is null or s.tenant_id = p_tenant_id);
    update lead_suppressions k set what = 'erased'
      from erasure_rekey_twins t
     where t.what = 'erased' and k.what <> 'erased'
       and k.tenant_id = t.tenant_id and k.kind = t.kind and k.hash = t.keyed;
    delete from lead_suppressions s
     using erasure_rekey_twins t
     where s.id = t.id
       and exists (select 1 from lead_suppressions k
                    where k.tenant_id = t.tenant_id and k.kind = t.kind and k.hash = t.keyed);
    update lead_suppressions s set hash = t.keyed
      from erasure_rekey_twins t
     where s.id = t.id;
    drop table erasure_rekey_twins;
    -- Only the two lists a reply keeps for its undo, each where it is; the rest of the plan as it was.
    update sequence_replies o
       set plan = o.plan || jsonb_build_object('changed', (o.plan->'changed')
             || case when o.plan->'changed' ? 'holds'
                     then jsonb_build_object('holds', public.erasure_rekey_hashes(o.plan->'changed'->'holds'))
                     else '{}'::jsonb end
             || case when o.plan->'changed' ? 'suppressions'
                     then jsonb_build_object('suppressions', public.erasure_rekey_hashes(o.plan->'changed'->'suppressions'))
                     else '{}'::jsonb end)
     where jsonb_typeof(o.plan->'changed') = 'object' and (p_tenant_id is null or o.tenant_id = p_tenant_id)
       and exists (select 1 from jsonb_array_elements(
                     case when jsonb_typeof(o.plan->'changed'->'holds') = 'array' then o.plan->'changed'->'holds' else '[]'::jsonb end
                     || case when jsonb_typeof(o.plan->'changed'->'suppressions') = 'array' then o.plan->'changed'->'suppressions' else '[]'::jsonb end) x
                    where x->>'hash' is not null and x->>'hash' not like 'h1:%');
    -- The mark is the whole database's: a run kept to one workspace (a test's) keys its rows and marks nothing.
    if p_tenant_id is null then
      update erasure_keying set keyed_at = coalesce(keyed_at, now()) where id returning keyed_at into v_keyed;
    end if;
  end if;
  return jsonb_build_object(
    'applied', p_apply,
    'contacts_phone', v_phone,
    'contacts_email', v_email,
    'lead_suppressions', v_supp,
    'reach_out_replies', v_replies,
    'keyed_at', v_keyed);
end $$;

create or replace function public.lead_addressee_choose(p_lead_id uuid, p_person integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user   uuid := auth.uid();
  v_lead   public.leads%rowtype;
  v_people jsonb;
  v_was    integer;
  v_to     jsonb;
  v_email  text;
  v_kept   jsonb;
  v_state  text;
  v_at     timestamptz;
  v_round  uuid;
  v_ended  boolean;
  v_err    jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is, then the lead locked: a lead of a workspace the caller may not find leads in is never held.
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or not public.has_permission(v_user, v_lead.tenant_id, 'find') then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    return jsonb_build_object('error', 'gone');
  end if;
  if v_lead.kind <> 'company' then
    return jsonb_build_object('error', 'not_a_company');
  end if;
  v_people := case when jsonb_typeof(v_lead.facts->'people') = 'array' then v_lead.facts->'people' else '[]'::jsonb end;
  v_was := case when jsonb_typeof(v_lead.facts->'addressee') = 'number' then (v_lead.facts->>'addressee')::integer end;
  if p_person is null or p_person < 0 or p_person >= jsonb_array_length(v_people)
     or jsonb_typeof(v_people->p_person) is distinct from 'object' then
    return jsonb_build_object('error', 'no_person');
  end if;
  if p_person = v_was then
    return jsonb_build_object('error', 'already');
  end if;
  if v_lead.stage not in ('ready', 'nurture') or v_lead.closed_reason is not null or v_lead.contact_id is not null then
    return jsonb_build_object('error', 'closed');
  end if;
  if v_lead.contacted_at is not null then
    return jsonb_build_object('error', 'written');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = v_lead.id
                and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))) then
    return jsonb_build_object('error', 'in_reach_out');
  end if;
  if v_lead.email_state = 'checking' then
    return jsonb_build_object('error', 'checking');
  end if;

  v_to := v_people->p_person;
  v_email := lower(btrim(coalesce(v_to->>'email', '')));
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'no_address');
  end if;
  if public.lead_address_suppressed(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'suppressed');
  end if;
  if public.lead_address_in_people(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'in_people');
  end if;
  -- One business written to once: an address another lead holds is that lead's.
  if exists (select 1 from public.leads l
              where l.tenant_id = v_lead.tenant_id and l.id <> v_lead.id and l.email = v_email
                and l.erased_at is null and l.blanked_at is null) then
    return jsonb_build_object('error', 'address_taken');
  end if;

  -- The check their address had while they were its addressee before, if it was this address and is under thirty days.
  v_kept := v_to->'check';
  if jsonb_typeof(v_kept) = 'object' and v_kept->>'email' = v_email
     and v_kept->>'state' in ('ok', 'catch_all', 'invalid')
     and coalesce(v_kept->>'at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
    v_at := (v_kept->>'at')::timestamptz;
    if v_at > now() - interval '30 days' then
      v_state := v_kept->>'state';
    else
      v_at := null;
    end if;
  end if;
  if v_state = 'invalid' then
    return jsonb_build_object('error', 'invalid');
  end if;

  if v_state is null then
    -- The switch and the spend, read before anything is asked of the provider (§0.5): the mailbox check is money too.
    if not public.lead_searches_on(v_lead.tenant_id) then
      return jsonb_build_object('error', 'paused');
    end if;
    v_err := public.lead_spend_refusal(v_lead.tenant_id);
    if v_err is not null then
      return v_err;
    end if;
    -- A check runs under a round: the lead's last, once it has ended (a search still running checks its own).
    select r.id, r.state = 'ended' into v_round, v_ended
      from public.lead_search_members m
      join public.lead_rounds r on r.id = m.round_id
     where m.tenant_id = v_lead.tenant_id and m.lead_id = v_lead.id and m.blanked_at is null
     order by r.created_at desc
     limit 1;
    if v_round is null then
      return jsonb_build_object('error', 'no_round');
    end if;
    if not v_ended then
      return jsonb_build_object('error', 'searching');
    end if;
  end if;

  -- The person it leaves keeps the check their address had, for a choice back.
  if v_was is not null and v_was < jsonb_array_length(v_people) and jsonb_typeof(v_people->v_was) = 'object'
     and v_lead.email is not null and v_lead.email_state in ('ok', 'catch_all', 'invalid')
     and v_lead.email_checked_at is not null then
    v_people := jsonb_set(v_people, array[v_was::text, 'check'],
                          jsonb_build_object('email', v_lead.email, 'state', v_lead.email_state,
                                             'at', v_lead.email_checked_at));
  end if;
  update public.leads
     set email = v_email,
         email_state = coalesce(v_state, 'checking'),
         email_checked_at = v_at,
         facts = jsonb_set(jsonb_set(facts, '{people}', v_people), '{addressee}', to_jsonb(p_person)),
         version = version + 1
   where id = v_lead.id;
  if v_state is null then
    perform public.lead_check_ask(v_lead.tenant_id, v_round, array[v_lead.id]);
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'lead.addressee_chosen', 'lead', 'lead', v_lead.id,
          jsonb_build_object('person', p_person, 'checking', v_state is null, 'by', v_user));
  return jsonb_build_object('ok', true, 'addressee', p_person, 'email_state', coalesce(v_state, 'checking'),
                            'version', v_lead.version + 1);
end $$;

create or replace function public.lead_blank(p_lead_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_n      integer;
  v_tenant uuid;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now()),
         -- What the listing showed about the business goes with the rest (D2).
         about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null,
         -- A company's people and its key go with the rest (00430), so the company found again is new, as a place is.
         facts = '{}'::jsonb, source_key = null
   where id = p_lead_id
  returning tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00391). The send keeps its state, its
  -- reason and the digest of the words it checked.
  update public.sequence_sends
     set opening = null, angle = null, hold_detail = null
   where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null));
  -- A draft handed to its owner names them and their address (00429): one still waiting to be sent is skipped as its
  -- lead gone, and every draft of theirs is cleared. The email they sent is a message, and goes as messages go.
  update public.sequence_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and lead_id = p_lead_id and draft is not null);
  -- A person still named for the business (a stand-in, 0052) keeps nothing of it: the name goes with the place, and
  -- their address or number is what names them again.
  update public.contacts
     set display_name = null, name_source = null, updated_at = now()
   where tenant_id = v_tenant and lead_id = p_lead_id and name_source = 'lead';
  -- A preference's example copied from this lead (00391).
  update public.lead_preferences
     set example = null
   where tenant_id = v_tenant and from_lead_id = p_lead_id and example is not null;
  return v_n;
end $$;

create or replace function public.lead_chain_of(p_tenant_id uuid, p_lead_id uuid)
 returns uuid
 language sql
 stable
 set search_path to 'public'
as $$
  select coalesce(
    (select s.sequence_id as root_id from public.sequence_sends s
      where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
        and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
      order by s.created_at desc
      limit 1),
    (select p.id from public.sequence_steps p
       join public.lead_search_members x on x.search_id = p.lead_search_id and x.lead_id = p_lead_id
      where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
        and x.blanked_at is null and x.class = 'qualified' and x.counted
      order by x.created_at desc
      limit 1))
$$;

create or replace function public.lead_person_forget(p_tenant_id uuid, p_email text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_e text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_n integer;
begin
  if v_e is null then
    return 0;
  end if;
  update public.sequence_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where sequence_sends.lead_id is not null and ( tenant_id = p_tenant_id and draft is not null and lower(btrim(coalesce(draft->>'to', ''))) = v_e);
  update public.leads l
     set facts = jsonb_set(jsonb_set(l.facts, '{people}', (
                   select coalesce(jsonb_agg(x.p order by x.n), '[]'::jsonb)
                     from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as x(p, n)
                    where lower(btrim(coalesce(x.p->>'email', ''))) <> v_e)),
                 '{addressee}', case
                   when jsonb_typeof(l.facts->'addressee') is distinct from 'number' then 'null'::jsonb
                   when lower(btrim(coalesce(l.facts->'people'->((l.facts->>'addressee')::integer)->>'email', ''))) = v_e
                     then 'null'::jsonb
                   else to_jsonb((l.facts->>'addressee')::integer - (
                     select count(*)::integer
                       from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) with ordinality as x(p, n)
                      where x.n - 1 < (l.facts->>'addressee')::integer
                        and lower(btrim(coalesce(x.p->>'email', ''))) = v_e))
                 end),
         email = case when lower(btrim(coalesce(l.email, ''))) = v_e then null else l.email end,
         email_state = case when lower(btrim(coalesce(l.email, ''))) = v_e then 'none' else l.email_state end,
         version = l.version + 1
   where l.tenant_id = p_tenant_id and l.kind = 'company' and l.erased_at is null and l.blanked_at is null
     and exists (select 1 from jsonb_array_elements(coalesce(l.facts->'people', '[]'::jsonb)) p
                  where lower(btrim(coalesce(p->>'email', ''))) = v_e);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.lead_suggest_history(p_tenant_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with s as (
    -- The searches the finder ran (a list brought in is not a kind searched for), newest first.
    select s.id, s.plan, s.created_at, s.removed_at
      from public.lead_searches s
     where s.tenant_id = p_tenant_id
       and s.via in ('people', 'ask')
       and s.created_at > now() - interval '180 days'
     order by s.created_at desc
     limit 24
  ),
  r as (
    -- Each search's newest round: how it ended, and the areas beside it Claude named.
    select x.search_id, x.rounds, x.state, x.ending, x.ended_at, x.nearby
      from (
        select r.search_id, r.state, r.ending, r.ended_at, r.nearby,
               count(*) over (partition by r.search_id) as rounds,
               row_number() over (partition by r.search_id order by r.seq desc) as n
          from public.lead_rounds r
          join s on s.id = r.search_id
         where r.tenant_id = p_tenant_id
      ) x
     where x.n = 1
  ),
  m as (
    select m.search_id,
           count(*) filter (where m.class = 'qualified') as qualified,
           count(*) filter (where m.class = 'review') as review,
           count(*) filter (where m.class = 'excluded') as excluded
      from public.lead_search_members m
      join s on s.id = m.search_id
     where m.tenant_id = p_tenant_id
     group by m.search_id
  ),
  x as (
    -- Why places were left out, by the key that left them out: the kind, no way to reach them, the owner, or one of the
    -- plan's own exclusions and criteria (contracts class.ts).
    select y.search_id, jsonb_object_agg(y.excluded_by, y.n) as by_key
      from (
        select m.search_id, m.excluded_by, count(*) as n
          from public.lead_search_members m
          join s on s.id = m.search_id
         where m.tenant_id = p_tenant_id and m.class = 'excluded' and m.excluded_by is not null
         group by m.search_id, m.excluded_by
      ) y
     group by y.search_id
  ),
  kept as (
    select distinct m.search_id, m.lead_id
      from public.lead_search_members m
      join s on s.id = m.search_id
     where m.tenant_id = p_tenant_id and m.class <> 'excluded'
  ),
  l as (
    -- What came of the leads each search kept, and when one was last contacted. A lead in two searches counts in each.
    select k.search_id,
           count(*) filter (where l.contacted_at is not null) as contacted,
           count(*) filter (where l.last_outcome = 'interested') as interested,
           count(*) filter (where l.booked_at is not null) as booked,
           count(*) filter (where l.stage = 'converted') as customers,
           count(*) filter (where l.closed_reason = 'said_no') as said_no,
           count(*) filter (where l.closed_reason = 'not_a_fit') as not_a_fit,
           count(*) filter (where l.closed_reason = 'stale') as stale,
           count(*) filter (where l.email is not null) as with_email,
           count(*) filter (where l.phone_e164 is not null) as with_phone,
           max(l.contacted_at) as last_contacted_at
      from kept k
      join public.leads l on l.id = k.lead_id and l.tenant_id = p_tenant_id
     where l.erased_at is null
     group by k.search_id
  ),
  w as (
    -- Why a lead was not a fit, as the owner said it (lead.not_a_fit: chain, wrong_kind, too_far, customer, other).
    select y.search_id, jsonb_object_agg(y.why, y.n) as by_why
      from (
        select k.search_id, e.data->>'why' as why, count(distinct e.subject_id) as n
          from kept k
          join public.events e on e.subject_id = k.lead_id
         where e.tenant_id = p_tenant_id and e.kind = 'lead.not_a_fit' and e.data->>'why' is not null
         group by k.search_id, e.data->>'why'
      ) y
     group by y.search_id
  ),
  ro as (
    -- The reach-out to its leads: how many were emailed, and when the last email went.
    select k.search_id, count(distinct o.lead_id) as sent, max(o.sent_at) as last_sent_at
      from kept k
      join public.sequence_sends o on o.lead_id is not null and ( o.lead_id = k.lead_id and o.tenant_id = p_tenant_id)
     where o.state = 'sent'
     group by k.search_id
  ),
  rr as (
    -- Replies a person wrote (not an out-of-office or a machine), by what they meant; an undone reading is not one.
    select k.search_id,
           count(distinct p.lead_id) as replied,
           count(distinct p.lead_id) filter (where p.intent = 'interested') as interested,
           count(distinct p.lead_id) filter (where p.intent in ('no', 'wrong_person')) as declined
      from kept k
      join public.sequence_replies p on p.lead_id = k.lead_id and p.tenant_id = p_tenant_id
     where p.undone_at is null and p.claim = 'person'
     group by k.search_id
  ),
  d as (
    select k.search_id, count(*) as won, coalesce(sum(d.amount_cents), 0) as cents
      from kept k
      join public.deals d on d.lead_id = k.lead_id and d.tenant_id = p_tenant_id
     where d.stage = 'won'
     group by k.search_id
  )
  select jsonb_build_object(
    'basis', (select max(r2.ended_at) from public.lead_rounds r2 where r2.tenant_id = p_tenant_id and r2.state = 'ended'),
    'home', (select jsonb_build_object('city', b.city, 'region', b.region, 'zip', b.postal_code)
               from public.business_records b where b.tenant_id = p_tenant_id),
    'listing', (select jsonb_build_object('address', g.address, 'type', g.facts->>'primary_type')
                  from public.google_listings g
                 where g.tenant_id = p_tenant_id
                 order by g.linked_at desc
                 limit 1),
    'searches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', s.plan->>'category_key',
               'name', s.plan->>'name',
               'terms', coalesce(s.plan->'terms', '[]'::jsonb),
               'area', s.plan->'area',
               'count', s.plan->'count',
               'contact', s.plan->>'contact',
               'criteria', coalesce(s.plan->'criteria', '[]'::jsonb),
               'exclusions', coalesce(s.plan->'exclusions', '[]'::jsonb),
               'from_idea', s.plan->>'from' = 'idea',
               'at', s.created_at,
               'removed', s.removed_at is not null,
               'rounds', coalesce(r.rounds, 0),
               'state', r.state,
               'ending', r.ending,
               'ended_at', r.ended_at,
               'nearby', coalesce(r.nearby, '[]'::jsonb),
               'found', jsonb_build_object('qualified', coalesce(m.qualified, 0), 'review', coalesce(m.review, 0),
                                           'excluded', coalesce(m.excluded, 0)),
               'left_out', coalesce(x.by_key, '{}'::jsonb),
               'leads', jsonb_build_object('contacted', coalesce(l.contacted, 0), 'interested', coalesce(l.interested, 0),
                                           'booked', coalesce(l.booked, 0), 'customers', coalesce(l.customers, 0),
                                           'said_no', coalesce(l.said_no, 0), 'not_a_fit', coalesce(l.not_a_fit, 0),
                                           'stale', coalesce(l.stale, 0), 'with_email', coalesce(l.with_email, 0),
                                           'with_phone', coalesce(l.with_phone, 0),
                                           'last_contacted_at', l.last_contacted_at),
               'not_a_fit_why', coalesce(w.by_why, '{}'::jsonb),
               'reach', jsonb_build_object('sent', coalesce(ro.sent, 0), 'replied', coalesce(rr.replied, 0),
                                           'interested', coalesce(rr.interested, 0), 'declined', coalesce(rr.declined, 0),
                                           'last_sent_at', ro.last_sent_at),
               'won', jsonb_build_object('deals', coalesce(d.won, 0), 'cents', coalesce(d.cents, 0))
             ) order by s.created_at desc)
        from s
        left join r on r.search_id = s.id
        left join m on m.search_id = s.id
        left join x on x.search_id = s.id
        left join l on l.search_id = s.id
        left join w on w.search_id = s.id
        left join ro on ro.search_id = s.id
        left join rr on rr.search_id = s.id
        left join d on d.search_id = s.id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.lead_undo(p_op_id uuid, p_version integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user    uuid := auth.uid();
  op        public.lead_operations;
  m         public.lead_search_members;
  l         public.leads;
  v_counter public.lead_counters;
  v_restored integer := 0;
  v_kept     integer := 0;
  v_recharged integer := 0;
  v_taken    integer := 0;
  v_leaving  integer := 0;
  v_sent     integer := 0;
  v_root     uuid;
  v_lead     uuid;
  r          record;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into op from public.lead_operations where id = p_op_id for update;
  if not found then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  -- The act's own right: an add, a later, a leave, a stage or a bulk act is any acting member's to make, so its maker
  -- may take it back; keep, exclude, put back and a search's undo spend or credit the month, and stay with find (00426).
  if op.kind in ('add', 'later', 'leave', 'stage', 'bulk') then
    if not (public.is_acting_member(op.tenant_id)
            and (op."by" = v_user or public.has_permission(v_user, op.tenant_id, 'find'))) then
      raise exception 'Operation not found.' using errcode = 'P0002';
    end if;
  elsif not public.has_permission(v_user, op.tenant_id, 'find') then
    raise exception 'Operation not found.' using errcode = 'P0002';
  end if;
  if op.undone_at is not null then
    return jsonb_build_object('error', 'undone');
  end if;
  if op.version <> p_version then
    return jsonb_build_object('error', 'changed');
  end if;
  if op.kind in ('keep', 'exclude', 'put_back', 'include') then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members
       set class = op.before->>'class', excluded_by = op.before->>'excluded_by',
           counted = (op.before->>'counted')::boolean, counted_month = op.before->>'counted_month',
           kept_at = (op.before->>'kept_at')::timestamptz, kept_by = (op.before->>'kept_by')::uuid,
           version = version + 1
     where id = m.id
    returning * into m;
    -- The lead goes back to the allowance of the month it counted in, never
    -- to the budget (S11); a refund after that month credits that month.
    if (op.after->>'counted')::boolean and not (op.before->>'counted')::boolean then
      v_counter := public.lead_counter_take(op.tenant_id, 'allowance', op.after->>'counted_month');
      update public.lead_counters set used = greatest(used - 1, 0), updated_at = now() where id = v_counter.id;
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'later' then
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members set later_at = (op.before->>'later_at')::timestamptz, version = version + 1
     where id = m.id
    returning * into m;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'leave' then
    -- Back on the list it was left off: its email, skipped as taken back, is planned again by the next run.
    select * into m from public.lead_search_members where search_id = op.search_id and lead_id = op.lead_ids[1] for update;
    if not found or m.version <> op.version or m.blanked_at is null then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.lead_search_members set blanked_at = null, version = version + 1
     where id = m.id
    returning * into m;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', m.version);
  end if;
  if op.kind = 'add' then
    -- Taken back by what became of each lead's email: before its run planned it, off the list; planned or held in a
    -- run still live, that send skipped as taken back (the audience lets it in again) and off the list; on its way
    -- (claimed or queued) or gone, it stays, and the answer says so: Stop writing is the true correction there.
    v_root := (op.after->>'root_id')::uuid;
    foreach v_lead in array op.lead_ids loop
      if exists (select 1 from public.sequence_sends s
                  where s.lead_id is not null and ( s.tenant_id = op.tenant_id and s.sequence_id = v_root and s.lead_id = v_lead
                    and s.state in ('claimed', 'queued'))) then
        v_leaving := v_leaving + 1;
        continue;
      end if;
      if exists (select 1 from public.sequence_sends s
                  where s.lead_id is not null and ( s.tenant_id = op.tenant_id and s.sequence_id = v_root and s.lead_id = v_lead
                    and s.state in ('sent', 'handed', 'failed'))) then
        v_sent := v_sent + 1;
        continue;
      end if;
      -- A draft handed over may have left its owner's inbox: withdrawn, it counts as written (00427's one-first rule).
      update public.sequence_sends s
         set state = 'skipped', reason = case when s.state = 'drafted' then 'draft_withdrawn' else 'owner_took_back' end
        from public.sequence_batches b
       where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = op.tenant_id and s.sequence_id = v_root and s.lead_id = v_lead
         and s.state in ('planned', 'held', 'drafted'));
      if coalesce(op.before->'back', '[]'::jsonb) ? v_lead::text then
        update public.lead_search_members set blanked_at = now(), version = version + 1
         where search_id = op.search_id and lead_id = v_lead and blanked_at is null;
      else
        delete from public.lead_search_members where search_id = op.search_id and lead_id = v_lead and round_id is null;
      end if;
      v_taken := v_taken + 1;
    end loop;
    if v_taken = 0 then
      return jsonb_build_object('error', case when v_leaving > 0 then 'on_its_way' else 'sent' end,
                                'leaving', v_leaving, 'sent', v_sent);
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (op.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', v_root,
            jsonb_build_object('search_id', op.search_id, 'n', v_taken, 'by', v_user));
    return jsonb_build_object('ok', true, 'taken', v_taken, 'leaving', v_leaving, 'sent', v_sent);
  end if;
  if op.kind = 'undo_search' then
    -- Two acts write this kind and one branch puts both back: a search that was
    -- removed (lead_search_remove) and a finished round the owner took back
    -- (lead_search_undo). The search comes back with the memberships the act
    -- blanked, except a lead exported or copied since: those are kept as they
    -- are and stay charged (E9).
    update public.lead_searches set removed_at = null where id = op.search_id;
    -- version is qualified on the right: since release B the LEAD has one too,
    -- and an UPDATE ... FROM leads leaves a bare `version` ambiguous (A's line
    -- read `version + 1` and stopped compiling the moment leads.version
    -- existed).
    update public.lead_search_members m2
       set blanked_at = null, version = m2.version + 1
      from public.leads l2
     where m2.search_id = op.search_id and m2.lead_id = l2.id and m2.lead_id = any (op.lead_ids)
       and l2.exported_at is null and l2.blanked_at is null and l2.erased_at is null;
    get diagnostics v_restored = row_count;
    v_kept := coalesce(array_length(op.lead_ids, 1), 0) - v_restored;
    -- And what the act gave back to the month is taken again, lead by lead, in
    -- the month each counted in (S11), and only for the memberships that came
    -- back: one left blanked is exported or was never credited, and either way
    -- it is not charged twice.
    for r in select key, value from jsonb_each_text(coalesce(op.before->'credited', '{}'::jsonb)) loop
      update public.lead_search_members
         set counted = true, counted_month = r.value
       where search_id = op.search_id and lead_id = r.key::uuid and blanked_at is null and not counted;
      if found then
        v_counter := public.lead_counter_take(op.tenant_id, 'allowance', r.value);
        update public.lead_counters set used = used + 1, updated_at = now() where id = v_counter.id;
        v_recharged := v_recharged + 1;
      end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept, 'recharged', v_recharged);
  end if;
  if op.kind = 'stage' then
    -- A person who was made is never unmade from a toast: the route offers no
    -- Undo after a conversion, and the door refuses one if it is asked.
    if coalesce((op.after->>'converted')::boolean, false) then
      return jsonb_build_object('error', 'person');
    end if;
    select * into l from public.leads where id = op.lead_ids[1] for update;
    if not found or l.erased_at is not null or l.blanked_at is not null or l.version <> op.version then
      return jsonb_build_object('error', 'changed');
    end if;
    update public.leads
       set stage = op.before->>'stage', closed_reason = op.before->>'closed_reason',
           phone_wrong = coalesce((op.before->>'phone_wrong')::boolean, false),
           contact_id = (op.before->>'contact_id')::uuid,
           version = version + 1
     where id = l.id
    returning * into l;
    -- "Already a customer" wrote a suppression; taking the act back takes it
    -- back too. Only the one this act wrote, and only a customer's: an email
    -- opt-out and an erasure are nobody's to lift.
    if coalesce((op.after->>'suppressed')::boolean, false) and op.after->>'place_hash' is not null then
      delete from public.lead_suppressions
       where tenant_id = op.tenant_id and kind = 'place' and what = 'customer' and hash = op.after->>'place_hash';
    end if;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'version', l.version);
  end if;
  if op.kind = 'bulk' then
    for r in select key as lead_id, value as was from jsonb_each(op.before) loop
      update public.leads
         set stage = r.was->>'stage', closed_reason = r.was->>'closed_reason', version = version + 1
       where id = r.lead_id::uuid and version = (r.was->>'seen')::integer
         and erased_at is null and blanked_at is null;
      if found then v_restored := v_restored + 1; else v_kept := v_kept + 1; end if;
    end loop;
    update public.lead_operations set undone_at = now() where id = p_op_id;
    return jsonb_build_object('ok', true, 'restored', v_restored, 'kept', v_kept);
  end if;
  return jsonb_build_object('error', 'kind');
end $$;

create or replace function public.mailbox_capacity(p_mailbox_id uuid, p_at timestamp with time zone)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with b as (
    select id, tenant_id, state, clean_since, resting_until, daily_cap, customer_domain
      from public.mailbox_connections where id = p_mailbox_id
  ),
  gone as (
    -- What left the mailbox, or went and nobody knows how: by when it left, back 120 days at most.
    select coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as at
      from public.sequence_sends s
      join b on b.id = s.mailbox_id
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.state in ('sent', 'queued', 'failed')
       and m.created_at >= p_at - interval '120 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  ),
  waiting as (
    -- Written and not yet gone, and claimed with no email yet: each counts against the day as it is spent.
    select coalesce(s.claimed_at, p_at) as at
      from public.sequence_sends s
      join b on b.id = s.mailbox_id
      left join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.state = 'claimed' or (s.state = 'queued' and (m.id is null or m.status = 'queued')))
  ),
  planned as (
    select s.send_at as at from public.sequence_sends s join b on b.id = s.mailbox_id where s.lead_id is not null and ( s.state = 'planned')
  )
  select jsonb_build_object(
    'state', b.state,
    'clean_since', b.clean_since,
    'resting_until', b.resting_until,
    'daily_cap', b.daily_cap,
    'customer_domain', b.customer_domain,
    -- D15: the days it actually sent on (UTC days) since it was last clean, before today's.
    'sent_days', (select count(distinct (g.at at time zone 'UTC')::date) from gone g
                   where g.at >= greatest(b.clean_since, p_at - interval '90 days')
                     and (g.at at time zone 'UTC')::date < (p_at at time zone 'UTC')::date),
    'sent_today', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at),
    'used', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at)
            + (select count(*) from waiting),
    'recent', coalesce((select jsonb_agg((extract(epoch from x.at) * 1000)::bigint order by x.at) from (
                 select at from gone where at > p_at - interval '1 day'
                 union all select at from waiting
                 union all select at from planned) x), '[]'::jsonb),
    'last_sent_at', (select max(g.at) from gone g where g.at <= p_at)
  ) from b
$$;

create or replace function public.mailbox_connection_counts(p_mailbox_id uuid, p_since timestamp with time zone)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at, s.tenant_id
      from public.sequence_sends s
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.mailbox_id = p_mailbox_id
       and m.created_at >= now() - interval '90 days')
  ), recent as (
    select o.id, o.status, o.error, o.tenant_id from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
     order by o.created_at desc
     limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A permanent bounce only: a full mailbox or a greylisting server says nothing about the mailbox that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    -- A person counts once, however many of the window's emails their noes name; a no undone is no no.
    'unsubscribed', (
      select count(distinct e.subject_id) from recent r
        join public.events e
          on e.tenant_id = r.tenant_id and e.kind = 'contact.consent_changed'
         and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
         and e.data->>'purpose' = 'email_marketing' and e.data->>'source' in ('unsubscribe', 'reply')
         and e.data->>'message_id' = r.id::text
         and not (e.data->>'source' = 'reply' and exists (
           select 1 from public.events u
            where u.tenant_id = r.tenant_id and u.kind = 'contact.consent_changed'
              and u.created_at >= e.created_at and u.subject_id = e.subject_id
              and u.data->>'purpose' = 'email_marketing' and u.data->>'source' = 'reply_undone'
              and u.data->>'message_id' = e.data->>'message_id'))))
$$;

create or replace function public.merge_people(p_keep uuid, p_merge uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  k          public.contacts%rowtype;
  m          public.contacts%rowtype;
  k_conv     public.conversations%rowtype;
  m_conv     public.conversations%rowtype;
  v_stop     boolean;
  v_consent  text;
  v_offers   text;
  v_email    text;
  v_offers_ended boolean;
  v_email_ended  boolean;
  v_take_control boolean;
  v_n        int;
  v_counts   jsonb := '{}'::jsonb;
  v_decision uuid;
  -- Combine (0052): the record we wrote to at a business and the person who answered from their own address there.
  v_combine  boolean := false;
  v_swap     public.contacts%rowtype;
  v_swap_id  uuid;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different records to merge.' using errcode = '22023';
  end if;

  -- Both rows, locked in id order, so two merges that name the same pair wait for each other and never deadlock.
  perform 1 from contacts c where c.id in (p_keep, p_merge) order by c.id for update;
  select * into k from contacts where id = p_keep;
  select * into m from contacts where id = p_merge;
  -- A stranger learns nothing: no such record, another workspace's, or not a member, all read as not found (00027).
  if k.id is null or m.id is null or k.tenant_id is distinct from m.tenant_id then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  v_tenant := k.tenant_id;
  if not exists (select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  -- OWNER, as erase_contact is: it cannot be undone.
  if not exists (
    select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user and s.role = 'owner'
  ) then
    raise exception 'Only an owner can merge two records.' using errcode = '42501';
  end if;

  if k.erased_at is not null or k.erasing_since is not null
     or m.erased_at is not null or m.erasing_since is not null then
    raise exception 'One of these people was deleted, so there is nothing to merge.' using errcode = '22023';
  end if;
  if k.merged_into_contact_id is not null or m.merged_into_contact_id is not null then
    raise exception 'One of these records was already merged into another.' using errcode = '22023';
  end if;
  -- Combine (0052, amending 0028): a stand-in (named for the business, by its lead) that never wrote, and a person who
  -- works at the same lead, are one human: the stand-in's address is the business's, the person's their own. For
  -- exactly this pair two addresses are no sign of two people, and the person is the one kept, with their own name
  -- and address, whichever of the two pages the owner pressed it from.
  v_combine := k.lead_id is not null and k.lead_id = m.lead_id
    and (coalesce(k.name_source, '') = 'lead') <> (coalesce(m.name_source, '') = 'lead')
    and not exists (select 1 from messages x
                     where x.tenant_id = v_tenant and x.direction = 'inbound'
                       and x.contact_id = case when k.name_source = 'lead' then k.id else m.id end);
  if v_combine and k.name_source = 'lead' then
    v_swap := k; k := m; m := v_swap;
    v_swap_id := p_keep; p_keep := p_merge; p_merge := v_swap_id;
  end if;
  if k.phone_e164 is not null and m.phone_e164 is not null and k.phone_e164 <> m.phone_e164 then
    raise exception 'These two records have different phone numbers, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if k.email is not null and m.email is not null and k.email <> m.email and not v_combine then
    raise exception 'These two records have different email addresses, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
      from deals a
      join deals b on b.tenant_id = a.tenant_id and coalesce(b.service, '') = coalesce(a.service, '')
     where a.tenant_id = v_tenant and a.contact_id = p_keep and b.contact_id = p_merge
       and a.stage in ('proposed', 'won') and b.stage in ('proposed', 'won')
  ) then
    raise exception 'Both records have an open deal for the same service. Close or move one of them first.'
      using errcode = '22023';
  end if;

  /* ---- THE MARK FIRST. From here the guard's exception is true for these two threads, and the merged row holds no
     number and no address: one address, one person (contacts_tenant_phone_uq, contacts_tenant_email_uq), and the
     inbound door, which finds a person by identity and then by number, cannot find the merged row again. Its
     answers are read into the kept record below (k and m hold them) and cleared here, so one person is counted
     once wherever a count reads the table. */
  update contacts
     set merged_into_contact_id = p_keep, phone_e164 = null, email = null,
         consent = 'unknown', consent_source = null, consent_updated_at = null, dnc = false,
         consent_channels = '{}'::text[],
         marketing_consent = 'unknown', marketing_consent_source = null, marketing_consent_updated_at = null,
         marketing_channels = '{}'::text[], offers_asked_at = null,
         email_marketing = 'unknown', email_marketing_source = null, email_marketing_updated_at = null
   where id = p_merge;

  update contact_identities set contact_id = p_keep
   where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('identities', v_n);

  /* ---- THE THREAD. One per person (conversations_tenant_id_contact_id_key). */
  select * into k_conv from conversations where tenant_id = v_tenant and contact_id = p_keep for update;
  select * into m_conv from conversations where tenant_id = v_tenant and contact_id = p_merge for update;
  if m_conv.id is not null and k_conv.id is null then
    -- The kept person had none: the merged one's thread is theirs, whole.
    update conversations set contact_id = p_keep where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'taken');
  elsif m_conv.id is not null then
    -- One open escalation per thread (escalations_one_open): where both had one, the kept thread's stands and the
    -- merged thread's is resolved by the owner who merged them.
    if exists (select 1 from escalations e where e.conversation_id = k_conv.id and e.state = 'open') then
      update escalations
         set state = 'resolved', resolved_by_user_id = v_user
       where tenant_id = v_tenant and conversation_id = m_conv.id and state = 'open';
    end if;
    update escalations set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update messages set conversation_id = k_conv.id, contact_id = p_keep
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('messages', v_n);
    update calls set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update sequence_replies set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    -- The reply turn is the thread's own (one row per thread): a reply being written on the merged thread goes on
    -- as the kept thread's where the kept thread holds none, and the kept thread's own stands otherwise.
    update reply_turns set conversation_id = k_conv.id
     where conversation_id = m_conv.id
       and not exists (select 1 from reply_turns t where t.conversation_id = k_conv.id);
    delete from reply_turns where conversation_id = m_conv.id;
    -- Nothing scheduled or running may name a thread that is about to stop existing: it names the kept one.
    update jobs
       set payload = payload || jsonb_build_object('conversation_id', k_conv.id::text)
     where tenant_id = v_tenant and state in ('scheduled', 'fired')
       and payload->>'conversation_id' = m_conv.id::text;
    update decisions set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update events set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update notifications set subject_id = k_conv.id::text
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id::text;
    update notifications set route = 'inbox/th-' || k_conv.id::text
     where tenant_id = v_tenant and route = 'inbox/th-' || m_conv.id::text;
    -- The kept thread takes the later of each clock, stays held if either was (a hold with no end stays one), is
    -- as open as the more open one, keeps who it was assigned to, and is answered by whoever was answering either
    -- (the later hold on it wins: a person typing, or a call in progress).
    v_take_control := k_conv.control_kind is null
                      or (m_conv.control_until is not null and m_conv.control_until > k_conv.control_until);
    update conversations
       set last_message_at    = greatest(k_conv.last_message_at, m_conv.last_message_at),
           last_inbound_at    = greatest(k_conv.last_inbound_at, m_conv.last_inbound_at),
           last_wa_inbound_at = greatest(k_conv.last_wa_inbound_at, m_conv.last_wa_inbound_at),
           paused_until       = case
                                  when (k_conv.state = 'needs_human' and k_conv.paused_until is null)
                                    or (m_conv.state = 'needs_human' and m_conv.paused_until is null) then null
                                  else greatest(k_conv.paused_until, m_conv.paused_until)
                                end,
           assignee_user_id   = coalesce(k_conv.assignee_user_id, m_conv.assignee_user_id),
           control_kind       = case when v_take_control then m_conv.control_kind else k_conv.control_kind end,
           control_by         = case when v_take_control then m_conv.control_by else k_conv.control_by end,
           control_ref        = case when v_take_control then m_conv.control_ref else k_conv.control_ref end,
           control_until      = case when v_take_control then m_conv.control_until else k_conv.control_until end,
           state = case
                     when 'needs_human' in (k_conv.state, m_conv.state) then 'needs_human'
                     when 'open' in (k_conv.state, m_conv.state) then 'open'
                     when 'snoozed' in (k_conv.state, m_conv.state) then 'snoozed'
                     else 'archived'
                   end,
           snooze_until = case
                            when 'needs_human' in (k_conv.state, m_conv.state)
                              or 'open' in (k_conv.state, m_conv.state) then null
                            else greatest(k_conv.snooze_until, m_conv.snooze_until)
                          end
     where id = k_conv.id;
    delete from conversations where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'folded');
  end if;

  /* ---- THE PERSON'S OWN ROWS. */
  update messages set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update calls set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('calls', v_n);
  update deals set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('deals', v_n);
  update leads set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  -- Their visits (00345), whatever made them: no key of appointments names its person, so every one moves.
  update appointments set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('appointments', v_n);
  -- A reach-out's note is kept once per person and send (person_notes_reach_out_once): one the kept person already
  -- holds stays with the merged row.
  update person_notes n set contact_id = p_keep
   where n.tenant_id = v_tenant and n.contact_id = p_merge
     and not (n.source = 'reach_out' and exists (
       select 1 from person_notes h
        where h.contact_id = p_keep and h.source = 'reach_out' and h.source_id = n.source_id));
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', v_n);
  update sequence_sends set contact_id = p_keep where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and contact_id = p_merge);
  update sequence_replies set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update sequence_replies set lead_contact_id = p_keep where tenant_id = v_tenant and lead_contact_id = p_merge;
  -- A list holds a person once (segment_members_pkey): the kept person joins the lists they were not on.
  insert into segment_members (segment_id, contact_id, tenant_id, added_by, added_at)
  select s.segment_id, p_keep, s.tenant_id, s.added_by, s.added_at
    from segment_members s
   where s.tenant_id = v_tenant and s.contact_id = p_merge
  on conflict (segment_id, contact_id) do nothing;
  delete from segment_members where tenant_id = v_tenant and contact_id = p_merge;
  -- A run names a person once (broadcast_recipients_pkey): a run both were on keeps the merged row's line as it is.
  update sequence_sends r set contact_id = p_keep
   where r.lead_id is null and ( r.tenant_id = v_tenant and r.contact_id = p_merge
     and not exists (
       select 1 from sequence_sends h where h.lead_id is null and ( h.batch_id = r.batch_id and h.contact_id = p_keep)));
  -- A person's own receptionist mode, one per class. A policy row keeps
  -- its subject for life (00029's guard), so the kept person gets a row of their own and the merged one's goes.
  insert into policies (tenant_id, class, mode, subject_type, subject_id, limits)
  select p.tenant_id, p.class, p.mode, 'contact', p_keep, p.limits
    from policies p
   where p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge
     and not exists (
       select 1 from policies h
        where h.tenant_id = v_tenant and h.class = p.class and h.subject_type = 'contact' and h.subject_id = p_keep);
  -- Where both set one for a class, the stricter stands (never over ask over veto over auto): the most careful answer.
  update policies h
     set mode = p.mode
    from policies p
   where h.tenant_id = v_tenant and h.subject_type = 'contact' and h.subject_id = p_keep
     and p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge and p.class = h.class
     and array_position(array['auto', 'veto', 'ask', 'never'], p.mode)
       > array_position(array['auto', 'veto', 'ask', 'never'], h.mode);
  delete from policies where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  -- The ledger and the audit are the person's: what the merged record answered, and what was decided about it.
  update events set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update decisions set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update notifications set subject_id = p_keep::text
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge::text;
  update jobs
     set payload = payload || jsonb_build_object('contact_id', p_keep::text)
   where tenant_id = v_tenant and state in ('scheduled', 'fired') and payload->>'contact_id' = p_merge::text;

  /* ---- CONSENT (D5): the most careful answer wins on each question. contracts' mergedAnswers is this, case by case. */
  v_stop := k.consent = 'opted_out' or k.dnc or m.consent = 'opted_out' or m.dnc;
  v_consent := case
                 when v_stop then 'opted_out'
                 when 'opted_in' in (k.consent, m.consent) then 'opted_in'
                 else 'unknown'
               end;
  v_offers := case
                when 'opted_out' in (k.marketing_consent, m.marketing_consent) then 'opted_out'
                when v_stop then 'unknown'
                when 'opted_in' in (k.marketing_consent, m.marketing_consent) then 'opted_in'
                else 'unknown'
              end;
  v_email := case
               when 'opted_out' in (k.email_marketing, m.email_marketing) then 'opted_out'
               when v_stop then 'unknown'
               when 'opted_in' in (k.email_marketing, m.email_marketing) then 'opted_in'
               else 'unknown'
             end;

  -- A yes that ends here because the merged person is stopped: how 00323 says a yes ended.
  v_offers_ended := v_offers = 'unknown' and 'opted_in' in (k.marketing_consent, m.marketing_consent);
  v_email_ended := v_email = 'unknown' and 'opted_in' in (k.email_marketing, m.email_marketing);

  -- The ledger first: 00297's trigger on each entry rewrites the channel lists, and the update below is the last word.
  if v_consent is distinct from k.consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('consent', v_consent, 'previous', k.consent, 'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_offers is distinct from k.marketing_consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'marketing', 'consent', v_offers, 'previous', k.marketing_consent,
                               'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_email is distinct from k.email_marketing then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'email_marketing', 'consent', v_email, 'previous', k.email_marketing,
                               'source', 'merge', 'merged_from', p_merge, 'channel', 'email'));
  end if;

  /* ---- THE KEPT RECORD, in one statement: what it lacked, and the answers. Each answer keeps how and when it was
     given from the record that gave it; a yes a stop ended says so as 00323 does; an answer neither record gave as it
     now stands (a stop held by do-not-contact alone) says the merge. */
  update contacts
     set phone_e164      = coalesce(k.phone_e164, m.phone_e164),
         email           = coalesce(k.email, m.email),
         -- The name (00420): a Combine's kept person keeps their own, or none, never the business's the record we wrote
         -- to was named for; any other merge fills an empty name from the other record, with where it came from and
         -- whether a member settled it, so a name a member typed is not taken for one the wire gave.
         display_name    = case when v_combine then k.display_name else coalesce(k.display_name, m.display_name) end,
         name_source     = case when v_combine or k.display_name is not null then k.name_source else m.name_source end,
         name_settled_at = case when v_combine or k.display_name is not null then k.name_settled_at
                                else m.name_settled_at end,
         wa_profile_name = coalesce(k.wa_profile_name, m.wa_profile_name),
         notes           = coalesce(k.notes, m.notes),
         proposal_url    = coalesce(k.proposal_url, m.proposal_url),
         first_seen_at   = least(k.first_seen_at, m.first_seen_at),
         last_seen_at    = greatest(k.last_seen_at, m.last_seen_at),
         acquired_via    = case when k.acquired_via is not null then k.acquired_via else m.acquired_via end,
         acquired_ref    = case when k.acquired_via is not null then k.acquired_ref else m.acquired_ref end,
         consent         = v_consent,
         dnc             = v_stop,
         consent_source  = case
                             when k.consent = v_consent then k.consent_source
                             when m.consent = v_consent then m.consent_source
                             else 'merge'
                           end,
         consent_updated_at = case
                                when k.consent = v_consent then k.consent_updated_at
                                when m.consent = v_consent then m.consent_updated_at
                                else now()
                              end,
         consent_channels = case
                              when v_consent <> 'opted_in' then '{}'::text[]
                              else public.consent_channels_union(
                                case when k.consent = 'opted_in' then coalesce(k.consent_channels, '{whatsapp}') end,
                                case when m.consent = 'opted_in' then coalesce(m.consent_channels, '{whatsapp}') end)
                            end,
         marketing_consent = v_offers,
         marketing_consent_source = case
                                      when v_offers_ended then 'stop'
                                      when k.marketing_consent = v_offers then k.marketing_consent_source
                                      else m.marketing_consent_source
                                    end,
         marketing_consent_updated_at = case
                                          when v_offers_ended then now()
                                          when k.marketing_consent = v_offers then k.marketing_consent_updated_at
                                          else m.marketing_consent_updated_at
                                        end,
         marketing_channels = case
                                when v_offers <> 'opted_in' then '{}'::text[]
                                else public.consent_channels_union(
                                  case when k.marketing_consent = 'opted_in'
                                       then coalesce(k.marketing_channels, '{whatsapp}') end,
                                  case when m.marketing_consent = 'opted_in'
                                       then coalesce(m.marketing_channels, '{whatsapp}') end)
                              end,
         email_marketing = v_email,
         email_marketing_source = case
                                    when v_email_ended then 'stop'
                                    when k.email_marketing = v_email then k.email_marketing_source
                                    else m.email_marketing_source
                                  end,
         email_marketing_updated_at = case
                                        when v_email_ended then now()
                                        when k.email_marketing = v_email then k.email_marketing_updated_at
                                        else m.email_marketing_updated_at
                                      end,
         offers_asked_at = least(k.offers_asked_at, m.offers_asked_at)
   where id = p_keep;
  -- A suppressed address stays suppressed. Taking the address clears the flag (a changed address is a new one to the
  -- trigger), so it is put back in a statement that does not name the address.
  if k.email is null and m.email is not null and m.email_suppressed_at is not null then
    update contacts
       set email_suppressed_at = m.email_suppressed_at, email_suppressed_reason = m.email_suppressed_reason
     where id = p_keep;
  end if;

  -- What the lists page by (0021), for both rows: the kept person's moments now hold the merged one's words and calls.
  perform public.person_moments_recompute(array[p_keep, p_merge]);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.merged', 'contact', 'contact', p_keep,
          v_counts || jsonb_build_object('merged', p_merge) || case when v_combine then jsonb_build_object('combine', true) else '{}'::jsonb end);
  insert into decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_keep, 'merge', 'user', v_user,
          jsonb_build_object('merged', p_merge, 'counts', v_counts))
  returning id into v_decision;

  return jsonb_build_object(
    'contact_id', p_keep, 'merged', p_merge, 'tenant_id', v_tenant, 'decision_id', v_decision,
    'consent', v_consent, 'marketing_consent', v_offers, 'email_marketing', v_email, 'counts', v_counts);
end $$;

create or replace function public.outreach_lead_facts(p_tenant_id uuid, p_contact_id uuid, p_to text, p_lead_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', public.lead_address_suppressed(p_tenant_id, p_to),
    'wrote_back', exists (select 1 from public.outreach_wrote_back(p_tenant_id, array[p_contact_id])),
    -- An automatic out-of-office (00222, G8) whose day is still ahead: from this person, or answering the send's lead
    -- from another address of the business. Two arms, so the first can use reach_out_replies_away.
    'away', exists (select 1 from public.sequence_replies r
                     where r.tenant_id = p_tenant_id and r.contact_id = p_contact_id
                       and r.intent = 'away' and r.claim = 'auto_reply'
                       and r.until_at > now() and r.undone_at is null)
            or (p_lead_id is not null
                and exists (select 1 from public.sequence_replies r
                             where r.tenant_id = p_tenant_id and r.lead_id = p_lead_id
                               and r.intent = 'away' and r.claim = 'auto_reply'
                               and r.until_at > now() and r.undone_at is null)),
    -- Its owner stopped writing to this lead (00241, Part 6's H10): the door skips its email, and the followers
    -- leave it out.
    'stopped', p_lead_id is not null
               and exists (select 1 from public.leads l
                            where l.id = p_lead_id and l.tenant_id = p_tenant_id
                              and l.reach_out_stopped_at is not null)
  )
$$;

create or replace function public.outreach_wrote_back(p_tenant_id uuid, p_contact_ids uuid[])
 returns SETOF uuid
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select c.contact_id from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
   where m.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and m.direction = 'inbound' and m.sender = 'customer'
     and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply')
  union
  select c.contact_id from public.messages o
    join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
   where o.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
     and (exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
          or exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply'))
  union
  select k.contact_id from public.calls k
   where k.tenant_id = p_tenant_id and k.contact_id = any (p_contact_ids) and k.direction = 'inbound'
  union
  select rr.contact_id from public.sequence_replies rr
   where rr.tenant_id = p_tenant_id and rr.contact_id = any (p_contact_ids)
     and rr.claim = 'auto_reply' and rr.intent in ('no', 'wrong_person') and rr.undone_at is null
  union
  select rr.lead_contact_id from public.sequence_replies rr
   where rr.tenant_id = p_tenant_id and rr.lead_contact_id = any (p_contact_ids)
     and rr.claim = 'auto_reply' and rr.intent in ('no', 'wrong_person') and rr.undone_at is null
  -- What its owner said the business wrote back (00429), about an email they sent from their own inbox: whatever they
  -- wrote, for the person who was written to and the lead's, until the word is undone.
  union
  select rr.contact_id from public.sequence_replies rr
   where rr.tenant_id = p_tenant_id and rr.contact_id = any (p_contact_ids)
     and rr.claim = 'owner' and rr.undone_at is null
  union
  select rr.lead_contact_id from public.sequence_replies rr
   where rr.tenant_id = p_tenant_id and rr.lead_contact_id = any (p_contact_ids)
     and rr.claim = 'owner' and rr.undone_at is null
$$;

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_added timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 returns TABLE(id uuid, display_name text, wa_profile_name text, phone_e164 text, email text, email_suppressed_at timestamp with time zone, consent text, consent_source text, consent_updated_at timestamp with time zone, dnc boolean, marketing_consent text, marketing_consent_source text, marketing_consent_updated_at timestamp with time zone, consent_channels text[], marketing_channels text[], offers_asked_at timestamp with time zone, email_marketing text, email_marketing_source text, email_marketing_updated_at timestamp with time zone, channels text[], conversation_count integer, escalation_count integer, needs_human boolean, open_escalation_reason text, open_escalation_since timestamp with time zone, latest_conversation_id uuid, latest_state text, latest_paused_until timestamp with time zone, latest_assignee_user_id uuid, latest_snooze_until timestamp with time zone, latest_wa_inbound_at timestamp with time zone, last_message_at timestamp with time zone, last_message_direction text, last_message_sender text, last_inbound_text text, last_inbound_at timestamp with time zone, last_inbound_channel text, last_wrote_at timestamp with time zone, last_call_at timestamp with time zone, last_inbound_call_at timestamp with time zone, last_inbound_call_summary text, call_count integer, call_seconds integer, first_contact_at timestamp with time zone, earliest_row_at timestamp with time zone, has_backfill boolean, has_chat boolean, message_channels text[], queued_reply_at timestamp with time zone, came_from text, deal_id uuid, deal_stage text, deal_service text, deal_proposed_at timestamp with time zone, deal_decided_at timestamp with time zone, deal_ended_at timestamp with time zone, deal_amount_cents integer, deal_per text, deal_proposal_url text, deal_valid_until date, deal_lost_reason text, open_deals jsonb, step_id uuid, step_body text, step_due_on date, step_for_user_id uuid, step_deal_id uuid, in_touch_at timestamp with time zone, added_at timestamp with time zone, lead_id uuid, lead_name text, lead_gone boolean, lead_emails text[], name_source text, name_settled_at timestamp with time zone, signer_message_id uuid, signer_name text, signer_title text, signer_read_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
  ),
  ev as not materialized (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00299).
           public.message_is_a_persons_words(m.meta) as persons_words
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email, ch.email_suppressed_at,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
    ch.email_marketing, ch.email_marketing_source, ch.email_marketing_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at, lw.channel,
    ma.last_wrote_at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how they were added, else how a history moved in
    -- began, else their first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source = 'import' then 'import'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    od.deals,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at,
    ch.lead_id, case when not coalesce(ld.gone, false) then ld.business_name end, coalesce(ld.gone, false),
    ld.emails,
    ch.name_source, ch.name_settled_at,
    sg.message_id, sg.signer_name, sg.signer_title, sg.read_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at,
           k.lead_id, k.name_source, k.name_settled_at
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
  left join lateral (
    -- The business they work at (0052), by its key: its name, and whether it was erased or blanked since; and, for its
    -- own person alone while it stands, its addresses (its email and its alternates), each once, lower-cased.
    select l.business_name, (l.erased_at is not null or l.blanked_at is not null) as gone,
           case when l.contact_id = c.id and l.erased_at is null and l.blanked_at is null then
             (select array_agg(distinct lower(btrim(a.address)) order by lower(btrim(a.address)))
                from (select l.email as address
                      union all
                      select x->>'email' from jsonb_array_elements(coalesce(l.email_alternates, '[]'::jsonb)) x) a
               where nullif(btrim(coalesce(a.address, '')), '') is not null)
           end as emails
      from leads l
     where l.id = ch.lead_id and l.tenant_id = p_tenant_id
  ) ld on true
  left join lateral (
    -- A reply's signer offered as their name (0052), the newest: the reply's writer's alone, as the name's doors match
    -- it; offered rows are few, and found by reach_out_replies_signer_offered.
    select r.message_id, r.signer_name, r.signer_title, r.read_at
      from sequence_replies r
     where r.tenant_id = p_tenant_id and r.signer_state = 'offered' and r.undone_at is null
       and r.contact_id = c.id
     order by r.read_at desc
     limit 1
  ) sg on true
  left join lateral (
    -- How they were added, when a door added them: their first contact.added
    -- event, should a door ever write two.
    select coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.subject_type = 'contact'
       and e.subject_id = c.id
       and e.kind = 'contact.added'
     order by e.created_at
     limit 1
  ) ad on true
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body, e.channel
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    -- Where they last WROTE: the wire of their newest own words. Not a call's note (the system's row, never spoken)
    -- and not a program writing from their address (persons_words): an out-of-office made email "where they last
    -- wrote", and a campaign then went there. contracts lastWroteOn is its twin.
    select e.channel
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.sender = 'customer' and e.spoken and e.persons_words
     order by e.at desc
     limit 1
  ) lw on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- When they last wrote words of their own (00299), the statement has_relationship makes of "they wrote".
           max(e.at) filter (where e.direction = 'inbound' and e.spoken and e.at is not null and e.body is not null
                               and e.persons_words) as last_wrote_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Every open deal (0029), newest first: a person may hold one per service (deals_open_uq), and the one above hid the
    -- rest. Null for someone with none open.
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'stage', d.stage, 'service', d.service, 'proposed_at', d.proposed_at,
             'decided_at', d.decided_at, 'ended_at', d.ended_at, 'amount_cents', d.amount_cents, 'per', d.per,
             'currency', d.currency, 'proposal_url', d.proposal_url, 'valid_until', d.valid_until,
             'lost_reason', d.lost_reason
           ) order by d.created_at desc) as deals
      from deals d
     where d.contact_id = c.id
       and d.stage in ('proposed', 'won')
  ) od on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
  order by c.in_touch_at desc, c.added_at desc, c.id desc
$$;

create or replace function public.person_name_decline(p_contact_id uuid, p_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.contacts where id = p_contact_id for update;
  update public.sequence_replies r
     set signer_state = 'declined', signer_settled_at = now(), signer_settled_by = v_user
   where r.message_id = p_message_id and r.tenant_id = v_tenant
     and r.contact_id = p_contact_id
     and r.signer_state = 'offered';
  if not found then
    return jsonb_build_object('declined', false, 'why', 'settled');
  end if;
  update public.contacts set name_settled_at = now(), updated_at = now() where id = p_contact_id;
  return jsonb_build_object('declined', true, 'contact_id', p_contact_id);
end $$;

create or replace function public.person_name_take(p_tenant_id uuid, p_contact_id uuid, p_message_id uuid, p_by uuid, p_via text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_person public.contacts%rowtype;
  v_reply  public.sequence_replies%rowtype;
begin
  if p_via is null or p_via not in ('press', 'auto') then
    raise exception 'A signer''s name is taken by a press or automatically.' using errcode = '22023';
  end if;
  select * into v_person from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id and erased_at is null and merged_into_contact_id is null
   for update;
  if not found then
    return jsonb_build_object('named', false, 'why', 'gone');
  end if;
  select * into v_reply from public.sequence_replies r
   where r.message_id = p_message_id and r.tenant_id = p_tenant_id
     and r.contact_id = p_contact_id
   for update;
  if not found or v_reply.signer_name is null then
    return jsonb_build_object('named', false, 'why', 'no_signer');
  end if;
  if v_reply.signer_state <> 'offered' or v_reply.undone_at is not null then
    return jsonb_build_object('named', false, 'why', 'settled');
  end if;
  if v_person.display_name is not null and public.person_name_rank(v_person.name_source) >= public.person_name_rank('signature') then
    return jsonb_build_object('named', false, 'why', 'named');
  end if;
  if p_via = 'auto' and v_person.name_settled_at is not null then
    return jsonb_build_object('named', false, 'why', 'settled');
  end if;
  update public.contacts
     set display_name = v_reply.signer_name, name_source = 'signature',
         name_settled_at = case when p_via = 'press' then now() end, updated_at = now()
   where id = p_contact_id;
  update public.sequence_replies
     set signer_state = 'adopted', signer_settled_at = now(), signer_settled_by = p_by,
         signer_was = coalesce(signer_was, case when v_person.display_name is null then 'none' else v_person.name_source end)
   where message_id = p_message_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_strip_nulls(jsonb_build_object('named', true, 'by', p_by, 'source', 'signature',
                                               'was', v_person.name_source, 'via', p_via, 'message_id', p_message_id)));
  return jsonb_build_object('named', true, 'contact_id', p_contact_id, 'name', v_reply.signer_name);
end $$;

create or replace function public.person_name_undo(p_contact_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_person   public.contacts%rowtype;
  v_reply    public.sequence_replies%rowtype;
  v_business text;
  v_name     text;
  v_source   text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  select * into v_person from public.contacts where id = p_contact_id for update;
  if v_person.name_source is distinct from 'signature' then
    return jsonb_build_object('undone', false, 'why', 'not_a_signer');
  end if;
  select * into v_reply from public.sequence_replies r
   where r.tenant_id = v_tenant and r.contact_id = p_contact_id
     and r.signer_state = 'adopted'
   order by r.signer_settled_at desc
   limit 1
   for update;
  if not found then
    return jsonb_build_object('undone', false, 'why', 'not_a_signer');
  end if;
  if v_reply.signer_was = 'lead' then
    select left(nullif(btrim(l.business_name), ''), 80) into v_business
      from public.leads l
     where l.id = coalesce(v_person.lead_id, v_reply.lead_id) and l.tenant_id = v_tenant
       and l.erased_at is null and l.blanked_at is null;
  end if;
  v_name := v_business;
  v_source := case when v_business is not null then 'lead' end;
  update public.contacts
     set display_name = v_name, name_source = v_source, name_settled_at = now(), updated_at = now()
   where id = p_contact_id;
  update public.sequence_replies
     set signer_state = 'undone', signer_settled_at = now(), signer_settled_by = v_user
   where message_id = v_reply.message_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_strip_nulls(jsonb_build_object('named', v_name is not null, 'by', v_user, 'source', v_source,
                                               'was', 'signature', 'via', 'undo', 'message_id', v_reply.message_id)));
  return jsonb_build_object('undone', true, 'contact_id', p_contact_id, 'name', v_name);
end $$;

create or replace function public.person_signer_erase_on_contact()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    update public.sequence_replies
       set signer_name = null, signer_title = null, signer_state = null, signer_was = null,
           signer_settled_at = null, signer_settled_by = null
     where tenant_id = new.tenant_id and (contact_id = new.id or lead_contact_id = new.id) and signer_name is not null;
  end if;
  return null;
end $$;

create or replace function public.playbook_totals(p_tenant_id uuid, p_history integer DEFAULT 10)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $$
  with runs as (
    -- Moments only: a reach-out step's runs share broadcasts and are never scanned.
    select b.id, b.step_id as playbook_id, b.name, b.state, b.run_for, b.scheduled_for, b.recipient_count,
           case when jsonb_typeof(b.audience -> 'trigger') = 'string' then b.audience ->> 'trigger' end as trigger,
           row_number() over (partition by b.step_id order by b.created_at desc, b.id desc) as n
      from public.sequence_batches b
      join public.sequence_steps p on p.id = b.step_id and p.tenant_id = b.tenant_id and p.kind = 'moment'
     where b.tenant_id = p_tenant_id
  ),
  counts as (
    -- Each run's counts as run_counts says them to Sent: one statement of what a run earned, asked once.
    select public.run_counts(p_tenant_id, coalesce(array_agg(x.id), '{}'::uuid[])) as c from runs x
  ),
  per_run as (
    -- Taken apart by run, so a run's row carries its own counts alone: one that carried the whole answer had every
    -- run's counts sorted with every run, and 3,600 runs took half a minute (the test's scale case answers in under one).
    select x.*,
           coalesce((c.value ->> 'sent')::bigint, 0)      as sent,
           coalesce((c.value ->> 'skipped')::bigint, 0)
             + coalesce((c.value ->> 'failed')::bigint, 0) as held,
           coalesce((c.value ->> 'delivered')::bigint, 0) as delivered,
           coalesce((c.value ->> 'replied')::bigint, 0)   as replied
      from runs x
     cross join counts k
      left join lateral jsonb_each(k.c) c on c.key = x.id::text
  )
  select coalesce(jsonb_object_agg(t.playbook_id::text, t.totals), '{}'::jsonb)  -- one scalar: no row cap cuts it
    from (
      select r.playbook_id, jsonb_build_object(
               'runs', count(*),
               'sent', sum(r.sent),
               'delivered', sum(r.delivered),
               'replied', sum(r.replied),
               'held', sum(r.held),
               'last_run', (array_agg(jsonb_build_object(
                              'id', r.id, 'state', r.state, 'run_for', r.run_for,
                              'recipient_count', r.recipient_count) order by r.n))[1],
               'waiting', (array_agg(jsonb_build_object(
                             'id', r.id, 'recipient_count', r.recipient_count, 'name', r.name,
                             'run_for', r.run_for, 'trigger', r.trigger) order by r.n)
                           filter (where r.state = 'pending_approval'))[1],
               'history', coalesce(jsonb_agg(jsonb_build_object(
                             'id', r.id, 'run_for', r.run_for, 'state', r.state,
                             'scheduled_for', r.scheduled_for, 'recipient_count', r.recipient_count,
                             'sent', r.sent, 'held', r.held, 'delivered', r.delivered, 'replied', r.replied)
                           order by r.n) filter (where r.n <= p_history), '[]'::jsonb)) as totals
        from per_run r
       group by r.playbook_id
    ) t
$$;

create or replace function public.reach_out_add(p_root_id uuid, p_lead_ids uuid[], p_dry boolean DEFAULT false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user      uuid := auth.uid();
  r           public.sequence_steps;
  s           public.lead_searches;
  v_ids       uuid[];
  v_join      uuid[] := '{}';
  v_back      uuid[] := '{}';
  v_out       jsonb := '[]'::jsonb;
  v_counts    jsonb := '{}'::jsonb;
  v_month     text;
  v_op        uuid;
  v_waiting   integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into s from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or s.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A finder search never gains a lead it did not find: its reach-out already writes to every ready lead it holds.
  if s.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', s.id);
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > public.lead_cap('list_rows') then
    raise exception 'leads: 1 to %', public.lead_cap('list_rows') using errcode = '22023';
  end if;
  -- One lead at a time: two adds of one lead, from two piles or two people, meet here, never both.
  if not p_dry then
    perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || x::text))
       from unnest(v_ids) as x order by x;
  end if;

  -- Why each would not go: the one predicate, then what only a list can say (already on it, never counted, with another
  -- reach-out). A lead whose address is being checked joins: it goes once the check says ok.
  with w as (
    select * from public.reach_out_why_not(r.tenant_id, v_ids, r.include_unconfirmed)
  ), facts as (
    select w.lead_id,
           case
             when w.why is not null and w.why <> 'checking' then w.why
             when exists (select 1 from public.lead_search_members m
                           where m.search_id = s.id and m.lead_id = w.lead_id and m.blanked_at is null) then 'already'
             when not exists (select 1 from public.lead_search_members m
                                join public.lead_searches q on q.id = m.search_id and q.removed_at is null
                               where m.tenant_id = r.tenant_id and m.lead_id = w.lead_id and m.counted
                                 and m.blanked_at is null) then 'not_counted'
             when o.id is not null then 'elsewhere'
             else null
           end as why,
           o.id as other_id, o.name as other_name
      from w
      -- Another reach-out whose search holds the lead: one reach-out per lead, whichever way it came in.
      left join lateral (
        select p.id, p.name from public.sequence_steps p
          join public.lead_search_members m on m.search_id = p.lead_search_id and m.lead_id = w.lead_id
         where p.tenant_id = r.tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first' and p.id <> r.id
           and m.blanked_at is null and m.class = 'qualified' and m.counted
         order by m.created_at desc
         limit 1) o on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('lead_id', f.lead_id, 'why', f.why, 'chain_id', f.other_id,
                                               'chain_name', f.other_name)
                            order by f.lead_id) filter (where f.why is not null), '[]'::jsonb),
         coalesce(array_agg(f.lead_id) filter (where f.why is null), '{}'::uuid[])
    into v_out, v_join
    from facts f;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_counts
    from (select x->>'why' as k, count(*) as n from jsonb_array_elements(v_out) x group by 1) c;

  if p_dry or cardinality(v_join) = 0 then
    return jsonb_build_object('dry', p_dry, 'added', 0, 'would_add', cardinality(v_join), 'left_out', v_counts,
                              'leads', v_out, 'cap', r.cap_per_run);
  end if;

  v_month := public.lead_month(r.tenant_id, now());
  -- A lead taken back from this list comes back on its own row; the others are added outside any round, counted
  -- without drawing the month again (they were found and paid for once), with the fit, the reason and the share marks
  -- of where each was found, so the check reads why it fits and one business is still written to once.
  with back as (
    update public.lead_search_members m
       set blanked_at = null, later_at = null, version = m.version + 1
     where m.search_id = s.id and m.lead_id = any (v_join) and m.blanked_at is not null
    returning m.lead_id
  )
  select coalesce(array_agg(lead_id), '{}'::uuid[]) into v_back from back;
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, reason, judgment, counted,
                                          counted_month)
  select s.id, x, null, r.tenant_id, 'qualified', o.fit, coalesce(o.reason, ''), coalesce(o.judgment, '{}'::jsonb), true,
         v_month
    from unnest(v_join) as x
    left join lateral (
      select m.fit, m.reason,
             jsonb_strip_nulls(jsonb_build_object('answer', m.judgment->'answer', 'shares', m.judgment->'shares')) as judgment
        from public.lead_search_members m
        join public.lead_searches q on q.id = m.search_id and q.removed_at is null
       where m.tenant_id = r.tenant_id and m.lead_id = x and m.counted and m.blanked_at is null and m.search_id <> s.id
       order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, m.created_at desc
       limit 1) o on true
   where not (x = any (v_back))
  on conflict (search_id, lead_id) do nothing;
  -- Decided: a lead put off in another pass is no longer for later.
  update public.lead_search_members m set later_at = null
   where m.tenant_id = r.tenant_id and m.lead_id = any (v_join) and m.later_at is not null;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'add', s.id, v_join, jsonb_build_object('back', to_jsonb(v_back)),
          jsonb_build_object('root_id', r.id), 1, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_added', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', s.id, 'n', cardinality(v_join), 'by', v_user));
  select count(*) into v_waiting from public.reach_out_audience(r.tenant_id, s.id, 5000, r.include_unconfirmed);
  return jsonb_build_object('dry', false, 'added', cardinality(v_join), 'op_id', v_op, 'version', 1,
                            'left_out', v_counts, 'leads', v_out, 'waiting', v_waiting, 'cap', r.cap_per_run);
end $$;

create or replace function public.reach_out_booked(p_tenant_id uuid, p_seen jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_lead record;
  v_n    int := 0;
begin
  if p_tenant_id is null or p_seen is null or jsonb_typeof(p_seen) <> 'array' then
    return 0;
  end if;
  for v_lead in
    with seen as (
      -- At most 500 appointments' contacts a call, as the sweep bounds them; a start that is not a time is no start.
      -- The cast sits behind its own test, since a filter beside it may run after it.
      select lower(nullif(btrim(x.s->>'email'), '')) as email,
             nullif(btrim(x.s->>'phone'), '')        as phone,
             case when coalesce(x.s->>'start', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$'
                  then (x.s->>'start')::timestamptz end as start_at
        from (select e from jsonb_array_elements(p_seen) e limit 500) x(s)
       where jsonb_typeof(x.s) = 'object'
    ),
    matched as (
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and lower(l.email) = s.email
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and l.phone_e164 = s.phone
       where s.phone is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and lower(c.email) = s.email and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and c.phone_e164 = s.phone and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.phone is not null
    )
    select m.id, min(m.start_at) as start_at, l.stage
      from matched m
      join public.leads l on l.id = m.id
     where m.start_at is not null
       and l.stage in ('ready', 'nurture', 'converted')
       and l.erased_at is null and l.blanked_at is null
       -- An appointment starting after an email of the reach-out left: one made before it was not the reach-out's.
       and exists (
         select 1 from public.sequence_sends x
          where x.lead_id is not null and ( x.tenant_id = p_tenant_id and x.lead_id = m.id and x.state = 'sent' and x.sent_at < m.start_at))
     group by m.id, l.stage
  loop
    -- The first appointment seen after an email of the reach-out left, whatever the lead's stage (00241, H2): a lead
    -- that wrote back and then booked is Talking already, and is booked all the same. Stamped once, never moved.
    update public.leads set booked_at = v_lead.start_at where id = v_lead.id and booked_at is null;
    if v_lead.stage in ('ready', 'nurture') and coalesce((public.lead_convert_by(p_tenant_id, v_lead.id, 'booking',
                   jsonb_build_object('start', v_lead.start_at))->>'moved')::boolean, false) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.reach_out_chain_people(p_tenant_id uuid, p_root_id uuid, p_limit integer DEFAULT 50)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_root public.sequence_steps%rowtype;
  v_q    public.lead_searches%rowtype;
  v_lim  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.sequence_steps
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found then
    return null;
  end if;
  select * into v_q from public.lead_searches where id = v_root.lead_search_id and tenant_id = p_tenant_id;
  return (
    with p as (
      select * from public.reach_out_people_of(p_tenant_id, p_root_id)
    )
    select jsonb_build_object(
      'root_id', v_root.id,
      'fed_by', case when v_q.via in ('chosen', 'import') then 'list' else 'search' end,
      'search', case when v_q.id is not null then jsonb_build_object('id', v_q.id, 'name', v_q.name) end,
      'counts', jsonb_build_object(
        'waiting', (select count(*) from p where p.grp = 'waiting'),
        'writing', (select count(*) from p where p.grp = 'writing'),
        'done', (select count(*) from p where p.grp = 'done'),
        'of', (select count(*) from public.lead_search_members m
                where m.tenant_id = p_tenant_id and m.search_id = v_root.lead_search_id
                  and m.class = 'qualified' and m.counted and m.blanked_at is null)),
      -- What came of it (canvas B's loop): of everyone it has, how many it wrote to, who wrote back (a person, an
      -- automatic reply aside, not undone), who booked and whose deal was won. Each lead once.
      'came', jsonb_build_object(
        'written', (select count(*) from p where (p.line->>'sent')::int > 0),
        'wrote_back', (select count(*) from p
                        where p.line->'reply' is not null and jsonb_typeof(p.line->'reply') = 'object'
                          and not coalesce((p.line->'reply'->>'undone')::boolean, false)
                          and p.line->'reply'->>'claim' is distinct from 'auto_reply'),
        'booked', (select count(*) from p where p.line->>'booked_at' is not null),
        'won', (select count(*) from p where p.line->>'won_at' is not null)),
      'waiting', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last, x.pos)
                             from (select * from p where p.grp = 'waiting'
                                    order by p.ord desc nulls last, p.pos limit v_lim) x), '[]'::jsonb),
      'writing', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last)
                             from (select * from p where p.grp = 'writing'
                                    order by p.ord desc nulls last limit v_lim) x), '[]'::jsonb),
      'done', coalesce((select jsonb_agg(x.line order by x.ord desc nulls last)
                          from (select * from p where p.grp = 'done'
                                 order by p.ord desc nulls last limit v_lim) x), '[]'::jsonb)
    )
  );
end $$;

create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_steps p
                  where p.id = p_root_id and p.tenant_id = p_tenant_id and p.kind = 'reach_out'
                    and p.trigger = 'lead_first') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  return (
    with recursive c as (
      select p.id, 0 as n from public.sequence_steps p where p.id = p_root_id
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
    ),
    -- Each lead's last send that left, in this chain: where its answer is counted.
    last_sent as (
      select distinct on (s.lead_id) s.lead_id, s.step_id as playbook_id, s.contact_id, l.email, l.closed_reason, l.booked_at
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
       where s.lead_id is not null and ( s.sequence_id = p_root_id and s.tenant_id = p_tenant_id and s.state = 'sent')
       order by s.lead_id, s.sent_at desc
    ),
    -- Who of them wrote back, asked once for all (the send door's own reading).
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answered as (
      select ls.playbook_id,
             count(*) filter (where ls.contact_id in (select contact_id from wrote)) as wrote_back,
             count(*) filter (where ls.closed_reason = 'said_no') as said_no,
             -- Interested (00241, H1): a reading of the lead's reply, not undone, that wants more (Part 5's G6).
             count(*) filter (where exists (
               select 1 from public.sequence_replies r
                where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                  and r.claim <> 'auto_reply' and r.intent in ('interested', 'question'))) as interested,
             -- Booked (00241, H2): an appointment seen after an email of the reach-out left.
             count(*) filter (where ls.booked_at is not null) as booked
        from last_sent ls
       group by ls.playbook_id
    )
    select jsonb_build_object(
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'n', c.n,
        -- An email that left (00241): sent, or failed by a receipt after it left (email_left), as Reports counts it.
        'written', (select count(*) from public.sequence_sends s left join public.messages m on m.id = s.message_id
                     where s.lead_id is not null and ( s.step_id = c.id
                       and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))),
        'delivered', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                       where s.lead_id is not null and ( s.step_id = c.id and s.state = 'sent' and m.status in ('delivered', 'read'))),
        'bounced', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                     where s.lead_id is not null and ( s.step_id = c.id and m.status = 'failed' and m.error->>'provider' = 'bounced')),
        'wrote_back', coalesce((select a.wrote_back from answered a where a.playbook_id = c.id), 0),
        'said_no', coalesce((select a.said_no from answered a where a.playbook_id = c.id), 0),
        'interested', coalesce((select a.interested from answered a where a.playbook_id = c.id), 0),
        'booked', coalesce((select a.booked from answered a where a.playbook_id = c.id), 0),
        'waiting', (select count(*) from public.sequence_sends s
                     where s.lead_id is not null and ( s.step_id = c.id and s.state in ('planned', 'claimed', 'queued'))),
        'held', (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.step_id = c.id and s.state = 'held')),
        'handed', (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.step_id = c.id and s.state = 'handed')))
        order by c.n) from c), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(r order by r->>'run_for' desc) from (
        select jsonb_build_object('id', b.id, 'step_id', b.step_id, 'run_for', b.run_for, 'state', b.state,
                                  'planned', b.recipient_count,
                                  'written', (select count(*) from public.sequence_sends s
                                                left join public.messages m on m.id = s.message_id
                                               where s.lead_id is not null and ( s.batch_id = b.id
                                                 and (s.state = 'sent' or (s.state = 'failed'
                                                      and public.email_left(m.status, m.error))))),
                                  'held', (select count(*) from public.sequence_sends s
                                            where s.lead_id is not null and ( s.batch_id = b.id and s.state = 'held')),
                                  'handed', (select count(*) from public.sequence_sends s
                                              where s.lead_id is not null and ( s.batch_id = b.id and s.state = 'handed'))) as r
          from public.sequence_batches b
         where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
           and b.audience->>'root_id' = p_root_id::text
         order by b.run_for desc
         limit 5) x), '[]'::jsonb),
      'can_remove', not exists (select 1 from public.sequence_sends s
                                 where s.lead_id is not null and ( s.sequence_id = p_root_id
                                   and (s.state in ('claimed', 'queued', 'sent', 'failed', 'drafted')
                                        or (s.state = 'skipped' and s.drafted_at is not null)))))
  );
end $$;

create or replace function public.reach_out_chain_totals(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
begin
  if not public.may_read_workspace(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as reach_out_report reads them (00360): today, or the earlier day a member
  -- picked, never a day that has not come; and the midnight after it, so a window that ended counts nothing after it.
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  return (
    -- An email that left (email_left), dated by when it left (email_sent_at), as reach_out_report counts it.
    with sent as (
      select s.sequence_id as root_id, s.lead_id, s.contact_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at
        from public.sequence_sends s
        left join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))
    ),
    period as (
      select x.* from sent x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    -- Each business once a chain, at its last email of the period.
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.lead_id, x.contact_id
        from period x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    per_chain as (
      select x.root_id, count(*) as written, max(x.sent_at) as last_at
        from period x
       group by x.root_id
    ),
    -- The businesses a chain wrote to (00404): the population wrote_back is a count of.
    written_to as (
      select ls.root_id, count(*) as businesses
        from last_sent ls
       group by ls.root_id
    ),
    wrote_back as (
      select ls.root_id, count(*) as wrote_back
        from last_sent ls
       where ls.contact_id in (select w.contact_id from wrote w)
       group by ls.root_id
    )
    select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object(
             'written', coalesce(c.written, 0),
             'businesses', coalesce(n.businesses, 0),
             'wrote_back', coalesce(b.wrote_back, 0),
             'last_at', c.last_at)), '{}'::jsonb)
      from public.sequence_steps r
      left join per_chain c on c.root_id = r.id
      left join written_to n on n.root_id = r.id
      left join wrote_back b on b.root_id = r.id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  );
end $$;

create or replace function public.reach_out_day_due(p_now timestamp with time zone, p_limit integer)
 returns TABLE(tenant_id uuid, day date, numbers jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with here as (
    select t.id, z.tz, (p_now at time zone z.tz)::date as day,
           date_trunc('day', p_now at time zone z.tz) at time zone z.tz as since
      from public.tenants t
     cross join lateral (select coalesce(nullif(t.timezone, ''), 'America/New_York') as tz) z
     where extract(hour from p_now at time zone z.tz) >= 18
       and exists (select 1 from public.sequence_steps p
                    where p.tenant_id = t.id and p.kind = 'reach_out' and p.trigger = 'lead_first')
  ), counted as (
    select h.id, h.day, jsonb_build_object(
      'written', (select count(*) from public.sequence_sends s left join public.messages m on m.id = s.message_id
                   where s.lead_id is not null and ( s.tenant_id = h.id
                     and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now)),
      'wrote_back', (select count(*) from public.sequence_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply'),
      'interested', (select count(*) from public.sequence_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply' and r.undone_at is null
                        and r.intent in ('interested', 'question')),
      'said_no', (select count(*) from public.sequence_replies r
                   where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                     and r.undone_at is null and r.intent = 'no'),
      'booked', (select count(*) from public.appointments a
                  where a.tenant_id = h.id and a.created_at >= h.since and a.created_at <= p_now
                    and a.lead_id is not null and a.status <> 'cancelled'
                    and exists (select 1 from public.sequence_sends s
                                 where s.lead_id is not null and ( s.tenant_id = h.id and s.lead_id = a.lead_id and s.state = 'sent'
                                   and s.sent_at < a.starts_at))),
      'bounced', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                   where s.lead_id is not null and ( s.tenant_id = h.id and s.state in ('sent', 'failed')
                     and m.status = 'failed' and m.error->>'provider' = 'bounced'
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now)),
      'held', (select count(*) from public.sequence_sends s join public.sequence_batches b on b.id = s.batch_id
                where s.lead_id is not null and ( s.tenant_id = h.id and s.state = 'held'
                  and b.state in ('pending_approval', 'scheduled', 'sending')))) as numbers
      from here h
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = h.id and n.created_at >= h.since - interval '1 day'
                          and n.kind = 'reach_out_day' and n.subject_type = 'reach_out_day'
                          and n.subject_id = h.day::text)
  )
  select c.id, c.day, c.numbers
    from counted c
   where (c.numbers->>'written')::int + (c.numbers->>'wrote_back')::int + (c.numbers->>'said_no')::int
         + (c.numbers->>'held')::int + (c.numbers->>'booked')::int > 0
   order by c.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.reach_out_drafts_waiting(p_limit integer, p_tenant_id uuid DEFAULT NULL::uuid, p_run_id uuid DEFAULT NULL::uuid, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 returns TABLE(id uuid, tenant_id uuid, lead_id uuid, broadcast_id uuid, drafted_at timestamp with time zone, facts jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select s.id, s.tenant_id, s.lead_id, s.batch_id as broadcast_id, s.drafted_at,
         public.reach_out_draft_facts(s.tenant_id, s.lead_id)
    from public.sequence_sends s
   where s.lead_id is not null and ( s.state = 'drafted'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (p_run_id is null or s.batch_id = p_run_id)
     and (p_after_at is null or (s.drafted_at, s.id) > (p_after_at, p_after_id)))
   order by s.drafted_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.reach_out_due_mailboxes(p_at timestamp with time zone, p_limit integer, p_tenant_id uuid DEFAULT NULL::uuid, p_skip_tenants uuid[] DEFAULT '{}'::uuid[], p_skip_mailboxes uuid[] DEFAULT '{}'::uuid[])
 returns TABLE(id uuid, tenant_id uuid)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select b.id, b.tenant_id
    from public.mailbox_connections b
    -- Its earliest due send that goes ahead, so a paused chain's backlog is walked only as far as the first that does.
    cross join lateral (
      select s.send_at as first_due
        from public.sequence_sends s
        join public.sequence_batches r on r.id = s.batch_id
        join public.sequence_steps p on p.id = s.step_id
        join public.sequence_steps root on root.id = s.sequence_id
       where s.lead_id is not null and ( s.mailbox_id = b.id and s.state = 'planned' and s.send_at <= p_at and s.checked_at is not null
         and r.state in ('scheduled', 'sending') and p.state = 'running' and root.state = 'running')
       order by s.send_at
       limit 1) due
   where b.state = 'connected' and (b.resting_until is null or b.resting_until <= p_at)
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not (b.tenant_id = any (coalesce(p_skip_tenants, '{}')))
     and not (b.id = any (coalesce(p_skip_mailboxes, '{}')))
   order by due.first_due, b.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.reach_out_finishable(p_limit integer, p_tenant_id uuid DEFAULT NULL::uuid)
 returns SETOF uuid
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select b.id from public.sequence_batches b
   where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not exists (select 1 from public.sequence_sends s
                      where s.lead_id is not null and ( s.batch_id = b.id and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted')))
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.reach_out_followers(p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days integer, p_limit integer)
 returns TABLE(lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid, facts jsonb, bounced boolean, mailbox_id uuid, country text)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select f.lead_id, f.contact_id, f.email, f.region, f.hours, f.parent_message_id, f.facts, f.bounced, f.mailbox_id,
         f.country
    from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             s.message_id as parent_message_id, s.sent_at, s.mailbox_id, l.country,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.sequence_sends b join public.messages bm on bm.id = b.message_id
                      where b.lead_id is not null and ( b.sequence_id = s.sequence_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed'))) as bounced
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = p_parent_id and s.state = 'sent'
         and s.sent_at <= now() - make_interval(days => p_after_days)
         and s.contact_id is not null
         and not exists (select 1 from public.sequence_sends x
                          where x.lead_id is not null and ( x.step_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))))
    ) f
   where f.facts->>'lead_stage' in ('ready', 'nurture')
     and not coalesce((f.facts->>'suppressed')::boolean, true)
     and not coalesce((f.facts->>'wrote_back')::boolean, true)
     and not coalesce((f.facts->>'away')::boolean, false)
     and not coalesce((f.facts->>'stopped')::boolean, false)
     and not f.bounced
   order by f.sent_at
   limit greatest(p_limit, 0)
$$;

create or replace function public.reach_out_hand_run(p_tenant_id uuid, p_step_id uuid, p_run_id uuid, p_day date, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_step  public.sequence_steps%rowtype;
  v_root  uuid;
  v_item  jsonb;
  v_send  uuid;
  v_made  int := 0;
  v_already int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The run''s leads are a list.' using errcode = '22023';
  end if;
  select * into v_step from public.sequence_steps
   where id = p_step_id and tenant_id = p_tenant_id and kind = 'reach_out' and hand is not null;
  if not found then raise exception 'Step not found.' using errcode = 'P0002'; end if;
  -- Its chain's root: a chain is a few steps, and a walk longer than ten is a loop in the rows.
  with recursive up as (
    select p.id, p.after_step_id as after_playbook_id, 0 as n from public.sequence_steps p where p.id = v_step.after_step_id
    union all
    select p.id, p.after_step_id as after_playbook_id, up.n + 1 from public.sequence_steps p join up on p.id = up.after_playbook_id
     where up.n < 10
  )
  select id into v_root from up where after_playbook_id is null;
  if v_root is null then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;

  insert into public.sequence_batches (id, tenant_id, step_id, run_for, name, template_id, template_name,
                                 template_language, state, scheduled_for, recipient_count, audience)
  values (p_run_id, p_tenant_id, p_step_id, p_day, left(v_step.name || ' · ' || p_day::text, 120), null, null, null,
          'sent', now(), 0,
          jsonb_build_object('kind', 'reach_out', 'root_id', v_root, 'step_id', p_step_id, 'search_id', null,
                             'hand', v_step.hand->>'kind'))
  on conflict do nothing;
  if not exists (select 1 from public.sequence_batches b where b.id = p_run_id and b.tenant_id = p_tenant_id
                   and b.step_id = p_step_id) then
    raise exception 'This step has another run for that day.' using errcode = '23505';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- The lead and its person are the workspace's; the send's row refuses anything else.
    if not exists (select 1 from public.leads l
                    where l.id = (v_item->>'lead_id')::uuid and l.tenant_id = p_tenant_id)
       or not exists (select 1 from public.contacts c
                       where c.id = (v_item->>'contact_id')::uuid and c.tenant_id = p_tenant_id) then
      raise exception 'Lead not found.' using errcode = 'P0002';
    end if;
    v_send := null;
    insert into public.sequence_sends (id, tenant_id, batch_id, step_id, sequence_id, lead_id, contact_id, state,
                                        sent_at)
    values ((v_item->>'send_id')::uuid, p_tenant_id, p_run_id, p_step_id, v_root, (v_item->>'lead_id')::uuid,
            (v_item->>'contact_id')::uuid, 'handed', now())
    on conflict do nothing
    returning id into v_send;
    if v_send is null then
      v_already := v_already + 1;
      continue;
    end if;
    perform public.person_step_from_playbook(p_tenant_id, (v_item->>'contact_id')::uuid, p_day, v_item->>'words',
                                             null, (v_item->>'source_id')::uuid);
    v_made := v_made + 1;
  end loop;

  update public.sequence_batches b
     set recipient_count = (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.batch_id = b.id))
   where b.id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'made', v_made, 'already', v_already);
end $$;

create or replace function public.reach_out_lead_stop(p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_tenant  uuid;
  v_lead    public.leads%rowtype;
  v_skipped int;
  v_leaving int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is first, and only then the lock: a stranger never holds another workspace's lead row.
  select l.tenant_id into v_tenant from public.leads l where l.id = p_lead_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and tenant_id = v_tenant for update;
  if not found or v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id)) then
    raise exception 'Nothing has been written to them yet.' using errcode = '22023';
  end if;
  if v_lead.reach_out_stopped_at is not null then
    return jsonb_build_object('stopped', false, 'already', true, 'skipped', 0, 'leaving', 0);
  end if;
  update public.leads set reach_out_stopped_at = now() where id = p_lead_id;
  with skipped as (
    update public.sequence_sends s
       set state = 'skipped', reason = 'owner_stopped'
      from public.sequence_batches b
     where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
       and s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('planned', 'held', 'drafted'))
    returning 1
  )
  select count(*) into v_skipped from skipped;
  select count(*) into v_leaving from public.sequence_sends s
   where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('claimed', 'queued'));
  return jsonb_build_object('stopped', true, 'already', false, 'skipped', v_skipped, 'leaving', v_leaving);
end $$;

create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_lead  public.leads%rowtype;
  v_root  uuid;
  v_sent  boolean := false;
  v_added timestamptz;
  v_via   text;
begin
  -- A partner's seat counts for the calling session only once it showed its second factor (0013, 00261).
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.sequence_id as root_id into v_root from public.sequence_sends s
   where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
     and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
   order by s.created_at desc
   limit 1;
  v_sent := v_root is not null;
  -- Not written yet: the reach-out whose search holds it (a list it was added to, or the search that found it), 00426.
  if v_root is null then
    select p.id, m.created_at into v_root, v_added
      from public.sequence_steps p
      join public.lead_search_members m on m.search_id = p.lead_search_id and m.lead_id = v_lead.id
     where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
       and m.blanked_at is null and m.class = 'qualified' and m.counted
     order by m.created_at desc
     limit 1;
  end if;
  select q.via into v_via from public.sequence_steps p join public.lead_searches q on q.id = p.lead_search_id
   where p.id = v_root;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'won_at', (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
                where d.tenant_id = p_tenant_id and d.lead_id = v_lead.id and d.stage = 'won'),
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    -- What the lead is and where it came from (00430): a company found by the people card was on no listing, and is not
    -- a list's either.
    'kind', v_lead.kind,
    'source', v_lead.source,
    -- When it was put on its reach-out's list, while nothing has been written to it (00426).
    'added_at', case when not v_sent and v_via in ('chosen', 'import') then v_added end,
    'chain', (select jsonb_build_object(
                'root_id', p.id, 'name', p.name, 'state', p.state,
                'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
                'run_hour', p.run_hour, 'last_run_for', p.last_run_for,
                'waiting_run_id', (select b.id from public.sequence_batches b
                                    where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                      and b.audience->>'root_id' = p.id::text and b.state = 'pending_approval'
                                    order by b.created_at desc limit 1),
                'steps', (with recursive c as (
                            select x.id, x.after_days, x.hand, 0 as n from public.sequence_steps x where x.id = p.id
                            union all
                            select x.id, x.after_days, x.hand, c.n + 1
                              from public.sequence_steps x join c on x.after_step_id = c.id
                          )
                          select coalesce(jsonb_agg(jsonb_build_object('n', c.n, 'after_days', c.after_days,
                                                                       'hand', c.hand->>'kind') order by c.n), '[]'::jsonb)
                            from c))
                from public.sequence_steps p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.sequence_steps p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.sequence_sends s join public.messages m on m.id = s.message_id
                         where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent')
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.sequence_steps p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', b.host,
               'from', b.address,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.sequence_sends x
               where x.lead_id is not null and ( x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.sequence_id = v_root)
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.step_id
        left join public.sequence_steps p on p.id = s.step_id
        left join public.mailbox_connections b on b.id = s.mailbox_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.sequence_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    -- Stop writing to them asks of a lead something was written to (reach_out_lead_stop refuses the others).
    'can_stop', v_sent and v_lead.reach_out_stopped_at is null
  );
end $$;

create or replace function public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user    uuid := auth.uid();
  r         public.sequence_steps;
  q         public.lead_searches;
  m         public.lead_search_members;
  v_skipped integer;
  v_op      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into q from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or q.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A search's reach-out writes to what its search holds: a lead is left out of it on Leads, never here.
  if q.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', q.id);
  end if;
  -- The add's own lock: an add and a leave of one lead meet here, never both at once.
  perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || p_lead_id::text));
  select * into m from public.lead_search_members
   where search_id = q.id and lead_id = p_lead_id and blanked_at is null
     for update;
  if not found then
    return jsonb_build_object('error', 'not_on_it');
  end if;
  -- What left, or is leaving, stays: Stop writing is the true correction there.
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued'))) then
    return jsonb_build_object('error', 'on_its_way');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('sent', 'handed', 'failed'))) then
    return jsonb_build_object('error', 'sent');
  end if;
  -- Planned, held or drafted (not sent yet) in a run still live: skipped as taken back, which its undo's next run plans
  -- again.
  update public.sequence_sends s
     set state = 'skipped', reason = case when s.state = 'drafted' then 'draft_withdrawn' else 'owner_took_back' end
    from public.sequence_batches b
   where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
     and s.state in ('planned', 'held', 'drafted'));
  get diagnostics v_skipped = row_count;
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'leave', q.id, array[p_lead_id], jsonb_build_object('skipped', v_skipped),
          jsonb_build_object('root_id', r.id), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', q.id, 'n', 1, 'by', v_user, 'left_out', true));
  return jsonb_build_object('ok', true, 'op_id', v_op, 'version', m.version, 'skipped', v_skipped);
end $$;

create or replace function public.reach_out_people_counts(p_tenant_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_object_agg(r.id, c.counts)
      from public.sequence_steps r
     cross join lateral (
       select jsonb_build_object(
                'waiting', count(*) filter (where p.grp = 'waiting'),
                'writing', count(*) filter (where p.grp = 'writing'),
                'done', count(*) filter (where p.grp = 'done')) as counts
         from public.reach_out_people_of(p_tenant_id, r.id) p) c
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'), '{}'::jsonb);
end $$;

create or replace function public.reach_out_people_of(p_tenant_id uuid, p_root_id uuid)
 returns TABLE(lead_id uuid, grp text, line jsonb, ord timestamp with time zone, pos bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with root as (
    select r.lead_search_id, r.include_unconfirmed from public.sequence_steps r
     where r.id = p_root_id and r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  ),
  rl as (
    select * from public.reach_out_root_lines(p_tenant_id, p_root_id)
  ),
  aud as (
    select a.lead_id, a.business_name, row_number() over () as pos
      from root
     cross join lateral public.reach_out_audience(p_tenant_id, root.lead_search_id, 5000, root.include_unconfirmed) a
  )
  select r.lead_id,
         case when r.done then 'done' when (r.line->>'sent')::int > 0 then 'writing' else 'waiting' end,
         r.line, r.ord, coalesce((select a.pos from aud a where a.lead_id = r.lead_id), 0)
    from rl r
  union all
  select a.lead_id, 'waiting',
         jsonb_build_object('lead_id', a.lead_id, 'business_name', a.business_name, 'sent', 0, 'added_at', null),
         null::timestamptz, a.pos
    from aud a
   where not exists (select 1 from rl r where r.lead_id = a.lead_id)
$$;

create or replace function public.reach_out_plan_run(p_run jsonb, p_sends jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_run uuid := (p_run->>'id')::uuid;
  v_tenant uuid := (p_run->>'tenant_id')::uuid;
  v_step uuid := (p_run->>'playbook_id')::uuid;
  v_root uuid := (p_run->'audience'->>'root_id')::uuid;
begin
  if p_run->'audience'->>'kind' is distinct from 'reach_out' then
    raise exception 'reach_out_plan_run: a run of a reach-out says so in its audience';
  end if;
  if not exists (select 1 from public.sequence_steps where id = v_step and tenant_id = v_tenant and kind = 'reach_out')
     or not exists (select 1 from public.sequence_steps where id = v_root and tenant_id = v_tenant and kind = 'reach_out') then
    raise exception 'reach_out_plan_run: step % or root % is no reach-out of workspace %', v_step, v_root, v_tenant;
  end if;
  begin
    insert into public.sequence_batches (id, tenant_id, step_id, run_for, name, template_id, template_name,
                                   template_language, state, scheduled_for, recipient_count, audience)
    values (v_run, v_tenant, v_step, (p_run->>'run_for')::date, p_run->>'name', (p_run->>'template_id')::uuid,
            p_run->>'template_name', p_run->>'template_language', p_run->>'state',
            (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int, p_run->'audience');
  exception when unique_violation then
    return jsonb_build_object('exists', true);
  end;
  insert into public.sequence_sends (id, tenant_id, batch_id, step_id, sequence_id, lead_id, contact_id, mailbox_id,
                                      send_at, state, reason)
  select x.id, v_tenant, v_run, v_step, v_root, x.lead_id, x.contact_id, x.mailbox_id, x.send_at,
         coalesce(x.state, 'planned'), x.reason
    from jsonb_to_recordset(coalesce(p_sends, '[]'::jsonb))
         as x(id uuid, lead_id uuid, contact_id uuid, mailbox_id uuid, send_at timestamptz, state text, reason text)
   where exists (select 1 from public.leads l where l.id = x.lead_id and l.tenant_id = v_tenant)
     and (x.mailbox_id is null
          or exists (select 1 from public.mailbox_connections b where b.id = x.mailbox_id and b.tenant_id = v_tenant))
  -- A send any unique rule refuses (a replay's, or a lead another reach-out planned first: one first send per lead,
  -- 00427) is left out of this run, never the run's failure.
  on conflict do nothing;
  return jsonb_build_object('id', v_run);
end $$;

create or replace function public.reach_out_reach(p_tenant_id uuid, p_search_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ready', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, false)),
    'with_unconfirmed', (select count(*) from public.reach_out_audience(p_tenant_id, p_search_id, 5000, true)),
    'phone_only', (select count(*) from public.lead_search_members sm
                     join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
                    where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
                      and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
                      and l.stage = 'ready' and l.erased_at is null and l.blanked_at is null
                      and (nullif(btrim(l.email), '') is null or l.email_state in ('none', 'invalid'))
                      and l.phone_e164 is not null),
    'of', (select count(*) from public.lead_search_members sm
            where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
              and sm.class = 'qualified' and sm.counted and sm.blanked_at is null),
    'chain', (select p.id from public.sequence_steps p
               where p.tenant_id = p_tenant_id and p.lead_search_id = p_search_id and p.kind = 'reach_out'));
end $$;

create or replace function public.reach_out_recheck(p_send_ids uuid[], p_tenant_id uuid DEFAULT NULL::uuid, p_from_state text DEFAULT NULL::text)
 returns integer
 language sql
 security definer
 set search_path to 'public'
as $$
  with asked as (
    select s.id, public.reach_out_given_up(s.created_at) as given_up from public.sequence_sends s
     where s.lead_id is not null and ( s.id = any (coalesce(p_send_ids, '{}')) and s.state in ('planned', 'held', 'claimed')
       and (p_from_state is null or s.state = p_from_state)
       and (p_tenant_id is null or s.tenant_id = p_tenant_id))
       for update
  ),
  gave_up as (
    update public.sequence_sends s set state = 'skipped', reason = 'kept_waiting'
      from asked a where s.lead_id is not null and ( a.id = s.id and a.given_up)
    returning 1
  ),
  done as (
    update public.sequence_sends s
       set state = 'planned', reason = null, claimed_at = null, checked_at = null, check_gen = s.check_gen + 1,
           checked_words = null, check_tries = 0, check_first_at = null, check_after = null, check_started_at = null,
           opening = null, angle = null, facts_used = '{}', hold_detail = null
      from asked a where s.lead_id is not null and ( a.id = s.id and not a.given_up)
    returning 1
  )
  select count(*)::int from done
$$;

create or replace function public.reach_out_release_unavailable(p_before timestamp with time zone, p_tenant_id uuid DEFAULT NULL::uuid)
 returns integer
 language sql
 security definer
 set search_path to 'public'
as $$
  select public.reach_out_recheck(array(
    select s.id from public.sequence_sends s
     where s.lead_id is not null and ( s.state = 'held' and s.reason = 'check_unavailable' and s.hold_detail is null
       and s.updated_at < p_before and (p_tenant_id is null or s.tenant_id = p_tenant_id))))
$$;

create or replace function public.reach_out_remove(p_tenant_id uuid, p_root_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_steps uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.sequence_steps
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first' for update;
  if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
  with recursive c as (
    select id from public.sequence_steps where id = p_root_id
    union all
    select p.id from public.sequence_steps p join c on p.after_step_id = c.id
  )
  select array_agg(id) into v_steps from c;
  -- Held against a claim while it is judged: a claim waits, or finds the chain gone.
  perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.sequence_id = p_root_id) for update;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.sequence_id = p_root_id
                and (s.state in ('claimed', 'queued', 'sent', 'failed', 'drafted')
                     or (s.state = 'skipped' and s.drafted_at is not null)))) then
    raise exception 'This reach-out has written already. Pause it instead.' using errcode = '23503';
  end if;
  update public.sequence_batches set state = 'canceled'
   where tenant_id = p_tenant_id and audience->>'kind' = 'reach_out' and audience->>'root_id' = p_root_id::text
     and state in ('pending_approval', 'scheduled', 'sending');
  update public.templates set hidden_at = coalesce(hidden_at, now())
   where id in (select p.template_id from public.sequence_steps p where p.id = any (v_steps));
  delete from public.sequence_steps where id = p_root_id;
  return jsonb_build_object('root_id', p_root_id, 'removed', cardinality(v_steps));
end $$;

create or replace function public.reach_out_reply_apply(p_tenant_id uuid, p_message_id uuid, p_reading jsonb, p_plan jsonb, p_reread integer, p_days integer, p_said jsonb DEFAULT NULL::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_of       jsonb;
  v_intent   text := p_reading->>'intent';
  v_unread   text := nullif(p_reading->>'unread', '');
  v_summary  text := nullif(btrim(coalesce(p_reading->>'summary', '')), '');
  v_day      date;
  v_refer    text := nullif(btrim(coalesce(p_reading->>'refer_to', '')), '');
  v_until    timestamptz := nullif(p_plan->>'awayUntil', '')::timestamptz;
  v_tell     boolean := coalesce((p_plan->>'tell')::boolean, false);
  v_reread   int := coalesce(p_reread, 0);
  v_row      public.sequence_replies%rowtype;
  v_lead     uuid;
  v_person   uuid;
  v_changed  jsonb := '{}'::jsonb;
  v_before   public.contacts%rowtype;
  v_leads    jsonb;
  v_address  text;
  v_domain   text;
  v_skipped  int := 0;
  v_step     jsonb;
  v_consent  jsonb;
  v_hold     record;
  v_holds    jsonb := '[]'::jsonb;
  v_owed     boolean := false;
  -- Who wrote it, whether it cites our email, and who signed it (0052).
  v_writer   uuid;
  v_cited    boolean;
  v_signer   text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'name', ''), '\s+', ' ', 'g')), ''), 80);
  v_title    text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'title', ''), '\s+', ' ', 'g')), ''), 80);
  v_linked   boolean := false;
  v_said_by  uuid := nullif(p_said->>'by', '')::uuid;
begin
  if v_intent is null or v_intent not in ('interested', 'question', 'not_now', 'no', 'wrong_person', 'away', 'other') then
    raise exception 'a reading names one of the seven intents' using errcode = '22023';
  end if;
  if v_unread is not null and (v_intent <> 'other' or v_unread not in ('no_model', 'may_not_spend', 'day_spent', 'model_failed')) then
    raise exception 'a reply that was not read is other, and says why' using errcode = '22023';
  end if;
  if v_reread < 0 or v_reread > 3 then
    raise exception 'a reply is read again at most three times' using errcode = '22023';
  end if;
  v_day := case when coalesce(p_reading->>'day', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_reading->>'day')::date end;

  if p_said is not null then
    -- The owner's word: a person's, never an automatic reply's, never read again, signed by nobody.
    if v_reread <> 0 or v_unread is not null or v_intent in ('away', 'other') or v_said_by is null then
      raise exception 'an owner tells one of the five intents, once' using errcode = '22023';
    end if;
    v_signer := null;
    v_title := null;
    select jsonb_build_object(
             'send_id', s.id,
             'cited', false,
             'lead_id', l.id,
             'lead_contact_id', l.contact_id,
             'lead_email', lower(btrim(l.email)),
             'answered_message_id', s.message_id,
             'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->'to'->>0,
                                                 o.meta->'email'->>'to'))),
             'business', l.business_name,
             'conversation_id', o.conversation_id,
             'contact_id', coalesce(l.contact_id, s.contact_id),
             'claim', 'owner')
      into v_of
      from public.sequence_sends s
      join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
      join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.id = nullif(p_said->>'send_id', '')::uuid and s.tenant_id = p_tenant_id and s.state = 'sent');
  else
    v_of := public.reach_out_reply_of(p_tenant_id, p_message_id, p_days);
  end if;
  if v_of is null then
    return jsonb_build_object('applied', false, 'why', 'not_a_reply');
  end if;
  v_lead   := (v_of->>'lead_id')::uuid;
  v_person := (v_of->>'lead_contact_id')::uuid;
  v_writer := (v_of->>'contact_id')::uuid;
  v_cited  := coalesce((v_of->>'cited')::boolean, false);
  -- A reply that cites our email from another address at the business links its writer to the lead (0052, 1b below);
  -- what the reading records (a no, a step, the leads it closes) stays the lead's own person's, as before. A reply that
  -- cites nothing links nobody: nothing is inferred from a domain.
  -- An out-of-office's pause is an automatic reply's alone (the table's CHECK says so too).
  if v_intent <> 'away' or v_of->>'claim' <> 'auto_reply' then
    v_until := null;
  end if;

  -- The lead's person first, before anything takes a lighter lock on them (the row's own keys do): the consent door,
  -- another reading of theirs and the undo all lock them, so two of these never wait on each other in a circle.
  if v_person is not null then
    perform 1 from public.contacts where id = v_person and tenant_id = p_tenant_id for update;
  end if;

  -- 1. The row: once.
  if v_reread = 0 then
    insert into public.sequence_replies (message_id, tenant_id, conversation_id, contact_id, lead_id, lead_contact_id,
                                          send_id, answered_message_id, claim, intent, summary, named_day, refer_to,
                                          unread, until_at, plan, said_by)
    values (p_message_id, p_tenant_id, (v_of->>'conversation_id')::uuid, (v_of->>'contact_id')::uuid, v_lead, v_person,
            (v_of->>'send_id')::uuid, (v_of->>'answered_message_id')::uuid, v_of->>'claim', v_intent,
            left(v_summary, 160), v_day, left(v_refer, 120), v_unread, v_until, coalesce(p_plan, '{}'::jsonb), v_said_by)
    on conflict (message_id) do nothing
    returning * into v_row;
    if v_row.message_id is null then
      return jsonb_build_object('applied', false);
    end if;
  else
    -- A re-read, by compare-and-set: still unread, not undone, and at the re-read before this one.
    select * into v_row from public.sequence_replies r
     where r.message_id = p_message_id and r.tenant_id = p_tenant_id
     for update;
    if v_row.message_id is null or v_row.unread is null or v_row.undone_at is not null
       or v_row.rereads <> v_reread - 1 then
      return jsonb_build_object('applied', false);
    end if;
    -- Due a notice when the plan tells (news: told once more, the claim taken back), and still due one, in this
    -- reading's words, when the reading before it was owed one the owner was never given (its mail failed). An owed
    -- notice keeps its claim: a run still telling it marks it told, and this stage then has nothing to tell.
    v_owed := coalesce((v_row.plan->>'tell')::boolean, false) and v_row.told_at is null;
    update public.sequence_replies r
       set intent = v_intent, summary = left(v_summary, 160), named_day = v_day, refer_to = left(v_refer, 120),
           unread = v_unread, until_at = v_until, plan = coalesce(p_plan, '{}'::jsonb),
           rereads = v_reread, reread_at = now(),
           read_at = case when v_unread is null then now() else r.read_at end,
           tell_claimed_at = case when v_tell then null else r.tell_claimed_at end,
           told_at = case when v_tell then null else r.told_at end
     where r.message_id = p_message_id
    returning * into v_row;
    v_tell := v_tell or v_owed;
  end if;

  -- 1b. The writer of a reply that cites our email is at the lead's business (0052): linked, unless a member settled
  -- where they work. Once, on the first reading.
  if v_reread = 0 and v_cited and v_writer is not null and v_writer is distinct from v_person then
    update public.contacts c
       set lead_id = v_lead, updated_at = now()
     where c.id = v_writer and c.tenant_id = p_tenant_id and c.erased_at is null
       and c.lead_id is null and c.lead_settled_at is null;
    v_linked := found;
    if v_linked then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.business_linked', 'contact', 'contact', v_writer,
              jsonb_build_object('lead_id', v_lead, 'via', 'reply', 'message_id', p_message_id));
      v_changed := v_changed || jsonb_build_object('linked', v_writer);
    end if;
  end if;

  -- 1c. The signer, the writer's: kept on the row, offered to the owner (the notice) or taken when the plan says so
  -- (automatic naming, switched off until its evals pass). Only a first reading or a re-read that finally read the reply
  -- has one.
  if v_signer is not null and v_row.signer_name is null then
    update public.sequence_replies
       set signer_name = v_signer, signer_title = v_title, signer_state = 'offered',
           signer_was = (select case when c.display_name is null then 'none' else c.name_source end
                           from public.contacts c where c.id = v_writer)
     where message_id = p_message_id;
    if coalesce((p_plan->>'adoptSigner')::boolean, false) and v_writer is not null then
      v_changed := v_changed || jsonb_build_object('named',
        public.person_name_take(p_tenant_id, v_writer, p_message_id, null, 'auto')->'named');
    end if;
  end if;

  -- 2. The lead's sends still waiting in live runs, and its drafts waiting for their owner: the door would refuse each
  -- (wrote back), so none waits for an owner.
  if p_plan->>'skipSends' = 'outreach_wrote_back' then
    with skipped as (
      update public.sequence_sends s
         set state = 'skipped', reason = 'outreach_wrote_back'
        from public.sequence_batches b
       where s.lead_id is not null and ( b.id = s.batch_id and b.tenant_id = s.tenant_id
         and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = p_tenant_id and s.lead_id = v_lead and s.state in ('planned', 'held', 'drafted'))
      returning 1
    )
    select count(*)::int into v_skipped from skipped;
    v_changed := v_changed || jsonb_build_object('skipped', v_skipped);
  end if;

  -- 3. Talking.
  if coalesce((p_plan->>'convert')::boolean, false) then
    v_changed := v_changed || jsonb_build_object('converted',
      public.lead_convert_by(p_tenant_id, v_lead, 'reply', jsonb_build_object('message_id', p_message_id), false)->'moved');
  end if;

  -- 4. The day they named.
  if nullif(p_plan->>'resumeAt', '') is not null then
    update public.leads set resume_at = (p_plan->>'resumeAt')::timestamptz
     where id = v_lead and tenant_id = p_tenant_id and erased_at is null and blanked_at is null;
  end if;

  -- 5. Said no: the one consent door, then every address the no stands behind and the business's own domain (N6) on
  -- the never-again list. What the undo needs is recorded: the consent it found and whether this no is the one that
  -- changed it (and the email its event names); every row the no stands behind, written now or there before (holds);
  -- the rows this transaction wrote (suppressions: their created_at is its now()); each lead it closed, with its stage
  -- before and the version it was left at. Each held row is written, or locked where it stands, until this commits,
  -- so an undo of another no that also holds it waits, and then sees this one.
  if coalesce((p_plan->>'saidNo')::boolean, false) and v_person is not null then
    select * into v_before from public.contacts where id = v_person and tenant_id = p_tenant_id;
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', l.stage)), '[]'::jsonb) into v_leads
      from public.leads l
     where l.tenant_id = p_tenant_id and l.contact_id = v_person
       and l.stage in ('ready', 'nurture') and l.erased_at is null and l.blanked_at is null;
    v_consent := public.set_email_marketing(p_tenant_id, v_person, 'opted_out', 'reply',
                                            (v_of->>'answered_message_id')::uuid,
                                            jsonb_build_object('reading', p_message_id));
    v_address := lower(btrim(coalesce(p_plan->>'suppressFrom', '')));
    v_domain := lower(btrim(coalesce(p_plan->>'suppressDomain', '')));
    -- The person's address and the one the email went to (the consent door's own two), the lead's, the reply's From;
    -- and the domain. In one order, so two noes that share a row never wait on each other in a circle.
    for v_hold in
      select distinct h.kind, h.hash from (
        select 'email' as kind, public.lead_suppression_hash(p_tenant_id, a) as hash
          from unnest(array[lower(btrim(v_before.email)), lower(btrim(v_of->>'answered_to')),
                            lower(btrim(v_of->>'lead_email')), v_address]) as a
         where a like '%@%'
        union all
        select 'domain', public.lead_suppression_hash(p_tenant_id, v_domain)
         where v_domain <> '' and v_domain not like '%@%'
      ) h
      order by h.kind, h.hash
    loop
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (p_tenant_id, v_hold.kind, v_hold.hash, 'said_no')
      on conflict (tenant_id, kind, hash) do update set what = lead_suppressions.what;
      v_holds := v_holds || jsonb_build_array(jsonb_build_object('kind', v_hold.kind, 'hash', v_hold.hash));
    end loop;
    v_changed := v_changed || jsonb_build_object(
      'consent_was', v_before.email_marketing,
      'consent_source_was', v_before.email_marketing_source,
      'consent_changed', coalesce((v_consent->>'changed')::boolean, false),
      'consent_named', case when coalesce((v_consent->>'changed')::boolean, false)
                            then v_of->>'answered_message_id' end,
      'holds', v_holds,
      -- Only a row a reading wrote is ever the undo's to delete, never an unsubscribe's, a customer's or an erasure's.
      'suppressions', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'hash', x.hash) order by x.kind, x.hash), '[]'::jsonb)
          from public.lead_suppressions x
         where x.tenant_id = p_tenant_id and x.what = 'said_no' and x.kind in ('email', 'domain')
           and x.created_at = now()),
      'leads', (
        select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', b->>'stage', 'version', l.version)), '[]'::jsonb)
          from jsonb_array_elements(v_leads) b
          join public.leads l on l.id = (b->>'id')::uuid and l.tenant_id = p_tenant_id
         where l.stage = 'archived' and l.closed_reason = 'said_no'));
  end if;

  -- 6. A dated step on the lead's person, once per message.
  if jsonb_typeof(p_plan->'step') = 'object' and v_person is not null then
    v_step := public.person_step_from_playbook(p_tenant_id, v_person, (p_plan->'step'->>'dueOn')::date,
                                               p_plan->'step'->>'words', null, p_message_id);
    v_changed := v_changed || jsonb_build_object('step', coalesce(v_step->'note'->>'id', v_step->>'error'));
  end if;

  update public.sequence_replies
     set plan = coalesce(p_plan, '{}'::jsonb) || jsonb_build_object('tell', v_tell, 'changed', v_changed)
   where message_id = p_message_id;

  -- 7. What happened, on the lead.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'reach_out.replied', 'lead', 'lead', v_lead,
          jsonb_build_object('intent', v_intent, 'message_id', p_message_id, 'lead_id', v_lead,
                             'claim', v_of->>'claim', 'reread', v_reread > 0, 'unread', v_unread,
                             'business', v_of->>'business'));

  return jsonb_build_object('applied', true, 'intent', v_intent, 'unread', v_unread, 'changed', v_changed);
end $$;

create or replace function public.reach_out_reply_draft(p_tenant_id uuid, p_message_id uuid, p_state text, p_draft text, p_why text)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if p_state is null or p_state not in ('waiting', 'written', 'not_written') then
    raise exception 'a draft is waiting, written or not written' using errcode = '22023';
  end if;
  update public.sequence_replies
     set draft_state = p_state,
         draft = case when p_state = 'written' then left(p_draft, 4000) else draft end,
         draft_why = case when p_state = 'not_written' then left(p_why, 60) else draft_why end
   where message_id = p_message_id and tenant_id = p_tenant_id and draft_state in ('none', 'waiting');
  return found;
end $$;

create or replace function public.reach_out_reply_of(p_tenant_id uuid, p_message_id uuid, p_days integer)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with m as (
    select m.id, m.conversation_id, coalesce(m.contact_id, c.contact_id) as contact_id, c.contact_id as thread_contact,
           m.created_at, coalesce(m.channel_ts, m.created_at) as received_at, m.body, m.meta
      from public.messages m
      join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
     where m.id = p_message_id and m.tenant_id = p_tenant_id
       and m.channel = 'email' and m.direction = 'inbound' and m.sender = 'customer'
  ), cited as (
    select array_remove(
             array[m.meta->'email'->>'in_reply_to']
             || array(select jsonb_array_elements_text(
                        case when jsonb_typeof(m.meta->'email'->'references') = 'array'
                             then m.meta->'email'->'references' else '[]'::jsonb end)),
             null) as ids
      from m
  ), found as (
    -- The email it answers or cites, by its Message-ID (messages_email_message_id_idx), then its send.
    (select s.id, 1 as how, s.sent_at
       from cited cross join m
       join public.messages o
         on o.tenant_id = p_tenant_id and o.channel = 'email' and o.direction = 'outbound'
        and o.meta->'email'->>'message_id' = any (cited.ids)
       join public.sequence_sends s on s.lead_id is not null and ( s.message_id = o.id and s.tenant_id = o.tenant_id)
      where s.state = 'sent'
        and s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
      order by s.sent_at desc
      limit 1)
    union all
    -- Else the latest email a reach-out sent to the thread's person, as the send names them
    -- (reach_out_sends_contact)...
    (select s.id, 2 as how, s.sent_at
       from m
       join public.sequence_sends s
         on s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.contact_id = m.thread_contact and s.state = 'sent')
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
    union all
    -- ...or as its lead names them now (leads_tenant_contact).
    (select s.id, 3 as how, s.sent_at
       from m
       join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = m.thread_contact
       join public.sequence_sends s on s.lead_id is not null and ( s.tenant_id = l.tenant_id and s.lead_id = l.id and s.state = 'sent')
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
  ), one as (
    select f.id, f.how from found f order by f.how, f.sent_at desc limit 1
  )
  select jsonb_build_object(
    'send_id', s.id,
    -- Whether the reply cites our email by its Message-ID (0052): only then is its writer linked to the lead.
    'cited', one.how = 1,
    'lead_id', l.id,
    'lead_contact_id', l.contact_id,
    'lead_email', lower(btrim(l.email)),
    'lead_website', l.website_host,
    'lead_website_root', l.website_root,
    'root_id', s.sequence_id,
    'playbook_id', s.step_id,
    'answered_message_id', s.message_id,
    'answered_text', left(o.body, 600),
    -- The address the email went to, read off its frozen request as the consent door reads it.
    'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->>'to'))),
    'business', l.business_name,
    'chain', root.name,
    'signed_by', root.signed_by,
    'sent_at', s.sent_at,
    'tz', t.timezone,
    'conversation_id', m.conversation_id,
    'contact_id', m.contact_id,
    'claim', case when m.meta->'email'->>'claim' in ('person', 'automated', 'auto_reply')
                  then m.meta->'email'->>'claim' else 'person' end,
    'from', m.meta->'email'->>'from',
    -- The From line's own words, and the names a signer can never be: the workspace's and its members' (0052).
    'from_name', m.meta->'email'->>'from_name',
    'workspace', t.name,
    'team', (select coalesce(jsonb_agg(p.display_name), '[]'::jsonb)
               from public.memberships ms
               join public.profiles p on p.user_id = ms.user_id
              where ms.tenant_id = s.tenant_id and btrim(p.display_name) <> ''),
    'subject', m.meta->'email'->>'subject',
    'text', m.body,
    'received_at', m.received_at)
    from one
    join public.sequence_sends s on s.lead_id is not null and ( s.id = one.id)
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    left join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
    left join public.sequence_steps root on root.id = s.sequence_id
    left join public.tenants t on t.id = s.tenant_id
    cross join m
$$;

create or replace function public.reach_out_reply_said(p_tenant_id uuid, p_user_id uuid, p_lead_id uuid, p_reading jsonb, p_plan jsonb, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_send    uuid;
  v_conv    uuid;
  v_contact uuid;
  v_id      uuid := gen_random_uuid();
  v_out     jsonb;
begin
  if p_user_id is null or not exists (
       select 1 from public.memberships m
        where m.tenant_id = p_tenant_id and m.user_id = p_user_id and m.role in ('owner', 'operator', 'partner')) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'The owner''s word is written on the thread.' using errcode = '22023';
  end if;
  -- The lead, then its latest email that went, as every door that writes both locks them.
  perform 1 from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
   for update;
  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select s.id, m.conversation_id, coalesce(s.contact_id, m.contact_id) into v_send, v_conv, v_contact
    from public.sequence_sends s
    join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
   where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id and s.state = 'sent')
   order by s.sent_at desc
   limit 1
   for update of s;
  if v_send is null then
    raise exception 'Nothing has been sent to them yet.' using errcode = '22023';
  end if;
  if exists (select 1 from public.sequence_replies r
              where r.tenant_id = p_tenant_id and r.send_id = v_send and r.undone_at is null
                and r.claim <> 'auto_reply') then
    return jsonb_build_object('applied', false, 'already', true, 'send_id', v_send);
  end if;
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                               status, meta)
  values (v_id, p_tenant_id, v_conv, v_contact, 'email', 'outbound', 'human', 'note', left(btrim(p_note), 500), 'sent',
          jsonb_build_object('source', 'owner_said', 'said_by', p_user_id,
                             'reach_out', jsonb_build_object('send_id', v_send, 'lead_id', p_lead_id)));
  v_out := public.reach_out_reply_apply(p_tenant_id, v_id, p_reading, p_plan, 0, 0,
                                        jsonb_build_object('send_id', v_send, 'by', p_user_id));
  return v_out || jsonb_build_object('message_id', v_id, 'send_id', v_send);
end $$;

create or replace function public.reach_out_reply_tell_claim(p_tenant_id uuid, p_message_id uuid, p_stale_before timestamp with time zone)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_at timestamptz;
begin
  update public.sequence_replies
     set tell_claimed_at = clock_timestamp()
   where message_id = p_message_id and tenant_id = p_tenant_id and told_at is null
     and (tell_claimed_at is null or tell_claimed_at < p_stale_before)
  returning tell_claimed_at into v_at;
  return v_at;
end $$;

create or replace function public.reach_out_reply_told(p_tenant_id uuid, p_message_id uuid, p_claimed_at timestamp with time zone)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  update public.sequence_replies set told_at = now()
   where message_id = p_message_id and tenant_id = p_tenant_id and told_at is null
     and tell_claimed_at = p_claimed_at;
  return found;
end $$;

create or replace function public.reach_out_reply_undo(p_message_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_why      text;
  v_row      public.sequence_replies%rowtype;
  v_others   int;
  v_res      jsonb;
  v_no       jsonb;
  v_consent  text := null;
  v_row_s    jsonb;
  v_deleted  int := 0;
  v_kept     int := 0;
  v_restored int := 0;
  v_lead     record;
  v_pass     int;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Asked first with no lock (a stranger locks nothing of another workspace's), then again once the person and the
  -- reading are locked, in the order the reading's door takes them: a reading applied, an unsubscribe or a complaint
  -- for the same person meanwhile (each locks the person, the consent door too) waits for this undo, or this undo for
  -- it, and never slips between the question and the act.
  for v_pass in 1 .. 2 loop
    v_why := public.reach_out_reply_undoable(p_message_id);
    if v_why = 'not_found' then raise exception 'Reply not found.' using errcode = 'P0002'; end if;
    if v_why = 'role' then raise exception 'Not allowed to act in this workspace.' using errcode = '42501'; end if;
    if v_why = 'not_a_no' then raise exception 'Only a no can be undone.' using errcode = '22023'; end if;
    if v_why = 'already' then raise exception 'Already undone.' using errcode = '22023'; end if;
    if v_why = 'too_late' then raise exception 'It''s been more than seven days.' using errcode = '22023'; end if;
    if v_why = 'moved' then raise exception 'They unsubscribed since, and that stays.' using errcode = '22023'; end if;
    if v_why is not null then raise exception 'That reply cannot be undone.' using errcode = '22023'; end if;
    exit when v_pass = 2;
    select * into v_row from public.sequence_replies where message_id = p_message_id;
    perform 1 from public.contacts where id = v_row.lead_contact_id and tenant_id = v_row.tenant_id for update;
    perform 1 from public.sequence_replies where message_id = p_message_id for update;
  end loop;

  update public.sequence_replies
     set undone_at = now(), undone_by = v_user
   where message_id = p_message_id and undone_at is null
  returning * into v_row;

  -- Another no from the same person still holds their answer, their leads and their rows on the never-again list.
  select count(*) into v_others from public.sequence_replies o
   where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
     and o.intent = 'no' and o.undone_at is null;

  if v_others > 0 then
    v_kept := jsonb_array_length(coalesce(v_row.plan->'changed'->'holds', '[]'::jsonb));
  else
    -- Back to exactly the answer the no found, named for the email it named, so D18 stops counting it: the reading of
    -- theirs that changed their answer recorded both (consent_was, consent_named). The consent door holds it to the
    -- answer its own event kept, and refuses any other.
    select o.plan->'changed' into v_no
      from public.sequence_replies o
     where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
       and o.intent = 'no' and o.undone_at is not null
       and coalesce((o.plan->'changed'->>'consent_changed')::boolean, false)
     order by o.read_at desc
     limit 1;
    v_res := public.set_email_marketing(v_row.tenant_id, v_row.lead_contact_id,
                                        coalesce(v_no->>'consent_was', 'unknown'), 'reply_undone',
                                        coalesce(nullif(v_no->>'consent_named', '')::uuid, v_row.answered_message_id),
                                        jsonb_build_object('reading', v_row.message_id, 'by', v_user));
    -- Nothing else is put back unless the answer was: the whole undo is refused, and nothing it did stands.
    if not coalesce((v_res->>'changed')::boolean, false) then
      raise exception 'They unsubscribed since, and that stays.' using errcode = '22023';
    end if;
    v_consent := (select c.email_marketing from public.contacts c where c.id = v_row.lead_contact_id);

    -- The rows this person's noes stood behind, each deleted only when a reading wrote it (never an unsubscribe's, a
    -- customer's or an erasure's row that was there first) and nothing holds it now: no standing no of anyone (a
    -- second lead's no keeps the domain), no person holding that address who unsubscribed or complained, no erased
    -- person who held it.
    for v_row_s in
      select distinct x from public.sequence_replies o
       cross join lateral jsonb_array_elements(coalesce(o.plan->'changed'->'holds', '[]'::jsonb)) x
       where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
         and o.intent = 'no' and o.undone_at is not null
    loop
      if not exists (
           select 1 from public.sequence_replies a
            where a.tenant_id = v_row.tenant_id and a.intent = 'no'
              and coalesce(a.plan->'changed'->'suppressions', '[]'::jsonb) @> jsonb_build_array(v_row_s)) then
        continue;
      end if;
      -- The row locked before it is judged: a reading of another person's no that holds it holds its lock until it
      -- commits, so this waits, and the question below (a statement of its own) then sees that no.
      perform 1 from public.lead_suppressions
       where tenant_id = v_row.tenant_id and kind = v_row_s->>'kind' and hash = v_row_s->>'hash'
       for update;
      if exists (
           select 1 from public.sequence_replies o
            where o.tenant_id = v_row.tenant_id and o.intent = 'no' and o.undone_at is null
              and coalesce(o.plan->'changed'->'holds', '[]'::jsonb) @> jsonb_build_array(v_row_s))
         or (v_row_s->>'kind' = 'email' and exists (
           select 1 from public.contacts c
            where c.tenant_id = v_row.tenant_id
              and ((c.email_marketing = 'opted_out' and c.email_marketing_source in ('unsubscribe', 'complaint')
                    and c.email is not null
                    and public.lead_suppression_hash(v_row.tenant_id, c.email) = v_row_s->>'hash')
                or c.erased_email_hash = v_row_s->>'hash')))
      then
        v_kept := v_kept + 1;
      else
        delete from public.lead_suppressions
         where tenant_id = v_row.tenant_id and kind = v_row_s->>'kind' and hash = v_row_s->>'hash' and what = 'said_no';
        if found then
          v_deleted := v_deleted + 1;
        end if;
      end if;
    end loop;

    -- Every lead one of this person's noes closed, back to its stage before, at the version the no left it.
    for v_lead in
      select distinct on ((x->>'id')::uuid) (x->>'id')::uuid as id, x->>'stage' as stage, (x->>'version')::int as version
        from public.sequence_replies o
       cross join lateral jsonb_array_elements(coalesce(o.plan->'changed'->'leads', '[]'::jsonb)) x
       where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
         and o.intent = 'no' and o.undone_at is not null
       order by (x->>'id')::uuid, o.read_at desc
    loop
      update public.leads
         set stage = v_lead.stage, closed_reason = null, version = version + 1
       where id = v_lead.id and tenant_id = v_row.tenant_id and version = v_lead.version
         and stage = 'archived' and closed_reason = 'said_no' and v_lead.stage in ('ready', 'nurture')
         and erased_at is null and blanked_at is null;
      if found then
        v_restored := v_restored + 1;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_row.tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
                jsonb_build_object('stage', v_lead.stage, 'reason', null, 'by', v_user, 'source', 'reply_undone'));
      end if;
    end loop;
  end if;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'reach_out.reply_undone', 'lead', 'lead', v_row.lead_id,
          jsonb_build_object('message_id', v_row.message_id, 'lead_id', v_row.lead_id, 'by', v_user,
                             'consent', v_consent, 'suppressions', v_deleted, 'leads', v_restored,
                             'another_no', v_others > 0));

  return jsonb_build_object(
    'ok', true,
    'restored', jsonb_build_object('consent', v_consent, 'suppressions', v_deleted, 'leads', v_restored),
    'kept', jsonb_build_object('suppressions', v_kept, 'another_no', v_others > 0));
end $$;

create or replace function public.reach_out_reply_undoable(p_message_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select case
    when r.message_id is null
      or not exists (select 1 from public.memberships mm where mm.tenant_id = r.tenant_id and mm.user_id = (select auth.uid()))
      then 'not_found'
    when not public.is_acting_member(r.tenant_id) then 'role'
    when r.intent <> 'no' then 'not_a_no'
    when r.undone_at is not null then 'already'
    when r.read_at < now() - interval '7 days' then 'too_late'
    -- Their person, or the lead that said it, erased or gone since: an erasure's tombstone is for good, and an undo
    -- could take back a row it relies on.
    when c.id is null or c.erased_at is not null or l.id is null or l.erased_at is not null or l.blanked_at is not null
      then 'not_found'
    when c.email_marketing is distinct from 'opted_out' or c.email_marketing_source is distinct from 'reply' then 'moved'
    else null
  end
    from (select p_message_id as id) asked
    left join public.sequence_replies r on r.message_id = asked.id
    left join public.contacts c on c.id = r.lead_contact_id and c.tenant_id = r.tenant_id
    left join public.leads l on l.id = r.lead_id and l.tenant_id = r.tenant_id
$$;

create or replace function public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00404): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00404): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.sequence_id as root_id, s.step_id as playbook_id, s.lead_id, s.contact_id, s.mailbox_id,
             -- Sent from its owner's own inbox, on their word (00429): from no mailbox, as an email from before 00424 is.
             s.said_at is not null as yours,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.sequence_sends s
        left join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.sequence_id as root_id, s.step_id as playbook_id, count(*) as n
        from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop)
       group by s.sequence_id, s.step_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at,
             -- Won (00426): a deal that names the lead, won. A count of businesses, never an amount.
             exists (select 1 from public.deals d
                      where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.sequence_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             ls.won,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle) as businesses,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    mailboxes as (
      select x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at, count(*) as sent,
             -- One its owner sent from their own inbox is never counted delivered: nobody can know it landed.
             count(*) filter (where x.status in ('sent', 'delivered', 'read') and not x.yours) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.mailbox_connections b on b.id = x.mailbox_id and b.tenant_id = p_tenant_id
       group by x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.sequence_steps p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('sent', 'delivered', 'read') and not yours),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'won', (select count(*) from answers where won),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00404).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('sent', 'delivered', 'read') and not x.yours),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.sequence_batches b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.sequence_steps p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('sent', 'delivered', 'read') and not x.yours),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'won', (select count(*) from answers a where a.playbook_id = c.id and a.won),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.sequence_steps p on p.id = c.id)) as body
              from public.sequence_steps r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      -- An edge or a page from before mailboxes reads `domains`: none now (decision 0056).
      'domains', '[]'::jsonb,
      'mailboxes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'address', d.address, 'yours', d.yours, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.address)
          from (select * from mailboxes order by sent desc, address limit 10) d), '[]'::jsonb))
  );
end $$;

create or replace function public.reach_out_root_lines(p_tenant_id uuid, p_root_id uuid)
 returns TABLE(lead_id uuid, line jsonb, ord timestamp with time zone, done boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with sends as (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    select s.id, s.lead_id, s.state, s.reason, s.send_at,
           case when s.state = 'sent' then s.sent_at
                when s.state = 'failed' and public.email_left(m.status, m.error)
                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
           coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
           b.state in ('pending_approval', 'scheduled', 'sending') as live
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
      left join public.messages m on m.id = s.message_id
     where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id = p_root_id
       -- A send of a run its owner skipped, or one taken back, never happened as far as the lead's line is concerned.
       and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
  ),
  per as (
    select x.lead_id,
           count(*) filter (where x.left_at is not null) as sent,
           min(x.left_at) as first_sent_at,
           max(x.left_at) as last_sent_at,
           min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
           bool_or(x.state = 'held' and x.live) as held,
           bool_or(x.state = 'handed') as handed,
           count(*) filter (where x.state = 'drafted' and x.live) as drafted,
           bool_or(x.bounced and x.left_at is not null) as bounced,
           max(x.left_at) filter (where x.bounced) as bounced_at,
           max(x.left_at) as ord
      from sends x
     group by x.lead_id
  ),
  per_lead as (
    select p.lead_id, p.sent, p.first_sent_at, p.last_sent_at, p.next_at, p.held, p.handed, p.drafted, p.bounced,
           p.bounced_at, p.ord, null::timestamptz as added_at
      from per p
    union all
    -- A list-fed reach-out's leads not written yet: on its list, with when each was added (00426).
    select m.lead_id, 0, null, null, null, false, false, 0, false, null, null, m.created_at
      from public.sequence_steps r
      join public.lead_searches q on q.id = r.lead_search_id and q.via in ('chosen', 'import') and q.removed_at is null
      join public.lead_search_members m on m.search_id = q.id and m.blanked_at is null and m.class = 'qualified' and m.counted
     where r.id = p_root_id and r.tenant_id = p_tenant_id
       and not exists (select 1 from per p where p.lead_id = m.lead_id)
  ),
  facts as (
    select x.*, l.business_name, l.stage, l.closed_reason, l.email_state, l.resume_at, l.booked_at, l.reach_out_stopped_at,
           -- Won: a deal that names the lead, won (decided); the first such, a count and never an amount.
           (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
             where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won_at,
           (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at, 'undone', r.undone_at is not null)
              from public.sequence_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id
             order by r.read_at desc
             limit 1) as reply,
           (select max(r.until_at) from public.sequence_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id and r.intent = 'away'
               and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null) as away_until
      from per_lead x
      join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
  )
  select f.lead_id,
         jsonb_build_object(
           'lead_id', f.lead_id,
           'business_name', f.business_name,
           'stage', f.stage,
           'closed_reason', f.closed_reason,
           'sent', f.sent,
           'first_sent_at', f.first_sent_at,
           'last_sent_at', f.last_sent_at,
           'next_at', f.next_at,
           'held', coalesce(f.held, false),
           'handed', coalesce(f.handed, false),
           'drafted', coalesce(f.drafted, 0),
           'bounced', coalesce(f.bounced, false),
           'bounced_at', f.bounced_at,
           'email_state', f.email_state,
           'reply', f.reply,
           'away_until', f.away_until,
           'resume_at', f.resume_at,
           'booked_at', f.booked_at,
           'won_at', f.won_at,
           'stopped_at', f.reach_out_stopped_at,
           'added_at', f.added_at),
         coalesce(f.ord, f.added_at),
         -- Done: booked, stopped, bounced, said no, closed, or a person answered (an automatic reply only pauses). Each
         -- test is said so it is never null: a lead with no closed reason and no reply is not done, never unknown.
         (f.booked_at is not null or f.reach_out_stopped_at is not null or coalesce(f.bounced, false)
          or f.closed_reason is not distinct from 'said_no' or f.stage not in ('ready', 'nurture')
          or (f.reply is not null and not coalesce((f.reply->>'undone')::boolean, false)
              and f.reply->>'claim' is distinct from 'auto_reply'))
    from facts f
$$;

create or replace function public.reach_out_run_recheck(p_broadcast_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_tenant uuid;
  v_state  text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select tenant_id, state into v_tenant, v_state from public.sequence_batches
   where id = p_broadcast_id and audience->>'kind' = 'reach_out';
  if not found or not public.is_acting_member(v_tenant) then
    raise exception 'Run not found.' using errcode = 'P0002';
  end if;
  if v_state not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  return jsonb_build_object('broadcast_id', p_broadcast_id, 'rechecked', public.reach_out_recheck(array(
    select s.id from public.sequence_sends s
     where s.lead_id is not null and ( s.batch_id = p_broadcast_id and s.state = 'held' and s.reason = 'check_unavailable'
       and s.hold_detail is null)), v_tenant));
end $$;

create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.sequence_steps
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.sequence_steps where id = v_root
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = any (v_dropped)) for update;
    if exists (select 1 from public.sequence_sends s
                where s.lead_id is not null and ( s.step_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed'))) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.sequence_batches set state = 'canceled'
     where tenant_id = p_tenant_id and step_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.sequence_sends set state = 'skipped', reason = 'step_removed'
     where sequence_sends.lead_id is not null and ( step_id = any (v_dropped) and state in ('planned', 'held', 'drafted'));
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.sequence_steps p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_step_id cascades).
    delete from public.sequence_steps where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.sequence_steps (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_step_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.sequence_steps where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = v_id)) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.sequence_steps
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.sequence_steps
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.sequence_steps set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.sequence_steps
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes, domain_ids = '{}',
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = any (v_changed) and s.state in ('planned', 'held'))),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

create or replace function public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_root     public.sequence_steps%rowtype;
  v_via      text;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.sequence_steps p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and p.lead_search_id = p_search_id
   order by p.created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  select q.via into v_via from public.lead_searches q where q.id = p_search_id;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_midnight := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  return (
    with sends as (
      select s.id, s.lead_id, s.state, s.send_at, s.checked_at, s.mailbox_id,
             case when s.state = 'sent' then s.sent_at
                  when s.state = 'failed' and public.email_left(m.status, m.error)
                    then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
             b.state in ('pending_approval', 'scheduled', 'sending') as live
        from public.sequence_sends s
        join public.sequence_batches b on b.id = s.batch_id
        left join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id = v_root.id)
    ),
    rl as (
      select * from public.reach_out_root_lines(p_tenant_id, v_root.id)
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
      'owner_sends', v_root.owner_sends,
      'written_to', (select count(*) from rl where (rl.line->>'sent')::int > 0),
      'today', (select count(*) from sends where left_at >= v_midnight),
      'next', (select jsonb_build_object('at', x.send_at, 'business', l.business_name, 'host', b.host, 'from', b.address)
                 from sends x
                 join public.leads l on l.id = x.lead_id
                 left join public.mailbox_connections b on b.id = x.mailbox_id
                where x.state = 'planned' and x.live and x.checked_at is not null
                order by x.send_at
                limit 1),
      'held', (select count(*) from sends where state = 'held' and live),
      'to_send', (select count(*) from sends where state = 'drafted' and live),
      'waiting_run_id', (select b.id from public.sequence_batches b
                          where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                            and b.audience->>'root_id' = v_root.id::text and b.state = 'pending_approval'
                          order by b.created_at desc
                          limit 1),
      'leads', coalesce((
        select jsonb_agg(x.line order by x.ord desc nulls first, x.lead_id)
          from (select * from rl order by rl.ord desc nulls first, rl.lead_id limit 2000) x), '[]'::jsonb)
    )
  );
end $$;

create or replace function public.reach_out_send_decide(p_send_id uuid, p_decision text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_send public.sequence_sends%rowtype;
  v_run  text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select state into v_run from public.sequence_batches where id = v_send.batch_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  case p_decision
    when 'include' then
      if v_send.state <> 'held' or v_send.reason = 'check_unavailable' then
        raise exception 'Only an email the check held for a reason is included.' using errcode = '22023';
      end if;
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      update public.sequence_sends
         set state = 'planned', reason = null, hold_detail = null,
             included_for = array(select distinct x from unnest(included_for || v_send.reason) x order by x)
       where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'rewrite' then
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      perform public.reach_out_recheck(array[p_send_id], v_send.tenant_id);
    when 'skip' then
      update public.sequence_sends set state = 'skipped', reason = 'owner_skipped' where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'not_a_fit' then
      perform public.lead_set_stage(v_send.lead_id, 'archived', 'not_a_fit',
                                    case when v_send.reason = 'chain' then 'chain' else 'other' end);
      update public.sequence_sends set state = 'skipped', reason = 'not_a_fit' where sequence_sends.lead_id is not null and ( id = p_send_id);
    else
      raise exception 'Include, rewrite, skip or not a fit.' using errcode = '22023';
  end case;
  return jsonb_build_object('send_id', p_send_id, 'decision', p_decision);
end $$;

create or replace function public.reach_out_send_said(p_send_id uuid, p_outcome text, p_reason text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user    uuid := auth.uid();
  v_at      timestamptz := now();
  v_tenant  uuid;
  v_lead_id uuid;
  v_send    public.sequence_sends%rowtype;
  v_lead    public.leads%rowtype;
  v_to      text;
  v_since   text;
  v_person  jsonb;
  v_contact uuid;
  v_conv    uuid;
  v_msg     uuid;
  v_why     text := left(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'owner_skipped'), 60);
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'not_sent') then
    raise exception 'Sent, or not sent.' using errcode = '22023';
  end if;
  -- Whose it is first, and only then the locks: the lead, then the send.
  select s.tenant_id, s.lead_id into v_tenant, v_lead_id from public.sequence_sends s where s.lead_id is not null and ( s.id = p_send_id);
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_lead_id and tenant_id = v_tenant for update;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  -- What its owner may still say: either word on a draft waiting, and Sent on one skipped since it was handed over
  -- that nobody has said went or did not.
  if not (v_send.state = 'drafted'
          or (p_outcome = 'sent' and v_send.state = 'skipped' and v_send.drafted_at is not null
              and v_send.said_at is null)) then
    return jsonb_build_object('said', false, 'state', v_send.state, 'reason', v_send.reason);
  end if;

  if p_outcome = 'not_sent' then
    update public.sequence_sends
       set state = 'skipped', reason = v_why, said_at = v_at, said_by = v_user
     where sequence_sends.lead_id is not null and ( id = p_send_id);
    return jsonb_build_object('said', true, 'state', 'skipped', 'reason', v_why);
  end if;

  v_to := nullif(lower(btrim(coalesce(v_send.draft->>'to', ''))), '');
  -- What about its lead would refuse it now (never why it was skipped: a draft given up was no refusal): said beside the
  -- record, never instead of it.
  v_since := case
    when v_lead.id is null or v_lead.erased_at is not null or v_lead.blanked_at is not null then 'lead_gone'
    when v_lead.stage not in ('ready', 'nurture') then 'lead_closed'
    when v_to is not null and public.lead_address_suppressed(v_tenant, v_to) then 'outreach_suppressed'
    when v_lead.reach_out_stopped_at is not null then 'outreach_stopped'
  end;
  if v_to is not null and v_lead.id is not null and v_lead.erased_at is null and v_lead.blanked_at is null then
    v_person := public.reach_out_person(v_tenant, v_lead.id);
    if v_person ? 'refused' then
      v_since := coalesce(v_since, v_person->>'refused');
      -- Somebody in People holds the address (the lead's own person since it closed, or a customer): the email went
      -- to them, and goes on their thread.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_tenant and c.erased_at is null
         and (c.id = v_lead.contact_id or c.email = v_to)
       order by (c.id = v_lead.contact_id) desc
       limit 1;
      if v_contact is null then
        select i.contact_id into v_contact from public.contact_identities i
          join public.contacts c on c.id = i.contact_id and c.erased_at is null
         where i.tenant_id = v_tenant and i.channel = 'email' and i.external_id = v_to
         limit 1;
      end if;
      -- Their thread, where they have one (a customer's does): the email goes on it. With none, the send is sent alone.
      if v_contact is not null then
        select id into v_conv from public.conversations where tenant_id = v_tenant and contact_id = v_contact;
      end if;
    else
      v_contact := (v_person->>'contact_id')::uuid;
      v_conv := (v_person->>'conversation_id')::uuid;
    end if;
  end if;

  if v_conv is not null and v_send.draft is not null then
    v_msg := gen_random_uuid();
    insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                                 status, meta)
    values (v_msg, v_tenant, v_conv, v_contact, 'email', 'outbound', 'human', 'text',
            coalesce(v_send.draft->>'body', ''), 'sent',
            jsonb_build_object(
              'source', 'reach_out',
              'email', jsonb_build_object('subject', v_send.draft->>'subject', 'to', jsonb_build_array(v_to),
                                          'text', v_send.draft->>'text', 'said_by', v_user, 'said_at', v_at)
                       || case when nullif(v_send.draft->>'parent_id', '') is not null
                               then jsonb_build_object('parent_id', v_send.draft->>'parent_id') else '{}'::jsonb end,
              'reach_out', jsonb_build_object('send_id', v_send.id, 'lead_id', v_send.lead_id, 'contact_id', v_contact,
                                              'playbook_id', v_send.step_id, 'root_id', v_send.sequence_id,
                                              'broadcast_id', v_send.batch_id, 'attempt', v_send.attempts)
                           || case when v_since is not null then jsonb_build_object('since', v_since)
                                   else '{}'::jsonb end));
  end if;

  -- Sent, with its email when there is one to keep; a skip's reason no longer says what it is.
  update public.sequence_sends
     set state = 'sent', sent_at = v_at, message_id = v_msg, contact_id = coalesce(v_contact, contact_id),
         reason = null, said_at = v_at, said_by = v_user
   where sequence_sends.lead_id is not null and ( id = p_send_id);

  update public.leads
     set stage = case when stage = 'ready' then 'nurture' else stage end,
         contacted_at = coalesce(contacted_at, v_at),
         last_outcome = 'emailed',
         version = version + 1
   where id = v_lead_id and tenant_id = v_tenant and erased_at is null and blanked_at is null;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'lead.emailed', 'lead', 'lead', v_lead_id,
            jsonb_build_object('by', 'reach_out', 'send_id', v_send.id));
  end if;

  return jsonb_build_object('said', true, 'state', 'sent', 'message_id', v_msg, 'contact_id', v_contact,
                            'conversation_id', v_conv, 'since', v_since);
end $$;

create or replace function public.reach_out_sources(p_tenant_id uuid, p_limit integer DEFAULT 12)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_lim integer := least(greatest(coalesce(p_limit, 12), 1), 50);
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(x.src order by x.created_at desc)
      from (
        select s.created_at,
               jsonb_build_object(
                 'id', s.id,
                 'name', s.name,
                 'via', s.via,
                 'asked_on', s.created_at,
                 'ready', (select count(*) from public.reach_out_audience(p_tenant_id, s.id, 5000, false)),
                 'with_unconfirmed', (select count(*) from public.reach_out_audience(p_tenant_id, s.id, 5000, true))) as src
          from public.lead_searches s
         where s.tenant_id = p_tenant_id and s.removed_at is null
           and not exists (select 1 from public.sequence_steps p
                            where p.tenant_id = p_tenant_id and p.lead_search_id = s.id and p.kind = 'reach_out')
         order by s.created_at desc
         limit v_lim) x
     where (x.src->>'with_unconfirmed')::int > 0), '[]'::jsonb);
end $$;

create or replace function public.reach_out_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_include_unconfirmed boolean DEFAULT false)
 returns TABLE(lead_id uuid, why text)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select x.id,
    case
      when l.id is null or l.erased_at is not null or l.blanked_at is not null then 'gone'
      when l.stage <> 'ready' or l.closed_reason is not null then 'closed'
      -- Never a customer's: nobody in People shares the address (as theirs, or one they wrote from) or the number.
      when exists (select 1 from public.contacts c
                    where c.tenant_id = l.tenant_id and c.erased_at is null
                      and ((nullif(btrim(l.email), '') is not null and c.email = lower(btrim(l.email)))
                           or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
        or (nullif(btrim(l.email), '') is not null and exists (
              select 1 from public.contact_identities i
                join public.contacts c on c.id = i.contact_id and c.erased_at is null
               where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email))))
        then 'customer'
      -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, its business's domain), and
      -- the place or the number (a customer's or an erased person's).
      when (nullif(btrim(l.email), '') is not null and public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email))))
        or exists (select 1 from public.lead_suppressions s where s.tenant_id = l.tenant_id and (
                     (s.kind = 'place' and l.place_id is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                  or (s.kind = 'phone' and l.phone_e164 is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
        then 'suppressed'
      -- Never twice by the workspace: a send of any reach-out, bar one in a run its owner skipped or one taken back.
      when exists (select 1 from public.sequence_sends ro
                    where ro.lead_id is not null and ( ro.tenant_id = l.tenant_id and ro.lead_id = l.id
                      and not (ro.state = 'skipped' and ro.reason in ('run_canceled', 'owner_took_back'))))
        then 'written'
      -- One business written to once: the finder saw it share a number, an own-domain address or a site with another.
      when exists (select 1 from public.lead_search_members m
                    where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.blanked_at is null
                      and coalesce(jsonb_array_length(m.judgment->'shares'), 0) <> 0)
        then 'shared'
      when nullif(btrim(l.email), '') is null then 'no_email'
      when l.email_state = 'ok' then null
      when l.email_state = 'checking' then 'checking'
      when l.email_state = 'catch_all' then case when coalesce(p_include_unconfirmed, false) then null else 'unconfirmed' end
      when l.email_state = 'invalid' then 'invalid'
      else 'unchecked'
    end
    from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x(id)
    left join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id
$$;

create or replace function public.run_counts(p_tenant_id uuid, p_run_ids uuid[])
 returns jsonb
 language sql
 stable
 set search_path to ''
as $$
  with people as (
    select r.batch_id as broadcast_id, r.state, r.sent_at,
           -- The channel it went by (00298); a row naming none went by WhatsApp, as every run before channels did.
           case when r.channel in ('sms', 'email') then r.channel else 'whatsapp' end as channel,
           m.status, m.conversation_id
      from public.sequence_sends r
      left join public.messages m on m.id = r.message_id
     where r.lead_id is null and ( r.tenant_id = p_tenant_id
       and r.batch_id = any (p_run_ids))
  ),
  counted as (
    select p.broadcast_id,
           count(*) filter (where p.state = 'queued')                           as queued,
           count(*) filter (where p.state = 'sent')                             as sent,
           count(*) filter (where p.state = 'skipped')                          as skipped,
           count(*) filter (where p.state = 'failed')                           as failed,
           count(*) filter (where p.status in ('delivered', 'read'))            as delivered,
           -- A read is WhatsApp's own receipt (0030): a text a carrier marked read is no read here.
           count(*) filter (where p.status = 'read' and p.channel = 'whatsapp') as was_read,
           count(*) filter (where p.state = 'sent' and p.channel = 'whatsapp')  as by_whatsapp,
           count(*) filter (where p.state = 'sent' and p.channel = 'sms')       as by_sms,
           count(*) filter (where p.state = 'sent' and p.channel = 'email')     as by_email
      from people p
     group by p.broadcast_id
  ),
  -- Each thread a run reached, once, from the first time it reached it there.
  threads as (
    select p.broadcast_id, p.conversation_id, min(p.sent_at) as sent_at
      from people p
     where p.conversation_id is not null and p.sent_at is not null
     group by p.broadcast_id, p.conversation_id
  ),
  replied as (
    -- One probe of messages_conversation_created (conversation_id, created_at) for each thread, whatever the planner
    -- guesses. This statement is planned with its arguments as placeholders, so any(p_run_ids) is guessed at about 250
    -- people where a busy workspace's history is 90,000, and the planner joined every thread to every inbound message of
    -- the workspace: 3,600 runs of 25 took 3 s at 720 inbound messages and 8 s, a member's limit, at 2,520. OFFSET 0
    -- keeps the EXISTS a probe of its own, and the probe names no workspace, since on tables not yet analyzed the planner
    -- probed the workspace's inbound index instead, every inbound message once per thread again (15 s at 720). The thread
    -- fixes the workspace: a run's person names a message of its own workspace, and a message a thread of its own
    -- (broadcast_recipients_message_id_same_workspace, messages_conversation_id_same_workspace). Now about 0.4 s from
    -- 720 to 30,720 inbound messages, analyzed or not, with the same answer
    -- (playbooks/totals/playbook-totals.db.test.mjs, "a workspace that talks").
    select t.broadcast_id, count(*) as replied
      from threads t
     where exists (
             select 1 from public.messages i
              where i.conversation_id = t.conversation_id
                and i.direction = 'inbound'
                and i.sender = 'customer'
                and public.message_is_a_persons_words(i.meta)
                and i.created_at > t.sent_at
                and i.created_at <= t.sent_at + public.campaign_reply_window()
             offset 0)
     group by t.broadcast_id
  )
  select coalesce(jsonb_object_agg(c.broadcast_id::text, jsonb_build_object(
           'queued', c.queued,
           'sent', c.sent,
           'skipped', c.skipped,
           'failed', c.failed,
           'delivered', c.delivered,
           'read', c.was_read,
           'replied', coalesce(y.replied, 0),
           'sent_by', jsonb_build_object('whatsapp', c.by_whatsapp, 'sms', c.by_sms, 'email', c.by_email))), '{}'::jsonb)
    from counted c
    left join replied y on y.broadcast_id = c.broadcast_id
$$;

create or replace function public.sending_domain_capacity(p_domain_id uuid, p_at timestamp with time zone)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with d as (
    select id, tenant_id, host, state, clean_since from public.sending_domains where id = p_domain_id
  ),
  gone as (
    -- What left the domain, or went and nobody knows how: by when it left (00180's clock), back 30 days at most.
    select public.email_sent_at(m.meta, m.status_updated_at, m.created_at) as at
      from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = d.host
       and m.created_at >= least(greatest(coalesce(d.clean_since, p_at), p_at - interval '90 days'), p_at - interval '1 day')
                            - interval '30 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  ),
  waiting as (
    -- Queued email rows from the domain (written, not yet left), and claimed sends with no row yet. A row queued a
    -- month ago is stuck, not waiting (the outbox fails a job long before): the bound keeps the read on 00176's index.
    select now() as at from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound' and m.status = 'queued'
       and public.email_from_host(m.meta) = d.host
       and m.created_at >= p_at - interval '30 days'
    union all
    select coalesce(s.claimed_at, p_at) from public.sequence_sends s, d
     where s.lead_id is not null and ( s.domain_id = d.id and s.state = 'claimed')
  ),
  planned as (
    select s.send_at as at from public.sequence_sends s, d where s.lead_id is not null and ( s.domain_id = d.id and s.state = 'planned')
  )
  select jsonb_build_object(
    'state', d.state,
    'clean_since', d.clean_since,
    -- D15: the days it actually sent on (UTC days) since it was last clean, before today's: the step a day's first
    -- send earns is the next day's, so a domain's share holds all day (as the calendar ramp's did).
    'sent_days', (select count(distinct (g.at at time zone 'UTC')::date) from gone g
                   where d.clean_since is not null and g.at >= greatest(d.clean_since, p_at - interval '90 days')
                     and (g.at at time zone 'UTC')::date < (p_at at time zone 'UTC')::date),
    'used', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at)
            + (select count(*) from waiting),
    'recent', coalesce((select jsonb_agg((extract(epoch from x.at) * 1000)::bigint order by x.at) from (
                 select at from gone where at > p_at - interval '1 day'
                 union all select at from waiting
                 union all select at from planned) x), '[]'::jsonb),
    'last_sent_at', (select max(g.at) from gone g where g.at <= p_at)
  ) from d
$$;

create or replace function public.sequence_batches_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $$
begin
  if NEW.state is distinct from OLD.state then
    if OLD.state in ('sent', 'canceled', 'failed') then
      raise exception 'broadcasts.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    if OLD.state = 'pending_approval' and NEW.state not in ('scheduled', 'canceled', 'failed') then
      raise exception 'a broadcast awaiting approval may only be scheduled, canceled or failed (% refused)', NEW.state;
    end if;
    if OLD.state = 'scheduled' and NEW.state not in ('sending', 'canceled', 'failed', 'pending_approval') then
      raise exception 'a scheduled broadcast may only start sending, be canceled, fail, or go back for approval (% refused)', NEW.state;
    end if;
    if OLD.state = 'sending' and NEW.state not in ('sent', 'failed', 'canceled') then
      raise exception 'a sending broadcast may only finish, fail or be canceled (% refused)', NEW.state;
    end if;
  end if;
  return NEW;
end $$;

create or replace function public.start_playbook(p_tenant_id uuid, p_playbook jsonb, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or jsonb_typeof(p_playbook) is distinct from 'object' then
    raise exception 'start_playbook: a playbook is named whole' using errcode = '22004';
  end if;
  -- On the caller's rights: the table's insert policy judges the row (an acting member, as themselves, a moment, a
  -- list and a message of this workspace), and its checks and unique indexes refuse what they refuse. The workspace,
  -- who made it and that it runs are said here, never by the caller; `kind` is the table's default, a moment. Its last
  -- day and its trial's end are the caller's (00416), each null where it names none.
  insert into public.sequence_steps (tenant_id, name, trigger, list_id, list_key, template_id, template_name,
                                template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                cadence_days, channels, until, trial_until, created_by)
  select p_tenant_id, r.name, r.trigger, r.list_id, r.list_key, r.template_id, r.template_name,
         r.template_language, r.params, r.policy_class, 'running', r.run_hour, r.cap_per_run, r.gap_days,
         r.cadence_days, r.channels, r.until, r.trial_until, v_actor
    from jsonb_populate_record(null::public.sequence_steps, p_playbook) r
  returning id into v_id;
  return jsonb_build_object('id', v_id)
      || public.member_decision(p_tenant_id, 'playbook', v_id, 'start_playbook', p_decision, p_via, p_undo_of);
end $$;

create or replace function public.template_sends(p_tenant_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $$
  with went as (
    -- A person a run marked sent: what left, apart from what was delivered (Reports counts "Messages sent" so).
    select b.template_name as name, r.sent_at as at
      from public.sequence_sends r
      join public.sequence_batches b on b.id = r.batch_id and b.tenant_id = r.tenant_id
     where r.lead_id is null and ( r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and coalesce(b.template_name, '') <> '')
    union all
    -- A template the Inbox sent into a closed window, on its own message row, which left when WhatsApp took it (its
    -- wamid). A run's own messages name no template, so nothing above is counted again here.
    select m.template_name, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id
       and m.direction = 'outbound'
       and coalesce(m.template_name, '') <> ''
       and coalesce(m.external_id, '') <> ''
  )
  select coalesce(jsonb_object_agg(w.name, jsonb_build_object('count', w.n, 'last_at', w.last_at)), '{}'::jsonb)
    from (select x.name, count(*) as n, max(x.at) as last_at from went x group by x.name) w
$$;

create or replace function public.trigger_playbooks_sweep()
 returns bigint
 language sql
 security definer
 set search_path to 'public', 'extensions'
as $$ select public.request_sweep('playbooks', '/api/cron/playbooks') $$;

create or replace function public.trigger_reach_out_check_sweep()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if exists (
       select 1 from public.sequence_sends s
         join public.sequence_batches b on b.id = s.batch_id
         join public.sequence_steps p on p.id = s.step_id
         join public.sequence_steps r on r.id = s.sequence_id
        where s.lead_id is not null and ( s.state = 'planned' and s.checked_at is null
          and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
          and (s.check_after is null or s.check_after <= now())
          and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
          and (b.state = 'pending_approval' or s.send_at <= now() + interval '2 hours')))
     or exists (select 1 from public.sequence_sends
                 where sequence_sends.lead_id is not null and ( state = 'held' and reason = 'check_unavailable' and hold_detail is null
                   and updated_at < now() - interval '1 hour')) then
    return public.request_sweep('reach_out_check', '/api/cron/reach-out-check', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out_check', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

create or replace function public.trigger_reach_out_sweep()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if exists (
       select 1 from public.sequence_sends s
         join public.sequence_batches b on b.id = s.batch_id
         join public.sequence_steps p on p.id = s.step_id
         join public.sequence_steps r on r.id = s.sequence_id
        where s.lead_id is not null and ( s.state = 'planned' and s.send_at <= now() and s.checked_at is not null
          and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running'))
     or exists (select 1 from public.sequence_sends where sequence_sends.lead_id is not null and ( state in ('claimed', 'queued')))
     or exists (select 1 from public.sequence_sends where sequence_sends.lead_id is not null and ( state = 'held' and created_at < now() - interval '14 days'))
     or exists (select 1 from public.sequence_sends where sequence_sends.lead_id is not null and ( state = 'drafted' and drafted_at < now() - interval '14 days'))
     -- A draft waiting: every quarter hour, so the clock judges it as the send door would (draftRefusalOf).
     or (extract(minute from now())::int % 15 = 0 and exists (select 1 from public.sequence_sends where sequence_sends.lead_id is not null and ( state = 'drafted')))
     or exists (
       select 1 from public.sequence_batches b
        where b.audience->>'kind' = 'reach_out' and b.state in ('canceled', 'failed')
          and exists (select 1 from public.sequence_sends s
                       where s.lead_id is not null and ( s.batch_id = b.id and s.state in ('planned', 'held', 'claimed', 'drafted'))))
     or exists (
       select 1 from public.sequence_batches b
        where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
          and not exists (select 1 from public.sequence_sends s
                           where s.lead_id is not null and ( s.batch_id = b.id
                             and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted')))) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

create or replace function public.trigger_sequences_clock(p_at timestamp with time zone DEFAULT now())
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  -- The moments: once an hour, at five past, as playbooks-sweep ran.
  if extract(minute from p_at)::int = 5 then
    begin
      perform public.trigger_playbooks_sweep();
    exception when others then
      raise warning 'sequences-clock: the moments were not asked: %', sqlerrm;
    end;
  end if;
  -- The check before each cold email: every minute, asked only when a send waits for it.
  begin
    perform public.trigger_reach_out_check_sweep();
  exception when others then
    raise warning 'sequences-clock: the check was not asked: %', sqlerrm;
  end;
  -- The leads' send clock: every minute, asked only when a checked send is due or a run is ready to finish.
  begin
    perform public.trigger_reach_out_sweep();
  exception when others then
    raise warning 'sequences-clock: the send clock was not asked: %', sqlerrm;
  end;
end $$;
