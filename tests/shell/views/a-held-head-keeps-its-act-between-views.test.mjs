/**
 * A page whose views change under one head holds it (kit/head/standing.ts useHeadHeld; Campaigns: campaigns/home/route.tsx):
 * what the view leaving said stands until the view arriving says its own, its act drawn but taking no press
 * (frame-head.tsx). The view leaving takes its words back a paint or more before the one arriving says its own: two frames
 * on a phone between two views drawn ahead, nine onto one not drawn yet. Campaigns' "+ New" went and came back each time,
 * and the strip of views beside it stepped 12 to 17px and back (Ruben's recording, 17 Nov 2026).
 *
 * Drawn on the stub React over the real store: a view that says nothing on its next draw lets its words go exactly as a view
 * hidden or taken away does, by its layout effect's cleanup.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, unmount } from "../../_stub-react.mjs";

installStubReact();
const { createElement } = globalThis.React;
const { standingSaid, forgetStanding, useHeadHeld, useHeadHeldNow, useStanding } =
  await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");

const SEQUENCES = { title: "Campaigns", act: "new-sequence" };
const MESSAGES = { title: "Campaigns", act: "new-message" };

/** What a view says: its standing, or nothing (a view not drawn yet, or gone). */
function View({ says }) {
  useStanding(says);
  return null;
}
/** Whether the head stands on what a view that has gone said, as the frame's act asks it. */
let heldSeen = null;
function Probe() {
  heldSeen = useHeadHeldNow();
  return null;
}
/** A page that holds its head over its views. */
function Held({ says }) {
  useHeadHeld();
  return createElement("div", null, createElement(View, { says }), createElement(Probe));
}
/** A page that does not. */
function Plain({ says }) {
  return createElement("div", null, createElement(View, { says }), createElement(Probe));
}

beforeEach(() => {
  unmount();
  forgetStanding();
  fresh();
});

test("a held head keeps the act of the view leaving until the view arriving says its own, and takes no press on it meanwhile", () => {
  again(() => createElement(Held, { says: SEQUENCES }));
  assert.equal(standingSaid()?.act, "new-sequence");
  assert.equal(heldSeen, false, "said by the view on screen: pressed as ever");
  // Sequences has gone and Messages has not said its own yet.
  again(() => createElement(Held, { says: null }));
  assert.equal(
    standingSaid()?.act,
    "new-sequence",
    "REGRESSION: the act went for the frames between, and the strip re-spaced",
  );
  assert.equal(heldSeen, true, "held: drawn where it stood, inert");
  // Messages says its own: it is the head's, pressed as ever.
  again(() => createElement(Held, { says: MESSAGES }));
  assert.equal(standingSaid()?.act, "new-message");
  assert.equal(heldSeen, false);
});

test("a page that holds nothing lets a view's words go as the view does, as before", () => {
  again(() => createElement(Plain, { says: SEQUENCES }));
  assert.equal(standingSaid()?.act, "new-sequence");
  again(() => createElement(Plain, { says: null }));
  assert.equal(standingSaid(), null, "no page held the head: nothing stands for a page that says nothing");
  assert.equal(heldSeen, false);
});

test("a held page that goes takes what it held with it", () => {
  again(() => createElement(Held, { says: SEQUENCES }));
  again(() => createElement(Held, { says: null }));
  assert.equal(standingSaid()?.act, "new-sequence");
  unmount();
  assert.equal(standingSaid(), null, "the next page's head says its own, or its crumbs, never Campaigns' act");
});
