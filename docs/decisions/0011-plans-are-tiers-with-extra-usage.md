# 0011 · The receptionist is tiers of one usage; leads are their own plan; never a credits ledger

**Status:** proposed, for Ruben's decision on the numbers. Written against commit `095e419f` (25 September 2026) after L1
of decision 0010 merged (#1033) and L2 was built and held. Ruben, 25 September, twice: "lets stop to reassess by
researching competitors/the market to ensure we are not too expensive but are covering our costs nicely … a credit
system sounds a bit complicated … upsell them to roll over into a bigger plan similar to how claude does"; then "I do not
want to count minutes … id rather just count it as usage if they want more usage upgrade so that users are not tracking
call minutes vs text allowance vs etc. The only thing that made sense to have as packs is the leads as some users may not
even need leads, just work on inbound, vs some only want leads."

Where this note and 0010 disagree, this note wins: 0010's L1 and L2 stand (a lead counts when a contact is verified;
the allowance belongs to the price), its L3 (prepaid packs on a credits ledger) is withdrawn, and its L4 (the cost
guards) folds into step 5 below.

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
is recorded per call (00007, 00031) and read by nothing that limits or bills; the one Stripe price is a flat fee.

### Volume: what Ruben expects against what is measured

Ruben expects "10–30 calls a day, under 3 minutes each". At 2 minutes a call that is **600–1,800 minutes a month,
$66–$200 of cost**; at 3 minutes, up to 2,700 minutes and $300. The one live customer used **30 calls and 32 minutes
in the whole of September**, about one a day and one minute each. The two are twenty to fifty times apart, and the plan
cannot know which a new customer will be. So the customer never reads minutes, but **the price has to climb with the
volume, silently**: that is what one usage bar with tiers does. A flat "unlimited" plan at $49–$99 is a bet against the
heavy customer at 11¢ a minute; the market's unlimited plans either cap something else (Goodcall caps unique callers) or
start at $89 (Phone2), and Rosie sells 2,000 minutes for $299.

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
Thryv at $623 a month.

**Claude's shape**, which Ruben named: tiers with one usage, shown as one bar with a reset time; hit it and the answer is
the next tier (and, since 2026, an optional "extra usage" switch under a cap). Nobody on a Claude plan tracks tokens
by model.

## Context: what the code does today

- **One price.** `STRIPE_PRICE_ID` (`apps/edge/lib/billing.ts:67`); the row copies Stripe's status (00073); `maySpend`
  admits `active` only (#1031); the first run's Checkout takes no trial.
- **Leads are counted and capped, in SQL.** `lead_counters` (00140:297) with `kind in (allowance, budget, day)` and a
  period; `lead_reserve` refuses past the whole; the counting doors move `used`. L2 (held on `feat/lead-plan-allowance`,
  migration 00176) makes the whole the price's `leads_included` and answers it from `lead_month_used`.
- **Minutes are recorded and never limited.** `usage.voice_seconds` per call (00007:189, 00031:208), and
  `calls.cost` keeps Retell's cost per call, by product.
- **Texts leave through one door** (`packages/core/src/deliver.ts`) and are never counted against anything.
- **A paused receptionist already has a voice and a posture**: calls are answered to take a message
  (`pausedVoiceFacts`) and new messages wait in the Inbox (`PAUSED_WORDS`).
- **The public price is unset.** chanlytics.com's Pricing page says the price "is set on a free 25-minute discovery call";
  the $49 in the test fixtures is a fixture. Stripe is on test keys.

## Decision

1. **Two products, bought together or alone.** The **Receptionist** (everything inbound: calls, texts, WhatsApp, email,
   web chat, the calendar, People) and **Leads** (the finder). A workspace may hold either or both. Nothing about
   leads is bundled into the receptionist's price, and nothing about the receptionist into leads'.
2. **The Receptionist's tiers include one thing: usage.** One bar, one percentage, one reset day, as Claude shows it.
   Behind it a **rate card in contracts** turns what the receptionist handles into units: a call minute, a text
   segment, a WhatsApp or web reply, each a fixed number of units set from our cost. The customer never reads minutes
   or texts; the bar reads "Usage this month: 62% · resets Oct 1", with one sentence under it saying what counts
   ("calls, texts and messages your receptionist handles; leads never"). The rate card is fixed, so a customer's bar
   never moves because we changed a voice or a model; our real cost is watched separately (step 5).
3. **Past 100%: the next tier, starting today.** The door is one press: a Stripe price change with proration, applied
   at once, so the bar drops the same minute. Meanwhile the receptionist degrades honestly, never silently: calls are
   answered to take a message and new messages wait in the Inbox (the paused posture, with its own words and reason),
   and the owner is told at 80% and at 100%. A caller is never cut off. Downgrades take effect at renewal. Extra usage
   (Claude's second door, metered under a cap) is **not built at launch**; the top tier's sentence offers a
   conversation instead. It is one step to add later, on Stripe meters, if a customer at the top asks.
4. **Leads are their own plan, in sizes: the "packs".** 250, 1,000 or 3,000 Qualified leads a month, cancel any month,
   bought with or without the receptionist. A lead counts as L1 says (a checked phone or email); the size is L2's
   `leads_included` on the leads price. Past the month's leads: the next size, or the renewal. **No ledger, no expiry,
   no refund rule**, because nothing is prepaid. If a one-time pack is ever wanted, it is a Stripe credit grant against
   a metered lead price, which Stripe's own ledger draws down; not a table of ours.
5. **Stripe holds the money; the row holds the numbers.** One subscription per workspace with up to two items (a
   receptionist tier, a leads size). Each price's metadata carries what it includes (`usage_included`,
   `leads_included`); the edge sums the items' metadata onto the billing row when it applies a subscription (L2's
   mechanism, generalised). Nothing in the code knows a tier's numbers.
6. **The internal cost guards stay internal.** The lead finder's $25 month budget and its day caps become abuse guards
   scaled to the leads size, never named to an owner; the judge's tokens settle into them. A monthly sweep compares
   each workspace's real cost (`calls.cost`, texts sent, leads' `cost_usd`) with its tier and logs the ones whose cost
   passes their price: that is where a premium voice or Retell's AI QA would show first.
7. **The trial stays a trial** (#1031): fourteen days, nothing that costs us, and the same doors when it ends.

### Why one usage and not three allowances

Three allowances make the customer an accountant (minutes against texts against messages) and make every sentence
in the product a comparison. One bar asks nothing of them and still scales the price with the cost, because the rate
card is our cost. Leads stay apart because they are a different purchase: some workspaces want none and some want
only them.

### Why tiers and not credits

A credits ledger needs a table, a draw order in seven SQL counting doors, a one-time Checkout and its webhook branch,
an expiry rule, a refund rule, and words for a balance that can be wrong. Monthly sizes need none of it and answer the
same want ("more leads this month") with the mechanism L2 already built. The two questions Ruben was asked about
credits (expiry, refunds) exist only because of a ledger; without one they vanish.

## The sheet (a proposal; every number is Ruben's)

**The rate card** (1 unit = about 1¢ of our cost on today's stack): a call minute **10 units**; a text segment, in or
out, **2 units**; a WhatsApp, web or email reply **1 unit**. A tier's usage is a number of units; the customer sees a
percentage. In the words below, "calls a day" assumes 2 minutes a call and 30 days.

| Receptionist tier | Price a month | Usage included | About                                    | Cost at full use | Margin, full use | Margin, typical\* |
| ----------------- | ------------- | -------------- | ---------------------------------------- | ---------------- | ---------------- | ----------------- |
| Starter           | **$49**       | 1,500 units    | 150 minutes: 2–3 calls a day, 1 number   | $20              | 59%              | 86%               |
| Pro               | **$99**       | 4,000 units    | 400 minutes: 6–7 calls a day, texting    | $45              | 55%              | 85%               |
| Scale             | **$199**      | 10,000 units   | 1,000 minutes: 15–17 calls a day         | $105             | 47%              | 82%               |
| Max               | **$399**      | 25,000 units   | 2,500 minutes: 40 calls a day, 2 numbers | $255             | 36%              | 79%               |

\*Typical: a third of the usage. Ruben's expected business (10–30 calls a day) lands on Scale or Max; the measured
customer (one call a day) stays on Starter. The ladder is the point: nobody is asked which they are.

| Leads size | Price a month | Per lead | Cost (4¢ a lead) | Margin |
| ---------- | ------------- | -------- | ---------------- | ------ |
| 250        | **$29**       | 11.6¢    | $10              | 66%    |
| 1,000      | **$79**       | 7.9¢     | $40              | 49%    |
| 3,000      | **$199**      | 6.6¢     | $120             | 40%    |

Beside Instantly's 1.7–4.7¢ for a database email and Apollo's ~5¢ for a contact, ours carries a judgement, a checked
phone or email and delivery into outreach; 250 for $29 is the size a salon owner buys once to try, and 1,000 for $79 is
the agency's. **Annual: two months free** on both products.

Answers to the four questions 0010 left open: (1) packs are monthly sizes, no prepay; (2) nothing is prepaid, so
nothing expires and nothing is refunded; (3) 250 / 1,000 / 3,000 by size, and no leads inside the receptionist's
tiers; (4) texting is not an add-on: it is inside the receptionist's usage from Pro, at 2 units a segment.

## Shape (how the frameworks are wired)

- **contracts:** `USAGE_RATES` (the rate card) and `usageUnitsOf(kind, n)`; `PlanLimits` {usage_included,
  leads_included, texting, numbers_included} read from a price's metadata (`planLimitsOf`, generalising
  `leadsIncludedOf`) and summed over a subscription's items; `UsageVM` (share, the sentence, the reset day, the tier's
  next door); the tiers' and sizes' words; the paused posture gains a reason (`billing` | `usage`) with its own
  sentence.
- **db / SQL:** `usage_counters` = `lead_counters` widened to `kind in (usage, leads, budget, day)`; `usage_add(tenant,
units)` called from the call-lifecycle door (seconds → units) and the send path (segments or a reply → units);
  `month_usage(tenant, period)` answering usage and leads, each used against included; `billing_accounts` gains
  `usage_included` beside 00176's `leads_included`, and `usage_state` (`ok` | `warned` | `over`) so the bell rings
  once.
- **edge:** `applySubscription` sums the items' metadata onto the row; `change_plan` op (`subscriptions.update` on the
  item, `proration_behavior: "always_invoice"` up, a schedule at renewal down); the monthly cost sweep.
- **core:** `deliver.ts` adds each SMS segment and each reply to the month; the paused posture reads `usage_state`
  beside billing.
- **dashboard:** Billing draws two cards, Receptionist (tier, bar, next door) and Leads (size, left, next door), with
  the prices listed from Stripe and cached like `priceForClient`; the plan card and Ask's finder read leads as today;
  the 80% and 100% bells carry the door. The site's Pricing page draws the sheet from the same words.
- **Retired:** the owner-facing budget; 0010's L3; `LEAD_MONTHLY_ALLOWANCE` as a number anyone reads (it becomes the
  fallback when the database has not answered).

## Steps

Each a PR on green; database first where a migration is named.

1. **The catalog.** Two products and their prices in Stripe (metadata as above); `planLimitsOf` summed over items;
   00176 widened with `usage_included`; `applySubscription` writes both; Billing names the tier and the size; the
   site's Pricing page. L2 as built (`feat/lead-plan-allowance`) merges inside this step.
2. **Usage counted.** The rate card; `usage_counters`, `usage_add`, `month_usage`; the two meter points; the bar and
   its sentence; the 80% and 100% bells, once each.
3. **The posture.** Past 100%, the paused posture with the usage reason and words; a caller is never cut off; the
   owner's door in the bell and on Billing.
4. **The next tier.** `change_plan` for both products, the picker, the doors in the sentences; downgrade at renewal.
5. **The guards go internal.** The lead budget and day caps scaled to the size; the judge settles; the monthly cost
   sweep; no owner reads them.

Later, if asked: extra usage on Stripe meters under a cap; a one-time leads pack as a Stripe credit grant; a bundle
price for both products.

## Tests

- `planLimitsOf` over every metadata shape and over two items; a price that says nothing gives Starter's numbers.
- `usageUnitsOf`: a minute is 10, a segment 2, a reply 1; a call's seconds round up to the minute once.
- `month_usage` over the replayed stack: usage and leads, one period, the platform's row unreachable.
- The meter points: a call's end adds its minutes once (a replayed webhook adds nothing); an SMS adds its segments,
  a WhatsApp reply adds one, an email adds one.
- The posture: at 100% the shell is the message-taking prompt with the usage words and the owner was told once; at
  80% told once; a change of tier clears both.
- `change_plan`: an upgrade applies at once and the bar drops; a downgrade waits for renewal; a foreign price is
  refused; a leads size changes without touching the receptionist's item.
- The sweep: a workspace whose real cost passes its price is logged with both numbers; the rest log nothing.

## Risks

- **The rate card can drift from cost.** A minute is 10 units at 11¢ today; a premium voice (ElevenLabs, +2.5¢) or
  a heavier model changes the cost and not the bar. The sweep is the guard, and the voice picker never defaults to
  premium.
- **Retell's AI QA at $0.10 a minute** must never be switched on across traffic; the sweep would show it within a
  month, but a month of it costs a tier's margin.
- **Volume is unknown.** If Ruben's expectation holds, most customers land on Scale or Max and the entry tier is a
  trial door; if the measurement holds, most stay on Starter and revenue per workspace is $49. The ladder survives
  both; the marketing does not, so the site should lead with Pro.
- **Message-taking past 100% is a strong nudge.** It is honest and reversible in one press, but a customer who hits
  it on the 20th and does not upgrade has ten days of a message-taking receptionist; the 80% bell has to be early and
  plain.
- **Meta charges WhatsApp replies from 1 October 2026**; at $0.0034 a reply it is inside the 1-unit rate.
- **Stripe is on test keys**; the whole sheet is invisible to a customer until Ruben flips live.

## Open questions (Ruben's)

1. The four receptionist prices ($49 / $99 / $199 / $399) and their usage (150 / 400 / 1,000 / 2,500 minutes'
   worth), or a three-tier ladder starting at $79 like Goodcall.
2. The three leads prices ($29 / $79 / $199 for 250 / 1,000 / 3,000).
3. Whether every receptionist tier gets one 25-lead search to try the finder (a taste, once, not monthly).
4. Whether Starter includes texting (proposed: from Pro).
5. Whether the top tier says "talk to us" or offers extra usage from day one.
6. Whether the discovery-call posture on chanlytics.com stays beside the sheet for the first ten to twenty customers.

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
