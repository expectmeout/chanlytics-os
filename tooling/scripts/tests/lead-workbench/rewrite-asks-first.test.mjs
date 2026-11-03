/**
 * Rewrite the opening asks what should change first (3 Nov 2026, 00505): the sheet's press, the held dock's or the one
 * under the email, opens the ask in the dock's place and sends nothing (sheet/run.ts runSheetAct), every other answer
 * goes as it is; the ask's Rewrite sends the owner's words, trimmed, through the email's own decide verb, then asks the
 * check of that email as a stream and says each step as it comes, and its toast holds Undo
 * (campaigns/reach-out/rewrite-ask.tsx, the one ask of every place). Run over the real verbs on a faked
 * `window.fetch`; the stub React keeps each hook's state and draws when this file asks.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "../_hook-frames.mjs";
import { useStubHooks } from "../_legacy-react.mjs";
import { until } from "../shared/_until.mjs";

let cells = {};
const frames = hookFrames();

globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useId: () => `:r${frames.key()}:`,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
useStubHooks();

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const SEND = "5e000000-0000-4000-8000-0000000000aa";
const RUN = "5e000000-0000-4000-8000-0000000000bb";
/** What the doors were sent, in order; and the check's stream, which this file writes line by line. */
const sent = [];
const edge = { stream: null, refuse: false };
const line = (l) => edge.stream.enqueue(new TextEncoder().encode(`${JSON.stringify(l)}\n`));
const NOW = { send_id: SEND, opening: "Harbor opens at 7.", written: true, held: null, paused: false, undo: true };
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/Chicago" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  refusalToast: (r, what) => ({ tone: "danger", msg: what }),
  fetch: async (url, init = {}) => {
    const { pathname } = new URL(String(url), "https://app.chanlytics.com");
    sent.push([init.method ?? "GET", pathname, init.body ? JSON.parse(init.body) : undefined]);
    if (/\/check$/.test(pathname)) {
      if (edge.refuse) return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
      return new Response(new ReadableStream({ start: (c) => (edge.stream = c) }), {
        status: 200,
        headers: { "content-type": "application/x-ndjson" },
      });
    }
    const data = /\/decide$/.test(pathname) ? { send_id: SEND, decision: "rewrite" } : {};
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};

const { runSheetAct } = await import("../../../../apps/dashboard/src/surfaces/leads/sheet/run.ts");
const { RewriteAsk } = await import("../../../../apps/dashboard/src/surfaces/campaigns/reach-out/rewrite-ask.tsx");
const { REWRITE_WORDS: W } = await import("@chanlytics/contracts");

const inTree = (node, id) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = inTree(kid, id);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.["data-testid"] === id) return node;
  return inTree(node.rendered, id) ?? inTree(node.props?.children, id);
};

beforeEach(() => {
  sent.length = 0;
  edge.stream = null;
  edge.refuse = false;
  cells = {};
  frames.reset();
});

/** A lead whose email the check held, as the sheet hands a press (sheet.tsx `run`). */
const runOf = (asks) => ({
  row: null,
  leadId: "lead-harbor",
  name: "Harbor Movers",
  contactId: null,
  on: null,
  pile: null,
  aim: { targets: [], target: null, load: async () => {}, check: async () => {}, choose() {}, reset() {} },
  flash: () => {},
  place: { sequence: { id: "seq-1", name: "Movers", state: "on" }, place: { send_id: SEND, batch_id: RUN } },
  elsewhere: null,
  next: null,
  openPicker() {},
  askSaid() {},
  askRewrite: () => asks.push("rewrite"),
  moved() {},
  over: false,
});

test("Rewrite the opening opens the ask and sends nothing; the other answers go as they are", async () => {
  const asks = [];
  await runSheetAct({ act: "decide", door: "rewrite" }, runOf(asks));
  assert.deepEqual([asks, sent], [["rewrite"], []]);
  await runSheetAct({ act: "decide", door: "skip" }, runOf(asks));
  assert.deepEqual(
    sent.map(([m, p, b]) => [m, p, b]),
    [["POST", `/api/v1/reach-out-sends/${SEND}/decide`, { decision: "skip" }]],
  );
});

/** The ask as a place draws it, and what it said back to the place. */
function askOf(over = {}) {
  const said = { flashes: [], moved: 0, back: 0, writing: [], landed: [] };
  const props = {
    sendId: SEND,
    runId: RUN,
    name: "Harbor Movers",
    flash: (f) => said.flashes.push(f),
    moved: () => (said.moved += 1),
    onBack: () => (said.back += 1),
    onWriting: (on) => said.writing.push(on),
    onLanded: (kept) => said.landed.push(kept),
    testid: "lead-sheet-rewrite",
    ...over,
  };
  const draw = () => {
    frames.begin();
    return frames.render(RewriteAsk, props);
  };
  return { said, draw, hint: () => inTree(draw(), "lead-sheet-rewrite-change").props.hint };
}

test("the ask's Rewrite sends what should change, trimmed, then the check of that email, each step said as it comes; its toast holds Undo", async () => {
  const { said, draw, hint } = askOf();
  assert.equal(hint(), W.changeHint);
  inTree(draw(), "lead-sheet-rewrite-change").props.onValueChange("  Lean on their weekend hours  ");
  inTree(draw(), "lead-sheet-rewrite-go").props.onClick();
  await until(() => edge.stream, "the check asked, once the decision landed");
  assert.deepEqual(sent, [
    ["POST", `/api/v1/reach-out-sends/${SEND}/decide`, { decision: "rewrite", change: "Lean on their weekend hours" }],
    ["POST", "/api/v1/reach-out-sends/check", { send_ids: [SEND], stream: true }],
  ]);
  assert.deepEqual([said.moved, said.writing], [1, [true]], "read again once decided, and said as being written");
  line({ t: "step", send_id: SEND, step: "reading" });
  await until(() => hint() === W.steps.reading, "the site's read, said");
  line({ t: "step", send_id: "5e000000-0000-4000-8000-0000000000cc", step: "checking" });
  line({ t: "step", send_id: SEND, step: "writing" });
  await until(() => hint() === W.steps.writing, "the writing, said; another email's step is not this one's");
  assert.equal(inTree(draw(), "lead-sheet-rewrite-go").props.disabled, true, "one press at a time");
  line({ t: "done", sends: [NOW] });
  edge.stream.close();
  await until(() => said.back > 0, "the ask closed once the opening landed");
  assert.deepEqual([said.moved, said.writing], [2, [true, false]], "read again, and no longer being written");
  assert.equal(said.flashes.length, 1);
  assert.equal(said.flashes[0].msg, "Harbor Movers' new opening is written");
  assert.equal(said.landed.length, 1, "the place holds the Undo beside the email");
  assert.equal(typeof said.flashes[0].undo, "function", "the toast holds Undo");
  await said.flashes[0].undo();
  assert.deepEqual(sent.at(-1).slice(0, 2), ["POST", `/api/v1/reach-out-sends/${SEND}/undo-rewrite`]);
});

test("an empty ask still rewrites with no words; a place with no toast says what came back in the ask itself", async () => {
  const { said, draw, hint } = askOf({ flash: null });
  inTree(draw(), "lead-sheet-rewrite-go").props.onClick();
  await until(() => edge.stream, "the check asked");
  assert.deepEqual(sent[0][2], { decision: "rewrite" }, "no words: a different opening");
  line({ t: "done", sends: [{ ...NOW, held: "unbacked_fact" }] });
  edge.stream.close();
  await until(() => said.writing.length === 2, "landed");
  assert.equal(hint(), "Harbor Movers' new opening is written, and the check held it");
  assert.equal(said.back, 0, "the ask stays, saying it");
});

test("Esc goes back, but not while it is being written; a check that could not be asked is said as still being written", async () => {
  const esc = (draw) => {
    let stopped = false;
    inTree(draw(), "lead-sheet-rewrite-change").props.onKeyDown({
      key: "Escape",
      preventDefault() {},
      stopPropagation: () => (stopped = true),
    });
    return stopped;
  };
  const idle = askOf();
  assert.deepEqual([esc(idle.draw), idle.said.back], [true, 1], "Esc, with nothing being written, goes back");

  cells = {};
  frames.reset();
  const busy = askOf();
  inTree(busy.draw(), "lead-sheet-rewrite-go").props.onClick();
  await until(() => edge.stream, "the check asked");
  assert.deepEqual([esc(busy.draw), busy.said.back], [false, 0], "Esc while it is written stays");
  line({ t: "done", sends: [NOW] });
  edge.stream.close();
  await until(() => busy.said.back === 1, "closed once it landed");

  cells = {};
  frames.reset();
  sent.length = 0;
  edge.refuse = true;
  const down = askOf();
  inTree(down.draw(), "lead-sheet-rewrite-go").props.onClick();
  await until(() => down.said.flashes.length === 1, "said");
  assert.equal(sent.length, 2, "decided, then the check asked");
  assert.equal(down.said.flashes[0].msg, "Harbor Movers' opening is being written again");
  assert.deepEqual(down.said.writing, [true, false]);
});
