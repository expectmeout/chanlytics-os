/**
 * Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6): what it shows at rest, how a
 * conversation folds above the line and ends at Clear, how Esc stops an answer, how a held Space talks; and what the
 * palette it replaced was fixed for, kept:
 * - A seeded question opened an empty palette: the shell opens the Line and sends in the same moment, and the palette
 *   listened only once it was open (the wiring audit's N3).
 * - A conversation was deleted by a hover × with no question and no Undo, and no key reached the × (N5).
 * - ⌘K "calendar" offered only to ask about it: the jump list stopped at the pages that were real before the
 *   Calendar, Lists, Campaigns, Setup, Billing and Activity shipped (N18).
 * Run against ask-real.jsx and its parts on a stub React whose effects run after their component returns, as React's
 * do, over the bridge's real palette, quick answers and speech and a recorded stand-in for the Ask routes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROPOSAL_GATE,
  ROLE_PERMS,
  roleGate,
  ASK_CITATION_KINDS,
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  ASK_SCOPE_KINDS,
  answerText,
  askJump,
  cardOpenRoute,
  emptyReadSet,
  groundCitations,
  normalizeAnswer,
  LeadSearchPlanSchema,
  LEAD_COUNT_CHOICES,
  LEAD_QUESTION_WAIT_LINE,
  leadEndingLine,
  leadPlanAsk,
  leadPlanFacts,
  leadPlanLikely,
  leadQuestionRoute,
  leadsRoute,
  planArea,
  planCeiling,
  planMinutes,
  planSaid,
  planSentence,
  planVersionOf,
  planWhere,
  planWho,
  planWords,
} from "@chanlytics/contracts";

/* ---------------------------------- the window ---------------------------------- */

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
globalThis.document = {
  body: { appendChild() {} },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
/** The window's listeners: events really travel here, because when the palette listens is what N3 is about. */
const heard = new Map();
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/today",
    search: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener: (type, fn) => {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener: (type, fn) => {
    if (heard.has(type)) heard.get(type).delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(heard.get(ev.type) || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __roleGate: roleGate,
  ST_STORE: { can: (a) => !!(ROLE_PERMS.owner || {})[a], myRole: () => "owner" },
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type. A component's effects run once it
// has returned, as React's do: the palette's effects reach functions it declares below its hooks. A setter marks the
// page changed, and `settle` draws again until nothing changes.
let cells = new Map();
let frames = [];
let dirty = false;
let lastTree = null;
const frameFor = (key) => ({ key, hook: 0, kids: {}, effects: [] });
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));
const memo = (make, deps) => {
  const k = slot();
  const was = cells.get(k);
  if (!was || !deps || !same(was.deps, deps)) cells.set(k, { value: make(), deps });
  return cells.get(k).value;
};
const runEffects = (frame) => {
  for (const { k, fn, deps } of frame.effects) {
    const prev = cells.get(k);
    if (prev && deps && same(prev.deps, deps)) continue;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  }
};
const effect = (fn, deps) => {
  const f = frames[frames.length - 1];
  f.effects.push({ k: slot(), fn, deps });
};
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") {
      const parent = frames[frames.length - 1];
      const name = type.name || "anon";
      parent.kids[name] = (parent.kids[name] || 0) + 1;
      const frame = frameFor(`${parent.key}/${name}:${parent.kids[name]}`);
      frames.push(frame);
      try {
        node.rendered = type(props);
      } finally {
        frames.pop();
      }
      runEffects(frame);
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [
      cells.get(k),
      (v) => {
        cells.set(k, typeof v === "function" ? v(cells.get(k)) : v);
        dirty = true;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, init);
    return [
      cells.get(k),
      (a) => {
        cells.set(k, red(cells.get(k), a));
        dirty = true;
      },
    ];
  },
  useRef: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  },
  useMemo: (fn, deps) => memo(fn, deps),
  useCallback: (fn, deps) => memo(() => fn, deps),
  useEffect: effect,
  useLayoutEffect: effect,
  useId: () => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, `id-${k}`);
    return cells.get(k);
  },
  Children: { map: (kids, fn) => [].concat(kids ?? []).map(fn), toArray: (kids) => [].concat(kids ?? []) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (n, p) => ({ ...n, props: { ...n.props, ...p } }),
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Confirm = globalThis.window.Confirm;
/** What the palette flashed, in order. */
const flashed = [];
Object.assign(globalThis.window, { usePPToast: () => [null, (m) => flashed.push(m)], CHANLY: { nav() {}, R: {} } });
await import("../../../../apps/dashboard/src/legacy/pages/ask-text.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/ask-hooks.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/ask-home.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/ask-turn.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/ask-real.jsx");
// Ask's face in the line (components/ask-face.jsx): drawn in every case; it moves only where a case installs the bridge.
await import("../../../../apps/dashboard/src/legacy/components/ask-face.jsx");
// A lead search's card on the rail is the finder's own plan card (leads-finder.jsx LeadPlanCard, hookless).
await import("../../../../apps/dashboard/src/legacy/pages/leads-finder.jsx");
const { askPalette, quickAnswer, surfaceFor } =
  await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
const { askSpeech } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/speech.ts");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const byClass = (tree, cls) =>
  all(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes(cls),
  );
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const pressOf = (k) => ({
  key: k,
  prevented: false,
  stopped: false,
  currentTarget: { control: true },
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
});
const press = (node) => {
  const e = pressOf();
  node.props.onClick(e);
  return e;
};
const flush = () => new Promise((r) => setImmediate(r));
/** Wait for a condition, never for a length of time: on as soon as `ok()` holds, a failure only at the ceiling. */
const until = async (ok, what, ceilingMs = 2000) => {
  const end = Date.now() + ceilingMs;
  while (!ok()) {
    if (Date.now() > end) assert.fail(`${what}: not within ${ceilingMs}ms`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const draw = (C, props) => {
  const root = frameFor("root");
  frames = [root];
  dirty = false;
  lastTree = C(props);
  frames = [];
  runEffects(root);
  return lastTree;
};
const render = (C, props) => {
  cells = new Map();
  return draw(C, props);
};
const settle = (C, props) => {
  for (let i = 0; dirty && i < 20; i++) draw(C, props);
  return lastTree;
};
/** Let the stand-in's promises land, then draw what they changed. */
const later = async (C, props) => {
  for (let i = 0; i < 6; i++) {
    await flush();
    settle(C, props);
  }
  return lastTree;
};

/* ------------------------------ the palette ------------------------------ */

const Palette = (props) => globalThis.window.AskReal(props);
const OPEN = { open: true, onClose() {} };
const CLOSED = { open: false, onClose() {} };
/** The shell's open landing: the palette drawn open, and what it asked for on the way. */
const opens = async () => {
  draw(Palette, OPEN);
  return later(Palette, OPEN);
};
const closes = async () => {
  draw(Palette, CLOSED);
  return later(Palette, CLOSED);
};
const inputOf = (tree) => byTestId(tree, "ask-input");
const typed = (tree, words) => inputOf(tree).props.onChange({ target: { value: words } });
const keyed = (tree, k) => inputOf(tree).props.onKeyDown(pressOf(k));
const sent = (type, detail) => globalThis.window.dispatchEvent(new CustomEvent(type, { detail }));
/** ⌘J, pressed anywhere in the Line: the window hears it, wherever the focus is. */
const cmdJ = () => {
  const e = { ...pressOf("j"), type: "keydown", metaKey: true, defaultPrevented: false };
  globalThis.window.dispatchEvent(e);
  return e;
};

/** A conversation as the Ask routes list it (contracts' AskThreadVM). */
const TH = (n) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`,
  title: `Question ${n}`,
  lastAtMs: Date.now() - n * 3_600_000,
  scope: null,
});
/** An answer as the routes return one (contracts' AskMessageVM). */
const said = (id, text) => ({
  id,
  role: "assistant",
  text,
  atMs: Date.now(),
  failed: false,
  citations: [],
  followups: [],
  proposals: [],
});
/**
 * Ask as the bridge installs it: the real palette, quick answers and speech over this window, and a recorded stand-in
 * for the routes that go out (the threads, one thread, a deletion, a turn, the openings).
 */
const ask = (threads = []) => {
  const calls = { deleted: [], sent: [], opened: [], inputs: [] };
  let list = [...threads];
  const palette = askPalette(globalThis.window, globalThis.localStorage);
  const openings = async () => ({ state: "no_calendar", days: [] });
  globalThis.window.__ask = {
    surfaceFor,
    ...palette,
    ...askSpeech(globalThis.window),
    quick: quickAnswer(palette, openings),
    answerText,
    cardOpenRoute,
    threads: async () => list,
    thread: async (id) => {
      calls.opened.push(id);
      const th = list.find((x) => x.id === id);
      return th
        ? {
            thread: th,
            messages: [
              {
                id: `u-${id}`,
                role: "user",
                text: th.title,
                atMs: th.lastAtMs,
                citations: [],
                followups: [],
                proposals: [],
              },
              said(`a-${id}`, `The answer to ${th.title}.`),
            ],
          }
        : { missing: true };
    },
    deleteThread: async (id) => {
      calls.deleted.push(id);
      list = list.filter((x) => x.id !== id);
      return true;
    },
    send: async (input) => {
      calls.sent.push(input.text);
      calls.inputs.push(input);
    },
    openings,
  };
  return calls;
};

/* ------------------------------ N3 ------------------------------ */

test("REGRESSION (N3): what the shell sends as the Line opens is taken -- a seeded question fired before the palette listened", async () => {
  const calls = ask([TH(1)]);
  render(Palette, CLOSED);
  // The shell keeps the Line mounted and closed, then opens it and sends in the same moment.
  sent("ask:seed", { prompt: "Draft a reply to Rosa", mode: "compose" });
  let tree = await opens();
  assert.equal(
    inputOf(tree).props.value,
    "Draft a reply to Rosa",
    "REGRESSION: the palette opened with the words gone",
  );

  await closes();
  sent("ask:seed", { prompt: "Summarise last week for me" });
  tree = await opens();
  assert.deepEqual(calls.sent, ["Summarise last week for me"], "a question to ask is asked as the Line opens");
  assert.ok(byTestId(tree, "ask-turn"), "and its conversation is open");

  await closes();
  tree = await opens();
  assert.ok(byTestId(tree, "ask-turn"), "⌘K alone brings the conversation back: it lasts until Clear (D14)");
  await closes();
});

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

test("the page is warmed as the Line opens, once, and again when the page under it changes while it is open (D6); closed, nothing is warmed; a bridge without the warm draws as before", async () => {
  const hash = globalThis.window.location.hash;
  const warmed = [];
  // The warm goes a tick after the page is drawn, so a page just under the Line has said what it drew.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const calls = ask([]);
  // The bridge's two calls the warm needs (legacy-bridge/ask.ts): the page's context and the warm itself.
  globalThis.window.__ask.context = (route) => ({
    v: 1,
    surface: "today",
    route: route.param ? `${route.page}/${route.param}` : route.page,
    rows: [],
    askedAt: 1,
  });
  globalThis.window.__ask.warm = async (context) => {
    warmed.push(context.route);
  };
  try {
    globalThis.window.location.hash = "#/today";
    render(Palette, CLOSED);
    await later(Palette, CLOSED);
    await tick();
    assert.deepEqual(warmed, [], "closed, nothing is warmed");
    await opens();
    await tick();
    assert.deepEqual(warmed, ["today"], "opening warms the page once");
    await later(Palette, OPEN);
    await tick();
    assert.deepEqual(warmed, ["today"], "and a draw that changes nothing warms nothing more");
    globalThis.window.location.hash = "#/inbox/th-aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    await opens();
    await tick();
    assert.deepEqual(
      warmed,
      ["today", "inbox/th-aaaaaaaa-aaaa-4aaa-8aaa-000000000001"],
      "the page under the Line changed: warmed again",
    );
    await closes();
    await tick();
    assert.equal(warmed.length, 2, "closing warms nothing");
    // A warm that fails costs nothing: the Line still opens and asks.
    globalThis.window.__ask.warm = async () => {
      throw new Error("offline");
    };
    globalThis.window.location.hash = "#/today";
    const tree = await opens();
    assert.ok(inputOf(tree), "the Line is drawn");
    await closes();
    // The palette suite's own bridge has neither call: the Line draws, and asks, as it did.
    delete globalThis.window.__ask.warm;
    delete globalThis.window.__ask.context;
    let t = await opens();
    typed(t, "how was the week?");
    t = await later(Palette, OPEN);
    keyed(t, "Enter");
    await later(Palette, OPEN);
    assert.equal(calls.inputs.length, 1, "asked once, with no warm to call");
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});

test("a seed that names a thread opens that thread, its last answer under the line", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, CLOSED);
  // Any caller may hand a conversation over as Ask opens: askAbout({ thread }) stays on the shell.
  sent("ask:seed", { thread: TH(2).id });
  const tree = await opens();
  assert.deepEqual(calls.opened, [TH(2).id], "the thread was read");
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 2.", "and its conversation is open");
  assert.deepEqual(calls.sent, [], "nothing was asked");
  await closes();
});

/* ------------------------------ the Line ------------------------------ */

// Today's queue as the Line reads it: a person waiting and a search waiting, so Right now has its two pills.
const askQueue = () => ({
  queue: {
    rows: [
      {
        id: "q1",
        kind: "handoff",
        conversationId: "c1",
        callId: null,
        who: "Nora",
        channel: "WhatsApp",
        when: "waited 2h",
        sentence: "Can I come at 3?",
        quoted: true,
        cta: { label: "Reply", to: "inbox/th-c1" },
      },
      {
        id: "q-s-s1",
        kind: "search",
        conversationId: null,
        callId: null,
        who: "personal trainers",
        channel: "Leads",
        when: "waited 3h",
        sentence: "Most of the first 25 are gyms, not trainers. Keep them?",
        quoted: false,
        cta: { label: "Answer", to: "clients/leads:s-s1:c-excluded" },
      },
    ],
    // The queue counts the search among those waiting; it is not a person, so it is not "1 more".
    waiting: 2,
  },
});

test("the Line at rest: Right now is Today's queue, then questions about the page, then earlier conversations -- and no key is drawn", async () => {
  globalThis.window.TODAY_DATA = askQueue();
  try {
    const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.equal(
      textOf(byClass(byTestId(tree, "ask-row-now"), "ask-row-label")[0]),
      "Nora is waiting on you; your search for personal trainers is waiting for your answer.",
    );
    // The pills beside the sentence say its counts (rightNowParts): one person waiting, no run, one search.
    assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "ask-pill").map(textOf), [
      "1 needs you",
      "1 search waiting",
    ]);
    assert.equal(
      globalThis.window.askText("en").searchWaiting(2),
      "2 searches waiting",
      "the pill counts several the same way",
    );
    assert.equal(textOf(byTestId(tree, "ask-row-brief")), "Brief me");
    assert.ok(textOf(tree).includes("Ask about Today"), "questions about the page, under its name");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-sug").length, 3, "three questions, as chips");
    assert.ok(byTestId(tree, "ask-row-sug").props.className.split(" ").includes("ask-chip"));
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length,
      3,
      "three earlier conversations",
    );
    assert.equal(
      textOf(byClass(byTestId(tree, "ask-row-thread"), "ask-row-meta")[0]),
      "1h ago",
      "each one line, its time at the right",
    );
    assert.ok(byTestId(tree, "ask-row-all").props.className.split(" ").includes("ask-chip"), "and the rest as a chip");
    assert.ok(!/[↵⌘↑↓]|\bEsc\b|\bdel\b/.test(textOf(tree)), `no key is drawn (D17): ${textOf(tree)}`);
    // ↵ on the empty line runs the row it stands on: Right now's own question, answered without a model.
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "a quick answer asks no model");
    assert.equal(
      textOf(byTestId(tree, "ask-say")),
      "Nora is waiting on you; your search for personal trainers is waiting for your answer.",
    );
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "ask-item").map((n) => textOf(n)),
      [
        "NoraWhatsApp · waited 2h“Can I come at 3?”",
        "personal trainersLeadsMost of the first 25 are gyms, not trainers. Keep them?",
      ],
      "the person and the search are their own doors; there is no second one to the Inbox",
    );
    assert.equal(byTestId(tree, "ask-open"), null);
    await closes();
  } finally {
    delete globalThis.window.TODAY_DATA;
  }
});

test("a follow-up folds the answer above the line; Clear ends the conversation, which stays in Earlier", async () => {
  const calls = ask([]);
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.sent.length}`, `Answer ${calls.sent.length}.`) });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how was the week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-say")), "Answer 1.");
  assert.ok(byTestId(tree, "ask-clear") && byTestId(tree, "ask-copy"), "an answer's line offers Copy and Clear");
  typed(tree, "and the week before?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how was the week?", "and the week before?"]);
  const folds = all(tree, (n) => n.props?.["data-testid"] === "ask-fold");
  assert.equal(folds.length, 1, "the first answer folds above the line");
  assert.ok(textOf(folds[0]).includes("how was the week?") && textOf(folds[0]).includes("Answer 1."));
  assert.equal(textOf(byTestId(tree, "ask-say")), "Answer 2.");
  press(byTestId(tree, "ask-clear"));
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-turn"), null, "home again");
  assert.ok(byTestId(tree, "ask-row-now"));
  // Nobody waits here (no queue): Right now is the sentence alone, no pill and no Brief me (spec 4.3).
  assert.equal(byTestId(tree, "ask-pill"), null);
  assert.equal(byTestId(tree, "ask-row-brief"), null, "a quiet queue is the sentence alone");
  await closes();
});

test("Esc while Ask reads stops waiting: the turn says so, and what the stream sends after changes nothing; Esc again closes", async () => {
  const calls = ask([]);
  let finish = () => {};
  globalThis.window.__ask.send = (input, on) =>
    new Promise((res) => {
      calls.sent.push(input.text);
      on({ t: "trace", text: "Reading the inbox…" });
      finish = () => {
        on({ t: "final", message: said("late", "Too late.") });
        res();
      };
    });
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  render(Palette, props);
  let tree = await later(Palette, props);
  typed(tree, "who wrote today?");
  tree = await later(Palette, props);
  keyed(tree, "Enter");
  tree = await later(Palette, props);
  assert.ok(textOf(byTestId(tree, "ask-reading")).includes("Reading the inbox…"), "reading, in the tools' words");
  assert.ok(byTestId(tree, "ask-stop"), "the line offers Stop while Ask reads");
  keyed(tree, "Escape");
  await later(Palette, props);
  assert.equal(closed, 0, "the first Esc stops the answer, and the Line stays");
  finish();
  tree = await later(Palette, props);
  assert.ok(textOf(byTestId(tree, "ask-say")).startsWith("Stopped."), textOf(tree));
  assert.ok(!textOf(tree).includes("Too late."), "the late answer changed nothing");
  keyed(tree, "Escape");
  assert.equal(closed, 1, "then Esc closes");
  await closes();
});

test("REGRESSION: a turn left behind writes nothing -- the palette ignored only the last one stopped, so a first stopped question's late answer landed as the latest", async () => {
  const calls = ask([]);
  const finish = {};
  globalThis.window.__ask.send = (input, on) =>
    new Promise((res) => {
      calls.sent.push(input.text);
      on({ t: "trace", text: `Reading for ${input.text}…` });
      finish[input.text] = () => {
        on({ t: "thread", id: TH(7).id, title: input.text });
        on({ t: "final", message: said(`late-${input.text}`, `Late answer to ${input.text}.`) });
        res();
      };
    });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  for (const q of ["first question", "second question"]) {
    typed(tree, q);
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    keyed(tree, "Escape");
    tree = await later(Palette, OPEN);
  }
  assert.deepEqual(calls.sent, ["first question", "second question"]);
  finish["first question"]();
  finish["second question"]();
  tree = await later(Palette, OPEN);
  assert.ok(!textOf(tree).includes("Late answer"), `a stopped turn's answer changed the line: ${textOf(tree)}`);
  assert.ok(textOf(byTestId(tree, "ask-say")).startsWith("Stopped."), "the line still says it stopped");
  await closes();
});

test("REGRESSION: a card sent once says Sent wherever it is drawn again -- a fold drew it fresh from the turn and offered Send a second time", async () => {
  const calls = ask([]);
  const committed = [];
  const MSG = "cccccccc-cccc-4ccc-8ccc-000000000001";
  Object.assign(globalThis.window.__ask, {
    commit: async (p) => {
      committed.push(p.id);
      return { ok: true, receipt: "Sent to Nora", undo: null };
    },
    outcome: async () => true,
    undoOpen: () => false,
    editReply() {},
    send: async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(8).id, title: input.text });
      const card = {
        id: "p1",
        kind: "reply",
        needs: "operator",
        title: "Reply to Nora",
        summary: "We're running 15 minutes late.",
        payload: { conversation_id: "c1" },
        undo: null,
      };
      on({
        t: "final",
        message:
          calls.sent.length === 1
            ? { ...said(MSG, "Here is a reply to send."), proposals: [card] }
            : said("m-2", "Tomorrow is quiet."),
      });
    },
  });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "tell nora we're late");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-card-approve"));
  tree = await later(Palette, OPEN);
  assert.deepEqual(committed, ["p1"]);
  assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("Sent to Nora"));
  typed(tree, "and tomorrow?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-fold"));
  tree = await later(Palette, OPEN);
  const fold = byClass(tree, "ask-fold")[0];
  assert.equal(byTestId(fold, "ask-card-approve"), null, "REGRESSION: the fold offered Send again");
  assert.ok(textOf(fold).includes("Sent to Nora"), "the fold's card says what happened");
  await closes();
});

test("a card's Approve is gated by the shell's rule: a role its gate refuses sees Approve, reads why at the control, and a press commits nothing; a role it lets commits (D8)", async () => {
  const calls = ask([]);
  const committed = [];
  const MSG = "cccccccc-cccc-4ccc-8ccc-000000000002";
  const was = { store: globalThis.window.ST_STORE, gate: globalThis.window.PROPOSAL_GATE };
  let role = "operator";
  // As the shell's are: the gate each kind checks (the bridge publishes contracts' PROPOSAL_GATE) and the member's role.
  globalThis.window.PROPOSAL_GATE = PROPOSAL_GATE;
  globalThis.window.ST_STORE = { can: (a) => !!(ROLE_PERMS[role] || {})[a], myRole: () => role };
  // An invitation made before an operator was refused one (a thread read back): its gate is `team`, an owner's.
  const card = {
    id: "p1",
    kind: "invite",
    needs: "owner",
    title: "Invite ada@example.com",
    summary: "As viewer",
    payload: { email: "ada@example.com", role: "viewer" },
    undo: null,
  };
  Object.assign(globalThis.window.__ask, {
    commit: async (p) => {
      committed.push(p.id);
      return { ok: true, receipt: "Invited ada@example.com as viewer", undo: null };
    },
    outcome: async () => true,
    undoOpen: () => false,
    editReply() {},
    send: async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(9).id, title: input.text });
      on({ t: "final", message: { ...said(MSG, "Here is the invitation."), proposals: [card] } });
    },
  });
  try {
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "invite ada as a viewer");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    let approve = byTestId(tree, "ask-card-approve");
    assert.deepEqual(
      [approve.props["aria-disabled"], approve.props["data-tip"], approve.props.disabled, approve.props.title],
      [true, "Only an owner can approve this card.", false, undefined],
      "REGRESSION: it was disabled with a title, which no keyboard or finger reaches",
    );
    const e = press(approve);
    tree = await later(Palette, OPEN);
    assert.deepEqual([committed, e.prevented], [[], true], "the press is refused at the control");
    assert.equal(byClass(tree, "ask-card-note").length, 0, "the reason is the control's, not a note beside it");
    role = "owner";
    tree = draw(Palette, OPEN);
    approve = byTestId(tree, "ask-card-approve");
    assert.equal(approve.props["aria-disabled"], undefined, "an owner's Approve is a plain button");
    press(approve);
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, ["p1"]);
    assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("Invited ada@example.com as viewer"));
  } finally {
    globalThis.window.ST_STORE = was.store;
    globalThis.window.PROPOSAL_GATE = was.gate;
  }
  await closes();
});

test("open, show or see: the Line goes there as the answer lands, and the place is offered once", async () => {
  const calls = ask([]);
  const went = [];
  const chanly = globalThis.window.CHANLY;
  globalThis.window.CHANLY = { ...chanly, nav: (to) => went.push(to) };
  const CV = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(6).id, title: input.text });
    on({
      t: "final",
      message: {
        ...said("m-open", "Opening the 3:34 AM call."),
        citations: [{ kind: "call", id: CV, label: "3:34 AM call", to: `conversations/cv-${CV}` }],
        navigate: { to: `conversations/cv-${CV}`, label: "Open", now: true },
      },
    });
  };
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  try {
    render(Palette, props);
    let tree = await later(Palette, props);
    typed(tree, "open the transcript of the most recent call");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["open the transcript of the most recent call"]);
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-item").length, 1, "the call is its own door");
    assert.equal(byTestId(tree, "ask-open"), null, "and an Open to the same call is not drawn beside it");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(went, [`conversations/cv-${CV}`], "the Line went there as the answer landed");
    assert.equal(closed, 1, "and closed on the way");
  } finally {
    globalThis.window.CHANLY = chanly;
  }
  await closes();
});

test("a turn since the Line: Say is drawn as it is written, the headline then the detail, Show and Do wait for the final message, and its answer's Open is followed though one door draws the call as its item", async () => {
  const calls = ask([]);
  const went = [];
  const chanly = globalThis.window.CHANLY;
  globalThis.window.CHANLY = { ...chanly, nav: (to) => went.push(to) };
  const CV = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
  const call = { kind: "call", id: CV, label: "Nora", to: `conversations/cv-${CV}`, door: true };
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Nora has waited longest.", detail: "She called at 3:34 AM." },
    show: {
      figures: [],
      items: [{ title: "Nora", meta: "Phone", line: "Asked for a call back.", source: call }],
      breakdown: null,
    },
    do: { open: { to: call.to, label: "Open the call", now: true }, next: [] },
    language: "en",
  };
  let land = () => {};
  const landed = new Promise((r) => (land = r));
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(7).id, title: input.text });
    on({ t: "say", headline: "Nora has waited", detail: "" });
    on({ t: "say", headline: "Nora has waited longest.", detail: "She called" });
    await landed;
    on({ t: "final", message: { ...said("m-v2", "Nora has waited longest. She called at 3:34 AM."), answer } });
  };
  let closed = 0;
  const props = { open: true, onClose: () => (closed += 1) };
  try {
    render(Palette, props);
    let tree = await later(Palette, props);
    typed(tree, "who has waited longest?");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    const say = byTestId(tree, "ask-say");
    assert.deepEqual(
      [textOf(byClass(say, "ask-headline")[0]), textOf(byClass(say, "ask-detail")[0])],
      ["Nora has waited longest.", "She called"],
      "the Say written so far replaces what was drawn",
    );
    assert.equal(byClass(say, "ask-cursor").length, 1, "one cursor, after the last word written");
    assert.equal(byTestId(tree, "ask-item"), null, "Show waits for the final message");
    land();
    tree = await later(Palette, props);
    assert.deepEqual(
      [textOf(byClass(tree, "ask-headline")[0]), textOf(byClass(tree, "ask-detail")[0])],
      ["Nora has waited longest.", "She called at 3:34 AM."],
    );
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-item").length, 1, "the call is its own door");
    assert.equal(byTestId(tree, "ask-open"), null, "so its Open is not drawn beside it");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(went, [`conversations/cv-${CV}`], "yet the Open they asked for is followed as the answer lands");
    assert.equal(closed, 1);
  } finally {
    globalThis.window.CHANLY = chanly;
  }
  await closes();
});

test("the answer on the rail: tiles with the receipt inside, items with a kind mark, one Open button and chips", async () => {
  const calls = ask([]);
  const final = {
    id: "m-r",
    role: "assistant",
    atMs: Date.now(),
    failed: false,
    citations: [],
    followups: [],
    proposals: [],
    text: "6 of 16 went unanswered.",
    answer: {
      v: 2,
      form: "structured",
      language: "en",
      say: { headline: "6 of 16 went unanswered.", detail: "Mostly after hours." },
      show: {
        figures: [
          {
            value: "5",
            label: "needed you",
            note: "up from 1",
            source: { kind: "page", id: "reports", label: "Reports, past 7 days", to: "reports", door: true },
          },
          { value: "20s", label: "median reply", note: "stayed fast", source: null },
        ],
        items: [
          {
            title: "Nora",
            meta: "WhatsApp · 2h",
            line: "Can I come at 3?",
            source: { kind: "thread", id: "c1", label: "Nora", to: "inbox/th-c1", door: true },
          },
        ],
        breakdown: null,
      },
      do: {
        open: { to: "reports", label: "Open the week in Reports", now: false },
        next: ["What caused it?", "Who still needs me?"],
      },
    },
  };
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(1).id, title: input.text });
    on({ t: "final", message: final });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how did the week go?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how did the week go?"]);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-mark").length, 3, "the rail's three squares");
  const tiles = all(tree, (n) => n.props?.["data-testid"] === "ask-tile");
  assert.equal(tiles.length, 2);
  assert.equal(byTestId(tiles[0], "ask-tile-from").props["data-open"], "false", "the receipt waits inside the tile");
  press(byTestId(tiles[0], "ask-figure"));
  tree = await later(Palette, OPEN);
  const opened = all(tree, (n) => n.props?.["data-testid"] === "ask-tile")[0];
  assert.equal(byTestId(opened, "ask-tile-from").props["data-open"], "true");
  assert.match(textOf(byTestId(opened, "ask-tile-from")), /From Reports, past 7 days/);
  assert.equal(
    byTestId(byTestId(opened, "ask-tile-from"), "ask-tile-door"),
    null,
    "Open already offers Reports, so the receipt draws no second door (oneDoor)",
  );
  assert.equal(
    byTestId(all(tree, (n) => n.props?.["data-testid"] === "ask-tile")[1], "ask-figure"),
    null,
    "a figure with no source is words",
  );
  assert.ok(byTestId(tree, "ask-item-mark"), "a row carries its kind");
  const open = byTestId(tree, "ask-open");
  assert.ok(open.props.className.split(" ").includes("btn"), "Open is the kit's button");
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-next").map((n) =>
      n.props.className.split(" ").includes("ask-chip"),
    ),
    [true, true],
  );
  // The reports door is offered once: the tile's receipt has no door beside Open (oneDoor), and the keys walk item, Open, next, next.
  keyed(tree, "ArrowDown");
  keyed(tree, "ArrowDown");
  keyed(tree, "ArrowDown");
  tree = await later(Palette, OPEN);
  assert.ok(
    all(tree, (n) => n.props?.["data-testid"] === "ask-next")[0]
      .props.className.split(" ")
      .includes("sel"),
  );
  await closes();
});

test("the Line takes back a Say the server set aside and shows the reads again; a later row to a place an earlier one opens is drawn as a row, never a second door", async () => {
  const calls = ask([]);
  let land = () => {};
  const landed = new Promise((r) => (land = r));
  const day = (title) => ({
    title,
    meta: "",
    line: "",
    source: { kind: "page", id: "calendar", label: "Calendar", to: "calendar", door: true },
  });
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Two visits tomorrow.", detail: "" },
    show: { figures: [], items: [day("10:00 visit"), day("2:00 visit")], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(8).id, title: input.text });
    on({ t: "say", headline: "Nothing is booked tomorrow.", detail: "" });
    on({ t: "say", headline: "", detail: "" });
    on({ t: "trace", text: "Reading the calendar…" });
    await landed;
    on({ t: "final", message: { ...said("m-day", "Two visits tomorrow."), answer } });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "what does tomorrow look like?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(byClass(tree, "ask-headline").length, 0, "the Say taken back is not drawn");
  assert.ok(textOf(byTestId(tree, "ask-reading")).includes("Reading the calendar…"), "the read is shown again");
  assert.ok(byTestId(tree, "ask-trace"), "the body is the question again");
  land();
  tree = await later(Palette, OPEN);
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-item").map((n) => [n.type, textOf(n)]),
    [
      ["button", "10:00 visit"],
      ["div", "2:00 visit"],
    ],
  );
  await closes();
});

test("Space held on an empty line talks; a tap does nothing; after words, Space is a space", async () => {
  const started = [];
  const talk = { start: () => started.push("start"), stop: () => started.push("stop") };
  let hold = null;
  let empty = true;
  const Probe = () => {
    hold = globalThis.window.AskHooks.useHoldSpace({ empty: () => empty, talk });
    return null;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  render(Probe, {});
  const down = pressOf(" ");
  assert.equal(hold.onKeyDown(down), true);
  assert.equal(down.prevented, true, "an empty line takes no leading space");
  await wait(340);
  assert.deepEqual(started, ["start"], "held: listening");
  assert.equal(hold.onKeyDown(pressOf(" ")), true, "the key's repeats while held are swallowed");
  assert.equal(hold.onKeyUp(pressOf(" ")), true);
  assert.deepEqual(started, ["start", "stop"], "let go: it asks");

  render(Probe, {});
  hold.onKeyDown(pressOf(" "));
  hold.onKeyUp(pressOf(" "));
  await wait(340);
  assert.deepEqual(started, ["start", "stop"], "a tap started nothing");

  empty = false;
  render(Probe, {});
  const typing = pressOf(" ");
  assert.equal(hold.onKeyDown(typing), false);
  assert.equal(typing.prevented, false, "a space between words is typed");
});

/* ------------------------------ Ask's face ------------------------------ */

test("the Line draws Ask's face in the line, and says Ask's mood as a turn runs", async () => {
  const { MASCOT } = await import("../../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
  globalThis.window.__mascot = MASCOT;
  const said = [];
  const stop = MASCOT.mood.subscribe((ev) =>
    said.push(ev.t === "state" ? ev.state : ev.t === "react" ? ev.kind : ev.t),
  );
  const calls = ask([]);
  const tick = () => new Promise((r) => setImmediate(r));
  // A turn as the stream sends it, one event per tick, so the palette draws between them.
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    const final = { id: "m-f", role: "assistant", text: "Nora has waited longest.", atMs: Date.now(), failed: false };
    for (const ev of [
      { t: "thread", id: TH(3).id, title: input.text },
      { t: "trace", text: "Reading the inbox…" },
      { t: "delta", text: "Nora has " },
      { t: "delta", text: "waited longest." },
      { t: "final", message: { ...final, citations: [], followups: [], proposals: [] } },
    ]) {
      await tick();
      on(ev);
    }
  };
  try {
    render(Palette, CLOSED);
    sent("ask:seed", { prompt: "who has waited longest?" });
    let tree = await opens();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-line-face"), "the three stand in the line");
    assert.deepEqual(calls.sent, ["who has waited longest?"]);
    assert.deepEqual(
      said.filter((s) => s !== "beat" && s !== "pulse"),
      ["thinking", "speaking", "idle"],
      "reading until the first words, answering while they stream, then at rest (the row nods on its own)",
    );
    assert.equal(said.filter((s) => s === "beat").length, 2, "a beat for each piece of the answer");
    assert.equal(said.filter((s) => s === "pulse").length, 1, "a pulse for the read that landed");
    assert.ok(said.indexOf("pulse") > said.indexOf("thinking"), "while it reads");
    await closes();
  } finally {
    stop();
    MASCOT.mood.set("idle");
    delete globalThis.window.__mascot;
  }
});

test("the band: one reading line says what Ask reads, Send fills with words, Stop while a turn runs", async () => {
  const calls = ask([]);
  const tick = () => new Promise((r) => setImmediate(r));
  let release;
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(1).id, title: input.text });
    on({ t: "trace", text: "Reading the inbox…" });
    on({ t: "trace", text: "Reading this week's calls…" });
    await new Promise((r) => {
      release = r;
    });
    on({
      t: "final",
      message: {
        id: "m-b",
        role: "assistant",
        text: "Done.",
        atMs: Date.now(),
        failed: false,
        citations: [],
        followups: [],
        proposals: [],
      },
    });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, true, "nothing to send yet");
  assert.equal(byTestId(tree, "ask-reading"), null, "no reading line at rest");
  typed(tree, "how did the week go?");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, false);
  press(byTestId(tree, "ask-send"));
  await tick();
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.sent, ["how did the week go?"]);
  assert.equal(textOf(byTestId(tree, "ask-reading")), "Reading this week's calls…", "the latest trace, one line");
  assert.ok(byTestId(tree, "ask-stop"), "Stop while it reads");
  assert.equal(byTestId(tree, "ask-send"), null);
  release();
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-reading"), null, "the line goes with the answer");
  await closes();
});

/* ------------------------------ the takeover (a phone) ------------------------------ */

/** A phone: the window's width query answers true, and history records what the Line pushes and takes back. */
const phoneWindow = () => {
  const mm = globalThis.window.matchMedia;
  const hist = globalThis.window.history;
  const log = [];
  globalThis.window.matchMedia = (q) => ({
    matches: q === "(max-width: 720px)",
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.window.history = {
    replaceState() {},
    pushState: (s, t, u) => log.push(["push", s, u]),
    back: () => {
      log.push(["back"]);
      globalThis.window.dispatchEvent(new Event("popstate"));
    },
  };
  globalThis.window.location.href = "https://app.chanlytics.com/w/studio#/today";
  return {
    log,
    restore: () => {
      globalThis.window.matchMedia = mm;
      globalThis.window.history = hist;
      delete globalThis.window.location.href;
    },
  };
};

test("on a phone the Line is the screen: focus on the dialog, not the field, the three in the hero, one history entry, Back closes, × goes back", async () => {
  const ph = phoneWindow();
  let closed = 0;
  const props = {
    open: true,
    onClose: () => {
      closed++;
    },
  };
  try {
    ask([]);
    // The field and the dialog are given something to focus on the first draw, before anything awaits, as the
    // desktop test below does: the focus effect fires on a 30ms timer (useAskFocus), and under load the draws that
    // follow can take longer than that. The refs are the same across draws.
    let tree = render(Palette, props);
    let focused = 0;
    let dialogFocused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    byTestId(tree, "ask-real").props.ref.current = {
      focus: () => {
        dialogFocused++;
      },
    };
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-hero"), "the hero stands on a phone");
    assert.ok(byTestId(byTestId(tree, "ask-hero"), "ask-line-face"), "the three are in the hero, not the band");
    assert.equal(byTestId(byTestId(tree, "ask-line"), "ask-line-face"), null, "and not in the band");
    assert.equal(byTestId(tree, "ask-real").props["aria-modal"], "true");
    await until(() => dialogFocused > 0, "the dialog takes focus on a phone");
    // A focus of the field would be on the same 30ms timer, set on the first draw: one more 30ms cannot end before it.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 0, "no keyboard of its own: the field is not focused as the takeover opens (S10)");
    assert.equal(dialogFocused, 1, "the dialog is (S10)");
    assert.deepEqual(
      ph.log,
      [["push", null, "https://app.chanlytics.com/w/studio#/today"]],
      "one entry, null state, same address (S8)",
    );
    // Back: the entry pops and the takeover closes, pushing nothing more. Drawn again, not rendered afresh, so the
    // Line's cleanups run as it closes, as React's do.
    globalThis.window.dispatchEvent(new Event("popstate"));
    assert.equal(closed, 1);
    draw(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.equal(ph.log.length, 1, "closing by Back goes back no further");
    // Open again; × closes through history.back().
    draw(Palette, props);
    tree = await later(Palette, props);
    press(byTestId(tree, "ask-close"));
    assert.equal(closed, 2);
    draw(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.deepEqual(ph.log.slice(1), [["push", null, "https://app.chanlytics.com/w/studio#/today"], ["back"]]);
    assert.equal(closed, 2, "the entry taken back is not a second close");
  } finally {
    await closes();
    ph.restore();
  }
});

test("on a phone a preset question answered without a model offers Clear in the head, as a conversation does, and Clear goes home", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose: () => {} };
  try {
    const calls = ask([]);
    render(Palette, props);
    let tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-clear-head"), null, "home: nothing to clear");
    typed(tree, "what's open saturday?");
    tree = await later(Palette, props);
    keyed(tree, "Enter");
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, [], "a quick answer asks no model");
    assert.ok(byTestId(tree, "ask-say"), "the quick answer is drawn");
    assert.ok(byTestId(tree, "ask-clear-head"), "and the head offers Clear over it");
    press(byTestId(tree, "ask-clear-head"));
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-say"), null, "cleared: the answer goes");
    assert.ok(byTestId(tree, "ask-row-now"), "home again");
    assert.equal(byTestId(tree, "ask-clear-head"), null);
    await closes();
  } finally {
    ph.restore();
  }
});

test("on a phone a place Ask goes to takes the takeover's entry: Back from there is the page Ask was opened over", async () => {
  const ph = phoneWindow();
  const went = [];
  globalThis.window.appNavigate = (to, o) => went.push([to, o]);
  try {
    ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "calendar");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-row-jump"));
    assert.deepEqual(went, [["calendar", { replace: true }]], "the entry becomes the place, not a second one");
    await closes();
    assert.deepEqual(
      ph.log,
      [["push", null, "https://app.chanlytics.com/w/studio#/today"]],
      "and nothing goes back over the place",
    );
  } finally {
    await closes();
    delete globalThis.window.appNavigate;
    ph.restore();
  }
});

test("on a desktop Ask pushes no entry of its own and focuses the field; a place it goes to is the shell's own push", async () => {
  const hist = globalThis.window.history;
  const nav = globalThis.window.CHANLY.nav;
  const log = [];
  const went = [];
  globalThis.window.history = {
    replaceState() {},
    pushState: (s, t, u) => log.push(["push", s, u]),
    back: () => log.push(["back"]),
  };
  globalThis.window.appNavigate = (to, o) => went.push([to, o]);
  // As constants.jsx has it: CHANLY.nav is the shell's navigate, which pushes.
  globalThis.window.CHANLY.nav = (to) => globalThis.window.appNavigate(to);
  try {
    ask([]);
    // The field and the dialog are given something to focus on the first draw, before anything awaits: the focus
    // effect fires on a 30ms timer (useAskFocus), and under load the draws that follow take longer than that, so
    // something given only after them missed the focus it was there to count. The refs are the same across draws.
    let tree = render(Palette, OPEN);
    let focused = 0;
    let dialogFocused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    byTestId(tree, "ask-real").props.ref.current = {
      focus: () => {
        dialogFocused++;
      },
    };
    tree = await later(Palette, OPEN);
    await until(() => focused > 0, "the field takes focus on a desktop");
    // A focus of the dialog would be on the same 30ms timer, set on the first draw: one more 30ms cannot end before it.
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(focused, 1, "the field takes focus on a desktop");
    assert.equal(dialogFocused, 0, "not the dialog");
    assert.equal(byTestId(tree, "ask-hero"), null, "and no hero stands");
    typed(tree, "calendar");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-row-jump"));
    assert.deepEqual(went, [["calendar", undefined]], "the shell's own push, never a replace");
    await closes();
    assert.deepEqual(log, [], "no entry of Ask's own, and nothing taken back");
  } finally {
    await closes();
    globalThis.window.history = hist;
    globalThis.window.CHANLY.nav = nav;
    delete globalThis.window.appNavigate;
  }
});

test("on a phone the mic keeps the finger: the lift asks what was heard, and Type instead leaves it in the field", async () => {
  const ph = phoneWindow();
  const recs = [];
  // The browser's recogniser, as far as the Line uses it: stopping it ends it, and what it heard comes back then.
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const captured = [];
  const down = () => ({ ...pressOf(), pointerId: 7, currentTarget: { setPointerCapture: (id) => captured.push(id) } });
  try {
    const calls = ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[0], "how did the week go");
    tree = await later(Palette, OPEN);
    assert.deepEqual(captured, [7], "the mic holds the finger");
    assert.ok(byTestId(tree, "ask-letgo"), "Let go to ask, while it listens");
    assert.ok(byTestId(tree, "ask-talk"), "over the band, still drawn, so the lift reaches the mic");
    let focused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    press(byTestId(tree, "ask-type-instead"));
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "REGRESSION: Type instead asked what was heard");
    assert.equal(inputOf(tree).props.value, "how did the week go", "the words are the field's, to finish");
    assert.equal(focused, 1, "and the field takes focus");
    assert.equal(byTestId(tree, "ask-letgo"), null);
    // With words in the field the one button is Send; cleared, it is the mic again (S12).
    assert.equal(byTestId(tree, "ask-talk"), null, "with words, the button is Send");
    assert.equal(byTestId(tree, "ask-send").props.disabled, false);
    typed(tree, "");
    tree = await later(Palette, OPEN);

    byTestId(tree, "ask-talk").props.onPointerDown(down());
    hears(recs[1], "how did the weekend go");
    tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerUp();
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["how did the weekend go"], "the lift off the mic asks");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
    ph.restore();
  }
});

test("one button at the field's end: the mic with no words, Send with words, and Send alone where the browser cannot listen (S12)", async () => {
  // Where the browser listens: the mic at rest, Send once there are words, the mic again once they are cleared.
  globalThis.window.SpeechRecognition = class {
    start() {}
    stop() {}
  };
  try {
    ask([]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    const mic = byTestId(tree, "ask-talk");
    assert.ok(mic, "the mic, with no words");
    assert.equal(mic.props.className, "ask-send talk", "the same circle Send is");
    assert.equal(mic.props["aria-pressed"], false);
    assert.equal(byTestId(tree, "ask-send"), null, "and no second button");
    typed(tree, "who wrote today?");
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-talk"), null, "with words, the mic gives way");
    assert.equal(byTestId(tree, "ask-send").props.disabled, false, "to Send, filled");
    typed(tree, "   ");
    tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-talk"), "spaces are no words: the mic again");
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
  }
  // Where it cannot: Send alone, faint until there are words; no mic that only says it cannot listen.
  ask([]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-talk"), null, "no mic where the browser cannot listen");
  assert.equal(byTestId(tree, "ask-talk-off"), null, "and none that only says so");
  assert.equal(byTestId(tree, "ask-send").props.disabled, true, "Send, faint");
  typed(tree, "who wrote today?");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, false);
  await closes();
});

test("a hold whose recogniser ends on its own asks the words heard, and the lift's click does not press the Stop the button has become", async () => {
  const recs = [];
  globalThis.window.SpeechRecognition = class {
    constructor() {
      recs.push(this);
    }
    start() {}
    stop() {
      this.onend();
    }
  };
  const hears = (rec, words) => {
    const r = [{ transcript: words }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
  };
  const tick = () => new Promise((r) => setImmediate(r));
  try {
    const calls = ask([]);
    let release;
    // A turn held open, so the button is Stop while the finger is still down.
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(1).id, title: input.text });
      await new Promise((r) => {
        release = r;
      });
      on({ t: "final", message: said("m-h", "Nobody yet.") });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    byTestId(tree, "ask-talk").props.onPointerDown({ ...pressOf(), pointerId: 3, currentTarget: {} });
    hears(recs[0], "who wrote today");
    // A pause ended it (Android Chrome, iOS Safari), the finger still down: the words are asked at once.
    recs[0].onend();
    await tick();
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["who wrote today"], "the words heard are asked");
    assert.ok(byTestId(tree, "ask-stop"), "and the held button is Stop now");
    // The lift: the browser's click lands on what the button has become.
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, OPEN);
    assert.ok(byTestId(tree, "ask-stop"), "REGRESSION: the lift's click stopped the turn just asked");
    // A press after the lift is a press.
    press(byTestId(tree, "ask-stop"));
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-stop"), null, "Stop stops it");
    release();
  } finally {
    await closes();
    delete globalThis.window.SpeechRecognition;
  }
});

test("the phone's three listen to a press held a beat; a shorter press, or one that drags, does nothing (S11, S7)", async () => {
  const said = [];
  const talk = { start: () => said.push("start"), stop: () => said.push("stop") };
  let press3 = null;
  const Probe = () => {
    press3 = globalThis.window.AskHooks.useHoldPress({ talk, onHold: () => said.push("buzz") });
    return null;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  render(Probe, {});
  const down = pressOf();
  press3.onPointerDown(down);
  assert.equal(down.prevented, true, "the press opens no keyboard and selects nothing");
  await wait(360);
  assert.deepEqual(said, ["buzz", "start"], "held: a buzz, then listening");
  press3.onPointerDown(pressOf());
  assert.deepEqual(said, ["buzz", "start"], "a second down while held starts nothing");
  press3.onPointerUp();
  assert.deepEqual(said, ["buzz", "start", "stop"], "let go: it asks");

  press3.onPointerDown(pressOf());
  press3.onPointerUp();
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "a tap started nothing");
  press3.onPointerDown(pressOf());
  press3.onPointerCancel();
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "nor a press the browser took back");
  // A pull down that starts on the three closes the takeover; it is never a hold.
  press3.onPointerDown({ ...pressOf(), clientX: 195, clientY: 200 });
  press3.onPointerMove({ clientX: 196, clientY: 204 });
  press3.onPointerMove({ clientX: 196, clientY: 240 });
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop"], "nor a press that drags");
  press3.onPointerUp();
  press3.onPointerDown({ ...pressOf(), clientX: 195, clientY: 200 });
  press3.onPointerMove({ clientX: 197, clientY: 205 });
  await wait(360);
  assert.deepEqual(said, ["buzz", "start", "stop", "buzz", "start"], "a finger that trembles still holds");
  press3.onPointerUp();
});

test("a quick answer nods, and a failed turn shakes: the palette says how a turn ended", async () => {
  const { MASCOT } = await import("../../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
  globalThis.window.__mascot = MASCOT;
  const said = [];
  const stop = MASCOT.mood.subscribe((ev) =>
    said.push(ev.t === "state" ? ev.state : ev.t === "react" ? ev.kind : ev.t),
  );
  const calls = ask([]);
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "error", text: "Network error — nothing was asked." });
  };
  try {
    render(Palette, CLOSED);
    // "who needs me?" is one the Line answers itself (contracts askIntent, ask-answer.ts): no turn, a nod. First,
    // because a conversation left open takes every later question to the model.
    sent("ask:seed", { prompt: "who needs me?" });
    await opens();
    assert.deepEqual(calls.sent, [], "the quick question sent nothing");
    assert.ok(said.includes("nod"), `a quick answer nods: ${said.join(",")}`);
    await closes();
    said.length = 0;
    sent("ask:seed", { prompt: "how did the weekend go?" });
    await opens();
    assert.deepEqual(calls.sent, ["how did the weekend go?"]);
    assert.ok(said.includes("shake"), `a failure shakes: ${said.join(",")}`);
    await closes();
  } finally {
    stop();
    MASCOT.mood.set("idle");
    delete globalThis.window.__mascot;
  }
});

/* ------------------------------ what the tab keeps ------------------------------ */

test("what was typed comes back on the next open; the open conversation's id is kept and opened again (spec S9)", async () => {
  const drafts = new Map();
  globalThis.window.__tabMemory = {
    draft: (k) => (drafts.has(k) ? drafts.get(k) : null),
    keepDraft: (k, v) => drafts.set(k, v),
    dropDraft: (k) => drafts.delete(k),
    place: () => null,
    keepPlace() {},
  };
  try {
    const calls = ask([TH(1), TH(2)]);
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(1).id, title: input.text });
      on({ t: "final", message: said("m-1", "Answer 1.") });
    };
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "how did the");
    tree = await later(Palette, OPEN);
    assert.equal(drafts.get("ask"), "how did the", "kept as typed");
    await closes();
    tree = await opens();
    assert.equal(inputOf(tree).props.value, "how did the", "back on the next open");
    keyed(tree, "Enter");
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, ["how did the"]);
    assert.equal(drafts.has("ask"), false, "gone once sent");
    assert.equal(drafts.get("ask-thread"), TH(1).id, "the conversation's id is kept");
    press(byTestId(tree, "ask-clear"));
    tree = await later(Palette, OPEN);
    assert.equal(drafts.has("ask-thread"), false, "and forgotten at Clear");
    // A reload: the Line is made again, closed, over a tab that kept a conversation's id and words half-typed in it.
    // Being made forgets neither; the first open reads the conversation and puts the words back in the field. (Closed
    // first, so the window's listeners go with the old Line, as they do with a page.)
    await closes();
    drafts.set("ask-thread", TH(1).id);
    drafts.set("ask", "and the week before");
    render(Palette, CLOSED);
    assert.equal(drafts.get("ask-thread"), TH(1).id, "a Line made closed forgets nothing");
    tree = await opens();
    assert.deepEqual(calls.opened, [TH(1).id], "opened again after a reload");
    assert.equal(inputOf(tree).props.value, "and the week before", "with the words typed in it");
    assert.equal(drafts.get("ask"), "and the week before", "which stay kept");
    await closes();
    // A reload whose first open is a request (a caller handing a conversation over with askAbout({ thread })): the
    // request wins, and the kept conversation is not read as well.
    drafts.set("ask-thread", TH(1).id);
    render(Palette, CLOSED);
    sent("ask:seed", { thread: TH(2).id });
    tree = await opens();
    assert.deepEqual(calls.opened, [TH(1).id, TH(2).id], "only the conversation asked for is read");
    assert.equal(drafts.get("ask-thread"), TH(2).id, "and it is the one kept");
    await closes();
  } finally {
    delete globalThis.window.__tabMemory;
  }
});

/* ------------------------------ N5 ------------------------------ */

test("REGRESSION (N5): a conversation is deleted only when asked twice, from its × or the Delete key -- a hover × deleted it at once and no key reached it", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  const xs = byClass(tree, "ask-row-del");
  assert.equal(xs.length, 2, "both conversations are listed");
  press(xs[0]);
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [], "REGRESSION: the × deleted the conversation at once");
  const asked = byTestId(tree, "ask-delete-confirm");
  assert.ok(asked, "it asks");
  assert.ok(
    textOf(asked).includes("Delete this conversation?") && textOf(asked).includes("Question 1"),
    `it asks, naming the conversation: ${textOf(asked)}`,
  );
  press(byTestId(tree, "ask-delete-no"));
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-delete-confirm"), null, "Keep it puts the question away");
  assert.deepEqual(calls.deleted, [], "and deletes nothing");

  // The keyboard: walk the rows to a conversation, then Delete.
  const selected = () =>
    find(
      lastTree,
      (n) =>
        String(n.props?.className || "").startsWith("ask-row ") && String(n.props.className).split(" ").includes("sel"),
    );
  for (let i = 0; i < 30 && !String(selected()?.props.className || "").includes("thread"); i++) {
    keyed(lastTree, "ArrowDown");
    settle(Palette, OPEN);
  }
  assert.ok(String(selected()?.props.className || "").includes("thread"), "the arrows reach a conversation");
  const title = textOf(selected());
  keyed(lastTree, "Delete");
  tree = await later(Palette, OPEN);
  assert.ok(
    textOf(byTestId(tree, "ask-delete-confirm")).includes("Delete this conversation?"),
    "REGRESSION: no key reached the ×",
  );
  assert.ok(
    title.includes(textOf(byTestId(tree, "ask-delete-confirm")).match(/Question \d/)[0]),
    "the question names the conversation the keyboard is on",
  );
  press(byTestId(tree, "ask-delete-yes"));
  tree = await later(Palette, OPEN);
  assert.equal(calls.deleted.length, 1, "Yes, delete deletes it");
  assert.equal(byClass(tree, "ask-row-del").length, 1, "and it leaves the list");
  await closes();
});

test("REGRESSION (N5): Earlier holds every conversation, opened with ⌘J from an open one, and its × asks first too", async () => {
  const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  press(byTestId(tree, "ask-row-thread"));
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 1.", "a conversation is open");
  cmdJ();
  tree = await later(Palette, OPEN);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length, 4, "every conversation");
  press(byClass(tree, "ask-row-del")[1]);
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [], "REGRESSION: the × deleted at once");
  assert.ok(textOf(byTestId(tree, "ask-delete-confirm")).includes("Question 2"));
  press(byTestId(tree, "ask-delete-yes"));
  await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [TH(2).id]);
  await closes();
});

test("Earlier finds a conversation by the words typed and Enter opens it; with none, it says there are none", async () => {
  ask([]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  let tree = await later(Palette, OPEN);
  assert.equal(textOf(byClass(tree, "ask-rows-empty")[0]), "No earlier conversations yet.");
  await closes();

  const calls = ask([TH(1), TH(2), TH(3)]);
  render(Palette, OPEN);
  await later(Palette, OPEN);
  cmdJ();
  tree = await later(Palette, OPEN);
  typed(tree, "question 3");
  tree = await later(Palette, OPEN);
  assert.deepEqual(
    byClass(tree, "ask-row-label").map(textOf),
    ["Question 3"],
    "only the conversation whose question has the words",
  );
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.opened, [TH(3).id], "Enter opens it; the words are not asked");
  assert.deepEqual(calls.sent, []);
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 3.");
  await closes();
});

/* ------------------------------ N18 ------------------------------ */

test("a row of every kind an answer names draws its kind's mark, from the one map the Line's scope reads too: a run is marked as the broadcast it is (PR 4.2)", () => {
  const { AskAnswer, askKindGlyph } = globalThis.window.AskAnswerKit;
  const marks = {
    thread: "chat",
    conversation: "chat",
    call: "phone",
    person: "users",
    page: "arrow-right",
    lead: "star",
    search: "search",
    deal: "deal",
    list: "filter",
    broadcast: "wave",
    playbook: "bolt",
    template: "content",
    domain: "globe",
  };
  assert.deepEqual(Object.keys(marks), [...ASK_CITATION_KINDS], "every kind a citation names");
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Everything, once.", detail: "" },
    show: {
      figures: [],
      items: ASK_CITATION_KINDS.map((kind, i) => ({
        title: kind,
        meta: "",
        line: "",
        source: { kind, id: `r${i}`, label: kind, to: `somewhere/${i}`, door: true },
      })),
      breakdown: null,
    },
    do: { open: null, next: [] },
    language: "en",
  };
  const tree = render(AskAnswer, { answer, cardOpen: {}, cards: [], t: {}, onNav() {}, onFollow() {} });
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "ask-item-mark").map(
      (m) => find(m, (n) => n.type === "Icon").props.name,
    ),
    Object.values(marks),
    "each row its kind's mark",
  );
  for (const k of ASK_SCOPE_KINDS)
    assert.equal(askKindGlyph(k), k === "run" ? marks.broadcast : marks[k], `a scope's ${k} is marked as its row`);
  assert.equal(askKindGlyph("something new"), "chat", "a kind the map does not know is a chat");
});

test("a person's note and a person's details (PR 4.6) are drawn as their own kinds: each its word in the Line's English and Spanish and its own mark, over its title and the summary that says who reads it or what changes", () => {
  const { AskCard } = globalThis.window.AskAnswerKit;
  const cards = [
    {
      id: "p1",
      kind: "note",
      needs: "operator",
      title: "Note on Rosa",
      summary: "“Prefers mornings.” · The receptionist reads it before it answers Rosa",
      payload: { contact_id: "c1", body: "Prefers mornings.", team_only: false, who: "Rosa" },
      undo: "Delete it",
    },
    {
      id: "p2",
      kind: "person_details",
      needs: "operator",
      title: "Details for Rosa",
      summary: "Name: Rosa → Rosa Díaz · Email: no address → rosa@example.com",
      payload: { contact_id: "c1", who: "Rosa", name: "Rosa Díaz", email: "rosa@example.com", previous: {} },
      undo: "Set it back",
    },
  ];
  const words = { en: ["note", "details"], es: ["nota", "datos"] };
  const marks = ["edit", "user"];
  for (const lang of ["en", "es"])
    cards.forEach((p, i) => {
      const tree = render(AskCard, { p, t: globalThis.window.askText(lang), onNav() {} });
      assert.equal(byTestId(tree, "ask-card").props["data-kind"], p.kind);
      const head = byClass(tree, "ask-card-head")[0];
      assert.equal(textOf(byClass(head, "ask-card-kind")[0]), words[lang][i], `${p.kind} in ${lang}: its word`);
      assert.equal(find(head, (n) => n.type === "Icon").props.name, marks[i], `${p.kind}: its mark, not the inbox's`);
      assert.ok(textOf(head).startsWith(p.title), `${p.kind}: its title`);
      assert.equal(textOf(byClass(tree, "ask-card-summary")[0]), p.summary, `${p.kind}: its summary`);
    });
});

test("a list and a playbook's run waiting for a person (PR 4.7) are drawn as their own kinds: each its word in the Line's English and Spanish and the mark its row carries in an answer, over its title and the summary that says its rule and who it holds, or who the run reaches and when it goes", () => {
  const { AskCard, askKindGlyph } = globalThis.window.AskAnswerKit;
  const RUN = "88888888-8888-4888-8888-888888888881";
  const cards = [
    {
      id: "p1",
      kind: "list",
      needs: "operator",
      title: "List: Lapsed regulars",
      summary:
        "Last visit more than 60 days ago — 4 people on it today, and it keeps itself current. Left out: regulars",
      payload: {
        name: "Lapsed regulars",
        rule: { v: 2, all: [{ field: "last_visit", op: "more_than", days: 60 }] },
        cannot: "regulars",
        count: 4,
      },
      undo: "Delete it",
    },
    {
      id: "p2",
      kind: "run",
      needs: "operator",
      title: "Approve the run: Win-back · 2026-09-20",
      summary: "3 people · goes the moment you approve it",
      payload: { broadcast_id: RUN, verb: "approve", name: "Win-back · 2026-09-20", people: 3, timezone: "UTC" },
      undo: "Cancel it, if it has not finished",
    },
  ];
  const words = { en: ["list", "run"], es: ["lista", "envío"] };
  // The mark a list's or a run's row carries in an answer (a run is the Broadcasts row a citation calls a broadcast).
  const marks = [askKindGlyph("list"), askKindGlyph("broadcast")];
  assert.deepEqual(marks, ["filter", "wave"]);
  for (const lang of ["en", "es"])
    cards.forEach((p, i) => {
      const tree = render(AskCard, { p, t: globalThis.window.askText(lang), onNav() {} });
      assert.equal(byTestId(tree, "ask-card").props["data-kind"], p.kind);
      const head = byClass(tree, "ask-card-head")[0];
      assert.equal(textOf(byClass(head, "ask-card-kind")[0]), words[lang][i], `${p.kind} in ${lang}: its word`);
      assert.equal(
        find(head, (n) => n.type === "Icon").props.name,
        marks[i],
        `${p.kind}: its row's mark, not the inbox's`,
      );
      assert.ok(textOf(head).startsWith(p.title), `${p.kind}: its title`);
      assert.equal(textOf(byClass(tree, "ask-card-summary")[0]), p.summary, `${p.kind}: its summary`);
    });
});

test("REGRESSION (N18): every page a real workspace ships is a jump away -- 'calendar' offered only to ask about it", async () => {
  ask();
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "calendar");
  tree = await later(Palette, OPEN);
  const jumps = all(tree, (n) => n.props?.["data-testid"] === "ask-row-jump").map(textOf);
  assert.ok(
    jumps.some((j) => j.startsWith("Calendar")),
    `REGRESSION: ${jumps.join(" | ") || "no jump"}`,
  );

  const read = emptyReadSet();
  const none = { kind: "none", id: "", label: "" };
  const opens = (to) => {
    const r = normalizeAnswer(
      {
        say: { headline: "It's there.", detail: "" },
        show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: none } },
        do: { open: { source: { kind: "page", id: to, label: to }, label: "", now: false }, next: [] },
        language: "en",
      },
      read,
      "en",
    );
    return r.ok && r.answer.do.open ? r.answer.do.open.to : null;
  };
  for (const [words, to] of [
    ["calendar", "calendar"],
    ["lists", "clients"],
    ["playbooks", "outbound"],
    ["broadcasts", "broadcasts"],
    ["messages", "messages"],
    ["setup", "start"],
    ["billing", "admin/billing"],
    ["activity", "admin/activity"],
    ["profile", "admin/profile"],
  ]) {
    assert.ok(
      askJump(words, ASK_PAGES).some((j) => j.to === to),
      `"${words}" jumps to ${to}`,
    );
    assert.ok(ASK_PAGE_ROUTES.includes(to), `${to} is a page an answer may name`);
    assert.equal(opens(to), to, `and an answer may open ${to}`);
  }
  assert.deepEqual(
    groundCitations([{ kind: "page", id: "calendar", label: "Calendar" }], read).kept.map((c) => c.id),
    ["calendar"],
    "a citation of the Calendar is kept",
  );
  await closes();
});

/* ------------------------------ the Leads surface ------------------------------ */

// A search's plan as the route returns it on a lead_search card: the finder's own shape (leads-finder.test.mjs CARD).
const LEAD_PLAN = LeadSearchPlanSchema.parse({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});
const LEAD_FACTS = {
  dupes: 14,
  leadsLeft: 486,
  bound: null,
  prior: { places: 1_200, matched: 700, with_email: 406 },
  priorOf: "trainers",
  cannotSee: null,
  renewsOn: "Oct 1",
  nearby: [],
};
const LEAD_CARD = {
  id: "p1",
  kind: "lead_search",
  needs: "owner",
  title: "Find 200 personal trainers",
  summary: planSentence(LEAD_PLAN),
  payload: { plan: LEAD_PLAN, view: { title: "Find 200 personal trainers" }, facts: LEAD_FACTS },
  undo: "Stop the search",
};
/** The derivations the plan card reads off the window (seed-globals.ts __LEAD_VM), so the card on the rail is the finder's own. */
const LEAD_VM = {
  planWords,
  planSaid,
  planWhere,
  planWho,
  planArea,
  planMinutes,
  planCeiling,
  planSentence,
  planVersionOf,
  LEAD_COUNT_CHOICES,
  leadEndingLine,
  leadPlanLikely,
  leadPlanFacts,
  leadPlanAsk,
  LEAD_QUESTION_WAIT_LINE,
};

test("on Leads the Line is the finder: describe the businesses, Find businesses with the day's chip and the consent line; the words go as typed on the leads surface; the card puts them back to change and opens the search once approved", async () => {
  const hash = globalThis.window.location.hash;
  const chanly = globalThis.window.CHANLY;
  const went = [];
  globalThis.window.location.hash = "#/clients/leads";
  globalThis.window.__LEADS = { suggestions: { items: [{ words: "100 nail salons in Queens, NY" }] }, searches: [] };
  globalThis.window.__LEAD_VM = LEAD_VM;
  globalThis.window.CHANLY = { ...chanly, nav: (to) => went.push(to) };
  try {
    ask([]);
    const askedWith = [];
    const committed = [];
    Object.assign(globalThis.window.__ask, {
      commit: async (p) => {
        committed.push(p.kind);
        return { ok: true, receipt: "Finding 200 personal trainers. Leads shows it.", undo: { search_id: "s1" } };
      },
      outcome: async () => true,
      undoOpen: () => false,
      // The reply editor is for replies: a search's "Change what I asked" never reaches it.
      editReply: () => assert.fail("REGRESSION: a lead search's Change what I asked opened the reply editor"),
      send: async (input, on) => {
        askedWith.push(input);
        on({ t: "thread", id: TH(9).id, title: input.text });
        on({ t: "final", message: { ...said("m-lead", "Here is the plan."), proposals: [LEAD_CARD] } });
      },
    });
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.equal(inputOf(tree).props.placeholder, "Describe the businesses you want", "the field asks for businesses");
    assert.deepEqual(
      byClass(tree, "ask-rows-label").map(textOf),
      ["Find businesses"],
      "the page's section is Find businesses, never Ask about Leads",
    );
    assert.equal(
      textOf(byTestId(tree, "ask-row-sug")),
      "100 nail salons in Queens, NY",
      "the first chip is the day's suggestion",
    );
    assert.equal(
      textOf(byTestId(tree, "ask-rows-note")),
      "You can email and call leads. Texts and offers wait for their yes.",
      "the consent rule stands under the chips",
    );
    typed(tree, "50 dentists in Austin, TX");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(askedWith.length, 1, "one turn");
    assert.equal(askedWith[0].text, "50 dentists in Austin, TX", "the words go as typed, with no prefix");
    assert.equal(askedWith[0].surface, "leads", "on the Leads surface");
    assert.equal(askedWith[0].scope, null, "and with no scope");
    assert.equal(byTestId(tree, "ask-card").props["data-kind"], "lead_search");
    assert.ok(byTestId(tree, "lead-plan"), "the card on the rail is the finder's plan card");
    // Change what I asked: the turn's question back in the field, and the field takes focus (spec F4). The field's own
    // focus after the answer landed (useAskFocus, 30ms) is let fire first, so only this one is counted.
    await new Promise((r) => setTimeout(r, 60));
    let focused = 0;
    inputOf(tree).props.ref.current = {
      focus: () => {
        focused++;
      },
    };
    press(byTestId(tree, "plan-back"));
    tree = await later(Palette, OPEN);
    assert.equal(inputOf(tree).props.value, "50 dentists in Austin, TX", "the words are back in the field");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(focused, 1, "and the field takes focus");
    // With the field emptied the answer is under the line again: Approve commits, the receipt stays on the card, and
    // the Line goes to the search the commit made.
    typed(tree, "");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "plan-approve"));
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, ["lead_search"], "committed through Ask's door");
    assert.ok(
      textOf(byClass(tree, "ask-card-receipt")[0]).includes("Leads shows it"),
      "the receipt stays in the thread",
    );
    assert.deepEqual(went, ["clients/leads:s-s1"], "the Line went to the new search");
    assert.equal(went[0], leadsRoute({ searchId: "s1", list: "all", cls: null }), "which is contracts' route for it");
  } finally {
    await closes();
    globalThis.window.location.hash = hash;
    globalThis.window.CHANLY = chanly;
    delete globalThis.window.__LEADS;
    delete globalThis.window.__LEAD_VM;
  }
});

test("on Leads a card that answers a search commits through Ask's door with no undo, and the Line goes to the search's question", async () => {
  const hash = globalThis.window.location.hash;
  const chanly = globalThis.window.CHANLY;
  const went = [];
  globalThis.window.location.hash = "#/clients/leads";
  globalThis.window.__LEADS = { suggestions: { items: [] }, searches: [] };
  globalThis.window.__LEAD_VM = LEAD_VM;
  globalThis.window.CHANLY = { ...chanly, nav: (to) => went.push(to) };
  const answering = {
    ...LEAD_CARD,
    id: "p2",
    summary: `Answers “Most of the first 25 are chain gyms. Include them?”: ${planSentence(LEAD_PLAN)}`,
    payload: {
      ...LEAD_CARD.payload,
      plan: { ...LEAD_PLAN, version: 2 },
      amends: {
        search_id: "s1",
        name: "personal trainers",
        question: "Most of the first 25 are chain gyms. Include them?",
      },
    },
    undo: null,
  };
  try {
    ask([]);
    const committed = [];
    Object.assign(globalThis.window.__ask, {
      commit: async (p) => {
        committed.push(p.payload.amends);
        return {
          ok: true,
          receipt: "Answered. personal trainers carries on with your answer; Leads shows it.",
          undo: null,
        };
      },
      outcome: async () => true,
      undoOpen: () => false,
      send: async (input, on) => {
        on({ t: "thread", id: TH(9).id, title: input.text });
        on({ t: "final", message: { ...said("m-lead", "Here is the plan."), proposals: [answering] } });
      },
    });
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "include them");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.equal(byTestId(tree, "ask-card").props["data-kind"], "lead_search");
    typed(tree, "");
    tree = await later(Palette, OPEN);
    press(byTestId(tree, "plan-approve"));
    tree = await later(Palette, OPEN);
    assert.deepEqual(committed, [answering.payload.amends], "the card commits as it came, its amends intact");
    assert.ok(textOf(byClass(tree, "ask-card-receipt")[0]).includes("Answered."), "the receipt stays in the thread");
    assert.deepEqual(
      went,
      [leadQuestionRoute("s1")],
      "the Line went to the search that asked, on the pile it asked about",
    );
  } finally {
    await closes();
    globalThis.window.location.hash = hash;
    globalThis.window.CHANLY = chanly;
    delete globalThis.window.__LEADS;
    delete globalThis.window.__LEAD_VM;
  }
});

test("on Today the Line is as it was: Ask anything, questions about the page, and no consent line", async () => {
  ask([]);
  render(Palette, OPEN);
  const tree = await later(Palette, OPEN);
  assert.equal(inputOf(tree).props.placeholder, "Ask anything");
  assert.ok(textOf(tree).includes("Ask about Today"));
  assert.equal(byTestId(tree, "ask-rows-note"), null, "the consent rule is Leads' alone");
  await closes();
});

/* ------------------------------ the takeover composes ------------------------------ */

test("on a phone the field in use composes: the rows go, their fold kept closed, the three keep their size with the standing pills under them and listen, a key heard lifts them, and letting go opens the fold again", async () => {
  const ph = phoneWindow();
  const moods = [];
  let heard = 0;
  const had = globalThis.window.__mascot;
  globalThis.window.__mascot = {
    mood: {
      state: "idle",
      set: (s) => moods.push(s),
      hear: () => heard++,
      react() {},
      beat() {},
      pulse() {},
      subscribe: () => () => {},
    },
    mount: () => null,
    follow: () => () => {},
  };
  const props = { open: true, onClose() {} };
  const pills = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ask-pill").map(textOf);
  const fold = (tree) => byTestId(tree, "ask-rows-fold").props.className;
  try {
    globalThis.window.TODAY_DATA = askQueue();
    ask([]);
    render(Palette, props);
    let tree = await later(Palette, props);
    assert.ok(
      find(tree, (n) => n.props?.id === "ask-rows"),
      "the home stands",
    );
    assert.equal(fold(tree), "ask-rows-fold");
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero");
    // On a phone the standing pills are the hero's, under the three, and Right now's row keeps its sentence and Brief me.
    assert.deepEqual(pills(byTestId(tree, "ask-hero")), ["1 needs you", "1 search waiting"]);
    assert.deepEqual(pills(byTestId(tree, "ask-row-now")), []);
    assert.equal(textOf(byTestId(tree, "ask-row-brief")), "Brief me");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero", "the three keep their size");
    assert.ok(byClass(tree, "composing").length, "the middle composes, still centred");
    assert.equal(
      find(tree, (n) => n.props?.id === "ask-rows"),
      null,
      "the rows are gone at once",
    );
    assert.equal(fold(tree), "ask-rows-fold gone", "their fold kept, closed");
    assert.deepEqual(pills(byTestId(tree, "ask-hero")), ["1 needs you", "1 search waiting"], "the pills stay");
    assert.equal(moods.at(-1), "listening", "and the three listen");
    assert.equal(inputOf(tree).props["aria-expanded"], false);
    typed(tree, "in");
    tree = await later(Palette, props);
    assert.ok(heard >= 1, "a key heard lifts the three");
    assert.equal(
      find(tree, (n) => n.props?.id === "ask-rows"),
      null,
      "the words' own rows wait for the keyboard to go",
    );
    assert.equal(fold(tree), "ask-rows-fold gone");
    assert.equal(inputOf(tree).props["aria-controls"], undefined);
    assert.deepEqual(
      pills(byTestId(tree, "ask-hero")),
      ["1 needs you", "1 search waiting"],
      "the pills stay while typing",
    );
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-hero").props.className, "ask-hero", "let go, the three stand as they were");
    assert.ok(
      find(tree, (n) => n.props?.id === "ask-rows"),
      "and the rows are back, the words' own now",
    );
    assert.equal(fold(tree), "ask-rows-fold", "their fold open");
    assert.deepEqual(pills(tree), [], "the words' rows are the focus with the keyboard down");
    assert.equal(moods.at(-1), "idle");
    typed(tree, "");
    tree = await later(Palette, props);
    assert.deepEqual(
      pills(byTestId(tree, "ask-hero")),
      ["1 needs you", "1 search waiting"],
      "the line emptied, the home and its pills",
    );
    await closes();
  } finally {
    delete globalThis.window.TODAY_DATA;
    ph.restore();
    if (had === undefined) delete globalThis.window.__mascot;
    else globalThis.window.__mascot = had;
  }
});

/* ------------------------------ the phone's ✦: the disc and its dot ------------------------------ */

test("the disc's dot is the usage's standing alone: nothing with no usage surface or under 80%, amber from 80%, red at 100%", () => {
  const Disc = (props) => globalThis.window.AskDisc(props);
  const drawn = () => byTestId(render(Disc, { testId: "b" }), "b");
  try {
    delete globalThis.window.__USAGE;
    const disc = drawn();
    assert.equal(disc.props.className, "ask-disc");
    assert.equal(disc.props["data-usage"], "ok", "no usage surface yet: no dot");
    assert.equal(disc.props["data-needs"], undefined, "what needs you is the three's colour, not the disc's dot");
    globalThis.window.__USAGE = { standing: "ok", share: 27 };
    assert.equal(drawn().props["data-usage"], "ok", "under 80%: no dot");
    globalThis.window.__USAGE = { standing: "warned", share: 89 };
    assert.equal(drawn().props["data-usage"], "warned");
    globalThis.window.__USAGE = { standing: "over", share: 100 };
    assert.equal(drawn().props["data-usage"], "over");
  } finally {
    delete globalThis.window.__USAGE;
  }
});

/* ------------------------------ the name a page went by ------------------------------ */

test("a page is found by the name it goes by AND by the one it used to: 'templates' and 'messages' both land there", () => {
  const byLabel = askJump("templates", ASK_PAGES);
  assert.equal(byLabel[0]?.to, "messages", "the label first");
  assert.equal(byLabel[0]?.label, "Templates");
  const byOldName = askJump("messages", ASK_PAGES);
  assert.ok(
    byOldName.some((j) => j.to === "messages"),
    "REGRESSION: renaming the tab lost everyone who still types the old word",
  );
  // The label always wins: a word listed under `also` never outranks a page's own name.
  assert.equal(askJump("lists", ASK_PAGES)[0]?.label, "Lists");
  assert.ok(
    askJump("segments", ASK_PAGES).some((j) => j.to === "clients"),
    "the lists answer to the word they were filed under too",
  );
  // And an alias is not a wildcard: a word nothing answers to still finds nothing.
  assert.deepEqual(askJump("zzq", ASK_PAGES), []);
});

test("the scope per turn (the Phase 5 plan, D9): a question goes with the scope the chip shows, else its conversation's own, which then holds it; the chip's × sends none next; a new conversation takes the chip's or none; and no send moves the chip, a resumed twin's included", async () => {
  const hash = globalThis.window.location.hash;
  const ROW1 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b1";
  const ROW2 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000b2";
  const row = (id) => ({ kind: "thread", id, label: "this thread" });
  // An older conversation whose first question is asked again (the twin), kept with a scope of its own.
  const TWIN = { ...TH(1), title: "Where did we leave it?", scope: { kind: "thread", id: ROW1, label: "Rosa" } };
  const calls = ask([TWIN]);
  globalThis.window.__ask.send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.inputs.length}`, `Answer ${calls.inputs.length}.`) });
  };
  /** The Line closed and opened again over a page, as a person does: the chip is that page's scope. */
  const over = async (route) => {
    await closes();
    globalThis.window.location.hash = route;
    return opens();
  };
  const asked = async (tree, words) => {
    typed(tree, words);
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    return later(Palette, OPEN);
  };
  const chip = (tree) => (byTestId(tree, "ask-scope") ? textOf(byTestId(tree, "ask-scope")) : null);
  const sent = () => calls.inputs.at(-1).scope;
  try {
    render(Palette, CLOSED);
    let tree = await asked(await over(`#/inbox/th-${ROW1}`), "What did they ask for?");
    assert.deepEqual(sent(), row(ROW1), "(d) a new conversation takes the chip's scope");
    tree = await asked(await over(`#/inbox/th-${ROW2}`), "And this one?");
    assert.deepEqual(
      sent(),
      row(ROW2),
      "(b) REGRESSION: a follow-up asked over another row went with the conversation's first scope",
    );
    tree = await asked(await over("#/today"), "And both of them?");
    assert.deepEqual(sent(), row(ROW2), "(c) no chip: the conversation's own, which its last turn gave it");
    assert.equal(chip(tree), null, "and the send moved no chip: Today has none");
    tree = await over(`#/inbox/th-${ROW1}`);
    assert.equal(chip(tree), "this thread", "the chip is the row's again");
    press(find(byTestId(tree, "ask-scope"), (n) => n.type === "button"));
    tree = await later(Palette, OPEN);
    assert.equal(chip(tree), null, "the × empties the chip");
    tree = await asked(tree, "Anything else?");
    assert.equal(sent(), null, "(a) a cleared chip sends none, said as null, so the server clears the thread's");
    tree = await asked(await over("#/today"), "And now?");
    assert.equal(sent(), null, "(c) and the conversation holds none after it");
    press(byTestId(tree, "ask-clear"));
    tree = await asked(await later(Palette, OPEN), "What is new?");
    assert.equal(sent(), null, "(d) a new conversation with no chip: none");
    // The twin resumed over another row: asked with the chip it was typed under, and the chip stays that one.
    press(byTestId(tree, "ask-clear"));
    tree = await asked(await over(`#/inbox/th-${ROW2}`), TWIN.title);
    assert.deepEqual([calls.opened.at(-1), sent()], [TWIN.id, row(ROW2)], "the twin resumed, with the chip's scope");
    assert.equal(chip(tree), "this thread", "REGRESSION: the twin's stored scope took the chip the question went with");
    tree = await asked(tree, "And after that?");
    assert.deepEqual(sent(), row(ROW2), "so the next question goes with it too");
    assert.deepEqual(
      calls.inputs.map((i) => i.text),
      [
        "What did they ask for?",
        "And this one?",
        "And both of them?",
        "Anything else?",
        "And now?",
        "What is new?",
        TWIN.title,
        "And after that?",
      ],
    );
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});

test("a question the shell seeds as it opens the Line goes with the chip that opening shows, never the one the last opening showed: over a page with no row, its conversation's own; over a row, that row", async () => {
  const hash = globalThis.window.location.hash;
  const calls = ask([]);
  globalThis.window.__ask.send = async (input, on) => {
    calls.inputs.push(input);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({ t: "final", message: said(`m-${calls.inputs.length}`, `Answer ${calls.inputs.length}.`) });
  };
  const ROW1 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000c1";
  const ROW2 = "aaaaaaaa-aaaa-4aaa-8aaa-0000000000c2";
  const row = (id) => ({ kind: "thread", id, label: "this thread" });
  const over = async (route) => {
    await closes();
    globalThis.window.location.hash = route;
    return opens();
  };
  /** The shell opening the Line over a page and seeding a question in the same moment (askAbout({ prompt })). */
  const seeded = async (route, prompt) => {
    await closes();
    globalThis.window.location.hash = route;
    sent("ask:seed", { prompt });
    return opens();
  };
  const chip = (tree) => (byTestId(tree, "ask-scope") ? textOf(byTestId(tree, "ask-scope")) : null);
  const last = () => calls.inputs.at(-1);
  try {
    render(Palette, CLOSED);
    let tree = await over(`#/inbox/th-${ROW1}`);
    typed(tree, "What did they ask for?");
    tree = await later(Palette, OPEN);
    keyed(tree, "Enter");
    await later(Palette, OPEN);
    assert.deepEqual(last().scope, row(ROW1), "the conversation begins on the first row");
    // Opened over the second row and closed unasked: that opening's chip was the second row's; the conversation's is
    // still the first's. Then Today's "Ask why" (no row) opens the Line with its question.
    await over(`#/inbox/th-${ROW2}`);
    tree = await seeded("#/today", "Why did that one leak?");
    assert.deepEqual(
      [last().text, last().scope],
      ["Why did that one leak?", row(ROW1)],
      "REGRESSION: a question seeded over Today went with the chip the last opening showed, the second row's",
    );
    assert.equal(chip(tree), null, "Today opens with no chip");
    // Opened over the first row and closed unasked; then a question seeded over the second row's own page.
    await over(`#/inbox/th-${ROW1}`);
    tree = await seeded(`#/inbox/th-${ROW2}`, "And this one?");
    assert.deepEqual(
      [last().text, last().scope],
      ["And this one?", row(ROW2)],
      "a question seeded over a row goes with that row, never the chip before it",
    );
    assert.equal(chip(tree), "this thread", "the chip the question went with");
    await closes();
  } finally {
    globalThis.window.location.hash = hash;
  }
});
