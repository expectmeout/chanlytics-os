# 0090 · The trial covers everything

**Status:** Decided by Ruben on 3 November 2026 ("all should be part of the trial which when all is proven and ready to
launch we will switch it to a trial on a pro tier which includes all features (lead generation is kept separate besides
what is included in the tier/trial)"), on the onboarding PRD of the same day. Built on the lane `onboarding/to-a-ten`
from main's `6c4da4d1d`, with migration 00512 (working number). Supersedes the rule of 25 September 2026 that a free
trial spends nothing (#1031), and decision 0073's item 12 (the first run's trial of none).

## Context

- `maySpend` admitted `active` alone, so a workspace on its trial could not buy a number, file for texting or search
  for leads, and the first run's checkout took no trial at all (`FIRST_RUN_TRIAL_DAYS = 0`) while Billing's took
  fourteen days: which door the owner came through changed the offer.
- The first run's Rehearse comes before Go live, so before any plan. Its call, its typed try, its review and its fix
  were `spend: true` routes, and every one refused a new workspace (`stripe`, `none`) with a 402, though the edge had
  ten free minutes ready for it (`rehearsalAllowance`'s `before_plan`). Production had no rehearsal at all.
- Nothing capped what a trial could cost: call minutes were recorded (`usage.voice_seconds`) and never counted against
  anything.

## Decision

1. **One spend rule, by kind.** `maySpend(mode, status, kind)` reads `SPEND_STATUSES`: a number, a texting registration
   and the finder may spend on `trialing` as on `active`; a rehearsal (the call, a typed try, a review, a fix) on
   `none` too, its ceiling the edge's own allowance and the day's model caps. `past_due` spends nothing; a direct
   workspace always may. Each route names its kind through its `spendWords` (`SpendWords.kind`), so the wrapper's
   `requireSpend` asks the right row. SQL restates the finder's row once (`billing_may_spend`, 00512).
2. **One trial.** `trialDaysFor({ hadSubscription, deploymentDays })`: the deployment's length (the edge's
   `BILLING_TRIAL_DAYS`, else contracts' 14) for a workspace that never had a subscription, else none. The edge's
   checkout and every screen that states a trial read it; `FIRST_RUN_TRIAL_DAYS` is gone. A checkout carries an
   idempotency key per workspace, door and ten minutes, so two presses are one session.
3. **What the trial includes:** `TRIAL_INCLUDES`: everything the plan does, up to 150 call minutes, 1,000 replies and
   50 leads. The leads are the finder's own cap while billing says `trialing` (`lead_allowance`, `lead_cap('trial_leads')`,
   `LEAD_TRIAL_ALLOWANCE`), held at every door that counts a lead: where a search or a list reserves, and at Keep, Put
   back and a check's commit after its round ended (00525). The minutes and the replies are read by the lines sweep every
   quarter hour (`trial_use`, `trialSpentOf`): at four fifths the owner is told once on the bell; at all of either the
   trial ends early and the plan starts (Billing's own start-now), and the owner is told why.
4. **At launch** the trial becomes the Pro tier's: a change of the price and these numbers, not of the code's shape.
   Tiers and prices stay decision 0037's, and Ruben's.

## Consequences

- Migration 00512: `billing_may_spend` admits a trial; `lead_spend_refusal`'s words follow `whyCannotSpend`;
  `lead_cap('trial_leads')`, `lead_allowance`, `lead_reserve` reading it; `trial_use`.
- Migration 00525: the doors that count a lead without a reservation read `lead_allowance` too: `lead_member_move`
  (Keep, Put back, a bulk Keep), refusing a trial in `lead_reserve`'s words, and `lead_check_commit` (Check again, the
  addressee chosen); a list's refusal (`lead_search_import`) says the trial's words on a trial.
- A trial's number costs the platform $1.15 a month until it is released; an unpaid end releases it once
  `LINE_RELEASE_AFTER_DAYS` is set (Ruben's switch; 30 is the PRD's suggestion), and the lines sweep's warnings run
  before that already.
- The card is still asked for at the start of the trial (Stripe Checkout's default): the guard against a trial taken
  only for its number.

## Not decided here

The tiers and their prices (0037), packs of leads (0010's L3), and a usage meter past the trial.
