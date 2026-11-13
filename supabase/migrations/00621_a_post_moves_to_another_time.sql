-- 00621 · A post set for its time moves to another (Campaigns › Content, the post sheet's Change time).
--
-- A post set for later could only be moved by Don't post and posting it again: two presses, and between them it was gone. If
-- the second was refused (a place disconnected a moment before), the post stayed gone. Now the post itself moves, in one
-- step: the same post, the same approval, its words, and its waiting job due at the new time.
--
--   post_move   A member's, with the settings permission: a post still queued, whose job has not been taken, set for another
--               time within thirty days. Its job (Instagram's post_prepare, ten minutes ahead; Google's post_google, at its
--               time) moves with it. One Instagram is already making ready, or whose job is running, is late: answered so,
--               and nothing moves. Answers {fate: moved, late (with where it stands), unknown}.
--
-- Nothing reads a seat with auth.uid() but through caller_has_permission. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.post_move(p_post_id uuid, p_when timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_post from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  if not coalesce(public.caller_has_permission(v_post.tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_when is null or p_when <= now() then
    raise exception 'A new time is later than now.' using errcode = '22023';
  end if;
  -- contracts POST_AHEAD_DAYS_MAX, as post_begin holds it.
  if p_when > now() + interval '30 days' then
    raise exception 'A post goes within thirty days.' using errcode = '22023';
  end if;
  -- Held while it moves: Don't post and the job's own run wait on this row, and then find it moved.
  select * into v_post from public.posts p where p.id = p_post_id and p.status = 'queued' for update;
  if not found then
    return jsonb_build_object('fate', 'late', 'status', (select p.status from public.posts p where p.id = p_post_id));
  end if;
  -- Its job moves only while no run has taken it: a run that has is already making it ready, or sending it.
  update public.jobs j
     set due_at = case when j.kind = 'post_prepare' then greatest(now(), p_when - interval '10 minutes') else p_when end,
         updated_at = now()
   where j.tenant_id = v_post.tenant_id and j.kind = any (array['post_prepare', 'post_google']) and j.state = 'scheduled'
     and j.payload ->> 'post_id' = p_post_id::text;
  if not found then
    return jsonb_build_object('fate', 'late', 'status', v_post.status);
  end if;
  update public.posts p set scheduled_for = p_when, updated_at = now() where p.id = p_post_id;
  return jsonb_build_object('fate', 'moved');
end $$;
revoke all on function public.post_move(uuid, timestamptz) from public, anon;
grant execute on function public.post_move(uuid, timestamptz) to authenticated, service_role;
comment on function public.post_move(uuid, timestamptz) is
  'A member''s Change time, with the settings permission (00621): a post still queued, its job not yet taken, set for another time within thirty days, its job moved with it. Answers {fate: moved, late (with where it stands), unknown}.';
