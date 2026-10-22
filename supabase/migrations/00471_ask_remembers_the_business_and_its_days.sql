-- 00471 · Ask remembers the business and its days (decision 0070).
--
-- Ask answered each question from the page and the thread it was asked in, and forgot the rest: a fact a member told it
-- in one thread was gone in the next, and what was done on the site reached it only when it thought to read the log.
-- Now it keeps what it is told and what happened, and both ride into every turn's cached shape (server/ask/context.ts);
-- and once a day it speaks first, on Today.
--
--   ask_mornings          The day's first turn, which Ask asks itself when a member who acts arrives: one a member a
--                         day, its thread the member's own, its cards waiting on Today.
--   ask_morning_write     The member's door, by act: claim the day (ask.morning_claimed), name its thread, and say how
--                         many cards the turn left.
--   notifications kind    ask_cards: the line on the member's own bell when a morning's cards wait, written by the
--                         notices' one door (packages/db notices), as every addressed line is.
--   lead_suggestions_write  A fifth act, again: New ideas, written again from the same line, with what was shown passed
--                         on (the line's act forgets it).
--   ask_memory_lines      The facts about the business Ask keeps: what a member told it (Ask keeps the line itself, as
--                         the turn is saved, and the card arrives kept with an Undo), or a line a member wrote on
--                         Settings › Memory. Members read their workspace's; only the doors write.
--   ask_memory_write      Its one door, by act, as the member: keep (the approve permission; Ask keeps a line as the
--                         person it answers, one fact a line, at most forty live; ask.memory_kept; the same line again
--                         is the one already kept), change (the settings permission; ask.memory_changed) and forget
--                         (the settings permission, or the member who kept the line: Ask's card's Undo;
--                         ask.memory_forgotten).
--   ask_journal_days      One entry for each day of a workspace something happened in, by its own clock, written by the
--                         note sweep an hour after the day ends from both ledgers (what Settings › Activity reads):
--                         `looking` while the sweep has it, then `written`, `quiet` or `failed`. Owners read, as the
--                         Activity log is theirs; only the service writes.
--   ask_journal_open_days The days due: ended an hour ago, at most two days back, something in the ledgers, no entry.
--                         The clock and the batch read the same rows.
--   ask_journal_write     Its one door, the sweep's, by act: due (those days, each stamped `looking` as it is handed
--                         over, so a day is written once however the request ends) and keep (the day's entry, or the
--                         day said quiet or failed; ask.journal_written).
--   ask_message_words     The words of one Ask turn as the search reads them: the question, or the answer's Say.
--   search_ask            Recall: a member's own past questions and answers, the memory and (an owner's) the journal,
--                         that hold the words, under the caller's row security.
--   ai_usage purpose      ask_journal.
--   scrub_ask_for_contact A person being erased leaves the memory and the journal too.
--   trigger_notes_sweep   The clock asks the edge when a journal day is due too.
--
-- Either deploy order works: a dashboard without the code reads none of it and claims no morning, an edge without the
-- journal step never calls its doors, the clock's new condition only asks the door the notes already use, and the ideas'
-- door takes its old four acts as before. Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------ 1. the mornings -- */

create table if not exists public.ask_mornings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  -- The day, by the workspace's clock.
  day       date not null,
  -- The morning's thread: the member's own, titled with the day. A thread deleted leaves the day claimed.
  thread_id uuid,
  -- How many cards the turn left waiting, once it has answered; null while it runs.
  cards     integer check (cards is null or cards >= 0),
  made_at   timestamptz not null default now(),
  primary key (tenant_id, user_id, day)
);
comment on table public.ask_mornings is
  'The day''s first turn, which Ask asks itself when a member who acts arrives (decision 0070): one a member a day, its thread the member''s own, its cards waiting on Today. Written through ask_morning_write; the member reads their own.';

-- The key names the workspace too (00279): a morning names only its own workspace's thread.
alter table public.ask_mornings drop constraint if exists ask_mornings_thread_id_same_workspace;
alter table public.ask_mornings add constraint ask_mornings_thread_id_same_workspace
  foreign key (tenant_id, thread_id) references public.ask_threads (tenant_id, id) on delete set null (thread_id);

alter table public.ask_mornings enable row level security;
drop policy if exists ask_mornings_own_select on public.ask_mornings;
create policy ask_mornings_own_select on public.ask_mornings for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ask_mornings from anon, authenticated;
grant select on public.ask_mornings to authenticated;
grant select, insert, update, delete on public.ask_mornings to service_role;

-- The bell's line for a morning's cards: one member's, opening Today.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice','opted_out','booking','member_joined','member_left','note_to_keep','reply_held','ask_cards'));

create or replace function public.ask_morning_write(
  p_tenant_id uuid,
  p_day date,
  p_act text,
  p_thread_id uuid default null,
  p_cards integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_row    public.ask_mornings%rowtype;
  v_won    boolean;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the morning is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A member who acts: a viewer approves nothing, so no morning is asked for them.
  if not public.is_acting_member(p_tenant_id) then
    return jsonb_build_object('error', 'not_acting');
  end if;
  -- The workspace's today, give or take the zones: never a day long past or far ahead.
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'ask_morning_write: the day is today, by the workspace''s clock' using errcode = '22023';
  end if;
  if p_act = 'claim' then
    -- The day claimed once: the winner runs the turn; a second tab, or a later arrival, reads the first's.
    insert into public.ask_mornings (tenant_id, user_id, day)
    values (p_tenant_id, v_actor, p_day)
    on conflict on constraint ask_mornings_pkey do nothing
    returning true into v_won;
    select * into v_row from public.ask_mornings
     where tenant_id = p_tenant_id and user_id = v_actor and day = p_day;
    if coalesce(v_won, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'ask.morning_claimed', 'system', 'workspace', p_tenant_id,
              jsonb_build_object('day', p_day, 'by', v_actor));
    end if;
    return jsonb_build_object('claimed', coalesce(v_won, false), 'thread_id', v_row.thread_id, 'cards', v_row.cards);
  elsif p_act = 'thread' then
    -- The thread the winner made, its own in this workspace, named once.
    update public.ask_mornings m
       set thread_id = p_thread_id
     where m.tenant_id = p_tenant_id and m.user_id = v_actor and m.day = p_day and m.thread_id is null
       and exists (select 1 from public.ask_threads t
                    where t.id = p_thread_id and t.tenant_id = p_tenant_id and t.user_id = v_actor)
    returning true into v_won;
    return jsonb_build_object('named', coalesce(v_won, false));
  elsif p_act = 'answered' then
    -- The turn answered: how many cards wait, once a morning. The bell's line is the caller's to write when any do
    -- (`recorded` says this call set it), through the notices' door.
    update public.ask_mornings m
       set cards = greatest(coalesce(p_cards, 0), 0)
     where m.tenant_id = p_tenant_id and m.user_id = v_actor and m.day = p_day and m.cards is null
    returning * into v_row;
    return jsonb_build_object('recorded', found, 'thread_id', v_row.thread_id, 'cards', v_row.cards);
  end if;
  raise exception 'act is claim, thread or answered' using errcode = '22023';
end $$;
revoke execute on function public.ask_morning_write(uuid, date, text, uuid, integer) from public, anon;
grant execute on function public.ask_morning_write(uuid, date, text, uuid, integer) to authenticated;
comment on function public.ask_morning_write(uuid, date, text, uuid, integer) is
  'A member''s morning with Ask (decision 0070), by act, the caller''s own and only for a member who acts: claim (the day, once: {claimed, thread_id, cards}; ask.morning_claimed for the winner), thread (the thread the winner made, named once: {named}), answered (how many cards wait, once: {recorded, thread_id, cards}; the caller writes the ask_cards line on the member''s own bell when any do). The day is the workspace''s, within a day of the database''s. A viewer gets {error: not_acting}.';

/* ------------------------------------------------------------------------- 2. new ideas -- */

-- The ideas' one door (00400) with a fifth act. `again`: the same line, written again, so the next read writes new
-- ideas; unlike `line`, what was shown is kept, so the ideas offered before are passed on (ideaPassed) and not offered
-- twice. The four acts as they were.
create or replace function public.lead_suggestions_write(
  p_tenant_id uuid,
  p_act text,
  p_claim timestamptz default null,
  p_line text default null,
  p_by_owner boolean default false,
  p_items jsonb default '[]'::jsonb,
  p_basis text default null,
  p_passed jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    text := left(btrim(coalesce(p_line, '')), 160);
  v_claimed timestamptz;
  v_done    boolean;
begin
  if p_act = 'claim' then
    -- The claim on writing: this read's own moment, or null while another read's claim is under two minutes old. A
    -- workspace with no row gets one, with the line and no ideas.
    if char_length(v_line) < 3 then
      v_line := 'this business';
    end if;
    insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, made_at, making_at)
    values (p_tenant_id, v_line, false, '[]'::jsonb, now(), clock_timestamp())
    on conflict (tenant_id) do update set making_at = clock_timestamp()
     where k.making_at is null or k.making_at < now() - interval '2 minutes'
    returning k.making_at into v_claimed;
    return jsonb_build_object('claim', v_claimed);
  elsif p_act = 'keep' then
    -- Kept while the claim stands: false when it was let go meanwhile (the owner saved a line, or a slower write was
    -- taken over), and nothing is written.
    update public.lead_suggestions k
       set business_line = v_line,
           by_owner      = coalesce(p_by_owner, false),
           items         = coalesce(p_items, '[]'::jsonb),
           basis         = left(p_basis, 80),
           passed        = coalesce(p_passed, '[]'::jsonb),
           made_at       = now(),
           making_at     = null,
           failed_at     = null
     where k.tenant_id = p_tenant_id
       and p_claim is not null
       and k.making_at = p_claim
       and char_length(v_line) >= 3
    returning true into v_done;
    if coalesce(v_done, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
              jsonb_build_object('how', 'written', 'count', jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
                                 'by_owner', coalesce(p_by_owner, false)));
    end if;
    return jsonb_build_object('kept', coalesce(v_done, false));
  elsif p_act = 'fail' then
    -- The model would not write them under this claim: the claim let go and the failure kept, so the next reads say so
    -- for a while rather than ask again. A claim since taken over is left alone.
    update public.lead_suggestions k
       set failed_at = now(), making_at = null
     where k.tenant_id = p_tenant_id and p_claim is not null and k.making_at = p_claim
    returning true into v_done;
    return jsonb_build_object('failed', coalesce(v_done, false));
  elsif p_act = 'line' then
    -- The owner's own words: kept with no ideas and no basis, so the next read asks again, and nothing passed on, since
    -- what was passed on was another line's. The owner's word clears any claim: a write in flight finds its claim gone.
    if char_length(v_line) < 3 then
      raise exception 'a business line is at least three characters' using errcode = '22023';
    end if;
    insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, basis, passed, made_at, making_at, failed_at)
    values (p_tenant_id, v_line, true, '[]'::jsonb, null, '[]'::jsonb, now(), null, null)
    on conflict (tenant_id) do update
       set business_line = excluded.business_line, by_owner = true, items = '[]'::jsonb, basis = null,
           passed = '[]'::jsonb, made_at = now(), making_at = null, failed_at = null;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
            jsonb_build_object('how', 'line', 'count', 0, 'by_owner', true));
    return jsonb_build_object('saved', true);
  elsif p_act = 'again' then
    -- New ideas from the same line (decision 0070): the ideas shown stay, so the write that follows passes them on, and
    -- the basis goes, so it follows at once. A claim in flight is let go; a failure a moment ago is forgotten.
    update public.lead_suggestions k
       set basis = null, making_at = null, failed_at = null
     where k.tenant_id = p_tenant_id
    returning true into v_done;
    if coalesce(v_done, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
              jsonb_build_object('how', 'again', 'count', 0, 'by_owner', false));
    end if;
    return jsonb_build_object('again', coalesce(v_done, false));
  end if;
  raise exception 'act is claim, keep, fail, line or again' using errcode = '22023';
end;
$$;
comment on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) is
  'The one writer of lead_suggestions (00400, 00471), by act: claim ({claim}: this read''s moment, or null while another''s stands), keep ({kept}: only while p_claim stands), fail ({failed}: the claim let go and the failure kept), line ({saved}: the owner''s own words, which clear any claim and what was passed on), again ({again}: New ideas from the same line, what was shown kept to be passed on). A keep, a line and an again write lead.ideas_written. The service''s alone.';
revoke all on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) to service_role;

/* -------------------------------------------------------------------------- 3. the memory -- */

create table if not exists public.ask_memory_lines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  text         text not null check (char_length(text) between 3 and 300),
  -- ask: a member told Ask in a thread and Ask kept it. pane: a member wrote it on Settings › Memory.
  source       text not null check (source in ('ask', 'pane')),
  -- The thread it was told in: its keeper's own, for the pane's link. A thread deleted leaves the line.
  thread_id    uuid,
  kept_by      uuid references auth.users (id) on delete set null,
  made_at      timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  forgotten_at timestamptz,
  forgotten_by uuid references auth.users (id) on delete set null,
  constraint ask_memory_lines_forgotten check (forgotten_by is null or forgotten_at is not null)
);
comment on table public.ask_memory_lines is
  'What Ask remembers about the business (decision 0070): a fact a member told it, kept by Ask as the turn is saved, or a line a member wrote on Settings › Memory. The live lines ride into every turn''s cached shape. Members read their workspace''s; only the doors write.';

-- The key names the workspace too (00279): a line names only its own workspace's thread.
alter table public.ask_memory_lines drop constraint if exists ask_memory_lines_thread_id_same_workspace;
alter table public.ask_memory_lines add constraint ask_memory_lines_thread_id_same_workspace
  foreign key (tenant_id, thread_id) references public.ask_threads (tenant_id, id) on delete set null (thread_id);

-- The live lines, newest first: what every turn reads.
create index if not exists ask_memory_lines_live
  on public.ask_memory_lines (tenant_id, made_at desc) where forgotten_at is null;
create index if not exists ask_memory_lines_words
  on public.ask_memory_lines using gin (to_tsvector('simple', text)) where forgotten_at is null;

drop trigger if exists ask_memory_lines_set_updated_at on public.ask_memory_lines;
create trigger ask_memory_lines_set_updated_at
  before update on public.ask_memory_lines
  for each row execute function extensions.moddatetime('updated_at');

alter table public.ask_memory_lines enable row level security;
drop policy if exists ask_memory_lines_member_select on public.ask_memory_lines;
create policy ask_memory_lines_member_select on public.ask_memory_lines for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ask_memory_lines from anon, authenticated;
grant select on public.ask_memory_lines to authenticated;
grant select, insert, update, delete on public.ask_memory_lines to service_role;

create or replace function public.ask_memory_write(
  p_tenant_id uuid,
  p_act text,
  p_id uuid default null,
  p_text text default null,
  p_source text default 'ask',
  p_thread_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_text   text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_thread uuid;
  v_row    public.ask_memory_lines%rowtype;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the line is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_act in ('keep', 'change') then
    if char_length(v_text) < 3 then
      return jsonb_build_object('error', 'empty');
    end if;
    if char_length(v_text) > 300 then
      return jsonb_build_object('error', 'too_long');
    end if;
  end if;

  if p_act = 'keep' then
    if not coalesce(public.caller_has_permission(p_tenant_id, 'approve'), false) then
      raise exception 'ask_memory_write: approve required' using errcode = '42501';
    end if;
    if p_source is null or p_source not in ('ask', 'pane') then
      raise exception 'ask_memory_write: source is ask or pane' using errcode = '22023';
    end if;
    -- Serialized per workspace, so two turns at once can neither keep one line twice nor both take the last place.
    perform pg_advisory_xact_lock(hashtextextended('ask_memory:' || p_tenant_id::text, 0));
    -- The same line again is the one already kept, said as kept: nothing is kept twice.
    select * into v_row from public.ask_memory_lines
     where tenant_id = p_tenant_id and forgotten_at is null and lower(text) = lower(v_text)
     limit 1;
    if found then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    if (select count(*) from public.ask_memory_lines where tenant_id = p_tenant_id and forgotten_at is null) >= 40 then
      return jsonb_build_object('error', 'full');
    end if;
    -- A thread named is the caller's own in this workspace, or none.
    select t.id into v_thread from public.ask_threads t
     where t.id = p_thread_id and t.tenant_id = p_tenant_id and t.user_id = v_actor;
    insert into public.ask_memory_lines (tenant_id, text, source, thread_id, kept_by)
    values (p_tenant_id, v_text, p_source, v_thread, v_actor)
    returning * into v_row;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_kept', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'source', p_source, 'by', v_actor, 'chars', char_length(v_text)));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', false);
  end if;

  -- A change and a forget name a line of this workspace. One the caller may not touch is one they cannot find: a
  -- stranger learns nothing.
  select * into v_row from public.ask_memory_lines where id = p_id and tenant_id = p_tenant_id for update;

  if p_act = 'change' then
    if not found or v_row.forgotten_at is not null
       or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
      raise exception 'Line not found.' using errcode = 'P0002';
    end if;
    if v_row.text = v_text then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    update public.ask_memory_lines set text = v_text where id = v_row.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_changed', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'by', v_actor, 'chars', char_length(v_text)));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_text), 'again', false);
  elsif p_act = 'forget' then
    -- The settings permission forgets any line; the member who kept one forgets their own while they act here (the
    -- card's Undo). A line whose keeper has gone is the settings permission's alone.
    if not found
       or not (coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)
               or (v_row.kept_by is not null and v_row.kept_by = v_actor
                   and coalesce(public.is_acting_member(p_tenant_id), false))) then
      raise exception 'Line not found.' using errcode = 'P0002';
    end if;
    if v_row.forgotten_at is not null then
      return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', true);
    end if;
    update public.ask_memory_lines set forgotten_at = now(), forgotten_by = v_actor where id = v_row.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.memory_forgotten', 'settings', 'workspace', p_tenant_id,
            jsonb_build_object('memory_id', v_row.id, 'by', v_actor));
    return jsonb_build_object('memory', jsonb_build_object('id', v_row.id, 'text', v_row.text), 'again', false);
  end if;
  raise exception 'act is keep, change or forget' using errcode = '22023';
end $$;
revoke execute on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) from public, anon;
grant execute on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) to authenticated;
comment on function public.ask_memory_write(uuid, text, uuid, text, text, uuid) is
  'The one writer of Ask''s memory (decision 0070), by act, as the caller: keep (the approve permission: Ask, as the person it answers, as the turn is saved, source ask, or the member on Settings › Memory, pane; 3 to 300 characters; at most 40 live lines, every one read into each turn, error full; the same line again answers the one kept, again true; ask.memory_kept), change (the settings permission, a line of this workspace; ask.memory_changed), forget (the settings permission, or the member who kept the line while they act here, the card''s Undo; kept as forgotten, never deleted; ask.memory_forgotten). Each event names the line, never its words. Answers {memory: {id, text}, again} or {error}: empty, too_long, full; a line the caller may not touch is not found.';

/* ------------------------------------------------------------------------- 4. the journal -- */

create table if not exists public.ask_journal_days (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- The day, by the workspace's clock.
  day       date not null,
  state     text not null default 'looking' check (state in ('looking', 'written', 'quiet', 'failed')),
  text      text check (text is null or char_length(text) between 1 and 1200),
  -- How many of the day's ledger rows the entry was written from.
  rows_read integer not null default 0 check (rows_read >= 0),
  made_at   timestamptz not null default now(),
  primary key (tenant_id, day),
  constraint ask_journal_days_says_it check ((state = 'written') = (text is not null))
);
comment on table public.ask_journal_days is
  'Ask''s journal (decision 0070): one entry for each day of a workspace something happened in, by its own clock, written by the note sweep from the day''s two ledgers (what Settings › Activity reads) an hour after the day ends, money left out. The newest written days ride into an owner''s turns. Owners read, as the Activity log is theirs; only the service writes.';

create index if not exists ask_journal_days_written
  on public.ask_journal_days (tenant_id, day desc) where state = 'written';
create index if not exists ask_journal_days_words
  on public.ask_journal_days using gin (to_tsvector('simple', coalesce(text, ''))) where state = 'written';

alter table public.ask_journal_days enable row level security;
drop policy if exists ask_journal_days_member_select on public.ask_journal_days;
-- The owners' alone: it is written from both ledgers, which Settings › Activity and Ask show an owner alone.
create policy ask_journal_days_member_select on public.ask_journal_days for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m
                        where m.user_id = (select auth.uid()) and m.role = 'owner'));
revoke all on public.ask_journal_days from anon, authenticated;
grant select on public.ask_journal_days to authenticated;
grant select, insert, update, delete on public.ask_journal_days to service_role;

create or replace function public.ask_journal_open_days(p_limit integer default 10)
returns table (
  tenant_id uuid,
  day       date,
  day_from  timestamptz,
  day_to    timestamptz,
  timezone  text,
  locale    text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Each active workspace's last two days by its own clock, ended an hour ago, with no entry, and something in the
  -- ledgers: a member's or the receptionist's decision, or an event the log says (not usage, a webhook, an ingest record
  -- or Ask's own memory). Each probe is one workspace's day of one ledger. A member's questions to Ask are their own:
  -- the journal never reads them.
  select t.id, d.day, d.day_from, d.day_to, t.timezone, t.locale
    from tenants t
    cross join lateral (
      select g.day::date as day,
             (g.day::date::timestamp at time zone t.timezone) as day_from,
             ((g.day::date + 1)::timestamp at time zone t.timezone) as day_to
        from generate_series((now() at time zone t.timezone)::date - 2,
                             (now() at time zone t.timezone)::date - 1,
                             interval '1 day') as g(day)
    ) d
   where t.status = 'active'
     and now() >= d.day_to + interval '1 hour'
     and not exists (select 1 from ask_journal_days j where j.tenant_id = t.id and j.day = d.day)
     and (exists (select 1 from decisions x
                      where x.tenant_id = t.id and x.created_at >= d.day_from and x.created_at < d.day_to)
          or exists (select 1 from events e
                      where e.tenant_id = t.id and e.created_at >= d.day_from and e.created_at < d.day_to
                        and e.kind not like 'usage.%' and e.kind not like 'webhook.%'
                        and e.kind not like 'ingest.%' and e.kind not like 'ask.%'))
   order by d.day, t.id
   limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;
revoke execute on function public.ask_journal_open_days(integer) from public, anon, authenticated;
grant execute on function public.ask_journal_open_days(integer) to service_role;
comment on function public.ask_journal_open_days(integer) is
  'The journal''s days due (decision 0070): each active workspace''s last two days by its own clock, ended at least an hour ago, with no entry yet and something in the ledgers (a decision, or an event the log says), oldest first, with the day''s span as instants and the workspace''s zone and language. The clock and the batch read the same rows. Service role only.';

create or replace function public.ask_journal_write(
  p_act text,
  p_limit integer default null,
  p_tenant_id uuid default null,
  p_day date default null,
  p_text text default null,
  p_rows_read integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  jsonb;
  v_text  text := nullif(btrim(coalesce(p_text, '')), '');
  v_state text;
begin
  if p_act = 'due' then
    -- The batch: the days due, each stamped `looking` as it is handed over, so a day is written once however the
    -- request ends; a second sweep at the same moment finds the row there and takes nothing.
    with found as (
      select * from public.ask_journal_open_days(coalesce(p_limit, 3))
    ),
    picked as (
      insert into public.ask_journal_days (tenant_id, day)
      select f.tenant_id, f.day from found f
      on conflict on constraint ask_journal_days_pkey do nothing
      returning ask_journal_days.tenant_id, ask_journal_days.day
    )
    select coalesce(jsonb_agg(jsonb_build_object('tenant_id', f.tenant_id, 'day', f.day, 'day_from', f.day_from,
                                                 'day_to', f.day_to, 'timezone', f.timezone, 'locale', f.locale)
                              order by f.day, f.tenant_id), '[]'::jsonb)
      into v_days
      from picked p
      join found f on f.tenant_id = p.tenant_id and f.day = p.day;
    return jsonb_build_object('days', v_days);
  elsif p_act = 'keep' then
    if v_text is not null and char_length(v_text) > 1200 then
      return jsonb_build_object('error', 'too_long');
    end if;
    -- No words is a quiet day; a negative count is a failed one (the step's own word for a model that would not answer).
    v_state := case when coalesce(p_rows_read, 0) < 0 then 'failed' when v_text is null then 'quiet' else 'written' end;
    update public.ask_journal_days
       set state = v_state,
           text = case when v_state = 'written' then v_text end,
           rows_read = greatest(coalesce(p_rows_read, 0), 0),
           made_at = now()
     where tenant_id = p_tenant_id and day = p_day and state = 'looking';
    if not found then
      return jsonb_build_object('error', 'not_found');
    end if;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.journal_written', 'system', 'workspace', p_tenant_id,
            jsonb_build_object('day', p_day, 'state', v_state, 'chars', coalesce(char_length(v_text), 0)));
    return jsonb_build_object('day', jsonb_build_object('day', p_day, 'state', v_state));
  end if;
  raise exception 'act is due or keep' using errcode = '22023';
end $$;
revoke execute on function public.ask_journal_write(text, integer, uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.ask_journal_write(text, integer, uuid, date, text, integer) to service_role;
comment on function public.ask_journal_write(text, integer, uuid, date, text, integer) is
  'The one writer of Ask''s journal (decision 0070), the note sweep''s, by act: due (the days ask_journal_open_days names, at most p_limit, default 3, each stamped looking as it is handed over, so a day is written once: {days: [{tenant_id, day, day_from, day_to, timezone, locale}]}), keep (a day handed over: the entry, written; no words, quiet; a negative count, failed, the model would not answer; at most 1,200 characters; ask.journal_written: {day: {day, state}} or {error}: too_long, not_found). Service role only.';

/* ---------------------------------------------------------------------------- 5. recall -- */

-- The words of one Ask turn as the search reads them: a question's own words, an answer's Say. Immutable, so an index
-- may be built on it, and spelled the same in the index and in search_ask.
create or replace function public.ask_message_words(p_content jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select concat_ws(' ',
           p_content ->> 'text',
           p_content #>> '{answer,say,headline}',
           p_content #>> '{answer,say,detail}')
$$;
comment on function public.ask_message_words(jsonb) is
  'The words of one stored Ask turn as recall reads them (00471): the question''s text, or the answer''s Say (headline and detail). Never the raw turn.';

create index if not exists ask_messages_words
  on public.ask_messages using gin (to_tsvector('simple', public.ask_message_words(content)));

create or replace function public.search_ask(p_tenant uuid, p_words text, p_limit integer)
returns table (
  kind      text,
  id        uuid,
  thread_id uuid,
  at        timestamptz,
  snippet   text
)
language sql
stable
strict
security invoker
set search_path = public
as $$
  -- As search_messages (00219): the words parsed once per statement, and nothing to look for answers nothing.
  with hits as (
    (select 'turn'::text as kind, m.id, m.thread_id, m.created_at as at, public.ask_message_words(m.content) as said
       from public.ask_messages m
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and m.tenant_id = p_tenant
        and to_tsvector('simple', public.ask_message_words(m.content)) @@ (select websearch_to_tsquery('simple', p_words))
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 30))
    union all
    (select 'memory'::text, a.id, a.thread_id, a.made_at, a.text
       from public.ask_memory_lines a
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and a.tenant_id = p_tenant and a.forgotten_at is null
        and to_tsvector('simple', a.text) @@ (select websearch_to_tsquery('simple', p_words))
      order by a.made_at desc, a.id desc
      limit least(greatest(p_limit, 1), 30))
    union all
    (select 'journal'::text, null::uuid, null::uuid, (j.day::timestamp at time zone 'UTC'), j.text
       from public.ask_journal_days j
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and j.tenant_id = p_tenant and j.state = 'written'
        and to_tsvector('simple', coalesce(j.text, '')) @@ (select websearch_to_tsquery('simple', p_words))
      order by j.day desc
      limit least(greatest(p_limit, 1), 30))
  ),
  kept as (
    select h.* from hits h order by h.at desc limit least(greatest(p_limit, 1), 30)
  )
  select k.kind, k.id, k.thread_id, k.at,
         ts_headline('simple', k.said, (select websearch_to_tsquery('simple', p_words)),
                     'MaxFragments=1, MaxWords=30, MinWords=10, StartSel="", StopSel=""')
    from kept k
   order by k.at desc
$$;
revoke execute on function public.search_ask(uuid, text, integer) from public, anon;
grant execute on function public.search_ask(uuid, text, integer) to authenticated, service_role;
comment on function public.search_ask(uuid, text, integer) is
  'Recall (decision 0070): what Ask was asked and answered in the caller''s own threads, the lines it remembers and the days of its journal that hold the words (websearch_to_tsquery, the ''simple'' configuration), newest first, at most least(greatest(p_limit, 1), 30): kind (turn | memory | journal), the turn''s or the line''s id (null for a day), its thread, when (a day: its midnight in UTC), and the words around the match. Under the caller''s row security: a member finds their own threads alone. Nothing to look for answers nothing; so does any null argument (strict).';

/* ---------------------------------------------------------------- 6. what the model costs -- */

alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal'));

/* ------------------------------------------------------------------ 7. a person is erased -- */

-- 00238's scrub, the same signature, return and grants, now reaching what Ask remembers too: a line of the memory or a
-- day of the journal that holds the person's id, a spelling of their number or address, or their name as a whole word,
-- is deleted (a line, not forgotten: an erasure leaves nothing to read back), and counted in what it returns.

create or replace function public.scrub_ask_for_contact(p_tenant_id uuid, p_contact_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display  text;
  v_wa       text;
  v_erasing  boolean;
  v_convs    uuid[];
  v_calls    uuid[];
  v_ids      text[];
  v_find     text[];
  v_names    text[];
  v_re       text;
  v_row      record;
  v_text     text;
  v_words    uuid[] := '{}';
  v_raws     uuid[] := '{}';
  v_own      uuid[] := '{}';
  v_deleted  integer;
  v_stripped integer;
  v_forgot   integer;
  v_days     integer;
begin
  if not exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id and m.role = 'owner'
  ) then
    raise exception 'scrub_ask_for_contact: owner role required';
  end if;
  select c.display_name, c.wa_profile_name, c.erasing_since is not null or c.erased_at is not null
    into v_display, v_wa, v_erasing
    from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id;
  if v_erasing is not true then
    raise exception 'scrub_ask_for_contact: only a person being erased' using errcode = '55000';
  end if;

  /* ---- who they are: their ids, what to look for, their names ---- */
  v_convs := array(select cv.id from public.conversations cv
                    where cv.tenant_id = p_tenant_id and cv.contact_id = p_contact_id);
  v_calls := array(select k.id from public.calls k
                    where k.tenant_id = p_tenant_id
                      and (k.contact_id = p_contact_id or k.conversation_id = any (v_convs)));
  v_ids := array[p_contact_id::text] || v_convs::text[] || v_calls::text[];
  v_find := array(select distinct lower(n) from unnest(v_ids || coalesce(p_needles, '{}')) as n
                   where char_length(n) >= 7);
  v_names := array(
    select distinct q.n
      from (select lower(regexp_replace(btrim(x), '\s+', ' ', 'g')) as n
              from unnest(array[v_display, v_wa]
                          || array(select k.caller_name from public.calls k where k.id = any (v_calls))
                          || regexp_split_to_array(btrim(coalesce(v_display, '')), '\s+')) as x) q
     where char_length(q.n) >= 3);
  -- A name as a whole word: a backslash before anything not a letter, a digit or a space makes it that character.
  if cardinality(v_names) > 0 then
    v_re := '(^|[^[:alnum:]_])('
         || array_to_string(array(select regexp_replace(n, '([^[:alnum:][:space:]])', '\\\1', 'g')
                                    from unnest(v_names) as n), '|')
         || ')($|[^[:alnum:]_])';
  end if;

  /* ---- one scan: each row's words, then its raw only when the words miss ---- */
  -- `|| '{}'` hands the row's content back detoasted (jsonb_concat returns its other side as it is), so the words and
  -- the raw are read from one copy instead of fetching and decompressing the row twice.
  for v_row in
    select m.id, m.thread_id, m.content || '{}'::jsonb as content
      from public.ask_messages m
     where m.tenant_id = p_tenant_id
  loop
    v_text := lower((v_row.content - 'raw')::text);
    if exists (select 1 from unnest(v_find) as n where strpos(v_text, n) > 0) then
      v_words := v_words || v_row.id;
      v_own := v_own || v_row.thread_id;
    else
      v_text := v_row.content -> 'raw' ->> 'blocks';
      if v_text is not null and exists (select 1 from unnest(v_find) as n where strpos(v_text, n) > 0) then
        v_raws := v_raws || v_row.id;
      end if;
    end if;
  end loop;
  -- And a thread whose title or scope quotes one: a scope on them, or on one of theirs, holds its id.
  v_own := array(
    select x from unnest(v_own) as x
    union
    select t.id from public.ask_threads t
     where t.tenant_id = p_tenant_id
       and exists (select 1 from unnest(v_find) as n
                    where strpos(lower(t.title || ' ' || coalesce(t.scope::text, '')), n) > 0));

  /* ---- what goes ---- */
  delete from public.ask_messages m
   where m.tenant_id = p_tenant_id
     and (m.id = any (v_words)
          or (v_re is not null and m.thread_id = any (v_own)
              and exists (select 1
                            from jsonb_path_query(m.content - 'raw', 'strict $.** ? (@.type() == "string")') as s(v)
                           where (s.v #>> '{}') ~* v_re)));
  get diagnostics v_deleted = row_count;

  update public.ask_messages m
     set content = m.content - 'raw'
   where m.tenant_id = p_tenant_id
     and (m.id = any (v_raws) or (m.thread_id = any (v_own) and jsonb_typeof(m.content -> 'raw') <> 'null'));
  get diagnostics v_stripped = row_count;

  update public.ask_threads t
     set title = '', scope = null
   where t.tenant_id = p_tenant_id and t.id = any (v_own) and (t.title <> '' or t.scope is not null);

  delete from public.ask_threads t
   where t.tenant_id = p_tenant_id and t.id = any (v_own)
     and not exists (select 1 from public.ask_messages m where m.thread_id = t.id);

  -- What Ask remembers: a line or a day that names them goes.
  delete from public.ask_memory_lines a
   where a.tenant_id = p_tenant_id
     and (exists (select 1 from unnest(v_find) as n where strpos(lower(a.text), n) > 0)
          or (v_re is not null and a.text ~* v_re));
  get diagnostics v_forgot = row_count;

  delete from public.ask_journal_days j
   where j.tenant_id = p_tenant_id and j.text is not null
     and (exists (select 1 from unnest(v_find) as n where strpos(lower(j.text), n) > 0)
          or (v_re is not null and j.text ~* v_re));
  get diagnostics v_days = row_count;

  return v_deleted + v_stripped + v_forgot + v_days;
end $$;

revoke execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) from public, anon;
grant execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) to authenticated;
comment on function public.scrub_ask_for_contact(uuid, uuid, text[]) is
  'Owner-only, and only for a person being erased: removes every Ask message in the workspace whose words hold their id, a conversation or call id of theirs, or a spelling of their number or address; strips the raw turn off a message whose raw alone does; and in the threads those make theirs (or that are scoped to them) removes every message naming them, strips every raw, clears the title and scope, and removes a thread left empty (00238). Then every line of Ask''s memory and every day of its journal that holds one of those, or their name as a whole word (00471). Returns the messages removed, the raws stripped, the lines and the days removed.';

/* ----------------------------------------------------------------------------- 8. the clock -- */

-- The note sweep's clock (00159, 00448) asks the edge when a journal day is due too, once the journal has begun: the
-- edge writes it only while ASK_JOURNAL is on, which the database cannot read, so before its first day is kept a due day
-- would ask the edge every tick for nothing. The first day is kept on a run the notes ask for themselves.
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
     ) or exists (select 1 from public.fact_corrections(1))
       or (exists (select 1 from public.ask_journal_days)
           and exists (select 1 from public.ask_journal_open_days(1))) then
    return public.request_sweep('notes', '/api/cron/notes');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('notes', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_notes_sweep() from public, anon, authenticated;
comment on function public.trigger_notes_sweep() is
  'The note sweep''s clock (0007, 0063, 0070). Calls the edge (/api/cron/notes) only when a call, a quiet conversation, an owner''s correction or (once the journal has begun) a journal day is waiting for its look; otherwise records that it looked.';
