-- 00400 · What is stuck in a workspace's campaigns is read as it stands (Reports, the Campaigns lens).
--
-- campaign_ledger (00399) reads a window. What is stuck is in none: a run waits for an OK whatever the day, a thread that
-- answered a campaign waits until somebody answers it, a message Meta stopped stays stopped until it is put right. This is
-- the lens's own read of that, `campaign_stuck(p_tenant_id)`: one statement, under the caller's RLS (SECURITY INVOKER),
-- as of now, with no window and no period before, and each list at most 500 as receptionist_series' `stuck` is (00380),
-- the messages at most 100.
--
-- It ships facts and never a verdict. Whether an approval is too late (the day rule, contracts' runApprovalRefusal),
-- whether a thread waits on a person (standingOfThread) and whether the number can send (numberHealth) are said once, in
-- TypeScript, by the reader; this hands over the columns those rules read. No name, number, address or word a person or a
-- provider wrote leaves it: a run's failure comes out as a code of ours or `other` (00399's rule), a thread as its state.
--
--   runs_waiting  The workspace's runs in `pending_approval`, of any kind (a reach-out step's too: the reader sorts them by
--                 `kind`, told as campaign_ledger tells it: from the audience first, `playbook_id` only where the audience
--                 says nothing, since a deleted playbook sets it to null), oldest first, with what the day rule reads: `playbook_id`, `run_for`, the
--                 audience's `kind` and `trigger`; and when the run was made and how many people it was made for.
--   runs_failed   The runs that failed in the last 30 days, of any kind, newest first, by `finished_at` or, where a run
--                 has none, the last time its row was touched (`finished_at` here says that). The window is driven from
--                 broadcasts_tenant_created: a run is made up to campaign_run_lead() before it ends.
--   replies       The threads of the people a moment or a broadcast sent to in the last 30 days (`sent`, by `sent_at`) who
--                 answered it in their own words within the reply window (campaign_ledger's probe, run_counts' shape: the
--                 first inbound person's words after the send, fenced by `offset 0` and naming no workspace) and may now
--                 wait on a person: the conversation is `needs_human`, or has any pause (a pause that is over too), or an
--                 escalation is open on it. That is wider than standingOfThread's `flagged` on purpose, so the 500 are not
--                 spent on threads nobody could be waiting on, and a rule that moves in TypeScript cannot be missed here;
--                 reports/campaigns/campaign-stuck.db.test.mjs holds the superset against every combination. Their state,
--                 pause, assignee and whether an escalation is open, for the reader to judge; and when the thread last
--                 answered a campaign (the latest of its sends' first replies). Oldest first. A reach-out step's sends
--                 are no recipient rows, and a run of that kind is never read here.
--   templates     Any WhatsApp message of the workspace (a template, used by a run or not: a message Meta stopped is news)
--                 that is not hidden and that Meta `paused`, `disabled` or `rejected`, by name and language.
--
-- The number's health is not here: the reader takes it from the channel's own config. Either deploy order works: the
-- dashboard says "no read yet" in words for a function the database lacks (isMissingDoor), and nothing else reads this.
-- Re-runnable: `create or replace`, the grants and the comment said again.

set local lock_timeout = '3s';

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
  -- applied before the probe, so only those threads are looked into; the probe is campaign_ledger's, once per send.
  reached as (
    select s.conversation_id, s.state, s.paused_until, s.assignee_user_id, s.open_escalation, f.at as first_reply_at
      from (
        select m.conversation_id, r.sent_at, c.state, c.paused_until, c.assignee_user_id,
               exists (select 1 from escalations e where e.conversation_id = c.id and e.state = 'open') as open_escalation
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
    select r.conversation_id, r.state, r.paused_until, r.assignee_user_id, r.open_escalation,
           max(r.first_reply_at) as replied_at
      from reached r
     group by r.conversation_id, r.state, r.paused_until, r.assignee_user_id, r.open_escalation
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
                           'open_escalation', t.open_escalation, 'replied_at', t.replied_at)
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
  'Reports › Campaigns, what is stuck as it stands now (no window): the runs waiting for an OK (any kind, with the facts the day rule reads), the runs that failed in the last 30 days (a failure of ours, else other), the threads that answered a moment or a broadcast within the reply window and may wait on a person (needs_human, any pause or an open escalation: wider than standingOfThread''s flagged, on purpose, with the facts the rule reads), and the WhatsApp messages Meta paused, disabled or rejected. Facts, never verdicts, and nothing a person or a provider wrote. Each list at most 500, the messages 100. SECURITY INVOKER: the caller''s RLS decides what a member reads (00400).';
