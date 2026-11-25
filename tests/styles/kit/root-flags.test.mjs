/**
 * What the whole page holds, said on the document's root (apps/dashboard/src/surfaces/kit/motion/root-flags.ts): a rule
 * asks a flag there in place of a `:has()` on the root (styles/has-subjects.test.mjs holds that none is left).
 *
 * The flags and the rules agree: every flag is asked by a rule, every mark a rule asks of the root is a flag or one of
 * the root's own marks, and a rule writes each flag as many times as the `:has()` it stands for weighed, so no rule
 * outranks or yields to one it did not before. And a flag stands exactly while something holds it: a part of the page,
 * a picture of one on its way out, a page a thumb carries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transform } from "lightningcss";
import { ROOT } from "../../_source.mjs";

const { ROOT_FLAGS, holdRootFlag, holdPictured, holdWhileMarked, takenOutLater } =
  await import("../../../apps/dashboard/src/surfaces/kit/motion/root-flags.ts");

/** Every stylesheet of the dashboard's but the build's own copies. */
const sheets = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? e.name === "node_modules" || (dir.endsWith("public") && e.name === "sheets")
          ? []
          : sheets(path.join(dir, e.name))
        : e.name.endsWith(".css")
          ? [path.join(dir, e.name)]
          : [],
    );

const compounds = (selector) => {
  const out = [[]];
  for (const c of selector) {
    if (c.type === "combinator") out.push([]);
    else out[out.length - 1].push(c);
  }
  return out;
};

/** Whether a part of a compound is the document's root: `html`, `:root`, or `:where(:root)`. */
const isRoot = (c) =>
  (c.type === "type" && c.name === "html") ||
  (c.type === "pseudo-class" && c.kind === "root") ||
  (c.type === "pseudo-class" &&
    c.kind === "where" &&
    c.selectors.length === 1 &&
    c.selectors[0].length === 1 &&
    isRoot(c.selectors[0][0]));

/** Every compound a selector's root compound holds, itself and each inside its `:not()`s and `:is()`s. */
const rootCompounds = (selector) => {
  const first = compounds(selector)[0];
  if (!first.some(isRoot)) return [];
  const all = [first];
  for (const c of first)
    if (c.type === "pseudo-class" && Array.isArray(c.selectors) && c.kind !== "where")
      for (const inner of c.selectors) all.push(...compounds(inner));
  return all;
};

/** A selector's weight in the middle column (classes, attributes, pseudo-classes): what a flag stands in for. */
const weightOf = (selector) =>
  selector.reduce((sum, c) => {
    if (c.type === "class" || c.type === "attribute") return sum + 1;
    if (c.type !== "pseudo-class") return sum;
    if (c.kind === "where") return sum;
    if (Array.isArray(c.selectors)) return sum + Math.max(0, ...c.selectors.map(weightOf));
    return sum + 1;
  }, 0);

/** A selector read whole, as the parser reads it. */
const parsed = (text) => {
  let got = null;
  transform({
    filename: "t.css",
    code: Buffer.from(`${text} { color: red }`),
    visitor: {
      Selector(s) {
        got = got ?? s;
      },
    },
  });
  return got;
};

/** The marks every rule asks of the document's root, each with the compounds asking it. */
function rootMarks() {
  const marks = new Map();
  for (const f of [...sheets("apps/dashboard/src"), ...sheets("apps/dashboard/app")]) {
    transform({
      filename: f,
      code: fs.readFileSync(path.join(ROOT, f)),
      errorRecovery: true,
      visitor: {
        Selector(selector) {
          for (const compound of rootCompounds(selector))
            for (const c of compound)
              if (c.type === "attribute") {
                if (!marks.has(c.name)) marks.set(c.name, []);
                marks.get(c.name).push({ file: f.replace(/\\/g, "/"), compound });
              }
        },
      },
    });
  }
  return marks;
}

/** What else stands on the root, each stamped by its own code: the theme and look, the outline's, a thumb's, the first rows'. */
const THE_ROOTS_OWN = new Set([
  "data-theme",
  "data-look",
  "data-carrying",
  "data-pushing",
  "data-thumb-down",
  "data-page-top",
  "data-sidebar",
  "data-outline-bare",
  "data-outline-lit",
  "data-outline-search",
  "data-first-rows",
]);

test("every flag is asked by a rule, and every mark a rule asks of the root is a flag or one the root keeps of its own", () => {
  const marks = rootMarks();
  const flags = new Set(Object.values(ROOT_FLAGS).map((f) => f.attr));
  assert.equal(flags.size, Object.keys(ROOT_FLAGS).length, "one attribute a flag");
  assert.deepEqual(
    [...flags].filter((attr) => !marks.has(attr)),
    [],
    "a flag no rule asks: take it out, or ask it",
  );
  assert.deepEqual(
    [...marks.keys()].filter((attr) => !flags.has(attr) && !THE_ROOTS_OWN.has(attr)).sort(),
    [],
    "a mark asked of the root that nothing stamps: a flag misspelt, or a new mark to name here",
  );
});

test("a rule writes each flag as many times as the :has() it stands for weighed, so it outranks nothing new", () => {
  const marks = rootMarks();
  const wrong = [];
  for (const [name, { attr, picture }] of Object.entries(ROOT_FLAGS)) {
    const weight = weightOf(parsed(picture));
    assert.ok(weight > 0, `${name}'s picture is read`);
    for (const { file, compound } of marks.get(attr) ?? []) {
      const times = compound.filter((c) => c.type === "attribute" && c.name === attr).length;
      if (times !== weight) wrong.push(`${file}: [${attr}] ${times} times, its :has() weighed ${weight}`);
    }
  }
  assert.deepEqual(wrong, []);
  // The reader, where it must count: a thread's :has() weighed two, an open dialog's one.
  assert.equal(weightOf(parsed(":is(.inbox, .conversations, .cm-split)[data-takeover]")), 2);
  assert.equal(weightOf(parsed('[aria-modal="true"]')), 1);
  assert.equal(weightOf(parsed(".main-scroll.pane > :is(.inbox, .conversations)[data-takeover]")), 4);
});

/* ---- a flag stands while something holds it ---- */

/** A stand-in document whose root keeps its attributes, for as long as `run` takes. */
function onARoot(run) {
  const attrs = new Map();
  const html = {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  const was = globalThis.document;
  globalThis.document = { documentElement: html };
  try {
    run(attrs);
  } finally {
    globalThis.document = was;
  }
}

/** A stand-in element: the selectors it meets itself and inside it, and whether it stands in the frame's root. */
const node = ({ is = [], holds = [], inFrame = true, connected = true } = {}) => ({
  isConnected: connected,
  matches: (s) => is.includes(s),
  querySelector: (s) => (holds.includes(s) ? {} : null),
  closest: (s) => (s === ".app-root" ? (inFrame ? {} : null) : {}),
});

test("a flag stands while anyone holds it, and goes with the last", () => {
  onARoot((attrs) => {
    const one = holdRootFlag("sheetOpen");
    const two = holdRootFlag("sheetOpen");
    assert.equal(attrs.has("data-sheet-open"), true);
    one();
    one();
    assert.equal(attrs.has("data-sheet-open"), true, "a second sheet is still open; a release twice lets go once");
    two();
    assert.equal(attrs.has("data-sheet-open"), false);
  });
});

test("a picture holds what it pictures where it stands, until it is taken out", () => {
  onARoot((attrs) => {
    const { picture: modal } = ROOT_FLAGS.modalOpen;
    const { picture: dock } = ROOT_FLAGS.dockInFrame;
    // Ask's line playing out on a phone: its copy holds the dialog inside it.
    const letGo = holdPictured(node({ holds: [modal] }));
    assert.equal(attrs.has(ROOT_FLAGS.modalOpen.attr), true);
    letGo();
    assert.equal(attrs.has(ROOT_FLAGS.modalOpen.attr), false);
    // A dock on the body, outside the frame's root: AI's circle stands down for it, the tab bar does not.
    const docked = holdPictured(node({ is: [dock], inFrame: false }));
    assert.equal(attrs.has(ROOT_FLAGS.dockUp.attr), true);
    assert.equal(attrs.has(ROOT_FLAGS.dockInFrame.attr), false);
    docked();
    // One taken out already holds nothing.
    holdPictured(node({ holds: [modal], connected: false }));
    assert.equal(attrs.size, 0);
    // Its way out: it holds from the moment it is asked, and goes with what it held.
    let removed = 0;
    const out = takenOutLater({ ...node({ holds: [modal] }), remove: () => removed++ });
    assert.equal(attrs.has(ROOT_FLAGS.modalOpen.attr), true);
    out();
    assert.deepEqual([removed, attrs.has(ROOT_FLAGS.modalOpen.attr)], [1, false]);
  });
});

test("a page a thumb carries holds what its mark makes it, and nothing it already was", () => {
  onARoot((attrs) => {
    const going = ROOT_FLAGS.personGoing;
    const page = node({ is: [going.picture, ROOT_FLAGS.takenOver.picture] });
    holdWhileMarked(page, "data-going", true);
    holdWhileMarked(page, "data-going", true);
    assert.equal(attrs.has(going.attr), true);
    assert.equal(attrs.has(ROOT_FLAGS.takenOver.attr), false, "its takeover is its page's own to hold");
    holdWhileMarked(page, "data-going", false);
    assert.equal(attrs.has(going.attr), false, "two marks, one let go: the mark is one");
  });
});
