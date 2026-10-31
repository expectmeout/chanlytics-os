-- 00495 · A mailbox reads each sender once, and brings people, not programs (decision 0080).
--
-- A connected mailbox judged each email alone, by headers a program may leave out, and a person a notice had made
-- counted as one the workspace knows: 19 programs came into one workspace as people (30 Oct 2026). A sender is now
-- judged once and the judgement kept, and what the mailbox leaves says why in more words:
--
--   mailbox_sender_reads      what Chanlytics read a sender to be, one row a sender: someone asking about the
--                             business's services (inquiry), someone writing as a person (person), someone selling to
--                             the business (pitch), a program's mail (notice), or a program passing on someone's message
--                             (relayed); in under twelve words what they wanted, never a name. Members read their
--                             workspace's; the edge's sync and import write it as the service role. What the workspace
--                             said of a sender (00483 mailbox_senders) always comes first.
--   mailbox_left.why          takes service (sent through a mailing service with nobody behind it), pitch, notice and
--                             relayed (the reading's), and others_said (three or more other workspaces' owners said its
--                             domain is automated).
--   ai_usage.purpose          takes sender_read: the reading, Haiku's.
--   sender_domain_said_automated
--                             the service role's: whether three or more other workspaces' owners said a domain, or an
--                             address at it, is automated. Their own words only (set_by), never a reading; a yes or a
--                             no, never who.
--   mailbox_senders_on_erase  as 00483 wrote it, and a person erased takes their reading with them.
--
-- Deploy order: this first; an edge without the code that reads and writes these sorts as before. Re-runnable.

set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------------------------- 1. a sender, read -- */
create table if not exists public.mailbox_sender_reads (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  address   text not null check (address = lower(btrim(address)) and char_length(address) between 3 and 254
                                 and address !~ '[[:space:]<>]'),
  kind      text not null check (kind in ('inquiry', 'person', 'pitch', 'notice', 'relayed')),
  about     text check (about is null or char_length(about) <= 120),
  read_at   timestamptz not null default now(),
  primary key (tenant_id, address)
);
comment on table public.mailbox_sender_reads is
  'What Chanlytics read a sender of mail to a connected mailbox to be, one row a sender (00495, decision 0080): inquiry or person (their mail comes in), pitch, notice or relayed (it stays in the mailbox), and in under twelve words what they wanted. What the workspace said (mailbox_senders) comes first. Members read; the edge writes as the service role.';

alter table public.mailbox_sender_reads enable row level security;
drop policy if exists mailbox_sender_reads_member_select on public.mailbox_sender_reads;
create policy mailbox_sender_reads_member_select on public.mailbox_sender_reads for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.mailbox_sender_reads from anon, authenticated;
grant select on public.mailbox_sender_reads to authenticated;
grant select, insert, update, delete on public.mailbox_sender_reads to service_role;

/* ------------------------------------------------------------------------------------ 2. why the mail was left -- */
alter table public.mailbox_left drop constraint if exists mailbox_left_why_check;
alter table public.mailbox_left add constraint mailbox_left_why_check
  check (why in ('automated', 'auto_reply', 'report', 'booking_notice', 'forwarding_confirmation', 'gmail_tab',
                 'updates', 'said', 'service', 'pitch', 'notice', 'relayed', 'others_said'));

/* -------------------------------------------------------------------------------------------- 3. the reading's key -- */
-- contracts MODEL_PURPOSES: 00479's set, with the sender's reading last.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read'));

/* ------------------------------------------------------------------------------------- 4. what others said of it -- */
create or replace function public.sender_domain_said_automated(p_tenant_id uuid, p_domain text)
returns boolean
language sql
stable
set search_path = public
as $$
  select count(distinct s.tenant_id) >= 3
    from public.mailbox_senders s
   where s.verdict = 'automated'
     and s.set_by is not null
     and s.tenant_id <> p_tenant_id
     and (s.sender = lower(btrim(p_domain)) or split_part(s.sender, '@', 2) = lower(btrim(p_domain)));
$$;
revoke all on function public.sender_domain_said_automated(uuid, text) from public, anon, authenticated;
grant execute on function public.sender_domain_said_automated(uuid, text) to service_role;
comment on function public.sender_domain_said_automated(uuid, text) is
  'Whether three or more workspaces other than p_tenant_id had an owner say the domain p_domain, or an address at it, is automated (00495, decision 0080): their own words (mailbox_senders.set_by), never a reading; a yes or a no, never which workspaces. The service role''s: the edge''s sorting of a stranger''s mail. A free-mail domain is never asked (contracts isFreeMail).';

/* ------------------------------------------------------------------------------------------------ 5. the erasure -- */
-- As 00483 wrote it, with the reading of the person's address taken too.
create or replace function public.mailbox_senders_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.erased_at is null and new.erased_at is not null and old.email is not null then
    delete from public.mailbox_left where tenant_id = new.tenant_id and address = lower(old.email);
    delete from public.mailbox_senders
     where tenant_id = new.tenant_id and sender = lower(old.email) and verdict = 'person';
    delete from public.mailbox_sender_reads where tenant_id = new.tenant_id and address = lower(old.email);
  end if;
  return null;
end $$;
revoke all on function public.mailbox_senders_on_erase() from public, anon, authenticated;
grant execute on function public.mailbox_senders_on_erase() to service_role;
