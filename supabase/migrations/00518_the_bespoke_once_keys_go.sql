-- 00518 · Two of the bespoke once-only keys go (decision 0089; decision 0033, step 3).
--
-- jobs_dedupe_kept (00517) holds the rows jobs_email_ingest_uq and jobs_reply_read_once held, by the key the database
-- writes for every kind (00515). They go only once it is built and valid: a build that was interrupted leaves it
-- invalid, holding nothing, and dropping them over it would hold nothing at all. jobs_lead_collect_once stays:
-- lead_collect_commit, lead_round_stop and lead_search_remove write the next collect `on conflict ((payload->>'run_id'),
-- (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed'`, which only that index answers; it goes when
-- they are next written, with a bare `on conflict do nothing`. It holds the same rows as jobs_dedupe_kept, and is checked
-- first (its index is older), so a duplicate is refused the same either way. Re-runnable.

do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'jobs_dedupe_kept'
       and c.relnamespace = 'public'::regnamespace
       and i.indisvalid
  ) then
    raise exception '00518: jobs_dedupe_kept is missing or invalid; drop it, run 00517 again, then this file';
  end if;
end
$$;

comment on index public.jobs_dedupe_kept is
  'A subject held once while its row is kept and not failed (job_kinds.once_kept, 00515, 00517): a webhook replayed after the work was done finds it, and a failed row never blocks a replay.';

drop index if exists public.jobs_email_ingest_uq;
drop index if exists public.jobs_reply_read_once;
