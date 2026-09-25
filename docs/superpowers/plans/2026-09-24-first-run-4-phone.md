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
