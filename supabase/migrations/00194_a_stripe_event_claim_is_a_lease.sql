-- 00194 · A Stripe event's claim is a lease.
--
-- The webhook keeps each delivery by Stripe's event id BEFORE it applies it
-- (00073), so two deliveries of one event cannot both act. The row said
-- nothing about whether the apply then happened: a delivery killed between
-- its claim and its apply -- the function's thirty seconds up, a deploy --
-- left a row that read as done, and every retry Stripe sent for the next
-- three days was answered "duplicate". A pause, a failed payment, a
-- cancellation: lost for good. A claim now says what it is:
--
--   claimed   a delivery holds it until lease_until (two minutes from its
--             claim: the edge's BILLING_EVENT_LEASE_MS, longer than the
--             function's whole budget). A retry inside the lease is told
--             to come back (503: a 2xx would end Stripe's retries, and a
--             dead delivery's change with them); a retry after it takes
--             the claim over, under a lease of its own, and applies the
--             event.
--   applied   the change was made. A duplicate for ever.
--
-- Every move is a compare-and-swap on the state it expects, and counted,
-- since a stale UPDATE does not raise (apps/edge/lib/billing.ts keepEvent,
-- completeEvent, forgetEvent).
--
-- The default is 'applied', which is what every row on record means: the
-- edge before this kept a row only once it had acted on it, and gave a
-- failed one back. Either deploy order: an edge that predates this keeps
-- writing rows that read right, and an edge ahead of it fails its claim
-- loudly -- the column it names is not there -- and applies nothing until
-- this is in.

alter table public.billing_events add column if not exists state text not null default 'applied';
alter table public.billing_events add column if not exists lease_until timestamptz;
alter table public.billing_events drop constraint if exists billing_events_state_check;
alter table public.billing_events add constraint billing_events_state_check
  check (state in ('claimed', 'applied'));
