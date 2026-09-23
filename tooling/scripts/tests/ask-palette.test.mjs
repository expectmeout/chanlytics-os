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
  ROLE_PERMS,
  roleGate,
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  answerText,
  askJump,
  cardOpenRoute,
  groundCitations,
  normalizeAnswer,
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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.Confirm = globalThis.window.Confirm;
/** What the palette flashed, in order. */
const flashed = [];
Object.assign(globalThis.window, { usePPToast: () => [null, (m) => flashed.push(m)], CHANLY: { nav() {}, R: {} } });
await import("../../../apps/dashboard/src/legacy/pages/ask-text.jsx");
await import("../../../apps/dashboard/src/legacy/pages/ask-hooks.jsx");
await import("../../../apps/dashboard/src/legacy/pages/ask-home.jsx");
await import("../../../apps/dashboard/src/legacy/pages/ask-turn.jsx");
await import("../../../apps/dashboard/src/legacy/pages/ask-real.jsx");
// Ask's face in the line (components/ask-face.jsx): drawn in every case; it moves only where a case installs the bridge.
await import("../../../apps/dashboard/src/legacy/components/ask-face.jsx");
const { askPalette, quickAnswer, surfaceFor } =
  await import("../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
const { askSpeech } = await import("../../../apps/dashboard/src/legacy-bridge/ask/speech.ts");

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
  const calls = { deleted: [], sent: [], opened: [] };
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

test("a seed that names a thread opens that thread, its last answer under the line", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, CLOSED);
  // Today's band hands its conversation over as the Line opens (today-face.jsx, Continue in Ask).
  sent("ask:seed", { thread: TH(2).id });
  const tree = await opens();
  assert.deepEqual(calls.opened, [TH(2).id], "the thread was read");
  assert.equal(textOf(byTestId(tree, "ask-say")), "The answer to Question 2.", "and its conversation is open");
  assert.deepEqual(calls.sent, [], "nothing was asked");
  await closes();
});

/* ------------------------------ the Line ------------------------------ */

test("the Line at rest: Right now is Today's queue, then questions about the page, then earlier conversations -- and no key is drawn", async () => {
  globalThis.window.TODAY_DATA = {
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
      ],
    },
  };
  try {
    const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    assert.equal(textOf(byTestId(tree, "ask-row-now")), "Nora is waiting on you.");
    assert.ok(
      textOf(tree).includes("Ask about Today") && byTestId(tree, "ask-row-sug"),
      "questions about the page, under its name",
    );
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length,
      3,
      "three earlier conversations, and a row for the rest",
    );
    assert.ok(byTestId(tree, "ask-row-all"));
    assert.ok(!/[↵⌘↑↓]|\bEsc\b|\bdel\b/.test(textOf(tree)), `no key is drawn (D17): ${textOf(tree)}`);
    // ↵ on the empty line runs the row it stands on: Right now's own question, answered without a model.
    keyed(tree, "Enter");
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.sent, [], "a quick answer asks no model");
    assert.equal(textOf(byTestId(tree, "ask-say")), "Nora is waiting on you.");
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "ask-item").map((n) => textOf(n)),
      ["NoraWhatsApp · waited 2h“Can I come at 3?”"],
      "the person is her own door; there is no second one to the Inbox",
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
  assert.ok(textOf(byTestId(tree, "ask-trace")).includes("Reading the inbox…"), "reading, in the tools' words");
  assert.ok(byTestId(tree, "ask-stop"), "the line offers Stop while Ask reads");
  keyed(tree, "Escape");
  tree = await later(Palette, props);
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
  assert.ok(textOf(byTestId(tree, "ask-trace")).includes("Reading the calendar…"), "the read is shown again");
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
  const { MASCOT } = await import("../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
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
      said.filter((s) => s !== "beat"),
      ["thinking", "speaking", "idle"],
      "reading until the first words, answering while they stream, then at rest (the row nods on its own)",
    );
    assert.equal(said.filter((s) => s === "beat").length, 2, "a beat for each piece of the answer");
    await closes();
  } finally {
    stop();
    MASCOT.mood.set("idle");
    delete globalThis.window.__mascot;
  }
});

test("a quick answer nods, and a failed turn shakes: the palette says how a turn ended", async () => {
  const { MASCOT } = await import("../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
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
  let tree = await later(Palette, OPEN);
  cmdJ();
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byClass(tree, "ask-rows-empty")[0]), "No earlier conversations yet.");
  await closes();

  const calls = ask([TH(1), TH(2), TH(3)]);
  render(Palette, OPEN);
  tree = await later(Palette, OPEN);
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

  const read = { person: new Set(), thread: new Set(), conversation: new Set(), call: new Set() };
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
    ["setup", "admin/setup"],
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
