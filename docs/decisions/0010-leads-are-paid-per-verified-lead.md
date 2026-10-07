# 0010 · Leads are paid for per verified lead

**Status:** decided, not built. The lead code was read at commit `ebb4bff2` (PR #1029, 25 September 2026); where this
note and the code disagree, the code wins. Ruben's calls, 25 September: "only charge for actual verified leads … if
they pay for 50 leads and we scrape 150 to find the 50 accurate leads then we only charge for that 50"; "the pro plan
should have x amount of leads included per month" (250); packs beyond it; and on what verified means, "as long as a
number or email is verified then it may count … a sophisticated solution without complicated extra steps to the user".

## Context

### What counts today is already the Qualified lead

The month's allowance moves only when a lead is counted, and only a Qualified lead is counted: `lead_collect_commit`
(00161, lines 192–212) marks a new Qualified member `counted` while the round has room; `lead_check_commit` (00145,
310–353) counts a Needs review lead whose only blocker was its email once the mailbox checks `ok`; Keep and Put back
(`lead_member_move`, 00140:1714–1724) count one each; a re-judge (00165:152–168) counts or uncounts. Excluded and Needs
review are free until kept. So "150 scraped, 50 charged" is how the allowance counts already. What is missing is money
and a plan.

### The numbers are constants, and nothing is sold

`lead_reserve` (00140:575–617) hard-codes 500 leads a month, $25 a month and $10 a day per workspace, and $50 a day for
the platform; `packages/contracts/src/lead-search.ts:85–89` copies them. Nothing reads a plan or a price, there is one
`STRIPE_PRICE_ID`, and no code or migration writes a Stripe usage record or sells a pack. The lead-finder PRD
(`docs/plans/2026-09-17-people-table-and-lead-finder.md`) already chose packs over metering (decision 12) and sketched
"500 for $49, 2,000 for $149" (line 604).

### "Verified" is true for email only

`classify` (`lead-search.ts:674–727`) gates on the plan's `contact` (`"phone" | "email"`, chosen in the plan preview,
`lead-search.ts:411`): under `"email"` a lead needs a mailbox check of `ok` (bounceverify, `cards.ts:209–231`); under
`"phone"` it needs a phone listed (`phone_matches_site !== null`), and the number is never checked. A B2B search wants
the email and a local one the phone, and today the owner's pick is a hard gate: a place with a good number under an
email search, or a good email under a phone search, is Needs review.

### Costs, and the guards that do not fit them

The code's own prices ("Bronze prices, 18 Sep 2026", `lead-search.ts:532–571`) are about 0.73¢ a place scraped (0.3¢
the place, 0.2¢ its contacts, 0.23¢ the judge) and 0.09¢ an email checked. At the yields `sizing.ts` sees, a Qualified
lead costs us about 1–2.5¢ under a phone search and 2–7¢ under an email one: 250 a month is about $3–18. Three things
do not fit:

- The $25 month budget binds before 500 email-standard leads do.
- It settles Apify's reported usage (`lead_settle_usage`, 00140:647–666) but never the judge: its tokens are recorded
  (00140:1063–1073) and the reservation for them is released at the round's end.
- A search reserves its whole count up front, and the plan card reads `used + reserved` (`lead_month_used`,
  00143:31–65) as used until the round ends.

## Decision

1. **A lead counts when one way to reach it is verified.** An email is verified by the mailbox check (`ok`); a phone
   by a dial rule beside the one contracts already holds for a number anyone can be reached on (`phoneDialable`, in the
   `whyNotAPhone` family: in North America a real area code and exchange, never an N11 service code). Either one makes a lead that passes the search's criteria Qualified.
   The plan's `contact` stops being a gate and becomes the **preference**: the channel shown first. Every email found
   is still checked (0.09¢ each), so a lead arrives with both where it can. The owner does nothing new.
2. **The plan includes 250 Qualified leads a month.** The number belongs to the price: Stripe price metadata
   `leads_included`, read with the price, written onto the workspace's billing row when its subscription is applied,
   and read by `lead_reserve` instead of the constant. A workspace on a direct arrangement keeps a configured default.
3. **Beyond it, prepaid packs.** A pack is a one-time Checkout of a pack price (its metadata `leads`); the webhook
   credits the workspace's lead credits, once per Checkout session. The month's allowance is drawn first, then credits,
   and only a counted Qualified lead draws either. Undo gives back to where it was drawn from.
4. **Our cost guard scales with what a workspace may draw.** The dollar cap becomes a function of the allowance plus
   credits (at a ceiling cost per lead), so it never binds before the leads do; the judge's tokens settle into it.
5. **The card shows what was counted.** A reservation is shown as searching, never as used.
6. **A free trial searches nothing** (PR #1031: `maySpend` admits `active` only).

Texting as a paid opt-in (the A2P approval is in) is its own decision, not this one.

## Shape

- contracts: `leadPhoneState(phone)` → `"ok" | "invalid" | "none"` over `phoneDialable`; `classify` takes it beside
  the email's state and qualifies on either, keeping the reason tokens SQL already reads (`email:<state>` when the email is the
  one way left, so `lead_check_commit` still promotes a lead whose mailbox checks out); `probeYield` and sizing count a
  place as reachable on either; the words say "a checked phone or email".
- A billing column for the month's included leads (from the price), and a credits ledger (tenant, leads, source,
  Stripe session id unique); `lead_reserve` and the counting doors draw allowance, then credits.
- Edge: the price read carries `leads_included`; `applySubscription` writes it; a pack Checkout (`mode: "payment"`)
  and its webhook branch credit the ledger.
- Dashboard: "Buy 500 more" (or the pack's size) on the Leads plan card and at the month's end ("this month's
  searching is used up"), owner only, `spend: false` (it takes money, it does not spend ours).

## Steps

Each shippable in either deploy order.

1. **L1 — one verified contact.** contracts `classify`, sizing and words; the collect and check paths in
   `packages/core/src/leads`. No migration: the SQL reads reason tokens that keep their meaning.
2. **L2 — the plan's allowance.** A migration adds the included leads to the billing row (default 250) and
   `lead_reserve` reads it; the edge writes it from the price's metadata; the words say the plan's number.
3. **L3 — packs.** A migration adds the credits ledger and teaches the reserve and the counting doors to draw it; the
   edge sells and credits a pack; the Leads page offers it.
4. **L4 — the guards.** The dollar cap scales with allowance and credits; the judge's tokens settle; the card shows
   counted, not reserved.

## Tests

- `classify` over every pair of phone {ok, invalid, none} × email {ok, other, none} × preference {phone, email}: one
  verified is Qualified, none is Needs review with the token SQL reads, neither present is Excluded as today.
- The collect and check doors over `_fake-db.mjs`: a phone-verified lead under an email search counts at collect; an
  email-only lead under a phone search counts once its mailbox checks out.
- `lead_reserve` against the replayed stack: the price's allowance, then credits, then the refusal in the owner's words.
- The pack's webhook credits once per session, a replay credits nothing.

## Risks

- **A phone that dials is not a phone that answers.** The dial rule catches junk (a bad area code or exchange, a service code), not a
  disconnected line. A carrier lookup (Twilio Lookup, about half a cent) is the upgrade if Qualified phone leads
  disappoint; it plugs into `leadPhoneState` alone.
- **More leads qualify.** Counting on either contact raises yield, so an owner's 250 goes further in places and
  faster in others; the words say what counted and why.
- **A pack bought and not used** is money taken for leads not yet delivered: the credits must be visible and
  refundable by hand (open question 2).

## Open questions (Ruben's)

1. The pack: its size and price (the PRD sketched 500 for $49; at our cost, 500 for $29 still leaves a wide margin).
2. Do credits expire (never, or at a year), and are unused ones refunded on cancel?
3. The included number for other plans, if there will be any besides Pro.
