-- 00428 · An email the owner sends is handed to them (the lead workbench's calls 7 and 10; decision 0059).
--
-- A reach-out says who sends it: the mailboxes its business connected (decision 0056), or its owner, from their own
-- inbox. An owner's reach-out plans, checks and approves as any other; when an email is due it is written and handed
-- to the owner as a draft, and the owner says whether it went. Nothing of 0056's wire changes.
--
--   playbooks.owner_sends        a root's: its owner sends its emails (the sheet's From, "You send them").
--   reach_out_sends              state drafted (claimed, then written and handed to its owner), drafted_at, draft (the
--                                address, the subject and the words with its foot, as the owner sends them), said_at
--                                and said_by (who said it went, or did not).
--   reach_out_sends_guard        claimed -> drafted; drafted -> sent | skipped.
--   reach_out_claim_drafts       an owner's due sends, claimed to be drafted: a step after the first before a first
--                                email. No mailbox, no day's room: the run planned the day's share.
--   reach_out_claim_from         a mailbox never takes an owner's send, and its steps after the first go first (call 10).
--   reach_out_finishable, reach_out_closed_sends, reach_out_held_stale, trigger_reach_out_sweep
--                                a draft is open, closes with a canceled run, and is given up fourteen days after it
--                                was handed (kept_waiting), as a hold is.
--   reach_out_send_said          the owner's Sent or Skip: on Sent, in one transaction, the person, the email as sent
--                                (no provider, no Message-ID: the owner's own client sent it), the send, and the lead
--                                written to (lead.emailed), as the clock does for an email that left.
--   reach_out_replies            claim owner (what they wrote back, as the owner said it) and said_by.
--   reach_out_reply_apply        p_said: the reading's "whose reply" from the send, not from an email; the lead's drafts
--                                are skipped with its waiting sends.
--   reach_out_reply_said         the member's door to it, on the lead's latest email that went: the owner's word is
--                                a note on the person's email thread, which the reading is keyed to (its message).
--   reach_out_lead_stop, reach_out_leave_out, reach_out_save
--                                a draft is skipped where a planned or held send is; the chain saves owner_sends.
--   reach_out_root_lines, reach_out_search_lines
--                                a lead's drafts waiting to be sent, and how many there are (to_send).
--   reach_out_report             Reports' mailboxes: the emails their owners sent from their own inbox, a row apart.
--   lead_blank                   a lead blanked takes its drafts: one waiting is skipped (lead_gone), each cleared.
--
-- Either deploy order works: an edge without the draft claim drafts nothing, and a dashboard without the doors shows no
-- To send. Production holds no reach-out send (13 October 2026). Re-runnable throughout.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------- 1. who sends a reach-out -- */

alter table public.playbooks add column if not exists owner_sends boolean not null default false;
alter table public.playbooks drop constraint if exists playbooks_owner_sends_is_a_root_s;
alter table public.playbooks add constraint playbooks_owner_sends_is_a_root_s
  check (not owner_sends or (kind = 'reach_out' and trigger = 'lead_first'));
comment on column public.playbooks.owner_sends is
  'A reach-out''s root (00428): its owner sends its emails from their own inbox, each handed to them written and checked (state drafted), rather than its mailboxes (mailbox_ids). Its steps read it from the root.';

/* ------------------------------------------------------------------------- 2. a send handed to its owner -- */

alter table public.reach_out_sends
  add column if not exists drafted_at timestamptz,
  add column if not exists draft jsonb,
  add column if not exists said_at timestamptz,
  add column if not exists said_by uuid references auth.users (id) on delete set null;

alter table public.reach_out_sends drop constraint if exists reach_out_sends_state_check;
alter table public.reach_out_sends add constraint reach_out_sends_state_check
  check (state in ('planned', 'held', 'claimed', 'queued', 'drafted', 'sent', 'skipped', 'failed', 'handed')) not valid;
alter table public.reach_out_sends validate constraint reach_out_sends_state_check;

-- A draft is dated and whole: its address, its subject and its words, under 16 KB.
alter table public.reach_out_sends drop constraint if exists reach_out_sends_drafted_is_whole;
alter table public.reach_out_sends add constraint reach_out_sends_drafted_is_whole check (
  (state <> 'drafted' or (drafted_at is not null and draft is not null))
  and (draft is null or (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 16000)));

comment on column public.reach_out_sends.drafted_at is
  'When this send was handed to its owner, written and checked (00428): its fourteen days to be sent start here.';
comment on column public.reach_out_sends.draft is
  'The email handed to the owner (00428): {to, subject, body, text, parent_id?}, the words with their values in and, in text, with the foot. What the Sent door writes as the email.';
comment on column public.reach_out_sends.said_at is
  'When the owner said this drafted email went, or did not (00428).';
comment on column public.reach_out_sends.said_by is
  'The member who said it (00428).';

create index if not exists reach_out_sends_drafted on public.reach_out_sends (broadcast_id, drafted_at)
  where state = 'drafted';

-- 00197's guard: a claim is drafted by its writer, and a draft is sent or skipped on its owner's word.
create or replace function public.reach_out_sends_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if not (
      (OLD.state = 'planned' and NEW.state in ('claimed', 'skipped', 'held')) or
      (OLD.state = 'held' and NEW.state in ('planned', 'skipped')) or
      (OLD.state = 'claimed' and NEW.state in ('queued', 'drafted', 'planned', 'skipped', 'failed')) or
      (OLD.state = 'queued' and NEW.state in ('sent', 'planned', 'skipped', 'failed')) or
      (OLD.state = 'drafted' and NEW.state in ('sent', 'skipped'))
    ) then
      raise exception 'reach_out_sends.state moves % -> % refused', OLD.state, NEW.state;
    end if;
    if NEW.state = 'claimed' and NEW.checked_at is null then
      raise exception 'reach_out_sends: a send is claimed only once it is checked';
    end if;
  end if;
  return NEW;
end $$;

/* ------------------------------------------------------------------------------------ 3. the two claims -- */

-- An owner's due sends, to be drafted: planned, checked and due, of a running step and chain in a run that goes ahead.
-- A step after the first before a first email (a nudge keeps its thread warm). No room is counted: the run planned the
-- day's share (core runReachOut, REACH_OUT_DRAFTS_PER_DAY), and the owner is the pace. A send planned on a mailbox before
-- its chain was handed to its owner is drafted too, its mailbox let go.
create or replace function public.reach_out_claim_drafts(p_at timestamptz, p_limit integer, p_tenant_id uuid default null)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_at is null or p_limit is null or p_limit <= 0 then
    return;
  end if;
  return query
  with picked as materialized (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.state = 'planned' and s2.send_at <= p_at and s2.checked_at is not null
        and (p_tenant_id is null or s2.tenant_id = p_tenant_id)
        and r.owner_sends
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by (p.after_playbook_id is null), s2.send_at
      limit p_limit
      for update of s2 skip locked)
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at, mailbox_id = null
    from picked
   where s.id = picked.id
  returning s.*;
end $$;
revoke all on function public.reach_out_claim_drafts(timestamptz, integer, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_claim_drafts(timestamptz, integer, uuid) to service_role;
comment on function public.reach_out_claim_drafts(timestamptz, integer, uuid) is
  'The due sends of reach-outs their owners send (00428), claimed to be drafted, at most p_limit: planned, checked and due, in a running chain and a run that goes ahead, a step after the first before a first email. Their mailbox is let go. Service role only.';

-- 00424's claim: never an owner's send (its draft claim takes it), and a mailbox's steps after the first go before its
-- first emails when both are due (the workbench's call 10: follow-ups first).
create or replace function public.reach_out_claim_from(p_mailbox_id uuid, p_cap integer, p_at timestamptz, p_limit integer)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  if p_mailbox_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per mailbox at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim_mailbox:' || p_mailbox_id::text));
  if not exists (select 1 from public.mailbox_connections
                  where id = p_mailbox_id and state = 'connected'
                    and (resting_until is null or resting_until <= p_at)) then
    return;
  end if;
  v_room := least(p_limit, p_cap - (public.mailbox_capacity(p_mailbox_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then
    return;
  end if;
  -- Picked once, then claimed (00213): a materialized pick runs exactly once, so the claim is at most v_room rows.
  return query
  with picked as materialized (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.mailbox_id = p_mailbox_id and s2.state = 'planned' and s2.send_at <= p_at
        and s2.checked_at is not null
        and not r.owner_sends
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by (p.after_playbook_id is null), s2.send_at
      limit v_room
      for update of s2 skip locked)
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
    from picked
   where s.id = picked.id
  returning s.*;
end $$;
revoke all on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) to service_role;
comment on function public.reach_out_claim_from(uuid, integer, timestamptz, integer) is
  'A connected mailbox''s due reach-out sends, claimed within its day (p_cap less what it has used), at most p_limit, under the mailbox''s lock (C7, 00424): a step after the first before a first email, and never a send of a reach-out its owner sends (00428). Nothing for a mailbox that is not connected, or resting. Service role only.';

/* ------------------------------------------------------------------------------------ 4. the clock's reads -- */

-- 00197's finish: a draft is open, so a run waits for its owner's word on it, or its give-up.
create or replace function public.reach_out_finishable(p_limit int, p_tenant_id uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id from public.broadcasts b
   where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
     and (p_tenant_id is null or b.tenant_id = p_tenant_id)
     and not exists (select 1 from public.reach_out_sends s
                      where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted'))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_finishable(int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_finishable(int, uuid) to service_role;

-- 00197's close: a canceled run's drafts close with its planned and held sends.
create or replace function public.reach_out_closed_sends(p_stuck_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns table (send jsonb, email_status text)
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(s), m.status
    from public.reach_out_sends s
    join public.broadcasts b on b.id = s.broadcast_id
    left join public.messages m on m.id = s.message_id
   where b.state in ('canceled', 'failed') and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and (s.state in ('planned', 'held', 'queued', 'drafted') or (s.state = 'claimed' and s.claimed_at < p_stuck_before))
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_closed_sends(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_closed_sends(timestamptz, int, uuid) to service_role;

-- 00197's give-up: a hold fourteen days from when it was planned, and a draft fourteen days from when it was handed,
-- oldest first. The clock skips each, kept_waiting.
create or replace function public.reach_out_held_stale(p_before timestamptz, p_limit int, p_tenant_id uuid default null)
returns setof public.reach_out_sends
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.reach_out_sends s
   where ((s.state = 'held' and s.created_at < p_before) or (s.state = 'drafted' and s.drafted_at < p_before))
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
   order by coalesce(s.drafted_at, s.created_at)
   limit greatest(coalesce(p_limit, 0), 0)
$$;
revoke execute on function public.reach_out_held_stale(timestamptz, int, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_held_stale(timestamptz, int, uuid) to service_role;

-- 00363's due check: a draft left fourteen days, and a canceled run's draft, are the clock's work too, and a run with a
-- draft open is not finished.
create or replace function public.trigger_reach_out_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
       select 1 from public.reach_out_sends s
         join public.broadcasts b on b.id = s.broadcast_id
         join public.playbooks p on p.id = s.playbook_id
         join public.playbooks r on r.id = s.root_id
        where s.state = 'planned' and s.send_at <= now() and s.checked_at is not null
          and b.state in ('scheduled', 'sending') and p.state = 'running' and r.state = 'running')
     or exists (select 1 from public.reach_out_sends where state in ('claimed', 'queued'))
     or exists (select 1 from public.reach_out_sends where state = 'held' and created_at < now() - interval '14 days')
     or exists (select 1 from public.reach_out_sends where state = 'drafted' and drafted_at < now() - interval '14 days')
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('canceled', 'failed')
          and exists (select 1 from public.reach_out_sends s
                       where s.broadcast_id = b.id and s.state in ('planned', 'held', 'claimed', 'drafted')))
     or exists (
       select 1 from public.broadcasts b
        where b.audience->>'kind' = 'reach_out' and b.state in ('scheduled', 'sending')
          and not exists (select 1 from public.reach_out_sends s
                           where s.broadcast_id = b.id
                             and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted'))) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

revoke all on function public.trigger_reach_out_sweep() from public, anon, authenticated;
grant all on function public.trigger_reach_out_sweep() to service_role;

/* ------------------------------------------------------------------------------- 5. Sent, or not, on its owner's word -- */

-- The owner's word on a drafted email, an acting member's (as reach_out_send_decide is). Said once: a send no longer
-- drafted answers how it stands. Not sent: skipped, with why (owner_skipped, or the door's refusal the server read at
-- Sent). Sent, in one transaction: an address on the never-again list since is skipped (outreach_suppressed); the
-- person (reach_out_person: a lead that closed, or a customer's address, is never written to cold, and the send is
-- skipped with why), the email as its owner sent it (status sent; no provider and no
-- Message-ID, so nothing waits for a receipt), the send sent then, and the lead written to as the clock writes it for an
-- email that left (leadWritten: Ready to Contacted, contacted_at, emailed, lead.emailed).
create or replace function public.reach_out_send_said(p_send_id uuid, p_outcome text, p_message_id uuid default null,
                                                     p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_at      timestamptz := now();
  v_send    public.reach_out_sends%rowtype;
  v_person  jsonb;
  v_contact uuid;
  v_conv    uuid;
  v_to      text;
  v_moved   boolean;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'not_sent') then
    raise exception 'Sent, or not sent.' using errcode = '22023';
  end if;
  select * into v_send from public.reach_out_sends where id = p_send_id for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  if v_send.state <> 'drafted' then
    return jsonb_build_object('said', false, 'state', v_send.state, 'reason', v_send.reason);
  end if;

  if p_outcome = 'not_sent' then
    update public.reach_out_sends
       set state = 'skipped', reason = left(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'owner_skipped'), 60),
           said_at = v_at, said_by = v_user
     where id = p_send_id;
    return jsonb_build_object('said', true, 'state', 'skipped',
                              'reason', left(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'owner_skipped'), 60));
  end if;

  if p_message_id is null then
    raise exception 'An email that went has its id.' using errcode = '22023';
  end if;
  v_to := lower(btrim(coalesce(v_send.draft->>'to', '')));
  -- An address on the never-again list since its draft was handed over (a no, an unsubscribe, its business's domain):
  -- never written to cold, as the send door refuses it (outreach_suppressed).
  if exists (select 1 from public.lead_addresses_suppressed(v_send.tenant_id, array[v_to])) then
    update public.reach_out_sends
       set state = 'skipped', reason = 'outreach_suppressed', said_at = v_at, said_by = v_user
     where id = p_send_id;
    return jsonb_build_object('said', true, 'state', 'skipped', 'reason', 'outreach_suppressed');
  end if;
  v_person := public.reach_out_person(v_send.tenant_id, v_send.lead_id);
  if v_person ? 'refused' then
    update public.reach_out_sends
       set state = 'skipped', reason = left(v_person->>'refused', 60), said_at = v_at, said_by = v_user
     where id = p_send_id;
    return jsonb_build_object('said', true, 'state', 'skipped', 'reason', v_person->>'refused');
  end if;
  v_contact := (v_person->>'contact_id')::uuid;
  v_conv := (v_person->>'conversation_id')::uuid;

  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                               status, meta)
  values (p_message_id, v_send.tenant_id, v_conv, v_contact, 'email', 'outbound', 'human', 'text',
          coalesce(v_send.draft->>'body', ''), 'sent',
          jsonb_build_object(
            'source', 'reach_out',
            'email', jsonb_build_object('subject', v_send.draft->>'subject', 'to', jsonb_build_array(v_to),
                                        'text', v_send.draft->>'text', 'said_by', v_user, 'said_at', v_at)
                     || case when nullif(v_send.draft->>'parent_id', '') is not null
                             then jsonb_build_object('parent_id', v_send.draft->>'parent_id') else '{}'::jsonb end,
            'reach_out', jsonb_build_object('send_id', v_send.id, 'lead_id', v_send.lead_id, 'contact_id', v_contact,
                                            'playbook_id', v_send.playbook_id, 'root_id', v_send.root_id,
                                            'broadcast_id', v_send.broadcast_id, 'attempt', v_send.attempts)))
  on conflict (id) do nothing;

  update public.reach_out_sends
     set state = 'sent', sent_at = v_at, message_id = p_message_id, contact_id = v_contact,
         said_at = v_at, said_by = v_user
   where id = p_send_id;

  update public.leads
     set stage = case when stage = 'ready' then 'nurture' else stage end,
         contacted_at = coalesce(contacted_at, v_at),
         last_outcome = 'emailed',
         version = version + 1
   where id = v_send.lead_id and tenant_id = v_send.tenant_id and erased_at is null and blanked_at is null;
  v_moved := found;
  if v_moved then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_send.tenant_id, 'lead.emailed', 'lead', 'lead', v_send.lead_id,
            jsonb_build_object('by', 'reach_out', 'send_id', v_send.id));
  end if;

  return jsonb_build_object('said', true, 'state', 'sent', 'message_id', p_message_id, 'contact_id', v_contact,
                            'conversation_id', v_conv);
end $$;
revoke execute on function public.reach_out_send_said(uuid, text, uuid, text) from public, anon;
grant execute on function public.reach_out_send_said(uuid, text, uuid, text) to authenticated, service_role;
comment on function public.reach_out_send_said(uuid, text, uuid, text) is
  'The owner''s word on an email handed to them (00428), an acting member''s: not_sent skips it (owner_skipped, or p_reason: the door''s refusal the server read); sent writes, in one transaction, the person (reach_out_person, whose refusal skips it), the email as sent under p_message_id (core sendMessageId), the send sent with its said_at and said_by, and the lead written to (lead.emailed). A send no longer drafted answers {said: false, state}.';

/* ------------------------------------------------------------------- 6. what they wrote back, said by the owner -- */

alter table public.reach_out_replies
  add column if not exists said_by uuid references auth.users (id) on delete set null;
alter table public.reach_out_replies drop constraint if exists reach_out_replies_claim_check;
alter table public.reach_out_replies add constraint reach_out_replies_claim_check
  check (claim in ('person', 'automated', 'auto_reply', 'owner')) not valid;
alter table public.reach_out_replies validate constraint reach_out_replies_claim_check;
alter table public.reach_out_replies drop constraint if exists reach_out_replies_said_by_owner;
alter table public.reach_out_replies add constraint reach_out_replies_said_by_owner check (said_by is null or claim = 'owner');
comment on column public.reach_out_replies.said_by is
  'For a reading its owner gave (claim owner, 00428): the member who said what the business wrote back. Its message_id is the note that says so on the person''s thread (reach_out_reply_said).';

-- 00413's reading door, given p_said ({send_id, by}): whose reply it is comes from that send, not from a received
-- email, the row is the owner's word (claim owner, said_by), and it is never a re-read. The lead's drafts waiting for
-- their owner are skipped with its waiting sends, for every reading.
drop function if exists public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int);
create or replace function public.reach_out_reply_apply(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_reading    jsonb,
  p_plan       jsonb,
  p_reread     int,
  p_days       int,
  p_said       jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_of       jsonb;
  v_intent   text := p_reading->>'intent';
  v_unread   text := nullif(p_reading->>'unread', '');
  v_summary  text := nullif(btrim(coalesce(p_reading->>'summary', '')), '');
  v_day      date;
  v_refer    text := nullif(btrim(coalesce(p_reading->>'refer_to', '')), '');
  v_until    timestamptz := nullif(p_plan->>'awayUntil', '')::timestamptz;
  v_tell     boolean := coalesce((p_plan->>'tell')::boolean, false);
  v_reread   int := coalesce(p_reread, 0);
  v_row      public.reach_out_replies%rowtype;
  v_lead     uuid;
  v_person   uuid;
  v_changed  jsonb := '{}'::jsonb;
  v_before   public.contacts%rowtype;
  v_leads    jsonb;
  v_address  text;
  v_domain   text;
  v_skipped  int := 0;
  v_step     jsonb;
  v_consent  jsonb;
  v_hold     record;
  v_holds    jsonb := '[]'::jsonb;
  v_owed     boolean := false;
  -- Who wrote it, whether it cites our email, and who signed it (0052).
  v_writer   uuid;
  v_cited    boolean;
  v_signer   text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'name', ''), '\s+', ' ', 'g')), ''), 80);
  v_title    text := left(nullif(btrim(regexp_replace(coalesce(p_reading->'signer'->>'title', ''), '\s+', ' ', 'g')), ''), 80);
  v_linked   boolean := false;
  v_said_by  uuid := nullif(p_said->>'by', '')::uuid;
begin
  if v_intent is null or v_intent not in ('interested', 'question', 'not_now', 'no', 'wrong_person', 'away', 'other') then
    raise exception 'a reading names one of the seven intents' using errcode = '22023';
  end if;
  if v_unread is not null and (v_intent <> 'other' or v_unread not in ('no_model', 'may_not_spend', 'day_spent', 'model_failed')) then
    raise exception 'a reply that was not read is other, and says why' using errcode = '22023';
  end if;
  if v_reread < 0 or v_reread > 3 then
    raise exception 'a reply is read again at most three times' using errcode = '22023';
  end if;
  v_day := case when coalesce(p_reading->>'day', '') ~ '^\d{4}-\d{2}-\d{2}$' then (p_reading->>'day')::date end;

  if p_said is not null then
    -- The owner's word: a person's, never an automatic reply's, never read again, signed by nobody.
    if v_reread <> 0 or v_unread is not null or v_intent in ('away', 'other') or v_said_by is null then
      raise exception 'an owner tells one of the five intents, once' using errcode = '22023';
    end if;
    v_signer := null;
    v_title := null;
    select jsonb_build_object(
             'send_id', s.id,
             'cited', false,
             'lead_id', l.id,
             'lead_contact_id', l.contact_id,
             'lead_email', lower(btrim(l.email)),
             'answered_message_id', s.message_id,
             'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->'to'->>0,
                                                 o.meta->'email'->>'to'))),
             'business', l.business_name,
             'conversation_id', o.conversation_id,
             'contact_id', coalesce(l.contact_id, s.contact_id),
             'claim', 'owner')
      into v_of
      from public.reach_out_sends s
      join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
      join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
     where s.id = nullif(p_said->>'send_id', '')::uuid and s.tenant_id = p_tenant_id and s.state = 'sent';
  else
    v_of := public.reach_out_reply_of(p_tenant_id, p_message_id, p_days);
  end if;
  if v_of is null then
    return jsonb_build_object('applied', false, 'why', 'not_a_reply');
  end if;
  v_lead   := (v_of->>'lead_id')::uuid;
  v_person := (v_of->>'lead_contact_id')::uuid;
  v_writer := (v_of->>'contact_id')::uuid;
  v_cited  := coalesce((v_of->>'cited')::boolean, false);
  -- A reply that cites our email from another address at the business links its writer to the lead (0052, 1b below);
  -- what the reading records (a no, a step, the leads it closes) stays the lead's own person's, as before. A reply that
  -- cites nothing links nobody: nothing is inferred from a domain.
  -- An out-of-office's pause is an automatic reply's alone (the table's CHECK says so too).
  if v_intent <> 'away' or v_of->>'claim' <> 'auto_reply' then
    v_until := null;
  end if;

  -- The lead's person first, before anything takes a lighter lock on them (the row's own keys do): the consent door,
  -- another reading of theirs and the undo all lock them, so two of these never wait on each other in a circle.
  if v_person is not null then
    perform 1 from public.contacts where id = v_person and tenant_id = p_tenant_id for update;
  end if;

  -- 1. The row: once.
  if v_reread = 0 then
    insert into public.reach_out_replies (message_id, tenant_id, conversation_id, contact_id, lead_id, lead_contact_id,
                                          send_id, answered_message_id, claim, intent, summary, named_day, refer_to,
                                          unread, until_at, plan, said_by)
    values (p_message_id, p_tenant_id, (v_of->>'conversation_id')::uuid, (v_of->>'contact_id')::uuid, v_lead, v_person,
            (v_of->>'send_id')::uuid, (v_of->>'answered_message_id')::uuid, v_of->>'claim', v_intent,
            left(v_summary, 160), v_day, left(v_refer, 120), v_unread, v_until, coalesce(p_plan, '{}'::jsonb), v_said_by)
    on conflict (message_id) do nothing
    returning * into v_row;
    if v_row.message_id is null then
      return jsonb_build_object('applied', false);
    end if;
  else
    -- A re-read, by compare-and-set: still unread, not undone, and at the re-read before this one.
    select * into v_row from public.reach_out_replies r
     where r.message_id = p_message_id and r.tenant_id = p_tenant_id
     for update;
    if v_row.message_id is null or v_row.unread is null or v_row.undone_at is not null
       or v_row.rereads <> v_reread - 1 then
      return jsonb_build_object('applied', false);
    end if;
    -- Due a notice when the plan tells (news: told once more, the claim taken back), and still due one, in this
    -- reading's words, when the reading before it was owed one the owner was never given (its mail failed). An owed
    -- notice keeps its claim: a run still telling it marks it told, and this stage then has nothing to tell.
    v_owed := coalesce((v_row.plan->>'tell')::boolean, false) and v_row.told_at is null;
    update public.reach_out_replies r
       set intent = v_intent, summary = left(v_summary, 160), named_day = v_day, refer_to = left(v_refer, 120),
           unread = v_unread, until_at = v_until, plan = coalesce(p_plan, '{}'::jsonb),
           rereads = v_reread, reread_at = now(),
           read_at = case when v_unread is null then now() else r.read_at end,
           tell_claimed_at = case when v_tell then null else r.tell_claimed_at end,
           told_at = case when v_tell then null else r.told_at end
     where r.message_id = p_message_id
    returning * into v_row;
    v_tell := v_tell or v_owed;
  end if;

  -- 1b. The writer of a reply that cites our email is at the lead's business (0052): linked, unless a member settled
  -- where they work. Once, on the first reading.
  if v_reread = 0 and v_cited and v_writer is not null and v_writer is distinct from v_person then
    update public.contacts c
       set lead_id = v_lead, updated_at = now()
     where c.id = v_writer and c.tenant_id = p_tenant_id and c.erased_at is null
       and c.lead_id is null and c.lead_settled_at is null;
    v_linked := found;
    if v_linked then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.business_linked', 'contact', 'contact', v_writer,
              jsonb_build_object('lead_id', v_lead, 'via', 'reply', 'message_id', p_message_id));
      v_changed := v_changed || jsonb_build_object('linked', v_writer);
    end if;
  end if;

  -- 1c. The signer, the writer's: kept on the row, offered to the owner (the notice) or taken when the plan says so
  -- (automatic naming, switched off until its evals pass). Only a first reading or a re-read that finally read the reply
  -- has one.
  if v_signer is not null and v_row.signer_name is null then
    update public.reach_out_replies
       set signer_name = v_signer, signer_title = v_title, signer_state = 'offered',
           signer_was = (select case when c.display_name is null then 'none' else c.name_source end
                           from public.contacts c where c.id = v_writer)
     where message_id = p_message_id;
    if coalesce((p_plan->>'adoptSigner')::boolean, false) and v_writer is not null then
      v_changed := v_changed || jsonb_build_object('named',
        public.person_name_take(p_tenant_id, v_writer, p_message_id, null, 'auto')->'named');
    end if;
  end if;

  -- 2. The lead's sends still waiting in live runs, and its drafts waiting for their owner: the door would refuse each
  -- (wrote back), so none waits for an owner.
  if p_plan->>'skipSends' = 'outreach_wrote_back' then
    with skipped as (
      update public.reach_out_sends s
         set state = 'skipped', reason = 'outreach_wrote_back'
        from public.broadcasts b
       where b.id = s.broadcast_id and b.tenant_id = s.tenant_id
         and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = p_tenant_id and s.lead_id = v_lead and s.state in ('planned', 'held', 'drafted')
      returning 1
    )
    select count(*)::int into v_skipped from skipped;
    v_changed := v_changed || jsonb_build_object('skipped', v_skipped);
  end if;

  -- 3. Talking.
  if coalesce((p_plan->>'convert')::boolean, false) then
    v_changed := v_changed || jsonb_build_object('converted',
      public.lead_convert_by(p_tenant_id, v_lead, 'reply', jsonb_build_object('message_id', p_message_id), false)->'moved');
  end if;

  -- 4. The day they named.
  if nullif(p_plan->>'resumeAt', '') is not null then
    update public.leads set resume_at = (p_plan->>'resumeAt')::timestamptz
     where id = v_lead and tenant_id = p_tenant_id and erased_at is null and blanked_at is null;
  end if;

  -- 5. Said no: the one consent door, then every address the no stands behind and the business's own domain (N6) on
  -- the never-again list. What the undo needs is recorded: the consent it found and whether this no is the one that
  -- changed it (and the email its event names); every row the no stands behind, written now or there before (holds);
  -- the rows this transaction wrote (suppressions: their created_at is its now()); each lead it closed, with its stage
  -- before and the version it was left at. Each held row is written, or locked where it stands, until this commits,
  -- so an undo of another no that also holds it waits, and then sees this one.
  if coalesce((p_plan->>'saidNo')::boolean, false) and v_person is not null then
    select * into v_before from public.contacts where id = v_person and tenant_id = p_tenant_id;
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', l.stage)), '[]'::jsonb) into v_leads
      from public.leads l
     where l.tenant_id = p_tenant_id and l.contact_id = v_person
       and l.stage in ('ready', 'nurture') and l.erased_at is null and l.blanked_at is null;
    v_consent := public.set_email_marketing(p_tenant_id, v_person, 'opted_out', 'reply',
                                            (v_of->>'answered_message_id')::uuid,
                                            jsonb_build_object('reading', p_message_id));
    v_address := lower(btrim(coalesce(p_plan->>'suppressFrom', '')));
    v_domain := lower(btrim(coalesce(p_plan->>'suppressDomain', '')));
    -- The person's address and the one the email went to (the consent door's own two), the lead's, the reply's From;
    -- and the domain. In one order, so two noes that share a row never wait on each other in a circle.
    for v_hold in
      select distinct h.kind, h.hash from (
        select 'email' as kind, public.lead_suppression_hash(p_tenant_id, a) as hash
          from unnest(array[lower(btrim(v_before.email)), lower(btrim(v_of->>'answered_to')),
                            lower(btrim(v_of->>'lead_email')), v_address]) as a
         where a like '%@%'
        union all
        select 'domain', public.lead_suppression_hash(p_tenant_id, v_domain)
         where v_domain <> '' and v_domain not like '%@%'
      ) h
      order by h.kind, h.hash
    loop
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (p_tenant_id, v_hold.kind, v_hold.hash, 'said_no')
      on conflict (tenant_id, kind, hash) do update set what = lead_suppressions.what;
      v_holds := v_holds || jsonb_build_array(jsonb_build_object('kind', v_hold.kind, 'hash', v_hold.hash));
    end loop;
    v_changed := v_changed || jsonb_build_object(
      'consent_was', v_before.email_marketing,
      'consent_source_was', v_before.email_marketing_source,
      'consent_changed', coalesce((v_consent->>'changed')::boolean, false),
      'consent_named', case when coalesce((v_consent->>'changed')::boolean, false)
                            then v_of->>'answered_message_id' end,
      'holds', v_holds,
      -- Only a row a reading wrote is ever the undo's to delete, never an unsubscribe's, a customer's or an erasure's.
      'suppressions', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'hash', x.hash) order by x.kind, x.hash), '[]'::jsonb)
          from public.lead_suppressions x
         where x.tenant_id = p_tenant_id and x.what = 'said_no' and x.kind in ('email', 'domain')
           and x.created_at = now()),
      'leads', (
        select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'stage', b->>'stage', 'version', l.version)), '[]'::jsonb)
          from jsonb_array_elements(v_leads) b
          join public.leads l on l.id = (b->>'id')::uuid and l.tenant_id = p_tenant_id
         where l.stage = 'archived' and l.closed_reason = 'said_no'));
  end if;

  -- 6. A dated step on the lead's person, once per message.
  if jsonb_typeof(p_plan->'step') = 'object' and v_person is not null then
    v_step := public.person_step_from_playbook(p_tenant_id, v_person, (p_plan->'step'->>'dueOn')::date,
                                               p_plan->'step'->>'words', null, p_message_id);
    v_changed := v_changed || jsonb_build_object('step', coalesce(v_step->'note'->>'id', v_step->>'error'));
  end if;

  update public.reach_out_replies
     set plan = coalesce(p_plan, '{}'::jsonb) || jsonb_build_object('tell', v_tell, 'changed', v_changed)
   where message_id = p_message_id;

  -- 7. What happened, on the lead.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'reach_out.replied', 'lead', 'lead', v_lead,
          jsonb_build_object('intent', v_intent, 'message_id', p_message_id, 'lead_id', v_lead,
                             'claim', v_of->>'claim', 'reread', v_reread > 0, 'unread', v_unread,
                             'business', v_of->>'business'));

  return jsonb_build_object('applied', true, 'intent', v_intent, 'unread', v_unread, 'changed', v_changed);
end $$;

revoke execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int, jsonb) to service_role;
comment on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int, jsonb) is
  'A reply''s reading and its plan (contracts readingPlan), applied once in one transaction (Reach out Part 5, G6-G11): the lead''s waiting sends and drafts skipped (wrote back), Talking through lead_convert_by, resume_at, a no through set_email_marketing (reply) with the reply''s From and the business''s own domain on the never-again list, a dated step, and reach_out.replied. A reply that cites our email from another address at the business links its writer to the lead (0052); its no, its step and the leads it closes stay the lead''s own person''s. The signer the reading found is its writer''s: kept on the row and offered (the notice), or taken for the writer when the plan says adoptSigner (automatic naming). A re-read applies by compare-and-set on the row still unread. Given p_said ({send_id, by}, 00428) it is what the owner said the business wrote back about that sent email: claim owner, said_by, never re-read. Records what it changed for the undo. Answers {applied}. Service role only.';

-- What the business wrote back, as its owner tells it on the lead (00428), an acting member's: about the lead's latest
-- email that went, read as a person's reply through the one door (reach_out_reply_apply with p_said), with the plan the
-- server made of it (contracts readingPlan, claim owner). The owner's word is written on the person's email thread as a
-- note in their words (p_note, contracts REACH_OUT_SAID_WORDS.note), and the reading is keyed to it, as a reading is to
-- the email it read (reach_out_replies_message_id_same_workspace).
drop function if exists public.reach_out_reply_said(uuid, jsonb, jsonb);
create or replace function public.reach_out_reply_said(p_lead_id uuid, p_reading jsonb, p_plan jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_tenant  uuid;
  v_send    uuid;
  v_conv    uuid;
  v_contact uuid;
  v_id      uuid := gen_random_uuid();
  v_out     jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select l.tenant_id into v_tenant from public.leads l
   where l.id = p_lead_id and l.erased_at is null and l.blanked_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select s.id, m.conversation_id, coalesce(s.contact_id, m.contact_id) into v_send, v_conv, v_contact
    from public.reach_out_sends s
    join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
   where s.tenant_id = v_tenant and s.lead_id = p_lead_id and s.state = 'sent'
   order by s.sent_at desc
   limit 1;
  if v_send is null then
    raise exception 'Nothing has been sent to them yet.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'The owner''s word is written on the thread.' using errcode = '22023';
  end if;
  insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                               status, meta)
  values (v_id, v_tenant, v_conv, v_contact, 'email', 'outbound', 'human', 'note', left(btrim(p_note), 500), 'sent',
          jsonb_build_object('source', 'reach_out', 'said_by', v_user,
                             'reach_out', jsonb_build_object('send_id', v_send, 'lead_id', p_lead_id)));
  v_out := public.reach_out_reply_apply(v_tenant, v_id, p_reading, p_plan, 0, 0,
                                        jsonb_build_object('send_id', v_send, 'by', v_user));
  return v_out || jsonb_build_object('message_id', v_id, 'send_id', v_send);
end $$;
revoke execute on function public.reach_out_reply_said(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.reach_out_reply_said(uuid, jsonb, jsonb, text) to authenticated, service_role;
comment on function public.reach_out_reply_said(uuid, jsonb, jsonb, text) is
  'What the business wrote back, as its owner tells it on the lead (00428), an acting member''s: a note in their words on the person''s email thread, and the reading and its plan (claim owner) applied through reach_out_reply_apply about the lead''s latest email that went, keyed to that note; refused when nothing has gone. Answers the door''s {applied, intent, changed} with the note''s id (message_id) and the send.';

/* --------------------------------------------------- 7. a draft goes where a planned or held send goes -- */

-- 00241's stop: the lead's drafts are skipped too.
create or replace function public.reach_out_lead_stop(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_lead    public.leads%rowtype;
  v_skipped int;
  v_leaving int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is first, and only then the lock: a stranger never holds another workspace's lead row.
  select l.tenant_id into v_tenant from public.leads l where l.id = p_lead_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and tenant_id = v_tenant for update;
  if not found or v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.reach_out_sends s where s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id) then
    raise exception 'Nothing has been written to them yet.' using errcode = '22023';
  end if;
  if v_lead.reach_out_stopped_at is not null then
    return jsonb_build_object('stopped', false, 'already', true, 'skipped', 0, 'leaving', 0);
  end if;
  update public.leads set reach_out_stopped_at = now() where id = p_lead_id;
  with skipped as (
    update public.reach_out_sends s
       set state = 'skipped', reason = 'owner_stopped'
      from public.broadcasts b
     where b.id = s.broadcast_id and b.state in ('pending_approval', 'scheduled', 'sending')
       and s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('planned', 'held', 'drafted')
    returning 1
  )
  select count(*) into v_skipped from skipped;
  select count(*) into v_leaving from public.reach_out_sends s
   where s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('claimed', 'queued');
  return jsonb_build_object('stopped', true, 'already', false, 'skipped', v_skipped, 'leaving', v_leaving);
end $$;
revoke execute on function public.reach_out_lead_stop(uuid) from public, anon;
grant execute on function public.reach_out_lead_stop(uuid) to authenticated, service_role;
comment on function public.reach_out_lead_stop(uuid) is
  '"Stop writing to them" (Reach out Part 6, H10), an acting member''s door: stamps leads.reach_out_stopped_at and skips the lead''s planned, held and drafted (00428) sends in live runs (owner_stopped). Answers {stopped, already, skipped, leaving}: leaving counts the claimed and queued emails, which the send door refuses by the stamp. Refused for a lead no chain ever planned (22023) or one the caller may not act on (P0002).';

-- 00426's leave: a draft for the lead, not sent yet, is taken back with its planned and held sends.
create or replace function public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  r         public.playbooks;
  q         public.lead_searches;
  m         public.lead_search_members;
  v_skipped integer;
  v_op      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.playbooks where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into q from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or q.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A search's reach-out writes to what its search holds: a lead is left out of it on Leads, never here.
  if q.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', q.id);
  end if;
  -- The add's own lock: an add and a leave of one lead meet here, never both at once.
  perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || p_lead_id::text));
  select * into m from public.lead_search_members
   where search_id = q.id and lead_id = p_lead_id and blanked_at is null
     for update;
  if not found then
    return jsonb_build_object('error', 'not_on_it');
  end if;
  -- What left, or is leaving, stays: Stop writing is the true correction there.
  if exists (select 1 from public.reach_out_sends s
              where s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued')) then
    return jsonb_build_object('error', 'on_its_way');
  end if;
  if exists (select 1 from public.reach_out_sends s
              where s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id
                and s.state in ('sent', 'handed', 'failed')) then
    return jsonb_build_object('error', 'sent');
  end if;
  -- Planned, held or drafted (not sent yet) in a run still live: skipped as taken back, which its undo's next run plans
  -- again.
  update public.reach_out_sends s
     set state = 'skipped', reason = 'owner_took_back'
    from public.broadcasts b
   where b.id = s.broadcast_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = r.tenant_id and s.root_id = r.id and s.lead_id = p_lead_id
     and s.state in ('planned', 'held', 'drafted');
  get diagnostics v_skipped = row_count;
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'leave', q.id, array[p_lead_id], jsonb_build_object('skipped', v_skipped),
          jsonb_build_object('root_id', r.id), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', q.id, 'n', 1, 'by', v_user, 'left_out', true));
  return jsonb_build_object('ok', true, 'op_id', v_op, 'version', m.version, 'skipped', v_skipped);
end $$;

revoke execute on function public.reach_out_leave_out(uuid, uuid) from public, anon;
grant execute on function public.reach_out_leave_out(uuid, uuid) to authenticated, service_role;

comment on function public.reach_out_leave_out(uuid, uuid) is
  'Leave out (00426), the drawer''s door on a lead waiting in a reach-out fed by a list: off its list (blanked), a send planned, held or drafted (00428) for it in a live run skipped as taken back, with an operation of kind leave whose undo (lead_undo, its maker''s or find''s) puts it back; one on its way or sent stays (on_its_way, sent: Stop writing is the correction there). An operator''s, as the add is.';

-- 00424's save: the chain says who sends it (owner_sends, its root's), and a dropped step's drafts go with its planned
-- and held sends.
CREATE OR REPLACE FUNCTION public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.playbooks
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.playbooks where id = v_root
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.reach_out_sends s where s.playbook_id = any (v_dropped) for update;
    if exists (select 1 from public.reach_out_sends s
                where s.playbook_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed')) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.broadcasts set state = 'canceled'
     where tenant_id = p_tenant_id and playbook_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.reach_out_sends set state = 'skipped', reason = 'step_removed'
     where playbook_id = any (v_dropped) and state in ('planned', 'held', 'drafted');
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.playbooks p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_playbook_id cascades).
    delete from public.playbooks where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.playbooks (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_playbook_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.playbooks where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.reach_out_sends s where s.playbook_id = v_id) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.playbooks
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.playbooks
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.playbooks set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.playbooks
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes, domain_ids = '{}',
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.playbook_id = any (v_changed) and s.state in ('planned', 'held')),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

/* ---------------------------------------------------------- 8. a lead's drafts, on its line and on the strip -- */

-- 00426's lines: drafted, how many of the lead's emails wait for their owner to send them in a run that goes ahead.
create or replace function public.reach_out_root_lines(p_tenant_id uuid, p_root_id uuid)
returns table(lead_id uuid, line jsonb, ord timestamptz, done boolean)
language sql
stable
security definer
set search_path = public
as $$
  with sends as (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    select s.id, s.lead_id, s.state, s.reason, s.send_at,
           case when s.state = 'sent' then s.sent_at
                when s.state = 'failed' and public.email_left(m.status, m.error)
                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
           coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
           b.state in ('pending_approval', 'scheduled', 'sending') as live
      from public.reach_out_sends s
      join public.broadcasts b on b.id = s.broadcast_id
      left join public.messages m on m.id = s.message_id
     where s.tenant_id = p_tenant_id and s.root_id = p_root_id
       -- A send of a run its owner skipped, or one taken back, never happened as far as the lead's line is concerned.
       and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back'))
  ),
  per as (
    select x.lead_id,
           count(*) filter (where x.left_at is not null) as sent,
           min(x.left_at) as first_sent_at,
           max(x.left_at) as last_sent_at,
           min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
           bool_or(x.state = 'held' and x.live) as held,
           bool_or(x.state = 'handed') as handed,
           count(*) filter (where x.state = 'drafted' and x.live) as drafted,
           bool_or(x.bounced and x.left_at is not null) as bounced,
           max(x.left_at) filter (where x.bounced) as bounced_at,
           max(x.left_at) as ord
      from sends x
     group by x.lead_id
  ),
  per_lead as (
    select p.lead_id, p.sent, p.first_sent_at, p.last_sent_at, p.next_at, p.held, p.handed, p.drafted, p.bounced,
           p.bounced_at, p.ord, null::timestamptz as added_at
      from per p
    union all
    -- A list-fed reach-out's leads not written yet: on its list, with when each was added (00426).
    select m.lead_id, 0, null, null, null, false, false, 0, false, null, null, m.created_at
      from public.playbooks r
      join public.lead_searches q on q.id = r.lead_search_id and q.via in ('chosen', 'import') and q.removed_at is null
      join public.lead_search_members m on m.search_id = q.id and m.blanked_at is null and m.class = 'qualified' and m.counted
     where r.id = p_root_id and r.tenant_id = p_tenant_id
       and not exists (select 1 from per p where p.lead_id = m.lead_id)
  ),
  facts as (
    select x.*, l.business_name, l.stage, l.closed_reason, l.email_state, l.resume_at, l.booked_at, l.reach_out_stopped_at,
           -- Won: a deal that names the lead, won (decided); the first such, a count and never an amount.
           (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
             where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won_at,
           (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at, 'undone', r.undone_at is not null)
              from public.reach_out_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id
             order by r.read_at desc
             limit 1) as reply,
           (select max(r.until_at) from public.reach_out_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id and r.intent = 'away'
               and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null) as away_until
      from per_lead x
      join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
  )
  select f.lead_id,
         jsonb_build_object(
           'lead_id', f.lead_id,
           'business_name', f.business_name,
           'stage', f.stage,
           'closed_reason', f.closed_reason,
           'sent', f.sent,
           'first_sent_at', f.first_sent_at,
           'last_sent_at', f.last_sent_at,
           'next_at', f.next_at,
           'held', coalesce(f.held, false),
           'handed', coalesce(f.handed, false),
           'drafted', coalesce(f.drafted, 0),
           'bounced', coalesce(f.bounced, false),
           'bounced_at', f.bounced_at,
           'email_state', f.email_state,
           'reply', f.reply,
           'away_until', f.away_until,
           'resume_at', f.resume_at,
           'booked_at', f.booked_at,
           'won_at', f.won_at,
           'stopped_at', f.reach_out_stopped_at,
           'added_at', f.added_at),
         coalesce(f.ord, f.added_at),
         -- Done: booked, stopped, bounced, said no, closed, or a person answered (an automatic reply only pauses). Each
         -- test is said so it is never null: a lead with no closed reason and no reply is not done, never unknown.
         (f.booked_at is not null or f.reach_out_stopped_at is not null or coalesce(f.bounced, false)
          or f.closed_reason is not distinct from 'said_no' or f.stage not in ('ready', 'nurture')
          or (f.reply is not null and not coalesce((f.reply->>'undone')::boolean, false)
              and f.reply->>'claim' is distinct from 'auto_reply'))
    from facts f
$$;

revoke execute on function public.reach_out_root_lines(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_root_lines(uuid, uuid) to service_role;

comment on function public.reach_out_root_lines(uuid, uuid) is
  'One reach-out''s lines, one per lead (00426): every lead it has a send for (a canceled run''s and a taken-back send aside) and, for a list-fed one, each lead on its list not written yet with added_at. The line''s facts are 00241''s plus business_name, added_at and drafted (00428: how many of its emails wait in a live run for their owner to send them); ord is when it last left (else when it was added); done is booked, stopped, bounced, said no, no longer Ready or Contacted, or a person answered. reach_out_search_lines and reach_out_chain_people read it. Service role only.';

-- 00426's strip: to_send, the chain's emails waiting for their owner to send them.
create or replace function public.reach_out_search_lines(p_tenant_id uuid, p_search_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root     public.playbooks%rowtype;
  v_via      text;
  v_tz       text;
  v_midnight timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_root from public.playbooks p
   where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
     and p.lead_search_id = p_search_id
   order by p.created_at desc
   limit 1;
  if not found then
    return null;
  end if;
  select q.via into v_via from public.lead_searches q where q.id = p_search_id;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_midnight := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  return (
    with sends as (
      select s.id, s.lead_id, s.state, s.send_at, s.checked_at, s.mailbox_id,
             case when s.state = 'sent' then s.sent_at
                  when s.state = 'failed' and public.email_left(m.status, m.error)
                    then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
             b.state in ('pending_approval', 'scheduled', 'sending') as live
        from public.reach_out_sends s
        join public.broadcasts b on b.id = s.broadcast_id
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id and s.root_id = v_root.id
    ),
    rl as (
      select * from public.reach_out_root_lines(p_tenant_id, v_root.id)
    )
    select jsonb_build_object(
      'chain', jsonb_build_object('root_id', v_root.id, 'name', v_root.name, 'state', v_root.state),
      'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
      'owner_sends', v_root.owner_sends,
      'written_to', (select count(*) from rl where (rl.line->>'sent')::int > 0),
      'today', (select count(*) from sends where left_at >= v_midnight),
      'next', (select jsonb_build_object('at', x.send_at, 'business', l.business_name, 'host', b.host, 'from', b.address)
                 from sends x
                 join public.leads l on l.id = x.lead_id
                 left join public.mailbox_connections b on b.id = x.mailbox_id
                where x.state = 'planned' and x.live and x.checked_at is not null
                order by x.send_at
                limit 1),
      'held', (select count(*) from sends where state = 'held' and live),
      'to_send', (select count(*) from sends where state = 'drafted' and live),
      'waiting_run_id', (select b.id from public.broadcasts b
                          where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                            and b.audience->>'root_id' = v_root.id::text and b.state = 'pending_approval'
                          order by b.created_at desc
                          limit 1),
      'leads', coalesce((
        select jsonb_agg(x.line order by x.ord desc nulls first, x.lead_id)
          from (select * from rl order by rl.ord desc nulls first, rl.lead_id limit 2000) x), '[]'::jsonb)
    )
  );
end $$;

revoke execute on function public.reach_out_search_lines(uuid, uuid) from public, anon;
grant execute on function public.reach_out_search_lines(uuid, uuid) to authenticated, service_role;

comment on function public.reach_out_search_lines(uuid, uuid) is
  'Leads while it writes (Reach out Part 6, H8), for a member: an open search''s chain, or null when it has none. chain {root_id, name, state}, fed_by (list or search, 00426), owner_sends (00428), written_to, today (emails that left since the workspace''s midnight), next {at, business, host} (the earliest planned and checked email of a live run), held, to_send (drafts waiting for their owner in live runs, 00428), waiting_run_id, and leads: at most 2,000 lines from reach_out_root_lines, one per lead the chain has a send for and, for a list-fed one, each lead on its list not written yet.';

/* ------------------------------------------------------------------------------- a lead blanked takes its drafts -- */

-- 00413's lead_blank: a draft names the business and its address, so it goes with the lead's record.
create or replace function public.lead_blank(p_lead_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n      integer;
  v_tenant uuid;
begin
  -- Kept: id, tenant_id, stage, closed_reason, contact_id, converted_at,
  -- contacted_at, exported_at, found_at, erased_at, the counts on its
  -- memberships. Everything that names the place, reaches it or came off its
  -- site goes, and its place id with it, so the place found again is new.
  update public.leads
     set place_id = null, business_name = '', category = null, street = null, city = null, region = null, postal_code = null,
         lat = null, lng = null, website_host = null, instagram_url = null, phone_e164 = null, phone_sources = 0,
         email = null, email_alternates = '[]'::jsonb, email_state = 'none', email_checked_at = null, rating = null, reviews = null,
         last_outcome = null, last_note = null, blanked_at = coalesce(blanked_at, now()),
         -- What the listing showed about the business goes with the rest (D2).
         about = null, hours = '[]'::jsonb, image_url = null, price = null, reviews_dist = null,
         facebook_url = null, linkedin_url = null, tiktok_url = null, claimed = null, maps_url = null, rank = null, neighborhood = null, logo_url = null, mark_path = null
   where id = p_lead_id
  returning tenant_id into v_tenant;
  get diagnostics v_n = row_count;
  delete from public.lead_places where lead_id = p_lead_id;
  update public.lead_search_members
     set judgment = '{}'::jsonb, reason = '', blanked_at = coalesce(blanked_at, now())
   where lead_id = p_lead_id;
  -- What a reach-out wrote from the lead's record, and the checker's note on it (00391). The send keeps its state, its
  -- reason and the digest of the words it checked.
  update public.reach_out_sends
     set opening = null, angle = null, hold_detail = null
   where tenant_id = v_tenant and lead_id = p_lead_id
     and (opening is not null or angle is not null or hold_detail is not null);
  -- A draft handed to its owner names them and their address (00428): one still waiting to be sent is skipped as its
  -- lead gone, and every draft of theirs is cleared. The email they sent is a message, and goes as messages go.
  update public.reach_out_sends
     set state = case when state = 'drafted' then 'skipped' else state end,
         reason = case when state = 'drafted' then 'lead_gone' else reason end,
         draft = null
   where tenant_id = v_tenant and lead_id = p_lead_id and draft is not null;
  -- A person still named for the business (a stand-in, 0052) keeps nothing of it: the name goes with the place, and
  -- their address or number is what names them again.
  update public.contacts
     set display_name = null, name_source = null, updated_at = now()
   where tenant_id = v_tenant and lead_id = p_lead_id and name_source = 'lead';
  -- A preference's example copied from this lead (00391).
  update public.lead_preferences
     set example = null
   where tenant_id = v_tenant and from_lead_id = p_lead_id and example is not null;
  return v_n;
end $$;

revoke execute on function public.lead_blank(uuid) from public, anon, authenticated;
comment on function public.lead_blank(uuid) is
  'Removes everything that names or reaches a place, and its memberships'' judgments, a reach-out''s opening, angle and note written from it, and a preference''s example copied from it (00391), and a reach-out''s drafts, one still waiting skipped as its lead gone (00428), keeping the stage, the link to a person and the counts. The one function retention and erasure blank through.';

/* ------------------------------------------------------------------------------------ Reports: your own inbox -- */

-- 00426's report: the emails their owners sent from their own inbox are a row of their own in mailboxes (`yours`), apart
-- from the ones before 00424 that left from no mailbox either.
CREATE OR REPLACE FUNCTION public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00404): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00404): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.mailbox_id,
             -- Sent from its owner's own inbox, on their word (00428): from no mailbox, as an email from before 00424 is.
             s.said_at is not null as yours,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop
       group by s.root_id, s.playbook_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at,
             -- Won (00426): a deal that names the lead, won. A count of businesses, never an amount.
             exists (select 1 from public.deals d
                      where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.reach_out_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             ls.won,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle) as businesses,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    mailboxes as (
      select x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at, count(*) as sent,
             count(*) filter (where x.status in ('sent', 'delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.mailbox_connections b on b.id = x.mailbox_id and b.tenant_id = p_tenant_id
       group by x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('sent', 'delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'won', (select count(*) from answers where won),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00404).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('sent', 'delivered', 'read')),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.broadcasts b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.playbooks p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('sent', 'delivered', 'read')),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'won', (select count(*) from answers a where a.playbook_id = c.id and a.won),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.playbooks p on p.id = c.id)) as body
              from public.playbooks r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      -- An edge or a page from before mailboxes reads `domains`: none now (decision 0056).
      'domains', '[]'::jsonb,
      'mailboxes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'address', d.address, 'yours', d.yours, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.address)
          from (select * from mailboxes order by sent desc, address limit 10) d), '[]'::jsonb))
  );
end $$;

revoke execute on function public.reach_out_report(uuid, integer, date) from public, anon;
grant execute on function public.reach_out_report(uuid, integer, date) to authenticated, service_role;

comment on function public.reach_out_report(uuid, integer, date) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over p_days days (1 to 90; any other is refused) to the window''s last day in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, before (written, delivered and bounced over the same count of days before the window, 00404: outcomes are state now, so they have no period before), series (written per day), chains (at most 20, each with its steps; reach_out_chain_totals counts every chain over the same window, 00375), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Emails are written, delivered and bounced; businesses are the leads written to, each once per chain at its last email of the period, and every outcome (wrote back, interested, booked, won, said no) is a count of them, so it is never more than `businesses`, on the totals, on a step (the businesses whose last email was that step), on an angle (the ones whose last email had it) and past the top 8 (00404); wrote back is outreach_wrote_back; won (00426) is a deal naming the lead, won, a count and never an amount. mailboxes (00428) names the emails their owners sent from their own inbox apart (`yours`), from no mailbox, as an email from before 00424 is. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';
