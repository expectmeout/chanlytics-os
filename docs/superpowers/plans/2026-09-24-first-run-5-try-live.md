# The first run, PR 5: try it, and live

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last two steps become the canvas's screens (R6–R9, P6–P8, V7, V8, C2).
- **Try it:** the owner calls from their cell and doesn't pick up. The page moves the moment the call starts ("It
  picked up", which is forwarding proven), shows the words a turn behind the voice, then the whole call, and asks
  where transfers go: the phone they called from, or take a message.
- **Live:** what it answers, where it puts callers through and emails the owner, and what it knows; the real greeting;
  "It will / Not yet". Finish records the activation and sends the "you're live" email.

**PR 5 in two parts, each shippable on its own and in either deploy order:**
- **5a Try it** (R6, R7, R8, P6, P7, V7, V8). No migration.
- **5b Live** (R9, P8, C2's email). No migration expected: the email goes out through the edge's `notify`. A new
  notification kind would need its CHECK.

**What is true today (checked against `origin/main` at `8b6be0c1`):**
- The try step's `needs` is `receptionist`, and that row is ready once the line answers and the name and hours are
  saved. No call is needed, so the step finishes itself.
- Nothing opens the forwarding test window. `markForwardingVerified` (edge, on every inbound call) only matches
  inside one (`line_forwarding_test`, 30 minutes), so the first run never proves a kept number.
- Calls are in `supabase_realtime`. `liveOverride` reads them on every page (`window.__LIVE`, `toLiveVM`).
  `LiveCallVM.number` is display only; `CallDto.from_e164` is the raw number. The Setup surface does not refresh on
  `calls`.
- The transfer number is `brain.profile.handoff_number`. Empty means take a message (voice-shell). It is saved
  through the Business tab's saver (`PATCH_OF.handoff_number`) and checked by `whyNotAHandoff` (never the receptionist's
  own line, never the kept one).
- Finish on Live only goes to Today. `POST capabilities/voice` records the activation (00108).

## 5a: Try it

- **A new Setup row, `try`** ("Try it"). It is present once calls are answered, and ready once a call has reached the
  receptionist (`voice.lastInboundAt`). Its sentence names the number to call: the kept one while forwarding is saved,
  else the receptionist's own. It is not required.
  - Today's card shows it first until a call comes in (`SETUP_CARD_ORDER`).
  - The try step needs `receptionist` and `try`.
  - Skipping the test (after one nudge, V8) puts off `try-skipped` in the member's own Setup view. That counts the step
    as done in the first run, and Today's row stays.
- **Contracts `first-run-try.ts`, `firstRunTryOf`,** over the Setup DTO, its VM, `__LIVE`'s calls, when the screen
  opened, and whether the nudge was shown.
  - `listen` (R6): the number to call, large; for a kept number, the route line and the test window's minutes.
  - `call` (R7, P6): "It picked up." with "Forwarding works" (a kept number), the call's clock, and the turns.
  - `done` (R8, P7): "That's your receptionist." with the length, the caller and the number it came through, the
    turns, and the transfer choice. The choice is "Put them through to <the caller>", offered only where
    `whyNotAHandoff` allows it, or "Take a message and email me". For a kept number it says why not the business's own
    number.
  - `quiet` (V7): after three minutes with no call, the three causes of a missed call, "Show the code again" (a kept
    number) and "Ask Chanlytics for help" (`setup_request('forwarding')`).
  - A call counts if it is inbound and started no earlier than a minute before the screen opened.
- **The page (`FrTry`).**
  - On arrival, for a kept number not verified and with no open window, it opens the test window
    (`__setup.forwarding.test`). When the screen opened is kept in the tab (`first-run-try`).
  - The transfer choice saves through the Business tab's saver.
  - Continue goes on to Live.
  - "It's in your Inbox too" goes to the Inbox.
- **Setup reads again when a call ends** (`calls` on setupOverride, only for an update to `ended`), so the step and
  Today's row follow.
- **`LiveCallVM.from`:** the caller's number as stored (E.164), beside `number` (display).

## 5b: Live

- The summary (R9, P8): answers, puts callers through to, emails you at, knows. The real greeting. "It will / Not
  yet" in the Business tab's own sentences (`abilityRows`, `cannotRows`).
- Finish records the voice activation and asks the edge for the "you're live" email (C2), then goes to Today.

## Tasks (5a)

- [ ] Setup's `try` row, the step's needs, the skip, the card order; tests.
- [ ] `firstRunTryOf` and `LiveCallVM.from`; tests.
- [ ] `FrTry`, the test window, the transfer save, Setup's refresh on an ended call; tests.
- [ ] The gates, the look on the probe, one review round, the PR.

## As built, 5a (24 Sep 2026)

- **As planned:** Setup's `try` row, `TRY_SKIPPED`, `firstRunTryOf` over `__LIVE` (`LiveCallVM.from`), and FrTry. The
  test window is opened for a kept number not yet proven. The transfer goes through the Business tab's saver. The
  start route reads Live.
- **What the review round fixed:**
  - Try it stays on screen once drawn, as Check does. Setup learns of the call as it starts or ends, which would have
    moved `#/start` on to Live before the words and the transfer were shown.
  - The page ticks each second while Try it is drawn, so the quiet turn (V7), the window's minutes and the call's
    clock move. The clock is contracts'.
  - "Forwarding works", and "through" the kept number, are said only once the forwarding is proven (`verified`).
  - A call from before the screen opened is shown with its caller as "Caller" and is never offered as the transfer.
    The screen's moment is set when Try it is first drawn.
  - Today's card: while only the test call is left, it is Setup's rows with Try it first, Skip and Hide, never the
    start row a workspace that answers cannot put away. Putting the `try` row off counts as the skip.
  - A call that never connected is not a test (`neq not_connected` on the last-call read).
  - Setup re-reads on `calls` only for an update to `ended`, and only until a call has reached the receptionist.
  - The transfer says when the settings are not read yet, keeps the pick until Setup agrees, and says it saved.
  - The test window reopens once it runs out while the owner is still listening.
  - "Ask Chanlytics for help" is offered only for a kept number.
  - "It's in your Inbox too" opens the call.
  - One kept-line rule: `forwardedLineOf`.

## As built, 5b (25 Sep 2026)

- **As planned:**
  - contracts `first-run-live.ts`: `firstRunLiveOf` for the summary, the greeting and Finish's note, and
    `youAreLiveEmail` for the email's words.
  - FrLive draws the four lines with their Change and the greeting. It draws the Business tab's own "What it can do"
    card with `activating`, asked of the one `capabilityStatus` rule with the activation Finish will record on file,
    so a capability never tested is still not live.
  - Finish records the calls' activation (`first_run: true`), then goes to Today.
  - The capability route, on the first run's first activation of calls, asks the edge's new door
    `POST /api/admin/you-are-live` for the email. The email goes to the workspace's alert addresses only (`mail()`,
    no bell row), and the link is built with `dashboardOrigin()`.
- **What the review round fixed:**
  - A refused Finish stays on Live and says why; Finish again goes on. The button is `aria-busy` while the activation
    is out.
  - "We'll email you a copy" is said only where an email will go: an owner, calls that answer, never activated, and
    an alert address.
  - The kept number is said only once proven, and in the mode saved ("Every call to …"), on the page and in the email.
  - Only the first run's Finish emails (`first_run`). Setup's own Activate on a workspace that has answered for
    months does not.
  - The door reads calls with nulls last and answers 503 on any read that failed, rather than sending a thinner
    email. It parses the config.
  - With no alert address, "Nobody: it takes a message" makes no claim about email.
- **Left as it is on purpose:** no route test runs the first-activation rule, because the route reaches the edge only
  in production. The door and the words are tested.
