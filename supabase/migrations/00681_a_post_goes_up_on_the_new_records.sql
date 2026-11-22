-- 00681 (working number) · A post goes up on the new records (the content loop PRD v3.2, pass 1b, M1; sections 3, 5,
-- 6, 8 and 14.4).
--
-- An approval is of an exact thing. Until now a post kept the file it showed and the words it went with, and nothing
-- said which version of the piece the owner approved, which bytes, or whether any of it moved before the send. Now:
--
--   pieces.revision        The version a piece stands at, and why it exists (`intent`: the day its words are about, an
--   pieces.intent          offer they carry, a service they name), written by whoever drafts it. A made picture is a
--                          piece too (shape `picture`), its row written at its first approval, so one creative is one
--                          piece whichever way it was made. Readers of videos alone read `shape <> 'picture'`.
--   piece_revisions        One version: its plan, its words per place, what moved from the one before, who made it.
--   piece_renditions       One shape of a version as it is sent: its made file, the path of its bytes, their SHA-256.
--                          Written once; a caption change makes a version and no rendition, a version's shapes are the
--                          newest drawn at or before it.
--   approvals              What the owner approved, as a snapshot (the version, each shape by checksum, where, when,
--                          with which words), its hash, who and when; voided when what it is of changes.
--   posts.*                The piece, the version and the approval a placement shows; the place's capability edition
--                          at approval; when the place was seen holding it (verified_at); the last moment it is still
--                          worth sending (good_until); the account it went to (account_id, since an account can leave a
--                          workspace and another come, decision 0143); and why it was held or let go (held_why).
--   post_approve           A member's press, with the settings permission: the approval and its placements in one
--                          transaction, with the piece, its version and its shapes where none were kept yet. post_begin
--                          stays for the code before this, which still calls it, and goes once nothing does.
--   approval_hash          SHA-256 of a snapshot's own text: the door takes it, and the check takes it again.
--   post_as_approved       Right before a send: whether the placement still stands as approved (its approval stands,
--                          its hash holds, its words and its shape's bytes are the approved ones), with the path of the
--                          exact bytes to send. A post approved before this is read as before.
--   piece_words_keep       New words saved on a piece by a member who may approve: its next version, and every
--                          placement still waiting goes up with them under a new approval of the same bytes (the save
--                          is the approval of the new words), so an owner's own edit never strands a scheduled post.
--   post_moved             Re-made: it keeps the place's account, when the place was seen holding the post, and why a
--                          post was held or let go late.
--
-- Erasure (decision 0036): revisions' plan and captions and approvals' snapshot are scrubbed; renditions, the new post
-- columns and pieces.intent hold no person's words (packages/db erasure registry).
--
-- Locks: adding columns to `pieces` and `posts` takes each lock for a moment, narrowing two CHECKs reads each table once
-- under a lock that holds its writers; three seconds each and no more. Re-runnable.
--
-- Deploy order: this file first, then the code (it calls post_approve and piece_words_keep). The code before it keeps
-- working beside it: post_begin and post_moved answer as they did.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------------- 1. pieces -- */

alter table public.pieces add column if not exists revision integer not null default 1;
alter table public.pieces add column if not exists intent jsonb;
alter table public.pieces drop constraint if exists pieces_revision_shape;
alter table public.pieces add constraint pieces_revision_shape check (revision >= 1);
alter table public.pieces drop constraint if exists pieces_intent_shape;
alter table public.pieces add constraint pieces_intent_shape check (intent is null or jsonb_typeof(intent) = 'object');
alter table public.pieces drop constraint if exists pieces_shape_check;
alter table public.pieces add constraint pieces_shape_check check (shape = any (array['hook_cut', 'blocks', 'picture']));
-- A made picture's piece, one a file: written by post_approve the first time the picture is approved.
create unique index if not exists pieces_one_picture on public.pieces (tenant_id, file_id) where shape = 'picture';
grant select (revision, intent) on public.pieces to authenticated;

comment on column public.pieces.revision is
  'The version the piece stands at (00681, piece_revisions.n): 1 as made, one more each time its words change (piece_words_keep).';
comment on column public.pieces.intent is
  'Why it exists (00681; the content loop PRD''s 5.2 and 6.1), written by whoever drafts it where its words lean on something that can change: {goal, opportunity_id, call_to_action, day, offer {says, until}, service}. Null for a piece whose words date nothing. Read again right before every send (reasonStands).';
comment on column public.pieces.shape is
  'hook_cut or blocks: a video and how it is drawn (00613, 00615); picture: a made post''s piece (00681), its row written at its first approval, which no video job reads (stage is not read for one).';

/* ------------------------------------------------------------------------------------------ 2. piece_revisions -- */

create table if not exists public.piece_revisions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  piece_id    uuid not null,
  n           integer not null check (n >= 1),
  -- The plan it was drawn by (a video's timeline, a picture's plan).
  plan        jsonb not null check (jsonb_typeof(plan) = 'object'),
  -- Its words per place: {"instagram": "...", "google": "..."}; a story carries none.
  captions    jsonb not null default '{}'::jsonb check (jsonb_typeof(captions) = 'object'),
  -- What moved from the version before (contracts REVISION_CHANGES): `first` for the first.
  changed     text[] not null default '{}'::text[]
                check (changed <@ array['caption', 'trim', 'order', 'sound', 'layout', 'first']::text[]),
  made_by     text not null check (made_by = any (array['ai', 'owner', 'operator'])),
  cost_cents  integer not null default 0 check (cost_cents >= 0),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint piece_revisions_once unique (piece_id, n),
  constraint piece_revisions_tenant_id_id_key unique (tenant_id, id),
  constraint piece_revisions_tenant_piece_n_key unique (tenant_id, piece_id, n),
  constraint piece_revisions_piece_id_same_workspace foreign key (tenant_id, piece_id)
    references public.pieces (tenant_id, id) on delete cascade
);
create index if not exists piece_revisions_created_by on public.piece_revisions (created_by) where created_by is not null;

alter table public.piece_revisions enable row level security;
drop policy if exists piece_revisions_member_select on public.piece_revisions;
create policy piece_revisions_member_select on public.piece_revisions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.piece_revisions from anon, authenticated;
grant select on public.piece_revisions to authenticated;
grant all on public.piece_revisions to service_role;

comment on table public.piece_revisions is
  'One version of a piece (00681; the content loop PRD''s 5.3): the plan it was drawn by, its words per place, what moved from the version before, who made it and what it cost. Never changed once written. Members read; post_approve and piece_words_keep write.';

/* ----------------------------------------------------------------------------------------- 3. piece_renditions -- */

create table if not exists public.piece_renditions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  piece_id   uuid not null,
  -- The version that drew it: a later version that moved only words sends the same bytes.
  revision   integer not null check (revision >= 1),
  shape      text not null check (shape = any (array['9x16', '4x5', '1x1', '16x9', 'google'])),
  file_id    uuid not null,
  -- Where its bytes are kept in the file's folder, written once and never over (server/posts/make.ts storeShapes).
  path       text not null check (char_length(path) between 1 and 400),
  checksum   text not null check (checksum ~ '^[0-9a-f]{64}$'),
  bytes      bigint check (bytes is null or bytes > 0),
  made_at    timestamptz not null default now(),
  constraint piece_renditions_once unique (piece_id, revision, shape),
  constraint piece_renditions_revision_same_workspace foreign key (tenant_id, piece_id, revision)
    references public.piece_revisions (tenant_id, piece_id, n) on delete cascade,
  constraint piece_renditions_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete cascade
);
create index if not exists piece_renditions_revision on public.piece_renditions (tenant_id, piece_id, revision);
create index if not exists piece_renditions_file on public.piece_renditions (tenant_id, file_id);

alter table public.piece_renditions enable row level security;
drop policy if exists piece_renditions_member_select on public.piece_renditions;
create policy piece_renditions_member_select on public.piece_renditions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.piece_renditions from anon, authenticated;
grant select on public.piece_renditions to authenticated;
grant all on public.piece_renditions to service_role;

comment on table public.piece_renditions is
  'One shape of a piece''s version as it is sent (00681; the content loop PRD''s 5.3, 11): its made file, the path of its bytes in the file''s folder and their full SHA-256, read when the row was written. Never changed once written; a version''s shapes are the newest drawn at or before it. Members read; post_approve writes.';

/* ------------------------------------------------------------------------------------------------ 4. approvals -- */

create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- contracts APPROVAL_SUBJECTS: a version of a piece (subject_id its piece_revisions row), a week's plan, an ad.
  subject_type    text not null check (subject_type = any (array['piece_revision', 'plan', 'ad'])),
  subject_id      uuid not null,
  snapshot        jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash   text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  approved_by     uuid references auth.users (id) on delete set null,
  approved_at     timestamptz not null default now(),
  policy_edition  integer not null default 1 check (policy_edition >= 1),
  voided_at       timestamptz,
  voided_why      text check (voided_why = any (array['changed', 'rights', 'claim', 'place', 'owner'])),
  constraint approvals_voided_shape check ((voided_at is null) = (voided_why is null)),
  constraint approvals_tenant_id_id_key unique (tenant_id, id)
);
create index if not exists approvals_subject on public.approvals (tenant_id, subject_type, subject_id);
create index if not exists approvals_approved_by on public.approvals (approved_by) where approved_by is not null;

alter table public.approvals enable row level security;
drop policy if exists approvals_member_select on public.approvals;
create policy approvals_member_select on public.approvals
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.approvals from anon, authenticated;
grant select on public.approvals to authenticated;
grant all on public.approvals to service_role;

comment on table public.approvals is
  'What an owner approved, exactly (00681; the content loop PRD''s 3 and 5.3): a snapshot (the version, each shape by file and checksum, where it goes, when, with which words, and any fact the owner stated), the SHA-256 of its canonical JSON (contracts hashSnapshot), who and when, and when and why it stopped standing. Right before a send the edge builds the placement''s part again from the post and its shape and compares. Members read; post_approve and piece_words_keep write.';
comment on column public.approvals.snapshot is
  '{revision {piece_id, n}, renditions [{shape, file_id, path, checksum}], placements [{place, kind, at, caption}], uses, spend, facts [{says, until}]} (contracts PieceApprovalSnapshot).';

/* ---------------------------------------------------------------------------------------------------- 5. posts -- */

alter table public.posts add column if not exists piece_id uuid;
alter table public.posts add column if not exists revision integer;
alter table public.posts add column if not exists approval_id uuid;
alter table public.posts add column if not exists capability_edition integer;
alter table public.posts add column if not exists verified_at timestamptz;
alter table public.posts add column if not exists good_until timestamptz;
alter table public.posts add column if not exists account_id text;
alter table public.posts add column if not exists held_why text;

alter table public.posts drop constraint if exists posts_piece_id_same_workspace;
alter table public.posts add constraint posts_piece_id_same_workspace foreign key (tenant_id, piece_id)
  references public.pieces (tenant_id, id) on delete set null (piece_id);
alter table public.posts drop constraint if exists posts_approval_id_same_workspace;
alter table public.posts add constraint posts_approval_id_same_workspace foreign key (tenant_id, approval_id)
  references public.approvals (tenant_id, id) on delete set null (approval_id);
create index if not exists posts_piece on public.posts (tenant_id, piece_id) where piece_id is not null;
create index if not exists posts_approval on public.posts (tenant_id, approval_id) where approval_id is not null;

alter table public.posts drop constraint if exists posts_revision_shape;
alter table public.posts add constraint posts_revision_shape
  check ((revision is null or revision >= 1) and (capability_edition is null or capability_edition >= 1));
alter table public.posts drop constraint if exists posts_account_shape;
alter table public.posts add constraint posts_account_shape
  check (account_id is null or char_length(account_id) between 1 and 200);
alter table public.posts drop constraint if exists posts_held_why_check;
alter table public.posts add constraint posts_held_why_check check (held_why = any (array[
  'approver', 'disconnected', 'line_off', 'removed', 'stopped', 'changed', 'rights', 'claim', 'place', 'money',
  'reason_passed', 'late']));
-- Words and a reason go together: held, or let go because its day passed before it could be sent (PRD 8.2).
alter table public.posts drop constraint if exists posts_held_shape;
alter table public.posts add constraint posts_held_shape check (
  ((status = 'held' or (status = 'pulled' and held_why = 'late')) = (held_reason is not null))
  and (held_reason is null or char_length(held_reason) <= 300)
  and (held_why is null or status = any (array['held', 'pulled'])));

grant select (piece_id, revision, approval_id, capability_edition, verified_at, good_until, account_id, held_why)
  on public.posts to authenticated;
-- A post already up on Instagram was read back at its send where it keeps its address: it was seen there.
update public.posts p set verified_at = coalesce(p.published_at, p.updated_at)
 where p.place = 'instagram' and p.status = 'published' and p.permalink is not null and p.verified_at is null;

comment on column public.posts.piece_id is 'The piece this placement shows (00681); null for one approved before it, read as before.';
comment on column public.posts.revision is 'The version of the piece it shows (00681, piece_revisions.n).';
comment on column public.posts.approval_id is 'The approval it was approved in (00681); null for one approved before it, read as before.';
comment on column public.posts.capability_edition is 'The place''s capability edition when it was approved (contracts PLACE_CAPABILITIES, 00681).';
comment on column public.posts.verified_at is 'When the place was seen holding it (00681): "On Instagram" is said only from then.';
comment on column public.posts.good_until is 'The last moment it is still worth sending (00681; PRD 8.2), from the piece''s intent at approval: nothing is sent after it, by any road. Null where nothing dates it.';
comment on column public.posts.account_id is 'The place''s own account it went to (00681): an Instagram account''s id, a Google location''s name. Set at the send; an account can leave a workspace and another come (decision 0143), so a later read or take-down asks this one.';
comment on column public.posts.held_why is 'Why it was held, or let go before it went (00681, contracts POST_HELD_WHYS): the recheck''s reasons, one of the seven checks, changed since it was approved, or late. held_reason says it in words.';

/* ------------------------------------------------------------------------------------------- 6. post_moved -- */

create or replace function public.post_moved(p_post_id uuid, p_from text[], p_to text, p_patch jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  -- Let go because its day passed before it could be sent: it says so, as a hold does.
  v_late boolean := p_to = 'pulled' and v_patch ->> 'held_why' = 'late';
  v_moved boolean;
begin
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
  -- Up on Instagram and not yet read back from the account: it is asked for by its own id two minutes on, written here
  -- with the fact, so a run that dies after the move never leaves a post that is never seen. Its key is its own
  -- ('seen'), apart from a send's two attempts.
  if v_moved and p_to = 'published' then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    select p.tenant_id, 'post_reconcile', now() + interval '2 minutes',
           jsonb_build_object('post_id', p.id, 'attempt', 'seen', 'seen', 'ask')
      from public.posts p
     where p.id = p_post_id and p.place = 'instagram' and p.verified_at is null and p.external_id is not null
    on conflict do nothing;
  end if;
  return v_moved;
end $$;
revoke all on function public.post_moved(uuid, text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.post_moved(uuid, text[], text, jsonb) to service_role;
comment on function public.post_moved(uuid, text[], text, jsonb) is
  'A placement moved from where it stood (p_from) to where it goes (00611, 00681), with its held reason and why (held_why), link, time, post id, the place''s account, when the place was seen holding it, or refusal from p_patch; let go late (pulled, held_why late) it keeps its words too. A post that moves to published on Instagram unseen (no verified_at) has its post_reconcile job written with it, two minutes on, which asks the account for it by its own id. Nothing when it stood anywhere else, so two runs never both move it. Answers whether it moved. The service role''s.';

/* ---------------------------------------------------------------------------------- 7. a piece and its version -- */

-- The piece a made file is: a video's own (the newest that became it), or a picture's, written the first time.
create or replace function public.piece_of_made_file(p_tenant_id uuid, p_file_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.files;
  v_id   uuid;
begin
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found then
    return null;
  end if;
  if v_file.kind = 'video' then
    select p.id into v_id from public.pieces p
     where p.tenant_id = p_tenant_id and p.file_id = v_file.id and p.shape <> 'picture'
     order by p.created_at desc limit 1;
    return v_id;
  end if;
  insert into public.pieces (tenant_id, shape, plan, look, status, edition, file_id, card_key, created_by, made_at)
  values (p_tenant_id, 'picture', coalesce(v_file.made -> 'plan', '{}'::jsonb), '{}'::jsonb, 'made', 1, v_file.id,
          'post:' || v_file.id::text, p_actor, v_file.created_at)
  on conflict (tenant_id, card_key) do nothing;
  select p.id into v_id from public.pieces p where p.tenant_id = p_tenant_id and p.card_key = 'post:' || v_file.id::text;
  return v_id;
end $$;
revoke all on function public.piece_of_made_file(uuid, uuid, uuid) from public, anon, authenticated;
comment on function public.piece_of_made_file(uuid, uuid, uuid) is
  'The piece a made file is (00681): a video''s own, the newest that became it, or a made picture''s, written the first time it is asked for (shape picture). Null for a video no piece of this workspace became. Called by post_approve.';

/* ------------------------------------------------------------------------------------ 8. the hash, and the check -- */

-- SHA-256 of a snapshot's own text as jsonb writes it (its keys in jsonb's one order): the same snapshot, the same hash.
create or replace function public.approval_hash(p_snapshot jsonb)
returns text
language sql
immutable
set search_path = public
as $$ select encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex') $$;
revoke all on function public.approval_hash(jsonb) from public, anon, authenticated;
comment on function public.approval_hash(jsonb) is
  'The SHA-256, as hex, of a snapshot''s text as jsonb writes it (00681): what approvals.snapshot_hash keeps and post_as_approved checks.';

-- The shape a placement sends (contracts renditionShapeOf).
create or replace function public.post_shape(p_place text, p_kind text)
returns text
language sql
immutable
set search_path = public
as $$ select case when p_place = 'google' then 'google' when p_kind = 'picture' then '4x5' else '9x16' end $$;
revoke all on function public.post_shape(text, text) from public, anon, authenticated;
comment on function public.post_shape(text, text) is
  'The shape a placement sends (00681, contracts renditionShapeOf): Google''s own, a portrait for a post, standing for a story or a reel.';

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
begin
  select * into v_post from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('is', 'changed');
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
  'Right before a send (00681; the content loop PRD''s 5.3): whether a placement still stands as it was approved. Its approval stands and its snapshot''s hash holds; it names this post''s piece and version; the placement''s words are the post''s; the shape approved is the newest kept at or before that version, same path and checksum. Answers {is: stands, path (the exact bytes to send)}, {is: before} for a post approved before approvals were kept, or {is: changed}. The service role''s.';

/* ------------------------------------------------------------------------------------------- 9. post_approve -- */

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
  'A member''s press, with the settings permission (00681; the content loop PRD''s 5.3, 6.2): a made post or video approved for its placements in one transaction. p_approval: {snapshot, intent, renditions [{shape, path, checksum, bytes}], placements [{place, kind, at, caption, good_until, capability_edition}], via, policy_edition}. The piece (a picture''s written the first time), its version (words that differ from it make the next, with no new shapes), its shapes (kept the first time; different bytes at a kept shape are changed), the approval, each placement with its job. Answers {fate: approved, busy (post_id: the one of its kind on its way), gone, not_a_post, wrong_kind, taken_back, late (its reason ends before its time), changed; approval_id, piece_id, revision, posts [{place, kind, post_id}]}.';

/* --------------------------------------------------------------------------------------- 10. piece_words_keep -- */

-- New words on a made post or video, saved by a member who may approve: the piece's next version (words alone, so no
-- shape is drawn again), and every placement of it still waiting for its time goes up with them, as it has since
-- 12 November 2026. The save is that member's approval of the new words: each such placement gets a new approval of
-- the same bytes with the new words, so it still stands as approved at its send. One Instagram is already making ready
-- keeps what it was made with, and a story shows none.
create or replace function public.piece_words_keep(p_tenant_id uuid, p_file_id uuid, p_caption text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
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
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
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
              array['caption'], 'owner', v_actor);
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
  return jsonb_build_object('revision', coalesce(v_n, v_piece.revision), 'followed', v_followed);
end $$;
revoke all on function public.piece_words_keep(uuid, uuid, text) from public, anon;
grant execute on function public.piece_words_keep(uuid, uuid, text) to authenticated, service_role;
comment on function public.piece_words_keep(uuid, uuid, text) is
  'A member''s door, with the settings permission (00681; the content loop PRD''s 8.1): new words on a made post or video. Its piece''s next version (words alone, no shape drawn again; none while no placement of it was ever approved), and every placement still queued for its time, never a story, goes up with them: the save is that member''s approval of the new words, so each gets a new approval of the same bytes with them and still stands as approved at its send. One approved before approvals were kept takes the words as before. Answers {revision, followed}.';
