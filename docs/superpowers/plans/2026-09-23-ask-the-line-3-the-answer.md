# Ask, the Line · Plan 3 of 4: the answer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The model writes the answer as the Line draws it (Say · Show · Do), as structured output on Sonnet 5.
- `finish` goes, and the rounds ask `auto`, then `none` on the last.
- Sources are grounded and their routes derived by the server.
- Say streams as a preview.
- The route stores v2 beside the v1 fields it derives.
- The eval set checks the new shape and times the first words.

**Spec:** `docs/superpowers/specs/2026-09-23-ask-the-line-design.md`: sections 5.2–5.6, 5.8, 7.1–7.7, 10.1 (PR 3) and 10.2; decisions D3, D5, D6, D9 and D15.

**Gate (Ruben, 23 Sep: "Pull env locally").**
- Three runs of the baseline (`main` at `cf76ee0c`, v1) and three runs of this branch's build (v2).
- Both are production builds served on `localhost:3290` against the production edge, as `e2e-owner@example.com` on the seeded e2e workspace.
- The env comes from `vercel env pull` into `apps/dashboard/.env.production.local`, which is gitignored and never printed.
- The server runs with `VERCEL_ENV=development EDGE_PROVIDERS=live`.
- It merges when every case that passes on the baseline passes on v2.
  - The case set was written against the salon, so a case can fail on both on the seeded workspace's data. That says nothing about v2.
- The first-words median is reported beside the baseline's.

**Worktree:** `cm-face`, on branch `design/ask-the-line-3`, off `origin/main` at `cf76ee0c`.

---

## Files

| File | Change |
|---|---|
| `packages/contracts/src/ask-answer.ts` | `AskSourceRef`, `ASK_ANSWER_FORMAT` (worded from the caps), `normalizeAnswer`, `partialSay`, `answerForCards`, `failedAnswer`, `proseAnswer`, `v1FromAnswer` |
| `packages/contracts/src/ask.ts` | Remove `ASK_FINISH_JSON_SCHEMA`, `AskFinishSchema`, `AskFinish`, `parseAskFinish`, `recoverCitations`, `partialAnswer`, `normalizeNavigate`, `safeNavigate`, `citationsToShow` and `followupsToShow`. Kept: `cleanAnswer`, `groundCitations`, `citationRoute`, `isUngrounded` and `navigateLabel` |
| `apps/dashboard/src/server/ask/tools.ts` | No `FINISH_TOOL`; `get_calendar` records the people it names (F5) |
| `apps/dashboard/src/server/ask/round.ts` | Streams the text blocks' words (`onText`); nothing about `finish` |
| `apps/dashboard/src/server/ask/loop.ts` | The turn without `finish` (the table below); `TurnResult.answer` is an `AskAnswer` |
| `apps/dashboard/src/server/ask/prompt.ts` | The anatomy's rules replace the length, navigate, one-per-line, citation and finish rules; two short examples; `resultTitle` goes (D9: a thread is titled by its question) |
| `apps/dashboard/src/server/ask/store.ts` | `toMessageVM` returns a v2 row's `answer`; `retitleThread` goes |
| `apps/dashboard/app/api/v1/ask/route.ts` | `{v:2, answer}` stored beside `v1FromAnswer`'s fields; `say` lines; no retitle |
| `apps/dashboard/src/legacy-bridge/ask/api.ts` | `SendEvent` gains `say` |
| `apps/dashboard/src/legacy-bridge/mascot/turn.ts` | A `say` event replaces the words (a preview), where a `delta` appended |
| `apps/dashboard/src/legacy/pages/ask-real.jsx`, `ask-turn.jsx`, `today-face.jsx`, `styles/ask.css` | The Line and the band draw a streaming Say (the headline, then the detail); a failed structured answer is quiet |
| `tooling/scripts/eval-ask.mjs`, `tooling/evals/ask-cases.json` | First words timed, as median and p90; the v2 checks (one-sentence headline, no route twice, real ids, counts have figures, a breakdown adds up); `counts` on the two count cases |
| Tests | `ask-answer.test.mjs` (format, normalize, partialSay, cards, v1FromAnswer); `ask-turn.test.mjs` (the scripted rounds answer as JSON text; `auto`/`none`; an act beside the answer; a read beside it set aside; cards only; a refused format answered as prose; the cap mid-answer); `ask.test.mjs` (retired pins go, baseline falls); `ask-palette.test.mjs` N18 (`groundCitations` in place of `safeNavigate`); `mascot-turn.test.mjs` (`say`) |

## How a turn ends (spec 7.2)

| A round returns | The loop |
|---|---|
| Tool calls only | Runs the reads and the acts in parallel and asks again |
| The answer (JSON text) only | `normalizeAnswer`; the turn is answered. One door runs where the answer is drawn (the Line, the band), so an Open they asked for keeps its `now` beside the same row's item |
| Act calls and the answer | Runs the acts; the answer stands when every card was made. A card refused or cut off sets the answer aside (`ask_answer_beside_refused_card`), and the round goes back to the model |
| Read calls and the answer | Sets the answer aside (`ask_answer_beside_read`), runs the reads, asks again |
| Words beside a call, with the format on | The model thinking aloud: never the answer; the calls run as if alone |
| An answer set aside after its Say was sent | An empty `say` takes it back; the Line shows the reads again |
| Only cards, all made | `answerForCards`, no second round |
| A 400 naming `output_config`/`format` | Retries the round without the format (`ask_format_rejected`); words that come back are a `prose` answer, and JSON (the rules still ask for it) is read as JSON |
| Any other 400 naming `strict` or a schema | Retries without strict (`ask_strict_rejected`), as today; a second one, without the format too |
| JSON that does not normalise (the cap mid-answer, no headline) | `failedAnswer("I could not shape the answer. Ask again.")`; `ask_answer_unparsed` |
| Nothing, a refusal, a timeout, a broken stream, rounds exhausted | Today's sentences, as `failedAnswer` |

- **The request.** Every round has `tool_choice: {type: "auto"}`, and the last `{type: "none"}`. `output_config` is `{effort: "low", format: {type: "json_schema", schema: ASK_ANSWER_FORMAT}}`. Every tool is `strict` until the API refuses it.
- **Time.** "Time is up" is appended to the newest user message: "Answer now with what you have." The next round is the last, so it is `none`.
- **Streaming.** The text's `say` is read by `partialSay` and sent as `{t: "say", headline, detail}`, at most every 50ms. With the format refused, it is sent as `{t: "say", headline: "", detail: words}`. There is no `delta`. `ask_say_not_first` is logged once when the JSON's first key is not `say`.

## Tasks

### Task 1: The answer's format and its reader (contracts)

- [x] Write the tests first, in `ask-answer.test.mjs`:
  - The format names exactly the parser's keys, forbids extras and is under 8,000 characters.
  - Every limit is said in its description from `ASK_ANSWER_CAPS`.
  - `normalizeAnswer`:
    - cleans and clips every string;
    - drops a figure without a value and an item without a title or a read row;
    - keeps a figure's words when its source was not read, but drops its receipt;
    - derives every route (a route the model writes is never taken);
    - drops a breakdown that does not add up, or has fewer than two parts;
    - turns open `none` into null;
    - refuses a headline-less answer and non-JSON.
  - `partialSay` on every prefix of a real answer, with `say` first, then with `say` last.
  - `answerForCards` in English and Spanish.
  - `failedAnswer` and `proseAnswer`.
  - `v1FromAnswer` read back by `answerFromV1` and by today's v1 readers: the text, the citations with their routes, navigate and the follow-ups.
- [x] Implement them in `ask-answer.ts`, with `groundCitations` and `citationRoute` for grounding and `cleanAnswer` for tags. Remove the finish shape and the helpers it retires from `ask.ts`. Rebuild the dist.
  - A source is found however the model spelled its row, as `normalizeNavigate` did: the id's UUID is looked up under the kind written, then under any kind that read it. A page is a route that names no row.

### Task 2: The turn (server)

- [x] `tools.ts`: `FINISH_TOOL` goes; `get_calendar` records the people it names.
- [x] `round.ts`: `onText(textSoFar)` on text deltas.
- [x] `loop.ts`: the table above; `TurnResult.answer` is an `AskAnswer`, with `text` its words; failures go through `failedAnswer`.
- [x] Rewrite `ask-turn.test.mjs`'s scripted rounds to answer as JSON text, and add the cases in the Files table.

### Task 3: The rules (prompt)

- [x] The anatomy's rules (spec 7.7), without numbers, and two short examples in the cached block.
- [x] `resultTitle` goes, and the route keeps a thread's question as its title (D9).

### Task 4: The door and the rows

- [x] `route.ts` stores `{v: 2, answer, ...v1FromAnswer(answer), ...}` and sends the message with its `answer`.
- [x] `store.ts` reads it back; `retitleThread` goes.

### Task 5: The Line and the band read `say`

- [x] `api.ts` gains the `say` event.
- [x] `ask-real.jsx` keeps the say on the live turn.
- [x] `ask-turn.jsx` draws a streaming Say.
- [x] `turn.ts`/`today-face.jsx` replace the words on each `say`.
- [x] `ask.css` quiets a failed headline.
- [x] Tests: `ask-palette` (a v2 turn streams its say and lands its answer), `mascot-turn` (`say`).

### Task 6: The eval set

- [x] First words, and the v2 checks.
- [x] `counts` on `week_report` and `who_said_yes`.

### Task 7: Retired pins, gates, the gate's runs, PR

- [x] The retired pins go from `ask.test.mjs`, and `UPDATE_SOURCE_SCAN_BASELINE=1` lowers its count.
- [x] Gates: test, typecheck, lint, format:check and check:dist.
- [ ] Build this branch, serve it on 3290, and run three v2 eval runs.
- [ ] Compare with the three baseline runs: pass set, first words and final time.
- [ ] PR, CI, merge on green. Then production: "who needs me right now?", "how did the last 7 days go?" and "open the transcript of the most recent call".
