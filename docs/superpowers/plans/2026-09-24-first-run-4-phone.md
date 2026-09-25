# The first run, PR 4: your phone

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The phone step becomes the canvas's screens (R3–R5, P3–P5, V4–V6) instead of Setup's three rows: how calls
reach the receptionist (keep the number customers know, get a new one, or move it here), the trial with the plan's
real price that comes back to the step, the receptionist's number bought while the owner answers two questions, one
code to dial, and office phone systems.

**PR 4 in three parts, each shippable on its own and in either deploy order:**

- **4a The way and the trial** (R3, V4, V5, P3). No migration.
- **4b The questions and the code** (R4, R5, P4, P5). No migration.
- **4c Office systems** (V6). One migration: the carrier set gains `office`, and `setup_request` gains `forwarding`
  ("do it with me"). Held for Ruben before merge, as every migration is.

**What is true today (checked against `origin/main` at `16fb3f41`):**
- The phone step is `rows: ["billing","line","keep"]`, `needs: ["billing","line"]`, drawn by `SetupRows` with the old
  `LineChooser` and `ForwardingCard` under them.
- Checkout from Setup's row passes no return place, so Stripe comes back to Billing. The first run never reads
  `?billing=`.
- Setup's DTO carries neither the plan's price (`billingReadiness().price` reaches only `GET billing`) nor the
  listing's phone (`google_listings.facts.phone_e164`).
- Keeping a number needs the receptionist's own line first: `line_forwarding_set` (00067) raises without an active
  voice channel. So every way buys a line; keep and move buy one the customers never see.
- Buying is queued (`line_provision`, 202 `{queued:true}`); the page learns the line is ready by realtime on `lines`
  and `tenant_channels` (setupOverride), and the line row's sentence carries the provisioning step's words.
- Moving a number is a request a person handles (`setup_request('port')`); nothing links it to forwarding.

## 4a: the way and the trial

**Architecture:**
- **Setup carries two more facts.** `SetupBillingFacts.price` (Stripe's, from `billingReadiness`) and
  `SetupGoogleFacts.phone` (the listing's number, E.164). Both optional on the wire, so either deploy order works.
- **Contracts `first-run-phone.ts`: what the phone step says.** `firstRunPhoneOf(input)` over the Setup DTO, its VM,
  the owner's choice as the tab keeps it, and whether this tab came back from checkout:
  - `stage`: `choose` (no line yet and one can be bought, now or after the trial), `starting` (back from checkout,
    the webhook not landed), `getting` (a line on its way: the line row's own sentence and detail, canvas R4 "the step
    words are Setup's own"), or `rows` (everything else: no line provider, a failed or stuck line, billing that needs
    Billing, a port or a line asked of a person, and a line that answers). `rows` draws Setup's rows as today, so
    every case the rows already handle stays handled.
  - `ways`: keep (first, recommended, its title naming the listing's number when there is one), new, move; the
    sentences are the canvas's.
  - `trial`: only where the billing door is open and nothing was ever subscribed: "14 days free, then $49.00 a month"
    and "We ask for a card now, and nothing is charged until 8 Oct. You can cancel anytime from Billing." With no
    readable price, the offer is the days alone; with no trial days, the price alone and the day is today.
  - `cta`: the step's one coral button, named for the result (V4 "Start my trial with (305) 555-0142", V5 "Start my
    trial and ask for the move"), and `held` while it cannot go (new with no number picked, keep or move with no
    number typed).
  - `areaCodeOf(e164)`: the three digits a US number is bought in.
  - Heading and lead per stage (R3: "How should calls reach your receptionist?").
- **The page (`FrPhone` in first-run.jsx).**
  - The choice is kept in the tab (`__tabMemory` draft `first-run-phone`: way, the number to keep or move, the
    number picked, and `pending` once the button is pressed), because Stripe's round trip reloads the page. A tab
    that lost it asks again; nothing is stored on the server.
  - The button, where a trial is needed: keep the choice with `pending`, move the address to `start/phone` (so the
    step stays on screen once its line answers), and `__billing.checkout("start")`.
  - Where the workspace may spend (on its return, or already trialing): keep and move search the kept number's area
    code and buy the first number offered; move also files the port request; new buys the number picked. Once per
    tab (a ref and the draft's `pending`), and the edge refuses a second line anyway.
  - On arrival the page reads `__billing.outcome()` once: `success` is the `starting` stage until the trial lands;
    `cancel` says `CHECKOUT_OUTCOME_WORDS.cancel` and asks again.
  - A new number: the area code (the listing's, pre-filled) and three numbers to pick from (`__setup.lines.search`),
    as the radio cards Find draws.
  - Gates: checkout is `billing`, a search and a buy are `team`, a port is `approve` (the doors' own roles).
- Once the line answers, keep and move fall back to Setup's rows (the keep row and its forwarding card) until 4b.

**Tests:** `first-run-phone.test.mjs` (the VM over made-up DTOs: every stage, the trial words, the held button, the
area code), `setup.test.mjs` (the two facts reach the DTO shape), `first-run-page.test.mjs` (the phone step draws
FrPhone in `choose` and the rows in `rows`).

## 4b: the questions and the code

- While the line is on its way (and before it, for keep and move once the trial is on), two questions: which phone
  rings (a mobile, a landline, an office phone system) and the phone company (Verizon, AT&T, T-Mobile, another).
- Once the line answers: forwarding is saved (`__setup.forwarding.set`, unanswered calls) and the code is shown:
  three plain steps, the answering-machine warning, the switch-off code; on a phone that is the business mobile, a tap
  to dial (P5). "Done, let's try it" goes on to Try it; "The code didn't work" offers the other carrier's code.
- The phone step then holds the keep row until forwarding is instructed, for keep and move.

## 4c: office systems

- An office phone system is shown the receptionist's number to forward to, with "we'll do it with you" (decision 3).
- Migration: `line_forwarding_set` accepts carrier `office` (no star code: the keep row says so), and `setup_request`
  accepts `forwarding`, which emails the platform as a port does.

## What is not in PR 4

- The test call and Live (PR 5).
- Automating a port (a person files it).
- Texting on the new number (not sold).

## Tasks (4a)

### Task 0: the worktree runs the gates
- [ ] `cm-first-run`, branch `feat/first-run-phone` off `origin/main` at `16fb3f41`; the suite's baseline.

### Task 1: Setup carries the price and the listing's number
**Files:** `packages/contracts/src/billing.ts` (`SetupBillingFacts.price?`), `packages/contracts/src/google.ts`
(`SetupGoogleFacts.phone?`), `apps/dashboard/src/server/setup.ts`, `tooling/scripts/tests/setup.test.mjs`.
- [ ] Failing test, the two fields, pass, commit.

### Task 2: the phone step's view model
**Files:** `packages/contracts/src/first-run-phone.ts` (new, exported), `first-run.ts` (`FIRST_RUN_HELPERS.phone`,
`areaCodeOf`), `tooling/scripts/tests/first-run-phone.test.mjs`.
- [ ] Failing tests for every stage and word, the VM, pass, commit.

### Task 3: the page
**Files:** `apps/dashboard/src/legacy/pages/first-run.jsx`, `first-run.css`, `Chanlytics.html` and the manifest's
`?v=`, `tooling/scripts/tests/first-run-page.test.mjs`.
- [ ] FrPhone, the tab's choice, the checkout, the buy, the outcome; tests; commit.

### Task 4: the gates, the look, the review, the PR
- [ ] prettier, the dists, typecheck, lint, format:check, check-dist, gen-route-types --check, the suite.
- [ ] Look at it on the probe, desktop and phone, light and dark.
- [ ] One whole-branch review (standards and spec), one fix round.
- [ ] The PR: what changes for a customer, nothing to set, either deploy order.

## As built, 4a (24 Sep 2026)

- **As planned:** the view model (`first-run-phone.ts`, published as `__firstRun.phone`), the two Setup facts, and
  FrPhone with its choice in the tab. While choosing, the step draws its own foot (Back, why the button is held, the
  button); FirstRun's foot comes back for every other stage. The step's classes are `fr-line-*`, apart from the
  phone-width chrome's `fr-phone*`.
- **What the review round fixed:**
  - A refused buy let go of the mount's guard, so the next press buys.
  - Stripe returns to the bare `start`, so the page moves to `start/phone` on a `success` with a pending choice.
    Keep and move then stay on the step once the line answers.
  - The return is kept in the tab (`returnedAt`, 15 minutes), so a reload before the webhook still says "Starting
    your trial…" and never offers a second checkout.
  - A buy's `sent` mark is a time. A mark older than two minutes is a buy that never landed, and the step looks again
    on a timer.
  - A role that may not buy clears the pending choice.
  - A number to keep or move must be a US number with its area code before the button lets go (`areaCodeOf`,
    `held.us`), so no card is taken for a number that cannot be forwarded.
  - The trial note says the days, never a day worked out here (Stripe dates it).
  - Every number is written by `formatPhoneDisplay`, never Twilio's `friendly`.
  - The status is a pill with its state's word, and the sentence sits beside it, not inside the pill.
- **Left as it is on purpose:**
  - The step reads the line's phase from `voice_state` and the shared `lineStuckProvisioning`, not from a phase
    exported by `setupSteps`. Exporting one means reshaping the line row, which is not this PR's.
  - `billing.price` is passed through from `billingReadiness`, which reads the edge; `setup.test.mjs` pins `google.phone`
    only.

## As built, 4b (24 Sep 2026)

- **The questions.** They are asked while the number is on its way (`buying`, `getting`) and once it answers (`ask`).
  - They are drawn in the record kit's radiogroup (`RecordToggleGroup`) and kept in the tab's choice (`rings`,
    `company`).
  - A mobile is asked its company. A landline takes the landline codes (`forwardingCarrierOf` → `other`), as
    `forwardingCodes` has always treated one.
  - "Show me what to dial" is held with "Ready in a moment" until the line answers. After that it saves through
    `POST lines/forwarding`, which now re-reads the settings as well as Setup (the card's kept number).
- **The code** is drawn from the saved forwarded row, so it survives a reload and follows a mode Setup's card saved
  (every call).
  - The code is words, not a link: an iPhone refuses a `tel:` with `*` or `#`, and a desk has no dialer. An outlined
    "Tap to dial" shows on Android only, and the step's one coral button stays "Done, let's try it".
  - "The code didn't work" opens forwarding's own notes.
  - "Change the answers" asks about the number the saved forwarding is for. The same answers save nothing (saving again
    would drop a verified test), and "Keep the code I have" goes back.
  - A tab that lost the answers names the saved carrier and says neither mobile nor landline.
- **A role that may not save the forwarding** gets the page's own foot, with Continue.
- **What the review round fixed:** the saved mode; the landline guessed from `other`; "Change the answers" that was a
  dead link or pointed at the listing's number; re-saving a verified row; a non-owner stuck at the questions; `tel:`
  links on an iPhone and a desk; the radiogroup's keys; the stale `kept_line` after a save; a double press while Setup
  was read again.
- **Left as it is on purpose:**
  - The phone step's `needs` stays billing and line, so the step is done once the line answers. The code shows while
    the address is `start/phone` (the page goes there on every press and on the return from Stripe). Setup's keep
    row stays on Today's card for an owner who left before dialling.
  - Setup's ForwardingCard stays as it is for Settings' own path. The first run draws its own card from the same
    contracts (`forwardingCodes`).

## As built, 4c (24 Sep 2026)

- **Migration `00173_an_office_phone_forwards.sql`.** 00172 was already taken by another branch. It redefines
  `line_forwarding_set` (00067) and `setup_request` (00123) whole, each with one more value: carrier `office`, and
  request `forwarding` (its bell opens `start/phone`). Signatures are unchanged.
- **Contracts.**
  - `Carrier` gains `office` ("An office phone system"). Its `forwardingCodes` is the receptionist's number with no
    switch-off code, and notes on where to set it and what keeps calls away.
  - `forwardingDialLabel` says what to do for every card, Setup's ForwardingCard included, which also hides an empty
    switch-off code.
  - Setup's keep row says "Forward … in your phone system's settings" for an office system.
  - `SETUP_REQUEST_KINDS` gains `forwarding`, and `SetupDto.requests.forwarding` carries its newest ask.
- **The first run.**
  - "An office phone system" is the third answer to which phone rings. It asks no company and saves carrier
    `office`.
  - The code screen is V6: the number to forward to, the steps in the system's settings, the voicemail warning, how
    to switch it off, and "Do it with me" (`setup_request('forwarding')`, gated as an operator's ask). Once asked,
    the screen says when, from Setup's own read.
- **The edge** emails the platform what to do for a `forwarding` ask.
- **Deploy order:** apply 00173 before merging. A dashboard with this change on a database without it refuses the
  office answer with "Unknown carrier." and the ask with "Unknown request."; nothing else changes.
