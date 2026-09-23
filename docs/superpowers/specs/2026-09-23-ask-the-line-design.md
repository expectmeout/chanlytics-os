# Ask, the Line: design spec (PRD)

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** revision 2, for Ruben's approval · **Plan:** written after approval
**Direction:** A · The Line, picked by Ruben on the canvas (https://claude.ai/artifact/Ca7BppA31eHJMJKnDxBQtf, frames A1–A4).
**Analysis:** written against `origin/main` at `793c128d` (#917). Read there:
- the palette and the answer renderer;
- the bridge;
- the turn route, the loop, the round and the stream parser;
- the gateway on both sides, the prompt and the contract;
- the tools, the proposals, the snapshot, the prefetch, the openings and the store;
- the tests and the eval harness.

Every claim about existing code names its file and line. Where this spec and the code disagree, the code wins. Model facts come from Anthropic's own pages, read on 23 Sep (section 8.1). Section 15 lists what the review of revision 1 changed.

## 1. Goal

Ruben, 23 Sep: Ask "provides too cluttered of answers in poor non generative formats and also provides too many redundant links"; it should be "more efficient, cleaner end to end", the three and the interface one thing.

The goal: **one line to ask anything, with the three inside it, and an answer that says one thing, shows what it rests on, and offers the next step once.** Say · Show · Do, on every surface that answers (the palette, Today's band on a phone, the answers that need no model), streamed as it is written, from the model the eval set chooses.

What does not change:
- Ask reads the workspace as the signed-in person.
- It never acts without a card the person approves.
- It cites only what it read this turn.
- It spends its own daily budget.
- The tools, the proposal kinds, the verbs' routes, the snapshot and the threads table stay.

## 2. What Ask is today

### 2.1 The doors

Ask opens from:
- ⌘K (owned by the shell);
- the top bar's Ask button, with the three as its icon (`components/topbar.jsx:438-444`);
- the sidebar's New Chat (`components/sidebar.jsx:436-452`), which is the only sender of `ask:new` (`pages/app-shell.jsx:815`);
- the phone's ✦ (the three, in the accent tone);
- Today's band on a phone (`pages/today-face.jsx`);
- `askAbout({ prompt, about, thread })` seeds from Reports, Today's Worth a look and the band (`pages/dashboard-a-ask.jsx:361`).

### 2.2 The palette

`pages/ask-real.jsx` (401 lines) draws:
- an overlay and a modal;
- a thread rail, on a desktop, once a conversation is open (`:305`, `:311`);
- the three on an 80px stage (`:316`);
- an input bar with a back button, the scope chip, the input, the hold-to-talk button and a ↵ key (`:320-364`);
- the body;
- a footer of keys and "Reads your workspace as you · nothing sends without you" (`:389`).

Closing the palette keeps an open conversation, and the next ⌘K brings it back.

**At rest,** the body is `ask-home.jsx`'s rows (`:21-41`):
- Right now: up to 4, from the bell's feed.
- Ask: up to 7 questions.
- Act: up to 4 cards to finish.
- Recent: up to 6 threads.

**With words typed:**
- an "Ask: …" row, tagged "Instant answer" or "Reads your workspace as you";
- Jump to: up to 6;
- the suggestions that match.

### 2.3 One answer, as drawn

`AskTurn` (`pages/ask-turn.jsx:180-203`) draws, in order:
1. a sparkle avatar (`:186`);
2. the prose, with a cursor while it streams;
3. Try again, on a failure;
4. "Not from your data", on an answer with a figure and no read;
5. the proposal cards;
6. an Open chip, then "From" with up to four source chips (`AskLinks`, `:41-58`);
7. copy and read aloud;
8. on the latest turn only, "Next" with up to two follow-up chips (`:62-72`).

A user's question is a bubble.

Under one answer of sixty words there can be nine things to look at before any card: an Open chip, four source chips, two follow-up chips and two tools. The quick answers (`AskFast`, `ask-home.jsx:44-69`) add up to four link chips of their own.

### 2.4 One turn, on the server

- **The route** (`app/api/v1/ask/route.ts`):
  - It saves the thread and the question before the model is asked.
  - It streams NDJSON lines: `thread`, `trace`, `delta`, then `final` or `error`.
  - It stores the answer as JSON in `ask_messages.content` (`:124-139`; the column is `jsonb`, `supabase/migrations/00040_ask.sql:33`).
- **The loop** (`server/ask/loop.ts`):
  - The day's snapshot and up to two reads the question names plainly ride into the system prompt. The rules and the snapshot are cached (`:229-254`).
  - Each round offers 14 read tools, 12 act tools (never to a viewer) and `finish` (`:256`), with `tool_choice: any`. The last of four rounds forces `finish` (`:358`).
  - Effort is low (`:57`), and `max_tokens` is 2400 (`:48`).
  - The `finish` call's input is the answer. Its citations and its navigate target are grounded in what was read (`:458-494`), and each stored citation carries its route (`:485`, `citationRoute`, `contracts/ask.ts:315-328`).
  - A round that only proposed ends the turn with the cards (`:517-537`).
- **The round** (`round.ts`) gathers the stream's blocks and forwards the `finish` call's `answer` field as it is written (`partialAnswer`, `:62`).
- **The stream parser** (`sse.ts`) turns any content block that is not a tool call into a text block (`:64-74`), and reads only text and tool-input deltas (`:75-81`).
- **The gateway** (`gateway.ts`) sends each round to the edge, at `/api/admin/llm`.
- **The edge** holds the key, counts Ask's own tokens against `ASK_TOKENS_DAY` = 1,500,000 (`packages/contracts/src/ask.ts:43`) and writes the usage row. It also:
  - accepts only `claude-opus-5` and `claude-sonnet-5` (`apps/edge/lib/ask-gateway.ts:179`);
  - clamps `max_tokens` to 2000 (`:180`);
  - strips any output format from an Ask turn (`:210`).
- **Where Ask answers:** a dashboard answers only when it is production, or when `EDGE_PROVIDERS=live` (`server/deployment.ts:31`).

### 2.5 The contract

`packages/contracts/src/ask.ts` (1150 lines) holds:
- **The model.** `ASK_MODEL = "claude-sonnet-5"` (`:31`). The note above it records the 7 Sep eval-set run: Opus 5 answered at a 7.2 s median, and Sonnet 5 answered faster at the same grounding.
- **The `finish` schema** (`:79-120`): `answer`, `citations`, `followups`, `navigate {to, label, now}` and `language`. Its description asks for "two or three short sentences, under sixty words… plain text only".
- **The machinery around it:** the parser and tag cleaning (`:132-252`), the grounding (`:297-387`) and the partial reader (`:399-433`).
- **The three quick answers** (`fastPath`, `:944-994`).
- **Three helpers that remove repeats** from what an answer shows (`navigateLabel`, `citationsToShow` and `followupsToShow`, `:1111-1150`).

### 2.6 What pins it

- **`ask.test.mjs`:** 30 tests, 95 of whose assertions read source text. Its entry in `source-scan-baseline.json` is 95.
- **`ask-turn.test.mjs`:** 31 tests that run `runAskTurn` on scripted rounds over the database in memory.
- **`ask-palette.test.mjs`:** 8 tests that run the real palette on the stub React.
- **Commit, routes and threads:** `ask-commit.test.mjs` (14), `ask-routes.test.mjs` (7) and `ask-thread-read.test.mjs` (1).
- **The band:** `today-face.test.mjs` pins `shape()` and the chip classes.
- **Other suites that hold `AskTurn`, `AskCard` and `__ask`:**
  - refusals-on-the-page;
  - the-pages-say-only-what-is-true;
  - leads-finder;
  - leads-honest;
  - reports-page;
  - today-page.
- **End to end:**
  - `e2e/ask.spec.ts` has 8 tests. Five of them spend the model and run only with `E2E_PAID_MODEL=1`.
  - `e2e/team-card.spec.ts:102` opens the palette with New Chat.
  - `e2e/phone.spec.ts:39` opens it with the ✦.
- **The eval set:** `tooling/scripts/eval-ask.mjs` runs 28 cases (`tooling/evals/ask-cases.json`) against a deployed turn, signed in as the e2e owner.
  - It checks: tools used, language, no claim of a write, words included or excluded, citations that are real ids, cards made, and navigate now.
  - It prints the pass count, the median time and how many cases answered in one round.
  - Nothing runs it in CI.

## 3. What is wrong with it

- **F1. One prose field carries everything.** The model is told "Plain text: no markdown, no lists" (`server/ask/prompt.ts:62`) and "More than two items go one per line" (`:64`). A week's comparison, three people waiting and a count all arrive as a paragraph. Prose cannot carry a figure, a row or a split the page can draw: this is the "poor non generative format".
- **F2. The same place is offered in up to four spots, and the caps disagree.**
  - The navigate door, the source chips, the follow-ups and each card's Open can all offer the same place.
  - Repeats are removed afterwards, by three heuristics (`contracts/ask.ts:1111-1150`, with regexes for echoed follow-ups).
  - The caps disagree by layer. Sources: the schema's words say four, the parser allows six, the loop keeps four. Follow-ups: the words say two, the parser allows three, the loop keeps two, and the palette would show three.
- **F3. Two marks, and the look of a generic chat.**
  - A sparkle avatar on every turn sits beside the three's stage.
  - Questions are bubbles.
  - There is a rail, a footer of keys on every screen, and "Instant answer" tags.
  - Right now and Act repeat what Today already shows.
- **F4. Right now and "who needs me" count the wrong list.** Both read the bell's feed (`legacy-bridge/ask/palette.ts:130`, `contracts/ask.ts:948-965`), which is built from the Inbox's threads (`legacy-bridge/notifications.ts:118`). Those threads are seeded until the Inbox mounts. The badge and Today count the rows Today reads with `threadStanding(...).needsYou` (`legacy-bridge/surface-data.ts:456-458`). On 23 Sep the palette said "Nobody is waiting on you" beside a queue of two.
- **F5. Sources sit in a row at the end, not beside what they prove.**
  - A number in the prose cannot say where it came from.
  - A person the calendar names cannot be cited or opened unless another read returned them, because `get_calendar` records nothing in the read set.
- **F6. The loop cannot run on Opus 5.5 as written.**
  - Opus 5.5 rejects `tool_choice` `any` and `tool` with a 400.
  - It always thinks, and it must be handed its thinking blocks back unmodified with the tool results.
  - The parser turns a thinking block into an empty text block and drops its signature (`sse.ts:64-81`). The loop then replays it as the text `" "` (`loop.ts:542`).
- **F7. Two limits drift apart.** The loop asks for 2400 tokens (`loop.ts:48`), and the edge clamps every request to 2000 (`ask-gateway.ts:180`).

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Direction A, the Line: Ask opens over the page as one line with the three inside it, and the answer grows under it. | Ruben picked A on the canvas, 23 Sep. |
| D2 | One anatomy for every answer on every surface that answers: **Say** (the finding), **Show** (what it rests on) and **Do** (the next step). Each part is marked by one of the three's own squares, from lightest to darkest, with no labels. A part is filled because the answer needs it, never because it exists. | F1, F3. The three are the only mark. A structure the model fills for its own sake would be a new kind of clutter. |
| D3 | The model writes the answer as **structured output** (`output_config.format` with the answer's JSON schema), not as a `finish` tool. Tools stay tools. Every round asks with `tool_choice: auto`, and the last one with `none`. | F6. Structured outputs are GA on Sonnet 5 and Opus 5.5 and combine with tools in one request (section 8.1). One loop runs on both models. |
| D4 | **A place appears once per answer.** One policy runs over every door: an item, Do's Open, a card's Open and a receipt. It sets which door wins (section 5.5). The contract applies it before the palette sees the answer. | F2; Ruben: "too many redundant links". |
| D5 | Sources attach to what they prove: a figure's receipt, an item's row, a breakdown's receipt. There is no "From" row. The model names a row (kind, id); the server grounds it in this turn's reads and derives where it opens. The model never writes a source's route. | F2, F5. A receipt is trustworthy only when its door is the app's own. |
| D6 | One cap per part, in contracts. Its numbers are written once, in the format's words generated from the caps, and the parser enforces them. The rules and the renderer do not restate them. | F2. |
| D7 | Right now and the quick "who needs me" answer read **Today's queue itself**: the people waiting and the runs waiting for approval. The queue is classified once and published once by the surface seam that feeds Today, and the badge counts its people rows. | F4; CLAUDE.md, "one predicate per rule". |
| D8 | One door to Ask: ⌘K and the top bar's three, and on a phone the ✦ and Today's band. The sidebar's New Chat goes, and `ask:new` (its only sender) goes with it. Clear on the line starts afresh. | Two buttons opened the same palette. The top bar's labelled Ask button is on every page. |
| D9 | No rail, bubbles, avatar, footer or "Instant answer" tag. A conversation folds above the line, and Earlier (⌘J) holds the rest, each titled by the question asked. A lead search asked through Ask stays an Ask conversation, titled by its question rather than its card. | F3. The canvas said lead searches would leave Ask. They are Ask threads (`store.ts` is the only writer of `ask_threads`), so they stay, under their question. |
| D10 | Voice: hold Space on an empty line, or hold the mic, and the words become the line's caption. Reading aloud stays a button. | Canvas A1. The face does not speak on its own (the three's spec, D10). |
| D11 | **Sonnet 5 stays until Opus 5.5 wins the gate in section 8.3**: quality in Ruben's blind review, latency and cost. The loop and the edge are built to run on both. | Ruben asked for Opus 5.5 as faster and more efficient. Anthropic's pages rank it slower than Sonnet 5 and twice Sonnet 5's price per uncached token (section 8.1). The 7 Sep choice was made on this eval set. |
| D12 | A stored answer keeps its parts (v2) beside the v1 fields the server derives from them. Old answers read back through one mapper. No migration. | `content` is `jsonb`; either deploy order (CLAUDE.md). |
| D13 | On a phone the line docks at the thumb and the answer rises above it as a sheet. Today's band keeps its own field and draws the same answer. | Canvas A4; the three's spec, section 4.7. |
| D14 | Reopening Ask returns to the open conversation until Clear. | Today's behaviour (section 2.2). A time cutoff would hide a thread someone left to check the Inbox. How fresh an answer is shows on its receipts, which name their read. |
| D15 | An answer has one of two forms. **Structured** has a headline. **Prose** is words only: every answer made today, and a turn whose format the API refused. | Every state, including old answers and fallbacks, gets a valid, tested shape. |
| D16 | **The Line ships before the new answer**, drawing today's answers in the prose form. | The visible change arrives with no model or loop risk. No palette ever reads a new answer through old fields. |

## 5. The answer: Say · Show · Do

### 5.1 The anatomy

| Part | What it is for | Holds | Cap | Empty when |
|---|---|---|---|---|
| **Say** · headline | The answer itself, the finding first | One sentence | The format asks for under 20 words; clipped at 160 characters | Never, in the structured form |
| **Say** · detail | What the headline needs to be true or useful | Up to two short sentences; up to five when the person asked why, how, for a summary or for detail (today's rule, `prompt.ts:62`) | 700 characters | Usually |
| **Show** · figures | Numbers the headline rests on | The value as said ("5", "44%", "1 min"), what it counts, its comparison, its source | 4 | There is no number |
| **Show** · items | Rows the answer names: people, threads, calls | Title, meta (channel and how long), one line of why, its source. Each opens its row | 5 | No row is named |
| **Show** · breakdown | One whole, split | What the whole is, its total, parts with a value (one may be marked for attention), its source | 1 breakdown of 4 parts | Nothing splits, or the parts do not add up to the total |
| **Do** · open | The one place to open | A route a tool returned, or a page | 1 | Nothing to open |
| **Do** · next | Questions to ask next | Words, sent as a follow-up | 2 | Nothing natural follows |
| **Do** · cards | Proposals, unchanged: approve, edit, not now, undo | The act tools' cards | As today | Nothing was asked to happen |

- **`now`:** when the person asked to open, show or see something, `do.open.now` is true. The Line then opens the place 250ms after the answer lands, as `ask-real.jsx:278` does today. This is the only definition of `now`.
- **Order:** Show draws the breakdown, then the figures, then the items.
- **The breakdown:** it draws with the chart kit's tokens (`SegmentBar`, `styles/charts.css`). The part marked for attention wears the warn status with its icon, as Reports does (`reports-sections.jsx:28-32`). Coral is never a data colour.

### 5.2 The type

```ts
// packages/contracts/src/ask-answer.ts
export interface AskAnswer {
  v: 2;
  form: "structured" | "prose";
  say: { headline: string; detail: string };
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null };
  do: { open: { to: string; label: string; now: boolean } | null; next: string[] };
  language: AskLanguage;
}
export interface AskFigure { value: string; label: string; note: string; source: AskSource | null }
export interface AskItem { title: string; meta: string; line: string; source: AskSource }
export interface AskBreakdown {
  label: string; // what the whole is: "customer messages"
  total: number; // 16: the renderer says "16 customer messages"
  parts: Array<{ label: string; value: number; warn: boolean }>;
  source: AskSource | null;
}
/** What the model names: a row or a page it read this turn. No route. */
export interface AskSourceRef { kind: AskCitationKind | "none"; id: string; label: string }
/** What the palette gets: the reference grounded, with the route the server derived (citationRoute). */
export type AskSource = AskCitation & { to: string };
export const ASK_ANSWER_CAPS = {
  headline: 160, detail: 700, figures: 4, items: 5, parts: 4, next: 2,
  value: 24, label: 60, note: 60, title: 80, meta: 60, line: 160, question: 90,
} as const;
```

The message keeps its proposals, language, grounding flag, tools, latency and rounds, as today (`AskMessageVM`, `contracts/ask.ts:537-557`), and gains `answer: AskAnswer`.

### 5.3 The format the model writes

`ASK_ANSWER_FORMAT` is the JSON schema passed as `output_config.format`. It is the model's side of section 5.2:
- Sources are `AskSourceRef`s.
- There is no `form`. What the model writes is structured by definition.

Every property is required and `additionalProperties` is false. "Nothing" is an empty string or an empty array, as the `finish` schema does today (`contracts/ask.ts:74-78`).

Structured outputs do not support length or numeric limits, so each limit is said in its property's description. The descriptions are generated from `ASK_ANSWER_CAPS`, and those numbers appear nowhere else the model reads.

The schema lists `say` first. A draft measures 4,361 characters, under the edge's 8,000 (`ask-gateway.ts:166`).

A change of `output_config.format` drops the prompt cache for the conversation (section 8.1). So a changed cap is a one-time cache reset across every conversation: a deploy-time change, made rarely. Nothing changes the format between rounds or turns.

### 5.4 From the model's JSON to what is drawn

`normalizeAnswer(raw, read)` in contracts replaces `parseAskFinish`, the grounding and the three repeat-removing helpers. It is pure and executed in tests. Its steps, in order:

1. **Clean every string.** Remove tags (`cleanAnswer`, kept), trim, and clip to the string's cap.
2. **Cut every array to its cap.**
   - A figure with no value is dropped.
   - An item with no title is dropped.
   - A breakdown survives only with at least two parts, each a finite number of zero or more, summing exactly to its `total`. A bar that says 16 and draws 7 + 3 + 5 is worse than no bar.
3. **Ground every source.**
   - Each `{kind, id}` is checked against this turn's read set (`groundCitations`, kept), and the route is derived with `citationRoute`.
   - An item whose row was not read is dropped: an item is its row.
   - A figure or breakdown whose source was not read keeps its words and loses its receipt.
   - A row with no route of its own, such as an appointment with no person on file, cites the page it came from (`calendar`). Pages are always allowed.
4. **One door:** section 5.5.
5. **Not from your data.** A digit anywhere in Say or Show, with no read and no card, marks the answer ungrounded (`isUngrounded`, kept, over the new text).
6. **Form.**
   - What the model writes is `structured` and needs a headline. With no headline, the turn fails with today's sentence: "I could not shape the answer. Ask again."
   - A failed turn is `structured` too. Its headline is the failure's sentence, and the message is marked `failed`.

`safeNavigate` and `ASK_PAGE_ROUTES` are read only by tests today. They go with the retired helpers.

### 5.5 One door, precisely

An answer can offer a door in four places: an item's row, Do's Open, a card's Open, and a receipt. `oneDoor(answer, cards)` in contracts runs after grounding, in this precedence:

1. **Items first.** An item keeps its door; it is the door for its row.
2. **Do's Open** is dropped when an item has the same route.
3. **A card's Open** is hidden when an item or Do's Open has the same route. The card's Approve, Edit, Not now and Undo always stay.
4. **A receipt** always says where its number comes from. Its door shows only when no item, Open or card offers that route.
5. **A next question** is dropped when it points at a place any door already offers (the `FOLLOWUP_ECHO` rule, moved here).

After this, no route is offered twice. A unit test holds that on every fixture, and an eval check holds it on every live answer (section 10.2).

### 5.6 Sources and receipts

**What a source is:** a grounded reference with its route.

**How it shows:**
- A figure with a source wears the page's sign that a word has more behind it: a dotted rule under the number (`dashboard-a-v2.css`, `.tl-text-door`).
- A press, a hover or focus opens its receipt. The receipt shows:
  - what the figure counts and its comparison;
  - "From" and the source's label;
  - the source's door, when section 5.5 leaves it one.
- An item is its own door.

**Which reads count:**
- Every read tool that returns people or rows records them in the read set.
- `get_calendar` starts recording the people it names (F5).

**What a receipt never carries:** a sentence the model did not attach to a read. The label is the model's short name for a row it read, as a citation's is today. The number beside it is the figure's own.

### 5.7 Right now and the quick answers

**Right now** names two populations, each with a clause of its own:
- the people waiting on you: Today's queue rows, which `threadStanding(...).needsYou` classifies;
- the runs waiting for your approval: Today's queue runs.

For example: "Ana and Sam are waiting on you; one playbook run is waiting for your approval."

**Where the queue comes from:**
- The surface seam that feeds Today classifies the queue once and publishes it. The plan names where.
- The sidebar badge counts its people rows.
- The palette reads the same publication on any page. When the page has not read it, the seam reads it through the read cache first.

**Quick answers.** They still need no model (`fastPath`), and now return an `AskAnswer`:
- **"Who needs me":** the Right now row's ↵ opens it at once.
  - Say: Right now's sentence.
  - Show: the people, then the runs, each a door.
  - Do: no Open, because the items are the doors.
- **"Did anyone call":** the day's missed calls as items; Do opens Live.
- **"What is open":** the openings route's days as items, one per day with its windows as the line; Do opens the Calendar.

The sentences live in contracts (`rightNowLine`, `quickAnswer`), in English and Spanish.

### 5.8 Old answers

`answerFromV1(content)` makes a `prose` answer:
- **`detail`** is the old text, and `headline` is empty.
- **Row citations** (thread, conversation, call, person) become items. The title is the label, and the meta is the kind's word.
- **A page citation** was a door to its page. It becomes `open` when the answer had no navigate; otherwise it is dropped, because a place appears once.
- **`navigate`** becomes `open`.
- **`followups`** become `next`.
- The result goes through `oneDoor`.

The mapper stays. The purge drops threads untouched for 90 days (`00040_ask.sql:86-103`), so a thread still in use keeps its old turns. The prose form also carries a turn whose format the API refused (section 7.2).

`v1FromAnswer(answer)` derives the v1 fields the server keeps writing beside `answer`:
- `text`: the headline and the detail. It is what the history, copy, read aloud and search use.
- `citations`: the items' and receipts' sources.
- `navigate`: `open`.
- `followups`: `next`.

The erase route's content search still finds a person, because sources carry their ids (`00040_ask.sql:128-134`).

Tests:
- a stored v1 row renders;
- `v1FromAnswer`'s fields satisfy today's v1 readers.

Neither mapper claims an identity round trip.

### 5.9 Two answers, as the model writes them

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
      "label": "customer messages",
      "total": 16,
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

After section 5.5:
- Do opens Reports.
- The three receipts still say "From Reports · past 7 days", but carry no door of their own.
- The breakdown's parts add up to 16, so it draws.

"Who needs me right now?" with a model (fictional names, ids elided):

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

The second answer has no Open, because each item is already a door.

## 6. The Line

### 6.1 Where it sits and how it opens

**On a desktop (721px and up):**
- The panel is 720px wide (`min(720px, 100vw - 48px)`), 96px from the top, with radius 16, on `--bg-raised`, with a `--line-strong` border and `--shadow-lg`.
- The page stays visible under a scrim of `--bg-sunken` at about 64%. There is no blur.
- The panel's height is at most `100vh - 144px`. What is under the line scrolls; the line itself never scrolls away.
- A press outside, Esc, or ⌘K again closes it.

**Opening:**
- The panel fades in over 160ms and rises 4px.
- The three move from the top bar's button into the line: a FLIP from the button face's box to the line face's box.
- The button's face is hidden while the panel is open; one character stands in the line.
- With reduced motion, neither moves.
- The three are one character following one mood (`legacy-bridge/mascot/mood.ts`), as today.

### 6.2 The line itself

The line is 64px high:
- **Left:** the three, on a 44×36 canvas sized with `fitSide` (`character.ts`).
- **Middle:** the scope chip when Ask opened on a row ("Emily Chen ×", as today), then the input at 18px.
- **Right:** a slot that changes with the state.

| State | Right slot |
|---|---|
| At rest, typing | Hold to talk (36px) |
| Listening | The mic, pressed |
| Reading | Esc and a Stop button |
| Answered | Copy, read aloud, and Clear (✕) |

### 6.3 Under the line, state by state

- **Home (canvas A1):**
  - First, the Right now sentence (section 5.7), as the active row. ↵ on the empty line opens its quick answer.
  - "Ask about ⟨the page⟩" with three questions, "Brief me on today" among them on Today (`buildAskSuggestions`'s asks).
  - "Earlier" with three conversations and their day.
  - No Act rows and no Jump to.
- **Typing:**
  - The words as a question, with ↵ on the active row. No "Instant answer" tag: a quick answer is simply quick.
  - Jump to: up to 6 people, threads, calls and pages, as today (`askJump`).
  - The suggestions that match. Those that make a card say "Card" in the row's quiet meta.
- **Listening:**
  - The heard words stream into the input as its caption, dimmed until the recogniser settles.
  - The three huddle.
  - Nothing is drawn under the line.
- **Reading (A2):**
  - The trace, in the tools' own words (`toolLabel`, `proposalLabel`), up to three lines.
  - A finished read is a dim ✓, and the current one has a coral dot.
  - No counts, no spinner: the three leapfrog in the line.
- **The answer (A3):**
  - Say streams as it is written (section 7.4), with the three in their row, beating per word.
  - Show and Do come in from the final message (120ms fade), and the three nod.
  - Each part sits beside its square (light, mid and dark, 8px) at the part's first line.
  - A prose answer draws its detail at body size, with no headline.
- **A quick answer:** the same parts at once. No reading state; the three nod.
- **A failure:**
  - Say is the loop's sentence for it, as today (`loop.ts:124-143`, `:386-583`).
  - Do is Try again.
  - The three shake.

### 6.4 A conversation

- **A follow-up.** Asking while an answer is on screen is a follow-up on the same thread. The answer folds into one row above the line: its square, then the question and its headline, cut to fit.
- **Folded rows.** A folded row opens in place, one at a time, with its cards in the state they were left. More than three folded rows collapse behind "+N earlier in this conversation".
- **Closing and Clear.** Closing Ask keeps the conversation, and ⌘K brings it back (D14). Clear (✕) ends it and shows home; the thread stays in Earlier.
- **Earlier** opens with ⌘J, or from the last row under Earlier on home.
  - It replaces what is under the line with every conversation: the question, the day, and a ✕ that asks before deleting (N5, as today).
  - ↵ opens a conversation with its turns folded and the last one open.

### 6.5 Keys

| Key | When | Does |
|---|---|---|
| ⌘K / Ctrl K | Anywhere | Opens or closes Ask |
| ↵ | The line | Asks; on an empty line, runs the active row |
| ↑ ↓ | Any time | Walks the rows under the line (home, typing, Earlier, an answer's items and moves). They are one listbox with one tab stop; the line keeps focus (`aria-activedescendant`) |
| Esc | Reading | Stops the turn |
| Esc | Otherwise | Closes |
| ⌘J | Open | Earlier |
| Space, held | An empty line | Talks while held (section 6.6) |

The `?` sheet lists these keys (contracts `SHORTCUTS`). The panel draws no footer.

### 6.6 Voice

- **Holding Space:**
  - On an empty line, a Space held for 300ms starts listening (`useAskTalk.start`), and letting go asks.
  - A tap does nothing, because an empty line takes no leading space.
  - Once there are words, Space is a space.
- **The mic** is held as today.
- **The microphone permission** follows `useAskTalk` as built: the Permissions API check where it exists, and the "blocked" sentence naming the site settings.
- **Reading aloud** speaks Say (the headline, then the detail) through the existing speech client, from the line's button.

### 6.7 Phone (720px and below)

- **Opening.** The ✦ opens the line docked at the bottom: 56px high, radius 16, 12px from the sides, above the safe area. It rides the keyboard with `visualViewport`, as the `.phone-ask` sheet does now.
- **The answer** rises above the line as a sheet, at most 88% of the height:
  - Its head holds a grabber, the question at 13px, and a 44px close.
  - Say comes first, then Show with its figures two by two, then Do with its moves as 48px rows.
- **Earlier** is a button in the sheet's head.
- **The ✦** hides while the sheet is open, as today.

### 6.8 Today's band

The band keeps what the three's spec settled (section 4.7): always the full face, and a field that slides in on a tap.
- Its exchange draws the same answer component, in its compact size.
- Proposals still hand off to the palette ("Review in Ask").
- `A.shape(message)` (`today-face.jsx:275`) becomes `A.answer(message)`.

### 6.9 What goes

- **The rail** (`ask-real.jsx:305`, `:311`).
- **The sparkle avatar** (`ask-turn.jsx:186`).
- **The question bubbles.**
- **The link and follow-up chips:** `AskLinks` and `AskFollowups` (`ask-turn.jsx:41-72`).
- **The footer** (`ask-real.jsx:389`).
- **The row tags:** "Instant answer" and "Reads your workspace as you".
- **The Act and Right now lists on home.**
- **The back button** and the coral action chip.
- **The 80px stage** (`ask-real.jsx:316`), because the three are in the line.
- **New Chat and `ask:new`** (`sidebar.jsx:436-452`, `app-shell.jsx:815`, and the listener at `ask-real.jsx:147`).
- **From the contract,** once nothing reads them:
  - the `finish` schema and its parser (`contracts/ask.ts:79-252`);
  - `navigateLabel`, `citationsToShow` and `followupsToShow` (`:1111-1150`);
  - `safeNavigate` (`:364-378`).
- **From the tools:** `FINISH_TOOL` (`server/ask/tools.ts:187-193`).

### 6.10 Accessibility

- The panel is a `role="dialog"` with its name.
- The line is a combobox over the listbox of rows, with `aria-expanded` and `aria-activedescendant`.
- The answer region is `aria-live="polite"`. It announces the headline once, when it is complete, not every delta.
- A receipt is a button with `aria-expanded`.
- The three's canvas is `aria-hidden`.
- Touch targets are at least 44px on a phone, and the tokens' contrast holds as today.
- Every word lives in `ask-text.jsx`, in English and Spanish.

## 7. The turn, on the server

### 7.1 A round's request

```ts
{
  model: ASK_MODEL,
  max_tokens: ASK_MAX_TOKENS,               // one number in contracts, read by the loop and by the edge's clamp for Ask
  system: [stable /* cached */, snapshot /* cached, 20 s */, prefetch, turn],
  messages,                                  // history, the question, then this turn's rounds, append-only
  tools: [...READ_TOOLS, ...ACT_TOOLS].map((t) => ({ ...t, strict: true })),  // act tools for operators and owners only
  tool_choice: last ? { type: "none" } : { type: "auto" },
  output_config: { effort: "low", format: { type: "json_schema", schema: ASK_ANSWER_FORMAT } },
}
```

- **Strict tools.** Every tool becomes strict; today only `finish` is (`tools.ts:192`).
- **When the API refuses strict,** the retry without it stays (`loop.ts:372-376`).
- **When the API refuses the format,** the round is retried without it:
  - the answer's words become a `prose` answer;
  - `ask_format_rejected` is logged.

### 7.2 How a turn ends without a finish tool

| A round returns | The loop |
|---|---|
| Tool calls only | Runs the reads and the acts in parallel, as today, and asks again |
| The answer only | Normalises it (section 5.4); the turn is answered |
| Act calls and the answer | Runs the acts, and the answer stands, as it does with `finish` today (`loop.ts:447-449`) |
| Read calls and the answer | Sets the answer aside, runs the reads and asks again, as today (`:450-456`) |
| Only cards, all made | Builds the answer from the cards with `answerForCards` (contracts, English and Spanish), with no second round, as today (`:517-537`) |
| The answer without the format | A `prose` answer (section 7.1) |
| Nothing, the cap, a refusal, a timeout, a broken stream | Today's sentences, as a failed `structured` answer with Try again |

The last round's `tool_choice: none` leaves the model one thing to do: write the answer. Opus 5.5 accepts `auto` and `none` (section 8.1).

### 7.3 Thinking blocks

- **`sse.ts`** reads `thinking` and `redacted_thinking` block starts as their own kinds, not as text. It reads `thinking_delta` and `signature_delta` as the deltas they are.
- **`round.ts`** keeps each block's thinking, signature or redacted data.
- **`loop.ts`** replays the assistant's turn with every block, in order and unmodified. A thinking block is never padded into text again (F6).
- **Nothing reaches the person.** The display is omitted by default, and the trace stays the tools' own words.
- **The loop never edits an earlier message.** "Time is up for reads" is appended to the newest user message before it is sent (`loop.ts:555-565`), which is append-only.

This ships first, in the protocol PR (section 11). It is correct for any model, and required before Opus 5.5 can run.

### 7.4 Streaming Say

Streaming is a preview. The final message is the only source of truth: a streamed Say is replaced by the final one, and Show and Do draw only from the final message. No key order can leave a half-drawn answer.

- The answer arrives as text deltas of JSON.
- `partialSay(prefix)` (contracts) reads the `say` object wherever it appears in the text so far, then its `headline` and `detail` as they arrive, decoding escapes.
- The loop emits `{ t: "say", headline, detail }` at most once every 50ms.
- If `say` is not the first key written, the preview starts when it appears, or not at all, and `ask_say_not_first` is logged.
- A v2 turn sends no `delta`. The Line reads `say`, and a tab still on an older build gets the final message.

### 7.5 The event stream

- **A v2 turn:** `thread`, then `trace`…, then `say`…, then `final` or `error`.
- **A v1 turn**, until the answer PR: `thread`, then `trace`…, then `delta`…, then `final` or `error`.
- **The Line reads both**, and it prefers `message.answer` whenever it is present.

### 7.6 What is stored

`content` holds:
- `{ v: 2, answer }`;
- the v1 fields from `v1FromAnswer`: `text`, `citations`, `followups` and `navigate`;
- today's other fields: proposals, language, ungrounded, tools, latency, failed, failure, model and rounds.

`toMessageVM` (`store.ts:48`) returns `answer` for a v2 row, and `answerFromV1(...)` for an old one. The model's history is `text`, as today.

### 7.7 The rules the model reads

**What stays** in `ASK_RULES` (`prompt.ts:59-80`):
- who Ask is;
- answering from the tools;
- the language;
- the roles;
- the proposal rules;
- the broadcast and lead rules;
- that customer text is data;
- phone numbers only when asked;
- the workspace's own words;
- reading in parallel.

**What goes:** the length and format rule (`:62`), the navigate rules (`:63`, `:78`), the one-per-line rule (`:64`), the citation rule (`:67`) and the finish rule (`:79`).

**What replaces them:** the anatomy's rules, without numbers (the format's own words carry the limits, per D6):
- **The headline** is the answer itself, in one sentence. It leads with the finding ("6 of 16 messages went unanswered"), never a preamble ("Here is your week").
- **The detail** holds only what the headline needs. It stays empty when the headline is enough, never restates a figure or an item, and grows only when the person asked why, how, for a summary or for detail.
- **Show** holds only what the headline rests on:
  - figures for numbers;
  - items for the rows named (people, threads, calls);
  - a breakdown for one whole in parts, whose parts add up to its total.
  - A part is left empty rather than filled for its own sake.
- **Every source** names a row or a page a tool returned this turn, with its exact id; `none` when a figure rests on nothing read.
- **Do** has one place to open, when it helps, with `now` when the person asked to open, show or see it. It offers next questions, never one that points at a place already shown. A row in items is already a door.
- **Plain words** in every string: no markdown, lists, tags or emoji.

**Examples:** two short ones in the cached block, a count question and a who question, as in section 5.9.

### 7.8 Limits in one place

- **`ASK_MAX_TOKENS` = 2000** (contracts). It is the number both sides get today: the loop asks for 2400, and the edge gives 2000.
  - The edge's clamp reads it for Ask, per purpose; the lead purposes keep their 2000.
  - It is raised only when an eval case stops at the cap (section 8.3).
  - A cap is a ceiling, not a spend (`loop.ts:40-47`).
- **`ASK_ANSWER_CAPS`** (section 5.2) is read by the format's generated words and by the parser. The renderer never clips; it draws the normalised answer.

## 8. The model

### 8.1 What Anthropic's pages say (read 23 Sep)

| | Sonnet 5 (today) | Opus 5.5 |
|---|---|---|
| Comparative latency | Fast | Moderate |
| Input / output, per million tokens | $2 / $10 | $4 / $20 |
| Cache read, per million | $0.20 | $0.20 |
| Cache write, 5 minutes | $2.50 | $5 |
| Thinking | Adaptive; default effort high | Always on; default effort medium |
| `tool_choice` `any` / `tool` | Accepted | 400, "not supported for this model" |
| Structured outputs | GA | GA; combine with tools in one request |

Sources:
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/models/opus-5-5/migration-guide
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs

Opus 5.5 is cheaper than Opus 5 ($5 / $25), and the models page suggests starting with it for most workloads. Next to Sonnet 5, which Ask runs on, it is ranked slower and costs twice as much per uncached token.

### 8.2 What that means for Ask

- **Cost.** Most of a turn's prompt is cached: the rules, the definitions, the facts, and the snapshot kept twenty seconds. A cache read costs the same on both models. The question, the reads' results and every output token, thinking included, cost twice as much on Opus 5.5.
- **Speed.** The 7 Sep note (`contracts/ask.ts:22-30`) chose Sonnet 5 over Opus 5 for speed at the same grounding, and Opus 5.5 is ranked between them.
- **Why try Opus 5.5 at all.** The new format asks the model to judge: what to show, how to lead with the finding, and when to leave a part empty. That is where a larger model may be worth its time.
- **Hence D11.** Sonnet 5 stays unless the gate below shows Opus 5.5 is better at what a person sees, fast enough, and worth its cost.

### 8.3 The gate

**Where the runs happen:**
- Every run uses a local build of the branch under test, with `EDGE_PROVIDERS=live` (`server/deployment.ts:31`), against the production edge.
- It runs as the e2e owner, on the seeded e2e workspace, so production users are untouched and every run reads the same data.
- The plan's first step checks this path with one case.
- If the edge refuses a local caller, each run moves to right after its deploy, with a rollback rule: revert when a case that passed before fails.

**The runs:**
1. **Baseline:** `main` (v1, Sonnet 5), three runs.
2. **The answer PR's build** (v2, Sonnet 5), three runs, before it merges.
   - Every case passes.
   - The quality review below, old palette against the Line, shows no loss.
3. **The model PR's build** (v2, Opus 5.5), three runs, back to back with three fresh Sonnet 5 runs.

**What each run measures:**
- the pass count;
- the median and p90 time to the first Say words, and to the final message;
- the one-round count;
- how many cases stopped at the cap;
- tokens and dollar cost per answered turn (Ask's usage rows, `usage.ask_tokens`, priced by section 8.1).

**The quality review:**
- Twelve curated questions: counts, who, why, open, a request to act, and Spanish.
- Each question's two answers sit side by side on one page, the models hidden and the order shuffled.
- Ruben picks the better answer per question on five points:
  - it leads with the finding;
  - Show earns its place;
  - nothing is repeated;
  - the next step is obvious;
  - it is complete enough.

**Opus 5.5 replaces Sonnet 5 only if all of these hold:**
- it passes every case Sonnet 5 passes;
- Ruben prefers it on at least 8 of the 12;
- its median time to first words is within 1.5s of Sonnet 5's;
- no case stops at the cap. If one does, `ASK_MAX_TOKENS` is raised on that evidence, and the run is repeated.

**The call:** its cost per answered turn and its p90 final time sit beside those numbers, and Ruben makes the call. Otherwise Sonnet 5 stays, and the contract's note records the runs, as the 7 Sep note did.

Opus 5.5's fast mode (research preview, $8 / $40) is out of scope.

## 9. The code: modules and what each owns

| File | Owns | Change | PR |
|---|---|---|---|
| `apps/edge/lib/ask-gateway.ts` | What the gateway accepts | Allows `claude-opus-5-5`; allows a format for Ask under 8,000 characters; clamps `max_tokens` per purpose, Ask's from `ASK_MAX_TOKENS` | 1 |
| `apps/dashboard/src/server/ask/sse.ts`, `round.ts`, `loop.ts` | Frames, blocks, the turn | Thinking blocks carried and replayed unmodified; the loop asks `ASK_MAX_TOKENS` | 1 |
| `packages/contracts/src/ask-answer.ts` (new) | The anatomy: the types, the caps, `answerFromV1`, `oneDoor`, the quick answers and `rightNowLine` (PR 2); `ASK_ANSWER_FORMAT`, `normalizeAnswer`, `partialSay`, `answerForCards` and `v1FromAnswer` (PR 3) | New; exported from the index; `dist` rebuilt | 2, 3 |
| `legacy-bridge/ask/palette.ts`, the surface seam | What the palette knows before a model | `answer(m)` replaces `shape`; Right now reads the published queue; the quick answers return v2 | 2 |
| `legacy/pages/ask-real.jsx` | The palette | Rewritten as the Line: its states, folding, Earlier, keys, hold Space and the FLIP | 2 |
| `legacy/pages/ask-turn.jsx` | An answer | `AskAnswer` in both forms, with receipts, and `AskCard`, restyled | 2 |
| `legacy/pages/ask-home.jsx`, `ask-hooks.jsx`, `ask-text.jsx` | The rows, the hooks, the words | Home and typing rows; `useHoldSpace`; new words, and the retired ones removed | 2 |
| `legacy/pages/today-face.jsx`, `legacy/components/sidebar.jsx`, `legacy/pages/app-shell.jsx`, `legacy/styles/ask.css` | The band, the doors, the look | The band draws `AskAnswer`; New Chat and `ask:new` go; the Line's styles | 2 |
| `server/ask/loop.ts`, `round.ts`, `tools.ts`, `proposals.ts`, `prompt.ts` | The turn | No `finish`; `auto` then `none`; the format; the fallback to prose; strict tools; `get_calendar` records its people; the anatomy's rules | 3 |
| `app/api/v1/ask/route.ts`, `server/ask/store.ts` | The door and the rows | `say` lines; v2 stored beside derived v1; old rows mapped on read | 3 |
| `packages/contracts/src/ask.ts` | Limits, model, proposals, scope, jump, suggestions | `ASK_MAX_TOKENS` (PR 1); `fastPath` moves out (PR 2); `finish` and the repeat-removing helpers removed (PR 3) | 1–3 |
| `tooling/scripts/eval-ask.mjs` | The eval set | The v2 checks; time to the first Say words; cost per answered turn | 3 |
| `ASK_MODEL` in contracts | The model | `claude-opus-5-5`, only if it wins the gate | 4 |

Every edited page and stylesheet bumps its `?v=` in both lists (`legacy-bridge/manifest.ts`, `legacy/Chanlytics.html`). There is no new page file: the answer lives where a turn is drawn today.

## 10. Proof

### 10.1 Node tests (`pnpm test`)

**PR 1:**
- The stream parser's test reads thinking frames.
- An `ask-turn.test.mjs` scripted round with thinking blocks shows them replayed byte for byte, with their signatures.
- `llm-door.test.mjs` shows the edge takes `claude-opus-5-5` and an Ask format under 8,000 characters, and clamps Ask to `ASK_MAX_TOKENS`.

**PR 2:**
- A new `ask-answer.test.mjs` (executed, no source reads) covers:
  - `answerFromV1` on stored v1 shapes, with row citations as items and a page as Open only when there was none;
  - `oneDoor` over every door on fixtures, where no route is offered twice;
  - the quick answers built from a published queue of two people waiting and a run, so that "who needs me" names exactly those;
  - calls and openings.
- `ask-palette.test.mjs` draws the Line on the stub React:
  - home, with Right now from the queue;
  - typing, reading, and both answer forms;
  - receipts;
  - folding on a follow-up, Clear, and Earlier;
  - ↑ ↓ ↵, and Esc stopping then closing;
  - hold Space;
  - deleting only when asked twice (N5), kept.
- `today-face.test.mjs` draws `AskAnswer` and still hands a card to the palette.

**PR 3:**
- `ask-answer.test.mjs` adds:
  - the format matching the parser key for key, forbidding extras, and staying under 8,000 characters;
  - caps and cleaning;
  - grounding, with a route derived and never taken from the model;
  - a breakdown whose parts do not add up, dropped;
  - not from your data;
  - `partialSay` on every prefix of a real answer, with `say` first and with `say` last;
  - `answerForCards` in English and Spanish;
  - `v1FromAnswer` read by today's v1 readers.
- `ask-turn.test.mjs` adds:
  - the answer as JSON text;
  - `auto` on each round and `none` on the last, read from the request the port receives;
  - an act beside the answer;
  - a read beside the answer, set aside;
  - cards only;
  - a refused format, retried and answered as prose;
  - the cap reached mid-answer, which ends in its sentence.
- `ask.test.mjs` loses its source pins on the retired shape: the `finish` schema, sixty words, one per line and the chips. Its baseline falls in the same PR (`UPDATE_SOURCE_SCAN_BASELINE=1`), and nothing new reads source.

**Kept green throughout:**
- refusals-on-the-page;
- the-pages-say-only-what-is-true;
- the two leads suites that use `__ask`.

### 10.2 The eval set

`eval-ask.mjs` gains five checks on every case:
- the headline is one sentence;
- no route is offered twice, across items, Open, card Opens and receipt doors;
- every non-page source is a real id;
- the cases marked as counts have figures or a breakdown;
- a breakdown's parts add up to its total.

It also records the time to the first `say` line and the cost per answered turn. The runs, and the quality review beside them, are in section 8.3.

### 10.3 In a browser

**The keyboard and focus** are checked in the running app, not only on the stub React:
- the combobox and the listbox;
- ⌘J;
- hold Space;
- Esc stopping then closing;
- focus returning to the line.

**`e2e/ask.spec.ts`** moves to the Line's test ids (`ask-line`, `ask-say`, `ask-show`, `ask-do`, `ask-earlier`) and opens Ask from the top bar where it used New Chat. So does `e2e/team-card.spec.ts:102`. `e2e/phone.spec.ts:39` opens the docked line from the ✦.

### 10.4 Seen in the app

- **The running app:** a dev server on the salon workspace at 1440, 1024 and 375 wide, against canvas frames A1–A4.
- **Production, after each PR:**
  - "who needs me right now?" names what the queue names;
  - "how did the week go?" draws its breakdown and figures with receipts;
  - "open the most recent call" lands on the call.

## 11. Delivery

| PR | What | Why it is safe to deploy |
|---|---|---|
| 1 · Protocol | The edge allows `claude-opus-5-5` and an Ask format, and clamps Ask to `ASK_MAX_TOKENS` (2000, in contracts, which the loop also asks for). The dashboard carries and replays thinking blocks. | Nothing sends a new model or format yet. The replay matters only once a thinking block arrives. |
| 2 · The Line | The palette as the Line; `AskAnswer` in both forms; `answerFromV1`; `oneDoor`; Right now and the quick answers from the published queue; the band; the phone; New Chat and `ask:new` removed; the words and styles. | No server change. It draws today's answers in the prose form, and a v2 answer whenever one arrives. |
| 3 · The answer | Structured output replaces `finish`; `normalizeAnswer`; sources for every read; the breakdown's total; `say` streaming; the rules; the route stores v2 beside v1; the eval checks. Still Sonnet 5. | Merged after PR 1 is live and after its pre-merge runs pass (section 8.3). The Line already draws it. |
| 4 · The model | `ASK_MODEL = "claude-opus-5-5"`, only if it wins the gate. | One line, and one line back. |

## 12. Risks

- **R1. A new combination.** Constrained output, thinking and tools on one stream are new to this loop. Scripted tests hold the shape, and the pre-merge runs hold the reality.
- **R2. Grammar compilation.** The first use of a schema compiles a grammar, cached for 24 hours from its last use. The first question after a quiet day pays for it, and the runs' first case measures it.
- **R3. Key order.** Streaming is a preview (section 7.4). A different key order costs the preview, never the answer.
- **R4. `tool_choice: none`** on the last round is accepted on Opus 5.5 according to its pricing page (`auto`, `none`), and the first pre-merge run confirms it. The fallback is `auto`, with "Answer now" appended to the newest message.
- **R5. Cost on Opus 5.5.** The daily budget counts tokens, not dollars, so it bites at the same volume on either model. The gate prices every answered turn.
- **R6. Space held while typing.** It applies only to an empty line, and only to a hold of 300ms or more.
- **R7. The source-scan ratchet.** Pins leave with the baseline lowered in the same PR.
- **R8. Old threads.** They read through `answerFromV1`, which stays.
- **R9. The local eval path.** If the production edge refuses a local build, the runs move to right after deploy, with the rollback rule in section 8.3.

## 13. Out of scope

- The Companion's pointing at a page's rows (B2). It can come later, on the same parts.
- The Stage (C).
- Answering aloud unasked.
- New tools or proposal kinds.
- Routing hard questions to a larger model.
- The demo's AskBar (`dashboard-a-ask.jsx`, demo only).
- Opus 5.5 fast mode.
- The lead finder's own composer. It uses `__ask.send` and the card, which the server keeps sending.

## 14. For Ruben to approve

1. **The Line and Say · Show · Do**, as this document specifies them.
2. **New Chat leaves the sidebar.** The labelled Ask button in the top bar and ⌘K stay on every page.
3. **Sonnet 5 stays until Opus 5.5 wins the gate:** your blind review, first words within 1.5s of Sonnet 5, and no case at the cap. Cost per answer is shown for your call.

## 15. What the review of revision 1 changed

**Taken:**
- A precise one-door policy over every door (section 5.5). Revision 1's own week example offered Reports twice.
- Two explicit answer forms (D15).
- Routes that belong to the server (D5).
- Streaming as a preview only (section 7.4), and no `delta` beside `say`.
- A detail that grows when asked why.
- A breakdown that must add up to its `total`.
- Numbers said once, in the format (D6).
- `now` defined once.
- Resume until Clear, instead of a ten-minute cutoff (D14).
- Right now as the queue itself, and ↵ on its row opening what it names (section 5.7).
- `ASK_MAX_TOKENS` at the 2000 both sides get, instead of 4000.
- The eval set run before merge on local builds, three runs a side, a blind quality review and cost per answer, with Sonnet 5 as the default.
- The Line shipped before the new answer (D16), with the thinking replay moved into the protocol PR.
- The old-answer mapper kept for good, because the purge drops only untouched threads.
- Keys checked in a browser.
- `ask:new` removed with New Chat.

**Not taken:**
- **"Fix the clutter in the palette alone; structured output is a separate bet."** Prose cannot carry a figure, a row or a split; that is F1. D16 still ships the visible change first.
- **"Cut the three's beat and nod."** Those are shipped and approved, and the Line adds no new motion.
- **"Keep New Chat for discoverability."** The top bar's labelled Ask button is on every page. It remains question 2.
- **"Drop streaming."** Time to first words is what the gate measures, and Say is written well before the rest.
- **"Put the server change behind a flag."** That would be a second loop. Local pre-merge runs replace it.
- **"Baseline Opus 5.5 on the old loop."** The old loop's forced tool choice is a 400 on Opus 5.5.
- **"`citationRoute` is undefined; old citations have no route."** It is at `contracts/ask.ts:315`, and stored citations carry `to` (`loop.ts:485`).
- **"Line numbers don't match."** Rechecked against `793c128d`. Two ranges in `ask-home.jsx` were off by one and are fixed; the rest match.
