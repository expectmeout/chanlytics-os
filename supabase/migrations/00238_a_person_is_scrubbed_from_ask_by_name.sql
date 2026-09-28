-- 00238 · A person is scrubbed from Ask by name, in the threads that are about them.
--
-- Ask Rewired, Phase 5, PR 5.6 (docs/superpowers/plans/2026-09-27-ask-rewired-5-memory.md: finding 8, D13).
-- 00040's scrub deleted every Ask message in the workspace whose JSON text held the person's id or one of the
-- digits and the address the erasure route passed: case-sensitive, one pass per needle, keys and values alike, `_`
-- and `%` acting as wildcards; then every empty thread in the workspace, whoever's, a thread made a moment ago whose
-- first message was not saved yet included. It never looked for a name, the number as the pages write it
-- (`+1 (555) 010-0123`), a citation of their conversation or their call, or a thread's title and scope. And an owner
-- could run it on a person nobody was erasing.
--
-- Replaced, with the same signature, return and grants:
--
--   their threads     those whose messages' words (content less `raw`) hold their id, an id of one of their
--                     conversations or calls, or a spelling of their number or address, and those whose title or
--                     scope quotes one (a scope on them holds their id). Never a raw alone: every raw carries the
--                     rows of the page it was asked on, so almost every thread asked from People or Today would be
--                     theirs.
--   everywhere        a message whose words hold one of those goes; one whose raw alone does keeps its words and
--                     loses the raw.
--   in their threads  a message naming them goes: their name, their WhatsApp name, a name a caller gave, or a word of
--                     their name, three characters or more, as a whole word in any case, in the message's string
--                     values (never its keys). No raw is kept; the titles and scopes are cleared; a thread left
--                     empty goes, and no other.
--   only the erased   the contact must be this workspace's and being erased (erasing_since or erased_at set), so an
--                     owner cannot wipe teammates' threads about a live person. The route calls it after beginErasure,
--                     after erase_contact, and on a re-drive: all three are.
--
-- The route computes the spellings (server/people/erasure.ts, erasureKeys): the digits and the address as stored,
-- each number's display form and North American forms, every address lower-cased. The names and the conversation
-- and call ids are read here, off the live rows, as erase_contact collects them.
--
-- One scan of the workspace's messages, each row's content read once: its words first, its raw's blocks only when the
-- words miss, each needle found with strpos, lower-cased, seven characters or more. strpos, not LIKE: on the local
-- stack, over 500 raws of ~400,000 characters and a person with fifty calls (60 needles), `like any` took 27 s for
-- the scan alone, past the 8 s statement_timeout the authenticated role has, and this function takes 3.6 s through
-- PostgREST. The scan grows with the raws' size times the needles (about 40 ms a needle there), so a person with a
-- few hundred calls, or a workspace with several times those raws, would near the timeout: stripping a raw once its
-- thread is cold would bound it (the pull request has the numbers).
--
-- What survives: a name alone, in a thread that is not theirs (its title too); another customer's words in a raw
-- that names them without their id, number or address; a thinking signature, opaque, in a raw outside their
-- threads, until the ninety-day purge. After erase_contact, and on a re-drive, their names, conversations and calls
-- are gone, so those passes find them by id, number and address alone.
--
-- Returns the messages deleted and the raws stripped. Re-runnable: create or replace keeps the owner and the grants,
-- said again below; a second run finds nothing.

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

  return v_deleted + v_stripped;
end $$;

revoke execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) from public, anon;
grant execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) to authenticated;
comment on function public.scrub_ask_for_contact(uuid, uuid, text[]) is
  'Owner-only, and only for a person being erased: removes every Ask message in the workspace whose words hold their id, a conversation or call id of theirs, or a spelling of their number or address; strips the raw turn off a message whose raw alone does; and in the threads those make theirs (or that are scoped to them) removes every message naming them, strips every raw, clears the title and scope, and removes a thread left empty (00238). Returns the messages removed plus the raws stripped.';
