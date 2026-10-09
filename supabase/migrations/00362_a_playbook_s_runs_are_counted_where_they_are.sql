-- 00362 · A playbook's runs, a run's people and a message's sends are counted where they are, in one read each.
--
-- GET playbooks summed every run's people and replies in the dashboard (listPlaybooks over listRuns, peopleOnRuns and
-- inboundOn): the runs were read unpaged, so PostgREST's thousand rows kept the newest thousand, reach-out steps' runs
-- among them, each two hundred runs' people were cut again at 20,000 rows, and every page's boot paid for it, on the
-- order of 150 round trips at 3,600 runs. Sent and a run's sheet counted a run in TypeScript beside it, and Settings'
-- GET templates?all=1 paged every sent person and every templated message for one count per message. Now:
--
--   campaign_reply_window  the 72 hours a reply to a campaign is counted in (contracts REPLY_WINDOW_HOURS and isReplyTo),
--                          said once in SQL; not WhatsApp's service window (contracts replyWindow). campaign_series reads
--                          it: its 00329 body with that one change.
--   run_counts             a run's queued, sent, skipped, failed, delivered, read (WhatsApp's own receipt), replied and
--                          sent by channel, by run id: what Sent, a run's sheet and a playbook's card all say. Replied is
--                          each thread the run reached, once, from its first send there, where the customer wrote words
--                          of their own (message_is_a_persons_words) within the window.
--   playbook_totals        each moment playbook's runs, sent, delivered, replied and held (its people skipped or failed),
--                          its newest run, the run that waits, and its newest p_history runs, from run_counts. Moments
--                          only: a reach-out step's runs share broadcasts and are never scanned. One jsonb by playbook id,
--                          which no row cap cuts; a playbook with no run is absent.
--   template_sends         how many of each message went out (a person a run marked sent, a template the Inbox sent that
--                          WhatsApp took) and when the latest did, by name.
--
-- Each runs on the caller's rights (security invoker), so row security decides what it reads, as campaign_series does,
-- and a member of another workspace reads nothing; language sql (no plan cached for a cost that runs from nothing to a
-- whole history), stable, an empty search_path. playbooks/totals/playbook-totals.db.test.mjs holds them to seeded truth.
--
-- Deploy order: either. A dashboard before this never calls them; one after it reads the old way while a function is
-- missing (packages/db isMissingDoor), for one release. Re-runnable: create or replace, grants restated.

create or replace function public.campaign_reply_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '72 hours'
$$;
revoke execute on function public.campaign_reply_window() from public, anon;
grant execute on function public.campaign_reply_window() to authenticated, service_role;
comment on function public.campaign_reply_window() is
  'The window a reply to a campaign is counted in after its send: 72 hours (contracts REPLY_WINDOW_HOURS and isReplyTo; playbooks/totals/playbook-totals.db.test.mjs holds the two equal). Not WhatsApp''s service window (contracts replyWindow). campaign_series and run_counts read it.';

create or replace function public.run_counts(p_tenant_id uuid, p_run_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with people as (
    select r.broadcast_id, r.state, r.sent_at,
           -- The channel it went by (00298); a row naming none went by WhatsApp, as every run before channels did.
           case when r.channel in ('sms', 'email') then r.channel else 'whatsapp' end as channel,
           m.status, m.conversation_id
      from public.broadcast_recipients r
      left join public.messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.broadcast_id = any (p_run_ids)
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
    select t.broadcast_id, count(*) as replied
      from threads t
     where exists (
             select 1 from public.messages i
              where i.conversation_id = t.conversation_id
                and i.tenant_id = p_tenant_id
                and i.direction = 'inbound'
                and i.sender = 'customer'
                and public.message_is_a_persons_words(i.meta)
                and i.created_at > t.sent_at
                and i.created_at <= t.sent_at + public.campaign_reply_window())
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
revoke execute on function public.run_counts(uuid, uuid[]) from public, anon;
grant execute on function public.run_counts(uuid, uuid[]) to authenticated, service_role;
comment on function public.run_counts(uuid, uuid[]) is
  'Each named run''s people by state (queued, sent, skipped, failed), its receipts (delivered; read, WhatsApp''s own), the threads it reached that the customer answered in their own words within campaign_reply_window after the run first reached them there (replied), and what went by each channel (sent_by), by run id; a run nobody is on is absent. What Sent, a run''s sheet and a playbook''s card all say (00362). Security invoker: row security decides what is read.';

create or replace function public.playbook_totals(p_tenant_id uuid, p_history integer default 10)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with runs as (
    -- Moments only: a reach-out step's runs share broadcasts and are never scanned.
    select b.id, b.playbook_id, b.name, b.state, b.run_for, b.scheduled_for, b.recipient_count,
           case when jsonb_typeof(b.audience -> 'trigger') = 'string' then b.audience ->> 'trigger' end as trigger,
           row_number() over (partition by b.playbook_id order by b.created_at desc, b.id desc) as n
      from public.broadcasts b
      join public.playbooks p on p.id = b.playbook_id and p.tenant_id = b.tenant_id and p.kind = 'moment'
     where b.tenant_id = p_tenant_id
  ),
  counts as (
    -- Each run's counts as run_counts says them to Sent: one statement of what a run earned.
    select public.run_counts(p_tenant_id, coalesce(array_agg(x.id), '{}'::uuid[])) as c from runs x
  ),
  per_run as (
    select x.*,
           coalesce((k.c -> x.id::text ->> 'sent')::bigint, 0)      as sent,
           coalesce((k.c -> x.id::text ->> 'skipped')::bigint, 0)
             + coalesce((k.c -> x.id::text ->> 'failed')::bigint, 0) as held,
           coalesce((k.c -> x.id::text ->> 'delivered')::bigint, 0) as delivered,
           coalesce((k.c -> x.id::text ->> 'replied')::bigint, 0)   as replied
      from runs x
     cross join counts k
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
revoke execute on function public.playbook_totals(uuid, integer) from public, anon;
grant execute on function public.playbook_totals(uuid, integer) to authenticated, service_role;
comment on function public.playbook_totals(uuid, integer) is
  'Each moment playbook''s runs, sent, delivered, replied and held (its people skipped or failed), its newest run (last_run), the run waiting for a person (waiting, else null) and its newest p_history runs (history, newest first), by playbook id, from run_counts; a playbook with no run is absent, and a reach-out step''s runs are never scanned. One jsonb, which PostgREST''s row cap never cuts: what GET playbooks answers of every card (00362). Security invoker: row security decides what is read.';

create or replace function public.template_sends(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with went as (
    -- A person a run marked sent: what left, apart from what was delivered (Reports counts "Messages sent" so).
    select b.template_name as name, r.sent_at as at
      from public.broadcast_recipients r
      join public.broadcasts b on b.id = r.broadcast_id and b.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and coalesce(b.template_name, '') <> ''
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
revoke execute on function public.template_sends(uuid) from public, anon;
grant execute on function public.template_sends(uuid) to authenticated, service_role;
comment on function public.template_sends(uuid) is
  'How many times each message went out (a person a run marked sent; a template the Inbox sent that WhatsApp took, its wamid) and when the latest did, by name; a message never sent is absent. What Settings'' templates say (00362). Security invoker: row security decides what is read.';

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_start  timestamptz;
  v_cur    date;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;
  v_cur   := v_today - (v_days - 1);

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- Every message a broadcast or a playbook run actually sent in the span,
  -- with the receipt WhatsApp gave it and the thread it landed in.
  sent as (
    select r.broadcast_id, r.contact_id, r.sent_at,
           -- The channel it went by (00298); a row from before channels went by WhatsApp, as every run then did.
           coalesce(r.channel, 'whatsapp') as channel,
           (r.sent_at at time zone v_tz)::date as day,
           m.status as message_status, m.conversation_id,
           b.playbook_id, b.name as broadcast_name, b.template_name
      from broadcast_recipients r
      join broadcasts b on b.id = r.broadcast_id
      left join messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and r.sent_at >= v_start
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
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043), email's own answer with them (00174: the one-click unsubscribe an
  -- offer by email invites, and YES OFFERS by email), which this left out while offers went by WhatsApp alone. One
  -- answer a person a day each way: the unsubscribe page's "stop all" writes the STOP and email's own no for one
  -- press (stop_all_messages), and that is one stop.
  consent as (
    select distinct (e.created_at at time zone v_tz)::date as day, e.subject_id, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start
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
      left join playbooks p on p.id = s.playbook_id
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

revoke all on function public.campaign_series(uuid, integer) from public, anon;
grant execute on function public.campaign_series(uuid, integer) to authenticated;

comment on function public.campaign_series(uuid, integer) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies within campaign_reply_window (the customer''s own words: not a call''s note, an automatic reply, a list''s mail or a booking tool''s notice), yeses and stops (an unsubscribe from offers by email among them, 00174; one a person a day each way), day by day over two periods, and the current period by source and by the channel each went by (0030; a row naming none went by WhatsApp).';
