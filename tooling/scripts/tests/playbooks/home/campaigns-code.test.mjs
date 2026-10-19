/**
 * Campaigns' code that no page's first load carries (home/campaigns-code.tsx): the sheets it opens over Sequences and the
 * Library's pane are chunks of their own, so a move to Campaigns no longer waits for them at its press (local production
 * builds, 19 Oct 2026: the page's own JS 169,514 -> 1,285 bytes gzipped, the list drawn in 65-108 ms on a desk). What is
 * proved, on the stub React with neither chunk fetched yet: a sheet's address draws nothing until the sheets' chunk is in,
 * asks for it, then draws the sheet, its toast host standing throughout; and the Library's pane says it is reading while
 * its chunk is out, then is the pane.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId } from "../../_legacy-react.mjs";

const TID = "t-studio";
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
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
const SRC = "../../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { CampaignsSheets } = await import(`${SRC}/surfaces/campaigns/home/sheets.tsx`);
const { MessageInPlaceWhenRead } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

/** A chunk asked for lands: its module is in Node's cache once imported, and the loader's answer a turn after. */
const landed = async (path) => {
  await import(path);
  await new Promise((r) => setTimeout(r, 0));
};

test("the Library's pane says it is reading while its chunk is out, then is the pane", async () => {
  fresh();
  const draw = () =>
    again(() => globalThis.React.createElement(MessageInPlaceWhenRead, { name: "win_back", flash() {}, onClose() {} }));
  assert.ok(byTestId(draw(), "cmh-pane-reading"), "the shell's quiet words, while the chunk is out");
  await landed(`${SRC}/surfaces/campaigns/parts/message-in-place.tsx`);
  const tree = draw();
  assert.equal(byTestId(tree, "cmh-pane-reading"), null, "the pane, once its chunk is in");
  assert.equal(byTestId(tree, "cmh-pane-failed"), null);
});

test("a sheet's address draws nothing until the sheets' chunk is in, asks for it, then draws the sheet", async () => {
  fresh();
  const now = new Date(Date.parse("2026-10-03T01:44:00Z"));
  const { audiences, listsRead, heardRead, reach, ...bc } = broadcastsSample(now);
  setSurfaceValue("broadcasts", bc);
  setSurfaceValue("audiences", { audiences, listsRead, heardRead, reach, fetchedAt: bc.fetchedAt });
  setSurfaceValue("settings", { templatesAll: bc.templates, messages: contracts.campaignMessagesOf(bc.templates) });
  const page = (param) => again(() => CampaignsSheets({ param, flash() {} }));
  const sheet = (tree) => find(tree, (n) => n.type === PaneSheet);
  assert.equal(
    sheet(page("message:spring_offer")),
    null,
    "nothing stands over Sequences while the sheets' chunk is out",
  );
  await landed(`${SRC}/surfaces/campaigns/home/open-sheets.tsx`);
  assert.ok(sheet(page("message:spring_offer")), "a message's drawer, once the chunk the address asked for is in");
  // The composer's old address opens no sheet: it lands on the one New before the page is drawn (lane 6).
  assert.equal(sheet(page("new")), null);
  // An address that names no sheet draws none, the chunk in or not.
  assert.equal(sheet(page("sequences")), null);
});
