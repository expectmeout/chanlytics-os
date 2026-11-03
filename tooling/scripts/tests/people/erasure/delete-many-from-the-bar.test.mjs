/**
 * People's Delete for a selection (bulk/delete-many.tsx), drawn on the stub React: an owner's menu on the desk's bar
 * (Not a person…, Delete…) and two rows of the phone's More; its sheet names who goes and asks the count typed, Not a
 * person saying in one line what it does beside the delete; a press sends the batch through POST contacts/erase and says
 * what it did, keeping selected whoever it could not delete or had no time for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { installLegacyReact, fresh, again, byTestId, find, textOf } from "../../_legacy-react.mjs";
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

/** The desk bar's Delete menu (the kit's Menu), named by its hover words. */
const menuOf = (tree) =>
  find(tree, (n) => n.props?.label === DELETE_MANY_WORDS.hover && Array.isArray(n.props?.groups));
/** Its two acts, by their words. */
const chooseIn = (tree, words) =>
  menuOf(tree)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === words)
    .onSelect();
/** The kit Sheet as the bar hands it its props: its `testid`, not the `data-testid` it draws. */
const sheetOf = (tree) => find(tree, (n) => n.props?.testid === "bulk-delete-sheet");
/** The bar once its sheet's chunk is in: the sheet is a chunk of its own, asked for as the owner's bar is drawn. */
const sheetIn = async (b) => {
  await until(() => sheetOf(b.redraw()), "the sheet's chunk");
  return b.redraw();
};

test("Delete is the owner's, on People's bar: Not a person… then Delete…; an operator and the Pipeline's bar have none", () => {
  const owner = bar("owner").tree;
  assert.deepEqual(
    menuOf(owner).props.groups.flatMap((g) => g.items.map((i) => [i.label, i.tone ?? null])),
    [
      [DELETE_MANY_WORDS.notAPerson, null],
      [DELETE_MANY_WORDS.delete, "danger"],
    ],
  );
  assert.equal(menuOf(bar("operator").tree), null, "an operator's");
  assert.equal(
    menuOf(bar("owner", { acts: ["lists", "export"] }).tree),
    null,
    "a page that keeps fewer of People's acts",
  );
});

test("Delete…'s sheet is its title, who goes, and the count typed: nothing more", async () => {
  const b = bar("owner");
  assert.equal(sheetOf(await sheetIn(b)).props.open, false, "closed until pressed");
  chooseIn(b.redraw(), DELETE_MANY_WORDS.delete);
  const tree = b.redraw();
  const sheet = sheetOf(tree);
  assert.equal(sheet.props.open, true);
  assert.equal(sheet.props.title, DELETE_MANY_WORDS.title(3, false));
  assert.equal(sheet.props.sub, "Alerts, Billing, Pitches", "who goes, under the title");
  assert.equal(byTestId(tree, "bulk-delete-mail-out"), null, "no line of its own");
  const ask = sheet.props.foot.props;
  assert.equal(ask.typed, "3", "the count is what is typed");
  assert.equal(ask.question, DELETE_MANY_WORDS.typed(3));
  assert.equal(ask.yes, DELETE_MANY_WORDS.yes(3));
  assert.equal(ask.danger, true);
});

test("Not a person… sends the batch with its address said, says what it did, and keeps selected whoever it could not delete or had no time for", async () => {
  const b = bar("owner");
  await sheetIn(b);
  chooseIn(b.redraw(), DELETE_MANY_WORDS.notAPerson);
  let tree = b.redraw();
  assert.equal(sheetOf(tree).props.title, DELETE_MANY_WORDS.title(3, true));
  assert.equal(textOf(byTestId(tree, "bulk-delete-mail-out")), DELETE_MANY_WORDS.mailOut, "its one line");
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
    "1 person deleted · 1 not deleted — Could not delete them. · 1 still selected — press Delete again",
  );
  assert.deepEqual(b.seen.kept, ["p2", "p3"], "who could not go, and who it had no time for");
  assert.equal(sheetOf(b.redraw()).props.open, false, "the question is closed");
});

test("the phone's More holds Not a person… and Delete… for an owner, and nobody else's does", () => {
  const owner = bar("owner", { phone: true, sheet: "more" }).tree;
  assert.ok(byTestId(owner, "bulk-not-a-person") && byTestId(owner, "bulk-delete"), "two rows of More");
  const operator = bar("operator", { phone: true, sheet: "more" }).tree;
  assert.equal(byTestId(operator, "bulk-delete"), null);
  assert.equal(byTestId(operator, "bulk-not-a-person"), null);
});
