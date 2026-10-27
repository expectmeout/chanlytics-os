-- 00486 · An Instagram DM is a message the business answers (decision 0001, step 8).
--
-- A business connects its Instagram professional account (the Instagram API with Instagram Login); a person's DM comes
-- in on Meta's webhook, is kept as a message of its own wire, and is answered from the account. What the database is
-- asked for, each where the wire was refused or left out:
--
--   messages.channel             Takes 'instagram' (00002 never let it). contact_identities.channel and tenant_channels.kind
--                                have taken it since 00002, and conversation_channel_state since 00484.
--   contacts.acquired_via        Takes 'instagram': a person a DM made first reached the workspace on Instagram (K3), and the
--   messages_note_first_touch    trigger that stamps it hears the wire. A DM from a click-to-Instagram ad stamps 'ad' with
--                                the ad's id, as a WhatsApp one does (the referral's source_type is `ad`).
--   messages_note_booking_link   A reply that carried the booking link by DM is said once, as by WhatsApp or text (K7).
--   consent_channels_of          A yes given in a DM (START, the way back from a stop) covers no wire a conversation is
--                                started on: Instagram lets a business start none, and a DM is no yes for a wire it did
--                                not come on. Before this it fell to the last row of the table and covered WhatsApp.
--                                contracts' channelsOfYes says the same, case by case (consent tests).
--   last_inbound_on_instagram    When the thread's person last wrote by DM (conversation_channel_state, 00484), served with a
--                                thread as a computed column, as 00485's WhatsApp accessor is: Instagram's 24-hour window
--                                reads it (contracts replyWindow).
--   message_unsent               A person who unsends a DM takes its words back: kept that it came, never what it said
--   messages_guard               (00326's, with that one exception to "a message's words never change").
--   people_list                  A person whose first spoken message was a DM came from Instagram (came_from).
--   instagram_tokens             A clock: once a day the edge refreshes each connected account's token (sixty days, renewed
--                                once a day old), asked only while an active Instagram channel exists.
--
-- Nothing reads 'instagram' rows until the edge's door writes them, and the door writes none before an account is
-- connected, which needs Meta's App Review: either deploy order works. Re-runnable. The two scans this file makes (the
-- messages and the contacts constraints' validations) are last, after its last wait for a lock.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------- 1. the wire is a message's -- */

alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel in ('whatsapp', 'voice', 'sms', 'email', 'system', 'instagram')) not valid;

alter table public.contacts drop constraint if exists contacts_acquired_via_check;
alter table public.contacts add constraint contacts_acquired_via_check
  check (acquired_via is null
         or acquired_via in ('whatsapp', 'sms', 'email', 'instagram', 'call', 'ad', 'calendar', 'import', 'lead', 'manual'))
  not valid;
comment on column public.contacts.acquired_via is
  'How the person first reached the workspace, written once (person_set_first_touch): whatsapp, sms, email, instagram or call for the wire of the message or call that made them, ad for a click-to-chat ad on WhatsApp or Instagram (a referral whose source_type is ad; a post, a link or any other referral is the wire''s), calendar, import, lead or manual for the door that added them (00307, 00486). Null for a person from before it was kept, and wherever nothing says: unknown, never a guess.';

/* ------------------------------------------------------------------------------ 2. the triggers hear the wire -- */

create or replace trigger messages_note_first_touch after insert on public.messages
  for each row
  when (new.direction = 'inbound' and new.sender = 'customer' and new.contact_id is not null
        and new.channel in ('whatsapp', 'sms', 'email', 'instagram')
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_first_touch();
comment on function public.messages_note_first_touch() is
  'The first touch of the person an inbound customer message made (K3): its wire, or the ad it came from (meta.referral.source_id, when meta.referral.source_type is ad, on WhatsApp or Instagram; a post, a link or any other referral is the wire''s), with the line it came in on (meta.line). Never fails the insert: a failure is a warning.';

create or replace trigger messages_note_booking_link after insert on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and new.channel in ('whatsapp', 'sms', 'instagram')
        and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();

create or replace trigger messages_note_booking_link_on_send after update of status on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and old.status is distinct from 'sent'
        and new.channel in ('whatsapp', 'sms', 'instagram') and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();

/* ------------------------------------------------------------------------------- 3. what a yes in a DM covers -- */

create or replace function public.consent_channels_of(p_purpose text, p_source text, p_channel text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  -- contracts' channelsOfYes, row by row of its table. A purpose that is not 'marketing' is the conversational one.
  select case
    -- A yes in their own DM covers no wire a conversation is started on: Instagram lets a business start none, and a DM
    -- is no yes for a wire it did not come on (00486). It still lifts a stop, which is the consent column's, not this.
    when p_source = 'customer_message' and p_channel = 'instagram' then '{}'::text[]
    -- A yes to offers in their own message, by text or email, covers WhatsApp too: offers go by WhatsApp alone, and the
    -- confirmation they are sent says so. (Their own message on WhatsApp is WhatsApp alone, below.)
    when p_purpose = 'marketing' and p_source = 'customer_message' and p_channel in ('sms', 'email')
      then array['whatsapp', p_channel]
    when p_source = 'customer_message' and p_channel in ('whatsapp', 'sms', 'email') then array[p_channel]
    when p_purpose = 'marketing' then
      case when p_source in ('form', 'customer_message') then array['whatsapp'] else '{}'::text[] end
    when p_source in ('form', 'phone') then array['whatsapp', 'sms']
    else array['whatsapp']
  end
$$;

/* ------------------------------------------------------------------------------- 4. Instagram's own clock -- */

-- Its one argument is the thread's row, unnamed, as 00485's accessor's is: how the typed client knows it for a column
-- of conversations. A parameter's name cannot change in place, so it is dropped first.
drop function if exists public.last_inbound_on_instagram(public.conversations);
create function public.last_inbound_on_instagram(public.conversations)
returns timestamptz
language sql
stable
set search_path to 'public'
as $$
  select s.last_inbound_at
    from public.conversation_channel_state s
   where s.tenant_id = $1.tenant_id and s.conversation_id = $1.id and s.channel = 'instagram'
$$;
comment on function public.last_inbound_on_instagram(public.conversations) is
  'When a thread''s person last wrote by Instagram DM (decision 0001, step 8): the per-channel fact (conversation_channel_state, 00484), served with a thread as a computed column. Instagram''s 24-hour reply window reads it (contracts replyWindow).';
revoke all on function public.last_inbound_on_instagram(public.conversations) from public, anon;
grant execute on function public.last_inbound_on_instagram(public.conversations) to authenticated, service_role;

/* ------------------------------------------------------------------------- 5. the token's clock -- */

create or replace function public.trigger_instagram_token_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.tenant_channels c where c.kind = 'instagram' and c.status = 'active') then
    return public.request_sweep('instagram_tokens', '/api/cron/instagram-tokens');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('instagram_tokens', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_instagram_token_sweep() from public, anon, authenticated;
comment on function public.trigger_instagram_token_sweep() is
  'The Instagram token sweep''s clock (decision 0001, step 8). Calls the edge (/api/cron/instagram-tokens) only when an active Instagram channel exists; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- once a day, recording itself each time: fifty hours is two missed days and two hours, well inside a token's sixty.
  ('instagram_tokens', 'instagram-token-sweep', interval '50 hours', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('instagram-token-sweep') where exists (select 1 from cron.job where jobname = 'instagram-token-sweep');
select cron.schedule('instagram-token-sweep', '23 6 * * *', $$select public.trigger_instagram_token_sweep()$$);

/* ---------------------------------------------------------------------------- 6. a DM taken back -- */

-- messages_guard is 00326's with one exception to "a message's words never change": a person's own DM may lose its
-- words once, in the write that marks it unsent. Every other rule of it is as it was.
create or replace function public.messages_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_rank int;
  new_rank int;
  unknown  boolean;
begin
  -- A message never changes thread, with one exception (00326, decision 0028): into the thread of the person its
  -- own was merged into. Read from the rows, never from a setting: merged_into_contact_id is written by merge_people
  -- alone, so the exception is true only inside a merge and for exactly the two threads it folds.
  if (NEW.conversation_id is distinct from OLD.conversation_id
      and not exists (
        select 1
          from public.conversations was
          join public.contacts gone on gone.id = was.contact_id and gone.tenant_id = was.tenant_id
          join public.conversations kept on kept.tenant_id = was.tenant_id and kept.contact_id = gone.merged_into_contact_id
         where was.id = OLD.conversation_id and kept.id = NEW.conversation_id))
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.channel     is distinct from OLD.channel
     or NEW.direction   is distinct from OLD.direction
     or NEW.sender      is distinct from OLD.sender
     or NEW.type        is distinct from OLD.type
     or (NEW.body is distinct from OLD.body
         -- A person's own DM they took back (00486, message_unsent): its words may become nothing, once, in the write
         -- that marks it unsent. Nothing else ever changes a message's words.
         and not (NEW.body is null and OLD.channel = 'instagram' and OLD.direction = 'inbound' and OLD.sender = 'customer'
                  and coalesce(NEW.meta, '{}'::jsonb) ? 'unsent_at' and not coalesce(OLD.meta, '{}'::jsonb) ? 'unsent_at'))
     or NEW.template_name is distinct from OLD.template_name
     or NEW.channel_ts  is distinct from OLD.channel_ts
     or NEW.created_at  is distinct from OLD.created_at
     or (OLD.external_id is not null and NEW.external_id is distinct from OLD.external_id)
  then
    raise exception 'messages content columns are immutable (P3)';
  end if;
  -- Terminal, but for one row: an email whose send timed out (00177). The provider may have taken it, so its
  -- receipt may still say what became of it; until one does, it stays failed with outcome 'unknown'.
  unknown := OLD.status = 'failed' and OLD.channel = 'email' and coalesce(OLD.error->>'outcome', '') = 'unknown';
  if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status
     and not (unknown and NEW.status in ('sent', 'delivered', 'read')) then
    raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
  end if;
  -- A message that has left the building cannot be un-sent. 'canceled' asserts
  -- it never went out; on a delivered row that assertion is false, and it also
  -- hides the row from the bot's own history.
  if OLD.status in ('sent','delivered','read') and NEW.status = 'canceled' then
    raise exception 'a message that was already sent cannot be canceled (% -> % rejected)', OLD.status, NEW.status;
  end if;
  old_rank := case when unknown then 1 else case OLD.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end end;
  new_rank := case NEW.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  if new_rank < old_rank then
    raise exception 'messages.status is monotone (% -> % rejected)', OLD.status, NEW.status;
  end if;
  if NEW.status is distinct from OLD.status then
    NEW.status_updated_at := now();
    -- Each status keeps its own time: status_updated_at knows only the
    -- latest, and "delivered at 10:32, read at 10:40" is what a recipient's
    -- line on a broadcast shows. meta.status_at.<status> = now(), on the row
    -- the receipt already updates.
    NEW.meta := coalesce(NEW.meta, '{}'::jsonb)
      || jsonb_build_object('status_at',
           coalesce(NEW.meta->'status_at', '{}'::jsonb) || jsonb_build_object(NEW.status, now()));
  end if;
  return NEW;
end $$;

-- A person who unsends a DM takes its words back (Meta's webhook says is_deleted): its row keeps that it came and loses
-- what it said, its attachment with it, and it is never answered after (marked processed, so its answer's job stops at
-- the replay gate), and the answer's job that carried the words keeps them no longer. Only a person's own DM: nothing the
-- business wrote, and nothing on another wire. The edge removes the stored attachment by the path this returns.
create or replace function public.message_unsent(p_tenant_id uuid, p_external_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  return jsonb_build_object('outcome', 'forgot', 'message_id', v_id, 'storage_path', v_media ->> 'storage_path');
end $$;
revoke all on function public.message_unsent(uuid, text) from public, anon, authenticated;
grant execute on function public.message_unsent(uuid, text) to service_role;
comment on function public.message_unsent(uuid, text) is
  'A person''s Instagram DM they unsent (decision 0001, step 8; Meta''s is_deleted): its row keeps that it came and loses its words and attachment (unsent_at), it is marked processed so it is never answered after, and its answer''s job keeps the words no longer. Answers outcome none (no such DM here) or forgot, with the message''s id and its stored attachment''s path for the edge to remove. Service role.';

/* --------------------------------------------------------------------------- 7. where a DM's person came from -- */

-- people_list is copied from its latest migration (00485) with one change: a person whose first spoken message was a
-- DM came from Instagram (came_from), as one whose first was a text came from a text. Nothing else changes, and
-- `create or replace` keeps its grants, which are restated.
create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_added timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 returns TABLE(id uuid, display_name text, wa_profile_name text, phone_e164 text, email text, email_suppressed_at timestamp with time zone, consent text, consent_source text, consent_updated_at timestamp with time zone, dnc boolean, marketing_consent text, marketing_consent_source text, marketing_consent_updated_at timestamp with time zone, consent_channels text[], marketing_channels text[], offers_asked_at timestamp with time zone, email_marketing text, email_marketing_source text, email_marketing_updated_at timestamp with time zone, channels text[], conversation_count integer, escalation_count integer, needs_human boolean, open_escalation_reason text, open_escalation_since timestamp with time zone, latest_conversation_id uuid, latest_state text, latest_paused_until timestamp with time zone, latest_assignee_user_id uuid, latest_snooze_until timestamp with time zone, latest_wa_inbound_at timestamp with time zone, last_message_at timestamp with time zone, last_message_direction text, last_message_sender text, last_inbound_text text, last_inbound_at timestamp with time zone, last_inbound_channel text, last_wrote_at timestamp with time zone, last_call_at timestamp with time zone, last_inbound_call_at timestamp with time zone, last_inbound_call_summary text, call_count integer, call_seconds integer, first_contact_at timestamp with time zone, earliest_row_at timestamp with time zone, has_backfill boolean, has_chat boolean, message_channels text[], queued_reply_at timestamp with time zone, came_from text, deal_id uuid, deal_stage text, deal_service text, deal_proposed_at timestamp with time zone, deal_decided_at timestamp with time zone, deal_ended_at timestamp with time zone, deal_amount_cents integer, deal_per text, deal_proposal_url text, deal_valid_until date, deal_lost_reason text, open_deals jsonb, step_id uuid, step_body text, step_due_on date, step_for_user_id uuid, step_deal_id uuid, in_touch_at timestamp with time zone, added_at timestamp with time zone, lead_id uuid, lead_name text, lead_gone boolean, lead_emails text[], name_source text, name_settled_at timestamp with time zone, signer_message_id uuid, signer_name text, signer_title text, signer_read_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
  ),
  ev as not materialized (
    select m.id, m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00299).
           public.message_is_a_persons_words(m.meta) as persons_words
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email, ch.email_suppressed_at,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
    ch.email_marketing, ch.email_marketing_source, ch.email_marketing_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.wa_heard_at,
    ma.last_at, ma.last_direction, ma.last_sender,
    ma.last_in_body, ma.last_in_at, ma.last_wrote_on,
    ma.last_wrote_at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how a door added them (their acquired_via, written from the door's contact.added event by
    -- 00307, the first word winning), else how a history moved in began, else their first spoken event.
    case
      when ch.acquired_via in ('calendar', 'lead', 'import', 'manual') then ch.acquired_via
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email', 'instagram') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    od.deals,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at,
    ch.lead_id, case when not coalesce(ld.gone, false) then ld.business_name end, coalesce(ld.gone, false),
    ld.emails,
    ch.name_source, ch.name_settled_at,
    sg.message_id, sg.signer_name, sg.signer_title, sg.read_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at,
           k.lead_id, k.name_source, k.name_settled_at, k.acquired_via
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
  left join lateral (
    -- The business they work at (0052), by its key: its name, and whether it was erased or blanked since; and, for its
    -- own person alone while it stands, its addresses (its email and its alternates), each once, lower-cased.
    select l.business_name, (l.erased_at is not null or l.blanked_at is not null) as gone,
           case when l.contact_id = c.id and l.erased_at is null and l.blanked_at is null then
             (select array_agg(distinct lower(btrim(a.address)) order by lower(btrim(a.address)))
                from (select l.email as address
                      union all
                      select x->>'email' from jsonb_array_elements(coalesce(l.email_alternates, '[]'::jsonb)) x) a
               where nullif(btrim(coalesce(a.address, '')), '') is not null)
           end as emails
      from leads l
     where l.id = ch.lead_id and l.tenant_id = p_tenant_id
  ) ld on true
  left join lateral (
    -- A reply's signer offered as their name (0052), the newest: the reply's writer's alone, as the name's doors match
    -- it; offered rows are few, and found by reach_out_replies_signer_offered.
    select r.message_id, r.signer_name, r.signer_title, r.read_at
      from sequence_replies r
     where r.tenant_id = p_tenant_id and r.signer_state = 'offered' and r.undone_at is null
       and r.contact_id = c.id
     order by r.read_at desc
     limit 1
  ) sg on true
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until,
           -- The WhatsApp clock, from the per-channel fact through its one accessor (decision 0001, step 5).
           public.last_inbound_on_whatsapp(cv) as wa_heard_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    -- Everything the row says of a person's messages, in one pass over them (00464). It was four looks, each a pass of
    -- its own with a message_moment call for every message, and they were most of the list's time. A newest row is the
    -- one that happened last, then was written last, then has the greater id, so a tie picks the same row every time.
    select -- The newest word in the thread, either way.
           max(e.at) filter (where e.at is not null and e.spoken) as last_at,
           (array_agg(e.direction order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_direction,
           (array_agg(e.sender order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_sender,
           -- The newest words that came in.
           max(e.at) filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null)
             as last_in_at,
           (array_agg(e.body order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null))[1]
             as last_in_body,
           -- Where they last WROTE: the wire of their newest own words. Not a call's note (the system's row, never spoken)
           -- and not a program writing from their address (persons_words): an out-of-office made email "where they last
           -- wrote", and a campaign then went there. contracts lastWroteOn is its twin.
           (array_agg(e.channel order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.sender = 'customer' and e.spoken
                             and e.persons_words))[1] as last_wrote_on,
           min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- When they last wrote words of their own (00299), the statement has_relationship makes of "they wrote".
           max(e.at) filter (where e.direction = 'inbound' and e.spoken and e.at is not null and e.body is not null
                               and e.persons_words) as last_wrote_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Every open deal (0029), newest first: a person may hold one per service (deals_open_uq), and the one above hid the
    -- rest. Null for someone with none open.
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'stage', d.stage, 'service', d.service, 'proposed_at', d.proposed_at,
             'decided_at', d.decided_at, 'ended_at', d.ended_at, 'amount_cents', d.amount_cents, 'per', d.per,
             'currency', d.currency, 'proposal_url', d.proposal_url, 'valid_until', d.valid_until,
             'lost_reason', d.lost_reason
           ) order by d.created_at desc) as deals
      from deals d
     where d.contact_id = c.id
       and d.stage in ('proposed', 'won')
  ) od on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
  order by c.in_touch_at desc, c.added_at desc, c.id desc
$$;

revoke all on function public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid) to authenticated, service_role;

-- Its comment says the wires it names: the two phrases that list them now list Instagram too, the rest as it was.
-- Re-runnable: a comment already saying them is left alone.
do $$
declare
  v_said text := obj_description(
    'public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
    'pg_proc');
  v_now  text;
begin
  v_now := replace(replace(v_said,
    'the wire of their first message (whatsapp, sms, email)',
    'the wire of their first message (whatsapp, sms, email, instagram)'),
    '(whatsapp, sms or email; null when they have sent none)',
    '(whatsapp, sms, email or instagram; null when they have sent none)');
  if v_now is distinct from v_said then
    execute format(
      'comment on function public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid) is %L',
      v_now);
  end if;
end $$;

/* ------------------------------------------------------------------------------- 8. the validations -- */

-- Last on purpose: the one scan of each table this file makes, after its last wait for a lock.
alter table public.messages validate constraint messages_channel_check;
alter table public.contacts validate constraint contacts_acquired_via_check;
