# 0050 · The spend door

**Status:** Decided on 11 October 2026 (Ruben: the review's fourteen calls, approved as recommended), and built in part. Four
things stayed open, named under "Not decided here": the price, health and cosmetic businesses, which notices also
email, and the consent line's wording, which is counsel's. The first three were settled on 20 November 2026 ("Settled
20 November 2026", below); the consent line stays counsel's. This is the spending half of Campaigns › Ads; 0049 decides
the records and how a person is counted, and this note leans on it. It also leans on 0035 (a keyed write is answered
once), 0040 (each alert says where it goes) and 0018 (a reply goes first, each workspace takes its turn), and on 0047 and
0048, both drafted in another lane and not on main when this was written (#1564 built both, 12 October 2026); each
place that depends on one says so. Written against commit
`132ab95eb` (main, 11 October 2026). Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).
Amended on 18 November 2026 by "Pause, Resume and Disconnect say what is true" (below): calls 1, 3, 4, 6, 8, 9, 11 and 16.
Built so far: the owner-only `ads` permission (migration 00645); Pause, Resume and a Disconnect that is never refused
(19 November 2026, #2443); the requests that make an ad, built and not sent (#2452); New ad's one screen, with the ad
writer's own purpose (#2456, migration 00656); call 15, the bell's five ad notices to the owner alone (20 November
2026, #2459, migration 00658); and, while AI is stopped, no ad turned back on from the page and one press that
pauses every ad still on (20 November 2026). Turn on, the job that makes an ad and never leaves one running, is built
with migration 00666 (21 November 2026, below), and nothing has been switched on at Meta with it yet.

## Context

- **The money is the owner's.** An ad runs in the owner's own account on the platform and is billed to the owner's
  card. Chanlytics holds none of it and moves none of it. What Chanlytics spends of its own (the model, texts, WhatsApp
  fees) is `route()`'s `spend` flag: whether a route may cost Chanlytics money (`apps/dashboard/src/server/route.ts`).
- **No permission says "run paid ads".** `ROLE_PERMS` (`packages/contracts/src/config/workspace-config/role-perms.ts`)
  holds `approve`, `autonomy`, `disconnect`, `billing`, `team`, `settings`, `export` and `find`. `approve` belongs to
  operators and partners. `find`, the nearest in kind (it spends the month's allowance), belongs to the owner and the
  partner, and `has_permission()` says the same in SQL.
- **A platform write is not a database write.** It can succeed without Chanlytics hearing of it, fail halfway through
  four objects, and be changed by the owner in the platform afterwards. `providerFetch` already names the first case: an
  `unknown` outcome (a timeout, a dropped connection, a 5xx) is never sent again blind.
- **Ask acts only through a card the member approves** (glossary, Ask), and a card's commit is the member's press.

## Decision

Of the review's fourteen calls, 2, 3, 4, 8, 9, 11 and 12 are this note's, with 14 shared with 0049.

1. **Only the owner's own ad accounts.** The platform bills the owner; Chanlytics creates no ad account and holds no ad
   money. It links accounts the owner already has. The page says so under its head: "Charged to your card by each
   platform, never through Chanlytics. Pause an ad and it stops. Meta still bills what it already showed." The last
   sentence names the ad's own platform. _Amended 18 November 2026: it said "Pause an ad and nothing more is spent."_
2. **An `ads` permission, owner only,** in `ROLE_PERMS`, in SQL's `has_permission()` and in the route policy, separate
   from `route()`'s `spend` flag. A partner does not hold it: a partner brings the workspace and does not spend its
   owner's money. Operators and partners may **draft**, which writes Chanlytics's rows and touches no platform. A draft
   left for the owner is a bell row (`ad_waits_for_owner`) that opens it on its review step. The edge asks
   `has_permission(user, tenant, 'ads')` again before any platform write, as the lead finder's doors ask `'find'`, so a
   compromised dashboard cannot spend without a member who holds it.
3. **Every press that can spend names its most, and carries it.** One function in contracts, `maxSpendOf(ad, change)`,
   returns the maximum, its currency, the end and the sentence. It writes the button ("Turn on · up to $300", "Raise to
   $900 in all"), the confirmation, the Ask card, the toast and the Activity row, so they cannot differ. The press sends
   `expect_max_minor` and `expect_version`; the route recomputes both from the stored ad and the last-read spend and
   answers `409 conflict` with the new words if either differs. A stale press (an old card, a second tab, an edit since)
   is refused, and the owner can only press the number the server would have computed. Only a raise names a maximum;
   lowering, pausing and renaming are free. The sentence the owner saw is stored on the ad (`approved`) and in the
   decision's data. Where the platform asks whether an ad belongs to a special category (Meta's list today: jobs,
   housing, financial products, politics and gambling), the answer is part of what the owner approves: the draft says
   it in one line, the Turn on press is the owner's declaration of it, and it is stored with `approved`. Changing the
   ad's words works it out again. _Added 18 November 2026._
4. **"Up to" is said only where the platform enforces it.** That is Meta's lifetime budget with an end time, Google's
   campaign total (up to 90 days) and TikTok's lifetime budget. Before an ad is activated, the platform's own budget, end
   time and status are read back and compared with `approved`; a difference fails the ad. The special-category answer is
   read back with them, and a difference fails the ad (_added 18 November 2026_). A Google "until I stop it" is a
   daily average that may reach twice a day, and says "about $15 a day", never "at most".
5. **Turn on is a job.** The press writes the intent, the owner's decision, the maximum and the job in one transaction
   and answers `202`; the drawer says "Setting up". The job creates everything paused, reads it back, then activates from
   the bottom (the ad, its group, its campaign), so the last flip is the one that starts spending.
6. **Nothing the owner did not approve is ever switched on.** No failure path calls activate. A job that fails after
   creating something
   pauses or removes it; what it cannot remove stays recorded, named, and paused ("Left in Meta, paused ›"). The ad says
   "Couldn't finish", the owner gets a bell row ("We couldn't finish setting up Spring offer. Nothing was spent."), and
   an owner can remove the leftovers in the platform. An outcome the job cannot tell is settled by a read of the object's
   tagged name, never by sending again, and is followed until the platform says what it is. Where that takes longer
   than a few minutes the ad says "Couldn't confirm it's on", with "Check", and the owner gets a bell row. _Amended
   18 November 2026: its head said "A failure never leaves an ad running", which a lost answer to the last switch
   cannot promise._
7. **An unready account blocks Turn on.** "Checked before turning on" lists every gate in the owner's words, each with
   its door: payment, the Page and the WhatsApp number linked to it, Meta's lead-ad terms for a form, Google's advertiser
   verification, TikTok's identity and post permission. A red row stops the press; an amber row is told. The rows for
   the way in (WhatsApp, call, form) are drawn from `abilitiesOf`, the engine review's capability matrix, and are not a
   list of their own. The ad's words are checked by the receptionist's own predicates (`namesMoney`): a price that
   disagrees with Services is red, and any price while the receptionist is set never to quote prices is amber, with its
   consequence: "Your receptionist will hand over anyone who asks about this offer."
8. **Disconnecting is always possible.** With ads running, Disconnect offers one press that pauses them and then
   disconnects ("Pause 1 ad and disconnect"). Where the pause cannot be confirmed because the platform is not answering,
   or where the owner chooses to, it disconnects anyway and first says what that means: the ads keep running, the
   platform keeps charging, and they can only be stopped on the platform now. Those ads stay listed, as "Left in Meta"
   with whether each was on when access ended, and the decision's data names them. A disconnect stops using the
   credentials at once, drops them, and asks the platform to revoke. The page says access is withdrawn on the platform
   only when the platform confirms. Until then it says where the owner can remove Chanlytics there, and the revoke is
   asked again with Chanlytics' own key, which needs no sign-in of the owner's (to be confirmed for the sign-in
   Chanlytics uses). _Amended 18 November 2026: disconnecting while an ad ran was refused ("Pause or end your ads
   first")._
9. **Ads made on the platform are adopted read-only** (0049). Every one of them takes Pause, and pausing is always
   safe. Resume shows only where the platform's own budget is a total with an end date and the ad has that budget to
   itself, and its confirm names what the platform holds: "Turn back on · up to $180 left, ends 30 Nov". An ad with a
   daily budget and no end, or one that shares its budget with other ads, gets "Turn it back on in Meta ›" instead, and
   the route refuses a resume of one. _Amended 18 November 2026: every adopted ad took Pause and Resume alike._
10. **Each platform's budget rules live in one table in contracts, `platformRules`,** read by the checks, the presets, the
    amount chip and Ask. Meta's floors come from the account's own `minimum_budgets`, never hard-coded; a day may overspend
    by a quarter and a week never above seven times the daily amount. TikTok needs more than $20 a day for an ad group,
    allows a change of at most 30% (40% while learning), and not within two days of the last. A Google total spans at most
    90 days from its start, its type is fixed once it runs, and edits should be rare. A raise that breaks a rule is refused
    before any platform call, in the platform's words.
11. **A closed way in is told, not acted on.** A running ad whose door has closed (WhatsApp disconnected or blocked, the
    line off, billing paused, AI stopped) still spends. The sweep checks each running ad's door each tick; when it
    fails, the ad's
    badge is Needs you, a bell row is kept and Today shows it. "Pause my ads when the way in closes" is an owner setting,
    off by default; when on, the pause is the owner's standing instruction and the decision names it. While AI is
    stopped, no ad is turned on and no draft is written, and the ads already running are told at once, with one press to
    pause them all. _Amended 18 November 2026: AI's stop, built on 17 November, joined the list._
12. **Ask proposes and never spends.** One action, `propose_campaign.ad` (draft, extend, raise, lower, move, pause,
    resume), makes an owner-only card. The card's id is the idempotency key; the commit is the owner's press on the route
    a button uses, with `expect_max_minor` and `expect_version` from the card; a card lapses in a day. No ad is approved
    by voice, and a step that spends is its own press, never one of a plan's silent steps. Ask never carries a token,
    never creates an ad on a platform (a draft opens New ad, and Turn on is the owner's press there), never moves money
    so the total across ads rises beyond what the card states, and reads a platform's free text as data. When it speaks
    is code with tests and no model: extend an ad that ends within three days and brought at least ten people (or twenty
    calls), move money only between ads that each have at least ten booked and at least 14 days, fix a blocked ad. An ad
    under 5 booked is never ranked.
13. **Staging and sandbox accounts gate the first live launch,** not the read. Before P2: a staging clock can never call
    the production edge; a Meta app in development mode, a Google test account and token, and TikTok's sandbox; `ADS_WRITES`
    set to `off`, `sandbox` or `live` per deployment, with a per-workspace allow-list. The first spend is on a test
    account, then on Ruben's own account with a hard card limit, then on pilots. Staging was approved on 9 October 2026 at
    about $10 a month and is not built.
14. **A form lead gets a call back, and no first text yet.** A person who leaves a number is made through `resolve_person`
    (0034), never a direct insert, and leaves a Next step due today ("Call back", `person_notes.due_on`, 0007). No first
    message goes until counsel approves the consent line. After that it is a `start` under `writeWaysOf`, template- and
    consent-gated, through the one send door (`packages/core/src/deliver.ts`). Ads builds no send path.
15. **Notices follow 0040,** each declared as a topic with the bell and the phone told. Needs you: an ad was not
    approved; your card could not be charged for an ad; your ad account was disconnected. Worth knowing: an ad ended or
    spent its total; nobody has come from an ad in seven days. Which of these also email is open (below); the review
    proposes mail always for the first two. There is no second "someone from an ad is waiting" notice: that is the
    existing hold's row, which carries the ad. A row closes when its subject stops waiting (0048's rule), as an ad is
    fixed or ended or an account reconnects.
16. **Later, and not built here.** "Leave out people already in People" comes in a v1.5, Meta only, behind a consent line in
    Settings, since it sends customers' hashed numbers to a platform. Telling a platform who booked is two steps, each its
    own switch, and neither is built here: first the platform is told who booked, each booking sent once and kept in a
    record so a second try never counts twice; later an ad is set to look for bookings, only once the platform shows
    them arriving and the ad's setup allows it. The click id an outcome needs is kept from the first of those steps on
    (0049, as amended). Both stay off for health and cosmetic businesses until that is decided. _Amended 18 November 2026._

## Shape

The verbs are in `packages/core/src/ads/` over `AdPlatformPort` (`createStack`, `activate`, `pause`, `setBudget`,
`setEnd`, `readState`, `find`, `remove`), which the edge implements by wrapping the pure request builders in
`packages/channels/src/ads/` around `providerFetch`. A verb records the owner's decision and its event in one SQL
transaction through a definer door.

- `draftAd`, `copyAd`: operator and above; no platform contact; Undo deletes the draft.
- `requestTurnOn`: the owner; Undo while it is setting up cancels the job, and after that it is a Pause.
- `publishAd`: the job, no one's press. `unwindAd`: the system removes or leaves paused what a failed Turn on made.
- `pauseAd`, `resumeAd`: the owner; short calls; each is the other's Undo. For an ad made on the platform with a daily
  budget and no end, a pause has no Undo here: its toast says where the ad is turned back on (call 9, as amended).
- `setBudget`, `setEnd`: the owner; Undo returns the old value while the version is unchanged (a budget only while the
  spend is within the old total).
- `endAd`: the owner; no Undo, since the platforms cannot un-remove. The toast offers "Make a copy".
- `reviseAd` (the photo, the words, the area, the form): the owner; a new creative with the old paused, back to review.

**Turn on, in order.** 1) `checkAd`, then `maxSpendOf` against `expect_max_minor`. 2) One door, `ad_request_turn_on`:
`status = 'sending'`, `intent = 'on'`, `approved`, the decision `turn_on_ad`, the event `ad.turned_on` and the job
`ad_publish`. 3) For each object, look it up by its tagged name (`Chanlytics · <name> [cl:<8 chars>]`), create it if it is
not there, and write its `ad_objects` row. 4) Read back and compare. 5) Activate bottom-up; a failure midway pauses the
campaign and records the step. 6) The sweep sets the platform's state; the page says On only once the platform does, and
In review while it checks. Each step re-reads `intent`, so Undo during setup stops the job before it activates.

**Drift.** If the owner pauses in the platform, the next read writes `ad.drifted` and the drawer says "Paused in Meta,
not here. Turn it back on?" Resume sets the intent again.

**Routes** (`apps/dashboard/app/api/v1/ads/`, each a row in `tooling/scripts/tests/route-policy.json`): the press routes
`turn-on`, `pause`, `resume`, `budget`, `end-date`, `end` are owner-only, and `turn-on`, `resume`, `budget`, `end-date`
and `end` take `fresh: true` (the session is asked of the Auth server first). The spend ones need an `Idempotency-Key`
(0035): a card's id for Ask, a new uuid for a button. Drafting, `check` and `copy` are operator. `connect` and its
callback are owner, and the callback re-checks the permission. `POST ads/words`, where the model writes an ad's words,
is the one route with `spend: true`, since that costs Chanlytics money.

**The ledger.** The owner's presses are `decisions` rows (`turn_on_ad`, `pause_ad`, `resume_ad`, `change_ad`, `end_ad`,
`copy_ad`, `connect_ad_account`, `disconnect_ad_account`), which are the record of what a person did; events are the
record of what happened. A CHECK that widens lists the whole set, from the contracts constant, since the wiring lane and
the Ask lane widen the same sets. Three job kinds, `ad_publish`, `ad_unwind` and `ad_lead_fetch`, each arrive with
handler, caller, `jobs.kind` CHECK and lane in one change; `ad_publish` runs in the lane for work a person is waiting on.

## Steps

Each ships alone, in either deploy order. P0a, P0b and P1 are 0049's.

**P2 · Meta, launch.** The ledger CHECKs, the doors (`ad_save_draft`, `ad_request_turn_on`, `ad_settle_publish`,
`ad_set_intent`), the job kinds, the verbs, the routes, `checkAd`, `maxSpendOf`, Undo, the notices and Activity's words,
the door rows from `abilitiesOf`, the origin sentence for the receptionist, the Meta lead webhook with its job and a
deauthorise callback (which Meta asks of an app that signs owners in). Forms (P2b) go with the consent decision: until counsel
has read the line, a form lead leaves a call back and nothing is sent. It waits for staging and the sandboxes (13), the
engine review's `abilitiesOf` and walk runner, the address registry so the drawer, the bell and Ask open exactly, and the
check on a real delivery that 0049 names for Instagram-post ads. _Both orders:_ `ADS_WRITES` is `off` until both apps
and the migration are deployed, and the press routes refuse with a code while it is; then `sandbox`, then `live` for an
allow-list. Ruben's clocks: Meta's Full access (a review, 500 calls in 15 days with under 15% errors, business
verification) for any owner who holds no role on the app; P1's traffic earns it. Standard access may serve pilots whose
owner does hold one, which is not yet confirmed.

**P3 · Google.** A second consent with the `adwords` scope and its own Vault secret; reads by GAQL; a Search campaign with
one responsive search ad, a call asset that follows Hours, a total budget, and the pause, resume, amount and end door.
Search only, partner sites off, AI Max off. The ad opens the business's hosted page, `/b/<slug>`, by default, which draws
the public phone as text and the services; the owner's own site is a one-line choice. A check blocks Turn on when the
number the call button rings is not on the page the ad opens. Calls are Google's count (0049). The quota counter is
built here. _Both orders:_ Google's accounts and ads are new rows nothing reads until the dashboard lists them. Ruben's
clocks: Google's OAuth verification (a sensitive scope), the developer token and its access level.

**P4 · TikTok.** Smart+ lead generation with an instant form (name and phone, with a confirm step), the lead webhook and
its backstop, the owner's linked identity and post permission (an authorisation code lasts 7, 30, 60 or 365 days),
budget changes under TikTok's rule. A health or cosmetic business needs a TikTok sales representative, so it has no
one-press Turn on. It waits for a test account that shows the developer app can use an identity the owner linked
directly, which is unknown today. Ruben's clock: TikTok's app review.

**P5 · Ask and the full lens.** `propose_campaign.ad`, the rules in code, `adsReport`, the Reports lens in full (one card
per platform, never summed), and Today's rows. It waits for the Ask marketing-manager lane to merge, since both edit the
same files, for P2 to run two weeks on real data, and for the new action's eval cases.

## Tests

Verbs over fake ports: each press, its Undo, a stale `expect_version`, a raise that breaks `platformRules`. The saga over
an injected network at every step, including an `unknown` outcome, and the property that matters: no failure activates.
Database: `has_permission(..., 'ads')` equals `ROLE_PERMS`; an operator's write is refused. Routes: the policy rows, a
repeated key answers once. Ask: the card's id is the key, no approve path exists in the voice door, the action is offered
only to the owner of a workspace with a connected account, a plan never batches a spending step. Walks and evals for the
receptionist: a chat from an ad is answered from the business and not the ad, a price question never goes silent, a form
lead leaves a Next step, an ended ad is not promised, STOP holds for a form lead. One end-to-end run against a sandbox in
the suite's own workspace, never a customer's.

## Risks

- **A write the platform accepted and we never heard.** The tagged name and the settling read cover it; the retry never
  repeats a write blind.
- **"At most" is a claim about a platform.** TikTok's and Google's enforcement of a total is proved on throwaway accounts
  before it is relied on, and then ad by ad by the read-back.
- **The review clocks are the critical path.** Meta's Full access, Google's verification and TikTok's review run in days
  to months and start when the owner of each app applies, not when the code is ready.
- **Google's shared quota.** One day's operations belong to every workspace; the counter skips Google when it is spent.
- **A draft nobody opens.** An operator's draft is a bell row to the owner; if none is pressed the ad simply never runs.
- **End has no Undo.** The confirmation says so.

## Not decided here

- The wording of the form's consent line, which is counsel's. Nothing ships past a draft, and forms are not in the first
  version.

The three others first named here (the price, health and cosmetic businesses, which notices also email) were settled
on 20 November 2026: see below.

## Settled 20 November 2026 · the calls left open, and three more

Ruben, 20 November 2026, to the open calls and three found while building Ads: "go with whatever you truly suggest".
The Ads plan's section 12 lists the same, and says where each applies.

- **The price.** Ads has no price of its own at launch: Meta bills the spend to the owner directly. The price is
  revisited once a month of the ad writer's own cost line (the plan's G19) shows what Ads costs Chanlytics for each
  business.
- **Health and cosmetic businesses** may run ads in the first version, under the plan's 5.1 checks: no before and after,
  never about the reader, no claim the owner hasn't stood behind. Chanlytics never tells Meta who booked for them, so
  call 16's two steps stay off for them, and the click id is never kept for them.
- **Which notices also email** (call 15): the two that stop an ad, an ad Meta didn't approve and a card Meta couldn't
  charge for one. Once a cause, never again while the bell row is open, to the addresses Settings › Notifications names,
  as a choice the business may turn off. Ended, spent and quiet stay on the bell. Built the same day: see "As built,
  20 November 2026, later still" below.
- **The consent line for forms** stays counsel's.
- **Disconnect stays as built** (call 8, and "Amended here · Disconnect does not ask Meta to withdraw", below): Chanlytics
  forgets its sign-in and says where to remove it in Meta, and never asks Meta to withdraw access, because the same Meta
  app carries the business's Instagram and WhatsApp.
- **The sign-in asks for the five permissions the plan's 5.3 lists, and nothing more.**
- **The ad account's card counts only what Chanlytics can read** (the plan's G2 and 4.3): the account is active, a
  payment method, the Page. The Page's link to the WhatsApp number is a quiet line, since Meta shares it only with an
  app holding Page Public Content or Metadata Access, and the ad's own check at Meta settles it when an ad is made.

## Amended 18 November 2026 · Pause, Resume and Disconnect say what is true

Ruben, 18 November 2026, to eight changes proposed after an outside review of the Ads canvas: "Yes, all eight". Three of
them are this note's. Later the same day, to nine more found while the build plan was written
(`docs/plans/2026-11-18-ads.md`): "Approve as written". Four of those are this note's. And to three sentences that
follow
from the first eight: "Yes, all six". Nothing in this note is built, so nothing built changes.

- **Call 1, the page's line about Pause.** A pause stops an ad from being shown. What was shown before the pause is
  billed afterwards, so "nothing more is spent" could read as untrue on the owner's next statement. The line now says
  what a pause does and what the platform still bills.
- **Calls 3 and 4, the owner's declaration.** A platform holds the advertiser to its answer about special categories,
  not Chanlytics. So the answer is part of what the owner approves, is kept with it, and is read back before anything is
  switched on.
- **Call 6, what a failure may never do.** The mechanics are unchanged. The head promised more than a lost answer
  allows: where the last switch is answered by silence, the ad may be running as approved. So the promise is that
  nothing unapproved is ever switched on, and what is not confirmed is followed and, past a few minutes, told.
- **Call 8, Disconnect.** A refusal did not keep control: the owner can withdraw Chanlytics on the platform itself at
  any time, and a person must always be able to take access away, on a day the platform is down as well. So Disconnect
  pauses first where it can, and where it cannot, or the owner chooses, it first says in full what the page says when
  the platform itself signs Chanlytics out. Access is never said to be withdrawn on the platform before the platform
  confirms it.
- **Call 9, Resume on an adopted ad.** Call 4's rule is that "up to" is said only where the platform enforces it. An ad
  Chanlytics did not make can have no limit at all, and one press here would start it spending again with nothing
  named. Resume is therefore offered only where the platform holds a total with an end date. A platform can also put one
  budget over several ads, where "up to $180 left" would be a shared amount, so the ad must have its budget to itself.
  Allowing it with the rate named ("about $20 a day until you pause it"), as call 4 words Google's open-ended kind, was
  weighed and left aside for the first version.
- **Call 11, a closed way in.** AI's stop was built on 17 November, after this note. An ad that runs while AI is stopped
  brings people nobody answers, so it is told as the other closed ways in are.
- **Call 16, telling a platform who booked.** Two steps, each its own switch: the first can be built and proven by
  itself; the second depends on the platform's rules for the kind of ad.

Call 10 is not amended. Its sentence on how far a day may overspend a daily budget is to be read again on Meta's own
page before the build.

The Ads page is a mockup on sample data, and its sentences still say the calls as they stood: the line under its head,
the toasts after a pause, an adopted ad's line in its drawer, and Disconnect in Settings › Connections. They change in
a words change of their own, with their tests.

## As built, 19 November 2026 · Pause, Resume and Disconnect (the Ads plan's step 2)

The two presses call 9 leaves an owner on an ad made in Meta, and call 8's Disconnect
(`supabase/migrations/00652_an_owner_pauses_an_ad_and_turns_it_back_on.sql`,
`00653_an_owner_disconnects_their_ad_account.sql`, the edge's `lib/ads/press.ts` and `tell.ts`).

- **A press is kept, then told.** `ad_set_intent` keeps what the owner asked with the decision and the event, by the
  ad's version: a stale press is refused, the same press twice is answered once. Meta is then told once. An ask newer
  than the telling is a press on its way, which is all the state a pending press has.
- **Meta's thirty seconds.** A press inside thirty seconds of the last change to that ad is kept, and the account's
  read is asked for at the moment Meta will take it; that read sends the press before it reads. A press that takes
  back one Meta was never told of sends nothing.
- **What telling can come to.** Taken: the ad is read back, so the page says what Meta says. Slowed: Meta took
  nothing, and the press stays on its way. No answer: marked sent and never sent again; the account's read is asked
  for at once and says what stands, the owner is told it is not known yet whether Meta took it, and no Undo is
  offered on it. Refused: the ad is put back as Meta holds it, an `ad.press_refused` event says so, and the owner is
  told it did not take. A sign-in Meta no longer takes marks the account.
- **Nothing is sent late.** A press on its way is sent by its account's read, which is brought forward to the moment
  Meta will take it, so a pause never waits behind an hourly read; a pause goes before a turning back on. When Meta
  signs Chanlytics out, or the owner disconnects, every press still on its way is let go: none is sent days on, when
  the owner connects again.
- **Resume, as C1 amends call 9.** `ad_may_resume` in the database and `adResumeRule` in contracts say the same: a
  total, an end date still ahead, the budget to itself, something left, and paused by the ad's own switch. Anything
  else is turned back on in Meta.
- **`ADS_WRITES`** on the edge: `live` sends, `sandbox` does everything but the call, anything else is off, where a
  press is refused before it is kept. The workspaces are `ADS_WORKSPACES`, the same list Connect reads (D7).
- **Disconnect is never refused** (call 8, as amended). Asked to pause first, each running ad is paused and Meta told;
  where Meta does not confirm one, nothing is disconnected and the owner is told which ad keeps running, and may then
  disconnect anyway. A press on its way is let go with the account. Each of those pauses is one change and no read
  back, so Meta's allowance for the account covers about fifteen ads in one go; past that the owner is told which
  keep running, and pressing again five minutes on pauses the rest.
- **An ad Meta is still checking is paused first too** (Ruben, 19 November). Left alone it starts by itself the moment
  Meta approves it, after the owner has gone, with nothing here to say so. So "left on" is one rule, read from an ad's
  own badge (contracts `adLeftOn` over `adStateOfRow`): running, or its own switch on while Meta checks it. The page
  counts by it and the edge pauses by it, the running ones first. An ad whose run is over is not left on, whatever
  Meta's word for it. The sheet says each as what it is ("Meta is still checking Weekend offer"), and after a
  disconnect the page names one Meta was checking as that, never as paused.
- **Signed out, no pause is offered.** Meta took the sign-in, so nothing can be paused from here: the sheet opens on
  what stays on and says why, and the edge, asked to pause first all the same, disconnects nothing until the owner has
  been told.
- **An account still waiting for the owner's answer was never connected.** Signed out by Meta or let go by the owner
  before the one question is answered, its row goes with its token, and the bell says nothing of it.

### Amended here · Disconnect does not ask Meta to withdraw

_Settled on 20 November 2026: it stays as built (above)._

Call 8 says Disconnect "drops" Chanlytics' tokens, and the plan's C2 adds that Meta is asked to withdraw the sign-in
and asked again until it confirms. This step does the first and not the second. The token is dropped the moment the
account is let go, so Chanlytics can do nothing with it. Meta is not asked to withdraw it: Meta's own page documents
the call, and it is not known whether withdrawing the ads sign-in would also end the same business's WhatsApp or
Instagram connection, which share the Meta app. Until that is seen on a real account, the card says where the owner
removes Chanlytics at Meta themselves, and `withdrawn_at` stays empty. This is Ruben's to confirm or change.

## As built, 19 November 2026 · The requests that make an ad, and the draft (the Ads plan's step 4, its first part)

Built and not sent: nothing here has reached Meta, no verb, route or job calls it yet, and there is no migration.
Meta's own pages were read first; what they showed and what it changed is in
`docs/plans/2026-11-18-ads-meta-checks.md`.

- **The request builders** (`packages/channels/src/ads/meta-make.ts`): the campaign, the ad set, the creative and the
  ad. Every make is paused, carries the token's proof in its body, and has its dry-run form. The amount is a total with
  its end on the ad set, sent in Meta's own units, exact or not at all (call 4). Where an ad shows is named, the area
  is a circle around the business for adults, and each of Meta's own changes to the picture and the words is switched
  off by name.
- **An ad made here is three ads at Meta,** one for each version of its words, under one ad set and one total, in a
  campaign of its own. Meta's way to put several texts in one ad shows a headline with a text nobody approved
  together. So an `ads` row made here has three ads among its `ad_objects`, and a read folds them into one.
- **What Meta answers** (`meta-made.ts`): the id of what was made, Meta's own words for a refusal with the field it
  blames, and a campaign read back whole in what call 4's compare needs: paused, the total and its end, no special
  kind declared, WhatsApp as where a tap goes with the number AI answers, and none of Meta's own changes on. That
  number is always named in the request: a Page can hold several, and Meta opens its primary one where none is named.
- **A create carries a key** that Meta's page says makes it safe to repeat. Call 6 says an outcome the job cannot tell
  is settled by a read of the tagged name, "never by sending again". For a create, sending again with the same key is
  the surer of the two; a switch takes no key, so call 6 stands for it. The builders carry the key; whether the job
  sends again with it is Ruben's to decide, and nothing does yet.
- **Call 13's test account.** Meta's pages for its ads interface no longer hold a test ad account, so the first ad on a
  real account is on Ruben's own, with every ad paused, as Meta's own page for an ad recommends.
- **The draft's rules and call 7's checks on words** (`packages/contracts/src/ads/draft.ts`,
  `apps/dashboard/src/server/ask/skills/ad/checks.ts`, moved from contracts on 20 November since the server alone
  runs them): what code picks of a draft, and each thing that stops an ad's
  words, its amount, its end or its picture before Turn on. The model writes words and never decides a check.

## As built, 20 November 2026 · New ad's one screen (the Ads plan's step 4, its second part)

Built with nothing sent to Meta. One migration is written and not applied: `00656`, which lets the ledger count the ad
writer's words under a purpose of their own (`ad_draft`).

- **Call 7, the checks, run on the server after every change** (`apps/dashboard/src/server/ads/draft-checks.ts`,
  over the rules in `packages/contracts/src/ads/draft.ts` and the server's `ask/skills/ad/checks.ts`). `POST ads/draft` judges
  whatever draft the screen sends against the business as it stands now, and answers each thing that stops Turn on
  as one line with its one act. The model writes words and is never asked whether a check passed.
- **The server keeps no draft.** Until Turn on there is no row: the screen holds the draft for the tab, and the server
  trusts nothing in it beyond what the owner chose (the service by its name, the picture by its id, the amount, the
  miles, the end, the words). A row arrives with Turn on's own door, which is the next part.
- **The ad writer has one caller** (`server/ads/words.ts`, `POST ads/words`, `spend: true`, thirty an hour): three
  versions for a draft, or the one change the owner told AI to make, from the closed list. Words that fail a check
  are never shown; a change whose words would fail is not made, and says which rule.
- **Turn on is not built.** The press is drawn and cannot be pressed: `turn_on: "not_yet"` from one function, and under
  the press "Chanlytics can't turn an ad on yet. Nothing is made at Meta, and nothing is spent." Calls 2 to 6 (the
  press carrying what it expects, the job that makes everything paused, reads it back and compares it) are untouched.
- **A special kind is asked, never guessed** (the plan's G7). Where a draft reads as a job, housing, finance, politics
  or gambling ad, the screen asks; a no is what the press would tell Meta, and a yes is not run here, with a door to
  Meta.

## As built, 20 November 2026 · The bell rings for an owner's ads (call 15)

Built with nothing sent to Meta. One migration is written and not applied: `00658`
(`supabase/migrations/00658_the_bell_rings_for_an_owner_s_ads.sql`). Nothing waits for Meta's gates: each notice is
worked out from what the hourly read already keeps, so an ad made in Meta rings from the day this ships.

- **Five kinds, one cause each:** `ad_refused` (Meta didn't approve an ad, in Meta's own words in quotes), `ad_unpaid`
  (Meta couldn't charge the card for one), `ad_ended` (one that was on reached its last day), `ad_spent` (the total it sits
  under is spent) and `ad_quiet` (it ran every one of the last seven days and no one wrote from it: the plan's G9). Each
  row names its ad, says the one thing to do, and opens that ad's drawer (`campaigns/ads:ad:<id>`).
- **Worked out by the read's own door.** `ads_read_keep` measures what stood at the bell's last look at the account
  (`ad_accounts.rung_at`) before it writes, and after a good read hands that to `ad_bell_ring`: a cause that stands now
  and did not then rings once; a row whose cause no longer stands closes for everyone. So nothing rings again on the
  next read, a cause that clears and comes back is told again, and a read that fails measures nothing. A ring that fails
  leaves the last look where it was, so the next good read rings it. The bell never costs a read what it learned.
- **Nothing old is news.** The first look after an account connects rings nothing. An ad first seen by a later read rings
  only for Meta's check of it (not approved, or the card), never for a run that ended, spent or went quiet before
  Chanlytics held it.
- **One cause, one row.** Ads under one ad set end together, ads under one budget spend it together, and one card stops
  every ad of an account: each is one row naming the first ad by name and how many more.
- **The card is told once.** An ad's card row and the account's own payment row (00653) are one cause: an ad's row
  rings only where the account's standing says nothing, and the account's row is not rung while an ad's is open. Both
  close once Meta can charge again, and the account's signed-out row closes at the first good read after it connects
  again: the account rows had never closed before.
- **The owner alone.** One row for each member who may run ads (`has_permission ads`: the owner), never a partner, an
  operator or a viewer. The step 2 account rows stay the workspace's, as they were.
- **When a run is over** is contracts `adStateOf`'s rule, written again in SQL beside it (a total spent; ended by its
  owner; removed; or the day after its last day in the account's zone), so the bell never says an ad ended while its
  drawer says On. An ad ended by its owner's press, or removed in Meta, rings nothing: that was a person's act.
- **"No one wrote" counts every tap that reached Chanlytics** (`ad_entries`, a new person or not), and only for an ad
  whose tap opens a chat Chanlytics receives: an ad that opens a website, a form or a call is never said to have
  brought no one.
- **A disconnect closes the ads' rows** (a trigger on `ad_accounts`): nothing about those ads can be done here.
- **Not as call 15 drew it.** Call 15 declares each as a topic in Settings › Notifications, with the phone told. They are
  lines on the bell alone for now (`BELL_LINE_KINDS`), as the account's two rows are: a topic would show on every
  workspace's Settings while Ads is on for one (D7). Joining a topic is one change, with `PUSH_KINDS` and a push for
  each row, when Ads opens to more workspaces. Which of the five also email was settled on 20 November: the two that
  stop an ad (below).
- **"Your ad account was disconnected"** is call 15's third Needs you. A sign-out by Meta is the account's row of 00653;
  an owner's own disconnect is their press, and rings nothing.

## As built, 20 November 2026 · The paused-ad check (the Ads plan's step 4, "Checking against Meta without spending")

The first requests sent to Meta to make anything, on Ruben's word, on his own ad account: with no card on it for the
first two runs, and with one for the third. No migration. Its order and what it showed are on the checks page (`docs/plans/2026-11-18-ads-meta-checks.md`).

- **One owner's press, with no screen:** `POST /api/v1/ads/check` judges New ad's draft as its own route does and
  hands its first version to the edge (`apps/edge/lib/ads/paused-check.ts`), only where `ADS_WRITES` is `live` (never
  `sandbox`) and `ADS_WORKSPACES` names the workspace, and only for a draft whose one stop is the missing card.
- **Every make is paused** and each dry run comes just before its own make (call 3), with Meta's key on each make
  and none on a dry run. The campaign above everything stays paused, so nothing is shown and nothing spends.
- **A check either finishes, paused, or leaves nothing.** Where Meta stops it after the campaign is made, the
  campaign is removed. In place of a draft, the route takes one campaign a check left, and removes it only where it
  is in the owner's account, named as a check names it, with it and everything under it paused (a finished check's
  paused ad goes with it).
- **What it found:** Meta's least for a total counts every calendar day the run touches, so the rule in
  `packages/contracts/src/ads/draft.ts` says so now; and Meta makes no ad, not even as a dry run, on an account with no
  payment method. Ruben added a card, and the third run made one paused ad whose read back matched what was sent on
  every point call 4 compares. The account's hourly read then took the ad in, and step 2's Resume and Pause
  (call 9) each reached Meta and were confirmed, with nothing spent.

## As built, 20 November 2026, later · A draft is kept, and left for the owner (the Ads plan's step 4, its third part)

Built with nothing sent to Meta. One migration is written and not applied: `00659`.

- **Call 2's draft has its row.** A workspace keeps one draft (`ad_drafts`), written only by a member's door,
  `ad_draft_keep`, which an owner, an operator or a partner who showed the second factor may call: drafting touches no
  platform. "A draft left for the owner is a bell row": kept with its words by a member who may not run ads, it rings
  each owner's bell once while their row is open (kind `ad_draft`, opening New ad), and the owner's own keep closes it.
  The row holds what was chosen; every read judges it afresh, as Turn on's press will. It is not yet the `ads` row of
  status `draft` the Shape names: that row arrives with Turn on's door, which makes it from this one.
- **Call 12's draft.** AI's card for an ad (`ad_draft`, an operator's) drafts on New ad's own route and opens New ad on
  it; it never makes an ad at a platform, holds no token and spends nothing there.
- **The owner's most** (the plan's G6) is kept on the account (`ad_accounts.most_minor`, the owner's door
  `ad_account_most`), and every draft's amount is held to it.

## As built, 20 November 2026, later still · The calls settled that day

Built with nothing sent to Meta. One migration is written and not applied: `00664`
(`supabase/migrations/00664_an_ad_that_can_t_run_is_mailed_once.sql`).

- **The card counts three** (contracts `AD_CARD_CHECKS`: the account is active, a payment method, the Page), each read
  from what is kept of the account, and says "Ready" when all three are met. The Page's link to the number AI answers is
  `whatsapp_link` on the card's read (`server/readers/ad-account.ts`): AI's own number named on the Page, AI answering
  none, or unsaid, drawn as one quiet line under the checks. Coming back to the tab asks Meta again only where one of
  the three is not met: before, the two WhatsApp checks were never met, so every come-back cost a read at Meta.
- **The two that stop an ad are mailed** (`ad_refused`, `ad_unpaid`; contracts `NOTIFICATION_DELIVERY`). `ad_bell_ring`
  writes their rows owing their mail (`mail_due_at`, 00409), in the statement that rings them; after each good read the
  account's job sends what is owed (the edge's `lib/ads/mail.ts`) through the one mail every notice takes, to the
  addresses Settings › Notifications names, and marks the rows: one mail a cause, whatever number of owners hears it,
  at most one mail a read, naming each cause where there are several. A cause that cleared first, a business that turned
  the mail off, or one with no address of its own is owed nothing; a mail that failed stays owed for the next read. In
  Settings › Notifications the two are one topic under Needs you, "An ad can't run", drawn only where Ads is. The other
  three stay on the bell's own line. `notifications_kind_check` is untouched.
- **A wider area** (the plan's 4.6 and G8). A draft may hold, in the circle's stead, a city (with Meta's least ring of
  10 miles), a state or region, or the whole country, by Meta's own key (`packages/channels/src/ads/meta-place.ts`). A
  place is only ever one Meta's location search found (the account door's `place` op, any member who may draft), picked
  by its name and by where the words around it place it (`server/ads/area.ts`), so a name Meta does not know is a change
  not made. "Tell AI what to change" names a wider place by its kind, its name and where it is; miles take it back to the
  circle. Where Google's listing says the business goes to its customers (`service_area_only`), a fresh draft proposes
  the city the listing names in the address's stead, where the rest of it names that city's region, else that region,
  and its line says why; where neither is sure, the circle stays. Nothing in Chanlytics says a business serves online,
  and no field was added for it. The request builder sends the place in the circle's stead, and what Meta holds reads
  back as the same word (`metaAreaWord`), which the paused check compares; the launch is to compare the same.

## As built, 21 November 2026 · Turn on, and after (the Ads plan's step 4, items 4 and 5)

Built with nothing switched on at Meta and nothing spent. One migration is written and not applied: `00666`
(`supabase/migrations/00666_an_owner_turns_an_ad_on.sql`). The first live ad waits for Ruben's word, on his own account
with a card limit he sets.

- **Call 3, the press.** `POST ads/turn-on` (`apps/dashboard/src/server/ads/turn-on.ts`, owner, `fresh`) carries what
  the press showed: the most the ad can cost, its end, the area, the picture and the words, and a key of its own. The
  workspace's kept draft is judged afresh and every check of 5.1 runs again; a press that showed anything else is
  refused ("This ad changed since you saw it"), so the owner can only press the number the server would have named.
  The most is worked out in one place, contracts `adMostOf`: a total with an end at Meta is the most (call 4). The
  edge's door (`apps/edge/lib/ads/turn-on.ts`) asks the owner, the switch, the account and AI's stop again, and keeps it
  through `ad_turn_on`: the draft becomes an `ads` row made here (`status` sending, `approved` what was pressed, `launch`
  its key), the decision `turn_on_ad` and the event `ad.turned_on` in one transaction, the draft gone and a draft left
  for the owner seen to. The same key twice is one ad; a draft changed since the press judged it is refused; one launch
  an account at a time.
- **Call 5, the job, as the account's own job.** The Shape names a job kind `ad_publish`. It is not one: the launch is
  the first work of the account's `ad_read` job (`apps/edge/lib/ads/launch.ts`), which `ad_turn_on` asks for at once.
  Meta keeps one small score an ad account, so one account's calls go one after another, and a launch that cannot
  finish in one pass is taken up by the next (its door brings the account's next read within a minute). Each part is
  made paused just after its own dry run, and kept in `ad_objects` as sent before its make goes: the campaign, the ad
  set, the picture, and an ad for each version of the words. The campaign is read back whole and compared with
  `approved` (`apps/edge/lib/ads/launch-parts.ts`); then, while AI is not stopped, the ads, the ad set and the campaign
  are switched on, the campaign last, and read back once more for Meta's word. The page says In review until Meta says
  ACTIVE.
- **Call 6, nothing unapproved is switched on.** No stop calls a switch. A stop removes the campaign with everything
  under it; what cannot be removed stays named and paused at Meta, kept as `left`, and the ad says Couldn't finish with
  what was left. A make whose answer never came is never sent again: it is found by its tagged name (`[cl:` and the
  first eight letters of the ad's id) and, unfound past ten minutes, the launch stops. A switch whose answer never came
  is never sent again either; the ad is made with `launch.unknown_at`, says Setting up for five minutes and then
  Couldn't confirm it's on with Check, and the account's next read settles it. The one part sent twice is the picture,
  which Meta's library keeps once by its bytes, and a dry run, which makes nothing.
- **A disconnect, or a sign-out, stops a launch** (a trigger on `ad_accounts`): the ad fails, what it made is left,
  and nothing more is sent. While AI is stopped no switch is sent, and the launch stops before its first.
- **The decision this note left open, whether a create is sent again with its key:** it is not. Call 6 holds for
  creates as for switches; the key stays on every make, so a create Meta took twice answers once.
- **Three versions are one ad.** The account's read folds Meta's three ads into the ad made here
  (`apps/edge/lib/ads/fold.ts`): the best word any version has, their days added; a launch's own parts are never
  adopted as an ad made in Meta. `ad_held_for` names the one ad for a tap on any version, for a person's page, the Ads
  page's counts and the bell's "nobody wrote".
- **Pause and turning back on, for an ad made here,** switch its own campaign, which holds its versions and nothing
  else; it turns back on here with what is left and its end named (`adResumeRule`), never while AI is stopped.
- **Two things seen on the paused-ad check's ad, mended here.** An ad's name never shows its tag (the read keeps the
  name as an owner reads it), and a drawer says where the ad shows, from the ad set's own platforms (`ads.shown_on`),
  "Facebook" for that one. A third, Pause offered on that ad while Meta checked it, was right: its own switch was on
  (step 2's Resume had just reached Meta), so it stands as it was.
- **A wider place goes through Turn on** (the calls settled the same day, above). The press carries it by Meta's key
  where the draft holds one, and a press that showed another area is refused; `approved` keeps it and no street
  address; the launch sends it in the circle's stead and compares Meta's word for it (`metaAreaSent`), as the paused
  check does.
- **`ADS_WRITES`:** `live` sends; `sandbox` walks every step and makes up Meta's answers (ids that begin 0000, which
  the read never asks Meta about); anything else stops a launch before it sends.
- **Not built here:** a video sent to Meta (Turn on sends a photo for now, and says so); Cancel during Setting up; the
  bell's rows for Couldn't finish and Couldn't confirm it's on (the page and the drawer say both); and the owner's
  changes to a running ad made here (the plan's step 4, item 6).

## As built, 21 November 2026, later · Changing a running ad made here, and Fix it (the Ads plan's step 4, item 6)

Built with nothing sent to Meta and nothing spent. One migration is written and not applied: `00670`
(`supabase/migrations/00670_an_owner_changes_a_running_ad.sql`, claimed 21 November).

- **The Shape's `setBudget` and `setEnd`, and `endAd`, are the routes** `budget`, `end-date` and `end`, with `area` for
  the miles (`apps/dashboard/app/api/v1/ads/[id]/budget/route.ts` and its three beside it, over
  `apps/dashboard/src/server/ads/presses.ts`'s `changeAd`), each the owner's and `fresh`,
  each carrying the version it was drawn from and what Meta held then. They ride the press door's `change` op
  (`apps/edge/lib/ads/change.ts`). One rule judges a change in the drawer, the route and the edge (contracts
  `ads/change.ts`, `adChangeIssue`); call 3's `maxSpendOf` is `adChangeMostOf`: only a raise names a most, the new total,
  and a press whose most is not the server's is refused.
- **Call 10, Meta's rules, as its pages say them (read 21 November):** a total never under Meta's least for the run,
  counted from its first day, nor under a tenth over what it has spent; four changes of an ad set's amount an hour; one
  change every thirty seconds. Every change to the ad set goes as Meta's dry run first; ending is a switch, sent as
  Pause is. The edge judges it all again before anything is kept.
- **Kept, then told,** as a press is (`ad_change_keep`: the change on the ad with what Meta held, the version bumped, the
  decision `change_ad` or `end_ad`; `ad_change_told`: taken, refused with Meta's words, or sent with no answer, and the
  events `ad.changed` and `ad.ended`, a refusal kept as `ad.press_refused`). One change at a time, ending taking the
  place of any. A change sent and never answered is never sent again (call 6): the account's next read reads the
  campaign back and settles it.
- **What Meta holds is what the page says.** A change is judged against the total and the last day the account's read
  kept, and a press drawn from another is refused, so a change made in Meta is never put back. What was approved moves
  with a change Meta took, and the drawer says where Meta holds something else.
- **`endAd`** archives the ad's campaign: Meta keeps its numbers and never turns it on again, so there is no Undo. The
  toast offers no "Make a copy": `copyAd` is not built.
- **`reviseAd` is not built as the Shape draws it** (a new creative, the old paused, back to review). Meta's pages
  document no way to swap an existing ad's creative. For an ad Meta turned down, Fix it does its work another way: AI
  writes each version again from Meta's words, the ad is kept as the workspace's draft with that change made
  (`apps/dashboard/src/server/ads/fix.ts`), and New ad's Turn on sends it through Meta's check whole, as calls 3 to 6 send any ad. The one
  turned down ends once that one is turned on, only while Meta still turns it down. For an ad that runs, changing its
  words or picture waits: a new ad in its place would restart what Meta has learnt of it.

## Settled 21 November 2026 · staging, and pausing when the way in closes

Ruben, 21 November 2026: "everything you recommend". The Ads plan's section 12 says the same.

- **Call 13: no staging deployment is built for Ads.** What it was for is proven without it: the paused-ad check on
  Ruben's own account made every part of an ad at Meta with nothing spent (20 November), `ADS_WRITES=sandbox` walks
  every step of a launch with Meta's answers made up, and Meta's pages no longer hold a test ad account ("As built,
  19 November 2026", above). So the first spend goes as the Ads plan's step 4, item 9 says: Ruben's own account with
  every ad paused, then with a hard card limit, then pilots. Call 13's text and P2's "it waits for staging and the
  sandboxes" stand as history.
- **Call 11's owner setting, "Pause my ads when the way in closes", is left for later.** The first version tells the
  owner and pauses nothing by itself. Of the telling, AI's stop is built (the page says how many ads are still on, with
  one press to pause them all); the sweep's check of each running ad's way in (WhatsApp disconnected or blocked, the
  line off, billing paused) with its badge, bell row and Today line is not built yet.
