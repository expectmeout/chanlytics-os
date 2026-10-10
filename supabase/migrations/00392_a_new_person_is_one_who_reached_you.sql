-- 00392 · A new person is one who reached you (Reports, the People lens).
--
-- contact_first_moments (00303) was a person's first word in EITHER direction, or first connected call in either
-- direction: an out-of-office from a new address, a list's mail, a reply the receptionist wrote and a call we placed each
-- made someone "new". 00379's header left the rule to the People lens. It is now a person's first REACH-IN: the earlier of
-- their first inbound message in their own words (direction inbound, sender customer, message_is_a_persons_words, 00299)
-- and their first inbound call that connected (call_connected, 00303). A message's time is its provider's (channel_ts),
-- else the row's own, so an inbound row the provider gave no time for is no longer dropped. Still absent: the erased, a
-- person whose history was moved in (meta.backfill), and a person with neither.
--
-- Its readers, which say one number: report_series (`fresh`: Overview's New people tile and the "New people, adding up"
-- card), metrics_summary (`fresh_contacts`: Today's New people, and Ask's `today` tool) and, from 00393, people_series.
-- What stays as it is: People's own person_moments.new_at and its "New this week" list (7 days, spoken words in either
-- direction, a call that did not fail, the row's own time as a floor); that is the People surface's reading, and decision
-- 0021's step 4 (point this function at new_at) is superseded for Reports and Today by the rule above.
--
-- What the numbers do: Overview, Today and Ask dip by the people an automatic reply or a call we placed had made new, and
-- rise by the few whose first inbound row had no provider time; a new person is always one who reached you in the window.
--
-- Either deploy order works: the function keeps its name, arguments and columns, and the dashboard reads the same shape.
-- Re-runnable: `create or replace`, and the grants and the comment are said again.

set local lock_timeout = '3s';

create or replace function public.contact_first_moments(p_tenant_id uuid)
returns table (contact_id uuid, first_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  -- Each person's first reach-in: their first inbound message in their own words or their first inbound call that
  -- connected, whichever came first. Absent: the erased (a deletion is never growth, 00026), a person whose history was
  -- imported (no true first moment), and a person who has neither reached us (a message or call we sent, an automatic
  -- reply, a dial nobody took: 00254, 00392).
  -- Each aggregate runs once per contact, in its own lateral, so the first moment is read once and filtered on.
  select c.id as contact_id, least(msg.at, call.at) as first_at
    from contacts c
    left join lateral (select min(coalesce(m.channel_ts, m.created_at)) as at from messages m
                        where m.contact_id = c.id
                          and m.direction = 'inbound' and m.sender = 'customer'
                          and public.message_is_a_persons_words(m.meta)) msg on true
    left join lateral (select min(k.started_at) as at from calls k
                        where k.contact_id = c.id
                          and k.direction = 'inbound'
                          and public.call_connected(k.status, k.duration_ms)) call on true
   where c.tenant_id = p_tenant_id
     and c.erased_at is null
     and least(msg.at, call.at) is not null
     and not exists (select 1 from messages b
                      where b.contact_id = c.id
                        and coalesce(b.meta->>'backfill', 'false') = 'true')
$$;

revoke all on function public.contact_first_moments(uuid) from public, anon;
grant execute on function public.contact_first_moments(uuid) to authenticated, service_role;

comment on function public.contact_first_moments(uuid) is
  'A person''s first reach-in, one row each: the earlier of their first inbound message in their own words (not an automatic reply, a list''s mail or a delivery report: message_is_a_persons_words) and their first inbound call that connected (call_connected), as first_at. None for a person who has only been written to or called by us, whose only mail was automated, or whose only call went unanswered; none for the erased, and none for anyone brought in with their history (a message with meta.backfill). The one rule for "a new person" in Reports and Today: report_series and metrics_summary read it (00392) and, from 00393, people_series. People''s own new_at and its "New this week" list are a wider reading and stay as they are.';
