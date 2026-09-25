# 0011 · Plans are tiers; past a tier, extra usage or the next tier — never a credits ledger

**Status:** proposed, for Ruben's decision on the numbers. Written against commit `095e419f` (25 September 2026) after L1
of decision 0010 merged (#1033) and L2 was built and held. Ruben, 25 September: "lets stop to reassess by researching
competitors/the market to ensure we are not too expensive but are covering our costs nicely … a credit system sounds a
bit complicated … just get users to upsell them to roll over into a bigger plan similar to how claude does … not caring
how complex the recode or refactor may be for the best solutions and logic in pricing and how we are wiring the
frameworks".

Where this note and 0010 disagree, this note wins: 0010's L1 and L2 stand (a lead counts when a contact is verified;
the allowance belongs to the price), its L3 (prepaid packs on a credits ledger) is withdrawn, and its L4 (the cost
guards) folds into step 6 below.

## What we charge for, and what it costs us

Every number in this table was read from production or from the provider's own price sheet on 25 September 2026.
Nothing is estimated where a measurement existed.

| Unit                     | Our cost                                                                                                                                                                                                                                            | Where it was read                                                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A call minute            | **15¢ measured** over the last 60 days (34 calls, 20.4 minutes, $3.06). On today's stack it is **10–11¢**: voice engine 5.5¢ + Minimax voice 1.5¢ + Claude 4.5 Haiku 2.5¢ + telephony (0.34¢ on our own SIP trunk; 1.5¢ on a Retell-Twilio number). | `calls.cost` on production, by product: `retell_voice_engine` $1.12, `elevenlabs_tts` $0.73, `claude_4_5_haiku` $0.51, `gpt_4_1_text_testing` $0.36, `us_twilio_telephony` $0.31, `minimax_tts_new` $0.03. The ElevenLabs line is older calls on a premium voice (4¢/min); `voice-provision.ts:31–47` now sets Minimax + Haiku. |
| A counted lead           | **4.2¢ measured** (7 ended rounds, 99 counted leads, $4.17), under the pre-L1 rule. L1 counts more of what is scraped, so this falls.                                                                                                               | `lead_rounds` on production; 0010 §Context estimated 1–7¢.                                                                                                                                                                                                                                                                      |
| A text segment           | **1.2–1.3¢ out**, 1.1–1.5¢ in (Twilio $0.0083 + a carrier fee of $0.0035–$0.0045 out, $0.0025–$0.007 in), plus the reply's model, about 0.5–2¢ a reply.                                                                                             | Twilio US SMS pricing.                                                                                                                                                                                                                                                                                                          |
| A texting registration   | $4 brand + $15 campaign vetting, one time ($19.50 on our invoice; the first real standard-brand filing cost $46), then **$2 a month** per campaign.                                                                                                 | `billing.ts:109–110`, `a2p.ts:422`, Twilio's A2P FAQ.                                                                                                                                                                                                                                                                           |
| A number                 | $1.15 a month.                                                                                                                                                                                                                                      | `billing.ts:109`; Twilio.                                                                                                                                                                                                                                                                                                       |
| A WhatsApp reply         | Free inside the 24-hour window until 30 September 2026; **per message at utility rates ($0.0034 in the US) from 1 October 2026**.                                                                                                                   | Meta's announcement.                                                                                                                                                                                                                                                                                                            |
| An email                 | About nothing (Resend).                                                                                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                 |
| Retell's post-call AI QA | **$0.10 a minute after 100 free minutes.** Not on our calls' cost lines today; it must stay that way, because switched on it doubles the minute.                                                                                                    | Retell's price sheet.                                                                                                                                                                                                                                                                                                           |
| Fixed, per workspace     | About $3–5 a month: the number, the campaign, its share of the database and the hosting.                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                                 |

Two facts follow. **The receptionist's minutes are the cost that matters**: at 250 minutes a month a workspace costs us
about $27; its 250 leads about $10; its 500 texts about $12. And **nothing prices minutes today**: `usage.voice_seconds`
is recorded per call (00007, 00031) and read by nothing that limits or bills; the one Stripe price is a flat fee. A busy
phone on a $49 flat plan loses money at about 450 minutes.

## What the market charges (September 2026)

**AI receptionists** price on minutes or calls, with overage; the entry price is $29–$99 and the mid tier $99–$199.

| Vendor            | Plans                                                                          | Per minute, implied  | Texting                                    |
| ----------------- | ------------------------------------------------------------------------------ | -------------------- | ------------------------------------------ |
| Rosie             | $49 / 250 min · $149 / 1,000 · $299 / 2,000                                    | 15–20¢               | From the $149 plan; website texting $50/mo |
| Dialzara          | $29 / 60 min · $99 / 220 · $199 / 500 · $349 / 1,000; overage 35–48¢/min       | 35–48¢               | AI SMS add-on $19/mo + 5¢ a message        |
| My AI Front Desk  | $99 ($79 annual): 200 min + 400 texts + chat; overage 25¢/min, 4¢/text         | 25¢                  | Included                                   |
| Goodcall          | $79 / $129 / $249, unlimited minutes, capped at 100 / 250 / 500 unique callers | 50¢ per extra caller | —                                          |
| Simple Phones     | $97 / 100 calls                                                                | ~$1 a call           | —                                          |
| Upfirst           | $24.95 / 30 calls; 70¢–$1.50 a call after                                      | ~$1 a call           | —                                          |
| Smith.ai (hybrid) | ~$255–300 / 30 calls                                                           | $8.50+ a call        | —                                          |
| Phone2, SkipCalls | $89 and $19.99, "unlimited"                                                    | —                    | —                                          |

**Lead finders** price per credit or per verified lead.

| Vendor                    | Price                                              | Per lead | What a lead is                                    |
| ------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------- |
| Instantly Lead Finder     | $47 / 1,000 · $96 / 4,500 · $169 / 10,000 verified | 1.7–4.7¢ | A verified email from a B2B database              |
| Hunter                    | $49 / 2,000 credits                                | 2.5¢     | An email search; no phones                        |
| Apollo                    | $49–59 a user; about 1,000 email credits a month   | ~5¢      | A B2B contact; mobiles rationed                   |
| UpLead                    | $99 / 170 credits                                  | 58¢      | A verified B2B contact                            |
| Outscraper                | $3 / 1,000 records, first 500 free                 | 0.3¢     | A raw Maps row: no check, no judgement, no emails |
| D7 Lead Finder, LeadSwift | $24.99–$119.99 a month by searches a day           | —        | Local-business lists, unverified                  |

Ours is a judged local business with a checked phone or email, delivered into the workspace's own People and
outreach. It sits between Outscraper's raw row and Apollo's contact: **5–10¢ a lead is market; 2–5¢ is aggressive.**

**Texting** is $19–39 a month for 500 texts standalone (SimpleTexting $39, SlickText $29, EZ Texting $25 + $5 telecom
fee, 4¢ overage) and $5 a month per location for 10DLC inside the suites; Podium starts at $399, Birdeye at $299,
Thryv at $623 a month. **4–8¢ a text is market.**

**Claude's shape**, which Ruben named: tiers ($20 / $100 / $200) with included usage, and since 2026 an "extra usage"
switch on every paid plan that continues at standard rates under a monthly spending cap the customer sets. Hit the
limit, and the choice is wait, switch on extra usage, or take the next tier.

## Context: what the code does today

- **One price.** `STRIPE_PRICE_ID` (`apps/edge/lib/billing.ts:67`); the row copies Stripe's status (00073); `maySpend`
  admits `active` only (#1031); the first run's Checkout takes no trial.
- **Leads are counted and capped, in SQL.** `lead_counters` (00140:297) with `kind in (allowance, budget, day)` and a
  period; `lead_reserve` refuses past the whole; the counting doors move `used`. L2 (held on `feat/lead-plan-allowance`,
  migration 00176) makes the whole the price's `leads_included` and answers it from `lead_month_used`.
- **Minutes are recorded and never limited.** `usage.voice_seconds` per call (00007:189, 00031:208).
- **Texts leave through one door** (`packages/core/src/deliver.ts`) and are never counted against anything.
- **Texting is gated by registration only** (`SPEND_TEXTING`), and registration by `maySpend`.
- **A paused receptionist already has a voice**: `pausedVoiceFacts` takes a message and promises a call back
  (`billing.ts`, `PAUSED_WORDS`).
- **The public price is unset.** chanlytics.com's Pricing page says the price "is set on a free 25-minute discovery call";
  the $49 in the test fixtures is a fixture. Stripe is on test keys.

## Decision

1. **Plans are tiers, and a tier is a Stripe price.** Three self-serve tiers, one price each, whose metadata carries
   what the tier includes: `minutes_included`, `leads_included`, `texts_included`, `texting` (yes/no),
   `numbers_included`. The edge reads them when it applies a subscription (L2's mechanism, generalised) and writes
   them onto the billing row. Nothing in the code knows a tier's numbers.
2. **Three meters, one mechanism.** Minutes, leads and texts are counted per calendar month in one `usage_counters`
   table (today's `lead_counters`, widened), with one door that answers used against included. Minutes are added
   where `usage.voice_seconds` is written; texts where `deliver.ts` sends an SMS; leads as today.
3. **Past the tier: the next tier, or extra usage.** The sentence that says the month is used ("You have found this
   month's 250 leads", "This month's call minutes are used") is the upsell moment and offers two doors: **the next
   tier, starting today** (a Stripe price change with proration, applied at once, so the whole rises the same minute)
   or **extra usage** (an opt-in switch with a monthly cap in dollars, billed per unit at the tier's rates). Both are
   Claude's doors. Downgrades take effect at renewal.
4. **With extra usage off, the product degrades honestly, never silently.** Leads: searches refuse, as today. Texts:
   replies to a customer continue (a reply is the receptionist's duty), broadcasts and playbook sends stop. Minutes:
   the receptionist switches to message-taking (`pausedVoiceFacts`) until renewal or the next tier, and the owner is
   told at 80% and at 100%. A caller is never cut off mid-call.
5. **No credits ledger, ever.** Stripe holds the money: the tier is a recurring price, extra usage is three metered
   prices on the same subscription fed by meter events for the units beyond the included ones, and if a prepaid pack
   is ever wanted it is a Stripe **credit grant** against those metered prices, which Stripe's own ledger draws down.
   Our counters hold the gate and the words; Stripe holds the bill; a monthly sweep compares the two.
6. **The internal cost guards stay internal.** The $25 month budget, the $10 day and the $50 platform day become
   abuse guards scaled to the tier (about 3× its included cost), never named to an owner; the judge's tokens settle
   into them. No owner ever reads "budget".
7. **The trial stays a trial** (#1031): fourteen days, nothing that costs us, and the same three doors when it ends.

### Why tiers and not credits

A credits ledger needs: a table, a draw order in every counting door (collect, check, keep, put back, re-judge, undo,
blank: seven SQL functions), a one-time Checkout and its webhook branch, an expiry rule, a refund rule, and words for
a balance that can be wrong. It answers one question (more leads this month) for one of three meters. Tiers answer all
three with one mechanism the code half has, and the mechanism Stripe built for the rest (meters, graduated prices,
credit grants) exists so that nobody writes a ledger. The credits questions Ruben was asked (expiry, refunds) exist only
because of the ledger; without it they vanish.

## The sheet (a proposal; the numbers are Ruben's)

Cost per unit as measured above (11¢ a minute on today's stack, 4¢ a lead, 2.5¢ a text with its reply, $5 fixed).

| Tier    | Price a month | Includes                                                            | Cost at full use | Margin at full use | Cost at typical use\* | Margin, typical |
| ------- | ------------- | ------------------------------------------------------------------- | ---------------- | ------------------ | --------------------- | --------------- |
| Starter | **$49**       | 120 call minutes · 100 leads · 1 number · no texting                | $22              | 55%                | $9                    | 82%             |
| Pro     | **$99**       | 250 minutes · 250 leads · 500 texts · texting + WhatsApp · 1 number | $55              | 44%                | $18                   | 82%             |
| Scale   | **$199**      | 600 minutes · 750 leads · 1,500 texts · 2 numbers                   | $138             | 31%                | $45                   | 77%             |

\*Typical: a third of the minutes, half the leads, a third of the texts. The one live customer used 32 minutes in
September. Rosie sells 1,000 minutes for $149 at about the same unit cost we have, so Scale's full-use margin is the
market's, and extra usage protects the tail.

**Extra usage**, opt-in with a monthly cap: **20¢ a minute** (cost 11¢; market 25–48¢), **8¢ a lead** (cost 4¢; market
5–10¢), **5¢ a text** (cost 2.5¢; market 4–8¢). **Annual: two months free**, the market's norm.

Answers to the four questions 0010 left open: (1) no packs; extra usage per unit instead, and a pack later is a Stripe
credit grant; (2) no credits, so nothing expires and nothing is refunded; (3) 100 / 250 / 750 leads by tier; (4)
texting is not an add-on but the first thing Pro adds over Starter, at 500 texts, 5¢ beyond.

## Shape (how the frameworks are wired)

- **contracts:** `PlanLimits` {minutes_included, leads_included, texts_included, texting, numbers_included} read
  from a price's metadata (`planLimitsOf`, generalising `leadsIncludedOf`); `BillingAccountDto` carries them;
  `UsageVM` (used, included, share, the sentence) for each meter; the tier's words (name, what it includes, the
  upsell sentence, the extra-usage words); `maySend` for a broadcast past the texts, `voiceLimited` for the shell.
- **db / SQL:** `usage_counters` = `lead_counters` renamed with `kind in (leads, minutes, texts, budget, day)`;
  `month_usage(tenant, period)` answering all three against the row's limits; `usage_add(tenant, kind, n)` called by
  the call-lifecycle door and by the send path; `billing_accounts` gains the limit columns and
  `extra_usage_enabled`, `extra_usage_cap_usd`.
- **edge:** `applySubscription` writes the limits; `change_plan` op (`subscriptions.update` with
  `proration_behavior: "always_invoice"` up, a schedule at renewal down); meter events for units past the included
  ones (`billing.meterEvents.create`, with a negative event within 24 hours on an undo); a monthly sweep that
  compares our counters with Stripe's usage and logs a drift.
- **core:** `deliver.ts` adds a text to the month; the gate for broadcasts reads it.
- **dashboard:** Billing draws the tier picker (prices listed from Stripe with their metadata, cached like
  `priceForClient`), three usage bars, the extra-usage switch and cap; the plan card, the call-limit bell and the
  broadcast refusal each carry the two doors. The site's Pricing page draws the sheet from the same words.
- **Retired:** the owner-facing budget; 0010's L3; `LEAD_MONTHLY_ALLOWANCE` as a number anyone reads (it becomes
  the fallback when the database has not answered).

## Steps

Each a PR on green, in either deploy order unless said.

1. **The catalog.** Tier prices in Stripe (metadata as above); `planLimitsOf`; the limit columns (00176 widened:
   `leads_included` stays, `minutes_included` and `texts_included` join it); Billing names the tier and what it
   includes; the site's Pricing page. Database first.
2. **Minutes and texts counted.** `usage_counters`, `month_usage`, `usage_add` at the two meter points; the bars;
   the 80% and 100% bells. Database first.
3. **The gates.** Message-taking past the minutes; broadcasts stop past the texts; the words.
4. **The next tier.** `change_plan`, the picker, the upsell doors in the three sentences.
5. **Extra usage.** The switch and cap, the three metered prices, meter events, the reconciliation sweep.
6. **The guards go internal.** The budget and day caps scaled to the tier; the judge settles; no owner reads them.

L2 as built (`feat/lead-plan-allowance`) is step 1's leads column and door, and merges inside step 1 renamed.

## Tests

- `planLimitsOf` over every metadata shape; a price that says nothing gives Starter's numbers.
- `month_usage` over the replayed stack: three kinds, one period, the platform's row unreachable.
- The two meter points: a call's end adds its minutes once (a replayed webhook adds nothing); an SMS adds a
  segment, a WhatsApp or email adds nothing.
- The gates: at 100% with extra usage off the shell is the message-taking prompt and the owner was told once; with
  it on, nothing changes and a meter event was sent; past the cap, the gate refuses in words.
- `change_plan`: an upgrade applies at once and the whole rises; a downgrade waits for renewal; a foreign price is
  refused.
- The sweep: equal counters log nothing; a drift logs one line with both numbers.

## Risks

- **The voice picker can quietly cost 2.5¢ more a minute** (ElevenLabs 4¢ against Minimax 1.5¢). The default is
  Minimax; a premium voice, if offered, is a Scale feature or an add-on, never a silent default.
- **Retell's AI QA at $0.10 a minute** must never be switched on across traffic. `post_call_analysis_model` is set
  today; the cost lines show no QA charge; keep proving that on the monthly sweep.
- **Full-use margins on Scale are the market's, not comfortable** (31%). Extra usage at 20¢ carries the tail; the
  sheet should be re-read against `calls.cost` after the first 20 paying workspaces.
- **A downgrade with the month already past the new tier's included** lands in extra usage or message-taking on
  renewal day; the confirmation says so.
- **Meta charges WhatsApp replies from 1 October 2026** at utility rates; at $0.0034 a reply it is noise, but the
  guard in step 6 should include it.
- **Stripe is on test keys**; the whole sheet is invisible to a customer until Ruben flips live.

## Open questions (Ruben's)

1. The three prices: $49 / $99 / $199 as proposed, or Scale at $249 with 800 minutes.
2. Whether Starter gets any texting (100 texts) or texting is Pro's first reason to upgrade, as proposed.
3. The extra-usage rates (20¢ / 8¢ / 5¢ proposed) and whether extra usage is on by default with a default cap ($50), as
   Claude does it, or off until switched on.
4. Whether the discovery-call posture on chanlytics.com stays beside the sheet ("or talk to us") for the first ten to
   twenty customers.
5. Annual pricing (two months free proposed) and whether the sheet launches with it.

## Sources

Rosie: heyrosie.com/pricing. Dialzara: dialzara.com/pricing. My AI Front Desk: myaifrontdesk.com/pricing. Goodcall,
Simple Phones, Upfirst, Smith.ai, Phone2, SkipCalls: their sites and the 2026 comparisons at stork.ai, ringly.io,
skipcalls.com and cloudtalk.io. Retell: retellai.com/pricing. Twilio: twilio.com/en-us/sms/pricing/us,
twilio.com/en-us/sip-trunking/pricing/us, and the A2P 10DLC fees FAQ. Meta: developers.facebook.com, "Upcoming pricing
updates for … service and utility messages". Lead finders: instantly.ai, hunter.io, apollo.io, uplead.com,
outscraper.com/pricing and the 2026 comparisons at landbase.com, cleanlist.ai and fullenrich.com. Texting:
simpletexting.com, slicktext.com, eztexting.com and the 2026 comparisons at business.com; Podium, Birdeye and Thryv
from their sites and wiserreview.com. Stripe: docs.stripe.com (meters, meter event adjustments, billing credits and
credit grants, flat fee and overages). Claude: claude.com/pricing and the 2026 plan guides.
