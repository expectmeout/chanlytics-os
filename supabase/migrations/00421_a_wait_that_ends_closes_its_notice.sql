-- 00421 · A wait that ends closes its notice (the wiring's second audit, lane R2: S7-4, S6-3, W-person-list-lead-4,
-- W-channel-team-plus-4).
--
-- The bell keeps a row for what asks the owner something: a thread that needs a person (handoff, deadman, call), a lead
-- search that stopped to ask (leads_question), offers by email paused. Once what it asked for ended (the hold resolved, the
-- question answered, the pause lifted) the row stayed unread and amber for every member, on every device and on the
-- phone's icon, until each read it: the record said nothing of the end, so nothing but a member's own read could close it.
--
--   notifications.closed_at   new: when what the row asked for ended for good, for everyone. Null while it may still ask.
--                             A closed row reads as read and wears no warning (contracts settledRow); a member's own read
--                             stays notification_marks'. The service role and the definer functions write it; a member may
--                             not (the table's only policy is SELECT).
--   notifications_close_about   the one door that closes rows: a workspace's open rows of some kinds about one subject (and
--                             of one title, where given) within the bell's window, each once. The service role's, and the
--                             definer functions below call it. A close is a mark on a kept row, not a fact, so it writes no
--                             event.
--   escalation_closes_its_notices   a trigger: a hold that goes open -> resolved, whoever resolves it (a reply, an archive,
--                             Done, a hand-back, a reach-out reply read), closes the handoff, deadman and call rows about
--                             its thread. A snooze, a take-over or a pause leave the hold open and close nothing. Never
--                             fails the resolve: a failure is a warning, as escalations_note_change's.
--   lead_rounds_notify       replaced whole from its latest body (00242), closing the round's question row when the round
--                             leaves waiting_on_owner (answered keep or include, stopped, or ended unanswered): a round
--                             waits on its owner once (lead_rounds_guard), so the question is settled for good. Asked
--                             before its early returns, so a list or a chosen search closes its question too.
--   resume_email_offers      replaced whole from its latest body (00299), closing the bell's pause notice of the workspace
--                             (contracts OFFERS_NOTICE_WORDS.paused's title; the db test holds the two equal).
--   workspace_tell_update    on notifications: a row's closed_at moving is told on the live feed (00408's row function,
--                             narrowed to that column), so every tab's bell and badge drop a notice another member's act
--                             ended, where only a new row was told. A member's own read is notification_marks', not told.
--
-- Then the bell's window is closed once over what already ended: hold rows whose thread's hold resolved after the row was
-- kept and has no open hold now (a row kept because the hold could not be written -- a deadman's or a failed delivery's --
-- has no resolve behind it, and stays), questions whose round has left waiting_on_owner, and pause notices of a workspace
-- whose offers are no longer paused. These are one-off
-- scans of thirty days of notifications across workspaces (the (tenant_id, created_at) index cannot serve a range on
-- created_at alone), re-runnable: each closes only rows still open. Mended warnings (a number's quality, a domain's hold,
-- billing) are closed by the edge when their mend is kept (contracts NOTICE_MENDS) and are not backfilled.
--
-- Deploy order: either. An app from before this reads no closed_at and counts the rows as it did; the new apps read a
-- missing closed_at as open.

alter table public.notifications add column if not exists closed_at timestamptz;

comment on column public.notifications.closed_at is
  'When what the row asked for ended for good, for everyone (00421): the hold it told of resolved (escalation_closes_its_notices), the question it asked settled (lead_rounds_notify), the offers pause it told of lifted (resume_email_offers), or the warning mended by news the edge kept after it (contracts NOTICE_MENDS). Null while it may still ask. A closed row reads as read and wears no warning; a member''s own read stays notification_marks''. Written by the service role and the definer functions only: the table''s one policy is SELECT.';

-- The one door that closes rows.
create or replace function public.notifications_close_about(
  p_tenant_id uuid,
  p_kinds text[],
  p_subject_type text,
  p_subject_id text,
  p_title text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer;
begin
  update public.notifications n
     set closed_at = now()
   where n.tenant_id = p_tenant_id
     and n.kind = any (p_kinds)
     and (p_subject_type is null or (n.subject_type = p_subject_type and n.subject_id = p_subject_id))
     and (p_title is null or n.title = p_title)
     and n.closed_at is null
     and n.created_at >= now() - interval '30 days';
  get diagnostics v_closed = row_count;
  return v_closed;
end $$;

comment on function public.notifications_close_about(uuid, text[], text, text, text) is
  'Closes a workspace''s open bell rows of the given kinds about one subject (and of one title, where given) within the bell''s window (contracts BELL_WINDOW_DAYS), each once, and answers how many it closed (00421). The one door: the hold trigger, the lead-round notifier and resume_email_offers call it. A close is a mark on a kept row, not a fact, so it writes no event. Service role only.';

revoke all on function public.notifications_close_about(uuid, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.notifications_close_about(uuid, text[], text, text, text) to service_role;

-- A hold that resolves closes the rows about its thread.
create or replace function public.escalation_closes_its_notices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notifications_close_about(
    NEW.tenant_id, array['handoff', 'deadman', 'call'], 'conversation', NEW.conversation_id::text
  );
  return null;
exception when others then
  raise warning 'escalation_closes_its_notices: %', sqlerrm;
  return null;
end $$;

comment on function public.escalation_closes_its_notices() is
  'Closes the open handoff, deadman and call rows about a hold''s thread when the hold goes open -> resolved, whoever resolves it (00421, through notifications_close_about); a snooze, a take-over or a pause leave the hold open and close nothing. Never fails the resolve: a failure is a warning.';

revoke all on function public.escalation_closes_its_notices() from public, anon, authenticated;

drop trigger if exists escalation_closes_its_notices on public.escalations;
create trigger escalation_closes_its_notices
  after update of state on public.escalations
  for each row
  when (old.state = 'open' and new.state = 'resolved')
  execute function public.escalation_closes_its_notices();

-- The lead round's notifier, replaced whole from 00242 with the question's close first.
create or replace function public.lead_rounds_notify() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_via  text;
  v_n    integer;
  v_id   uuid;
begin
  -- A round that leaves waiting_on_owner has settled its question for good (a round waits on its owner once): its row
  -- closes, for a list and a chosen search too, so this comes before the returns below (00421).
  if OLD.state = 'waiting_on_owner' and NEW.state is distinct from 'waiting_on_owner' then
    perform public.notifications_close_about(NEW.tenant_id, array['leads_question'], 'lead_round', NEW.id::text);
  end if;
  select s.name, s.via into v_name, v_via from public.lead_searches s where s.id = NEW.search_id;
  if v_name is null then return null; end if;
  -- A list: a file rings once its check ran; a choice never rings (00242).
  if v_via = 'chosen' or (v_via = 'import' and coalesce(OLD.state, '') <> 'checking') then return null; end if;
  if NEW.state = 'waiting_on_owner' and coalesce(OLD.state, '') <> 'waiting_on_owner' then
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_question', left('Your search for ' || v_name || ' is waiting for your answer', 200),
           coalesce(NEW.question->>'sentence', ''), 'clients/leads:s-' || NEW.search_id::text || ':c-excluded', 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_question' and n.subject_id = NEW.id::text)
    returning id into v_id;
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') not in ('stopped', 'question_unanswered') then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready',
           case when v_via <> 'import' then left('Your search for ' || v_name || ' is done', 200)
                when NEW.ending in ('target_reached', 'searched_everything') then left('Your list ' || v_name || ' is checked', 200)
                else left('Your list ' || v_name || ' could not be checked', 200) end,
           case when v_via <> 'import' then case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end
                when NEW.ending not in ('target_reached', 'searched_everything') then 'Its addresses wait in Needs review.'
                when v_n > 0 then v_n || ' have a checked address.' else 'None of the addresses checked out.' end,
           'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_ready' and n.subject_id = NEW.id::text)
    returning id into v_id;
  end if;
  -- The phone hears what the bell hears (00162's push_send, payload { notification_id }).
  if v_id is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (NEW.tenant_id, 'push_send', now(), jsonb_build_object('notification_id', v_id));
  end if;
  return null;
end $$;

comment on function public.lead_rounds_notify() is
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, pointing at the search''s left-out pile (the places the question is about), and one leads_ready row when it ends with anything but "stopped" or "question_unanswered", pointing at the search; each once per round, each with a push_send job so a phone hears it too. A file of the owner''s own (via import, 00242) rings "Your list … is checked" with how many have a checked address once its check ran, or "could not be checked" when the check ended any other way; a chosen search rings nothing. A round that leaves waiting_on_owner closes its question row for everyone (00421, notifications_close_about). A member''s own read mark is notification_marks'', as for every other kind.';

-- The offers resume, replaced whole from 00299 with the pause notice's close.
create or replace function public.resume_email_offers(p_tenant_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox uuid;
  v_since   timestamptz;
  v_reason  text;
begin
  select m.id, m.offers_paused_at, m.offers_paused_reason into v_mailbox, v_since, v_reason
    from public.mailboxes m
   where m.tenant_id = p_tenant_id and m.offers_paused_at is not null
     for update;
  if not found then
    return false;
  end if;
  -- The gates are judged afresh from here: only the offers sent after this moment count (email_offer_counts).
  update public.mailboxes
     set offers_paused_at = null, offers_paused_reason = null, offers_resumed_at = now()
   where id = v_mailbox;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox.offers_resumed', 'system', 'mailbox', v_mailbox,
          jsonb_build_object('reason', v_reason, 'paused_at', v_since));
  -- The bell's pause notice is closed: the pause it told of has lifted (00421; the title is contracts
  -- OFFERS_NOTICE_WORDS.paused's).
  perform public.notifications_close_about(
    p_tenant_id, array['sweep'], null, null, 'Offers and news by email are paused'
  );
  return true;
end $$;

comment on function public.resume_email_offers(p_tenant_id uuid) is
  'The back office''s: turns a workspace''s offers by email back on, once its list is fixed, stamps offers_resumed_at (the gates are then judged over the offers sent after it), writes a mailbox.offers_resumed event and closes the bell''s pause notice (00421). True when they were paused. Service role only.';

-- The bell hears a close: told when closed_at moved, by the row function, as 00408's narrowed updates are.
create or replace trigger workspace_tell_update after update of closed_at on public.notifications
  for each row when (old.closed_at is distinct from new.closed_at)
  execute function public.workspace_tell_row_change();

-- Once, over the bell's window: what already ended is closed.
update public.notifications n
   set closed_at = now()
 where n.closed_at is null
   and n.kind in ('handoff', 'deadman', 'call')
   and n.subject_type = 'conversation'
   and n.created_at >= now() - interval '30 days'
   and not exists (
     select 1 from public.escalations e
      where e.tenant_id = n.tenant_id and e.state = 'open' and e.conversation_id::text = n.subject_id
   )
   and exists (
     select 1 from public.escalations e
      where e.tenant_id = n.tenant_id and e.state = 'resolved' and e.conversation_id::text = n.subject_id
        and e.resolved_at >= n.created_at
   );

update public.notifications n
   set closed_at = now()
  from public.lead_rounds r
 where n.closed_at is null
   and n.kind = 'leads_question'
   and n.subject_type = 'lead_round'
   and r.id::text = n.subject_id
   and r.tenant_id = n.tenant_id
   and r.state <> 'waiting_on_owner'
   and n.created_at >= now() - interval '30 days';

update public.notifications n
   set closed_at = now()
 where n.closed_at is null
   and n.kind = 'sweep'
   and n.title = 'Offers and news by email are paused'
   and n.created_at >= now() - interval '30 days'
   and not exists (
     select 1 from public.mailboxes m where m.tenant_id = n.tenant_id and m.offers_paused_at is not null
   );
