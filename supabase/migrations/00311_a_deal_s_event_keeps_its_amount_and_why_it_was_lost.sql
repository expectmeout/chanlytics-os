-- 00311 · A deal's event keeps its amount and why it was lost.
--
-- The Reports lenses spec, K6. Each deal.* event said the stage and who (00156, 00160) and nothing of what the deal was
-- worth or why it was passed on, and both are overwritten on the row by the next edit, so "why they passed" and stage
-- movement by value could not be read later. One trigger on the ledger completes the event with the deal's amount_cents
-- and lost_reason as the deal holds them at that move (deal_record updates the row before it writes the event, and
-- set_person_proposal inserts the deal before it writes its own, so the row is the move's): the writers are not restated,
-- and decision 0005's payment writer will be held too.
--
-- What an amount is. A key is written only when the deal has the thing, and absent is never written as null or as 0. A
-- deal with no amount (null) says no amount_cents. A stored 0 is an amount: that is how the Deals page reads one
-- (amountWords says "$0", amountTotalsWords and the Pipeline's value ask only whether it is null, the door and the API
-- accept 0), so a deal that holds 0 says amount_cents: 0. A reason is a pass's alone (deal_record clears it on any other
-- stage), so only a deal.lost event for a deal passed with one says lost_reason. A writer's own key stands. Only those two
-- keys: per and currency are not carried (a reader joins deals for them), and never the note or the link. A number and a
-- closed code are no words, so the erasure scrub has nothing to reach (decision 0004 kept words out for that). Decisions
-- 0004 and 0008 say the shape as of then and stay as written. No backfill: an older event has neither key.
--
-- It reads one row of deals and writes only the event it is part of, and traps its own failure: a lookup that cannot be
-- made is a warning and the event lands as written. It fires for a deal.proposed, deal.won, deal.lost or deal.ended row
-- about a deal only (the WHEN), so no other event enters the function. 00310's trigger on this ledger fires for lead.stage
-- only: no event enters both, each reads its own table and writes keys the other never reads, so the order they fire in
-- cannot matter. Either deploy order works (nothing reads the keys yet).
--
-- The lock. As 00310: a trigger on the events ledger locks its partitions until commit, one table, one wait, the 3 s guard
-- of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. This file reads deals but
-- takes no lock on it. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.events_complete_deal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal record;
begin
  if jsonb_typeof(NEW.data) = 'object' then
    select d.amount_cents, d.lost_reason into v_deal
      from public.deals d
     where d.id = NEW.subject_id and d.tenant_id = NEW.tenant_id;
    if found then
      -- strip_nulls drops what the deal does not have (never 0: an amount of 0 is kept); the writer's own keys come last, so they stand.
      NEW.data := jsonb_strip_nulls(jsonb_build_object('amount_cents', v_deal.amount_cents, 'lost_reason', v_deal.lost_reason))
                  || NEW.data;
    end if;
  end if;
  return NEW;
exception when others then
  raise warning 'events_complete_deal: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.events_complete_deal() from public, anon, authenticated;
comment on function public.events_complete_deal() is
  'Adds amount_cents and lost_reason, as the deal holds them, to a deal.* event (K6): only what the deal has (an amount of 0 is an amount), a writer''s own key standing, never a note, a link, a per or a currency. Never fails the insert: a failure is a warning.';

create or replace trigger events_complete_deal before insert on public.events
  for each row
  when (new.kind in ('deal.proposed', 'deal.won', 'deal.lost', 'deal.ended') and new.subject_type = 'deal' and new.subject_id is not null)
  execute function public.events_complete_deal();
