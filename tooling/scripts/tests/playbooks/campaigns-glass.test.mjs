/**
 * Campaigns in Glass, the one look (the interface kit's step 5.4, the Campaigns canvas C1 and C2; Classic retired on 2 October
 * 2026): the composer stands as rows (the word at the left, the section at the right). Drawn on the stub React: the Broadcasts
 * send screen, which Campaigns' sheet hosts (home/sheets.tsx). The playbook composer went with its Every time (the
 * closed-loop audit of 17 Oct 2026, G).
 *
 * What a look changes by token is not here (the gallery and the harness's shots show it); this holds the few pieces of
 * markup the look draws, and that each section keeps the testids the tests and specs reach it by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh as freshTree, again, all, find, byTestId } from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = new Date("2026-09-28T18:00:00.000Z");

installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The shell's own components the pages draw by name (PolicyChip, Confirm, the record kit's sheet): the frame's JSX.
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
const { BroadcastSend } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

const within = (tree, id, inner) => {
  const outer = byTestId(tree, id);
  return !!outer && !!find(outer, (n) => n.props?.["data-testid"] === inner);
};

test("the broadcast composer is one sentence in one pane: what, to whom, by which channels and when, who hears it under it, the message, and when it goes", () => {
  const open = () => {
    setSurfaceValue("broadcasts", broadcastsSample(NOW));
    freshTree();
    // The screen as New's Send once hosts it (the Campaigns wiring review's lane 6), over the sample's runs.
    const props = { data: broadcastsSample(NOW), flash() {}, onDone() {}, onYes() {} };
    const page = () => again(() => BroadcastSend(props));
    page();
    return page();
  };
  const glass = open();
  assert.equal(all(glass, (n) => String(n.props?.className || "") === "bc-grow").length, 0, "no rows");
  const recipe = byTestId(glass, "bc-recipe");
  assert.ok(within(glass, "bc-composer", "bc-recipe"), "the sentence, in the pane");
  // Its words are the kit's pickers: the list and the time; the channels a word that opens their list.
  for (const id of ["bc-audience", "bc-when-mode"]) assert.ok(byTestId(recipe, id), `${id} is a word of the sentence`);
  assert.ok(byTestId(recipe, "bc-via"), "and the channels");
  assert.ok(within(glass, "bc-composer", "bc-col-what"), "the message keeps its testid");
  assert.ok(within(glass, "bc-col-what", "bc-preview"), "and holds the preview");
  assert.ok(within(glass, "bc-composer", "bc-when-note"), "when it goes, under the message");
  assert.ok(String(byTestId(glass, "bc-composer").props.className).includes("bc-glass"));
  assert.ok(byTestId(glass, "bc-send") && byTestId(glass, "bc-compose-close"), "the foot and Cancel are the same");
});
