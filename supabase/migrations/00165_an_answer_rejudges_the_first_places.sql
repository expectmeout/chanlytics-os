-- 00165 · An answer re-judges the first places
--
-- A search that stops after its first places to ask "is that what you
-- meant?" can be answered by changing the plan: Include the thing it left
-- out, or Change what I asked. lead_round_answer stored the amended plan and
-- the round ran on -- but the places the probe had already judged kept the
-- verdicts of the plan the owner had just said was wrong. And since the main
-- phase skips a place the workspace already holds, "Include large studio
-- chains" could never bring a single one of them back.
--
-- The runner judges them again under the new plan (core rejudgeProbe: the
-- probe's own items read again, a stored answer reused when it answers every
-- key the new plan asks, else judged again), and this door commits what it
-- decided, in one transaction per batch:
--
--   * only on a round running at that plan version; a judgment kept once by
--     its op_id, its tokens added, as lead_collect_commit keeps them;
--   * never over the owner's own decision (Keep or Put back: kept_at;
--     Exclude: excluded_by 'owner'; a lead worked in any way the undo door
--     reads as touched: its stage, a person, a contact, an outcome, a wrong
--     number), and
--     never twice (the member's judgment carries the version it was judged
--     under, which a replay finds already there);
--   * a place leaving Excluded is filled with what its listing shows and its
--     email, where the lead has none; a place entering Excluded keeps nothing
--     a left-out place never keeps (PRD §0.4);
--   * counted as the collect counts, from the round's own reservation: a
--     member newly Qualified counts while there is room, one no longer
--     Qualified gives its lead back to the reservation, which the round's end
--     releases as it always has.

create or replace function public.lead_round_rejudge(p_round_id uuid, p_plan_version integer, p_places jsonb, p_judgment jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round     public.lead_rounds;
  m           public.lead_search_members;
  l           public.leads;
  v_j         jsonb;
  v_el        jsonb;
  v_pl        jsonb;
  v_m         jsonb;
  v_n         integer;
  v_class     text;
  v_room      integer;
  v_changed   integer := 0;
  v_counted   integer := 0;
  v_uncounted integer := 0;
  v_counter   public.lead_counters;
begin
  select * into v_round from public.lead_rounds where id = p_round_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'why', 'round');
  end if;
  if v_round.state <> 'running' then
    return jsonb_build_object('ok', false, 'why', 'state');
  end if;
  if v_round.plan_version <> p_plan_version then
    return jsonb_build_object('ok', false, 'why', 'version');
  end if;

  -- The judge's answers, kept once each by op_id.
  for v_j in select * from jsonb_array_elements(
      case jsonb_typeof(p_judgment) when 'array' then p_judgment
           when 'object' then jsonb_build_array(p_judgment) else '[]'::jsonb end) loop
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

  v_room := greatest(v_round.allowance_reserved - v_round.allowance_used, 0);
  for v_el in select * from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) loop
    v_pl := v_el->'place';
    v_m  := v_el->'member';
    if v_pl->>'place_id' is null or v_m is null then continue; end if;
    select * into l from public.leads where tenant_id = v_round.tenant_id and place_id = v_pl->>'place_id';
    if not found or l.blanked_at is not null or l.erased_at is not null then continue; end if;
    select * into m from public.lead_search_members
     where search_id = v_round.search_id and lead_id = l.id for update;
    if not found or m.round_id is distinct from v_round.id or m.blanked_at is not null then continue; end if;
    -- The owner's own decision stands, and so does a lead they have already worked: untouched as
    -- lead_search_undo reads it (00142), and nothing less.
    if m.kept_at is not null or coalesce(m.excluded_by, '') = 'owner'
       or l.stage <> 'ready' or l.contact_id is not null or l.contacted_at is not null
       or l.last_outcome is not null or l.phone_wrong then
      continue;
    end if;
    -- Judged under this plan already: a replay, or a second job's pass.
    if coalesce((m.judgment->>'plan_version')::integer, 1) >= p_plan_version then continue; end if;

    v_class := coalesce(v_m->>'class', 'review');
    update public.lead_search_members
       set class       = v_class,
           excluded_by = v_m->>'excluded_by',
           fit         = v_m->>'fit',
           reason      = coalesce(left(v_m->>'reason', 120), ''),
           judgment    = coalesce(v_m->'judgment', '{}'::jsonb)
                         || jsonb_build_object('shares', coalesce(m.judgment->'shares', '[]'::jsonb), 'plan_version', p_plan_version),
           version     = version + 1
     where id = m.id;

    if m.class = 'excluded' and v_class <> 'excluded' then
      -- In now: what the listing shows and the address the judge picked, where the lead has none (00144's columns).
      update public.leads
         set email            = coalesce(email, v_pl->>'email'),
             email_alternates = case when email is null then coalesce(v_pl->'email_alternates', '[]'::jsonb) else email_alternates end,
             email_state      = case when email is null and v_pl->>'email' is not null then coalesce(v_pl->>'email_state', 'checking') else email_state end,
             about        = coalesce(about, left(v_pl->>'about', 600)),
             hours        = case when hours = '[]'::jsonb then coalesce(v_pl->'hours', '[]'::jsonb) else hours end,
             image_url    = coalesce(image_url, left(v_pl->>'image_url', 500)),
             price        = coalesce(price, left(v_pl->>'price', 8)),
             reviews_dist = coalesce(reviews_dist, v_pl->'reviews_dist'),
             facebook_url = coalesce(facebook_url, left(v_pl->>'facebook_url', 300)),
             linkedin_url = coalesce(linkedin_url, left(v_pl->>'linkedin_url', 300)),
             tiktok_url   = coalesce(tiktok_url, left(v_pl->>'tiktok_url', 300)),
             claimed      = coalesce(claimed, (v_pl->>'claimed')::boolean),
             maps_url     = coalesce(maps_url, left(v_pl->>'maps_url', 500)),
             rank         = coalesce(rank, (v_pl->>'rank')::integer),
             neighborhood = coalesce(neighborhood, left(v_pl->>'neighborhood', 120)),
             logo_url     = coalesce(logo_url, left(v_pl->>'logo_url', 500)),
             mark_path    = coalesce(mark_path,
                              case when v_pl->>'mark_path' ~ '^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$' then v_pl->>'mark_path' end)
       where id = l.id;
    elsif m.class <> 'excluded' and v_class = 'excluded' then
      -- Out now: a left-out place keeps no address to write to and nothing its listing showed (PRD §0.4).
      update public.leads
         set email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null,
             about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
             facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null,
             rank = null, neighborhood = null, logo_url = null, mark_path = null
       where id = l.id;
    end if;

    -- Counted as the collect counts: from the round's reservation, while it has room.
    if v_class = 'qualified' and not m.counted and v_room > 0 then
      update public.lead_search_members set counted = true, counted_month = v_round.month where id = m.id;
      v_room := v_room - 1;
      v_counted := v_counted + 1;
    elsif v_class <> 'qualified' and m.counted then
      update public.lead_search_members set counted = false, counted_month = null where id = m.id;
      v_room := v_room + 1;
      v_uncounted := v_uncounted + 1;
    end if;
    v_changed := v_changed + 1;
  end loop;

  if v_counted <> v_uncounted then
    update public.lead_rounds
       set allowance_used = allowance_used + v_counted - v_uncounted
     where id = v_round.id;
    v_counter := public.lead_counter_take(v_round.tenant_id, 'allowance', v_round.month);
    update public.lead_counters
       set used     = greatest(used + v_counted - v_uncounted, 0),
           reserved = greatest(reserved - v_counted + v_uncounted, 0),
           updated_at = now()
     where id = v_counter.id;
  end if;
  if v_changed > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_round.tenant_id, 'lead.round', 'lead', 'lead_round', v_round.id,
            jsonb_build_object('search_id', v_round.search_id, 'seq', v_round.seq, 'state', v_round.state,
                               'rejudged', v_changed, 'plan_version', p_plan_version,
                               'counted', v_counted, 'uncounted', v_uncounted));
  end if;
  return jsonb_build_object('ok', true, 'changed', v_changed, 'counted', v_counted, 'uncounted', v_uncounted);
end $$;
comment on function public.lead_round_rejudge(uuid, integer, jsonb, jsonb) is
  'The runner''s. Commits the verdicts of an answer that changed the plan over the places the round''s probe already judged: only on a round running at that plan version ({ok:false, why:round|state|version}); judgments kept once by op_id; never over the owner''s decision or a worked lead, never twice (judgment.plan_version); a place leaving Excluded filled, one entering it cleared (PRD 0.4); counted from the round''s reservation both ways. Answers {ok, changed, counted, uncounted}.';
revoke execute on function public.lead_round_rejudge(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
