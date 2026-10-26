# 0062 · Ask is the operator: every page's verbs, read across pages, plans that cross them

**Status:** Approved by Ruben on 15 October 2026: "all is approved as you best recommend" (the operator design, D1 to
D13, `Claude Video/docs/2026-10-15-ask-operator-design.md`). Built on the lane `ask/operator` from main's `2eda129a7`,
and merged in #1620 the same day.
Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

Ask proposed 21 of the 36 verbs the pages commit. Its campaign tools still spoke the model decision 0060 replaced, its
`report` took 7, 30 or 90 days while Reports takes any window, and it read one page at a time: it could not notice that
thousands of people sat beside nothing sending, learn who its best customers were, or carry a plan across pages. Ruben
asked for Ask to serve the owner who is new, the owner who runs everything by chat, and to run the business end to end on
the owner's approval, and for no tool to be judged by its use while the product is not live.

## Decision

1. **Every page verb is a card (D1, D12).** One table of specs (`packages/contracts/src/ask-proposals/proposals.ts`
   `PROPOSAL_SPECS`): a page's press and Ask's card walk the same spec. A verb either has an Ask action or a reason in
   `ASK_PAGE_ONLY_VERBS`; `ask-parity.test.mjs` fails one with neither. Each page and its verbs are in
   `ASK_GUIDE_PAGES`, which Ask's `guide` read says. `propose_team` is gone (Ruben's word); `invite` stays a spec so
   cards in old threads still draw.
2. **The tools (D11).** Twenty-five: reads `today`, `signals`, `guide`, `inbox`, `people` (with search by conditions in
   the lists' vocabulary, and `winners`), `calls`, `calendar`, `report` (any window, any lenses), `sequences` (once
   `campaigns`), `leads` (with `ideas`, `back`), `workspace`; acts `propose_reply`, `propose_thread_verb`, `propose_call`
   (once `propose_whisper`), `propose_person` (with `answer`, `add`, `merge`, `message`), `propose_people`,
   `propose_list` (`make`, `change`, `delete`), `propose_deal`, `propose_settings` (`change`, `autonomy`, `goal`),
   `propose_lead_search` (`find`, `more`), `propose_leads`, `propose_sequence` (once `propose_campaign`), `propose_review`,
   `propose_plan` (`offer`, `steps`), `propose_follow_up`. Eight are loaded on every question (`CORE_TOOLS`); the rest
   are found by the API's tool search, for breadth, and a turn whose search is refused asks with every tool loaded.
3. **Selections by rule (D5).** A card acts on many people by a list, conditions or ids, counted before it is shown, at
   most 2,000 (`ASK_SELECTION_MAX`), and committed in its door's own parts (a spec's `commit` may answer several calls;
   the walk sends them in order and `gather` sums the answers).
4. **Plans across pages (D4).** `propose_plan` with action `steps` builds each step through its own action, a later
   step naming an earlier one's result by its token. Steps that change only what the workspace keeps are approved
   together; each that sends, spends or posts (`ASK_SENDS`) is its own press; a step that names a send's result waits
   for it.
5. **Eyes (D6, D8, D13).** `signals` computes what stands out across the pages and the cards that fit; `people.winners`
   says who paid, booked or said yes and what they share; the owner's goal is one line in the config's `ask` section,
   kept by `propose_settings` action `goal`.
6. **Follow-ups (D3).** Ask keeps at most three notes to come back when a search ends or asks, replies arrive, or a day
   comes, in the member's own views (`views.ask`), never acting; `signals` says a due one first.
7. **Longer turns (D2).** Eight rounds and two minutes for a typed turn (the route's `maxDuration` 150); a spoken turn
   keeps forty-five seconds.
8. **The yes to offers stays consent (D9).** Ask never proposes a message whose purpose is to ask for it; it counts who
   was never asked and offers the sign-up link and after-visit sequences. A lead's yes is interest: `propose_leads`
   action `said`, then a deal and a time (D10).

## Not built here

A card on Today and a line in the bell when Ask notices something (D7): the palette's first suggestion on Today is
"What should I do next?", which reads `signals`; the bell line needs a notification kind and a sweep of its own.

## Deploy order

Either. The edge passes tools through and needs no change. A dashboard from before offers the old tools; cards made by
either build commit through the same specs.
