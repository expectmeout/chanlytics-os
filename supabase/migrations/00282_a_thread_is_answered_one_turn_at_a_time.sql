-- 00282 · A thread is answered one turn at a time.
--
-- Two messages from one customer a moment apart were answered independently: each webhook asked the model and sent
-- its own reply, the first written without the second in view (the scorecard's category 15, "serialise inbound work
-- per conversation"). Now a message about to be answered claims its thread's reply turn, and asks again before its
-- words go out (core inbound/turn.ts).
--
--   reply_turns                  one row per thread: the message whose reply is being written. The service role's
--                                only; no member reads or writes it.
--   claim_reply_turn(...)        the turn for this message, unless a NEWER message of the thread holds it (by when
--                                each was recorded, then by id): the newest message's memory was read after every
--                                older one was recorded (ingest is serialised per sender, 00110), so its reply answers
--                                them all. When the turn moves from an older message, the receptionist's drafts that
--                                older turn left waiting (its veto window, its confidence hold) are withdrawn, as
--                                superseded: a reply not yet sent does not go after the newer one. True when held.
--   holds_reply_turn(...)        whether this message may still send: true unless a NEWER message of the thread has taken
--                                the turn from it. It mirrors the claim's rule rather than reading only the row, so a
--                                thread nobody claimed (a claim that could not be made, a row from before this
--                                migration) and a turn an older message still names are this message's to answer:
--                                the bookkeeping fails open and never costs a reply.
--
-- A thread with no row is anybody's: the first message to claim it takes it. A message that carries a photo the
-- receptionist looks at takes no part (core inbound/turn.ts): the picture reaches only its own model turn, never the
-- memory a newer message's reply is written from.
--
-- The order is by when each message was recorded (created_at, the transaction's start), then by id. Two ingests of one
-- identity are serialised by an advisory lock (00110), but the lock is taken inside the transaction, after now() was
-- read, so two messages within a millisecond of each other can commit in the opposite order to their created_at; the
-- newer-by-time one may then have read its memory before the other was recorded. It needs two messages from one
-- customer inside a millisecond, which no provider delivers; the cost is that the older-committed one is not answered
-- on its own. Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.reply_turns (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  message_id      uuid not null,
  claimed_at      timestamptz not null default now()
);
comment on table public.reply_turns is
  'Whose reply a thread is waiting on: the message claim_reply_turn() gave the turn to. Service role only (core inbound/turn.ts).';
alter table public.reply_turns enable row level security;
revoke all on public.reply_turns from public, anon, authenticated;
grant select, insert, update, delete on public.reply_turns to service_role;

create or replace function public.claim_reply_turn(p_tenant uuid, p_conversation uuid, p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine timestamptz;
  v_before uuid;
  v_held uuid;
begin
  select m.created_at into v_mine
    from public.messages m
   where m.id = p_message and m.conversation_id = p_conversation and m.tenant_id = p_tenant;
  if v_mine is null then
    raise exception 'claim_reply_turn: message % is not in thread % of workspace %', p_message, p_conversation, p_tenant;
  end if;
  -- The thread's row, locked: two claims at once are taken one after the other.
  insert into public.reply_turns (conversation_id, tenant_id, message_id)
  values (p_conversation, p_tenant, p_message)
  on conflict (conversation_id) do nothing;
  select t.message_id into v_before from public.reply_turns t where t.conversation_id = p_conversation for update;
  if v_before = p_message then
    return true;
  end if;
  update public.reply_turns t
     set message_id = p_message, claimed_at = now()
   where t.conversation_id = p_conversation
     and not exists (
       select 1 from public.messages h
        where h.id = t.message_id
          and (h.created_at, h.id) > (v_mine, p_message)
     )
  returning t.message_id into v_held;
  if v_held is null then
    return false;
  end if;
  -- The older turn's replies still waiting to go are superseded by this one.
  update public.messages d
     set status = 'canceled', error = jsonb_build_object('reason', 'superseded_by_newer_message', 'by', p_message)
   where d.conversation_id = p_conversation
     and d.tenant_id = p_tenant
     and d.direction = 'outbound'
     and d.sender = 'ai'
     and d.status = 'queued'
     and d.meta->>'source' in ('veto_window', 'low_confidence');
  return true;
end $$;
revoke execute on function public.claim_reply_turn(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_reply_turn(uuid, uuid, uuid) to service_role;
comment on function public.claim_reply_turn(uuid, uuid, uuid) is
  'The thread''s reply turn for this message, unless a newer message of the thread (by created_at, then id) holds it; moving the turn withdraws the receptionist''s drafts an older turn left queued. True when held.';

create or replace function public.holds_reply_turn(p_conversation uuid, p_message uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.reply_turns t
      join public.messages h on h.id = t.message_id
      join public.messages m on m.id = p_message
     where t.conversation_id = p_conversation
       and t.message_id <> p_message
       and (h.created_at, h.id) > (m.created_at, m.id)
  )
$$;
revoke execute on function public.holds_reply_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.holds_reply_turn(uuid, uuid) to service_role;
comment on function public.holds_reply_turn(uuid, uuid) is
  'Whether this message may still send: false only when a newer message of the thread (by created_at, then id) has taken the turn from it. A thread with no row, or one an older message names, is this message''s: the claim''s own rule, so a claim that failed open is not turned into a dropped reply.';
