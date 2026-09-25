# Usage, one bar: the receptionist's plan as Claude shows it

**Status:** design, for Ruben's approval. Written 25 September 2026 against commit `095e419f`, under decision 0011
(`docs/decisions/0011-plans-are-tiers-with-extra-usage.md`). Ruben: "I do not want to count minutes … just count it as
usage; if they want more usage, upgrade … similar to the usage UI system from Claude." This is the end-to-end design
of that system: what is counted, where, how the month is kept, what the person sees, and the two doors past the top.

## What it must do

1. **One number.** A workspace on a receptionist tier sees one bar, one percentage and one reset day. Never minutes
   against texts against messages.
2. **Every cost counts, at a fixed rate.** Calls, texts, WhatsApp, email and web replies, and Ask's turns each add
   units by a rate card that does not move when we change a voice or a model.
3. **The month is the billing period.** "Resets Oct 12" is the invoice's day, not the calendar's.
4. **Past the top, two doors, honestly.** The next tier starting today, or waiting for the reset while the
   receptionist takes messages. Nothing is cut off mid-call; nothing goes silent.
5. **Leads stay apart.** Their own bar in the same places, their own size, their own door (decision 0011).
6. **Quiet.** A ring in the top bar that nobody notices until it matters; the bell rings twice a month at most.

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
- **The top bar** (`components/topbar.jsx`) carries the crumbs, Ask, the bell with its popover, and the theme
  button; the status line sits under it (`ShellStatusBar`); on a phone the same bar, the popover a sheet.
- **Charts** have validated categorical tokens (`--chart-cat-1..5`, charts.css) and the `ChartCard` kit.

## The model

### The rate card (contracts, `usage.ts`)

| What the receptionist did          | Units | Why                                                 |
| ---------------------------------- | ----- | --------------------------------------------------- |
| A second on a call                 | 1/6   | 10 a minute; a minute costs us 10–11¢ (0011)        |
| An SMS segment, in or out          | 2     | 1.3¢ carrier and Twilio, and a share of the reply   |
| A WhatsApp, web or email reply     | 1     | the model; from 1 October Meta's $0.0034 a message  |
| An Ask turn                        | 1     | real (Sonnet) but the owner's own; kept cheap       |
| A lead                             | 0     | leads are their own bar                             |

A unit is about a cent of our cost on today's stack. `usageUnitsOf(kind, n)` is the one function; the events keep
their own natural numbers (seconds, tokens, segments) and the units are derived at the meter point and stored
beside them. **Calls are counted by the second**, so a bar moves smoothly and a 40-second call is not a minute.

### The period

`usagePeriodOf(billing, timezone, now)` returns `{ key, start, end, resetsOn }`:

- a stripe-mode workspace: the subscription's `current_period_start … current_period_end`, keyed by the start's ISO
  date. The billing row gains `current_period_start` (Stripe sends both; `subscriptionFacts` keeps only the end today).
  Renewal writes a new start, the key changes, the bar is empty. An upgrade keeps the anchor (Stripe's default), so
  the reset day does not move and the included rises.
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

| Where                                 | Today writes                | Adds                                                      |
| ------------------------------------- | --------------------------- | --------------------------------------------------------- |
| Call lifecycle door (00031)           | `usage.voice_seconds` once  | `usage_add(seconds / 6)` in the same statement            |
| `deliver.ts` → SMS                    | the message row             | `usage_add(2 × segments)`; segments from the body (GSM-7 160/153, UCS-2 70/67), computed in contracts, never asked of Twilio |
| SMS inbound door                      | the message row             | `usage_add(2 × segments)`                                 |
| Receptionist reply (`budget.ts` path) | `usage.llm_tokens`          | `usage_add(1)` per reply on WhatsApp, web or email        |
| WhatsApp persist                      | `usage.wa_conversation`     | nothing more: the reply counted it                        |
| Ask gateway                           | `usage.ask_tokens`          | `usage_add(1)` per turn                                   |
| Lead counting doors                   | `lead_counters.used`        | unchanged (kind `leads`)                                  |

`budget.ts`'s day token budget stays as the receptionist's internal guard; it is not the customer's number.

## The doors

- **`month_usage(p_tenant_id)`** (owner and operator; a viewer sees the bar but not Billing's doors): answers
  `{ period: { start, end }, usage: { used, included, state }, leads: { used, reserved, included } }` from the
  counters and the billing row. One read for the ring, the popover, Billing and the status line, published as the
  `billing` surface's sibling `usage` and refreshed on `surface:billing` and every ten minutes while a tab is open.
- **`change_plan`** (edge op, owner): `subscriptions.update` on the product's item with `proration_behavior:
  "always_invoice"` up (charged today, applied at once) and a schedule at renewal down; refused in words for a
  foreign price, a direct arrangement, or a subscription not live. `applySubscription` then writes the new
  `usage_included` or `leads_included`, so the bar recomputes with the same `used`.
- **`plans`** (edge read, cached like `priceForClient`): the two products' live prices by `lookup_key`
  (`receptionist_starter` … `leads_3000`) with their metadata, for the picker and the site's sheet.

## What the person sees

### The ring in the top bar

An 18px ring beside the bell, on every workspace with a receptionist tier: the track in `--line`, the arc in
`--ink-faint` under 80%, `--warn` from 80%, `--danger` from 100%; the percentage is its accessible name ("Usage 62%,
resets Oct 12"). On a direct arrangement without a limit, no ring. It is the quietest thing on the bar until it is
not.

### The popover (a press on the ring; a sheet on a phone)

```
Usage                                              Pro
Receptionist                              62% · resets Oct 12
[███████████████████░░░░░░░░░░░]
Calls, texts and messages your receptionist handles.

Leads                                     180 of 250 left · renews Oct 12
[████████░░░░░░░░░░░░░░░░░░░░░░]

At this pace you'll use it all by Oct 3.   Scale covers this month →
See detailed breakdown
```

- The receptionist's row: the tier's name at the top right, the share and the reset day, the bar, one sentence of
  what counts. The leads' row: left of the size, the same day. Words are contracts' (`usageVM`).
- **The forecast line** appears only when `pace > 1` and the period is at least a quarter through: `pace = share of
  units used ÷ share of the period elapsed`; the day is `start + elapsed ÷ pace`; the tier named is the smallest
  whose included covers `used ÷ elapsedShare`. Under pace, nothing is said: a bar that is fine is silent.
- **"See detailed breakdown"** opens Billing › Usage.
- Over 80% the popover's sentence changes to the warned words; at 100% to the over words, with the door.

### Billing › Usage (the card under the plan)

- The two bars as above, larger, with the tier's name and the size as their eyebrows and **Change** beside each.
- **The breakdown**: one stacked bar of the period's units by what did it (Calls · Texts · Messages · Ask), in the
  chart kit's `--chart-cat-1..4` in that fixed order, each part direct-labelled with its share and its count
  ("Calls 71% · 143 calls · 4h 10m"), a legend, and the kit's table twin. Here, and only here, the natural numbers
  show: a person who wants to know why the bar moved can, and nobody has to.
- **Change** opens the picker: the tiers as rows (name, price, "about N calls a day" from the included, the current
  one marked), and for an upgrade the sentence "Starts today: $X charged to Visa ending 4242 now (the rest of this
  period pro-rated), then $99 a month from Oct 12", then Confirm. A downgrade says "From Oct 12".
- The direct arrangement's card says its included and "Talk to us" instead of Change.

### The status line, the bell, Today

- At 100% the shell's one line (kind `paused`, reason `usage`): "This period's usage is used. Your receptionist
  answers to take a message until Oct 12." with the press **Get more** (Billing › Usage, the picker open). Today's
  alert line says the same sentence, as it does for a billing pause.
- The bell, kind `billing`, route `admin/billing`: at 80% "Your receptionist has used 80% of this period. It resets
  Oct 12; at this pace it runs out Oct 3." and at 100% the over sentence with the door. Once each per period.
- Nothing else repeats it: the pages keep the rule that the shell's line is said once.

### The over posture

`voiceLimited` and the paused posture take a reason. Reason `usage`: calls are answered to take a message
(`pausedVoiceFacts`, with "until Oct 12" instead of "resume from Billing"), new texts, WhatsApps and emails wait in
the Inbox for a person, playbooks and broadcasts hold, Ask keeps working (it is the owner's, and it is how they
upgrade). A call in progress at the moment the share crosses 100% finishes. A change of tier lifts the posture the
same minute (`applySubscription` writes the row, the surface repaints, the shell's line goes).

## Approaches considered

1. **Three allowances** (minutes, texts, messages), each a bar — the market's shape (Rosie, My AI Front Desk). Exact,
   but the customer keeps three books and every limit sentence is a comparison. Rejected by Ruben.
2. **One bar of real cost** (`calls.cost` and the like, in cents). Truest to our margin, but the bar would move when
   we change a voice or a model, and a customer cannot reason about it. Rejected: the customer's number must be
   stable; our cost is watched by the sweep instead.
3. **One bar on a fixed rate card** (this design). Stable for the customer, proportional to cost for us, and one
   mechanism for every channel, on the usage events the code already writes. **Recommended.**

On storage: a per-period counter written by the meter points (recommended) against summing `events` on every read.
`budget.ts` shows what the sum costs on a partitioned table (a 20,000-row cap for one day); a period is thirty of
those. The counter is one row; the events stay for the breakdown, read once on Billing.

## Words (contracts, `usage.ts`)

- `USAGE_COUNTS = "Calls, texts and messages your receptionist handles. Leads are counted on their own."`
- Ring: `Usage {share}%, resets {day}`.
- Row: `{share}% · resets {day}`; leads `{left} of {size} left · renews {day}`.
- Forecast: `At this pace you'll use it all by {day}.` and `{tier} covers this month →`.
- Warned: `80% used. It resets {day}.`
- Over: `This period's usage is used. Your receptionist answers to take a message until {day}.` Door: `Get more`.
- Picker: `Starts today: {amount} now, then {price} from {day}.` / `From {day}.`

## Data changes (one migration, step 2 of 0011)

- `billing_accounts`: `current_period_start timestamptz`, `usage_included integer not null default 1500`,
  `usage_state text not null default 'ok' check (usage_state in ('ok','warned','over'))`, `usage_state_period text`.
- `lead_counters` → `usage_counters`: the CHECK on `kind` gains `usage` and renames `allowance` to `leads`
  (`update … set kind = 'leads'` once; the doors follow). `usage_marks (tenant_id, source_kind, source_id, period,
  units, created_at)`, unique on the source.
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
- `usageVM`: the ring's name, the rows' words, the forecast only past a quarter and over pace, the tier named is
  the smallest that covers.
- `change_plan` (billing-door): up applies at once with proration; down schedules; refusals in words; the leads
  item changes alone.
- The posture: at `over`, the voice facts are the message-taking prompt with the period's day; messages wait; a
  tier change lifts it; a call up at the crossing is not touched.
- The page (topbar test on the stub React): the ring's tone at 27 / 89 / 100; the popover's rows; the sheet on a
  phone; Billing's breakdown from a `usage` surface with four kinds and its table twin.

## Risks

- **The rate card drifts from cost** (a premium voice, a heavier model). The monthly sweep compares `calls.cost`
  and the rest with the tier's price per workspace; the card is re-read against it after the first twenty paying
  workspaces.
- **A busy day at 99%.** The switch to message-taking on a busy afternoon is a strong nudge; the 80% bell with the
  forecast is what makes it fair. Ruben may prefer a grace band (the posture from 105%), one constant.
- **Ask counted** can read as a tax on the owner's own tool. At 1 unit a turn it is invisible on any tier; the
  alternative (uncounted, watched by the sweep) is one line to change.
- **Two products, one subscription.** A workspace with only the leads item has no ring and no receptionist posture;
  the shell must draw from what the row says it holds, never assume both.

## Open decisions (Ruben's)

1. Ask counted at 1 unit a turn, or not counted.
2. The over posture at 100% or after a grace band (105%).
3. Operators see the ring and the popover (proposed yes); only owners see the picker.
4. Whether the forecast line and the tier it names ship in the first PR or after the bars.
