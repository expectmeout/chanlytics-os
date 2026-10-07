-- 00342 · A message may begin as an email or a text.
--
-- A message is a name; a VERSION of it is a templates row of that name on a channel and in a language (00296). An email's
-- or a text's is written through save_template_version, which needs the message to exist already: a row of its name,
-- WhatsApp's first, whose category and slots the version takes. So a workspace with no WhatsApp number could write no
-- message at all, though an email or a text needs nothing from Meta (a message needs no WhatsApp row).
--
--   create_message_version   writes the FIRST version of a message, on email or text: a name the workspace holds no row
--                            of, in a language, approved at once and 'chanlytics' by source. The first version is the
--                            one that says what the message is, so it carries what every later version will take from
--                            it: its category (an offer or news, or about their own visit or proposal), its values
--                            (the slots, as the edge writes them on a WhatsApp row: a number, the name a person sees
--                            for it and an example) and its title. It refuses when a row of that name exists on any
--                            channel and in any language, so a second writer never overwrites a message's category or
--                            slots; the other versions are save_template_version's. Two first writers of one name
--                            take turns: the second finds the first's row and is refused.
--
-- What the door holds is what it can know: who may, the lengths, a category that is one of the two, values numbered in
-- order, and that a text is never an offer (texts carry no offers). WHICH messages may be about a visit or a proposal is
-- the route's rule, not the door's: only a starter of the registry is (contracts), a message a member writes is an offer
-- or news. The name's shape and what the words may say are contracts' too, which the route runs first. There is no door
-- that sets a message's category later: a WhatsApp row's is Meta's, and the category of the rest is the first
-- version's. save_template_version and remove_template_version are unchanged.
--
-- Production runs it when the owner pushes it; until then the route that calls this door says so in one sentence and
-- every other path is as it was.
--
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.create_message_version(
  p_tenant_id uuid,
  p_name      text,
  p_language  text,
  p_channel   text,
  p_subject   text,
  p_body      text,
  p_category  text,
  p_variables jsonb,
  p_title     text
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
  v_title   text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_vars    jsonb := '[]'::jsonb;
  v_el      jsonb;
  v_n       int;
  v_label   text;
  v_example text;
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
  -- The edge's own ceiling for a template's name (contracts TEMPLATE_NAME_MAX). Its shape is the route's check.
  if char_length(p_name) > 60 then
    raise exception 'A message''s name is at most 60 characters.' using errcode = '22023';
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

  if p_category is null or p_category not in ('marketing', 'utility') then
    raise exception 'A message is an offer or news, or about their own visit or proposal.' using errcode = '22023';
  end if;
  -- Texts carry no offers: the line is registered with the carriers for replies and appointment messages
  -- (contracts channelNeverCarries).
  if p_channel = 'sms' and p_category = 'marketing' then
    raise exception 'Texts carry no offers.' using errcode = '22023';
  end if;
  if v_title is not null and char_length(v_title) > 60 then
    raise exception 'A title is at most 60 characters.' using errcode = '22023';
  end if;

  -- The values, as the edge writes them on a WhatsApp row: [{ position, label, example }], numbered 1, 2, 3 in order,
  -- the label a person's name for the value (at most 40 characters) and the example a sample or null (at most 100).
  -- What is stored is those three keys and nothing else, whatever else the caller sent.
  if p_variables is null or jsonb_typeof(p_variables) <> 'array' then
    raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
  end if;
  for v_el, v_n in
    select e.value, e.ordinality::int from jsonb_array_elements(p_variables) with ordinality as e
  loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'position') is distinct from 'number'
       or (v_el ->> 'position') <> v_n::text
       or jsonb_typeof(v_el -> 'label') is distinct from 'string'
       or jsonb_typeof(coalesce(v_el -> 'example', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
    end if;
    v_label := nullif(btrim(regexp_replace(v_el ->> 'label', '\s+', ' ', 'g')), '');
    v_example := nullif(btrim(coalesce(v_el ->> 'example', '')), '');
    if v_label is null then
      raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
    end if;
    if char_length(v_label) > 40 then
      raise exception 'A value''s name is at most 40 characters.' using errcode = '22023';
    end if;
    if char_length(v_example) > 100 then
      raise exception 'A value''s example is at most 100 characters.' using errcode = '22023';
    end if;
    v_vars := v_vars || jsonb_build_array(
      jsonb_build_object('position', v_n, 'label', v_label, 'example', v_example));
  end loop;

  -- The message must be new, in every language and on every channel: its category and slots are the first version's,
  -- and a later writer takes them from the rows, never gives them again. The lock makes two first writers of one name
  -- take turns, so the second sees the first's row.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || p_name));
  if exists (select 1 from public.templates t where t.tenant_id = p_tenant_id and t.name = p_name) then
    raise exception 'This message already exists. Write its other versions in the Library.' using errcode = '23505';
  end if;

  v_parts := case
    when p_channel = 'email' then
      jsonb_build_array(
        jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
        jsonb_build_object('type', 'BODY', 'text', v_body))
    else
      jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body))
  end;

  insert into public.templates
    (tenant_id, channel, name, language, meta_status, source, category, variables, title, components, body_preview, created_by)
  values
    (p_tenant_id, p_channel, p_name, p_language, 'approved', 'chanlytics', p_category, v_vars, v_title, v_parts, v_body, v_user)
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $$;

revoke all on function public.create_message_version(uuid, text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_message_version(uuid, text, text, text, text, text, text, jsonb, text) to authenticated, service_role;
comment on function public.create_message_version(uuid, text, text, text, text, text, text, jsonb, text) is
  'Owner or operator writes the FIRST version of a message, on email or text: a name the workspace holds no row of, approved at once, with the message''s category (marketing or utility), its values as the edge writes them on a WhatsApp row, and its title. Refuses a name any row of the workspace holds, a text of a marketing message (texts carry no offers) and a reach-out''s name. The versions after the first are save_template_version''s.';
