-- 00615 · A video is made of blocks (decision 0126, its second half): a video's row holds a plan in blocks.
--
-- A video's plan had one shape, "Hook first" (00613): its row said so, and so did its two doors. Ask now arranges a video in
-- blocks (a clip's moment, a photo, a before-and-after pair, a words card, a quote card), and its card's press sends that plan.
--
--   pieces.shape             Takes `blocks` beside `hook_cut` (contracts PIECE_SHAPES). A row kept as "Hook first" stays as it
--                            is: every reader reads either as blocks.
--   piece_begin              Takes a plan of either shape, and the row says the shape its plan is kept in (it wrote
--                            `hook_cut` whatever came). Everything else as 00613 left it.
--   piece_file_begin         Who is in a made video is read from every file its plan names: a clip block's and a photo
--                            block's, a pair's two pictures and the picture a quote stands over, beside a "Hook first" plan's
--                            cuts. It read `plan -> 'cuts'` alone, so a video of blocks would have said `not_asked` of people
--                            the owner had answered for. Everything else as 00613 left it.
--
-- Deploy order: this migration first. Both apps as they run today send and read "Hook first" alone, which every statement
-- here still takes. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------- 1. the row's shape -- */

-- contracts PIECE_SHAPES.
alter table public.pieces drop constraint if exists pieces_shape_check;
alter table public.pieces add constraint pieces_shape_check check (shape = any (array['hook_cut', 'blocks']));

/* ---------------------------------------------------------------------------------------------------- 2. the press -- */

create or replace function public.piece_begin(
  p_tenant_id uuid,
  p_plan jsonb,
  p_look jsonb,
  p_key text,
  p_edition integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_id     uuid;
  v_status text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- contracts PIECE_SHAPES: in blocks, as Ask arranges one, or as "Hook first", which a card made before blocks carries.
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or (p_plan ->> 'shape') is null or (p_plan ->> 'shape') not in ('hook_cut', 'blocks') then
    raise exception 'No such shape.' using errcode = '22023';
  end if;
  if p_look is null or jsonb_typeof(p_look) <> 'object' then
    raise exception 'A video is drawn in the business''s look.' using errcode = '22023';
  end if;
  -- A plan is a few moments and a few words, a look a name and an address: nothing larger is either.
  if length(p_plan::text) > 8000 or length(p_look::text) > 2000 then
    raise exception 'A plan is a few moments and a few words.' using errcode = '22023';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 120 or p_edition is null or p_edition < 1 then
    raise exception 'A press names its card and the template it is drawn by.' using errcode = '22023';
  end if;
  -- One at a time a workspace, so the count below is of what is there.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|pieces', 42));
  select p.id, p.status into v_id, v_status from public.pieces p
   where p.tenant_id = p_tenant_id and p.card_key = p_key;
  -- Pressed before: the one video. One that was not made is tried anew by the same press, below.
  if found and v_status <> 'failed' then
    return jsonb_build_object('fate', 'here', 'piece_id', v_id);
  end if;
  -- contracts PIECES_MAKING_MAX: each is a machine that costs while it draws. One begun over an hour ago holds no machine
  -- (a start waits half an hour at most, a machine lives eight minutes), so a video left waiting on the platform's word
  -- never closes the door on the next.
  if (select count(*) from public.pieces p
       where p.tenant_id = p_tenant_id and p.status = 'making' and p.created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('fate', 'busy', 'piece_id', null);
  end if;
  if v_id is null then
    insert into public.pieces (tenant_id, shape, plan, look, edition, card_key, created_by)
    values (p_tenant_id, p_plan ->> 'shape', p_plan, p_look, p_edition, p_key, v_actor)
    returning id into v_id;
  else
    -- The same card's new try: its row begins again, by the plan and the look as they now stand. A file of the try before,
    -- where one was kept and could not be read, stays in Files as it stands, and is this video's no longer.
    update public.pieces p
       set status = 'making', stage = 'queued', failed_why = null, machine = null, file_id = null, made_at = null,
           shape = p_plan ->> 'shape', plan = p_plan, look = p_look, edition = p_edition, created_by = v_actor,
           created_at = now(), updated_at = now()
     where p.id = v_id;
  end if;
  -- As text: a job's once-only key is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'piece_make', now(), jsonb_build_object('piece_id', v_id, 'step', 'start', 'tick', '1'));
  return jsonb_build_object('fate', 'begun', 'piece_id', v_id);
end $$;
revoke all on function public.piece_begin(uuid, jsonb, jsonb, text, integer) from public, anon;
grant execute on function public.piece_begin(uuid, jsonb, jsonb, text, integer) to authenticated, service_role;
comment on function public.piece_begin(uuid, jsonb, jsonb, text, integer) is
  'A member''s press, with the settings permission (00613, decision 0122; 00615, decision 0126): a video asked for, by its plan, in blocks or as "Hook first", and the business''s look as it stood, with the first step of the job that makes it. Kept once by its card''s key; one that was not made is tried anew by the same press. Answers {fate: begun, here, busy; piece_id}.';

/* ------------------------------------------------------------------------------------------- 3. the file it becomes -- */

create or replace function public.piece_file_begin(
  p_piece_id uuid,
  p_id uuid,
  p_media_ref text,
  p_name text,
  p_bytes bigint,
  p_fingerprint text,
  p_seconds numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece  public.pieces;
  v_tenant uuid;
  v_held   text;
  v_begun  timestamptz;
  v_twin   uuid;
  v_status text;
  v_used   numeric;
  v_who    text;
begin
  select p.tenant_id into v_tenant from public.pieces p where p.id = p_piece_id;
  if not found then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- One at a time, as every door that names or files takes it (00551); the row is read under it, so two runs never both
  -- begin one video's file.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || '|files', 42));
  select * into v_piece from public.pieces p where p.id = p_piece_id for update;
  if not found or v_piece.status <> 'making' then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- Asked again (a lost answer, or a second run): the same answer, with the reservation the row holds and when it was begun,
  -- so whoever asks can tell a run still sending it from one that died.
  if v_piece.file_id is not null then
    select f.media_ref, f.created_at into v_held, v_begun from public.files f where f.id = v_piece.file_id;
    return jsonb_build_object('fate', 'kept', 'file_id', v_piece.file_id, 'media_ref', v_held, 'begun_at', v_begun);
  end if;
  -- The same bytes are a file already: this video is that one, and follows it wherever it stands. `twin` says where.
  select f.id, f.media_status into v_twin, v_status from public.files f
   where f.tenant_id = v_piece.tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    update public.pieces p
       set file_id = v_twin, machine = null, stage = 'saving', updated_at = now(),
           status = case v_status when 'ready' then 'made' when 'failed' then 'failed' else p.status end,
           failed_why = case when v_status = 'failed' then 'store' else p.failed_why end,
           made_at = case when v_status = 'ready' then now() else p.made_at end
     where p.id = p_piece_id;
    return jsonb_build_object('fate', 'here', 'file_id', v_twin, 'twin', v_status);
  end if;
  -- contracts FILES_MAX.
  if (select count(*) from public.files f where f.tenant_id = v_piece.tenant_id and f.removed_at is null) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: what is kept and what is on its way, together.
  select coalesce(sum(f.seconds), 0) into v_used from public.files f
   where f.tenant_id = v_piece.tenant_id and f.kind = 'video' and f.removed_at is null and f.media_status <> 'failed';
  if v_used + coalesce(p_seconds, 0) > 60 * 60 then
    return jsonb_build_object('fate', 'minutes', 'file_id', null);
  end if;
  -- Who is in it is its files' own word: agreed where the owner said so at the press or of any of them, no one where
  -- every one says so, else not asked. Its files are every one its plan names: a "Hook first" plan's cuts, and in a plan
  -- of blocks a clip's and a photo's, a pair's two pictures and the picture a quote stands over. Read by each file's id
  -- as text, so a plan that names no file (cards of words alone) reads none, and says not asked.
  select case
           when (v_piece.plan ->> 'people_agreed') = 'true' or coalesce(bool_or(f.who_in_it = 'agreed'), false) then 'agreed'
           when coalesce(bool_and(f.who_in_it = 'no_one'), false) then 'no_one'
           else 'not_asked'
         end
    into v_who
    from public.files f
   where f.tenant_id = v_piece.tenant_id
     and f.id::text in (
           select c ->> 'file_id'
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'cuts') = 'array'
                                            then v_piece.plan -> 'cuts' else '[]'::jsonb end) c
           union
           select x.id
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'blocks') = 'array'
                                            then v_piece.plan -> 'blocks' else '[]'::jsonb end) b,
                  lateral (values (b ->> 'file_id'), (b -> 'before' ->> 'file_id'),
                                  (b -> 'after' ->> 'file_id'), (b -> 'over' ->> 'file_id')) x(id)
            where x.id is not null);
  -- Named for its words, as a post is, so the look that follows does not rename it.
  insert into public.files (id, tenant_id, status, source, name, owner_named, mime, bytes, fingerprint, kind, media_ref,
                            media_status, seconds, created_by, made, who_in_it)
  values (p_id, v_piece.tenant_id, 'filed', 'made', public.file_free_name(v_piece.tenant_id, p_name), true, 'video/mp4',
          p_bytes, p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds, v_piece.created_by,
          jsonb_build_object('piece', v_piece.id, 'shape', v_piece.shape, 'plan', v_piece.plan), v_who);
  update public.pieces p set file_id = p_id, stage = 'saving', updated_at = now() where p.id = p_piece_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_piece.tenant_id, 'file.added', 'setup', 'workspace', v_piece.tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'made', 'kind', 'video', 'by', v_piece.created_by));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;
revoke all on function public.piece_file_begin(uuid, uuid, text, text, bigint, text, numeric)
  from public, anon, authenticated;
grant execute on function public.piece_file_begin(uuid, uuid, text, text, bigint, text, numeric) to service_role;
comment on function public.piece_file_begin(uuid, uuid, text, text, bigint, text, numeric) is
  'A drawn video on its way into the video platform (00613; 00615: who is in it is read from every file its plan names): its row as a file, uploading, made here and named for its words, with its piece in `made`. Answers {fate: kept, here, full, minutes, ended; file_id}; asked again, kept says when its file was begun (begun_at), and here says where the file it found stands (twin). The service role''s.';
