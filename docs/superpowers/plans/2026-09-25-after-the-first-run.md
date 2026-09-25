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
- **C3:** forwarding proof that tells a forwarded call from a direct dial (the called number and the carrier's
  forwarding header), and the called number handed to the receptionist.

## D. The first run's polish

Focus moves to the step's heading when the step changes, and the change is announced. Typing that was never saved is
guarded. Phone errors show on the field. A radiogroup saves once per choice, not once per arrow key. The time zone
search finds a city ("Miami"). Web addresses get `https://` added for the owner.

## E. Later, each its own decision

WhatsApp keeping the Business app (coexistence), or honest words on the row. Spam calls filtered. The Gmail forwarding
confirmation captured. A missed-call text-back once texting is approved. Moving a number through Twilio's porting API.
A test call in the browser (the spec left it out; Ruben's call).
