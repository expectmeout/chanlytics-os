/**
 * Campaigns' code that no page's first load carries (home/campaigns-code.tsx): the Library's pane and Messages are chunks
 * of their own, so a move to Campaigns no longer waits for them at its press (local production builds, 19 Oct 2026: the
 * page's own JS 169,514 -> 1,285 bytes gzipped, the list drawn in 65-108 ms on a desk). What is proved, on the stub React:
 * the Library's pane says it is reading while its chunk is out, then is the pane; and a message's home is the Library open
 * on it (`campaigns/messages/<name>`, the framework's rating of 19 Oct 2026: its drawer over Sequences went), its address
 * drawing its pane and lighting its row, a name gone said, and a row writing the address as it opens and closes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, press } from "../../_legacy-react.mjs";

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
const { MessageInPlaceWhenRead } = await import(`${SRC}/surfaces/campaigns/home/campaigns-code.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
const { TemplatePane } = await import(`${SRC}/surfaces/campaigns/templates/template-pane.tsx`);
const { MessageRow } = await import(`${SRC}/surfaces/campaigns/templates/message-row.tsx`);
const { nameOfGroup } = await import(`${SRC}/surfaces/campaigns/templates/group.ts`);
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

test("a message's home is the Library open on it: its address draws its pane and lights its row, a name gone is said, and a row writes the address as it opens and closes, replaced", () => {
  fresh();
  const now = new Date(Date.parse("2026-10-03T01:44:00Z"));
  const { templates } = broadcastsSample(now);
  setSurfaceValue("settings", { templatesAll: templates, messages: contracts.campaignMessagesOf(templates) });
  setSurfaceValue("channels", { rows: [] });
  setSurfaceValue("reach_outs", []);
  const moves = [];
  const keep = globalThis.appNavigate;
  globalThis.appNavigate = (route, opts) => moves.push([route, !!opts?.replace]);
  try {
    const draw = (route) => again(() => TemplatesPage({ route }));
    let tree = draw("campaigns/messages/monthly_offer");
    const pane = find(tree, (n) => n.type === TemplatePane);
    assert.ok(pane, "its pane beside the list");
    assert.equal(nameOfGroup(pane.props.g), "monthly_offer");
    const rows = all(tree, (n) => n.type === MessageRow);
    const lit = rows.filter((r) => r.props.open);
    assert.deepEqual(
      lit.map((r) => nameOfGroup(r.props.g)),
      ["monthly_offer"],
      "its row, and only its, is lit",
    );
    // A press on its row closes it: the list's address, replaced, so Back leaves the page.
    lit[0].props.onOpen();
    assert.deepEqual(moves.at(-1), ["campaigns/messages", true]);
    // Another row opens its own message, at its address.
    const other = rows.find((r) => !r.props.open);
    other.props.onOpen();
    assert.deepEqual(moves.at(-1), [contracts.messageRoute(nameOfGroup(other.props.g)), true]);
    // A name the workspace no longer holds says so, with the way back to the list.
    tree = draw("campaigns/messages/no_such_message");
    assert.ok(byTestId(tree, "tpl-message-gone"), "said, never the list's first message in its place");
    press(byTestId(tree, "tpl-message-gone-back"));
    assert.deepEqual(moves.at(-1), ["campaigns/messages", true]);
    // The list's own address opens nothing.
    tree = draw("campaigns/messages");
    assert.equal(
      find(tree, (n) => n.type === TemplatePane),
      null,
    );
  } finally {
    globalThis.appNavigate = keep;
    for (const k of ["settings", "channels", "reach_outs"]) setSurfaceValue(k, undefined);
  }
});
