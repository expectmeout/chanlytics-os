-- 00233 · A lead's listings are indexed by the lead.
--
-- lead_places keeps the duplicate listings folded into a lead (00140 :249-258), and four things find them by the lead
-- alone: the Leads page counts each row's (leads_page, 00212 :76), the peek counts one lead's (packages/db leads.ts),
-- lead_blank deletes them when retention or erasure blanks a lead (00161), and deleting a lead cascades to them. The
-- table's keys are its id and (tenant_id, place_id), and neither starts with the lead, as lead_search_members_lead
-- (00140 :284) does for the memberships. Postgres 17 cannot seek an index by its second column, and a member's RLS
-- policy, tenant_id in (...), is a filter rather than a key. So each of those reads went through every workspace's
-- listings: the Leads page once per row, up to 500 times a page, and the nightly purge once per lead it blanked.
--
-- Modelled on Postgres 16 with 200 workspaces of 2,000 leads, one in five holding a duplicate listing (80,000 in
-- all): a workspace's first page of 500 took 2.0 s, and blanking 200 of its leads 0.97 s, each count a sequential
-- scan of every listing. With this index the page took 27 to 42 ms and the blanking 14 ms. The same rows come back;
-- only how they are found changes.
--
-- The index is built under a SHARE lock on lead_places: reads go on, and the finder's writes to it wait while it
-- builds. So the file sets the three-second guard 00140 and 00142 set: behind a long transaction it fails,
-- rather than queueing the finder's writes behind it, and is run again. SET LOCAL, since the Supabase CLI applies
-- each file inside one transaction; applied any other way, the block below says so.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

-- A lead's duplicate listings: the page's and the peek's count, lead_blank's delete, and a deleted lead's cascade.
create index if not exists lead_places_lead on public.lead_places (lead_id);
