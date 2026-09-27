-- 00219 · Messages and call transcripts have a text index.
--
-- Ask Rewired, Phase 4 (D6). Nothing in the database can find a word a customer wrote or said: the Inbox's search
-- filters the rows the browser already holds, and no index covers a message's body or a call's transcript. Two
-- expression GIN indexes do now, each over to_tsvector('simple', coalesce(<text>, '')), and search_messages answers one
-- workspace's message hits and call-transcript hits together, newest first, none older than the moment the caller
-- names, at most fifty, each with the words around the match. A call_summary message is a message hit like any other; a
-- transcript hit is its call, dated when it started (when it was recorded, where it never said). Nothing calls it yet
-- (PR 4.5 adds the reader).
--
-- No stored column: messages and calls are published to realtime with no column list (00002, 00007), so a generated
-- tsvector would ride every change a tab receives; an index adds nothing to a row. 'simple', not a stemmer: the
-- workspaces write English and Spanish, and a word is found as it was written. The function runs as the caller
-- (security invoker), so messages_member_select and calls_member_select decide what it answers, as they decide every
-- other read of those rows; RLS is unchanged.
--
-- Each predicate spells its index's expression exactly, so search_messages CAN read the indexes; which way it reads is
-- the planner's. A SQL function's statements are planned without their arguments, and the planner walks the
-- workspace's newest rows in the window, testing each, whenever it judges that cheaper than the index: at today's
-- sizes, always. The words are parsed once per statement, in a sub-select, never again for each row a walk tests. They
-- are websearch_to_tsquery's, safe on anything a person types. Words whose query could match a message holding none of
-- them -- only exclusions (-parking), or an `or` with one (valet or -parking) -- have nothing to look for and answer
-- nothing, as blank words do; so does any null argument (strict: a limit that is no number answers nothing, not one
-- row). The words around a match are headlined for the rows the limit keeps, never for every match. Forward-only;
-- re-runnable: each index is made only where it is missing, and the function is replaced whole.

create index if not exists messages_body_words
  on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

create index if not exists calls_transcript_words
  on public.calls using gin (to_tsvector('simple', coalesce(transcript, '')));

create or replace function public.search_messages(p_tenant uuid, p_words text, p_since timestamptz, p_limit integer)
returns table (
  kind text,
  id uuid,
  conversation_id uuid,
  contact_id uuid,
  channel text,
  direction text,
  at timestamptz,
  snippet text
)
language sql
stable
strict
security invoker
set search_path = public
as $$
  -- The words, parsed once per statement: each (select websearch_to_tsquery(...)) is an initPlan the scan reads as a
  -- value, however many rows it tests. querytree() is '' for no words and 'T' for a query a row holding none of them
  -- could match: nothing to look for, so neither table is read (a one-time filter, evaluated once).
  with hits as (
    (select 'message'::text as kind, m.id, m.conversation_id, m.contact_id, m.channel, m.direction,
            m.created_at as at, m.body as said
       from public.messages m
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and m.tenant_id = p_tenant
        and m.created_at >= p_since
        and to_tsvector('simple', coalesce(m.body, '')) @@ (select websearch_to_tsquery('simple', p_words))
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 50))
    union all
    (select 'call'::text, c.id, c.conversation_id, c.contact_id, null::text, c.direction,
            coalesce(c.started_at, c.created_at), c.transcript
       from public.calls c
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and c.tenant_id = p_tenant
        and coalesce(c.started_at, c.created_at) >= p_since
        and to_tsvector('simple', coalesce(c.transcript, '')) @@ (select websearch_to_tsquery('simple', p_words))
      order by coalesce(c.started_at, c.created_at) desc, c.id desc
      limit least(greatest(p_limit, 1), 50))
  ),
  kept as (
    select h.* from hits h order by h.at desc, h.id desc limit least(greatest(p_limit, 1), 50)
  )
  -- The words around the match, for the kept rows only: no markup, one fragment.
  select k.kind, k.id, k.conversation_id, k.contact_id, k.channel, k.direction, k.at,
         ts_headline('simple', k.said, (select websearch_to_tsquery('simple', p_words)),
                     'MaxFragments=1, MaxWords=24, MinWords=8, StartSel="", StopSel=""')
    from kept k
   order by k.at desc, k.id desc
$$;

comment on function public.search_messages(uuid, text, timestamptz, integer) is
  'One workspace''s messages and call transcripts that hold the words (websearch_to_tsquery, the ''simple'' configuration), since p_since, newest first, at most least(greatest(p_limit, 1), 50) rows: kind (message | call), the message''s or the call''s id, its conversation and person, a message''s channel (null for a call), direction, when (a call: when it started, else when it was recorded), and the words around the match. Under the caller''s row security. Blank words, and words whose query could match a message holding none of them (only exclusions, or an `or` with one), answer nothing; so does any null argument (strict) (00219).';

revoke execute on function public.search_messages(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.search_messages(uuid, text, timestamptz, integer) to authenticated, service_role;
