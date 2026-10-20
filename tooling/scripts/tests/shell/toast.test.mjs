/**
 * The toast: one tone vocabulary for everything the shell flashes.
 *
 * Every toast used to wear a green check, the failures included, and every
 * Undo died at six seconds against a fifteen-second cancel window. The shape
 * -- tone, icon, role, lifetime -- is decided in contracts and run here; then
 * the real hook is mounted over a fake React, the way the pages are, and
 * what it draws and what it arms is read back: the class and the role a
 * failure carries, the Undo that lives as long as its window, the hold under
 * the pointer, the cap of three, and the two icons the tones need.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toastShape, TOAST_MS, TOAST_UNDO_MS, TOAST_MAX_MS, TOAST_MIN_MS, TOAST_ICONS } from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";
import { kitHooks } from "../_legacy-react.mjs";

/* ---------------------------- the shape ------------------------------- */

test("the shape: a tone decides the icon, the role and the lifetime; a failure interrupts, everything else waits", () => {
  assert.deepEqual(
    toastShape({}),
    { tone: "ok", icon: "check", role: "status", ms: 3000, stays: false },
    "what every toast was before the tone existed, read in three seconds",
  );
  assert.deepEqual(
    toastShape({ tone: "danger" }),
    { tone: "danger", icon: "error", role: "alert", ms: 4000, stays: false },
    "a failure is read longer, and read out at once",
  );
  assert.deepEqual(toastShape({ tone: "warn" }), {
    tone: "warn",
    icon: "alert",
    role: "status",
    ms: 4000,
    stays: false,
  });
  assert.deepEqual(toastShape({ tone: "info" }), {
    tone: "info",
    icon: "info",
    role: "status",
    ms: 3000,
    stays: false,
  });
  assert.equal(
    toastShape({ tone: "purple" }).tone,
    "ok",
    "a tone nobody defined is not a failure dressed as one, nor a crash",
  );
  assert.equal(toastShape({ tone: "danger", icon: "phone" }).icon, "phone", "a caller may still name the glyph");
  for (const tone of Object.keys(TOAST_MS)) assert.ok(TOAST_ICONS[tone], `${tone} has an icon`);
});

test("something to press stays long enough to reach it, nothing stays past four seconds, and nothing under two", () => {
  assert.equal(
    TOAST_UNDO_MS,
    4000,
    "four seconds: an Undo but a send's is a call the other way, open as long as the page",
  );
  assert.equal(TOAST_MAX_MS, 4000, "Ruben, 18 Oct 2026: three seconds, and four at most");
  for (const tone of Object.keys(TOAST_MS)) assert.ok(TOAST_MS[tone] <= TOAST_MAX_MS, `${tone} is under the ceiling`);
  assert.equal(
    toastShape({ undo: () => {} }).ms,
    TOAST_UNDO_MS,
    "REGRESSION: every Undo stood fifteen seconds over a phone's page",
  );
  assert.equal(toastShape({ action: { label: "Retry" } }).ms, TOAST_UNDO_MS, "an act is reached for as an Undo is");
  assert.equal(toastShape({ links: [{ label: "Open it", to: "inbox" }] }).ms, TOAST_UNDO_MS, "and so is a link");
  assert.equal(toastShape({ links: [] }).ms, TOAST_MS.ok, "no link is nothing to reach");
  assert.equal(
    toastShape({ undo: () => {}, ms: 14_200 }).ms,
    TOAST_MAX_MS,
    "a send's own window is offered for four seconds, as every toast",
  );
  assert.equal(toastShape({ undo: () => {}, ms: 3_100 }).ms, 3_100, "a window shorter than the ceiling is its own");
  assert.equal(toastShape({ undo: () => {}, ms: 400 }).ms, TOAST_MIN_MS, "a window that is nearly over is still read");
  assert.equal(toastShape({ ms: -5 }).ms, TOAST_MS.ok, "a nonsense lifetime falls back to the tone's");
  assert.equal(
    toastShape({ tone: "danger", undo: () => {} }).ms,
    Math.max(TOAST_UNDO_MS, TOAST_MS.danger),
    "a failure with an Undo keeps the longer of the two",
  );
});

test("only a send's Undo stays through a tap besides: `stays` with an Undo, never on a toast with nothing to keep", () => {
  assert.equal(toastShape({ undo: () => {}, ms: 14_200, stays: true }).stays, true, "the reply's cancel window");
  assert.equal(toastShape({ stays: true }).stays, false, "a toast that stays with nothing to press is in the way");
  assert.equal(toastShape({ undo: () => {}, stays: "yes" }).stays, false, "only a yes said as one");
  assert.equal(toastShape({ undo: () => {} }).stays, false, "an Undo goes with a tap besides unless it is a send's");
});

/* ------------------------- the hook, mounted --------------------------- */

const timers = [];
let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const fresh = () => {
  cells = [];
  timers.length = 0;
};
globalThis.Icon = "Icon";
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
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = fn();
    return cells[k];
  },
  useEffect: (fn) => {
    const k = frames.key();
    if (!(k in cells)) {
      cells[k] = true;
      fn();
    }
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
// The document's listeners, by type: the toast's press besides is heard here.
const heard = {};
// Every listener of each type, in the order they were added: the tip's are the last the file adds as it loads.
const allHeard = {};
// The tip's one node: what it says, and whether it shows.
const tipNode = {
  shown: new Set(),
  classList: {
    add: (c) => tipNode.shown.add(c),
    remove: (c) => tipNode.shown.delete(c),
    contains: (c) => tipNode.shown.has(c),
  },
  setAttribute() {},
  style: {},
  offsetWidth: 120,
  offsetHeight: 24,
  textContent: "",
};
globalThis.document = {
  body: { appendChild() {} },
  addEventListener(type, fn) {
    (allHeard[type] ??= []).push(fn);
    heard[type] = fn;
  },
  removeEventListener(type, fn) {
    if (heard[type] === fn) delete heard[type];
  },
  createElement: () => tipNode,
};
globalThis.innerWidth = 375;
globalThis.innerHeight = 812;
globalThis.window = {
  __chrome: { toast: toastShape },
  CHANLY: { nav() {} },
  addEventListener() {},
  removeEventListener() {},
  setTimeout: (fn, ms) => {
    timers.push({ fn, ms, cleared: false });
    return timers.length;
  },
  clearTimeout: (h) => {
    if (timers[h - 1]) timers[h - 1].cleared = true;
  },
};
// The toast is TSX (surfaces/frame/flash.tsx), and takes its hooks from "react": this file's stub, set there.
kitHooks();
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The file ends with its tip: the last listener of each type it added as it loaded is the tip's.
const tipHeard = Object.fromEntries(Object.entries(allHeard).map(([type, fns]) => [type, fns[fns.length - 1]]));
const usePPToast = globalThis.window.usePPToast;

/** A component that owns one toast stack; mounting it again reads the cells back. */
let flash = null;
const Host = () => {
  const [node, f] = usePPToast();
  flash = f;
  return node;
};
const mount = () => {
  frames.begin();
  return Host();
};
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const toastsOf = (tree) => {
  const out = [];
  walk(tree, (n) => {
    if (n.props?.["data-tone"]) out.push(n);
  });
  return out;
};
const buttonsOf = (toast) => {
  const out = [];
  walk(toast, (n) => {
    if (n.type === "button") out.push(n);
  });
  return out;
};
const iconOf = (toast) => {
  let hit = null;
  walk(toast, (n) => {
    if (!hit && n.type === "Icon" && n.props.size === 13) hit = n.props.name;
  });
  return hit;
};
const live = () => timers.filter((t) => !t.cleared);

test("a failure is drawn as one: the tone's class, the error glyph, an alert role, and a four-second clock", () => {
  fresh();
  mount();
  flash({ tone: "danger", msg: "Not saved — permission denied" });
  const [toast] = toastsOf(mount());
  assert.ok(toast, "one toast");
  assert.equal(toast.props.className, "pp-toast pp-toast-danger");
  assert.equal(toast.props.role, "alert", "a failure is read out at once");
  assert.equal(iconOf(toast), "error", "REGRESSION: every failure used to wear a green check");
  assert.deepEqual(
    live().map((t) => t.ms),
    [4000],
  );
});

test("a plain confirmation: a check, a status role, three seconds", () => {
  fresh();
  mount();
  flash({ msg: "Saved" });
  const [toast] = toastsOf(mount());
  assert.equal(toast.props.className, "pp-toast pp-toast-ok");
  assert.equal(toast.props.role, "status");
  assert.equal(iconOf(toast), "check");
  assert.deepEqual(
    live().map((t) => t.ms),
    [3000],
    "REGRESSION: six seconds stood over a phone's page long after it was read",
  );
});

test("an Undo with a longer window is offered for four seconds, and pressing it runs the undo and closes the toast", () => {
  fresh();
  mount();
  let undone = 0;
  flash({
    msg: "Rosa — reply on its way",
    undo: () => {
      undone += 1;
    },
    ms: 14_800,
  });
  let [toast] = toastsOf(mount());
  assert.deepEqual(
    live().map((t) => t.ms),
    [4000],
    "REGRESSION: a send's toast stood fifteen seconds over a phone's page",
  );
  const undo = buttonsOf(toast).find((b) => b.props.children.join("") === "Undo");
  assert.ok(undo, "the Undo is offered");
  undo.props.onClick();
  assert.equal(undone, 1);
  assert.equal(toastsOf(mount()).length, 0, "closed once undone");
  assert.equal(live().length, 0, "and its clock is stopped");
});

test("an action is offered beside the words, and a mouse resting on it holds the clock until it leaves", () => {
  fresh();
  mount();
  let retried = 0;
  flash({
    tone: "danger",
    msg: "Could not read those days",
    action: {
      label: "Retry",
      onClick: () => {
        retried += 1;
      },
    },
  });
  let [toast] = toastsOf(mount());
  const retry = buttonsOf(toast).find((b) => b.props.children.join("") === "Retry");
  assert.ok(retry, "a failure can carry its way back");
  toast.props.onPointerEnter({ pointerType: "mouse" });
  assert.equal(live().length, 0, "under the mouse, no clock runs");
  toast.props.onPointerLeave({ pointerType: "mouse" });
  assert.equal(live().length, 1, "leaving re-arms what was left");
  assert.ok(live()[0].ms >= 1000 && live()[0].ms <= TOAST_MAX_MS);
  retry.props.onClick();
  assert.equal(retried, 1);
  assert.equal(toastsOf(mount()).length, 0);
});

test("three at most: a fourth drops the oldest and stops its clock", () => {
  fresh();
  mount();
  for (const n of [1, 2, 3, 4]) flash({ msg: `toast ${n}` });
  const shown = toastsOf(mount()).map((t) => {
    let s = "";
    walk(t, (n) => {
      if (n.props?.className === "pp-toast-msg") s = n.props.children.join("");
    });
    return s;
  });
  assert.deepEqual(shown, ["toast 2", "toast 3", "toast 4"]);
  assert.equal(live().length, 3, "the dropped toast's timer is cleared with it");
});

test("`once`: a second flash that says the same thing refreshes the toast in place of a twin under it", () => {
  fresh();
  mount();
  flash({ once: "ask-mic", msg: "blocked" });
  flash({ msg: "copied" });
  flash({ once: "ask-mic", msg: "blocked" });
  const shown = toastsOf(mount()).map((t) => {
    let s = "";
    walk(t, (n) => {
      if (n.props?.className === "pp-toast-msg") s = n.props.children.join("");
    });
    return s;
  });
  assert.deepEqual(shown, ["copied", "blocked"], "one toast says it, the newer, after the others");
  assert.equal(live().length, 2, "the replaced toast's clock is stopped with it");
});

/* ------------------------------ how one goes ----------------------------- */

const msgOf = (t) => {
  let s = "";
  walk(t, (n) => {
    if (n.props?.className === "pp-toast-msg") s = n.props.children.join("");
  });
  return s;
};
// A node a press lands on: inside a button, or on plain words.
const onButton = { closest: (sel) => (sel.includes("button") ? {} : null) };
const onWords = { closest: () => null };

test("a finger's tap on a toast holds nothing: the clock a touch arrived on keeps running", () => {
  fresh();
  mount();
  flash({ msg: "Saved" });
  const [toast] = toastsOf(mount());
  toast.props.onPointerEnter({ pointerType: "touch" });
  assert.equal(live().length, 1, "REGRESSION: a tap on its words froze a ten-second toast for thirty-one");
  toast.props.onPointerLeave({ pointerType: "touch" });
  assert.equal(live().length, 1);
});

test("no toast carries a ×: a tap besides is one, and a toast's only buttons are what it offers", () => {
  fresh();
  mount();
  flash({ msg: "Off Regulars", undo: () => {} });
  flash({ tone: "danger", msg: "Not saved", action: { label: "Retry", onClick() {} } });
  flash({ msg: "Saved" });
  const shown = toastsOf(mount());
  assert.equal(shown.length, 3);
  assert.deepEqual(
    shown.map((t) => buttonsOf(t).map((b) => b.props["aria-label"] ?? b.props.children.join(""))),
    [["Undo"], ["Retry"], []],
  );
});

test("a phone shows the newest toast alone, as one snackbar, and stops the clocks of those it replaced", () => {
  fresh();
  mount();
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    flash({ msg: "Off Regulars", undo: () => {} });
    flash({ msg: "Saved" });
    assert.deepEqual(toastsOf(mount()).map(msgOf), ["Saved"]);
    assert.equal(live().length, 1, "the replaced toast's clock went with it");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("on a phone a send's Undo is never pushed out: the newest toast stands beside it", () => {
  fresh();
  mount();
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try {
    flash({ msg: "Rosa — sends in 15 s unless you undo", undo: () => {}, ms: 14_800, stays: true });
    flash({ msg: "Off Regulars", undo: () => {} });
    flash({ msg: "Saved" });
    assert.deepEqual(
      toastsOf(mount()).map(msgOf),
      ["Rosa — sends in 15 s unless you undo", "Saved"],
      "REGRESSION: a toast within the send's four seconds took its Undo away",
    );
    assert.equal(live().length, 2);
  } finally {
    delete globalThis.window.matchMedia;
  }
});

/* ------------------------------- the tip -------------------------------- */

// A control with a tip, as the page draws one.
const tipped = (text, focusVisible = false) => ({
  getAttribute: (k) => (k === "data-tip" ? text : null),
  isConnected: true,
  getBoundingClientRect: () => ({ top: 400, bottom: 444, left: 100, width: 80, height: 44 }),
  closest: function () {
    return this;
  },
  matches: (sel) => sel === ":focus-visible" && focusVisible,
});
/** Run the tip's timers by hand: the ones it set while `fn` ran, with their lengths. */
const tipTimers = (fn) => {
  const set = [];
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms) => {
    set.push({ cb, ms });
    return set.length;
  };
  try {
    fn();
  } finally {
    globalThis.setTimeout = real;
  }
  return set;
};

test("a tip a press shows goes by itself under a finger, after a plain toast's three seconds; a mouse's stays", () => {
  assert.ok(globalThis.window.__tip, "the file's tip is the frame's");
  tipNode.shown.clear();
  const control = tipped("Only an owner can change this");
  const touch = tipTimers(() => {
    tipHeard.pointerdown({ pointerType: "touch" });
    globalThis.window.__tip.show(control);
  });
  assert.ok(tipNode.shown.has("show"), "the reason shows at the control");
  const away = touch.find((t) => t.ms === 3000);
  assert.ok(away, "REGRESSION: under a finger the tip stood until the next tap");
  const after = tipTimers(() => away.cb());
  after.forEach((t) => t.cb());
  assert.ok(!tipNode.shown.has("show"), "three seconds on, it is gone");
  tipNode.shown.clear();
  const mouse = tipTimers(() => {
    tipHeard.pointerdown({ pointerType: "mouse" });
    globalThis.window.__tip.show(control);
  });
  assert.ok(tipNode.shown.has("show"));
  assert.ok(!mouse.some((t) => t.ms === 3000), "under a mouse it stays until the pointer leaves");
});

test("focus shows a tip to a keyboard alone: a tap that focuses a button starts none", () => {
  tipNode.shown.clear();
  const tapped = tipTimers(() => {
    const el = tipped("Download everyone as a CSV file", false);
    tipHeard.focusin({ target: el });
  });
  assert.ok(!tapped.some((t) => t.ms === 280 || t.ms === 50), "REGRESSION: a tap's focus raised the tip");
  const keyed = tipTimers(() => {
    const el = tipped("Download everyone as a CSV file", true);
    tipHeard.focusin({ target: el });
  });
  assert.ok(
    keyed.some((t) => t.ms === 280 || t.ms === 50),
    "Tab to it, and its tip comes",
  );
});

test("a press anywhere besides takes every toast but a send's; a press on the stack takes none", () => {
  fresh();
  mount();
  flash({ msg: "Off Regulars", undo: () => {} });
  flash({ msg: "Rosa — sends in 15 s unless you undo", undo: () => {}, ms: 14_800, stays: true });
  flash({ tone: "danger", msg: "Not saved" });
  const stack = mount();
  assert.equal(typeof heard.pointerdown, "function", "one press listener, for the hook's life");
  const inside = {};
  stack.props.ref.current = { contains: (n) => n === inside };
  heard.pointerdown({ target: inside });
  assert.equal(toastsOf(mount()).length, 3, "a press on a toast is the toast's own");
  heard.pointerdown({ target: {} });
  assert.deepEqual(toastsOf(mount()).map(msgOf), ["Rosa — sends in 15 s unless you undo"], "the send's Undo stays");
  assert.deepEqual(
    live().map((t) => t.ms),
    [TOAST_MAX_MS],
    "the clocks of the toasts that went are stopped, the send's runs on",
  );
  heard.pointerdown({ target: {} });
  assert.equal(toastsOf(mount()).length, 1, "pressed besides again, it still stays for its time");
  toastsOf(mount())[0].props.onKeyDown({ key: "Escape", stopPropagation() {} });
  assert.equal(toastsOf(mount()).length, 0, "Escape takes it");
});

test("a press on a toast's words takes it, a press on its buttons is theirs, and a send's stays", () => {
  fresh();
  mount();
  flash({ msg: "Saved" });
  let [toast] = toastsOf(mount());
  toast.props.onClick({ target: onButton });
  assert.equal(toastsOf(mount()).length, 1, "a button's press is the button's");
  toast.props.onClick({ target: onWords });
  assert.equal(toastsOf(mount()).length, 0, "its words pressed, it goes");
  flash({ msg: "Rosa — sends in 15 s unless you undo", undo: () => {}, ms: 14_800, stays: true });
  [toast] = toastsOf(mount());
  toast.props.onClick({ target: onWords });
  assert.equal(toastsOf(mount()).length, 1, "a send's Undo is not lost to a tap on its words");
});

test("Escape inside a toast takes it, a send's too, and goes no further", () => {
  fresh();
  mount();
  flash({ msg: "Rosa — sends in 15 s unless you undo", undo: () => {}, ms: 14_800, stays: true });
  const [toast] = toastsOf(mount());
  let stopped = 0;
  toast.props.onKeyDown({ key: "Enter", stopPropagation: () => (stopped += 1) });
  assert.equal(toastsOf(mount()).length, 1, "another key is nothing to the toast");
  toast.props.onKeyDown({ key: "Escape", stopPropagation: () => (stopped += 1) });
  assert.equal(toastsOf(mount()).length, 0);
  assert.equal(stopped, 1, "the sheet under it is not closed by the same key");
});

test("under a finger a toast is pulled down or flicked across to be rid of it, following the finger", async () => {
  fresh();
  mount();
  flash({ msg: "Off Regulars", undo: () => {} });
  const [toast] = toastsOf(mount());
  const el = {
    style: {},
    dataset: {},
    nodeType: 1,
    parentElement: null,
    isConnected: false,
    offsetHeight: 46,
    offsetWidth: 366,
    scrollHeight: 46,
    clientHeight: 46,
    scrollWidth: 366,
    clientWidth: 366,
    matches: () => false,
  };
  const touch = (y) => [{ clientX: 180, clientY: y }];
  toast.props.onTouchStart({ touches: touch(700), currentTarget: el, target: el });
  toast.props.onTouchMove({ touches: touch(740), currentTarget: el, target: el });
  assert.equal(el.style.transform, "translate3d(0, 40px, 0)", "it moves with the finger");
  toast.props.onTouchEnd({ changedTouches: touch(780), currentTarget: el, target: el });
  await new Promise((r) => setTimeout(r, 260));
  assert.equal(toastsOf(mount()).length, 0, "let go past a third of it, it leaves and is closed");
  assert.equal(live().length, 0, "and its clock with it");
});

/* ------------------------------ the icons ------------------------------ */

test("the two glyphs the tones need exist, and are not the fallback circle", async () => {
  globalThis.React.createElement = (type, p, ...kids) => ({
    type,
    props: { ...(p || {}), children: kids.flat(Infinity) },
  });
  const { Icon } = await import("../../../../apps/dashboard/src/surfaces/kit/icon/icon.tsx");
  const draw = (name) => JSON.stringify(Icon({ name }));
  const fallback = draw("no-such-glyph");
  for (const name of ["info", "error", "check", "alert"]) {
    const svg = Icon({ name });
    assert.equal(svg.type, "svg", name);
    assert.notEqual(draw(name), fallback, `${name} is its own drawing`);
  }
  assert.notEqual(draw("info"), draw("error"), "a note and a failure are told apart");
});
