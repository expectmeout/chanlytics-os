# Ask, the marketing manager: design spec (PRD)

**Status:** APPROVED by Ruben, 10 October 2026 ("i approve", with leave to rethink the wiring while planning).
**Amended by the plan** `docs/superpowers/plans/2026-10-10-ask-the-marketing-manager.md` the same day, whose first
block lists seven amendments that win over §5.4 and §5.8 where they differ: a plan is a group of ordinary cards (no
`plan` card kind, no `POST campaigns/plan`), `propose_plan` is the action `propose_campaign.plan` (the registry holds
every role to twenty tools), the lapse is read from the card's stamp, the review ask is a second starter, the
`change_playbook` door is replaced for its three new keys, a written message is filed through `POST templates/message`,
and a tool call may return several cards. Nothing built yet. Written against `origin/main` at `ef0aea36a`
(#1537), read by three read-only explorations on that commit (Ask's tool layer; campaigns, messages and moments; the
receptionist's knowledge, lists, calendar and doors) and checked by hand where this document names a line; the code wins
where they disagree. Branch `ask/the-marketing-manager`, worktree `cm-ask-manager` (source only, no install yet). To be
built end to end on the local branch, by one Sonnet implementer per part with one combined review round each, and pushed
as one pull request labelled `suite` after Ruben's review (his 9 October rule for the moment lane).

Asked by Ruben on 10 October 2026 in three messages: that Ask should think like the owner's marketing manager; that it
should know every offer and campaign, recommend and write new messages for WhatsApp, email and text, turn "I want to offer
10% off all next month" into the right mix of existing and new campaigns with clear reuse-or-create logic, and have a
clean canvas of tools; and whether an API or MCP is a better medium. The three chat rounds that led here are summarised
in §2; the decisions this document assumes are §3, each one his to flip at approval.

Abbreviations: `ct/` is `packages/contracts/src/`, `srv/` `apps/dashboard/src/server/`, `act/` `srv/ask/tools/act/`,
`read/` `srv/ask/tools/read/`, `core/` `packages/core/src/`, `db/` `packages/db/src/`, `edge/` `apps/edge/lib/`, `mig/`
`supabase/migrations/`, `cmp/` `apps/dashboard/src/surfaces/campaigns/`. Dn is decision n of §3. The product's words
hold: a **campaign** (never "sequence", `docs/glossary.md:87`), a **message** with a **version** per channel, a
**moment**, a **list**, an **offer** is a marketing-category message (`docs/glossary.md:79-80`). This document adds one
word, **plan**: steps the server expands from an intent the model states (§5.4), the compact plan the 9 October spec
named as its first later step (M1).

## 0. In one paragraph

Ask already proposes a campaign at any offered moment, a one-off send, a list by rule, a lead search, a receptionist
note, hours and closures, each as a card the owner approves. What it cannot do is write a message, propose a reminder,
or do several dependent things at once; what the product cannot do is state an offer with dates anywhere the
receptionist reads, hold a one-off send to the weekly breath, or run a new campaign on trial. This spec adds one tool
(`propose_plan`), one act action (`propose_campaign.message`), three read actions (`campaigns.journey`,
`campaigns.messages`, `calendar.room`), four small record changes (a note's end date, a campaign's `until` and
`trial_until`, the Google review link), and the rule that a plan's silent steps are one press and each step that sends
is its own. The model states an intent; the server decides what to reuse and what to make, in code that is tested with
no model at all.

## 1. Goal

An owner says one of these and gets a plan they can approve in one sitting, with every real send behind the gates that
already exist (the class's mode, the run's approval, the week's breath, the cap, the hours, consent, the allowance):

1. "I want to offer 10% off colour all of November."
2. "Set up my campaigns." / "What am I missing?"
3. "Write a win-back for people who haven't been in since summer, in Spanish too."
4. "Remind people the day before and thank them the day after."

And the receptionist, on the phone and in chat, knows the offer while it runs and not after.

Success is measured, not felt: the eval cases of §8 pass on the default model (the Wilson bound the runner already
applies), the tools block grows by a measured number of characters that the pull request states, and a plan for case 1
fits one turn (three rounds, 45 s, 4,000 tokens a round: `ct/ask/ask.ts:35,37,110`).

## 2. What the product does today (measured on `ef0aea36a`)

**Ask's canvas.** Twenty tools for an owner, nine reads and eleven acts, forty-three action definitions, eighteen card
kinds (`srv/ask/tools/registry.ts:61-71,83-95`; `ct/ask/ask.ts:164-182`). The offer is per role and per action, never
per surface (`srv/ask/tools/offer.ts:28-53`); every action carries `input_examples` (`offer.ts:33-40`), dropped once on
a 400 (`srv/ask/loop.ts:593-595`). No tool is strict, none deferred, no tool search, no programmatic calling. The owner's
tools block measured 50,153 characters on 27 September (`docs/superpowers/specs/2026-09-25-ask-rewired-design.md:839`)
and has grown since (`channels`, `change`); no later figure exists. The loop runs parallel tool calls (`loop.ts:680-682`),
returns several cards in one turn, and tells the model to leave a campaign on a *new* list to the next question
(`srv/ask/prompt.ts:90`). Cards lapse after a day (`ct/ask/ask.ts:221`, checked at commit,
`apps/dashboard/src/legacy-bridge/ask/commit.ts:81`). No bundle, group or plan of cards exists anywhere.

**Messages.** One table, `templates`, unique on `(tenant_id, channel, name, language)` (`mig/00004_inbox.sql:45-58`); a
message is the rows sharing a name and language, one per channel. Email and text versions are saved at once by
`save_template_version(p_tenant_id, p_name, p_language, p_channel in ('email','sms'), p_subject, p_body)`
(`mig/00296_a_message_has_a_version_per_channel.sql:25-31,54`); a WhatsApp version is submitted to Meta through
`POST templates` → `submitTemplate` → the edge's `templates-create` (`srv/campaigns/template-submit.ts:56-59`,
`srv/campaigns/meta-templates.ts:60-90`, `edge/whatsapp/template-admin.ts:78-100`, MARKETING or UTILITY only), and the
webhook moves `meta_status` (`edge/whatsapp/waba-events.ts:374-396`). The product promises "usually within minutes"
(`ct/shell/campaign-rooms.ts:58,105`), the composer "usually minutes, sometimes a day". **Ask cannot write a message**:
`propose_campaign` picks a `template_id` or lets the moment's starter be filed at Approve (`act/playbook.ts:498-510,
598-606`; `act/broadcast.ts:183-199`); `params` fill slots only. The month's offer starter has a free-text "The offer"
slot (`ct/templates/starter-templates.ts:90-96,144`). The dashboard already drafts a message for the composer by a
model (`POST templates/draft`, `srv/campaigns/templates.ts:103` for the slot rules), so the words a model writes already
have a validator.

**Moments.** Live: `quiet_30` or `lapsed` (one Win-back, chosen by whether a calendar is connected,
`ct/playbooks/playbook-triggers.ts:249-305`), `visit_tomorrow`, `visited`, `everyone_monthly`, `saved_list`,
`proposal_waiting`. **Retired: `new_week` (Welcome) and `phoned_only` (Save our number)** (`playbook-triggers.ts:237-242`).
Reach-outs (`lead_first`, `after_step`, at most 5 steps) are not moments (`:99-125`). A customer campaign sends one
message; the 30- and 45-day rules are fixed in code; the knobs are `run_hour` 9-20, `cap_per_run` 1-500, `gap_days`
7-365, `cadence_days` 1-90 (`:140-153`), `channels`, and `state` running or paused (`:131`). Ask may not propose the
appointment moments: the setup rule says "never a reminder" and decision 24 of the 9 October spec sends them to forms.

**The breath and the hours.** One playbook message per person per week across every playbook
(`playbook-triggers.ts:178-179`, applied at `ct/playbooks/playbook-reach.ts:374-377`; appointment moments exempt,
`:344-358`). A one-off send counts as a touch (`db/repositories/touches.ts`) but is **not held** by the breath: the
composer says "N of them heard from a campaign or a broadcast this week" and sends anyway
(`ct/broadcasts/broadcast-audience.ts:262-274`). Sends go 9:00-20:59 on the business's clock (`playbook-triggers.ts:142`,
`ct/playbooks/playbook-schedule.ts:65-76`, `core/campaigns/create-broadcast.ts` step 4b). Texts never carry offers
(`ct/broadcasts/reach-for.ts:101-102`); email offers need the campaigns domain verified and a postal address
(`ct/broadcasts/email-offers.ts:1-12,41-46`); 2,000 emails and 500 texts a month (`reach-for.ts:327-330`).

**Modes.** Per class in `policies` (`docs/data-model.md:2326-2342`): reply auto, booking auto, faq auto, reengage ask,
campaign ask, reviews ask, money never (trigger-locked), follow_up ask, outreach veto (`mig/00274:35-38`; classes
`ct/config/policy-classes.ts:13-23`, allowed modes `:125-137`). A run reads the class's mode
(`core/campaigns/run-playbook.ts:364-379`); veto is a 30-minute Stop with a notice (`:333-338`). Nothing is per campaign.

**The receptionist and offers.** No offer, promotion or coupon record exists (searched `mig/`, `ct/`, `edge/`). The
receptionist reads no playbook or broadcast (`edge/receptionist`, `edge/voice`: none); it sees a send only as thread
history (`core/messages/broadcast-channels.ts:297-299`, `core/deliver.ts:680-690`, the last 16 turns,
`db/repositories/thread.ts:112-142`). A reply naming a discount, coupon, promo or price is held for a person
(`ct/config/policy.ts:74-82,108-116`). Notes are `{title, text}`, ten of 80 and 1,200 characters, no dates
(`ct/config/workspace-config/business-profile.ts:121-127`; `config-rules.ts:138-161`), rendered as "Other things to
know:" (`ct/config/workspace-config/compose.ts:385-388`). Ask adds a note with `propose_settings.add_note`
(`act/settings.ts:43-71`).

**Coverage.** Campaigns home already computes the journey (`first_contact`, `before`, `after`, `proposal`, `quiet`;
`ct/journey/journey.ts:23`), each stage `covered` or not, and says "N of M moments are covered"
(`ct/playbooks/lifecycle/lifecycle.ts:286-290`; decision 0041). J4 of that decision plans "Ask's journey action" later.
Ask's `campaigns` read has `audiences`, `playbooks`, `broadcasts`, `broadcast` (`read/campaigns.ts:457-481`); it lists
sendable messages only, never one still in review (`srv/readers/templates.ts:134`).

**Capacity.** `srv/readers/openings.ts` wraps `openingsFor` over the feed and the appointments record
(`ct/calendar/availability.ts:143-198`, `BOOKING_DEFAULTS.max_days_ahead = 14`, `:56`). No code says how full the book is.

**Reviews.** The Google sync reads `new_review_uri` and drops it (`packages/channels/src/google/google-profile.ts:82,154`);
`google_listings` keeps `maps_uri` only (`docs/data-model.md:1056`). No review-ask message exists; the after-appointment
starter asks how it went (`starter-templates.ts:215`).

**Lists.** Rules take twenty fields (`ct/people/lists/list-rules.ts:38-150`): visits and timing, channel and origin,
activity, consent, attention and deals. Not service, visit count, spend, tag or language (`:8-9`). Evaluation is
TypeScript over loaded rows, not SQL (`mig/00155:14-18`); the server-side count is decision 0021's unbuilt steps 4-5.

**Evals.** 102 cases in `tooling/evals/ask-cases.json` (`id, text, surface, expect, must_never, context, then`; `expect`
keys `tools_any`, `tools_order`, `proposals_any`, `proposals_max`, `card_fields_not`, `next_any`). None names
`propose_campaign.broadcast` or `.channels`, `propose_lead_search`, `propose_whisper`, `propose_deal`,
`propose_autonomy`, `propose_thread_verb` or `propose_person.mode`.

**Doors outside the dashboard.** No public API keys, no outbound webhooks, no MCP server, no web chat (searched; decision
0042 names "a host such as Claude or ChatGPT" as what would reopen a protocol).

## 3. Decisions this spec assumes (Ruben's to flip at approval)

| # | Decision | Taken as | Reverses |
|---|----------|----------|----------|
| D1 | Ask may write a new message, a version per channel, shown whole on the card | **Yes** | decision 30 of the 9 Oct spec ("starters only") |
| D2 | Ask may propose the appointment moments (`visit_tomorrow`, `visited`) where a calendar is connected | **Yes**; core's `checkPlaybook` already refuses them without one | decision 24 ("forms for reminders") and the setup rule's "never a reminder" |
| D3 | `propose_plan` now, for an offer and for "set up my campaigns" | **Yes** for both. The plan *card* appears only where a plan has silent steps (a message, a list, a note, a change): an offer has them, a setup of campaigns usually has none and comes out as one campaign card per stage. Decision 28's "only if owners stall" was written before an offer needed dependent steps | decision 28 (narrowed, not reversed) |
| D4 | While an offer runs, may the receptionist confirm its discount? | **No change**: the note states the offer; a reply naming the discount stays held under the price rule; a per-offer switch is a later lane | nothing |
| D5 | A new campaign Ask proposes runs on trial: for its first seven days `auto` behaves as `veto` | **Yes**, per campaign (`trial_until`), never by changing the class's mode | nothing |
| D6 | An API, webhooks or an MCP server as the medium | **No**; they are lane 7 of the 9 Oct plan (web chat, then keys and webhooks, then MCP). The registry stays the one place every capability is defined, so an MCP server later wraps it and a proposal over MCP is still a card approved in Chanlytics | nothing |
| D7 | New list fields (visit count, service, language) | **Not here**: they need the person read to carry visits and services, which is lane 6 (server-side lists). "Regulars" waits | nothing |
| D8 | The phone greeting's wording | **Out**: it is fixed in code on purpose (`ct/voice/greeting.ts:14-16`), and Ask Rewired §7 keeps free text the receptionist says verbatim out of Ask. Ask drafts a sentence in prose and opens Settings › Business; editing waits on the voice settings pane (`docs/voice-agent-settings.md`) | nothing |
| D9 | The Monday review note ("Program 1 sent 42, 9 replied") | **Not here**: a notification kind and a sweep of its own, after the plans have run for a month and the `last_30_days` read is what owners actually open | nothing |
| D10 | Effort for a plan turn | Stays `low`; the server does the expansion. Raised only if the §8 evals show the intent mis-stated | nothing |

## 4. Design in one picture

```
owner: "10% off colour all of November"
   │
   ▼  (round 1, in parallel)                    reads, unchanged in kind
   campaigns.messages · campaigns.playbooks · people.lists · calendar.room · workspace.settings
   │
   ▼  (round 1 or 2)
   propose_plan { intent: "offer", offer: { words, from, until, service?, who? }, say? }
   │
   ▼  server: planOf(intent, world)  — pure, in contracts, tested with no model
   steps: 1 message (reuse|write) · 2 list (reuse|make) · 3 note (until) · 4 send on the 1st · 5 send on the 20th to not-yet-booked · 6 pause the month's offer (if it runs)
   │        silent ────────────────┘  one press         each a card of its own, waiting on the plan ─────────┘
   ▼
   plan card (silent steps) + one card per step that sends, held until the plan is done
   │
   ▼  Approve the plan → POST campaigns/plan: step by step, each through its own door, stops at a refusal and says what stood
   ▼  Approve a send → its own route, as today, with the ids the plan made filled in
```

## 5. The pieces

### 5.1 Reads (`read/`)

- **`campaigns.journey`** (new action): what Campaigns home computes, as data: the stages in order, each `covered`,
  its state words, what runs on it, and the moment it needs (`campaignsHomeOf`'s head and rail, `lifecycle.ts:333-357`,
  through `srv/readers/playbooks.ts`'s read so the number Ask says is the page's). Plus `guide`: the trade's touch
  points as rows (`ct/journey/journey-guide.ts`, new: stage → what a business of this kind sends, in neutral words that
  `trade-neutral.test.mjs` accepts; one guide, keyed by `sells_by` and the calendar, not by trade words, until a second
  trade's facts differ). This is J4's "Ask's journey action" of decision 0041, landed early; J4's stored journey is not.
- **`campaigns.messages`** (new action): the whole library by message: name, language, category, each channel's
  version with its state (`approved`, `pending`, `rejected`, none), the slots it takes, and which campaigns use it
  (`srv/readers/templates.ts`, widened: today's reader lists sendable ones only). Ask never writes a twin of a message
  still in review because it can now see it.
- **`calendar.room`** (new action): open slots in the next fourteen days by day, from `srv/readers/openings.ts`, summed:
  `{ days, open, taken, open_by_day }`. No chairs, no staff: the appointments record and the feed are what the product
  has (§2). Sized at the reader, never a projection the tool invents.
- `campaigns.playbooks` says `trial_until` and `until`; `workspace.settings` says a note's `until`.

### 5.2 Writing a message (`act/campaign.ts`, action `message`, card kind `message`) — D1

Input: `name`, `language` (`en`|`es`), `category` (`marketing`|`utility`), `versions: { whatsapp?: { body }, email?:
{ subject, body }, sms?: { body } }`, `slots?: [{ n, source }]`. Checks, in the handler (none write):

- The slot rules of `srv/campaigns/templates.ts:103` (`{{1}}` first name, a slot for the business name, `@booking_link`,
  `@review_link` from §5.6); a body under WhatsApp's length; an `sms` version on a `marketing` message is refused with
  `reach-for.ts:101`'s words ("texts never carry offers"); a `whatsapp` version is refused where no number is active
  (`template-admin.ts:78-100`'s refusals, said before Approve, not after); an `email` version where the mailbox is not
  set (`reach-for.ts:192-199`).
- A twin: a message of the same name and language exists (`campaigns.messages`) → refused with "add a version to it
  with `change`, or name it differently".
- The card quotes every version as the customer reads it (`act/says.ts`'s `previewSays`, per channel), says which
  channels go at once and which wait on Meta's review ("usually minutes, sometimes a day"), and the category's consent.

Commit: `POST templates/versions` for email and text (the composer's route over `save_template_version`), then
`POST templates` for WhatsApp (`submitTemplate`), as the composer does, in that order so a Meta refusal leaves the
other versions filed and the receipt says so. Undo: `remove_template_version` (`mig/00296:131`) for each version made,
ten minutes; a WhatsApp version already approved by Meta is left and the receipt says so (deleting a template at Meta is
a separate decision). Needs operator; gate `approve`; `open` → the Library's message.

`change` gains `params` (the slot text of a campaign's message) so "make the month's offer say 10% off colour" is one
card where today it is none.

### 5.3 The appointment moments from Ask — D2

`PROPOSABLE_TRIGGERS` (`act/playbook.ts:110`) widens to `MOMENT_TRIGGERS` minus the ones the workspace cannot run
(`momentOffered`, decision 0041 §5): where a calendar is connected, `visit_tomorrow` and `visited` are proposed like any
moment, their starters filed at Approve as today. The setup rule's "never a reminder" becomes "a reminder only where a
calendar is connected, and the card says it is exempt from the week's breath" (`playbook-reach.ts:344-358`).

### 5.4 The plan (`srv/ask/tools/act/plan.ts`, tool `propose_plan`, card kind `plan`) — D3

**Input: an intent, not steps.** `{ intent: "offer", offer: { words, from, until, service?, who?, channels? }, say? }`
or `{ intent: "cover_journey", stages?: [...] }`. `words` is the offer in the owner's words ("10% off colour");
`from`/`until` dates; `who` a list token from `people.lists` or `campaigns.audiences`, default the built-in "can receive
offers" list (`offers_ok`); `say` the owner's own phrasing to keep. Nothing else: the model never names a template id, a
list id or a date to send on. Two `input_examples`.

**Expansion: `planOf(intent, world): PlanStep[]`** in `ct/ask/plan.ts` (pure; `world` is what §5.1's reads return plus
the workspace's channels, notes and hours). The rules, each a test row:

| Step | Reuse when | Make when |
|---|---|---|
| **Message** | A message of the offer's category and language exists whose slots take the words (the month's offer starter's "The offer" slot, or a `@offer` slot), and it holds a version on every channel the plan sends on | Otherwise: a `message` step with a version per channel the workspace can send offers on (never `sms` for an offer), written from the starter's shape and the owner's words; dated one day before the first send when it has a WhatsApp version (Meta's review), else the day of |
| **List** | A built-in or an existing list has the same rule (compare rules, `listRuleParts`, not names) | A `list` step with the rule (for the 20th: "said yes to offers, no appointment booked since `from`") |
| **Note** | A note titled for this offer with the same `until` exists | A `note` step: title "Offer: {words}", text with the dates, `until` = the offer's end (§5.5) |
| **Sends** | Never | A `broadcast` step on the 1st at the next open hour; a second on the 20th to the list of step 2 when the list's count is above zero at expansion (else the step is omitted and the plan says why) |
| **The month's offer** | It runs and its message is the one reused | Else, if it runs: a `change` step pausing it until `until` + 1 (so nobody gets two offers), or, where its message is the reused one, a `change` setting its slot text |
| **Pace** | `calendar.room.open × 2 ≥` the audience | Else the first send becomes a `playbook` step on the offer's list: `saved_list`, class `campaign`, `cap_per_run = open`, `gap_days = 90`, `until` = the offer's end (§5.5), so the offer goes out as fast as she can serve it and stops when it ends; the plan says the number |

For `cover_journey`: one `playbook` step per uncovered stage the workspace can run, with the moment's starter (D2 for the
appointment stages); a `proposal_waiting` step only where deals are on; nothing for `first_contact` (the receptionist
covers it, `lifecycle.ts:126`).

**Each step is checked as its own card.** The plan handler calls the existing act handlers (`messageAction`,
`propose_list`'s, `propose_settings.add_note`'s, `broadcastAction`, `playbookAction`, `playbookChangeAction`) with the
step's input, in dry run as they already run (an act tool never writes; it validates and returns a proposal,
`registry.ts:73-83`). A step's refusal is the plan's refusal, in that handler's words, and the model may restate the
intent once. A step that references an earlier step carries a token (`list: "@step:2"`, `template_id: "@step:1"`) the
handlers accept as "made by this plan" and skip the existence check for; the commit fills it (below).

**Two proposals come out of one call**: the `plan` card holding the silent steps (message, list, note, change) with the
sending steps listed as "then, each its own press"; and one `broadcast` or `playbook` card per sending step, carrying
`after: <plan card id>` and its `@step` tokens. `AskProposal` gains `after?: string` (`ct/ask/ask.ts:162-205`). A card
with `after` is drawn held ("waits for the plan") until the plan's outcome is `done`; its commit resolves each `@step:n`
from the plan's outcome `made[n].id`, refuses if the plan was undone, and otherwise runs as today through its own route
(`legacy-bridge/ask/commit.ts:72-99`). A plan with no silent steps is not made: the sends are proposed as plain cards.

**Commit of the plan**: `POST campaigns/plan` (new route; policy: workspace scope, role operator, rate `write`, spend
none, input = the steps' zod union). The route re-validates every step against the world again (as every commit does),
then applies them in order through the doors each step would have used alone (`save_template_version`, `submitTemplate`,
`POST lists`'s verb, `settings-write`, `change_playbook`), each recorded as that door records it (its event or decision,
decision 0031), with `via: "ask"` and the plan card's id as the key. A refusal stops the plan at that step; the answer is
`{ made: [{ step, kind, id, words }], stopped?: { step, refusal } }` and the receipt says what stood ("The message and
the list are filed; the note was refused: ...; the sends wait on you"). Undo: the made steps in reverse within ten
minutes (`remove_template_version`, the list's delete, the settings version before), refused once any send on them has
been approved. Needs operator (an owner-only step, if any, raises the plan's `needs`); gate `approve`; `open` →
`campaigns/in:lists` or the message, by the first step made. The plan card and its held sends lapse after **seven days**,
not one: `ProposalSpec` gains `lapseMs?` (default `ASK_CARD_FRESH_MS`), read by `askCardLapsed`.

**Why the sends are their own press.** Decision 27 of the 9 October spec: one press for steps that send nothing, its own
press for any step that would. A send's card says the allowance, the count, and who heard this week, as today.

### 5.5 Dates on the records

- **A note ends.** `NoteSchema` gains `until?: YYYY-MM-DD` (`business-profile.ts:121-127`; `AskSettingsChangeSchema`'s
  `add_note` takes it, `ct/ask/ask-settings-change.ts:45-47`). `notesSection` renders "- {title} (until 30 Nov): {text}"
  and omits a note past its `until` on the business's clock (`compose.ts:385-388`), so the phone and chat stop stating
  an offer the day it ends and nothing deletes the note (Settings shows it as ended). No migration: notes live in
  `tenant_config.config`.
- **A campaign ends.** `playbooks.until date null` (migration): a run on a day past it is `off("ended")`, recorded once
  (`run-playbook.ts:364-379`'s `off`); the ledger says "ended {date}"; `change` takes `until`.
- **A campaign on trial.** `playbooks.trial_until timestamptz null` (same migration): while `now < trial_until` and the
  class's mode is `auto`, the run plans as `veto` (`planRun(mode, now)` takes the effective mode; `:333-338`'s notice
  says "on trial until {date}"); `ask`, `veto` and `never` are unchanged. Ask's `playbook` and `plan` steps set
  `trial_until = now + 7 days` and the card says so; the composer's own campaigns set none; `change` clears it. D5.
- **The review link.** `google_listings.new_review_uri text null` (same migration), written by the sync where
  `google-profile.ts:154` already reads it; `@review_link` joins the slot sources beside `@booking_link`
  (`act/broadcast.ts:53-68`, `srv/campaigns/templates.ts:103`); the after-appointment starter gains an optional closing
  line that fills it ("If you have a minute, here is where to leave a review: {{3}}"), in both languages, filed as today
  at Approve. No new starter, no new Meta category.

### 5.6 The breath holds a one-off send

A broadcast's recipients who heard from a campaign or a broadcast this week are **held** (`broadcast_recipients.state`
skipped with reason `heard_this_week`, through the recipient door) unless the send carries `breathe: false`;
`create-broadcast.ts`'s audience step reads the touches it already counts (`broadcast-audience.ts:262-274`,
`db/repositories/touches.ts`). The composer keeps its sentence and gains a switch "Also send to the N who heard this
week", off by default; Ask's `broadcast` card says "N left out: heard from you this week" and never sets `breathe: false`. If
`broadcast_recipients`' reasons are a closed set in SQL, the migration widens it; `gen:schema-sets` follows.

### 5.7 The prompt and the offer (`srv/ask/prompt.ts`, `offer.ts`)

`ASK_RULES` (`prompt.ts:75-97`) changes three lines: "For an offer, a promotion, or a whole setup, call `propose_plan`
once with the intent and leave the steps to it; never assemble the steps yourself" replaces the batching line at `:90`
for that case; "A message's words are written only through `propose_campaign.message`, and every channel's version is
on the card"; the reminder line of §5.3. The Campaigns surface line (`:448`) names `propose_plan` for setup questions.
Every new action's description is three to four sentences in the registry's voice (what it does, when, when its sibling
is better, its limits), with examples; `toApiTools` stays deterministic and sorted. The tools block is measured before
and after (`toApiTools(owner, true)` in characters, a test that prints it beside the fixture) and the pull request states
the growth; tool search (`defer_loading`) stays the fallback the Ask Rewired spec named, taken only if §8's selection
cases fall.

### 5.8 The card on screen

`plan` is drawn where every card is (`apps/dashboard/src/legacy/pages/ask-turn.jsx`, the 9 October `playbook_change`
precedent): the title, the steps as rows with a glyph for reuse (the existing thing's name) or make (what will be
made), each sending step under "Then, each its own press", one Approve, Not now, and after Approve the outcome per step.
A held send card wears "Waits for the plan" in place of Approve until the plan is done. Words from
`ct/ask-proposals/plan.ts` (the spec) and `ct/ask/ask-answer.ts`'s count sentence ("A plan of 4 steps and 2 sends to
review"). The kit's classes only; the route's JS growth is argued in the pull request's `Bundle:` line against the
800 KB ceiling (the route sat at 94.9% on 10 October).

### 5.9 A salon with a calendar and nothing running, through this spec

On "set up my campaigns": the journey read says First contact covered (the receptionist), the day before and after
uncovered (calendar connected), Quiet uncovered; the plan proposes three campaigns (reminder, after-appointment with the
review line, win-back by appointments) on trial for a week, as three campaign cards and no plan card (no silent
step, D3), three presses that each send; Ask's prose recommends the month's offer and a partner search next (`do.next`), each its own question.
On "10% off colour in November": §5.4's six steps. What this spec does not give her: a "Regulars" list (D7), a new
greeting (D8), a Monday note (D9), dollars earned (no booking is linked to a message; the `campaigns` read says
`last_30_days: { sent, replied }`, and that is what the card and the answer say).

## 6. What does not change

Every real send's gates (§1); the card charter (an act tool never writes; the commit re-checks role and state through the
verb's own route); money, consent recording, Keep/Stop on leads, booking, the prompt box (Ask Rewired §7); the class
modes' meaning; the page's words and the glossary's ban on "sequence"; the receptionist's hold on a reply that names a
price or a discount (D4); reach-outs (a plan never contains a lead search or a reach-out: a lead search spends and has
its own card, which the answer may point at); the one send door; the readers as the one read path; the moment lane's
ledger, rail and address; nothing to Expo; no new dependency.

## 7. Parts: one branch, six commit groups, one pull request

Each part is its own commit group on `ask/the-marketing-manager`, built by one Sonnet implementer with one combined
review round, gates green on the files it touches (`node tooling/scripts/checks/test.mjs <file>` per file; never the
whole suite locally), then the next. Nothing is pushed until Ruben has reviewed the branch; the pull request is labelled
`suite`. Migrations are numbered from **00408** (00392 and 00393 are claimed by the evidence lane in `cm-glass`, not yet
merged) and renumbered at the pull request if taken (`docs/debt.md`'s rule; two files on one number fail the build).

| Part | What lands | Doors it needs |
|---|---|---|
| **P0 Evidence** | Eval cases for the eight actions no case names (§2), and the cases of §8 for this spec written first, red where the tool does not exist yet; the tools-block measurement test | none |
| **P1 Reads** | `campaigns.journey` (+ `journey-guide.ts`), `campaigns.messages` (reader widened), `calendar.room`; `trial_until`/`until`/note `until` said by the reads once P3 lands; fixtures regenerated | none |
| **P2 Words** | `propose_campaign.message` and card `message` (§5.2); `change` gains `params`; `@review_link` + `google_listings.new_review_uri` + the after-appointment line (§5.5); `PROPOSABLE_TRIGGERS` widened (§5.3); prompt lines | migration A (`new_review_uri`), `POST templates/versions` and `POST templates` rows in `route-policy.json` if their input changes, `docs/api.md`, the typed client |
| **P3 Dates** | Note `until` + `notesSection`; `playbooks.until` and `trial_until` + `run-playbook.ts` + ledger words + `change` fields; the breath holds a broadcast (§5.6) | migration B (`playbooks.until`, `playbooks.trial_until`, the recipients' reason), `gen:db-types`, `gen:schema-sets`, `gen:schema-snapshot`, `gen:data-model` |
| **P4 The plan** | `ct/ask/plan.ts` (`planOf` + its table of worlds), `act/plan.ts`, card spec `ct/ask-proposals/plan.ts`, `AskProposal.after`, `lapseMs`, `POST campaigns/plan`, the commit's `@step` resolution, the card on screen (§5.4, §5.8), prompt lines (§5.7) | `route-policy.json` row, `docs/api.md`, the typed client, `ask-registry`/`ask-specs` fixtures, `ADDED_SINCE` |
| **P5 Proof** | The §8 evals run by Ruben on the default model (they spend the receptionist's key); the real-app pass (dev server, the plan card at 1440 and on a phone, screenshots in the pull request); e2e; `docs/decisions/0043-a-plan-is-steps-the-server-expands.md`; the spec's "As built" section | his key, a workspace with a calendar and a WhatsApp number for the Meta path (never production's customers: the e2e workspace) |

Either deploy order works for every part: the dashboard derives everything from columns that are null until written, the
edge reads `until` on a note as an optional field, and a run reads `trial_until`/`until` as null where the migration has
not landed (the dashboard's writes to them fail loudly, not silently, until it has: the pull request says "apply B before
the dashboard").

## 8. Tests

- **`planOf` is the heart and runs with no model**: `tooling/scripts/tests/ask/plan-of.test.mjs`, a table of worlds →
  steps: offer with a reusable month's-offer message; offer needing a new message with/without a WhatsApp number; offer on
  a workspace with no email offers (domain unverified → email version omitted and said); list reuse by rule, not name;
  the 20th send omitted at zero count; the running month's offer paused vs its slot changed; pacing to open slots
  flipping a broadcast into a capped playbook; `cover_journey` with and without a calendar, with and without deals;
  every refusal word. Each row is one `planOf` call and a deep-equal.
- **Act tools over `_fake-db.mjs`** (`tooling/scripts/tests/ask/`): `message` refuses an `sms` offer, a twin, a missing
  number; `plan` returns a plan card plus held send cards with `after` and `@step` tokens; a `@step` token resolves at
  commit and refuses after an undo; `lapseMs` by kind.
- **Routes**: `POST campaigns/plan` applies steps in order, stops at a refusal, records each door's event, keys on the
  card id (a replay answers once, decision 0035), undoes in reverse and refuses the undo after a send; `route-policy.json`
  pins it; `gen:api-reference` is regenerated or the suite fails.
- **Core**: `run-playbook` on trial plans `auto` as `veto` and says so; a run past `until` is `off("ended")` once; a
  broadcast's recipients who heard this week are skipped with the reason unless `breathe: false`
  (`tooling/scripts/tests/campaigns/`).
- **Contracts**: `notesSection` renders and expires `until`; `@review_link` fills; the after-appointment starter in both
  languages passes `trade-neutral.test.mjs`; the journey guide's words pass it too; the kit gallery has no new class.
- **Database** (`*.db.test.mjs`, skip without credentials): migrations A and B apply twice; the recipients' reason is
  accepted; RLS on the new columns as the table's.
- **Evals** (`tooling/evals/ask-cases.json`): (1) "10% off colour all of November" → `tools_order` reads then
  `propose_plan`, `proposals_any: plan, broadcast`, `proposals_max: 3`, `card_fields_not: template_id` on the plan (the
  model names no ids); (2) "set up my campaigns" with a calendar → `tools_any: propose_plan`, `proposals_any: playbook`, `proposals_max: 3`,
  `card_fields_not: plan` (no silent step, so no plan card); (3) the same
  without a calendar → no appointment moments, `next_any` points at the calendar's setting; (4) "write a win-back in
  Spanish too" → `propose_campaign.message` with `es` and no `sms`; (5) "remind people the day before" → `playbook`
  `visit_tomorrow`; (6) `must_never`: a plan for "send everyone a text with 10% off" proposes no `sms` version and says
  why; (7) the eight uncovered actions from P0, one case each. Run by Ruben: `E2E_BASE_URL=... REPS=3 node
  tooling/scripts/eval-ask.mjs` against a local build on the prod edge, the Wilson bound as the runner applies it.
- **E2e** (`e2e/ask/plan.spec.ts`, the e2e workspace, which owns its data): ask for an offer, see the plan card and two
  held sends, approve the plan (email-only versions so nothing reaches Meta), see the message in the Library and the note
  in Settings, and refuse every send route as `refuseAnswers` refuses lead answers (asserted 0 sends). The real-app pass
  of P5 is screenshots, not a spec.

## 9. Risks

- **The tools block.** Twenty-one tools and about seven more actions on a block already past the docs' 10k-token
  guidance; selection accuracy is measured by the §8 cases, and `defer_loading` is the named fallback. The growth is
  stated in the pull request.
- **A round's 4,000 tokens.** A plan card plus three held cards is the largest answer Ask has produced; the plan card
  is compact (steps as one line each; the versions' words are on the `message` step only). Measured by the eval's
  `cap_hits`; if it overruns, the held sends are proposed on the next turn with the plan's id, not expanded.
- **Meta's review and the first send.** A new WhatsApp offer dated the 1st and written on the 1st reaches WhatsApp people
  late; the plan dates the message step a day earlier and the card says so, and the breath/hours gates are unchanged.
- **A plan half applied.** The route stops at a refusal and says what stood; the undo reverses it. Not atomic across
  Meta, by design; the receipt is honest.
- **The appointment moments from Ask (D2)** reach customers around real appointments; `checkPlaybook`'s calendar
  requirement and the trial (D5) bound the blast radius; the breath exemption is said on the card.
- **Collisions.** Migration numbers (00408+, renumbered at the PR); `ask-turn.jsx` and `prompt.ts` move daily (fetch and
  rebase before the pull request; `?v=` bumps one above main's); the evidence lane's `cm-glass` branch touches
  `srv/log.ts` and will merge first.
- **Disk.** `C:` had 2.9 GB free on 10 October, then 20 GB after Ruben cleared space the same day: enough for the
  install, a dashboard build and this worktree's `.next`. The cache is removed when the lane merges
  (`feedback_fewer_worktrees`).
- **Cost of the proof.** P5's evals spend the receptionist's key; a plan turn is one turn (no background job), so the
  cost per case is the usual.

## 10. Files

New: `ct/ask/plan.ts`, `ct/ask-proposals/plan.ts`, `ct/journey/journey-guide.ts`, `act/plan.ts`,
`apps/dashboard/app/api/v1/campaigns/plan/route.ts`, `srv/campaigns/apply-plan.ts`, `mig/00415_a_listing_keeps_its_review_link.sql`,
`mig/00416_a_campaign_ends_and_runs_on_trial.sql`, `tooling/scripts/tests/ask/plan-of.test.mjs`,
`e2e/ask/plan.spec.ts`, `docs/decisions/0043-a-plan-is-steps-the-server-expands.md`.

Changed: `read/campaigns.ts` (two actions), `read/calendar.ts` (`room`), `srv/readers/templates.ts` (the whole library),
`act/campaign.ts` (+ `message`), `act/playbook.ts` (`PROPOSABLE_TRIGGERS`, `trial_until`), `act/playbook-change.ts`
(`params`, `until`, `trial_until`), `act/broadcast.ts` (`@review_link`, `breathe`), `act/settings.ts` (note `until`),
`srv/ask/prompt.ts`, `srv/ask/tools/registry.ts`, `ct/ask/ask.ts` (`after`, kinds), `ct/ask-proposals/spec.ts`
(`lapseMs`), `ct/ask/ask-settings-change.ts`, `ct/config/workspace-config/business-profile.ts`, `compose.ts`,
`ct/templates/starter-templates.ts`, `ct/playbooks/playbook-triggers.ts` (limits for `until`), `core/campaigns/run-playbook.ts`,
`core/campaigns/create-broadcast.ts`, `ct/broadcasts/broadcast-audience.ts`, `ct/playbooks/lifecycle/lifecycle-ledger.ts`
(ended/trial words), `packages/channels/src/google/google-profile.ts` + its writer, `legacy/pages/ask-turn.jsx`,
`legacy-bridge/ask/commit.ts`, `tooling/scripts/tests/route-policy.json`, `docs/api.md`, the generated client and types,
`tooling/evals/ask-cases.json`, the frozen tools fixture, `docs/system-prd.md` (the Ask and campaigns sheets).

## 11. Planned elsewhere

| Item | Owned by | The seam this spec leaves |
|---|---|---|
| Server-side lists, visit count / service / language fields, "Regulars" | lane 6 of the 9 Oct plan | `planOf` takes the lists it is given; a new field is a rule part |
| The Monday review note | its own lane after a month of plans | `campaigns.playbooks.last_30_days` is the number it will say |
| Web chat, API keys, outbound webhooks, MCP | lane 7; decision 0042's reopening | the registry is the one definition; `propose_plan` over MCP is a card |
| A per-offer "the receptionist may confirm this discount" switch | later, Ruben's product call | the note's `until` is the offer's one record |
| The greeting's middle sentence | the voice settings pane (`docs/voice-agent-settings.md`) | Ask's prose + `do.open` to Settings › Business |
| A stored journey (`tenants.journey`) and the word's Settings row | J4 of decision 0041 | `campaigns.journey` reads the derived journey today and the stored one when it exists |
| Usage wired to pricing (a plan's model spend) | lane 8 / decision 0010 | a plan turn is one Ask turn in `ai_usage` |

## 12. Decisions taken in this document

1. The model states an intent; the server expands it (`planOf`), so reuse-or-create is code with tests, never prompt.
2. One press for the silent steps, its own press for each send (decision 27 kept).
3. A plan's held sends resolve `@step` tokens at commit from the plan's outcome; a plan is never applied twice (the card
   id is the key).
4. Message writing goes through one act action with every channel's version on the card; an offer never has a text
   version.
5. Dates live on the records (`note.until`, `playbooks.until`, `trial_until`), never in a second "offer" table.
6. A one-off send honours the breath by default; the composer's switch is the only way past it.
7. The appointment moments are proposable where a calendar is connected, on trial.
8. No new page: the plan shows as a card and its records show where they already do.
9. Tool search, programmatic calling, a higher effort and an MCP server are measured-for, not built.
