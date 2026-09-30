/**
 * A list of your own, drawn (Reach out Part 7: J4, J5, J7, J12), on the stub React over the bridge's own words
 * (legacy-bridge/reach-out/reach-outs.ts over contracts lead-import.ts). The two doors are the only things stubbed, so
 * what is proved is what each piece draws and what it asks of the bridge: the import sheet reads pasted rows, says what
 * it read, and hands the door the rows it can take; *Write to them* hands the door the chosen ids, lands the page on
 * the list and opens the reach-out sheet on it, or says the refusal; the rail's foot carries *Import leads*; the bar
 * carries *Write to them* after Copy emails, on a desk and in a phone's sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/pages/reach-out/reach-out-leads.jsx`);
await import(`${L}/pages/leads-scope.jsx`);
const bridge = await import("../../../../apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts");

const went = [];
const flashed = [];
const sheets = [];
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  canDo: () => true,
  gate: () => ({}),
  Icon: () => null,
  FieldError: () => null,
  RecordSheet: (p) => p.children,
  ReachOutSheet: (p) => (sheets.push(p), null),
  PhoneSheetRow: () => null,
  RailSection: (p) => p.children,
  RailRow: () => null,
  RailEmpty: () => null,
  __leadsRouteOf: ({ searchId }) => `clients/leads:s-${searchId}`,
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
/** The bridge, its two doors stubbed: each asked recorded. */
const world = ({ imported = { ok: true, data: IMPORTED }, chosen = null } = {}) => {
  const asked = [];
  went.length = 0;
  flashed.length = 0;
  sheets.length = 0;
  W.__reachOuts = {
    ...bridge.reachOuts,
    lists: {
      ...bridge.reachOuts.lists,
      importLeads: async (body) => (asked.push(["import", body]), imported),
      chooseLeads: async (body) => (asked.push(["choose", body]), chosen),
    },
  };
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
    W.React.createElement(W.LeadImportSheet, {
      onClose: () => {},
      onDone: (id) => done.push(id),
      flash: (m) => flashed.push(m),
    });
  let tree = again(draw);
  const sheet = () => all(tree, (n) => n.type === W.RecordSheet)[0];
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
  const draw = () => W.React.createElement(W.LeadImportSheet, { onClose: () => {} });
  let tree = again(draw);
  byTestId(tree, "lead-import-paste").props.onChange({ target: { value: CSV } });
  tree = again(draw);
  press(byTestId(tree, "lead-import-read"));
  tree = again(draw);
  await all(tree, (n) => n.type === W.RecordSheet)[0].props.onSave();
  tree = again(draw);
  // Said in the sheet's foot, by the Save.
  const problem = all(all(tree, (n) => n.type === W.RecordSheet)[0].props.foot, (n) => n.type === W.FieldError)[0];
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
  const sheet = all(big, (n) => n.type === W.RecordSheet)[0];
  assert.equal(sheet.props.onSave, null, "501 rows: no Save");
  assert.equal(
    all(sheet.props.foot, (n) => n.type === W.FieldError)[0].props.message,
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
    const draw = () => W.React.createElement(W.LeadImportSheet, { onClose: () => {} });
    const problem = (tree) =>
      all(all(tree, (n) => n.type === W.RecordSheet)[0].props.foot, (n) => n.type === W.FieldError)[0]?.props.message;
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
    assert.equal(all(tree, (n) => n.type === W.RecordSheet)[0].props.onSave !== null, true);
  } finally {
    delete W.FileReader;
  }
});

/** The page's hook, drawn in a component of its own; its node is what it draws. */
const hooked = () => {
  let got;
  const draw = () =>
    W.React.createElement(() => {
      got = W.useLeadLists({ flash: (m) => flashed.push(m) });
      return got.node;
    });
  fresh();
  again(draw);
  return { got: () => got, draw: () => again(draw) };
};

test("Write to them hands the door the chosen ids, lands on the list and opens the reach-out sheet on it", async () => {
  const asked = world({
    chosen: {
      ok: true,
      data: { search_id: "chosen1", round_id: "r", counted: 2, left_out: { not_counted: 1, no_email: 0, gone: 0 } },
    },
  });
  const h = hooked();
  assert.equal(h.got().writeAct({ ids: [] }), null, "nothing chosen and shown: no act");
  const act = h.got().writeAct({ ids: ["l1", "l2", "l3"] });
  assert.equal(act.props["data-testid"], "leads-bulk-write");
  press(act);
  await settle();
  const [[kind, body]] = asked;
  assert.equal(kind, "choose");
  assert.deepEqual(body.lead_ids, ["l1", "l2", "l3"]);
  assert.match(body.name, /^Chosen on [A-Z][a-z]{2} \d{1,2}$/);
  assert.deepEqual(went, ["clients/leads:s-chosen1"]);
  assert.equal(textOf(flashed.at(-1).msg), "2 leads on the list. Left out: 1 not yet counted: keep them first.");
  h.draw();
  assert.deepEqual(sheets.at(-1).search, { id: "chosen1", name: body.name }, "the reach-out's sheet opens on the list");
});

test("Write to them refused says the door's words and goes nowhere; on a phone it is a row of the bar's sheet", async () => {
  world({ chosen: { ok: false, message: "None of these can be written to yet." } });
  const h = hooked();
  press(h.got().writeAct({ ids: ["l1"] }));
  await settle();
  assert.deepEqual(went, []);
  assert.deepEqual([flashed.at(-1).tone, textOf(flashed.at(-1).msg)], ["warn", "None of these can be written to yet."]);
  const shut = [];
  const row = h.got().writeAct({ ids: ["l1"], phone: true, shut: () => shut.push(1) });
  assert.equal(row.type, W.PhoneSheetRow);
  assert.equal(row.props.testid, "leads-bulk-write");
});

test("the rail's foot carries Import leads, which opens the sheet", () => {
  world();
  const h = hooked();
  const door = h.got().importDoor;
  const rail = W.LeadsRailRows({
    rail: { lists: [], searches: [] },
    list: "all",
    searchId: null,
    canFind: true,
    wordsFor: () => ({ askedLine: "", keepsLine: "" }),
    onPickList: () => {},
    onPickSearch: () => {},
    hrefFor: () => null,
    onNew: () => {},
    importDoor: door,
  });
  assert.ok(byTestId(rail, "leads-import"), "beside New search");
  assert.equal(textOf(byTestId(rail, "leads-import")).trim(), "Import leads");
  press(door);
  const tree = h.draw();
  assert.ok(all(tree, (n) => n.type === W.RecordSheet && n.props.testid === "lead-import-sheet").length === 1);
});

test("the bulk bar carries Write to them after Copy emails", () => {
  const write = W.React.createElement("button", { "data-testid": "leads-bulk-write" }, "Write to them");
  const bar = W.LeadsBulkBar({
    sel: new Set(["l1"]),
    rows: [{ id: "l1", cls: "qualified" }],
    total: 1,
    view: {},
    canFind: true,
    canExport: true,
    busy: false,
    whyNot: null,
    onClear: () => {},
    onSelectAllMatching: () => {},
    allMatching: false,
    onCopyEmails: () => {},
    onContacted: () => {},
    onNotAFit: () => {},
    whyOpen: false,
    onWhyOpen: () => {},
    exportHref: null,
    write,
  });
  const ids = all(
    bar,
    (n) => typeof n.props?.["data-testid"] === "string" && n.props["data-testid"].startsWith("leads-bulk-"),
  ).map((n) => n.props["data-testid"]);
  assert.equal(ids[ids.indexOf("leads-bulk-copy") + 1], "leads-bulk-write");
});
