/**
 * A person's page before 00598 (decision 0119): the build may go live before the migration that makes sequence_occasions,
 * so the read of the sequences someone is in takes a table the database does not have yet as nobody waiting, and still
 * says the places they hold. Any other failure of that read is still raised. Over the fake database, which answers an
 * unknown table as PostgREST does (PGRST205).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

const { listSequencesOfPerson } = await importSrc("packages/db/src/repositories/campaigns/sequences/reads.ts");

const T = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const SEQUENCE = "33333333-3333-4333-8333-333333333333";
const NEXT = "2026-11-12T15:00:00.000Z";

const world = () => ({
  sequences: [{ id: SEQUENCE, tenant_id: T, name: "Back after a visit", starts: "moment", state: "on" }],
  sequence_enrollments: [
    { tenant_id: T, sequence_id: SEQUENCE, contact_id: PERSON, place: 2, next_at: NEXT, state: "in" },
  ],
});

test("before 00598, a person's page still says the sequences they are in, and that nothing of an occasion waits", async () => {
  const db = fakeDb(world(), {
    "sequence_occasions.select": {
      code: "PGRST205",
      message: "Could not find the table 'public.sequence_occasions' in the schema cache",
    },
  });
  const rows = await listSequencesOfPerson(db, T, PERSON);
  assert.deepEqual(
    rows.map((r) => [r.id, r.name, r.place, r.next_at, r.timed ?? false]),
    [[SEQUENCE, "Back after a visit", 2, NEXT, false]],
  );
});

test("any other failure of the occasions' read is still raised", async () => {
  const db = fakeDb(world(), {
    "sequence_occasions.select": { code: "57014", message: "canceling statement due to statement timeout" },
  });
  await assert.rejects(() => listSequencesOfPerson(db, T, PERSON), /occasions: what waits/);
});
