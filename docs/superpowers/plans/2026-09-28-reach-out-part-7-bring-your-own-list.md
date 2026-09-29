# Reach out, Part 7: bring your own list — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reach-out can write to leads the finder did not find:
- **A file of your own.** On Leads, *Import leads* reads a CSV (a business name and an email on each row, and a phone, a website, a city, a state or a category where the file has them). The rows become a search of their own, named by the owner. Every address is checked first, by the finder's own mailbox check, and only an address that checks out is a lead a reach-out may write to. *Write to the N ready* then opens the reach-out sheet on it, as on any search.
- **Leads you chose.** The bulk bar's *Write to them* makes the selected leads a search of their own and opens the reach-out sheet on it.
- **A search with no finder plan draws.** Leads draws such a search with its own line (checking, then how many checked out), never the finder's strip, map or *Find new ones*; the page no longer throws on a search with no round.

**Architecture:** One migration, **00242**, and nothing else in the schema beyond it:
- `lead_searches.via` gains `import` and `chosen`;
- two member doors, `lead_search_import` (a file's rows) and `lead_search_choose` (chosen leads);
- `lead_rounds_notify` re-created whole, so a file's check ends with a line in the bell in its own words and a choice rings nothing.

A file's search runs the finder's check round unchanged: a round in `checking`, its members in Needs review with the one reason `email:checking`, and a `lead_check` job; `check()` (`core/leads/runner/check.ts`) and `lead_check_commit` (00145) do the rest, as for a found lead. Contracts gain one module, `leads/lead-import.ts`: the file's columns, its rows, the doors' bodies and every word. The dashboard gains two routes, and the page's pieces join `pages/reach-out/reach-out-leads.jsx` (Part 6's Leads file, which already publishes on window), reached through `window.__reachOuts.lists` and mounted by one hook in `leads-real.jsx`. The edge reads a round's members' leads in parts.

**Tech Stack:** Postgres (a Supabase migration, plpgsql definer functions), TypeScript packages (contracts pure), the edge's lead runner, the dashboard's app-plane routes (`route()`), the legacy JSX shell fed through `legacy-bridge`, node:test over `_fake-db.mjs`, the legacy page harness, and a replayed local stack (`*.db.test.mjs`).

**Status:** Written 28 Sep 2026 against `main` at `d95d8777` (Parts 1–6 complete; the newest migration on main and in production is 00254). Every file:line in §1 was read at that commit. The spec (`docs/superpowers/specs/2026-09-25-reach-out-design.md`) is approved, with its §9 (decision 6: "Your own CSV of leads as an audience, after the finder's. Recommended: yes, later"). Ruben approved this part end to end on 28 Sep 2026 ("everything you ultimately suggest is approved"), and on 28 Sep ordered it as **one pull request**: this plan, the code, the tests and the spec's notes together, pushed once. So §0.2's decisions are this plan's to take, and none waits on him.

**Migrations:** 00242 is this plan's number: this lane holds 00241–00244, 00241 is Part 6's, and the others' lanes took 00245 and 00250 on. The production ledger's head is 00254, so the push names `--include-all`, as 00241's did. The number is checked again right before the dry run.

**Deploy order:** 00242 first, pushed to production before the merge. Then either app, in either order:
- A dashboard ahead of the edge imports a file whose check the older edge runs as it runs any round's, but for a list over about 200 addresses: the older edge's one read of its leads fails, and should the edge still be the older one an hour on, the leads sweep ends the round `source_failed`; the bell then says the list could not be checked and its addresses wait in Needs review for *Check again*. Both apps deploy from the one merge, minutes apart.
- An edge ahead of the dashboard changes nothing a customer sees.

**As built** (29 Sep 2026, after one combined review whose findings are folded into §0.2 and listed here). What
departed from the first draft, and why:

- **A joined lead sits outside the round** (J4, J7). The review found that *Remove the ones you haven't touched*
  (`lead_search_undo`, 00142) gives back every untouched counted member of a search's latest round: a lead a list joined
  already counted, inside that round, would have handed the month a lead it never drew, and a chosen list 500 at a press.
  Such a member now has no round, so the round is the check's alone: its bell counts what the check answered, Undo gives
  back exactly what the list drew, and a chosen list offers no Undo at all (`leadUndoable`).
- **One business is written to once** (J4). A new lead that shares a number or a website with another of the
  workspace's leads (one found, or an earlier row of the file) carries the share the finder marks (00237), which the
  audience never writes to. A lead another round is checking is left out ("being checked in another search"), since
  that round's check waits for exactly the addresses it asked.
- **The estimate has a floor** (J3): the door reserves at least the checker run's $0.50, whatever the caller sends.
- **A failed check says so** (J11): a file's round that ends any other way than checked (searching paused, the checker
  failed) rings "Your list … could not be checked" and "Its addresses wait in Needs review."
- **A lead a list brought is from your list** (J8): the peek, the row's card and a person's page say "From your list",
  never Google Maps; 00241's `reach_out_lead_timeline` is re-created whole with one key, `found_on_listing`.
- **Leads reads one row per lead**: with no search named, `leads_page` answers a row per membership, so a chosen lead
  came twice on All leads; the bridge keeps the first of each on every page it reads.
- **A list draws no map** and its strip's pile opens Needs review; the strip claims no progress, since a lead the list
  joined counted is ready before the check answers.
- **A choice is named by its day** ("Chosen on Sep 28"), not by the selection's count, which the door may cut.
- **J9 is one door**: `/answer` needs no refusal, since a list's round never waits for an answer.
- **The pieces joined Part 6's file**: `pages/reach-out/reach-out-leads.jsx` already publishes on window, which the
  window-publishers ratchet asks new names to join.
- **Numbers:** 00242 was free at the dry run. A file of 500 rows takes well under a second on the stack, inside a
  signed-in member's 8 s statement timeout.

| PR  | Branch                              | What                                                      | Migration |
| --- | ----------------------------------- | --------------------------------------------------------- | --------- |
| 1   | `reach-out-7-bring-your-own-list`   | This plan, the code, the tests and the spec's as-built notes | 00242     |

The PR runs this sequence: implement; one combined review, then fix what it finds; the gate (`corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`, prettier, dead exports, `check:dist`); `origin/main` merged in locally; 00242 pushed to production (dry run, push, read back); one push; green CI; squash-merge.

---

## 0. What is decided, and what this plan decides

### 0.1 Approved, and kept here

- **§6 item 7:** bring your own list: leads from a CSV, checked first, as a search. One PR.
- **§4.2:** a selection on Leads gets the same door in the bulk bar. Part 4's F12 moved *Write to them* here: "a chain's audience is a search, and chosen leads are Part 7's own list".
- **The audience is unchanged** (`reach_out_audience`, 00220:124-170): a search's counted, qualified, ready members with a checked address, never a customer's, never on the never-again list, never written to by another chain. A list is a search, so every rule holds for it with no second audience.
- **0010:** leads are paid for per verified lead, and the month's allowance moves only when a lead is counted.

### 0.2 This plan's own (J1–J12), with why

- **J1. A list is a search.** `lead_searches.via` gains `import` (a file) and `chosen` (a selection). The reach-out's door, sheet, run, check, approval, strip, lines and reports then take it as they take a found search, with no second audience kind and no change to any of them. `card` stays `local_businesses`, since the check reads its checker by card (`check.ts:48`).
- **J2. Checked first, by the finder's check.** A file's search gets one round, made `queued → running → checking` in the door (the guard's moves, 00140:703-735), its members in Needs review with the one reason `email:checking`, and a `lead_check` job for it. `check()` and `lead_check_commit` (00145:272-378) run unchanged: an address that checks `ok` makes its member Qualified and counted; any other answer leaves it in Needs review, where *Check again* works as for a found lead. The round ends by the check's last batch, as a found round does.
- **J3. What a list costs.** An address that checks out counts as one of the month's leads, as a found lead does (0010: paid per verified lead). The door reserves one lead per address it checks and the check's cost (a cent an address at most, `checkPerEmailUsd` × the margin, never under $0.50: `check.ts`'s own cap, which the door holds whatever the caller sends) from the month's and the day's searching, in `lead_reserve`; what does not check out goes back when the round ends (`lead_round_end`). A file with more addresses than the month has left is refused with the number left, and nothing is written. The alternative, free imports, was not taken: `counted` would mean two things, and a cold list would have no cap but the domains'.
- **J4. A row needs a business name and an email.** A reach-out writes email, and the opening names the business. The page leaves out a row without either, or with an address that is not one, and says how many; the door leaves out an address a person in People holds (as theirs, as one they wrote from, or by the row's number), one on the never-again list, and a second row with the same address, and says how many of each. An address already a lead in the workspace joins as that lead, never a copy, and the row changes nothing of what it holds: counted in a kept search, it joins counted and outside the check's round; one another round is checking now is left out ("being checked in another search"); any other is checked again. A new lead that shares a number or a website with another of the workspace's leads carries the finder's share mark, so one business is written to once.
- **J5. At most 500 rows a file** (`CHECK_BATCH`, one checker run), a name of 1–120 characters (the default the file's name), and *Who are they?* of at most 400 (the search's `asked`, which the opening reads as what the owner asked for; the name when blank).
- **J6. Who may.** Importing spends the check, so it is the finder's: `find` (owner or partner) and a workspace that may spend (`SPEND_LEADS`), rate `lead_search`, as `POST lead-searches`. Choosing spends nothing and exists to be written to, so it is the reach-out's own permission, `approve`, rate `lead_bulk`.
- **J7. Write to them.** The chosen leads become a search named "Chosen on Sep 28" (Rename changes it) and the reach-out sheet opens on it. Only a lead already counted in one of the workspace's searches joins, Qualified and counted in the new one without drawing the month again (one lead, one charge), outside its round, so Remove the ones you haven't touched has nothing to give back and is not offered; any other is left out and said ("not yet counted: keep them first"). At most 500 a press, from the rows shown. Its round is made and ended in the door (`queued → ended`, `target_reached`), so the view carries its counts and nothing is checked. The spec's three offers are one door: a chain's audience is a search, so adding chosen leads to another chain would change what that chain's search found, and *once* is a chain of one step, which the sheet already makes (Remove on the last step).
- **J8. Leads draws a search with no finder plan.** A list's `plan` holds the plan's shape without an area (`criteria: []`, `exclusions: []`, `terms: []`, `list: 'import' | 'chosen'`), and the DTO carries `via`. For a list the page draws contracts' `leadListStripOf` in the finder's strip's place, and no map, nearby, *Find new ones* or *Search again, changed* (the rail's menu leaves them out). Three reads that threw on a search with no round or no area are guarded: `leads-real.jsx:635` (the phone bar's count) and `:385` (an answer's exclusions) in place, and a plan carrying `list` never reaches `ldStripOf` (`leads-finder.jsx:528`), whose `planWho` read the area, whether or not the bridge is there.
- **J9. The door that searches again refuses a list.** `POST lead-searches/:id/more` refuses a list in words ("A list of your own is not searched again.") before its door, so a finder plan never lands on it. `/answer` needs none: a list's round never waits for an answer.
- **J10. The edge reads a round's leads in parts.** `membersOfRound` (`apps/edge/lib/leads/lead-db.ts:171-215`) read every member's lead in one `.in()`; PostgREST's URL fails past about 208 ids, and a list's round holds up to 500. It reads them 150 at a time.
- **J11. The bell.** `lead_rounds_notify` (00163) is re-created whole with one change: a round of a file's search rings "Your list <name> is checked" with "N have a checked address" when its check ends, or "could not be checked" with "Its addresses wait in Needs review." when it ended any other way, and a round of a chosen search rings nothing (it ends as it is made). Every other round rings as before.
- **J12. Where it is.** *Import leads* sits in the rail's foot beside *New search*, on a desk and in a phone's Lists sheet, gated `find`. Its sheet is People's import's shape (the record kit's sheet, the file or the pasted rows, the counts and a taste before anything is written), with the name and *Who are they?* fields. *Write to them* sits in the bulk bar after *Copy emails*, and on a phone in the bar's sheet, gated `approve`. New rows use existing classes (`rec-field`, `pl-import-*`, `btn`, `pp-sheet-row`); no stylesheet changes.

---

## 1. Facts, read at `d95d8777`

- `lead_searches` (00140:82-93): `via` CHECK `('people','ask')`, `card` with no CHECK, `plan` jsonb not null; RLS select-only. The one insert is `lead_search_create` (00172:47-123): `find`, the switch, `lead_reserve`, the search, its round, a job, an event.
- `lead_rounds` (00140:98-131): a round starts `queued`; one live round per search; `month`, `day`, `platform_day` in format. `lead_search_members` (00140:262-283): `round_id` nullable, `counted = (counted_month is not null)`.
- `leads` (00140:197-232): `place_id` nullable, unique only where not null; `email_state` in none, checking, ok, catch_all, unknown, invalid; no unique email.
- `check()` reads only `round.plan.card` from the plan (`check.ts:48`, `collect.ts:349`); `checkable` takes members with an email in `checking`. `lead_check_commit` promotes a review member whose reasons are all `email:*` once its address is `ok`, counted within the round's reservation.
- `lead_member_shown` (00212:26-32): a qualified member shows once counted. `lead_searches_view` (00172) counts from the members.
- `toSearchDto` (`server/leads/lead-searches.ts:233-284`) drops `via`; `LeadSearchDto` (`lead-dtos.ts:136-149`) has none.
- The page reads `openSearch.round.counted` (`leads-real.jsx:635`), `s.plan.exclusions` (`:385`), and `ldStripOf` passes a plan with no area to `planWho` (`leads-finder.jsx:528`, `sentence.ts:32-35`).
- `LeadsBulkBar` is at 84 lines and 47 branches, `LeadsScope` at 327 and 62 (`baselines/complexity.json`); `leads-real.jsx` is 792 lines of 800.
- People's import (`pages/people-import.jsx`) reads a file with `parseCsv` and `matchColumns` (`contracts/src/shared/csv.ts`), which know no business, website or category column; `contracts/src/shared` is at its module cap, so the lead columns are matched in the leads folder.
- `membersOfRound` reads the members' leads with one `.in("id", …)` (`lead-db.ts:195-203`).

## 2. Files

| File | What |
| --- | --- |
| `supabase/migrations/00242_a_list_of_your_own_is_a_search.sql` | The vias, `lead_search_import`, `lead_search_choose`, `lead_rounds_notify` |
| `packages/contracts/src/leads/lead-import.ts` | The file's columns and rows, the bodies' schemas, the list's strip and every word |
| `packages/contracts/src/leads/search/sets.ts`, `schema-sets.generated.ts` | `import`, `chosen` |
| `packages/contracts/src/leads/lead-dtos.ts`, `lead-row.ts` | `via` on the DTO; the rail row's `list` |
| `apps/dashboard/src/server/leads/lead-lists.ts` | `importLeads`, `chooseLeads`, `refuseList` |
| `apps/dashboard/app/api/v1/lead-searches/import/route.ts`, `…/chosen/route.ts` | The two routes; rows in `route-policy.json` |
| `apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts`, `refresh-map.ts` | `__reachOuts.lists`; the refresh after each |
| `apps/dashboard/src/legacy/pages/reach-out/reach-out-leads.jsx` | The import sheet, *Write to them*, `useLeadLists`, beside Part 6's Leads pieces |
| `leads-real.jsx`, `leads-scope.jsx`, `leads-finder.jsx` | The mount, the rail's foot and menu, the bar, the three guards |
| `apps/edge/lib/leads/lead-db.ts` | `membersOfRound` in parts |
| `tooling/scripts/tests/lead-lists/` | The words, the routes, the page, the edge's parts, the doors on a stack |

## 3. Tasks

- [ ] **3.1 The migration** (00242): the vias; `lead_search_import(p_tenant_id, p_name, p_asked, p_rows)` and `lead_search_choose(p_tenant_id, p_name, p_lead_ids)` as J2–J7 say, each definer, signed in, by permission, bounded (500), returning `{search_id, round_id, …counts}` or `{error, sentence}`; `lead_rounds_notify` whole with J11's change; grants.
- [ ] **3.2 Contracts:** `leadImportRowsOf(text)` (the columns by header or by content, the rows with their line, name, email, phone in E.164, website host, city, state code, category), `leadImportCounts`, `LeadImportSchema` and `LeadChooseSchema`, `leadListStripOf(search)`, `leadImportAnswerWords`, `leadChooseAnswerWords`, `LEAD_LIST_WORDS`; `via` on `LeadSearchDto`; the rail row's `list`.
- [ ] **3.3 Dashboard:** the routes, the server module, `toSearchDto`'s `via`, J9's refusals, the route policy and the typed client.
- [ ] **3.4 The bridge and the page:** `__reachOuts.lists`, the refresh map, the pieces in `reach-out-leads.jsx`, the mount, the rail's foot and menu, the bar, the three guards.
- [ ] **3.5 The edge:** `membersOfRound` in parts of 150.
- [ ] **3.6 Tests:** contracts' rows and words; the routes over the fake db; the page on the stub React (the sheet reads a file and imports; *Write to them* chooses and opens the sheet; a list search draws; a search with no round draws); the edge's parts; the doors on a stack (J2–J7, J11, the grants).
- [ ] **3.7 Docs:** the spec's status line, §6 item 7 and an as-built note under §4.2 and §4.11; this plan's as built; the glossary's row.

## 4. Spec coverage

| Spec | Where |
| --- | --- |
| §6.7 leads from a CSV, checked first, as a search | J1, J2, J4, J5 |
| §4.2 a selection gets the same door in the bulk bar | J7 |
| §4.11 the bulk bar's *Write to them* | J7, J12 |
| §9 decision 6 | J1–J5 |

## 5. Self-review

- **One predicate per rule.** The audience, the check, the counting and the never-again list are the ones that exist; the doors call them (`lead_address_suppressed`, `lead_reserve`, `lead_member_shown` through the view) and add no second reading.
- **Either deploy order.** The migration is additive; a dashboard ahead of the edge works but for a list over about 200 addresses, whose check needs the edge's reading in parts (the deploy note says what happens in the minutes between).
- **No new mechanism.** A list is a search; its check is the finder's round and job; the page mounts one file through the surface it already reads.
