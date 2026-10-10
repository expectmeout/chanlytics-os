# Ask on a Phone, Part B (answers that shape themselves) Implementation Plan

> **Owner (Ruben, 28 Sep 2026): the Ask Rewired program builds this, after its Phase 5**, since it changes the prompt
> and the format that program owns and measures. Written by the Ask-on-a-phone lane, which keeps the phone's UI; it
> answers questions about the renderer (Task 8) and the captures (Task 11).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An answer's words stop arriving as one run-on paragraph: Say keeps its headline and gains a body of blocks
(a paragraph, points, steps, choices a tap answers with, and a limit said once), the model picks the blocks, and one
renderer draws any mix, so no answer needs a template of its own.

**Architecture:** The format the model writes (`contracts/ask/answer-format.ts`) replaces `say.detail` with
`say.body`; `normalizeAnswer` reads the body, cuts it to its caps and derives `detail` from it as plain words, so copy,
reading aloud, the v1 text and the "not from your data" check read `detail` unchanged; `partialSay` reads the body as far
as it has arrived, so points appear one by one; the server streams the body with Say; the kit draws it
(`AskBlocks` in `legacy/pages/ask-turn.jsx`). An answer stored before this has no body and draws its detail as today.

**Tech Stack:** TypeScript contracts (pure, dist committed), the dashboard's Ask loop (structured output,
`output_config.format`), the legacy shell (React via Babel globals), node:test on the stub React, the Ask eval
(`tooling/scripts/eval-ask.mjs`, which spends the production edge's key).

Spec: `docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md`, section 7 (and 7a's list of what waits for
part B); the canvas "Ask Chat on a Phone", page "D · refined", the Formats sheet
(https://claude.ai/artifact/98zQrUJusNYgMQtRdXfNhT). Read against main `d6515103e` (28 Sep 2026).

---

## When it lands (read first)

Part B changes what the model reads and writes. That makes it the Ask Rewired program's business as much as this lane's:

- **It resets the prompt cache for every conversation and compiles a new grammar** (a new `output_config.format`; the
  first turn after the deploy waits ~15 s for its first words, once per day while the grammar is cached). Say so in the PR.
- **Phase 5 measures against 5.2's eval baseline.** PRs 5.4 (the live replay) and 5.5 (the cold rebuild) are judged by
  the eval against the baseline Ruben ran after 5.2 (`docs/superpowers/plans/2026-09-27-ask-rewired-5-memory.md`, D14).
  A format and rule change landing between them would mix its effect into theirs. **Decided (Ruben, 28 Sep): after
  Phase 5, by the Ask Rewired program**, rebased onto 5.5's prompt rule (D6, "approve that one"). 5.3 was held on his
  privacy call when this was written.
- **#1206 (Partners) is open on `prompt.ts`**, but only on `turnWords`' partner line (`prompt.ts:307`); Part B edits
  `ASK_RULES` and `ASK_EXAMPLES` (`prompt.ts:62-164`). No overlap; rebase over whichever lands first.
- **The eval is the gate.** A run spends the production edge's `ANTHROPIC_API_KEY`, the key the receptionist answers
  customers with (`reference: evals spend the prod key`). Before merging: `node tooling/scripts/eval-ask.mjs --list`
  says the turns and the cost; Ruben says yes to the spend; the run passes (Task 10).
- **Tell the Ask Rewired session** before the first push: the files (below), the rules rewritten, and the eval run.

## File map

| File | Change |
| --- | --- |
| `packages/contracts/src/ask/ask-answer.ts` | `AskBlock` and its kinds; caps `blocks`, `entries`, `lead`, `text`, `detail` 700 → 1500; `bodyWords`; `readBody`; `normalizeAnswer` reads the body and derives `detail`; `partialJson`, and `partialSay` with the body; `answerText` keeps a body's lines |
| `packages/contracts/src/ask/answer-format.ts` | `say: { headline, body }`, `detail` out of the model's format |
| `packages/contracts/src/ask/index.ts` | export `ASK_BLOCK_KINDS`, `bodyWords`, types `AskBlock`, `AskBlockKind`, `AskBlockEntry` |
| `packages/contracts/dist/*` | rebuilt and committed |
| `apps/dashboard/src/server/ask/loop.ts` | the `say` event carries `body` (`onText`, `unsay`, the cards-only answer); `TurnEvent.body` |
| `apps/dashboard/src/server/ask/prompt.ts` | `ASK_RULES` [2], [3] and [11] rewritten; `ASK_EXAMPLES`' Say as `{ headline, body }`, one example with points and a limit |
| `apps/dashboard/src/legacy-bridge/ask/api.ts` | `SendEvent`'s `say` carries `body` |
| `apps/dashboard/src/legacy/pages/ask-real.jsx` | the `say` handler keeps `body` (no net line; the file is at its baseline) |
| `apps/dashboard/src/legacy/pages/ask-turn.jsx` | `AskBlock`, `AskBlocks`; `AskAnswer` and the streaming `AskTurn` draw a body |
| `apps/dashboard/src/legacy/pages/ask-text.jsx` | `notYet` (en, es) |
| `apps/dashboard/src/legacy/styles/ask.css` | the blocks |
| `apps/dashboard/src/legacy/Chanlytics.html` | version keys, one past main's and every open PR's |
| `tooling/scripts/tests/ask/ask-answer.test.mjs`, `ask-turn.test.mjs`, `ask-palette.test.mjs` | the tests below |
| `tooling/evals/ask-cases.json`, `tooling/scripts/eval-ask.mjs` | four cases; `blocks_any`; no markdown in any string |
| `docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md` | section 7 as decided here (Task 0) |

Rules that bite (repo `CLAUDE.md`, `legacy/CLAUDE.md`): the tests import `@chanlytics/contracts` from its `dist`, so
every "run" step after a change under `packages/contracts` starts with `corepack pnpm --filter @chanlytics/contracts build`
(a stale dist fails the new test for the wrong reason); contracts `dist` rebuilt and committed; top-level names unique
across the legacy tree (`AskBlock`, `AskBlocks`, `AT_LIST_TAG` checked free on 28 Sep); `ask-real.jsx` may not grow
(`file-length.json`: 1014); no function over 30 branches; a `?v=` key per edited legacy file; the workspace route's CSS
budget (`bundle-budget.json`, 1% band: raise it with a row under "Rises" if the blocks' CSS takes it past, as #1248 did).

---

### Task 0: The spec, as decided

**Files:** Modify `docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md` (section 7)

- [ ] **Step 1:** Replace section 7's bullets "The format" and "The renderer" with:

```markdown
- **The format.** `say` becomes `{ headline, body }`: `body` is up to five blocks, each
  `{ kind: "text" | "points" | "steps" | "asks" | "limit", label, text, entries: [{ lead, text }] }` (every field present,
  empty when unused, as the format's rule is). text: a sentence or two. points: three or more parallel things, a lead
  when they group. steps: a sequence to follow. asks: when Ask must ask before it can answer, the headline asks and each
  entry is a choice a tap sends (not `do.next`, which follows an answer). limit: what Ask cannot do yet, and where it is
  done, said once (the canvas's "Not yet"). A label only over a group. The model picks the blocks; one renderer draws
  any mix, so no answer has a template of its own.
- **The renderer.** Points after a 6px square with a bold lead; steps numbered in a small tile; asks as chips that ask;
  a limit after the info glyph with "Not yet:" in the Line's words; a label over a group. While the answer is written,
  the cursor follows the last words.
- **The headline adds a fact.** Over a card, the headline says what the card rests on ("Friday at 11:30 is still
  open"), never that a card follows.
```

and add after "Caps":

```markdown
- **Caps** (ASK_ANSWER_CAPS): five blocks, six entries each, a lead of 40 characters, a text or limit of 400, an entry
  of 160 (an ask of 90, a question's), a label of 60. `detail`, now derived, holds up to 1,500 characters, cut at a whole
  line.
- **When.** After Ask Rewired 5.5, or before 5.4 with a fresh eval baseline (Ruben's call); the eval passes before merge.
```

- [ ] **Step 2:** Commit: `git add docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md && git commit -m "Ask on a phone, part B: the spec as decided"`

---

### Task 1: The block, its caps and its words

**Files:** Modify `packages/contracts/src/ask/ask-answer.ts:58-106`, `packages/contracts/src/ask/index.ts`;
Test `tooling/scripts/tests/ask/ask-answer.test.mjs`

- [ ] **Step 1: The failing test** (append to `ask-answer.test.mjs`; add `bodyWords` and `ASK_BLOCK_KINDS` to its import
  from `@chanlytics/contracts`):

```js
test("a body's plain words: a line per paragraph, limit and entry, a lead before its words, steps numbered, labels kept (part B)", () => {
  assert.deepEqual([...ASK_BLOCK_KINDS], ["text", "points", "steps", "asks", "limit"]);
  const body = [
    { kind: "text", label: "", text: "Most came in after hours.", entries: [] },
    { kind: "points", label: "Also yours to approve", text: "", entries: [{ lead: "People", text: "a note, a name" }, { lead: "", text: "a deal stage" }] },
    { kind: "steps", label: "", text: "", entries: [{ lead: "", text: "Open Settings." }, { lead: "", text: "Paste the link." }] },
    { kind: "limit", label: "", text: "new templates: Campaigns, Templates.", entries: [] },
  ];
  assert.equal(
    bodyWords(body),
    [
      "Most came in after hours.",
      "Also yours to approve",
      "People: a note, a name",
      "a deal stage",
      "1. Open Settings.",
      "2. Paste the link.",
      "new templates: Campaigns, Templates.",
    ].join("\n"),
  );
  assert.equal(bodyWords([]), "");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `corepack pnpm --filter @chanlytics/contracts build && node --conditions=react-server --import tsx --test tooling/scripts/tests/ask/ask-answer.test.mjs`
Expected: FAIL (`bodyWords` is not exported).

- [ ] **Step 3: The shape.** In `ask-answer.ts`, before `export interface AskAnswer`:

```ts
/** One block of an answer's body (the spec 2026-09-27-ask-chat-on-a-phone, section 7): what the model picks, in order. */
export const ASK_BLOCK_KINDS = ["text", "points", "steps", "asks", "limit"] as const;
export type AskBlockKind = (typeof ASK_BLOCK_KINDS)[number];
export interface AskBlockEntry {
  /** A point's bold lead, a few words, or empty. */
  lead: string;
  /** A point's or a step's words, or what an ask sends when tapped. */
  text: string;
}
export interface AskBlock {
  kind: AskBlockKind;
  /** A label over a group, or empty. */
  label: string;
  /** A paragraph's or a limit's words; empty for points, steps and asks. */
  text: string;
  /** Points, steps or asks; empty for a paragraph or a limit. */
  entries: AskBlockEntry[];
}
```

and in `AskAnswer`, `say: { headline: string; detail: string; body?: AskBlock[] };` with the comment above it:
`/** Say: the headline, the body the page draws (absent on every answer stored before part B), and its plain words. */`

- [ ] **Step 4: The caps.** In `ASK_ANSWER_CAPS`, `detail: 700` becomes `detail: 1500`, and add after `question: 90,`:

```ts
  blocks: 5,
  entries: 6,
  lead: 40,
  text: 400,
```

- [ ] **Step 5: The words.** After `answerText`:

```ts
/**
 * A body's plain words, the answer's `detail` (part B): what copy, reading aloud, the v1 text and the "not from your
 * data" check read. A line per paragraph, limit, label and entry; a point's lead before its words; steps numbered.
 */
export function bodyWords(body: ReadonlyArray<AskBlock>): string {
  return body
    .flatMap((b) => [
      ...(b.label ? [b.label] : []),
      ...(b.text ? [b.text] : []),
      ...b.entries.map((e, k) => `${b.kind === "steps" ? `${k + 1}. ` : ""}${e.lead ? `${e.lead}: ` : ""}${e.text}`),
    ])
    .join("\n");
}
```

and `answerText` keeps a body's lines:

```ts
export function answerText(a: AskAnswer): string {
  const lines = a.form === "prose" || !!(a.say.body && a.say.body.length);
  return [a.say.headline, a.say.detail].filter(Boolean).join(lines ? "\n" : " ");
}
```

- [ ] **Step 6: Export.** In `packages/contracts/src/ask/index.ts`, beside `answerText`, add `bodyWords` and
  `ASK_BLOCK_KINDS`, and to the type exports `AskBlock`, `AskBlockEntry`, `AskBlockKind` (the barrel names each export;
  never `export *`).

- [ ] **Step 7: Run and see it pass.** Same command. Expected: PASS, and every other test in the file.

- [ ] **Step 8: Commit.** `git add packages/contracts/src/ask tooling/scripts/tests/ask/ask-answer.test.mjs && git commit -m "Ask's answer has a body: its blocks, caps and plain words (part B)"`

---

### Task 2: The format the model writes

**Files:** Modify `packages/contracts/src/ask/answer-format.ts:28-45`; Test `tooling/scripts/tests/ask/ask-answer.test.mjs`
(the fixture `written()` and the caps test around lines 440-515)

- [ ] **Step 1: The failing tests.** In `written()`, `say` becomes:

```js
  say: {
    headline: "Nora asked about Saturday.",
    body: [
      { kind: "text", label: "", text: "She wrote twice.", entries: [] },
      { kind: "points", label: "", text: "", entries: [{ lead: "Nora", text: "asked about Saturday" }, { lead: "Sam", text: "called back" }] },
    ],
  },
```

(keep the headline the fixture had; the body replaces `detail`), and in the caps test's list replace
`[["say", "detail"], C.detail]` with:

```js
    [["say", "body"], C.blocks],
    [["say", "body", "[]", "label"], C.label],
    [["say", "body", "[]", "text"], C.text],
    [["say", "body", "[]", "entries"], C.entries],
    [["say", "body", "[]", "entries", "[]", "lead"], C.lead],
    [["say", "body", "[]", "entries", "[]", "text"], C.line],
```

and add:

```js
test("the format asks for a body of blocks and no detail, every key required: the grammar keeps no optional parameter (part B)", () => {
  const say = ASK_ANSWER_FORMAT.properties.say;
  assert.deepEqual(say.required, ["headline", "body"]);
  assert.equal(say.properties.detail, undefined, "detail is derived, never written");
  const block = say.properties.body.items;
  assert.deepEqual(block.properties.kind.enum, [...ASK_BLOCK_KINDS]);
  const every = (s) =>
    s.type === "object"
      ? Object.keys(s.properties).every((k) => s.required.includes(k) && every(s.properties[k])) && s.additionalProperties === false
      : s.type === "array"
        ? every(s.items)
        : true;
  assert.ok(every(ASK_ANSWER_FORMAT), "no optional key anywhere (the API caps optional parameters at 24)");
});
```

- [ ] **Step 2: Run and see them fail.** Same command. Expected: FAIL (`say.required` is `["headline", "detail"]`; the
  shape test differs at `say`).

- [ ] **Step 3: The format.** In `answer-format.ts`, import `ASK_BLOCK_KINDS` with the caps
  (`import { ASK_ANSWER_CAPS as C, ASK_BLOCK_KINDS } from "./ask-answer";`) and replace `say`'s `detail` property and its
  `required` with:

```ts
        body: {
          type: "array",
          description: `What the headline needs, as up to ${C.blocks} blocks the page draws in order; empty when the headline is enough. text: a sentence or two. points: three or more parallel things, one entry each, with a lead when they group. steps: a sequence to follow, one entry per step. asks: only when you must ask before you can answer; the headline asks, and each entry's text is a choice they could send, a few words. limit: something you cannot do yet, said once, with where it is done. A label only over a group. Never repeat a number or a row that show holds.`,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...ASK_BLOCK_KINDS] },
              label: { type: "string", description: `A label over a group, or empty; at most ${C.label} characters.` },
              text: {
                type: "string",
                description: `A text's or a limit's words, at most ${C.text} characters; empty for points, steps and asks.`,
              },
              entries: {
                type: "array",
                description: `Points, steps or asks, at most ${C.entries}; empty for text and limit.`,
                items: {
                  type: "object",
                  properties: {
                    lead: {
                      type: "string",
                      description: `A point's lead, a few words, or empty; at most ${C.lead} characters.`,
                    },
                    text: { type: "string", description: `At most ${C.line} characters.` },
                  },
                  required: ["lead", "text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["kind", "label", "text", "entries"],
            additionalProperties: false,
          },
        },
      },
      required: ["headline", "body"],
```

Update the file's comment: "`say` comes first, so it streams first; its body streams block by block (partialSay)."

- [ ] **Step 4: Run and see them pass.** Same command. Expected: PASS. (The server-side test that the examples fit the
  format fails until Task 6: leave it.)

- [ ] **Step 5: Commit.** `git commit -am "Ask's format: Say is a headline and a body of blocks (part B)"`

---

### Task 3: The server reads the body, and derives detail

**Files:** Modify `packages/contracts/src/ask/ask-answer.ts:465-615`; Test `tooling/scripts/tests/ask/ask-answer.test.mjs`

- [ ] **Step 1: The failing test.**

```js
test("the body as the page may draw it: kinds the format names, strings cleaned and cut, empty blocks gone, at most five, and detail its plain words (part B)", () => {
  const long = "x ".repeat(300).trim();
  const r = read1(
    written({
      say: {
        headline: "Here is what I can do.",
        body: [
          { kind: "bogus", label: "", text: "Dropped.", entries: [] },
          { kind: "points", label: "Also <b>yours</b>", text: "ignored", entries: [{ lead: "People", text: "a note" }, { lead: "Empty", text: "  " }] },
          { kind: "steps", label: "", text: "", entries: [] },
          { kind: "asks", label: "", text: "", entries: [{ lead: "never", text: "This week" }] },
          { kind: "text", label: "", text: long, entries: [{ lead: "x", text: "ignored" }] },
          { kind: "limit", label: "", text: "templates: Campaigns.", entries: [] },
          { kind: "text", label: "", text: "A sixth block.", entries: [] },
        ],
      },
    }),
  );
  const body = r.answer.say.body;
  assert.deepEqual(body.map((b) => b.kind), ["points", "asks", "text", "limit"], "a bogus kind and an empty list go");
  assert.deepEqual(body[0], { kind: "points", label: "Also yours", text: "", entries: [{ lead: "People", text: "a note" }] });
  assert.deepEqual(body[1].entries, [{ lead: "", text: "This week" }], "an ask has no lead");
  assert.ok(body[2].text.length <= 400 && body[2].text.endsWith("…"), "a text is cut at its cap");
  assert.deepEqual(body[2].entries, [], "a text has no entries");
  assert.equal(r.answer.say.detail, bodyWords(body), "detail is the body's plain words");
  const old = read1(written({ say: { headline: "Two people wrote.", detail: "Both after hours." } }));
  assert.deepEqual([old.answer.say.body, old.answer.say.detail], [[], "Both after hours."], "a detail with no body is read as before");
  const six = Array.from({ length: 6 }, (_, k) => ({ kind: "text", label: "", text: `Block ${k}.`, entries: [] }));
  assert.equal(read1(written({ say: { headline: "Six.", body: six } })).answer.say.body.length, 5, "at most five blocks");
});
```

(`read1` and `written` are the file's.)

- [ ] **Step 2: Run and see it fail.** Expected: FAIL (`say.body` is undefined).

- [ ] **Step 3: The reader.** Beside `words` in `ask-answer.ts`:

```ts
/** Lines of words in at most n characters, cut at the last whole line that fits (a body's words keep their lines). */
const cutLines = (s: string, n: number) => {
  if (s.length <= n) return s;
  const at = s.lastIndexOf("\n", n);
  return (at > 0 ? s.slice(0, at) : clip(s, n)).trimEnd();
};
const LISTS: ReadonlyArray<AskBlockKind> = ["points", "steps", "asks"];

/**
 * A body as the page may draw it (part B): each block of a kind the format names, its strings cleaned and cut to their
 * caps (an ask to a question's, and no lead but a point's), a list with no entry and a paragraph or limit with no words
 * dropped, at most C.blocks. Read for the final answer and, as far as it has arrived, for the preview (partialSay).
 */
function readBody(v: unknown): AskBlock[] {
  const out: AskBlock[] = [];
  for (const b of asArr(v).map(asObj)) {
    const kind = ASK_BLOCK_KINDS.find((k) => k === b.kind);
    if (!kind) continue;
    const listed = LISTS.includes(kind);
    const entries = listed
      ? asArr(b.entries)
          .map(asObj)
          .map((e) => ({
            lead: kind === "points" ? words(e.lead, C.lead) : "",
            text: words(e.text, kind === "asks" ? C.question : C.line),
          }))
          .filter((e) => e.text)
          .slice(0, C.entries)
      : [];
    const text = listed ? "" : words(b.text, C.text);
    if (listed ? !entries.length : !text) continue;
    out.push({ kind, label: words(b.label, C.label), text, entries });
    if (out.length >= C.blocks) break;
  }
  return out;
}
```

and in `normalizeAnswer`, before `return {`:

```ts
  const body = readBody(say.body);
```

with Say returned as:

```ts
      say: {
        headline,
        detail: body.length ? cutLines(bodyWords(body), C.detail) : words(say.detail, C.detail),
        body,
      },
```

Update `normalizeAnswer`'s comment: "…Say's body is read by readBody, and its detail is the body's plain words."

- [ ] **Step 4: Run and see it pass,** and the file's other tests (the whole-answer test compares key for key: update its
  expected `say` to the fixture's body and `detail: bodyWords(...)`). Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -am "normalizeAnswer reads the body and derives detail from it (part B)"`

---

### Task 4: The body streams as far as it has arrived

**Files:** Modify `packages/contracts/src/ask/ask-answer.ts:636-682`; Test `tooling/scripts/tests/ask/ask-answer.test.mjs:860-880`

- [ ] **Step 1: The failing test** (beside "Say streams from every prefix…", which stays for a Say with a detail):

```js
test("the body streams from every prefix: never throws, never goes backwards, blocks arrive one by one and whole at the end (part B)", () => {
  const w = written({
    say: {
      headline: 'Sí: Nora said "yes".',
      body: [
        { kind: "text", label: "", text: "Tab\there, a quote \" and a slash \\.", entries: [] },
        { kind: "points", label: "Also", text: "", entries: [{ lead: "People", text: "a note, a name" }, { lead: "Inbox", text: "a reply" }] },
        { kind: "limit", label: "", text: "Templates: Campaigns.", entries: [] },
      ],
    },
  });
  const text = JSON.stringify(w).replace("í", "\\u00ed");
  let prev = { headline: "", body: [] };
  const flat = (body) => body.map((b) => [b.kind, b.label, b.text, ...b.entries.flatMap((e) => [e.lead, e.text])].join("|"));
  for (let i = 0; i <= text.length; i++) {
    const p = partialSay(text.slice(0, i));
    if (!p) continue;
    assert.ok(p.headline.startsWith(prev.headline), `headline at ${i}`);
    assert.ok(p.body.length >= prev.body.length, `blocks never go at ${i}: ${JSON.stringify(p.body)}`);
    const now = flat(p.body);
    flat(prev.body).forEach((b, k) => assert.ok(now[k].startsWith(b.split("|").slice(0, -1).join("|")), `block ${k} at ${i}`));
    assert.equal(p.detail, bodyWords(p.body), `detail is the body's words at ${i}`);
    prev = p;
  }
  const whole = partialSay(text);
  assert.deepEqual(whole.body, read1(w).answer.say.body, "the whole body, as the final answer has it");
});
```

- [ ] **Step 2: Run and see it fail.** Expected: FAIL (`p.body` is undefined).

- [ ] **Step 3: The partial reader.** After `partialField`:

```ts
/**
 * The JSON value of `"key": …` in a prefix, as far as it has arrived (part B): an open string closed (an escape that has
 * not arrived whole left out), a key with no value yet and a trailing separator dropped, and every open array and
 * object closed. Undefined before the value starts, or when what has arrived cannot be read yet.
 */
function partialJson(s: string, key: string): unknown {
  const k = s.indexOf(`"${key}"`);
  if (k < 0) return undefined;
  const colon = s.indexOf(":", k + key.length + 2);
  if (colon < 0) return undefined;
  const closers: string[] = [];
  let inString = false;
  let out = "";
  for (let i = colon + 1; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") {
        const len = s[i + 1] === "u" ? 6 : 2;
        if (i + len > s.length) break;
        out += s.slice(i, i + len);
        i += len - 1;
        continue;
      }
      out += c;
      if (c === '"') inString = false;
      continue;
    }
    out += c;
    if (c === '"') inString = true;
    else if (c === "{") closers.push("}");
    else if (c === "[") closers.push("]");
    else if (c === "}" || c === "]") {
      closers.pop();
      if (!closers.length) break;
    }
  }
  if (!out.trim()) return undefined;
  let text = inString ? `${out}"` : out;
  text = text
    .replace(/,\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, "")
    .replace(/([{[])\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, "$1")
    .replace(/[,:]\s*$/, "");
  try {
    return JSON.parse(text + [...closers].reverse().join(""));
  } catch {
    return undefined;
  }
}
```

(Write it with the Write or Edit tool, never a heredoc: the regexes carry backslashes — `feedback_shell_chains`.)

and `partialSay` becomes:

```ts
/**
 * Say while the answer's JSON is still arriving (spec 7.4; part B): the headline so far, the body's blocks as far as
 * they have arrived (the one being written with its words so far), and the plain words they make; null before `say`
 * appears. A Say written before part B streams its detail as it did. A preview only: the final message is the truth.
 */
export function partialSay(prefix: string): { headline: string; detail: string; body: AskBlock[] } | null {
  const at = prefix.indexOf('"say"');
  if (at < 0) return null;
  const rest = prefix.slice(at);
  const body = readBody(partialJson(rest, "body"));
  return {
    headline: partialField(rest, "headline"),
    detail: body.length ? bodyWords(body) : partialField(rest, "detail"),
    body,
  };
}
```

The old test "Say streams from every prefix…" compares `partialSay(text)` to `say` whole: change its final assertion to
`assert.deepEqual(partialSay(text), { ...say, body: [] })`.

- [ ] **Step 4: Run and see them pass.** Expected: PASS (both stream tests).

- [ ] **Step 5: Commit.** `git commit -am "partialSay streams the body block by block (part B)"`

---

### Task 5: The server streams the body

**Files:** Modify `apps/dashboard/src/server/ask/loop.ts:84-94, 395-424, 713`; Test `tooling/scripts/tests/ask/ask-turn.test.mjs`

- [ ] **Step 1: The harness writes the new format.** In `ask-turn.test.mjs`, `answerJson`'s Say (`:219`) becomes
  `say: { headline, body: [], ...over.say },`. The test "Say streams from the answer's JSON as it is written" (`:769`)
  passes `{ say: { detail: "Rosa asked about Saturday." } }` and still reads its detail: a Say with no body is read as
  before (Task 3).

- [ ] **Step 2: The failing test** (beside that one; `answerJson`, `scripted`, `ROUND`, `prose`, `turn`, `ctxFor`,
  `ports` and `runAskTurn` are the file's):

```js
test("the say lines carry the body as it arrives, and the final message the whole body (part B)", async () => {
  const body = [
    { kind: "points", label: "", text: "", entries: [{ lead: "Nora", text: "asked about Saturday" }, { lead: "Sam", text: "called back" }] },
  ];
  const full = answerJson("Two things to know.", { say: { body } });
  const cut = (s) => full.slice(0, full.indexOf(s) + s.length);
  const s = scripted([
    async (_c, onText) => {
      onText(cut("Two things to know."));
      await new Promise((r) => setTimeout(r, 60));
      onText(cut("asked about"));
      await new Promise((r) => setTimeout(r, 60));
      onText(full);
      return ROUND([prose(full)], { stopReason: "end_turn" });
    },
  ]);
  const { input, events } = turn(ctxFor());
  const r = await runAskTurn(input, ports(s.round));
  assert.deepEqual(
    events.filter((e) => e.t === "say").map((e) => e.body.map((b) => b.entries.map((x) => x.text))),
    [[], [["asked about"]], [["asked about Saturday", "called back"]]],
    "the headline first, then the point being written, then both",
  );
  assert.deepEqual(r.answer.say.body, body);
});
```

- [ ] **Step 3: Run and see it fail.** Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask/ask-turn.test.mjs`
  Expected: FAIL (`e.body` is undefined).

- [ ] **Step 4: The events.** In `TurnEvent` add, after `detail?: string;`:

```ts
  /** Say's body as written so far (part B): its blocks, the one being written with its words so far. */
  body?: AskBlock[];
```

(import `type AskBlock` from `@chanlytics/contracts`). In `onText`, the non-JSON branch becomes
`{ headline: "", detail: soFar, body: [] }`; `say` keeps the body: `const say = { headline: cleanAnswer(part.headline),
detail: cleanAnswer(part.detail), body: part.body };` and the emit is
`input.emit({ t: "say", headline: say.headline, detail: say.detail, body: say.body });`. In `unsay`,
`input.emit({ t: "say", headline: "", detail: "", body: [] });`. In the cards-only answer (`:713`),
`input.emit({ t: "say", headline: answer.say.headline, detail: answer.say.detail, body: answer.say.body ?? [] });`.

- [ ] **Step 5: Run and see it pass,** and the whole file. Expected: PASS but for the examples test (Task 6).

- [ ] **Step 6: Commit.** `git commit -am "The say line carries the body (part B)"`

---

### Task 6: The prompt says blocks, and its examples show them

**Files:** Modify `apps/dashboard/src/server/ask/prompt.ts:62-164`; Test `tooling/scripts/tests/ask/ask-turn.test.mjs:2649-2680`

- [ ] **Step 1: The failing test** (append; `ASK_RULES` and `ASK_EXAMPLES` are imported at the file's top):

```js
test("the rules ask for blocks and no markdown, the headline over a card adds a fact, and an example shows points and a limit (part B)", () => {
  const rules = ASK_RULES.join("\n");
  assert.ok(!/no markdown, lists, headings/.test(rules), "lists are the body's now");
  assert.match(rules, /no markdown, tags or emoji in any string/);
  assert.match(rules, /say\.body/);
  assert.match(rules, /never that a card follows/);
  const kinds = ASK_EXAMPLES.flatMap(([, a]) => a.say.body.map((b) => b.kind));
  assert.ok(kinds.includes("points") && kinds.includes("limit") && kinds.includes("text"), kinds.join(","));
});
```

- [ ] **Step 2: Run and see it fail** (and the existing "examples fit the format" test, failing since Task 2).

- [ ] **Step 3: The rules.** `ASK_RULES[2]` becomes:

```ts
  "Answer in the person's language (Spanish if they wrote Spanish), in plain words: no markdown, tags or emoji in any string (no asterisks, hashes, dashes or numbers at the start of a line: the page draws the shape). The answer is written in its format, in three parts the page draws in order: say, show and do.",
```

`ASK_RULES[3]` becomes:

```ts
  'say.headline is the answer itself, in one sentence: the finding first ("6 of 16 customer messages went unanswered"), never a preamble ("Here is your week"). say.body is empty unless the headline needs more, then blocks: a sentence or two is text; three or more parallel things are points, one entry each, with a short lead when they group; a sequence to follow is steps; when you must ask before you can answer, the headline asks and asks holds the choices, each a few words they could send; something you cannot do yet is a limit, said once, with where it is done. A label only over a group. The body never repeats a number or a row that show has, and it grows only when they asked why, how, what you can do, for a summary or for detail.',
```

and in `ASK_RULES[11]` ("You never act…"), "Then say what you proposed in one sentence; never say it was sent, changed or
done." becomes:

```ts
"Then the headline says what the card rests on, what you found or checked (\"Friday at 11:30 is still open\"), never that a card follows or what it holds; never say it was sent, changed or done."
```

Check first that no eval case pins the old wording: `grep -n "proposed" tooling/evals/ask-cases.json` — a case whose
`includes_any` names "proposed" or "draft" as the headline's word is rewritten to the fact it now says, in this task.

- [ ] **Step 4: The examples.** In `ASK_EXAMPLES`, each `say: { headline, detail }` becomes `say: { headline, body }`:
  the week's `detail: "Most of them came in after hours."` becomes
  `body: [{ kind: "text", label: "", text: "Most of them came in after hours.", entries: [] }]`; the other two
  `body: []`. Add a fourth example after "Who needs me right now?", its capabilities checked against the tool registry
  (`server/ask/tools/registry.ts`) as it stands when this is built:

```ts
  [
    "What can you do for me?",
    {
      say: {
        headline: "I read the workspace for you and propose changes you approve.",
        body: [
          {
            kind: "points",
            label: "",
            text: "",
            entries: [
              { lead: "People", text: "a note, their name or email, a deal stage" },
              { lead: "Inbox", text: "a reply, a held draft rewritten, a thread taken over or snoozed" },
              { lead: "Settings", text: "closures, hours, services and autonomy" },
            ],
          },
          { kind: "limit", label: "", text: "new WhatsApp templates: they are made in Campaigns, Templates.", entries: [] },
        ],
      },
      show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NOTHING } },
      do: { open: { source: NOTHING, label: "", now: false }, next: [] },
      language: "en",
    },
  ],
```

Update the examples' comment: "…a count, a who, what it can do (points and a limit), and an open…".

- [ ] **Step 5: Run and see them pass.** Expected: PASS (both tests; `fits` walks `say.body`'s items too).

- [ ] **Step 6: Commit.** `git commit -am "The prompt asks for blocks, and a headline over a card adds a fact (part B)"`

---

### Task 7: The bridge and the shell keep the body

**Files:** Modify `apps/dashboard/src/legacy-bridge/ask/api.ts:29`, `apps/dashboard/src/legacy/pages/ask-real.jsx` (the
`say` branch of `arTurnHeard`); Test `tooling/scripts/tests/ask/ask-palette.test.mjs`

- [ ] **Step 1: The failing test** (in the phone section; `phoneWindow`, `ask`, `TH`, `said`, `asks`, `later`, `nowOf`
  are the file's):

```js
test("while an answer is written its blocks arrive, the cursor after the last words, and the whole answer replaces them (part B)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  let land = () => {};
  const landed = new Promise((r) => (land = r));
  try {
    const calls = ask([]);
    const body = [{ kind: "points", label: "", text: "", entries: [{ lead: "People", text: "a note" }] }];
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "say", headline: "Here is what I can do.", detail: "People: a note", body });
      await landed;
      on({ t: "final", message: said("m-1", "Here is what I can do.") });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "what can you do?");
    const blocks = byTestId(nowOf(tree), "ask-blocks");
    assert.ok(blocks, "the blocks while the words arrive");
    assert.equal(byClass(blocks, "ask-cursor").length, 1, "the cursor after the last words");
    land();
    tree = await later(Palette, props);
    assert.equal(byClass(nowOf(tree), "ask-cursor").length, 0, "the answer, whole");
  } finally {
    await closes();
    ph.restore();
  }
});
```

- [ ] **Step 2: Run and see it fail.** Expected: FAIL (no `ask-blocks`).

- [ ] **Step 3: The bridge.** In `api.ts`, `| { t: "say"; headline: string; detail: string; body?: AskBlock[] }` (import
  `type AskBlock` from `@chanlytics/contracts`; the bridge may import contracts' types).

- [ ] **Step 4: The shell.** In `arTurnHeard`'s `say` branch, the one line
  `setLive((prev) => (prev ? { ...prev, say: back ? null : { headline: ev.headline, detail: ev.detail } } : prev));`
  becomes `setLive((prev) => (prev ? { ...prev, say: back ? null : { headline: ev.headline, detail: ev.detail, body: ev.body || [] } } : prev));`
  (the same line: `ask-real.jsx` may not grow). The mood's beat already counts `detail`, the body's words.

- [ ] **Step 5: The renderer** (Task 8's `AskBlocks`, used by the streaming `AskTurn`) — do Task 8, then run this test.

---

### Task 8: One renderer for any mix

**Files:** Modify `apps/dashboard/src/legacy/pages/ask-turn.jsx` (before `AskAnswer`; `AskAnswer`'s Say part; the
streaming branch of `AskTurn`; the publisher), `apps/dashboard/src/legacy/pages/ask-text.jsx`; Test `ask-palette.test.mjs`

- [ ] **Step 1: The failing test.**

```js
test("an answer's body draws each block in order: a paragraph, points with their leads, steps numbered, choices that ask when tapped, a limit said once; an answer stored before part B draws its detail (part B)", () => {
  const { AskAnswer } = globalThis.window.AskAnswerKit;
  const t = globalThis.window.askText("en");
  const asked = [];
  const answer = (say) => ({
    v: 2,
    form: "structured",
    say,
    show: { figures: [], items: [], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  });
  const body = [
    { kind: "text", label: "", text: "Most came in after hours.", entries: [] },
    { kind: "points", label: "Also yours to approve", text: "", entries: [{ lead: "People", text: "a note" }, { lead: "", text: "a deal stage" }] },
    { kind: "steps", label: "", text: "", entries: [{ lead: "", text: "Open Settings." }, { lead: "", text: "Paste the link." }] },
    { kind: "asks", label: "", text: "", entries: [{ lead: "", text: "This week" }, { lead: "", text: "Last week" }] },
    { kind: "limit", label: "", text: "new templates: Campaigns, Templates.", entries: [] },
  ];
  let tree = render(AskAnswer, { answer: answer({ headline: "Here it is.", detail: "…", body }), cardOpen: {}, cards: [], t, onNav() {}, onFollow: (q) => asked.push(q) });
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "ask-block").map((n) => n.props["data-kind"]), ["text", "points", "steps", "asks", "limit"]);
  assert.equal(find(tree, (n) => n.type === "ol") !== null, true, "steps are numbered");
  assert.equal(textOf(byClass(tree, "ask-block-label")[0]), "Also yours to approve");
  assert.ok(textOf(find(tree, (n) => n.type === "ul")).startsWith("People — a note"), "a lead before its words");
  press(all(tree, (n) => n.props?.["data-testid"] === "ask-choice")[1]);
  assert.deepEqual(asked, ["Last week"], "a choice asks its words");
  assert.ok(textOf(byClass(tree, "ask-limit")[0]).startsWith(t.notYet), "the limit, in the Line's words");
  assert.equal(byClass(tree, "ask-detail").filter((n) => textOf(n) === "…").length, 0, "the detail is not drawn beside its blocks");
  tree = render(AskAnswer, { answer: answer({ headline: "Two wrote.", detail: "Both after hours." }), cardOpen: {}, cards: [], t, onNav() {}, onFollow() {} });
  assert.equal(byTestId(tree, "ask-blocks"), null);
  assert.equal(textOf(byClass(tree, "ask-detail")[0]), "Both after hours.", "an answer from before part B, as before");
});
```

- [ ] **Step 2: Run and see it fail.** Expected: FAIL (`ask-block` not found).

- [ ] **Step 3: The words.** In `ask-text.jsx`, `en` after `notNow: "Not now",`: `notYet: "Not yet:",`; `es` after
  `notNow: "Ahora no",`: `notYet: "Todavía no:",`.

- [ ] **Step 4: The blocks.** In `ask-turn.jsx`, before the comment "// The answer: Say (the headline…":

```jsx
// An answer's body (the spec 2026-09-27-ask-chat-on-a-phone, section 7): the blocks in the order Ask wrote them, one
// renderer for any mix, so no answer has a template of its own. A paragraph; points after a small square, a bold lead
// where they group; steps, numbered; asks, the choices a tap answers with (onFollow sends the words); a limit, what Ask
// cannot do yet and where it is done, said once. A label only over a group. While the answer is written, `cursor`
// follows the last words.
const AT_LIST_TAG = { points: "ul", steps: "ol" };
const AskBlock = ({ b, t, onFollow, cursor }) => {
  const List = AT_LIST_TAG[b.kind];
  const last = b.entries.length - 1;
  return (
    <div className={`ask-block ${b.kind}`} data-testid="ask-block" data-kind={b.kind}>
      {b.label ? <p className="ask-block-label">{b.label}</p> : null}
      {b.kind === "text" ? <p className="ask-detail">{b.text}{cursor}</p> : null}
      {b.kind === "limit" ? (
        <p className="ask-limit"><Icon name="info" size={14} /><span><b>{t.notYet}</b> {b.text}{cursor}</span></p>
      ) : null}
      {List ? (
        <List className="ask-list">
          {b.entries.map((e, k) => (
            <li key={k}>{e.lead ? <b>{e.lead}</b> : null}{e.lead ? " — " : null}{e.text}{k === last ? cursor : null}</li>
          ))}
        </List>
      ) : null}
      {b.kind === "asks" ? (
        <div className="ask-choices">
          {b.entries.map((e) => (
            <button key={e.text} type="button" className="ask-chip ask-choice" onClick={() => { if (onFollow) onFollow(e.text); }} data-testid="ask-choice"><span>{e.text}</span></button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
const AskBlocks = ({ body, t, onFollow, cursor = null }) => (
  <div className="ask-blocks" data-testid="ask-blocks">
    {body.map((b, k) => (
      <AskBlock key={k} b={b} t={t} onFollow={onFollow} cursor={k === body.length - 1 ? cursor : null} />
    ))}
  </div>
);
```

- [ ] **Step 5: The answer draws its body.** In `AskAnswer`, the Say part's second line
  `{a.say.detail ? <p className={a.say.headline ? "ask-detail" : "ask-prose"}>{a.say.detail}</p> : null}` becomes:

```jsx
          {a.say.body && a.say.body.length ? (
            <AskBlocks body={a.say.body} t={t} onFollow={onFollow} />
          ) : a.say.detail ? (
            <p className={a.say.headline ? "ask-detail" : "ask-prose"}>{a.say.detail}</p>
          ) : null}
```

and in `AskTurn`'s streaming branch the `say` block becomes:

```jsx
            <div className="ask-say">
              {say.headline ? <p className="ask-headline">{say.headline}{say.detail ? null : cursor}</p> : null}
              {say.body && say.body.length ? (
                <AskBlocks body={say.body} t={t} cursor={cursor} />
              ) : say.detail ? (
                <p className={say.headline ? "ask-detail" : "ask-prose"}>{say.detail}{cursor}</p>
              ) : null}
            </div>
```

(`say.detail` is the body's words while a body streams, so the headline carries no cursor then.) Publish:
`window.AskAnswerKit = { …, AskBlocks };` (the same publisher; no new global).

- [ ] **Step 6: Run and see them pass** (this test and Task 7's). Run the palette suite whole: every earlier test passes
  (the `withNext` answers carry no body and draw their detail).

- [ ] **Step 7: Commit.** `git add apps/dashboard/src/legacy apps/dashboard/src/legacy-bridge tooling/scripts/tests/ask/ask-palette.test.mjs && git commit -m "One renderer draws any answer's blocks (part B)"`

---

### Task 9: The look, the keys, the dist, the gates

**Files:** `apps/dashboard/src/legacy/styles/ask.css`, `apps/dashboard/src/legacy/Chanlytics.html`, `packages/contracts/dist`

- [ ] **Step 1: The blocks** (the canvas's Formats sheet; base section, after `.ask-prose`):

```css
/* An answer's body (part B; ask-turn.jsx AskBlocks): its blocks under the headline, a label over a group, points after
   a small square with a bold lead, steps numbered in a tile, choices as chips that ask, a limit after the info glyph. */
.ask-blocks { display: flex; flex-direction: column; gap: 12px; }
.ask-block-label { margin: 0 0 6px; font-size: 12.5px; font-weight: 500; color: var(--ink-dim); }
.ask-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; counter-reset: ask-step; }
.ask-list > li { display: grid; grid-template-columns: 6px minmax(0, 1fr); column-gap: 12px; font-size: 13.5px; line-height: 1.5; color: var(--ink-muted); overflow-wrap: anywhere; }
.ask-list > li::before { content: ""; width: 6px; height: 6px; margin-top: 8px; border-radius: 1.5px; background: var(--ink-faint); }
.ask-list b { font-weight: 500; color: var(--ink); }
.ask-block.steps .ask-list > li { grid-template-columns: 22px minmax(0, 1fr); counter-increment: ask-step; }
.ask-block.steps .ask-list > li::before { content: counter(ask-step); display: grid; place-items: center; width: 22px; height: 22px; margin-top: 0; border-radius: 6px; background: var(--bg-active); font-size: 12px; font-weight: 600; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.ask-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.ask-choice::before { content: ""; flex: none; width: 7px; height: 7px; border-radius: 2px; background: color-mix(in oklab, var(--ink) 34%, var(--bg-raised)); }
.ask-limit { display: grid; grid-template-columns: 15px minmax(0, 1fr); column-gap: 9px; margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-muted); }
.ask-limit .icon { margin-top: 3px; color: var(--ink-dim); }
.ask-limit b { font-weight: 500; color: var(--ink); }
```

and in the phone block, beside `.ask-detail`: `.ask-list > li, .ask-limit { font-size: 15px; }` and
`.ask-list > li::before { margin-top: 9px; }` (the steps' tile keeps `margin-top: 0` — its selector is more specific).

- [ ] **Step 2: The keys.** In `Chanlytics.html`, `ask.css`, `ask-text.jsx`, `ask-turn.jsx`, `ask-real.jsx` one past
  main's and every open PR's (`gh pr list --state open --json number,files` for `Chanlytics.html`, then each PR's diff).

- [ ] **Step 3: The dist.** `corepack pnpm --filter "./packages/*" build`, then `node tooling/scripts/check-dist.mjs`.

- [ ] **Step 4: The gates.** `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check &&
  corepack pnpm check:dead-exports`, then `corepack pnpm test` (a stale baseline is banked with `UPDATE_BASELINES=1`, and
  the rewritten ones read before committing: keep only real falls). The build and the budget as CI runs them:
  `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-build-placeholder corepack pnpm --filter @chanlytics/dashboard build`
  then `node tooling/scripts/checks/bundle-budget.mjs` (a CSS rise past 1% is raised with its "Rises" row, as #1248's).
  `git checkout -- apps/dashboard/tsconfig.json apps/dashboard/next-env.d.ts` after the build.

- [ ] **Step 5: Commit** the CSS, the keys, the dist and any banked baseline.

---

### Task 10: The eval, and Ruben's run

**Files:** `tooling/evals/ask-cases.json`, `tooling/scripts/eval-ask.mjs` (`judge`, about line 300)

- [ ] **Step 1: The judge.** In `judge(c, r)`, after the `excludes` loop:

```js
  // Part B: the page draws the shape, so no string carries markdown; a case may name the blocks its answer needs.
  const a = m.answer;
  const said = a ? [a.say.headline, ...(a.say.body ?? []).flatMap((b) => [b.label, b.text, ...b.entries.flatMap((x) => [x.lead, x.text])])] : [];
  if (said.some((s) => /\*\*|__|`|(^|\n)\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)/.test(s ?? "")))
    fails.push(`markdown in the answer: ${JSON.stringify(said).slice(0, 160)}`);
  if (e.blocks_any && !(a?.say.body ?? []).some((b) => e.blocks_any.includes(b.kind)))
    fails.push(`no block of ${e.blocks_any.join("/")}: ${JSON.stringify((a?.say.body ?? []).map((b) => b.kind))}`);
```

- [ ] **Step 2: The cases** (appended to `ask-cases.json` in its own shape; ids new):

```json
{ "id": "b-points", "text": "What can you do for me?", "expect": { "no_write": true, "language": "en", "blocks_any": ["points"] } },
{ "id": "b-steps", "text": "How do I connect my calendar?", "expect": { "no_write": true, "language": "en", "blocks_any": ["steps"] } },
{ "id": "b-limit", "text": "Make me a new WhatsApp template", "expect": { "no_write": true, "language": "en", "blocks_any": ["limit"] } },
{ "id": "b-es", "text": "¿Qué puedes hacer por mí?", "expect": { "no_write": true, "language": "es", "blocks_any": ["points"] } }
```

- [ ] **Step 3: Say the cost.** `node tooling/scripts/eval-ask.mjs --list` (no turn is spent): the turns and the dollars.
  Tell Ruben: the full set plus the four, what it costs, and that it spends the production edge's key.

- [ ] **Step 4: Ruben's run** (only on his yes): against the PR's preview or a local build with `EDGE_PROVIDERS=live`,
  as the Ask program's runs are. Pass: the four new cases pass; the set's pass rate is not below the baseline he names
  (5.5's, or a fresh one); first words' median no more than 0.5 s slower. Stop at the first "credit balance" refusal and
  tell him.

---

### Task 11: Seen on the running app, then the PR

- [ ] **Step 1: Captures.** `_gen/refined-capture.mts` (from #1248's lane; gitignored) with stand-in answers carrying a
  body of each kind: 390×844, light and dark, and a desktop: an answer with points and a limit, one with steps, one that
  asks (the choices over the field's row), and the streaming state. Nothing is sent (the stand-in `send`).
- [ ] **Step 2: One combined review** (spec + quality) of the branch; fix once, no re-review.
- [ ] **Step 3: The PR.** What changes for a customer (answers list things as lists; a clarifying question comes with
  choices), what to set (nothing), deploy order (either: a tab from before draws `detail`, which the server still sends),
  the cache reset and the grammar's first compile, the eval run's numbers. Tell the Ask Rewired session the PR's number
  and keys. Merge on Ruben's yes to the captures and the eval, and green CI; then main's next run.

---

## Self-review (against section 7 and 7a)

- The format → Tasks 1–2. Stored answers keep `detail` → Task 3 (derived), Task 8 (drawn when no body). The prompt →
  Task 6. Streaming → Tasks 4–5, 7. The renderer → Task 8, 9. Caps → Task 1 (said in the format's descriptions, Task 2).
- 7a's "waits for part B": points, steps and choices → Tasks 2, 8; the "Not yet" line → `limit`; headlines that add a
  fact → Task 6's rule [11].
- The eval gate and the timing → "When it lands", Task 10.
