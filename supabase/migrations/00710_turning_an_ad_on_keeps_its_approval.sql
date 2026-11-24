-- 00710 · Turning an ad on keeps its approval (the content loop PRD v3.6, pass 6: "Turn on writing an approvals row";
-- its 3.3 and 5.3; the Ads PRD's join 6: one approval model for a post and an ad).
--
--   ad_turn_on   Re-made with one change: where the press sends what the owner approved as a snapshot (p_ad.approval:
--                the photo by its file and the SHA-256 of its bytes, the words by version, where it shows and the chat
--                it opens, the most it can cost and its last day, the area or the circle), it is kept in `approvals`
--                with subject `ad`, its hash taken here by approval_hash (00681), in the same transaction as the ad, the
--                decision (which names the approval) and the event. The answer names the approval. A press that sends
--                none keeps none, and is answered as before.
--
-- The edge reads the photo's bytes again right before its launch sends them, and sends none whose checksum is not the
-- approved one (apps/edge/lib/ads/launch.ts). Nothing here calls the platform.
--
-- Locks: re-making a function takes none a writer waits on. Deploy order: either. Code ahead of this file sends a
-- snapshot the old door does not read (no approval kept, nothing refused); this file ahead of the code keeps none until
-- the code sends one. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.ad_turn_on(
  p_tenant_id uuid, p_actor uuid, p_key uuid, p_draft_at timestamptz, p_ad jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.ad_accounts;
  v_draft   public.ad_drafts;
  v_same    public.ads;
  v_ad      uuid;
  v_name    text;
  v_total   bigint;
  v_ends    timestamptz;
  v_due     timestamptz;
  v_asked   integer;
  v_approval uuid;
begin
  if p_key is null or p_ad is null or jsonb_typeof(p_ad) <> 'object' or jsonb_typeof(p_ad -> 'approved') <> 'object' then
    raise exception 'ad_turn_on: a key, and the ad with what was approved' using errcode = '22023';
  end if;
  -- The owner alone turns an ad on (0050, call 2): asked here again, whoever knocked.
  if not coalesce(public.has_permission(p_actor, p_tenant_id, 'ads'), false) then
    return jsonb_build_object('outcome', 'not_allowed');
  end if;
  -- The same press twice is answered once: the ad the first one made, wherever it has got to.
  select * into v_same from public.ads a
   where a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.launch ->> 'key' = p_key::text;
  if found then
    return jsonb_build_object('outcome', 'same', 'ad_id', v_same.id, 'status', v_same.status);
  end if;
  select * into v_account from public.ad_accounts a
   where a.tenant_id = p_tenant_id and a.platform = 'meta' and a.status = 'connected'
   for update;
  if not found or v_account.external_id is null or v_account.currency is null then
    return jsonb_build_object('outcome', 'not_connected');
  end if;
  -- While AI is stopped, no ad is turned on (0050, call 11): nobody would answer the people it brings.
  if exists (select 1 from public.tenants t where t.id = p_tenant_id and t.sending_stopped_at is not null) then
    return jsonb_build_object('outcome', 'stopped');
  end if;
  -- One launch an account at a time: the platform takes few calls an account, and the job makes one after another.
  if exists (select 1 from public.ads a
              where a.tenant_id = p_tenant_id and a.account_id = v_account.id and a.status = 'sending') then
    return jsonb_build_object('outcome', 'busy');
  end if;
  -- The draft the press judged, as it was then: one changed since, or already turned on, is not this press's.
  select * into v_draft from public.ad_drafts d where d.tenant_id = p_tenant_id for update;
  if not found or v_draft.account_id <> v_account.id or v_draft.updated_at is distinct from p_draft_at then
    return jsonb_build_object('outcome', 'stale');
  end if;

  v_name := nullif(left(btrim(coalesce(p_ad ->> 'name', '')), 500), '');
  v_total := nullif(p_ad ->> 'total_minor', '')::bigint;
  v_ends := nullif(p_ad ->> 'ends_at', '')::timestamptz;
  if v_name is null or v_total is null or v_total <= 0 or v_ends is null or v_ends <= now() then
    raise exception 'ad_turn_on: a name, a total and an end still ahead' using errcode = '22023';
  end if;

  insert into public.ads (
    tenant_id, account_id, platform, origin, name, door, status, intent, intent_at, told_at,
    budget_kind, budget_minor, budget_left_minor, budget_at, budget_shared, ends_at, approved, launch, shown_on, said
  )
  values (
    p_tenant_id, v_account.id, 'meta', 'chanlytics', v_name, 'whatsapp', 'sending', 'on', now(), now(),
    'total', v_total, v_total, 'set', false, v_ends, p_ad -> 'approved',
    jsonb_build_object('key', p_key::text, 'step', 'make', 'since', now()),
    case when jsonb_typeof(p_ad -> 'shown_on') = 'array'
         then array(select jsonb_array_elements_text(p_ad -> 'shown_on')) end,
    case when jsonb_typeof(p_ad -> 'said') = 'object' then p_ad -> 'said' end
  )
  returning id into v_ad;
  -- The draft is the ad now: New ad opens on a fresh one, and a draft left for the owner has been seen to.
  delete from public.ad_drafts d where d.id = v_draft.id;
  update public.notifications n
     set closed_at = now()
   where n.tenant_id = p_tenant_id and n.kind = 'ad_draft' and n.closed_at is null;

  -- What the owner approved, kept as an approval (the content loop PRD's 3.3 and 5.3; the Ads PRD's join 6): the same
  -- record a post's approval is, its hash taken here. A press from a build that sends none keeps none.
  if jsonb_typeof(p_ad -> 'approval') = 'object' then
    insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by)
    values (p_tenant_id, 'ad', v_ad, p_ad -> 'approval', public.approval_hash(p_ad -> 'approval'), p_actor)
    returning id into v_approval;
  end if;

  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (p_tenant_id, 'ad', v_ad, 'turn_on_ad', 'user', p_actor,
          jsonb_build_object('platform', 'meta', 'name', v_name, 'total_minor', v_total,
                             'currency', v_account.currency, 'ends_at', v_ends,
                             'declared', coalesce(p_ad -> 'approved' -> 'declared', '"none"'::jsonb),
                             'approval_id', v_approval));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'ad.turned_on', 'ads', 'ad', v_ad,
          jsonb_build_object('platform', 'meta', 'name', v_name, 'by', p_actor, 'total_minor', v_total,
                             'ends_at', v_ends));

  -- The account's job, at once (and never before the platform allows a call): the launch is its first work.
  if not exists (select 1 from public.job_kinds k where k.kind = 'ad_read' and k.paused_at is not null) then
    v_due := greatest(now(), coalesce(v_account.read_after, '-infinity'::timestamptz));
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'ad_read', v_due, jsonb_build_object('account_id', v_account.id::text))
    on conflict do nothing;
    get diagnostics v_asked = row_count;
    if v_asked = 0 then
      update public.jobs j
         set due_at = v_due, updated_at = now()
       where j.tenant_id = p_tenant_id and j.kind = 'ad_read' and j.state = 'scheduled'
         and j.payload ->> 'account_id' = v_account.id::text and j.due_at > v_due;
    end if;
  end if;
  return jsonb_build_object('outcome', 'kept', 'ad_id', v_ad, 'status', 'sending', 'approval_id', v_approval);
end $$;

revoke all on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) to service_role;
comment on function public.ad_turn_on(uuid, uuid, uuid, timestamptz, jsonb) is
  'Service-role only: an owner turns an ad on (00666, 00710; decision 0050, calls 3 and 5). The workspace''s kept draft, as the press judged it (p_draft_at, its updated_at then), becomes an ad made here: status sending, intent on, its total and end, what was approved, where it shows and its first words, and the launch''s key. In one transaction: the draft goes, a draft left for the owner stops waiting on the bell, the decision (turn_on_ad) and the event (ad.turned_on) are written, the approval (00710: p_ad.approval, where the press sends one, kept in approvals with subject ad and its hash taken by approval_hash, its id on the decision) and the account''s job (ad_read, which launches first) is asked for at once. Answers outcome: kept with the ad''s id and its approval''s; same with the ad a press of this key made; not_allowed for anyone but the owner (has_permission ads, asked here); not_connected; stopped while AI is stopped (tenants.sending_stopped_at); busy while another ad of the account is being set up; stale where the draft changed since, or was turned on already.';
