-- 00471 · A member writes only where a policy says they may.
--
-- Row security is the floor: a write a member may make is a grant AND a policy for its command. Twenty-nine tables and
-- one view still granted `authenticated` an INSERT, UPDATE or DELETE that no policy admits, most of them left by the
-- early `grant all` 00354 trimmed. Row security refused every one of those writes, so nothing reached a row, but the
-- floor rested on the absence of a policy: one later policy written `for all`, or `using (true)` for a read, would have
-- opened a write nobody chose. Read on production on 22 October 2026 (the Supabase layer review).
--
-- Each privilege is taken back where no policy for its command names a member. What a member does today is untouched:
-- every write a session makes is to a table that has its policy (conversations, escalations, messages, segments,
-- segment_members, sequences, sequence_steps, sequence_sends, policies, decisions, tenants, tenant_config, the Ask
-- tables, capability_activations, idempotency_keys), and every other write goes through a definer door or the service
-- role, which keep everything. A forbidden UPDATE or DELETE used to answer success with no rows; it now answers
-- permission denied, which no code relies on (read on main 697280356: no session-client write names these tables).
-- A view is read and never written: lead_searches_view keeps SELECT alone.
--
-- database/privileges.db.test.mjs now holds it both ways: every policy has its grant (policy_ungranted), and every
-- write grant has its policy (session_write_unpoliced). Either deploy order. Re-runnable.

set local lock_timeout = '3s';

-- No policy lets a member insert, update or delete these: their rows are written by doors and by the service role.
revoke insert, update, delete on
  public.billing_accounts,
  public.business_records,
  public.calls,
  public.contact_identities,
  public.contacts,
  public.events,
  public.google_connections,
  public.google_listing_days,
  public.google_listings,
  public.google_reviews,
  public.invitations,
  public.lines,
  public.mailboxes,
  public.memberships,
  public.notification_marks,
  public.notification_reads,
  public.notifications,
  public.profiles,
  public.sending_domains,
  public.templates,
  public.tenant_channels
from authenticated;

-- A member updates these through their policies, and never makes or removes one.
revoke insert, delete on
  public.conversations,
  public.escalations,
  public.tenant_config,
  public.tenants
from authenticated;

-- A decision is written once, by its maker, and never changed or taken back: an undo is a decision of its own.
revoke update, delete on public.decisions from authenticated;

-- A message is withdrawn by a door (member_withdraw_message), a batch stopped by one (sequence_batch_cancel).
revoke delete on public.messages, public.sequence_batches from authenticated;

-- A person is put on a list or taken off it; their row on it is never changed.
revoke update on public.segment_members from authenticated;

-- The view is a read.
revoke insert, update, delete on public.lead_searches_view from authenticated;
