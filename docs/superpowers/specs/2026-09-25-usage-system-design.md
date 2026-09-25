# Usage, one bar: the receptionist's plan, at Ask's feet

**Status:** design v2, for Ruben's approval. Written 25 September 2026 against commit `095e419f`, under decision 0011
(`docs/decisions/0011-plans-are-tiers-with-extra-usage.md`). Ruben: "I do not want to count minutes … just count it as
usage; if they want more usage, upgrade … similar to the usage UI system from Claude"; then "analyze Chanlytics to
design it integrated a bit better, for example we have the Ask system; perhaps it embeds with that, as we already
have the icon for Ask." This is the end-to-end design: what is counted, where, how the month is kept, what the person
sees, and the two doors past the top. v2 moves the exposure inside Ask.

## What it must do

1. **One number.** A workspace on a receptionist tier sees one bar, one percentage and one reset day. Never minutes
   against texts against messages.
2. **Every cost counts, at a fixed rate.** Calls, texts, WhatsApp, email and web replies, and Ask's turns each add
   units by a rate card that does not move when we change a voice or a model.
3. **The month is the billing period.** "Resets Oct 12" is the invoice's day, not the calendar's.
4. **Past the top, two doors, honestly.** The next tier starting today, or waiting for the reset while the
   receptionist takes messages. Nothing is cut off mid-call; nothing goes silent.
5. **Leads stay apart.** Their own bar in the same places, their own size, their own door (decision 0011).
6. **Nothing new in the chrome.** The product already has one AI with one face everywhere (Ask). Usage is that AI's
   standing: at its feet in the Stage, around its face when it matters, and a question away. No fourth button in the
   top bar, no page anyone has to find.

## What exists today

- **Usage events are already written per unit of work**, one row each in `events` with `category = 'usage'`:
  `usage.voice_seconds` by the call-lifecycle door (00031:208, metered once, on the event that first carries a
  duration); `usage.llm_tokens` by every receptionist reply (`apps/edge/lib/receptionist/budget.ts` reads them for a
  day's token budget); `usage.wa_conversation` by `apps/edge/lib/whatsapp/persist.ts`; `usage.ask_tokens` by
  `apps/edge/lib/ask-gateway.ts`. Not written: an SMS segment (the carrier cost), an email sent.
- **A month counter exists for leads**: `lead_counters (tenant_id, kind, period, used, reserved)` (00140:297),
  taken with `lead_counter_take`, moved by the counting doors, read by `lead_month_used` (00143; L2 adds `included`).
- **The billing row** holds Stripe's status, `current_period_end`, the card, and (L2) `leads_included`.
- **The paused posture** exists: `pausedVoiceFacts` (calls answered to take a message), `PAUSED_WORDS` (messages
  wait in the Inbox), the shell's one status line (`shellStatusLine`, kind `paused`, one press to Billing), and
  Today's alert line.
- **Ask is one AI with one face** (`components/ask-face.jsx`, the mood from `legacy-bridge/mascot/mood.ts`): the top
  bar's button (`tb-ask`), the Stage's 84px face beside the Line (`pages/ask-real.jsx`, `.ask-stage-row`), the
  phone's hero at 232px and its coral ✦. Under the band, while a turn runs, one line in coral says what Ask reads
  (`.ask-reading`); at rest that row is empty (`grid-template-rows: auto 0fr`).
- **Ask reads through tools and acts through proposals** (`apps/dashboard/src/server/ask/tools.ts`, `proposals.ts`):
  fourteen reads (`get_today`, `get_report`, `get_settings`, `list_lead_searches`, …) and twelve proposal kinds, each
  a card the owner approves (`reply`, `settings`, `broadcast`, `lead_search`, …). Its prompt today describes "a daily
  cap on the receptionist's model usage" (`prompt.ts:42`), the internal token budget, as if it were the plan.
- **Reports** is the page for numbers over a period, with the chart kit and its validated categorical tokens
  (`--chart-cat-1..5`). **Billing** is the page for money.

## The model

### The rate card (contracts, `usage.ts`)

| What the receptionist did      | Units | Why                                                |
| ------------------------------ | ----- | -------------------------------------------------- |
| A second on a call             | 1/6   | 10 a minute; a minute costs us 10–11¢ (0011)       |
| An SMS segment, in or out      | 2     | 1.3¢ carrier and Twilio, and a share of the reply  |
| A WhatsApp, web or email reply | 1     | the model; from 1 October Meta's $0.0034 a message |
| An Ask turn                    | 1     | real (Sonnet) but the owner's own; kept cheap      |
| A lead                         | 0     | leads are their own bar                            |

A unit is about a cent of our cost on today's stack. `usageUnitsOf(kind, n)` is the one function; the events keep
their own natural numbers (seconds, tokens, segments) and the units are derived at the meter point and stored beside
them. **Calls are counted by the second**, so a bar moves smoothly and a 40-second call is not a minute.

### The period

`usagePeriodOf(billing, timezone, now)` returns `{ key, start, end, resetsOn }`:

- a stripe-mode workspace: the subscription's `current_period_start … current_period_end`, keyed by the start's ISO
  date. The billing row gains `current_period_start` (Stripe sends both; `subscriptionFacts` keeps only the end
  today). Renewal writes a new start, the key changes, the bar is empty. An upgrade keeps the anchor (Stripe's
  default), so the reset day does not move and the included rises.
- a direct arrangement, or no subscription: the calendar month in the workspace's timezone, as `leadMonth` does.

Leads move to the same period key in step 1 (their doors already take the period as a parameter, `p_month`;
`lead_renews_on` reads the row's period end), so both bars say the same day.

### The counter

`usage_counters` is `lead_counters` widened: `kind in ('usage', 'leads', 'budget', 'day')` (a rename of `allowance`
to `leads`; `budget` and `day` stay the finder's internal guards). One row per tenant, kind and period. `used` is
units for `usage`, leads for `leads`.

`usage_add(p_tenant_id, p_period, p_units, p_source_kind, p_source_id)`: security definer, execute revoked from
everyone but the service role; increments the period's row; **idempotent by source**: the pair (`p_source_kind`,
`p_source_id`) is kept in a small `usage_marks` table with a unique index, so a replayed webhook, a retried job or a
second read of the same call adds nothing. The events row stays the audit trail and the breakdown's source.

### The states

`usage_state` on the billing row, per period (`usage_state_period` beside it): `ok` under 80%, `warned` from 80%,
`over` from 100%. The transition writes the state and rings the bell once; a change of tier that brings the share
under a threshold puts the state back so a later crossing rings again.

## The meter points

| Where                                 | Today writes               | Adds                                                                                                                                                |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call lifecycle door (00031)           | `usage.voice_seconds` once | `usage_add(seconds / 6)` in the same statement                                                                                                      |
| `deliver.ts` → SMS                    | the message row            | `usage_add(2 × segments)`; segments from the body (GSM-7 160/153, UCS-2 70/67), computed in contracts, never asked of Twilio                        |
| SMS inbound door                      | the message row            | `usage_add(2 × segments)`                                                                                                                           |
| Receptionist reply (`budget.ts` path) | `usage.llm_tokens`         | `usage_add(1)` per reply on WhatsApp, web or email                                                                                                  |
| WhatsApp persist                      | `usage.wa_conversation`    | nothing more: the reply counted it                                                                                                                  |
| Ask gateway                           | `usage.ask_tokens`         | `usage_add(1)` per turn                                                                                                                             |
| Lead counting doors                   | `lead_counters.used`       | unchanged (kind `leads`)                                                                                                                            |

`budget.ts`'s day token budget stays as the receptionist's internal guard; it is not the customer's number, and Ask's
prompt stops describing it as one.

## The doors

- **`month_usage(p_tenant_id)`** (owner and operator): answers `{ period: { start, end }, usage: { used, included,
  state }, leads: { used, reserved, included } }` from the counters and the billing row. One read for every face of
  it, published as the `billing` surface's sibling `usage`, refreshed on `surface:billing` and every ten minutes while
  a tab is open.
- **`get_usage`** (an Ask read tool over the same door, with the period's breakdown by kind from `events`): what Ask
  answers "how am I doing on usage", "when does it reset", "what used it" with.
- **`propose_plan_change`** (an Ask proposal, owner only; kind `plan`): the card that names the tier or the leads
  size, the sentence of what starts today and what it costs now, and Approve. Approve calls **`change_plan`** (edge
  op): `subscriptions.update` on the product's item with `proration_behavior: "always_invoice"` up (charged today,
  applied at once) and a schedule at renewal down; refused in words for a foreign price, a direct arrangement, or a
  subscription not live. `applySubscription` then writes the new `usage_included` or `leads_included`, so the bar
  recomputes with the same `used`. Billing's picker calls the same op through the same route.
- **`plans`** (edge read, cached like `priceForClient`): the two products' live prices by `lookup_key`
  (`receptionist_starter` … `leads_3000`) with their metadata, for Ask's card, Billing's picker and the site's sheet.

## What the person sees

### The face's halo

The three are the workspace's AI wherever they are drawn: the top bar's button, the Stage's 84px face, the phone's
hero and its ✦. `AskFace` takes a `standing` (`ok` | `warned` | `over`) from the `usage` surface and draws a thin arc
around the three at `warned` (amber, `--warn`) and `over` (red, `--danger`): the halo. Under 80% there is no arc, and
the bar looks as it does today. The moods stay Ask's own (listening, reading, answering); the halo is the standing
of the thing that is running low, drawn once, around the one face. Its accessible name joins the button's ("Ask
Chanlytics, usage 89%").

### The standing line, at the Stage's feet

Under the band, in the row `.ask-reading` uses while a turn runs, one quiet line **at rest**:

```
Pro · Usage 62% · resets Oct 12 · 180 leads left
```

In `--ink-muted`; in `--warn-ink` from 80% with the forecast in place of the share ("Usage 89%, at this pace out by
Sep 27"); in `--danger-ink` at 100% ("This period's usage is used · taking messages until Oct 12"). While Ask reads,
the row is Ask's reading line, as now; the standing line comes back when the turn is done. A press asks Ask the
question ("How is my usage?") and the answer is the card below. On a phone the line sits under the hero's three at
rest, above the field, and the ✦ wears the halo.

A workspace with only the leads product reads "Leads 180 of 250 left · renews Oct 12"; a direct arrangement without a
limit reads nothing.

### The usage card (Ask's answer)

`get_usage` answers as a card (`kind: "usage"` in contracts `ask.ts`, drawn by `ask-turn.jsx` beside `lead_search`):

```
Usage · Pro                                          resets Oct 12
Receptionist   [████████████████████░░░░░░]   89%
Leads          [███████░░░░░░░░░░░░░░░░░░░]   180 of 250 left
At this pace you'll use it all by Sep 27.
What used it: calls 71% · texts 18% · messages 8% · Ask 3%   → Reports
```

The words are contracts' (`usageVM`), the same ones the standing line and Billing use. Ask's sentence around it is
its own ("You're at 89% with 17 days left; Scale would cover a month like this one. Want it?"), and the follow-up
"Yes" is the proposal below. The forecast line and the tier it names follow the same rule as the standing line:
only past a quarter of the period, only over pace. Under pace, the card is the two bars and nothing more.

### The plan change (Ask's proposal, and Billing's picker)

```
Start Scale today?
$56.67 now on Visa ending 4242, for the rest of this period,
then $199 a month from Oct 12. Your usage bar drops to 36% the same minute.
[ Yes, start Scale ]   [ Not now ]
```

The proposal is owner-only, like `propose_settings`; an operator who asks is told who can. Approve calls
`change_plan`; the card then says "Scale started" and the standing line, the halo and the bars repaint from the
surface. A downgrade's card says "From Oct 12". Billing keeps the same picker as rows, so a person who opens Billing
from the bell sees the tiers without asking.

### Where Ask brings it up on its own

- **A lead search past the size.** `propose_lead_search` today answers "that could not be checked" when the plan
  card cannot be read; with `get_usage` in Ask's context it says "You have 180 leads left this month; this search
  wants 250. Find 180 now, or take 1,000 a month?" and offers both cards.
- **A broadcast or playbook past the usage.** The proposal's card carries the line "This would use about 12% of the
  period" from the rate card (segments × recipients), and past 100% says what happens instead.
- **The over posture.** Every answer while `over` opens with one sentence: "Your receptionist is taking messages until
  Oct 12." Ask keeps working: it is how the owner upgrades.

### Reports: what used it

Billing is money; Reports is numbers over a period. The breakdown lives on Reports as one section, **Usage**, scoped
by the page's period picker like every other section: one stacked bar of units by kind (Calls · Texts · Messages ·
Ask, `--chart-cat-1..4` in that fixed order), each part direct-labelled with its share and its count ("Calls 71% ·
143 calls · 4h 13m"), a legend, the kit's table twin. Here, and only here, the natural numbers show. Ask's card and
Billing's card link to it.

### Billing: the money

Billing › Plan reads the tier's name, the price, the next invoice as it does; under it one line per product with the
bar ("Usage 89% · resets Oct 12", "Leads 180 of 250 left") and **Change**, which opens the picker: the tiers as rows
(name, price, "about N calls a day", the current one marked) and the same confirmation sentence Ask's card carries.
No breakdown here.

### The status line, the bell, Today

- At 100% the shell's one line (kind `paused`, reason `usage`): "This period's usage is used. Your receptionist
  answers to take a message until Oct 12." with the press **Get more** (Billing › Plan, the picker open). Today's alert
  line says the same sentence, as it does for a billing pause.
- The bell, kind `billing`, route `admin/billing`: at 80% "Your receptionist has used 80% of this period. It resets
  Oct 12; at this pace it runs out Oct 3." and at 100% the over sentence with the door. Once each per period.
- Nothing else repeats it: the pages keep the rule that the shell's line is said once.

### The over posture

`voiceLimited` and the paused posture take a reason. Reason `usage`: calls are answered to take a message
(`pausedVoiceFacts`, with "until Oct 12" instead of "resume from Billing"), new texts, WhatsApps and emails wait in
the Inbox for a person, playbooks and broadcasts hold, Ask keeps working. A call in progress at the moment the share
crosses 100% finishes. A change of tier lifts the posture the same minute.

## Approaches considered

**Where it lives.**

1. **A ring beside the bell** (v1): a fourth control in a top bar that has three, a popover of its own, a phone bar
   already tight. Everything in it duplicated what Ask can say.
2. **Inside Ask** (v2, recommended): the halo on the one face, the standing line at the Stage's feet, a card for the
   question and a proposal for the door. One AI, one face, one place to ask "how am I doing"; the nudge arrives in
   the same voice that proposes the search or the broadcast that would need it. Claude's own usage lives inside its
   assistant for the same reason.
3. **Only Billing and the bell**: honest but hidden; a person learns their standing when they are told it is over.

**What the bar measures.** Three allowances (rejected, Ruben); real cost in cents (unstable for the customer); a
fixed rate card (recommended: stable for them, proportional for us).

**Where the count lives.** A period counter written at the meter points (recommended) against summing `events` on
every read; `budget.ts` shows what the sum costs on a partitioned table (a 20,000-row cap for one day).

## Words (contracts, `usage.ts`)

- `USAGE_COUNTS = "Calls, texts and messages your receptionist handles. Leads are counted on their own."`
- Halo name: `usage {share}%`. Standing line: `{tier} · Usage {share}% · resets {day} · {left} leads left`.
- Forecast: `At this pace you'll use it all by {day}.` and `{tier} covers a month like this one.`
- Warned: `Usage {share}%, at this pace out by {day}`. Over: `This period's usage is used · taking messages until
  {day}`.
- Proposal: `Start {tier} today?` / `{amount} now on {card}, for the rest of this period, then {price} from {day}.
  Your usage bar drops to {share}% the same minute.` / `From {day}.`
- Lead search past the size: `You have {left} leads left this month; this search wants {count}. Find {left} now, or
  take {size} a month?`

## Data changes (one migration, step 2 of 0011)

- `billing_accounts`: `current_period_start timestamptz`, `usage_included integer not null default 1500`,
  `usage_state text not null default 'ok' check (usage_state in ('ok','warned','over'))`, `usage_state_period text`.
- `lead_counters` → `usage_counters`: the CHECK on `kind` gains `usage` and renames `allowance` to `leads` (`update …
  set kind = 'leads'` once; the doors follow). `usage_marks (tenant_id, source_kind, source_id, period, units,
  created_at)`, unique on the source.
- Functions: `usage_add`, `month_usage`; `lead_month_used` answers through `month_usage` or is dropped once the
  dashboard reads the new door (either deploy order: the new door lands first, the read moves second).

## Tests

- `usageUnitsOf`: a minute is 10, a 40-second call 6.67, a two-segment text 4, a reply 1, an Ask turn 1; a lead 0.
- SMS segments from a body: 160 GSM-7 characters is one, 161 is two (153 each), an emoji makes it UCS-2 at 70.
- `usagePeriodOf`: a subscription's period, keyed by its start; an upgrade keeps the key; a renewal changes it; a
  direct arrangement is the calendar month in the workspace's zone.
- `usage_add` on the replayed stack: the same source twice adds once; two sources add twice; the platform's row is
  unreachable; a member cannot execute it.
- The meter points, over `_fake-db.mjs`: a call's end adds its seconds once (a replayed call_ended adds nothing); an
  SMS adds its segments in and out; a WhatsApp reply adds one; an Ask turn adds one; an email reply adds one.
- The states: crossing 80% rings once, 100% once; a tier change that lowers the share resets the state; the next
  period starts `ok`.
- `usageVM`: the halo's name, the standing line in its three tones, the forecast only past a quarter and over pace,
  the tier named is the smallest that covers.
- `get_usage` and `propose_plan_change` (ask-loop tests): the card's words; an operator's ask is refused with who
  can; Approve calls `change_plan` once; a refusal is said in the card.
- `change_plan` (billing-door): up applies at once with proration; down schedules; refusals in words; the leads item
  changes alone.
- The posture: at `over`, the voice facts are the message-taking prompt with the period's day; messages wait; a tier
  change lifts it; a call up at the crossing is not touched.
- The pages (stub React): `AskFace` draws no arc at `ok`, amber at `warned`, red at `over`, with the name; the Stage's
  standing line in its three tones and its press; the usage card from a turn; the phone's line under the hero;
  Reports' Usage section from a `usage` surface with four kinds and its table twin; Billing's rows and picker.

## Risks

- **The rate card drifts from cost** (a premium voice, a heavier model). The monthly sweep compares `calls.cost` and
  the rest with the tier's price per workspace; the card is re-read against it after the first twenty paying
  workspaces.
- **A busy day at 99%.** The switch to message-taking on a busy afternoon is a strong nudge; the 80% bell with the
  forecast is what makes it fair. Ruben may prefer a grace band (the posture from 105%), one constant.
- **Ask counted** can read as a tax on the owner's own tool. At 1 unit a turn it is invisible on any tier; the
  alternative (uncounted, watched by the sweep) is one line to change.
- **A halo on the face can read as Ask's own state.** It is drawn only at `warned` and `over`, never animated, and
  its name says usage; the moods keep their motion. If it still reads wrong in use, the fallback is the standing line
  alone.
- **Two products, one subscription.** A workspace with only the leads item has no receptionist bar and no posture;
  the standing line and the card draw from what the row says it holds, never assume both.

## Open decisions (Ruben's)

1. Ask counted at 1 unit a turn, or not counted.
2. The over posture at 100% or after a grace band (105%).
3. Operators see the halo, the standing line and the card (proposed yes); only owners get the proposal and the
   picker.
4. The forecast line and the tier it names in the first PR or after the bars.
