-- 00174 · A person may unsubscribe from a business's email.
--
-- Reach out, Part 2 (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6-§4.8; the plan is
-- docs/superpowers/plans/2026-09-25-reach-out-part-2-the-wire.md): every campaign email carries a one-click
-- unsubscribe (RFC 8058), and a press of it is honoured by the database, for every later send and every later
-- search. Email marketing is its own answer, apart from the two consent columns: US law lets a business write to
-- another business until it is told to stop (CAN-SPAM), so it starts "not asked", and the one thing a person can
-- say to it here is no.
--
--   contacts.email_marketing   unknown | opted_in | opted_out, with its source and when.
--   set_email_marketing(...)    the door an unsubscribe goes through. Service role only: the public page holds no
--                               session. It records the no, puts the address on the workspace's never-again list
--                               (lead_suppressions, email_opt_out) so no search mails it again, and closes the
--                               leads still being written to as said no (the canvas's states board). A converted
--                               lead keeps its stage; the send door refuses it anyway.
--   campaign_series(...)         Reports › Campaigns stops counting an email unsubscribe as a STOP.

set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists email_marketing text not null default 'unknown',
  add column if not exists email_marketing_source text,
  add column if not exists email_marketing_updated_at timestamptz;

alter table public.contacts drop constraint if exists contacts_email_marketing_check;
alter table public.contacts add constraint contacts_email_marketing_check
  check (email_marketing in ('unknown', 'opted_in', 'opted_out'));

comment on column public.contacts.email_marketing is
  'Whether this person may be sent marketing email (a reach-out, an offer): unknown until they say, opted_out once they unsubscribe. Apart from consent and marketing_consent, which are the texting and WhatsApp answers.';

create or replace function public.set_email_marketing(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_state text,
  p_source text,
  p_message_id uuid default null,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business text;
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_sent_to  text;
  v_address  text;
  v_lead     record;
begin
  -- One answer a public page can be trusted with: no, from an unsubscribe link. "No thanks" in a reply (Part 5)
  -- and a member's own reset widen this door when they arrive.
  if p_state is distinct from 'opted_out' or p_source is distinct from 'unsubscribe' then
    raise exception 'set_email_marketing records an unsubscribe: opted_out, from unsubscribe' using errcode = '22023';
  end if;
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  -- A person who is gone, or asked to be forgotten, receives nothing already: nothing is written about them.
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;

  if v_contact.email_marketing is distinct from 'opted_out' then
    update public.contacts
       set email_marketing = 'opted_out', email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    -- The door's own facts are written last, so no evidence handed in can say another purpose or answer.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            coalesce(p_evidence, '{}'::jsonb)
            || jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_out', 'source', p_source)
            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
    v_changed := true;
  end if;

  -- The address the email itself went to, read off its frozen request (channels buildEmailRequest), when that
  -- email is this person's: an address changed between the send and the press is still the one that said stop.
  if p_message_id is not null then
    select lower(btrim(coalesce(m.meta->'email'->'request'->'to'->>0, m.meta->'email'->>'to'))) into v_sent_to
      from public.messages m
     where m.id = p_message_id and m.tenant_id = p_tenant_id and m.contact_id = p_contact_id
       and m.channel = 'email' and m.direction = 'outbound';
  end if;

  -- The never-again list, by each address as it is stored (lower-cased, 00125): the finder drops a suppressed
  -- address from every lead it finds later (core leads runner), and the audience (Part 3) skips it.
  for v_address in
    select distinct a from unnest(array[v_contact.email, v_sent_to]) as a where coalesce(a, '') <> ''
  loop
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_address), 'email_opt_out')
    on conflict (tenant_id, kind, hash) do nothing;
  end loop;

  -- The leads still being written to are closed as said no, each with its event. No lead_operations row: the
  -- person's own stop is not the owner's to undo, and the version moves, so an undo of an older step is refused.
  for v_lead in
    update public.leads
       set stage = 'archived', closed_reason = 'said_no', version = version + 1
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and stage in ('ready', 'nurture') and erased_at is null and blanked_at is null
    returning id
  loop
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
            jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', 'unsubscribe'));
  end loop;

  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;

revoke execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) to service_role;
comment on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) is
  'The unsubscribe door (Reach out, Part 2): records opted_out from unsubscribe, once (a repeat changes nothing and writes no second event), puts the person''s address and the one the named email went to on lead_suppressions (email_opt_out), and closes the person''s ready and nurture leads as said_no. Service role only.';

/* ------------------------------------------------ Reports › Campaigns -- */

-- An unsubscribe from email is no answer to a WhatsApp campaign: counted as one, "N people asked to stop" would
-- say a cold email's unsubscribe was a STOP to the offers (the dashboard's broadcast window skips it too,
-- server/broadcasts.ts). Everything else is 00064's function, unchanged.
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
                      and i.created_at > s.sent_at
                      and i.created_at <= s.sent_at + interval '72 hours')  as replied
      from sent s
  ),
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043). Not email's own answer (00174).
  consent as (
    select (e.created_at at time zone v_tz)::date as day, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start
       and coalesce(e.data->>'purpose', '') <> 'email_marketing'
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
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies, yeses and stops (not an unsubscribe from email, 00174) — day by day over two periods, and the current period by playbook or broadcast. Invoker''s RLS.';
