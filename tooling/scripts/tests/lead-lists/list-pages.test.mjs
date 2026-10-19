/**
 * A list of your own, drawn (Reach out Part 7: J4, J5, J7, J12; surfaces/leads/reach-out/lists.tsx, TSX since decision 0015
 * step 9), on the stub React over the bridge's own words (surfaces/campaigns/reach-out/surface.ts over contracts
 * lead-import.ts). The import door is the only thing stubbed, so what is proved is what each piece draws and what it
 * asks of the bridge: the import sheet reads pasted rows, says what it read, and hands the door the rows it can take;
 * the rail's foot carries *Import leads*. *Write to them* went with the composer (the lead-to-sequence canvas, 18 Oct
 * 2026): the bulk bar's Add is the one road, proved in leads/finder/leads-honest.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
const S = "../../../../apps/dashboard/src/surfaces";
const bridge = await import(`${S}/campaigns/reach-out/surface.ts`);
const { LeadImportSheet, useLeadLists } =
  await import("../../../../apps/dashboard/src/surfaces/leads/reach-out/lists.tsx");
const { LeadsRailRows } = await import(`${S}/leads/scope/rail.tsx`);
// What the sheets are drawn with, imported as the page imports them: a node is found by its type.
const { RecordSheet } = await import(`${S}/kit/record/sheet.tsx`);
const { FieldError } = await import(`${S}/kit/field-error/field-error.tsx`);

const flashed = [];
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  __clock: { zone: () => "America/Chicago" },
});
const IMPORTED = {
  search_id: "s-list",
  round_id: "r-list",
  added: 2,
  checking: 2,
  counted: 1,
  left_out: { unreadable: 0, twice: 0, customer: 1, never_again: 0 },
};
/** The bridge, its import door stubbed: each ask recorded. */
const world = ({ imported = { ok: true, data: IMPORTED } } = {}) => {
  const asked = [];
  flashed.length = 0;
  // The page reads the door off the bridge's own object (reachOuts.lists) as it draws: it is replaced in place.
  Object.assign(bridge.reachOuts.lists, {
    importLeads: async (body) => (asked.push(["import", body]), imported),
  });
  return asked;
};

const CSV = [
  "Business,Email,Website,City,State",
  "Zilker Kettlebell Club,hello@zilker.example,https://www.zilker.example/about,Austin,Texas",
  "Barton Springs Barre,studio@barre.example,,Austin,TX",
  "No Address Gym,,,Austin,TX",
  "Riverside Rowing,row@riverside.example,riverside.example,Austin,tx",
].join("\n");

test("the import sheet reads pasted rows, says what it read, and hands the door only the rows it can take", async () => {
  const asked = world();
  const done = [];
  fresh();
  const draw = () =>
    W.React.createElement(LeadImportSheet, {
      onClose: () => {},
      onDone: (id) => done.push(id),
      flash: (m) => flashed.push(m),
    });
  let tree = again(draw);
  const sheet = () => all(tree, (n) => n.type === RecordSheet)[0];
  assert.equal(sheet().props.onSave, null, "nothing to save before anything is read");
  byTestId(tree, "lead-import-paste").props.onChange({ target: { value: CSV } });
  tree = again(draw);
  press(byTestId(tree, "lead-import-read"));
  tree = again(draw);
  assert.equal(textOf(byTestId(tree, "lead-import-counts")), "4 rows · 3 with a name and an email · 1 without");
  assert.match(
    textOf(byTestId(tree, "lead-import-columns")),
    /^Columns: business “Business”, email “Email”, phone not found, website “Website”\./,
  );
  assert.match(
    byTestId(tree, "lead-import-name").props.value,
    /^Imported on [A-Z][a-z]{2} \d{1,2}$/,
    "the day names a pasted list",
  );
  byTestId(tree, "lead-import-name").props.onChange({ target: { value: "Expo gyms" } });
  byTestId(tree, "lead-import-asked").props.onChange({ target: { value: "gyms I met at the expo" } });
  tree = again(draw);
  assert.equal(sheet().props.saveLabel, "Import 3 and check their addresses · about 1¢");
  await sheet().props.onSave();
  assert.deepEqual(asked, [
    [
      "import",
      {
        name: "Expo gyms",
        asked: "gyms I met at the expo",
        rows: [
          {
            name: "Zilker Kettlebell Club",
            email: "hello@zilker.example",
            phone: null,
            website_host: "zilker.example",
            city: "Austin",
            region: "TX",
            category: null,
          },
          {
            name: "Barton Springs Barre",
            email: "studio@barre.example",
            phone: null,
            website_host: null,
            city: "Austin",
            region: "TX",
            category: null,
          },
          {
            name: "Riverside Rowing",
            email: "row@riverside.example",
            phone: null,
            website_host: "riverside.example",
            city: "Austin",
            region: "TX",
            category: null,
          },
        ],
      },
    ],
  ]);
  tree = again(draw);
  assert.equal(
    textOf(byTestId(tree, "lead-import-summary")),
    "3 businesses on the list" +
      "Checking 2 addresses now: each one that checks out joins Ready, usually within a few minutes." +
      "1 lead already counted joined as it is." +
      "Left out: 1 without a name or an address, 1 already in People.",
  );
  assert.deepEqual(done, ["s-list"], "the page lands on the list");
});

test("an import the door refuses says so by the Save, and a file over the limit is never sent", async () => {
  const asked = world({ imported: { ok: false, message: "This month's 500 leads are used." } });
  fresh();
  const draw = () => W.React.createElement(LeadImportSheet, { onClose: () => {} });
  let tree = again(draw);
  byTestId(tree, "lead-import-paste").props.onChange({ target: { value: CSV } });
  tree = again(draw);
  press(byTestId(tree, "lead-import-read"));
  tree = again(draw);
  await all(tree, (n) => n.type === RecordSheet)[0].props.onSave();
  tree = again(draw);
  // Said in the sheet's foot, by the Save.
  const problem = all(all(tree, (n) => n.type === RecordSheet)[0].props.foot, (n) => n.type === FieldError)[0];
  assert.equal(problem.props.message, "This month's 500 leads are used.");
  assert.equal(asked.length, 1);

  world();
  fresh();
  let big = again(draw);
  const rows = ["Business,Email", ...Array.from({ length: 501 }, (_, i) => `Gym ${i},gym${i}@example.com`)].join("\n");
  byTestId(big, "lead-import-paste").props.onChange({ target: { value: rows } });
  big = again(draw);
  press(byTestId(big, "lead-import-read"));
  big = again(draw);
  const sheet = all(big, (n) => n.type === RecordSheet)[0];
  assert.equal(sheet.props.onSave, null, "501 rows: no Save");
  assert.equal(
    all(sheet.props.foot, (n) => n.type === FieldError)[0].props.message,
    contracts.LEAD_IMPORT_WORDS.tooMany,
  );
});

test("REGRESSION (G:1): a file past the sheet's size is refused before it is read, and a file that cannot be read says so", () => {
  // The browser's reader, as far as the sheet uses it: each read recorded, and its answer given when the test says.
  const readers = [];
  W.FileReader = class {
    readAsText(f) {
      this.file = f;
      readers.push(this);
    }
  };
  try {
    world();
    fresh();
    const draw = () => W.React.createElement(LeadImportSheet, { onClose: () => {} });
    const problem = (tree) =>
      all(all(tree, (n) => n.type === RecordSheet)[0].props.foot, (n) => n.type === FieldError)[0]?.props.message;
    let tree = again(draw);
    const choose = (file) => byTestId(tree, "lead-import-file").props.onChange({ target: { files: [file] } });
    choose({ name: "export.csv", size: contracts.LEAD_IMPORT_MAX_BYTES + 1 });
    tree = again(draw);
    assert.equal(
      readers.length,
      0,
      "REGRESSION: a file of tens of megabytes was read and parsed whole, freezing the tab",
    );
    assert.equal(problem(tree), contracts.LEAD_IMPORT_WORDS.tooBig);

    choose({ name: "gyms.csv", size: 2_048 });
    assert.equal(readers.length, 1, "a file of a list's size is read");
    readers[0].onerror();
    tree = again(draw);
    assert.equal(problem(tree), contracts.LEAD_IMPORT_WORDS.unreadable, "REGRESSION: a failed read said nothing");

    choose({ name: "gyms.csv", size: 2_048 });
    readers[1].result = CSV;
    readers[1].onload();
    tree = again(draw);
    assert.equal(problem(tree), undefined, "read again: the rows, and no word of the failure");
    assert.equal(all(tree, (n) => n.type === RecordSheet)[0].props.onSave !== null, true);
  } finally {
    delete W.FileReader;
  }
});

/** The page's hook, drawn in a component of its own; its node is what it draws. */
const hooked = () => {
  let got;
  const draw = () =>
    W.React.createElement(() => {
      got = useLeadLists({ flash: (m) => flashed.push(m) });
      return got.node;
    });
  fresh();
  again(draw);
  return { got: () => got, draw: () => again(draw) };
};

test("the rail's foot carries Import leads, which opens the sheet", () => {
  world();
  const h = hooked();
  const door = h.got().importDoor;
  const rail = LeadsRailRows({
    rail: { lists: [], searches: [] },
    list: "all",
    searchId: null,
    canFind: true,
    wordsFor: () => ({ askedLine: "", keepsLine: "" }),
    onPickList: () => {},
    onPickSearch: () => {},
    exportFor: () => () => {},
    onNew: () => {},
    importDoor: door,
  });
  assert.ok(byTestId(rail, "leads-import"), "beside New search");
  assert.equal(textOf(byTestId(rail, "leads-import")).trim(), "Import leads");
  press(door);
  const tree = h.draw();
  assert.ok(all(tree, (n) => n.type === RecordSheet && n.props.testid === "lead-import-sheet").length === 1);
});
