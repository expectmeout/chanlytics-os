-- 00491 · A search whose source failed says it stopped.
--
-- A round that ends source_failed rang "Your search for … is done", in good news's green: on 29 Oct 2026 the salon
-- search's collects failed for good fourteen times, each told on its own as "A search stopped partway", while the search's
-- one notice of its own would have called it done. A collect tells nobody now (packages/jobs TOLD_ELSEWHERE): the sweep
-- ends a run whose collects keep failing, and this row is the owner's one notice of the stop, in the strip's words
-- (contracts leadEndingLine): "didn't run: the source couldn't start it" where nothing came back, "stopped: the source
-- stopped answering" where places did. Contracts draws both as a warning (waits/notice-tones.ts).
--
--   lead_rounds_notify   replaced whole from its latest body (00421) with that one change to a search's title. A list
--                        (via import) keeps its words; every other ending keeps "is done".
-- Re-runnable throughout.

set local lock_timeout = '3s';

create or replace function public.lead_rounds_notify() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_via  text;
  v_n    integer;
  v_seen boolean;
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
    -- Whether the source returned anything at all, in any class: the strip's "seen" (00491).
    select exists (select 1 from public.lead_search_members m where m.round_id = NEW.id) into v_seen;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready',
           case when v_via = 'import' then
                  case when NEW.ending in ('target_reached', 'searched_everything') then left('Your list ' || v_name || ' is checked', 200)
                       else left('Your list ' || v_name || ' could not be checked', 200) end
                when NEW.ending = 'source_failed' and not v_seen then
                  left('Your search for ' || v_name || ' didn''t run: the source couldn''t start it', 200)
                when NEW.ending = 'source_failed' then
                  left('Your search for ' || v_name || ' stopped: the source stopped answering', 200)
                else left('Your search for ' || v_name || ' is done', 200) end,
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
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, pointing at the search''s left-out pile (the places the question is about), and one leads_ready row when it ends with anything but "stopped" or "question_unanswered", pointing at the search; each once per round, each with a push_send job so a phone hears it too. A search whose source failed says so (00491): "didn''t run: the source couldn''t start it" when nothing came back, "stopped: the source stopped answering" when places did, a warning in contracts'' notice-tones; every other ending "is done". A file of the owner''s own (via import, 00242) rings "Your list … is checked" with how many have a checked address once its check ran, or "could not be checked" when the check ended any other way; a chosen search rings nothing. A round that leaves waiting_on_owner closes its question row for everyone (00421, notifications_close_about). A member''s own read mark is notification_marks'', as for every other kind.';
