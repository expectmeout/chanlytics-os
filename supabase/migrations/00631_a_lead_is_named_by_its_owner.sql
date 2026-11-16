-- 00631 · A lead's name and city, put right by its owner (decision 0079's sprint, step 8: a wrong value is fixed once).
--
-- A lead's name and city are its listing's, and a member may only read a lead (00430: every change is a door). A wrong
-- one could be fixed in one email at a time (00545 sequence_lead_words), so the next email said it wrong again. This is
-- the one door that fixes it on the lead:
--
--   lead_named   the owner's door (permission find): the lead's name, its city, or both, as typed.
--                · Marked as the owner's own in facts.own ({name, city}), so the name is said as typed and never tidied
--                  as a listing's title is (contracts leadCalledByOf), and the card says where it came from. What the
--                  listing said is kept beside it (facts.own.was), the first time only: the way back, which goes with
--                  the lead when it is blanked or erased (lead_blank empties facts). An event never holds a name.
--                · A later search never writes over either: the finder's upsert keeps a lead's name and city.
--                · Each email of theirs still waiting that holds a line written from the record as it was is sent back
--                  to be written again (reach_out_recheck), unless it has waited past the day a recheck gives it up
--                  (reach_out_given_up): a name put right never skips an email.
--                · Their preview's workspace, while it is still a preview, takes the name (its record's own name is the
--                  dashboard's write, through the settings' schema).
--
-- No table changes. Applied before the dashboard that calls it deploys. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.lead_named(
  p_lead_id uuid,
  p_business_name text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_lead  public.leads%rowtype;
  -- As typed, with its spaces made single: nothing else is changed.
  v_name  text := nullif(btrim(regexp_replace(coalesce(p_business_name, ''), '\s+', ' ', 'g')), '');
  v_city  text := nullif(btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')), '');
  v_own   jsonb;
  v_was   jsonb;
  v_facts jsonb;
  v_again integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is, then the lead locked: a lead of a workspace the caller may not find leads in is never held.
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or not public.has_permission(v_user, v_lead.tenant_id, 'find') then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    return jsonb_build_object('error', 'gone');
  end if;
  if v_name is not null and char_length(v_name) not between 2 and 200 then
    return jsonb_build_object('error', 'bad_name');
  end if;
  if v_city is not null and char_length(v_city) > 120 then
    return jsonb_build_object('error', 'bad_city');
  end if;

  v_own := case when jsonb_typeof(v_lead.facts->'own') = 'object' then v_lead.facts->'own' else '{}'::jsonb end;
  -- What it says already, as its owner's own, is no change. The listing's own name typed again IS one: it becomes the
  -- owner's, said as typed from then on.
  if v_name is not null and v_name = v_lead.business_name and v_own->>'name' = 'true' then
    v_name := null;
  end if;
  if v_city is not null and v_city = v_lead.city and v_own->>'city' = 'true' then
    v_city := null;
  end if;
  if v_name is null and v_city is null then
    return jsonb_build_object('error', 'nothing');
  end if;

  -- What the listing said, kept the first time a value is put right.
  v_was := case when jsonb_typeof(v_own->'was') = 'object' then v_own->'was' else '{}'::jsonb end;
  if v_name is not null and not (v_was ? 'name') then
    v_was := v_was || jsonb_build_object('name', v_lead.business_name);
  end if;
  if v_city is not null and not (v_was ? 'city') then
    v_was := v_was || jsonb_build_object('city', v_lead.city);
  end if;
  v_own := v_own
           || case when v_name is not null then '{"name": true}'::jsonb else '{}'::jsonb end
           || case when v_city is not null then '{"city": true}'::jsonb else '{}'::jsonb end;
  v_facts := jsonb_set(v_lead.facts, '{own}', v_own || jsonb_build_object('was', v_was));
  -- A lead whose facts are near their most (leads_facts_is_an_object) keeps the marks and not what the listing said.
  if octet_length(v_facts::text) > 8000 then
    v_facts := jsonb_set(v_lead.facts, '{own}', v_own - 'was');
  end if;

  update public.leads
     set business_name = coalesce(v_name, business_name),
         city = coalesce(v_city, city),
         facts = v_facts,
         version = version + 1
   where id = v_lead.id;

  -- Each email of theirs still waiting that holds a line written from the record as it was: written again.
  select public.reach_out_recheck(
           array(select s.id from public.sequence_sends s
                  where s.tenant_id = v_lead.tenant_id and s.lead_id = v_lead.id
                    and s.state in ('planned', 'held') and s.opening is not null
                    and not public.reach_out_given_up(s.created_at)),
           v_lead.tenant_id)
    into v_again;

  -- Their preview's workspace takes the name while it is still a preview; one made theirs is theirs to name.
  if v_name is not null then
    update public.tenants t
       set name = left(v_name, 120)
      from public.lead_previews p
     where p.tenant_id = v_lead.tenant_id and p.lead_id = v_lead.id
       and t.id = p.preview_tenant_id and t.status = 'preview';
  end if;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'lead.named', 'lead', 'lead', v_lead.id,
          jsonb_build_object('name', v_name is not null, 'city', v_city is not null,
                             'again', coalesce(v_again, 0), 'by', v_user));
  return jsonb_build_object('ok', true,
                            'business_name', coalesce(v_name, v_lead.business_name),
                            'city', coalesce(v_city, v_lead.city),
                            'again', coalesce(v_again, 0),
                            'version', v_lead.version + 1);
end $$;

revoke all on function public.lead_named(uuid, text, text) from public, anon;
grant execute on function public.lead_named(uuid, text, text) to authenticated, service_role;
comment on function public.lead_named(uuid, text, text) is
  'The owner''s own name or city for a lead (permission find; 00631): written as typed and marked in facts.own ({name, city, was: what the listing said}), so every email says it and a listing''s tidy-up never touches it. Emails of theirs still waiting that hold a written line are sent back to be written again (the count is `again`), and their preview''s workspace takes the name while it is a preview. {ok, business_name, city, again, version}, or {error: gone | bad_name | bad_city | nothing}. Raises 28000 with no session and P0002 for a lead the caller may not find.';
