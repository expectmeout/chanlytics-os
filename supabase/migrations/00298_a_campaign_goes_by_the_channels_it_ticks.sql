-- 00298 · A campaign goes by the channels it ticks.
--
-- One message, every channel, step 3 (docs/2026-10-02-one-message-every-channel.md, 2.3 and 4; the campaigns-on-every-
-- channel spec, 4.2 to 4.5). A campaign, a broadcast or a playbook's run, has gone out on WhatsApp alone. It now ticks the
-- channels it may go by, and each person it reaches is reached ONCE, on one of them, picked at enrolment (contracts'
-- reachFor) and written on their row, so the sender, the run's report and the person's page all say the same channel.
-- Nothing made before changes: every default is WhatsApp, and a recipient written before has no channel, which is WhatsApp.
--
--   playbooks.channels,         the channels a campaign ticks: 'whatsapp', 'sms', 'email', each once, at least one (a CHECK
--   broadcasts.channels         on each). Both default to WhatsApp alone, so every campaign made before goes as it did.
--   broadcast_recipients.channel  the channel that person is reached on (a CHECK: one of the three). NULL is a recipient
--                               written before the channels: WhatsApp.
--   playbooks grants            a member's session writes a playbook's ticks, as it writes the rest of its settings
--                               (00278's insert and 00168's update grants are column lists): channels joins both. The run's
--                               and the recipient's channels are the service role's, written by assemble_broadcast.
--   assemble_broadcast          00282's, taking the run's `channels` (a JSON array; absent is WhatsApp alone, and the
--                               column's CHECK refuses a list that is not the three channels, each once) and each person's
--                               `channel`, which must be one the run ticks (22023 otherwise). A person with no channel is
--                               WhatsApp's, as before the channels, so a run that does not tick WhatsApp may not carry one
--                               and refuses it the same way: a recipient is never sent on a wire the run did not tick.
--                               Everything else, its grants, its tenant and erasure checks and its job, is 00282's.
--   people_list                 returns `last_inbound_channel`, the channel of the last written message they sent, which
--                               the pick reads first, and `email_suppressed_at`, when their address stopped being sent to
--                               (a bounce, a complaint), which the pick reads as no address by email, so a person with a
--                               dead address falls back to another channel instead of being held at the door (recreated
--                               from 00297's: the return type changes, so it is dropped and made again with its grants
--                               and comment).
--   campaign_month_sent(tenant, channel, at)
--                               the campaign messages a workspace sent on a channel this calendar month, in its own zone,
--                               that left, may have left, or wait to go: what its month's allowance on that channel has
--                               spent (contracts' CAMPAIGN_MONTH_ALLOWANCE), as reach_out_month_sent (00187) counts the
--                               cold emails. Read through an index of the campaign messages alone, so a busy workspace's
--                               month of replies is never scanned for it. Service role only.
--
-- Re-runnable: columns say what they are, the CHECKs are dropped and made again, and the functions are replaced.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------- columns -- */

alter table public.playbooks
  add column if not exists channels text[] not null default '{whatsapp}';
alter table public.broadcasts
  add column if not exists channels text[] not null default '{whatsapp}';
alter table public.broadcast_recipients
  add column if not exists channel text;

-- At least one of the three, each once. `<@` refuses a value outside the three and an empty list passes it, so the length
-- is held too; the last line is "no value twice", written without a subquery, which a CHECK may not hold: a list of
-- distinct values among three has as many elements as the values it contains.
alter table public.playbooks drop constraint if exists playbooks_channels_check;
alter table public.playbooks add constraint playbooks_channels_check
  check (channels <@ array['whatsapp', 'sms', 'email']
         and cardinality(channels) between 1 and 3
         and cardinality(channels) = (channels @> array['whatsapp'])::int + (channels @> array['sms'])::int
                                   + (channels @> array['email'])::int);

alter table public.broadcasts drop constraint if exists broadcasts_channels_check;
alter table public.broadcasts add constraint broadcasts_channels_check
  check (channels <@ array['whatsapp', 'sms', 'email']
         and cardinality(channels) between 1 and 3
         and cardinality(channels) = (channels @> array['whatsapp'])::int + (channels @> array['sms'])::int
                                   + (channels @> array['email'])::int);

alter table public.broadcast_recipients drop constraint if exists broadcast_recipients_channel_check;
alter table public.broadcast_recipients add constraint broadcast_recipients_channel_check
  check (channel is null or channel in ('whatsapp', 'sms', 'email'));

comment on column public.playbooks.channels is
  'The channels this campaign may go by (whatsapp, sms, email, each once, at least one): the composer''s ticks. Each person is reached once, on one of them (contracts'' reachFor). WhatsApp alone by default, as every campaign was before (00298).';
comment on column public.broadcasts.channels is
  'The channels this run ticked (whatsapp, sms, email, each once, at least one), written whole with its people by assemble_broadcast. WhatsApp alone by default, as every run was before (00298).';
comment on column public.broadcast_recipients.channel is
  'The channel this person is reached on, picked once at enrolment (contracts'' reachFor) from the run''s channels. NULL: a recipient written before the channels, which is WhatsApp (00298).';

/* ------------------------------------------------------ the session's ticks -- */

-- Column grants are a list (00168, 00278), and a session that is not granted a column cannot name it: the playbook route
-- inserts and edits through the member's own session. The grant adds to what is held; it takes nothing back.
grant insert (channels), update (channels) on public.playbooks to authenticated;

/* ------------------------------------------------------------ the run, whole -- */

create or replace function public.assemble_broadcast(
  p_tenant uuid,
  p_run jsonb,
  p_recipients jsonb,
  p_send_at timestamptz default null
)
returns uuid
language plpgsql
set search_path = public
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
       select 1 from public.playbooks b where b.id = (p_run->>'playbook_id')::uuid and b.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the playbook is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  insert into public.broadcasts (tenant_id, name, template_id, template_name, template_language, params, audience,
                                 state, scheduled_for, recipient_count, created_by, playbook_id, run_for, channels)
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

  insert into public.broadcast_recipients (broadcast_id, contact_id, tenant_id, facts, channel)
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
revoke execute on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) to service_role;
comment on function public.assemble_broadcast(uuid, jsonb, jsonb, timestamptz) is
  'A broadcast''s run, its people and its send job (when p_send_at is set) in one transaction (core assembleRun): all or none. The service role''s alone: the route''s role check and the sweep are the doors. Every person must be the workspace''s and not erased, and so must its template and its playbook. The run carries the channels it ticks (p_run.channels, a JSON array of whatsapp, sms, email, each once; absent is whatsapp alone) and each person the channel they are reached on (a person''s `channel`, one the run ticks; none is whatsapp, so a run that does not tick it takes none without one): a channel the run did not tick refuses the whole run (22023). Returns the run''s id.';

/* ------------------------------------------------------------- people_list -- */

-- Its return type changes, so the function is dropped and made again, with the grants and the comment 00297 gave it.
drop function if exists public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid);

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0,
                                              p_after_at timestamptz default null, p_after_added timestamptz default null, p_after_id uuid default null)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  -- When that address stopped being sent to (00126: a permanent bounce, a complaint, the provider's own suppression), or
  -- null: a campaign does not pick email for a person whose address is dead, so the door never has to refuse them.
  email_suppressed_at     timestamptz,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  -- The channels each yes covers (00297; null: a yes recorded before they were kept, which covers WhatsApp alone), and
  -- when the receptionist first asked for the yes to offers.
  consent_channels             text[],
  marketing_channels           text[],
  offers_asked_at              timestamptz,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  -- The wire of that message (00298): the channel they last wrote on, which a campaign reaches them on first.
  last_inbound_channel    text,
  last_call_at            timestamptz,
  last_inbound_call_at    timestamptz,
  last_inbound_call_summary text,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  message_channels        text[],
  queued_reply_at         timestamptz,
  came_from               text,
  -- The newest open or current deal (proposed or won), else the newest of any (0004).
  deal_id                 uuid,
  deal_stage              text,
  deal_service            text,
  deal_proposed_at        timestamptz,
  deal_decided_at         timestamptz,
  deal_ended_at           timestamptz,
  deal_amount_cents       integer,
  deal_per                text,
  -- Its link, the last day it stands, and why they passed (0008).
  deal_proposal_url       text,
  deal_valid_until        date,
  deal_lost_reason        text,
  -- The earliest open step on them (0007, amended): by its day, then as it was written.
  step_id                 uuid,
  step_body               text,
  step_due_on             date,
  step_for_user_id        uuid,
  step_deal_id            uuid,
  -- The row's place in the order (0021): when they were last in touch (-infinity for never), and when they were added.
  -- A caller pages on by passing the last row's two and its id as p_after_at, p_after_added and p_after_id.
  in_touch_at             timestamptz,
  added_at                timestamptz
)
language sql
stable
set search_path = public
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
           e.at, e.moved_in as backfill, e.spoken
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
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at, li.channel,
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
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
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
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
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

revoke execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_contact_id names one person, their row alone. The page is chosen before it is read (0021, people_page): its people come from person_moments in one whole order, latest contact first (in_touch_at, -infinity for never), then the newest added (added_at), then the id, falling, at most p_limit (1000) of them after p_offset or after the cursor p_after_at, p_after_added, p_after_id (the last row''s in_touch_at, added_at and id); every other column is read for them alone. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written. `consent_channels` and `marketing_channels` are the channels each yes covers (00297; null: a yes recorded before the channels were kept, which covers WhatsApp alone) and `offers_asked_at` is when the receptionist first asked for the yes to offers. `last_inbound_channel` is the channel of the last written message they sent (whatsapp, sms or email; null when they have sent none): the channel a campaign reaches them on first (00298, contracts'' reachFor). `email_suppressed_at` is when their address stopped being sent to (a bounce, a complaint; null while it is good): a campaign does not pick email for a person who has it.';

/* ---------------------------------------------------------- the month's count -- */

-- Read through an index of the campaign messages alone (00187 does the same for the cold emails), so a busy workspace's
-- month of replies is never scanned for the count.
create index if not exists messages_broadcast_month on public.messages (tenant_id, created_at)
  where meta->>'source' = 'broadcast';

create or replace function public.campaign_month_sent(p_tenant_id uuid, p_channel text, p_at timestamptz default now())
returns int
language sql
stable
security definer
set search_path = public
as $$
  with zone as (
    select coalesce(nullif(btrim(t.timezone), ''), 'America/New_York') as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'broadcast' and m.channel = p_channel and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;
revoke execute on function public.campaign_month_sent(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_month_sent(uuid, text, timestamptz) to service_role;
comment on function public.campaign_month_sent(uuid, text, timestamptz) is
  'The campaign messages (a broadcast''s or a playbook run''s: meta.source broadcast) a workspace sent on a channel this calendar month in its own zone that left, may have left, or wait to go: what its month''s allowance on that channel has spent (00298; reach_out_month_sent counts the cold emails the same way). Service role only.';
