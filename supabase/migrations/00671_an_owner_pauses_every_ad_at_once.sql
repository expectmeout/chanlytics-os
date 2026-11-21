-- 00671 · An owner pauses every ad at once (the Ads plan's G17: AI stopped with ads still on; decision 0050, calls 1 and 2).
--
-- While AI is stopped, the Ads page and the ad account's card offer one press that pauses every ad still on. It sent a
-- pause for each ad from the browser, one after another: each was kept and told at Meta's pace once it arrived, but the
-- ads not reached yet stayed on where the tab closed or the network dropped. The press is now one request, and every
-- pause in it is kept before it answers:
--
--   ad_pause_all   Each ad of the set paused through the one door a single pause is kept by (ad_set_intent, 00652:
--                  the owner alone, the version it was drawn from, the decision and the event), all in this one
--                  transaction, taken in the ads' own order so two presses over the same ads never wait on each other.
--                  Each kept pause Meta is to be told of asks for its account's read (ad_tell_ask, 00652), which tells
--                  Meta at the pace Meta takes changes, as a single pause Meta would not take at once is told. Meta is
--                  asked nothing here. Answers what the door answered for each ad, with its id.
--
-- Service role alone, as ad_set_intent. Deploy order: either. A dashboard and an edge ahead of this find no door and say
-- the press is not ready; nothing calls it before they are deployed. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.ad_pause_all(p_tenant_id uuid, p_actor uuid, p_presses jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_press jsonb;
  v_ad    uuid;
  v_kept  jsonb;
  v_out   jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_presses) is distinct from 'array' or jsonb_array_length(p_presses) not between 1 and 200 then
    raise exception 'ad_pause_all: between 1 and 200 ads' using errcode = '22023';
  end if;
  -- The owner alone pauses an ad (0050, call 2): asked once here before anything is kept, and by the door for each ad.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- In the ads' own order, as ids and not as text in any collation: two presses over the same ads lock them in the same
  -- order, so neither waits on the other. An id that is not one refuses the whole set before anything is kept.
  for v_press in
    select p.value from jsonb_array_elements(p_presses) p order by (p.value ->> 'ad_id')::uuid
  loop
    v_ad := (v_press ->> 'ad_id')::uuid;
    v_kept := public.ad_set_intent(p_tenant_id, p_actor, v_ad, (v_press ->> 'version')::integer, 'paused');
    -- A pause Meta is to be told of goes at Meta's pace, by its account's read, as one Meta would not take at once.
    if v_kept ->> 'outcome' = 'asked' and coalesce((v_kept ->> 'tell')::boolean, false) then
      perform public.ad_tell_ask(p_tenant_id, v_ad);
    end if;
    v_out := v_out || jsonb_build_array(v_kept || jsonb_build_object('ad_id', v_ad));
  end loop;
  return jsonb_build_object('outcome', 'kept', 'ads', v_out);
end $$;

revoke all on function public.ad_pause_all(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_pause_all(uuid, uuid, jsonb) to service_role;
comment on function public.ad_pause_all(uuid, uuid, jsonb) is
  'Service-role only: an owner pauses every ad of a set at once (00671; the Ads plan''s G17, decision 0050 calls 1 and 2). Each ad ({ad_id, version}, 1 to 200 of them) is paused through ad_set_intent, in one transaction, in the ads'' own order; each kept pause the platform is to be told of asks for its account''s read (ad_tell_ask), which tells the platform at its pace. The platform is asked nothing here. Answers outcome kept with ads, what ad_set_intent answered for each with its ad_id; not_allowed for anyone but the owner (has_permission ads), with nothing kept.';
