-- 00163 · The question says where it waits
--
-- A search that stops after its first places to ask "is that what you meant?"
-- rang the bell as "Your search for … needs you", pointing at the search's
-- counted view. Under an email standard nothing is counted while it waits, so
-- the owner landed on an empty table; the places the question is about (the
-- ones left out) were a tab away, and the bell's button said "Open People".
-- And a question nobody answered, which ends its round by itself after a day,
-- then rang "is done · Nothing new was counted" over it.
--
-- lead_rounds_notify, 00142's body word for word but three things: the title
-- says what the search is waiting for, the question's row opens on the
-- left-out pile (contracts leadQuestionRoute), and question_unanswered rings
-- nothing, as stopped rings nothing: the question's own row and the strip's
-- "Stopped after a day without your answer" already say it.

create or replace function public.lead_rounds_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_n    integer;
begin
  select s.name into v_name from public.lead_searches s where s.id = NEW.search_id;
  if v_name is null then return null; end if;
  if NEW.state = 'waiting_on_owner' and coalesce(OLD.state, '') <> 'waiting_on_owner' then
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_question', left('Your search for ' || v_name || ' is waiting for your answer', 200),
           coalesce(NEW.question->>'sentence', ''), 'clients/leads:s-' || NEW.search_id::text || ':c-excluded', 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_question' and n.subject_id = NEW.id::text);
  elsif NEW.state = 'ended' and coalesce(OLD.state, '') <> 'ended' and coalesce(NEW.ending, '') not in ('stopped', 'question_unanswered') then
    select count(*)::integer into v_n from public.lead_search_members m
     where m.round_id = NEW.id and m.class = 'qualified' and m.blanked_at is null;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    select NEW.tenant_id, 'leads_ready', left('Your search for ' || v_name || ' is done', 200),
           case when v_n > 0 then v_n || ' found.' else 'Nothing new was counted.' end,
           'clients/leads:s-' || NEW.search_id::text, 'lead_round', NEW.id::text
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = NEW.tenant_id and n.kind = 'leads_ready' and n.subject_id = NEW.id::text);
  end if;
  return null;
end $$;
drop trigger if exists lead_rounds_notify on public.lead_rounds;
create trigger lead_rounds_notify after update of state on public.lead_rounds
  for each row execute function public.lead_rounds_notify();
comment on function public.lead_rounds_notify() is
  'The bell''s two lead kinds: one leads_question row when a round stops to ask, pointing at the search''s left-out pile (the places the question is about), and one leads_ready row when it ends with anything but "stopped" or "question_unanswered", pointing at the search; each once per round. A member''s own read mark is notification_marks'', as for every other kind.';
revoke execute on function public.lead_rounds_notify() from public, anon, authenticated;
