/**
 * A business's own client list, read in the browser: RFC 4180 cells (quotes, escaped quotes, commas inside quotes,
 * CRLF), a BOM, a header found by its words or by what its values are, and rows normalised to the one phone rule and
 * the one email rule. No dependency: the repository hand-rolls file formats on purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, matchColumns, importRowsOf, importCounts } from "@chanlytics/contracts";

const BOOKSY = [
  String.fromCharCode(0xfeff) + "First name,Last name,Mobile,E-mail,Visits",
  'Ana,"Ruiz, Jr.",(646) 555-0101,Ana@Example.com,12',
  "Dee,Lopez,646-555-0102,,3",
  'Eli,"O""Neil",,eli@example.com,1',
  ",,,,",
  "Fay,Kim,555-0104,not-an-address,0",
].join("\r\n");

test("cells are read as a spreadsheet writes them: quotes, escaped quotes, a comma inside quotes, CRLF, a BOM, blank lines dropped", () => {
  const rows = parseCsv(BOOKSY);
  assert.deepEqual(rows[0], ["First name", "Last name", "Mobile", "E-mail", "Visits"]);
  assert.deepEqual(rows[1], ["Ana", "Ruiz, Jr.", "(646) 555-0101", "Ana@Example.com", "12"]);
  assert.deepEqual(rows[3], ["Eli", 'O"Neil', "", "eli@example.com", "1"]);
  assert.equal(rows.length, 5, "the all-blank line is not a row");
  assert.deepEqual(
    parseCsv("name;mobile\nAna;6465550101"),
    [
      ["name", "mobile"],
      ["Ana", "6465550101"],
    ],
    "a semicolon file reads too",
  );
});

test("a quote after the start of a cell is a character, not a quoted field (5'4\" in a notes column does not swallow the rest of the file)", () => {
  assert.deepEqual(parseCsv("a,5'4\"\nb,c"), [
    ["a", "5'4\""],
    ["b", "c"],
  ]);
});

test("a newline embedded in a quoted cell still advances the file's line count for the row that follows", () => {
  assert.deepEqual(
    parseCsv('a\n"x\ny"\nb').map((r) => r.line),
    [1, 2, 4],
  );
});

test("the columns are found by the header's words, a last name joins the first", () => {
  const { columns, header } = matchColumns(parseCsv(BOOKSY));
  assert.equal(header, true);
  assert.deepEqual(columns, { name: 0, last: 1, phone: 2, email: 3 });
});

test("without a header the columns are found by what the values are", () => {
  const rows = parseCsv("Ana Ruiz,+16465550101,ana@example.com\nDee Lopez,+16465550102,\nEli,,eli@example.com");
  const { columns, header } = matchColumns(rows);
  assert.equal(header, false);
  assert.deepEqual(columns, { name: 0, last: null, phone: 1, email: 2 });
});

test("a phone column is judged by its cells' shape, not normalizePhone's loose floor: a date does not steal it, and an unrecognised phone header is still found by its values", () => {
  const rows = parseCsv(
    [
      "Name,Birthday,Phone #,Email",
      "Ana,05/12/1990,(646) 555-0101,ana@example.com",
      "Fay,05/12/1990,646-555-0104,",
    ].join("\n"),
  );
  const { columns, header } = matchColumns(rows);
  assert.equal(header, true);
  assert.equal(columns.phone, 2);
  const people = importRowsOf(rows, columns, header);
  assert.equal(people[0].phone, "+16465550101");
  assert.equal(people[1].phone, "+16465550104");
  assert.notEqual(people[0].phone, people[1].phone, "two different people are not given the same fabricated number");

  const headerless = matchColumns(parseCsv("2024-01-05,6465550101\n2024-02-10,6465550102"));
  assert.equal(headerless.header, false);
  assert.equal(headerless.columns.phone, 1);
});

test("rows are normalised to the one phone and the one email rule, and counted", () => {
  const rows = parseCsv(BOOKSY);
  const { columns, header } = matchColumns(rows);
  const people = importRowsOf(rows, columns, header);
  assert.deepEqual(people, [
    { line: 2, name: "Ana Ruiz, Jr.", phone: "+16465550101", email: "ana@example.com" },
    { line: 3, name: "Dee Lopez", phone: "+16465550102", email: null },
    { line: 4, name: 'Eli O"Neil', phone: null, email: "eli@example.com" },
    { line: 6, name: "Fay Kim", phone: null, email: null },
  ]);
  assert.deepEqual(importCounts(people), { rows: 4, withPhone: 2, withEmail: 2, unreadable: 1 });
});

test("a column the file lacks is null and the rows still read", () => {
  const rows = parseCsv("Name,Email\nAna,ana@example.com");
  const { columns } = matchColumns(rows);
  assert.deepEqual(columns, { name: 0, last: null, phone: null, email: 1 });
  assert.deepEqual(importRowsOf(rows, columns, true), [
    { line: 2, name: "Ana", phone: null, email: "ana@example.com" },
  ]);
});
