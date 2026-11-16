# 0133 · A count is delivered

**Status:** Decided by Ruben, 14 November 2026 ("Yes, all five", to D1-D5 of the plan below, and "Yes, take them", to an
outside review's six changes); steps 1 to 4 built (00627, 00628; widening ships off), step 5 not yet. Written against main at `e40c45927f`; built in one lane, `cm-count-delivered`.

## Context

Ruben, 14 November 2026: "when users ask for like 300 … will chanlytics provide user with 300 leads? … asking for 300
leads and getting like 50 is not like a real world usable app", and "we cannot give them a bunch of extra leads under
needs review or filtered out … that's for our internal job work". The plan he decided from is
`Claude Video/docs/2026-11-14-300-means-300/plan.md` (outside the repository); this note is what the code takes from it.

A search for 300 at `e40c45927f`:

- **Reads at most 120 places a term.** `packages/contracts/src/leads/search/cards.ts:84` sets `maxPerTerm: 120`, and
  `packages/core/src/leads/cards.ts:409` asks the source for no more. Five terms at most, so 600 places is the most
  one area gives.
- **Stops after one main phase.** `packages/core/src/leads/runner/round-decision.ts:118` writes the nearby areas as a
  suggestion beside the ending. "Find N more nearby" is a press the owner makes
  (`apps/dashboard/app/api/v1/lead-searches/[id]/more/route.ts`, `purpose: "topup"`).
- **Counts a top-up's terms as read everywhere.** `packages/core/src/leads/runner/start.ts` (`termsTried`) counts a
  term's places across the search's rounds, so a round in a new area that a term had read 120 of in the city asked it
  for nothing.
- **Can't afford the count in a day.** `lead_cap('day_usd')` is $10 (`packages/contracts/src/leads/search/caps.ts:25`),
  which stops a 300 search near 250 leads at 4¢ a lead.
- **Shows our sorting work.** Needs review and Filtered out stand on Leads beside the finished leads.

**The probe of 14 November** (run `hp8gud6tD7QdOxSsr`, the card's own input, build 0.14.792, about $1.20):

- "med spa" in "Brooklyn, NY, USA", asked for 300, came back with **243 places in 4 min 55 s**, every one in Brooklyn.
- The source split the city into map pages by itself.
- 215 of the 216 sites were read, and 128 places carried an email before the check.
- So for a city, the 120 cap is ours alone.

**What a lead costs:** measured on the one real workspace's 13 email rounds before 13 November, 1.6¢ and 3.9 places
read per checked-email lead (88 leads, $1.43). The plan budgets 4¢; the workspace's caps allow 8¢.

**An outside review of the plan** (14 November, read against `15f850bdca`) was taken in six changes, below. Its first
finding, that an email search counted a lead with a phone alone, was true at that commit and fixed by #2321 before it
was read (`packages/contracts/src/leads/search/class.ts:134`).

## Decision

1. **The count on the card is the count delivered**, within the reach and the limits on it. A finished lead fits what
   was asked (the judge's `qualified`), holds a checked email for an email search, or a valid phone number or a checked
   email for a phone search, and is new to the workspace. A phone's format is checked, never its line: no word says a
   phone is checked or dials.
2. **A search widens by itself.** A city's terms read deep (600 a term). When a round ends short, the round's end opens
   the next leg on the next nearby ZIP area, up to the card's reach. **D2, the default reach:** 25 miles for a city, 15
   for a ZIP, twice the radius for a circle. `plan.reach_m` holds the owner's choice, and `0` is "only this area". The
   ladder adds no terms by itself.
3. **Only finished leads are shown, counted and charged.** For a searched lead, `review` and `excluded` stay in
   `lead_search_members` for dedupe, the priors and a team-only Console view. They never stand on Leads. **D4:** an
   imported list keeps its Needs review.
4. **D5:** the question after the probe asks about fit alone. A shortfall of emails is the ladder's work.
5. **D1, the money:** search cost stays inside the plan's price. The caps:
   - `month_usd` $40, which is 500 leads at 8¢;
   - `day_usd` $25, which is 300 leads at 8¢;
   - `platform_day_usd` $150, every workspace's day together. It rises less until real searches measure what a lead
     costs, and pages the platform at 80%.

   Past a day's cap, the search stops on `day_used`, "today's searching is used up", with Carry on.

6. **D3:** the deep ask was probed first (above), and it holds for a city. A ZIP or a circle keeps 120 a term until a
   probe of `customGeolocation` shows the same.
7. **A search never claims the market is empty.** Once the ladder is out, it ends on `reach_searched`: "every area within
   reach was searched, and no more that fit were found". A source that failed partway ends on `source_failed`, never
   on searched.
8. **A time is a range** ("40 to 80 minutes") until real searches measure the spread.

## Shape

- **The ladder:** `packages/core/src/leads/ladder.ts`.
  - `nextRung({ plan, center, areaRadiusM, read })` gives up to three ZIP areas past the area, inside the reach
    (contracts' `reachOf`), nearest first, each in its own state.
  - No area lies within its own radius of an area read before or of another in the rung: the source charges for every
    place it returns, a duplicate too.
- **A leg** is one round of `purpose = 'widen'` on one area: the search's plan with the rung's first area. A run is
  still one per term (its id is round, phase and term), and each leg is a round of its own, so no two runs share an
  id. Legs run one after another, so a search holds about one run per term at a time.
- **Where it opens:** `lead_round_end` (00628). A round ending `few_new_matches` or `searched_everything` short of the
  search's count, where `lead_platform.widen_on` or `widen_tenants` names the workspace, does three things:
  - settles and releases its own reservation;
  - reserves the next leg through `lead_reserve`, at `lead_estimate_ceiling` for what the count still wants, and only
    what the month has left when that is less;
  - opens the leg (`lead_round_start`), and marks itself `carries_on`, so its end rings nothing.

  Guards, each ending on `reach_searched`:
  - no area left in the rung;
  - eight legs;
  - the last two legs adding fewer than three leads between them.

  A refused reservation ends on `month_leads_used`, `budget_used` or `day_used`.

- **A leg's start:** it reads only its own runs as read (`termsTried`), and sizes from what the search's earlier rounds
  delivered, every one ended and checked (`sizing.ts` `finishedYield`), never a candidate email. It asks each term for
  a page at least, the card's 120 (`runner/main-ask.ts` `legPageOf`): the source answers a term near a place from its top,
  and the top of an area beside ones the search read is mostly what it already holds, so a leg sized for the few a count
  nearly met still wants found none of its own.
- **The first round's size:** the probe's yield counts what the search's standard counts (`sizing.ts` `hasContact`). A
  search made for email counts a checked email alone (decision 0132), so it sizes from the places with a candidate
  email, never from a phone: counted by phones, it asked the card's area for about half the places its count needed
  and moved on to the next area early.
- **Every member is read:** the runner reads a round's and a search's members a page at a time (`pageSearchMembers`,
  read whole). One answer carries a thousand rows, which a city's round or a search of several legs passes, and the
  count, the addresses to check and the next area are all worked out from them.
- **A round's own money is not the month's:** what a round reserved is its estimate. Run out, the round ends on what
  its terms say of its area (`few_new_matches`, or `searched_everything`), names the next area, and its end opens the
  next leg with a reserve of its own. `budget_used` is said only where a reservation is refused (`lead_reserve`):
  contracts' `endingOfRound` no longer reads the round's reserve, and a start with nothing left of it ends the same way
  (`start.ts` `endAtItsLimit`).
- **One term at a time:** the source charges for every place it returns, one the search already holds too, and a
  search's terms are synonyms. The main phase asks one term, the widest first, for all it still wants
  (`sizing.ts` `mainAsk`, `runner/main-ask.ts`); the end of its run starts the next only where every term asked so far
  came back under its ask, its area read (`round-decision.ts`, `NEXT_TERM`). A synonym whose runs returned at least 40
  places, three in four of them already the workspace's (`lead_runs.already_yours`), is not asked again by a later
  round; the widest term always is.
- **An email search judges a place with an address:** past its probe, a place with no candidate email is settled by code
  as the judge's read would settle it (`places.ts` `noEmailRule`: in review for no email, or left out with no number
  either), and counts as looked at when a later ask is sized (`rules.ts` `wasWeighed`). The probe's places are all
  judged: the question after it is about fit.
- **An exclusion's bar is said:** the judge is told an exclusion is held to the kind's bar, its read of the facts
  (`judge.ts` `judgeQuestions`), as `classify` always held it. Unsaid, it answered unknown wherever a listing did not
  say a business was not a chain.
- **How many legs, and how a guard stops it** (00634): a search may read `lead_leg_cap` legs, one for every ten leads
  of its count, eight at least, forty at most; a dense niche's leg adds about nine. Stopped by that cap, or by its last
  two legs adding fewer than three, with an area still within reach, the round ends on what its area did, its nearby
  kept, so the strip says "Found N of M in and near <area>" and offers the next area (contracts `leadEndingLine`,
  `widened`), and the bell says how many of how many. `reach_searched`, "every area within reach was searched", is said
  only when the ladder has no area left.
- **The day's searching used** (00634): a leg the day cannot hold is reserved from tomorrow's day and starts at midnight
  in the workspace's zone (`lead_rounds.starts_at`, its start job due then); the strip says it carries on tomorrow by
  itself, with Stop. Never into the next month, whose leads the owner has not given: that stops on `day_used`, with
  Carry on. A leg the count's estimate cannot be reserved for asks for a page's first (`lead_estimate_ceiling` of 48
  leads and one term).
- **Ground already held:** the ladder passes an area whose circle holds 40 places a search of its kind already holds
  (`ladder.ts` `HELD_IN_AN_AREA`): this search's, and the workspace's searches of the same terms in the last 90 days
  (`runner/main-ask.ts` `findHeldPlaces`, the port's `searchesLike`). A round in an area such a search read asks each
  term past what that search's runs read (`readInArea`).
- **A mark is read for a place that may count:** a place's own site is read for its mark only where it counts or will
  once its address checks out (`weighed.ts` `mayCount`), or where the judge's read already brought the page; the leads
  sweep's second try the same (`listLeadsUnmarked`).
- **The card's time and money for a search made for email:** 0.48 minutes and 8 cents a lead, as the second real search
  measured whole (`caps.ts` `LEAD_EMAIL_MINUTES_PER_LEAD`; the 8 cents is the price the month's caps are sized to, $40 for 500); where the month's searching covers
  fewer leads than the count, the card says how many, in leads.
- **The notice:** a round that carries on rings nothing; the round that ends a widened search counts every leg's leads.
- **The platform's page:** `apps/edge/lib/leads/sources.ts` `recordPagePlatformDay`, from the leads sweep, once a day
  at 80% of `platform_day_usd`.

## Steps

1. **Deep for a city, and the caps** (00627, applied before the merge): `maxPerTerm` reads 600 for a city area; the
   month's, the day's and the platform's caps.
2. **The ladder and the reach**, nothing a customer sees: `ladder.ts`; `plan.reach_m`.
3. **Legs** (00628, applied before the merge), off for everyone:
   - the round's end opens the next leg;
   - a leg reads and sizes its own area;
   - the two endings; the notice;
   - the platform's page;
   - the card's count line by the contact standard;
   - the time as a range.
4. **The owner's side**, before the switch is on for anyone. Built:
   - **only finished leads for a search:** its band is Qualified alone, and its strip links to no Needs review or Left
     out, nor says a number of them (`leadBand` and the strip read `isLeadList`: a list of the owner's own keeps all
     three, D4);
   - **the card's reach line,** where the workspace widens (`lead_search_widens`, 00628, the one rule `lead_round_end`
     reads too): "Looks in Brooklyn first, then nearby, up to 25 miles away", and "Change how far" (only the card's
     area, 10, 25 or 50 miles, and the plan's own) writes `plan.reach_m`. Ask's card says the same as a row. Where it
     does not widen, no reach is said, and a count past one area is said as before;
   - **the strip across legs:** a leg counts the whole search ("86 of 200", never of what the leg still wants), names
     the area it reads, and says it comes after the card's area, never that the card's area is searched: a round
     also moves on from a term it asked no deeper (`round.area`, read for a leg's round alone);
   - **the endings:** `reach_searched` says the miles and that the leads not found stay the owner's this month;
     `month_leads_used` says the day the leads renew;
   - **the card before the press:** its count binds to the leads left, as before (`leadPlanAsk`); its email choice says
     a checked email alone;
   - **the bell and Today** (one notice, both read it): a widened search's notice counts its finished leads, and an
     ending short of its count says why in its title (the reach searched, the month's leads, the month's searching).

   And, asked for as step 4's leftovers ("Build the leftovers first"):
   - **a source's failure tried again** (core `runner/retries.ts`): a term whose run failed or timed out partway starts
     again twenty minutes on, under a run id of its own (`retryRunIdFor`), asked past what it read, up to three times; a
     term read whole stands by its newest run (`standingRuns`), so its round ends as one that never failed. Every term
     failing within half a minute spends no try: the round ends `source_failed` and the platform is paged
     (`lead_source_down`, beside `lead_source_refused` for a start refused);
   - **Ask setting the reach from words**: `propose_lead_search` takes `reach_miles`, which the planner writes as
     `plan.reach_m`;
   - **"Look up to 50 miles"**: a round with no area left within the reach names the areas past it, each marked with
     the reach it was found at (`LeadArea.beyond_m`), which `lead_round_end` never opens. A `reach_searched` ending
     offers the press only where one was found; the plan card opens with the wider reach, and the approved top-up moves
     on past the old reach as the next point says;
   - **a top-up carries on where the search was** (the review of 14 November): a term counts only what was read in its
     own area (`readInArea`: the most its runs read there, or what was kept of it, and nothing past an area searched to
     its end), so "Find N more nearby" asks a fresh area whole, for every workspace; and a top-up with nothing left to
     ask in its area names where the search looks next before it ends (`endAtItsLimit`, `findNextAreas`), so Carry on,
     the rest when the leads renew and Look up to 50 miles move on to the next area instead of ending where they began;
   - **a leg the month's leads held short** met the count it was given and not the search's: `lead_round_end` ends it on
     `month_leads_used` (the day the leads renew, and Find the other N), never as found;
   - **"Find the other 50 on Dec 1"** on `month_leads_used`: Find more with the purpose `defer` calls
     `lead_search_on_renewal`, which reserves the rest from the workspace's next month now and queues a top-up that
     starts at midnight on its first day (`lead_rounds.starts_at`, its start job due then). The strip says when, with
     Don't, which stops it and gives back what it held;
   - **the Console's Leads set aside tab** on a workspace (`GET platform/tenants/[id]/set-aside`): its searches with
     what each counted, set aside and spent, and the places one set aside, worded by `leadExclusionWord`.

5. **Real searches before everyone:** a dense city, a sparse town, a rare niche and two searches at once, on Ruben's
   own workspace (`widen_tenants`), each timed and costed; the switch on for everyone only once the cost and the time
   hold.

6. **The first real search, and what it changed** (15 November 2026, search `b6f2d0de`, Ruben's workspace): 300 med
   spas in New York with a checked email, bound to the 267 leads the month had left. It ended after 11 minutes at 41,
   on `budget_used`, with no leg, for $8.67: 21 cents a lead against the plan's 4, and 11.5 places a lead against 4.
   - It stopped because the round passed its own $5.95 reserve; the month had $24 of its $40 left, and the notice said
     the month's searching was used up.
   - Three terms asked side by side for 341 places each returned 1,025, of which 472 were different: $2.70 of $4.96.
   - The judge read 348 places, 183 of them with no email to check: $1.46.
   - 83 addresses checked out. 41 counted; the other 42 waited in review as worth a look, 21 of them on one answer,
     unknown to "chains".
   - Reading each place's own site for its mark cost $2.13 (426 reads at half a cent), 18 of them for a lead that
     counted. Not changed here: which places are worth a mark, in the collect and in the sweep's second try, is its own
     decision.
     The four changes under Shape (a round's own money, one term at a time, an email search judges a place with an
     address, an exclusion's bar) answer the first four. The switch stays on for one workspace until a second search
     measures them.

7. **The second real search** (15 November 2026, search `46a77c1e`, after #2344): 100 med spas in Queens with a checked
   email. It found 99 in 47 minutes for $7.97: 8 cents a lead, 6.5 places a lead, the rate the month's $40 is held to.
   The first round carried on past its own $2.40, and eight legs read Brooklyn, upper Manhattan, the Bronx, the
   Rockaways, Long Island and two areas of New Jersey, each term in its turn.
   - It ended one short. The last three legs were asked for 16, 8 and 4 places, the few the count still wanted over
     the yield; the top of those areas was mostly what the search held, so they found 2, 1 and 0, and the guard said
     every area within reach was searched. A leg now asks each term for a page at least (Shape, a leg's start).
   - About 409 of the 1,048 places it paid for were already the workspace's: the ladder passes the areas this search
     read, not those its other searches read. Not changed here.
   - Reading each place's site for its mark was $1.96 of the $7.97. Not changed here.

8. **On for everyone** (16 November 2026, Ruben's word): `lead_platform.widen_on` true; every workspace that may
   search widens. The first twenty searches are read for their time, their cents a lead, their legs and their endings.

9. **What the second search found, changed** (16 November 2026, Ruben's "continue all batches"): a search's legs grow
   with its count and a guard's stop offers the next area (eight legs held a search of 300 near 100, and said every area
   was searched with areas left); the day's searching used waits for tomorrow instead of the owner's Carry on; the
   ladder passes ground the workspace's like searches hold, and a round asks past what they read (434 of 1,073 places
   paid for again); a mark is read only for a place that may count (about 300 of 391 reads); the card says a search
   made for email's measured time, and how many leads the month's searching covers where that binds. Reading a page
   for its mark stays the page reader's (31 Oct 2026: "we are not a website reading software").

## Tests

- `tests/leads/rounds/a-search-asks-one-term-at-a-time.test.mjs`: the main phase asks the widest term alone, for all it
  wants; the next only once the one before came back short; none where it came back whole; a synonym that mostly
  returned places already held is passed over by a later round, and the widest never is; a round past its own reserve
  ends on what its area did and names the next; an email search's main phase judges only a place with an address.

- `tests/leads/rounds/where-the-next-round-looks.test.mjs`: the reach; rungs nearest first, in their own state, past
  the area and inside the reach; each rung past every area read; no two areas overlapping; the ladder running out.
- `tests/leads/rounds/a-leg-reads-its-own-area.test.mjs`: a leg asks its own area though its term read 600 places on
  the card's; it sizes from what counted; once dry, it names the next area past its own.
- `tests/leads/engine/lead-search.test.mjs`: a city asks deep and a ZIP does not; the caps.
- `tests/leads/engine/lead-sources.test.mjs`: the platform's page at 80%, once a day.
- `tests/leads/rounds/a-search-widens-until-its-count.db.test.mjs`: a round's end opens a leg only where widening is
  on, carries on silently, stops on its guards and on a day's cap, and the leg that ends rings with every leg's count.
- `tests/leads/finder/leads-finder.test.mjs` (step 4): the card's reach and its picker, only where the search widens;
  a leg's strip; the reach's ending and Look up to 50 miles; no pile of ours on a search's strip or band, all three on a
  list's; the month's renewal, its press and its waiting line; Ask's card's row.
- `tests/leads/rounds/a-failed-run-is-tried-again.test.mjs`: a partway failure tried again under its own run, asked past
  what it read; three tries and no more; every term failing at once pages and spends no try.
- `tests/leads/rounds/a-leg-reads-its-own-area.test.mjs`: a leg with nothing within its reach names the areas past it,
  marked; a top-up in a fresh area asks it whole; a top-up with nothing left in its area names the next and ends. `tests/leads/finder/lead-ask.test.mjs`: Ask's `reach_miles`. `tests/leads/lead-routes.test.mjs`: Find more,
  deferred. `tests/console/back-office/what-the-finder-set-aside.test.mjs`: the Console's tab.
- The database cases (CI): a marked area never opened by a round's end; a leg the month held short ends on the
  month's leads; the deferred round reserved from next month and started on its first day.

## Risks

- **A loop that spends with nothing found.** The guards, the day's and month's caps, the platform's at $150 and its page
  at 80%.
- **Leads far from where the owner meant.** The reach is on the card and the owner's to change; each ZIP is said in
  its own state.
- **Gaps between ZIP circles.** Spaced so no two overlap, the circles leave ground between them unread. A shortfall
  says "within reach", never "none exist". A grid of cells comes only if real searches show the gaps cost leads.
- **The cost rests on one workspace's 13 rounds.** Step 5 measures before the switch is on for everyone.

## Open questions

- Whether a ZIP's or a circle's `customGeolocation` splits past 120 as a city does: a probe of a few dollars, on
  Ruben's word.
