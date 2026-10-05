-- 00285 · A connected call, a person's first moment and an answer are each said once.
--
-- Reports (report_series) and Today (metrics_summary) each wrote their own "a call that connected" (status is not
-- not_connected, which counted a call that errored before anyone spoke) and their own "when a person first reached
-- us" (Reports kept the erased, Today did not). And first_replies (00250), their one rule for who answered, took a
-- broadcast's, a playbook's or a reach-out's send for the owner's answer, because those are written as 'human'.
-- Now each is one function the reports read (the Reports lenses spec, A3, A4, A6; automated_send says which sends
-- those are, for first_replies and both reports), and first_replies returns the
-- hold each answer waited (messages.meta.delay_ms, stamped as the reply is queued), so a report can say how fast
-- the receptionist was apart from the hold the owner set (A1). first_replies' columns change, so it is dropped and
-- made again; report_series and metrics_summary call it by name at run time and read it as before.

create or replace function public.call_connected(p_status text, p_duration_ms integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- Someone spoke: the call is under way or ended, or it errored after it had a length.
  select coalesce(p_status in ('ongoing', 'ended') or (p_status = 'error' and coalesce(p_duration_ms, 0) > 0), false)
$$;

revoke all on function public.call_connected(text, integer) from public, anon;
grant execute on function public.call_connected(text, integer) to authenticated, service_role;

create or replace function public.automated_send(p_meta jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- A send written as 'human' that no person made; it lists every source packages/core/src/deliver.ts treats as automated.
  select coalesce(p_meta->>'source', '') in ('broadcast', 'reach_out')
$$;

revoke all on function public.automated_send(jsonb) from public, anon;
grant execute on function public.automated_send(jsonb) to authenticated, service_role;

create or replace function public.contact_first_moments(p_tenant_id uuid)
returns table (contact_id uuid, first_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  -- Each person's first word or connected call, whichever came first. Absent: the erased (a deletion is never
  -- growth, 00026), a person whose history was imported (no true first moment), and a person with neither (00254).
  -- Each aggregate runs once per contact, in its own lateral, so the first moment is read once and filtered on.
  select c.id as contact_id, least(msg.at, call.at) as first_at
    from contacts c
    left join lateral (select min(m.channel_ts) as at from messages m where m.contact_id = c.id) msg on true
    left join lateral (select min(k.started_at) as at from calls k
                        where k.contact_id = c.id and public.call_connected(k.status, k.duration_ms)) call on true
   where c.tenant_id = p_tenant_id
     and c.erased_at is null
     and least(msg.at, call.at) is not null
     and not exists (select 1 from messages b
                      where b.contact_id = c.id
                        and coalesce(b.meta->>'backfill', 'false') = 'true')
$$;

revoke all on function public.contact_first_moments(uuid) from public, anon;
grant execute on function public.contact_first_moments(uuid) to authenticated, service_role;

drop function if exists public.first_replies(uuid, timestamptz);

create function public.first_replies(p_tenant_id uuid, p_start timestamptz)
returns table (
  asked_at        timestamptz,
  conversation_id uuid,
  ai_at           timestamptz,
  human_at        timestamptz,
  who             text,
  ai_seconds      numeric,
  ai_hold_s       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  asks as (
    select m.created_at as asked_at, m.conversation_id
      from real_msgs m
     where m.created_at >= p_start
       and m.direction = 'inbound' and m.sender = 'customer'
  ),
  -- when each outbound row actually LEFT: the send event for the queued path, the row itself for an immediate send
  sent as not materialized (
    select o.id, o.conversation_id, o.sender, o.created_at,
           coalesce((select min(e.created_at) from events e
                      where e.tenant_id = p_tenant_id
                        and e.kind = 'message.sent'
                        and e.subject_type = 'message'
                        and e.subject_id = o.id), o.created_at) as sent_at,
           -- the hold the owner set, as the reply was queued (draft-queue.ts); none for a reply sent at once
           case when jsonb_typeof(o.meta->'delay_ms') = 'number'
                then (o.meta->>'delay_ms')::numeric / 1000.0 else 0 end as hold_s,
           -- written as 'human' and nobody's answer (00285)
           public.automated_send(o.meta) as automated
      from real_msgs o
     where o.direction = 'outbound'
       and o.status in ('sent', 'delivered', 'read')
  ),
  firsts as (
    select a.asked_at, a.conversation_id, ai.sent_at as ai_at, ai.hold_s,
           (select min(s.sent_at) from sent s
             where s.conversation_id = a.conversation_id and s.sender = 'human' and not s.automated
               and s.created_at > a.asked_at) as human_at
      from asks a
      left join lateral (
        select s.sent_at, s.hold_s from sent s
         where s.conversation_id = a.conversation_id and s.sender = 'ai' and s.created_at > a.asked_at
         order by s.sent_at
         limit 1
      ) ai on true
  )
  select asked_at, conversation_id, ai_at, human_at,
         case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
              when human_at is not null then 'you'
              else 'none' end as who,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then extract(epoch from (ai_at - asked_at)) end as ai_seconds,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then hold_s end as ai_hold_s
    from firsts
$$;

revoke all on function public.first_replies(uuid, timestamptz) from public, anon;
grant execute on function public.first_replies(uuid, timestamptz) to authenticated, service_role;
