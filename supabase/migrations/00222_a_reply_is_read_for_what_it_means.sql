-- 00222 · A reply is read for what it means.
--
-- Reach out, Part 5 (docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md, PR 3). A business that writes back
-- to a reach-out is read once, what the reading means is applied in one transaction, the workspace is told once, and a
-- reply that could not be read is read again. The reading's effects are contracts' readingPlan: the doors below execute
-- the plan they are handed and never decide an intent's effects themselves.
--
--   reach_out_replies           one reading per message: the intent, what it did (the plan, and what it changed, for the
--                               undo), whether it was read, re-read, told, undone. Members read; only the doors write.
--   reach_out_check_spend.reads the replies read in a workspace's UTC day, beside the check's attempts;
--   reach_out_read_take         one read taken under the day's cap (the check's statement, over reads).
--   jobs.kind                   gains reply_read; jobs_reply_read_once holds one live read per message and stage.
--   notifications.kind          gains reach_out_replied.
--   outreach_wrote_back         00211's, whole, with a fourth reading (B1): an automatic reply read as no or as naming
--                               someone else, not undone, is an answer.
--   reach_out_reply_of          whose reply a message is: the reach-out email it answers or cites, else the latest one
--                               sent to its person, within the days asked (reach_out_sends_contact finds those).
--   reach_out_reply_apply       a reading and its plan, applied once (a re-read by compare-and-set).
--   reach_out_reply_draft       the draft's mark (PR 5 writes it).
--   reach_out_reply_tell_claim, reach_out_reply_told
--                               the notice in two phases (B2): claimed, then marked told only once the owner was told.
--   reach_out_reply_undoable, reach_out_reply_undo
--                               "read as no · undo" (G10, N4): a member's door, which puts back exactly what the no wrote
--                               while nothing else holds it.
--
-- An automatic out-of-office is read and recorded (until_at) and does nothing yet: its pause is 00223's (PR 4), whose
-- followers must stop counting an `outreach_away` skip first, so this door skips no send for it.
--
-- Every statement re-runs. The CHECKs and the new column take ACCESS EXCLUSIVE on tables a live workspace writes
-- (jobs, notifications), so the same lock guard as 00220.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the readings -- */

create table if not exists public.reach_out_replies (
  message_id          uuid primary key references public.messages (id) on delete cascade,
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  contact_id          uuid references public.contacts (id) on delete set null,      -- who wrote
  lead_id             uuid references public.leads (id) on delete set null,         -- the lead it answers
  lead_contact_id     uuid references public.contacts (id) on delete set null,      -- the lead's person (G6)
  send_id             uuid references public.reach_out_sends (id) on delete set null,
  answered_message_id uuid references public.messages (id) on delete set null,      -- our email it answers
  claim               text not null check (claim in ('person', 'automated', 'auto_reply')),
  intent              text not null check (intent in ('interested', 'question', 'not_now', 'no', 'wrong_person', 'away', 'other')),
  summary             text check (summary is null or char_length(summary) <= 160),
  named_day           date,
  refer_to            text check (refer_to is null or char_length(refer_to) <= 120),
  unread              text check (unread is null or unread in ('no_model', 'may_not_spend', 'day_spent', 'model_failed')),
  rereads             int not null default 0 check (rereads between 0 and 3),
  reread_at           timestamptz,
  until_at            timestamptz,        -- an automatic reply's away: when the chain may go on (G8, 00223)
  plan                jsonb not null default '{}'::jsonb,   -- what the reading did, and what it changed (for the undo)
  draft               text check (draft is null or char_length(draft) <= 4000),
  draft_state         text not null default 'none' check (draft_state in ('none', 'waiting', 'written', 'not_written')),
  draft_why           text check (draft_why is null or char_length(draft_why) <= 60),
  tell_claimed_at     timestamptz,
  told_at             timestamptz,
  read_at             timestamptz not null default now(),
  undone_at           timestamptz,
  undone_by           uuid references auth.users (id) on delete set null,
  constraint reach_out_replies_unread_is_other check (unread is null or intent = 'other'),
  constraint reach_out_replies_away_has_until check (until_at is null or (intent = 'away' and claim = 'auto_reply'))
);
create index if not exists reach_out_replies_recent on public.reach_out_replies (tenant_id, read_at desc);
create index if not exists reach_out_replies_away
  on public.reach_out_replies (tenant_id, contact_id, until_at) where intent = 'away' and until_at is not null;
create index if not exists reach_out_replies_answer
  on public.reach_out_replies (tenant_id, contact_id) where claim = 'auto_reply' and intent in ('no', 'wrong_person') and undone_at is null;
create index if not exists reach_out_replies_answer_lead
  on public.reach_out_replies (tenant_id, lead_contact_id) where claim = 'auto_reply' and intent in ('no', 'wrong_person') and undone_at is null;
create index if not exists reach_out_replies_thread on public.reach_out_replies (conversation_id, read_at desc);
create index if not exists reach_out_replies_no
  on public.reach_out_replies (tenant_id, lead_contact_id) where intent = 'no' and undone_at is null;

alter table public.reach_out_replies enable row level security;
-- Members read their workspace's readings (the 00002 shape); nobody signed in writes one. Every write is a door below.
drop policy if exists reach_out_replies_member_select on public.reach_out_replies;
create policy reach_out_replies_member_select on public.reach_out_replies
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.reach_out_replies from anon, authenticated;
grant select on public.reach_out_replies to authenticated;
grant all on public.reach_out_replies to service_role;
comment on table public.reach_out_replies is
  'Reach out Part 5: one reading of one reply to a reach-out, keyed by the message (G3). The intent (or other, with why it could not be read), what the reading did (plan, with what it changed for the undo), the notice''s two marks (B2), and the undo. Written by the service role''s doors (reach_out_reply_apply, _draft, _tell_claim, _told) and the member''s undo (reach_out_reply_undo) only.';

-- The page repaints when a reading lands (PR 7 watches it): guarded, so the file re-runs.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reach_out_replies'
  ) then
    alter publication supabase_realtime add table public.reach_out_replies;
  end if;
end $$;

/* ------------------------------------------------------------ 2. the reads' spend -- */

alter table public.reach_out_check_spend add column if not exists reads int not null default 0 check (reads >= 0);
comment on column public.reach_out_check_spend.reads is
  'Reach out Part 5: the replies read by the model in this workspace''s UTC day, under contracts REACH_OUT_READS_PER_DAY (G4). Written by reach_out_read_take only.';

-- One read, taken atomically if the workspace's UTC day is under p_cap: true when taken, false at the cap. The check's
-- statement (00197 reach_out_check_take) over reads, so a read and a check are counted the same way, and apart.
create or replace function public.reach_out_read_take(p_tenant_id uuid, p_cap int, p_at timestamptz default now())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taken boolean;
begin
  if p_tenant_id is null or coalesce(p_cap, 0) <= 0 then
    return false;
  end if;
  insert into public.reach_out_check_spend as x (tenant_id, day, reads)
  values (p_tenant_id, (coalesce(p_at, now()) at time zone 'UTC')::date, 1)
  on conflict (tenant_id, day) do update set reads = x.reads + 1 where x.reads < p_cap
  returning true into v_taken;
  return coalesce(v_taken, false);
end $$;
revoke execute on function public.reach_out_read_take(uuid, int, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_read_take(uuid, int, timestamptz) to service_role;

/* ------------------------------------------------------------ 3. the kinds -- */

-- 00189's list, with reply_read: the kind arrives with its handler (packages/jobs reply_read) and its caller (the email
-- intake, core ingestEmail) in the same change.
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read'));

-- One live read per message and stage (G1): the intake retried after it scheduled, a second webhook, and a re-read
-- each find the work already on the ledger (scheduleJobOnce answers already_scheduled). A failed one does not count
-- (00135's rule), so a read that failed for good can be scheduled again.
create unique index if not exists jobs_reply_read_once
  on public.jobs ((payload->>'message_id'), (coalesce(payload->>'stage', 'read')))
  where kind = 'reply_read' and state <> 'failed';
comment on index public.jobs_reply_read_once is
  'One live reply_read per message and stage (Reach out Part 5, G1): a first read (no stage, or read), and each re-read (reread-1..3). A failed one does not count.';

-- 00158's list, with reach_out_replied: a reach-out's reply, read (G16).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied'));

/* ------------------------------------------------------------ 4. B1: an automatic no is an answer -- */

-- Whether these people wrote back (00211's three readings, whole, and a fourth): a customer's message that is not an
-- auto-reply, a reply to one of the workspace's emails, a call in, and (00222, B1) an automatic reply read as no or as
-- naming someone else to write to, not undone, for the person who wrote it and the lead's person. An automatic reply
-- is otherwise not writing back (00181): an out-of-office says nothing of what they want. One that asks to be taken
-- off the list, or names who to write to instead, is an answer, however its headers are marked; undone, it is not
-- (the undo said it was misread). Set-based, so a chain's report asks once for all its leads; the send door asks it
-- for one. Only ever widened here (C16), never narrowed.
create or replace function public.outreach_wrote_back(p_tenant_id uuid, p_contact_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.contact_id from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
   where m.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and m.direction = 'inbound' and m.sender = 'customer'
     and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply')
  union
  select c.contact_id from public.messages o
    join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
   where o.tenant_id = p_tenant_id and c.contact_id = any (p_contact_ids)
     and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
     and (exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
          or exists (
            select 1 from public.messages r
             where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
               and r.sender = 'customer'
               and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
               and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply'))
  union
  select k.contact_id from public.calls k
   where k.tenant_id = p_tenant_id and k.contact_id = any (p_contact_ids) and k.direction = 'inbound'
  union
  select rr.contact_id from public.reach_out_replies rr
   where rr.tenant_id = p_tenant_id and rr.contact_id = any (p_contact_ids)
     and rr.claim = 'auto_reply' and rr.intent in ('no', 'wrong_person') and rr.undone_at is null
  union
  select rr.lead_contact_id from public.reach_out_replies rr
   where rr.tenant_id = p_tenant_id and rr.lead_contact_id = any (p_contact_ids)
     and rr.claim = 'auto_reply' and rr.intent in ('no', 'wrong_person') and rr.undone_at is null
$$;
revoke execute on function public.outreach_wrote_back(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.outreach_wrote_back(uuid, uuid[]) to service_role;

/* ------------------------------------------------------------ 5. whose reply it is -- */

-- The sends a reach-out made to a person, newest first: how a reply that cites nothing finds the reach-out it answers.
create index if not exists reach_out_sends_contact
  on public.reach_out_sends (tenant_id, contact_id, sent_at desc) where state = 'sent' and contact_id is not null;

-- A received email is a reach-out's reply when it answers or cites (In-Reply-To, References) an email a reach-out sent
-- in the p_days before it arrived, or when its thread's person is the person a reach-out wrote to in those days (G5):
-- the first covers a business written at one address that answers from another, as 00181 does. Null when the message
-- is no inbound email of this workspace, or answers no reach-out. The intake and the reading's job both ask it; the
-- reading's door asks it again, so nothing a caller hands in names the lead.
create or replace function public.reach_out_reply_of(p_tenant_id uuid, p_message_id uuid, p_days int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select m.id, m.conversation_id, coalesce(m.contact_id, c.contact_id) as contact_id, c.contact_id as thread_contact,
           m.created_at, coalesce(m.channel_ts, m.created_at) as received_at, m.body, m.meta
      from public.messages m
      join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
     where m.id = p_message_id and m.tenant_id = p_tenant_id
       and m.channel = 'email' and m.direction = 'inbound' and m.sender = 'customer'
  ), cited as (
    select array_remove(
             array[m.meta->'email'->>'in_reply_to']
             || array(select jsonb_array_elements_text(
                        case when jsonb_typeof(m.meta->'email'->'references') = 'array'
                             then m.meta->'email'->'references' else '[]'::jsonb end)),
             null) as ids
      from m
  ), found as (
    -- The email it answers or cites, by its Message-ID (messages_email_message_id_idx), then its send.
    (select s.id, 1 as how, s.sent_at
       from cited cross join m
       join public.messages o
         on o.tenant_id = p_tenant_id and o.channel = 'email' and o.direction = 'outbound'
        and o.meta->'email'->>'message_id' = any (cited.ids)
       join public.reach_out_sends s on s.message_id = o.id and s.tenant_id = o.tenant_id
      where s.state = 'sent'
        and s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
      order by s.sent_at desc
      limit 1)
    union all
    -- Else the latest email a reach-out sent to the thread's person, as the send names them
    -- (reach_out_sends_contact)...
    (select s.id, 2 as how, s.sent_at
       from m
       join public.reach_out_sends s
         on s.tenant_id = p_tenant_id and s.contact_id = m.thread_contact and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
    union all
    -- ...or as its lead names them now (leads_tenant_contact).
    (select s.id, 3 as how, s.sent_at
       from m
       join public.leads l on l.tenant_id = p_tenant_id and l.contact_id = m.thread_contact
       join public.reach_out_sends s on s.tenant_id = l.tenant_id and s.lead_id = l.id and s.state = 'sent'
      where s.sent_at >= m.created_at - make_interval(days => greatest(coalesce(p_days, 0), 0))
        and s.sent_at <= m.created_at
      order by s.sent_at desc
      limit 1)
  ), one as (
    select f.id from found f order by f.how, f.sent_at desc limit 1
  )
  select jsonb_build_object(
    'send_id', s.id,
    'lead_id', l.id,
    'lead_contact_id', l.contact_id,
    'lead_email', lower(btrim(l.email)),
    'lead_website', l.website_host,
    'root_id', s.root_id,
    'playbook_id', s.playbook_id,
    'answered_message_id', s.message_id,
    'answered_text', left(o.body, 600),
    -- The address the email went to, read off its frozen request as the consent door reads it.
    'answered_to', lower(btrim(coalesce(o.meta->'email'->'request'->'to'->>0, o.meta->'email'->>'to'))),
    'business', l.business_name,
    'chain', root.name,
    'signed_by', root.signed_by,
    'sent_at', s.sent_at,
    'tz', t.timezone,
    'conversation_id', m.conversation_id,
    'contact_id', m.contact_id,
    'claim', case when m.meta->'email'->>'claim' in ('person', 'automated', 'auto_reply')
                  then m.meta->'email'->>'claim' else 'person' end,
    'from', m.meta->'email'->>'from',
    'subject', m.meta->'email'->>'subject',
    'text', m.body,
    'received_at', m.received_at)
    from one
    join public.reach_out_sends s on s.id = one.id
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    left join public.messages o on o.id = s.message_id and o.tenant_id = s.tenant_id
    left join public.playbooks root on root.id = s.root_id
    left join public.tenants t on t.id = s.tenant_id
    cross join m
$$;
revoke execute on function public.reach_out_reply_of(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_reply_of(uuid, uuid, int) to service_role;
comment on function public.reach_out_reply_of(uuid, uuid, int) is
  'Whose reply a received email is (Reach out Part 5, G5): the reach-out email it answers or cites, else the latest one sent to its thread''s person, within p_days before it arrived. Answers the send, the lead, the lead''s person, address and website, the chain, the email it answers (its first 600 characters), the workspace''s zone, and the reply''s own claim, sender, subject and words; null when it answers none. Service role only.';

/* ------------------------------------------------------------ 6. the reading's door -- */

-- A reading and its plan (contracts readingPlan), applied in one transaction, once. p_reread is which re-read this is
-- (0 for the reading made when the reply arrived). What it does, in order:
--   1. the row: a first read inserts it, and finding one does nothing else; a re-read updates it only while it is
--      unread, not undone, and at the re-read before this one (compare-and-set), and makes it due a notice again when
--      the plan tells, or when the reading before it was owed one that never reached the owner;
--   2. skipSends: the lead's planned and held sends in live runs are skipped, outreach_wrote_back. (outreach_away is
--      00223's, and skips nothing here: an automatic out-of-office is recorded and does nothing yet);
--   3. convert: the lead to Talking, through the one converter (lead_convert_by, how reply);
--   4. resumeAt: the lead's resume_at;
--   5. saidNo: the one consent door (set_email_marketing, source reply), then the reply's own From and the business's
--      own domain on the never-again list, recording for the undo what was there before, every row the no stands
--      behind (holds), and the rows this act wrote;
--   6. step: a dated step on the lead's person (person_step_from_playbook), once per message;
--   7. the event reach_out.replied.
-- The claim, the lead and the lead's person are read here (reach_out_reply_of), never taken from the caller.
create or replace function public.reach_out_reply_apply(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_reading    jsonb,
  p_plan       jsonb,
  p_reread     int,
  p_days       int
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

  v_of := public.reach_out_reply_of(p_tenant_id, p_message_id, p_days);
  if v_of is null then
    return jsonb_build_object('applied', false, 'why', 'not_a_reply');
  end if;
  v_lead   := (v_of->>'lead_id')::uuid;
  v_person := (v_of->>'lead_contact_id')::uuid;
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
                                          unread, until_at, plan)
    values (p_message_id, p_tenant_id, (v_of->>'conversation_id')::uuid, (v_of->>'contact_id')::uuid, v_lead, v_person,
            (v_of->>'send_id')::uuid, (v_of->>'answered_message_id')::uuid, v_of->>'claim', v_intent,
            left(v_summary, 160), v_day, left(v_refer, 120), v_unread, v_until, coalesce(p_plan, '{}'::jsonb))
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

  -- 2. The lead's sends still waiting in live runs: the door would refuse each (wrote back), so none waits for an owner.
  if p_plan->>'skipSends' = 'outreach_wrote_back' then
    with skipped as (
      update public.reach_out_sends s
         set state = 'skipped', reason = 'outreach_wrote_back'
        from public.broadcasts b
       where b.id = s.broadcast_id and b.tenant_id = s.tenant_id
         and b.state in ('pending_approval', 'scheduled', 'sending')
         and s.tenant_id = p_tenant_id and s.lead_id = v_lead and s.state in ('planned', 'held')
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
revoke execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) to service_role;
comment on function public.reach_out_reply_apply(uuid, uuid, jsonb, jsonb, int, int) is
  'A reply''s reading and its plan (contracts readingPlan), applied once in one transaction (Reach out Part 5, G6-G11): the lead''s waiting sends skipped (wrote back), Talking through lead_convert_by, resume_at, a no through set_email_marketing (reply) with the reply''s From and the business''s own domain on the never-again list, a dated step, and reach_out.replied. A re-read applies by compare-and-set on the row still unread. Records what it changed for the undo. Answers {applied}. Service role only.';

/* ------------------------------------------------------------ 7. the draft's and the notice's marks -- */

-- The draft (PR 5): written only from none or waiting, so a second stage never overwrites the first.
create or replace function public.reach_out_reply_draft(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_state      text,
  p_draft      text,
  p_why        text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state is null or p_state not in ('waiting', 'written', 'not_written') then
    raise exception 'a draft is waiting, written or not written' using errcode = '22023';
  end if;
  update public.reach_out_replies
     set draft_state = p_state,
         draft = case when p_state = 'written' then left(p_draft, 4000) else draft end,
         draft_why = case when p_state = 'not_written' then left(p_why, 60) else draft_why end
   where message_id = p_message_id and tenant_id = p_tenant_id and draft_state in ('none', 'waiting');
  return found;
end $$;
revoke execute on function public.reach_out_reply_draft(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reach_out_reply_draft(uuid, uuid, text, text, text) to service_role;

-- The notice's first phase (B2): claimed while nobody was told and no live claim holds it. A claim older than
-- p_stale_before (the job's lease) is a run that stopped half way, and is claimed again. Answers the claim (the moment
-- it was taken, which the mark asks for), or null.
create or replace function public.reach_out_reply_tell_claim(p_tenant_id uuid, p_message_id uuid, p_stale_before timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  update public.reach_out_replies
     set tell_claimed_at = clock_timestamp()
   where message_id = p_message_id and tenant_id = p_tenant_id and told_at is null
     and (tell_claimed_at is null or tell_claimed_at < p_stale_before)
  returning tell_claimed_at into v_at;
  return v_at;
end $$;
revoke execute on function public.reach_out_reply_tell_claim(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_reply_tell_claim(uuid, uuid, timestamptz) to service_role;

-- The notice's second phase: marked told, only once the owner was told, and only while the claim that told is still
-- the row's (a re-read that made the reading due a notice again took it back, and its own stage tells).
create or replace function public.reach_out_reply_told(p_tenant_id uuid, p_message_id uuid, p_claimed_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reach_out_replies set told_at = now()
   where message_id = p_message_id and tenant_id = p_tenant_id and told_at is null
     and tell_claimed_at = p_claimed_at;
  return found;
end $$;
revoke execute on function public.reach_out_reply_told(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reach_out_reply_told(uuid, uuid, timestamptz) to service_role;

/* ------------------------------------------------------------ 8. the undo (G10, N4) -- */

-- Whether the caller may undo this reading: null when they may, else why not. The door asks it, and the read the page
-- shows selects it (PR 6), so the rule is written once. A caller who is no member of the reading's workspace, or asks
-- of no reading, is told not_found and learns nothing of another workspace. The seven days are this function's alone.
create or replace function public.reach_out_reply_undoable(p_message_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.message_id is null
      or not exists (select 1 from public.memberships mm where mm.tenant_id = r.tenant_id and mm.user_id = (select auth.uid()))
      then 'not_found'
    when not public.is_acting_member(r.tenant_id) then 'role'
    when r.intent <> 'no' then 'not_a_no'
    when r.undone_at is not null then 'already'
    when r.read_at < now() - interval '7 days' then 'too_late'
    -- Their person, or the lead that said it, erased or gone since: an erasure's tombstone is for good, and an undo
    -- could take back a row it relies on.
    when c.id is null or c.erased_at is not null or l.id is null or l.erased_at is not null or l.blanked_at is not null
      then 'not_found'
    when c.email_marketing is distinct from 'opted_out' or c.email_marketing_source is distinct from 'reply' then 'moved'
    else null
  end
    from (select p_message_id as id) asked
    left join public.reach_out_replies r on r.message_id = asked.id
    left join public.contacts c on c.id = r.lead_contact_id and c.tenant_id = r.tenant_id
    left join public.leads l on l.id = r.lead_id and l.tenant_id = r.tenant_id
$$;
revoke execute on function public.reach_out_reply_undoable(uuid) from public, anon;
grant execute on function public.reach_out_reply_undoable(uuid) to authenticated, service_role;
comment on function public.reach_out_reply_undoable(uuid) is
  'Whether the caller may undo a reply read as no (Reach out Part 5, G10, N4): null when they may; else not_found (no such reading, or not a member of its workspace), role (not an acting member), not_a_no, already, too_late (seven days after the reading), or moved (the person''s email consent is no longer a reply''s no: they unsubscribed or complained since).';

-- "Read as no · undo": puts back exactly what the no wrote, as the reading recorded it, while nothing else holds it.
--   - The reading is marked undone (intent stays no; contracts read an undone reading as other).
--   - While another not-undone no from the same person stands, their answer, their leads and their rows on the
--     never-again list stay as that no holds them (00220's consent door asks whether a reply's no holds the answer,
--     not which one; and a second no records nothing the first did not).
--   - Once the last of their noes is undone: the answer goes back through set_email_marketing (reply_undone, to the
--     answer the no found, naming the email that no named, so D18 stops counting it), and only if it does does anything
--     else move; each row their noes stood behind is deleted only when a reading wrote it and nothing holds it now (no
--     standing no of anyone holds it: a second lead's no keeps the domain; no person holding that address unsubscribed
--     or complained; no erased person held it); and each lead their noes closed goes back to its stage before, at the
--     version the no left it.
-- The reading and its person are locked first, so a reading, an unsubscribe or a complaint for the same person is
-- never lost between the question and the act.
-- A person's own reply keeps the chain stopped (they wrote back); an automatic reply's no, undone, is not an answer
-- any more (outreach_wrote_back's fourth reading asks undone_at is null). A domain hold the no may have tipped stays:
-- a reputation hold is its owner's to Resume (D16).
create or replace function public.reach_out_reply_undo(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_why      text;
  v_row      public.reach_out_replies%rowtype;
  v_others   int;
  v_res      jsonb;
  v_no       jsonb;
  v_consent  text := null;
  v_row_s    jsonb;
  v_deleted  int := 0;
  v_kept     int := 0;
  v_restored int := 0;
  v_lead     record;
  v_pass     int;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Asked first with no lock (a stranger locks nothing of another workspace's), then again once the person and the
  -- reading are locked, in the order the reading's door takes them: a reading applied, an unsubscribe or a complaint
  -- for the same person meanwhile (each locks the person, the consent door too) waits for this undo, or this undo for
  -- it, and never slips between the question and the act.
  for v_pass in 1 .. 2 loop
    v_why := public.reach_out_reply_undoable(p_message_id);
    if v_why = 'not_found' then raise exception 'Reply not found.' using errcode = 'P0002'; end if;
    if v_why = 'role' then raise exception 'Not allowed to act in this workspace.' using errcode = '42501'; end if;
    if v_why = 'not_a_no' then raise exception 'Only a no can be undone.' using errcode = '22023'; end if;
    if v_why = 'already' then raise exception 'Already undone.' using errcode = '22023'; end if;
    if v_why = 'too_late' then raise exception 'It''s been more than seven days.' using errcode = '22023'; end if;
    if v_why = 'moved' then raise exception 'They unsubscribed since, and that stays.' using errcode = '22023'; end if;
    if v_why is not null then raise exception 'That reply cannot be undone.' using errcode = '22023'; end if;
    exit when v_pass = 2;
    select * into v_row from public.reach_out_replies where message_id = p_message_id;
    perform 1 from public.contacts where id = v_row.lead_contact_id and tenant_id = v_row.tenant_id for update;
    perform 1 from public.reach_out_replies where message_id = p_message_id for update;
  end loop;

  update public.reach_out_replies
     set undone_at = now(), undone_by = v_user
   where message_id = p_message_id and undone_at is null
  returning * into v_row;

  -- Another no from the same person still holds their answer, their leads and their rows on the never-again list.
  select count(*) into v_others from public.reach_out_replies o
   where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
     and o.intent = 'no' and o.undone_at is null;

  if v_others > 0 then
    v_kept := jsonb_array_length(coalesce(v_row.plan->'changed'->'holds', '[]'::jsonb));
  else
    -- Back to exactly the answer the no found, named for the email it named, so D18 stops counting it: the reading of
    -- theirs that changed their answer recorded both (consent_was, consent_named). The consent door holds it to the
    -- answer its own event kept, and refuses any other.
    select o.plan->'changed' into v_no
      from public.reach_out_replies o
     where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
       and o.intent = 'no' and o.undone_at is not null
       and coalesce((o.plan->'changed'->>'consent_changed')::boolean, false)
     order by o.read_at desc
     limit 1;
    v_res := public.set_email_marketing(v_row.tenant_id, v_row.lead_contact_id,
                                        coalesce(v_no->>'consent_was', 'unknown'), 'reply_undone',
                                        coalesce(nullif(v_no->>'consent_named', '')::uuid, v_row.answered_message_id),
                                        jsonb_build_object('reading', v_row.message_id, 'by', v_user));
    -- Nothing else is put back unless the answer was: the whole undo is refused, and nothing it did stands.
    if not coalesce((v_res->>'changed')::boolean, false) then
      raise exception 'They unsubscribed since, and that stays.' using errcode = '22023';
    end if;
    v_consent := (select c.email_marketing from public.contacts c where c.id = v_row.lead_contact_id);

    -- The rows this person's noes stood behind, each deleted only when a reading wrote it (never an unsubscribe's, a
    -- customer's or an erasure's row that was there first) and nothing holds it now: no standing no of anyone (a
    -- second lead's no keeps the domain), no person holding that address who unsubscribed or complained, no erased
    -- person who held it.
    for v_row_s in
      select distinct x from public.reach_out_replies o
       cross join lateral jsonb_array_elements(coalesce(o.plan->'changed'->'holds', '[]'::jsonb)) x
       where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
         and o.intent = 'no' and o.undone_at is not null
    loop
      if not exists (
           select 1 from public.reach_out_replies a
            where a.tenant_id = v_row.tenant_id and a.intent = 'no'
              and coalesce(a.plan->'changed'->'suppressions', '[]'::jsonb) @> jsonb_build_array(v_row_s)) then
        continue;
      end if;
      -- The row locked before it is judged: a reading of another person's no that holds it holds its lock until it
      -- commits, so this waits, and the question below (a statement of its own) then sees that no.
      perform 1 from public.lead_suppressions
       where tenant_id = v_row.tenant_id and kind = v_row_s->>'kind' and hash = v_row_s->>'hash'
       for update;
      if exists (
           select 1 from public.reach_out_replies o
            where o.tenant_id = v_row.tenant_id and o.intent = 'no' and o.undone_at is null
              and coalesce(o.plan->'changed'->'holds', '[]'::jsonb) @> jsonb_build_array(v_row_s))
         or (v_row_s->>'kind' = 'email' and exists (
           select 1 from public.contacts c
            where c.tenant_id = v_row.tenant_id
              and ((c.email_marketing = 'opted_out' and c.email_marketing_source in ('unsubscribe', 'complaint')
                    and c.email is not null
                    and public.lead_suppression_hash(v_row.tenant_id, c.email) = v_row_s->>'hash')
                or c.erased_email_hash = v_row_s->>'hash')))
      then
        v_kept := v_kept + 1;
      else
        delete from public.lead_suppressions
         where tenant_id = v_row.tenant_id and kind = v_row_s->>'kind' and hash = v_row_s->>'hash' and what = 'said_no';
        if found then
          v_deleted := v_deleted + 1;
        end if;
      end if;
    end loop;

    -- Every lead one of this person's noes closed, back to its stage before, at the version the no left it.
    for v_lead in
      select distinct on ((x->>'id')::uuid) (x->>'id')::uuid as id, x->>'stage' as stage, (x->>'version')::int as version
        from public.reach_out_replies o
       cross join lateral jsonb_array_elements(coalesce(o.plan->'changed'->'leads', '[]'::jsonb)) x
       where o.tenant_id = v_row.tenant_id and o.lead_contact_id = v_row.lead_contact_id
         and o.intent = 'no' and o.undone_at is not null
       order by (x->>'id')::uuid, o.read_at desc
    loop
      update public.leads
         set stage = v_lead.stage, closed_reason = null, version = version + 1
       where id = v_lead.id and tenant_id = v_row.tenant_id and version = v_lead.version
         and stage = 'archived' and closed_reason = 'said_no' and v_lead.stage in ('ready', 'nurture')
         and erased_at is null and blanked_at is null;
      if found then
        v_restored := v_restored + 1;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_row.tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
                jsonb_build_object('stage', v_lead.stage, 'reason', null, 'by', v_user, 'source', 'reply_undone'));
      end if;
    end loop;
  end if;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'reach_out.reply_undone', 'lead', 'lead', v_row.lead_id,
          jsonb_build_object('message_id', v_row.message_id, 'lead_id', v_row.lead_id, 'by', v_user,
                             'consent', v_consent, 'suppressions', v_deleted, 'leads', v_restored,
                             'another_no', v_others > 0));

  return jsonb_build_object(
    'ok', true,
    'restored', jsonb_build_object('consent', v_consent, 'suppressions', v_deleted, 'leads', v_restored),
    'kept', jsonb_build_object('suppressions', v_kept, 'another_no', v_others > 0));
end $$;
revoke execute on function public.reach_out_reply_undo(uuid) from public, anon;
grant execute on function public.reach_out_reply_undo(uuid) to authenticated;
comment on function public.reach_out_reply_undo(uuid) is
  'Read as no · undo (Reach out Part 5, G10, N4): an acting member takes back a reply read as no within seven days, while the person''s email consent is still that reply''s no. Marks it undone, deletes each never-again row it added that nothing else holds, and, once none of the person''s noes stands, puts their answer back (set_email_marketing reply_undone) and their leads back to the stage before. Refusals are raised in words (reach_out_reply_undoable''s keys). Answers {ok, restored: {consent, suppressions, leads}, kept: {suppressions, another_no}}.';
