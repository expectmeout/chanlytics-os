-- 00722 · The dashboard's acts write their own events (lanes 9 and 2 of the code refinement plan, finished together,
-- 26 Nov 2026: layer 10's invariant 2, a change and its event in one transaction, written by its door; and layer 11, a
-- member's own act reaches its door as the member, off the dashboard's all-access key).
--
--   invitation_accept         New: a person's open invitation taken up, the seat, member.joined and the stamp in one
--                             transaction, where the dashboard wrote three rows it ordered by hand.
--   template_submitted_keep, template_words_keep, template_remove
--                             New: a Library message sent to WhatsApp, its words changed, or deleted, each with
--                             template.submitted or template.removed and who did it, where the edge wrote the row and
--                             the dashboard its event after; the edge answers that it told the ledger.
--   template_fix_keep         New: Ask's new words for a refused message kept as template.fix_written, by the member on
--                             their own session, where the dashboard wrote them on the all-access key.
--   appointment_notice_dismiss
--                             New: a held booking email set aside by the member on their own session, with
--                             appointment.notice_dismissed, kept from Activity's rows; it was a write on the all-access key.
--   workspace_sending_stop, ask_stopped_keep, ask_alone_set, ad_pause_for_stop
--                             New: Stop everything (the workspace's stop, with workspace.sending_stopped and
--                             .sending_resumed, and what it holds), AI set to work alone (ask.alone_set) and the stop's ads
--                             pause, each as the member who pressed it, where the dashboard wrote them on the all-access
--                             key; the kinds are kept from Activity's rows.
--   ask_morning_write         Re-made with p_bell: a morning's cards counted once, and the member's own bell line where
--                             any wait, in the count's transaction, where the dashboard wrote the line on the all-access key.
--   google_connect_finish, google_connection_remove, google_listing_link, google_listing_unlink, google_reviews_keep,
--   google_profile_synced, google_review_replied
--                             New: Google's connect once its token stands in Vault, the disconnect, a listing linked and
--                             unlinked, a read's reviews kept, a profile's sync stamped, a review answered, each with its
--                             google.* kind, where the edge wrote each from TypeScript after its write.
--   playbook_run_record       New: a campaign's run (playbook.run) with its step's day stamped, or with the system's
--                             decision for a batch the sweep scheduled.
--   playbook_edit, reach_out_edit
--                             New: a playbook edited by the member (its columns alone) and a chain edited through its
--                             save, each with playbook.changed, which the dashboard wrote on the all-access key after.
--   tenant_config_write       Re-made with p_told: a settings save with settings.changed in its transaction.
--
-- Nothing a customer sees changes: the same kinds, with the same words, in the same places (google.linked no longer
-- says whether the listing's first read worked, which nothing reads).
--
-- Deploy order: either. An old dashboard and an old edge keep writing their rows and their events as before: the two
-- re-made doors keep their old arguments, and nothing old calls a new one. The new code calls the new doors, which a
-- database from before this does not have: it deploys after this is applied, as the house applies a migration before
-- its merge.
set local lock_timeout = '3s';

/* -- invitation_accept: the seat, its news and the stamp, in one transaction -- */

-- A person's open invitation taken up: the seat at the invited role, member.joined (which the owner's bell line
-- follows, core SUBSCRIBERS.team_notice), and the invitation stamped accepted, where the dashboard wrote three rows
-- that could not share a transaction and ordered them so the next read would finish a half-made one. A seat held
-- already (another door, an earlier try) is accepted and said once: the news is written only where the ledger does
-- not hold it for this invitation, and the stamp only while the invitation is open. The service role's: the person is
-- not a member until this runs (the dashboard's team route, after it reads the person's own verified address).
create or replace function public.invitation_accept(p_invitation_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations i
   where i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;
  if not found then
    return false;
  end if;
  insert into public.memberships (user_id, tenant_id, role)
  values (p_user_id, v_inv.tenant_id, v_inv.role)
  on conflict do nothing;
  if not exists (select 1 from public.events e
                  where e.tenant_id = v_inv.tenant_id and e.kind = 'member.joined'
                    and e.subject_type = 'invitation' and e.subject_id = v_inv.id) then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_inv.tenant_id, 'member.joined', 'system', 'invitation', v_inv.id,
            jsonb_build_object('by', p_user_id, 'role', v_inv.role));
  end if;
  update public.invitations i set accepted_at = now() where i.id = v_inv.id and i.accepted_at is null;
  return true;
end $$;

revoke all on function public.invitation_accept(uuid, uuid) from public, anon, authenticated;
grant execute on function public.invitation_accept(uuid, uuid) to service_role;

comment on function public.invitation_accept(uuid, uuid) is
  'A person''s open invitation taken up, in one transaction (00722): the seat at the invited role (one held already is kept), member.joined where the ledger does not hold it for this invitation, and the invitation stamped accepted. False where the invitation is not open (taken, revoked or expired). The service role''s: the dashboard''s team route, after it reads the person''s verified address.';
/* -- templates: a message sent to WhatsApp for approval, its words changed, or deleted, with its event -- */

-- What a member did to a Library message was written by the edge after Meta answered, and its event by the dashboard
-- after the edge did. Each write now carries its event, in one transaction, with who did it (the member the
-- dashboard's call names) and, for words changed, the approved words they replaced. The edge answers that it told the
-- ledger, so a new dashboard writes none, an old dashboard writes its own as before (two rows for the minutes between
-- the deploys), and a new dashboard over an old edge still writes its own.

create or replace function public.template_submitted_keep(p_tenant_id uuid, p_row jsonb, p_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.templates;
  v_id uuid;
begin
  if p_tenant_id is null or jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'template_submitted_keep: a message is a workspace''s' using errcode = '22004';
  end if;
  v_row := jsonb_populate_record(null::public.templates, p_row || jsonb_build_object('tenant_id', p_tenant_id));
  insert into public.templates as t (tenant_id, channel, name, language, meta_status, category, meta_id, components,
                                     body_preview, variables, rejected_reason, synced_at, source, created_by)
  values (p_tenant_id, coalesce(v_row.channel, 'whatsapp'), v_row.name, v_row.language,
          coalesce(v_row.meta_status, 'pending'), v_row.category, v_row.meta_id, v_row.components, v_row.body_preview,
          coalesce(v_row.variables, '[]'::jsonb), v_row.rejected_reason, coalesce(v_row.synced_at, now()),
          coalesce(v_row.source, 'chanlytics'), coalesce(v_row.created_by, p_by))
  on conflict (tenant_id, channel, name, language) do update set
    meta_status = excluded.meta_status, category = excluded.category, meta_id = excluded.meta_id,
    components = excluded.components, body_preview = excluded.body_preview, variables = excluded.variables,
    rejected_reason = excluded.rejected_reason, synced_at = excluded.synced_at, source = excluded.source,
    created_by = excluded.created_by
  returning t.id into v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'template.submitted', 'message', 'template', v_id,
          jsonb_build_object('name', v_row.name, 'language', v_row.language, 'by', p_by));
  return v_id;
end $$;

revoke all on function public.template_submitted_keep(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.template_submitted_keep(uuid, jsonb, uuid) to service_role;

comment on function public.template_submitted_keep(uuid, jsonb, uuid) is
  'A message sent to WhatsApp for approval, kept over its key (workspace, channel, name, language) with template.submitted in the same transaction (00722): its name, language and who sent it. Its id. The service role''s: the edge''s template door, after Meta took it.';

create or replace function public.template_words_keep(
  p_tenant_id uuid,
  p_template_id uuid,
  p_words jsonb,
  p_by uuid default null,
  p_before text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.templates;
begin
  if jsonb_typeof(p_words) is distinct from 'object' then
    raise exception 'template_words_keep: the words are an object' using errcode = '22023';
  end if;
  update public.templates t
     set components = p_words -> 'components',
         body_preview = p_words ->> 'body_preview',
         variables = coalesce(p_words -> 'variables', t.variables),
         meta_status = 'pending', rejected_reason = null, synced_at = now()
   where t.id = p_template_id and t.tenant_id = p_tenant_id and t.channel = 'whatsapp'
  returning * into v_row;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'template.submitted', 'message', 'template', p_template_id,
          jsonb_build_object('name', v_row.name, 'language', v_row.language, 'by', p_by)
            || case when p_before is null then '{}'::jsonb else jsonb_build_object('before', p_before) end);
  return true;
end $$;

revoke all on function public.template_words_keep(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.template_words_keep(uuid, uuid, jsonb, uuid, text) to service_role;

comment on function public.template_words_keep(uuid, uuid, jsonb, uuid, text) is
  'A WhatsApp message''s new words, sent to Meta again, kept with template.submitted in the same transaction (00722): who sent them, and the approved words they replaced (p_before) so a refusal can go back to them. False where it is not the workspace''s WhatsApp message. The service role''s: the edge''s template door.';

create or replace function public.template_remove(p_tenant_id uuid, p_template_id uuid, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.templates;
begin
  delete from public.templates t where t.id = p_template_id and t.tenant_id = p_tenant_id returning * into v_row;
  if not found then
    return false;
  end if;
  -- Its row is gone, so the ledger names it: a broadcast or a playbook that sent it still says the name.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'template.removed', 'message', 'template', p_template_id,
          jsonb_build_object('name', v_row.name, 'language', v_row.language, 'by', p_by));
  return true;
end $$;

revoke all on function public.template_remove(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.template_remove(uuid, uuid, uuid) to service_role;

comment on function public.template_remove(uuid, uuid, uuid) is
  'A Library message deleted, with template.removed in the same transaction (00722): its name and language, which stay on the ledger when the row is gone, and who deleted it. False where it was gone already. The service role''s: the edge''s template door.';

/* -- template_fix_keep: Ask's new words for a refused message, kept for its editor -- */

-- The ledger is where the words are kept (template.fix_written, read back by the Library's editor): the member who asked
-- for them keeps them on their own session, through a door that asks who is calling, where the dashboard wrote them on
-- the all-access key.
create or replace function public.template_fix_keep(
  p_tenant_id uuid,
  p_template_id uuid,
  p_words text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
begin
  if v_by is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_by is not null and (p_tenant_id is null or not public.is_acting_member(p_tenant_id)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_words), '') = '' or char_length(p_words) > 4000 or char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'template_fix_keep: words of at most 4,000 characters, a reason of at most 1,000' using errcode = '22023';
  end if;
  if not exists (select 1 from public.templates t where t.tenant_id = p_tenant_id and t.id = p_template_id) then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'template.fix_written', 'message', 'template', p_template_id,
          jsonb_build_object('words', p_words, 'reason', coalesce(p_reason, ''), 'by', v_by));
  return true;
end $$;

revoke all on function public.template_fix_keep(uuid, uuid, text, text) from public, anon;
grant execute on function public.template_fix_keep(uuid, uuid, text, text) to authenticated, service_role;

comment on function public.template_fix_keep(uuid, uuid, text, text) is
  'Ask''s new words for WhatsApp''s refusal of a message, kept on the ledger as template.fix_written (00722), which the Library''s editor reads back: the words, the refusal they answer, and the member who asked. A member who may act in the workspace, on their own session; the service role too. False where the message is not the workspace''s.';
/* -- appointment_notice_dismiss: a held booking email set aside, by the member, with its event -- */

-- A booking tool's email held for a look and let go by a member (the Calendar's held row): it stays on the ledger as
-- dismissed, with why it was held, where the dashboard wrote the row on the all-access key (members hold no write on
-- the notices, 00345). The member's own session reaches it now, through a door that asks who is calling (the route's
-- own role: one who acts in the workspace), and the act is on the ledger, kept from Activity's rows (contracts
-- ACTIVITY_NOISE_KINDS): the Business tab's row says it.
create or replace function public.appointment_notice_dismiss(p_tenant_id uuid, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
  v_row public.appointment_notices;
begin
  if v_by is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_by is not null and (p_tenant_id is null or not public.is_acting_member(p_tenant_id)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.appointment_notices n set outcome = 'dismissed'
   where n.tenant_id = p_tenant_id and n.id = p_id and n.outcome = 'held'
  returning * into v_row;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'appointment.notice_dismissed', 'appointment', 'booking_email', p_id,
          jsonb_build_object('tool', v_row.tool, 'hold_reason', v_row.hold_reason, 'by', v_by));
  return true;
end $$;

revoke all on function public.appointment_notice_dismiss(uuid, uuid) from public, anon;
grant execute on function public.appointment_notice_dismiss(uuid, uuid) to authenticated, service_role;

comment on function public.appointment_notice_dismiss(uuid, uuid) is
  'A held booking email set aside (00722): its notice kept as dismissed, only while it is held, with appointment.notice_dismissed (its tool, why it was held, who) in the same transaction, kept from Activity''s rows. A member who acts in the workspace, on their own session; the service role too. False where it is not held any more.';
/* -- workspace_sending_stop, ask_stopped_keep, ask_alone_set, ad_pause_for_stop: Stop everything, as the member -- */

-- Stop everything may be pressed by any member who acts, below the settings role that writes the workspace's
-- settings, so the dashboard wrote the stop on the all-access key: the workspace's own row (sending_stopped_at), what
-- the stop holds in Ask's own section of the settings (ask.stopped: what it paused, to start again), and the ads made
-- here paused. Each is the member's own now, through a door that asks who is calling (one who acts in the workspace),
-- and the stop and its lift are on the ledger, kept from Activity's rows (the Today strip says a stop as it stands).

create or replace function public.workspace_sending_stop(p_tenant_id uuid, p_at timestamptz default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
  v_was timestamptz;
begin
  if v_by is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_by is not null and (p_tenant_id is null or not public.is_acting_member(p_tenant_id)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select t.sending_stopped_at into v_was from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    return false;
  end if;
  update public.tenants t set sending_stopped_at = p_at where t.id = p_tenant_id;
  if v_was is null and p_at is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'workspace.sending_stopped', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('at', p_at, 'by', v_by));
  elsif v_was is not null and p_at is null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'workspace.sending_resumed', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('stopped_at', v_was, 'by', v_by));
  end if;
  return true;
end $$;

revoke all on function public.workspace_sending_stop(uuid, timestamptz) from public, anon;
grant execute on function public.workspace_sending_stop(uuid, timestamptz) to authenticated, service_role;

comment on function public.workspace_sending_stop(uuid, timestamptz) is
  'Stop everything on the workspace''s own row (tenants.sending_stopped_at: p_at writes it, null lifts it), as the member who pressed it (00722), with workspace.sending_stopped where it began and workspace.sending_resumed where it was lifted, kept from Activity''s rows. A member who acts in the workspace; the service role too. False where there is no workspace.';

create or replace function public.ask_stopped_keep(p_tenant_id uuid, p_stopped jsonb default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
begin
  if v_by is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_by is not null and (p_tenant_id is null or not public.is_acting_member(p_tenant_id)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_stopped is not null and jsonb_typeof(p_stopped) <> 'object' then
    raise exception 'ask_stopped_keep: what the stop holds is an object' using errcode = '22023';
  end if;
  -- Ask's own section of the settings, its one key, written under the row's lock and its version moved, as a save is.
  update public.tenant_config c
     set config = case when p_stopped is null
                       then jsonb_set(c.config, '{ask}', coalesce(c.config -> 'ask', '{}'::jsonb) - 'stopped')
                       else jsonb_set(c.config, '{ask}',
                                      coalesce(c.config -> 'ask', '{}'::jsonb) || jsonb_build_object('stopped', p_stopped))
                  end,
         version = c.version + 1, updated_by = coalesce(v_by, c.updated_by)
   where c.tenant_id = p_tenant_id;
  return found;
end $$;

revoke all on function public.ask_stopped_keep(uuid, jsonb) from public, anon;
grant execute on function public.ask_stopped_keep(uuid, jsonb) to authenticated, service_role;

comment on function public.ask_stopped_keep(uuid, jsonb) is
  'What a stop holds (what it paused, to start again), kept in Ask''s own section of the settings (tenant_config.config.ask.stopped; null removes it) as the member who pressed it (00722). The stop''s own event is workspace_sending_stop''s: this is its memory. A member who acts in the workspace; the service role too.';

create or replace function public.ask_alone_set(p_tenant_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
  v_was boolean;
begin
  if v_by is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_by is not null and (p_tenant_id is null or not public.is_acting_member(p_tenant_id)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select coalesce((c.config -> 'ask' ->> 'alone')::boolean, false) into v_was
    from public.tenant_config c where c.tenant_id = p_tenant_id for update;
  if not found then
    return false;
  end if;
  if v_was is distinct from coalesce(p_on, false) then
    update public.tenant_config c
       set config = case when coalesce(p_on, false)
                         then jsonb_set(c.config, '{ask}', coalesce(c.config -> 'ask', '{}'::jsonb) || '{"alone": true}'::jsonb)
                         else jsonb_set(c.config, '{ask}', coalesce(c.config -> 'ask', '{}'::jsonb) - 'alone') end,
           version = c.version + 1, updated_by = coalesce(v_by, c.updated_by)
     where c.tenant_id = p_tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'ask.alone_set', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('on', coalesce(p_on, false), 'by', v_by));
  end if;
  return true;
end $$;

revoke all on function public.ask_alone_set(uuid, boolean) from public, anon;
grant execute on function public.ask_alone_set(uuid, boolean) to authenticated, service_role;

comment on function public.ask_alone_set(uuid, boolean) is
  'Whether AI works alone, kept in Ask''s own section of the settings (tenant_config.config.ask.alone) as the member who set it (00722), with ask.alone_set where it changed, kept from Activity''s rows. A member who acts in the workspace; the service role too.';

create or replace function public.ad_pause_for_stop(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by uuid := auth.uid();
begin
  if v_by is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- The pause itself is ad_pause_all's, as the stop has always asked it, with the member as its actor.
  return public.ad_pause_all(p_tenant_id, v_by, null, 'stop');
end $$;

revoke all on function public.ad_pause_for_stop(uuid) from public, anon;
grant execute on function public.ad_pause_for_stop(uuid) to authenticated, service_role;

comment on function public.ad_pause_for_stop(uuid) is
  'Stop everything''s pause of the ads made here that are on (00722), as the member who pressed it: one who acts in the workspace, below the owner. The pause is ad_pause_all''s (by stop), with its answer.';
/* -- ask_morning_write: the morning's count and its bell line in one transaction, as the member -- */

-- A morning's cards counted once (answered), and the member's own bell told when any wait: the dashboard wrote that
-- line on the all-access key after the door's count, since a member writes no bell row. The door writes it now, in the
-- count's own transaction and only where this call recorded the count, so the line is told once a morning, as the
-- member, and never without its count. The caller says the line's words (p_bell: {title, body}); an old dashboard
-- passes none and writes its own, as before. The other acts are as they were.
drop function if exists public.ask_morning_write(uuid, date, text, uuid, integer);

create or replace function public.ask_morning_write(
  p_tenant_id uuid, p_day date, p_act text, p_thread_id uuid default null, p_cards integer default null,
  p_bell jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor  uuid := auth.uid();
  v_row    public.ask_mornings%rowtype;
  v_won    boolean;
  v_title  text;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the morning is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A member who acts: a viewer approves nothing, so no morning is asked for them.
  if not public.is_acting_member(p_tenant_id) then
    return jsonb_build_object('error', 'not_acting');
  end if;
  -- The workspace's today, give or take the zones: never a day long past or far ahead.
  if p_day is null or p_day < current_date - 1 or p_day > current_date + 1 then
    raise exception 'ask_morning_write: the day is today, by the workspace''s clock' using errcode = '22023';
  end if;
  if p_bell is not null and (jsonb_typeof(p_bell) <> 'object' or coalesce(p_bell ->> 'title', '') = ''
                             or jsonb_typeof(p_bell -> 'body') is distinct from 'string') then
    raise exception 'ask_morning_write: the bell''s line is {title, body}' using errcode = '22023';
  end if;
  if p_act = 'claim' then
    -- The day claimed once: the winner runs the turn; a second tab, or a later arrival, reads the first's.
    insert into public.ask_mornings (tenant_id, user_id, day)
    values (p_tenant_id, v_actor, p_day)
    on conflict on constraint ask_mornings_pkey do nothing
    returning true into v_won;
    select * into v_row from public.ask_mornings
     where tenant_id = p_tenant_id and user_id = v_actor and day = p_day;
    if coalesce(v_won, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'ask.morning_claimed', 'system', 'workspace', p_tenant_id,
              jsonb_build_object('day', p_day, 'by', v_actor));
    end if;
    return jsonb_build_object('claimed', coalesce(v_won, false), 'thread_id', v_row.thread_id, 'cards', v_row.cards);
  elsif p_act = 'thread' then
    -- The thread the winner made, its own in this workspace, named once.
    update public.ask_mornings m
       set thread_id = p_thread_id
     where m.tenant_id = p_tenant_id and m.user_id = v_actor and m.day = p_day and m.thread_id is null
       and exists (select 1 from public.ask_threads t
                    where t.id = p_thread_id and t.tenant_id = p_tenant_id and t.user_id = v_actor)
    returning true into v_won;
    return jsonb_build_object('named', coalesce(v_won, false));
  elsif p_act = 'answered' then
    -- The turn answered: how many cards wait, once a morning (`recorded` says this call set it). Where any wait and the
    -- caller said the line, the member's own bell is told here (kind ask_cards, opening Today, about the morning's
    -- thread), in the count's transaction: once a morning, and never without its count.
    update public.ask_mornings m
       set cards = greatest(coalesce(p_cards, 0), 0)
     where m.tenant_id = p_tenant_id and m.user_id = v_actor and m.day = p_day and m.cards is null
    returning * into v_row;
    if not found then
      return jsonb_build_object('recorded', false, 'thread_id', null, 'cards', null);
    end if;
    if p_bell is not null and v_row.cards > 0 and v_row.thread_id is not null then
      v_title := left(p_bell ->> 'title', 200);
      insert into public.notifications (tenant_id, kind, title, body, route, subject_type, subject_id, recipient_user_id)
      values (p_tenant_id, 'ask_cards', v_title, left(p_bell ->> 'body', 4000), 'today', 'ask_thread',
              v_row.thread_id::text, v_actor);
    end if;
    return jsonb_build_object('recorded', true, 'thread_id', v_row.thread_id, 'cards', v_row.cards,
                              'told', p_bell is not null);
  end if;
  raise exception 'act is claim, thread or answered' using errcode = '22023';
end $$;

revoke all on function public.ask_morning_write(uuid, date, text, uuid, integer, jsonb) from public, anon;
grant execute on function public.ask_morning_write(uuid, date, text, uuid, integer, jsonb) to authenticated, service_role;

comment on function public.ask_morning_write(uuid, date, text, uuid, integer, jsonb) is
  'A member''s morning with Ask (decision 0070), by act, the caller''s own and only for a member who acts: claim (the day, once: {claimed, thread_id, cards}; ask.morning_claimed for the winner), thread (the thread the winner made, named once: {named}), answered (how many cards wait, once: {recorded, thread_id, cards, told}; with p_bell {title, body}, the ask_cards line on the member''s own bell where any wait, in the count''s transaction, 00722; without it the caller writes the line, as an old dashboard does). The day is the workspace''s, within a day of the database''s. A viewer gets {error: not_acting}.';
/* -- Google: a connect, a disconnect, a link, an unlink, a read's reviews, a sync, a reply, each with its event -- */

-- The edge wrote each of Google's kinds from TypeScript after the write it tells of: the profile connected once its
-- token stood in Vault, disconnected once its row went, a listing linked or unlinked, new reviews read, a review
-- answered. Each is written now by the door that makes the change, in its transaction. The words Activity shows are the
-- same, and so are each event's data, but for the link's: it no longer says whether the listing's first read worked,
-- which nothing reads, since the link's transaction ends before that read begins.

-- A connect stands once its token is in Vault (the row was written first, so a failed Vault write puts the old row
-- back): the token kept through put_google_credentials, the only write path for it, and google.connected beside it.
create or replace function public.google_connect_finish(p_tenant_id uuid, p_secret jsonb, p_told jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ref text;
begin
  if p_told is null or jsonb_typeof(p_told) <> 'object' then
    raise exception 'google_connect_finish: what the connect says is an object' using errcode = '22023';
  end if;
  v_ref := public.put_google_credentials(p_tenant_id, p_secret, null);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'google.connected', 'google', 'listing', null, p_told);
  return v_ref;
end $$;

revoke all on function public.google_connect_finish(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.google_connect_finish(uuid, jsonb, jsonb) to service_role;

comment on function public.google_connect_finish(uuid, jsonb, jsonb) is
  'A Google Business Profile connect finished (00722): its token kept in Vault through put_google_credentials, and google.connected (p_told: the email, how many accounts, locations and on Maps, who) in the same transaction. Service role only.';

-- A disconnect: the profile's reviews and the connection's row gone, with google.disconnected, where there was one.
-- The token left Vault first (drop_google_credentials), so a retry finds the row and starts again.
create or replace function public.google_connection_remove(p_tenant_id uuid, p_told jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_told is null or jsonb_typeof(p_told) <> 'object' then
    raise exception 'google_connection_remove: what the disconnect says is an object' using errcode = '22023';
  end if;
  delete from public.google_reviews r where r.tenant_id = p_tenant_id and r.origin = 'profile';
  delete from public.google_connections c where c.tenant_id = p_tenant_id;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'google.disconnected', 'google', 'listing', null, p_told);
  return true;
end $$;

revoke all on function public.google_connection_remove(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.google_connection_remove(uuid, jsonb) to service_role;

comment on function public.google_connection_remove(uuid, jsonb) is
  'A Google Business Profile disconnected (00722): the profile''s reviews and the connection''s row deleted, with google.disconnected (p_told: the email, the location, whether the grant went back, who) in the same transaction. False, and no event, where there was no connection. Service role only.';

-- A listing linked: the workspace's one listing written as Google's public read gave it (a re-link starts its counts
-- and its check again), and what the last place had read forgotten, its reviews and its days, with google.linked.
create or replace function public.google_listing_link(p_tenant_id uuid, p_row jsonb, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_place text := p_row ->> 'place_id';
  v_name  text := p_row ->> 'name';
begin
  if p_row is null or jsonb_typeof(p_row) <> 'object' or v_place is null or v_name is null then
    raise exception 'google_listing_link: a listing has its place and its name' using errcode = '22023';
  end if;
  insert into public.google_listings as l
    (tenant_id, place_id, name, address, maps_uri, new_review_uri, business_status, facts, linked_by, linked_at,
     rating, review_count, checked_at, check_error)
  values (p_tenant_id, v_place, v_name, p_row ->> 'address', p_row ->> 'maps_uri', p_row ->> 'new_review_uri',
          p_row ->> 'business_status', coalesce(p_row -> 'facts', '{}'::jsonb), p_by,
          coalesce((p_row ->> 'linked_at')::timestamptz, now()), null, null, null, null)
  on conflict on constraint google_listings_pkey do update
     set place_id = excluded.place_id, name = excluded.name, address = excluded.address, maps_uri = excluded.maps_uri,
         new_review_uri = excluded.new_review_uri, business_status = excluded.business_status, facts = excluded.facts,
         linked_by = excluded.linked_by, linked_at = excluded.linked_at, rating = null, review_count = null,
         checked_at = null, check_error = null;
  delete from public.google_reviews r where r.tenant_id = p_tenant_id;
  delete from public.google_listing_days d where d.tenant_id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'google.linked', 'google', 'listing', null,
          jsonb_build_object('place_id', v_place, 'name', v_name, 'by', p_by));
  return true;
end $$;

revoke all on function public.google_listing_link(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.google_listing_link(uuid, jsonb, uuid) to service_role;

comment on function public.google_listing_link(uuid, jsonb, uuid) is
  'A Google listing linked (00722): the workspace''s one listing written from Google''s public read (p_row: place_id, name, address, maps_uri, new_review_uri, business_status, facts, linked_at; its counts and its check start again), the last place''s reviews and days deleted, and google.linked (the place, its name, who) in the same transaction. Service role only.';

-- A listing unlinked: its row gone (the profile was disconnected first), with google.unlinked, where there was one.
create or replace function public.google_listing_unlink(p_tenant_id uuid, p_had_profile boolean, p_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_place text;
  v_name  text;
begin
  delete from public.google_listings l where l.tenant_id = p_tenant_id returning l.place_id, l.name into v_place, v_name;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'google.unlinked', 'google', 'listing', null,
          jsonb_build_object('place_id', v_place, 'name', v_name, 'had_profile', coalesce(p_had_profile, false),
                             'by', p_by));
  return true;
end $$;

revoke all on function public.google_listing_unlink(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.google_listing_unlink(uuid, boolean, uuid) to service_role;

comment on function public.google_listing_unlink(uuid, boolean, uuid) is
  'A Google listing unlinked (00722): its row deleted, with google.unlinked (the place and its name as the row kept them, whether a profile was connected, who) in the same transaction. False, and no event, where there was none. Service role only.';

-- The reviews a read listed, each written over its row (one per review id) with the keys the read carried: a row keeps
-- its first_seen_at, and only the profile's read carries a reply, so Places' read never writes over one. With p_told,
-- google.reviews (what was new, the counts) in the same transaction: Places' read tells it here.
create or replace function public.google_reviews_keep(p_tenant_id uuid, p_reviews jsonb, p_told jsonb default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kept integer := 0;
begin
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' then
    raise exception 'google_reviews_keep: the reviews are a list' using errcode = '22023';
  end if;
  if p_told is not null and jsonb_typeof(p_told) <> 'object' then
    raise exception 'google_reviews_keep: what the read says is an object' using errcode = '22023';
  end if;
  insert into public.google_reviews as r
    (tenant_id, review_id, origin, rating, author, author_uri, author_photo_uri, body, language_code, published_at,
     reply_text, replied_at, maps_uri, last_seen_at)
  select p_tenant_id, x.review_id, coalesce(x.origin, 'places'), x.rating, x.author, x.author_uri, x.author_photo_uri,
         x.body, x.language_code, x.published_at, x.reply_text, x.replied_at, x.maps_uri, coalesce(x.last_seen_at, now())
    from jsonb_array_elements(p_reviews) e
    cross join lateral jsonb_populate_record(null::public.google_reviews, e) x
  on conflict on constraint google_reviews_tenant_id_review_id_key do update
     set origin = excluded.origin, rating = excluded.rating, author = excluded.author, author_uri = excluded.author_uri,
         author_photo_uri = excluded.author_photo_uri, body = excluded.body, language_code = excluded.language_code,
         published_at = excluded.published_at, maps_uri = excluded.maps_uri, last_seen_at = excluded.last_seen_at;
  get diagnostics v_kept = row_count;
  -- A reply, where the read carried one (the profile's): written over the row's.
  update public.google_reviews r
     set reply_text = x.reply_text, replied_at = x.replied_at
    from jsonb_array_elements(p_reviews) e
    cross join lateral jsonb_populate_record(null::public.google_reviews, e) x
   where e ? 'reply_text' and r.tenant_id = p_tenant_id and r.review_id = x.review_id;
  if p_told is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'google.reviews', 'google', 'listing', null, p_told);
  end if;
  return v_kept;
end $$;

revoke all on function public.google_reviews_keep(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.google_reviews_keep(uuid, jsonb, jsonb) to service_role;

comment on function public.google_reviews_keep(uuid, jsonb, jsonb) is
  'The reviews a Google read listed (00722), each written over its row by review id with the keys the read carried (a row keeps its first_seen_at; a reply only where the read carried one), and with p_told, google.reviews (its source, what was new, the counts) in the same transaction. How many rows it wrote. Service role only.';

-- A profile's sync stamped, which makes its new reviews news no more: last synced, no error, whether the reviews are
-- whole, and with p_told google.reviews, in the stamp's transaction. A sync that fails before it is unstamped and tells
-- nothing, and the next finds the same reviews new and tells them once.
create or replace function public.google_profile_synced(
  p_tenant_id uuid, p_synced_at timestamptz, p_complete boolean, p_told jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_told is not null and jsonb_typeof(p_told) <> 'object' then
    raise exception 'google_profile_synced: what the sync says is an object' using errcode = '22023';
  end if;
  update public.google_connections c
     set last_synced_at = p_synced_at, sync_error = null, reviews_complete = coalesce(p_complete, false)
   where c.tenant_id = p_tenant_id;
  if not found then
    return false;
  end if;
  if p_told is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'google.reviews', 'google', 'listing', null, p_told);
  end if;
  return true;
end $$;

revoke all on function public.google_profile_synced(uuid, timestamptz, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.google_profile_synced(uuid, timestamptz, boolean, jsonb) to service_role;

comment on function public.google_profile_synced(uuid, timestamptz, boolean, jsonb) is
  'A Google profile''s sync stamped (00722): last_synced_at, no sync error, whether its reviews are whole, and with p_told google.reviews (its source, what was new, the counts) in the same transaction. False, and no event, where the connection is gone. Service role only.';

-- A review answered on Google: its reply on its row and what it held cleared, with google.replied.
create or replace function public.google_review_replied(
  p_tenant_id uuid, p_id uuid, p_told jsonb, p_reply_text text default null, p_replied_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_told is null or jsonb_typeof(p_told) <> 'object' then
    raise exception 'google_review_replied: what the reply says is an object' using errcode = '22023';
  end if;
  update public.google_reviews r
     set reply_text = p_reply_text, replied_at = p_replied_at, draft_text = null, drafted_at = null, posts_at = null
   where r.tenant_id = p_tenant_id and r.id = p_id;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'google.replied', 'google', 'review', p_id, p_told);
  return true;
end $$;

revoke all on function public.google_review_replied(uuid, uuid, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.google_review_replied(uuid, uuid, jsonb, text, timestamptz) to service_role;

comment on function public.google_review_replied(uuid, uuid, jsonb, text, timestamptz) is
  'A Google review answered (00722): its reply and when on its row, what it held (draft, its time) cleared, and google.replied (the review''s id on Google, how long, who) in the same transaction. False, and no event, where the row is gone. Service role only.';
/* -- playbook_run_record: a campaign's run on the ledger, with its step's stamp and its decision -- */

-- A campaign's run is recorded once it has made what it makes (a batch, a hand, or nothing and why): playbook.run,
-- which the sequence's own reads take back (sequence_overview's last_run_off). The edge wrote it from TypeScript, then
-- stamped the step's run (the day's run, never a late booking's or an occasion's) or, for a reach-out the sweep
-- scheduled, wrote the system's decision. Each pair is one write now, so a record and its stamp or its decision never
-- part.
create or replace function public.playbook_run_record(
  p_tenant_id uuid, p_playbook_id uuid, p_data jsonb, p_stamp jsonb default null, p_decision jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'playbook_run_record: what the run says is an object' using errcode = '22023';
  end if;
  if p_stamp is not null and (p_stamp ->> 'run_for' is null or p_stamp ->> 'at' is null) then
    raise exception 'playbook_run_record: a stamp has its day and its time' using errcode = '22023';
  end if;
  if p_decision is not null and p_decision ->> 'broadcast_id' is null then
    raise exception 'playbook_run_record: a decision is about its batch' using errcode = '22023';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'playbook.run', 'message', 'playbook', p_playbook_id, p_data);
  -- The day's run, stamped on its step: what the sweep reads as the day ran.
  if p_stamp is not null then
    update public.sequence_steps s
       set last_run_for = (p_stamp ->> 'run_for')::date, last_run_at = (p_stamp ->> 'at')::timestamptz
     where s.tenant_id = p_tenant_id and s.id = p_playbook_id;
  end if;
  -- A batch the sweep scheduled without its owner's yes: the system's decision, under the mode the owner chose.
  if p_decision is not null then
    insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
    values (p_tenant_id, 'broadcast', (p_decision ->> 'broadcast_id')::uuid, 'send_broadcast', 'system', null,
            coalesce(p_decision -> 'payload', '{}'::jsonb));
  end if;
  return true;
end $$;

revoke all on function public.playbook_run_record(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.playbook_run_record(uuid, uuid, jsonb, jsonb, jsonb) to service_role;

comment on function public.playbook_run_record(uuid, uuid, jsonb, jsonb, jsonb) is
  'A campaign''s run recorded (00722): playbook.run (p_data: what it made, or why nothing), with p_stamp {run_for, at} its step''s day stamped (the day''s run alone), and with p_decision {broadcast_id, payload} the system''s send_broadcast for a batch the sweep scheduled, in one transaction. Service role only.';
/* -- playbook_edit, reach_out_edit: a campaign edited, with playbook.changed in its transaction -- */

-- A campaign's edit was the member's write on their own session (a playbook's row) or the service role's (a chain's
-- save), and its event was written after it, on the all-access key, since a session inserts no event. Each is one door
-- now. A playbook's row is written as the member, by a door that asks what the row's own rule asked (one who acts in the
-- workspace, and a list and a message of its own), and only the columns an edit writes; a chain's edit is its save, as
-- before, with the event beside it.
create or replace function public.playbook_edit(
  p_tenant_id uuid, p_id uuid, p_set jsonb, p_fields text[] default '{}'::text[]
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_by   uuid := auth.uid();
  v_row  public.sequence_steps;
  v_bad  text;
begin
  if v_by is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_set is null or jsonb_typeof(p_set) <> 'object' then
    raise exception 'playbook_edit: the edit is an object' using errcode = '22023';
  end if;
  select k into v_bad from jsonb_object_keys(p_set) k
   where k not in ('name', 'trigger', 'list_id', 'list_key', 'template_id', 'template_name', 'template_language',
                   'params', 'policy_class', 'run_hour', 'cap_per_run', 'gap_days', 'cadence_days', 'channels')
   limit 1;
  if v_bad is not null then
    raise exception 'playbook_edit: % is not a column an edit writes', v_bad using errcode = '22023';
  end if;
  update public.sequence_steps s
     set name = case when p_set ? 'name' then p_set ->> 'name' else s.name end,
         trigger = case when p_set ? 'trigger' then p_set ->> 'trigger' else s.trigger end,
         list_id = case when p_set ? 'list_id' then (p_set ->> 'list_id')::uuid else s.list_id end,
         list_key = case when p_set ? 'list_key' then p_set ->> 'list_key' else s.list_key end,
         template_id = case when p_set ? 'template_id' then (p_set ->> 'template_id')::uuid else s.template_id end,
         template_name = case when p_set ? 'template_name' then p_set ->> 'template_name' else s.template_name end,
         template_language = case when p_set ? 'template_language' then p_set ->> 'template_language'
                                  else s.template_language end,
         params = case when p_set ? 'params' then coalesce(p_set -> 'params', '[]'::jsonb) else s.params end,
         policy_class = case when p_set ? 'policy_class' then p_set ->> 'policy_class' else s.policy_class end,
         run_hour = case when p_set ? 'run_hour' then (p_set ->> 'run_hour')::integer else s.run_hour end,
         cap_per_run = case when p_set ? 'cap_per_run' then (p_set ->> 'cap_per_run')::integer else s.cap_per_run end,
         gap_days = case when p_set ? 'gap_days' then (p_set ->> 'gap_days')::integer else s.gap_days end,
         cadence_days = case when p_set ? 'cadence_days' then (p_set ->> 'cadence_days')::integer else s.cadence_days end,
         channels = case when p_set ? 'channels'
                         then array(select jsonb_array_elements_text(p_set -> 'channels')) else s.channels end
   where s.tenant_id = p_tenant_id and s.id = p_id
  returning * into v_row;
  if not found then
    return false;
  end if;
  -- What the row's own rule asks of an edit: its list and its message are this workspace's.
  if v_row.list_id is not null
     and not exists (select 1 from public.segments g where g.id = v_row.list_id and g.tenant_id = p_tenant_id) then
    raise exception 'playbook_edit: the list is not this workspace''s' using errcode = '42501';
  end if;
  if v_row.template_id is not null
     and not exists (select 1 from public.templates t where t.id = v_row.template_id and t.tenant_id = p_tenant_id) then
    raise exception 'playbook_edit: the message is not this workspace''s' using errcode = '42501';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'playbook.changed', 'message', 'playbook', p_id,
          jsonb_build_object('name', v_row.name, 'by', v_by, 'fields', to_jsonb(coalesce(p_fields, '{}'::text[]))));
  return true;
end $$;

revoke all on function public.playbook_edit(uuid, uuid, jsonb, text[]) from public, anon;
grant execute on function public.playbook_edit(uuid, uuid, jsonb, text[]) to authenticated, service_role;

comment on function public.playbook_edit(uuid, uuid, jsonb, text[]) is
  'A playbook edited in place (00722), as the member: only the columns an edit writes (p_set; any other key is refused), its list and its message this workspace''s, and playbook.changed (its name, who, which parts moved: p_fields) in the same transaction. A member who acts in the workspace. False, and no event, where the row is not there.';

create or replace function public.reach_out_edit(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_saved jsonb;
begin
  if p_chain is null or p_chain ->> 'root_id' is null then
    raise exception 'reach_out_edit: an edit names the chain it edits' using errcode = '22023';
  end if;
  -- The save is reach_out_save's, as an edit has always asked it: no decision rides an edit.
  v_saved := public.reach_out_save(p_tenant_id, p_user_id, p_chain, null, null, null);
  if v_saved ->> 'root_id' is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'playbook.changed', 'message', 'playbook', (v_saved ->> 'root_id')::uuid,
            jsonb_build_object('name', p_chain ->> 'name', 'by', p_user_id, 'fields', jsonb_build_array('steps')));
  end if;
  return v_saved;
end $$;

revoke all on function public.reach_out_edit(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_edit(uuid, uuid, jsonb) to service_role;

comment on function public.reach_out_edit(uuid, uuid, jsonb) is
  'A reach-out chain edited (00722): saved whole through reach_out_save, with no decision, and playbook.changed (its name, who, steps) in the same transaction. Its answer is the save''s. Service role only, as the save is.';
/* -- tenant_config_write: a settings save and its settings.changed in one transaction -- */

-- A member's save of the settings was the row written on their session and then settings.changed on the all-access
-- key, best effort, since a session inserts no event. The versioned door writes both now: with p_told (which parts
-- changed, never their values, and the card it came from), settings.changed with the new version and who, in the save's
-- transaction. A save without p_told writes as it did. The other answers are as they were.
drop function if exists public.tenant_config_write(uuid, jsonb, integer);

create or replace function public.tenant_config_write(
  p_tenant_id uuid, p_config jsonb, p_version integer, p_told jsonb default null
)
returns table(outcome text, version integer, updated_at timestamp with time zone, updated_by uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_row  public.tenant_config;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Who may, as the table's update policy says it (tenant_config_owner_update): the settings permission, a partner's
  -- only on a session that showed its second factor.
  if p_tenant_id is null or not public.caller_has_permission(p_tenant_id, 'settings') then
    raise exception 'Only a member who may change the settings can save them.' using errcode = '42501';
  end if;
  if p_told is not null and (jsonb_typeof(p_told) <> 'object' or jsonb_typeof(p_told -> 'fields') is distinct from 'array') then
    raise exception 'tenant_config_write: what a save says is its fields' using errcode = '22023';
  end if;
  update public.tenant_config c
     set config = p_config, version = p_version + 1, updated_by = v_user
   where c.tenant_id = p_tenant_id and c.version = p_version
  returning c.* into v_row;
  if v_row.tenant_id is not null then
    -- Which parts changed and who by, never the values: on the ledger in the save's transaction.
    if p_told is not null and jsonb_array_length(p_told -> 'fields') > 0 then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
              jsonb_build_object('fields', p_told -> 'fields', 'by', v_user, 'version', v_row.version)
              || case when p_told ? 'via' then jsonb_build_object('via', p_told -> 'via') else '{}'::jsonb end);
    end if;
    return query select 'saved'::text, v_row.version, v_row.updated_at, v_row.updated_by;
  elsif exists (select 1 from public.tenant_config c where c.tenant_id = p_tenant_id) then
    -- Someone saved between the caller's read and this write.
    return query select 'stale'::text, null::integer, null::timestamptz, null::uuid;
  else
    -- The workspace was never given its row: nothing to update, and not a conflict.
    return query select 'missing'::text, null::integer, null::timestamptz, null::uuid;
  end if;
end $$;

revoke all on function public.tenant_config_write(uuid, jsonb, integer, jsonb) from public, anon;
grant execute on function public.tenant_config_write(uuid, jsonb, integer, jsonb) to authenticated, service_role;

comment on function public.tenant_config_write(uuid, jsonb, integer, jsonb) is
  'A member''s versioned write of their workspace''s configuration (00365): the whole column, where the row is still at p_version, by a caller with the settings permission (a partner on a session that showed its second factor), recorded as theirs. With p_told {fields, via} (00722), settings.changed (which parts changed, who, the new version, the card) in the same transaction, where any part changed. outcome is saved (with the new version), stale (someone saved since) or missing (no row).';
