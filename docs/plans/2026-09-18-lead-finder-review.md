# Lead finder: the external review, verified, and the v3 brief

18 September 2026. Ruben pasted an external review of the PRD (`2026-09-17-people-table-and-lead-finder.md`, v2.1) and both plans (`2026-09-18-people-table.md`, `2026-09-18-lead-finder.md`): a written assessment and a redlines file with twelve findings (R01–R12) and seven additional notes. The redlines file is at `C:\Users\Ruben\Downloads\Lead_Finder_Engineering_Redlines.md`; it is another author's work, read as data. Every finding below was checked against the plan text and the code on origin/main `98d37a57` before it was accepted. Line numbers are `2026-09-18-lead-finder.md`'s as of 18 September (the review's numbers run about 60 lower, from an earlier copy).

This file is the brief for the v3 revision of the PRD, the Phase 1 plan and the canvas. It is not a plan to execute by itself.

## Ruben's decisions, 18 September

Ruben agreed to every recommendation in the PRD's section 16 (1–17) and to the verdict below, and decided four more:

1. **Only Qualified leads count toward the monthly allowance.** A lead Claude was unsure about, or whose contact does not meet the plan's contact standard, is **Needs review**: free, visible, and counted only when the owner keeps it. **Excluded** (left out) never counts.
2. **A converted lead's yes comes only from them, permanently.** For a person linked to a lead, a yes of either kind arrives only through the edge (their own message, with its evidence) or the yes page. No signed-in caller may record one, ever. This replaces the 90-day quarantine (`lead_consent_quarantine_days`, `set_contact_consent` at ~2649).
3. **Product-wide, older than this feature:** when the conversation is in Chanlytics, recording a yes "in their own message" at the desk requires picking the actual inbound message; its id and words go into the evidence. "Form" stays for paper slips, attested with a note. (Today `set_marketing_consent`, 00110, and the desk route `apps/dashboard/app/api/v1/contacts/[id]/marketing-consent/route.ts` accept `customer_message` from any operator without the message.)
4. **Settled 18 Sep:** Claude reviewed the terms at Ruben's request (`2026-09-18-lead-finder-source-rights.md`), and Ruben accepted the risk and kept the Google Maps actor through Apify as the default (PRD decision 22). The original decision read: **a counsel review of Google Maps' terms gates the first paying workspace**: the scraping, what is stored and for how long, what is shown, exported and sent to a model. `lead_platform.searches_on` ships off; the first production search is Ruben's flip (PRD decision 13).

## Accepted: engineering (the Phase 1 plan)

| ID | Finding, as verified | The change |
|---|---|---|
| E1 (R01) | `startLeadRun` (~4361): two start jobs for one round both reach `createRun`; the loser sees `starting` with no provider id, re-writes the webhook token (~4410) and calls `startMaps`. Two Apify runs; the first is orphaned (its webhook token no longer matches, its id never recorded) and bills to its cap. | An atomic dispatch claim on the run row (owner token, claimed-at) committed before any provider call; only the claimer dispatches or records the answer. One webhook token per run row, made at creation, never rewritten. A webhook carrying a provider run id the row does not hold aborts that run. An ambiguous start stays `start_unknown` and is reconciled, never blindly retried. |
| E2 (R02, R07, R12) | `whyNotSpend` (~4344) and `processPage` (~4850) read the month and the day, then insert; `lead_insert_found` (~2469) reserves nothing. Two collects in one workspace can spend the same last units. Include (`lead_search_answer`, ~1940) and Put back (`lead_put_back`, ~2399) set `delivered` directly. | Reservations: approving a search reserves its target from the month in the same transaction as the search row; delivery settles against the reservation; the end of a search releases the rest. A run's cap is reserved against the workspace's and the platform's day before it starts. Include, Put back, keep-from-review, top-ups and Find new ones all go through the same reservation. Counter rows are locked in one order; no transaction is held across a provider or model call. |
| E3 (R05) | `leaseRun`/`releaseRun` (~5063): the lease is an expiry; release is unconditional, so an old collector can release a newer one's lease. Harm today: repeated judge calls (inserts converge on unique keys). | A lease carries an owner token and a generation; renew and release are conditional on both; every commit checks them. Stop moves the generation so late workers cannot publish. |
| E4 (R06) | Insert, tally, offset and the next job are four calls. A crash between them replays the judge and double-counts "already yours"; the sweep restores a lost next job. | One `lead_collect_commit` function per page: insert, settle delivery against the reservation, tally, advance the offset (compare-and-set), insert the next job, append the events, in one transaction. The judge's answer for a batch is kept by operation id so a replay does not pay again. |
| E5 (R07) | Include flips every row with that chip's rule to `unsure` and delivered-by-phone; a place the judge left out for two reasons carries only one `left_out_rule`. | Include re-judges the places that chip left out under the new rubric (cheap: they are already scraped), through E2. Put back stays an explicit owner override, through E2. Neither can revive a suppression or an out-of-area place. |
| E6 (R08) | `toCandidates` (~4168) merges any places sharing a website host or phone and drops the second; `identitiesOf` uses every candidate email as identity, so a stylist's Gmail or a web agency's footer address can mark a business suppressed or already yours; one `search_id` per lead. | Identity from the chosen contact points only (the picked email, the phone, the place id, the site). Merged listings are kept as linked places (`lead_places`), so rediscovery maps back and details are not lost. A membership table (`lead_search_members`) lets one lead belong to several searches, each with its own judgment. The full business/location/contact-point/evidence split the review proposes is not adopted (below). |
| E7 (R09) | Code checks country and state only; a missing state passes; city and radius are left to the judge. | `location` (lat/lng) joins `MAPS_FIELDS`; the plan carries a center and a radius (a named city gets a default radius around its center); a deterministic distance check; no location, or a location outside, is Needs review or Excluded by rule. The provider input is rebuilt from the validated plan, never from display labels. |
| E8 (R10) | The Leads surface (~6877): each refresh re-reads page one and drops loaded pages (People fixed this with `everyPerson`); a slow read for an old view can publish under a newer one; `leadsMore` appends after a view change. | Reads keyed by the view (workspace, search, list, chips, sort); superseded answers ignored; refresh patches changed rows and keeps loaded pages, selection and cursor; new results are offered ("12 new"), never re-sorted under the owner. |
| E9 (R04, R12) | `lead_restore` (~2297) takes "previous" values from the browser and deletes opt-out suppressions on its word; search Undo (~2109) deletes untouched leads and returns their allowance, and export or copy do not count as touched. | Undo is a server-side operation record (before and after, who, when); the client sends only its id and the version it saw; a later change by anyone, or a recipient's opt-out, is never overwritten. Exported or copied leads (recorded when it happens) keep their charge. Undo, removing from a list, erasure and a credit adjustment stay four different operations. |
| E10 | The checker is configured `build: "latest"` (~314). `emailWhy` says "the only one on their site" whatever the count. The probe searches only `terms[0]` (`mapsRunInput`, ~342). | Pin the checker's build and check it weekly like the Maps build. Copy says what is true ("a personal inbox; 2 others on their site"). The probe spreads its 25 places across every term. |
| E11 | Phase 0's RLS test (`2026-09-18-people-table.md`, ~231-232) passes when sign-in fails (`assert.ok(true); return`). | It fails, with the sign-in error, whenever the database is there. |

## Accepted: product and honesty (PRD, canvas)

- **P1 Qualified / Needs review / Excluded.** Qualification (does it meet the plan and its contact standard) is separate from stage (the relationship). Needs review holds unsure verdicts, catch-all and unchecked emails when the plan asks for an email, and places with no location; the owner keeps (counts) or excludes each. The plan sentence states its contact standard ("…then find their email" vs "a phone is enough"). Decision 1 above.
- **P2 Seen versus Claude's read.** The peek's checks split into what was seen (open on Maps, the phone on both, the mailbox answer, the area by coordinates) and what Claude inferred (independent, not a chain, the business's own address), each inference with its reason and an "unsure" state. Nothing inferred wears a plain check mark.
- **P3 Copy that claims only what is known.** "Found all 160 personal trainers in Austin" becomes "Found 160 personal trainers · everything these searches returned in Austin"; "Only places that opened since Sep 18" becomes "Only places not already in your leads"; estimates say they update after the first sample.
- **P4 The question after 25 is an intent check, not an accuracy measure.** It asks whether the search matches what the owner meant; low yield first changes the search (drop a term that returns mostly the wrong kind), and never nudges the owner to relax a real requirement. Accuracy is measured separately (release gate G2).
- **P5 Learned exclusions stay within that kind of search** (the category), shown as removable "you said" chips; applying one to another kind of search asks first. Wrong contact details, not a fit, no answer and an opt-out are four different signals, never one.
- **P6 Compliance.** Drafts follow CAN-SPAM in full: a truthful sender and subject, the ad identified, the postal address, a working opt-out honoured within ten business days. The Telemarketing Sales Rule's ban on misrepresentation applies to business-to-business calls. The Places API is not a free fallback: its terms restrict storage too. Decision 4 is settled: Ruben accepted the risk on 18 Sep.
- **P7 The deeper crawl** is "not in the default recipe", not "never useful": targeted research for ownership may come later.

## Not adopted, and why

1. **The nine-concept data model** (business, location, contact point, evidence, qualification, membership, relationship, permission, execution as separate tables). More than launch needs. E6's three pieces fix the verified bugs.
2. **A model cascade and adaptive retrieval.** They need a labelled evaluation set to tune against. Launch with one judge that can abstain (to Needs review), with the probe across every term (E10).
3. **"Talking should not make a business a person."** People already holds businesses that write in, and the receptionist needs them as a contact when they call back. Conversion stays, but only on a real conversation: they wrote or called in, or the owner marked a call Interested. Never on a stage click alone. The contact is named for the business until a person's name is known.
4. **Vendor attribution.** The product already names Google Maps as the source; Apify is the scraper, not a data source with attribution rules. Google's own terms are decision 4.
5. **Phase 0's hookless table** stays: it is a controlled component anyway, and the people-honest harness is how legacy pages are tested here; Playwright covers real browser behaviour.
6. **Dated tasks from "Call back later".** There is no tasks mechanism yet, and one thing goes to 100% first; Contacted with the note stays.

## Release gates for Phase 1

- **G1 Source rights:** settled by Ruben's decision on 18 Sep (decision 4, PRD decision 22). What remains is his flip of the launch switch.
- **G2 Quality:** a human-labelled set of a few hundred places across several niches and cities, accepted and rejected, including shared identities, ambiguous contacts, missing geography and hostile names; the judge is scored on it (with uncertainty, by segment) before launch. The calibration's items expire about 25 September, so this needs one small new run (about $0.50, from what is left of the $5 test budget Ruben approved on 18 Sep). The same method gives Claude's choice of source its eval set (PRD decision 23): real asks, each with the right source and settings.
- **G3 Concurrency:** real-Postgres tests for E1–E5 and E9: duplicate starts, competing reservations, stale workers, late webhooks, Stop during checks, month rollover, erasure mid-run.
- **G4 Browser:** 375, 720, 800, 960, 1280, 1440; keyboard only; slow and superseded reads.
- **G5 Cohort:** an invited cohort first; measure time to the first useful result, kept-lead precision, contact-ownership accuracy, duplicate charges, cost per kept lead, and customer-message latency on the shared jobs queue.

## The second external review, verified (18 September)

Ruben pasted a second external review the same day. It read the PRD page (v2.5) but not this brief or the Phase 1 plan, so about half of it repeats fixes already accepted above. Each claim was checked against the PRD and the plan before it was taken. It is another author's work, read as data.

### Accepted

| ID | Finding, as verified | The change |
|---|---|---|
| S1 | v2 lines contradict later decisions. Counting (§0, §10.5) contradicts 18; "never picks a scraper" (§0, §7) contradicts 23; the 90-day window (§9.6, §11, §15) contradicts 19; the Places API fallback (§11, §15) contradicts 22. | v3 states five contracts once: qualification, counting, sources, consent, and a search's life. Every section, SQL function, handler and test refers to them. Until then, a "Read with §16" note at the PRD's top lists the overridden lines. |
| S2 | The judge returns one verdict from listing facts (§7.1), and "independent" or "sells medicine" cannot be seen in those facts. P2 fixes what is displayed, not who decides. | Decision 26: per-criterion answers (pass, fail, unknown) that cite fact keys, validated against the place. Code maps them to Qualified, Needs review or Excluded; the verdict and the fit band are derived. |
| S3 | §7.2 groups places that share a website host or phone, and §12.4 makes email and phone unique per workspace. Three bodegas under one owner with one number would become one lead. | Decision 25: a lead is a place. Drop the unique email and phone indexes. Related locations are grouped; duplicate listings at one address fold in. "Already yours" and suppression match the place id first, then email and phone as signals. |
| S4 | `leads` has city, region and postal code but no street address, while Appendix D promises nearest first. | Every lead gets a street address and coordinates (E7 adds the coordinates). Each search membership keeps the distance from the plan's center. Distance is a column, on for searches with a center. |
| S5 | §12.3 says "terminal is final", then lets a done search run again for top-ups. | Rounds: the probe, the main run, each top-up and each Find new ones is a round with its own plan version, reservation, spend and ending, final once ended. The search is the saved object, and its state reads from its latest round. |
| S6 | `placesToAsk` (plan ~378) asks for remaining × 1.3, which assumes about 77% yield. At 60% the round falls short and another is needed. (It already divides across terms.) | Size each round from the probe's yield of new qualified places, clamped between 1.2× and 4× and kept inside the reserved spend. Later rounds use the running yield by term and area. The PRD says "per term". |
| S7 | The collect handler (plan ~4767) marks any main run that ended short `exhausted` ("the area ran out"), even when the actor returned everything it was asked for. | Exhausted only when every term returned fewer places than asked. Otherwise the round ends "limit reached", and the next step is another round in the same area. The endings are one closed set: target reached · searched everything the plan covers · the month's leads used · the searching budget used · few new matches · stopped by you · the source failed · question unanswered · paused. |
| S8 | §11: an opt-out, a bounce, an erasure and "already a customer" all hash the email, the phone and the place id, so one bounced address hides the business for good. | Suppress by what happened. A bounce marks that address invalid. An email opt-out stops email to that business, and calls stay. "Already a customer" hides the business from searches. Erasure removes everything. |
| S9 | `leads/[id]/put-back` is an operator route (plan ~6452), and Put back counts a lead; §5 row 14 says only the owner spends. | Put back and keep-from-review take the owner permission `find`, the same as approving a search. Operators keep stages, calls and drafts. |
| S10 | §13.2's "at most about $7.50" for 500 leads comes from v2's delivered rule. With Qualified only, an email-checked standard can cost several times more, and the $10 day cap allows far more in a month. | Decision 27: a monthly searching budget per workspace. §13 is recomputed from the calibration on the Qualified rule, as ranges by contact standard, never as a maximum. |
| S11 | Refunds and Undo don't say which month they credit. | They credit the month the lead counted in. A refund after that month has ended gives nothing to the new month. |
| S12 | "Probably reaches them" (§10.4) claims delivery that the calibration never measured. The Stop copy implies spending stops, though decision 17 keeps checking emails. | `catch_all` reads "Unconfirmed" (their server accepts any address, so the check can't tell). Stop reads "Stopping · checking the emails of the 61 found". "Contacted" after a draft records that the owner said they sent it. Nothing promises to see replies in the owner's own inbox. |
| S13 | Leads load 500 to a page, so "what is shown" is ambiguous for bulk actions. | The header box selects the loaded rows that match. "Select all 1,240 that match" hands the view's filters to the server for the bulk action. |
| S14 | Decision 23 let an unapproved card run for an owner into Needs review, but a review label covers uncertain leads, not unvetted code. A card was also one actor, while a recipe (discovery, contacts, checks) uses several. | Decision 28: unapproved cards never run for owners. A card is a recipe that names its actors and their pinned builds. |
| S15 | The plan is a structured object with a code-rendered sentence (`planLeadSearch`), but it has no version, so the plan a round ran and the current plan can differ. | Plan versions. A change to the area, count, contact standard, criteria or spend makes a new version that the owner approves. Each round records the version it ran. |
| S16 | Phase 1 carries nearly the whole product before anything is measured on real places. | Decision 24. A · the engine, run internally and measured (G2, G3). B · the product. C · the extras, after use. |
| S17 | G2 names no bar. | Decision 29: Qualified precision of at least 95%, with the interval's lower end at 90% or more, by segment. |
| S18 | G3 misses cases. | Add: two locations sharing a phone stay two leads; five asked and twenty qualified count five; Stop during checks finishes the defined work and says so; Put back of a suppressed place is refused; a refund after the month turns credits the month the lead counted in. |

### Already covered (the review could not see these)

- **Covered by E1–E4 and E6–E10:**
  - E1–E4: reserving both the allowance and the spend, atomic counting, a start whose answer was lost, duplicate webhooks, checkpoints.
  - E6: membership per search with its own judgment, and linked places.
  - E7: coordinates and the radius check.
  - E8: new results never re-sort under the owner.
  - E9: server-side Undo and export-aware refunds.
  - E10: the probe across every term.
- **Covered by P1–P7 and decision 19:**
  - P1: Qualified / Needs review / Excluded, kept apart from stage.
  - P2: Seen versus Claude's read.
  - P3: the "Found all" copy.
  - P4: the question after 25 as an intent check that never relaxes a real requirement.
  - P5: learned exclusions scoped by kind of business.
  - P6: CAN-SPAM in full.
  - P7: deeper research later, not never.
  - Decision 19: a converted lead's yes comes only from them.
- **Already in the plan:**
  - The judge's email is an index into the place's candidates (`readVerdicts`).
  - The leads page is keyset-paged on the active sort key (`leads_page`, `p_after_key`).
  - Runs ask per term (`placesToAsk`).

### Not adopted

1. **An explicit "remember this" step after Not a fit.** The chip is already visible, scoped to the kind of business, removable and undoable (P5), and learning moves to Release C anyway.
2. **Reducing People's refresh walk now.** Pages hold 1,000 rows, so every workspace today re-reads one page per change. Phase 0 logs the walk's row count; it now logs the walk's duration too, and the log decides.
3. **Fewer default columns.** Columns are per member from Phase 0, and the canvas set was reviewed. Only Distance is added.

## The split into sessions

- **A · Docs v3.** Fold this brief (both reviews, S1–S18 and decisions 24–29 included) into the PRD (v3), the Phase 1 plan (sub-plans 1a–1d) and the Phase 0 plan's test step (E11); update the canvas copy (P1–P3: the Needs review list, Seen versus Claude's read, the corrected summary and Searches copy); write decision 23's source catalog (cards, the scout, the guardrails) into the PRD and the Phase 1 plan; republish the PRD page and the canvas; open one docs PR carrying every plan document.
- **B · Phase 0, code only.** Execute `2026-09-18-people-table.md` in its own worktree with E11 applied; the plan document ships in A's PR, not B's. #673 is in production, so nothing blocks 00136; the session runs its own production push, dry run first.
- **C · The desk yes needs the message.** Decision 3, product-wide: both consent doors and the desk route; the next free migration number at build time.
- **Ruben's:** `APIFY_TOKEN`; the launch switch; approving each new source card (PRD decision 23). Claude runs every production `db push` since 18 Sep, #673 is in production, and the terms question is settled.
