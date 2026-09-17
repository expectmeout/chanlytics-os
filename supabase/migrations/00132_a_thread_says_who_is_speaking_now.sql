-- A thread says who is SPEAKING on it now, apart from who is responsible for it.
--
-- RENUMBERED from 00130, which two sessions took in the same hour: this file
-- and 00130_a_name_does_not_survive_an_erasure.sql. The CLI keys applied
-- migrations by the VERSION, so on a replay only the first of the two ran and
-- the second was skipped in silence -- locally the columns below simply were
-- not there, and in production the history row for 00130 ended up naming the
-- other file while this one read as pending. Every statement here is written
-- to be re-runnable (`if not exists`, `drop ... if exists`, `create or
-- replace`), so applying it again under its own number costs nothing and
-- leaves one version per file, which is the only thing that makes an ordered
-- replay mean anything.
--
-- `assignee_user_id` and `paused_until` were carrying three facts between them,
-- and the middle one had nowhere to live:
--
--   responsibility        which member is on the hook for this customer. It can
--                         outlive any one exchange, and it should survive a
--                         handover. `assignee_user_id`.
--   live control          who is controlling the answer RIGHT NOW -- a person
--                         mid-conversation, or a call in progress. It is
--                         claimed, released, and EXPIRES. It had no column.
--   automation permission may the machine speak at all. That is a policy
--                         answer, and inferring it from whether a row happens
--                         to name somebody is what went wrong.
--
-- Two live defects came out of that one omission.
--
-- The first: the door refuses a queued draft when `assignee_user_id` is set
-- (core deliver.ts), and nothing ever clears that column. `expire_stale_pauses`
-- skips any thread that still has an open escalation, and take-over leaves the
-- escalation open on purpose -- so a thread taken over and never handed back
-- keeps an assignee for ever, and the workspace's veto window silently stops
-- working on it. The same column is never cleared when a member is removed
-- from the workspace either, so a departed colleague goes on holding threads
-- that then sit in nobody's queue.
--
-- The second: a customer on the phone who also writes on WhatsApp is answered
-- by the text receptionist at the same moment, because nothing anywhere could
-- say "a call is in progress on this thread". There was no fact to read.
--
-- So control becomes its own fact, with a holder, an expiry and an atomic
-- claim. A read-then-decide loses the race it exists to settle, which is why
-- the claim is taken behind a row lock rather than as a select and an update.
-- Nothing here decides POLICY: what a live hold stops is the door's to say,
-- and the door says it in one place.

-- 1. The fact -----------------------------------------------------------------
alter table public.conversations
  add column if not exists control_kind  text,
  add column if not exists control_by    uuid references auth.users (id),
  add column if not exists control_ref   text,
  add column if not exists control_until timestamptz;

-- Both or neither, and each kind carries the one handle that names its holder:
-- a person is a user, a call is the provider's id for it. A holder we cannot
-- name is a hold nobody can release.
alter table public.conversations
  drop constraint if exists conversations_control_check;
alter table public.conversations
  add constraint conversations_control_check check (
    (control_kind is null) = (control_until is null)
    and (control_kind is null or control_kind in ('person', 'call'))
    and (control_kind is distinct from 'person' or control_by is not null)
    and (control_kind is distinct from 'call' or control_ref is not null)
    and (control_kind is not null or (control_by is null and control_ref is null))
  );

comment on column public.conversations.control_kind is
  'Who is answering on this thread right now: person, call, or nobody. Apart from assignee_user_id, which is who is RESPONSIBLE and may outlive the exchange.';
comment on column public.conversations.control_until is
  'When the hold lapses on its own. A hold with no expiry is how a thread ends up held for ever by somebody who has gone.';

-- The column grant is the door (00037, 00121): members read these and write
-- none of them. Control moves only through the functions below, which the
-- service role calls -- the dashboard through server/service.ts, the way it
-- reaches the ledger, and the edge directly.
revoke update on public.conversations from authenticated, anon;
grant update (state, paused_until, snooze_until, assignee_user_id, last_message_at)
  on public.conversations to authenticated;

-- 2. The claim ----------------------------------------------------------------
create or replace function public.claim_conversation_control(
  p_tenant_id       uuid,
  p_conversation_id uuid,
  p_kind            text,
  p_by              uuid,
  p_ref             text,
  p_seconds         integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind  text;
  v_by    uuid;
  v_ref   text;
  v_until timestamptz;
  v_same  boolean;
  v_live  boolean;
begin
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
  -- Renewed is the same holder going on; taking one from somebody else is a
  -- claim, and the caller is owed the difference -- it is the line in the log
  -- that says a person stepped into a call.
  return case when v_live and v_same then 'renewed' else 'claimed' end;
end $$;

revoke execute on function public.claim_conversation_control(uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
comment on function public.claim_conversation_control(uuid, uuid, text, uuid, text, integer) is
  'Take the live hold on a thread, or renew one this holder already has. A person takes it from anyone; a call never takes one somebody else holds. Returns claimed, renewed, held or gone. Atomic: the row is locked, so two claimants cannot both be told the thread was free.';

-- 3. Letting go ---------------------------------------------------------------
-- Only the holder may let go, which is what stops a call that ended twenty
-- minutes ago from clearing the hold a person has taken since.
create or replace function public.release_conversation_control(
  p_tenant_id       uuid,
  p_conversation_id uuid,
  p_kind            text,
  p_by              uuid,
  p_ref             text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
  return v_released > 0;
end $$;

revoke execute on function public.release_conversation_control(uuid, uuid, text, uuid, text) from public, anon, authenticated;
comment on function public.release_conversation_control(uuid, uuid, text, uuid, text) is
  'Let go of a hold this holder has. False when somebody else holds it now, which is the answer a late release is owed.';

-- 4. What runs out, runs out --------------------------------------------------
-- The sweeper gains the hold. Deliberately as its own statement and WITHOUT
-- the escalation condition the pause carries: a hold lapsing says the speaker
-- has gone, not that the thread no longer needs a person. That distinction is
-- the whole reason these are separate facts now.
create or replace function public.expire_stale_pauses() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update conversations
     set control_kind = null, control_by = null, control_ref = null, control_until = null
   where control_until is not null and control_until < now();

  with expired as (
    update conversations c
       set state = 'open', paused_until = null, assignee_user_id = null
     where c.state = 'needs_human'
       and c.paused_until is not null
       and c.paused_until < now()
       and not exists (
         select 1 from escalations e
          where e.conversation_id = c.id and e.state = 'open')
    returning c.id, c.tenant_id
  )
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  select tenant_id, 'conversation.pause_expired', 'conversation', 'conversation', id, '{}'::jsonb
    from expired;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

comment on function public.expire_stale_pauses() is
  'Ends what has run out on a thread: the hold on who is speaking, always; and the pause, when no escalation still asks for a person. Returns the number of pauses ended (00006, 00130).';

-- 5. Somebody who has gone holds nothing ---------------------------------------
create or replace function public.clear_control_of_departed_member() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
     set assignee_user_id = null
   where tenant_id = old.tenant_id and assignee_user_id = old.user_id;
  update conversations
     set control_kind = null, control_by = null, control_ref = null, control_until = null
   where tenant_id = old.tenant_id and control_kind = 'person' and control_by = old.user_id;
  return old;
end $$;

-- A definer function is not a session's to call, trigger or not: the trigger
-- fires as the table's owner either way, and privileges.db.test.mjs holds every
-- one of them to this.
revoke execute on function public.clear_control_of_departed_member() from public, anon, authenticated;

drop trigger if exists memberships_clear_control on public.memberships;
create trigger memberships_clear_control
  after delete on public.memberships
  for each row execute function public.clear_control_of_departed_member();

comment on function public.clear_control_of_departed_member() is
  'A member removed from a workspace stops being responsible for its threads and stops holding any. Without this, a departed colleague went on owning conversations that then sat in nobody''s queue, and the door went on refusing the receptionist''s drafts on their behalf for ever.';
