-- 00688 · A post stays up on the owner's word (the content loop PRD v3.5, section 8.3: "Keep it up", taken on
-- 23 November 2026).
--
-- Where a place would not take a post down for Chanlytics, the delete is the owner's: the piece says so, the bell says
-- so once, and Today names the piece until the place shows the post gone (00682). An owner who then decides to leave
-- the post up had no way to say so: the reminder stood for ever, and the record read as a take-down nobody finished.
--
--   remediation_actions       One outcome more, left_up: the place left the delete to the owner, and the owner chose
--                             to leave the post up. One column, left_up_by: who said so. When is finished_at, as for
--                             every outcome that is not pending. The place's own words stay in `said`.
--                             Today's index of the take-downs not finished leaves out a post left up, as it leaves
--                             out one taken down.
--   post_take_down_keep       A member's door (settings): "Keep it up", of a post still up whose newest take-down a
--                             place left to the owner. The action says left_up, with who and when, and so does any
--                             older take-down of that post a place left to the owner and nobody finished; the bell's
--                             line for that piece at that place closes; no job is made, so nothing is asked of the
--                             place. The post is still up, and Take down starts a new take-down as before.
--   post_take_down_by_hand    Re-made with one answer more: an "I deleted it" of a post left up asks nothing of the
--                             place and answers left_up. A page that had not heard cannot undo the owner's word.
--
-- post_take_down_settle is not touched: left_up is no answer a place can give, and it refuses it as it stands. The walk
-- that begins a take-down (posts_take_down_start) holds back only for an action still pending, so a post left up can be
-- asked down again.
--
-- Locks: the outcome check is re-made on remediation_actions (a brief ACCESS EXCLUSIVE, and a read of its rows to hold
-- them to it: a few rows a take-down), one nullable column with no default, one check, one small index made and one
-- re-made. Three seconds each and no more. Re-runnable. Deploy order: this file first, then the code: the page before
-- it never sends the new press, so no row says left_up until the page is new; its read of Today's take-downs asks for
-- every one not done, which the re-made index no longer answers by itself, over a table of a few rows a take-down.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------- 0. the record -- */

alter table public.remediation_actions drop constraint if exists remediation_actions_outcome_check;
alter table public.remediation_actions add constraint remediation_actions_outcome_check
  check (outcome = any (array['done', 'pending', 'blocked', 'not_possible', 'needs_person', 'left_up']));

alter table public.remediation_actions
  add column if not exists left_up_by uuid references auth.users (id) on delete set null;
create index if not exists remediation_actions_left_up_by
  on public.remediation_actions (left_up_by) where left_up_by is not null;

-- Who is named only on an action that says left_up. A member who leaves is forgotten here (set null): the choice stays.
alter table public.remediation_actions drop constraint if exists remediation_actions_left_up_by;
alter table public.remediation_actions add constraint remediation_actions_left_up_by
  check (left_up_by is null or outcome = 'left_up');

-- Today's index of the take-downs not finished (00682) leaves out a post left up, as it leaves out one taken down:
-- its reader asks for neither, in these words, so the few rows it reads are the ones somebody still waits on.
drop index if exists public.remediation_actions_take_downs_open;
create index if not exists remediation_actions_take_downs_open
  on public.remediation_actions (tenant_id, started_at desc)
  where act = 'take_down' and outcome <> 'done' and outcome <> 'left_up';

comment on column public.remediation_actions.left_up_by is
  'Who chose to leave the post up, on an action that says left_up (00688; the content loop PRD''s 8.3, "Keep it up"). When is finished_at. Null on every other action, and once that member is gone.';
comment on table public.remediation_actions is
  'One action a remediation started on one thing it reached (00676; the content loop PRD''s 5.3 and 8.3): cancel, pause or take down a post, an ad or a waiting post; its outcome, pending until the place says (done, blocked, not_possible, needs_person), with the place''s own words; when Chanlytics started it and when the place confirmed it, kept apart. An ad''s is settled by ads_settle_remediation as its row learns what the platform holds. A post a place left to its owner to delete, which the owner chose to leave up, says left_up, with who (00688). Members read.';

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
  -- The bell's line for this piece at this place (apps/edge post-told.ts: "Delete it in Instagram · <the piece>",
  -- about the file) is closed here, for every device. Its words are contracts TAKE_DOWN_BELL.byHand, which a test
  -- holds to this literal; a place the bell has no name for closes nothing.
  update public.notifications n set closed_at = now()
   where n.tenant_id = p_tenant_id and n.kind = 'post_by_hand'
     and n.subject_type = 'file' and n.subject_id = v_post.file_id::text
     and n.closed_at is null
     and n.title like 'Delete it in '
                      || case v_post.place when 'instagram' then 'Instagram' when 'google' then 'Google' end
                      || ' · %';
  return v_answer;
end $$;
revoke all on function public.post_take_down_keep(uuid, uuid) from public, anon;
grant execute on function public.post_take_down_keep(uuid, uuid) to authenticated, service_role;
comment on function public.post_take_down_keep(uuid, uuid) is
  'A member''s door, with the settings permission (00688; the content loop PRD''s 8.3): "Keep it up", of a post still up whose newest take-down a place left to the owner. The action says left_up, with who and when, as does any older take-down of that post a place left to the owner; the bell''s line for that piece at that place closes, and nothing is asked of the place: the post stays up until Take down is pressed again. Answers {fate: left_up (with post_id, file_id, place; also where it was said already), asking (the place has not answered), done (it came down), not_up (the post is no longer up), unknown}.';

/* ------------------------------------------------------------------------------- 2. post_take_down_by_hand -- */

create or replace function public.post_take_down_by_hand(p_tenant_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- The newest take-down of this post that Chanlytics could not finish itself.
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
  if v_action.outcome = 'pending' then
    return jsonb_build_object('fate', 'asking');
  end if;
  -- Left up by the owner's own word (00688): nothing is asked of the place until Take down is pressed again.
  if v_action.outcome = 'left_up' then
    return jsonb_build_object('fate', 'left_up');
  end if;
  -- It waits again: the place is asked whether the post is gone, and the answer settles it.
  update public.remediation_actions r set outcome = 'pending', finished_at = null where r.id = v_action.id;
  update public.remediations m set finished_at = null where m.id = v_action.remediation_id;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'post_take_down', now(),
          jsonb_build_object('action_id', v_action.id, 'attempt', 'hand-' || floor(extract(epoch from now()))::bigint::text,
                             'by_hand', 'yes'));
  return jsonb_build_object('fate', 'asking');
end $$;
revoke all on function public.post_take_down_by_hand(uuid, uuid) from public, anon;
grant execute on function public.post_take_down_by_hand(uuid, uuid) to authenticated, service_role;
comment on function public.post_take_down_by_hand(uuid, uuid) is
  'A member''s door, with the settings permission (00682; the content loop PRD''s 8.3): "I deleted it", of a post Chanlytics could not take down itself. Its newest take-down waits again and the place is asked whether the post is gone (a post_take_down job that only reads); the post is taken_down once the place shows it is. Answers {fate: asking, done (already), left_up (the owner chose to leave it up, 00688: nothing is asked), unknown}.';
