# 0133 · A count is delivered

**Status:** Decided by Ruben, 14 November 2026 ("Yes, all five", to D1-D5 of the plan below, and "Yes, take them", to an
outside review's six changes); steps 1 to 3 built (00626, 00627; widening ships off), step 4 built but for the four
parts its section names, step 5 not yet. Written against main at `e40c45927f`; built in one lane, `cm-count-delivered`.

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
- **Where it opens:** `lead_round_end` (00627). A round ending `few_new_matches` or `searched_everything` short of the
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
  delivered, every one ended and checked (`sizing.ts` `finishedYield`), never a candidate email.
- **The notice:** a round that carries on rings nothing; the round that ends a widened search counts every leg's leads.
- **The platform's page:** `apps/edge/lib/leads/sources.ts` `recordPagePlatformDay`, from the leads sweep, once a day
  at 80% of `platform_day_usd`.

## Steps

1. **Deep for a city, and the caps** (00626, applied before the merge): `maxPerTerm` reads 600 for a city area; the
   month's, the day's and the platform's caps.
2. **The ladder and the reach**, nothing a customer sees: `ladder.ts`; `plan.reach_m`.
3. **Legs** (00627, applied before the merge), off for everyone:
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
   - **the card's reach line,** where the workspace widens (`lead_search_widens`, 00627, the one rule `lead_round_end`
     reads too): "Looks in Brooklyn first, then nearby, up to 25 miles away", and "Change how far" (only the card's
     area, 10, 25 or 50 miles, and the plan's own) writes `plan.reach_m`. Ask's card says the same as a row. Where it
     does not widen, no reach is said, and a count past one area is said as before;
   - **the strip across legs:** a leg counts the whole search ("86 of 200", never of what the leg still wants), names
     the area it reads, and says the card's area is done (`round.area`, read for a leg's round alone);
   - **the endings:** `reach_searched` says the miles and that the leads not found stay the owner's this month;
     `month_leads_used` says the day the leads renew;
   - **the card before the press:** its count binds to the leads left, as before (`leadPlanAsk`); its email choice says
     a checked email alone;
   - **the bell and Today** (one notice, both read it): a widened search's notice counts its finished leads, and an
     ending short of its count says why in its title (the reach searched, the month's leads, the month's searching).

   Not yet, each its own piece before the switch is on for everyone:
   - **a source's failure tried again before `source_failed`.** The kinds are told apart already (a refused key or
     build tells the platform at once, a lost answer is reconciled, a busy source is retried by the ledger); a run that
     failed or timed out partway is not tried again, since a run's id is its round, phase and term, and a second try
     needs an attempt in it;
   - **Ask setting the reach from words** ("only in Brooklyn"): the tool's schema is pinned by its fixtures;
   - **"Look up to 50 miles"** on a short ending, and **"Find them on Dec 1"** on the month's;
   - **the Console's view** of what the finder set aside, per search.

5. **Real searches before everyone:** a dense city, a sparse town, a rare niche and two searches at once, on Ruben's
   own workspace (`widen_tenants`), each timed and costed; the switch on for everyone only once the cost and the time
   hold.

## Tests

- `tests/leads/rounds/where-the-next-round-looks.test.mjs`: the reach; rungs nearest first, in their own state, past
  the area and inside the reach; each rung past every area read; no two areas overlapping; the ladder running out.
- `tests/leads/rounds/a-leg-reads-its-own-area.test.mjs`: a leg asks its own area though its term read 600 places on
  the card's; it sizes from what counted; once dry, it names the next area past its own.
- `tests/leads/engine/lead-search.test.mjs`: a city asks deep and a ZIP does not; the caps.
- `tests/leads/engine/lead-sources.test.mjs`: the platform's page at 80%, once a day.
- `tests/leads/rounds/a-search-widens-until-its-count.db.test.mjs`: a round's end opens a leg only where widening is
  on, carries on silently, stops on its guards and on a day's cap, and the leg that ends rings with every leg's count.
- `tests/leads/finder/leads-finder.test.mjs` (step 4): the card's reach and its picker, only where the search widens;
  a leg's strip; the reach's ending; no pile of ours on a search's strip or band, all three on a list's; the month's
  renewal; Ask's card's row.

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
