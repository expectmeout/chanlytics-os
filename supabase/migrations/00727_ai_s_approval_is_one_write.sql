-- 00727 · AI's approval is one write, a Stop is heard inside it, and a swap waits its turn (the outside review of
-- 28 Nov 2026, R3.1, R3.6 and R3.7; lane 5 of the whole-system plan).
--
-- An owner's approval became one write on 24 Nov (00713 post_approve_whole). AI's, under the owner's rung, was still
-- written in pieces: readying a week's placement overnight kept the words on the made picture hours before the 8:00
-- approval placed it, so a week stopped in between kept them. Readying now writes nothing; the approval it answers
-- carries its facts (claims), its words (words) and how the made picture's words stood (stood), and the door that
-- places it keeps them with the placement, or keeps nothing.
--
--   plan_slot_place        re-made from 00714's body. New: refused while everything is stopped (fate stopped), read on
--                          a lock Stop everything's own write waits for; the workspace's posts lock taken before any
--                          post is read; an approval that says how the picture's words stood is held to it (fate
--                          changed where they moved); its claims, its words (piece_words_keep, and files.made's
--                          caption) and the placement in one transaction. An approval with none of the three places as
--                          before.
--   content_week_approve   re-made from 00723's body. New: as the service, Stop everything is read inside the approval
--                          (fate paused, the week let go as a week that asks is).
--   post_approve_whole     re-made from 00713's body. New: the workspace's posts lock taken before the posts the owner
--                          saw are read, so no post of the piece is added between the look and the swap.
--
-- No table, column, grant or job kind changes. Old arguments keep working, so either app may deploy first.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------- 1. plan_slot_place -- */

create or replace function public.plan_slot_place(p_tenant_id uuid, p_slot_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot    public.plan_slots;
  v_place   jsonb := p_approval -> 'placements' -> 0;
  v_placed  jsonb;
  -- 00727: what a readied approval carries to be kept with its placement, and what is read inside the write.
  v_words   text := nullif(btrim(p_approval ->> 'words'), '');
  v_claims  jsonb := case when jsonb_typeof(p_approval -> 'claims') = 'array' then p_approval -> 'claims' else '[]'::jsonb end;
  v_claim   jsonb;
  v_claimed uuid;
  v_made    jsonb;
  v_paused  timestamptz;
  v_refused boolean := false;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service places a slot of a week.' using errcode = '42501';
  end if;
  select * into v_slot from public.plan_slots s where s.tenant_id = p_tenant_id and s.id = p_slot_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone', 'posts', '[]'::jsonb);
  end if;
  -- One post a slot: placed already, begun as a video, or no longer approved, it takes nothing. So a making asked twice,
  -- or two at once, place a slot once.
  if v_slot.state <> 'approved' or v_slot.post_id is not null or v_slot.piece_id is not null then
    return jsonb_build_object('fate', 'taken', 'post_id', v_slot.post_id, 'posts', '[]'::jsonb);
  end if;
  -- Only under the rung's own approval: a slot its owner approved by hand (Try again) is placed by that press.
  if not exists (select 1 from public.approvals a
                  where a.tenant_id = p_tenant_id and a.id = v_slot.approval_id and a.approved_by is null
                    and a.voided_at is null and a.snapshot -> 'rung' ->> 'class' = 'plan_approve') then
    return jsonb_build_object('fate', 'taken', 'post_id', null, 'posts', '[]'::jsonb);
  end if;
  -- The slot's own placement and no other: where, as what and when it stands on the week.
  if jsonb_typeof(p_approval -> 'placements') is distinct from 'array' or jsonb_array_length(p_approval -> 'placements') <> 1
     or v_place ->> 'place' is distinct from v_slot.place or v_place ->> 'kind' is distinct from v_slot.kind
     or (v_place ->> 'at')::timestamptz is distinct from v_slot.at then
    return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
  end if;
  -- Never late: a slot whose time has come is not posted now in its place.
  if v_slot.at <= now() then
    return jsonb_build_object('fate', 'past', 'posts', '[]'::jsonb);
  end if;
  -- 00727: Stop everything is read here, inside the write, on a lock its own write waits for (workspace_sending_stop
  -- takes the row for update). Pressed first, nothing is placed; pressed after, the placement was made before it, and the
  -- send's own check holds it while everything is stopped.
  select t.sending_stopped_at into v_paused from public.tenants t where t.id = p_tenant_id for share;
  if v_paused is not null then
    return jsonb_build_object('fate', 'stopped', 'posts', '[]'::jsonb);
  end if;
  -- 00727: the workspace's posts lock before any post is read or written (post_approve takes the same one, and an
  -- owner's press takes it first too, post_approve_whole): one order of locks for every approval.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  -- 00727: held to what stands now. An approval readied ahead says how the made picture's words stood then
  -- (stood.caption). Words on it now that are neither those nor the ones this approval keeps (another slot of the same
  -- picture, placed a moment before) are somebody's since: not what was readied, and nothing is written.
  select f.made into v_made from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if jsonb_typeof(p_approval -> 'stood') = 'object'
     and (v_made ->> 'caption') is distinct from (p_approval -> 'stood' ->> 'caption')
     and (v_words is null or (v_made ->> 'caption') is distinct from v_words) then
    return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
  end if;
  begin
    -- A fact the approval carries, kept as the owner's claim until its day ends (00706 owner_claims), with its event:
    -- owner_claims_keep's own write, for an approval nobody is signed in to make.
    for v_claim in select * from jsonb_array_elements(v_claims) loop
      insert into public.owner_claims (tenant_id, kind, text, source, valid_until)
      values (p_tenant_id, v_claim ->> 'kind', btrim(v_claim ->> 'text'), v_claim ->> 'source',
              nullif(v_claim ->> 'valid_until', '')::date)
      returning id into v_claimed;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'owner_claim.kept', 'setup', 'workspace', p_tenant_id,
              jsonb_build_object('claim_id', v_claimed, 'claim', v_claim ->> 'kind', 'source', v_claim ->> 'source'));
    end loop;
    -- The words that go, the piece's own from now on (00681 piece_words_keep) and on how the picture was made
    -- (files.made, where Details and AI's card read them): only where the picture does not say them already.
    if v_words is not null and (v_made ->> 'caption') is distinct from v_words then
      perform public.piece_words_keep(p_tenant_id, p_file_id, v_words);
      update public.files f set made = jsonb_set(f.made, '{caption}', to_jsonb(v_words)), updated_at = now()
       where f.tenant_id = p_tenant_id and f.id = p_file_id and f.source = 'made' and f.kind <> 'video'
         and f.removed_at is null and jsonb_typeof(f.made) = 'object';
    end if;
    v_placed := public.post_approve(p_tenant_id, p_file_id, p_approval);
    if v_placed ->> 'fate' is distinct from 'approved' then
      v_refused := true;
      raise exception 'not approved' using errcode = 'P0001';
    end if;
    update public.plan_slots set post_id = (v_placed -> 'posts' -> 0 ->> 'post_id')::uuid, updated_at = now()
     where id = v_slot.id;
  exception when raise_exception then
    -- Only this door's own refusal is an answer: the facts and the words go with it. Any other is raised as it came.
    if not v_refused then
      raise;
    end if;
    return v_placed;
  end;
  return v_placed;
end $$;

comment on function public.plan_slot_place(uuid, uuid, uuid, jsonb) is
  'A slot of a week AI approved placed (00714), by the service: its post approved via rung (post_approve) and the slot linked to it in one transaction, only for a slot still approved under the rung''s own approval with no post and no video, and only its own placement (its place, kind and time as they stand, a time still ahead). 00727: the approval kept whole or not at all. Beside post_approve''s keys it may carry claims [{kind, text, source, valid_until}] (kept as owner_claims with their event), words (piece_words_keep, and the made picture''s own caption) and stood {caption}: how the made picture''s words stood when the approval was readied. Words on it now that are neither those nor this approval''s own answer changed. Refused while everything is stopped (tenants.sending_stopped_at, read on a lock the stop''s own write waits for). Answers post_approve''s answer, or {fate: taken | changed | past | gone | stopped} with nothing written. One post a slot, however often it is asked.';

/* --------------------------------------------------------------------------------- 2. content_week_approve -- */

create or replace function public.content_week_approve(p_tenant_id uuid, p_plan_id uuid, p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  -- 00714: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_plan      public.content_plans;
  v_wanted    jsonb := coalesce(p_snapshot -> 'slots', '[]'::jsonb);
  v_matching  integer;
  v_approval  uuid;
  v_rung      text;
  v_slot      public.plan_slots;
  v_placed    jsonb;
  v_left      timestamptz;
  v_put       integer := 0;
  v_snapshot  jsonb := p_snapshot;
  -- 00727: Stop everything, read inside the approval.
  v_paused    timestamptz;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'ready' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  -- AI approves only a week held to a time that has come, not stopped, under a rung that still holds or sends it.
  if v_service then
    if v_plan.stopped_at is not null then
      return jsonb_build_object('fate', 'stopped');
    end if;
    if v_plan.goes_at is null or v_plan.goes_at > now() + interval '1 minute' then
      return jsonb_build_object('fate', 'held');
    end if;
    -- 00727: AI approves nothing while everything is stopped, and the stop is read here, inside the approval, on a
    -- lock its own write waits for (workspace_sending_stop takes the row for update): pressed first, the week is let go
    -- and waits for its owner's press; pressed after, the week was approved before it, and each post's own send holds it.
    select t.sending_stopped_at into v_paused from public.tenants t where t.id = p_tenant_id for share;
    if v_paused is not null then
      update public.content_plans set goes_at = null, make_queued_at = null where id = v_plan.id;
      return jsonb_build_object('fate', 'paused');
    end if;
    select p.mode into v_rung from public.policies p
     where p.tenant_id = p_tenant_id and p.class = 'plan_approve' and p.subject_type is null;
    if v_rung is null or v_rung not in ('veto', 'auto') then
      update public.content_plans set goes_at = null, make_queued_at = null where id = v_plan.id;
      return jsonb_build_object('fate', 'asks');
    end if;
    v_snapshot := p_snapshot || jsonb_build_object('rung', jsonb_build_object('class', 'plan_approve', 'mode', v_rung));
  end if;
  if jsonb_typeof(v_wanted) <> 'array' or jsonb_array_length(v_wanted) = 0 then
    return jsonb_build_object('fate', 'nothing');
  end if;
  -- Every slot the snapshot names is this plan's, still proposed, and as the snapshot says it.
  select count(*) into v_matching
    from jsonb_array_elements(v_wanted) w
    join public.plan_slots s on s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (w ->> 'id')::uuid
   where s.state = 'proposed' and s.place = w ->> 'place' and s.kind = w ->> 'kind'
     and s.at = (w ->> 'at')::timestamptz and s.file_id is not distinct from nullif(w ->> 'file_id', '')::uuid;
  if v_matching <> jsonb_array_length(v_wanted) then
    return jsonb_build_object('fate', 'changed');
  end if;
  insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by)
  values (p_tenant_id, 'plan', p_plan_id, v_snapshot, public.approval_hash(v_snapshot), v_actor)
  returning id into v_approval;
  update public.plan_slots s set state = 'approved', approval_id = v_approval, updated_at = now()
    from jsonb_array_elements(v_wanted) w
   where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (w ->> 'id')::uuid;
  -- 00714: a held week its owner approves by their own press leaves AI's making queue: that press makes it.
  update public.content_plans set status = 'approved', approval_id = v_approval, approved_at = now(),
                                  approved_by = v_actor, make_queued_at = null
   where id = p_plan_id;
  -- 00714: under the rung, each slot prepared ahead is placed now, in this transaction, as its own approval of the
  -- bytes and words drawn for it (plan_slot_place: one post a slot), only while its time and its footage stand as they
  -- were prepared and its time is more than five minutes off. What is not placed is made in turn after, the week queued
  -- for it, its earliest slot first.
  if v_service then
    for v_slot in
      select s.* from public.plan_slots s
       where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.approval_id = v_approval
         and s.prepared is not null and s.post_id is null
         and (s.prepared ->> 'at')::timestamptz = s.at and s.at > now() + interval '5 minutes'
         and (s.prepared ->> 'from')::uuid is not distinct from s.file_id
       order by s.at
    loop
      begin
        v_placed := public.plan_slot_place(p_tenant_id, v_slot.id, (v_slot.prepared ->> 'file_id')::uuid,
                                           v_slot.prepared -> 'approval');
      exception when others then
        v_placed := jsonb_build_object('fate', 'refused');
      end;
      if v_placed ->> 'fate' = 'approved' then
        v_put := v_put + 1;
      end if;
    end loop;
    select min(s.at) into v_left from public.plan_slots s
     where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.approval_id = v_approval
       and s.post_id is null and s.piece_id is null;
    update public.content_plans
       set make_queued_at = case when v_left is null then null else now() end, first_post_at = v_left,
           made_at = case when v_left is null then now() end, make_tries = 0,
           -- A preparing still under way keeps its place until it is said done; a finished pass holds none.
           making_since = case when made_at is null then making_since end
     where id = p_plan_id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', p_plan_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'approved', 'slots', v_matching, 'placed', v_put, 'by', v_actor)));
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'slots', v_matching, 'placed', v_put);
end $$;

comment on function public.content_week_approve(uuid, uuid, jsonb) is
  'Approve the week (00706; the content loop PRD''s 8.4, canvas call 10), by a member with the settings permission: the snapshot''s slots ({slots: [{id, place, kind, at, file_id, title, intent}]}), each this plan''s, still proposed and as named, go under one approval of subject plan with its hash; a blocked slot or one asking for footage stays. 00714: or by the service at a held week''s time (goes_at reached, not stopped) under a plan_approve rung that still holds or sends it, read again here; nobody is its approver, the rung rides on its snapshot, each slot prepared ahead is placed in the same transaction (plan_slot_place) and the week is queued for what is left; a member''s own approval takes a held week out of that queue. 00727: the service approves nothing while everything is stopped (tenants.sending_stopped_at, read here on a lock the stop''s own write waits for): the week is let go and answers paused. Answers {fate: approved, approval_id, slots, placed} or {fate: gone | changed | nothing | asks | held | stopped | paused | <status>}.';

/* ----------------------------------------------------------------------------------- 3. post_approve_whole -- */

create or replace function public.post_approve_whole(p_tenant_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_replace  boolean := coalesce((p_approval ->> 'replace')::boolean, false);
  v_expected uuid[];
  v_waiting  uuid[];
  v_claim    jsonb;
  v_answer   jsonb;
  v_refused  boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- 00727: the workspace's posts lock, before the posts the owner saw are read (post_approve takes the same one, so
  -- does a slot AI places): nothing of the piece is added between that read and the swap, and a press that waited here
  -- reads what the one before it left.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  -- A version set in place of the posts still waiting: those the owner saw, held still until the swap is made. Where
  -- one has begun to send, or another is waiting now, it is not what they approved.
  if v_replace then
    v_expected := array(select e::uuid from jsonb_array_elements_text(coalesce(p_approval -> 'expected', '[]'::jsonb)) e
                         order by 1);
    select coalesce(array_agg(w.id order by w.id), '{}'::uuid[]) into v_waiting
      from (select p.id from public.posts p
             where p.tenant_id = p_tenant_id and p.place <> 'hand'
               and p.status = any (array['queued', 'preparing', 'held'])
               and (p.id = any (v_expected)
                    or p.piece_id in (select q.piece_id from public.posts q
                                       where q.tenant_id = p_tenant_id and q.id = any (v_expected)))
             for update) w;
    if cardinality(v_expected) = 0 or v_waiting is distinct from v_expected then
      return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
    end if;
  end if;
  begin
    -- A fact the owner stated, kept as their own claim until its day ends (00706).
    for v_claim in select * from jsonb_array_elements(coalesce(p_approval -> 'claims', '[]'::jsonb)) loop
      perform public.owner_claims_keep(p_tenant_id, v_claim);
    end loop;
    -- The words that go, the piece's own from now on, and its other posts still waiting with them (00681).
    if nullif(btrim(p_approval ->> 'words'), '') is not null then
      perform public.piece_words_keep(p_tenant_id, p_file_id, p_approval ->> 'words');
    end if;
    if v_replace then
      v_answer := public.piece_posts_replace(p_tenant_id, p_file_id, p_approval);
    else
      v_answer := public.post_approve(p_tenant_id, p_file_id, p_approval);
    end if;
    if v_answer ->> 'fate' is distinct from 'approved' then
      v_refused := true;
      raise exception 'not approved' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    -- Only this door's own refusal is an answer: the facts and the words go with it. Any other is raised as it came.
    if not v_refused then
      raise;
    end if;
    return v_answer;
  end;
  return v_answer;
end $$;

comment on function public.post_approve_whole(uuid, uuid, jsonb) is
  'A member''s press, with the settings permission (00713; the outside audit''s 4.2 and 4.3): an approval kept whole or not at all. p_approval is post_approve''s, with claims [{kind, text, source, valid_until}] (owner_claims_keep), words (piece_words_keep, where there are words), replace (piece_posts_replace in place of post_approve) and, with replace, expected: the ids of the posts still waiting that the owner saw, held still while they are swapped. 00727: the workspace''s posts lock is taken first (post_approve''s own), so nothing of the piece is added between that read and the swap, and of two presses at once the second reads what the first left. The posts are compared by id: one whose time or words moved since the owner looked is replaced all the same, since it is being replaced. Answers the approving door''s answer; a refusal keeps nothing, and a set of waiting posts that moved since is {fate: changed}.';
