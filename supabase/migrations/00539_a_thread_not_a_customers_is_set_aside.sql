-- 00539 · A thread that is not a customer's is set aside (decision 0093).
--
-- A sender read as selling to the business, or as a program, held a thread in Needs you for days, and "Not a customer" led to
-- a typed-name delete. A hold is the wrong place for it: deadman_candidates warns of every open hold, and the badge counts
-- it. So the hold is resolved, and the conversation says what it is.
--
--   conversations.set_aside_at, set_aside_why   When it was set aside and as what (pitch, notice). Archived with it: nothing
--                                               counts it, and a thread left unanswered is never one archived.
--   conversation_set_aside                      The service role's: the drafter's, with no member to name.
--   conversation_not_a_customer                 A member's word: the thread stays archived, off the Set aside list, and its
--                                               sender's address is said to be automated. With p_undo, all of it back.
--   conversation_reply_anyway                   A member's word the other way: its sender is a person, the hold it left is
--                                               open again, and the draft it was refused is owed.
--   decisions_verb_check                        Takes not_a_customer and reply_anyway.
--   reply_draft_uses                            What the replies sent did with the draft that stood: Health's number.
--
-- Deploy order: this migration first. Nothing before it reads the columns. Re-runnable.

set local lock_timeout = '3s';

alter table public.conversations add column if not exists set_aside_at timestamp with time zone;
alter table public.conversations add column if not exists set_aside_why text;
alter table public.conversations drop constraint if exists conversations_set_aside_why_check;
alter table public.conversations add constraint conversations_set_aside_why_check
  check (set_aside_why is null or set_aside_why = any (array['pitch', 'notice']));
comment on column public.conversations.set_aside_at is
  'When the thread was set aside as not a customer''s (00539, decision 0093), and still is: null once a member answered it.';
comment on column public.conversations.set_aside_why is
  'What its sender was read as: pitch, or notice (a program''s mail). Kept past set_aside_at, for an Undo.';

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence', 'not_a_customer', 'reply_anyway'
]));

/* --------------------------------------------------------------------------------------------- the drafter's door -- */

create or replace function public.conversation_set_aside(p_tenant_id uuid, p_conversation_id uuid, p_why text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
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
  -- The platform's own close, as a reading's is: no member is named as resolving it, and no decision is recorded.
  update public.escalations
     set state = 'resolved'
   where conversation_id = p_conversation_id and tenant_id = p_tenant_id and state = 'open';
  return true;
end $$;
revoke all on function public.conversation_set_aside(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.conversation_set_aside(uuid, uuid, text) to service_role;
comment on function public.conversation_set_aside(uuid, uuid, text) is
  'A thread set aside as not a customer''s, in one transaction (00539, decision 0093): archived, said so, its open hold resolved. False where someone has the thread. The service role''s.';

/* --------------------------------------------------------------------------------------------- a member's two words -- */

/** The address a thread's newest message of theirs came from, or the person's own. */
create or replace function public.conversation_sender_address(p_tenant_id uuid, p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(coalesce(
    (select m.meta -> 'email' ->> 'from'
       from public.messages m
      where m.tenant_id = p_tenant_id and m.conversation_id = p_conversation_id and m.sender = 'customer'
      order by m.created_at desc
      limit 1),
    (select k.email
       from public.conversations c
       join public.contacts k on k.id = c.contact_id and k.tenant_id = c.tenant_id
      where c.tenant_id = p_tenant_id and c.id = p_conversation_id)
  )));
$$;
revoke all on function public.conversation_sender_address(uuid, uuid) from public, anon, authenticated;
comment on function public.conversation_sender_address(uuid, uuid) is
  'The address a thread''s sender wrote from (00539): what a member''s word about the thread is said of. For the two doors below.';

create or replace function public.conversation_not_a_customer(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_undo boolean default false,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_sender   text;
  v_decision jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Undone, it is on the list again, as what it was. No row is a thread that moved while the person looked.
  update public.conversations
     set set_aside_at = case when p_undo then now() end
   where id = p_conversation_id and tenant_id = p_tenant_id
     and (case when p_undo then set_aside_at is null and set_aside_why is not null else set_aside_at is not null end)
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  v_sender := public.conversation_sender_address(p_tenant_id, p_conversation_id);
  if v_sender is not null and v_sender <> '' then
    if p_undo then
      delete from public.mailbox_senders
       where tenant_id = p_tenant_id and sender = v_sender and verdict = 'automated';
    else
      insert into public.mailbox_senders (tenant_id, sender, verdict, set_by, set_at)
      values (p_tenant_id, v_sender, 'automated', v_actor, now())
      on conflict (tenant_id, sender)
        do update set verdict = excluded.verdict, set_by = excluded.set_by, set_at = excluded.set_at;
    end if;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'mailbox_connection.sender_sorted', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('kind', 'address', 'verdict', case when p_undo then null else 'automated' end, 'by', v_actor));
  end if;
  v_decision := public.team_decision(p_tenant_id, v_actor, 'conversation', p_conversation_id, 'not_a_customer',
                                     jsonb_build_object('undone', p_undo), p_via, p_undo_of);
  return jsonb_build_object('set_aside', p_undo) || v_decision;
end $$;
revoke execute on function public.conversation_not_a_customer(uuid, uuid, boolean, text, uuid) from public, anon;
grant execute on function public.conversation_not_a_customer(uuid, uuid, boolean, text, uuid) to authenticated, service_role;
comment on function public.conversation_not_a_customer(uuid, uuid, boolean, text, uuid) is
  'A member says a thread set aside is not a customer''s (00539, decision 0093): off the list, still archived, its sender''s address automated, the decision, in one transaction; with p_undo, back on the list with the address unsaid. Null when no row moved. The domain stays the person page''s.';

create or replace function public.conversation_reply_anyway(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_sender   text;
  v_reason   text;
  v_details  text;
  v_decision jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- contracts' reopen move: open, with nothing else to clear, since setting aside cleared it.
  update public.conversations
     set state = 'open', set_aside_at = null, set_aside_why = null
   where id = p_conversation_id and tenant_id = p_tenant_id and set_aside_at is not null
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  -- Its sender is a person: this outranks what they were read to be, so they come in from here on (decision 0080's order).
  v_sender := public.conversation_sender_address(p_tenant_id, p_conversation_id);
  if v_sender is not null and v_sender <> '' then
    insert into public.mailbox_senders (tenant_id, sender, verdict, set_by, set_at)
    values (p_tenant_id, v_sender, 'person', v_actor, now())
    on conflict (tenant_id, sender)
      do update set verdict = excluded.verdict, set_by = excluded.set_by, set_at = excluded.set_at;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'mailbox_connection.sender_sorted', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('kind', 'address', 'verdict', 'person', 'by', v_actor));
  end if;
  -- The row that said it was no customer's goes, so the claim the hold's own event makes takes this message.
  delete from public.conversation_drafts d
   where d.tenant_id = p_tenant_id and d.conversation_id = p_conversation_id and d.state = 'pitch';
  v_decision := public.team_decision(p_tenant_id, v_actor, 'conversation', p_conversation_id, 'reply_anyway',
                                     '{}'::jsonb, p_via, p_undo_of);
  -- The hold it left, open again: its reason and what it said, through the one door a thread is handed to a person by.
  select e.reason, e.details into v_reason, v_details
    from public.escalations e
   where e.tenant_id = p_tenant_id and e.conversation_id = p_conversation_id
   order by e.created_at desc
   limit 1;
  perform public.escalation_open(p_tenant_id, p_conversation_id, coalesce(v_reason, 'email_review'), v_details);
  return jsonb_build_object('reopened', true) || v_decision;
end $$;
revoke execute on function public.conversation_reply_anyway(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.conversation_reply_anyway(uuid, uuid, text, uuid) to authenticated, service_role;
comment on function public.conversation_reply_anyway(uuid, uuid, text, uuid) is
  'A member says a thread set aside is a customer''s after all (00539, decision 0093): open again, its sender a person, its hold re-opened with its first reason (so a draft is owed), the decision, in one transaction. Null when no row moved.';

/* ---------------------------------------------------------------------------- what the drafts came to, for Health -- */

create or replace function public.reply_draft_uses(p_days integer)
returns table (ours boolean, use text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.ours, m.meta -> 'draft' ->> 'use', count(*)
    from public.messages m
    join public.tenants t on t.id = m.tenant_id
   where m.created_at >= now() - make_interval(days => greatest(p_days, 1))
     and m.direction = 'outbound'
     and m.meta -> 'draft' ->> 'use' is not null
   group by t.ours, m.meta -> 'draft' ->> 'use';
$$;
revoke all on function public.reply_draft_uses(integer) from public, anon, authenticated;
grant execute on function public.reply_draft_uses(integer) to service_role;
comment on function public.reply_draft_uses(integer) is
  'How the replies members sent over a window used the thread''s draft (00539, decision 0093): as written, edited or not used, by whether the workspace is ours. Health''s number.';
