# Ask, the Line · Plan 1 of 4: the protocol

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The edge gateway and the dashboard's turn loop accept what the Line needs: a model the gate may choose (Opus 5.5), an answer format on Ask's own turn, one token ceiling for both sides, and thinking blocks carried back unmodified. There is no user-visible change.

**Architecture:** Spec `docs/superpowers/specs/2026-09-23-ask-the-line-design.md`, sections 3 (F6, F7), 7.3, 7.8 and 11 (PR 1).
- **The edge** (`apps/edge/lib/ask-gateway.ts`) widens its allow-list, lets a format through for Ask, and clamps Ask to `ASK_MAX_TOKENS`, a new constant in contracts.
- **The dashboard** (`server/ask/sse.ts`, `round.ts`, `loop.ts`) reads thinking blocks as their own kind and replays them unmodified. The loop asks for `ASK_MAX_TOKENS`.
- **Nothing else changes:** the loop still uses `finish`, and no format is sent yet (Plan 3).

**Tech Stack:** TypeScript on Node 22, run by `node --test` with tsx; pnpm via corepack; Vercel functions (edge app) and Next.js (dashboard).

**Worktree:** `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-face`, branch `design/ask-the-line`. The spec is already committed there.

---

## Files

| File | Responsibility | Change |
|---|---|---|
| `packages/contracts/src/ask.ts` | Ask's limits | Adds `ASK_MAX_TOKENS = 2000` |
| `packages/contracts/dist/*` | The built contracts the edge imports (`apps/edge/lib/packages/contracts.ts`) | Rebuilt |
| `apps/edge/lib/ask-gateway.ts` | What the gateway accepts | Allows `claude-opus-5-5`; a format for every purpose; Ask clamped to `ASK_MAX_TOKENS` |
| `apps/dashboard/src/server/ask/sse.ts` | One SSE frame to one event | Thinking and redacted-thinking starts; thinking and signature deltas |
| `apps/dashboard/src/server/ask/round.ts` | A round's blocks | Keeps thinking, signature and data; adds `replayBlocks` |
| `apps/dashboard/src/server/ask/loop.ts` | The turn | Asks `ASK_MAX_TOKENS`; replays with `replayBlocks` |
| `tooling/scripts/tests/llm-door.test.mjs` | The edge door, run | A new case; one clamp assertion reads `ASK_MAX_TOKENS` |
| `tooling/scripts/tests/ask.test.mjs` | The parser case | Thinking frames |
| `tooling/scripts/tests/ask-turn.test.mjs` | The round and the loop, run | Two new cases |

---

### Task 1: One token ceiling, in contracts

**Files:**
- Modify: `packages/contracts/src/ask.ts`, after `export const ASK_TURN_BUDGET_MS = 45_000;` (line 34)
- Rebuild: `packages/contracts/dist/`

- [ ] **Step 1: Add the constant**

```ts
/**
 * The most one round may write: its thinking, its tool calls and its answer
 * together. One number, read by the loop's request and by the edge's clamp on
 * Ask, so the two cannot drift again: the loop asked for 2400 while the edge
 * clamped every request to 2000, so 2000 was the ceiling a round really had.
 * Raised only when an eval case stops at it (the Line's spec, 7.8).
 */
export const ASK_MAX_TOKENS = 2000;
```

- [ ] **Step 2: Build the packages and keep only real dist changes**

Run: `corepack pnpm --filter "./packages/*" build`, then `git status --short packages`.
Expected: `packages/contracts/dist/index.js` and `index.d.ts` changed. For any other package's dist that changed, check `git diff -w --stat packages/<pkg>/dist`. If it shows no real change, restore it with `git checkout -- packages/<pkg>/dist`.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/ask.ts packages/contracts/dist
git commit -m "Ask has one token ceiling, in contracts (2000, what a round really got)"
```

### Task 2: The edge lets the Line through

**Files:**
- Modify: `apps/edge/lib/ask-gateway.ts`: the import (line 13), `GATEWAY_MODELS` and `GATEWAY_MAX_TOKENS` (lines 178-180), `validateGatewayRequest` (lines 186-230)
- Test: `tooling/scripts/tests/llm-door.test.mjs`

- [ ] **Step 1: Write the failing test**

In `llm-door.test.mjs`, widen the two imports:

```js
import { ASK_TOKENS_DAY, ASK_MODEL, ASK_MAX_TOKENS } from "@chanlytics/contracts";
```

```js
const {
  GATEWAY_MAX_BODY,
  GATEWAY_MAX_TOKENS,
  GATEWAY_MAX_TOOLS,
  GATEWAY_MAX_MESSAGES,
  ASK_USAGE_KIND,
  validateGatewayRequest,
} = await import(at("apps/edge/lib/ask-gateway.ts"));
```

In the under-the-budget case, the wire assertion (line 470) becomes Ask's own ceiling:

```js
  assert.deepEqual(
    net.calls[1].body,
    { model: ASK_MODEL, max_tokens: ASK_MAX_TOKENS, messages: REQUEST.messages, temperature: 1, stream: true },
    "no model named is the one the loop sends; max_tokens is clamped to Ask's ceiling, temperature to one; nothing the dashboard did not send is added",
  );
```

Append a new case at the end of the file. Workspace `T(40)` is used by no other case.

```js
test("what the Line needs from the gateway: Opus 5.5 is a model Ask may name, Ask's turn may carry its answer format under 8,000 characters, and Ask is clamped to ASK_MAX_TOKENS while the lead purposes keep their ceiling", async () => {
  const ask = (over) => validateGatewayRequest({ ...REQUEST, ...over }, "ask");
  assert.equal(ask({ model: "claude-opus-5-5" }).ok, true, "Opus 5.5, which the model gate may choose");
  assert.deepEqual(ask({ model: "claude-opus-5-9" }), { ok: false, error: "unknown model" }, "and still only the models listed");
  const schema = {
    type: "object",
    properties: { say: { type: "string" } },
    required: ["say"],
    additionalProperties: false,
  };
  const formatted = ask({ output_config: { effort: "low", format: { type: "json_schema", schema } } });
  assert.deepEqual(
    formatted.ok && formatted.request.output_config,
    { effort: "low", format: { type: "json_schema", schema } },
    "Ask's own turn keeps its format now: the answer is structured output (the Line, D3)",
  );
  const refused = { ok: false, error: "output_config.format: a JSON schema under 8,000 characters" };
  const huge = { type: "object", properties: { say: { type: "string", description: "x".repeat(8_001) } } };
  assert.deepEqual(ask({ output_config: { format: { type: "json_schema", schema: huge } } }), refused);
  assert.deepEqual(ask({ output_config: { format: { type: "text" } } }), refused);
  const ceiling = (purpose) => {
    const v = validateGatewayRequest({ ...REQUEST, max_tokens: 9_000 }, purpose);
    return v.ok ? v.request.max_tokens : v.error;
  };
  assert.equal(ceiling("ask"), ASK_MAX_TOKENS, "Ask's ceiling is the number its loop asks for");
  assert.equal(ceiling("lead_draft"), GATEWAY_MAX_TOKENS, "the lead purposes keep theirs");

  // Through the door: the model named and the format reach the model's wire as the dashboard sent them.
  use({ events: [] });
  const net = model();
  const res = await knock(
    T(40),
    turn({
      request: {
        ...REQUEST,
        model: "claude-opus-5-5",
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      },
    }),
  );
  assert.equal(res.status, 200);
  await res.text();
  assert.deepEqual(
    [net.calls[0].body.model, net.calls[0].body.output_config],
    ["claude-opus-5-5", { effort: "low", format: { type: "json_schema", schema } }],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/llm-door.test.mjs`
Expected: the new case FAILs, with "unknown model" for `claude-opus-5-5` and no `format` in `output_config`. The other cases pass: 2000 equals 2000.

- [ ] **Step 3: Implement**

In `apps/edge/lib/ask-gateway.ts`, change the import (line 13):

```ts
import { ASK_MAX_TOKENS, ASK_MODEL } from "./packages/contracts.js";
```

Replace lines 178-180:

```ts
/** The models a request may name; ASK_MODEL (contracts) is the one the loop sends and the default here. Opus 5.5 is the one the Line's model gate may choose (spec 8.3). */
export const GATEWAY_MODELS = ["claude-opus-5", "claude-opus-5-5", "claude-sonnet-5"] as const;
/** The lead purposes' ceiling. Ask's own is ASK_MAX_TOKENS (contracts), the number its loop asks for. */
export const GATEWAY_MAX_TOKENS = 2000;
```

In `validateGatewayRequest`, replace the `maxTokens` line:

```ts
  const cap = purpose === "ask" ? ASK_MAX_TOKENS : GATEWAY_MAX_TOKENS;
  const maxTokens = Math.min(cap, Math.max(64, Math.round(num(r.max_tokens) || 800)));
```

Replace the format lines (the comment and `const format = purpose === "ask" ? null : …`):

```ts
  // A format rides through for every purpose: the lead purposes answer as
  // records, and Ask's turn answers in its answer schema (the Line, D3).
  const format = formatOf(oc ? oc.format : undefined);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/llm-door.test.mjs`
Expected: every case passes.

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/ask-gateway.ts tooling/scripts/tests/llm-door.test.mjs
git commit -m "The gateway lets the Line through: Opus 5.5, Ask's answer format, Ask's own ceiling"
```

### Task 3: The stream parser reads thinking

**Files:**
- Modify: `apps/dashboard/src/server/ask/sse.ts`
- Test: `tooling/scripts/tests/ask.test.mjs`, the parser case at line 567

- [ ] **Step 1: Write the failing test**

Rename the case to `"the dashboard's stream parser: blocks, deltas, thinking and its signature, the stop reason, and pings ignored"`. Add these assertions before `featureRejected`:

```js
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}',
    ),
    { type: "block_start", index: 0, block: { type: "thinking" } },
    "a thinking block is its own kind, never text",
  );
  assert.deepEqual(
    mod.parseFrame(
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"redacted_thinking","data":"EmwKAhgB"}}',
    ),
    { type: "block_start", index: 1, block: { type: "redacted_thinking", data: "EmwKAhgB" } },
  );
  assert.deepEqual(
    mod.parseFrame('data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Two reads."}}'),
    { type: "thinking", index: 0, thinking: "Two reads." },
  );
  assert.deepEqual(
    mod.parseFrame('data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-abc"}}'),
    { type: "signature", index: 0, signature: "sig-abc" },
  );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="stream parser" tooling/scripts/tests/ask.test.mjs`
Expected: FAIL. The thinking start parses as `{ type: "text" }`, and the deltas parse as `null`.

- [ ] **Step 3: Implement**

In `sse.ts`, the block-start type and two new events:

```ts
export interface GatewayBlockStart {
  type: "block_start";
  index: number;
  block:
    | { type: "text" }
    | { type: "tool_use"; id: string; name: string }
    | { type: "thinking" }
    | { type: "redacted_thinking"; data: string };
}
```

```ts
/** A thinking block's words as they stream (empty when the display is omitted, the default). */
export interface GatewayThinkingDelta {
  type: "thinking";
  index: number;
  thinking: string;
}
/** A thinking block's signature: the part the model checks when the block comes back. */
export interface GatewaySignatureDelta {
  type: "signature";
  index: number;
  signature: string;
}
export type GatewayEvent =
  | GatewayBlockStart
  | GatewayTextDelta
  | GatewayInputDelta
  | GatewayThinkingDelta
  | GatewaySignatureDelta
  | GatewayBlockStop
  | GatewayStop
  | GatewayError;
```

`RawEvent` gains the fields these read:

```ts
interface RawEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string; data?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
    stop_reason?: string;
  };
  error?: { message?: string; type?: string };
}
```

In `parseFrame`, the `content_block_start` case becomes:

```ts
    case "content_block_start": {
      const b = ev.content_block;
      if (!b || typeof ev.index !== "number") return null;
      if (b.type === "tool_use")
        return {
          type: "block_start",
          index: ev.index,
          block: { type: "tool_use", id: b.id ?? "", name: b.name ?? "" },
        };
      // Thinking is its own kind: a model that always thinks (Opus 5.5) must
      // be handed it back unmodified, which a block read as text cannot be.
      if (b.type === "thinking") return { type: "block_start", index: ev.index, block: { type: "thinking" } };
      if (b.type === "redacted_thinking")
        return { type: "block_start", index: ev.index, block: { type: "redacted_thinking", data: b.data ?? "" } };
      return { type: "block_start", index: ev.index, block: { type: "text" } };
    }
```

The `content_block_delta` case gains two lines before `return null;`:

```ts
      if (ev.delta.type === "thinking_delta")
        return { type: "thinking", index: ev.index, thinking: ev.delta.thinking ?? "" };
      if (ev.delta.type === "signature_delta")
        return { type: "signature", index: ev.index, signature: ev.delta.signature ?? "" };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="stream parser" tooling/scripts/tests/ask.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/ask/sse.ts tooling/scripts/tests/ask.test.mjs
git commit -m "The stream parser reads thinking and its signature as their own kind"
```

### Task 4: The round keeps a thinking block whole

**Files:**
- Modify: `apps/dashboard/src/server/ask/round.ts`
- Test: `tooling/scripts/tests/ask-turn.test.mjs`, a new case after the round-gathering case (line 583)

- [ ] **Step 1: Write the failing test**

Change the import at line 27:

```js
const { runRound, replayBlocks } = await import(at("apps/dashboard/src/server/ask/round.ts"));
```

Add the case after `"the round gathers the stream: …"`:

```js
test("the round keeps a thinking block whole -- its words and its signature, or a redacted block's data -- and hands every block back in the order written", async () => {
  async function* stream() {
    yield { type: "block_start", index: 0, block: { type: "thinking" } };
    yield { type: "thinking", index: 0, thinking: "The day " };
    yield { type: "thinking", index: 0, thinking: "is in the snapshot." };
    yield { type: "signature", index: 0, signature: "sig-1" };
    yield { type: "block_stop", index: 0 };
    yield { type: "block_start", index: 1, block: { type: "redacted_thinking", data: "EmwKAhgB" } };
    yield { type: "block_stop", index: 1 };
    yield { type: "block_start", index: 2, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 2, partial: '{"filter":"recent"}' };
    yield { type: "block_stop", index: 2 };
    yield { type: "stop", stopReason: "tool_use" };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(
    r.blocks.map((b) => [b.type, b.thinking, b.signature, b.data, b.name]),
    [
      ["thinking", "The day is in the snapshot.", "sig-1", undefined, ""],
      ["redacted_thinking", undefined, undefined, "EmwKAhgB", ""],
      ["tool_use", undefined, undefined, undefined, "list_threads"],
    ],
  );
  assert.deepEqual(
    replayBlocks(r.blocks),
    [
      { type: "thinking", thinking: "The day is in the snapshot.", signature: "sig-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t1", name: "list_threads", input: { filter: "recent" } },
    ],
    "what the next request carries back: every block, unmodified, in order",
  );
  assert.deepEqual(
    replayBlocks([{ type: "text", id: "", name: "", text: "", json: "" }]),
    [{ type: "text", text: " " }],
    "an empty text block still goes back as a space, as before: the API refuses an empty one",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="thinking block whole" tooling/scripts/tests/ask-turn.test.mjs`
Expected: FAIL, because `replayBlocks` is not a function.

- [ ] **Step 3: Implement**

In `round.ts`, `RoundBlock` becomes:

```ts
export interface RoundBlock {
  type: "text" | "tool_use" | "thinking" | "redacted_thinking";
  id: string;
  name: string;
  text: string;
  json: string;
  /** A thinking block's words (empty when the display is omitted) and its signature, carried back unmodified. */
  thinking?: string;
  signature?: string;
  /** A redacted thinking block's data, carried back unmodified. */
  data?: string;
}
```

In `runRound`, the `block_start` case becomes:

```ts
      case "block_start":
        blocks.set(ev.index, {
          type: ev.block.type,
          id: ev.block.type === "tool_use" ? ev.block.id : "",
          name: ev.block.type === "tool_use" ? ev.block.name : "",
          text: "",
          json: "",
          ...(ev.block.type === "thinking" ? { thinking: "", signature: "" } : {}),
          ...(ev.block.type === "redacted_thinking" ? { data: ev.block.data } : {}),
        });
        if (ev.block.type === "tool_use" && ev.block.name === "finish") finishIndex = ev.index;
        break;
```

Two cases are added before `case "stop":`:

```ts
      case "thinking": {
        const b = blocks.get(ev.index);
        if (b) b.thinking = (b.thinking ?? "") + ev.thinking;
        break;
      }
      case "signature": {
        const b = blocks.get(ev.index);
        if (b) b.signature = (b.signature ?? "") + ev.signature;
        break;
      }
```

After `parseInput`:

```ts
/**
 * A round's blocks as the next request carries them back: in the order
 * written, and a thinking block exactly as it came -- its words and its
 * signature, or a redacted block's data -- because a model that always thinks
 * refuses a turn whose thinking was changed (Opus 5.5's migration guide). An
 * empty text block goes back as a space, which the API accepts; a tool call as
 * its parsed input.
 */
export function replayBlocks(blocks: RoundBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "thinking":
        return { type: "thinking", thinking: b.thinking ?? "", signature: b.signature ?? "" };
      case "redacted_thinking":
        return { type: "redacted_thinking", data: b.data ?? "" };
      case "text":
        return { type: "text", text: b.text || " " };
      default:
        return { type: "tool_use", id: b.id, name: b.name, input: parseInput(b.json) };
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="round" tooling/scripts/tests/ask-turn.test.mjs`
Expected: both round cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/ask/round.ts tooling/scripts/tests/ask-turn.test.mjs
git commit -m "A round keeps its thinking whole and hands every block back unmodified"
```

### Task 5: The loop replays thinking and asks for the one ceiling

**Files:**
- Modify: `apps/dashboard/src/server/ask/loop.ts`: the imports (lines 2-24), the `MAX_TOKENS` comment and constant (lines 40-48), the request (line 354), the replay (lines 538-545)
- Test: `tooling/scripts/tests/ask-turn.test.mjs`

- [ ] **Step 1: Write the failing test**

Import `ASK_MAX_TOKENS` at line 17:

```js
import { ASK_MAX_ROUNDS, ASK_MAX_TOKENS, ASK_MODEL, EVERYONE_LABEL, NO_NUMBER_REACH, noNumberWords } from "@chanlytics/contracts";
```

Add a case after `"a read, then the answer: …"`:

```js
test("a model that thinks: its thinking goes back with the tool results exactly as it came, never padded into text, and every round asks for ASK_MAX_TOKENS", async () => {
  const ctx = ctxFor();
  const thought = (signature) => ({ type: "thinking", id: "", name: "", text: "", json: "", thinking: "", signature });
  const hidden = { type: "redacted_thinking", id: "", name: "", text: "", json: "", data: "EmwKAhgB" };
  const s = scripted([
    ROUND([thought("sig-round-1"), hidden, tool("list_threads", { filter: "recent" })]),
    ROUND([thought("sig-round-2"), finish("Nobody is waiting on you.")]),
  ]);
  const { input } = turn(ctx);
  const r = await runAskTurn(input, ports(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  assert.equal(r.answer, "Nobody is waiting on you.");
  assert.deepEqual(
    s.requests.map((q) => q.max_tokens),
    [ASK_MAX_TOKENS, ASK_MAX_TOKENS],
    "one ceiling, the edge's",
  );
  const replayed = s.requests[1].messages.at(-2);
  assert.equal(replayed.role, "assistant");
  assert.deepEqual(
    replayed.content,
    [
      { type: "thinking", thinking: "", signature: "sig-round-1" },
      { type: "redacted_thinking", data: "EmwKAhgB" },
      { type: "tool_use", id: "t-list_threads", name: "list_threads", input: { filter: "recent" } },
    ],
    "the thinking block keeps its empty words and its signature (Opus 5.5 always thinks and refuses a turn whose thinking was changed)",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="a model that thinks" tooling/scripts/tests/ask-turn.test.mjs`
Expected: FAIL. `max_tokens` is `[2400, 2400]`, and the thinking block goes back as `{ type: "tool_use", id: "", name: "", input: {} }`.

- [ ] **Step 3: Implement**

In `loop.ts`, add `ASK_MAX_TOKENS` to the contracts import list (after `ASK_MAX_ROUNDS,`). Change the round import:

```ts
import { replayBlocks, runRound, type RoundBlock } from "./round";
```

Replace the comment and `const MAX_TOKENS = 2400;` (lines 40-48):

```ts
// The whole round -- the model's thinking, every tool call it makes and, when
// it answers in the same round, the answer itself -- fits in ASK_MAX_TOKENS
// (contracts), the one number the edge also clamps Ask to. An act tool's
// arguments are long -- propose_lead_search alone writes a who, a where, up to
// five terms, six criteria and six exclusions -- and at 1200 the stream reached
// the cap in the MIDDLE of that JSON. A cut-off tool call is not a smaller tool
// call: it does not parse at all (see `argsOf`). The loop then asked for 2400,
// but the edge clamped every round to 2000, so 2000 was the real ceiling; it is
// one number now, raised only when an eval case stops at it.
```

In the request, change `max_tokens: MAX_TOKENS,` to:

```ts
        max_tokens: ASK_MAX_TOKENS,
```

Replace the replay (lines 538-545):

```ts
      messages.push({ role: "assistant", content: replayBlocks(blocks) });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-turn.test.mjs`
Expected: every case passes, the new one included.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/ask/loop.ts tooling/scripts/tests/ask-turn.test.mjs
git commit -m "The loop hands thinking back unmodified and asks for the one ceiling"
```

### Task 6: Gates, PR, merge

- [ ] **Step 1: Run the four gates and the dist check, each to its own log**

```bash
corepack pnpm test > st-test.txt 2>&1; tail -n 8 st-test.txt
corepack pnpm -r typecheck > st-types.txt 2>&1; tail -n 3 st-types.txt
corepack pnpm lint > st-lint.txt 2>&1; tail -n 3 st-lint.txt
corepack pnpm format:check > st-format.txt 2>&1; tail -n 2 st-format.txt
corepack pnpm check:dist > st-dist.txt 2>&1; tail -n 3 st-dist.txt
```

Expected:
- `# fail 0` in the tests;
- typecheck done;
- lint with 0 errors;
- "All matched files use Prettier code style!";
- the dist check clean.

- [ ] **Step 2: Push and open the PR**

- **Title:** `Ask can take the Line's protocol: Opus 5.5, an answer format, one ceiling, thinking kept whole (1 of 4)`
- **What changes for a customer:** nothing. Ask answers as it does today.
- **What it makes possible:** the model gate's Opus 5.5, the structured answer (Plan 3), and a turn with a model that always thinks.
- **Proof:** the new cases and the gates' totals.
- **Before merging:** nothing.
- **Deploy order:** either. The edge accepts more than before, and the dashboard sends nothing new.
- The body ends with the attribution line.

- [ ] **Step 3: Watch CI, then squash-merge on green**

Watch CI with a Monitor that uses `gh pr view --json statusCheckRollup` and gh's own `-q`, and counts the checks. Then squash-merge and delete the branch.

- [ ] **Step 4: Check main's run and production**

- On main: CI and Database are green for the merge commit.
- On production: open Ask and ask "What can the receptionist do on its own?". It answers as before.

### Task 7: Prove the local eval path (spec 8.3's first step)

- [ ] **Step 1: One case through a local build**

- Start the dashboard from this branch with `EDGE_PROVIDERS=live` added to `.env.local`, and remove it afterwards.
- Run it with the four variables the harness requires (`eval-ask.mjs:14-15`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `E2E_USER_EMAIL` (the e2e owner). The command is: `ONLY=needs_me_en E2E_BASE_URL=http://localhost:3280 node tooling/scripts/eval-ask.mjs`.
- Expected: `Ask evals: 1/1 passed`.
- If the production edge refuses a local caller, record it in the spec's R9: Plan 3's runs move to right after deploy.

- [ ] **Step 2: Record the result**

- Add one line to the spec's section 8.3 saying which path the gate uses.
- Restore `.env.local`, `apps/dashboard/tsconfig.json` and `next-env.d.ts`.
