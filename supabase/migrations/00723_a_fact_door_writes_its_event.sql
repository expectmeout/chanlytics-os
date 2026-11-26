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
/* -- a post: its sends, its attempts, its link, a take-down: each move with its event -- */

-- A post's moves that post_moved did not make (sent again, unanswered and checked, let go, moved to another time, kept
-- by hand, taken down by hand, a take-down settled or left up) now write post.moved in their own transaction; each
-- attempt at a place opened and closed writes post.attempted, a post's link made writes link.made, and a comment the
-- owner answered at the place writes comment_answer.moved. All are kept from Activity's rows: Files says where each
-- post stands.

-- post_again
CREATE OR REPLACE FUNCTION public.post_again(p_post_id uuid, p_from text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid;
begin
  -- Its first send never landed: the second and last attempt, from a fresh container, with its job, in one transaction.
  update public.posts p set status = 'queued', container_id = null, updated_at = now()
   where p.id = p_post_id and p.status = p_from and p.attempts < 2
  returning p.tenant_id into v_tenant;
  if not found then
    return false;
  end if;
  begin
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_tenant, 'post_prepare', now(), jsonb_build_object('post_id', p_post_id, 'attempt', '2'));
  exception when unique_violation then
    null;
  end;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'post.moved', 'content', 'post', p_post_id,
          jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', 'queued', 'again', true)));
  return true;
end $$;

-- post_unanswered
CREATE OR REPLACE FUNCTION public.post_unanswered(p_post_id uuid, p_attempt text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid;
begin
  -- Sent with no answer: Checking, and the reconcile that asks Instagram what it has, in one transaction, so a post is
  -- never left Checking with nothing to settle it.
  update public.posts p set status = 'checking', updated_at = now()
   where p.id = p_post_id and p.status = 'publishing'
  returning p.tenant_id into v_tenant;
  if not found then
    return false;
  end if;
  begin
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_tenant, 'post_reconcile', now() + interval '2 minutes',
            jsonb_build_object('post_id', p_post_id, 'attempt', p_attempt));
  exception when unique_violation then
    -- One is on the ledger already: it asks.
    null;
  end;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'post.moved', 'content', 'post', p_post_id,
          jsonb_strip_nulls(jsonb_build_object('from', 'publishing', 'to', 'checking', 'attempt', p_attempt)));
  return true;
end $$;

-- post_attempt_open
CREATE OR REPLACE FUNCTION public.post_attempt_open(p_post_id uuid, p_attempt_no integer, p_step text, p_request jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant uuid;
  v_row    public.publish_attempts;
begin
  select p.tenant_id into v_tenant from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  insert into public.publish_attempts (tenant_id, post_id, attempt_no, step, request)
  values (v_tenant, p_post_id, p_attempt_no, p_step, coalesce(p_request, '{}'::jsonb))
  on conflict (post_id, attempt_no, step) do nothing;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'post.attempted', 'content', 'post', p_post_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'open', 'attempt', p_attempt_no, 'step', p_step)));
  end if;
  select * into v_row from public.publish_attempts a
   where a.post_id = p_post_id and a.attempt_no = p_attempt_no and a.step = p_step;
  update public.posts p set attempts = greatest(p.attempts, p_attempt_no), updated_at = now()
   where p.id = p_post_id and p.attempts < p_attempt_no;
  -- Opened again by a run that took up where one died: the row as it stands, which may already be finished.
  return jsonb_build_object('fate', 'open', 'id', v_row.id, 'finished', v_row.finished_at is not null,
                            'outcome', v_row.outcome, 'container_id', v_row.container_id,
                            'external_id', v_row.external_id);
end $$;

-- post_attempt_close
CREATE OR REPLACE FUNCTION public.post_attempt_close(p_attempt_id uuid, p_outcome text, p_http_status integer DEFAULT NULL::integer, p_answer jsonb DEFAULT NULL::jsonb, p_container_id text DEFAULT NULL::text, p_external_id text DEFAULT NULL::text, p_error jsonb DEFAULT NULL::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post uuid;
begin
  -- Never changed once finished: a second close of the same send is the first.
  update public.publish_attempts a
     set finished_at = now(), outcome = p_outcome, http_status = p_http_status,
         answer = case when p_answer is null then null
                       when octet_length(p_answer::text) > 4096
                         then jsonb_build_object('cut', left(p_answer::text, 4000))
                       else p_answer end,
         container_id = p_container_id, external_id = p_external_id, error = p_error
   where a.id = p_attempt_id and a.finished_at is null
  returning a.post_id into v_post;
  if not found then
    return false;
  end if;
  update public.posts p
     set container_id = coalesce(p_container_id, p.container_id),
         external_id = coalesce(p_external_id, p.external_id),
         error = case when p_outcome = 'ok' then p.error else coalesce(p_error, p.error) end,
         updated_at = now()
   where p.id = v_post;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select p.tenant_id, 'post.attempted', 'content', 'post', p.id,
         jsonb_strip_nulls(jsonb_build_object('to', 'closed', 'outcome', p_outcome, 'http_status', p_http_status))
    from public.posts p where p.id = v_post;
  return true;
end $$;

-- post_pull
CREATE OR REPLACE FUNCTION public.post_pull(p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  -- stopped: let go, it waits for no one. One the owner said they posted by hand is theirs to take back (00620).
  update public.posts p set status = 'pulled', updated_at = now()
   where p.id = p_post_id
     and (p.status = any (array['queued', 'preparing', 'held', 'failed']) or (p.place = 'hand' and p.status = 'published'));
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'post.moved', 'content', 'post', p_post_id,
            jsonb_strip_nulls(jsonb_build_object('from', v_status, 'to', 'pulled', 'by', auth.uid())));
    return jsonb_build_object('fate', 'pulled');
  end if;
  return jsonb_build_object('fate', 'late', 'status', v_status);
end $$;

-- post_move
CREATE OR REPLACE FUNCTION public.post_move(p_post_id uuid, p_when timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_post.tenant_id, 'post.moved', 'content', 'post', p_post_id,
          jsonb_strip_nulls(jsonb_build_object('from', 'queued', 'to', 'queued', 'at', p_when, 'was', v_post.scheduled_for, 'by', auth.uid())));
  return jsonb_build_object('fate', 'moved');
end $$;

-- post_report
CREATE OR REPLACE FUNCTION public.post_report(p_tenant_id uuid, p_file_id uuid, p_link text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_file  public.files;
  v_link  text := nullif(btrim(p_link), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~* '^https://[^[:space:]]+$') then
    raise exception 'A link starts with https:// and is at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- Said once a piece, which the database holds (posts_one_by_hand): said again, at once or twice together, it is the same
  -- record, with the link it now has.
  insert into public.posts as p (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via,
                                 status, permalink, published_at)
  values (p_tenant_id, p_file_id, 'hand', case when v_file.kind = 'video' then 'reel' else 'picture' end, null, now(),
          v_actor, now(), 'press', 'published', v_link, now())
  on conflict (file_id) where place = 'hand' and status = 'published'
  do update set permalink = coalesce(excluded.permalink, p.permalink), updated_at = now()
  returning p.id into v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'post.moved', 'content', 'post', v_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'published', 'by_hand', true, 'by', v_actor)));
  return jsonb_build_object('fate', 'kept', 'post_id', v_id);
end $_$;

-- post_link_make
CREATE OR REPLACE FUNCTION public.post_link_make(p_tenant_id uuid, p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_post  public.posts%rowtype;
  v_lands text;
  v_link  public.links%rowtype;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'post_link_make: not a member who may act here' using errcode = '42501';
  end if;
  select * into v_post from public.posts p where p.tenant_id = p_tenant_id and p.id = p_post_id;
  if not found then
    raise exception 'post_link_make: no such post in this workspace' using errcode = 'P0002';
  end if;
  select * into v_link from public.links l
   where l.tenant_id = p_tenant_id and l.subject_type = 'post' and l.subject_id = p_post_id;
  if not found then
    -- Its call to action decides where it lands: the booking page where the piece was made to send people there, a
    -- chat with the business everywhere else ("Message us", call 23).
    select case when pc.intent->>'call_to_action' = 'book' then 'booking' else 'chat' end into v_lands
      from public.pieces pc where pc.tenant_id = p_tenant_id and pc.id = v_post.piece_id;
    insert into public.links (tenant_id, subject_type, subject_id, place, lands, created_by)
    values (p_tenant_id, 'post', p_post_id, 'The post''s link', coalesce(v_lands, 'chat'), auth.uid())
    on conflict (tenant_id, subject_id) where subject_type = 'post' do nothing
    returning * into v_link;
    if v_link.id is not null then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'link.made', 'content', 'post', p_post_id,
              jsonb_strip_nulls(jsonb_build_object('link_id', v_link.id, 'lands', v_link.lands, 'by', auth.uid())));
    end if;
    if v_link.id is null then
      select * into v_link from public.links l
       where l.tenant_id = p_tenant_id and l.subject_type = 'post' and l.subject_id = p_post_id;
    end if;
  end if;
  return jsonb_build_object('link_id', v_link.id, 'code', v_link.code, 'lands', v_link.lands,
                            'stopped', v_link.stopped_at is not null,
                            'opens', coalesce((select sum(d.opens) from public.link_days d
                                                where d.tenant_id = p_tenant_id and d.link_id = v_link.id), 0));
end $$;

-- post_own_comment_keep
CREATE OR REPLACE FUNCTION public.post_own_comment_keep(p_tenant_id uuid, p_comment_id text, p_parent_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_touch uuid;
begin
  if nullif(btrim(coalesce(p_parent_id, '')), '') is null then
    return false;
  end if;
  -- Our own answer, delivered back by Meta, is ours already.
  if exists (select 1 from public.comment_answers a
              where a.tenant_id = p_tenant_id and a.external_id = btrim(p_comment_id)) then
    return false;
  end if;
  select t.id into v_touch from public.touches t
   where t.tenant_id = p_tenant_id and t.place = 'instagram' and t.provider_event_id = btrim(p_parent_id)
     and t.kind = 'comment';
  if v_touch is null then
    return false;
  end if;
  insert into public.comment_answers (tenant_id, touch_id, state, by_hand, external_id, sent_at)
  values (p_tenant_id, v_touch, 'sent', true, btrim(p_comment_id), now())
  on conflict (tenant_id, touch_id) do update
    set state = 'sent', by_hand = true, external_id = excluded.external_id, sent_at = excluded.sent_at,
        updated_at = now()
    where comment_answers.state <> 'sent';
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'comment_answer.moved', 'content', 'comment_answer', null,
            jsonb_strip_nulls(jsonb_build_object('to', 'sent', 'by_hand', true, 'touch_id', v_touch)));
  end if;
  return true;
end $$;

-- post_take_down_by_hand
CREATE OR REPLACE FUNCTION public.post_take_down_by_hand(p_tenant_id uuid, p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  -- Left up by the owner's own word (00689): nothing is asked of the place until Take down is pressed again.
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'post.moved', 'content', 'post', p_post_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'taking_down', 'by_hand', true, 'by', auth.uid())));
  return jsonb_build_object('fate', 'asking');
end $$;

-- post_take_down_keep
CREATE OR REPLACE FUNCTION public.post_take_down_keep(p_tenant_id uuid, p_post_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'post.moved', 'content', 'post', p_post_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'left_up', 'by', auth.uid())));
  end if;
  -- The bell's line for this piece at this place ends, for every device, once nothing of the piece there is left to
  -- its owner (00698): a story of it still to delete keeps the line.
  perform public.post_by_hand_bell_settle(p_tenant_id, v_post.file_id, v_post.place);
  return v_answer;
end $$;

-- post_take_down_settle
CREATE OR REPLACE FUNCTION public.post_take_down_settle(p_action_id uuid, p_outcome text, p_said text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  if v_action.target_type = 'post' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_action.tenant_id, 'post.moved', 'content', 'post', v_action.target_id,
            jsonb_strip_nulls(jsonb_build_object('to', case when p_outcome = 'done' then 'taken_down' else 'take_down_' || p_outcome end)));
  end if;
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
/* -- a comment's answer, and a website form: each move with its event -- */

-- An answer to a comment at its place (sent, settled, left, put back) writes comment_answer.moved; a form turned on or
-- off writes form.moved, an outside form listed or renamed form.changed, and an entry a member held form_entry.held,
-- each in its own transaction. All are kept from Activity's rows: the comment's row and the Forms page say each.

-- comment_answer_settle
CREATE OR REPLACE FUNCTION public.comment_answer_settle(p_tenant_id uuid, p_touch_id uuid, p_sent boolean, p_external_id text, p_said text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.comment_answers a
     set state = case when p_sent then 'sent' else 'failed' end,
         external_id = case when p_sent then nullif(btrim(coalesce(p_external_id, '')), '') else a.external_id end,
         said = case when p_sent then null else left(nullif(btrim(coalesce(p_said, '')), ''), 300) end,
         sent_at = case when p_sent then now() else a.sent_at end,
         updated_at = now()
   where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'sending';
  if not found then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'comment_answer.moved', 'content', 'comment_answer', null,
          jsonb_strip_nulls(jsonb_build_object('to', case when p_sent then 'sent' else 'failed' end, 'touch_id', p_touch_id)));
  return true;
end $$;

-- comment_answer_leave
CREATE OR REPLACE FUNCTION public.comment_answer_leave(p_tenant_id uuid, p_touch_id uuid, p_left boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_state text;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'comment_answer_leave: not a member who may act here' using errcode = '42501';
  end if;
  if not exists (select 1 from public.touches t
                  where t.tenant_id = p_tenant_id and t.id = p_touch_id and t.kind = 'comment') then
    raise exception 'comment_answer_leave: no such comment in this workspace' using errcode = 'P0002';
  end if;
  if p_left then
    -- Left as it stands: AI's draft and its reason are kept, for an answer after all.
    insert into public.comment_answers (tenant_id, touch_id, state)
    values (p_tenant_id, p_touch_id, 'left')
    on conflict (tenant_id, touch_id) do update
      set state = 'left', updated_at = now()
      where comment_answers.state in ('drafted', 'cannot', 'failed');
  else
    update public.comment_answers a
       set state = case when a.draft is not null then 'drafted' when a.cannot_why is not null then 'cannot' end,
           updated_at = now()
     where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'left'
       and (a.draft is not null or a.cannot_why is not null);
    -- Left before AI wrote anything: back to no answer at all.
    delete from public.comment_answers a
     where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'left';
  end if;
  select a.state into v_state from public.comment_answers a where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'comment_answer.moved', 'content', 'comment_answer', null,
          jsonb_strip_nulls(jsonb_build_object('to', case when p_left then 'left' else coalesce(v_state, 'open') end, 'touch_id', p_touch_id, 'by', auth.uid())));
  return jsonb_build_object('state', v_state);
end $$;

-- comment_answer_send
CREATE OR REPLACE FUNCTION public.comment_answer_send(p_tenant_id uuid, p_touch_id uuid, p_words text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
  v_state text;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'comment_answer_send: not a member who may act here' using errcode = '42501';
  end if;
  if v_words is null or char_length(v_words) > 2200 then
    raise exception 'comment_answer_send: an answer of 1 to 2,200 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.touches t
                  where t.tenant_id = p_tenant_id and t.id = p_touch_id and t.kind = 'comment'
                    and t.contact_id is not null) then
    raise exception 'comment_answer_send: no such comment in this workspace' using errcode = 'P0002';
  end if;
  select a.state into v_state from public.comment_answers a where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id;
  if v_state in ('sending', 'sent') then
    return jsonb_build_object('sent', false, 'state', v_state);
  end if;
  insert into public.comment_answers (tenant_id, touch_id, state, words, sent_by)
  values (p_tenant_id, p_touch_id, 'sending', v_words, auth.uid())
  on conflict (tenant_id, touch_id) do update
    set state = 'sending', words = excluded.words, sent_by = excluded.sent_by, said = null, updated_at = now();
  insert into public.jobs (tenant_id, kind, payload, due_at)
  values (p_tenant_id, 'comment_reply',
          jsonb_build_object('touch_id', p_touch_id, 'step', 'send',
                             'attempt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text),
          now());
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'comment_answer.moved', 'content', 'comment_answer', null,
          jsonb_strip_nulls(jsonb_build_object('to', 'sending', 'touch_id', p_touch_id, 'by', auth.uid())));
  return jsonb_build_object('sent', true, 'state', 'sending');
end $$;

-- form_turn
CREATE OR REPLACE FUNCTION public.form_turn(p_tenant_id uuid, p_form_id uuid, p_on boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_turned integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- Only a form that was published has a state to turn: a draft goes live by form_publish.
  update public.forms
     set state = case when coalesce(p_on, false) then 'live' else 'off' end, updated_at = now()
   where tenant_id = p_tenant_id and id = p_form_id and live_version_id is not null
     and state = case when coalesce(p_on, false) then 'off' else 'live' end;
  get diagnostics v_turned = row_count;
  if v_turned > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form.moved', 'contact', 'form', p_form_id,
            jsonb_strip_nulls(jsonb_build_object('to', case when coalesce(p_on, false) then 'live' else 'off' end, 'by', auth.uid())));
  end if;
  return v_turned > 0;
end $$;

-- form_entry_hold
CREATE OR REPLACE FUNCTION public.form_entry_hold(p_tenant_id uuid, p_entry_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- 00717: a signed-in member is asked who they are. The service role (the edge, a deploy from before this door asked)
  -- and a session of the database itself (a clock, a migration) name their workspace themselves, as before.
  v_member boolean := auth.uid() is not null;
  v_held integer;
begin
  if v_member then
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  update public.form_entries
     set state = 'held', held_why = 'member'
   where tenant_id = p_tenant_id and id = p_entry_id and form_id is not null and state <> 'held' and not test;
  get diagnostics v_held = row_count;
  if v_held > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_entry.held', 'contact', 'form_entry', p_entry_id,
            jsonb_strip_nulls(jsonb_build_object('why', 'member', 'by', auth.uid())));
  end if;
  return v_held > 0;
end $$;

-- outside_form_listed
CREATE OR REPLACE FUNCTION public.outside_form_listed(p_tenant_id uuid, p_form_id uuid, p_listed boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_set integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.outside_forms o set listed = coalesce(p_listed, true)
   where o.tenant_id = p_tenant_id and o.id = p_form_id;
  get diagnostics v_set = row_count;
  if v_set > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form.changed', 'contact', 'form', p_form_id,
            jsonb_strip_nulls(jsonb_build_object('listed', coalesce(p_listed, true), 'outside', true, 'by', auth.uid())));
  end if;
  return v_set > 0;
end $$;

-- outside_form_rename
CREATE OR REPLACE FUNCTION public.outside_form_rename(p_tenant_id uuid, p_form_id uuid, p_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_renamed integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_name is not null and char_length(v_name) > 120 then
    raise exception 'A form''s name is at most 120 characters.' using errcode = '22023';
  end if;
  -- Blank goes back to the name the site sends.
  update public.outside_forms o set name = v_name where o.tenant_id = p_tenant_id and o.id = p_form_id;
  get diagnostics v_renamed = row_count;
  if v_renamed > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form.changed', 'contact', 'form', p_form_id,
            jsonb_strip_nulls(jsonb_build_object('fields', jsonb_build_array('name'), 'outside', true, 'by', auth.uid())));
  end if;
  return v_renamed > 0;
end $$;
/* -- a sequence and its people, and a batch of it: each move with its event -- */

-- A sequence kept as a draft or removed, a cold email removed, the people who leave it (their enrolments, their
-- occasions) and those an occasion enrols, and a batch cancelled, each now write sequence.changed, sequence.left,
-- sequence.enrolled or broadcast.moved in their own transaction, with who where a member did. All are kept from
-- Activity's rows: Campaigns says each sequence and batch as it stands.

-- sequence_batch_cancel
CREATE OR REPLACE FUNCTION public.sequence_batch_cancel(p_tenant_id uuid, p_batch_id uuid, p_from text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_from not in ('pending_approval', 'scheduled', 'sending') then
    return false;
  end if;
  update public.sequence_batches set state = 'canceled'
   where tenant_id = p_tenant_id and id = p_batch_id and state = p_from;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'broadcast.moved', 'message', 'broadcast', p_batch_id,
            jsonb_strip_nulls(jsonb_build_object('from', p_from, 'to', 'canceled', 'by', auth.uid())));
  end if;
  return v_n = 1;
end $$;

-- sequence_occasions_leave
CREATE OR REPLACE FUNCTION public.sequence_occasions_leave(p_tenant_id uuid, p_starts_with text, p_why text, p_except text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_left integer;
begin
  if p_starts_with is null or char_length(p_starts_with) < 3 or p_why is null then
    return 0;
  end if;
  with gone as (
    update public.sequence_occasions o
       set state = 'left', why = left(p_why, 60), settled_at = now()
     where o.tenant_id = p_tenant_id and o.state = 'waiting'
       and left(o.occasion, char_length(p_starts_with)) = p_starts_with
       and (p_except is null or o.occasion <> p_except)
    returning o.sequence_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select p_tenant_id, 'sequence.left', 'message', 'sequence', g.sequence_id,
           jsonb_build_object('people', count(*), 'why', left(p_why, 60), 'occasion', p_starts_with)
      from gone g group by g.sequence_id
    returning 1
  )
  select count(*) into v_left from gone;
  return v_left;
end $$;

-- sequence_enrollments_leave
CREATE OR REPLACE FUNCTION public.sequence_enrollments_leave(p_tenant_id uuid, p_ids uuid[], p_why text, p_by uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_why text := left(nullif(btrim(coalesce(p_why, '')), ''), 60);
  v_n int;
begin
  if p_tenant_id is null or v_why is null or coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  with gone as (
    update public.sequence_enrollments e
       set state = 'left', why = v_why, ended_at = now(), next_at = null, left_by = p_by
     where e.tenant_id = p_tenant_id and e.id = any (p_ids) and e.state = 'in'
    returning e.sequence_id, e.contact_id, e.lead_id),
  skipped as (
    update public.sequence_sends s
       set state = 'skipped', reason = v_why
      from gone g
     where s.tenant_id = p_tenant_id and s.sequence_id = g.sequence_id
       and case when g.lead_id is null then s.lead_id is null and s.contact_id = g.contact_id
                else s.lead_id = g.lead_id end
       and s.state in ('planned', 'held', 'queued', 'drafted')
    returning s.id),
  told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select p_tenant_id, 'sequence.left', 'message', 'sequence', g.sequence_id,
           jsonb_strip_nulls(jsonb_build_object('people', count(*), 'why', v_why, 'by', p_by))
      from gone g group by g.sequence_id
    returning 1)
  select count(*) into v_n from gone;
  return v_n;
end $$;

-- sequence_occasion_enrol
CREATE OR REPLACE FUNCTION public.sequence_occasion_enrol(p_tenant_id uuid, p_sequence_id uuid, p_contact_id uuid, p_occasion text, p_due_at timestamp with time zone, p_single boolean DEFAULT false, p_replaces text DEFAULT NULL::text, p_rest_days integer DEFAULT 0) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_made integer;
begin
  if p_occasion is null or p_due_at is null then
    raise exception 'sequence_occasion_enrol: an occasion has a key and a time' using errcode = '22004';
  end if;
  -- Someone erased, or not this workspace's, is enrolled in nothing.
  if not exists (select 1 from public.contacts c
                  where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.erased_at is null) then
    return 'gone';
  end if;
  -- A visit that moved: the occasions made for its other starts leave, so one reminder stands for it.
  if p_replaces is not null and char_length(p_replaces) > 0 then
    update public.sequence_occasions o
       set state = 'left', why = 'moved', settled_at = now()
     where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id and o.state = 'waiting'
       and left(o.occasion, char_length(p_replaces)) = p_replaces and o.occasion <> p_occasion;
  end if;
  -- One at a time, where the moment keeps it so: another of theirs waits here, or they are still in the sequence.
  if p_single and (
       exists (select 1 from public.sequence_occasions o
                where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id
                  and o.state = 'waiting' and o.occasion <> p_occasion)
       or exists (select 1 from public.sequence_enrollments e
                   where e.sequence_id = p_sequence_id and e.lead_id is null
                     and e.contact_id = p_contact_id and e.state = 'in')) then
    return 'busy';
  end if;
  -- A moment that rests between occasions: nothing new while another of theirs here began inside the rest, whatever
  -- became of it. A sequence's own message can be what starts its next occasion (a follow-up that carries the booking
  -- link); the rest is what keeps that from going round.
  if coalesce(p_rest_days, 0) > 0 and exists (
       select 1 from public.sequence_occasions o
        where o.sequence_id = p_sequence_id and o.contact_id = p_contact_id and o.occasion <> p_occasion
          and o.created_at > now() - make_interval(days => p_rest_days)) then
    return 'busy';
  end if;
  insert into public.sequence_occasions (tenant_id, sequence_id, contact_id, occasion, due_at, try_at)
  values (p_tenant_id, p_sequence_id, p_contact_id, p_occasion, p_due_at, p_due_at)
  on conflict (sequence_id, contact_id, occasion) do nothing;
  get diagnostics v_made = row_count;
  if v_made > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'sequence.enrolled', 'message', 'sequence', p_sequence_id,
            jsonb_strip_nulls(jsonb_build_object('occasion', p_occasion, 'due_at', p_due_at, 'contact_id', p_contact_id)));
  end if;
  return case when v_made > 0 then 'enrolled' else 'already' end;
end $$;

-- sequence_once_keep
CREATE OR REPLACE FUNCTION public.sequence_once_keep(p_tenant_id uuid, p_name text, p_once jsonb, p_id uuid DEFAULT NULL::uuid, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_name  text := left(btrim(coalesce(p_name, '')), 80);
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A message sent once is named.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_once) is distinct from 'object' then
    raise exception 'A kept one-off says who, when and what.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.sequences (tenant_id, name, starts, state, created_by, mode, once)
    values (p_tenant_id, v_name, 'date', 'draft', v_actor, null, p_once)
    returning id into v_id;
  else
    update public.sequences set name = v_name, once = p_once, updated_at = now()
     where tenant_id = p_tenant_id and id = p_id and starts = 'date' and state = 'draft'
    returning id into v_id;
    if v_id is null then
      raise exception 'Draft not found.' using errcode = 'P0002';
    end if;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'sequence.changed', 'message', 'sequence', v_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'draft', 'once', true, 'kept', p_id is not null, 'by', v_actor)));
  return jsonb_build_object('id', v_id, 'state', 'draft')
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('once', true, 'kept', p_id is not null), p_via,
         p_undo_of);
end $$;

-- sequence_discard
CREATE OR REPLACE FUNCTION public.sequence_discard(p_tenant_id uuid, p_sequence_id uuid, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_q public.sequences%rowtype;
  v_steps int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_q from public.sequences where tenant_id = p_tenant_id and id = p_sequence_id for update;
  if v_q.id is null or not (v_q.starts in ('moment', 'list') or (v_q.starts = 'date' and v_q.state = 'draft'
                                                                  and v_q.once is not null)) then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- What has sent keeps its history: a sequence that made a batch, or took anyone in, is paused, never taken away.
  if exists (select 1 from public.sequence_batches b where b.sequence_id = p_sequence_id)
     or exists (select 1 from public.sequence_enrollments e where e.sequence_id = p_sequence_id) then
    raise exception 'It has sent: pause it instead.' using errcode = 'P0001';
  end if;
  select count(*) into v_steps from public.sequence_steps where sequence_id = p_sequence_id;
  if v_q.starts = 'date' then
    -- A kept one-off (00465) has no step: the draft itself goes.
    delete from public.sequences where id = p_sequence_id;
  else
    -- Its first step goes, the steps after it with it (after_step_id cascades), and the sequence with them (00440).
    delete from public.sequence_steps where id = p_sequence_id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'sequence.changed', 'message', 'sequence', p_sequence_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'removed', 'was', v_q.state, 'steps', v_steps, 'by', v_actor)));
  return jsonb_build_object('id', p_sequence_id, 'steps', v_steps)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'discard_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('name', v_q.name, 'was', v_q.state), p_via,
         p_undo_of);
end $$;

-- reach_out_remove
CREATE OR REPLACE FUNCTION public.reach_out_remove(p_tenant_id uuid, p_root_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_steps uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.sequence_steps
   where id = p_root_id and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first' for update;
  if not found then raise exception 'Cold email not found.' using errcode = 'P0002'; end if;
  with recursive c as (
    select id from public.sequence_steps where id = p_root_id
    union all
    select p.id from public.sequence_steps p join c on p.after_step_id = c.id
  )
  select array_agg(id) into v_steps from c;
  -- Held against a claim while it is judged: a claim waits, or finds the chain gone.
  perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.sequence_id = p_root_id) for update;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.sequence_id = p_root_id
                and (s.state in ('claimed', 'queued', 'sent', 'failed', 'drafted')
                     or (s.state = 'skipped' and s.drafted_at is not null)))) then
    raise exception 'This cold email has written already. Pause it instead.' using errcode = '23503';
  end if;
  update public.sequence_batches set state = 'canceled'
   where tenant_id = p_tenant_id and audience->>'kind' = 'reach_out' and audience->>'root_id' = p_root_id::text
     and state in ('pending_approval', 'scheduled', 'sending');
  update public.templates set hidden_at = coalesce(hidden_at, now())
   where id in (select p.template_id from public.sequence_steps p where p.id = any (v_steps));
  delete from public.sequence_steps where id = p_root_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'sequence.changed', 'message', 'playbook', p_root_id,
          jsonb_strip_nulls(jsonb_build_object('to', 'removed', 'reach_out', true, 'steps', cardinality(v_steps), 'by', auth.uid())));
  return jsonb_build_object('root_id', p_root_id, 'removed', cardinality(v_steps));
end $$;
/* -- a thread: who holds it, opened, set aside, its handovers closed by an echo: each with its event -- */

-- A thread's control claimed and released (a person, a call; take over and hand back ride them), a thread opened for
-- a person, one set aside now write
-- conversation.control_moved, conversation.opened or conversation.set_aside in their own transaction (a handover
-- closed by the owner's echo is told by the escalation's own trigger, escalation.changed). All are kept from Activity's rows: the Inbox says each thread as it stands.

-- claim_conversation_control
CREATE OR REPLACE FUNCTION public.claim_conversation_control(p_tenant_id uuid, p_conversation_id uuid, p_kind text, p_by uuid, p_ref text, p_seconds integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- 00717: a signed-in member is asked who they are. The service role (the edge, a deploy from before this door asked)
  -- and a session of the database itself (a clock, a migration) name their workspace themselves, as before.
  v_member boolean := auth.uid() is not null;
  v_kind  text;
  v_by    uuid;
  v_ref   text;
  v_until timestamptz;
  v_same  boolean;
  v_live  boolean;
begin
  if v_member then
    if p_kind is distinct from 'person' or p_by is distinct from auth.uid()
       or p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_kind not in ('person', 'call') then
    raise exception 'control kind must be person or call' using errcode = '22023';
  end if;
  if p_seconds is null or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'a hold lasts between a second and a day' using errcode = '22023';
  end if;
  -- FOR UPDATE, so two claimants in the same instant are decided by the
  -- database and not by whichever of them read first. That is the whole point
  -- of the function: the same question asked as a select and then an update
  -- lets both callers believe the thread was free.
  select c.control_kind, c.control_by, c.control_ref, c.control_until
    into v_kind, v_by, v_ref, v_until
    from conversations c
   where c.id = p_conversation_id and c.tenant_id = p_tenant_id
     for update;
  if not found then
    return 'gone';
  end if;
  -- A live hold, and whose it is decides what happens next.
  --
  --   the same holder    renewing, not competing. A call sends an event every
  --                      few turns, and that is what keeps a long call from
  --                      lapsing mid-sentence.
  --   a person claiming  takes it, always. A person stepping in outranks the
  --                      machine -- that is what stepping in MEANS -- and a
  --                      colleague is not locked out of a thread by another
  --                      colleague. Coordinating between people is theirs to
  --                      do; this fact exists to keep the machine off.
  --   a call claiming    never takes a hold somebody else has. The call still
  --                      happens; it simply does not get to say the thread is
  --                      its own while a person is on it.
  v_live := v_until is not null and v_until >= now();
  v_same := v_kind = p_kind and v_by is not distinct from p_by and v_ref is not distinct from p_ref;
  if v_live and not v_same and p_kind <> 'person' then
    return 'held';
  end if;
  update conversations
     set control_kind  = p_kind,
         control_by    = p_by,
         control_ref   = p_ref,
         control_until = now() + make_interval(secs => p_seconds)
   where id = p_conversation_id and tenant_id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'conversation.control_moved', 'message', 'conversation', p_conversation_id,
          jsonb_strip_nulls(jsonb_build_object('to', case when v_live and v_same then 'renewed' else 'claimed' end, 'holder', p_kind, 'by', p_by, 'seconds', p_seconds)));
  -- Renewed is the same holder going on; taking one from somebody else is a
  -- claim, and the caller is owed the difference -- it is the line in the log
  -- that says a person stepped into a call.
  return case when v_live and v_same then 'renewed' else 'claimed' end;
end $$;

-- release_conversation_control
CREATE OR REPLACE FUNCTION public.release_conversation_control(p_tenant_id uuid, p_conversation_id uuid, p_kind text, p_by uuid, p_ref text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_released integer;
begin
  update conversations
     set control_kind = null, control_by = null, control_ref = null, control_until = null
   where id = p_conversation_id
     and tenant_id = p_tenant_id
     and control_kind = p_kind
     and control_by is not distinct from p_by
     and control_ref is not distinct from p_ref;
  get diagnostics v_released = row_count;
  if v_released > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'conversation.control_moved', 'message', 'conversation', p_conversation_id,
            jsonb_strip_nulls(jsonb_build_object('to', 'released', 'holder', p_kind, 'by', p_by)));
  end if;
  return v_released > 0;
end $$;

-- conversation_open
CREATE OR REPLACE FUNCTION public.conversation_open(p_tenant_id uuid, p_contact_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_conversation uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- This workspace's person, still here: not forgotten, not being forgotten, not folded into another.
  if not exists (
    select 1 from public.contacts c
     where c.id = p_contact_id and c.tenant_id = p_tenant_id
       and c.erased_at is null and c.erasing_since is null and c.merged_into_contact_id is null
  ) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  -- Opened, never touched: last_message_at is the message's to stamp, when one lands.
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, p_contact_id)
  on conflict (tenant_id, contact_id) do nothing;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select c.tenant_id, 'conversation.opened', 'message', 'conversation', c.id,
           jsonb_build_object('contact_id', p_contact_id, 'by', auth.uid())
      from public.conversations c where c.tenant_id = p_tenant_id and c.contact_id = p_contact_id;
  end if;
  select id into v_conversation from public.conversations
   where tenant_id = p_tenant_id and contact_id = p_contact_id;
  return v_conversation;
end $$;

-- conversation_set_aside
CREATE OR REPLACE FUNCTION public.conversation_set_aside(p_tenant_id uuid, p_conversation_id uuid, p_why text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- 00717: a signed-in member is asked who they are. The service role (the edge, a deploy from before this door asked)
  -- and a session of the database itself (a clock, a migration) name their workspace themselves, as before.
  v_member boolean := auth.uid() is not null;
  v_id uuid;
begin
  if v_member then
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_why is null or p_why not in ('pitch', 'notice') then
    raise exception 'conversation_set_aside: a thread is set aside as a pitch or a notice' using errcode = '22023';
  end if;
  -- contracts' archive move, whole, and what it was set aside as. A thread someone already has is theirs, and is left alone.
  update public.conversations
     set state = 'archived', paused_until = null, snooze_until = null, assignee_user_id = null,
         set_aside_at = now(), set_aside_why = p_why
   where id = p_conversation_id and tenant_id = p_tenant_id and assignee_user_id is null
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'conversation.set_aside', 'message', 'conversation', v_id,
          jsonb_strip_nulls(jsonb_build_object('why', p_why, 'by', auth.uid())));
  -- The platform's own close, as a reading's is: no member is named as resolving it, and no decision is recorded.
  update public.escalations
     set state = 'resolved'
   where conversation_id = p_conversation_id and tenant_id = p_tenant_id and state = 'open';
  return true;
end $$;
/* -- a message withdrawn, unsent by its writer, or complained of: each with its event -- */

-- A queued message withdrawn before it left (a member's call back, a draft let go, a turn another reply took) writes
-- message.withdrawn, an Instagram message its writer unsent writes message.unsent, and an email the person marked as
-- spam writes message.complained, each in its own transaction. All are kept from Activity's rows: the thread says each.

-- withdraw_queued
CREATE OR REPLACE FUNCTION public.withdraw_queued(p_tenant_id uuid, p_message_ids uuid[], p_reason jsonb DEFAULT NULL::jsonb) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ids uuid[];
begin
  if p_tenant_id is null then
    raise exception 'withdraw_queued: a message is withdrawn in a workspace' using errcode = '22004';
  end if;
  if p_reason is not null and (jsonb_typeof(p_reason) <> 'object' or nullif(p_reason->>'reason', '') is null) then
    raise exception 'withdraw_queued: a reason is an object that names its reason' using errcode = '22023';
  end if;
  -- The rows, then the jobs that would send them, in this one statement: a row a run has claimed is on its way and is
  -- left to say what became of it, and its job with it.
  with withdrawn as (
    update public.messages m
       set status = 'canceled', error = coalesce(p_reason, m.error)
     where m.tenant_id = p_tenant_id and m.id = any (coalesce(p_message_ids, '{}'::uuid[]))
       and m.status = 'queued' and m.sending_at is null
    returning m.id
  ), jobs_withdrawn as (
    update public.jobs j
       set state = 'canceled'
      from withdrawn w
     where j.tenant_id = p_tenant_id and j.kind = 'outbound_send' and j.state = 'scheduled'
       and j.payload ->> 'message_id' = w.id::text
    returning j.id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select p_tenant_id, 'message.withdrawn', 'message', 'message', w.id,
           jsonb_strip_nulls(jsonb_build_object('reason', p_reason ->> 'reason', 'by', auth.uid()))
      from withdrawn w
    returning 1
  )
  select coalesce(array_agg(w.id order by w.id), '{}'::uuid[]) into v_ids from withdrawn w;
  return v_ids;
end $$;

-- message_unsent
CREATE OR REPLACE FUNCTION public.message_unsent(p_tenant_id uuid, p_external_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id    uuid;
  v_media jsonb;
begin
  select m.id, m.media into v_id, v_media
    from messages m
   where m.tenant_id = p_tenant_id and m.external_id = p_external_id
     and m.channel = 'instagram' and m.direction = 'inbound' and m.sender = 'customer'
   for update;
  if v_id is null then
    return jsonb_build_object('outcome', 'none');
  end if;
  update messages
     set body = null,
         media = null,
         meta = coalesce(meta, '{}'::jsonb)
                || jsonb_build_object('unsent_at', now())
                || case when coalesce(meta, '{}'::jsonb) ? 'processed_at' then '{}'::jsonb
                        else jsonb_build_object('processed_at', now()) end
   where id = v_id;
  update jobs
     set payload = payload #- '{ig,item,message,text}' #- '{ig,item,message,attachments}'
   where tenant_id = p_tenant_id and kind = 'inbound_answer' and payload ->> 'message_id' = v_id::text;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'message.unsent', 'message', 'message', v_id,
          jsonb_strip_nulls(jsonb_build_object('channel', 'instagram')));
  return jsonb_build_object('outcome', 'forgot', 'message_id', v_id, 'storage_path', v_media ->> 'storage_path');
end $$;

-- stamp_email_complaint
CREATE OR REPLACE FUNCTION public.stamp_email_complaint(p_tenant_id uuid, p_message_id uuid, p_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_n integer;
begin
  update public.messages m
     set meta = jsonb_set(m.meta, '{email,complained_at}', to_jsonb(p_at), true)
   where m.id = p_message_id and m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
     and m.meta ? 'email' and not (m.meta->'email' ? 'complained_at');
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'message.complained', 'message', 'message', p_message_id,
            jsonb_strip_nulls(jsonb_build_object('at', p_at)));
  end if;
  return v_n > 0;
end $$;
/* -- a Library message's email and text versions, its title, hidden or shown: each with its event -- */

-- A Library message's email or text version saved, made or removed, its title set and it hidden or shown, each now
-- write template.changed in its own transaction, with what changed and who. It is kept from Activity's rows: the
-- Library says each message as it stands. (WhatsApp's versions say template.submitted and .removed, as before.)

-- set_template_hidden
CREATE OR REPLACE FUNCTION public.set_template_hidden(p_template_id uuid, p_hidden boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_hidden is null then
    raise exception 'Say whether the template is hidden.' using errcode = '22023';
  end if;
  select t.tenant_id into v_tenant from templates t where t.id = p_template_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Template not found.' using errcode = 'P0002';
  end if;
  update templates
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
   where id = p_template_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'template.changed', 'message', 'template', p_template_id,
          jsonb_strip_nulls(jsonb_build_object('to', case when p_hidden then 'hidden' else 'shown' end, 'by', v_user)));
  return jsonb_build_object('template_id', p_template_id, 'hidden', p_hidden);
end $$;

-- set_template_title
CREATE OR REPLACE FUNCTION public.set_template_title(p_template_id uuid, p_title text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_title  text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_title is not null and char_length(v_title) > 60 then
    raise exception 'A title is at most 60 characters.' using errcode = '22023';
  end if;
  select t.tenant_id into v_tenant from templates t where t.id = p_template_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Template not found.' using errcode = 'P0002';
  end if;
  update templates set title = v_title where id = p_template_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'template.changed', 'message', 'template', p_template_id,
          jsonb_strip_nulls(jsonb_build_object('fields', jsonb_build_array('title'), 'by', v_user)));
  return jsonb_build_object('template_id', p_template_id, 'title', v_title);
end $$;

-- remove_template_version
CREATE OR REPLACE FUNCTION public.remove_template_version(p_template_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_row  public.templates%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from public.templates t where t.id = p_template_id;
  -- Only an email or a text a member wrote, in a workspace the caller acts for: anything else is not a version to them.
  if v_row.id is null
     or not public.is_acting_member(v_row.tenant_id)
     or v_row.channel not in ('email', 'sms')
     or v_row.source <> 'chanlytics'
     or left(v_row.name, 10) = 'reach_out_' then
    raise exception 'Version not found.' using errcode = 'P0002';
  end if;
  begin
    delete from public.templates where id = v_row.id;
  exception when foreign_key_violation then
    -- A playbook or a broadcast still names it (their template_id keys are not cascading): the owner moves them first.
    raise exception 'A playbook or broadcast still uses this version.' using errcode = 'P0001';
  end;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'template.changed', 'message', 'template', v_row.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'removed', 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language, 'by', v_user)));
  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $$;

-- create_message_version
CREATE OR REPLACE FUNCTION public.create_message_version(p_tenant_id uuid, p_user uuid, p_name text, p_language text, p_channel text, p_subject text, p_body text, p_category text, p_variables jsonb, p_title text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_subject text := nullif(btrim(regexp_replace(coalesce(p_subject, ''), '\s+', ' ', 'g')), '');
  -- Trimmed of every kind of white space, as contracts' clean() does (btrim alone takes only spaces).
  v_body    text := regexp_replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), '^\s+|\s+$', '', 'g');
  v_title   text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_vars    jsonb := '[]'::jsonb;
  v_el      jsonb;
  v_n       int;
  v_label   text;
  v_example text;
  v_parts   jsonb;
  v_row     public.templates%rowtype;
begin
  -- The member the route acts for, asked here because the service role has no session to read (is_acting_member reads
  -- auth.uid()): a person with no seat, a viewer, another workspace's member and no one at all are one answer, as a
  -- stranger gets from save_template_version.
  if p_tenant_id is null or p_user is null or p_name is null or p_name = ''
     or not exists (
       select 1 from public.memberships m
        where m.tenant_id = p_tenant_id and m.user_id = p_user and m.role in ('owner', 'operator', 'partner')) then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  if p_channel is null or p_channel not in ('email', 'sms') then
    raise exception 'A version is written for email or text.' using errcode = '22023';
  end if;
  if left(p_name, 10) = 'reach_out_' then
    raise exception 'This email is edited in its cold email.' using errcode = '22023';
  end if;
  -- The edge's own ceiling for a template's name (contracts TEMPLATE_NAME_MAX). Its shape is the route's check.
  if char_length(p_name) > 60 then
    raise exception 'A message''s name is at most 60 characters.' using errcode = '22023';
  end if;
  -- Meta's own codes: two or three letters, and a region in capitals where there is one (en_US, es, pt_BR, fil).
  if p_language is null or p_language !~ '^[a-z]{2,3}(_[A-Z]{2})?$' then
    raise exception 'Pick a language from the list.' using errcode = '22023';
  end if;
  if p_channel = 'email' then
    if v_subject is null then
      raise exception 'Give the email a subject.' using errcode = '22023';
    end if;
    if char_length(v_subject) > 60 then
      raise exception 'A subject is at most 60 characters.' using errcode = '22023';
    end if;
    if v_body = '' then
      raise exception 'Write the email.' using errcode = '22023';
    end if;
    if char_length(v_body) > 2000 then
      raise exception 'An email is at most 2000 characters.' using errcode = '22023';
    end if;
  else
    v_subject := null;
    if v_body = '' then
      raise exception 'Write the text.' using errcode = '22023';
    end if;
    if char_length(v_body) > 1600 then
      raise exception 'A text is at most 1600 characters.' using errcode = '22023';
    end if;
  end if;

  if p_category is null or p_category not in ('marketing', 'utility') then
    raise exception 'A message is an offer or news, or about their own visit or proposal.' using errcode = '22023';
  end if;
  -- Texts carry no offers: the line is registered with the carriers for replies and appointment messages
  -- (contracts channelNeverCarries).
  if p_channel = 'sms' and p_category = 'marketing' then
    raise exception 'Texts carry no offers.' using errcode = '22023';
  end if;
  if v_title is not null and char_length(v_title) > 60 then
    raise exception 'A title is at most 60 characters.' using errcode = '22023';
  end if;

  -- The values, as the edge writes them on a WhatsApp row: [{ position, label, example }], numbered 1, 2, 3 in order,
  -- the label a person's name for the value (at most 40 characters) and the example a sample or null (at most 100).
  -- What is stored is those three keys and nothing else, whatever else the caller sent.
  if p_variables is null or jsonb_typeof(p_variables) <> 'array' then
    raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
  end if;
  for v_el, v_n in
    select e.value, e.ordinality::int from jsonb_array_elements(p_variables) with ordinality as e
  loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'position') is distinct from 'number'
       or (v_el ->> 'position') <> v_n::text
       or jsonb_typeof(v_el -> 'label') is distinct from 'string'
       or jsonb_typeof(coalesce(v_el -> 'example', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
    end if;
    v_label := nullif(btrim(regexp_replace(v_el ->> 'label', '\s+', ' ', 'g')), '');
    v_example := nullif(btrim(coalesce(v_el ->> 'example', '')), '');
    if v_label is null then
      raise exception 'Give each value a number, in order from 1, and a name.' using errcode = '22023';
    end if;
    if char_length(v_label) > 40 then
      raise exception 'A value''s name is at most 40 characters.' using errcode = '22023';
    end if;
    if char_length(v_example) > 100 then
      raise exception 'A value''s example is at most 100 characters.' using errcode = '22023';
    end if;
    v_vars := v_vars || jsonb_build_array(
      jsonb_build_object('position', v_n, 'label', v_label, 'example', v_example));
  end loop;

  -- The message must be new, in every language and on every channel: its category and slots are the first version's,
  -- and a later writer takes them from the rows, never gives them again. The lock makes two first writers of one name
  -- take turns, so the second sees the first's row.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || p_name));
  if exists (select 1 from public.templates t where t.tenant_id = p_tenant_id and t.name = p_name) then
    raise exception 'This message already exists. Write its other versions in the Library.' using errcode = '23505';
  end if;

  v_parts := case
    when p_channel = 'email' then
      jsonb_build_array(
        jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
        jsonb_build_object('type', 'BODY', 'text', v_body))
    else
      jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body))
  end;

  insert into public.templates
    (tenant_id, channel, name, language, meta_status, source, category, variables, title, components, body_preview, created_by)
  values
    (p_tenant_id, p_channel, p_name, p_language, 'approved', 'chanlytics', p_category, v_vars, v_title, v_parts, v_body, p_user)
  returning * into v_row;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'template.changed', 'message', 'template', v_row.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'made', 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language, 'by', p_user)));
  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $_$;

-- save_template_version
CREATE OR REPLACE FUNCTION public.save_template_version(p_tenant_id uuid, p_name text, p_language text, p_channel text, p_subject text, p_body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_user    uuid := auth.uid();
  v_subject text := nullif(btrim(regexp_replace(coalesce(p_subject, ''), '\s+', ' ', 'g')), '');
  -- Trimmed of every kind of white space, as contracts' clean() does (btrim alone takes only spaces).
  v_body    text := regexp_replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), '^\s+|\s+$', '', 'g');
  v_source  public.templates%rowtype;
  v_parts   jsonb;
  v_row     public.templates%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or p_name is null or p_name = ''
     or not public.is_acting_member(p_tenant_id) then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  if p_channel is null or p_channel not in ('email', 'sms') then
    raise exception 'A version is written for email or text.' using errcode = '22023';
  end if;
  if left(p_name, 10) = 'reach_out_' then
    raise exception 'This email is edited in its cold email.' using errcode = '22023';
  end if;
  -- Meta's own codes: two or three letters, and a region in capitals where there is one (en_US, es, pt_BR, fil).
  if p_language is null or p_language !~ '^[a-z]{2,3}(_[A-Z]{2})?$' then
    raise exception 'Pick a language from the list.' using errcode = '22023';
  end if;
  if p_channel = 'email' then
    if v_subject is null then
      raise exception 'Give the email a subject.' using errcode = '22023';
    end if;
    if char_length(v_subject) > 60 then
      raise exception 'A subject is at most 60 characters.' using errcode = '22023';
    end if;
    if v_body = '' then
      raise exception 'Write the email.' using errcode = '22023';
    end if;
    if char_length(v_body) > 2000 then
      raise exception 'An email is at most 2000 characters.' using errcode = '22023';
    end if;
  else
    v_subject := null;
    if v_body = '' then
      raise exception 'Write the text.' using errcode = '22023';
    end if;
    if char_length(v_body) > 1600 then
      raise exception 'A text is at most 1600 characters.' using errcode = '22023';
    end if;
  end if;

  -- The message: a row of this name, WhatsApp's first, then the one in this language. Its purpose and its slots are
  -- the version's, and its title the version starts with.
  select * into v_source
    from public.templates t
   where t.tenant_id = p_tenant_id and t.name = p_name
   order by (t.channel = 'whatsapp') desc, (t.language = p_language) desc, t.created_at
   limit 1;
  if v_source.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;

  v_parts := case
    when p_channel = 'email' then
      jsonb_build_array(
        jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
        jsonb_build_object('type', 'BODY', 'text', v_body))
    else
      jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body))
  end;

  -- A rewrite keeps what the workspace did to the row since (its title, hiding it) and takes the message's purpose and
  -- slots again, which are the message's to change.
  insert into public.templates
    (tenant_id, channel, name, language, meta_status, source, category, variables, title, components, body_preview, created_by)
  values
    (p_tenant_id, p_channel, p_name, p_language, 'approved', 'chanlytics', v_source.category, v_source.variables,
     v_source.title, v_parts, v_body, v_user)
  on conflict (tenant_id, channel, name, language) do update
     set meta_status  = 'approved',
         source       = 'chanlytics',
         category     = excluded.category,
         variables    = excluded.variables,
         components   = excluded.components,
         body_preview = excluded.body_preview
  returning * into v_row;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'template.changed', 'message', 'template', v_row.id,
          jsonb_strip_nulls(jsonb_build_object('to', 'saved', 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language, 'by', v_user)));
  return jsonb_build_object('id', v_row.id, 'channel', v_row.channel, 'name', v_row.name, 'language', v_row.language);
end $_$;
/* -- the finder's leads: aimed, exported, checked again, erased, set aside by age: each with its event -- */

-- A search aimed at a sequence writes lead_search.changed; leads marked exported, sent to be checked again or erased
-- write lead.exported, lead.checked_again or lead.erased; the leads set aside by age write retention.cleared, one row
-- per workspace, as the other clearances do. All are kept from Activity's rows: Leads says each as it stands.

-- lead_search_aim
CREATE OR REPLACE FUNCTION public.lead_search_aim(p_tenant_id uuid, p_search_id uuid, p_sequence_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.lead_searches s
                  where s.id = p_search_id and s.tenant_id = p_tenant_id and s.removed_at is null) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  -- A sequence to leads of this workspace that has not ended (a draft collects, a paused one waits), or none.
  if p_sequence_id is not null and not exists (
       select 1 from public.sequences q
        where q.id = p_sequence_id and q.tenant_id = p_tenant_id and q.starts = 'leads' and q.state <> 'ended') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  update public.lead_searches set adds_to = p_sequence_id where id = p_search_id and tenant_id = p_tenant_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead_search.changed', 'lead', 'lead_search', p_search_id,
          jsonb_strip_nulls(jsonb_build_object('adds_to', p_sequence_id, 'by', auth.uid())));
  return jsonb_build_object('search_id', p_search_id, 'adds_to', p_sequence_id);
end $$;

-- lead_export_mark
CREATE OR REPLACE FUNCTION public.lead_export_mark(p_tenant_id uuid, p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'export') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  update public.leads
     set exported_at = now()
   where tenant_id = p_tenant_id and id = any (coalesce(p_ids, '{}'::uuid[]))
     and exported_at is null and erased_at is null and blanked_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.exported', 'lead', 'workspace', p_tenant_id,
            jsonb_strip_nulls(jsonb_build_object('leads', v_n, 'by', v_user)));
  end if;
  return v_n;
end $$;

-- lead_check_again
CREATE OR REPLACE FUNCTION public.lead_check_again(p_tenant_id uuid, p_lead_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_ids  uuid[] := '{}';
  v_r    record;
  v_err  jsonb;
  v_held integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'find') then
    raise exception 'Only an owner can check a lead again.' using errcode = '42501';
  end if;
  -- The switch, read before anything is scheduled (§0.5): the mailbox check is money too.
  if not public.lead_searches_on(p_tenant_id) then
    return jsonb_build_object('error', 'paused');
  end if;
  -- And whether the workspace may spend at all (00364): this door is the session's, so the route's question is asked here too.
  v_err := public.lead_spend_refusal(p_tenant_id);
  if v_err is not null then
    return v_err;
  end if;
  -- One job per round the leads were found in: the re-check runs under the round, as the round's own checks
  -- did, and commits through lead_check_commit. Only an address whose last check did not answer is asked
  -- again, of a lead kept or in Needs review (00618: a kept one was refused, so it could never be checked
  -- again); a lead left out is not; a lead whose search is still running is left to that search's own checks;
  -- a lead with no address has nothing to check; and a lead of another workspace is not this owner's to ask about.
  for v_r in
    select m.round_id, array_agg(m.lead_id) as lead_ids
      from (
        select distinct on (m.lead_id) m.lead_id, m.round_id
          from unnest(p_lead_ids) as x(id)
          join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
          join public.lead_search_members m on m.lead_id = l.id and m.tenant_id = p_tenant_id and m.class in ('review', 'qualified') and m.blanked_at is null
          join public.lead_rounds r on r.id = m.round_id and r.state = 'ended'
         where l.email is not null and l.email_state = 'unknown'
         order by m.lead_id, r.created_at desc
      ) m
     group by m.round_id
  loop
    -- Asked only with room in this month's and today's searching (00506): a check is money, as a search is.
    if public.lead_check_ask(p_tenant_id, v_r.round_id, v_r.lead_ids) then
      v_ids := v_ids || v_r.lead_ids;
    else
      v_held := v_held + cardinality(v_r.lead_ids);
    end if;
  end loop;
  -- Nothing asked because there was no room: the owner reads why, in the words a search is refused in.
  if cardinality(v_ids) = 0 and v_held > 0 then
    return coalesce(public.lead_spend_room(p_tenant_id, public.lead_check_estimate(v_held)),
      jsonb_build_object('error', 'day_cap', 'sentence', 'Today''s searching is used up. Try again tomorrow.'));
  end if;
  if cardinality(v_ids) > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.checked_again', 'lead', 'workspace', p_tenant_id,
            jsonb_strip_nulls(jsonb_build_object('leads', cardinality(v_ids), 'by', v_user)));
  end if;
  return jsonb_build_object('scheduled', cardinality(v_ids), 'skipped', cardinality(p_lead_ids) - cardinality(v_ids));
end $$;

-- lead_erase
CREATE OR REPLACE FUNCTION public.lead_erase(p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_lead public.leads%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found or not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.memberships m where m.tenant_id = v_lead.tenant_id and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only an owner can erase a lead.' using errcode = '42501';
  end if;
  if v_lead.erased_at is not null then
    -- Idempotent: a second request is answered, not re-executed.
    return jsonb_build_object('erased', true, 'already', true);
  end if;
  -- The tombstones first, exactly as an erased person's leads are hashed
  -- (00140 leads_erase_on_contact), so no search ever finds this place, this
  -- number or this address again (§0.4).
  if v_lead.place_id is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'place', public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.phone_e164 is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'phone', public.lead_suppression_hash(v_lead.tenant_id, v_lead.phone_e164), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  if v_lead.email is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'email', public.lead_suppression_hash(v_lead.tenant_id, v_lead.email), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  -- A company's domain (00430), so the people card never makes it again and no address at it is written to.
  if v_lead.kind = 'company' and v_lead.source_key is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (v_lead.tenant_id, 'domain', public.lead_suppression_hash(v_lead.tenant_id, v_lead.source_key), 'erased')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;
  perform public.lead_blank(p_lead_id);
  update public.leads set erased_at = now(), version = version + 1 where id = p_lead_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'lead.erased', 'lead', 'lead', p_lead_id,
          jsonb_strip_nulls(jsonb_build_object('by', v_user)));
  -- No operation row: this one is final.
  return jsonb_build_object('erased', true, 'already', false);
end $$;

-- purge_leads
CREATE OR REPLACE FUNCTION public.purge_leads() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_total integer := 0;
  v_n     integer;
  r       record;
begin
  -- Untouched for 90 days: no person, no contact, no export. Set aside.
  with stale as (
    update public.leads
       set stage = 'archived', closed_reason = 'stale'
     where stage = 'ready' and contact_id is null and contacted_at is null and exported_at is null
       and found_at < now() - interval '90 days' and erased_at is null and blanked_at is null
    returning tenant_id
  ), told as (
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'retention.cleared', 'system', 'workspace', s.tenant_id,
           jsonb_build_object('what', 'leads_set_aside', 'rows', count(*))
      from stale s group by s.tenant_id
    returning 1
  )
  select count(*) into v_n from stale;
  v_total := v_total + v_n;
  -- Set aside for 180 days since it was found: its details go.
  for r in select l.id from public.leads l
            where l.closed_reason = 'stale' and l.blanked_at is null and l.erased_at is null and l.found_at < now() - interval '180 days'
  loop
    v_total := v_total + public.lead_blank(r.id);
  end loop;
  -- A place a search left out, 30 days on: the membership's details go and
  -- the lead's with them when nothing else holds it; the membership stays,
  -- excluded, so the count of what was left out does not move.
  for r in select distinct m.lead_id from public.lead_search_members m
            where m.class = 'excluded' and m.blanked_at is null and m.created_at < now() - interval '30 days'
  loop
    if not exists (select 1 from public.lead_search_members m2 where m2.lead_id = r.lead_id and m2.class <> 'excluded' and m2.blanked_at is null)
       and not exists (select 1 from public.leads l where l.id = r.lead_id and (l.contact_id is not null or l.contacted_at is not null or l.exported_at is not null)) then
      v_total := v_total + public.lead_blank(r.lead_id);
    else
      update public.lead_search_members set judgment = '{}'::jsonb, reason = '', blanked_at = now()
       where lead_id = r.lead_id and class = 'excluded' and blanked_at is null;
    end if;
  end loop;
  -- The judge's answers outlive nothing they judged.
  delete from public.lead_judgments where created_at < now() - interval '180 days';
  return v_total;
end $$;
