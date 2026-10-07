# 0014 · A partner hears what changed, once a day

**Status:** built on the branch this note ships with (00209). Written against commit `4a6ceee0` (main, 27 September
2026, after #1159 merged 0012's P5). Where this note and the code disagree, the code wins.

## Context

A partner (0012) learns what their link earned only by opening Settings › Partner. The ledger moves without them:
the Stripe webhook writes a share when a workspace they brought pays, and a reversal when it is refunded or disputed;
the nightly partner clock makes shares payable after thirty days, or holds a workspace for a person to review; a
platform admin decides a review, records a payout, or pauses the partner, and writes a why "for the partner"
(`platform.jsx`). The pane even promises it: a workspace under review says _"We'll write to you."_
(`PARTNER_STANDING_WORDS.review`). Nothing wrote. 0012 listed "email to a partner (earned, payable, paid, under review)"
as the first of its later steps.

What exists to build on:

- **One way the edge reaches a person**, `post()` in `apps/edge/lib/ops/notify.ts`: Resend, a timeout, and a checked
  response. The dashboard holds no provider key, so the mail goes from the edge.
- **One clock for partners**, `api/cron/partners.ts`, asked daily at 07:17 UTC by `trigger_partners_sweep` (00203, 00207) only when something can be judged or mature.
- **The partner's address** is their account's (`auth.users.email`); only the service role reads it.

## Decision

1. **A daily letter, not one mail per event.** The partner clock, after its sweep, writes each partner one email
   about everything that changed since the last one: shares and reversals written, shares that became payable or
   void, payouts sent, workspaces brought, a workspace held for review or decided by a person (with the person's why),
   and their own pause, close or restore (with why). Then where they stand, in the pane's own sentences. A day's
   news is one mail; a quiet day is none.
2. **A mark, not a queue.** `partners.written_through` says every change up to that instant has been written.
   `partner_letters_due(p_now)` reads what changed in `(written_through, p_now]` from the ledger rows themselves
   (`created_at`, `updated_at`, `sent_at`, `standing_at`, `status_at`, `attributed_at`), so nothing new is stored per
   event and no writer of the ledger learns about letters. Only a mail that went moves the mark
   (`partner_letter_written`, forward only); a failed send is tomorrow's letter with tomorrow's news added.
3. **The partner's switch.** `partners.letters`, on by default, turned off on the pane (`PATCH partner`,
   `partner_letters_set`). Turning it back on starts from now: what changed while it was off is on the pane, not in a
   first long letter. A partner that exists when 00209 is applied starts from then too.
4. **The clock asks when a letter is due.** `trigger_partners_sweep` also calls the edge when
   `partner_letters_due(now())` has a row, so a payout or a share on a day nothing matures is still written that night.
5. **What is not said.** The sweep's own reasons for a review (`checks`, its `standing_why`) are the platform's; the
   letter says a person is looking. The sweep's routine "qualified" is not news; a person's is the answer to a review.
   A closed partner hears once, that they were closed, and nothing after. A partner erased (`user_id` null) or with no
   address hears nothing.

## Shape

- **00209**: `partners.letters boolean not null default true`, `partners.written_through timestamptz not null default
now()` (existing rows set to the migration's now); `partner_letters_due(timestamptz)`, `partner_letter_written(uuid,
timestamptz)` for the service role only; `partner_letters_set(boolean)` for the signed-in caller;
  `trigger_partners_sweep` re-created with the third condition.
- **contracts** (`partner.ts`): `PartnerLetterNews`, `partnerLetter(news, {origin, since, nowMs})` →
  `{subject, body}`, plain text; `partnerPaneUrl(origin)`; `PartnerLettersSchema`; `PARTNER_WORDS.letters`;
  `PartnerDto.letters`.
- **edge**: `lib/partners/letters.ts` `sendPartnerLetters(db, now)`, from `LEAD_FROM` through `post()`, inside a
  30-second budget (a letter that would not fit waits a day); `api/cron/partners.ts` calls it after the sweep and
  answers `letters: {due, sent, failed, deferred}`. `lib/partner-earnings.ts` moves to `lib/partners/earnings.ts`,
  the domain's second module earning its directory.
- **dashboard**: `PATCH /api/v1/partner` (`scope: account`, `role: null`, rate `partner_letters`); `GET partner`
  carries `letters`, read apart from the row so an older database still answers; the pane shows the switch only when
  the server says where it stands.

## Either deploy order

- **Edge first:** `partner_letters_due` does not exist; the sender logs `partner_letters_unread` at warn and sends
  nothing. The clock is unchanged.
- **Dashboard first:** `letters` reads as null and the pane shows no switch; `PATCH partner` answers the database's
  refusal.
- **Migration first:** the clock may call the edge for a letter an older edge does not send; the tick is the sweep's
  as before, and the mark does not move, so the letter goes once the edge is deployed.

## Tests

- `partner-letters.test.mjs`: the letter's words for each kind of change and the subject's order; the sender over a
  database in memory (only a letter that went moves the mark; no sender address; the budget; an older or failing
  database); the clock sending after its sweep and answering the counts.
- `partner.test.mjs`: `GET partner` carries the switch; `PATCH partner` validates, maps its refusals.
- `partner-pane.test.mjs`: the switch shown only when kept, pressed through the bridge, a refusal said.
- `partner.db.test.mjs`, against the replayed stack: the news a share and a workspace make; the service role alone
  reads it; the mark moves forward only; off is off; on starts from now.

## Not decided here

HTML mail and a design for it; a letter per workspace owner about their partner; the letter in a partner's own
language; a weekly digest instead of daily. Each is a small change to `partnerLetter` or the clock's cadence.
