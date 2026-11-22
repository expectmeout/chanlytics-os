-- 00682 (working number) · A person in a file says yes (the content loop PRD v3.2, pass 1b, M2; sections 2, 5.2, 5.3,
-- 6.1 and 14.4; call 13).
--
-- A yes was kept per file and use (00665 file_consents), said by whoever the owner named as text, and a file's yes for a
-- use was any yes that stood. Rights are per person (principle 6): never inferred from a face, and a file's yes for a use
-- is the yes of every person in it.
--
--   file_subjects          A person in a file, as the owner or an operator named them: their name, a client, a
--                          member of staff or someone else, the person in People where the workspace knows them, how
--                          it is known (the owner named them, or the person said so). Never filled from a face.
--   files.subjects_state   Whether the people in it are known: not_asked, none (nobody is in it), named, unsure (the
--                          owner is not sure: no new use until they say).
--   file_consents          Widened, not a second table (the PRD's subject_yes is this one): a yes may name the person
--                          it is of (subject_id), what it reaches (scope), and its evidence (the message it was said
--                          in, who kept it); said in a message or in person as well as to AI; a use for the website.
--   file_yes_restate       Re-made: a file whose people are named has a yes for a use only when every one of them has
--                          one; a file with nobody named reads as before.
--   file_subjects_name     A member's door (add_files: an operator names who is in footage too): the people in a file,
--                          or that nobody is, or that the owner is not sure.
--   subject_yes_record     A member's door (settings): a person's own yes for each use, with where it was said and its
--                          evidence; the file's standing restated in the same transaction.
--   subject_ask_record     A member's door (add_files: whoever may reply to a person may note the ask they sent): when
--                          a person was asked, on which channel, about which uses.
--   subject_no_record      A member's door (settings): that the person said no, as the owner read their answer.
--   post_as_approved       Re-made: a placement whose file has a person with no yes for posts, or whose people the
--   post_approve           owner is not sure of, answers `rights` with that person's name: refused at the press, held
--                          at its send.
--
-- Erasure (decision 0036, PRD 14.4): a person's file_subjects rows go with them (the foreign key to contacts), and their
-- yes with those rows; the file's people state then says the owner must say who is in it again (unsure).
--
-- Locks: adding three columns to file_consents and one to files, and widening four CHECKs, each lock for a moment;
-- three seconds each and no more. Re-runnable. Deploy order: this file first, then the code (it calls both doors).

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------- 1. file_subjects -- */

create table if not exists public.file_subjects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  file_id     uuid not null,
  contact_id  uuid,
  name        text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  label       text not null check (label = any (array['client', 'staff', 'other'])),
  how         text not null check (how = any (array['owner_named', 'person_said'])),
  named_by    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- The ask (call 13): when the owner sent it, on which channel, and the uses it asked about. Never sent from here.
  asked_at    timestamptz,
  asked_via   text check (asked_via is null or char_length(asked_via) between 1 and 40),
  asked_uses  text[] not null default '{}'::text[]
              check (asked_uses <@ array['post', 'ad', 'reply', 'cold_email', 'website']),
  -- That they said no, as the owner read their answer: it stands until a yes is kept.
  said_no_at  timestamptz,
  constraint file_subjects_asked_whole check ((asked_at is null) = (asked_via is null)),
  constraint file_subjects_tenant_id_id_key unique (tenant_id, id),
  constraint file_subjects_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete cascade,
  constraint file_subjects_contact_id_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete cascade
);
create unique index if not exists file_subjects_one_name on public.file_subjects (tenant_id, file_id, lower(name));
create index if not exists file_subjects_contact on public.file_subjects (tenant_id, contact_id) where contact_id is not null;
create index if not exists file_subjects_named_by on public.file_subjects (named_by) where named_by is not null;

alter table public.file_subjects enable row level security;
drop policy if exists file_subjects_member_select on public.file_subjects;
create policy file_subjects_member_select on public.file_subjects
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.file_subjects from anon, authenticated;
grant select on public.file_subjects to authenticated;
grant all on public.file_subjects to service_role;

comment on table public.file_subjects is
  'A person in a file (00682; the content loop PRD''s 5.3, principle 6): their name as the owner or an operator gave it, a client, staff or someone else, the person in People where the workspace knows them, and how it is known. Never filled from a face. Members read; file_subjects_name writes. A person erased takes their rows with them.';

/* ---------------------------------------------------------------------------------- 2. files.subjects_state -- */

alter table public.files add column if not exists subjects_state text not null default 'not_asked';
alter table public.files drop constraint if exists files_subjects_state_check;
alter table public.files add constraint files_subjects_state_check
  check (subjects_state = any (array['not_asked', 'none', 'named', 'unsure']));
-- A person's word that nobody is in it (00665's who_in_it) is that nobody is.
update public.files set subjects_state = 'none' where who_in_it = 'no_one' and subjects_state = 'not_asked';
grant select (subjects_state) on public.files to authenticated;
comment on column public.files.subjects_state is
  'Whether the people in it are known (00682): not_asked, none (nobody is in it), named (file_subjects says who), unsure (the owner is not sure: no new use until they say).';

/* ------------------------------------------------------------------------------- 3. file_consents, widened -- */

alter table public.file_consents add column if not exists subject_id uuid;
alter table public.file_consents add column if not exists scope jsonb not null default '{}'::jsonb;
alter table public.file_consents add column if not exists evidence jsonb not null default '{}'::jsonb;
alter table public.file_consents drop constraint if exists file_consents_subject_id_same_workspace;
alter table public.file_consents add constraint file_consents_subject_id_same_workspace foreign key (tenant_id, subject_id)
  references public.file_subjects (tenant_id, id) on delete cascade;
alter table public.file_consents drop constraint if exists file_consents_kept_shape;
alter table public.file_consents add constraint file_consents_kept_shape
  check (jsonb_typeof(scope) = 'object' and jsonb_typeof(evidence) = 'object');
alter table public.file_consents drop constraint if exists file_consents_said_in_check;
alter table public.file_consents add constraint file_consents_said_in_check
  check (said_in = any (array['ai', 'before', 'message', 'in_person']));
alter table public.file_consents drop constraint if exists file_consents_use_check;
alter table public.file_consents add constraint file_consents_use_check
  check (use = any (array['post', 'ad', 'reply', 'cold_email', 'website']));
create index if not exists file_consents_subject on public.file_consents (tenant_id, subject_id) where subject_id is not null;
alter table public.files drop constraint if exists files_yes_for_check;
alter table public.files add constraint files_yes_for_check
  check (yes_for <@ array['post', 'ad', 'reply', 'cold_email', 'website']::text[]);
alter table public.files drop constraint if exists files_yes_back_check;
alter table public.files add constraint files_yes_back_check
  check (yes_back <@ array['post', 'ad', 'reply', 'cold_email', 'website']::text[] and not (yes_back && yes_for));
comment on column public.file_consents.subject_id is
  'The person in the file this yes is theirs (00682, file_subjects); null for a yes kept before people were named, read as before.';
comment on column public.file_consents.evidence is
  'Where it was said (00682): the message it was said in, who kept it. Never the person''s words.';

/* ------------------------------------------------------------------------------------ 4. file_yes_restate -- */

create or replace function public.file_yes_restate(p_tenant_id uuid, p_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public.files f
     set yes_for = s.yes_for, yes_back = s.yes_back
    from (
      select x.id,
             coalesce((select array_agg(u.use order by u.use)
                         from (select distinct c.use from public.file_consents c
                                where c.tenant_id = p_tenant_id and c.file_id = x.id and c.taken_back_at is null) u
                        -- People named: a use stands only where every one of them has a yes for it that stands.
                        where not exists (select 1 from public.file_subjects s
                                           where s.tenant_id = p_tenant_id and s.file_id = x.id
                                             and not exists (select 1 from public.file_consents k
                                                              where k.tenant_id = p_tenant_id and k.subject_id = s.id
                                                                and k.use = u.use and k.taken_back_at is null))),
                      '{}'::text[]) as yes_for,
             coalesce((select array_agg(c.use order by c.use)
                         from (select c.use from public.file_consents c
                                where c.tenant_id = p_tenant_id and c.file_id = x.id
                                group by c.use
                               having bool_and(c.taken_back_at is not null)) c),
                      '{}'::text[]) as yes_back
        from unnest(p_ids) as x(id)
    ) s
   where f.tenant_id = p_tenant_id and f.id = s.id
     and (f.yes_for is distinct from s.yes_for or f.yes_back is distinct from s.yes_back);
$$;
revoke all on function public.file_yes_restate(uuid, uuid[]) from public, anon, authenticated;
comment on function public.file_yes_restate(uuid, uuid[]) is
  'files.yes_for and files.yes_back restated from file_consents for the files named (00665, 00682): a file whose people are named has a yes for a use only when every one of them has one that stands. Called by the doors that write a yes, in their own transaction.';

/* ------------------------------------------------------------------------------------------------ 5. doors -- */

create or replace function public.file_subjects_name(p_tenant_id uuid, p_file_id uuid, p_state text, p_people jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_person jsonb;
  v_added  integer := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_state is null or p_state <> all (array['none', 'named', 'unsure']) then
    raise exception 'Say who is in it, that nobody is, or that you are not sure.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null) then
    return jsonb_build_object('fate', 'gone');
  end if;
  if p_state = 'none' then
    delete from public.file_subjects s where s.tenant_id = p_tenant_id and s.file_id = p_file_id;
  elsif p_state = 'named' then
    if jsonb_typeof(p_people) is distinct from 'array' or jsonb_array_length(p_people) not between 1 and 20 then
      raise exception 'Name one to twenty people.' using errcode = '22023';
    end if;
    delete from public.file_subjects s
     where s.tenant_id = p_tenant_id and s.file_id = p_file_id
       and lower(s.name) not in (select lower(btrim(e ->> 'name')) from jsonb_array_elements(p_people) e);
    for v_person in select * from jsonb_array_elements(p_people) loop
      insert into public.file_subjects (tenant_id, file_id, contact_id, name, label, how, named_by)
      values (p_tenant_id, p_file_id, nullif(v_person ->> 'contact_id', '')::uuid, btrim(v_person ->> 'name'),
              coalesce(v_person ->> 'label', 'client'), coalesce(v_person ->> 'how', 'owner_named'), v_actor)
      on conflict (tenant_id, file_id, (lower(name))) do nothing;
      v_added := v_added + (case when found then 1 else 0 end);
    end loop;
  end if;
  update public.files f set subjects_state = p_state where f.tenant_id = p_tenant_id and f.id = p_file_id;
  perform public.file_yes_restate(p_tenant_id, array[p_file_id]);
  return jsonb_build_object('fate', 'kept', 'added', v_added);
end $$;
revoke all on function public.file_subjects_name(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.file_subjects_name(uuid, uuid, text, jsonb) to authenticated, service_role;
comment on function public.file_subjects_name(uuid, uuid, text, jsonb) is
  'A member''s door, with the add_files permission (00682): who is in a file, as the owner or an operator says it, never from a face. p_state: named (p_people [{name, label, contact_id, how}], each name once: the whole list, so a person left out is no longer in it, and their yes goes with them), none (nobody: every row goes), unsure. The file''s standing for each use is restated, since a person named without a yes takes the file''s yes for that use away. Answers {fate: kept, gone; added}.';

create or replace function public.subject_yes_record(
  p_tenant_id uuid, p_subject_id uuid, p_uses text[], p_said_in text, p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_subject public.file_subjects;
  v_use     text;
  v_kept    integer := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_said_in is null or p_said_in <> all (array['ai', 'message', 'in_person']) then
    raise exception 'Say where the yes was said.' using errcode = '22023';
  end if;
  select * into v_subject from public.file_subjects s where s.tenant_id = p_tenant_id and s.id = p_subject_id;
  if not found then
    return jsonb_build_object('fate', 'gone', 'kept', 0);
  end if;
  foreach v_use in array coalesce(p_uses, '{}'::text[]) loop
    if v_use <> all (array['post', 'ad', 'reply', 'cold_email', 'website']) then
      raise exception 'No such use: %.', v_use using errcode = '22023';
    end if;
    if not exists (select 1 from public.file_consents c
                    where c.tenant_id = p_tenant_id and c.subject_id = v_subject.id and c.use = v_use
                      and c.taken_back_at is null) then
      insert into public.file_consents (tenant_id, file_id, use, who, said_in, said_by, subject_id, evidence)
      values (p_tenant_id, v_subject.file_id, v_use, v_subject.name, p_said_in, v_actor, v_subject.id,
              coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('kept_by', v_actor));
      v_kept := v_kept + 1;
    end if;
  end loop;
  -- A yes kept answers a no said before it.
  update public.file_subjects s set said_no_at = null
   where s.tenant_id = p_tenant_id and s.id = v_subject.id and s.said_no_at is not null and v_kept > 0;
  perform public.file_yes_restate(p_tenant_id, array[v_subject.file_id]);
  return jsonb_build_object('fate', 'kept', 'kept', v_kept);
end $$;
revoke all on function public.subject_yes_record(uuid, uuid, text[], text, jsonb) from public, anon;
grant execute on function public.subject_yes_record(uuid, uuid, text[], text, jsonb) to authenticated, service_role;
comment on function public.subject_yes_record(uuid, uuid, text[], text, jsonb) is
  'A member''s door, with the settings permission (00682; call 13): a person''s own yes for each use named, said to AI, in a message (p_evidence names it) or in person, kept as theirs on the file they are in; a yes that already stands is not kept twice. The file''s standing restated. Answers {fate: kept, gone; kept (how many)}.';

/* ------------------------------------------------------------------------------ 5a. the ask, and a no -- */

create or replace function public.subject_ask_record(p_tenant_id uuid, p_subject_id uuid, p_via text, p_uses text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uses text[] := coalesce(p_uses, '{}'::text[]);
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_via, '')), '') is null or char_length(btrim(p_via)) > 40 then
    raise exception 'Say how they were asked.' using errcode = '22023';
  end if;
  if cardinality(v_uses) = 0 or not (v_uses <@ array['post', 'ad', 'reply', 'cold_email', 'website']) then
    raise exception 'Say what they were asked about.' using errcode = '22023';
  end if;
  update public.file_subjects s
     set asked_at = now(), asked_via = btrim(p_via), asked_uses = v_uses, said_no_at = null
   where s.tenant_id = p_tenant_id and s.id = p_subject_id;
  return jsonb_build_object('fate', case when found then 'kept' else 'gone' end);
end $$;
revoke all on function public.subject_ask_record(uuid, uuid, text, text[]) from public, anon;
grant execute on function public.subject_ask_record(uuid, uuid, text, text[]) to authenticated, service_role;
comment on function public.subject_ask_record(uuid, uuid, text, text[]) is
  'A member''s door, with the add_files permission (00682; call 13): that a person in a file was asked for their yes, now, on the channel named, about the uses named. The ask itself is a reply the member sent through the one send door; this keeps when. A no said before it no longer stands: they are being asked again. Answers {fate: kept, gone}.';

create or replace function public.subject_no_record(p_tenant_id uuid, p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.file_subjects s set said_no_at = now()
   where s.tenant_id = p_tenant_id and s.id = p_subject_id;
  return jsonb_build_object('fate', case when found then 'kept' else 'gone' end);
end $$;
revoke all on function public.subject_no_record(uuid, uuid) from public, anon;
grant execute on function public.subject_no_record(uuid, uuid) to authenticated, service_role;
comment on function public.subject_no_record(uuid, uuid) is
  'A member''s door, with the settings permission (00682; call 13): that a person in a file said no, as the owner read their answer. Nothing changes for the file: without their yes no new use stood already. A yes kept later answers it (subject_yes_record). Answers {fate: kept, gone}.';

/* ------------------------------------------------------------------------- 5b. a person's row gone (erased) -- */

-- A person erased takes their rows in files with them (the foreign key to contacts): each file they were in then says
-- the owner must say who is in it again, and its standing for each use is restated (PRD 14.4).
create or replace function public.file_subjects_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.files f set subjects_state = 'unsure'
   where f.tenant_id = old.tenant_id and f.id = old.file_id and f.subjects_state = 'named';
  perform public.file_yes_restate(old.tenant_id, array[old.file_id]);
  return null;
end $$;
revoke all on function public.file_subjects_gone() from public, anon, authenticated;
comment on function public.file_subjects_gone() is
  'Trigger (00682; the content loop PRD''s 14.4): a person''s row in a file gone (an erasure reaches it through contacts) leaves the file unsure of who is in it, which holds every new use until the owner says, and restates its standing.';
drop trigger if exists file_subjects_gone on public.file_subjects;
create trigger file_subjects_gone after delete on public.file_subjects
  for each row execute function public.file_subjects_gone();

/* ------------------------------------------------------------------------------------- 5c. the rights gap -- */

-- Who stands between a file and a use (principle 6: rights are per person, per use): the people named in it, and in
-- every photo or clip it was drawn from (a made post shows who its photo shows), each of whom needs their own yes that
-- stands. The one rule the press, the send's check and AI's card all ask.
create or replace function public.file_rights_gap_of(p_tenant_id uuid, p_file_id uuid, p_use text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with shown as (
    select f.id, f.subjects_state from public.files f
     where f.tenant_id = p_tenant_id
       and (f.id = p_file_id
            or f.id::text = any (public.file_drawn_from(
                 (select m.made from public.files m where m.tenant_id = p_tenant_id and m.id = p_file_id))))
  )
  select case
    when exists (select 1 from shown where subjects_state = 'unsure') then jsonb_build_object('is', 'unsure')
    else coalesce(
      (select jsonb_build_object('is', 'person', 'name', s.name)
         from public.file_subjects s
        where s.tenant_id = p_tenant_id and s.file_id in (select id from shown)
          and not exists (select 1 from public.file_consents k
                           where k.tenant_id = s.tenant_id and k.subject_id = s.id and k.use = p_use
                             and k.taken_back_at is null)
        order by s.created_at, lower(s.name)
        limit 1),
      jsonb_build_object('is', 'ok'))
  end;
$$;
revoke all on function public.file_rights_gap_of(uuid, uuid, text) from public, anon, authenticated;
comment on function public.file_rights_gap_of(uuid, uuid, text) is
  'Who stands between a file and a use (00682; the content loop PRD''s principle 6 and 6.1): {is: ok}, {is: unsure} where the owner is not sure who is in it or in what it was drawn from, or {is: person, name}, the first person named in it or in what it was drawn from with no yes of their own for that use that stands. Called by post_approve, post_as_approved and file_rights_gap.';

create or replace function public.file_rights_gap(p_tenant_id uuid, p_file_id uuid, p_use text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'add_files'), false) then
    raise exception 'Not yours to read.' using errcode = '42501';
  end if;
  return public.file_rights_gap_of(p_tenant_id, p_file_id, p_use);
end $$;
revoke all on function public.file_rights_gap(uuid, uuid, text) from public, anon;
grant execute on function public.file_rights_gap(uuid, uuid, text) to authenticated, service_role;
comment on function public.file_rights_gap(uuid, uuid, text) is
  'A member''s read, with the add_files permission (00682): who stands between a file and a use, as file_rights_gap_of answers it, for the checks before a press and for AI''s card. Answers {is: ok | unsure | person, name}.';

/* ------------------------------------------------------------------------------- 6. post_as_approved -- */

create or replace function public.post_as_approved(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post       public.posts;
  v_approval   public.approvals;
  v_placement  jsonb;
  v_rendition  jsonb;
  v_live       public.piece_renditions;
  v_gap        jsonb;
begin
  select * into v_post from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('is', 'changed');
  end if;
  -- A person in it, or in what it was drawn from, with no yes for posts that stands, or nobody sure who is (00682).
  v_gap := public.file_rights_gap_of(v_post.tenant_id, v_post.file_id, 'post');
  if v_gap ->> 'is' <> 'ok' then
    return jsonb_build_object('is', 'rights', 'name', v_gap ->> 'name');
  end if;
  if v_post.approval_id is null then
    return jsonb_build_object('is', 'before');
  end if;
  select * into v_approval from public.approvals a where a.tenant_id = v_post.tenant_id and a.id = v_post.approval_id;
  if not found or v_approval.voided_at is not null or public.approval_hash(v_approval.snapshot) <> v_approval.snapshot_hash
     or (v_approval.snapshot -> 'revision' ->> 'piece_id') is distinct from v_post.piece_id::text
     or (v_approval.snapshot -> 'revision' ->> 'n') is distinct from v_post.revision::text then
    return jsonb_build_object('is', 'changed');
  end if;
  select e into v_placement from jsonb_array_elements(v_approval.snapshot -> 'placements') e
   where e ->> 'place' = v_post.place and e ->> 'kind' = v_post.kind limit 1;
  select e into v_rendition from jsonb_array_elements(v_approval.snapshot -> 'renditions') e
   where e ->> 'shape' = public.post_shape(v_post.place, v_post.kind) limit 1;
  select * into v_live from public.piece_renditions r
   where r.tenant_id = v_post.tenant_id and r.piece_id = v_post.piece_id
     and r.shape = public.post_shape(v_post.place, v_post.kind) and r.revision <= v_post.revision
   order by r.revision desc limit 1;
  if v_placement is null or v_rendition is null or v_live.id is null
     or (v_post.kind <> 'story' and btrim(coalesce(v_placement ->> 'caption', '')) <> btrim(coalesce(v_post.caption, '')))
     or v_rendition ->> 'checksum' <> v_live.checksum or v_rendition ->> 'path' <> v_live.path then
    return jsonb_build_object('is', 'changed');
  end if;
  -- What the send's own check of the reason reads beside it: why the piece exists, and any fact the owner stated.
  return jsonb_build_object('is', 'stands', 'path', v_live.path,
                            'intent', (select p.intent from public.pieces p where p.id = v_post.piece_id),
                            'facts', coalesce(v_approval.snapshot -> 'facts', '[]'::jsonb));
end $$;
revoke all on function public.post_as_approved(uuid) from public, anon, authenticated;
grant execute on function public.post_as_approved(uuid) to service_role;
comment on function public.post_as_approved(uuid) is
  'Right before a send (00681; the content loop PRD''s 5.3): whether a placement still stands as it was approved. Its approval stands and its snapshot''s hash holds; it names this post''s piece and version; the placement''s words are the post''s; the shape approved is the newest kept at or before that version, same path and checksum. Answers {is: rights, name} where a person in it or in what it was drawn from has no yes for posts, or nobody is sure who is in it (00682), {is: stands, path (the exact bytes to send)}, {is: before} for a post approved before approvals were kept, or {is: changed}. The service role''s.';

/* ------------------------------------------------------------------------------------ 7. post_approve -- */

create or replace function public.post_approve(p_tenant_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_file       public.files;
  v_piece      public.pieces;
  v_rev        public.piece_revisions;
  v_n          integer;
  v_captions   jsonb := '{}'::jsonb;
  v_place      jsonb;
  v_rendition  jsonb;
  v_kept       public.piece_renditions;
  v_busy       uuid;
  v_approval   uuid;
  v_id         uuid;
  v_when       timestamptz;
  v_later      boolean;
  v_posts      jsonb := '[]'::jsonb;
  v_snapshot   jsonb;
  v_gap        jsonb;
  v_places     jsonb := coalesce(p_approval -> 'placements', '[]'::jsonb);
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_places) <> 'array' or jsonb_array_length(v_places) not between 1 and 4 then
    raise exception 'An approval names one to four placements.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_approval -> 'snapshot') is distinct from 'object' then
    raise exception 'An approval carries its snapshot.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'posts', '[]'::jsonb);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- A yes for posts taken back on it, or on what it was drawn from, and not given again on it (00665): nothing goes.
  if not ('post' = any (v_file.yes_for))
     and ('post' = any (v_file.yes_back)
          or exists (select 1 from public.files s
                      where s.tenant_id = p_tenant_id and 'post' = any (s.yes_back)
                        and s.id::text = any (public.file_drawn_from(v_file.made)))) then
    return jsonb_build_object('fate', 'taken_back', 'posts', '[]'::jsonb);
  end if;
  -- A person in it, or in what it was drawn from, with no yes for posts that stands, or nobody sure who is (00682):
  -- nothing goes, and it says who.
  v_gap := public.file_rights_gap_of(p_tenant_id, p_file_id, 'post');
  if v_gap ->> 'is' <> 'ok' then
    return jsonb_build_object('fate', 'rights', 'name', v_gap ->> 'name', 'posts', '[]'::jsonb);
  end if;
  -- Each placement: a place, a kind the file can go as there, words within the place's own limit, a time within 30 days.
  for v_place in select * from jsonb_array_elements(v_places) loop
    if (v_place ->> 'place') is null or (v_place ->> 'place') <> all (array['instagram', 'google']) then
      raise exception 'No such place: %.', v_place ->> 'place' using errcode = '22023';
    end if;
    if (case when v_file.kind = 'video'
             then not (v_place ->> 'place' = 'instagram' and v_place ->> 'kind' = 'reel')
             else (v_place ->> 'kind') is null or (v_place ->> 'kind') <> all (array['picture', 'story'])
                  or (v_place ->> 'place' = 'google' and v_place ->> 'kind' <> 'picture') end) then
      return jsonb_build_object('fate', 'wrong_kind', 'posts', '[]'::jsonb);
    end if;
    if char_length(coalesce(v_place ->> 'caption', '')) > (case when v_place ->> 'place' = 'google' then 1500 else 2200 end) then
      raise exception 'Those words are longer than the place takes.' using errcode = '22023';
    end if;
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    if v_when > now() + interval '30 days' then
      raise exception 'A post goes within thirty days.' using errcode = '22023';
    end if;
    if (v_place ->> 'good_until') is not null and (v_place ->> 'good_until')::timestamptz < v_when then
      return jsonb_build_object('fate', 'late', 'posts', '[]'::jsonb);
    end if;
  end loop;
  -- A Google press that died between its placement and its answer stops holding the next one after ten minutes (00616).
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words',
                                    'Google did not say whether this went up. Look on your profile before posting it again.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  -- One of each kind on its way at a place (00620).
  for v_place in select * from jsonb_array_elements(v_places) loop
    select p.id into v_busy from public.posts p
     where p.file_id = p_file_id and p.place = v_place ->> 'place' and p.kind = v_place ->> 'kind'
       and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
    if found then
      return jsonb_build_object('fate', 'busy', 'post_id', v_busy, 'posts', '[]'::jsonb);
    end if;
  end loop;

  -- Its own statement: a row it writes is seen only by the next one.
  v_id := public.piece_of_made_file(p_tenant_id, p_file_id, v_actor);
  select * into v_piece from public.pieces p where p.id = v_id;
  if not found then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- A shape already kept with other bytes is not what the owner saw: nothing is written past here.
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    select * into v_kept from public.piece_renditions r
     where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= v_piece.revision
     order by r.revision desc limit 1;
    if found and (v_kept.checksum <> v_rendition ->> 'checksum' or v_kept.path <> v_rendition ->> 'path') then
      return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
    end if;
  end loop;
  if p_approval ? 'intent' then
    update public.pieces p set intent = nullif(p_approval -> 'intent', 'null'::jsonb), updated_at = now()
     where p.id = v_piece.id and p.intent is distinct from nullif(p_approval -> 'intent', 'null'::jsonb);
  end if;

  -- The version it stands at, written the first time; words that differ from it are a new version (no new shapes).
  for v_place in select * from jsonb_array_elements(v_places) loop
    if v_place ->> 'kind' <> 'story' then
      v_captions := v_captions || jsonb_build_object(v_place ->> 'place', coalesce(v_place ->> 'caption', ''));
    end if;
  end loop;
  v_n := v_piece.revision;
  select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_n;
  if not found then
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_piece.plan, v_captions, array['first'], 'owner', v_actor)
    returning * into v_rev;
  elsif exists (select 1 from jsonb_each_text(v_captions) c
                 where v_rev.captions ? c.key and (v_rev.captions ->> c.key) <> c.value) then
    v_n := v_n + 1;
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_rev.plan, v_rev.captions || v_captions, array['caption'], 'owner', v_actor)
    returning * into v_rev;
    update public.pieces p set revision = v_n, updated_at = now() where p.id = v_piece.id;
  end if;

  -- Its shapes as they are sent: kept the first time (checked above to be the same bytes every time after).
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    if not exists (select 1 from public.piece_renditions r
                    where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= v_n) then
      insert into public.piece_renditions (tenant_id, piece_id, revision, shape, file_id, path, checksum, bytes)
      values (p_tenant_id, v_piece.id, v_n, v_rendition ->> 'shape', p_file_id, v_rendition ->> 'path',
              v_rendition ->> 'checksum', nullif(v_rendition ->> 'bytes', '')::bigint);
    end if;
  end loop;

  -- The snapshot names the version it is of, and its hash is taken here, of its own text, as post_as_approved takes it.
  v_snapshot := jsonb_set(p_approval -> 'snapshot', '{revision}', jsonb_build_object('piece_id', v_piece.id, 'n', v_n));
  insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by, policy_edition)
  values (p_tenant_id, 'piece_revision', v_rev.id, v_snapshot, public.approval_hash(v_snapshot), v_actor,
          coalesce((p_approval ->> 'policy_edition')::integer, 1))
  returning id into v_approval;

  for v_place in select * from jsonb_array_elements(v_places) loop
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    v_later := v_place ->> 'place' = 'google' and v_when > now() + interval '2 minutes';
    insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status,
                              piece_id, revision, approval_id, capability_edition, good_until)
    values (p_tenant_id, p_file_id, v_place ->> 'place', v_place ->> 'kind',
            case when v_place ->> 'kind' = 'story' then null else nullif(btrim(v_place ->> 'caption'), '') end,
            v_when, v_actor, now(), coalesce(p_approval ->> 'via', 'press'),
            case when v_place ->> 'place' = 'google' and not v_later then 'publishing' else 'queued' end,
            v_piece.id, v_n, v_approval, nullif(v_place ->> 'capability_edition', '')::integer,
            nullif(v_place ->> 'good_until', '')::timestamptz)
    returning id into v_id;
    if v_place ->> 'place' = 'instagram' then
      -- Ten minutes ahead of its time, so Instagram has made it ready by then; as text, as a job's key is made of strings.
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
              jsonb_build_object('post_id', v_id, 'attempt', '1'));
    elsif v_later then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_google', v_when, jsonb_build_object('post_id', v_id, 'attempt', '1'));
    end if;
    v_posts := v_posts || jsonb_build_object('place', v_place ->> 'place', 'kind', v_place ->> 'kind', 'post_id', v_id);
  end loop;
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'piece_id', v_piece.id, 'revision', v_n,
                            'posts', v_posts);
end $$;
revoke all on function public.post_approve(uuid, uuid, jsonb) from public, anon;
grant execute on function public.post_approve(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.post_approve(uuid, uuid, jsonb) is
  'A member''s press, with the settings permission (00681; the content loop PRD''s 5.3, 6.2): a made post or video approved for its placements in one transaction. p_approval: {snapshot, intent, renditions [{shape, path, checksum, bytes}], placements [{place, kind, at, caption, good_until, capability_edition}], via, policy_edition}. The piece (a picture''s written the first time), its version (words that differ from it make the next, with no new shapes), its shapes (kept the first time; different bytes at a kept shape are changed), the approval, each placement with its job. Answers {fate: approved, busy (post_id: the one of its kind on its way), gone, not_a_post, wrong_kind, taken_back, rights (name: who has not said yes, 00682), late (its reason ends before its time), changed; approval_id, piece_id, revision, posts [{place, kind, post_id}]}.';
