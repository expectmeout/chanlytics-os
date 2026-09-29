-- 00253 · A person's rows are indexed by the person.
--
-- people_list reads each person's channels, thread, escalations and deal by the person alone (00170 :340-366,
-- :421-430). People, the exports, Reports, the audiences and the playbook sweep read it for everyone in a workspace,
-- and a person's page for one. None of the four tables had an index that starts with the person. contact_identities is keyed
-- (tenant_id, channel, external_id) (00002 :60); conversations (tenant_id, contact_id) (00002 :77) and deals
-- (tenant_id, contact_id, created_at) (00156 :60) start with the workspace, which these reads leave open; and an
-- escalation is found by its thread only while it is open (00004 :19). Postgres 17 cannot seek an index by its
-- second column, and a member's RLS policy, tenant_id in (...), is a filter rather than a key. So each read scanned
-- the whole platform's table, once per person: the list cost its people times every workspace's rows.
--
-- Modelled on Postgres 16 with 300 workspaces and 91,700 people: the six reads for a workspace of 2,000 people took
-- 53.1 s as the service role and 62.6 s as a member, each of them a sequential scan per person. With these four
-- indexes they took 48 ms and 49 ms. The same rows come back; only how they are found changes.
--
-- Each index is built under a SHARE lock on its table: reads go on, and writes to the table wait while it builds.
-- conversations is written with every message, so the file sets the same three-second guard 00140 and 00142 set:
-- behind a long transaction it fails, rather than queueing every write behind it, and is run again in a quiet
-- minute. SET LOCAL, since the Supabase CLI applies each file inside one transaction; applied any other way, the
-- block below says so.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

-- The channels a person has been reached on (people_list's ids).
create index if not exists contact_identities_contact on public.contact_identities (contact_id);

-- A person's thread: how many, whether one needs a person, the latest (cvs, lc), and the way to their escalations.
create index if not exists conversations_contact on public.conversations (contact_id);

-- Every escalation on a thread, resolved or open (esc); escalations_one_open (00004 :19) still finds the open one.
create index if not exists escalations_conversation on public.escalations (conversation_id);

-- A person's deals, the one the row shows (dl).
create index if not exists deals_person on public.deals (contact_id);
