-- 00218 · Messages and call transcripts have a text index.
--
-- Ask Rewired, Phase 4 (D6). Nothing in the database can find a word a customer wrote or said: the Inbox's search
-- filters the rows the browser already holds, and no index covers a message's body or a call's transcript. Two
-- expression GIN indexes do now, each over to_tsvector('simple', coalesce(<text>, '')), and search_messages reads them
-- for one workspace: its message hits and its call-transcript hits together, newest first, none older than the moment
-- the caller names, at most fifty, each with the words around the match. A call_summary message is a message hit like
-- any other; a transcript hit is its call. Nothing calls it yet (PR 4.5 adds the reader).
--
-- No stored column: messages and calls are published to realtime with no column list (00002, 00007), so a generated
-- tsvector would ride every change a tab receives; an index adds nothing to a row. 'simple', not a stemmer: the
-- workspaces write English and Spanish, and a word is found as it was written. The function runs as the caller
-- (security invoker), so messages_member_select and calls_member_select decide what it answers, as they decide every
-- other read of those rows; RLS is unchanged. Its predicates spell the index expressions exactly, or the index is not
-- used. The words are websearch_to_tsquery's, safe on anything a person types; blank words, or words that only
-- exclude (-parking), have nothing to look for and answer nothing. The words around a match are headlined for the rows
-- the limit keeps, never for every match. Forward-only; re-runnable: each index is made only where it is missing, and
-- the function is replaced whole.

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
security invoker
set search_path = public
as $$
  -- The words are spelled where each is used, never carried in from a CTE: a planner that is handed them reads them
  -- (a rare word goes through the index), and one that is not still matches the index expression. querytree() is ''
  -- for no words at all and 'T' for words that only exclude: nothing to find, so neither table is read.
  with hits as (
    (select 'message'::text as kind, m.id, m.conversation_id, m.contact_id, m.channel, m.direction,
            m.created_at as at, m.body as said
       from public.messages m
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and m.tenant_id = p_tenant
        and m.created_at >= p_since
        and to_tsvector('simple', coalesce(m.body, '')) @@ websearch_to_tsquery('simple', p_words)
      order by m.created_at desc, m.id desc
      limit least(greatest(p_limit, 1), 50))
    union all
    (select 'call'::text, c.id, c.conversation_id, c.contact_id, null::text, c.direction,
            coalesce(c.started_at, c.created_at), c.transcript
       from public.calls c
      where querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
        and c.tenant_id = p_tenant
        and coalesce(c.started_at, c.created_at) >= p_since
        and to_tsvector('simple', coalesce(c.transcript, '')) @@ websearch_to_tsquery('simple', p_words)
      order by coalesce(c.started_at, c.created_at) desc, c.id desc
      limit least(greatest(p_limit, 1), 50))
  ),
  kept as (
    select h.* from hits h order by h.at desc, h.id desc limit least(greatest(p_limit, 1), 50)
  )
  -- The words around the match, for the kept rows only: no markup, one fragment.
  select k.kind, k.id, k.conversation_id, k.contact_id, k.channel, k.direction, k.at,
         ts_headline('simple', k.said, websearch_to_tsquery('simple', p_words),
                     'MaxFragments=1, MaxWords=24, MinWords=8, StartSel="", StopSel=""')
    from kept k
   order by k.at desc, k.id desc
$$;

comment on function public.search_messages(uuid, text, timestamptz, integer) is
  'One workspace''s messages and call transcripts that hold the words (websearch_to_tsquery, the ''simple'' configuration), since p_since, newest first, at most least(greatest(p_limit, 1), 50) rows: kind (message | call), the message''s or the call''s id, its conversation and person, a message''s channel (null for a call), direction, when, and the words around the match. Under the caller''s row security. Blank words, or words that only exclude, answer nothing (00218).';

revoke execute on function public.search_messages(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.search_messages(uuid, text, timestamptz, integer) to authenticated, service_role;
