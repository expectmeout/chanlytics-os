-- 00227 · A booking or a deal stops a reach-out.
--
-- Reach out, Part 5 (docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md, PR 9; G19 and Ruben's N3). A
-- business the reach-out wrote to that books through the link, or for whose person the owner opens a deal, is talking:
-- its lead moves to converted through 00220's one converter, and the send door's lead_stage (outreach_lead_closed)
-- stops its next nudge. Nothing new decides the stop.
--
--   reach_out_booked       the calendar sweep's door: the addresses and numbers its appointments carry, each with when
--                          it starts. A ready or nurture lead a reach-out sent to, whose own address or number, or its
--                          person's, is one of them, on an appointment starting after an email of the reach-out left,
--                          converts with how 'booking'. Answers how many moved. Service role only.
--   leads_convert_on_deal  after a deal is inserted: each ready or nurture lead of the deal's person converts with how
--                          'deal' and the deal's id. Keyed by the person, never by deals.lead_id, which deal_open fills
--                          with whichever of their leads converted last (00156). A failure warns and never refuses the
--                          deal.
--
-- Every statement re-runs. Nothing here alters a table.

/* ------------------------------------------------------------ the booking -- */

create or replace function public.reach_out_booked(p_tenant_id uuid, p_seen jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_n    int := 0;
begin
  if p_tenant_id is null or p_seen is null or jsonb_typeof(p_seen) <> 'array' then
    return 0;
  end if;
  for v_lead in
    with seen as (
      -- At most 500 appointments' contacts a call, as the sweep bounds them; a start that is not a time is no start.
      -- The cast sits behind its own test, since a filter beside it may run after it.
      select lower(nullif(btrim(x.s->>'email'), '')) as email,
             nullif(btrim(x.s->>'phone'), '')        as phone,
             case when coalesce(x.s->>'start', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$'
                  then (x.s->>'start')::timestamptz end as start_at
        from (select e from jsonb_array_elements(p_seen) e limit 500) x(s)
       where jsonb_typeof(x.s) = 'object'
    ),
    matched as (
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and lower(l.email) = s.email
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s join public.leads l on l.tenant_id = p_tenant_id and l.phone_e164 = s.phone
       where s.phone is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and lower(c.email) = s.email and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.email is not null
      union all
      select l.id, s.start_at
        from seen s
        join public.contacts c on c.tenant_id = p_tenant_id and c.phone_e164 = s.phone and c.erased_at is null
        join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = c.id
       where s.phone is not null
    )
    select m.id, min(m.start_at) as start_at
      from matched m
      join public.leads l on l.id = m.id
     where m.start_at is not null
       and l.stage in ('ready', 'nurture')
       and l.erased_at is null and l.blanked_at is null
       -- An appointment starting after an email of the reach-out left: one made before it was not the reach-out's.
       and exists (
         select 1 from public.reach_out_sends x
          where x.tenant_id = p_tenant_id and x.lead_id = m.id and x.state = 'sent' and x.sent_at < m.start_at)
     group by m.id
  loop
    if coalesce((public.lead_convert_by(p_tenant_id, v_lead.id, 'booking',
                   jsonb_build_object('start', v_lead.start_at))->>'moved')::boolean, false) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.reach_out_booked(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_booked(uuid, jsonb) to service_role;
comment on function public.reach_out_booked(uuid, jsonb) is
  'The calendar sweep''s door (Reach out Part 5, G19, N3): p_seen is [{email?, phone?, start}], at most 500 read. Each ready or nurture lead a reach-out sent to, whose address or number or its person''s is one seen, on an appointment starting after an email of the reach-out left, converts through lead_convert_by (how booking, with the start). Answers how many moved. Service role only.';

/* --------------------------------------------------------------- the deal -- */

create or replace function public.leads_convert_on_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select l.id from public.leads l
     where l.tenant_id = new.tenant_id and l.contact_id = new.contact_id
       and l.stage in ('ready', 'nurture')
       and l.erased_at is null and l.blanked_at is null
  loop
    perform public.lead_convert_by(new.tenant_id, v_id, 'deal', jsonb_build_object('deal_id', new.id));
  end loop;
  return null;
exception when others then
  -- The deal is the member's word; a lead that could not follow it is a warning, never a refused deal.
  raise warning 'leads_convert_on_deal: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.leads_convert_on_deal() from public, anon, authenticated;
comment on function public.leads_convert_on_deal() is
  'After a deal is inserted (Reach out Part 5, G19): each ready or nurture lead of the deal''s person converts through lead_convert_by (how deal, with the deal''s id). Keyed by contact_id, never deals.lead_id. A failure warns and never refuses the deal.';

drop trigger if exists deals_convert_leads on public.deals;
create trigger deals_convert_leads
  after insert on public.deals
  for each row execute function public.leads_convert_on_deal();
