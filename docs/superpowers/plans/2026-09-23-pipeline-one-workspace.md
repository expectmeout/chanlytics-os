# The Pipeline is a workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work a deal from the Pipeline without leaving it: a peek beside the rows with the deal card and its acts, a board on a desk whose drops ask the one sheet for the move, a teammate's move arriving live, and a search that finds a service. The first phase of the Pipeline review of 23 September 2026 ("one workspace"), made Chanlytics-shaped.

**Architecture:** The design is the amendment at the end of `docs/decisions/0008-a-proposal-is-part-of-the-deal.md`; read it first. Nothing new is stored: the peek reads the person the profile already reads, the board draws the same `pipelineOf` groups, a drop opens the existing deal sheet. Contracts own the two new rules (`pipelineMove`, `pipelinePeekOf`) and the words. The realtime watch list gains the `deals` table.

**Tech stack:** as `2026-09-23-proposals-and-deals.md` (the conventions there hold: worktree, the gate, both script lists, `?v=` bumps, words from contracts, tests that execute the code).

---

## One PR · `design/pipeline-one-workspace`

### Task 1 · Contracts

**Files:** `packages/contracts/src/pipeline.ts`; tests in `tooling/scripts/tests/pipeline.test.mjs`.

- [x] `PIPELINE_WORDS` gains `views` (Show as · List · Board), `peek` (Close, Open their page, Open the thread, Reading…, "this person") and `board` (Nobody here, Open).
- [x] `pipelineMove(from, to, row)`: the table in the note; null for every other pair, and for a row whose deal is not the stage the move assumes.
- [x] `pipelinePeekOf(row, group)`: who, initials, whether the name is a number, the sub ("Proposal out · Bridal package"), the facts People's row carries (last contact, their words, coming up) and their thread.
- [x] `seed-globals.ts` publishes both as `window.__pipeline.move` and `.peek`.

### Task 2 · The peek

**Files:** create `apps/dashboard/src/legacy/pages/pipeline-peek.jsx`; modify `pipeline-scope.jsx`, `person-deal.jsx` (exports `PersonDealOne`, `PersonDealQuiet`), `styles/clients.css`.

- [x] `PipelinePeek`, hookless: `.pk.pl-peek.pipe-peek` with the lead peek's head (face, name, sub, Close), the deal card frameless, the facts, the two doors as quiet words. A phone pulls it down to close (`touchSwipe`).
- [x] The scope holds `peekId` and the person read for it (`__peekPerson` at once, `__personDetail` behind, again on `deal:recorded`, Retry on a failed read). A row press and Enter open it; Esc closes it (`keysWith({ peekOpen, closePeek })`); it follows the cursor; focus moves in and back out; it closes when the person leaves the Pipeline.
- [x] A send from the card opens the thread with the words in the box (the person page's own `chanlytics-compose` key); every other act opens the deal sheet through the card's own `pdRun`.

### Task 3 · The board

**Files:** create `pages/pipeline-board.jsx`; modify `pipeline-scope.jsx`, `clients.css`.

- [x] The view switch (`cl-tabs pipe-views`, List | Board, `aria-pressed`) at the controls row's right on a desk, kept as `pipeline.view` in localStorage, read in a try.
- [x] `PipelineBoard`, hookless: every group as a column (empty ones too), `PipelineCard` per row (`id="person-<id>"`, `role="button"`, `tabIndex` by the cursor, `draggable` for an owner or operator), the folded column keeping its box.
- [x] Drag with the browser's own events; `is-over` on a column the card may drop into, `is-refused` on one it may not; a drop asks `window.openDealSheet` for `pipelineMove`'s mode and deal.

### Task 4 · Live, and the search

- [x] `packages/db/src/realtime.ts` watches `deals`; `peopleOverride.refreshOnTables` is the default trio plus `deals`.
- [x] `plMatcher` matches the deal's service.

### Task 5 · Both lists, the tests, the walk

- [x] `manifest.ts` and `Chanlytics.html`: the two new files before `pipeline-scope.jsx`; `?v=` bumps on every edited legacy file.
- [x] `pipeline.test.mjs`: `pipelineMove`'s table and refusals; `pipelinePeekOf`; the page: a row and Enter open the peek, Esc closes it, the peek follows J, its doors go to the page and the thread, the card's act opens the sheet, a person who leaves the Pipeline closes it; the board draws four columns and their cards, a drop asks the sheet, a refused drop asks nothing, the view is kept; People refreshes on `deals`; the search finds a service.
- [x] `e2e/people.spec.ts`: a row opens the peek, whose door opens the page.
- [x] Docs: the 0008 amendment, `legacy/CLAUDE.md`, this plan.
- [x] The gate; a probe of the real page at 1280, 1440 and 390 in both themes (the list, the peek, the board, a drag, the drop's sheet); the PR; merge on green.
- [ ] A walk on the salon's live Pipeline (Ruben's: the pane had no signed-in session when this shipped).

## Held, on purpose

One row per open deal (a `people_list` change), a pass in the history (the timeline reading the deal events), and every later phase of the review (next steps, going cold, open tracking, accepting, paying) — each the owner's call or its own note.
