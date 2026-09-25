# Ask Rewired, Phase 0: the turn measures itself, and the model becomes a profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before any of Ask's reads, prompt or tools move, every turn says where its time went and what the model was
fed, the eval runner can repeat a case and put an interval on the result, a script prints a day of production numbers,
and the model Ask runs on is one profile chosen by one environment variable, with Opus 5.5 as the default.

**Architecture:** Two pull requests, each mergeable alone, in this order. **PR 0.1** adds a `usage` event to the
dashboard's stream parser, timing and usage to a round, an `AskTurnShape` (contracts) that the loop fills, logs as
`ask_turn_shape` and returns to the route, which stores it on the turn's row beside the answer; the palette sends how
long it was open before the question; the eval runner gains repetitions, a per-surface report with Wilson intervals,
first-trace and first-say kept apart, an announcement of its turn count, and a stop when the model refuses three turns
in a row; a new script reads a day's stored shapes and usage rows. **PR 0.2** moves the model's name into a profile in
contracts (`ask-model.ts`), lets the dashboard pick it from `ASK_MODEL`, builds the edge's allowlist from the same list,
and flips the default to `claude-opus-5-5`. No migration in either. The spec is
`docs/superpowers/specs/2026-09-25-ask-rewired-design.md` (§5.8, §5.10, §5.11, §9 Phase 0).

**Tech stack:** pnpm monorepo, TypeScript 5.9, tsup-built committed dists (`packages/contracts/dist` must be rebuilt
and committed when contracts change), Next 16 (`apps/dashboard`), Vercel functions (`apps/edge`), the legacy Babel JSX
shell (`apps/dashboard/src/legacy`, versioned by `?v=N` in `Chanlytics.html`), `node --test` suites in
`tooling/scripts/tests` over `_fake-db.mjs`, zod 4.

---

## Where this fits

Ask today (read at `acd8ef73`, #1070): `POST /api/v1/ask` (`apps/dashboard/app/api/v1/ask/route.ts`) streams JSON
lines; `runAskTurn` (`apps/dashboard/src/server/ask/loop.ts`) builds the snapshot and the prefetch, then runs up to
`ASK_MAX_ROUNDS` rounds through `runRound` (`round.ts`), which reads the edge gateway's SSE stream through `streamModel`
(`gateway.ts`) and `parseFrame` (`sse.ts`). The edge (`apps/edge/api/admin/llm.ts`, `apps/edge/lib/ask-gateway.ts`)
holds the key, allows `GATEWAY_MODELS`, clamps Ask to `ASK_MAX_TOKENS`, and tees each round's usage into a
`usage.ask_tokens` event row. The loop already logs `ask_turn_shape` (snapshot ms, rounds, tools, form) and the route
logs `ask_turn` (ms, failure, citations). The model is the constant `ASK_MODEL = "claude-sonnet-5"` in
`packages/contracts/src/ask.ts:41`, re-exported by the loop and stored on every turn by the route; the effort is
`const EFFORT = "low"` in `loop.ts:66`. The eval runner `tooling/scripts/eval-ask.mjs` runs `tooling/evals/ask-cases.json`
(28 cases, all `surface: "today"`) once against a deployment and reads cost from the usage rows.

What this phase must NOT do: change what the model is told (system blocks, tools, messages), change any read, change
the answer's shape, or add a migration. Phases 1–7 do those; this one only measures and names the model.

## How every PR is proven (the same five checks, named once)

1. `corepack pnpm --filter "./packages/*" build`, then `git add -A && node tooling/scripts/check-dist.mjs` prints
   "dist in sync with src" (only PRs that touch `packages/contracts`; both do).
2. `corepack pnpm -r typecheck` prints no `error TS`.
3. `corepack pnpm lint` shows 0 errors.
4. `corepack pnpm test` shows 0 fail.
5. `git status` shows nothing unstaged after `corepack pnpm format` (the legacy tree and `docs/superpowers` are
   Prettier-ignored; everything else is formatted).

## The worktree, the branch, the PR (per PR)

```bash
cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/chanlytics-messaging"
git fetch origin main
git worktree add ../cm-ask-0-measure -b ask-rewired/0-1-measure origin/main
cd ../cm-ask-0-measure
corepack pnpm install --frozen-lockfile --prefer-offline
```

For PR 0.2 the names are `../cm-ask-0-model` and `ask-rewired/0-2-model-profile`, branched from `origin/main` **after
PR 0.1 has merged** (never stacked). Before every push: `git fetch origin main` and rebase if `main` moved (other
sessions merge Ask changes daily). Every PR description says: what changes for a customer, what to set before merging,
and the deploy order (both: either).

---

# PR 0.1 · The turn measures itself

### Task 1: The stream parser reads the usage frames

**Files:**

- Modify: `apps/dashboard/src/server/ask/sse.ts`
- Modify: `tooling/scripts/tests/ask.test.mjs:688-691` (the `message_delta` pin)
- Create: `tooling/scripts/tests/ask-shape.test.mjs` (the first test; later tasks add to it)

The API says what a message cost in two frames: `message_start` carries the input side and the cache counts,
`message_delta` the output side beside the stop reason. `parseFrame` drops the first and keeps only the stop reason of
the second. After this task it yields a `usage` event and a stop that carries `outputTokens`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/ask-shape.test.mjs`:

```js
/**
 * The shape of a turn: where the time went and what the model was fed.
 *
 * Phase 0 of Ask Rewired (docs/superpowers/specs/2026-09-25-ask-rewired-design.md, §5.8): the stream parser reads the
 * usage frames, a round keeps its timing and usage, the loop folds them into an AskTurnShape it logs and returns, the
 * route stores it on the turn's row and reads the palette's opened_ms, and the palette's client sends it. Every part is
 * executed here against a scripted model; nothing reaches a network.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sse = await import(at("apps/dashboard/src/server/ask/sse.ts"));

test("the parser: message_start is the usage (the input side, the cache counts, the message id); message_delta's stop carries the output side; a start without usage is nothing", () => {
  assert.deepEqual(
    sse.parseFrame(
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":1200,"cache_read_input_tokens":900,"cache_creation_input_tokens":300,"output_tokens":1}}}',
    ),
    { type: "usage", messageId: "msg_01", inputTokens: 1200, cacheReadTokens: 900, cacheCreationTokens: 300 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":42}}'),
    { type: "stop", stopReason: "end_turn", outputTokens: 42 },
  );
  assert.deepEqual(
    sse.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}'),
    { type: "stop", stopReason: "tool_use", outputTokens: null },
    "a delta without usage still stops; the output side is unknown, never zero",
  );
  assert.equal(sse.parseFrame('data: {"type":"message_start","message":{"id":"msg_02"}}'), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `parseFrame` of `message_start` returns `null` (the default case) and the stop has no `outputTokens`.

- [ ] **Step 3: Add the usage event and the output side to `sse.ts`**

In `apps/dashboard/src/server/ask/sse.ts`, replace the `GatewayStop` interface and the `GatewayEvent` union:

```ts
export interface GatewayStop {
  type: "stop";
  stopReason: string | null;
  /** The output side of the usage, on message_delta; null when the frame carried none (never zero: unknown is not free). */
  outputTokens: number | null;
}
/**
 * What a round costs, read off message_start: the input side and the cache
 * counts. The output side arrives with the stop. The edge tees the same frames
 * for the usage row (ask-gateway.ts teeUsage); this is the loop's own copy, so
 * a turn can say what it was fed without a database read.
 */
export interface GatewayUsage {
  type: "usage";
  /** The API's own id for the message; a later request's cache diagnostics (Phase 6) name it. */
  messageId: string | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
export type GatewayEvent =
  | GatewayBlockStart
  | GatewayTextDelta
  | GatewayInputDelta
  | GatewayThinkingDelta
  | GatewaySignatureDelta
  | GatewayBlockStop
  | GatewayStop
  | GatewayUsage
  | GatewayError;
```

Extend `RawEvent`:

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
  message?: { id?: unknown; usage?: Record<string, unknown> };
  usage?: { output_tokens?: unknown };
  error?: { message?: string; type?: string };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
```

In `parseFrame`'s `switch`, replace the `message_delta` case and add `message_start` beside it:

```ts
    case "message_start": {
      const u = ev.message?.usage;
      if (!u) return null;
      return {
        type: "usage",
        messageId: typeof ev.message?.id === "string" ? ev.message.id : null,
        inputTokens: num(u.input_tokens),
        cacheReadTokens: num(u.cache_read_input_tokens),
        cacheCreationTokens: num(u.cache_creation_input_tokens),
      };
    }
    case "message_delta": {
      const out = ev.usage?.output_tokens;
      return {
        type: "stop",
        stopReason: ev.delta?.stop_reason ?? null,
        outputTokens: typeof out === "number" && Number.isFinite(out) ? out : null,
      };
    }
```

- [ ] **Step 4: Update the existing pin**

In `tooling/scripts/tests/ask.test.mjs` the parser test (around line 688) pins the stop event. Change:

```js
  assert.deepEqual(
    mod.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}'),
    { type: "stop", stopReason: "end_turn" },
  );
```

to:

```js
  assert.deepEqual(
    mod.parseFrame('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}'),
    { type: "stop", stopReason: "end_turn", outputTokens: 3 },
  );
```

- [ ] **Step 5: Run both suites**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask.test.mjs`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/server/ask/sse.ts tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask.test.mjs
git commit -m "The stream parser reads the usage frames: message_start as usage, the output side on the stop"
```

### Task 2: A round keeps its timing and its usage

**Files:**

- Modify: `apps/dashboard/src/server/ask/round.ts`
- Test: `tooling/scripts/tests/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-shape.test.mjs`:

```js
const { runRound } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const tick = () => new Promise((r) => setTimeout(r, 5));

test("a round keeps its timing (first event, first text, the whole) and its usage (start plus stop), and a scripted or broken stream leaves them honest", async () => {
  async function* stream() {
    await tick();
    yield { type: "usage", messageId: "msg_01", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0 };
    yield { type: "block_start", index: 0, block: { type: "text" } };
    await tick();
    yield { type: "text", index: 0, text: '{"say": {"headline": "Two' };
    yield { type: "text", index: 0, text: ' wait"}}' };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "end_turn", outputTokens: 42 };
  }
  const r = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, stream);
  assert.deepEqual(r.usage, {
    messageId: "msg_01",
    inputTokens: 100,
    cacheReadTokens: 900,
    cacheCreationTokens: 0,
    outputTokens: 42,
  });
  assert.ok(r.timing.firstEventMs >= 0, "the first byte's time");
  assert.ok(r.timing.firstTextMs >= r.timing.firstEventMs, "the first text after the first byte");
  assert.ok(r.timing.totalMs >= r.timing.firstTextMs, "the whole after both");

  async function* silent() {
    yield { type: "block_start", index: 0, block: { type: "tool_use", id: "t1", name: "list_threads" } };
    yield { type: "input_json", index: 0, partial: "{}" };
    yield { type: "block_stop", index: 0 };
    yield { type: "stop", stopReason: "tool_use", outputTokens: null };
  }
  const s = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, silent);
  assert.equal(s.usage, null, "no usage frame, no usage: never a row of zeros");
  assert.equal(s.timing.firstTextMs, null, "a round that wrote no text has no first text");
  assert.ok(typeof s.timing.firstEventMs === "number");

  async function* nothing() {
    yield { type: "error", message: "gone" };
  }
  const n = await runRound({ tenantId: A, userId: USER, request: {} }, () => {}, nothing);
  assert.deepEqual([n.streamError, n.usage, n.timing.firstTextMs], ["gone", null, null]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `r.usage` is `undefined`, `r.timing` is `undefined`.

- [ ] **Step 3: Add timing and usage to `round.ts`**

Replace the `RoundResult` interface and `runRound` in `apps/dashboard/src/server/ask/round.ts`:

```ts
/** What the round cost, as the API said it on the stream (sse.ts GatewayUsage plus the stop's output side). */
export interface RoundUsage {
  messageId: string | null;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Null when the stop carried no usage: unknown, never zero. */
  outputTokens: number | null;
}

/** Where the round's time went, from the request: null when the event never came. */
export interface RoundTiming {
  firstEventMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
}

export interface RoundResult {
  /** In the order the model wrote them. */
  blocks: RoundBlock[];
  stopReason: string | null;
  /** The stream broke after it started; the blocks so far are still here. */
  streamError: string | null;
  /** Null when no usage frame came: a broken stream, or a scripted round in a test. */
  usage?: RoundUsage | null;
  timing?: RoundTiming;
}

/** `stream` is the gateway unless a test hands in its own events, so the gathering runs without a model. */
export async function runRound(
  call: GatewayCall,
  onText: (textSoFar: string) => void,
  stream: typeof streamModel = streamModel,
): Promise<RoundResult> {
  const t0 = Date.now();
  const blocks = new Map<number, RoundBlock>();
  let stopReason: string | null = null;
  let streamError: string | null = null;
  let usage: RoundUsage | null = null;
  let firstEventMs: number | null = null;
  let firstTextMs: number | null = null;
  let textSoFar = "";
  for await (const ev of stream(call)) {
    if (firstEventMs === null) firstEventMs = Date.now() - t0;
    switch (ev.type) {
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
        break;
      case "text": {
        const b = blocks.get(ev.index);
        if (!b) break;
        if (firstTextMs === null && ev.text) firstTextMs = Date.now() - t0;
        b.text += ev.text;
        textSoFar += ev.text;
        onText(textSoFar);
        break;
      }
      case "input_json": {
        const b = blocks.get(ev.index);
        if (b) b.json += ev.partial;
        break;
      }
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
      case "usage":
        usage = {
          messageId: ev.messageId,
          inputTokens: ev.inputTokens,
          cacheReadTokens: ev.cacheReadTokens,
          cacheCreationTokens: ev.cacheCreationTokens,
          outputTokens: null,
        };
        break;
      case "stop":
        stopReason = ev.stopReason;
        if (usage && ev.outputTokens !== null) usage.outputTokens = ev.outputTokens;
        break;
      case "error":
        streamError = ev.message;
        break;
      default:
        break;
    }
  }
  return {
    blocks: [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b),
    stopReason,
    streamError,
    usage,
    timing: { firstEventMs, firstTextMs, totalMs: Date.now() - t0 },
  };
}
```

`parseInput` and `replayBlocks` stay as they are.

- [ ] **Step 4: Run the suites that execute the round**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-turn.test.mjs`
Expected: PASS, 0 fail (ask-turn's fake-stream tests read only `blocks`, `stopReason` and `streamError`).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/ask/round.ts tooling/scripts/tests/ask-shape.test.mjs
git commit -m "A round keeps its timing and its usage"
```

### Task 3: The shape, as a contract

**Files:**

- Create: `packages/contracts/src/ask-shape.ts`
- Modify: `packages/contracts/src/index.ts:23` (add the export beside `./ask`)
- Test: `tooling/scripts/tests/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-shape.test.mjs`:

```js
test("the cache hit ratio: cache reads over everything the model was fed; nothing fed is null, not zero", async () => {
  const { cacheHitOf } = await import("@chanlytics/contracts");
  assert.equal(cacheHitOf({ input: 100, cache_read: 900, cache_creation: 0, output: 40 }), 0.9);
  assert.equal(cacheHitOf({ input: 0, cache_read: 0, cache_creation: 0, output: 0 }), null);
  assert.equal(cacheHitOf({ input: 100, cache_read: 0, cache_creation: 900, output: 40 }), 0, "a write is not a hit");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `cacheHitOf is not a function`.

- [ ] **Step 3: Create the contract**

Create `packages/contracts/src/ask-shape.ts`:

```ts
/**
 * The shape of one Ask turn, as the loop measured it: where the time went and
 * what the model was fed.
 *
 * Logged as `ask_turn_shape` and stored on the turn's own row
 * (ask_messages.content.shape), so a day's numbers are one query
 * (tooling/scripts/ask-day.mjs), never a search of the logs. Milliseconds
 * count from the turn's start in the loop. Null means "never happened this
 * turn": a turn answered by cards alone streams no Say; a broken stream has
 * no first byte; a script sends no opened_ms. The spec:
 * docs/superpowers/specs/2026-09-25-ask-rewired-design.md, 5.8.
 */
export interface AskTurnShape {
  v: 1;
  /** The model and the effort the rounds ran at. */
  model: string;
  effort: string;
  surface: string | null;
  scope_kind: string | null;
  /** A second or later question on its thread, and how long after the thread's previous turn it came. */
  follow_up: boolean;
  since_last_ms: number | null;
  /** From the palette opening to the question being sent, as the tab measured it. */
  opened_ms: number | null;
  /** The snapshot and the prefetch, before the first round. */
  snapshot_ms: number;
  prefetched: string[];
  rounds: number;
  /** Each round's time from its request to its last event. */
  rounds_ms: number[];
  /** Each tool call's name and time, in the order they ran. */
  tools_ms: Array<{ name: string; ms: number }>;
  /** The first byte of the model's stream, its first text token, and the first Say the person saw. */
  first_byte_ms: number | null;
  first_text_ms: number | null;
  first_say_ms: number | null;
  final_ms: number;
  /** Summed over the rounds, as the API counted them. */
  tokens: AskTurnTokens;
  /** Cache reads over everything the model was fed; null when nothing was counted (cacheHitOf). */
  cache_hit: number | null;
  /** Rounds that stopped at ASK_MAX_TOKENS. */
  cap_hits: number;
  /** Whether the answer's format held for the turn (false once the API refused it, D15). */
  format: boolean;
  failed: boolean;
}

export interface AskTurnTokens {
  input: number;
  cache_read: number;
  cache_creation: number;
  output: number;
}

/**
 * Cache reads over everything the model was fed: the reads, the writes and the
 * uncached input. A write is what a miss costs, so it counts against the hit.
 * Null when the model was not fed at all (a turn refused before its first
 * round), which no average should count as a miss.
 */
export function cacheHitOf(t: AskTurnTokens): number | null {
  const fed = t.input + t.cache_read + t.cache_creation;
  return fed > 0 ? t.cache_read / fed : null;
}
```

In `packages/contracts/src/index.ts`, after `export * from "./ask";` add:

```ts
export * from "./ask-shape";
```

- [ ] **Step 4: Rebuild the dist and run the test**

Run: `corepack pnpm --filter @chanlytics/contracts build && node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: the build writes `packages/contracts/dist`; the test PASSES.

- [ ] **Step 5: Commit (the dist with it)**

```bash
git add packages/contracts/src/ask-shape.ts packages/contracts/src/index.ts packages/contracts/dist tooling/scripts/tests/ask-shape.test.mjs
git commit -m "AskTurnShape: the shape of a turn, as a contract"
```

### Task 4: The loop fills the shape

**Files:**

- Modify: `apps/dashboard/src/server/ask/loop.ts`
- Test: `tooling/scripts/tests/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-shape.test.mjs`:

```js
const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));

const NONE = { kind: "none", id: "", label: "" };
const answerJson = (headline) =>
  JSON.stringify({
    say: { headline, detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE } },
    do: { open: { source: NONE, label: "", now: false }, next: [] },
    language: "en",
  });
const text = (t) => ({ type: "text", id: "", name: "", text: t, json: "" });
const tool = (name, input, id = `t-${name}`) => ({ type: "tool_use", id, name, text: "", json: JSON.stringify(input) });
/** A scripted round with the timing and usage a real one carries. */
const ROUND = (blocks, extra = {}) => ({
  blocks,
  stopReason: "tool_use",
  streamError: null,
  usage: { messageId: "m", inputTokens: 100, cacheReadTokens: 900, cacheCreationTokens: 0, outputTokens: 50 },
  timing: { firstEventMs: 3, firstTextMs: 7, totalMs: 20 },
  ...extra,
});
function scripted(rounds) {
  const requests = [];
  const round = async (c, onText) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText) : r;
  };
  return { round, requests };
}
/** What the loop logged under one event name, parsed. */
async function loggedInfo(event, fn) {
  const lines = [];
  const was = console.log;
  console.log = (s) => {
    try {
      const j = JSON.parse(s);
      if (j.event === event) lines.push(j);
    } catch {
      /* not ours */
    }
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = was;
  }
}
const turnInput = (over = {}) => ({
  ctx: { supabase: fakeDb({}), userId: USER, email: "ada@example.com", params: {} },
  tenantId: A,
  role: "operator",
  facts: workspaceFacts("Harbor", "America/New_York", null, []),
  timezone: "America/New_York",
  personLabel: "ada@example.com (operator)",
  language: "en",
  scope: null,
  surface: "today",
  history: [],
  text: "Who needs me?",
  emit: () => {},
  now: new Date("2026-09-14T14:00:00Z"),
  ...over,
});
/** The ports with the model scripted and every read answered at once, so no fixture is needed. */
const portsOf = (round) => ({
  round,
  snapshot: async () => "The day: nothing yet.",
  tool: async () => ({ result: JSON.stringify({ threads: [] }), isError: false }),
  propose: buildProposal,
});

test("the loop fills the shape: a read then an answer is two rounds with their times and summed tokens, the tool timed, the first byte and text from round one, the first Say when it streamed, the surface, the scope kind, the follow-up and the palette's opened_ms; logged as ask_turn_shape and returned", async () => {
  const s = scripted([
    ROUND([tool("list_threads", { filter: "recent" })]),
    (c, onText) => {
      const json = answerJson("Nobody is waiting.");
      onText(json);
      return ROUND([text(json)], { stopReason: "end_turn" });
    },
  ]);
  const { result: r, lines } = await loggedInfo("ask_turn_shape", () =>
    runAskTurn(
      turnInput({
        surface: "reports",
        scope: { kind: "call", id: "c1", label: "a call" },
        history: [{ role: "user", text: "earlier" }, { role: "assistant", text: "an answer" }],
        openedMs: 4200,
        sinceLastMs: 30_000,
      }),
      portsOf(s.round),
    ),
  );
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.equal(sh.v, 1);
  assert.deepEqual([sh.surface, sh.scope_kind, sh.follow_up, sh.since_last_ms, sh.opened_ms], ["reports", "call", true, 30_000, 4200]);
  assert.deepEqual([sh.rounds, sh.rounds_ms], [2, [20, 20]]);
  assert.deepEqual(sh.tokens, { input: 200, cache_read: 1800, cache_creation: 0, output: 100 }, "summed over the rounds");
  assert.equal(sh.cache_hit, 0.9);
  assert.equal(sh.cap_hits, 0);
  assert.equal(sh.format, true);
  assert.deepEqual(
    sh.tools_ms.map((t) => t.name),
    ["list_threads"],
  );
  assert.ok(sh.tools_ms[0].ms >= 0);
  assert.ok(sh.first_byte_ms >= 3 && sh.first_byte_ms < 5_000, "round one's first event, from the turn's start");
  assert.ok(sh.first_text_ms >= 7 && sh.first_text_ms >= sh.first_byte_ms, "round one's first text, from the turn's start");
  assert.ok(typeof sh.first_say_ms === "number" && sh.first_say_ms >= 0, "the Say streamed in round two");
  assert.ok(sh.final_ms >= sh.first_say_ms);
  assert.equal(sh.snapshot_ms >= 0, true);
  assert.deepEqual(sh.prefetched, []);
  assert.equal(typeof sh.model, "string");
  assert.equal(sh.effort, "low");
  assert.equal(lines.length, 1, "logged once");
  assert.deepEqual([lines[0].tenant, lines[0].rounds, lines[0].cache_hit, lines[0].opened_ms], [A, 2, 0.9, 4200]);
  assert.deepEqual(lines[0].tools, ["list_threads"], "the log keeps the tools list it always had");
});

test("a turn answered without a Say has none; a scripted round without timing or usage leaves the shape honest, not zero", async () => {
  const s = scripted([
    { blocks: [text(answerJson("Nobody is waiting."))], stopReason: "end_turn", streamError: null },
  ]);
  const r = await runAskTurn(turnInput(), portsOf(s.round));
  assert.equal(r.failed, false, r.failure ?? "");
  const sh = r.shape;
  assert.deepEqual([sh.first_byte_ms, sh.first_text_ms, sh.first_say_ms], [null, null, null]);
  assert.deepEqual(sh.tokens, { input: 0, cache_read: 0, cache_creation: 0, output: 0 });
  assert.equal(sh.cache_hit, null);
  assert.equal(sh.rounds_ms.length, 1, "a round without timing is still timed by the loop's own clock");
  assert.deepEqual([sh.follow_up, sh.since_last_ms, sh.opened_ms], [false, null, null]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `r.shape` is `undefined`.

- [ ] **Step 3: Fill the shape in `loop.ts`**

In `apps/dashboard/src/server/ask/loop.ts`:

(a) Add to the contracts import list: `cacheHitOf,` and `type AskTurnShape,`.

(b) Add to `TurnInput`, after `text: string;`:

```ts
  /** From the palette opening to the question being sent, as the tab measured it; null from an older tab or a script. */
  openedMs?: number | null;
  /** How long after the thread's previous turn this question came; null on a thread's first. */
  sinceLastMs?: number | null;
```

(c) Add to `TurnResult`, after `rounds: number;`:

```ts
  /** Where the time went and what the model was fed (ask-shape.ts): logged, and stored on the turn's row. */
  shape: AskTurnShape;
```

(d) In `runAskTurn`, after `let reads = 0;`:

```ts
  // Where the time went (AskTurnShape): the first byte of the model's stream,
  // its first text token, the first Say the person sees, each round's time,
  // each tool's, and what the model was fed by cache or not. Measured here
  // because only the loop sees all of it; the route stores it on the turn.
  let firstByteMs: number | null = null;
  let firstTextMs: number | null = null;
  let firstSayMs: number | null = null;
  const roundsMs: number[] = [];
  const toolsMs: Array<{ name: string; ms: number }> = [];
  const tokens = { input: 0, cache_read: 0, cache_creation: 0, output: 0 };
  let capHits = 0;
```

(e) Replace the whole `done` closure:

```ts
  const done = (r: {
    answer: AskAnswer;
    failed: boolean;
    failure: string | null;
    rounds: number;
    ungrounded?: boolean;
  }): TurnResult => {
    clearTimeout(timer);
    const shape: AskTurnShape = {
      v: 1,
      model: ASK_MODEL,
      effort: EFFORT,
      surface: input.surface,
      scope_kind: input.scope?.kind ?? null,
      follow_up: input.history.length > 0,
      since_last_ms: input.sinceLastMs ?? null,
      opened_ms: input.openedMs ?? null,
      snapshot_ms: snapshotMs,
      prefetched: plan.map((p) => p.name),
      rounds: r.rounds,
      rounds_ms: roundsMs,
      tools_ms: toolsMs,
      first_byte_ms: firstByteMs,
      first_text_ms: firstTextMs,
      first_say_ms: firstSayMs,
      final_ms: Date.now() - t0,
      tokens,
      cache_hit: cacheHitOf(tokens),
      cap_hits: capHits,
      format,
      failed: r.failed,
    };
    console.log(
      JSON.stringify({
        level: "info",
        event: "ask_turn_shape",
        tenant: input.tenantId,
        ...shape,
        snapshot: !!snapshot,
        tools: toolsUsed,
        form: r.answer.form,
      }),
    );
    return {
      ungrounded: false,
      tools: toolsUsed,
      proposals,
      latencyMs: Date.now() - t0,
      ...r,
      text: answerText(r.answer),
      shape,
    };
  };
```

(f) In `onText`, the line `input.emit({ t: "say", headline: say.headline, detail: say.detail });` becomes:

```ts
    if (firstSayMs === null) firstSayMs = Date.now() - t0;
    input.emit({ t: "say", headline: say.headline, detail: say.detail });
```

(g) Replace `propose` and `read` with timed versions:

```ts
  /** A tool call's time, kept in the order the calls ran. */
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      toolsMs.push({ name, ms: Date.now() - t });
    }
  };

  const propose = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    const args = argsOf(b);
    if (!args) return cutOff(b);
    return timed(b.name, async () => {
      const p = await ports.propose(tc, b.name, args);
      if (p.proposal) proposals.push(p.proposal);
      return { result: p.result, isError: p.isError };
    });
  };

  const read = async (b: RoundBlock) => {
    toolsUsed.push(b.name);
    const args = argsOf(b);
    if (!args) return cutOff(b);
    return timed(b.name, async () => {
      const out = await ports.tool(tc, { name: b.name, input: args });
      if (!out.isError) reads++;
      return { result: out.result, isError: out.isError };
    });
  };
```

(h) In the round loop, replace the block that declares `blocks`, `stopReason`, `streamError` and calls `ports.round`
inside the `try` (keep the `catch` exactly as it is):

```ts
      const roundAt = Date.now();
      let blocks: RoundBlock[];
      let stopReason: string | null;
      let streamError: string | null;
      try {
        const r = await ports.round(
          { tenantId: input.tenantId, userId: input.ctx.userId, request, signal: controller.signal },
          onText,
        );
        ({ blocks, stopReason, streamError } = r);
        roundsMs.push(r.timing?.totalMs ?? Date.now() - roundAt);
        if (r.timing) {
          if (firstByteMs === null && r.timing.firstEventMs !== null)
            firstByteMs = roundAt - t0 + r.timing.firstEventMs;
          if (firstTextMs === null && r.timing.firstTextMs !== null)
            firstTextMs = roundAt - t0 + r.timing.firstTextMs;
        }
        if (r.usage) {
          tokens.input += r.usage.inputTokens;
          tokens.cache_read += r.usage.cacheReadTokens;
          tokens.cache_creation += r.usage.cacheCreationTokens;
          tokens.output += r.usage.outputTokens ?? 0;
        }
      } catch (e) {
```

(i) In the `if (stopReason === "max_tokens") {` branch, add `capHits++;` as its first line.

(j) In the cards-alone branch, before `input.emit({ t: "say", headline: answer.say.headline, detail: answer.say.detail });`
add `if (firstSayMs === null) firstSayMs = Date.now() - t0;`.

- [ ] **Step 4: Run the Ask suites**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-turn.test.mjs tooling/scripts/tests/ask-routes.test.mjs tooling/scripts/tests/ask.test.mjs`
Expected: PASS, 0 fail. If `ask.test.mjs` pins the old `ask_turn_shape` log fields by text, the pinned strings
(`snapshot_ms`, `prefetched`, `rounds`, `tools`, `form`) are all still in the log; re-run and read the message if not.

- [ ] **Step 5: Typecheck the dashboard**

Run: `corepack pnpm --filter @chanlytics/dashboard typecheck`
Expected: no `error TS`.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/server/ask/loop.ts tooling/scripts/tests/ask-shape.test.mjs
git commit -m "The loop fills the shape: three latencies, the rounds, the tools, the tokens and the cache hit"
```

### Task 5: The route stores the shape, reads opened_ms and knows a follow-up

**Files:**

- Modify: `apps/dashboard/app/api/v1/ask/route.ts`
- Test: `tooling/scripts/tests/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-shape.test.mjs`:

```js
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setAskPorts } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
const askRoute = await import(at("apps/dashboard/app/api/v1/ask/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const membership = (tenant_id, role, slug, created_at) => ({ user_id: USER, tenant_id, role, tenants: { slug }, created_at });
const ctxFor = (tables) => ({ supabase: fakeDb(tables, {}), userId: USER, email: "ada@example.com", params: {} });
const post = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
const routeTables = () => ({
  memberships: [
    membership(A, "operator", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_config: [{ tenant_id: A, config: {}, version: 1 }],
  policies: [],
  ask_threads: [],
  ask_messages: [],
});

test("the route: the shape is stored on the turn's row with the palette's opened_ms; a second question on the thread is a follow-up with the time since the last turn; a bad opened_ms is nothing, never a refusal", async () => {
  const tables = routeTables();
  const written = answerJson("Nobody has booked this week yet.");
  setAskPorts({
    round: async (call, onText) => {
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    snapshot: async () => "",
  });
  try {
    const first = await askRoute.POST.run(post({ text: "Who booked this week?", surface: "today", opened_ms: 4200 }), ctxFor(tables));
    const lines = (await first.text()).trim().split("\n").map((l) => JSON.parse(l));
    const threadId = lines[0].id;
    const stored = tables.ask_messages[1].content;
    assert.equal(stored.shape.v, 1, "the shape rides on the turn's row");
    assert.deepEqual([stored.shape.opened_ms, stored.shape.follow_up, stored.shape.since_last_ms], [4200, false, null]);
    assert.equal(stored.shape.rounds, 1);
    assert.equal(stored.shape.cache_hit, 0.9);
    assert.ok(typeof stored.shape.first_say_ms === "number");
    assert.ok(!("shape" in lines[2].message), "the Line's message does not carry it: the row does");

    const again = await askRoute.POST.run(post({ text: "And last week?", thread_id: threadId, opened_ms: "soon" }), ctxFor(tables));
    await again.text();
    const second = tables.ask_messages[3].content;
    assert.equal(second.shape.follow_up, true);
    assert.ok(typeof second.shape.since_last_ms === "number" && second.shape.since_last_ms >= 0, "since the previous turn");
    assert.equal(second.shape.opened_ms, null, "a value that is not a number is nothing");
  } finally {
    setAskPorts(null);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `stored.shape` is `undefined`.

- [ ] **Step 3: Change the route**

In `apps/dashboard/app/api/v1/ask/route.ts`:

(a) Add `opened_ms?: unknown;` to the body type beside `answering?: unknown;`.

(b) After `const surface = ...;` add:

```ts
    // How long the palette was open before the question was sent, as the tab
    // measured it (AskTurnShape.opened_ms): milliseconds within an hour, else
    // nothing. Never refused: a script or an older tab sends none.
    const openedMs =
      typeof body?.opened_ms === "number" && Number.isFinite(body.opened_ms) && body.opened_ms >= 0
        ? Math.min(Math.round(body.opened_ms), 3_600_000)
        : null;
```

(c) In the thread block, declare `let sinceLastMs: number | null = null;` beside `let history` and, inside
`if (found && found.tenantId === tenantId) {`, after `history = found.turns;` add:

```ts
        // The thread's previous turn, before this question is appended: how long the person waited to ask again.
        const lastAt = found.messages.at(-1)?.atMs;
        sinceLastMs = lastAt ? Math.max(0, Date.now() - lastAt) : null;
```

(d) In the `runAskTurn({ ... })` call add `openedMs,` and `sinceLastMs,` after `text: askTurnText(text, answering),`.

(e) In `content`, after `rounds: result.rounds,` add `shape: result.shape,`.

(f) In the `ask_turn` log, after `language: result.answer.language,` add:

```ts
            first_say_ms: result.shape.first_say_ms,
            cache_hit: result.shape.cache_hit,
            follow_up: result.shape.follow_up,
            opened_ms: openedMs,
```

The `AskMessageVM` built for the stream is unchanged: the shape is the row's, not the Line's.

- [ ] **Step 4: Run the suites and typecheck**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-routes.test.mjs && corepack pnpm --filter @chanlytics/dashboard typecheck`
Expected: PASS, 0 fail; no `error TS`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/v1/ask/route.ts tooling/scripts/tests/ask-shape.test.mjs
git commit -m "The route stores the shape on the turn's row, reads the palette's opened_ms and knows a follow-up"
```

### Task 6: The palette says how long it was open

**Files:**

- Modify: `apps/dashboard/src/legacy-bridge/ask/api.ts` (the `send` input and body)
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (an `openedAt` ref, set on open, sent with the question)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html:111` (`ask-real.jsx?v=15` → `?v=16`)
- Modify: `tooling/scripts/tests/ask-palette.test.mjs` (the `ask()` stub records the whole input; one new test)
- Test: `tooling/scripts/tests/ask-shape.test.mjs` (the client body)

- [ ] **Step 1: Write the failing tests**

Append to `ask-shape.test.mjs`:

```js
test("the client sends opened_ms with the question when the palette measured one, and nothing when it did not", async () => {
  const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
  const { askApi } = await import(at("apps/dashboard/src/legacy-bridge/ask/api.ts"));
  const bodies = [];
  const client = createApi({
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response('{"t":"thread","id":"t1","title":"q"}\n', { status: 200 });
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {},
    now: () => 1_000,
  });
  const api = askApi(client);
  await api.send({ text: "q", threadId: null, scope: null, surface: "today", openedMs: 4200 }, () => {});
  await api.send({ text: "q", threadId: null, scope: null, surface: "today" }, () => {});
  assert.equal(bodies[0].opened_ms, 4200);
  assert.ok(!("opened_ms" in bodies[1]));
});
```

In `tooling/scripts/tests/ask-palette.test.mjs`, in the `ask()` stub change `const calls = { deleted: [], sent: [], opened: [] };`
to `const calls = { deleted: [], sent: [], opened: [], inputs: [] };` and its `send` to:

```js
    send: async (input) => {
      calls.sent.push(input.text);
      calls.inputs.push(input);
    },
```

Then add, after the N3 regression test:

```js
test("a question carries how long the Line was open before it was asked (AskTurnShape.opened_ms)", async () => {
  const calls = ask([]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how was the week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  await later(Palette, OPEN);
  assert.equal(calls.inputs.length, 1, "asked once");
  assert.ok(
    Number.isInteger(calls.inputs[0].openedMs) && calls.inputs[0].openedMs >= 0,
    `a whole number of milliseconds since the Line opened, got ${calls.inputs[0].openedMs}`,
  );
  await closes();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-palette.test.mjs`
Expected: FAIL — `bodies[0].opened_ms` is `undefined`; `calls.inputs[0].openedMs` is `undefined`.

- [ ] **Step 3: The client body**

In `apps/dashboard/src/legacy-bridge/ask/api.ts`, in `send`'s input type add after `answering?: ...;`:

```ts
        /** How long the Line was open before this question, in ms (AskTurnShape.opened_ms); omitted when unknown. */
        openedMs?: number | null;
```

and in the `body:` object add after the `answering` spread:

```ts
            ...(typeof input.openedMs === "number" && input.openedMs >= 0 ? { opened_ms: Math.round(input.openedMs) } : {}),
```

- [ ] **Step 4: The palette**

In `apps/dashboard/src/legacy/pages/ask-real.jsx`:

(a) Beside the other refs (after `const held = useArRef(false);`) add:

```jsx
  // When the Line opened: the question says how long it waited (the turn's shape, opened_ms).
  const openedAt = useArRef(0);
```

(b) In the effect that begins `// Open: the route's scope, the threads, and the surfaces the rows read`, as the first
line inside `if (!open || !A) return;` … i.e. right after that guard, add:

```jsx
    openedAt.current = Date.now();
```

(c) In `submit`, change the `A.send({ text: q, threadId, scope: thread.scope || scope, surface }, (ev) => {` line to:

```jsx
    await A.send({ text: q, threadId, scope: thread.scope || scope, surface, openedMs: openedAt.current ? Date.now() - openedAt.current : null }, (ev) => {
```

(d) In `apps/dashboard/src/legacy/Chanlytics.html` line 111 bump `pages/ask-real.jsx?v=15` to `?v=16`. (Two branches
bumping to the same number merge away silently: after rebasing on a moved `main`, check the number is still one above
`main`'s.)

- [ ] **Step 5: Run the suites**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-palette.test.mjs tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/ask.test.mjs`
Expected: PASS, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/legacy-bridge/ask/api.ts apps/dashboard/src/legacy/pages/ask-real.jsx apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/ask-palette.test.mjs tooling/scripts/tests/ask-shape.test.mjs
git commit -m "The palette says how long it was open before the question"
```

### Task 7: The arithmetic the scripts share

**Files:**

- Create: `tooling/scripts/ask-stats.mjs`
- Test: `tooling/scripts/tests/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-shape.test.mjs`:

```js
test("the stats: a spread is the median and the slowest tenth over the numbers that exist; a Wilson interval brackets a pass rate and never leaves 0..1", async () => {
  const { spread, wilson, pct } = await import(at("tooling/scripts/ask-stats.mjs"));
  assert.deepEqual(spread([5, 1, 3, null, undefined, NaN]), { n: 3, median: 3, p90: 5 });
  assert.deepEqual(spread([]), { n: 0, median: null, p90: null });
  const [lo, hi] = wilson(27, 28);
  assert.ok(lo > 0.8 && lo < 0.9 && hi > 0.99 && hi <= 1, `27 of 28 is about 82–99%, got ${lo}–${hi}`);
  assert.deepEqual(wilson(0, 0), [0, 0]);
  assert.deepEqual(wilson(3, 3).map((x) => x <= 1 && x >= 0), [true, true]);
  assert.equal(pct(0.964), "96%");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — cannot find module `ask-stats.mjs`.

- [ ] **Step 3: Create the module**

Create `tooling/scripts/ask-stats.mjs`:

```js
/**
 * The arithmetic the Ask scripts share (eval-ask.mjs, ask-day.mjs): a spread
 * over a list of timings, and a Wilson interval on a pass rate, so a run of
 * twenty-eight cases says "27 of 28 (95%: 82–99%)" and not "96%". Pure;
 * executed in tooling/scripts/tests/ask-shape.test.mjs.
 */

/** The median and the slowest tenth of the numbers that exist in `xs`. */
export function spread(xs) {
  const s = xs.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, median: null, p90: null };
  return {
    n: s.length,
    median: s[Math.floor(s.length / 2)],
    p90: s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * 0.9) - 1))],
  };
}

/** The 95% Wilson score interval on k passes of n, as [low, high] in 0..1; [0, 0] for no trials. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

/** A ratio as a whole percent. */
export const pct = (x) => `${Math.round(x * 100)}%`;

/** A millisecond figure for a table cell; a dash where there is none. */
export const ms = (n) => (typeof n === "number" ? `${Math.round(n)} ms` : "—");
```

- [ ] **Step 4: Run and commit**

Run: `node --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: PASS.

```bash
git add tooling/scripts/ask-stats.mjs tooling/scripts/tests/ask-shape.test.mjs
git commit -m "ask-stats: the spread and the Wilson interval the Ask scripts share"
```

### Task 8: The eval runner repeats, groups by surface, and knows when to stop

**Files:**

- Modify: `tooling/scripts/eval-ask.mjs`
- Modify: `tooling/evals/ask-cases.json` (a `surface` on every case; `must_never` on five)

No unit test runs this script (it mints a session against a deployment); the proof is a dry read of the file and one
run by Ruben at the phase's end. Keep every change inside the functions named here.

- [ ] **Step 1: The cases name their surface and their must-never**

In `tooling/evals/ask-cases.json` add `"surface": "today"` to every case (after `"text"`), and `"must_never": true`
to these five: `no_invention_person`, `asks_for_write`, `injection_in_data`, `other_workspace`, `money_locked`.
Run `node -e "JSON.parse(require('fs').readFileSync('tooling/evals/ask-cases.json','utf8'))"` to prove it still parses.

- [ ] **Step 2: The header, the knobs, and the imports**

At the top of `tooling/scripts/eval-ask.mjs`, extend the header comment's usage line to:

```js
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   E2E_USER_EMAIL=… [REPS=3] [SURFACE=today] [ONLY=id,id] node tooling/scripts/eval-ask.mjs [tooling/evals/ask-cases.json]
 *
 * REPS runs every case that many times (the gate runs three: spec 5.10). SURFACE keeps one surface's cases. The run
 * says how many turns it is about to spend before it spends one, and stops after three refusals in a row: a key with
 * no credit refuses every turn the same way, and the turns after the third say nothing about the model.
```

After `const ONLY = ...;` add:

```js
const REPS = Math.max(1, Math.round(Number(process.env.REPS) || 1));
const SURFACE = process.env.SURFACE || null;
```

Change the import line `import { ASK_TOKENS_DAY, cardOpenRoute, oneDoor } from "@chanlytics/contracts";` to also
import the shared stats:

```js
import { ASK_TOKENS_DAY, cardOpenRoute, oneDoor } from "@chanlytics/contracts";
import { spread, wilson, pct } from "./ask-stats.mjs";
```

and delete the script's own `const spread = (key) => { ... };` block (it is replaced below).

- [ ] **Step 3: One turn sends its surface and times its first trace**

Replace `async function ask(cookie, text)` with:

```js
async function ask(cookie, text, surface) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/v1/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: new URL(BASE).origin },
    body: JSON.stringify({ text, thread_id: null, scope: null, surface }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`ask ${res.status}: ${body.slice(0, 300)}`);
  }
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let carry = "";
  // When the person first sees words: the first `delta` (a v1 turn) or `say` (a v2 turn), from the request's start;
  // and when the model first decided anything: the first `trace` (a read or a card starting).
  let firstMs = null;
  let firstTraceMs = null;
  const take = (l) => {
    const e = JSON.parse(l);
    if (firstMs === null && (e.t === "delta" || e.t === "say")) firstMs = Date.now() - t0;
    if (firstTraceMs === null && e.t === "trace") firstTraceMs = Date.now() - t0;
    events.push(e);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) take(l);
  }
  if (carry.trim()) take(carry);
  const final = events.find((e) => e.t === "final");
  const thread = events.find((e) => e.t === "thread");
  const ms = Date.now() - t0;
  return {
    events,
    final: final?.message ?? null,
    threadId: thread?.id ?? null,
    ms,
    // A turn with no words streamed (a card, a failure) shows its words when the final lands.
    firstMs: firstMs ?? ms,
    firstTraceMs,
    deltas: events.filter((e) => e.t === "delta" || e.t === "say").length,
  };
}
```

- [ ] **Step 4: The run: announce, repeat, stop**

Replace everything from `const cases = JSON.parse(...)` down to (and including) the `for (const c of cases) { ... }`
loop with:

```js
const cases = JSON.parse(readFileSync(file, "utf8"))
  .map((c) => ({ ...c, surface: c.surface ?? "today" }))
  .filter((c) => !ONLY || ONLY.has(c.id))
  .filter((c) => !SURFACE || c.surface === SURFACE);
if (!cases.length) {
  console.error("no cases match ONLY/SURFACE");
  process.exit(2);
}
const session = await mint();
const cookie = cookieHeader(session);
// The budget before a case is asked: a run that starts near the cap ends in a wall of BUDGET refusals that say
// nothing about the model (ask-gateway.ts refuses at ASK_TOKENS_DAY over the last day).
const tenantId = await workspaceOf(session.user.id);
const usedToday = budgetTokens(await usageSince(tenantId, new Date(Date.now() - DAY_MS).toISOString()));
process.stderr.write(
  `Ask's budget today: ${usedToday.toLocaleString("en-US")} of ${ASK_TOKENS_DAY.toLocaleString("en-US")} tokens used before this run\n` +
    `${cases.length} cases × ${REPS} = ${cases.length * REPS} turns against ${BASE}. Every turn spends the model key the receptionist answers customers with; the run stops after three refusals in a row.\n`,
);
// A second of clock skew: the first row of a run lands seconds after this, and the previous run's last row can
// still be on its way (the edge writes it after its stream settles), so the window opens no earlier than this.
const startedAt = new Date(Date.now() - 1_000).toISOString();
const results = [];
/** The loop's own refusal sentences (loop.ts refusalText): the key, its credit, the model or the edge, never the case. */
const REFUSED = /refused the question|rechazó la pregunta|not connected to a model|no está conectado|could not reach the model|No pude llegar al modelo/;
let refusals = 0;
let stopped = null;
run: for (let rep = 1; rep <= REPS; rep++) {
  for (const c of cases) {
    let r;
    try {
      r = await ask(cookie, c.text, c.surface);
    } catch (e) {
      r = { final: null, error: e instanceof Error ? e.message : String(e), ms: 0, firstMs: 0, firstTraceMs: null, deltas: 0 };
    }
    const j = r.final ? judge(c, r) : { pass: false, fails: [r.error ?? "no answer"], notes: [] };
    results.push({
      id: c.id,
      rep,
      surface: c.surface,
      must_never: c.must_never === true,
      text: c.text,
      answer: r.final?.text ?? null,
      // The whole message, so a review can draw the answer as the Line does (the model gate's blind review).
      message: r.final,
      form: r.final?.answer?.form ?? null,
      shown: r.final?.answer
        ? {
            figures: r.final.answer.show.figures.length,
            items: r.final.answer.show.items.length,
            breakdown: !!r.final.answer.show.breakdown,
            open: r.final.answer.do.open?.to ?? null,
          }
        : null,
      rounds: r.final?.rounds ?? null,
      tools: r.final?.tools ?? [],
      proposals: (r.final?.proposals ?? []).map((p) => ({ kind: p.kind, title: p.title, summary: p.summary })),
      citations: r.final?.citations ?? [],
      language: r.final?.language ?? null,
      latency_ms: r.final?.latencyMs ?? r.ms,
      first_ms: r.firstMs,
      first_trace_ms: r.firstTraceMs,
      final_ms: r.ms,
      deltas: r.deltas,
      threadId: r.threadId ?? null,
      ...j,
    });
    process.stderr.write(
      `${j.pass ? "PASS" : "FAIL"} ${c.id}${REPS > 1 ? ` #${rep}` : ""} (${r.ms} ms, ${r.final?.rounds ?? "?"} round(s), tools ${JSON.stringify(r.final?.tools ?? [])}, cards ${JSON.stringify((r.final?.proposals ?? []).map((p) => p.kind))})${j.pass ? "" : "\n     " + j.fails.join("\n     ")}\n`,
    );
    refusals = r.final?.failed && REFUSED.test(r.final.text ?? "") ? refusals + 1 : 0;
    if (refusals >= 3) {
      stopped = `three refusals in a row at ${c.id} #${rep}: the key, its credit or the model. Nothing after this was asked.`;
      process.stderr.write(`STOP: ${stopped}\n`);
      break run;
    }
  }
}
```

- [ ] **Step 5: The summary: per surface, with intervals; must-never as pass^k**

Replace everything from `const passed = results.filter((r) => r.pass).length;` down to the `console.log` that prints
`Ask evals: …` and its per-model lines (keep the `for (const r of results)` listing and the backup write that follow)
with:

```js
const passed = results.filter((r) => r.pass).length;
const first = spread(results.map((r) => r.first_ms));
const trace = spread(results.map((r) => r.first_trace_ms));
const whole = spread(results.map((r) => r.final_ms));
const median = spread(results.map((r) => r.latency_ms)).median;
const oneRound = results.filter((r) => r.rounds === 1).length;
const repeats = results.filter((r) => r.notes?.length).length;
// A must-never case passes only when it passed every repetition (pass^k, spec 5.10).
const mustNever = [...new Set(results.filter((r) => r.must_never).map((r) => r.id))];
const mustNeverHeld = mustNever.filter((id) => results.filter((r) => r.id === id).every((r) => r.pass)).length;
// The edge writes a turn's last usage row as its stream settles, a moment after the final lands.
await new Promise((res) => setTimeout(res, 5_000));
const usage = summarizeUsage(await usageSince(tenantId, startedAt), results.filter((r) => r.message).length);
const reported = results.reduce((s, r) => s + (r.rounds ?? 0), 0);
const dollars = (n) => (n === null ? "unpriced" : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const interval = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} (95%: ${pct(lo)}–${pct(hi)})`;
};
console.log(
  `\nAsk evals: ${interval(passed, results.length)} passed over ${REPS} rep(s) · median ${median} ms · one-round ${oneRound}/${results.length}` +
    ` · first trace median ${trace.median ?? "—"} ms · first words median ${first.median} ms, p90 ${first.p90} ms · final median ${whole.median} ms, p90 ${whole.p90} ms` +
    `\n  must-never: ${mustNeverHeld}/${mustNever.length} cases held on every rep` +
    `\n  model ${Object.keys(usage.byModel).join("+") || "?"} · ${dollars(usage.per_turn)} per answered turn` +
    ` (${dollars(usage.cost)} the run, ${usage.rounds} rounds recorded of ${reported} reported)` +
    ` · at the cap ${usage.cap_hits} · repeats ${repeats}${stopped ? `\n  STOPPED: ${stopped}` : ""}`,
);
const surfaces = [...new Set(results.map((r) => r.surface))];
for (const s of surfaces) {
  const rs = results.filter((r) => r.surface === s);
  const f = spread(rs.map((r) => r.first_ms));
  const w = spread(rs.map((r) => r.final_ms));
  console.log(
    `  ${s}: ${interval(rs.filter((r) => r.pass).length, rs.length)} · one-round ${rs.filter((r) => r.rounds === 1).length}/${rs.length}` +
      ` · first words ${f.median} ms (p90 ${f.p90}) · final ${w.median} ms (p90 ${w.p90})`,
  );
}
for (const [model, m] of Object.entries(usage.byModel))
  console.log(
    `  ${model}: ${m.rounds} rounds · input ${m.input.toLocaleString("en-US")} · output ${m.output.toLocaleString("en-US")}` +
      ` · cache read ${m.cache_read.toLocaleString("en-US")} · cache write ${m.cache_creation.toLocaleString("en-US")}` +
      ` · ${dollars(m.cost)}`,
  );
```

In the backup's JSON object add `reps: REPS, stopped,` after `file,`. Change the final line to
`process.exit(passed === results.length && !stopped ? 0 : 1);`.

- [ ] **Step 6: Prove the file still parses and lint passes**

Run: `node --check tooling/scripts/eval-ask.mjs && corepack pnpm lint`
Expected: no output from `--check`; lint 0 errors.

- [ ] **Step 7: Commit**

```bash
git add tooling/scripts/eval-ask.mjs tooling/evals/ask-cases.json
git commit -m "The eval runner repeats, reports per surface with intervals, times the first trace, and stops after three refusals"
```

### Task 9: A day of production numbers, as one script

**Files:**

- Create: `tooling/scripts/ask-day.mjs`

Reads the last N hours of assistant turns (their stored shapes) and Ask's usage rows with the service role, and prints
one table per model and surface. Run by hand at the phase's end and by Ruben whenever the numbers are wanted; the
nightly that opens an issue on a bad day is Phase 6's.

- [ ] **Step 1: Create the script**

Create `tooling/scripts/ask-day.mjs`:

```js
/**
 * A day of Ask, in numbers.
 *
 * Reads the assistant turns of the last HOURS hours (their AskTurnShape, stored
 * on the row by the route since Phase 0) and Ask's usage rows (usage.ask_tokens,
 * one per model round, written by the edge), and prints one line per model and
 * surface: turns, one-round rate, follow-up rate, first Say, first text, final,
 * cache hit, cap hits, how long the palette was open, and the dollars a turn
 * cost at the models' list prices. Read-only; the service role, because a
 * day's turns belong to every member of every workspace.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… [HOURS=24] [TENANT=<uuid>] node tooling/scripts/ask-day.mjs [--json]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { spread, pct, ms } from "./ask-stats.mjs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOURS = Math.max(1, Number(process.env.HOURS) || 24);
const TENANT = process.env.TENANT || null;
const JSON_OUT = process.argv.includes("--json");
if (!URL_ || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(2);
}

/** Dollars per million tokens: uncached input, output, a five-minute cache write, a cache read (Anthropic's pages, read 23 Sep 2026). */
const PRICE = {
  "claude-sonnet-5": { input: 2, output: 10, cache_creation: 2.5, cache_read: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cache_creation: 5, cache_read: 0.2 },
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();
const tenantFilter = TENANT ? `&tenant_id=eq.${TENANT}` : "";
/** Every assistant turn in the window that carries a shape (turns from before Phase 0 carry none and are not counted). */
const turns = (
  await rest(
    `ask_messages?role=eq.assistant&created_at=gte.${encodeURIComponent(since)}${tenantFilter}` +
      `&select=tenant_id,content,created_at&order=created_at.asc&limit=5000`,
  )
)
  .map((r) => ({ tenant: r.tenant_id, at: r.created_at, shape: r.content?.shape ?? null, failed: r.content?.failed === true }))
  .filter((t) => t.shape && t.shape.v === 1);
const usage = (
  await rest(
    `events?kind=eq.usage.ask_tokens&created_at=gte.${encodeURIComponent(since)}${tenantFilter}&select=data&order=created_at.asc&limit=5000`,
  )
)
  .map((r) => r.data ?? {})
  .filter((d) => !d.purpose || d.purpose === "ask");

/** The dollars the window's rounds cost, by model, at list price; null for a model the table does not price. */
const cost = {};
for (const d of usage) {
  const p = PRICE[d.model];
  const m = (cost[d.model ?? "?"] ??= { rounds: 0, dollars: p ? 0 : null });
  m.rounds++;
  if (p)
    m.dollars +=
      (num(d.input_tokens) * p.input +
        num(d.output_tokens) * p.output +
        num(d.cache_creation_input_tokens) * p.cache_creation +
        num(d.cache_read_input_tokens) * p.cache_read) /
      1e6;
}

/** One row of the table: the shapes of a group of turns, summarised. */
function summarise(group) {
  const sh = group.map((t) => t.shape);
  return {
    turns: group.length,
    failed: group.filter((t) => t.failed).length,
    one_round: group.length ? group.filter((t) => t.shape.rounds === 1).length / group.length : null,
    follow_up: group.length ? sh.filter((s) => s.follow_up).length / group.length : null,
    first_say: spread(sh.map((s) => s.first_say_ms)),
    first_text: spread(sh.map((s) => s.first_text_ms)),
    final: spread(sh.map((s) => s.final_ms)),
    cache_hit: spread(sh.map((s) => s.cache_hit)),
    cap_hits: sh.reduce((n, s) => n + num(s.cap_hits), 0),
    opened: spread(sh.map((s) => s.opened_ms)),
    since_last: spread(sh.map((s) => s.since_last_ms)),
  };
}
const key = (t) => `${t.shape.model} · ${t.shape.surface ?? "none"}`;
const groups = {};
for (const t of turns) (groups[key(t)] ??= []).push(t);
const byModel = {};
for (const t of turns) (byModel[t.shape.model] ??= []).push(t);

const line = (name, s, dollars) =>
  `${name.padEnd(34)} ${String(s.turns).padStart(5)} ${String(s.failed).padStart(4)} ` +
  `${(s.one_round === null ? "—" : pct(s.one_round)).padStart(5)} ${(s.follow_up === null ? "—" : pct(s.follow_up)).padStart(5)} ` +
  `${ms(s.first_say.median).padStart(9)} ${ms(s.first_say.p90).padStart(9)} ${ms(s.first_text.median).padStart(9)} ` +
  `${ms(s.final.median).padStart(9)} ${ms(s.final.p90).padStart(9)} ${(s.cache_hit.median === null ? "—" : pct(s.cache_hit.median)).padStart(6)} ` +
  `${String(s.cap_hits).padStart(4)} ${ms(s.opened.median).padStart(9)} ${(dollars === undefined ? "" : dollars === null ? "unpriced" : `$${dollars.toFixed(3)}`).padStart(9)}`;

console.log(`Ask, the last ${HOURS} h${TENANT ? ` in ${TENANT}` : ""}: ${turns.length} turns with a shape, ${usage.length} usage rows\n`);
console.log(
  `${"model · surface".padEnd(34)} ${"turns".padStart(5)} ${"fail".padStart(4)} ${"1-rd".padStart(5)} ${"f-up".padStart(5)} ` +
    `${"say med".padStart(9)} ${"say p90".padStart(9)} ${"text med".padStart(9)} ${"final med".padStart(9)} ${"final p90".padStart(9)} ` +
    `${"cache".padStart(6)} ${"caps".padStart(4)} ${"open med".padStart(9)} ${"$/turn".padStart(9)}`,
);
for (const [model, group] of Object.entries(byModel)) {
  const c = cost[model];
  const perTurn = c && c.dollars !== null && group.length ? c.dollars / group.length : c ? null : undefined;
  console.log(line(model, summarise(group), perTurn));
  for (const [k, g] of Object.entries(groups).filter(([k]) => k.startsWith(`${model} · `)).sort((a, b) => b[1].length - a[1].length))
    console.log(line(`  ${k.slice(model.length + 3)}`, summarise(g)));
}
for (const [model, c] of Object.entries(cost))
  if (!byModel[model]) console.log(`${model}: ${c.rounds} usage rows and no turn with a shape (turns from before Phase 0, or another purpose)`);

if (JSON_OUT) {
  mkdirSync("tooling/backups", { recursive: true });
  const out = `tooling/backups/ask-day-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        hours: HOURS,
        tenant: TENANT,
        by_model: Object.fromEntries(Object.entries(byModel).map(([m, g]) => [m, summarise(g)])),
        by_model_surface: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, summarise(g)])),
        cost,
      },
      null,
      2,
    ),
  );
  console.log(`saved ${out}`);
}
```

- [ ] **Step 2: Prove it parses, lints, and refuses without credentials**

Run: `node --check tooling/scripts/ask-day.mjs && corepack pnpm lint && (env -u NEXT_PUBLIC_SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY node tooling/scripts/ask-day.mjs; echo "exit=$?")`
Expected: `--check` silent; lint 0 errors; the script prints the two variables it needs and exits 2.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/ask-day.mjs
git commit -m "ask-day: a day of Ask in numbers, per model and surface, from the stored shapes and the usage rows"
```

### Task 10: The gates, the PR

- [ ] **Step 1: The five checks**

Run, in the worktree:

```bash
corepack pnpm --filter "./packages/*" build && git add -A && node tooling/scripts/check-dist.mjs && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm format && git status --short
```

Expected: "dist in sync with src"; no `error TS`; 0 lint errors; 0 test failures; `git status` shows nothing
formatted that was not already staged (if Prettier touched a file, `git add` it and amend nothing: make one more commit
"format").

- [ ] **Step 2: Push and open the PR**

```bash
git fetch origin main && git rebase origin/main && git push -u origin ask-rewired/0-1-measure
gh pr create --title "Ask Rewired, Phase 0.1: the turn measures itself" --body-file - <<'EOF'
Phase 0 of docs/superpowers/specs/2026-09-25-ask-rewired-design.md (§5.8, §5.10, §9), first of two PRs.

**What changes for a customer:** nothing they see. Every Ask turn now records where its time went (first byte, first
text, first Say, each round, each tool) and what the model was fed (tokens by kind, cache hit ratio) as
`ask_messages.content.shape`, and logs it as `ask_turn_shape`; the palette sends how long it was open before a
question; the eval runner repeats and reports per surface with intervals; `tooling/scripts/ask-day.mjs` prints a day.

**What to set before merging:** nothing. No migration.

**Deploy order:** either. The dashboard reads two usage frames the edge already forwards; the edge is untouched.

Plan: docs/superpowers/plans/2026-09-25-ask-rewired-0-measure.md, PR 0.1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Then one combined review round (spec compliance and code quality together), fix, and squash-merge on green.

---

# PR 0.2 · The model as a profile, Opus 5.5 the default

Branch `ask-rewired/0-2-model-profile` from `origin/main` after PR 0.1 has merged.

### Task 11: The profile, in contracts

**Files:**

- Create: `packages/contracts/src/ask-model.ts`
- Modify: `packages/contracts/src/ask.ts:23-41` (the model's comment and `ASK_MODEL` move out)
- Modify: `packages/contracts/src/index.ts` (export `./ask-model`)
- Create: `tooling/scripts/tests/ask-model.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/ask-model.test.mjs`:

```js
/**
 * The model Ask runs on is a profile (spec 5.11): one list in contracts, a
 * default, and a lookup that never throws. The dashboard picks by environment
 * (server/ask/model.ts); the edge allows the same names (GATEWAY_MODELS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_MODEL, ASK_MODELS, ASK_MODEL_PROFILES, askModelProfile } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

test("the profiles: one per name in the list, Opus 5.5 the default, every profile at one effort, no forced tool choice on Opus 5.5, thinking replayed either way", () => {
  assert.deepEqual([...ASK_MODELS], ["claude-opus-5-5", "claude-sonnet-5"]);
  assert.equal(ASK_MODEL, "claude-opus-5-5", "Ruben's decision at approval, 25 Sep 2026");
  for (const id of ASK_MODELS) {
    const p = ASK_MODEL_PROFILES[id];
    assert.equal(p.id, id);
    assert.ok(p.effort === "low" || p.effort === "medium");
    assert.ok(p.thinking === "always" || p.thinking === "adaptive");
  }
  assert.equal(ASK_MODEL_PROFILES["claude-opus-5-5"].forcedToolChoice, false, "any/tool is a 400 on Opus 5.5");
  assert.equal(ASK_MODEL_PROFILES["claude-opus-5-5"].thinking, "always");
  assert.equal(ASK_MODEL_PROFILES["claude-sonnet-5"].thinking, "adaptive");
});

test("the lookup: a name in the list is its profile; unset, empty or unknown is the default, never a throw", () => {
  assert.equal(askModelProfile("claude-sonnet-5").id, "claude-sonnet-5");
  assert.equal(askModelProfile(undefined).id, ASK_MODEL);
  assert.equal(askModelProfile(null).id, ASK_MODEL);
  assert.equal(askModelProfile("").id, ASK_MODEL);
  assert.equal(askModelProfile("claude-9").id, ASK_MODEL);
});

test("the edge allows every profile and defaults to the same name, so the loop and the gateway cannot disagree", async () => {
  const { GATEWAY_MODELS, validateGatewayRequest } = await import(at("apps/edge/lib/ask-gateway.ts"));
  for (const id of ASK_MODELS) assert.ok(GATEWAY_MODELS.includes(id), `${id} allowed on the edge`);
  const ok = validateGatewayRequest({ max_tokens: 100, messages: [{ role: "user", content: "hi" }] });
  assert.ok(ok.ok && ok.request.model === ASK_MODEL);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-model.test.mjs`
Expected: FAIL — `ASK_MODELS` is not exported.

- [ ] **Step 3: Create the profile**

Create `packages/contracts/src/ask-model.ts`:

```ts
/**
 * The model Ask runs on, as a profile.
 *
 * Ask is built model-agnostic (the spec, 5.11): the turn, the tools, the
 * prompt and the store know nothing of the model but its name and the effort
 * it is asked at. What differs between the models Ask may name lives here,
 * once, so a switch is one environment variable and a redeploy, never a code
 * change. The dashboard picks the profile (server/ask/model.ts: ASK_MODEL in
 * its environment, this list's default when unset or unknown); the edge
 * gateway allows the same names (GATEWAY_MODELS is built from this list) and
 * defaults to the same one, so the two cannot drift apart.
 *
 * Opus 5.5 is the default by Ruben's decision at approval (25 Sep 2026). On
 * the Line's gate (23 Sep, spec 8.3: three runs each, low effort on both) it
 * wrote its first words a second sooner (2.3 s against 3.2 s median) and
 * answered in one round far more often (25 of 28 against 14), at $0.012 a
 * turn against $0.010; it lost that gate on grounding (24, 23, 22 of 28
 * against Sonnet 5's 27 every run: a read skipped and an unread row cited, a
 * card claimed twice that it had not proposed). The rewire addresses exactly
 * those conditions, and the gate re-runs on both models at every phase as a
 * confirmation; a must-never case that fails here and passes on Sonnet 5 is
 * reported the day it is seen, never reverted in silence.
 *
 * What the loop guarantees for every profile: tool_choice is auto or none and
 * never any or a named tool (a 400 on Opus 5.5); thinking blocks go back
 * exactly as they came (round.ts replayBlocks); the effort is the same on
 * every round; no sampling parameter is sent; the round ceiling is one number
 * the edge also clamps to (ASK_MAX_TOKENS).
 */
export const ASK_MODELS = ["claude-opus-5-5", "claude-sonnet-5"] as const;
export type AskModelId = (typeof ASK_MODELS)[number];

export interface AskModelProfile {
  id: AskModelId;
  /** The effort every round is asked at, identical on every round of a thread: a change mid-thread misses the cache. */
  effort: "low" | "medium";
  /**
   * Whether the model takes a forced tool choice (`any` or a named tool). Ask
   * sends `auto` and `none` only, which every model here accepts; recorded so
   * a change to the loop's choices is checked against the list, not found as
   * a 400 on production.
   */
  forcedToolChoice: boolean;
  /**
   * "always": the model thinks on every round and cannot be told not to;
   * "adaptive": it decides. Either way its blocks go back unmodified.
   */
  thinking: "always" | "adaptive";
}

export const ASK_MODEL_PROFILES: Record<AskModelId, AskModelProfile> = {
  "claude-opus-5-5": { id: "claude-opus-5-5", effort: "low", forcedToolChoice: false, thinking: "always" },
  "claude-sonnet-5": { id: "claude-sonnet-5", effort: "low", forcedToolChoice: true, thinking: "adaptive" },
};

/** The default: the profile a deployment runs when its environment names none. */
export const ASK_MODEL: AskModelId = "claude-opus-5-5";

/** The profile a name picks: one of the list, else the default. Never a throw: a misspelt variable runs the default. */
export function askModelProfile(name: string | null | undefined): AskModelProfile {
  const id = (ASK_MODELS as readonly string[]).includes(name ?? "") ? (name as AskModelId) : ASK_MODEL;
  return ASK_MODEL_PROFILES[id];
}
```

In `packages/contracts/src/ask.ts` delete the comment block that begins `/** * The model for a turn: choosing a tool
and writing sixty words.` through `export const ASK_MODEL = "claude-sonnet-5";` (lines 23–41; keep the line
`/** Tool rounds per turn: reads, then the answer. The last round is forced to finish. */` directly above
`export const ASK_MAX_ROUNDS = 4;`). In `packages/contracts/src/index.ts` add `export * from "./ask-model";` after
`export * from "./ask-shape";`.

- [ ] **Step 4: Rebuild the dist, run the test**

Run: `corepack pnpm --filter @chanlytics/contracts build && node --test tooling/scripts/tests/ask-model.test.mjs`
Expected: the first two tests PASS; the third FAILS on `GATEWAY_MODELS.includes` only if the edge list lacks a name
(it holds both today) and PASSES on the default (the edge reads `ASK_MODEL` from the dist). If all three pass, good.

- [ ] **Step 5: Build the edge's list from the profiles**

In `apps/edge/lib/ask-gateway.ts` change the import `import { ASK_MAX_TOKENS, ASK_MODEL } from "./packages/contracts.js";`
to `import { ASK_MAX_TOKENS, ASK_MODEL, ASK_MODELS } from "./packages/contracts.js";` and replace the `GATEWAY_MODELS`
comment and constant with:

```ts
/**
 * The models a request may name: Ask's profiles (contracts ASK_MODELS; ASK_MODEL is the loop's default and this door's
 * when a request names none) and Opus 5, which the lead purposes still name.
 */
export const GATEWAY_MODELS = ["claude-opus-5", ...ASK_MODELS] as const;
```

Run: `corepack pnpm --filter @chanlytics/edge typecheck && node --test tooling/scripts/tests/ask-model.test.mjs tooling/scripts/tests/llm-door.test.mjs`
Expected: no `error TS`; PASS.

- [ ] **Step 6: Commit (the dist with it)**

```bash
git add packages/contracts/src/ask-model.ts packages/contracts/src/ask.ts packages/contracts/src/index.ts packages/contracts/dist apps/edge/lib/ask-gateway.ts tooling/scripts/tests/ask-model.test.mjs
git commit -m "The model Ask runs on is a profile in contracts; Opus 5.5 the default; the edge allows the same list"
```

### Task 12: The dashboard picks the profile; the loop and the route use it

**Files:**

- Create: `apps/dashboard/src/server/ask/model.ts`
- Modify: `apps/dashboard/src/server/ask/loop.ts` (drop the `ASK_MODEL` re-export and `EFFORT`; ask the profile)
- Modify: `apps/dashboard/app/api/v1/ask/route.ts` (store `result.model`)
- Modify: `apps/dashboard/.env.example` (document `ASK_MODEL`)
- Modify: `tooling/scripts/tests/ask.test.mjs:1176-1186`, `tooling/scripts/tests/ask-routes.test.mjs:232`,
  `tooling/scripts/tests/ask-turn.test.mjs:286-293` (the pins)
- Test: `tooling/scripts/tests/ask-model.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `ask-model.test.mjs`:

```js
test("the dashboard picks by environment: unset is the default, a name in the list is that profile, an unknown name is the default and a warning once", async () => {
  const { askModel } = await import(at("apps/dashboard/src/server/ask/model.ts"));
  const was = process.env.ASK_MODEL;
  const warned = [];
  const warn = console.warn;
  console.warn = (name, rest) => warned.push([name, rest]);
  try {
    delete process.env.ASK_MODEL;
    assert.equal(askModel().id, ASK_MODEL);
    process.env.ASK_MODEL = "claude-sonnet-5";
    assert.equal(askModel().id, "claude-sonnet-5");
    process.env.ASK_MODEL = "claude-9";
    assert.equal(askModel().id, ASK_MODEL);
    askModel();
    assert.equal(warned.filter(([n]) => n === "ask_model_unknown").length, 1, "said once, not on every turn");
  } finally {
    console.warn = warn;
    if (was === undefined) delete process.env.ASK_MODEL;
    else process.env.ASK_MODEL = was;
  }
});

test("the loop asks the profile: the request names its id and its effort, and the turn returns the model it ran on", async () => {
  const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop.ts"));
  const { buildProposal } = await import(at("apps/dashboard/src/server/ask/proposals.ts"));
  const { workspaceFacts } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
  const { fakeDb } = await import("./_fake-db.mjs");
  const written = JSON.stringify({
    say: { headline: "Nobody is waiting.", detail: "" },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: { kind: "none", id: "", label: "" } } },
    do: { open: { source: { kind: "none", id: "", label: "" }, label: "", now: false }, next: [] },
    language: "en",
  });
  const requests = [];
  const round = async (c) => {
    requests.push(c.request);
    return { blocks: [{ type: "text", id: "", name: "", text: written, json: "" }], stopReason: "end_turn", streamError: null };
  };
  const was = process.env.ASK_MODEL;
  try {
    process.env.ASK_MODEL = "claude-sonnet-5";
    const r = await runAskTurn(
      {
        ctx: { supabase: fakeDb({}), userId: "u1", email: "ada@example.com", params: {} },
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "operator",
        facts: workspaceFacts("Harbor", "America/New_York", null, []),
        timezone: "America/New_York",
        personLabel: "ada@example.com (operator)",
        language: "en",
        scope: null,
        surface: "today",
        history: [],
        text: "Who needs me?",
        emit: () => {},
        now: new Date("2026-09-14T14:00:00Z"),
      },
      { round, snapshot: async () => "", tool: async () => ({ result: "{}", isError: false }), propose: buildProposal },
    );
    assert.equal(r.failed, false, r.failure ?? "");
    assert.equal(r.model, "claude-sonnet-5");
    assert.equal(requests[0].model, "claude-sonnet-5");
    assert.equal(requests[0].output_config.effort, ASK_MODEL_PROFILES["claude-sonnet-5"].effort);
    assert.equal(r.shape.model, "claude-sonnet-5");
  } finally {
    if (was === undefined) delete process.env.ASK_MODEL;
    else process.env.ASK_MODEL = was;
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tooling/scripts/tests/ask-model.test.mjs`
Expected: FAIL — cannot find `apps/dashboard/src/server/ask/model.ts`.

- [ ] **Step 3: The picker**

Create `apps/dashboard/src/server/ask/model.ts`:

```ts
import "server-only";
import { askModelProfile, type AskModelProfile } from "@chanlytics/contracts";

/**
 * The profile this deployment runs Ask on: ASK_MODEL in the environment, one
 * of contracts' ASK_MODELS, else the default. Read on every turn (it is one
 * string compare) so a test can set it; a deployment sets it once. An unknown
 * name runs the default and says so in the log once, never on every turn.
 */
let warnedFor: string | null = null;
export function askModel(): AskModelProfile {
  const name = process.env.ASK_MODEL || undefined;
  const profile = askModelProfile(name);
  if (name && profile.id !== name && warnedFor !== name) {
    warnedFor = name;
    console.warn("ask_model_unknown", JSON.stringify({ name, ran: profile.id }));
  }
  return profile;
}
```

- [ ] **Step 4: The loop**

In `apps/dashboard/src/server/ask/loop.ts`:

(a) Remove `ASK_MODEL,` from the contracts import list and delete the line
`export { ASK_MODEL } from "@chanlytics/contracts";`. Add `import { askModel } from "./model";` beside the other
local imports.

(b) Delete the `EFFORT` comment block and `const EFFORT: "low" | "medium" = "low";` (the profile owns the effort;
its reasoning is in ask-model.ts).

(c) Add to `TurnResult`, after `rounds: number;`: `/** The model the rounds ran on (the deployment's profile). */
model: string;`.

(d) In `runAskTurn`, after `const t0 = Date.now();` add `const model = askModel();`.

(e) In the request: `model: ASK_MODEL,` → `model: model.id,`; both `effort: EFFORT` → `effort: model.effort`.

(f) In `done`'s shape: `model: ASK_MODEL,` → `model: model.id,` and `effort: EFFORT,` → `effort: model.effort,`; in
`done`'s returned object add `model: model.id,` beside `shape`.

- [ ] **Step 5: The route and the environment**

In `apps/dashboard/app/api/v1/ask/route.ts` change the import `import { runAskTurn, ASK_MODEL, type TurnEvent } from "@/server/ask/loop";`
to `import { runAskTurn, type TurnEvent } from "@/server/ask/loop";` and in `content` change `model: ASK_MODEL,` to
`model: result.model,`.

In `apps/dashboard/.env.example`, after the `EDGE_PROVIDERS=` block, add:

```
# The model Ask answers on: one of contracts' ASK_MODELS (claude-opus-5-5,
# claude-sonnet-5). Empty = the default, claude-opus-5-5. An unknown name runs
# the default and is logged once (ask_model_unknown). A change is a redeploy;
# the prompt cache misses once (model_changed) and warms again.
ASK_MODEL=
```

- [ ] **Step 6: The pins**

In `tooling/scripts/tests/ask.test.mjs` (the "speed pass" test, around line 1178) replace the first two `assert.ok`
blocks with:

```js
  assert.ok(
    l.includes('import { askModel } from "./model";') && !l.includes("export { ASK_MODEL }") && !l.includes("const EFFORT"),
    "the loop asks the deployment's profile for the model and the effort, and names neither itself (spec 5.11)",
  );
  const route = readCode("apps/dashboard/app/api/v1/ask/route.ts");
  assert.ok(
    route.includes("model: result.model,") && !route.includes('model: "claude-'),
    "the saved turn names the model that ran",
  );
```

Remove `ASK_MODEL,` from that file's `@chanlytics/contracts` import only if nothing else in the file uses it (line 668
does: keep it). The same file pins the effort constant by text around line 1012
(`assert.ok(loop.includes('const EFFORT: "low" | "medium" = "low";'));`); replace that line with:

```js
  assert.ok(
    loop.includes("effort: model.effort") && !loop.includes("const EFFORT"),
    "the effort is the profile's, identical on every round (spec 5.11)",
  );
```

In `tooling/scripts/tests/ask-routes.test.mjs` add `import { ASK_MODEL } from "@chanlytics/contracts";` beside the
other imports, `delete process.env.ASK_MODEL;` beside the two `process.env` lines at the top, and change line 232 to:

```js
    assert.equal(stored.model, ASK_MODEL, "the model the deployment runs: the default here, since the test sets no ASK_MODEL");
```

In `tooling/scripts/tests/ask-turn.test.mjs` add `ASK_MODEL_PROFILES,` to the contracts import, `delete process.env.ASK_MODEL;`
beside the two `process.env` lines, and change the `output_config` pin (around line 286) to:

```js
  assert.deepEqual(
    s.requests[0].output_config,
    { effort: ASK_MODEL_PROFILES[ASK_MODEL].effort, format: { type: "json_schema", schema: ASK_ANSWER_FORMAT } },
    "every round may answer, in the answer's format, at the profile's effort",
  );
```

Leave `assert.equal(s.requests[0].model, ASK_MODEL);` as it is: the default is the profile the test runs. The pin
around line 561 (`{ effort: "low" }`, the round asked again without the format) becomes
`{ effort: ASK_MODEL_PROFILES[ASK_MODEL].effort }` for the same reason.

- [ ] **Step 7: Run everything Ask**

Run: `corepack pnpm --filter @chanlytics/dashboard typecheck && node --test tooling/scripts/tests/ask-model.test.mjs tooling/scripts/tests/ask-turn.test.mjs tooling/scripts/tests/ask-routes.test.mjs tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/llm-door.test.mjs`
Expected: no `error TS`; PASS, 0 fail. `grep -rn "claude-sonnet-5" apps/dashboard/src/server/ask apps/dashboard/app/api/v1/ask`
prints nothing.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/server/ask/model.ts apps/dashboard/src/server/ask/loop.ts apps/dashboard/app/api/v1/ask/route.ts apps/dashboard/.env.example tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/ask-routes.test.mjs tooling/scripts/tests/ask-turn.test.mjs tooling/scripts/tests/ask-model.test.mjs
git commit -m "The dashboard runs Ask on the profile its environment names; the loop and the route name no model of their own"
```

### Task 13: The gates, the PR

- [ ] **Step 1: The five checks** (the same command as Task 10, Step 1). Expected: all green.

- [ ] **Step 2: Push and open the PR**

```bash
git fetch origin main && git rebase origin/main && git push -u origin ask-rewired/0-2-model-profile
gh pr create --title "Ask Rewired, Phase 0.2: the model as a profile, Opus 5.5 the default" --body-file - <<'EOF'
Phase 0 of docs/superpowers/specs/2026-09-25-ask-rewired-design.md (§5.11), second of two PRs.

**What changes for a customer:** Ask answers on Opus 5.5 instead of Sonnet 5 (Ruben's decision at approval, 25 Sep).
On the 23 Sep gate that was first words a second sooner and one round far more often, at about +20% a turn; it lost
that gate on grounding, which the rewire's next phases address. The gate re-runs on both models before and after this
merges; a must-never regression is reported, not hidden.

**What to set before merging:** nothing. `ASK_MODEL` on the dashboard is optional; empty is the default
(claude-opus-5-5); `claude-sonnet-5` flips back without a code change. No migration.

**Deploy order:** either. The edge already allowed both names; its allowlist is now built from contracts' list.

Plan: docs/superpowers/plans/2026-09-25-ask-rewired-0-measure.md, PR 0.2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

One combined review round, fix, squash-merge on green.

---

# The phase's exit: the numbers (Ruben runs these; they spend the receptionist's key)

Phase 0 is complete when the spec's §0 table has an Opus 5.5 row and a Sonnet 5 row from the same telemetry, and the
gate has run three times on each. In order:

- [ ] **Before PR 0.2 merges** (production on Sonnet 5 with PR 0.1's telemetry): after a day,
  `HOURS=24 node tooling/scripts/ask-day.mjs --json` with the production Supabase URL and service key. Keep the file
  it writes (tooling/backups is ignored by git).

- [ ] **The gate on both models, on a local build against the production edge** (each run is 28 × 3 = 84 turns;
  say so before starting; stop at the first STOP line). From a worktree on `main` after PR 0.2:

  ```bash
  # Sonnet 5
  ASK_MODEL=claude-sonnet-5 EDGE_PROVIDERS=live corepack pnpm --filter @chanlytics/dashboard dev
  E2E_BASE_URL=http://localhost:3000 REPS=3 node tooling/scripts/eval-ask.mjs
  # Opus 5.5 (the default)
  EDGE_PROVIDERS=live corepack pnpm --filter @chanlytics/dashboard dev
  E2E_BASE_URL=http://localhost:3000 REPS=3 node tooling/scripts/eval-ask.mjs
  ```

  Each run prints the pass interval, the must-never pass^k line, first trace and first words medians, and the cost per
  turn from the usage rows. A must-never case that fails on Opus 5.5 and holds on Sonnet 5 is reported to Ruben with
  the case id and its saved transcript (`tooling/backups/eval-ask-*.json`) the same day.

- [ ] **After PR 0.2 merges** (production on Opus 5.5): after a day, `HOURS=24 node tooling/scripts/ask-day.mjs --json`
  again.

- [ ] **The baseline into the spec:** one docs commit on a branch `docs/ask-rewired-baseline` that fills §0's table
  with the two rows (first Say median and p90, first text median, final median and p90, one-round rate, cache hit
  median, cost per turn, cap hits, follow-up rate, opened_ms median) and dates them. Phase 1's plan is written against
  that `main`.
