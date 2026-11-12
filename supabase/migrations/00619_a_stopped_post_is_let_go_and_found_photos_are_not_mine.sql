-- 00619 · A post that stopped can be let go, and photos found online can be set aside together (Campaigns › Content, one loop).
--
-- A post that did not go out (held by the recheck before it was sent, or refused by the place) waited for the owner to post it
-- again, with no way to say they never will: it stood in Made's amber line for good. Don't post is the one way to let a post go,
-- before it is sent (00611) and now after it stopped. The Library's photos found on a website or a Google listing could be
-- kept together (00551 file_keep_many) but set aside only one at a time; the same door now does either.
--
--   post_pull        Don't post: a post queued or being prepared, as before, and now one held or failed. Pulled, it is no
--                    longer the newest stopped post at its place, so it leaves what needs the owner.
--   file_keep_many   The Found online list's press, with where the photos go: filed (Keep, as before) or set aside (Not
--                    mine). The two-argument door stays as it was, for a dashboard deployed before this one.
--
-- Deploy order: either. The two-argument file_keep_many is unchanged, and post_pull keeps its name, arguments and answer.
-- Re-runnable.
set local lock_timeout = '3s';

create or replace function public.post_pull(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select p.tenant_id, p.status into v_tenant, v_status from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  if not coalesce(public.caller_has_permission(v_tenant, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- Up to the moment it is sent (the jobs read the row before they act, so a pulled post is never sent), and once it
  -- stopped: let go, it waits for no one.
  update public.posts p set status = 'pulled', updated_at = now()
   where p.id = p_post_id and p.status = any (array['queued', 'preparing', 'held', 'failed']);
  if found then
    return jsonb_build_object('fate', 'pulled');
  end if;
  return jsonb_build_object('fate', 'late', 'status', v_status);
end $$;
revoke all on function public.post_pull(uuid) from public, anon;
grant execute on function public.post_pull(uuid) to authenticated, service_role;
comment on function public.post_pull(uuid) is
  'Don''t post (00611, 00619): a post queued or being prepared is pulled before it is sent, and one held or failed is let go. Answers {fate: pulled, late, unknown}.';

create or replace function public.file_keep_many(p_tenant_id uuid, p_ids uuid[], p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_moved integer;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_to is null or p_to <> all (array['filed', 'set_aside']) then
    raise exception 'Filed or set aside.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.files f
     set status = p_to, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = any (p_ids) and f.status = 'inbox' and f.removed_at is null;
  get diagnostics v_moved = row_count;
  if v_moved > 0 and p_to = 'filed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.kept', 'setup', 'workspace', p_tenant_id, jsonb_build_object('count', v_moved, 'by', v_actor));
  end if;
  return v_moved;
end $$;
revoke all on function public.file_keep_many(uuid, uuid[], text) from public, anon;
grant execute on function public.file_keep_many(uuid, uuid[], text) to authenticated, service_role;
comment on function public.file_keep_many(uuid, uuid[], text) is
  'The Found online list''s press (00551, 00619): what waits, among these, is filed (Keep) or set aside (Not mine). Answers how many moved.';
