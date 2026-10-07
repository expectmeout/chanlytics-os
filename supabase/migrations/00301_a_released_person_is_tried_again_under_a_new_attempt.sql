-- 00301 · A released person is tried again under a new attempt.
--
-- Four fixes the Campaigns code review of 4 Oct 2026 found in what 00296-00299 left (Claude Video
-- docs/2026-10-04-campaigns-code-review.md: findings 2 and 6, and two of its database habits). Each is additive, and
-- code that ships before this migration reads a database without it as it read one before.
--
--   broadcast_recipients.attempt   how many times this person was claimed and given back (finding 6). A broadcast's
--                                  email is written queued under an id derived from the run, the person and how often
--                                  the run had waited; a clean batch starts its count again, so a person released at
--                                  the first wait could come back under the id of their own withdrawn email, find it
--                                  canceled, and be skipped as send_failed having never been sent. The guard that owns
--                                  the release (broadcast_recipients_guard, 00282) now counts it: every move from a
--                                  claim back to queued adds one, in the same statement, so two releases cannot read
--                                  the same count. A run resumed after a kill releases nobody and keeps the id, which
--                                  is how it finds the email it was sending. As reach-out's sends are named by their
--                                  attempt (core reach-out-ids.ts).
--   email_offer_counts             the gates' bounces are the hard ones (finding 2), as the cold domain's watch counts
--                                  them (00179): a full mailbox or a greylisting server is the provider's 'bounced'
--                                  with kind 'transient', and says nothing about the list the offers went to. Counted
--                                  before, a run of full mailboxes could pause a workspace's offers by email.
--   campaign_month_sent,           the month is the workspace's, read through safe_zone (00245) as the sweeps read it:
--   reach_out_month_sent           a zone Intl accepts and Postgres does not know raised here, and the allowance's read
--                                  failing holds every email and text of that workspace's campaigns. A blank zone is
--                                  still New York's (contracts DEFAULT_TIMEZONE); an unknown one is UTC, as the sweeps.
--   has_relationship               a call counts when it connected and has a start, as People's last_inbound_call_at
--                                  (max(started_at) over the connected inbound calls, 00299) and contracts'
--                                  relationshipOnRecord read it: a connected call with no start was a relationship to
--                                  the send door and none on the person's row.

set local lock_timeout = '3s';

/* ------------------------------------------------------------- the attempt -- */

-- A constant default: the column is added without rewriting the table.
alter table public.broadcast_recipients add column if not exists attempt integer not null default 0;
comment on column public.broadcast_recipients.attempt is
  'How many times this person was claimed and given back (throttled, not_taken): the guard adds one on every release. A broadcast''s email to them is named by it (core broadcast-channels.ts), so a person tried again is sent under a new id and a resumed run, which releases nobody, finds the email it was sending (00301).';

create or replace function public.broadcast_recipients_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    -- The claim, settled: the one failed that is not a verdict.
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state in ('sent', 'skipped') then
      return NEW;
    end if;
    -- Or released, when WhatsApp did not take the send -- too many, too fast, or never reached at all: nothing was
    -- taken, and the release says which. Its next try is a new attempt (00301).
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state = 'queued'
       and NEW.reason in ('throttled', 'not_taken') then
      NEW.attempt := OLD.attempt + 1;
      return NEW;
    end if;
    if OLD.state in ('sent', 'skipped', 'failed') then
      raise exception 'broadcast_recipients.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    -- From queued the CHECK admits only sent, skipped and failed.
  end if;
  return NEW;
end $$;
comment on function public.broadcast_recipients_guard() is
  'queued -> sent|skipped|failed, once; a claim (failed, outcome_unknown) -> sent|skipped, or back to queued as throttled or not_taken when WhatsApp did not take it, which counts a new attempt (00301); sent, skipped and other failures are final. A same-state update is not a move.';

/* ------------------------------------------------------------- the gates -- */

create or replace function public.email_offer_counts(p_tenant_id uuid, p_host text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = lower(p_host)
       and m.created_at >= now() - interval '90 days'
       and m.created_at > coalesce(
             (select b.offers_resumed_at from public.mailboxes b where b.tenant_id = p_tenant_id),
             '-infinity'::timestamptz)
       and public.email_left(m.status, m.error)
  ), complaint_window as (
    select o.* from ours o order by o.created_at desc limit 1000
  ), bounce_window as (
    select o.* from ours o order by o.created_at desc limit 500
  )
  select jsonb_build_object(
    'complaint_sample', (select count(*) from complaint_window),
    'complaints', (select count(*) from complaint_window where meta->'email' ? 'complained_at'),
    'bounce_sample', (select count(*) from bounce_window),
    -- A permanent bounce only: a full mailbox or a greylisting server says nothing about the list (00179).
    'bounces', (select count(*) from bounce_window where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'))
$$;
revoke execute on function public.email_offer_counts(uuid, text) from public, anon, authenticated;
grant execute on function public.email_offer_counts(uuid, text) to service_role;
comment on function public.email_offer_counts(uuid, text) is
  'What the gates on offers by email are judged by (contracts'' OFFER_GATES): of the emails that left from this host in the last 90 days and since the workspace''s last resume (mailboxes.offers_resumed_at), the last 1,000 (complaint_sample) and the complaints among them, and the last 500 (bounce_sample) and the hard (permanent) bounces among them (00301). Service role only.';

/* ------------------------------------------------------------- the months -- */

create or replace function public.campaign_month_sent(p_tenant_id uuid, p_channel text, p_at timestamptz default now())
returns int
language sql
stable
security definer
set search_path = public
as $$
  with zone as (
    select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'broadcast' and m.channel = p_channel and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;

create or replace function public.reach_out_month_sent(p_tenant_id uuid, p_at timestamptz)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with zone as (
    select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'reach_out' and m.channel = 'email' and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;

/* ------------------------------------------------------------- the relationship -- */

create or replace function public.has_relationship(c public.contacts)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
           -- They wrote: a message of theirs the customer could see or say, with words in it and a moment (people_list's
           -- last_inbound_at: message_moment, 00259), and the words a person's own: not an automatic reply or a list's mail.
           select 1
             from public.messages m
            cross join lateral public.message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
            where m.tenant_id = c.tenant_id and m.contact_id = c.id
              and m.direction = 'inbound' and e.spoken and e.at is not null and m.body is not null
              and public.message_is_a_persons_words(m.meta))
      -- They called: a call they placed that connected, with a start (last_inbound_call_at, max(started_at), 00301).
      or exists (
           select 1 from public.calls k
            where k.contact_id = c.id and k.direction = 'inbound' and k.status <> 'not_connected'
              and k.started_at is not null)
      -- They have a deal, in any stage (deal_id).
      or exists (select 1 from public.deals d where d.contact_id = c.id)
$$;
