/**
 * Campaigns' sheets over Sequences (decision 0060, S6: home/sheets.tsx): the home's own page went, and the sheets it opened
 * stay at their addresses. Drawn on the stub React over the surfaces the seam hands it, in the real surfaces' shape (the
 * Broadcasts sample). What is proved: nothing is drawn while the address names no sheet; the composer stands at its
 * addresses (Send once, Write to leads, a list's send) with its choice of kind replacing the address; the addresses of its
 * Every time, which went (the closed-loop audit of 17 Oct 2026, G), open no sheet here, since they land on New sequence
 * before the page is drawn; a read it is made of that has not landed, or failed, is said in the sheet; and the sheet hands
 * the send screen its own toast host.
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
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { WriteToLeads } = await import(`${SRC}/surfaces/campaigns/reach-out/sources.tsx`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { Segmented } = await import(`${SRC}/surfaces/kit/segmented/segmented.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { BroadcastSend } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const status = await import(`${SRC}/legacy-bridge/surface-status.ts`);

/** The surfaces the composer is made of: the broadcasts as the sample makes them, read, and the settings read. */
function surfaces() {
  const now = new Date(NOW);
  const bc = broadcastsSample(now);
  setSurfaceValue("broadcasts", { ...bc, reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 0 } });
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
const page = (param = null) => again(() => CampaignsSheets({ param }));
const sheet = (tree) => find(tree, (n) => n.type === PaneSheet);

test("nothing stands over Sequences while the address names no sheet: its list, a record, a word it does not know, and the composer's Every time that went", () => {
  surfaces();
  for (const param of [
    null,
    "sequences",
    "sequences/pb-sample-winback/history",
    "surprise",
    // Each lands on New sequence, on its moment, or on the sequence being changed (contracts sequenceLandingOf).
    "new:every",
    "new:moment:visited",
    "new:edit:pb-sample-winback",
  ]) {
    fresh();
    assert.equal(sheet(page(param)), null, String(param));
  }
});

test("the composer stands at its addresses: Send once and Write to leads, a choice of kind replacing the address", () => {
  surfaces();
  fresh();
  const once = page("new");
  const s = sheet(once);
  assert.equal(s.props.title, "New message");
  assert.equal(s.props.askFirst, true, "the sheet's close asks where the composer asks");
  const seg = find(s.props.tools, (n) => n.type === Segmented);
  assert.equal(seg.props.value, "once");
  assert.deepEqual(
    seg.props.options.map((o) => [o.value, o.label]),
    [
      ["once", "Send once"],
      ["leads", "Write to leads"],
    ],
    "a moment's sequence is made in New sequence, not here",
  );
  seg.props.onValueChange("leads");
  assert.deepEqual(replaced, ["campaigns/new:leads"], "a choice of kind replaces the address, never pushes");
  fresh();
  const leads = page("new:leads");
  assert.equal(find(sheet(leads).props.tools, (n) => n.type === Segmented).props.value, "leads");
  assert.ok(
    find(leads, (n) => n.type === WriteToLeads),
    "the reach-out's sources, read when it is chosen",
  );
  assert.equal(
    find(leads, (n) => n.type === BroadcastSend),
    null,
    "and no send screen",
  );
  seg.props.onValueChange("once");
  assert.deepEqual(replaced, ["campaigns/new"]);
});

test("Send once says it is reading rather than draw a sheet with nothing in it; Write to leads needs no such read", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  fresh();
  const send = page("new");
  assert.ok(byTestId(send, "cmh-composer-reading"), "Send once: reading, in the sheet");
  assert.equal(find(send, (n) => n.type === Segmented).props.value, "once", "the choice of kind is still at its head");
  assert.equal(
    find(send, (n) => n.type === BroadcastSend),
    null,
    "and no half of a send screen",
  );
  fresh();
  assert.ok(find(page("new:leads"), (n) => n.type === WriteToLeads));
});

test("a broadcasts read that failed is said in Send once, with a Retry that reads the broadcasts again", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  status.setStatus("broadcasts", "seeded");
  try {
    fresh();
    refreshed.length = 0;
    const send = page("new");
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

test("a link that names a list opens the composer on it: campaigns/new:to:<list> hosts the send screen on that audience", () => {
  surfaces();
  fresh();
  const tree = page("new:to:s-sample-regulars");
  const audience = (t) => find(t, (n) => n.type === Picker && n.props["data-testid"] === "bc-audience");
  assert.equal(audience(tree).props.value, "saved:s-sample-regulars", "the send opens on the list it was asked for");
  assert.equal(find(tree, (n) => n.type === BroadcastSend).props.initialSegment, "s-sample-regulars");
  assert.equal(find(sheet(tree).props.tools, (n) => n.type === Segmented).props.value, "once", "it is Send once");
  for (const [param, to] of [
    ["new:to:s-1", "s-1"],
    ["new:to:", null],
    ["new", null],
  ]) {
    fresh();
    surfaces();
    assert.equal(find(page(param), (n) => n.type === BroadcastSend).props.initialSegment, to, param);
  }
});

test("the send screen is handed the sheets' own toast host, so a toast it raises outlives the sheet (campaigns-drafts.test.mjs)", () => {
  surfaces();
  fresh();
  const send = find(page("new"), (n) => n.type === BroadcastSend);
  assert.equal(typeof send.props.flash, "function");
  assert.equal(typeof send.props.onDone, "function", "and closes the sheet once the send is made");
});
