/**
 * An open thread's reply box rising with a phone's keys (apps/dashboard/src/surfaces/kit/motion/keys-rise.ts).
 *
 * The screen makes the keys' room at once as a field in the box is focused (keyboard.ts kb-expected), so the browser
 * finds the field above where the keys land and lifts nothing; drawn as it stood, the box went up by the whole room in
 * one frame, and the conversation with it. What the eye sees is a still copy of the box going from where the box stood
 * to where it stands over the keys' beat, the box held clear meanwhile, and the conversation reaching down to the copy's
 * top and given its place back as the copy rises. Landed, or the focus gone from the box first, the box is itself again
 * at once.
 *
 * Run against the module itself, on a screen, a box, a conversation and a field that answer what it asks of them, with
 * frames that run as the test lets them and the clock's timers mocked.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";

/* ------------------------------ what stands in for a browser ------------------------------ */

const rootClasses = new Set();
let reduced = false;
globalThis.window = { matchMedia: (q) => ({ matches: reduced && q.includes("reduce") }) };
globalThis.document = { documentElement: { classList: { contains: (c) => rootClasses.has(c) } } };
const frames = [];
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
const runFrame = () => frames.splice(0).forEach((fn) => fn());

const { riseWithKeys } = await import("../../../../../apps/dashboard/src/surfaces/kit/motion/keys-rise.ts");

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
/** An element's style, which keeps every value written to it in order (`writes`), where a browser keeps the last. */
const styleOf = () => {
  const writes = [];
  return new Proxy(
    {},
    {
      set(kept, key, value) {
        writes.push([key, value]);
        kept[key] = value;
        return true;
      },
      get(kept, key) {
        if (key === "writes") return writes;
        if (key === "removeProperty")
          return (name) => {
            delete kept[camel(name)];
            writes.push([camel(name), undefined]);
          };
        return kept[key];
      },
    },
  );
};
const written = (style, key) => style.writes.filter(([k]) => k === key).map(([, v]) => v);

/** A part inside the box: a field with what is typed in it (`value`), or a part named for a test. */
const part = (tag, attrs = {}, value = "") => ({
  tag,
  attrs: { ...attrs },
  value,
  removeAttribute(name) {
    delete this.attrs[name];
  },
});
const matching = (parts, sel) =>
  sel === "textarea, input"
    ? parts.filter((p) => p.tag === "TEXTAREA" || p.tag === "INPUT")
    : parts.filter((p) => "id" in p.attrs || "data-testid" in p.attrs);

const element = ({ rect = null, css = {}, attrs = {}, parts = [] } = {}) => ({
  rect,
  css,
  attrs: { ...attrs },
  parts,
  style: styleOf(),
  listeners: {},
  children: [],
  parentElement: null,
  isConnected: true,
  inert: false,
  offsetHeight: 83,
  getBoundingClientRect() {
    return this.rect;
  },
  setAttribute(name, value) {
    this.attrs[name] = value;
  },
  removeAttribute(name) {
    delete this.attrs[name];
  },
  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
  },
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
    this.isConnected = false;
  },
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  },
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  },
  querySelectorAll(sel) {
    return matching(this.parts, sel);
  },
  // As a browser's: its attributes and parts copied, a field holding the words it was drawn with, not what was typed.
  cloneNode() {
    return element({ css: this.css, attrs: this.attrs, parts: this.parts.map((p) => part(p.tag, p.attrs)) });
  },
});

const rect = (top, bottom) => ({ top, bottom, left: 0, width: 375, height: bottom - top });

/** A phone's open thread: the screen, its reply box on the screen's foot (83px, 16px under its words), the conversation. */
const thread = () => {
  const screen = element({ rect: rect(0, 812) });
  const words = part("TEXTAREA", { id: "reply", "data-testid": "ix-composer-text" }, "Hi Robin");
  const box = element({
    rect: rect(729, 812),
    attrs: { class: "ix-th-foot", "data-testid": "ix-th-foot" },
    parts: [words, part("BUTTON", { "data-testid": "ix-send" })],
  });
  screen.appendChild(box);
  const along = element({ rect: rect(71, 729) });
  return { screen, box, along, field: { tagName: "TEXTAREA" } };
};
/** The room the screen makes for an iPhone's keys as the field is focused: 336px of keyboard, 50 of Safari's address. */
const ROOM = 386;

test("a field focused in the reply box: a copy of it rises from where it stood to the keys' room over their beat, the conversation reaching down to it; landed, the box is itself again", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { screen, box, along, field } = thread();
    riseWithKeys(field, box, along);
    assert.equal(screen.children.length, 1, "nothing moves before the room is made");
    box.rect = rect(729 - ROOM, 812 - ROOM);
    runFrame();

    const copy = screen.children.at(-1);
    assert.notEqual(copy, box, "a copy of the box, over it");
    assert.equal(copy.attrs["aria-hidden"], "true", "hidden from a screen reader");
    assert.equal(copy.inert, true, "nothing reaches it");
    assert.ok(
      !("data-testid" in copy.attrs) && copy.parts.every((p) => !("id" in p.attrs) && !("data-testid" in p.attrs)),
      "no id or test id is said twice",
    );
    assert.equal(copy.parts[0].value, "Hi Robin", "its field holds what is typed in the box's");
    assert.equal(copy.style.position, "absolute");
    assert.equal(copy.style.top, `${729 - ROOM}px`, "where the box stands now, in the screen");
    assert.equal(copy.style.width, "375px");
    assert.deepEqual(
      written(copy.style, "translate"),
      [`0 ${ROOM}px`, "0 0"],
      "from where the box stood, to where it stands",
    );
    assert.deepEqual(
      written(copy.style, "transition"),
      ["none", "translate 250ms var(--ease-out)"],
      "over the keys' beat",
    );
    assert.equal(box.style.opacity, "0", "the box itself held clear: its field keeps the focus");
    assert.deepEqual(
      written(along.style, "marginBottom"),
      [`-${ROOM}px`, "0px"],
      "the conversation reaches down to the copy's top, then is given its place back as the copy rises",
    );
    assert.deepEqual(written(along.style, "transition"), ["none", "margin-bottom 250ms var(--ease-out)"]);

    mock.timers.tick(279);
    assert.ok(screen.children.includes(copy), "still rising");
    mock.timers.tick(1);
    assert.ok(!screen.children.includes(copy), "landed, the copy is let go");
    assert.equal(box.style.opacity, undefined, "and the box is itself again, where the copy landed");
    assert.equal(along.style.marginBottom, undefined);
    assert.equal(along.style.transition, undefined);
    assert.equal((box.listeners.focusout || []).length, 0, "nothing left listening");
  } finally {
    mock.timers.reset();
  }
});

test("the focus gone from the box before it lands (sent, or the keys put away): the box is itself again at once", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { screen, box, along, field } = thread();
    riseWithKeys(field, box, along);
    box.rect = rect(729 - ROOM, 812 - ROOM);
    runFrame();
    assert.equal(screen.children.length, 2, "rising");
    box.listeners.focusout.forEach((fn) => fn());
    assert.equal(screen.children.length, 1, "the copy let go at once");
    assert.equal(box.style.opacity, undefined);
    mock.timers.tick(300);
    assert.equal(screen.children.length, 1, "and once only");
  } finally {
    mock.timers.reset();
  }
});

test("nothing rises where nothing would: a press, the keys up already, motion reduced, no room made, or the box gone", () => {
  const still = (setUp, why) => {
    const { screen, box, along, field } = thread();
    const target = setUp({ box, field }) ?? field;
    riseWithKeys(target, box, along);
    runFrame();
    assert.equal(screen.children.length, 1, `${why}: no copy`);
    assert.equal(box.style.opacity, undefined, `${why}: the box as it is`);
  };
  still(() => ({ tagName: "BUTTON" }), "a press on Send, which no keys rise for");
  rootClasses.add("kb-up");
  still(() => null, "the keys up already, the focus moving between fields");
  rootClasses.delete("kb-up");
  reduced = true;
  still(() => null, "motion reduced: the box is simply there");
  reduced = false;
  still(() => null, "no room made (a keyboard that never comes), so the box did not move");
  still(({ box }) => {
    box.isConnected = false;
    box.rect = rect(729 - ROOM, 812 - ROOM);
  }, "the thread closed before the frame");
});
