-- 00425 · A mailbox's threads are found by their id (decision 0056).
--
-- The sync of a connected mailbox asks which of the threads that changed hold an email this workspace sent
-- (00424 mailbox_threads_known), by the provider's thread id the wire keeps on the email's meta.email.thread_id. This
-- is that question's index: only emails sent from a mailbox carry a thread id, so it holds none of the rest.
--
-- Built concurrently, so writes to messages never wait for it: this file runs on its own, outside a transaction (the
-- runbook's "Migrations": push it alone, then ask production for an invalid index). Re-runnable.

create index concurrently if not exists messages_email_thread
  on public.messages (tenant_id, (meta->'email'->>'thread_id'))
  where channel = 'email' and direction = 'outbound' and meta->'email'->>'thread_id' is not null;
