-- 00728 · A post that promises an opening waits when the opening cannot be read (the outside review of 28 Nov 2026,
-- R3.9; lane 5 of the whole-system plan).
--
-- A post whose reason names open time ("Thursday has openings") is asked again right before it goes (the content loop
-- PRD's 6.1, the seventh check). Where the book could not be read at that moment, the post went anyway. It now asks
-- again a minute on, a few times, and is then held with a why of its own, `reason_unread`, which the page reads apart
-- from a reason that has passed. This file only lets the two columns that keep a hold's why take the new one:
--
--   posts.held_why            gains reason_unread
--   plan_slots.blocked_why    gains reason_unread (a slot is held for what holds a post: contracts SlotHeldWhy)
--
-- Each check is read as it stands, given the one value where it lacks it, and written back in its own order, so the
-- file may run twice. The code that writes the new why lands with it: on a database without this file its hold would be
-- refused, so this goes on before the merge.
--
-- And a send's next ask becomes a job the ledger takes. A send that asks again a minute on writes that ask from inside
-- itself, while it still holds its own once-only key (the kind, the post, the attempt). The next ask carried the same
-- key, so the ledger refused it as a second of the same job (jobs_dedupe_live) and said nothing: the send ended, and the
-- post stayed where it stood, never sent and never held. That is how the wait for a new version (00708) has stood since
-- it was written, and how the wait for an opening would have. The two kinds' keys now also carry how often the send
-- has asked, where its payload says (job_dedupe_key_of's optional parts): a first send's key is what it was.
--
--   job_kinds   post_publish  once_parts post_id, attempt, wait?, unread?
--               post_google   once_parts post_id, attempt, unread?
--
-- No function, column or grant changes.

set local lock_timeout = '3s';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_publish', 2, array['post_id', 'attempt', 'wait?', 'unread?'], false),
  ('post_google', 2, array['post_id', 'attempt', 'unread?'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

do $$
declare
  v_whys text[];
begin
  select array_agg(found.m[1] order by found.at) into v_whys
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.posts'::regclass and c.conname = 'posts_held_why_check';
  if coalesce(cardinality(v_whys), 0) = 0 then
    raise exception 'posts_held_why_check: the values it holds could not be read';
  end if;
  if not 'reason_unread' = any (v_whys) then
    v_whys := v_whys || 'reason_unread'::text;
    alter table public.posts drop constraint posts_held_why_check;
    execute 'alter table public.posts add constraint posts_held_why_check check (held_why = any (array['
      || (select string_agg(quote_literal(k.v), ', ' order by k.at) from unnest(v_whys) with ordinality as k(v, at))
      || ']))';
  end if;

  select array_agg(found.m[1] order by found.at) into v_whys
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.plan_slots'::regclass and c.conname = 'plan_slots_blocked_why_check';
  if coalesce(cardinality(v_whys), 0) = 0 then
    raise exception 'plan_slots_blocked_why_check: the values it holds could not be read';
  end if;
  if not 'reason_unread' = any (v_whys) then
    v_whys := v_whys || 'reason_unread'::text;
    alter table public.plan_slots drop constraint plan_slots_blocked_why_check;
    execute 'alter table public.plan_slots add constraint plan_slots_blocked_why_check check (blocked_why is null or blocked_why = any (array['
      || (select string_agg(quote_literal(k.v), ', ' order by k.at) from unnest(v_whys) with ordinality as k(v, at))
      || ']))';
  end if;
end $$;
