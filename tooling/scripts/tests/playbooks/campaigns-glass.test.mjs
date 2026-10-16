/**
 * Campaigns in Glass, the one look (the interface kit's step 5.4, the Campaigns canvas C1 and C2; Classic retired on 2 October
 * 2026): the composers stand as rows (the word at the left, the section at the right). Drawn on the stub React: the playbook
 * composer on its own as Campaigns' sheet hosts it (home/sheets.tsx), and the Broadcasts send screen.
 *
 * What a look changes by token is not here (the gallery and the harness's shots show it); this holds the few pieces of
 * markup the look draws, and that each section keeps the testids the tests and specs reach it by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh as freshTree, again, all, find, byTestId, textOf } from "../_legacy-react.mjs";

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
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);

const within = (tree, id, inner) => {
  const outer = byTestId(tree, id);
  return !!outer && !!find(outer, (n) => n.props?.["data-testid"] === inner);
};

/** The playbook composer, as Campaigns' sheet draws it: on the first moment nothing is doing yet. */
const composing = () => {
  const data = playbooksSample(NOW);
  setSurfaceValue("playbooks", data);
  freshTree();
  return again(() => PlaybookComposer({ data, editing: null, initialTrigger: null, onDone() {}, onCancel() {} }));
};

test('the playbook composer is one sentence (Ruben, 11 Oct 2026, "Option B"): its words the hour, the channels and the moment, who it reaches under it, then the message and when it first runs', () => {
  const glass = composing();
  const recipe = byTestId(glass, "pb-recipe");
  assert.ok(recipe, "the sentence");
  for (const id of ["pb-hour", "pb-moment"])
    assert.equal(
      all(recipe, (n) => n.type === Picker && n.props["data-testid"] === id).length,
      1,
      `${id} is a word of it, once: the kit's Picker`,
    );
  assert.ok(byTestId(recipe, "pb-via"), "the channels are a word of it, their list behind it");
  // Down the sheet: the sentence, who it reaches, the message, when it first runs. No row and no word at the left of one.
  const order = ["pb-recipe", "pb-reach", "pb-message", "pb-forecast"].filter((id) => byTestId(glass, id));
  const drawn = all(glass, (n) => order.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  assert.deepEqual([...new Set(drawn)], order);
  assert.equal(all(glass, (n) => String(n.props?.className || "") === "pb-grow").length, 0, "no rows");
  assert.equal(
    byTestId(glass, "pb-guard"),
    null,
    "the guardrails are behind who it reaches, not a shield of their own",
  );
  assert.ok(!textOf(glass).includes("One approved message"), "no explanation under the title");
  for (const id of ["pb-save", "pb-cancel"]) assert.ok(byTestId(glass, id), `the foot keeps ${id}`);
});

test("the broadcast composer is one sentence in one pane: what, to whom, by which channels and when, who hears it under it, the message, and when it goes", () => {
  const open = () => {
    setSurfaceValue("broadcasts", broadcastsSample(NOW));
    freshTree();
    const page = (props = {}) => again(() => BroadcastsPage(props));
    // The screen opens as the page still opens it, on a link that names a list: the home's New message hosts the same screen.
    page({ initialSegment: "no-such-list" });
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
