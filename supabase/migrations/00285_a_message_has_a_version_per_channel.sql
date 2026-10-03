-- 00285 · A message has a version per channel.
--
-- A message is a name; a VERSION of it is a templates row of that name on a channel and in a language (One message,
-- every channel, step 1; docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md, 4.3). WhatsApp's
-- versions are Meta's, written by the edge's service role once the number's account has answered. An email's and a
-- text's are written here, by a member, in the same table and the same component shape (a HEADER for an email's
-- subject, a BODY for the words), so one reader serves every channel. A member may only SELECT templates (RLS), so a
-- version is saved and removed through these two doors, as a template's title is (00050).
--
--   save_template_version    writes, or rewrites, the email or text version of a message in a language: approved at
--                            once (nothing reviews it but the person who wrote it) and 'chanlytics' by source. The
--                            MESSAGE must exist: a row of that name in the workspace, WhatsApp's first, whose
--                            category and slots the version takes, and whose title it starts with. A version has its
--                            message's purpose and slots, never its own. What a version may say (the slots it fills,
--                            a text's segments) is contracts' validateOwnVersion, which the route runs first; the
--                            door holds the lengths and the names it may not touch.
--   remove_template_version  deletes an email or text version a member wrote. Never a WhatsApp row (Meta's: the
--                            edge deletes it there too), and never a reach-out's email (reach_out_*, 00228), which
--                            the reach-out owns.
--
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.save_template_version(
  p_tenant_id uuid,
  p_name      text,
  p_language  text,
  p_channel   text,
  p_subject   text,
  p_body      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_subject text := nullif(btrim(regexp_replace(coalesce(p_subject, ''), '\s+', ' ', 'g')), '');
  -- Trimmed of every kind of white space, as contracts' clean() does (btrim alone takes only spaces).
  v_body    text := regexp_replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), '^\s+|\s+$', '', 'g');
  v_source  public.templates%rowtype;
  v_parts   jsonb;
  v_row     public.templates%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_name is null or p_name = ''
     or not public.is_acting_member(p_tenant_id) then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  if p_channel is null or p_channel not in ('email', 'sms') then
    raise exception 'A version is written for email or text.' using errcode = '22023';
  end if;
  if left(p_name, 10) = 'reach_out_' then
    raise exception 'A reach-out''s email is edited in the reach-out.' using errcode = '22023';
  end if;
  -- Meta's own codes: two or three letters, and a region in capitals where there is one (en_US, es, pt_BR, fil).
  if p_language is null or p_language !~ '^[a-z]{2,3}(_[A-Z]{2})?$' then
    raise exception 'Pick a language from the list.' using errcode = '22023';
  end if;
  if p_channel = 'email' then
    if v_subject is null then
      raise exception 'Give the email a subject.' using errcode = '22023';
    end if;
    if char_length(v_subject) > 60 then
      raise exception 'A subject is at most 60 characters.' using errcode = '22023';
    end if;
    if v_body = '' then
      raise exception 'Write the email.' using errcode = '22023';
    end if;
    if char_length(v_body) > 2000 then
      raise exception 'An email is at most 2000 characters.' using errcode = '22023';
    end if;
  else
    v_subject := null;
    if v_body = '' then
      raise exception 'Write the text.' using errcode = '22023';
    end if;
    if char_length(v_body) > 1600 then
      raise exception 'A text is at most 1600 characters.' using errcode = '22023';
    end if;
  end if;

  -- The message: a row of this name, WhatsApp's first, then the one in this language. Its purpose and its slots are
  -- the version's, and its title the version starts with.
  select * into v_source
    from public.templates t
   where t.tenant_id = p_tenant_id and t.name = p_name
   order by (t.channel = 'whatsapp') desc, (t.language = p_language) desc, t.created_at
   limit 1;
  if v_source.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;

  v_parts := case
    when p_channel = 'email' then
      jsonb_build_array(
        jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
        jsonb_build_object('type', 'BODY', 'text', v_body))
    else
      jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body))
  end;

  -- A rewrite keeps what the workspace did to the row since (its title, hiding it) and takes the message's purpose and
  -- slots again, which are the message's to change.
  insert into public.templates
    (tenant_id, channel, name, language, meta_status, source, category, variables, title, components, body_preview, created_by)
  values
    (p_tenant_id, p_channel, p_name, p_language, 'approved', 'chanlytics', v_source.category, v_source.variables,
     v_source.title, v_parts, v_body, v_user)
  on conflict (tenant_id, channel, name, language) do update
     set meta_status  = 'approved',
         source       = 'chanlytics',
         category     = excluded.category,
         variables    = excluded.variables,
         components   = excluded.components,
         body_preview = excluded.body_preview
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $$;

revoke all on function public.save_template_version(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.save_template_version(uuid, text, text, text, text, text) to authenticated, service_role;
comment on function public.save_template_version(uuid, text, text, text, text, text) is
  'Owner or operator writes the email or text version of a message in a language (a templates row of that name on that channel, in Meta''s component shape, approved at once). The message must exist: its category, slots and title come from its WhatsApp row, else another of its rows. Never a reach-out''s email. Rewrites the version when it is on file.';

create or replace function public.remove_template_version(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.templates%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from public.templates t where t.id = p_template_id;
  -- Only an email or a text a member wrote, in a workspace the caller acts for: anything else is not a version to them.
  if v_row.id is null
     or not public.is_acting_member(v_row.tenant_id)
     or v_row.channel not in ('email', 'sms')
     or v_row.source <> 'chanlytics'
     or left(v_row.name, 10) = 'reach_out_' then
    raise exception 'Version not found.' using errcode = 'P0002';
  end if;
  begin
    delete from public.templates where id = v_row.id;
  exception when foreign_key_violation then
    -- A playbook or a broadcast still names it (their template_id keys are not cascading): the owner moves them first.
    raise exception 'A playbook or broadcast still uses this version.' using errcode = 'P0001';
  end;
  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $$;

revoke all on function public.remove_template_version(uuid) from public, anon;
grant execute on function public.remove_template_version(uuid) to authenticated, service_role;
comment on function public.remove_template_version(uuid) is
  'Owner or operator removes an email or text version they wrote. Never a WhatsApp template (Meta''s, deleted through the edge) and never a reach-out''s email.';
