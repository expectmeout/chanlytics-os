-- 00612 · A library finds what is meant (decision 0099; a review of 00597 the day it landed).
--
-- 00597 moved the library's search into the database and, with it, changed what a word finds: whole words only, as the
-- message search reads them. The search it replaced found a word anywhere, so "nail" found "nails" and "cut" found
-- "haircut"; neither found "salón" for "salon". A library is a workspace's own few hundred files, searched by Ask in the
-- words an owner used, so it is read the way the People list is (00250: a word anywhere in the text), with the case and the
-- accents of Latin letters taken off both sides.
--
--   search_fold         A text in lower case with its Latin accents taken off (slug_for_workspace's map), composed first so
--                       an accent typed as its own mark folds too. Immutable.
--   files_found         The same door and the same answer, {ids, total}. Words are split at anything that is not a letter
--                       or a digit, and every one of them (the first twelve) is found anywhere in file_search_words, both
--                       sides folded. No grammar: "or" and a leading "-" are words like any other. The text is folded once
--                       a file, and only where words are given.
--   files_found_words   The index of 00597 goes: nothing reads a file's words as a tsvector now, and a workspace keeps at
--                       most a thousand files (contracts FILES_MAX), which its own index (files_newest) reaches.
--
-- Deploy order: either. The door keeps its name, its arguments and its answer, so the dashboard before this one and the one
-- after it both read it. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.search_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select translate(
    lower(normalize(coalesce(p_text, ''), NFC)),
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůñńçćčšž',
    'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuunncccsz'
  )
$$;

comment on function public.search_fold(text) is
  'A text as a search reads it (00612): lower case, composed, the accents of Latin letters taken off (slug_for_workspace''s map), so salon finds salón. Immutable.';

revoke all on function public.search_fold(text) from public, anon;
grant execute on function public.search_fold(text) to authenticated, service_role;

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
  with asked as (
    -- The words, folded and split once a call: at most twelve, so a long text asks no more of a file than a question does.
    select coalesce(array_agg(w.word), '{}') as words
      from (
        select s.word
          from regexp_split_to_table(public.search_fold(p_words), '[^[:alnum:]]+') with ordinality as s (word, place)
         where s.word <> ''
         order by s.place
         limit 12
      ) w
  ),
  on_shelf as materialized (
    select f.id, f.created_at,
           -- Folded once a file, and only where there are words to find in it.
           case when cardinality(a.words) > 0
                then public.search_fold(public.file_search_words(f.name, f.look, f.sound_said, f.sound)) end as said
      from public.files f
     cross join asked a
     where f.tenant_id = p_tenant_id
       and f.removed_at is null
       -- A video whose bytes are still on their way is no file yet (00556), as every member read says.
       and (f.media_status is null or f.media_status <> 'uploading')
       and f.status = p_status
       and (p_made is null or (f.source = 'made') = p_made)
       and (p_shows is null or f.shows = any (p_shows) or (coalesce(p_or_unsorted, false) and f.shows is null))
  ),
  matched as (
    select s.id, s.created_at
      from on_shelf s
     cross join asked a
     where cardinality(a.words) = 0
        or not exists (select 1 from unnest(a.words) as w (word) where position(w.word in s.said) = 0)
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
  'One page of one shelf of a workspace''s files, newest first, and how many in all (00597, 00612): {ids, total}. The shelf is contracts'' shelfFilterOf as its parts (status, made, shows, or unsorted). Every word given (split at anything not a letter or a digit, the first twelve) is found anywhere in file_search_words, case and Latin accents aside (search_fold); left out or blank, every file on the shelf. At most 1,000 a page. Under the caller''s row security.';

drop index if exists public.files_found_words;
