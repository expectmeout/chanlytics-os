-- 00190 · A send is checked before it goes.
--
-- Reach out, Part 4 (docs/superpowers/plans/2026-09-26-reach-out-part-4-the-words-and-pages.md, PRs 2 and 3, with the
-- review round's R1–R11). The database side of the check; the edge's check clock (apps/edge/api/cron/reach-out-check.ts)
-- does the work.
--
--   reach_out_sends      gains its check: the opening written for its business, its angle, the facts it leaned on,
--                        when it was checked, the words it was checked against (a hash, checked_words) and their version
--                        (check_gen, bumped by every reset), the tries a model failed (check_tries, first at
--                        check_first_at, tried again from check_after), the lease a tick holds on it
--                        (check_started_at), a hold's detail, and the holds its owner included it past (included_for).
--                        A held send is `held`, with its reason: it waits for its owner, and the claim never takes it.
--                        The guard refuses the claim of a send not checked.
--   the claim's reads    the claim and its due domains take a checked send only (R8).
--   the clock's reads    a held send keeps its run open (finish) and closes with its canceled run (close); one held
--                        fourteen days from when it was planned wakes the clock, which gives it up (R10).
--   playbooks            a chain's root gains signed_by ({{your name}}, F8) and include_unconfirmed (F9). A search has one
--                        chain (F10).
--   reach_out_audience   takes an included catch-all address, and never a lead any chain of the workspace planned, held
--                        or wrote to (F10). The four-argument form stays, as a wrapper, for an edge deployed before this
--                        one (R9); a later migration drops it.
--   reach_out_record     one business's record, with the check's two code facts (F4, F6).
--   reach_out_unchecked  the sends to check, leased (R3), a few per workspace at a time (R2), each with its record.
--   reach_out_held_stale the holds past a moment, by when they were planned (R10).
--   reach_out_check_spend  the model's spend per workspace and UTC day, taken one attempt at a time before each check
--                        that asks the model (reach_out_check_take, R12): a reset clears a send's check, never its spend.
--   reach_out_release_unavailable  the check_unavailable holds left an hour, back to be checked, in one statement (R4).
--   the check's clock    reach-out-check-sweep, every minute, its own clock and its own watch (R1).

set local lock_timeout = '3s';

/* ------------------------------------------------------------ the send's check -- */

alter table public.reach_out_sends
  add column if not exists opening text,
  add column if not exists angle text,
  add column if not exists facts_used text[] not null default '{}',
  add column if not exists checked_at timestamptz,
  add column if not exists check_tries int not null default 0,
  add column if not exists hold_detail text,
  add column if not exists check_after timestamptz,
  add column if not exists check_started_at timestamptz,
  add column if not exists check_first_at timestamptz,
  add column if not exists check_gen int not null default 0,
  add column if not exists checked_words text,
  add column if not exists included_for text[] not null default '{}';

alter table public.reach_out_sends drop constraint if exists reach_out_sends_state_check;
alter table public.reach_out_sends add constraint reach_out_sends_state_check
  check (state in ('planned', 'held', 'claimed', 'queued', 'sent', 'skipped', 'failed'));

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
                            'check_unavailable']::text[]);

-- A held send says why: its reason is one of the check's (contracts REACH_OUT_HOLDS), read by the approval sheet.
alter table public.reach_out_sends drop constraint if exists reach_out_sends_held_says_why;
alter table public.reach_out_sends add constraint reach_out_sends_held_says_why
  check (state <> 'held' or reason in ('customer_domain', 'chain', 'language', 'unbacked_fact', 'reads_like_spam',
                                        'check_unavailable'));

create index if not exists reach_out_sends_unchecked on public.reach_out_sends (tenant_id, check_after)
  where state = 'planned' and checked_at is null;
create index if not exists reach_out_sends_held on public.reach_out_sends (created_at) where state = 'held';

-- 00183's moves, and two more: the check holds a planned send, and its owner answers a held one (include puts it back,
-- skip ends it). Nothing leaves unchecked: a claim takes a checked send only.
create or replace function public.reach_out_sends_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if not (
      (OLD.state = 'planned' and NEW.state in ('claimed', 'skipped', 'held')) or
      (OLD.state = 'held' and NEW.state in ('planned', 'skipped')) or
      (OLD.state = 'claimed' and NEW.state in ('queued', 'planned', 'skipped', 'failed')) or
      (OLD.state = 'queued' and NEW.state in ('sent', 'planned', 'skipped', 'failed'))
    ) then
      raise exception 'reach_out_sends.state moves % -> % refused', OLD.state, NEW.state;
    end if;
    if NEW.state = 'claimed' and NEW.checked_at is null then
      raise exception 'reach_out_sends: a send is claimed only once it is checked';
    end if;
  end if;
  return NEW;
end $$;

/* ------------------------------------------------------------ the chain's root -- */

alter table public.playbooks
  add column if not exists signed_by text,
  add column if not exists include_unconfirmed boolean not null default false;

-- Both are a root's: its steps and every moment carry neither.
alter table public.playbooks drop constraint if exists playbooks_root_settings;
alter table public.playbooks add constraint playbooks_root_settings check (
  (signed_by is null or char_length(btrim(signed_by)) between 1 and 60)
  and ((kind = 'reach_out' and trigger = 'lead_first') or (signed_by is null and not include_unconfirmed)));

-- One chain per search (F10): the Leads door opens the search's chain when there is one.
create unique index if not exists playbooks_one_chain_per_search on public.playbooks (lead_search_id)
  where lead_search_id is not null;

/* ------------------------------------------------------------ the claim -- */

-- 00184's claim, taking a checked send only.
create or replace function public.reach_out_claim(p_domain_id uuid, p_cap int, p_at timestamptz, p_limit int)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  -- No share, no limit, no moment: nothing is claimed (least() would read a null cap as none at all).
  if p_domain_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per domain at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim:' || p_domain_id::text));
  if not exists (select 1 from public.sending_domains where id = p_domain_id and state = 'verified') then return; end if;
  v_room := least(p_limit, p_cap - (public.sending_domain_capacity(p_domain_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then return; end if;
  return query
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
   where s.id in (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.domain_id = p_domain_id and s2.state = 'planned' and s2.send_at <= p_at
        -- Checked before it goes (F1): the check clock reads what the send says first.
        and s2.checked_at is not null
        -- The step running, and its chain: a paused root pauses every step of it.
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by s2.send_at
      limit v_room
      for update of s2 skip locked)
  returning s.*;
end $$;
revoke execute on function public.reach_out_claim(uuid, int, timestamptz, int) from public, anon, authenticated;
grant execute on function public.reach_out_claim(uuid, int, timestamptz, int) to service_role;

-- 00187's due domains, over checked sends only (R8): a domain whose due sends all wait for the check never takes a
-- place in the page, and the cold lane's "a send is due" (api/cron/reach-out.ts) counts only what could leave.
create or replace function public.reach_out_due_domains(
  p_at timestamptz,
  p_limit int,
  p_tenant_id uuid default null,
  p_skip_tenants uuid[] default '{}',
  p_skip_domains uuid[] default '{}'
)
returns table (id uuid, tenant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.tenant_id
    from public.sending_domains d
    -- Its earliest due send that goes ahead: the domain's due sends in time order (reach_out_sends_due), the first
    -- that passes, so a paused chain's backlog is walked only as far as the first that does.
    cross join lateral (
      select s.send_at as first_due
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        join public.playbooks p on p.id = s.playbook_id
        join public.playbooks r on r.id = s.root_id
       where s.domain_id = d.id and s.state = 'planned' and s.send_at <= p_at and s.checked_at is not null
         and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       order by s.send_at
       limit 1) due
   where d.state = 'verified' and d.clean_since is not null
     and (p_tenant_id is null or d.tenant_id = p_tenant_id)
     and not (d.tenant_id = any (coalesce(p_skip_tenants, '{}')))
     and not (d.id = any (coalesce(p_skip_domains, '{}')))
   order by due.first_due, d.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[]) to service_role;
comment on function public.reach_out_due_domains(timestamptz, int, uuid, uuid[], uuid[]) is
  'The verified, clean domains with a checked reach-out send due in a run that goes ahead on a running chain, longest waiting first, past the workspaces and domains the caller has done with this tick (00187, 00190). Service role only.';

/* ------------------------------------------------------------ the clock's reads -- */

-- 00186's finish: a held send is open too, so a run with one waits for its owner's answer, or its give-up.
create or replace function public.reach_out_finishable(p_limit int, p_tenant_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from public.broadcasts b
   where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not exists (select 1 from public.reach_out_sends s
                      where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed', 'queued'))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_finishable(int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_finishable(int, uuid) to service_role;

-- 00186's close: a canceled run's held sends close with its planned ones.
create or replace function public.reach_out_closed_sends(p_stuck_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (send jsonb, email_status text)
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s), m.status
    from public.reach_out_sends s
    join public.broadcasts b on b.id = s.broadcast_id
    left join public.messages m on m.id = s.message_id
   where b.state in ('canceled', 'failed') and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (s.state in ('planned', 'held', 'queued') or (s.state = 'claimed' and s.claimed_at < p_stuck_before))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_closed_sends(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_closed_sends(timestamptz, int, uuid) to service_role;

-- The holds left past a moment, oldest planned first: fourteen days from when a send was planned is the one clock a
-- send gives up by (R10, replan.ts REPLAN_GIVE_UP_MS), held or not.
create or replace function public.reach_out_held_stale(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns setof public.reach_out_sends
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.reach_out_sends s
   where s.state = 'held' and s.created_at < p_before and (p_tenant_id is null or s.tenant_id = p_tenant_id)
   order by s.created_at
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_held_stale(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_held_stale(timestamptz, int, uuid) to service_role;

-- 00186's due check: a due send is a checked one (R8), a canceled run's held sends close with it, a run with a held
-- send is not finished, and a hold left fourteen days from its planning is the clock's to give up.
create or replace function public.trigger_reach_out_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.send_at <= now() and s.checked_at is not null
          and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running')
     or exists (select 1 from public.reach_out_sends where state in ('claimed', 'queued'))
     or exists (select 1 from public.reach_out_sends where state = 'held' and created_at < now() - interval '14 days')
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('canceled', 'failed')
          and exists (select 1 from public.reach_out_sends s
                       where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed')))
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
          and not exists (select 1 from public.reach_out_sends s
                           where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed', 'queued'))) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_reach_out_sweep() from public, anon, authenticated;
comment on function public.trigger_reach_out_sweep() is
  'The reach-out clock (Reach out, Parts 3 and 4). Calls the edge only when a checked send is due in a run that goes ahead, one is claimed or queued, a hold is two weeks old, a closed run keeps open sends, or a run is ready to finish; otherwise records that it looked.';

/* ------------------------------------------------------------ the record -- */

-- A lead's name and own site as the chain rule compares them (F4): letters and digits only, and a site without its
-- www. Read by the indexes below and by the service role's record: leads are written by definer doors and the service
-- role only (00140), so no session evaluates them.
create or replace function public.lead_name_key(p_name text)
returns text
language sql
immutable
set search_path = public
as $$ select nullif(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')), '') $$;

create or replace function public.lead_site_key(p_host text)
returns text
language sql
immutable
set search_path = public
as $$ select nullif(regexp_replace(lower(btrim(coalesce(p_host, ''))), '^www\.', ''), '') $$;

revoke execute on function public.lead_name_key(text) from public, anon, authenticated;
revoke execute on function public.lead_site_key(text) from public, anon, authenticated;
grant execute on function public.lead_name_key(text) to service_role;
grant execute on function public.lead_site_key(text) to service_role;

create index if not exists leads_site_key on public.leads (tenant_id, public.lead_site_key(website_host))
  where erased_at is null and blanked_at is null;
create index if not exists leads_name_key on public.leads (tenant_id, public.lead_name_key(business_name))
  where erased_at is null and blanked_at is null;
create index if not exists contacts_email_domain on public.contacts (tenant_id, (split_part(email, '@', 2)))
  where email is not null and erased_at is null;

-- One business's record for a search, whether or not a send exists for it yet: what the writer and the reader are
-- given (the listing, the finder's reason, what the owner asked the finder for), and the check's two code facts: how
-- many of the workspace's leads share its website and its name (a chain, F4), and whether a person in People other
-- than the lead's own writes from its address's domain (F6). The check (reach_out_unchecked) and the sheet's preview
-- both read it here.
create or replace function public.reach_out_record(p_tenant_id uuid, p_search_id uuid, p_lead_id uuid)
returns table (
  business_name text, category text, city text, region text, rating numeric, reviews int, website_host text,
  hours jsonb, about text, email text, why_it_fits text, what_you_asked text,
  site_listings int, name_listings int, email_domain_shared boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.business_name, l.category, l.city, l.region, l.rating, l.reviews, l.website_host, l.hours, l.about,
         lower(btrim(l.email)), sm.reason, q.asked,
         (select count(*)::int from public.leads o
           where o.tenant_id = l.tenant_id and o.erased_at is null and o.blanked_at is null
             and public.lead_site_key(o.website_host) = public.lead_site_key(l.website_host)),
         (select count(*)::int from public.leads o
           where o.tenant_id = l.tenant_id and o.erased_at is null and o.blanked_at is null
             and public.lead_name_key(o.business_name) = public.lead_name_key(l.business_name)),
         -- The lead's own person (made by its first send, 00184 reach_out_person) is not another: its address is the
         -- lead's, and a chain's later step writes to it.
         split_part(lower(btrim(coalesce(l.email, ''))), '@', 2) <> '' and exists (
           select 1 from public.contacts c
            where c.tenant_id = l.tenant_id and c.email is not null and c.erased_at is null
              and c.id is distinct from l.contact_id and c.email <> lower(btrim(l.email))
              and split_part(c.email, '@', 2) = split_part(lower(btrim(l.email)), '@', 2))
    from public.leads l
    left join public.lead_search_members sm
      on sm.tenant_id = l.tenant_id and sm.search_id = p_search_id and sm.lead_id = l.id
    left join public.lead_searches q on q.id = p_search_id and q.tenant_id = l.tenant_id
   where l.tenant_id = p_tenant_id and l.id = p_lead_id
$$;
revoke execute on function public.reach_out_record(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_record(uuid, uuid, uuid) to service_role;

/* ------------------------------------------------------------ the sends to check -- */

-- The sends the check clock takes this tick, leased (R3): planned, not yet checked, in a live run of a running chain,
-- not waiting out a failed try (check_after), not started by another tick in the last two minutes, and either waiting
-- for their owner's approval or due within p_ahead_minutes (R2). At most p_per_workspace of each workspace, taken
-- round-robin, the longest waiting first, so one workspace's run never keeps another's out. Each is stamped
-- check_started_at under its row lock and comes back with its step's words and language, the name its chain signs
-- with, the holds its owner included it (or its lead in this chain) past (R7), and its business's record.
create or replace function public.reach_out_unchecked(
  p_limit int,
  p_per_workspace int,
  p_ahead_minutes int,
  p_tenant_id uuid default null
)
returns table (
  send jsonb, check_gen int, template_id uuid, template_language text, signed_by text, included_for text[],
  business_name text, category text, city text, region text, rating numeric, reviews int, website_host text,
  hours jsonb, about text, email text, why_it_fits text, what_you_asked text,
  site_listings int, name_listings int, email_domain_shared boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if coalesce(p_limit, 0) <= 0 or coalesce(p_per_workspace, 0) <= 0 then
    return;
  end if;
  with candidates as (
    select s.id,
           row_number() over (partition by s.tenant_id
                              order by coalesce(s.check_after, s.created_at), s.send_at, s.id) as turn,
           coalesce(s.check_after, s.created_at) as waiting_since
      from public.reach_out_sends s
      join public.broadcasts b on b.id = s.broadcast_id
      join public.playbooks p on p.id = s.playbook_id
      join public.playbooks r on r.id = s.root_id
     where s.state = 'planned' and s.checked_at is null
       and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       and (s.check_after is null or s.check_after <= now())
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
       and (b.state = 'pending_approval'
            or s.send_at <= now() + make_interval(mins => greatest(coalesce(p_ahead_minutes, 0), 0)))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  ), picked as (
    select c.id from candidates c
     where c.turn <= p_per_workspace
     order by c.turn, c.waiting_since, c.id
     limit p_limit
  ), locked as (
    select s.id from public.reach_out_sends s
     where s.id in (select id from picked)
     for update of s skip locked
  ), leased as (
    update public.reach_out_sends s
       set check_started_at = now()
      from locked
     where s.id = locked.id and s.state = 'planned' and s.checked_at is null
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from leased;

  return query
  select to_jsonb(s), s.check_gen, p.template_id, p.template_language, r.signed_by,
         array(select distinct x
                 from public.reach_out_sends o, unnest(o.included_for) as x
                where o.tenant_id = s.tenant_id and o.root_id = s.root_id and o.lead_id = s.lead_id
                order by x),
         rec.business_name, rec.category, rec.city, rec.region, rec.rating, rec.reviews, rec.website_host,
         rec.hours, rec.about, rec.email, rec.why_it_fits, rec.what_you_asked,
         rec.site_listings, rec.name_listings, rec.email_domain_shared
    from public.reach_out_sends s
    join public.playbooks p on p.id = s.playbook_id
    join public.playbooks r on r.id = s.root_id
    cross join lateral public.reach_out_record(s.tenant_id, r.lead_search_id, s.lead_id) rec
   where s.id = any (v_ids)
   order by s.send_at, s.id;
end $$;
revoke execute on function public.reach_out_unchecked(int, int, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_unchecked(int, int, int, uuid) to service_role;
comment on function public.reach_out_unchecked(int, int, int, uuid) is
  'The sends the check clock takes this tick (Reach out, Part 4), leased under their row locks, round-robin by workspace, each with its words'' step, the name its chain signs with, the holds its owner included it past and its business''s record (00190). Service role only.';

/* ------------------------------------------------------------ the check's spend -- */

-- What the check spent on the model, per workspace and UTC day: one attempt for each send's check that asks it, a
-- rewrite included, a failure counted. Kept apart from the sends, so no reset of a send's check (a word changed, a
-- hold put back) gives the day's spend back. Service role only: no member reads it.
create table if not exists public.reach_out_check_spend (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  day       date not null,
  attempts  int not null default 0 check (attempts >= 0),
  primary key (tenant_id, day)
);
alter table public.reach_out_check_spend enable row level security;
revoke all on public.reach_out_check_spend from anon, authenticated;
grant all on public.reach_out_check_spend to service_role;
comment on table public.reach_out_check_spend is
  'Reach out, Part 4: the check''s model attempts per workspace and UTC day, under contracts REACH_OUT_CHECKS_PER_DAY. Written by reach_out_check_take only.';

-- One attempt, taken atomically if the workspace's UTC day is under p_cap: true when taken, false at the cap.
create or replace function public.reach_out_check_take(p_tenant_id uuid, p_cap int, p_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taken boolean;
begin
  if p_tenant_id is null or coalesce(p_cap, 0) <= 0 then
    return false;
  end if;
  insert into public.reach_out_check_spend as x (tenant_id, day, attempts)
  values (p_tenant_id, (coalesce(p_at, now()) at time zone 'UTC')::date, 1)
  on conflict (tenant_id, day) do update set attempts = x.attempts + 1 where x.attempts < p_cap
  returning true into v_taken;
  return coalesce(v_taken, false);
end $$;
revoke execute on function public.reach_out_check_take(uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_check_take(uuid, int, timestamptz) to service_role;

-- The check_unavailable holds with no rule broken, held before p_before: put back to be checked, at the words' next
-- version, in one statement (R4). A hold for a rule an opening broke (a detail) is its owner's, and keeps. What the
-- owner included the send past stays. The count comes back.
create or replace function public.reach_out_release_unavailable(p_before timestamptz, p_tenant_id uuid default null)
returns int
language sql
volatile
security definer
set search_path = public
as $$
  with released as (
    update public.reach_out_sends s
       set state = 'planned', reason = null, checked_at = null, check_gen = s.check_gen + 1, checked_words = null,
           check_tries = 0, check_first_at = null, check_after = null, check_started_at = null,
           opening = null, angle = null, facts_used = '{}', hold_detail = null
     where s.state = 'held' and s.reason = 'check_unavailable' and s.hold_detail is null
       and s.updated_at < p_before and (p_tenant_id is null or s.tenant_id = p_tenant_id)
    returning 1
  )
  select count(*)::int from released
$$;
revoke execute on function public.reach_out_release_unavailable(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_release_unavailable(timestamptz, uuid) to service_role;

/* ------------------------------------------------------------ the audience -- */

-- 00184's audience, with two changes. It takes a catch-all address when asked to (the chain's include_unconfirmed, F9).
-- And it never takes a lead any chain of the workspace has planned, held or written to (F10), bar one in a run its
-- owner skipped. With that rule the chain plays no part, so the audience no longer takes it: the preview and the
-- sheet's count ask it with no chain yet.
create or replace function public.reach_out_audience(
  p_tenant_id uuid,
  p_search_id uuid,
  p_limit int,
  p_include_unconfirmed boolean default false
)
returns table (lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from public.lead_search_members sm
    join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
    join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
   where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
     and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
     and l.stage = 'ready' and l.closed_reason is null and l.erased_at is null and l.blanked_at is null
     -- A checked address; a catch-all one (unconfirmed) only when the chain's owner includes them.
     and (l.email_state = 'ok' or (l.email_state = 'catch_all' and coalesce(p_include_unconfirmed, false)))
     and nullif(btrim(l.email), '') is not null
     -- Never a customer's: nobody in People shares the address (as theirs now, or as one they wrote from) or the number,
     -- and the finder saw no share.
     and coalesce(jsonb_array_length(sm.judgment->'shares'), 0) = 0
     and not exists (select 1 from public.contacts c where c.tenant_id = l.tenant_id and c.erased_at is null
                       and (c.email = lower(btrim(l.email)) or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
     and not exists (select 1 from public.contact_identities i
                       join public.contacts c on c.id = i.contact_id and c.erased_at is null
                      where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email)))
     -- Never the never-again list: the address (an opt-out, a customer, an erasure), and the place or the number
     -- (a customer's or an erased person's, 00140: a number carries no opt-out of its own), so a business erased or
     -- already a customer is not found again under a new address.
     and not exists (select 1 from public.lead_suppressions x where x.tenant_id = l.tenant_id and (
                       (x.kind = 'email' and x.hash = public.lead_suppression_hash(l.tenant_id, lower(btrim(l.email))))
                    or (x.kind = 'place' and l.place_id is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                    or (x.kind = 'phone' and l.phone_e164 is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
     -- Never twice by the workspace: no chain of it has a send for this lead, bar one in a run its owner skipped.
     and not exists (select 1 from public.reach_out_sends ro
                      where ro.tenant_id = l.tenant_id and ro.lead_id = l.id
                        and not (ro.state = 'skipped' and ro.reason = 'run_canceled'))
   -- The finder's fit, strongest first (the text sorts long, look, strong), then the longest found.
   order by case sm.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_audience(uuid, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, int, boolean) to service_role;

-- 00184's four arguments, for an edge deployed before this migration's (R9: either deploy order): the new audience,
-- confirmed addresses only. A later migration drops it once every edge asks the new one.
create or replace function public.reach_out_audience(p_tenant_id uuid, p_search_id uuid, p_root_id uuid, p_limit int)
returns table (lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select a.lead_id, a.email, a.business_name, a.city, a.region, a.hours
    from public.reach_out_audience(p_tenant_id, p_search_id, p_limit, false) a
$$;
revoke execute on function public.reach_out_audience(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, uuid, int) to service_role;

/* ------------------------------------------------------------ the check's clock -- */

-- Its own clock (R1), every minute, calling the edge only when there is a send to check (leaseable now, within the
-- horizon the check reads) or a check_unavailable hold with no rule broken, left an hour (put back to be checked
-- again). Otherwise it records that it looked, so a quiet clock is still a watched one (00107).
create or replace function public.trigger_reach_out_check_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.checked_at is null
          and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
          and (s.check_after is null or s.check_after <= now())
          and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
          and (b.state = 'pending_approval' or s.send_at <= now() + interval '2 hours'))
     or exists (select 1 from public.reach_out_sends
                 where state = 'held' and reason = 'check_unavailable' and hold_detail is null
                   and updated_at < now() - interval '1 hour') then
    return public.request_sweep('reach_out_check', '/api/cron/reach-out-check', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out_check', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_reach_out_check_sweep() from public, anon, authenticated;
comment on function public.trigger_reach_out_check_sweep() is
  'The reach-out check clock (Reach out, Part 4). Calls the edge only when a send waits to be checked within the horizon, or a check_unavailable hold is an hour old; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every minute, recording itself each time: five minutes is five missed ticks.
  ('reach_out_check', 'reach-out-check-sweep', interval '5 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('reach-out-check-sweep')
 where exists (select 1 from cron.job where jobname = 'reach-out-check-sweep');
select cron.schedule('reach-out-check-sweep', '* * * * *', $$select public.trigger_reach_out_check_sweep()$$);
