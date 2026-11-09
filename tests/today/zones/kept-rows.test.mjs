/**
 * The rows a list acted on this visit (zones/kept.ts), kept in their place with what they came to, whatever the next read
 * says. A press inside another's work (Booked it's confirmation, a Stopped reply's own Send) holds a row once more, and its
 * refusal or its Undo lets go of that one alone: the re-check of the audit (3 Nov 2026) found the first refusal took the
 * row, its note and the words written in it off the page, where the read no longer held the row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { keptWith, keptWithout, withKept } = await importSrc("apps/dashboard/src/surfaces/today/zones/kept.ts");

const row = (id, conversationId = `c-${id}`) => ({ id, conversationId, who: id });
const READ = [row("a"), row("b"), row("c")];
const ids = (rows) => rows.map((r) => r.id);

test("a row kept stands where it stood once the read lets it go, and a thread kept under one row is drawn once", () => {
  const kept = keptWith({}, READ[1], READ);
  // The next read: b's own row gone, its thread read again as another row (a held reply stopped reads as its window).
  const next = [READ[0], READ[2], row("w-b", "c-b")];
  assert.deepEqual(ids(withKept(next, kept)), ["a", "b", "c"]);
});

test("a press inside another's work holds the row once more: its refusal lets go of that hold alone, and the row stays", () => {
  // Booked it resolved the hold: the read holds b no more, and b is on the page because it is kept.
  const read = [READ[0], READ[2]];
  let kept = keptWith({}, READ[1], READ);
  // The confirmation's Send, drawn inside Booked it's work, holds it once more; the door refuses it.
  kept = keptWith(kept, { ...READ[1], prepared: "See you at 3." }, read);
  kept = keptWithout(kept, READ[1]);
  assert.deepEqual(
    ids(withKept(read, kept)),
    ["a", "b", "c"],
    "REGRESSION: the row, its note and the words written in it went with the refusal",
  );
  // Booked it's own hold let go (undone): the row is as the read says.
  kept = keptWithout(kept, READ[1]);
  assert.deepEqual(ids(withKept(read, kept)), ["a", "c"]);
});

test("a row let go that was never kept changes nothing", () => {
  const kept = keptWith({}, READ[0], READ);
  assert.equal(keptWithout(kept, READ[2]), kept);
});
