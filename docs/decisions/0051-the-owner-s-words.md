# 0051 · The owner's words

**Status:** Built in one change, 11 October 2026 (Ruben: "no need to have a cap on greeting let users do whatever they
want in such regards we can provide tips or warnings thats it where applicable and suggested and continue as you
suggest"). Written against commit `a3fcbffbf` (main, 11 October 2026, after #1559). Where this note and the code
disagree, the code wins.

## Context

Ruben asked, on 11 October 2026, that an owner may change the phone greeting, even to drop the recording sentence or
the words "automated assistant", and "just about any rule, even about pricing", with a warning where the change is
risky. Read against `a3fcbffbf`:

- **The phone greeting was code's alone.** `packages/contracts/src/voice/greeting.ts` composed it from the business's
  name, and `apps/edge/lib/voice/call-start.ts` sent it as the call's `greeting` variable, which Retell speaks as
  `begin_message`. Nothing stored changed it; its comment called the two disclosures "promises the product makes".
- **"Never quote a price" changed one prompt line and nothing else.** The checks read no switch: `violatesNoPrices` in
  `packages/core/src/inbound/steps.ts` layerTwo swapped any price out of a chat reply, and `spokenBreach` flagged any
  on a call. That was the owner's own decision of 20 September 2026 (`rule-strengths.ts`, the Business tab spec), and
  the tab told owners so: "checked, even with this off".
- **"Says it's an assistant if asked" was a switch** over one prompt line (`compose.ts` rulesSection), "Told, and
  nothing checks the answer". Text channels said they were automated only when asked.
- **Prompt frames restated the rules whatever the switches said:** the whisper, the steer and the photo turn
  (`contracts/voice/whisper.ts`, `core/src/inbound/vision.ts`), and steer's own refusal (`edge/lib/receptionist/steer.ts`).
- **"Hung up" was under fifteen seconds** (`contracts/conversations/call-dto.ts` ABANDONED_MS), justified by a greeting
  of about ten.

Two facts outside the tree shape the decision, and are not the code's to prove (see Not decided here): Anthropic's
usage policy, read on 11 October 2026, asks every consumer-facing agent to "disclose to users that they are interacting
with AI rather than a human", "at a minimum at the beginning of each chat session", and the receptionist runs on Claude
on every channel; and about a dozen US states require every party's consent to record a call.

The production rows were counted the same day: of seven workspaces, none stored `never_quote_prices` or `disclose_ai`
as false, so making the switch honest changed what no workspace's receptionist says at deploy.

## Decision

1. **The owner writes the greeting, with no cap and nothing refused** (`brain.profile.phone_greeting`, `{business}` for
   the name). One thing is held where the line is spoken, whatever any door stored: the caller is told it is an
   automated assistant. A line that never says so has the product's clause added; a line that denies it, or claims to
   be a person, is not spoken, and the standard greeting is. Everything else is the owner's, with a note that says what
   it means: the recording sentence left out or denied, a long line, a web address, a slot that is not filled, a
   discount or deposit, a price while "Never quote a price" is on. Paused, and on a call whose settings cannot be read
   in time, the standard lines play.
2. **"Never quote a price" does what it says.** On, it says no price. Off, it may say the amounts the owner wrote in a
   service's price box, a note or a booking note, and only those: any other figure is swapped out of a chat reply and
   flagged on a call, as before. A share, a discount, a deposit or a refund is never in what it may say (money stays a
   person's, the locked row). This reverses the 20 September 2026 decision, and settles the engine review's Part 7 item
   8 workspace-wide rather than per service.
3. **Saying it is an automated assistant is always on**, no longer a switch: a line in every prompt, composed or stored,
   that it is the business's automated assistant and never a person, and, in text, that it opens a conversation
   quiet for more than a day by saying so. Still "Told": nothing checks the answer.
4. **The owner's words lose to a rule above them**, and the prompt now says so in its last line.

## Shape

- **The greeting:** `contracts/voice/greeting-owner.ts` (`greetingOf`, `greetingNotes`, `statesAutomated`,
  `deniesAutomated`), English and Spanish, judged with the business's own name taken out. Read by call-start (with the
  greeting's source on the `retell_inbound` log line), the first run's card and its Live step (`SetupDto.business.phone_greeting`),
  and the Business tab's row "Greets every caller with" (`surfaces/settings/business/phone/`), shown where the workspace
  answers calls. Retell's own default greeting stays the standard one: no provider write.
- **Prices:** one predicate, `priceBreach(text, allowed)` in `contracts/config/policy.ts`, over `priceFigures` read
  canonically (`$1,200` is 1200, `20% off` is `20%`, "forty-five dollars" is 45, "$45-60" is 45 and 60, "2x1" never
  2); one derivation, `priceAllowance` in `contracts/config/workspace-config/price-allowance.ts`, which counts the
  greeting's own figures as written ones while the switch is off and the line is the one callers hear. Called by
  layerTwo (so the reach-out draft and the nightly too), the call webhook (read only when the turns name a price),
  steer (plus the amounts the owner typed into the instruction) and the eval judge, which the eval door hands the
  workspace's allowance (`allowed_prices`). On a call the greeting's own turn, the agent's first before the caller
  speaks, is never read (`spokenBreach`): the line is heard as written, and with the switch on nothing after it may
  repeat its price. The Business tab lists what it may say under the switch.
- **Disclosure:** `compose.ts` standingRules (`PromptAudience`: a reach-out reply draft, which the owner sends as
  themselves, is never told it), and `contracts/config/workspace-config/assistant-disclosure.ts`, whose fact
  `describeLead` says.
- **Hung up:** a caller who never spoke, where the row carries its transcript; fifteen seconds otherwise.

## Steps

One change, built and merged together. Edge first is the better order: an older edge drops `phone_greeting` (the
profile schema strips what it does not know) and speaks the standard greeting while the tab says "saved". **Both
orders:** an older dashboard's save keeps the key (`withStoredKeysKept`); an older edge reads every switch as before.
No migration.

## Tests

**Convert:** the price pins (price-always-blocked becomes price-switch: the switch now matters), the prompt snapshots (the always-on lines, the
retired switch line), the Business tab's rule words, the frames' words, the photo turn, person-draft's percent figure.
**Keep:** the money charter, the standard greeting's words, the nightly's strict cases. **New:** the figure table, the
allowance, the greeting and its notes, the disclosure fact, the call webhook's allowance, the hang-up reading.

## Risks

- A set of figures cannot say which service a figure belongs to: a listed $45 may be said for another service. The
  list under the switch is the control.
- The disclosure in text is told, not checked, and "under way" counts any message, the owner's or a campaign's.
- A partner (the agency) can save the greeting; the version table (00402) says who.

## Not decided here

- The usage policy's reading, the all-party-consent states, and who carries the notice duty when the owner drops the
  recording sentence: counsel's. The privacy page says recordings exist "where the owner enables it", while every
  call is recorded; its words are counsel's too.
- A code stamp on the receptionist's own first text reply, the only way text disclosure becomes checked.
- The "On the phone" card (the engine review's Lane 7), the transfer number's one home, and the Reports figure's
  fifteen-second rule in SQL.

## Amended, 18 November 2026: it says "AI assistant"

Ruben, 18 November 2026, while a lead's preview was reviewed: "lets not force our opinions of how ai should be used to
other users/businesses", "we can recommend via smart indicators or something and provide a default but allow changes",
and then "The recommended default should just be 'I'm the AI Assistant' without name".

- **The product's own words for what answers are "AI assistant"** where they were "automated assistant": the standard
  greeting ("Hi, {business}. I'm the AI assistant, and calls are recorded. How can I help?"), the paused one, the clause
  added to an owner's line that never says it ("I'm the AI assistant.", and in Spanish "Soy el asistente de IA."), the
  text receptionist's opening and its answer when asked what it is (`compose.ts`), the whisper's reminder, a lead's
  preview's first line, and the screens that quote what callers hear.
- **The default names nobody.** Where the owner gave it a name (0073) the line says the name beside the words, "I'm
  Ava, the AI assistant", as before.
- **Nothing else of this decision moves.** The owner writes the greeting with no cap. A line that says it in any words
  is the owner's as written, "automated assistant" among them (`statesAutomated` reads it as it did); one that never
  says it has the clause added; one that denies it, or claims to be a person, is not spoken. It is still a default and
  a clause, never a switch: the model's usage policy was read again on 18 November 2026 (effective 12 November 2026)
  and asks that consumer-facing agents that talk with a business's customers disclose that they are AI, "at a minimum
  at the beginning of each chat session or in the product interface", with no exception listed.
- **Steps.** Words only, no migration, either deploy order: an app not yet deployed says the old words until it is. The
  standard greeting on every Retell agent is the shell's default (`GREETING_DEFAULT`), so the new default reaches a call
  whose settings cannot be read in time only after a converger run on every agent
  (`tooling/scripts/ops/voice/voice-converge.mjs`, a dry run, then `--apply --publish`, on Ruben's word); until then
  that one case speaks the old standard line and the agents' check reads a drift.
- **Not built here:** an indicator beside the line as it is written, on the preview and in Settings, and the business's
  own words for the clause (next); the line with nothing said of what answers (not offered, for the policy above).
