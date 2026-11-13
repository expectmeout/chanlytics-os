/**
 * What follows a move waits for that move alone (apps/dashboard/src/surfaces/frame-verbs.ts `afterMove`): the Ads page
 * closes its composer and then opens the Google ad's, and the ad's pane closes and then opens Ask about the ad.
 *
 * It listened for the next move of the address and ran `then` when one came, and stopped listening only then. A close that
 * moved nothing (the list already showing) left it listening, and the person's next move, wherever to, ran `then`: the
 * composer or Ask opened over a page they had gone to for something else (a review read at d0739a8fee, 13 Nov 2026). A
 * `move` that threw left it listening too. Now a move heard as it is made, or a Back heard as it lands, runs `then`; one
 * that has not moved within the moment a Back takes runs `then` once, there, and nothing listens after.
 *
 * Run against the function itself, over a frame address that tells its listeners as the frame's does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { until } from "../../shared/_until.mjs";

globalThis.window ??= globalThis;
const { afterMove } = await import("../../../apps/dashboard/src/surfaces/frame-verbs.ts");

/** The frame's address: who listens, and a move it tells them of. */
function anAddress() {
  const listening = new Set();
  globalThis.window.CHANLY = {
    address: {
      hear: (fn) => {
        listening.add(fn);
        return () => listening.delete(fn);
      },
    },
  };
  return {
    listening,
    moved: () => [...listening].forEach((fn) => fn()),
  };
}

test("a move that is made moves at once: what follows it runs once, and nothing listens after", () => {
  const address = anAddress();
  let ran = 0;
  afterMove(address.moved, () => (ran += 1));
  assert.equal(ran, 1);
  assert.equal(address.listening.size, 0);
  address.moved();
  assert.equal(ran, 1, "a later move runs nothing");
});

test("a Back gets what follows it when it lands, a moment after it was asked for", async () => {
  const address = anAddress();
  const said = [];
  afterMove(
    () => setTimeout(() => (said.push("landed"), address.moved()), 30),
    () => said.push("then"),
  );
  assert.deepEqual(said, [], "nothing before the Back lands");
  await until(() => said.length === 2, "the Back lands and what follows it runs");
  assert.deepEqual(said, ["landed", "then"]);
  assert.equal(address.listening.size, 0, "nothing listens after");
});

test("REGRESSION: a move that moved nothing is not followed later by the person's next, unrelated move", async () => {
  const address = anAddress();
  let ran = 0;
  afterMove(
    () => undefined,
    () => (ran += 1),
  );
  // Nothing moved: what follows it is what the person pressed for, run once the moment a Back takes has passed.
  await until(() => ran === 1, "what follows a move that moved nothing runs once, by itself");
  assert.equal(address.listening.size, 0, "REGRESSION: it still listened for the next move");
  address.moved();
  assert.equal(ran, 1, "REGRESSION: the person's next move ran it again");
});

test("REGRESSION: a move that throws leaves nothing listening, and nothing follows it", async () => {
  const address = anAddress();
  let ran = 0;
  assert.throws(
    () =>
      afterMove(
        () => {
          throw new Error("refused");
        },
        () => (ran += 1),
      ),
    /refused/,
  );
  assert.equal(address.listening.size, 0, "REGRESSION: a move that threw left its listener");
  address.moved();
  assert.equal(ran, 0, "nothing follows a move that failed");
});
