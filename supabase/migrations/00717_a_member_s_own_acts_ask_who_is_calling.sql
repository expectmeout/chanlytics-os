-- 00717 · A member's own acts and reads ask who is calling (lane 2 of the code refinement plan, 25 Nov 2026: least
-- privilege, layer 11's code moves and layer 8's leftovers).
--
-- The dashboard reached these doors with the service-role key, after its route had checked the member, because only
-- the service role could call them. So the route's check was the only one, and the dashboard held the key that opens
-- every table for each of them. Each now asks who is calling, as the house's member doors do (content_week_approve,
-- set_workspace_logo): a signed-in caller must belong to the workspace, and may change it only where their role acts;
-- the service role (the edge, a clock, a deploy from before this) is let through as before, naming its workspace
-- itself. The dashboard calls them on the member's own session.
--
--   Reads, by a member of the workspace:
--     campaign_month_sent, reach_out_month_sent, source_files_tally, reach_out_drafts_waiting (one workspace named:
--     every workspace at once stays the service role's), reach_out_again_count, lead_addresses_suppressed,
--     mailbox_capacity and mailbox_connection_counts (the mailbox's own workspace). source_files_tally runs as its
--     owner now, where it ran as its caller, as the others do. The seven written in SQL are written in plpgsql, to ask
--     first; what each answers is the same statement, unchanged.
--   Acts, by a member who acts (owner, operator, a partner on a session that showed its second factor), as the routes
--   that call them ask:
--     form_entry_hold, form_entry_let_through, conversation_set_aside, and claim_conversation_control for the caller's
--     own hold alone (a person's, by themself); a call's hold stays the edge's.
--   files.made, read by members: the row is theirs already (files_member_select), and how a piece was made is what its
--   Details say.
--
-- Nothing a customer sees changes: every caller the routes let through is let through here, and every answer is the
-- same. Either deploy order works: a dashboard still calling with the service role passes as the service role.
set local lock_timeout = '3s';

/* -- campaign_month_sent -- */

create or replace function public.campaign_month_sent(p_tenant_id uuid, p_channel text, p_at timestamp with time zone DEFAULT now())
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  with zone as (
    select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'broadcast' and m.channel = p_channel and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  );
end $$;

/* -- reach_out_month_sent -- */

create or replace function public.reach_out_month_sent(p_tenant_id uuid, p_at timestamp with time zone)
returns integer
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  with zone as (
    select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'reach_out' and m.channel = 'email' and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  );
end $$;

/* -- source_files_tally -- */

create or replace function public.source_files_tally(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  select jsonb_build_object(
    'files', count(*),
    'away', count(*) filter (where f.kind = 'video' and f.copy_state <> 'here'),
    'used', count(*) filter (where public.file_was_used(f.tenant_id, f.id)))
    from public.files f
   where f.tenant_id = p_tenant_id and public.file_road_is_watched(f.source) and f.removed_at is null
  );
end $$;

/* -- reach_out_drafts_waiting -- */

create or replace function public.reach_out_drafts_waiting(p_limit integer, p_tenant_id uuid DEFAULT NULL::uuid, p_run_id uuid DEFAULT NULL::uuid, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
returns TABLE(id uuid, tenant_id uuid, lead_id uuid, broadcast_id uuid, drafted_at timestamp with time zone, facts jsonb)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return query
  select s.id, s.tenant_id, s.lead_id, s.batch_id as broadcast_id, s.drafted_at,
         public.reach_out_draft_facts(s.tenant_id, s.lead_id)
    from public.sequence_sends s
   where s.lead_id is not null and ( s.state = 'drafted'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (p_run_id is null or s.batch_id = p_run_id)
     and (p_after_at is null or (s.drafted_at, s.id) > (p_after_at, p_after_id)))
   order by s.drafted_at, s.id
   limit greatest(coalesce(p_limit, 0), 0);
end $$;

/* -- reach_out_again_count -- */

create or replace function public.reach_out_again_count(p_tenant_id uuid, p_root_id uuid, p_days integer DEFAULT 90)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  -- Who this sequence would try again, and from when (00608, decision 0120): the businesses its first email wrote to that
  -- reach_out_comes_back would let back once their last email is p_days old (its rules, the age aside), and the moment
  -- the first of them comes back. {count, first_at}.
  with written as (
    select s.lead_id, max(s.sent_at) as last_at
      from public.sequence_sends s
     where s.lead_id is not null and (s.tenant_id = p_tenant_id and s.sequence_id = p_root_id
       and s.step_id = s.sequence_id and s.state in ('sent', 'handed'))
     group by s.lead_id
  ),
  back as (
    select w.lead_id, w.last_at
      from written w
     where w.lead_id in (select b.lead_id from public.reach_out_comes_back(p_tenant_id, array(select lead_id from written), 0) b)
  )
  select jsonb_build_object(
           'count', count(*),
           'first_at', min(b.last_at) + make_interval(days => greatest(coalesce(p_days, 90), 0)))
    from back b
  );
end $$;

/* -- mailbox_capacity -- */

create or replace function public.mailbox_capacity(p_mailbox_id uuid, p_at timestamp with time zone)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if not coalesce(public.may_read_workspace((select b.tenant_id from public.mailbox_connections b where b.id = p_mailbox_id)), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  with b as (
    select id, tenant_id, state, clean_since, resting_until, daily_cap, customer_domain
      from public.mailbox_connections where id = p_mailbox_id
  ),
  gone as (
    -- What left the mailbox, or went and nobody knows how: by when it left, back 120 days at most.
    select coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as at
      from public.sequence_sends s
      join b on b.id = s.mailbox_id
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.state in ('sent', 'queued', 'failed')
       and m.created_at >= p_at - interval '120 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  ),
  waiting as (
    -- Written and not yet gone, and claimed with no email yet: each counts against the day as it is spent.
    select coalesce(s.claimed_at, p_at) as at
      from public.sequence_sends s
      join b on b.id = s.mailbox_id
      left join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.state = 'claimed' or (s.state = 'queued' and (m.id is null or m.status = 'queued')))
  ),
  planned as (
    select s.send_at as at from public.sequence_sends s join b on b.id = s.mailbox_id where s.lead_id is not null and ( s.state = 'planned')
  )
  select jsonb_build_object(
    'state', b.state,
    'clean_since', b.clean_since,
    'resting_until', b.resting_until,
    'daily_cap', b.daily_cap,
    'customer_domain', b.customer_domain,
    -- D15: the days it actually sent on (UTC days) since it was last clean, before today's.
    'sent_days', (select count(distinct (g.at at time zone 'UTC')::date) from gone g
                   where g.at >= greatest(b.clean_since, p_at - interval '90 days')
                     and (g.at at time zone 'UTC')::date < (p_at at time zone 'UTC')::date),
    'sent_today', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at),
    'used', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at)
            + (select count(*) from waiting),
    'recent', coalesce((select jsonb_agg((extract(epoch from x.at) * 1000)::bigint order by x.at) from (
                 select at from gone where at > p_at - interval '1 day'
                 union all select at from waiting
                 union all select at from planned) x), '[]'::jsonb),
    'last_sent_at', (select max(g.at) from gone g where g.at <= p_at)
  ) from b
  );
end $$;

/* -- mailbox_connection_counts -- */

create or replace function public.mailbox_connection_counts(p_mailbox_id uuid, p_since timestamp with time zone)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if not coalesce(public.may_read_workspace((select b.tenant_id from public.mailbox_connections b where b.id = p_mailbox_id)), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return (
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at, s.tenant_id
      from public.sequence_sends s
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.lead_id is not null and ( s.mailbox_id = p_mailbox_id
       and m.created_at >= now() - interval '90 days')
  ), recent as (
    select o.id, o.status, o.error, o.tenant_id from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
     order by o.created_at desc
     limit 500
  ), noes as (
    -- Each person's no in the window, by how they said it; a reply's no undone is no no.
    select e.subject_id, e.data->>'source' as source from recent r
      join public.events e
        on e.tenant_id = r.tenant_id and e.kind = 'contact.consent_changed'
       and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
       and e.data->>'purpose' = 'email_marketing' and e.data->>'source' in ('unsubscribe', 'reply')
       and e.data->>'message_id' = r.id::text
       and not (e.data->>'source' = 'reply' and exists (
         select 1 from public.events u
          where u.tenant_id = r.tenant_id and u.kind = 'contact.consent_changed'
            and u.created_at >= e.created_at and u.subject_id = e.subject_id
            and u.data->>'purpose' = 'email_marketing' and u.data->>'source' = 'reply_undone'
            and u.data->>'message_id' = e.data->>'message_id'))
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A hard bounce only: a full mailbox or a greylisting server says nothing about the mailbox that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    -- A receiving server refusing the sender: the mailbox's own standing, never the address's.
    'blocked', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'blocked'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    -- A person counts once, however many of the window's emails their noes name, and an unsubscribe of theirs makes
    -- their no an unsubscribe: the door's own rule (set_email_marketing: a reply's no an unsubscribe follows is the
    -- unsubscribe's), so a person who said no and then pressed the link counts toward the hold.
    'unsubscribed', (select count(distinct subject_id) from noes where source = 'unsubscribe'),
    'said_no', (select count(distinct n.subject_id) from noes n where n.source = 'reply'
                  and not exists (select 1 from noes u where u.subject_id = n.subject_id and u.source = 'unsubscribe')))
  );
end $$;

/* -- lead_addresses_suppressed -- */

create or replace function public.lead_addresses_suppressed(p_tenant_id uuid, p_addresses text[])
returns SETOF text
language plpgsql stable security definer
set search_path to 'public'
set plan_cache_mode to 'force_generic_plan'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.may_read_workspace(p_tenant_id), false) then
      raise exception 'Not a member of this workspace.' using errcode = '42501';
    end if;
  end if;
  return query
    with asked as (
      select distinct lower(btrim(a)) as address
        from unnest(coalesce(p_addresses, '{}'::text[])) as a
       where nullif(btrim(a), '') is not null
    ),
    parts as (
      select q.address,
             case when position('@' in q.address) > 0 then nullif(split_part(q.address, '@', -1), '') end as domain
        from asked q
    )
    select p.address from parts p
     where p.address in (select s from public.lead_values_suppressed(p_tenant_id, 'email',
                           array(select x.address from parts x)) s)
        or p.domain in (select s from public.lead_values_suppressed(p_tenant_id, 'domain',
                          array(select distinct x.domain from parts x where x.domain is not null)) s);
end $$;

/* -- form_entry_hold -- */

create or replace function public.form_entry_hold(p_tenant_id uuid, p_entry_id uuid)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_held integer;
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  end if;
  update public.form_entries
     set state = 'held', held_why = 'member'
   where tenant_id = p_tenant_id and id = p_entry_id and form_id is not null and state <> 'held' and not test;
  get diagnostics v_held = row_count;
  return v_held > 0;
end $$;

/* -- form_entry_let_through -- */

create or replace function public.form_entry_let_through(p_tenant_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_entry   public.form_entries%rowtype;
  v_person  jsonb;
  v_contact uuid;
  v_owed    text[] := array['note', 'notice'];
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  end if;
  select * into v_entry from public.form_entries e
   where e.tenant_id = p_tenant_id and e.id = p_entry_id and e.state = 'held'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'gone', 'entry_id', p_entry_id, 'contact_id', null);
  end if;
  -- A request a member had set aside has its person and has told its owner already: it is only a request again.
  if v_entry.contact_id is not null then
    update public.form_entries e
       set held_why = null,
           state = case when exists (select 1 from unnest(e.owed) o
                                      where (e.effects -> o ->> 'state') is distinct from 'done')
                        then 'accepted' else 'processed' end
     where e.tenant_id = p_tenant_id and e.id = p_entry_id;
    return jsonb_build_object('outcome', 'back', 'entry_id', p_entry_id, 'contact_id', v_entry.contact_id);
  end if;
  -- Its person is resolved now, and its event written now: everything it should have started starts now. A person
  -- who asked to be forgotten is not made again, and the entry goes.
  begin
    v_person := public.resolve_person(
      p_tenant_id, '', '', coalesce(v_entry.reach ->> 'phone', ''), coalesce(v_entry.reach ->> 'email', ''),
      coalesce(v_entry.reach ->> 'name', ''), 'found', 'form', jsonb_build_object('form_id', v_entry.form_id));
  exception when sqlstate 'PE001' then
    delete from public.form_entries e where e.tenant_id = p_tenant_id and e.id = p_entry_id;
    return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null);
  end;
  v_contact := (v_person ->> 'contact_id')::uuid;
  update public.form_entries
     set contact_id = v_contact, state = 'accepted', held_why = null, owed = v_owed
   where tenant_id = p_tenant_id and id = p_entry_id;
  update public.forms set last_entry_at = now() where tenant_id = p_tenant_id and id = v_entry.form_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', p_entry_id,
          jsonb_build_object('form', 'request', 'owed', to_jsonb(v_owed), 'form_id', v_entry.form_id));
  return jsonb_build_object('outcome', 'accepted', 'entry_id', p_entry_id, 'contact_id', v_contact);
end $$;

/* -- conversation_set_aside -- */

create or replace function public.conversation_set_aside(p_tenant_id uuid, p_conversation_id uuid, p_why text)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_id uuid;
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  end if;
  if p_why is null or p_why not in ('pitch', 'notice') then
    raise exception 'conversation_set_aside: a thread is set aside as a pitch or a notice' using errcode = '22023';
  end if;
  -- contracts' archive move, whole, and what it was set aside as. A thread someone already has is theirs, and is left alone.
  update public.conversations
     set state = 'archived', paused_until = null, snooze_until = null, assignee_user_id = null,
         set_aside_at = now(), set_aside_why = p_why
   where id = p_conversation_id and tenant_id = p_tenant_id and assignee_user_id is null
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  -- The platform's own close, as a reading's is: no member is named as resolving it, and no decision is recorded.
  update public.escalations
     set state = 'resolved'
   where conversation_id = p_conversation_id and tenant_id = p_tenant_id and state = 'open';
  return true;
end $$;

/* -- claim_conversation_control -- */

create or replace function public.claim_conversation_control(p_tenant_id uuid, p_conversation_id uuid, p_kind text, p_by uuid, p_ref text, p_seconds integer)
returns text
language plpgsql security definer
set search_path to 'public'
as $$
declare
  -- 00717: the service role (the edge, a clock, a deploy from before this door asked) names its workspace itself.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_kind  text;
  v_by    uuid;
  v_ref   text;
  v_until timestamptz;
  v_same  boolean;
  v_live  boolean;
begin
  if v_service is not true then
    if auth.uid() is null then
      raise exception 'Sign in required.' using errcode = '28000';
    end if;
    if p_kind is distinct from 'person' or p_by is distinct from auth.uid()
       or p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  end if;
  if p_kind not in ('person', 'call') then
    raise exception 'control kind must be person or call' using errcode = '22023';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'a hold lasts between a second and a day' using errcode = '22023';
  end if;
  -- FOR UPDATE, so two claimants in the same instant are decided by the
  -- database and not by whichever of them read first. That is the whole point
  -- of the function: the same question asked as a select and then an update
  -- lets both callers believe the thread was free.
  select c.control_kind, c.control_by, c.control_ref, c.control_until
    into v_kind, v_by, v_ref, v_until
    from conversations c
   where c.id = p_conversation_id and c.tenant_id = p_tenant_id
     for update;
  if not found then
    return 'gone';
  end if;
  -- A live hold, and whose it is decides what happens next.
  --
  --   the same holder    renewing, not competing. A call sends an event every
  --                      few turns, and that is what keeps a long call from
  --                      lapsing mid-sentence.
  --   a person claiming  takes it, always. A person stepping in outranks the
  --                      machine -- that is what stepping in MEANS -- and a
  --                      colleague is not locked out of a thread by another
  --                      colleague. Coordinating between people is theirs to
  --                      do; this fact exists to keep the machine off.
  --   a call claiming    never takes a hold somebody else has. The call still
  --                      happens; it simply does not get to say the thread is
  --                      its own while a person is on it.
  v_live := v_until is not null and v_until >= now();
  v_same := v_kind = p_kind and v_by is not distinct from p_by and v_ref is not distinct from p_ref;
  if v_live and not v_same and p_kind <> 'person' then
    return 'held';
  end if;
  update conversations
     set control_kind  = p_kind,
         control_by    = p_by,
         control_ref   = p_ref,
         control_until = now() + make_interval(secs => p_seconds)
   where id = p_conversation_id and tenant_id = p_tenant_id;
  -- Renewed is the same holder going on; taking one from somebody else is a
  -- claim, and the caller is owed the difference -- it is the line in the log
  -- that says a person stepped into a call.
  return case when v_live and v_same then 'renewed' else 'claimed' end;
end $$;


/* -- who may call them -- */

revoke all on function public.campaign_month_sent(uuid, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.campaign_month_sent(uuid, text, timestamp with time zone) to authenticated, service_role;
revoke all on function public.reach_out_month_sent(uuid, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.reach_out_month_sent(uuid, timestamp with time zone) to authenticated, service_role;
revoke all on function public.source_files_tally(uuid) from public, anon, authenticated;
grant execute on function public.source_files_tally(uuid) to authenticated, service_role;
revoke all on function public.reach_out_drafts_waiting(integer, uuid, uuid, timestamp with time zone, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_drafts_waiting(integer, uuid, uuid, timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.reach_out_again_count(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reach_out_again_count(uuid, uuid, integer) to authenticated, service_role;
revoke all on function public.mailbox_capacity(uuid, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.mailbox_capacity(uuid, timestamp with time zone) to authenticated, service_role;
revoke all on function public.mailbox_connection_counts(uuid, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.mailbox_connection_counts(uuid, timestamp with time zone) to authenticated, service_role;
revoke all on function public.lead_addresses_suppressed(uuid, text[]) from public, anon, authenticated;
grant execute on function public.lead_addresses_suppressed(uuid, text[]) to authenticated, service_role;
revoke all on function public.form_entry_hold(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_entry_hold(uuid, uuid) to authenticated, service_role;
revoke all on function public.form_entry_let_through(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_entry_let_through(uuid, uuid) to authenticated, service_role;
revoke all on function public.conversation_set_aside(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.conversation_set_aside(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.claim_conversation_control(uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_conversation_control(uuid, uuid, text, uuid, text, integer) to authenticated, service_role;

/* -- what each says -- */

comment on function public.campaign_month_sent(uuid, text, timestamp with time zone) is
  'The campaign messages (a broadcast''s or a playbook run''s: meta.source broadcast) a workspace sent on a channel this calendar month in its own zone that left, may have left, or wait to go: what its month''s allowance on that channel has spent (00298; reach_out_month_sent counts the cold emails the same way). A member of the workspace, or the service role (00717).';
comment on function public.reach_out_month_sent(uuid, timestamp with time zone) is
  'The cold emails a workspace wrote this calendar month in its own zone that left, may have left, or wait to go: what its month''s allowance has spent (00187). A member of the workspace, or the service role (00717).';
comment on function public.source_files_tally(uuid) is
  'What came from a workspace''s watched folders and is still in its Library (00655): files (how many), away (clips whose copy is not at the video platform now, so they play only while a folder is watched), used (those a post or a video used, which stay whatever becomes of their folder). What a stop and a disconnect say before the press. A member of the workspace, or the service role (00717).';
comment on function public.reach_out_drafts_waiting(integer, uuid, uuid, timestamp with time zone, uuid) is
  'The drafts waiting for their owners (00429), oldest first, at most p_limit after the one named (p_after_at, p_after_id), of one workspace or every one, of one run or all, each with when it was handed and its lead''s facts (reach_out_draft_facts) for the send door''s rule (contracts draftRefusalOf). A member names their own workspace; every workspace at once is the service role''s alone (00717).';
comment on function public.reach_out_again_count(uuid, uuid, integer) is
  'Who a sequence to leads would try again after p_days, and from when (00608, decision 0120): {count, first_at}, the businesses its first email wrote to that reach_out_comes_back lets back, the age aside. A member of the workspace, or the service role (00717).';
comment on function public.mailbox_capacity(uuid, timestamp with time zone) is
  'A connected mailbox''s day (00424): its state, rest, cap and customer domain; sent_days (the UTC days it sent on since clean_since, before today''s: the ramp''s step, D15); sent_today and used (what left in the last day, and that plus what is written or claimed and not gone); recent (every moment it spends, planned included, epoch ms); last_sent_at. From its reach-out sends. A member of the mailbox''s workspace, or the service role (00717).';
comment on function public.mailbox_connection_counts(uuid, timestamp with time zone) is
  'What one connected mailbox''s reach-out emails came to since p_since, within 90 days and its last 500: sent, bounced (hard), blocked (a server refused the sender), complained, unsubscribed, and said_no (replied no, not undone, and unsubscribed from none of them). contracts mailboxHoldOf holds a mailbox on complaints, hard and blocked bounces, and unsubscribes; never on noes. The mailboxes clock (the service role) and Setup''s read (a member of the mailbox''s workspace, 00717).';
comment on function public.lead_addresses_suppressed(uuid, text[]) is
  'The never-again list for addresses (Reach out Part 5, G9): each asked address, lower-cased and trimmed, that an email row holds, or whose domain (after its last "@") a domain row holds. The one predicate the send door''s facts, the audience and the finder ask. A member of the workspace, or the service role (00717).';
comment on function public.form_entry_hold(uuid, uuid) is
  'A request a member says is not a real one, held (00680): it leaves every count and waits in its form''s held pile, where form_entry_let_through brings it back. Answers whether one was held. A member who acts (is_acting_member), or the service role (00717).';
comment on function public.form_entry_let_through(uuid, uuid) is
  'A held form entry let through (00680): one held with no person has its person resolved now and its form_entry.accepted written now, so its note and its notice start then; one a member had set aside is a request again, and tells nobody twice. Answers {outcome: accepted|back|forgotten|gone, entry_id, contact_id}: a forgotten person''s entry is deleted. A member who acts (is_acting_member), or the service role (00717).';
comment on function public.conversation_set_aside(uuid, uuid, text) is
  'A thread set aside as not a customer''s, in one transaction (00539, decision 0093): archived, said so, its open hold resolved. False where someone has the thread. A member who acts (is_acting_member), or the service role (00717).';
comment on function public.claim_conversation_control(uuid, uuid, text, uuid, text, integer) is
  'Take the live hold on a thread, or renew one this holder already has. A person takes it from anyone; a call never takes one somebody else holds. Returns claimed, renewed, held or gone. Atomic: the row is locked, so two claimants cannot both be told the thread was free. A member who acts takes their own hold as a person (p_kind person, p_by themself); a call''s is the service role''s (00717).';

/* -- how a piece was made, read by its workspace -- */

grant select (made) on public.files to authenticated;
comment on column public.files.made is
  'How Ask made it (00553): {from, plan}. Empty on everything a person or an import brought. Read by the workspace''s members (00717), as the rest of its row is.';
