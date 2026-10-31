# 0085 · The second model screens before the lead judge

**Status:** Decided by Ruben on 31 October 2026 ("Judge pre-screen first", then "Build it now"), after the analysis
`Claude Video/docs/2026-10-31-jev-in-the-lead-finder.md`. Built on the lane `leads/jev-screens-before-the-judge`.
Written against main's `3f665327f` (#1990). Numbered 0085: 0083 is the table's lane and 0084 the reply reader's second
key, both open beside it.

## Context

The lead judge (Opus 5.5, `lead_judge`) reads every place a search finds and answers, for each, the kind of business,
every criterion and every exclusion, with the facts it used, a reason and an email to write to. Measured on production
on 29 October (`lead-judge.ts`): about 245 output tokens a place for a seven-question plan, at about 100 tokens a
second, so a call holds five places and a batch runs five calls side by side. A 1,000-place search is about 200 calls,
about $7 at the registry's prices ($4 in, $20 out a million tokens) and ten to eighteen minutes. The probe, the 25 an
owner waits on before anything is shown, is one round of up to 28 seconds.

Many of those places are simply the wrong kind, or one the plan leaves out (the photographer handed two other
photographers, a band and a caterer: why the kind question exists, `search/class.ts`). The judge writes as much for them
as for a place that qualifies.

The second model (TypeSafe's Jev, decision 0023) answers a closed question in about a tenth of a second with a
calibrated confidence, for input tokens alone ($0.042 a million, output free). It is already asked every criterion of
every place in shadow (`judgeShadowCalls`); its answers are compared and never used.

## Decision

1. **Before the judge, the screen.** Every place of a batch is put, in one request each, the questions that leave a
   place out: the kind, and every exclusion (`judgeScreenKeys`), word for word as the shadow asks them
   (`judgeScreenCalls`).
2. **Only a sure fail leaves a place out.** A fail at the judge's floor or over (`screen: 0.9` on its route,
   `screenFloorOf`) leaves the place out on that question, with no judge (`screenedAnswer`). A pass, an unknown, a fail
   under the floor, a call that failed or one past the screen's bound (eight seconds) leaves the place to the judge, as
   before. The screen never qualifies a place and never sends one to review: it can only spare the judge a place that
   would have been left out.
3. **What it keeps.** Its answer names each question it was sure of and none of the plan's criteria, cites no fact,
   picks no email (a left-out place keeps none), and gives the question it failed as its reason, in the plan's words.
   The member records the second model as the model that answered. An answer that does not answer every key is never
   reused (`rejudge.ts`), so an Include that lifts the exclusion has the place judged whole.
4. **Its own switch.** `TYPESAFE_SCREEN` on the edge: '1' for every workspace, or a list of workspace ids, with
   `TYPESAFE_API_KEY` set. Blank asks the judge everything. Independent of the shadow's switch and the second key's.
5. **Each call is a row of the usage ledger**: the second model's port, not a shadow (its answer is used), paid in the
   round the judge's rows name. 00275's constraints take such a row as it is: no migration.
6. **The page says who read it.** A check the screen answered says "Chanlytics AI · the listing", where the judge's say
   "Claude · the listing" (`LEAD_READ_SOURCES`), and the legend under a lead's checks names whoever read them.

## Shape

- **contracts:** `ModelRoute.screen`, `screenFloorOf`, `lead_judge.screen: 0.9`; `judgeScreenKeys`,
  `judgeScreenCalls`, `screenedAnswer` beside the judge's own questions (`leads/lead-judge.ts`); `isSystemOneModel`;
  `LEAD_READ_SOURCES`; the legend's words (`leads/sheet/lead-sheet-card.ts`).
- **channels:** `LeadJudge.screen?` and `LeadScreen`: the port core asks.
- **core:** the collect's `judgedBatch` asks the screen first and the judge the rest (`leads/runner/collect.ts`).
- **edge:** `lib/leads/lead-screen.ts` (the switch, the calls eight at a time, the ledger, the bound), wired before the
  shadowed judge in `lead-wires.ts`; `TYPESAFE_SCREEN`; the log event `lead_screen_failed`.
- **dashboard:** the lead page's read sources and the sheet's legend.

## Steps

One lane, one pull request. Then Ruben's switch: `TYPESAFE_API_KEY` and `TYPESAFE_SCREEN=<a workspace id>` on the edge.
Turned on with `TYPESAFE_SHADOW` as well, the shadow keeps comparing every place the judge still reads.

## Tests

The screen's rule (a fail at the floor leaves out, under it or a pass or an unknown does not, the reason's words, the
answer's keys); the collect asking the screen first and the judge only the rest, the screened member's model, and a
screen that is off, throws or answers nothing; the edge's switch, key, failures and ledger rows; the page's sources and
legend.

## Risks

- **A good place left out.** Only at a sure fail on the kind or an exclusion, and it is listed under Excluded with the
  question it failed, one Include away, as any exclusion is. The shadow's rows say how often the second model and the
  judge disagree there.
- **The judge's words, read by another reader.** The questions are written for Opus ("fail when the place is what is
  left out"), and the second model reads them literally. The shadow's rows on the kind and the exclusions are the
  measure before a workspace's switch goes on.
- **TypeSafe's rate is the account's.** Eight calls at a time per batch, and a bound of eight seconds a batch: past it,
  the judge reads what the screen did not.

## Open questions

- The re-judge after the probe's question (`rejudge.ts`) and a people search's company judge are not screened.
- What is spared is not yet shown anywhere but the usage ledger.
