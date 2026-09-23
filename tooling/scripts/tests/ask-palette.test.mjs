/**
 * Ask's palette takes what the shell sends as it opens, deletes a conversation only when asked twice, and puts every
 * shipped page a jump away.
 *
 * - The sidebar's New chat reopened the last conversation, and a seeded question opened an empty palette: the shell
 *   opens the palette and sends in the same moment, and the palette listened only once it was open (the wiring
 *   audit's N3).
 * - A conversation was deleted by a hover × with no question and no Undo, and no key reached the × (N5).
 * - ⌘K "calendar" offered only to ask about it: the jump list stopped at the pages that were real before the
 *   Calendar, Lists, Campaigns, Setup, Billing and Activity shipped (N18).
 * Run against ask-real.jsx and its parts on a stub React whose effects run after their component returns, as React's
 * do, over the bridge's real palette and speech and a recorded stand-in for the Ask routes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_PERMS,
  roleGate,
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  askJump,
  groundCitations,
  safeNavigate,
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
/** Whether the screen is wide enough for the rail beside a conversation: the media query a case sets. */
const screen = { wide: false };
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
  matchMedia: () => ({ matches: screen.wide, addEventListener() {}, removeEventListener() {} }),
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
await import("../../../apps/dashboard/src/legacy/pages/ask-real.jsx");
const { askPalette, surfaceFor } = await import("../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
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

/** A conversation as the Ask routes list it (contracts' AskThreadVM). */
const TH = (n) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`,
  title: `Question ${n}`,
  lastAtMs: Date.now() - n * 3_600_000,
  scope: null,
});
/**
 * Ask as the bridge installs it: the real palette and speech over this window, and a recorded stand-in for the routes
 * that go out (the threads, one thread, a deletion, a turn).
 */
const ask = (threads = []) => {
  const calls = { deleted: [], sent: [], opened: [] };
  let list = [...threads];
  globalThis.window.__ask = {
    surfaceFor,
    ...askPalette(globalThis.window, globalThis.localStorage),
    ...askSpeech(globalThis.window),
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
    openings: async () => ({ state: "no_calendar" }),
  };
  return calls;
};

/* ------------------------------ N3 ------------------------------ */

test("REGRESSION (N3): what the shell sends as the palette opens is taken -- a seeded question and New chat both fired before the palette listened", async () => {
  const calls = ask([TH(1)]);
  render(Palette, CLOSED);
  // The shell keeps the palette mounted and closed, then opens it and sends in the same moment.
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
  assert.deepEqual(calls.sent, ["Summarise last week for me"], "a question to ask is asked as the palette opens");
  assert.equal(byClass(tree, "ask-msgs").length, 1, "and its conversation is open");

  await closes();
  tree = await opens();
  assert.equal(byClass(tree, "ask-msgs").length, 1, "⌘K alone brings the conversation back");

  await closes();
  sent("ask:new");
  tree = await opens();
  assert.equal(byClass(tree, "ask-msgs").length, 0, "REGRESSION: New chat reopened the last conversation");
  assert.equal(inputOf(tree).props.value, "", "and starts with nothing typed");
  await closes();
});

test("a seed that names a thread opens that thread, the way a prompt is asked and New chat is taken", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, CLOSED);
  // Today's band hands its conversation over as the palette opens (today-face.jsx, Continue in Ask).
  sent("ask:seed", { thread: TH(2).id });
  const tree = await opens();
  assert.deepEqual(calls.opened, [TH(2).id], "the thread was read");
  assert.equal(byClass(tree, "ask-msgs").length, 1, "and its conversation is open");
  assert.deepEqual(calls.sent, [], "nothing was asked");
  await closes();
});

/* ------------------------------ N5 ------------------------------ */

test("REGRESSION (N5): a conversation is deleted only when asked twice, from its × or the Delete key -- a hover × deleted it at once and no key reached it", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  const xs = byClass(tree, "cmd-row-del");
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
        String(n.props?.className || "").startsWith("cmd-row ") && String(n.props.className).split(" ").includes("sel"),
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
  assert.equal(byClass(tree, "cmd-row-del").length, 1, "and it leaves the list");
  await closes();
});

test("REGRESSION (N5): the rail's × beside an open conversation asks first too", async () => {
  screen.wide = true;
  try {
    const calls = ask([TH(1), TH(2)]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    press(byTestId(tree, "ask-row-thread"));
    tree = await later(Palette, OPEN);
    const rail = byTestId(tree, "ask-rail");
    assert.ok(rail, "the rail is beside the conversation");
    press(byClass(rail, "ask-thread-x")[1]);
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.deleted, [], "REGRESSION: the rail's × deleted at once");
    assert.ok(textOf(byTestId(tree, "ask-delete-confirm")).includes("Question 2"));
    press(byTestId(tree, "ask-delete-yes"));
    await later(Palette, OPEN);
    assert.deepEqual(calls.deleted, [TH(2).id]);
    await closes();
  } finally {
    screen.wide = false;
  }
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
    assert.equal(safeNavigate(to, read), true, `and an answer may open ${to}`);
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
