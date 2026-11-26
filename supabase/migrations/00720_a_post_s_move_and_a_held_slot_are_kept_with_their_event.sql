-- 00720 · A post's move and a held slot are kept with their event (lane 9's second piece of the code refinement plan,
-- 25 Nov 2026: layer 10's invariant 2, a change and its event in one transaction, written by its door; and layer 11,
-- a member's own act reaches its door as the member).
--
--   post_moved          Re-made: every move of a post (sent, up, held, let go, failed, taken down, seen at its place)
--                       writes post.moved, with where it moved from and to, its place, and who moved it where a member
--                       did (auth.uid(); none for the edge and the jobs). It was the busiest door that wrote a record and
--                       no event: every post's every step goes through it.
--   post_seen_say       New: the owner's word on a post its place took and never confirmed ("It's there", "It's not
--                       there"), asked of the member who calls it (permission settings, the route's own role), for a post
--                       that is still up, never seen and not Google's (contracts postNeverSeen). It moves the post through
--                       post_moved, so the post keeps one writer and its move one event, with who said it. The dashboard
--                       stops reaching for the all-access key to say it.
--   plan_slots_hold     New: the slots a week's approval left out, held on their rows with why, each with its event
--                       (plan_slot.held), for the member who pressed (permission settings, as content_week_approve asks)
--                       or the edge's service role (a held week AI approves). It takes the place of packages/db's own
--                       update, so plan_slots keeps as many writers as it had, and the dashboard stops reaching for the
--                       all-access key to hold them.
--
-- Nothing a customer sees changes: both kinds are kept from the Activity page unless asked for by name (contracts
-- ACTIVITY_NOISE_KINDS), since Files and the week say where each post and slot stands.
--
-- Deploy order: either. An old dashboard and an old edge keep calling post_moved as they did, and each move now writes
-- its event (no subscriber reads post.moved); an old dashboard holds slots with its own update, as before, with no event.
-- The new dashboard calls post_seen_say and plan_slots_hold, which a database from before this does not have: it
-- deploys after this is applied, as the house applies a migration before its merge.
set local lock_timeout = '3s';

/* -- post_moved: post.moved -- */

create or replace function public.post_moved(p_post_id uuid, p_from text[], p_to text, p_patch jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  -- Let go because its day passed before it could be sent: it says so, as a hold does.
  v_late boolean := p_to = 'pulled' and v_patch ->> 'held_why' = 'late';
  v_moved boolean;
  v_was   text;
begin
  -- Where it stood, held while it moves: what its event says it moved from.
  select p.status into v_was from public.posts p where p.id = p_post_id and p.status = any (p_from) for update;
  update public.posts p
     set status = p_to,
         held_reason = case when p_to = 'held' or v_late
                            then left(coalesce(v_patch ->> 'held_reason', 'Held.'), 300) end,
         held_why = case when p_to = 'held' or v_late then v_patch ->> 'held_why' end,
         permalink = coalesce(v_patch ->> 'permalink', p.permalink),
         published_at = case when p_to = 'published'
                             then coalesce((v_patch ->> 'published_at')::timestamptz, p.published_at, now())
                             else p.published_at end,
         external_id = coalesce(v_patch ->> 'external_id', p.external_id),
         account_id = coalesce(v_patch ->> 'account_id', p.account_id),
         verified_at = coalesce((v_patch ->> 'verified_at')::timestamptz, p.verified_at),
         error = case when v_patch ? 'error' then v_patch -> 'error' else p.error end,
         updated_at = now()
   where p.id = p_post_id and p.status = any (p_from);
  v_moved := found;
  -- Each move is a fact on the ledger, in its own transaction: from and to, its place, who moved it where a member did,
  -- and whether it was seen at its place.
  if v_moved then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select p.tenant_id, 'post.moved', 'content', 'post', p.id,
           jsonb_strip_nulls(jsonb_build_object('from', v_was, 'to', p_to, 'place', p.place, 'by', auth.uid(),
                                                'seen', case when v_patch ? 'verified_at' then true end))
      from public.posts p
     where p.id = p_post_id;
  end if;
  -- Up on Instagram and not yet read back from the account: it is asked for by its own id two minutes on, written here
  -- with the fact, so a run that dies after the move never leaves a post that is never seen. Its key is its own
  -- ('seen'), apart from a send's two attempts.
  if v_moved and p_to = 'published' then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    select p.tenant_id, 'post_reconcile', now() + interval '2 minutes',
           jsonb_build_object('post_id', p.id, 'attempt', 'seen', 'seen', 'ask')
      from public.posts p
     where p.id = p_post_id and p.place in ('instagram', 'facebook') and p.verified_at is null
       and p.external_id is not null
    on conflict do nothing;
  end if;
  return v_moved;
end $$;

/* -- post_seen_say (new): the owner's word on a post never seen at its place -- */

create or replace function public.post_seen_say(p_post_id uuid, p_there boolean, p_words text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post  public.posts;
  v_words text := left(nullif(btrim(coalesce(p_words, '')), ''), 300);
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_post from public.posts p where p.id = p_post_id;
  if not found then
    return false;
  end if;
  if not coalesce(public.caller_has_permission(v_post.tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_there is null then
    raise exception 'There, or not there.' using errcode = '22023';
  end if;
  -- Only a post its place took and was never read holding (contracts postNeverSeen): one seen meanwhile, taken down or
  -- let go is left as it stands, and the page reads it again.
  if v_post.status <> 'published' or v_post.place = 'google' or v_post.verified_at is not null then
    return false;
  end if;
  -- "It's there": up from now, as if the account had been read holding it.
  if p_there then
    return public.post_moved(p_post_id, array['published'], 'published', jsonb_build_object('verified_at', now()));
  end if;
  -- "It's not there": it never went up, a post that did not go, in the words its page says.
  if v_words is null then
    raise exception 'Say why it is not there.' using errcode = '22023';
  end if;
  return public.post_moved(p_post_id, array['published'], 'failed',
    jsonb_build_object('error', jsonb_build_object('code', null, 'subcode', null, 'words', v_words)));
end $$;

comment on function public.post_seen_say(uuid, boolean, text) is 'The owner''s word on a post its place took and never confirmed (00720; the content status review''s D5): there (up from now, seen) or not there (failed, in p_words, at most 300 characters). An owner''s or a partner''s (permission settings), for a post still up, never seen and not on Google; anything else answers false and moves nothing. The move is post_moved''s, with its event and who said it.';
revoke all on function public.post_seen_say(uuid, boolean, text) from public, anon;
grant execute on function public.post_seen_say(uuid, boolean, text) to authenticated, service_role;

/* -- plan_slots_hold (new): the slots a week's approval left out, held with why -- */

create or replace function public.plan_slots_hold(p_tenant_id uuid, p_plan_id uuid, p_holds jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- 00714's form: the edge, holding what a week AI approves left out: no member, so no member's permission to ask.
  v_service boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_hold    jsonb;
  v_slot    uuid;
  v_held    integer := 0;
begin
  if auth.uid() is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_holds, '[]'::jsonb)) <> 'array' then
    raise exception 'The slots to hold are a list.' using errcode = '22023';
  end if;
  -- Each held on its row with why, only while it is still proposed: one approved, made or held since is left alone.
  for v_hold in select h from jsonb_array_elements(coalesce(p_holds, '[]'::jsonb)) h loop
    update public.plan_slots s
       set state = 'blocked', blocked_why = v_hold ->> 'held', blocked_reason = left(btrim(v_hold ->> 'why'), 400),
           updated_at = now()
     where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.id = (v_hold ->> 'id')::uuid
       and s.state = 'proposed'
    returning s.id into v_slot;
    if found then
      v_held := v_held + 1;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'plan_slot.held', 'content', 'plan_slot', v_slot,
              jsonb_strip_nulls(jsonb_build_object('why', v_hold ->> 'held', 'plan_id', p_plan_id, 'by', auth.uid())));
    end if;
  end loop;
  return v_held;
end $$;

comment on function public.plan_slots_hold(uuid, uuid, jsonb) is 'The slots a week''s approval left out because their reason no longer stands (00720): each [{id, held, why}] held on its row (blocked, blocked_why, blocked_reason at most 400 characters) while it is still proposed, with its event (plan_slot.held). The member who pressed (permission settings) or the service role (a week AI approves). Answers how many it held.';
revoke all on function public.plan_slots_hold(uuid, uuid, jsonb) from public, anon;
grant execute on function public.plan_slots_hold(uuid, uuid, jsonb) to authenticated, service_role;
