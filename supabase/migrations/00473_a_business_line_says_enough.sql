-- 00473 · A business line says enough (Ruben, 22 Oct 2026).
--
-- The line the ideas are written from was held to 160 characters (00142), and the ideas' door cut it there (00400,
-- 00470): one short sentence, which said too little of a business for the ideas to be written from. It may now be a
-- few sentences, up to 400 characters: what the business sells, who buys it, and how.
--
--   lead_suggestions        business_line between 3 and 400 characters.
--   lead_suggestions_write  The ideas' one door as 00470 left it, cutting the line at 400.

alter table public.lead_suggestions drop constraint if exists lead_suggestions_business_line_check;
alter table public.lead_suggestions
  add constraint lead_suggestions_business_line_check check (char_length(business_line) between 3 and 400);

-- 00470's door, with the line cut at 400 in place of 160. The five acts as they were.
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
  v_line    text := left(btrim(coalesce(p_line, '')), 400);
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
  elsif p_act = 'again' then
    -- New ideas from the same line (decision 0070): the ideas shown stay, so the write that follows passes them on, and
    -- the basis goes, so it follows at once. A claim in flight is let go; a failure a moment ago is forgotten.
    update public.lead_suggestions k
       set basis = null, making_at = null, failed_at = null
     where k.tenant_id = p_tenant_id
    returning true into v_done;
    if coalesce(v_done, false) then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'lead.ideas_written', 'lead', 'lead_search', null,
              jsonb_build_object('how', 'again', 'count', 0, 'by_owner', false));
    end if;
    return jsonb_build_object('again', coalesce(v_done, false));
  end if;
  raise exception 'act is claim, keep, fail, line or again' using errcode = '22023';
end;
$$;
comment on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) is
  'The one writer of lead_suggestions (00400, 00470, 00473), by act: claim ({claim}: this read''s moment, or null while another''s stands), keep ({kept}: only while p_claim stands), fail ({failed}: the claim let go and the failure kept), line ({saved}: the owner''s own words, which clear any claim and what was passed on), again ({again}: New ideas from the same line, what was shown kept to be passed on). A keep, a line and an again write lead.ideas_written. The line is cut at 400 characters. The service''s alone.';
revoke all on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.lead_suggestions_write(uuid, text, timestamptz, text, boolean, jsonb, text, jsonb) to service_role;
