# 0055 · A plan is steps the server expands

**Status:** Built on the lane `ask/the-marketing-manager`, 10 to 12 October 2026, and not yet merged (Ruben approved its
spec on 10 October 2026, "i approve", and on 11 October 2026 said "go with best suggestions as the senior dev and
continue", under which the review's calls below were taken as recommended). Written against commit `5e178d62c` on that
branch: the lane with main's `425d8a52d` merged in. The number is the next free one after main's 0054, and is
checked again at the pull request. Where this note and the code disagree, the code wins.

## Context

On 10 October 2026 Ruben asked that Ask think like the owner's marketing manager: know every offer and campaign, write
messages for WhatsApp, email and text, and turn "10% off all next month" into the right mix of what exists and what is
new (`docs/superpowers/specs/2026-10-10-ask-the-marketing-manager-design.md`, §0 to §2). The lane began on main at
`ef0aea36a`; read here on main at `b220a8b74`, the main first merged into it (`735b16279`):

- **Ask could not write a message or propose a reminder.** `propose_campaign` picked a message the Library held or a
  moment's starter; the setup rule said "Never propose a reminder before or after an appointment"
  (`apps/dashboard/src/server/ask/prompt.ts:90`), and the playbook action offered no appointment moment
  (`apps/dashboard/src/server/ask/tools/act/playbook.ts:110`, `PROPOSABLE_TRIGGERS`).
- **Nothing did several dependent things at once.** "Each card is its own press" (`prompt.ts:90`), and every card lapsed
  after a day (`packages/contracts/src/ask/ask.ts:221`, `ASK_CARD_FRESH_MS`). A campaign on a new list or a new message
  waited for a next question.
- **No record held an offer's dates.** A note for the receptionist was a title and a text
  (`packages/contracts/src/config/workspace-config/business-profile.ts:121-126`), told until someone deleted it. A
  campaign had no last day and no trial, and a run took its class's mode as it stood
  (`packages/core/src/campaigns/run-playbook.ts:364`).
- **A one-off send was not held by the week's breath.** The composer said "N of them heard from a campaign or a
  broadcast this week" and sent to them anyway (`packages/contracts/src/broadcasts/broadcast-audience.ts:271-274`).
- **The review link was read and dropped.** The Google sync read the location's `newReviewUri`
  (`packages/channels/src/google/google-profile.ts:154`), and `google_listings` had no column for it.

## Decision

The model states an intent; the server expands it into steps, deciding what to reuse and what to make in code tested
with no model (contracts `planOf`, `packages/contracts/src/ask/plan.ts`). The steps that send nothing are one press;
each send is its own.

**1. The plan's shape** (the plan's seven amendments to the spec, and the rulings made while building it):

1. **A plan is the group of ordinary cards its steps make.** No `plan` card kind and no `POST campaigns/plan`. Each card
   is stamped `plan: { id, step, of, silent, after }` (`apps/dashboard/src/server/ask/tools/act/plan.ts:240-246`). The
   silent ones are committed in order by `commitPlan`, each through its own spec and route under the key
   `plan:<id>:<n>` (`apps/dashboard/src/legacy-bridge/ask/commit.ts:103`); a send unlocks when the steps it names are
   done. Undo stays per card, and decision 0031 holds per record: each step's door writes its record and its decision as
   it does alone.
2. **`propose_plan` is the action `propose_campaign.plan`**, not a twenty-first tool: each role is held to twenty tools.
3. **A stamped card can be approved for a week** (`ask.ts:259,269`, read from its stamp); any other card, a day.
4. **The review ask is a second starter**, `after_visit_review`: utility, on the day after an appointment, three
   channels, its third value the review link, offered only where the Google listing keeps one
   (`packages/contracts/src/templates/starter-templates.ts:273-277`).
5. **The `change_playbook` door is replaced** in 00416 to take `params`, `until` and `trial_until` beside its six keys,
   and `start_playbook` to write the two dates.
6. **A message is written through one door**, `POST templates/message`: every version filed, WhatsApp submitted, one
   answer (`apps/dashboard/src/server/campaigns/write-message.ts`).
7. **A tool call may return several cards** (`ProposalOutcome.proposals`), kept by the loop where it kept one.

And, ruled while building:

- **The reminder is a sentence, not a second send.** A send enrols its people at its Approve, so who has not booked is
  known only on the day; the plan's words say when to ask for it, nineteen days in or on the offer's last day where a
  calendar can say who booked (`PLAN_WORDS.reminderAsk`, `plan.ts:299`).
- **The month's offer is paused, and resumed by hand.** A running one that has not ended is paused while the offer
  runs, and the words say to resume it after the offer's last day (`plan.ts:282,561-564`). Nothing resumes it by itself.
- **A plan paces only an offer that starts today.** Where the calendar has fewer open slots in the days it counts than
  half the audience, the send becomes a campaign capped at the open slots a day, rounded up, ending with the offer
  (`plan.ts:211-215,634`). The room is counted from now, and a campaign sends from its Approve.
- **A later offer keeps its broadcast** to the whole list, and its words say so: to pace it to the room, dismiss the
  send and ask again on its first day (`PLAN_WORDS.roomTight`, `plan.ts:291`).
- **An operator's plan has no note.** A note is an owner's or a partner's to approve, so it is left out, and the words
  say the receptionist is not told until one of them adds it (`PLAN_WORDS.noteLeftOut`, `plan.ts:280`).

**2. What a plan's cards promise:**

- **A new campaign's trial starts at its Approve, and only under auto.** Ask's card carries `trial: true` where the
  class's mode is auto (`apps/dashboard/src/server/ask/tools/act/playbook-card.ts:143-144`), and `POST playbooks` counts
  the week from its own clock (`apps/dashboard/src/server/campaigns/playbook-row.ts:119-121`,
  `newCampaignTrialUntil`). For that week each run waits 30 minutes with a Stop, as veto's does
  (`packages/contracts/src/playbooks/playbook-schedule.ts:28`, `effectiveMode`). The composer's own campaigns start on
  none.
- **The week's breath is two-sided, and a one-off send honours it.** A message sent or due within a week of a send,
  before or after, counts against it (`packages/contracts/src/broadcasts/run-words.ts:67-70`, `heardWithin`). Those
  people are left out, never sent it: "N left out: they hear from you within a week of it" before the send, and "not
  sent: they hear from you within a week of it" after (`run-words.ts:186,240`). The composer's switch sends to them
  too; Ask's card never does. The appointment moments stay exempt, and their cards say so.
- **A setup with no silent step is plain cards.** Where every step sends (a setup's campaigns, each its own press), the
  cards are not stamped (`act/plan.ts:240`): a day's lapse, their own keys, "N cards to review"
  (`packages/contracts/src/ask/ask-answer.ts:741`). This is the spec's D3.
- **A plan's words are its answer's detail.** The round that made the plan answers with them, what no card carries
  first, cut at the answer's 700 characters (`packages/contracts/src/ask/ask-answer.ts:725`, `answerForCards`). They are
  English, so a Spanish answer carries them in English.
- **A held send never goes on a WhatsApp version still in review.** A broadcast that ticks WhatsApp, and a campaign by
  WhatsApp alone, wait for WhatsApp's approval before they can be approved
  (`packages/contracts/src/ask/plan-steps.ts:142`, `sendWaitsForReview`). Where the one message that fits an offer
  waits on that review, the plan writes no twin: the offer goes without WhatsApp and says why, or is refused in words.

**3. A step pressed again after its key's day.** The key `plan:<id>:<n>` keeps decision 0035's one day; a stamped card
can be approved for a week. A press after the key's day is held by what the turn recorded of each card (`planMadeOf`),
and where that record was lost, by each door's own rule: a message by its name (409), a campaign by its running twin
(`POST playbooks` refuses one for a card's start, `playbook-row.ts:183`, `twinRefusal`), and a send by the week's
breath, which leaves out whoever the first press reached. No migration keeps the keys longer.

**4. D4 under decision 0051.** The spec's D4 ("a reply naming the discount stays held") was written before 0051 made
"Never quote a price" do what it says. Restated: a cut in a reply ("10% off", any discount) is always held for a
person, whatever the switch says. A cut the owner wrote gives the allowance nothing
(`packages/contracts/src/config/workspace-config/price-allowance.ts`, `CUT`), so layer two swaps the reply for the held
line (`packages/core/src/inbound/steps.ts:134`). A fixed price written in the plan's note may be said only while "Never
quote a price" is off, and only through the note's last day: the allowance reads the notes in force
(`price-allowance.ts:83`, `notesInForce`). Taken as recommended; the switch-off case is listed for Ruben's
confirmation.

## Shape

- **Reads:** `campaigns.journey` (the stages and the guide, `packages/contracts/src/journey/journey-guide.ts`),
  `campaigns.messages` (the whole Library, versions in review included), `calendar.room` (open slots ahead). Ask's
  `campaigns.playbooks` says each campaign's last day and trial.
- **Acts:** `propose_campaign` with action `message` (card `message`), action `plan`, `change` with `params`, `until`
  and `trial_until`, and a new campaign (`playbook`) with its own `until` (`act/playbook.ts:603-605`); the appointment
  moments proposable where a calendar is connected.
- **Records:** `playbooks.until` and `playbooks.trial_until` (00416), a note's `until` in `tenant_config`,
  `google_listings.new_review_uri` (00415), written at the bind and by every later sync of the profile
  (`apps/edge/lib/google/profile-sync.ts:92`, `keepReviewLink`).
- **The edge keeps the trial and the last day:** core `runPlaybook` plans by `effectiveMode` and stops at
  `campaignEnded` (`run-playbook.ts:372,383`).

## Steps

One change, built on the lane, merged as one pull request. The migrations are numbered after main's 00414 and are
provisional: their numbers are claimed when the branch is about to push. The order is not either:

1. **00415 and 00416 are applied before the merge**, dry run first, by Ruben with the Supabase CLI from a linked
   worktree. 00416 before the dashboard deploys: without it every change in place fails (`PUT playbooks/:id`: Pause,
   Resume, Ask's change card). 00415 before the edge: the edge writes the review link.
2. **The dashboard deploys, then the edge, about three minutes later.** Only the edge keeps a campaign's trial and its
   last day, so until the edge's `/api/version` names the merge, no card that starts a campaign on trial or gives one a
   last day is approved.

## Tests

`tooling/scripts/tests/ask/plan/` (`planOf` by world, the cards, the commit), `tooling/scripts/tests/ask/tools/`
(the tools block's size, the message card), `tooling/scripts/tests/playbooks/change/` (the keys, the trial and the
end, and the door on a database), `tooling/scripts/tests/broadcasts/audience/a-send-breathes.test.mjs`,
`tooling/scripts/tests/templates/write-message.test.mjs`, `tooling/scripts/tests/journey/journey-guide.test.mjs`,
`tooling/scripts/tests/google/review-link.test.mjs` and its database suite. The Ask eval cases
(`tooling/evals/ask-cases.json`) are written and run by Ruben. The e2e is one describe block in `e2e/ask.spec.ts`,
written and typechecked, not yet run.

## Risks

- **The tools block.** The owner's was 60,608 characters on main at `b220a8b74` and is 70,432 at `5e178d62c`, under the
  72,000 ceiling (`ASK_TOOLS_CHARS_CEILING`). The next action may need words cut elsewhere.
- **The answer's 700 characters.** The words no card carries come first, so in a crowded plan only what a card already
  says is cut.
- **A plan half approved.** The silent steps stop at the first refused; what stood is said, and the rest stay pressable
  one by one.
- **The appointment moments from Ask** reach customers around real appointments: core's `checkPlaybook` needs a
  calendar, and the trial bounds a new one.

## Not decided here

- A `resume_on` for a paused campaign, so the month's offer resumes by itself after an offer.
- Pausing a campaign by itself at its `until`: an ended one stays running and says Ended.
- A broadcast that enrols its people at its scheduled time, which a reminder send would need.
- Raising `CROSS_PAGE_MAX`, so a setup question has the journey and the Library read into its first round.
- Ask's `workspace.settings` showing ended notes, which it leaves out today.
- A plan with only its silent steps (at least the note) when nothing can carry an offer or nobody has said yes; today
  the whole plan is refused in words.
- Keeping `card:plan:` keys eight days (a migration 00410 in the review's numbering) instead of the guards above.
- Owed, and Ruben's: applying 00415 and 00416 as Steps says; D4's switch-off case (part 4) to confirm; the
  `change_words` eval case proves only the tool (a seeded message with one text value would let
  it expect a `playbook_change` card with `params`); the e2e block and the real-app screenshots run only after 00415 and
  00416 are applied, since both read production; the live and nightly evals spend his key; the push and the `suite`
  label; his look on a desk and a phone; and decision 0035's door order (scope read before the key) is a separate task
  against main.

What would reopen this: a plan that must outlive one sitting (a week's approval stops being enough), Ask outside the
dashboard (a plan's cards approved anywhere but the Line), or a step kind that no name, twin or breath guards against
a second press.
