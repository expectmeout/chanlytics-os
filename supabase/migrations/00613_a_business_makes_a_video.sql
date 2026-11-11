-- 00613 · A business makes a video from its clips (decision 0122; the video maker, first slice).
--
-- An owner asks Ask for a video; Ask proposes a plan (which seconds of which clips, the words that open it), and their press
-- makes it: a machine that exists for that one video draws it from the clips, and the video lands in Files like any other,
-- under Made by Ask. This is the record of each video asked for and where it stands, and the machine's image a deploy draws on.
--
--   pieces                   One row a video asked for: its plan as pressed and the business's look as it then stood, who
--                            pressed, the template's edition it is drawn by, where it stands (making, made, failed) and,
--                            once it is one, the file it became. A press is kept once by its card's key.
--   piece_images             The machine image on record for each edition of the template (tooling/video): the platform's,
--                            no workspace's. Written by the script that builds an image, read by the job that draws.
--   pieces.stage             Where one being made stands, for its card to say: waiting for its job, waiting for a clip's
--                            full-size copy, being drawn, being kept in Files. A member reads it.
--   piece_begin              A member's, with the settings permission: the press. Writes the row and its job's first step.
--                            Answers {fate: begun, here (pressed before), busy (three are being made)}. A video that was
--                            not made, pressed again, is the same row tried anew.
--   piece_step               The service role's: the machine a video is being drawn on, kept while it is.
--   piece_stage              The service role's: where a video being made stands, said as it changes.
--   piece_file_begin         The service role's: the drawn video on its way into the video platform, as a file. The row is
--                            a video like any other (uploading), made here, named for its words, its piece named in `made`.
--                            Answers {fate: kept, here (the same bytes are a file already), full, minutes, ended}.
--   piece_sent               The service role's: the drawn video's bytes have all gone. Its file says it is being made
--                            ready, its machine is let go, and from here the video platform's word alone ends it.
--   piece_end                The service role's: a video that could not be made says why, and a half-made file is let go.
--                            One whose bytes all went is left for the platform's word.
--   file_media_ready         Gains: a made video that became playable is its piece made. Answers `made` beside its fate.
--   file_media_failed        Gains: a made video the platform could not read is its piece failed.
--   job_kinds                piece_make, in the lane of someone waiting who is not a customer: one step a run, its
--                            once-only key the piece, the step and the tick.
--   notifications.kind       Gains video_ready: the bell's line when a video asked for can be played.
--   bucket `files`           Takes video/mp4 too: a made video's own file, kept in its folder so it can be downloaded. The
--                            video platform plays a video and gives no file back; a clip a member sent stays with them, but
--                            a video made here exists nowhere else.
--
-- Nothing reads a seat with auth.uid() but through caller_has_permission. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------------- 1. the pieces -- */

create table if not exists public.pieces (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  shape       text not null,
  -- The plan as pressed (contracts PiecePlan): what was agreed to is what is drawn.
  plan        jsonb not null,
  -- The business's own as the end card and the words wear it, read at the press (contracts PieceLookKept): its colour, its
  -- mark's place, its name, booking line and address. Kept so the video drawn is the one the card showed.
  look        jsonb not null,
  status      text not null default 'making',
  -- Where one being made stands, for its card to say (contracts PIECE_STAGES). It says nothing once it is made or was not.
  stage       text not null default 'queued',
  failed_why  text,
  -- The template's edition it is drawn by (contracts PIECE_TEMPLATE; piece_images holds its machine image).
  edition     integer not null,
  -- The file it became, its workspace's own (00279). A made video deleted takes its record with it.
  file_id     uuid,
  -- The machine it is being drawn on, while it is: { name, cmd_id, started_at, round }. Service role only.
  machine     jsonb,
  -- The card's own key: a press that arrives twice is one video.
  card_key    text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  made_at     timestamptz,
  constraint pieces_tenant_id_id_key unique (tenant_id, id),
  constraint pieces_card_key_once unique (tenant_id, card_key),
  constraint pieces_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete cascade
);

-- contracts PIECE_SHAPES, PIECE_STATUSES, PIECE_STAGES, PIECE_FAILS.
alter table public.pieces drop constraint if exists pieces_shape_check;
alter table public.pieces add constraint pieces_shape_check check (shape = any (array['hook_cut']));
alter table public.pieces drop constraint if exists pieces_status_check;
alter table public.pieces add constraint pieces_status_check check (status = any (array['making', 'made', 'failed']));
alter table public.pieces drop constraint if exists pieces_stage_check;
alter table public.pieces add constraint pieces_stage_check
  check (stage = any (array['queued', 'waiting_clip', 'drawing', 'saving']));
alter table public.pieces drop constraint if exists pieces_failed_why_check;
alter table public.pieces add constraint pieces_failed_why_check
  check (failed_why = any (array['clips', 'draw', 'store', 'unknown']));
alter table public.pieces drop constraint if exists pieces_failed_shape;
alter table public.pieces add constraint pieces_failed_shape check ((status = 'failed') = (failed_why is not null));
alter table public.pieces drop constraint if exists pieces_plan_shape;
alter table public.pieces add constraint pieces_plan_shape
  check (jsonb_typeof(plan) = 'object' and jsonb_typeof(look) = 'object');
alter table public.pieces drop constraint if exists pieces_card_key_shape;
alter table public.pieces add constraint pieces_card_key_shape
  check (char_length(card_key) >= 1 and char_length(card_key) <= 120);

create index if not exists pieces_tenant_newest on public.pieces (tenant_id, created_at desc);
-- How many are being made, asked at every press.
create index if not exists pieces_tenant_making on public.pieces (tenant_id) where status = 'making';
-- A made video that became playable finds its piece by the file; so does a file's delete (on delete cascade).
create index if not exists pieces_file on public.pieces (tenant_id, file_id) where file_id is not null;
-- A person's account removed lets go of what they asked for (on delete set null): found by its own index.
create index if not exists pieces_created_by on public.pieces (created_by) where created_by is not null;

comment on table public.pieces is
  'One row a video asked for (00613, decision 0122): its plan as pressed, the template''s edition it is drawn by, where it stands and the file it became. Written only through its doors.';
comment on column public.pieces.status is
  'making (its job is drawing it, or the video platform is making it playable), made (a file, under Made by Ask), failed (failed_why says why, in contracts PIECE_FAILS).';
comment on column public.pieces.stage is
  'Where a video being made stands, as its card says it: queued (its job has not begun), waiting_clip (a clip''s full-size copy is still being made), drawing (a machine is drawing it), saving (it is on its way into Files).';
comment on column public.pieces.machine is
  'The machine it is being drawn on, while it is: its name at the platform, the drawing''s own id, when it began and which try it is. Service role only.';
comment on column public.pieces.card_key is 'The key of the card whose press asked for it: the same press twice is one video.';

alter table public.pieces enable row level security;
drop policy if exists pieces_member_select on public.pieces;
create policy pieces_member_select on public.pieces for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- No member writes the table: every change is a door.
revoke all on public.pieces from anon, authenticated;
grant select (id, tenant_id, shape, plan, look, status, stage, failed_why, edition, file_id, created_by, created_at,
              updated_at, made_at)
  on public.pieces to authenticated;
grant select, insert, update, delete on public.pieces to service_role;

/* ------------------------------------------------------------------------------------------- 2. the machine images -- */

create table if not exists public.piece_images (
  edition      integer primary key,
  -- The image's id at the platform the machines run on.
  snapshot_id  text not null,
  -- What it was built from (tooling/video/template-hash.mjs): the edition's own hash.
  hash         text not null,
  made_at      timestamptz not null default now(),
  constraint piece_images_shape
    check (edition >= 1 and char_length(snapshot_id) >= 1 and char_length(snapshot_id) <= 120 and hash ~ '^[0-9a-f]{12}$')
);

comment on table public.piece_images is
  'The machine image a made video is drawn on, one row an edition of the template (00613, decision 0122). The platform''s own: no workspace reads it. Written by the script that builds an image.';

alter table public.piece_images enable row level security;
revoke all on public.piece_images from anon, authenticated;
grant select, insert, update, delete on public.piece_images to service_role;

/* ---------------------------------------------------------------------------------------------- 3. the job's kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('piece_make', 1, array['piece_id', 'step', 'tick'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* -------------------------------------------------------------------------------------------- 4. the bell's line -- */

-- contracts SERVER_NOTIFICATION_KINDS.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook', 'calendar_people',
                           'alert', 'review', 'billing', 'template_ready', 'template_blocked', 'broadcast_sent',
                           'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you', 'reach_out_replied',
                           'reach_out_day', 'booking_notice', 'opted_out', 'booking', 'member_joined', 'member_left',
                           'note_to_keep', 'reply_held', 'ask_cards', 'website_form', 'files_waiting', 'video_ready']));

/* --------------------------------------------------------------------------------------------------- 5. the bucket -- */

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'audio/mp4',
                                  'video/mp4']
 where id = 'files';

/* ---------------------------------------------------------------------------------------------------- 6. the doors -- */

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
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or (p_plan ->> 'shape') is distinct from 'hook_cut' then
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
    values (p_tenant_id, 'hook_cut', p_plan, p_look, p_edition, p_key, v_actor)
    returning id into v_id;
  else
    -- The same card's new try: its row begins again, by the plan and the look as they now stand. A file of the try before,
    -- where one was kept and could not be read, stays in Files as it stands, and is this video's no longer.
    update public.pieces p
       set status = 'making', stage = 'queued', failed_why = null, machine = null, file_id = null, made_at = null,
           plan = p_plan, look = p_look, edition = p_edition, created_by = v_actor, created_at = now(), updated_at = now()
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
  'A member''s press, with the settings permission (00613, decision 0122): a video asked for, by its plan and the business''s look as it stood, with the first step of the job that makes it. Kept once by its card''s key; one that was not made is tried anew by the same press. Answers {fate: begun, here, busy; piece_id}.';

create or replace function public.piece_step(p_piece_id uuid, p_machine jsonb)
returns boolean
language sql
security definer
set search_path = public
as $$
  with stepped as (
    update public.pieces p
       set machine = p_machine, updated_at = now(),
           -- A machine kept is the drawing begun.
           stage = case when p_machine ? 'name' then 'drawing' else p.stage end
     where p.id = p_piece_id and p.status = 'making'
    returning p.id
  )
  select exists (select 1 from stepped);
$$;
revoke all on function public.piece_step(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.piece_step(uuid, jsonb) to service_role;
comment on function public.piece_step(uuid, jsonb) is
  'The machine a video is being drawn on, kept or let go (00613); one kept is the drawing begun (stage). Answers whether the video is still being made. The service role''s.';

create or replace function public.piece_stage(p_piece_id uuid, p_stage text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with staged as (
    update public.pieces p set stage = p_stage, updated_at = now()
     where p.id = p_piece_id and p.status = 'making' and p.stage is distinct from p_stage
       and p_stage = any (array['queued', 'waiting_clip', 'drawing', 'saving'])
    returning p.id
  )
  select exists (select 1 from staged);
$$;
revoke all on function public.piece_stage(uuid, text) from public, anon, authenticated;
grant execute on function public.piece_stage(uuid, text) to service_role;
comment on function public.piece_stage(uuid, text) is
  'Where a video being made stands, said as it changes (00613): waiting for a clip''s full-size copy, most of all, which no other door says. Answers whether it changed. The service role''s.';

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
  -- Who is in it is its clips' own word: agreed where the owner said so at the press or of any clip, no one where every
  -- clip says so, else not asked. Read by each clip's id as text, so a plan that names no clip reads none.
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
                                            then v_piece.plan -> 'cuts' else '[]'::jsonb end) c);
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
  'A drawn video on its way into the video platform (00613): its row as a file, uploading, made here and named for its words, with its piece in `made`. Answers {fate: kept, here, full, minutes, ended; file_id}; asked again, kept says when its file was begun (begun_at), and here says where the file it found stands (twin). The service role''s.';

create or replace function public.piece_sent(p_piece_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece public.pieces;
begin
  update public.pieces p set machine = null, updated_at = now()
   where p.id = p_piece_id and p.status = 'making'
  returning * into v_piece;
  if not found then
    return false;
  end if;
  -- Only from uploading: the platform's word may already have come.
  update public.files f set media_status = 'processing', updated_at = now()
   where f.id = v_piece.file_id and f.media_status = 'uploading' and f.removed_at is null;
  return true;
end $$;
revoke all on function public.piece_sent(uuid) from public, anon, authenticated;
grant execute on function public.piece_sent(uuid) to service_role;
comment on function public.piece_sent(uuid) is
  'A drawn video''s bytes have all gone into the video platform (00613): its file says it is being made ready, and its machine is let go. From here the platform''s word ends it. Answers whether it was still being made. The service role''s.';

create or replace function public.piece_end(p_piece_id uuid, p_why text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece public.pieces;
begin
  select * into v_piece from public.pieces p where p.id = p_piece_id and p.status = 'making' for update;
  if not found then
    return false;
  end if;
  -- Its bytes all went (piece_sent): the video platform's word ends it, as it ends every video. Nothing here may throw it away.
  if v_piece.file_id is not null and exists (
       select 1 from public.files f
        where f.id = v_piece.file_id and f.removed_at is null and f.media_status in ('processing', 'ready')) then
    return false;
  end if;
  update public.pieces p
     set status = 'failed', machine = null, updated_at = now(),
         failed_why = case when p_why = any (array['clips', 'draw', 'store']) then p_why else 'unknown' end
   where p.id = p_piece_id;
  -- A file whose bytes never all went is no video: let go now, and its reservation with it, by the purge. Only the file
  -- this video began: one it found already there (the same bytes) is another video's.
  if v_piece.file_id is not null then
    update public.files f set removed_at = now(), updated_at = now()
     where f.id = v_piece.file_id and f.source = 'made' and f.media_status = 'uploading' and f.removed_at is null
       and (f.made ->> 'piece') = v_piece.id::text;
    if found then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (v_piece.tenant_id, 'file_purge', now(), jsonb_build_object('file_id', v_piece.file_id, 'why', 'remove'));
    end if;
  end if;
  return true;
end $$;
revoke all on function public.piece_end(uuid, text) from public, anon, authenticated;
grant execute on function public.piece_end(uuid, text) to service_role;
comment on function public.piece_end(uuid, text) is
  'A video that could not be made (00613): it says why (clips, draw, store, unknown), and a file of it whose bytes never all went is let go. One whose bytes all went is left for the platform''s word. Answers whether it ended here. The service role''s.';

-- A made video is finished where every video is: at the platform's word. The piece follows its file.
create or replace function public.file_media_ready(p_media_ref text, p_seconds numeric, p_width integer, p_height integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.files;
  v_made boolean := false;
begin
  select * into v_row from public.files f where f.media_ref = p_media_ref;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text || '|files', 42));
  select * into v_row from public.files f where f.id = v_row.id for update;
  if v_row.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  -- Delivered again: what was done is done.
  if v_row.media_status in ('ready', 'failed') then
    return jsonb_build_object('fate', 'repeated', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id);
  end if;
  update public.files f
     set media_status = 'ready',
         seconds = coalesce(p_seconds, f.seconds),
         width = coalesce(p_width, f.width),
         height = coalesce(p_height, f.height),
         ready_at = now(),
         look_status = 'waiting',
         looked_at = now(),
         updated_at = now()
   where f.id = v_row.id;
  -- As text: a job's once-only key is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (v_row.tenant_id, 'video_digest', now(),
          jsonb_build_object('file_id', v_row.id, 'step', 'sheet', 'edition', '1'));
  -- A video made here (00613): playable is made. Found by the file, so one whose bytes were a file already follows it too.
  update public.pieces p set status = 'made', made_at = now(), machine = null, updated_at = now()
   where p.tenant_id = v_row.tenant_id and p.file_id = v_row.id and p.status = 'making';
  v_made := found;
  return jsonb_build_object('fate', 'ready', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', v_made);
end $$;
revoke all on function public.file_media_ready(text, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.file_media_ready(text, numeric, integer, integer) to service_role;
comment on function public.file_media_ready(text, numeric, integer, integer) is
  'The video platform says a video is playable (00556): found by its id there, made a file whether or not the browser said done, and its digest''s first step put on the ledger. A video made here is its piece made (00613: `made`). Answers {fate: ready, repeated, gone or unknown, tenant_id, file_id, made}. The service role''s.';

create or replace function public.file_media_failed(p_media_ref text, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.files;
  v_failed boolean;
  v_made   boolean := false;
begin
  select * into v_row from public.files f where f.media_ref = p_media_ref;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.tenant_id::text || '|files', 42));
  update public.files f
     set media_status = 'failed',
         media_error = left(coalesce(nullif(p_error, ''), 'ERR_UNKNOWN'), 80),
         look_status = case when f.look_status = 'waiting' then 'failed' else f.look_status end,
         looked_at = now(),
         updated_at = now()
   where f.id = v_row.id and f.removed_at is null and f.media_status in ('uploading', 'processing');
  v_failed := found;
  -- A video made here that the platform could not read (00613): its piece says so.
  if v_failed then
    update public.pieces p set status = 'failed', failed_why = 'store', machine = null, updated_at = now()
     where p.tenant_id = v_row.tenant_id and p.file_id = v_row.id and p.status = 'making';
    v_made := found;
  end if;
  return jsonb_build_object('fate', case when v_failed then 'failed' else 'repeated' end,
                            'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', v_made);
end $$;
revoke all on function public.file_media_failed(text, text) from public, anon, authenticated;
grant execute on function public.file_media_failed(text, text) to service_role;
comment on function public.file_media_failed(text, text) is
  'The video platform could not read a video (00556): its tile says so, and its owner can delete it. A video made here is its piece failed (00613: `made`). Answers {fate: failed, repeated or unknown, tenant_id, file_id, made}. The service role''s.';
