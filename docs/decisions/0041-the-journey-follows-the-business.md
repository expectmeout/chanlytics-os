# 0041 · The journey follows the business

**Status:** Decided on 9 October 2026 by Ruben, with "A moment holds many campaigns"
(`docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`, §4.8, decisions 40 to 49). Steps J1 to J3
built on the branch `campaigns/a-moment-holds-many`, not yet merged; J4 is a lane of its own. Context written against
commit `7ff179717` (main, 9 October 2026), the rest checked against the branch's code on 10 October 2026. Where this
note and the code disagree, the code wins.

## Context

- The moments around a customer were one constant, `STAGES` (`packages/contracts/src/playbooks/lifecycle.ts` at
  `7ff179717`): First contact, Visit tomorrow, After a visit, Quiet or lapsed, Proposal out, in that order, the same for a
  salon and a consultancy; "How customers buy" (`tenants.sells_by`) and the calendar only took one away.
- "Visit" stood in 82 contracts files, mostly ids, with about 60 strings a person or a model reads, while the glossary's
  word is appointment (`docs/glossary.md`); `tooling/scripts/tests/repo/trade-neutral.test.mjs` banned only salon words.
- Without a calendar the appointment moments were still offered, showed a 0 nobody counted, started a campaign that
  skipped every day, and counted as covered.
- A draft put the appointment word in `tenant_config.config.brain`, which the receptionist parses on every message, where
  a strict closed set can silence it (decision 0008).

## Decision

1. **J1, the word, derived now.** `APPOINTMENT_WORDS` is appointment, visit, meeting, session, lesson ("call" is the
   glossary's Call, "consultation" and "booking" are taken; "class" is not added). `appointmentWordOf({ stored, sellsBy })`
   is the stored word, else meeting where deals are on, else appointment; nothing is stored in this program and nothing is
   backfilled, so a salon reads "appointment" until it picks. Its home is `tenants.appointment_word`, beside `sells_by`.
2. **One page, one word.** The rail, the drawer, the approval sheet, the composer, Coming up, Sent and core's refusals say
   the workspace's word; "After a visit" and "After the visit" are one; a new campaign is named by the word through core's
   ports, and a stored name keeps its words until an opt-in rename of exact default names (decision 43). Ids never change.
3. **Customers read "appointment" now** ("cita"): the consent and unsubscribe pages, the email's foot, the last starter
   that said otherwise. The consent label "Visit messages" is not renamed here (decision 6).
4. **J2, the journey.** `journeyOf({ calendarOn, dealsOn, word, held })` is pure: First contact, then the day before the
   appointment, after it, Proposal waiting (where deals are on, or a follow-up is held), Quiet or lapsed. The ids are
   word-free (`first_contact`, `before`, `after`, `proposal`, `quiet`; `visit` became `before`), so an address that names
   one (`campaigns/in:before`) survives a change of word. A stage that holds a campaign always draws.
5. **Needs your calendar.** Without a calendar, the appointment moments say so, with no figure, no Turn on and a door to the
   calendar's setting, and are never covered; `momentOffered` and core's refusal (`checkPlaybook`) require a calendar.
6. **J3, the rail keeps one line.** The moments never stand down a second line: under 1100px of page each keeps 168px and
   the rail scrolls across, a moment snapping to its start, its edges fading only while it is wider than its pane.
7. **J4, later and its own spec.** The journey as references on `tenants.journey` (eight stages, three pinned lists,
   built-ins hideable but First contact), the word's Settings › Business row and its rename, Ask's journey action.

## Shape

- `packages/contracts/src/journey/appointment-word.ts` and `journey.ts`; the view model reads them
  (`packages/contracts/src/playbooks/lifecycle/`), and so do core's refusals
  (`packages/core/src/campaigns/check-playbook.ts`).
- The page's group address, `campaigns/in:<group>`, takes a stage's word-free id, or `lists`, `reach_out` or `sent_once`
  (`apps/dashboard/src/surfaces/campaigns/home/address.ts`).

## Steps

1. J1 to J3, in one pull request of four commit groups (the floors, the backend, the ledger, Ask). The journey and the
   word need no migration; the pull request's migrations (00373 to 00377) are the backend's counts and notices. Either
   deploy order works: the dashboard derives the word and the journey from what the database already holds.
2. J4: one migration adding `tenants.journey` and `tenants.appointment_word`, their Settings row, the opt-in rename; the
   dashboard reads the stored word where it is set and derives it where not, so either deploy order works there too.

## Tests

- `tooling/scripts/tests/journey/journey.test.mjs`: `journeyOf` by shape and word, every string of the view models, and
  the ratchet over `tooling/scripts/tests/baselines/appointment-words.json`: the strings that still say "visit" may only
  fall.
- `trade-neutral.test.mjs`: the customer-facing builders say no "visit".
- `e2e/campaigns/playbooks.spec.ts` reads the rail's count from the journey of the answer it reads.

## Risks

- A word changed on a running workspace: every salon reads "appointment" from this release, its campaigns keep their
  names, and customers of every trade read it on the consent pages and in the email's foot.
- The A2P campaign's facts quote the consent page's heading; registrations made before it quote the old one.

## Open questions

- "class" as a sixth word (decision 41, left out by default).
- A renewal stage and `deals.renews_on` (decision 49, not in this program).
