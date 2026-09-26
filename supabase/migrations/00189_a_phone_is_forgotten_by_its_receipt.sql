-- 00189 · A phone is forgotten by its receipt.
--
-- Expo's push service answers a send with a TICKET, which says only that the
-- service took the message; whether Apple or Google took it, or answered that
-- the phone is gone (DeviceNotRegistered), arrives in a RECEIPT the sender
-- must ask for later, and Expo asks for fifteen minutes. A push_send job
-- (00162) therefore leaves one push_receipts job behind it, due a quarter of
-- an hour on, carrying the tickets it was given; that job reads the receipts
-- and forgets every phone answered gone. The ledger learns the kind here.

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts'));
