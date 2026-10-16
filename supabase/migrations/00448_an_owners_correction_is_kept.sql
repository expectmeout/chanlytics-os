-- 00448 · An owner's correction is kept (decision 0063, the AI-native plan's item 3).
--
-- When an owner rewrites a held draft (steer) or answers a thread the receptionist handed them, their words are the fact
-- the receptionist lacked. The note sweep (every thirty minutes, 00159) now looks at each such correction once, a cheap
-- model and the checks in code decide whether it states one lasting fact about the business, and what passes waits on
-- Settings › Autonomy as a note to Keep or Dismiss, told on the bell. And the pane says how often the owner changes what
-- the receptionist writes.
--
--   fact_suggestions        One row per correction looked at, keyed by its message: `nothing` for most, `suggested`
--                           while it waits, then `kept` or `dismissed`, with who and when. Members read their
--                           workspace's; only the doors write.
--   held_draft_outcome      What became of one held draft, from its status and its error: the rule
--                           receptionist_series (00380) spells for its `hold`, restated here once and held to it by the
--                           test (an-owners-correction-is-kept.db).
--   held_drafts_by_intent   The workspace's held drafts of the last p_days, by the intent the model stamped, with what
--                           became of each: the Autonomy pane's line. Under the caller's RLS.
--   fact_corrections        The corrections not yet looked at, of the last three days: a rewritten draft's instruction,
--                           and an owner's first text after a hold the receptionist opened because it did not know, a
--                           booking or a question was set to Ask me first, or a picked time needs a reply.
--   fact_candidates         The sweep's batch: those corrections with what the gates read, each stamped as it is
--                           handed over (a `nothing` row), so a look is taken once however the request ends.
--   fact_suggest            The sweep's door: a look that passed becomes a suggestion (settings.fact_suggested), and a
--                           line on the bell (note_to_keep: no mail, no phone) that opens the pane.
--   notifications_kind_check 00437's list, with note_to_keep. Contracts SERVER_NOTIFICATION_KINDS, NOTIFICATION_DELIVERY
--                           ("bell").
--   fact_suggestion_answer  A member's door: kept, with the settings version the note was written in, or dismissed
--                           (settings.fact_kept, settings.fact_dismissed). The note itself is the settings write's.
--   trigger_notes_sweep     The clock asks the edge when a correction waits too.
--
-- Either deploy order works: an edge without the facts step never calls the new doors, a dashboard without the row reads
-- nothing, and the clock's new condition only asks the door the notes already use. Re-runnable throughout.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------- 1. the record -- */

create table if not exists public.fact_suggestions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  -- The thread the correction was made in, kept for the row's link; a thread erased leaves the suggestion standing.
  conversation_id   uuid,
  -- steer: a held draft rewritten to the owner's instruction. reply: the owner's own text after a hold.
  source            text not null check (source in ('steer', 'reply')),
  -- The correction's message: the rewritten draft for a steer, the owner's text for a reply. One look per message.
  source_message_id uuid not null,
  state             text not null default 'nothing' check (state in ('nothing', 'suggested', 'kept', 'dismissed')),
  title             text check (title is null or char_length(title) between 1 and 80),
  body              text check (body is null or char_length(body) between 1 and 400),
  -- The owner's own words that state it, as the model cited them and the check found them.
  quote             text check (quote is null or char_length(quote) between 1 and 400),
  -- The settings version a Keep wrote the note in.
  config_version    integer,
  decided_by        uuid references auth.users (id) on delete set null,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fact_suggestions_source_message_one unique (source_message_id),
  -- A suggestion says something; a look that ended with nothing says nothing.
  constraint fact_suggestions_says_it check (
    (state = 'nothing' and title is null and body is null and quote is null)
    or (state <> 'nothing' and title is not null and body is not null and quote is not null)
  ),
  constraint fact_suggestions_decided check ((state in ('kept', 'dismissed')) = (decided_at is not null))
);
comment on table public.fact_suggestions is
  'An owner''s correction, looked at once by the note sweep (decision 0063): a rewritten draft''s instruction or the owner''s own text after a hold. Most end as nothing; a lasting fact about the business waits on Today as a note to Keep or Dismiss.';

-- The keys name the workspace too (00279): a row can only name its own workspace's thread and message.
alter table public.fact_suggestions drop constraint if exists fact_suggestions_conversation_id_same_workspace;
alter table public.fact_suggestions add constraint fact_suggestions_conversation_id_same_workspace
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id)
  on delete set null (conversation_id);
alter table public.fact_suggestions drop constraint if exists fact_suggestions_source_message_id_same_workspace;
alter table public.fact_suggestions add constraint fact_suggestions_source_message_id_same_workspace
  foreign key (tenant_id, source_message_id) references public.messages (tenant_id, id) on delete cascade;

-- Today's row: the workspace's suggestions waiting, newest first. And the day's count the gate reads.
create index if not exists fact_suggestions_waiting
  on public.fact_suggestions (tenant_id, created_at desc) where state = 'suggested';
create index if not exists fact_suggestions_tenant_created on public.fact_suggestions (tenant_id, created_at);

drop trigger if exists fact_suggestions_set_updated_at on public.fact_suggestions;
create trigger fact_suggestions_set_updated_at
  before update on public.fact_suggestions
  for each row execute function extensions.moddatetime('updated_at');

alter table public.fact_suggestions enable row level security;
drop policy if exists fact_suggestions_member_select on public.fact_suggestions;
create policy fact_suggestions_member_select on public.fact_suggestions for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.fact_suggestions from anon, authenticated;
grant select on public.fact_suggestions to authenticated;
grant select, insert, update, delete on public.fact_suggestions to service_role;

/* ------------------------------------------------------------- 2. how often it is changed -- */

create or replace function public.held_draft_outcome(p_status text, p_error jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when p_status in ('sent', 'delivered', 'read') then 'sent'
           when p_status = 'queued' then 'waiting'
           when p_status = 'canceled' then
             case
               when p_error is null or jsonb_typeof(p_error) = 'null' then 'canceled'
               when p_error->>'reason' = 'steered' then 'steered'
               when p_error->>'reason' = 'superseded_by_newer_message' then 'overtaken'
               when p_error->>'reason' = 'superseded_by_human' then 'person_first'
               else 'other'
             end
           else 'other'
         end
$$;
comment on function public.held_draft_outcome(text, jsonb) is
  'What became of one of the receptionist''s held drafts (decision 0063), from its status and its error: sent, waiting, canceled (the owner stopped it), steered (rewritten to their instruction), overtaken (a newer customer message), person_first (a person wrote first), else other. The rule receptionist_series (00380) spells for its hold.';

create or replace function public.held_drafts_by_intent(p_tenant_id uuid, p_days integer default 30)
returns table (
  intent       text,
  held         integer,
  sent         integer,
  steered      integer,
  canceled     integer,
  person_first integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with held as (
    select coalesce(nullif(m.meta->>'intent', ''), 'other') as intent,
           public.held_draft_outcome(m.status, m.error) as outcome
      from messages m
     where m.tenant_id = p_tenant_id
       and m.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
       and m.direction = 'outbound' and m.sender = 'ai'
       and m.meta->>'source' in ('veto_window', 'low_confidence')
       and coalesce(m.meta->>'backfill', 'false') <> 'true'
  )
  select h.intent,
         count(*)::integer,
         (count(*) filter (where h.outcome = 'sent'))::integer,
         (count(*) filter (where h.outcome = 'steered'))::integer,
         (count(*) filter (where h.outcome = 'canceled'))::integer,
         (count(*) filter (where h.outcome = 'person_first'))::integer
    from held h
   group by h.intent
$$;
revoke execute on function public.held_drafts_by_intent(uuid, integer) from public, anon;
grant execute on function public.held_drafts_by_intent(uuid, integer) to authenticated, service_role;
comment on function public.held_drafts_by_intent(uuid, integer) is
  'The Autonomy pane''s evidence (decision 0063): the receptionist''s drafts held for the owner over the last p_days (1 to 90, default 30), by the intent the model stamped (other where none), with how many were sent as written, rewritten to an instruction, stopped by the owner, or answered by a person first (held_draft_outcome). SECURITY INVOKER: the caller''s RLS decides.';

/* ------------------------------------------------------------------ 3. what is worth a look -- */

create or replace function public.fact_corrections(p_limit integer default 20)
returns table (
  message_id      uuid,
  tenant_id       uuid,
  conversation_id uuid,
  source          text,
  made_at         timestamptz,
  words           text,
  said            text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Each active workspace's own last three days, through its own rows (messages_tenant_created): no scan of every
  -- workspace's messages, and no new index on a table that is always being written.
  select c.message_id, c.tenant_id, c.conversation_id, c.source, c.made_at, c.words, c.said
    from tenants t
    cross join lateral (
      -- A held draft rewritten to the owner's instruction: the instruction, and the draft it replaced.
      select m.id as message_id, m.tenant_id, m.conversation_id, 'steer'::text as source, m.created_at as made_at,
             btrim(m.meta->>'steer') as words,
             (select d.body from messages d
               where d.tenant_id = m.tenant_id and d.id::text = m.meta->>'steered_from') as said
        from messages m
       where m.tenant_id = t.id and m.created_at > now() - interval '3 days'
         and m.direction = 'outbound' and m.sender = 'ai' and m.meta->>'source' = 'steered'
         and coalesce(btrim(m.meta->>'steer'), '') <> ''
      union all
      -- The owner's first text after a hold the receptionist opened for something it could not answer itself, while
      -- that hold was open: their words, and what the receptionist said last before it.
      select m.id, m.tenant_id, m.conversation_id, 'reply', m.created_at, btrim(m.body),
             (select a.body from messages a
               where a.conversation_id = m.conversation_id and a.direction = 'outbound' and a.sender = 'ai'
                 and a.type = 'text' and a.status in ('sent', 'delivered', 'read') and a.created_at < m.created_at
               order by a.created_at desc limit 1)
        from messages m
        join lateral (
          select e.created_at from escalations e
           where e.tenant_id = m.tenant_id and e.conversation_id = m.conversation_id
             and e.reason in ('human_token', 'policy_ask', 'booking_reply')
             and e.created_at <= m.created_at
             and (e.state = 'open' or e.resolved_at >= m.created_at)
           order by e.created_at desc limit 1
        ) e on true
       where m.tenant_id = t.id and m.created_at > now() - interval '3 days'
         and m.direction = 'outbound' and m.sender = 'human' and m.type = 'text'
         and m.status in ('sent', 'delivered', 'read')
         and coalesce(btrim(m.body), '') <> ''
         and not exists (
           select 1 from messages p
            where p.conversation_id = m.conversation_id and p.direction = 'outbound' and p.sender = 'human'
              and p.created_at > e.created_at and p.created_at < m.created_at
         )
    ) c
   where t.status = 'active'
     and c.conversation_id is not null
     and not exists (select 1 from fact_suggestions f where f.source_message_id = c.message_id)
   order by c.made_at
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
revoke execute on function public.fact_corrections(integer) from public, anon, authenticated;
grant execute on function public.fact_corrections(integer) to service_role;
comment on function public.fact_corrections(integer) is
  'The owner''s corrections of the last three days not yet looked at (decision 0063), oldest first: a held draft rewritten to their instruction (steer), and their first text after a hold opened for human_token, policy_ask or booking_reply while it was open (reply), in active workspaces. Each with the owner''s words and what the receptionist said. The clock and the batch read the same rows. Service role only.';

create or replace function public.fact_candidates(p_limit integer default 20)
returns table (
  id              uuid,
  tenant_id       uuid,
  conversation_id uuid,
  source          text,
  words           text,
  said            text,
  asked           jsonb,
  known           jsonb,
  notes_count     integer,
  workspace_today integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with found as (
    select * from public.fact_corrections(p_limit)
  ),
  -- Stamped as they are handed over: a `nothing` row each, so a look is taken once; a second sweep at the same moment
  -- finds the row there and takes nothing.
  picked as (
    insert into fact_suggestions (tenant_id, conversation_id, source, source_message_id)
    select f.tenant_id, f.conversation_id, f.source, f.message_id from found f
    on conflict (source_message_id) do nothing
    returning fact_suggestions.id, fact_suggestions.tenant_id, fact_suggestions.conversation_id,
              fact_suggestions.source, fact_suggestions.source_message_id
  )
  select p.id, p.tenant_id, p.conversation_id, p.source, f.words, f.said,
         -- The customer's words before the correction: their last three texts of the day before it, oldest first.
         coalesce((
           select jsonb_agg(q.body order by q.created_at)
             from (
               select m.body, m.created_at from messages m
                where m.conversation_id = p.conversation_id and m.direction = 'inbound' and m.sender = 'customer'
                  and m.type = 'text' and coalesce(m.body, '') <> ''
                  and m.created_at < f.made_at and m.created_at > f.made_at - interval '1 day'
                order by m.created_at desc
                limit 3
             ) q
         ), '[]'::jsonb),
         -- What the business's notes and services already say, as the receptionist is told them.
         coalesce((
           select jsonb_agg(k.said)
             from (
               select concat_ws('. ', nullif(btrim(n->>'title'), ''), nullif(btrim(n->>'text'), '')) as said
                 from jsonb_array_elements(case when jsonb_typeof(tc.config->'brain'->'profile'->'notes') = 'array'
                                                then tc.config->'brain'->'profile'->'notes' else '[]'::jsonb end) n
               union all
               select btrim(s->>'name')
                 from jsonb_array_elements(case when jsonb_typeof(tc.config->'brain'->'profile'->'services') = 'array'
                                                then tc.config->'brain'->'profile'->'services' else '[]'::jsonb end) s
             ) k
            where coalesce(k.said, '') <> ''
         ), '[]'::jsonb),
         (case when jsonb_typeof(tc.config->'brain'->'profile'->'notes') = 'array'
               then jsonb_array_length(tc.config->'brain'->'profile'->'notes') else 0 end)::integer,
         (select count(*)::integer from fact_suggestions s
           where s.tenant_id = p.tenant_id and s.state <> 'nothing' and s.created_at > now() - interval '1 day')
    from picked p
    join found f on f.message_id = p.source_message_id
    left join tenant_config tc on tc.tenant_id = p.tenant_id;
end $$;
revoke execute on function public.fact_candidates(integer) from public, anon, authenticated;
grant execute on function public.fact_candidates(integer) to service_role;
comment on function public.fact_candidates(integer) is
  'The note sweep''s batch of corrections (decision 0063): fact_corrections, each stamped as it is handed over (a nothing row in fact_suggestions, so it is looked at once), with the owner''s words, what the receptionist said, the customer''s last texts before it, what the notes and services already say, how many notes there are, and the workspace''s suggestions of the last day. Service role only.';

/* ------------------------------------------------------------------------------ 4. the doors -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out','booking','member_joined','member_left','note_to_keep'));

create or replace function public.fact_suggest(p_id uuid, p_title text, p_body text, p_quote text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body  text := nullif(btrim(coalesce(p_body, '')), '');
  v_quote text := nullif(btrim(coalesce(p_quote, '')), '');
  v_row   public.fact_suggestions%rowtype;
begin
  if v_title is null or v_body is null or v_quote is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_title) > 80 or char_length(v_body) > 400 or char_length(v_quote) > 400 then
    return jsonb_build_object('error', 'too_long');
  end if;
  update fact_suggestions set state = 'suggested', title = v_title, body = v_body, quote = v_quote
   where id = p_id and state = 'nothing'
  returning * into v_row;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'settings.fact_suggested', 'settings', 'workspace', v_row.tenant_id,
          jsonb_build_object('suggestion_id', v_row.id, 'source', v_row.source, 'chars', char_length(v_body)));
  -- The bell says there is one and where; the words stay on the pane.
  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
  values (v_row.tenant_id, 'note_to_keep',
          case when v_row.source = 'steer' then 'The receptionist can learn from your rewrite'
               else 'The receptionist can learn from your reply' end,
          'Keep it as a note for the receptionist, or dismiss it.',
          'admin/autonomy', 'fact_suggestion', v_row.id::text);
  return jsonb_build_object('suggestion', jsonb_build_object('id', v_row.id, 'state', v_row.state));
end $$;
revoke execute on function public.fact_suggest(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fact_suggest(uuid, text, text, text) to service_role;
comment on function public.fact_suggest(uuid, text, text, text) is
  'The note sweep suggests a note for the receptionist from an owner''s correction (decision 0063): a look handed over by fact_candidates becomes a suggestion, with settings.fact_suggested (never the words) and a note_to_keep line on the bell that opens Settings › Autonomy. Answers {suggestion} or {error}: empty, too_long, not_found (no such look, or one already said). Service role only.';

create or replace function public.fact_suggestion_answer(p_id uuid, p_keep boolean, p_config_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.fact_suggestions%rowtype;
  v_state text;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the answer is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_keep is null then
    raise exception 'fact_suggestion_answer: keep, or not' using errcode = '22004';
  end if;
  select * into v_row from public.fact_suggestions where id = p_id for update;
  -- One the caller does not act in is one they cannot see: a stranger learns nothing.
  if not found or v_row.state = 'nothing' or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Suggestion not found.' using errcode = 'P0002';
  end if;
  if v_row.state <> 'suggested' then
    return jsonb_build_object('error', 'answered', 'state', v_row.state);
  end if;
  v_state := case when p_keep then 'kept' else 'dismissed' end;
  update public.fact_suggestions
     set state = v_state, decided_by = v_actor, decided_at = now(),
         config_version = case when p_keep then p_config_version end
   where id = v_row.id;
  -- Its line on the bell asked for this answer, so it ends for everyone, through the one door that closes rows (00421).
  perform public.notifications_close_about(v_row.tenant_id, array['note_to_keep'], 'fact_suggestion', v_row.id::text);
  if p_keep then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'settings.fact_kept', 'settings', 'workspace', v_row.tenant_id,
            jsonb_build_object('suggestion_id', v_row.id, 'source', v_row.source, 'by', v_actor,
                               'version', p_config_version));
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'settings.fact_dismissed', 'settings', 'workspace', v_row.tenant_id,
            jsonb_build_object('suggestion_id', v_row.id, 'source', v_row.source, 'by', v_actor));
  end if;
  return jsonb_build_object('suggestion', jsonb_build_object('id', v_row.id, 'state', v_state));
end $$;
revoke execute on function public.fact_suggestion_answer(uuid, boolean, integer) from public, anon;
grant execute on function public.fact_suggestion_answer(uuid, boolean, integer) to authenticated;
comment on function public.fact_suggestion_answer(uuid, boolean, integer) is
  'A member answers a note suggested from an owner''s correction (decision 0063): kept, with the settings version the note was written in (the note itself is the settings write''s), or dismissed; settings.fact_kept or settings.fact_dismissed as theirs. A refusal is {error: answered} with its state. Returns the suggestion''s id and state.';

/* ------------------------------------------------------------------------------ 5. the clock -- */

-- The note sweep's clock (00159) asks the edge when a correction waits for its look too.
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
     ) or exists (select 1 from public.fact_corrections(1)) then
    return public.request_sweep('notes', '/api/cron/notes');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('notes', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_notes_sweep() from public, anon, authenticated;
comment on function public.trigger_notes_sweep() is
  'The note sweep''s clock (0007, 0063). Calls the edge (/api/cron/notes) only when a call, a quiet conversation or an owner''s correction is waiting for its look; otherwise records that it looked.';
