/**
 * Campaigns' code that no page's first load carries (home/campaigns-code.tsx): a message's pane is a chunk of its own, so a
 * move to Campaigns no longer waits for it at its press (local production builds, 19 Oct 2026: the page's own JS 169,514 ->
 * 1,285 bytes gzipped, the list drawn in 65-108 ms on a desk). What is proved, on the stub React: the pane says it is
 * reading while its chunk is out, then is the pane. (Messages, the Library's page, was a chunk too until it folded into
 * Campaigns, 17 Nov 2026.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installStubReact, fresh, again, byTestId } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds, holdFrameParts } from "../../shell/_bridge-holds.mjs";

const TID = "t-studio";
bridgeHolds({
  who: {
    workspaces: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
    activeWorkspaceId: TID,
  },
});
installStubReact({
  location: {
    pathname: "/w/studio/campaigns/new",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, back() {} },
});
const SRC = "../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/bridge/zone.ts`);
installClock();
holdFrameParts();
bridgeHolds({ who: { me: { role: "owner" } }, parts: { chrome: { state: contracts.stateOf } } });
Object.assign(globalThis, {
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
bridgeHolds({ parts: { toast: () => [null, () => {}] } });
const { MessageInPlaceWhenRead } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);

test("a message's pane says it is reading while its chunk is out, then is the pane", async () => {
  fresh();
  const draw = () =>
    again(() => globalThis.React.createElement(MessageInPlaceWhenRead, { name: "win_back", flash() {}, onClose() {} }));
  assert.ok(byTestId(draw(), "cmh-pane-reading"), "the shell's quiet words, while the chunk is out");
  // The chunk is the page's own import(), which tsx's loader answers in its own time: drawn again until it is in.
  await until(() => byTestId(draw(), "cmh-pane-reading") === null, "the pane, once its chunk is in");
  const tree = draw();
  assert.equal(byTestId(tree, "cmh-pane-reading"), null, "the pane, once its chunk is in");
  assert.equal(byTestId(tree, "cmh-pane-failed"), null);
});
