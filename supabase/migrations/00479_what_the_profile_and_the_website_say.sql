-- 00479 · What the profile and the website say (decision 0073, R10 and R17).
--
--   business_reads   One row per workspace and source (google_profile, website): what was read there for the owner to
--                    check at the first run's Check: the services and their prices, the hours and the days closed, the
--                    booking rules, the questions it answers, the words it says of itself; where it was read from, when,
--                    and why not where it could not be. Nothing here reaches a customer: the owner taps what is right into
--                    the record (prices always confirmed there, never assumed). Members read their workspace's; the edge
--                    writes on the service role.
--   website_read     A job kind: the business's website read (its home page and up to two pages it links to, through the
--                    public fetcher's address rule), its facts drawn out by the model into business_reads. Lane 1: an
--                    owner is waiting at Check for what it finds.
--   ai_usage.purpose website_read   the model's reading of the site (contracts MODEL_PURPOSES), counted as every
--                    call is.
--
-- Re-runnable throughout.

set local lock_timeout = '3s';

create table if not exists public.business_reads (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  source     text not null check (source in ('google_profile', 'website')),
  -- {services: [{name, price_note?, duration_min?}], hours?, closed?: [{date, until?}], rules?: [text], answers?:
  --  [{q, a}], description?, categories?: [text]}: contracts setup/business-reads.ts BusinessReadFacts.
  facts      jsonb not null default '{}'::jsonb check (jsonb_typeof(facts) = 'object'),
  -- The address read (the website) or the location (locations/…).
  read_from  text check (read_from is null or char_length(read_from) <= 2000),
  read_at    timestamptz not null default now(),
  -- Why it could not be read, said on Check; null when it was.
  error      text check (error is null or char_length(error) <= 300),
  primary key (tenant_id, source)
);
comment on table public.business_reads is
  'What the Business Profile and the website say, one row per workspace and source (decision 0073, R10, R17): services and prices, hours and days closed, booking rules, questions answered, words, for the owner to check at Check. Nothing here reaches a customer until the owner taps it into the record. Members read their workspace''s; the edge writes.';

alter table public.business_reads enable row level security;
drop policy if exists business_reads_member_select on public.business_reads;
create policy business_reads_member_select on public.business_reads for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.business_reads from anon, authenticated;
grant select on public.business_reads to authenticated;
grant select, insert, update, delete on public.business_reads to service_role;

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'booking_read', 'inbound_answer', 'history_import', 'website_read'));

alter table public.jobs alter column lane set expression as (
  case
    when kind = 'inbound_answer' then 0
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read', 'booking_read', 'website_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts', 'history_import') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
);
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read, a booking notice read, a website read for Check, 00479), 2 bulk (a history brought in, 00478, among it). Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00334), a text''s answer in a reply''s (inbound_answer, 00347); null for a kind the case does not name, claimed last.';

-- contracts MODEL_PURPOSES: 00476's set, with the website's reading last.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read'));
