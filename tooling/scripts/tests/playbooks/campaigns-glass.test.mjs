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
  assert.ok(
    textOf(said.sentence).includes("What goes out on its own as a customer reaches a moment"),
    "the line is the page's own, said to the frame",
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

test("the playbook composer: five rows, To, Says, Send by, When and Under, each holding its section", () => {
  const glass = composing();
  const rows = ["pb-row-to", "pb-row-says", "pb-row-via", "pb-row-when", "pb-row-under"].map((id) =>
    byTestId(glass, id),
  );
  assert.ok(
    rows.every((r) => r),
    "the five rows",
  );
  assert.deepEqual(rows.map(wordOf), ["To", "Says", "Send by", "When", "Under"]);
  assert.ok(within(glass, "pb-row-to", "pb-who"), "To holds who it is for");
  assert.ok(within(glass, "pb-row-says", "pb-message"), "Says holds the message");
  assert.ok(within(glass, "pb-row-via", "pb-via-sec"), "Send by holds the channels it goes by");
  assert.ok(within(glass, "pb-row-when", "pb-clock"), "When holds the sentence of its numbers");
  assert.ok(within(glass, "pb-row-under", "pb-guard"), "Under holds the guardrails");
  assert.ok(
    within(glass, "pb-row-under", "pb-runs-under") || byTestId(glass, "pb-runs-under") === null,
    "and the row it runs under",
  );
  assert.equal(
    all(glass, (n) => n.type === Picker && n.props["data-testid"] === "pb-hour").length,
    1,
    "the hour is chosen where it was, once: the kit's Picker in the When row's sentence",
  );
  assert.ok(!textOf(glass).includes("One approved message"), "no explanation under the title");
  for (const id of ["pb-save", "pb-cancel"]) assert.ok(byTestId(glass, id), `the foot keeps ${id}`);
});

test("the broadcast composer: the rows To, Says, Send by, When in one pane", () => {
  const open = () => {
    setSurfaceValue("broadcasts", broadcastsSample(NOW));
    freshTree();
    const page = (props = {}) => again(() => BroadcastsPage(props));
    // The screen opens as the page still opens it, on a link that names a list: the home's New message hosts the same screen.
    page({ initialSegment: "no-such-list" });
    return page();
  };
  const glass = open();
  const rows = all(glass, (n) => String(n.props?.className || "") === "bc-grow");
  // Send by is the row between Says and When (One message, every channel, step 3).
  assert.deepEqual(rows.map(wordOf), ["To", "Says", "Send by", "When"]);
  assert.ok(within(glass, "bc-composer", "bc-col-who") && within(glass, "bc-composer", "bc-col-what"));
  assert.ok(within(glass, "bc-composer", "bc-col-when"), "each column keeps its testid");
  assert.ok(within(glass, "bc-composer", "bc-col-via"), "Send by keeps its testid");
  // Each holds its sentence of tokens (the kit's pickers).
  for (const [col, id] of [
    ["bc-col-who", "bc-audience"],
    ["bc-col-what", "bc-preview"],
    ["bc-col-when", "bc-when-mode"],
  ])
    assert.ok(within(glass, col, id), `${col} holds ${id}`);
  assert.ok(String(byTestId(glass, "bc-composer").props.className).includes("bc-glass"));
  assert.ok(byTestId(glass, "bc-send") && byTestId(glass, "bc-compose-close"), "the foot and Cancel are the same");
});
