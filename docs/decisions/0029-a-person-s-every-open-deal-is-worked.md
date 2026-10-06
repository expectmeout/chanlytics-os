# 0029 · A person's every open deal is worked

**Status:** Decided on 6 October 2026 (Ruben, on #15 of the 4 October campaigns wiring review: "go with the best
recommendations you ultimately suggest"). Built, steps 1 to 6 (6 October 2026), with their tests (migration 00328).
Written against `a8ef4d921` (main, 6 October 2026) and verified against the code and the schema snapshot at it; where
this note and the code disagree, the code wins. It answers the review's #15 ("a second open deal hides the first") and
the first item [0008](0008-a-proposal-is-part-of-the-deal.md) still held, "One row per open deal".

## Context

- **A person may hold one open deal per service.** `deals_open_uq` is unique on `(tenant_id, contact_id, service)`
  where the stage is proposed or won (`supabase/schema.sql`): a client of one service may have a proposal out for
  another, and two proposals out are allowed.
- **Every reader saw one of them.** `people_list` (00320) returned one deal a person, the current one
  (`pickCurrentDeal`: open first, then the newest), as its `deal_*` columns. So:
  - the Pipeline (`packages/contracts/src/deals/pipeline/pipeline.ts`, `pipelineOf`) placed each person in one group,
    by that deal, and a client with a newer proposal out was never under Clients;
  - People's deal lists (`packages/contracts/src/people/lists/list-rules.ts`, the `deal_stage` fact) read that deal's
    stage alone;
  - the proposal follow-up (`packages/contracts/src/playbooks/playbook-reach.ts`) named a person by that deal, and
    counted any follow-up since it went as theirs: a person's older proposal was never followed up;
  - Today's proposals-waiting leak (`packages/contracts/src/today/today-leaks.ts`) counted that deal;
  - the receptionist (`packages/db/src/repositories/thread.ts`, `readLeadContext` and `describeLead`) heard that deal
    and its link;
  - the phone (`readDealForPhone`) heard that deal, so a client of one service with a newer proposal for another was
    "proposed", and the availability door offered them a consultation rather than the service.
- **Ask guessed.** `propose_deal` (`apps/dashboard/src/server/ask/tools/act/deal.ts`) with no service named moved the
  current row, the newest open one, though the owner may have meant the other.
- **What a follow-up was about was already kept.** Each recipient of a follow-up's run keeps the link its words carry
  (`proposalFactsFor`: `broadcast_recipients.facts.proposal_link`), so which proposal a past follow-up was about can be
  read without a migration.

## Decision

1. **The People read carries every open deal.** `people_list` returns `open_deals`, a jsonb list of each proposed or
   won deal of the person, the newest first: its id, stage, service, dates, amount, period, currency, link, valid-until
   day and reason. The one deal the row shows (`deal_*`) is unchanged.
2. **A row knows them.** A People row carries `openDeals` (`openDealsOf`; from a database without the column, the one
   deal while it is open) and `dealStages`, every stage the person stands at (`dealStagesOf`). People's deal lists hold
   a person under each, and the Deal column draws a pill per open stage.
3. **The Pipeline draws a row per open deal.** A client with a proposal out for another service is in both groups; two
   proposals out are two rows. The row their People row's deal stands for keeps the person's id; each further row is
   the person's id and the deal's (`pipelineRowId`, read back by `pipelinePersonOf`). Each row is judged, moved, passed,
   peeked, sorted by value and dated on its own deal; a person's next step is on the row of the deal it names, else
   their first, so Steps due counts it once. The line counts proposals by row and clients by person; People's bar counts
   people. Every door from a row (its peek's read and page, the warm-up, Ask) goes by the person. A row renamed when
   another deal of theirs closes (it becomes their first) keeps its peek and its pick (`pipelineRowNow`).
4. **Today counts each proposal out.** The leak's sentence counts proposals; its arithmetic counts the list's people;
   it names a person once.
5. **Each proposal has its own follow-up.** A follow-up's words keep its deal's id beside its link
   (`facts.deal_id`, `proposalFactsFor`); the touches read those two keys of the words alone and keep the latest by
   person and by what each was about (`followUpKey`: the deal, else the link of one from before the deal was kept, else
   "bare"). The follow-up names a person by the proposal of theirs waiting longest that has not had its own
   (`followUpDealOf`, `followUpCovers`), and its row carries that proposal as its deal, so its words carry that link.
   A link edited after its follow-up is still the same proposal. One message a person a run, and the week's breath
   between two holds as before. A follow-up that kept neither is read as before: one since a proposal went covers it.
6. **The receptionist hears every open deal.** Each other open deal is said in its own sentence. With one deal open its
   link answers a price question, as before; with several, each link is named by its service and answers for that
   proposal alone (send the one they mean, ask which if it is not clear), while a client's engagement and a proposal
   with no link keep their own sentences.
7. **The phone hears a client of any service as a client.**
8. **Ask asks which.** An unnamed move of a person with several open deals is refused: "their open deals are for X and
   Y; name the one this is for".

## Shape

- **Database.** 00328 drops and creates `people_list` with the one new column; its grants and comment restated. The
  lateral reads `deals` by `(tenant_id, contact_id, created_at desc)` (`deals_contact`); nobody with nothing open
  carries `null`.
- **Contracts.** `OpenDealDto`, `openDealsFromJson`, `openDealsOf` (`deals/deal-vm.ts`); `dealStagesOf`
  (`deals/deal-consultations.ts`); `PersonRowVM.openDeals` and `dealStages`; the Pipeline's `bandsOf`,
  `pipelineRowId`, `pipelinePersonOf`, `pipelineRowNow` and the row's own `deal`, its peek's `dealId`;
  `eachOpenProposal` (`deals/deal-waits.ts`); `followUpKey`, `followUpCovers`, `followUpDealOf`
  (`playbooks/playbook-follow-ups.ts`); `proposalFactsFor` keeps the deal's id; `poolRowOf` clears every deal where
  deals are off; Ask's page scope reads the person a peeked row names.
- **packages/db.** `peoplePage` and `personRow` read `open_deals` into its shape; the touches read the deal and the
  link (`Touch.deal`, `Touch.link`, `TouchIndex.followUpKeys`); `LeadContext.otherDeals`; `readDealForPhone`.
- **Core and the edge.** The run's touches carry `followUpKeys`, and a run keeps what it sent each person about
  (`touchesAfterRun`).
- **Dashboard.** The person page reads its row through `personRow`; the Pipeline's scope picks and peeks by row id,
  and reads, warms, opens, focuses and tells Ask by the person; People's bar and Deal column; the search box reads every
  open deal's service; a recorded move updates the row's open deals in place (`placeDeal`) and says which deal it
  moved; Ask's people tool and the people reader cite each row as its person and its own deal; Ask's playbook counts
  and `propose_deal`.

## Steps

All six are built, in one pull request:

1. 00328: `people_list` carries `open_deals`.
2. The row's open deals and stages; People's deal lists and Deal column.
3. The Pipeline's rows, one per open deal.
4. The follow-up, one per proposal.
5. The receptionist, the phone and Ask.
6. Today's leak, and the People page's own copy after a move.

## Tests

- `tooling/scripts/tests/deals/deals.db.test.mjs`: on the stack, `people_list` carries every open deal, the newest
  first, with its link, amount and currency, never a passed one; none open is null; `personRow` reads it into its shape.
- `tooling/scripts/tests/deals/deals.test.mjs`: the row's open deals and stages, from the column and without it.
- `tooling/scripts/tests/deals/pipeline.test.mjs`: a client with a proposal out, and two proposals out, as rows; their
  ids, line, rail, moves, steps, value order and a selection's pass; on the page, the peek, its doors and its phone
  act, the row menu, Ask's list, People's bar, the box, the Valid-until column, and a renamed row's peek and pick.
- `tooling/scripts/tests/people/ask-people.test.mjs`, `tooling/scripts/tests/ask/ask-context-contract.test.mjs`: Ask's
  Pipeline answer, its citations and its page scope name the person and each row's own deal.
- `tooling/scripts/tests/people/people-honest.test.mjs`: where deals are off, a row carries no open deal either.
- `tooling/scripts/tests/people/lists/smart-lists.test.mjs`: a person stands under each list of their stages.
- `tooling/scripts/tests/playbooks/playbooks.test.mjs`, `core-run-playbook.test.mjs`, `send-rails.test.mjs`: each
  proposal's own follow-up, the deal and link a run writes and keeps, the touches' keys, an edited link, and the rule
  for older follow-ups.
- `tooling/scripts/tests/leads/engine/lead-context.test.mjs`: the receptionist's sentences and each link's own proposal,
  beside a proposal with no link and beside a client; the phone's client.
- `tooling/scripts/tests/today/today-leaks.test.mjs`: two proposals of one person in the leak.
- `tooling/scripts/tests/ask/ask-turn.test.mjs`: the unnamed move of two open deals is refused in words.

## Risks

- **Either deploy order works.** Code before 00328 reads no column and keeps the one deal (`openDealsFromJson` answers
  `undefined`); 00328 before the code adds a column nobody reads.
- **The read grows a little.** A person with nothing open carries `null`; one with open deals carries a few hundred
  bytes each. The lateral is served by `deals_contact`.
- **A row id with an underscore.** The Pipeline's peek takes `[A-Za-z0-9_-]` (`PEEK_ID`), and every page that opens a
  person from a row reads the person's id from the row, never the row's id.
- **The words keep one more key.** A follow-up's recipient facts carry `deal_id` beside `proposal_link`; every reader
  of the facts names the keys it reads, and none walks them.

## Still held

- **The follow-up's stand on a row.** People's and the Pipeline's "Follow-up goes …" and "Had its follow-up"
  (`followUpStandOf`) stay per person and are said of the deal the row shows; Today counts a second proposal as one
  the follow-up does not yet have in hand, though a later run reaches it.
- **The thread's header** shows the one deal.
- **A client's consultation for another service** is not counted held: `noProposalSince` reads an open deal as a
  proposal since (0008's rule, unchanged).
- **The one deal's currency.** `people_list`'s `deal_*` columns carry none, read as USD as before; `open_deals` carries
  each deal's own, which the Pipeline now reads.

## Open questions for the owner

None.
