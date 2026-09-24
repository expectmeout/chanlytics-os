# Every business, every channel

**The People family, the receptionist on email, and the gaps between the charter and the build: a PRD.**

**Date:** 24 September 2026 · **Owner:** Ruben · **Status:** draft, waiting on the decisions in §7 ·
**Written against:** `origin/main` at `11584033` (#998), and the open branch `design/campaign-channels` at
`a12a4ee5` (#999, "Capture emails 1 of 2", with its spec `docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md`).
Every fact below was read from those trees on 24 September, with the file and line beside it. Where this document and the
code disagree, the code wins and this document is corrected.

**Follows:** `docs/decisions/0001` (channel-neutral inbound), `0004`/`0008` (deals), `0009` (one idea of a list), the
lead-finder PRD (`docs/plans/2026-09-17-people-table-and-lead-finder.md`), the email plan
(`docs/plans/2026-09-17-email-channel.md`), the takeover checklist (`docs/takeover.md`), and the campaigns spec named above.

---

## 0. Why, and what this is

The charter says the product is for **any business that turns a conversation into a booked appointment: a local shop or
clinic, an agency, a lender, an online seller** (`README.md:3-6`, `docs/system-prd.md:35`), and a build test fails a
salon's words in front of another trade's customer (`tooling/scripts/tests/trade-neutral.test.mjs`). The build reads
otherwise. An owner who signs up today is looked up on Google, cannot finish the first run without a voice line and
opening hours, can add a person only by phone number, can find only Google Maps places, and reads "visit", "when
you're open" and "your Google listing" on every screen. Ruben's aim, 24 September: an omnichannel product an online or
B2B business can use as readily as a salon: leads that are people at companies, a pipeline of proposals that are
one-time or recurring, a consultation booked to strike the deal, and email as the channel such a business lives in.

This document plans that in one program, in the house shape, without re-planning what is already specified:

- **Given, not re-planned:** "Campaigns on every channel" (parts 0 to 3: per-channel consent, versions, the reach rule,
  metering, unsubscribe, own domains, cold email to the finder's leads). It is referenced where this program touches it
  and sequenced against it in §4.
- **Planned here:** the fix-first hazards in the send path (W0); the refactors the People family needs before more
  weight lands on it (W1); the inbound pipeline finishing decision 0001 (W2); the receptionist answering email, and an
  owner's new email (W3); person-shaped leads as a second source card (W5); the onboarding root and the person model for
  an email-first business (W6); service mode, meetings and the words (W7); a deal's renewal (W8); and, later, events out
  to other tools (W9).
- **Not here:** the phone app (its own plan), the first run's PRs 4 and 5, the mockup's deferred surfaces (fleet, store,
  studio, tasks, content), a native scheduler (0002 stays decided and not built), a payment writing won (0005 stays
  decided and not built), team assignment (0003).

The measure of done is §4's proof column: each workstream is proven on production, on the salon's workspace or the
nightly's, before the next starts.

---

## 1. What the code says today

### 1.1 The charter, and the four roots that read as a walk-in shop

| Root | Where it is enforced |
| --- | --- |
| "Answering" means WhatsApp or voice; a workspace with only a mailbox never finishes `#/start`, and Today says "Your receptionist isn't answering yet" for ever | `packages/contracts/src/setup.ts:470-472`; `first-run.ts:72-85, 292-320, 432-440`; the `line` row is ready only with live voice (`setup.ts:682-876`) |
| Business facts ready = name + hours + at least one service; open times = hours minus the calendar's events | `setup.ts:577-630`; `availability.ts:645-663` |
| Sign-up says "We'll look it up on Google next" and the first run opens on Find; Google is optional in code but leads every owner | `signup.ts:127`; `first-run.ts:238-241`; the google row is `required:false` (`setup.ts:1245-1306`) |
| A person is a phone number: `create_person` raises without one, `POST contacts` requires one, broadcasts and playbooks send one WhatsApp template to `phone_e164`, an email-only person is `no_number` | `00053:36-38`; `app/api/v1/contacts/route.ts:84-105`; `core/src/messages/broadcast.ts:207-219`; `people.ts:1179` |

Two more facts do most of the remaining work. **A lead is a US Google Maps place**: one source card
(`lead-search.ts:545-581`), a literal type (`:167, :250`), `leads_tenant_place_uq` (`00140:235`), items without a place id
skipped (`00161:127`; `00165:86`), a required US area, `usPhone` only (`clean.ts:22`), and judge facts that are listing
facts (`lead-judge.ts:35-45`); asking for people is refused as `not_businesses` (`leads.ts:865-867`). **The consent surfaces
are a counter**: "Messages about your visit", "Appointment reminders and confirmations", a paper form "for a customer at
the desk", a desk sign "printed and put where customers wait", a yes only by WhatsApp or SMS
(`consent-page.ts:160-224, 318-429`).

And one default hides the B2B layer that exists: `tenants.sells_by` is `booking | proposal` and defaults to booking; the
deals, the Pipeline and the proposal templates appear only after an owner picks "Some get a proposal first"
(`deals.ts:44-71, 91-92`). #938 asks the question on a new workspace, which is right; the default and the words are not.

**The words** (copy lines a person reads, comments and demo seeds excluded): receptionist 477, calendar 354, services
360, hours 261, book/booking 336, visit 208, Google listing 71, reviews 84; meeting 2, prospect 0, retainer 0, project 0.
The trade-neutral test's regex is `salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(es)?`
and its scope leaves out `apps/dashboard/src/auth` (`trade-neutral.test.mjs:19-29, 49`), so "gloss and trim"
(`auth/AuthShell.tsx:72`), "gel manicure" and "highlights" (`channels/src/voice-shell.ts:360`), "Color correction /
Extensions", "No chemical services after 4 PM", "Bridal parties" (`business-tab-offer.jsx:192, 215`), "skin reactions"
(`business-tab.ts:157`), the "walk-ins" placeholder (`business-tab-answers.jsx:422`) and the starter set's "Luna Studio" with
a Booksy link (`template-library.ts:60-61`) all pass.

### 1.2 What the B2B claim already stands on

- **The deal is a record** (`00156`, `00160`): stages `proposed | won | lost | ended`, `amount_cents`, `per` in
  `once | month | year`, `proposal_url`, `valid_until`, `lost_reason`; one open per person per service. The
  `proposal_waiting` follow-up runs where deals are on (`00167`, decision 0006). Next steps are dated notes on Today
  (`00166`, decision 0007). The Pipeline is a view of People: Consultations, Proposal out, Clients, Passed or ended
  (`pipeline.ts:1-18`).
- **Consultation-first is a setting** (`config.ts:447`; `availability.ts:824, 849`).
- **The finder was designed for sellers finding buyers**: "most asks are a seller looking for the businesses that buy
  from them" (finder PRD Appendix D.2), the card catalog with Claude choosing a card per ask (decision 23), Recipe B
  Amazon sellers (§10.2).
- **Inbound email exists**: `mailboxes` (`00126:21-45`), the Resend door, `email_ingest`, receipts, suppression on bounce
  or complaint (`email-receipts.ts:69-74`); email-only people arrive through inbound email or a lead's conversion
  (`00125`, `00142:208-222`), and #999 adds a third way in, the import.
- **Ask can propose deals, lead searches, broadcasts and playbooks** as cards a member approves (`server/ask/proposals.ts`).

### 1.3 The People family, as built

| Surface | Draws | Fed by | Reads | Writes | Size |
| --- | --- | --- | --- | --- | --- |
| People | `PeopleReal` `clients-a.jsx:2638-3183` over `PeopleTable` (`people-table.jsx:77`), the rail kit (`:1203-1366`), `PeopleBulkBar` (`:1742-2069`), `usePlControls`/`usePlPlace` (`:2268-2635`) | `peopleOverride` (`surface-data.ts:1102-1155`) → `__PEOPLE`; the courier `installPeopleCourier` (`people-detail.ts:577-640`) publishes 24 `__*` doors | `GET contacts` every page (50×1000, `surface-data.ts:1074-1088`) → `people_list`; `GET segments`; `GET views` | views, consent ×2, receptionist, notes, `POST contacts` → `create_person` | clients-a.jsx 3,914 lines |
| Leads | `LeadsReal` `clients-a.jsx:3184-3897` (about 30 `useState`), `LeadsScope` (`leads-scope.jsx:998-1305`), the finder (`leads-finder.jsx`), the peek (`leads-peek.jsx`) | `leadsOverride` (`leads.ts:319-343`) → `__LEADS`; 27 `__lead*` doors | `GET lead-searches`, `GET leads` → `leads_page` | stage, keep, exclude, put-back, draft, bulk, check-again, export, searches, undo | leads.ts (contracts) 2,502; server/leads.ts 1,455 |
| Lists | the rail, `RuleEditor` (`clients-a.jsx:1074-1138`), `PersonLists`, `TodayPins` | rides `peopleOverride` (`__PEOPLE.lists…`), `__lists` (`people-lists.ts:50-176`) | `GET segments` | `POST/PUT/DELETE segments`, `segments/draft` | lists.ts 596, list-rules.ts 589 |
| Pipeline | `PipelineScope` (`pipeline-scope.jsx:143-597`), the board, row, peek, `DealSheetHost` | no surface of its own: `__PEOPLE.rows` where `dealsOn`; `__pipeline` from `seed-globals.ts:158` | `GET contacts` (the `deal_*`, `step_*` columns, `deal_pace`, `follow_up`); `GET contacts/[id]` for the peek | `POST contacts/[id]/deal` → `deal_record`; notes | pipeline.ts 950, deal-sheet.ts 1,055 |
| Lead peek | `LeadPeek` (`leads-peek.jsx:555-572`), its own `aside`, not a `RecordSheet` | `__leadPeekVM` over the loaded rows (`leads.ts:546-552`) | nothing of its own | stage, not-a-fit, keep/exclude, put back, call outcome, draft, emailed, undo | 690 |
| Person page | `ClientProfileReal` (`client-profile.jsx:1311-1824`) | `__personDetail` over the tab-kept read cache (`people-detail.ts:169`) | `GET contacts/[id]`: `people_list(p_contact_id)` plus 18 `.from()` calls over 11 tables (`contacts/[id]/route.ts:309-552`) | details, consent ×2, receptionist, erase, notes ×5, deal | 1,838 |

Rules are evaluated in TypeScript over `people_list` rows, on the browser, the dashboard server, the send and the edge
(`list-rules.ts:410`; `surface-data.ts:947`; `audience.ts:95-124`; `campaign-ports.ts:105-109`; `apps/edge/lib/playbooks.ts:193-221`).
Every People refresh re-reads every page and is triggered by any insert into messages, conversations or escalations and
any change to deals, notes, segments or members (`surface-data.ts:1111, 1118-1129`).

### 1.4 The send path and the inbound pipeline

Everything a customer receives leaves through `deliver()` (`packages/core/src/deliver.ts:395`): one query for the facts
(`:221-253`), then the refusals in order (erased, SMS offer `:266`, email offer `:271`, suppressed, recipient changed,
`mayMessageFor` `:281-282`, workspace paused, a hold), then the wire by channel (`:420-426`). Rate caps, sending hours and
template approval are the callers' (`answer.ts:579-623`; `create-broadcast.ts:141-145`; `broadcast.ts:86-97`).

Decision 0001 says "decided, not built". Step 1 of 8 is built: the receptionist's answer pipeline is a core verb
(`packages/core/src/inbound/answer.ts`, 998 lines) and the WhatsApp handler is a 52-line shim. Steps 2 to 8 are not:
there is no `InboundMessage`, no `ChannelCapabilities`, no `conversation_channel_state`, no email draft.

### 1.5 Email, as built

Inbound email is filed and flagged `email_review`, "does not answer email yet" (`core/src/messages/email-ingest.ts:110-115,
155-165`). `mailboxes.reply_mode` (`draft | veto | auto`, default draft, `00126:41`) has no reader in TypeScript. An
owner's reply works only inside a thread that already holds an inbound email (`conversations/reply.ts:191-192`);
`buildEmailRequest` requires a parent (`channels/src/email.ts:48-62, 175-198`), so nothing composes a new email. Sends
leave only as `<local>@EMAIL_DOMAIN` (`email.ts:602-612`); an own domain is the email plan's E4, not built. The reply
carries no footer, no postal address and no `List-Unsubscribe` (`email.ts:179-183`); the only footer is the finder's
draft's (`leads.ts:1009-1011`), which leaves through the owner's own mail app (`server/leads.ts:1118-1121`).

### 1.6 In flight

- **#999 (open):** People › Import, a hand-rolled CSV reader, `import_person` (migration `00170`, verb `import`), an
  email-only person where there is no number, the paper form's Email line; no consent recorded. Part 0's second PR
  (the receptionist asks for an email, an address in a customer's own words, the calendar fills one, `caller_email`)
  is written in `docs/superpowers/plans/2026-09-24-capture-emails-part-0.md` on the branch (its migration numbers are stale:
  it says 00169; #999 shipped 00170 and main holds 00169).
- **The campaigns spec** (on the same branch): decisions 1 to 13, parts 0 to 3, its own risks. Its Part 1 rewires
  `mayMessageFor(channel)`, versions, `channels[]`, `reachFor` and the sender; Part 2 the unsubscribe, offers, own
  domains and the lead audience; Part 3 text.
- **Open PRs to land or close first:** #998 merged during this writing; #762 (the phone offers times under Asks you;
  its `bookingHeld` switch is still unmade on main), #771 (one language control, since overtaken by #956), #772 (run
  reach), #777 (`propsWithout`), #925 (keys in the ? sheet).

### 1.7 The structural debts the docs name

`docs/takeover.md:75-90`: group `src/server` by domain and split the five largest contracts files (waiting on open
branches); the state rule paragraph, then retire the mockup stores one surface at a time; colocate tests and drive the
text pins in core and channels to zero; then decisions 0001, 0002, 0003. Also: 148 `window.__*` globals (`:26`), ten
`*_STORE` stores (`:29`), nine files over a thousand lines (`:41`), hash routes with no route splitting (`:30`), and
the "five names for a person" (`docs/glossary.md:50-61`). One rule the docs state and the code does not keep: "a table
name typed outside `packages/db`" is forbidden (`CLAUDE.md:131`), yet 61 files under the dashboard and 49 under the edge
call `.from("<table>")` directly.

---

## 2. Decisions

Recommended, numbered, and Ruben's to confirm (§7 lists them again as questions). Each names the smallest change.

1. **The words follow "How customers buy".** One derivation, `wordsFor(sellsBy, serviceMode)` in contracts, decides
   visit/meeting/call, appointment/booking, "when you're open"/"when you take calls", on every surface that reads them.
   No second spelling anywhere (the one-predicate rule applied to words).
2. **The receptionist answers email in draft mode first** (0001 step 6). `mailboxes.reply_mode` gets its reader; the
   most restrictive of the reply class's mode and the mailbox's mode wins, in the one function `effectiveReplyMode`.
   Veto and auto on email come only after E0's trust evidence and an own domain (0001's open question 1, answered "not
   yet, and here is the gate").
3. **A new email to a person is a verb**, `composeEmail`, beside `replyToConversation`, over the same ports, through the
   one door, with a pre-written queued row. It needs no parent. It is owner or operator, and it makes the thread when
   there is none.
4. **The deadman sweep does not own email.** The mailbox's own health is the watch (0001's open question 2). `INLINE_INTAKE`
   stays as it is.
5. **A reply goes back on the channel the person last wrote on** (`replyChannelOf` as today; 0001's open question 4),
   and the composer says which wire it is on. No preferred-channel setting (the campaigns spec, decision 13).
6. **A lead's identity is per card.** A second card, *people at businesses*, whose unit is a named person at a company:
   `leads.kind = 'person'`, `source` and `source_key`, person columns, dedupe by `(source, source_key)` then name and
   company. "People at home" stays refused. The source-rights record gains a section for the card, as the record, not a
   gate (decisions 21 and 22 of the finder PRD).
7. **No organization entity now.** A person carries `company` and `job_title`; a lead is the business's record. An
   `organizations` table is written the day two people at one company must be linked to one deal; that trigger is
   named here so it is not forgotten, and nothing before it pays its cost (people_list, RLS, the VMs, Ask).
8. **A person may be added by email alone.** `create_person` takes a phone or an address; `POST contacts` the same;
   People's Add sheet and #999's import map Company and Title.
9. **Answering counts a mailbox.** With a mailbox whose reply mode is veto or auto the receptionist answers email; in draft
   mode it drafts. The first run's phone step becomes one an owner may put off; the receptionist's creation no longer
   demands a number to give out. Availability gains a second answer, *the scheduler decides*, for a business with no
   opening hours.
10. **A service has a mode**: in person, by video, by phone; and may carry a meeting link. The booking link stays the
    scheduler; nothing books (0002 unchanged).
11. **A recurring deal knows when it renews**: `deals.renews_at`, a Pipeline view, a Today leak, an Ask field. Payments
    stay 0005.
12. **Sequences are chained playbooks, not an engine**: a trigger `after_step` (sent on a parent playbook's run at least
    N days ago, no inbound since, not yet on this one), the generalisation of the campaigns spec's `lead_first` /
    `lead_follow_up` and the follow-up's once-per rule. After Part 2.
13. **Refactors precede features on the same files**: the People family's splits and seams land before W3 to W7 touch
    them, each as a pure move that the readCode baseline and the page tests hold still.
14. **Events out to other tools is its own decision note**, after W8; sketched in W9 so its shape is known.

---

## 3. The design, workstream by workstream

Each workstream says: contracts · core · db · jobs · edge · dashboard · events · tests · deploy order · proof. "None" is
said out loud. The recipes are `CLAUDE.md`'s canonical table; a new table follows `00156`'s shape, a new route the
snooze route's, a new verb `snooze.ts`'s.

### W0 · Fix first: four hazards in the send path, and the dead doors

Any new email caller trips these; they ship before the campaigns spec's Part 1 PR 2 (the sender).

| # | Hazard | Fix |
| --- | --- | --- |
| 1 | A send with no queued row goes through `recordOutbound`, which mints the row id after the send (`db/src/repositories/ingest.ts:145-161`); the request is tagged with a row id (`email.ts:192-196`), so receipts answer `no_such_row` (`email-receipts.ts:58-59`) and suppression never happens | Every email send pre-writes a `queued` row with a minted id, as the reply path does (`reply.ts:201-218, 364-376`). `recordOutbound` refuses `channel: "email"` |
| 2 | `sendQueued` takes purpose from the template and hardcodes `proactive: false` (`messages/send.ts:41, 63`); a queued first email would be judged as a conversational reply | `purpose` and `proactive` travel in the `outbound_send` payload (or the row's meta) and `deliver` reads them |
| 3 | `alreadySent` counts sent/delivered/read rows only (`jobs/src/handlers.ts:340`); `SPEAKS_TO_A_PERSON` means no retry (`ledger.ts:85`) | A stable idempotency key per recipient (the recipient row id; Resend honours it 24 h) and the queued row reused |
| 4 | `buildEmailRequest` requires a parent (`email.ts:48-62, 175-198`) | `parent: null` with an explicit subject, no In-Reply-To, `Auto-Submitted: auto-generated` for campaigns; `List-Unsubscribe` and `List-Unsubscribe-Post` and a footer as arguments |

And in the same pass: `__leadFindEmail` is called (`clients-a.jsx:3759-3761`) and never installed (`leads.ts:554-589`);
`__leadErase` is installed and never called; `lead_searches` is refreshed on (`leads.ts:331-332`) but never added to the
realtime publication (`00140:2014-2025`); the peek cannot open a lead outside the loaded page (`leads.ts:546-552`; `leads/[id]`
exports only `DELETE`), so the person page's "Open the lead" draws nothing past 500 rows; the judge's per-criterion reads
are effectively never shown because `checksOf` matches a criterion's key literally (`server/leads.ts:584-588`) while the
planner derives keys from the text (`leads.ts:811-823`) and the judge names the kind `kind` (`lead-search.ts:113`).

**Tests.** `core-send.test.mjs` gains the queued-row and purpose cases; `email-receipts.test.mjs` proves a receipt lands on
a campaign row; `leads-honest.test.mjs` drops the dead door; `lead-engine.db.test.mjs` proves the publication. **Deploy
order:** either. **Proof:** a dry-wire email send on the nightly workspace is followed by a receipt on its own row.

### W1 · The People family, refactored before it carries more

Pure moves and one-rule consolidations. No behaviour changes, no new words; the page tests run each surface on the stub
React before and after; `source-scan-baseline.json` falls or holds.

**R1 · Contracts by domain.** `people.ts` (2,785) → `people/{rows,person,actions,words}.ts`; `leads.ts` (2,502) →
`leads/{rows,peek,search,words}.ts`; `deal-sheet.ts` and `pipeline.ts` under `deals/`; each old path re-exported by a
barrel for one release, then the barrel goes. (`docs/takeover.md` item 2; it waited on branches that have since landed.)

**R2 · `src/server` by domain.** `server/people/{people,people-many,person-notes,consent,export}.ts`, `server/leads/`,
`server/deals/`, `server/lists/`, `server/campaigns/{playbooks,campaign-ports,audience}.ts`. `apps/edge/lib` is the model.

**R3 · Table names back into `packages/db`**, in this family only: `contacts/[id]/route.ts`'s 18 `.from()` calls become
one `personRead` repository; `server/leads.ts`'s 10 a `leads` repository; `segments/[id]/route.ts:172` uses the playbooks
repository; `server/deals.ts` and `server/people.ts` likewise. `hygiene.test.mjs` gains the rule for these directories.

**R4 · `clients-a.jsx` (3,914) split**, honouring the one-namespace rule of the standalone harness
(`apps/dashboard/src/legacy/CLAUDE.md:18`): `people-seed.jsx` (the demo page, 327–655), `people-rail.jsx` (the rail kit, the
list verbs, `RuleEditor`, 847–1366), `people-phone.jsx` (the phone bar and sheets), `people-bulk.jsx` (`PeopleBulkBar`),
`people-hooks.jsx` (`usePlControls`, `usePlPlace`), `people-real.jsx` (`PeopleReal`), `leads-real.jsx` (`LeadsReal`);
`clients-a.jsx` keeps `ClientsA` and the columns. `__listRoute` leaves the page for `people-lists.ts`, since the shell
routes through it (`app-shell.jsx:328-333, 517`). Both file lists (`manifest.ts` and `Chanlytics.html`) change together;
`legacy-harness.test.mjs` holds them.

**R5 · The fourteen seams**, each one contracts function or one bridge door, each proven by an executed page test:

| # | Seam | Refactor | Proof |
| --- | --- | --- | --- |
| 1 | A person's second line is worked out twice (`clients-a.jsx:1572-1573`, `:1699-1708`) | `personSecondLine(row, attention)` in contracts | people-honest |
| 2 | Consent is worded in six or more places (`client-profile.jsx:1558, 1566, 1717-1785`; `clients-a.jsx:2022, 2025`; `consent-page.ts:217, 227`; `ask-text.jsx:25` vs `leads.ts:138`) with fallback copies of `CONSENT_SOURCES` (`client-profile.jsx:1418-1425`) | `CONSENT_WORDS` (label, question, `hint(state)`) in contracts, published once; the fallbacks deleted | consent-door, person-honest; the pins at `calendar-people.test.mjs:1389-1395` retired |
| 3 | The booking-link sentence typed three times and the `chanlytics-compose` sessionStorage write copied four times (`clients-a.jsx:1533`, `client-profile.jsx:1516-1525`, `pipeline-scope.jsx:117`, `calendar-real.jsx:204`; read at `inbox-thread.jsx:1547`) | `__composeIn(threadId, text)` in the bridge; `bookingLinkMessage(link)` in contracts | person-honest, pipeline |
| 4 | The owner-or-operator check written three times (`client-profile.jsx:1389`, `clients-a.jsx:2684`, `pipeline-scope.jsx:112`) | a `record` permission in `ROLE_PERMS` (`config.ts:45`), `window.canDo("record")` | the role cases |
| 5 | Two rules for who may work leads: the UI gates behind `find` (owner), the routes allow operators (`leads-peek.jsx:395`; `stage/route.ts:16`) | one table: the route roles | lead-routes, leads-honest |
| 6 | Peek address syncing and the focus rule copied (`clients-a.jsx:3330-3352` and `pipeline-scope.jsx:323-344`; `leads-peek.jsx:44-49` and `pipeline-scope.jsx:105-110`) | `usePeekAddress({view, addrPeek, peekId, routeOf, nav})` beside `usePlPlace` | pipeline, leads-honest |
| 7 | Deal acts reach `openDealSheet` through four menus with four rules for the deal id (`pipeline-row.jsx:28-50`, `inbox-thread.jsx:523-530`, `person-deal.jsx:26-35`, `calendar-real.jsx:182-189`) | `__deal.run(personId, act, deal)` | deal-sheet, pipeline |
| 8 | The list-need checks come in four variants and there are two list judges (`surface-data.ts:914-935, 1304-1311`; `people.ts:2713-2715`; `broadcasts.ts:121-124`) | `publishPeople` builds its lists from `listsFor`/`membersOf`; the `needs*` flags and the `PEOPLE_LISTS` branch in `audienceMembers` go; `listToken`/`parseListToken` published, the five hand-spellings (`clients-a.jsx:1162-1171, 2799`; `app-shell.jsx:494-500`; `people-lists.ts:106-111`; `today.ts:704, 1898, 2040, 2059, 2352`) deleted | one-idea-of-a-list parity, smart-lists |
| 9 | The "current deal" rule exists in SQL (`00166`) and in `pickCurrentDeal` (`deals.ts:265`) | the deal door answers with the `people_list(p_contact_id)` row | deals.db |
| 10 | People's sort order is in JSX (`clients-a.jsx:2767`); the Pipeline's in contracts; Leads' in SQL | `peopleSorted` in contracts | people-vm |
| 11 | The strip's view model is in JSX with its own sentences (`leads-finder.jsx:474-612`; `seed-globals.ts:182` promised `__LEAD_VM`) | `leadStrip` into contracts | leads-finder |
| 12 | The Pipeline's views and the deal lists are the same groups under two names (`pipeline.ts:659-694` vs `proposal_out`, `clients`, `deal_passed`, `deal_ended`); Today's doors mix both (`today.ts:2011`) | the Pipeline's group views are the built-in deal lists; its own (waiting, lapsed, steps, `svc:`) become computed lists, so "any list is a door" covers it | pipeline, a-list-has-a-life |
| 13 | Old doors live: `PUT details` accepts `notes` and `proposal` that nothing sends (`details/route.ts:71, 94`); the comment at `contacts/notes/route.ts:18` names the wrong door | drop the two fields from the schema; fix the comment | people-routes |
| 14 | Clipboard code copied four times (`clients-a.jsx:753`, `client-profile.jsx:1520-1523`, `pipeline-peek.jsx:25-31`, `leads-peek.jsx:648`) | `window.copyOut(text)` in data-bits | person-honest |

**R6 · The state rule, and the family's stores.** One paragraph in `legacy/CLAUDE.md`: server state lives in the surface
seam; per-tab UI state in the page; cross-surface state in one named store per surface. Then retire, in this family:
`window.__clBulkTimer` (`clients-a.jsx:362-366`), `PK_STILL`/`pkWarmed` never cleared across workspaces
(`leads-peek.jsx:164, 680`), `PIPE_COLUMNS` frozen at first draw (`pipeline-scope.jsx:30, 86`), `PD_STEP_PRESSED`
(`person-deal.jsx:37`), and the bridge's module state (`surface-data.ts:847, 980`; `leads.ts:138-148`;
`people-detail.ts:97-98`); `__peopleMore`/`__peopleSearch` move from `apply` to the install function
(`surface-data.ts:1147-1152`). Views remembered in four places (`memberships.views`, `PL_VIEW_KEYS` in localStorage,
`leads.values`/`pipeline.view`, tab memory) become two: the membership and the tab.

**R7 · Text pins to behaviour**: `calendar-people.test.mjs` (45 reads, pinning `clients-a.jsx:1015-1019, 1270-1290,
1377-1405, 1545-1569`), `saved-lists` (14), `marketing-consent` (15), `consent-door` (7), `threads-people` (6). Each
becomes a rendered-page assertion; the baseline falls by the count.

**R8 · Stale text**: `surface-registry.ts:33` ("Leads / Deal board / Lists stay demo"), `0009:3` ("not built"),
`docs/decisions/README.md` (lists built notes), `docs/glossary.md:40` ("Deal: No table") and `:29` (a mailbox "or its own
domain"), `docs/architecture.md:245-246` (deals unbuilt), the job-kind counts (`system-prd.md:452, 844`;
`system-map.md:113`; there are eight), `system-prd.md:179` (`middleware.ts` is `proxy.ts`), `seed-globals.ts:182`.

**Deploy order:** either, every PR. **Proof:** the nightly stays green through the series; `people.spec.ts`,
`leads.spec.ts`, `phone.spec.ts` and `people-lists.spec.ts` unchanged.

### W2 · The inbound pipeline finishes decision 0001 (steps 2 to 5)

As 0001 writes them, in its order, each shippable alone:

- **Step 2** `InboundMessage` and `InboundChannel` in `packages/channels/src/inbound.ts`; `inboundFromWhatsapp`,
  `inboundFromSms` beside the existing shapes; the pipeline accepts either for one release.
- **Step 3** the doors become adapters: `inbound-sms.ts` stops passing `{}` as a Meta envelope; `whatsapp.ts` converts
  inside its per-message `try`, the 503 count and the frozen process-then-200 contract unchanged (`golden-edge.mjs:62-103`).
- **Step 4** `conversation_channel_state (conversation_id, channel, last_inbound_at)`; `ingest_inbound` writes it for every
  channel and goes on writing `last_wa_inbound_at`.
- **Step 5** the readers (`reply.ts:170`, `viewmodels.ts:695`, `people.ts:815, 1479`, `ask/proposals.ts:200`) move behind one
  accessor; `replyWindow` keeps its signature.

`ChannelCapabilities` (0001 §Shape) is introduced at step 3 with `mayAutoSend`, `window`, `body(text, isFirstReply)` and
`held`. **Tests:** 0001's list (`inbound-shape`, `reply-window` per channel, the door tests unchanged in what they call
and assert, `inbound-executed`'s 26 cases green). **Deploy order:** per step as 0001 states; step 4's migration before
either app. **Proof:** the salon's live line through each step; `whatsapp-door.test.mjs`'s eleven outcomes unchanged.

### W3 · The receptionist answers email; an owner writes a new one

**W3a · Draft mode** (0001 step 6, decisions 2 and 4).

- *contracts:* `resolveSystemPrompt(channel: "email")` (`config.ts:1554`) with the email shaping: a subject `Re:` as the
  reply already does, no quoting of the inbound, a sign-off from `mailboxes.from_name` and the business name;
  `escalations.reason` gains `email_draft` (the email plan's appendix A already names it); `effectiveReplyMode` takes
  the mailbox cap (most restrictive wins, `reply-posture.ts:32-46`).
- *core:* `ingestEmail` gains a port `answer`, called after `record` when the claim is a person
  (`email-ingest.ts:155`), which runs `answerInbound` over `ChannelCapabilities{channel:"email", mayAutoSend:false,
  window:"always_open"}`; in draft mode the answer is written into the `email_draft` escalation's details and nothing is
  queued; in veto and auto it is queued through `queueDraft` with `to_email`. The lead context is read by contact, not by
  the e164 `from` (`answer.ts:718-726`). An email opt-out reader over quote-stripped text: "unsubscribe" or "no thanks"
  writes email marketing opted-out through the campaigns spec's `set_email_marketing`; "stop all messages" sets `dnc`.
- *db:* the CHECK on `escalations.reason` widened; `mailbox_set_reply_mode` door (owner; the mailbox's own row on
  Connections › Email says "Drafts for you · Sends after 30 s · Sends"). Sets regenerated.
- *jobs:* none new. *edge:* the unions widened together (`draft-queue.ts:34`, `persist.ts:94, 145, 206`, `alerts.ts:14`,
  `core/inbound/ports.ts:35`, `answer.ts:90`); `INLINE_INTAKE` unchanged (decision 4).
- *dashboard:* the thread shows the draft under the state bar as "Drafted for you", with Edit and Send; Send is the
  existing reply route with a human actor (0001's "a person sends"); the person page's Email row says the mailbox's mode.
- *events:* existing; `escalation.opened{reason:email_draft}`.
- *tests:* `email-draft.test.mjs` (0001 names it: an email on a draft mailbox produces the draft and sends nothing; with no
  mailbox row, as today); `email-optout.test.mjs`; the door tests unchanged.
- *deploy order:* migration, then the edge (the widened unions ride its dist), then the dashboard.
- *proof:* an email to the salon's mailbox yields a draft in the Inbox within a minute; Send delivers with `In-Reply-To`
  and the receipt lands on the row.

**W3b · A new email** (decision 3).

- *core:* `composeEmail` beside `reply.ts` over the same `ReplyPorts` (claim, take control, withdraw drafts, queue with a
  minted id, schedule `outbound_send` with the 15 s grace); `freeze` takes `parent: null` and a subject (W0 #4).
- *dashboard:* `POST conversations/[id]/email` (operator, rate `reply`); for a person with no thread,
  `POST contacts/[id]/email` resolves the target by contact id and makes the conversation (`ingest.ts:266` is phone-only
  today). The thread composer gains "New email" when the person has an address; the person page's More too. Rows in
  `route-policy.json`; `refresh-map` `AFTER`; the typed client regenerated.
- *events:* decision `reply {channel:"email", new:true}`.
- *tests:* `email-compose.test.mjs` over fakes; `people-routes` for the contact route.
- *deploy order:* either. *proof:* an operator writes a first email to an imported person from their page; the reply
  threads on the conversation.

### W4 · Campaigns on every channel, as specified, with three additions

Parts 0 to 3 ship as the spec says; this program adds:

1. **W0 precedes Part 1 PR 2** (the sender), since the sender pre-writes rows, carries purpose and uses the recipient id
   as the idempotency key.
2. **The email version's validator is its own**, not Meta's (`validateTemplateDraft` holds Meta's rules,
   `templates.ts:97-172`): a subject up to 60, a body up to the reply limit, slots a subset of the WhatsApp version's.
3. **`after_step`, after Part 2** (decision 12): `playbooks.after_playbook_id` and `after_days`; the trigger's reach is "sent
   on the parent playbook's run at least N days ago, no inbound since, not yet on this playbook", computed from
   `touchesSince` like the follow-up's once-per rule (`playbooks.ts:430-436`); the CHECK gains `after_step`; the sheet
   draws the chain; no new job kind (the hourly sweep runs it). `lead_first`/`lead_follow_up` become two uses of it.

### W5 · A lead that is a person at a business (decision 6)

- *db (`00171` or the next free number):* `leads.kind text not null default 'place' check (kind in ('place','person'))`;
  `leads.source text not null default 'local_businesses'`; `leads.source_key text`; a unique index
  `(tenant_id, source, source_key)` where `source_key is not null`; `leads_tenant_place_uq` becomes partial on
  `kind = 'place'`; person columns `person_name`, `job_title`, `company`, `profile_url`; `lead_suppressions.kind` gains
  `profile`; `lead_collect_commit` and the re-judge skip items without a `source_key` rather than without a `place_id`
  (`00161:127`; `00165:86`); `lead_search_create` accepts any approved card (`00140:1431-1438`); `lead_plan_check` mirrors
  the plan schema. All additive with defaults; safe in either order.
- *contracts:* `LeadSearchPlan.card` becomes a union of the two card ids (`lead-search.ts:167, 250, 527`); `area` is
  required for the place card and optional (a region or a country) for the person card; `LEAD_CARDS` gains the brief
  (good for: "buyers, decision-makers and owners at the businesses that buy from you"; not for: people at home, anyone
  without a company); `planLeadSearch` stops hard-coding the card (`leads.ts:863-875`) and refuses only "people at home";
  `JUDGE_FACT_KEYS` gains `title`, `company`, `company_kind` for the person card; `LeadRowVM`/`LeadPeekVM` carry `kind`;
  `LEAD_STAGE_WORDS` unchanged.
- *core:* `CARDS` gains the runner: one pinned actor and build, `buildInput(plan, term)` from the validated plan,
  `mapItem → PersonProspect`, the email checker reused, no site scrape; `identity.ts` dedupes by `source_key`, then name and
  company; `cleanPlace` gains `cleanPerson`. **Which actor:** scouted on the platform's own account under the $0.25 cap
  (finder PRD §0.3), the shapes pinned as fixtures in the real shape, and the card approved when Ruben merges it. The
  product never names the vendor.
- *dashboard:* the peek draws a person layout (name, title, company, links, reach; no photo band, hours or map);
  `LEAD_COLUMNS` per kind; the map mode hidden for a person search; **"Add to People"** as an explicit verb on both kinds
  (`lead_convert` door: makes the person by email when there is no phone, links `leads.contact_id`, writes
  `lead.converted`); the call outcome "interested" keeps doing the same; a yes still comes only from them (§0.4).
- *Ask:* `propose_lead_search`'s `looking_for` gains "people at businesses" (`proposals.ts:257-262`).
- *events:* existing `lead.*`; `lead.converted{by:"person"}`.
- *tests:* `lead-search.test` (the union, the area rule), `lead-engine.db.test` (the two uniqueness rules, the commit's
  skip), `leads-honest` and `leads-peek` (per kind), a replay fixture for the person actor; the catalog's eval set
  (`tooling/evals/lead-cases.json`, which §0.3 names and which does not exist yet) created with the first ten real asks.
- *deploy order:* migration first; then either app (a dashboard that does not know the card cannot plan it; an edge
  that does not know it answers `lead.no_card`).
- *proof:* an internal run on the listed test workspace: "twenty owners of independent pharmacies in Brooklyn", judged,
  three converted by email, one cold email sent through Part 2's wire.

### W6 · The onboarding root, and the person model (decisions 8 and 9)

- **A person by email.** `create_person(p_phone default null, p_email default null)` raises only when both are absent;
  `POST contacts` takes one of them; `contacts.company`, `contacts.job_title`, `contacts.profile_url` (nullable, written
  through `set_person_details` extended, column grants as `00121`); `PersonRowVM.sub` shows the company where there is
  one; search covers company; People's Add sheet gains Email, Company, Title; #999's column matcher gains Company and
  Title after it merges. No identity channel for LinkedIn: `contact_identities` stays what it is, a way a customer
  reaches the business.
- **Answering counts a mailbox.** `setup.ts:470-472` gains the mailbox, and the sentence says what each channel does
  ("answering calls and WhatsApp, drafting email replies"); the Today card and the first run's Live step read it.
- **The phone step can wait.** `first-run.ts:72-85`: the `phone` step's rows keep their states, and the step offers "Not
  now" when the workspace has a mailbox (the first-run spec's "non-key steps skippable"); `business-tab-save.jsx:341-345`
  no longer demands a number to give out (`phone_display` is already optional in the schema).
- **Availability.** `profile.availability: 'hours' | 'scheduler'` (default hours, inside the strict `profile` section:
  **the edge deploys first, alone**, then the dashboard's save rules, per 0008's rule). With `scheduler`, the facts row
  needs a name and one service; the prompt says the booking link decides the times and `check_availability` answers "the
  link has the times"; the visit playbooks that read the calendar still run where a feed exists.
- *tests:* `setup.test`, `first-run.test`, `people-routes` (a person by email), `tenant-config-forward-compat`.
- *proof:* a new workspace with an email address and no line reaches "Your receptionist is drafting email replies" on the
  Live step, on production.

### W7 · Service mode, meetings, and the words (decisions 1 and 10)

- `ServiceSchema.mode: 'in_person' | 'video' | 'phone'` (default in person) and `meeting_url` optional
  (`config.ts:379-391`; strict section: edge first). The prompt names the mode ("a thirty-minute video call") and sends the
  booking link as today; `send_booking_link` unchanged.
- `packages/contracts/src/words.ts`: `wordsFor(sellsBy, mode)` → the nouns and phrases; readers: `setup.ts`, `first-run.ts`,
  `consent-page.ts` (the two asks' titles per `sells_by`), `template-library.ts` (a starter version per `sells_by`, the
  spec's versions per channel beside it), `lists.ts` labels, `people/words`, `today.ts` leaks, `playbooks.ts` trigger words.
  One derivation per fact; a second spelling is a failing test (`words.test.mjs` walks every reader).
- `trade-neutral.test.mjs`: the regex gains the beauty terms named in §1.1; the scope gains `apps/dashboard/src/auth`; the
  examples become a neutral pair (a made-up name, `example.com/book`).
- *deploy order:* edge first for the section keys; the words PRs either.
- *proof:* a `proposal` workspace reads "meeting" and "when you take calls" on Setup, the first run, the `/yes` page and
  the starter templates; the salon reads exactly what it reads today.

### W8 · A deal knows when it renews (decision 11)

`deals.renews_at date` nullable, set on `won` when `per` is month or year (decided_at plus the term; editable in the deal
sheet); a Pipeline view "Renewing" (within 30 days) as a computed list (so it is a door, R5 #12); a Today leak "N renew
this month"; `propose_deal` gains the field; Reports' deals section counts renewals. One migration, one PR. 0005 unchanged.

### W9 · Events out to other tools (decision 14; sketch only)

`webhook_subscriptions (tenant_id, url, secret_ref → Vault, kinds text[], active, last_delivered_at, last_error)`; a sweep
reads `events` past each subscription's watermark and enqueues a **new job kind** `webhook_deliver` (internal, in
`RETRY_WAITS_MS`, never `SPEAKS_TO_A_PERSON`), signed HMAC over the raw body; a Connections row "Send what happens to your
tools"; owner routes; a Zapier listing is one more consumer of it. Its own decision note, written against the commit
where W8 lands.

---

## 4. Sequence, and the proof each step owes

Order matters because the same files move. Each row is complete on its own and leaves no half-built road.

| # | Step | PRs | Deploy order | Proof on production |
| --- | --- | --- | --- | --- |
| 1 | Part 0, PR 2 (in flight; `00170` pushed first for #999) | 1 | migration first | the salon's list imports with its emails; an address a customer writes is on their page within the minute |
| 2 | W0 hazards + dead doors | 2 | either | a dry-wire email send is followed by its receipt on its own row |
| 3 | W1 R1–R4 (moves) | 4 | either | nightly green; baseline holds |
| 4 | W1 R5–R8 (seams, stores, pins, stale text) | 4 | either | baseline falls; page tests execute every seam |
| 5 | Part 1 (consent learns its channel; the sender) | 2 | per spec | `visit_tomorrow` and `proposal_waiting` reach a person by email |
| 6 | W2 steps 2–5 | 4 | per 0001 | the salon's line through each step; the door tests unchanged |
| 7 | W3a draft mode; W3b new email | 3 | migration, edge, dashboard | an email in becomes a draft; an operator's first email out |
| 8 | W6 person model + onboarding root + availability | 3 | edge first (availability) | an email-only workspace reaches Live |
| 9 | W7 mode + words + trade-neutral | 3 | edge first (mode) | a proposal workspace reads meeting/call; the salon unchanged |
| 10 | W5 person leads | 4 | migration first | the pharmacies run: judged, converted by email |
| 11 | Part 2 (unsubscribe, offers, own domains, lead audience) | 3 | per spec | a cold email to a converted person lead from an own domain; one-click unsubscribe |
| 12 | W4 #3 `after_step` | 1 | either | a two-step chain on the nightly workspace |
| 13 | W8 renewals | 1 | migration first | a monthly deal shows in Renewing |
| 14 | Part 3 text | 1 | per spec | as the spec |
| 15 | W9 decision note | 0 | — | the note, against the commit of step 13 |

About 36 pull requests, none over the size of the ones of 23–24 September. Steps 3 and 4 wait for #999 to merge, since
both touch `clients-a.jsx`. Steps 5 and 6 are independent of each other and may interleave. Step 10 needs the actor probe
(Ruben's token and the listed test workspace, as the finder's first internal run still does).

---

## 5. Tests and gates

- **Every ratchet stays green**: route policy, route types, source-scan baseline (falls in W1 R7), trade-neutral
  (widened in W7), no-customer, event kinds (new kinds declared and written in the same change), migrations, surface
  registry, legacy harness (both file lists in W1 R4), env manifest, lint boundaries, hygiene (R3's directories added),
  tenant-config forward compatibility (W6 and W7's section keys), dist freshness, db types.
- **Database suites** for each migration: tenancy (new tables named in `TENANT_TABLES`), privileges, and one
  `<feature>.db.test.mjs` per door (`import_person` is #999's; `mailbox_set_reply_mode`, `lead_convert`, the leads
  uniqueness, `after_step`'s CHECK, `renews_at`).
- **Executed page tests** on the stub React for every surface W1 moves; no new `readCode` pin anywhere in the program.
- **Door tests unchanged in what they call and assert** through W2 (0001's rule).
- **Nightly**: the Lists journey decision 0009 names (still unwritten, #1000), the CSV import (Part 0's done-when), an
  email round trip on the test workspace (W3), a person search on a dry actor (W5). The five paid Ask tests and the paid
  Leads tests stay behind their switches.
- **The local shared stack rule** (the runbook still says `db reset`, `docs/runbook.md:51, 276`; the plans say never):
  apply a migration by `docker cp` + `psql` and restore the saved definition; this program fixes the runbook line in W1 R8.

---

## 6. Risks

- **The live line.** W2 steps 1–3 touch the hot path; each ships alone with `inbound-executed`'s 26 cases green and the
  golden suite against the deployed URL.
- **Strict config sections.** `availability` and `mode` are keys inside strict sections; an older edge refuses them and
  the receptionist goes silent (`0008:44-50`). The edge deploys first, alone, in W6 and W7.
- **The one-namespace harness.** Every top-level name in the split files must be unique across the legacy tree;
  `legacy-harness.test.mjs` catches a second meaning, but only if both lists are updated.
- **Merge order with #999.** W1's splits and #999's import sheet both edit `clients-a.jsx`; W1 waits.
- **The campaigns spec's own risks** carry over: the START yes learns its channel; shared-domain reputation; provider
  limits as constants in contracts; email replies the receptionist cannot yet answer raise the owner's load, which is why
  W3 precedes Part 2.
- **A second card's source rights.** The record is Ruben's, as decisions 21 and 22 of the finder PRD; this program
  does not re-open it.
- **The readCode baseline** may not rise; every W1 move is checked against it before the PR opens.
- **Scope creep into an organization entity** (decision 7): the trigger is written; nothing before it.

---

## 7. Decisions for Ruben

Numbered as §2; the recommendation is the first option.

1. The words follow "How customers buy" through one `wordsFor`. Yes / a different rule.
2. Email answered in draft mode first, veto/auto after E0 and an own domain. Yes / veto now on the shared domain.
3. A new email is a verb through the one door, operator and owner. Yes / owner only.
4. The deadman sweep never owns email; the mailbox's health does. Yes / the sweep owns it with new words.
5. A reply goes back where they last wrote; no preferred-channel setting. Yes / a setting.
6. A second lead card, people at businesses, with the source-rights record extended as the record. Yes / not yet.
7. No organization entity until two people at one company share a deal. Yes / build it now.
8. A person by email alone, with company and title on the person. Yes / phone stays required.
9. Answering counts a mailbox; the phone step can wait; availability gains "the scheduler decides". Yes / the line
   stays required.
10. A service has a mode and may carry a meeting link; nothing books. Yes / defer.
11. `renews_at` on a deal, a Renewing view. Yes / defer with 0005.
12. Sequences as chained playbooks (`after_step`), after Part 2. Yes / a sequence engine / never.
13. Refactors precede features on the same files (W1 before W3–W7). Yes / features first.
14. Events out as its own decision note after W8. Yes / sooner / never.
15. The order in §4. Yes / a different order (say which).

---

## Appendix A · Capabilities a B2B or online business expects, today

| Capability | Status | Where |
| --- | --- | --- |
| Email sequences | absent | `deliver.ts:267-271`; playbooks are one WhatsApp template (`broadcast.ts:213`) |
| Person leads | absent | `leads.ts:256`; `lead-search.ts:554-559` |
| Company records | partial: a lead is a place with listing facts; a person has no company field | `cards.ts:65-97`; `database.types.ts:693-719` |
| Meeting scheduler with a video link | absent: read-only availability plus an outside booking link | `availability.ts:1-15`; `connections.ts:580` |
| Proposal / e-sign | partial: a link and a value on the deal, a prefilled composer, one nudge | `deals.ts:207-227`; `people.ts:497-510` |
| Invoicing / recurring billing for the owner's clients | absent: amount and per are a record | decision 0005; `connections.ts:653-664` |
| Outbound dialer | absent for the AI (TCPA, correct) and the owner | `voice-provision.ts:131-157`; `leads.ts:60-67` |
| LinkedIn touch | absent: the company URL is stored | `cards.ts:52, 202` |
| CSV import | in flight (#999) | branch `design/campaign-channels` |
| Integrations / webhooks out | absent | `connections.ts:26-38` |

## Appendix B · The People family's held items, from the plans

- Pipeline: one row per open deal; a pass in the history; going cold, open tracking, accepting, paying
  (`0008:436-447`; `pipeline-worked.md:389`); a walk on the salon's live Pipeline (`pipeline-one-workspace.md:50`).
- Lists: step 5, the server's count past the page's bound (`0009:307`); the end-to-end journey (#1000).
- Leads: release C (Not-a-fit learning, chips, Ask about leads, More like these, enrichment, the scout, more recipes);
  D3 task 4 (Find an email, Ruben's yes on the actor) and task 6 (wave overlap); D4 (email from the hosted mailbox, no
  plan file); the first internal run and G2's labelled run (Ruben's token).
- First run: 3c-3 (chips), 3c-4 (the booking link found on the website), PRs 4 and 5.
- Open questions in 0001, 0002, 0003, 0005 as their notes list them.

## Appendix C · How this was read

Five read-only audits over a detached worktree at `95cd0b27`, then re-read at `11584033`: the user-facing vocabulary; the
data model and the onboarding root; the per-channel capabilities; the People family's surfaces; the send path and email
as built; the framework's recipes; and the plans' status lines and the bodies of #940 to #1001. Counts were taken with
`rg -c` and `wc -l` on that day and are worth re-deriving.
