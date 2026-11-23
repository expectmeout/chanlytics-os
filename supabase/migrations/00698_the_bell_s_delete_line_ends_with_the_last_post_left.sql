-- 00698 · The bell's delete line ends with the last post left to its owner (the content loop PRD v3.5, section 8.3).
--
-- Where a place will not take a post down for Chanlytics, the bell says once "Delete it in Instagram · <the piece>".
-- That line is about a piece at a place, and a piece can have two posts there: a post and a story. Since 00689 "Keep
-- it up" closed the line at its first press, while the other post was still the owner's to delete; and a post
-- deleted by hand beside one kept up never closed it, since the news that closes it ("Taken down") is said only once
-- every post of the piece is down. Nobody had pressed Keep it up when this was written.
--
--   post_by_hand_bell_settle  New, and nobody's to call from outside: the line for a piece at a place is closed once
--                             no post of the piece that is up there has a newest take-down a place left to its owner.
--                             One still being asked does not hold it: its own refusal rings anew.
--   post_take_down_keep       Re-made from 00689's: it asks that, where it closed the line itself.
--   post_take_down_settle     Re-made from 00682's: a done asks it too.
--
-- Nothing else changes in either door. Locks: none on a table. Three seconds and no more. Re-runnable. Deploy order:
-- either; the code calls both doors as it did.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------- 0. post_by_hand_bell_settle -- */

create or replace function public.post_by_hand_bell_settle(p_tenant_id uuid, p_file_id uuid, p_place text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_closed integer := 0;
begin
  -- Still the owner's to delete at this place: a post of the piece that is up there, whose newest take-down a place
  -- left to them.
  if exists (
    select 1 from public.posts q
     where q.tenant_id = p_tenant_id and q.file_id = p_file_id and q.place = p_place and q.status = 'published'
       and (select r.outcome from public.remediation_actions r
             where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = q.id and r.act = 'take_down'
             order by r.started_at desc, r.id desc
             limit 1) = any (array['blocked', 'not_possible', 'needs_person'])
  ) then
    return 0;
  end if;
  -- The line as apps/edge post-told.ts writes it, about the file: its words are contracts TAKE_DOWN_BELL.byHand, which
  -- a test holds to this literal; a place the bell has no name for closes nothing.
  update public.notifications n set closed_at = now()
   where n.tenant_id = p_tenant_id and n.kind = 'post_by_hand'
     and n.subject_type = 'file' and n.subject_id = p_file_id::text
     and n.closed_at is null
     and n.title like 'Delete it in '
                      || case p_place when 'instagram' then 'Instagram' when 'google' then 'Google' end
                      || ' · %';
  get diagnostics v_closed = row_count;
  return v_closed;
end $$;
revoke all on function public.post_by_hand_bell_settle(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_by_hand_bell_settle(uuid, uuid, text) to service_role;
comment on function public.post_by_hand_bell_settle(uuid, uuid, text) is
  'The bell''s "Delete it in <place>" line for a piece at a place, ended once nothing of the piece there is left to its owner (00698; the content loop PRD''s 8.3): no post of it up there has a newest take-down a place left to them. Asked by post_take_down_keep and by a done of post_take_down_settle; nobody''s to call from outside. Answers how many lines it closed.';

/* ---------------------------------------------------------------------------------- 1. post_take_down_keep -- */

create or replace function public.post_take_down_keep(p_tenant_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
  v_post public.posts;
  v_answer jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_post from public.posts p where p.tenant_id = p_tenant_id and p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  -- The newest take-down of this post: the one a press on its line speaks of.
  select * into v_action from public.remediation_actions r
   where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = p_post_id and r.act = 'take_down'
   order by r.started_at desc, r.id desc
   limit 1
     for update;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  if v_action.outcome = 'done' then
    return jsonb_build_object('fate', 'done');
  end if;
  -- Still being asked: there is nothing the place left to the owner yet.
  if v_action.outcome = 'pending' then
    return jsonb_build_object('fate', 'asking');
  end if;
  v_answer := jsonb_build_object('fate', 'left_up', 'post_id', v_post.id, 'file_id', v_post.file_id,
                                 'place', v_post.place);
  -- Said once: a second press, or a second owner's, keeps the first one's name and time.
  if v_action.outcome = 'left_up' then
    return v_answer;
  end if;
  if v_post.status is distinct from 'published' then
    return jsonb_build_object('fate', 'not_up');
  end if;
  -- Every ask of this post that a place left to the owner is answered by the owner's word: the newest, and any older
  -- take-down of it that was never finished (Take down pressed again before the first was deleted by hand). Nothing
  -- of this post is then left for Today to name. Their remediations are finished already: each was, the moment its
  -- place answered (post_take_down_settle), and an action that is not pending never holds one open.
  update public.remediation_actions r
     set outcome = 'left_up', finished_at = now(), left_up_by = auth.uid()
   where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = p_post_id and r.act = 'take_down'
     and r.outcome = any (array['blocked', 'not_possible', 'needs_person']);
  -- The bell's line for this piece at this place ends, for every device, once nothing of the piece there is left to
  -- its owner (00698): a story of it still to delete keeps the line.
  perform public.post_by_hand_bell_settle(p_tenant_id, v_post.file_id, v_post.place);
  return v_answer;
end $$;
revoke all on function public.post_take_down_keep(uuid, uuid) from public, anon;
grant execute on function public.post_take_down_keep(uuid, uuid) to authenticated, service_role;
comment on function public.post_take_down_keep(uuid, uuid) is
  'A member''s door, with the settings permission (00689; the content loop PRD''s 8.3): "Keep it up", of a post still up whose newest take-down a place left to the owner. The action says left_up, with who and when, as does any older take-down of that post a place left to the owner; the bell''s line for that piece at that place closes once nothing of the piece there is left to its owner (00698), and nothing is asked of the place: the post stays up until Take down is pressed again. Answers {fate: left_up (with post_id, file_id, place; also where it was said already), asking (the place has not answered), done (it came down), not_up (the post is no longer up), unknown}.';

/* -------------------------------------------------------------------------------- 2. post_take_down_settle -- */

create or replace function public.post_take_down_settle(p_action_id uuid, p_outcome text, p_said text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
  v_file uuid;
  v_place text;
  v_places jsonb;
begin
  if p_outcome not in ('done', 'blocked', 'not_possible', 'needs_person') then
    raise exception 'post_take_down_settle: an outcome a place can give' using errcode = '22023';
  end if;
  select * into v_action from public.remediation_actions r
   where r.id = p_action_id and r.target_type = 'post' and r.act = 'take_down'
     for update;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  -- Settled once: a second answer for an action already settled changes nothing (a job run twice).
  if v_action.outcome <> 'pending' then
    return jsonb_build_object('fate', 'settled', 'outcome', v_action.outcome);
  end if;
  update public.remediation_actions r
     set outcome = p_outcome, said = nullif(left(btrim(coalesce(p_said, '')), 300), ''), finished_at = now()
   where r.id = v_action.id;
  if p_outcome = 'done' then
    update public.posts p set status = 'taken_down', held_reason = null, held_why = null, updated_at = now()
     where p.tenant_id = v_action.tenant_id and p.id = v_action.target_id
       and p.status = any (array['published', 'publishing', 'checking']);
  end if;
  update public.remediations m set finished_at = now()
   where m.id = v_action.remediation_id and m.finished_at is null
     and not exists (select 1 from public.remediation_actions x
                      where x.remediation_id = m.id and x.outcome = 'pending');
  select p.file_id, p.place into v_file, v_place from public.posts p
   where p.tenant_id = v_action.tenant_id and p.id = v_action.target_id;
  -- Gone from its place: where nothing else of the piece there is left to its owner, the bell's line for it ends
  -- (00698). A post of the piece kept up beside it never says the piece is down, so no other news would end it.
  if p_outcome = 'done' then
    perform public.post_by_hand_bell_settle(v_action.tenant_id, v_file, v_place);
  end if;
  -- The piece is down once every place this take-down asked for it says done: those places, for the bell's one line.
  select jsonb_agg(distinct q.place) into v_places
    from public.remediation_actions x
    join public.posts q on q.tenant_id = x.tenant_id and q.id = x.target_id
   where x.remediation_id = v_action.remediation_id and x.target_type = 'post' and x.act = 'take_down'
     and q.file_id = v_file
  having bool_and(x.outcome = 'done');
  return jsonb_build_object('fate', 'kept', 'outcome', p_outcome, 'post_id', v_action.target_id,
                            'tenant_id', v_action.tenant_id, 'file_id', v_file, 'place', v_place, 'down', v_places);
end $$;
revoke all on function public.post_take_down_settle(uuid, text, text) from public, anon, authenticated;
grant execute on function public.post_take_down_settle(uuid, text, text) to service_role;
comment on function public.post_take_down_settle(uuid, text, text) is
  'The take-down job''s door (00682; the content loop PRD''s 8.3): what a place said of one action, kept once. done marks the post taken_down, and only done does; blocked (the place refused), not_possible and needs_person (done by hand there) keep the place''s own words. A remediation is finished once none of its actions is pending. Answers {fate: kept, settled (it was already), unknown; outcome; post_id; tenant_id; file_id and place, the post''s; down, the places the piece came down from once every one this take-down asked says done, else null}. Since 00698 a done also ends the bell''s line for the piece at that place, where nothing else of it there is left to its owner.';
