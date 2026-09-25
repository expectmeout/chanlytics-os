/**
 * What the on-screen keyboard covers, said once for every page as --kb (data-bits watchKeyboard, 25 Sep).
 *
 * A phone lays its keyboard over the page and keeps the layout's height, so a sheet fixed to the bottom kept its fields
 * and its Save under the keys; Ask's screen measured it for itself (--ask-kb). One measure now, which the shell starts
 * and Ask's screen and every sheet stand on: the layout's height less what the browser still shows. It follows what is
 * shown, never the focus, since a blur that dropped a sheet at once moved Save from under the finger between the press
 * and the click. A pinch zoom shrinks what is shown too, and is no keyboard.
 *
 * Run against data-bits itself, on a window and a document that answer what the helper asks of them; e2e/phone.spec.ts
 * stands a sheet on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const heard = {};
const vv = {
  height: 812,
  offsetTop: 0,
  scale: 1,
  addEventListener: (type, fn) => (heard[type] = heard[type] || []).push(fn),
  removeEventListener: (type, fn) => (heard[type] = (heard[type] || []).filter((f) => f !== fn)),
};
const props = new Map();
const classes = new Set();
globalThis.window = {
  innerHeight: 812,
  visualViewport: vv,
  matchMedia: () => ({ matches: false }),
  getComputedStyle: () => ({ overflowY: "visible", overflowX: "visible" }),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};
const kept = new Map();
globalThis.window.localStorage = {
  getItem: (k) => (kept.has(k) ? kept.get(k) : null),
  setItem: (k, v) => kept.set(k, v),
};
const docHeard = {};
globalThis.document = {
  documentElement: {
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) },
  },
  addEventListener: (type, fn) => (docHeard[type] = docHeard[type] || []).push(fn),
  removeEventListener: (type, fn) => (docHeard[type] = (docHeard[type] || []).filter((f) => f !== fn)),
  body: { appendChild() {} },
  createElement: () => ({ style: {} }),
};
globalThis.React = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useEffect() {},
  useRef: (v) => ({ current: v }),
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { watchKeyboard } = globalThis.window;

const fire = (type) => (heard[type] || []).forEach((fn) => fn());
const focus = (type, target) => (docHeard[type] || []).forEach((fn) => fn({ target }));
const show = (height, offsetTop = 0, scale = 1) => Object.assign(vv, { height, offsetTop, scale });
const field = { tagName: "INPUT", type: "text" };

const focusListeners = () => (docHeard.focusin || []).length + (docHeard.focusout || []).length;

test("what the keyboard covers is said as --kb, the browser's move as --vv-top and a keyboard up as kb-up; it follows what the browser shows, and goes when stopped", () => {
  show(812);
  const listening = focusListeners();
  const stop = watchKeyboard();
  assert.equal(focusListeners(), listening + 2, "it hears focus come and go");
  assert.equal(props.get("--kb"), "0px", "nothing covered at the start");
  assert.equal(props.get("--vv-top"), "0px");
  assert.equal(classes.has("kb-up"), false);
  show(480);
  fire("resize");
  assert.equal(props.get("--kb"), "332px", "812 laid out, 480 shown: 332 under the keys");
  assert.equal(classes.has("kb-up"), true, "a keyboard is up");
  show(480, 32);
  fire("scroll");
  assert.equal(props.get("--kb"), "300px", "the browser moved what it shows down 32: 300 under the keys");
  assert.equal(props.get("--vv-top"), "32px", "and says the move");
  show(480, 332);
  fire("scroll");
  assert.equal(props.get("--kb"), "0px", "moved down by the whole keyboard, nothing of the layout's foot is under it");
  assert.equal(props.get("--vv-top"), "332px");
  assert.equal(classes.has("kb-up"), true, "the keyboard is still up");
  show(812);
  fire("resize");
  assert.equal(props.get("--kb"), "0px", "the keyboard went");
  assert.equal(props.get("--vv-top"), "0px");
  assert.equal(classes.has("kb-up"), false);
  stop();
  assert.equal(props.has("--kb"), false, "stopped, it says nothing");
  assert.equal(props.has("--vv-top"), false);
  assert.equal(props.has("--kb-last"), false);
  assert.equal((heard.resize || []).length + (heard.scroll || []).length, 0, "and listens to nothing");
  assert.equal(focusListeners(), listening, "and hears focus no more");
});

test("a keyboard is expected as a field that types is focused, with the height the last one had, kept on the device; the word ends as the keyboard is up, as focus leaves, or when no keyboard comes", async () => {
  kept.clear();
  show(812);
  let stop = watchKeyboard();
  assert.equal(props.get("--kb-last"), "0px", "no keyboard seen yet on this device");
  focus("focusin", field);
  assert.equal(classes.has("kb-expected"), true, "a field focused: a keyboard is expected");
  show(480);
  fire("resize");
  assert.equal(classes.has("kb-up"), true);
  assert.equal(classes.has("kb-expected"), false, "up, it is no longer expected");
  assert.equal(props.get("--kb-last"), "332px", "and its height is remembered");
  assert.equal(kept.get("chanlytics-os-keyboard"), "332", "on the device");
  focus("focusin", field);
  assert.equal(classes.has("kb-expected"), false, "focus moving between fields under a keyboard up expects nothing");
  show(812);
  fire("resize");
  focus("focusin", { tagName: "BUTTON" });
  assert.equal(classes.has("kb-expected"), false, "a button raises no keyboard");
  focus("focusin", { tagName: "INPUT", type: "checkbox" });
  assert.equal(classes.has("kb-expected"), false, "nor a checkbox");
  focus("focusin", { tagName: "TEXTAREA" });
  assert.equal(classes.has("kb-expected"), true);
  focus("focusout", field);
  assert.equal(classes.has("kb-expected"), false, "focus left: no keyboard coming");
  focus("focusin", field);
  await new Promise((r) => setTimeout(r, 650));
  assert.equal(classes.has("kb-expected"), false, "no keyboard came (a hardware one): the word is taken back");
  stop();
  assert.equal(classes.has("kb-expected"), false);
  stop = watchKeyboard();
  assert.equal(props.get("--kb-last"), "332px", "a new page on the device knows the last keyboard");
  stop();
});

test("a pinch zoom shrinks what is shown too, and is no keyboard", () => {
  show(812);
  const stop = watchKeyboard();
  show(406, 200, 2);
  fire("resize");
  assert.equal(props.get("--kb"), "0px");
  assert.equal(props.get("--vv-top"), "0px");
  assert.equal(classes.has("kb-up"), false);
  stop();
});
