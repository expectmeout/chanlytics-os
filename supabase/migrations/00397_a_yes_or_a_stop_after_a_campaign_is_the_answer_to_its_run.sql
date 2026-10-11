-- 00397 · A yes or a stop after a campaign is the answer to its run (Reports › Campaigns, the Campaigns home).
--
-- campaign_series (00051, 00174, 00251, 00320, 00329, 00360, 00374) counted its yeses and stops off the workspace's whole
-- consent ledger, once a person a day each way, so "N said yes · M asked to stop" said what the workspace's people did and
-- not what its campaigns earned (a yes at the desk, a merge restating an answer, a STOP in a thread no campaign reached were
-- all in it). Now a yes or a stop is the answer to a campaign run, and a person counts once a period.
-- campaign_answers(p_tenant_id, p_since, p_until) says, for each run and each live person it reached (a `sent` recipient),
-- the latest consent event (`opted_in` or `opted_out`, source not `merge` or `stop`) that was theirs to give it, for the ones
-- that came in [p_since, p_until). campaign_series is 00374's with one change, its `consent` CTE (and `v_cur_start`, the
-- current period's first instant in the workspace's zone): a person's earliest answer of each kind in a period, on its day.
-- People keeps every yes and stop of its purposes (people_series, 00395); a purpose it has no word for is a conversational
-- answer here, and none there.
--
-- The rule is contracts' answersToRuns (broadcasts/run-answers.ts, which a run's sheet reads), restated here and held equal to
-- it by campaign-answers.db.test.mjs. An event answers the run its key names, whenever it came, and no other: an unsubscribe,
-- complaint or reply no to offers by email names the outbound email (`message_id`), a carrier or WhatsApp event of either
-- consent the refused send (`message_external_id`); a key is a JSON string compared as text, and one that finds no send of the
-- person answers no run. Any other event answers each send of the person it came after, within campaign_reply_window(), an
-- answer about offers by email only a send that went by email. Per run the latest stands: the window's bound and the order of
-- "the latest" read an event's instant to the millisecond (`date_trunc`, as the rule's `Date.parse` does), the greater event id
-- as text breaks a tie, and the caller's p_since and p_until are compared as given. A keyed answer belongs to its send whenever
-- it came, so the keyed events from p_since on are read whatever their date, and a past window can lose a yes to a later keyed
-- stop: a window holds the answer as it stands now, dated by its own time.
--
-- Either deploy order works: campaign_series keeps its shape, only its two counts move. Re-runnable: `create or replace`,
-- the grants and comments said again.

set local lock_timeout = '3s';

create or replace function public.campaign_answers(p_tenant_id uuid, p_since timestamptz, p_until timestamptz)
returns table (
  broadcast_id uuid,
  contact_id uuid,
  event_id uuid,
  at timestamptz,
  consent text,
  purpose text,
  exact boolean
)
language sql
stable
security invoker
set search_path = ''
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
    select r.broadcast_id, v.contact_id, v.id as event_id, v.created_at as at, v.ms, v.consent, v.purpose
      from ev v
      join public.broadcast_recipients r
        on r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent'
       and r.message_id::text = v.key_mail
     where v.key_mail is not null
    union all
    select r.broadcast_id, v.contact_id, v.id, v.created_at, v.ms, v.consent, v.purpose
      from ev v
      join public.messages m
        on m.tenant_id = p_tenant_id and m.external_id = v.key_wire
      join public.broadcast_recipients r
        on r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent' and r.message_id = m.id
     where v.key_wire is not null
  ),
  -- Every other event belongs to each send of the person it came after, within the reply window; an answer about offers
  -- by email, to a send that went by email.
  by_time as (
    select r.broadcast_id, v.contact_id, v.id as event_id, v.created_at as at, v.ms, v.consent, v.purpose
      from ev v
      join public.broadcast_recipients r
        on r.tenant_id = p_tenant_id and r.contact_id = v.contact_id and r.state = 'sent'
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
revoke execute on function public.campaign_answers(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.campaign_answers(uuid, timestamptz, timestamptz) to authenticated, service_role;
comment on function public.campaign_answers(uuid, timestamptz, timestamptz) is
  'What each person answered each campaign run: for every run (broadcast) and person it reached (a recipient in state sent, a live person) that has one, the latest yes or stop (a contact.consent_changed event, consent opted_in or opted_out, source not merge or stop) that was theirs to give it, for the ones whose instant falls in [p_since, p_until). An event answers the run its key names (an unsubscribe, complaint or reply no to offers by email: message_id; a carrier or WhatsApp event of either consent: message_external_id; exact), whenever it came, and no other; every other event answers each send of the person it came after within campaign_reply_window, offers by email only a send that went by email. The rule contracts'' answersToRuns says in TypeScript, held equal by campaign-answers.db.test.mjs; the events up to the reply window past p_until are read too, and any event that carries a key from p_since on, whenever it came after it, so the window''s end never changes which answer stands for a run: a window holds the answer as it stands now, dated by its own time. Security invoker: row security decides what is read.';

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)
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
       and r.sent_at >= v_start and r.sent_at < v_stop
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
  -- A yes or a stop is an answer to a campaign (00397): what a person said to a run that reached them, from the desk or in
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

revoke all on function public.campaign_series(uuid, integer, date) from public, anon;
grant execute on function public.campaign_series(uuid, integer, date) to authenticated, service_role;

comment on function public.campaign_series(uuid, integer, date) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies within campaign_reply_window (the customer''s own words: not a call''s note, an automatic reply, a list''s mail or a booking tool''s notice), yeses and stops (a yes or a stop is an answer to a campaign run, public.campaign_answers, 00397: once a person and period, on the day of the earliest; an unsubscribe from offers by email among them, 00174), day by day over two periods, and the current period by source and by the channel each went by (0030; a row naming none went by WhatsApp). `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';
