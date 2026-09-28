-- 00237 · A lead says whether its website is its own.
--
-- A lead keeps only its website's host (00140 website_host): the finder cuts the path. So a no read from a reply
-- (00222, N6) could not tell a business's own site, "example-movers.example/", from a page under someone else's host,
-- "isp.example/~dana/", and closed the whole host's domain for the workspace when the reply came from an address on
-- it: an ISP's, for one person's no.
--
--   leads.website_root   true when the listing's website is its host's root, false when it is a page under the host,
--                        null for a lead found before this was kept, or with no website. Written by the collect;
--                        a lead already here gains it where it had none, so leads learn it as they are found again.
--   lead_collect_commit  00161's, whole, with that one column written. Copied by a script, not retyped.
--   reach_out_reply_of   00222's, whole, answering lead_website_root beside lead_website. Contracts' ownedDomainOf
--                        closes a domain only for a website that is not known to be a page under its host.
--
-- Either deploy order: an older finder sends no website_root (null, as before this), and an older reading ignores the
-- key it does not ask for.

alter table public.leads add column if not exists website_root boolean;
comment on column public.leads.website_root is
  'Whether the listing''s website is its host''s root (00237): false for a page under the host (an ISP''s "/~dana/", a directory''s listing), which is no proof the host is the business''s own; null when not known. A reply''s no closes the host''s domain only when this is not false (contracts ownedDomainOf).';

/* ------------------------------------------ lead_collect_commit, from 00161 -- */

create or replace function public.lead_collect_commit(p_run_id uuid, p_owner text, p_gen integer, p_from_offset integer, p_to_offset integer, p_page jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       public.lead_runs;
  v_round     public.lead_rounds;
  v_room      integer;
  v_counted   integer := 0;
  v_qualified integer := 0;
  v_review    integer := 0;
  v_excluded  integer := 0;
  v_month     text;
  v_usage     numeric;
  v_delta     numeric;
  v_n         integer;
  v_j         jsonb;
  v_el        jsonb;
  v_pl        jsonb;
  v_m         jsonb;
  v_dup       text;
  v_lead      uuid;
  v_class     text;
  v_next      jsonb;
  v_r         jsonb;
  v_state     text;
  v_counter   public.lead_counters;
begin
  -- One lock order everywhere: the ROUND first, then its runs, as
  -- lead_round_stop and lead_search_remove take them. So the run is read
  -- without a lock, only to learn which round it belongs to (a run never
  -- moves), and read again under lock once the round is held; a Stop arriving
  -- mid-page then waits instead of deadlocking (40P01). The lease and the
  -- offset are judged on the locked copy, so the compare-and-set still holds.
  select * into v_run from public.lead_runs where id = p_run_id;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  select * into v_round from public.lead_rounds where id = v_run.round_id for update;
  select * into v_run from public.lead_runs where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'run');
  end if;
  if v_run.lease_owner is distinct from p_owner or v_run.lease_gen <> p_gen then
    return jsonb_build_object('ok', false, 'why', 'lease');
  end if;
  if v_run.read_offset <> p_from_offset then
    return jsonb_build_object('ok', false, 'why', 'offset');
  end if;
  -- A check run may commit after its round ended (Check again, 00145): it decides nothing, its answers
  -- reach the leads through lead_check_commit, and its usage settles below against nothing outstanding.
  if v_round.state = 'ended' and v_run.purpose <> 'check' then
    return jsonb_build_object('ok', false, 'why', 'ended');
  end if;
  v_month := v_round.month;
  v_room  := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);

  -- The judge's answers for the page's batches, kept once each by op_id.
  for v_j in select * from jsonb_array_elements(
      case jsonb_typeof(p_page->'judgment') when 'array' then p_page->'judgment'
           when 'object' then jsonb_build_array(p_page->'judgment') else '[]'::jsonb end) loop
    insert into public.lead_judgments (tenant_id, round_id, batch, op_id, request_hash, answer, model, tokens)
    values (v_round.tenant_id, v_round.id, coalesce((v_j->>'batch')::integer, 0), v_j->>'op_id', v_j->>'request_hash',
            coalesce(v_j->'answer', '{}'::jsonb), v_j->>'model', coalesce((v_j->>'tokens')::integer, 0))
    on conflict (op_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      update public.lead_rounds
         set judge_tokens = judge_tokens + coalesce((v_j->>'tokens')::integer, 0),
             judge_model  = coalesce(v_j->>'model', judge_model)
       where id = v_round.id;
    end if;
  end loop;

  -- The places: a lead by place id (once), a duplicate listing folded into
  -- the lead it belongs to, a membership (once), the count.
  for v_el in select * from jsonb_array_elements(coalesce(p_page->'places', '[]'::jsonb)) loop
    v_pl  := v_el->'place';
    v_m   := v_el->'member';
    v_dup := v_el->>'duplicate_of_place_id';
    if v_pl->>'place_id' is null then continue; end if;
    -- Never a place, number or address on the never-again list: a customer
    -- is hidden from every search, an erased person from everything (S8).
    if exists (select 1 from public.lead_suppressions s where s.tenant_id = v_round.tenant_id and (
           (s.kind = 'place' and s.what in ('customer', 'erased') and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'place_id'))
        or (s.kind = 'phone' and s.what = 'erased' and v_pl->>'phone_e164' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'phone_e164'))
        or (s.kind = 'email' and s.what = 'erased' and v_pl->>'email' is not null and s.hash = public.lead_suppression_hash(v_round.tenant_id, v_pl->>'email')))) then
      continue;
    end if;
    v_lead := null;
    if v_dup is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = v_round.tenant_id and l.blanked_at is null and l.erased_at is null
         and (l.place_id = v_dup or exists (select 1 from public.lead_places p where p.tenant_id = l.tenant_id and p.lead_id = l.id and p.place_id = v_dup))
       limit 1;
      if v_lead is not null then
        insert into public.lead_places (lead_id, tenant_id, place_id, title, street)
        values (v_lead, v_round.tenant_id, v_pl->>'place_id', left(v_pl->>'business_name', 200), left(v_pl->>'street', 200))
        on conflict (tenant_id, place_id) do nothing;
      end if;
    end if;
    if v_lead is null then
      insert into public.leads (tenant_id, place_id, business_name, category, street, city, region, postal_code, country, lat, lng,
                                website_host, website_root, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews,
                                about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, neighborhood, logo_url, mark_path)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), (v_pl->>'website_root')::boolean, left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer,
              left(v_pl->>'about', 600), coalesce(v_pl->'hours', '[]'::jsonb), left(v_pl->>'image_url', 500), left(v_pl->>'price', 8),
              v_pl->'reviews_dist', left(v_pl->>'facebook_url', 300), left(v_pl->>'linkedin_url', 300), left(v_pl->>'tiktok_url', 300),
              (v_pl->>'claimed')::boolean, left(v_pl->>'maps_url', 500), (v_pl->>'rank')::integer, left(v_pl->>'neighborhood', 120), left(v_pl->>'logo_url', 500),
              -- The copy we keep (00161): its name, when it is one of ours; anything else is no copy at all.
              case when v_pl->>'mark_path' ~ '^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$' then v_pl->>'mark_path' end)
      -- A place already here keeps its worked state and gains what this listing shows where it had none (D2):
      -- these columns and nothing else, so a lead's stage, its email state and its version are untouched. Whether its
      -- website is its host's root (00237) is one of them: a lead found before it was kept learns it when found again.
      on conflict (tenant_id, place_id) where place_id is not null do update set
        about        = coalesce(public.leads.about, excluded.about),
        hours        = case when public.leads.hours = '[]'::jsonb then excluded.hours else public.leads.hours end,
        image_url    = coalesce(public.leads.image_url, excluded.image_url),
        price        = coalesce(public.leads.price, excluded.price),
        reviews_dist = coalesce(public.leads.reviews_dist, excluded.reviews_dist),
        facebook_url = coalesce(public.leads.facebook_url, excluded.facebook_url),
        linkedin_url = coalesce(public.leads.linkedin_url, excluded.linkedin_url),
        tiktok_url   = coalesce(public.leads.tiktok_url, excluded.tiktok_url),
        claimed      = coalesce(public.leads.claimed, excluded.claimed),
        maps_url     = coalesce(public.leads.maps_url, excluded.maps_url),
        rank         = coalesce(public.leads.rank, excluded.rank),
        neighborhood = coalesce(public.leads.neighborhood, excluded.neighborhood),
        logo_url     = coalesce(public.leads.logo_url, excluded.logo_url),
        mark_path    = coalesce(public.leads.mark_path, excluded.mark_path),
        website_root = coalesce(public.leads.website_root, excluded.website_root);
      select l.id into v_lead from public.leads l where l.tenant_id = v_round.tenant_id and l.place_id = v_pl->>'place_id';
    end if;
    if v_lead is null then continue; end if;
    v_class := coalesce(v_m->>'class', 'review');
    insert into public.lead_search_members (search_id, lead_id, round_id, tenant_id, judgment, class, excluded_by, fit, reason, distance_m)
    values (v_round.search_id, v_lead, v_round.id, v_round.tenant_id,
            coalesce(v_m->'judgment', '{}'::jsonb) || jsonb_build_object('shares', coalesce(v_el->'shares', '[]'::jsonb)),
            v_class, v_m->>'excluded_by', v_m->>'fit', coalesce(left(v_m->>'reason', 120), ''), (v_m->>'distance_m')::integer)
    on conflict (search_id, lead_id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    if v_class = 'qualified' then
      v_qualified := v_qualified + 1;
      if v_room > 0 then
        update public.lead_search_members set counted = true, counted_month = v_month
         where search_id = v_round.search_id and lead_id = v_lead;
        v_room := v_room - 1;
        v_counted := v_counted + 1;
      end if;
    elsif v_class = 'review' then
      v_review := v_review + 1;
    else
      v_excluded := v_excluded + 1;
    end if;
  end loop;

  -- Delivery settles against the reservation (E2): the round's used grows,
  -- the month's reserved becomes used.
  if v_counted > 0 then
    update public.lead_rounds set allowance_used = allowance_used + v_counted where id = v_round.id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_month);
    update public.lead_counters set used = used + v_counted, reserved = greatest(reserved - v_counted, 0), updated_at = now() where id = v_counter.id;
  end if;

  -- The run's usage so far, as the provider reports it; only what is new
  -- settles.
  v_usage := (p_page->>'usage_usd')::numeric;
  if v_usage is not null and v_usage > v_run.usage_usd then
    v_delta := v_usage - v_run.usage_usd;
    perform public.lead_settle_usage(v_round.tenant_id, v_month, v_round.day, v_round.platform_day, v_delta,
      case when v_round.state = 'ended' then 0 else v_round.cost_reserved_usd - v_round.cost_usd end);
    -- An ended round is final (its trigger refuses a change): the month's counters carry a re-check's cents, the round's own cost stays what it ended at.
    if v_round.state <> 'ended' then
      update public.lead_rounds set cost_usd = cost_usd + v_delta where id = v_round.id;
    end if;
    update public.lead_runs set usage_usd = v_usage where id = p_run_id;
  end if;

  -- The offset moves (compare-and-set held above), the run's state follows
  -- the provider's, and the next collect is written once.
  update public.lead_runs
     set read_offset = p_to_offset,
         items_seen  = coalesce((p_page->>'items_seen')::integer, items_seen),
         state       = coalesce(p_page->>'run_state', state),
         finished_at = case when coalesce(p_page->>'run_state', state) in ('succeeded', 'failed', 'aborted', 'timed_out') then coalesce(finished_at, now()) else finished_at end
   where id = p_run_id;
  v_next := p_page->'next';
  if v_next is not null and jsonb_typeof(v_next) = 'object' then
    if v_next->>'kind' = 'lead_check' then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_check', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('round_id', v_round.id, 'batch', coalesce((v_next->>'batch')::integer, 1)));
    else
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_round.tenant_id, 'lead_collect', now() + make_interval(secs => coalesce((v_next->>'run_after_seconds')::integer, 0)),
              jsonb_build_object('run_id', p_run_id, 'seq', coalesce(v_next->>'seq', 'p' || p_to_offset)))
      on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
    end if;
  end if;

  -- The round: a bigger target once the probe passed, the question, the
  -- pending ending, a state, or its ending (which releases and records).
  v_r := coalesce(p_page->'round', '{}'::jsonb);
  if v_r->>'target' is not null then
    update public.lead_rounds set target = greatest((v_r->>'target')::integer, target) where id = v_round.id;
  end if;
  if v_r->>'ending_pending' is not null then
    update public.lead_rounds set ending_pending = v_r->>'ending_pending' where id = v_round.id;
  end if;
  -- Where to look next, when the area ran dry (D3, 00145): written with the ending it belongs to, before the
  -- round is final.
  if v_r->'nearby' is not null and jsonb_typeof(v_r->'nearby') = 'array' then
    update public.lead_rounds set nearby = v_r->'nearby' where id = v_round.id;
  end if;
  if v_r->'question' is not null and jsonb_typeof(v_r->'question') = 'object' then
    update public.lead_rounds set question = v_r->'question', waiting_since = now() where id = v_round.id;
  end if;
  if v_r->>'ending' is not null then
    perform public.lead_round_end(v_round.id, v_r->>'ending');
  elsif v_r->>'state' is not null and v_r->>'state' <> v_round.state then
    update public.lead_rounds
       set state = v_r->>'state', started_at = coalesce(started_at, now())
     where id = v_round.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_round.tenant_id, 'lead.round', 'lead', 'lead_round', v_round.id,
            jsonb_build_object('search_id', v_round.search_id, 'seq', v_round.seq, 'state', v_r->>'state'));
  end if;
  select state into v_state from public.lead_rounds where id = v_round.id;
  return jsonb_build_object('ok', true, 'counted', v_counted, 'qualified', v_qualified, 'review', v_review, 'excluded', v_excluded, 'round_state', v_state);
end $$;
comment on function public.lead_collect_commit(uuid, text, integer, integer, integer, jsonb) is
  'One page of one run, in one transaction (E4). Refuses {ok:false, why} on a stale lease, a wrong offset or an ended round (a check run, which decides nothing, may still commit after the round ended: Check again, 00145). Keeps judgments by op_id, inserts leads (once per place id) and members (once per search), counts Qualified members up to the round''s reservation, settles usage, advances the offset, writes the next job once, moves the round, appends the events. Replayed with the same offset it does nothing twice; replayed after the offset moved it is refused.';

/* -------------------------------------------- reach_out_reply_of, from 00222 -- */

create or replace function public.reach_out_reply_of(p_tenant_id uuid, p_message_id uuid, p_days int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select m.id, m.conversation_id, coalesce(m.contact_id, c.contact_id) as contact_id, c.contact_id as thread_contact,
           m.created_at, coalesce(m.channel_ts, m.created_at) as received_at, m.body, m.meta
      from public.messages m
      join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
     where m.id = p_message_id and m.tenant_id = p_tenant_id
       and m.channel = 'email' and m.direction = 'inbound' and m.sender = 'customer'
  ), cited as (
    select array_remove(
             array[m.meta->'email'->>'in_reply_to']
             || array(select jsonb_array_elements_text(
                        case when jsonb_typeof(m.meta->'email'->'references') = 'array'
                             then m.meta->'email'->'references' else '[]'::jsonb end)),
             null) as ids
      from m
  ), found as (
    -- The email it answers or cites, by its Message-ID (messages_email_message_id_idx), then its send.
    (select s.id, 1 as how, s.sent_at
       from cited cross join m
       join public.messages o
         on o.tenant_id = p_tenant_id and o.channel = 'email' and o.direction = 'outbound'
        and o.meta->'email'->>'message_id' = any (cited.ids)
       join public.reach_out_sends s on s.message_id = o.id and s.tenant_id = o.tenant_id
      where s.state = 'sent'
        and s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
      order by s.sent_at desc
      limit 1)
    union all
    -- Else the latest email a reach-out sent to the thread's person, as the send names them
    -- (reach_out_sends_contact)...
    (select s.id, 2 as how, s.sent_at
       from m
       join public.reach_out_sends s
         on s.tenant_id = p_tenant_id and s.contact_id = m.thread_contact and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
    union all
    -- ...or as its lead names them now (leads_tenant_contact).
    (select s.id, 3 as how, s.sent_at
       from m
       join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = m.thread_contact
       join public.reach_out_sends s on s.tenant_id = l.tenant_id and s.lead_id = l.id and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
  ), one as (
    select f.id from found f order by f.how, f.sent_at desc limit 1
  )
  select jsonb_build_object(
    'send_id', s.id,
    'lead_id', l.id,
    'lead_contact_id', l.contact_id,
    'lead_email', lower(btrim(l.email)),
    'lead_website', l.website_host,
    'lead_website_root', l.website_root,
    'root_id', s.root_id,
    'playbook_id', s.playbook_id,
    'answered_message_id', s.message_id,
    'answered_text', left(o.body, 600),
    -- The address the email went to, read off its frozen request as the consent door reads it.
    'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->>'to'))),
    'business', l.business_name,
    'chain', root.name,
    'signed_by', root.signed_by,
    'sent_at', s.sent_at,
    'tz', t.timezone,
    'conversation_id', m.conversation_id,
    'contact_id', m.contact_id,
    'claim', case when m.meta->'email'->>'claim' in ('person', 'automated', 'auto_reply')
                  then m.meta->'email'->>'claim' else 'person' end,
    'from', m.meta->'email'->>'from',
    'subject', m.meta->'email'->>'subject',
    'text', m.body,
    'received_at', m.received_at)
    from one
    join public.reach_out_sends s on s.id = one.id
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    left join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
    left join public.playbooks root on root.id = s.root_id
    left join public.tenants t on t.id = s.tenant_id
    cross join m
$$;
revoke execute on function public.reach_out_reply_of(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_reply_of(uuid, uuid, int) to service_role;
comment on function public.reach_out_reply_of(uuid, uuid, int) is
  'Whose reply a received email is (Reach out Part 5, G5): the reach-out email it answers or cites, else the latest one sent to its thread''s person, within p_days before it arrived. Answers the send, the lead, the lead''s person, address and website (and whether that website is its host''s root, 00237), the chain, the email it answers (its first 600 characters), the workspace''s zone, and the reply''s own claim, sender, subject and words; null when it answers none. Service role only.';
