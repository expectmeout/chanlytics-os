-- 00596 · A library is searched where it is kept (decision 0099; the content backend review's R4).
--
-- Ask read every row of a workspace's files, with its look, whenever it touched them, up to 1,000, and found a file by its
-- words in memory, reading every video's sound again to do it. The search moves to the database, the way Ask's own search
-- and the message search are done (00219): the 'simple' configuration, a search box's grammar, one index.
--
--   file_search_words   The words a file is found by, as one text: its name, what its look saw (its sentence, the words
--                       written in it, the moments of a video), how a video sounds, and what is said in it. Immutable, so
--                       an index is built of it.
--   files_found_words   The index: those words of every file kept, as the 'simple' configuration reads them.
--   files_found         One page of one shelf, newest first, and how many there are in all: the ids alone, so the rows
--                       are read through the member's own columns (packages/db files.ts). The shelf is contracts'
--                       shelfFilterOf, given as its parts. Words left out or blank find every file on the shelf; words
--                       a search could match nothing by, or only by what is not there, find none, as search_messages.
--                       Under the caller's row security.
--
-- Deploy order: either. Nothing calls files_found before the dashboard that does; that dashboard, on a database before this
-- one, is refused the function and Ask says it could not read the files, as a failed read does. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.file_search_words(p_name text, p_look jsonb, p_sound_said text, p_sound jsonb)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select coalesce(p_name, '') || ' ' || coalesce(p_look ->> 'line', '') || ' '
      || coalesce(jsonb_path_query_array(p_look, '$.text_seen[*]')::text, '') || ' '
      || coalesce(jsonb_path_query_array(p_look, '$.moments[*].what')::text, '') || ' '
      || coalesce(p_sound_said, '') || ' ' || coalesce(p_sound -> 'words' ->> 'text', '')
$$;

comment on function public.file_search_words(text, jsonb, text, jsonb) is
  'The words a file is found by, as one text (00596): its name, its look''s sentence, the words written in it and a video''s moments, how a video sounds and what is said in it. Immutable: files_found_words is an index of it.';

revoke all on function public.file_search_words(text, jsonb, text, jsonb) from public, anon;
grant execute on function public.file_search_words(text, jsonb, text, jsonb) to authenticated, service_role;

create index if not exists files_found_words on public.files
  using gin (to_tsvector('simple'::regconfig, public.file_search_words(name, look, sound_said, sound)))
  where removed_at is null;

create or replace function public.files_found(
  p_tenant_id uuid,
  p_status text,
  p_limit integer,
  p_offset integer default 0,
  p_made boolean default null,
  p_shows text[] default null,
  p_or_unsorted boolean default false,
  p_words text default null
)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with matched as (
    select f.id, f.created_at
      from public.files f
     where f.tenant_id = p_tenant_id
       and f.removed_at is null
       -- A video whose bytes are still on their way is no file yet (00556), as every member read says.
       and (f.media_status is null or f.media_status <> 'uploading')
       and f.status = p_status
       and (p_made is null or (f.source = 'made') = p_made)
       and (p_shows is null or f.shows = any (p_shows) or (coalesce(p_or_unsorted, false) and f.shows is null))
       and (
         nullif(btrim(coalesce(p_words, '')), '') is null
         or (querytree(websearch_to_tsquery('simple', p_words)) not in ('', 'T')
             and to_tsvector('simple', public.file_search_words(f.name, f.look, f.sound_said, f.sound))
                 @@ (select websearch_to_tsquery('simple', p_words)))
       )
  ),
  page as (
    select m.id, m.created_at
      from matched m
     order by m.created_at desc, m.id desc
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_limit, 1), 1), 1000)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(p.id order by p.created_at desc, p.id desc) from page p), '[]'::jsonb),
    'total', (select count(*) from matched)
  )
$$;

comment on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text) is
  'One page of one shelf of a workspace''s files, newest first, and how many in all (00596): {ids, total}. The shelf is contracts'' shelfFilterOf as its parts (status, made, shows, or unsorted). Words (websearch_to_tsquery, the ''simple'' configuration) are found in file_search_words; left out or blank, every file on the shelf; words that could match nothing, or only by what is not there, none. At most 1,000 a page. Under the caller''s row security.';

revoke all on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text) from public, anon;
grant execute on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text) to authenticated, service_role;
