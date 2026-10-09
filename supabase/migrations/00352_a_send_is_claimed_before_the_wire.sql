-- 00352 · A queued message is claimed before it reaches the wire, and a job that spoke is never run again.
--
-- Two ways one person could be written to twice, each closed where the words leave.
--
-- A queued message (a member's reply, the receptionist's held draft, a reach-out's email) is sent by an outbound_send
-- job that read `status = 'queued'`, called the provider, and only then moved the row. Two jobs naming one message (a
-- schedule whose answer was lost and was made again, the reach-out writer's check-then-insert, a fresh job after a
-- wire that could not be bound beside one written by another path) each read `queued` and each sent; the second
-- found the row moved and wrote message.send_raced_cancel. Email has the provider's idempotency key; WhatsApp and a
-- text have none.
--
-- A text's answer (inbound_answer, 00347) is tried again after a throw and after a lease that ran out, because it is
-- safe to repeat until it reaches the wire. It was also repeated after: a runner killed between the provider's yes
-- and the reply's row (the model's turn can leave the send a few seconds of the function's sixty) came back on its
-- next claim with no reply naming the message, and texted the person again.
--
--   messages.sending_at   set by the one run that takes a queued row to the wire, in the statement that asks
--                         `status = 'queued' and sending_at is null` (db claimQueuedSend). A run that finds it set
--                         sends nothing. Cleared only by a run whose provider provably did not take the message, so
--                         the fresh job that follows may claim it (db releaseQueuedSend). A row left queued with it
--                         set is a send whose run died: the ledger settles it failed, outcome unknown, as before.
--   jobs.spoke_at         set by a job the moment before it puts words on a wire (jobs markSpoke). A job that spoke
--                         is judged as a kind that always speaks is (ledger verdictFor, retryWait): a second claim
--                         gives up, a throw is not retried, and the text is the deadman sweep's to hand to a person.
--
-- Neither column is granted to a session: messages' column grants name what a member may write, and jobs are the
-- service role's. claim_due_jobs returns the row whole (`returning j.*`), so the claim carries spoke_at unchanged.
--
-- Either deploy order: an edge before this migration never reads or writes either column; a database before the edge
-- answers PGRST204 for a column it does not hold, and the edge then sends as it did before. Re-runnable throughout.

set local lock_timeout = '3s';

alter table public.messages add column if not exists sending_at timestamptz;
comment on column public.messages.sending_at is
  'When the one run that took this queued row to the wire claimed it (00352): set where status = ''queued'' and it is null, so a second job naming the row sends nothing. Cleared only when the provider provably did not take the message. Null on a row no job sent (an inbound message, a direct answer, a broadcast''s).';

alter table public.jobs add column if not exists spoke_at timestamptz;
comment on column public.jobs.spoke_at is
  'When this job put words on a wire (00352): written the moment before the provider is called. A job that spoke is never run again, whatever its kind: a second claim gives up and a throw is not retried, because a second run could reach the person a second time. Null for a job that has not, and for a kind that speaks on every run (outbound_send, broadcast_send), which the ledger never runs twice anyway.';
