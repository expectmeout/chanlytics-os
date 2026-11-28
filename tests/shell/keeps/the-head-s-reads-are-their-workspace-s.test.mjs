/**
 * The reads the document's head starts are the workspace's in the address, and no other's (lane 11's item 5).
 *
 * A page's first reads are started from the document's head and parked for the page's own read to take (contracts
 * route-prefetch, bridge/api.ts takePrefetched). What keeps one workspace's parked answer from another's read is its
 * name: the address the client asks, which names the workspace the page's address names. Held as it stands: this found
 * nothing to mend. Run on the real client over a made-up window: the answer parked for one workspace is taken by that
 * workspace's read, once, and a read under another workspace's address asks the server and leaves it where it was.
 *
 * The live feed is the other thing a document holds open: it is joined on the workspace's own topic and left as the runner
 * stops, which tests/shell/surfaces/surface-boot.test.mjs holds where the runner is run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PREFETCH_SLOT } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const asked = [];
const answerOf = (of) =>
  new Response(JSON.stringify({ ok: true, data: { of } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const win = {
  location: { pathname: "/w/harbor-moving/inbox", search: "", hash: "", assign() {}, replace() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  fetch: async (url) => {
    asked.push(String(url));
    return answerOf("the server");
  },
};
globalThis.window = win;
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };

const client = await importSrc("apps/dashboard/src/bridge/api.ts");

test("what the head parked for one workspace is taken by that workspace's read, and by no other's", async () => {
  // The address a read of Harbor's asks, as the client spells it: learnt from the client, never written here.
  await client.apiFor(win)("GET settings");
  const [harbors] = asked;
  assert.ok(harbors, "the read reached the wire");
  asked.length = 0;

  // The next load of Harbor's page: its head starts that read and parks the answer on its way.
  win[PREFETCH_SLOT] = { [harbors]: Promise.resolve(answerOf("the head, for Harbor Moving")) };
  assert.equal(client.headStarted("settings", win), true);

  // A read under another workspace's address asks the server for its own, and leaves Harbor's parked.
  win.location.pathname = "/w/glow-studio/inbox";
  const glows = await client.apiFor(win)("GET settings");
  assert.equal(asked.length, 1, "asked of the server");
  assert.notEqual(asked[0], harbors, "under its own workspace's name");
  assert.deepEqual(
    glows,
    { ok: true, data: { of: "the server" } },
    "REGRESSION: one workspace's parked answer taken by another's read",
  );
  assert.ok(win[PREFETCH_SLOT][harbors], "and Harbor's is still parked");

  // Harbor's own read takes it, once, and asks the server nothing.
  win.location.pathname = "/w/harbor-moving/inbox";
  asked.length = 0;
  const taken = await client.apiFor(win)("GET settings");
  assert.deepEqual(taken, { ok: true, data: { of: "the head, for Harbor Moving" } });
  assert.deepEqual(asked, [], "nothing asked: the head's read was the page's own");
  assert.equal(win[PREFETCH_SLOT][harbors], undefined, "taken once");
});

test("what the head started and nobody took is let go with the page's first reads, whole", () => {
  win[PREFETCH_SLOT] = { "/api/v1/sequences?workspace=harbor-moving": Promise.resolve(answerOf("nobody's")) };
  client.dropPrefetched(win);
  assert.equal(win[PREFETCH_SLOT], undefined);
  assert.equal(client.headStarted("sequences", win), false);
});
