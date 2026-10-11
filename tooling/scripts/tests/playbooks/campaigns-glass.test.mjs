/**
 * Campaigns in Glass, the one look (the interface kit's step 5.4, the Campaigns canvas C1 and C2; Classic retired on 2 October
 * 2026): the home opens on the surface's title (said to the frame's head, the page drawing none of its own), and the
 * composers stand as rows (the word at the left, the section at the right). Drawn on the stub React: the home
 * (campaigns/home/home-page.tsx), the playbook composer on its own as the home's sheet hosts it, and the Broadcasts send
 * screen.
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
const { CampaignsHome } = await import(`${SRC}/surfaces/campaigns/home/home-page.tsx`);
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { standingSaid } = await import(`${SRC}/surfaces/kit/head/standing.ts`);

const within = (tree, id, inner) => {
  const outer = byTestId(tree, id);
  return !!outer && !!find(outer, (n) => n.props?.["data-testid"] === inner);
};
const wordOf = (row) => textOf(find(row, (n) => String(n.props?.className || "").includes("-grow-word")));

/** Campaigns' home over the two surfaces it is made from (the samples a demo draws), the month said as the test gives it. */
const homeOf = (over = {}) => {
  setSurfaceValue("playbooks", { ...playbooksSample(NOW), ...(over.playbooks ?? {}) });
  setSurfaceValue("broadcasts", { ...broadcastsSample(NOW), ...(over.broadcasts ?? {}) });
  freshTree();
  return again(() => CampaignsHome({ param: null, nowMs: NOW.getTime() }));
};

/** The playbook composer, as the home's sheet draws it: on the first moment nothing is doing yet. */
const composing = () => {
  const data = playbooksSample(NOW);
  setSurfaceValue("playbooks", data);
  freshTree();
  return again(() => PlaybookComposer({ data, editing: null, initialTrigger: null, onDone() {}, onCancel() {} }));
};

test("the head: the page says the surface's title to the frame's head and draws none of its own", () => {
  const draw = () => homeOf();
  const h1 = () => find(draw(), (n) => n.type === "h1");
  const tree = draw();
  assert.equal(h1(), null, "the page draws no head of its own; the frame's is the head");
  assert.equal(
    find(tree, (n) => String(n.props?.className || "").includes("cm-head")),
    null,
    "and no cm-head either",
  );
  const said = standingSaid();
  assert.equal(said?.title, "Campaigns", "the surface's name");
  assert.equal(said?.back, null, "the home has no way back above its name");
  assert.ok(said?.sentence, "and the head's line beside it");
  // Facts alone since 8 Oct 2026: the moments covered and who can hear. Where the workspace stands on its channels is at
  // the rail's head, where it is seen: this line is a screen reader's under Glass, and a door in it is a link no one sees.
  assert.ok(textOf(said.sentence).includes("moments are covered"), "the line is the page's own, said to the frame");
  assert.ok(
    !textOf(said.sentence).includes("Sending on WhatsApp"),
    "the channels' line is not drawn in the frame's head",
  );
  assert.equal(
    find(said.sentence, (n) => n.props?.["data-testid"] === "cmh-channels-door"),
    null,
    "and no door of it either",
  );
  // The page's two acts ride to the row of views: the Library, and New message.
  assert.ok(
    find(said.act, (n) => n.props?.["data-testid"] === "cmh-library"),
    "the Library",
  );
  assert.ok(
    find(said.act, (n) => n.props?.["data-testid"] === "cmh-new"),
    "and New message",
  );
  assert.equal(byTestId(tree, "cmh-new"), null, "which the page does not draw a second time");
});

test("the head says the month's allowance from half used, quietly: one line after the page's own, never a banner; nothing under half, or where the month could not be counted", () => {
  const draw = (month) => homeOf({ playbooks: { month_sent: month }, broadcasts: { month_sent: null } });
  // The head's line is the frame's one sentence: what the page says to it.
  const line = (month) => {
    draw(month);
    return textOf(standingSaid()?.sentence);
  };
  assert.ok(
    line({ email: 1240, sms: 12 }).endsWith("1,240 of 2,000 emails used this month"),
    "after the page's own line, in the same quiet text",
  );
  draw({ email: 1240, sms: 12 });
  assert.equal(
    find(standingSaid()?.sentence, (n) => n.props?.["data-testid"] === "cm-month")?.type,
    "span",
    "a span of the line, not a banner",
  );
  assert.ok(
    line({ email: 2000, sms: 400 }).endsWith(
      "2,000 of 2,000 emails used this month · 400 of 500 texts used this month",
    ),
    "both, emails first",
  );
  for (const month of [{ email: 999, sms: 249 }, null])
    assert.ok(!line(month).includes("this month"), `${JSON.stringify(month)}: nothing said`);
  // The month is read from whichever of the two surfaces has it: the Broadcasts surface's, with the Playbooks' not read.
  homeOf({ playbooks: { month_sent: null }, broadcasts: { month_sent: { email: 100, sms: 300 } } });
  assert.ok(textOf(standingSaid()?.sentence).includes("300 of 500 texts used this month"));
});

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
