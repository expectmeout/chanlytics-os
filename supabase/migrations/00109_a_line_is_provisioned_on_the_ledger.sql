-- 00109 · A line is provisioned on the ledger.
--
-- Buying a line ran the whole saga inside the request that asked for it: up
-- to fourteen provider calls in a sixty-second function whose caller may
-- close the tab, and a saga the function ceiling killed waited five minutes
-- for the lines sweep. The saga now runs as a job: claimed under a lease
-- within ten seconds, resumed by the heartbeat when a worker dies, tried up
-- to the cap (MAX_ATTEMPTS), receipts per step so nothing is repeated, an
-- owned number looked up before one is bought so a dead worker never buys
-- twice. The kind is the one word this migration adds; the handler is
-- packages/jobs (line_provision) and the saga stays on the edge, injected.
--
-- Phase two B, Task 4 (docs/plans/2026-09-11-phase-two-b-paid-activation.md).

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'blob_thread_erase', 'line_provision'));
