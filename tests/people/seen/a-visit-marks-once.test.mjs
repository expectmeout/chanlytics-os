/**
 * A visit to a person's page marks them looked at once (decision 0052's call 9: on every open), and again only when they
 * say something new while the page is open (surfaces/seen.ts owesVisitMark; people/person/person-real.tsx).
 *
 * It marked them every two seconds for as long as the page was on screen. The mark's own answer moves the row's stamp
 * (`marked_at`), the page's effect ran again for that, and after its dwell it marked again: each mark a write, and behind
 * each the whole person read again, about thirty database calls. Production's gateway log, 24 Nov 2026: 558 marks in
 * nineteen minutes from one tab left on a person; on the nightly's own stack a person's page asked the database 1,595
 * times in its first minute where the other pages asked two hundred.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact } from "../../_stub-react.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

bridgeHolds({ parts: { surfaceState: () => "live" } });
installStubReact({});
const { owesVisitMark } = await import("../../../apps/dashboard/src/surfaces/seen.ts");

const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GRACE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOON = Date.parse("2026-11-24T17:00:00Z");

test("a visit owes its mark once: none made yet, or made for somebody else", () => {
  assert.equal(owesVisitMark(null, ADA, NOON), true, "the page has just opened on her");
  assert.equal(owesVisitMark({ id: GRACE, upTo: NOON }, ADA, NOON), true, "a move to another person is another visit");
  assert.equal(owesVisitMark({ id: ADA, upTo: 0 }, ADA, 0), false, "someone never heard from is marked once too");
});

test("the mark's own answer coming back owes nothing, however often the row is drawn again", () => {
  const marked = { id: ADA, upTo: NOON };
  // What the page's effect is run with again: the same person, having said nothing since. The row's own stamp of the mark
  // (markAtMs) and whether it reads as new are not asked: they are what the mark itself moves.
  for (let draw = 0; draw < 558; draw += 1) assert.equal(owesVisitMark(marked, ADA, NOON), false);
  assert.equal(owesVisitMark(marked, ADA, NOON - 60_000), false, "nor a row that says less than the mark saw");
});

test("something new from them while the page is open is marked: it is read as it lands", () => {
  const marked = { id: ADA, upTo: NOON };
  assert.equal(owesVisitMark(marked, ADA, NOON + 1), true);
  assert.equal(owesVisitMark({ id: ADA, upTo: NOON + 1 }, ADA, NOON + 1), false, "and that mark is made once too");
});
