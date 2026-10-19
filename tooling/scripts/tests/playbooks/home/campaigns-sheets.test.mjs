/**
 * Campaigns' sheet over Sequences (decision 0060, S6: home/sheets.tsx), a message's drawer, and Send once inside the one New
 * (home/new-message.tsx NewOnce, the Campaigns wiring review's lane 6), where the composer's sheet over Sequences went. Drawn
 * on the stub React over the surfaces the seam hands it, in the real surfaces' shape (the Broadcasts sample). What is proved:
 * nothing stands over Sequences while the address names no message, the composer's old addresses among them (they land on
 * New, or on a sequence's record, before the page is drawn); Send once draws the send screen on the audience its address
 * names, with New's who and when over it; a read it is made of that has not landed, or failed, is said in New's own pane;
 * and New hands the send screen the route's toast host and its close.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh as freshTree, again, find, byTestId, textOf, press } from "../../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: tomorrow is Saturday the 3rd. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

const went = [];
const replaced = [];
const toasts = [];
installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns/new",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, back() {} },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
const SRC = "../../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { CampaignsSheets } = await import(`${SRC}/surfaces/campaigns/home/sheets.tsx`);
const { NewOnce } = await import(`${SRC}/surfaces/campaigns/home/new-message.tsx`);
// The sheets and the Library's pane are chunks of their own (campaigns-code.tsx): fetched here as a reach for a message's
// door fetches them, so every draw below finds them in, as a press after that reach does.
const { warmCampaignsCode } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);
warmCampaignsCode("campaigns/message:any");
await import(`${SRC}/surfaces/campaigns/home/open-sheets.tsx`);
await import(`${SRC}/surfaces/campaigns/parts/message-in-place.tsx`);
await new Promise((r) => setTimeout(r, 0));
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { BroadcastSend } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const status = await import(`${SRC}/legacy-bridge/surface-status.ts`);

/**
 * The surfaces the composer is made of: Sent's surface and who each audience reaches (broadcasts/audiences-surface.ts), as the
 * sample makes them, read, and the settings read.
 */
function surfaces() {
  const now = new Date(NOW);
  const { audiences, listsRead, heardRead, reach, ...bc } = broadcastsSample(now);
  setSurfaceValue("broadcasts", bc);
  setSurfaceValue("audiences", {
    audiences,
    listsRead,
    heardRead,
    reach: { ...reach, people: 29, canHear: 7, saidMessages: 7, saidOffers: 0 },
    fetchedAt: bc.fetchedAt,
  });
  setSurfaceValue("settings", { templatesAll: bc.templates, messages: contracts.campaignMessagesOf(bc.templates) });
}

afterEach(() => {
  for (const k of ["broadcasts", "settings"]) setSurfaceValue(k, undefined);
});

const refreshed = [];
globalThis.__refreshSurface = async (key) => {
  refreshed.push(key);
};

const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
};
const page = (param = null) => again(() => CampaignsSheets({ param, flash() {} }));
/** New's own pane, as NewOncePane draws it while the screen cannot be: the body handed, under its testid. */
const PANE = (body) => globalThis.React.createElement("section", { "data-testid": "sq-new" }, body);
const WHO = globalThis.React.createElement("div", { "data-testid": "sq-new-starts" });
/** Send once as New draws it, on the audience its address names: New's who and when over it, its own pane while it reads. */
const once = (to = null, over = {}) =>
  again(() =>
    NewOnce({ to, flash() {}, onDone() {}, onYes: (r) => replaced.push(r), above: WHO, pane: PANE, ...over }),
  );
const sheet = (tree) => find(tree, (n) => n.type === PaneSheet);

test("nothing stands over Sequences while the address names no message: its list, a record, a word it does not know, and every address of the composer, which went into the one New", () => {
  surfaces();
  for (const param of [
    null,
    "sequences",
    "sequences/pb-sample-winback/history",
    "surprise",
    // Each lands on New, for whom it named or on its moment, or on the sequence's record (contracts retiredRouteOf).
    "new",
    "new:to:s-1",
    "new:leads",
    "new:edit:ro-1",
    "new:every",
    "new:moment:visited",
  ]) {
    fresh();
    assert.equal(sheet(page(param)), null, String(param));
  }
});

test("Send once is the send screen inside New, on the audience its address names, with New's who and when over its sentence", () => {
  surfaces();
  fresh();
  const tree = once("s-sample-regulars");
  const send = find(tree, (n) => n.type === BroadcastSend);
  assert.equal(send.props.initialSegment, "s-sample-regulars", "the send opens on the list it was asked for");
  assert.ok(byTestId(tree, "sq-new-starts"), "New's who and when, over the sentence");
  assert.ok(byTestId(tree, "bc-composer"), "the send screen is New's pane: one head, one foot");
  const audience = find(tree, (n) => n.type === Picker && n.props["data-testid"] === "bc-audience");
  assert.equal(audience.props.value, "saved:s-sample-regulars");
  for (const to of ["s-1", null]) {
    fresh();
    surfaces();
    assert.equal(find(once(to), (n) => n.type === BroadcastSend).props.initialSegment, to, String(to));
  }
});

test("Send once says it is reading, in New's own pane, rather than draw a screen with nothing in it", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  fresh();
  const send = once();
  assert.ok(byTestId(send, "sq-new"), "in New's own pane");
  assert.ok(byTestId(send, "cmh-composer-reading"), "Send once: reading");
  assert.equal(
    find(send, (n) => n.type === BroadcastSend),
    null,
    "and no half of a send screen",
  );
  // New is Sequences' address, which opens on its list alone: Send once asks for what it is made of as it is drawn.
  assert.ok(refreshed.includes("broadcasts"), "Sent's runs, asked for");
});

test("a broadcasts read that failed is said in Send once, with a Retry that reads the broadcasts again", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  status.setStatus("broadcasts", "seeded");
  try {
    fresh();
    const send = once();
    refreshed.length = 0;
    const failed = byTestId(send, "cmh-composer-failed");
    assert.ok(failed, "Send once says so");
    assert.match(textOf(failed), /Couldn't read who and what you can send to/);
    assert.match(textOf(failed), /Nothing goes out until it reads\./);
    press(byTestId(send, "cmh-composer-failed-retry"));
    assert.deepEqual(refreshed, ["broadcasts"]);
    assert.equal(byTestId(send, "cmh-composer-reading"), null);
  } finally {
    status.setStatus("broadcasts", "live");
  }
});

test("who each audience reaches is half of what Send once is made of: while it is out Send once is reading, and a read of it that failed is said with a Retry that reads it again", () => {
  surfaces();
  setSurfaceValue("audiences", undefined);
  fresh();
  assert.ok(byTestId(once(), "cmh-composer-reading"), "Sent's runs alone are no send screen: reading");
  status.setStatus("audiences", "seeded");
  try {
    fresh();
    const send = once();
    refreshed.length = 0;
    assert.match(textOf(byTestId(send, "cmh-composer-failed")), /Couldn't read who and what you can send to/);
    press(byTestId(send, "cmh-composer-failed-retry"));
    assert.deepEqual(refreshed, ["audiences"], "its Retry reads the audiences, not Sent's runs, which were read");
  } finally {
    status.setStatus("audiences", "live");
  }
});

test("New hands the send screen the route's toast host and its close, so a toast it raises outlives New (campaigns-drafts.test.mjs)", () => {
  surfaces();
  fresh();
  const said = [];
  let closed = 0;
  const send = find(
    once(null, { flash: (t) => said.push(t), onDone: () => (closed += 1) }),
    (n) => n.type === BroadcastSend,
  );
  send.props.flash({ msg: "Sent" });
  assert.deepEqual(said, [{ msg: "Sent" }], "the host's toast");
  send.props.onDone();
  assert.equal(closed, 1, "and New closes once the send is made");
  send.props.onYes("clients/get-yes");
  assert.deepEqual(replaced, ["clients/get-yes"], "its door to their yes is New's to follow");
});
