# 0133 · A count is delivered

**Status:** Decided by Ruben, 14 November 2026 ("Yes, all five", to D1-D5 of the plan below); steps 1 and 2 built
(00626, and the ladder, which nothing reads yet), steps 3 to 5 not yet. Written against main at `e40c45927f`; built in
steps in one lane, `cm-count-delivered`, step 1 and 2 in one pull request and each later step its own.

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
  suggestion beside the ending. "Find N more nearby" is a press the owner makes (`apps/dashboard/app/api/v1/lead-searches/[id]/more/route.ts`, `purpose: "topup"`).
- **Sizes the main phase on the wrong yield.** `packages/core/src/leads/sizing.ts:99` counts a place with a candidate
  email as reachable (`hasContact`). An email search's yield of checked emails is lower, so the main phase asks for too
  few places.
- **Can't afford the count in a day.** `lead_cap('day_usd')` is $10 (`packages/contracts/src/leads/search/caps.ts:25`),
  which stops a 300 search near 250 leads at 4¢ a lead. `platform_day_usd` is $50: about 1,250 leads a day for every
  workspace together.
- **Shows our sorting work.** Needs review and Filtered out stand on Leads beside the finished leads.

**The probe of 14 November** (run `hp8gud6tD7QdOxSsr`, the card's own input, build 0.14.792, about $1.20):

- "med spa" in "Brooklyn, NY, USA", asked for 300, came back with **243 places in 4 min 55 s**, every one in Brooklyn.
- The source split the city into map pages by itself.
- 215 of the 216 sites were read, and 128 places carried an email before the check.
- So for a city, the 120 cap is ours alone, and a term asked past it reads the whole city.

**What a lead costs:** measured on the one real workspace's 13 email rounds before 13 November, 1.6¢ and 3.9 places
read per checked-email lead (88 leads, $1.43). The plan budgets 4¢, and the caps allow 8¢.

## Decision

1. **The count on the card is the count delivered.** Each finished lead fits what was asked (the judge's
   `qualified`), holds a checked email for an email search or a dialable phone for a phone search, and is new to the
   workspace. It stops short only when there is nothing more within the card's reach, the month's leads or spend are
   used, the owner stops it, or the source stays down after its own retries.
2. **A search widens by itself.** A city's terms read deep (600 a term). When a round ends short, the next round opens
   on the next ring of nearby ZIP areas without a press, up to the card's reach. **D2, the default reach:** 25 miles for
   a city, 15 for a ZIP, twice the radius for a circle. `plan.reach_m` holds the owner's choice, and `0` is "only this
   area". The ladder adds no terms by itself.
3. **Only finished leads are shown, counted and charged.** For a searched lead, `review` and `excluded` stay in
   `lead_search_members` for dedupe, the priors and a team-only Console view. They never stand on Leads. **D4:** an
   imported list keeps its Needs review.
4. **D5:** the question after the probe asks about fit alone. A shortfall of emails is the ladder's work.
5. **D1, the money:** search cost stays inside the plan's price. The caps fit the promise:
   - `month_usd` $40, which is 500 leads at 8¢;
   - `day_usd` $25, which is 300 leads at 8¢;
   - `platform_day_usd` $400, which pages at 80%.

   Past the platform cap a search waits for the next day and says so; it is never refused.

6. **D3:** the deep ask was probed first (above), and it holds for a city. A ZIP or a circle keeps 120 a term until a
   probe of `customGeolocation` shows the same.

## Shape

- **The ladder:** `packages/core/src/leads/ladder.ts`.
  - `reachOf(area, reach_m)` gives the reach in metres.
  - `nextRung({ plan, center, areaRadiusM, read })` gives the next three ZIP areas that are past the area, inside the
    reach and not read before, nearest first, each in its own state; or none.
  - It is pure, over `nearestAreas`.
- **A leg** is a round with `purpose = 'widen'`, opened by the runner through a service-role door
  (`lead_search_widen`, one migration). That door reserves the remaining count and its estimate exactly as
  `lead_search_more` does. Guards:
  - at most 8 legs a search;
  - no leg when the last two together added fewer than 3 finished leads.
- **The endings:** `searched_everything` and `few_new_matches` with no rung left read as `no_more_within_reach`, a new
  ending. With a rung left, the round opens the next leg instead of ending the search.
- **The yield:** finished leads per place read, for the plan's contact standard (`sizing.ts`).
- **The caps:** `lead_cap()` and `caps.ts` move together (`lead-caps.db.test.mjs` holds them).

## Steps

Each step is one pull request, in either deploy order unless it says otherwise.

1. **Deep for a city, and the caps.**
   - `maxPerTerm` reads 600 for a city area;
   - a term asked past what it holds says the area is read;
   - the three caps (00626), in a migration applied before the merge.
2. **The ladder and the reach**, with no widening yet and nothing a customer sees:
   - `ladder.ts`;
   - `plan.reach_m` (optional, so old plans read as their area's default).

   The card's reach line and `nearbyFor` taking the ladder ship with step 3: a card says the reach only once a search
   walks it (decision 0132).

3. **Legs** (migration: the purpose, the ending, the door, `lead_searches.areas_read`):
   - the runner opens the next leg;
   - yield as finished per place;
   - retries before `source_failed`;
   - the platform's page at 80% of its day;
   - all behind `lead_platform.widen_on`.
4. **The owner's side:**
   - only finished leads for a search;
   - the strip's live line;
   - the endings' sentences;
   - Ask's words;
   - Today and the bell.
5. **One timed real 300 search on Ruben's own workspace**, then on for everyone.

## Tests

- `tests/leads/engine/ladder.test.mjs` covers:
  - rungs for a city, a ZIP and a circle;
  - each rung skipping what was read;
  - the reach as the ceiling, and `reach_m = 0` as no rung;
  - each area in its own state.
- `tests/leads/engine/lead-core.test.mjs`:
  - a city asks deep and a ZIP does not;
  - the endings with a rung left and with none;
  - the guards.
- `tests/leads/engine/lead-runner.test.mjs`: a 300 email search over fake ports across three legs ends
  `target_reached` with its unused reservation released; the same with a thin last ring ends
  `no_more_within_reach`.
- `tests/leads/lead-widen.db.test.mjs`: the door reserves as `lead_search_more` does, is re-runnable and refuses past
  its guards.
- `tests/leads/finder/leads-honest.test.mjs`: the words, and no piles for a searched lead.

## Risks

- **A loop that spends with nothing found.** The two guards, the day and month caps, and the platform page at 80%.
- **Leads far from where the owner meant.** The reach is on the card and the owner's to change; each ZIP is said in
  its own state.
- **The cost rests on one workspace's 13 rounds.** The caps allow twice the planning figure, and step 5 measures a
  real run before the switch is on for everyone.

## Open questions

- How a leg reads a rung's three ZIPs. Either one round each, which is three times the legs and keeps the runner as it
  is; or one round whose area is the rung, its runs asking `customGeolocation` as a `MultiPoint` with a radius, which
  the source's input schema takes. The second keeps one run per term, but needs an area kind of several centres, read by
  the sentence and the judge's in-area check. Decided when step 3 is built.

- Whether a ZIP's or a circle's `customGeolocation` splits past 120 as a city does: a probe of a few dollars, on
  Ruben's word, before step 2 widens their per-term ask.
