/**
 * What a page's first draw waits for beside its own surface (surface-registry.ts ROUTE_WAITS), run through the gate the
 * shell asks (installRouteGate over surface-status), not read as text.
 *
 * Today draws what is left to set up ABOVE its queue. Read seventh, it landed after the queue and pushed it down
 * (Ruben, 24 Sep 2026), and so did the strip, Going today, a run's seat, a review and the rows' words (the Today load
 * review, 27 Oct 2026). Its own file: the statuses are module state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window = { location: { pathname: "/w/harbor", hash: "#/today" } };
const reg = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
reg.installRouteGate();
const gate = globalThis.window.__surfaceGate;

test("a Setup that failed is done waiting, and never holds a page that waits for nothing", () => {
  status.setStatus("conversations", "live");
  assert.equal(gate("conversations"), true, "Conversations waits for its own surface alone");
  // A fresh key pair, as the statuses are module state: a page whose band failed draws, and says so where it would be.
  reg.ROUTE_WAITS.conversations = ["google"];
  try {
    assert.equal(gate("conversations"), false);
    status.setStatus("google", "seeded");
    assert.equal(gate("conversations"), true, "failed is over: the page draws");
  } finally {
    delete reg.ROUTE_WAITS.conversations;
  }
});

test("the Inbox waits for Sent's runs beside its threads, so the runs waiting for your word never push the threads down (the Inbox's run review, 18 Oct 2026)", () => {
  assert.deepEqual(reg.ROUTE_WAITS.inbox, ["broadcasts"]);
  status.setStatus("inbox", "live");
  assert.equal(
    gate("inbox"),
    false,
    "REGRESSION: the threads drawn while the run rows above them were still on their way",
  );
  assert.equal(gate("inbox", "c-1"), false, "a thread's address is the Inbox's too");
  assert.equal(gate("inbox", null, true), true, "its own surface is in: the shell draws after the wait regardless");
  status.setStatus("broadcasts", "live");
  assert.equal(gate("inbox"), true, "the run rows and the threads draw together");
  status.setStatus("broadcasts", "seeded");
  assert.equal(gate("inbox"), true, "a runs read that failed holds nothing: the threads draw");
});

test("Reports waits for the workspace list beside its own surface, so the strip of lenses never gains a tab after it is drawn", () => {
  assert.deepEqual(reg.ROUTE_WAITS.reports, ["workspace"]);
  assert.equal(gate("reports"), false, "nothing in yet");
  status.setStatus("reports", "live");
  assert.equal(gate("reports"), false, "REGRESSION: the page drawn before the list that decides its strip");
  assert.equal(gate("reports", null, true), true, "its own surface is in: the shell draws after the wait regardless");
  status.setStatus("workspace", "live");
  assert.equal(gate("reports"), true, "the strip and the page draw together");
});

test("Campaigns' views each wait for what their own first screen is made of, asked of the view before the page (the Campaigns load review, 28 Oct 2026)", () => {
  assert.deepEqual(reg.ROUTE_WAITS["campaigns/sequences"], ["settings"]);
  assert.deepEqual(reg.ROUTE_WAITS["campaigns/sequences/new"], ["playbooks"]);
  assert.deepEqual(reg.ROUTE_WAITS["campaigns/messages"], ["channels"]);
  assert.equal(reg.ROUTE_WAITS.campaigns, undefined, "no view waits for another's");
  status.setStatus("sequences", "live");
  // A sequence's steps say their messages' words, which are the settings read's.
  assert.equal(
    gate("campaigns", "sequences/sq-1"),
    false,
    "REGRESSION: a step drawn saying its message was gone, its words standing there a frame later",
  );
  assert.equal(gate("campaigns", "sequences/sq-1/history"), false, "a tab of a sequence is its record too");
  assert.equal(
    gate("campaigns", "sequences/sq-1", true),
    true,
    "its own surface is in: the shell draws after the wait",
  );
  // New's starts are the playbooks read's moments, lists and counts.
  assert.equal(
    gate("campaigns", "sequences/new"),
    false,
    "REGRESSION: New's starts drawn before what they are made of",
  );
  assert.equal(gate("campaigns", "sequences/new:leads"), false, "a door's New is New too");
  status.setStatus("playbooks", "live");
  assert.equal(
    gate("campaigns", "sequences/new"),
    true,
    "New waits for the playbooks read alone, never the settings read",
  );
  status.setStatus("settings", "live");
  assert.equal(gate("campaigns", "sequences/sq-1"), true, "the steps and their words draw together");
  // Messages' own surface is the settings read; beside it, the number it sends from.
  assert.equal(
    gate("campaigns", "messages"),
    false,
    "REGRESSION: Messages said there was no number, then the list moved up as the numbers came",
  );
  assert.equal(gate("campaigns", "messages/booking_link"), false, "a message open in it is Messages too");
  status.setStatus("channels", "seeded");
  assert.equal(
    gate("campaigns", "messages"),
    true,
    "a numbers read that failed holds nothing: the page says what it could not read",
  );
});

// Last: Today's own test sets Google's and Sent's runs live, which the tests above start from nothing (module state).
test("Today waits beside its own surface for everything that stands above its queue or in it; asked for its own alone, it does not", () => {
  // The strip over the page, Going today and a run's seat, a reply's row, a review to answer and each row's words (the Today
  // load review, 27 Oct 2026): each landed after the queue on a cold load and moved it.
  const above = ["setup", "calendar", "broadcasts", "reach_out_replies", "google", "reply_drafts"];
  assert.deepEqual(reg.ROUTE_WAITS.today, above);
  assert.equal(gate("today"), false, "nothing in yet");
  status.setStatus("today", "live");
  assert.equal(gate("today"), false, "REGRESSION: the queue drawn while the card above it was still on its way");
  assert.equal(gate("today", null, true), true, "its own surface is in: the shell draws after the wait regardless");
  for (const [i, k] of above.entries()) {
    assert.equal(gate("today"), false, `REGRESSION: the queue drawn while ${k} was still on its way`);
    // The last one fails: a failed read is over, and the page draws (its band says so where it would be).
    status.setStatus(k, i === above.length - 1 ? "seeded" : "live");
  }
  assert.equal(gate("today"), true, "the bands, the rows and the queue draw together");
  assert.equal(globalThis.window.__routeWaitMs, reg.ROUTE_WAIT_MS, "the shell is told how long a wait may hold it");
});

test("what Today waits for is what the boot reads first among what it draws, in that order: one behind the stream's second tier held the page for it", () => {
  assert.deepEqual(reg.ROUTE_DRAWS.today.slice(0, reg.ROUTE_WAITS.today.length), reg.ROUTE_WAITS.today);
});

test("what a Campaigns view waits for is among the first four the boot reads beside its own, so none waits behind a heavier read", () => {
  for (const view of ["campaigns/sequences", "campaigns/sequences/new", "campaigns/messages"]) {
    const first = reg.ROUTE_DRAWS[view].slice(0, 4);
    for (const k of reg.ROUTE_WAITS[view]) assert.ok(first.includes(k), `${view} reads ${k} in the boot's first lanes`);
  }
});

test("a page's first draw waits for code of its own as it waits for a surface, until the fetch settles, landed or failed, and the shell hears it end", async () => {
  // A fresh page, as the statuses are module state: no surface of its own, nothing it waits for but its code.
  reg.ROUTE_WAITS.later = [];
  let heard = 0;
  const off = status.onSurfaceStatusChange(() => heard++);
  try {
    let land;
    status.firstDrawWaitsFor("later", new Promise((r) => (land = r)));
    let fail;
    status.firstDrawWaitsFor("later", new Promise((_, r) => (fail = r)));
    assert.equal(
      gate("later"),
      false,
      "REGRESSION: a card drawn above the page from its own chunk landed after the page",
    );
    assert.equal(gate("later", null, true), true, "the page's own surface is in: the shell's wait still caps it");
    land();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(gate("later"), false, "one fetch is still out");
    fail(new Error("chunk"));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(gate("later"), true, "a fetch that failed is over: the part draws nothing or says so");
    assert.equal(heard, 2, "the shell hears each fetch end, as it hears a surface land");
  } finally {
    off();
    delete reg.ROUTE_WAITS.later;
  }
});
