-- 00634 · The database calls cold email cold email, and the sign-up page by its name.
--
-- docs/words.md: what Chanlytics writes to leads from the owner's own mailbox is a cold email (never a reach-out), and
-- the page a customer says yes on is the business's sign-up page. The app's pages say so since
-- expectmeout/chanlytics-os#2351 and #2373; ten functions still raised the old words themselves, and a person read them
-- as they came (a refusal on the cold email sheet, a template's save, a yes refused for someone found as a lead).
--
--   create_message_version, save_template_version   (00343, 00296) a cold email's step is edited in its cold email:
--                                                    "This email is edited in its cold email."
--   reach_out_add, reach_out_chain_report,           (00459, 00451) "Cold email not found." (was "Reach-out not found.")
--   reach_out_hand_run, reach_out_leave_out
--   reach_out_remove                                 (00451) the same, and "This cold email has written already. Pause it
--                                                    instead."
--   reach_out_save (tenant, user, chain)             (00492) "A cold email has at least one email in it.", "This search
--                                                    has a cold email already.", "Cold email not found.", "Open the cold
--                                                    email again.", "Pause the cold email instead."
--   set_contact_consent, set_marketing_consent       (00413) a yes for a person found as a lead comes from them: "their
--                                                    own message, or your sign-up page" (was "your yes page").
--
-- Each is the body production runs (its md5 read on 16 Nov 2026 equals its latest migration's), with those sentences
-- alone changed. No table, no column, no grant: each function is re-made in place, its privileges and comment kept.
-- reach_out_plan_run's two raises name the function and are never shown, and keep theirs.
--
-- Deploy order: either. The app reads the cold email sheet's refusals by their words and knows the old sentence and the
-- new (contracts REACH_OUT_REFUSALS, its SAID_BEFORE); every other sentence here is shown as the database says it.

set local lock_timeout = '3s';

create or replace function public.create_message_version(
  p_tenant_id uuid,
  p_user      uuid,
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
  -- The member the route acts for, asked here because the service role has no session to read (is_acting_member reads
  -- auth.uid()): a person with no seat, a viewer, another workspace's member and no one at all are one answer, as a
  -- stranger gets from save_template_version.
  if p_tenant_id is null or p_user is null or p_name is null or p_name = ''
     or not exists (
       select 1 from public.memberships m
        where m.tenant_id = p_tenant_id and m.user_id = p_user and m.role in ('owner', 'operator', 'partner')) then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  if p_channel is null or p_channel not in ('email', 'sms') then
    raise exception 'A version is written for email or text.' using errcode = '22023';
  end if;
  if left(p_name, 10) = 'reach_out_' then
    raise exception 'This email is edited in its cold email.' using errcode = '22023';
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
    (p_tenant_id, p_channel, p_name, p_language, 'approved', 'chanlytics', p_category, v_vars, v_title, v_parts, v_body, p_user)
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $$;

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
    raise exception 'This email is edited in its cold email.' using errcode = '22023';
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

create or replace function public.reach_out_add(p_root_id uuid, p_lead_ids uuid[], p_dry boolean DEFAULT false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user      uuid := auth.uid();
  r           public.sequence_steps;
  s           public.lead_searches;
  v_ids       uuid[];
  v_join      uuid[] := '{}';
  v_back      uuid[] := '{}';
  v_out       jsonb := '[]'::jsonb;
  v_counts    jsonb := '{}'::jsonb;
  v_month     text;
  v_op        uuid;
  v_waiting   integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Cold email not found.' using errcode = 'P0002';
  end if;
  select * into s from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or s.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- Every sequence's list is a list since 00459; one left on a finder search would gain leads it did not find.
  if s.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', s.id);
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > public.lead_cap('list_rows') then
    raise exception 'leads: 1 to %', public.lead_cap('list_rows') using errcode = '22023';
  end if;
  -- One lead at a time: two adds of one lead, from two piles or two people, meet here, never both.
  if not p_dry then
    perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || x::text))
       from unnest(v_ids) as x order by x;
  end if;

  -- Why each would not go: the one predicate, then what only a list can say (already on it, never counted, with another
  -- reach-out). A lead whose address is being checked joins: it goes once the check says ok.
  with w as (
    select * from public.reach_out_why_not(r.tenant_id, v_ids, r.include_unconfirmed)
  ), facts as (
    select w.lead_id,
           case
             when w.why is not null and w.why <> 'checking' then w.why
             when exists (select 1 from public.lead_search_members m
                           where m.search_id = s.id and m.lead_id = w.lead_id and m.blanked_at is null) then 'already'
             -- Drawn from its search already (00459 auto-add), and not taken out of the list.
             when r.source_search_id is not null
                  and exists (select 1 from public.lead_search_members m
                               where m.search_id = r.source_search_id and m.lead_id = w.lead_id and m.class = 'qualified'
                                 and m.counted and m.blanked_at is null and m.later_at is null)
                  and not exists (select 1 from public.lead_search_members m
                                   where m.search_id = s.id and m.lead_id = w.lead_id and m.blanked_at is not null)
               then 'already'
             when not exists (select 1 from public.lead_search_members m
                                join public.lead_searches q on q.id = m.search_id and q.removed_at is null
                               where m.tenant_id = r.tenant_id and m.lead_id = w.lead_id and m.counted
                                 and m.blanked_at is null) then 'not_counted'
             when o.id is not null then 'elsewhere'
             else null
           end as why,
           o.id as other_id, o.name as other_name
      from w
      -- Another reach-out whose search holds the lead: one reach-out per lead, whichever way it came in.
      left join lateral (
        select p.id, p.name from public.sequence_steps p
          join public.lead_search_members m
            on m.search_id in (p.lead_search_id, p.source_search_id) and m.lead_id = w.lead_id
         where p.tenant_id = r.tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first' and p.id <> r.id
           and m.blanked_at is null and m.class = 'qualified' and m.counted
         order by m.created_at desc
         limit 1) o on true
  )
  select coalesce(jsonb_agg(jsonb_build_object('lead_id', f.lead_id, 'why', f.why, 'chain_id', f.other_id,
                                               'chain_name', f.other_name)
                            order by f.lead_id) filter (where f.why is not null), '[]'::jsonb),
         coalesce(array_agg(f.lead_id) filter (where f.why is null), '{}'::uuid[])
    into v_out, v_join
    from facts f;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_counts
    from (select x->>'why' as k, count(*) as n from jsonb_array_elements(v_out) x group by 1) c;

  if p_dry or cardinality(v_join) = 0 then
    return jsonb_build_object('dry', p_dry, 'added', 0, 'would_add', cardinality(v_join), 'left_out', v_counts,
                              'leads', v_out, 'cap', r.cap_per_run);
  end if;

  v_month := public.lead_month(r.tenant_id, now());
  -- A lead taken back from this list comes back on its own row; the others are added outside any round, counted
  -- without drawing the month again (they were found and paid for once), with the fit, the reason and the share marks
  -- of where each was found, so the check reads why it fits and one business is still written to once.
  with back as (
    update public.lead_search_members m
       set blanked_at = null, later_at = null, version = m.version + 1
     where m.search_id = s.id and m.lead_id = any (v_join) and m.blanked_at is not null
    returning m.lead_id
  )
  select coalesce(array_agg(lead_id), '{}'::uuid[]) into v_back from back;
  insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, class, fit, reason, judgment, counted,
                                          counted_month)
  select s.id, x, null, r.tenant_id, 'qualified', o.fit, coalesce(o.reason, ''), coalesce(o.judgment, '{}'::jsonb), true,
         v_month
    from unnest(v_join) as x
    left join lateral (
      select m.fit, m.reason,
             jsonb_strip_nulls(jsonb_build_object('answer', m.judgment->'answer', 'shares', m.judgment->'shares')) as judgment
        from public.lead_search_members m
        join public.lead_searches q on q.id = m.search_id and q.removed_at is null
       where m.tenant_id = r.tenant_id and m.lead_id = x and m.counted and m.blanked_at is null and m.search_id <> s.id
       order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, m.created_at desc
       limit 1) o on true
   where not (x = any (v_back))
  on conflict (search_id, lead_id) do nothing;
  -- Decided: a lead put off in another pass is no longer for later.
  update public.lead_search_members m set later_at = null
   where m.tenant_id = r.tenant_id and m.lead_id = any (v_join) and m.later_at is not null;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'add', s.id, v_join, jsonb_build_object('back', to_jsonb(v_back)),
          jsonb_build_object('root_id', r.id), 1, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_added', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', s.id, 'n', cardinality(v_join), 'by', v_user));
  select count(*) into v_waiting from public.reach_out_audience(r.tenant_id, s.id, 5000, r.include_unconfirmed);
  return jsonb_build_object('dry', false, 'added', cardinality(v_join), 'op_id', v_op, 'version', 1,
                            'left_out', v_counts, 'leads', v_out, 'waiting', v_waiting, 'cap', r.cap_per_run);
end $$;

create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_steps p
                  where p.id = p_root_id and p.tenant_id = p_tenant_id and p.kind = 'reach_out'
                    and p.trigger = 'lead_first') then
    raise exception 'Cold email not found.' using errcode = 'P0002';
  end if;
  return (
    with recursive c as (
      select p.id, 0 as n from public.sequence_steps p where p.id = p_root_id
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
    ),
    -- Each lead's last send that left, in this chain: where its answer is counted.
    last_sent as (
      select distinct on (s.lead_id) s.lead_id, s.step_id as playbook_id, s.contact_id, l.email, l.closed_reason, l.booked_at
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
       where s.lead_id is not null and ( s.sequence_id = p_root_id and s.tenant_id = p_tenant_id and s.state = 'sent')
       order by s.lead_id, s.sent_at desc
    ),
    -- Who of them wrote back, asked once for all (the send door's own reading).
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answered as (
      select ls.playbook_id,
             count(*) filter (where ls.contact_id in (select contact_id from wrote)) as wrote_back,
             count(*) filter (where ls.closed_reason = 'said_no') as said_no,
             -- Interested (00241, H1): a reading of the lead's reply, not undone, that wants more (Part 5's G6).
             count(*) filter (where exists (
               select 1 from public.sequence_replies r
                where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                  and r.claim <> 'auto_reply' and r.intent in ('interested', 'question'))) as interested,
             -- Booked (00241, H2): an appointment seen after an email of the reach-out left.
             count(*) filter (where ls.booked_at is not null) as booked
        from last_sent ls
       group by ls.playbook_id
    )
    select jsonb_build_object(
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'n', c.n,
        -- An email that left (00241): sent, or failed by a receipt after it left (email_left), as Reports counts it.
        'written', (select count(*) from public.sequence_sends s left join public.messages m on m.id = s.message_id
                     where s.lead_id is not null and ( s.step_id = c.id
                       and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))),
        'delivered', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                       where s.lead_id is not null and ( s.step_id = c.id and s.state = 'sent' and m.status in ('delivered', 'read'))),
        'bounced', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                     where s.lead_id is not null and ( s.step_id = c.id and m.status = 'failed' and m.error->>'provider' = 'bounced')),
        'wrote_back', coalesce((select a.wrote_back from answered a where a.playbook_id = c.id), 0),
        'said_no', coalesce((select a.said_no from answered a where a.playbook_id = c.id), 0),
        'interested', coalesce((select a.interested from answered a where a.playbook_id = c.id), 0),
        'booked', coalesce((select a.booked from answered a where a.playbook_id = c.id), 0),
        'waiting', (select count(*) from public.sequence_sends s
                     where s.lead_id is not null and ( s.step_id = c.id and s.state in ('planned', 'claimed', 'queued'))),
        'held', (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.step_id = c.id and s.state = 'held')),
        'handed', (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.step_id = c.id and s.state = 'handed')))
        order by c.n) from c), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(r order by r->>'run_for' desc) from (
        select jsonb_build_object('id', b.id, 'step_id', b.step_id, 'run_for', b.run_for, 'state', b.state,
                                  'planned', b.recipient_count,
                                  'written', (select count(*) from public.sequence_sends s
                                                left join public.messages m on m.id = s.message_id
                                               where s.lead_id is not null and ( s.batch_id = b.id
                                                 and (s.state = 'sent' or (s.state = 'failed'
                                                      and public.email_left(m.status, m.error))))),
                                  'held', (select count(*) from public.sequence_sends s
                                            where s.lead_id is not null and ( s.batch_id = b.id and s.state = 'held')),
                                  'handed', (select count(*) from public.sequence_sends s
                                              where s.lead_id is not null and ( s.batch_id = b.id and s.state = 'handed'))) as r
          from public.sequence_batches b
         where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
           and b.audience->>'root_id' = p_root_id::text
         order by b.run_for desc
         limit 5) x), '[]'::jsonb),
      'can_remove', not exists (select 1 from public.sequence_sends s
                                 where s.lead_id is not null and ( s.sequence_id = p_root_id
                                   and (s.state in ('claimed', 'queued', 'sent', 'failed', 'drafted')
                                        or (s.state = 'skipped' and s.drafted_at is not null)))))
  );
end $$;

create or replace function public.reach_out_hand_run(p_tenant_id uuid, p_step_id uuid, p_run_id uuid, p_day date, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_step  public.sequence_steps%rowtype;
  v_root  uuid;
  v_item  jsonb;
  v_send  uuid;
  v_made  int := 0;
  v_already int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The run''s leads are a list.' using errcode = '22023';
  end if;
  select * into v_step from public.sequence_steps
   where id = p_step_id and tenant_id = p_tenant_id and kind = 'reach_out' and hand is not null;
  if not found then raise exception 'Step not found.' using errcode = 'P0002'; end if;
  -- Its chain's root: a chain is a few steps, and a walk longer than ten is a loop in the rows.
  with recursive up as (
    select p.id, p.after_step_id as after_playbook_id, 0 as n from public.sequence_steps p where p.id = v_step.after_step_id
    union all
    select p.id, p.after_step_id as after_playbook_id, up.n + 1 from public.sequence_steps p join up on p.id = up.after_playbook_id
     where up.n < 10
  )
  select id into v_root from up where after_playbook_id is null;
  if v_root is null then raise exception 'Cold email not found.' using errcode = 'P0002'; end if;

  insert into public.sequence_batches (id, tenant_id, step_id, run_for, name, template_id, template_name,
                                 template_language, state, scheduled_for, recipient_count, audience)
  values (p_run_id, p_tenant_id, p_step_id, p_day, left(v_step.name || ' · ' || p_day::text, 120), null, null, null,
          'sent', now(), 0,
          jsonb_build_object('kind', 'reach_out', 'root_id', v_root, 'step_id', p_step_id, 'search_id', null,
                             'hand', v_step.hand->>'kind'))
  on conflict do nothing;
  if not exists (select 1 from public.sequence_batches b where b.id = p_run_id and b.tenant_id = p_tenant_id
                   and b.step_id = p_step_id) then
    raise exception 'This step has another run for that day.' using errcode = '23505';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- The lead and its person are the workspace's; the send's row refuses anything else.
    if not exists (select 1 from public.leads l
                    where l.id = (v_item->>'lead_id')::uuid and l.tenant_id = p_tenant_id)
       or not exists (select 1 from public.contacts c
                       where c.id = (v_item->>'contact_id')::uuid and c.tenant_id = p_tenant_id) then
      raise exception 'Lead not found.' using errcode = 'P0002';
    end if;
    v_send := null;
    insert into public.sequence_sends (id, tenant_id, batch_id, step_id, sequence_id, lead_id, contact_id, state,
                                        sent_at)
    values ((v_item->>'send_id')::uuid, p_tenant_id, p_run_id, p_step_id, v_root, (v_item->>'lead_id')::uuid,
            (v_item->>'contact_id')::uuid, 'handed', now())
    on conflict do nothing
    returning id into v_send;
    if v_send is null then
      v_already := v_already + 1;
      continue;
    end if;
    perform public.person_step_from_playbook(p_tenant_id, (v_item->>'contact_id')::uuid, p_day, v_item->>'words',
                                             null, (v_item->>'source_id')::uuid);
    v_made := v_made + 1;
  end loop;

  update public.sequence_batches b
     set recipient_count = (select count(*) from public.sequence_sends s where s.lead_id is not null and ( s.batch_id = b.id))
   where b.id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'made', v_made, 'already', v_already);
end $$;

create or replace function public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user    uuid := auth.uid();
  r         public.sequence_steps;
  q         public.lead_searches;
  m         public.lead_search_members;
  v_skipped integer;
  v_op      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Cold email not found.' using errcode = 'P0002';
  end if;
  select * into q from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or q.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A search's reach-out writes to what its search holds: a lead is left out of it on Leads, never here.
  if q.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', q.id);
  end if;
  -- The add's own lock: an add and a leave of one lead meet here, never both at once.
  perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || p_lead_id::text));
  select * into m from public.lead_search_members
   where search_id = q.id and lead_id = p_lead_id and blanked_at is null
     for update;
  if not found then
    return jsonb_build_object('error', 'not_on_it');
  end if;
  -- What left, or is leaving, stays: Stop writing is the true correction there.
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued'))) then
    return jsonb_build_object('error', 'on_its_way');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('sent', 'handed', 'failed'))) then
    return jsonb_build_object('error', 'sent');
  end if;
  -- Planned, held or drafted (not sent yet) in a run still live: skipped as taken back, which its undo's next run plans
  -- again.
  update public.sequence_sends s
     set state = 'skipped', reason = case when s.state = 'drafted' then 'draft_withdrawn' else 'owner_took_back' end
    from public.sequence_batches b
   where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
     and s.state in ('planned', 'held', 'drafted'));
  get diagnostics v_skipped = row_count;
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'leave', q.id, array[p_lead_id], jsonb_build_object('skipped', v_skipped),
          jsonb_build_object('root_id', r.id), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', q.id, 'n', 1, 'by', v_user, 'left_out', true));
  return jsonb_build_object('ok', true, 'op_id', v_op, 'version', m.version, 'skipped', v_skipped);
end $$;

create or replace function public.reach_out_remove(p_tenant_id uuid, p_root_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_steps uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.sequence_steps
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first' for update;
  if not found then raise exception 'Cold email not found.' using errcode = 'P0002'; end if;
  with recursive c as (
    select id from public.sequence_steps where id = p_root_id
    union all
    select p.id from public.sequence_steps p join c on p.after_step_id = c.id
  )
  select array_agg(id) into v_steps from c;
  -- Held against a claim while it is judged: a claim waits, or finds the chain gone.
  perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.sequence_id = p_root_id) for update;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.sequence_id = p_root_id
                and (s.state in ('claimed', 'queued', 'sent', 'failed', 'drafted')
                     or (s.state = 'skipped' and s.drafted_at is not null)))) then
    raise exception 'This cold email has written already. Pause it instead.' using errcode = '23503';
  end if;
  update public.sequence_batches set state = 'canceled'
   where tenant_id = p_tenant_id and audience->>'kind' = 'reach_out' and audience->>'root_id' = p_root_id::text
     and state in ('pending_approval', 'scheduled', 'sending');
  update public.templates set hidden_at = coalesce(hidden_at, now())
   where id in (select p.template_id from public.sequence_steps p where p.id = any (v_steps));
  delete from public.sequence_steps where id = p_root_id;
  return jsonb_build_object('root_id', p_root_id, 'removed', cardinality(v_steps));
end $$;

create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  -- How its emails end (00492, decision 0077): only a body that names it changes it.
  v_signs    text := case p_chain->>'signs_with' when 'mailbox' then 'mailbox' when 'name' then 'name' end;
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
  v_source   uuid;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A cold email has at least one email in it.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
    -- Made on a finder search (00459): a list of its own, drawing from that search, so it takes the leads you add too.
    if exists (select 1 from public.lead_searches s where s.id = v_search and s.via not in ('chosen', 'import')) then
      if exists (select 1 from public.sequence_steps r where r.source_search_id = v_search) then
        raise exception 'This search has a cold email already.' using errcode = '23505';
      end if;
      v_source := v_search;
      v_search := public.reach_out_list_for(p_tenant_id, v_name, p_user_id);
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.sequence_steps
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Cold email not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.sequence_steps where id = v_root
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the cold email again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = any (v_dropped)) for update;
    if exists (select 1 from public.sequence_sends s
                where s.lead_id is not null and ( s.step_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed'))) then
      raise exception 'That step has written already. Pause the cold email instead.' using errcode = '23503';
    end if;
    update public.sequence_batches set state = 'canceled'
     where tenant_id = p_tenant_id and step_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.sequence_sends set state = 'skipped', reason = 'step_removed'
     where sequence_sends.lead_id is not null and ( step_id = any (v_dropped) and state in ('planned', 'held', 'drafted'));
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.sequence_steps p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_step_id cascades).
    delete from public.sequence_steps where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.sequence_steps (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_step_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by, signs_with)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id, coalesce(v_signs, 'name'));
    else
      select template_id, hand into v_template, v_was_hand from public.sequence_steps where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = v_id)) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.sequence_steps
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.sequence_steps
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.sequence_steps set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.sequence_steps
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes,
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             signs_with = case when v_i = 0 then coalesce(v_signs, signs_with) else 'name' end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  if v_source is not null then
    update public.sequence_steps set source_search_id = v_source where id = v_ids[1];
  end if;
  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = any (v_changed) and s.state in ('planned', 'held'))),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a cold email already.' using errcode = '23505';
end $$;

create or replace function public.set_contact_consent(
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  v_erased   timestamptz;
  v_before   text;
  v_dnc      boolean;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent is null or p_consent not in ('opted_in', 'opted_out', 'unknown') then
    raise exception 'Consent must be opted_in, opted_out or unknown.' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'Source must say how the answer was given.' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.consent into v_tenant, v_erased, v_before
    from contacts c where c.id = p_contact_id;
  -- A stranger learns nothing: not a member reads as not found (00027's
  -- rule). Viewers read only, so they are strangers to this door too.
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  if v_erased is not null then
    raise exception 'This person was deleted.' using errcode = 'P0002';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  -- 0052: and for everyone who works at a lead (contacts.lead_id: linked by a reply that cited ours, or by a member's
  -- hand); "Not at this business" (person_leave_lead) lifts it, for anyone but the lead's own person.
  if p_consent = 'opted_in'
     and (exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = v_tenant)
          or exists (select 1 from public.contacts k
                      where k.id = p_contact_id and k.tenant_id = v_tenant and k.lead_id is not null)) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your sign-up page.' using errcode = '42501';
  end if;

  -- The message, read here, as the offers door reads it.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = v_tenant
       and c.tenant_id = v_tenant
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- dnc follows the answer the way the ingest sets it: a no is a no on every
  -- channel, and a yes or a reset lifts the operator's own block.
  v_dnc := (p_consent = 'opted_out');
  update contacts
     set consent = p_consent, dnc = v_dnc,
         consent_source = p_source, consent_updated_at = now()
   where id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', p_consent, 'source', p_source, 'previous', v_before,
                             'by', v_user, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'contact_id', p_contact_id, 'consent', p_consent, 'dnc', v_dnc,
    'source', p_source, 'previous', v_before, 'updated_at', now());
end $$;

create or replace function public.set_marketing_consent(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_consent    text,
  p_source     text,
  p_note       text default null,
  p_evidence   jsonb default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  -- 0052: and for everyone who works at a lead (contacts.lead_id: linked by a reply that cited ours, or by a member's
  -- hand); "Not at this business" (person_leave_lead) lifts it, for anyone but the lead's own person.
  if auth.uid() is not null and p_consent = 'opted_in'
     and (exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = p_tenant_id)
          or exists (select 1 from public.contacts k
                      where k.id = p_contact_id and k.tenant_id = p_tenant_id and k.lead_id is not null)) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your sign-up page.' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;
