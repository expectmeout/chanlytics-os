-- 00382 · A billing reading and the workspace's switch are one write.
--
-- A subscription reading (a Stripe event, a sync, a resume) was applied in two statements on the edge: the billing row
-- under a compare-and-set (the status and updated_at the reading was planned against), then tenants.status when the
-- reading turned the receptionist on or off. A failure between the two left a workspace whose row said paid and whose
-- switch said paused, until Stripe's next event about it, or paid and answering with nothing paid. The row is the
-- edge's alone (lib/billing/billing.ts), and it wrote it in five places: the reading, a customer's id before Checkout,
-- a customer Stripe deleted, a payment's stamp and a failure's. Every one is this door's now, so the row has one
-- writer (decision 0031, invariant 1).
--
--   billing_apply(tenant, row, expect, tenant_status)
--                   the row's columns a reading or a stamp writes (p_row: an object of those columns alone; one it may
--                   not write is refused), written only if the row is still what the caller planned against (p_expect:
--                   {status, updated_at} for a reading; {stripe_customer_id} for a customer Stripe deleted, which
--                   forgets only the row's own customer; null for a write nothing races: a customer's id, a stamp),
--                   and the switch
--                   (p_tenant_status, null when it does not move), in one transaction. True when the row was written,
--                   false when it was not: another reading won, or there is no row. The switch is tenants' own CHECK's
--                   to refuse, and a refusal takes the row's write back with it.
--
-- The row is locked before it is read, and the columns are laid over the row as the lock found it: a stamp that waits
-- behind a reading writes over the reading, never over the row before it (an UPDATE that read its values from a second
-- scan of the table would have written the older status back over the newer one under READ COMMITTED).
--
-- The rules stay contracts' (planBilling: what a reading means for the row and the switch, and whether a bell rings)
-- and the edge's (the bell, the event, a plan a workspace nobody is in any more is ended). The service role's alone.
--
-- Deploy order: this migration first. An edge that calls a door the database does not hold answers the event with an
-- error and changes nothing, and Stripe delivers it again. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.billing_apply(
  p_tenant_id uuid,
  p_row jsonb,
  p_expect jsonb default null,
  p_tenant_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- What a reading (contracts planBilling) or a stamp writes, and nothing else: never the workspace, its mode or its clock.
  v_columns text[] := array['stripe_customer_id', 'stripe_subscription_id', 'status', 'price_id',
                            'current_period_end', 'trial_end', 'cancel_at', 'cancel_at_period_end',
                            'card_brand', 'card_last4', 'last_payment_failed_at', 'last_paid_at'];
  v_stray text;
  v_row   public.billing_accounts;
  v_next  public.billing_accounts;
begin
  if p_tenant_id is null or jsonb_typeof(p_row) is distinct from 'object' then
    raise exception 'billing_apply: a row is written for a workspace' using errcode = '22004';
  end if;
  select k into v_stray from jsonb_object_keys(p_row) k where k <> all (v_columns) limit 1;
  if v_stray is not null then
    raise exception 'billing_apply: % is not a column a reading writes', v_stray using errcode = '22023';
  end if;
  if p_expect is not null
     and (jsonb_typeof(p_expect) <> 'object'
          or not ((p_expect ? 'status' and p_expect ? 'updated_at' and not p_expect ? 'stripe_customer_id'
                   and p_expect->>'status' is not null and p_expect->>'updated_at' is not null)
                  or (p_expect ? 'stripe_customer_id' and not p_expect ? 'status' and not p_expect ? 'updated_at'
                      and p_expect->>'stripe_customer_id' is not null))) then
    raise exception 'billing_apply: a reading is planned against a status and an updated_at, or a customer'
      using errcode = '22023';
  end if;
  -- The row, locked: a reading or a stamp that arrives meanwhile waits, then reads what this one wrote.
  select b.* into v_row from public.billing_accounts b where b.tenant_id = p_tenant_id for update;
  if not found then
    return false;
  end if;
  -- Still what the caller planned against, or another reading won and nothing moves.
  if p_expect ? 'status'
     and (v_row.status is distinct from p_expect->>'status'
          or v_row.updated_at is distinct from (p_expect->>'updated_at')::timestamptz) then
    return false;
  end if;
  if p_expect ? 'stripe_customer_id' and v_row.stripe_customer_id is distinct from p_expect->>'stripe_customer_id' then
    return false;
  end if;
  -- The given columns laid over the row the lock found; updated_at moves with the write (billing_accounts_moddatetime),
  -- so the next reading plans against this one.
  v_next := jsonb_populate_record(v_row, p_row);
  update public.billing_accounts b
     set stripe_customer_id     = v_next.stripe_customer_id,
         stripe_subscription_id = v_next.stripe_subscription_id,
         status                 = v_next.status,
         price_id               = v_next.price_id,
         current_period_end     = v_next.current_period_end,
         trial_end              = v_next.trial_end,
         cancel_at              = v_next.cancel_at,
         cancel_at_period_end   = v_next.cancel_at_period_end,
         card_brand             = v_next.card_brand,
         card_last4             = v_next.card_last4,
         last_payment_failed_at = v_next.last_payment_failed_at,
         last_paid_at           = v_next.last_paid_at
   where b.tenant_id = p_tenant_id;
  if p_tenant_status is not null then
    update public.tenants set status = p_tenant_status where id = p_tenant_id;
  end if;
  return true;
end $$;

revoke all on function public.billing_apply(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.billing_apply(uuid, jsonb, jsonb, text) to service_role;
comment on function public.billing_apply(uuid, jsonb, jsonb, text) is
  'The edge''s one writer of a workspace''s billing row (00382): the columns a reading or a stamp writes (p_row), written only if the row is still what the caller planned against (p_expect {status, updated_at} for a reading, {stripe_customer_id} for a deleted customer; null when nothing races the write), the row locked first and the columns laid over it as the lock found it, and the workspace''s switch (p_tenant_status, null when it does not move), in one transaction. True when written; false when another reading won or there is no row, and then nothing moved. The rules are contracts'' planBilling''s; the bell and the event are the edge''s, after. Service role only.';
