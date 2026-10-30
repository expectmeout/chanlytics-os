-- 00494 · A search counts the leads it shows, and a sequence's list says it is one.
--
-- A search's Qualified tab said 21 over 20 rows (the walk of 30 Oct 2026, on a search whose round reached its target of
-- 20): the view counted every qualified membership, and the page shows a qualified one only once it is counted
-- (lead_member_shown, 00212), so a lead found past the target, or past the month's allowance, was in the number and on
-- no row. The view asks the page's rule now, for every count of what Qualified holds: qualified, the fit bands over the
-- table (strong, look, long), and the addresses and numbers its Done strip says (emails_checked, with_phone), which the
-- read already called counted leads. review, excluded and counted are as they were.
--
-- And a sequence's own list (00459 reach_out_list_for: named for its sequence, the leads added to it by hand) stood in
-- the rail among the searches, beside the search its leads came from and under its name: it says it is a sequence's now,
-- so the rail draws it with the sequences.
--
--   lead_searches_view   as 00459 wrote it, its qualified counts asking lead_member_shown, and sequence_list on the end:
--                        whether a sequence's steps name this search as their list (sequence_steps.lead_search_id).
--
-- Deploy order: either. The columns and their types are the same, so a dashboard from before this reads it as it did,
-- and one from after reads 00459's numbers until it is applied. Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace view public.lead_searches_view with (security_invoker = true) as
select s.id, s.tenant_id, s.created_by, s.via, s.card, s.name, s.asked, s.plan, s.removed_at, s.created_at,
       r.id as round_id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
       r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at,
       coalesce(c.qualified, 0) as qualified, coalesce(c.review, 0) as review, coalesce(c.excluded, 0) as excluded,
       coalesce(c.counted, 0) as counted, coalesce(c.emails_checked, 0) as emails_checked, coalesce(c.with_phone, 0) as with_phone,
       u.id as undo_op_id, u.version as undo_version,
       coalesce(r.nearby, '[]'::jsonb) as nearby,
       coalesce(c.strong, 0) as strong, coalesce(c.look, 0) as look, coalesce(c.long, 0) as long,
       s.thread_id, s.adds_to,
       coalesce(q.owned, false) as sequence_list
  from public.lead_searches s
  left join lateral (
    select r.id, r.seq, r.purpose, r.state, r.ending, r.ending_pending, r.question, r.answered, r.target,
           r.plan_version, r.judge_tokens, r.cost_usd, r.waiting_since, r.ended_at, r.nearby
      from public.lead_rounds r where r.search_id = s.id order by r.seq desc limit 1
  ) r on true
  left join lateral (
    -- Qualified is what its tab shows: a qualified membership once it is counted, as the page asks (00212).
    select count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted)) as qualified,
           count(*) filter (where m.class = 'review' and m.blanked_at is null)    as review,
           count(*) filter (where m.class = 'excluded')                           as excluded,
           count(*) filter (where m.counted)                                      as counted,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted) and l.email_state = 'ok')  as emails_checked,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted) and l.phone_e164 is not null and not l.phone_wrong) as with_phone,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted) and m.fit = 'strong') as strong,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted) and m.fit = 'look')   as look,
           count(*) filter (where m.class = 'qualified' and m.blanked_at is null and public.lead_member_shown(m.class, m.counted) and m.fit = 'long')   as long
      from public.lead_search_members m join public.leads l on l.id = m.lead_id where m.search_id = s.id
  ) c on true
  left join lateral (
    select o.id, o.version from public.lead_operations o
     where o.search_id = s.id and o.kind = 'undo_search' and o.undone_at is null and o.at > now() - interval '24 hours'
     order by o.at desc limit 1
  ) u on true
  left join lateral (
    select true as owned from public.sequence_steps st where st.lead_search_id = s.id limit 1
  ) q on true;
comment on view public.lead_searches_view is
  'Every column of lead_searches with its latest round (round_id, seq, purpose, state, ending, ending_pending, question, answered, target, plan_version, judge_tokens, cost_usd -- what that round has spent, so cost per Qualified lead is read from here -- waiting_since and ended_at) and its counts over the members: qualified (what the Qualified tab shows: a qualified membership once it is counted, lead_member_shown, 00494), review, excluded, counted, emails_checked (a lead Qualified shows whose address was checked and answered) and with_phone (a lead Qualified shows with a number nobody has marked wrong). Excluded members stay counted after their details are blanked, so "40 left out" stays 40. undo_op_id and undo_version name the operation this search''s Undo takes while its twenty-four hours run, and are null once it is undone or the day is out. nearby (00145): where to look next when the round ran dry, the nearest ZIP centres past its area, nearest first; [] otherwise. strong, look and long (00146): the leads Qualified shows by fit band, for the band bar over the table. thread_id (00172): the Ask thread the search was planned in, or null. adds_to (00459): the sequence this search''s Add goes to. sequence_list (00494): whether this search is a sequence''s own list, the one its steps name (sequence_steps.lead_search_id), which the rail draws with the sequences.';
