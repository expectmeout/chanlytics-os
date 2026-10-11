-- 00398 · An idea for a search is written from what the workspace's searches found.
--
-- The ideas on Leads' first day, and on a phone's New search, were written from the business line alone (00142): four
-- kinds of business, kept a week, and pressing one put its words in Ask's field. They are now ready plans (Ruben, 10 Oct
-- 2026: "research and think further into History: kinds you already searched and how they went"), written from what this
-- workspace's searches found and what came of their leads, on a model purpose of their own (Sonnet 5.5). Four parts:
--
-- 1. ai_usage.purpose takes lead_suggest (contracts MODEL_PURPOSES): the ideas' own route, so their dollars are their own
--    in the ledger and not the small drafts'.
-- 2. lead_suggestions keeps what its ideas were written over (basis: the newest round's end, so a search that ends asks
--    for new ones), a claim (making_at: two reads at once never write them twice) and a failure (failed_at: a model that
--    would not answer is not asked again on every read). lead_suggestions_claim takes the claim; the service's alone.
-- 3. lead_suggest_history: what each search of the last 180 days asked for and found, and what came of the leads it
--    kept, in counts and the plan's own words, never a business's name, a person, a reply's words or a judgment's
--    reasons; and where the workspace is (its business record, its Google listing). The service's alone: the route has
--    checked the member may find (ROLE_PERMS.find) before it asks, so no session reaches it.
-- 4. lead_niche_priors is written at last. Nothing wrote it since 00140, so every plan said "New kind of search". A round
--    that ends adds what it judged to its kind's counts, by the plan's category_key (which a plan now keeps). A failure
--    there is swallowed: a count is never worth a round that cannot end.

/* ------------------------------------------------------- 1. the purpose -- */

-- contracts MODEL_PURPOSES, with the ideas for a search.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest'));

/* ---------------------------------------------- 2. the ideas, as kept -- */

alter table public.lead_suggestions
  add column if not exists basis     text check (char_length(basis) <= 80),
  add column if not exists making_at timestamptz,
  add column if not exists failed_at timestamptz;

comment on table public.lead_suggestions is
  'The ideas for a new search (§8.9), each a ready plan, written from the workspace''s business line and what its searches found (00398). One row per workspace; by_owner says the line is the owner''s own words. The service writes it; members read it.';
comment on column public.lead_suggestions.basis is
  'What the ideas were written over: the end of the workspace''s newest ended round when they were written, so a round that ends since asks for new ones (server/leads/lead-suggestions.ts). Null on ideas written before 00398, which are asked for again.';
comment on column public.lead_suggestions.making_at is
  'When a read claimed the writing of new ideas (lead_suggestions_claim); cleared when they are kept or fail. A claim older than two minutes is taken over.';
comment on column public.lead_suggestions.failed_at is
  'When the model last would not write them: the next reads say so for a few minutes rather than ask again.';

-- The claim on writing them: true when this read may write, false when another is writing them now. A workspace with no
-- row yet gets one, with the line the ideas will be written from and no ideas.
create or replace function public.lead_suggestions_claim(p_tenant_id uuid, p_line text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    text := left(btrim(coalesce(p_line, '')), 160);
  v_claimed boolean;
begin
  if char_length(v_line) < 3 then
    v_line := 'this business';
  end if;
  insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, made_at, making_at)
  values (p_tenant_id, v_line, false, '[]'::jsonb, now(), now())
  on conflict (tenant_id) do update set making_at = now()
   where k.making_at is null or k.making_at < now() - interval '2 minutes'
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;
comment on function public.lead_suggestions_claim(uuid, text) is
  'The service''s claim on writing a workspace''s ideas (00398): true when this read may write them, false while another read''s claim is under two minutes old. A workspace with no row gets one, with p_line and no ideas.';
revoke all on function public.lead_suggestions_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.lead_suggestions_claim(uuid, text) to service_role;

/* ----------------------------------------------- 3. what searches found -- */

create or replace function public.lead_suggest_history(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    -- The searches the finder ran (a list brought in is not a kind searched for), newest first.
    select s.id, s.plan, s.created_at, s.removed_at
      from public.lead_searches s
     where s.tenant_id = p_tenant_id
       and s.via in ('people', 'ask')
       and s.created_at > now() - interval '180 days'
     order by s.created_at desc
     limit 24
  ),
  r as (
    -- Each search's newest round: how it ended, and the areas beside it Claude named.
    select x.search_id, x.rounds, x.state, x.ending, x.ended_at, x.nearby
      from (
        select r.search_id, r.state, r.ending, r.ended_at, r.nearby,
               count(*) over (partition by r.search_id) as rounds,
               row_number() over (partition by r.search_id order by r.seq desc) as n
          from public.lead_rounds r
          join s on s.id = r.search_id
         where r.tenant_id = p_tenant_id
      ) x
     where x.n = 1
  ),
  m as (
    select m.search_id,
           count(*) filter (where m.class = 'qualified') as qualified,
           count(*) filter (where m.class = 'review') as review,
           count(*) filter (where m.class = 'excluded') as excluded
      from public.lead_search_members m
      join s on s.id = m.search_id
     where m.tenant_id = p_tenant_id
     group by m.search_id
  ),
  x as (
    -- Why places were left out, by the key that left them out: the kind, no way to reach them, the owner, or one of the
    -- plan's own exclusions and criteria (contracts class.ts).
    select y.search_id, jsonb_object_agg(y.excluded_by, y.n) as by_key
      from (
        select m.search_id, m.excluded_by, count(*) as n
          from public.lead_search_members m
          join s on s.id = m.search_id
         where m.tenant_id = p_tenant_id and m.class = 'excluded' and m.excluded_by is not null
         group by m.search_id, m.excluded_by
      ) y
     group by y.search_id
  ),
  kept as (
    select distinct m.search_id, m.lead_id
      from public.lead_search_members m
      join s on s.id = m.search_id
     where m.tenant_id = p_tenant_id and m.class <> 'excluded'
  ),
  l as (
    -- What came of the leads each search kept. A lead in two searches counts in each.
    select k.search_id,
           count(*) filter (where l.contacted_at is not null) as contacted,
           count(*) filter (where l.last_outcome = 'interested') as interested,
           count(*) filter (where l.booked_at is not null) as booked,
           count(*) filter (where l.stage = 'converted') as customers,
           count(*) filter (where l.closed_reason = 'said_no') as said_no,
           count(*) filter (where l.closed_reason = 'not_a_fit') as not_a_fit,
           count(*) filter (where l.closed_reason = 'stale') as stale,
           count(*) filter (where l.email is not null) as with_email,
           count(*) filter (where l.phone_e164 is not null) as with_phone
      from kept k
      join public.leads l on l.id = k.lead_id and l.tenant_id = p_tenant_id
     where l.erased_at is null
     group by k.search_id
  ),
  w as (
    -- Why a lead was not a fit, as the owner said it (lead.not_a_fit: chain, wrong_kind, too_far, customer, other).
    select y.search_id, jsonb_object_agg(y.why, y.n) as by_why
      from (
        select k.search_id, e.data->>'why' as why, count(distinct e.subject_id) as n
          from kept k
          join public.events e on e.subject_id = k.lead_id
         where e.tenant_id = p_tenant_id and e.kind = 'lead.not_a_fit' and e.data->>'why' is not null
         group by k.search_id, e.data->>'why'
      ) y
     group by y.search_id
  ),
  ro as (
    select k.search_id, count(distinct o.lead_id) as sent
      from kept k
      join public.reach_out_sends o on o.lead_id = k.lead_id and o.tenant_id = p_tenant_id
     where o.state = 'sent'
     group by k.search_id
  ),
  rr as (
    -- Replies a person wrote (not an out-of-office or a machine), by what they meant; an undone reading is not one.
    select k.search_id,
           count(distinct p.lead_id) as replied,
           count(distinct p.lead_id) filter (where p.intent = 'interested') as interested,
           count(distinct p.lead_id) filter (where p.intent in ('no', 'wrong_person')) as declined
      from kept k
      join public.reach_out_replies p on p.lead_id = k.lead_id and p.tenant_id = p_tenant_id
     where p.undone_at is null and p.claim = 'person'
     group by k.search_id
  ),
  d as (
    select k.search_id, count(*) as won, coalesce(sum(d.amount_cents), 0) as cents
      from kept k
      join public.deals d on d.lead_id = k.lead_id and d.tenant_id = p_tenant_id
     where d.stage = 'won'
     group by k.search_id
  )
  select jsonb_build_object(
    'basis', (select max(r2.ended_at) from public.lead_rounds r2 where r2.tenant_id = p_tenant_id and r2.state = 'ended'),
    'home', (select jsonb_build_object('city', b.city, 'region', b.region, 'zip', b.postal_code)
               from public.business_records b where b.tenant_id = p_tenant_id),
    'listing', (select jsonb_build_object('address', g.address, 'type', g.facts->>'primary_type')
                  from public.google_listings g
                 where g.tenant_id = p_tenant_id
                 order by g.linked_at desc
                 limit 1),
    'searches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', s.plan->>'category_key',
               'name', s.plan->>'name',
               'terms', coalesce(s.plan->'terms', '[]'::jsonb),
               'area', s.plan->'area',
               'count', s.plan->'count',
               'contact', s.plan->>'contact',
               'criteria', coalesce(s.plan->'criteria', '[]'::jsonb),
               'exclusions', coalesce(s.plan->'exclusions', '[]'::jsonb),
               'at', s.created_at,
               'removed', s.removed_at is not null,
               'rounds', coalesce(r.rounds, 0),
               'state', r.state,
               'ending', r.ending,
               'ended_at', r.ended_at,
               'nearby', coalesce(r.nearby, '[]'::jsonb),
               'found', jsonb_build_object('qualified', coalesce(m.qualified, 0), 'review', coalesce(m.review, 0),
                                           'excluded', coalesce(m.excluded, 0)),
               'left_out', coalesce(x.by_key, '{}'::jsonb),
               'leads', jsonb_build_object('contacted', coalesce(l.contacted, 0), 'interested', coalesce(l.interested, 0),
                                           'booked', coalesce(l.booked, 0), 'customers', coalesce(l.customers, 0),
                                           'said_no', coalesce(l.said_no, 0), 'not_a_fit', coalesce(l.not_a_fit, 0),
                                           'stale', coalesce(l.stale, 0), 'with_email', coalesce(l.with_email, 0),
                                           'with_phone', coalesce(l.with_phone, 0)),
               'not_a_fit_why', coalesce(w.by_why, '{}'::jsonb),
               'reach', jsonb_build_object('sent', coalesce(ro.sent, 0), 'replied', coalesce(rr.replied, 0),
                                           'interested', coalesce(rr.interested, 0), 'declined', coalesce(rr.declined, 0)),
               'won', jsonb_build_object('deals', coalesce(d.won, 0), 'cents', coalesce(d.cents, 0))
             ) order by s.created_at desc)
        from s
        left join r on r.search_id = s.id
        left join m on m.search_id = s.id
        left join x on x.search_id = s.id
        left join l on l.search_id = s.id
        left join w on w.search_id = s.id
        left join ro on ro.search_id = s.id
        left join rr on rr.search_id = s.id
        left join d on d.search_id = s.id
    ), '[]'::jsonb)
  );
$$;
comment on function public.lead_suggest_history(uuid) is
  'What a workspace''s finder searches of the last 180 days asked for and found, and what came of the leads each kept (contacted, interested, booked, customers, said no, not a fit and why, reach-out sent and replied, deals won), with where the workspace is: the ideas for a new search are written from it (00398). Counts and the plan''s own words only; never a business''s name, a person, a reply''s words or a judgment''s reasons. The service''s alone: the route checks the member may find.';
revoke all on function public.lead_suggest_history(uuid) from public, anon, authenticated;
grant execute on function public.lead_suggest_history(uuid) to service_role;

/* ------------------------------------------- 4. a kind's counts, kept -- */

create or replace function public.lead_round_adds_to_its_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind    text;
  v_places  integer;
  v_matched integer;
  v_email   integer;
begin
  begin
    v_kind := coalesce(new.plan->>'category_key',
                       (select s.plan->>'category_key' from public.lead_searches s where s.id = new.search_id));
    if v_kind is null or v_kind !~ '^[a-z][a-z0-9_]{1,39}$' then
      return null;
    end if;
    -- What the round judged: every place but one the owner took out afterwards, how many qualified, and how many of
    -- those have an email (leadReachLine reads with_email over matched).
    select count(*) filter (where m.excluded_by is distinct from 'owner'),
           count(*) filter (where m.class = 'qualified'),
           count(*) filter (where m.class = 'qualified' and l.email is not null)
      into v_places, v_matched, v_email
      from public.lead_search_members m
      left join public.leads l on l.id = m.lead_id
     where m.round_id = new.id;
    if coalesce(v_places, 0) = 0 then
      return null;
    end if;
    insert into public.lead_niche_priors as n (category_key, places, matched, with_email, updated_at)
    values (v_kind, v_places, v_matched, v_email, now())
    on conflict (category_key) do update
       set places     = n.places + excluded.places,
           matched    = n.matched + excluded.matched,
           with_email = n.with_email + excluded.with_email,
           updated_at = now();
  exception when others then
    -- A count is never worth a round that cannot end.
    return null;
  end;
  return null;
end;
$$;
comment on function public.lead_round_adds_to_its_kind() is
  'A round that ends adds what it judged to its kind''s platform-wide counts (lead_niche_priors), by its plan''s category_key (00398). Aggregates only. Never raises.';
revoke all on function public.lead_round_adds_to_its_kind() from public, anon, authenticated;

drop trigger if exists lead_round_adds_to_its_kind on public.lead_rounds;
create trigger lead_round_adds_to_its_kind
  after update of state on public.lead_rounds
  for each row
  when (new.state = 'ended' and old.state is distinct from 'ended')
  execute function public.lead_round_adds_to_its_kind();
