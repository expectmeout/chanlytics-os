/**
 * The room a figure on its way keeps (apps/dashboard/src/surfaces/kit/kept-room.ts), as the strip of views draws and
 * leaves it (kit/view-tabs/view-tabs.tsx): a view says no figure for a zero, so a tab whose count is not read yet keeps
 * room only where it said a figure the last time this device drew it, as wide as that figure was; and each draw with
 * its count read leaves what the tab says for the next. The sub-tabs keep theirs the same way, held in a browser
 * (e2e/kit/kit-behaves.spec.ts, the strip loaded twice) and, for the sizes, by the gallery's pairs (e2e/kit/kit.spec.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, textOf } from "../../_stub-react.mjs";
import { drawn } from "./_skeleton.mjs";
import { inboxStrip, onADeviceThatKept } from "./_kept-device.mjs";

installStubReact();

const h = (type, props, ...children) => globalThis.React.createElement(type, props, ...children);

/** The figure a strip's first tab draws: its words where it says one, the noughts of its room where it waits, null for none. */
const firstFigureOf = (strip) => {
  const [, first] = drawn(strip).props.children.flat().filter(Boolean);
  const figure = [first.props.children].flat(Infinity).find((c) => c?.props?.className?.includes("stabs-badge"));
  if (!figure) return null;
  return figure.props["data-coming"] === undefined ? textOf(figure) : { room: figure.props["data-coming"] };
};

test("a view's count on its way keeps the room its tab last had on this device, and none where it had none or the device kept nothing", () => {
  const coming = () => inboxStrip(h, { coming: true });
  // A device that never drew the strip: nobody knows whether a figure is coming, and a view says none for a zero, so the
  // tab keeps no room, which would stand empty on every quiet day.
  assert.equal(onADeviceThatKept(null, () => firstFigureOf(coming())).drew, null);
  // One whose tab last said 12: the room of two figures, unseen, in the count's own place and tone.
  assert.deepEqual(onADeviceThatKept({ "kit/inbox/needs you": 2 }, () => firstFigureOf(coming())).drew, { room: "00" });
  // One whose tab last said none: no room.
  assert.equal(onADeviceThatKept({ "kit/inbox/needs you": 0 }, () => firstFigureOf(coming())).drew, null);
  // A strip with no name to remember under keeps nothing, and reads nothing.
  const unnamed = onADeviceThatKept({ "kit/inbox/needs you": 2 }, () =>
    firstFigureOf(inboxStrip(h, { coming: true }, false)),
  );
  assert.equal(unnamed.drew, null);
  // And a figure that is read is said, whatever was kept, and a read that says none draws none.
  assert.equal(
    onADeviceThatKept({ "kit/inbox/needs you": 2 }, () => firstFigureOf(inboxStrip(h, { count: 3 }))).drew,
    "3",
  );
  assert.equal(
    onADeviceThatKept({ "kit/inbox/needs you": 2 }, () => firstFigureOf(inboxStrip(h, { count: 0 }))).drew,
    null,
  );
});

test("a strip leaves what each tab says for the next time: a figure's length, none where it said one before, and nothing for a tab still waiting or one that never says any", () => {
  // Read with 12: two figures are left under the strip's name and the tab's. The tabs that say none were never there.
  assert.deepEqual(onADeviceThatKept(null, () => drawn(inboxStrip(h, { count: 12 }))).left, {
    "kit/inbox/needs you": 2,
  });
  // Read with none after a 12: the tab says none now, and keeps no room the next time.
  assert.deepEqual(onADeviceThatKept({ "kit/inbox/needs you": 2 }, () => drawn(inboxStrip(h, { count: 0 }))).left, {
    "kit/inbox/needs you": 0,
  });
  // Still waiting, it says nothing new: what was kept stands.
  assert.deepEqual(onADeviceThatKept({ "kit/inbox/needs you": 2 }, () => drawn(inboxStrip(h, { coming: true }))).left, {
    "kit/inbox/needs you": 2,
  });
  // A figure as long as the last leaves the slot as it was written, another tab's room with it.
  const others = { "kit/inbox/needs you": 1, "other/strip/tab": 3 };
  assert.deepEqual(onADeviceThatKept(others, () => drawn(inboxStrip(h, { count: 7 }))).left, others);
  // No name, nothing left; and a device that refuses to keep anything costs the strip nothing.
  assert.deepEqual(onADeviceThatKept(null, () => drawn(inboxStrip(h, { count: 12 }, false))).left, {});
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("refused");
    },
  });
  try {
    assert.equal(firstFigureOf(inboxStrip(h, { count: 12 })), "12");
    assert.equal(firstFigureOf(inboxStrip(h, { coming: true })), null);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});
