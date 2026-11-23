-- 00687 · A file's yes is no longer kept.
--
-- Footage a business provides is taken as cleared: nobody in it is asked for a yes, and nothing holds a post or an ad
-- for one (Ruben, 22 November 2026). The code that asked, kept and read a yes left with #2523; this takes out what it
-- left in the database, all of it empty (production, read 23 November: no row in file_consents, no file with a yes,
-- no remediation of any cause).
--
--   post_begin              Re-made without the yes it read: a piece whose photo's yes for posts was taken back took no
--                           new post (the fate taken_back). Its body is 00665's but for that. Still kept for a
--                           dashboard a deploy behind (docs/sql-map.md), and dropped by a migration of its own.
--   ads_remediate_files     Re-made with the one cause left, the owner's own take-down: nothing takes a yes back, and
--                           nothing passed a person erased. Its body is 00682's but for that line.
--   file_yes_record         Dropped: the two doors, the two helpers they called, and the two reads of what a made piece
--   file_yes_take_back      was drawn from, which only judged who was in it.
--   file_yes_restate
--   file_yes_uses
--   files_drawn_from
--   file_drawn_from
--   files.yes_for           Dropped, with their two checks and the feed's trigger re-made without them: a file's row
--   files.yes_back          is told to its workspace as before for every other column a page draws.
--   file_consents           Dropped, with its indexes, its policy and its keys.
--
-- files.who_in_it stays: file_change, file_made and piece_file_begin still write it, and nothing reads it. The seven
-- causes a remediation may name (00676, the content loop PRD's 5.3) stay as they are: that list is the PRD's.
--
-- Locks. Re-making the trigger on `files` and dropping its two columns take its lock for a moment (no row is written
-- again: a dropped column is a change to the catalog). Dropping file_consents takes, for the same moment, each table
-- it pointed at, to take its key's triggers off them: files, tenants, ask_threads and auth.users. This file waits three
-- seconds for each and no more. Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: the code first. A dashboard or an edge older than #2523 reads files.yes_for with every file and
-- would fail on each; both hosts must serve #2523 or later before this is applied. The code this file arrives with
-- only stops naming what is dropped, so it may go out before or after. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------- 1. a post's press, without the yes -- */

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
  -- One at a time per file, place and kind, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- A Google press is one call: one that died between its placement and its answer stops holding the next press after ten
  -- minutes, in the words the files sweep says it with (contracts FILE_WORDS.google.unknown). Whether it went up is still
  -- the edge's events' to say.
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words',
                                    'Google did not say whether this went up. Look on your profile before posting it again.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  -- A post and a story wait apart (00620): busy is one of the same kind on its way at that place.
  select p.id into v_busy from public.posts p
   where p.file_id = p_file_id and p.place = p_place and p.kind = p_kind
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
comment on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) is
  'A member''s press, with the settings permission (00611, 00616, 00620, 00687): a made post approved for a place, as a picture or a story, with its words and its time; a picture and a story of one piece wait apart. The placement is written, and for Instagram its first job; for Google later than two minutes on, its post_google job at its time. Answers {fate: begun, busy (the one of its kind on its way), gone, not_a_post, not_yet, post_id}.';

/* -------------------------------------------------------------------------------- 2. the ads that show a piece -- */

create or replace function public.ads_remediate_files(p_tenant_id uuid, p_actor uuid, p_cause text,
                                                      p_subject_id text, p_files uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem     uuid;
  v_ad      public.ads;
  v_kept    jsonb;
  v_act     text;
  v_outcome text;
  v_pause   jsonb := '[]'::jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_one     jsonb;
begin
  -- The one cause that reaches an ad: nobody is asked for a yes, so none is taken back, and a person in a picture is
  -- not joined to People, so an erasure names no file (00687; posts_take_down_start holds the same line).
  if p_cause is distinct from 'owner_removed' then
    raise exception 'ads_remediate_files: a take-down, the owner''s own' using errcode = '22023';
  end if;
  -- Every ad made here that shows one of the files and has not ended: running or paused, or still being set up.
  for v_ad in
    select * from public.ads a
     where a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.status in ('sending', 'made')
       and a.intent in ('on', 'paused')
       and a.approved ->> 'picture' = any (array(select f::text from unnest(p_files) f))
     order by a.id
  loop
    if v_rem is null then
      insert into public.remediations (tenant_id, cause, subject_type, subject_id, actor_user_id)
      values (p_tenant_id, p_cause, 'file', p_subject_id, p_actor)
      returning id into v_rem;
    end if;
    if v_ad.status = 'sending' then
      -- Still being set up: its launch is cancelled, stops at its next step, and removes what it made.
      v_act := 'cancel';
      v_kept := public.ad_launch_cancel(p_tenant_id, p_actor, v_ad.id, 'remediation');
      v_outcome := case when v_kept ->> 'outcome' in ('asked', 'same') then 'pending' else 'not_possible' end;
    else
      v_act := 'pause';
      v_pause := public.ad_pause_all(p_tenant_id, p_actor,
                                     jsonb_build_array(jsonb_build_object('ad_id', v_ad.id, 'version', v_ad.version)),
                                     'remediation') -> 'ads';
      v_kept := coalesce(v_pause -> 0, '{}'::jsonb);
      v_outcome := case
        -- Paused now: pending until Meta's word says so (a pause Meta was never told the undoing of stands at once).
        when v_kept ->> 'outcome' = 'asked' then
          case when coalesce((v_kept ->> 'tell')::boolean, false) then 'pending' else 'done' end
        -- Paused already: done where Meta was told, else pending with that pause.
        when v_kept ->> 'outcome' = 'same' then
          case when coalesce((v_kept ->> 'pending')::boolean, false) then 'pending' else 'done' end
        -- Its account is not connected: Chanlytics can no longer pause it, and the owner pauses it in Meta.
        when v_kept ->> 'outcome' = 'not_connected' then 'needs_person'
        else 'not_possible'
      end;
    end if;
    insert into public.remediation_actions (tenant_id, remediation_id, target_type, target_id, act, outcome,
                                            finished_at)
    values (p_tenant_id, v_rem, 'ad', v_ad.id, v_act, v_outcome,
            case when v_outcome <> 'pending' then now() end);
    v_one := jsonb_build_object('ad_id', v_ad.id, 'name', v_ad.name, 'act', v_act, 'outcome', v_outcome);
    v_out := v_out || jsonb_build_array(v_one);
  end loop;
  if v_rem is not null
     and not exists (select 1 from public.remediation_actions r where r.remediation_id = v_rem and r.outcome = 'pending')
  then
    update public.remediations m set finished_at = now() where m.id = v_rem;
  end if;
  return v_out;
end $$;

revoke all on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) to service_role;
comment on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) is
  'The walk the owner''s own take-down starts on ads (00676, 00682, 00687; the Ads plan''s G16, the content loop PRD''s 5.3): every ad made here that shows one of p_files (ads.approved picture) and has not ended is paused for the remediation (ad_pause_all by remediation, which tells the owner on the bell), or, still being set up, its launch cancelled (ad_launch_cancel by remediation). One remediation of p_cause (owner_removed: the one cause that reaches an ad) about the file p_subject_id, one action an ad: pending until the platform''s word settles it (ads_settle_remediation), done where nothing is left to tell, needs_person where its account is not connected. Answers [{ad_id, name, act, outcome}]. Called by post_take_down_begin.';

/* ------------------------------------------------------------------------------ 3. the doors and their helpers -- */

drop function if exists public.file_yes_record(uuid, uuid, text[], text, uuid);
drop function if exists public.file_yes_take_back(uuid, uuid, text[], text);
drop function if exists public.file_yes_restate(uuid, uuid[]);
drop function if exists public.file_yes_uses(text[], boolean);
drop function if exists public.files_drawn_from(uuid, uuid[]);
drop function if exists public.file_drawn_from(jsonb);

/* ----------------------------------------------------------------------------------- 4. the file's two columns -- */

-- Feed: the trigger names the columns it hears, so it is re-made without the two before they go (as 00655 left it).
drop trigger if exists workspace_tell_update on public.files;
create trigger workspace_tell_update after update of status, name, shows, who_in_it, look_status, look, removed_at,
                                                     media_status, sound_said, copy_state, copy_why
  on public.files
  for each row
  when (old.status is distinct from new.status or old.name is distinct from new.name or old.shows is distinct from new.shows
        or old.who_in_it is distinct from new.who_in_it or old.look_status is distinct from new.look_status
        or old.look is distinct from new.look or old.removed_at is distinct from new.removed_at
        or old.media_status is distinct from new.media_status or old.sound_said is distinct from new.sound_said
        or old.copy_state is distinct from new.copy_state or old.copy_why is distinct from new.copy_why)
  execute function public.workspace_tell_row_change();

alter table public.files
  drop constraint if exists files_yes_back_check,
  drop constraint if exists files_yes_for_check,
  drop column if exists yes_for,
  drop column if exists yes_back;

/* ----------------------------------------------------------------------------------------------- 5. the record -- */

drop table if exists public.file_consents;

/* --------------------------------------------------------------------------------- 6. what the rest says of it -- */

comment on column public.files.who_in_it is
  'A person''s word alone: not_asked, or no_one. What the look counted is on look.people. No page and no AI reads it since 00687: footage a business provides is taken as cleared, and nobody in it is asked.';
comment on function public.file_change(uuid, uuid, text, text, text, text) is
  'What a person says of a file (00551, 00665, 00687): its name, its shelf, that no one is in it, filed or set aside. A field left null stays, and the event keeps what was said.';
comment on function public.ad_set_intent(uuid, uuid, uuid, integer, text, text) is
  'Service-role only: an ad paused or turned back on (00652, 00676; decision 0050 calls 1, 2 and 9, the Ads plan''s C1 and G16). p_by says who: owner (the default: the owner''s press, with the version it was drawn from), owner_all (the owner''s one press for them all), stop (Stop everything, any acting member''s: has_permission autonomy) or remediation (a take-down of its picture: has_permission settings); the stop and a remediation pause only ads made here, at the version they stand at. Keeps what was asked with when and, for a pause, paused_by and paused_at; bumps the version; writes the decision (pause_ad, resume_ad, with by) and the event (ad.paused with paused_by, ad.resumed) in one transaction. An ad a remediation paused is refused cant_resume with why picture. Answers outcome: asked, with the new version and whether the platform is to be told; same where what was asked already stands (a remediation still marks a standing pause its own); stale; cant_resume; not_allowed; not_connected; not_made (also an ad made at the platform, for the stop or a remediation); not_found.';
comment on column public.ads.paused_by is
  'Why Chanlytics holds this ad paused (00676; the content loop PRD''s section 5.2): stop (Stop everything paused it), remediation (its picture was taken down: it runs again only with another), owner (its owner''s Pause) or owner_all (the owner''s one press for them all). Null while it is not paused, or where it was paused before 00676 or at the platform. Kept by ad_set_intent; cleared the moment it is not paused (ads_paused_by_holds).';
