-- 00401 · A reply keeps what the receptionist was told.
--
-- Decision 0039 (9 October 2026). A reply named what it was written from by two pointers that opened nothing: the hash
-- of a prompt whose text was kept nowhere, and the version of a settings row the next save overwrote. Beside the prompt
-- the model read who the person was, the clock and an owner's steer, and those were gone when the turn ended. So a reply
-- could not be read again: not to answer an owner who asks why it said what it said, not to try a changed prompt on
-- what customers really wrote, not to make a case of a reply an owner corrected.
--
--   model_prompts        the text of a system prompt, once per workspace and hash. The business's own facts as the
--                        receptionist was given them; nothing of a person.
--   model_turns          one turn about one conversation, as the model read it beside its prompt, and what it answered
--                        before any of it was replaced. A person's words and the team's notes about them: it goes with
--                        its conversation, with an erasure of anyone it names, and after thirty days.
--   model_turn_keep      the one write: the prompt kept (or seen again) and the turn, together.
--   purge_model_turns    nightly, the turns past their keep; purge_model_prompts, the prompts no turn has read for
--                        theirs. Both on one registered clock, judged by its run, like the other purges (00215, 00336,
--                        00340), so a night they do not run is a page and not a promise quietly broken.
--   model_turns_scrub    an erasure's hand: the workspace's turns that name the person by any key the erasure finds a
--                        copy by are deleted, their own (already gone with the conversation) and anyone else's that
--                        quoted a note about them.
--
-- No session reads either table: row security is on with no policy, as on the ledgers nobody signed in is shown (jobs,
-- rate_hits). The model port writes them as the service role, through the function, and the first readers are the
-- operator's and the evals' (decision 0039). An owner's view of a reply is a page's decision and brings its own policy.
--
-- New tables and functions. The one lock on a table in use is the turn's key to its conversation, which takes
-- conversations for an instant while the key is made; the lock guard is 00140's, so a busy table fails this file after
-- three seconds instead of queueing every write behind it. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the prompts -- */

create table if not exists public.model_prompts (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- The first 16 hex of the text's sha256 (apps/edge/lib/model.ts promptHashOf): what ai_usage and a reply's meta name.
  prompt_hash   text not null check (prompt_hash ~ '^[0-9a-f]{16,64}$'),
  text          text not null check (char_length(text) between 1 and 200000),
  first_seen_at timestamptz not null default now(),
  -- The day a turn last read it, moved at most once a day: a prompt in use is never past its keep.
  last_seen_at  timestamptz not null default now(),
  primary key (tenant_id, prompt_hash)
);

create index if not exists model_prompts_last_seen on public.model_prompts (last_seen_at);

alter table public.model_prompts enable row level security;
revoke all on public.model_prompts from anon, authenticated;
grant all on public.model_prompts to service_role;
comment on table public.model_prompts is
  'The text of a system prompt the receptionist was given, once per workspace and hash (decision 0039): what a reply''s meta.prompt_hash, and its row of ai_usage, open. The business''s facts, nothing of a person. Written by model_turn_keep alone; no session reads it. Kept while a turn reads it and RETENTION_DAYS.model_prompts after (purge_model_prompts).';

/* -------------------------------------------------------------- 2. the turns -- */

create table if not exists public.model_turns (
  -- The model port's own id (apps/edge/lib/receptionist/brain.ts), which the reply carries as meta.turn_id.
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  prompt_hash     text not null check (prompt_hash ~ '^[0-9a-f]{16,64}$'),
  -- What the model read beside its prompt: { now, who, steer, messages, photo } (contracts ModelTurnRequest). A
  -- megabyte is past what a model reads in one request, so a thread it could read is a thread this keeps.
  request         jsonb not null check (jsonb_typeof(request) = 'object' and pg_column_size(request) <= 1048576),
  -- What it answered, as it came and as it was read, before layer two replaced any of it (contracts
  -- ModelTurnResponse); null where no answer came (ai_usage says what became of the call).
  response        jsonb check (response is null or (jsonb_typeof(response) = 'object' and pg_column_size(response) <= 131072)),
  model           text check (model is null or char_length(model) between 1 and 80),
  latency_ms      integer check (latency_ms is null or latency_ms >= 0),
  created_at      timestamptz not null default now(),
  -- The house fence (00279): a turn names a conversation of its own workspace, and goes when the conversation does,
  -- which is how an erasure reaches the person's own turns (erase_contact deletes their conversations).
  constraint model_turns_conversation_id_same_workspace
    foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade
);

create index if not exists model_turns_conversation on public.model_turns (tenant_id, conversation_id, created_at desc);
create index if not exists model_turns_at on public.model_turns (created_at);

alter table public.model_turns enable row level security;
revoke all on public.model_turns from anon, authenticated;
grant all on public.model_turns to service_role;
comment on table public.model_turns is
  'One receptionist turn about one conversation, as the model read it beside its prompt, and what it answered (decision 0039). Holds the person''s words and the team''s notes about them: it goes with its conversation, with an erasure of anyone it names (model_turns_scrub), and after RETENTION_DAYS.model_turns (purge_model_turns). A reply names its turn in meta.turn_id. Written by model_turn_keep alone; no session reads it.';

/* -------------------------------------------------------------- 3. the write -- */

create or replace function public.model_turn_keep(
  p_tenant_id       uuid,
  p_turn_id         uuid,
  p_conversation_id uuid,
  p_prompt_hash     text,
  p_prompt_text     text,
  p_request         jsonb,
  p_response        jsonb default null,
  p_model           text default null,
  p_latency_ms      integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The prompt first, so a turn never names a text that is not kept. Seen again, only its clock moves, and at most
  -- once a day: the keep is counted in days, and a row every reply rewrote would be a dead row a reply. The text under
  -- a hash is the text, and a second writer's copy is the same one.
  insert into public.model_prompts (tenant_id, prompt_hash, text)
  values (p_tenant_id, p_prompt_hash, p_prompt_text)
  on conflict (tenant_id, prompt_hash) do update set last_seen_at = now()
    where public.model_prompts.last_seen_at < now() - interval '1 day';

  -- The same turn written twice (a retried call) is the turn it already is.
  insert into public.model_turns (id, tenant_id, conversation_id, prompt_hash, request, response, model, latency_ms)
  values (p_turn_id, p_tenant_id, p_conversation_id, p_prompt_hash, p_request, p_response, p_model, p_latency_ms)
  on conflict (id) do nothing;
end $$;

revoke execute on function public.model_turn_keep(uuid, uuid, uuid, text, text, jsonb, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.model_turn_keep(uuid, uuid, uuid, text, text, jsonb, jsonb, text, integer) to service_role;
comment on function public.model_turn_keep(uuid, uuid, uuid, text, text, jsonb, jsonb, text, integer) is
  'Keeps one receptionist turn and the prompt it read, together (decision 0039). The model port''s alone (packages/db keepModelTurn), as the service role.';

/* ------------------------------------------------------------- 4. the clocks -- */

create or replace function public.purge_model_turns(p_keep interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.model_turns t
     where t.id in (select c.id from public.model_turns c where c.created_at < now() - p_keep limit 1000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;

revoke all on function public.purge_model_turns(interval) from public, anon, authenticated;
grant execute on function public.purge_model_turns(interval) to service_role;
comment on function public.purge_model_turns(interval) is
  'Nightly. Deletes the receptionist''s kept turns thirty days after they were taken (contracts RETENTION_DAYS.model_turns; decision 0039), a thousand at a time. Answers how many.';

create or replace function public.purge_model_prompts(p_keep interval default '400 days')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare v_count integer;
begin
  delete from public.model_prompts where last_seen_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.purge_model_prompts(interval) from public, anon, authenticated;
grant execute on function public.purge_model_prompts(interval) to service_role;
comment on function public.purge_model_prompts(interval) is
  'Nightly, after purge_model_turns. Deletes the prompts no turn has read for 400 days (contracts RETENTION_DAYS.model_prompts, the usage ledger''s own keep). Answers how many.';

-- One clock for both, the turns first: a night either fails is a failed run, and the health sweep says so.
select cron.unschedule('purge-model-turns') where exists (select 1 from cron.job where jobname = 'purge-model-turns');
select cron.schedule('purge-model-turns', '58 4 * * *', $$select public.purge_model_turns(); select public.purge_model_prompts()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_model_turns', 'purge-model-turns', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

/* ------------------------------------------------------- 5. an erasure's hand -- */

create or replace function public.model_turns_scrub(p_tenant_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patterns text[];
  v_n        integer;
begin
  if p_tenant_id is null or p_needles is null then
    return 0;
  end if;
  -- One pattern per needle of six characters or more, lower-cased, its LIKE characters escaped (provider_events_scrub's
  -- rule, 00336): a turn is read once, as text, against them all.
  select array_agg(distinct '%' || replace(replace(replace(lower(n.needle), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into v_patterns
    from unnest(p_needles) as n(needle)
   where length(n.needle) >= 6;
  if v_patterns is null then
    return 0;
  end if;
  -- The person's own turns went with their conversation. These are anyone else's in the workspace that quoted them:
  -- a note about another customer that named this one, a thread that spelled their number. The whole turn goes; it is
  -- evidence with a month to live, and half of one proves nothing.
  delete from public.model_turns t
   where t.tenant_id = p_tenant_id
     and (lower(t.request::text) like any (v_patterns) or lower(coalesce(t.response::text, '')) like any (v_patterns));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.model_turns_scrub(uuid, text[]) from public, anon, authenticated;
grant execute on function public.model_turns_scrub(uuid, text[]) to service_role;
comment on function public.model_turns_scrub(uuid, text[]) is
  'An erasure''s hand on the kept turns (decision 0039): the workspace''s turns that name the person by any of the needles (six characters or more; without regard to case; a needle''s own %, _ or backslash is a character) are deleted. Answers how many.';
