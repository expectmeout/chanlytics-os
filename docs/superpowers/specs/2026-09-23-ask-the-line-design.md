# Ask, the Line: design spec (PRD)

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** draft, for Ruben's approval · **Plan:** written after approval
**Direction:** A · The Line, picked by Ruben on the canvas (https://claude.ai/artifact/Ca7BppA31eHJMJKnDxBQtf, frames A1–A4).
**Analysis:** written against `origin/main` at `793c128d` (#917). The palette, the answer renderer, the bridge, the turn route, the loop, the round, the stream parser, the gateway on both sides, the prompt, the contract, the tools, the proposals, the snapshot, the prefetch, the openings, the store, the tests and the eval harness were read there. Every claim about existing code names its file and line; where this spec and the code disagree, the code wins. Model facts are Anthropic's own pages, read on 23 Sep (section 8.1).

## 1. Goal

Ruben, 23 Sep: Ask "provides too cluttered of answers in poor non generative formats and also provides too many redundant links"; it should be "more efficient, cleaner end to end", the three and the interface one thing.

The goal: **one line to ask anything, with the three inside it, and an answer that says one thing, shows what it rests on, and offers the next step once.** Say · Show · Do, on every surface that answers (the palette, Today's band on a phone, the answers that need no model), streamed as it is written, from the model the eval set chooses.

What does not change: Ask reads the workspace as the signed-in person, never acts without a card the person approves, cites only what it read this turn, and costs its own daily budget. The tools, the proposal kinds, the verbs' routes, the snapshot and the threads table stay.

## 2. What Ask is today

### 2.1 The doors

⌘K (shell-owned), the top bar's Ask button with the three as its icon (`components/topbar.jsx:438-444`), the sidebar's New Chat (`components/sidebar.jsx:436-452`), the phone's ✦ (the three, accent tone), Today's band on a phone (`pages/today-face.jsx`), and `askAbout({ prompt, about, thread })` seeds from Reports, Today's Worth a look and the band (`pages/dashboard-a-ask.jsx:361`).

### 2.2 The palette

`pages/ask-real.jsx` (401 lines): an overlay and a modal; a thread rail on a desktop once a conversation is open (`:305`, `:311`); the three on an 80px stage (`:316`); an input bar with a back button, the scope chip, the input, the hold-to-talk button and a ↵ key (`:320-364`); the body; a footer of keys and "Reads your workspace as you · nothing sends without you" (`:389`).

At rest the body is `ask-home.jsx`'s rows (`:21-40`): Right now (up to 4, from the bell's feed), Ask (up to 7 questions), Act (up to 4 cards to finish), Recent (up to 6 threads). With words typed: an "Ask: …" row tagged "Instant answer" or "Reads your workspace as you", Jump to (up to 6), and the suggestions that match.

### 2.3 One answer, as drawn

`AskTurn` (`pages/ask-turn.jsx:180-203`), in order: a sparkle avatar (`:186`), the prose with a cursor while it streams, Try again on a failure, "Not from your data" on an answer with a figure and no read, the proposal cards, an Open chip and "From" with up to four source chips (`AskLinks`, `:41-58`), copy and read aloud, and on the latest turn "Next" with up to two follow-up chips (`:62-72`). A user's question is a bubble.

Under one answer of sixty words there can be an Open chip, four source chips, two follow-up chips and two tools before any card: nine things to look at. The quick answers (`AskFast`, `ask-home.jsx:43-68`) add up to four link chips of their own.

### 2.4 One turn, on the server

- **The door** (`app/api/v1/ask/route.ts`): saves the thread and the question before the model is asked, streams NDJSON lines `thread`, `trace`, `delta`, `final` or `error`, and stores the answer as JSON in `ask_messages.content` (`:124-139`; the column is `jsonb`, `supabase/migrations/00040_ask.sql:33`).
- **The loop** (`server/ask/loop.ts`):
  - **Before the model:** the day's snapshot and up to two reads the question names plainly ride into the system prompt. The rules and the snapshot are cached (`:229-254`).
  - **Each round:** the model gets 14 read tools, 12 act tools (never for a viewer) and `finish` (`:256`), with `tool_choice: any`. The last of four rounds forces `finish` (`:358`). Effort is low (`:57`), and `max_tokens` is 2400 (`:48`).
  - **The answer:** the `finish` call's input is the answer. Its citations and its navigate target are grounded in what was read (`:458-494`). A round that only proposed ends the turn with the cards (`:517-537`).
- **The round** (`round.ts`): gathers the stream's blocks and forwards the `finish` call's `answer` field as it is written (`partialAnswer`, `:62`).
- **The stream parser** (`sse.ts`): turns any content block that is not a tool call into a text block (`:64-74`), and reads only text and tool-input deltas (`:75-81`).
- **The gateway:**
  - `gateway.ts` sends each round to the edge (`/api/admin/llm`), which holds the key, counts Ask's own tokens against `ASK_TOKENS_DAY` = 1,500,000 (`packages/contracts/src/ask.ts:43`) and writes the usage row.
  - The edge accepts only `claude-opus-5` and `claude-sonnet-5` (`apps/edge/lib/ask-gateway.ts:179`).
  - It clamps `max_tokens` to 2000 (`:180`).
  - It strips any output format from an Ask turn (`:210`).

### 2.5 The contract

`packages/contracts/src/ask.ts` (1150 lines):
- **The model:** `ASK_MODEL = "claude-sonnet-5"` (`:31`). The note above it records that on 7 Sep, on the eval set, Opus 5 answered at a 7.2 s median and Sonnet 5 answered faster at the same grounding.
- **The answer's shape:** the `finish` schema (`:79-120`): `answer` ("two or three short sentences, under sixty words… plain text only"), `citations`, `followups`, `navigate {to, label, now}`, `language`.
- **The rules around it:** the parser and tag cleaning (`:132-252`), the grounding (`:297-387`) and the partial reader (`:399-433`).
- **Model-free answers:** the three quick answers (`fastPath`, `:944-994`).
- **After-the-fact tidying:** three helpers that remove repeats from what an answer shows (`navigateLabel`, `citationsToShow` and `followupsToShow`, `:1111-1150`).

### 2.6 What pins it

- **Executed tests:**
  - `ask.test.mjs`: 30 tests, 95 of its assertions reading source text. Its entry in `source-scan-baseline.json` is 95.
  - `ask-turn.test.mjs`: 31 tests. They run `runAskTurn` on scripted rounds over the database in memory.
  - `ask-palette.test.mjs`: 8 tests. They run the real palette on the stub React.
  - `ask-commit.test.mjs` (14), `ask-routes.test.mjs` (7), `ask-thread-read.test.mjs` (1).
  - `today-face.test.mjs`: pins `shape()` and the chip classes.
  - Other suites hold `AskTurn`, `AskCard` and `__ask`: refusals-on-the-page, the-pages-say-only-what-is-true, leads-finder, leads-honest, reports-page and today-page.
- **End to end:**
  - `e2e/ask.spec.ts` has 8 tests; 5 of them spend the model and run only with `E2E_PAID_MODEL=1`.
  - `e2e/team-card.spec.ts:102` opens the palette with New Chat.
  - `e2e/phone.spec.ts:39` opens it with the ✦.
- **The eval set:**
  - `tooling/scripts/eval-ask.mjs` runs 28 cases (`tooling/evals/ask-cases.json`) against the deployed turn with a signed-in session.
  - Its checks are: tools used, language, no claim of a write, words included or excluded, citations that are real ids, cards made, navigate now.
  - It prints the pass count, the median time and how many answered in one round. Nothing runs it in CI.

## 3. What is wrong with it

- **F1. One prose field carries everything.** The model is told "Plain text: no markdown, no lists" (`server/ask/prompt.ts:62`) and "More than two items go one per line" (`:64`). A week's comparison, three people waiting and a count all arrive as a paragraph, so the page has no structure to draw them with.
- **F2. The same place is offered in up to four spots, and the caps disagree.**
  - The navigate door, the source chips, the follow-ups and each card's Open can all offer the same place, so repeats are removed afterwards by three heuristics (`contracts/ask.ts:1111-1150`, with regexes for echoed follow-ups).
  - The layers disagree on the caps. Sources: the schema's words say four, the parser allows six, the loop keeps four. Follow-ups: the words say two, the parser allows three, the loop keeps two, the palette would show three.
- **F3. Two marks, and the look of a generic chat.**
  - A sparkle avatar on every turn sits beside the three's stage.
  - Questions are bubbles; there is a rail, a footer of keys on every screen, and "Instant answer" tags.
  - Right now and Act repeat what Today already shows.
- **F4. Right now and "who needs me" count the wrong list.**
  - Both read the bell's feed (`legacy-bridge/ask/palette.ts:130`, `contracts/ask.ts:948-965`), which is built from the Inbox's threads (`legacy-bridge/notifications.ts:118`). Those threads are seeded until the Inbox mounts.
  - The badge and Today count with `threadStanding(...).needsYou` over the conversations and open escalations Today reads (`legacy-bridge/surface-data.ts:456-458`).
  - On 23 Sep the palette said "Nobody is waiting on you" beside a queue of two.
- **F5. Sources sit in a row at the end, not beside what they prove.** A number in the prose cannot say where it came from, and a person the calendar names cannot be cited or opened unless another read returned them (`get_calendar` records nothing in the read set).
- **F6. The loop cannot run on Opus 5.5 as written.**
  - Opus 5.5 rejects `tool_choice` `any` and `tool` with a 400. The loop uses both.
  - Opus 5.5 always thinks and must be handed its thinking blocks back unmodified with the tool results. The parser turns a thinking block into an empty text block and drops its signature (`sse.ts:64-81`), and the loop replays it as the text `" "` (`loop.ts:542`).
- **F7. Two limits drift apart.** The loop asks for 2400 tokens (`loop.ts:48`), and the edge clamps every request to 2000 (`ask-gateway.ts:180`).

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Direction A, the Line: Ask opens over the page as one line with the three inside it, and the answer grows under it. | Ruben picked A on the canvas, 23 Sep. |
| D2 | One anatomy for every answer on every surface that answers: **Say** (the finding), **Show** (what it rests on), **Do** (the next step). Each part is marked by one of the three's own squares, lightest to darkest; no labels. | F1, F3. The three are the only mark. |
| D3 | The model writes the answer as **structured output** (`output_config.format` with the answer's JSON schema), not as a `finish` tool. Tools stay tools. Every round asks with `tool_choice: auto`; the last one with `none`. | F6. Structured outputs are GA on Sonnet 5 and Opus 5.5 and combine with tools in one request (section 8.1). One loop runs on both models. |
| D4 | **A place appears once per answer.** An item in Show opens its own row; Do holds at most one place to open and two questions. The contract drops a repeat before the palette sees it. | F2; Ruben: "too many redundant links". |
| D5 | Sources attach to what they prove: a figure's receipt, an item's row, a breakdown's receipt. There is no "From" row. A receipt's words and door are the source's, grounded in this turn's reads, never new prose. | F2, F5. |
| D6 | One cap per part, in contracts, read by the schema's words, the parser and the renderer. | F2. |
| D7 | Right now and the quick "who needs me" count with the Inbox's own rule (`threadStanding`) over the rows Today and the Inbox read, and name the playbook runs waiting for a yes. | F4; CLAUDE.md, "one predicate per rule". |
| D8 | One door: ⌘K and the top bar's three; on a phone, the ✦ and Today's band. The sidebar's New Chat goes; Clear on the line starts afresh. | The canvas's shared parts; two buttons opened the same palette. |
| D9 | No rail, bubbles, avatar, footer or "Instant answer" tag. A conversation folds above the line; Earlier (⌘J) holds the rest, each titled by the question asked. A lead search asked through Ask stays an Ask conversation, titled by its question, not by its card. | F3. The canvas said lead searches would leave Ask; they are Ask threads (`store.ts` is the only writer of `ask_threads`), so they stay, under their question. |
| D10 | Voice: hold Space on an empty line, or hold the mic; the words are the line's caption. Reading aloud stays a button. | Canvas A1; the face does not speak on its own (the three's spec, D10). |
| D11 | The loop and the edge run on Sonnet 5 and Opus 5.5 alike, and the eval set chooses between them on the new format, by the bar in section 8.3. | Ruben asked for Opus 5.5 as faster and more efficient. Anthropic's pages rank it slower than Sonnet 5 and price it at twice Sonnet 5 per uncached token (section 8.1). The 7 Sep choice was made on this eval set. |
| D12 | A stored answer keeps its parts (v2) beside the v1 fields the server derives from them; old answers read back through one mapper. No migration. | `content` is `jsonb`; either deploy order (CLAUDE.md). |
| D13 | On a phone the line docks at the thumb and the answer rises above it as a sheet. Today's band keeps its own field and draws the same answer. | Canvas A4; the three's spec, section 4.7. |
| D14 | Reopening Ask within ten minutes of the last turn returns to that conversation; after that it opens at home. | Canvas A1 opens at home; an answer resumed an hour later is stale. Open question 3. |

## 5. The answer: Say · Show · Do

### 5.1 The anatomy

| Part | What it is for | Holds | Cap | Empty when |
|---|---|---|---|---|
| **Say** · headline | The answer itself, the finding first. | One sentence. | Prompted under 20 words; clipped at 160 characters. | Never. An empty headline is a turn that failed to shape. |
| **Say** · detail | What the headline needs to be true or useful. | At most two short sentences. | 300 characters. | Usually. |
| **Show** · figures | Numbers the headline rests on. | Value as said ("5", "44%", "1 min"), what it counts, its comparison, its source. | 4 | The answer has no number. |
| **Show** · items | Rows the answer names: people, threads, calls. | Title, meta (channel and how long), one line of why, its source. Each opens its row. | 5 | The answer names no row. |
| **Show** · breakdown | One whole split into parts. | A label for the whole, parts with a value, one part marked for attention, its source. | 1 breakdown of 4 parts | Nothing splits. |
| **Do** · open | The one place to open. `now` opens it at once, for "open…", "show…" and "see…". | A route a tool returned, or a page. | 1 | Nothing to open. |
| **Do** · next | Questions to ask next. | Words, sent as a follow-up. | 2 | Nothing natural follows. |
| **Do** · cards | Proposals, unchanged: approve, edit, not now, undo. | The act tools' cards. | As today | Nothing was asked to happen. |

Show draws in a fixed order: the breakdown, then the figures, then the items. It holds only evidence: a part that would repeat the headline stays empty. A breakdown draws with the chart kit's tokens (`SegmentBar`, `styles/charts.css`). The part marked for attention wears the warn status with its icon, as Reports does (`reports-sections.jsx:28-32`); coral is never a data colour.

### 5.2 The type

```ts
// packages/contracts/src/ask-answer.ts
export interface AskAnswer {
  v: 2;
  say: { headline: string; detail: string };
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null };
  do: { open: { to: string; label: string; now: boolean } | null; next: string[] };
  language: AskLanguage;
}
export interface AskFigure { value: string; label: string; note: string; source: AskSource | null }
export interface AskItem { title: string; meta: string; line: string; source: AskSource }
export interface AskBreakdown {
  label: string;
  parts: Array<{ label: string; value: number; warn: boolean }>;
  source: AskSource | null;
}
/** Today's AskCitation with the route it opens (citationRoute): a row or a page read this turn. */
export type AskSource = AskCitation & { to: string };
export const ASK_ANSWER_CAPS = {
  headline: 160, detail: 300, figures: 4, items: 5, parts: 4, next: 2,
  value: 24, label: 60, note: 60, title: 80, meta: 60, line: 160, question: 90,
} as const;
```

The message keeps its proposals, language, grounding flag, tools, latency and rounds as today (`AskMessageVM`, `contracts/ask.ts:537-557`) and gains `answer: AskAnswer`.

### 5.3 The format the model writes

`ASK_ANSWER_FORMAT` is the JSON schema passed as `output_config.format`. It follows three rules:
- **Every key is present.** Every property is required and `additionalProperties` is false, and "nothing" is an empty string or an empty array. This is today's rule for `finish` (`contracts/ask.ts:74-78`).
- **Limits live in the words.** Structured outputs do not support length or numeric limits, so each cap is said in the property's description, and the parser enforces it.
- **The words come from the caps.** The descriptions are generated from `ASK_ANSWER_CAPS`, so the model's words and the parser's limits cannot drift.

The schema lists `say` first, so it is written first and can stream. A draft of the whole schema measures 4,361 characters, under the edge's 8,000 (`ask-gateway.ts:166`).

The schema never changes between rounds or turns: a change of `output_config.format` drops the prompt cache for that conversation (structured outputs page, section 8.1).

### 5.4 From the model's JSON to what is drawn

`normalizeAnswer(raw, read)` in contracts replaces `parseAskFinish`, the grounding and the three tidying helpers. It is pure and executed in tests. It runs these steps, in order:
1. **Clean every string.** It removes tags (`cleanAnswer`, kept), trims, and clips to its cap.
2. **Cut arrays to their caps.**
   - A figure with no value, an item with no title, and a part whose value is not a finite number of zero or more are dropped.
   - A breakdown left with fewer than two parts is `null`.
3. **Ground every source** (`groundCitations`, kept).
   - An item whose source was not read is dropped, because an item is its row.
   - A figure or breakdown whose source was not read keeps its words and loses its receipt.
4. **One door.**
   - `open` goes through `normalizeNavigate` (kept). It is dropped when an item already opens the same route, and `now` holds only while `open` stands.
   - A `next` question is trimmed and cut at `question` characters (90).
   - Among the questions, a repeat is dropped (`sameQuestion`).
   - A question that points at a place already on the answer is dropped (the `FOLLOWUP_ECHO` rule moves here).
5. **Not from your data.** A digit anywhere in Say or Show with no read and no card marks the answer ungrounded (`isUngrounded`, kept, over the new text).
6. **Failure.** An empty headline fails the turn with today's sentence: "I could not shape the answer. Ask again."

`safeNavigate` and `ASK_PAGE_ROUTES` are read only by tests today. They go with the retired helpers.

### 5.5 Sources and receipts

A source is today's citation (kind, id, label) with its route.
- **Where it shows:**
  - A figure with a source wears the page's sign that a word has more behind it: a dotted rule under the number (`dashboard-a-v2.css`, `.tl-text-door`).
  - A press, a hover or focus opens its receipt. The receipt holds what the figure counts, its comparison, "From" with the source's label, and one door to the source's route.
  - An item is its own door.
- **Which reads can be sources:**
  - Pages are always allowed, as today.
  - Every read tool that returns people or rows records them in the read set. `get_calendar` starts recording the people it names (F5).
- **What a receipt never says:** a sentence the model did not attach to a read. The label is the model's short name for a row it read, as a citation's is today; the number beside it is the figure's own.

### 5.6 The quick answers

"Who needs me", "did anyone call" and "what is open" still answer without a model (`fastPath`). They now return an `AskAnswer`:
- **Who needs me:** Say names the people waiting, and the runs waiting for a yes when there are any. Show lists them as items. Do opens the Inbox.
- **Did anyone call:** Say gives the day's missed calls. Show lists them. Do opens Live.
- **What is open:** the openings route's days become items, one per day, with its windows as the line. Do opens the Calendar.

Who is waiting is counted with `threadStanding(...).needsYou` over the conversations and open escalations Today and the Inbox read (D7). The bridge reads them through the surface seam, so a read already made is reused and the count is the badge's. The runs waiting for a yes come from the same read Today's queue uses. The sentences live in contracts (`rightNowLine`, `quickAnswer`), in English and Spanish.

### 5.7 Old answers

`answerFromV1(content)` maps a stored v1 answer:
- the prose becomes `detail`, with an empty headline, and the renderer draws a detail with no headline at the body size;
- citations become items, with the label as the title;
- `navigate` becomes `open`;
- `followups` become `next`.

`v1FromAnswer(answer)` derives the v1 fields the server keeps writing beside `answer`:
- `text`: the headline and the detail. It is also what the history, copy, read aloud and search use.
- `citations`: every grounded source.
- `navigate`: `open`.
- `followups`: `next`.

The erase route's content search still finds a person, because sources carry their ids (`00040_ask.sql:128-134`). Both mappers are pure and tested round trip on stored shapes.

### 5.8 Two answers, as the model writes them

"How did the week go?" (illustrative figures, fictional workspace):

```json
{
  "say": {
    "headline": "6 of 16 customer messages went unanswered this week, a big drop from before.",
    "detail": "The receptionist answered 7 and you handled 3; it needed you 5 times, mostly for emails and a callback."
  },
  "show": {
    "figures": [
      { "value": "5", "label": "times it needed you", "note": "up from 1", "source": { "kind": "page", "id": "reports", "label": "Reports · past 7 days" } },
      { "value": "1 min", "label": "median reply", "note": "stayed fast", "source": { "kind": "page", "id": "reports", "label": "Reports · past 7 days" } }
    ],
    "items": [],
    "breakdown": {
      "label": "16 customer messages",
      "parts": [
        { "label": "Receptionist", "value": 7, "warn": false },
        { "label": "You", "value": 3, "warn": false },
        { "label": "Unanswered", "value": 6, "warn": true }
      ],
      "source": { "kind": "page", "id": "reports", "label": "Reports · past 7 days" }
    }
  },
  "do": {
    "open": { "to": "reports", "label": "Open the week in Reports", "now": false },
    "next": ["What caused the unanswered messages on the 20th?", "Which threads still need me?"]
  },
  "language": "en"
}
```

"Who needs me right now?" with a model (the same shape the quick answer builds; fictional names, ids elided):

```json
{
  "say": { "headline": "Two people have waited three days for you.", "detail": "" },
  "show": {
    "figures": [],
    "items": [
      { "title": "Ana Lima", "meta": "WhatsApp · 3 days", "line": "Sent a photo the receptionist can't read.", "source": { "kind": "thread", "id": "<uuid>", "label": "Ana Lima" } },
      { "title": "Sam Ortiz", "meta": "Phone · 3 days", "line": "Wants a call back about a quote for three.", "source": { "kind": "thread", "id": "<uuid>", "label": "Sam Ortiz" } }
    ],
    "breakdown": null
  },
  "do": { "open": null, "next": ["What did the receptionist tell Ana?"] },
  "language": "en"
}
```

The second has no Open: each item is already a door, so an "Open the Inbox" beside them would be the redundant link Ruben named.

## 6. The Line

### 6.1 Where it sits and how it opens

**On a desktop (721px and up):**
- **The panel:** 720px wide (`min(720px, 100vw - 48px)`), 96px from the top, radius 16, on `--bg-raised` with a `--line-strong` border and `--shadow-lg`.
- **The scrim:** the page stays visible under a scrim of `--bg-sunken` at about 64%. There is no blur.
- **Height and scrolling:** the panel's height is at most `100vh - 144px`. What is under the line scrolls; the line itself never scrolls away.
- **Closing:** a press outside, Esc, or ⌘K again closes it.

**Opening:**
- The panel comes in over 160ms (opacity, and 4px of rise).
- The three move from the top bar's button into the line: a FLIP from the button face's box to the line face's box. The button's face is hidden while the panel is open, because one character stands in the line.
- With reduced motion, neither moves.
- The three are one character following one mood (`legacy-bridge/mascot/mood.ts`), as today.

### 6.2 The line itself

It is 64px high.
- **Left:** the three on a 44×36 canvas sized with `fitSide` (character.ts).
- **Middle:** the scope chip when Ask opened on a row, as today ("Emily Chen ×"), then the input at 18px.
- **Right:** a slot that changes with the state.

| State | Right slot |
|---|---|
| At rest, typing | Hold to talk (36px). |
| Listening | The mic, pressed. |
| Reading | Esc and a Stop button. |
| Answered | Copy, read aloud, and Clear (✕). |

### 6.3 Under the line, state by state

- **Home** (canvas A1):
  - The Right now sentence (D7) is the first row and is active; ↵ on the empty line runs it as "Brief me on today".
  - "Ask about ⟨the page⟩" with three questions (`buildAskSuggestions`'s asks, without the ones Right now already answers).
  - "Earlier" with three conversations and their day.
  - No Act rows, no Jump to.
- **Typing:**
  - First, the words as a question with ↵ on the active row. There is no "Instant answer" tag: a quick answer is simply quick.
  - Jump to: up to 6 people, threads, calls and pages, as today (`askJump`).
  - The suggestions that match. The ones that make a card say "Card" in the row's quiet meta.
- **Listening:** the heard words stream into the input as its caption, dimmed until the recogniser settles, and the three huddle. Nothing is shown under the line.
- **Reading** (A2):
  - The trace in the tools' own words (`toolLabel`, `proposalLabel`), up to three lines. A finished read is a dim ✓; the current one has a coral dot.
  - No counts, no spinner: the three leapfrog in the line.
- **The answer** (A3):
  - Say streams as it is written, and the three stand in their row with a beat for each word.
  - Show and Do come in together when the answer is complete (120ms fade).
  - The three nod.
  - Each part sits beside its square: light, mid, dark, 8px, at the part's first line.
- **A quick answer:** the same parts at once. There is no reading state, and the three nod.
- **A failure:** Say is the sentence the loop has today (`loop.ts:124-143`, `:386-583`), and Do is Try again. The three shake.

### 6.4 A conversation

- **A follow-up:** asking while an answer is on screen is a follow-up on the same thread. The answer folds into one row above the line: its square, the question and its headline, cut to fit.
- **Earlier turns in this conversation:**
  - A folded row opens in place, one at a time, with its cards in the state they were left.
  - More than three folded rows collapse behind "+N earlier in this conversation".
- **Clear** (✕) ends the conversation and shows home; the thread stays in Earlier.
- **Earlier** (⌘J, or the last row under Earlier on home):
  - It replaces what is under the line with every conversation: question, day, and a ✕ that asks before deleting, as today (N5).
  - ↵ opens one, with its turns folded and the last one open.

### 6.5 Keys

| Key | When | Does |
|---|---|---|
| ⌘K / Ctrl K | Anywhere | Opens or closes Ask. |
| ↵ | The line | Asks; runs the active row when the line is empty. |
| ↑ ↓ | Any time | Walk the rows under the line: home, typing, Earlier, an answer's items and moves. It is one listbox with one tab stop, and the line keeps focus (`aria-activedescendant`). |
| Esc | Reading | Stops the turn. |
| Esc | Otherwise | Closes. |
| ⌘J | Open | Earlier. |
| Space, held | The line is empty | Talks while held (section 6.6). |

The `?` sheet lists these (contracts `SHORTCUTS`). The panel draws no footer.

### 6.6 Voice

**Holding Space:**
- On an empty line, holding Space for 300ms starts listening (`useAskTalk.start`), and letting go asks.
- A tap does nothing: an empty line takes no leading space.
- Once there are words, Space is a space.

**The mic:** the button is held as today.

**The microphone permission:** the path is `useAskTalk`'s, as built: the Permissions API check where it exists, and the "blocked" sentence naming the site settings.

**Reading aloud:** it speaks Say (the headline, then the detail) with the existing speech client, from the line's read-aloud button.

### 6.7 Phone (720px and below)

- **The line:** the ✦ opens the line docked at the bottom: 56px, radius 16, 12px from the sides, above the safe area. It rides the keyboard with `visualViewport`, as the `.phone-ask` sheet does now.
- **The sheet:** the answer rises above the line to at most 88% of the height.
  - Its head holds a grabber, the question at 13px and a 44px close.
  - Say, then Show with its figures two by two, then Do with its moves as 48px rows.
- **Earlier:** a button in the sheet's head.
- **The ✦:** it hides while the sheet is open, as today.

### 6.8 Today's band

The band keeps what the three's spec settled (section 4.7): always the full face, and a field that slides in on a tap. Its exchange draws the same answer component in its compact size. Proposals still hand off to the palette ("Review in Ask"). `A.shape(message)` (`today-face.jsx:275`) becomes `A.answer(message)`.

### 6.9 What goes

- **From the palette:**
  - the rail (`ask-real.jsx:305`, `:311`);
  - the sparkle avatar (`ask-turn.jsx:186`);
  - the question bubbles;
  - `AskLinks` and `AskFollowups` (`ask-turn.jsx:41-72`);
  - the footer (`ask-real.jsx:389`);
  - the "Instant answer" and "Reads your workspace as you" tags;
  - the Act and Right now lists on home;
  - the back button;
  - the coral action chip;
  - the 80px stage: the three are in the line now (`ask-real.jsx:316`).
- **From the sidebar:** New Chat (`sidebar.jsx:436-452`).
- **From the contract**, once nothing reads them:
  - the `finish` schema and its parser (`contracts/ask.ts:79-252`);
  - `navigateLabel`, `citationsToShow` and `followupsToShow` (`:1111-1150`);
  - `safeNavigate` (`:364-378`).
- **From the tools:** `FINISH_TOOL` (`server/ask/tools.ts:187-193`).

### 6.10 Accessibility

- **The panel:** `role="dialog"` with its name.
- **The line:** a combobox over the listbox of rows, with `aria-expanded` and `aria-activedescendant`.
- **Announcements:** the answer region is `aria-live="polite"`. It announces the headline once, when it is complete, not every delta.
- **Controls:** a receipt is a button with `aria-expanded`, and the three's canvas is `aria-hidden`.
- **Size and contrast:** touch targets are at least 44px on a phone, and the tokens' contrast holds as today.
- **Words:** every word is in `ask-text.jsx`, in English and Spanish.

## 7. The turn, on the server

### 7.1 A round's request

```ts
{
  model: ASK_MODEL,
  max_tokens: ASK_MAX_TOKENS,               // one number, in contracts; the edge clamps Ask to the same one
  system: [stable /* cached */, snapshot /* cached, 20 s */, prefetch, turn],
  messages,                                  // history, the question, then this turn's rounds, append-only
  tools: [...READ_TOOLS, ...ACT_TOOLS].map((t) => ({ ...t, strict: true })),  // act tools for operators and owners only
  tool_choice: last ? { type: "none" } : { type: "auto" },
  output_config: { effort: "low", format: { type: "json_schema", schema: ASK_ANSWER_FORMAT } },
}
```

Every tool becomes strict (today only `finish` is, `tools.ts:192`). The retry without strict when the API refuses it stays (`loop.ts:372-376`). A refused format gets the same treatment: the round is retried without the format, the answer's words are taken as plain text into `detail`, and `ask_format_rejected` is logged.

### 7.2 How a turn ends without a finish tool

| A round returns | The loop |
|---|---|
| Tool calls only | Runs the reads and the acts in parallel, as today, and asks again. |
| The answer (text) only | Normalises it (section 5.4). The turn is answered. |
| Act calls and the answer | Runs the acts; the answer stands, as today with `finish` (`loop.ts:447-449`). |
| Read calls and the answer | Sets the answer aside, runs the reads and asks again, as today (`:450-456`). |
| Only cards, all made | Builds the answer from the cards with `answerForCards` (contracts, English and Spanish), with no second round, as today (`:517-537`). |
| Nothing, the cap, a refusal, a timeout, a broken stream | Today's sentences, as a Say with Try again. |

The last round's `tool_choice: none` leaves the model one thing to do: write the answer. Opus 5.5 accepts `auto` and `none` (section 8.1).

### 7.3 Thinking blocks

- **`sse.ts`:**
  - It reads `thinking` and `redacted_thinking` block starts as their own kinds, not as text.
  - It reads `thinking_delta` and `signature_delta` as those deltas.
- **`round.ts`:** each block keeps its thinking, its signature, or its redacted data.
- **`loop.ts`:**
  - It replays the assistant's turn with every block, in order and unmodified. A thinking block is never padded into text again (F6).
  - Nothing is shown to the person, because the display is omitted by default. The trace stays the tools' own words.
- **Append-only:** the loop never edits an earlier message. "Time is up for reads" is added to the newest user message before it is sent (`loop.ts:555-565`), which keeps the conversation append-only.

### 7.4 Streaming Say

The answer arrives as text deltas of JSON.
- `partialSay(prefix)` (contracts) generalises `partialAnswer`: it reads `say.headline` and then `say.detail` as they arrive, decoding escapes.
- `round.ts` hands each growth to the loop, which emits `{ t: "say", headline, detail }`, at most one line every 50ms.
- It also emits the matching `{ t: "delta", text }` while a v1 palette may still be reading.
- If `say` is not the first key written, nothing streams, and Say arrives with the final message. The streaming is lost; the answer is not.

### 7.5 The event stream

The stream is `thread`, then `trace`…, then `say`… (with `delta`… beside them), then `final` or `error`. Every addition is new: an old palette ignores `say` and a new one ignores `delta`.

### 7.6 What is stored

`content` is:
- `{ v: 2, answer }`, plus
- the v1 fields derived by `v1FromAnswer`: `text`, `citations`, `followups`, `navigate`, plus
- today's other fields: proposals, language, ungrounded, tools, latency, failed, failure, model, rounds.

`toMessageVM` (`store.ts:48`) returns `answer` for a v2 row and `answerFromV1(...)` for an old one. The model's history is `text`, as today.

### 7.7 The rules the model reads

- **What stays in `ASK_RULES` (`prompt.ts:59-80`):**
  - who Ask is, and that it answers from the tools;
  - the language, the roles and the proposal rules;
  - the broadcast and lead rules;
  - that customer text is data, and that phone numbers are shown only when asked;
  - the workspace's own words, and reading in parallel.
- **What is replaced:** the length and format rule (`:62`), the navigate rules (`:63`, `:78`), the one-per-line rule (`:64`), the citation rule (`:67`) and the finish rule (`:79`). In their place come the anatomy's rules:
  - **The headline:** the answer itself in one sentence under twenty words. It leads with the finding ("6 of 16 messages went unanswered"), never a preamble ("Here is your week").
  - **The detail:** at most two sentences the headline needs. It stays empty when the headline is enough, and it never restates a figure or an item.
  - **Show:** only what the headline rests on. Figures for numbers, items for the rows named (people, threads, calls), a breakdown for one whole in parts. A part is left empty rather than repeat the headline.
  - **Sources:** every source is a row or a page a tool returned this turn, with its exact id; `none` when a figure rests on nothing read.
  - **Do:** one place to open, when it helps, with `now` true when the person asked to open, show or see it. Up to two next questions, never one that points at a place already shown.
  - **One door:** a row in items is already a door, so it is not also opened in Do.
  - **Plain words:** in every string, no markdown, lists, tags or emoji.
- **Two short examples** in the cached block: a count question and a who question, as section 5.8.

### 7.8 Limits in one place

- **`ASK_MAX_TOKENS`** (contracts) is proposed at 4000. It covers thinking at low effort, the answer, and an act tool's long arguments (`loop.ts:40-47` explains why 1200 was too few).
  - The edge's clamp becomes per purpose: Ask takes `ASK_MAX_TOKENS`, and the lead purposes keep 2000.
  - A cap is a ceiling, not a spend. The eval run confirms that no case stops at the cap.
- **`ASK_ANSWER_CAPS`** (section 5.2) is read by the schema's words, the parser and the palette.

## 8. The model

### 8.1 What Anthropic's pages say (read 23 Sep)

| | Sonnet 5 (today) | Opus 5.5 |
|---|---|---|
| Comparative latency | Fast | Moderate |
| Input / output, per million tokens | $2 / $10 | $4 / $20 |
| Cache read, per million | $0.20 | $0.20 |
| Cache write, 5 minutes | $2.50 | $5 |
| Thinking | Adaptive; default effort high | Always on; default effort medium |
| `tool_choice` `any` / `tool` | Accepted | 400: "not supported for this model" |
| Structured outputs | GA | GA |

Sources:
- models overview: https://platform.claude.com/docs/en/models/overview
- pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Opus 5.5 migration guide: https://platform.claude.com/docs/en/models/opus-5-5/migration-guide
- structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

Opus 5.5 is cheaper than Opus 5 ($5 / $25), and the models page suggests starting with it for most workloads. Next to Sonnet 5, which Ask runs on, it is ranked slower and costs twice as much per uncached token.

### 8.2 What that means for Ask

- **Cost:** most of a turn's prompt is cached (the rules, the definitions, the facts, and the snapshot kept twenty seconds), and a cache read costs the same on both. The question, the reads' results and every output token, thinking included, cost twice as much on Opus 5.5.
- **Speed:** the 7 Sep note (`contracts/ask.ts:22-30`) chose Sonnet 5 over Opus 5 for speed at the same grounding. Opus 5.5 is ranked between them.
- **Why try it anyway:** the new format asks the model to judge. It has to choose what to show, lead with the finding, and leave a part empty rather than repeat itself. That judgment is where a larger model may be worth its time.

So D11 builds the loop and the edge for both models, and lets the eval set decide.

### 8.3 The gate

1. After the second PR is live, run `tooling/scripts/eval-ask.mjs` on production, which runs Sonnet 5. Record:
   - the pass count;
   - the median and 90th-percentile time to the first `say` line and to `final`;
   - the one-round count;
   - tokens and cost per turn from Ask's usage rows (`usage.ask_tokens`).
2. The fourth PR sets `ASK_MODEL = "claude-opus-5-5"`. After it deploys, run the same set.
3. **Keep Opus 5.5 only if all three hold:**
   - it passes every case Sonnet 5 passed;
   - its median time to first words is no more than 1.5 s above Sonnet 5's;
   - no case stops at the token cap.
4. **Otherwise** revert the one line. Either way, the contract's note records both runs, as the 7 Sep note did.

Opus 5.5's fast mode (research preview, $8 / $40) is out of scope. It is an option only if Opus 5.5 misses the bar on speed alone and Ruben wants to pay for speed.

## 9. The code: modules and what each owns

| File | Owns | Change |
|---|---|---|
| `packages/contracts/src/ask-answer.ts` (new) | The anatomy: types, caps, `ASK_ANSWER_FORMAT`, `normalizeAnswer`, `partialSay`, `answerForCards`, the quick answers, `rightNowLine`, `answerFromV1`, `v1FromAnswer` | New; exported from the package index; `dist` rebuilt |
| `packages/contracts/src/ask.ts` | Limits, the model, proposals, scope, jump, suggestions, settings changes | `ASK_MAX_TOKENS` added; `fastPath` moves out; the `finish` schema, its parser and the three tidying helpers removed in the third PR |
| `apps/edge/lib/ask-gateway.ts` | What the gateway accepts | `claude-opus-5-5` allowed; a format allowed for Ask under 8,000 characters; `max_tokens` clamped per purpose |
| `apps/dashboard/src/server/ask/sse.ts` | Frames to events | Thinking blocks and their deltas |
| `.../round.ts` | A round's blocks | Thinking kept; Say streamed from the answer's text |
| `.../loop.ts` | The turn | No `finish`; `auto` then `none`; the format; replay unmodified; v2 answer; cards via `answerForCards`; format fallback |
| `.../tools.ts`, `.../proposals.ts` | The reads and the acts | `FINISH_TOOL` removed; every tool strict; `get_calendar` records its people |
| `.../prompt.ts` | The rules | The anatomy's rules and two examples; the finish rules removed |
| `app/api/v1/ask/route.ts`, `.../store.ts` | The door and the rows | `say` lines; v2 stored beside derived v1; old rows mapped on read |
| `legacy-bridge/ask/palette.ts` | What the palette knows before a model | `answer(m)` replaces `shape`; Right now from `threadStanding`; quick answers as v2 |
| `legacy/pages/ask-real.jsx` | The palette | Rewritten as the Line: states, folding, Earlier, keys, hold Space, the FLIP |
| `legacy/pages/ask-turn.jsx` | An answer | `AskAnswer` (Say, Show, Do, receipts) and `AskCard`, restyled |
| `legacy/pages/ask-home.jsx` | Rows under the line | Home: Right now, Ask about, Earlier. Typing: ask, jump, matches |
| `legacy/pages/ask-hooks.jsx` | Talk, speech, focus, width | `useHoldSpace` added |
| `legacy/pages/ask-text.jsx` | Every word | New words; retired ones removed |
| `legacy/pages/today-face.jsx` | The band | Its exchange draws `AskAnswer`, compact |
| `legacy/components/sidebar.jsx` | The sidebar | New Chat removed |
| `legacy/styles/ask.css` | The palette's look | Rewritten for the Line |
| `tooling/scripts/eval-ask.mjs` | The eval set | v2 checks; time to first words |

Every edited page and stylesheet bumps its `?v=` in both lists (`legacy-bridge/manifest.ts`, `legacy/Chanlytics.html`). No new page file: the answer lives where a turn is drawn today.

## 10. Proof

### 10.1 Node tests (`pnpm test`)

- **New, `ask-answer.test.mjs`**, executed, no source reads:
  - **The schema:** it matches the parser key for key, forbids extras, and stays under 8,000 characters.
  - **The parser:** caps and cleaning; an unread item dropped; an unread figure keeps its words without a receipt.
  - **One door:** Open dropped beside an item with the same route; a next question dropped when it echoes a door.
  - **Grounding and streaming:** not from your data; `partialSay` on every prefix of a real answer.
  - **The cards:** `answerForCards` in English and Spanish.
  - **The quick answers:** they are built from a queue that holds two people waiting and a run, and "who needs me" names exactly those. Calls and openings are covered too.
  - **Old answers:** `answerFromV1` and `v1FromAnswer` round trip on content shaped like stored rows.
- **`ask-turn.test.mjs`**, scripted rounds:
  - the answer as JSON text;
  - `auto` on each round and `none` on the last, read from the request the port receives;
  - thinking blocks replayed byte for byte with their signatures;
  - an act beside the answer; a read beside the answer set aside; cards only;
  - a refused format retried without it;
  - the cap reached mid-answer, which ends in its sentence.
- **`ask.test.mjs`:**
  - Its source pins on the retired shape go: the `finish` schema, sixty words, one per line, the chips.
  - Its baseline falls in the same PR (`UPDATE_SOURCE_SCAN_BASELINE=1`). Nothing new reads source.
- **`ask-palette.test.mjs`:** the Line on the stub React, as ask-palette.test runs the palette today:
  - home, with Right now from the queue; typing; reading; the answer's parts and a receipt;
  - folding on a follow-up; Clear; Earlier;
  - ↑ ↓ ↵; Esc stopping, then closing; hold Space;
  - delete asked twice (N5), kept.
- **The band:** `today-face.test.mjs` draws `AskAnswer` and still hands a card to the palette.
- **The stream and the edge:** the stream parser test reads thinking frames. `llm-door.test.mjs` shows the edge takes `claude-opus-5-5` and an Ask format under 8,000, and clamps Ask to `ASK_MAX_TOKENS`.
- **Kept green:** refusals-on-the-page, the-pages-say-only-what-is-true, and the two leads suites that use `__ask`.

### 10.2 The eval set

`eval-ask.mjs` gains four checks on every case:
- one sentence of at most 20 words in the headline;
- no place offered twice across items, Open and cards;
- every non-page source a real id;
- figures or a breakdown for the cases marked as counts.

It also records the time to the first `say` line. All 28 cases pass on Sonnet 5 before the second PR merges; section 8.3 runs it again on Opus 5.5.

### 10.3 End to end

- **`e2e/ask.spec.ts`:** moves to the Line's test ids (`ask-line`, `ask-say`, `ask-show`, `ask-do`, `ask-earlier`), and opens from the top bar where it used New Chat.
- **`e2e/team-card.spec.ts:102`:** opens from the top bar.
- **`e2e/phone.spec.ts:39`:** opens the docked line from the ✦.

### 10.4 Seen in the app

- **In the running app:** a dev server on the salon workspace at 1440, 1024 and 375 wide, compared with the canvas's A1–A4.
- **On production, after each PR:**
  - "who needs me right now?" names what the queue names;
  - "how did the week go?" draws its breakdown and figures with receipts;
  - "open the most recent call" lands on the call.

## 11. Delivery

| PR | What | Why it is safe to deploy |
|---|---|---|
| 1 · The gateway | `claude-opus-5-5` allowed; a format allowed for Ask; Ask's `max_tokens` from contracts. | The edge only accepts more than before. The dashboard sends nothing new yet. |
| 2 · The answer | `ask-answer.ts`; the loop without `finish` (`auto`/`none`, the format, the thinking replay); every read records its sources; the quick answers from the queue; the route stores v2 beside derived v1 and adds `say` lines; the rules rewritten; the eval checks. Still Sonnet 5. | Merged once the first PR is live, because it sends a format the old edge would strip. The palette in production keeps reading the v1 fields and the deltas, unchanged. |
| 3 · The Line | The palette, the answer, the band, the phone, the one door, the words, the styles; the retired contract helpers removed. | It reads v2, or maps v1, whichever the server wrote. |
| 4 · The model | `ASK_MODEL` to `claude-opus-5-5`, kept only if section 8.3's gate holds. | One line, and one line back. |

## 12. Risks

- **R1. Constrained output, thinking and tools on one stream are new to this loop.** Scripted tests hold the shape; the eval run holds the reality, before the second PR merges.
- **R2. The first use of a schema compiles a grammar** (cached 24 hours from its last use). The first question after a quiet day pays for it. The eval's first case measures it.
- **R3. Key order.** The schema lists `say` first. If the model does not write it first, Say arrives with the final message instead of streaming.
- **R4. `tool_choice: none` on the last round** is accepted on Opus 5.5 according to its pricing page (`auto`, `none`). The first eval run confirms it. The fallback is `auto` with "Answer now" added to the newest message.
- **R5. Cost on Opus 5.5.** The daily budget counts tokens, not dollars, so it bites at the same volume on either model. The gate measures cost per turn.
- **R6. Space held while typing.** It is only the empty line, and only a hold of 300ms or more.
- **R7. The source-scan ratchet.** Pins are removed with the baseline lowered in the same PR.
- **R8. Old threads** read back through `answerFromV1`, tested on stored shapes.

## 13. Out of scope

- The Companion's pointing at a page's rows (B2). It can come later, on the same parts.
- The Stage (C).
- Answering aloud unasked.
- New tools or proposal kinds.
- The demo's AskBar (`dashboard-a-ask.jsx`, demo only).
- Opus 5.5 fast mode.
- The lead finder's own composer. It uses `__ask.send` and the card, which the server keeps sending.

## 14. Open questions for Ruben

1. **The bar for Opus 5.5.** It stays if its first words come within 1.5 s of Sonnet 5's median and it passes every case. Is 1.5 s the right bar, or do you want Opus 5.5 whatever the speed?
2. **New Chat goes from the sidebar.** The one door is the top bar's three and ⌘K. Yes?
3. **Reopening.** Within ten minutes Ask returns to the conversation as you left it; after that it opens at home. Right?
