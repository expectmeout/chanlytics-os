-- 00400 · The ideas are written through one door, which keeps their event.
--
-- 00399 gave lead_suggestions three writers in SQL (the claim, the keep, the fail) beside the dashboard's own upsert of
-- the owner's line: four writers of one table, none of which wrote an event, against the house's two rules (one writer
-- per table; a door writes its record and its event in one write, decision 0031). This folds them into one door,
-- lead_suggestions_write, with an act: claim, keep, fail, or line (the owner's own words, which the dashboard wrote
-- straight into the table before). A keep and a line write their event, lead.ideas_written ({how, count, by_owner}): a
-- record kept for Reports (how often ideas are written, and whether an owner rewrites the line), not a line of the
-- owner's Activity. The three functions of 00399 are dropped: nothing deployed calls them.
--
-- The trigger that adds a round's counts to its kind (00398) runs with its caller's rights now, not the definer's: every
-- writer of lead_rounds is the service or a door of its own, both of which may write lead_niche_priors, and a function
-- with definer's rights is a door, which this is not.

drop function if exists public.lead_suggestions_claim(uuid, text);
drop function if exists public.lead_suggestions_keep(uuid, timestamptz, text, boolean, jsonb, text, jsonb);
drop function if exists public.lead_suggestions_fail(uuid, timestamptz);

create or replace function public.lead_suggestions_write(
  p_tenant_id uuid,
  p_act text,
  p_claim timestamptz default null,
  p_line text default null,
  p_by_owner boolean default false,
  p_items jsonb default '[]'::jsonb,
  p_basis text default null,
  p_passed jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    text := left(btrim(coalesce(p_line, '')), 160);
  v_claimed timestamptz;
  v_done    boolean;
begin
  if p_act = 'claim' then
    -- The claim on writing: this read's own moment, or null while another read's claim is under two minutes old. A
    -- workspace with no row gets one, with the line and no ideas.
    if char_length(v_line) < 3 then
      v_line := 'this business';
    end if;
    insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, made_at, making_at)
    values (p_tenant_id, v_line, false, '[]'::jsonb, now(), clock_timestamp())
    on conflict (tenant_id) do update set making_at = clock_timestamp()
     where k.making_at is null or k.making_at < now() - interval '2 minutes'
    returning k.making_at into v_claimed;
    return jsonb_build_object('claim', v_claimed);
  elsif p_act = 'keep' then
    -- Kept while the claim stands: false when it was let go meanwhile (the owner saved a line, or a slower write was
    -- taken over), and nothing is written.
    update public.lead_suggestions k
       set business_line = v_line,
           by_owner      = coalesce(p_by_owner, false),
           items         = coalesce(p_items, '[]'::jsonb),
           basis         = left(p_basis, 80),
           passed        = coalesce(p_passed, '[]'::jsonb),
           made_at       = now(),
           making_at     = null,
           failed_at     = null
     where k.tenant_id = p_tenant_id
       and p_claim is not null
       and k.making_at = p_claim
       and char_length(v_line) >= 3
    returning true into v_done;
    if coalesce(v_done, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
              jsonb_build_object('how', 'written', 'count', jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
                                 'by_owner', coalesce(p_by_owner, false)));
    end if;
    return jsonb_build_object('kept', coalesce(v_done, false));
  elsif p_act = 'fail' then
    -- The model would not write them under this claim: the claim let go and the failure kept, so the next reads say so
    -- for a while rather than ask again. A claim since taken over is left alone.
    update public.lead_suggestions k
       set failed_at = now(), making_at = null
     where k.tenant_id = p_tenant_id and p_claim is not null and k.making_at = p_claim
    returning true into v_done;
    return jsonb_build_object('failed', coalesce(v_done, false));
  elsif p_act = 'line' then
    -- The owner's own words: kept with no ideas and no basis, so the next read asks again, and nothing passed on, since
    -- what was passed on was another line's. The owner's word clears any claim: a write in flight finds its claim gone.
    if char_length(v_line) < 3 then
      raise exception 'a business line is at least three characters' using errcode = '22023';
    end if;
    insert into public.lead_suggestions as k (tenant_id, business_line, by_owner, items, basis, passed, made_at, making_at, failed_at)
    values (p_tenant_id, v_line, true, '[]'::jsonb, null, '[]'::jsonb, now(), null, null)
    on conflict (tenant_id) do update
       set business_line = excluded.business_line, by_owner = true, items = '[]'::jsonb, basis = null,
           passed = '[]'::jsonb, made_at = now(), making_at = null, failed_at = null;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
            jsonb_build_object('how', 'line', 'count', 0, 'by_owner', true));
    return jsonb_build_object('saved', true);
  end if;
  raise exception 'act is claim, keep, fail or line' using errcode = '22023';
end;
$$;
comment on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) is
  'The one writer of lead_suggestions (00400), by act: claim ({claim}: this read''s moment, or null while another''s stands), keep ({kept}: only while p_claim stands), fail ({failed}: the claim let go and the failure kept), line ({saved}: the owner''s own words, which clear any claim). A keep and a line write lead.ideas_written. The service''s alone.';
revoke all on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) to service_role;

create or replace function public.lead_round_adds_to_its_kind()
returns trigger
language plpgsql
security invoker
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
  'A round that ends adds what it judged to its kind''s platform-wide counts (lead_niche_priors), by its plan''s category_key (00398). Its caller''s rights (00400): the service, or a door of its own. Aggregates only. Never raises.';
