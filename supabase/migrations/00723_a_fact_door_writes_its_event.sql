-- 00723 · A fact door writes its event (lanes 9 and 2 of the code refinement plan, finished together, 26 Nov 2026:
-- layer 10's invariant 2, a change and its event in one transaction, written by the door that makes the change).
--
-- HEAD
set local lock_timeout = '3s';
/* -- the six clearances by age: each run says what it cleared and how many, per workspace -- */

-- A record past its keeping time (contracts RETENTION_DAYS) was cleared with nothing on the ledger: an AI's metered use,
-- a website's held or test entry, a touch's evidence, a spoken session's token, a removed file's row, an upload that
-- never finished. Each run now writes retention.cleared, one row per workspace it cleared something of, saying what and
-- how many, in the clearance's own transaction; a run that cleared nothing writes none. The kind is kept from
-- Activity's rows: it is the privacy page's promise kept, for Reports and for anyone who asks.

create or replace function public.ai_usage_purge(p_keep interval default '400 days'::interval)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.ai_usage where created_at < now() - p_keep returning tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select g.tenant_id, 'retention.cleared', 'system', 'workspace', g.tenant_id,
           jsonb_build_object('what', 'ai_usage', 'rows', count(*))
      from gone g group by g.tenant_id
    returning 1
  )
  select (select count(*) from gone)::integer into v_count;
  return v_count;
end $$;

create or replace function public.form_entries_purge()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gone integer;
begin
  -- A held entry nobody let through goes after 30 days; a test after 7 (contracts RETENTION_DAYS).
  with gone as (
    delete from public.form_entries e
     where (e.state = 'held' and e.created_at < now() - interval '30 days')
        or (e.test and e.created_at < now() - interval '7 days')
    returning e.tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select g.tenant_id, 'retention.cleared', 'system', 'workspace', g.tenant_id,
           jsonb_build_object('what', 'form_entries', 'rows', count(*))
      from gone g group by g.tenant_id
    returning 1
  )
  select (select count(*) from gone)::integer into v_gone;
  return v_gone;
end $$;

create or replace function public.touches_age_out(p_before timestamptz default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before timestamptz := coalesce(p_before, now() - interval '180 days');
  v_count integer;
begin
  with emptied as (
    update public.touches t
       set contact_id = null, conversation_id = null, message_id = null, evidence = '{}'::jsonb, emptied_at = now()
     where t.emptied_at is null and t.at < v_before and not t.new_person
    returning t.tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select e.tenant_id, 'retention.cleared', 'system', 'workspace', e.tenant_id,
           jsonb_build_object('what', 'touches', 'rows', count(*))
      from emptied e group by e.tenant_id
    returning 1
  )
  select (select count(*) from emptied)::integer into v_count;
  return v_count;
end $$;

create or replace function public.sweep_voice_sessions(p_after interval default '1 day'::interval)
returns integer
language plpgsql
security definer
set search_path to 'public'
set lock_timeout to '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    with gone as (
      delete from public.ask_voice_sessions s
       where s.id in (
         select c.id from public.ask_voice_sessions c
          where c.token_expires_at < now() - p_after
          limit 1000
       )
      returning s.tenant_id
    ), told as (
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      select g.tenant_id, 'retention.cleared', 'system', 'workspace', g.tenant_id,
             jsonb_build_object('what', 'ask_voice_sessions', 'rows', count(*))
        from gone g group by g.tenant_id
      returning 1
    )
    select (select count(*) from gone)::integer into v_n;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;

create or replace function public.file_purged(p_tenant_id uuid, p_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  with gone as (
    delete from public.files f where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is not null
    returning f.tenant_id, f.id
  )
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select g.tenant_id, 'retention.cleared', 'system', 'file', g.id, jsonb_build_object('what', 'files', 'rows', 1)
    from gone g;
$$;

create or replace function public.file_upload_lapsed(p_tenant_id uuid, p_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  with lapsed as (
    update public.files f set removed_at = now(), updated_at = now()
     where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.media_status = 'uploading'
       and f.removed_at is null
    returning f.tenant_id, f.id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select l.tenant_id, 'retention.cleared', 'system', 'file', l.id, jsonb_build_object('what', 'file_uploads', 'rows', 1)
      from lapsed l
    returning 1
  )
  select exists (select 1 from lapsed);
$$;
/* -- a piece's making, and a file's media: each move with its event -- */

-- A video made here moves through its making (begun, a stage, a machine step, its bytes sent, failed, a new version
-- ready, its words kept) and a file's media through the platform's (processing, failed): each move now writes
-- piece.moved or file.media_moved in its own transaction, with where it moved to and, where a member moved it, who.
-- Both are kept from Activity's rows: Files and the piece's own page say where each stands.

-- piece_begin
CREATE OR REPLACE FUNCTION public.piece_begin(p_tenant_id uuid, p_plan jsonb, p_look jsonb, p_key text, p_edition integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor  uuid := auth.uid();
  -- 00714: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_id     uuid;
  v_status text;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'piece.moved', 'content', 'piece', v_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'making', 'edition', p_edition, 'by', v_actor)));
  return jsonb_build_object('fate', 'begun', 'piece_id', v_id);
end $$;

-- piece_end
CREATE OR REPLACE FUNCTION public.piece_end(p_piece_id uuid, p_why text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_piece.tenant_id, 'piece.moved', 'content', 'piece', v_piece.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'why', case when p_why = any (array['clips', 'draw', 'store']) then p_why else 'unknown' end)));
  return true;
end $$;

-- piece_sent
CREATE OR REPLACE FUNCTION public.piece_sent(p_piece_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_piece.tenant_id, 'piece.moved', 'content', 'piece', v_piece.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'sent')));
  return true;
end $$;

-- piece_stage
CREATE OR REPLACE FUNCTION public.piece_stage(p_piece_id uuid, p_stage text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with staged as (
    update public.pieces p set stage = p_stage, updated_at = now()
     where p.id = p_piece_id and p.status = 'making' and p.stage is distinct from p_stage
       and p_stage = any (array['queued', 'waiting_clip', 'from_drive', 'drawing', 'saving'])
    returning p.id, p.tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'piece.moved', 'content', 'piece', s.id, jsonb_build_object('to', 'making', 'stage', p_stage)
      from staged s
    returning 1
  )
  select exists (select 1 from staged);
$$;

-- piece_step
CREATE OR REPLACE FUNCTION public.piece_step(p_piece_id uuid, p_machine jsonb) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with stepped as (
    update public.pieces p
       set machine = p_machine, updated_at = now(),
           -- A machine kept is the drawing begun.
           stage = case when p_machine ? 'name' then 'drawing' else p.stage end
     where p.id = p_piece_id and p.status = 'making'
    returning p.id, p.tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'piece.moved', 'content', 'piece', s.id,
           jsonb_strip_nulls(jsonb_build_object('to', 'making', 'step', p_machine ->> 'name'))
      from stepped s
    returning 1
  )
  select exists (select 1 from stepped);
$$;

-- piece_version_ready
CREATE OR REPLACE FUNCTION public.piece_version_ready(p_file_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_new    public.pieces;
  v_root   public.pieces;
  v_n      integer;
  v_voided integer;
begin
  select * into v_new from public.pieces p
   where p.file_id = p_file_id and p.revises is not null order by p.created_at desc limit 1;
  if not found then
    return null;
  end if;
  select r.revision into v_n from public.piece_renditions r
   where r.piece_id = v_new.revises and r.file_id = p_file_id order by r.revision desc limit 1;
  if not found then
    return null;
  end if;
  select * into v_root from public.pieces p where p.id = v_new.revises for update;
  if v_root.revision >= v_n then
    return jsonb_build_object('piece_id', v_root.id, 'revision', v_root.revision, 'voided', 0, 'again', true);
  end if;
  update public.pieces p
     set revision = v_n, file_id = p_file_id, plan = v_new.plan, look = v_new.look, made_at = now(), updated_at = now()
   where p.id = v_root.id;
  -- What was approved of the version before and still waits stops standing: it asks again (call 14).
  update public.approvals a set voided_at = now(), voided_why = 'changed'
   where a.voided_at is null
     and a.id in (select p.approval_id from public.posts p
                   where p.tenant_id = v_root.tenant_id and p.piece_id = v_root.id and p.approval_id is not null
                     and p.status = any (array['queued', 'preparing']));
  get diagnostics v_voided = row_count;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_root.tenant_id, 'piece.moved', 'content', 'piece', v_root.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'made', 'revision', v_n, 'voided', v_voided)));
  return jsonb_build_object('piece_id', v_root.id, 'revision', v_n, 'voided', v_voided, 'again', false);
end $$;

-- piece_words_keep
CREATE OR REPLACE FUNCTION public.piece_words_keep(p_tenant_id uuid, p_file_id uuid, p_caption text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor     uuid := auth.uid();
  -- 00714: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_words     text := nullif(btrim(p_caption), '');
  v_piece     public.pieces;
  v_rev       public.piece_revisions;
  v_n         integer;
  v_post      public.posts;
  v_old       public.approvals;
  v_snapshot  jsonb;
  v_approval  uuid;
  v_followed  integer := 0;
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_piece from public.pieces p
   where p.tenant_id = p_tenant_id and p.file_id = p_file_id order by p.created_at desc limit 1 for update;
  if found then
    select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_piece.revision;
    -- A piece no placement was ever approved of keeps no version yet: its first is written at its first approval.
    if found and (v_rev.captions ->> 'instagram' is distinct from coalesce(v_words, '')
                  or v_rev.captions ->> 'google' is distinct from coalesce(v_words, '')) then
      v_n := v_piece.revision + 1;
      insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
      values (p_tenant_id, v_piece.id, v_n, v_rev.plan,
              jsonb_build_object('instagram', coalesce(v_words, ''), 'google', coalesce(v_words, '')),
              array['caption'], case when v_service then 'ai' else 'owner' end, v_actor);
      update public.pieces p set revision = v_n, updated_at = now() where p.id = v_piece.id;
    end if;
  end if;
  for v_post in
    select * from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = p_file_id and p.status = 'queued' and p.kind <> 'story'
       and p.caption is distinct from v_words
     for update
  loop
    v_approval := v_post.approval_id;
    select * into v_old from public.approvals a where a.tenant_id = p_tenant_id and a.id = v_post.approval_id;
    if found and v_old.voided_at is null then
      -- The same bytes, this placement alone, with the new words and the version they are: a new approval, by this member.
      v_snapshot := v_old.snapshot
        || jsonb_build_object(
             'revision', jsonb_build_object('piece_id', v_post.piece_id, 'n', coalesce(v_n, v_post.revision)),
             'placements', (select coalesce(jsonb_agg(e || jsonb_build_object('caption', v_words)), '[]'::jsonb)
                              from jsonb_array_elements(v_old.snapshot -> 'placements') e
                             where e ->> 'place' = v_post.place and e ->> 'kind' = v_post.kind),
             'renditions', (select coalesce(jsonb_agg(e), '[]'::jsonb)
                              from jsonb_array_elements(v_old.snapshot -> 'renditions') e
                             where e ->> 'shape' = public.post_shape(v_post.place, v_post.kind)));
      insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by, policy_edition)
      values (p_tenant_id, 'piece_revision',
              coalesce((select r.id from public.piece_revisions r
                         where r.piece_id = v_post.piece_id and r.n = coalesce(v_n, v_post.revision)), v_old.subject_id),
              v_snapshot, public.approval_hash(v_snapshot), v_actor, v_old.policy_edition)
      returning id into v_approval;
    end if;
    update public.posts p
       set caption = v_words, approval_id = v_approval, revision = coalesce(v_n, p.revision),
           approved_by = v_actor, approved_at = now(), updated_at = now()
     where p.id = v_post.id;
    v_followed := v_followed + 1;
  end loop;
  -- Its words changed, as a new version or on the posts still waiting: on the ledger once.
  if v_n is not null or v_followed > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'piece.moved', 'content', 'piece', v_piece.id,
            jsonb_strip_nulls(jsonb_build_object('to', 'words', 'revision', v_n, 'followed', v_followed, 'by', v_actor, 'file_id', p_file_id)));
  end if;
  return jsonb_build_object('revision', coalesce(v_n, v_piece.revision), 'followed', v_followed);
end $$;

-- file_media_failed
CREATE OR REPLACE FUNCTION public.file_media_failed(p_media_ref text, p_error text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  -- A copy that could not be prepared again (00654): the file stays as it was, away, with why, and lets go of the
  -- failed copy's id (the caller deletes it at the platform). Its media_status is never touched: the video itself was
  -- prepared once, and still is what its stills and its words say.
  update public.files f
     set copy_state = 'away', copy_why = 'failed', media_ref = null, updated_at = now()
   where f.id = v_row.id and f.removed_at is null and f.copy_state = 'returning' and f.media_ref = p_media_ref;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'file.media_moved', 'content', 'file', v_row.id,
            jsonb_strip_nulls(jsonb_build_object('to', 'away', 'why', 'failed', 'copy', true)));
    return jsonb_build_object('fate', 'unreturned', 'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', false);
  end if;
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
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'file.media_moved', 'content', 'file', v_row.id,
            jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'error', left(coalesce(nullif(p_error, ''), 'ERR_UNKNOWN'), 80))));
    update public.pieces p set status = 'failed', failed_why = 'store', machine = null, updated_at = now()
     where p.tenant_id = v_row.tenant_id and p.file_id = v_row.id and p.status = 'making';
    v_made := found;
  end if;
  return jsonb_build_object('fate', case when v_failed then 'failed' else 'repeated' end,
                            'tenant_id', v_row.tenant_id, 'file_id', v_row.id, 'made', v_made);
end $$;

-- file_media_processing
CREATE OR REPLACE FUNCTION public.file_media_processing(p_tenant_id uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.files f set media_status = 'processing', updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.kind = 'video' and f.media_status = 'uploading'
     and f.removed_at is null;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.media_moved', 'content', 'file', p_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'processing', 'by', v_actor)));
  end if;
end $$;
/* -- a week's plan and its slots: each move with its event -- */

-- A week's content plan moves (asked for, held to go, stopped, approved, made, its making begun) and each of its slots
-- (made into a post or a video, prepared, left out, put back, moved, approved): each now writes content_plan.moved or
-- plan_slot.moved in its own transaction, with where it moved to and who, where a member did. The goals the owner set
-- write content_goals.kept. All are kept from Activity's rows: Content draws the week as it stands.

-- plan_slot_made
CREATE OR REPLACE FUNCTION public.plan_slot_made(p_tenant_id uuid, p_slot_id uuid, p_made jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor  uuid := auth.uid();
  -- 00714: the service, making a week a rung let AI approve: no member, so no member's permission to ask.
  v_service  boolean := auth.uid() is null and coalesce((select auth.role()), '') = 'service_role';
  v_slot   public.plan_slots;
  v_post   uuid := nullif(p_made ->> 'post_id', '')::uuid;
  v_piece  uuid := nullif(p_made ->> 'piece_id', '')::uuid;
  v_held   jsonb := p_made -> 'held';
begin
  if v_actor is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null
     or (not v_service and not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false)) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_slot from public.plan_slots s where s.tenant_id = p_tenant_id and s.id = p_slot_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_slot.state <> 'approved' or v_slot.post_id is not null then
    return jsonb_build_object('fate', v_slot.state);
  end if;
  if v_post is not null then
    if not exists (select 1 from public.posts p where p.tenant_id = p_tenant_id and p.id = v_post) then
      return jsonb_build_object('fate', 'gone');
    end if;
    update public.plan_slots set post_id = v_post, updated_at = now() where id = v_slot.id;
  elsif v_piece is not null then
    if not exists (select 1 from public.pieces p where p.tenant_id = p_tenant_id and p.id = v_piece) then
      return jsonb_build_object('fate', 'gone');
    end if;
    update public.plan_slots set piece_id = v_piece, updated_at = now() where id = v_slot.id;
  elsif jsonb_typeof(v_held) = 'object' then
    update public.plan_slots set state = 'blocked', blocked_why = v_held ->> 'why',
                                 blocked_reason = left(btrim(v_held ->> 'reason'), 400), updated_at = now()
     where id = v_slot.id;
  else
    raise exception 'A slot is made into a post or a video, or held with why.' using errcode = '22023';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'plan_slot.moved', 'content', 'plan_slot', v_slot.id,
          jsonb_strip_nulls(jsonb_build_object('to', case when v_post is not null then 'post' when v_piece is not null then 'piece' else 'blocked' end, 'why', v_held ->> 'why', 'by', v_actor)));
  return jsonb_build_object('fate', 'made', 'slot_id', v_slot.id);
end $$;

-- plan_slot_prepared
CREATE OR REPLACE FUNCTION public.plan_slot_prepared(p_tenant_id uuid, p_slot_id uuid, p_prepared jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service prepares a slot.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_prepared) is distinct from 'object' or (p_prepared ->> 'file_id') is null
     or (p_prepared ->> 'from') is null or (p_prepared ->> 'at') is null
     or jsonb_typeof(p_prepared -> 'approval') is distinct from 'object' then
    raise exception 'A prepared slot names its made file, the footage it was drawn from, its time and its approval.' using errcode = '22023';
  end if;
  -- Only as the slot stands: its footage swapped while its picture was drawn, the drawing is of what it no longer shows.
  update public.plan_slots s set prepared = p_prepared, updated_at = now()
    from public.content_plans p
   where s.tenant_id = p_tenant_id and s.id = p_slot_id and s.state = 'proposed'
     and s.file_id = (p_prepared ->> 'from')::uuid
     and p.tenant_id = p_tenant_id and p.id = s.plan_id and p.status = 'ready';
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'plan_slot.moved', 'content', 'plan_slot', p_slot_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'prepared', 'file_id', p_prepared ->> 'file_id')));
  return true;
end $$;

-- plan_slot_set
CREATE OR REPLACE FUNCTION public.plan_slot_set(p_tenant_id uuid, p_slot_id uuid, p_change jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor     uuid := auth.uid();
  v_slot      public.plan_slots;
  v_to        text := p_change ->> 'to';
  v_approval  uuid;
  v_snapshot  jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_slot from public.plan_slots s where s.tenant_id = p_tenant_id and s.id = p_slot_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_slot.state = 'posted' or v_slot.post_id is not null then
    return jsonb_build_object('fate', 'posted');
  end if;
  if v_to = 'removed' then
    update public.plan_slots set state = 'removed', blocked_why = null, blocked_reason = null, updated_at = now()
     where id = v_slot.id;
  elsif v_to = 'proposed' then
    if v_slot.state not in ('removed', 'blocked', 'needs_footage') then
      return jsonb_build_object('fate', v_slot.state);
    end if;
    update public.plan_slots set state = 'proposed', blocked_why = null, blocked_reason = null,
                                 file_id = coalesce(nullif(p_change ->> 'file_id', '')::uuid, file_id),
                                 updated_at = now()
     where id = v_slot.id;
  elsif v_to = 'at' then
    if (p_change ->> 'at')::timestamptz <= now() then
      return jsonb_build_object('fate', 'past');
    end if;
    update public.plan_slots set at = (p_change ->> 'at')::timestamptz, updated_at = now() where id = v_slot.id;
  elsif v_to = 'approved' then
    -- A proposed slot, or an approved one that could not be made, or whose video was not (Try again): its own approval,
    -- and it is made anew.
    if not (v_slot.state = 'proposed' or (v_slot.state = 'blocked' and v_slot.blocked_why = 'unmade')
            or (v_slot.state = 'approved' and exists (select 1 from public.pieces p
                                                     where p.tenant_id = p_tenant_id and p.id = v_slot.piece_id
                                                       and p.status = 'failed'))) then
      return jsonb_build_object('fate', v_slot.state);
    end if;
    v_snapshot := jsonb_build_object('slots', jsonb_build_array(jsonb_build_object(
      'id', v_slot.id, 'place', v_slot.place, 'kind', v_slot.kind, 'at', v_slot.at, 'file_id', v_slot.file_id,
      'title', v_slot.title, 'intent', v_slot.intent)));
    insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by)
    values (p_tenant_id, 'plan', v_slot.plan_id, v_snapshot, public.approval_hash(v_snapshot), v_actor)
    returning id into v_approval;
    update public.plan_slots set state = 'approved', approval_id = v_approval, blocked_why = null, blocked_reason = null,
                                 piece_id = null, updated_at = now()
     where id = v_slot.id;
  else
    raise exception 'A slot is left out, put back, moved or approved.' using errcode = '22023';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'plan_slot.moved', 'content', 'plan_slot', v_slot.id,
          jsonb_strip_nulls(jsonb_build_object('to', v_to, 'from', v_slot.state, 'at', case when v_to = 'at' then p_change ->> 'at' end, 'by', v_actor)));
  return jsonb_build_object('fate', 'done', 'slot_id', v_slot.id, 'approval_id', v_approval);
end $$;

-- content_plan_begin
CREATE OR REPLACE FUNCTION public.content_plan_begin(p_tenant_id uuid, p_week_of date, p_asked_by text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_plan public.content_plans;
begin
  select * into v_plan from public.content_plans p
   where p.tenant_id = p_tenant_id and p.week_of = p_week_of for update;
  if found and v_plan.status in ('approved', 'done') then
    return jsonb_build_object('fate', 'approved', 'plan_id', v_plan.id);
  end if;
  if found then
    delete from public.plan_slots s where s.tenant_id = p_tenant_id and s.plan_id = v_plan.id;
    update public.content_plans set status = 'drafting', fewer = null, ready_at = null, asked_by = p_asked_by,
                                    asked_at = now()
     where id = v_plan.id returning * into v_plan;
  else
    insert into public.content_plans (tenant_id, week_of, asked_by) values (p_tenant_id, p_week_of, p_asked_by)
    returning * into v_plan;
  end if;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'content_plan', now(), jsonb_build_object('plan_id', v_plan.id))
  on conflict do nothing;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', v_plan.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'drafting', 'week_of', p_week_of, 'asked_by', p_asked_by, 'by', auth.uid())));
  return jsonb_build_object('fate', 'drafting', 'plan_id', v_plan.id);
end $$;

-- content_week_stop
CREATE OR REPLACE FUNCTION public.content_week_stop(p_tenant_id uuid, p_plan_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor  uuid := auth.uid();
  v_plan   public.content_plans;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'ready' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  if v_plan.goes_at is null then
    return jsonb_build_object('fate', 'asks');
  end if;
  -- Nothing more of it is prepared: a making already begun still holds its place until it is said done.
  update public.content_plans set goes_at = null, stopped_at = now(), stopped_by = v_actor, make_queued_at = null
   where id = v_plan.id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', v_plan.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'stopped', 'by', v_actor)));
  return jsonb_build_object('fate', 'stopped', 'plan_id', v_plan.id);
end $$;

-- content_week_hold
CREATE OR REPLACE FUNCTION public.content_week_hold(p_tenant_id uuid, p_plan_id uuid, p_goes_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_plan    public.content_plans;
  v_rung    text;
  v_first   timestamptz;
  v_spread  integer;
  v_due     timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service holds a week.' using errcode = '42501';
  end if;
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  select p.mode into v_rung from public.policies p
   where p.tenant_id = p_tenant_id and p.class = 'plan_approve' and p.subject_type is null;
  -- Let go: asked to, or a week no longer ready, stopped, or under a rung that asks. Nothing on a screen says it goes up,
  -- and nothing of it is prepared.
  if p_goes_at is null or v_plan.status <> 'ready' or v_plan.stopped_at is not null
     or v_rung is null or v_rung not in ('veto', 'auto') then
    update public.content_plans set goes_at = null, make_queued_at = null
     where id = v_plan.id and status = 'ready' and (goes_at is not null or make_queued_at is not null);
    if found then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', v_plan.id,
              jsonb_strip_nulls(jsonb_build_object('to', 'let_go')));
    end if;
    return jsonb_build_object('fate', case when p_goes_at is null then 'let_go'
                                           when v_plan.status <> 'ready' then v_plan.status
                                           when v_plan.stopped_at is not null then 'stopped'
                                           else 'asks' end);
  end if;
  if p_goes_at < now() - interval '1 minute' or p_goes_at > now() + interval '8 days' then
    raise exception 'A week is held to a time within the week ahead.' using errcode = '22023';
  end if;
  select min(s.at) into v_first from public.plan_slots s
   where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id and s.state = 'proposed';
  -- Its approval is spread over the hour after its time, each well before its own first post, so a zone's 8:00 never
  -- arrives at once.
  v_spread := greatest(0, least(3600,
    floor(extract(epoch from (coalesce(v_first, p_goes_at) - p_goes_at - interval '20 minutes')))::integer));
  v_due := p_goes_at + make_interval(secs => (abs(hashtext(p_plan_id::text)::bigint) % (v_spread + 1))::integer);
  -- Prepared ahead, in turn, the earliest first post first: its pictures drawn and their approvals readied, nothing placed.
  update public.content_plans set goes_at = p_goes_at, make_queued_at = now(), first_post_at = v_first, made_at = null,
                                  make_tries = 0
   where id = v_plan.id;
  -- One a plan: held again (the week drafted again, or a later time), its job moves with it.
  update public.jobs j set due_at = v_due
   where j.tenant_id = p_tenant_id and j.kind = 'content_week_go' and j.payload ->> 'plan_id' = p_plan_id::text
     and j.state = 'scheduled';
  if not found then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'content_week_go', v_due, jsonb_build_object('plan_id', p_plan_id::text))
    on conflict do nothing;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', v_plan.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'held', 'goes_at', p_goes_at, 'mode', v_rung)));
  return jsonb_build_object('fate', 'held', 'goes_at', p_goes_at, 'due_at', v_due, 'mode', v_rung);
end $$;

-- content_week_approve
CREATE OR REPLACE FUNCTION public.content_week_approve(p_tenant_id uuid, p_plan_id uuid, p_snapshot jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- content_week_made
CREATE OR REPLACE FUNCTION public.content_week_made(p_tenant_id uuid, p_plan_id uuid, p_pass text, p_cap integer, p_lease_seconds integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_found  boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service says a week was made.' using errcode = '42501';
  end if;
  if p_pass is null or p_pass not in ('prepare', 'make') then
    raise exception 'A week is prepared while held, or made once approved.' using errcode = '22023';
  end if;
  update public.content_plans set made_at = now()
   where tenant_id = p_tenant_id and id = p_plan_id and made_at is null
     and ((p_pass = 'prepare' and status = 'ready') or (p_pass = 'make' and status = 'approved'));
  v_found := found;
  if v_found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', p_plan_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'made', 'pass', p_pass)));
  end if;
  if not v_found then
    -- A pass the week has moved past (approved while it was being prepared): its place is free for the next.
    update public.content_plans set making_since = null
     where tenant_id = p_tenant_id and id = p_plan_id and made_at is null;
  end if;
  return jsonb_build_object('fate', case when v_found then 'made' else 'moved_on' end,
                            'started', public.content_weeks_start(p_cap, p_lease_seconds));
end $$;

-- content_weeks_start
CREATE OR REPLACE FUNCTION public.content_weeks_start(p_cap integer, p_lease_seconds integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_free     integer;
  v_started  integer := 0;
  v_plan     record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Only the service starts the making queue.' using errcode = '42501';
  end if;
  if p_cap is null or p_cap not between 1 and 200 or p_lease_seconds is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'A cap of 1 to 200 at once, and a lease of a minute to an hour.' using errcode = '22023';
  end if;
  -- One start at a time, platform-wide: the count below is of what is there.
  perform pg_advisory_xact_lock(hashtextextended('content_weeks_start', 42));
  -- Being made now: begun, not said done, within its lease. A week stopped or approved meanwhile still holds its place.
  select p_cap - count(*) into v_free from public.content_plans p
   where p.made_at is null and p.making_since > now() - make_interval(secs => p_lease_seconds);
  if v_free <= 0 then
    return 0;
  end if;
  -- Held and not stopped (prepared ahead), or approved by nobody's press under the rung (what is left made). A week its
  -- owner approved by hand is made by that press, never here.
  for v_plan in
    select p.id, p.tenant_id from public.content_plans p
     where p.make_queued_at is not null and p.made_at is null and p.make_tries < 3
       and (p.making_since is null or p.making_since <= now() - make_interval(secs => p_lease_seconds))
       and ((p.status = 'ready' and p.goes_at is not null and p.stopped_at is null)
            or (p.status = 'approved' and p.approved_by is null))
     order by p.first_post_at nulls last, p.make_queued_at, p.id
     limit v_free
     for update skip locked
  loop
    update public.content_plans set making_since = now(), make_tries = make_tries + 1 where id = v_plan.id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_plan.tenant_id, 'content_plan.moved', 'content', 'content_plan', v_plan.id,
            jsonb_strip_nulls(jsonb_build_object('to', 'making')));
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_plan.tenant_id, 'content_week_make', now(), jsonb_build_object('plan_id', v_plan.id::text))
    on conflict do nothing;
    v_started := v_started + 1;
  end loop;
  return v_started;
end $$;

-- content_goals_keep
CREATE OR REPLACE FUNCTION public.content_goals_keep(p_tenant_id uuid, p_goals jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_goal  jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_goals) <> 'array' or jsonb_array_length(p_goals) > 8 then
    raise exception 'Goals are a list of at most eight.' using errcode = '22023';
  end if;
  -- The whole set at once: what the owner said now stands, what they said before stops standing.
  update public.content_goals set active = false where tenant_id = p_tenant_id and active;
  for v_goal in select e from jsonb_array_elements(p_goals) e loop
    insert into public.content_goals (tenant_id, goal, detail, weight, created_by)
    values (p_tenant_id, v_goal ->> 'goal', coalesce(v_goal -> 'detail', '{}'::jsonb),
            coalesce((v_goal ->> 'weight')::real, 1), v_actor);
  end loop;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_goals.kept', 'content', 'workspace', p_tenant_id,
          jsonb_strip_nulls(jsonb_build_object('goals', jsonb_array_length(p_goals), 'by', v_actor)));
  return coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.content_goals g
                    where g.tenant_id = p_tenant_id and g.active), '[]'::jsonb);
end $$;

-- content_plan_write
CREATE OR REPLACE FUNCTION public.content_plan_write(p_tenant_id uuid, p_plan_id uuid, p_slots jsonb, p_fewer text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_plan  public.content_plans;
  v_slot  jsonb;
begin
  select * into v_plan from public.content_plans p where p.tenant_id = p_tenant_id and p.id = p_plan_id for update;
  if not found then
    return jsonb_build_object('fate', 'gone');
  end if;
  if v_plan.status <> 'drafting' then
    return jsonb_build_object('fate', v_plan.status);
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 40 then
    raise exception 'A plan''s slots are a list of at most forty.' using errcode = '22023';
  end if;
  delete from public.plan_slots s where s.tenant_id = p_tenant_id and s.plan_id = p_plan_id;
  for v_slot in select e from jsonb_array_elements(p_slots) e loop
    insert into public.plan_slots (tenant_id, plan_id, creative, place, kind, at, title, reason, file_id, intent, words,
                                   state, blocked_why, blocked_reason, ask, score)
    values (p_tenant_id, p_plan_id, (v_slot ->> 'creative')::uuid, v_slot ->> 'place', v_slot ->> 'kind',
            (v_slot ->> 'at')::timestamptz, v_slot ->> 'title', nullif(v_slot ->> 'reason', ''),
            nullif(v_slot ->> 'file_id', '')::uuid, nullif(v_slot -> 'intent', 'null'::jsonb),
            nullif(v_slot -> 'words', 'null'::jsonb), coalesce(v_slot ->> 'state', 'proposed'), nullif(v_slot ->> 'blocked_why', ''),
            nullif(v_slot ->> 'blocked_reason', ''), nullif(v_slot -> 'ask', 'null'::jsonb),
            nullif(v_slot -> 'score', 'null'::jsonb));
  end loop;
  update public.content_plans set status = 'ready', fewer = nullif(btrim(coalesce(p_fewer, '')), ''), ready_at = now()
   where id = p_plan_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'content_plan.moved', 'content', 'content_plan', p_plan_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'ready', 'slots', jsonb_array_length(p_slots))));
  return jsonb_build_object('fate', 'ready', 'slots', jsonb_array_length(p_slots));
end $$;

-- content_plans_hand_out
CREATE OR REPLACE FUNCTION public.content_plans_hand_out(p_spread_seconds integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  record;
  v_handed  integer := 0;
  v_answer  jsonb;
begin
  for v_tenant in
    select t.id, (((now() at time zone t.timezone)::date) + 1) as week_of
      from public.tenants t
      join public.tenant_config c on c.tenant_id = t.id
     where coalesce((c.config -> 'features' ->> 'content_plan')::boolean, false)
       and extract(isodow from (now() at time zone t.timezone)) = 7
       and extract(hour from (now() at time zone t.timezone)) >= 18
       and not exists (select 1 from public.content_plans p
                        where p.tenant_id = t.id and p.week_of = ((now() at time zone t.timezone)::date) + 1)
  loop
    v_answer := public.content_plan_begin(v_tenant.id, v_tenant.week_of, 'clock');
    if v_answer ->> 'fate' = 'drafting' then
      update public.jobs set due_at = now() + make_interval(secs => abs(hashtext(v_tenant.id::text)::bigint)
                                                             % greatest(p_spread_seconds, 1))
       where tenant_id = v_tenant.id and kind = 'content_plan' and payload ->> 'plan_id' = v_answer ->> 'plan_id'
         and state = 'scheduled';
      v_handed := v_handed + 1;
    end if;
  end loop;
  -- A week that has passed is done.
  with done as (
    update public.content_plans p set status = 'done', done_at = now()
      from public.tenants t
     where t.id = p.tenant_id and p.status in ('ready', 'approved')
       and p.week_of + 7 <= (now() at time zone t.timezone)::date
    returning p.id, p.tenant_id
  )
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select d.tenant_id, 'content_plan.moved', 'content', 'content_plan', d.id, jsonb_build_object('to', 'done')
    from done d;
  return v_handed;
end $$;
/* -- a video's copy at the platform, and its copy on the shelf: each move with its event -- */

-- A video's copy at the platform moves (going to make room, gone, kept, returning, lost, back) and its copy on the shelf
-- (begun, saved again, checked, failed): each now writes file_copy.moved or file_shelf.moved in its own transaction,
-- with where it moved to and why. Both are kept from Activity's rows: Files says where each copy stands.

-- file_copies_let_go
CREATE OR REPLACE FUNCTION public.file_copies_let_go(p_tenant_id uuid, p_seconds numeric, p_unused_before timestamp with time zone, p_rested_before timestamp with time zone, p_limit integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_short numeric;
  v_gone  jsonb;
begin
  -- One at a time, as every door that names or files takes it (00551): the room is read under it.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- By room: how many seconds must be freed for a video of p_seconds to fit. None: nothing is let go.
  if p_seconds is not null then
    v_short := p_seconds - public.video_seconds_free(p_tenant_id);
    if v_short <= 0 then
      return '[]'::jsonb;
    end if;
  end if;
  with eligible as (
    -- Only what can come back is let go by itself: a watched folder's clip its owner did not also upload, that can
    -- be fetched again (00674: a folder being read, or one stopped whose account reads), or a video with a checked
    -- copy on the shelf (00695); playable, looked at (or past the week a look is tried again in); named by no video
    -- being made; and not used, or arrived, since the rest began.
    select f.id, f.seconds, coalesce(f.copy_used_at, f.ready_at, f.created_at) as used_at
      from public.files f
     where f.tenant_id = p_tenant_id and f.kind = 'video'
       and f.removed_at is null and f.copy_state = 'here' and f.media_status = 'ready' and f.media_ref is not null
       and (f.look_status = any (array['done', 'refused']) or f.created_at < now() - interval '7 days')
       and coalesce(f.copy_used_at, f.ready_at, f.created_at) < p_rested_before
       and ((public.file_road_is_watched(f.source) and not f.owner_uploaded
             and public.file_copy_comes_back(f.tenant_id, f.id))
            or public.file_copy_shelved(f.tenant_id, f.id))
       and not exists (select 1 from public.pieces p
                        where p.tenant_id = f.tenant_id and p.status = 'making'
                          and position(f.id::text in p.plan::text) > 0)
  ),
  ranked as (
    select e.id, e.used_at,
           coalesce(sum(coalesce(e.seconds, 0)) over (order by e.used_at, e.id
                                                      rows between unbounded preceding and 1 preceding), 0) as freed_before,
           sum(coalesce(e.seconds, 0)) over () as freed_all,
           row_number() over (order by e.used_at, e.id) as place
      from eligible e
  ),
  chosen as (
    select r.id from ranked r
     where r.place <= greatest(p_limit, 1)
       and case
             -- By room: the least recently used, as many as free what is short, and none where all of them would not.
             when p_seconds is not null then r.freed_all >= v_short and r.freed_before < v_short
             -- By age: each one unused since the time given.
             else p_unused_before is not null and r.used_at < p_unused_before
           end
  ),
  going as (
    update public.files f
       set copy_state = 'going', copy_why = null, updated_at = now()
      from chosen c
     where f.id = c.id and f.copy_state = 'here'
    returning f.id, f.tenant_id, f.media_ref, f.seconds
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select g.tenant_id, 'file_copy.moved', 'content', 'file', g.id, jsonb_build_object('to', 'going')
      from going g
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'media_ref', g.media_ref, 'seconds', g.seconds)), '[]'::jsonb)
    into v_gone
    from going g;
  return v_gone;
end $$;

-- file_copy_gone
CREATE OR REPLACE FUNCTION public.file_copy_gone(p_tenant_id uuid, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_why text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Away where an origin can still give it back; lost, with why, where none can any more.
  v_why := public.file_copy_standing(p_tenant_id, p_id);
  update public.files f
     set copy_state = case when v_why is null then 'away' else 'lost' end, copy_why = v_why, media_ref = null,
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.copy_state = 'going';
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
          jsonb_strip_nulls(jsonb_build_object('to', case when v_why is null then 'away' else 'lost' end, 'why', v_why)));
  -- There is room again: what waited for room in the videos is due now, as when a video is removed (00643).
  update public.source_items i
     set take_after = null
   where i.tenant_id = p_tenant_id and i.state = 'waiting' and i.why = 'room';
  return true;
end $$;

-- file_copy_kept
CREATE OR REPLACE FUNCTION public.file_copy_kept(p_tenant_id uuid, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- Marked going, and nothing was deleted: it still holds its id at the video platform, and plays.
  update public.files f
     set copy_state = 'here', copy_why = null, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id and f.copy_state = 'going' and f.media_ref is not null;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'here')));
  return true;
end $$;

-- file_copy_return_failed
CREATE OR REPLACE FUNCTION public.file_copy_return_failed(p_tenant_id uuid, p_id uuid, p_why text, p_media_ref text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- By the attempt's own copy (or none, where the platform was never asked): a later return is never undone by an
  -- earlier one's failure.
  update public.files f
     set copy_state = 'away', copy_why = p_why, media_ref = null, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id
     and f.copy_state = 'returning' and f.media_ref is not distinct from p_media_ref;
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'away', 'why', p_why)));
  return true;
end $$;

-- file_copy_settle
CREATE OR REPLACE FUNCTION public.file_copy_settle(p_tenant_id uuid, p_file_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_why text := public.file_copy_standing(p_tenant_id, p_file_id);
  v_row public.files;
begin
  -- Only a copy that is away or lost is moved: one that is here, going or returning says where it stands itself.
  update public.files f
     set copy_state = case when v_why is null then 'away' else 'lost' end, copy_why = v_why, updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_file_id
     and ((f.copy_state = 'away' and v_why is not null)
          or (f.copy_state = 'lost' and v_why is distinct from f.copy_why));
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_file_id,
            jsonb_strip_nulls(jsonb_build_object('to', case when v_why is null then 'away' else 'lost' end, 'why', v_why)));
  end if;
  select * into v_row from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found then
    return jsonb_build_object('copy_state', null);
  end if;
  return jsonb_build_object('copy_state', v_row.copy_state, 'copy_why', v_row.copy_why,
                            'item_id', public.file_copy_origin(p_tenant_id, p_file_id),
                            'shelf', public.file_copy_shelved(p_tenant_id, p_file_id));
end $$;

-- file_copy_return_begin
CREATE OR REPLACE FUNCTION public.file_copy_return_begin(p_tenant_id uuid, p_id uuid, p_units bigint, p_platform_bytes_max bigint, p_workspace_returns_max integer, p_units_max bigint, p_stale_seconds integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- Google counts a day in Pacific time, as a take's budget does (00643 source_take_spend).
  v_day     date := (now() at time zone 'America/Los_Angeles')::date;
  v_from    timestamptz := v_day::timestamp at time zone 'America/Los_Angeles';
  v_until   timestamptz := (v_day + 1)::timestamp at time zone 'America/Los_Angeles';
  v_row     public.files;
  v_why     text;
  v_binds   text;
  v_spent   public.source_days;
  v_returns integer;
  v_shelf   boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_row from public.files f where f.tenant_id = p_tenant_id and f.id = p_id for update;
  if not found or v_row.removed_at is not null or v_row.kind <> 'video' then
    return jsonb_build_object('fate', 'none');
  end if;
  if v_row.copy_state = any (array['here', 'going']) then
    return jsonb_build_object('fate', v_row.copy_state);
  end if;
  -- Being brought back already: a second asker joins it. One whose job died before the platform was asked (it holds
  -- no id, and nothing touched it for a while) is begun again; its room is still held, and its budget was spent.
  if v_row.copy_state = 'returning'
     and (v_row.media_ref is not null
          or v_row.updated_at >= now() - make_interval(secs => greatest(p_stale_seconds, 0))) then
    return jsonb_build_object('fate', 'returning');
  end if;
  v_why := public.file_copy_standing(p_tenant_id, p_id);
  if v_why is not null then
    update public.files f set copy_state = 'lost', copy_why = v_why, media_ref = null, updated_at = now()
     where f.id = p_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'lost', 'why', v_why)));
    return jsonb_build_object('fate', 'lost', 'why', v_why);
  end if;
  if v_row.copy_state <> 'returning' then
    -- Its own length must fit, as a take's: no room is the caller's to make (file_copies_let_go), and to ask again.
    if public.file_video_room(p_tenant_id, v_row.seconds) = 'minutes' then
      update public.files f set copy_state = 'away', copy_why = 'room', updated_at = now() where f.id = p_id;
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
              jsonb_strip_nulls(jsonb_build_object('to', 'away', 'why', 'room')));
      return jsonb_build_object('fate', 'room', 'seconds', v_row.seconds);
    end if;
    select count(*) into v_returns from public.files f
     where f.tenant_id = p_tenant_id and f.copy_returned_at >= v_from;
    v_shelf := public.file_copy_shelved(p_tenant_id, p_id);
    if v_shelf then
      -- From the shelf (00695): Chanlytics' own, so nothing of a provider's day is asked or written. The workspace's
      -- own number of returns a day still binds.
      if v_returns + 1 > p_workspace_returns_max then
        update public.files f set copy_state = 'away', copy_why = 'budget', updated_at = now() where f.id = p_id;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
                jsonb_strip_nulls(jsonb_build_object('to', 'away', 'why', 'budget', 'binds', 'workspace_returns')));
        return jsonb_build_object('fate', 'wait', 'binds', 'workspace_returns', 'until', v_until);
      end if;
    else
      -- The day's budgets: each return is a whole download again.
      insert into public.source_days (day) values (v_day) on conflict (day) do nothing;
      select * into v_spent from public.source_days d where d.day = v_day for update;
      v_binds := case
        when v_spent.units + greatest(p_units, 0) > p_units_max then 'units'
        when v_spent.bytes + greatest(v_row.bytes, 0) > p_platform_bytes_max then 'platform_bytes'
        when v_returns + 1 > p_workspace_returns_max then 'workspace_returns'
      end;
      if v_binds is not null then
        update public.files f set copy_state = 'away', copy_why = 'budget', updated_at = now() where f.id = p_id;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
                jsonb_strip_nulls(jsonb_build_object('to', 'away', 'why', 'budget', 'binds', v_binds)));
        return jsonb_build_object('fate', 'wait', 'binds', v_binds, 'until', v_until);
      end if;
      update public.source_days d
         set bytes = d.bytes + greatest(v_row.bytes, 0), returns = d.returns + 1, updated_at = now()
       where d.day = v_day;
    end if;
  end if;
  -- Returning from here on, so its length counts toward the minutes before the video platform is asked for anything.
  update public.files f
     set copy_state = 'returning', copy_why = null, media_ref = null,
         copy_returned_at = case when v_row.copy_state = 'returning' then f.copy_returned_at else now() end,
         updated_at = now()
   where f.id = p_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_copy.moved', 'content', 'file', p_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'returning')));
  return jsonb_build_object('fate', 'go');
end $$;

-- file_shelf_begin
CREATE OR REPLACE FUNCTION public.file_shelf_begin(p_tenant_id uuid, p_file_id uuid, p_bytes bigint, p_sha256 text, p_seconds_max numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_file  public.files;
  v_state text;
  v_used  numeric;
  v_id    uuid;
begin
  if p_bytes is null or p_bytes < 1 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A shelf copy names its bytes and their SHA-256.' using errcode = '22023';
  end if;
  -- One at a time, as every door that names or files takes it (00551): the shelf's room is read under it.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  -- Only a video made here: its own file is kept, which is what the shelf's copy is put from.
  if not found or v_file.removed_at is not null or v_file.kind <> 'video' or v_file.source <> 'made' then
    return jsonb_build_object('fate', 'none');
  end if;
  select a.state into v_state from public.file_archives a
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf';
  if found then
    return jsonb_build_object('fate', 'kept', 'state', v_state);
  end if;
  -- The shelf's room: what is there and what is on its way there, together (contracts FILE_SHELF_MINUTES_MAX).
  select coalesce(sum(f.seconds), 0) into v_used
    from public.file_archives a
    join public.files f on f.tenant_id = a.tenant_id and f.id = a.file_id
   where a.tenant_id = p_tenant_id and a.origin = 'shelf' and a.state = any (array['saving', 'saved', 'checked'])
     and f.removed_at is null;
  if v_used + coalesce(v_file.seconds, 0) > p_seconds_max then
    return jsonb_build_object('fate', 'full');
  end if;
  insert into public.file_archives (tenant_id, file_id, origin, state)
  values (p_tenant_id, p_file_id, 'shelf', 'saving')
  returning id into v_id;
  -- Its key is its workspace and its file, as the relay builds one from a ticket's own claims (apps/relay).
  insert into public.file_archive_parts (tenant_id, archive_id, part, shelf_key, bytes, sha256, state)
  values (p_tenant_id, v_id, 'video', p_tenant_id::text || '/' || p_file_id::text || '/video', p_bytes, p_sha256,
          'saving');
  -- Its job in the same step: a copy that is saving always has the job that puts it. As text: a job's once-only key
  -- is made of strings (job_dedupe_key_of).
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', p_file_id::text))
  on conflict do nothing;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'saving', 'bytes', p_bytes)));
  return jsonb_build_object('fate', 'begun');
end $_$;

-- file_shelf_again
CREATE OR REPLACE FUNCTION public.file_shelf_again(p_tenant_id uuid, p_file_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  -- The same bytes and the same SHA-256 are kept: only those can ever be put under its key.
  update public.file_archives a set state = 'saving', why = null, checked_at = null
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
     and a.state = any (array['checked', 'failed'])
     and exists (select 1 from public.files f
                  where f.tenant_id = a.tenant_id and f.id = a.file_id and f.removed_at is null)
  returning a.id into v_id;
  if not found then
    return false;
  end if;
  update public.file_archive_parts p set state = 'saving', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'file_shelve', now(), jsonb_build_object('file_id', p_file_id::text))
  on conflict do nothing;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'saving', 'again', true)));
  return true;
end $$;

-- file_shelf_failed
CREATE OR REPLACE FUNCTION public.file_shelf_failed(p_tenant_id uuid, p_file_id uuid, p_why text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
begin
  if p_why is null or p_why <> all (array['mismatch', 'not_found', 'refused']) then
    raise exception 'A shelf copy fails as a mismatch, as not found, or as refused.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  update public.file_archives a set state = 'failed', why = p_why, checked_at = null
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf'
     and a.state = any (array['saving', 'saved'])
  returning a.id into v_id;
  if not found then
    return false;
  end if;
  update public.file_archive_parts p set state = 'failed', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  -- Not found, or other bytes: the file it is put from is gone or is not the video, so a copy that is away has
  -- nothing left to give it back, and says so. Refused (the shelf would not take it) loses nothing.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'why', p_why)));
  perform public.file_copy_settle(p_tenant_id, p_file_id);
  return true;
end $$;

-- file_shelf_checked
CREATE OR REPLACE FUNCTION public.file_shelf_checked(p_tenant_id uuid, p_file_id uuid, p_bytes bigint, p_sha256 text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id     uuid;
  v_state  text;
  v_bytes  bigint;
  v_sha256 text;
  v_same   boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select a.id, a.state, p.bytes, p.sha256 into v_id, v_state, v_bytes, v_sha256
    from public.file_archives a
    join public.file_archive_parts p on p.tenant_id = a.tenant_id and p.archive_id = a.id and p.part = 'video'
   where a.tenant_id = p_tenant_id and a.file_id = p_file_id and a.origin = 'shelf';
  if not found then
    return 'none';
  end if;
  -- Compared whole: the size, and the SHA-256 the shelf itself says. One it does not say is not a match.
  v_same := p_bytes is not null and p_bytes = v_bytes and p_sha256 is not null and p_sha256 = v_sha256;
  -- Asked again of one already checked (a second run of its job): the same answer, and nothing is written.
  if v_state = 'checked' then
    return case when v_same then 'checked' else 'none' end;
  end if;
  if v_state <> all (array['saving', 'saved']) then
    return 'none';
  end if;
  if v_same then
    update public.file_archive_parts p set state = 'checked', checked_at = now()
     where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
    update public.file_archives a set state = 'checked', why = null, checked_at = now() where a.id = v_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'checked')));
    return 'checked';
  end if;
  update public.file_archive_parts p set state = 'failed', checked_at = null
   where p.tenant_id = p_tenant_id and p.archive_id = v_id and p.part = 'video';
  update public.file_archives a set state = 'failed', why = 'mismatch', checked_at = null where a.id = v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file_shelf.moved', 'content', 'file', p_file_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'failed', 'why', 'mismatch')));
  -- A copy that is away with nothing left to give it back says so.
  perform public.file_copy_settle(p_tenant_id, p_file_id);
  return 'mismatch';
end $$;
