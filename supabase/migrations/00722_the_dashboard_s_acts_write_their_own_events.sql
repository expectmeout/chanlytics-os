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
