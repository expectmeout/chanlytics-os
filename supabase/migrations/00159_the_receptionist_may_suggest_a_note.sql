-- 00159 · The receptionist may suggest a note.
--
-- docs/decisions/0007-person-notes.md, phase 2. Never after every message:
-- once per call, when its analysis is in, and once per quiet spell of a
-- conversation, when the customer's messages since the last look have gone
-- quiet for six hours. Each is looked at once -- a stamp on the call, a stamp
-- on the conversation -- and a look usually ends with nothing. The edge reads
-- a batch through note_candidates, which stamps what it hands over, asks the
-- model and the checks (contracts note-suggest.ts), and writes what passes
-- through 00157's person_note_suggest, where it waits for Keep or Dismiss.
--
-- A thread's suggestion is keyed by the newest customer message it read, not
-- the conversation: a person has one conversation for life, and 00157's "once
-- per source" would otherwise be once per person forever.

/* ---------------------------------------------------------- 1. the stamps -- */

alter table public.calls add column if not exists note_checked_at timestamptz;
alter table public.conversations add column if not exists note_checked_at timestamptz;
comment on column public.calls.note_checked_at is
  'When the note sweep looked at this call (0007): once, after its analysis; null until then.';
comment on column public.conversations.note_checked_at is
  'When the note sweep last read this conversation (0007): it reads again only after newer customer messages have gone quiet.';

create index if not exists calls_note_unchecked
  on public.calls (ended_at) where note_checked_at is null and notified_at is not null;
create index if not exists conversations_note_recent
  on public.conversations (last_inbound_at) where last_inbound_at is not null;

/* --------------------------------------------------- 2. what is worth a look -- */

-- The looks the sweep may take now, each stamped as it is handed over, so a
-- look is taken once however the request ends. Calls: analysed, answered by
-- the receptionist, within three days, on a live person. Conversations: a
-- customer message newer than the last look, the newest older than six hours
-- and younger than seven days. Active workspaces only. Each row carries what
-- the gates need: the turns, the notes already there, do-not-contact, when
-- the receptionist last suggested one on them, and the workspace's day.
create or replace function public.note_candidates(p_limit integer default 20)
returns table (
  source          text,
  tenant_id       uuid,
  contact_id      uuid,
  source_id       uuid,
  seconds         integer,
  dnc             boolean,
  last_suggested  timestamptz,
  workspace_today integer,
  turns           jsonb,
  known           jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  return query
  with picked_calls as (
    update calls c set note_checked_at = now()
     where c.id in (
       select c2.id from calls c2
         join tenants t on t.id = c2.tenant_id and t.status = 'active'
        where c2.note_checked_at is null and c2.notified_at is not null
          and c2.contact_id is not null and c2.direction = 'inbound'
          and c2.ended_at > now() - interval '3 days'
        order by c2.ended_at
        limit v_limit
        for update of c2 skip locked
     )
    returning c.id, c.tenant_id, c.contact_id, c.duration_ms, c.transcript_object
  ),
  picked_threads as (
    -- The stamp's previous value (was) is where this read starts: only what
    -- was said since the last look is read again.
    update conversations v set note_checked_at = now()
      from (
        select v2.id, v2.note_checked_at as was from conversations v2
          join tenants t on t.id = v2.tenant_id and t.status = 'active'
         where v2.last_inbound_at is not null
           and v2.last_inbound_at < now() - interval '6 hours'
           and v2.last_inbound_at > now() - interval '7 days'
           and (v2.note_checked_at is null or v2.note_checked_at < v2.last_inbound_at)
         order by v2.last_inbound_at
         limit v_limit
         for update of v2 skip locked
      ) s
     where v.id = s.id
    returning v.id, v.tenant_id, v.contact_id, s.was
  ),
  looks as (
    select 'call'::text as source, pc.tenant_id, pc.contact_id, pc.id as source_id,
           (coalesce(pc.duration_ms, 0) / 1000)::integer as seconds,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'who', case when x->>'role' = 'user' then 'customer' else 'business' end,
                      'text', x->>'content') order by ord)
               from jsonb_array_elements(coalesce(pc.transcript_object, '[]'::jsonb)) with ordinality as e(x, ord)
              where x->>'role' in ('user', 'agent') and coalesce(x->>'content', '') <> ''
           ), '[]'::jsonb) as turns
      from picked_calls pc
    union all
    select 'thread', pt.tenant_id, pt.contact_id,
           (select m.id from messages m
             where m.conversation_id = pt.id and m.direction = 'inbound' and m.sender = 'customer'
             order by m.created_at desc limit 1),
           null::integer,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'who', case when m.sender = 'customer' then 'customer' else 'business' end,
                      'text', m.body) order by m.created_at)
               from (
                 select m2.sender, m2.body, m2.created_at from messages m2
                  where m2.conversation_id = pt.id
                    and m2.type = 'text' and m2.sender <> 'system' and coalesce(m2.body, '') <> ''
                    and m2.created_at > coalesce(pt.was, now() - interval '7 days')
                  order by m2.created_at desc
                  limit 40
               ) m
           ), '[]'::jsonb)
      from picked_threads pt
  )
  select l.source, l.tenant_id, l.contact_id, l.source_id, l.seconds,
         coalesce(k.dnc, false),
         (select max(e.created_at) from events e
           where e.tenant_id = l.tenant_id and e.kind = 'contact.note_suggested'
             and e.subject_type = 'contact' and e.subject_id = l.contact_id),
         (select count(*)::integer from events e
           where e.tenant_id = l.tenant_id and e.kind = 'contact.note_suggested'
             and e.created_at > now() - interval '1 day'),
         l.turns,
         coalesce((select jsonb_agg(n.body order by n.created_at desc) from person_notes n
                    where n.contact_id = l.contact_id), '[]'::jsonb)
    from looks l
    join contacts k on k.id = l.contact_id and k.erased_at is null and k.merged_into_contact_id is null
   where l.source_id is not null;
end $$;

revoke execute on function public.note_candidates(integer) from public, anon, authenticated;
grant execute on function public.note_candidates(integer) to service_role;
comment on function public.note_candidates(integer) is
  'The note sweep''s batch (0007): calls whose analysis is in and quiet conversations with customer messages newer than the last look, each stamped as it is handed over (looked at once), with the turns, the notes already there, do-not-contact, the last suggestion on the person and the workspace''s count today. Service role only.';

/* --------------------------------------------------------- 3. the clock -- */

-- Every thirty minutes the clock asks the edge only when there is something to
-- look at, and records that it looked otherwise.
create or replace function public.trigger_notes_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from calls c
        where c.note_checked_at is null and c.notified_at is not null and c.contact_id is not null
          and c.direction = 'inbound' and c.ended_at > now() - interval '3 days'
     ) or exists (
       select 1 from conversations v
        where v.last_inbound_at < now() - interval '6 hours'
          and v.last_inbound_at > now() - interval '7 days'
          and (v.note_checked_at is null or v.note_checked_at < v.last_inbound_at)
     ) then
    return public.request_sweep('notes', '/api/cron/notes');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('notes', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_notes_sweep() from public, anon, authenticated;
comment on function public.trigger_notes_sweep() is
  'The note sweep''s clock (0007). Calls the edge (/api/cron/notes) only when a call or a quiet conversation is waiting for its look; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every thirty minutes, recording itself each time: ninety minutes is three missed ticks.
  ('notes', 'notes-sweep', interval '90 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('notes-sweep') where exists (select 1 from cron.job where jobname = 'notes-sweep');
select cron.schedule('notes-sweep', '*/30 * * * *', $$select public.trigger_notes_sweep()$$);
