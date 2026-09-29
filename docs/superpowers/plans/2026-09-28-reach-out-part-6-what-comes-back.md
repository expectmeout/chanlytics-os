# Reach out, Part 6: what comes back — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a reach-out has written, its owner sees what came of it wherever they look:
- **Reports:** a Reach-outs section beside Campaigns. It has a funnel from written to booked, replies by angle, sends by domain with each domain's state, written by day, and each reach-out on its own line with each step below it.
- **Playbooks:** the chain's open row adds Interested and Booked to its step table.
- **Leads, while it writes:**
  - a strip over the search's leads: how many have been written to, today's count against the day's room, the next email and who it goes to, and the domain it leaves from;
  - a line under each lead's stage saying where that business stands (written, nudged, wrote back and what it meant, said no, bounced, booked, away until, not now until, planned for);
  - the peek's timeline of what was written, with "Read what went out", "Stop writing to them" and "Read as no · undo".
- **A person's page:** the reach-out's emails, named for their chain and step with the angle, the domain and what became of each. The reply shows how it was read, and a row says where the business was found.
- **The bell at 6 PM:** one line with the day's numbers, at 6 PM in the business's zone, on a day a reach-out wrote, heard back, or holds an email for its owner.

**Architecture:** Part 6 adds one migration, **00241**, and nothing else to the schema:
- two facts on a lead, `booked_at` and `reach_out_stopped_at`;
- three member reads (`reach_out_report`, `reach_out_search_lines`, `reach_out_lead_timeline`) and one member door (`reach_out_lead_stop`);
- one service-role read for the 6 PM line (`reach_out_day_due`);
- four functions re-created whole with one change each (`reach_out_booked`, `reach_out_chain_report`, `outreach_lead_facts`, `reach_out_followers`);
- one index, and the notifications kind CHECK re-issued.

Contracts turn each read into words, in two new modules: `reports/reach-out-report.ts` and `reach-out/reach-out-leads.ts`. The dashboard draws them through the surfaces that already exist: `__REPORTS` gains a field, `__reachOuts` gains verbs, and the person's DTO gains a block. Two new page files do the drawing, `pages/reach-out/reach-out-report.jsx` and `pages/reach-out/reach-out-leads.jsx`, each mounted by one line in the page that shows it. The edge's hourly playbooks sweep writes the 6 PM line.

**Tech Stack:** Postgres (a Supabase migration, plpgsql and SQL definer functions), TypeScript packages (contracts pure, core's send door, db repositories), the edge's playbooks sweep, the dashboard's app-plane routes (`route()`), the legacy JSX shell fed through `legacy-bridge`, node:test over `_fake-db.mjs`, the legacy page harness, and a replayed local stack (`*.db.test.mjs`).

**Status:** Written 28 Sep 2026 against `main` at `18c03481` (Parts 1–5 complete; the newest migration on main and in production is 00240). Every file:line in §1 was read at that commit. The spec (`docs/superpowers/specs/2026-09-25-reach-out-design.md`) is approved, with its §9 and Part 5's N1–N6. Ruben approved this part end to end on 28 Sep 2026 ("everything you ultimately suggest is approved"), so §0.2's decisions are this plan's to take, and none waits on him. The canvas's builder was read from `Claude Video/reach-out-design/canvas`: boards 06 (Leads while it writes), 12 (Notifications), 13 (Reports), 15 (a person's page after a reply) and 17 (every hold and stop). §0.2 records where the plan departs from a board, and why.

| PR  | Branch                        | What                                                                                                 | Migration |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 1   | `reach-out-6-plan`            | This plan                                                                                            | —         |
| 2   | `reach-out-6-what-comes-back` | Reports, the chain's row, Leads while it writes, a person's rows, the 6 PM line, and the spec's notes | 00241     |

**Why one code PR, as the spec's §6 says.** Every surface reads the same migration: the report and the chain's row need `booked_at`, and Leads, the peek and the person page share one read. The pieces are additive and none changes a send, with one exception: the stop's door fact, which only ever refuses more. So nothing here needs an order between two PRs. Parts 3–5 split because each had an engine to land before its pages; Part 6 has no engine.

**Migrations:** 00241 is this plan's number. The production ledger's head is 00240. 00223–00239's gaps are held by open scale and perf PRs, and another lane starts at 00245. The number is checked again right before the dry run, and renumbered if it was taken; the PR's As built says so.

**Deploy order:** 00241 first, pushed to production before the merge. Then either app, in either order:
- A dashboard ahead of the edge draws everything. Only the 6 PM line waits for the edge.
- An edge ahead of the dashboard writes the 6 PM line, which the bell draws with the alert's look until the dashboard knows the kind.
- The send door's new fact, `stopped`, reads as absent (false) on an edge that predates it. Until then the stop holds through the door's skip of the lead's planned and held sends and through the followers, both of which are SQL.

**As built.** PR 2's note, under its heading, says what departed from its tasks and why.

| PR  | Pull request | Migration | What it shipped |
| --- | ------------ | --------- | --------------- |
| 1   | #1321        | —         | The plan        |
| 2   | #1325        | 00241     | Reports' Reach-outs, the chain row's interested and booked, Leads while it writes, a person's rows, the 6 PM line |

PR 2 runs this sequence:
1. Branch from `main` after this plan merges.
2. Implement, then run the gate: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`, prettier, dead exports and `check:dist`. `git status` must show no dist drift.
3. One combined review, then fix what it finds.
4. Push 00241 to production: dry run, push, read back.
5. Open the PR, wait for green CI, squash-merge and delete the branch.

---

## 0. What is decided, and what this plan decides

### 0.1 Approved, and kept here

- **The spec's §3 decision 8:** no opens, no clicks, no tracking domain. What comes back is who wrote back, who was interested, who booked. No surface here counts an open.
- **§4.10 Reports:** per reach-out and per step, written, delivered, wrote back, interested, booked, said no and bounced; replies by angle; sends by domain with delivered, bounced and complaint rates and the domain's state; written by day; each step on its own line.
- **§4.11 Leads while it writes:** the strip, the Stage detail line, the peek's timeline with *Read what went out* and *Stop writing to them*. Part 4's F16 moved it here, and Part 5 left the undo on the lead here (G10, N4).
- **§4.9 and N2:** the day's numbers at 6 PM, the Reach-outs group's fifth row.
- **Part 4's F14:** Interested and Booked on the chain's report come once replies are read. Part 5 read them.
- **One predicate per rule, kept:**
  - *wrote back* is `outreach_wrote_back`;
  - *said no* is the lead's `closed_reason = 'said_no'`;
  - *bounced* is the chain report's reading of a bounce;
  - what a lead may be written is `outreach_lead_facts` mapped by `outreachRefusalOf`.
  Part 6 counts and draws what these say. It never computes a second answer.

### 0.2 This plan's own (H1–H12), with why

- **H1. What each number counts.** One cohort rule, the one `reach_out_chain_report` already keeps (00228:411-430): a lead's answer is counted once, at the last step that wrote to it.
  - *Written*: emails that left (`reach_out_sends.state = 'sent'`). On Reports, those that left in the period.
  - *Delivered*: of them, the email is `delivered` or `read`.
  - *Wrote back*: the send door's own reading, `outreach_wrote_back`.
  - *Interested*: a reading of the lead's reply, not undone, whose intent is `interested` or `question`. Both move a lead to Talking (Part 5's G6), and a question is a business asking to hear more. The words say "Interested" and the Reports card's line says it counts questions.
  - *Booked*: `leads.booked_at` (H2).
  - *Said no*: the lead's `closed_reason = 'said_no'`, whichever door closed it (a reply, an unsubscribe, a complaint).
  - *Bounced*: the email failed with the provider's bounce, as the chain report reads it. The domain card reads permanent bounces only, as the domain's hold does (H5).
  - *Handed*: a hand step's leads (00228), apart from written.
- **H2. Booked is recorded on the lead, whatever its stage.**
  - `lead_convert_by` converts only a `ready` or `nurture` lead (00220:480-489), and its `lead.converted {how: 'booking'}` event is written only then.
  - The usual path is a business that wrote back (Talking) and then booked, so that event misses exactly the bookings a reach-out earns.
  - 00241 adds `leads.booked_at timestamptz`, the start of the first appointment the calendar sweep saw after an email of the reach-out left. It re-creates `reach_out_booked` (00227:21-88) whole so that it stamps `booked_at` once (never moved later) for a `ready`, `nurture` or `converted` lead, and converts only a `ready` or `nurture` lead, as before. Its answer (how many moved) is unchanged, so the edge is untouched.
  - The Stage line reads the stamp: "Booked Thu 1:30 PM" (canvas board 06).
- **H3. Reports gets a section of its own, Reach-outs, under Campaigns.** Canvas board 13 draws the reach-out's funnel inside Campaigns, with its steps in Campaigns' sources table. This plan departs from the board:
  - `campaign_series` reads `broadcast_recipients` (00174:159-170), which no reach-out writes, so a reach-out's rows cannot join Campaigns' without re-creating that function.
  - `ReportsSections` is at its complexity ceiling (`baselines/complexity.json`, 206 lines, 39 branches).
  - So the section is its own file (`pages/reach-out/reach-out-report.jsx`), mounted by the page shell `reports.jsx` right after `ReportsSections`, with the same cards and words the board draws:
    - "From written to booked" (the funnel);
    - "Replies, by angle";
    - "By domain";
    - "Written, day by day";
    - "By reach-out and step" (a table: each reach-out, then each of its steps on its own line).
  - It draws only for a workspace with a reach-out. A reach-out that wrote nothing in the period says so in one line.
- **H4. Angles.** The card has one line per angle:
  - an angle's *written* is the emails the check tagged with it in the period;
  - its *wrote back* is the leads whose last email in the period carried it, and who wrote back.
  - It shows the eight angles with the most emails written. The rest are one line, "Other angles".
  - Emails with no opening (words without `{{opening}}`) carry no angle; the card's line says how many there were.
- **H5. Domains.** The card has one line per sending domain for the period's emails: sent, delivered %, permanent bounces % and complaints %, beside the domain's state now ("Verified", or "Held since Tue" with why, in `domainHoldWords`' words).
  - Bounces here are the domain's rule (`error->>'kind' = 'permanent'`, 00220:343-344), since the card's line is "a domain past 2% bounced holds itself".
  - Emails from a domain since removed are one line, "A domain since removed".
- **H6. The period is Reports' period** (7, 30 or 90 days in the business's zone, `REPORT_RANGES`), read the way `campaign_series` reads it. The chain's row on Playbooks keeps its whole-life counts.
- **H7. Playbooks' open row gains Interested and Booked.** `reach_out_chain_report` is re-created whole (00228:388-466) with two counts per step, both taken where `wrote_back` and `said_no` are. Contracts' head becomes Step, When, Written, Delivered, Wrote back, Interested, Booked, Said no, Bounced.
- **H8. Leads while it writes: the strip and the Stage line.**
  - **One read per open search:** `reach_out_search_lines(tenant, search)`.
    - It answers the search's chain: name, state, the leads written to, today's emails in the business's zone, the next planned and checked email with its business and domain, the held, and a run waiting for its owner.
    - It also answers one line of facts per lead the chain has a send for, bounded at 2,000. A chain plans at most 200 a run and one run a day, so 2,000 is ten days of a full run.
    - The route answers it beside the chain's DTO (`chainsOf`), so the strip's "of 30 today" is `chainPaceOf`'s share, the number the chain's row already says. Contracts turn both into words.
    - It is read when a search opens, again when the leads surface refreshes (an email leaving moves its lead to Contacted, which that surface already hears), and after a stop, an undo, a pause or a resume. It adds no realtime table.
  - **The strip** is a line of its own right under the finder's strip. Canvas board 06 draws it in place of the finder's strip, but that strip carries the band of piles (`leads-scope.jsx:503-508`), which stays. It says "Writing to 44 businesses · 18 of 30 today · next 11:12, Zilker Kettlebell Club · from mail.example.com", with the doors "How it's going" (the chain's Playbooks row) and Pause or Resume (the chain's own verbs, gated `approve`).
    - A paused chain says "Paused" and offers Resume.
    - A chain with nothing more today says "nothing more today".
    - A run waiting for its owner links to it.
  - **The Stage column** moves to sit beside the business in `LEAD_COLUMNS`, which is the spec's "Columns puts the Stage beside the name". It stays off by default and chosen in Columns: no mechanism for the owner to order columns is added.
  - **The Stage cell's detail line**, and the phone card's, read the lead's line: "Written Tue · nudged Sat", "Wrote back Thu · interested", "Said no Wed", "Bounced Wed · address dropped", "Booked Thu 1:30 PM", "Written Wed · away until Oct 2", "Not now · until Jan 12" (`leads.resume_at`), "Stopped Wed", "Today 11:12", "Tomorrow, when they open", "Held for your say".
    - A lead with no send has no line.
    - The words are contracts' `reachOutLineOf`, by the business's clock.
- **H9. The peek's block is read by lead.** `reach_out_lead_timeline(tenant, lead)` answers the lead's chain and search:
  - each of its sends (at most 20): when, which step, from which domain, its angle, and what became of it;
  - its readings (at most 10): when, the intent, whether it was undone, and whether the caller may undo it (00222's `reach_out_reply_undoable`, the one predicate);
  - `resume_at`, `booked_at`, `reach_out_stopped_at`, the person's email thread, and whether it may be stopped.

  The block, "Reach out · {chain}", is drawn in the peek under the fit. It is a line per email and per reply, and what is planned next. Its doors:
  - *Read what went out* opens the person's thread in the Inbox;
  - *Stop writing to them* (H10) asks first;
  - *Read as no · undo* shows while the reading may be undone, through the undo route Part 5 built.
- **H10. Stop writing to them: a member door, and a fact the send door reads.** `reach_out_lead_stop(p_lead_id)` is an acting member's door (owner, operator or partner, `is_acting_member`). It is refused for a lead the chain never planned ("Nothing has been written to them yet"), and does nothing twice. In one transaction it:
  - stamps `leads.reach_out_stopped_at`;
  - skips the lead's `planned` and `held` sends in live runs with the reason `owner_stopped`;
  - answers how many it skipped, and how many emails were already on their way.

  The stop then holds three ways, each the predicate that already owns its step:
  - `outreach_lead_facts` gains `stopped`. The send door refuses a stopped lead's email (`outreach_stopped`, a skip and never a wait), so an email already claimed or queued is skipped at the door. Only an email already handed to the provider goes, and the confirm says so.
  - `reach_out_followers` leaves a stopped lead out, so no later step reaches it. That also covers the hand step, which asks the followers and the same mapping.
  - The audience never takes it again: it leaves out any lead with a send (00220:163-166).

  The lead is not closed. It stays Contacted: stopping is not a no, and Said no and Not a fit stay the doors for one. There is no undo; the owner can still write to them from the Inbox. The chain row's hint changes to "To stop writing to one business, open its lead and press Stop writing to them." No event is written: `EVENT_KINDS` lives in `contracts/src/shared`, which this part does not touch. The stop is recorded on the lead and on each skipped send.
- **H11. A person's page reads the same read (H9) through the lead it came from.**
  - `leadOfPerson` (`server/leads/lead-searches.ts:369-386`) already finds the lead. It gains the lead's timeline as `PersonLeadDto.reach_out`, so the person reader (`server/readers/person.ts`, pinned and not this part's to edit) is untouched.
  - Contracts' timeline then:
    - names each reach-out email by its chain and step ("Reach out · Trainers in Austin", sub "Step 2 · angle: their rating · from mail.example.com · delivered") in place of "Your team";
    - adds the reading under the reply ("Read as interested · the chain stopped");
    - adds a Found row ("Found on Google Maps by “personal trainers in Austin” · address checked", with Open the lead).
  - The About rail gains "Reach out: {chain} · Talking · wrote back Thu".
  - Canvas board 15 also draws a hero line ("Wrote back to your reach-out Thu · interested · the receptionist's answer waits on you"). The hero's line is the thread's flag (`rightNowOf`), whose words Part 5 wrote (`EMAIL_REVIEW_WORDS.reach_out`), and it stays as it is.
- **H12. The day's numbers at 6 PM are a line in the bell.**
  - **What it is:** a notification of a new kind, `reach_out_day`. It is a bell row only: no push, and no email. Canvas board 12 says "6:00 PM, in Today", and an email a day is the digest the Settings page promises not to send.
  - **Who gets it:** each workspace with a reach-out, at 18:00 in its zone, on a day when a reach-out wrote an email, a reply was read, or an email waits for the owner's say.
  - **Who writes it:** the hourly playbooks sweep, which is requested every hour whatever is due (00048:127 schedules it at :05; 00086:141-146 asks the edge unconditionally). It asks one service-role read, `reach_out_day_due(now, limit)`, which answers each such workspace whose local hour is 18 with its numbers. The read leaves out a workspace already told that day: a `reach_out_day` row with `subject_id` = the local day. A second sweep in the same hour therefore writes nothing.
  - **The words:** "Today's reach-outs" over "18 written · 2 wrote back, 1 interested · 1 said no · 3 wait for your say", from contracts' `reachOutDayWords`, with its door to Campaigns › Playbooks. Booked is not in the line: a booking is stamped with its appointment's time (H2), never with the day it was seen.
  - **Settings › Notifications:** the Reach-outs group gains the row. The card's two sentences that the line would make untrue change in place, with no line added to `settings.jsx`, which is pinned at its length: "By email, the moment it happens." and "no daily or weekly digest."

### 0.3 Ruben's

None open for this part. Still his from before: D14 (a support address), the cold lane's secrets, the DKIM send, the cold-only domain (D17), and the allowance's price.

### 0.4 Out of Part 6, on purpose

- Opens and clicks (decision 8).
- The bulk bar's *Write to them* and your own list (Part 7).
- Realtime on `reach_out_sends`: Leads reads the lines when its own surface refreshes.
- An owner's column order: the Stage column moves once, in the code.
- The person page's hero line (H11).
- An undo of *Stop writing to them*.
- A reach-out's rows inside Campaigns' own tables (H3).

---

## 1. The facts this builds on (read 28 Sep 2026, at `18c03481`)

**Reports today.**
- The page shell is `apps/dashboard/src/legacy/pages/reports.jsx` (231 lines):
  - `useReports` reads `window.__REPORTS` (9-17);
  - the period control is `RP2_RANGES` (164) and `pick` (187-199);
  - it draws `<ReportsSections R={R} pick={pick}/>` and `<GoogleSection>` (221-222).
- `reports-sections.jsx` (408 lines) draws Campaigns (372-403): "From sent to replied", "Sent, day by day", and "By playbook and broadcast" (`RptSources`, 171-197, a row per playbook or broadcast, never a step).
  - `ReportsSections` is pinned at 206 lines and 39 branches (`baselines/complexity.json:552-556`).
  - `RptSection`, `ChartCard`, `BarList`, `BarChart`, `EmptyState` and `FailedRead` are on window.
- The bridge, `legacy-bridge/surfaces/reports.ts` (118 lines), makes two reads in `apply` (90-117): `GET reports` and `GET reports/campaigns`, the second's failure held as null.
- Campaigns' reader, `server/readers/campaign-report.ts`, calls `campaign_series` (latest `00174:128-256`), which counts `broadcast_recipients` only (159-170).
- Nothing in Reports names a reach-out.

**The chain's report.**
- `reach_out_chain_report(p_tenant_id, p_root_id)` is defined latest at `00228:388-466`, a stable definer function that checks membership:
  - `last_sent` is each lead's last sent send (412-418);
  - wrote back is `outreach_wrote_back` asked once (420-423);
  - wrote back and said no are credited to that step (424-430);
  - per step it counts written, delivered, bounced, waiting, held and handed (432-446);
  - it also answers the last five runs and `can_remove`.
- `chainReportOf` calls it (`server/campaigns/reach-outs.ts:159-171`), through `GET reach-outs/[id]`.
- Its DTO is `ReachOutStepCounts` (`contracts/src/reach-out/reach-out-dtos.ts:56-66`). Its words are `chainReportWordsOf`, whose head is "Step, When, Written, Delivered, Wrote back, Said no, Bounced" (`reach-out-sheet.ts:408-452`, head at 435), and `reportRowOf` (389-405).
- The row hint "To stop writing to one business, mark its lead Said no or Not a fit." is `REACH_OUT_SHEET_WORDS.stopOne` (`reach-out-sheet.ts:27`), drawn at `reach-out-row.jsx:70`.

**The rows a report counts.**
- `reach_out_sends` (`00183:123-149`; 00197 adds `opening`, `angle` and the check's columns; 00228 adds `handed`) has `root_id`, `playbook_id`, `lead_id`, `contact_id`, `domain_id`, `state`, `reason`, `send_at`, `sent_at` and `message_id`. Members may select it (`00183:186-191`).
- `reach_out_replies` (`00222:42-71`) has `lead_id`, `lead_contact_id`, `send_id`, `claim`, `intent`, `summary`, `until_at`, `read_at` and `undone_at`. Its indexes (72-81) do not include `lead_id`.
- A permanent bounce is `m.status = 'failed' and m.error->>'provider' = 'bounced' and lower(m.error->>'kind') = 'permanent'` (`sending_domain_counts`, 00220:343-344). A complaint is `m.meta->'email'->>'complained_at'` (00176:48).
- `sending_domains` has `host`, `state`, `held_why` and `held_at` (00175; 00178; 00188). Contracts words a hold in `domainHoldWords` (`contracts/src/email/sending-domains.ts:468`).

**Booked.**
- `reach_out_booked(p_tenant_id, p_seen)` (`00227:21-88`) matches an appointment's address or number to a lead, or to the lead's person, when the appointment starts after an email of the reach-out left.
- It converts through `lead_convert_by(…, 'booking', {start})`, and only for `ready` or `nurture` (`:70`).
- `lead_convert_by` writes `lead.converted {how}` only when it moves the lead (`00220:480-497`).
- The edge's caller reads only the count (`apps/edge/lib/calendar/reach-out-booked.ts:15-28`).
- There is no `leads.booked_at`.

**Leads.**
- `LeadsReal` (`leads-real.jsx:545-619`) builds the cell context with `leadCellCtxFor` (17-31) and the list's props with `leadsListProps` (623-645). It is not pinned; the file has 15 lines of room under 800.
- `LEAD_COLUMNS` (`leads-cells.jsx:273-305`) puts Stage seventh and off (298), as `cell(l, x)` with `x` the context. `ldCardCell` (314-353) is the phone's card.
- `LeadsScope` draws the finder's strip (`leads-scope.jsx:503-508`) and the peek (612-637). It is pinned at 326 lines and 62 branches.
- `LeadPeekInfo` (`leads-peek.jsx:404-572`) draws the peek's body. It is pinned at 169 lines and 26 branches.
- No surface on Leads reads a send. `leads_page` (`00212:39-124`) and `readLeadOne` (`packages/db/src/repositories/leads.ts:17`) leave out `resume_at`.
- There is no member door that stops one lead's chain. Only `reach_out_reply_apply` skips a lead's open sends (`00222:437-450`), and `reach_out_send_decide` acts on one send (`00211:450-501`).
- `ReachOutReplyDto` has no `lead_id` (`reach-out-reply-words.ts:38-70`). `__replies.undo(messageId)` is the undo (`legacy-bridge/reach-out/replies.ts:62`).

**The send door and the followers.**
- `outreach_facts` is `outreach_lead_facts(…) || {domain, sent_since}` (`00184:153-180`). So a fact added to `outreach_lead_facts` (latest `00226:26-62`) reaches the door.
- Contracts' `outreachRefusalOf` maps the facts: not a lead, closed, suppressed, wrote back, away (`reach-out-rules.ts:19-35`).
- The refusals and their words are `DELIVERY_REFUSALS` and `PURPOSE_REFUSALS` (`consent/consent.ts:127, 167`), and a skip's reason words are `run-words.ts:66`.
- The fact's reader is `outreachFactsOf` (`packages/db/src/repositories/outreach.ts:23, 65-66`).
- The mapping's callers are `deliver.ts:388`, `run-reach-out.ts:48` and `run-hand-step.ts:14`.
- `reach_out_followers` (`00226:73-107`) filters on the facts before its limit.
- `reach_out_audience` never takes a lead with a send, bar one in a canceled run (`00220:163-166`).

**A person's page.**
- `client-profile.jsx` is pinned at 1,839 lines.
- History is contracts' `timelineOf` (`people/person-timeline.ts:365-378`) over eight builders:
  - `messageItems` (172-202) names a message's speaker "Your team" unless it is a broadcast run's;
  - `addedItems` (357-362) writes "Added from a lead you found".
- The About rail's facts are `aboutOf` (`people/person-cards.ts:468-481`), and `leadOf` (526-540) gives "Open the lead".
- `leadOfPerson` answers `{id, business_name, found_at}`. `PersonLeadDto` is `people/person-dto.ts:197`.
- `contracts/src/people/` holds exactly 20 modules, so no new module goes there.

**Notifications and the sweep.**
- `recordNotification(tenantId, {kind, title, body, route, about})` writes the bell's row only: no push and no mail (`apps/edge/lib/ops/notify.ts:194-226`). An unknown kind is kept as `alert` (:201).
- The kinds are `SERVER_NOTIFICATION_KINDS` (`contracts/src/today/notifications.ts:209-232`), the CHECK (latest `00222:153-155`), `SERVER_LOOK` (360-402) and `PUSH_KINDS` (`today/push.ts:48-61`).
- Settings' rows are `NOTIFICATION_KIND_GROUPS` (`today/notification-kinds.ts:19-71`), drawn by `settings.jsx:1584-1611`. `settings.jsx:1587` says "By email, the moment it happens." and `:1620` says "No text-message alerts, and no daily or weekly digest. Today is the brief."
- The playbooks sweep (`apps/edge/api/cron/playbooks.ts`) is requested every hour at :05 (00048:127; its trigger, 00086:141-146, asks the edge whatever is due) and reads each workspace's zone through `tenantZoneOf`.
- A notification's `subject_type` and `subject_id` are the `about` a row names (00057:14-25).

**The sizes this plan must keep.**
- `packages/db/src/repositories/` is at 20 modules, and `reach-out.ts` is at 800 lines. New reads go in `outreach.ts` (409 lines), or are called as rpcs from the dashboard's `server/campaigns/`, as `chainReportOf` is.
- `apps/dashboard/src/server/readers/` belongs to the Ask Rewired session and is not edited here. The report's route answers from `server/campaigns/`, as `GET reach-outs/reach` does.
- `contracts/src/shared` is not edited. `contracts/src/reach-out/` holds 18 modules, and `contracts/src/reports/` holds 4 and is a limited tree (`eslint.config.mjs:159`).
- `pages/reach-out/` holds 6 modules. `legacy/pages` and `legacy-bridge` are pinned at 75 and 56, so no new module goes at their roots.
- A new page file is named in `legacy-bridge/manifest.ts` and `legacy/Chanlytics.html`.

---

## 2. Files

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00241_what_comes_back_from_a_reach_out.sql` (new) | `leads.booked_at`, `leads.reach_out_stopped_at`; `reach_out_booked`, `reach_out_chain_report`, `outreach_lead_facts` and `reach_out_followers` re-created whole; `reach_out_report`, `reach_out_search_lines`, `reach_out_lead_timeline`, `reach_out_lead_stop`, `reach_out_day_due`; `reach_out_replies_lead`; the notifications kind CHECK |
| `packages/contracts/src/reports/reach-out-report.ts` (new) | `ReachOutReportDto`, `toReachOutReportVM`, `reachOutDayWords` |
| `packages/contracts/src/reach-out/reach-out-leads.ts` (new) | The lines' and the timeline's DTOs; `reachOutLineOf`, `reachOutStripOf`, `reachOutTimelineOf`, `reachOutPersonOf`; the stop's words |
| `packages/contracts/src/reach-out/reach-out-dtos.ts`, `reach-out-sheet.ts` | `interested` and `booked` per step; the table's head; `stopOne` |
| `packages/contracts/src/reach-out/reach-out-rules.ts`, `consent/consent.ts`, `broadcasts/run-words.ts` | `stopped`, `outreach_stopped` and its words |
| `packages/contracts/src/today/notifications.ts`, `notification-kinds.ts` | `reach_out_day`, its look, Settings' row |
| `packages/contracts/src/people/person-dto.ts`, `person-timeline.ts`, `person-cards.ts` | `PersonLeadDto.reach_out`; the rows; the About fact |
| `packages/db/src/repositories/outreach.ts` | `stopped` in the facts; `reachOutDayDue` |
| `packages/core/src/deliver.ts`, `campaigns/run-reach-out.ts`, `campaigns/run-hand-step.ts` | Hand `stopped` to `outreachRefusalOf` |
| `apps/dashboard/src/server/campaigns/reach-out-report.ts` (new) | The report's read |
| `apps/dashboard/src/server/campaigns/reach-out-leads.ts` (new) | The lines with the chain, a lead's timeline, the stop |
| `apps/dashboard/app/api/v1/reports/reach-outs/route.ts`, `reach-outs/leads/route.ts`, `reach-outs/leads/[id]/stop/route.ts` (new) | The routes; `route-policy.json`; the generated client |
| `apps/dashboard/src/server/leads/lead-searches.ts` | `leadOfPerson` carries the lead's timeline |
| `apps/dashboard/src/legacy-bridge/surfaces/reports.ts` | `__REPORTS.reachOuts` |
| `apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts` | `leadLines`, `leadTimeline`, `stopLead`, and the words |
| `apps/dashboard/src/legacy/pages/reach-out/reach-out-report.jsx` (new) | The Reports section |
| `apps/dashboard/src/legacy/pages/reach-out/reach-out-leads.jsx` (new) | `useReachOutLeads`, the strip, the Stage line, the peek's block |
| `apps/dashboard/src/legacy/pages/reports.jsx`, `leads-real.jsx`, `leads-cells.jsx`, `leads-scope.jsx`, `leads-peek.jsx`, `settings.jsx` | One mount each; the Stage column's place; two sentences |
| `apps/edge/lib/reach-out/day-numbers.ts` (new), `apps/edge/api/cron/playbooks.ts`, `apps/edge/lib/log-events.ts` | The 6 PM line |
| `docs/debt.md`, `tooling/scripts/tests/baselines/*` | The rises, each with its row |
| `tooling/scripts/tests/reach-out-back/*` (new directory) | The words, the pages, the routes, the sweep, and the stack |

---

## PR 2 — What comes back (`reach-out-6-what-comes-back`, 00241)

**What changes for a customer:**
- Reports shows what each reach-out wrote and what came back.
- Playbooks' chain row counts the interested and the booked.
- Leads shows a reach-out writing to the open search, and where each business stands.
- The peek shows a lead's emails, and can stop the chain for that business.
- A person's page names the reach-out's emails and how each reply was read.
- At 6 PM the bell says the day's numbers.

> **As built** (28 Sep 2026, on `main` at `00e310ef`, which the branch merged, after one combined review whose findings
> are folded in below). What departed from the tasks, and why:
>
> - **Written is an email that left, spelled once (00179's `email_left`).** The review found that the clock settles a
>   send whose email bounced before it was read sent as `failed` with no `sent_at` (`lib/reach-out/clock.ts:139-141`),
>   so counting `state = 'sent'` lost exactly the fast hard bounces from Written and Bounced. Every count here, and the
>   chain's report (its steps' and its runs' written), now reads a send as written when it is `sent`, or `failed` with
>   an email that left, dated by when it left (`email_sent_at`). Part 4's chain-report test moves with it (4 written,
>   not 3: the bounce left too).
> - **Interested is a person's.** A reading of an automatic reply as interested changes nothing (`automaticPlan`), so
>   the chain's report, Reports, the lines and the 6 PM line all leave `auto_reply` out.
> - **What a reading did is its door's record.** The lead's story and a person's rows read the reading's own plan
>   (`reach_out_replies.plan`: stops, convert, saidNo) rather than work its effects out again, so an automatic reply that
>   changed nothing says "nothing changed".
> - **A skip's words are the run's.** `skippedReasonWords` (`reach-out-approval.ts`) is exported, falls back to the
>   refusals' short words (`HELD_REASONS`), and the story reads it: one set of words for why a send was skipped.
> - **The stop** takes its lead's row lock only after the caller is known to act in its workspace; its confirm says "No
>   reach-out writes to them again". A test at the door proves a stopped lead's email is refused `outreach_stopped`, a
>   skip, and that a database before 00241 answers without the fact.
> - **"Bounced · address dropped"** only when the lead's address is invalid (a permanent bounce, C11); any other bounce
>   says "Bounced" and the day. The lines carry the lead's `email_state`.
> - **The About rail** says the stage too ("Salons in Miami · Talking · wrote back Thu · a question").
> - **Reports' sources table** has a Bounced column, as §4.10 lists.
> - **The 6 PM line** is due from 18:00 on, not at 18 only: a sweep that failed at its 18:05 is made good at 19:05, and
>   the told-today check still sends it once. It reads a page of 50 at a time, at most ten pages, inside the sweep's
>   fifty seconds.
> - **The strip** says "nothing more planned yet" when no email is planned, and never shows the last search's reach-out
>   while the next one is read.
> - **Deploy order.** 00241 went to production first. Both apps deploy from the merge; for the minutes an older edge
>   runs, a stopped lead's email already claimed or queued is not refused at the door (it reads no `stopped`), while
>   its planned and held emails are skipped and no later step reaches it, both in SQL.
> - **Checks.** The workspace route's JavaScript rises past its 1% band: main measured 976.1 KB gzipped, this adds 6.3 KB,
>   and the budget goes 972.4 → 982.4 KB with its row under "Rises" in `docs/debt.md` (the shell imports every page at
>   once and contracts is one bundle, so nothing keeps the new pages off the route).
>   `LeadsScope` and `LeadPeekInfo` rose by one line each and the window publishers by two, each with its row under
>   "Rises" in `docs/debt.md`.

### Task 2.1: The migration

**Files:** Create `supabase/migrations/00241_what_comes_back_from_a_reach_out.sql`.

- [ ] **The columns.** Add `booked_at timestamptz` and `reach_out_stopped_at timestamptz` to `leads`, under `set local lock_timeout = '3s'` with 00220's check that the file ran inside a transaction. Comment each.
- [ ] **`reach_out_replies_lead`:** an index on `(tenant_id, lead_id) where lead_id is not null`. The report, the lines and the timeline each ask a lead's readings.
- [ ] **`reach_out_booked`**, re-created from 00227's body whole:
  - the matched leads are `ready`, `nurture` or `converted`;
  - each gets `booked_at = coalesce(booked_at, start)`;
  - `lead_convert_by(…, 'booking', {start})` runs only for `ready` and `nurture`;
  - it answers how many moved, as before.
- [ ] **`reach_out_chain_report`**, re-created from 00228's body whole:
  - `last_sent` gains `booked_at`;
  - `answered` gains `interested` (a reading with this `lead_id`, not undone, of intent `interested` or `question`) and `booked` (`booked_at is not null`);
  - each step's object gains the two.
- [ ] **`outreach_lead_facts`**, re-created from 00226's body whole, with `stopped`: `p_lead_id is not null` and that lead's `reach_out_stopped_at is not null`.
- [ ] **`reach_out_followers`**, re-created from 00226's body whole, with `and not coalesce((f.facts->>'stopped')::boolean, false)`.
- [ ] **`reach_out_report(p_tenant_id uuid, p_days int) returns jsonb`**, stable, security definer.
  - It refuses a caller who is not a member (`P0002`) and a period not in (7, 30, 90) (`22023`).
  - The period is the last `p_days` days in the workspace's zone (`tenants.timezone`), today included.
  - It answers:
    - `{timezone, days, today, since}`;
    - `totals`: the counts of H1;
    - `series`: written per day, one entry per day;
    - `chains`: those with an email in the period, newest first, at most 20. Each has `{root_id, name, state, search, last_at, steps: [{id, n, hand, written, delivered, wrote_back, interested, booked, said_no, bounced, handed}]}`;
    - `angles`: the top 8, then `other` and `no_angle` (H4);
    - `domains`: `{host, state, held_why, held_at, sent, delivered, bounced, complained}`, with a removed domain's as `host null` (H5).
  - Wrote back is `outreach_wrote_back`, asked once for the period's leads.
- [ ] **`reach_out_search_lines(p_tenant_id uuid, p_search_id uuid) returns jsonb`**, stable, security definer, members only. It answers `null` when the search has no chain; otherwise:
  - the chain's facts (H8);
  - `leads`, at most 2,000, each `{lead_id, stage, closed_reason, sent, last_sent_at, next_at, held, bounced, reply: {intent, claim, read_at, undone} | null, resume_at, away_until, booked_at, stopped_at}`.

  Next is the earliest `planned` and checked send in a live run of a running chain.
- [ ] **`reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid) returns jsonb`**, stable, security definer, members only. It answers the lead's name, stage, `closed_reason`, `found_at`, `email_state`, search `{id, name, asked}`, chain `{root_id, name, state}`, `conversation_id`, `resume_at`, `booked_at` and `stopped_at`, plus:
  - `sends`, at most 20, in time order: `{id, n, hand, state, reason, send_at, sent_at, angle, host, message_id, email_status, bounced}`;
  - `readings`, at most 10, newest first: `{message_id, read_at, intent, claim, summary, undone, until_at, can_undo}`, where `can_undo` is `reach_out_reply_undoable(message_id) is null`;
  - `can_stop`: a chain has a send for it, and it is not stopped.

  It answers `null` for a lead it cannot find in the workspace.
- [ ] **`reach_out_lead_stop(p_lead_id uuid) returns jsonb`**, a session door (H10):
  - `28000` without a sign-in;
  - `P0002` for a lead the caller's acting membership does not hold;
  - `22023` "Nothing has been written to them yet." when no send names the lead.

  A lead already stopped answers `{stopped: false, already: true}`. Otherwise it answers `{stopped: true, skipped, leaving}`, where `leaving` is the lead's `claimed` and `queued` sends.
- [ ] **`reach_out_day_due(p_now timestamptz, p_limit int) returns table (tenant_id uuid, day date, numbers jsonb)`**, service role only. It answers each workspace with a reach-out chain that meets all of these:
  - its local hour at `p_now` is 18;
  - it has no `reach_out_day` notification whose `subject_id` is that local day;
  - it has a number above zero.

  `numbers` is `{written, wrote_back, interested, said_no, bounced, held}` since its local midnight: emails that left; readings of a person's reply (not `auto_reply`), of any intent; of them, `interested` or `question` not undone; `no` not undone; the day's emails that bounced; and holds in live runs. It answers at most `p_limit` rows.
- [ ] **The kind.** Re-issue `notifications_kind_check` (00222's list) with `reach_out_day`.
- [ ] Revoke each function from `public` and `anon`. Grant each member read and the door to `authenticated` and `service_role`; grant `reach_out_day_due` to `service_role` only. Comment each function. Every statement re-runs.

### Task 2.2: The words (contracts)

- [ ] **`reports/reach-out-report.ts`:**
  - `toReachOutReportVM(dto)` answers the funnel's rows, the angles' rows with their note, the domains' rows with their state in `domainHoldWords`' words, the day points and their table, the sources' rows (a chain, then its steps, each step labelled as the chain's row labels it), and a line per card.
  - A reach-out with nothing written in the period is `empty`, and says so.
  - `reachOutDayWords(numbers)` answers `{title, body}`, with no clause for a zero.
- [ ] **`reach-out/reach-out-leads.ts`:**
  - `reachOutLineOf(line, nowMs, tz)`: H8's line, in the business's calendar;
  - `reachOutStripOf(lines, chain, nowMs, tz)`: H8's strip, with the share from `chainPaceOf`;
  - `reachOutTimelineOf(timeline, nowMs, tz)`: H9's rows and doors;
  - `reachOutPersonOf(timeline, …)`: H11's words for a message, a reading, the Found row and the About fact;
  - `REACH_OUT_STOP_WORDS`: the confirm, the done and the refused.
- [ ] **The chain's row:** `ReachOutStepCounts` gains `interested?` and `booked?` (absent from a report read before 00241). `chainReportWordsOf`'s head and `reportRowOf` gain the two, and `stopOne` changes to H10's words.
- [ ] **The stop at the door:** `OutreachLeadFacts.stopped` (optional, false when absent); `outreachRefusalOf` answers `outreach_stopped` after `away`; the refusal and its words go in `consent.ts`, and the skip's words ("you stopped writing to them") in `run-words.ts`.
- [ ] **The kind:** `SERVER_NOTIFICATION_KINDS` gains `reach_out_day`; `SERVER_LOOK` gains its look; `PUSH_KINDS` does not take it. `NOTIFICATION_KIND_GROUPS`' Reach-outs group gains "The day's numbers", whose `what` says the bell, 6 PM, the business's zone, and "not emailed".
- [ ] **A person:** `PersonLeadDto.reach_out?: ReachOutLeadTimelineDto | null`; `messageItems`, a Found row, and `aboutOf` read it (H11).

### Task 2.3: The dashboard's reads and door

- [ ] `server/campaigns/reach-out-report.ts`: `reachOutReportOf(ctx, tenantId, days)` over `reach_out_report`.
- [ ] `server/campaigns/reach-out-leads.ts`:
  - `leadLinesOf(ctx, tenantId, searchId)`: the lines, with the chain from `chainsOf` by its root;
  - `leadTimelineOf(ctx, tenantId, leadId)`;
  - `stopLead(ctx, leadId)`, whose refusals go through `reachOutRefusal`.
- [ ] The routes, each declared with `route()`, with its row in `route-policy.json` and the client regenerated (`node tooling/scripts/gen/route-types.mjs`):
  - `GET reports/reach-outs?days=`: any member, as `reports/campaigns`;
  - `GET reach-outs/leads?search=` or `?lead=`: any member, exactly one of the two;
  - `POST reach-outs/leads/[id]/stop`: operator, rate `playbook`.
- [ ] `leadOfPerson` asks `reach_out_lead_timeline` for the lead it found and carries it as `reach_out`. A failed read is `null`, never a failed page.

### Task 2.4: The pages

- [ ] **Reports:**
  - `surfaces/reports.ts` makes a third read, `GET reports/reach-outs`, whose failure is `null`, and publishes `reachOuts`.
  - `pages/reach-out/reach-out-report.jsx` draws H3's section with the shared cards.
  - `reports.jsx` mounts it after `ReportsSections`, by one guarded line.
- [ ] **Leads:**
  - `__reachOuts` gains `leadLines(searchId)`, `leadTimeline(leadId)` and `stopLead(leadId)`, and its words gain the leads module's.
  - `pages/reach-out/reach-out-leads.jsx` holds:
    - `useReachOutLeads(searchId)`, which reads again on `surface:leads` and after its own doors;
    - `ReachOutLeadsStrip`;
    - `ReachOutStageLine`;
    - `LeadReachOut` (the peek's block).
  - `LeadsReal` calls the hook for the open search and hands the lines to `leadCellCtxFor` and to `leadsListProps`.
  - `LEAD_COLUMNS` moves `stage` after `business`, and its cell and `ldCardCell` draw the line.
  - `LeadsScope` mounts the strip under the finder's strip, and `LeadPeekInfo` mounts the block under the fit, one guarded line each.
- [ ] **Settings:** the two sentences change in place (H12).
- [ ] The two new files are named in `manifest.ts` and `Chanlytics.html`. The pages use only classes the stylesheets already have, and the PR lists each drawn change.

### Task 2.5: The 6 PM line

- [ ] `packages/db` `outreach.ts`: `reachOutDayDue(db, now, limit)`.
- [ ] `apps/edge/lib/reach-out/day-numbers.ts`: `tellReachOutDays(db, now, log)`.
  - It reads the due workspaces (at most 50).
  - For each, it writes `recordNotification(tenant, {kind: 'reach_out_day', …reachOutDayWords(numbers), route: 'outbound', about: {type: 'reach_out_day', id: day}})`.
  - A failed read is logged and tells nobody (`reach_out_day_failed`). Each told workspace is logged (`reach_out_day_told`), and both events join `LOG_EVENTS`.
- [ ] `api/cron/playbooks.ts` calls it after the reach-outs and counts `told` in its answer.

### Task 2.6: Tests

- [ ] `tooling/scripts/tests/reach-out-back/` (new):
  - `report-words.test.mjs`: the VM over DTOs of every shape, empty, a removed domain, `other` and `no_angle`, and the day's words;
  - `lead-lines.test.mjs`: each line of H8 in its zone, including a clock change, the strip's states, the timeline's rows and doors, and a person's rows;
  - `back-pages.test.mjs`: the Reports section, the strip, the Stage line and the peek's block in the legacy harness, as `reply-strip-page.test.mjs` draws;
  - `back-routes.test.mjs`: the three routes over the fake db, and their policies;
  - `day-numbers.test.mjs`: the edge's teller over the fake db (told once, a failed read tells nobody), and the sweep's answer;
  - `what-comes-back.db.test.mjs`, on a stack, through the real functions:
    - a chain writes to four businesses;
    - one replies interested and books; one says no; one bounces; one is stopped;
    - the report, the chain's report, the lines, the timeline and the day's numbers each count them as H1 says;
    - the stop skips a planned send, and the door's facts say `stopped`;
    - a later step's followers leave the stopped lead out;
    - a booking stamps a Talking lead without a second conversion;
    - a stranger is refused each read;
    - each re-created function's body equals its source's but for the lines H2, H7 and H10 change.
- [ ] The existing suites that pin a changed thing move with it: the chain report's words, the Settings rows, the kinds' lists, the Stage column's order, and the door's refusal list.

### Task 2.7: The docs

- [ ] **The spec:** its status line (Part 6 shipped, Part 7 next); "As built (Part 6)" notes in §4.9 (the 6 PM line), §4.10 and §4.11; §6's item 6 with its PR and migration.
- [ ] **This plan:** its As-built table and PR 2's note.
- [ ] **The glossary:** Stopped (a lead a reach-out no longer writes to).

---

## Spec coverage

| Spec | Where it lands |
| --- | --- |
| §4.10 per reach-out and per step: written, delivered, wrote back, interested, booked, said no, bounced | H1, H3, H7 (Task 2.1, 2.2, 2.4) |
| §4.10 replies by angle | H4 |
| §4.10 sends by domain, their rates, the domain's state | H5 |
| §4.10 written by day | H3 ("Written, day by day") |
| §4.10 the sources table shows each step on its own line | H3 ("By reach-out and step") |
| §4.10 no opens or clicks | §0.1 |
| §4.11 Leads while it writes: the strip | H8 |
| §4.11 Columns puts the Stage beside the name, with a detail line | H8 |
| §4.11 the peek's timeline, *Read what went out*, *Stop writing to them* | H9, H10 |
| §4.7 read as no · undo, on the lead | H9 (Part 5's door and route) |
| §4.7 booked | H2 (the stamp), Part 5 (the stop) |
| §4.9 the day's numbers at 6 PM (N2) | H12 |
| §6.6 the person page's rows | H11 |
| Part 4 F14: interested and booked on the chain's report | H7 |

## Self-review (28 Sep 2026)

- **One predicate per rule.** Wrote back is `outreach_wrote_back` in every count. A stop is one fact, `stopped` in `outreach_lead_facts`, which the door, the followers and the hand step read through their existing paths. Undo eligibility is `reach_out_reply_undoable`. A lead's conversion stays `lead_convert_by`; `booked_at` is a stamp, not a second converter.
- **One send door.** Nothing here sends. The stop only refuses more.
- **Bounded reads.** Every read is one SQL function with its own limit (20 chains, 8 angles, 2,000 lines, 20 sends, 10 readings, 50 workspaces a tick). No read takes an `.in()` list of ids.
- **Either deploy order.** 00241 goes first. The dashboard's new reads each fail alone, into their own "could not be read". An older edge reads no `stopped`, and the SQL halves of the stop still hold.
- **Ratchets.**
  - `LeadsScope` and `LeadPeekInfo` rise by one guarded line each, and the window publishers by the two new files. Each is banked with its row under "Rises" in `docs/debt.md`, in the same PR.
  - No capped directory gains a module: the tests are a new directory, the reads sit in `server/campaigns/`, and the words in `reach-out/` (19) and `reports/` (5).
  - `settings.jsx` changes two sentences in place.
- **What I could not see.** The canvas's boards are read from their builder, not drawn. PR 2 draws the pages on the real app before it merges.
