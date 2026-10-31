/**
 * How many cancellations came (decision 0082, packages/db cancellationsSince), the count Ask's signals notice the times
 * nothing offered by: the service's cancels and the feed's vanished entries with a person, each appointment once, a
 * member's own cancel never; and a busy calendar's month is counted whole, its ids asked a page at a time, since one
 * `in` list carries no more than a request's address holds. Over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { cancellationsSince } = await importSrc("packages/db/src/repositories/campaigns/freed-times.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SINCE = "2026-09-01T00:00:00.000Z";
const AT = "2026-09-05T12:00:00.000Z";
const idOf = (i) => `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

/** An appointment with a person or none, and the event its change wrote. */
function world(n, over = () => ({})) {
  const appointments = [];
  const events = [];
  for (let i = 0; i < n; i += 1) {
    const o = { change: "cancelled", by: "service", contact: `c-${i}`, ...over(i) };
    appointments.push({ id: idOf(i), tenant_id: T, contact_id: o.contact });
    events.push({
      id: `e-${i}`,
      tenant_id: T,
      kind: "appointment.changed",
      subject_type: "appointment",
      subject_id: idOf(i),
      data: { change: o.change, ...(o.by ? { by: o.by } : {}), ...(o.source ? { source: o.source } : {}) },
      created_at: AT,
    });
  }
  return { appointments, events };
}

/** The database, with the length of every `in` list asked of appointments kept. */
function counted(tables) {
  const db = fakeDb(tables);
  const lists = [];
  const from = db.from.bind(db);
  db.from = (table) => {
    const q = from(table);
    if (table !== "appointments") return q;
    const asked = q.in.bind(q);
    q.in = (col, values) => {
      lists.push(values.length);
      return asked(col, values);
    };
    return q;
  };
  return { db, lists };
}

test("the service's cancels and the feed's vanished entries with a person count, each once; a member's cancel and nobody's visit do not", async () => {
  const { db } = counted(
    world(
      6,
      (i) =>
        [
          {},
          { change: "vanished", by: null, source: "calendar_feed" },
          { by: "member" },
          { contact: null },
          { change: "moved" },
          {},
        ][i],
    ),
  );
  assert.equal(await cancellationsSince(db, T, SINCE), 3);
});

test("a busy calendar's month is counted whole, its ids asked no more than two hundred at a time", async () => {
  const { db, lists } = counted(world(450));
  assert.equal(await cancellationsSince(db, T, SINCE), 450);
  assert.deepEqual(lists, [200, 200, 50]);
});
