-- 00713 · An approval is kept whole or not at all, and a form's reply answers its request in the message's own write
-- (the outside audit of c6cf732bb8: 4.2, 4.3, 4.5).
--
-- An approval wrote three things before its door, each on its own: the facts the owner stated (owner_claims_keep), the
-- piece's new words (piece_words_keep, which also moves the words of its other posts still waiting), then the approval
-- (post_approve, or piece_posts_replace for a version). A door that refused (one already on its way, a file gone or
-- changed) left the first two kept: a refused press could still change what an already scheduled post says. And a
-- version's press read the posts still waiting, then let go whichever were still waiting when its door ran, with nothing
-- to say they were the ones the owner saw: one that began to send in between went up beside its replacement.
--
--   post_approve_whole           A member's press, with the settings permission: the facts kept, the words kept, the
--                                approval or the version set in place, in one transaction, and nothing kept where the
--                                door refuses. A version's press names the posts it saw (`expected`): they are held
--                                still while they are swapped, and a set that moved since is refused as changed, with
--                                nothing written. The three doors it calls are not re-made; their own checks all run.
--
-- A form's reply was queued, then linked to the request it answered in a second write: a link that failed left the
-- customer answered and the request open.
--
--   messages_answer_a_form_request   A message that says which request it answers (meta.form_entry_id) is linked to it
--                                as it is written, in the same statement: a link that cannot be written is a message
--                                that is not, so the reply verb's own failure path lets its key go and nothing is sent.
--
-- Locks: one trigger added on messages (a brief SHARE ROW EXCLUSIVE). Three seconds and no more. Re-runnable.
-- Deploy order: this file first, then the code. A build before it calls none of this; a build after it calls
-- post_approve_whole and leaves the link to the trigger.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------- 1. post_approve_whole -- */

create or replace function public.post_approve_whole(p_tenant_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_replace  boolean := coalesce((p_approval ->> 'replace')::boolean, false);
  v_expected uuid[];
  v_waiting  uuid[];
  v_claim    jsonb;
  v_answer   jsonb;
  v_refused  boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- A version set in place of the posts still waiting: those the owner saw, held still until the swap is made. Where
  -- one has begun to send, or another is waiting now, it is not what they approved.
  if v_replace then
    v_expected := array(select e::uuid from jsonb_array_elements_text(coalesce(p_approval -> 'expected', '[]'::jsonb)) e
                         order by 1);
    select coalesce(array_agg(w.id order by w.id), '{}'::uuid[]) into v_waiting
      from (select p.id from public.posts p
             where p.tenant_id = p_tenant_id and p.place <> 'hand'
               and p.status = any (array['queued', 'preparing', 'held'])
               and (p.id = any (v_expected)
                    or p.piece_id in (select q.piece_id from public.posts q
                                       where q.tenant_id = p_tenant_id and q.id = any (v_expected)))
             for update) w;
    if cardinality(v_expected) = 0 or v_waiting is distinct from v_expected then
      return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
    end if;
  end if;
  begin
    -- A fact the owner stated, kept as their own claim until its day ends (00706).
    for v_claim in select * from jsonb_array_elements(coalesce(p_approval -> 'claims', '[]'::jsonb)) loop
      perform public.owner_claims_keep(p_tenant_id, v_claim);
    end loop;
    -- The words that go, the piece's own from now on, and its other posts still waiting with them (00681).
    if nullif(btrim(p_approval ->> 'words'), '') is not null then
      perform public.piece_words_keep(p_tenant_id, p_file_id, p_approval ->> 'words');
    end if;
    if v_replace then
      v_answer := public.piece_posts_replace(p_tenant_id, p_file_id, p_approval);
    else
      v_answer := public.post_approve(p_tenant_id, p_file_id, p_approval);
    end if;
    if v_answer ->> 'fate' is distinct from 'approved' then
      v_refused := true;
      raise exception 'not approved' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    -- Only this door's own refusal is an answer: the facts and the words go with it. Any other is raised as it came.
    if not v_refused then
      raise;
    end if;
    return v_answer;
  end;
  return v_answer;
end $$;
revoke all on function public.post_approve_whole(uuid, uuid, jsonb) from public, anon;
grant execute on function public.post_approve_whole(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.post_approve_whole(uuid, uuid, jsonb) is
  'A member''s press, with the settings permission (00713; the outside audit''s 4.2 and 4.3): an approval kept whole or not at all. p_approval is post_approve''s, with claims [{kind, text, source, valid_until}] (owner_claims_keep), words (piece_words_keep, where there are words), replace (piece_posts_replace in place of post_approve) and, with replace, expected: the ids of the posts still waiting that the owner saw, held still while they are swapped. Answers the approving door''s answer; a refusal keeps nothing, and a set of waiting posts that moved since is {fate: changed}.';

/* ----------------------------------------------------------------------- 2. a reply answers its request -- */

create or replace function public.messages_answer_a_form_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.form_entry_links (tenant_id, entry_id, kind, message_id, created_by)
  values (new.tenant_id, (new.meta ->> 'form_entry_id')::uuid, 'reply', new.id, new.sent_by);
  return null;
end $$;
revoke all on function public.messages_answer_a_form_request() from public, anon, authenticated;
comment on function public.messages_answer_a_form_request() is
  'A form''s reply linked to the request it answers as it is written (00713; the outside audit''s 4.5): an outbound message whose meta names form_entry_id. The link''s key to form_entries is the row''s own workspace, so a request of another workspace is no link and no message.';

create or replace trigger messages_answer_a_form_request after insert on public.messages
  for each row
  when (new.direction = 'outbound' and new.meta ? 'form_entry_id')
  execute function public.messages_answer_a_form_request();
