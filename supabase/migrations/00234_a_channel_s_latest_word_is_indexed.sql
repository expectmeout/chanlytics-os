-- 00234 · A channel's latest word is indexed.
--
-- GET channels says when each channel last heard from a customer (apps/dashboard/src/server/readers/channels.ts). For
-- WhatsApp that is the newest inbound message by the provider's time: order by channel_ts desc nulls last, limit 1.
-- No index on messages kept that order. The ones that start with the workspace are ordered by created_at
-- (messages_tenant_created, 00016 :53; messages_tenant_inbound_recent, 00094 :177), so the read went through every
-- inbound message the workspace ever had and sorted them for the newest. Live re-reads it on every change to a call,
-- a transcript turn among them (legacy-bridge/surface-data.ts, liveOverride), and Settings, Broadcasts and Playbooks
-- on every load.
--
-- Modelled on Postgres 16, for a workspace with 40,000 inbound WhatsApp messages: the read took 15 to 24 ms and 1,044
-- buffers, its whole inbound history, and with this index 2 ms and 5 buffers, the same row. As written it grew with the
-- workspace's history; now it is one probe of the index however long that is.
--
-- The index holds inbound messages only, so a send writes nothing more to it. It is built under a SHARE lock on
-- messages: reads go on, and new messages wait while it builds. So the file sets the three-second guard 00140, 00142
-- and 00187 set: behind a long transaction it fails, rather than queueing every message behind it, and is run again
-- in a quiet minute. SET LOCAL, since the Supabase CLI applies each file inside one transaction; applied any other
-- way, the block below says so.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

-- A workspace's newest inbound word on a channel, by when the customer sent it (GET channels' last heard).
create index if not exists messages_inbound_latest
  on public.messages (tenant_id, channel, channel_ts desc nulls last)
  where direction = 'inbound';
