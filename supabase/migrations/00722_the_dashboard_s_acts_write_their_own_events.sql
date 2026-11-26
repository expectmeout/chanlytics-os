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
--
-- Nothing a customer sees changes: the same kinds, with the same words, in the same places.
--
-- Deploy order: either. An old dashboard keeps writing its rows and its events as before: nothing here changes what it
-- calls. The new dashboard calls the new doors, which a database from before this does not have: it deploys after this
-- is applied, as the house applies a migration before its merge.
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
