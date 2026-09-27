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
import { toastShape, TOAST_MS, TOAST_UNDO_MS, TOAST_MIN_MS, TOAST_ICONS } from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";

/* ---------------------------- the shape ------------------------------- */

test("the shape: a tone decides the icon, the role and the lifetime; a failure interrupts, everything else waits", () => {
  assert.deepEqual(
    toastShape({}),
    { tone: "ok", icon: "check", role: "status", ms: 6000 },
    "what every toast was before the tone existed",
  );
  assert.deepEqual(
    toastShape({ tone: "danger" }),
    { tone: "danger", icon: "error", role: "alert", ms: 10000 },
    "a failure is read longer, and read out at once",
  );
  assert.deepEqual(toastShape({ tone: "warn" }), { tone: "warn", icon: "alert", role: "status", ms: 8000 });
  assert.deepEqual(toastShape({ tone: "info" }), { tone: "info", icon: "info", role: "status", ms: 6000 });
  assert.equal(
    toastShape({ tone: "purple" }).tone,
    "ok",
    "a tone nobody defined is not a failure dressed as one, nor a crash",
  );
  assert.equal(toastShape({ tone: "danger", icon: "phone" }).icon, "phone", "a caller may still name the glyph");
  for (const tone of Object.keys(TOAST_MS)) assert.ok(TOAST_ICONS[tone], `${tone} has an icon`);
});

test("an Undo lives as long as the undo: the shared window by default, the caller's exact window when it knows it, and never under two seconds", () => {
  assert.equal(
    toastShape({ undo: () => {} }).ms,
    TOAST_UNDO_MS,
    "fifteen seconds -- the reply's cancel window -- not six",
  );
  assert.equal(toastShape({ undo: () => {}, ms: 14_200 }).ms, 14_200, "the receipt's own remaining window wins");
  assert.equal(toastShape({ undo: () => {}, ms: 400 }).ms, TOAST_MIN_MS, "a window that is nearly over is still read");
  assert.equal(toastShape({ ms: -5 }).ms, 6000, "a nonsense lifetime falls back to the tone's");
  assert.equal(
    toastShape({ tone: "danger", undo: () => {} }).ms,
    TOAST_UNDO_MS,
    "a failure with an Undo keeps the longer of the two",
  );
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
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
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
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
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

test("a failure is drawn as one: the tone's class, the error glyph, an alert role, and a ten-second clock", () => {
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
    [10000],
  );
});

test("a plain confirmation keeps what it always had: a check, a status role, six seconds", () => {
  fresh();
  mount();
  flash({ msg: "Saved" });
  const [toast] = toastsOf(mount());
  assert.equal(toast.props.className, "pp-toast pp-toast-ok");
  assert.equal(toast.props.role, "status");
  assert.equal(iconOf(toast), "check");
  assert.deepEqual(
    live().map((t) => t.ms),
    [6000],
  );
});

test("an Undo lives as long as its window, and pressing it runs the undo and closes the toast", () => {
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
    [14_800],
    "REGRESSION: the Undo died at six seconds with nine to spare",
  );
  const undo = buttonsOf(toast).find((b) => b.props.children.join("") === "Undo");
  assert.ok(undo, "the Undo is offered");
  undo.props.onClick();
  assert.equal(undone, 1);
  assert.equal(toastsOf(mount()).length, 0, "closed once undone");
  assert.equal(live().length, 0, "and its clock is stopped");
});

test("an action is offered beside the words, and a hover holds the clock until the pointer leaves", () => {
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
  toast.props.onMouseEnter();
  assert.equal(live().length, 0, "under the pointer, no clock runs");
  toast.props.onMouseLeave();
  assert.equal(live().length, 1, "leaving re-arms what was left");
  assert.ok(live()[0].ms >= 1000 && live()[0].ms <= 10000);
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

/* ------------------------------ the icons ------------------------------ */

test("the two glyphs the tones need exist, and are not the fallback circle", async () => {
  globalThis.React.createElement = (type, p, ...kids) => ({
    type,
    props: { ...(p || {}), children: kids.flat(Infinity) },
  });
  await import("../../../../apps/dashboard/src/legacy/components/icons.jsx");
  const Icon = globalThis.window.Icon;
  const draw = (name) => JSON.stringify(Icon({ name }));
  const fallback = draw("no-such-glyph");
  for (const name of ["info", "error", "check", "alert"]) {
    const svg = Icon({ name });
    assert.equal(svg.type, "svg", name);
    assert.notEqual(draw(name), fallback, `${name} is its own drawing`);
  }
  assert.notEqual(draw("info"), draw("error"), "a note and a failure are told apart");
});
