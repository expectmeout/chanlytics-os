/**
 * A peek's focus rule runs as the peek opens or closes, and never otherwise (apps/dashboard/src/surfaces/kit/table/peek-focus.ts).
 *
 * People, Leads and the Pipeline each move focus into their peek as it opens and back to the cursor's row as it closes, so
 * Tab carries on from where the member was. Each scope is kept under React's Activity while another is on screen, and
 * React runs a kept scope's effects again as it is shown: the rule ran as if the peek had just closed, focused the row last
 * opened, and an iPhone drew the keyboard's ring round it after every swipe back to the scope (Ruben's screenshot and
 * recording, 7 Nov 2026). The stub React's `remount` is that showing: every effect cleaned up and run again over the same
 * state and refs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, fresh, installStubReact, remount } from "../_stub-react.mjs";

installStubReact();
const { usePeekFocus } = await import("../../apps/dashboard/src/surfaces/kit/table/peek-focus.ts");

const moved = [];
function Probe({ peekId }) {
  usePeekFocus(peekId, (to) => moved.push(to));
  return null;
}
const draw = (peekId) => () => globalThis.React.createElement(Probe, { peekId });

test("focus moves as the peek opens and as it closes, and a scope shown again moves none", () => {
  moved.length = 0;
  fresh();
  draw(null)();
  assert.deepEqual(moved, [], "a list with no peek takes no focus as it is drawn");
  again(draw("p1"));
  assert.deepEqual(moved, ["p1"], "into the peek as it opens");
  again(draw("p1"));
  remount(draw("p1"));
  assert.deepEqual(moved, ["p1"], "drawn again, or shown again with the peek still open: nothing moves");
  again(draw(null));
  assert.deepEqual(moved, ["p1", null], "back to the row as it closes");
  remount(draw(null));
  remount(draw(null));
  assert.deepEqual(moved, ["p1", null], "a scope shown again after a swipe away and back: its row takes no focus");
});

test("a peek the address opens with the page takes focus as the page is drawn", () => {
  moved.length = 0;
  fresh();
  draw("p2")();
  assert.deepEqual(moved, ["p2"]);
});
