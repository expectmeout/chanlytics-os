-- 00051 · Campaign series: what the offers earned, day by day and by source.
--
-- The twin of report_series (00030–00037) for Campaigns: messages sent by
-- broadcasts and playbook runs, WhatsApp's own delivered and read receipts,
-- who wrote back afterwards, and the people who said yes or asked to stop —
-- by the business's clock, over the requested period AND the one before it,
-- so the page can show a change without a second round trip; plus the
-- current period rolled up by playbook (its runs together) or one-off
-- broadcast. Counts over columns; no score, no estimate. SECURITY INVOKER:
-- the caller's RLS applies to every table it reads.

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
  -- Replied: the customer wrote in that thread after the message went out —
  -- the same rule the Broadcasts page counts by.
  sent_r as (
    select s.*,
           (s.message_status in ('delivered', 'read')) as delivered,
           (s.message_status = 'read')                as was_read,
           exists (select 1 from messages i
                    where i.conversation_id = s.conversation_id
                      and i.direction = 'inbound'
                      and i.created_at > s.sent_at)  as replied
      from sent s
  ),
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043).
  consent as (
    select (e.created_at at time zone v_tz)::date as day, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start
  ),
  per_day as (
    select d.day,
           (select count(*) from sent_r s where s.day = d.day)                                   as sent,
           (select count(*) from sent_r s where s.day = d.day and s.delivered)                   as delivered,
           (select count(*) from sent_r s where s.day = d.day and s.was_read)                    as was_read,
           (select count(*) from sent_r s where s.day = d.day and s.replied)                     as replied,
           (select count(*) from consent c where c.day = d.day and c.consent = 'opted_in')       as opt_ins,
           (select count(*) from consent c where c.day = d.day and c.consent = 'opted_out')      as opt_outs
      from days d
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
               from sources x), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.campaign_series(uuid, integer) from public, anon;
grant execute on function public.campaign_series(uuid, integer) to authenticated;
comment on function public.campaign_series(uuid, integer) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies, yeses and stops — day by day over two periods, and the current period by playbook or broadcast. Invoker''s RLS.';
