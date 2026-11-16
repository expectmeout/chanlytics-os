-- 00632 · A lead who tries their preview rings the bell, and Health counts what previews cost (decision 0079's sprint,
-- step 2: you hear about it when it matters).
--
-- A lead who texted or called their own preview was a row on Today, read only by whoever opened Today. Now the bell
-- says so as it happens, with their number, and Health can say how many previews were made and what they came to.
--
--   notifications.kind         Gains preview_tried: the bell's line when a lead first texts, and first calls, their preview.
--   lead_previews_notify       The trigger that writes it, as lead_rounds_notify writes a search's (00162): after
--                              preview_said or preview_called moves a count off zero, once for the first message and
--                              once for the first call. It names the business as its preview does and gives the lead's
--                              number where its listing has one nobody marked wrong. It never fails the lead's message
--                              or call: a line that could not be written is a warning in the log.
--   lead_tried_notes_forget    A lead blanked or erased leaves those lines without its name and its number, and closed:
--                              an update, which an open bell hears, where a delete is a change nothing is told of.
--   lead_previews_made_at      An index for "how many did this workspace make today" (the edge's daily limit, the card).
--   platform_health_previews   Health's read (service role): previews made in the window and today, how many were tried
--                              and made theirs, their messages and call seconds, and what the model cost on the preview
--                              workspaces that still stand, up to the moment each was made theirs.
--
-- No table changes. Either deploy order: until this is applied nothing writes the kind. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- 1. the bell's line -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook', 'calendar_people',
                           'alert', 'review', 'billing', 'template_ready', 'template_blocked', 'broadcast_sent',
                           'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you', 'reach_out_replied',
                           'reach_out_day', 'booking_notice', 'opted_out', 'booking', 'member_joined', 'member_left',
                           'note_to_keep', 'reply_held', 'ask_cards', 'website_form', 'files_waiting', 'video_ready',
                           'post_up', 'post_stopped', 'preview_tried']));

create or replace function public.lead_previews_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_did   text;
  v_name  text;
  v_phone text;
begin
  -- The first message, and the first call: each rings once. A count only rises, so its step off zero is the once.
  if OLD.asked_count = 0 and NEW.asked_count > 0 then
    v_did := 'texted';
  elsif OLD.call_count = 0 and NEW.call_count > 0 then
    v_did := 'called';
  else
    return null;
  end if;
  begin
    -- The name its preview answers by (the lead's, as it is called; lead_named keeps the two the same), else the lead's.
    select coalesce(nullif(btrim(t.name), ''), nullif(btrim(l.business_name), ''), 'A lead'),
           case when l.phone_wrong then null else nullif(btrim(l.phone_e164), '') end
      into v_name, v_phone
      from public.leads l
      left join public.tenants t on t.id = NEW.preview_tenant_id
     where l.tenant_id = NEW.tenant_id and l.id = NEW.lead_id;
    if not found then
      return null;
    end if;
    insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id)
    values (NEW.tenant_id, 'preview_tried',
            left(v_name || ' ' || v_did || ' their preview', 200),
            case when v_phone is null then 'No number is on file for them.'
                 when v_phone ~ '^\+1[0-9]{10}$' then
                   'Their number is +1 (' || substr(v_phone, 3, 3) || ') ' || substr(v_phone, 6, 3) || '-'
                   || substr(v_phone, 9, 4) || '.'
                 else 'Their number is ' || v_phone || '.' end,
            'clients/leads:p-' || NEW.lead_id::text, 'lead', NEW.lead_id::text);
  exception when others then
    -- The bell's line never costs a lead their message or their call.
    raise warning 'lead_previews_notify: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.lead_previews_notify() from public, anon, authenticated;
comment on function public.lead_previews_notify() is
  'The bell''s line when a lead first texts, and first calls, their own preview (00632): one preview_tried row for the sender''s workspace, titled with the business and what it did, its body the lead''s number where its listing has one nobody marked wrong, opening the lead. Written after preview_said or preview_called moves a count off zero; a line that cannot be written is a warning, never the lead''s failure.';

drop trigger if exists lead_previews_notify on public.lead_previews;
create trigger lead_previews_notify
  after update of asked_count, call_count on public.lead_previews
  for each row execute function public.lead_previews_notify();

-- Those lines hold a business's name and its number: a lead blanked or erased leaves them without either, and closed.
create or replace function public.lead_tried_notes_forget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications n
     set title = 'A lead tried their preview', body = '', route = null, closed_at = coalesce(n.closed_at, now())
   where n.tenant_id = NEW.tenant_id and n.kind = 'preview_tried'
     and n.subject_type = 'lead' and n.subject_id = NEW.id::text;
  return null;
end $$;
revoke execute on function public.lead_tried_notes_forget() from public, anon, authenticated;
comment on function public.lead_tried_notes_forget() is
  'A lead blanked or erased leaves the bell''s lines about its preview without its name and its number, and closed (00632): written as an update, which an open bell hears.';

drop trigger if exists lead_tried_notes_forget on public.leads;
create trigger lead_tried_notes_forget
  after update of blanked_at, erased_at on public.leads
  for each row
  when ((NEW.blanked_at is not null and OLD.blanked_at is null) or (NEW.erased_at is not null and OLD.erased_at is null))
  execute function public.lead_tried_notes_forget();

/* -------------------------------------------------------------------------------- 2. how many were made, and their cost -- */

create index if not exists lead_previews_made_at on public.lead_previews (tenant_id, created_at);

create or replace function public.platform_health_previews(p_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90)) as since,
           date_trunc('day', now(), 'UTC') as today
  ),
  p as (select lp.* from public.lead_previews lp, w where lp.created_at >= w.since)
  select jsonb_build_object(
    'made', (select count(*) from p),
    'made_today', (select count(*) from public.lead_previews lp, w where lp.created_at >= w.today),
    'tried', (select count(*) from p where p.tried_at is not null),
    'claimed', (select count(*) from p where p.state = 'claimed'),
    'messages', (select coalesce(sum(p.asked_count), 0) from p),
    'call_seconds', (select coalesce(sum(p.call_seconds), 0) from p),
    -- What the model cost on the preview workspaces that still stand, until each was made theirs: an ended preview's
    -- workspace is erased, and its usage with it.
    'usd', (select coalesce(sum(u.usd), 0)
              from public.lead_previews lp
              join public.ai_usage u on u.tenant_id = lp.preview_tenant_id
              cross join w
             where u.created_at >= w.since and (lp.claimed_at is null or u.created_at <= lp.claimed_at)))
$$;
revoke all on function public.platform_health_previews(integer) from public, anon, authenticated;
grant execute on function public.platform_health_previews(integer) to service_role;
comment on function public.platform_health_previews(integer) is
  'Health''s read of leads'' previews over the last p_days (1 to 90; 00632): {made, made_today (this UTC day), tried, claimed, messages, call_seconds, usd}. usd is the model''s cost on the preview workspaces that still stand, until each was made theirs; an ended preview''s workspace is erased and its usage with it. Service role only.';
