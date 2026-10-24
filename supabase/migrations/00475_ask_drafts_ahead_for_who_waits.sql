-- 00475 · Ask drafts ahead for who is waiting (decision 0071, E2).
--
-- Today's Need you offers each person waiting a reply Ask has already written (for a call back, what to say on the
-- call), so the section opens with the words in it. A draft is one model call (the person draft's,
-- server/new-conversation/person-draft.ts), kept on the thread until the customer writes again, so every tab and every
-- teammate reads the same words for that one call.
--
--   conversation_drafts       One draft a thread and kind (reply, brief): the words, the customer's message it answers,
--                             who had it written and when. Members read their workspace's; only the door writes.
--   conversation_draft_keep   The door: a member who acts keeps a thread's draft, the thread their workspace's, the
--                             message one of its own.
--
-- A draft is text: nothing is sent by keeping it, and it goes only through the reply's own door on a press. A thread
-- deleted takes its drafts with it (the key names the workspace too, 00279), so an erasure, which cascades the
-- conversation, leaves none. Either deploy order works: a dashboard without the code reads and writes none of it.
-- Re-runnable throughout.

set local lock_timeout = '3s';

-- Its key is its own id, as messages' is, and one a thread and kind is a unique constraint beside it. With
-- (tenant_id, conversation_id, kind) as the primary key both foreign keys sat inside it, and PostgREST read the table
-- as a join between conversations and tenants: every conversations -> tenants embed (the send's read of the wire)
-- found two relationships and was refused (the migrations replay on #1820).
create table if not exists public.conversation_drafts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  -- A reply to their last message, or the brief for a call back.
  kind            text not null check (kind in ('reply', 'brief')),
  -- The customer's message the draft answers: a newer one makes it stale, and Today asks for it again.
  for_message_id  uuid,
  -- {text, subject, brief, asks}: contracts need-you/reply-drafts.ts ReplyDraftWords.
  words           jsonb not null default '{}'::jsonb,
  made_by         uuid references auth.users (id) on delete set null,
  made_at         timestamptz not null default now(),
  constraint conversation_drafts_one_a_thread_and_kind unique (tenant_id, conversation_id, kind)
);
comment on table public.conversation_drafts is
  'Ask''s drafts written ahead for a thread waiting on a person (decision 0071): a reply to their newest message, or the brief for a call back, one a thread and kind, kept until they write again. Text only; nothing is sent by it. Members read their workspace''s; written through conversation_draft_keep.';

-- The key names the workspace too (00279): a draft names only its own workspace's thread, and goes with it.
alter table public.conversation_drafts drop constraint if exists conversation_drafts_conversation_same_workspace;
alter table public.conversation_drafts add constraint conversation_drafts_conversation_same_workspace
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade;

alter table public.conversation_drafts enable row level security;
drop policy if exists conversation_drafts_member_select on public.conversation_drafts;
create policy conversation_drafts_member_select on public.conversation_drafts for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.conversation_drafts from anon, authenticated;
grant select on public.conversation_drafts to authenticated;
grant select, insert, update, delete on public.conversation_drafts to service_role;

create or replace function public.conversation_draft_keep(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_kind text,
  p_words jsonb,
  -- The customer's message the draft answers; none for a thread nothing has come to yet.
  p_for_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.conversation_drafts%rowtype;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule).
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A member who acts: a viewer sends nothing, so nothing is drafted for one.
  if not public.is_acting_member(p_tenant_id) then
    return jsonb_build_object('error', 'not_acting');
  end if;
  if p_kind is null or p_kind not in ('reply', 'brief') then
    raise exception 'conversation_draft_keep: kind is reply or brief' using errcode = '22023';
  end if;
  -- The words are an object of a draft's size: four thousand characters of message and a brief at most.
  if p_words is null or jsonb_typeof(p_words) <> 'object' or octet_length(p_words::text) > 16000 then
    raise exception 'conversation_draft_keep: the words are one draft''s' using errcode = '22023';
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.tenant_id = p_tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  -- The message it answers is one of the thread's own.
  if p_for_message_id is not null and not exists (
    select 1 from public.messages m
     where m.id = p_for_message_id and m.conversation_id = p_conversation_id and m.tenant_id = p_tenant_id
  ) then
    raise exception 'conversation_draft_keep: the message is the thread''s own' using errcode = '22023';
  end if;
  insert into public.conversation_drafts as d (tenant_id, conversation_id, kind, for_message_id, words, made_by, made_at)
  values (p_tenant_id, p_conversation_id, p_kind, p_for_message_id, p_words, v_actor, now())
  on conflict on constraint conversation_drafts_one_a_thread_and_kind do update
     set for_message_id = excluded.for_message_id,
         words = excluded.words,
         made_by = excluded.made_by,
         made_at = excluded.made_at
  returning * into v_row;
  return jsonb_build_object(
    'conversation_id', v_row.conversation_id,
    'kind', v_row.kind,
    'for_message_id', v_row.for_message_id,
    'words', v_row.words,
    'made_at', v_row.made_at
  );
end $$;
revoke execute on function public.conversation_draft_keep(uuid, uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.conversation_draft_keep(uuid, uuid, text, jsonb, uuid) to authenticated;
comment on function public.conversation_draft_keep(uuid, uuid, text, jsonb, uuid) is
  'Keep Ask''s draft for a thread waiting on a person (decision 0071): a member who acts, the thread their workspace''s, the message it answers one of the thread''s own. One a thread and kind, the newest kept. Returns the draft, or {error: not_acting | not_found}.';
