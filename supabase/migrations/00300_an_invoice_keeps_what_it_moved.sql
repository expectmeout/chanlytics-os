-- 00300 · An invoice keeps what it moved.
--
-- The Reports lenses spec, K8. The Stripe webhook keeps each delivery once, by Stripe's event id, in billing_events, and
-- said nothing of what an invoice event was for: the amount of a paid invoice went into one yes-or-no (did the workspace
-- pay anything, last_paid_at) and was dropped. The operator's margin, billing mix and failed payments need it, so the
-- event's own row now keeps what the invoice moved and in what currency: the amount paid on invoice.paid, the amount due on
-- invoice.payment_failed (the event's type, already on the row, says which), by billing_event_keep_amount, once, the first
-- answer standing. A real zero is kept (a trial's first invoice moved nothing). A value that is not an amount or a
-- three-letter lowercase currency is not written, and the columns themselves refuse one written any other way.
--
-- The edge calls the door after the claim and after the statements that were already there (the payment's mark, the
-- partner's share), as one more statement of its own, and never in the claim's own insert: an edge ahead of this migration
-- that named a new column there would fail every Stripe claim until the migration was applied. Either deploy order works:
-- an edge ahead of it loses the new fact (a warning in its log) and applies everything else; a migration ahead of the edge
-- changes nothing anyone reads. Nothing is backfilled: a row from before reads null.
--
-- The lock. Two nullable columns are added to billing_events, which the Stripe door writes once per delivery: the guard of
-- 00259 is set, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

alter table public.billing_events add column if not exists amount_cents integer
  check (amount_cents is null or amount_cents >= 0);
alter table public.billing_events add column if not exists currency text
  check (currency is null or currency ~ '^[a-z]{3}$');
comment on column public.billing_events.amount_cents is
  'What the invoice behind this event moved, in the smallest unit of its currency (K8): the amount paid on invoice.paid, the amount due on invoice.payment_failed. Kept once by billing_event_keep_amount; null for an event from before 00300 or that named no amount. A real zero is a zero.';
comment on column public.billing_events.currency is
  'The invoice''s currency as Stripe spells it, three lowercase letters (K8); null where amount_cents is.';

create or replace function public.billing_event_keep_amount(p_id text, p_amount_cents integer, p_currency text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount_cents is null or p_amount_cents < 0 or p_currency is null or p_currency !~ '^[a-z]{3}$' then
    return false;
  end if;
  update public.billing_events
     set amount_cents = p_amount_cents, currency = p_currency
   where id = p_id and amount_cents is null;
  return found;
end $$;
revoke all on function public.billing_event_keep_amount(text, integer, text) from public, anon, authenticated;
grant execute on function public.billing_event_keep_amount(text, integer, text) to service_role;
comment on function public.billing_event_keep_amount(text, integer, text) is
  'Keeps what an invoice event moved on its ledger row (K8), once: the first answer stands. False, writing nothing, for an amount that is null or negative or a currency that is not three lowercase letters, and for an event that already has an amount or is not on record. The Stripe door''s, best-effort, after the claim (apps/edge/lib/billing/invoice-amount.ts noteInvoiceAmount).';
