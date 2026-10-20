/**
 * Import people, drawn on the stub React and run: the pasted rows read, the columns matched (the file's own word under
 * each head), the counts said on the sheet's one line before anything is written, the door called in parts of fifty
 * under one import id, a refusal said on that line, a stop said at the file's own line with the rest one press away, and
 * the summary in the owner's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, textOf, press } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact();
const W = globalThis.window;
// The sheet, its plan and the kit's own RecordSheet and FieldError it draws: the TSX over the stub React
// (installLegacyReact has put the stub's hooks on the react module), the door the real verb over a recorded fake wire.
const { PeopleAddSheet } = await importSrc("apps/dashboard/src/surfaces/people/import/import-sheet.tsx");
const { plImportPlan, plImportReadWords, plImportColumnWords, plImportHeads } = await importSrc(
  "apps/dashboard/src/surfaces/people/import/plan.ts",
);
assert.equal(typeof PeopleAddSheet, "function");
/** Add people opened on its list, as the owner sees it: the import (its first way in is one person). */
const Sheet = (props) => PeopleAddSheet({ onAdded() {}, canImport: true, way: "list", ...props });

// The sheet's one Save, as the kit's foot names it (RecordSheet id "people-add").
const SAVE = "rec-sheet-save-people-add";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/**
 * The wire the import goes through: importPeople's request over the bridge's client, answered by `answer(body, n)`
 * (the part's body and its number from 1) with a Response. Each part the door was sent is kept in `parts`.
 */
const importWire = (answer) => {
  const parts = [];
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    assert.equal(u.pathname, "/api/v1/contacts/import", `only the import door is asked: ${u.pathname}`);
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    parts.push(body);
    return answer(body, parts.length);
  };
  return parts;
};
/**
 * The sheet drawn again until `ready(tree)` holds, and that tree. The Save's button does not hand back the run it starts
 * (the kit's foot calls it), and the wire answers on its own clock: what the page shows is waited for, by condition.
 */
const drawnWhen = async (draw, ready, what) => {
  for (let i = 0; i < 1000; i += 1) {
    const tree = again(draw);
    if (ready(tree)) return tree;
    await new Promise((r) => setTimeout(r, 10));
  }
  return assert.fail(`the sheet never showed ${what}`);
};
const went = (over) => ({ added: 0, existed: 0, emails_set: 0, skipped: [], failed: [], stopped: false, ...over });

// A header, n people with a 555-01xx number and an example.com address each, and one row with neither.
const csv = (n) =>
  [
    "Name,Mobile,Email",
    ...Array.from({ length: n }, (_, i) => `P${i},+1646555${String(100 + i).padStart(4, "0")},p${i}@example.com`),
    "Nobody,,",
  ].join("\n");

/** The sheet drawn fresh, its rows pasted and read: the tree with the preview and the Save on it. */
const readSixty = (props) => {
  fresh();
  const draw = () => Sheet(props);
  let tree = again(draw);
  byTestId(tree, "import-paste").props.onChange({ target: { value: csv(60) } });
  tree = again(draw);
  press(byTestId(tree, "import-read"));
  return { draw, tree: again(draw) };
};

test("pasted rows are read and counted before anything is written; the door is called in parts of fifty under one import id; the summary says what happened", async () => {
  const parts = importWire((body) =>
    json(200, { ok: true, data: went({ added: body.rows.length - 1, existed: 1, emails_set: body.rows.length }) }),
  );
  const toasts = [];
  const props = { onClose() {}, flash: (t) => toasts.push(t) };
  fresh();
  const draw = () => Sheet(props);
  let tree = again(draw);
  // The foot holds its shape before a file is read: Import stands, and pressing it writes nothing.
  assert.equal(textOf(byTestId(tree, SAVE)), "Import");
  press(byTestId(tree, SAVE));
  assert.equal(parts.length, 0, "an Import with nothing read sends nothing");
  assert.equal(byTestId(tree, "import-preview"), null, "and nothing to preview");
  byTestId(tree, "import-paste").props.onChange({ target: { value: csv(60) } });
  tree = again(draw);
  press(byTestId(tree, "import-read"));
  tree = again(draw);
  assert.equal(parts.length, 0, "reading the rows writes nothing");
  assert.equal(textOf(byTestId(tree, "import-counts")), "60 to add · 1 with no number or email");
  const chosen = textOf(byTestId(tree, "import-chosen"));
  for (const words of ["Pasted rows", "61 rows", "Change"])
    assert.ok(chosen.includes(words), `"${chosen}" says ${words}`);
  const preview = textOf(byTestId(tree, "import-preview"));
  for (const words of ["Name", "Mobile", "Email", "and 55 more"]) {
    assert.ok(preview.includes(words), `"${preview}" says ${words}`);
  }
  assert.equal(byTestId(tree, "import-columns"), null, "a file with a header says its columns under the heads");
  assert.equal(textOf(byTestId(tree, SAVE)), "Import 60 people");

  press(byTestId(tree, SAVE));
  tree = await drawnWhen(draw, (t) => byTestId(t, "import-summary"), "the summary");
  assert.equal(parts.length, 2, "sixty readable rows are two parts");
  assert.deepEqual(
    parts.map((p) => p.rows.length),
    [50, 10],
  );
  assert.equal(parts[0].import_id, parts[1].import_id, "one import id for the whole file");
  assert.match(parts[0].import_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(parts[0].rows[0], { name: "P0", phone: "+16465550100", email: "p0@example.com" });
  assert.deepEqual(parts[1].rows[9], { name: "P59", phone: "+16465550159", email: "p59@example.com" });
  assert.ok(!parts.some((p) => p.rows.some((r) => r.name === "Nobody")), "the row with neither never goes");

  const summary = textOf(byTestId(tree, "import-summary"));
  for (const words of ["58 people added", "2 already here", "60 emails added", "1 skipped"]) {
    assert.ok(summary.includes(words), `"${summary}" says ${words}`);
  }
  assert.equal(byTestId(tree, "import-failed"), null, "nothing failed");
  assert.ok(
    textOf(byTestId(tree, "import-skipped")).includes("Line 62: No number and no address."),
    "the file's own line",
  );
  assert.equal(byTestId(tree, SAVE), null, "done: nothing left to save");
  assert.equal(byTestId(tree, "import-preview"), null, "the preview has gone with it");
  assert.equal(byTestId(tree, "import-error"), null);
  assert.equal(byTestId(tree, "import-done").props.onClick, props.onClose, "Done is the sheet's Close");

  // What was written is said to the owner (the flash below) and in the summary; the page re-reads People itself.
  assert.equal(toasts.length, 1);
  assert.ok(textOf(toasts[0].msg).includes("58 new people, 2 already here"), textOf(toasts[0].msg));
});

test("a part the door refuses stops the import and says so on the sheet's line; nothing after it is sent", async () => {
  const asked = importWire(() =>
    json(403, { ok: false, error: { code: "forbidden", message: "Only the owner can import people." } }),
  );
  const toasts = [];
  let { draw, tree } = readSixty({ onClose() {}, flash: (t) => toasts.push(t) });
  press(byTestId(tree, SAVE));
  tree = await drawnWhen(draw, (t) => byTestId(t, "import-error"), "the refusal");
  assert.equal(asked.length, 1);
  assert.ok(textOf(byTestId(tree, "import-error")).includes("Only the owner can import people."));
  // Nothing went: no summary, no toast, and the Save stays for another try over the same preview.
  assert.equal(byTestId(tree, "import-summary"), null);
  assert.equal(toasts.length, 0);
  assert.equal(textOf(byTestId(tree, SAVE)), "Import 60 people");
  assert.ok(byTestId(tree, "import-preview"));
});

test("a part the door stops mid-way ends the import at the file's own line; the rest is one press away and goes on from there", async () => {
  const parts = importWire((_body, n) =>
    n === 1
      ? json(200, { ok: true, data: went({ added: 49, existed: 1, emails_set: 50 }) })
      : n === 2
        ? // The door's lines are counted within the part: its first row is the file's line 52, its third line 54.
          json(200, {
            ok: true,
            data: went({
              added: 2,
              emails_set: 2,
              skipped: [{ line: 1, reason: "Not a number we can text." }],
              failed: [{ line: 3, message: "The people table is not taking writes right now." }],
              stopped: true,
            }),
          })
        : json(200, { ok: true, data: went({ added: 8, emails_set: 8 }) }),
  );
  let { draw, tree } = readSixty({ onClose() {}, flash() {} });
  press(byTestId(tree, SAVE));
  tree = await drawnWhen(draw, (t) => byTestId(t, "import-summary"), "the summary");
  assert.equal(parts.length, 2, "nothing after the stopped part is sent");
  assert.equal(
    textOf(byTestId(tree, "import-error")),
    "Stopped at line 54: The people table is not taking writes right now.",
  );
  const summary = textOf(byTestId(tree, "import-summary"));
  for (const words of ["51 people added", "1 already here", "52 emails added", "8 not tried yet"]) {
    assert.ok(summary.includes(words), `"${summary}" says ${words}`);
  }
  const skipped = textOf(byTestId(tree, "import-skipped"));
  assert.ok(
    skipped.indexOf("Line 52: Not a number we can text.") < skipped.indexOf("Line 62: No number and no address."),
    skipped,
  );
  assert.ok(
    textOf(byTestId(tree, "import-failed")).includes("Line 54: The people table is not taking writes right now."),
  );
  // The rest, from the row it stopped at (P52, the file's line 54), under the same import id.
  assert.equal(textOf(byTestId(tree, SAVE)), "Try the other 8");
  press(byTestId(tree, SAVE));
  tree = await drawnWhen(
    draw,
    (t) => !!byTestId(t, "import-summary") && textOf(byTestId(t, "import-summary")).includes("59 people added"),
    "the import finished",
  );
  assert.equal(parts.length, 3);
  assert.equal(parts[2].import_id, parts[0].import_id, "one import id for the whole file");
  assert.equal(parts[2].rows[0].name, "P52");
  assert.equal(parts[2].rows.length, 8);
  const all = textOf(byTestId(tree, "import-summary"));
  for (const words of ["59 people added", "1 already here", "60 emails added", "2 skipped"]) {
    assert.ok(all.includes(words), `"${all}" says ${words}`);
  }
  assert.equal(byTestId(tree, SAVE), null, "done: nothing left to try");
});

test("a part refused after others went through ends the import at the line it began; the summary says what went through", async () => {
  // The server's own catch-all on the second part: the client says it in the owner's words (contracts refusalOf).
  const parts = importWire((_body, n) =>
    n === 1
      ? json(200, { ok: true, data: went({ added: 49, existed: 1, emails_set: 50 }) })
      : json(500, { ok: false, error: { code: "internal", message: "Something went wrong." } }),
  );
  let { draw, tree } = readSixty({ onClose() {}, flash() {} });
  press(byTestId(tree, SAVE));
  tree = await drawnWhen(draw, (t) => byTestId(t, "import-summary"), "the summary");
  assert.equal(parts.length, 2, "nothing after the refused part is sent");
  // The second part began at P50, which is the file's line 52 (the header is line 1, P0 line 2).
  assert.equal(
    textOf(byTestId(tree, "import-error")),
    "Stopped at line 52: Chanlytics hit a problem and couldn't confirm this — check whether it went through before trying again.",
  );
  const summary = textOf(byTestId(tree, "import-summary"));
  for (const words of ["49 people added", "1 already here", "50 emails added", "10 not tried yet"]) {
    assert.ok(summary.includes(words), `"${summary}" says ${words}`);
  }
  assert.equal(byTestId(tree, "import-failed"), null, summary);
  assert.equal(textOf(byTestId(tree, SAVE)), "Try the other 10", "the rest from the line it stopped at");
  assert.equal(byTestId(tree, "import-preview"), null);
});

test("rows with no header are told apart by what is in them; a header's own words stand under each head", () => {
  const plan = plImportPlan("Ana Ruiz,(646) 555-0101\n");
  assert.equal(plan.header, false);
  assert.deepEqual(
    plan.people.map((p) => [p.line, p.name, p.phone, p.email]),
    [[1, "Ana Ruiz", "+16465550101", null]],
  );
  assert.equal(plImportReadWords(plan.counts), "1 to add");
  assert.equal(plImportColumnWords(plan), "No header row: the columns were told apart by what is in them.");
  assert.deepEqual(plImportHeads(plan), ["Name", "Mobile", "Email"]);
  const headed = plImportPlan("Client,Correo\nAna,ana@example.com\nNobody\n");
  assert.equal(plImportColumnWords(headed), "Columns: name “Client”, mobile not found, email “Correo”.");
  assert.deepEqual(plImportHeads(headed), [
    { label: "Name", from: "Client" },
    { label: "Mobile", from: null },
    { label: "Email", from: "Correo" },
  ]);
  assert.equal(plImportReadWords(headed.counts), "1 to add · 1 with no number or email");
  assert.equal(plImportReadWords(plImportPlan("").counts), "0 to add");
});
