-- 00616 · A post waits for its time on Google, and a delete waits ten minutes for Undo (the content redesign's stage 3).
--
-- Campaigns › Content posts to Instagram and Google from one press, and Instagram's post could already wait for a time; Google's
-- went at the press. Now both wait. And a file deleted was let go at once, its bytes gone for good; now it waits ten minutes,
-- hidden everywhere, and Undo brings it back.
--
--   file_remove              Changes: the purge that lets the bytes go is due ten minutes on (contracts FILE_UNDO_MINUTES),
--                            not at once. The file is hidden at the press, and kept out of imports, as before.
--   file_restore             A member's, with the settings permission: Undo. The purge not yet begun is canceled, the file is
--                            shown again, and imports may bring its picture once more. One whose purge has begun is gone:
--                            refused in words.
--   post_begin               Changes: a Google post set for later than two minutes on is queued with its job, post_google,
--                            due at its time; one for now is the press's own call, as before.
--   job_kinds                post_google, in the bulk lane beside Instagram's: a post never holds a reply.
--   notifications.kind       Gains post_up and post_stopped: the bell's line when a post goes up on its own, or stops.
--
-- Nothing reads a seat with auth.uid() but through caller_has_permission. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------------ 1. Undo a delete -- */

create or replace function public.file_remove(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_fingerprint text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.files f set removed_at = now(), updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null
  returning f.fingerprint into v_fingerprint;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  -- At the press, not the purge: an import in between must not bring back what was just removed.
  insert into public.files_let_go (tenant_id, fingerprint) values (p_tenant_id, v_fingerprint)
  on conflict (tenant_id, fingerprint) do nothing;
  -- Ten minutes for Undo (contracts FILE_UNDO_MINUTES): the purge finds a file shown again and leaves it.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_purge', now() + interval '10 minutes', jsonb_build_object('file_id', p_id, 'why', 'remove'));
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.removed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'by', v_actor));
end $$;
revoke all on function public.file_remove(uuid, uuid) from public, anon;
grant execute on function public.file_remove(uuid, uuid) to authenticated, service_role;
comment on function public.file_remove(uuid, uuid) is
  'A person removed a file (00551, 00616): hidden at once and written to files_let_go, so an import does not bring it back; its bytes, Anthropic''s copy and its row go by the file_purge job, ten minutes on, so Undo (file_restore) can bring it back first.';

create or replace function public.file_restore(p_tenant_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_fingerprint text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- Only while its purge waits: one a run has taken may be letting the bytes go already. A run that takes it now waits on
  -- this row and then finds it canceled.
  update public.jobs j set state = 'canceled', updated_at = now()
   where j.tenant_id = p_tenant_id and j.kind = 'file_purge' and j.state = 'scheduled'
     and j.payload ->> 'file_id' = p_id::text;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  update public.files f set removed_at = null, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is not null
  returning f.fingerprint into v_fingerprint;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  delete from public.files_let_go g where g.tenant_id = p_tenant_id and g.fingerprint = v_fingerprint;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.restored', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'by', v_actor));
end $$;
revoke all on function public.file_restore(uuid, uuid) from public, anon;
grant execute on function public.file_restore(uuid, uuid) to authenticated, service_role;
comment on function public.file_restore(uuid, uuid) is
  'A member''s Undo of a delete, with the settings permission (00616): while its purge waits, the purge is canceled, the file is shown again and imports may bring its picture once more. One whose purge has begun is gone (P0002).';

/* ------------------------------------------------------------------------------------- 2. a post waits for Google -- */

create or replace function public.post_begin(
  p_tenant_id uuid,
  p_file_id uuid,
  p_place text,
  p_kind text,
  p_caption text,
  p_when timestamptz default null,
  p_via text default 'press'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_file  public.files;
  v_busy  uuid;
  v_id    uuid;
  v_when  timestamptz := greatest(coalesce(p_when, now()), now());
  -- A Google post for later than two minutes on waits for its job; one for now is the press's own call (contracts POST_SOON).
  v_later boolean := p_place = 'google' and v_when > now() + interval '2 minutes';
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_place is null or p_place <> all (array['instagram', 'google']) then
    raise exception 'No such place: %.', p_place using errcode = '22023';
  end if;
  -- A reel waits for a video's road to Instagram (decision 0121); Google takes a picture alone.
  if p_kind is null or p_kind <> all (array['picture', 'story']) or (p_place = 'google' and p_kind <> 'picture') then
    return jsonb_build_object('fate', 'not_yet', 'post_id', null);
  end if;
  if p_caption is not null and char_length(p_caption) > 2200 then
    raise exception 'A caption is at most 2,200 characters.' using errcode = '22023';
  end if;
  -- contracts POST_AHEAD_DAYS_MAX.
  if v_when > now() + interval '30 days' then
    raise exception 'A post goes within thirty days.' using errcode = '22023';
  end if;
  -- One at a time per file and place, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- A Google press is one call: one that died between its placement and its answer stops holding the next press after ten
  -- minutes. Whether it went up is still the edge's events' to say.
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words', 'Google did not say whether this went up.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  select p.id into v_busy from public.posts p
   where p.file_id = p_file_id and p.place = p_place
     and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
  if found then
    return jsonb_build_object('fate', 'busy', 'post_id', v_busy);
  end if;
  insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status)
  values (p_tenant_id, p_file_id, p_place, p_kind,
          case when p_kind = 'story' then null else nullif(btrim(p_caption), '') end,
          v_when, v_actor, now(), coalesce(p_via, 'press'),
          -- Google for now is asked by the press itself, in the same moment; for later, and Instagram's send, is a job.
          case when p_place = 'google' and not v_later then 'publishing' else 'queued' end)
  returning id into v_id;
  if p_place = 'instagram' then
    -- Ten minutes ahead of its time, so Instagram has made it ready by then. As text: a job's once-only key is made of strings.
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
            jsonb_build_object('post_id', v_id, 'attempt', '1'));
  elsif v_later then
    -- Google fetches the picture as it is asked, so the job is due at the post's own time.
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'post_google', v_when, jsonb_build_object('post_id', v_id, 'attempt', '1'));
  end if;
  return jsonb_build_object('fate', 'begun', 'post_id', v_id);
end $$;
revoke all on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) to authenticated, service_role;
comment on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) is
  'A member''s press, with the settings permission (00611, 00616): a made post approved for a place, as a picture or a story, with its words and its time. The placement is written, and for Instagram its first job; for Google later than two minutes on, its post_google job at its time. Answers {fate: begun, busy (the one on its way), gone, not_a_post, not_yet, post_id}.';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_google', 2, array['post_id', 'attempt'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* -------------------------------------------------------------------------------------------- 3. the bell's lines -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook', 'calendar_people',
                           'alert', 'review', 'billing', 'template_ready', 'template_blocked', 'broadcast_sent',
                           'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you', 'reach_out_replied',
                           'reach_out_day', 'booking_notice', 'opted_out', 'booking', 'member_joined', 'member_left',
                           'note_to_keep', 'reply_held', 'ask_cards', 'website_form', 'files_waiting', 'video_ready',
                           'post_up', 'post_stopped']));
