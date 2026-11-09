-- 00538 · A reply is drafted when it is owed (decision 0093, amending 0071 E2).
--
-- A thread's draft was written when Today drew its row for a member who acts, so an owner who worked from the Inbox had
-- none, and a change of the rules hid every draft until someone opened Today. Now the hold's own events write it.
--
--   conversation_drafts       Says where a draft stands (state: writing, ready, pitch, asks, failed), what asked for it
--                             (source), the rules' edition (rules, out of its words), what it was handed (used), why it
--                             was not written (why_failed), and how many times it was asked of one message (tries). Told
--                             to its workspace, so a page hears a draft land.
--   conversation_draft_claim  The service role's: the row says writing, once a message, an edition and a kind. Answers
--                             whether this call took it. A failed row is taken only when asked (the sweep, Try again).
--   conversation_draft_write  The service role's: the draft kept, only for the message its row is claimed for, so a slow
--                             run never writes over the newer message's.
--   conversation_draft_keep   Sets the same columns for a dashboard a deploy behind. Nothing new calls it.
--   reply_drafts_due          What the sweep reads: open holds with no draft for their newest message and this edition,
--                             a claim that died, and a failure due another try.
--   escalation_open           Says escalation.refreshed where it found the thread already held: they wrote again, and
--                             the draft answers an older message.
--   the subscriptions         escalation.opened, .changed and .refreshed -> reply_draft, in lane 0.
--   job_kinds                 reply_draft, lane 0, once a thread, kind, message and edition while one waits.
--   drafts-sweep              Every five minutes while a hold is open: what a dropped event, a failed run or a change of
--                             the rules left behind.
--   escalations.details       The sentence that promised "a reply is drafted for you", on every hold that kept it.
--
-- Deploy order: this migration first. A dashboard from before reads the rows it always read, and an edge from before keeps
-- the new subscriber's deliveries until one that knows it comes. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------- 1. a draft says where it stands -- */

alter table public.conversation_drafts add column if not exists state text;
alter table public.conversation_drafts add column if not exists source text;
alter table public.conversation_drafts add column if not exists rules integer;
alter table public.conversation_drafts add column if not exists used text[] not null default '{}'::text[];
alter table public.conversation_drafts add column if not exists why_failed text;
alter table public.conversation_drafts add column if not exists tries smallint not null default 0;

update public.conversation_drafts
   set rules = case when (words ->> 'rules') ~ '^[0-9]+$' then (words ->> 'rules')::integer end,
       state = case
         when kind = 'brief' and jsonb_typeof(words -> 'brief') = 'object' then 'ready'
         when btrim(coalesce(words ->> 'text', '')) <> '' then 'ready'
         when btrim(coalesce(words ->> 'pitch', '')) <> '' then 'pitch'
         when jsonb_array_length(coalesce(nullif(words -> 'asks', 'null'::jsonb), '[]'::jsonb)) > 0 then 'asks'
         else 'failed'
       end,
       source = coalesce(source, 'hold')
 where state is null;

alter table public.conversation_drafts drop constraint if exists conversation_drafts_state_check;
alter table public.conversation_drafts add constraint conversation_drafts_state_check
  check (state = any (array['writing', 'ready', 'pitch', 'asks', 'failed']));
alter table public.conversation_drafts drop constraint if exists conversation_drafts_source_check;
alter table public.conversation_drafts add constraint conversation_drafts_source_check
  check (source = any (array['hold', 'reach_out', 'rewrite']));

comment on column public.conversation_drafts.state is
  'Where the draft stands (00538, decision 0093): writing, ready, pitch (not a customer''s, so no reply was written), asks, failed. Set writing by conversation_draft_claim, the rest by conversation_draft_write.';
comment on column public.conversation_drafts.source is
  'What asked for it: the thread''s hold, a reply to a sequence, a member''s change to it.';
comment on column public.conversation_drafts.rules is
  'The edition of the rules it was written under (contracts REPLY_DRAFT_RULES): one from another edition is no draft, and the sweep writes it again.';
comment on column public.conversation_drafts.used is
  'What the drafter handed the model, as Why this? says it: said by code from its own prompt, never by the model.';
comment on column public.conversation_drafts.why_failed is
  'Why it was not written, where state is failed: a word of contracts ReplyDraftWhy.';
comment on column public.conversation_drafts.tries is
  'How many times it has been asked of this message and edition: the sweep stops at three.';

create or replace function public.conversation_draft_keep(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_words jsonb,
  -- The customer's message the draft answers; none for a thread nothing has come to yet.
  p_for_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.conversation_drafts%rowtype;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule).
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A member who acts: a viewer sends nothing, so nothing is drafted for one.
  if not public.is_acting_member(p_tenant_id) then
    return jsonb_build_object('error', 'not_acting');
  end if;
  if p_kind is null or p_kind not in ('reply', 'brief') then
    raise exception 'conversation_draft_keep: kind is reply or brief' using errcode = '22023';
  end if;
  -- The words are an object of a draft's size: four thousand characters of message and a brief at most.
  if p_words is null or jsonb_typeof(p_words) <> 'object' or octet_length(p_words::text) > 16000 then
    raise exception 'conversation_draft_keep: the words are one draft''s' using errcode = '22023';
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.tenant_id = p_tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- The message it answers is one of the thread's own.
  if p_for_message_id is not null and not exists (
    select 1 from public.messages m
     where m.id = p_for_message_id and m.conversation_id = p_conversation_id and m.tenant_id = p_tenant_id
  ) then
    raise exception 'conversation_draft_keep: the message is the thread''s own' using errcode = '22023';
  end if;
  -- A dashboard a deploy behind (00538): its words say where the draft stands.
  insert into public.conversation_drafts as d
    (tenant_id, conversation_id, kind, for_message_id, words, made_by, made_at, state, source, rules, why_failed)
  values (p_tenant_id, p_conversation_id, p_kind, p_for_message_id, p_words, v_actor, now(),
          case
            when p_kind = 'brief' and jsonb_typeof(p_words -> 'brief') = 'object' then 'ready'
            when btrim(coalesce(p_words ->> 'text', '')) <> '' then 'ready'
            when btrim(coalesce(p_words ->> 'pitch', '')) <> '' then 'pitch'
            when jsonb_array_length(coalesce(nullif(p_words -> 'asks', 'null'::jsonb), '[]'::jsonb)) > 0 then 'asks'
            else 'failed'
          end,
          'hold',
          case when (p_words ->> 'rules') ~ '^[0-9]+$' then (p_words ->> 'rules')::integer end,
          null)
  on conflict on constraint conversation_drafts_one_a_thread_and_kind do update
     set for_message_id = excluded.for_message_id,
         words = excluded.words,
         made_by = excluded.made_by,
         made_at = excluded.made_at,
         state = excluded.state,
         source = excluded.source,
         rules = excluded.rules,
         why_failed = null
  returning * into v_row;
  return jsonb_build_object(
    'conversation_id', v_row.conversation_id,
    'kind', v_row.kind,
    'for_message_id', v_row.for_message_id,
    'words', v_row.words,
    'made_at', v_row.made_at
  );
end $$;

/* ----------------------------------------------------------------------------------- 2. the service role's two doors -- */

create or replace function public.conversation_draft_claim(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_for_message_id uuid,
  p_rules integer,
  p_source text default 'hold',
  -- A row that failed is taken too (the sweep, Try again), and a claim that died before this moment.
  p_again boolean default false,
  p_stale_before timestamp with time zone default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_took uuid;
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.tenant_id = p_tenant_id) then
    return false;
  end if;
  insert into public.conversation_drafts as d
    (tenant_id, conversation_id, kind, for_message_id, words, made_by, made_at, state, source, rules, used, why_failed, tries)
  values (p_tenant_id, p_conversation_id, p_kind, p_for_message_id, '{}'::jsonb, null, now(),
          'writing', p_source, p_rules, '{}'::text[], null, 1)
  on conflict on constraint conversation_drafts_one_a_thread_and_kind do update
     set for_message_id = excluded.for_message_id,
         words = '{}'::jsonb,
         made_by = null,
         made_at = now(),
         state = 'writing',
         source = excluded.source,
         rules = excluded.rules,
         used = '{}'::text[],
         why_failed = null,
         tries = case
           when d.for_message_id is not distinct from excluded.for_message_id and d.rules is not distinct from excluded.rules
             then d.tries + 1
           else 1
         end
   where d.for_message_id is distinct from excluded.for_message_id
      or d.rules is distinct from excluded.rules
      or (p_again and d.state = 'failed')
      or (d.state = 'writing' and p_stale_before is not null and d.made_at < p_stale_before)
  returning d.id into v_took;
  return v_took is not null;
end $$;
revoke all on function public.conversation_draft_claim(uuid, uuid, text, uuid, integer, text, boolean, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.conversation_draft_claim(uuid, uuid, text, uuid, integer, text, boolean, timestamp with time zone) to service_role;
comment on function public.conversation_draft_claim(uuid, uuid, text, uuid, integer, text, boolean, timestamp with time zone) is
  'A thread''s draft says it is being written, once a message, kind and edition (00538, decision 0093): true when this call took it. A row for this message and edition is left alone, unless it failed and this asks again, or its claim is older than p_stale_before.';

create or replace function public.conversation_draft_write(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_for_message_id uuid,
  p_state text,
  p_words jsonb,
  p_source text,
  p_rules integer,
  p_used text[] default '{}'::text[],
  p_why_failed text default null,
  p_made_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.conversation_drafts%rowtype;
begin
  if p_words is null or jsonb_typeof(p_words) <> 'object' or octet_length(p_words::text) > 16000 then
    raise exception 'conversation_draft_write: the words are one draft''s' using errcode = '22023';
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.tenant_id = p_tenant_id) then
    return null;
  end if;
  insert into public.conversation_drafts as d
    (tenant_id, conversation_id, kind, for_message_id, words, made_by, made_at, state, source, rules, used, why_failed, tries)
  values (p_tenant_id, p_conversation_id, p_kind, p_for_message_id, p_words, p_made_by, now(),
          p_state, p_source, p_rules, coalesce(p_used, '{}'::text[]), p_why_failed, 1)
  on conflict on constraint conversation_drafts_one_a_thread_and_kind do update
     set words = excluded.words,
         made_by = excluded.made_by,
         made_at = excluded.made_at,
         state = excluded.state,
         source = excluded.source,
         rules = excluded.rules,
         used = excluded.used,
         why_failed = excluded.why_failed
   where d.for_message_id is not distinct from excluded.for_message_id
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'conversation_id', v_row.conversation_id,
    'kind', v_row.kind,
    'for_message_id', v_row.for_message_id,
    'words', v_row.words,
    'made_at', v_row.made_at,
    'state', v_row.state,
    'source', v_row.source,
    'rules', v_row.rules,
    'used', to_jsonb(v_row.used),
    'why_failed', v_row.why_failed
  );
end $$;
revoke all on function public.conversation_draft_write(uuid, uuid, text, uuid, text, jsonb, text, integer, text[], text, uuid) from public, anon, authenticated;
grant execute on function public.conversation_draft_write(uuid, uuid, text, uuid, text, jsonb, text, integer, text[], text, uuid) to service_role;
comment on function public.conversation_draft_write(uuid, uuid, text, uuid, text, jsonb, text, integer, text[], text, uuid) is
  'A thread''s draft kept (00538, decision 0093), only over a row for the same message: a slow run answers null rather than write over the newer message''s claim.';

create or replace function public.reply_drafts_due(p_rules integer, p_limit integer default 50)
returns table (tenant_id uuid, conversation_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.tenant_id, e.conversation_id
    from public.escalations e
    left join public.conversation_drafts d
      on d.tenant_id = e.tenant_id
     and d.conversation_id = e.conversation_id
     and d.kind = case when e.reason = 'callback' then 'brief' else 'reply' end
   where e.state = 'open'
     and e.reason not in ('opt_out', 'booking_request')
     and (
       d.id is null
       or d.rules is distinct from p_rules
       or d.for_message_id is distinct from (
         select m.id
           from public.messages m
          where m.tenant_id = e.tenant_id and m.conversation_id = e.conversation_id and m.sender = 'customer'
          order by m.created_at desc
          limit 1
       )
       or (d.state = 'writing' and d.made_at < now() - interval '5 minutes')
       or (d.state = 'failed' and d.why_failed = 'not_drafted' and d.tries < 3 and d.made_at < now() - interval '15 minutes')
       or (d.state = 'failed' and d.why_failed in ('budget', 'may_not_spend', 'no_receptionist') and d.made_at < now() - interval '12 hours')
     )
   -- The newest first: a hold nothing can be drafted for (a window shut) is asked about every tick, and never starves one.
   order by e.created_at desc
   limit greatest(p_limit, 0);
$$;
revoke all on function public.reply_drafts_due(integer, integer) from public, anon, authenticated;
grant execute on function public.reply_drafts_due(integer, integer) to service_role;
comment on function public.reply_drafts_due(integer, integer) is
  'The open holds whose draft is owed another look (00538): none kept, another edition, an older message, a claim that died, or a failure due another try. contracts replyDraftOwed still says whether each is owed.';

/* --------------------------------------------------------------------------------- 3. they wrote again on a held thread -- */

create or replace function public.escalation_open(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_reason text,
  p_details text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id is null or p_conversation_id is null or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'escalation_open: a thread is handed to a person in a workspace, for a reason' using errcode = '22004';
  end if;
  -- Twice at most: a hold found open and resolved before it could be changed leaves room for a new one.
  for attempt in 1 .. 2 loop
    insert into public.escalations (tenant_id, conversation_id, reason, details)
    values (p_tenant_id, p_conversation_id, p_reason, p_details)
    on conflict (conversation_id) where state = 'open' do nothing
    returning id into v_id;
    if v_id is not null then
      insert into public.events (tenant_id, kind, category, version, subject_type, subject_id, data)
      values (p_tenant_id, 'escalation.opened', 'message', 1, 'conversation', p_conversation_id,
              jsonb_build_object('reason', p_reason));
      return 'opened';
    end if;
    -- A customer writing while a person has the thread is the open hold's, whatever its reason (00454): nothing written
    -- but that they wrote (00538).
    if p_reason = 'wrote_while_held' then
      select e.id into v_id
        from public.escalations e
       where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
         and e.reason is distinct from p_reason;
      if v_id is not null then
        insert into public.events (tenant_id, kind, category, version, subject_type, subject_id, data)
        values (p_tenant_id, 'escalation.refreshed', 'message', 1, 'conversation', p_conversation_id,
                jsonb_build_object('reason', p_reason));
        return 'refreshed';
      end if;
    end if;
    -- One open escalation per thread (escalations_one_open): another reason replaces it, held by the row it updates.
    update public.escalations e
       set reason = p_reason, details = p_details
     where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
       and e.reason is distinct from p_reason
    returning e.id into v_id;
    if v_id is not null then
      return 'changed';
    end if;
    update public.escalations e
       set details = p_details
     where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id and e.state = 'open'
    returning e.id into v_id;
    if v_id is not null then
      insert into public.events (tenant_id, kind, category, version, subject_type, subject_id, data)
      values (p_tenant_id, 'escalation.refreshed', 'message', 1, 'conversation', p_conversation_id,
              jsonb_build_object('reason', p_reason));
      return 'refreshed';
    end if;
  end loop;
  raise exception 'escalation_open: the thread''s hold moved twice while it was opened' using errcode = '40001';
end $$;
comment on function public.escalation_open(uuid, uuid, text, text) is
  'The one door a thread is handed to a person by (00388): a new open escalation with its escalation.opened event (opened), the open one taking another reason (changed; escalations_note_change writes escalation.changed), or the same reason''s words moved (refreshed, with escalation.refreshed: they wrote again, 00538), in one transaction. A wrote_while_held asked of a thread already held never takes the open reason''s place: it answers refreshed (00454). An open one resolved in between leaves room, and a new one is opened. The service role''s.';

insert into public.event_subscriptions (kind, subscriber, lane) values
  ('escalation.opened', 'reply_draft', 0),
  ('escalation.changed', 'reply_draft', 0),
  ('escalation.refreshed', 'reply_draft', 0)
on conflict (kind, subscriber) do nothing;

/* ------------------------------------------------------------------------------------------------- 4. the job's kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('reply_draft', 0, array['conversation_id', 'draft_kind', 'message_id?', 'rules'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------------------------------------ 5. the sweep -- */

create or replace function public.trigger_drafts_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.escalations e
        where e.state = 'open' and e.reason not in ('opt_out', 'booking_request')
     ) then
    return public.request_sweep('drafts', '/api/cron/drafts');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('drafts', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_drafts_sweep() from public, anon, authenticated;
comment on function public.trigger_drafts_sweep() is
  'The drafts sweep''s clock (decision 0093). Calls the edge (/api/cron/drafts) only while a hold is open; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every five minutes, recording itself each time: thirty minutes is six missed ticks.
  ('drafts', 'drafts-sweep', interval '30 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('drafts-sweep') where exists (select 1 from cron.job where jobname = 'drafts-sweep');
select cron.schedule('drafts-sweep', '3-59/5 * * * *', $$select public.trigger_drafts_sweep()$$);

/* ---------------------------------------------------------------------------- 6. a draft is told to its workspace -- */

create index if not exists conversation_drafts_state on public.conversation_drafts (tenant_id, state);

do $$
declare
  e text;
begin
  foreach e in array array['insert', 'update', 'delete'] loop
    execute format('drop trigger if exists %I on public.conversation_drafts', 'workspace_tell_' || e);
    execute format(
      'create trigger %I after %s on public.conversation_drafts referencing %s table as changed '
      'for each statement execute function public.workspace_tell_changes()',
      'workspace_tell_' || e, e, case e when 'delete' then 'old' else 'new' end);
  end loop;
end $$;

/* ------------------------------------------------------------------------------- 7. a hold promises no draft any more -- */

update public.escalations
   set details = 'An email arrived. Nothing was sent: it''s yours to answer.'
 where reason = 'email_review'
   and details = 'An email arrived. Nothing was sent: a reply is drafted for you in Need you, to change or send from here.';
update public.escalations
   set details = 'They wrote back to your sequence. Nothing is sent without you: read it here, and answer it when you''re ready.'
 where reason = 'email_review'
   and details = 'They wrote back to your sequence. Nothing is sent without you: read it here, with the receptionist''s draft when it wrote one.';
