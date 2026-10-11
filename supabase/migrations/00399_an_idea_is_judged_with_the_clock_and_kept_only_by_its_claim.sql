-- 00399 · An idea is judged with the clock, and kept only by its claim.
--
-- After 00398's ideas were read against a real workspace (11 Oct 2026), four things were wrong with what they were
-- given and how they were kept:
--
-- 1. Silence was judged with no clock: a kind emailed yesterday with no reply yet read as one that did not work.
--    lead_suggest_history now says when a search's leads were last emailed (reach.last_sent_at) and last contacted
--    (leads.last_contacted_at), and whether the search was started from an idea (from_idea: the plan's `from`), the
--    ideas' own measure of whether they are followed.
-- 2. A write that took its time could land over the owner's own line: the owner saved a new business line while a read
--    was writing ideas from the old one, and the write's save put the old line back. lead_suggestions_claim now answers
--    the claim's own moment, and lead_suggestions_keep and lead_suggestions_fail write only while that claim stands:
--    a line saved meanwhile clears the claim, and the late write is dropped (the next read writes again).
-- 3. An idea offered and not started was offered again on every refresh. lead_suggestions.passed keeps what was
--    offered before and not started, with how many times.
-- 4. (contracts) A kind's key was not one key: "plumbers" one day and "plumber" the next were two rows of
--    lead_niche_priors. Plans now keep the key one way (leadKindKey); the rows written in between are few and stay.
--
-- The claim's return type changes, so the function is dropped and made again: the dashboard that calls it deploys
-- after this, and nothing else calls it.

/* ---------------------------------------------- 2. the claim, and keeping by it -- */

alter table public.lead_suggestions
  add column if not exists passed jsonb not null default '[]'::jsonb;
comment on column public.lead_suggestions.passed is
  'Ideas offered before and not started since, as [{key, place, label, times}] (contracts ideaPassed, 00399): offered twice and not started is a no, and not offered again.';

drop function if exists public.lead_suggestions_claim(uuid, text);
create or replace function public.lead_suggestions_claim(p_tenant_id uuid, p_line text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    text := left(btrim(coalesce(p_line, '')), 160);
  v_claimed timestamptz;
begin
  if char_length(v_line) < 3 then
    v_line := 'this business';
  end if;
  insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, made_at, making_at)
  values (p_tenant_id, v_line, false, '[]'::jsonb, now(), clock_timestamp())
  on conflict (tenant_id) do update set making_at = clock_timestamp()
   where k.making_at is null or k.making_at < now() - interval '2 minutes'
  returning k.making_at into v_claimed;
  return v_claimed;
end;
$$;
comment on function public.lead_suggestions_claim(uuid, text) is
  'The service''s claim on writing a workspace''s ideas (00398, 00399): the claim''s own moment when this read may write them, null while another read''s claim is under two minutes old. A workspace with no row gets one, with p_line and no ideas. lead_suggestions_keep and lead_suggestions_fail take the moment back.';
revoke all on function public.lead_suggestions_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.lead_suggestions_claim(uuid, text) to service_role;

create or replace function public.lead_suggestions_keep(
  p_tenant_id uuid,
  p_claim timestamptz,
  p_business_line text,
  p_by_owner boolean,
  p_items jsonb,
  p_basis text,
  p_passed jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kept boolean;
begin
  update public.lead_suggestions k
     set business_line = left(btrim(coalesce(p_business_line, '')), 160),
         by_owner      = coalesce(p_by_owner, false),
         items         = coalesce(p_items, '[]'::jsonb),
         basis         = left(p_basis, 80),
         passed        = coalesce(p_passed, '[]'::jsonb),
         made_at       = now(),
         making_at     = null,
         failed_at     = null
   where k.tenant_id = p_tenant_id
     and k.making_at = p_claim
     and char_length(btrim(coalesce(p_business_line, ''))) >= 3
  returning true into v_kept;
  return coalesce(v_kept, false);
end;
$$;
comment on function public.lead_suggestions_keep(uuid, timestamptz, text, boolean, jsonb, text, jsonb) is
  'Keeps a workspace''s ideas while the claim they were written under still stands (00399): true when kept, false when the claim was let go meanwhile (the owner saved a line, or a slower write was taken over), in which case nothing is written and the next read writes again.';
revoke all on function public.lead_suggestions_keep(uuid, timestamptz, text, boolean, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_suggestions_keep(uuid, timestamptz, text, boolean, jsonb, text, jsonb) to service_role;

create or replace function public.lead_suggestions_fail(p_tenant_id uuid, p_claim timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lead_suggestions k
     set failed_at = now(), making_at = null
   where k.tenant_id = p_tenant_id and k.making_at = p_claim;
$$;
comment on function public.lead_suggestions_fail(uuid, timestamptz) is
  'The model would not write a workspace''s ideas under this claim (00399): the claim let go and the failure kept, so the next reads say so for a while rather than ask again. A claim since taken over is left alone.';
revoke all on function public.lead_suggestions_fail(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.lead_suggestions_fail(uuid, timestamptz) to service_role;

/* ------------------------------------------------- 1. what searches found, with the clock -- */

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
    -- What came of the leads each search kept, and when one was last contacted. A lead in two searches counts in each.
    select k.search_id,
           count(*) filter (where l.contacted_at is not null) as contacted,
           count(*) filter (where l.last_outcome = 'interested') as interested,
           count(*) filter (where l.booked_at is not null) as booked,
           count(*) filter (where l.stage = 'converted') as customers,
           count(*) filter (where l.closed_reason = 'said_no') as said_no,
           count(*) filter (where l.closed_reason = 'not_a_fit') as not_a_fit,
           count(*) filter (where l.closed_reason = 'stale') as stale,
           count(*) filter (where l.email is not null) as with_email,
           count(*) filter (where l.phone_e164 is not null) as with_phone,
           max(l.contacted_at) as last_contacted_at
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
    -- The reach-out to its leads: how many were emailed, and when the last email went.
    select k.search_id, count(distinct o.lead_id) as sent, max(o.sent_at) as last_sent_at
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
               'from_idea', s.plan->>'from' = 'idea',
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
                                           'with_phone', coalesce(l.with_phone, 0),
                                           'last_contacted_at', l.last_contacted_at),
               'not_a_fit_why', coalesce(w.by_why, '{}'::jsonb),
               'reach', jsonb_build_object('sent', coalesce(ro.sent, 0), 'replied', coalesce(rr.replied, 0),
                                           'interested', coalesce(rr.interested, 0), 'declined', coalesce(rr.declined, 0),
                                           'last_sent_at', ro.last_sent_at),
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
  'What a workspace''s finder searches of the last 180 days asked for and found, and what came of the leads each kept (contacted and when last, interested, booked, customers, said no, not a fit and why, reach-out sent and when last, replied, deals won), whether each was started from an idea, with where the workspace is: the ideas for a new search are written from it (00398, 00399). Counts, moments and the plan''s own words only; never a business''s name, a person, a reply''s words or a judgment''s reasons. The service''s alone: the route checks the member may find.';
revoke all on function public.lead_suggest_history(uuid) from public, anon, authenticated;
grant execute on function public.lead_suggest_history(uuid) to service_role;
