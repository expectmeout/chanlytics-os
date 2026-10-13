-- 00422 · A reach-out writes from a connected mailbox (decision 0056).
--
-- A reach-out's sends are planned, claimed and counted by the mailbox they leave from, never by a domain on an account
-- of the platform's:
--
--   reach_out_sends.mailbox_id   the mailbox a send leaves from (its workspace's, by the house fence). A lead keeps
--                                the mailbox of its first email for the whole chain (core runReachOut).
--   playbooks.mailbox_ids        the mailboxes a chain writes from: its owner's choice, none for every live one.
--   mailbox_capacity             what a mailbox has spent and will spend: what left in the last day and when, what is
--                                written and not yet gone, what is planned, and the days it has sent on since it was
--                                last clean (D15), from the sends themselves.
--   reach_out_due_mailboxes      the connected mailboxes with a send due, earliest first, past the ones a tick holds.
--   reach_out_claim_from         a mailbox's due sends, claimed within its day under its lock (C7, as reach_out_claim).
--   outreach_mailbox_facts       what the send door asks of a cold email (outreach_lead_facts, as before) and of the
--                                mailbox its From is: its state, its rest, its cap, its customer domain, its ramp's days
--                                and what left from it in the last day.
--   mailbox_connection_counts    what a mailbox's own emails came to since it was last counted clean: sent, permanent
--                                bounces, unsubscribes and noes, as sending_domain_counts counted a domain's.
--   reach_out_followers          each follower's mailbox: the one its chain last wrote to it from.
--   reach_out_plan_run           writes each send's mailbox.
--   the check's holds            one more: a business abroad (abroad, decision 0056, 9), which its owner may include
--                                past as the others.
--   reach_out_save, reach_out_search_lines, reach_out_lead_timeline, reach_out_report
--                                name the mailbox where they named a domain; the report's delivered is what left and
--                                did not fail, since no provider tells a mailbox it delivered.
--
-- Either deploy order works. The old columns (domain_id, domain_ids) and functions (reach_out_claim,
-- reach_out_due_domains, sending_domain_capacity, outreach_facts) stay as they are, unread by the code that comes with
-- this, and go in the next change; production holds no reach-out send and no sending domain (13 October 2026), so
-- nothing is carried over. Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------- 1. the columns -- */

alter table public.reach_out_sends add column if not exists mailbox_id uuid;
alter table public.reach_out_sends drop constraint if exists reach_out_sends_mailbox_id_same_workspace;
alter table public.reach_out_sends add constraint reach_out_sends_mailbox_id_same_workspace
  foreign key (tenant_id, mailbox_id) references public.mailbox_connections (tenant_id, id) on delete set null (mailbox_id);
create index if not exists reach_out_sends_mailbox_due on public.reach_out_sends (mailbox_id, send_at) where state = 'planned';
create index if not exists reach_out_sends_mailbox on public.reach_out_sends (mailbox_id, state) where mailbox_id is not null;
comment on column public.reach_out_sends.mailbox_id is
  'The mailbox this send leaves from (00422): planned with it, claimed under its day, and kept by its lead for the whole chain. Null for a skipped send, or once its mailbox is gone.';

alter table public.playbooks add column if not exists mailbox_ids uuid[] not null default '{}';
comment on column public.reach_out_sends.domain_id is
  'Retired (decision 0056): the sending domain a send left from on the cold Resend lane. Nothing writes it now; mailbox_id is the send''s.';
comment on column public.playbooks.domain_ids is
  'Retired (decision 0056): the sending domains a chain wrote from. reach_out_save empties it; mailbox_ids is the chain''s.';
comment on column public.playbooks.mailbox_ids is
  'A reach-out step''s mailboxes (00422): the ones its owner picked, or none for every connected one of its workspace.';

-- The check's holds, and what an owner may include past: a business abroad (00422).
alter table public.reach_out_sends drop constraint if exists reach_out_sends_held_says_why;
alter table public.reach_out_sends add constraint reach_out_sends_held_says_why check (
  state <> 'held' or reason in ('customer_domain', 'chain', 'language', 'unbacked_fact', 'reads_like_spam',
                                'check_unavailable', 'abroad'));
alter table public.reach_out_sends drop constraint if exists reach_out_sends_check_is_whole;
alter table public.reach_out_sends add constraint reach_out_sends_check_is_whole check (
  (opening is null or char_length(opening) between 1 and 400)
  and (angle is null or char_length(angle) between 1 and 40)
  and (hold_detail is null or char_length(hold_detail) <= 120)
  and (checked_words is null or char_length(checked_words) between 1 and 64)
  and check_tries between 0 and 100
  and check_gen >= 0
  and cardinality(facts_used) <= 12
  and included_for <@ array['customer_domain', 'chain', 'language', 'unbacked_fact', 'reads_like_spam',
                            'check_unavailable', 'abroad']);

/* ------------------------------------------------------------ 2. a mailbox's day -- */

create or replace function public.mailbox_capacity(p_mailbox_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select id, tenant_id, state, clean_since, resting_until, daily_cap, customer_domain
      from public.mailbox_connections where id = p_mailbox_id
  ),
  gone as (
    -- What left the mailbox, or went and nobody knows how: by when it left, back 120 days at most.
    select coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as at
      from public.reach_out_sends s
      join b on b.id = s.mailbox_id
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.state in ('sent', 'queued', 'failed')
       and m.created_at >= p_at - interval '120 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  ),
  waiting as (
    -- Written and not yet gone, and claimed with no email yet: each counts against the day as it is spent.
    select coalesce(s.claimed_at, p_at) as at
      from public.reach_out_sends s
      join b on b.id = s.mailbox_id
      left join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.state = 'claimed' or (s.state = 'queued' and (m.id is null or m.status = 'queued'))
  ),
  planned as (
    select s.send_at as at from public.reach_out_sends s join b on b.id = s.mailbox_id where s.state = 'planned'
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
$$;
revoke all on function public.mailbox_capacity(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mailbox_capacity(uuid, timestamptz) to service_role;
comment on function public.mailbox_capacity(uuid, timestamptz) is
  'A connected mailbox''s day (00422): its state, rest, cap and customer domain; sent_days (the UTC days it sent on since clean_since, before today''s: the ramp''s step, D15); sent_today and used (what left in the last day, and that plus what is written or claimed and not gone); recent (every moment it spends, planned included, epoch ms); last_sent_at. From its reach-out sends. Service role only.';

/* --------------------------------------------------- 3. the clock's two reads -- */

create or replace function public.reach_out_due_mailboxes(
  p_at             timestamptz,
  p_limit          integer,
  p_tenant_id      uuid default null,
  p_skip_tenants   uuid[] default '{}',
  p_skip_mailboxes uuid[] default '{}'
)
returns table (id uuid, tenant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.tenant_id
    from public.mailbox_connections b
    -- Its earliest due send that goes ahead, so a paused chain's backlog is walked only as far as the first that does.
    cross join lateral (
      select s.send_at as first_due
        from public.reach_out_sends s
        join public.broadcasts r on r.id = s.broadcast_id
        join public.playbooks p on p.id = s.playbook_id
        join public.playbooks root on root.id = s.root_id
       where s.mailbox_id = b.id and s.state = 'planned' and s.send_at <= p_at and s.checked_at is not null
         and r.state in ('scheduled', 'sending') and p.state = 'running' and root.state = 'running'
       order by s.send_at
       limit 1) due
   where b.state = 'connected' and (b.resting_until is null or b.resting_until <= p_at)
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not (b.tenant_id = any (coalesce(p_skip_tenants, '{}')))
     and not (b.id = any (coalesce(p_skip_mailboxes, '{}')))
   order by due.first_due, b.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke all on function public.reach_out_due_mailboxes(timestamptz, integer, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.reach_out_due_mailboxes(timestamptz, integer, uuid, uuid[], uuid[]) to service_role;
comment on function public.reach_out_due_mailboxes(timestamptz, integer, uuid, uuid[], uuid[]) is
  'The connected, rested mailboxes with a reach-out send due and going ahead (checked, its run and chain running), earliest first (00422). Service role only.';

create or replace function public.reach_out_claim_from(p_mailbox_id uuid, p_cap integer, p_at timestamptz, p_limit integer)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  if p_mailbox_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per mailbox at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim_mailbox:' || p_mailbox_id::text));
  if not exists (select 1 from public.mailbox_connections
                  where id = p_mailbox_id and state = 'connected'
                    and (resting_until is null or resting_until <= p_at)) then
    return;
  end if;
  v_room := least(p_limit, p_cap - (public.mailbox_capacity(p_mailbox_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then
    return;
  end if;
  -- Picked once, then claimed (00213): a materialized pick runs exactly once, so the claim is at most v_room rows.
  return query
  with picked as materialized (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.mailbox_id = p_mailbox_id and s2.state = 'planned' and s2.send_at <= p_at
        and s2.checked_at is not null
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by s2.send_at
      limit v_room
      for update of s2 skip locked)
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
    from picked
   where s.id = picked.id
  returning s.*;
end $$;
revoke all on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) to service_role;
comment on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) is
  'A connected mailbox''s due reach-out sends, claimed within its day (p_cap less what it has used), at most p_limit, under the mailbox''s lock (C7, 00422). Nothing for a mailbox that is not connected, or resting. Service role only.';

/* ------------------------------------------------------- 4. the run, written -- */

create or replace function public.reach_out_plan_run(p_run jsonb, p_sends jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid := (p_run->>'id')::uuid;
  v_tenant uuid := (p_run->>'tenant_id')::uuid;
  v_step uuid := (p_run->>'playbook_id')::uuid;
  v_root uuid := (p_run->'audience'->>'root_id')::uuid;
begin
  if p_run->'audience'->>'kind' is distinct from 'reach_out' then
    raise exception 'reach_out_plan_run: a run of a reach-out says so in its audience';
  end if;
  if not exists (select 1 from public.playbooks where id = v_step and tenant_id = v_tenant and kind = 'reach_out')
     or not exists (select 1 from public.playbooks where id = v_root and tenant_id = v_tenant and kind = 'reach_out') then
    raise exception 'reach_out_plan_run: step % or root % is no reach-out of workspace %', v_step, v_root, v_tenant;
  end if;
  begin
    insert into public.broadcasts (id, tenant_id, playbook_id, run_for, name, template_id, template_name,
                                   template_language, state, scheduled_for, recipient_count, audience)
    values (v_run, v_tenant, v_step, (p_run->>'run_for')::date, p_run->>'name', (p_run->>'template_id')::uuid,
            p_run->>'template_name', p_run->>'template_language', p_run->>'state',
            (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int, p_run->'audience');
  exception when unique_violation then
    return jsonb_build_object('exists', true);
  end;
  insert into public.reach_out_sends (id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, contact_id, mailbox_id,
                                      send_at, state, reason)
  select x.id, v_tenant, v_run, v_step, v_root, x.lead_id, x.contact_id, x.mailbox_id, x.send_at,
         coalesce(x.state, 'planned'), x.reason
    from jsonb_to_recordset(coalesce(p_sends, '[]'::jsonb))
         as x(id uuid, lead_id uuid, contact_id uuid, mailbox_id uuid, send_at timestamptz, state text, reason text)
   where exists (select 1 from public.leads l where l.id = x.lead_id and l.tenant_id = v_tenant)
     and (x.mailbox_id is null
          or exists (select 1 from public.mailbox_connections b where b.id = x.mailbox_id and b.tenant_id = v_tenant))
  on conflict (broadcast_id, lead_id) do nothing;
  return jsonb_build_object('id', v_run);
end $$;
comment on function public.reach_out_plan_run(jsonb, jsonb) is
  'A reach-out step''s run and its sends, written whole (core runReachOut): {id}, or {exists} when the step already has its run for the day. Each send names its mailbox (00422). Service role only.';

-- Each follower's mailbox: the one its chain's step before wrote to it from, so the nudge leaves from it, in the thread.
drop function if exists public.reach_out_followers(uuid, uuid, uuid, int, int);
create function public.reach_out_followers(
  p_tenant_id  uuid,
  p_step_id    uuid,
  p_parent_id  uuid,
  p_after_days int,
  p_limit      int
)
returns table (lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid,
               facts jsonb, bounced boolean, mailbox_id uuid, country text)
language sql
stable
security definer
set search_path = public
as $$
  select f.lead_id, f.contact_id, f.email, f.region, f.hours, f.parent_message_id, f.facts, f.bounced, f.mailbox_id,
         f.country
    from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             s.message_id as parent_message_id, s.sent_at, s.mailbox_id, l.country,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.reach_out_sends b join public.messages bm on bm.id = b.message_id
                      where b.root_id = s.root_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed')) as bounced
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.playbook_id = p_parent_id and s.state = 'sent'
         and s.sent_at <= now() - make_interval(days => p_after_days)
         and s.contact_id is not null
         and not exists (select 1 from public.reach_out_sends x
                          where x.playbook_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))
    ) f
   where f.facts->>'lead_stage' in ('ready', 'nurture')
     and not coalesce((f.facts->>'suppressed')::boolean, true)
     and not coalesce((f.facts->>'wrote_back')::boolean, true)
     and not coalesce((f.facts->>'away')::boolean, false)
     and not coalesce((f.facts->>'stopped')::boolean, false)
     and not f.bounced
   order by f.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;
comment on function public.reach_out_followers(uuid, uuid, uuid, int, int) is
  'A later reach-out step''s leads: those its step before wrote to p_after_days ago or more, whom the send door would still write to, with the mailbox the step before wrote from (00422) and the lead''s country. Service role only.';

/* ------------------------------------------------------ 5. the send door's ask -- */

create or replace function public.outreach_mailbox_facts(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_to         text,
  p_from       text,
  p_lead_id    uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.outreach_lead_facts(p_tenant_id, p_contact_id, p_to, p_lead_id) || jsonb_build_object(
    'mailbox', (
      select jsonb_build_object('id', b.id, 'address', b.address)
             || public.mailbox_capacity(b.id, now())
        from public.mailbox_connections b
       where b.tenant_id = p_tenant_id and b.address = lower(btrim(p_from)) and b.state <> 'removed'
       limit 1))
$$;
revoke all on function public.outreach_mailbox_facts(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_mailbox_facts(uuid, uuid, text, text, uuid) to service_role;
comment on function public.outreach_mailbox_facts(uuid, uuid, text, text, uuid) is
  'What the send door asks of a cold email (00422): outreach_lead_facts, and the workspace''s mailbox its From is (its id, address and mailbox_capacity now), or null when the From is none of them. Service role only.';

/* ---------------------------------------------------------- 6. a mailbox's health -- */

create or replace function public.mailbox_connection_counts(p_mailbox_id uuid, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at, s.tenant_id
      from public.reach_out_sends s
      join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
     where s.mailbox_id = p_mailbox_id
       and m.created_at >= now() - interval '90 days'
  ), recent as (
    select o.id, o.status, o.error, o.tenant_id from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
     order by o.created_at desc
     limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A permanent bounce only: a full mailbox or a greylisting server says nothing about the mailbox that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    -- A person counts once, however many of the window's emails their noes name; a no undone is no no.
    'unsubscribed', (
      select count(distinct e.subject_id) from recent r
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
              and u.data->>'message_id' = e.data->>'message_id'))))
$$;
revoke all on function public.mailbox_connection_counts(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mailbox_connection_counts(uuid, timestamptz) to service_role;
comment on function public.mailbox_connection_counts(uuid, timestamptz) is
  'What a connected mailbox''s reach-out emails came to since p_since (00422): sent (its last 500 that left), bounced (permanent bounces of them), complained, and unsubscribed (the people whose unsubscribe or reply no names one of them, a no undone excepted). The mailboxes clock judges its health by them (contracts mailboxHoldOf). Service role only.';

/* ------------------------------------------- 7. the doors that name a mailbox -- */

-- reach_out_save: the chain writes from mailbox_ids (its old domain_ids is emptied).
CREATE OR REPLACE FUNCTION public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
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
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00421).
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
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.playbooks
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.playbooks where id = v_root
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned and held sends
  -- skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its owner
  -- pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.reach_out_sends s where s.playbook_id = any (v_dropped) for update;
    if exists (select 1 from public.reach_out_sends s
                where s.playbook_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed')) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.broadcasts set state = 'canceled'
     where tenant_id = p_tenant_id and playbook_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.reach_out_sends set state = 'skipped', reason = 'step_removed'
     where playbook_id = any (v_dropped) and state in ('planned', 'held');
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.playbooks p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_playbook_id cascades).
    delete from public.playbooks where id = v_dropped[1];
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
      insert into public.playbooks (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_playbook_id,
                                    after_days, gap_minutes, mailbox_ids, signed_by, include_unconfirmed, template_id,
                                    template_name, template_language, hand, params, run_hour, cap_per_run, state,
                                    created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.playbooks where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.reach_out_sends s where s.playbook_id = v_id) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.playbooks
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.playbooks
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.playbooks set hand = v_hand where id = v_id and hand is distinct from v_hand;
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
      update public.playbooks
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes, domain_ids = '{}',
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.playbook_id = any (v_changed) and s.state in ('planned', 'held')),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

-- reach_out_search_lines: the next email's mailbox ('from'; 'host' its domain, as before).
CREATE OR REPLACE FUNCTION public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_root     public.playbooks%rowtype;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.playbooks p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and p.lead_search_id = p_search_id
   order by p.created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_midnight := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  return (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    with sends as (
      select s.id, s.lead_id, s.state, s.reason, s.send_at, s.checked_at, s.mailbox_id, s.message_id,
             case when s.state = 'sent' then s.sent_at
                  when s.state = 'failed' and public.email_left(m.status, m.error)
                    then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
             coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
             b.state in ('pending_approval', 'scheduled', 'sending') as live
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.root_id = v_root.id
    ),
    per as (
      select x.lead_id,
             count(*) filter (where x.left_at is not null) as sent,
             min(x.left_at) as first_sent_at,
             max(x.left_at) as last_sent_at,
             min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
             bool_or(x.state = 'held' and x.live) as held,
             bool_or(x.state = 'handed') as handed,
             bool_or(x.bounced and x.left_at is not null) as bounced,
             max(x.left_at) filter (where x.bounced) as bounced_at,
             max(x.left_at) as ord
        from sends x
       group by x.lead_id
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'written_to', (select count(*) from per where sent > 0),
      'today', (select count(*) from sends where left_at >= v_midnight),
      'next', (select jsonb_build_object('at', x.send_at, 'business', l.business_name, 'host', b.host, 'from', b.address)
                 from sends x
                 join public.leads l on l.id = x.lead_id
                 left join public.mailbox_connections b on b.id = x.mailbox_id
                where x.state = 'planned' and x.live and x.checked_at is not null
                order by x.send_at
                limit 1),
      'held', (select count(*) from sends where state = 'held' and live),
      'waiting_run_id', (select b.id from public.broadcasts b
                          where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                            and b.audience->>'root_id' = v_root.id::text and b.state = 'pending_approval'
                          order by b.created_at desc
                          limit 1),
      'leads', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'lead_id', p.lead_id,
                 'stage', l.stage,
                 'closed_reason', l.closed_reason,
                 'sent', p.sent,
                 'first_sent_at', p.first_sent_at,
                 'last_sent_at', p.last_sent_at,
                 'next_at', p.next_at,
                 'held', coalesce(p.held, false),
                 'handed', coalesce(p.handed, false),
                 'bounced', coalesce(p.bounced, false),
                 'bounced_at', p.bounced_at,
                 'email_state', l.email_state,
                 'reply', (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at,
                                                     'undone', r.undone_at is not null)
                             from public.reach_out_replies r
                            where r.tenant_id = p_tenant_id and r.lead_id = p.lead_id
                            order by r.read_at desc
                            limit 1),
                 'away_until', (select max(r.until_at) from public.reach_out_replies r
                                 where r.tenant_id = p_tenant_id and r.lead_id = p.lead_id and r.intent = 'away'
                                   and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null),
                 'resume_at', l.resume_at,
                 'booked_at', l.booked_at,
                 'stopped_at', l.reach_out_stopped_at))
          from (select * from per order by ord desc nulls first, lead_id limit 2000) p
          join public.leads l on l.id = p.lead_id and l.tenant_id = p_tenant_id), '[]'::jsonb)
    )
  );
end $$;

-- reach_out_lead_timeline: each email's mailbox ('from'; 'host' its domain, as before).
CREATE OR REPLACE FUNCTION public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_lead public.leads%rowtype;
  v_root uuid;
begin
  -- A partner's seat counts for the calling session only once it showed its second factor (0013, 00261).
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.root_id into v_root from public.reach_out_sends s
   where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
   order by s.created_at desc
   limit 1;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    'chain', (select jsonb_build_object('root_id', p.id, 'name', p.name, 'state', p.state)
                from public.playbooks p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.playbooks p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.reach_out_sends s join public.messages m on m.id = s.message_id
                         where s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent'
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.playbooks p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', b.host,
               'from', b.address,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.reach_out_sends x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.root_id = v_root
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.playbook_id
        left join public.playbooks p on p.id = s.playbook_id
        left join public.mailbox_connections b on b.id = s.mailbox_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.reach_out_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    'can_stop', v_root is not null and v_lead.reach_out_stopped_at is null
  );
end $$;

-- reach_out_report: mailboxes in place of domains; delivered is what left and did not fail.
CREATE OR REPLACE FUNCTION public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00404): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00404): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.mailbox_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop
       group by s.root_id, s.playbook_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.reach_out_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle) as businesses,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    mailboxes as (
      select x.mailbox_id, b.address, b.state, b.held_why, b.held_at, count(*) as sent,
             count(*) filter (where x.status in ('sent', 'delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.mailbox_connections b on b.id = x.mailbox_id and b.tenant_id = p_tenant_id
       group by x.mailbox_id, b.address, b.state, b.held_why, b.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('sent', 'delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00404).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('sent', 'delivered', 'read')),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.broadcasts b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.playbooks p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('sent', 'delivered', 'read')),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.playbooks p on p.id = c.id)) as body
              from public.playbooks r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      -- An edge or a page from before mailboxes reads `domains`: none now (decision 0056).
      'domains', '[]'::jsonb,
      'mailboxes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'address', d.address, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.address)
          from (select * from mailboxes order by sent desc, address limit 10) d), '[]'::jsonb))
  );
end $$;

/* ------------------------------------------------------- 8. the threads it reads -- */

-- The provider's thread of an email a reach-out wrote from a mailbox (Gmail's threadId, Graph's conversationId) is kept
-- on its message's meta.email.thread_id by the wire: the sync fetches only messages in these threads (decision 0056).
-- Its index is 00423's, built concurrently.

create or replace function public.mailbox_threads_known(p_tenant_id uuid, p_thread_ids text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.meta->'email'->>'thread_id'), '{}')
    from public.messages m
   where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
     and m.meta->'email'->>'thread_id' = any (coalesce(p_thread_ids, '{}'))
$$;
revoke all on function public.mailbox_threads_known(uuid, text[]) from public, anon, authenticated;
grant execute on function public.mailbox_threads_known(uuid, text[]) to service_role;
comment on function public.mailbox_threads_known(uuid, text[]) is
  'Of the provider thread ids a mailbox''s sync saw change, the ones a message this workspace sent is in (00422): only these are fetched. Service role only.';

/* --------------------------------------------------- 9. an email sent from a mailbox -- */

create or replace function public.stamp_email_from_mailbox(
  p_tenant_id      uuid,
  p_message_id     uuid,
  p_provider_id    text,
  p_rfc_message_id text,
  p_thread_id      text,
  p_mailbox_id     uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  -- What a mailbox kept of the email it sent, which no receipt brings later: the provider's id, the Message-ID it went
  -- under, its thread, and which mailbox (00128 stamp_email_sent's shape, for the mailbox's road).
  with stamped as (
    update public.messages m
       set external_id = coalesce(m.external_id, p_provider_id),
           meta = jsonb_set(
             coalesce(m.meta, '{}'::jsonb),
             '{email}',
             coalesce(m.meta->'email', '{}'::jsonb)
               || jsonb_strip_nulls(jsonb_build_object(
                    'message_id', p_rfc_message_id, 'thread_id', p_thread_id, 'mailbox_id', p_mailbox_id)))
     where m.id = p_message_id and m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
    returning 1
  ), sent as (
    update public.mailbox_connections b set sent_at = now()
     where b.id = p_mailbox_id and b.tenant_id = p_tenant_id and exists (select 1 from stamped)
    returning 1
  )
  select exists (select 1 from stamped)
$$;
revoke all on function public.stamp_email_from_mailbox(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.stamp_email_from_mailbox(uuid, uuid, text, text, text, uuid) to service_role;
comment on function public.stamp_email_from_mailbox(uuid, uuid, text, text, text, uuid) is
  'An email sent from a connected mailbox, stamped (00422): its provider id, the Message-ID it went under (meta.email.message_id, which a reply cites), its provider thread (meta.email.thread_id, which the sync reads by) and the mailbox (meta.email.mailbox_id); the mailbox''s last send. True when the row was there. Service role only.';
