# 0050 · The spend door

**Status:** Decided on 11 October 2026 (Ruben: the review's fourteen calls, approved as recommended), nothing built. Four
things stay open and are named under "Not decided here": the price, health and cosmetic businesses, which notices also
email, and the consent line's wording, which is counsel's. This is the spending half of Campaigns › Ads; 0049 decides
the records and how a person is counted, and this note leans on it. It also leans on 0035 (a keyed write is answered
once), 0040 (each alert says where it goes) and 0018 (a reply goes first, each workspace takes its turn), and on 0047 and
0048, both drafted in another lane and not on main yet; each place that depends on one says so. Written against commit
`132ab95eb` (main, 11 October 2026). Where this note and the code disagree, the code wins.

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
   platform, never through Chanlytics. Pause an ad and nothing more is spent."
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
   decision's data.
4. **"Up to" is said only where the platform enforces it.** That is Meta's lifetime budget with an end time, Google's
   campaign total (up to 90 days) and TikTok's lifetime budget. Before an ad is activated, the platform's own budget, end
   time and status are read back and compared with `approved`; a difference fails the ad. A Google "until I stop it" is a
   daily average that may reach twice a day, and says "about $15 a day", never "at most".
5. **Turn on is a job.** The press writes the intent, the owner's decision, the maximum and the job in one transaction
   and answers `202`; the drawer says "Setting up". The job creates everything paused, reads it back, then activates from
   the bottom (the ad, its group, its campaign), so the last flip is the one that starts spending.
6. **A failure never leaves an ad running.** No failure path calls activate. A job that fails after creating something
   pauses or removes it; what it cannot remove stays recorded, named, and paused ("Left in Meta, paused ›"). The ad says
   "Couldn't finish", the owner gets a bell row ("We couldn't finish setting up Spring offer. Nothing was spent."), and
   an owner can remove the leftovers in the platform. An outcome the job cannot tell is settled by a read of the object's
   tagged name, never by sending again.
7. **An unready account blocks Turn on.** "Checked before turning on" lists every gate in the owner's words, each with
   its door: payment, the Page and the WhatsApp number linked to it, Meta's lead-ad terms for a form, Google's advertiser
   verification, TikTok's identity and post permission. A red row stops the press; an amber row is told. The rows for
   the way in (WhatsApp, call, form) are drawn from `abilitiesOf`, the engine review's capability matrix, and are not a
   list of their own. The ad's words are checked by the receptionist's own predicates (`namesMoney`): a price that
   disagrees with Services is red, and any price while the receptionist is set never to quote prices is amber, with its
   consequence: "Your receptionist will hand over anyone who asks about this offer."
8. **Disconnecting while an ad runs is refused:** "Pause or end your ads first." Otherwise Chanlytics would lose control
   of money still being spent. A disconnect asks the platform to revoke first and drops the credentials after.
9. **Ads made on the platform are adopted read-only** (0049) and take Pause and Resume only. Pausing is always safe.
10. **Each platform's budget rules live in one table in contracts, `platformRules`,** read by the checks, the presets, the
    amount chip and Ask. Meta's floors come from the account's own `minimum_budgets`, never hard-coded; a day may overspend
    by a quarter and a week never above seven times the daily amount. TikTok needs more than $20 a day for an ad group,
    allows a change of at most 30% (40% while learning), and not within two days of the last. A Google total spans at most
    90 days from its start, its type is fixed once it runs, and edits should be rare. A raise that breaks a rule is refused
    before any platform call, in the platform's words.
11. **A closed way in is told, not acted on.** A running ad whose door has closed (WhatsApp disconnected or blocked, the
    line off, billing paused) still spends. The sweep checks each running ad's door each tick; when it fails, the ad's
    badge is Needs you, a bell row is kept and Today shows it. "Pause my ads when the way in closes" is an owner setting,
    off by default; when on, the pause is the owner's standing instruction and the decision names it.
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
    Settings, since it sends customers' hashed numbers to a platform. Telling a platform who booked is not built, and
    stays off for health businesses.

## Shape

The verbs are in `packages/core/src/ads/` over `AdPlatformPort` (`createStack`, `activate`, `pause`, `setBudget`,
`setEnd`, `readState`, `find`, `remove`), which the edge implements by wrapping the pure request builders in
`packages/channels/src/ads/` around `providerFetch`. A verb records the owner's decision and its event in one SQL
transaction through a definer door.

- `draftAd`, `copyAd`: operator and above; no platform contact; Undo deletes the draft.
- `requestTurnOn`: the owner; Undo while it is setting up cancels the job, and after that it is a Pause.
- `publishAd`: the job, no one's press. `unwindAd`: the system removes or leaves paused what a failed Turn on made.
- `pauseAd`, `resumeAd`: the owner; short calls; each is the other's Undo.
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

- The price of Ads, and whether it is part of a plan.
- Health and cosmetic businesses: whether Ads is offered to them at all, and on which doors. TikTok already needs a sales
  representative for cosmetic procedures, so there is no one-press Turn on there.
- Which of the five notices in 15 also email. The review proposes mail always for the first two and a choice for the rest.
- The wording of the form's consent line, which is counsel's. Nothing ships past a draft.
