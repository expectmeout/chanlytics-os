/**
 * A booking tool's client file (decision 0073, R22; contracts imports/csv.ts): beyond the name, the number and the
 * address, the last visit, the visits counted, the birthday and the notes, each found by its header alone and only where
 * the reader asks for them; a date read as the file writes it, never guessed; the tool said as the owner writes it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileDateOf, importRowsOf, matchColumns, parseCsv, viaWords } from "@chanlytics/contracts";

test("a date as a file writes one: ISO, a US month/day/year, a month in words, and month and day alone -- never a guess", () => {
  const cases = [
    ["2026-04-23", "2026-04-23"],
    ["2026-04-23T10:30:00Z", "2026-04-23"],
    ["4/23/2026", "2026-04-23"],
    ["04-23-26", "2026-04-23"],
    ["4/23/75", "1975-04-23"],
    ["05/06", "--05-06"],
    ["Apr 23, 2026", "2026-04-23"],
    ["April 23", "--04-23"],
    ["23 Apr 2026", "2026-04-23"],
    ["Sept. 9", "--09-09"],
    ["2/29/2024", "2024-02-29"],
    ["2/29", "--02-29"],
  ];
  for (const [raw, day] of cases) assert.equal(fileDateOf(raw), day, raw);
  for (const raw of ["2/29/2026", "13/01/2026", "31/12/2026", "Smarch 3", "soon", "", "2026"]) {
    assert.equal(fileDateOf(raw), null, `${raw}: not a real day, or not one we read`);
  }
});

test("a client file's columns beyond who the person is are found by their header, only where the reader asks for them", () => {
  const rows = parseCsv(
    [
      "First Name,Last Name,Mobile,Email,Last Visit,Total Visits,Birthday,Client Notes",
      "Ana,Ruiz,(305) 555-0101,ana@example.com,4/23/2026,12,May 6,Prefers mornings",
      "Ben,Ode,305-555-0102,,,1,1990-02-14,",
    ].join("\n"),
  );
  const plain = matchColumns(rows);
  assert.deepEqual(
    plain.columns,
    { name: 0, last: 1, phone: 2, email: 3 },
    "People's own import asks for none of them",
  );
  const { columns, header } = matchColumns(rows, { facts: true });
  assert.equal(header, true);
  assert.deepEqual(columns, { name: 0, last: 1, phone: 2, email: 3, lastVisit: 4, visits: 5, birthday: 6, notes: 7 });
  const got = importRowsOf(rows, columns, header);
  assert.deepEqual(got[0].facts, {
    last_visit: "2026-04-23",
    visits: 12,
    birthday: "--05-06",
    notes: "Prefers mornings",
  });
  assert.deepEqual(got[1].facts, { visits: 1, birthday: "1990-02-14" });
  assert.equal(got[1].email, null);
});

test("a last visit needs its year, visits are a count, and notes are cut whole at the column's 600", () => {
  const rows = [
    ["Name", "Phone", "Last appointment", "Visits", "Notes"],
    ["Cy", "+13055550103", "Apr 23", "1,204", `${"x".repeat(599)}😀😀`],
    ["Di", "+13055550104", "yesterday", "many", "  "],
  ];
  const { columns, header } = matchColumns(rows, { facts: true });
  const [cy, di] = importRowsOf(rows, columns, header);
  assert.equal(cy.facts.last_visit, undefined, "a day and a month alone could be any year's");
  assert.equal(cy.facts.visits, 1204);
  assert.equal(Array.from(cy.facts.notes).length, 600);
  assert.ok(cy.facts.notes.endsWith("😀"), "cut at a code point, never mid-emoji");
  assert.equal(di.facts, undefined, "nothing beyond who they are");
});

test("the tool a row came from, as the owner writes it", () => {
  assert.deepEqual(["vagaro", "microsoft", "link", "mindbody", null].map(viaWords), [
    "Vagaro",
    "Outlook",
    "your calendar link",
    "Mindbody",
    null,
  ]);
});
