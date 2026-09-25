# After the first run: what the audit of 25 Sep 2026 found, in order

The audit (first-run UX, every integration's setup, the phone receptionist end to end) scored the first run's screens
7.5/10, the integrations' ease 6/10 and the phone wiring 6.5/10. Ruben: "continue as you suggest". One PR per item, in
this order, each merged on green before the next.

## A. Paused and cancelled calls, honestly

- **A1:** while paused, a call is answered only to take a message. It says so in its first sentence
  (`pausedGreetingFor`), no transfer number is passed (the script already forbade transferring), and the owner's bell
  and status line say what happens (`PAUSED_WORDS`). Before this they read "nothing is answered", which was false for
  calls.
- **A2:** a number whose subscription ended is released after a grace period. It is a sweep beside the lines sweep,
  and it only reports until `LINE_RELEASE_AFTER_DAYS` is set (releasing a number cannot be undone). It warns the owner
  first, and the release also cleans Retell's phone import.
  - _As built:_ the second half of the quarter-hourly lines sweep (`lib/lines/line-release.ts`), so there is no new
    clock and no migration. The rule is contracts' `lineReleaseStep`. The grace counts from the latest end the
    billing row records: the trial's end, the paid period's end (left out for `unpaid`, whose periods keep moving),
    a cancellation or the last failed payment. The owner is warned once per end: the bell and an email naming the
    day, the office phone to switch off if it forwards there, and Billing. The release comes a week after the
    warning at the soonest. Only `kind = 'chanlytics'` numbers go, never ported or hosted ones, and only for a
    workspace that is `paused`. Billing is re-read just before each release. At most 2 releases a tick.
  - One `releaseLine` serves both the platform's `release` op and the sweep. It now takes the number off Retell
    first (`DELETE /delete-phone-number`), and a refusal there stops it before the carrier.
  - `LINE_RELEASE_AFTER_DAYS` unset (or under 14): the sweep only logs `line_release_report` for each line past
    30 days. To turn it on, set it in the edge's Vercel environment, then redeploy.

## B. The calendar

- **B1:** the pasted iCal address is checked as it is pasted (the `calendar/preview` route exists and no page called
  it), with how many events it found this week. Each calendar gets its own "where to find the secret address".
  - _As built:_ the fold reads a pasted address 600 ms after the last keystroke, and a newer paste wins. It only
    reads an address the rule allows that isn't the stored or masked one. It says "Reading it…", then "Read it: 12
    events, the next Tue, Sep 8, 2:00 PM." or the preview's own refusal as an alert. "Where do I find it?" is
    a fold of Google, Apple (iCloud) and Outlook steps (`FEED_GUIDES`, `FEED_CHECK_WORDS` in contracts).
  - _Found on the way (SSRF):_ every feed reader (the preview, Ask's openings, the receptionist's availability)
    checked only the address it was given, and `fetch` followed redirects on its own. A public address answering
    "see http://10.0.0.5/" was read from inside. `fetchPublic` now follows at most 3 redirects itself and judges each
    one by `feedUrlOk`.
- **B2:** "Connect Google Calendar" through the Google sign-in the product already has (free/busy only), then
  Microsoft 365. This needs the scope added to Google's consent screen, which is Ruben's console step.

## C. The phone line's wiring

- **C1:** provisioning off the 60-second tick, one job per step, with look-before-create for the subaccount, the
  credential list and the Retell agent.
  - _As built:_ the unit is a provider call, not a step: the trunk step alone makes six 15-second calls. The job hands
    the saga its deadline (the tick's start plus 45 s, one Twilio timeout short of the 60-second ceiling). The saga
    starts no call after it and stops with `later`, fails nothing, and leaves the row provisioning at its step.
    Core's `provisionLine` then schedules one more `line_provision` job.
  - Look-before-create is "asked, then look": each create is marked on the row (`facts.asked_<thing>`) before it is
    asked, and only a run that finds the mark with no receipt looks first. A fresh line makes exactly the calls it
    did. It covers:
    - the subaccount, named with the line's tag (`subaccountName`) so a look by name only finds this line's;
    - the trunk, whose domain is the line's, so a lost receipt used to be refused for good;
    - the credential list;
    - the SIP credential, whose lost password is now removed and remade, since a list holds a username once;
    - the Retell origination.
  - Not done: the Retell agent. Retell's `list-agents` spans every workspace's agents, and an orphaned agent costs
    nothing and never blocks the saga, which moves on to the agent it made next. The attach calls (credential list,
    number, messaging) are also unchanged.
- **C2:** the three unsigned voice doors (`retell-inbound`, `retell-fn`, `retell-availability`) signed as the call
  webhook is, plus rate limits.
  - _As built:_ the signature is reported before it is required. `lib/voice/voice-door-auth.ts` holds the one check,
    `retellSigned`, which the webhook now uses too: the badged key, over the raw body and then the re-serialised
    body. Each voice door logs `voice_door_auth { door, sig }` for every knock it lets in. The shared secret still
    opens the doors, now compared in constant time.
  - `RETELL_DOORS_SIGNED=1` makes the signature alone open them, as it does the webhook, and then refusals are
    logged too. Set it once the log shows `sig: true` on all three doors. `retell-fn.ts` said Retell does not sign
    custom-function calls, and the webhook once turned away 127 real deliveries over a wrong key, so this waits for
    evidence rather than a guess.
  - Rate limits were not added. The only spend behind these doors, texting the booking link, already has its
    per-day cap, and open times read through the feed cache. A limiter that holds across serverless instances needs
    shared state, which is a new mechanism, and once required the signature closes the door a limit would only
    narrow.
- **C3:** forwarding proof that tells a forwarded call from a direct dial (the called number and the carrier's
  forwarding header), and the called number handed to the receptionist.
  - _As built:_ a test call is now proven as it arrives, in the inbound-call webhook, the one door that sees the
    call's SIP diversion headers (Retell's `custom_sip_headers`: Diversion, History-Info). Contracts'
    `divertedNumbers` reads the numbers they name, and `forwardingProof` judges them:
    - `carrier` when they name the kept number;
    - `not_shown` when they name only others;
    - `unseen` when there are none.
  - A direct dial is still not refused. Twilio's trunk names the dialled number on every call, so headers without
    the kept number are either a direct dial or a carrier that forwards silently, and refusing them would fail
    owners who did it right. Instead the proof is recorded (`facts.verified_by`: `carrier` or `window`; the event
    carries `proof`) and each test call logs `forwarding_evidence`. Whether to require `carrier` is decided on how
    often real carriers show it.
  - Not done: handing the called number to the receptionist. No prompt reads such a variable, and the call row
    already keeps `to_e164`.

## D. The first run's polish

Focus moves to the step's heading when the step changes, and the change is announced. Typing that was never saved is
guarded. Phone errors show on the field. A radiogroup saves once per choice, not once per arrow key. The time zone
search finds a city ("Miami"). Web addresses get `https://` added for the owner.

- _As built:_
  - **Focus.** The step's `h1` (`tabIndex=-1`) takes focus when `param` changes, not on the page's arrival, so a screen
    reader says the new step.
  - **Leaving.** Every move (`go`, `leave`: Continue, Back, the rail, Finish later) first asks the record kit's
    registry (`__settingsUnsaved`, the question the Settings rail asks). With unsaved typing it asks "Leave without
    saving?", or "Leave while this saves?" while a save is out (`FIRST_RUN_WORDS.leave`).
  - **The phone step.** The area code's "Three digits" and the number box's `boxProblem` (contracts: typed, and not a
    forwardable US number) are said on their fields, with `aria-invalid` and `aria-describedby`. The box's problem
    shows once the box is left, not at the first keystroke.
  - **Radiogroups.** How customers buy and where transfers go show a choice at once and save it once the keys settle
    (`useFrSettled`, 600 ms): arrowing is one save, of the last choice. A step that goes within the wait sends the
    choice first, and Check's Continue sends the answer being chosen.
  - **Time zones.** Contracts' `zoneSearchWords` lists the cities and states each common zone covers.
    `RecordCombobox` matches an option's `also` words, which it never shows.
  - **Web addresses.** The Business tab's website and booking link are stored and checked by contracts' one
    normalizer, `normalizeLink`, now published as `__normalizeLink`, instead of the rows' own regex. It supplies a
    missing `https://`, and the create card's put stores the same form.

## F. What a free trial covers (Ruben, 25 Sep 2026)

"Be careful with purchasing a new number: we should not provide it for free on the free trial. This has a cost for us."
Ruben chose "getting a number starts paying", and to hold texting registration and lead searches too.

- _As built:_ `maySpend` admits `active` only. The free trial covers what costs Chanlytics nothing: setting up, and
  the receptionist on channels the workspace already has. A number ($1.15 a month), a texting registration ($19.50,
  non-refundable) and a lead search each wait for the plan, and each refusal names what it is for (`SPEND_TEXTING` is
  new).
- The first run's checkout (`return: "start"`, the phone step's) takes no trial: "Start my plan", $49.00 a month,
  starting today. Billing's own checkout keeps the trial.
- A workspace already on a trial starts its plan early: Billing's "Start my plan now", or the phone step's button.
  Both call `POST billing/start-now`, which becomes the edge's `start_now` (Stripe `trial_end: "now"`, applied at
  once).
- Setup's line row sends a workspace with no plan, or on a trial, to the phone step.
- The back office no longer counts a trial as waiting on its owner.
- Lead pricing (charge only for verified leads; a monthly number included in the plan) is a separate analysis, for
  Ruben to decide.

## E. Later, each its own decision

WhatsApp keeping the Business app (coexistence), or honest words on the row. Spam calls filtered. The Gmail forwarding
confirmation captured. A missed-call text-back once texting is approved. Moving a number through Twilio's porting API.
A test call in the browser (the spec left it out; Ruben's call).
