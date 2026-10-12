-- 00409 · A STOP is news and no wait; a notice keeps its mail owed (decision 0048).
--
-- A customer's typed STOP opened an `opt_out` hold, which sat in Needs you, Today's queue and the badge until a member
-- pressed Resolve, and sent a mail that is always sent and a push, about something nobody can do. A STOP is news now: the
-- receptionist records the answer as ever (ingest_inbound writes the consent and its contact.consent_changed event in the
-- message's own transaction) and opens no hold; the owner is told once, on the bell, from that event, whichever door wrote
-- it: a typed STOP, the unsubscribe link and its "Stop all messages", a complaint, a carrier's late STOP, WhatsApp's 131050
-- (core SUBSCRIBERS.consent_notice). A notice also keeps its mail separate from its row and its push: the row and the
-- phones go at once, and a mail that fails is owed, so a mail provider that is down costs the owner the mail alone.
--
--   notifications.mail_due_at      when a kept notice's mail became owed: set with the row when a mail is to go, cleared when
--                                  it has gone. Null for a notice nothing owes. A retry of the notice finds the row (by the
--                                  event it answers) and sends the mail alone, so the bell keeps no twin and the phones are
--                                  not told twice.
--   notifications_kind_check       00345's list, with `opted_out`: a customer asked to stop, a line on the bell; the mail is the
--                                  business's choice and no phone is told (contracts NOTIFICATION_DELIVERY, ALERT_TOPICS).
--   event_subscriptions            contact.consent_changed -> consent_notice, in lane 2 (bulk: news for the bell, nobody waiting, and
--                                  an import that records a thousand answers hands the subscriber a thousand events, which a
--                                  reply or a person waiting must never queue behind).
--   campaign_stuck                 00406's, with what the thread's open hold is for, so a hold that waits on nobody (an `opt_out`
--                                  opened before this) is not counted by the Campaigns lens as a reply waiting on a person
--                                  (contracts waitsOnAPerson, read by the reader). No row is written over: the readers
--                                  ignore the reason.
--
-- Deploy order: this migration first. An edge from before opens an `opt_out` hold as it did and the dashboard counts it as a
-- wait until the new readers ship; a consent event delivered to a subscriber the edge does not know yet is kept for the edge
-- that does (a delivery to an unknown subscriber is kept, as an unknown kind is, 00334), and told then. Re-runnable.

set local lock_timeout = '3s';

alter table public.notifications add column if not exists mail_due_at timestamptz;
comment on column public.notifications.mail_due_at is
  'When this notice''s mail became owed (decision 0048, 00409): set with the row when a mail is to go, cleared once it has gone, so a retry sends the mail alone and the bell keeps one row. Null for a notice nothing owes.';

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out'));

insert into public.event_subscriptions (kind, subscriber, lane)
values ('contact.consent_changed', 'consent_notice', 2)
on conflict (kind, subscriber) do nothing;

/* ------------------------------------------------------------------------------- campaign_stuck, with the hold's reason -- */

create or replace function public.campaign_stuck(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
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
    select b.id, b.name, b.playbook_id, b.run_for, b.created_at, b.recipient_count,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.playbook_id is not null then 'moment'
                else 'broadcast' end       as kind,
           b.audience ->> 'trigger'        as run_trigger,
           b.audience ->> 'kind'           as audience_kind
      from broadcasts b
     where b.tenant_id = p_tenant_id
       and b.state = 'pending_approval'
     order by b.created_at, b.id
     limit 500
  ),

  -- Failed in the last 30 days: the newest 500, told by a failure of ours. A run is made up to the lead before it ends.
  failed as (
    select b.id, b.name,
           case when b.audience ->> 'kind' = 'reach_out' then 'reach_out'
                when b.audience ->> 'kind' = 'playbook' or b.playbook_id is not null then 'moment'
                else 'broadcast' end       as kind,
           case when b.failure ~ '^[a-z_]+(:[a-z]+)?$' then b.failure else 'other' end as failure,
           coalesce(b.finished_at, b.updated_at) as finished_at
      from broadcasts b
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
          from broadcasts b
          join broadcast_recipients r on r.broadcast_id = b.id and r.tenant_id = p_tenant_id
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

revoke all on function public.campaign_stuck(uuid) from public, anon;
grant execute on function public.campaign_stuck(uuid) to authenticated, service_role;

comment on function public.campaign_stuck(uuid) is
  'Reports › Campaigns, what is stuck as it stands now (no window): the runs waiting for an OK (any kind, with the facts the day rule reads), the runs that failed in the last 30 days (a failure of ours, else other), the threads that answered a moment or a broadcast within the reply window and may wait on a person (needs_human, any pause or an open escalation: wider than standingOfThread''s flagged, on purpose, with the facts the rule reads, among them what the open hold is for), and the WhatsApp messages Meta paused, disabled or rejected. Facts, never verdicts, and nothing a person or a provider wrote. Each list at most 500, the messages 100. SECURITY INVOKER: the caller''s RLS decides what a member reads (00406, 00409).';
