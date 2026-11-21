-- 00668 · A search reads on from where its page ended (decision 0099; the outside audit of 20 Nov 2026).
--
-- Made's search (Campaigns › Content) read one page of at most 96, and the Library's one of 60, and each said nothing more
-- was there, so a business with hundreds of pieces or photos lost every older match without a word. A plain list reads on
-- from the last file it showed, by its time and its id (contracts fileCursorOf, packages/db listFilesOnShelf); a search now
-- reads on the same way, in the same order. A file kept between two pages moves nothing past the person and none is read
-- twice, as an offset would.
--
--   files_found   Two more arguments, p_before_at and p_before_id: the page ends just before that file, newest first with the
--                 id breaking a tie, as the plain list's does. Left out, the page starts at the top as before, and p_offset
--                 counts on from there (Ask's list). And p_kind, one kind alone (the Library's Photos or Videos), which the
--                 Library took out of a page after the search, so a page of videos could hold none and say there were no
--                 more. The total is still every match, whichever page is asked for. The old signature goes in the same
--                 transaction, so a call by name finds one function.
--
-- Deploy order: this first. A dashboard before it calls the door without the three arguments, which this one takes as left
-- out; the dashboard after it asks for a later page, or one kind, with them, which only this one answers. Re-runnable.

set local lock_timeout = '3s';

drop function if exists public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text);

create or replace function public.files_found(
  p_tenant_id uuid,
  p_status text,
  p_limit integer,
  p_offset integer default 0,
  p_made boolean default null,
  p_shows text[] default null,
  p_or_unsorted boolean default false,
  p_words text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_kind text default null
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
       and (p_kind is null or f.kind = p_kind)
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
     -- After the file the last page ended on, by its time and then its id, where one is named.
     where p_before_at is null or (m.created_at, m.id) < (p_before_at, p_before_id)
     order by m.created_at desc, m.id desc
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_limit, 1), 1), 1000)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(p.id order by p.created_at desc, p.id desc) from page p), '[]'::jsonb),
    'total', (select count(*) from matched)
  )
$$;

comment on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text, timestamptz, uuid, text) is
  'One page of one shelf of a workspace''s files, newest first, and how many in all (00597, 00612, 00668): {ids, total}. The shelf is contracts'' shelfFilterOf as its parts (status, made, kind, shows, or unsorted). Every word given (split at anything not a letter or a digit, the first twelve) is found anywhere in file_search_words, case and Latin accents aside (search_fold); left out or blank, every file on the shelf. Given p_before_at and p_before_id, the page ends just before that file, by its time and then its id, as the plain list''s does; the total is every match still. At most 1,000 a page. Under the caller''s row security.';

revoke all on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text, timestamptz, uuid, text) from public, anon;
grant execute on function public.files_found(uuid, text, integer, integer, boolean, text[], boolean, text, timestamptz, uuid, text) to authenticated, service_role;
