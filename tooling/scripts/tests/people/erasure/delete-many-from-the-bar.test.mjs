/**
 * People's Delete… for a selection (bulk/delete-many.tsx), drawn on the stub React: an owner's act on the bar, desk and
 * phone; its sheet names who goes, offers Not a person, and asks the count typed; a press sends the batch through
 * POST contacts/erase and says what it did, keeping selected whoever it could not delete or had no time for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { installLegacyReact, fresh, again, byTestId, find, press, textOf } from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";

installLegacyReact();
const W = globalThis;
const { PeopleBulkBar } = await importSrc("apps/dashboard/src/surfaces/people/bulk/bulk-bar.tsx");
const { DELETE_MANY_WORDS } = await importSrc("apps/dashboard/src/surfaces/people/bulk/delete-many.tsx");

const row = (id, name) => ({ id, name, phone: null, email: `${id}@notice.example.com` });
const ROWS = [row("p1", "Alerts"), row("p2", "Billing"), row("p3", "Pitches")];

/** The bar for a member of this rung, with what it hands its page kept. */
function bar(rung, over = {}) {
  W.mayAtLeast = (asked) => (rung === "owner" ? true : asked !== "owner");
  const seen = { toasts: [], kept: null, cleared: 0 };
  const draw = () =>
    PeopleBulkBar({
      sel: new Set(ROWS.map((r) => r.id)),
      rows: ROWS,
      saved: [],
      canEdit: true,
      canExport: true,
      onClear: () => seen.cleared++,
      onKeep: (ids) => (seen.kept = ids),
      flash: (t) => seen.toasts.push(t),
      ...over,
    });
  fresh();
  return { tree: again(draw), redraw: () => again(draw), seen };
}

/** The kit Sheet as the bar hands it its props: its `testid`, not the `data-testid` it draws. */
const sheetOf = (tree) => find(tree, (n) => n.props?.testid === "bulk-delete-sheet");

test("Delete… is the owner's, on People's bar; an operator and the Pipeline's bar have none", () => {
  assert.ok(byTestId(bar("owner").tree, "bulk-delete"), "an owner's desk bar");
  assert.equal(byTestId(bar("operator").tree, "bulk-delete"), null, "an operator's");
  assert.equal(
    byTestId(bar("owner", { acts: ["lists", "export"] }).tree, "bulk-delete"),
    null,
    "a page that keeps fewer of People's acts",
  );
});

test("its sheet names who goes, offers Not a person, and asks the count typed before it deletes", () => {
  const b = bar("owner");
  assert.equal(sheetOf(b.tree).props.open, false, "closed until pressed");
  press(byTestId(b.tree, "bulk-delete"));
  const tree = b.redraw();
  const sheet = sheetOf(tree);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.title, DELETE_MANY_WORDS.title(3));
  assert.equal(textOf(byTestId(tree, "bulk-delete-who")), "Alerts, Billing, Pitches.");
  assert.ok(byTestId(tree, "bulk-delete-not-a-person"), "the person page's switch, for the selection");
  const ask = sheet.props.foot.props;
  assert.equal(ask.typed, "3", "the count is what is typed");
  assert.equal(ask.question, DELETE_MANY_WORDS.typed(3));
  assert.equal(ask.yes, DELETE_MANY_WORDS.yes(3));
  assert.equal(ask.danger, true);
});

test("a press sends the batch, says what it did, and keeps selected whoever it could not delete or had no time for", async () => {
  const b = bar("owner");
  press(byTestId(b.tree, "bulk-delete"));
  let tree = b.redraw();
  find(tree, (n) => n.props?.["data-testid"] === "bulk-delete-not-a-person").props.onCheckedChange(true);
  tree = b.redraw();
  sheetOf(tree).props.foot.props.onType("3");
  tree = b.redraw();
  const sent = [];
  const was = W.fetch;
  W.fetch = async (url, init = {}) => {
    sent.push([init.method, new URL(String(url), "https://app.example").pathname, JSON.parse(init.body)]);
    const data = {
      erased: ["p1"],
      failed: [{ id: "p2", message: "Could not delete them." }],
      skipped: [],
      left: ["p3"],
    };
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    sheetOf(tree).props.foot.props.onYes();
    // The bar says what it did once the bridge has read its refresh map for the write: a wait for the toast itself.
    await until(() => b.seen.toasts.length > 0, "the press's toast");
  } finally {
    W.fetch = was;
  }
  assert.deepEqual(sent, [["POST", "/api/v1/contacts/erase", { ids: ["p1", "p2", "p3"], not_a_person: true }]]);
  assert.equal(b.seen.toasts.length, 1);
  assert.equal(b.seen.toasts[0].tone, "danger", "someone was not deleted");
  assert.equal(
    textOf(b.seen.toasts[0].msg),
    "1 person deleted: their mail stays in your mailbox · 1 not deleted — Could not delete them. · 1 still selected — press Delete again",
  );
  assert.deepEqual(b.seen.kept, ["p2", "p3"], "who could not go, and who it had no time for");
  assert.equal(sheetOf(b.redraw()).props.open, false, "the question is closed");
});

test("the phone's More holds Delete… for an owner, and nobody else's does", () => {
  const owner = bar("owner", { phone: true, sheet: "more" });
  assert.ok(byTestId(owner.tree, "bulk-delete"), "a row of More");
  const operator = bar("operator", { phone: true, sheet: "more" });
  assert.equal(byTestId(operator.tree, "bulk-delete"), null);
});
